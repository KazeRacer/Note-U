'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const markdown = require('../markdown.js');

test('inline Markdown becomes the sanitizer-compatible HTML subset', () => {
  assert.equal(markdown.inlineToHtml('**bold** and *italic*'), '<strong>bold</strong> and <em>italic</em>');
  assert.equal(markdown.inlineToHtml('`a < b` ~~old~~ ==key=='), '<code>a &lt; b</code> <s>old</s> <mark>key</mark>');
  assert.equal(
    markdown.inlineToHtml('[site](https://example.test/a?x=1&y=2)'),
    '<a href="https://example.test/a?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">site</a>'
  );
  assert.match(markdown.inlineToHtml('see https://example.test/page.'), /href="https:\/\/example\.test\/page"[^>]*>https:\/\/example\.test\/page<\/a>\.$/);
});

test('math-like asterisks and snake_case words are left alone', () => {
  assert.equal(markdown.inlineToHtml('2 * 3 * 4'), '2 * 3 * 4');
  assert.equal(markdown.inlineToHtml('snake_case_name'), 'snake_case_name');
});

test('unsafe links and raw HTML never survive inline conversion', () => {
  assert.doesNotMatch(markdown.inlineToHtml('[x](javascript:alert(1))'), /href=|javascript:/);
  const html = markdown.inlineToHtml('<img src=x onerror=alert(1)> <script>bad()</script>');
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img/);
});

test('block Markdown becomes a real tree with nested children', () => {
  const blocks = markdown.parseMarkdown([
    '# Title', '- one', '  - two', '    - three', '- [ ] todo', '- [x] done',
    '1. first', '2. second', '> quote', '> more', '---'
  ].join('\n'));
  assert.deepEqual(blocks.map((block) => block.type), [
    'heading-1', 'bulleted-list', 'checklist', 'checklist', 'numbered-list', 'numbered-list', 'quote', 'divider'
  ]);
  assert.equal(blocks[1].children[0].html, 'two');
  assert.equal(blocks[1].children[0].children[0].html, 'three');
  assert.equal(blocks[3].checked, true);
  assert.equal(blocks[6].html, 'quote<br>more');
});

test('fenced code keeps its content and indentation verbatim', () => {
  const blocks = markdown.parseMarkdown('```js\nif (a) {\n  run();\n}\n```\nafter');
  assert.equal(blocks[0].type, 'code');
  assert.equal(blocks[0].text, 'if (a) {\n  run();\n}');
  assert.equal(blocks[1].html, 'after');
});

test('deeper headings collapse to heading 3 and blank lines add no empty blocks', () => {
  const blocks = markdown.parseMarkdown('#### Deep\n\n\n#  Spaced  ');
  assert.deepEqual(blocks.map((block) => [block.type, block.html]), [['heading-3', 'Deep'], ['heading-1', 'Spaced']]);
});

test('export produces portable Markdown for the supported blocks', () => {
  const output = markdown.toMarkdown([
    { type: 'heading-2', html: 'Plan' },
    { type: 'paragraph', html: '<strong>Bold</strong> &amp; <code>code</code> <a href="https://example.test">link</a>' },
    { type: 'bulleted-list', html: 'a', children: [{ type: 'checklist', html: 'b', checked: true }] },
    { type: 'numbered-list', html: 'one' }, { type: 'numbered-list', html: 'two' },
    { type: 'callout', html: 'tip' },
    { type: 'code', text: 'x = 1' },
    { type: 'calculator', lines: ['1 + 1'] },
    { type: 'toggle', html: 'More', titleStyle: 'heading-2', open: false, children: [{ type: 'paragraph', html: 'hidden' }] },
    { type: 'divider' }
  ]);
  assert.match(output, /^## Plan$/m);
  assert.match(output, /^\*\*Bold\*\* & `code` \[link\]\(https:\/\/example\.test\)$/m);
  assert.match(output, /^- a\n {2}- \[x\] b$/m);
  assert.match(output, /^1\. one\n2\. two$/m);
  assert.match(output, /^> 💡 tip$/m);
  assert.match(output, /^```calc\n1 \+ 1\n```$/m);
  assert.match(output, /<details>\n<summary>## More<\/summary>/);
  assert.match(output, /^---$/m);
});

test('exported Markdown can be imported back without losing structure', () => {
  const source = '# Notes\n\n- item\n  - child **bold**\n- [x] done\n\n1. a\n2. b\n\n> quote\n\n```\ncode\n```';
  const again = markdown.toMarkdown(markdown.parseMarkdown(source));
  assert.deepEqual(markdown.parseMarkdown(again), markdown.parseMarkdown(source));
});
