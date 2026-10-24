// views/fridge.js – Meal-Prep-Kühlschrank: Übersicht, "versorgt bis …", Einlagern-Sheet

import { get, getAll } from '../db.js';
import {
  listFridge, store, setPortions, remove, freeze, thaw, shiftExpiry, freshness, shelfDays,
  coverage, getMealsPerDay, setMealsPerDay, FREEZER_DAYS,
} from '../fridge.js';
import { upcomingDays, addDay, addToDay, isoDate, addDays, shortDate, dayLabel } from '../plan.js';
import { formatNumber } from '../units.js';
import { h, icon, glassBtn, navbar, toast, modal, confirmDialog, recipeImage } from '../ui.js';
import { pickRecipe } from './sheets.js';

const LEVEL_COLOR = { ok: 'var(--green)', soon: 'var(--tint)', today: 'var(--red)', expired: 'var(--red)' };
const portionText = (n) => `${formatNumber(n)} ${n === 1 ? 'Portion' : 'Portionen'}`;
// "Heute"/"Morgen" mitten im Satz klein: "Versorgt bis morgen"
const inSentence = (iso) => { const l = dayLabel(iso); return ['Heute', 'Morgen', 'Übermorgen'].includes(l) ? l.toLowerCase() : l; };

/**
 * Sheet "Ab in den Kühlschrank?" – nach dem Kochen oder beim manuellen Hinzufügen.
 * Liefert den neuen Eintrag oder null.
 */
export async function storeSheet(recipe, cookedPortions, { title = 'Guten Appetit!' } = {}) {
  let portions = Math.max(1, cookedPortions);
  let location = 'fridge';
  let days = shelfDays(recipe);

  const result = await modal({
    title,
    body: () => {
      const portionsOut = h('span.servings-value.rounded');
      const daysOut = h('span.row-sub');
      const minus = h('button', { type: 'button', 'aria-label': 'Weniger Portionen', onclick: () => setP(portions - 1) }, icon('minus'));
      const dMinus = h('button', { type: 'button', 'aria-label': 'Kürzer haltbar', onclick: () => setD(days - 1) }, icon('minus'));
      const daysRow = h('div.row', null, h('span.row-main', null, 'Haltbar', daysOut), h('div.stepper.compact', null, dMinus,
        h('button', { type: 'button', 'aria-label': 'Länger haltbar', onclick: () => setD(days + 1) }, icon('plus'))));
      const seg = (value, label) => h(`button.seg${location === value ? '.on' : ''}`, {
        type: 'button',
        onclick: (e) => {
          location = value;
          e.currentTarget.parentNode.querySelectorAll('.seg').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
          daysRow.hidden = location === 'freezer';
          setD(days);
        },
      }, label);
      function setP(n) { portions = Math.min(99, Math.max(1, n)); portionsOut.textContent = String(portions); minus.disabled = portions <= 1; }
      function setD(n) {
        days = Math.min(14, Math.max(1, n));
        dMinus.disabled = days <= 1;
        const until = addDays(isoDate(), location === 'freezer' ? FREEZER_DAYS : days);
        daysOut.textContent = location === 'freezer' ? '' : `${days} Tage · bis ${shortDate(until)}`;
      }
      setP(portions);
      setD(days);
      return h('div', null,
        h('p', null, `${recipe.title} – wie viel kommt in den Vorrat?`),
        h('div.segmented', { style: 'margin:14px 0' }, seg('fridge', 'Kühlschrank'), seg('freezer', 'Gefrierschrank')),
        h('div.group', null,
          h('div.row', null, h('span.row-main', null, 'Portionen'),
            h('div.stepper.compact', null, minus, portionsOut,
              h('button', { type: 'button', 'aria-label': 'Mehr Portionen', onclick: () => setP(portions + 1) }, icon('plus')))),
          daysRow));
    },
    actions: [
      { label: 'Einlagern', value: () => ({ portions, location, days }), kind: 'primary' },
      { label: 'Nichts aufbewahren', value: null },
    ],
  });
  if (!result) return null;
  const entry = await store({ recipe, ...result });
  toast(`${portionText(entry.portions)} ${entry.location === 'freezer' ? 'eingefroren' : 'im Kühlschrank'}`);
  return entry;
}

