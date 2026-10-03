import type MarkdownIt from 'markdown-it';
import { register } from '../registry.js';
import { escapeAttr, escapeHtml } from '../html.js';

/** Total TOC entries per render, across all `{{toc}}` blocks. */
export const MAX_TOC_ENTRIES = 20_000;
/** Total TOC output per render, roughly in characters. */
export const MAX_TOC_BYTES = 8_000_000;

interface Heading {
  level: number;
  text: string;
  anchor: string;
}

function parseRange(body: string | null): [number, number] {
  if (!body || !body.trim()) return [1, 3];
  const parts = body.trim().split(',').map(s => parseInt(s.trim(), 10));
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return [parts[0], parts[1]];
  }
  return [1, 3];
}

function buildTocHTML(headings: Heading[], directive: string): string {
  // data-md lets copy-as-Markdown restore the directive instead of a link list.
  const open = `<ul class="toc-list" data-md="${escapeAttr(directive)}">`;
  if (!headings.length) return `${open}</ul>\n`;

  let html = `${open}\n`;
  for (const h of headings) {
    const href = h.anchor ? `#${h.anchor}` : '';
    html += `<li style="padding-left:${(h.level - 1) * 1.25}em"><a href="${escapeAttr(href)}">${escapeHtml(h.text)}</a></li>\n`;
  }
  html += '</ul>\n';
  return html;
}

export function registerToc(md: MarkdownIt): void {
  // The render function just returns the pre-built HTML injected by the core rule
  register({
    type: 'block',
    aliases: ['toc'],
    render(_args, body, _env) {
      return body ?? '';
    },
  });

  md.core.ruler.push('toc_resolve', (state) => {
    // An inline render (span body, spoil label) shares the document env; it has
    // no headings and must not overwrite the document's tocHeadings.
    if (state.inlineMode) return;
    const headings: Heading[] = [];
    const tocTokenIndices: number[] = [];

    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i];

      if (token.type === 'heading_open') {
        const level = parseInt(token.tag.slice(1), 10);
        const inlineToken = state.tokens[i + 1];
        const text = (inlineToken?.children ?? [])
          .filter((t: MarkdownIt.Token) => t.type === 'text' || t.type === 'code_inline')
          .map((t: MarkdownIt.Token) => t.content)
          .join('');
        const anchor = token.attrGet('id') ?? '';
        headings.push({ level, text, anchor });
      }

      if (token.type === 'plugin_block' && token.info === 'toc') {
        tocTokenIndices.push(i);
      }
    }

    (state.env as Record<string, unknown>).tocHeadings = headings;

    // Output grows as TOCs × headings: 2,000 of each was 219 MB and more ran
    // V8 out of heap (pre-existing in 1.6.3; round 18, H4). Past a total of
    // MAX_TOC_ENTRIES entries a TOC renders empty (keeping its breadcrumb).
    let entries = 0;
    let bytes = 0; // entry text + href: one 100,000-character heading × 4,000 TOCs overflowed a string (round 19, H4)
    for (const idx of tocTokenIndices) {
      const token = state.tokens[idx];
      const range = (token.content || '').trim();
      const [minLevel, maxLevel] = parseRange(range || null);
      let filtered = headings.filter(h => h.level >= minLevel && h.level <= maxLevel);
      let size = 0;
      for (const h of filtered) size += escapeHtml(h.text).length + escapeAttr(h.anchor).length + 64; // what is written (round 21)
      if (entries + filtered.length > MAX_TOC_ENTRIES || bytes + size > MAX_TOC_BYTES) { filtered = []; size = 0; }
      entries += filtered.length;
      bytes += size;
      token.content = buildTocHTML(filtered, range ? `{{toc ${range}}}` : '{{toc}}');
    }
  });
}
