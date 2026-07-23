/**
 * Note-U
 * Version: 0.3.0
 *
 * User interface controller.
 *
 * Responsibilities:
 * - manage the note title and icon;
 * - update the browser tab title and favicon;
 * - manage the top toolbar;
 * - manage the icon picker and more-actions menu;
 * - copy the current note link;
 * - display URL size information;
 * - display toast notifications and errors;
 * - resize the title field automatically;
 * - expose UI events to app.js.
 */

(function () {
    "use strict";

    const Storage = window.NoteUStorage;

    if (!Storage) {
        throw new Error(
            "NoteUStorage must be loaded before ui.js."
        );
    }

    // =========================================================================
    // Constants
    // =========================================================================

    const DEFAULT_BROWSER_TITLE = "Note";

    const URL_SIZE_WARNING_THRESHOLD = 6000;
    const URL_SIZE_DANGER_THRESHOLD = 7500;

    const TOAST_DURATION = 2600;
    const COPY_CONFIRMATION_DURATION = 1500;

    // =========================================================================
    // Interface elements
    // =========================================================================

    let titleElement = null;

    let iconButtonElement = null;
    let iconElement = null;
    let faviconElement = null;

    let newNoteButtonElement = null;
    let copyLinkButtonElement = null;
    let copyLinkButtonLabelElement = null;
    let addBlockButtonElement = null;

    let moreActionsButtonElement = null;
    let moreActionsMenuElement = null;

    let iconPickerElement = null;
    let iconPickerGridElement = null;

    let urlSizeIndicatorElement = null;
    let toastRegionElement = null;

    let errorDialogElement = null;
    let errorDialogMessageElement = null;

    // =========================================================================
    // State
    // =========================================================================

    let documentModel = null;

    let titleChangeHandler = function () {};
    let iconChangeHandler = function () {};
    let newNoteHandler = function () {};
    let addBlockHandler = function () {};
    let copyLinkHandler = null;
    let getDocumentUrlHandler = null;

    let copyButtonTimer = null;

    let isInitialized = false;

    // =========================================================================
    // Initialization
    // =========================================================================

    /**
     * Initializes the user interface.
     *
     * @param {Object} options
     * @param {Object} options.document
     * @param {Function} [options.onTitleChange]
     * @param {Function} [options.onIconChange]
     * @param {Function} [options.onNewNote]
     * @param {Function} [options.onAddBlock]
     * @param {Function} [options.onCopyLink]
     * @param {Function} [options.getDocumentUrl]
     * @returns {Object}
     */
    function initialize(options) {
        cacheElements();

        documentModel =
            Storage.normalizeDocument(
                options.document
            );

        titleChangeHandler =
            typeof options.onTitleChange === "function"
                ? options.onTitleChange
                : function () {};

        iconChangeHandler =
            typeof options.onIconChange === "function"
                ? options.onIconChange
                : function () {};

        newNoteHandler =
            typeof options.onNewNote === "function"
                ? options.onNewNote
                : function () {};

        addBlockHandler =
            typeof options.onAddBlock === "function"
                ? options.onAddBlock
                : function () {};

        copyLinkHandler =
            typeof options.onCopyLink === "function"
                ? options.onCopyLink
                : null;

        getDocumentUrlHandler =
            typeof options.getDocumentUrl === "function"
                ? options.getDocumentUrl
                : null;

        if (!isInitialized) {
            bindEvents();
            isInitialized = true;
        }

        renderDocumentHeader();

        return publicApi;
    }

    /**
     * Finds and validates the required interface elements.
     */
    function cacheElements() {
        titleElement =
            document.getElementById(
                "note-title"
            );

        iconButtonElement =
            document.getElementById(
                "note-icon-button"
            );

        iconElement =
            document.getElementById(
                "note-icon"
            );

        faviconElement =
            document.getElementById(
                "favicon"
            );

        newNoteButtonElement =
            document.getElementById(
                "new-note-button"
            );

        copyLinkButtonElement =
            document.getElementById(
                "copy-link-button"
            );

        copyLinkButtonLabelElement =
            document.getElementById(
                "copy-link-button-label"
            );

        addBlockButtonElement =
            document.getElementById(
                "add-block-button"
            );

        moreActionsButtonElement =
            document.getElementById(
                "more-actions-button"
            );

        moreActionsMenuElement =
            document.getElementById(
                "more-actions-menu"
            );

        iconPickerElement =
            document.getElementById(
                "icon-picker"
            );

        iconPickerGridElement =
            document.getElementById(
                "icon-picker-grid"
            );

        urlSizeIndicatorElement =
            document.getElementById(
                "url-size-indicator"
            );

        toastRegionElement =
            document.getElementById(
                "toast-region"
            );

        errorDialogElement =
            document.getElementById(
                "error-dialog"
            );

        errorDialogMessageElement =
            document.getElementById(
                "error-dialog-message"
            );

        const requiredElements = [
            titleElement,
            iconButtonElement,
            iconElement,
            faviconElement,
            newNoteButtonElement,
            copyLinkButtonElement,
            addBlockButtonElement,
            moreActionsButtonElement,
            moreActionsMenuElement,
            iconPickerElement,
            iconPickerGridElement,
            urlSizeIndicatorElement,
            toastRegionElement
        ];

        if (
            requiredElements.some(
                element => !element
            )
        ) {
            throw new Error(
                "The user interface is incomplete."
            );
        }
    }

    // =========================================================================
    // Event binding
    // =========================================================================

    /**
     * Binds all interface events.
     */
    function bindEvents() {
        titleElement.addEventListener(
            "input",
            handleTitleInput
        );

        titleElement.addEventListener(
            "keydown",
            handleTitleKeyDown
        );

        titleElement.addEventListener(
            "paste",
            handleTitlePaste
        );

        iconButtonElement.addEventListener(
            "click",
            toggleIconPicker
        );

        iconPickerGridElement.addEventListener(
            "click",
            handleIconPickerClick
        );

        newNoteButtonElement.addEventListener(
            "click",
            requestNewNote
        );

        copyLinkButtonElement.addEventListener(
            "click",
            copyCurrentLink
        );

        addBlockButtonElement.addEventListener(
            "click",
            () => {
                closeMenus();
                addBlockHandler();
            }
        );

        moreActionsButtonElement.addEventListener(
            "click",
            toggleMoreActionsMenu
        );

        moreActionsMenuElement.addEventListener(
            "click",
            handleMoreActionsClick
        );

        document.addEventListener(
            "pointerdown",
            handleDocumentPointerDown
        );

        document.addEventListener(
            "keydown",
            handleDocumentKeyDown
        );

        window.addEventListener(
            "resize",
            closeMenus
        );

        window.addEventListener(
            "scroll",
            closeMenus,
            true
        );
    }

    // =========================================================================
    // Document header
    // =========================================================================

    /**
     * Renders the note title, icon, browser title and favicon.
     */
    function renderDocumentHeader() {
        titleElement.value =
            documentModel.title;

        iconElement.textContent =
            documentModel.icon;

        resizeTitle();

        updateBrowserTitle(
            documentModel.title
        );

        updateFavicon(
            documentModel.icon
        );
    }

    /**
     * Updates the UI with a new document.
     *
     * @param {*} nextDocument
     */
    function setDocument(nextDocument) {
        documentModel =
            Storage.normalizeDocument(
                nextDocument
            );

        renderDocumentHeader();
        closeMenus();
    }

    /**
     * Returns the current UI title and icon.
     *
     * @returns {{title:string, icon:string}}
     */
    function getHeaderData() {
        return {
            title:
                normalizeTitle(
                    titleElement.value
                ),

            icon:
                normalizeIcon(
                    iconElement.textContent
                )
        };
    }

    // =========================================================================
    // Title
    // =========================================================================

    /**
     * Handles title changes.
     */
    function handleTitleInput() {
        resizeTitle();

        const title =
            normalizeTitle(
                titleElement.value
            );

        documentModel.title = title;

        updateBrowserTitle(title);

        titleChangeHandler(title);
    }

    /**
     * Handles title keyboard commands.
     *
     * @param {KeyboardEvent} event
     */
    function handleTitleKeyDown(event) {
        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {
            event.preventDefault();

            focusFirstEditorBlock();
            return;
        }

        if (
            event.key === "ArrowDown" &&
            isCaretAtEnd(titleElement)
        ) {
            event.preventDefault();

            focusFirstEditorBlock();
        }
    }

    /**
     * Converts pasted title content to plain single-line text.
     *
     * @param {ClipboardEvent} event
     */
    function handleTitlePaste(event) {
        const text =
            event.clipboardData?.getData(
                "text/plain"
            );

        if (typeof text !== "string") {
            return;
        }

        event.preventDefault();

        const normalizedText =
            text
                .replace(/\r\n?/g, "\n")
                .replace(/\n+/g, " ");

        insertTextIntoTextarea(
            titleElement,
            normalizedText
        );

        titleElement.dispatchEvent(
            new Event(
                "input",
                {
                    bubbles: true
                }
            )
        );
    }

    /**
     * Resizes the title textarea to fit its content.
     */
    function resizeTitle() {
        titleElement.style.height =
            "auto";

        titleElement.style.height =
            `${Math.max(
                52,
                titleElement.scrollHeight
            )}px`;
    }

    /**
     * Normalizes a title.
     *
     * Empty titles remain empty in the editor, but the browser tab receives
     * a safe fallback.
     *
     * @param {*} value
     * @returns {string}
     */
    function normalizeTitle(value) {
        return String(
            value ?? ""
        )
            .replace(/\r\n?/g, "\n")
            .replace(/\n+/g, " ")
            .trimStart();
    }

    /**
     * Updates the browser tab title.
     *
     * The icon and application name are deliberately excluded.
     *
     * @param {*} title
     */
    function updateBrowserTitle(title) {
        const normalizedTitle =
            String(title || "").trim();

        document.title =
            normalizedTitle ||
            DEFAULT_BROWSER_TITLE;
    }

    // =========================================================================
    // Icon and favicon
    // =========================================================================

    /**
     * Opens or closes the icon picker.
     *
     * @param {MouseEvent} event
     */
    function toggleIconPicker(event) {
        event.preventDefault();
        event.stopPropagation();

        const shouldOpen =
            iconPickerElement.hidden;

        closeMenus();

        if (shouldOpen) {
            iconPickerElement.hidden =
                false;

            iconButtonElement.setAttribute(
                "aria-expanded",
                "true"
            );

            positionPopoverNearElement(
                iconPickerElement,
                iconButtonElement,
                {
                    horizontal: "left",
                    vertical: "bottom"
                }
            );
        }
    }

    /**
     * Handles an icon selection.
     *
     * @param {MouseEvent} event
     */
    function handleIconPickerClick(event) {
        const button =
            event.target.closest(
                "[data-icon]"
            );

        if (!button) {
            return;
        }

        setIcon(
            button.dataset.icon
        );

        closeMenus();
    }

    /**
     * Sets the note icon.
     *
     * @param {*} icon
     */
    function setIcon(icon) {
        const normalizedIcon =
            normalizeIcon(icon);

        documentModel.icon =
            normalizedIcon;

        iconElement.textContent =
            normalizedIcon;

        updateFavicon(
            normalizedIcon
        );

        iconChangeHandler(
            normalizedIcon
        );
    }

    /**
     * Resets the note icon.
     */
    function resetIcon() {
        setIcon(
            Storage.DEFAULT_ICON
        );

        showToast(
            "Icon reset."
        );
    }

    /**
     * Normalizes an icon value.
     *
     * @param {*} value
     * @returns {string}
     */
    function normalizeIcon(value) {
        const icon =
            String(value || "").trim();

        return icon ||
            Storage.DEFAULT_ICON;
    }

    /**
     * Updates the browser favicon using the note icon.
     *
     * @param {*} icon
     */
    function updateFavicon(icon) {
        const normalizedIcon =
            normalizeIcon(icon);

        const svg = [
            "<svg",
            " xmlns='http://www.w3.org/2000/svg'",
            " viewBox='0 0 100 100'",
            ">",
            "<text",
            " x='50'",
            " y='50'",
            " text-anchor='middle'",
            " dominant-baseline='central'",
            " font-size='82'",
            ">",
            escapeXml(normalizedIcon),
            "</text>",
            "</svg>"
        ].join("");

        faviconElement.href =
            `data:image/svg+xml,${encodeURIComponent(
                svg
            )}`;
    }

    // =========================================================================
    // Toolbar actions
    // =========================================================================

    /**
     * Requests creation of a new note.
     */
    function requestNewNote() {
        closeMenus();
        newNoteHandler();
    }

    /**
     * Copies the current note link.
     */
    async function copyCurrentLink() {
        closeMenus();

        try {
            let url;

            if (copyLinkHandler) {
                url =
                    await copyLinkHandler();
            } else if (
                getDocumentUrlHandler
            ) {
                url =
                    await getDocumentUrlHandler();

                await writeTextToClipboard(
                    url
                );
            } else {
                url =
                    window.location.href;

                await writeTextToClipboard(
                    url
                );
            }

            showCopyConfirmation();

            showToast(
                "Note link copied."
            );

            return url;
        } catch (error) {
            showError(
                "The note link could not be copied."
            );

            return null;
        }
    }

    /**
     * Shows temporary confirmation text on the copy button.
     */
    function showCopyConfirmation() {
        window.clearTimeout(
            copyButtonTimer
        );

        if (copyLinkButtonLabelElement) {
            copyLinkButtonLabelElement.textContent =
                "Copied";
        }

        copyLinkButtonElement.classList.add(
            "is-copied"
        );

        copyButtonTimer =
            window.setTimeout(() => {
                if (
                    copyLinkButtonLabelElement
                ) {
                    copyLinkButtonLabelElement.textContent =
                        "Copy link";
                }

                copyLinkButtonElement.classList.remove(
                    "is-copied"
                );
            }, COPY_CONFIRMATION_DURATION);
    }

    /**
     * Opens or closes the more-actions menu.
     *
     * @param {MouseEvent} event
     */
    function toggleMoreActionsMenu(event) {
        event.preventDefault();
        event.stopPropagation();

        const shouldOpen =
            moreActionsMenuElement.hidden;

        closeMenus();

        if (shouldOpen) {
            moreActionsMenuElement.hidden =
                false;

            moreActionsButtonElement.setAttribute(
                "aria-expanded",
                "true"
            );

            positionPopoverNearElement(
                moreActionsMenuElement,
                moreActionsButtonElement,
                {
                    horizontal: "right",
                    vertical: "bottom"
                }
            );
        }
    }

    /**
     * Handles commands inside the more-actions menu.
     *
     * @param {MouseEvent} event
     */
    function handleMoreActionsClick(event) {
        const button =
            event.target.closest(
                "[data-note-action]"
            );

        if (!button) {
            return;
        }

        const action =
            button.dataset.noteAction;

        closeMenus();

        switch (action) {
            case "copy-link":
                copyCurrentLink();
                break;

            case "new-note":
                requestNewNote();
                break;

            case "reset-icon":
                resetIcon();
                break;

            default:
                break;
        }
    }

    // =========================================================================
    // URL size indicator
    // =========================================================================

    /**
     * Updates the link-size indicator.
     *
     * @param {string|number} value
     */
    function updateUrlSize(value) {
        let size;

        if (typeof value === "number") {
            size = value;
        } else {
            size =
                String(value || "").length;
        }

        urlSizeIndicatorElement.classList.remove(
            "is-warning",
            "is-danger"
        );

        if (!size) {
            urlSizeIndicatorElement.textContent =
                "";

            return;
        }

        const formattedSize =
            new Intl.NumberFormat(
                "en-US"
            ).format(size);

        if (
            size >=
            URL_SIZE_DANGER_THRESHOLD
        ) {
            urlSizeIndicatorElement.textContent =
                `${formattedSize} URL characters — the link may be too long for some browsers or services.`;

            urlSizeIndicatorElement.classList.add(
                "is-danger"
            );

            return;
        }

        if (
            size >=
            URL_SIZE_WARNING_THRESHOLD
        ) {
            urlSizeIndicatorElement.textContent =
                `${formattedSize} URL characters — the note is becoming large.`;

            urlSizeIndicatorElement.classList.add(
                "is-warning"
            );

            return;
        }

        urlSizeIndicatorElement.textContent =
            `${formattedSize} URL characters`;
    }

    /**
     * Clears the URL-size indicator.
     */
    function clearUrlSize() {
        updateUrlSize(0);
    }

    // =========================================================================
    // Toast notifications
    // =========================================================================

    /**
     * Displays a temporary toast notification.
     *
     * @param {string} message
     * @param {Object} [options]
     * @param {string} [options.type]
     * @param {number} [options.duration]
     * @returns {HTMLElement|null}
     */
    function showToast(
        message,
        options = {}
    ) {
        if (
            !toastRegionElement ||
            !message
        ) {
            return null;
        }

        const toast =
            document.createElement("div");

        toast.className = "toast";
        toast.setAttribute(
            "role",
            options.type === "error"
                ? "alert"
                : "status"
        );

        if (options.type === "error") {
            toast.classList.add(
                "toast--error"
            );
        }

        toast.textContent =
            String(message);

        toastRegionElement.appendChild(
            toast
        );

        const duration =
            Number.isFinite(
                options.duration
            )
                ? options.duration
                : TOAST_DURATION;

        window.setTimeout(() => {
            removeToast(toast);
        }, duration);

        return toast;
    }

    /**
     * Removes a toast with a small visual transition.
     *
     * @param {HTMLElement} toast
     */
    function removeToast(toast) {
        if (
            !toast ||
            !toast.isConnected
        ) {
            return;
        }

        toast.style.opacity = "0";
        toast.style.transform =
            "translateY(5px)";

        window.setTimeout(() => {
            toast.remove();
        }, 140);
    }

    // =========================================================================
    // Errors
    // =========================================================================

    /**
     * Displays an error to the user.
     *
     * @param {*} message
     */
    function showError(message) {
        const text =
            message instanceof Error
                ? message.message
                : String(
                    message ||
                    "Something went wrong."
                );

        if (
            errorDialogElement &&
            errorDialogMessageElement &&
            typeof errorDialogElement
                .showModal === "function"
        ) {
            errorDialogMessageElement.textContent =
                text;

            if (!errorDialogElement.open) {
                errorDialogElement.showModal();
            }

            return;
        }

        showToast(
            text,
            {
                type: "error",
                duration: 4200
            }
        );
    }

    /**
     * Closes the error dialog.
     */
    function closeError() {
        if (
            errorDialogElement?.open
        ) {
            errorDialogElement.close();
        }
    }

    // =========================================================================
    // Menus
    // =========================================================================

    /**
     * Handles pointer presses outside UI menus.
     *
     * @param {PointerEvent} event
     */
    function handleDocumentPointerDown(
        event
    ) {
        const insideUiMenu =
            event.target.closest(
                "#icon-picker, #more-actions-menu"
            );

        const onUiTrigger =
            event.target.closest(
                "#note-icon-button, #more-actions-button"
            );

        if (
            !insideUiMenu &&
            !onUiTrigger
        ) {
            closeMenus();
        }
    }

    /**
     * Handles global interface keyboard shortcuts.
     *
     * @param {KeyboardEvent} event
     */
    function handleDocumentKeyDown(event) {
        if (event.key === "Escape") {
            closeMenus();
            closeError();

            return;
        }

        const modifier =
            event.ctrlKey ||
            event.metaKey;

        if (
            modifier &&
            event.shiftKey &&
            event.key.toLowerCase() === "c"
        ) {
            event.preventDefault();
            copyCurrentLink();

            return;
        }

        if (
            modifier &&
            event.altKey &&
            event.key.toLowerCase() === "n"
        ) {
            event.preventDefault();
            requestNewNote();
        }
    }

    /**
     * Closes interface popovers.
     */
    function closeMenus() {
        if (iconPickerElement) {
            iconPickerElement.hidden =
                true;
        }

        if (moreActionsMenuElement) {
            moreActionsMenuElement.hidden =
                true;
        }

        iconButtonElement?.setAttribute(
            "aria-expanded",
            "false"
        );

        moreActionsButtonElement?.setAttribute(
            "aria-expanded",
            "false"
        );
    }

    // =========================================================================
    // Popover positioning
    // =========================================================================

    /**
     * Positions a popover near an element.
     *
     * @param {HTMLElement} popover
     * @param {HTMLElement} anchor
     * @param {Object} [options]
     * @param {string} [options.horizontal]
     * @param {string} [options.vertical]
     */
    function positionPopoverNearElement(
        popover,
        anchor,
        options = {}
    ) {
        popover.hidden = false;
        popover.style.left = "0px";
        popover.style.top = "0px";

        const anchorRect =
            anchor.getBoundingClientRect();

        const popoverRect =
            popover.getBoundingClientRect();

        const horizontal =
            options.horizontal || "left";

        const vertical =
            options.vertical || "bottom";

        let left;

        if (horizontal === "right") {
            left =
                anchorRect.right -
                popoverRect.width;
        } else {
            left =
                anchorRect.left;
        }

        let top;

        if (vertical === "top") {
            top =
                anchorRect.top -
                popoverRect.height -
                8;
        } else {
            top =
                anchorRect.bottom + 8;
        }

        if (
            top + popoverRect.height >
            window.innerHeight - 8
        ) {
            top =
                anchorRect.top -
                popoverRect.height -
                8;
        }

        if (top < 8) {
            top = 8;
        }

        left = clamp(
            left,
            8,
            window.innerWidth -
                popoverRect.width -
                8
        );

        popover.style.left =
            `${left}px`;

        popover.style.top =
            `${top}px`;
    }

    // =========================================================================
    // Clipboard
    // =========================================================================

    /**
     * Writes text to the clipboard.
     *
     * @param {string} value
     */
    async function writeTextToClipboard(
        value
    ) {
        const text =
            String(value || "");

        if (
            navigator.clipboard &&
            typeof navigator.clipboard
                .writeText === "function" &&
            window.isSecureContext
        ) {
            await navigator.clipboard.writeText(
                text
            );

            return;
        }

        fallbackCopyText(text);
    }

    /**
     * Copies text using a temporary textarea.
     *
     * @param {string} text
     */
    function fallbackCopyText(text) {
        const textarea =
            document.createElement(
                "textarea"
            );

        textarea.value = text;
        textarea.setAttribute(
            "readonly",
            ""
        );

        textarea.style.position =
            "fixed";

        textarea.style.top = "-1000px";
        textarea.style.left = "-1000px";
        textarea.style.opacity = "0";

        document.body.appendChild(
            textarea
        );

        textarea.select();
        textarea.setSelectionRange(
            0,
            textarea.value.length
        );

        const successful =
            document.execCommand("copy");

        textarea.remove();

        if (!successful) {
            throw new Error(
                "Clipboard access is unavailable."
            );
        }
    }

    // =========================================================================
    // Focus helpers
    // =========================================================================

    /**
     * Focuses the first editor block.
     */
    function focusFirstEditorBlock() {
        if (
            window.NoteUEditor &&
            typeof window.NoteUEditor
                .focusFirstBlock === "function"
        ) {
            window.NoteUEditor
                .focusFirstBlock();
        }
    }

    /**
     * Returns whether the textarea caret is at its end.
     *
     * @param {HTMLTextAreaElement} textarea
     * @returns {boolean}
     */
    function isCaretAtEnd(textarea) {
        return (
            textarea.selectionStart ===
                textarea.value.length &&
            textarea.selectionEnd ===
                textarea.value.length
        );
    }

    /**
     * Inserts text at the current textarea selection.
     *
     * @param {HTMLTextAreaElement} textarea
     * @param {string} text
     */
    function insertTextIntoTextarea(
        textarea,
        text
    ) {
        const start =
            textarea.selectionStart;

        const end =
            textarea.selectionEnd;

        textarea.setRangeText(
            text,
            start,
            end,
            "end"
        );
    }

    // =========================================================================
    // Utility helpers
    // =========================================================================

    /**
     * Escapes text for inclusion in XML.
     *
     * @param {*} value
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

    /**
     * Restricts a number to a range.
     *
     * @param {number} value
     * @param {number} minimum
     * @param {number} maximum
     * @returns {number}
     */
    function clamp(
        value,
        minimum,
        maximum
    ) {
        return Math.min(
            Math.max(value, minimum),
            maximum
        );
    }

    // =========================================================================
    // Public API
    // =========================================================================

    const publicApi =
        Object.freeze({
            initialize,
            setDocument,
            getHeaderData,

            setIcon,
            resetIcon,

            updateBrowserTitle,
            updateFavicon,
            updateUrlSize,
            clearUrlSize,

            copyCurrentLink,

            showToast,
            showError,
            closeError,

            closeMenus
        });

    window.NoteUUI =
        publicApi;
})();
