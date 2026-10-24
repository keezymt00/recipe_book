// tests/e2e/run.mjs – Browser-Tests der wichtigsten Abläufe in echtem Chrome (headless)
//
// Ohne Abhängigkeiten: eigener Mini-Webserver + Chrome über das DevTools-Protokoll (CDP).
// Jedes Szenario startet mit leerem Speicher (IndexedDB, Service Worker, Cache).
// Konsolenfehler und CSP-Verstöße lassen den Test fehlschlagen.
//
//   npm run test:e2e            (Chrome wird automatisch gesucht, sonst CHROME_PATH setzen)

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Auf GitHub Actions Fehler zusätzlich als Annotation ausgeben (in der Oberfläche sichtbar)
const annotate = (title, message) => {
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=${title.replace(/[\n:,]/g, ' ')}::${String(message).replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
};
process.on('unhandledRejection', (err) => { annotate('E2E abgestürzt', err?.stack || err); console.error(err); process.exit(1); });

/* ---------- Mini-Webserver ---------- */

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.md': 'text/markdown' };
const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path === '/') path = '/index.html';
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

/* ---------- Chrome starten ---------- */

const chromePath = process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(existsSync);
if (!chromePath) { annotate('E2E', 'Chrome nicht gefunden'); console.error('Chrome nicht gefunden – CHROME_PATH setzen.'); process.exit(2); }

const profile = await mkdtemp(join(tmpdir(), 'kochbuch-e2e-'));
const chrome = spawn(chromePath, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--disable-gpu', '--disable-dev-shm-usage',
  ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

// Chrome schreibt den DevTools-Port nach stderr
const wsBrowser = await new Promise((resolve, reject) => {
  let buf = '';
  chrome.stderr.on('data', (d) => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) resolve(m[1]);
  });
  setTimeout(() => reject(new Error('Chrome startet nicht')), 20000);
});
const port = new URL(wsBrowser).port;
const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');

/* ---------- CDP ---------- */

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let msgId = 0;
const pending = new Map();
let consoleErrors = [];
let loadWaiters = [];
const IGNORED = [/AudioContext was not allowed/, /favicon\.ico/];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Page.loadEventFired') { loadWaiters.splice(0).forEach((r) => r()); return; }
  let text = null;
  if (msg.method === 'Runtime.exceptionThrown') text = msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text;
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') text = msg.params.args.map((a) => a.value ?? a.description).join(' ');
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') text = `${msg.params.entry.text} ${msg.params.entry.url || ''}`;
  if (text && !IGNORED.some((re) => re.test(text))) consoleErrors.push(text);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++msgId;
  pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});

