// shopping.js – Einkaufsliste: aus dem Plan berechnen, zusammenfassen, abhaken, teilen
//
// Die Liste selbst wird NICHT gespeichert, sondern bei jedem Öffnen aus den kommenden
// Kochtagen berechnet – so ist sie immer aktuell, wenn sich der Plan ändert.
// Gespeichert wird nur der Zustand drumherum:
//   Store "shopping": { key: "g:zwiebel", checked }                  – Häkchen für berechnete Posten
//                     { key: "c_…", custom: true, name, amount, unit, aisle, checked } – eigene Posten
//   Store "pantry":   { name: "salz", label: "Salz" }                – Vorrat ("habe ich schon"), wird ausgeblendet
//   meta "aisleOverrides": { "g:zwiebel": "obst" }                    – manuell geänderte Bereiche

import { getAll, put, del, getMeta, setMeta, uid, markChanged } from './db.js';
import { AISLES, guessAisle, fold } from './aisles.js';
import { toBase, formatQty } from './units.js';
import { parseIngredientLine } from './parser.js';
import { upcomingDays, shortDate } from './plan.js';

/* ---------- Zusammenfassen gleicher Zutaten ---------- */

/** Einfache deutsche Plural-Regeln – nur für den Vergleichsschlüssel, nie für die Anzeige */
function singular(w) {
  if (w === 'eier') return 'ei';
  if (w.length > 4 && /eln$|ern$/.test(w)) return w.slice(0, -1);      // Zwiebeln, Kartoffeln
  if (w.length > 4 && /en$/.test(w)) return w.slice(0, -1);             // Tomaten, Bohnen, Garnelen
  if (w.length > 4 && /[aiou]s$/.test(w)) return w.slice(0, -1);       // Avocados
  return w;
}

/** "Zwiebeln (rot)" → "zwiebel", "Garnelen geschält (TK)" → "garnele geschalt" */
export function nameKey(name) {
  return fold(name)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(' ');
}

// Einheiten, die man nur ganz kaufen kann → aufrunden
const WHOLE_UNITS = new Set(['Stk', 'Bund', 'Dose', 'Glas', 'Pck', 'Becher', 'Zehe']);

/** Menge auf eine gemeinsame Basiseinheit bringen: kg→g, l→ml, EL→TL, leer→Stk */
function baseQty(amount, unit) {
  const b = toBase(amount, unit || 'Stk');
  if (b.unit === 'EL') return { amount: b.amount * 3, unit: 'TL' };
  return b;
}

/** { g: 1300, Zehe: 3 } → "1,3 kg + 3 Zehen" */
function formatQuantities(qty) {
  return Object.entries(qty).map(([unit, amount]) => {
    // Löffel: in EL anzeigen, wenn es glatt aufgeht (6 TL → 2 EL), sonst TL (4 TL statt 1⅓ EL)
    const el = amount / 3;
    if (unit === 'TL' && el >= 1 && Math.abs(el * 2 - Math.round(el * 2)) < 0.05) return formatQty(el, 'EL');
    if (WHOLE_UNITS.has(unit)) return formatQty(Math.ceil(amount - 0.05), unit === 'Stk' ? '' : unit);
    return formatQty(amount, unit);
  }).join(' + ');
}

/* ---------- Liste berechnen ---------- */

/**
 * Liefert { items, days }. Jeder Posten:
 * { key, name, aisle, qtyText, sources: [Rezepttitel], checked, pantry, custom }
 */
export async function buildList() {
  const [days, recipes, states, pantryRows, overrides] = await Promise.all([
    upcomingDays(), getAll('recipes'), getAll('shopping'), getAll('pantry'), getMeta('aisleOverrides', {}),
  ]);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const stateByKey = new Map(states.map((s) => [s.key, s]));
  const pantry = new Set(pantryRows.map((p) => p.name));
  const merged = new Map();

  for (const day of days) {
    for (const entry of day.entries) {
      const recipe = byId.get(entry.recipeId);
      if (!recipe) continue; // Rezept wurde gelöscht
      const factor = entry.servings / recipe.servings;
      for (const ing of recipe.ingredients) {
        const nk = nameKey(ing.name);
        const key = `g:${nk}`;
        let item = merged.get(key);
        if (!item) {
          item = { key, nk, name: ing.name, aisle: overrides[key] || ing.aisle || guessAisle(ing.name), qty: {}, sources: new Set(), custom: false };
          merged.set(key, item);
        }
        item.sources.add(recipe.title);
        if (ing.amount == null) continue; // "Salz nach Geschmack"
        const { amount, unit } = baseQty(ing.amount * factor, ing.unit);
        item.qty[unit] = (item.qty[unit] || 0) + amount;
      }
    }
  }

  const items = [...merged.values()].map((it) => ({
    key: it.key,
    name: it.name,
    aisle: it.aisle,
    qtyText: Object.keys(it.qty).length ? formatQuantities(it.qty) : '',
    sources: [...it.sources],
    checked: !!stateByKey.get(it.key)?.checked,
    pantry: pantry.has(it.nk),
    custom: false,
  }));

  // Eigene Posten
  for (const s of states) {
    if (!s.custom) continue;
    items.push({
      key: s.key,
      name: s.name,
      aisle: s.aisle,
      qtyText: s.amount != null ? formatQty(s.amount, s.unit) : '',
      sources: [],
      checked: !!s.checked,
      pantry: false,
      custom: true,
      record: s,
    });
  }

  items.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return { items, days };
}

