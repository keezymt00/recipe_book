// plan.js – Kochtage lesen und ändern
//
// Datenmodell (Store "plan", Schlüssel = Datum):
// { id: "2026-10-26", entries: [{ id, recipeId, servings }] }   – 1–2 Rezepte pro Kochtag

import { getAll, get, put, del, uid, markChanged } from './db.js';

export const MAX_RECIPES_PER_DAY = 2;

/* ---------- Datum (immer lokale Zeit, Format JJJJ-MM-TT) ---------- */

export function isoDate(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

const toDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function addDays(iso, n) {
  const d = toDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** "Heute", "Morgen", "Übermorgen" oder "Donnerstag, 29. Oktober" */
export function dayLabel(iso) {
  const today = isoDate();
  if (iso === today) return 'Heute';
  if (iso === addDays(today, 1)) return 'Morgen';
  if (iso === addDays(today, 2)) return 'Übermorgen';
  return toDate(iso).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "Do., 29. Okt." */
export function shortDate(iso) {
  return toDate(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ---------- Lesen ---------- */

export async function getDays() {
  return (await getAll('plan')).sort((a, b) => a.id.localeCompare(b.id));
}

/** Kochtage ab heute – nur diese fließen in die Einkaufsliste ein */
export async function upcomingDays() {
  const today = isoDate();
  return (await getDays()).filter((d) => d.id >= today);
}

/* ---------- Ändern ---------- */

async function saveDay(day) {
  await put('plan', day);
  await markChanged();
  return day;
}

export async function addDay(iso) {
  return (await get('plan', iso)) || saveDay({ id: iso, entries: [] });
}

export async function removeDay(iso) {
  await del('plan', iso);
  await markChanged();
}

export async function addToDay(iso, recipeId, servings) {
  const day = (await get('plan', iso)) || { id: iso, entries: [] };
  if (day.entries.length >= MAX_RECIPES_PER_DAY) {
    throw new Error(`Pro Kochtag sind höchstens ${MAX_RECIPES_PER_DAY} Rezepte möglich.`);
  }
  day.entries.push({ id: uid('e'), recipeId, servings });
  return saveDay(day);
}

export async function updateEntry(iso, entryId, changes) {
  const day = await get('plan', iso);
  if (!day) return null;
  const entry = day.entries.find((e) => e.id === entryId);
  if (entry) Object.assign(entry, changes);
  return saveDay(day);
}

export async function removeEntry(iso, entryId) {
  const day = await get('plan', iso);
  if (!day) return null;
  day.entries = day.entries.filter((e) => e.id !== entryId);
  return saveDay(day);
}

/** Vergangene Kochtage löschen; liefert die Anzahl */
export async function removePastDays() {
  const today = isoDate();
  const past = (await getDays()).filter((d) => d.id < today);
  for (const d of past) await del('plan', d.id);
  if (past.length) await markChanged();
  return past.length;
}
