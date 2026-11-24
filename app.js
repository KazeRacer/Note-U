(() => {
  'use strict';

  const titleInput = document.getElementById('note-title');
  const editorRoot = document.getElementById('editor');
  const iconButton = document.getElementById('icon-button');
  const iconPicker = document.getElementById('icon-picker');
  const favicon = document.getElementById('favicon');
  const blockMenu = document.getElementById('block-menu');
  const inlineToolbar = document.getElementById('inline-toolbar');
  const linkChip = document.getElementById('link-chip');
  const mobileBar = document.getElementById('mobile-bar');
  const toast = document.getElementById('toast');
  const copyLinkButton = document.getElementById('copy-link-button');
  const shareNoteButton = document.getElementById('share-note-button');
  const newNoteButton = document.getElementById('new-note-button');
  const moreButton = document.getElementById('more-button');
  const moreMenu = document.getElementById('more-menu');
  const copyMarkdownButton = document.getElementById('copy-markdown-button');
  const numberFormatSelect = document.getElementById('number-format');
  const themeSelect = document.getElementById('theme-select');
  const statsElement = document.getElementById('stats');

  const t = NoteUI.t;

  const ICONS = [
    '✏️', '📝', '💡', '📌', '⭐', '🔥',
    '🚀', '🎯', '📚', '💻', '🛠️', '🎨',
    '✅', '🧠', '📊', '💰', '🌐', '☕',
    '🔖', '🗂️', '🧭', '🔬', '📐', '🪴',
    '⬆️', '⬇️', '➡️', '⬅️', '•', ''
  ];

  // Links longer than this are likely to be truncated by some messengers and mail clients.
  const LONG_LINK_LENGTH = 8000;

  let editor = null;
  let ui = null;
  let currentIcon = NoteStorage.DEFAULT_NOTE.icon;
  let saveTimer = null;
  let statsTimer = null;
  let saveSequence = 0;
  let isLoading = false;
  let currentNumberFormat = 'international';
  let currentTheme = 'auto';

  function createFaviconUrl(icon) {
    if (!icon) {
      return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"/%3E';
    }

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <text x="50" y="0.9em" text-anchor="middle" font-size="90">${icon}</text>
      </svg>
    `.trim();

    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function setIcon(icon, options = {}) {
    const { save = true } = options;

    currentIcon = typeof icon === 'string'
      ? icon
      : NoteStorage.DEFAULT_NOTE.icon;

    iconButton.textContent = currentIcon;
    iconButton.classList.toggle('is-empty', !currentIcon);
    iconButton.setAttribute(
      'aria-label',
      currentIcon
        ? t('Change note icon')
        : `${t('Change note icon')} (–)`
    );

    favicon.href = createFaviconUrl(currentIcon);

    if (save) {
      scheduleSave();
    }
  }

  function updateDocumentTitle() {
    const title = titleInput.value.trim();
    document.title = title || t('Untitled');
  }

  // Manual theme override; "auto" removes the attribute so the system preference applies.
  function setTheme(theme) {
    currentTheme = theme === 'light' || theme === 'dark' ? theme : 'auto';
    const root = document.documentElement;
    if (currentTheme === 'auto') root.removeAttribute('data-theme');
    else root.dataset.theme = currentTheme;
    themeSelect.value = currentTheme;

    const colors = { light: '#ffffff', dark: '#191919' };
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      const own = meta.getAttribute('media')?.includes('dark') ? colors.dark : colors.light;
      meta.content = currentTheme === 'auto' ? own : colors[currentTheme];
    });
  }

  function readCurrentNote() {
    return {
      version: NoteStorage.CURRENT_VERSION,
      title: titleInput.value,
      icon: currentIcon,
      numberFormat: currentNumberFormat,
      theme: currentTheme,
      blocks: editor.serialize()
    };
  }

  // ---------------------------------------------------------------- Counter
  function updateStats() {
    window.clearTimeout(statsTimer);
    statsTimer = null;
    if (!editor || !statsElement) return;

    const body = editor.getStats();
    const title = NoteEditor.countText(titleInput.value);
    const total = {
      words: body.words + title.words,
      characters: body.characters + title.characters,
      charactersNoSpaces: body.charactersNoSpaces + title.charactersNoSpaces
    };
    const selection = editor.getSelectionStats();
    const shown = selection || total;
    const linkLength = window.location.href.length;

    statsElement.textContent = selection
      ? `${t('Selection')}: ${NoteUI.formatStats(selection)}`
      : NoteUI.formatStats(total);
    statsElement.classList.toggle('is-long-link', linkLength > LONG_LINK_LENGTH);
    statsElement.title = [
      `${t('Characters without spaces')}: ${shown.charactersNoSpaces}`,
      `${t('Link length')}: ${linkLength.toLocaleString()}`,
      linkLength > LONG_LINK_LENGTH ? t('Long links may be cut off by some apps') : ''
    ].filter(Boolean).join('\n');
  }

  function scheduleStats() {
    if (statsTimer) return;
    statsTimer = window.setTimeout(updateStats, 120);
  }

  // ---------------------------------------------------------------- Persistence
  async function saveNow() {
    window.clearTimeout(saveTimer);
    saveTimer = null;

    if (isLoading || !editor) {
      return;
    }

    const sequence = ++saveSequence;

    try {
      const encoded = await NoteStorage.encodeNoteAsync(readCurrentNote());
      // A newer edit started another save while this one was compressing.
      if (sequence !== saveSequence) return;
      NoteStorage.writeEncodedToUrl(encoded, { replace: true });
      updateDocumentTitle();
      scheduleStats();
    } catch (error) {
      console.error('Unable to save the note in the URL.', error);
      ui?.showToast(t('This note is too large to save in the URL.'));
    }
  }

  // Used when the page is going away: compression is asynchronous, so write the plain format.
  function saveSynchronously() {
    window.clearTimeout(saveTimer);
    saveTimer = null;
    if (isLoading || !editor) return;
    saveSequence += 1;
    try {
      NoteStorage.writeToUrl(readCurrentNote(), { replace: true });
    } catch (error) {
      console.error('Unable to save the note in the URL.', error);
    }
  }

  function scheduleSave() {
    if (isLoading) {
      return;
    }

    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 90);
  }

  function loadNote(note, options = {}) {
    isLoading = true;

    try {
      const normalized = NoteStorage.normalizeNote(note);

      titleInput.value = options.fresh && normalized.title === NoteStorage.DEFAULT_NOTE.title
        ? t('Note')
        : normalized.title;
      setIcon(normalized.icon, { save: false });
      currentNumberFormat = normalized.numberFormat;
      numberFormatSelect.value = currentNumberFormat;
      setTheme(normalized.theme);
      editor.setNumberFormat(currentNumberFormat);
      editor.load(
        normalized.blocks.length
          ? normalized.blocks
          : normalized.body
      );
      updateDocumentTitle();
    } finally {
      isLoading = false;
    }
    updateStats();
  }

  async function loadFromLocation(options = {}) {
    loadNote(await NoteStorage.loadFromHashAsync(), options);
  }

  // ---------------------------------------------------------------- Sharing
  async function writeTextToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const temporaryInput = document.createElement('textarea');

      temporaryInput.value = text;
      temporaryInput.style.position = 'fixed';
      temporaryInput.style.opacity = '0';

      document.body.append(temporaryInput);
      temporaryInput.select();

      const copied = document.execCommand('copy');

      temporaryInput.remove();
      return copied;
    }
  }

  async function copyCurrentLink() {
    await saveNow();

    try {
      const title = titleInput.value.trim() || t('Untitled');

      if (navigator.clipboard.write && window.ClipboardItem) {
        const safeTitle = title
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');

        const safeUrl = window.location.href
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;');

        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob(
              [window.location.href],
              { type: 'text/plain' }
            ),
            'text/uri-list': new Blob(
              [window.location.href],
              { type: 'text/uri-list' }
            ),
            'text/html': new Blob(
              [`<a href="${safeUrl}">${safeTitle}</a>`],
              { type: 'text/html' }
            )
          })
        ]);
        ui.showToast(t('Link copied'));
        return;
      }
    } catch {
      // Fall through to the plain-text clipboard path below.
    }

    const copied = await writeTextToClipboard(window.location.href);
    ui.showToast(copied ? t('Link copied') : t('Unable to copy the link'));
  }

  async function shareCurrentNote() {
    await saveNow();

    const title = titleInput.value.trim() || t('Untitled');

    if (!navigator.share) {
      await copyCurrentLink();
      ui.showToast(t('Sharing is unavailable; link copied'));
      return;
    }

    try {
      await navigator.share({
        title,
        text: title,
        url: window.location.href
      });
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('Unable to share the note.', error);
        ui.showToast(t('Unable to share this note'));
      }
    }
  }

  async function copyMarkdown() {
    const title = titleInput.value.trim();
    const body = NoteMarkdown.toMarkdown(editor.serialize());
    const markdown = title ? `# ${title}\n\n${body}` : body;
    const copied = await writeTextToClipboard(markdown);
    ui.showToast(copied ? t('Markdown copied') : t('Unable to copy'));
  }

  function createNewNote() {
    // Keep the current note URL intact and open a clean note in a separate tab.
    saveSynchronously();

    const newNoteUrl = new URL(window.location.href);
    newNoteUrl.hash = '';

    const link = document.createElement('a');

    link.href = newNoteUrl.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    document.body.append(link);
    link.click();
    link.remove();
  }

  // ---------------------------------------------------------------- "More" menu
  function setMoreMenuOpen(open) {
    moreMenu.hidden = !open;
    moreButton.setAttribute('aria-expanded', String(open));
  }

  // ---------------------------------------------------------------- Wiring
  ui = NoteUI.create({
    menu: blockMenu,
    inlineToolbar,
    toast,
    iconButton,
    iconPicker,
    editorRoot,
    linkChip,
    mobileBar,

    executeEditorCommand(command, block) {
      editor.executeMenuCommand(command, block);
    },

    applyInlineCommand(command) {
      return command === 'link' ? editor.linkCommand() : editor.formatInline(command);
    },

    runMobileCommand(command) {
      if (command === 'block') editor.openBlockPicker();
      else if (command === 'undo') editor.undo();
      else if (command === 'redo') editor.redo();
      else if (command === 'indent') editor.indentSelection(false);
      else if (command === 'outdent') editor.indentSelection(true);
      else if (command === 'link') editor.linkCommand();
      else editor.formatInline(command);
    }
  });

  editor = NoteEditor.create({
    root: editorRoot,
    localize: t,
    notify: (message) => ui.showToast(message),

    onChange() {
      scheduleSave();
      scheduleStats();
    },

    onRequestMenu(request) {
      ui.openMenu(request);
    },

    onCloseMenu() {
      ui.closeMenu();
    },

    onSelectionChange(selection) {
      ui.updateInlineToolbar(selection);
      scheduleStats();
    }
  });

  NoteUI.applyTranslations();
  titleInput.placeholder = t('Untitled');
  editorRoot.dataset.placeholder = t('Type \'/\' for commands');
  document.documentElement.style.setProperty('--calc-placeholder', JSON.stringify(t('Type a calculation…')));
  document.documentElement.style.setProperty('--toggle-empty', JSON.stringify(t('Empty toggle. Click to add content.')));

  ui.initializeIconPicker(ICONS, (icon) => {
    setIcon(icon);
  });

  titleInput.addEventListener('input', () => {
    updateDocumentTitle();
    scheduleSave();
    scheduleStats();
  });

  titleInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    editor.focus();
  });

  copyLinkButton.addEventListener('click', copyCurrentLink);
  shareNoteButton.addEventListener('click', shareCurrentNote);
  newNoteButton.addEventListener('click', createNewNote);
  copyMarkdownButton.addEventListener('click', () => {
    setMoreMenuOpen(false);
    copyMarkdown();
  });
  moreButton.addEventListener('click', (event) => {
    event.stopPropagation();
    setMoreMenuOpen(moreMenu.hidden);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!moreMenu.hidden && !moreMenu.contains(event.target) && event.target !== moreButton) {
      setMoreMenuOpen(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !moreMenu.hidden) {
      setMoreMenuOpen(false);
      moreButton.focus();
    }
  });
  themeSelect.addEventListener('change', () => {
    setTheme(themeSelect.value);
    scheduleSave();
  });
  numberFormatSelect.addEventListener('change', () => {
    currentNumberFormat = numberFormatSelect.value === 'european' ? 'european' : 'international';
    editor.setNumberFormat(currentNumberFormat);
    scheduleSave();
  });

  if (!navigator.share) {
    // Desktop browsers without the Web Share API fall back to copying, so the button is redundant.
    shareNoteButton.hidden = true;
  }

  window.addEventListener('hashchange', () => {
    loadFromLocation();
  });

  window.addEventListener('popstate', () => {
    loadFromLocation();
  });

  window.addEventListener('pagehide', saveSynchronously);

  loadFromLocation({ fresh: !window.location.hash }).then(() => {
    scheduleSave();
  });
})();
