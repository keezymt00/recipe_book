// fridge.js – Meal-Prep-Kühlschrank: gekochte Portionen, Haltbarkeit, "versorgt bis …"
//
// Datenmodell (Store "fridge"):
// { id, recipeId, title, portions, location: 'fridge'|'freezer', since: 'JJJJ-MM-TT', expires: 'JJJJ-MM-TT' }
// title wird kopiert, damit der Eintrag auch nach dem Löschen des Rezepts lesbar bleibt.

import { getAll, get, put, del, uid, getMeta, setMeta, markChanged } from './db.js';
import { isoDate, addDays } from './plan.js';

export const FREEZER_DAYS = 90;
export const THAWED_DAYS = 2;
const DEFAULT_FRIDGE_DAYS = 4;

/** Tage zwischen zwei Daten (b − a) */
export function daysBetween(a, b) {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 864e5);
}

/**
 * Haltbarkeit im Kühlschrank für ein Rezept: aus den Notizen ("Hält sich 3–4 Tage",
 * "hält sich gekühlt 3 Tage") – bei Bereichen der kleinere Wert –, sonst 4 Tage.
 */
export function shelfDays(recipe) {
  const m = String(recipe?.notes || '').match(/hält sich[^.]*?(\d+)(?:\s*[–-]\s*\d+)?\s*tage/i);
  const days = m ? Number(m[1]) : DEFAULT_FRIDGE_DAYS;
  return days >= 1 && days <= 14 ? days : DEFAULT_FRIDGE_DAYS;
}

/** Resttage bis zum Ablauf (0 = heute aufessen, negativ = abgelaufen) */
export const daysLeft = (entry, today = isoDate()) => daysBetween(today, entry.expires);

/** Status für die Anzeige: { text, level: 'ok'|'soon'|'today'|'expired' } */
export function freshness(entry, today = isoDate()) {
  const d = daysLeft(entry, today);
  if (d < 0) return { text: `abgelaufen seit ${-d} ${d === -1 ? 'Tag' : 'Tagen'}`, level: 'expired' };
  if (d === 0) return { text: 'heute aufessen', level: 'today' };
  if (d === 1) return { text: 'bis morgen', level: 'soon' };
  if (entry.location === 'freezer' && d > 30) return { text: `noch ${Math.round(d / 30)} Monate`, level: 'ok' };
  return { text: `noch ${d} Tage`, level: 'ok' };
}

/* ---------- Lesen & Ändern ---------- */

export async function listFridge() {
  return (await getAll('fridge')).sort((a, b) => a.expires.localeCompare(b.expires) || a.title.localeCompare(b.title, 'de'));
}

/** Gekochte Portionen einlagern */
export async function store({ recipe, portions, location = 'fridge', days }) {
  const today = isoDate();
  const shelf = location === 'freezer' ? FREEZER_DAYS : (days || shelfDays(recipe));
  const entry = {
    id: uid('f'),
    recipeId: recipe.id,
    title: recipe.title,
    portions: Math.max(0.5, Math.min(99, portions)),
    location,
    since: today,
    expires: addDays(today, shelf),
  };
  await put('fridge', entry);
  await markChanged();
  return entry;
}

async function update(id, changes) {
  const entry = await get('fridge', id);
  if (!entry) return null;
  Object.assign(entry, changes);
  await put('fridge', entry);
  await markChanged();
  return entry;
}

/** Portionen ändern; bei 0 wird der Eintrag entfernt (liefert dann null) */
export async function setPortions(id, portions) {
  if (portions <= 0) {
    await del('fridge', id);
    await markChanged();
    return null;
  }
  return update(id, { portions: Math.min(99, portions) });
}

export async function remove(id) {
  await del('fridge', id);
  await markChanged();
}

/** Einfrieren: ab heute 90 Tage haltbar */
export const freeze = (id) => {
  const today = isoDate();
  return update(id, { location: 'freezer', since: today, expires: addDays(today, FREEZER_DAYS) });
};

/** Auftauen: kommt in den Kühlschrank, 2 Tage haltbar */
export const thaw = (id) => {
  const today = isoDate();
  return update(id, { location: 'fridge', since: today, expires: addDays(today, THAWED_DAYS) });
};

/** Haltbarkeit um n Tage verschieben (nie vor heute − 1) */
export async function shiftExpiry(id, n) {
  const entry = await get('fridge', id);
  if (!entry) return null;
  const next = addDays(entry.expires, n);
  return update(id, { expires: daysBetween(isoDate(), next) < -1 ? entry.expires : next });
}

/* ---------- Versorgung ---------- */

export const getMealsPerDay = () => getMeta('mealsPerDay', 2);
export const setMealsPerDay = (n) => setMeta('mealsPerDay', Math.min(6, Math.max(1, n)));

/**
 * Wie lange reicht der Kühlschrank? Simuliert Tag für Tag: pro Tag werden mealsPerDay
 * Portionen gegessen, zuerst was am frühesten abläuft; Abgelaufenes zählt nicht.
 * Gefrorenes zählt nicht mit (muss erst aufgetaut werden).
 * Liefert { days, until, gapFrom, portions }:
 *   days    = Anzahl voll versorgter Tage ab heute
 *   until   = letzter versorgter Tag (oder null)
 *   gapFrom = erster Tag, an dem nicht mehr genug da ist
 */
export function coverage(entries, mealsPerDay, today = isoDate()) {
  const items = entries
    .filter((e) => e.location === 'fridge' && e.portions > 0 && e.expires >= today)
    .map((e) => ({ left: e.portions, expires: e.expires }))
    .sort((a, b) => a.expires.localeCompare(b.expires));
  const portions = items.reduce((s, i) => s + i.left, 0);

  let day = 0;
  while (day < 60) {
    const iso = addDays(today, day);
    let need = mealsPerDay;
    for (const it of items) {
      if (need <= 0) break;
      if (it.left <= 0 || it.expires < iso) continue;
      const take = Math.min(it.left, need);
      it.left -= take;
      need -= take;
    }
    if (need > 0.001) break;
    day++;
  }
  return { days: day, until: day ? addDays(today, day - 1) : null, gapFrom: addDays(today, day), portions };
}

/** Anzahl Einträge, die heute gegessen werden müssen oder abgelaufen sind (für das Badge) */
export async function urgentCount() {
  const today = isoDate();
  return (await getAll('fridge')).filter((e) => e.location === 'fridge' && daysLeft(e, today) <= 0).length;
}