/** Anzahl offener Posten (für das Badge in der Tab-Leiste) */
export async function openCount() {
  const { items } = await buildList();
  return items.filter((i) => !i.checked && !i.pantry).length;
}

/** Offene Posten nach Supermarktbereich gruppiert, in fester Ladenreihenfolge */
export function groupByAisle(items) {
  return AISLES
    .map((a) => ({ ...a, items: items.filter((i) => i.aisle === a.id) }))
    .filter((g) => g.items.length);
}

/* ---------- Ändern ---------- */

export async function setChecked(item, checked) {
  if (item.custom) await put('shopping', { ...item.record, checked });
  else if (checked) await put('shopping', { key: item.key, checked: true });
  else await del('shopping', item.key);
}

/** Freitext wie "2 l Milch" → eigener Posten (Menge, Einheit und Bereich werden erkannt) */
export async function addCustom(text) {
  const ing = parseIngredientLine(text);
  await put('shopping', { key: uid('c'), custom: true, name: ing.name, amount: ing.amount, unit: ing.unit, aisle: ing.aisle, checked: false });
  await markChanged();
}

export async function removeCustom(item) {
  await del('shopping', item.key);
}

export async function setPantry(item, inPantry) {
  const name = nameKey(item.name);
  if (inPantry) await put('pantry', { name, label: item.name });
  else await del('pantry', name);
  await markChanged();
}

export async function setAisle(item, aisle) {
  if (item.custom) {
    await put('shopping', { ...item.record, aisle });
  } else {
    const overrides = await getMeta('aisleOverrides', {});
    overrides[item.key] = aisle;
    await setMeta('aisleOverrides', overrides);
  }
  await markChanged();
}

/** Alle Häkchen entfernen (eigene Posten bleiben erhalten) */
export async function resetChecks() {
  for (const s of await getAll('shopping')) {
    if (s.custom) await put('shopping', { ...s, checked: false });
    else await del('shopping', s.key);
  }
}

export async function clearCustom() {
  for (const s of await getAll('shopping')) if (s.custom) await del('shopping', s.key);
}

/* ---------- Vorrat verwalten ---------- */

export async function getPantry() {
  return (await getAll('pantry')).sort((a, b) => a.label.localeCompare(b.label, 'de'));
}

/** Freitext-Artikel zum Vorrat hinzufügen; Vergleich über nameKey ("Olivenöl" passt zu "olivenöl") */
export async function addPantryItem(label) {
  const clean = String(label).trim().slice(0, 100);
  if (!clean) return;
  await put('pantry', { name: nameKey(clean), label: clean });
  await markChanged();
}

export async function removePantryItem(name) {
  await del('pantry', name);
  await markChanged();
}

/** Beim ersten Start: Salz & Pfeffer gelten als Vorrat */
export async function seedPantry() {
  for (const label of ['Salz', 'Pfeffer']) await put('pantry', { name: nameKey(label), label });
}

/* ---------- Als Text teilen ---------- */

export function listText(items, days) {
  const open = items.filter((i) => !i.checked && !i.pantry);
  const range = days.length
    ? ` (${shortDate(days[0].id)}${days.length > 1 ? ` – ${shortDate(days[days.length - 1].id)}` : ''})`
    : '';
  const lines = [`🛒 Einkaufsliste${range}`];
  for (const group of groupByAisle(open)) {
    lines.push('', group.label);
    for (const i of group.items) lines.push(`• ${i.qtyText ? `${i.qtyText} ` : ''}${i.name}`);
  }
  return lines.join('\n');
}
