// backup.js – alle Daten als JSON-Datei exportieren und wieder importieren
// (Wichtig auf iOS: Safari kann Website-Daten bei Speicherknappheit löschen.)

import { getAll, putMany, clear, getMeta, setMeta, normalizeRecipe } from './db.js';

const FORMAT = 'kochbuch';
const FORMAT_VERSION = 1;
const STORES = ['plan', 'shopping', 'pantry'];

function blobToDataURL(blob) {
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

/** Erstellt die Backup-Datei (Fotos als Base64 eingebettet) */
export async function createBackupFile() {
  const recipes = await getAll('recipes');
  const data = { recipes: await Promise.all(recipes.map(async (r) => ({ ...r, photo: r.photo ? await blobToDataURL(r.photo) : null }))) };
  for (const store of STORES) data[store] = await getAll(store);
  data.aisleOverrides = await getMeta('aisleOverrides', {});

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

/**
 * Backup einlesen. mode: 'merge' (gleiche IDs werden überschrieben, Rest bleibt)
 *                   oder 'replace' (vorher alles löschen).
 * Liefert die Anzahl importierter Rezepte.
 */
export async function importBackup(file, mode = 'merge') {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  if (parsed?.app !== FORMAT || !parsed.data) throw new Error('Das ist keine Kochbuch-Sicherung.');

  const recipes = (parsed.data.recipes || []).map((r) =>
    normalizeRecipe({ ...r, photo: typeof r.photo === 'string' && r.photo.startsWith('data:') ? dataURLToBlob(r.photo) : null }));

  if (mode === 'replace') {
    await clear('recipes');
    for (const store of STORES) await clear(store);
  }
  await putMany('recipes', recipes);
  for (const store of STORES) {
    if (Array.isArray(parsed.data[store])) await putMany(store, parsed.data[store]);
  }
  if (parsed.data.aisleOverrides && typeof parsed.data.aisleOverrides === 'object') {
    const current = mode === 'replace' ? {} : await getMeta('aisleOverrides', {});
    await setMeta('aisleOverrides', { ...current, ...parsed.data.aisleOverrides });
  }
  return recipes.length;
}
