// cloud.js – automatisches Backup in ein privates GitHub-Repository.
//
// Ablauf:
//  - Jede Datenänderung (Event "kochbuch:changed" aus db.markChanged) startet nach 30 s
//    ein Backup; beim Verlassen der App sofort. Gibt es kein Netz, wird es nachgeholt.
//  - Im Repo liegen:
//      kochbuch.json        alle Daten (Rezepte, Plan, Liste, Vorrat), Fotos als Pfad
//      photos/<hash>.jpg    jedes Foto genau einmal (Name = Inhalts-Hash, nie überschrieben)
//  - Jede Sicherung ist ein Commit → GitHub hat den kompletten Versionsverlauf.
//    Unveränderte Daten erzeugen keinen neuen Commit.
//
// Zugang: ein "fine-grained personal access token", das NUR auf dieses eine Repo
// (Contents: Read and write) zugreifen darf. Es wird nur lokal in IndexedDB gespeichert
// und ist nicht Teil der Backup-Dateien.

import { getMeta, setMeta } from './db.js';
import { collectData, blobToDataURL, importObject, FORMAT, FORMAT_VERSION } from './backup.js';

const API = 'https://api.github.com';
const DATA_FILE = 'kochbuch.json';
const DEBOUNCE_MS = 30 * 1000;

let timer = null;
let running = null;

/* ---------- Konfiguration & Status ---------- */

/** { repo: "name/repo", token, connectedAt, tokenExpires } oder null */
export const getConfig = () => getMeta('cloud', null);

/** { lastSuccess, lastError, lastErrorAt, lastCommit } */
export const getStatus = () => getMeta('cloudStatus', {});

async function setStatus(patch) {
  await setMeta('cloudStatus', { ...(await getStatus()), ...patch });
  window.dispatchEvent(new Event('kochbuch:cloud'));
}

/* ---------- GitHub-API ---------- */

async function gh(cfg, path, { method = 'GET', body, raw = false } = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Keine Verbindung zu GitHub.');
  }
  return res;
}

/** Verständliche Fehlermeldung zu einer GitHub-Antwort */
async function apiError(res) {
  if (res.status === 401) return new Error('Zugangsschlüssel ungültig oder abgelaufen.');
  if (res.status === 404) return new Error('Repository nicht gefunden – Name und Schlüssel-Berechtigung prüfen.');
  if (res.status === 403) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    return new Error(remaining === '0'
      ? 'GitHub-Limit erreicht – das Backup wird später automatisch erneut versucht.'
      : 'Keine Schreibberechtigung – beim Schlüssel „Contents: Read and write“ aktivieren.');
  }
  let detail = '';
  try { detail = (await res.json()).message || ''; } catch { /* egal */ }
  return new Error(`GitHub-Fehler ${res.status}${detail ? `: ${detail}` : ''}`);
}

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

/* ---------- Kodierung ---------- */

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function sha256Hex(bytes) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- Verbinden ---------- */

/**
 * Prüft Repository und Schlüssel und speichert die Verbindung.
 * Liefert Infos zu einem bereits vorhandenen Backup im Repo (für "Wiederherstellen?").
 */
export async function connect(repo, token) {
  repo = repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
  token = token.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Repository bitte als „benutzername/repo-name“ angeben.');
  if (!token) throw new Error('Bitte den Zugangsschlüssel einfügen.');

  const cfg = { repo, token };
  const res = await gh(cfg, `/repos/${repo}`);
  if (!res.ok) throw await apiError(res);
  const info = await res.json();
  // Rezepte und Pläne gehören nicht in ein öffentliches Repo
  if (!info.private) throw new Error('Das Repository ist öffentlich. Bitte ein privates Repository verwenden.');

  const expires = res.headers.get('github-authentication-token-expiration');
  await setMeta('cloud', { repo, token, connectedAt: Date.now(), tokenExpires: expires ? Date.parse(expires) || null : null });
  await setMeta('cloudLastHash', null);
  await setMeta('cloudJsonSha', null);
  await setMeta('cloudPhotos', []);
  await setStatus({ lastError: null, lastErrorAt: null });

  return existingBackup();
}

export async function disconnect() {
  clearTimeout(timer);
  await setMeta('cloud', null);
  await setMeta('cloudStatus', {});
}

/** Neueste Sicherung im Repo: { date, message } oder null */
async function existingBackup() {
  const versions = await listVersions(1);
  return versions[0] || null;
}

/* ---------- Backup ---------- */

/** Backup in ~30 s planen (mehrere Änderungen werden gebündelt) */
export function scheduleBackup(delay = DEBOUNCE_MS) {
  clearTimeout(timer);
  timer = setTimeout(() => runBackup().catch(() => {}), delay);
}

/** Backup sofort ausführen. Parallele Aufrufe teilen sich denselben Lauf. */
export function runBackup({ force = false } = {}) {
  if (!running) running = doBackup(force).finally(() => { running = null; });
  return running;
}

