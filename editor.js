(() => {
  'use strict';

  const BLOCK_TYPES = new Set([
    'paragraph',
    'heading-1',
    'heading-2',
    'heading-3',
    'bulleted-list',
    'numbered-list',
    'checklist',
    'toggle',
    'quote',
    'divider',
    'code'
  ]);

  const URL_PATTERN = /https?:\/\/[^\s<]+/gi;

  function createEditor(options) {
    const {
      root,
      onChange = () => {},
      onRequestMenu = () => {},
      onCloseMenu = () => {},
      onSelectionChange = () => {}
    } = options || {};

    if (!(root instanceof HTMLElement)) {
      throw new Error('NoteEditor requires a valid root element.');
    }

    let savedRange = null;
    let activeMenuBlock = null;
    let armedDragBlock = null;
    let draggedBlock = null;
    let dragTargetBlock = null;
    let dragTargetPosition = null;
    let dragPointerId = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let suppressHandleClick = false;
    let suppressChange = false;
    let blockCounter = 0;
    let historyEntries = [];
    let historyIndex = -1;
    let applyingHistory = false;

    const abortController = new AbortController();
    const { signal } = abortController;

    function nextBlockId() {
      blockCounter += 1;
      return `block-${Date.now().toString(36)}-${blockCounter.toString(36)}`;
    }

    function normalizeType(type) {
      return BLOCK_TYPES.has(type) ? type : 'paragraph';
    }

    function cleanHtml(html) {
      if (typeof html !== 'string' || !html.trim()) return '<br>';
      const sanitized = window.NoteStorage?.sanitizeInlineHtml(html) || html;
      return sanitized || '<br>';
    }

    function createHandle() {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'block-handle';
      handle.tabIndex = -1;
      handle.contentEditable = 'false';
      handle.setAttribute('data-drag-handle', 'true');
      handle.setAttribute('aria-label', 'Block actions');
      handle.draggable = false;
      handle.textContent = '⋮⋮';
      return handle;
    }

    function createEditableContent(className = 'block-content', html = '<br>') {
      const content = document.createElement('div');
      content.className = className;
      content.setAttribute('data-block-content', 'true');
      content.innerHTML = cleanHtml(html);
      return content;
    }

    function createBlock(type = 'paragraph', options = {}) {
      const normalizedType = normalizeType(type);
      const block = document.createElement('div');
      block.className = 'block';
      block.dataset.type = normalizedType;
      block.dataset.blockId = options.id || nextBlockId();
      block.draggable = false;

      const handle = createHandle();
      const main = document.createElement('div');
      main.className = 'block-main';

      block.append(handle, main);

      if (normalizedType === 'divider') {
        const divider = document.createElement('hr');
        divider.className = 'block-divider';
        divider.contentEditable = 'false';
        main.append(divider);
        const children = document.createElement('div');
        children.className = 'block-children';
        children.setAttribute('data-block-children', 'true');
        (options.children || []).forEach((child) => children.append(child));
        block.append(children);
        return block;
      }

      if (normalizedType === 'toggle') {
        block.dataset.open = options.open === false ? 'false' : 'true';

        const row = document.createElement('div');
        row.className = 'toggle-row';

        const caret = document.createElement('button');
        caret.type = 'button';
        caret.className = 'toggle-caret';
        caret.tabIndex = -1;
        caret.contentEditable = 'false';
        caret.setAttribute('data-toggle-caret', 'true');
        caret.setAttribute('aria-label', 'Toggle content');
        caret.textContent = '▶';

        const title = createEditableContent(
          'toggle-title',
          options.html || options.titleHtml || '<br>'
        );
        title.dataset.titleStyle = options.titleStyle || 'paragraph';

        const body = document.createElement('div');
        body.className = 'toggle-body';
        body.setAttribute('data-toggle-body', 'true');

        if (Array.isArray(options.children)) {
          options.children.forEach((child) => body.append(child));
        }

        row.append(caret, title);
        main.append(row, body);
        return block;
      }

      if (normalizedType === 'code') {
        const pre = document.createElement('pre');
        pre.className = 'block-content code-content';
        pre.setAttribute('data-block-content', 'true');
        pre.textContent = options.text || htmlToPlainText(options.html || '');
        if (!pre.textContent) pre.append(document.createElement('br'));
        main.append(pre);
        const children = document.createElement('div');
        children.className = 'block-children';
        children.setAttribute('data-block-children', 'true');
        (options.children || []).forEach((child) => children.append(child));
        block.append(children);
        return block;
      }

      const row = document.createElement('div');
      row.className = 'block-row';

      if (normalizedType === 'bulleted-list' || normalizedType === 'numbered-list') {
        const marker = document.createElement('span');
        marker.className = 'list-marker';
        marker.contentEditable = 'false';
        marker.setAttribute('aria-hidden', 'true');
        marker.textContent = normalizedType === 'bulleted-list' ? '•' : '1.';
        row.append(marker);
      }

      if (normalizedType === 'checklist') {
        const marker = document.createElement('label');
        marker.className = 'check-marker';
        marker.contentEditable = 'false';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = options.checked === true;
        checkbox.setAttribute('aria-label', 'Complete item');

        marker.append(checkbox);
        row.append(marker);
        block.dataset.checked = checkbox.checked ? 'true' : 'false';
      }

      row.append(createEditableContent('block-content', options.html || '<br>'));
      main.append(row);
      const children = document.createElement('div');
      children.className = 'block-children';
      children.setAttribute('data-block-children', 'true');
      (options.children || []).forEach((child) => children.append(child));
      block.append(children);
      return block;
    }

    function htmlToPlainText(html) {
      const template = document.createElement('template');
      template.innerHTML = html;
      return template.content.textContent || '';
    }

    function getContentElement(block) {
      if (!block) return null;
      if (block.dataset.type === 'toggle') {
        return block.querySelector(':scope > .block-main > .toggle-row > .toggle-title');
      }
      return block.querySelector(':scope > .block-main [data-block-content]');
    }

    function getToggleBody(block) {
      if (!block || block.dataset.type !== 'toggle') return null;
      return block.querySelector(':scope > .block-main > .toggle-body');
    }

    function getChildContainer(block) {
      if (!block) return null;
      if (block.dataset.type === 'toggle') return getToggleBody(block);
      let container = block.querySelector(':scope > .block-children');
      if (!container) {
        container = document.createElement('div');
        container.className = 'block-children';
        container.setAttribute('data-block-children', 'true');
        block.append(container);
      }
      return container;
    }

    function getBlockFromNode(node) {
      const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      if (!element || !root.contains(element)) return null;
      return element.closest('.block');
    }

    function getTopLevelBlock(block) {
      let current = block;
      while (current?.parentElement?.closest('.block')) {
        current = current.parentElement.closest('.block');
      }
      return current;
    }

    function getCurrentBlock() {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return activeMenuBlock;
      return getBlockFromNode(selection.anchorNode) || activeMenuBlock;
    }

    function getSelectedBlocks(fallback = null) {
      const selection = window.getSelection();
      if (!selectionInsideRoot(selection) || selection.isCollapsed) {
        return fallback ? [fallback] : [];
      }
      const range = selection.getRangeAt(0);
      const blocks = [...root.querySelectorAll('.block')].filter((block) => {
        const ownContent = getContentElement(block)
          || block.querySelector(':scope > .block-main > .block-divider');
        if (!ownContent) return false;
        try {
          return range.intersectsNode(ownContent);
        } catch {
          return false;
        }
      });
      const topmost = blocks.filter((block) => !blocks.some((candidate) => candidate !== block && candidate.contains(block)));
      return topmost.length ? topmost : (fallback ? [fallback] : []);
    }

    function selectionInsideRoot(selection = window.getSelection()) {
      if (!selection || selection.rangeCount === 0) return false;
      const range = selection.getRangeAt(0);
      return root.contains(range.startContainer) && root.contains(range.endContainer);
    }

    function saveSelection() {
      const selection = window.getSelection();
      if (!selectionInsideRoot(selection)) return;
      savedRange = selection.getRangeAt(0).cloneRange();
    }

    function restoreSelection() {
      if (!savedRange) return false;
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedRange);
      return true;
    }

    function focusAtStart(element) {
      if (!element) return;
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      element.focus();
      saveSelection();
    }

    function focusAtEnd(element) {
      if (!element) return;
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      element.focus();
      saveSelection();
    }

    function ensureCaretBlock() {
      let block = getCurrentBlock();
      if (block && root.contains(block)) return block;

      block = root.querySelector('.block');
      if (!block) {
        block = createBlock('paragraph');
        root.append(block);
      }
      focusAtStart(getContentElement(block));
      return block;
    }

    function isContentEmpty(content) {
      if (!content) return true;
      return (content.textContent || '').replace(/\u200B/g, '').trim() === '';
    }

    function normalizeEmptyContent(content) {
      if (!content) return;
      if (isContentEmpty(content)) content.innerHTML = '<br>';
    }

    function indentBlock(block) {
      const previous = block?.previousElementSibling;
      if (!previous?.classList.contains('block')) return false;
      getChildContainer(previous).append(block);
      return true;
    }

    function outdentBlock(block) {
      const parentBlock = block?.parentElement?.closest('.block');
      if (!parentBlock) return false;
      parentBlock.insertAdjacentElement('afterend', block);
      return true;
    }

    function insertAfter(referenceBlock, newBlock) {
      const parent = referenceBlock?.parentElement || root;
      referenceBlock?.insertAdjacentElement('afterend', newBlock);
      if (!referenceBlock) parent.append(newBlock);
      refreshNumberedMarkers();
      return newBlock;
    }

    function insertBefore(referenceBlock, newBlock) {
      if (referenceBlock?.parentElement) {
        referenceBlock.insertAdjacentElement('beforebegin', newBlock);
      } else {
        root.prepend(newBlock);
      }
      refreshNumberedMarkers();
      return newBlock;
    }

    function ensureRootHasBlock() {
      if (!root.querySelector(':scope > .block')) {
        root.append(createBlock('paragraph'));
      }
      updateEmptyState();
    }

    function updateEmptyState() {
      const blocks = [...root.querySelectorAll(':scope > .block')];
      const empty = blocks.length === 1
        && blocks[0].dataset.type === 'paragraph'
        && isContentEmpty(getContentElement(blocks[0]));
      root.classList.toggle('is-empty', empty);
    }

    function emitChange() {
      if (suppressChange) return;
      updateEmptyState();
      refreshNumberedMarkers();
      recordHistory();
      onChange(serialize());
    }

    function recordHistory() {
      if (applyingHistory) return;
      const data = JSON.stringify(serialize());
      if (historyEntries[historyIndex]?.data === data) return;
      const block = getCurrentBlock();
      const content = getContentElement(block);
      const selection = window.getSelection();
      let offset = 0;
      if (content && selectionInsideRoot(selection)) {
        const before = document.createRange();
        before.selectNodeContents(content);
        try {
          before.setEnd(selection.anchorNode, selection.anchorOffset);
          offset = before.toString().length;
        } catch {
          offset = 0;
        }
      }
      const snapshot = { data, blockId: block?.dataset.blockId || '', offset };
      historyEntries = historyEntries.slice(0, historyIndex + 1);
      historyEntries.push(snapshot);
      if (historyEntries.length > 200) historyEntries.shift();
      historyIndex = historyEntries.length - 1;
    }

    function restoreHistory(nextIndex) {
      if (nextIndex < 0 || nextIndex >= historyEntries.length || nextIndex === historyIndex) return false;
      applyingHistory = true;
      try {
        historyIndex = nextIndex;
        const snapshot = historyEntries[historyIndex];
        load(JSON.parse(snapshot.data), { preserveHistory: true });
        const escapedId = window.CSS?.escape ? window.CSS.escape(snapshot.blockId) : snapshot.blockId.replace(/[^a-zA-Z0-9_-]/g, '');
        const block = root.querySelector(`[data-block-id="${escapedId}"]`) || root.querySelector('.block');
        const content = getContentElement(block);
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        let remaining = snapshot.offset;
        let node = null;
        while (walker.nextNode()) {
          node = walker.currentNode;
          if (remaining <= node.textContent.length) break;
          remaining -= node.textContent.length;
        }
        if (node) {
          const range = document.createRange();
          range.setStart(node, Math.min(remaining, node.textContent.length));
          range.collapse(true);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          content.focus();
        } else {
          focusAtEnd(content);
        }
      } finally {
        applyingHistory = false;
      }
      onChange(serialize());
      return true;
    }

    function handleHistoryShortcut(event) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'z') return false;
      event.preventDefault();
      restoreHistory(historyIndex + (event.shiftKey ? 1 : -1));
      return true;
    }

    function createContentsRange(node) {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range;
    }

    function rangesEqual(first, second) {
      try {
        return first.compareBoundaryPoints(Range.START_TO_START, second) === 0
          && first.compareBoundaryPoints(Range.END_TO_END, second) === 0;
      } catch {
        return false;
      }
    }

    function selectionMatchesNodeContents(selection, node) {
      if (!selection || selection.rangeCount !== 1 || !node) return false;
      return rangesEqual(selection.getRangeAt(0), createContentsRange(node));
    }

    function selectNodeContents(node) {
      const selection = window.getSelection();
      const range = createContentsRange(node);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    function handleSelectAll(event) {
      const isSelectAll = (event.ctrlKey || event.metaKey)
        && !event.altKey
        && event.key.toLowerCase() === 'a';

      if (!isSelectAll) return false;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return true;

      const selection = window.getSelection();
      if (!selectionInsideRoot(selection)) {
        root.focus();
        selectNodeContents(root);
        return true;
      }

      if (selectionMatchesNodeContents(selection, root)) return true;

      const block = getBlockFromNode(selection.anchorNode);
      const content = getContentElement(block);
      if (!content) {
        selectNodeContents(root);
        return true;
      }

      if (selectionMatchesNodeContents(selection, content)) {
        selectNodeContents(root);
      } else {
        selectNodeContents(content);
      }

      saveSelection();
      return true;
    }

    function isCaretAtStart(content, range) {
      if (!content || !range) return false;
      const before = document.createRange();
      before.selectNodeContents(content);
      before.setEnd(range.startContainer, range.startOffset);
      return before.toString() === '';
    }

    function isCaretAtEnd(content, range) {
      if (!content || !range) return false;
      const after = document.createRange();
      after.selectNodeContents(content);
      after.setStart(range.endContainer, range.endOffset);
      return after.toString() === '';
    }

    function extractRightHtml(content, range) {
      const tailRange = document.createRange();
      tailRange.selectNodeContents(content);
      tailRange.setStart(range.startContainer, range.startOffset);
      const fragment = tailRange.extractContents();
      const container = document.createElement('div');
      container.append(fragment);
      return container.innerHTML || '<br>';
    }

    function splitCurrentBlock(block, content) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return null;

      const range = selection.getRangeAt(0);
      if (!range.collapsed) range.deleteContents();

      const rightHtml = extractRightHtml(content, range);
      normalizeEmptyContent(content);

      const currentType = block.dataset.type;
      const nextType = ['heading-1', 'heading-2', 'heading-3'].includes(currentType)
        ? 'paragraph'
        : currentType;

      const nextBlock = createBlock(nextType, {
        html: rightHtml,
        checked: false
      });

      insertAfter(block, nextBlock);
      focusAtStart(getContentElement(nextBlock));
      emitChange();
      return nextBlock;
    }

    function replaceBlockWithParagraph(block) {
      const currentContent = getContentElement(block);
      const paragraph = createBlock('paragraph', {
        html: currentContent?.innerHTML || '<br>'
      });
      block.replaceWith(paragraph);
      focusAtStart(getContentElement(paragraph));
      emitChange();
      return paragraph;
    }

    function exitToggleFromBody(block) {
      const toggle = block.parentElement?.closest('.block[data-type="toggle"]');
      if (!toggle) return false;

      const body = getToggleBody(toggle);
      const isLastChild = body?.lastElementChild === block;
      if (!isLastChild) return false;

      block.remove();
      const paragraph = createBlock('paragraph');
      insertAfter(toggle, paragraph);
      focusAtStart(getContentElement(paragraph));
      emitChange();
      return true;
    }

    function handleEnter(event) {
      const selection = window.getSelection();
      if (!selectionInsideRoot(selection) || selection.rangeCount === 0) return false;

      const range = selection.getRangeAt(0);
      const block = getBlockFromNode(range.startContainer);
      if (!block) return false;

      const content = getContentElement(block);
      if (!content) {
        if (block.dataset.type === 'divider') {
          event.preventDefault();
          const paragraph = createBlock('paragraph');
          insertAfter(block, paragraph);
          focusAtStart(getContentElement(paragraph));
          emitChange();
          return true;
        }
        return false;
      }

      if (event.shiftKey) {
        event.preventDefault();
        document.execCommand('insertLineBreak', false);
        emitChange();
        return true;
      }

      const inToggleTitle = content.classList.contains('toggle-title');
      if (inToggleTitle) {
        event.preventDefault();
        block.dataset.open = 'true';
        const body = getToggleBody(block);
        let firstChild = body.querySelector(':scope > .block');
        if (!firstChild) {
          firstChild = createBlock('paragraph');
          body.append(firstChild);
        }
        focusAtStart(getContentElement(firstChild));
        emitChange();
        return true;
      }

      const empty = isContentEmpty(content);
      if (empty) {
        if (['bulleted-list', 'numbered-list', 'checklist', 'quote', 'code', 'heading-1', 'heading-2', 'heading-3'].includes(block.dataset.type)) {
          event.preventDefault();
          replaceBlockWithParagraph(block);
          return true;
        }

        if (block.parentElement?.classList.contains('block-children')) {
          event.preventDefault();
          outdentBlock(block);
          focusAtStart(content);
          return true;
        }

        if (block.parentElement?.classList.contains('toggle-body') && exitToggleFromBody(block)) {
          event.preventDefault();
          return true;
        }

      }

      event.preventDefault();
      splitCurrentBlock(block, content);
      return true;
    }

    function insertTextAtSelection(text) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    function handleTab(event) {
      const selection = window.getSelection();
      if (!selectionInsideRoot(selection) || selection.rangeCount === 0) return false;

      const block = getBlockFromNode(selection.anchorNode);
      if (!block) return false;

      event.preventDefault();

      if (block.dataset.type === 'code') {
        const range = selection.getRangeAt(0);
        if (!event.shiftKey && range.collapsed) insertTextAtSelection('  ');
        else {
          const content = getContentElement(block);
          const full = content.textContent || '';
          const startRange = document.createRange();
          startRange.selectNodeContents(content);
          startRange.setEnd(range.startContainer, range.startOffset);
          const endRange = document.createRange();
          endRange.selectNodeContents(content);
          endRange.setEnd(range.endContainer, range.endOffset);
          const start = startRange.toString().length;
          const end = endRange.toString().length;
          const firstLine = full.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
          const lineEnd = full.indexOf('\n', end);
          const sliceEnd = lineEnd < 0 ? full.length : lineEnd;
          const lines = full.slice(firstLine, sliceEnd).split('\n');
          const replacement = lines.map((line) => event.shiftKey ? line.replace(/^ {1,2}/, '') : `  ${line}`).join('\n');
          content.textContent = full.slice(0, firstLine) + replacement + full.slice(sliceEnd);
          const textNode = content.firstChild || content.appendChild(document.createTextNode(''));
          const nextRange = document.createRange();
          nextRange.setStart(textNode, firstLine);
          nextRange.setEnd(textNode, firstLine + replacement.length);
          selection.removeAllRanges();
          selection.addRange(nextRange);
        }
        emitChange();
        return true;
      }

      const selectedBlocks = getSelectedBlocks(block);
      suppressChange = true;
      if (event.shiftKey) {
        selectedBlocks.forEach(outdentBlock);
      } else {
        const first = selectedBlocks[0];
        const previous = first?.previousElementSibling;
        if (previous?.classList.contains('block')) {
          const container = getChildContainer(previous);
          selectedBlocks.filter((item) => item.parentElement === first.parentElement).forEach((item) => container.append(item));
        }
      }
      suppressChange = false;
      emitChange();

      return true;
    }

    function handleBackspace(event) {
      const selection = window.getSelection();
      if (!selectionInsideRoot(selection) || selection.rangeCount === 0 || !selection.isCollapsed) {
        return false;
      }

      const range = selection.getRangeAt(0);
      const block = getBlockFromNode(range.startContainer);
      const content = getContentElement(block);
      if (!block || !content || !isCaretAtStart(content, range)) return false;

      if (block.dataset.type === 'code' && isContentEmpty(content)) {
        event.preventDefault();
        replaceBlockWithParagraph(block);
        return true;
      }

      if (block.parentElement?.closest('.block')) {
        event.preventDefault();
        outdentBlock(block);
        focusAtStart(content);
        return true;
      }

      if (!['paragraph', 'toggle', 'code'].includes(block.dataset.type)) {
        event.preventDefault();
        const paragraph = transformBlock(block, 'paragraph');
        focusAtStart(getContentElement(paragraph));
        return true;
      }

      if (isContentEmpty(content)) {
        const previous = block.previousElementSibling;
        if (previous?.classList.contains('block')) {
          event.preventDefault();
          block.remove();
          focusAtEnd(getContentElement(previous));
          ensureRootHasBlock();
          emitChange();
          return true;
        }
      }

      const previous = block.previousElementSibling;
      if (previous?.classList.contains('block')) {
        const previousContent = getContentElement(previous);
        if (previousContent && previous.dataset.type !== 'divider') {
          event.preventDefault();
          const fragment = document.createDocumentFragment();
          [...content.childNodes].forEach((node) => fragment.append(node));
          if (previousContent.innerHTML === '<br>') previousContent.replaceChildren();
          previousContent.append(fragment);
          block.remove();
          focusAtEnd(previousContent);
          emitChange();
          return true;
        }
      }

      return false;
    }

    function handleDeleteWholeNote(event) {
      const selection = window.getSelection();
      if (!selectionMatchesNodeContents(selection, root)) return false;
      if (!['Backspace', 'Delete'].includes(event.key)) return false;

      event.preventDefault();
      root.replaceChildren(createBlock('paragraph'));
      focusAtStart(getContentElement(root.firstElementChild));
      emitChange();
      return true;
    }

    function getPlainText(content) {
      return (content?.textContent || '')
        .replace(/\u200B/g, '')
        .replace(/\u00A0/g, ' ');
    }

    function clearContent(content) {
      content.innerHTML = '<br>';
    }

    function removeLeadingCharacters(content, characterCount) {
      if (!content || characterCount <= 0) return;

      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      let remaining = characterCount;
      let endNode = null;
      let endOffset = 0;

      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (remaining <= node.textContent.length) {
          endNode = node;
          endOffset = remaining;
          break;
        }
        remaining -= node.textContent.length;
      }

      if (!endNode) return;

      const range = document.createRange();
      range.setStart(content, 0);
      range.setEnd(endNode, endOffset);
      range.deleteContents();
      normalizeEmptyContent(content);
    }

    function applyShortcut(block, content, text) {
      if (!block || !content) return false;

      const isToggleTitle = content.classList.contains('toggle-title');
      const headingPrefixes = [
        ['### ', 'heading-3'],
        ['## ', 'heading-2'],
        ['# ', 'heading-1']
      ];

      if (isToggleTitle) {
        const headingMatch = headingPrefixes.find(([prefix]) => text === prefix);
        if (!headingMatch) return false;

        removeLeadingCharacters(content, headingMatch[0].length);
        content.dataset.titleStyle = headingMatch[1];
        focusAtStart(content);
        emitChange();
        return true;
      }

      // Also supports pasted or pre-existing content such as "> # Heading".
      const compoundToggle = text.match(/^>\s(#{1,3})\s$/);
      if (compoundToggle) {
        const prefixLength = compoundToggle[0].length;
        const titleStyle = `heading-${compoundToggle[1].length}`;
        removeLeadingCharacters(content, prefixLength);
        const toggle = transformBlock(block, 'toggle', { titleStyle });
        focusAtStart(getContentElement(toggle));
        return true;
      }

      const mappings = [
        ['``` ', 'code'],
        ['--- ', 'divider'],
        ['[ ] ', 'checklist'],
        ['[] ', 'checklist'],
        ['### ', 'heading-3'],
        ['## ', 'heading-2'],
        ['# ', 'heading-1'],
        ['1. ', 'numbered-list'],
        ['- ', 'bulleted-list'],
        ['> ', 'toggle']
      ];

      const mapping = mappings.find(([prefix]) => text === prefix);
      if (!mapping) return false;

      const [prefix, targetType] = mapping;
      const sourceType = block.dataset.type;
      const previousQuote = sourceType === 'quote' && block.previousElementSibling?.dataset.type === 'quote'
        ? block.previousElementSibling
        : null;
      removeLeadingCharacters(content, prefix.length);

      const transformOptions = {};
      if (targetType === 'toggle' && sourceType.startsWith('heading-')) {
        transformOptions.titleStyle = sourceType;
      }

      if (previousQuote) suppressChange = true;
      const transformed = transformBlock(block, targetType, transformOptions);
      if (previousQuote && targetType !== 'divider') {
        getChildContainer(previousQuote).append(transformed);
        suppressChange = false;
        emitChange();
      } else if (previousQuote) {
        suppressChange = false;
      }
      if (targetType === 'divider') {
        const paragraph = createBlock('paragraph');
        insertAfter(transformed, paragraph);
        focusAtStart(getContentElement(paragraph));
      } else {
        focusAtStart(getContentElement(transformed));
      }
      return true;
    }

    function updateSlashMenu(block, content) {
      const text = getPlainText(content);
      if (!text.startsWith('/') || text.includes('\n')) {
        onCloseMenu();
        return;
      }

      const range = window.getSelection()?.rangeCount
        ? window.getSelection().getRangeAt(0)
        : null;
      const rect = range?.getBoundingClientRect();
      const fallbackRect = content.getBoundingClientRect();

      activeMenuBlock = block;
      saveSelection();
      onRequestMenu({
        mode: 'slash',
        block,
        query: text.slice(1),
        x: rect?.left || fallbackRect.left,
        y: (rect?.bottom || fallbackRect.bottom) + 6
      });
    }

    function removeSlashQuery(block) {
      const content = getContentElement(block);
      if (!content) return;
      const text = getPlainText(content);
      if (text.startsWith('/')) clearContent(content);
    }

    function getBlockHtml(block) {
      const content = getContentElement(block);
      if (!content) return '<br>';
      if (block.dataset.type === 'code') {
        return escapeHtml(content.textContent || '');
      }
      return content.innerHTML || '<br>';
    }

    function escapeHtml(value) {
      return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function transformBlock(block, targetType, options = {}) {
      if (!block) block = getCurrentBlock();
      if (!block) return null;

      const normalizedTarget = normalizeType(targetType);
      const sourceType = block.dataset.type;
      const sourceChildren = [...(getChildContainer(block)?.children || [])];

      if (sourceType === normalizedTarget && normalizedTarget !== 'toggle') {
        return block;
      }

      if (sourceType === 'toggle') {
        const title = getContentElement(block);
        const titleHtml = title?.innerHTML || '<br>';
        const children = sourceChildren;

        if (normalizedTarget === 'toggle') {
          if (options.titleStyle) title.dataset.titleStyle = options.titleStyle;
          emitChange();
          return block;
        }

        const replacement = createBlock(normalizedTarget, {
          html: titleHtml,
          children: []
        });
        block.replaceWith(replacement);

        let insertionPoint = replacement;
        children.forEach((child) => {
          insertionPoint.insertAdjacentElement('afterend', child);
          insertionPoint = child;
        });

        refreshNumberedMarkers();
        emitChange();
        return replacement;
      }

      const sourceContent = getContentElement(block);
      const sourceHtml = sourceType === 'code'
        ? escapeHtml(sourceContent?.textContent || '')
        : sourceContent?.innerHTML || '<br>';

      if (normalizedTarget === 'toggle') {
        const titleStyle = options.titleStyle
          || (sourceType.startsWith('heading-') ? sourceType : 'paragraph');
        const toggle = createBlock('toggle', {
          html: sourceHtml,
          titleStyle,
          open: true,
          children: sourceChildren
        });
        block.replaceWith(toggle);
        refreshNumberedMarkers();
        emitChange();
        return toggle;
      }

      const replacement = createBlock(normalizedTarget, {
        html: sourceHtml,
        text: sourceType === 'code' ? sourceContent?.textContent || '' : undefined,
        checked: normalizedTarget === 'checklist' ? false : undefined,
        children: sourceChildren
      });

      block.replaceWith(replacement);
      refreshNumberedMarkers();
      emitChange();
      return replacement;
    }

    function setToggleTitleStyle(block, titleStyle) {
      if (!block || block.dataset.type !== 'toggle') return;
      const title = getContentElement(block);
      title.dataset.titleStyle = ['paragraph', 'heading-1', 'heading-2', 'heading-3'].includes(titleStyle)
        ? titleStyle
        : 'paragraph';
      emitChange();
    }

    function insertBlock(type, referenceBlock = null, options = {}) {
      const reference = referenceBlock || activeMenuBlock || ensureCaretBlock();
      const block = createBlock(type, {
        ...options
      });
      insertAfter(reference, block);
      focusAtStart(getContentElement(block));
      emitChange();
      return block;
    }

    function duplicateBlock(block = null) {
      const source = block || activeMenuBlock || getCurrentBlock();
      if (!source) return null;

      const sources = getSelectedBlocks(source);
      if (sources.length > 1) {
        let insertionPoint = sources[sources.length - 1];
        const clones = sources.map((selectedBlock) => {
          const clone = selectedBlock.cloneNode(true);
          clone.dataset.blockId = nextBlockId();
          clone.querySelectorAll('.block').forEach((child) => { child.dataset.blockId = nextBlockId(); });
          insertionPoint.insertAdjacentElement('afterend', clone);
          insertionPoint = clone;
          return clone;
        });
        focusAtEnd(getContentElement(clones[clones.length - 1]));
        emitChange();
        return clones;
      }

      const clone = source.cloneNode(true);
      clone.classList.remove('dragging', 'drag-target-before', 'drag-target-after');
      clone.draggable = false;

      clone.querySelectorAll('.block').forEach((child) => {
        child.dataset.blockId = nextBlockId();
        child.draggable = false;
      });
      clone.dataset.blockId = nextBlockId();

      insertAfter(source, clone);
      focusAtEnd(getContentElement(clone));
      emitChange();
      return clone;
    }

    function deleteBlock(block = null) {
      const target = block || activeMenuBlock || getCurrentBlock();
      if (!target) return;

      const targets = getSelectedBlocks(target);
      if (targets.length > 1) {
        const previous = targets[0].previousElementSibling;
        const next = targets[targets.length - 1].nextElementSibling;
        targets.forEach((selectedBlock) => selectedBlock.remove());
        ensureRootHasBlock();
        const focusTarget = previous?.classList.contains('block') ? previous : next || root.querySelector('.block');
        focusAtEnd(getContentElement(focusTarget));
        emitChange();
        return;
      }

      const previous = target.previousElementSibling;
      const next = target.nextElementSibling;
      const parent = target.parentElement;
      target.remove();

      ensureRootHasBlock();

      const focusTarget = previous?.classList.contains('block')
        ? previous
        : next?.classList.contains('block')
          ? next
          : parent?.querySelector('.block') || root.querySelector('.block');

      focusAtEnd(getContentElement(focusTarget));
      emitChange();
    }

    function moveBlock(block, direction) {
      const target = block || activeMenuBlock || getCurrentBlock();
      if (!target) return;

      const selected = getSelectedBlocks(target).filter((item) => item.parentElement === target.parentElement);
      const targets = selected.length ? selected : [target];

      if (direction === 'up') {
        const previous = targets[0].previousElementSibling;
        if (previous?.classList.contains('block')) {
          targets.forEach((item) => previous.insertAdjacentElement('beforebegin', item));
        }
      } else {
        const next = targets[targets.length - 1].nextElementSibling;
        if (next?.classList.contains('block')) {
          [...targets].reverse().forEach((item) => next.insertAdjacentElement('afterend', item));
        }
      }

      focusAtStart(getContentElement(target));
      emitChange();
    }

    function executeMenuCommand(command, block = null) {
      const target = block || activeMenuBlock || getCurrentBlock();
      restoreSelection();

      if (command.startsWith('transform:')) {
        removeSlashQuery(target);
        const targetType = command.slice('transform:'.length);
        const selected = getSelectedBlocks(target);
        const transformedBlocks = selected.map((item) => transformBlock(item, targetType));
        const transformed = transformedBlocks[0];

        if (targetType === 'divider') {
          const paragraph = createBlock('paragraph');
          insertAfter(transformed, paragraph);
          focusAtStart(getContentElement(paragraph));
          emitChange();
        } else {
          focusAtStart(getContentElement(transformed));
        }
      } else if (command.startsWith('insert:')) {
        removeSlashQuery(target);
        const targetType = command.slice('insert:'.length);
        const inserted = insertBlock(targetType, target);
        if (targetType === 'divider') {
          const paragraph = createBlock('paragraph');
          insertAfter(inserted, paragraph);
          focusAtStart(getContentElement(paragraph));
          emitChange();
        }
      } else if (command.startsWith('toggle-title:')) {
        setToggleTitleStyle(target, command.slice('toggle-title:'.length));
        focusAtStart(getContentElement(target));
      } else if (command === 'duplicate') {
        duplicateBlock(target);
      } else if (command === 'delete') {
        deleteBlock(target);
      } else if (command === 'move-up') {
        moveBlock(target, 'up');
      } else if (command === 'move-down') {
        moveBlock(target, 'down');
      }

      activeMenuBlock = null;
      onCloseMenu();
    }

    function refreshNumberedMarkers(container = root) {
      const children = [...container.children].filter((child) => child.classList?.contains('block'));
      let counter = 0;

      children.forEach((block) => {
        const type = block.dataset.type;
        if (type === 'numbered-list') {
          counter += 1;
          const marker = block.querySelector(':scope > .block-main > .block-row > .list-marker');
          if (marker) marker.textContent = `${counter}.`;
        } else {
          counter = 0;
        }
        const childContainer = getChildContainer(block);
        if (childContainer) refreshNumberedMarkers(childContainer);
      });
    }

    function readableDomain(hostname) {
      const host = hostname.replace(/^www\./i, '').toLowerCase();
      const known = {
        'youtube.com': 'YouTube',
        'youtu.be': 'YouTube',
        'github.com': 'GitHub',
        'linkedin.com': 'LinkedIn',
        'wikipedia.org': 'Wikipedia',
        'en.wikipedia.org': 'Wikipedia',
        'google.com': 'Google',
        'docs.google.com': 'Google Docs',
        'drive.google.com': 'Google Drive',
        'notion.so': 'Notion',
        'reddit.com': 'Reddit',
        'x.com': 'X',
        'twitter.com': 'X'
      };

      if (known[host]) return known[host];

      const mainPart = host.split('.').slice(-2, -1)[0] || host.split('.')[0] || host;
      return mainPart
        .split(/[-_]/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }

    function readablePath(pathname) {
      const specialPaths = {
        '/feed/subscriptions': 'Subscriptions',
        '/feed/history': 'History',
        '/watch-later': 'Watch Later'
      };

      if (specialPaths[pathname]) return specialPaths[pathname];

      const segments = pathname
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean);

      if (!segments.length) return '';

      const value = decodeURIComponent(segments[segments.length - 1])
        .replace(/\.[a-z0-9]{2,5}$/i, '')
        .replace(/[-_+]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!value || /^[a-zA-Z0-9_-]{18,}$/.test(value)) return '';

      return value
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }

    function readableLinkLabel(rawUrl) {
      try {
        const parsed = new URL(rawUrl);
        const domain = readableDomain(parsed.hostname);
        const path = readablePath(parsed.pathname);
        return path ? `${path} - ${domain}` : domain;
      } catch {
        return rawUrl;
      }
    }

    function trimUrlPunctuation(rawUrl) {
      const trailing = rawUrl.match(/[),.;!?]+$/)?.[0] || '';
      return {
        url: trailing ? rawUrl.slice(0, -trailing.length) : rawUrl,
        trailing
      };
    }

    function insertFragmentAtSelection(fragment) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      range.deleteContents();
      const lastNode = fragment.lastChild;
      range.insertNode(fragment);

      if (lastNode) {
        range.setStartAfter(lastNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    function insertLinkedText(text) {
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      let match;
      URL_PATTERN.lastIndex = 0;

      while ((match = URL_PATTERN.exec(text)) !== null) {
        const { url, trailing } = trimUrlPunctuation(match[0]);
        const start = match.index;

        if (start > cursor) {
          fragment.append(document.createTextNode(text.slice(cursor, start)));
        }

        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = readableLinkLabel(url);
        fragment.append(anchor);

        if (trailing) fragment.append(document.createTextNode(trailing));
        cursor = start + match[0].length;
      }

      if (cursor < text.length) {
        fragment.append(document.createTextNode(text.slice(cursor)));
      }

      insertFragmentAtSelection(fragment);
    }

    function handlePaste(event) {
      const selection = window.getSelection();
      if (!selectionInsideRoot(selection)) return;

      const text = event.clipboardData?.getData('text/plain') || '';
      if (!text) return;
      URL_PATTERN.lastIndex = 0;

      event.preventDefault();

      if (text.includes('\n')) {
        const block = getBlockFromNode(selection.anchorNode);
        const lines = text.replace(/\r\n?/g, '\n').split('\n');
        const blocks = lines.map((line) => createBlock('paragraph', {
          html: escapeHtml(line) || '<br>'
        }));
        if (block) {
          blocks.forEach((newBlock) => insertBefore(block, newBlock));
          if (isContentEmpty(getContentElement(block))) block.remove();
          focusAtEnd(getContentElement(blocks[blocks.length - 1]));
          emitChange();
        }
        return;
      }

      if (!URL_PATTERN.test(text)) {
        URL_PATTERN.lastIndex = 0;
        insertTextAtSelection(text);
        emitChange();
        return;
      }
      URL_PATTERN.lastIndex = 0;

      const matches = text.match(URL_PATTERN) || [];
      const isSingleUrl = matches.length === 1 && text.trim() === matches[0];

      if (isSingleUrl && selection && !selection.isCollapsed) {
        document.execCommand('createLink', false, matches[0]);
        root.querySelectorAll('a').forEach((anchor) => {
          if (anchor.href === matches[0] || anchor.getAttribute('href') === matches[0]) {
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
          }
        });
      } else {
        insertLinkedText(text);
      }

      emitChange();
    }

    function migrateNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.textContent.trim()) return [];
        return [createBlock('paragraph', { html: escapeHtml(node.textContent) })];
      }

      if (!(node instanceof HTMLElement)) return [];

      if (node.classList.contains('block') && BLOCK_TYPES.has(node.dataset.type)) {
        return [node];
      }

      if (node.matches('details.notion-toggle')) {
        const titleSource = node.querySelector('summary .notion-toggle-title, summary');
        const bodySource = node.querySelector('.notion-toggle-body');
        const titleStyle = titleSource?.classList.contains('as-h1')
          ? 'heading-1'
          : titleSource?.classList.contains('as-h2')
            ? 'heading-2'
            : titleSource?.classList.contains('as-h3')
              ? 'heading-3'
              : 'paragraph';

        const children = [];
        [...(bodySource?.childNodes || [])].forEach((child) => {
          children.push(...migrateNode(child));
        });

        return [createBlock('toggle', {
          html: titleSource?.innerHTML || '<br>',
          titleStyle,
          open: node.open,
          children
        })];
      }

      if (node.matches('ul, ol')) {
        const type = node.tagName === 'UL' ? 'bulleted-list' : 'numbered-list';
        return [...node.children]
          .filter((child) => child.tagName === 'LI')
          .map((item) => createBlock(type, { html: item.innerHTML }));
      }

      if (node.classList.contains('todo-item')) {
        const text = node.querySelector('.todo-text')?.innerHTML || node.textContent || '';
        const checked = node.querySelector('input[type="checkbox"]')?.checked
          || node.classList.contains('completed');
        return [createBlock('checklist', { html: text, checked })];
      }

      const typeMap = {
        H1: 'heading-1',
        H2: 'heading-2',
        H3: 'heading-3',
        BLOCKQUOTE: 'quote',
        PRE: 'code',
        HR: 'divider'
      };

      const mappedType = typeMap[node.tagName] || 'paragraph';
      return [createBlock(mappedType, {
        html: node.innerHTML,
        text: mappedType === 'code' ? node.textContent : undefined
      })];
    }

    function deserializeBlockData(data) {
      const type = normalizeType(data?.type);
      const children = Array.isArray(data?.children)
        ? data.children.map(deserializeBlockData)
        : [];

      return createBlock(type, {
        id: data?.id,
        html: data?.html || '<br>',
        text: data?.text || '',
        checked: data?.checked === true,
        titleStyle: data?.titleStyle || 'paragraph',
        open: data?.open !== false,
        children
      });
    }

    function serializeBlockData(block) {
      const type = normalizeType(block?.dataset.type);
      const result = { type, id: block.dataset.blockId };

      const children = [...(getChildContainer(block)?.children || [])]
        .filter((child) => child.classList?.contains('block'))
        .map(serializeBlockData);

      if (type === 'divider') {
        if (children.length) result.children = children;
        return result;
      }

      const content = getContentElement(block);
      if (type === 'code') {
        const text = content?.textContent || '';
        if (text) result.text = text;
        if (children.length) result.children = children;
        return result;
      }

      const html = content?.innerHTML === '<br>' ? '' : content?.innerHTML || '';
      if (html) result.html = html;

      if (type === 'checklist' && block.dataset.checked === 'true') {
        result.checked = true;
      }

      if (type === 'toggle') {
        const titleStyle = content?.dataset.titleStyle || 'paragraph';
        if (titleStyle !== 'paragraph') result.titleStyle = titleStyle;
        if (block.dataset.open === 'false') result.open = false;

      }

      if (children.length) result.children = children;

      return result;
    }

    function normalizeLoadedBlocks() {
      const existingTopBlocks = [...root.children].filter((child) => child.classList?.contains('block'));

      if (existingTopBlocks.length === root.children.length && existingTopBlocks.length > 0) {
        root.querySelectorAll('.block').forEach((block) => {
          block.dataset.type = normalizeType(block.dataset.type);
          delete block.dataset.indent;
          block.dataset.blockId = block.dataset.blockId || nextBlockId();
          block.draggable = false;
          block.classList.remove('dragging', 'drag-target-before', 'drag-target-after');

          if (!block.querySelector(':scope > .block-handle')) {
            block.prepend(createHandle());
          }

          if (block.dataset.type === 'toggle') {
            block.dataset.open = block.dataset.open === 'false' ? 'false' : 'true';
            const title = getContentElement(block);
            if (title) title.dataset.titleStyle = title.dataset.titleStyle || 'paragraph';
          }

          if (block.dataset.type === 'checklist') {
            const checkbox = block.querySelector('input[type="checkbox"]');
            const checked = block.dataset.checked === 'true';
            if (checkbox) checkbox.checked = checked;
          }
        });
        return;
      }

      const nodes = [...root.childNodes];
      root.replaceChildren();
      nodes.forEach((node) => {
        migrateNode(node).forEach((block) => root.append(block));
      });
    }

    function load(value = '', options = {}) {
      suppressChange = true;
      try {
        root.replaceChildren();

        if (Array.isArray(value)) {
          const containers = [root];
          let previousBlock = null;
          let previousDepth = 0;
          value.forEach((blockData) => {
            const requestedDepth = Math.max(0, Number.parseInt(blockData?.indent, 10) || 0);
            const depth = previousBlock ? Math.min(requestedDepth, previousDepth + 1) : 0;
            if (depth > previousDepth && previousBlock) {
              containers[depth] = getChildContainer(previousBlock);
            }
            containers.length = depth + 1;
            const block = deserializeBlockData(blockData);
            (containers[depth] || root).append(block);
            previousBlock = block;
            previousDepth = depth;
          });
        } else {
          root.innerHTML = typeof value === 'string' ? value : '';
          normalizeLoadedBlocks();
        }

        ensureRootHasBlock();
        refreshNumberedMarkers();
        updateEmptyState();
      } finally {
        suppressChange = false;
      }
      if (!options.preserveHistory) {
        historyEntries = [{ data: JSON.stringify(serialize()), blockId: '', offset: 0 }];
        historyIndex = 0;
      }
    }

    function serialize() {
      return [...root.children]
        .filter((child) => child.classList?.contains('block'))
        .map(serializeBlockData);
    }

    function clearDragIndicators() {
      root.querySelectorAll('.drag-target-before, .drag-target-after').forEach((block) => {
        block.classList.remove('drag-target-before', 'drag-target-after');
      });
      dragTargetBlock = null;
      dragTargetPosition = null;
    }

    root.addEventListener('keydown', (event) => {
      if (handleHistoryShortcut(event)) return;
      if (handleSelectAll(event)) return;
      if (handleDeleteWholeNote(event)) return;
      if (event.key === 'Enter' && handleEnter(event)) return;
      if (event.key === 'Tab' && handleTab(event)) return;
      if (event.key === 'Backspace' && handleBackspace(event)) return;
    }, { capture: true, signal });

    root.addEventListener('beforeinput', (event) => {
      if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo') return;
      event.preventDefault();
      restoreHistory(historyIndex + (event.inputType === 'historyRedo' ? 1 : -1));
    }, { signal });

    root.addEventListener('input', (event) => {
      const selection = window.getSelection();
      const anchorElement = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? selection.anchorNode
        : selection?.anchorNode?.parentElement;
      const content = anchorElement?.closest?.('[data-block-content]')
        || event.target.closest?.('[data-block-content]');
      const block = getBlockFromNode(content || anchorElement || event.target);
      if (!block || !content) {
        ensureRootHasBlock();
        emitChange();
        return;
      }

      const text = getPlainText(content);

      if (block.dataset.type === 'code') {
        onCloseMenu();
        emitChange();
        return;
      }

      if (applyShortcut(block, content, text)) return;

      updateSlashMenu(block, content);
      emitChange();
    }, { signal });

    root.addEventListener('paste', handlePaste, { signal });

    root.addEventListener('change', (event) => {
      const checkbox = event.target.closest?.('input[type="checkbox"]');
      if (!checkbox) return;
      const block = checkbox.closest('.block[data-type="checklist"]');
      if (!block) return;
      block.dataset.checked = checkbox.checked ? 'true' : 'false';
      emitChange();
    }, { signal });

    root.addEventListener('click', (event) => {
      const caret = event.target.closest?.('[data-toggle-caret]');
      if (caret) {
        const block = caret.closest('.block[data-type="toggle"]');
        block.dataset.open = block.dataset.open === 'true' ? 'false' : 'true';
        emitChange();
        return;
      }

      const handle = event.target.closest?.('[data-drag-handle]');
      if (handle) {
        event.preventDefault();
        if (suppressHandleClick) {
          suppressHandleClick = false;
          return;
        }
        const block = handle.closest('.block');
        activeMenuBlock = block;
        saveSelection();
        const rect = handle.getBoundingClientRect();
        onRequestMenu({
          mode: 'context',
          block,
          query: '',
          x: rect.left,
          y: rect.bottom + 5
        });
      }
    }, { signal });

    root.addEventListener('contextmenu', (event) => {
      const block = event.target.closest?.('.block');
      if (!block) return;
      event.preventDefault();
      activeMenuBlock = block;
      saveSelection();
      onRequestMenu({
        mode: 'context',
        block,
        query: '',
        x: event.clientX,
        y: event.clientY
      });
    }, { signal });

    root.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const handle = event.target.closest?.('[data-drag-handle]');
      armedDragBlock = null;

      if (handle) {
        event.preventDefault();
        const block = handle.closest('.block');
        block.setAttribute('aria-grabbed', 'true');
        armedDragBlock = block;
        dragPointerId = event.pointerId;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        handle.setPointerCapture?.(event.pointerId);
      }
    }, { capture: true, signal });

    root.addEventListener('pointermove', (event) => {
      if (!armedDragBlock || event.pointerId !== dragPointerId) return;
      if (!draggedBlock && Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY) < 5) return;
      event.preventDefault();
      if (!draggedBlock) {
        draggedBlock = armedDragBlock;
        draggedBlock.classList.add('dragging');
        suppressHandleClick = true;
      }
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.block');
      if (!target || target === draggedBlock || target.contains(draggedBlock) || draggedBlock.contains(target)) return;
      clearDragIndicators();

      const rect = target.getBoundingClientRect();
      const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      target.classList.add(position === 'before' ? 'drag-target-before' : 'drag-target-after');
      dragTargetBlock = target;
      dragTargetPosition = position;
    }, { signal });

    const disarmDrag = () => {
      clearDragIndicators();
      if (armedDragBlock) {
        armedDragBlock.removeAttribute('aria-grabbed');
      }
      if (draggedBlock) draggedBlock.classList.remove('dragging');
      armedDragBlock = null;
      draggedBlock = null;
      dragPointerId = null;
    };

    root.addEventListener('pointerup', (event) => {
      if (event.pointerId !== dragPointerId) return;
      if (draggedBlock && dragTargetBlock) {
        if (dragTargetPosition === 'before') {
          dragTargetBlock.insertAdjacentElement('beforebegin', draggedBlock);
        } else {
          dragTargetBlock.insertAdjacentElement('afterend', draggedBlock);
        }
        refreshNumberedMarkers();
        emitChange();
      }
      disarmDrag();
    }, { signal });
    root.addEventListener('pointercancel', () => {
      disarmDrag();
      suppressHandleClick = false;
    }, { signal });

    document.addEventListener('selectionchange', () => {
      const selection = window.getSelection();
      if (selectionInsideRoot(selection)) {
        saveSelection();
        onSelectionChange(selection);
      } else {
        onSelectionChange(null);
      }
    }, { signal });

    load('');

    return Object.freeze({
      root,
      load,
      serialize,
      focus() {
        const block = ensureCaretBlock();
        focusAtEnd(getContentElement(block));
      },
      getCurrentBlock,
      getContentElement,
      getToggleBody,
      saveSelection,
      restoreSelection,
      createBlock,
      insertBlock,
      transformBlock,
      setToggleTitleStyle,
      duplicateBlock,
      deleteBlock,
      moveBlock,
      executeMenuCommand,
      readableLinkLabel,
      destroy() {
        abortController.abort();
      }
    });
  }

  window.NoteEditor = Object.freeze({
    BLOCK_TYPES,
    create: createEditor
  });
})();
