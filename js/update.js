// update.js – erkennt neue App-Versionen und bietet das Aktualisieren an.
//
// iOS hält Home-Bildschirm-Apps oft lange im Speicher; ohne Neustart käme ein Update nie an.
// Deshalb fragt die App beim Start, beim Zurückkehren aus dem Hintergrund und alle 30 Minuten
// die Versionsnummer auf dem Server ab. Ist sie neuer, erscheint ein Hinweis – neu geladen
// wird erst auf Tipp, damit nie etwas mitten im Kochen verschwindet.

import { APP_VERSION } from './version.js';
import { h, icon } from './ui.js';

const CHECK_INTERVAL = 30 * 60 * 1000;
const MIN_GAP = 60 * 1000; // höchstens einmal pro Minute prüfen
let lastCheck = 0;
let banner = null;

/** Versionsnummer direkt vom Server lesen (am Cache vorbei) */
async function remoteVersion() {
  const res = await fetch(`js/version.js?check=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.text()).match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1] || null;
}

async function check() {
  if (banner || !navigator.onLine || Date.now() - lastCheck < MIN_GAP) return;
  lastCheck = Date.now();
  try {
    const remote = await remoteVersion();
    if (remote && remote !== APP_VERSION) {
      // Neuen Service Worker gleich mitladen, damit danach auch offline die neue Version da ist
      navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
      showBanner(remote);
    }
  } catch { /* offline oder Server nicht erreichbar – später erneut */ }
}

function showBanner(version) {
  banner = h('button.update-banner', {
    type: 'button',
    onclick: () => {
      banner.disabled = true;
      banner.textContent = 'Wird aktualisiert …';
      location.reload();
    },
  },
  icon('sparkles'),
  h('span', null, h('strong', null, 'Neue Version verfügbar'), h('small', null, `Version ${version} · Tippen zum Aktualisieren`)),
  icon('refresh'));
  document.body.append(banner);
}

export function initUpdateCheck() {
  setTimeout(check, 3000); // nach dem Start, ohne ihn zu bremsen
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  setInterval(() => { if (document.visibilityState === 'visible') check(); }, CHECK_INTERVAL);
}