async function doBackup(force) {
  const cfg = await getConfig();
  if (!cfg) return 'off';
  if (!navigator.onLine) return 'offline';
  clearTimeout(timer);

  try {
    // 1) Daten sammeln; Fotos werden durch ihren Pfad im Repo ersetzt
    const photos = new Map(); // Pfad → Blob
    const data = await collectData(async (blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const path = `photos/${(await sha256Hex(bytes)).slice(0, 24)}.jpg`;
      photos.set(path, bytes);
      return path;
    });

    // 2) Nichts geändert seit der letzten Sicherung? Dann kein neuer Commit.
    const dataText = JSON.stringify(data, null, 2); // eingerückt → lesbare Unterschiede in der GitHub-Historie
    const hash = await sha256Hex(new TextEncoder().encode(dataText));
    if (!force && hash === (await getMeta('cloudLastHash'))) {
      await setMeta('cloudDirty', false);
      await setStatus({ lastSuccess: Date.now(), lastError: null, lastErrorAt: null });
      return 'unchanged';
    }

    // 3) Neue Fotos hochladen (bereits vorhandene überspringen)
    const uploaded = new Set(await getMeta('cloudPhotos', []));
    for (const [path, bytes] of photos) {
      if (uploaded.has(path)) continue;
      const res = await gh(cfg, `/repos/${cfg.repo}/contents/${encodePath(path)}`, {
        method: 'PUT',
        body: { message: 'Foto', content: bytesToBase64(bytes) },
      });
      // 422 = Datei existiert schon (gleicher Inhalt, da Name = Hash) → in Ordnung
      if (!res.ok && res.status !== 422) throw await apiError(res);
      uploaded.add(path);
      await setMeta('cloudPhotos', [...uploaded]);
    }

    // 4) Daten-Datei schreiben (dafür braucht GitHub die aktuelle Datei-Kennung "sha")
    const file = JSON.stringify({ app: FORMAT, version: FORMAT_VERSION, exportedAt: new Date().toISOString(), data }, null, 2);
    const content = bytesToBase64(new TextEncoder().encode(file));
    const message = `Backup · ${data.recipes.length} Rezepte · ${new Date().toLocaleString('de-DE')}`;
    const put = (sha) => gh(cfg, `/repos/${cfg.repo}/contents/${DATA_FILE}`, {
      method: 'PUT',
      body: { message, content, ...(sha ? { sha } : {}) },
    });

    let res = await put(await getMeta('cloudJsonSha'));
    if (res.status === 409 || res.status === 422) {
      // Gespeicherte Kennung veraltet (z. B. Erstverbindung oder Änderung auf github.com) → neu holen
      res = await put(await currentSha(cfg));
    }
    if (!res.ok) throw await apiError(res);
    const result = await res.json();

    await setMeta('cloudJsonSha', result.content?.sha || null);
    await setMeta('cloudLastHash', hash);
    await setMeta('cloudDirty', false);
    await setMeta('pendingSince', 0); // Erinnerung an manuelles Backup nicht mehr nötig
    await setStatus({ lastSuccess: Date.now(), lastError: null, lastErrorAt: null, lastCommit: result.commit?.sha || null });
    return 'saved';
  } catch (err) {
    await setStatus({ lastError: err.message, lastErrorAt: Date.now() });
    throw err;
  }
}

async function currentSha(cfg) {
  const res = await gh(cfg, `/repos/${cfg.repo}/contents/${DATA_FILE}`);
  if (res.status === 404) return null;
  if (!res.ok) throw await apiError(res);
  return (await res.json()).sha;
}

/* ---------- Wiederherstellen ---------- */

/** Letzte Sicherungen: [{ sha, date, message }] */
export async function listVersions(limit = 30) {
  const cfg = await getConfig();
  if (!cfg) return [];
  const res = await gh(cfg, `/repos/${cfg.repo}/commits?path=${DATA_FILE}&per_page=${limit}`);
  if (res.status === 409 || res.status === 404) return []; // leeres Repo
  if (!res.ok) throw await apiError(res);
  return (await res.json()).map((c) => ({ sha: c.sha, date: Date.parse(c.commit.author.date), message: c.commit.message }));
}

/** Eine Sicherung aus GitHub holen und (nach strenger Prüfung) einspielen */
export async function restoreVersion(sha) {
  const cfg = await getConfig();
  if (!cfg) throw new Error('Kein Backup verbunden.');
  const res = await gh(cfg, `/repos/${cfg.repo}/contents/${DATA_FILE}?ref=${encodeURIComponent(sha)}`, { raw: true });
  if (!res.ok) throw await apiError(res);
  let parsed;
  try { parsed = JSON.parse(await res.text()); } catch { throw new Error('Die Sicherung in GitHub ist beschädigt.'); }

  // Foto-Pfade wieder durch die Bilder ersetzen
  for (const r of parsed?.data?.recipes || []) {
    if (typeof r?.photo !== 'string' || !/^photos\/[a-f0-9]{24}\.jpg$/.test(r.photo)) { if (r) r.photo = null; continue; }
    const img = await gh(cfg, `/repos/${cfg.repo}/contents/${r.photo}`, { raw: true });
    r.photo = img.ok ? await blobToDataURL(new Blob([await img.arrayBuffer()], { type: 'image/jpeg' })) : null;
  }
  const result = await importObject(parsed, 'replace');
  // Der Stand entspricht jetzt dieser Version; die nächste Änderung wird wieder gesichert
  await setMeta('cloudLastHash', null);
  return result;
}

/* ---------- Automatik ---------- */

export function initCloud() {
  // Jede Datenänderung → Backup in 30 s
  window.addEventListener('kochbuch:changed', async () => {
    if (!(await getConfig())) return;
    await setMeta('cloudDirty', true);
    scheduleBackup();
  });
  // App wird verlassen → sofort sichern (iOS kann die App danach jederzeit beenden)
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden' && (await getMeta('cloudDirty'))) runBackup().catch(() => {});
  });
  // Wieder online → Liegengebliebenes nachholen
  window.addEventListener('online', async () => {
    if (await getMeta('cloudDirty')) scheduleBackup(3000);
  });
  // Beim Start: offene Änderungen vom letzten Mal sichern
  setTimeout(async () => {
    if ((await getConfig()) && (await getMeta('cloudDirty'))) runBackup().catch(() => {});
  }, 5000);
}
