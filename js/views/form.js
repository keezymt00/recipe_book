// views/form.js – Rezept anlegen / bearbeiten (auch vorbefüllt aus dem Import)
// Aufbau wie ein iOS-Einstellungsformular: gruppierte Zeilen, rote/grüne Kreise zum Entfernen/Hinzufügen.

import { get, getAll, saveRecipe, uid, normalizeRecipe } from '../db.js';
import { trashRecipe } from '../safety.js';
import { UNITS, normalizeUnit, parseAmount, formatAmountInput } from '../units.js';
import { guessAisle } from '../aisles.js';
import { parseIngredientLine } from '../parser.js';
import { h, icon, glassBtn, navbar, toast, modal, confirmDialog, blobURL, resizeImage, posInt, posNum, autoGrow } from '../ui.js';
import { state } from '../state.js';

const DEFAULT_TAGS = ['High Protein', 'Meal Prep', 'Spanisch', 'Mediterran', 'Asiatisch', 'Tex-Mex', 'Deftig', 'Schnell', 'Vegetarisch'];

export async function render(root, [id]) {
  const isEdit = !!id;
  let fromImport = false;
  let r;
  if (isEdit) {
    r = await get('recipes', id);
    if (!r) { location.replace('#/'); return; }
  } else if (state.draft) {
    r = normalizeRecipe({ ...state.draft, id: null });
    r.id = null;
    state.draft = null;
    fromImport = true;
  } else {
    r = normalizeRecipe({ title: '', servings: 2 });
    r.id = null;
    r.title = '';
  }

  const backTarget = isEdit ? `#/rezept/${id}` : '#/';
  let photo = r.photo;

  const section = (title, ...children) => [h('div.section-header', null, h('h2', null, title)), ...children];

  /* --- Allgemein: Titel + Zahlenfelder als Zeilen mit Wert rechts --- */
  const titleIn = h('input.title-input', { value: r.title, placeholder: 'Titel', autocapitalize: 'sentences', 'aria-label': 'Titel' });
  const servIn = h('input', { value: String(r.servings), inputmode: 'numeric', 'aria-label': 'Portionen' });
  const timeIn = h('input', { value: r.timeMin ?? '', inputmode: 'numeric', placeholder: '–', 'aria-label': 'Kochzeit in Minuten' });
  const protIn = h('input', { value: r.nutrition.protein ?? '', inputmode: 'decimal', placeholder: 'optional', 'aria-label': 'Protein pro Portion' });
  const kcalIn = h('input', { value: r.nutrition.kcal ?? '', inputmode: 'numeric', placeholder: 'optional', 'aria-label': 'Kalorien pro Portion' });
  const notesIn = h('textarea', { value: r.notes, rows: 3, placeholder: 'Tipps, Beilagen, Haltbarkeit …', 'aria-label': 'Notizen' });
  // Ganze Zeile antippbar → Fokus ins Feld
  const fieldRow = (label, input, unit = '') =>
    h('label.row.field-row', null, h('span', null, label), input, h('span.unit', null, unit));

  /* --- Foto --- */
  const photoBox = h('div');
  const fileIn = h('input', {
    type: 'file',
    accept: 'image/*',
    hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        photo = await resizeImage(file);
        renderPhoto();
      } catch (err) {
        toast(err.message);
      }
    },
  });
  function renderPhoto() {
    photoBox.replaceChildren(...[
      h('button.photo-pick', { type: 'button', onclick: () => fileIn.click(), 'aria-label': 'Foto wählen' },
        photo ? h('img', { src: blobURL(photo), alt: '' }) : h('span', null, icon('camera'), 'Foto hinzufügen')),
      photo ? h('div.btn-row', { style: 'margin-top:10px' },
        h('button.btn.btn-sm', { type: 'button', onclick: () => fileIn.click() }, 'Ändern'),
        h('button.btn.btn-sm.btn-danger', { type: 'button', onclick: () => { photo = null; renderPhoto(); } }, 'Entfernen')) : [],
    ].flat());
  }

  /* --- Tags --- */
  const allRecipes = await getAll('recipes');
  const tagOptions = [...new Set([...DEFAULT_TAGS, ...allRecipes.flatMap((x) => x.tags), ...r.tags])];
  const selected = new Set(r.tags);
  const tagBox = h('div.pills.wrap');
  const tagIn = h('input', {
    placeholder: 'Eigener Tag',
    enterkeyhint: 'done',
    'aria-label': 'Eigener Tag',
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } },
  });
  function addTag() {
    const t = tagIn.value.trim();
    if (!t) return;
    if (!tagOptions.includes(t)) tagOptions.push(t);
    selected.add(t);
    tagIn.value = '';
    renderTags();
  }
  function renderTags() {
    tagBox.replaceChildren(...tagOptions.map((t) => h(`button.pill${selected.has(t) ? '.on' : ''}`, {
      type: 'button',
      onclick: () => { if (selected.has(t)) selected.delete(t); else selected.add(t); renderTags(); },
    }, t)));
  }

  /* --- Zutaten: Menge | Einheit | Name --- */
  const ingBox = h('div');
  function ingRow(ing = { amount: null, unit: '', name: '' }) {
    const row = h('div.row.ing-edit', { dataset: { aisle: ing.aisle || '', orig: ing.name || '' } },
      h('button.remove-btn', { type: 'button', 'aria-label': 'Zutat entfernen', onclick: () => row.remove() }, icon('minusCircle')),
      h('input.in-amount', { value: formatAmountInput(ing.amount), inputmode: 'decimal', placeholder: 'Mng.', 'aria-label': 'Menge' }),
      h('input.in-unit', { value: ing.unit || '', list: 'unit-list', placeholder: 'Einh.', autocapitalize: 'off', autocorrect: 'off', 'aria-label': 'Einheit' }),
      h('input.in-name', { value: ing.name || '', placeholder: 'Zutat', 'aria-label': 'Zutat' }));
    return row;
  }
  const addIngredient = () => {
    const row = ingRow();
    ingBox.append(row);
    row.querySelector('.in-amount').focus();
  };
  async function pasteIngredients() {
    const ta = h('textarea', { rows: 8, placeholder: '500 g Hähnchenbrust\n2 Zehen Knoblauch\n1 EL Olivenöl\nSalz' });
    const ok = await modal({
      title: 'Zutaten einfügen',
      body: h('div', null, h('p', null, 'Eine Zutat pro Zeile – Menge und Einheit werden erkannt.'), ta),
      actions: [{ label: 'Übernehmen', value: true, kind: 'primary' }, { label: 'Abbrechen', value: false }],
      autofocus: true, // hier soll man direkt lostippen können
    });
    if (!ok) return;
    ta.value.split('\n').map((l) => l.trim()).filter(Boolean)
      .forEach((line) => ingBox.append(ingRow(parseIngredientLine(line))));
  }

  /* --- Schritte --- */
  const stepBox = h('div');
  const growers = [];
  const renumber = () => stepBox.querySelectorAll('.num').forEach((n, i) => { n.textContent = String(i + 1); });
  function stepRow(step = { text: '', timerMin: null }) {
    const ta = h('textarea.step-text', { value: step.text, rows: 1, placeholder: 'Was ist zu tun?', 'aria-label': 'Schritt' });
    growers.push(autoGrow(ta));
    const move = (dir) => {
      const sib = dir < 0 ? row.previousElementSibling : row.nextElementSibling;
      if (!sib) return;
      if (dir < 0) stepBox.insertBefore(row, sib); else stepBox.insertBefore(sib, row);
      renumber();
    };
    const row = h('div.row.step-edit', null,
      h('span.num'),
      ta,
      h('div.step-tools', null,
        h('label.timer-input', null,
          icon('timer'),
          h('input.step-timer', { value: step.timerMin ?? '', inputmode: 'numeric', placeholder: '–', 'aria-label': 'Timer in Minuten' }),
          'Min.'),
        h('span.spacer'),
        h('button.tool-btn', { type: 'button', 'aria-label': 'Nach oben', onclick: () => move(-1) }, icon('up')),
        h('button.tool-btn', { type: 'button', 'aria-label': 'Nach unten', onclick: () => move(1) }, icon('down')),
        h('button.tool-btn', { type: 'button', 'aria-label': 'Schritt entfernen', onclick: () => { row.remove(); renumber(); } }, icon('trash'))));
    return row;
  }
  const addStep = () => {
    const row = stepRow();
    stepBox.append(row);
    renumber();
    row.querySelector('textarea').focus();
  };

  /* --- Speichern & Löschen --- */
  async function save() {
    const title = titleIn.value.trim();
    if (!title) {
      toast('Bitte einen Titel eingeben');
      titleIn.focus();
      return;
    }
    const ingredients = [...ingBox.querySelectorAll('.ing-edit')].map((row) => {
      const name = row.querySelector('.in-name').value.trim();
      if (!name) return null;
      const unitRaw = row.querySelector('.in-unit').value.trim();
      return {
        amount: parseAmount(row.querySelector('.in-amount').value),
        unit: normalizeUnit(unitRaw) ?? unitRaw, // unbekannte Einheiten bleiben wie eingegeben
        name,
        // Bereich behalten, solange der Name gleich bleibt (Teil 2: manuell änderbar)
        aisle: row.dataset.aisle && row.dataset.orig === name ? row.dataset.aisle : guessAisle(name),
      };
    }).filter(Boolean);
    const steps = [...stepBox.querySelectorAll('.step-edit')].map((row) => ({
      text: row.querySelector('.step-text').value.trim(),
      timerMin: posInt(row.querySelector('.step-timer').value),
    })).filter((s) => s.text);

    const recipe = {
      ...r,
      id: r.id || uid('r'),
      createdAt: r.id ? r.createdAt : Date.now(),
      title,
      photo,
      servings: posInt(servIn.value) || 2,
      timeMin: posInt(timeIn.value),
      ingredients,
      steps,
      tags: [...selected],
      nutrition: { protein: posNum(protIn.value), kcal: posInt(kcalIn.value) },
      notes: notesIn.value.trim(),
    };
    await saveRecipe(recipe);
    toast('Gespeichert');
    location.replace(`#/rezept/${recipe.id}`);
  }

  async function remove() {
    if (!(await confirmDialog(`„${r.title}“ löschen? Es bleibt 30 Tage im Papierkorb (Mehr → Papierkorb).`, 'Rezept löschen', true))) return;
    await trashRecipe(r.id);
    toast('In den Papierkorb verschoben');
    location.replace('#/');
  }

  /* --- Aufbau --- */
  const addRow = (label, onclick, iconName = 'plusCircle') =>
    h('button.row.action', { type: 'button', onclick }, h(`span.${iconName === 'plusCircle' ? 'add-icon' : 'icon-tint'}`, null, icon(iconName)), label);

  root.append(
    navbar({
      title: isEdit ? 'Bearbeiten' : fromImport ? 'Import prüfen' : 'Neues Rezept',
      back: backTarget,
      actions: [glassBtn('check', 'Sichern', save, 'tinted')],
    }),
    h('datalist', { id: 'unit-list' }, UNITS.map((u) => h('option', { value: u }))),
    h('div.content', { style: 'padding-top:8px' },
      fromImport ? h('p.footnote', { style: 'margin:0 4px 14px' }, 'Erkannt aus deinem Text – bitte kurz prüfen und dann oben rechts sichern.') : null,
      photoBox, fileIn,

      h('div.group', { style: 'margin-top:20px' },
        h('label.row', null, titleIn),
        fieldRow('Portionen', servIn),
        fieldRow('Kochzeit', timeIn, 'Min.'),
        fieldRow('Protein', protIn, 'g'),
        fieldRow('Kalorien', kcalIn, 'kcal')),
      h('p.footnote', null, 'Protein und Kalorien jeweils pro Portion.'),

      section('Tags',
        tagBox,
        h('div.tag-add', null,
          h('label.search', null, tagIn),
          h('button.btn.btn-sm.btn-tinted', { type: 'button', onclick: addTag, style: 'min-height:38px' }, 'Hinzufügen'))),

      section('Zutaten',
        h('div.group', null,
          ingBox,
          addRow('Zutat hinzufügen', addIngredient),
          addRow('Liste einfügen', pasteIngredients, 'clipboard'))),

      section('Zubereitung',
        h('div.group', null,
          stepBox,
          addRow('Schritt hinzufügen', addStep))),

      section('Notizen',
        h('div.group', null, h('label.row', null, notesIn))),

      isEdit
        ? h('div.group', { style: 'margin-top:30px' }, h('button.row.center.danger', { type: 'button', onclick: remove }, 'Rezept löschen'))
        : null,
    ),
  );

  renderPhoto();
  renderTags();
  (r.ingredients.length ? r.ingredients : [undefined, undefined, undefined]).forEach((ing) => ingBox.append(ingRow(ing)));
  (r.steps.length ? r.steps : [undefined]).forEach((s) => stepBox.append(stepRow(s)));
  renumber();

  return {
    mounted: () => {
      growers.forEach((fit) => fit()); // Textareas erst im DOM messbar
      autoGrow(notesIn)();
      if (!isEdit && !fromImport) titleIn.focus();
    },
  };
}
