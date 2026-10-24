// Backup-Prüfung: manipulierte oder kaputte Daten dürfen nie ungeprüft durchkommen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanData } from '../../js/backup.js';

test('Gültige Rezepte bleiben erhalten', () => {
  const c = cleanData({ recipes: [{ id: 'r_1', title: 'Chili', servings: 4, ingredients: [{ amount: 500, unit: 'g', name: 'Hack' }], steps: [{ text: 'Braten', timerMin: 8 }], tags: ['Deftig'] }] });
  assert.equal(c.recipes.length, 1);
  assert.equal(c.recipes[0].ingredients[0].aisle, 'fleisch');
  assert.equal(c.recipes[0].steps[0].timerMin, 8);
});

test('Unbrauchbare Rezepte werden übersprungen und gezählt', () => {
  const c = cleanData({ recipes: [{ title: '' }, null, 42, 'x', { title: 'Ok' }] });
  assert.equal(c.recipes.length, 1);
  assert.equal(c.skipped, 4);
});

test('Unsinnige Werte werden korrigiert, gefährliche verworfen', () => {
  const c = cleanData({
    recipes: [{
      id: '../../etc', title: '<img src=x onerror=alert(1)>', servings: 1e9,
      ingredients: [{ name: 'Salz', amount: 'viel', aisle: 'hacker' }, 'kaputt'],
      steps: ['ok', { text: 5 }], tags: [1, 'Tag'], photo: 'data:text/html;base64,PHNjcmlwdD4=',
    }],
    plan: [{ id: '../x', entries: [] }, { id: '2026-12-01', entries: [{ recipeId: 'r_1', servings: 9999 }, { recipeId: '<b>' }] }],
    shopping: [{ key: 'evil' }, { key: 'g:salz', checked: 'yes' }, { key: 'c_1', custom: true, name: 'Milch', aisle: 'nope' }],
    pantry: [{ name: 'zucker', label: 'Zucker' }, { name: 5 }],
    fridge: [{ id: 'f_1', title: 'Chili', portions: 4, since: '2026-10-24', expires: '2026-10-28' }, { id: 'f_2', title: 'X', portions: -1, since: 'x', expires: 'y' }],
    aisleOverrides: { 'g:salz': 'obst', 'g:x': 'hacker', __proto__x: 'obst' },
  });
  const r = c.recipes[0];
  assert.equal(r.title, '<img src=x onerror=alert(1)>'); // bleibt Text – wird nie als HTML eingefügt
  assert.notEqual(r.id, '../../etc');
  assert.equal(r.servings, 2);
  assert.equal(r.photo, null);
  assert.deepEqual(r.ingredients, [{ amount: null, unit: '', name: 'Salz', aisle: 'gewuerze' }]);
  assert.deepEqual(r.tags, ['Tag']);
  assert.deepEqual(c.plan.map((d) => d.id), ['2026-12-01']);
  assert.equal(c.plan[0].entries.length, 1);
  assert.deepEqual(c.shopping.map((s) => s.key), ['g:salz', 'c_1']);
  assert.equal(c.shopping[0].checked, false);
  assert.equal(c.shopping[1].aisle, 'sonstiges');
  assert.equal(c.pantry.length, 1);
  assert.deepEqual(c.fridge.map((f) => f.id), ['f_1']);
  assert.deepEqual(c.aisleOverrides, { 'g:salz': 'obst' });
  assert.equal({}.polluted, undefined);
});

test('Nur echte Bilder werden als Foto übernommen', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const c = cleanData({ recipes: [{ title: 'Mit Foto', photo: png }] });
  assert.ok(c.recipes[0].photo instanceof Blob);
  assert.equal(c.recipes[0].photo.type, 'image/png');
});
