// views/importer.js – Rezepttext einfügen → Parser → vorbefülltes Formular

import { parseRecipeText } from '../parser.js';
import { h, icon, navbar, toast, autoGrow } from '../ui.js';
import { state } from '../state.js';

const EXAMPLE = `Gambas al ajillo
Für 2 Portionen · 15 Min.

Zutaten
400 g Garnelen, geschält
6 Zehen Knoblauch
1 Chilischote
100 ml Olivenöl
1/2 Bund Petersilie
Salz

Zubereitung
1. Knoblauch in Scheiben, Chili in Ringe schneiden.
2. Öl erhitzen, Knoblauch und Chili 2 Minuten braten.
3. Garnelen zugeben und 3-4 Minuten garen. Salzen, mit Petersilie bestreuen.`;

export async function render(root) {
  const ta = h('textarea', {
    rows: 12,
    placeholder: 'Rezepttext hier einfügen – von einer Webseite, aus Notizen oder einer Nachricht.',
    'aria-label': 'Rezepttext',
    style: 'min-height:260px',
  });
  const fit = autoGrow(ta);

  async function fromClipboard() {
    try {
      ta.value = await navigator.clipboard.readText();
      fit();
      if (!ta.value.trim()) toast('Zwischenablage ist leer');
    } catch {
      toast('Kein Zugriff – lange ins Feld tippen und „Einsetzen“ wählen');
    }
  }

  function analyze() {
    const text = ta.value.trim();
    if (!text) { toast('Bitte zuerst Text einfügen'); return; }
    const parsed = parseRecipeText(text);
    if (!parsed.ingredients.length && !parsed.steps.length) {
      toast('Keine Zutaten oder Schritte erkannt');
      return;
    }
    state.draft = parsed;
    location.hash = '#/neu';
  }

  root.append(
    navbar({ title: 'Importieren', back: '#/' }),
    h('div.content', { style: 'padding-top:8px' },
      h('h1.large-title', null, 'Rezept importieren'),
      h('p.footnote', { style: 'margin:0 4px 16px;font-size:15px' }, 'Füge einen Rezepttext ein. Titel, Zutaten, Schritte und Timer werden automatisch erkannt.'),
      h('div.group', null, h('label.row', null, ta)),
      h('div.btn-row', { style: 'margin-top:12px' },
        navigator.clipboard?.readText ? h('button.btn.btn-sm', { type: 'button', onclick: fromClipboard }, icon('clipboard'), 'Einsetzen') : null,
        h('button.btn.btn-sm', { type: 'button', onclick: () => { ta.value = EXAMPLE; fit(); } }, icon('sparkles'), 'Beispiel')),
      h('button.btn.btn-primary.btn-block', { type: 'button', style: 'margin-top:24px', onclick: analyze }, 'Erkennen'),
      h('p.footnote.center', null, 'Tipp: Überschriften wie „Zutaten“ und „Zubereitung“ verbessern die Erkennung.'),
    ),
  );
}
