// ui.js – kleine DOM-Helfer ohne Framework: Elemente, Icons, Navigation, Sheets, Toasts

import { state } from './state.js';

/* ---------- Elemente erzeugen ---------- */

/**
 * h('div.card.big', { onclick, href, ... }, ...kinder)
 * Kinder: Strings werden zu Textknoten (also sicher gegen HTML in Benutzerdaten),
 * null/false/undefined werden übersprungen, Arrays werden aufgelöst.
 */
export function h(tag, attrs, ...children) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    children.unshift(attrs);
    attrs = null;
  }
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');

  let value;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = `${el.className} ${v}`.trim();
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') value = v; // erst nach den Kindern setzen (wichtig für <select>)
    else if (k === 'checked' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  if (value !== undefined) el.value = value;
  return el;
}

/* ---------- Icons (an SF Symbols angelehnt, Farbe = currentColor) ---------- */

const ICONS = {
  back: '<path d="M14.5 5 7.5 12l7 7"/>',
  fwd: '<path d="M9.5 5l7 7-7 7"/>',
  chevron: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  up: '<path d="M5.5 15 12 8.5l6.5 6.5"/>',
  down: '<path d="M5.5 9 12 15.5 18.5 9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  heart: '<path d="M12 20.3s-7.6-4.6-9.4-9.5C1.4 7.4 3.6 4.3 7 4.3c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.1 4.4 6.5-1.8 4.9-9.4 9.5-9.4 9.5z"/>',
  edit: '<path d="M15.8 4.7a2 2 0 0 1 2.9 0l.6.6a2 2 0 0 1 0 2.9L8.5 19 4 20l1-4.5z"/>',
  trash: '<path d="M4 6.5h16M9.5 6.5V4.5h5v2M6.2 6.5l.9 12.6a1.6 1.6 0 0 0 1.6 1.4h6.6a1.6 1.6 0 0 0 1.6-1.4l.9-12.6M10 10.5v6M14 10.5v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  clipboard: '<path d="M15.5 4.5h2a1.5 1.5 0 0 1 1.5 1.5v13.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5V6a1.5 1.5 0 0 1 1.5-1.5h2"/><rect x="8.5" y="3" width="7" height="3.5" rx="1.2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5"/>',
  play: '<path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.4-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z"/>',
  pause: '<rect x="6.5" y="5" width="3.8" height="14" rx="1"/><rect x="13.7" y="5" width="3.8" height="14" rx="1"/>',
  camera: '<path d="M4.5 7.5h3l1.6-2.5h5.8l1.6 2.5h3a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V9a1.5 1.5 0 0 1 1.5-1.5z"/><circle cx="12" cy="13" r="3.6"/>',
  share: '<path d="M8 7.5l4-4 4 4M12 3.5V15M8.5 10H7a1.5 1.5 0 0 0-1.5 1.5v7.5A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5v-7.5A1.5 1.5 0 0 0 17 10h-1.5"/>',
  download: '<path d="M12 3.5V15M8 11l4 4 4-4M8.5 9H7a1.5 1.5 0 0 0-1.5 1.5V19A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5v-8.5A1.5 1.5 0 0 0 17 9h-1.5"/>',
  flame: '<path d="M12 21c-3.9 0-7-2.8-7-6.8 0-3.4 2.4-5.4 3.9-7.6.5 1.4 1.3 2.4 2.3 3C11.8 6.8 13 4.5 15 3c-.2 2.6 1 4.6 2.4 6.3 1 1.3 1.6 2.9 1.6 4.9 0 4-3.1 6.8-7 6.8z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15"/>',
  book: '<path d="M3.5 5.8c0-.9.7-1.6 1.6-1.4 2.6.4 4.9 1.3 6.9 2.9v13.2c-2-1.6-4.3-2.5-6.9-2.9-.9-.1-1.6-.8-1.6-1.7z"/><path d="M20.5 5.8c0-.9-.7-1.6-1.6-1.4-2.6.4-4.9 1.3-6.9 2.9v13.2c2-1.6 4.3-2.5 6.9-2.9.9-.1 1.6-.8 1.6-1.7z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  bag: '<path d="M5 8h14l-1.3 10.4a2 2 0 0 1-2 1.6H8.3a2 2 0 0 1-2-1.6z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
  ellipsis: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  calendarPlus: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>',
  fridge: '<rect x="5.5" y="2.5" width="13" height="19" rx="3"/><path d="M5.5 10h13M9 5.5v2M9 13v3"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>',
  sparkles: '<path d="M10 3.5l1.6 4.4L16 9.5l-4.4 1.6L10 15.5l-1.6-4.4L4 9.5l4.4-1.6zM17.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  // Gefüllte Kreise im iOS-Bearbeitungsmodus (rot = entfernen, grün = hinzufügen)
  minusCircle: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="M7.5 12h9" stroke="#fff" stroke-width="2.2"/>',
  plusCircle: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="M12 7.5v9M7.5 12h9" stroke="#fff" stroke-width="2.2"/>',
};

