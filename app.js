/**
 * Note-U
 * Version: 0.2.0
 *
 * Application controller.
 *
 * This module is responsible for:
 * - loading the document from the current URL;
 * - initializing the editor and interface;
 * - combining editor content with document metadata;
 * - saving changes back into the URL;
 * - creating shareable links;
 * - creating new notes;
 * - handling browser history navigation;
 * - recovering from invalid document data.
 */

(function () {
    "use strict";

    // =========================================================================
    // Constants
    // =========================================================================

    const SAVE_DELAY = 300;
    const HISTORY_LOAD_DELAY = 0;

    // =========================================================================
    // Internal state
    // =========================================================================

    let currentDocument = null;

    let saveTimer = null;
    let historyLoadTimer = null;

    let isInitialized = false;
    let isApplyingExternalDocument = false;
    let isSaving = false;

    let lastSavedUrl = "";
    let lastSavedDocumentSignature = "";

    // =========================================================================
    // Application startup
    // =========================================================================

    /**
     * Starts Note-U after the document is ready.
     */
    function start() {
        try {
            validateDependencies();

            currentDocument =
                window.NoteUStorage.loadDocumentFromUrl();

            initializeEditor();
            initializeInterface();
            bindApplicationEvents();

            synchronizeApplicationDocument();
            updateSavedState();

            isInitialized = true;

            window.NoteUUI.setLoading(false);
        } catch (error) {
            handleStartupError(error);
        }
    }

    /**
     * Validates required global modules and DOM elements.
     */
    function validateDependencies() {
        const missingDependencies = [];

        if (!window.NoteUStorage) {
            missingDependencies.push("NoteUStorage");
        }

        if (!window.NoteUEditor) {
            missingDependencies.push("NoteUEditor");
        }

        if (!window.NoteUUI) {
            missingDependencies.push("NoteUUI");
        }

        if (missingDependencies.length > 0) {
            throw new Error(
                `Note-U is missing required modules: ${missingDependencies.join(", ")}`
            );
        }

        const requiredElements = {
            editor:
                document.getElementById("editor"),

            blockList:
                document.getElementById("block-list"),

            blockTemplate:
                document.getElementById("block-template")
        };

        const missingElements =
            Object.entries(requiredElements)
                .filter(([, value]) => !value)
                .map(([name]) => name);

        if (missingElements.length > 0) {
            throw new Error(
                `Note-U is missing required document elements: ${missingElements.join(", ")}`
            );
        }
    }

    /**
     * Initializes the block editor.
     */
    function initializeEditor() {
        const editorRoot =
            document.getElementById("editor");

        const blockListElement =
            document.getElementById("block-list");

        const blockTemplate =
            document.getElementById("block-template");

        window.NoteUEditor.initialize({
            editorRoot,
            blockListElement,
            blockTemplate,
            documentModel: currentDocument,
            onChange: handleEditorChange
        });
    }

    /**
     * Initializes the interface controller.
     */
    function initializeInterface() {
        window.NoteUUI.initialize({
            documentModel: currentDocument,

            onDocumentChange:
                handleInterfaceDocumentChange,

            onNewNote:
                createNewNote,

            onCopyLink:
                createCurrentDocumentUrl
        });
    }

    /**
     * Registers application-level events.
     */
    function bindApplicationEvents() {
        window.addEventListener(
            "popstate",
            handleHistoryNavigation
        );

        window.addEventListener(
            "hashchange",
            handleHistoryNavigation
        );

        window.addEventListener(
            "beforeunload",
            handleBeforeUnload
        );

        document.addEventListener(
            "visibilitychange",
            handleVisibilityChange
        );
    }

    // =========================================================================
    // Change handling
    // =========================================================================

    /**
     * Handles editor content changes.
     *
     * @param {Object} editorDocument
     */
    function handleEditorChange(editorDocument) {
        if (isApplyingExternalDocument) {
            return;
        }

        try {
            const metadataDocument =
                window.NoteUUI.getDocument();

            currentDocument =
                window.NoteUStorage.normalizeDocument({
                    ...editorDocument,
                    title: metadataDocument.title,
                    icon: metadataDocument.icon
                });

            scheduleSave();
        } catch (error) {
            handleSaveError(
                error,
                "The editor change could not be processed"
            );
        }
    }

    /**
     * Handles title and icon changes.
     *
     * @param {Object} interfaceDocument
     */
    function handleInterfaceDocumentChange(
        interfaceDocument
    ) {
        if (isApplyingExternalDocument) {
            return;
        }

        try {
            const editorDocument =
                window.NoteUEditor.getDocument();

            currentDocument =
                window.NoteUStorage.normalizeDocument({
                    ...editorDocument,
                    title: interfaceDocument.title,
                    icon: interfaceDocument.icon
                });

            scheduleSave();
        } catch (error) {
            handleSaveError(
                error,
                "The note metadata could not be processed"
            );
        }
    }

    /**
     * Combines the latest editor content and interface metadata.
     *
     * @returns {Object}
     */
    function synchronizeApplicationDocument() {
        const editorDocument =
            window.NoteUEditor.getDocument();

        const interfaceDocument =
            window.NoteUUI.getDocument();

        currentDocument =
            window.NoteUStorage.normalizeDocument({
                ...editorDocument,
                title: interfaceDocument.title,
                icon: interfaceDocument.icon
            });

        return currentDocument;
    }

    // =========================================================================
    // Saving
    // =========================================================================

    /**
     * Schedules an automatic URL save.
     */
    function scheduleSave() {
        if (
            !isInitialized ||
            isApplyingExternalDocument
        ) {
            return;
        }

        clearTimeout(saveTimer);

        window.NoteUUI.showSavingStatus();

        saveTimer = window.setTimeout(
            saveCurrentDocument,
            SAVE_DELAY
        );
    }

    /**
     * Saves the current document into the browser URL.
     *
     * @param {Object} [options]
     * @param {boolean} [options.force]
     * @returns {string}
     */
    function saveCurrentDocument(options = {}) {
        if (isApplyingExternalDocument) {
            return window.location.href;
        }

        clearTimeout(saveTimer);
        saveTimer = null;

        if (isSaving) {
            return window.location.href;
        }

        isSaving = true;

        try {
            synchronizeApplicationDocument();

            const documentSignature =
                createDocumentSignature(
                    currentDocument
                );

            if (
                !options.force &&
                documentSignature ===
                    lastSavedDocumentSignature
            ) {
                window.NoteUUI.showSavedStatus();

                return (
                    lastSavedUrl ||
                    window.location.href
                );
            }

            const nextUrl =
                window.NoteUStorage.writeDocumentToUrl(
                    currentDocument,
                    {
                        replace: true
                    }
                );

            if (
                typeof nextUrl !== "string" ||
                nextUrl.length === 0
            ) {
                throw new Error(
                    "The storage module returned an invalid URL."
                );
            }

            lastSavedUrl = nextUrl;

            lastSavedDocumentSignature =
                documentSignature;

            window.NoteUUI.showSavedStatus();

            return nextUrl;
        } catch (error) {
            handleSaveError(
                error,
                "Save failed"
            );

            return window.location.href;
        } finally {
            isSaving = false;
        }
    }

    /**
     * Returns a shareable URL for the latest document state.
     *
     * @returns {string}
     */
    function createCurrentDocumentUrl() {
        clearTimeout(saveTimer);
        saveTimer = null;

        try {
            synchronizeApplicationDocument();

            const url =
                window.NoteUStorage.createDocumentUrl(
                    currentDocument
                );

            if (
                typeof url !== "string" ||
                url.length === 0
            ) {
                throw new Error(
                    "The storage module returned an invalid share URL."
                );
            }

            const documentSignature =
                createDocumentSignature(
                    currentDocument
                );

            if (url !== window.location.href) {
                window.history.replaceState(
                    {
                        noteU: true
                    },
                    "",
                    url
                );
            }

            lastSavedUrl = url;

            lastSavedDocumentSignature =
                documentSignature;

            window.NoteUUI.showSavedStatus();

            return url;
        } catch (error) {
            handleSaveError(
                error,
                "The share link could not be created"
            );

            throw error;
        }
    }

    /**
     * Creates a stable signature for change detection.
     *
     * @param {Object} documentModel
     * @returns {string}
     */
    function createDocumentSignature(
        documentModel
    ) {
        const normalizedDocument =
            window.NoteUStorage.normalizeDocument(
                documentModel
            );

        return JSON.stringify(
            normalizedDocument
        );
    }

    /**
     * Updates internal information about the saved state.
     */
    function updateSavedState() {
        lastSavedUrl =
            window.location.href;

        lastSavedDocumentSignature =
            createDocumentSignature(
                currentDocument
            );
    }

    /**
     * Displays and logs a save-related error.
     *
     * @param {*} error
     * @param {string} fallbackMessage
     */
    function handleSaveError(
        error,
        fallbackMessage
    ) {
        console.error(
            "Note-U save error:",
            error
        );

        const errorMessage =
            error instanceof Error &&
            error.message
                ? error.message
                : fallbackMessage;

        const visibleMessage =
            errorMessage.length <= 80
                ? errorMessage
                : fallbackMessage;

        window.NoteUUI.showSaveError(
            visibleMessage
        );
    }

    // =========================================================================
    // New note
    // =========================================================================

    /**
     * Creates and displays a new empty note.
     */
    function createNewNote() {
        clearTimeout(saveTimer);
        saveTimer = null;

        const nextDocument =
            window.NoteUStorage.createDocument();

        isApplyingExternalDocument = true;

        try {
            currentDocument = nextDocument;

            window.NoteUEditor.setDocument(
                nextDocument
            );

            window.NoteUUI.setDocument(
                nextDocument
            );

            const nextUrl =
                window.NoteUStorage.clearDocumentFromUrl({
                    replace: false
                });

            lastSavedUrl = nextUrl;

            lastSavedDocumentSignature =
                createDocumentSignature(
                    nextDocument
                );

            window.NoteUUI.showSavedStatus();

            requestAnimationFrame(() => {
                const titleInput =
                    document.getElementById(
                        "document-title"
                    );

                if (
                    titleInput instanceof
                    HTMLTextAreaElement
                ) {
                    titleInput.focus();
                    titleInput.select();
                }
            });
        } catch (error) {
            console.error(
                "Note-U could not create a new note.",
                error
            );

            window.NoteUUI.showToast(
                "The new note could not be created",
                {
                    type: "error"
                }
            );
        } finally {
            isApplyingExternalDocument = false;
        }
    }

    // =========================================================================
    // Browser history
    // =========================================================================

    /**
     * Handles browser back and forward navigation.
     */
    function handleHistoryNavigation() {
        clearTimeout(historyLoadTimer);

        historyLoadTimer = window.setTimeout(
            loadDocumentFromCurrentUrl,
            HISTORY_LOAD_DELAY
        );
    }

    /**
     * Loads and applies the document in the current URL.
     */
    function loadDocumentFromCurrentUrl() {
        if (!isInitialized) {
            return;
        }

        clearTimeout(saveTimer);
        saveTimer = null;

        try {
            const nextDocument =
                window.NoteUStorage.loadDocumentFromUrl();

            const nextSignature =
                createDocumentSignature(
                    nextDocument
                );

            const currentSignature =
                createDocumentSignature(
                    currentDocument
                );

            if (
                nextSignature ===
                currentSignature
            ) {
                updateSavedState();
                return;
            }

            isApplyingExternalDocument = true;

            currentDocument = nextDocument;

            window.NoteUEditor.setDocument(
                nextDocument
            );

            window.NoteUUI.setDocument(
                nextDocument
            );

            updateSavedState();

            window.NoteUUI.showToast(
                "Note loaded from link"
            );
        } catch (error) {
            console.error(
                "Note-U could not load the document from the current URL.",
                error
            );

            window.NoteUUI.showToast(
                "The note in this link could not be loaded",
                {
                    type: "error"
                }
            );
        } finally {
            isApplyingExternalDocument = false;
        }
    }

    // =========================================================================
    // Page lifecycle
    // =========================================================================

    /**
     * Saves pending changes before the page closes.
     */
    function handleBeforeUnload() {
        if (!saveTimer) {
            return;
        }

        saveCurrentDocument({
            force: true
        });
    }

    /**
     * Saves pending changes when the page becomes hidden.
     */
    function handleVisibilityChange() {
        if (
            document.visibilityState === "hidden" &&
            saveTimer
        ) {
            saveCurrentDocument({
                force: true
            });
        }
    }

    // =========================================================================
    // Error handling
    // =========================================================================

    /**
     * Handles fatal startup errors.
     *
     * @param {*} error
     */
    function handleStartupError(error) {
        console.error(
            "Note-U could not start.",
            error
        );

        const app =
            document.getElementById("app");

        if (app) {
            app.dataset.loading = "false";
        }

        const editor =
            document.getElementById("editor");

        if (editor) {
            const errorMessage =
                document.createElement("div");

            errorMessage.setAttribute(
                "role",
                "alert"
            );

            errorMessage.style.padding =
                "20px";

            errorMessage.style.border =
                "1px solid #dfdfdc";

            errorMessage.style.borderRadius =
                "10px";

            errorMessage.style.background =
                "#ffffff";

            errorMessage.style.color =
                "#c64242";

            errorMessage.textContent =
                "Note-U could not start. Refresh the page or open a new note.";

            editor.replaceChildren(
                errorMessage
            );
        }
    }

    // =========================================================================
    // Public API
    // =========================================================================

    window.NoteUApp = Object.freeze({
        getDocument() {
            if (!isInitialized) {
                return null;
            }

            return window.NoteUStorage.cloneDocument(
                synchronizeApplicationDocument()
            );
        },

        save() {
            return saveCurrentDocument({
                force: true
            });
        },

        createNewNote,

        createCurrentDocumentUrl
    });

    // =========================================================================
    // Entry point
    // =========================================================================

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            start,
            {
                once: true
            }
        );
    } else {
        start();
    }
})();
