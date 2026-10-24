// views/more.js – Datensicherung, Sicherheitsnetz, Speicherinfo – im Stil der iOS-Einstellungen

import { getAll, getMeta, putMany } from '../db.js';
import { getPantry } from '../shopping.js';
import { APP_VERSION } from '../version.js';
import { createBackupFile, shareFile, downloadFile, canShareFiles, importBackup } from '../backup.js';
import { seedRecipes } from '../seed.js';
import { getConfig, getStatus } from '../cloud.js';
import { createSnapshot, listTrash, listSnapshots } from '../safety.js';
import { h, icon, largeTitle, toast, modal } from '../ui.js';
import { relTime } from './cloudBackup.js';

export async function render(root) {
  const recipes = await getAll('recipes');
  const lastBackup = await getMeta('lastBackup', 0);
  const pantryCount = (await getPantry()).length;
  const [cloud, cloudStatus, trash, snapshots] = await Promise.all([getConfig(), getStatus(), listTrash(), listSnapshots()]);
  const cloudFailing = cloud && cloudStatus.lastError && (!cloudStatus.lastSuccess || cloudStatus.lastErrorAt > cloudStatus.lastSuccess);

  /* --- Export --- */
  async function exportData() {
    let file;
    try {
      file = await createBackupFile();
    } catch (err) {
      toast(`Export fehlgeschlagen: ${err.message}`);
      return;
    }
    const sizeKB = Math.max(1, Math.round(file.size / 1024));
    // Zweiter Schritt im Sheet: navigator.share braucht einen "frischen" Tipp des Nutzers
    const done = await modal({
      title: 'Backup bereit',
      body: `${file.name} · ${sizeKB} KB\nAm besten in „Dateien“ → iCloud Drive sichern.`,
      actions: [
        canShareFiles(file) ? { label: 'In Dateien sichern …', value: () => shareFile(file), kind: 'primary' } : null,
        { label: 'Herunterladen', value: () => { downloadFile(file); return true; }, kind: canShareFiles(file) ? null : 'primary' },
        { label: 'Abbrechen', value: false },
      ].filter(Boolean),
    });
    if (await done) { toast('Backup gesichert'); rerender(); }
  }

  /* --- Import --- */
  const fileIn = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const mode = await modal({
        title: 'Backup importieren',
        body: 'Mit den vorhandenen Rezepten zusammenführen oder alles ersetzen?',
        actions: [
          { label: 'Zusammenführen', value: 'merge', kind: 'primary' },
          { label: 'Alles ersetzen', value: 'replace', kind: 'danger' },
          { label: 'Abbrechen', value: null },
        ],
      });
      if (!mode) return;
      try {
        await createSnapshot('Vor Import'); // Import lässt sich so jederzeit rückgängig machen
        const { imported, skipped } = await importBackup(file, mode);
        toast(`${imported} Rezepte importiert${skipped ? ` · ${skipped} fehlerhafte übersprungen` : ''}`, 3500);
        rerender();
      } catch (err) {
        toast(err.message, 3500);
      }
    },
  });

  /* --- Beispielrezepte (nur fehlende wieder hinzufügen) --- */
  async function restoreSeeds() {
    const existing = new Set(recipes.map((r) => r.id));
    const missing = seedRecipes().filter((r) => !existing.has(r.id));
    if (!missing.length) { toast('Alle Beispielrezepte sind schon da'); return; }
    await putMany('recipes', missing);
    toast(`${missing.length} Beispielrezepte hinzugefügt`);
    rerender();
  }

  // Ansicht neu zeichnen (z. B. nach Import) – einfach die Route erneut auslösen
  const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

  /* --- Speicherinfo --- */
  const storageValue = h('span.row-value', null, '…');
  const persistNote = h('p.footnote');
  (async () => {
    const est = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    storageValue.textContent = est ? `${(est.usage / 1048576).toFixed(1).replace('.', ',')} MB` : '–';
    persistNote.textContent = cloud
      ? 'Deine Daten werden automatisch in dein privates GitHub-Repository gesichert. Die Datei-Sicherung ist zusätzlich jederzeit möglich.'
      : `${persisted ? '' : 'iOS kann Daten von Web-Apps bei Speichermangel löschen. '}Richte das automatische Backup ein, dann geht nichts verloren – auch nicht bei einem neuen iPhone.`;
  })();

  // Zeile im Einstellungs-Stil: farbige Symbol-Kachel, Text, Wert/Chevron
  const row = ({ iconName, color, label, value, onclick }) =>
    h(onclick ? 'button.row' : 'div.row', { type: onclick ? 'button' : null, onclick, style: '--inset:58px' },
      h('span.app-icon', { style: `--c:${color}` }, icon(iconName)),
      h('span.row-main', null, label),
      value != null ? (value instanceof Node ? value : h('span.row-value', null, value)) : null,
      onclick ? h('span.chev', null, icon('chevron')) : null);

  const lastText = lastBackup
    ? new Date(lastBackup).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
    : 'Nie';

  root.append(...largeTitle('Mehr'));
  root.lastChild.append(
    h('div.section-header', { style: 'margin-top:4px' }, h('h2', null, 'Datensicherung')),
    h('div.group', null,
      row({
        iconName: cloudFailing ? 'info' : 'refresh',
        color: cloud ? (cloudFailing ? 'var(--red)' : 'var(--green)') : 'var(--gray)',
        label: 'Automatisches Backup',
        value: cloud ? (cloudFailing ? 'Fehler' : relTime(cloudStatus.lastSuccess)) : 'Aus',
        onclick: () => { location.hash = '#/backup'; },
      }),
      row({ iconName: 'share', color: 'var(--blue)', label: 'Backup-Datei exportieren', value: lastText, onclick: exportData }),
      row({ iconName: 'download', color: 'var(--blue)', label: 'Backup-Datei importieren', onclick: () => fileIn.click() })),
    persistNote,
    fileIn,

    h('div.section-header', null, h('h2', null, 'Sicherheitsnetz')),
    h('div.group', null,
      row({ iconName: 'trash', color: 'var(--red)', label: 'Papierkorb', value: String(trash.length), onclick: () => { location.hash = '#/papierkorb'; } }),
      row({ iconName: 'clock', color: 'var(--tint)', label: 'Sicherungspunkte', value: String(snapshots.length), onclick: () => { location.hash = '#/sicherungen'; } })),
    h('p.footnote', null, 'Gelöschte Rezepte bleiben 30 Tage im Papierkorb. Sicherungspunkte entstehen täglich und vor jedem Import.'),

    h('div.section-header', null, h('h2', null, 'Daten')),
    h('div.group', null,
      row({ iconName: 'book', color: 'var(--tint)', label: 'Rezepte', value: String(recipes.length) }),
      row({ iconName: 'bag', color: 'var(--green)', label: 'Vorrat', value: String(pantryCount), onclick: () => { location.hash = '#/vorrat'; } }),
      row({ iconName: 'info', color: 'var(--gray)', label: 'Belegter Speicher', value: storageValue }),
      row({ iconName: 'refresh', color: 'var(--purple)', label: 'Beispielrezepte wiederherstellen', onclick: restoreSeeds })),
    h('p.footnote', null, 'Fügt fehlende der 10 Startrezepte wieder hinzu. Deine eigenen Rezepte bleiben unverändert.'),

    h('p.footnote.center', { style: 'margin-top:40px' }, `Kochbuch ${APP_VERSION} · funktioniert komplett offline`),
  );
}
