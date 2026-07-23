/**
 * Note-U
 * Version: 0.3.0
 *
 * URL-based document storage.
 *
 * Responsibilities:
 * - create and normalize documents;
 * - migrate older documents to version 3;
 * - normalize recursive blocks;
 * - normalize inline rich-text content;
 * - encode and decode documents using Base64URL;
 * - read and write notes in the current URL;
 * - preserve compatibility with legacy URL formats.
 */

(function () {
    "use strict";

    // =========================================================================
    // Constants
    // =========================================================================

    const DOCUMENT_VERSION = 3;

    const DEFAULT_TITLE = "Note";
    const DEFAULT_ICON = "📝";
    const DEFAULT_BLOCK_TYPE = "paragraph";

    const URL_PARAMETER_NAME = "note";

    const SUPPORTED_BLOCK_TYPES = Object.freeze([
        "paragraph",
        "heading-1",
        "heading-2",
        "bullet-list",
        "numbered-list",
        "checklist",
        "quote",
        "divider",
        "code",
        "toggle"
    ]);

    const SUPPORTED_INLINE_MARKS = Object.freeze([
        "bold",
        "italic",
        "strikethrough",
        "highlight",
        "code"
    ]);

    const SUPPORTED_TOGGLE_TITLE_STYLES = Object.freeze([
        "paragraph",
        "heading-1",
        "heading-2"
    ]);

    const DEFAULT_TOGGLE_TITLE_STYLE = "paragraph";

    // =========================================================================
    // Identifiers
    // =========================================================================

    /**
     * Creates a unique identifier.
     *
     * @returns {string}
     */
    function createId() {
        if (
            window.crypto &&
            typeof window.crypto.randomUUID === "function"
        ) {
            return window.crypto.randomUUID();
        }

        return [
            "block",
            Date.now().toString(36),
            Math.random().toString(36).slice(2, 10)
        ].join("-");
    }

    // =========================================================================
    // Rich-text content
    // =========================================================================

    /**
     * Creates a plain rich-text segment.
     *
     * @param {string} [text]
     * @returns {Object}
     */
    function createTextSegment(text = "") {
        return {
            text: String(text)
        };
    }

    /**
     * Creates normalized rich-text content.
     *
     * @param {*} value
     * @returns {Array<Object>}
     */
    function normalizeRichText(value) {
        /*
         * Version 1 and version 2 notes stored block content as a string.
         */
        if (typeof value === "string") {
            return [
                createTextSegment(value)
            ];
        }

        if (!Array.isArray(value)) {
            return [
                createTextSegment("")
            ];
        }

        const segments = [];

        for (const item of value) {
            const segment =
                normalizeTextSegment(item);

            if (!segment) {
                continue;
            }

            const previousSegment =
                segments[segments.length - 1];

            if (
                previousSegment &&
                haveEqualMarks(
                    previousSegment.marks,
                    segment.marks
                )
            ) {
                previousSegment.text +=
                    segment.text;

                continue;
            }

            segments.push(segment);
        }

        if (segments.length === 0) {
            return [
                createTextSegment("")
            ];
        }

        return segments;
    }

    /**
     * Normalizes one rich-text segment.
     *
     * @param {*} value
     * @returns {Object|null}
     */
    function normalizeTextSegment(value) {
        if (typeof value === "string") {
            return createTextSegment(value);
        }

        if (
            !value ||
            typeof value !== "object"
        ) {
            return null;
        }

        const segment = {
            text: String(value.text || "")
        };

        const marks =
            normalizeMarks(value.marks);

        if (marks.length > 0) {
            segment.marks = marks;
        }

        return segment;
    }

    /**
     * Normalizes inline formatting marks.
     *
     * @param {*} value
     * @returns {Array<string>}
     */
    function normalizeMarks(value) {
        if (!Array.isArray(value)) {
            return [];
        }

        return [
            ...new Set(
                value.filter(mark =>
                    SUPPORTED_INLINE_MARKS.includes(
                        mark
                    )
                )
            )
        ];
    }

    /**
     * Checks whether two mark collections are equal.
     *
     * @param {*} first
     * @param {*} second
     * @returns {boolean}
     */
    function haveEqualMarks(first, second) {
        const firstMarks =
            normalizeMarks(first);

        const secondMarks =
            normalizeMarks(second);

        if (
            firstMarks.length !==
            secondMarks.length
        ) {
            return false;
        }

        return firstMarks.every(
            mark =>
                secondMarks.includes(mark)
        );
    }

    /**
     * Returns the plain text represented by rich-text content.
     *
     * @param {*} content
     * @returns {string}
     */
    function richTextToPlainText(content) {
        return normalizeRichText(content)
            .map(segment => segment.text)
            .join("");
    }

    /**
     * Returns whether rich-text content is empty.
     *
     * @param {*} content
     * @returns {boolean}
     */
    function isRichTextEmpty(content) {
        return (
            richTextToPlainText(content)
                .trim()
                .length === 0
        );
    }

    // =========================================================================
    // Blocks
    // =========================================================================

    /**
     * Creates a default block.
     *
     * @param {string} [type]
     * @param {string|Array<Object>} [content]
     * @returns {Object}
     */
    function createDefaultBlock(
        type = DEFAULT_BLOCK_TYPE,
        content = ""
    ) {
        const normalizedType =
            normalizeBlockType(type);

        const block = {
            id: createId(),
            type: normalizedType,
            content:
                normalizedType === "divider"
                    ? []
                    : normalizeRichText(content),
            children: []
        };

        applyBlockSpecificDefaults(block);

        return block;
    }

    /**
     * Normalizes a block type.
     *
     * @param {*} value
     * @returns {string}
     */
    function normalizeBlockType(value) {
        return SUPPORTED_BLOCK_TYPES.includes(
            value
        )
            ? value
            : DEFAULT_BLOCK_TYPE;
    }

    /**
     * Normalizes one block recursively.
     *
     * @param {*} value
     * @returns {Object}
     */
    function normalizeBlock(value) {
        const source =
            value &&
            typeof value === "object"
                ? value
                : {};

        const type =
            normalizeLegacyBlockType(
                source.type
            );

        const block = {
            id:
                typeof source.id === "string" &&
                source.id.trim()
                    ? source.id
                    : createId(),

            type,

            content:
                type === "divider"
                    ? []
                    : normalizeRichText(
                        source.content
                    ),

            children: normalizeBlocks(
                source.children
            )
        };

        if (type === "checklist") {
            block.checked =
                Boolean(source.checked);
        }

        if (type === "toggle") {
            block.open =
                source.open !== false;

            block.titleStyle =
                normalizeToggleTitleStyle(
                    source.titleStyle ||
                    source.style
                );
        }

        return block;
    }

    /**
     * Normalizes older or alternate block type names.
     *
     * @param {*} value
     * @returns {string}
     */
    function normalizeLegacyBlockType(value) {
        const aliases = {
            text: "paragraph",
            heading1: "heading-1",
            heading2: "heading-2",
            h1: "heading-1",
            h2: "heading-2",
            bullet: "bullet-list",
            bullets: "bullet-list",
            unordered: "bullet-list",
            numbered: "numbered-list",
            ordered: "numbered-list",
            todo: "checklist",
            checkbox: "checklist",
            blockquote: "quote",
            hr: "divider",
            separator: "divider",
            dropdown: "toggle",
            collapsible: "toggle",
            "code-block": "code"
        };

        if (
            typeof value === "string" &&
            Object.prototype.hasOwnProperty.call(
                aliases,
                value
            )
        ) {
            return aliases[value];
        }

        return normalizeBlockType(value);
    }

    /**
     * Normalizes a block collection.
     *
     * @param {*} value
     * @returns {Array<Object>}
     */
    function normalizeBlocks(value) {
        if (!Array.isArray(value)) {
            return [];
        }

        return value.map(normalizeBlock);
    }

    /**
     * Applies default fields associated with a block type.
     *
     * @param {Object} block
     */
    function applyBlockSpecificDefaults(block) {
        if (block.type === "checklist") {
            block.checked = false;
        }

        if (block.type === "toggle") {
            block.open = true;
            block.titleStyle =
                DEFAULT_TOGGLE_TITLE_STYLE;
        }
    }

    /**
     * Normalizes the title style of a toggle.
     *
     * @param {*} value
     * @returns {string}
     */
    function normalizeToggleTitleStyle(value) {
        return SUPPORTED_TOGGLE_TITLE_STYLES.includes(
            value
        )
            ? value
            : DEFAULT_TOGGLE_TITLE_STYLE;
    }

    /**
     * Checks whether a block contains meaningful content.
     *
     * @param {*} value
     * @returns {boolean}
     */
    function hasMeaningfulBlockContent(value) {
        const block =
            normalizeBlock(value);

        if (block.type === "divider") {
            return true;
        }

        if (
            !isRichTextEmpty(block.content)
        ) {
            return true;
        }

        return block.children.some(
            hasMeaningfulBlockContent
        );
    }

    /**
     * Counts blocks recursively.
     *
     * @param {*} value
     * @returns {number}
     */
    function countBlocks(value) {
        const blocks =
            Array.isArray(value)
                ? value
                : (
                    value &&
                    Array.isArray(value.blocks)
                        ? value.blocks
                        : []
                );

        let count = 0;

        function visit(collection) {
            for (const block of collection) {
                count += 1;

                if (
                    block &&
                    Array.isArray(block.children)
                ) {
                    visit(block.children);
                }
            }
        }

        visit(blocks);

        return count;
    }

    // =========================================================================
    // Documents
    // =========================================================================

    /**
     * Creates a new document.
     *
     * @returns {Object}
     */
    function createDocument() {
        return {
            version: DOCUMENT_VERSION,
            title: DEFAULT_TITLE,
            icon: DEFAULT_ICON,
            blocks: [
                createDefaultBlock()
            ]
        };
    }

    /**
     * Normalizes and migrates a document.
     *
     * @param {*} value
     * @returns {Object}
     */
    function normalizeDocument(value) {
        const source =
            value &&
            typeof value === "object"
                ? value
                : {};

        const documentModel = {
            version: DOCUMENT_VERSION,

            title:
                typeof source.title === "string"
                    ? source.title
                    : DEFAULT_TITLE,

            icon:
                typeof source.icon === "string" &&
                source.icon.trim()
                    ? source.icon
                    : DEFAULT_ICON,

            blocks: normalizeBlocks(
                source.blocks
            )
        };

        /*
         * Support older compact document properties.
         */
        if (
            documentModel.title === DEFAULT_TITLE &&
            typeof source.t === "string"
        ) {
            documentModel.title = source.t;
        }

        if (
            documentModel.icon === DEFAULT_ICON &&
            typeof source.e === "string" &&
            source.e.trim()
        ) {
            documentModel.icon = source.e;
        }

        /*
         * An older monolithic version stored the note body as HTML.
         * We preserve it as plain text instead of injecting arbitrary HTML.
         */
        if (
            documentModel.blocks.length === 0 &&
            typeof source.b === "string"
        ) {
            documentModel.blocks =
                migrateLegacyHtmlBody(source.b);
        }

        if (
            documentModel.blocks.length === 0
        ) {
            documentModel.blocks.push(
                createDefaultBlock()
            );
        }

        return documentModel;
    }

    /**
     * Converts a legacy HTML body into safe paragraph blocks.
     *
     * @param {string} html
     * @returns {Array<Object>}
     */
    function migrateLegacyHtmlBody(html) {
        const container =
            document.createElement("div");

        container.innerHTML =
            String(html || "");

        const text =
            container.innerText
                .replace(/\r\n?/g, "\n");

        const lines =
            text.split("\n");

        const blocks =
            lines.map(line =>
                createDefaultBlock(
                    "paragraph",
                    line
                )
            );

        return blocks.length > 0
            ? blocks
            : [
                createDefaultBlock()
            ];
    }

    /**
     * Creates a safe document clone.
     *
     * @param {*} value
     * @returns {Object}
     */
    function cloneDocument(value) {
        return normalizeDocument(
            JSON.parse(
                JSON.stringify(
                    normalizeDocument(value)
                )
            )
        );
    }

    /**
     * Checks whether a document has meaningful content.
     *
     * @param {*} value
     * @returns {boolean}
     */
    function hasMeaningfulContent(value) {
        const documentModel =
            normalizeDocument(value);

        if (
            documentModel.title.trim() &&
            documentModel.title.trim() !==
                DEFAULT_TITLE
        ) {
            return true;
        }

        if (
            documentModel.icon !==
            DEFAULT_ICON
        ) {
            return true;
        }

        return documentModel.blocks.some(
            hasMeaningfulBlockContent
        );
    }

    // =========================================================================
    // UTF-8 and Base64URL
    // =========================================================================

    /**
     * Encodes UTF-8 text as Base64.
     *
     * @param {string} value
     * @returns {string}
     */
    function encodeBase64(value) {
        const bytes =
            new TextEncoder().encode(value);

        let binary = "";

        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }

        return window.btoa(binary);
    }

    /**
     * Decodes Base64 into UTF-8 text.
     *
     * @param {string} value
     * @returns {string}
     */
    function decodeBase64(value) {
        const binary =
            window.atob(value);

        const bytes =
            Uint8Array.from(
                binary,
                character =>
                    character.charCodeAt(0)
            );

        return new TextDecoder().decode(bytes);
    }

    /**
     * Converts Base64 into URL-safe Base64.
     *
     * @param {string} value
     * @returns {string}
     */
    function toBase64Url(value) {
        return value
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/g, "");
    }

    /**
     * Converts URL-safe Base64 into standard Base64.
     *
     * @param {string} value
     * @returns {string}
     */
    function fromBase64Url(value) {
        const normalized =
            value
                .replace(/-/g, "+")
                .replace(/_/g, "/");

        const paddingLength =
            (
                4 -
                normalized.length % 4
            ) % 4;

        return (
            normalized +
            "=".repeat(paddingLength)
        );
    }

    // =========================================================================
    // Encoding and decoding
    // =========================================================================

    /**
     * Encodes a document into a URL-safe payload.
     *
     * @param {*} value
     * @returns {string}
     */
    function encodeDocument(value) {
        const documentModel =
            normalizeDocument(value);

        const json =
            JSON.stringify(documentModel);

        return toBase64Url(
            encodeBase64(json)
        );
    }

    /**
     * Decodes a URL-safe document payload.
     *
     * @param {string} encodedValue
     * @returns {Object}
     */
    function decodeDocument(encodedValue) {
        if (
            typeof encodedValue !== "string" ||
            !encodedValue.trim()
        ) {
            throw new Error(
                "The note payload is empty."
            );
        }

        const base64 =
            fromBase64Url(
                encodedValue.trim()
            );

        const json =
            decodeBase64(base64);

        const parsed =
            JSON.parse(json);

        return normalizeDocument(parsed);
    }

    // =========================================================================
    // URL handling
    // =========================================================================

    /**
     * Reads an encoded note from the current URL.
     *
     * @returns {string|null}
     */
    function getEncodedDocumentFromUrl() {
        const url =
            new URL(window.location.href);

        const queryValue =
            url.searchParams.get(
                URL_PARAMETER_NAME
            );

        if (queryValue) {
            return queryValue;
        }

        /*
         * Compatibility with older hash-based links.
         */
        const hashValue =
            url.hash.replace(/^#/, "");

        return hashValue || null;
    }

    /**
     * Loads a document from the current URL.
     *
     * @returns {Object}
     */
    function loadDocumentFromUrl() {
        const encodedValue =
            getEncodedDocumentFromUrl();

        if (!encodedValue) {
            return createDocument();
        }

        try {
            return decodeDocument(
                encodedValue
            );
        } catch (modernError) {
            try {
                return decodeLegacyHash(
                    encodedValue
                );
            } catch (legacyError) {
                throw new Error(
                    "The note link is invalid or damaged."
                );
            }
        }
    }

    /**
     * Attempts to decode an older Base64 or URI-encoded hash.
     *
     * @param {string} value
     * @returns {Object}
     */
    function decodeLegacyHash(value) {
        let decodedValue;

        try {
            decodedValue =
                decodeURIComponent(value);
        } catch (error) {
            decodedValue = value;
        }

        try {
            const json =
                decodeURIComponent(
                    escape(
                        window.atob(
                            decodedValue
                        )
                    )
                );

            return normalizeDocument(
                JSON.parse(json)
            );
        } catch (error) {
            const plainText =
                decodeURIComponent(
                    decodedValue
                );

            return normalizeDocument({
                title: DEFAULT_TITLE,
                icon: DEFAULT_ICON,
                blocks: [
                    createDefaultBlock(
                        "paragraph",
                        plainText
                    )
                ]
            });
        }
    }

    /**
     * Creates a URL containing a document.
     *
     * @param {*} value
     * @param {string} [baseUrl]
     * @returns {string}
     */
    function createDocumentUrl(
        value,
        baseUrl = window.location.href
    ) {
        const url =
            new URL(baseUrl);

        url.searchParams.set(
            URL_PARAMETER_NAME,
            encodeDocument(value)
        );

        url.hash = "";

        return url.toString();
    }

    /**
     * Writes a document into the browser URL.
     *
     * @param {*} value
     * @param {Object} [options]
     * @param {boolean} [options.pushHistory]
     * @returns {string}
     */
    function writeDocumentToUrl(
        value,
        options = {}
    ) {
        const documentModel =
            normalizeDocument(value);

        const nextUrl =
            createDocumentUrl(
                documentModel
            );

        const historyMethod =
            options.pushHistory
                ? "pushState"
                : "replaceState";

        window.history[historyMethod](
            {
                noteVersion:
                    DOCUMENT_VERSION
            },
            "",
            nextUrl
        );

        return nextUrl;
    }

    /**
     * Removes note data from the current URL.
     *
     * @param {Object} [options]
     * @param {boolean} [options.pushHistory]
     * @returns {string}
     */
    function clearDocumentFromUrl(
        options = {}
    ) {
        const url =
            new URL(window.location.href);

        url.searchParams.delete(
            URL_PARAMETER_NAME
        );

        url.hash = "";

        const historyMethod =
            options.pushHistory
                ? "pushState"
                : "replaceState";

        window.history[historyMethod](
            null,
            "",
            url.toString()
        );

        return url.toString();
    }

    /**
     * Checks whether the current URL contains note data.
     *
     * @returns {boolean}
     */
    function hasDocumentInUrl() {
        return Boolean(
            getEncodedDocumentFromUrl()
        );
    }

    // =========================================================================
    // Public API
    // =========================================================================

    window.NoteUStorage = Object.freeze({
        DOCUMENT_VERSION,
        DEFAULT_TITLE,
        DEFAULT_ICON,
        DEFAULT_BLOCK_TYPE,
        DEFAULT_TOGGLE_TITLE_STYLE,
        URL_PARAMETER_NAME,

        SUPPORTED_BLOCK_TYPES,
        SUPPORTED_INLINE_MARKS,
        SUPPORTED_TOGGLE_TITLE_STYLES,

        createId,

        createTextSegment,
        normalizeRichText,
        normalizeMarks,
        richTextToPlainText,
        isRichTextEmpty,

        createDefaultBlock,
        normalizeBlock,
        normalizeBlocks,

        createDocument,
        normalizeDocument,
        cloneDocument,

        encodeDocument,
        decodeDocument,

        loadDocumentFromUrl,
        createDocumentUrl,
        writeDocumentToUrl,
        clearDocumentFromUrl,
        hasDocumentInUrl,

        countBlocks,
        hasMeaningfulContent
    });
})();
