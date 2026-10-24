// safety.js – Sicherheitsnetz auf dem Gerät: Papierkorb und Sicherungspunkte.
//
// Papierkorb:       Gelöschte Rezepte (inkl. Foto) bleiben 30 Tage wiederherstellbar.
// Sicherungspunkte: Kopie aller Daten – täglich automatisch und vor riskanten Aktionen
//                   (Import, Wiederherstellung). Ohne Fotos, um Speicher zu sparen; Fotos
//                   bleiben beim Zurückspielen erhalten (siehe backup.applyData).
// Schützt vor eigenen Fehlern, NICHT vor Verlust des iPhones – dafür gibt es das Cloud-Backup.

import { get, getAll, put, del, clear, getMeta, setMeta, markChanged } from './db.js';
import { collectData, cleanData, applyData } from './backup.js';
import { isoDate } from './plan.js';

const TRASH_DAYS = 30;
const MAX_SNAPSHOTS = 12;

/* ---------- Papierkorb ---------- */

export async function trashRecipe(id) {
  const recipe = await get('recipes', id);
  if (!recipe) return;
  await put('trash', { id, recipe, deletedAt: Date.now() });
  await del('recipes', id);
  await markChanged();
}

export async function restoreFromTrash(id) {
  const entry = await get('trash', id);
  if (!entry) return null;
  await put('recipes', entry.recipe);
  await del('trash', id);
  await markChanged();
  return entry.recipe;
}

export async function listTrash() {
  return (await getAll('trash')).sort((a, b) => b.deletedAt - a.deletedAt);
}

export const deleteForever = (id) => del('trash', id);
export const emptyTrash = () => clear('trash');

/** Einträge älter als 30 Tage endgültig entfernen (beim App-Start) */
export async function cleanupTrash() {
  const limit = Date.now() - TRASH_DAYS * 864e5;
  for (const t of await getAll('trash')) if (t.deletedAt < limit) await del('trash', t.id);
}

export const trashDaysLeft = (entry) => Math.max(0, TRASH_DAYS - Math.floor((Date.now() - entry.deletedAt) / 864e5));

/* ---------- Sicherungspunkte ---------- */

export async function createSnapshot(reason) {
  const data = await collectData(); // Fotos: null
  await put('snapshots', { id: Date.now(), reason, recipes: data.recipes.length, data });
  // Nur die neuesten behalten
  const all = (await getAll('snapshots')).sort((a, b) => b.id - a.id);
  for (const old of all.slice(MAX_SNAPSHOTS)) await del('snapshots', old.id);
}

export async function listSnapshots() {
  return (await getAll('snapshots')).sort((a, b) => b.id - a.id);
}

/** Sicherungspunkt zurückspielen – vorher wird der aktuelle Stand selbst gesichert */
export async function restoreSnapshot(id) {
  const snap = await get('snapshots', id);
  if (!snap) throw new Error('Sicherungspunkt nicht gefunden.');
  await createSnapshot('Vor Wiederherstellung');
  return applyData(cleanData(snap.data), 'replace');
}

/** Einmal pro Tag beim Start einen Sicherungspunkt anlegen */
export async function dailySnapshot() {
  const today = isoDate();
  if ((await getMeta('lastDailySnapshot')) === today) return;
  await createSnapshot('Täglich');
  await setMeta('lastDailySnapshot', today);
}
