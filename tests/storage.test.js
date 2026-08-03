'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadStorage() {
  const context = {
    TextDecoder,
    TextEncoder,
    Uint8Array,
    atob,
    btoa,
    console,
    escape,
    decodeURIComponent,
    encodeURIComponent,
    window: { location: { hash: '', pathname: '/', search: '', href: 'https://example.test/' } }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('storage.js', 'utf8'), context);
  return context.window.NoteStorage;
}

test('current URL payloads round-trip supported block data', () => {
  const storage = loadStorage();
  const note = {
    title: 'Unicode 📝',
    icon: '💡',
    blocks: [
      { type: 'code', indent: 2, text: 'const answer = 42;\n' },
      { type: 'divider' }
    ]
  };

  const loaded = storage.loadFromHash(`#${storage.encodeNote(note)}`);
  assert.equal(loaded.version, 7);
  assert.equal(loaded.title, note.title);
  assert.equal(loaded.icon, note.icon);
  assert.equal(loaded.blocks[0].type, 'code');
  assert.equal(loaded.blocks[0].indent, 2);
  assert.equal(loaded.blocks[0].text, note.blocks[0].text);
  assert.equal(loaded.blocks[1].type, 'divider');
});

test('number format and stable calculator row IDs survive a URL round trip', () => {
  const storage = loadStorage();
  const note = { version: 7, numberFormat: 'european', blocks: [{
    id: 'calc', type: 'calculator', rows: [{ id: 'row-a', text: '1,5 + 2' }]
  }] };
  const loaded = storage.loadFromHash(storage.encodeNote(note));
  assert.equal(loaded.numberFormat, 'european');
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.blocks[0].rows)), note.blocks[0].rows);
});

test('legacy notes retain international number interpretation', () => {
  const storage = loadStorage();
  const loaded = storage.normalizeNote({ version: 6, numberFormat: 'european', blocks: [] });
  assert.equal(loaded.numberFormat, 'international');
});

test('legacy percent-encoded JSON URLs remain readable', () => {
  const storage = loadStorage();
  const legacy = encodeURIComponent(JSON.stringify({
    version: 1,
    title: 'Old note',
    icon: '📌',
    blocks: [{ type: 'code-block', content: 'legacy text' }]
  }));

  const loaded = storage.loadFromHash(legacy);
  assert.equal(loaded.title, 'Old note');
  assert.equal(loaded.blocks[0].type, 'code');
  assert.equal(loaded.blocks[0].text, 'legacy text');
});

test('invalid URLs safely return a fresh note', () => {
  const storage = loadStorage();
  const loaded = storage.loadFromHash('%not-a-valid-note%');
  assert.equal(loaded.title, storage.DEFAULT_NOTE.title);
  assert.deepEqual(Array.from(loaded.blocks), []);
});

test('hierarchical blocks, stable IDs, formatting and state survive a URL round trip', () => {
  const storage = loadStorage();
  const note = {
    title: '',
    icon: '🧠',
    blocks: [{
      id: 'parent',
      type: 'numbered-list',
      html: '<strong>one</strong> <a href="https://example.test/x" onclick="bad()">link</a>',
      children: [{
        id: 'toggle',
        type: 'toggle',
        html: '<mark>details</mark>',
        titleStyle: 'heading-2',
        open: false,
        children: [{ id: 'task', type: 'checklist', html: 'done', checked: true }]
      }]
    }]
  };

  const loaded = storage.loadFromHash(storage.encodeNote(note));
  assert.equal(loaded.title, '');
  assert.equal(loaded.blocks[0].id, 'parent');
  assert.equal(loaded.blocks[0].children[0].id, 'toggle');
  assert.equal(loaded.blocks[0].children[0].open, false);
  assert.equal(loaded.blocks[0].children[0].titleStyle, 'heading-2');
  assert.equal(loaded.blocks[0].children[0].children[0].checked, true);
  assert.match(loaded.blocks[0].html, /target="_blank"/);
  assert.doesNotMatch(loaded.blocks[0].html, /onclick/);
});

test('unsafe links and media are removed by normalization', () => {
  const storage = loadStorage();
  const loaded = storage.normalizeNote({
    blocks: [{
      type: 'paragraph',
      html: '<a href="javascript:alert(1)">unsafe</a><img src="https://tracker.test/pixel">safe text'
    }]
  });

  assert.doesNotMatch(loaded.blocks[0].html, /javascript:|img|src=/i);
  assert.match(loaded.blocks[0].html, /unsafe/);
  assert.match(loaded.blocks[0].html, /safe text/);
});

test('calculator lines and recursive children round-trip without derived state', () => {
  const storage = loadStorage();
  const note = { blocks: [{
    id: 'calc-1', type: 'calculator', lines: ['Hotel = 180 * 4', 'Hotel: hotel', 'total'],
    results: [720, 720, 720], errors: ['not serialized'],
    children: [{ id: 'child-1', type: 'paragraph', html: 'attached' }]
  }] };
  const encoded = storage.encodeNote(note);
  const loaded = storage.loadFromHash(encoded);
  assert.equal(loaded.blocks[0].type, 'calculator');
  assert.deepEqual(Array.from(loaded.blocks[0].lines), note.blocks[0].lines);
  assert.equal(loaded.blocks[0].children[0].id, 'child-1');
  assert.equal(loaded.blocks[0].results, undefined);
  assert.equal(loaded.blocks[0].errors, undefined);
});
