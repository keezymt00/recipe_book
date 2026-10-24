// views/pantry.js – Vorrat verwalten: Artikel, die man immer zu Hause hat,
// tauchen nie auf der Einkaufsliste auf.

import { getPantry, addPantryItem, removePantryItem, nameKey } from '../shopping.js';
import { h, icon, navbar, toast } from '../ui.js';
import { state } from '../state.js';

// Typische Vorrats-Artikel als Vorschläge (Antippen = hinzufügen)
const SUGGESTIONS = [
  'Olivenöl', 'Sonnenblumenöl', 'Salz', 'Pfeffer', 'Zucker', 'Mehl', 'Reis', 'Sojasauce', 'Essig', 'Honig',
  'Paprikapulver edelsüß', 'Paprikapulver geräuchert', 'Oregano', 'Kreuzkümmel', 'Knoblauchpulver',
  'Chiliflocken', 'Currypulver', 'Speisestärke', 'Tomatenmark', 'Lorbeerblätter',
];

export async function render(root) {
  const items = await getPantry();
  const have = new Set(items.map((i) => i.name));
  const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

  const input = h('input', {
    placeholder: 'Artikel hinzufügen',
    enterkeyhint: 'done',
    autocapitalize: 'sentences',
    'aria-label': 'Vorrat-Artikel hinzufügen',
    onkeydown: async (e) => {
      if (e.key !== 'Enter' || !input.value.trim()) return;
      e.preventDefault();
      // Mehrere auf einmal: "Reis, Nudeln, Mehl"
      for (const part of input.value.split(',')) await addPantryItem(part);
      state.pantryRefocus = true;
      rerender();
    },
  });

  const suggestions = SUGGESTIONS.filter((s) => !have.has(nameKey(s)));

  root.append(
    navbar({ title: 'Vorrat', back: '#/mehr', large: true }),
    h('div.content', null,
      h('h1.large-title', null, 'Vorrat'),
      h('p.footnote', { style: 'margin:-6px 4px 16px;font-size:15px' },
        'Was du immer zu Hause hast, wird auf der Einkaufsliste automatisch ausgeblendet.'),

      h('div.group', null,
        h('label.row', null, h('span.add-icon', null, icon('plusCircle')), input),
        items.map((item) => h('div.row', { style: '--inset:51px' },
          h('button.remove-btn', {
            type: 'button',
            'aria-label': `${item.label} entfernen`,
            onclick: async () => { await removePantryItem(item.name); toast(`„${item.label}“ entfernt`); rerender(); },
          }, icon('minusCircle')),
          h('span.row-main', null, item.label)))),
      h('p.footnote', null, items.length
        ? `${items.length} Artikel im Vorrat. Mehrere auf einmal mit Komma trennen.`
        : 'Noch nichts im Vorrat.'),

      suggestions.length ? [
        h('div.section-header', null, h('h2', null, 'Vorschläge')),
        h('div.pills.wrap', null, suggestions.map((s) => h('button.pill', {
          type: 'button',
          onclick: async () => { await addPantryItem(s); rerender(); },
        }, `+ ${s}`))),
      ] : null,
    ),
  );

  return {
    mounted: () => {
      if (state.pantryRefocus) { state.pantryRefocus = false; input.focus(); }
    },
  };
}
