(() => {
  'use strict';

  const titleInput = document.getElementById('note-title');
  const editorRoot = document.getElementById('editor');
  const iconButton = document.getElementById('icon-button');
  const iconPicker = document.getElementById('icon-picker');
  const favicon = document.getElementById('favicon');
  const blockMenu = document.getElementById('block-menu');
  const inlineToolbar = document.getElementById('inline-toolbar');
  const toast = document.getElementById('toast');
  const copyLinkButton = document.getElementById('copy-link-button');
  const newNoteButton = document.getElementById('new-note-button');

  const ICONS = [
    '✏️', '📝', '💡', '📌', '⭐', '🔥',
    '🚀', '🎯', '📚', '💻', '🛠️', '🎨',
    '✅', '🧠', '📊', '💰', '🌐', '☕',
    '🔖', '🗂️', '🧭', '🔬', '📐', '🪴'
  ];

  let editor = null;
  let ui = null;
  let currentIcon = NoteStorage.DEFAULT_NOTE.icon;
  let saveTimer = null;
  let isLoading = false;

  function createFaviconUrl(icon) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <text y="0.9em" font-size="90">${icon}</text>
      </svg>
    `.trim();
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function setIcon(icon, options = {}) {
    const { save = true } = options;
    currentIcon = icon || NoteStorage.DEFAULT_NOTE.icon;
    iconButton.textContent = currentIcon;
    favicon.href = createFaviconUrl(currentIcon);
    if (save) scheduleSave();
  }

  function updateDocumentTitle() {
    const title = titleInput.value.trim();
    document.title = title || 'Untitled';
  }

  function readCurrentNote() {
    return {
      version: NoteStorage.CURRENT_VERSION,
      title: titleInput.value,
      icon: currentIcon,
      blocks: editor.serialize()
    };
  }

  function saveNow() {
    window.clearTimeout(saveTimer);
    saveTimer = null;
    if (isLoading || !editor) return;

    try {
      NoteStorage.writeToUrl(readCurrentNote(), { replace: true });
      updateDocumentTitle();
    } catch (error) {
      console.error('Unable to save the note in the URL.', error);
      ui?.showToast('This note is too large to save in the URL.');
    }
  }

  function scheduleSave() {
    if (isLoading) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 90);
  }

  function loadNote(note) {
    isLoading = true;
    try {
      const normalized = NoteStorage.normalizeNote(note);
      titleInput.value = normalized.title;
      setIcon(normalized.icon, { save: false });
      editor.load(normalized.blocks.length ? normalized.blocks : normalized.body);
      updateDocumentTitle();
    } finally {
      isLoading = false;
    }
  }

  async function copyCurrentLink() {
    saveNow();

    try {
      await navigator.clipboard.writeText(window.location.href);
      ui.showToast('Link copied');
    } catch {
      const temporaryInput = document.createElement('textarea');
      temporaryInput.value = window.location.href;
      temporaryInput.style.position = 'fixed';
      temporaryInput.style.opacity = '0';
      document.body.append(temporaryInput);
      temporaryInput.select();
      const copied = document.execCommand('copy');
      temporaryInput.remove();
      ui.showToast(copied ? 'Link copied' : 'Unable to copy the link');
    }
  }

  function createNewNote() {
    window.clearTimeout(saveTimer);
    NoteStorage.clearUrl({ replace: false });
    loadNote(NoteStorage.cloneDefaultNote());
    editor.focus();
  }

  ui = NoteUI.create({
    menu: blockMenu,
    inlineToolbar,
    toast,
    iconButton,
    iconPicker,
    editorRoot,
    executeEditorCommand(command, block) {
      editor.executeMenuCommand(command, block);
    }
  });

  editor = NoteEditor.create({
    root: editorRoot,
    onChange() {
      scheduleSave();
    },
    onRequestMenu(request) {
      ui.openMenu(request);
    },
    onCloseMenu() {
      ui.closeMenu();
    },
    onSelectionChange(selection) {
      ui.updateInlineToolbar(selection);
    }
  });

  ui.initializeIconPicker(ICONS, (icon) => setIcon(icon));

  titleInput.addEventListener('input', () => {
    updateDocumentTitle();
    scheduleSave();
  });

  titleInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    editor.focus();
  });

  copyLinkButton.addEventListener('click', copyCurrentLink);
  newNoteButton.addEventListener('click', createNewNote);

  window.addEventListener('hashchange', () => {
    loadNote(NoteStorage.loadFromHash());
  });

  window.addEventListener('popstate', () => {
    loadNote(NoteStorage.loadFromHash());
  });

  window.addEventListener('pagehide', saveNow);

  loadNote(NoteStorage.loadFromHash());
})();
