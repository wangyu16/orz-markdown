"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerToc = registerToc;
const registry_js_1 = require("../registry.js");
function parseRange(body) {
    if (!body || !body.trim())
        return [1, 3];
    const parts = body.trim().split(',').map(s => parseInt(s.trim(), 10));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return [parts[0], parts[1]];
    }
    return [1, 3];
}
function buildTocHTML(headings) {
    if (!headings.length)
        return '<ul class="toc-list"></ul>\n';
    let html = '<ul class="toc-list">\n';
    for (const h of headings) {
        const href = h.anchor ? `#${h.anchor}` : '';
        html += `<li style="padding-left:${(h.level - 1) * 1.25}em"><a href="${href}">${h.text}</a></li>\n`;
    }
    html += '</ul>\n';
    return html;
}
function registerToc(md) {
    // The render function just returns the pre-built HTML injected by the core rule
    (0, registry_js_1.register)({
        type: 'block',
        aliases: ['toc'],
        render(_args, body, _env) {
            return body ?? '';
        },
    });
    md.core.ruler.push('toc_resolve', (state) => {
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
        for (const idx of tocTokenIndices) {
            const token = state.tokens[idx];
            const [minLevel, maxLevel] = parseRange(token.content || null);
            const filtered = headings.filter(h => h.level >= minLevel && h.level <= maxLevel);
            token.content = buildTocHTML(filtered);
        }
    });
}
//# sourceMappingURL=toc.js.map