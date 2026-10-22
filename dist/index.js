"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KATEX_VERSION = exports.VERSION = exports.resolveIncludePath = exports.maskInertMarkdown = exports.md = exports.MAX_KATEX_OUTPUT = exports.MAX_CHEM_TOTAL = exports.MAX_TEX_TOTAL = exports.themeSwatch = exports.themeInfo = exports.isThemeId = exports.DEFAULT_THEME = exports.THEMES = exports.prepareSources = exports.register = void 0;
exports.createMarkdown = createMarkdown;
require("katex/contrib/mhchem");
const markdown_it_1 = __importDefault(require("markdown-it"));
const markdown_it_anchor_1 = __importDefault(require("markdown-it-anchor"));
const markdown_it_container_1 = __importDefault(require("markdown-it-container"));
const markdown_it_footnote_1 = __importDefault(require("markdown-it-footnote"));
const footnote_tail_js_1 = require("./rules/footnote-tail.js");
const task_lists_js_1 = require("./rules/task-lists.js");
const env_js_1 = require("./env.js");
const markdown_it_mark_1 = __importDefault(require("markdown-it-mark"));
const markdown_it_sub_1 = __importDefault(require("markdown-it-sub"));
const markdown_it_sup_1 = __importDefault(require("markdown-it-sup"));
const markdown_it_ins_1 = __importDefault(require("markdown-it-ins"));
const markdown_it_task_lists_1 = __importDefault(require("markdown-it-task-lists"));
const markdown_it_katex_1 = __importDefault(require("@traptitech/markdown-it-katex"));
const markdown_it_cjk_breaks_1 = __importDefault(require("markdown-it-cjk-breaks"));
const block_dispatcher_js_1 = require("./rules/block-dispatcher.js");
const inline_dispatcher_js_1 = require("./rules/inline-dispatcher.js");
const registry_js_1 = require("./registry.js");
const html_js_1 = require("./html.js");
const attrs_js_1 = require("./plugins/attrs.js");
const nyml_body_js_1 = require("./nyml-body.js");
const span_js_1 = require("./plugins/span.js");
const toc_js_1 = require("./plugins/toc.js");
const attrs_js_2 = require("./plugins/attrs.js");
const markdown_include_js_1 = require("./plugins/markdown-include.js");
const imsize_js_1 = require("./plugins/imsize.js");
const cjk_js_1 = require("./plugins/cjk.js");
require("./plugins/test.js");
require("./plugins/emoji.js");
require("./plugins/space.js");
require("./plugins/youtube.js");
require("./plugins/mermaid.js");
require("./plugins/smiles.js");
require("./plugins/chart.js");
require("./plugins/qrcode.js");
require("./plugins/yaml.js");
require("./plugins/nyml.js");
var registry_js_2 = require("./registry.js");
Object.defineProperty(exports, "register", { enumerable: true, get: function () { return registry_js_2.register; } });
var prepare_sources_js_1 = require("./prepare-sources.js");
Object.defineProperty(exports, "prepareSources", { enumerable: true, get: function () { return prepare_sources_js_1.prepareSources; } });
var themes_js_1 = require("./themes.js");
Object.defineProperty(exports, "THEMES", { enumerable: true, get: function () { return themes_js_1.THEMES; } });
Object.defineProperty(exports, "DEFAULT_THEME", { enumerable: true, get: function () { return themes_js_1.DEFAULT_THEME; } });
Object.defineProperty(exports, "isThemeId", { enumerable: true, get: function () { return themes_js_1.isThemeId; } });
Object.defineProperty(exports, "themeInfo", { enumerable: true, get: function () { return themes_js_1.themeInfo; } });
Object.defineProperty(exports, "themeSwatch", { enumerable: true, get: function () { return themes_js_1.themeSwatch; } });
/**
 * TeX characters rendered per document, and of them inside `\ce{…}`/`\pu{…}`
 * arguments (4,000 small reactions are ~80,000).
 */
exports.MAX_TEX_TOTAL = 1000000;
exports.MAX_CHEM_TOTAL = 100000;
/**
 * KaTeX HTML per document: cost follows output (1 MB of arrays was 204 MB in
 * 52 s: round 21, H7). 5,000 display formulas of a textbook are ~45 MB.
 */
