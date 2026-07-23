(() => {
  'use strict';

  const CURRENT_VERSION = 4;
  const DEFAULT_NOTE = Object.freeze({
    version: CURRENT_VERSION,
    title: 'Note',
    icon: '✏️',
    body: '',
    blocks: Object.freeze([])
  });

  function cloneDefaultNote() {
    return { ...DEFAULT_NOTE, blocks: [] };
  }

  function bytesToBase64Url(bytes) {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }

    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  function base64UrlToBytes(value) {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(base64 + padding);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }

  function encodeUtf8(value) {
    return bytesToBase64Url(new TextEncoder().encode(value));
  }

  function decodeUtf8(value) {
    return new TextDecoder().decode(base64UrlToBytes(value));
  }

  function sanitizeBodyHtml(html) {
    if (typeof html !== 'string' || !html.trim()) return '';

    const template = document.createElement('template');
    template.innerHTML = html;

    const blockedTags = new Set([
      'SCRIPT',
      'STYLE',
      'IFRAME',
      'OBJECT',
      'EMBED',
      'FORM',
      'META',
      'LINK'
    ]);

    const allowedDataAttributes = new Set([
      'data-type',
      'data-indent',
      'data-open',
      'data-checked',
      'data-title-style',
      'data-block-id'
    ]);

    const walker = document.createTreeWalker(
      template.content,
      NodeFilter.SHOW_ELEMENT
    );

    const elements = [];
    while (walker.nextNode()) elements.push(walker.currentNode);

    elements.forEach((element) => {
      if (blockedTags.has(element.tagName)) {
        element.remove();
        return;
      }

      [...element.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();

        if (name.startsWith('on')) {
          element.removeAttribute(attribute.name);
          return;
        }

        if (name.startsWith('data-') && !allowedDataAttributes.has(name)) {
          element.removeAttribute(attribute.name);
          return;
        }

        if (name === 'style' || name === 'id' || name === 'draggable') {
          element.removeAttribute(attribute.name);
          return;
        }

        if (name === 'href') {
          const safeProtocol = /^(https?:|mailto:|tel:|#)/i.test(value);
          if (!safeProtocol) element.removeAttribute(attribute.name);
        }
      });
    });

    return template.innerHTML;
  }


  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeMarks(marks) {
    if (Array.isArray(marks)) {
      return new Set(marks.map((mark) => typeof mark === 'string' ? mark : mark?.type).filter(Boolean));
    }

    if (marks && typeof marks === 'object') {
      return new Set(
        Object.entries(marks)
          .filter(([, enabled]) => Boolean(enabled))
          .map(([name]) => name)
      );
    }

    return new Set();
  }

  function richTextToHtml(value) {
    if (typeof value === 'string' || typeof value === 'number') {
      return escapeHtml(value).replace(/\n/g, '<br>');
    }

    if (!Array.isArray(value)) {
      if (value && typeof value === 'object') {
        return richTextToHtml(
          value.segments
          ?? value.richText
          ?? value.content
          ?? value.text
          ?? value.value
          ?? ''
        );
      }
      return '';
    }

    return value.map((segment) => {
      if (typeof segment === 'string' || typeof segment === 'number') {
        return escapeHtml(segment).replace(/\n/g, '<br>');
      }

      const text = escapeHtml(
        segment?.text
        ?? segment?.value
        ?? segment?.content
        ?? segment?.plainText
        ?? ''
      ).replace(/\n/g, '<br>');

      const marks = normalizeMarks(segment?.marks ?? segment?.styles ?? segment?.format);
      let html = text;

      if (marks.has('code') || marks.has('inline-code')) html = `<code>${html}</code>`;
      if (marks.has('bold') || marks.has('strong')) html = `<strong>${html}</strong>`;
      if (marks.has('italic') || marks.has('em')) html = `<em>${html}</em>`;
      if (marks.has('strike') || marks.has('strikethrough')) html = `<s>${html}</s>`;
      if (marks.has('highlight') || marks.has('mark')) html = `<mark>${html}</mark>`;

      const href = segment?.href ?? segment?.url ?? segment?.link?.href ?? segment?.link;
      if (typeof href === 'string' && /^(https?:|mailto:|tel:)/i.test(href)) {
        html = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
      }

      return html;
    }).join('');
  }

  function mapLegacyBlockType(type) {
    const normalized = String(type || 'paragraph').toLowerCase();
    const mappings = {
      paragraph: 'paragraph',
      text: 'paragraph',
      'heading-1': 'heading-1',
      heading1: 'heading-1',
      h1: 'heading-1',
      'heading-2': 'heading-2',
      heading2: 'heading-2',
      h2: 'heading-2',
      'heading-3': 'heading-3',
      heading3: 'heading-3',
      h3: 'heading-3',
      'bullet-list': 'bulleted-list',
      'bulleted-list': 'bulleted-list',
      bullet: 'bulleted-list',
      ul: 'bulleted-list',
      'number-list': 'numbered-list',
      'numbered-list': 'numbered-list',
      numbered: 'numbered-list',
      ol: 'numbered-list',
      checklist: 'checklist',
      todo: 'checklist',
      'to-do': 'checklist',
      toggle: 'toggle',
      dropdown: 'toggle',
      quote: 'quote',
      blockquote: 'quote',
      divider: 'divider',
      hr: 'divider',
      code: 'code',
      'code-block': 'code'
    };
    return mappings[normalized] || 'paragraph';
  }

  function legacyBlockContent(block) {
    return richTextToHtml(
      block?.segments
      ?? block?.richText
      ?? block?.content
      ?? block?.text
      ?? block?.value
      ?? ''
    ) || '<br>';
  }

  function blockShell(type, indent, id, mainHtml, extraAttributes = '') {
    return `
      <div class="block" data-type="${type}" data-indent="${indent}" data-block-id="${escapeHtml(id)}" ${extraAttributes}>
        <button type="button" class="block-handle" tabindex="-1" contenteditable="false" data-drag-handle="true" aria-label="Block actions">⋮⋮</button>
        <div class="block-main">${mainHtml}</div>
      </div>
    `.trim();
  }

  function legacyBlockToHtml(block, index = 0) {
    const type = mapLegacyBlockType(block?.type ?? block?.kind ?? block?.blockType);
    const indent = Math.max(0, Math.min(8, Number.parseInt(block?.indent ?? block?.depth ?? block?.level ?? 0, 10) || 0));
    const id = block?.id || `legacy-${index}`;
    const content = legacyBlockContent(block);

    if (type === 'divider') {
      return blockShell(type, indent, id, '<hr class="block-divider" contenteditable="false">');
    }

    if (type === 'toggle') {
      const title = richTextToHtml(
        block?.title
        ?? block?.titleSegments
        ?? block?.summary
        ?? block?.content
        ?? block?.text
        ?? ''
      ) || '<br>';
      const titleStyle = mapLegacyBlockType(block?.titleStyle || 'paragraph');
      const open = block?.open === false ? 'false' : 'true';
      const children = block?.children ?? block?.blocks ?? block?.body ?? [];
      const childHtml = Array.isArray(children)
        ? children.map((child, childIndex) => legacyBlockToHtml(child, childIndex)).join('')
        : '';

      return blockShell(
        type,
        indent,
        id,
        `<div class="toggle-row"><button type="button" class="toggle-caret" tabindex="-1" contenteditable="false" data-toggle-caret="true" aria-label="Toggle content">▶</button><div class="toggle-title" data-block-content="true" data-title-style="${titleStyle}">${title}</div></div><div class="toggle-body" data-toggle-body="true">${childHtml}</div>`,
        `data-open="${open}"`
      );
    }

    if (type === 'code') {
      const plainText = block?.text ?? block?.content ?? block?.value ?? '';
      return blockShell(type, indent, id, `<pre class="block-content code-content" data-block-content="true">${escapeHtml(Array.isArray(plainText) ? plainText.map((segment) => segment?.text ?? segment?.value ?? '').join('') : plainText)}</pre>`);
    }

    let prefix = '';
    let extraAttributes = '';

    if (type === 'bulleted-list') {
      prefix = '<span class="list-marker" contenteditable="false" aria-hidden="true">•</span>';
    } else if (type === 'numbered-list') {
      prefix = '<span class="list-marker" contenteditable="false" aria-hidden="true">1.</span>';
    } else if (type === 'checklist') {
      const checked = Boolean(block?.checked ?? block?.done ?? block?.completed);
      prefix = `<label class="check-marker" contenteditable="false"><input type="checkbox" aria-label="Complete item" ${checked ? 'checked' : ''}></label>`;
      extraAttributes = `data-checked="${checked ? 'true' : 'false'}"`;
    }

    return blockShell(
      type,
      indent,
      id,
      `<div class="block-row">${prefix}<div class="block-content" data-block-content="true">${content}</div></div>`,
      extraAttributes
    );
  }

  function structuredBlocksToHtml(blocks) {
    if (!Array.isArray(blocks)) return '';
    return blocks.map((block, index) => legacyBlockToHtml(block, index)).join('');
  }

  function sanitizeInlineHtml(html) {
    if (typeof html !== 'string' || !html.trim()) return '';

    const template = document.createElement('template');
    template.innerHTML = html;

    const allowedTags = new Set([
      'A', 'BR', 'STRONG', 'B', 'EM', 'I', 'S', 'STRIKE', 'MARK', 'CODE', 'SPAN'
    ]);
    const elements = [...template.content.querySelectorAll('*')];

    elements.forEach((element) => {
      if (!allowedTags.has(element.tagName)) {
        element.replaceWith(...element.childNodes);
        return;
      }

      [...element.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        if (element.tagName !== 'A' || !['href', 'target', 'rel'].includes(name)) {
          element.removeAttribute(attribute.name);
        }
      });

      if (element.tagName === 'A') {
        const href = element.getAttribute('href') || '';
        if (!/^(https?:|mailto:|tel:|#)/i.test(href)) {
          element.removeAttribute('href');
        } else {
          element.setAttribute('target', '_blank');
          element.setAttribute('rel', 'noopener noreferrer');
        }
      }
    });

    return template.innerHTML;
  }

  const BLOCK_TYPE_CODES = Object.freeze({
    paragraph: 'p',
    'heading-1': 'h1',
    'heading-2': 'h2',
    'heading-3': 'h3',
    'bulleted-list': 'ul',
    'numbered-list': 'ol',
    checklist: 'ck',
    toggle: 'tg',
    quote: 'q',
    divider: 'hr',
    code: 'cd'
  });

  const CODE_BLOCK_TYPES = Object.freeze(
    Object.fromEntries(Object.entries(BLOCK_TYPE_CODES).map(([type, code]) => [code, type]))
  );

  function normalizeBlock(block) {
    if (!block || typeof block !== 'object') {
      return { type: 'paragraph', indent: 0, html: '' };
    }

    const rawType = block.type ?? block.kind ?? block.blockType ?? block.t;
    const type = CODE_BLOCK_TYPES[rawType] || mapLegacyBlockType(rawType);
    const indent = Math.max(
      0,
      Math.min(8, Number.parseInt(block.indent ?? block.depth ?? block.level ?? block.i ?? 0, 10) || 0)
    );

    if (type === 'divider') {
      return { type, indent };
    }

    if (type === 'code') {
      const value = block.text ?? block.value ?? block.v ?? block.content ?? '';
      const text = Array.isArray(value)
        ? value.map((segment) => segment?.text ?? segment?.value ?? segment?.content ?? '').join('')
        : String(value ?? '');
      return { type, indent, text };
    }

    if (type === 'toggle') {
      const rawTitleStyle = block.titleStyle ?? block.s ?? 'paragraph';
      const titleStyle = CODE_BLOCK_TYPES[rawTitleStyle] || mapLegacyBlockType(rawTitleStyle);
      const rawChildren = block.children ?? block.blocks ?? block.body ?? block.b ?? [];
      const rawTitle = block.title
        ?? block.titleSegments
        ?? block.summary
        ?? block.html
        ?? block.h
        ?? block.content
        ?? block.text
        ?? '';

      return {
        type,
        indent,
        html: sanitizeInlineHtml(
          typeof rawTitle === 'string' ? rawTitle : richTextToHtml(rawTitle)
        ),
        titleStyle: ['paragraph', 'heading-1', 'heading-2', 'heading-3'].includes(titleStyle)
          ? titleStyle
          : 'paragraph',
        open: block.open !== false && block.o !== 0,
        children: normalizeBlocks(Array.isArray(rawChildren) ? rawChildren : [])
      };
    }

    const rawHtml = block.html ?? block.h;
    const html = typeof rawHtml === 'string'
      ? sanitizeInlineHtml(rawHtml)
      : sanitizeInlineHtml(legacyBlockContent(block));

    return {
      type,
      indent,
      html,
      ...(type === 'checklist'
        ? { checked: Boolean(block.checked ?? block.done ?? block.completed ?? block.x) }
        : {})
    };
  }

  function normalizeBlocks(blocks) {
    if (!Array.isArray(blocks)) return [];
    return blocks.map(normalizeBlock);
  }

  function compactBlock(block) {
    const normalized = normalizeBlock(block);
    const compact = { t: BLOCK_TYPE_CODES[normalized.type] || 'p' };

    if (normalized.indent > 0) compact.i = normalized.indent;

    if (normalized.type === 'divider') return compact;

    if (normalized.type === 'code') {
      if (normalized.text) compact.v = normalized.text;
      return compact;
    }

    if (normalized.html) compact.h = normalized.html;

    if (normalized.type === 'checklist' && normalized.checked) {
      compact.x = 1;
    }

    if (normalized.type === 'toggle') {
      if (normalized.titleStyle && normalized.titleStyle !== 'paragraph') {
        compact.s = BLOCK_TYPE_CODES[normalized.titleStyle] || 'p';
      }
      if (normalized.open === false) compact.o = 0;
      if (normalized.children?.length) compact.b = normalized.children.map(compactBlock);
    }

    return compact;
  }

  function normalizeNote(value) {
    if (!value || typeof value !== 'object') return cloneDefaultNote();

    const rawBlocks = Array.isArray(value.blocks)
      ? value.blocks
      : Array.isArray(value.b)
        ? value.b
        : [];

    return {
      version: CURRENT_VERSION,
      title: typeof value.title === 'string'
        ? value.title
        : typeof value.t === 'string'
          ? value.t
          : DEFAULT_NOTE.title,
      icon: typeof value.icon === 'string'
        ? value.icon
        : typeof value.e === 'string'
          ? value.e
          : DEFAULT_NOTE.icon,
      body: sanitizeBodyHtml(
        typeof value.body === 'string'
          ? value.body
          : typeof value.b === 'string'
            ? value.b
            : ''
      ),
      blocks: normalizeBlocks(rawBlocks)
    };
  }

  function parseJsonPayload(raw) {
    const parsed = JSON.parse(raw);
    return normalizeNote(parsed);
  }

  function decodeLegacyBase64(hash) {
    const normalized = hash.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(normalized + padding);

    try {
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return decodeURIComponent(escape(binary));
    }
  }

  function loadFromHash(hash = window.location.hash) {
    const value = hash.startsWith('#') ? hash.slice(1) : hash;
    if (!value) return cloneDefaultNote();

    const attempts = [
      () => parseJsonPayload(decodeUtf8(value)),
      () => parseJsonPayload(decodeLegacyBase64(value)),
      () => parseJsonPayload(decodeURIComponent(value))
    ];

    for (const attempt of attempts) {
      try {
        return attempt();
      } catch {
        // Continue with the next legacy format.
      }
    }

    try {
      const decoded = decodeLegacyBase64(value);
      return normalizeNote({ body: decoded });
    } catch {
      try {
        return normalizeNote({ body: decodeURIComponent(value) });
      } catch {
        return cloneDefaultNote();
      }
    }
  }

  function encodeNote(note) {
    const normalized = normalizeNote(note);
    const compactPayload = {
      v: CURRENT_VERSION,
      t: normalized.title,
      e: normalized.icon,
      b: normalized.blocks.length
        ? normalized.blocks.map(compactBlock)
        : normalized.body || []
    };

    return encodeUtf8(JSON.stringify(compactPayload));
  }

  function writeToUrl(note, options = {}) {
    const { replace = true } = options;
    const encoded = encodeNote(note);
    const nextUrl = `${window.location.pathname}${window.location.search}#${encoded}`;

    if (replace) {
      history.replaceState(null, '', nextUrl);
    } else {
      history.pushState(null, '', nextUrl);
    }

    return window.location.href;
  }

  function clearUrl(options = {}) {
    const { replace = false } = options;
    const nextUrl = `${window.location.pathname}${window.location.search}`;

    if (replace) {
      history.replaceState(null, '', nextUrl);
    } else {
      history.pushState(null, '', nextUrl);
    }
  }

  window.NoteStorage = Object.freeze({
    CURRENT_VERSION,
    DEFAULT_NOTE,
    cloneDefaultNote,
    normalizeNote,
    sanitizeBodyHtml,
    sanitizeInlineHtml,
    normalizeBlocks,
    loadFromHash,
    encodeNote,
    writeToUrl,
    clearUrl
  });
})();
