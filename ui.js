(() => {
  'use strict';

  // ---------------------------------------------------------------- Localization
  // English strings are the keys. Missing translations fall back to the key itself.
  const IT = {
    'Text': 'Testo', 'Lists': 'Elenchi', 'Blocks': 'Blocchi', 'Block': 'Blocco', 'Move': 'Sposta',
    'Danger': 'Elimina', 'Toggle title': 'Titolo del toggle',
    'Plain text block': 'Blocco di testo semplice',
    'Heading 1': 'Titolo 1', 'Large section heading': 'Titolo di sezione grande',
    'Heading 2': 'Titolo 2', 'Medium section heading': 'Titolo di sezione medio',
    'Heading 3': 'Titolo 3', 'Small section heading': 'Titolo di sezione piccolo',
    'Bulleted list': 'Elenco puntato', 'Create a simple list': 'Crea un elenco semplice',
    'Numbered list': 'Elenco numerato', 'Create an ordered list': 'Crea un elenco ordinato',
    'To-do': 'Da fare', 'Track a task': 'Segna un\'attività',
    'Toggle': 'Toggle', 'Hide content below a title': 'Nascondi contenuto sotto un titolo',
    'Toggle heading 1': 'Toggle titolo 1', 'Toggle heading 2': 'Toggle titolo 2', 'Toggle heading 3': 'Toggle titolo 3',
    'Collapsible large heading': 'Titolo grande comprimibile', 'Collapsible medium heading': 'Titolo medio comprimibile',
    'Collapsible small heading': 'Titolo piccolo comprimibile',
    'Quote': 'Citazione', 'Emphasize a passage': 'Evidenzia un passaggio',
    'Table': 'Tabella', 'Organize data in rows and columns': 'Organizza i dati in righe e colonne', 'Table cell': 'Cella',
    '+ Row': '+ Riga', '+ Column': '+ Colonna', '− Row': '− Riga', '− Column': '− Colonna',
    'Header row': 'Intestazione', 'Delete table': 'Elimina tabella',
    'Callout': 'Callout', 'Highlight a tip or note': 'Evidenzia un consiglio o una nota',
    'Code': 'Codice', 'Write preformatted code': 'Scrivi codice preformattato',
    'Calculator': 'Calcolatrice', 'Calculate multiline expressions': 'Calcola espressioni su più righe',
    'Divider': 'Divisore', 'Add a horizontal separator': 'Aggiungi una linea di separazione',
    'Turn into': 'Trasforma in', 'Change the block type': 'Cambia il tipo di blocco',
    'Indent': 'Rientra', 'Nest under the previous block': 'Annida sotto il blocco precedente',
    'Outdent': 'Esci dal rientro', 'Move out of the parent block': 'Porta fuori dal blocco padre',
    'Duplicate': 'Duplica', 'Create a copy below': 'Crea una copia sotto',
    'Move up': 'Sposta su', 'Move before the previous block': 'Sposta prima del blocco precedente',
    'Move down': 'Sposta giù', 'Move after the next block': 'Sposta dopo il blocco successivo',
    'Delete': 'Elimina', 'Remove this block': 'Rimuovi questo blocco',
    'Text title': 'Titolo testo', 'Use regular text': 'Usa testo normale',
    'Heading 1 title': 'Titolo 1', 'Use the largest heading': 'Usa il titolo più grande',
    'Heading 2 title': 'Titolo 2', 'Use a medium heading': 'Usa un titolo medio',
    'Heading 3 title': 'Titolo 3', 'Use a small heading': 'Usa un titolo piccolo',
    'No matching blocks': 'Nessun blocco trovato',
    'Link URL': 'URL del link', 'Use an http, https, mailto or tel link': 'Usa un link http, https, mailto o tel',
    'Open': 'Apri', 'Edit': 'Modifica', 'Remove': 'Rimuovi',
    'Bold': 'Grassetto', 'Italic': 'Corsivo', 'Underline': 'Sottolineato', 'Strikethrough': 'Barrato',
    'Highlight': 'Evidenzia', 'Add link': 'Aggiungi link', 'Clear formatting': 'Rimuovi formattazione',
    'Add block': 'Aggiungi blocco', 'Undo': 'Annulla', 'Redo': 'Ripeti', 'Block actions': 'Azioni del blocco',
    'Text formatting': 'Formattazione del testo', 'Editing tools': 'Strumenti di modifica',
    'Copy link': 'Copia link', 'Share': 'Condividi', 'New note': 'Nuova nota', 'More': 'Altro',
    'Copy as Markdown': 'Copia come Markdown', 'Theme': 'Tema', 'Auto': 'Auto', 'Light': 'Chiaro', 'Dark': 'Scuro', 'Number format': 'Formato numeri',
    'Link copied': 'Link copiato', 'Unable to copy the link': 'Impossibile copiare il link',
    'Sharing is unavailable; link copied': 'Condivisione non disponibile: link copiato',
    'Unable to share this note': 'Impossibile condividere la nota',
    'This note is too large to save in the URL.': 'La nota è troppo grande per essere salvata nell\'URL.',
    'Markdown copied': 'Markdown copiato', 'Unable to copy': 'Impossibile copiare',
    'Untitled': 'Senza titolo', 'Note title': 'Titolo della nota', 'Change note icon': 'Cambia icona della nota',
    'Type \'/\' for commands': 'Scrivi \'/\' per i comandi', 'Type a calculation…': 'Scrivi un calcolo…',
    'Empty toggle. Click to add content.': 'Toggle vuoto. Clicca per aggiungere contenuto.',
    'Your note exists only in this URL': 'La nota esiste solo in questo URL',
    'Error': 'Errore', 'Result': 'Risultato', 'No result': 'Nessun risultato',
    'Division by zero': 'Divisione per zero', 'Incomplete expression': 'Espressione incompleta',
    'Invalid number': 'Numero non valido', 'Number is too large': 'Numero troppo grande',
    'Result is too large': 'Risultato troppo grande', 'Missing closing parenthesis': 'Parentesi di chiusura mancante',
    'Missing opening parenthesis': 'Parentesi di apertura mancante', 'Unexpected operator': 'Operatore inatteso',
    'Unexpected closing parenthesis': 'Parentesi chiusa inattesa', 'Invalid variable name': 'Nome variabile non valido',
    'Invalid expression': 'Espressione non valida', 'Some rows contain errors': 'Alcune righe contengono errori',
    'Square root of a negative number': 'Radice quadrata di un numero negativo',
    'Note': 'Nota', 'Selection': 'Selezione',
    'Characters without spaces': 'Caratteri senza spazi', 'Link length': 'Lunghezza del link',
    'Long links may be cut off by some apps': 'I link molto lunghi possono essere troncati da alcune app'
  };

  function detectLanguage() {
    try {
      const forced = new URLSearchParams(window.location.search).get('lang');
      if (forced === 'it' || forced === 'en') return forced;
    } catch { /* No location available in non-browser runtimes. */ }
    const preferred = typeof navigator !== 'undefined' ? String(navigator.language || '') : '';
    return /^it\b/i.test(preferred) ? 'it' : 'en';
  }

  let language = detectLanguage();

  function t(text) {
    if (language !== 'it') return text;
    if (Object.prototype.hasOwnProperty.call(IT, text)) return IT[text];
    const variable = text.match(/^Unknown variable “(.*)”$/);
    return variable ? `Variabile sconosciuta “${variable[1]}”` : text;
  }

  function plural(count, one, other) {
    return `${count} ${count === 1 ? one : other}`;
  }

  function formatStats(stats) {
    if (!stats) return '';
    return language === 'it'
      ? `${plural(stats.words, 'parola', 'parole')} · ${plural(stats.characters, 'carattere', 'caratteri')}`
      : `${plural(stats.words, 'word', 'words')} · ${plural(stats.characters, 'character', 'characters')}`;
  }

  function applyTranslations(scope = document) {
    document.documentElement.lang = language;
    scope.querySelectorAll('[data-i18n]').forEach((element) => { element.textContent = t(element.dataset.i18n); });
    scope.querySelectorAll('[data-i18n-aria]').forEach((element) => { element.setAttribute('aria-label', t(element.dataset.i18nAria)); });
    scope.querySelectorAll('[data-i18n-title]').forEach((element) => { element.title = t(element.dataset.i18nTitle); });
  }

  // ---------------------------------------------------------------- Command catalogue
  const TYPE_ITEMS = [
    { section: 'Text', command: 'transform:paragraph', icon: 'T', title: 'Text', description: 'Plain text block', keywords: 'paragraph normal text' },
    { section: 'Text', command: 'transform:heading-1', icon: 'H1', title: 'Heading 1', description: 'Large section heading', keywords: 'title header heading one' },
    { section: 'Text', command: 'transform:heading-2', icon: 'H2', title: 'Heading 2', description: 'Medium section heading', keywords: 'header heading two' },
    { section: 'Text', command: 'transform:heading-3', icon: 'H3', title: 'Heading 3', description: 'Small section heading', keywords: 'header heading three' },
    { section: 'Lists', command: 'transform:bulleted-list', icon: '•', title: 'Bulleted list', description: 'Create a simple list', keywords: 'bullet unordered list' },
    { section: 'Lists', command: 'transform:numbered-list', icon: '1.', title: 'Numbered list', description: 'Create an ordered list', keywords: 'number ordered list' },
    { section: 'Lists', command: 'transform:checklist', icon: '☑', title: 'To-do', description: 'Track a task', keywords: 'todo task checkbox checklist' },
    { section: 'Blocks', command: 'transform:toggle', icon: '▶', title: 'Toggle', description: 'Hide content below a title', keywords: 'dropdown disclosure collapsible' },
    { section: 'Blocks', command: 'transform:toggle-heading-1', icon: '▶1', title: 'Toggle heading 1', description: 'Collapsible large heading', keywords: 'toggle collapsible heading one' },
    { section: 'Blocks', command: 'transform:toggle-heading-2', icon: '▶2', title: 'Toggle heading 2', description: 'Collapsible medium heading', keywords: 'toggle collapsible heading two' },
    { section: 'Blocks', command: 'transform:toggle-heading-3', icon: '▶3', title: 'Toggle heading 3', description: 'Collapsible small heading', keywords: 'toggle collapsible heading three' },
    { section: 'Blocks', command: 'transform:quote', icon: '❝', title: 'Quote', description: 'Emphasize a passage', keywords: 'blockquote quotation' },
    { section: 'Blocks', command: 'transform:callout', icon: '💡', title: 'Callout', description: 'Highlight a tip or note', keywords: 'callout note info tip box' },
    { section: 'Blocks', command: 'transform:table', icon: '▦', title: 'Table', description: 'Organize data in rows and columns', keywords: 'table grid rows columns spreadsheet' },
    { section: 'Blocks', command: 'transform:code', icon: '</>', title: 'Code', description: 'Write preformatted code', keywords: 'code preformatted monospace' },
    { section: 'Blocks', command: 'transform:calculator', icon: 'fx', title: 'Calculator', description: 'Calculate multiline expressions', keywords: 'calculator calc number math arithmetic' },
    { section: 'Blocks', command: 'transform:divider', icon: '—', title: 'Divider', description: 'Add a horizontal separator', keywords: 'line separator rule' }
  ].map((item) => {
    const id = item.command.replace('transform:', '');
    const aliases = {
      paragraph: ['text', 'paragraph', 'testo', 'paragrafo'],
      'heading-1': ['h1', 'head 1', 'heading 1', 'titolo', 'titolo 1'],
      'heading-2': ['h2', 'head 2', 'heading 2', 'titolo 2'],
      'heading-3': ['h3', 'head 3', 'heading 3', 'titolo 3'],
      'bulleted-list': ['bullet', 'bulleted', 'elenco', 'elenco puntato', 'lista'],
      'numbered-list': ['number', 'num', 'numbered', 'elenco numerato', 'numerato'],
      checklist: ['todo', 'check', 'checklist', 'da fare', 'attivita'],
      toggle: ['tog', 'toggle', 'apri', 'comprimi'],
      'toggle-heading-1': ['th1', 'toggle h1', 'toggle heading 1'],
      'toggle-heading-2': ['th2', 'toggle h2', 'toggle heading 2'],
      'toggle-heading-3': ['th3', 'toggle h3', 'toggle heading 3'],
      quote: ['quo', 'quote', 'citazione'],
      callout: ['callout', 'box', 'nota', 'avviso'],
      table: ['table', 'grid', 'tabella', 'griglia'],
      code: ['code', 'codice'],
      calculator: ['calc', 'calculator', 'calcolatrice', 'calcola'],
      divider: ['divider', 'line', 'divisore', 'linea', 'separatore']
    }[id] || [];
    return Object.freeze({ ...item, id, label: item.title, aliases, keywordTokens: item.keywords.split(/\s+/) });
  });

  const INSERT_ITEMS = TYPE_ITEMS.map((item) => ({
    ...item,
    command: item.command.replace('transform:', 'insert:')
  }));

  const CONTEXT_ITEMS = [
    { section: 'Block', command: 'open-transform', icon: '↻', title: 'Turn into', description: 'Change the block type', keywords: 'convert transform type', chevron: true },
    { section: 'Block', command: 'indent', icon: '⇥', title: 'Indent', description: 'Nest under the previous block', keywords: 'indent nest' },
    { section: 'Block', command: 'outdent', icon: '⇤', title: 'Outdent', description: 'Move out of the parent block', keywords: 'outdent unnest' },
    { section: 'Block', command: 'duplicate', icon: '⧉', title: 'Duplicate', description: 'Create a copy below', keywords: 'copy clone' },
    { section: 'Move', command: 'move-up', icon: '↑', title: 'Move up', description: 'Move before the previous block', keywords: 'reorder up' },
    { section: 'Move', command: 'move-down', icon: '↓', title: 'Move down', description: 'Move after the next block', keywords: 'reorder down' },
    { section: 'Danger', command: 'delete', icon: '⌫', title: 'Delete', description: 'Remove this block', keywords: 'remove trash' }
  ];

  const TOGGLE_TITLE_ITEMS = [
    { section: 'Toggle title', command: 'toggle-title:paragraph', icon: 'T', title: 'Text title', description: 'Use regular text', keywords: 'toggle title normal paragraph' },
    { section: 'Toggle title', command: 'toggle-title:heading-1', icon: 'H1', title: 'Heading 1 title', description: 'Use the largest heading', keywords: 'toggle title heading one' },
    { section: 'Toggle title', command: 'toggle-title:heading-2', icon: 'H2', title: 'Heading 2 title', description: 'Use a medium heading', keywords: 'toggle title heading two' },
    { section: 'Toggle title', command: 'toggle-title:heading-3', icon: 'H3', title: 'Heading 3 title', description: 'Use a small heading', keywords: 'toggle title heading three' }
  ];

  function filterCommandItems(items, query) {
    const normalizedQuery = query.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    if (!normalizedQuery) return items;
    return items.map((item) => {
      const labels = [item.label || item.title, ...(item.aliases || [])].map((value) => value.toLocaleLowerCase());
      const keywords = item.keywordTokens || String(item.keywords || '').toLocaleLowerCase().split(/\s+/);
      let rank = Infinity;
      if (labels.includes(normalizedQuery)) rank = 0;
      else if (labels.some((value) => value.startsWith(normalizedQuery))) rank = 1;
      else if (keywords.some((value) => value.startsWith(normalizedQuery))) rank = 2;
      else if (labels.some((value) => value.includes(normalizedQuery))) rank = 3;
      return { item, rank };
    }).filter(({ rank }) => Number.isFinite(rank))
      .sort((left, right) => left.rank - right.rank || left.item.label.localeCompare(right.item.label))
      .map(({ item }) => item);
  }

  // ---------------------------------------------------------------- UI controller
  function createUI(options) {
    const {
      menu,
      inlineToolbar,
      toast,
      iconButton,
      iconPicker,
      editorRoot,
      linkChip,
      mobileBar,
      executeEditorCommand,
      applyInlineCommand = () => false,
      runMobileCommand = () => {}
    } = options || {};

    if (!(menu instanceof HTMLElement)) {
      throw new Error('NoteUI requires a menu element.');
    }

    const abortController = new AbortController();
    const { signal } = abortController;
    const compactLayout = window.matchMedia ? window.matchMedia('(pointer: coarse), (max-width: 700px)') : { matches: false };

    let menuState = null;
    let selectedIndex = 0;
    let toastTimer = null;
    let savedInlineRange = null;
    let linkChipAnchor = null;

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
      return filterCommandItems(items, query);
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
        empty.textContent = t('No matching blocks');
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
        label.textContent = t(sectionData.name);
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
          title.textContent = t(item.title);

          const description = document.createElement('span');
          description.className = 'menu-description';
          description.textContent = t(item.description);

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

    function visibleViewport() {
      const viewport = window.visualViewport;
      return viewport
        ? { top: viewport.offsetTop, left: viewport.offsetLeft, width: viewport.width, height: viewport.height }
        : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
    }

    function positionMenu() {
      if (!menuState || menu.hidden) return;

      const padding = 10;
      const view = visibleViewport();
      const rect = menu.getBoundingClientRect();
      const maxLeft = Math.max(view.left + padding, view.left + view.width - rect.width - padding);
      const bottomLimit = view.top + view.height - padding;
      let top = menuState.y;
      // Prefer the space below the anchor; flip above it when the keyboard or screen edge is in the way.
      if (top + rect.height > bottomLimit && Number.isFinite(menuState.yAbove) && menuState.yAbove - rect.height >= view.top + padding) {
        top = menuState.yAbove - rect.height;
      }
      const maxTop = Math.max(view.top + padding, bottomLimit - rect.height);

      menu.style.left = `${Math.max(view.left + padding, Math.min(menuState.x, maxLeft))}px`;
      menu.style.top = `${Math.max(view.top + padding, Math.min(top, maxTop))}px`;
    }

    function openMenu(request) {
      hideInlineToolbar();
      hideLinkChip();

      const previousQuery = menuState?.query || '';
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
        yAbove: Number.isFinite(request.yAbove) ? request.yAbove : NaN,
        items: []
      };

      if (!isSameSlashMenu || previousQuery !== menuState.query) selectedIndex = 0;
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
      selectedIndex = Math.max(0, Math.min(selectedIndex + delta, menuState.items.length - 1));
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

    // ------------------------------------------------------------ Inline toolbar
    function hideInlineToolbar() {
      if (!(inlineToolbar instanceof HTMLElement)) return;
      inlineToolbar.hidden = true;
      savedInlineRange = null;
    }

    function inlineState(range) {
      const anchor = range.commonAncestorContainer;
      const element = anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement;
      const state = {
        code: Boolean(element?.closest('code')),
        highlight: Boolean(element?.closest('mark')),
        link: Boolean(element?.closest('a'))
      };
      ['bold', 'italic', 'underline', 'strikeThrough'].forEach((command) => {
        try { state[command] = document.queryCommandState(command); } catch { state[command] = false; }
      });
      return state;
    }

    function updateInlineToolbar(selection) {
      hideLinkChip();
      if (!(inlineToolbar instanceof HTMLElement)) return;

      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        hideInlineToolbar();
        updateLinkChip(selection);
        return;
      }

      const range = selection.getRangeAt(0);
      if (!editorRoot.contains(range.commonAncestorContainer)) {
        hideInlineToolbar();
        return;
      }

      const host = (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement)?.closest('.block');
      // Formatting is limited to rich-text blocks: code and calculators are plain text.
      if (host && (host.dataset.type === 'code' || host.dataset.type === 'calculator')) {
        hideInlineToolbar();
        return;
      }

      savedInlineRange = range.cloneRange();
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) {
        hideInlineToolbar();
        return;
      }

      const state = inlineState(range);
      inlineToolbar.querySelectorAll('[data-inline-command]').forEach((button) => {
        const active = Boolean(state[button.dataset.inlineCommand]);
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });

      inlineToolbar.hidden = false;
      const toolbarRect = inlineToolbar.getBoundingClientRect();
      const view = visibleViewport();
      const left = Math.max(
        view.left + 8,
        Math.min(
          rect.left + rect.width / 2 - toolbarRect.width / 2,
          view.left + view.width - toolbarRect.width - 8
        )
      );
      // On touch devices the native selection menu sits above the text, so place ours below it.
      const above = rect.top - toolbarRect.height - 7;
      const top = compactLayout.matches || above < view.top + 8
        ? Math.min(rect.bottom + 10, view.top + view.height - toolbarRect.height - 8)
        : above;

      inlineToolbar.style.left = `${left}px`;
      inlineToolbar.style.top = `${Math.max(view.top + 8, top)}px`;
    }

    function restoreInlineSelection() {
      if (!savedInlineRange) return false;
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedInlineRange);
      return true;
    }

    function applyInline(command) {
      if (!restoreInlineSelection()) return;
      applyInlineCommand(command);
      hideInlineToolbar();
    }

    // ------------------------------------------------------------ Link popover
    function hideLinkChip() {
      if (!(linkChip instanceof HTMLElement)) return;
      linkChip.hidden = true;
      linkChipAnchor = null;
    }

    function updateLinkChip(selection) {
      if (!(linkChip instanceof HTMLElement) || !selection?.rangeCount || !selection.isCollapsed) return;
      const anchorNode = selection.anchorNode;
      const element = anchorNode?.nodeType === Node.ELEMENT_NODE ? anchorNode : anchorNode?.parentElement;
      const anchor = element?.closest?.('a[href]');
      if (!anchor || !editorRoot.contains(anchor)) return;
      const open = linkChip.querySelector('[data-link-open]');
      open.href = anchor.href;
      linkChipAnchor = anchor;
      linkChip.hidden = false;
      const rect = anchor.getBoundingClientRect();
      const chipRect = linkChip.getBoundingClientRect();
      const view = visibleViewport();
      linkChip.style.left = `${Math.max(view.left + 8, Math.min(rect.left, view.left + view.width - chipRect.width - 8))}px`;
      linkChip.style.top = `${Math.min(rect.bottom + 6, view.top + view.height - chipRect.height - 8)}px`;
    }

    if (linkChip instanceof HTMLElement) {
      linkChip.addEventListener('pointerdown', (event) => {
        if (!event.target.closest('[data-link-open]')) event.preventDefault();
      }, { signal });
      linkChip.addEventListener('click', (event) => {
        const action = event.target.closest('[data-link-action]')?.dataset.linkAction;
        if (!action || !linkChipAnchor) return;
        if (action === 'edit') applyInlineCommand('link');
        else if (action === 'remove') applyInlineCommand('unlink');
        hideLinkChip();
      }, { signal });
    }

    // ------------------------------------------------------------ Icon picker
    function initializeIconPicker(icons, onSelect) {
      if (!(iconPicker instanceof HTMLElement) || !(iconButton instanceof HTMLElement)) return;

      iconPicker.replaceChildren();
      icons.forEach((icon) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = icon;
        button.setAttribute('aria-label', icon ? `Use ${icon} icon` : 'Use empty icon');
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

    // ------------------------------------------------------------ Mobile editing bar
    // The bar floats above the on-screen keyboard (visual viewport) while the note is focused.
    function layoutMobileBar() {
      const root = document.documentElement;
      const view = visibleViewport();
      root.style.setProperty('--vv-height', `${view.height}px`);
      if (!(mobileBar instanceof HTMLElement) || mobileBar.hidden) {
        root.style.setProperty('--chrome-bottom', '0px');
        return;
      }
      const keyboard = Math.max(0, window.innerHeight - (view.height + view.top));
      mobileBar.style.bottom = `${keyboard}px`;
      root.style.setProperty('--chrome-bottom', `${keyboard + mobileBar.offsetHeight}px`);
    }

    function setMobileBarVisible(visible) {
      if (!(mobileBar instanceof HTMLElement)) return;
      mobileBar.hidden = !(visible && compactLayout.matches);
      layoutMobileBar();
    }

    if (mobileBar instanceof HTMLElement) {
      mobileBar.addEventListener('pointerdown', (event) => {
        event.preventDefault();
      }, { signal });
      mobileBar.addEventListener('click', (event) => {
        const command = event.target.closest('[data-mobile-command]')?.dataset.mobileCommand;
        if (command) runMobileCommand(command);
      }, { signal });
      editorRoot.addEventListener('focusin', () => setMobileBarVisible(true), { signal });
      editorRoot.addEventListener('focusout', () => {
        window.setTimeout(() => {
          const active = document.activeElement;
          if (!editorRoot.contains(active) && !mobileBar.contains(active)) setMobileBarVisible(false);
        }, 120);
      }, { signal });
    }

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => { layoutMobileBar(); positionMenu(); }, { signal });
      window.visualViewport.addEventListener('scroll', () => { layoutMobileBar(); positionMenu(); }, { signal });
    }
    layoutMobileBar();

    // ------------------------------------------------------------ Events
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

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeMenu();
        return;
      }

      // With no matching command the menu steps aside instead of swallowing typing keys.
      if (!menuState.items?.length) {
        closeMenu();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopImmediatePropagation();
        moveSelection(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopImmediatePropagation();
        moveSelection(-1);
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const command = menuState.items[selectedIndex]?.command;
        activateCommand(command);
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

    window.addEventListener('resize', () => { positionMenu(); layoutMobileBar(); }, { signal });
    window.addEventListener('scroll', positionMenu, { passive: true, signal });

    if (inlineToolbar instanceof HTMLElement) {
      inlineToolbar.addEventListener('pointerdown', (event) => {
        event.preventDefault();
      }, { signal });

      inlineToolbar.addEventListener('click', (event) => {
        const button = event.target.closest('[data-inline-command]');
        if (!button) return;
        applyInline(button.dataset.inlineCommand);
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

  const api = Object.freeze({
    create: createUI,
    filterCommandItems,
    TYPE_ITEMS,
    t,
    formatStats,
    applyTranslations,
    getLanguage: () => language,
    setLanguage(next) { language = next === 'it' ? 'it' : 'en'; }
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NoteUI = api;
})();
