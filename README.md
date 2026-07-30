# Note-U

A portable, serverless note editor.

Everything lives inside the URL.

No account.
No backend.
No database.

Just a link.

## Development

The site has no build step and can be served by any static web server. JavaScript,
CSS and HTML each have a single source file; `index.html` references those files
directly so the deployed GitHub Pages output is the repository contents.

Run the automated URL-format checks with:

```sh
npm test
```

Run JavaScript syntax checks with `npm run check`. The complete repeatable browser
acceptance procedure is in [`tests/MANUAL_TEST_PLAN.md`](tests/MANUAL_TEST_PLAN.md).

## Editor architecture

The editor renders the same hierarchical block tree that `storage.js` serializes.
Every block owns an ordered child container (the toggle body is the toggle's child
container), so Tab and Shift+Tab move subtrees instead of changing a visual indent
number. Legacy flat blocks with indent metadata are converted into this tree only
at the load boundary. Pasted multiline plain text becomes one paragraph per line;
clipboard HTML is never inserted.

The editor root is deliberately not contenteditable. Each block has exactly one
explicit editing host, so keyboard and input events always identify the block that
owns them instead of depending on browser-specific nested-contenteditable targets.
Pointer selection bridges those hosts with the Selection API when a drag crosses a
block boundary, preserving ordinary single-block selection, double click, triple
click, and the separate lateral-handle gesture used to move block subtrees.

Enter after a non-empty heading creates a paragraph. Lists, checklists, quotes and
code continue as the same block type on the first Enter; Enter on the resulting
empty continuation converts it to a paragraph in the same parent. Ctrl+A/Cmd+A
first selects the current block content and the next press selects the complete editor.
An empty final paragraph in a toggle exits that toggle only; nested toggles therefore
unwind one container at a time. The first Backspace/Delete or Tab immediately after
that exit is guarded so it cannot accidentally move focus or re-nest the paragraph.

## Merging editor changes

Do not resolve editor conflicts by blindly choosing **Accept incoming change** or
**Accept current change**. Those labels are relative to the merge operation, not a
guarantee that “incoming” is the new editor. Resolve conflicts by retaining the
feature branch implementation and integrating any independent changes from
`main`, then run the checks below and confirm that `index.html` contains the new
application version. Accepting the `main` side for conflicts in `editor.js`,
`style.css`, or `index.html` can silently discard the entire editor fix.

Runtime assets include the application version in their URL. This cache-busting
query ensures GitHub Pages and the browser request the files from the merged
release rather than reusing an older editor script.

## Sharing titles

The Share action passes the current note title, text, and complete URL to the Web
Share API. Copy link also places a rich HTML link labelled with the note title on
the clipboard while retaining the raw URL as plain text and URI-list data. Static
Open Graph metadata remains `Note-U`: URL fragments are not sent to web servers or
social preview crawlers, so a GitHub Pages-only app cannot generate per-note Open
Graph tags without violating the no-backend constraint.
