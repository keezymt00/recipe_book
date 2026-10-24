// views/snapshots.js – Sicherungspunkte auf dem Gerät ansehen und zurückspielen

import { listSnapshots, restoreSnapshot, createSnapshot } from '../safety.js';
import { h, icon, navbar, toast, confirmDialog } from '../ui.js';

const dateTime = (ts) => new Date(ts).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export async function render(root) {
  const snaps = await listSnapshots();
  const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

  const content = h('div.content', null,
    h('h1.large-title', null, 'Sicherungspunkte'),
    h('p.footnote', { style: 'margin:-6px 4px 16px;font-size:15px' },
      'Die App sichert einmal täglich und vor jedem Import automatisch den kompletten Stand auf diesem Gerät. Fotos bleiben beim Zurückspielen erhalten.'));
  root.append(navbar({ title: 'Sicherungspunkte', back: '#/mehr', large: true }), content);

  if (snaps.length) {
    content.append(h('div.group', null, snaps.map((s) => h('button.row', {
      type: 'button',
      style: '--inset:58px',
      onclick: async () => {
        if (!(await confirmDialog(`Stand von ${dateTime(s.id)} wiederherstellen? Der aktuelle Stand wird vorher selbst als Sicherungspunkt gespeichert.`, 'Wiederherstellen', true))) return;
        try {
          const { imported } = await restoreSnapshot(s.id);
          toast(`${imported} Rezepte wiederhergestellt`);
        } catch (err) {
          toast(err.message, 4000);
        }
        rerender();
      },
    },
    h('span.app-icon', { style: `--c:${s.reason === 'Täglich' ? 'var(--gray)' : s.reason.startsWith('Manuell') ? 'var(--blue)' : 'var(--tint)'}` }, icon('clock')),
    h('span.row-main', null, dateTime(s.id), h('span.row-sub', null, `${s.reason} · ${s.recipes} Rezepte`)),
    h('span.chev', null, icon('chevron'))))));
  } else {
    content.append(h('div.empty', null, icon('clock'), h('h3', null, 'Noch keine Sicherungspunkte'), h('p', null, 'Der erste entsteht automatisch beim nächsten Start.')));
  }

  content.append(h('button.btn.btn-tinted.btn-block', {
    type: 'button',
    style: 'margin-top:24px',
    onclick: async () => {
      await createSnapshot('Manuell');
      toast('Sicherungspunkt erstellt');
      rerender();
    },
  }, icon('plus'), 'Jetzt Sicherungspunkt erstellen'));
}
