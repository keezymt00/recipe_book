// Struktur-Prüfungen: Offline-Cache vollständig, Version gültig, Skill-Format importierbar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { parseRecipeText } from '../../js/parser.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const jsFiles = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? jsFiles(join(dir, d.name)) : d.name.endsWith('.js') ? [join(dir, d.name)] : []));

test('Jede JS-Datei der App steht im Offline-Cache des Service Workers', () => {
  const sw = read('sw.js');
  const assets = [...sw.matchAll(/^\s*'([^']+)',$/gm)].map((m) => m[1]);
  for (const file of jsFiles('js')) assert.ok(assets.includes(relative(ROOT, join(ROOT, file))), `${file} fehlt in sw.js ASSETS`);
  for (const asset of assets) if (asset !== './') assert.ok(existsSync(join(ROOT, asset)), `${asset} in ASSETS existiert nicht`);
});

test('Alle JS-Dateien sind syntaktisch korrekt', () => {
  for (const file of [...jsFiles('js'), 'sw.js']) execFileSync(process.execPath, ['--check', join(ROOT, file)]);
});

test('App-Version ist gesetzt', () => {
  assert.match(read('js/version.js'), /APP_VERSION = '\d+\.\d+'/);
});

test('Content Security Policy ist aktiv und lässt nur die GitHub-API zu', () => {
  const csp = read('index.html').match(/Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp, 'CSP fehlt');
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /connect-src 'self' https:\/\/api\.github\.com;/);
});

test('Claude-Skill: Vorlage und Beispiel werden vom Parser vollständig erkannt', () => {
  const md = read('skills/kochbuch-rezept/SKILL.md');
  const blocks = [...md.matchAll(/^(`{3,4})\n([\s\S]*?)\n\1$/gm)].map((m) => m[2]);
  assert.ok(blocks.length >= 2);
  for (const text of blocks) {
    const p = parseRecipeText(text);
    assert.ok(p.title && p.title !== 'Neues Rezept');
    assert.ok(p.servings > 0 && p.timeMin > 0);
    assert.ok(p.ingredients.length >= 5 && p.steps.length >= 3);
    assert.ok(p.ingredients.every((i) => !/^\d/.test(i.name)), 'Zutatenname beginnt mit Ziffer');
    assert.ok(p.notes.length > 0, 'Notizen fehlen');
  }
});