/** icon('heart') → <span class="icon"><svg …></span>; Suffix "Fill" füllt die Form (z. B. 'heartFill'). */
export function icon(name) {
  const filled = name.endsWith('Fill');
  const path = ICONS[filled ? name.slice(0, -4) : name] || '';
  const span = document.createElement('span');
  span.className = 'icon';
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  return span;
}

/* ---------- Navigation ---------- */

const pathOf = (hash) => hash.replace(/^#/, '').split('?')[0] || '/';

/** Zurück: Wenn wir von genau dort kamen, echtes history.back() (passt zur iOS-Wischgeste), sonst hinspringen. */
export function goBack(target) {
  if (state.prevPath && pathOf(state.prevPath) === pathOf(target)) history.back();
  else location.replace(target);
}

/** Runder Glas-Button; mit href als Link, sonst als Button */
export function glassBtn(iconName, label, action, cls = '') {
  const attrs = { 'aria-label': label, class: cls };
  if (typeof action === 'string') return h('a.glass-btn', { ...attrs, href: action }, icon(iconName));
  return h('button.glass-btn', { ...attrs, type: 'button', onclick: action }, icon(iconName));
}

/**
 * Navigationsleiste. Varianten:
 *  large:   kleiner Titel erscheint erst, wenn der große Seitentitel weggescrollt ist
 *  overlay: liegt transparent über einem Titelbild (Detailseite)
 * Das Material (Hintergrund) blendet app.js beim Scrollen ein (Klasse "scrolled").
 */
export function navbar({ title = '', back = null, leading = null, actions = [], large = false, overlay = false, threshold }) {
  const backBtn = back
    ? glassBtn('back', 'Zurück', (e) => { e.preventDefault(); goBack(back); })
    : null;
  return h(`header.nav${large ? '.large' : ''}${overlay ? '.overlay' : ''}`, { dataset: { threshold: threshold ?? (large ? 44 : 2) } },
    h('div.nav-inner', null,
      backBtn, leading,
      h('div.nav-title', null, title),
      h('span.nav-spacer'),
      actions));
}

/** Navigationsleiste + großer Titel für Hauptseiten (Rezepte, Mehr, …) */
export function largeTitle(title, actions = []) {
  return [navbar({ title, actions, large: true }), h('div.content', null, h('h1.large-title', null, title))];
}

/* ---------- Toast & Sheets ---------- */

let toastTimer;
export function toast(message, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/**
 * Bottom-Sheet. actions: [{ label, value, kind: 'primary'|'tinted'|'danger'|'danger-fill' }] (leer → nur Inhalt)
 * value darf eine Funktion sein – sie läuft direkt im Klick (wichtig für navigator.share auf iOS).
 * Liefert den value der gewählten Aktion oder null (Tipp auf den Hintergrund).
 * autofocus: erstes Eingabefeld fokussieren. Bewusst nur auf Wunsch – auf iOS öffnet ein
 * fokussiertes Feld sofort Tastatur bzw. Datums-Picker und stört das Scrollen im Sheet.
 */
export function modal({ title, body, actions = [], autofocus = false }) {
  return new Promise((resolve) => {
    const close = (v) => {
      document.activeElement?.blur(); // Tastatur/Picker sicher schließen, bevor das nächste Sheet kommt
      backdrop.remove();
      if (!document.querySelector('.sheet-backdrop')) document.body.classList.remove('sheet-open');
      resolve(v);
    };
    const backdrop = h('div.sheet-backdrop', { onclick: (e) => { if (e.target === backdrop) close(null); } },
      h('div.sheet', { role: 'dialog', 'aria-modal': 'true' },
        h('div.grabber'),
        title ? h('h3', null, title) : null,
        // body: Text, Element oder Funktion (close) => Element – für Sheets mit eigenen Auswahl-Zeilen
        typeof body === 'string' ? h('p', null, body) : typeof body === 'function' ? body(close) : body,
        actions.length ? h('div.sheet-actions', null, actions.map((a) =>
          h(`button.btn${a.kind ? `.btn-${a.kind}` : ''}`, {
            type: 'button',
            onclick: () => close(typeof a.value === 'function' ? a.value() : a.value),
          }, a.label))) : null));
    document.body.append(backdrop);
    document.body.classList.add('sheet-open'); // Seite dahinter nicht mitscrollen
    if (autofocus) backdrop.querySelector('textarea, input')?.focus();
  });
}

export const confirmDialog = (text, okLabel = 'OK', danger = false) => modal({
  body: text,
  actions: [
    { label: okLabel, value: true, kind: danger ? 'danger-fill' : 'primary' },
    { label: 'Abbrechen', value: false },
  ],
});

/* ---------- Fotos ---------- */

// Objekt-URLs der aktuellen Ansicht; der Router gibt sie beim Ansichtswechsel frei.
let liveURLs = [];
export function blobURL(blob) {
  const url = URL.createObjectURL(blob);
  liveURLs.push(url);
  return url;
}
export function takeURLs() {
  const urls = liveURLs;
  liveURLs = [];
  return urls;
}

/** Foto verkleinern (max. 1200 px, JPEG) – spart viel Speicher in IndexedDB. */
export function resizeImage(file, max = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht umgewandelt werden'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht geladen werden')); };
    img.src = url;
  });
}

