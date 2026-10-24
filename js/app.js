// app.js – Einstieg: Datenbank vorbereiten, Router, Service Worker

import { openDB, getMeta, setMeta, putMany } from './db.js';
import { seedRecipes } from './seed.js';
import { takeURLs, toast } from './ui.js';
import { state } from './state.js';
import * as list from './views/list.js';
import * as detail from './views/detail.js';
import * as form from './views/form.js';
import * as importer from './views/importer.js';
import * as cook from './views/cook.js';
import * as more from './views/more.js';
import * as planner from './views/planner.js';
import * as shopping from './views/shopping.js';
import { openCount, seedPantry } from './shopping.js';

/* ---------- Routen (Hash-basiert, funktioniert ohne Server-Konfiguration) ---------- */

const ROUTES = [
  { re: /^\/$/, view: list.render, tab: 'rezepte' },
  { re: /^\/rezept\/([^/]+)$/, view: detail.render, tab: 'rezepte' },
  { re: /^\/bearbeiten\/([^/]+)$/, view: form.render, tab: 'rezepte' },
  { re: /^\/neu$/, view: form.render, tab: 'rezepte' },
  { re: /^\/import$/, view: importer.render, tab: 'rezepte' },
  { re: /^\/kochen\/([^/]+)$/, view: cook.render, tab: 'rezepte' },
  { re: /^\/planer$/, view: planner.render, tab: 'planer' },
  { re: /^\/einkauf$/, view: shopping.render, tab: 'einkauf' },
  { re: /^\/mehr$/, view: more.render, tab: 'mehr' },
];

const viewEl = document.getElementById('view');
let cleanup = null;
let oldURLs = [];
let renderToken = 0;

async function router() {
  const raw = decodeURIComponent(location.hash.slice(1)) || '/';
  const [path, qs = ''] = raw.split('?');

  const samePath = path === state.curPath?.split('?')[0];
  if (!samePath) state.prevPath = state.curPath;
  state.curPath = raw;

  // Offene Sheets schließen (Tipp auf den Hintergrund = Abbrechen), z. B. nach der Zurück-Geste
  document.querySelectorAll('.sheet-backdrop').forEach((b) => b.click());

  // Vorige Ansicht aufräumen (Timer, Wake Lock, Listener …)
  if (cleanup) {
    try { cleanup(); } catch (err) { console.error(err); }
    cleanup = null;
  }

  const route = ROUTES.find((r) => r.re.test(path));
  if (!route) { location.replace('#/'); return; }

  document.querySelectorAll('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === route.tab));

  // In ein losgelöstes Element rendern und erst dann austauschen → kein Flackern
  const token = ++renderToken;
  const root = document.createElement('div');
  try {
    const result = await route.view(root, path.match(route.re).slice(1), new URLSearchParams(qs));
    const hooks = typeof result === 'function' ? { cleanup: result } : (result || {});
    if (token !== renderToken) { hooks.cleanup?.(); return; } // inzwischen weiternavigiert
    // Gleiche Seite neu gezeichnet (z. B. nach Abhaken) → Scrollposition behalten
    const keepY = samePath ? window.scrollY : 0;
    viewEl.replaceChildren(root);
    window.scrollTo(0, keepY);
    hooks.mounted?.();
    updateNav();
    updateBadge();
    cleanup = hooks.cleanup || null;
  } catch (err) {
    console.error(err);
    viewEl.replaceChildren(Object.assign(document.createElement('p'), { className: 'empty', textContent: `Fehler: ${err.message}` }));
  }

  // Foto-URLs der vorigen Ansicht freigeben
  oldURLs.forEach((u) => URL.revokeObjectURL(u));
  oldURLs = takeURLs();
}

/* ---------- Navigationsleiste: Material einblenden, sobald Inhalt darunter scrollt ---------- */

function updateNav() {
  const nav = viewEl.querySelector('.nav');
  if (nav) nav.classList.toggle('scrolled', window.scrollY > Number(nav.dataset.threshold || 2));
}
window.addEventListener('scroll', updateNav, { passive: true });

/* ---------- Badge an der Einkaufs-Tab: Anzahl offener Artikel ---------- */

async function updateBadge() {
  const tab = document.querySelector('#tabbar [data-tab="einkauf"]');
  const n = await openCount().catch(() => 0);
  let badge = tab.querySelector('.tab-badge');
  if (!n) { badge?.remove(); return; }
  if (!badge) tab.append(badge = Object.assign(document.createElement('span'), { className: 'tab-badge' }));
  badge.textContent = n > 99 ? '99+' : String(n);
}

/* ---------- Start ---------- */

async function init() {
  await openDB();

  // Beim allerersten Start die Beispielrezepte anlegen
  if (!(await getMeta('seeded'))) {
    await putMany('recipes', seedRecipes());
    await setMeta('seeded', true);
  }
  // Teil 2: Salz & Pfeffer als Vorrat vormerken (einmalig, auch bei bestehenden Installationen)
  if (!(await getMeta('pantrySeeded'))) {
    await seedPantry();
    await setMeta('pantrySeeded', true);
  }

  // Browser bitten, die Daten nicht automatisch zu löschen
  navigator.storage?.persist?.().catch(() => {});

  window.addEventListener('hashchange', router);
  await router();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker:', err));
  }
}

window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast(`Fehler: ${e.reason?.message || e.reason}`);
});

init().catch((err) => {
  console.error(err);
  viewEl.textContent = `Die App konnte nicht starten: ${err.message}`;
});
