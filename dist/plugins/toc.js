"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_TOC_BYTES = exports.MAX_TOC_ENTRIES = void 0;
exports.registerToc = registerToc;
const registry_js_1 = require("../registry.js");
const html_js_1 = require("../html.js");
/** Total TOC entries per render, across all `{{toc}}` blocks. */
exports.MAX_TOC_ENTRIES = 20000;
/** Total TOC output per render, roughly in characters. */
exports.MAX_TOC_BYTES = 8000000;
function parseRange(body) {
    if (!body || !body.trim())
        return [1, 3];
    const parts = body.trim().split(',').map(s => parseInt(s.trim(), 10));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return [parts[0], parts[1]];
    }
    return [1, 3];
}
function buildTocHTML(headings, directive) {
    // data-md lets copy-as-Markdown restore the directive instead of a link list.
    const open = `<ul class="toc-list" data-md="${(0, html_js_1.escapeAttr)(directive)}">`;
    if (!headings.length)
        return `${open}</ul>\n`;
    let html = `${open}\n`;
    for (const h of headings) {
        const href = h.anchor ? `#${h.anchor}` : '';
        html += `<li style="padding-left:${(h.level - 1) * 1.25}em"><a href="${(0, html_js_1.escapeAttr)(href)}">${(0, html_js_1.escapeHtml)(h.text)}</a></li>\n`;
    }
    html += '</ul>\n';
    return html;
}
function registerToc(md, registry = true) {
    // The render function just returns the pre-built HTML injected by the core rule
    // `registry: false` for a second, private instance (the carrier kit's parser):
    // the global plugin registry keeps the shared `md`'s definitions.
    if (registry) {
        (0, registry_js_1.register)({
            type: 'block',
            aliases: ['toc'],
            render(_args, body, _env) {
                return body ?? '';
            },
        });
    }
    md.core.ruler.push('toc_resolve', (state) => {
        // An inline render (span body, spoil label) shares the document env; it has
        // no headings and must not overwrite the document's tocHeadings.
        if (state.inlineMode)
            return;
        const headings = [];
        const tocTokenIndices = [];
        for (let i = 0; i < state.tokens.length; i++) {
            const token = state.tokens[i];
            if (token.type === 'heading_open') {
                const level = parseInt(token.tag.slice(1), 10);
                const inlineToken = state.tokens[i + 1];
                const text = (inlineToken?.children ?? [])
                    .filter((t) => t.type === 'text' || t.type === 'code_inline')
                    .map((t) => t.content)
                    .join('');
                const anchor = token.attrGet('id') ?? '';
                headings.push({ level, text, anchor });
            }
            if (token.type === 'plugin_block' && token.info === 'toc') {
                tocTokenIndices.push(i);
            }
        }
        state.env.tocHeadings = headings;
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
            for (const h of filtered)
                size += (0, html_js_1.escapeHtml)(h.text).length + (0, html_js_1.escapeAttr)(h.anchor).length + 64; // what is written (round 21)
            if (entries + filtered.length > exports.MAX_TOC_ENTRIES || bytes + size > exports.MAX_TOC_BYTES) {
                filtered = [];
                size = 0;
            }
            entries += filtered.length;
            bytes += size;
            token.content = buildTocHTML(filtered, range ? `{{toc ${range}}}` : '{{toc}}');
        }
    });
}
//# sourceMappingURL=toc.js.map