/**
 * Note-U
 * Version: 0.2.0
 *
 * User interface controller.
 *
 * This module is responsible for:
 * - editing document metadata;
 * - selecting the document icon;
 * - updating browser metadata;
 * - handling top bar actions;
 * - displaying save states;
 * - displaying toast notifications;
 * - managing responsive interface behavior.
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
                document.getElementById(
                    "document-icon-button"
                ),

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
                document.getElementById(
                    "copy-link-button"
                ),

            newNoteButton:
                document.getElementById(
                    "new-note-button"
                ),

            addBlockButton:
                document.getElementById(
                    "add-block-button"
                ),

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
    // Document state
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
     * Updates document metadata.
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
                `Use ${emoji} as the note icon`
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
        elements.emojiPopover.hidden = false;

        positionEmojiPopover();

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
     * Positions the emoji popover.
     */
    function positionEmojiPopover() {
        const buttonRect =
            elements.iconButton.getBoundingClientRect();

        const popoverWidth =
            elements.emojiPopover.offsetWidth || 318;

        const popoverHeight =
            elements.emojiPopover.offsetHeight || 420;

        const viewportMargin = 12;
        const gap = 8;

        let left = buttonRect.left;
        let top = buttonRect.bottom + gap;

        if (
            left + popoverWidth >
            window.innerWidth - viewportMargin
        ) {
            left =
                window.innerWidth -
                popoverWidth -
                viewportMargin;
        }

        if (
            top + popoverHeight >
            window.innerHeight - viewportMargin
        ) {
            top =
                buttonRect.top -
                popoverHeight -
                gap;
        }

        left = Math.max(viewportMargin, left);
        top = Math.max(viewportMargin, top);

        elements.emojiPopover.style.left =
            `${left}px`;

        elements.emojiPopover.style.top =
            `${top}px`;

        elements.emojiPopover.style.right =
            "auto";

        elements.emojiPopover.style.bottom =
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

        const button =
            event.target.closest(".emoji-button");

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
        if (!elements || !currentDocument) {
            return;
        }

        const title =
            currentDocument.title.trim() ||
            DEFAULT_TITLE;

        const icon =
            currentDocument.icon ||
            DEFAULT_ICON;

        document.title =
            `${icon} ${title} · Note-U`;

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
        setButtonBusy(
            elements.copyLinkButton,
            true
        );

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

            showToast("Link copied");
        } catch (error) {
            console.error(
                "Note-U could not copy the document link.",
                error
            );

            showToast(
                "The link could not be copied",
                {
                    type: "error"
                }
            );
        } finally {
            setButtonBusy(
                elements.copyLinkButton,
                false
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
            typeof navigator.clipboard.writeText ===
                "function" &&
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

    /**
     * Sets the busy state of a button.
     *
     * @param {HTMLButtonElement} button
     * @param {boolean} isBusy
     */
    function setButtonBusy(button, isBusy) {
        button.disabled = isBusy;
        button.setAttribute(
            "aria-busy",
            isBusy ? "true" : "false"
        );
    }

    // =========================================================================
    // New note
    // =========================================================================

    /**
     * Handles the new-note button.
     */
    function handleNewNote() {
        const hasContent =
            currentDocument.title.trim() !==
                DEFAULT_TITLE ||
            currentDocument.icon !== DEFAULT_ICON ||
            hasMeaningfulEditorContent();

        if (hasContent) {
            const confirmed = window.confirm(
                "Create a new note? The current note will remain available only through its existing link."
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
            typeof window.NoteUEditor.getDocument !==
                "function"
        ) {
            return false;
        }

        try {
            const editorDocument =
                window.NoteUEditor.getDocument();

            return editorDocument.blocks.some(
                block =>
                    hasMeaningfulBlockContent(block)
            );
        } catch (error) {
            console.error(
                "Note-U could not inspect the editor content.",
                error
            );

            return false;
        }
    }

    /**
     * Recursively checks for meaningful block content.
     *
     * @param {Object} block
     * @returns {boolean}
     */
    function hasMeaningfulBlockContent(block) {
        if (block.type === "divider") {
            return true;
        }

        if (
            typeof block.content === "string" &&
            block.content.trim().length > 0
        ) {
            return true;
        }

        if (
            block.type === "checklist" &&
            block.checked
        ) {
            return true;
        }

        if (!Array.isArray(block.children)) {
            return false;
        }

        return block.children.some(
            child =>
                hasMeaningfulBlockContent(child)
        );
    }

    // =========================================================================
    // Add block
    // =========================================================================

    /**
     * Handles the global add-block button.
     */
    function handleAddBlock() {
        if (
            window.NoteUEditor &&
            typeof window.NoteUEditor.addBlock ===
                "function"
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
     * Closes the emoji popover after an outside click.
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
            elements.emojiPopover.contains(
                event.target
            );

        const clickedIconButton =
            elements.iconButton.contains(
                event.target
            );

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

            showToast(
                "This note is already saved inside its link"
            );
        }
    }

    /**
     * Handles viewport resizing.
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
        clearTimeout(saveStatusTimer);

        setSaveStatus(
            "Saving…",
            "saving"
        );
    }

    /**
     * Shows the saved state.
     */
    function showSavedStatus() {
        setSaveStatus(
            "Saved in link",
            "saved"
        );

        clearTimeout(saveStatusTimer);

        saveStatusTimer = window.setTimeout(
            () => {
                setSaveStatus(
                    "Ready",
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
        message = "Save failed"
    ) {
        clearTimeout(saveStatusTimer);

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
     * Notifies the application about metadata changes.
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
