// db.js – dünne Promise-Hülle um IndexedDB (kennt keine Oberfläche)

import { guessAisle } from './aisles.js';

const DB_NAME = 'kochbuch';
// Version 2: Stores "trash" (Papierkorb) und "snapshots" (Sicherungspunkte) hinzugefügt.
// Version 3: Store "fridge" (Meal-Prep-Kühlschrank) hinzugefügt.
// Bestehende Stores bleiben unangetastet – ein Upgrade verändert keine vorhandenen Daten.
const DB_VERSION = 3;

let dbPromise = null;

/** Öffnet die Datenbank (einmalig) und legt bei Bedarf die Stores an. */
export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Alle Stores schon jetzt anlegen – Teil 2 (Planer/Einkauf) braucht dann kein Schema-Update
      if (!db.objectStoreNames.contains('recipes')) db.createObjectStore('recipes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('plan')) db.createObjectStore('plan', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('shopping')) db.createObjectStore('shopping', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('pantry')) db.createObjectStore('pantry', { keyPath: 'name' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('trash')) db.createObjectStore('trash', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('fridge')) db.createObjectStore('fridge', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Lädt irgendwo eine neuere App-Version mit höherer DB-Version: Verbindung freigeben, neu laden
      db.onversionchange = () => { db.close(); location.reload(); };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Die Datenbank wird gerade aktualisiert – bitte andere geöffnete Fenster der App schließen.'));
  });
  return dbPromise;
}

/** Führt fn(store) in einer Transaktion aus und liefert das Ergebnis der zurückgegebenen Anfrage. */
async function run(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaktion abgebrochen'));
  });
}

export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const get = (store, key) => run(store, 'readonly', (s) => s.get(key));
export const put = (store, value) => run(store, 'readwrite', (s) => s.put(value));
export const del = (store, key) => run(store, 'readwrite', (s) => s.delete(key));
export const clear = (store) => run(store, 'readwrite', (s) => s.clear());
export const putMany = (store, values) => run(store, 'readwrite', (s) => { values.forEach((v) => s.put(v)); });

export async function getMeta(key, fallback = null) {
  const row = await get('meta', key);
  return row ? row.value : fallback;
}
export const setMeta = (key, value) => put('meta', { key, value });

/** Kurze, ausreichend eindeutige ID, z. B. "r_lq3x9k2ab" */
export function uid(prefix = 'r') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Nach jeder Datenänderung aufrufen: merkt sich ungesicherte Änderungen (Backup-Erinnerung)
 * und meldet die Änderung an das automatische Cloud-Backup (cloud.js).
 */
export async function markChanged() {
  if (!(await getMeta('pendingSince'))) await setMeta('pendingSince', Date.now());
  window.dispatchEvent(new Event('kochbuch:changed'));
}

/** Rezept speichern; touch=false lässt updatedAt unverändert (z. B. beim Favorisieren). */
export async function saveRecipe(recipe, { touch = true } = {}) {
  if (touch) recipe.updatedAt = Date.now();
  await put('recipes', recipe);
  await markChanged();
  return recipe;
}

const num = (v) => (Number.isFinite(+v) && +v > 0 ? +v : null);

/**
 * Bringt ein Rezept (aus Seed, Import oder Backup) in die erwartete Form.
 *
 * Datenmodell:
 * { id, title, photo: Blob|null, servings, timeMin,
 *   ingredients: [{ amount: number|null, unit, name, aisle }],
 *   steps: [{ text, timerMin: number|null }],
 *   tags: [string], favorite, nutrition: { protein, kcal } (pro Portion),
 *   notes, createdAt, updatedAt }
 */
export function normalizeRecipe(r) {
  const now = Date.now();
  return {
    id: r.id || uid('r'),
    title: String(r.title || 'Ohne Titel').trim(),
    photo: r.photo instanceof Blob ? r.photo : null,
    servings: num(r.servings) || 2,
    timeMin: num(r.timeMin),
    ingredients: (Array.isArray(r.ingredients) ? r.ingredients : []).map((i) => ({
      amount: typeof i.amount === 'number' && Number.isFinite(i.amount) ? i.amount : null,
      unit: i.unit || '',
      name: String(i.name || '').trim(),
      aisle: i.aisle || guessAisle(i.name),
    })).filter((i) => i.name),
    steps: (Array.isArray(r.steps) ? r.steps : []).map((s) => (typeof s === 'string'
      ? { text: s, timerMin: null }
      : { text: String(s.text || '').trim(), timerMin: num(s.timerMin) })).filter((s) => s.text),
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    favorite: !!r.favorite,
    nutrition: { protein: num(r.nutrition?.protein), kcal: num(r.nutrition?.kcal) },
    notes: String(r.notes || ''),
    createdAt: r.createdAt || now,
    updatedAt: r.updatedAt || now,
  };
}
