// views/cloudBackup.js – automatisches Backup zu GitHub einrichten, Status sehen, wiederherstellen

import { getConfig, getStatus, connect, disconnect, runBackup, listVersions, restoreVersion } from '../cloud.js';
import { createSnapshot } from '../safety.js';
import { h, icon, navbar, toast, modal, confirmDialog } from '../ui.js';

const NEW_REPO_URL = 'https://github.com/new?name=kochbuch-backup&visibility=private';
const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

/** "vor 3 Min.", "vor 2 Std.", "am 24.10." */
export function relTime(ts) {
  if (!ts) return 'noch nie';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  if (min < 24 * 60) return `vor ${Math.round(min / 60)} Std.`;
  return `am ${new Date(ts).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}`;
}

const dateTime = (ts) => new Date(ts).toLocaleString('de-DE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export async function render(root) {
  const cfg = await getConfig();
  const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  const content = h('div.content');
  root.append(navbar({ title: 'Automatisches Backup', back: '#/mehr', large: true }), content);
  content.append(h('h1.large-title', null, 'Backup'));

  if (!cfg) renderSetup(content, rerender);
  else await renderConnected(content, cfg, rerender);

  // Status live aktualisieren, wenn im Hintergrund ein Backup läuft
  // (nicht, während ein Sheet offen ist – sonst würde es geschlossen)
  const onCloud = () => { if (cfg && !document.querySelector('.sheet-backdrop')) rerender(); };
  window.addEventListener('kochbuch:cloud', onCloud);
  return () => window.removeEventListener('kochbuch:cloud', onCloud);
}

/* ---------- Einrichtung ---------- */

