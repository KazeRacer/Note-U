/**
 * Note-U
 * Version: 0.1.0
 *
 * Main application controller.
 *
 * This module is responsible for:
 * - loading the document from the current URL;
 * - initializing the editor and user interface;
 * - keeping document metadata and blocks synchronized;
 * - saving changes back to the URL;
 * - creating new notes;
 * - handling browser navigation and hash changes;
 * - reporting application errors.
 */

(function () {
    "use strict";

    // =========================================================================
    // Constants
    // =========================================================================

    const SAVE_DELAY = 350;

    const URL_WARNING_LENGTH = 8000;
    const URL_CRITICAL_LENGTH = 24000;

    // =========================================================================
    // Internal state
    // =========================================================================

    let currentDocument = null;

    let saveTimer = null;
    let isInitialized = false;
    let isSaving = false;
    let isLoadingExternalDocument = false;

    let lastSavedSerialization = "";
    let lastUrlWarningLevel = "none";

    // =========================================================================
    // Application startup
    // =========================================================================

    /**
     * Starts Note-U after the DOM is ready.
     */
    function start() {
        try {
            validateModules();

            currentDocument =
                window.NoteUStorage.loadDocumentFromUrl();

            initializeUserInterface();
            initializeEditor();

            synchronizeDocumentFromModules();
            saveCurrentDocumentImmediately();

            bindApplicationEvents();

            window.NoteUUI.setLoading(false);
            window.NoteUUI.showSavedStatus();

            isInitialized = true;
        } catch (error) {
            handleFatalError(error);
        }
    }

    /**
     * Checks that all required application modules are available.
     */
    function validateModules() {
        const missingModules = [];

        if (!window.NoteUStorage) {
            missingModules.push("NoteUStorage");
        }

        if (!window.NoteUEditor) {
            missingModules.push("NoteUEditor");
        }

        if (!window.NoteUUI) {
            missingModules.push("NoteUUI");
        }

        if (missingModules.length > 0) {
            throw new Error(
                `Note-U could not start because these modules are missing: ${missingModules.join(", ")}`
            );
        }
    }

    /**
     * Initializes the user interface module.
     */
    function initializeUserInterface() {
        window.NoteUUI.initialize({
            documentModel: currentDocument,

            onDocumentChange:
                handleUserInterfaceChange,

            onNewNote:
                createNewNote,

            onCopyLink:
                prepareShareableUrl
        });
    }

    /**
     * Initializes the editor module.
     */
    function initializeEditor() {
        const editorRoot =
            document.getElementById("editor");

        const blockListElement =
            document.getElementById("block-list");

        const paragraphTemplate =
            document.getElementById(
                "paragraph-block-template"
            );

        window.NoteUEditor.initialize({
            editorRoot,
            blockListElement,
            paragraphTemplate,
            documentModel: currentDocument,
            onChange: handleEditorChange
        });
    }

    // =========================================================================
    // Application events
    // =========================================================================

    /**
     * Registers global application event listeners.
     */
    function bindApplicationEvents() {
        window.addEventListener(
            "hashchange",
            handleHashChange
        );

        window.addEventListener(
            "popstate",
            handleBrowserNavigation
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
    // Document synchronization
    // =========================================================================

    /**
     * Handles changes originating from the block editor.
     *
     * @param {Object} editorDocument
     * @param {Object} changeInformation
     */
    function handleEditorChange(
        editorDocument,
        changeInformation
    ) {
        if (isLoadingExternalDocument) {
            return;
        }

        const interfaceDocument =
            window.NoteUUI.getDocument();

        currentDocument =
            window.NoteUStorage.normalizeDocument({
                ...editorDocument,
                title: interfaceDocument.title,
                icon: interfaceDocument.icon
            });

        scheduleSave(
            changeInformation?.reason || "editor-change"
        );
    }

    /**
     * Handles changes originating from the user interface.
     *
     * @param {Object} interfaceDocument
     * @param {Object} changeInformation
     */
    function handleUserInterfaceChange(
        interfaceDocument,
        changeInformation
    ) {
        if (isLoadingExternalDocument) {
            return;
        }

        const editorDocument =
            window.NoteUEditor.getDocument();

        currentDocument =
            window.NoteUStorage.normalizeDocument({
                ...interfaceDocument,
                blocks: editorDocument.blocks
            });

        scheduleSave(
            changeInformation?.reason || "interface-change"
        );
    }

    /**
     * Rebuilds the current document from both application modules.
     *
     * The UI owns title and icon.
     * The editor owns the block tree.
     *
     * @returns {Object}
     */
    function synchronizeDocumentFromModules() {
        const interfaceDocument =
            window.NoteUUI.getDocument();

        const editorDocument =
            window.NoteUEditor.getDocument();

        currentDocument =
            window.NoteUStorage.normalizeDocument({
                version: currentDocument?.version,
                title: interfaceDocument.title,
                icon: interfaceDocument.icon,
                blocks: editorDocument.blocks
            });

        return currentDocument;
    }

    /**
     * Applies a complete document to all application modules.
     *
     * @param {*} nextDocument
     * @param {Object} [options]
     * @param {boolean} [options.focusEditor]
     */
    function applyDocument(
        nextDocument,
        options = {}
    ) {
        isLoadingExternalDocument = true;

        try {
            currentDocument =
                window.NoteUStorage.normalizeDocument(
                    nextDocument
                );

            window.NoteUUI.setDocument(
                currentDocument
            );

            window.NoteUEditor.setDocument(
                currentDocument
            );

            if (options.focusEditor) {
                requestAnimationFrame(() => {
                    window.NoteUEditor.focusFirstBlock();
                });
            }
        } finally {
            isLoadingExternalDocument = false;
        }
    }

    // =========================================================================
    // Saving
    // =========================================================================

    /**
     * Schedules a document save.
     *
     * @param {string} reason
     */
    function scheduleSave(reason = "change") {
        if (isLoadingExternalDocument) {
            return;
        }

        clearTimeout(saveTimer);

        window.NoteUUI.showSavingStatus();

        saveTimer = window.setTimeout(
            () => {
                saveCurrentDocument(reason);
            },
            SAVE_DELAY
        );
    }

    /**
     * Saves the current document to the URL.
     *
     * @param {string} reason
     * @returns {string}
     */
    function saveCurrentDocument(reason = "change") {
        if (isSaving) {
            return window.location.href;
        }

        isSaving = true;

        try {
            synchronizeDocumentFromModules();

            const serializedDocument =
                window.NoteUStorage.serializeDocument(
                    currentDocument
                );

            if (
                serializedDocument !==
                lastSavedSerialization
            ) {
                window.NoteUStorage.saveDocumentToUrl(
                    currentDocument
                );

                lastSavedSerialization =
                    serializedDocument;
            }

            checkUrlSize();

            window.NoteUUI.showSavedStatus();

            dispatchDocumentSavedEvent(reason);

            return window.location.href;
        } catch (error) {
            console.error(
                "Note-U could not save the document.",
                error
            );

            window.NoteUUI.showSaveError();

            window.NoteUUI.showToast(
                "Impossibile salvare la nota nel link",
                {
                    type: "error"
                }
            );

            throw error;
        } finally {
            isSaving = false;
        }
    }

    /**
     * Saves immediately and cancels any pending delayed save.
     *
     * @returns {string}
     */
    function saveCurrentDocumentImmediately() {
        clearTimeout(saveTimer);
        saveTimer = null;

        return saveCurrentDocument(
            "immediate-save"
        );
    }

    /**
     * Ensures that the shareable URL contains the latest changes.
     *
     * @returns {string}
     */
    function prepareShareableUrl() {
        saveCurrentDocumentImmediately();

        return window.NoteUStorage.createShareableUrl(
            currentDocument
        );
    }

    /**
     * Emits an application event after a successful save.
     *
     * @param {string} reason
     */
    function dispatchDocumentSavedEvent(reason) {
        window.dispatchEvent(
            new CustomEvent(
                "noteu:documentsaved",
                {
                    detail: {
                        reason,
                        document:
                            window.NoteUStorage.cloneDocument(
                                currentDocument
                            ),
                        url: window.location.href
                    }
                }
            )
        );
    }

    // =========================================================================
    // URL size monitoring
    // =========================================================================

    /**
     * Checks whether the generated URL is becoming too large.
     */
    function checkUrlSize() {
        const storageInformation =
            window.NoteUStorage.getDocumentStorageInfo(
                currentDocument
            );

        let warningLevel = "none";

        if (
            storageInformation.urlLength >=
            URL_CRITICAL_LENGTH
        ) {
            warningLevel = "critical";
        } else if (
            storageInformation.urlLength >=
            URL_WARNING_LENGTH
        ) {
            warningLevel = "warning";
        }

        if (warningLevel === lastUrlWarningLevel) {
            return;
        }

        lastUrlWarningLevel = warningLevel;

        if (warningLevel === "warning") {
            window.NoteUUI.showToast(
                "La nota sta diventando molto grande. Alcuni servizi potrebbero non accettare il link completo.",
                {
                    duration: 5200
                }
            );
        }

        if (warningLevel === "critical") {
            window.NoteUUI.showToast(
                "Il link della nota è molto lungo e potrebbe non funzionare in tutti i browser o servizi.",
                {
                    type: "error",
                    duration: 6500
                }
            );
        }
    }

    // =========================================================================
    // New note
    // =========================================================================

    /**
     * Creates and opens a new empty note.
     */
    function createNewNote() {
        clearTimeout(saveTimer);
        saveTimer = null;

        const newDocument =
            window.NoteUStorage.createDefaultDocument();

        window.NoteUStorage.clearDocumentFromUrl();

        lastSavedSerialization = "";
        lastUrlWarningLevel = "none";

        applyDocument(
            newDocument,
            {
                focusEditor: false
            }
        );

        saveCurrentDocumentImmediately();

        window.scrollTo({
            top: 0,
            behavior: getPreferredScrollBehavior()
        });

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

        window.NoteUUI.showToast(
            "Nuova nota creata"
        );
    }

    // =========================================================================
    // Browser navigation
    // =========================================================================

    /**
     * Handles changes to the URL hash.
     */
    function handleHashChange() {
        loadDocumentFromCurrentUrl();
    }

    /**
     * Handles browser history navigation.
     */
    function handleBrowserNavigation() {
        loadDocumentFromCurrentUrl();
    }

    /**
     * Loads the document represented by the current URL.
     */
    function loadDocumentFromCurrentUrl() {
        if (!isInitialized || isSaving) {
            return;
        }

        const serializedDocument =
            getCurrentSerializedDocument();

        if (
            serializedDocument ===
            lastSavedSerialization
        ) {
            return;
        }

        clearTimeout(saveTimer);
        saveTimer = null;

        try {
            const nextDocument =
                window.NoteUStorage.loadDocumentFromUrl();

            applyDocument(nextDocument);

            lastSavedSerialization =
                window.NoteUStorage.serializeDocument(
                    nextDocument
                );

            lastUrlWarningLevel = "none";

            window.NoteUUI.showSavedStatus();
            checkUrlSize();
        } catch (error) {
            console.error(
                "Note-U could not load the document from the current URL.",
                error
            );

            window.NoteUUI.showToast(
                "Il link non contiene una nota valida",
                {
                    type: "error"
                }
            );
        }
    }

    /**
     * Returns the serialized document contained in the current URL.
     *
     * @returns {string}
     */
    function getCurrentSerializedDocument() {
        const hash = window.location.hash;
        const prefix = "#note=";

        if (!hash.startsWith(prefix)) {
            return "";
        }

        return hash.slice(prefix.length);
    }

    // =========================================================================
    // Page lifecycle
    // =========================================================================

    /**
     * Flushes pending changes before the page closes.
     */
    function handleBeforeUnload() {
        if (!saveTimer) {
            return;
        }

        try {
            saveCurrentDocumentImmediately();
        } catch (error) {
            console.error(
                "Note-U could not complete the final save.",
                error
            );
        }
    }

    /**
     * Flushes pending changes when the page becomes hidden.
     */
    function handleVisibilityChange() {
        if (
            document.visibilityState !== "hidden" ||
            !saveTimer
        ) {
            return;
        }

        try {
            saveCurrentDocumentImmediately();
        } catch (error) {
            console.error(
                "Note-U could not save before the page became hidden.",
                error
            );
        }
    }

    // =========================================================================
    // Error handling
    // =========================================================================

    /**
     * Handles an unrecoverable startup error.
     *
     * @param {*} error
     */
    function handleFatalError(error) {
        console.error(
            "Note-U encountered a fatal startup error.",
            error
        );

        const appElement =
            document.getElementById("app");

        if (appElement) {
            appElement.dataset.loading = "false";
        }

        const errorMessage =
            document.createElement("div");

        errorMessage.setAttribute(
            "role",
            "alert"
        );

        errorMessage.style.maxWidth = "680px";
        errorMessage.style.margin = "80px auto";
        errorMessage.style.padding = "24px";
        errorMessage.style.border =
            "1px solid rgba(197, 65, 65, 0.25)";
        errorMessage.style.borderRadius = "12px";
        errorMessage.style.background = "#ffffff";
        errorMessage.style.color = "#7f2525";
        errorMessage.style.fontFamily =
            "system-ui, sans-serif";
        errorMessage.style.lineHeight = "1.5";

        errorMessage.innerHTML = [
            "<strong>Note-U non può essere avviato.</strong>",
            "<br>",
            "Controlla che tutti i file del progetto siano presenti e ricarica la pagina."
        ].join("");

        document.body.appendChild(errorMessage);
    }

    // =========================================================================
    // Utility helpers
    // =========================================================================

    /**
     * Returns the preferred scroll behavior.
     *
     * @returns {"auto"|"smooth"}
     */
    function getPreferredScrollBehavior() {
        const reducedMotionQuery =
            window.matchMedia(
                "(prefers-reduced-motion: reduce)"
            );

        return reducedMotionQuery.matches
            ? "auto"
            : "smooth";
    }

    // =========================================================================
    // Public application API
    // =========================================================================

    window.NoteUApp = Object.freeze({
        getDocument() {
            if (!currentDocument) {
                return null;
            }

            return window.NoteUStorage.cloneDocument(
                currentDocument
            );
        },

        save: saveCurrentDocumentImmediately,
        createNewNote,
        prepareShareableUrl
    });

    // =========================================================================
    // Start
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
