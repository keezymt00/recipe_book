// views/cook.js – Kochmodus: ein Schritt pro Bildschirm, große Schrift,
// Bildschirm bleibt an (Wake Lock API), Timer pro Schritt wie in der Uhr-App (Ring, Start/Pause).

import { get } from '../db.js';
import { formatQty } from '../units.js';
import { h, icon, glassBtn, confirmDialog, posInt, goBack } from '../ui.js';
import { storeSheet } from './fridge.js';

const RING_R = 96;
const RING_C = 2 * Math.PI * RING_R; // Umfang für stroke-dasharray

export async function render(root, [id], query) {
  const r = await get('recipes', id);
  if (!r) { location.replace('#/'); return; }

  const servings = posInt(query.get('p')) || r.servings;
  const factor = servings / r.servings;
  const backTarget = `#/rezept/${r.id}?p=${servings}`;
  // Seite 0 = Zutatenübersicht ("Mise en place"), danach ein Schritt pro Seite
  const pages = [null, ...r.steps];
  const last = pages.length - 1;
  let idx = 0;

  document.body.classList.add('cooking');

  /* ---------- Timer ---------- */
  // { step, total, endsAt, pausedLeft, done } – über Zeitstempel, damit sie auch nach Sperre/Hintergrund stimmen
  const timers = [];
  let audio = null;
  let alarmLoop = null;

  // iOS erlaubt Ton nur nach einer Nutzeraktion → beim ersten Timer-Start "freischalten"
  function unlockAudio() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + 0.01);
    } catch { /* kein Ton verfügbar – visueller Alarm reicht */ }
  }

  // Sanfter Dreiklang statt hartem Piepen
  function chime() {
    if (!audio) return;
    const t0 = audio.currentTime;
    [880, 1108.7, 1318.5].forEach((freq, k) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const t = t0 + k * 0.18;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.65);
    });
  }

  const leftMs = (t) => (t.pausedLeft != null ? t.pausedLeft : Math.max(0, t.endsAt - Date.now()));
  const mmss = (ms) => {
    const sec = Math.ceil(ms / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };
  const timerFor = (step) => timers.find((t) => t.step === step);

  function startTimer(step, minutes) {
    unlockAudio();
    const total = minutes * 60000;
    timers.push({ step, total, endsAt: Date.now() + total, pausedLeft: null, done: false });
    refreshTimers();
  }
  function togglePause(t) {
    if (t.pausedLeft != null) { t.endsAt = Date.now() + t.pausedLeft; t.pausedLeft = null; }
    else t.pausedLeft = leftMs(t);
    refreshTimers();
  }
  function removeTimer(t) {
    timers.splice(timers.indexOf(t), 1);
    if (!timers.some((x) => x.done)) stopAlarm();
    refreshTimers();
  }

  // Alarm wiederholen, bis er weggetippt wird (max. 1 Minute)
  function startAlarm() {
    if (alarmLoop) return;
    let rounds = 0;
    chime();
    navigator.vibrate?.([300, 150, 300]);
    alarmLoop = setInterval(() => (++rounds > 30 ? stopAlarm() : chime()), 2000);
  }
  function stopAlarm() {
    clearInterval(alarmLoop);
    alarmLoop = null;
  }

  function tick() {
    let changed = false;
    for (const t of timers) {
      if (!t.done && t.pausedLeft == null && leftMs(t) === 0) { t.done = true; changed = true; }
    }
    if (changed) { startAlarm(); refreshTimers(); }
    // Nur Texte und Ring aktualisieren (nicht neu aufbauen), damit Taps nicht verloren gehen
    root.querySelectorAll('[data-time]').forEach((el) => {
      const t = timerFor(Number(el.dataset.time));
      if (t) el.textContent = t.done ? 'Fertig' : mmss(leftMs(t));
    });
    root.querySelectorAll('[data-ring]').forEach((el) => {
      const t = timerFor(Number(el.dataset.ring));
      if (t) el.style.strokeDashoffset = String(RING_C * (1 - leftMs(t) / t.total));
    });
  }
  const interval = setInterval(tick, 250);

  /* ---------- Wake Lock: Bildschirm bleibt an ---------- */
  let wakeLock = null;
  const wakeNote = h('p.wake-note');
  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) {
      wakeNote.replaceChildren('Dieses Gerät kann den Bildschirm nicht wach halten (ab iOS 16.4).');
      return;
    }
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
      wakeNote.replaceChildren(icon('sun'), 'Bildschirm bleibt an, solange du kochst');
    } catch {
      wakeNote.replaceChildren('Bildschirm-Sperre konnte nicht deaktiviert werden (Stromsparmodus?).');
    }
  }
  // Beim Zurückkehren in die App: Lock erneuern (wird beim Verlassen automatisch freigegeben) und Timer prüfen
  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      if (!wakeLock) requestWakeLock();
      tick();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  requestWakeLock();

  /* ---------- Aufbau ---------- */
  const segments = h('div.segments', null, pages.map(() => h('i')));
  const counter = h('span.counter');
  const live = h('div.live');
  const body = h('div.cook-body');
  let clockEl = null;
  const prevBtn = h('button.btn', { type: 'button', onclick: () => go(idx - 1) }, 'Zurück');
  const nextBtn = h('button.btn.btn-primary', { type: 'button', onclick: () => (idx === last ? finish() : go(idx + 1)) });

  root.append(h('div.cook', null,
    h('div.cook-head', null,
      segments,
      h('div.cook-bar', null,
        glassBtn('close', 'Kochmodus beenden', exit),
        h('span.title', null, r.title),
        counter)),
    live,
    body,
    h('div.cook-nav', null, prevBtn, nextBtn)));

  function refreshTimers() {
    // Laufende Timer als "Live-Aktivitäten" oben
    live.replaceChildren(...timers.map((t) => h(`button.live-chip${t.done ? '.done' : ''}`, {
      type: 'button',
      'aria-label': `Timer Schritt ${t.step + 1}`,
      // Fertigen Timer antippen = quittieren, sonst zum Schritt springen
      onclick: () => (t.done ? removeTimer(t) : go(t.step + 1)),
    }, icon(t.pausedLeft != null ? 'pauseFill' : 'timer'), `${t.step + 1} · `, h('span', { dataset: { time: t.step } }, t.done ? 'Fertig' : mmss(leftMs(t))))));
    renderClock();
  }

  /** Timer-Ring mit Abbrechen- und Start/Pause-Button, wie in der Uhr-App */
  function renderClock() {
    if (!clockEl) return;
    const stepIdx = idx - 1;
    const step = r.steps[stepIdx];
    const t = timerFor(stepIdx);
    const total = t ? t.total : step.timerMin * 60000;
    const offset = t ? RING_C * (1 - leftMs(t) / t.total) : 0;

    let right;
    if (!t) right = h('button.round-btn.go', { type: 'button', onclick: () => startTimer(stepIdx, step.timerMin) }, 'Start');
    else if (t.done) right = h('button.round-btn.stop', { type: 'button', onclick: () => removeTimer(t) }, 'Stopp');
    else if (t.pausedLeft != null) right = h('button.round-btn.go', { type: 'button', onclick: () => togglePause(t) }, 'Weiter');
    else right = h('button.round-btn.pause', { type: 'button', onclick: () => togglePause(t) }, 'Pause');

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 210 210');
    svg.innerHTML = `<circle class="track" cx="105" cy="105" r="${RING_R}"/><circle class="bar" cx="105" cy="105" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${offset}"${t ? ` data-ring="${stepIdx}"` : ''}/>`;

    clockEl.replaceChildren(
      h(`div.ring${t?.done ? '.done' : ''}`, null, svg,
        h('div.ring-time', t ? { dataset: { time: stepIdx } } : null, t?.done ? 'Fertig' : mmss(t ? leftMs(t) : total))),
      h('div.clock-btns', null,
        h('button.round-btn', { type: 'button', disabled: !t || t.done, onclick: () => t && removeTimer(t) }, 'Abbrechen'),
        right));
  }

  function show() {
    counter.textContent = idx === 0 ? '' : `${idx}/${last}`;
    [...segments.children].forEach((seg, i) => seg.classList.toggle('on', i <= idx));
    prevBtn.disabled = idx === 0;
    nextBtn.replaceChildren(idx === last ? 'Fertig' : 'Weiter');
    clockEl = null;

    if (idx === 0) {
      body.replaceChildren(
        h('p.cook-kicker', null, 'Vorbereitung'),
        h('h2', null, 'Zutaten'),
        h('p.recipe-sub', null, `Für ${servings} ${servings === 1 ? 'Portion' : 'Portionen'} · zum Abhaken antippen`),
        h('div.group.cook-ings', null, r.ingredients.map((ing) =>
          h('div.row.ing-row', { onclick: (e) => e.currentTarget.classList.toggle('done') },
            h('span.check', null, icon('check')),
            h('span.ing-name', null, ing.name),
            h('span.ing-qty', null, ing.amount != null ? formatQty(ing.amount * factor, ing.unit) : '')))),
        wakeNote);
    } else {
      const step = pages[idx];
      if (step.timerMin) clockEl = h('div.clock');
      body.replaceChildren(...[
        h('p.cook-kicker', null, `Schritt ${idx}`),
        h('p.cook-text', null, step.text),
        clockEl,
      ].filter(Boolean));
      renderClock();
    }
    body.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function go(n) {
    idx = Math.min(last, Math.max(0, n));
    show();
  }

  // Fertig gekocht → fragen, was in Kühlschrank/Gefrierschrank kommt, dann zurück
  async function finish() {
    if (timers.some((t) => !t.done) && !(await confirmDialog('Es laufen noch Timer. Trotzdem beenden?', 'Beenden', true))) return;
    await storeSheet(r, servings);
    goBack(backTarget);
  }

  async function exit() {
    if (timers.some((t) => !t.done) && !(await confirmDialog('Es laufen noch Timer. Kochmodus trotzdem beenden?', 'Beenden', true))) return;
    goBack(backTarget);
  }

  /* ---------- Wischen & Pfeiltasten ---------- */
  let sx = 0;
  let sy = 0;
  body.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  body.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(idx + (dx < 0 ? 1 : -1));
  }, { passive: true });
  const onKey = (e) => {
    if (e.key === 'ArrowRight') go(idx + 1);
    if (e.key === 'ArrowLeft') go(idx - 1);
  };
  document.addEventListener('keydown', onKey);

  show();

  // Aufräumen beim Verlassen der Ansicht
  return () => {
    clearInterval(interval);
    stopAlarm();
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('cooking');
    wakeLock?.release().catch(() => {});
    audio?.close().catch(() => {});
  };
}
