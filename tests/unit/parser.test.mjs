// Parser: Rezepttext-Import, Zutatenzeilen, Timer, Teilen-Format
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRecipeText, parseIngredientLine, detectTimer, toRecipeText } from '../../js/parser.js';
import { seedRecipes } from '../../js/seed.js';

test('Zutatenzeilen: Menge, Einheit, Name', () => {
  const cases = [
    ['500g Hähnchenbrust', 500, 'g', 'Hähnchenbrust'],
    ['2 EL Olivenöl', 2, 'EL', 'Olivenöl'],
    ['1 1/2 TL Salz', 1.5, 'TL', 'Salz'],
    ['- 200 ml Sahne', 200, 'ml', 'Sahne'],
    ['2-3 Zehen Knoblauch', 3, 'Zehe', 'Knoblauch'],
    ['½ Bund Petersilie', 0.5, 'Bund', 'Petersilie'],
    ['Hähnchenbrust, 500 g', 500, 'g', 'Hähnchenbrust'],
    ['3 Eier', 3, '', 'Eier'],
    ['Salz', null, '', 'Salz'],
  ];
  for (const [line, amount, unit, name] of cases) {
    const r = parseIngredientLine(line);
    assert.deepEqual([r.amount, r.unit, r.name], [amount, unit, name], line);
  }
});

test('Timer-Erkennung', () => {
  assert.equal(detectTimer('20 Minuten schmoren'), 20);
  assert.equal(detectTimer('5-7 Min. braten'), 7);
  assert.equal(detectTimer('1 Stunde 30 Minuten garen'), 90);
  assert.equal(detectTimer('2 Min. anbraten, dann 1 Std. schmoren'), 2);
  assert.equal(detectTimer('Kurz umrühren'), null);
});

test('Rezept mit Überschriften, Portionen und Zeit', () => {
  const p = parseRecipeText(`Gambas al ajillo
Für 2 Portionen · 15 Min.

Zutaten
400 g Garnelen, geschält
Salz, Pfeffer

Zubereitung
1. Öl erhitzen, Knoblauch 2 Minuten braten.
2. Garnelen 3-4 Minuten garen.`);
  assert.equal(p.title, 'Gambas al ajillo');
  assert.equal(p.servings, 2);
  assert.equal(p.timeMin, 15);
  assert.deepEqual(p.ingredients.map((i) => i.name), ['Garnelen, geschält', 'Salz', 'Pfeffer']);
  assert.deepEqual(p.steps.map((s) => s.timerMin), [2, 4]);
});

test('Notizen, die mit "Tipps"/"Nährwerte" beginnen, bleiben erhalten', () => {
  const p = parseRecipeText('Test\n\nZutaten\n- 1 Ei\n\nZubereitung\n1. Kochen.\n\nNotizen\nNährwerte geschätzt.\nTipps, Beilagen.');
  assert.equal(p.notes, 'Nährwerte geschätzt.\nTipps, Beilagen.');
});

test('Teilen-Format: alle Beispielrezepte überstehen Text → Import verlustfrei', () => {
  for (const r of seedRecipes()) {
    const p = parseRecipeText(toRecipeText(r));
    assert.equal(p.title, r.title);
    assert.equal(p.servings, r.servings);
    assert.equal(p.timeMin, r.timeMin);
    assert.deepEqual(p.tags, r.tags);
    assert.equal(p.nutrition.protein ?? null, r.nutrition.protein);
    assert.equal(p.notes, r.notes);
    assert.equal(p.ingredients.length, r.ingredients.length, r.title);
    r.ingredients.forEach((ing, i) => {
      assert.equal(p.ingredients[i].name, ing.name);
      assert.ok(Math.abs((p.ingredients[i].amount ?? -1) - (ing.amount ?? -1)) < 0.01, `${r.title}: ${ing.name}`);
    });
    assert.deepEqual(p.steps.map((s) => [s.text, s.timerMin]), r.steps.map((s) => [s.text, s.timerMin]), r.title);
  }
});
