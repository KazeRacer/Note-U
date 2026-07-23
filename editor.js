/**
 * Note-U
 * Version: 0.1.0
 *
 * Block editor engine.
 *
 * This module is responsible for:
 * - rendering document blocks from the JSON model;
 * - synchronizing editable content with the model;
 * - creating, splitting, merging, indenting, and removing blocks;
 * - managing block focus and caret position;
 * - notifying the application when the document changes.
 *
 * The DOM is a rendered representation of the document model.
 * It is never used as the persistence source.
 */

(function () {
    "use strict";

    // =========================================================================
    // Constants
    // =========================================================================

    const SUPPORTED_BLOCK_TYPES = Object.freeze([
        "paragraph"
    ]);

    const DEFAULT_BLOCK_TYPE = "paragraph";
    const MAX_BLOCK_DEPTH = 50;

    // =========================================================================
    // Internal state
    // =========================================================================

    let editorRoot = null;
    let blockListElement = null;
    let paragraphTemplate = null;

    let documentModel = null;
    let changeHandler = null;

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
     * @param {HTMLTemplateElement} options.paragraphTemplate
     * @param {Object} options.documentModel
     * @param {Function} [options.onChange]
     */
    function initialize(options) {
        if (!options || typeof options !== "object") {
            throw new TypeError(
                "Note-U editor initialization options are required."
            );
        }

        if (!(options.editorRoot instanceof HTMLElement)) {
            throw new TypeError(
                "Note-U editor requires a valid editor root element."
            );
        }

        if (!(options.blockListElement instanceof HTMLElement)) {
            throw new TypeError(
                "Note-U editor requires a valid block list element."
            );
        }

        if (!(options.paragraphTemplate instanceof HTMLTemplateElement)) {
            throw new TypeError(
                "Note-U editor requires a valid paragraph template."
            );
        }

        if (
            !window.NoteUStorage ||
            typeof window.NoteUStorage.normalizeDocument !== "function"
        ) {
            throw new Error(
                "Note-U editor requires the storage module."
            );
        }

        editorRoot = options.editorRoot;
        blockListElement = options.blockListElement;
        paragraphTemplate = options.paragraphTemplate;

        changeHandler =
            typeof options.onChange === "function"
                ? options.onChange
                : null;

        documentModel = window.NoteUStorage.normalizeDocument(
            options.documentModel
        );

        bindEditorEvents();
        render();

        isInitialized = true;
    }

    /**
     * Ensures that the editor has been initialized.
     */
    function requireInitialization() {
        if (!isInitialized && !documentModel) {
            throw new Error(
                "Note-U editor has not been initialized."
            );
        }
    }

    // =========================================================================
    // Event registration
    // =========================================================================

    /**
     * Registers editor event listeners.
     */
    function bindEditorEvents() {
        blockListElement.addEventListener(
            "input",
            handleBlockInput
        );

        blockListElement.addEventListener(
            "keydown",
            handleBlockKeyDown
        );

        blockListElement.addEventListener(
            "paste",
            handleBlockPaste
        );

        blockListElement.addEventListener(
            "click",
            handleBlockClick
        );
    }

    // =========================================================================
    // Rendering
    // =========================================================================

    /**
     * Renders the complete block tree.
     *
     * @param {Object} [focusRequest]
     * @param {string} focusRequest.blockId
     * @param {number|string} [focusRequest.caret]
     */
    function render(focusRequest = null) {
        if (!blockListElement || !documentModel) {
            return;
        }

        isRendering = true;
        blockListElement.replaceChildren();

        const fragment = document.createDocumentFragment();

        for (const block of documentModel.blocks) {
            renderBlockTree(
                block,
                0,
                fragment
            );
        }

        blockListElement.appendChild(fragment);
        isRendering = false;

        if (focusRequest && focusRequest.blockId) {
            requestAnimationFrame(() => {
                focusBlock(
                    focusRequest.blockId,
                    focusRequest.caret
                );
            });
        }
    }

    /**
     * Renders one block and all of its children.
     *
     * @param {Object} block
     * @param {number} depth
     * @param {DocumentFragment|HTMLElement} container
     */
    function renderBlockTree(block, depth, container) {
        const blockElement = createBlockElement(
            block,
            depth
        );

        container.appendChild(blockElement);

        if (!Array.isArray(block.children)) {
            return;
        }

        for (const childBlock of block.children) {
            renderBlockTree(
                childBlock,
                depth + 1,
                container
            );
        }
    }

    /**
     * Creates the DOM representation of a block.
     *
     * @param {Object} block
     * @param {number} depth
     * @returns {HTMLElement}
     */
    function createBlockElement(block, depth) {
        const blockType = getSupportedBlockType(block.type);

        switch (blockType) {
            case "paragraph":
            default:
                return createParagraphElement(
                    block,
                    depth
                );
        }
    }

    /**
     * Creates a paragraph block element.
     *
     * @param {Object} block
     * @param {number} depth
     * @returns {HTMLElement}
     */
    function createParagraphElement(block, depth) {
        const templateContent =
            paragraphTemplate.content.cloneNode(true);

        const blockElement =
            templateContent.querySelector(".block");

        const contentElement =
            templateContent.querySelector(".block__content");

        if (!blockElement || !contentElement) {
            throw new Error(
                "The paragraph template is invalid."
            );
        }

        blockElement.dataset.blockId = block.id;
        blockElement.dataset.blockType = "paragraph";
        blockElement.dataset.depth = String(depth);

        contentElement.dataset.blockId = block.id;
        contentElement.textContent = block.content;

        return blockElement;
    }

    /**
     * Returns a supported block type.
     *
     * @param {*} blockType
     * @returns {string}
     */
    function getSupportedBlockType(blockType) {
        if (SUPPORTED_BLOCK_TYPES.includes(blockType)) {
            return blockType;
        }

        return DEFAULT_BLOCK_TYPE;
    }

    // =========================================================================
    // Model access
    // =========================================================================

    /**
     * Returns a normalized clone of the current document.
     *
     * @returns {Object}
     */
    function getDocument() {
        requireInitialization();

        return window.NoteUStorage.cloneDocument(
            documentModel
        );
    }

    /**
     * Replaces the current document.
     *
     * @param {*} nextDocument
     * @param {Object|null} [focusRequest]
     */
    function setDocument(nextDocument, focusRequest = null) {
        documentModel = window.NoteUStorage.normalizeDocument(
            nextDocument
        );

        render(focusRequest);
    }

    /**
     * Finds a block and its structural context.
     *
     * @param {string} blockId
     * @returns {Object|null}
     */
    function findBlockContext(blockId) {
        if (!documentModel || typeof blockId !== "string") {
            return null;
        }

        return findBlockInArray(
            documentModel.blocks,
            blockId,
            null,
            0
        );
    }

    /**
     * Recursively searches for a block.
     *
     * @param {Array<Object>} blockArray
     * @param {string} blockId
     * @param {Object|null} parentBlock
     * @param {number} depth
     * @returns {Object|null}
     */
    function findBlockInArray(
        blockArray,
        blockId,
        parentBlock,
        depth
    ) {
        for (
            let index = 0;
            index < blockArray.length;
            index += 1
        ) {
            const block = blockArray[index];

            if (block.id === blockId) {
                return {
                    block,
                    blockArray,
                    index,
                    parentBlock,
                    depth
                };
            }

            if (
                Array.isArray(block.children) &&
                block.children.length > 0
            ) {
                const childResult = findBlockInArray(
                    block.children,
                    blockId,
                    block,
                    depth + 1
                );

                if (childResult) {
                    return childResult;
                }
            }
        }

        return null;
    }

    /**
     * Returns a flattened list of all blocks.
     *
     * @returns {Array<Object>}
     */
    function getFlattenedBlocks() {
        const flattenedBlocks = [];

        function visit(blocks, depth) {
            for (const block of blocks) {
                flattenedBlocks.push({
                    block,
                    depth
                });

                if (
                    Array.isArray(block.children) &&
                    block.children.length > 0
                ) {
                    visit(
                        block.children,
                        depth + 1
                    );
                }
            }
        }

        visit(documentModel.blocks, 0);

        return flattenedBlocks;
    }

    /**
     * Returns the block preceding the provided block in visual order.
     *
     * @param {string} blockId
     * @returns {Object|null}
     */
    function getPreviousVisibleBlock(blockId) {
        const flattenedBlocks = getFlattenedBlocks();

        const currentIndex = flattenedBlocks.findIndex(
            item => item.block.id === blockId
        );

        if (currentIndex <= 0) {
            return null;
        }

        return flattenedBlocks[currentIndex - 1].block;
    }

    /**
     * Returns the block following the provided block in visual order.
     *
     * @param {string} blockId
     * @returns {Object|null}
     */
    function getNextVisibleBlock(blockId) {
        const flattenedBlocks = getFlattenedBlocks();

        const currentIndex = flattenedBlocks.findIndex(
            item => item.block.id === blockId
        );

        if (
            currentIndex < 0 ||
            currentIndex >= flattenedBlocks.length - 1
        ) {
            return null;
        }

        return flattenedBlocks[currentIndex + 1].block;
    }

    // =========================================================================
    // Block creation
    // =========================================================================

    /**
     * Creates a new block.
     *
     * @param {string} [type]
     * @param {string} [content]
     * @returns {Object}
     */
    function createBlock(
        type = DEFAULT_BLOCK_TYPE,
        content = ""
    ) {
        return {
            id: window.NoteUStorage.createId("block"),
            type: getSupportedBlockType(type),
            content:
                typeof content === "string"
                    ? content
                    : "",
            children: []
        };
    }

    /**
     * Adds a block to the end of the document.
     *
     * @param {Object} [options]
     * @param {boolean} [options.focus]
     * @returns {Object}
     */
    function addBlock(options = {}) {
        requireInitialization();

        const block = createBlock();

        documentModel.blocks.push(block);

        notifyChange("add-block");

        render(
            options.focus === false
                ? null
                : {
                    blockId: block.id,
                    caret: 0
                }
        );

        return block;
    }

    /**
     * Inserts a new block after an existing block.
     *
     * @param {string} blockId
     * @param {string} [content]
     * @returns {Object|null}
     */
    function insertBlockAfter(blockId, content = "") {
        const context = findBlockContext(blockId);

        if (!context) {
            return null;
        }

        const newBlock = createBlock(
            DEFAULT_BLOCK_TYPE,
            content
        );

        context.blockArray.splice(
            context.index + 1,
            0,
            newBlock
        );

        notifyChange("insert-block");

        render({
            blockId: newBlock.id,
            caret: 0
        });

        return newBlock;
    }

    // =========================================================================
    // Input handling
    // =========================================================================

    /**
     * Handles editable block input.
     *
     * @param {InputEvent} event
     */
    function handleBlockInput(event) {
        if (isRendering) {
            return;
        }

        const contentElement =
            getContentElementFromEvent(event);

        if (!contentElement) {
            return;
        }

        const context = findBlockContext(
            contentElement.dataset.blockId
        );

        if (!context) {
            return;
        }

        context.block.content =
            normalizeEditableText(contentElement.innerText);

        notifyChange("edit-block");
    }

    /**
     * Handles editor keyboard commands.
     *
     * @param {KeyboardEvent} event
     */
    function handleBlockKeyDown(event) {
        const contentElement =
            getContentElementFromEvent(event);

        if (!contentElement) {
            return;
        }

        const blockId = contentElement.dataset.blockId;

        switch (event.key) {
            case "Enter":
                handleEnterKey(
                    event,
                    contentElement,
                    blockId
                );
                break;

            case "Backspace":
                handleBackspaceKey(
                    event,
                    contentElement,
                    blockId
                );
                break;

            case "Delete":
                handleDeleteKey(
                    event,
                    contentElement,
                    blockId
                );
                break;

            case "Tab":
                handleTabKey(
                    event,
                    blockId
                );
                break;

            case "ArrowUp":
                handleArrowUpKey(
                    event,
                    contentElement,
                    blockId
                );
                break;

            case "ArrowDown":
                handleArrowDownKey(
                    event,
                    contentElement,
                    blockId
                );
                break;

            default:
                break;
        }
    }

    /**
     * Handles plain-text paste inside blocks.
     *
     * @param {ClipboardEvent} event
     */
    function handleBlockPaste(event) {
        const contentElement =
            getContentElementFromEvent(event);

        if (!contentElement) {
            return;
        }

        event.preventDefault();

        const pastedText =
            event.clipboardData?.getData("text/plain") || "";

        insertPlainTextAtSelection(pastedText);
    }

    /**
     * Handles block clicks.
     *
     * @param {MouseEvent} event
     */
    function handleBlockClick(event) {
        const handleButton = event.target.closest(
            ".block__handle"
        );

        if (!handleButton) {
            return;
        }

        const blockElement = handleButton.closest(".block");

        if (!blockElement) {
            return;
        }

        const isSelected =
            blockElement.dataset.selected === "true";

        clearBlockSelection();

        if (!isSelected) {
            blockElement.dataset.selected = "true";
        }
    }

    // =========================================================================
    // Enter
    // =========================================================================

    /**
     * Splits a block when Enter is pressed.
     *
     * Shift+Enter inserts a line break inside the current block.
     *
     * @param {KeyboardEvent} event
     * @param {HTMLElement} contentElement
     * @param {string} blockId
     */
    function handleEnterKey(
        event,
        contentElement,
        blockId
    ) {
        if (event.shiftKey) {
            return;
        }

        event.preventDefault();

        const context = findBlockContext(blockId);

        if (!context) {
            return;
        }

        const content = normalizeEditableText(
            contentElement.innerText
        );

        const caretOffset =
            getCaretCharacterOffset(contentElement);

        const contentBeforeCaret =
            content.slice(0, caretOffset);

        const contentAfterCaret =
            content.slice(caretOffset);

        context.block.content = contentBeforeCaret;

        const newBlock = createBlock(
            DEFAULT_BLOCK_TYPE,
            contentAfterCaret
        );

        context.blockArray.splice(
            context.index + 1,
            0,
            newBlock
        );

        notifyChange("split-block");

        render({
            blockId: newBlock.id,
            caret: 0
        });
    }

    // =========================================================================
    // Backspace and Delete
    // =========================================================================

    /**
     * Merges a block into the previous visible block when Backspace
     * is pressed at the beginning of the block.
     *
     * @param {KeyboardEvent} event
     * @param {HTMLElement} contentElement
     * @param {string} blockId
     */
    function handleBackspaceKey(
        event,
        contentElement,
        blockId
    ) {
        if (!isSelectionCollapsed()) {
            return;
        }

        const caretOffset =
            getCaretCharacterOffset(contentElement);

        if (caretOffset !== 0) {
            return;
        }

        const previousBlock =
            getPreviousVisibleBlock(blockId);

        if (!previousBlock) {
            return;
        }

        const context = findBlockContext(blockId);

        if (!context) {
            return;
        }

        event.preventDefault();

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

        context.blockArray.splice(
            context.index,
            1
        );

        ensureDocumentHasBlock();
        notifyChange("merge-block-backward");

        render({
            blockId: previousBlock.id,
            caret: previousLength
        });
    }

    /**
     * Merges the next visible block into the current block when Delete
     * is pressed at the end of the current block.
     *
     * @param {KeyboardEvent} event
     * @param {HTMLElement} contentElement
     * @param {string} blockId
     */
    function handleDeleteKey(
        event,
        contentElement,
        blockId
    ) {
        if (!isSelectionCollapsed()) {
            return;
        }

        const currentText =
            normalizeEditableText(
                contentElement.innerText
            );

        const caretOffset =
            getCaretCharacterOffset(contentElement);

        if (caretOffset !== currentText.length) {
            return;
        }

        const currentContext =
            findBlockContext(blockId);

        const nextBlock =
            getNextVisibleBlock(blockId);

        if (!currentContext || !nextBlock) {
            return;
        }

        const nextContext =
            findBlockContext(nextBlock.id);

        if (!nextContext) {
            return;
        }

        event.preventDefault();

        const currentLength =
            currentContext.block.content.length;

        currentContext.block.content +=
            nextContext.block.content;

        if (
            Array.isArray(nextContext.block.children) &&
            nextContext.block.children.length > 0
        ) {
            currentContext.block.children.push(
                ...nextContext.block.children
            );
        }

        nextContext.blockArray.splice(
            nextContext.index,
            1
        );

        ensureDocumentHasBlock();
        notifyChange("merge-block-forward");

        render({
            blockId: currentContext.block.id,
            caret: currentLength
        });
    }

    // =========================================================================
    // Indentation
    // =========================================================================

    /**
     * Indents or outdents a block.
     *
     * Tab indents the current block.
     * Shift+Tab outdents the current block.
     *
     * @param {KeyboardEvent} event
     * @param {string} blockId
     */
    function handleTabKey(event, blockId) {
        event.preventDefault();

        if (event.shiftKey) {
            outdentBlock(blockId);
            return;
        }

        indentBlock(blockId);
    }

    /**
     * Moves a block inside its previous sibling.
     *
     * @param {string} blockId
     * @returns {boolean}
     */
    function indentBlock(blockId) {
        const context = findBlockContext(blockId);

        if (
            !context ||
            context.index === 0 ||
            context.depth >= MAX_BLOCK_DEPTH
        ) {
            return false;
        }

        const previousSibling =
            context.blockArray[context.index - 1];

        const [block] = context.blockArray.splice(
            context.index,
            1
        );

        previousSibling.children.push(block);

        notifyChange("indent-block");

        render({
            blockId,
            caret: "end"
        });

        return true;
    }

    /**
     * Moves a block outside its parent.
     *
     * @param {string} blockId
     * @returns {boolean}
     */
    function outdentBlock(blockId) {
        const context = findBlockContext(blockId);

        if (!context || !context.parentBlock) {
            return false;
        }

        const parentContext = findBlockContext(
            context.parentBlock.id
        );

        if (!parentContext) {
            return false;
        }

        const [block] = context.blockArray.splice(
            context.index,
            1
        );

        parentContext.blockArray.splice(
            parentContext.index + 1,
            0,
            block
        );

        notifyChange("outdent-block");

        render({
            blockId,
            caret: "end"
        });

        return true;
    }

    // =========================================================================
    // Arrow navigation
    // =========================================================================

    /**
     * Moves focus to the previous block when Arrow Up is pressed
     * from the first visual line.
     *
     * @param {KeyboardEvent} event
     * @param {HTMLElement} contentElement
     * @param {string} blockId
     */
    function handleArrowUpKey(
        event,
        contentElement,
        blockId
    ) {
        const caretOffset =
            getCaretCharacterOffset(contentElement);

        if (caretOffset !== 0) {
            return;
        }

        const previousBlock =
            getPreviousVisibleBlock(blockId);

        if (!previousBlock) {
            return;
        }

        event.preventDefault();

        focusBlock(
            previousBlock.id,
            "end"
        );
    }

    /**
     * Moves focus to the next block when Arrow Down is pressed
     * from the end of the block.
     *
     * @param {KeyboardEvent} event
     * @param {HTMLElement} contentElement
     * @param {string} blockId
     */
    function handleArrowDownKey(
        event,
        contentElement,
        blockId
    ) {
        const text = normalizeEditableText(
            contentElement.innerText
        );

        const caretOffset =
            getCaretCharacterOffset(contentElement);

        if (caretOffset !== text.length) {
            return;
        }

        const nextBlock =
            getNextVisibleBlock(blockId);

        if (!nextBlock) {
            return;
        }

        event.preventDefault();

        focusBlock(
            nextBlock.id,
            0
        );
    }

    // =========================================================================
    // Block removal
    // =========================================================================

    /**
     * Removes a block by identifier.
     *
     * Children are promoted into the removed block's position.
     *
     * @param {string} blockId
     * @returns {boolean}
     */
    function removeBlock(blockId) {
        const context = findBlockContext(blockId);

        if (!context) {
            return false;
        }

        const previousBlock =
            getPreviousVisibleBlock(blockId);

        const nextBlock =
            getNextVisibleBlock(blockId);

        const promotedChildren =
            Array.isArray(context.block.children)
                ? context.block.children
                : [];

        context.blockArray.splice(
            context.index,
            1,
            ...promotedChildren
        );

        ensureDocumentHasBlock();
        notifyChange("remove-block");

        const focusTarget =
            previousBlock ||
            nextBlock ||
            documentModel.blocks[0];

        render({
            blockId: focusTarget.id,
            caret: "end"
        });

        return true;
    }

    /**
     * Ensures that the document contains at least one root block.
     */
    function ensureDocumentHasBlock() {
        if (documentModel.blocks.length === 0) {
            documentModel.blocks.push(
                createBlock()
            );
        }
    }

    // =========================================================================
    // Focus and caret
    // =========================================================================

    /**
     * Focuses a block and places the caret.
     *
     * @param {string} blockId
     * @param {number|string} [caret]
     * @returns {boolean}
     */
    function focusBlock(blockId, caret = "end") {
        if (!blockListElement) {
            return false;
        }

        const selector =
            `.block__content[data-block-id="${escapeSelector(blockId)}"]`;

        const contentElement =
            blockListElement.querySelector(selector);

        if (!contentElement) {
            return false;
        }

        contentElement.focus();

        let caretOffset;

        if (caret === "end") {
            caretOffset =
                normalizeEditableText(
                    contentElement.innerText
                ).length;
        } else if (
            typeof caret === "number" &&
            Number.isFinite(caret)
        ) {
            caretOffset = Math.max(0, caret);
        } else {
            caretOffset = 0;
        }

        setCaretCharacterOffset(
            contentElement,
            caretOffset
        );

        return true;
    }

    /**
     * Focuses the first block.
     *
     * @returns {boolean}
     */
    function focusFirstBlock() {
        const firstBlock = getFlattenedBlocks()[0];

        if (!firstBlock) {
            return false;
        }

        return focusBlock(
            firstBlock.block.id,
            0
        );
    }

    /**
     * Focuses the last block.
     *
     * @returns {boolean}
     */
    function focusLastBlock() {
        const flattenedBlocks = getFlattenedBlocks();

        if (flattenedBlocks.length === 0) {
            return false;
        }

        return focusBlock(
            flattenedBlocks[flattenedBlocks.length - 1].block.id,
            "end"
        );
    }

    /**
     * Returns the caret character offset inside an element.
     *
     * @param {HTMLElement} element
     * @returns {number}
     */
    function getCaretCharacterOffset(element) {
        const selection = window.getSelection();

        if (
            !selection ||
            selection.rangeCount === 0
        ) {
            return 0;
        }

        const activeRange = selection.getRangeAt(0);

        if (!element.contains(activeRange.startContainer)) {
            return 0;
        }

        const measurementRange =
            activeRange.cloneRange();

        measurementRange.selectNodeContents(element);
        measurementRange.setEnd(
            activeRange.startContainer,
            activeRange.startOffset
        );

        return measurementRange.toString().length;
    }

    /**
     * Places the caret at a character offset.
     *
     * @param {HTMLElement} element
     * @param {number} requestedOffset
     */
    function setCaretCharacterOffset(
        element,
        requestedOffset
    ) {
        const selection = window.getSelection();

        if (!selection) {
            return;
        }

        const range = document.createRange();
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT
        );

        let remainingOffset = Math.max(
            0,
            requestedOffset
        );

        let textNode = walker.nextNode();

        while (textNode) {
            const textLength =
                textNode.nodeValue?.length || 0;

            if (remainingOffset <= textLength) {
                range.setStart(
                    textNode,
                    remainingOffset
                );

                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);

                return;
            }

            remainingOffset -= textLength;
            textNode = walker.nextNode();
        }

        range.selectNodeContents(element);
        range.collapse(false);

        selection.removeAllRanges();
        selection.addRange(range);
    }

    /**
     * Checks whether the active selection is collapsed.
     *
     * @returns {boolean}
     */
    function isSelectionCollapsed() {
        const selection = window.getSelection();

        return Boolean(
            selection &&
            selection.rangeCount > 0 &&
            selection.isCollapsed
        );
    }

    // =========================================================================
    // Clipboard helpers
    // =========================================================================

    /**
     * Inserts plain text at the current selection.
     *
     * @param {string} text
     */
    function insertPlainTextAtSelection(text) {
        const selection = window.getSelection();

        if (
            !selection ||
            selection.rangeCount === 0
        ) {
            return;
        }

        const range = selection.getRangeAt(0);

        range.deleteContents();

        const textNode = document.createTextNode(text);

        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);

        selection.removeAllRanges();
        selection.addRange(range);

        const activeElement = document.activeElement;

        if (
            activeElement instanceof HTMLElement &&
            activeElement.matches(".block__content")
        ) {
            activeElement.dispatchEvent(
                new InputEvent("input", {
                    bubbles: true,
                    inputType: "insertFromPaste",
                    data: text
                })
            );
        }
    }

    // =========================================================================
    // DOM helpers
    // =========================================================================

    /**
     * Returns the editable block content element for an event.
     *
     * @param {Event} event
     * @returns {HTMLElement|null}
     */
    function getContentElementFromEvent(event) {
        if (!(event.target instanceof Element)) {
            return null;
        }

        const contentElement = event.target.closest(
            ".block__content"
        );

        return contentElement instanceof HTMLElement
            ? contentElement
            : null;
    }

    /**
     * Clears visual block selection.
     */
    function clearBlockSelection() {
        if (!blockListElement) {
            return;
        }

        const selectedBlocks =
            blockListElement.querySelectorAll(
                '.block[data-selected="true"]'
            );

        for (const blockElement of selectedBlocks) {
            delete blockElement.dataset.selected;
        }
    }

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

        return value.replace(
            /["\\]/g,
            "\\$&"
        );
    }

    /**
     * Normalizes text extracted from a contenteditable element.
     *
     * @param {*} value
     * @returns {string}
     */
    function normalizeEditableText(value) {
        if (typeof value !== "string") {
            return "";
        }

        return value
            .replace(/\r\n?/g, "\n")
            .replace(/\u00a0/g, " ");
    }

    // =========================================================================
    // Change notifications
    // =========================================================================

    /**
     * Notifies the application that the document has changed.
     *
     * @param {string} reason
     */
    function notifyChange(reason) {
        if (!changeHandler) {
            return;
        }

        changeHandler(
            getDocument(),
            {
                reason
            }
        );
    }

    /**
     * Replaces the editor change handler.
     *
     * @param {Function|null} handler
     */
    function setChangeHandler(handler) {
        changeHandler =
            typeof handler === "function"
                ? handler
                : null;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    window.NoteUEditor = Object.freeze({
        initialize,

        getDocument,
        setDocument,
        render,

        createBlock,
        addBlock,
        insertBlockAfter,
        removeBlock,

        indentBlock,
        outdentBlock,

        focusBlock,
        focusFirstBlock,
        focusLastBlock,

        findBlockContext,
        setChangeHandler
    });
})();
