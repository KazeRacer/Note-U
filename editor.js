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

  const MAX_INDENT = 8;
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
    let suppressChange = false;
    let blockCounter = 0;

    const abortController = new AbortController();
    const { signal } = abortController;

    function nextBlockId() {
      blockCounter += 1;
      return `block-${Date.now().toString(36)}-${blockCounter.toString(36)}`;
    }

    function normalizeType(type) {
      return BLOCK_TYPES.has(type) ? type : 'paragraph';
    }

    function clampIndent(value) {
      const numericValue = Number.parseInt(value, 10);
      if (!Number.isFinite(numericValue)) return 0;
      return Math.max(0, Math.min(MAX_INDENT, numericValue));
    }

    function cleanHtml(html) {
      if (typeof html !== 'string' || !html.trim()) return '<br>';
      return html;
    }

    function createHandle() {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'block-handle';
      handle.tabIndex = -1;
      handle.contentEditable = 'false';
      handle.setAttribute('data-drag-handle', 'true');
      handle.setAttribute('aria-label', 'Block actions');
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
      block.dataset.indent = String(clampIndent(options.indent || 0));
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

    function setBlockIndent(block, indent) {
      if (!block) return;
      block.dataset.indent = String(clampIndent(indent));
      refreshNumberedMarkers();
      emitChange();
    }

    function indentBlock(block) {
      setBlockIndent(block, clampIndent(block?.dataset.indent) + 1);
    }

    function outdentBlock(block) {
      setBlockIndent(block, clampIndent(block?.dataset.indent) - 1);
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
      onChange(serialize());
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
      const nextType = ['heading-1', 'heading-2', 'heading-3', 'quote'].includes(currentType)
        ? 'paragraph'
        : currentType;

      const nextBlock = createBlock(nextType, {
        indent: block.dataset.indent,
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
        indent: block.dataset.indent,
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
      const paragraph = createBlock('paragraph', {
        indent: toggle.dataset.indent
      });
      insertAfter(toggle, paragraph);
      focusAtStart(getContentElement(paragraph));
      emitChange();
      return true;
    }

    function handleCodeEnter(event, block, content, range) {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const paragraph = createBlock('paragraph', {
          indent: block.dataset.indent
        });
        insertAfter(block, paragraph);
        focusAtStart(getContentElement(paragraph));
        emitChange();
        return true;
      }

      const textBeforeRange = document.createRange();
      textBeforeRange.selectNodeContents(content);
      textBeforeRange.setEnd(range.startContainer, range.startOffset);
      const textBefore = textBeforeRange.toString();

      if (range.collapsed && isCaretAtEnd(content, range) && textBefore.endsWith('\n')) {
        event.preventDefault();
        content.textContent = textBefore.slice(0, -1);
        const paragraph = createBlock('paragraph', {
          indent: block.dataset.indent
        });
        insertAfter(block, paragraph);
        focusAtStart(getContentElement(paragraph));
        emitChange();
        return true;
      }

      event.preventDefault();
      document.execCommand('insertText', false, '\n');
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
          const paragraph = createBlock('paragraph', { indent: block.dataset.indent });
          insertAfter(block, paragraph);
          focusAtStart(getContentElement(paragraph));
          emitChange();
          return true;
        }
        return false;
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

      if (block.dataset.type === 'code') {
        return handleCodeEnter(event, block, content, range);
      }

      const empty = isContentEmpty(content);
      if (empty) {
        const indent = clampIndent(block.dataset.indent);

        // An empty nested block exits one indentation level at a time.
        // Inside a toggle, the following Enter exits the toggle itself.
        if (indent > 0) {
          event.preventDefault();
          outdentBlock(block);
          focusAtStart(content);
          return true;
        }

        if (block.parentElement?.classList.contains('toggle-body') && exitToggleFromBody(block)) {
          event.preventDefault();
          return true;
        }

        if (['bulleted-list', 'numbered-list', 'checklist', 'quote', 'heading-1', 'heading-2', 'heading-3'].includes(block.dataset.type)) {
          event.preventDefault();
          replaceBlockWithParagraph(block);
          return true;
        }
      }

      event.preventDefault();
      splitCurrentBlock(block, content);
      return true;
    }

    function insertTextAtSelection(text) {
      document.execCommand('insertText', false, text);
    }

    function handleTab(event) {
      const selection = window.getSelection();
      if (!selectionInsideRoot(selection) || selection.rangeCount === 0) return false;

      const block = getBlockFromNode(selection.anchorNode);
      if (!block) return false;

      event.preventDefault();

      if (block.dataset.type === 'code') {
        if (event.shiftKey) {
          const content = getContentElement(block);
          const range = selection.getRangeAt(0);
          const beforeRange = document.createRange();
          beforeRange.selectNodeContents(content);
          beforeRange.setEnd(range.startContainer, range.startOffset);
          const before = beforeRange.toString();

          if (before.endsWith('  ')) {
            range.setStart(range.startContainer, Math.max(0, range.startOffset - 2));
            range.deleteContents();
          }
        } else {
          insertTextAtSelection('  ');
        }
        emitChange();
        return true;
      }

      if (event.shiftKey) {
        outdentBlock(block);
      } else {
        indentBlock(block);
      }

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

      const indent = clampIndent(block.dataset.indent);
      if (indent > 0) {
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
      return (content?.textContent || '').replace(/\u200B/g, '');
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
        const headingMatch = headingPrefixes.find(([prefix]) => text.startsWith(prefix));
        if (!headingMatch) return false;

        removeLeadingCharacters(content, headingMatch[0].length);
        content.dataset.titleStyle = headingMatch[1];
        focusAtStart(content);
        emitChange();
        return true;
      }

      // Also supports pasted or pre-existing content such as "> # Heading".
      const compoundToggle = text.match(/^>\s(#{1,3})\s/);
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

      const mapping = mappings.find(([prefix]) => text.startsWith(prefix));
      if (!mapping) return false;

      const [prefix, targetType] = mapping;
      const remainingText = text.slice(prefix.length);
      if (targetType === 'divider' && remainingText.trim()) return false;

      const sourceType = block.dataset.type;
      removeLeadingCharacters(content, prefix.length);

      const transformOptions = {};
      if (targetType === 'toggle' && sourceType.startsWith('heading-')) {
        transformOptions.titleStyle = sourceType;
      }

      const transformed = transformBlock(block, targetType, transformOptions);
      if (targetType === 'divider') {
        const paragraph = createBlock('paragraph', { indent: transformed.dataset.indent });
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
      const indent = block.dataset.indent;

      if (sourceType === normalizedTarget && normalizedTarget !== 'toggle') {
        return block;
      }

      if (sourceType === 'toggle') {
        const title = getContentElement(block);
        const titleHtml = title?.innerHTML || '<br>';
        const body = getToggleBody(block);
        const children = [...(body?.children || [])];

        if (normalizedTarget === 'toggle') {
          if (options.titleStyle) title.dataset.titleStyle = options.titleStyle;
          emitChange();
          return block;
        }

        const replacement = createBlock(normalizedTarget, {
          indent,
          html: titleHtml
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
          indent,
          html: sourceHtml,
          titleStyle,
          open: true
        });
        block.replaceWith(toggle);
        refreshNumberedMarkers();
        emitChange();
        return toggle;
      }

      const replacement = createBlock(normalizedTarget, {
        indent,
        html: sourceHtml,
        text: sourceType === 'code' ? sourceContent?.textContent || '' : undefined,
        checked: normalizedTarget === 'checklist' ? false : undefined
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
        indent: reference?.dataset.indent || 0,
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

      if (direction === 'up') {
        const previous = target.previousElementSibling;
        if (previous?.classList.contains('block')) {
          previous.insertAdjacentElement('beforebegin', target);
        }
      } else {
        const next = target.nextElementSibling;
        if (next?.classList.contains('block')) {
          next.insertAdjacentElement('afterend', target);
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
        const transformed = transformBlock(target, targetType);

        if (targetType === 'divider') {
          const paragraph = createBlock('paragraph', { indent: transformed.dataset.indent });
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
          const paragraph = createBlock('paragraph', { indent: inserted.dataset.indent });
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
      const counters = new Map();

      children.forEach((block) => {
        const type = block.dataset.type;
        const indent = clampIndent(block.dataset.indent);

        if (type === 'numbered-list') {
          const key = String(indent);
          const previous = counters.get(key) || 0;
          const next = previous + 1;
          counters.set(key, next);
          const marker = block.querySelector(':scope > .block-main > .block-row > .list-marker');
          if (marker) marker.textContent = `${next}.`;
        } else {
          [...counters.keys()]
            .filter((key) => Number(key) >= indent)
            .forEach((key) => counters.delete(key));
        }

        if (type === 'toggle') {
          const body = getToggleBody(block);
          if (body) refreshNumberedMarkers(body);
        }
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
      if (!text || !URL_PATTERN.test(text)) {
        URL_PATTERN.lastIndex = 0;
        return;
      }
      URL_PATTERN.lastIndex = 0;

      event.preventDefault();

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
      const children = type === 'toggle' && Array.isArray(data?.children)
        ? data.children.map(deserializeBlockData)
        : [];

      return createBlock(type, {
        indent: data?.indent || 0,
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
      const indent = clampIndent(block?.dataset.indent);
      const result = { type };

      if (indent > 0) result.indent = indent;

      if (type === 'divider') return result;

      const content = getContentElement(block);
      if (type === 'code') {
        const text = content?.textContent || '';
        if (text) result.text = text;
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

        const body = getToggleBody(block);
        const children = [...(body?.children || [])]
          .filter((child) => child.classList?.contains('block'))
          .map(serializeBlockData);
        if (children.length) result.children = children;
      }

      return result;
    }

    function normalizeLoadedBlocks() {
      const existingTopBlocks = [...root.children].filter((child) => child.classList?.contains('block'));

      if (existingTopBlocks.length === root.children.length && existingTopBlocks.length > 0) {
        root.querySelectorAll('.block').forEach((block) => {
          block.dataset.type = normalizeType(block.dataset.type);
          block.dataset.indent = String(clampIndent(block.dataset.indent));
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

    function load(value = '') {
      suppressChange = true;
      try {
        root.replaceChildren();

        if (Array.isArray(value)) {
          value.forEach((blockData) => root.append(deserializeBlockData(blockData)));
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
      if (handleSelectAll(event)) return;
      if (handleDeleteWholeNote(event)) return;
      if (event.key === 'Enter' && handleEnter(event)) return;
      if (event.key === 'Tab' && handleTab(event)) return;
      if (event.key === 'Backspace' && handleBackspace(event)) return;
    }, { capture: true, signal });

    root.addEventListener('input', (event) => {
      const block = getBlockFromNode(event.target);
      const content = event.target.closest?.('[data-block-content]');
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
        const block = handle.closest('.block');
        block.draggable = true;
        block.setAttribute('aria-grabbed', 'true');
        armedDragBlock = block;
      }
    }, { capture: true, signal });

    root.addEventListener('dragstart', (event) => {
      const block = event.target.closest?.('.block');
      if (!armedDragBlock || block !== armedDragBlock) {
        event.preventDefault();
        return;
      }

      draggedBlock = block;
      draggedBlock.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggedBlock.dataset.blockId);
    }, { capture: true, signal });

    root.addEventListener('dragover', (event) => {
      if (!draggedBlock) return;
      const target = event.target.closest?.('.block');
      if (!target || target === draggedBlock || target.contains(draggedBlock) || draggedBlock.contains(target)) return;

      event.preventDefault();
      clearDragIndicators();

      const rect = target.getBoundingClientRect();
      const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      target.classList.add(position === 'before' ? 'drag-target-before' : 'drag-target-after');
      dragTargetBlock = target;
      dragTargetPosition = position;
    }, { signal });

    root.addEventListener('drop', (event) => {
      if (!draggedBlock || !dragTargetBlock) return;
      event.preventDefault();

      if (dragTargetPosition === 'before') {
        dragTargetBlock.insertAdjacentElement('beforebegin', draggedBlock);
      } else {
        dragTargetBlock.insertAdjacentElement('afterend', draggedBlock);
      }

      clearDragIndicators();
      refreshNumberedMarkers();
      emitChange();
    }, { signal });

    const disarmDrag = () => {
      clearDragIndicators();
      if (armedDragBlock) {
        armedDragBlock.draggable = false;
        armedDragBlock.removeAttribute('aria-grabbed');
      }
      if (draggedBlock) draggedBlock.classList.remove('dragging');
      armedDragBlock = null;
      draggedBlock = null;
    };

    root.addEventListener('dragend', disarmDrag, { signal });
    root.addEventListener('pointerup', () => {
      if (!draggedBlock) disarmDrag();
    }, { signal });
    root.addEventListener('pointercancel', disarmDrag, { signal });

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
