# Note-U development constraints

Note-U is a static, URL-only note editor. The complete note must be encoded in the
URL: never add a backend, accounts, analytics, remote embeds, uploads, cookies,
localStorage, sessionStorage, IndexedDB, or any other persistence mechanism.

Keep `index.html` lightweight and use `storage.js`, `editor.js`, `ui.js`, `app.js`,
and `style.css` as the active sources of truth. The repository must remain directly
deployable to GitHub Pages without a build step. Do not add images or remote assets.

Editor blocks form a real tree. Every block has a stable ID, type, content, and
ordered children; toggles additionally have title style and open state, and
checklists have checked state. Never replace hierarchy with visual indent numbers.
All subtree operations must preserve descendants and must prevent cycles.

Only allow the inline elements supported by the sanitizer. Links are limited to
`http:`, `https:`, `mailto:`, and `tel:` and external links use `target="_blank"`
with `rel="noopener noreferrer"`. Paste is derived from `text/plain`; arbitrary
clipboard HTML and all media are forbidden.

Preserve native browser text selection. Keep keyboard behavior centralized in the
editor module, menus within the viewport, and the note usable on mobile. Maintain
legacy URL decoding and fail safely for malformed payloads. All code comments must
be in English. Update the application version for user-visible releases and run
`npm test` and `npm run check` before committing.
