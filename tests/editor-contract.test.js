'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const editor = fs.readFileSync('editor.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const ui = fs.readFileSync('ui.js', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');

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
  assert.match(editor, /const containsUrl = URL_PATTERN\.test\(text\);\s*URL_PATTERN\.lastIndex = 0;\s*if \(containsUrl\) insertLinkedText\(text\)/);
  assert.doesNotMatch(editor, /execCommand\('createLink',[^\n]+text\.trim\(\)\)/);
});

test('soft Enter inserts a newline immediately and empty toggle children exit', () => {
  assert.match(editor, /if \(event\.shiftKey\) \{\s*insertText\('\\n'\)/);
  assert.match(editor, /function exitToggle\(block\)/);
  assert.match(editor, /type === 'paragraph' && empty\(content\) && exitToggle\(block\)/);
});

test('slash menu arrow navigation clamps at both ends', () => {
  assert.match(ui, /Math\.max\(0, Math\.min\(selectedIndex \+ delta, menuState\.items\.length - 1\)\)/);
  assert.doesNotMatch(ui, /selectedIndex \+ delta \+ menuState\.items\.length\) %/);
});

test('slash menu owns both Enter and Tab before the editor keyboard handler', () => {
  assert.match(ui, /event\.key === 'Enter' \|\| event\.key === 'Tab'/);
  assert.match(ui, /stopImmediatePropagation\(\)/);
});

test('calculator row deletion and empty-final-row exit are scoped to rows', () => {
  assert.match(editor, /rows\.length === 1 && empty\(content\)/);
  assert.match(editor, /else if \(empty\(content\) && rows\.length > 1\)/);
  assert.match(editor, /row\.remove\(\)/);
  assert.match(editor, /empty\(content\) && row === rows\.at\(-1\)/);
});

test('forward Delete and three-stage select-all are centralized', () => {
  assert.match(editor, /function deleteForward\(event, block, content\)/);
  assert.match(editor, /else if \(event\.key === 'Delete'\) deleteForward/);
  assert.match(editor, /Math\.min\(3, selectAllState\.stage \+ 1\)/);
  assert.match(editor, /else if \(stage === 2\) range\.selectNode\(block\)/);
  assert.match(editor, /else range\.selectNodeContents\(root\)/);
});

test('calculator placeholder is model-state driven transient UI', () => {
  const css = fs.readFileSync('style.css', 'utf8');
  assert.match(editor, /classList\.toggle\('is-empty-calculator', rows\.length === 1/);
  assert.match(css, /\.block\.is-empty-calculator[^\n]+::before/);
  assert.match(css, /user-select: none/);
});

test('pointer selection extends native ranges across block editing hosts', () => {
  assert.match(editor, /function caretFromPoint\(x, y\)/);
  assert.match(editor, /function extendPointerSelection\(event\)/);
  assert.match(editor, /selection\.setBaseAndExtent/);
  assert.match(editor, /focusBlock === pointerSelection\.anchorBlock/);
});

test('favicon choices include all four directional arrows', () => {
  for (const icon of ['⬆️', '⬇️', '➡️', '⬅️']) assert.ok(app.includes(`'${icon}'`));
});

test('the empty favicon is the final icon picker choice', () => {
  const icons = app.match(/const ICONS = \[([\s\S]*?)\];/)?.[1];
  assert.match(icons, /'•',\s*''\s*$/);
});
