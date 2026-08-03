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
+
+Run JavaScript syntax checks with `npm run check`. The complete repeatable browser
+acceptance procedure is in [`tests/MANUAL_TEST_PLAN.md`](tests/MANUAL_TEST_PLAN.md).
+
+## Editor architecture
+
+The editor renders the same hierarchical block tree that `storage.js` serializes.
+Every block owns an ordered child container (the toggle body is the toggle's child
+container), so Tab and Shift+Tab move subtrees instead of changing a visual indent
+number. Legacy flat blocks with indent metadata are converted into this tree only
+at the load boundary. Pasted multiline plain text becomes one paragraph per line;
+clipboard HTML is never inserted.
+
+The editor root is deliberately not contenteditable. Each block has exactly one
+explicit editing host, so keyboard and input events always identify the block that
+owns them instead of depending on browser-specific nested-contenteditable targets.
+Pointer selection bridges those hosts with the Selection API when a drag crosses a
+block boundary, preserving ordinary single-block selection, double click, triple
+click, and the separate lateral-handle gesture used to move block subtrees.
+
+Enter after a non-empty heading creates a paragraph. Lists, checklists, quotes and
+code continue as the same block type on the first Enter; Enter on the resulting
+empty continuation converts it to a paragraph in the same parent. Ctrl+A/Cmd+A
+first selects the current block content and the next press selects the complete editor.
+An empty final paragraph in a toggle exits that toggle only; nested toggles therefore
+unwind one container at a time. The first Backspace/Delete or Tab immediately after
+that exit is guarded so it cannot accidentally move focus or re-nest the paragraph.
+
+## Merging editor changes
+
+Do not resolve editor conflicts by blindly choosing **Accept incoming change** or
+**Accept current change**. Those labels are relative to the merge operation, not a
+guarantee that “incoming” is the new editor. Resolve conflicts by retaining the
+feature branch implementation and integrating any independent changes from
+`main`, then run the checks below and confirm that `index.html` contains the new
+application version. Accepting the `main` side for conflicts in `editor.js`,
+`style.css`, or `index.html` can silently discard the entire editor fix.
+
+Runtime assets include the application version in their URL. This cache-busting
+query ensures GitHub Pages and the browser request the files from the merged
+release rather than reusing an older editor script.
+
+## Sharing titles
+
+The Share action passes the current note title, text, and complete URL to the Web
+Share API. Copy link also places a rich HTML link labelled with the note title on
+the clipboard while retaining the raw URL as plain text and URI-list data. Static
+Open Graph metadata remains `Note-U`: URL fragments are not sent to web servers or
+social preview crawlers, so a GitHub Pages-only app cannot generate per-note Open
+Graph tags without violating the no-backend constraint.

## Calculator blocks

Create a self-contained Calculator block with `/calculator`, the `/calc` alias, the
block menu, **Turn into → Calculator**, or by typing `== ` at the start of an empty
paragraph. Calculator blocks remain normal recursive Note-U blocks: their stable
ID, authored lines, ordered children, and position are URL-serialized, while
results, variables, errors, caches, selection, and focus are always derived again
after loading. Turning ordinary text into a calculator preserves its plain text;
turning it back into a paragraph preserves authored lines separated by newlines.

The restricted calculator engine supports parentheses, unary `+`/`-`, `+`, `-`,
`*` (or `x`), `/`, right-associative `^`, and postfix `%`. Numbers may use valid
comma or space thousands groups and case-insensitive `k` (thousand) or `m`
(million) suffixes. A percentage normally means its fraction (`10%` is `0.1`);
`A + B%` and `A - B%` adjust A by that percentage, while multiplication, division,
and `B% of A` use the fractional value.

Assignments such as `Price per night = 180` define case-insensitive, source-ordered
variables for later lines, including multiword names. `Label: expression` creates
an eligible labeled value, `// comment` adds an ignored trailing authored comment,
and `# Section` starts a subtotal scope. Reserved `subtotal` rows sum eligible
values in the current section; `total` and `sum` cover the block. Assignments,
headings, errors, and aggregate rows are not automatically counted.

Enter and Shift+Enter add a calculator line. Ctrl/Cmd+Enter exits to a paragraph;
Alt+Enter inserts the previous valid result; Tab and Shift+Tab indent or outdent the
whole block. Plain-text multiline paste creates calculator lines, and clicking a
valid result inserts its parser-compatible numeric literal at an available caret.

The calculator is local and deterministic. It never uses dynamic JavaScript,
injected HTML, remote code, or a general-purpose math dependency. This release does
not include currency, cryptocurrency, physical-unit, exchange-rate, or conversion
support, and ordinary text blocks are not calculated. The token/value boundary in
`calculator.js` allows future value types without replacing editor or URL integration.
