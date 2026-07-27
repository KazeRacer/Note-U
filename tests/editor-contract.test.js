'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const editor = fs.readFileSync('editor.js', 'utf8');

test('keyboard input resolves the active editable from the selection host', () => {
  assert.match(editor, /anchorElement\?\.closest\?\.\('\[data-block-content\]'\)/);
  assert.match(editor, /replace\(\/\\u00A0\/g, ' '\)/);
});

test('all required markdown shortcuts are registered as exact prefixes', () => {
  for (const prefix of ['``` ', '--- ', '[ ] ', '[] ', '### ', '## ', '# ', '1. ', '- ', '> ']) {
    assert.ok(editor.includes(`['${prefix}',`), `missing shortcut: ${prefix}`);
  }
  assert.match(editor, /text === prefix/);
});

test('editor owns undo, redo and beforeinput history handling', () => {
  assert.match(editor, /function restoreHistory/);
  assert.match(editor, /event\.inputType === 'historyRedo'/);
  assert.match(editor, /event\.shiftKey \? 1 : -1/);
});

test('the block handle is the only draggable editing control', () => {
  assert.match(editor, /handle\.draggable = false/);
  assert.match(editor, /addEventListener\('pointermove'/);
  assert.match(editor, /document\.elementFromPoint/);
});

test('continuation blocks share one empty-Enter exit rule', () => {
  assert.match(editor, /'bulleted-list', 'numbered-list', 'checklist', 'quote', 'code'/);
  assert.doesNotMatch(editor, /function handleQuoteEnter|function handleCodeEnter/);
});

test('multi-block transforms use each selected block content instead of ancestors', () => {
  assert.match(editor, /range\.intersectsNode\(ownContent\)/);
  assert.match(editor, /selected\.map\(\(item\) => transformBlock\(item, targetType\)\)/);
  assert.match(editor, /handle\.draggable = true/);
  assert.match(editor, /event\.target\.closest\?\.\('\[data-drag-handle\]'\)/);
});
