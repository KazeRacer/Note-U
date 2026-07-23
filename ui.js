/**
 * Note-U
 * Version: 0.1.0
 *
 * User interface controller.
 *
 * This module is responsible for:
 * - document title editing;
 * - document icon selection;
 * - favicon and browser title updates;
 * - copy-link behavior;
 * - new-note behavior;
 * - save status messages;
 * - toast notifications;
 * - top bar scroll state;
 * - textarea auto-resizing.
 */

(function () {
    "use strict";

    // =========================================================================
    // Constants
    // =========================================================================

    const DEFAULT_TITLE = "Note";
    const DEFAULT_ICON = "📝";

    const SAVE_STATUS_RESET_DELAY = 1800;
    const TOAST_DURATION = 2600;

    const EMOJI_OPTIONS = Object.freeze([
        "📝",
        "📄",
        "📌",
        "📚",
        "📖",
        "📓",
        "📒",
        "📔",
        "📕",
        "📗",
        "📘",
        "📙",
        "✏️",
        "🖊️",
        "🖋️",
        "✍️",
        "💡",
        "🧠",
        "🎯",
        "✅",
        "🚀",
        "🔥",
        "⭐",
        "✨",
        "💎",
        "🌱",
        "🌿",
        "🌍",
        "🌙",
        "☀️",
        "⚡",
        "❤️",
        "💙",
        "💚",
        "💛",
        "🧡",
        "💜",
        "🖤",
        "🤍",
        "📅",
        "⏰",
        "🔔",
        "🔖",
        "📎",
        "🗂️",
        "📁",
        "🧰",
        "⚙️",
        "🔧",
        "🔬",
        "💻",
        "🖥️",
        "📱",
        "🎨",
        "🎵",
        "🎬",
        "📷",
        "🧩",
        "🎓",
        "🏆",
        "💼",
        "🏠",
        "✈️",
        "🗺️",
        "🍀",
        "🌸",
        "🌊",
        "🐝",
        "🦊",
        "🐼",
        "🐙",
        "🦄"
    ]);

    // =========================================================================
    // Internal state
    // =========================================================================

    let elements = null;
    let currentDocument = null;

    let documentChangeHandler = null;
    let newNoteHandler = null;
    let copyLinkHandler = null;

    let saveStatusTimer = null;
    let activeToastTimer = null;

    let isInitialized = false;

    // =========================================================================
    // Initialization
    // =========================================================================

    /**
     * Initializes the user interface.
     *
     * @param {Object} options
     * @param {Object} options.documentModel
     * @param {Function} [options.onDocumentChange]
     * @param {Function} [options.onNewNote]
     * @param {Function} [options.onCopyLink]
     */
    function initialize(options) {
        if (!options || typeof options !== "object") {
            throw new TypeError(
                "Note-U UI initialization options are required."
            );
        }

        cacheElements();
        validateElements();

        documentChangeHandler =
            typeof options.onDocumentChange === "function"
                ? options.onDocumentChange
                : null;

        newNoteHandler =
            typeof options.onNewNote === "function"
                ? options.onNewNote
                : null;

        copyLinkHandler =
            typeof options.onCopyLink === "function"
                ? options.onCopyLink
                : null;

        currentDocument =
            window.NoteUStorage.normalizeDocument(
                options.documentModel
            );

        renderEmojiGrid();
        bindEvents();
        setDocument(currentDocument);

        updateTopbarScrollState();

        isInitialized = true;
    }

    /**
     * Caches required DOM elements.
     */
    function cacheElements() {
        elements = {
            app: document.getElementById("app"),
            topbar: document.getElementById("topbar"),

            titleInput:
                document.getElementById("document-title"),

            iconButton:
                document.getElementById("document-icon-button"),

            iconDisplay:
                document.getElementById("document-icon"),

            emojiPopover:
                document.getElementById("emoji-popover"),

            emojiGrid:
                document.getElementById("emoji-grid"),

            closeEmojiButton:
                document.getElementById(
                    "close-emoji-popover-button"
                ),

            favicon:
                document.getElementById("app-favicon"),

            saveStatus:
                document.getElementById("save-status"),

            copyLinkButton:
                document.getElementById("copy-link-button"),

            newNoteButton:
                document.getElementById("new-note-button"),

            addBlockButton:
                document.getElementById("add-block-button"),

            toastRegion:
                document.getElementById("toast-region")
        };
    }

    /**
     * Validates required DOM elements.
     */
    function validateElements() {
        const missingElements = Object.entries(elements)
            .filter(([, value]) => !value)
            .map(([name]) => name);

        if (missingElements.length > 0) {
            throw new Error(
                `Note-U UI is missing required elements: ${missingElements.join(", ")}`
            );
        }
    }

    /**
     * Ensures that the UI has been initialized.
     */
    function requireInitialization() {
        if (!isInitialized || !elements) {
            throw new Error(
                "Note-U UI has not been initialized."
            );
        }
    }

    // =========================================================================
    // Event binding
    // =========================================================================

    /**
     * Registers UI event listeners.
     */
    function bindEvents() {
        elements.titleInput.addEventListener(
            "input",
            handleTitleInput
        );

        elements.titleInput.addEventListener(
            "keydown",
            handleTitleKeyDown
        );

        elements.iconButton.addEventListener(
            "click",
            toggleEmojiPopover
        );

        elements.closeEmojiButton.addEventListener(
            "click",
            closeEmojiPopover
        );

        elements.emojiGrid.addEventListener(
            "click",
            handleEmojiSelection
        );

        elements.copyLinkButton.addEventListener(
            "click",
            handleCopyLink
        );

        elements.newNoteButton.addEventListener(
            "click",
            handleNewNote
        );

        elements.addBlockButton.addEventListener(
            "click",
            handleAddBlock
        );

        document.addEventListener(
            "pointerdown",
            handleDocumentPointerDown
        );

        document.addEventListener(
            "keydown",
            handleGlobalKeyDown
        );

        window.addEventListener(
            "scroll",
            updateTopbarScrollState,
            {
                passive: true
            }
        );

        window.addEventListener(
            "resize",
            handleWindowResize
        );
    }

    // =========================================================================
    // Document rendering
    // =========================================================================

    /**
     * Replaces the current UI document state.
     *
     * @param {*} nextDocument
     */
    function setDocument(nextDocument) {
        if (!elements) {
            return;
        }

        currentDocument =
            window.NoteUStorage.normalizeDocument(
                nextDocument
            );

        elements.titleInput.value =
            currentDocument.title;

        elements.iconDisplay.textContent =
            currentDocument.icon;

        resizeTitleInput();
        updateBrowserMetadata();
    }

    /**
     * Returns a clone of the current UI document state.
     *
     * @returns {Object}
     */
    function getDocument() {
        requireInitialization();

        return window.NoteUStorage.cloneDocument(
            currentDocument
        );
    }

    /**
     * Updates the current document without rendering editor blocks.
     *
     * @param {Object} partialDocument
     */
    function updateDocument(partialDocument) {
        currentDocument =
            window.NoteUStorage.normalizeDocument({
                ...currentDocument,
                ...partialDocument
            });

        updateBrowserMetadata();
    }

    // =========================================================================
    // Title
    // =========================================================================

    /**
     * Handles title input changes.
     */
    function handleTitleInput() {
        resizeTitleInput();

        updateDocument({
            title: elements.titleInput.value
        });

        notifyDocumentChange("edit-title");
    }

    /**
     * Handles keyboard behavior in the title field.
     *
     * @param {KeyboardEvent} event
     */
    function handleTitleKeyDown(event) {
        if (event.key !== "Enter") {
            return;
        }

        event.preventDefault();

        if (
            window.NoteUEditor &&
            typeof window.NoteUEditor.focusFirstBlock === "function"
        ) {
            window.NoteUEditor.focusFirstBlock();
        }
    }

    /**
     * Automatically resizes the title textarea.
     */
    function resizeTitleInput() {
        elements.titleInput.style.height = "auto";

        const nextHeight = Math.min(
            elements.titleInput.scrollHeight,
            240
        );

        elements.titleInput.style.height =
            `${Math.max(nextHeight, 58)}px`;
    }

    // =========================================================================
    // Emoji picker
    // =========================================================================

    /**
     * Renders available emoji buttons.
     */
    function renderEmojiGrid() {
        const fragment =
            document.createDocumentFragment();

        for (const emoji of EMOJI_OPTIONS) {
            const button =
                document.createElement("button");

            button.type = "button";
            button.className = "emoji-button";
            button.dataset.emoji = emoji;
            button.setAttribute("role", "listitem");
            button.setAttribute(
                "aria-label",
                `Usa l'icona ${emoji}`
            );

            button.textContent = emoji;

            fragment.appendChild(button);
        }

        elements.emojiGrid.replaceChildren(fragment);
    }

    /**
     * Opens or closes the emoji popover.
     */
    function toggleEmojiPopover() {
        if (elements.emojiPopover.hidden) {
            openEmojiPopover();
            return;
        }

        closeEmojiPopover();
    }

    /**
     * Opens the emoji popover.
     */
    function openEmojiPopover() {
        positionEmojiPopover();

        elements.emojiPopover.hidden = false;

        elements.iconButton.setAttribute(
            "aria-expanded",
            "true"
        );

        requestAnimationFrame(() => {
            const selectedButton =
                elements.emojiGrid.querySelector(
                    `[data-emoji="${escapeSelector(currentDocument.icon)}"]`
                );

            const firstButton =
                elements.emojiGrid.querySelector(
                    ".emoji-button"
                );

            const focusTarget =
                selectedButton || firstButton;

            if (focusTarget instanceof HTMLElement) {
                focusTarget.focus();
            }
        });
    }

    /**
     * Closes the emoji popover.
     */
    function closeEmojiPopover() {
        elements.emojiPopover.hidden = true;

        elements.iconButton.setAttribute(
            "aria-expanded",
            "false"
        );
    }

    /**
     * Positions the emoji popover next to the document icon.
     */
    function positionEmojiPopover() {
        const buttonRect =
            elements.iconButton.getBoundingClientRect();

        const popoverWidth = Math.min(
            318,
            window.innerWidth - 24
        );

        const preferredLeft = buttonRect.left;
        const maximumLeft =
            window.innerWidth - popoverWidth - 12;

        const left = Math.max(
            12,
            Math.min(preferredLeft, maximumLeft)
        );

        const preferredTop =
            buttonRect.bottom + 8;

        const estimatedHeight = 360;
        const maximumTop =
            window.innerHeight - estimatedHeight - 12;

        const top = Math.max(
            12,
            Math.min(preferredTop, maximumTop)
        );

        elements.emojiPopover.style.left =
            `${left}px`;

        elements.emojiPopover.style.top =
            `${top}px`;

        elements.emojiPopover.style.right =
            "auto";
    }

    /**
     * Handles emoji selection.
     *
     * @param {MouseEvent} event
     */
    function handleEmojiSelection(event) {
        if (!(event.target instanceof Element)) {
            return;
        }

        const button = event.target.closest(
            ".emoji-button"
        );

        if (!(button instanceof HTMLButtonElement)) {
            return;
        }

        const emoji = button.dataset.emoji;

        if (!emoji) {
            return;
        }

        currentDocument.icon = emoji;
        elements.iconDisplay.textContent = emoji;

        updateBrowserMetadata();
        closeEmojiPopover();

        notifyDocumentChange("change-icon");

        elements.iconButton.focus();
    }

    // =========================================================================
    // Browser metadata
    // =========================================================================

    /**
     * Updates the browser tab title and favicon.
     */
    function updateBrowserMetadata() {
        const title =
            currentDocument.title.trim() || DEFAULT_TITLE;

        const icon =
            currentDocument.icon || DEFAULT_ICON;

        document.title = `${icon} ${title} · Note-U`;

        elements.favicon.href =
            createEmojiFavicon(icon);
    }

    /**
     * Creates an SVG data URL favicon from an emoji.
     *
     * @param {string} emoji
     * @returns {string}
     */
    function createEmojiFavicon(emoji) {
        const escapedEmoji = escapeXml(emoji);

        const svg = [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
            '<text x="50" y="54" dominant-baseline="middle" text-anchor="middle" font-size="82">',
            escapedEmoji,
            "</text>",
            "</svg>"
        ].join("");

        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }

    /**
     * Escapes XML-sensitive characters.
     *
     * @param {string} value
     * @returns {string}
     */
    function escapeXml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }

    // =========================================================================
    // Copy link
    // =========================================================================

    /**
     * Handles the copy-link button.
     */
    async function handleCopyLink() {
        try {
            let url = window.location.href;

            if (copyLinkHandler) {
                const handlerResult =
                    await copyLinkHandler();

                if (typeof handlerResult === "string") {
                    url = handlerResult;
                }
            }

            await copyText(url);

            showToast("Link copiato");
        } catch (error) {
            console.error(
                "Note-U could not copy the document link.",
                error
            );

            showToast(
                "Impossibile copiare il link",
                {
                    type: "error"
                }
            );
        }
    }

    /**
     * Copies text using the Clipboard API with a fallback.
     *
     * @param {string} text
     */
    async function copyText(text) {
        if (
            navigator.clipboard &&
            typeof navigator.clipboard.writeText === "function" &&
            window.isSecureContext
        ) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textarea =
            document.createElement("textarea");

        textarea.value = text;
        textarea.setAttribute(
            "aria-hidden",
            "true"
        );

        textarea.style.position = "fixed";
        textarea.style.top = "-9999px";
        textarea.style.left = "-9999px";

        document.body.appendChild(textarea);

        textarea.focus();
        textarea.select();

        const copied =
            document.execCommand("copy");

        textarea.remove();

        if (!copied) {
            throw new Error(
                "The browser rejected the copy command."
            );
        }
    }

    // =========================================================================
    // New note
    // =========================================================================

    /**
     * Handles the new-note button.
     */
    function handleNewNote() {
        const hasContent =
            currentDocument.title.trim() !== DEFAULT_TITLE ||
            currentDocument.icon !== DEFAULT_ICON ||
            hasMeaningfulEditorContent();

        if (hasContent) {
            const confirmed = window.confirm(
                "Creare una nuova nota? La nota corrente resterà disponibile solo tramite il suo link."
            );

            if (!confirmed) {
                return;
            }
        }

        if (newNoteHandler) {
            newNoteHandler();
        }
    }

    /**
     * Checks whether the editor contains meaningful content.
     *
     * @returns {boolean}
     */
    function hasMeaningfulEditorContent() {
        if (
            !window.NoteUEditor ||
            typeof window.NoteUEditor.getDocument !== "function"
        ) {
            return false;
        }

        try {
            const editorDocument =
                window.NoteUEditor.getDocument();

            return editorDocument.blocks.some(
                block => hasMeaningfulBlockContent(block)
            );
        } catch (error) {
            return false;
        }
    }

    /**
     * Recursively checks for block content.
     *
     * @param {Object} block
     * @returns {boolean}
     */
    function hasMeaningfulBlockContent(block) {
        if (
            typeof block.content === "string" &&
            block.content.trim().length > 0
        ) {
            return true;
        }

        if (!Array.isArray(block.children)) {
            return false;
        }

        return block.children.some(
            child => hasMeaningfulBlockContent(child)
        );
    }

    // =========================================================================
    // Add block
    // =========================================================================

    /**
     * Handles the add-block button.
     */
    function handleAddBlock() {
        if (
            window.NoteUEditor &&
            typeof window.NoteUEditor.addBlock === "function"
        ) {
            window.NoteUEditor.addBlock({
                focus: true
            });
        }
    }

    // =========================================================================
    // Global interactions
    // =========================================================================

    /**
     * Closes the emoji popover when clicking outside it.
     *
     * @param {PointerEvent} event
     */
    function handleDocumentPointerDown(event) {
        if (elements.emojiPopover.hidden) {
            return;
        }

        if (!(event.target instanceof Node)) {
            return;
        }

        const clickedInsidePopover =
            elements.emojiPopover.contains(event.target);

        const clickedIconButton =
            elements.iconButton.contains(event.target);

        if (
            !clickedInsidePopover &&
            !clickedIconButton
        ) {
            closeEmojiPopover();
        }
    }

    /**
     * Handles global keyboard shortcuts.
     *
     * @param {KeyboardEvent} event
     */
    function handleGlobalKeyDown(event) {
        if (event.key === "Escape") {
            closeEmojiPopover();
        }

        if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "s"
        ) {
            event.preventDefault();
            showToast("La nota è già salvata nel link");
        }
    }

    /**
     * Repositions responsive UI elements.
     */
    function handleWindowResize() {
        resizeTitleInput();

        if (!elements.emojiPopover.hidden) {
            positionEmojiPopover();
        }
    }

    /**
     * Updates the top bar visual state.
     */
    function updateTopbarScrollState() {
        elements.topbar.classList.toggle(
            "topbar--scrolled",
            window.scrollY > 4
        );
    }

    // =========================================================================
    // Save status
    // =========================================================================

    /**
     * Shows the saving state.
     */
    function showSavingStatus() {
        setSaveStatus(
            "Salvataggio…",
            "saving"
        );
    }

    /**
     * Shows the saved state.
     */
    function showSavedStatus() {
        setSaveStatus(
            "Salvato nel link",
            "saved"
        );

        clearTimeout(saveStatusTimer);

        saveStatusTimer = window.setTimeout(
            () => {
                setSaveStatus(
                    "Pronto",
                    "idle"
                );
            },
            SAVE_STATUS_RESET_DELAY
        );
    }

    /**
     * Shows the save error state.
     *
     * @param {string} [message]
     */
    function showSaveError(
        message = "Errore di salvataggio"
    ) {
        setSaveStatus(
            message,
            "error"
        );
    }

    /**
     * Updates the save status element.
     *
     * @param {string} text
     * @param {string} state
     */
    function setSaveStatus(text, state) {
        if (!elements) {
            return;
        }

        elements.saveStatus.textContent = text;
        elements.saveStatus.dataset.state = state;
    }

    // =========================================================================
    // Toast notifications
    // =========================================================================

    /**
     * Displays a temporary notification.
     *
     * @param {string} message
     * @param {Object} [options]
     * @param {string} [options.type]
     * @param {number} [options.duration]
     */
    function showToast(message, options = {}) {
        if (!elements || !message) {
            return;
        }

        clearTimeout(activeToastTimer);
        elements.toastRegion.replaceChildren();

        const toast =
            document.createElement("div");

        toast.className = "toast";
        toast.textContent = message;

        if (options.type === "error") {
            toast.classList.add("toast--error");
        }

        elements.toastRegion.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add("toast--visible");
        });

        const duration =
            Number.isFinite(options.duration)
                ? options.duration
                : TOAST_DURATION;

        activeToastTimer = window.setTimeout(
            () => {
                toast.classList.remove(
                    "toast--visible"
                );

                window.setTimeout(
                    () => {
                        toast.remove();
                    },
                    220
                );
            },
            duration
        );
    }

    // =========================================================================
    // Loading state
    // =========================================================================

    /**
     * Sets the application loading state.
     *
     * @param {boolean} isLoading
     */
    function setLoading(isLoading) {
        if (!elements) {
            return;
        }

        elements.app.dataset.loading =
            isLoading ? "true" : "false";
    }

    // =========================================================================
    // Change notifications
    // =========================================================================

    /**
     * Notifies the application about document metadata changes.
     *
     * @param {string} reason
     */
    function notifyDocumentChange(reason) {
        if (!documentChangeHandler) {
            return;
        }

        documentChangeHandler(
            getDocument(),
            {
                reason
            }
        );
    }

    // =========================================================================
    // Utility helpers
    // =========================================================================

    /**
     * Escapes a value for use inside a CSS selector.
     *
     * @param {string} value
     * @returns {string}
     */
    function escapeSelector(value) {
        if (
            window.CSS &&
            typeof window.CSS.escape === "function"
        ) {
            return window.CSS.escape(value);
        }

        return String(value).replace(
            /["\\]/g,
            "\\$&"
        );
    }

    // =========================================================================
    // Public API
    // =========================================================================

    window.NoteUUI = Object.freeze({
        initialize,

        getDocument,
        setDocument,

        setLoading,

        showSavingStatus,
        showSavedStatus,
        showSaveError,
        showToast,

        openEmojiPopover,
        closeEmojiPopover,

        updateBrowserMetadata
    });
})();
