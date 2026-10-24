// Meal-Prep-Kühlschrank: Haltbarkeit und "versorgt bis …"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverage, shelfDays, freshness, daysBetween } from '../../js/fridge.js';

const T = '2026-10-24';
const e = (portions, expires, location = 'fridge') => ({ id: 'f', title: 'x', portions, expires, since: T, location });

test('Haltbarkeit aus den Rezeptnotizen', () => {
  assert.equal(shelfDays({ notes: 'Hält sich im Kühlschrank 3–4 Tage.' }), 3);
  assert.equal(shelfDays({ notes: 'Hält sich gekühlt 3 Tage.' }), 3);
  assert.equal(shelfDays({ notes: 'Hält sich 5 Tage im Kühlschrank.' }), 5);
  assert.equal(shelfDays({ notes: 'Lecker!' }), 4);
  assert.equal(shelfDays({}), 4);
});

test('Frische-Anzeige', () => {
  assert.equal(freshness(e(1, '2026-10-27'), T).text, 'noch 3 Tage');
  assert.equal(freshness(e(1, '2026-10-25'), T).level, 'soon');
  assert.equal(freshness(e(1, T), T).level, 'today');
  assert.equal(freshness(e(1, '2026-10-22'), T).text, 'abgelaufen seit 2 Tagen');
});

test('Tage zwischen Daten (auch über Monats- und Zeitumstellung)', () => {
  assert.equal(daysBetween('2026-10-24', '2026-11-02'), 9);
  assert.equal(daysBetween('2026-10-24', '2026-10-24'), 0);
  assert.equal(daysBetween('2026-10-25', '2026-10-26'), 1); // Zeitumstellung Ende Oktober
});

test('Versorgung: 6 Portionen, 2 pro Tag → 3 Tage', () => {
  const c = coverage([e(6, '2026-10-30')], 2, T);
  assert.equal(c.days, 3);
  assert.equal(c.until, '2026-10-26');
  assert.equal(c.gapFrom, '2026-10-27');
});

test('Versorgung: Ablauf begrenzt, früh Ablaufendes zuerst', () => {
  // 6 Portionen, aber nur bis morgen haltbar → 2 Tage; danach 2 frische Portionen → 1 Tag mehr
  const c = coverage([e(6, '2026-10-25'), e(2, '2026-10-30')], 2, T);
  assert.equal(c.days, 3);
});

test('Versorgung: Gefrorenes und Abgelaufenes zählt nicht', () => {
  assert.equal(coverage([e(10, '2027-01-01', 'freezer'), e(4, '2026-10-20')], 2, T).days, 0);
  assert.equal(coverage([], 2, T).until, null);
});
