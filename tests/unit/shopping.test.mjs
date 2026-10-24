// Einkaufsliste: Zusammenfassen gleicher Zutaten und Mengenanzeige
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameKey, formatQuantities, listText } from '../../js/shopping.js';

test('Gleiche Zutaten bekommen denselben Schlüssel (Plural, Klammern, Akzente)', () => {
  const same = [
    ['Zwiebeln', 'Zwiebel'], ['Tomaten', 'Tomate'], ['Eier (L)', 'Eier'], ['Kartoffeln (festkochend)', 'Kartoffel'],
    ['Avocados', 'Avocado'], ['Limetten', 'Limette'], ['Kidneybohnen (Glas, abgetropft)', 'Kidneybohnen'],
  ];
  for (const [a, b] of same) assert.equal(nameKey(a), nameKey(b), `${a} = ${b}`);
  assert.notEqual(nameKey('Zwiebel rot'), nameKey('Zwiebel'));
  assert.notEqual(nameKey('Paprika rot'), nameKey('Paprikapulver'));
});

test('Mengen über Rezepte: Basiseinheiten, Löffel, Aufrunden', () => {
  assert.equal(formatQuantities({ g: 1700 }), '1,7 kg');
  assert.equal(formatQuantities({ TL: 3 }), '1 EL');
  assert.equal(formatQuantities({ TL: 6 }), '2 EL');
  assert.equal(formatQuantities({ TL: 4 }), '4 TL');          // nicht "1⅓ EL"
  assert.equal(formatQuantities({ Stk: 2.67 }), '3');         // 2⅔ Zwiebeln → 3 kaufen
  assert.equal(formatQuantities({ Bund: 0.5 }), '1 Bund');
  assert.equal(formatQuantities({ Zehe: 8 }), '8 Zehen');
  assert.equal(formatQuantities({ g: 300, Zehe: 2 }), '300 g + 2 Zehen');
});

test('Text zum Teilen: nur offene Artikel, nach Bereich gruppiert', () => {
  const items = [
    { name: 'Zwiebeln', qtyText: '2', aisle: 'obst', checked: false, pantry: false },
    { name: 'Salz', qtyText: '', aisle: 'gewuerze', checked: false, pantry: true },
    { name: 'Hähnchenbrust', qtyText: '1,7 kg', aisle: 'fleisch', checked: true, pantry: false },
    { name: 'Reis', qtyText: '250 g', aisle: 'trocken', checked: false, pantry: false },
  ];
  const text = listText(items, [{ id: '2026-10-25' }]);
  assert.match(text, /Obst & Gemüse\n• 2 Zwiebeln/);
  assert.match(text, /Trockenware & Konserven\n• 250 g Reis/);
  assert.doesNotMatch(text, /Salz|Hähnchenbrust/);
});