/** Kompakte Zusammenfassung für den Planer: "Versorgt bis …" + Lücken-Warnung */
export async function coverageRows({ onPlanGap } = {}) {
  const [entries, meals, days] = await Promise.all([listFridge(), getMealsPerDay(), upcomingDays()]);
  if (!entries.length) return null;
  const cov = coverage(entries, meals);
  const nextCook = days.find((d) => d.entries.length)?.id;
  const frozen = entries.filter((e) => e.location === 'freezer').reduce((s, e) => s + e.portions, 0);

  const rows = [h('a.row', { href: '#/kuehlschrank', style: '--inset:58px' },
    h('span.app-icon', { style: `--c:${cov.days ? 'var(--blue)' : 'var(--gray)'}` }, icon('fridge')),
    h('span.row-main', null,
      cov.until ? `Versorgt bis ${inSentence(cov.until)}` : 'Kühlschrank reicht nicht für heute',
      h('span.row-sub', null, [cov.portions ? `${portionText(cov.portions)} im Kühlschrank` : null, frozen ? `${formatNumber(frozen)} eingefroren` : null].filter(Boolean).join(' · ') || 'Kühlschrank leer')),
    h('span.chev', null, icon('chevron')))];

  // Lücke: Essen reicht nicht bis zum nächsten Kochtag (oder es ist keiner geplant)
  if (!nextCook || nextCook > cov.gapFrom) {
    rows.push(h('button.row.action', { type: 'button', style: '--inset:58px', onclick: () => onPlanGap?.(cov.gapFrom) },
      h('span.app-icon', { style: '--c:var(--tint)' }, icon('calendarPlus')),
      h('span.row-main', null, `Ab ${inSentence(cov.gapFrom)} fehlt Essen`,
        h('span.row-sub', null, nextCook ? `Nächster Kochtag erst ${shortDate(nextCook)} – Kochtag planen` : 'Kochtag planen'))));
  }
  return h('div.group', null, rows);
}

/* ---------- Seite ---------- */