exports.MAX_KATEX_OUTPUT = 64000000;
/**
 * Build an orz-markdown parser/renderer: a markdown-it instance with exactly
 * the configuration of the shared `md` (options, plugins, containers, rules).
 * Each instance has its own options and rule chains, so `md.set()` / `md.use()`
 * by a host change only that instance. The `{{name}}` plugin registry
 * (`register()`) is global by design: plugins registered by a host apply to
 * every instance. `registerPlugins: false` builds a parser that leaves the
 * registry's definitions bound to the shared `md` (the carrier kit's private
 * parser).
 */
function createMarkdown(registerPlugins = true) {
    const md = new markdown_it_1.default({
        // allow raw HTML tags in source text. disabling this (the default) causes
        // tags like `<div>...</div>` to be escaped into `&lt;div&gt;`.
        html: true,
        linkify: true,
        typographer: true,
    });
    // Official plugins (anchor must be first: TOC depends on its id generation)
    // A heading with no text (`## {{emoji smile}}`) got `id=""` and then `id="-1"`;
    // it gets "section" (numbered like any repeat). Every other id is unchanged.
    const anchorSlug = markdown_it_anchor_1.default.defaults.slugify;
    const slugState = new WeakMap();
    function uniqueSlug(state, base, hasOwnId = false) {
        const st = slugsFor(state);
        // Taken: assigned already, or reserved by an {{attrs}} id. A heading with its
        // own attrs id never shows its automatic slug; it spends one as 1.6.3 did —
        // the first free among assigned slugs only — so later same-titled headings
        // keep their numbering (round 20, B-M1; round 21, B-M1a). Each predicate has
        // its own "next k": both only grow, so every heading is O(1) amortised
        // (an own-id heading that never advanced was quadratic: round 21, B-H1).
        const taken = hasOwnId ? (s) => st.assigned.has(s) : (s) => st.assigned.has(s) || st.taken.has(s);
        const next = hasOwnId ? st.nextOwn : st.next;
        let slug = base;
        if (taken(base)) {
            let k = next.get(base) ?? 1;
            while (taken(`${base}-${k}`))
                k++;
            next.set(base, k + 1);
            slug = `${base}-${k}`;
        }
        st.assigned.add(slug);
        return slug;
    }
    function slugsFor(state) {
        let st = slugState.get(state);
        if (!st) {
            st = { taken: new Set(), assigned: new Set(), next: new Map(), nextOwn: new Map() };
            slugState.set(state, st);
            // Ids `{{attrs[#…]}}` will set later are taken already, so an automatic id
            // never duplicates one (round 19, M1) — only ids that will be written: the
            // last id of each marker run, on a block that renders a tag (a tight
            // list's paragraph is hidden: round 21, B-M1b).
            const tokens = state.tokens;
            for (let i = 0; i < tokens.length; i++) {
                const id = ownAttrsId(tokens, i);
                if (id != null)
                    st.taken.add(id);
            }
        }
        return st;
    }
    /** The id `attrs_resolve` will give the block opened before inline token `i`, if any. */
    function ownAttrsId(tokens, i) {
        const t = tokens[i];
        const target = tokens[i - 1];
        if (t?.type !== 'inline' || !target || target.nesting !== 1 || target.hidden)
            return null;
        let id = null;
        for (const c of t.children ?? []) {
            const args = c.type === 'plugin_inline' && c.info === 'attrs' ? c.meta?.args : null;
            if (args)
                for (const [k, v] of (0, attrs_js_1.parseAttrs)(args))
                    if (k === 'id')
                        id = v;
        }
        return id;
    }
    md.use(markdown_it_anchor_1.default);
    // markdown-it-anchor's core rule, ported for the options used here (no
    // permalink, no callback): its per-heading `tokens.indexOf(heading)` was
    // quadratic even for distinct titles (100,000 headings: 21 s, in 1.6.3 too;
    // round 19, H1). Same ids: the first free base-k; tabindex "-1".
    md.core.ruler.at('anchor', (state) => {
        const tokens = state.tokens;
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (token.type !== 'heading_open')
                continue;
            const title = (tokens[i + 1]?.children ?? [])
                .filter((t) => t.type === 'text' || t.type === 'code_inline')
                .map((t) => t.content)
                .join('');
            // A heading with its own {{attrs[#…]}} id still spends its automatic slug,
            // as in 1.6.3 (later same-titled headings keep their -1, -2 numbering, so
            // existing links hold); the attrs id overrides it afterwards.
            const preset = token.attrGet('id');
            const slug = uniqueSlug(state, preset ?? (anchorSlug(title) || 'section'), ownAttrsId(tokens, i + 1) != null);
            token.attrSet('id', slug);
            // Recorded so prepareSources can tell an automatic id from an authored one.
            token.meta = { ...(token.meta ?? {}), orzAutoId: slug };
            token.attrSet('tabindex', '-1');
        }
    });
    /** A CSS length with its unit (`30%`, `12em`, `200px`): `max-width: 12` is invalid CSS the browser drops. */
    const CSS_LENGTH = /^\d+(\.\d+)?(px|em|rem|%|ch|ex|vw|vh|vmin|vmax|pt|pc|cm|mm|in)$/;
    /** A CSS grid track size: a length, `fr`, `auto`, `min-content`, `max-content`. */
    const TRACK = '(?:\\d+(?:\\.\\d+)?(?:px|em|rem|%|ch|ex|vw|vh|vmin|vmax|pt|pc|cm|mm|in|fr)?|auto|min-content|max-content)';
    const CSS_TRACK = new RegExp(`^(${TRACK}|minmax\\(${TRACK},${TRACK}\\)|repeat\\(\\d{1,2},(?:${TRACK}|minmax\\(${TRACK},${TRACK}\\))\\))$`);
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
                if (width) {
                    const w = (0, html_js_1.escapeAttr)(width);
                    // Only a CSS length reaches the style attribute: `1px;position:fixed`
                    // would otherwise add declarations of its own (round 12).
                    if (!CSS_LENGTH.test(width))
                        return `<div class="left" data-orz-container="left ${w}">\n`;
                    return `<div class="left" style="max-width: ${w}; width: ${w}" data-orz-container="left ${w}">\n`;
                }
                return '<div class="left">\n';
            }
            return '</div>\n';
        },
    });
    md.use(markdown_it_container_1.default, 'right');
    md.use(markdown_it_container_1.default, 'center');
    // Interactive containers
    md.use(markdown_it_container_1.default, 'spoil', {
        render(tokens, idx, _options, env) {
            if (tokens[idx].nesting === 1) {
                // Extract label from params: "::: spoil My Title" → "My Title". The label
                // is inline Markdown (emphasis, math, code), rendered in its own env (the
                // document env would make markdown-it-footnote repeat its list here).
                const label = tokens[idx].info.trim().slice('spoil'.length).trim();
                if (!label)
                    return '<details class="spoil"><summary>Show/hide</summary>\n';
                // data-orz-container keeps the raw label so copy-as-Markdown can restore
                // formatting the rendered <summary> no longer shows as source.
                // (On <summary>, the label element, so <details class="spoil"> stays
                // byte-identical for hosts that match it.)
                return `<details class="spoil"><summary data-orz-container="spoil ${(0, html_js_1.escapeAttr)(label)}">${md.renderInline(label, (0, env_js_1.inlineEnv)(env))}</summary>\n`;
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
                return `<div class="tab" data-label="${(0, html_js_1.escapeAttr)(label)}">\n`;
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
                    // Spaces inside `repeat(6, 1fr)` / `minmax(…)` do not separate tracks.
                    const parts = rest.replace(/\s*([(,])\s*/g, '$1').replace(/\s+\)/g, ')').split(/\s+/);
                    // Plain numbers and CSS track sizes only (see `::: left`).
                    if (!parts.every((p) => /^\d+(\.\d+)?$/.test(p) || CSS_TRACK.test(p)))
                        return `<div class="cols" data-orz-container="cols ${(0, html_js_1.escapeAttr)(rest)}">\n`;
                    const cols = parts.map(p => /^\d+(\.\d+)?$/.test(p) ? `${p}fr` : p).join(' ');
                    return `<div class="cols" style="grid-template-columns: ${(0, html_js_1.escapeAttr)(cols)}" data-orz-container="cols ${(0, html_js_1.escapeAttr)(rest)}">\n`;
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
            const info = tokens[idx].info.trim();
            const name = info.split(/\s+/)[0];
            if (tokens[idx].nesting === 1)
                return `<div class="${name}" data-orz-container="${(0, html_js_1.escapeAttr)(info)}">\n`;
            return '</div>\n';
        },
    });
    md.use(markdown_it_footnote_1.default);
    // The same footnote list, appended in place (the plugin's own tail rule is quadratic).
    md.core.ruler.at('footnote_tail', footnote_tail_js_1.footnoteTail);
    // Inline renders inside the document (span bodies, spoil labels) carry no
    // footnotes of their own (see env.ts).
    for (const name of ['footnote_inline', 'footnote_ref']) {
        const rule = md.inline.ruler.__rules__.find((r) => r.name === name);
        if (rule) {
            const fn = rule.fn;
            rule.fn = (state, silent) => (state.env?.['__orzNoFootnotes'] ? false : fn(state, silent));
        }
    }
    // Footnote breadcrumbs for copy-as-Markdown: the rendered "[1]" has lost the
    // author's label, so the reference carries its directive (`[^note]`, or
    // `^[text]` for an inline footnote) and each definition its label.
    {
        const rules = md.renderer.rules;
        const ref = rules['footnote_ref'];
        rules['footnote_ref'] = (tokens, idx, options, env, self) => {
            const html = ref(tokens, idx, options, env, self);
            const meta = tokens[idx].meta;
            const entry = env.footnotes?.list?.[meta.id];
            const directive = meta.label !== undefined ? `[^${meta.label}]` : entry?.content !== undefined ? `^[${entry.content}]` : null;
            return directive ? html.replace('<sup class="footnote-ref"', `<sup class="footnote-ref" data-md="${(0, html_js_1.escapeAttr)(directive)}"`) : html;
        };
        const open = rules['footnote_open'];
        rules['footnote_open'] = (tokens, idx, options, env, self) => {
            const html = open(tokens, idx, options, env, self);
            const label = env.footnotes?.list?.[tokens[idx].meta.id]?.label;
            return label !== undefined ? html.replace('class="footnote-item"', `class="footnote-item" data-footnote-label="${(0, html_js_1.escapeAttr)(label)}"`) : html;
        };
    }
    (0, imsize_js_1.registerImsize)(md);
    md.use(markdown_it_mark_1.default);
    md.use(markdown_it_sub_1.default);
    md.use(markdown_it_sup_1.default);
    md.use(markdown_it_ins_1.default);
    md.use(markdown_it_task_lists_1.default);
    md.core.ruler.at('github-task-lists', task_lists_js_1.taskLists); // the same output, linear (rules/task-lists.ts)
    // katex is pinned exactly in package.json, and the plugin's own `^0.16.0` is
    // satisfied by that version, so one KaTeX copy renders and KATEX_VERSION (and the
    // preview-frame stylesheet) match it (round 16, L6). Passing an instance via the
    // plugin's `katex` option is avoided: ESM and CJS loaders resolve `katex` and
    // `katex/contrib/mhchem` to different builds, and `\ce` would land on the other.
    md.use(markdown_it_katex_1.default, { enableMhchem: true, strict: 'ignore' }); // 'ignore': no console line per "\\\\" (round 19)
    // KaTeX's builder is quadratic in formula length, and macro definitions expand
    // a short formula without a bound `maxExpand` enforces (a 4 KB \def chain took
    // 267 s; round 19, H6). A formula over MAX_TEX characters, or one that defines
    // macros, renders as KaTeX renders an error: its source, escaped.
    const MAX_TEX = 10000;
    const TEX_DEFINES = /\\(def|gdef|edef|xdef|let|futurelet|newcommand|renewcommand|providecommand|DeclareMathOperator|newenvironment)(?![A-Za-z])/;
    /**
     * What mhchem expands: the length of every `\ce{…}` / `\pu{…}` argument (not
     * the whole formula that mentions one: round 21, B-L1). An unclosed argument
     * runs to the end. Linear: one pass, a depth counter.
     */
    function chemLength(tex) {
        let total = 0;
        // A nested `\ce` is inside the outer argument: the scan resumes after it.
        const re = /\\(?:ce|pu)(?![A-Za-z])\s*\{/g;
        for (let m = re.exec(tex); m; m = re.exec(tex)) {
            let depth = 1, i = m.index + m[0].length;
            const start = i;
            for (; i < tex.length && depth > 0; i++) {
                const c = tex[i];
                if (c === '\\')
                    i++;
                else if (c === '{')
                    depth++;
                else if (c === '}')
                    depth--;
            }
            total += i - start;
            re.lastIndex = i;
        }
        return total;
    }
    for (const rule of ['math_inline', 'math_block']) {
        const original = md.renderer.rules[rule];
        if (!original)
            continue;
        md.renderer.rules[rule] = (tokens, idx, options, env, self) => {
            const tex = tokens[idx].content;
            // Per render, total TeX (and mhchem `\ce`/`\pu`, which expands ~500×) is
            // bounded too: one 10 KB `\ce` was 5 MB of output, 1 MB took 227 s (round 20, H5).
            const root = (0, env_js_1.rootEnv)(env);
            const used = root['__orzTex'] ?? 0;
            const chem = chemLength(tex);
            const usedChem = root['__orzChem'] ?? 0;
            const usedOut = root['__orzKatexOut'] ?? 0;
            const overBudget = used + tex.length > exports.MAX_TEX_TOTAL || usedChem + chem > exports.MAX_CHEM_TOTAL || usedOut > exports.MAX_KATEX_OUTPUT;
            if (tex.length <= MAX_TEX && !TEX_DEFINES.test(tex) && !overBudget) {
                root['__orzTex'] = used + tex.length;
                root['__orzChem'] = usedChem + chem;
                const html = original(tokens, idx, options, env, self);
                root['__orzKatexOut'] = usedOut + html.length;
                return html;
            }
            const why = tex.length > MAX_TEX ? 'formula too long' : overBudget ? 'too much math in one document' : 'macro definitions are not supported';
            const span = `<span class="katex-error" title="${(0, html_js_1.escapeAttr)(why)}">${(0, html_js_1.escapeHtml)(tex)}</span>`;
            return rule === 'math_block' ? `<p class="katex-block">${span}</p>\n` : span;
        };
    }
    // Chinese/Japanese/Korean: no stray space where a line wraps between two CJK
    // characters, emphasis that works next to CJK punctuation, and bare URLs that
    // stop before CJK text (see plugins/cjk.ts).
    md.use(markdown_it_cjk_breaks_1.default);
    (0, cjk_js_1.registerCjk)(md);
    // Custom dispatchers
    md.block.ruler.after('blockquote', 'plugin_block_dispatcher', block_dispatcher_js_1.blockDispatcher, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
    md.inline.ruler.after('escape', 'plugin_inline_dispatcher', inline_dispatcher_js_1.inlineDispatcher);
    // Register plugins that need access to the md instance.
    // Order matters: attrs must register before toc so the `attrs_resolve` core
    // rule runs before `toc_resolve` — TOC links must use the final heading ids,
    // including custom ids set via {{attrs[#...]}} (which override the
    // markdown-it-anchor slug).
    (0, span_js_1.registerSpan)(md, registerPlugins);
    (0, attrs_js_2.registerAttrs)(md, registerPlugins);
    (0, toc_js_1.registerToc)(md, registerPlugins);
    (0, markdown_include_js_1.registerMarkdownInclude)(md, registerPlugins);
    // A UTF-8 byte-order mark (files saved by Windows Notepad) is not content: left
    // in place it hides a directive or heading on the first line from the parser.
    md.core.ruler.after('normalize', 'orz_strip_bom', (state) => {
        if (state.src.charCodeAt(0) === 0xfeff)
            state.src = state.src.slice(1);
    });
    // Per-document render state. A host may reuse one `env` object across renders,
    // so counters that must be unique per document (the nyml island ids) are reset
    // at the start of every top-level parse (file includes are spliced into the
    // same parse, so they keep counting).
    // Reference links repeat their definition's URL and title at every use: one
    // 10 KB definition used 80,000 times was 401 MB of output (markdown-it and
    // 1.6.3 alike; round 19, H7). Link and image targets may total at most 4× the
    // source plus 1 MB; past that, links render as their text.
    // After footnote_tail, so links inside footnotes (`^[…]`) count too (round 20,
    // H3); included files count toward the base (M3).
    md.core.ruler.after('footnote_tail', 'orz_link_budget', (state) => {
        let budget = 4 * (state.src.length + (state.env?.['__orzIncluded'] ?? 0)) + 1000000;
        for (const block of state.tokens) {
            if (block.type !== 'inline' || !block.children)
                continue;
            for (const t of block.children) {
                if (t.type !== 'link_open' && t.type !== 'image')
                    continue;
                budget -= (t.attrGet('href') ?? t.attrGet('src') ?? '').length + (t.attrGet('title') ?? '').length;
                if (budget >= 0)
                    continue;
                if (t.type === 'image') {
                    t.attrSet('src', '');
                    t.attrs = (t.attrs ?? []).filter(([k]) => k !== 'title');
                }
                else {
                    t.attrSet('href', '');
                    t.attrs = (t.attrs ?? []).filter(([k]) => k !== 'title');
                }
            }
        }
    });
    // Link references the host seeded in `env.references` (a markdown-it idiom)
    // stay; those a previous render defined go (round 21, B-M3). Each render
    // records the keys it added, and the next render on that object deletes only
    // those, so a key the host adds between renders survives too (round 22, L4).
    const renderRefs = new WeakMap();
    const refsBefore = new WeakMap();
    md.core.ruler.before('normalize', 'orz_render_state', (state) => {
        // Inline renders (a span body, a spoil label) share the document's env and
        // must not reset it.
        if (state.inlineMode)
            return;
        const env = state.env;
        // Footnotes too: a reused env listed the previous document's notes (round 19, L5).
        if (env) {
            delete env['__orzNymlCount'];
            delete env['__orzQrOutput'];
            delete env['__orzIncluded'];
            delete env['__orzIncludeCache'];
            delete env['__orzTex'];
            delete env['__orzChem'];
            delete env['__orzKatexOut'];
            delete env['__orzIncludeRead'];
            delete env['footnotes'];
            const refs = env['references'];
            if (refs && typeof refs === 'object') {
                // Only while a key still holds what the render put there: a value the
                // host replaced is the host's (round 23, F5).
                for (const [k, v] of renderRefs.get(refs) ?? [])
                    if (refs[k] === v)
                        delete refs[k];
                refsBefore.set(refs, new Set(Object.keys(refs)));
            }
        }
    });
    md.core.ruler.push('orz_render_state_end', (state) => {
        const refs = state.env?.['references'];
        if (state.inlineMode || !refs || typeof refs !== 'object')
            return;
        const before = refsBefore.get(refs) ?? new Set();
        const r = refs;
        renderRefs.set(refs, new Map(Object.keys(r).filter((k) => !before.has(k)).map((k) => [k, r[k]])));
    });
    // Renderer for plugin_block tokens
    md.renderer.rules['plugin_block'] = (tokens, idx, _options, env) => {
        const token = tokens[idx];
        const def = (0, registry_js_1.getDefinition)(token.info);
        if (!def)
            return '';
        // FC-18 §5: a nyml block whose kind is `document` (the document header)
        // renders nothing and takes no `nyml-data` number. The kind is read from the
        // same raw body `scanNymlBlocks` reads, so renderer and readHeader agree.
        if (token.info === 'nyml') {
            const raw = token.meta?.rawBody ?? token.content ?? '';
            if ((0, nyml_body_js_1.parseNymlBody)(raw).kind === 'document')
                return '';
        }
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
        const html = def.render(args, token.content || null, env);
        // A QR code alone in its paragraph is a "scan me" code: full size. One inside
        // a sentence is drawn at text size (common.css) and expands on tap.
        if ((token.info === 'qr' || token.info === 'qrcode') && tokens.every((t, i) => i === idx || t.type === 'softbreak' || (t.type === 'text' && !t.content.trim()))) {
            return html.replace('<span class="qrcode"', '<span class="qrcode qrcode--standalone"');
        }
        return html;
    };
    return md;
}
const md = createMarkdown();
exports.md = md;
exports.default = md;
// Document metadata (license, author, …) for the self-contained formats. The
// one implementation shared by orz-mdhtml / orz-slides / orz-paged.
__exportStar(require("./doc-meta.js"), exports);
__exportStar(require("./nyml-blocks.js"), exports);
var source_scan_js_1 = require("./source-scan.js");
Object.defineProperty(exports, "maskInertMarkdown", { enumerable: true, get: function () { return source_scan_js_1.maskInertMarkdown; } });
var markdown_include_js_2 = require("./plugins/markdown-include.js");
Object.defineProperty(exports, "resolveIncludePath", { enumerable: true, get: function () { return markdown_include_js_2.resolveIncludePath; } });
var version_js_1 = require("./version.js");
Object.defineProperty(exports, "VERSION", { enumerable: true, get: function () { return version_js_1.VERSION; } });
Object.defineProperty(exports, "KATEX_VERSION", { enumerable: true, get: function () { return version_js_1.KATEX_VERSION; } });
//# sourceMappingURL=index.js.map