# Note-U manual acceptance plan

Serve the repository with `python3 -m http.server 4173`, open the page in a desktop
browser, keep DevTools Console visible, and repeat the responsive checks at 375 px.

Before interaction, inspect the page source and confirm application version 0.9.0
and `editor.js?v=0.9.0`; an older value means the new editor is not deployed.

- Create paragraph, H1, H2, H3, bullet, number, checklist, toggle, quote, code, and
  divider blocks from the slash menu. Filter with `/todo`, `/heading`, `/code`, and
  `/toggle`; use arrows, Enter, Escape, and pointer selection.
- In separate empty blocks type every shortcut: `- `, `1. `, `[] `, `[ ] `, `# `,
  `## `, `### `, `> `, `--- `, and three backticks plus space. Verify ordinary
  mid-line text is unchanged.
- Verify Enter splits ordinary content; headings create paragraphs; lists,
  checklists and quotes continue their type once and become paragraphs on the next
  empty Enter; toggle Enter focuses a child; code preserves hard newlines; and
  Shift+Enter creates the documented soft break or special-block newline/row.
- Use Tab and Shift+Tab on every type and a selection spanning several blocks.
  Verify tree depth changes one level, order and complete subtrees survive, root
  outdent is a no-op, and code and Calculator follow the same structural policy.
- Exercise Backspace at the start and Delete at the end of every type; verify
  symmetric merges and atomic selection. Press Ctrl+A/Cmd+A three times and verify
  content, subtree, then whole-note selection; delete and verify one paragraph. Undo and
  redo typing, transforms, nesting, dragging, deletion, and whole-note reset.
- Drag-select partial text, multiple lines, adjacent blocks, and nested blocks.
  Use context actions for duplicate, delete, move, transform, and clear formatting
  across the selection; verify selected parents are handled only once.
- Drag from text in one editing block through several sibling and nested blocks in
  both directions. Verify native text highlighting follows the pointer, double and
  triple click still work, and the lateral handle remains reserved for block drag.
- Build three nested toggles containing every block type. Close, reload from the
  copied URL, reopen, move, duplicate, transform, indent, and outdent them.
- Create interrupted and nested numbered sequences; insert, delete, move, indent,
  and outdent items and verify each sibling sequence renumbers independently.
- Apply bold, italic, strike, highlight, and safe links. Reject `javascript:` links.
  Clear formatting across blocks and verify plain text and children remain.
- Paste plain text, multiline text, a URL over selected text, surrounding URL
  punctuation, and rich clipboard data from web/office apps. Verify no HTML style,
  media, event handler, remote resource, or unsupported element enters the DOM.
- Copy/reload URL notes containing Unicode, emoji, long text, all inline marks,
  links, checklist states, multiline quote/code, deep trees, closed toggles, and
  dividers. Try empty, truncated, corrupt, and legacy hashes without console errors.
- Change title and emoji; verify favicon and title. Copy link after an unsaved edit.
  Click New note and verify a blank URL opens in a new tab while this note remains.
- At desktop and 375 px widths, verify controls do not overlap, menus remain inside
  and scroll within the viewport, the URL-only message is centered, and native
  pointer selection works. Finish with zero unexpected Console errors.

- Open `/cal` and apply Calculator with Enter; repeat with Tab and verify Tab does
  not indent. Repeat `/tog`, `/head 2`, `/num`, and `/check`; Escape closes without
  conversion, Backspace over the slash closes the menu, and pointer/touch applies.
- Build a bullet with nested H2, paragraph, to-do, toggle, quote, code, Calculator
  and divider children. Move the parent by its handle and verify all descendants,
  IDs, ordering and numbering move together; undo and redo the single operation.
- Drag from the document gutter and confirm whole blocks, not partial text, are
  selected. Shift-click a handle for a range and modifier-click to toggle a block.
- Paste a safe external URL over selected text and verify the label remains; paste
  unsafe schemes and verify rejection. Paste Calculator/code URLs as plain text.
  Paste a valid and malformed Note-U URL and verify the current note never crashes.
- Copy the note link, inspect plain-text and rich clipboard representations, reload
  it, and verify the tree and authored Calculator rows round-trip. Ordinary address
  bar copy remains raw; static GitHub Pages cannot promise per-note link previews
  because URL fragments are not sent to the server.


## Calculator acceptance

- Create calculators with `/calculator`, `/calc`, both block menus, Turn into, and
  `== ` at the exact start of an empty paragraph. Confirm it does not activate
  mid-line, in another type, during composition, or from pasted text.
- Test Enter, Shift+Enter, Alt+Enter, Ctrl/Cmd+Enter, result click, multiline paste,
  Escape, Tab, Shift+Tab, first-empty-line Backspace, undo/redo, selection, duplicate,
  delete, drag, nesting/outdenting, and Calculator-to-paragraph conversion.
- Evaluate arithmetic, suffixes, percentages, variables, labels, comments, sections,
  subtotals, totals, malformed input, and zero division at desktop and 375 px.
- Reload copied calculator and legacy URLs. Confirm authored lines, hierarchy, and
  IDs survive while derived results and errors are rebuilt rather than serialized.
