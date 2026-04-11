"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.md = exports.prepareSources = exports.register = void 0;
require("katex/contrib/mhchem");
const markdown_it_1 = __importDefault(require("markdown-it"));
const markdown_it_anchor_1 = __importDefault(require("markdown-it-anchor"));
const markdown_it_container_1 = __importDefault(require("markdown-it-container"));
const markdown_it_footnote_1 = __importDefault(require("markdown-it-footnote"));
const markdown_it_imsize_1 = __importDefault(require("markdown-it-imsize"));
const markdown_it_mark_1 = __importDefault(require("markdown-it-mark"));
const markdown_it_sub_1 = __importDefault(require("markdown-it-sub"));
const markdown_it_sup_1 = __importDefault(require("markdown-it-sup"));
const markdown_it_ins_1 = __importDefault(require("markdown-it-ins"));
const markdown_it_task_lists_1 = __importDefault(require("markdown-it-task-lists"));
const markdown_it_katex_1 = __importDefault(require("@traptitech/markdown-it-katex"));
const block_dispatcher_js_1 = require("./rules/block-dispatcher.js");
const inline_dispatcher_js_1 = require("./rules/inline-dispatcher.js");
const registry_js_1 = require("./registry.js");
const span_js_1 = require("./plugins/span.js");
const toc_js_1 = require("./plugins/toc.js");
const attrs_js_1 = require("./plugins/attrs.js");
const markdown_include_js_1 = require("./plugins/markdown-include.js");
require("./plugins/test.js");
require("./plugins/emoji.js");
require("./plugins/space.js");
require("./plugins/youtube.js");
require("./plugins/mermaid.js");
require("./plugins/smiles.js");
require("./plugins/qrcode.js");
require("./plugins/yaml.js");
require("./plugins/nyml.js");
var registry_js_2 = require("./registry.js");
Object.defineProperty(exports, "register", { enumerable: true, get: function () { return registry_js_2.register; } });
var prepare_sources_js_1 = require("./prepare-sources.js");
Object.defineProperty(exports, "prepareSources", { enumerable: true, get: function () { return prepare_sources_js_1.prepareSources; } });
const md = new markdown_it_1.default({
    // allow raw HTML tags in source text. disabling this (the default) causes
    // tags like `<div>...</div>` to be escaped into `&lt;div&gt;`.
    html: true,
    linkify: true,
    typographer: true,
});
exports.md = md;
// Official plugins (anchor must be first: TOC depends on its id generation)
md.use(markdown_it_anchor_1.default);
// Semantic color containers
md.use(markdown_it_container_1.default, 'success');
md.use(markdown_it_container_1.default, 'info');
md.use(markdown_it_container_1.default, 'warning');
md.use(markdown_it_container_1.default, 'danger');
// Layout containers
md.use(markdown_it_container_1.default, 'left', {
    render(tokens, idx) {
        if (tokens[idx].nesting === 1) {
            const width = tokens[idx].info.trim().slice('left'.length).trim();
            if (width)
                return `<div class="left" style="max-width: ${width}; width: ${width}">\n`;
            return '<div class="left">\n';
        }
        return '</div>\n';
    },
});
md.use(markdown_it_container_1.default, 'right');
md.use(markdown_it_container_1.default, 'center');
// Interactive containers
md.use(markdown_it_container_1.default, 'spoil', {
    render(tokens, idx) {
        if (tokens[idx].nesting === 1) {
            // Extract label from params: "::: spoil My Title" → "My Title"
            const label = tokens[idx].info.trim().slice('spoil'.length).trim();
            return `<details class="spoil"><summary>${label || 'Show/hide'}</summary>\n`;
        }
        return '</details>\n';
    },
});
md.use(markdown_it_container_1.default, 'tabs');
md.use(markdown_it_container_1.default, 'tab', {
    render(tokens, idx) {
        if (tokens[idx].nesting === 1) {
            // Extract label from params: "::: tab Python" → "Python"
            const label = tokens[idx].info.trim().slice('tab'.length).trim();
            return `<div class="tab" data-label="${label}">\n`;
        }
        return '</div>\n';
    },
});
md.use(markdown_it_container_1.default, 'cols', {
    render(tokens, idx) {
        if (tokens[idx].nesting === 1) {
            const rest = tokens[idx].info.trim().slice('cols'.length).trim();
            if (rest) {
                // Plain numbers become fr units; CSS lengths (%, px, em, …) pass through as-is
                const cols = rest.split(/\s+/).map(p => /^\d+(\.\d+)?$/.test(p) ? `${p}fr` : p).join(' ');
                return `<div class="cols" style="grid-template-columns: ${cols}">\n`;
            }
            return '<div class="cols">\n';
        }
        return '</div>\n';
    },
});
md.use(markdown_it_container_1.default, 'col');
// Catch-all: ::: ClassName → <div class="ClassName"> for any identifier not already registered
const RESERVED_CONTAINERS = new Set([
    'success', 'info', 'warning', 'danger',
    'left', 'right', 'center',
    'spoil', 'tabs', 'tab',
    'cols', 'col',
]);
md.use(markdown_it_container_1.default, 'div', {
    validate: (params) => {
        const name = params.trim().split(/\s+/)[0];
        return /^[A-Za-z][A-Za-z0-9_-]*$/.test(name) && !RESERVED_CONTAINERS.has(name);
    },
    render(tokens, idx) {
        const name = tokens[idx].info.trim().split(/\s+/)[0];
        if (tokens[idx].nesting === 1)
            return `<div class="${name}">\n`;
        return '</div>\n';
    },
});
md.use(markdown_it_footnote_1.default);
md.use(markdown_it_imsize_1.default);
md.use(markdown_it_mark_1.default);
md.use(markdown_it_sub_1.default);
md.use(markdown_it_sup_1.default);
md.use(markdown_it_ins_1.default);
md.use(markdown_it_task_lists_1.default);
md.use(markdown_it_katex_1.default, { enableMhchem: true });
// Custom dispatchers
md.block.ruler.after('blockquote', 'plugin_block_dispatcher', block_dispatcher_js_1.blockDispatcher, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
md.inline.ruler.after('escape', 'plugin_inline_dispatcher', inline_dispatcher_js_1.inlineDispatcher);
// Register plugins that need access to the md instance
(0, span_js_1.registerSpan)(md);
(0, toc_js_1.registerToc)(md);
(0, attrs_js_1.registerAttrs)(md);
(0, markdown_include_js_1.registerMarkdownInclude)(md);
// Renderer for plugin_block tokens
md.renderer.rules['plugin_block'] = (tokens, idx, _options, env) => {
    const token = tokens[idx];
    const def = (0, registry_js_1.getDefinition)(token.info);
    if (!def)
        return '';
    const args = token.meta?.args ?? null;
    return def.render(args, token.content || null, env);
};
// Renderer for plugin_inline tokens
md.renderer.rules['plugin_inline'] = (tokens, idx, _options, env) => {
    const token = tokens[idx];
    const def = (0, registry_js_1.getDefinition)(token.info);
    if (!def)
        return '';
    const args = token.meta?.args ?? null;
    return def.render(args, token.content || null, env);
};
exports.default = md;
//# sourceMappingURL=index.js.map