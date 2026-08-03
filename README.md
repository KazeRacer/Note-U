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

The editor renders the hierarchical block tree serialized by `storage.js`. Every
block owns an ordered child container, so structural operations move complete
subtrees and never synthesize visual indentation. Legacy flat indentation is
converted only at the load boundary. One capture-phase keyboard dispatcher applies
the shared Enter, Tab, Backspace and Delete policies; Calculator and code contribute
explicit behavior without installing competing global listeners.

Each textual block has one stable editing host. Native selection is left untouched
inside a host; the Selection API extends a pointer selection only after it crosses a
host boundary. Block dragging starts exclusively on the lateral handle. Ctrl/Cmd+A
selects the logical editing host, then its outer block and subtree, then the note.
Code uses its complete buffer as the first logical unit rather than a hard line.

Tab is consistently structural, including in code and Calculator blocks. Shift+Enter
in code inserts a literal newline; Calculator Enter and Shift+Enter create rows.
An empty trailing Calculator row exits to a paragraph, while Backspace removes only
an empty row (or converts a sole empty Calculator to a paragraph).

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
