// parser.js – erkennt Titel, Zutaten und Schritte in eingefügtem Rezepttext
//
// Funktioniert mit typischen Formaten von Rezeptseiten, Notizen oder Chat-Nachrichten:
//  - mit Überschriften ("Zutaten", "Zubereitung", "Ingredients", …)  → eindeutig
//  - ohne Überschriften → Heuristik: kurze Zeilen mit Mengenangabe = Zutat, Sätze = Schritt
// Das Ergebnis füllt nur das Formular vor; der Nutzer prüft vor dem Speichern.

import { parseAmount, normalizeUnit } from './units.js';
import { guessAisle } from './aisles.js';

const FRAC = '[½¼¾⅓⅔⅛]';
const NUM = String.raw`(?:\d+\/\d+|\d+(?:[.,]\d+)?|${FRAC})`;
// Menge am Zeilenanfang: "500", "1,5", "1/2", "1 1/2", "1½", "2-3", "2 bis 3"
const AMOUNT_RE = new RegExp(String.raw`^(${NUM}(?:\s*(?:\d+\/\d+|${FRAC}))?(?:\s*(?:-|–|bis)\s*${NUM})?)\s*`);
// Menge am Zeilenende: "Hähnchenbrust, 500 g"
const TRAILING_AMOUNT_RE = new RegExp(String.raw`^(.+?)[,:]?\s+(${NUM})\s*([a-zA-ZäöüÄÖÜß]+\.?)?$`);

const ING_HEADER = /^(zutaten|ingredients|ingredientes|einkaufsliste|das brauchst du|du brauchst)\b/i;
const STEP_HEADER = /^(zubereitung|anleitung|so geht'?s|schritte|arbeitsschritte|instructions|directions|method|preparation|elaboración|preparación)\b/i;
const NOTE_HEADER = /^(tipps?|hinweise?|notizen|anmerkungen?|nährwerte|notes|tips)\b/i;
const TIME_LINE = /^(zubereitungszeit|kochzeit|backzeit|garzeit|gesamtzeit|arbeitszeit|vorbereitungszeit|zeit|dauer|total time|cook time|prep time|tiempo)\b\s*:?\s*(.*)$/i;
const SERVINGS_RE = /(\d+)\s*(portionen|portion|personen|person|pers\.?|servings|raciones)\b/i;
const SERVINGS_LINE = /^(?:portionen|personen|servings|ergibt|für)\s*:?\s*(\d+)/i;

// Dauer-Angaben in Schritten für automatische Timer: "20 Minuten", "5-7 Min.", "1 Std."
const DURATION_RE = /(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|bis)\s*(\d+(?:[.,]\d+)?))?\s*(stunden|stunde|std\.?|hours?|minuten|minutes|mins|min\.?|h)(?![a-zäöüß])/gi;

/** Aufzählungszeichen und Checkboxen am Zeilenanfang entfernen */
function stripBullet(line) {
  return line.replace(/^(?:[-*•·▪◦▢□☐✓✔–]|\[\s?[x ]?\])\s*/i, '').trim();
}

/** Nummerierung von Schritten entfernen: "1.", "2)", "Schritt 3:" */
function stripStepNumber(line) {
  return line.replace(/^(?:schritt|step|paso)?\s*\d+\s*[.):]\s*/i, '').trim();
}

/** Minuten aus einer Dauer-Angabe ("1 Std. 30 Min.", "45 Minuten") */
export function parseDuration(text) {
  let total = 0;
  let found = false;
  for (const m of String(text).matchAll(DURATION_RE)) {
    const val = parseAmount(m[2] || m[1]);
    if (val == null) continue;
    total += /^(st|h)/i.test(m[3]) ? val * 60 : val;
    found = true;
  }
  if (!found) {
    const plain = String(text).match(/^\s*(\d+)\s*$/);
    return plain ? Number(plain[1]) : null;
  }
  return Math.round(total) || null;
}

/**
 * Timer-Vorschlag für einen Schritt: die erste Dauer im Text.
 * "1 Stunde 30 Minuten" wird zusammengezählt, "2 Min. anbraten, dann 1 Std. schmoren" → 2.
 */
export function detectTimer(text) {
  const matches = [...String(text).matchAll(DURATION_RE)];
  if (!matches.length) return null;
  const toMin = (m) => {
    const v = parseAmount(m[2] || m[1]) || 0;
    return /^(st|h)/i.test(m[3]) ? v * 60 : v;
  };
  let minutes = toMin(matches[0]);
  const next = matches[1];
  const isHours = /^(st|h)/i.test(matches[0][3]);
  if (isHours && next && !/^(st|h)/i.test(next[3]) && next.index - (matches[0].index + matches[0][0].length) <= 6) {
    minutes += toMin(next); // "1 Std. 30 Min."
  }
  return Math.round(minutes) || null;
}

