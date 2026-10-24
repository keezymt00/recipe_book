// views/shopping.js – Einkaufsliste: nach Supermarktbereich gruppiert, offline abhakbar

import { AISLES } from '../aisles.js';
import { shortDate } from '../plan.js';
import {
  buildList, groupByAisle, setChecked, addCustom, removeCustom, setPantry, setAisle,
  resetChecks, clearCustom, listText,
} from '../shopping.js';
import { h, icon, glassBtn, largeTitle, toast, modal, confirmDialog } from '../ui.js';
import { state } from '../state.js';

export async function render(root) {
  const { items, days } = await buildList();
  const ui = state.shopping || (state.shopping = { showDone: true, showPantry: false });

  const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  const open = items.filter((i) => !i.checked && !i.pantry);
  const done = items.filter((i) => i.checked && !i.pantry);
  const pantry = items.filter((i) => i.pantry);
  const total = open.length + done.length;

  /* --- Teilen / Kopieren --- */
  async function share() {
    const text = listText(items, days);
    if (navigator.share) {
      try { await navigator.share({ title: 'Einkaufsliste', text }); return; } catch (err) { if (err.name === 'AbortError') return; }
    }
    copy(text);
  }
  async function copy(text = listText(items, days)) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Liste kopiert');
    } catch {
      toast('Kopieren nicht möglich');
    }
  }

  async function menu() {
    const choice = await modal({
      title: 'Einkaufsliste',
      actions: [
        { label: 'Als Text kopieren', value: 'copy', kind: 'tinted' },
        { label: 'Alle Häkchen entfernen', value: 'reset' },
        { label: 'Eigene Artikel löschen', value: 'custom', kind: 'danger' },
        { label: 'Abbrechen', value: null },
      ],
    });
    if (choice === 'copy') copy();
    if (choice === 'reset') { await resetChecks(); rerender(); }
    if (choice === 'custom' && await confirmDialog('Alle selbst hinzugefügten Artikel löschen?', 'Löschen', true)) { await clearCustom(); rerender(); }
  }

  /* --- Optionen pro Artikel: Bereich, Vorrat, Entfernen --- */
  async function itemOptions(item) {
    const choice = await modal({
      title: item.name,
      body: (close) => h('div', null,
        item.sources.length ? h('p', null, `Für: ${item.sources.join(', ')}`) : null,
        h('p.sheet-label', null, 'Bereich im Supermarkt'),
        h('div.group', null, AISLES.map((a) => h('button.row', { type: 'button', onclick: () => close({ aisle: a.id }) },
          h('span.row-main', null, a.label),
          a.id === item.aisle ? h('span.icon-tint', null, icon('check')) : null)))),
      actions: [
        item.custom ? null : item.pantry
          ? { label: 'Wieder einkaufen', value: 'unpantry', kind: 'tinted' }
          : { label: 'Habe ich immer im Vorrat', value: 'pantry', kind: 'tinted' },
        item.custom ? { label: 'Artikel löschen', value: 'delete', kind: 'danger' } : null,
        { label: 'Fertig', value: null },
      ].filter(Boolean),
    });
    if (!choice) return;
    if (choice.aisle && choice.aisle !== item.aisle) await setAisle(item, choice.aisle);
    if (choice === 'pantry') { await setPantry(item, true); toast(`„${item.name}“ wird künftig ausgeblendet`); }
    if (choice === 'unpantry') await setPantry(item, false);
    if (choice === 'delete') await removeCustom(item);
    rerender();
  }

  // "Teriyaki-Hähnchen mit Reis und Brokkoli" → "Teriyaki-Hähnchen" (kompakter Hinweis unter dem Artikel)
  const shortTitle = (t) => t.split(/ mit | \(/)[0];

  /* --- Zeile: Kreis abhaken, Menge rechts, (i) für Optionen --- */
  function itemRow(item) {
    const row = h(`div.row.ing-row.shop-item${item.checked ? '.done' : ''}${item.pantry ? '.muted-row' : ''}`, {
      onclick: async () => {
        if (item.pantry) return itemOptions(item);
        item.checked = !item.checked;
        row.classList.toggle('done', item.checked); // sofortiges Feedback, dann neu sortieren
        await setChecked(item, item.checked);
        setTimeout(rerender, 350);
      },
    },
      h('span.check', null, icon('check')),
      h('span.ing-name', null, item.name,
        item.sources.length ? h('span.row-sub', null, item.sources.map(shortTitle).join(' · ')) : item.custom ? h('span.row-sub', null, 'Eigener Artikel') : null),
      h('span.ing-qty', null, item.qtyText || (item.custom ? '' : 'nach Bedarf')),
      h('button.tool-btn.info-btn', {
        type: 'button',
        'aria-label': `Optionen für ${item.name}`,
        onclick: (e) => { e.stopPropagation(); itemOptions(item); },
      }, icon('info')));
    return row;
  }

  /* --- Eigene Artikel hinzufügen ("2 l Milch") --- */
  const addInput = h('input', {
    placeholder: 'Artikel hinzufügen',
    enterkeyhint: 'done',
    'aria-label': 'Eigenen Artikel hinzufügen',
    onkeydown: async (e) => {
      if (e.key !== 'Enter' || !addInput.value.trim()) return;
      e.preventDefault();
      await addCustom(addInput.value.trim());
      state.shoppingRefocus = true;
      rerender();
    },
  });

  /* --- Aufbau --- */
  const [nav, head] = largeTitle('Einkauf', [
    glassBtn('share', 'Liste teilen', share),
    glassBtn('ellipsis', 'Weitere Aktionen', menu),
  ]);
  root.append(nav, head);
  // Nur echte Knoten anhängen – append(null) würde den Text "null" einfügen
  const add = (...nodes) => head.append(...nodes.flat().filter((n) => n != null && n !== false));

  const range = days.length
    ? `${shortDate(days[0].id)}${days.length > 1 ? ` – ${shortDate(days[days.length - 1].id)}` : ''}`
    : '';

  if (total) {
    add(
      h('p.footnote', { style: 'margin:-6px 4px 10px;font-size:15px' },
        `${done.length} von ${total} erledigt${range ? ` · ${days.length} ${days.length === 1 ? 'Kochtag' : 'Kochtage'} (${range})` : ''}`),
      h('div.progress-line', null, h('div', { style: `width:${total ? (done.length / total) * 100 : 0}%` })));
  }

  add(h('div.group', { style: 'margin-top:16px' },
    h('label.row', null, h('span.add-icon', null, icon('plusCircle')), addInput)));

  if (!items.length) {
    add(h('div.empty', null,
      icon('bag'),
      h('h3', null, 'Liste ist leer'),
      h('p', null, 'Plane Kochtage im Planer – die Zutaten landen automatisch hier.'),
      h('a.btn.btn-primary', { href: '#/planer' }, 'Zum Planer')));
  } else if (!open.length && done.length) {
    add(h('div.empty', { style: 'padding:40px 24px 10px' },
      icon('check'),
      h('h3', null, 'Alles erledigt'),
      h('p', null, 'Viel Spaß beim Kochen!')));
  }

  // Offene Artikel nach Bereich
  for (const group of groupByAisle(open)) {
    add(
      h('div.section-header', null, h('h2', null, group.label), h('span.aside', null, String(group.items.length))),
      h('div.group', null, group.items.map(itemRow)));
  }

  // Erledigt (im Wagen)
  if (done.length) {
    add(
      h('div.section-header', null,
        h('h2', null, 'Im Wagen'),
        h('button.link-btn', { type: 'button', onclick: () => { ui.showDone = !ui.showDone; rerender(); } }, ui.showDone ? 'Ausblenden' : `Anzeigen (${done.length})`)),
      ui.showDone ? h('div.group', null, done.map(itemRow)) : null);
  }

  // Vorrat
  if (pantry.length) {
    add(
      h('div.section-header', null,
        h('h2', null, 'Vorrat'),
        h('button.link-btn', { type: 'button', onclick: () => { ui.showPantry = !ui.showPantry; rerender(); } }, ui.showPantry ? 'Ausblenden' : `Anzeigen (${pantry.length})`)),
      ui.showPantry
        ? h('div.group', null, pantry.map(itemRow))
        : null,
      h('p.footnote', null, ui.showPantry
        ? 'Diese Artikel hast du immer zu Hause. Antippen, um sie wieder einzukaufen.'
        : `${pantry.length} Artikel, die du immer zu Hause hast, sind ausgeblendet.`));
  }

  return {
    mounted: () => {
      if (state.shoppingRefocus) { state.shoppingRefocus = false; addInput.focus(); }
    },
  };
}
