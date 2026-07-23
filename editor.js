/**
 * Note-U
 * Version: 0.2.1
 *
 * Block editor controller.
 *
 * This module is responsible for:
 * - rendering document blocks;
 * - editing block content;
 * - splitting and merging blocks;
 * - indenting and outdenting blocks;
 * - changing block types;
 * - opening slash commands;
 * - removing the slash command text after selection;
 * - handling checklists;
 * - duplicating, moving and deleting blocks;
 * - preserving nested block structures.
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

    const BLOCK_TYPE_DEFINITIONS = Object.freeze([
        {
            type: "paragraph",
            label: "Text",
            description: "Plain text block",
            icon: "T",
            keywords: [
                "text",
                "paragraph",
                "plain"
            ]
        },
        {
            type: "heading-1",
            label: "Heading 1",
            description: "Large section heading",
            icon: "H1",
            keywords: [
                "heading",
                "title",
                "h1"
            ]
        },
        {
            type: "heading-2",
            label: "Heading 2",
            description: "Medium section heading",
            icon: "H2",
            keywords: [
                "heading",
                "subtitle",
                "h2"
            ]
        },
        {
            type: "bullet-list",
            label: "Bulleted list",
            description: "Create a simple bulleted list",
            icon: "•",
            keywords: [
                "bullet",
                "bulleted",
                "list",
                "unordered"
            ]
        },
        {
            type: "numbered-list",
            label: "Numbered list",
            description: "Create an ordered list",
            icon: "1.",
            keywords: [
                "number",
                "numbered",
                "list",
                "ordered"
            ]
        },
        {
            type: "checklist",
            label: "Checklist",
            description: "Track a task",
            icon: "☑",
            keywords: [
                "check",
                "checklist",
                "task",
                "todo"
            ]
        },
        {
            type: "quote",
            label: "Quote",
            description: "Highlight a quotation",
            icon: "❝",
            keywords: [
                "quote",
                "quotation",
                "blockquote"
            ]
        },
        {
            type: "divider",
            label: "Divider",
            description: "Add a horizontal divider",
            icon: "—",
            keywords: [
                "divider",
                "line",
                "separator",
                "rule"
            ]
        }
    ]);

    const PLACEHOLDER_TEXT =
        'Type "/" for commands';

    const SLASH_MENU_MARGIN = 10;
    const SLASH_MENU_GAP = 6;

    // =========================================================================
    // Internal state
    // =========================================================================

    let elements = null;
    let currentDocument = null;
    let changeHandler = null;

    let activeBlockId = null;
    let activeMenuBlockId = null;

    let slashState = null;
    let slashResults = [];
    let slashSelectedIndex = 0;

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

            blockMenu:
                document.getElementById("block-menu"),

            blockTypeMenu:
                document.getElementById("block-type-menu"),

            slashMenu:
                document.getElementById("slash-menu")
        };

        validateElements();

        changeHandler =
            typeof options.onChange === "function"
                ? options.onChange
                : null;

        currentDocument =
            normalizeDocument(options.documentModel);

        bindEvents();
        renderDocument();

        isInitialized = true;
    }

    /**
     * Validates required editor elements.
     */
    function validateElements() {
        const requiredElements = {
            editorRoot: elements.editorRoot,
            blockList: elements.blockList
        };

        const missingElements =
            Object.entries(requiredElements)
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
        elements.editorRoot.addEventListener(
            "input",
            handleEditorInput
        );

        elements.editorRoot.addEventListener(
            "keydown",
            handleEditorKeyDown
        );

        elements.editorRoot.addEventListener(
            "click",
            handleEditorClick
        );

        elements.editorRoot.addEventListener(
            "focusin",
            handleEditorFocusIn
        );

        elements.editorRoot.addEventListener(
            "focusout",
            handleEditorFocusOut
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
            handleWindowResize
        );

        window.addEventListener(
            "scroll",
            handleWindowScroll,
            {
                passive: true
            }
        );

        if (elements.blockMenu) {
            elements.blockMenu.addEventListener(
                "pointerdown",
                preserveEditorFocus
            );

            elements.blockMenu.addEventListener(
                "click",
                handleBlockMenuClick
            );
        }

        if (elements.blockTypeMenu) {
            elements.blockTypeMenu.addEventListener(
                "pointerdown",
                preserveEditorFocus
            );

            elements.blockTypeMenu.addEventListener(
                "click",
                handleBlockTypeMenuClick
            );
        }

        if (elements.slashMenu) {
            elements.slashMenu.addEventListener(
                "pointerdown",
                preserveEditorFocus
            );

            elements.slashMenu.addEventListener(
                "click",
                handleSlashMenuClick
            );
        }
    }

    /**
     * Prevents menu clicks from moving focus away from the editor.
     *
     * @param {PointerEvent} event
     */
    function preserveEditorFocus(event) {
        event.preventDefault();
    }

    // =========================================================================
    // Document model
    // =========================================================================

    /**
     * Normalizes a document using the storage module.
     *
     * @param {*} value
     * @returns {Object}
     */
    function normalizeDocument(value) {
        if (
            window.NoteUStorage &&
            typeof window.NoteUStorage.normalizeDocument ===
                "function"
        ) {
            return window.NoteUStorage.normalizeDocument(
                value
            );
        }

        return value;
    }

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
        const block = {
            id: createBlockId(),
            type:
                isSupportedBlockType(type)
                    ? type
                    : DEFAULT_BLOCK_TYPE,
            content:
                type === "divider"
                    ? ""
                    : String(content || ""),
            children: []
        };

        if (block.type === "checklist") {
            block.checked = false;
        }

        return block;
    }

    /**
     * Creates a block identifier.
     *
     * @returns {string}
     */
    function createBlockId() {
        if (
            window.NoteUStorage &&
            typeof window.NoteUStorage.createId ===
                "function"
        ) {
            return window.NoteUStorage.createId();
        }

        if (
            window.crypto &&
            typeof window.crypto.randomUUID === "function"
        ) {
            return window.crypto.randomUUID();
        }

        return `block-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 10)}`;
    }

    /**
     * Checks whether a block type is supported.
     *
     * @param {string} type
     * @returns {boolean}
     */
    function isSupportedBlockType(type) {
        return BLOCK_TYPE_DEFINITIONS.some(
            definition =>
                definition.type === type
        );
    }

    /**
     * Returns a safe clone of the current document.
     *
     * @returns {Object}
     */
    function getDocument() {
        requireInitialization();

        synchronizeAllBlocksFromDom();

        if (
            window.NoteUStorage &&
            typeof window.NoteUStorage.cloneDocument ===
                "function"
        ) {
            return window.NoteUStorage.cloneDocument(
                currentDocument
            );
        }

        return JSON.parse(
            JSON.stringify(currentDocument)
        );
    }

    /**
     * Replaces the editor document.
     *
     * @param {*} nextDocument
     */
    function setDocument(nextDocument) {
        requireInitialization();

        closeAllMenus();

        currentDocument =
            normalizeDocument(nextDocument);

        renderDocument();
    }

    // =========================================================================
    // Rendering
    // =========================================================================

    /**
     * Renders the complete document.
     *
     * @param {Object} [focusOptions]
     * @param {string} [focusOptions.blockId]
     * @param {number} [focusOptions.offset]
     */
    function renderDocument(focusOptions = {}) {
        isRendering = true;

        const fragment =
            document.createDocumentFragment();

        for (const block of currentDocument.blocks) {
            fragment.appendChild(
                renderBlock(block)
            );
        }

        elements.blockList.replaceChildren(fragment);

        renumberLists(elements.blockList);

        isRendering = false;

        if (focusOptions.blockId) {
            requestAnimationFrame(() => {
                focusBlock(
                    focusOptions.blockId,
                    focusOptions.offset
                );
            });
        }
    }

    /**
     * Renders one block and its descendants.
     *
     * @param {Object} block
     * @returns {HTMLElement}
     */
    function renderBlock(block) {
        const blockElement =
            document.createElement("div");

        blockElement.className = "editor-block";
        blockElement.dataset.blockId = block.id;
        blockElement.dataset.blockType = block.type;
        blockElement.dataset.type = block.type;

        if (block.type === "checklist") {
            blockElement.dataset.checked =
                block.checked ? "true" : "false";
        }

        const controls =
            document.createElement("div");

        controls.className =
            "editor-block__controls";

        const handleButton =
            document.createElement("button");

        handleButton.type = "button";
        handleButton.className =
            "block-handle block-menu-button";
        handleButton.dataset.action =
            "open-block-menu";
        handleButton.setAttribute(
            "aria-label",
            "Open block menu"
        );
        handleButton.setAttribute(
            "title",
            "Block options"
        );
        handleButton.textContent = "⋮⋮";

        controls.appendChild(handleButton);

        const body =
            document.createElement("div");

        body.className = "editor-block__body";

        const contentRow =
            document.createElement("div");

        contentRow.className =
            "block-content-row";

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
                "Mark task as complete"
            );

            contentRow.appendChild(checkbox);
        }

        if (block.type === "divider") {
            const divider =
                document.createElement("div");

            divider.className = "block-divider";
            divider.setAttribute(
                "role",
                "separator"
            );

            contentRow.appendChild(divider);
        } else {
            const content =
                document.createElement("div");

            content.className = "block-content";
            content.contentEditable = "true";
            content.spellcheck = true;
            content.dataset.placeholder =
                PLACEHOLDER_TEXT;

            content.setAttribute(
                "role",
                "textbox"
            );

            content.setAttribute(
                "aria-multiline",
                "true"
            );

            content.textContent =
                block.content || "";

            contentRow.appendChild(content);
        }

        body.appendChild(contentRow);

        if (
            Array.isArray(block.children) &&
            block.children.length > 0
        ) {
            const childrenContainer =
                document.createElement("div");

            childrenContainer.className =
                "block-children";

            for (const childBlock of block.children) {
                childrenContainer.appendChild(
                    renderBlock(childBlock)
                );
            }

            body.appendChild(
                childrenContainer
            );
        }

        blockElement.appendChild(controls);
        blockElement.appendChild(body);

        return blockElement;
    }

    /**
     * Updates ordered-list numbers in a container.
     *
     * @param {HTMLElement} container
     */
    function renumberLists(container) {
        let currentNumber = 0;

        for (const child of container.children) {
            if (
                !(child instanceof HTMLElement) ||
                !child.classList.contains(
                    "editor-block"
                )
            ) {
                continue;
            }

            const contentRow =
                child.querySelector(
                    ":scope > .editor-block__body > .block-content-row"
                );

            if (
                child.dataset.blockType ===
                "numbered-list"
            ) {
                currentNumber += 1;

                if (contentRow) {
                    contentRow.dataset.listNumber =
                        String(currentNumber);
                }
            } else {
                currentNumber = 0;
            }

            const nestedContainer =
                child.querySelector(
                    ":scope > .editor-block__body > .block-children"
                );

            if (
                nestedContainer instanceof
                HTMLElement
            ) {
                renumberLists(nestedContainer);
            }
        }
    }

    // =========================================================================
    // Input handling
    // =========================================================================

    /**
     * Handles editable block input.
     *
     * @param {InputEvent} event
     */
    function handleEditorInput(event) {
        if (isRendering) {
            return;
        }

        const contentElement =
            getContentElement(event.target);

        if (!contentElement) {
            return;
        }

        const blockElement =
            getBlockElement(contentElement);

        if (!blockElement) {
            return;
        }

        activeBlockId =
            blockElement.dataset.blockId || null;

        synchronizeBlockFromDom(blockElement);
        updateSlashMenu(contentElement);
        notifyChange("edit-content");
    }

    /**
     * Handles editor keyboard behavior.
     *
     * @param {KeyboardEvent} event
     */
    function handleEditorKeyDown(event) {
        const contentElement =
            getContentElement(event.target);

        if (!contentElement) {
            return;
        }

        const blockElement =
            getBlockElement(contentElement);

        if (!blockElement) {
            return;
        }

        activeBlockId =
            blockElement.dataset.blockId || null;

        if (
            isSlashMenuOpen() &&
            handleSlashMenuKeyboard(event)
        ) {
            return;
        }

        if (event.key === "Enter") {
            if (event.shiftKey) {
                event.preventDefault();
                insertPlainTextAtSelection("\n");
                synchronizeBlockFromDom(
                    blockElement
                );
                notifyChange("insert-line-break");
                closeSlashMenu();
                return;
            }

            event.preventDefault();
            splitBlockAtSelection(
                blockElement,
                contentElement
            );
            return;
        }

        if (event.key === "Backspace") {
            if (
                getCaretOffset(contentElement) === 0
            ) {
                event.preventDefault();
                mergeWithPreviousBlock(
                    blockElement
                );
            }

            return;
        }

        if (event.key === "Delete") {
            if (
                getCaretOffset(contentElement) ===
                getTextLength(contentElement)
            ) {
                event.preventDefault();
                mergeWithNextBlock(
                    blockElement
                );
            }

            return;
        }

        if (event.key === "Tab") {
            event.preventDefault();

            if (event.shiftKey) {
                outdentBlock(blockElement);
            } else {
                indentBlock(blockElement);
            }

            return;
        }

        if (event.key === "Escape") {
            closeAllMenus();
        }
    }

    /**
     * Handles editor clicks.
     *
     * @param {MouseEvent} event
     */
    function handleEditorClick(event) {
        if (!(event.target instanceof Element)) {
            return;
        }

        const blockElement =
            event.target.closest(
                ".editor-block"
            );

        if (blockElement instanceof HTMLElement) {
            activeBlockId =
                blockElement.dataset.blockId || null;
        }

        const actionElement =
            event.target.closest("[data-action]");

        if (!(actionElement instanceof HTMLElement)) {
            return;
        }

        const action =
            actionElement.dataset.action;

        if (
            action === "open-block-menu" &&
            blockElement instanceof HTMLElement
        ) {
            event.preventDefault();
            event.stopPropagation();

            openBlockMenu(
                blockElement,
                actionElement
            );

            return;
        }

        if (
            action === "toggle-checklist" &&
            blockElement instanceof HTMLElement &&
            actionElement instanceof HTMLInputElement
        ) {
            updateChecklistState(
                blockElement,
                actionElement.checked
            );
        }
    }

    /**
     * Tracks the active block.
     *
     * @param {FocusEvent} event
     */
    function handleEditorFocusIn(event) {
        const contentElement =
            getContentElement(event.target);

        if (!contentElement) {
            return;
        }

        const blockElement =
            getBlockElement(contentElement);

        if (!blockElement) {
            return;
        }

        activeBlockId =
            blockElement.dataset.blockId || null;
    }

    /**
     * Closes slash commands after editor focus leaves.
     *
     * @param {FocusEvent} event
     */
    function handleEditorFocusOut(event) {
        const nextTarget = event.relatedTarget;

        if (
            nextTarget instanceof Node &&
            elements.slashMenu &&
            elements.slashMenu.contains(nextTarget)
        ) {
            return;
        }

        window.setTimeout(() => {
            const selection =
                window.getSelection();

            if (
                !selection ||
                !selection.anchorNode ||
                !elements.editorRoot.contains(
                    selection.anchorNode
                )
            ) {
                closeSlashMenu();
            }
        }, 0);
    }

    // =========================================================================
    // Slash commands
    // =========================================================================

    /**
     * Inspects the current text and opens slash commands when appropriate.
     *
     * @param {HTMLElement} contentElement
     */
    function updateSlashMenu(contentElement) {
        const selection =
            window.getSelection();

        if (
            !selection ||
            selection.rangeCount === 0 ||
            !selection.isCollapsed
        ) {
            closeSlashMenu();
            return;
        }

        const caretOffset =
            getCaretOffset(contentElement);

        const text =
            contentElement.textContent || "";

        const textBeforeCaret =
            text.slice(0, caretOffset);

        const slashMatch =
            textBeforeCaret.match(
                /(?:^|\s)\/([^\s/]*)$/
            );

        if (!slashMatch) {
            closeSlashMenu();
            return;
        }

        const query =
            slashMatch[1].toLowerCase();

        const slashStart =
            caretOffset -
            query.length -
            1;

        slashResults =
            filterSlashCommands(query);

        if (slashResults.length === 0) {
            closeSlashMenu();
            return;
        }

        const blockElement =
            getBlockElement(contentElement);

        if (!blockElement) {
            closeSlashMenu();
            return;
        }

        slashState = {
            blockId:
                blockElement.dataset.blockId,
            contentElement,
            slashStart,
            caretOffset,
            query
        };

        slashSelectedIndex = 0;

        renderSlashMenu();
        positionSlashMenu();
    }

    /**
     * Filters block commands by a slash query.
     *
     * @param {string} query
     * @returns {Array<Object>}
     */
    function filterSlashCommands(query) {
        if (!query) {
            return [...BLOCK_TYPE_DEFINITIONS];
        }

        return BLOCK_TYPE_DEFINITIONS.filter(
            definition => {
                const searchableText = [
                    definition.label,
                    definition.description,
                    definition.type,
                    ...definition.keywords
                ]
                    .join(" ")
                    .toLowerCase();

                return searchableText.includes(query);
            }
        );
    }

    /**
     * Renders the slash menu.
     */
    function renderSlashMenu() {
        if (!elements.slashMenu) {
            return;
        }

        const fragment =
            document.createDocumentFragment();

        const label =
            document.createElement("div");

        label.className =
            "slash-menu__label";
        label.textContent = "Blocks";

        fragment.appendChild(label);

        slashResults.forEach(
            (definition, index) => {
                const button =
                    createTypeMenuButton(
                        definition,
                        "slash-menu-item"
                    );

                button.dataset.slashIndex =
                    String(index);

                button.setAttribute(
                    "aria-selected",
                    index === slashSelectedIndex
                        ? "true"
                        : "false"
                );

                if (
                    index === slashSelectedIndex
                ) {
                    button.classList.add(
                        "slash-menu-item--active"
                    );
                }

                fragment.appendChild(button);
            }
        );

        elements.slashMenu.replaceChildren(
            fragment
        );

        elements.slashMenu.hidden = false;
    }

    /**
     * Positions slash commands near the caret.
     */
    function positionSlashMenu() {
        if (
            !elements.slashMenu ||
            !slashState
        ) {
            return;
        }

        const caretRect = getCaretRect();

        const fallbackRect =
            slashState.contentElement.getBoundingClientRect();

        const anchorRect =
            caretRect &&
            (
                caretRect.width > 0 ||
                caretRect.height > 0
            )
                ? caretRect
                : fallbackRect;

        const menuWidth =
            elements.slashMenu.offsetWidth || 290;

        const menuHeight =
            elements.slashMenu.offsetHeight || 320;

        let left = anchorRect.left;
        let top =
            anchorRect.bottom +
            SLASH_MENU_GAP;

        if (
            left + menuWidth >
            window.innerWidth -
                SLASH_MENU_MARGIN
        ) {
            left =
                window.innerWidth -
                menuWidth -
                SLASH_MENU_MARGIN;
        }

        if (
            top + menuHeight >
            window.innerHeight -
                SLASH_MENU_MARGIN
        ) {
            top =
                anchorRect.top -
                menuHeight -
                SLASH_MENU_GAP;
        }

        left = Math.max(
            SLASH_MENU_MARGIN,
            left
        );

        top = Math.max(
            SLASH_MENU_MARGIN,
            top
        );

        elements.slashMenu.style.left =
            `${left}px`;

        elements.slashMenu.style.top =
            `${top}px`;

        elements.slashMenu.style.right =
            "auto";

        elements.slashMenu.style.bottom =
            "auto";
    }

    /**
     * Handles slash menu keyboard navigation.
     *
     * @param {KeyboardEvent} event
     * @returns {boolean}
     */
    function handleSlashMenuKeyboard(event) {
        if (!isSlashMenuOpen()) {
            return false;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();

            slashSelectedIndex =
                (
                    slashSelectedIndex + 1
                ) % slashResults.length;

            renderSlashMenu();
            positionSlashMenu();

            return true;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();

            slashSelectedIndex =
                (
                    slashSelectedIndex -
                    1 +
                    slashResults.length
                ) % slashResults.length;

            renderSlashMenu();
            positionSlashMenu();

            return true;
        }

        if (
            event.key === "Enter" ||
            event.key === "Tab"
        ) {
            event.preventDefault();

            const selectedDefinition =
                slashResults[
                    slashSelectedIndex
                ];

            if (selectedDefinition) {
                applySlashCommand(
                    selectedDefinition.type
                );
            }

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
     * Handles slash menu pointer selection.
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

        if (!(button instanceof HTMLElement)) {
            return;
        }

        const blockType =
            button.dataset.blockType;

        if (!blockType) {
            return;
        }

        applySlashCommand(blockType);
    }

    /**
     * Applies a slash command.
     *
     * The slash character and any typed command query are removed before
     * changing the block type.
     *
     * @param {string} blockType
     */
    function applySlashCommand(blockType) {
        if (
            !slashState ||
            !isSupportedBlockType(blockType)
        ) {
            closeSlashMenu();
            return;
        }

        const {
            blockId,
            contentElement,
            slashStart,
            caretOffset
        } = slashState;

        const blockLocation =
            findBlockLocation(blockId);

        if (!blockLocation) {
            closeSlashMenu();
            return;
        }

        const fullText =
            contentElement.textContent || "";

        const textBeforeCommand =
            fullText.slice(0, slashStart);

        const textAfterCommand =
            fullText.slice(caretOffset);

        const cleanedText =
            textBeforeCommand +
            textAfterCommand;

        /*
         * The block model is updated directly so the slash and query cannot
         * remain in the content after rendering.
         */
        blockLocation.block.content =
            blockType === "divider"
                ? ""
                : cleanedText;

        blockLocation.block.type =
            blockType;

        if (blockType === "checklist") {
            blockLocation.block.checked =
                Boolean(
                    blockLocation.block.checked
                );
        } else {
            delete blockLocation.block.checked;
        }

        const nextCaretOffset =
            Math.min(
                slashStart,
                cleanedText.length
            );

        closeSlashMenu();

        renderDocument({
            blockId,
            offset:
                blockType === "divider"
                    ? undefined
                    : nextCaretOffset
        });

        notifyChange("slash-command");
    }

    /**
     * Checks whether the slash menu is open.
     *
     * @returns {boolean}
     */
    function isSlashMenuOpen() {
        return Boolean(
            elements.slashMenu &&
            !elements.slashMenu.hidden &&
            slashState
        );
    }

    /**
     * Closes slash commands.
     */
    function closeSlashMenu() {
        slashState = null;
        slashResults = [];
        slashSelectedIndex = 0;

        if (elements.slashMenu) {
            elements.slashMenu.hidden = true;
            elements.slashMenu.replaceChildren();
        }
    }

    // =========================================================================
    // Block splitting and merging
    // =========================================================================

    /**
     * Splits a block at the current caret.
     *
     * @param {HTMLElement} blockElement
     * @param {HTMLElement} contentElement
     */
    function splitBlockAtSelection(
        blockElement,
        contentElement
    ) {
        const blockId =
            blockElement.dataset.blockId;

        const location =
            findBlockLocation(blockId);

        if (!location) {
            return;
        }

        const text =
            contentElement.textContent || "";

        const caretOffset =
            getCaretOffset(contentElement);

        const beforeText =
            text.slice(0, caretOffset);

        const afterText =
            text.slice(caretOffset);

        location.block.content =
            beforeText;

        const nextType =
            shouldContinueBlockType(
                location.block.type,
                afterText
            )
                ? location.block.type
                : DEFAULT_BLOCK_TYPE;

        const nextBlock =
            createBlock(
                nextType,
                afterText
            );

        if (
            nextType === "checklist"
        ) {
            nextBlock.checked = false;
        }

        location.collection.splice(
            location.index + 1,
            0,
            nextBlock
        );

        closeAllMenus();

        renderDocument({
            blockId: nextBlock.id,
            offset: 0
        });

        notifyChange("split-block");
    }

    /**
     * Determines whether Enter should preserve the current block type.
     *
     * @param {string} type
     * @param {string} remainingText
     * @returns {boolean}
     */
    function shouldContinueBlockType(
        type,
        remainingText
    ) {
        if (
            type === "bullet-list" ||
            type === "numbered-list" ||
            type === "checklist"
        ) {
            return true;
        }

        if (
            type === "heading-1" ||
            type === "heading-2" ||
            type === "quote"
        ) {
            return remainingText.length > 0;
        }

        return type === "paragraph";
    }

    /**
     * Merges the current block into the previous block.
     *
     * @param {HTMLElement} blockElement
     */
    function mergeWithPreviousBlock(blockElement) {
        const blockId =
            blockElement.dataset.blockId;

        const currentLocation =
            findBlockLocation(blockId);

        if (!currentLocation) {
            return;
        }

        const previousBlock =
            getPreviousBlock(blockId);

        if (!previousBlock) {
            return;
        }

        if (previousBlock.type === "divider") {
            removeBlockById(previousBlock.id);

            renderDocument({
                blockId,
                offset: 0
            });

            notifyChange("delete-divider");
            return;
        }

        synchronizeBlockFromDom(blockElement);

        const previousLength =
            previousBlock.content.length;

        previousBlock.content +=
            currentLocation.block.content;

        if (
            Array.isArray(
                currentLocation.block.children
            ) &&
            currentLocation.block.children.length > 0
        ) {
            previousBlock.children.push(
                ...currentLocation.block.children
            );
        }

        currentLocation.collection.splice(
            currentLocation.index,
            1
        );

        closeAllMenus();

        renderDocument({
            blockId: previousBlock.id,
            offset: previousLength
        });

        notifyChange("merge-block");
    }

    /**
     * Merges the next block into the current block.
     *
     * @param {HTMLElement} blockElement
     */
    function mergeWithNextBlock(blockElement) {
        const blockId =
            blockElement.dataset.blockId;

        const currentLocation =
            findBlockLocation(blockId);

        if (!currentLocation) {
            return;
        }

        const nextBlock =
            getNextBlock(blockId);

        if (!nextBlock) {
            return;
        }

        if (nextBlock.type === "divider") {
            removeBlockById(nextBlock.id);

            renderDocument({
                blockId,
                offset:
                    currentLocation.block.content.length
            });

            notifyChange("delete-divider");
            return;
        }

        synchronizeBlockFromDom(blockElement);

        const currentLength =
            currentLocation.block.content.length;

        currentLocation.block.content +=
            nextBlock.content;

        if (
            Array.isArray(nextBlock.children) &&
            nextBlock.children.length > 0
        ) {
            currentLocation.block.children.push(
                ...nextBlock.children
            );
        }

        removeBlockById(nextBlock.id);

        closeAllMenus();

        renderDocument({
            blockId,
            offset: currentLength
        });

        notifyChange("merge-block");
    }

    // =========================================================================
    // Indentation
    // =========================================================================

    /**
     * Nests a block below its previous sibling.
     *
     * @param {HTMLElement} blockElement
     */
    function indentBlock(blockElement) {
        const blockId =
            blockElement.dataset.blockId;

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

        closeAllMenus();

        renderDocument({
            blockId,
            offset:
                block.type === "divider"
                    ? undefined
                    : block.content.length
        });

        notifyChange("indent-block");
    }

    /**
     * Moves a nested block one level outward.
     *
     * @param {HTMLElement} blockElement
     */
    function outdentBlock(blockElement) {
        const blockId =
            blockElement.dataset.blockId;

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

        closeAllMenus();

        renderDocument({
            blockId,
            offset:
                block.type === "divider"
                    ? undefined
                    : block.content.length
        });

        notifyChange("outdent-block");
    }

    // =========================================================================
    // Block menus
    // =========================================================================

    /**
     * Opens the main block menu.
     *
     * @param {HTMLElement} blockElement
     * @param {HTMLElement} anchorElement
     */
    function openBlockMenu(
        blockElement,
        anchorElement
    ) {
        if (!elements.blockMenu) {
            return;
        }

        closeSlashMenu();
        closeBlockTypeMenu();

        activeMenuBlockId =
            blockElement.dataset.blockId;

        populateBlockMenu();

        elements.blockMenu.hidden = false;

        positionMenu(
            elements.blockMenu,
            anchorElement.getBoundingClientRect()
        );
    }

    /**
     * Populates the block menu.
     */
    function populateBlockMenu() {
        if (!elements.blockMenu) {
            return;
        }

        const actions = [
            {
                action: "change-type",
                label: "Turn into",
                icon: "↻"
            },
            {
                action: "duplicate",
                label: "Duplicate",
                icon: "⧉"
            },
            {
                action: "move-up",
                label: "Move up",
                icon: "↑"
            },
            {
                action: "move-down",
                label: "Move down",
                icon: "↓"
            },
            {
                action: "delete",
                label: "Delete",
                icon: "⌫",
                danger: true
            }
        ];

        const fragment =
            document.createDocumentFragment();

        for (const item of actions) {
            const button =
                document.createElement("button");

            button.type = "button";
            button.className =
                "block-menu-item";
            button.dataset.action =
                item.action;

            if (item.danger) {
                button.classList.add(
                    "block-menu-item--danger"
                );
            }

            const icon =
                document.createElement("span");

            icon.className =
                "block-menu-item__icon";
            icon.textContent = item.icon;

            const label =
                document.createElement("span");

            label.className =
                "block-menu-item__title";
            label.textContent = item.label;

            button.append(icon, label);
            fragment.appendChild(button);
        }

        elements.blockMenu.replaceChildren(
            fragment
        );
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
                "[data-action]"
            );

        if (!(button instanceof HTMLElement)) {
            return;
        }

        const action =
            button.dataset.action;

        if (!activeMenuBlockId || !action) {
            return;
        }

        const blockElement =
            getBlockElementById(
                activeMenuBlockId
            );

        if (action === "change-type") {
            if (blockElement) {
                openBlockTypeMenu(
                    blockElement,
                    button
                );
            }

            return;
        }

        closeBlockMenu();

        if (action === "duplicate") {
            duplicateBlock(activeMenuBlockId);
        } else if (action === "move-up") {
            moveBlock(activeMenuBlockId, -1);
        } else if (action === "move-down") {
            moveBlock(activeMenuBlockId, 1);
        } else if (action === "delete") {
            deleteBlock(activeMenuBlockId);
        }
    }

    /**
     * Opens the block type menu.
     *
     * @param {HTMLElement} blockElement
     * @param {HTMLElement} anchorElement
     */
    function openBlockTypeMenu(
        blockElement,
        anchorElement
    ) {
        if (!elements.blockTypeMenu) {
            return;
        }

        activeMenuBlockId =
            blockElement.dataset.blockId;

        const fragment =
            document.createDocumentFragment();

        for (
            const definition of
            BLOCK_TYPE_DEFINITIONS
        ) {
            fragment.appendChild(
                createTypeMenuButton(
                    definition,
                    "block-type-menu-item"
                )
            );
        }

        elements.blockTypeMenu.replaceChildren(
            fragment
        );

        elements.blockTypeMenu.hidden = false;

        positionMenu(
            elements.blockTypeMenu,
            anchorElement.getBoundingClientRect()
        );
    }

    /**
     * Creates a menu button for a block type.
     *
     * @param {Object} definition
     * @param {string} className
     * @returns {HTMLButtonElement}
     */
    function createTypeMenuButton(
        definition,
        className
    ) {
        const button =
            document.createElement("button");

        button.type = "button";
        button.className = className;
        button.dataset.blockType =
            definition.type;

        const icon =
            document.createElement("span");

        icon.className =
            `${className}__icon`;
        icon.textContent =
            definition.icon;

        const content =
            document.createElement("span");

        content.className =
            `${className}__content`;

        const title =
            document.createElement("span");

        title.className =
            `${className}__title`;
        title.textContent =
            definition.label;

        const description =
            document.createElement("span");

        description.className =
            `${className}__description`;
        description.textContent =
            definition.description;

        content.append(
            title,
            description
        );

        button.append(
            icon,
            content
        );

        return button;
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

        if (!(button instanceof HTMLElement)) {
            return;
        }

        const blockType =
            button.dataset.blockType;

        if (
            !activeMenuBlockId ||
            !blockType
        ) {
            return;
        }

        changeBlockType(
            activeMenuBlockId,
            blockType
        );
    }

    /**
     * Changes the type of a block.
     *
     * @param {string} blockId
     * @param {string} blockType
     */
    function changeBlockType(
        blockId,
        blockType
    ) {
        if (!isSupportedBlockType(blockType)) {
            return;
        }

        synchronizeAllBlocksFromDom();

        const location =
            findBlockLocation(blockId);

        if (!location) {
            return;
        }

        location.block.type =
            blockType;

        if (blockType === "divider") {
            location.block.content = "";
            delete location.block.checked;
        } else if (blockType === "checklist") {
            location.block.checked =
                Boolean(
                    location.block.checked
                );
        } else {
            delete location.block.checked;
        }

        closeAllMenus();

        renderDocument({
            blockId,
            offset:
                blockType === "divider"
                    ? undefined
                    : location.block.content.length
        });

        notifyChange("change-block-type");
    }

    /**
     * Positions a menu near an anchor rectangle.
     *
     * @param {HTMLElement} menu
     * @param {DOMRect} anchorRect
     */
    function positionMenu(menu, anchorRect) {
        const margin = 10;
        const gap = 6;

        const menuWidth =
            menu.offsetWidth || 240;

        const menuHeight =
            menu.offsetHeight || 320;

        let left =
            anchorRect.right + gap;

        let top =
            anchorRect.top;

        if (
            left + menuWidth >
            window.innerWidth - margin
        ) {
            left =
                anchorRect.left -
                menuWidth -
                gap;
        }

        if (
            top + menuHeight >
            window.innerHeight - margin
        ) {
            top =
                window.innerHeight -
                menuHeight -
                margin;
        }

        left = Math.max(margin, left);
        top = Math.max(margin, top);

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.right = "auto";
        menu.style.bottom = "auto";
    }

    /**
     * Closes the main block menu.
     */
    function closeBlockMenu() {
        if (elements.blockMenu) {
            elements.blockMenu.hidden = true;
        }
    }

    /**
     * Closes the type menu.
     */
    function closeBlockTypeMenu() {
        if (elements.blockTypeMenu) {
            elements.blockTypeMenu.hidden = true;
        }
    }

    /**
     * Closes all editor menus.
     */
    function closeAllMenus() {
        closeSlashMenu();
        closeBlockMenu();
        closeBlockTypeMenu();

        activeMenuBlockId = null;
    }

    // =========================================================================
    // Block actions
    // =========================================================================

    /**
     * Adds a new block at the end of the document.
     *
     * @param {Object} [options]
     * @param {string} [options.type]
     * @param {boolean} [options.focus]
     * @returns {Object}
     */
    function addBlock(options = {}) {
        requireInitialization();

        synchronizeAllBlocksFromDom();

        const block =
            createBlock(
                options.type ||
                DEFAULT_BLOCK_TYPE
            );

        currentDocument.blocks.push(block);

        renderDocument({
            blockId:
                options.focus === false
                    ? undefined
                    : block.id,
            offset: 0
        });

        notifyChange("add-block");

        return block;
    }

    /**
     * Duplicates a block and its descendants.
     *
     * @param {string} blockId
     */
    function duplicateBlock(blockId) {
        synchronizeAllBlocksFromDom();

        const location =
            findBlockLocation(blockId);

        if (!location) {
            return;
        }

        const duplicate =
            cloneBlockWithNewIds(
                location.block
            );

        location.collection.splice(
            location.index + 1,
            0,
            duplicate
        );

        renderDocument({
            blockId: duplicate.id,
            offset:
                duplicate.type === "divider"
                    ? undefined
                    : duplicate.content.length
        });

        notifyChange("duplicate-block");
    }

    /**
     * Clones a block while generating new identifiers.
     *
     * @param {Object} block
     * @returns {Object}
     */
    function cloneBlockWithNewIds(block) {
        const clone = {
            id: createBlockId(),
            type: block.type,
            content: block.content,
            children:
                block.children.map(
                    cloneBlockWithNewIds
                )
        };

        if (clone.type === "checklist") {
            clone.checked =
                Boolean(block.checked);
        }

        return clone;
    }

    /**
     * Moves a block among its siblings.
     *
     * @param {string} blockId
     * @param {number} direction
     */
    function moveBlock(blockId, direction) {
        synchronizeAllBlocksFromDom();

        const location =
            findBlockLocation(blockId);

        if (!location) {
            return;
        }

        const destinationIndex =
            location.index + direction;

        if (
            destinationIndex < 0 ||
            destinationIndex >=
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
            destinationIndex,
            0,
            block
        );

        renderDocument({
            blockId,
            offset:
                block.type === "divider"
                    ? undefined
                    : block.content.length
        });

        notifyChange("move-block");
    }

    /**
     * Deletes a block.
     *
     * @param {string} blockId
     */
    function deleteBlock(blockId) {
        synchronizeAllBlocksFromDom();

        const previousBlock =
            getPreviousBlock(blockId);

        const nextBlock =
            getNextBlock(blockId);

        removeBlockById(blockId);

        if (currentDocument.blocks.length === 0) {
            const replacement =
                createBlock();

            currentDocument.blocks.push(
                replacement
            );
        }

        const focusTarget =
            previousBlock ||
            nextBlock ||
            currentDocument.blocks[0];

        closeAllMenus();

        renderDocument({
            blockId: focusTarget.id,
            offset:
                focusTarget.type === "divider"
                    ? undefined
                    : focusTarget.content.length
        });

        notifyChange("delete-block");
    }

    /**
     * Removes a block by identifier.
     *
     * @param {string} blockId
     * @returns {boolean}
     */
    function removeBlockById(blockId) {
        const location =
            findBlockLocation(blockId);

        if (!location) {
            return false;
        }

        location.collection.splice(
            location.index,
            1
        );

        return true;
    }

    /**
     * Updates checklist state.
     *
     * @param {HTMLElement} blockElement
     * @param {boolean} checked
     */
    function updateChecklistState(
        blockElement,
        checked
    ) {
        const blockId =
            blockElement.dataset.blockId;

        const location =
            findBlockLocation(blockId);

        if (!location) {
            return;
        }

        location.block.checked =
            Boolean(checked);

        blockElement.dataset.checked =
            checked ? "true" : "false";

        notifyChange("toggle-checklist");
    }

    // =========================================================================
    // Block traversal
    // =========================================================================

    /**
     * Finds a block and its collection context.
     *
     * @param {string} blockId
     * @returns {Object|null}
     */
    function findBlockLocation(blockId) {
        function search(
            collection,
            parentBlock = null
        ) {
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

                const childResult =
                    search(
                        block.children,
                        block
                    );

                if (childResult) {
                    return childResult;
                }
            }

            return null;
        }

        return search(currentDocument.blocks);
    }

    /**
     * Returns all blocks in visual order.
     *
     * @returns {Array<Object>}
     */
    function getFlattenedBlocks() {
        const result = [];

        function visit(blocks) {
            for (const block of blocks) {
                result.push(block);
                visit(block.children);
            }
        }

        visit(currentDocument.blocks);

        return result;
    }

    /**
     * Returns the previous block in visual order.
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
     * Returns the next block in visual order.
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

    // =========================================================================
    // DOM synchronization
    // =========================================================================

    /**
     * Synchronizes all rendered blocks into the document model.
     */
    function synchronizeAllBlocksFromDom() {
        const blockElements =
            elements.editorRoot.querySelectorAll(
                ".editor-block[data-block-id]"
            );

        for (const blockElement of blockElements) {
            synchronizeBlockFromDom(
                blockElement
            );
        }
    }

    /**
     * Synchronizes one rendered block into the document model.
     *
     * @param {HTMLElement} blockElement
     */
    function synchronizeBlockFromDom(
        blockElement
    ) {
        const blockId =
            blockElement.dataset.blockId;

        const location =
            findBlockLocation(blockId);

        if (!location) {
            return;
        }

        if (location.block.type === "divider") {
            location.block.content = "";
            return;
        }

        const contentElement =
            blockElement.querySelector(
                ":scope > .editor-block__body > .block-content-row > .block-content"
            );

        if (
            contentElement instanceof HTMLElement
        ) {
            location.block.content =
                normalizeEditableText(
                    contentElement.innerText
                );
        }

        if (
            location.block.type === "checklist"
        ) {
            const checkbox =
                blockElement.querySelector(
                    ":scope > .editor-block__body > .block-content-row > .checklist-checkbox"
                );

            if (
                checkbox instanceof
                HTMLInputElement
            ) {
                location.block.checked =
                    checkbox.checked;
            }
        }
    }

    /**
     * Normalizes text read from a contenteditable element.
     *
     * @param {string} value
     * @returns {string}
     */
    function normalizeEditableText(value) {
        return String(value || "")
            .replace(/\r\n?/g, "\n")
            .replace(/\u00a0/g, " ");
    }

    // =========================================================================
    // Selection helpers
    // =========================================================================

    /**
     * Returns an editable content element from an event target.
     *
     * @param {*} target
     * @returns {HTMLElement|null}
     */
    function getContentElement(target) {
        if (!(target instanceof Element)) {
            return null;
        }

        const content =
            target.closest(
                ".block-content[contenteditable='true']"
            );

        return content instanceof HTMLElement
            ? content
            : null;
    }

    /**
     * Returns the parent block element.
     *
     * @param {*} target
     * @returns {HTMLElement|null}
     */
    function getBlockElement(target) {
        if (!(target instanceof Element)) {
            return null;
        }

        const block =
            target.closest(".editor-block");

        return block instanceof HTMLElement
            ? block
            : null;
    }

    /**
     * Returns a rendered block by identifier.
     *
     * @param {string} blockId
     * @returns {HTMLElement|null}
     */
    function getBlockElementById(blockId) {
        const blockElements =
            elements.editorRoot.querySelectorAll(
                ".editor-block[data-block-id]"
            );

        for (const blockElement of blockElements) {
            if (
                blockElement.dataset.blockId ===
                blockId
            ) {
                return blockElement;
            }
        }

        return null;
    }

    /**
     * Focuses a block and positions its caret.
     *
     * @param {string} blockId
     * @param {number} [offset]
     */
    function focusBlock(blockId, offset) {
        const blockElement =
            getBlockElementById(blockId);

        if (!blockElement) {
            return;
        }

        const contentElement =
            blockElement.querySelector(
                ":scope > .editor-block__body > .block-content-row > .block-content"
            );

        if (
            !(contentElement instanceof HTMLElement)
        ) {
            const nextEditable =
                getNextEditableBlockElement(
                    blockElement
                );

            if (nextEditable) {
                nextEditable.focus();
                setCaretOffset(nextEditable, 0);
            }

            return;
        }

        contentElement.focus();

        const resolvedOffset =
            Number.isFinite(offset)
                ? offset
                : getTextLength(
                    contentElement
                );

        setCaretOffset(
            contentElement,
            resolvedOffset
        );

        activeBlockId = blockId;
    }

    /**
     * Focuses the first editable block.
     */
    function focusFirstBlock() {
        requireInitialization();

        const firstContent =
            elements.editorRoot.querySelector(
                ".block-content[contenteditable='true']"
            );

        if (
            firstContent instanceof HTMLElement
        ) {
            firstContent.focus();
            setCaretOffset(firstContent, 0);
        }
    }

    /**
     * Returns the next editable element after a block.
     *
     * @param {HTMLElement} blockElement
     * @returns {HTMLElement|null}
     */
    function getNextEditableBlockElement(
        blockElement
    ) {
        const editableElements = [
            ...elements.editorRoot.querySelectorAll(
                ".block-content[contenteditable='true']"
            )
        ];

        const blockRect =
            blockElement.getBoundingClientRect();

        return (
            editableElements.find(element => {
                const rect =
                    element.getBoundingClientRect();

                return rect.top >= blockRect.bottom;
            }) || null
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

        const activeRange =
            selection.getRangeAt(0);

        if (
            !element.contains(
                activeRange.startContainer
            )
        ) {
            return 0;
        }

        const range =
            document.createRange();

        range.selectNodeContents(element);

        range.setEnd(
            activeRange.startContainer,
            activeRange.startOffset
        );

        return range.toString().length;
    }

    /**
     * Positions the caret at a character offset.
     *
     * @param {HTMLElement} element
     * @param {number} requestedOffset
     */
    function setCaretOffset(
        element,
        requestedOffset
    ) {
        const targetOffset =
            Math.max(
                0,
                Math.min(
                    requestedOffset,
                    getTextLength(element)
                )
            );

        const walker =
            document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT
            );

        let remaining =
            targetOffset;

        let textNode =
            walker.nextNode();

        while (textNode) {
            const length =
                textNode.textContent.length;

            if (remaining <= length) {
                const range =
                    document.createRange();

                range.setStart(
                    textNode,
                    remaining
                );

                range.collapse(true);

                const selection =
                    window.getSelection();

                selection.removeAllRanges();
                selection.addRange(range);

                return;
            }

            remaining -= length;
            textNode = walker.nextNode();
        }

        const range =
            document.createRange();

        range.selectNodeContents(element);
        range.collapse(false);

        const selection =
            window.getSelection();

        selection.removeAllRanges();
        selection.addRange(range);
    }

    /**
     * Returns the plain-text length of an element.
     *
     * @param {HTMLElement} element
     * @returns {number}
     */
    function getTextLength(element) {
        return (
            element.textContent || ""
        ).length;
    }

    /**
     * Returns the current caret rectangle.
     *
     * @returns {DOMRect|null}
     */
    function getCaretRect() {
        const selection =
            window.getSelection();

        if (
            !selection ||
            selection.rangeCount === 0
        ) {
            return null;
        }

        const range =
            selection
                .getRangeAt(0)
                .cloneRange();

        range.collapse(true);

        const rects =
            range.getClientRects();

        if (rects.length > 0) {
            return rects[0];
        }

        return range.getBoundingClientRect();
    }

    /**
     * Inserts plain text at the current selection.
     *
     * @param {string} text
     */
    function insertPlainTextAtSelection(text) {
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
    }

    // =========================================================================
    // Global interactions
    // =========================================================================

    /**
     * Closes menus after an outside pointer press.
     *
     * @param {PointerEvent} event
     */
    function handleDocumentPointerDown(event) {
        if (!(event.target instanceof Node)) {
            return;
        }

        const clickedInsideBlockMenu =
            elements.blockMenu &&
            elements.blockMenu.contains(
                event.target
            );

        const clickedInsideTypeMenu =
            elements.blockTypeMenu &&
            elements.blockTypeMenu.contains(
                event.target
            );

        const clickedInsideSlashMenu =
            elements.slashMenu &&
            elements.slashMenu.contains(
                event.target
            );

        const clickedBlockHandle =
            event.target instanceof Element &&
            event.target.closest(
                "[data-action='open-block-menu']"
            );

        if (
            !clickedInsideBlockMenu &&
            !clickedInsideTypeMenu &&
            !clickedInsideSlashMenu &&
            !clickedBlockHandle
        ) {
            closeBlockMenu();
            closeBlockTypeMenu();
            activeMenuBlockId = null;
        }

        if (
            !clickedInsideSlashMenu &&
            !elements.editorRoot.contains(
                event.target
            )
        ) {
            closeSlashMenu();
        }
    }

    /**
     * Handles document-level escape behavior.
     *
     * @param {KeyboardEvent} event
     */
    function handleDocumentKeyDown(event) {
        if (event.key === "Escape") {
            closeAllMenus();
        }
    }

    /**
     * Repositions or closes menus after resizing.
     */
    function handleWindowResize() {
        closeBlockMenu();
        closeBlockTypeMenu();

        if (isSlashMenuOpen()) {
            positionSlashMenu();
        }
    }

    /**
     * Closes floating block menus while scrolling.
     */
    function handleWindowScroll() {
        closeBlockMenu();
        closeBlockTypeMenu();

        if (isSlashMenuOpen()) {
            positionSlashMenu();
        }
    }

    // =========================================================================
    // Change notifications
    // =========================================================================

    /**
     * Notifies the application about document changes.
     *
     * @param {string} reason
     */
    function notifyChange(reason) {
        if (
            isRendering ||
            !changeHandler
        ) {
            return;
        }

        changeHandler(
            getDocument(),
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
        getDocument,
        setDocument,

        addBlock,
        focusFirstBlock,

        focusBlock,
        changeBlockType,
        duplicateBlock,
        deleteBlock,

        indentBlockById(blockId) {
            const blockElement =
                getBlockElementById(blockId);

            if (blockElement) {
                indentBlock(blockElement);
            }
        },

        outdentBlockById(blockId) {
            const blockElement =
                getBlockElementById(blockId);

            if (blockElement) {
                outdentBlock(blockElement);
            }
        }
    });
})();
