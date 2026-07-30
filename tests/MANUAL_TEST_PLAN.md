# Note-U manual acceptance plan

Serve the repository with `python3 -m http.server 4173`, open the page in a desktop
browser, keep DevTools Console visible, and repeat the responsive checks at 375 px.

Before interaction, inspect the page source and confirm application version 0.7.3
and `editor.js?v=0.7.3`; an older value means the new editor is not deployed.

- Create paragraph, H1, H2, H3, bullet, number, checklist, toggle, quote, code, and
  divider blocks from the slash menu. Filter with `/todo`, `/heading`, `/code`, and
  `/toggle`; use arrows, Enter, Escape, and pointer selection.
- In separate empty blocks type every shortcut: `- `, `1. `, `[] `, `[ ] `, `# `,
  `## `, `### `, `> `, `--- `, and three backticks plus space. Verify ordinary
  mid-line text is unchanged.
- Verify Enter splits ordinary content; headings create paragraphs; lists,
  checklists, quotes, and code continue their type once and become paragraphs on
  the next empty Enter without crossing their parent; toggle Enter focuses a child;
  and Shift+Enter always creates a soft break.
- Use Tab and Shift+Tab on one block and a native selection spanning several
  blocks. Verify tree depth changes one level, order and complete subtrees survive,
  and Tab/Shift+Tab edit selected code lines rather than nesting the code block.
- Exercise Backspace at the start and in text. Exercise Delete normally. Press
  Ctrl+A/Cmd+A twice, delete, and verify one editable paragraph remains. Undo and
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