export async function render(root) {
  const [entries, meals, recipes] = await Promise.all([listFridge(), getMealsPerDay(), getAll('recipes')]);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  const fridge = entries.filter((e) => e.location === 'fridge');
  const freezer = entries.filter((e) => e.location === 'freezer');
  const cov = coverage(entries, meals);

  async function addManual() {
    const id = await pickRecipe(recipes);
    if (!id) return;
    await new Promise((r) => setTimeout(r, 350));
    const recipe = byId.get(id);
    if (await storeSheet(recipe, recipe.servings, { title: 'Einlagern' })) rerender();
  }

  async function options(entry) {
    const recipe = byId.get(entry.recipeId);
    const isFrozen = entry.location === 'freezer';
    const choice = await modal({
      title: entry.title,
      body: `${portionText(entry.portions)} · ${freshness(entry).text}`,
      actions: [
        { label: 'Eine Portion gegessen', value: 'eat', kind: 'primary' },
        isFrozen ? { label: 'Auftauen (in den Kühlschrank)', value: 'thaw', kind: 'tinted' } : { label: 'Einfrieren', value: 'freeze', kind: 'tinted' },
        isFrozen ? null : { label: 'Einen Tag länger haltbar', value: 'later' },
        recipe ? { label: 'Rezept ansehen', value: 'open' } : null,
        { label: 'Entfernen', value: 'remove', kind: 'danger' },
        { label: 'Abbrechen', value: null },
      ].filter(Boolean),
    });
    if (choice === 'eat') await eat(entry);
    if (choice === 'freeze') { await freeze(entry.id); toast('Eingefroren – 3 Monate haltbar'); }
    if (choice === 'thaw') { await thaw(entry.id); toast('Aufgetaut – innerhalb von 2 Tagen essen'); }
    if (choice === 'later') await shiftExpiry(entry.id, 1);
    if (choice === 'open') { location.hash = `#/rezept/${recipe.id}`; return; }
    if (choice === 'remove' && await confirmDialog(`„${entry.title}“ aus dem Vorrat entfernen?`, 'Entfernen', true)) await remove(entry.id);
    rerender();
  }

  async function eat(entry) {
    const next = await setPortions(entry.id, entry.portions - 1);
    toast(next ? `Guten Appetit! Noch ${portionText(next.portions)}` : `${entry.title} ist aufgegessen`);
  }

  function entryRow(entry) {
    const recipe = byId.get(entry.recipeId) || { title: entry.title, tags: [], photo: null };
    const fresh = freshness(entry);
    const value = h('span.servings-value.rounded', null, formatNumber(entry.portions));
    return h('div.row.plan-entry', { style: '--inset:76px' },
      h('button.plan-entry-main', { type: 'button', onclick: () => options(entry) },
        recipeImage(recipe, 'thumb-sm'),
        h('span.row-main', null, h('span.plan-title', null, entry.title),
          h('span.row-sub', { style: `color:${LEVEL_COLOR[fresh.level]}` }, fresh.text))),
      h('div.stepper.compact', null,
        h('button', { type: 'button', 'aria-label': 'Portion gegessen', onclick: async () => { await eat(entry); rerender(); } }, icon('minus')),
        value,
        h('button', { type: 'button', 'aria-label': 'Portion mehr', onclick: async () => { await setPortions(entry.id, entry.portions + 1); rerender(); } }, icon('plus'))));
  }

  const mealsOut = h('span.servings-value.rounded', null, String(meals));
  const content = h('div.content', null, h('h1.large-title', null, 'Kühlschrank'));
  root.append(
    navbar({ title: 'Kühlschrank', back: '#/planer', large: true, actions: [glassBtn('plus', 'Portionen einlagern', addManual)] }),
    content);

  content.append(
    h('div.stats', { style: 'margin-bottom:8px' },
      h('div.stat', null, h('div.stat-label', null, 'Versorgt'), h('div.stat-value', null, String(cov.days)), h('div.stat-unit', null, cov.days === 1 ? 'Tag' : 'Tage')),
      h('div.stat', null, h('div.stat-label', null, 'Kühlschrank'), h('div.stat-value', null, formatNumber(cov.portions)), h('div.stat-unit', null, 'Portionen')),
      h('div.stat', null, h('div.stat-label', null, 'Gefroren'), h('div.stat-value', null, formatNumber(freezer.reduce((s, e) => s + e.portions, 0))), h('div.stat-unit', null, 'Portionen'))),
    h('p.footnote', null, cov.until
      ? `Reicht bis einschließlich ${inSentence(cov.until)} (${shortDate(cov.until)}) – zuerst wird gegessen, was am frühesten abläuft.`
      : 'Für heute ist nicht genug im Kühlschrank.'),
    h('div.group', { style: 'margin-top:14px' },
      h('div.row', null, h('span.row-main', null, 'Meal-Prep-Mahlzeiten pro Tag'),
        h('div.stepper.compact', null,
          h('button', { type: 'button', 'aria-label': 'Weniger', disabled: meals <= 1, onclick: async () => { await setMealsPerDay(meals - 1); rerender(); } }, icon('minus')),
          mealsOut,
          h('button', { type: 'button', 'aria-label': 'Mehr', onclick: async () => { await setMealsPerDay(meals + 1); rerender(); } }, icon('plus'))))),
  );

  if (!entries.length) {
    content.append(h('div.empty', null,
      icon('fridge'),
      h('h3', null, 'Kühlschrank ist leer'),
      h('p', null, 'Nach dem Kochmodus fragt die App, wie viele Portionen du aufbewahrst. Oder trag sie hier selbst ein.'),
      h('button.btn.btn-primary', { type: 'button', onclick: addManual }, 'Portionen einlagern')));
    return;
  }

  if (fridge.length) content.append(h('div.section-header', null, h('h2', null, 'Kühlschrank')), h('div.group', null, fridge.map(entryRow)));
  if (freezer.length) content.append(h('div.section-header', null, h('h2', null, 'Gefrierschrank')), h('div.group', null, freezer.map(entryRow)));
  content.append(h('p.footnote', null, 'Antippen für Optionen: gegessen, einfrieren, auftauen, Haltbarkeit.'));
}

/** Lücke im Planer schließen: Kochtag am Lückentag anlegen und Rezept wählen */
export async function planGap(iso) {
  const recipes = await getAll('recipes');
  await addDay(iso);
  const id = await pickRecipe(recipes);
  if (id) await addToDay(iso, id, (await get('recipes', id)).servings);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
