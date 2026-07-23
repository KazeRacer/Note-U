/**
 * Note-U
 * Version: 0.2.0
 *
 * Block editor engine.
 *
 * This module is responsible for:
 * - rendering the JSON document model;
 * - editing block content;
 * - creating, deleting and duplicating blocks;
 * - moving blocks;
 * - changing block types;
 * - splitting and merging blocks;
 * - nesting blocks;
 * - checklist state;
 * - slash commands;
 * - block action menus;
 * - focus and caret management.
 *
 * The document model remains the source of truth.
 * The DOM is only a visual representation of that model.
 */

(function () {
    "use strict";

    // =========================================================================
    // Constants
    // =========================================================================

    const DEFAULT_BLOCK_TYPE = "paragraph";

    const EDITABLE_BLOCK_TYPES = Object.freeze([
        "paragraph",
        "heading-1",
        "heading-2",
        "bullet-list",
        "numbered-list",
        "checklist",
        "quote"
    ]);

    const BLOCK_TYPE_DEFINITIONS = Object.freeze({
        paragraph: {
            name: "Text",
            description: "Plain text block",
            icon: "T",
            placeholder: "Type '/' for commands"
        },

        "heading-1": {
            name: "Heading 1",
            description: "Large section heading",
            icon: "H1",
            placeholder: "Heading 1"
        },

        "heading-2": {
            name: "Heading 2",
            description: "Medium section heading",
            icon: "H2",
            placeholder: "Heading 2"
        },

        "bullet-list": {
            name: "Bulleted list",
            description: "List with bullet points",
            icon: "•",
            placeholder: "List item"
        },

        "numbered-list": {
            name: "Numbered list",
            description: "Ordered list of items",
            icon: "1.",
            placeholder: "List item"
        },

        checklist: {
            name: "Checklist",
            description: "Track completed tasks",
            icon: "☑",
            placeholder: "To-do"
        },

        quote: {
            name: "Quote",
            description: "Highlighted quotation",
            icon: "“",
            placeholder: "Quote"
        },

        divider: {
            name: "Divider",
            description: "Horizontal separator",
            icon: "—",
            placeholder: ""
        }
    });

    // =========================================================================
    // Internal state
    // =========================================================================

    let elements = null;
    let currentDocument = null;
    let changeHandler = null;

    let activeBlockId = null;
    let activeMenuBlockId = null;
    let slashMenuBlockId = null;
    let slashMenuSelectionIndex = 0;
    let filteredSlashCommands = [];

    let isInitialized = false;
    let isRendering = false;

    // =========================================================================
    // Initialization
    // =========================================================================

    /**
     * Initializes the editor.
     *
     * @param {Object} options
     * @param {HTMLElement} options.editorRoot
     * @param {HTMLElement} options.blockListElement
     * @param {HTMLTemplateElement} options.blockTemplate
     * @param {Object} options.documentModel
     * @param {Function} [options.onChange]
     */
    function initialize(options) {
        if (!options || typeof options !== "object") {
            throw new TypeError(
                "Note-U editor initialization options are required."
            );
        }

        elements = {
            editorRoot: options.editorRoot,
            blockList: options.blockListElement,
            blockTemplate: options.blockTemplate,
            blockMenu: document.getElementById("block-menu"),
            blockTypeMenu: document.getElementById("block-type-menu"),
            slashMenu: document.getElementById("slash-menu"),
            slashMenuSearch:
                document.getElementById("slash-menu-search"),
            slashMenuList:
                document.getElementById("slash-menu-list"),
            slashMenuEmpty:
                document.getElementById("slash-menu-empty")
        };

        validateElements();

        changeHandler =
            typeof options.onChange === "function"
                ? options.onChange
                : null;

        currentDocument =
            window.NoteUStorage.normalizeDocument(
                options.documentModel
            );

        bindEvents();
        render();

        isInitialized = true;
    }

    /**
     * Validates required editor elements.
     */
    function validateElements() {
        const missingElements = Object.entries(elements)
            .filter(([, value]) => !value)
            .map(([name]) => name);

        if (missingElements.length > 0) {
            throw new Error(
                `Note-U editor is missing required elements: ${missingElements.join(", ")}`
            );
        }
    }

    /**
     * Ensures that the editor has been initialized.
     */
    function requireInitialization() {
        if (!isInitialized || !elements) {
            throw new Error(
                "Note-U editor has not been initialized."
            );
        }
    }

    // =========================================================================
    // Event binding
    // =========================================================================

    /**
     * Registers editor event listeners.
     */
    function bindEvents() {
        elements.blockList.addEventListener(
            "input",
            handleBlockInput
        );

        elements.blockList.addEventListener(
            "keydown",
            handleBlockKeyDown
        );

        elements.blockList.addEventListener(
            "click",
            handleBlockClick
        );

        elements.blockList.addEventListener(
            "focusin",
            handleBlockFocusIn
        );

        elements.blockList.addEventListener(
            "paste",
            handleBlockPaste
        );

        elements.blockMenu.addEventListener(
            "click",
            handleBlockMenuClick
        );

        elements.blockTypeMenu.addEventListener(
            "click",
            handleBlockTypeMenuClick
        );

        elements.slashMenu.addEventListener(
            "click",
            handleSlashMenuClick
        );

        elements.slashMenuSearch.addEventListener(
            "input",
            handleSlashMenuSearch
        );

        elements.slashMenuSearch.addEventListener(
            "keydown",
            handleSlashMenuKeyDown
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
            repositionOpenMenus
        );

        window.addEventListener(
            "scroll",
            repositionOpenMenus,
            {
                passive: true
            }
        );
    }

    // =========================================================================
    // Document API
    // =========================================================================

    /**
     * Returns a clone of the current document.
     *
     * @returns {Object}
     */
    function getDocument() {
        requireInitialization();

        synchronizeModelFromDom();

        return window.NoteUStorage.cloneDocument(
            currentDocument
        );
    }

    /**
     * Replaces the current document.
     *
     * @param {*} nextDocument
     */
    function setDocument(nextDocument) {
        currentDocument =
            window.NoteUStorage.normalizeDocument(
                nextDocument
            );

        closeAllMenus();
        render();
    }

    /**
     * Renders the current document.
     */
    function render() {
        if (!elements) {
            return;
        }

        isRendering = true;

        try {
            const fragment =
                document.createDocumentFragment();

            currentDocument.blocks.forEach(
                (block, index) => {
                    fragment.appendChild(
                        renderBlock(block, {
                            index,
                            parentBlocks:
                                currentDocument.blocks
                        })
                    );
                }
            );

            elements.blockList.replaceChildren(fragment);
            updateNumberedListPrefixes();
        } finally {
            isRendering = false;
        }
    }

    /**
     * Renders one block recursively.
     *
     * @param {Object} block
     * @param {Object} context
     * @param {number} context.index
     * @param {Array<Object>} context.parentBlocks
     * @returns {HTMLElement}
     */
    function renderBlock(block, context) {
        const templateContent =
            elements.blockTemplate.content.cloneNode(true);

        const blockElement =
            templateContent.querySelector(".block");

        const contentElement =
            templateContent.querySelector(
                ".block__content"
            );

        const prefixElement =
            templateContent.querySelector(
                ".block__prefix"
            );

        blockElement.dataset.blockId = block.id;
        blockElement.dataset.blockType = block.type;

        applyBlockTypeClass(
            blockElement,
            block.type
        );

        contentElement.dataset.blockId = block.id;
        contentElement.dataset.placeholder =
            getBlockDefinition(block.type).placeholder;

        contentElement.textContent =
            typeof block.content === "string"
                ? block.content
                : "";

        contentElement.setAttribute(
            "contenteditable",
            isEditableBlockType(block.type)
                ? "true"
                : "false"
        );

        if (block.type === "checklist") {
            renderChecklistPrefix(
                block,
                blockElement,
                prefixElement
            );
        }

        if (block.type === "numbered-list") {
            prefixElement.dataset.numberedPrefix = "true";
        }

        if (block.type === "divider") {
            contentElement.setAttribute(
                "aria-hidden",
                "true"
            );
        }

        const childrenElement =
            document.createElement("div");

        childrenElement.className =
            "block__children";

        childrenElement.dataset.parentBlockId =
            block.id;

        if (Array.isArray(block.children)) {
            block.children.forEach(
                (childBlock, childIndex) => {
                    childrenElement.appendChild(
                        renderBlock(childBlock, {
                            index: childIndex,
                            parentBlocks:
                                block.children
                        })
                    );
                }
            );
        }

        blockElement.appendChild(childrenElement);

        return blockElement;
    }

    /**
     * Renders the checklist checkbox.
     *
     * @param {Object} block
     * @param {HTMLElement} blockElement
     * @param {HTMLElement} prefixElement
     */
    function renderChecklistPrefix(
        block,
        blockElement,
        prefixElement
    ) {
        const checkbox =
            document.createElement("input");

        checkbox.type = "checkbox";
        checkbox.className = "block__checkbox";
        checkbox.checked = Boolean(block.checked);
        checkbox.dataset.blockId = block.id;
        checkbox.setAttribute(
            "aria-label",
            "Mark task as completed"
        );

        blockElement.dataset.checked =
            checkbox.checked ? "true" : "false";

        prefixElement.replaceChildren(checkbox);
    }

    // =========================================================================
    // Block creation
    // =========================================================================

    /**
     * Creates a normalized block.
     *
     * @param {string} [type]
     * @param {Object} [properties]
     * @returns {Object}
     */
    function createBlock(
        type = DEFAULT_BLOCK_TYPE,
        properties = {}
    ) {
        const normalizedType =
            normalizeBlockType(type);

        const block = {
            id: window.NoteUStorage.createId(),
            type: normalizedType,
            content:
                typeof properties.content === "string"
                    ? properties.content
                    : "",
            children: Array.isArray(properties.children)
                ? properties.children
                : []
        };

        if (normalizedType === "checklist") {
            block.checked =
                Boolean(properties.checked);
        }

        return block;
    }

    /**
     * Adds a block to the root document.
     *
     * @param {Object} [options]
     * @param {string} [options.type]
     * @param {boolean} [options.focus]
     * @returns {Object}
     */
    function addBlock(options = {}) {
        requireInitialization();

        synchronizeModelFromDom();

        const block =
            createBlock(options.type);

        currentDocument.blocks.push(block);

        render();
        notifyChange("add-block");

        if (options.focus !== false) {
            focusBlock(block.id);
        }

        return block;
    }

    /**
     * Inserts a block after another block.
     *
     * @param {string} blockId
     * @param {Object} [options]
     * @param {string} [options.type]
     * @param {string} [options.content]
     * @param {boolean} [options.focus]
     * @returns {Object|null}
     */
    function insertBlockAfter(
        blockId,
        options = {}
    ) {
        synchronizeModelFromDom();

        const context =
            findBlockContext(blockId);

        if (!context) {
            return null;
        }

        const block =
            createBlock(
                options.type,
                {
                    content:
                        options.content || ""
                }
            );

        context.parentBlocks.splice(
            context.index + 1,
            0,
            block
        );

        render();
        notifyChange("insert-block");

        if (options.focus !== false) {
            focusBlock(block.id);
        }

        return block;
    }

    // =========================================================================
    // Input synchronization
    // =========================================================================

    /**
     * Handles editable block input.
     *
     * @param {InputEvent} event
     */
    function handleBlockInput(event) {
        const contentElement =
            getContentElementFromTarget(
                event.target
            );

        if (!contentElement) {
            return;
        }

        const blockId =
            contentElement.dataset.blockId;

        const context =
            findBlockContext(blockId);

        if (!context) {
            return;
        }

        context.block.content =
            getPlainText(contentElement);

        notifyChange("edit-block");

        if (
            context.block.content.startsWith("/") &&
            !context.block.content.includes("\n")
        ) {
            openSlashMenu(
                blockId,
                context.block.content.slice(1)
            );
        } else {
            closeSlashMenu();
        }
    }

    /**
     * Synchronizes all editable DOM content into the model.
     */
    function synchronizeModelFromDom() {
        if (!elements || isRendering) {
            return;
        }

        const contentElements =
            elements.blockList.querySelectorAll(
                ".block__content[data-block-id]"
            );

        for (const contentElement of contentElements) {
            const blockId =
                contentElement.dataset.blockId;

            const context =
                findBlockContext(blockId);

            if (
                context &&
                isEditableBlockType(
                    context.block.type
                )
            ) {
                context.block.content =
                    getPlainText(contentElement);
            }
        }

        const checkboxes =
            elements.blockList.querySelectorAll(
                ".block__checkbox[data-block-id]"
            );

        for (const checkbox of checkboxes) {
            const context =
                findBlockContext(
                    checkbox.dataset.blockId
                );

            if (context) {
                context.block.checked =
                    checkbox.checked;
            }
        }
    }

    // =========================================================================
    // Keyboard behavior
    // =========================================================================

    /**
     * Handles keyboard interaction inside block content.
     *
     * @param {KeyboardEvent} event
     */
    function handleBlockKeyDown(event) {
        const contentElement =
            getContentElementFromTarget(
                event.target
            );

        if (!contentElement) {
            return;
        }

        const blockId =
            contentElement.dataset.blockId;

        if (
            !elements.slashMenu.hidden &&
            slashMenuBlockId === blockId
        ) {
            if (
                event.key === "ArrowDown" ||
                event.key === "ArrowUp" ||
                event.key === "Enter" ||
                event.key === "Escape"
            ) {
                handleSlashNavigationFromEditor(
                    event
                );

                return;
            }
        }

        if (event.key === "Enter") {
            if (event.shiftKey) {
                return;
            }

            event.preventDefault();
            splitBlockAtCaret(
                blockId,
                contentElement
            );

            return;
        }

        if (event.key === "Backspace") {
            handleBackspaceAtBlockStart(
                event,
                blockId,
                contentElement
            );

            return;
        }

        if (event.key === "Delete") {
            handleDeleteAtBlockEnd(
                event,
                blockId,
                contentElement
            );

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

        if (
            event.key === "ArrowUp" &&
            isCaretAtStart(contentElement)
        ) {
            const previousBlock =
                getPreviousBlock(blockId);

            if (previousBlock) {
                event.preventDefault();
                focusBlock(
                    previousBlock.id,
                    "end"
                );
            }

            return;
        }

        if (
            event.key === "ArrowDown" &&
            isCaretAtEnd(contentElement)
        ) {
            const nextBlock =
                getNextBlock(blockId);

            if (nextBlock) {
                event.preventDefault();
                focusBlock(
                    nextBlock.id,
                    "start"
                );
            }
        }
    }

    /**
     * Splits a block at the current caret position.
     *
     * @param {string} blockId
     * @param {HTMLElement} contentElement
     */
    function splitBlockAtCaret(
        blockId,
        contentElement
    ) {
        synchronizeModelFromDom();

        const context =
            findBlockContext(blockId);

        if (!context) {
            return;
        }

        const caretOffset =
            getCaretOffset(contentElement);

        const content =
            context.block.content || "";

        const leftContent =
            content.slice(0, caretOffset);

        const rightContent =
            content.slice(caretOffset);

        if (
            content.length === 0 &&
            context.block.type !== "paragraph"
        ) {
            context.block.type = "paragraph";

            if (
                Object.prototype.hasOwnProperty.call(
                    context.block,
                    "checked"
                )
            ) {
                delete context.block.checked;
            }

            render();
            notifyChange("reset-empty-block");
            focusBlock(blockId, "start");

            return;
        }

        context.block.content =
            leftContent;

        const nextBlock =
            createBlock(
                getContinuationBlockType(
                    context.block.type
                ),
                {
                    content: rightContent
                }
            );

        context.parentBlocks.splice(
            context.index + 1,
            0,
            nextBlock
        );

        render();
        notifyChange("split-block");
        focusBlock(nextBlock.id, "start");
    }

    /**
     * Handles Backspace at the start of a block.
     *
     * @param {KeyboardEvent} event
     * @param {string} blockId
     * @param {HTMLElement} contentElement
     */
    function handleBackspaceAtBlockStart(
        event,
        blockId,
        contentElement
    ) {
        if (!isCaretAtStart(contentElement)) {
            return;
        }

        const context =
            findBlockContext(blockId);

        if (!context) {
            return;
        }

        if (
            context.block.content === "" &&
            context.block.type !== "paragraph"
        ) {
            event.preventDefault();
            changeBlockType(
                blockId,
                "paragraph"
            );

            return;
        }

        const previousBlock =
            getPreviousBlock(blockId);

        if (!previousBlock) {
            return;
        }

        event.preventDefault();
        mergeBlockWithPrevious(blockId);
    }

    /**
     * Handles Delete at the end of a block.
     *
     * @param {KeyboardEvent} event
     * @param {string} blockId
     * @param {HTMLElement} contentElement
     */
    function handleDeleteAtBlockEnd(
        event,
        blockId,
        contentElement
    ) {
        if (!isCaretAtEnd(contentElement)) {
            return;
        }

        const nextBlock =
            getNextBlock(blockId);

        if (!nextBlock) {
            return;
        }

        event.preventDefault();
        mergeNextBlockIntoCurrent(blockId);
    }

    // =========================================================================
    // Block merging
    // =========================================================================

    /**
     * Merges a block into the previous visible block.
     *
     * @param {string} blockId
     */
    function mergeBlockWithPrevious(blockId) {
        synchronizeModelFromDom();

        const context =
            findBlockContext(blockId);

        const previousBlock =
            getPreviousBlock(blockId);

        if (
            !context ||
            !previousBlock ||
            previousBlock.type === "divider"
        ) {
            return;
        }

        const previousLength =
            previousBlock.content.length;

        previousBlock.content +=
            context.block.content;

        if (
            Array.isArray(context.block.children) &&
            context.block.children.length > 0
        ) {
            previousBlock.children.push(
                ...context.block.children
            );
        }

        context.parentBlocks.splice(
            context.index,
            1
        );

        ensureDocumentHasBlock();

        render();
        notifyChange("merge-block");
        focusBlock(
            previousBlock.id,
            previousLength
        );
    }

    /**
     * Merges the next visible block into the current block.
     *
     * @param {string} blockId
     */
    function mergeNextBlockIntoCurrent(blockId) {
        synchronizeModelFromDom();

        const currentContext =
            findBlockContext(blockId);

        const nextBlock =
            getNextBlock(blockId);

        if (
            !currentContext ||
            !nextBlock ||
            currentContext.block.type === "divider"
        ) {
            return;
        }

        const currentLength =
            currentContext.block.content.length;

        currentContext.block.content +=
            nextBlock.content;

        if (
            Array.isArray(nextBlock.children) &&
            nextBlock.children.length > 0
        ) {
            currentContext.block.children.push(
                ...nextBlock.children
            );
        }

        removeBlockFromModel(nextBlock.id);
        ensureDocumentHasBlock();

        render();
        notifyChange("merge-next-block");
        focusBlock(
            currentContext.block.id,
            currentLength
        );
    }

    // =========================================================================
    // Block deletion and duplication
    // =========================================================================

    /**
     * Removes a block.
     *
     * @param {string} blockId
     * @param {Object} [options]
     * @param {boolean} [options.focus]
     * @returns {boolean}
     */
    function removeBlock(
        blockId,
        options = {}
    ) {
        synchronizeModelFromDom();

        const previousBlock =
            getPreviousBlock(blockId);

        const nextBlock =
            getNextBlock(blockId);

        const removed =
            removeBlockFromModel(blockId);

        if (!removed) {
            return false;
        }

        ensureDocumentHasBlock();

        render();
        notifyChange("delete-block");

        if (options.focus !== false) {
            const focusTarget =
                previousBlock ||
                nextBlock ||
                currentDocument.blocks[0];

            if (focusTarget) {
                focusBlock(
                    focusTarget.id,
                    previousBlock ? "end" : "start"
                );
            }
        }

        return true;
    }

    /**
     * Removes a block directly from the model.
     *
     * @param {string} blockId
     * @returns {boolean}
     */
    function removeBlockFromModel(blockId) {
        const context =
            findBlockContext(blockId);

        if (!context) {
            return false;
        }

        context.parentBlocks.splice(
            context.index,
            1
        );

        return true;
    }

    /**
     * Duplicates a block and its children.
     *
     * @param {string} blockId
     */
    function duplicateBlock(blockId) {
        synchronizeModelFromDom();

        const context =
            findBlockContext(blockId);

        if (!context) {
            return;
        }

        const duplicate =
            cloneBlockWithNewIds(
                context.block
            );

        context.parentBlocks.splice(
            context.index + 1,
            0,
            duplicate
        );

        render();
        notifyChange("duplicate-block");
        focusBlock(duplicate.id, "end");
    }

    /**
     * Clones a block tree using new identifiers.
     *
     * @param {Object} block
     * @returns {Object}
     */
    function cloneBlockWithNewIds(block) {
        const clone = {
            ...block,
            id: window.NoteUStorage.createId(),
            children: Array.isArray(block.children)
                ? block.children.map(
                    cloneBlockWithNewIds
                )
                : []
        };

        return clone;
    }

    // =========================================================================
    // Block movement
    // =========================================================================

    /**
     * Moves a block up among its siblings.
     *
     * @param {string} blockId
     * @returns {boolean}
     */
    function moveBlockUp(blockId) {
        synchronizeModelFromDom();

        const context =
            findBlockContext(blockId);

        if (!context || context.index <= 0) {
            return false;
        }

        const previousIndex =
            context.index - 1;

        [
            context.parentBlocks[previousIndex],
            context.parentBlocks[context.index]
        ] = [
            context.parentBlocks[context.index],
            context.parentBlocks[previousIndex]
        ];

        render();
        notifyChange("move-block-up");
        focusBlock(blockId);

        return true;
    }

    /**
     * Moves a block down among its siblings.
     *
     * @param {string} blockId
     * @returns {boolean}
     */
    function moveBlockDown(blockId) {
        synchronizeModelFromDom();

        const context =
            findBlockContext(blockId);

        if (
            !context ||
            context.index >=
                context.parentBlocks.length - 1
        ) {
            return false;
        }

        const nextIndex =
            context.index + 1;

        [
            context.parentBlocks[nextIndex],
            context.parentBlocks[context.index]
        ] = [
            context.parentBlocks[context.index],
            context.parentBlocks[nextIndex]
        ];

        render();
        notifyChange("move-block-down");
        focusBlock(blockId);

        return true;
    }

    // =========================================================================
    // Block nesting
    // =========================================================================

    /**
     * Indents a block under its previous sibling.
     *
     * @param {string} blockId
     * @returns {boolean}
     */
    function indentBlock(blockId) {
        synchronizeModelFromDom();

        const context =
            findBlockContext(blockId);

        if (!context || context.index <= 0) {
            return false;
        }

        const previousSibling =
            context.parentBlocks[
                context.index - 1
            ];

        const [block] =
            context.parentBlocks.splice(
                context.index,
                1
            );

        previousSibling.children =
            Array.isArray(
                previousSibling.children
            )
                ? previousSibling.children
                : [];

        previousSibling.children.push(block);

        render();
        notifyChange("indent-block");
        focusBlock(blockId);

        return true;
    }

    /**
     * Moves a nested block one level outward.
     *
     * @param {string} blockId
     * @returns {boolean}
     */
    function outdentBlock(blockId) {
        synchronizeModelFromDom();

        const context =
            findBlockContext(blockId);

        if (
            !context ||
            !context.parentBlock
        ) {
            return false;
        }

        const parentContext =
            findBlockContext(
                context.parentBlock.id
            );

        if (!parentContext) {
            return false;
        }

        const [block] =
            context.parentBlocks.splice(
                context.index,
                1
            );

        parentContext.parentBlocks.splice(
            parentContext.index + 1,
            0,
            block
        );

        render();
        notifyChange("outdent-block");
        focusBlock(blockId);

        return true;
    }

    // =========================================================================
    // Block types
    // =========================================================================

    /**
     * Changes a block type.
     *
     * @param {string} blockId
     * @param {string} nextType
     * @returns {boolean}
     */
    function changeBlockType(
        blockId,
        nextType
    ) {
        synchronizeModelFromDom();

        const context =
            findBlockContext(blockId);

        if (!context) {
            return false;
        }

        const normalizedType =
            normalizeBlockType(nextType);

        context.block.type =
            normalizedType;

        if (normalizedType === "checklist") {
            context.block.checked =
                Boolean(context.block.checked);
        } else if (
            Object.prototype.hasOwnProperty.call(
                context.block,
                "checked"
            )
        ) {
            delete context.block.checked;
        }

        if (normalizedType === "divider") {
            context.block.content = "";
        }

        closeAllMenus();
        render();
        notifyChange("change-block-type");

        if (isEditableBlockType(normalizedType)) {
            focusBlock(blockId, "end");
        }

        return true;
    }

    /**
     * Returns the continuation type created by Enter.
     *
     * @param {string} blockType
     * @returns {string}
     */
    function getContinuationBlockType(
        blockType
    ) {
        if (
            blockType === "bullet-list" ||
            blockType === "numbered-list" ||
            blockType === "checklist"
        ) {
            return blockType;
        }

        return "paragraph";
    }

    /**
     * Applies a block type class.
     *
     * @param {HTMLElement} blockElement
     * @param {string} blockType
     */
    function applyBlockTypeClass(
        blockElement,
        blockType
    ) {
        for (
            const type of
            Object.keys(BLOCK_TYPE_DEFINITIONS)
        ) {
            blockElement.classList.remove(
                `block--${type}`
            );
        }

        blockElement.classList.add(
            `block--${blockType}`
        );
    }

    /**
     * Returns a normalized block type.
     *
     * @param {*} blockType
     * @returns {string}
     */
    function normalizeBlockType(blockType) {
        return Object.prototype.hasOwnProperty.call(
            BLOCK_TYPE_DEFINITIONS,
            blockType
        )
            ? blockType
            : DEFAULT_BLOCK_TYPE;
    }

    /**
     * Returns a block type definition.
     *
     * @param {string} blockType
     * @returns {Object}
     */
    function getBlockDefinition(blockType) {
        return BLOCK_TYPE_DEFINITIONS[
            normalizeBlockType(blockType)
        ];
    }

    /**
     * Checks whether a block is editable.
     *
     * @param {string} blockType
     * @returns {boolean}
     */
    function isEditableBlockType(blockType) {
        return EDITABLE_BLOCK_TYPES.includes(
            blockType
        );
    }

    // =========================================================================
    // Block click behavior
    // =========================================================================

    /**
     * Handles block control and checkbox clicks.
     *
     * @param {MouseEvent} event
     */
    function handleBlockClick(event) {
        if (!(event.target instanceof Element)) {
            return;
        }

        const checkbox =
            event.target.closest(
                ".block__checkbox"
            );

        if (
            checkbox instanceof
            HTMLInputElement
        ) {
            handleChecklistChange(checkbox);
            return;
        }

        const addButton =
            event.target.closest(
                ".block__add-button"
            );

        if (
            addButton instanceof
            HTMLButtonElement
        ) {
            const blockElement =
                addButton.closest(".block");

            if (blockElement) {
                insertBlockAfter(
                    blockElement.dataset.blockId,
                    {
                        focus: true
                    }
                );
            }

            return;
        }

        const handleButton =
            event.target.closest(
                ".block__handle"
            );

        if (
            handleButton instanceof
            HTMLButtonElement
        ) {
            const blockElement =
                handleButton.closest(".block");

            if (blockElement) {
                openBlockMenu(
                    blockElement.dataset.blockId,
                    handleButton
                );
            }
        }
    }

    /**
     * Handles checklist changes.
     *
     * @param {HTMLInputElement} checkbox
     */
    function handleChecklistChange(checkbox) {
        const blockId =
            checkbox.dataset.blockId;

        const context =
            findBlockContext(blockId);

        if (!context) {
            return;
        }

        context.block.checked =
            checkbox.checked;

        const blockElement =
            getBlockElement(blockId);

        if (blockElement) {
            blockElement.dataset.checked =
                checkbox.checked
                    ? "true"
                    : "false";
        }

        notifyChange("toggle-checklist");
    }

    /**
     * Tracks the active block.
     *
     * @param {FocusEvent} event
     */
    function handleBlockFocusIn(event) {
        const blockElement =
            getBlockElementFromTarget(
                event.target
            );

        if (blockElement) {
            activeBlockId =
                blockElement.dataset.blockId;
        }
    }

    // =========================================================================
    // Plain-text paste
    // =========================================================================

    /**
     * Inserts pasted content as plain text.
     *
     * @param {ClipboardEvent} event
     */
    function handleBlockPaste(event) {
        const contentElement =
            getContentElementFromTarget(
                event.target
            );

        if (!contentElement) {
            return;
        }

        event.preventDefault();

        const text =
            event.clipboardData?.getData(
                "text/plain"
            ) || "";

        insertTextAtSelection(text);
    }

    /**
     * Inserts text at the active selection.
     *
     * @param {string} text
     */
    function insertTextAtSelection(text) {
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

        range.deleteContents();

        const textNode =
            document.createTextNode(text);

        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);

        selection.removeAllRanges();
        selection.addRange(range);

        const target =
            range.startContainer.parentElement;

        const contentElement =
            getContentElementFromTarget(target);

        if (contentElement) {
            contentElement.dispatchEvent(
                new InputEvent(
                    "input",
                    {
                        bubbles: true,
                        inputType:
                            "insertFromPaste",
                        data: text
                    }
                )
            );
        }
    }

    // =========================================================================
    // Block action menu
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

        const blockElement =
            getBlockElement(blockId);

        if (blockElement) {
            blockElement.dataset.menuOpen =
                "true";
        }

        const handleButton =
            blockElement?.querySelector(
                ".block__handle"
            );

        if (handleButton) {
            handleButton.setAttribute(
                "aria-expanded",
                "true"
            );
        }

        updateBlockMenuAvailability(blockId);

        elements.blockMenu.hidden = false;

        positionPopover(
            elements.blockMenu,
            anchor.getBoundingClientRect(),
            {
                horizontal: "left",
                vertical: "bottom"
            }
        );

        requestAnimationFrame(() => {
            elements.blockMenu
                .querySelector(
                    ".block-menu__item:not([disabled])"
                )
                ?.focus();
        });
    }

    /**
     * Closes the block action menu.
     */
    function closeBlockMenu() {
        if (activeMenuBlockId) {
            const blockElement =
                getBlockElement(
                    activeMenuBlockId
                );

            if (blockElement) {
                delete blockElement.dataset.menuOpen;

                blockElement
                    .querySelector(
                        ".block__handle"
                    )
                    ?.setAttribute(
                        "aria-expanded",
                        "false"
                    );
            }
        }

        elements.blockMenu.hidden = true;
        activeMenuBlockId = null;
    }

    /**
     * Updates disabled menu actions.
     *
     * @param {string} blockId
     */
    function updateBlockMenuAvailability(blockId) {
        const context =
            findBlockContext(blockId);

        if (!context) {
            return;
        }

        const moveUpButton =
            elements.blockMenu.querySelector(
                '[data-block-action="move-up"]'
            );

        const moveDownButton =
            elements.blockMenu.querySelector(
                '[data-block-action="move-down"]'
            );

        moveUpButton.disabled =
            context.index === 0;

        moveDownButton.disabled =
            context.index ===
            context.parentBlocks.length - 1;
    }

    /**
     * Handles block menu actions.
     *
     * @param {MouseEvent} event
     */
    function handleBlockMenuClick(event) {
        if (!(event.target instanceof Element)) {
            return;
        }

        const button =
            event.target.closest(
                "[data-block-action]"
            );

        if (
            !(button instanceof HTMLButtonElement) ||
            button.disabled ||
            !activeMenuBlockId
        ) {
            return;
        }

        const blockId =
            activeMenuBlockId;

        const action =
            button.dataset.blockAction;

        if (action === "turn-into") {
            openBlockTypeMenu(
                blockId,
                button
            );

            return;
        }

        closeBlockMenu();

        if (action === "duplicate") {
            duplicateBlock(blockId);
        }

        if (action === "move-up") {
            moveBlockUp(blockId);
        }

        if (action === "move-down") {
            moveBlockDown(blockId);
        }

        if (action === "delete") {
            removeBlock(blockId);
        }
    }

    // =========================================================================
    // Block type menu
    // =========================================================================

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

        const context =
            findBlockContext(blockId);

        if (!context) {
            return;
        }

        for (
            const button of
            elements.blockTypeMenu.querySelectorAll(
                "[data-block-type]"
            )
        ) {
            button.dataset.active =
                button.dataset.blockType ===
                context.block.type
                    ? "true"
                    : "false";
        }

        elements.blockTypeMenu.hidden = false;

        positionPopover(
            elements.blockTypeMenu,
            anchor.getBoundingClientRect(),
            {
                horizontal: "right",
                vertical: "top"
            }
        );

        requestAnimationFrame(() => {
            elements.blockTypeMenu
                .querySelector(
                    '[data-active="true"]'
                )
                ?.focus();
        });
    }

    /**
     * Closes the block type menu.
     */
    function closeBlockTypeMenu() {
        elements.blockTypeMenu.hidden = true;
    }

    /**
     * Handles block type selection.
     *
     * @param {MouseEvent} event
     */
    function handleBlockTypeMenuClick(event) {
        if (!(event.target instanceof Element)) {
            return;
        }

        const button =
            event.target.closest(
                "[data-block-type]"
            );

        if (
            !(button instanceof HTMLButtonElement) ||
            !activeMenuBlockId
        ) {
            return;
        }

        changeBlockType(
            activeMenuBlockId,
            button.dataset.blockType
        );
    }

    // =========================================================================
    // Slash menu
    // =========================================================================

    /**
     * Opens the slash command menu.
     *
     * @param {string} blockId
     * @param {string} searchQuery
     */
    function openSlashMenu(
        blockId,
        searchQuery = ""
    ) {
        slashMenuBlockId = blockId;
        slashMenuSelectionIndex = 0;

        elements.slashMenuSearch.value =
            searchQuery;

        renderSlashMenu(searchQuery);

        const contentElement =
            getContentElement(blockId);

        if (!contentElement) {
            return;
        }

        elements.slashMenu.hidden = false;

        positionPopover(
            elements.slashMenu,
            contentElement.getBoundingClientRect(),
            {
                horizontal: "left",
                vertical: "bottom"
            }
        );
    }

    /**
     * Closes the slash command menu.
     */
    function closeSlashMenu() {
        elements.slashMenu.hidden = true;
        slashMenuBlockId = null;
        slashMenuSelectionIndex = 0;
        filteredSlashCommands = [];
        elements.slashMenuSearch.value = "";
    }

    /**
     * Renders slash command search results.
     *
     * @param {string} searchQuery
     */
    function renderSlashMenu(searchQuery = "") {
        const normalizedQuery =
            searchQuery.trim().toLowerCase();

        filteredSlashCommands =
            Object.entries(
                BLOCK_TYPE_DEFINITIONS
            )
                .map(([type, definition]) => ({
                    type,
                    ...definition
                }))
                .filter(command => {
                    if (!normalizedQuery) {
                        return true;
                    }

                    return [
                        command.type,
                        command.name,
                        command.description
                    ].some(value =>
                        value
                            .toLowerCase()
                            .includes(
                                normalizedQuery
                            )
                    );
                });

        slashMenuSelectionIndex =
            Math.min(
                slashMenuSelectionIndex,
                Math.max(
                    filteredSlashCommands.length - 1,
                    0
                )
            );

        const fragment =
            document.createDocumentFragment();

        filteredSlashCommands.forEach(
            (command, index) => {
                const button =
                    document.createElement("button");

                button.type = "button";
                button.className =
                    "slash-menu__item";

                button.dataset.blockType =
                    command.type;

                button.dataset.active =
                    index ===
                    slashMenuSelectionIndex
                        ? "true"
                        : "false";

                button.setAttribute(
                    "role",
                    "menuitem"
                );

                const icon =
                    document.createElement("span");

                icon.className =
                    "slash-menu__item-icon";

                icon.setAttribute(
                    "aria-hidden",
                    "true"
                );

                icon.textContent =
                    command.icon;

                const content =
                    document.createElement("span");

                content.className =
                    "slash-menu__item-content";

                const name =
                    document.createElement("strong");

                name.className =
                    "slash-menu__item-name";

                name.textContent =
                    command.name;

                const description =
                    document.createElement("span");

                description.className =
                    "slash-menu__item-description";

                description.textContent =
                    command.description;

                content.append(
                    name,
                    description
                );

                button.append(
                    icon,
                    content
                );

                fragment.appendChild(button);
            }
        );

        elements.slashMenuList.replaceChildren(
            fragment
        );

        elements.slashMenuEmpty.hidden =
            filteredSlashCommands.length > 0;
    }

    /**
     * Handles slash menu search.
     */
    function handleSlashMenuSearch() {
        slashMenuSelectionIndex = 0;

        renderSlashMenu(
            elements.slashMenuSearch.value
        );
    }

    /**
     * Handles slash menu keyboard navigation.
     *
     * @param {KeyboardEvent} event
     */
    function handleSlashMenuKeyDown(event) {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            moveSlashMenuSelection(1);
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            moveSlashMenuSelection(-1);
        }

        if (event.key === "Enter") {
            event.preventDefault();
            selectActiveSlashCommand();
        }

        if (event.key === "Escape") {
            event.preventDefault();
            closeSlashMenu();

            if (slashMenuBlockId) {
                focusBlock(slashMenuBlockId);
            }
        }
    }

    /**
     * Handles slash navigation while focus remains in the editor.
     *
     * @param {KeyboardEvent} event
     */
    function handleSlashNavigationFromEditor(event) {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            moveSlashMenuSelection(1);
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            moveSlashMenuSelection(-1);
        }

        if (event.key === "Enter") {
            event.preventDefault();
            selectActiveSlashCommand();
        }

        if (event.key === "Escape") {
            event.preventDefault();
            closeSlashMenu();
        }
    }

    /**
     * Moves the selected slash command.
     *
     * @param {number} direction
     */
    function moveSlashMenuSelection(direction) {
        if (
            filteredSlashCommands.length === 0
        ) {
            return;
        }

        slashMenuSelectionIndex =
            (
                slashMenuSelectionIndex +
                direction +
                filteredSlashCommands.length
            ) %
            filteredSlashCommands.length;

        updateSlashMenuSelection();
    }

    /**
     * Updates slash menu visual selection.
     */
    function updateSlashMenuSelection() {
        const buttons =
            Array.from(
                elements.slashMenuList.querySelectorAll(
                    ".slash-menu__item"
                )
            );

        buttons.forEach((button, index) => {
            button.dataset.active =
                index ===
                slashMenuSelectionIndex
                    ? "true"
                    : "false";
        });

        buttons[
            slashMenuSelectionIndex
        ]?.scrollIntoView({
            block: "nearest"
        });
    }

    /**
     * Applies the active slash command.
     */
    function selectActiveSlashCommand() {
        const command =
            filteredSlashCommands[
                slashMenuSelectionIndex
            ];

        if (!command || !slashMenuBlockId) {
            return;
        }

        applySlashCommand(
            slashMenuBlockId,
            command.type
        );
    }

    /**
     * Handles slash menu mouse selection.
     *
     * @param {MouseEvent} event
     */
    function handleSlashMenuClick(event) {
        if (!(event.target instanceof Element)) {
            return;
        }

        const button =
            event.target.closest(
                "[data-block-type]"
            );

        if (
            !(button instanceof HTMLButtonElement) ||
            !slashMenuBlockId
        ) {
            return;
        }

        applySlashCommand(
            slashMenuBlockId,
            button.dataset.blockType
        );
    }

    /**
     * Applies a slash command to a block.
     *
     * @param {string} blockId
     * @param {string} blockType
     */
    function applySlashCommand(
        blockId,
        blockType
    ) {
        const context =
            findBlockContext(blockId);

        if (!context) {
            return;
        }

        context.block.content = "";

        closeSlashMenu();

        changeBlockType(
            blockId,
            blockType
        );
    }

    // =========================================================================
    // Menu closing and positioning
    // =========================================================================

    /**
     * Closes all editor menus.
     */
    function closeAllMenus() {
        closeBlockTypeMenu();
        closeBlockMenu();
        closeSlashMenu();
    }

    /**
     * Closes menus when clicking outside them.
     *
     * @param {PointerEvent} event
     */
    function handleDocumentPointerDown(event) {
        if (!(event.target instanceof Node)) {
            return;
        }

        const insideBlockMenu =
            elements.blockMenu.contains(
                event.target
            );

        const insideBlockTypeMenu =
            elements.blockTypeMenu.contains(
                event.target
            );

        const insideSlashMenu =
            elements.slashMenu.contains(
                event.target
            );

        const insideBlockHandle =
            event.target instanceof Element &&
            Boolean(
                event.target.closest(
                    ".block__handle"
                )
            );

        if (
            !insideBlockMenu &&
            !insideBlockTypeMenu &&
            !insideBlockHandle
        ) {
            closeBlockTypeMenu();
            closeBlockMenu();
        }

        if (!insideSlashMenu) {
            const contentElement =
                getContentElementFromTarget(
                    event.target
                );

            if (
                !contentElement ||
                contentElement.dataset.blockId !==
                    slashMenuBlockId
            ) {
                closeSlashMenu();
            }
        }
    }

    /**
     * Handles global menu keyboard behavior.
     *
     * @param {KeyboardEvent} event
     */
    function handleDocumentKeyDown(event) {
        if (event.key !== "Escape") {
            return;
        }

        closeAllMenus();
    }

    /**
     * Repositions menus that are currently open.
     */
    function repositionOpenMenus() {
        if (
            !elements.blockMenu.hidden &&
            activeMenuBlockId
        ) {
            const handle =
                getBlockElement(
                    activeMenuBlockId
                )?.querySelector(
                    ".block__handle"
                );

            if (handle) {
                positionPopover(
                    elements.blockMenu,
                    handle.getBoundingClientRect(),
                    {
                        horizontal: "left",
                        vertical: "bottom"
                    }
                );
            }
        }

        if (
            !elements.slashMenu.hidden &&
            slashMenuBlockId
        ) {
            const content =
                getContentElement(
                    slashMenuBlockId
                );

            if (content) {
                positionPopover(
                    elements.slashMenu,
                    content.getBoundingClientRect(),
                    {
                        horizontal: "left",
                        vertical: "bottom"
                    }
                );
            }
        }
    }

    /**
     * Positions a popover inside the viewport.
     *
     * @param {HTMLElement} popover
     * @param {DOMRect} anchorRect
     * @param {Object} options
     * @param {string} options.horizontal
     * @param {string} options.vertical
     */
    function positionPopover(
        popover,
        anchorRect,
        options
    ) {
        const margin = 10;
        const gap = 6;

        const popoverRect =
            popover.getBoundingClientRect();

        let left =
            options.horizontal === "right"
                ? anchorRect.right + gap
                : anchorRect.left;

        let top =
            options.vertical === "top"
                ? anchorRect.top
                : anchorRect.bottom + gap;

        if (
            left + popoverRect.width >
            window.innerWidth - margin
        ) {
            left =
                window.innerWidth -
                popoverRect.width -
                margin;
        }

        if (left < margin) {
            left = margin;
        }

        if (
            top + popoverRect.height >
            window.innerHeight - margin
        ) {
            top =
                anchorRect.top -
                popoverRect.height -
                gap;
        }

        if (top < margin) {
            top = margin;
        }

        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;
        popover.style.right = "auto";
        popover.style.bottom = "auto";
    }

    // =========================================================================
    // Block traversal
    // =========================================================================

    /**
     * Finds a block and its structural context.
     *
     * @param {string} blockId
     * @returns {Object|null}
     */
    function findBlockContext(blockId) {
        return findBlockContextRecursive(
            currentDocument.blocks,
            blockId,
            null
        );
    }

    /**
     * Recursively finds a block context.
     *
     * @param {Array<Object>} blocks
     * @param {string} blockId
     * @param {Object|null} parentBlock
     * @returns {Object|null}
     */
    function findBlockContextRecursive(
        blocks,
        blockId,
        parentBlock
    ) {
        for (
            let index = 0;
            index < blocks.length;
            index += 1
        ) {
            const block = blocks[index];

            if (block.id === blockId) {
                return {
                    block,
                    index,
                    parentBlocks: blocks,
                    parentBlock
                };
            }

            if (
                Array.isArray(block.children) &&
                block.children.length > 0
            ) {
                const childContext =
                    findBlockContextRecursive(
                        block.children,
                        blockId,
                        block
                    );

                if (childContext) {
                    return childContext;
                }
            }
        }

        return null;
    }

    /**
     * Returns blocks in visual order.
     *
     * @returns {Array<Object>}
     */
    function getFlattenedBlocks() {
        const result = [];

        function visit(blocks) {
            for (const block of blocks) {
                result.push(block);

                if (
                    Array.isArray(block.children) &&
                    block.children.length > 0
                ) {
                    visit(block.children);
                }
            }
        }

        visit(currentDocument.blocks);

        return result;
    }

    /**
     * Returns the previous visible block.
     *
     * @param {string} blockId
     * @returns {Object|null}
     */
    function getPreviousBlock(blockId) {
        const blocks =
            getFlattenedBlocks();

        const index =
            blocks.findIndex(
                block => block.id === blockId
            );

        return index > 0
            ? blocks[index - 1]
            : null;
    }

    /**
     * Returns the next visible block.
     *
     * @param {string} blockId
     * @returns {Object|null}
     */
    function getNextBlock(blockId) {
        const blocks =
            getFlattenedBlocks();

        const index =
            blocks.findIndex(
                block => block.id === blockId
            );

        return (
            index >= 0 &&
            index < blocks.length - 1
        )
            ? blocks[index + 1]
            : null;
    }

    /**
     * Ensures the document always contains one block.
     */
    function ensureDocumentHasBlock() {
        if (
            currentDocument.blocks.length === 0
        ) {
            currentDocument.blocks.push(
                createBlock()
            );
        }
    }

    // =========================================================================
    // Numbered lists
    // =========================================================================

    /**
     * Updates visible numbered-list prefixes.
     */
    function updateNumberedListPrefixes() {
        updateNumberedPrefixesInContainer(
            elements.blockList
        );
    }

    /**
     * Updates numbered prefixes inside one container.
     *
     * @param {HTMLElement} container
     */
    function updateNumberedPrefixesInContainer(
        container
    ) {
        let currentNumber = 0;

        const blockElements =
            Array.from(
                container.children
            ).filter(element =>
                element.classList?.contains(
                    "block"
                )
            );

        for (const blockElement of blockElements) {
            const prefix =
                blockElement.querySelector(
                    ":scope > .block__body > .block__prefix"
                );

            if (
                blockElement.dataset.blockType ===
                "numbered-list"
            ) {
                currentNumber += 1;

                if (prefix) {
                    prefix.textContent =
                        `${currentNumber}.`;
                }
            } else {
                currentNumber = 0;
            }

            const children =
                blockElement.querySelector(
                    ":scope > .block__children"
                );

            if (children) {
                updateNumberedPrefixesInContainer(
                    children
                );
            }
        }
    }

    // =========================================================================
    // Focus and caret
    // =========================================================================

    /**
     * Focuses a block.
     *
     * @param {string} blockId
     * @param {"start"|"end"|number} [position]
     * @returns {boolean}
     */
    function focusBlock(
        blockId,
        position = "end"
    ) {
        const contentElement =
            getContentElement(blockId);

        if (
            !contentElement ||
            contentElement.getAttribute(
                "contenteditable"
            ) !== "true"
        ) {
            return false;
        }

        contentElement.focus();

        const textLength =
            getPlainText(contentElement).length;

        let offset = textLength;

        if (position === "start") {
            offset = 0;
        } else if (
            typeof position === "number"
        ) {
            offset = Math.max(
                0,
                Math.min(position, textLength)
            );
        }

        setCaretOffset(
            contentElement,
            offset
        );

        activeBlockId = blockId;

        return true;
    }

    /**
     * Focuses the first editable block.
     *
     * @returns {boolean}
     */
    function focusFirstBlock() {
        const block =
            getFlattenedBlocks().find(
                item =>
                    isEditableBlockType(item.type)
            );

        return block
            ? focusBlock(block.id, "start")
            : false;
    }

    /**
     * Focuses the last editable block.
     *
     * @returns {boolean}
     */
    function focusLastBlock() {
        const blocks =
            getFlattenedBlocks().filter(
                item =>
                    isEditableBlockType(item.type)
            );

        const block =
            blocks[blocks.length - 1];

        return block
            ? focusBlock(block.id, "end")
            : false;
    }

    /**
     * Returns the caret text offset.
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

        if (!element.contains(range.startContainer)) {
            return 0;
        }

        const precedingRange =
            range.cloneRange();

        precedingRange.selectNodeContents(element);
        precedingRange.setEnd(
            range.startContainer,
            range.startOffset
        );

        return precedingRange.toString().length;
    }

    /**
     * Sets the caret text offset.
     *
     * @param {HTMLElement} element
     * @param {number} offset
     */
    function setCaretOffset(element, offset) {
        const range =
            document.createRange();

        const selection =
            window.getSelection();

        const walker =
            document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT
            );

        let remaining = offset;
        let node = walker.nextNode();

        while (node) {
            const length =
                node.textContent.length;

            if (remaining <= length) {
                range.setStart(
                    node,
                    remaining
                );

                range.collapse(true);

                selection.removeAllRanges();
                selection.addRange(range);

                return;
            }

            remaining -= length;
            node = walker.nextNode();
        }

        range.selectNodeContents(element);
        range.collapse(false);

        selection.removeAllRanges();
        selection.addRange(range);
    }

    /**
     * Checks whether the caret is at the start.
     *
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    function isCaretAtStart(element) {
        return getCaretOffset(element) === 0;
    }

    /**
     * Checks whether the caret is at the end.
     *
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    function isCaretAtEnd(element) {
        return (
            getCaretOffset(element) ===
            getPlainText(element).length
        );
    }

    // =========================================================================
    // DOM helpers
    // =========================================================================

    /**
     * Returns a block element.
     *
     * @param {string} blockId
     * @returns {HTMLElement|null}
     */
    function getBlockElement(blockId) {
        return elements.blockList.querySelector(
            `.block[data-block-id="${escapeSelector(blockId)}"]`
        );
    }

    /**
     * Returns a content element.
     *
     * @param {string} blockId
     * @returns {HTMLElement|null}
     */
    function getContentElement(blockId) {
        return elements.blockList.querySelector(
            `.block__content[data-block-id="${escapeSelector(blockId)}"]`
        );
    }

    /**
     * Finds the closest block element.
     *
     * @param {*} target
     * @returns {HTMLElement|null}
     */
    function getBlockElementFromTarget(target) {
        if (!(target instanceof Element)) {
            return null;
        }

        return target.closest(".block");
    }

    /**
     * Finds the closest content element.
     *
     * @param {*} target
     * @returns {HTMLElement|null}
     */
    function getContentElementFromTarget(target) {
        if (!(target instanceof Element)) {
            return null;
        }

        return target.closest(
            ".block__content"
        );
    }

    /**
     * Returns normalized plain text from a content element.
     *
     * @param {HTMLElement} element
     * @returns {string}
     */
    function getPlainText(element) {
        return element.innerText
            .replace(/\r\n/g, "\n")
            .replace(/\u00a0/g, " ");
    }

    /**
     * Escapes text for a CSS selector.
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
    // Change notifications
    // =========================================================================

    /**
     * Registers a document change handler.
     *
     * @param {Function|null} handler
     */
    function setChangeHandler(handler) {
        changeHandler =
            typeof handler === "function"
                ? handler
                : null;
    }

    /**
     * Notifies the application about a change.
     *
     * @param {string} reason
     */
    function notifyChange(reason) {
        if (
            !changeHandler ||
            isRendering
        ) {
            return;
        }

        changeHandler(
            window.NoteUStorage.cloneDocument(
                currentDocument
            ),
            {
                reason,
                activeBlockId
            }
        );
    }

    // =========================================================================
    // Public API
    // =========================================================================

    window.NoteUEditor = Object.freeze({
        initialize,
        render,

        getDocument,
        setDocument,

        createBlock,
        addBlock,
        insertBlockAfter,
        removeBlock,
        duplicateBlock,

        moveBlockUp,
        moveBlockDown,

        indentBlock,
        outdentBlock,

        changeBlockType,
        findBlockContext,

        focusBlock,
        focusFirstBlock,
        focusLastBlock,

        setChangeHandler
    });
})();
