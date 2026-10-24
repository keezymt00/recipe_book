// backup.js – Daten sammeln, prüfen und zurückschreiben.
// Gemeinsame Grundlage für: Export/Import als Datei, Cloud-Backup (cloud.js) und
// Sicherungspunkte (safety.js). Alles, was zurückgeschrieben wird, läuft durch dieselbe
// strenge Prüfung – egal ob aus einer Datei, aus GitHub oder aus einem Sicherungspunkt.

import { getAll, put, del, putMany, clear, getMeta, setMeta, normalizeRecipe, markChanged } from './db.js';
import { AISLES } from './aisles.js';

export const FORMAT = 'kochbuch';
export const FORMAT_VERSION = 1;
const STORES = ['plan', 'shopping', 'pantry'];

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataURLToBlob(dataURL) {
  const [head, b64] = dataURL.split(',');
  const type = head.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type });
}

/**
 * Alle Daten einsammeln. photo(blob, recipe) bestimmt, was im Feld "photo" landet:
 * Data-URL (Datei-Export), Pfad im Repo (Cloud) oder null (Sicherungspunkt).
 */
export async function collectData(photo = () => null) {
  const recipes = (await getAll('recipes')).sort((a, b) => a.id.localeCompare(b.id));
  const data = { recipes: [] };
  for (const r of recipes) data.recipes.push({ ...r, photo: r.photo ? await photo(r.photo, r) : null });
  for (const store of STORES) data[store] = await getAll(store);
  data.aisleOverrides = await getMeta('aisleOverrides', {});
  return data;
}

/** Erstellt die Backup-Datei (Fotos als Base64 eingebettet) */
export async function createBackupFile() {
  const data = await collectData((blob) => blobToDataURL(blob));

  const json = JSON.stringify({ app: FORMAT, version: FORMAT_VERSION, exportedAt: new Date().toISOString(), data });
  const date = new Date().toISOString().slice(0, 10);
  return new File([json], `kochbuch-backup-${date}.json`, { type: 'application/json' });
}

/** Nach erfolgreichem Sichern: Erinnerung zurücksetzen */
export async function markBackedUp() {
  await setMeta('lastBackup', Date.now());
  await setMeta('pendingSince', 0);
}

/** Teilen-Menü (iOS: "In Dateien sichern", AirDrop, Mail …). Muss direkt im Klick aufgerufen werden. */
export async function shareFile(file) {
  try {
    await navigator.share({ files: [file], title: file.name });
    await markBackedUp();
    return true;
  } catch (err) {
    if (err.name !== 'AbortError') downloadFile(file);
    return false;
  }
}

/** Klassischer Download über einen temporären Link */
export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  markBackedUp();
}

export const canShareFiles = (file) => !!navigator.canShare && navigator.canShare({ files: [file] });

/* ---------- Import: strenge Prüfung ----------
 * Eine Backup-Datei kann von irgendwoher stammen (z. B. von einer anderen Person).
 * Deshalb wird nichts ungeprüft übernommen: Jedes Feld wird auf Typ und Länge geprüft
 * und in ein frisches Objekt kopiert. Unbekannte Felder fallen weg, kaputte Einträge
 * werden übersprungen statt die ganze Datei abzulehnen.
 */

