diff --git a/app.js b/app.js
index 787ea105196b4276a0383b327ee6dfb23ac297b1..1d89bf328b665f869583e5e21ae76a20a70435a9 100644
--- a/app.js
+++ b/app.js
@@ -1,44 +1,46 @@
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
+  const shareNoteButton = document.getElementById('share-note-button');
   const newNoteButton = document.getElementById('new-note-button');
 
   const ICONS = [
     '✏️', '📝', '💡', '📌', '⭐', '🔥',
     '🚀', '🎯', '📚', '💻', '🛠️', '🎨',
     '✅', '🧠', '📊', '💰', '🌐', '☕',
-    '🔖', '🗂️', '🧭', '🔬', '📐', '🪴'
+    '🔖', '🗂️', '🧭', '🔬', '📐', '🪴',
+    '⬆️', '⬇️', '➡️', '⬅️'
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
 
@@ -71,65 +73,95 @@
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
-      await navigator.clipboard.writeText(window.location.href);
+      const title = titleInput.value.trim() || 'Untitled';
+      if (navigator.clipboard.write && window.ClipboardItem) {
+        const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
+          .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
+        const safeUrl = window.location.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
+        await navigator.clipboard.write([new ClipboardItem({
+          'text/plain': new Blob([window.location.href], { type: 'text/plain' }),
+          'text/uri-list': new Blob([window.location.href], { type: 'text/uri-list' }),
+          'text/html': new Blob([`<a href="${safeUrl}">${safeTitle}</a>`], { type: 'text/html' })
+        })]);
+      } else {
+        await navigator.clipboard.writeText(window.location.href);
+      }
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
 
+  async function shareCurrentNote() {
+    saveNow();
+    const title = titleInput.value.trim() || 'Untitled';
+    if (!navigator.share) {
+      await copyCurrentLink();
+      ui.showToast('Sharing is unavailable; link copied');
+      return;
+    }
+    try {
+      await navigator.share({ title, text: title, url: window.location.href });
+    } catch (error) {
+      if (error?.name !== 'AbortError') {
+        console.error('Unable to share the note.', error);
+        ui.showToast('Unable to share this note');
+      }
+    }
+  }
+
   function createNewNote() {
     // Keep the current note URL intact and open a clean note in a separate tab.
     saveNow();
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
@@ -142,39 +174,40 @@
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
+  shareNoteButton.addEventListener('click', shareCurrentNote);
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
