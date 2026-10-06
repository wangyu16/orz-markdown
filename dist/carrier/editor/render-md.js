"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderMarkdownPreview = renderMarkdownPreview;
/**
 * The `md` kind's preview renderer (FC-18 §7.1, §8.3): the body without its
 * header, rendered by orz-markdown with twin links on (`env.orzTwinLinks`),
 * every block stamped with `data-src-line` — its 0-based line in the WHOLE
 * text (the header's lines counted) — so the editor's scroll sync can anchor
 * on it. The other kinds pass their own `render` to the shell.
 *
 * Renders with the shared `md` (what the document's readers see, plugins and
 * all); the tokens are stamped between parse and render, so the shared
 * instance is not changed.
 */
const index_js_1 = require("../../index.js");
const header_js_1 = require("../header.js");
const links_js_1 = require("../links.js");
/** Block tokens without nesting that render their attributes. */
const STAMPED_LEAVES = new Set(['fence', 'code_block', 'hr']);
/** Render an `md` text for the editor preview (see the module comment). */
function renderMarkdownPreview(text, options = {}) {
    (0, links_js_1.registerTwinLinks)(index_js_1.md); // idempotent; links.ts registers it on load as well
    const { body, offset } = (0, header_js_1.withoutHeader)(text);
    let lineOffset = 0;
    const head = text.slice(0, offset);
    for (let i = 0; i < head.length; i++) {
        const c = head.charCodeAt(i);
        if (c === 10)
            lineOffset++;
        else if (c === 13) {
            lineOffset++;
            if (head.charCodeAt(i + 1) === 10)
                i++;
        }
    }
    const env = { ...(options.env ?? {}), orzTwinLinks: options.twinLinks !== false };
    const tokens = index_js_1.md.parse(body, env);
    for (const t of tokens) {
        if (!t.map || !t.block)
            continue;
        if (t.nesting === 1 || STAMPED_LEAVES.has(t.type))
            t.attrSet('data-src-line', String(t.map[0] + lineOffset));
    }
    return index_js_1.md.renderer.render(tokens, index_js_1.md.options, env);
}
//# sourceMappingURL=render-md.js.map