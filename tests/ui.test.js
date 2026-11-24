'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const ui = require('../ui.js');

test('slash filtering returns only genuine declared matches', () => {
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'calc').map((item) => item.id), ['calculator']);
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'calculator').map((item) => item.id), ['calculator']);
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'quo').map((item) => item.id), ['quote']);
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'tog').map((item) => item.id), [
    'toggle', 'toggle-heading-1', 'toggle-heading-2', 'toggle-heading-3'
  ]);
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'callout').map((item) => item.id), ['callout']);
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'head 2').map((item) => item.id), ['heading-2']);
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'xyz'), []);
});

test('slash filtering recalculates from the complete current query', () => {
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'cal').map((item) => item.id), ['calculator', 'callout']);
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'calx'), []);
  assert.equal(ui.filterCommandItems(ui.TYPE_ITEMS, '').length, ui.TYPE_ITEMS.length);
});

test('slash filtering understands Italian names', () => {
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'calcolatrice').map((item) => item.id), ['calculator']);
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'citazione').map((item) => item.id), ['quote']);
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'codice').map((item) => item.id), ['code']);
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'titolo 2').map((item) => item.id).slice(0, 1), ['heading-2']);
});

test('every block type offered by the menu is a type the editor accepts', () => {
  const editor = require('node:fs').readFileSync('editor.js', 'utf8');
  const types = editor.match(/const TYPES = new Set\(\[([\s\S]*?)\]\)/)[1];
  for (const item of ui.TYPE_ITEMS) {
    const type = item.id.replace(/^toggle-heading-\d$/, 'toggle');
    assert.ok(types.includes(`'${type}'`), `editor does not accept ${type}`);
  }
});

test('Italian translations cover the visible UI and dynamic calculator errors', () => {
  ui.setLanguage('it');
  try {
    assert.equal(ui.t('Copy link'), 'Copia link');
    assert.equal(ui.t('Division by zero'), 'Divisione per zero');
    assert.equal(ui.t('Unknown variable “rent”'), 'Variabile sconosciuta “rent”');
    assert.equal(ui.t('Not a known key'), 'Not a known key');
    assert.equal(ui.formatStats({ words: 1, characters: 1 }), '1 parola · 1 carattere');
    assert.equal(ui.formatStats({ words: 12, characters: 80 }), '12 parole · 80 caratteri');
  } finally {
    ui.setLanguage('en');
  }
  assert.equal(ui.t('Copy link'), 'Copy link');
  assert.equal(ui.formatStats({ words: 2, characters: 9 }), '2 words · 9 characters');
});
