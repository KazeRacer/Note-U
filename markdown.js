(() => {
  'use strict';

  // Pure Markdown helpers: no DOM access, so they can run in the editor and in Node tests.

  const SAFE_HREF = /^(?:https?:|mailto:|tel:)/i;
  const HEADING_LEVELS = ['heading-1', 'heading-2', 'heading-3'];

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function decodeEntities(value) {
    return String(value ?? '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&amp;/g, '&');
  }

  // Converts one line of inline Markdown into the HTML subset accepted by the sanitizer.
  function inlineToHtml(text) {
    const parts = String(text ?? '').split(/(`[^`\n]+`)/);
    return parts.map((part, index) => {
      if (index % 2 === 1) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;

      // Links are lifted out first so that their URLs are never touched by emphasis rules.
      const pieces = [];
      let rest = part;
      const linkPattern = /\[([^\]\n]+)\]\(([^\s)]+)\)/;
      for (;;) {
        const match = linkPattern.exec(rest);
        if (!match) break;
        if (match.index > 0) pieces.push({ text: rest.slice(0, match.index) });
        pieces.push({ label: match[1], href: match[2] });
        rest = rest.slice(match.index + match[0].length);
      }
      if (rest) pieces.push({ text: rest });

      return pieces.map((piece) => {
        if (piece.href !== undefined) {
          const label = emphasisToHtml(escapeHtml(piece.label));
          if (!SAFE_HREF.test(piece.href)) return label;
          return `<a href="${escapeHtml(piece.href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
        }
        return autolink(emphasisToHtml(escapeHtml(piece.text)));
      }).join('');
    }).join('');
  }

  function emphasisToHtml(html) {
    return html
      .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
      .replace(/__(?=\S)(.+?)(?<=\S)__/g, '<strong>$1</strong>')
      .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<s>$1</s>')
      .replace(/==(?=\S)(.+?)(?<=\S)==/g, '<mark>$1</mark>')
      .replace(/(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])/g, '<em>$1</em>')
      .replace(/(?<![\w_])_(?=[^\s_])(.+?)(?<=[^\s_])_(?![\w_])/g, '<em>$1</em>');
  }

  function autolink(html) {
    return html.replace(/(https?:\/\/[^\s<]+)/gi, (url) => {
      const trailing = url.match(/[.,;:!?)]+$/)?.[0] || '';
      const clean = trailing ? url.slice(0, -trailing.length) : url;
      return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>${trailing}`;
    });
  }

  // Parses Markdown into the note block tree. Indentation produces real children.
  function parseMarkdown(source) {
    const lines = String(source ?? '').replace(/\r\n?/g, '\n').replace(/​/g, '').split('\n');
    const root = [];
    const parents = [];
    let indentWidths = [0];
    let lastQuote = null;

    function depthFor(width) {
      while (indentWidths.length > 1 && width < indentWidths.at(-1)) indentWidths.pop();
      if (width > indentWidths.at(-1)) indentWidths.push(width);
      return indentWidths.length - 1;
    }

    function add(block, depth) {
      parents.length = Math.min(parents.length, depth);
      const container = parents.length ? parents.at(-1).children : root;
      container.push(block);
      parents[depth] = block;
      parents.length = depth + 1;
      return block;
    }

    function withChildren(block) {
      block.children = [];
      return block;
    }

    for (let index = 0; index < lines.length; index += 1) {
      const raw = lines[index].replace(/\t/g, '  ');
      if (!raw.trim()) {
        lastQuote = null;
        continue;
      }
      const width = raw.match(/^ */)[0].length;
      const line = raw.slice(width);

      if (line.includes('|') && index + 1 < lines.length && TABLE_SEPARATOR.test(lines[index + 1].trim())) {
        const header = splitTableRow(line);
        if (header.length && header.length === splitTableRow(lines[index + 1].trim()).length) {
          const cells = [header];
          while (index + 2 < lines.length && lines[index + 2].includes('|') && lines[index + 2].trim()) {
            cells.push(splitTableRow(lines[index + 2].trim()));
            index += 1;
          }
          index += 1;
          const columns = Math.max(...cells.map((row) => row.length));
          add(withChildren({
            type: 'table',
            header: true,
            cells: cells.map((row) => [...row, ...Array(columns - row.length).fill('')].map(inlineToHtml))
          }), depthFor(width));
          lastQuote = null;
          continue;
        }
      }

      const fence = line.match(/^(```|~~~)\s*([\w+-]*)\s*$/);
      if (fence) {
        const body = [];
        index += 1;
        while (index < lines.length && !lines[index].trim().startsWith(fence[1])) {
          body.push(lines[index].replace(/\t/g, '  ').slice(Math.min(width, lines[index].match(/^ */)[0].length)));
          index += 1;
        }
        add(withChildren(fence[2].toLowerCase() === 'calc'
          ? { type: 'calculator', lines: body.length ? body : [''] }
          : { type: 'code', text: body.join('\n') }), depthFor(width));
        lastQuote = null;
        continue;
      }

      if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        add(withChildren({ type: 'divider' }), depthFor(width));
        lastQuote = null;
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (heading) {
        indentWidths = [0];
        add(withChildren({
          type: HEADING_LEVELS[Math.min(heading[1].length, 3) - 1],
          html: inlineToHtml(heading[2])
        }), 0);
        lastQuote = null;
        continue;
      }

      const todo = line.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/);
      if (todo) {
        const block = withChildren({ type: 'checklist', html: inlineToHtml(todo[2]) });
        if (todo[1] !== ' ') block.checked = true;
        add(block, depthFor(width));
        lastQuote = null;
        continue;
      }

      const bullet = line.match(/^[-*+]\s+(.*)$/);
      if (bullet) {
        add(withChildren({ type: 'bulleted-list', html: inlineToHtml(bullet[1]) }), depthFor(width));
        lastQuote = null;
        continue;
      }

      const numbered = line.match(/^\d+[.)]\s+(.*)$/);
      if (numbered) {
        add(withChildren({ type: 'numbered-list', html: inlineToHtml(numbered[1]) }), depthFor(width));
        lastQuote = null;
        continue;
      }

      const quote = line.match(/^>\s?(.*)$/);
      if (quote) {
        const html = inlineToHtml(quote[1]);
        if (lastQuote) {
          lastQuote.html += `<br>${html}`;
        } else {
          lastQuote = add(withChildren({ type: 'quote', html }), depthFor(width));
        }
        continue;
      }

      lastQuote = null;
      add(withChildren({ type: 'paragraph', html: inlineToHtml(line) }), depthFor(width));
    }

    return pruneEmptyChildren(root);
  }

  const TABLE_SEPARATOR = /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/;

  // Splits a Markdown table row on unescaped pipes and drops the optional outer pipes.
  function splitTableRow(line) {
    const cells = [];
    let current = '';
    for (let position = 0; position < line.length; position += 1) {
      const character = line[position];
      if (character === '\\' && line[position + 1] === '|') {
        current += '|';
        position += 1;
      } else if (character === '|') {
        cells.push(current);
        current = '';
      } else {
        current += character;
      }
    }
    cells.push(current);
    if (cells.length && !cells[0].trim()) cells.shift();
    if (cells.length && !cells.at(-1).trim()) cells.pop();
    return cells.map((cell) => cell.trim());
  }

  function pruneEmptyChildren(blocks) {
    blocks.forEach((block) => {
      if (block.children?.length) pruneEmptyChildren(block.children);
      else delete block.children;
    });
    return blocks;
  }

  // Converts the sanitized inline HTML subset back to Markdown.
  function htmlToMarkdown(html) {
    return decodeEntities(String(html ?? '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (match, href, label) => {
        const url = decodeEntities(href);
        return decodeEntities(label) === url ? url : `[${label}](${url})`;
      })
      .replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')
      .replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*')
      .replace(/<(?:s|strike)\b[^>]*>([\s\S]*?)<\/(?:s|strike)>/gi, '~~$1~~')
      .replace(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi, '==$1==')
      .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
      .replace(/<\/?(?:span|u)\b[^>]*>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/​/g, ''));
  }

  const CALLOUT_ICON = '💡';

  // Serializes block data (as produced by the editor) to portable Markdown.
  function toMarkdown(blocks) {
    const out = [];

    const LIST_TYPES = new Set(['bulleted-list', 'numbered-list', 'checklist']);

    function emit(list, depth) {
      let number = 0;
      let previous = null;
      list.forEach((block) => {
        const listBoundary = previous && out.at(-1) !== ''
          && (LIST_TYPES.has(previous.type) !== LIST_TYPES.has(block.type)
            || (LIST_TYPES.has(block.type) && previous.type !== block.type));
        if (listBoundary) out.push('');
        previous = block;
        const pad = '  '.repeat(depth);
        const children = Array.isArray(block.children) ? block.children : [];
        const text = htmlToMarkdown(block.html || '');
        const indentContinuation = (value) => value.replace(/\n/g, `\n${pad}  `);
        number = block.type === 'numbered-list' ? number + 1 : 0;

        switch (block.type) {
          case 'heading-1': out.push(`${pad}# ${text}`, ''); break;
          case 'heading-2': out.push(`${pad}## ${text}`, ''); break;
          case 'heading-3': out.push(`${pad}### ${text}`, ''); break;
          case 'bulleted-list': out.push(`${pad}- ${indentContinuation(text)}`); break;
          case 'numbered-list': out.push(`${pad}${number}. ${indentContinuation(text)}`); break;
          case 'checklist': out.push(`${pad}- [${block.checked ? 'x' : ' '}] ${indentContinuation(text)}`); break;
          case 'quote': out.push(...text.split('\n').map((row) => `${pad}> ${row}`), ''); break;
          case 'callout': out.push(...text.split('\n').map((row, row_index) => `${pad}> ${row_index === 0 ? `${CALLOUT_ICON} ` : ''}${row}`), ''); break;
          case 'divider': out.push(`${pad}---`, ''); break;
          case 'code': out.push(`${pad}\`\`\``, ...String(block.text || '').split('\n').map((row) => `${pad}${row}`), `${pad}\`\`\``, ''); break;
          case 'calculator': out.push(`${pad}\`\`\`calc`, ...(block.lines || []).map((row) => `${pad}${row}`), `${pad}\`\`\``, ''); break;
          case 'table': {
            const rows = (block.cells || []).map((row) => row.map((cell) => htmlToMarkdown(cell)
              .replace(/\|/g, '\\|').replace(/\n/g, '<br>')));
            if (!rows.length) break;
            const width = Math.max(...rows.map((row) => row.length));
            const line = (row) => `${pad}| ${[...row, ...Array(width - row.length).fill('')].join(' | ')} |`;
            const head = block.header === false ? Array(width).fill('') : rows[0];
            out.push(line(head), `${pad}| ${Array(width).fill('---').join(' | ')} |`,
              ...(block.header === false ? rows : rows.slice(1)).map(line), '');
            break;
          }
          case 'toggle': {
            const style = { 'heading-1': '# ', 'heading-2': '## ', 'heading-3': '### ' }[block.titleStyle] || '';
            out.push(`${pad}<details${block.open === false ? '' : ' open'}>`, `${pad}<summary>${style}${text}</summary>`, '');
            emit(children, depth);
            out.push(`${pad}</details>`, '');
            return;
          }
          default: out.push(`${pad}${text}`, ''); break;
        }
        if (children.length) emit(children, depth + 1);
      });
    }

    emit(Array.isArray(blocks) ? blocks : [], 0);
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  const api = Object.freeze({ inlineToHtml, parseMarkdown, htmlToMarkdown, toMarkdown, escapeHtml });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NoteMarkdown = api;
})();