const MAX_FILE_BYTES = 100 * 1024 * 1024;   // 100 MB (mit Fotos)
const MAX_PHOTO_CHARS = 8 * 1024 * 1024;    // ~6 MB Bild als Base64
const AISLE_IDS = new Set(AISLES.map((a) => a.id));
const ID_RE = /^[\w-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

function cleanRecipe(r) {
  if (!isObj(r)) return null;
  const title = str(r.title, 200).trim();
  if (!title) return null;
  const photo = typeof r.photo === 'string' && r.photo.length <= MAX_PHOTO_CHARS && PHOTO_RE.test(r.photo)
    ? dataURLToBlob(r.photo)
    : null;
  return normalizeRecipe({
    id: typeof r.id === 'string' && ID_RE.test(r.id) ? r.id : undefined,
    title,
    photo,
    servings: num(r.servings, 1, 999),
    timeMin: num(r.timeMin, 1, 10000),
    ingredients: list(r.ingredients, 300).filter(isObj).map((i) => ({
      amount: num(i.amount, 0, 1e6),
      unit: str(i.unit, 20),
      name: str(i.name, 200),
      aisle: AISLE_IDS.has(i.aisle) ? i.aisle : undefined,
    })),
    steps: list(r.steps, 200).map((st) => (typeof st === 'string'
      ? { text: str(st, 5000), timerMin: null }
      : isObj(st) ? { text: str(st.text, 5000), timerMin: num(st.timerMin, 1, 1440) } : null)).filter(Boolean),
    tags: list(r.tags, 30).filter((t) => typeof t === 'string').map((t) => t.slice(0, 40)),
    favorite: r.favorite === true,
    nutrition: isObj(r.nutrition) ? { protein: num(r.nutrition.protein, 0, 1000), kcal: num(r.nutrition.kcal, 0, 10000) } : {},
    notes: str(r.notes, 20000),
    createdAt: num(r.createdAt, 0, 4e12) || undefined,
    updatedAt: num(r.updatedAt, 0, 4e12) || undefined,
  });
}

function cleanDay(d) {
  if (!isObj(d) || typeof d.id !== 'string' || !DATE_RE.test(d.id)) return null;
  return {
    id: d.id,
    entries: list(d.entries, 10).filter((e) => isObj(e) && typeof e.recipeId === 'string' && ID_RE.test(e.recipeId)).map((e) => ({
      id: typeof e.id === 'string' && ID_RE.test(e.id) ? e.id : `e_${Math.random().toString(36).slice(2, 10)}`,
      recipeId: e.recipeId,
      servings: num(e.servings, 1, 99) || 1,
    })),
  };
}

function cleanShopping(s) {
  if (!isObj(s) || typeof s.key !== 'string' || !s.key || s.key.length > 120) return null;
  if (s.custom === true) {
    const name = str(s.name, 200).trim();
    if (!name || !s.key.startsWith('c_')) return null;
    return {
      key: s.key, custom: true, name,
      amount: num(s.amount, 0, 1e6), unit: str(s.unit, 20),
      aisle: AISLE_IDS.has(s.aisle) ? s.aisle : 'sonstiges', checked: s.checked === true,
    };
  }
  return s.key.startsWith('g:') ? { key: s.key, checked: s.checked === true } : null;
}

function cleanPantry(p) {
  if (!isObj(p)) return null;
  const name = str(p.name, 100).trim();
  const label = str(p.label, 100).trim();
  return name && label ? { name, label } : null;
}

function cleanOverrides(o) {
  const out = {};
  if (!isObj(o)) return out;
  for (const [key, aisle] of Object.entries(o).slice(0, 5000)) {
    if (key.startsWith('g:') && key.length <= 120 && AISLE_IDS.has(aisle)) out[key] = aisle;
  }
  return out;
}

/** Rohdaten (aus Datei, Cloud oder Sicherungspunkt) prüfen und bereinigen */
export function cleanData(data) {
  if (!isObj(data)) throw new Error('Die Sicherung enthält keine Daten.');
  const raw = list(data.recipes, 5000);
  const recipes = raw.map(cleanRecipe).filter(Boolean);
  return {
    recipes,
    skipped: Array.isArray(data.recipes) ? data.recipes.length - recipes.length : 0,
    plan: list(data.plan, 1000).map(cleanDay).filter(Boolean),
    shopping: list(data.shopping, 5000).map(cleanShopping).filter(Boolean),
    pantry: list(data.pantry, 2000).map(cleanPantry).filter(Boolean),
    aisleOverrides: cleanOverrides(data.aisleOverrides),
  };
}

/**
 * Geprüfte Daten zurückschreiben. mode: 'merge' (gleiche IDs überschreiben, Rest bleibt)
 * oder 'replace' (vorher alles löschen).
 * Dabei geht nie etwas endgültig verloren:
 *  - Hat ein Rezept in der Sicherung kein Foto, auf dem Gerät (oder im Papierkorb) aber schon,
 *    wird das vorhandene Foto übernommen.
 *  - Bei 'replace' wandern Rezepte, die in der Sicherung fehlen, in den Papierkorb (mit Foto)
 *    statt gelöscht zu werden – so lässt sich auch ein versehentliches "Alles ersetzen"
 *    über einen Sicherungspunkt vollständig rückgängig machen.
 */
export async function applyData(clean, mode = 'merge') {
  const current = await getAll('recipes');
  const photos = new Map();
  for (const t of await getAll('trash')) if (t.recipe?.photo) photos.set(t.id, t.recipe.photo);
  for (const r of current) if (r.photo) photos.set(r.id, r.photo);
  for (const r of clean.recipes) if (!r.photo && photos.has(r.id)) r.photo = photos.get(r.id);

  if (mode === 'replace') {
    const incoming = new Set(clean.recipes.map((r) => r.id));
    const now = Date.now();
    for (const r of current) if (!incoming.has(r.id)) await put('trash', { id: r.id, recipe: r, deletedAt: now });
    await clear('recipes');
    for (const store of STORES) await clear(store);
  }
  await putMany('recipes', clean.recipes);
  // Wieder vorhandene Rezepte aus dem Papierkorb nehmen
  for (const r of clean.recipes) await del('trash', r.id);
  for (const store of STORES) await putMany(store, clean[store]);
  const overrides = mode === 'replace' ? {} : await getMeta('aisleOverrides', {});
  await setMeta('aisleOverrides', { ...overrides, ...clean.aisleOverrides });
  await markChanged();
  return { imported: clean.recipes.length, skipped: clean.skipped };
}

/** Komplettes Backup-Objekt ({ app, version, data }) prüfen und einspielen */
export async function importObject(parsed, mode = 'merge') {
  if (!isObj(parsed) || parsed.app !== FORMAT || !isObj(parsed.data)) throw new Error('Das ist keine Kochbuch-Sicherung.');
  if (typeof parsed.version !== 'number' || parsed.version > FORMAT_VERSION) {
    throw new Error('Diese Sicherung stammt aus einer neueren App-Version.');
  }
  // Erst prüfen, dann verändern – bei einem Fehler bleibt alles, wie es war
  return applyData(cleanData(parsed.data), mode);
}

/** Backup-Datei einlesen. Liefert { imported, skipped }. */
export async function importBackup(file, mode = 'merge') {
  if (file.size > MAX_FILE_BYTES) throw new Error('Die Datei ist zu groß (max. 100 MB).');
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  return importObject(parsed, mode);
}
