// Einheiten, Mengen und Supermarktbereiche
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, formatQty, normalizeUnit } from '../../js/units.js';
import { guessAisle } from '../../js/aisles.js';

test('Mengen lesen', () => {
  const cases = { '1,5': 1.5, '1/2': 0.5, '1 1/2': 1.5, '½': 0.5, '1½': 1.5, '2-3': 3, '2 bis 3': 3, '1.000': 1000, abc: null, '': null };
  for (const [input, expected] of Object.entries(cases)) assert.equal(parseAmount(input), expected, input);
});

test('Mengen anzeigen', () => {
  assert.equal(formatQty(1500, 'g'), '1,5 kg');
  assert.equal(formatQty(2, 'Zehe'), '2 Zehen');
  assert.equal(formatQty(0.5, 'Bund'), '½ Bund');
  assert.equal(formatQty(1, 'l'), '1 l');
  assert.equal(formatQty(0.75, 'kg'), '750 g');
  assert.equal(formatQty(2.5, 'Stk'), '2½');
  assert.equal(formatQty(null, 'g'), '');
});

test('Einheiten normalisieren', () => {
  assert.equal(normalizeUnit('EL.'), 'EL');
  assert.equal(normalizeUnit('Teelöffel'), 'TL');
  assert.equal(normalizeUnit('Zehen'), 'Zehe');
  assert.equal(normalizeUnit(''), '');
  assert.equal(normalizeUnit('Schüssel'), null);
});

test('Supermarktbereiche: längstes Stichwort gewinnt', () => {
  const cases = {
    'Paprikapulver edelsüß': 'gewuerze', 'Paprika rot': 'obst', Kokosmilch: 'trocken', Eier: 'milch', Weißwein: 'sonstiges',
    Rinderbrühe: 'gewuerze', 'grüne Bohnen': 'obst', Kidneybohnen: 'trocken', 'Tomaten gehackt (Dose)': 'trocken',
    Olivenöl: 'gewuerze', 'Hähnchenbrust': 'fleisch', 'Garnelen geschält (TK)': 'fleisch',
  };
  for (const [name, aisle] of Object.entries(cases)) assert.equal(guessAisle(name), aisle, name);
});
