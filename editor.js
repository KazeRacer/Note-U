/**
 * Note-U
 * Version: 0.3.0
 *
 * Block editor.
 *
 * Responsibilities:
 * - render recursive document blocks;
 * - synchronize editable content with the document model;
 * - support Markdown-style shortcuts;
 * - handle Enter, Backspace, Delete, Tab and Shift+Tab;
 * - support lists, checklists, toggles, quotes and code blocks;
 * - manage slash commands and block menus;
 * - apply inline formatting;
 * - provide a custom right-click context menu;
 * - support mouse drag-and-drop;
 * - preserve caret and text selections when possible.
 */

(function () {
    "use strict";

    const Storage = window.NoteUStorage;

    if (!Storage) {
        throw new Error(
            "NoteUStorage must be loaded before editor.js."
        );
    }

    // =========================================================================
    // Block definitions
    // =========================================================================

    const BLOCK_DEFINITIONS = Object.freeze([
        {
            type: "paragraph",
            title: "Text",
            description: "Plain text",
            icon: "T",
            keywords: ["text", "paragraph", "plain"]
        },
        {
            type: "heading-1",
            title: "Heading 1",
            description: "Large section heading",
            icon: "H1",
            keywords: ["heading", "title", "h1"]
        },
        {
            type: "heading-2",
            title: "Heading 2",
            description: "Medium section heading",
            icon: "H2",
            keywords: ["heading", "subtitle", "h2"]
        },
        {
            type: "bullet-list",
            title: "Bulleted list",
            description: "Create a simple bulleted list",
            icon: "•",
            keywords: ["bullet", "list", "unordered"]
        },
        {
            type: "numbered-list",
            title: "Numbered list",
            description: "Create a numbered list",
            icon: "1.",
            keywords: ["number", "ordered", "list"]
        },
        {
            type: "checklist",
            title: "Checklist",
            description: "Track an item with a checkbox",
            icon: "☐",
            keywords: ["todo", "check", "task"]
        },
        {
            type: "toggle",
            title: "Toggle",
            description: "Hide content inside a dropdown",
            icon: "▶",
            keywords: ["toggle", "dropdown", "collapse"]
        },
        {
            type: "quote",
            title: "Quote",
            description: "Highlight a quotation",
            icon: "❝",
            keywords: ["quote", "blockquote"]
        },
        {
            type: "code",
            title: "Code",
            description: "Write formatted code",
            icon: "</>",
            keywords: ["code", "programming", "pre"]
        },
        {
            type: "divider",
            title: "Divider",
            description: "Separate sections visually",
            icon: "—",
            keywords: ["divider", "line", "separator", "hr"]
        }
    ]);

    const BLOCK_DEFINITION_MAP =
        new Map(
            BLOCK_DEFINITIONS.map(
                definition => [
                    definition.type,
                    definition
                ]
            )
        );

    const LIST_TYPES = new Set([
        "bullet-list",
        "numbered-list",
        "checklist"
    ]);

    const TEXT_BLOCK_TYPES = new Set([
        "paragraph",
        "heading-1",
        "heading-2",
        "bullet-list",
        "numbered-list",
        "checklist",
        "toggle",
        "quote",
        "code"
    ]);

    // =========================================================================
    // Editor state
    // =========================================================================

    let editorElement = null;
    let blockListElement = null;
    let blockTemplate = null;

    let slashMenuElement = null;
    let blockMenuElement = null;
    let blockTypeMenuElement = null;
    let contextMenuElement = null;
    let selectionToolbarElement = null;
    let dropIndicatorElement = null;
    let dragPreviewElement = null;

    let documentModel = null;

    let changeHandler = function () {};
    let errorHandler = function () {};

    let activeBlockId = null;
    let activeMenuBlockId = null;

    let slashState = null;
    let selectedSlashIndex = 0;

    let savedSelection = null;

    let draggedBlockId = null;
    let dropTarget = null;

    let isRendering = false;
    let changeTimer = null;

    // =========================================================================
    // Initialization
    // =========================================================================

    /**
     * Initializes the editor.
     *
     * @param {Object} options
     * @param {Object} options.document
     * @param {Function} [options.onChange]
     * @param {Function} [options.onError]
     * @returns {Object}
     */
    function initialize(options) {
        editorElement =
            document.getElementById("editor");

        blockListElement =
            document.getElementById("block-list");

        blockTemplate =
            document.getElementById("block-template");

        slashMenuElement =
            document.getElementById("slash-menu");

        blockMenuElement =
            document.getElementById("block-menu");

        blockTypeMenuElement =
            document.getElementById("block-type-menu");

        contextMenuElement =
            document.getElementById("context-menu");

        selectionToolbarElement =
            document.getElementById("selection-toolbar");

        dropIndicatorElement =
            document.getElementById("drop-indicator");

        dragPreviewElement =
            document.getElementById("drag-preview");

        if (
            !editorElement ||
            !blockListElement ||
            !blockTemplate
        ) {
            throw new Error(
                "The editor interface is incomplete."
            );
        }

        documentModel =
            Storage.normalizeDocument(
                options.document
            );

        changeHandler =
            typeof options.onChange === "function"
                ? options.onChange
                : function () {};

        errorHandler =
            typeof options.onError === "function"
                ? options.onError
                : function () {};

        bindEditorEvents();
        bindMenuEvents();
        bindDocumentEvents();

        render();

        return publicApi;
    }

    // =========================================================================
    // Rendering
    // =========================================================================

    /**
     * Renders the complete block tree.
     *
     * @param {Object} [focusRequest]
     */
    function render(focusRequest) {
        isRendering = true;

        closeAllMenus();

        blockListElement.replaceChildren();

        renderBlockCollection(
            documentModel.blocks,
            blockListElement
        );

        refreshListNumbers();

        isRendering = false;

        if (focusRequest) {
            window.requestAnimationFrame(() => {
                focusBlock(
                    focusRequest.blockId,
                    focusRequest.offset,
                    focusRequest.position
                );
            });
        }
    }

    /**
     * Renders one collection of blocks.
     *
     * @param {Array<Object>} blocks
     * @param {HTMLElement} container
     */
    function renderBlockCollection(
        blocks,
        container
    ) {
        for (const block of blocks) {
            const blockElement =
                renderBlock(block);

            container.appendChild(blockElement);
        }
    }

    /**
     * Renders one block.
     *
     * @param {Object} block
     * @returns {HTMLElement}
     */
    function renderBlock(block) {
        const fragment =
            blockTemplate.content.cloneNode(true);

        const blockElement =
            fragment.querySelector(".editor-block");

        const contentRow =
            fragment.querySelector(".block-content-row");

        const prefixElement =
            fragment.querySelector(".block-prefix");

        const contentElement =
            fragment.querySelector(".block-content");

        const childrenElement =
            fragment.querySelector(".block-children");

        blockElement.dataset.blockId =
            block.id;

        blockElement.dataset.blockType =
            block.type;

        contentElement.dataset.blockId =
            block.id;

        contentElement.dataset.placeholder =
            getPlaceholder(block);

        if (block.type === "divider") {
            contentElement.remove();

            const divider =
                document.createElement("div");

            divider.className =
                "block-divider";

            divider.setAttribute(
                "role",
                "separator"
            );

            contentRow.appendChild(divider);
        } else {
            renderRichText(
                contentElement,
                block.content
            );
        }

        if (block.type === "checklist") {
            const checkbox =
                document.createElement("input");

            checkbox.type = "checkbox";
            checkbox.className =
                "checklist-checkbox";

            checkbox.checked =
                Boolean(block.checked);

            checkbox.dataset.action =
                "toggle-checklist";

            checkbox.setAttribute(
                "aria-label",
                "Mark checklist item"
            );

            contentRow.insertBefore(
                checkbox,
                contentElement
            );

            blockElement.dataset.checked =
                String(Boolean(block.checked));
        }

        if (block.type === "toggle") {
            const toggleButton =
                document.createElement("button");

            toggleButton.type = "button";
            toggleButton.className =
                "toggle-button";

            toggleButton.dataset.action =
                "toggle-open";

            toggleButton.setAttribute(
                "aria-label",
                block.open === false
                    ? "Open toggle"
                    : "Close toggle"
            );

            toggleButton.setAttribute(
                "aria-expanded",
                String(block.open !== false)
            );

            contentRow.insertBefore(
                toggleButton,
                contentElement
            );

            blockElement.dataset.open =
                String(block.open !== false);

            blockElement.dataset.titleStyle =
                block.titleStyle ||
                "paragraph";
        }

        if (block.type === "numbered-list") {
            prefixElement.dataset.listNumber =
                "1";
        }

        if (
            Array.isArray(block.children) &&
            block.children.length > 0
        ) {
            childrenElement.hidden = false;

            renderBlockCollection(
                block.children,
                childrenElement
            );
        } else {
            childrenElement.hidden =
                block.type !== "toggle";
        }

        return blockElement;
    }

    /**
     * Renders structured rich text.
     *
     * @param {HTMLElement} element
     * @param {*} content
     */
    function renderRichText(element, content) {
        element.replaceChildren();

        const segments =
            Storage.normalizeRichText(content);

        for (const segment of segments) {
            let node =
                document.createTextNode(
                    segment.text
                );

            const marks =
                Array.isArray(segment.marks)
                    ? segment.marks
                    : [];

            for (const mark of marks) {
                node = wrapNodeWithMark(
                    node,
                    mark
                );
            }

            element.appendChild(node);
        }
    }

    /**
     * Wraps a node in an inline formatting element.
     *
     * @param {Node} node
     * @param {string} mark
     * @returns {Node}
     */
    function wrapNodeWithMark(node, mark) {
        const tagMap = {
            bold: "strong",
            italic: "em",
            strikethrough: "s",
            highlight: "mark",
            code: "code"
        };

        const tagName =
            tagMap[mark];

        if (!tagName) {
            return node;
        }

        const wrapper =
            document.createElement(tagName);

        wrapper.appendChild(node);

        return wrapper;
    }

    /**
     * Returns a contextual placeholder.
     *
     * @param {Object} block
     * @returns {string}
     */
    function getPlaceholder(block) {
        switch (block.type) {
            case "heading-1":
                return "Heading 1";

            case "heading-2":
                return "Heading 2";

            case "toggle":
                return "Toggle title";

            case "quote":
                return "Quote";

            case "code":
                return "Write code";

            default:
                return 'Type "/" for commands';
        }
    }

    // =========================================================================
    // Rich-text parsing
    // =========================================================================

    /**
     * Converts editable DOM content into rich-text segments.
     *
     * @param {HTMLElement} element
     * @returns {Array<Object>}
     */
    function parseRichText(element) {
        const segments = [];

        function visit(node, marks) {
            if (node.nodeType === Node.TEXT_NODE) {
                appendSegment(
                    segments,
                    node.nodeValue || "",
                    marks
                );

                return;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) {
                return;
            }

            if (node.tagName === "BR") {
                appendSegment(
                    segments,
                    "\n",
                    marks
                );

                return;
            }

            const nextMarks =
                marks.slice();

            const detectedMark =
                getMarkForElement(node);

            if (
                detectedMark &&
                !nextMarks.includes(detectedMark)
            ) {
                nextMarks.push(detectedMark);
            }

            for (const child of node.childNodes) {
                visit(child, nextMarks);
            }

            if (
                ["DIV", "P"].includes(node.tagName) &&
                node !== element &&
                node.nextSibling
            ) {
                appendSegment(
                    segments,
                    "\n",
                    marks
                );
            }
        }

        for (const child of element.childNodes) {
            visit(child, []);
        }

        return Storage.normalizeRichText(
            segments.length > 0
                ? segments
                : [{ text: "" }]
        );
    }

    /**
     * Detects an inline mark from a DOM element.
     *
     * @param {Element} element
     * @returns {string|null}
     */
    function getMarkForElement(element) {
        const tagName =
            element.tagName.toLowerCase();

        if (
            tagName === "strong" ||
            tagName === "b"
        ) {
            return "bold";
        }

        if (
            tagName === "em" ||
            tagName === "i"
        ) {
            return "italic";
        }

        if (
            tagName === "s" ||
            tagName === "strike" ||
            tagName === "del"
        ) {
            return "strikethrough";
        }

        if (tagName === "mark") {
            return "highlight";
        }

        if (tagName === "code") {
            return "code";
        }

        return null;
    }

    /**
     * Adds or merges a rich-text segment.
     *
     * @param {Array<Object>} segments
     * @param {string} text
     * @param {Array<string>} marks
     */
    function appendSegment(
        segments,
        text,
        marks
    ) {
        if (!text) {
            return;
        }

        const normalizedMarks =
            Storage.normalizeMarks(marks);

        const previous =
            segments[segments.length - 1];

        if (
            previous &&
            haveSameMarks(
                previous.marks,
                normalizedMarks
            )
        ) {
            previous.text += text;
            return;
        }

        const segment = {
            text
        };

        if (normalizedMarks.length > 0) {
            segment.marks =
                normalizedMarks;
        }

        segments.push(segment);
    }

    /**
     * Checks whether two arrays contain the same marks.
     *
     * @param {*} first
     * @param {*} second
     * @returns {boolean}
     */
    function haveSameMarks(first, second) {
        const firstMarks =
            Storage.normalizeMarks(first);

        const secondMarks =
            Storage.normalizeMarks(second);

        return (
            firstMarks.length ===
                secondMarks.length &&
            firstMarks.every(
                mark =>
                    secondMarks.includes(mark)
            )
        );
    }

    // =========================================================================
    // Model traversal
    // =========================================================================

    /**
     * Finds a block and its surrounding collection.
     *
     * @param {string} blockId
     * @returns {Object|null}
     */
    function findBlockLocation(blockId) {
        function visit(collection, parentBlock) {
            for (
                let index = 0;
                index < collection.length;
                index += 1
            ) {
                const block =
                    collection[index];

                if (block.id === blockId) {
                    return {
                        block,
                        collection,
                        index,
                        parentBlock
                    };
                }

                const nested =
                    visit(
                        block.children || [],
                        block
                    );

                if (nested) {
                    return nested;
                }
            }

            return null;
        }

        return visit(
            documentModel.blocks,
            null
        );
    }

    /**
     * Finds the previous visible block.
     *
     * @param {string} blockId
     * @returns {Object|null}
     */
    function findPreviousVisibleBlock(blockId) {
        const flattened =
            flattenVisibleBlocks();

        const index =
            flattened.findIndex(
                block => block.id === blockId
            );

        return index > 0
            ? flattened[index - 1]
            : null;
    }

    /**
     * Finds the next visible block.
     *
     * @param {string} blockId
     * @returns {Object|null}
     */
    function findNextVisibleBlock(blockId) {
        const flattened =
            flattenVisibleBlocks();

        const index =
            flattened.findIndex(
                block => block.id === blockId
            );

        return (
            index >= 0 &&
            index < flattened.length - 1
        )
            ? flattened[index + 1]
            : null;
    }

    /**
     * Returns all currently visible blocks.
     *
     * @returns {Array<Object>}
     */
    function flattenVisibleBlocks() {
        const result = [];

        function visit(collection) {
            for (const block of collection) {
                result.push(block);

                if (
                    block.type !== "toggle" ||
                    block.open !== false
                ) {
                    visit(block.children || []);
                }
            }
        }

        visit(documentModel.blocks);

        return result;
    }

    /**
     * Checks whether one block contains another.
     *
     * @param {Object} block
     * @param {string} targetId
     * @returns {boolean}
     */
    function blockContainsId(block, targetId) {
        if (block.id === targetId) {
            return true;
        }

        return (block.children || []).some(
            child =>
                blockContainsId(
                    child,
                    targetId
                )
        );
    }

    // =========================================================================
    // Synchronization
    // =========================================================================

    /**
     * Synchronizes one editable block from the DOM.
     *
     * @param {HTMLElement} contentElement
     */
    function synchronizeContentElement(
        contentElement
    ) {
        const blockId =
            contentElement.dataset.blockId;

        const location =
            findBlockLocation(blockId);

        if (!location) {
            return;
        }

        location.block.content =
            parseRichText(contentElement);

        scheduleChange();
    }

    /**
     * Synchronizes every editable block.
     */
    function synchronizeAllBlocks() {
        const contentElements =
            blockListElement.querySelectorAll(
                ".block-content[data-block-id]"
            );

        for (const contentElement of contentElements) {
            synchronizeContentElement(
                contentElement
            );
        }
    }

    /**
     * Schedules a document change notification.
     */
    function scheduleChange() {
        window.clearTimeout(changeTimer);

        changeTimer =
            window.setTimeout(() => {
                changeHandler(
                    Storage.cloneDocument(
                        documentModel
                    )
                );
            }, 80);
    }

    /**
     * Immediately emits a document change.
     */
    function emitChange() {
        window.clearTimeout(changeTimer);

        changeHandler(
            Storage.cloneDocument(
                documentModel
            )
        );
    }

    // =========================================================================
    // Event binding
    // =========================================================================

    /**
     * Binds editor events.
     */
    function bindEditorEvents() {
        blockListElement.addEventListener(
            "input",
            handleEditorInput
        );

        blockListElement.addEventListener(
            "keydown",
            handleEditorKeyDown
        );

        blockListElement.addEventListener(
            "click",
            handleEditorClick
        );

        blockListElement.addEventListener(
            "change",
            handleEditorChange
        );

        blockListElement.addEventListener(
            "contextmenu",
            handleEditorContextMenu
        );

        blockListElement.addEventListener(
            "focusin",
            handleEditorFocusIn
        );

        blockListElement.addEventListener(
            "paste",
            handleEditorPaste
        );

        blockListElement.addEventListener(
            "dragstart",
            handleDragStart
        );

        blockListElement.addEventListener(
            "dragover",
            handleDragOver
        );

        blockListElement.addEventListener(
            "drop",
            handleDrop
        );

        blockListElement.addEventListener(
            "dragend",
            handleDragEnd
        );
    }

    /**
     * Binds menu events.
     */
    function bindMenuEvents() {
        const menuElements = [
            slashMenuElement,
            blockMenuElement,
            blockTypeMenuElement,
            contextMenuElement,
            selectionToolbarElement
        ];

        for (const menu of menuElements) {
            if (!menu) {
                continue;
            }

            menu.addEventListener(
                "pointerdown",
                event => {
                    event.preventDefault();
                }
            );
        }

        slashMenuElement?.addEventListener(
            "click",
            handleSlashMenuClick
        );

        blockMenuElement?.addEventListener(
            "click",
            handleBlockMenuClick
        );

        blockTypeMenuElement?.addEventListener(
            "click",
            handleBlockTypeMenuClick
        );

        contextMenuElement?.addEventListener(
            "click",
            handleContextMenuClick
        );

        selectionToolbarElement?.addEventListener(
            "click",
            handleSelectionToolbarClick
        );
    }

    /**
     * Binds global document events.
     */
    function bindDocumentEvents() {
        document.addEventListener(
            "pointerdown",
            event => {
                if (
                    !event.target.closest(".popover") &&
                    !event.target.closest(
                        ".selection-toolbar"
                    ) &&
                    !event.target.closest(
                        ".block-handle"
                    )
                ) {
                    closeAllMenus();
                }
            }
        );

        document.addEventListener(
            "selectionchange",
            handleSelectionChange
        );

        window.addEventListener(
            "resize",
            closeAllMenus
        );

        window.addEventListener(
            "scroll",
            closeAllMenus,
            true
        );
    }

    // =========================================================================
    // Input handling
    // =========================================================================

    /**
     * Handles normal editor input.
     *
     * @param {InputEvent} event
     */
    function handleEditorInput(event) {
        const contentElement =
            event.target.closest(
                ".block-content"
            );

        if (!contentElement) {
            return;
        }

        synchronizeContentElement(
            contentElement
        );

        detectSlashCommand(
            contentElement
        );
    }

    /**
     * Handles editor keyboard behavior.
     *
     * @param {KeyboardEvent} event
     */
    function handleEditorKeyDown(event) {
        const contentElement =
            event.target.closest(
                ".block-content"
            );

        if (!contentElement) {
            return;
        }

        const blockId =
            contentElement.dataset.blockId;

        activeBlockId = blockId;

        if (
            slashState &&
            slashState.blockId === blockId
        ) {
            if (
                handleSlashMenuKeyboard(
                    event
                )
            ) {
                return;
            }
        }

        if (handleFormattingShortcut(event)) {
            return;
        }

        if (
            event.altKey &&
            event.key === "ArrowUp"
        ) {
            event.preventDefault();
            moveBlock(blockId, -1);
            return;
        }

        if (
            event.altKey &&
            event.key === "ArrowDown"
        ) {
            event.preventDefault();
            moveBlock(blockId, 1);
            return;
        }

        if (event.key === "Tab") {
            event.preventDefault();

            if (event.shiftKey) {
                outdentBlock(blockId);
            } else {
                indentBlock(blockId);
            }

            return;
        }

        if (event.key === "Enter") {
            handleEnterKey(
                event,
                contentElement
            );

            return;
        }

        if (
            event.key === "Backspace" &&
            handleBackspaceKey(
                event,
                contentElement
            )
        ) {
            return;
        }

        if (
            event.key === "Delete" &&
            handleDeleteKey(
                event,
                contentElement
            )
        ) {
            return;
        }

        if (
            event.key === " " &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
        ) {
            handleMarkdownSpaceShortcut(
                event,
                contentElement
            );
        }
    }

    // =========================================================================
    // Markdown shortcuts
    // =========================================================================

    /**
     * Handles shortcuts completed by pressing Space.
     *
     * @param {KeyboardEvent} event
     * @param {HTMLElement} contentElement
     */
    function handleMarkdownSpaceShortcut(
        event,
        contentElement
    ) {
        const caretOffset =
            getCaretOffset(contentElement);

        const plainText =
            contentElement.textContent || "";

        const textBeforeCaret =
            plainText.slice(0, caretOffset);

        const shortcutMap = {
            "-": "bullet-list",
            "*": "bullet-list",
            "1.": "numbered-list",
            "[]": "checklist",
            "[ ]": "checklist",
            ">": "toggle",
            "#": "heading-1",
            "##": "heading-2",
            "```": "code",
            "---": "divider"
        };

        const targetType =
            shortcutMap[textBeforeCaret];

        if (!targetType) {
            return;
        }

        event.preventDefault();

        const blockId =
            contentElement.dataset.blockId;

        const location =
            findBlockLocation(blockId);

        if (!location) {
            return;
        }

        location.block.type =
            targetType;

        location.block.content =
            Storage.normalizeRichText(
                plainText.slice(caretOffset)
            );

        applyTypeDefaults(
            location.block,
            targetType
        );

        if (targetType === "divider") {
            const paragraph =
                Storage.createDefaultBlock(
                    "paragraph"
                );

            location.collection.splice(
                location.index + 1,
                0,
                paragraph
            );

            render({
                blockId: paragraph.id,
                position: "start"
            });
        } else {
            render({
                blockId,
                position: "start"
            });
        }

        emitChange();
    }

    /**
     * Detects slash commands in the current block.
     *
     * @param {HTMLElement} contentElement
     */
    function detectSlashCommand(contentElement) {
        const blockId =
            contentElement.dataset.blockId;

        const caretOffset =
            getCaretOffset(contentElement);

        const text =
            contentElement.textContent || "";

        const beforeCaret =
            text.slice(0, caretOffset);

        const slashIndex =
            beforeCaret.lastIndexOf("/");

        if (
            slashIndex < 0 ||
            (
                slashIndex > 0 &&
                !/\s/.test(
                    beforeCaret[
                        slashIndex - 1
                    ]
                )
            )
        ) {
            closeSlashMenu();
            return;
        }

        const query =
            beforeCaret.slice(
                slashIndex + 1
            );

        if (/\s/.test(query)) {
            closeSlashMenu();
            return;
        }

        slashState = {
            blockId,
            slashIndex,
            caretOffset,
            query
        };

        selectedSlashIndex = 0;

        renderSlashMenu(query);

        positionMenuNearCaret(
            slashMenuElement
        );
    }

    // =========================================================================
    // Enter behavior
    // =========================================================================

    /**
     * Handles Enter and Shift+Enter.
     *
     * @param {KeyboardEvent} event
     * @param {HTMLElement} contentElement
     */
    function handleEnterKey(
        event,
        contentElement
    ) {
        if (event.shiftKey) {
            return;
        }

        event.preventDefault();

        synchronizeContentElement(
            contentElement
        );

        const blockId =
            contentElement.dataset.blockId;

        const location =
            findBlockLocation(blockId);

        if (!location) {
            return;
        }

        const block =
            location.block;

        const plainText =
            Storage.richTextToPlainText(
                block.content
            );

        if (
            LIST_TYPES.has(block.type) &&
            plainText.trim() === ""
        ) {
            exitListBlock(location);
            return;
        }

        if (
            block.type === "toggle" &&
            plainText.trim() === ""
        ) {
            block.type = "paragraph";
            delete block.open;
            delete block.titleStyle;

            render({
                blockId,
                position: "start"
            });

            emitChange();
            return;
        }

        if (block.type === "divider") {
            insertBlockAfter(
                blockId,
                "paragraph",
                ""
            );

            return;
        }

        splitBlockAtCaret(
            location,
            contentElement
        );
    }

    /**
     * Splits a block at the current caret position.
     *
     * @param {Object} location
     * @param {HTMLElement} contentElement
     */
    function splitBlockAtCaret(
        location,
        contentElement
    ) {
        const caretOffset =
            getCaretOffset(contentElement);

        const segments =
            splitRichTextAtOffset(
                location.block.content,
                caretOffset
            );

        location.block.content =
            segments.before;

        let newType =
            location.block.type;

        if (
            newType === "heading-1" ||
            newType === "heading-2" ||
            newType === "quote"
        ) {
            newType = "paragraph";
        }

        if (newType === "toggle") {
            const child =
                Storage.createDefaultBlock(
                    "paragraph",
                    Storage.richTextToPlainText(
                        segments.after
                    )
                );

            child.content =
                segments.after;

            location.block.children.unshift(
                child
            );

            location.block.open = true;

            render({
                blockId: child.id,
                position: "start"
            });

            emitChange();
            return;
        }

        const newBlock =
            Storage.createDefaultBlock(
                newType
            );

        newBlock.content =
            segments.after;

        if (
            newType === "checklist"
        ) {
            newBlock.checked = false;
        }

        location.collection.splice(
            location.index + 1,
            0,
            newBlock
        );

        render({
            blockId: newBlock.id,
            position: "start"
        });

        emitChange();
    }

    /**
     * Converts an empty list item back to text.
     *
     * @param {Object} location
     */
    function exitListBlock(location) {
        location.block.type =
            "paragraph";

        delete location.block.checked;

        render({
            blockId: location.block.id,
            position: "start"
        });

        emitChange();
    }

    // =========================================================================
    // Backspace and Delete
    // =========================================================================

    /**
     * Handles Backspace at the beginning of a block.
     *
     * @param {KeyboardEvent} event
     * @param {HTMLElement} contentElement
     * @returns {boolean}
     */
    function handleBackspaceKey(
        event,
        contentElement
    ) {
        if (
            !isSelectionCollapsed() ||
            getCaretOffset(contentElement) !== 0
        ) {
            return false;
        }

        const blockId =
            contentElement.dataset.blockId;

        const location =
            findBlockLocation(blockId);

        if (!location) {
            return false;
        }

        if (
            location.block.type !==
            "paragraph"
        ) {
            event.preventDefault();

            location.block.type =
                "paragraph";

            delete location.block.checked;
            delete location.block.open;
            delete location.block.titleStyle;

            render({
                blockId,
                position: "start"
            });

            emitChange();

            return true;
        }

        const previousBlock =
            findPreviousVisibleBlock(
                blockId
            );

        if (!previousBlock) {
            return false;
        }

        event.preventDefault();

        mergeBlocks(
            previousBlock.id,
            blockId
        );

        return true;
    }

    /**
     * Handles Delete at the end of a block.
     *
     * @param {KeyboardEvent} event
     * @param {HTMLElement} contentElement
     * @returns {boolean}
     */
    function handleDeleteKey(
        event,
        contentElement
    ) {
        if (
            !isSelectionCollapsed() ||
            getCaretOffset(contentElement) !==
                getContentTextLength(
                    contentElement
                )
        ) {
            return false;
        }

        const currentBlockId =
            contentElement.dataset.blockId;

        const nextBlock =
            findNextVisibleBlock(
                currentBlockId
            );

        if (!nextBlock) {
            return false;
        }

        event.preventDefault();

        mergeBlocks(
            currentBlockId,
            nextBlock.id
        );

        return true;
    }

    /**
     * Merges a source block into a target block.
     *
     * @param {string} targetId
     * @param {string} sourceId
     */
    function mergeBlocks(targetId, sourceId) {
        const targetLocation =
            findBlockLocation(targetId);

        const sourceLocation =
            findBlockLocation(sourceId);

        if (
            !targetLocation ||
            !sourceLocation ||
            targetId === sourceId
        ) {
            return;
        }

        if (
            targetLocation.block.type ===
            "divider"
        ) {
            targetLocation.block.type =
                "paragraph";

            targetLocation.block.content =
                Storage.normalizeRichText("");
        }

        const targetLength =
            Storage.richTextToPlainText(
                targetLocation.block.content
            ).length;

        targetLocation.block.content =
            concatenateRichText(
                targetLocation.block.content,
                sourceLocation.block.content
            );

        targetLocation.block.children.push(
            ...sourceLocation.block.children
        );

        sourceLocation.collection.splice(
            sourceLocation.index,
            1
        );

        ensureDocumentHasBlock();

        render({
            blockId: targetId,
            offset: targetLength
        });

        emitChange();
    }

    // =========================================================================
    // Block actions
    // =========================================================================

    /**
     * Changes a block type.
     *
     * @param {string} blockId
     * @param {string} targetType
     */
    function changeBlockType(
        blockId,
        targetType
    ) {
        const location =
            findBlockLocation(blockId);

        if (
            !location ||
            !BLOCK_DEFINITION_MAP.has(
                targetType
            )
        ) {
            return;
        }

        const oldType =
            location.block.type;

        location.block.type =
            targetType;

        if (targetType === "divider") {
            location.block.content = [];
        } else if (oldType === "divider") {
            location.block.content =
                Storage.normalizeRichText("");
        }

        applyTypeDefaults(
            location.block,
            targetType
        );

        if (targetType === "divider") {
            const nextBlock =
                Storage.createDefaultBlock(
                    "paragraph"
                );

            location.collection.splice(
                location.index + 1,
                0,
                nextBlock
            );

            render({
                blockId: nextBlock.id,
                position: "start"
            });
        } else {
            render({
                blockId,
                position: "end"
            });
        }

        emitChange();
    }

    /**
     * Applies type-specific fields.
     *
     * @param {Object} block
     * @param {string} type
     */
    function applyTypeDefaults(block, type) {
        if (type === "checklist") {
            block.checked =
                Boolean(block.checked);
        } else {
            delete block.checked;
        }

        if (type === "toggle") {
            block.open =
                block.open !== false;

            block.titleStyle =
                Storage
                    .SUPPORTED_TOGGLE_TITLE_STYLES
                    .includes(block.titleStyle)
                    ? block.titleStyle
                    : "paragraph";
        } else {
            delete block.open;
            delete block.titleStyle;
        }
    }

    /**
     * Inserts a block after another block.
     *
     * @param {string} blockId
     * @param {string} type
     * @param {*} content
     */
    function insertBlockAfter(
        blockId,
        type = "paragraph",
        content = ""
    ) {
        const location =
            findBlockLocation(blockId);

        if (!location) {
            return;
        }

        const newBlock =
            Storage.createDefaultBlock(
                type,
                content
            );

        location.collection.splice(
            location.index + 1,
            0,
            newBlock
        );

        render({
            blockId: newBlock.id,
            position: "start"
        });

        emitChange();
    }

    /**
     * Appends a block at the end of the document.
     *
     * @param {string} [type]
     */
    function appendBlock(type = "paragraph") {
        const block =
            Storage.createDefaultBlock(type);

        documentModel.blocks.push(block);

        render({
            blockId: block.id,
            position: "start"
        });

        emitChange();
    }

    /**
     * Duplicates a block and its descendants.
     *
     * @param {string} blockId
     */
    function duplicateBlock(blockId) {
        const location =
            findBlockLocation(blockId);

        if (!location) {
            return;
        }

        const clone =
            cloneBlockWithNewIds(
                location.block
            );

        location.collection.splice(
            location.index + 1,
            0,
            clone
        );

        render({
            blockId: clone.id,
            position: "end"
        });

        emitChange();
    }

    /**
     * Clones a recursive block tree with new identifiers.
     *
     * @param {Object} block
     * @returns {Object}
     */
    function cloneBlockWithNewIds(block) {
        const clone =
            Storage.normalizeBlock(
                JSON.parse(
                    JSON.stringify(block)
                )
            );

        function replaceIds(item) {
            item.id =
                Storage.createId();

            for (const child of item.children) {
                replaceIds(child);
            }
        }

        replaceIds(clone);

        return clone;
    }

    /**
     * Deletes a block.
     *
     * @param {string} blockId
     */
    function deleteBlock(blockId) {
        const location =
            findBlockLocation(blockId);

        if (!location) {
            return;
        }

        let focusTarget = null;

        if (location.index > 0) {
            focusTarget =
                location.collection[
                    location.index - 1
                ];
        } else {
            focusTarget =
                location.collection[
                    location.index + 1
                ] || null;
        }

        location.collection.splice(
            location.index,
            1
        );

        ensureDocumentHasBlock();

        render({
            blockId:
                focusTarget?.id ||
                documentModel.blocks[0].id,
            position: "end"
        });

        emitChange();
    }

    /**
     * Moves a block within its current collection.
     *
     * @param {string} blockId
     * @param {number} direction
     */
    function moveBlock(blockId, direction) {
        const location =
            findBlockLocation(blockId);

        if (!location) {
            return;
        }

        const targetIndex =
            location.index + direction;

        if (
            targetIndex < 0 ||
            targetIndex >=
                location.collection.length
        ) {
            return;
        }

        const [block] =
            location.collection.splice(
                location.index,
                1
            );

        location.collection.splice(
            targetIndex,
            0,
            block
        );

        render({
            blockId,
            position: "end"
        });

        emitChange();
    }

    /**
     * Indents a block under its previous sibling.
     *
     * @param {string} blockId
     */
    function indentBlock(blockId) {
        const location =
            findBlockLocation(blockId);

        if (
            !location ||
            location.index === 0
        ) {
            return;
        }

        const previousSibling =
            location.collection[
                location.index - 1
            ];

        const [block] =
            location.collection.splice(
                location.index,
                1
            );

        previousSibling.children.push(block);

        if (
            previousSibling.type === "toggle"
        ) {
            previousSibling.open = true;
        }

        render({
            blockId,
            position: "end"
        });

        emitChange();
    }

    /**
     * Outdents a block from its parent.
     *
     * @param {string} blockId
     */
    function outdentBlock(blockId) {
        const location =
            findBlockLocation(blockId);

        if (
            !location ||
            !location.parentBlock
        ) {
            return;
        }

        const parentLocation =
            findBlockLocation(
                location.parentBlock.id
            );

        if (!parentLocation) {
            return;
        }

        const [block] =
            location.collection.splice(
                location.index,
                1
            );

        parentLocation.collection.splice(
            parentLocation.index + 1,
            0,
            block
        );

        render({
            blockId,
            position: "end"
        });

        emitChange();
    }

    /**
     * Ensures that the document always contains one block.
     */
    function ensureDocumentHasBlock() {
        if (documentModel.blocks.length === 0) {
            documentModel.blocks.push(
                Storage.createDefaultBlock()
            );
        }
    }

    // =========================================================================
    // Toggle behavior
    // =========================================================================

    /**
     * Opens or closes a toggle.
     *
     * @param {string} blockId
     */
    function toggleBlockOpen(blockId) {
        const location =
            findBlockLocation(blockId);

        if (
            !location ||
            location.block.type !== "toggle"
        ) {
            return;
        }

        location.block.open =
            location.block.open === false;

        const blockElement =
            getBlockElement(blockId);

        if (blockElement) {
            blockElement.dataset.open =
                String(location.block.open);

            const button =
                blockElement.querySelector(
                    ":scope > .editor-block__body .toggle-button"
                );

            button?.setAttribute(
                "aria-expanded",
                String(location.block.open)
            );

            button?.setAttribute(
                "aria-label",
                location.block.open
                    ? "Close toggle"
                    : "Open toggle"
            );
        }

        emitChange();
    }

    /**
     * Changes a toggle title style.
     *
     * @param {string} blockId
     * @param {string} titleStyle
     */
    function changeToggleTitleStyle(
        blockId,
        titleStyle
    ) {
        const location =
            findBlockLocation(blockId);

        if (
            !location ||
            location.block.type !== "toggle" ||
            !Storage
                .SUPPORTED_TOGGLE_TITLE_STYLES
                .includes(titleStyle)
        ) {
            return;
        }

        location.block.titleStyle =
            titleStyle;

        render({
            blockId,
            position: "end"
        });

        emitChange();
    }

    // =========================================================================
    // Click and change events
    // =========================================================================

    /**
     * Handles editor clicks.
     *
     * @param {MouseEvent} event
     */
    function handleEditorClick(event) {
        const actionElement =
            event.target.closest(
                "[data-action]"
            );

        if (!actionElement) {
            return;
        }

        const blockElement =
            actionElement.closest(
                ".editor-block"
            );

        const blockId =
            blockElement?.dataset.blockId;

        if (!blockId) {
            return;
        }

        const action =
            actionElement.dataset.action;

        if (
            action ===
            "open-block-menu"
        ) {
            event.preventDefault();

            openBlockMenu(
                blockId,
                actionElement
            );
        }

        if (action === "toggle-open") {
            event.preventDefault();

            toggleBlockOpen(blockId);
        }
    }

    /**
     * Handles checklist changes.
     *
     * @param {Event} event
     */
    function handleEditorChange(event) {
        const checkbox =
            event.target.closest(
                ".checklist-checkbox"
            );

        if (!checkbox) {
            return;
        }

        const blockElement =
            checkbox.closest(
                ".editor-block"
            );

        const blockId =
            blockElement?.dataset.blockId;

        const location =
            findBlockLocation(blockId);

        if (!location) {
            return;
        }

        location.block.checked =
            checkbox.checked;

        blockElement.dataset.checked =
            String(checkbox.checked);

        emitChange();
    }

    /**
     * Tracks the focused block.
     *
     * @param {FocusEvent} event
     */
    function handleEditorFocusIn(event) {
        const contentElement =
            event.target.closest(
                ".block-content"
            );

        if (contentElement) {
            activeBlockId =
                contentElement.dataset.blockId;
        }
    }

    // =========================================================================
    // Paste handling
    // =========================================================================

    /**
     * Handles multiline plain-text paste.
     *
     * @param {ClipboardEvent} event
     */
    function handleEditorPaste(event) {
        const contentElement =
            event.target.closest(
                ".block-content"
            );

        if (!contentElement) {
            return;
        }

        const plainText =
            event.clipboardData?.getData(
                "text/plain"
            );

        if (
            !plainText ||
            !plainText.includes("\n")
        ) {
            return;
        }

        event.preventDefault();

        const normalized =
            plainText.replace(
                /\r\n?/g,
                "\n"
            );

        const lines =
            normalized.split("\n");

        const blockId =
            contentElement.dataset.blockId;

        const location =
            findBlockLocation(blockId);

        if (!location) {
            return;
        }

        const caretOffset =
            getCaretOffset(contentElement);

        const split =
            splitRichTextAtOffset(
                location.block.content,
                caretOffset
            );

        location.block.content =
            concatenateRichText(
                split.before,
                Storage.normalizeRichText(
                    lines[0]
                )
            );

        const insertedBlocks = [];

        for (
            let index = 1;
            index < lines.length;
            index += 1
        ) {
            const content =
                index === lines.length - 1
                    ? concatenateRichText(
                        Storage.normalizeRichText(
                            lines[index]
                        ),
                        split.after
                    )
                    : Storage.normalizeRichText(
                        lines[index]
                    );

            const block =
                Storage.createDefaultBlock(
                    "paragraph"
                );

            block.content = content;

            insertedBlocks.push(block);
        }

        location.collection.splice(
            location.index + 1,
            0,
            ...insertedBlocks
        );

        const focusBlockId =
            insertedBlocks.length > 0
                ? insertedBlocks[
                    insertedBlocks.length - 1
                ].id
                : blockId;

        render({
            blockId: focusBlockId,
            position: "end"
        });

        emitChange();
    }

    // =========================================================================
    // Slash menu
    // =========================================================================

    /**
     * Renders slash command results.
     *
     * @param {string} query
     */
    function renderSlashMenu(query) {
        const normalizedQuery =
            query.trim().toLowerCase();

        const definitions =
            BLOCK_DEFINITIONS.filter(
                definition => {
                    const haystack = [
                        definition.title,
                        definition.description,
                        ...definition.keywords
                    ]
                        .join(" ")
                        .toLowerCase();

                    return haystack.includes(
                        normalizedQuery
                    );
                }
            );

        slashMenuElement.replaceChildren();

        const label =
            document.createElement("div");

        label.className =
            "slash-menu__label";

        label.textContent =
            definitions.length > 0
                ? "Blocks"
                : "No results";

        slashMenuElement.appendChild(label);

        definitions.forEach(
            (definition, index) => {
                slashMenuElement.appendChild(
                    createBlockTypeMenuItem(
                        definition,
                        index ===
                            selectedSlashIndex,
                        "slash"
                    )
                );
            }
        );

        slashMenuElement.hidden = false;
    }

    /**
     * Handles slash menu keyboard navigation.
     *
     * @param {KeyboardEvent} event
     * @returns {boolean}
     */
    function handleSlashMenuKeyboard(event) {
        const items =
            slashMenuElement.querySelectorAll(
                "[data-block-type]"
            );

        if (event.key === "ArrowDown") {
            event.preventDefault();

            selectedSlashIndex =
                Math.min(
                    selectedSlashIndex + 1,
                    items.length - 1
                );

            updateSlashSelection();

            return true;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();

            selectedSlashIndex =
                Math.max(
                    selectedSlashIndex - 1,
                    0
                );

            updateSlashSelection();

            return true;
        }

        if (
            event.key === "Enter" &&
            items.length > 0
        ) {
            event.preventDefault();

            const selected =
                items[selectedSlashIndex];

            applySlashCommand(
                selected.dataset.blockType
            );

            return true;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            closeSlashMenu();
            return true;
        }

        return false;
    }

    /**
     * Updates the highlighted slash item.
     */
    function updateSlashSelection() {
        const items =
            slashMenuElement.querySelectorAll(
                "[data-block-type]"
            );

        items.forEach((item, index) => {
            const selected =
                index === selectedSlashIndex;

            item.classList.toggle(
                "slash-menu-item--active",
                selected
            );

            item.setAttribute(
                "aria-selected",
                String(selected)
            );

            if (selected) {
                item.scrollIntoView({
                    block: "nearest"
                });
            }
        });
    }

    /**
     * Handles slash menu clicks.
     *
     * @param {MouseEvent} event
     */
    function handleSlashMenuClick(event) {
        const item =
            event.target.closest(
                "[data-block-type]"
            );

        if (!item) {
            return;
        }

        applySlashCommand(
            item.dataset.blockType
        );
    }

    /**
     * Applies a slash command and removes the typed query.
     *
     * @param {string} targetType
     */
    function applySlashCommand(targetType) {
        if (!slashState) {
            return;
        }

        const location =
            findBlockLocation(
                slashState.blockId
            );

        if (!location) {
            closeSlashMenu();
            return;
        }

        const fullText =
            Storage.richTextToPlainText(
                location.block.content
            );

        const textBeforeCommand =
            fullText.slice(
                0,
                slashState.slashIndex
            );

        const textAfterCommand =
            fullText.slice(
                slashState.caretOffset
            );

        location.block.content =
            Storage.normalizeRichText(
                textBeforeCommand +
                textAfterCommand
            );

        location.block.type =
            targetType;

        applyTypeDefaults(
            location.block,
            targetType
        );

        const caretOffset =
            textBeforeCommand.length;

        closeSlashMenu();

        if (targetType === "divider") {
            const paragraph =
                Storage.createDefaultBlock(
                    "paragraph"
                );

            location.collection.splice(
                location.index + 1,
                0,
                paragraph
            );

            render({
                blockId: paragraph.id,
                position: "start"
            });
        } else {
            render({
                blockId: location.block.id,
                offset: caretOffset
            });
        }

        emitChange();
    }

    /**
     * Closes the slash menu.
     */
    function closeSlashMenu() {
        if (slashMenuElement) {
            slashMenuElement.hidden = true;
            slashMenuElement.replaceChildren();
        }

        slashState = null;
        selectedSlashIndex = 0;
    }

    // =========================================================================
    // Block menus
    // =========================================================================

    /**
     * Opens the block action menu.
     *
     * @param {string} blockId
     * @param {HTMLElement} anchor
     */
    function openBlockMenu(blockId, anchor) {
        closeAllMenus();

        activeMenuBlockId = blockId;

        blockMenuElement.replaceChildren();

        const items = [
            {
                action: "change-type",
                icon: "↻",
                title: "Turn into"
            },
            {
                action: "duplicate",
                icon: "⧉",
                title: "Duplicate"
            },
            {
                action: "move-up",
                icon: "↑",
                title: "Move up"
            },
            {
                action: "move-down",
                icon: "↓",
                title: "Move down"
            },
            {
                action: "indent",
                icon: "→",
                title: "Indent"
            },
            {
                action: "outdent",
                icon: "←",
                title: "Outdent"
            },
            {
                action: "delete",
                icon: "⌫",
                title: "Delete",
                danger: true
            }
        ];

        for (const item of items) {
            const button =
                document.createElement("button");

            button.type = "button";
            button.className =
                "block-menu-item";

            if (item.danger) {
                button.classList.add(
                    "block-menu-item--danger"
                );
            }

            button.dataset.blockAction =
                item.action;

            button.innerHTML = `
                <span class="block-menu-item__icon"
                    aria-hidden="true">${item.icon}</span>
                <span class="block-menu-item__title">${item.title}</span>
            `;

            blockMenuElement.appendChild(button);
        }

        blockMenuElement.hidden = false;

        positionMenuNearElement(
            blockMenuElement,
            anchor
        );

        anchor.setAttribute(
            "aria-expanded",
            "true"
        );
    }

    /**
     * Handles block menu actions.
     *
     * @param {MouseEvent} event
     */
    function handleBlockMenuClick(event) {
        const button =
            event.target.closest(
                "[data-block-action]"
            );

        if (
            !button ||
            !activeMenuBlockId
        ) {
            return;
        }

        executeBlockAction(
            activeMenuBlockId,
            button.dataset.blockAction,
            button
        );
    }

    /**
     * Executes a block action.
     *
     * @param {string} blockId
     * @param {string} action
     * @param {HTMLElement} [anchor]
     */
    function executeBlockAction(
        blockId,
        action,
        anchor
    ) {
        if (action === "change-type") {
            openBlockTypeMenu(
                blockId,
                anchor ||
                    blockMenuElement
            );

            return;
        }

        closeAllMenus();

        switch (action) {
            case "duplicate":
                duplicateBlock(blockId);
                break;

            case "move-up":
                moveBlock(blockId, -1);
                break;

            case "move-down":
                moveBlock(blockId, 1);
                break;

            case "indent":
                indentBlock(blockId);
                break;

            case "outdent":
                outdentBlock(blockId);
                break;

            case "delete":
                deleteBlock(blockId);
                break;

            default:
                break;
        }
    }

    /**
     * Opens the block type menu.
     *
     * @param {string} blockId
     * @param {HTMLElement} anchor
     */
    function openBlockTypeMenu(
        blockId,
        anchor
    ) {
        activeMenuBlockId = blockId;

        blockTypeMenuElement.replaceChildren();

        const label =
            document.createElement("div");

        label.className =
            "slash-menu__label";

        label.textContent =
            "Turn into";

        blockTypeMenuElement.appendChild(label);

        for (
            const definition of
            BLOCK_DEFINITIONS
        ) {
            blockTypeMenuElement.appendChild(
                createBlockTypeMenuItem(
                    definition,
                    false,
                    "block-type"
                )
            );
        }

        const location =
            findBlockLocation(blockId);

        if (
            location?.block.type ===
            "toggle"
        ) {
            const styleLabel =
                document.createElement("div");

            styleLabel.className =
                "slash-menu__label";

            styleLabel.textContent =
                "Toggle title style";

            blockTypeMenuElement.appendChild(
                styleLabel
            );

            const toggleStyles = [
                {
                    value: "paragraph",
                    title: "Text",
                    icon: "T"
                },
                {
                    value: "heading-1",
                    title: "Heading 1",
                    icon: "H1"
                },
                {
                    value: "heading-2",
                    title: "Heading 2",
                    icon: "H2"
                }
            ];

            for (const style of toggleStyles) {
                const button =
                    document.createElement(
                        "button"
                    );

                button.type = "button";
                button.className =
                    "block-type-menu-item";

                button.dataset.toggleTitleStyle =
                    style.value;

                button.innerHTML = `
                    <span class="block-type-menu-item__icon"
                        aria-hidden="true">${style.icon}</span>
                    <span class="block-type-menu-item__content">
                        <span class="block-type-menu-item__title">
                            ${style.title}
                        </span>
                        <span class="block-type-menu-item__description">
                            Style the toggle title
                        </span>
                    </span>
                `;

                blockTypeMenuElement.appendChild(
                    button
                );
            }
        }

        blockMenuElement.hidden = true;
        blockTypeMenuElement.hidden = false;

        positionMenuNearElement(
            blockTypeMenuElement,
            anchor
        );
    }

    /**
     * Creates one type menu button.
     *
     * @param {Object} definition
     * @param {boolean} selected
     * @param {string} variant
     * @returns {HTMLButtonElement}
     */
    function createBlockTypeMenuItem(
        definition,
        selected,
        variant
    ) {
        const button =
            document.createElement("button");

        button.type = "button";

        button.className =
            variant === "slash"
                ? "slash-menu-item"
                : "block-type-menu-item";

        button.dataset.blockType =
            definition.type;

        button.setAttribute(
            "role",
            "menuitem"
        );

        if (variant === "slash") {
            button.setAttribute(
                "aria-selected",
                String(selected)
            );

            if (selected) {
                button.classList.add(
                    "slash-menu-item--active"
                );
            }
        }

        const prefix =
            variant === "slash"
                ? "slash-menu-item"
                : "block-type-menu-item";

        button.innerHTML = `
            <span class="${prefix}__icon"
                aria-hidden="true">${definition.icon}</span>
            <span class="${prefix}__content">
                <span class="${prefix}__title">
                    ${definition.title}
                </span>
                <span class="${prefix}__description">
                    ${definition.description}
                </span>
            </span>
        `;

        return button;
    }

    /**
     * Handles block type menu clicks.
     *
     * @param {MouseEvent} event
     */
    function handleBlockTypeMenuClick(event) {
        const typeButton =
            event.target.closest(
                "[data-block-type]"
            );

        if (
            typeButton &&
            activeMenuBlockId
        ) {
            changeBlockType(
                activeMenuBlockId,
                typeButton.dataset.blockType
            );

            closeAllMenus();
            return;
        }

        const styleButton =
            event.target.closest(
                "[data-toggle-title-style]"
            );

        if (
            styleButton &&
            activeMenuBlockId
        ) {
            changeToggleTitleStyle(
                activeMenuBlockId,
                styleButton.dataset
                    .toggleTitleStyle
            );

            closeAllMenus();
        }
    }

    // =========================================================================
    // Context menu
    // =========================================================================

    /**
     * Opens the custom context menu.
     *
     * @param {MouseEvent} event
     */
    function handleEditorContextMenu(event) {
        if (event.shiftKey) {
            return;
        }

        const blockElement =
            event.target.closest(
                ".editor-block"
            );

        if (!blockElement) {
            return;
        }

        event.preventDefault();

        saveCurrentSelection();

        activeMenuBlockId =
            blockElement.dataset.blockId;

        closeAllMenus();

        contextMenuElement.hidden = false;

        positionMenuAtPoint(
            contextMenuElement,
            event.clientX,
            event.clientY
        );
    }

    /**
     * Handles context menu actions.
     *
     * @param {MouseEvent} event
     */
    function handleContextMenuClick(event) {
        const formatButton =
            event.target.closest(
                "[data-format]"
            );

        if (formatButton) {
            restoreSavedSelection();

            applyInlineFormat(
                formatButton.dataset.format
            );

            closeAllMenus();
            return;
        }

        const actionButton =
            event.target.closest(
                "[data-context-action]"
            );

        if (
            actionButton &&
            activeMenuBlockId
        ) {
            executeBlockAction(
                activeMenuBlockId,
                actionButton.dataset
                    .contextAction,
                actionButton
            );
        }
    }

    // =========================================================================
    // Inline formatting
    // =========================================================================

    /**
     * Handles keyboard formatting shortcuts.
     *
     * @param {KeyboardEvent} event
     * @returns {boolean}
     */
    function handleFormattingShortcut(event) {
        const modifier =
            event.ctrlKey ||
            event.metaKey;

        if (!modifier) {
            return false;
        }

        const key =
            event.key.toLowerCase();

        if (key === "b") {
            event.preventDefault();
            applyInlineFormat("bold");
            return true;
        }

        if (key === "i") {
            event.preventDefault();
            applyInlineFormat("italic");
            return true;
        }

        if (
            event.shiftKey &&
            key === "h"
        ) {
            event.preventDefault();
            applyInlineFormat("highlight");
            return true;
        }

        return false;
    }

    /**
     * Applies inline formatting to the current selection.
     *
     * @param {string} format
     */
    function applyInlineFormat(format) {
        const commandMap = {
            bold: "bold",
            italic: "italic",
            strikethrough: "strikeThrough",
            clear: "removeFormat"
        };

        if (commandMap[format]) {
            document.execCommand(
                commandMap[format],
                false,
                null
            );
        } else if (format === "highlight") {
            toggleCustomInlineMark(
                "mark"
            );
        } else if (format === "code") {
            toggleCustomInlineMark(
                "code"
            );
        }

        synchronizeActiveEditable();
        updateSelectionToolbar();
    }

    /**
     * Toggles a custom inline element.
     *
     * @param {string} tagName
     */
    function toggleCustomInlineMark(tagName) {
        const selection =
            window.getSelection();

        if (
            !selection ||
            selection.rangeCount === 0 ||
            selection.isCollapsed
        ) {
            return;
        }

        const range =
            selection.getRangeAt(0);

        const ancestor =
            getClosestElement(
                range.commonAncestorContainer,
                tagName
            );

        if (ancestor) {
            unwrapElement(ancestor);
            return;
        }

        const wrapper =
            document.createElement(tagName);

        try {
            range.surroundContents(wrapper);

            selection.removeAllRanges();

            const nextRange =
                document.createRange();

            nextRange.selectNodeContents(
                wrapper
            );

            selection.addRange(nextRange);
        } catch (error) {
            const fragment =
                range.extractContents();

            wrapper.appendChild(fragment);
            range.insertNode(wrapper);

            selection.removeAllRanges();

            const nextRange =
                document.createRange();

            nextRange.selectNodeContents(
                wrapper
            );

            selection.addRange(nextRange);
        }
    }

    /**
     * Unwraps an element while preserving its children.
     *
     * @param {HTMLElement} element
     */
    function unwrapElement(element) {
        const parent =
            element.parentNode;

        while (element.firstChild) {
            parent.insertBefore(
                element.firstChild,
                element
            );
        }

        parent.removeChild(element);
    }

    /**
     * Handles selection toolbar clicks.
     *
     * @param {MouseEvent} event
     */
    function handleSelectionToolbarClick(event) {
        const button =
            event.target.closest(
                "[data-format]"
            );

        if (!button) {
            return;
        }

        restoreSavedSelection();

        applyInlineFormat(
            button.dataset.format
        );

        saveCurrentSelection();
    }

    /**
     * Shows or hides the selection toolbar.
     */
    function handleSelectionChange() {
        if (isRendering) {
            return;
        }

        const selection =
            window.getSelection();

        if (
            !selection ||
            selection.rangeCount === 0 ||
            selection.isCollapsed
        ) {
            hideSelectionToolbar();
            return;
        }

        const range =
            selection.getRangeAt(0);

        const contentElement =
            getClosestElement(
                range.commonAncestorContainer,
                ".block-content"
            );

        if (!contentElement) {
            hideSelectionToolbar();
            return;
        }

        saveCurrentSelection();
        showSelectionToolbar(range);
    }

    /**
     * Displays the selection toolbar.
     *
     * @param {Range} range
     */
    function showSelectionToolbar(range) {
        const rect =
            range.getBoundingClientRect();

        if (
            rect.width === 0 &&
            rect.height === 0
        ) {
            hideSelectionToolbar();
            return;
        }

        selectionToolbarElement.hidden =
            false;

        const toolbarRect =
            selectionToolbarElement
                .getBoundingClientRect();

        let left =
            rect.left +
            rect.width / 2 -
            toolbarRect.width / 2;

        let top =
            rect.top -
            toolbarRect.height -
            8;

        if (top < 8) {
            top =
                rect.bottom + 8;
        }

        left = clamp(
            left,
            8,
            window.innerWidth -
                toolbarRect.width -
                8
        );

        selectionToolbarElement.style.left =
            `${left}px`;

        selectionToolbarElement.style.top =
            `${top}px`;

        updateSelectionToolbar();
    }

    /**
     * Updates active formatting states.
     */
    function updateSelectionToolbar() {
        if (
            !selectionToolbarElement ||
            selectionToolbarElement.hidden
        ) {
            return;
        }

        const stateMap = {
            bold:
                document.queryCommandState(
                    "bold"
                ),
            italic:
                document.queryCommandState(
                    "italic"
                ),
            strikethrough:
                document.queryCommandState(
                    "strikeThrough"
                )
        };

        selectionToolbarElement
            .querySelectorAll("[data-format]")
            .forEach(button => {
                const format =
                    button.dataset.format;

                if (
                    Object.prototype
                        .hasOwnProperty.call(
                            stateMap,
                            format
                        )
                ) {
                    button.setAttribute(
                        "aria-pressed",
                        String(
                            stateMap[format]
                        )
                    );
                }
            });
    }

    /**
     * Hides the text selection toolbar.
     */
    function hideSelectionToolbar() {
        if (selectionToolbarElement) {
            selectionToolbarElement.hidden =
                true;
        }
    }

    /**
     * Synchronizes the currently focused editable block.
     */
    function synchronizeActiveEditable() {
        const selection =
            window.getSelection();

        if (
            !selection ||
            selection.rangeCount === 0
        ) {
            return;
        }

        const contentElement =
            getClosestElement(
                selection
                    .getRangeAt(0)
                    .commonAncestorContainer,
                ".block-content"
            );

        if (contentElement) {
            synchronizeContentElement(
                contentElement
            );
        }
    }

    // =========================================================================
    // Drag and drop
    // =========================================================================

    /**
     * Starts dragging a block.
     *
     * @param {DragEvent} event
     */
    function handleDragStart(event) {
        const handle =
            event.target.closest(
                ".block-handle"
            );

        if (!handle) {
            event.preventDefault();
            return;
        }

        const blockElement =
            handle.closest(
                ".editor-block"
            );

        draggedBlockId =
            blockElement?.dataset.blockId ||
            null;

        if (!draggedBlockId) {
            event.preventDefault();
            return;
        }

        event.dataTransfer.effectAllowed =
            "move";

        event.dataTransfer.setData(
            "text/plain",
            draggedBlockId
        );

        blockElement.classList.add(
            "is-dragging"
        );

        showDragPreview(
            event,
            draggedBlockId
        );
    }

    /**
     * Updates the current drop target.
     *
     * @param {DragEvent} event
     */
    function handleDragOver(event) {
        if (!draggedBlockId) {
            return;
        }

        const targetElement =
            event.target.closest(
                ".editor-block"
            );

        if (!targetElement) {
            return;
        }

        const targetId =
            targetElement.dataset.blockId;

        if (
            !targetId ||
            targetId === draggedBlockId
        ) {
            return;
        }

        const draggedLocation =
            findBlockLocation(
                draggedBlockId
            );

        if (
            draggedLocation &&
            blockContainsId(
                draggedLocation.block,
                targetId
            )
        ) {
            return;
        }

        event.preventDefault();

        event.dataTransfer.dropEffect =
            "move";

        const rect =
            targetElement.getBoundingClientRect();

        const relativeY =
            event.clientY - rect.top;

        let position = "after";

        if (
            relativeY <
            rect.height * 0.35
        ) {
            position = "before";
        } else if (
            relativeY >
            rect.height * 0.65
        ) {
            position = "after";
        } else {
            const targetLocation =
                findBlockLocation(targetId);

            position =
                targetLocation?.block.type ===
                "toggle"
                    ? "inside"
                    : "after";
        }

        dropTarget = {
            targetId,
            position
        };

        showDropIndicator(
            targetElement,
            position
        );

        moveDragPreview(event);
    }

    /**
     * Drops a block.
     *
     * @param {DragEvent} event
     */
    function handleDrop(event) {
        if (
            !draggedBlockId ||
            !dropTarget
        ) {
            clearDragState();
            return;
        }

        event.preventDefault();

        const sourceLocation =
            findBlockLocation(
                draggedBlockId
            );

        const targetLocation =
            findBlockLocation(
                dropTarget.targetId
            );

        if (
            !sourceLocation ||
            !targetLocation ||
            sourceLocation.block.id ===
                targetLocation.block.id
        ) {
            clearDragState();
            return;
        }

        const [draggedBlock] =
            sourceLocation.collection.splice(
                sourceLocation.index,
                1
            );

        const refreshedTarget =
            findBlockLocation(
                dropTarget.targetId
            );

        if (!refreshedTarget) {
            sourceLocation.collection.splice(
                sourceLocation.index,
                0,
                draggedBlock
            );

            clearDragState();
            return;
        }

        if (dropTarget.position === "inside") {
            refreshedTarget.block.children.push(
                draggedBlock
            );

            if (
                refreshedTarget.block.type ===
                "toggle"
            ) {
                refreshedTarget.block.open =
                    true;
            }
        } else {
            const insertionIndex =
                refreshedTarget.index +
                (
                    dropTarget.position ===
                    "after"
                        ? 1
                        : 0
                );

            refreshedTarget.collection.splice(
                insertionIndex,
                0,
                draggedBlock
            );
        }

        clearDragState();

        render({
            blockId: draggedBlock.id,
            position: "end"
        });

        emitChange();
    }

    /**
     * Ends drag mode.
     */
    function handleDragEnd() {
        clearDragState();
    }

    /**
     * Shows the drop indicator.
     *
     * @param {HTMLElement} targetElement
     * @param {string} position
     */
    function showDropIndicator(
        targetElement,
        position
    ) {
        const rect =
            targetElement.getBoundingClientRect();

        dropIndicatorElement.hidden = false;

        if (position === "inside") {
            dropIndicatorElement.style.left =
                `${rect.left + 34}px`;

            dropIndicatorElement.style.top =
                `${rect.bottom - 3}px`;

            dropIndicatorElement.style.width =
                `${Math.max(
                    40,
                    rect.width - 40
                )}px`;
        } else {
            const top =
                position === "before"
                    ? rect.top
                    : rect.bottom;

            dropIndicatorElement.style.left =
                `${rect.left + 28}px`;

            dropIndicatorElement.style.top =
                `${top - 1}px`;

            dropIndicatorElement.style.width =
                `${Math.max(
                    40,
                    rect.width - 32
                )}px`;
        }
    }

    /**
     * Shows a small drag preview.
     *
     * @param {DragEvent} event
     * @param {string} blockId
     */
    function showDragPreview(
        event,
        blockId
    ) {
        const location =
            findBlockLocation(blockId);

        if (!location) {
            return;
        }

        const definition =
            BLOCK_DEFINITION_MAP.get(
                location.block.type
            );

        const text =
            Storage.richTextToPlainText(
                location.block.content
            );

        dragPreviewElement.textContent =
            `${definition?.title || "Block"}: ${
                text || "Empty block"
            }`;

        dragPreviewElement.hidden = false;

        moveDragPreview(event);
    }

    /**
     * Moves the drag preview.
     *
     * @param {DragEvent} event
     */
    function moveDragPreview(event) {
        if (
            !dragPreviewElement ||
            dragPreviewElement.hidden
        ) {
            return;
        }

        dragPreviewElement.style.left =
            `${event.clientX + 14}px`;

        dragPreviewElement.style.top =
            `${event.clientY + 14}px`;
    }

    /**
     * Clears drag-related state.
     */
    function clearDragState() {
        if (draggedBlockId) {
            getBlockElement(
                draggedBlockId
            )?.classList.remove(
                "is-dragging"
            );
        }

        draggedBlockId = null;
        dropTarget = null;

        if (dropIndicatorElement) {
            dropIndicatorElement.hidden =
                true;
        }

        if (dragPreviewElement) {
            dragPreviewElement.hidden =
                true;
        }
    }

    // =========================================================================
    // List numbering
    // =========================================================================

    /**
     * Updates visible numbered-list markers.
     */
    function refreshListNumbers() {
        function visit(container) {
            let currentNumber = 0;

            const blocks =
                Array.from(
                    container.children
                ).filter(element =>
                    element.classList.contains(
                        "editor-block"
                    )
                );

            for (const blockElement of blocks) {
                const blockType =
                    blockElement.dataset.blockType;

                if (
                    blockType ===
                    "numbered-list"
                ) {
                    currentNumber += 1;

                    const prefix =
                        blockElement.querySelector(
                            ":scope > .editor-block__body > .block-content-row > .block-prefix"
                        );

                    if (prefix) {
                        prefix.dataset.listNumber =
                            String(currentNumber);
                    }
                } else {
                    currentNumber = 0;
                }

                const children =
                    blockElement.querySelector(
                        ":scope > .editor-block__body > .block-children"
                    );

                if (children) {
                    visit(children);
                }
            }
        }

        visit(blockListElement);
    }

    // =========================================================================
    // Selection and caret helpers
    // =========================================================================

    /**
     * Saves the current browser selection.
     */
    function saveCurrentSelection() {
        const selection =
            window.getSelection();

        if (
            selection &&
            selection.rangeCount > 0
        ) {
            savedSelection =
                selection
                    .getRangeAt(0)
                    .cloneRange();
        }
    }

    /**
     * Restores the saved selection.
     */
    function restoreSavedSelection() {
        if (!savedSelection) {
            return;
        }

        const selection =
            window.getSelection();

        selection.removeAllRanges();
        selection.addRange(savedSelection);
    }

    /**
     * Focuses a block at a requested position.
     *
     * @param {string} blockId
     * @param {number} [offset]
     * @param {string} [position]
     */
    function focusBlock(
        blockId,
        offset,
        position
    ) {
        const contentElement =
            getContentElement(blockId);

        if (!contentElement) {
            return;
        }

        contentElement.focus();

        let targetOffset =
            typeof offset === "number"
                ? offset
                : (
                    position === "start"
                        ? 0
                        : getContentTextLength(
                            contentElement
                        )
                );

        targetOffset = clamp(
            targetOffset,
            0,
            getContentTextLength(
                contentElement
            )
        );

        setCaretOffset(
            contentElement,
            targetOffset
        );
    }

    /**
     * Returns the caret offset within an editable element.
     *
     * @param {HTMLElement} element
     * @returns {number}
     */
    function getCaretOffset(element) {
        const selection =
            window.getSelection();

        if (
            !selection ||
            selection.rangeCount === 0
        ) {
            return 0;
        }

        const range =
            selection.getRangeAt(0);

        if (
            !element.contains(
                range.startContainer
            ) &&
            range.startContainer !== element
        ) {
            return 0;
        }

        const clone =
            range.cloneRange();

        clone.selectNodeContents(element);
        clone.setEnd(
            range.startContainer,
            range.startOffset
        );

        return clone.toString().length;
    }

    /**
     * Sets the caret at a text offset.
     *
     * @param {HTMLElement} element
     * @param {number} offset
     */
    function setCaretOffset(element, offset) {
        const range =
            document.createRange();

        const selection =
            window.getSelection();

        let remaining = offset;
        let targetNode = element;
        let targetOffset = 0;

        const walker =
            document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT
            );

        let node;

        while (
            (node = walker.nextNode())
        ) {
            if (
                remaining <=
                node.nodeValue.length
            ) {
                targetNode = node;
                targetOffset = remaining;
                break;
            }

            remaining -=
                node.nodeValue.length;

            targetNode = node;
            targetOffset =
                node.nodeValue.length;
        }

        range.setStart(
            targetNode,
            targetOffset
        );

        range.collapse(true);

        selection.removeAllRanges();
        selection.addRange(range);
    }

    /**
     * Returns whether the browser selection is collapsed.
     *
     * @returns {boolean}
     */
    function isSelectionCollapsed() {
        const selection =
            window.getSelection();

        return (
            !selection ||
            selection.isCollapsed
        );
    }

    /**
     * Returns the plain-text length of an editable.
     *
     * @param {HTMLElement} element
     * @returns {number}
     */
    function getContentTextLength(element) {
        return (
            element.textContent || ""
        ).length;
    }

    // =========================================================================
    // Rich-text array helpers
    // =========================================================================

    /**
     * Splits structured rich text at a plain-text offset.
     *
     * @param {*} content
     * @param {number} offset
     * @returns {{before:Array<Object>, after:Array<Object>}}
     */
    function splitRichTextAtOffset(
        content,
        offset
    ) {
        const segments =
            Storage.normalizeRichText(content);

        const before = [];
        const after = [];

        let consumed = 0;

        for (const segment of segments) {
            const start = consumed;
            const end =
                consumed +
                segment.text.length;

            if (end <= offset) {
                before.push(
                    cloneSegment(segment)
                );
            } else if (start >= offset) {
                after.push(
                    cloneSegment(segment)
                );
            } else {
                const splitIndex =
                    offset - start;

                const firstText =
                    segment.text.slice(
                        0,
                        splitIndex
                    );

                const secondText =
                    segment.text.slice(
                        splitIndex
                    );

                if (firstText) {
                    before.push(
                        createSegmentFrom(
                            segment,
                            firstText
                        )
                    );
                }

                if (secondText) {
                    after.push(
                        createSegmentFrom(
                            segment,
                            secondText
                        )
                    );
                }
            }

            consumed = end;
        }

        return {
            before:
                Storage.normalizeRichText(
                    before
                ),
            after:
                Storage.normalizeRichText(
                    after
                )
        };
    }

    /**
     * Concatenates two rich-text collections.
     *
     * @param {*} first
     * @param {*} second
     * @returns {Array<Object>}
     */
    function concatenateRichText(
        first,
        second
    ) {
        return Storage.normalizeRichText([
            ...Storage.normalizeRichText(
                first
            ),
            ...Storage.normalizeRichText(
                second
            )
        ]);
    }

    /**
     * Clones one rich-text segment.
     *
     * @param {Object} segment
     * @returns {Object}
     */
    function cloneSegment(segment) {
        return createSegmentFrom(
            segment,
            segment.text
        );
    }

    /**
     * Creates a segment preserving its marks.
     *
     * @param {Object} source
     * @param {string} text
     * @returns {Object}
     */
    function createSegmentFrom(
        source,
        text
    ) {
        const segment = { text };

        const marks =
            Storage.normalizeMarks(
                source.marks
            );

        if (marks.length > 0) {
            segment.marks = marks;
        }

        return segment;
    }

    // =========================================================================
    // Menu positioning
    // =========================================================================

    /**
     * Positions a menu near the caret.
     *
     * @param {HTMLElement} menu
     */
    function positionMenuNearCaret(menu) {
        const selection =
            window.getSelection();

        if (
            !selection ||
            selection.rangeCount === 0
        ) {
            return;
        }

        const range =
            selection.getRangeAt(0);

        let rect =
            range.getBoundingClientRect();

        if (
            rect.width === 0 &&
            rect.height === 0
        ) {
            const contentElement =
                getClosestElement(
                    range.startContainer,
                    ".block-content"
                );

            rect =
                contentElement
                    ?.getBoundingClientRect() ||
                rect;
        }

        positionMenuAtPoint(
            menu,
            rect.left,
            rect.bottom + 6
        );
    }

    /**
     * Positions a menu near an element.
     *
     * @param {HTMLElement} menu
     * @param {HTMLElement} anchor
     */
    function positionMenuNearElement(
        menu,
        anchor
    ) {
        const rect =
            anchor.getBoundingClientRect();

        positionMenuAtPoint(
            menu,
            rect.right + 6,
            rect.top
        );
    }

    /**
     * Positions and clamps a menu in the viewport.
     *
     * @param {HTMLElement} menu
     * @param {number} left
     * @param {number} top
     */
    function positionMenuAtPoint(
        menu,
        left,
        top
    ) {
        menu.hidden = false;

        menu.style.left = "0px";
        menu.style.top = "0px";

        const rect =
            menu.getBoundingClientRect();

        let nextLeft =
            clamp(
                left,
                8,
                window.innerWidth -
                    rect.width -
                    8
            );

        let nextTop =
            top;

        if (
            nextTop + rect.height >
            window.innerHeight - 8
        ) {
            nextTop =
                Math.max(
                    8,
                    window.innerHeight -
                        rect.height -
                        8
                );
        }

        menu.style.left =
            `${nextLeft}px`;

        menu.style.top =
            `${nextTop}px`;
    }

    /**
     * Closes all editor menus.
     */
    function closeAllMenus() {
        closeSlashMenu();

        const menus = [
            blockMenuElement,
            blockTypeMenuElement,
            contextMenuElement
        ];

        for (const menu of menus) {
            if (menu) {
                menu.hidden = true;
            }
        }

        document
            .querySelectorAll(
                ".block-handle[aria-expanded='true']"
            )
            .forEach(handle => {
                handle.setAttribute(
                    "aria-expanded",
                    "false"
                );
            });

        activeMenuBlockId = null;
    }

    // =========================================================================
    // DOM helpers
    // =========================================================================

    /**
     * Returns a rendered block element.
     *
     * @param {string} blockId
     * @returns {HTMLElement|null}
     */
    function getBlockElement(blockId) {
        return blockListElement.querySelector(
            `.editor-block[data-block-id="${escapeSelector(
                blockId
            )}"]`
        );
    }

    /**
     * Returns a block's content element.
     *
     * @param {string} blockId
     * @returns {HTMLElement|null}
     */
    function getContentElement(blockId) {
        return blockListElement.querySelector(
            `.block-content[data-block-id="${escapeSelector(
                blockId
            )}"]`
        );
    }

    /**
     * Escapes a CSS selector value.
     *
     * @param {string} value
     * @returns {string}
     */
    function escapeSelector(value) {
        if (
            window.CSS &&
            typeof window.CSS.escape ===
                "function"
        ) {
            return window.CSS.escape(value);
        }

        return String(value).replace(
            /["\\]/g,
            "\\$&"
        );
    }

    /**
     * Finds the closest matching element from a node.
     *
     * @param {Node} node
     * @param {string} selector
     * @returns {HTMLElement|null}
     */
    function getClosestElement(
        node,
        selector
    ) {
        const element =
            node?.nodeType ===
            Node.ELEMENT_NODE
                ? node
                : node?.parentElement;

        return element?.closest(selector) ||
            null;
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
    // Document access
    // =========================================================================

    /**
     * Replaces the current document.
     *
     * @param {*} nextDocument
     */
    function setDocument(nextDocument) {
        documentModel =
            Storage.normalizeDocument(
                nextDocument
            );

        render();
    }

    /**
     * Returns a safe copy of the current document.
     *
     * @returns {Object}
     */
    function getDocument() {
        synchronizeAllBlocks();

        return Storage.cloneDocument(
            documentModel
        );
    }

    /**
     * Focuses the first block.
     */
    function focusFirstBlock() {
        const firstBlock =
            documentModel.blocks[0];

        if (firstBlock) {
            focusBlock(
                firstBlock.id,
                0
            );
        }
    }

    // =========================================================================
    // Public API
    // =========================================================================

    const publicApi =
        Object.freeze({
            initialize,
            render,
            getDocument,
            setDocument,
            appendBlock,
            focusFirstBlock,
            focusBlock,
            closeMenus: closeAllMenus,
            synchronize: synchronizeAllBlocks
        });

    window.NoteUEditor =
        publicApi;
})();
