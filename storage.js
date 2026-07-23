/**
 * Note-U
 * Version: 0.1.0
 *
 * URL-based document persistence.
 *
 * This module is responsible for:
 * - creating the default document;
 * - validating and normalizing document data;
 * - serializing the document;
 * - encoding it inside the URL hash;
 * - loading it back from the current URL.
 *
 * Note-U does not use:
 * - localStorage;
 * - cookies;
 * - a backend;
 * - a database.
 */

(function () {
    "use strict";

    // =========================================================================
    // Constants
    // =========================================================================

    const STORAGE_VERSION = 1;
    const HASH_PREFIX = "#note=";

    const DEFAULT_TITLE = "Note";
    const DEFAULT_ICON = "📝";
    const DEFAULT_BLOCK_TYPE = "paragraph";

    const MAX_TITLE_LENGTH = 180;
    const MAX_ICON_LENGTH = 16;
    const MAX_BLOCK_CONTENT_LENGTH = 100000;
    const MAX_BLOCK_DEPTH = 50;
    const MAX_BLOCKS = 5000;

    // =========================================================================
    // Default document
    // =========================================================================

    /**
     * Creates a new empty Note-U document.
     *
     * @returns {Object}
     */
    function createDefaultDocument() {
        return {
            version: STORAGE_VERSION,
            title: DEFAULT_TITLE,
            icon: DEFAULT_ICON,
            blocks: [
                createDefaultBlock()
            ]
        };
    }

    /**
     * Creates a new paragraph block.
     *
     * @returns {Object}
     */
    function createDefaultBlock() {
        return {
            id: createId("block"),
            type: DEFAULT_BLOCK_TYPE,
            content: "",
            children: []
        };
    }

    // =========================================================================
    // Identifiers
    // =========================================================================

    /**
     * Creates a unique identifier.
     *
     * @param {string} prefix
     * @returns {string}
     */
    function createId(prefix = "item") {
        if (
            typeof crypto !== "undefined" &&
            typeof crypto.randomUUID === "function"
        ) {
            return `${prefix}-${crypto.randomUUID()}`;
        }

        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).slice(2, 12);

        return `${prefix}-${timestamp}-${randomPart}`;
    }

    // =========================================================================
    // Type guards
    // =========================================================================

    /**
     * Checks whether a value is a plain object.
     *
     * @param {*} value
     * @returns {boolean}
     */
    function isPlainObject(value) {
        return (
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value)
        );
    }

    /**
     * Checks whether a value is a non-empty string.
     *
     * @param {*} value
     * @returns {boolean}
     */
    function isNonEmptyString(value) {
        return (
            typeof value === "string" &&
            value.trim().length > 0
        );
    }

    // =========================================================================
    // String normalization
    // =========================================================================

    /**
     * Normalizes a string value.
     *
     * @param {*} value
     * @param {string} fallback
     * @param {number} maximumLength
     * @returns {string}
     */
    function normalizeString(
        value,
        fallback = "",
        maximumLength = Number.MAX_SAFE_INTEGER
    ) {
        if (typeof value !== "string") {
            return fallback;
        }

        return value.slice(0, maximumLength);
    }

    /**
     * Normalizes the document title.
     *
     * @param {*} value
     * @returns {string}
     */
    function normalizeTitle(value) {
        return normalizeString(
            value,
            DEFAULT_TITLE,
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
        const normalizedIcon = normalizeString(
            value,
            DEFAULT_ICON,
            MAX_ICON_LENGTH
        );

        return normalizedIcon || DEFAULT_ICON;
    }

    // =========================================================================
    // Block normalization
    // =========================================================================

    /**
     * Normalizes a single block.
     *
     * @param {*} blockData
     * @param {number} depth
     * @param {Object} counter
     * @returns {Object}
     */
    function normalizeBlock(blockData, depth, counter) {
        const source = isPlainObject(blockData)
            ? blockData
            : {};

        counter.value += 1;

        const block = {
            id: isNonEmptyString(source.id)
                ? source.id
                : createId("block"),

            type: isNonEmptyString(source.type)
                ? source.type
                : DEFAULT_BLOCK_TYPE,

            content: normalizeString(
                source.content,
                "",
                MAX_BLOCK_CONTENT_LENGTH
            ),

            children: []
        };

        if (
            depth >= MAX_BLOCK_DEPTH ||
            counter.value >= MAX_BLOCKS ||
            !Array.isArray(source.children)
        ) {
            return block;
        }

        for (const childData of source.children) {
            if (counter.value >= MAX_BLOCKS) {
                break;
            }

            block.children.push(
                normalizeBlock(
                    childData,
                    depth + 1,
                    counter
                )
            );
        }

        return block;
    }

    /**
     * Normalizes all root blocks.
     *
     * @param {*} blocksData
     * @returns {Array<Object>}
     */
    function normalizeBlocks(blocksData) {
        if (!Array.isArray(blocksData)) {
            return [createDefaultBlock()];
        }

        const counter = {
            value: 0
        };

        const blocks = [];

        for (const blockData of blocksData) {
            if (counter.value >= MAX_BLOCKS) {
                break;
            }

            blocks.push(
                normalizeBlock(
                    blockData,
                    0,
                    counter
                )
            );
        }

        if (blocks.length === 0) {
            blocks.push(createDefaultBlock());
        }

        return blocks;
    }

    // =========================================================================
    // Document normalization
    // =========================================================================

    /**
     * Normalizes a complete document.
     *
     * The returned value always follows the current document schema.
     *
     * @param {*} documentData
     * @returns {Object}
     */
    function normalizeDocument(documentData) {
        if (!isPlainObject(documentData)) {
            return createDefaultDocument();
        }

        return {
            version: STORAGE_VERSION,
            title: normalizeTitle(documentData.title),
            icon: normalizeIcon(documentData.icon),
            blocks: normalizeBlocks(documentData.blocks)
        };
    }

    /**
     * Creates a deep clone of a normalized document.
     *
     * @param {*} documentData
     * @returns {Object}
     */
    function cloneDocument(documentData) {
        return normalizeDocument(
            JSON.parse(
                JSON.stringify(
                    normalizeDocument(documentData)
                )
            )
        );
    }

    // =========================================================================
    // UTF-8 Base64 URL encoding
    // =========================================================================

    /**
     * Converts a UTF-8 string to URL-safe Base64.
     *
     * @param {string} value
     * @returns {string}
     */
    function encodeBase64Url(value) {
        const bytes = new TextEncoder().encode(value);

        let binary = "";

        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }

        return btoa(binary)
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/g, "");
    }

    /**
     * Converts URL-safe Base64 back to a UTF-8 string.
     *
     * @param {string} value
     * @returns {string}
     */
    function decodeBase64Url(value) {
        const normalizedValue = value
            .replace(/-/g, "+")
            .replace(/_/g, "/");

        const paddingLength =
            (4 - (normalizedValue.length % 4)) % 4;

        const paddedValue =
            normalizedValue + "=".repeat(paddingLength);

        const binary = atob(paddedValue);

        const bytes = Uint8Array.from(
            binary,
            character => character.charCodeAt(0)
        );

        return new TextDecoder().decode(bytes);
    }

    // =========================================================================
    // Serialization
    // =========================================================================

    /**
     * Serializes a document into a compact URL-safe string.
     *
     * @param {*} documentData
     * @returns {string}
     */
    function serializeDocument(documentData) {
        const normalizedDocument =
            normalizeDocument(documentData);

        const json = JSON.stringify(normalizedDocument);

        return encodeBase64Url(json);
    }

    /**
     * Deserializes a document from a URL-safe string.
     *
     * @param {string} serializedValue
     * @returns {Object}
     */
    function deserializeDocument(serializedValue) {
        if (
            typeof serializedValue !== "string" ||
            serializedValue.length === 0
        ) {
            return createDefaultDocument();
        }

        try {
            const json = decodeBase64Url(serializedValue);
            const parsedDocument = JSON.parse(json);

            return normalizeDocument(parsedDocument);
        } catch (error) {
            console.error(
                "Note-U could not read the document from the URL.",
                error
            );

            return createDefaultDocument();
        }
    }

    // =========================================================================
    // URL hash
    // =========================================================================

    /**
     * Returns the serialized document stored in the current hash.
     *
     * @returns {string}
     */
    function getSerializedDocumentFromHash() {
        const hash = window.location.hash;

        if (!hash.startsWith(HASH_PREFIX)) {
            return "";
        }

        return hash.slice(HASH_PREFIX.length);
    }

    /**
     * Checks whether the current URL contains a Note-U document.
     *
     * @returns {boolean}
     */
    function hasDocumentInUrl() {
        return window.location.hash.startsWith(HASH_PREFIX);
    }

    /**
     * Loads the current document from the URL.
     *
     * @returns {Object}
     */
    function loadDocumentFromUrl() {
        const serializedDocument =
            getSerializedDocumentFromHash();

        return deserializeDocument(serializedDocument);
    }

    /**
     * Writes a document to the current URL without creating
     * a new browser history entry.
     *
     * @param {*} documentData
     * @returns {string}
     */
    function saveDocumentToUrl(documentData) {
        const serializedDocument =
            serializeDocument(documentData);

        const newHash =
            `${HASH_PREFIX}${serializedDocument}`;

        const newUrl =
            `${window.location.pathname}` +
            `${window.location.search}` +
            newHash;

        window.history.replaceState(
            null,
            "",
            newUrl
        );

        return window.location.href;
    }

    /**
     * Removes the document hash from the current URL.
     */
    function clearDocumentFromUrl() {
        const cleanUrl =
            `${window.location.pathname}` +
            `${window.location.search}`;

        window.history.replaceState(
            null,
            "",
            cleanUrl
        );
    }

    /**
     * Returns a complete shareable URL for a document.
     *
     * This method does not modify the current browser URL.
     *
     * @param {*} documentData
     * @returns {string}
     */
    function createShareableUrl(documentData) {
        const serializedDocument =
            serializeDocument(documentData);

        const baseUrl =
            `${window.location.origin}` +
            `${window.location.pathname}` +
            `${window.location.search}`;

        return `${baseUrl}${HASH_PREFIX}${serializedDocument}`;
    }

    // =========================================================================
    // URL size information
    // =========================================================================

    /**
     * Returns the approximate byte size of a string.
     *
     * @param {string} value
     * @returns {number}
     */
    function getUtf8ByteLength(value) {
        return new TextEncoder().encode(value).length;
    }

    /**
     * Returns storage statistics for a document.
     *
     * @param {*} documentData
     * @returns {Object}
     */
    function getDocumentStorageInfo(documentData) {
        const serializedDocument =
            serializeDocument(documentData);

        const fullUrl =
            `${window.location.origin}` +
            `${window.location.pathname}` +
            `${window.location.search}` +
            `${HASH_PREFIX}${serializedDocument}`;

        return {
            serializedLength: serializedDocument.length,
            serializedBytes:
                getUtf8ByteLength(serializedDocument),
            urlLength: fullUrl.length,
            urlBytes: getUtf8ByteLength(fullUrl)
        };
    }

    // =========================================================================
    // Public API
    // =========================================================================

    window.NoteUStorage = Object.freeze({
        version: STORAGE_VERSION,

        createId,
        createDefaultBlock,
        createDefaultDocument,

        normalizeBlock,
        normalizeDocument,
        cloneDocument,

        serializeDocument,
        deserializeDocument,

        hasDocumentInUrl,
        loadDocumentFromUrl,
        saveDocumentToUrl,
        clearDocumentFromUrl,
        createShareableUrl,

        getDocumentStorageInfo
    });
})();
