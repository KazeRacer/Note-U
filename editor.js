(() => {
  'use strict';

  const TYPES = new Set([
    'paragraph', 'heading-1', 'heading-2', 'heading-3', 'bulleted-list',
    'numbered-list', 'checklist', 'toggle', 'quote', 'code', 'divider', 'calculator', 'callout', 'table'
  ]);
  const CONTINUATION_TYPES = new Set([
    'bulleted-list', 'numbered-list', 'checklist', 'quote', 'code'
  ]);
  const HEADING_TYPES = new Set(['heading-1', 'heading-2', 'heading-3']);
  const SHORTCUTS = new Map([
    ['``` ', 'code'], ['--- ', 'divider'], ['== ', 'calculator'], ['[ ] ', 'checklist'],
    ['[] ', 'checklist'], ['### ', 'heading-3'], ['## ', 'heading-2'],
    ['# ', 'heading-1'], ['1. ', 'numbered-list'], ['- ', 'bulleted-list'],
    ['> ', 'toggle'], ['* ', 'bulleted-list'], ['+ ', 'bulleted-list'], ['1) ', 'numbered-list'],
    ['[x] ', 'checklist'], ['" ', 'quote']
  ]);
  const INLINE_MARKDOWN_RULES = [
    { pattern: /\*\*(?=\S)([^*]+?)(?<=\S)\*\*$/, tag: 'strong' },
    { pattern: /(?<![\w*])\*(?=[^\s*])([^*]+?)(?<=[^\s*])\*$/, tag: 'em' },
    { pattern: /(?<![\w_])_(?=[^\s_])([^_]+?)(?<=[^\s_])_$/, tag: 'em' },
    { pattern: /~~(?=\S)([^~]+?)(?<=\S)~~$/, tag: 's' },
    { pattern: /==(?=\S)([^=]+?)(?<=\S)==$/, tag: 'mark' },
    { pattern: /`([^`]+)`$/, tag: 'code' },
    { pattern: /\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^\s)]+)\)$/, tag: 'a' }
  ];
  const ZERO_WIDTH = '\u200B';
  const URL_PATTERN = /https?:\/\/[^\s<]+/gi;
  const SELECT_ALL_WINDOW = 1200;

  function countText(value) {
    const text = String(value ?? '').replace(/\u200B/g, '');
    const words = text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
    const flat = text.replace(/\r?\n/g, '');
    return {
      words,
      characters: Array.from(flat).length,
      charactersNoSpaces: Array.from(flat.replace(/\s/g, '')).length
    };
  }

  function createEditor(options = {}) {
    const {
      root,
      onChange = () => {},
      onRequestMenu = () => {},
      onCloseMenu = () => {},
      onSelectionChange = () => {},
      numberFormat = 'international',
      localize = (text) => text,
      notify = () => {}
    } = options;
    if (!(root instanceof HTMLElement)) throw new Error('NoteEditor requires a valid root element.');

    const controller = new AbortController();
    const { signal } = controller;
    let counter = 0;
    let activeMenuBlock = null;
    let savedRange = null;
    let suppressChanges = false;
    let history = [];
    let historyIndex = -1;
    let restoringHistory = false;
    let drag = null;
    let pointerSelection = null;
    let suppressHandleClick = false;
    let skipComposedShortcut = false;
    let selectAllState = { block: null, stage: 0, time: 0 };
    let calculatorNumberFormat = numberFormat === 'european' ? 'european' : 'international';
    let preferredCaretX = null;
    let structuralSelectionMode = null;
    let lastRecordTime = 0;
    let lastRecordTyping = false;

    root.contentEditable = 'false';

    function id() {
      counter += 1;
      return `block-${Date.now().toString(36)}-${counter.toString(36)}`;
    }

    function typeOf(value) {
      return TYPES.has(value) ? value : 'paragraph';
    }

    function cleanHtml(value) {
      const html = typeof value === 'string' ? value : '';
      return window.NoteStorage?.sanitizeInlineHtml(html) || (html.trim() ? html : '<br>');
    }

    function editable(className, html = '') {
      const element = document.createElement('div');
      element.className = className;
      element.dataset.blockContent = 'true';
      element.contentEditable = 'true';
      element.spellcheck = true;
      element.innerHTML = cleanHtml(html) || '<br>';
      return element;
    }

    function handle() {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'block-handle';
      button.tabIndex = -1;
      button.contentEditable = 'false';
      button.dataset.dragHandle = 'true';
      button.draggable = false;
      button.setAttribute('aria-label', 'Block actions');
      button.textContent = '⋮⋮';
      return button;
    }

    function childContainer(block, create = true) {
      if (!block) return null;
      if (block.dataset.type === 'toggle') {
        return block.querySelector(':scope > .block-main > .toggle-body');
      }
      let container = block.querySelector(':scope > .block-children');
      if (!container && create) {
        container = document.createElement('div');
        container.className = 'block-children';
        container.dataset.blockChildren = 'true';
        block.append(container);
      }
      return container;
    }

    function createBlock(rawType = 'paragraph', data = {}) {
      const type = typeOf(rawType);
      const block = document.createElement('div');
      block.className = 'block';
      block.dataset.type = type;
      block.dataset.blockId = data.id || id();
      block.append(handle());

      const main = document.createElement('div');
      main.className = 'block-main';
      block.append(main);

      if (type === 'divider') {
        const rule = document.createElement('hr');
        rule.className = 'block-divider';
        rule.contentEditable = 'false';
        main.append(rule);
      } else if (type === 'toggle') {
        block.dataset.open = data.open === false ? 'false' : 'true';
        const row = document.createElement('div');
        row.className = 'toggle-row';
        const caret = document.createElement('button');
        caret.type = 'button';
        caret.className = 'toggle-caret';
        caret.tabIndex = -1;
        caret.contentEditable = 'false';
        caret.dataset.toggleCaret = 'true';
        caret.setAttribute('aria-label', 'Toggle content');
        caret.textContent = '▶';
        const title = editable('toggle-title', data.html || '');
        title.dataset.titleStyle = HEADING_TYPES.has(data.titleStyle) ? data.titleStyle : 'paragraph';
        const body = document.createElement('div');
        body.className = 'toggle-body';
        body.dataset.blockChildren = 'true';
        row.append(caret, title);
        main.append(row, body);
      } else if (type === 'calculator') {
        const sheet = document.createElement('div');
        sheet.className = 'calculator-sheet';
        sheet.setAttribute('aria-label', 'Calculator');
        const marker = document.createElement('span');
        marker.className = 'calculator-marker';
        marker.setAttribute('aria-hidden', 'true');
        marker.textContent = 'fx';
        const rows = Array.isArray(data.rows) ? data.rows : null;
        const lines = rows || (Array.isArray(data.lines) ? data.lines : [data.text ?? plainText(data.html || '')]);
        const list = document.createElement('div');
        list.className = 'calculator-lines';
        (lines.length ? lines : ['']).forEach((line) => list.append(createCalculatorRow(
          typeof line === 'object' ? line.text : line,
          typeof line === 'object' ? line.id : undefined
        )));
        sheet.append(marker, list);
        main.append(sheet);
        recalculate(block);
      } else if (type === 'table') {
        block.dataset.header = data.header === false ? 'false' : 'true';
        main.append(createTable(data));
      } else if (type === 'code') {
        const code = document.createElement('pre');
        code.className = 'block-content code-content';
        code.dataset.blockContent = 'true';
        code.contentEditable = 'true';
        code.spellcheck = false;
        code.textContent = data.text ?? plainText(data.html || '');
        if (!code.textContent) code.append(document.createElement('br'));
        main.append(code);
      } else {
        const row = document.createElement('div');
        row.className = 'block-row';
        if (type === 'bulleted-list' || type === 'numbered-list') {
          const marker = document.createElement('span');
          marker.className = 'list-marker';
          marker.contentEditable = 'false';
          marker.setAttribute('aria-hidden', 'true');
          marker.textContent = type === 'bulleted-list' ? '•' : '1.';
          row.append(marker);
        }
        if (type === 'callout') {
          const icon = document.createElement('span');
          icon.className = 'callout-icon';
          icon.contentEditable = 'false';
          icon.setAttribute('aria-hidden', 'true');
          icon.textContent = '💡';
          row.append(icon);
        }
        if (type === 'checklist') {
          const label = document.createElement('label');
          label.className = 'check-marker';
          label.contentEditable = 'false';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = data.checked === true;
          checkbox.setAttribute('aria-label', 'Complete item');
          label.append(checkbox);
          row.append(label);
          block.dataset.checked = checkbox.checked ? 'true' : 'false';
        }
        row.append(editable('block-content', data.html || ''));
        main.append(row);
      }

      const container = childContainer(block);
      (data.children || []).forEach((child) => container.append(child));
      return block;
    }

    const TABLE_ACTIONS = [
      ['add-row', '+ Row'], ['add-column', '+ Column'], ['delete-row', '− Row'],
      ['delete-column', '− Column'], ['toggle-header', 'Header row'], ['delete-table', 'Delete table']
    ];

    function createTableCell(html = '') {
      const cell = document.createElement('td');
      const surface = editable('table-cell', html);
      surface.setAttribute('role', 'textbox');
      surface.setAttribute('aria-label', localize('Table cell'));
      cell.append(surface);
      return cell;
    }

    function createTableRow(values) {
      const row = document.createElement('tr');
      values.forEach((value) => row.append(createTableCell(value)));
      return row;
    }

    // Builds the scrollable grid plus its discreet toolbar; cells are ordinary inline-rich editing hosts.
    function createTable(data = {}) {
      const valid = Array.isArray(data.cells) && data.cells.length && Array.isArray(data.cells[0]);
      const grid = valid ? data.cells : [[data.html || '', '', ''], ['', '', ''], ['', '', '']];
      const wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      const scroll = document.createElement('div');
      scroll.className = 'table-scroll';
      const table = document.createElement('table');
      table.className = 'note-table';
      const body = document.createElement('tbody');
      grid.forEach((values) => body.append(createTableRow(values)));
      table.append(body);
      scroll.append(table);
      const tools = document.createElement('div');
      tools.className = 'table-tools';
      tools.contentEditable = 'false';
      TABLE_ACTIONS.forEach(([action, label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.tabIndex = -1;
        button.dataset.tableAction = action;
        button.textContent = localize(label);
        tools.append(button);
      });
      wrap.append(scroll, tools);
      return wrap;
    }

    function tableGrid(block) {
      return [...block.querySelectorAll(':scope > .block-main tr')]
        .map((row) => [...row.querySelectorAll('.table-cell')]);
    }

    function cellPosition(content) {
      const block = blockFrom(content);
      const grid = block ? tableGrid(block) : [];
      for (let r = 0; r < grid.length; r += 1) {
        const c = grid[r].indexOf(content);
        if (c >= 0) return { r, c };
      }
      return null;
    }

    function surfaceKey(content) {
      const row = content?.closest?.('.calculator-row');
      if (row) return row.dataset.rowId;
      if (content?.classList?.contains('table-cell')) {
        const position = cellPosition(content);
        return position ? `${position.r}:${position.c}` : '';
      }
      return '';
    }

    function surfaceByKey(block, key) {
      if (block?.dataset.type === 'calculator') {
        return [...block.querySelectorAll('.calculator-row')]
          .find((row) => row.dataset.rowId === key)?.querySelector('.calculator-input') || null;
      }
      if (block?.dataset.type === 'table') {
        const [r, c] = String(key).split(':').map(Number);
        return tableGrid(block)[r]?.[c] || null;
      }
      return null;
    }

    function tableIsEmpty(block) {
      return tableGrid(block).flat().every((cell) => empty(cell));
    }

    function placeCaretIn(surface, x, direction) {
      const point = x == null
        ? textPointAtOffset(surface, direction < 0 ? surface.textContent.length : 0)
        : closestCaretAtX(surface, x, direction < 0 ? surface.textContent.length : 0);
      const range = document.createRange();
      range.setStart(point.node, point.offset);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      surface.focus({ preventScroll: true });
      surface.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      saveSelection();
    }

    function tableAction(block, action, content) {
      const grid = tableGrid(block);
      const cell = content || block._lastCell;
      const position = (cell && cellPosition(cell)) || { r: 0, c: 0 };
      const body = block.querySelector('tbody');
      let target = null;
      if (action === 'add-row') {
        const row = createTableRow(Array(grid[0].length).fill(''));
        grid[position.r][0].closest('tr').insertAdjacentElement('afterend', row);
        target = row.children[position.c]?.firstElementChild;
      } else if (action === 'add-column') {
        grid.forEach((cells) => cells[position.c].closest('td').insertAdjacentElement('afterend', createTableCell('')));
        target = tableGrid(block)[position.r][position.c + 1];
      } else if (action === 'delete-row' && grid.length > 1) {
        grid[position.r][0].closest('tr').remove();
        target = tableGrid(block)[Math.min(position.r, grid.length - 2)][position.c];
      } else if (action === 'delete-column' && grid[0].length > 1) {
        grid.forEach((cells) => cells[position.c].closest('td').remove());
        target = tableGrid(block)[position.r][Math.min(position.c, grid[0].length - 2)];
      } else if (action === 'toggle-header') {
        block.dataset.header = block.dataset.header === 'false' ? 'true' : 'false';
        target = cell;
      } else if (action === 'delete-table' || action.startsWith('delete-')) {
        const paragraph = createBlock('paragraph');
        block.replaceWith(paragraph);
        ensureEditor();
        focus(contentOf(paragraph));
        changed();
        return;
      }
      if (!body) return;
      changed();
      if (target) placeCaretIn(target, null, 1);
    }

    function pasteIntoTable(block, content, text) {
      const rows = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n').map((line) => line.split('\t'));
      const start = cellPosition(content);
      if (!start) return;
      rows.forEach((values, rowOffset) => {
        values.forEach((value, columnOffset) => {
          let grid = tableGrid(block);
          while (grid.length <= start.r + rowOffset) {
            block.querySelector('tbody').append(createTableRow(Array(grid[0].length).fill('')));
            grid = tableGrid(block);
          }
          while (grid[0].length <= start.c + columnOffset && grid[0].length < 40) {
            grid.forEach((cells) => cells.at(-1).closest('td').insertAdjacentElement('afterend', createTableCell('')));
            grid = tableGrid(block);
          }
          const cell = grid[start.r + rowOffset]?.[start.c + columnOffset];
          if (cell) cell.textContent = value.trim();
          if (cell && !cell.textContent) cell.innerHTML = '<br>';
        });
      });
      const last = tableGrid(block)[Math.min(start.r + rows.length - 1, tableGrid(block).length - 1)];
      placeCaretIn(last[Math.min(start.c + rows.at(-1).length - 1, last.length - 1)], null, 1);
      changed();
    }

    // Keyboard behavior for table cells: Tab/Enter/arrows move between cells, never across block boundaries by accident.
    function tableKey(event, block, content) {
      if (!content.classList.contains('table-cell')) return false;
      const position = cellPosition(content);
      if (!position) return false;
      const grid = tableGrid(block);
      const flat = grid.flat();
      const index = flat.indexOf(content);
      const collapsed = window.getSelection()?.isCollapsed;
      const modifier = event.ctrlKey || event.metaKey;
      if (event.key === 'Tab' && !modifier && !event.altKey) {
        event.preventDefault();
        if (event.shiftKey) {
          if (flat[index - 1]) placeCaretIn(flat[index - 1], null, -1);
        } else if (flat[index + 1]) {
          placeCaretIn(flat[index + 1], null, 1);
        } else tableAction(block, 'add-row', content);
        return true;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (modifier) {
          const paragraph = createBlock('paragraph');
          block.insertAdjacentElement('afterend', paragraph);
          focus(contentOf(paragraph));
          changed();
        } else if (event.shiftKey) {
          insertText('\n');
          changed();
        } else if (grid[position.r + 1]) {
          placeCaretIn(grid[position.r + 1][position.c], null, 1);
        } else {
          tableAction(block, 'add-row', content);
        }
        return true;
      }
      if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && collapsed && !modifier && !event.altKey && !event.shiftKey) {
        const direction = event.key === 'ArrowUp' ? -1 : 1;
        if (!visualBoundary(content, direction)) return false;
        const x = caretRect()?.left;
        const inside = grid[position.r + direction]?.[position.c];
        const surfaces = visibleEditingSurfaces();
        const outside = direction < 0
          ? surfaces[surfaces.indexOf(flat[0]) - 1]
          : surfaces[surfaces.indexOf(flat.at(-1)) + 1];
        const target = inside || outside;
        if (!target) return false;
        event.preventDefault();
        placeCaretIn(target, x, direction);
        return true;
      }
      if (event.key === 'Backspace' && collapsed && caretAtStart(content)) {
        event.preventDefault();
        if (tableIsEmpty(block)) tableAction(block, 'delete-table', content);
        return true;
      }
      if (event.key === 'Delete' && collapsed && caretAtEnd(content)) {
        event.preventDefault();
        return true;
      }
      return false;
    }

    function createCalculatorRow(text = '', rowId = id()) {
      const row = document.createElement('div');
      row.className = 'calculator-row';
      row.dataset.rowId = rowId || id();
      const input = document.createElement('div');
      input.className = 'calculator-input';
      input.dataset.blockContent = 'true';
      input.dataset.calculatorLine = 'true';
      input.contentEditable = 'true';
      input.spellcheck = false;
      input.setAttribute('role', 'textbox');
      input.setAttribute('aria-label', 'Calculation expression');
      input.textContent = String(text ?? '').replace(/\r?\n/g, ' ');
      if (!input.textContent) input.append(document.createElement('br'));
      const output = document.createElement('button');
      output.type = 'button';
      output.className = 'calculator-result';
      output.tabIndex = -1;
      output.contentEditable = 'false';
      row.append(input, output);
      return row;
    }

    function calculatorLines(block) {
      return [...block.querySelectorAll(':scope > .block-main .calculator-input')].map((line) => line.textContent || '');
    }

    function recalculate(block) {
      if (block?.dataset.type !== 'calculator' || !window.NoteCalculator) return;
      const rows = [...block.querySelectorAll(':scope > .block-main .calculator-row')];
      const results = window.NoteCalculator.evaluateBlock(calculatorLines(block), calculatorNumberFormat);
      block.classList.toggle('is-empty-calculator', rows.length === 1 && empty(rows[0]?.querySelector('.calculator-input')));
      rows.forEach((row, index) => {
        const result = results[index];
        const input = row.querySelector('.calculator-input');
        const output = row.querySelector('.calculator-result');
        row.classList.toggle('is-section', result.kind === 'section');
        output.classList.toggle('is-error', Boolean(result.error));
        output.classList.toggle('is-incomplete', Boolean(result.incomplete));
        output.disabled = result.value === undefined;
        output.dataset.literal = result.literal || '';
        output.textContent = result.error
          ? `${localize('Error')}: ${localize(result.error)}`
          : result.formatted || localize(result.warning || '');
        const status = localize(result.error || result.warning || '')
          || (result.formatted ? `${localize('Result')}: ${result.formatted}` : localize('No result'));
        output.setAttribute('aria-label', status);
        input.setAttribute('aria-describedby', `${block.dataset.blockId}-result-${index}`);
        output.id = `${block.dataset.blockId}-result-${index}`;
      });
    }

    function plainText(html) {
      const template = document.createElement('template');
      template.innerHTML = html;
      return template.content.textContent || '';
    }

    function contentOf(block) {
      if (!block) return null;
      if (block.dataset.type === 'toggle') {
        return block.querySelector(':scope > .block-main > .toggle-row > .toggle-title');
      }
      if (block.dataset.type === 'calculator') return block.querySelector(':scope > .block-main .calculator-input');
      return block.querySelector(':scope > .block-main [data-block-content]');
    }

    function directBlocks(container) {
      return [...container?.children || []].filter((node) => node.classList?.contains('block'));
    }

    function visibleEditingSurfaces(container = root, result = []) {
      directBlocks(container).forEach((block) => {
        if (block.dataset.type === 'calculator') {
          block.querySelectorAll(':scope > .block-main .calculator-input').forEach((surface) => result.push(surface));
        } else if (block.dataset.type === 'table') {
          tableGrid(block).flat().forEach((surface) => result.push(surface));
        } else {
          const surface = contentOf(block);
          if (surface) result.push(surface);
        }
        const children = childContainer(block, false);
        if (children && (block.dataset.type !== 'toggle' || block.dataset.open === 'true')) {
          visibleEditingSurfaces(children, result);
        }
      });
      return result;
    }

    function positionFromSelection(content, affinity = 'forward') {
      const selection = window.getSelection();
      if (!content || !selection?.rangeCount || !content.contains(selection.anchorNode)) return null;
      const range = document.createRange();
      range.selectNodeContents(content);
      range.setEnd(selection.anchorNode, selection.anchorOffset);
      const block = blockFrom(content);
      const row = content.closest('.calculator-row');
      const key = surfaceKey(content);
      return {
        blockId: block?.dataset.blockId || '',
        surface: row ? 'calculator-row' : block?.dataset.type === 'code' ? 'code' : 'inline',
        ...(key ? { rowId: key } : {}),
        offset: range.toString().length,
        affinity,
        preferredX: preferredCaretX
      };
    }

    function adjacentEditablePosition(position, direction) {
      if (!position?.blockId) return null;
      const surfaces = visibleEditingSurfaces();
      const index = surfaces.findIndex((surface) => {
        const block = blockFrom(surface);
        return block?.dataset.blockId === position.blockId && (!position.rowId || surfaceKey(surface) === position.rowId);
      });
      const surface = surfaces[index + direction];
      if (!surface) return null;
      const block = blockFrom(surface);
      const row = surface.closest('.calculator-row');
      const key = surfaceKey(surface);
      return {
        blockId: block.dataset.blockId,
        surface: row ? 'calculator-row' : block.dataset.type === 'code' ? 'code' : 'inline',
        ...(key ? { rowId: key } : {}),
        offset: direction < 0 ? surface.textContent.length : 0,
        affinity: direction < 0 ? 'backward' : 'forward',
        preferredX: position.preferredX,
        element: surface
      };
    }

    function captureCaret() {
      const selection = window.getSelection();
      if (!selection?.rangeCount || !selection.isCollapsed) return null;
      const anchor = selection.anchorNode;
      const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
      const content = element?.closest?.('[data-block-content]');
      if (!content || !root.contains(content)) return null;
      const position = positionFromSelection(content);
      return position ? { blockId: position.blockId, rowId: position.rowId, offset: position.offset } : null;
    }

    function restoreCaret(caret) {
      const fallback = () => focus(contentOf(root.querySelector('.block')), true);
      if (!caret?.blockId) { fallback(); return; }
      const block = [...root.querySelectorAll('.block')].find((item) => item.dataset.blockId === caret.blockId);
      let surface = block ? contentOf(block) : null;
      if (caret.rowId) surface = surfaceByKey(block, caret.rowId) || surface;
      if (!surface) { fallback(); return; }
      const point = textPointAtOffset(surface, caret.offset);
      const range = document.createRange();
      range.setStart(point.node, point.offset);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      surface.focus({ preventScroll: true });
      saveSelection();
      surface.scrollIntoView?.({ block: 'nearest' });
    }

    function caretRect() {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return null;
      const range = selection.getRangeAt(0).cloneRange();
      range.collapse(true);
      const rect = range.getClientRects()[0];
      if (rect) return rect;
      const marker = document.createElement('span');
      marker.textContent = '\u200b';
      range.insertNode(marker);
      const markerRect = marker.getBoundingClientRect();
      marker.remove();
      return markerRect;
    }

    function visualBoundary(content, direction) {
      const rect = caretRect();
      const surfaceRect = content.getBoundingClientRect();
      if (!rect) return false;
      const lineHeight = Number.parseFloat(getComputedStyle(content).lineHeight) || 24;
      return direction < 0
        ? rect.top <= surfaceRect.top + lineHeight * 0.55
        : rect.bottom >= surfaceRect.bottom - lineHeight * 0.55;
    }

    function textPointAtOffset(content, wantedOffset) {
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      let remaining = Math.max(0, wantedOffset);
      while (walker.nextNode()) {
        if (remaining <= walker.currentNode.data.length) return { node: walker.currentNode, offset: remaining };
        remaining -= walker.currentNode.data.length;
      }
      return { node: content, offset: content.childNodes.length };
    }

    function closestCaretAtX(content, x, fallbackOffset) {
      const length = content.textContent.length;
      if (!length) return textPointAtOffset(content, 0);
      let best = textPointAtOffset(content, fallbackOffset);
      let distance = Infinity;
      for (let offset = 0; offset <= length; offset += 1) {
        const point = textPointAtOffset(content, offset);
        const probe = document.createRange();
        probe.setStart(point.node, point.offset);
        probe.collapse(true);
        const rect = probe.getClientRects()[0];
        if (rect && Math.abs(rect.left - x) < distance) {
          best = point;
          distance = Math.abs(rect.left - x);
        }
      }
      return best;
    }

    function verticalArrow(event, block, content) {
      if (event.altKey || event.ctrlKey || event.metaKey || !window.getSelection()?.isCollapsed) return false;
      const direction = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
      if (!direction || !visualBoundary(content, direction)) return false;
      const rect = caretRect();
      const position = positionFromSelection(content, direction < 0 ? 'backward' : 'forward');
      preferredCaretX ??= rect?.left ?? content.getBoundingClientRect().left;
      position.preferredX = preferredCaretX;
      const target = adjacentEditablePosition(position, direction);
      if (!target) return false;
      event.preventDefault();
      const point = closestCaretAtX(target.element, preferredCaretX, target.offset);
      const selection = window.getSelection();
      if (event.shiftKey && selection.extend) selection.extend(point.node, point.offset);
      else {
        const range = document.createRange();
        range.setStart(point.node, point.offset);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      target.element.focus({ preventScroll: true });
      target.element.scrollIntoView({ block: 'nearest' });
      return true;
    }

    function horizontalArrow(event, content) {
      if (!window.getSelection()?.isCollapsed || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
      const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      if (!direction || (direction < 0 ? !caretAtStart(content) : !caretAtEnd(content))) return false;
      const position = positionFromSelection(content, direction < 0 ? 'backward' : 'forward');
      const target = adjacentEditablePosition(position, direction);
      if (!target) return false;
      event.preventDefault();
      focus(target.element, direction < 0);
      return true;
    }

    function blockFrom(node) {
      const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      return element?.closest?.('.block') || null;
    }

    function caretFromPoint(x, y) {
      if (document.caretPositionFromPoint) {
        const position = document.caretPositionFromPoint(x, y);
        if (position) return { node: position.offsetNode, offset: position.offset };
      }
      if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(x, y);
        if (range) return { node: range.startContainer, offset: range.startOffset };
      }
      return null;
    }

    function extendPointerSelection(event) {
      if (!pointerSelection || event.pointerId !== pointerSelection.pointerId || !(event.buttons & 1)) return false;
      const focus = caretFromPoint(event.clientX, event.clientY);
      if (!focus || !root.contains(focus.node)) return false;
      const focusBlock = blockFrom(focus.node);
      if (!pointerSelection.started && focusBlock === pointerSelection.anchorBlock) return false;
      event.preventDefault();
      pointerSelection.started = true;
      const selection = window.getSelection();
      if (selection.setBaseAndExtent) {
        selection.setBaseAndExtent(
          pointerSelection.anchor.node,
          pointerSelection.anchor.offset,
          focus.node,
          focus.offset
        );
      } else {
        const range = document.createRange();
        const anchorRange = document.createRange();
        const focusRange = document.createRange();
        anchorRange.setStart(pointerSelection.anchor.node, pointerSelection.anchor.offset);
        anchorRange.collapse(true);
        focusRange.setStart(focus.node, focus.offset);
        focusRange.collapse(true);
        if (anchorRange.compareBoundaryPoints(Range.START_TO_START, focusRange) <= 0) {
          range.setStart(pointerSelection.anchor.node, pointerSelection.anchor.offset);
          range.setEnd(focus.node, focus.offset);
        } else {
          range.setStart(focus.node, focus.offset);
          range.setEnd(pointerSelection.anchor.node, pointerSelection.anchor.offset);
        }
        selection.removeAllRanges();
        selection.addRange(range);
      }
      saveSelection();
      onSelectionChange(selection);
      return true;
    }

    function currentBlock() {
      const selection = window.getSelection();
      return blockFrom(selection?.anchorNode) || activeMenuBlock;
    }

    function selectionInEditor(selection = window.getSelection()) {
      if (!selection || selection.rangeCount === 0) return false;
      const range = selection.getRangeAt(0);
      const hits = [...root.querySelectorAll('.block')].filter((block) => {
        const own = contentOf(block) || block.querySelector(':scope > .block-main > .block-divider');
        try { return own && range.intersectsNode(own); } catch { return false; }
      });
      return hits.filter((block) => !hits.some((other) => other !== block && other.contains(block)));
    }

    function selectedBlocks(fallback = null) {
      const selection = window.getSelection();
      if (!selectionInEditor(selection) || selection.isCollapsed) return fallback ? [fallback] : [];
      const range = selection.getRangeAt(0);
      const hits = [...root.querySelectorAll('.block')].filter((block) => {
        const own = contentOf(block) || block.querySelector(':scope > .block-main > .block-divider');
        try { return own && range.intersectsNode(own); } catch { return false; }
      });
      return hits.filter((block) => !hits.some((other) => other !== block && other.contains(block)));
    }

    function saveSelection() {
      const selection = window.getSelection();
      if (selectionInEditor(selection)) savedRange = selection.getRangeAt(0).cloneRange();
    }

    function restoreSelection() {
      if (!savedRange) return false;
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedRange);
      return true;
    }

    function focus(content, atEnd = false) {
      if (!content) return;
      const range = document.createRange();
      range.selectNodeContents(content);
      range.collapse(!atEnd);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      content.focus();
      saveSelection();
    }

    function empty(content) {
      return !(content?.textContent || '').replace(/[\u200B\u00A0]/g, '').trim();
    }

    function ensureEditor() {
      if (!root.querySelector(':scope > .block')) root.append(createBlock());
      const blocks = [...root.querySelectorAll(':scope > .block')];
      root.classList.toggle('is-empty', blocks.length === 1 && blocks[0].dataset.type === 'paragraph' && empty(contentOf(blocks[0])));
    }

    function serializeBlock(block) {
      const type = typeOf(block.dataset.type);
      const result = { type, id: block.dataset.blockId };
      const content = contentOf(block);
      if (type === 'calculator') {
        result.lines = calculatorLines(block);
        result.rows = [...block.querySelectorAll(':scope > .block-main .calculator-row')].map((row) => ({
          id: row.dataset.rowId,
          text: row.querySelector('.calculator-input')?.textContent || ''
        }));
      } else if (type === 'table') {
        result.cells = tableGrid(block).map((cells) => cells.map((cell) => {
          const html = cell.innerHTML.replace(/\u200B/g, '');
          return html === '<br>' ? '' : html;
        }));
        if (block.dataset.header === 'false') result.header = false;
      } else if (type === 'code') {
        if (content.textContent) result.text = content.textContent;
      } else if (type !== 'divider') {
        const html = content.innerHTML.replace(/\u200B/g, '');
        if (html && html !== '<br>') result.html = html;
      }
      if (type === 'checklist' && block.dataset.checked === 'true') result.checked = true;
      if (type === 'toggle') {
        if (content.dataset.titleStyle !== 'paragraph') result.titleStyle = content.dataset.titleStyle;
        if (block.dataset.open === 'false') result.open = false;
      }
      const children = [...childContainer(block, false)?.children || []]
        .filter((child) => child.classList.contains('block'))
        .map(serializeBlock);
      if (children.length) result.children = children;
      return result;
    }

    function serialize() {
      return [...root.children].filter((node) => node.classList?.contains('block')).map(serializeBlock);
    }

    function snapshot() {
      return JSON.stringify(serialize());
    }

    function recordHistory(typing = false) {
      if (restoringHistory) return;
      const data = snapshot();
      if (history[historyIndex]?.data === data) return;
      const now = Date.now();
      const entry = { data, caret: captureCaret() };
      const coalesce = typing && lastRecordTyping && historyIndex > 0
        && historyIndex === history.length - 1 && now - lastRecordTime < 900;
      lastRecordTyping = typing;
      lastRecordTime = now;
      if (coalesce) {
        history[historyIndex] = entry;
        return;
      }
      history = history.slice(0, historyIndex + 1);
      history.push(entry);
      if (history.length > 200) history.shift();
      historyIndex = history.length - 1;
    }

    function refreshNumbers(container = root) {
      let number = 0;
      [...container.children].filter((node) => node.classList?.contains('block')).forEach((block) => {
        if (block.dataset.type === 'numbered-list') {
          number += 1;
          const marker = block.querySelector(':scope > .block-main > .block-row > .list-marker');
          if (marker) marker.textContent = `${number}.`;
        } else number = 0;
        const children = childContainer(block, false);
        if (children) refreshNumbers(children);
      });
    }

    function changed(options = {}) {
      if (suppressChanges) return;
      ensureEditor();
      refreshNumbers();
      recordHistory(Boolean(options.typing));
      onChange(serialize());
    }

    function dataToBlock(data = {}) {
      const children = Array.isArray(data.children) ? data.children.map(dataToBlock) : [];
      return createBlock(data.type, { ...data, children });
    }

    function load(value = '', preserveHistory = false) {
      suppressChanges = true;
      root.replaceChildren();
      if (Array.isArray(value)) {
        const containers = [root];
        let previous = null;
        let previousDepth = 0;
        value.forEach((data) => {
          const requested = Math.max(0, Number.parseInt(data?.indent, 10) || 0);
          const depth = previous ? Math.min(requested, previousDepth + 1) : 0;
          if (depth > previousDepth && previous) containers[depth] = childContainer(previous);
          containers.length = depth + 1;
          const block = dataToBlock(data);
          (containers[depth] || root).append(block);
          previous = block;
          previousDepth = depth;
        });
      } else if (typeof value === 'string' && value.trim()) {
        const template = document.createElement('template');
        template.innerHTML = window.NoteStorage?.sanitizeBodyHtml(value) || '';
        [...template.content.childNodes].forEach((node) => {
          const text = node.textContent || '';
          if (text.trim()) root.append(createBlock('paragraph', { html: node.nodeType === Node.ELEMENT_NODE ? node.innerHTML : escapeHtml(text) }));
        });
      }
      ensureEditor();
      refreshNumbers();
      suppressChanges = false;
      if (!preserveHistory) {
        history = [{ data: snapshot(), caret: null }];
        historyIndex = 0;
        lastRecordTyping = false;
      }
    }

    function undo(delta) {
      const next = historyIndex + delta;
      if (next < 0 || next >= history.length) return;
      restoringHistory = true;
      historyIndex = next;
      lastRecordTyping = false;
      load(JSON.parse(history[next].data), true);
      restoringHistory = false;
      restoreCaret(history[next].caret);
      onChange(serialize());
    }

    function replace(block, targetType, data = {}) {
      if (!block) return null;
      const target = typeOf(targetType);
      if ((block.dataset.type === target && target !== 'toggle') || block.dataset.type === 'table') return block;
      const oldType = block.dataset.type;
      const content = contentOf(block);
      const children = [...childContainer(block, false)?.children || []];
      const calculatorText = oldType === 'calculator' ? calculatorLines(block).join('\n') : '';
      const html = oldType === 'code' ? escapeHtml(content?.textContent || '') : oldType === 'calculator' ? escapeHtml(calculatorText) : content?.innerHTML || '';
      const replacement = createBlock(target, {
        html,
        text: target === 'code' ? (oldType === 'calculator' ? calculatorText : content?.textContent || plainText(html)) : undefined,
        lines: target === 'calculator' ? (oldType === 'calculator' ? calculatorLines(block) : [content?.textContent || plainText(html)]) : undefined,
        rows: target === 'calculator' && oldType === 'calculator' ? serializeBlock(block).rows : undefined,
        titleStyle: data.titleStyle || (HEADING_TYPES.has(oldType) ? oldType : 'paragraph'),
        children: target === 'toggle' ? children : children
      });
      block.replaceWith(replacement);
      changed();
      return replacement;
    }

    function split(block, content, nextType) {
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);
      if (!range.collapsed) range.deleteContents();
      const right = document.createRange();
      right.selectNodeContents(content);
      right.setStart(range.startContainer, range.startOffset);
      const fragment = right.extractContents();
      const holder = document.createElement('div');
      holder.append(fragment);
      if (empty(content)) content.innerHTML = '<br>';
      const next = createBlock(nextType, {
        html: holder.innerHTML,
        text: nextType === 'code' ? holder.textContent : undefined,
        checked: false
      });
      block.insertAdjacentElement('afterend', next);
      focus(contentOf(next));
      changed();
    }

    function exitToggle(block) {
      const body = block.parentElement;
      if (!body?.classList.contains('toggle-body') || body.lastElementChild !== block) return false;
      const toggle = body.closest('.block[data-type="toggle"]');
      if (!toggle) return false;
      block.remove();
      const paragraph = createBlock('paragraph');
      paragraph.dataset.exitedContainer = toggle.dataset.blockId;
      toggle.insertAdjacentElement('afterend', paragraph);
      focus(contentOf(paragraph));
      changed();
      return true;
    }

    function enter(event, block, content) {
      event.preventDefault();
      if (block.dataset.type === 'calculator') {
        if (event.ctrlKey || event.metaKey) {
          const paragraph = createBlock('paragraph');
          block.insertAdjacentElement('afterend', paragraph);
          focus(contentOf(paragraph));
          changed();
          return;
        }
        if (event.altKey) {
          const rows = [...block.querySelectorAll('.calculator-row')];
          const rowIndex = rows.indexOf(content.closest('.calculator-row'));
          const prior = rows.slice(0, rowIndex).reverse().map((row) => row.querySelector('.calculator-result')?.dataset.literal).find(Boolean);
          if (prior) { insertText(prior); recalculate(block); changed(); }
          return;
        }
        const row = content.closest('.calculator-row');
        const rows = [...block.querySelectorAll('.calculator-row')];
        if (!event.shiftKey && empty(content) && row === rows.at(-1)) {
          const paragraph = createBlock('paragraph');
          row.remove();
          block.insertAdjacentElement('afterend', paragraph);
          focus(contentOf(paragraph));
          changed();
          return;
        }
        const next = createCalculatorRow('');
        row.insertAdjacentElement('afterend', next);
        focus(next.querySelector('.calculator-input'));
        recalculate(block);
        changed();
        return;
      }
      if (block.dataset.type === 'code') {
        const atEnd = caretAtEnd(content);
        if (!event.shiftKey && atEnd && (content.textContent || '').endsWith('\n')) {
          content.textContent = content.textContent.slice(0, -1);
          if (!content.textContent) content.append(document.createElement('br'));
          const paragraph = createBlock('paragraph');
          block.insertAdjacentElement('afterend', paragraph);
          focus(contentOf(paragraph));
          changed();
          return;
        }
        insertText('\n');
        changed();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && block.dataset.type === 'toggle' && content.classList.contains('toggle-title')) {
        block.dataset.open = block.dataset.open === 'true' ? 'false' : 'true';
        changed();
        return;
      }
      if (event.shiftKey) {
        insertText('\n');
        changed();
        return;
      }
      const type = block.dataset.type;
      if (type === 'toggle' && content.classList.contains('toggle-title')) {
        block.dataset.open = 'true';
        const body = childContainer(block);
        let child = body.querySelector(':scope > .block');
        if (!child) {
          child = createBlock('paragraph');
          body.append(child);
          changed();
        }
        focus(contentOf(child));
        return;
      }
      if (type === 'divider') {
        const paragraph = createBlock();
        block.insertAdjacentElement('afterend', paragraph);
        focus(contentOf(paragraph));
        changed();
        return;
      }
      if (type === 'paragraph' && empty(content) && exitToggle(block)) return;
      if (empty(content) && CONTINUATION_TYPES.has(type) && block.parentElement?.closest('.block')) {
        // An empty nested item first steps out one level, like Notion does.
        indentBlocks(block, true);
        return;
      }
      if (empty(content) && (CONTINUATION_TYPES.has(type) || HEADING_TYPES.has(type))) {
        const paragraph = replace(block, 'paragraph');
        focus(contentOf(paragraph));
        return;
      }
      if (type === 'callout') {
        split(block, content, 'paragraph');
        return;
      }
      const nextType = HEADING_TYPES.has(type) ? 'paragraph' : type;
      split(block, content, nextType);
    }

    function indent(blocks) {
      if (!blocks.length) return false;
      const first = blocks[0];
      const parent = first.parentElement;
      const previous = first.previousElementSibling;
      if (!previous?.classList.contains('block')) return false;
      const target = childContainer(previous);
      blocks.filter((block) => block.parentElement === parent).forEach((block) => target.append(block));
      return true;
    }

    function outdent(blocks) {
      let moved = false;
      blocks.forEach((block) => {
        const parentBlock = block.parentElement?.closest('.block');
        if (!parentBlock) return;
        parentBlock.insertAdjacentElement('afterend', block);
        moved = true;
      });
      return moved;
    }

    function insertText(text) {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    function tab(event, block) {
      event.preventDefault();
      if (block.dataset.exitedContainer) {
        delete block.dataset.exitedContainer;
        return;
      }
      indentBlocks(block, event.shiftKey);
    }

    function indentBlocks(block, shouldOutdent) {
      const blocks = selectedBlocks(block);
      const caret = captureCaret();
      const moved = shouldOutdent ? outdent(blocks) : indent(blocks);
      if (!moved) return false;
      changed();
      if (caret) restoreCaret(caret);
      else focus(contentOf(blocks[0]), true);
      return true;
    }

    function caretAtStart(content) {
      const selection = window.getSelection();
      if (!selection?.isCollapsed || !selection.rangeCount) return false;
      const range = selection.getRangeAt(0);
      const before = document.createRange();
      before.selectNodeContents(content);
      before.setEnd(range.startContainer, range.startOffset);
      return before.toString() === '';
    }

    const MERGE_FAMILIES = Object.freeze({
      paragraph: 'rich-text',
      'heading-1': 'rich-text',
      'heading-2': 'rich-text',
      'heading-3': 'rich-text',
      'bulleted-list': 'bulleted-list',
      'numbered-list': 'numbered-list',
      checklist: 'checklist'
    });

    function siblingBlock(block, direction) {
      const siblings = directBlocks(block?.parentElement);
      const index = siblings.findIndex((item) => item.dataset.blockId === block?.dataset.blockId);
      return index < 0 ? null : siblings[index + direction] || null;
    }

    function isMergeCompatible(left, right) {
      if (!left || !right || left.parentElement !== right.parentElement) return false;
      const leftFamily = MERGE_FAMILIES[left.dataset.type];
      const rightFamily = MERGE_FAMILIES[right.dataset.type];
      return Boolean(leftFamily && leftFamily === rightFamily);
    }

    function selectOuterBlock(block) {
      if (!block) return;
      root.querySelectorAll('.is-structurally-selected').forEach((item) => item.classList.remove('is-structurally-selected'));
      const range = document.createRange();
      range.selectNode(block);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      block.classList.add('is-structurally-selected');
      structuralSelectionMode = 'block';
    }

    function structurallySelectedBlock() {
      const selected = root.querySelector('.block.is-structurally-selected');
      const selection = window.getSelection();
      if (!selected || !selection?.rangeCount) return null;
      const range = selection.getRangeAt(0);
      return range.startContainer === selected.parentNode
        && range.endContainer === selected.parentNode
        && range.endOffset === range.startOffset + 1
        && selected.parentNode.childNodes[range.startOffset] === selected
        ? selected
        : null;
    }

    function mergeAuthoredBlocks(left, right, caretContent) {
      const leftContent = contentOf(left);
      const rightContent = contentOf(right);
      if (!leftContent || !rightContent || !isMergeCompatible(left, right)) return false;
      const joinOffset = leftContent.textContent.length;
      if (leftContent.innerHTML === '<br>') leftContent.replaceChildren();
      [...rightContent.childNodes].forEach((node) => leftContent.append(node));
      const children = childContainer(right, false);
      if (children) [...children.children].forEach((child) => childContainer(left).append(child));
      right.remove();
      const point = textPointAtOffset(leftContent, joinOffset);
      const range = document.createRange();
      range.setStart(point.node, point.offset);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      (caretContent || leftContent).focus();
      changed();
      return true;
    }

    function joinCalculatorRows(block, row, direction) {
      const rows = [...block.querySelectorAll(':scope > .block-main .calculator-row')];
      const index = rows.findIndex((item) => item.dataset.rowId === row?.dataset.rowId);
      const left = direction < 0 ? rows[index - 1] : rows[index];
      const right = direction < 0 ? rows[index] : rows[index + 1];
      if (!left || !right) return false;
      const leftInput = left.querySelector('.calculator-input');
      const rightInput = right.querySelector('.calculator-input');
      const joinOffset = leftInput.textContent.length;
      const joined = leftInput.textContent + rightInput.textContent;
      leftInput.textContent = joined;
      if (!joined) leftInput.append(document.createElement('br'));
      right.remove();
      const point = textPointAtOffset(leftInput, joinOffset);
      const range = document.createRange();
      range.setStart(point.node, point.offset);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      leftInput.focus();
      recalculate(block);
      changed();
      return true;
    }

    function deleteAuthoredSelection() {
      const selection = window.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed) return false;
      const sourceRange = selection.getRangeAt(0);
      const surfaces = visibleEditingSurfaces().filter((surface) => {
        try { return sourceRange.intersectsNode(surface); } catch { return false; }
      });
      if (!surfaces.length) return false;
      const first = surfaces[0];
      const last = surfaces.at(-1);
      const restoreOffset = first.contains(sourceRange.startContainer)
        ? positionFromRangeBoundary(first, sourceRange.startContainer, sourceRange.startOffset)
        : 0;
      [...surfaces].reverse().forEach((surface) => {
        const range = document.createRange();
        range.selectNodeContents(surface);
        if (surface === first && first.contains(sourceRange.startContainer)) {
          range.setStart(sourceRange.startContainer, sourceRange.startOffset);
        }
        if (surface === last && last.contains(sourceRange.endContainer)) {
          range.setEnd(sourceRange.endContainer, sourceRange.endOffset);
        }
        range.deleteContents();
        if (!surface.textContent && !surface.querySelector('br')) surface.append(document.createElement('br'));
      });
      const point = textPointAtOffset(first, restoreOffset);
      const caret = document.createRange();
      caret.setStart(point.node, point.offset);
      caret.collapse(true);
      selection.removeAllRanges();
      selection.addRange(caret);
      first.focus();
      const calculators = new Set(surfaces.map(blockFrom).filter((block) => block?.dataset.type === 'calculator'));
      calculators.forEach(recalculate);
      changed();
      return true;
    }

    function positionFromRangeBoundary(content, node, offset) {
      const range = document.createRange();
      range.selectNodeContents(content);
      range.setEnd(node, offset);
      return range.toString().length;
    }

    function backspace(event, block, content) {
      if (!caretAtStart(content)) return;
      if (block.dataset.type === 'calculator') {
        const row = content.closest('.calculator-row');
        const rows = [...block.querySelectorAll('.calculator-row')];
        if (rows.length === 1 && empty(content)) {
          event.preventDefault();
          const paragraph = replace(block, 'paragraph');
          focus(contentOf(paragraph));
        } else if (rows.indexOf(row) > 0) {
          event.preventDefault();
          joinCalculatorRows(block, row, -1);
        } else {
          const previous = siblingBlock(block, -1);
          if (previous) {
            event.preventDefault();
            selectOuterBlock(previous);
          }
        }
        return;
      }
      if (block.dataset.exitedContainer) {
        event.preventDefault();
        delete block.dataset.exitedContainer;
        return;
      }
      const parentBlock = block.parentElement?.closest('.block');
      if (parentBlock) {
        event.preventDefault();
        outdent([block]);
        focus(content);
        changed();
        return;
      }
      if (block.dataset.type !== 'paragraph' && empty(content)) {
        event.preventDefault();
        const paragraph = replace(block, 'paragraph');
        focus(contentOf(paragraph));
        return;
      }
      const previous = siblingBlock(block, -1);
      if (!previous) return;
      event.preventDefault();
      if (!mergeAuthoredBlocks(previous, block, content)) selectOuterBlock(previous);
    }


    function caretAtEnd(content) {
      const selection = window.getSelection();
      if (!selection?.isCollapsed || !selection.rangeCount) return false;
      const range = selection.getRangeAt(0);
      const after = document.createRange();
      after.selectNodeContents(content);
      after.setStart(range.endContainer, range.endOffset);
      return after.toString() === '';
    }

    function deleteForward(event, block, content) {
      if (!caretAtEnd(content)) return;
      if (block.dataset.type === 'calculator') {
        const row = content.closest('.calculator-row');
        const rows = [...block.querySelectorAll('.calculator-row')];
        if (rows.indexOf(row) < rows.length - 1) {
          event.preventDefault();
          joinCalculatorRows(block, row, 1);
        } else {
          const next = siblingBlock(block, 1);
          if (next) {
            event.preventDefault();
            selectOuterBlock(next);
          }
        }
        return;
      }
      const next = siblingBlock(block, 1);
      if (!next) return;
      event.preventDefault();
      if (!mergeAuthoredBlocks(block, next, content)) selectOuterBlock(next);
    }


    function normalizedText(content) {
      return (content.textContent || '').replace(/\u200B/g, '').replace(/\u00A0/g, ' ');
    }

    function shortcut(block, content) {
      const text = normalizedText(content);
      if (content.classList.contains('toggle-title')) {
        const heading = SHORTCUTS.get(text);
        if (HEADING_TYPES.has(heading)) {
          content.innerHTML = '<br>';
          content.dataset.titleStyle = heading;
          focus(content);
          changed();
          return true;
        }
        return false;
      }
      const target = SHORTCUTS.get(text);
      if (!target) return false;
      if (target === 'calculator' && block.dataset.type !== 'paragraph') return false;
      content.innerHTML = '<br>';
      const transformed = replace(block, target);
      if (text === '[x] ' && transformed?.dataset.type === 'checklist') {
        transformed.dataset.checked = 'true';
        const box = transformed.querySelector('input[type="checkbox"]');
        if (box) box.checked = true;
        changed();
      }
      if (target === 'divider') {
        const paragraph = createBlock();
        transformed.insertAdjacentElement('afterend', paragraph);
        focus(contentOf(paragraph));
        changed();
      } else focus(contentOf(transformed));
      return true;
    }

    function slash(block, content) {
      const text = normalizedText(content);
      if (block.dataset.type === 'code' || !text.startsWith('/') || text.includes('\n')) {
        onCloseMenu();
        return;
      }
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const rect = range?.getBoundingClientRect();
      const fallback = content.getBoundingClientRect();
      activeMenuBlock = block;
      saveSelection();
      onRequestMenu({
        mode: 'slash', block, query: text.slice(1),
        x: rect?.left || fallback.left, y: (rect?.bottom || fallback.bottom) + 6,
        yAbove: (rect?.top || fallback.top) - 6
      });
    }

    function convertInlineMarkdown(content) {
      const selection = window.getSelection();
      if (!selection?.rangeCount || !selection.isCollapsed) return false;
      const node = selection.anchorNode;
      if (node?.nodeType !== Node.TEXT_NODE || !content.contains(node)) return false;
      if (node.parentElement.closest('code, a')) return false;
      const offset = selection.anchorOffset;
      const before = node.data.slice(0, offset);
      for (const rule of INLINE_MARKDOWN_RULES) {
        const match = rule.pattern.exec(before);
        if (!match) continue;
        const element = document.createElement(rule.tag);
        if (rule.tag === 'a') {
          element.href = match[2];
          element.target = '_blank';
          element.rel = 'noopener noreferrer';
        }
        element.textContent = match[1];
        const after = node.data.slice(offset);
        // A zero-width text node keeps the caret outside the new formatting element.
        const tail = document.createTextNode(after || ZERO_WIDTH);
        const fragment = document.createDocumentFragment();
        if (match.index > 0) fragment.append(document.createTextNode(before.slice(0, match.index)));
        fragment.append(element, tail);
        node.replaceWith(fragment);
        const range = document.createRange();
        range.setStart(tail, after ? 0 : tail.data.length);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      }
      return false;
    }

    function removeZeroWidthBeforeCaret() {
      const selection = window.getSelection();
      if (!selection?.isCollapsed || !selection.rangeCount) return false;
      const { anchorNode: node, anchorOffset: offset } = selection;
      if (node?.nodeType !== Node.TEXT_NODE || offset === 0 || node.data[offset - 1] !== ZERO_WIDTH) return false;
      node.deleteData(offset - 1, 1);
      return true;
    }

    function richSurface() {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return null;
      const anchor = selection.anchorNode;
      const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
      const content = element?.closest?.('[data-block-content]');
      const block = blockFrom(content);
      if (!content || !block || !root.contains(content)) return null;
      return block.dataset.type === 'code' || block.dataset.type === 'calculator' ? null : content;
    }

    function inlineAncestor(node, tags, content) {
      let current = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      while (current && current !== content) {
        if (tags.includes(current.tagName.toLowerCase())) return current;
        current = current.parentElement;
      }
      return null;
    }

    function unwrapElement(element, selection) {
      const first = element.firstChild;
      const last = element.lastChild;
      element.replaceWith(...element.childNodes);
      if (!first || !last) return;
      const range = document.createRange();
      range.setStartBefore(first);
      range.setEndAfter(last);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    function formatInline(command) {
      const content = richSurface();
      if (!content) return false;
      const selection = window.getSelection();
      if (['bold', 'italic', 'underline', 'strikeThrough'].includes(command)) {
        document.execCommand(command, false);
      } else if (command === 'code' || command === 'highlight') {
        const tag = command === 'code' ? 'code' : 'mark';
        const range = selection.getRangeAt(0);
        const existing = inlineAncestor(range.commonAncestorContainer, [tag], content);
        if (existing) {
          unwrapElement(existing, selection);
        } else if (!range.collapsed) {
          const element = document.createElement(tag);
          element.append(range.extractContents());
          range.insertNode(element);
          range.selectNodeContents(element);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          return false;
        }
      } else if (command === 'unlink') {
        const range = selection.getRangeAt(0);
        const anchor = inlineAncestor(range.commonAncestorContainer, ['a'], content);
        if (anchor) unwrapElement(anchor, selection);
        else document.execCommand('unlink', false);
      } else if (command === 'clear') {
        document.execCommand('removeFormat', false);
        document.execCommand('unlink', false);
        const range = selection.getRangeAt(0);
        [...content.querySelectorAll('code, mark, u')]
          .filter((element) => { try { return range.intersectsNode(element); } catch { return false; } })
          .forEach((element) => element.replaceWith(...element.childNodes));
      } else {
        return false;
      }
      saveSelection();
      changed();
      return true;
    }

    function linkCommand() {
      const content = richSurface();
      if (!content) return false;
      const selection = window.getSelection();
      const range = selection.getRangeAt(0).cloneRange();
      const existing = inlineAncestor(range.commonAncestorContainer, ['a'], content);
      const selected = selection.toString().trim();
      const suggested = existing?.getAttribute('href') || (/^https?:\/\//i.test(selected) ? selected : 'https://');
      const url = window.prompt(localize('Link URL'), suggested);
      if (url === null) return false;
      selection.removeAllRanges();
      selection.addRange(range);
      const value = url.trim();
      if (!value) {
        if (existing) { unwrapElement(existing, selection); changed(); }
        return true;
      }
      if (!/^(https?:|mailto:|tel:)/i.test(value)) {
        notify(localize('Use an http, https, mailto or tel link'));
        return false;
      }
      if (existing) {
        existing.setAttribute('href', value);
      } else if (range.collapsed) {
        const anchor = document.createElement('a');
        anchor.href = value;
        anchor.textContent = value;
        range.insertNode(anchor);
        range.setStartAfter(anchor);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        document.execCommand('createLink', false, value);
      }
      content.querySelectorAll('a[href]').forEach((anchor) => {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
      });
      saveSelection();
      changed();
      return true;
    }

    function paste(event, block) {
      event.preventDefault();
      const text = (event.clipboardData?.getData('text/plain') || '').replace(/\u200B/g, '');
      if (!text) return;
      if (block.dataset.type === 'calculator') {
        const content = event.target.closest('[data-calculator-line]');
        const lines = text.replace(/\r\n?/g, '\n').split('\n');
        insertText(lines.shift());
        let row = content.closest('.calculator-row');
        lines.forEach((line) => { const next = createCalculatorRow(line); row.insertAdjacentElement('afterend', next); row = next; });
        if (lines.length) focus(row.querySelector('.calculator-input'), true);
        recalculate(block); changed(); return;
      }
      if (block.dataset.type === 'table') {
        const content = event.target.closest('.table-cell');
        if (content && /[\n\t]/.test(text.replace(/\n+$/, ''))) pasteIntoTable(block, content, text);
        else { insertText(text); changed(); }
        return;
      }
      if (block.dataset.type === 'code') {
        insertText(text.replace(/\r\n?/g, '\n'));
        changed();
        return;
      }
      if (!text.includes('\n')) {
        const containsUrl = URL_PATTERN.test(text);
        URL_PATTERN.lastIndex = 0;
        if (containsUrl) insertLinkedText(text);
        else insertText(text);
        URL_PATTERN.lastIndex = 0;
        changed();
        return;
      }
      const normalized = text.replace(/\r\n?/g, '\n');
      const parsed = window.NoteMarkdown
        ? window.NoteMarkdown.parseMarkdown(normalized)
        : normalized.split('\n').filter((line) => line.trim()).map((line) => ({ type: 'paragraph', html: escapeHtml(line) }));
      if (!parsed.length) return;
      let point = block;
      let last = null;
      parsed.forEach((data) => {
        last = dataToBlock(data);
        point.insertAdjacentElement('afterend', last);
        point = last;
      });
      const hasChildren = Boolean(childContainer(block, false)?.querySelector(':scope > .block'));
      if (empty(contentOf(block)) && !hasChildren) block.remove();
      const surfaces = last.querySelectorAll('[data-block-content]');
      focus(surfaces[surfaces.length - 1] || contentOf(last), true);
      changed();
    }

    function insertLinkedText(text) {
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      for (const match of text.matchAll(URL_PATTERN)) {
        if (match.index > cursor) fragment.append(document.createTextNode(text.slice(cursor, match.index)));
        const anchor = document.createElement('a');
        anchor.href = match[0];
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = match[0];
        fragment.append(anchor);
        cursor = match.index + match[0].length;
      }
      if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const last = fragment.lastChild;
      range.insertNode(fragment);
      if (last) {
        range.setStartAfter(last);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function deleteBlocks(block) {
      const blocks = selectedBlocks(block);
      blocks.forEach((item) => item.remove());
      ensureEditor();
      focus(contentOf(root.querySelector('.block')), true);
      changed();
    }

    function duplicateBlocks(block) {
      const blocks = selectedBlocks(block);
      let point = blocks[blocks.length - 1];
      blocks.forEach((item) => {
        const clone = dataToBlock(serializeBlock(item));
        clone.dataset.blockId = id();
        clone.querySelectorAll('.block').forEach((child) => { child.dataset.blockId = id(); });
        point.insertAdjacentElement('afterend', clone);
        point = clone;
      });
      focus(contentOf(point), true);
      changed();
    }

    function moveBlocks(block, direction) {
      const blocks = selectedBlocks(block).filter((item) => item.parentElement === block.parentElement);
      if (!blocks.length) return;
      if (direction === 'up') {
        const previous = blocks[0].previousElementSibling;
        if (previous?.classList.contains('block')) blocks.forEach((item) => previous.insertAdjacentElement('beforebegin', item));
      } else {
        const next = blocks[blocks.length - 1].nextElementSibling;
        if (next?.classList.contains('block')) [...blocks].reverse().forEach((item) => next.insertAdjacentElement('afterend', item));
      }
      changed();
    }

    function selectAll(event, content) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'a') return false;
      event.preventDefault();
      const selection = window.getSelection();
      const block = blockFrom(content);
      const now = Date.now();
      const consecutive = selectAllState.block === block && now - selectAllState.time <= SELECT_ALL_WINDOW;
      const stage = consecutive ? Math.min(3, selectAllState.stage + 1) : 1;
      selectAllState = { block, stage, time: now };
      const range = document.createRange();
      if (stage === 1) range.selectNodeContents(content);
      else if (stage === 2) {
        selectOuterBlock(block);
        return true;
      } else {
        structuralSelectionMode = 'all';
        root.querySelectorAll('.is-structurally-selected').forEach((item) => item.classList.remove('is-structurally-selected'));
        range.selectNodeContents(root);
      }
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }

    function escapeSelection(event, block) {
      event.preventDefault();
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (range && range.startContainer === block.parentNode
        && range.endContainer === block.parentNode
        && range.endOffset === range.startOffset + 1
        && block.parentNode.childNodes[range.startOffset] === block) {
        selection.removeAllRanges();
        block.classList.remove('is-structurally-selected');
        structuralSelectionMode = null;
        contentOf(block)?.focus();
        return;
      }
      selectOuterBlock(block);
    }

    function executeMenuCommand(command, suppliedBlock = null) {
      restoreSelection();
      const block = suppliedBlock || activeMenuBlock || currentBlock();
      if (!block) return;
      if (command.startsWith('transform:')) {
        const requested = command.slice(10);
        const toggleHeading = requested.match(/^toggle-(heading-[123])$/);
        const target = toggleHeading ? 'toggle' : requested;
        const blocks = selectedBlocks(block);
        suppressChanges = true;
        const transformed = blocks.map((item) => {
          const content = contentOf(item);
          if (normalizedText(content).startsWith('/')) content.innerHTML = '<br>';
          return replace(item, target, toggleHeading ? { titleStyle: toggleHeading[1] } : {});
        });
        suppressChanges = false;
        changed();
        focus(contentOf(transformed[0]));
      } else if (command.startsWith('insert:')) {
        const type = command.slice(7);
        const next = createBlock(type);
        block.insertAdjacentElement('afterend', next);
        if (type === 'divider') {
          const paragraph = createBlock('paragraph');
          next.insertAdjacentElement('afterend', paragraph);
          focus(contentOf(paragraph));
        } else focus(contentOf(next));
        changed();
      } else if (command.startsWith('toggle-title:') && block.dataset.type === 'toggle') {
        contentOf(block).dataset.titleStyle = command.slice(13);
        changed();
      } else if (command === 'indent') indentBlocks(block, false);
      else if (command === 'outdent') indentBlocks(block, true);
      else if (command === 'duplicate') duplicateBlocks(block);
      else if (command === 'delete') deleteBlocks(block);
      else if (command === 'move-up') moveBlocks(block, 'up');
      else if (command === 'move-down') moveBlocks(block, 'down');
      activeMenuBlock = null;
      onCloseMenu();
    }

    function clearDrag() {
      root.querySelectorAll('.drag-target-before, .drag-target-after').forEach((item) => item.classList.remove('drag-target-before', 'drag-target-after'));
      if (drag?.block) drag.block.classList.remove('dragging');
      drag = null;
    }

    root.addEventListener('keydown', (event) => {
      const content = event.target.closest?.('[data-block-content]');
      const block = blockFrom(content);
      if (!block || !content) return;
      if (event.isComposing || event.key === 'Process') return;
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') preferredCaretX = null;
      const structural = structurallySelectedBlock();
      if (structuralSelectionMode === 'all' && (event.key === 'Backspace' || event.key === 'Delete')) {
        event.preventDefault();
        root.replaceChildren(createBlock('paragraph'));
        structuralSelectionMode = null;
        focus(contentOf(root.firstElementChild));
        changed();
        return;
      }
      if (structural && (event.key === 'Backspace' || event.key === 'Delete')) {
        event.preventDefault();
        structural.remove();
        ensureEditor();
        focus(contentOf(root.querySelector('.block')), true);
        changed();
        return;
      }
      if ((event.key === 'Backspace' || event.key === 'Delete') && block.dataset.exitedContainer) {
        event.preventDefault();
        delete block.dataset.exitedContainer;
        return;
      }
      if (event.key === 'Backspace' && removeZeroWidthBeforeCaret()) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && !event.altKey) {
        const key = event.key.toLowerCase();
        const plain = block.dataset.type === 'code' || block.dataset.type === 'calculator';
        if (plain && ['b', 'i', 'u', 'e', 'k'].includes(key)) { event.preventDefault(); return; }
        if (key === 'e' && !event.shiftKey) { event.preventDefault(); formatInline('code'); return; }
        if (key === 'h' && event.shiftKey) { event.preventDefault(); formatInline('highlight'); return; }
        if (key === 's' && event.shiftKey) { event.preventDefault(); formatInline('strikeThrough'); return; }
        if (key === 'k' && !event.shiftKey) { event.preventDefault(); linkCommand(); return; }
      }
      if (selectAll(event, content)) return;
      if (event.key === 'Escape') { escapeSelection(event, block); return; }
      if (block.dataset.type === 'table' && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && tableKey(event, block, content)) return;
      if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && verticalArrow(event, block, content)) return;
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && horizontalArrow(event, content)) return;
      if ((event.key === 'Backspace' || event.key === 'Delete') && !window.getSelection().isCollapsed) {
        event.preventDefault();
        deleteAuthoredSelection();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo(event.shiftKey ? 1 : -1);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        undo(1);
      } else if (event.key === 'Enter') enter(event, block, content);
      else if (event.key === 'Tab') tab(event, block);
      else if (event.key === 'Backspace') backspace(event, block, content);
      else if (event.key === 'Delete') deleteForward(event, block, content);
    }, { capture: true, signal });

    root.addEventListener('beforeinput', (event) => {
      if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
        event.preventDefault();
        undo(event.inputType === 'historyRedo' ? 1 : -1);
      }
    }, { signal });

    root.addEventListener('input', (event) => {
      selectAllState = { block: null, stage: 0, time: 0 };
      structuralSelectionMode = null;
      const content = event.target.closest?.('[data-block-content]') || contentOf(currentBlock());
      const block = blockFrom(content);
      if (!content || !block) return;
      delete block.dataset.exitedContainer;
      if (event.isComposing || skipComposedShortcut) {
        skipComposedShortcut = false;
        changed({ typing: true });
        return;
      }
      if (block.dataset.type !== 'code' && block.dataset.type !== 'calculator' && block.dataset.type !== 'table' && shortcut(block, content)) return;
      if (block.dataset.type === 'calculator') { recalculate(block); changed({ typing: true }); return; }
      if (block.dataset.type !== 'code' && event.inputType === 'insertText' && /^[*_~=`)]$/.test(event.data || '')
        && convertInlineMarkdown(content)) {
        changed();
        return;
      }
      if (block.dataset.type !== 'table') slash(block, content);
      changed({ typing: true });
    }, { signal });

    root.addEventListener('compositionend', () => { skipComposedShortcut = true; }, { signal });

    root.addEventListener('paste', (event) => {
      const content = event.target.closest?.('[data-block-content]');
      const block = blockFrom(content);
      if (block) paste(event, block);
    }, { signal });

    root.addEventListener('change', (event) => {
      const checkbox = event.target.closest?.('input[type="checkbox"]');
      const block = checkbox?.closest('.block[data-type="checklist"]');
      if (!block) return;
      block.dataset.checked = checkbox.checked ? 'true' : 'false';
      changed();
    }, { signal });

    function focusNoteTail() {
      const last = directBlocks(root).at(-1);
      const hasChildren = Boolean(last && childContainer(last, false)?.querySelector(':scope > .block'));
      if (last?.dataset.type === 'paragraph' && empty(contentOf(last)) && !hasChildren) {
        focus(contentOf(last), true);
        return;
      }
      const paragraph = createBlock('paragraph');
      root.append(paragraph);
      focus(contentOf(paragraph));
      changed();
    }

    root.addEventListener('click', (event) => {
      const link = event.target.closest?.('a[href]');
      if (link && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        window.open(link.href, '_blank', 'noopener,noreferrer');
        return;
      }
      if (event.target === root) { focusNoteTail(); return; }
      if (event.target.classList?.contains('toggle-body') && !event.target.querySelector(':scope > .block')) {
        const paragraph = createBlock('paragraph');
        event.target.append(paragraph);
        focus(contentOf(paragraph));
        changed();
        return;
      }
      const tool = event.target.closest?.('[data-table-action]');
      if (tool) {
        event.preventDefault();
        const tableBlock = tool.closest('.block[data-type="table"]');
        const active = document.activeElement?.classList?.contains('table-cell') && tableBlock.contains(document.activeElement)
          ? document.activeElement : tableBlock._lastCell;
        tableAction(tableBlock, tool.dataset.tableAction, active);
        return;
      }
      const result = event.target.closest?.('.calculator-result:not(:disabled)');
      if (result) {
        event.preventDefault();
        const block = result.closest('.block[data-type="calculator"]');
        const selection = window.getSelection();
        if (selection?.rangeCount && block.contains(selection.anchorNode)) {
          insertText(result.dataset.literal || ''); recalculate(block); changed();
        }
        return;
      }
      const caret = event.target.closest?.('[data-toggle-caret]');
      if (caret) {
        const block = caret.closest('.block[data-type="toggle"]');
        block.dataset.open = block.dataset.open === 'true' ? 'false' : 'true';
        changed();
        return;
      }
      const button = event.target.closest?.('[data-drag-handle]');
      if (!button) return;
      event.preventDefault();
      if (suppressHandleClick) {
        suppressHandleClick = false;
        return;
      }
      const block = button.closest('.block');
      activeMenuBlock = block;
      saveSelection();
      const rect = button.getBoundingClientRect();
      onRequestMenu({ mode: 'context', block, query: '', x: rect.left, y: rect.bottom + 5, yAbove: rect.top - 5 });
    }, { signal });

    // Toolbar buttons must not steal focus, otherwise the active cell would be lost on touch devices.
    root.addEventListener('mousedown', (event) => {
      if (event.target.closest?.('.table-tools')) event.preventDefault();
    }, { signal });

    root.addEventListener('focusin', (event) => {
      const cell = event.target.closest?.('.table-cell');
      const tableBlock = cell && blockFrom(cell);
      if (tableBlock) tableBlock._lastCell = cell;
    }, { signal });

    root.addEventListener('pointerdown', (event) => {
      selectAllState = { block: null, stage: 0, time: 0 };
      structuralSelectionMode = null;
      root.querySelectorAll('.is-structurally-selected').forEach((item) => item.classList.remove('is-structurally-selected'));
      const button = event.target.closest?.('[data-drag-handle]');
      if (!button && event.button === 0) {
        const content = event.target.closest?.('[data-block-content]');
        const anchor = content ? caretFromPoint(event.clientX, event.clientY) : null;
        if (anchor && root.contains(anchor.node)) {
          pointerSelection = {
            pointerId: event.pointerId,
            anchor,
            anchorBlock: blockFrom(anchor.node),
            started: false
          };
        }
        return;
      }
      if (!button || event.button !== 0) return;
      pointerSelection = null;
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      drag = { block: button.closest('.block'), pointerId: event.pointerId, x: event.clientX, y: event.clientY, target: null, position: null, started: false };
    }, { signal });

    root.addEventListener('pointermove', (event) => {
      if (extendPointerSelection(event)) return;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!drag.started && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
      event.preventDefault();
      if (!drag.started) {
        drag.started = true;
        drag.block.classList.add('dragging');
        suppressHandleClick = true;
      }
      root.querySelectorAll('.drag-target-before, .drag-target-after').forEach((item) => item.classList.remove('drag-target-before', 'drag-target-after'));
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.block');
      if (!target || target === drag.block || target.contains(drag.block) || drag.block.contains(target)) {
        drag.target = null;
        return;
      }
      const rect = target.getBoundingClientRect();
      drag.position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      drag.target = target;
      target.classList.add(drag.position === 'before' ? 'drag-target-before' : 'drag-target-after');
    }, { signal });

    root.addEventListener('pointerup', (event) => {
      if (pointerSelection?.pointerId === event.pointerId) pointerSelection = null;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.started && drag.target) {
        drag.target.insertAdjacentElement(drag.position === 'before' ? 'beforebegin' : 'afterend', drag.block);
        changed();
      }
      clearDrag();
    }, { signal });
    root.addEventListener('pointercancel', () => {
      pointerSelection = null;
      clearDrag();
    }, { signal });

    document.addEventListener('selectionchange', () => {
      const selection = window.getSelection();
      if (selectionInEditor(selection)) {
        saveSelection();
        onSelectionChange(selection);
      } else onSelectionChange(null);
    }, { signal });

    function getStats() {
      return [...root.querySelectorAll('[data-block-content]')].reduce((total, surface) => {
        const stats = countText(surface.textContent);
        total.words += stats.words;
        total.characters += stats.characters;
        total.charactersNoSpaces += stats.charactersNoSpaces;
        return total;
      }, { words: 0, characters: 0, charactersNoSpaces: 0 });
    }

    function getSelectionStats() {
      const selection = window.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed || !selectionInEditor(selection)) return null;
      const source = selection.getRangeAt(0);
      let text = '';
      root.querySelectorAll('[data-block-content]').forEach((surface) => {
        try { if (!source.intersectsNode(surface)) return; } catch { return; }
        const part = document.createRange();
        part.selectNodeContents(surface);
        if (source.compareBoundaryPoints(Range.START_TO_START, part) > 0) part.setStart(source.startContainer, source.startOffset);
        if (source.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(source.endContainer, source.endOffset);
        text += `${part.toString()} `;
      });
      return countText(text);
    }

    function openBlockPicker() {
      let block = currentBlock();
      // An empty text-like block is reused; anything else gets a fresh paragraph below it.
      const reusable = block && !block.dataset.exitedContainer
        && ['paragraph', 'heading-1', 'heading-2', 'heading-3', 'bulleted-list', 'numbered-list', 'checklist', 'quote', 'callout']
          .includes(block.dataset.type)
        && empty(contentOf(block));
      if (!reusable) {
        const paragraph = createBlock('paragraph');
        if (block) block.insertAdjacentElement('afterend', paragraph);
        else root.append(paragraph);
        block = paragraph;
      }
      const content = contentOf(block);
      focus(content);
      insertText('/');
      slash(block, content);
      changed();
    }

    load([]);

    return Object.freeze({
      root, load, serialize, getStats, getSelectionStats, formatInline, linkCommand, openBlockPicker,
      undo: () => undo(-1),
      redo: () => undo(1),
      indentSelection: (shouldOutdent) => {
        const block = currentBlock();
        return block ? indentBlocks(block, Boolean(shouldOutdent)) : false;
      },
      focus() { focus(contentOf(root.querySelector('.block')), true); },
      getCurrentBlock: currentBlock,
      getContentElement: contentOf,
      getToggleBody: (block) => block?.dataset.type === 'toggle' ? childContainer(block) : null,
      saveSelection, restoreSelection, createBlock,
      insertBlock(type, reference = null, data = {}) {
        const block = createBlock(type, data);
        (reference || currentBlock() || root.lastElementChild)?.insertAdjacentElement?.('afterend', block) || root.append(block);
        focus(contentOf(block));
        changed();
        return block;
      },
      transformBlock: replace,
      setToggleTitleStyle(block, style) {
        if (block?.dataset.type === 'toggle') {
          contentOf(block).dataset.titleStyle = HEADING_TYPES.has(style) ? style : 'paragraph';
          changed();
        }
      },
      duplicateBlock: duplicateBlocks,
      deleteBlock: deleteBlocks,
      moveBlock: moveBlocks,
      executeMenuCommand,
      setNumberFormat(value) {
        calculatorNumberFormat = value === 'european' ? 'european' : 'international';
        root.querySelectorAll('.block[data-type="calculator"]').forEach(recalculate);
      },
      readableLinkLabel(value) { return value; },
      destroy() { controller.abort(); }
    });
  }

  const api = Object.freeze({ create: createEditor, countText });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NoteEditor = api;
})();
