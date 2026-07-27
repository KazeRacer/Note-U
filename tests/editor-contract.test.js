'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const editor = fs.readFileSync('editor.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

test('only block contents are editing hosts', () => {
  assert.match(html, /id="editor"[\s\S]*?contenteditable="false"/);
  assert.match(editor, /element\.contentEditable = 'true'/);
  assert.match(editor, /event\.target\.closest\?\.\('\[data-block-content\]'\)/);
});

test('all keyboard shortcuts are defined in one exact map', () => {
  for (const prefix of ['``` ', '--- ', '[ ] ', '[] ', '### ', '## ', '# ', '1. ', '- ', '> ']) {
    assert.ok(editor.includes(`['${prefix}',`), `missing shortcut: ${prefix}`);
  }
  assert.match(editor, /SHORTCUTS\.get\(text\)/);
});

test('Enter continuation types and heading behavior are centralized', () => {
  assert.match(editor, /const CONTINUATION_TYPES/);
  assert.match(editor, /const nextType = HEADING_TYPES\.has\(type\) \? 'paragraph' : type/);
  assert.match(editor, /empty\(content\) && \(CONTINUATION_TYPES\.has\(type\) \|\| HEADING_TYPES\.has\(type\)\)/);
});

test('Tab changes the tree and pointer dragging rejects cycles', () => {
  assert.match(editor, /function indent\(blocks\)/);
  assert.match(editor, /childContainer\(previous\)/);
  assert.match(editor, /function outdent\(blocks\)/);
  assert.match(editor, /target\.contains\(drag\.block\) \|\| drag\.block\.contains\(target\)/);
});

test('undo, multi-block transforms and plain-text paste remain integrated', () => {
  assert.match(editor, /function recordHistory/);
  assert.match(editor, /blocks\.map\(\(item\) =>/);
  assert.match(editor, /getData\('text\/plain'\)/);
});
