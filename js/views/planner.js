// views/planner.js – Kochplaner: die nächsten Kochtage mit je 1–2 Rezepten und Portionszahl

import { getAll } from '../db.js';
import {
  getDays, isoDate, dayLabel, shortDate, addDay, removeDay, addToDay, updateEntry, removeEntry,
  removePastDays, MAX_RECIPES_PER_DAY,
} from '../plan.js';
import { buildList } from '../shopping.js';
import { h, icon, glassBtn, largeTitle, toast, modal, confirmDialog, recipeImage, formatMinutes } from '../ui.js';
import { pickDay, pickRecipe } from './sheets.js';

export async function render(root) {
  const [allDays, recipes, { items }] = await Promise.all([getDays(), getAll('recipes'), buildList()]);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const today = isoDate();
  const days = allDays.filter((d) => d.id >= today);
  const pastCount = allDays.length - days.length;
  const openItems = items.filter((i) => !i.checked && !i.pantry).length;

  const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

  /* --- Aktionen --- */
  async function newDay() {
    const iso = await pickDay({ title: 'Neuer Kochtag', existingDays: days });
    if (!iso) return;
    await addDay(iso);
    // Gleich das erste Rezept wählen lassen
    const recipeId = await pickRecipe(recipes);
    if (recipeId) await addToDay(iso, recipeId, byId.get(recipeId).servings);
    rerender();
  }

  async function addRecipe(day) {
    const recipeId = await pickRecipe(recipes);
    if (!recipeId) return;
    try {
      await addToDay(day.id, recipeId, byId.get(recipeId).servings);
    } catch (err) {
      toast(err.message);
    }
    rerender();
  }

  async function deleteDay(day) {
    if (day.entries.length && !(await confirmDialog(`Kochtag „${dayLabel(day.id)}“ entfernen?`, 'Entfernen', true))) return;
    await removeDay(day.id);
    rerender();
  }

  async function entryMenu(day, entry, recipe) {
    const choice = await modal({
      title: recipe.title,
      body: `${dayLabel(day.id)} · ${entry.servings} Portionen`,
      actions: [
        { label: 'Rezept ansehen', value: 'open', kind: 'tinted' },
        { label: 'Kochmodus starten', value: 'cook', kind: 'tinted' },
        { label: 'Aus dem Plan entfernen', value: 'remove', kind: 'danger' },
        { label: 'Abbrechen', value: null },
      ],
    });
    if (choice === 'open') location.hash = `#/rezept/${recipe.id}?p=${entry.servings}`;
    if (choice === 'cook') location.hash = `#/kochen/${recipe.id}?p=${entry.servings}`;
    if (choice === 'remove') { await removeEntry(day.id, entry.id); rerender(); }
  }

  /* --- Zeile für ein geplantes Rezept mit Portions-Stepper --- */
  function entryRow(day, entry) {
    const recipe = byId.get(entry.recipeId);
    if (!recipe) {
      return h('div.row', null,
        h('span.row-main.muted', null, 'Gelöschtes Rezept'),
        h('button.btn.btn-sm.btn-danger', { type: 'button', onclick: async () => { await removeEntry(day.id, entry.id); rerender(); } }, 'Entfernen'));
    }
    const value = h('span.servings-value.rounded', null, String(entry.servings));
    const sub = h('span.row-sub');
    const setSub = () => { sub.textContent = [`${entry.servings} Portionen`, formatMinutes(recipe.timeMin)].filter(Boolean).join(' · '); };
    setSub();
    const change = async (delta) => {
      entry.servings = Math.min(40, Math.max(1, entry.servings + delta));
      value.textContent = String(entry.servings);
      minus.disabled = entry.servings <= 1;
      setSub();
      await updateEntry(day.id, entry.id, { servings: entry.servings });
      updateShoppingHint();
    };
    const minus = h('button', { type: 'button', 'aria-label': 'Weniger Portionen', disabled: entry.servings <= 1, onclick: () => change(-1) }, icon('minus'));
    return h('div.row.plan-entry', { style: '--inset:76px' },
      h('button.plan-entry-main', { type: 'button', onclick: () => entryMenu(day, entry, recipe) },
        recipeImage(recipe, 'thumb-sm'),
        h('span.row-main', null, h('span.plan-title', null, recipe.title), sub)),
      h('div.stepper.compact', null, minus, value,
        h('button', { type: 'button', 'aria-label': 'Mehr Portionen', onclick: () => change(1) }, icon('plus'))));
  }

  /* --- Einkaufslisten-Hinweis (aktualisiert sich bei Portionsänderung) --- */
  const shoppingValue = h('span.row-value', null, openItems ? `${openItems} Artikel` : '');
  async function updateShoppingHint() {
    const { items: fresh } = await buildList();
    const n = fresh.filter((i) => !i.checked && !i.pantry).length;
    shoppingValue.textContent = n ? `${n} Artikel` : '';
  }

  /* --- Aufbau --- */
  const [nav, head] = largeTitle('Planer', [glassBtn('calendarPlus', 'Kochtag hinzufügen', newDay)]);
  root.append(nav, head);
  // Nur echte Knoten anhängen – append(null) würde den Text "null" einfügen
  const add = (...nodes) => head.append(...nodes.flat().filter((n) => n != null && n !== false));

  if (!days.length) {
    add(h('div.empty', null,
      icon('calendar'),
      h('h3', null, 'Noch keine Kochtage'),
      h('p', null, 'Plane deine nächsten 2–3 Kochtage. Die Einkaufsliste entsteht automatisch.'),
      h('button.btn.btn-primary', { type: 'button', onclick: newDay }, 'Kochtag hinzufügen')));
  } else {
    const totalServings = days.reduce((s, d) => s + d.entries.reduce((x, e) => x + e.servings, 0), 0);
    add(
      h('p.footnote', { style: 'margin:-6px 4px 16px;font-size:15px' },
        `${days.length} ${days.length === 1 ? 'Kochtag' : 'Kochtage'} · ${totalServings} Portionen`),
      h('div.group', null,
        h('a.row', { href: '#/einkauf', style: '--inset:58px' },
          h('span.app-icon', { style: '--c:var(--green)' }, icon('bag')),
          h('span.row-main', null, 'Einkaufsliste'),
          shoppingValue,
          h('span.chev', null, icon('chevron')))),
    );

    for (const day of days) {
      add(
        h('div.section-header', null,
          h('h2', null, dayLabel(day.id)),
          h('span.aside', null, ['Heute', 'Morgen', 'Übermorgen'].includes(dayLabel(day.id)) ? shortDate(day.id) : ''),
          h('button.tool-btn', { type: 'button', 'aria-label': 'Kochtag entfernen', onclick: () => deleteDay(day), style: 'margin:-8px -8px -8px auto' }, icon('trash'))),
        h('div.group', null,
          day.entries.map((e) => entryRow(day, e)),
          day.entries.length < MAX_RECIPES_PER_DAY
            ? h('button.row.action', { type: 'button', onclick: () => addRecipe(day) },
              h('span.add-icon', null, icon('plusCircle')), day.entries.length ? 'Zweites Rezept' : 'Rezept hinzufügen')
            : null));
    }

    add(h('button.btn.btn-tinted.btn-block', { type: 'button', style: 'margin-top:28px', onclick: newDay }, icon('calendarPlus'), 'Kochtag hinzufügen'));
  }

  if (pastCount) {
    add(h('button.btn.btn-sm.btn-block', {
      type: 'button',
      style: 'margin-top:12px',
      onclick: async () => { await removePastDays(); toast('Vergangene Kochtage entfernt'); rerender(); },
    }, `${pastCount} vergangene${pastCount === 1 ? 'n Kochtag' : ' Kochtage'} entfernen`));
  }
}
