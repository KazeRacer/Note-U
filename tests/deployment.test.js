'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const packageData = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const app = fs.readFileSync('app.js', 'utf8');

test('HTML and package versions match', () => {
  const version = html.match(/name="application-version" content="([^"]+)"/)?.[1];
  assert.equal(version, packageData.version);
});

test('every active runtime asset is cache-busted with the release version', () => {
  for (const asset of ['style.css', 'storage.js', 'markdown.js', 'calculator.js', 'editor.js', 'ui.js', 'app.js']) {
    assert.match(html, new RegExp(`${asset.replace('.', '\\.') }\\?v=${packageData.version}`));
  }
});

test('index stays a lightweight shell without an inline implementation', () => {
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i);
  assert.doesNotMatch(html, /<style\b/i);
});

test('shared links identify the application as Note-U', () => {
  assert.match(html, /<title>Note-U<\/title>/);
  assert.match(html, /property="og:title" content="Note-U"/);
  assert.match(html, /name="application-name" content="Note-U"/);
});

test('Share sends the note title and Copy link provides rich and plain formats', () => {
  assert.match(html, /id="share-note-button"/);
  assert.match(
    app,
    /navigator\.share\(\{\s*title,\s*text:\s*title,\s*url:\s*window\.location\.href\s*\}\)/
  );
  assert.match(app, /'text\/plain'/);
  assert.match(app, /'text\/uri-list'/);
  assert.match(app, /'text\/html'/);
});

test('the note never uses browser persistence APIs', () => {
  for (const file of ['storage.js', 'markdown.js', 'calculator.js', 'editor.js', 'ui.js', 'app.js']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie|XMLHttpRequest|\bfetch\(/, file);
  }
});

test('the page offers a discreet word and character counter', () => {
  assert.match(html, /id="stats"/);
  assert.match(app, /editor\.getStats\(\)/);
  assert.match(app, /editor\.getSelectionStats\(\)/);
});

test('the note is compressed asynchronously and written synchronously only when the page closes', () => {
  assert.match(app, /NoteStorage\.encodeNoteAsync/);
  assert.match(app, /sequence !== saveSequence/);
  assert.match(app, /addEventListener\('pagehide', saveSynchronously\)/);
});

test('the mobile editing bar and link popover exist in the shell', () => {
  assert.match(html, /id="mobile-bar"/);
  assert.match(html, /id="link-chip"/);
  assert.match(html, /viewport-fit=cover/);
});