/* ---------- Rezept-Darstellung ---------- */

const CUISINE_EMOJI = [
  ['Spanisch', '🥘'], ['Mediterran', '🫒'], ['Asiatisch', '🍜'], ['Tex-Mex', '🌮'], ['Deftig', '🍖'], ['Meal Prep', '🍱'],
];

export function recipeEmoji(r) {
  for (const [tag, emoji] of CUISINE_EMOJI) if (r.tags.includes(tag)) return emoji;
  return '🍳';
}

/** Stabiler Farbton pro Titel für den Platzhalter */
function hue(str) {
  let x = 0;
  for (const ch of str) x = (x * 31 + ch.codePointAt(0)) % 360;
  return x;
}

/** Foto oder weicher Farbverlauf mit Emoji als Platzhalter */
export function recipeImage(r, cls = 'thumb') {
  if (r.photo) return h(`img.${cls}`, { src: blobURL(r.photo), alt: '', loading: 'lazy' });
  return h(`div.${cls}.thumb-ph`, { style: `--h:${hue(r.title)}`, 'aria-hidden': 'true' }, h('span', null, recipeEmoji(r)));
}

export function formatMinutes(min) {
  if (!min) return '';
  if (min < 60) return `${min} Min.`;
  const hrs = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${hrs} Std. ${rest} Min.` : `${hrs} Std.`;
}

/** Positive Ganzzahl aus Text oder null */
export function posInt(v) {
  const n = parseInt(String(v ?? '').trim(), 10);
  return n > 0 ? n : null;
}

/** Positive Zahl (mit Komma) aus Text oder null */
export function posNum(v) {
  const n = parseFloat(String(v ?? '').trim().replace(',', '.'));
  return n > 0 ? n : null;
}

/** Textarea wächst mit dem Inhalt mit */
export function autoGrow(ta) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; };
  ta.addEventListener('input', fit);
  return fit;
}
