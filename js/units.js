// units.js – Einheiten erkennen, umrechnen und Mengen lesbar formatieren

/** Kanonische Einheit → bekannte Schreibweisen (kleingeschrieben, ohne Schlusspunkt) */
const UNIT_ALIASES = {
  g: ['g', 'gr', 'gramm', 'gram', 'grams'],
  kg: ['kg', 'kilo', 'kilogramm'],
  ml: ['ml', 'milliliter'],
  cl: ['cl'],
  dl: ['dl'],
  l: ['l', 'liter', 'litre', 'lt'],
  EL: ['el', 'essl', 'esslöffel', 'eßlöffel', 'tbsp', 'tablespoon', 'tablespoons', 'cucharada', 'cucharadas'],
  TL: ['tl', 'teel', 'teelöffel', 'tsp', 'teaspoon', 'teaspoons', 'cucharadita', 'cucharaditas'],
  Prise: ['prise', 'prisen', 'pinch'],
  Stk: ['stk', 'stück', 'stueck', 'st', 'pc', 'pcs'],
  Zehe: ['zehe', 'zehen', 'clove', 'cloves'],
  Dose: ['dose', 'dosen', 'can', 'cans', 'lata', 'latas'],
  Glas: ['glas', 'gläser', 'jar'],
  Bund: ['bund', 'bunch'],
  Pck: ['pck', 'pkg', 'packung', 'packungen', 'päckchen', 'pack', 'tüte', 'beutel'],
  Scheibe: ['scheibe', 'scheiben', 'slice', 'slices'],
  Blatt: ['blatt', 'blätter'],
  Becher: ['becher'],
  Tasse: ['tasse', 'tassen', 'cup', 'cups'],
  Handvoll: ['handvoll'],
  Zweig: ['zweig', 'zweige', 'sprig', 'sprigs'],
  Msp: ['msp', 'messerspitze'],
};

/** Alle kanonischen Einheiten (z. B. für die Auswahl im Formular) */
export const UNITS = Object.keys(UNIT_ALIASES);

const ALIAS_TO_UNIT = new Map();
for (const [unit, aliases] of Object.entries(UNIT_ALIASES)) {
  ALIAS_TO_UNIT.set(unit.toLowerCase(), unit);
  aliases.forEach((a) => ALIAS_TO_UNIT.set(a, unit));
}

/**
 * Schreibweise → kanonische Einheit.
 * Gibt '' für leere Eingabe und null für unbekannte Einheiten zurück.
 */
export function normalizeUnit(raw) {
  if (!raw || !raw.trim()) return '';
  return ALIAS_TO_UNIT.get(raw.trim().toLowerCase().replace(/\.$/, '')) || null;
}

/** Umrechnung auf Basiseinheiten (damit sich 1 kg + 300 g addieren lassen) */
const TO_BASE = { kg: ['g', 1000], l: ['ml', 1000], dl: ['ml', 100], cl: ['ml', 10] };

export function toBase(amount, unit) {
  const conv = TO_BASE[unit];
  if (!conv || amount == null) return { amount, unit };
  return { amount: amount * conv[1], unit: conv[0] };
}

const UNICODE_FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

/**
 * Text → Zahl. Versteht "1,5", "1.5", "1/2", "1 1/2", "½", "1½", "2-3" und "2 bis 3".
 * Bei Bereichen wird der größere Wert genommen (lieber etwas mehr einkaufen).
 */
export function parseAmount(input) {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  let s = String(input).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/[½¼¾⅓⅔⅛]/g, (m) => ` ${UNICODE_FRACTIONS[m]} `).trim();

  const range = s.split(/\s*(?:-|–|bis)\s*/);
  if (range.length === 2 && range[0] && range[1]) {
    const a = parseAmount(range[0]);
    const b = parseAmount(range[1]);
    return a != null && b != null ? Math.max(a, b) : (a ?? b);
  }

  let total = 0;
  let found = false;
  for (let part of s.split(/\s+/)) {
    let v;
    const frac = part.match(/^(\d+)\/(\d+)$/);
    if (frac) v = Number(frac[1]) / Number(frac[2]);
    else {
      if (/^\d{1,3}(\.\d{3})+$/.test(part)) part = part.replace(/\./g, ''); // "1.000" = tausend
      v = Number(part.replace(',', '.'));
    }
    if (!Number.isFinite(v)) return null;
    total += v;
    found = true;
  }
  return found ? total : null;
}

const de = (n, digits = 2) => n.toLocaleString('de-DE', { maximumFractionDigits: digits, useGrouping: false });

const FRACTION_SYMBOLS = [[0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']];

/**
 * Zahl → lesbarer Text, passend zur Einheit:
 *  g/ml werden auf sinnvolle Schritte gerundet, Stück/Löffel als Brüche (½, ¾).
 */
export function formatNumber(n, unit = '') {
  if (n == null || !Number.isFinite(n)) return '';
  if (unit === 'g' || unit === 'ml') {
    if (n >= 100) return de(Math.round(n / 5) * 5);
    if (n >= 10) return de(Math.round(n));
    return de(Math.round(n * 10) / 10, 1);
  }
  if (unit === 'kg' || unit === 'l') return de(Math.round(n * 100) / 100);
  if (n >= 10) return de(Math.round(n));

  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac < 0.07) return whole > 0 ? String(whole) : de(n);
  if (frac > 0.93) return String(whole + 1);
  for (const [value, sym] of FRACTION_SYMBOLS) {
    if (Math.abs(frac - value) < 0.06) return (whole > 0 ? whole : '') + sym;
  }
  return de(Math.round(n * 10) / 10, 1);
}

/** Zahl → Text für Eingabefelder ("1,5" statt "½", damit man sie bearbeiten kann) */
export function formatAmountInput(n) {
  return n == null ? '' : de(n);
}

const PLURALS = {
  Zehe: 'Zehen', Dose: 'Dosen', Prise: 'Prisen', Scheibe: 'Scheiben', Tasse: 'Tassen',
  Zweig: 'Zweige', Blatt: 'Blätter', Glas: 'Gläser',
};

/**
 * Menge + Einheit → Anzeige, z. B. (1500, 'g') → "1,5 kg", (2, 'Zehe') → "2 Zehen".
 * "Stk" wird weggelassen ("2 Zwiebeln" liest sich besser als "2 Stk Zwiebeln").
 */
export function formatQty(amount, unit = '') {
  if (amount == null) return '';
  let { amount: a, unit: u } = toBase(amount, unit);
  if (u === 'g' && a >= 1000) { a /= 1000; u = 'kg'; }
  else if (u === 'ml' && a >= 1000) { a /= 1000; u = 'l'; }
  const num = formatNumber(a, u);
  if (!u || u === 'Stk') return num;
  return `${num} ${a > 1 && PLURALS[u] ? PLURALS[u] : u}`;
}
