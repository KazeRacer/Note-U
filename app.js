/**
 * Note-U
 * Version: 0.3.0
 *
 * Main application controller.
 *
 * Responsibilities:
 * - load the document from the current URL;
 * - initialize storage, editor and interface controllers;
 * - keep the title, icon and blocks synchronized;
 * - update the URL while the note changes;
 * - generate and copy the complete note link;
 * - manage browser back and forward navigation;
 * - create new notes;
 * - handle invalid links and unexpected errors.
 */

(function () {
    "use strict";

    const Storage = window.NoteUStorage;
    const Editor = window.NoteUEditor;
    const UI = window.NoteUUI;

    if (!Storage) {
        throw new Error(
            "NoteUStorage must be loaded before app.js."
        );
    }

    if (!Editor) {
        throw new Error(
            "NoteUEditor must be loaded before app.js."
        );
    }

    if (!UI) {
        throw new Error(
            "NoteUUI must be loaded before app.js."
        );
    }

    // =========================================================================
    // Constants
    // =========================================================================

    const URL_UPDATE_DELAY = 180;

    const NEW_NOTE_CONFIRMATION_MESSAGE =
        "Create a new note? The current note will remain available through its existing link.";

    // =========================================================================
    // Application state
    // =========================================================================

    let documentModel = null;

    let urlUpdateTimer = null;

    let isInitialized = false;
    let isApplyingNavigation = false;
    let isWritingUrl = false;

    // =========================================================================
    // Initialization
    // =========================================================================

    /**
     * Starts the application.
     */
    function initialize() {
        if (isInitialized) {
            return;
        }

        isInitialized = true;

        try {
            documentModel =
                loadInitialDocument();

            initializeEditor();
            initializeInterface();

            bindApplicationEvents();

            refreshUrlSize();

            /*
             * Normalize old or legacy note links immediately.
             *
             * This converts supported older URL formats into the current
             * version 3 query-string format without adding a history entry.
             */
            if (
                Storage.hasDocumentInUrl()
            ) {
                writeCurrentDocumentToUrl({
                    pushHistory: false,
                    notify: false
                });
            }
        } catch (error) {
            handleFatalInitializationError(
                error
            );
        }
    }

    /**
     * Loads the initial document.
     *
     * Invalid links are replaced with a new empty note, while the error is
     * reported after the interface has been initialized.
     *
     * @returns {Object}
     */
    function loadInitialDocument() {
        try {
            return Storage.loadDocumentFromUrl();
        } catch (error) {
            window.setTimeout(() => {
                UI.showError(error);
            }, 0);

            return Storage.createDocument();
        }
    }

    /**
     * Initializes the block editor.
     */
    function initializeEditor() {
        Editor.initialize({
            document: documentModel,

            onChange:
                handleEditorChange,

            onError:
                handleApplicationError
        });
    }

    /**
     * Initializes the interface controller.
     */
    function initializeInterface() {
        UI.initialize({
            document: documentModel,

            onTitleChange:
                handleTitleChange,

            onIconChange:
                handleIconChange,

            onNewNote:
                handleNewNoteRequest,

            onAddBlock:
                handleAddBlockRequest,

            onCopyLink:
                copyCurrentDocumentLink,

            getDocumentUrl:
                getCurrentDocumentUrl
        });
    }

    /**
     * Binds browser and application events.
     */
    function bindApplicationEvents() {
        window.addEventListener(
            "popstate",
            handleBrowserNavigation
        );

        window.addEventListener(
            "hashchange",
            handleBrowserNavigation
        );

        window.addEventListener(
            "beforeunload",
            flushPendingUrlUpdate
        );

        window.addEventListener(
            "pagehide",
            flushPendingUrlUpdate
        );

        window.addEventListener(
            "error",
            handleWindowError
        );

        window.addEventListener(
            "unhandledrejection",
            handleUnhandledRejection
        );

        document.addEventListener(
            "visibilitychange",
            handleVisibilityChange
        );
    }

    // =========================================================================
    // Document synchronization
    // =========================================================================

    /**
     * Handles editor changes.
     *
     * @param {*} nextDocument
     */
    function handleEditorChange(
        nextDocument
    ) {
        if (isApplyingNavigation) {
            return;
        }

        documentModel =
            mergeDocumentState(
                nextDocument
            );

        scheduleUrlUpdate();
    }

    /**
     * Handles title changes.
     *
     * @param {string} title
     */
    function handleTitleChange(title) {
        if (isApplyingNavigation) {
            return;
        }

        documentModel.title =
            String(title ?? "");

        scheduleUrlUpdate();
    }

    /**
     * Handles icon changes.
     *
     * @param {string} icon
     */
    function handleIconChange(icon) {
        if (isApplyingNavigation) {
            return;
        }

        documentModel.icon =
            String(icon || Storage.DEFAULT_ICON);

        scheduleUrlUpdate();
    }

    /**
     * Merges an editor document with the current title and icon.
     *
     * The editor controls the block tree, while ui.js controls the header.
     *
     * @param {*} editorDocument
     * @returns {Object}
     */
    function mergeDocumentState(
        editorDocument
    ) {
        const normalizedEditorDocument =
            Storage.normalizeDocument(
                editorDocument
            );

        const headerData =
            UI.getHeaderData();

        normalizedEditorDocument.title =
            headerData.title;

        normalizedEditorDocument.icon =
            headerData.icon;

        return normalizedEditorDocument;
    }

    /**
     * Collects the latest state from both the editor and interface.
     *
     * @returns {Object}
     */
    function collectCurrentDocument() {
        const editorDocument =
            Editor.getDocument();

        const headerData =
            UI.getHeaderData();

        editorDocument.title =
            headerData.title;

        editorDocument.icon =
            headerData.icon;

        documentModel =
            Storage.normalizeDocument(
                editorDocument
            );

        return Storage.cloneDocument(
            documentModel
        );
    }

    /**
     * Applies a complete document to every application controller.
     *
     * @param {*} nextDocument
     */
    function applyDocument(nextDocument) {
        isApplyingNavigation = true;

        try {
            documentModel =
                Storage.normalizeDocument(
                    nextDocument
                );

            Editor.setDocument(
                documentModel
            );

            UI.setDocument(
                documentModel
            );

            refreshUrlSize();
        } finally {
            isApplyingNavigation = false;
        }
    }

    // =========================================================================
    // URL synchronization
    // =========================================================================

    /**
     * Schedules a URL update after a short delay.
     */
    function scheduleUrlUpdate() {
        if (
            isApplyingNavigation ||
            isWritingUrl
        ) {
            return;
        }

        window.clearTimeout(
            urlUpdateTimer
        );

        urlUpdateTimer =
            window.setTimeout(() => {
                writeCurrentDocumentToUrl({
                    pushHistory: false,
                    notify: false
                });
            }, URL_UPDATE_DELAY);
    }

    /**
     * Immediately writes the current note into the URL.
     *
     * @param {Object} [options]
     * @param {boolean} [options.pushHistory]
     * @param {boolean} [options.notify]
     * @returns {string}
     */
    function writeCurrentDocumentToUrl(
        options = {}
    ) {
        window.clearTimeout(
            urlUpdateTimer
        );

        urlUpdateTimer = null;

        const currentDocument =
            collectCurrentDocument();

        isWritingUrl = true;

        try {
            const url =
                Storage.writeDocumentToUrl(
                    currentDocument,
                    {
                        pushHistory:
                            Boolean(
                                options.pushHistory
                            )
                    }
                );

            UI.updateUrlSize(
                url.length
            );

            if (options.notify) {
                UI.showToast(
                    "Note link updated."
                );
            }

            return url;
        } catch (error) {
            handleApplicationError(
                error
            );

            return window.location.href;
        } finally {
            isWritingUrl = false;
        }
    }

    /**
     * Writes a pending URL update immediately.
     */
    function flushPendingUrlUpdate() {
        if (!urlUpdateTimer) {
            return;
        }

        writeCurrentDocumentToUrl({
            pushHistory: false,
            notify: false
        });
    }

    /**
     * Returns a complete URL for the current document.
     *
     * This function does not need to alter browser history.
     *
     * @returns {string}
     */
    function getCurrentDocumentUrl() {
        const currentDocument =
            collectCurrentDocument();

        const url =
            Storage.createDocumentUrl(
                currentDocument
            );

        UI.updateUrlSize(
            url.length
        );

        return url;
    }

    /**
     * Updates the URL-size indicator.
     */
    function refreshUrlSize() {
        try {
            const url =
                getCurrentDocumentUrl();

            UI.updateUrlSize(
                url.length
            );
        } catch (error) {
            UI.clearUrlSize();
        }
    }

    // =========================================================================
    // Copy link
    // =========================================================================

    /**
     * Creates, writes and copies the current document link.
     *
     * ui.js performs the actual clipboard operation only when this callback is
     * absent. Because this callback is present, app.js must copy the URL itself.
     *
     * @returns {Promise<string>}
     */
    async function copyCurrentDocumentLink() {
        const url =
            writeCurrentDocumentToUrl({
                pushHistory: false,
                notify: false
            });

        await copyTextToClipboard(url);

        return url;
    }

    /**
     * Copies text using the Clipboard API or a compatible fallback.
     *
     * @param {string} text
     */
    async function copyTextToClipboard(text) {
        if (
            navigator.clipboard &&
            typeof navigator.clipboard.writeText ===
                "function" &&
            window.isSecureContext
        ) {
            await navigator.clipboard.writeText(
                text
            );

            return;
        }

        const textarea =
            document.createElement(
                "textarea"
            );

        textarea.value =
            String(text);

        textarea.setAttribute(
            "readonly",
            ""
        );

        textarea.style.position =
            "fixed";

        textarea.style.top =
            "-1000px";

        textarea.style.left =
            "-1000px";

        textarea.style.opacity =
            "0";

        document.body.appendChild(
            textarea
        );

        textarea.select();

        textarea.setSelectionRange(
            0,
            textarea.value.length
        );

        const copied =
            document.execCommand("copy");

        textarea.remove();

        if (!copied) {
            throw new Error(
                "Clipboard access is unavailable."
            );
        }
    }

    // =========================================================================
    // New note
    // =========================================================================

    /**
     * Handles the New button.
     */
    function handleNewNoteRequest() {
        const currentDocument =
            collectCurrentDocument();

        if (
            Storage.hasMeaningfulContent(
                currentDocument
            )
        ) {
            const confirmed =
                window.confirm(
                    NEW_NOTE_CONFIRMATION_MESSAGE
                );

            if (!confirmed) {
                return;
            }
        }

        createNewNote();
    }

    /**
     * Creates a new empty note and a new history entry.
     */
    function createNewNote() {
        window.clearTimeout(
            urlUpdateTimer
        );

        urlUpdateTimer = null;

        const newDocument =
            Storage.createDocument();

        applyDocument(
            newDocument
        );

        /*
         * A new note receives its own browser history entry so Back returns to
         * the previous note.
         */
        writeCurrentDocumentToUrl({
            pushHistory: true,
            notify: false
        });

        Editor.focusFirstBlock();

        UI.showToast(
            "New note created."
        );
    }

    // =========================================================================
    // Add block
    // =========================================================================

    /**
     * Handles the Add block toolbar button.
     */
    function handleAddBlockRequest() {
        Editor.appendBlock(
            "paragraph"
        );
    }

    // =========================================================================
    // Browser navigation
    // =========================================================================

    /**
     * Handles browser Back, Forward and legacy hash navigation.
     */
    function handleBrowserNavigation() {
        if (isWritingUrl) {
            return;
        }

        window.clearTimeout(
            urlUpdateTimer
        );

        urlUpdateTimer = null;

        try {
            const navigatedDocument =
                Storage.loadDocumentFromUrl();

            applyDocument(
                navigatedDocument
            );
        } catch (error) {
            handleApplicationError(
                error
            );
        }
    }

    // =========================================================================
    // Visibility and lifecycle
    // =========================================================================

    /**
     * Flushes pending changes when the page becomes hidden.
     */
    function handleVisibilityChange() {
        if (
            document.visibilityState ===
            "hidden"
        ) {
            flushPendingUrlUpdate();
        }
    }

    // =========================================================================
    // Error handling
    // =========================================================================

    /**
     * Handles application-level errors.
     *
     * @param {*} error
     */
    function handleApplicationError(error) {
        const normalizedError =
            normalizeError(error);

        console.error(
            normalizedError
        );

        UI.showError(
            normalizedError
        );
    }

    /**
     * Handles initialization failures.
     *
     * @param {*} error
     */
    function handleFatalInitializationError(
        error
    ) {
        const normalizedError =
            normalizeError(error);

        console.error(
            normalizedError
        );

        try {
            UI.showError(
                normalizedError
            );
        } catch (uiError) {
            window.alert(
                normalizedError.message
            );
        }
    }

    /**
     * Handles uncaught browser errors.
     *
     * @param {ErrorEvent} event
     */
    function handleWindowError(event) {
        if (!event.error) {
            return;
        }

        handleApplicationError(
            event.error
        );
    }

    /**
     * Handles unhandled Promise rejections.
     *
     * @param {PromiseRejectionEvent} event
     */
    function handleUnhandledRejection(
        event
    ) {
        handleApplicationError(
            event.reason
        );
    }

    /**
     * Converts unknown error values into Error objects.
     *
     * @param {*} value
     * @returns {Error}
     */
    function normalizeError(value) {
        if (value instanceof Error) {
            return value;
        }

        if (
            value &&
            typeof value === "object" &&
            typeof value.message ===
                "string"
        ) {
            return new Error(
                value.message
            );
        }

        return new Error(
            String(
                value ||
                "Something went wrong."
            )
        );
    }

    // =========================================================================
    // Start application
    // =========================================================================

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            initialize,
            {
                once: true
            }
        );
    } else {
        initialize();
    }
})();
