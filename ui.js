(() => {
  'use strict';

  const TYPE_ITEMS = [
    {
      section: 'Text',
      command: 'transform:paragraph',
      icon: 'T',
      title: 'Text',
      description: 'Plain text block',
      keywords: 'paragraph normal text'
    },
    {
      section: 'Text',
      command: 'transform:heading-1',
      icon: 'H1',
      title: 'Heading 1',
      description: 'Large section heading',
      keywords: 'title header heading one'
    },
    {
      section: 'Text',
      command: 'transform:heading-2',
      icon: 'H2',
      title: 'Heading 2',
      description: 'Medium section heading',
      keywords: 'header heading two'
    },
    {
      section: 'Text',
      command: 'transform:heading-3',
      icon: 'H3',
      title: 'Heading 3',
      description: 'Small section heading',
      keywords: 'header heading three'
    },
    {
      section: 'Lists',
      command: 'transform:bulleted-list',
      icon: '•',
      title: 'Bulleted list',
      description: 'Create a simple list',
      keywords: 'bullet unordered list'
    },
    {
      section: 'Lists',
      command: 'transform:numbered-list',
      icon: '1.',
      title: 'Numbered list',
      description: 'Create an ordered list',
      keywords: 'number ordered list'
    },
    {
      section: 'Lists',
      command: 'transform:checklist',
      icon: '☑',
      title: 'To-do',
      description: 'Track a task',
      keywords: 'todo task checkbox checklist'
    },
    {
      section: 'Blocks',
      command: 'transform:toggle',
      icon: '▶',
      title: 'Toggle',
      description: 'Hide content below a title',
      keywords: 'dropdown disclosure collapsible'
    },
    {
      section: 'Blocks',
      command: 'transform:quote',
      icon: '❝',
      title: 'Quote',
      description: 'Emphasize a passage',
      keywords: 'blockquote callout quotation'
    },
    {
      section: 'Blocks',
      command: 'transform:code',
      icon: '</>',
      title: 'Code',
      description: 'Write preformatted code',
      keywords: 'code preformatted monospace'
    },
    {
      section: 'Blocks',
      command: 'transform:divider',
      icon: '—',
      title: 'Divider',
      description: 'Add a horizontal separator',
      keywords: 'line separator rule'
    }
  ];

  const INSERT_ITEMS = TYPE_ITEMS.map((item) => ({
    ...item,
    command: item.command.replace('transform:', 'insert:')
  }));

  const CONTEXT_ITEMS = [
    {
      section: 'Block',
      command: 'open-transform',
      icon: '↻',
      title: 'Turn into',
      description: 'Change the block type',
      keywords: 'convert transform type',
      chevron: true
    },
    {
      section: 'Block',
      command: 'duplicate',
      icon: '⧉',
      title: 'Duplicate',
      description: 'Create a copy below',
      keywords: 'copy clone'
    },
    {
      section: 'Move',
      command: 'move-up',
      icon: '↑',
      title: 'Move up',
      description: 'Move before the previous block',
      keywords: 'reorder up'
    },
    {
      section: 'Move',
      command: 'move-down',
      icon: '↓',
      title: 'Move down',
      description: 'Move after the next block',
      keywords: 'reorder down'
    },
    {
      section: 'Danger',
      command: 'delete',
      icon: '⌫',
      title: 'Delete',
      description: 'Remove this block',
      keywords: 'remove trash'
    }
  ];

  const TOGGLE_TITLE_ITEMS = [
    {
      section: 'Toggle title',
      command: 'toggle-title:paragraph',
      icon: 'T',
      title: 'Text title',
      description: 'Use regular text',
      keywords: 'toggle title normal paragraph'
    },
    {
      section: 'Toggle title',
      command: 'toggle-title:heading-1',
      icon: 'H1',
      title: 'Heading 1 title',
      description: 'Use the largest heading',
      keywords: 'toggle title heading one'
    },
    {
      section: 'Toggle title',
      command: 'toggle-title:heading-2',
      icon: 'H2',
      title: 'Heading 2 title',
      description: 'Use a medium heading',
      keywords: 'toggle title heading two'
    },
    {
      section: 'Toggle title',
      command: 'toggle-title:heading-3',
      icon: 'H3',
      title: 'Heading 3 title',
      description: 'Use a small heading',
      keywords: 'toggle title heading three'
    }
  ];

  function createUI(options) {
    const {
      menu,
      inlineToolbar,
      toast,
      iconButton,
      iconPicker,
      editorRoot,
      executeEditorCommand
    } = options || {};

    if (!(menu instanceof HTMLElement)) {
      throw new Error('NoteUI requires a menu element.');
    }

    const abortController = new AbortController();
    const { signal } = abortController;

    let menuState = null;
    let selectedIndex = 0;
    let toastTimer = null;
    let savedInlineRange = null;

    function getItems(mode, block) {
      if (mode === 'context') return CONTEXT_ITEMS;
      if (mode === 'transform') {
        return block?.dataset.type === 'toggle'
          ? [...TOGGLE_TITLE_ITEMS, ...TYPE_ITEMS]
          : TYPE_ITEMS;
      }
      if (mode === 'slash') return TYPE_ITEMS;
      if (mode === 'insert') return INSERT_ITEMS;
      return TYPE_ITEMS;
    }

    function filterItems(items, query) {
      const normalizedQuery = query.trim().toLowerCase();
      if (!normalizedQuery) return items;

      return items.filter((item) => {
        const haystack = [
          item.title,
          item.description,
          item.keywords,
          item.section
        ].join(' ').toLowerCase();
        return haystack.includes(normalizedQuery);
      });
    }

    function renderMenu() {
      if (!menuState) return;

      const allItems = getItems(menuState.mode, menuState.block);
      const items = filterItems(allItems, menuState.query || '');
      menuState.items = items;
      selectedIndex = Math.max(0, Math.min(selectedIndex, items.length - 1));

      menu.replaceChildren();

      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'menu-label';
        empty.textContent = 'No matching blocks';
        menu.append(empty);
        return;
      }

      const sections = [];
      items.forEach((item) => {
        let section = sections.find((entry) => entry.name === item.section);
        if (!section) {
          section = { name: item.section, items: [] };
          sections.push(section);
        }
        section.items.push(item);
      });

      let itemIndex = 0;
      sections.forEach((sectionData) => {
        const section = document.createElement('div');
        section.className = 'menu-section';

        const label = document.createElement('div');
        label.className = 'menu-label';
        label.textContent = sectionData.name;
        section.append(label);

        sectionData.items.forEach((item) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'menu-item';
          button.dataset.command = item.command;
          button.dataset.menuIndex = String(itemIndex);
          button.setAttribute('role', 'menuitem');

          if (itemIndex === selectedIndex) button.classList.add('is-selected');

          const icon = document.createElement('span');
          icon.className = 'menu-icon';
          icon.textContent = item.icon;

          const copy = document.createElement('span');
          copy.className = 'menu-copy';

          const title = document.createElement('span');
          title.className = 'menu-title';
          title.textContent = item.title;

          const description = document.createElement('span');
          description.className = 'menu-description';
          description.textContent = item.description;

          copy.append(title, description);
          button.append(icon, copy);

          if (item.chevron) {
            const chevron = document.createElement('span');
            chevron.className = 'menu-chevron';
            chevron.textContent = '›';
            button.append(chevron);
          }

          section.append(button);
          itemIndex += 1;
        });

        menu.append(section);
      });

      requestAnimationFrame(() => {
        menu.querySelector('.menu-item.is-selected')?.scrollIntoView({ block: 'nearest' });
      });
    }

    function positionMenu() {
      if (!menuState || menu.hidden) return;

      const padding = 10;
      const rect = menu.getBoundingClientRect();
      const maxLeft = Math.max(padding, window.innerWidth - rect.width - padding);
      const maxTop = Math.max(padding, window.innerHeight - rect.height - padding);

      menu.style.left = `${Math.max(padding, Math.min(menuState.x, maxLeft))}px`;
      menu.style.top = `${Math.max(padding, Math.min(menuState.y, maxTop))}px`;
    }

    function openMenu(request) {
      hideInlineToolbar();

      const isSameSlashMenu = menuState
        && menuState.mode === 'slash'
        && request.mode === 'slash'
        && menuState.block === request.block;

      menuState = {
        mode: request.mode || 'slash',
        block: request.block || null,
        query: request.query || '',
        x: Number.isFinite(request.x) ? request.x : 12,
        y: Number.isFinite(request.y) ? request.y : 12,
        items: []
      };

      if (!isSameSlashMenu) selectedIndex = 0;
      menu.hidden = false;
      renderMenu();
      positionMenu();

      const handle = request.block?.querySelector(':scope > .block-handle');
      if (handle) handle.setAttribute('aria-expanded', 'true');
    }

    function closeMenu() {
      if (menuState?.block) {
        const handle = menuState.block.querySelector(':scope > .block-handle');
        handle?.removeAttribute('aria-expanded');
      }
      menuState = null;
      selectedIndex = 0;
      menu.hidden = true;
      menu.replaceChildren();
    }

    function activateCommand(command) {
      if (!menuState || !command) return;

      if (command === 'open-transform') {
        menuState = {
          ...menuState,
          mode: 'transform',
          query: ''
        };
        selectedIndex = 0;
        renderMenu();
        positionMenu();
        return;
      }

      executeEditorCommand(command, menuState.block);
      closeMenu();
    }

    function moveSelection(delta) {
      if (!menuState?.items?.length) return;
      selectedIndex = (selectedIndex + delta + menuState.items.length) % menuState.items.length;
      renderMenu();
    }

    function showToast(message, duration = 1700) {
      if (!(toast instanceof HTMLElement)) return;
      window.clearTimeout(toastTimer);
      toast.textContent = message;
      toast.hidden = false;
      toastTimer = window.setTimeout(() => {
        toast.hidden = true;
      }, duration);
    }

    function hideInlineToolbar() {
      if (!(inlineToolbar instanceof HTMLElement)) return;
      inlineToolbar.hidden = true;
      savedInlineRange = null;
    }

    function updateInlineToolbar(selection) {
      if (!(inlineToolbar instanceof HTMLElement)) return;

      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        hideInlineToolbar();
        return;
      }

      const range = selection.getRangeAt(0);
      if (!editorRoot.contains(range.commonAncestorContainer)) {
        hideInlineToolbar();
        return;
      }

      savedInlineRange = range.cloneRange();
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) {
        hideInlineToolbar();
        return;
      }

      inlineToolbar.hidden = false;
      const toolbarRect = inlineToolbar.getBoundingClientRect();
      const left = Math.max(
        8,
        Math.min(
          rect.left + rect.width / 2 - toolbarRect.width / 2,
          window.innerWidth - toolbarRect.width - 8
        )
      );
      const top = Math.max(8, rect.top - toolbarRect.height - 7);

      inlineToolbar.style.left = `${left}px`;
      inlineToolbar.style.top = `${top}px`;
    }

    function restoreInlineSelection() {
      if (!savedInlineRange) return false;
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedInlineRange);
      return true;
    }

    function applyInlineCommand(command) {
      if (!restoreInlineSelection()) return;

      if (command === 'createLink') {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim() || '';
        const suggested = /^https?:\/\//i.test(selectedText) ? selectedText : 'https://';
        const url = window.prompt('Link URL', suggested);
        if (!url) return;
        document.execCommand('createLink', false, url);

        editorRoot.querySelectorAll('a').forEach((anchor) => {
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
        });
      } else if (command === 'highlight') {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
        const range = selection.getRangeAt(0);
        const mark = document.createElement('mark');
        mark.append(range.extractContents());
        range.insertNode(mark);
        range.selectNodeContents(mark);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        document.execCommand(command, false);
      }

      editorRoot.dispatchEvent(new Event('input', { bubbles: true }));
      hideInlineToolbar();
    }

    function initializeIconPicker(icons, onSelect) {
      if (!(iconPicker instanceof HTMLElement) || !(iconButton instanceof HTMLElement)) return;

      iconPicker.replaceChildren();
      icons.forEach((icon) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = icon;
        button.setAttribute('aria-label', `Use ${icon} icon`);
        button.addEventListener('click', () => {
          onSelect(icon);
          closeIconPicker();
        }, { signal });
        iconPicker.append(button);
      });
    }

    function openIconPicker() {
      if (!(iconPicker instanceof HTMLElement) || !(iconButton instanceof HTMLElement)) return;
      iconPicker.hidden = false;
      iconButton.setAttribute('aria-expanded', 'true');
    }

    function closeIconPicker() {
      if (!(iconPicker instanceof HTMLElement) || !(iconButton instanceof HTMLElement)) return;
      iconPicker.hidden = true;
      iconButton.removeAttribute('aria-expanded');
    }

    menu.addEventListener('pointerdown', (event) => {
      event.preventDefault();
    }, { signal });

    menu.addEventListener('click', (event) => {
      const item = event.target.closest('.menu-item');
      if (!item) return;
      activateCommand(item.dataset.command);
    }, { signal });

    menu.addEventListener('mousemove', (event) => {
      const item = event.target.closest('.menu-item');
      if (!item) return;
      const index = Number.parseInt(item.dataset.menuIndex, 10);
      if (!Number.isFinite(index) || index === selectedIndex) return;
      selectedIndex = index;
      menu.querySelectorAll('.menu-item').forEach((button) => {
        button.classList.toggle('is-selected', Number(button.dataset.menuIndex) === selectedIndex);
      });
    }, { signal });

    menu.addEventListener('wheel', (event) => {
      event.stopPropagation();
    }, { passive: true, signal });

    document.addEventListener('keydown', (event) => {
      if (!menuState || menu.hidden) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopImmediatePropagation();
        moveSelection(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopImmediatePropagation();
        moveSelection(-1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const command = menuState.items[selectedIndex]?.command;
        activateCommand(command);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeMenu();
      }
    }, { capture: true, signal });

    document.addEventListener('pointerdown', (event) => {
      if (!menu.hidden && !menu.contains(event.target) && !event.target.closest('[data-drag-handle]')) {
        closeMenu();
      }

      if (
        iconPicker instanceof HTMLElement
        && !iconPicker.hidden
        && !iconPicker.contains(event.target)
        && event.target !== iconButton
      ) {
        closeIconPicker();
      }
    }, { signal });

    window.addEventListener('resize', positionMenu, { signal });
    window.addEventListener('scroll', positionMenu, { passive: true, signal });

    if (inlineToolbar instanceof HTMLElement) {
      inlineToolbar.addEventListener('pointerdown', (event) => {
        event.preventDefault();
      }, { signal });

      inlineToolbar.addEventListener('click', (event) => {
        const button = event.target.closest('[data-inline-command]');
        if (!button) return;
        applyInlineCommand(button.dataset.inlineCommand);
      }, { signal });
    }

    if (iconButton instanceof HTMLElement) {
      iconButton.addEventListener('click', (event) => {
        event.stopPropagation();
        if (iconPicker.hidden) openIconPicker();
        else closeIconPicker();
      }, { signal });
    }

    return Object.freeze({
      openMenu,
      closeMenu,
      showToast,
      updateInlineToolbar,
      hideInlineToolbar,
      initializeIconPicker,
      openIconPicker,
      closeIconPicker,
      destroy() {
        abortController.abort();
        window.clearTimeout(toastTimer);
      }
    });
  }

  window.NoteUI = Object.freeze({
    create: createUI
  });
})();
