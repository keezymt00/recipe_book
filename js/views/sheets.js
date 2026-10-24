// views/sheets.js – wiederverwendbare Auswahl-Sheets für Planer und Rezeptansicht

import { fold } from '../aisles.js';
import { isoDate, addDays, dayLabel, shortDate, MAX_RECIPES_PER_DAY } from '../plan.js';
import { h, icon, modal, recipeImage, formatMinutes } from '../ui.js';

/**
 * Kochtag wählen. existingDays: kommende Kochtage; mit includeExisting werden Tage mit
 * freiem Platz zur Auswahl angeboten. Liefert ein Datum (JJJJ-MM-TT) oder null.
 */
export function pickDay({ title = 'Kochtag wählen', existingDays = [], includeExisting = false } = {}) {
  const taken = new Set(existingDays.map((d) => d.id));
  const today = isoDate();
  const free = [];
  for (let i = 0; free.length < 8 && i < 30; i++) {
    const iso = addDays(today, i);
    if (!taken.has(iso)) free.push(iso);
  }
  const withRoom = includeExisting ? existingDays.filter((d) => d.entries.length < MAX_RECIPES_PER_DAY) : [];

  return modal({
    title,
    body: (close) => h('div', null,
      withRoom.length ? [
        h('p.sheet-label', null, 'Geplante Kochtage'),
        h('div.group', null, withRoom.map((d) => h('button.row', { type: 'button', onclick: () => close(d.id) },
          h('span.app-icon', { style: '--c:var(--tint)' }, icon('calendar')),
          h('span.row-main', null, dayLabel(d.id),
            h('span.row-sub', null, `${shortDate(d.id)} · ${d.entries.length} ${d.entries.length === 1 ? 'Rezept' : 'Rezepte'}`)),
          h('span.chev', null, icon('chevron'))))),
        h('p.sheet-label', null, 'Neuer Kochtag'),
      ] : null,
      h('div.pills.wrap.center', null, free.map((iso) =>
        h('button.pill', { type: 'button', onclick: () => close(iso) }, iso === today ? 'Heute' : iso === addDays(today, 1) ? 'Morgen' : shortDate(iso)))),
      h('label.row.date-row', null,
        h('span.row-main', null, 'Anderes Datum'),
        h('input', {
          type: 'date',
          min: today,
          'aria-label': 'Anderes Datum',
          onchange: (e) => { if (e.target.value && e.target.value >= today) close(e.target.value); },
        }))),
    actions: [{ label: 'Abbrechen', value: null }],
  });
}

/** Rezept aus der Sammlung wählen (Favoriten zuerst, mit Suche). Liefert die Rezept-ID oder null. */
export function pickRecipe(recipes) {
  const sorted = [...recipes].sort((a, b) => (b.favorite - a.favorite) || a.title.localeCompare(b.title, 'de'));
  return modal({
    title: 'Rezept wählen',
    body: (close) => {
      const list = h('div.group.pick-list');
      const render = (q = '') => {
        const terms = fold(q).split(/\s+/).filter(Boolean);
        const shown = sorted.filter((r) => terms.every((t) => fold(`${r.title} ${r.tags.join(' ')}`).includes(t)));
        list.replaceChildren(...(shown.length ? shown.map((r) =>
          h('button.row', { type: 'button', style: '--inset:72px', onclick: () => close(r.id) },
            recipeImage(r, 'thumb-sm'),
            h('span.row-main', null, r.title,
              h('span.row-sub', null, [r.favorite ? '♥ Favorit' : null, formatMinutes(r.timeMin), `${r.servings} Portionen`].filter(Boolean).join(' · '))))) : [h('div.row', null, h('span.row-sub', null, 'Keine Treffer'))]));
      };
      render();
      return h('div', null,
        h('label.search', { style: 'margin:6px 0 12px' }, icon('search'),
          h('input', { type: 'search', placeholder: 'Suchen', autocomplete: 'off', oninput: (e) => render(e.target.value) })),
        list);
    },
    actions: [{ label: 'Abbrechen', value: null }],
  });
}
