/**
 * Note-U
 * Version: 0.2.0
 *
 * URL-based document storage.
 *
 * This module is responsible for:
 * - creating valid document models;
 * - normalizing untrusted document data;
 * - preserving nested block structures;
 * - encoding documents into the URL;
 * - decoding documents from the URL;
 * - cloning document models safely;
 * - generating unique block identifiers;
 * - handling invalid or unsupported stored data.
 *
 * No document content is stored in local storage, cookies or a server.
 */

(function () {
    "use strict";

    // =========================================================================
    // Constants
    // =========================================================================

    const DOCUMENT_VERSION = 1;

    const DEFAULT_TITLE = "Note";
    const DEFAULT_ICON = "📝";
    const DEFAULT_BLOCK_TYPE = "paragraph";

    const URL_PARAMETER_NAME = "note";

    const MAX_TITLE_LENGTH = 180;
    const MAX_ICON_LENGTH = 16;
    const MAX_BLOCK_CONTENT_LENGTH = 100000;
    const MAX_BLOCK_DEPTH = 20;
    const MAX_BLOCK_COUNT = 5000;

    const SUPPORTED_BLOCK_TYPES = Object.freeze([
        "paragraph",
        "heading-1",
        "heading-2",
        "bullet-list",
        "numbered-list",
        "checklist",
        "quote",
        "divider"
    ]);

    // =========================================================================
    // Identifier generation
    // =========================================================================

    /**
     * Creates a unique identifier suitable for document blocks.
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

        const timestamp =
            Date.now().toString(36);

        const randomPart =
            Math.random()
                .toString(36)
                .slice(2, 12);

        return `block-${timestamp}-${randomPart}`;
    }

    // =========================================================================
    // Default models
    // =========================================================================

    /**
     * Creates a new paragraph block.
     *
     * @returns {Object}
     */
    function createDefaultBlock() {
        return {
            id: createId(),
            type: DEFAULT_BLOCK_TYPE,
            content: "",
            children: []
        };
    }

    /**
     * Creates a new empty document.
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

    // =========================================================================
    // Document normalization
    // =========================================================================

    /**
     * Converts unknown input into a valid document model.
     *
     * @param {*} value
     * @returns {Object}
     */
    function normalizeDocument(value) {
        if (!isPlainObject(value)) {
            return createDocument();
        }

        const normalizationState = {
            blockCount: 0,
            usedIds: new Set()
        };

        const blocks =
            normalizeBlockCollection(
                value.blocks,
                0,
                normalizationState
            );

        return {
            version: DOCUMENT_VERSION,

            title: normalizeTitle(value.title),

            icon: normalizeIcon(value.icon),

            blocks:
                blocks.length > 0
                    ? blocks
                    : [createDefaultBlock()]
        };
    }

    /**
     * Normalizes a collection of blocks.
     *
     * @param {*} value
     * @param {number} depth
     * @param {Object} state
     * @param {number} state.blockCount
     * @param {Set<string>} state.usedIds
     * @returns {Array<Object>}
     */
    function normalizeBlockCollection(
        value,
        depth,
        state
    ) {
        if (
            !Array.isArray(value) ||
            depth > MAX_BLOCK_DEPTH ||
            state.blockCount >= MAX_BLOCK_COUNT
        ) {
            return [];
        }

        const normalizedBlocks = [];

        for (const item of value) {
            if (state.blockCount >= MAX_BLOCK_COUNT) {
                break;
            }

            const block =
                normalizeBlock(
                    item,
                    depth,
                    state
                );

            if (block) {
                normalizedBlocks.push(block);
            }
        }

        return normalizedBlocks;
    }

    /**
     * Normalizes one block and its descendants.
     *
     * @param {*} value
     * @param {number} depth
     * @param {Object} state
     * @returns {Object|null}
     */
    function normalizeBlock(
        value,
        depth,
        state
    ) {
        if (
            !isPlainObject(value) ||
            depth > MAX_BLOCK_DEPTH ||
            state.blockCount >= MAX_BLOCK_COUNT
        ) {
            return null;
        }

        state.blockCount += 1;

        const type =
            normalizeBlockType(value.type);

        const block = {
            id: normalizeBlockId(
                value.id,
                state.usedIds
            ),

            type,

            content:
                type === "divider"
                    ? ""
                    : normalizeBlockContent(
                        value.content
                    ),

            children:
                normalizeBlockCollection(
                    value.children,
                    depth + 1,
                    state
                )
        };

        if (type === "checklist") {
            block.checked =
                Boolean(value.checked);
        }

        return block;
    }

    /**
     * Normalizes the document title.
     *
     * @param {*} value
     * @returns {string}
     */
    function normalizeTitle(value) {
        if (typeof value !== "string") {
            return DEFAULT_TITLE;
        }

        return value.slice(
            0,
            MAX_TITLE_LENGTH
        );
    }

    /**
     * Normalizes the document icon.
     *
     * @param {*} value
     * @returns {string}
     */
    function normalizeIcon(value) {
        if (typeof value !== "string") {
            return DEFAULT_ICON;
        }

        const trimmedValue = value.trim();

        if (!trimmedValue) {
            return DEFAULT_ICON;
        }

        return Array.from(trimmedValue)
            .slice(0, MAX_ICON_LENGTH)
            .join("");
    }

    /**
     * Normalizes a block identifier.
     *
     * Duplicate or invalid identifiers are replaced.
     *
     * @param {*} value
     * @param {Set<string>} usedIds
     * @returns {string}
     */
    function normalizeBlockId(
        value,
        usedIds
    ) {
        let id =
            typeof value === "string"
                ? value.trim()
                : "";

        if (
            !id ||
            id.length > 160 ||
            usedIds.has(id)
        ) {
            do {
                id = createId();
            } while (usedIds.has(id));
        }

        usedIds.add(id);

        return id;
    }

    /**
     * Normalizes a block type.
     *
     * @param {*} value
     * @returns {string}
     */
    function normalizeBlockType(value) {
        return SUPPORTED_BLOCK_TYPES.includes(value)
            ? value
            : DEFAULT_BLOCK_TYPE;
    }

    /**
     * Normalizes block text content.
     *
     * @param {*} value
     * @returns {string}
     */
    function normalizeBlockContent(value) {
        if (typeof value !== "string") {
            return "";
        }

        return value
            .replace(/\r\n?/g, "\n")
            .slice(0, MAX_BLOCK_CONTENT_LENGTH);
    }

    // =========================================================================
    // Cloning
    // =========================================================================

    /**
     * Creates a safe deep clone of a document model.
     *
     * The returned value is also normalized.
     *
     * @param {*} documentModel
     * @returns {Object}
     */
    function cloneDocument(documentModel) {
        return normalizeDocument(
            deepClone(documentModel)
        );
    }

    /**
     * Creates a deep clone of JSON-compatible data.
     *
     * @param {*} value
     * @returns {*}
     */
    function deepClone(value) {
        if (
            typeof structuredClone === "function"
        ) {
            try {
                return structuredClone(value);
            } catch (error) {
                console.warn(
                    "Note-U could not clone data with structuredClone.",
                    error
                );
            }
        }

        try {
            return JSON.parse(
                JSON.stringify(value)
            );
        } catch (error) {
            console.warn(
                "Note-U could not clone the document model.",
                error
            );

            return null;
        }
    }

    // =========================================================================
    // URL encoding
    // =========================================================================

    /**
     * Encodes a document into a compact URL-safe string.
     *
     * @param {*} documentModel
     * @returns {string}
     */
    function encodeDocument(documentModel) {
        const normalizedDocument =
            normalizeDocument(documentModel);

        const json =
            JSON.stringify(normalizedDocument);

        const bytes =
            new TextEncoder().encode(json);

        return bytesToBase64Url(bytes);
    }

    /**
     * Decodes a URL-safe document string.
     *
     * @param {*} encodedValue
     * @returns {Object|null}
     */
    function decodeDocument(encodedValue) {
        if (
            typeof encodedValue !== "string" ||
            encodedValue.length === 0
        ) {
            return null;
        }

        try {
            const bytes =
                base64UrlToBytes(encodedValue);

            const json =
                new TextDecoder(
                    "utf-8",
                    {
                        fatal: true
                    }
                ).decode(bytes);

            const parsedValue =
                JSON.parse(json);

            return normalizeDocument(parsedValue);
        } catch (error) {
            console.warn(
                "Note-U could not decode the document from the URL.",
                error
            );

            return null;
        }
    }

    /**
     * Converts bytes into URL-safe Base64.
     *
     * @param {Uint8Array} bytes
     * @returns {string}
     */
    function bytesToBase64Url(bytes) {
        let binary = "";

        const chunkSize = 0x8000;

        for (
            let offset = 0;
            offset < bytes.length;
            offset += chunkSize
        ) {
            const chunk =
                bytes.subarray(
                    offset,
                    offset + chunkSize
                );

            binary += String.fromCharCode(
                ...chunk
            );
        }

        return window
            .btoa(binary)
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/g, "");
    }

    /**
     * Converts URL-safe Base64 into bytes.
     *
     * @param {string} value
     * @returns {Uint8Array}
     */
    function base64UrlToBytes(value) {
        const normalizedValue =
            value
                .replace(/-/g, "+")
                .replace(/_/g, "/");

        const paddingLength =
            (
                4 -
                (
                    normalizedValue.length %
                    4
                )
            ) % 4;

        const paddedValue =
            normalizedValue +
            "=".repeat(paddingLength);

        const binary =
            window.atob(paddedValue);

        const bytes =
            new Uint8Array(binary.length);

        for (
            let index = 0;
            index < binary.length;
            index += 1
        ) {
            bytes[index] =
                binary.charCodeAt(index);
        }

        return bytes;
    }

    // =========================================================================
    // URL operations
    // =========================================================================

    /**
     * Loads a document from a URL.
     *
     * A new empty document is returned when no stored document exists.
     *
     * @param {string|URL} [urlValue]
     * @returns {Object}
     */
    function loadDocumentFromUrl(
        urlValue = window.location.href
    ) {
        const url =
            createUrl(urlValue);

        const encodedDocument =
            getEncodedDocumentFromUrl(url);

        if (!encodedDocument) {
            return createDocument();
        }

        return (
            decodeDocument(encodedDocument) ||
            createDocument()
        );
    }

    /**
     * Returns the encoded document payload from a URL.
     *
     * Query-string storage is checked first.
     * Hash-based legacy storage is supported as a fallback.
     *
     * @param {URL} url
     * @returns {string}
     */
    function getEncodedDocumentFromUrl(url) {
        const queryValue =
            url.searchParams.get(
                URL_PARAMETER_NAME
            );

        if (queryValue) {
            return queryValue;
        }

        const hashValue =
            url.hash.startsWith("#")
                ? url.hash.slice(1)
                : url.hash;

        if (!hashValue) {
            return "";
        }

        if (
            hashValue.startsWith(
                `${URL_PARAMETER_NAME}=`
            )
        ) {
            const hashParameters =
                new URLSearchParams(hashValue);

            return (
                hashParameters.get(
                    URL_PARAMETER_NAME
                ) || ""
            );
        }

        return hashValue;
    }

    /**
     * Builds a URL containing a document.
     *
     * @param {*} documentModel
     * @param {Object} [options]
     * @param {string|URL} [options.baseUrl]
     * @returns {string}
     */
    function createDocumentUrl(
        documentModel,
        options = {}
    ) {
        const url =
            createUrl(
                options.baseUrl ||
                window.location.href
            );

        const encodedDocument =
            encodeDocument(documentModel);

        url.searchParams.set(
            URL_PARAMETER_NAME,
            encodedDocument
        );

        url.hash = "";

        return url.toString();
    }

    /**
     * Writes a document into the current browser URL.
     *
     * This does not reload the page.
     *
     * @param {*} documentModel
     * @param {Object} [options]
     * @param {boolean} [options.replace]
     * @returns {string}
     */
    function writeDocumentToUrl(
        documentModel,
        options = {}
    ) {
        const url =
            createDocumentUrl(
                documentModel,
                {
                    baseUrl:
                        window.location.href
                }
            );

        const historyMethod =
            options.replace === false
                ? "pushState"
                : "replaceState";

        window.history[historyMethod](
            {
                noteU: true
            },
            "",
            url
        );

        return url;
    }

    /**
     * Removes stored document data from the current URL.
     *
     * @param {Object} [options]
     * @param {boolean} [options.replace]
     * @returns {string}
     */
    function clearDocumentFromUrl(
        options = {}
    ) {
        const url =
            createUrl(window.location.href);

        url.searchParams.delete(
            URL_PARAMETER_NAME
        );

        url.hash = "";

        const historyMethod =
            options.replace === false
                ? "pushState"
                : "replaceState";

        window.history[historyMethod](
            {
                noteU: true
            },
            "",
            url.toString()
        );

        return url.toString();
    }

    /**
     * Checks whether a URL contains document data.
     *
     * @param {string|URL} [urlValue]
     * @returns {boolean}
     */
    function hasDocumentInUrl(
        urlValue = window.location.href
    ) {
        const url =
            createUrl(urlValue);

        return Boolean(
            getEncodedDocumentFromUrl(url)
        );
    }

    /**
     * Creates a URL instance safely.
     *
     * @param {string|URL} value
     * @returns {URL}
     */
    function createUrl(value) {
        if (value instanceof URL) {
            return new URL(value.toString());
        }

        return new URL(
            String(value),
            window.location.href
        );
    }

    // =========================================================================
    // Document inspection
    // =========================================================================

    /**
     * Returns the total number of blocks in a document.
     *
     * Nested blocks are included.
     *
     * @param {*} documentModel
     * @returns {number}
     */
    function countBlocks(documentModel) {
        const normalizedDocument =
            normalizeDocument(documentModel);

        let count = 0;

        function visit(blocks) {
            for (const block of blocks) {
                count += 1;
                visit(block.children);
            }
        }

        visit(normalizedDocument.blocks);

        return count;
    }

    /**
     * Checks whether a document contains meaningful user content.
     *
     * @param {*} documentModel
     * @returns {boolean}
     */
    function hasMeaningfulContent(documentModel) {
        const documentValue =
            normalizeDocument(documentModel);

        if (
            documentValue.title.trim() !==
            DEFAULT_TITLE
        ) {
            return true;
        }

        if (
            documentValue.icon !==
            DEFAULT_ICON
        ) {
            return true;
        }

        return documentValue.blocks.some(
            hasMeaningfulBlockContent
        );
    }

    /**
     * Checks one block and its descendants for meaningful content.
     *
     * @param {Object} block
     * @returns {boolean}
     */
    function hasMeaningfulBlockContent(block) {
        if (block.type === "divider") {
            return true;
        }

        if (
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

        return block.children.some(
            hasMeaningfulBlockContent
        );
    }

    // =========================================================================
    // Validation helpers
    // =========================================================================

    /**
     * Checks whether a value is a plain object.
     *
     * @param {*} value
     * @returns {boolean}
     */
    function isPlainObject(value) {
        if (
            value === null ||
            typeof value !== "object"
        ) {
            return false;
        }

        const prototype =
            Object.getPrototypeOf(value);

        return (
            prototype === Object.prototype ||
            prototype === null
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
        URL_PARAMETER_NAME,
        SUPPORTED_BLOCK_TYPES,

        createId,
        createDocument,
        createDefaultBlock,

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