/** Code in der Seite ausführen (top-level await erlaubt); Fehler werden weitergereicht */
async function page(code) {
  const r = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true, replMode: true });
  if (r.exceptionDetails) throw new Error(`Seite: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
}

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

/** Navigieren und warten, bis die Seite geladen ist (ein abgebrochener Versuch wird wiederholt) */
async function navigate(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const loaded = new Promise((r) => { loadWaiters.push(r); setTimeout(r, 5000); });
    const nav = await send('Page.navigate', { url });
    if (!nav.errorText) { await loaded; return; }
    if (nav.errorText !== 'net::ERR_ABORTED' || attempt === 2) throw new Error(`Seite lädt nicht: ${nav.errorText} (${url})`);
    await sleep(300);
  }
}

/** Frischer Start: Speicher löschen, App laden, warten bis gerendert */
async function freshApp(hash = '#/') {
  await navigate('about:blank');
  await send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'all' });
  await navigate(`${ORIGIN}/${hash}`);
  await waitFor('document.querySelector("#view .nav, #view .cook")');
}

async function waitFor(expr, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await page(`!!(${expr})`).catch(() => false)) return;
    await sleep(100);
  }
  const state = await page('`${location.href} · ${document.readyState} · view=${document.getElementById("view")?.innerHTML.length}`').catch((e) => e.message);
  throw new Error(`Zeitüberschreitung beim Warten auf: ${expr} (Seite: ${state})`);
}

const go = async (hash) => { await page(`location.hash = ${JSON.stringify(hash)}`); await sleep(500); };

/* ---------- Mini-Testrahmen ---------- */

const results = [];
async function scenario(name, fn) {
  consoleErrors = [];
  const t0 = Date.now();
  try {
    await fn();
    if (consoleErrors.length) throw new Error(`Konsolenfehler:\n  ${consoleErrors.join('\n  ')}`);
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`✔ ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`✖ ${name}\n  ${err.message}`);
    annotate(`E2E: ${name}`, err.message);
  }
}
function expect(actual, expected, what) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}: erwartet ${JSON.stringify(expected)}, erhalten ${JSON.stringify(actual)}`);
  }
}

/* ---------- Nachbau der GitHub-API (für das Cloud-Backup) ---------- */

const GITHUB_MOCK = `
window.__gh = { files: new Map(), commits: [], private: true, n: 0 };
const realFetch = window.fetch;
window.fetch = async (url, opt = {}) => {
  if (!String(url).startsWith('https://api.github.com')) return realFetch(url, opt);
  const g = window.__gh, u = new URL(url), method = opt.method || 'GET', p = u.pathname;
  const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  if (opt.headers.Authorization !== 'Bearer tok') return json(401, { message: 'Bad credentials' });
  if (p === '/repos/me/backup') return json(200, { private: g.private }, { 'github-authentication-token-expiration': '2027-10-24 12:00:00 UTC' });
  if (p === '/repos/me/backup/commits') {
    const list = g.commits.filter((c) => c.path === u.searchParams.get('path')).reverse();
    return list.length ? json(200, list.map((c) => ({ sha: c.sha, commit: { message: c.message, author: { date: new Date().toISOString() } } }))) : json(409, {});
  }
  const m = p.match(/^\\/repos\\/me\\/backup\\/contents\\/(.+)$/);
  if (!m) return json(404, {});
  const path = decodeURIComponent(m[1]);
  if (method === 'PUT') {
    const body = JSON.parse(opt.body), cur = g.files.get(path);
    if (cur && !body.sha) return json(422, {});
    if (cur && body.sha !== cur.sha) return json(409, {});
    const sha = 's' + (++g.n);
    g.files.set(path, { content: body.content, sha });
    g.commits.push({ sha: 'c' + sha, path, message: body.message, snapshot: body.content });
    return json(cur ? 200 : 201, { content: { sha }, commit: { sha: 'c' + sha } });
  }
  const ref = u.searchParams.get('ref');
  const content = ref ? g.commits.find((c) => c.sha === ref)?.snapshot : g.files.get(path)?.content;
  if (!content) return json(404, {});
  if (opt.headers.Accept.includes('raw')) return new Response(Uint8Array.from(atob(content), (c) => c.charCodeAt(0)));
  return json(200, { sha: g.files.get(path).sha });
};`;

/* ---------- Szenarien ---------- */

await scenario('Kaltstart: 10 Beispielrezepte, Filter, Suche', async () => {
  await freshApp('#/');
  await waitFor('document.querySelectorAll(".tile").length === 10');
  await page(`const i = document.querySelector('.search input'); i.value = 'garnelen'; i.dispatchEvent(new Event('input'))`);
  expect(await page('document.querySelectorAll(".tile").length'), 2, 'Treffer für „garnelen“');
  expect(await page('document.querySelector(".nav-title").textContent'), 'Rezepte', 'Titel');
});

await scenario('Rezept: Portionsrechner rechnet um', async () => {
  await freshApp('#/rezept/seed_chili');
  await waitFor('document.querySelector(".ing-row")');
  await page(`document.querySelector('[aria-label="Mehr Portionen"]').click(); document.querySelector('[aria-label="Mehr Portionen"]').click()`);
  expect(await page('document.querySelector(".ing-row .ing-qty").textContent'), '1 kg', 'Rinderhack bei 8 statt 6 Portionen');
});

await scenario('Formular: Rezept anlegen, Papierkorb, wiederherstellen', async () => {
  await freshApp('#/neu');
  await page(`
    document.querySelector('.title-input').value = 'Testrezept';
    const rows = document.querySelectorAll('.ing-edit');
    rows[0].querySelector('.in-amount').value = '2'; rows[0].querySelector('.in-name').value = 'Zwiebeln';
    document.querySelector('.step-text').value = 'Alles 5 Minuten braten.';
    document.querySelector('[aria-label="Sichern"]').click();`);
  await waitFor('location.hash.startsWith("#/rezept/r_")');
  const id = await page('location.hash.split("/")[2].split("?")[0]');
  await page(`const s = await import('/js/safety.js'); await s.trashRecipe(${JSON.stringify(id)})`);
  expect(await page(`!!(await (await import('/js/db.js')).get('recipes', ${JSON.stringify(id)}))`), false, 'nach Löschen weg');
  await go('#/papierkorb');
  await page(`document.querySelector('.tool-btn.tinted').click()`);
  await sleep(300);
  expect(await page(`(await (await import('/js/db.js')).get('recipes', ${JSON.stringify(id)}))?.title`), 'Testrezept', 'wiederhergestellt');
});

await scenario('Planer → Einkaufsliste: Mengen zusammengerechnet, Vorrat ausgeblendet', async () => {
  await freshApp('#/planer');
  await page(`
    const p = await import('/js/plan.js'); const t = p.isoDate();
    await p.addToDay(p.addDays(t, 1), 'seed_chili', 6); await p.addToDay(p.addDays(t, 1), 'seed_burrito_bowl', 4);
    await p.addToDay(p.addDays(t, 3), 'seed_teriyaki', 4); await p.addToDay(p.addDays(t, 3), 'seed_paella', 4);`);
  await go('#/einkauf');
  await waitFor('document.querySelector(".shop-item")');
  const text = await page(`const s = await import('/js/shopping.js'); const { items, days } = await s.buildList(); s.listText(items, days)`);
  for (const line of ['1,7 kg Hähnchenbrust', '8 Zehen Knoblauch', '800 g Kidneybohnen (Glas, abgetropft)', '1 EL Kreuzkümmel']) {
    if (!text.includes(line)) throw new Error(`Fehlt in der Einkaufsliste: ${line}`);
  }
  if (/Salz|Pfeffer/.test(text)) throw new Error('Vorrat (Salz/Pfeffer) sollte ausgeblendet sein');
  // Abhaken verschiebt nach „Im Wagen“
  await page(`document.querySelector('.shop-item').click()`);
  await sleep(700);
  expect(await page(`[...document.querySelectorAll('.section-header h2')].some((h) => h.textContent === 'Im Wagen')`), true, 'Abschnitt Im Wagen');
});

await scenario('Sheets: kein Auto-Fokus (iOS-Kalender/Tastatur), Liste scrollbar', async () => {
  await freshApp('#/planer');
  await page(`document.querySelector('[aria-label="Kochtag hinzufügen"]').click()`);
  await sleep(500);
  expect(await page('document.activeElement.tagName'), 'BODY', 'Fokus im Kochtag-Sheet');
  await page(`document.querySelector('.sheet .pill').click()`);
  await sleep(800);
  expect(await page('document.activeElement.tagName'), 'BODY', 'Fokus in der Rezeptauswahl');
  // Was Scrollen auf iOS ausmacht: eigener Scrollbereich mit Überlänge, kein Weiterreichen
  // des Scrollens an die Seite, Seite dahinter gesperrt
  const st = await page(`const l = document.querySelector('.pick-list'), cs = getComputedStyle(l);
    ({ overflow: cs.overflowY, overscroll: cs.overscrollBehaviorY, longer: l.scrollHeight > l.clientHeight + 50,
       locked: document.body.classList.contains('sheet-open') && getComputedStyle(document.body).overflow === 'hidden' })`);
  expect(st, { overflow: 'auto', overscroll: 'contain', longer: true, locked: true }, 'Scrollbereich der Rezeptliste');
  // Echte Touch-Wischgeste – nur wo der Browser sie ausführen kann (headless Linux in CI kann es nicht)
  if (!process.env.CI) {
    const box = await page(`const r = document.querySelector('.pick-list').getBoundingClientRect(); ({ x: r.x + r.width / 2, y: r.y + r.height / 2 })`);
    await send('Input.synthesizeScrollGesture', { x: box.x, y: box.y, yDistance: -250, gestureSourceType: 'touch', speed: 800 });
    await sleep(500);
    if (!(await page('document.querySelector(".pick-list").scrollTop > 50'))) throw new Error('Rezeptliste scrollt nicht per Wischgeste');
  }
});

await scenario('Backup-Import: manipulierte Datei wird gefiltert', async () => {
  await freshApp('#/mehr');
  const r = await page(`
    const b = await import('/js/backup.js');
    const f = (o) => new File([JSON.stringify(o)], 'x.json');
    const errs = [];
    for (const bad of ['kein json', { app: 'andere', data: {} }, { app: 'kochbuch', version: 99, data: {} }]) {
      try { await b.importBackup(new File([typeof bad === 'string' ? bad : JSON.stringify(bad)], 'x.json')); } catch (e) { errs.push(e.message); }
    }
    const ok = await b.importBackup(f({ app: 'kochbuch', version: 1, data: { recipes: [{ title: '<b>x</b>' }, { title: '' }, null] } }));
    ({ errs: errs.length, ok })`);
  expect(r, { errs: 3, ok: { imported: 1, skipped: 2 } }, 'Import-Ergebnis');
});

await scenario('Cloud-Backup: sichern, ohne Änderung kein Commit, Totalverlust wiederherstellen', async () => {
  await freshApp('#/mehr');
  const r = await page(`${GITHUB_MOCK}
    const cloud = await import('/js/cloud.js'); const db = await import('/js/db.js');
    const out = {};
    try { await cloud.connect('me/backup', 'falsch'); } catch (e) { out.wrongToken = e.message; }
    window.__gh.private = false;
    try { await cloud.connect('me/backup', 'tok'); } catch (e) { out.publicRepo = e.message; }
    window.__gh.private = true;
    const c = document.createElement('canvas'); c.width = c.height = 20;
    const chili = await db.get('recipes', 'seed_chili'); chili.photo = await new Promise((res) => c.toBlob(res, 'image/jpeg')); await db.put('recipes', chili);
    await cloud.connect('me/backup', 'tok');
    out.first = await cloud.runBackup({ force: true });
    out.again = await cloud.runBackup();
    const v = await cloud.listVersions();
    await db.clear('recipes');
    out.restored = (await cloud.restoreVersion(v[0].sha)).imported;
    out.photo = (await db.get('recipes', 'seed_chili')).photo instanceof Blob;
    out.commits = window.__gh.commits.length;
    out;`);
  expect(!!r.wrongToken && !!r.publicRepo, true, 'falscher Schlüssel / öffentliches Repo abgelehnt');
  expect([r.first, r.again, r.restored, r.photo, r.commits], ['saved', 'unchanged', 10, true, 2], 'Backup-Ablauf (1 Foto + 1 Daten-Commit)');
});

await scenario('Sicherungspunkt: „Alles ersetzen“ vollständig rückgängig (inkl. Foto)', async () => {
  await freshApp('#/mehr');
  const r = await page(`
    const db = await import('/js/db.js'); const s = await import('/js/safety.js'); const b = await import('/js/backup.js');
    const c = document.createElement('canvas'); c.width = c.height = 20;
    const g = await db.get('recipes', 'seed_gulasch'); g.photo = await new Promise((res) => c.toBlob(res, 'image/jpeg')); await db.put('recipes', g);
    await s.createSnapshot('Vor Import');
    const id = (await s.listSnapshots())[0].id;
    await b.importObject({ app: 'kochbuch', version: 1, data: { recipes: [{ id: 'nur', title: 'Nur eins' }] } }, 'replace');
    const after = (await db.getAll('recipes')).length;
    await s.restoreSnapshot(id);
    ({ after, restored: (await db.getAll('recipes')).length, photo: (await db.get('recipes', 'seed_gulasch')).photo instanceof Blob })`);
  expect(r, { after: 1, restored: 10, photo: true }, 'Sicherungspunkt');
});

await scenario('Kühlschrank: nach dem Kochmodus einlagern, gegessen, versorgt bis', async () => {
  await freshApp('#/kochen/seed_chili?p=6');
  await waitFor('document.querySelector(".cook")');
  await page(`for (let i = 0; i < 6; i++) document.querySelector('.cook-nav .btn-primary').click()`);
  await page(`document.querySelector('.cook-nav .btn-primary').click()`); // „Fertig“
  await waitFor('document.querySelector(".sheet .segmented")');
  await page(`[...document.querySelectorAll('.sheet .btn')].find((b) => b.textContent === 'Einlagern').click()`);
  await sleep(600);
  const entries = await page(`(await (await import('/js/db.js')).getAll('fridge')).map((e) => [e.title, e.portions, e.location])`);
  expect(entries, [['Chili con Carne', 6, 'fridge']], 'Kühlschrank-Eintrag');
  await go('#/kuehlschrank');
  await waitFor('document.querySelector(".plan-entry")');
  await page(`document.querySelector('[aria-label="Portion gegessen"]').click()`);
  await sleep(500);
  expect(await page(`(await (await import('/js/db.js')).getAll('fridge'))[0].portions`), 5, 'nach „gegessen“');
  expect(await page(`document.querySelector('.stat-value').textContent`), '2', 'versorgt (5 Portionen, 2 pro Tag)');
  await go('#/planer');
  await waitFor('document.querySelector(".app-icon")');
  if (!(await page(`document.querySelector('#view').textContent.includes('Versorgt bis')`))) throw new Error('Planer zeigt „Versorgt bis“ nicht');
});

await scenario('Datenbank-Upgrade: alte Version 1 → aktuelle, Daten bleiben', async () => {
  await navigate('about:blank');
  await send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'all' });
  await navigate(`${ORIGIN}/icons/icon-192.png`);
  await page(`await new Promise((res, rej) => {
    const req = indexedDB.open('kochbuch', 1);
    req.onupgradeneeded = () => { for (const [n, k] of [['recipes','id'],['plan','id'],['shopping','key'],['pantry','name'],['meta','key']]) req.result.createObjectStore(n, { keyPath: k }); };
    req.onsuccess = () => { const tx = req.result.transaction(['recipes','meta'], 'readwrite');
      tx.objectStore('recipes').put({ id: 'r_alt', title: 'Omas Suppe', servings: 2, ingredients: [], steps: [], tags: [] });
      tx.objectStore('meta').put({ key: 'seeded', value: true });
      tx.oncomplete = () => { req.result.close(); res(); }; };
    req.onerror = () => rej(req.error); })`);
  await navigate(`${ORIGIN}/#/`);
  await waitFor('document.querySelector(".tile")');
  const r = await page(`const c = await (await import('/js/db.js')).openDB(); ({ v: c.version, stores: [...c.objectStoreNames].sort(), titles: (await (await import('/js/db.js')).getAll('recipes')).map((x) => x.title) })`);
  expect(r.v, 3, 'DB-Version');
  expect(r.stores, ['fridge', 'meta', 'pantry', 'plan', 'recipes', 'shopping', 'snapshots', 'trash'], 'Stores');
  expect(r.titles, ['Omas Suppe'], 'Rezepte erhalten');
});

/* ---------- Ergebnis ---------- */

ws.close();
chrome.kill('SIGKILL');
server.close();
await rm(profile, { recursive: true, force: true }).catch(() => {});
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Szenarien bestanden`);
process.exit(failed.length ? 1 : 0);