function renderSetup(content, rerender) {
  const repoIn = h('input', { value: 'keezymt00/kochbuch-backup', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', 'aria-label': 'Repository' });
  const tokenIn = h('input', { type: 'password', placeholder: 'github_pat_…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Zugangsschlüssel' });
  const btn = h('button.btn.btn-primary.btn-block', { type: 'button', style: 'margin-top:20px', onclick: doConnect }, 'Verbinden');

  async function doConnect() {
    btn.disabled = true;
    btn.textContent = 'Wird geprüft …';
    try {
      const existing = await connect(repoIn.value, tokenIn.value);
      if (existing) {
        // Im Repo liegt schon ein Backup (z. B. neues iPhone) → fragen, statt es zu überschreiben
        const choice = await modal({
          title: 'Backup gefunden',
          body: `Im Repository liegt eine Sicherung vom ${dateTime(existing.date)}.`,
          actions: [
            { label: 'Diese Sicherung wiederherstellen', value: 'restore', kind: 'primary' },
            { label: 'Aktuelle Daten sichern', value: 'backup' },
          ],
        });
        if (choice === 'restore') await doRestore(existing.sha ?? (await listVersions(1))[0].sha);
        else await runBackup({ force: true });
      } else {
        await runBackup({ force: true });
      }
      toast('Automatisches Backup ist aktiv');
    } catch (err) {
      toast(err.message, 4000);
    }
    rerender();
  }

  const step = (n, title, ...body) => h('div.row.setup-step', { style: '--inset:54px' },
    h('span.num', null, String(n)),
    h('div.row-main', null, h('strong', null, title), h('div.row-sub', null, ...body)));

  content.append(
    h('p.footnote', { style: 'margin:-6px 4px 18px;font-size:15px' },
      'Deine Daten werden nach jeder Änderung automatisch in ein privates GitHub-Repository gesichert – mit Versionsverlauf. Einmalig einrichten, dann läuft es von selbst.'),

    h('div.group', null,
      step(1, 'Privates Repository anlegen',
        h('a', { href: NEW_REPO_URL, target: '_blank', rel: 'noopener' }, 'Auf GitHub öffnen'),
        ' – Name „kochbuch-backup“, ', h('strong', null, 'Private'), ' wählen, „Create repository“.'),
      step(2, 'Zugangsschlüssel erstellen',
        h('a', { href: NEW_TOKEN_URL, target: '_blank', rel: 'noopener' }, 'Auf GitHub öffnen'),
        ' – Name z. B. „Kochbuch-App“, Ablauf: 1 Jahr. ',
        'Repository access: ', h('strong', null, 'Only select repositories'), ' → kochbuch-backup. ',
        'Permissions → Repository permissions → ', h('strong', null, 'Contents: Read and write'), '. ',
        '„Generate token“ und den Schlüssel kopieren.'),
      step(3, 'Hier eintragen', 'Repository und Schlüssel einfügen und verbinden.')),

    h('div.section-header', null, h('h2', null, 'Verbindung')),
    h('div.group', null,
      h('label.row.field-row.wide', null, h('span', null, 'Repository'), repoIn),
      h('label.row.field-row.wide', null, h('span', null, 'Schlüssel'), tokenIn)),
    h('p.footnote', null, 'Der Schlüssel bleibt nur auf diesem Gerät und kann ausschließlich auf dieses eine Repository zugreifen. Er ist nicht Teil exportierter Backup-Dateien.'),
    btn,
  );
}

/* ---------- Verbunden ---------- */

async function doRestore(sha) {
  await createSnapshot('Vor Wiederherstellung aus GitHub');
  const { imported } = await restoreVersion(sha);
  toast(`${imported} Rezepte wiederhergestellt`);
}

async function renderConnected(content, cfg, rerender) {
  const status = await getStatus();
  const failing = status.lastError && (!status.lastSuccess || status.lastErrorAt > status.lastSuccess);
  const expiresSoon = cfg.tokenExpires && cfg.tokenExpires - Date.now() < 14 * 864e5;

  const backupNow = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const result = await runBackup({ force: true });
      toast(result === 'offline' ? 'Offline – wird später gesichert' : 'Gesichert');
    } catch (err) {
      toast(err.message, 4000);
    }
    rerender();
  };

  async function chooseVersion() {
    let versions;
    try {
      versions = await listVersions(30);
    } catch (err) {
      toast(err.message, 4000);
      return;
    }
    if (!versions.length) { toast('Noch keine Sicherung vorhanden'); return; }
    const sha = await modal({
      title: 'Version wiederherstellen',
      body: (close) => h('div', null,
        h('p', null, 'Der aktuelle Stand wird vorher als Sicherungspunkt gespeichert.'),
        h('div.group.pick-list', null, versions.map((v, i) => h('button.row', { type: 'button', onclick: () => close(v.sha) },
          h('span.row-main', null, dateTime(v.date),
            h('span.row-sub', null, `${i === 0 ? 'Neueste · ' : ''}${v.message.split(' · ')[1] || v.message}`)),
          h('span.chev', null, icon('chevron')))))),
      actions: [{ label: 'Abbrechen', value: null }],
    });
    if (!sha) return;
    if (!(await confirmDialog('Alle Rezepte, Pläne und Listen auf diesem Gerät werden durch diese Version ersetzt.', 'Wiederherstellen', true))) return;
    try {
      toast('Wird wiederhergestellt …', 10000);
      await doRestore(sha);
    } catch (err) {
      toast(err.message, 4000);
    }
    rerender();
  }

  async function doDisconnect() {
    if (!(await confirmDialog('Automatisches Backup ausschalten? Die Sicherungen in GitHub bleiben erhalten.', 'Ausschalten', true))) return;
    await disconnect();
    toast('Automatisches Backup ausgeschaltet');
    rerender();
  }

  content.append(
    h('div.group', null,
      h('div.row', { style: '--inset:58px' },
        h('span.app-icon', { style: `--c:${failing ? 'var(--red)' : 'var(--green)'}` }, icon(failing ? 'info' : 'check')),
        h('span.row-main', null, failing ? 'Backup fehlgeschlagen' : 'Automatisches Backup aktiv',
          h('span.row-sub', null, failing ? status.lastError : `Zuletzt gesichert ${relTime(status.lastSuccess)}`))),
      h('div.row', { style: '--inset:58px' },
        h('span.app-icon', { style: '--c:var(--gray)' }, icon('book')),
        h('span.row-main', null, 'Repository'),
        h('span.row-value', null, cfg.repo)),
      cfg.tokenExpires ? h('div.row', { style: '--inset:58px' },
        h('span.app-icon', { style: `--c:${expiresSoon ? 'var(--red)' : 'var(--gray)'}` }, icon('clock')),
        h('span.row-main', null, 'Schlüssel gültig bis'),
        h('span.row-value', null, new Date(cfg.tokenExpires).toLocaleDateString('de-DE'))) : null),
    h('p.footnote', null, expiresSoon
      ? 'Der Schlüssel läuft bald ab. Auf GitHub einen neuen erstellen, hier „Ausschalten“ und neu verbinden.'
      : 'Gesichert wird automatisch 30 Sekunden nach jeder Änderung und beim Verlassen der App. Ohne Internet wird es nachgeholt.'),

    h('div.group', { style: 'margin-top:24px' },
      h('button.row.action', { type: 'button', onclick: backupNow }, h('span.icon-tint', null, icon('share')), 'Jetzt sichern'),
      h('button.row.action', { type: 'button', onclick: chooseVersion }, h('span.icon-tint', null, icon('refresh')), 'Version wiederherstellen …')),

    h('div.group', { style: 'margin-top:24px' },
      h('a.row.action', { href: `https://github.com/${cfg.repo}/commits`, target: '_blank', rel: 'noopener' }, h('span.icon-tint', null, icon('clock')), 'Verlauf auf GitHub ansehen')),

    h('div.group', { style: 'margin-top:24px' },
      h('button.row.center.danger', { type: 'button', onclick: doDisconnect }, 'Automatisches Backup ausschalten')),
  );
}
