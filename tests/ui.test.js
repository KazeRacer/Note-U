'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const ui = require('../ui.js');

test('slash filtering returns only genuine declared matches', () => {
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'calc').map((item) => item.id), ['calculator']);
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'calculator').map((item) => item.id), ['calculator']);
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'quo').map((item) => item.id), ['quote']);
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'tog').map((item) => item.id), ['toggle']);
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'head 2').map((item) => item.id), ['heading-2']);
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'xyz'), []);
});

test('slash filtering recalculates from the complete current query', () => {
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'cal').map((item) => item.id), ['calculator']);
  assert.deepEqual(ui.filterCommandItems(ui.TYPE_ITEMS, 'calx'), []);
  assert.equal(ui.filterCommandItems(ui.TYPE_ITEMS, '').length, ui.TYPE_ITEMS.length);
});
