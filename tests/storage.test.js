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
  assert.equal(loaded.version, 5);
  assert.equal(loaded.title, note.title);
  assert.equal(loaded.icon, note.icon);
  assert.equal(loaded.blocks[0].type, 'code');
  assert.equal(loaded.blocks[0].indent, 2);
  assert.equal(loaded.blocks[0].text, note.blocks[0].text);
  assert.equal(loaded.blocks[1].type, 'divider');
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
