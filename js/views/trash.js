// views/trash.js – Papierkorb: gelöschte Rezepte 30 Tage lang wiederherstellen

import { listTrash, restoreFromTrash, deleteForever, emptyTrash, trashDaysLeft } from '../safety.js';
import { h, icon, navbar, toast, confirmDialog, recipeImage } from '../ui.js';

export async function render(root) {
  const items = await listTrash();
  const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

  const content = h('div.content', null, h('h1.large-title', null, 'Papierkorb'));
  root.append(navbar({ title: 'Papierkorb', back: '#/mehr', large: true }), content);

  if (!items.length) {
    content.append(h('div.empty', null,
      icon('trash'),
      h('h3', null, 'Papierkorb ist leer'),
      h('p', null, 'Gelöschte Rezepte bleiben hier 30 Tage, bevor sie endgültig verschwinden.')));
    return;
  }

  content.append(
    h('p.footnote', { style: 'margin:-6px 4px 16px;font-size:15px' }, 'Gelöschte Rezepte werden nach 30 Tagen endgültig entfernt. Mit ↻ wiederherstellen.'),
    h('div.group', null, items.map((t) => {
      const days = trashDaysLeft(t);
      return h('div.row', { style: '--inset:72px' },
        recipeImage(t.recipe, 'thumb-sm'),
        h('span.row-main', null, t.recipe.title,
          h('span.row-sub', null, days === 0 ? 'Wird heute endgültig gelöscht' : `Noch ${days} ${days === 1 ? 'Tag' : 'Tage'}`)),
        h('button.tool-btn.tinted', {
          type: 'button',
          'aria-label': `${t.recipe.title} wiederherstellen`,
          onclick: async () => {
            await restoreFromTrash(t.id);
            toast(`„${t.recipe.title}“ wiederhergestellt`);
            rerender();
          },
        }, icon('refresh')),
        h('button.tool-btn', {
          type: 'button',
          'aria-label': 'Endgültig löschen',
          onclick: async () => {
            if (!(await confirmDialog(`„${t.recipe.title}“ endgültig löschen? Das kann nicht rückgängig gemacht werden.`, 'Endgültig löschen', true))) return;
            await deleteForever(t.id);
            rerender();
          },
        }, icon('trash')));
    })),
    h('div.group', { style: 'margin-top:28px' },
      h('button.row.center.danger', {
        type: 'button',
        onclick: async () => {
          if (!(await confirmDialog(`Alle ${items.length} Rezepte im Papierkorb endgültig löschen?`, 'Papierkorb leeren', true))) return;
          await emptyTrash();
          rerender();
        },
      }, 'Papierkorb leeren')),
  );
}