/** Eine Zutatenzeile → { amount, unit, name, aisle } */
export function parseIngredientLine(rawLine) {
  const line = stripBullet(rawLine);
  let amount = null;
  let unit = '';
  let name = line;

  const m = line.match(AMOUNT_RE);
  if (m) {
    amount = parseAmount(m[1]);
    let rest = line.slice(m[0].length);
    const u = rest.match(/^([a-zA-ZäöüÄÖÜß]+)\.?(?=[\s,]|$)/);
    if (u && normalizeUnit(u[1])) {
      unit = normalizeUnit(u[1]);
      rest = rest.slice(u[0].length);
    }
    name = rest.replace(/^[\s,:\-x×]+/, '');
  } else {
    const t = line.match(TRAILING_AMOUNT_RE);
    if (t && (!t[3] || normalizeUnit(t[3]))) {
      name = t[1];
      amount = parseAmount(t[2]);
      unit = t[3] ? normalizeUnit(t[3]) : '';
    }
  }
  name = name.trim() || line;
  return { amount, unit, name, aisle: guessAisle(name) };
}

/** Sieht die Zeile nach einer Zutat aus? (nur für Text ohne Überschriften) */
function looksLikeIngredient(line, stepsStarted) {
  if (/^\d+\s*[.)]\s/.test(line)) return false;          // "1. Zwiebeln schneiden" = Schritt
  if (/[.!?]$/.test(line) && line.length > 30) return false; // ganzer Satz
  if (AMOUNT_RE.test(line) && line.length <= 70) return true;
  return !stepsStarted && line.length <= 35;               // "Salz, Pfeffer"
}

/** Sehr lange Absätze in Schritte von ~2 Sätzen aufteilen */
function splitParagraph(text) {
  if (text.length < 280) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [text];
  const out = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + s).length > 220) { out.push(cur.trim()); cur = ''; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Rezepttext → { title, servings, timeMin, ingredients[], steps[], notes }
 */
export function parseRecipeText(text) {
  const result = { title: '', servings: null, timeMin: null, ingredients: [], steps: [], notes: '' };
  const lines = String(text).replace(/\r/g, '').split('\n')
    .map((l) => l.replace(/[\t ]+/g, ' ').replace(/^#+\s*/, '').replace(/^\*\*(.+)\*\*:?$/, '$1').trim());

  const hasHeaders = lines.some((l) => ING_HEADER.test(l) || STEP_HEADER.test(l));
  let mode = null; // 'ing' | 'steps' | 'notes' | null
  let stepsStarted = false;
  const notes = [];

  // "Salz, Pfeffer" / "Salz und Pfeffer" (ohne Menge) → zwei Zutaten
  const addIngredient = (line) => {
    const ing = parseIngredientLine(line);
    const parts = ing.amount == null ? ing.name.split(/\s*,\s*|\s+und\s+/).filter(Boolean) : [];
    if (parts.length > 1 && parts.every((p) => p.length <= 20)) {
      parts.forEach((p) => result.ingredients.push(parseIngredientLine(p)));
    } else {
      result.ingredients.push(ing);
    }
  };

  const addStep = (line) => {
    const clean = stripStepNumber(stripBullet(line));
    if (!clean) return;
    for (const part of splitParagraph(clean)) result.steps.push({ text: part, timerMin: detectTimer(part) });
    stepsStarted = true;
  };

  for (const line of lines) {
    if (!line) continue;

    // Abschnittsüberschriften
    if (ING_HEADER.test(line)) {
      mode = 'ing';
      const sv = line.match(SERVINGS_RE);
      if (sv) result.servings = Number(sv[1]);
      continue;
    }
    if (STEP_HEADER.test(line)) { mode = 'steps'; continue; }
    if (NOTE_HEADER.test(line) && line.length < 30) { mode = 'notes'; continue; }

    // Metadaten: Zeit und Portionen
    const time = line.match(TIME_LINE);
    if (time && line.length < 60) {
      const min = parseDuration(time[2]);
      if (min) result.timeMin = Math.max(result.timeMin || 0, min);
      continue;
    }
    if (line.length < 40 && mode !== 'steps') {
      const sv = line.match(SERVINGS_LINE) || (/^\D{0,12}\d+\s*(portionen|personen|servings)/i.test(line) && line.match(SERVINGS_RE));
      if (sv) {
        result.servings = Number(sv[1]);
        // "Für 2 Portionen · 15 Min." enthält oft auch die Zeit
        const min = parseDuration(line);
        if (min && !result.timeMin) result.timeMin = min;
        continue;
      }
    }

    // Titel: erste "normale" Zeile vor allen Abschnitten
    if (!result.title && mode == null && !AMOUNT_RE.test(line) && line.length <= 100) {
      result.title = line.replace(/^rezept\s*:\s*/i, '');
      continue;
    }

    if (mode === 'ing') {
      // Unterüberschriften wie "Für die Soße:" überspringen
      if (/:$/.test(line) && !AMOUNT_RE.test(line)) continue;
      addIngredient(line);
    } else if (mode === 'steps') {
      addStep(line);
    } else if (mode === 'notes') {
      notes.push(line);
    } else if (hasHeaders) {
      notes.push(line); // Einleitungstext vor der ersten Überschrift
    } else if (looksLikeIngredient(stripBullet(line), stepsStarted)) {
      addIngredient(line);
    } else {
      addStep(line);
    }
  }

  result.notes = notes.join('\n');
  if (!result.title) result.title = 'Neues Rezept';
  return result;
}
