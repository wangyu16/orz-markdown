"use strict";
/**
 * Pre-processes a markdown source string by resolving URL-based markdown
 * includes BEFORE rendering. markdown-it rendering is synchronous, so a URL
 * fetch cannot happen inside a render rule; this async pre-pass inlines the
 * referenced markdown up front, and the result renders normally.
 *
 * Directive syntax (anywhere in live text — not in code, not escaped, not in a
 * link destination):
 *
 *     {{markdown https://host/path.md}}
 *     {{md-include https://host/path.md}}
 *
 * Each directive is replaced by the fetched markdown (which may itself contain
 * includes — resolved recursively up to `maxDepth`, with an ancestor-chain
 * cycle guard). The fetched text is block content: it is placed as its own
 * blocks, so a directive in the middle of a paragraph splits the paragraph
 * there, and a directive inside a blockquote or list item keeps its content in
 * that container.
 *
 * A directive is LEFT IN PLACE (never a hard error) when its fetch fails, its
 * host is not allowed, it would exceed `maxSize`, or splicing it would change
 * how the host document around it parses (see "Splice safety" below).
 *
 * Directives are located from the renderer's own tokens, so a directive inside
 * code, an HTML comment, a raw HTML block, a math block or another directive's
 * body is inert here exactly as it is when rendering.
 *
 * Splice safety. Includes come from trusted sources (CLAIMS M.21); these checks
 * are defence in depth against accidents and a compromised host. Fetched text
 * can never make the host read
 * local files (every file-include spelling in it is neutralized), and it can
 * never change the host document around it: the spliced document is parsed
 * once more against a reference in which each include is an opaque
 * placeholder paragraph, and every host token — before, around and after the
 * includes, with inline content and link targets — must come out the same. An
 * include that would flip a later code example live, swallow the following
 * text into a list item or footnote, close the host's container, or redefine
 * the host's link references is refused. An unclosed code fence at the end of
 * fetched text (the common authoring slip) is closed first, and raw HTML
 * outside the allowlist is removed block by block (M.20).
 *
 * The network transport is INJECTABLE (`opts.fetcher`) and can be restricted to
 * an allowlist of hosts (`opts.allowedHosts`) — important when resolving
 * host-authored content server-side, where an unrestricted fetch is an SSRF
 * vector. Outside a browser nothing is fetched without `allowedHosts` or a
 * `fetcher`; in a page, an empty list allows every host (M.21).
 */
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareSources = prepareSources;
/**
 * Is `closer` the closing marker of the container `opener` opens? Same column
 * and quote depth, at least as many colons: a spoil auto-closed at the end of
 * a quote or list item is followed by an OUTER container's closer (round 23, F4).
 */
function ownCloser(opener, closer) {
    const o = /^([ \t>]*(?:(?:[-+*]|\d{1,9}[.)])[ \t]+)*)(:{3,})/.exec(opener);
    const c = /^([ \t>]*)(:{3,})\s*$/.exec(closer);
    if (!o || !c)
        return false;
    const column = (p) => p.replace(/(?:[-+*]|\d{1,9}[.)])(?=[ \t])/g, (m) => ' '.repeat(m.length)).replace(/[ \t]+$/, '').length;
    const quotes = (p) => p.replace(/[^>]/g, '').length;
    return column(o[1]) === column(c[1]) && quotes(o[1]) === quotes(c[1]) && c[2].length >= o[2].length;
}
/** Every inline token below `t`, at any depth (image alt text holds tokens too: round 24, M1). */
function* descendants(t) {
    for (const c of t.children ?? []) {
        yield c;
        yield* descendants(c);
    }
}
/** Only the file-access keys of a render env, copied (a parse writes into its env). */
function fileEnv(e) {
    return e ? { markdownBasePath: e.markdownBasePath, markdownIncludeRoot: e.markdownIncludeRoot, readFile: e.readFile } : {};
}
/** Does the text hold a file include the renderer would try to read? */
function hasLocalInclude(text) {
    // As the renderer decides: an empty target or any `scheme://` is never read (round 24, F4).
    return parser().parse(text, {}).some((t) => t.type === 'plugin_block' && INCLUDE_ALIASES.has(t.info) && t.content.trim() !== '' && !/^[a-z][a-z0-9+.-]*:\/\//i.test(t.content.trim()));
}
const ascii_js_1 = require("./ascii.js");
const source_scan_js_1 = require("./source-scan.js");
const doc_meta_js_1 = require("./doc-meta.js");
const toc_js_1 = require("./plugins/toc.js");
const qrcode_js_1 = require("./plugins/qrcode.js");
const index_js_1 = require("./index.js");
const indexModule = __importStar(require("./index.js"));
/**
 * Remote content must never make the host renderer read local files. Every
 * file-include directive in fetched text — any spelling the block dispatcher
 * accepts (`{{md /x}}`, `{{md/x}}`, `{{md[a] /x}}`, `{{markdown …}}`,
 * `{{md-include …}}`) — is neutralized UNCONDITIONALLY by putting an
 * invisible U+2060 WORD JOINER after the braces. It renders identically (live
 * text or code example alike) but is no longer a plugin name, so no scanner /
 * renderer disagreement about what is "live" can reopen the hole (round 5).
 */
const LOCAL_INCLUDE = /\{\{(?=(?:markdown|md-include|md)(?![A-Za-z0-9-])(?!\s+https?:\/\/))/g;
function neutralizeLocalIncludes(text) {
    let out = text.replace(LOCAL_INCLUDE, '{{\u2060');
    // A "{{" left open at the end could join with what follows it in the host.
    const lastOpen = out.lastIndexOf('{{');
    if (lastOpen >= 0 && out.indexOf('}}', lastOpen) < 0 && out[lastOpen + 2] !== '\u2060') {
        out = out.slice(0, lastOpen + 2) + '\u2060' + out.slice(lastOpen + 2);
    }
    return out;
}
function parser() {
    return indexModule.md;
}
/** A per-call marker the fetched text cannot know (round 7, H-1: a fixed one was forgeable). */
function nonce() {
    return 'orz-include-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
/** Offsets of every line start (text is LF-normalized). */
function lineStartsOf(text) {
    const starts = [0];
    for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1))
        starts.push(i + 1);
    return starts;
}
/** Line index of offset `pos` (binary search). */
function lineOf(starts, pos) {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= pos)
            lo = mid;
        else
            hi = mid - 1;
    }
    return lo;
}
/** The renderer's view of a source: BOM removed, line endings LF. */
function asRendered(text) {
    return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}
/** Fetched text as one block of lines: normalized, no blank lines at the edges. */
function normalizeFetched(text) {
    return asRendered(text).replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '');
}
/** Close an unclosed code fence at the end of fetched text — at its own
 *  indentation, so a fence inside a list item or quote closes there. Anything
 *  else left open is left to the whole-document check, which refuses it. */
function closeTrailingFence(text, mark) {
    const lineCount = text.split('\n').length;
    // Closed when the marker paragraph after it is top-level AND no fence runs
    // past the text (a fence in a list item closes implicitly where the item
    // ends, swallowing the blank lines after it into the code).
    const closes = (t, lines) => {
        const tokens = parser().parse(t + '\n\n' + mark + '\n', {});
        return tokens.some((k) => k.type === 'inline' && k.content === mark && k.level === 1)
            && !tokens.some((k) => k.type === 'fence' && k.map !== null && k.map[1] > lines);
    };
    if (closes(text, lineCount))
        return text;
    const lastFence = [...parser().parse(text, {})].reverse().find((t) => t.type === 'fence');
    if (!lastFence?.markup || !lastFence.map)
        return text;
    const line = text.split('\n')[lastFence.map[0]] ?? '';
    const at = line.indexOf(lastFence.markup);
    // "> - ```" closes as ">   ```": quote markers repeat, list markers become indentation.
    const prefix = at > 0 ? line.slice(0, at).replace(/(?:[-+*]|\d{1,9}[.)])(?=[ \t])/g, (m) => ' '.repeat(m.length)) : '';
    for (const closer of prefix ? [prefix + lastFence.markup, lastFence.markup] : [lastFence.markup]) {
        if (closes(text + '\n' + closer, lineCount + 1))
            return text + '\n' + closer;
    }
    return text;
}
const INCLUDE_ALIASES = new Set(['markdown', 'md', 'md-include']);
const DIRECTIVE = /\{\{(?:markdown|md-include|md)\s+(https?:\/\/[^\s}]+)\s*\}\}/g;
/** Private-use placeholders for directives while checking inline nesting. */
const PH_OPEN = String.fromCharCode(0xe000), PH_CLOSE = String.fromCharCode(0xe001);
/**
 * Every live URL include in `text` (LF-normalized), in order, located from the
 * renderer's own tokens: a block directive (`{{md URL}}` on its own line) is a
 * `plugin_block` token; a directive inside a paragraph is in an `inline`
 * token's content, outside its code spans, not escaped, and not a link
 * destination or attribute value. (A regex masker disagreed with the renderer
 * in some list/quote/fence combinations: round 7, M-1.)
 *
 * Fetched text is block content, so a directive inside a paragraph splits the
 * paragraph. That is only allowed at the paragraph's top inline level — inside
 * `**…**` or link text the split would break the host's own emphasis or link
 * (round 8, M5) — and never in a heading or table cell. Such a directive is
 * located but left in place.
 */
function locateDirectives(text, env) {
    if (text.indexOf('{{') < 0)
        return [];
    const starts = lineStartsOf(text);
    const lineEnd = (line) => (line < starts.length ? starts[line] : text.length + 1);
    const found = new Map();
    const tokens = parser().parse(text, env);
    for (let k = 0; k < tokens.length; k++) {
        const token = tokens[k];
        if (!token.map)
            continue;
        const from = starts[token.map[0]] ?? text.length;
        if (token.type === 'plugin_block' && INCLUDE_ALIASES.has(token.info)) {
            // Only the directive's own line: a file include or args form has no URL
            // match there, and searching on through the document per token was
            // quadratic (round 18, H1).
            const line = text.slice(from, Math.min(text.length, lineEnd(token.map[0] + 1)));
            const m = new RegExp(DIRECTIVE.source).exec(line);
            if (m && m[1] === token.content.trim()) {
                found.set(from + m.index, { index: from + m.index, full: m[0], url: m[1], splittable: true });
            }
            continue;
        }
        if (token.type !== 'inline' || token.content.indexOf('{{') < 0)
            continue;
        const content = token.content;
        const masked = (0, source_scan_js_1.maskInlineCode)(content);
        const inParagraph = tokens[k - 1]?.type === 'paragraph_open';
        const to = lineEnd(token.map[1]);
        const live = [];
        for (const m of content.matchAll(new RegExp(DIRECTIVE.source, 'g'))) {
            const at = m.index ?? 0;
            if (m[0].indexOf('\n') >= 0)
                continue; // spread over lines: not verbatim in the source, stays unresolved
            if (!masked.startsWith('{{', at))
                continue; // inside a code span
            let slashes = 0;
            for (let j = at - 1; j >= 0 && content[j] === '\\'; j--)
                slashes++;
            if (slashes % 2 === 1)
                continue; // escaped
            if (/[(<"'=]/.test(content[at - 1] ?? ''))
                continue; // link destination / attribute
            live.push({ at, m });
        }
        if (live.length === 0)
            continue;
        // A nested paragraph's lazy continuation line (`> a` then `b`, a footnote
        // or list item continued at column 0) carries no container prefix: split
        // there, both the fetched text and the host text after it would leave the
        // container (final check, F1). Such a directive stays unresolved.
        const nested = (tokens[k - 1]?.level ?? 0) > 0; // in a list item, quote, container or footnote definition
        const firstPrefix = (text.slice(from, lineEnd(token.map[0] + 1)).match(CONTAINER_PREFIX) ?? [''])[0];
        const lazyLine = (pos) => {
            if (!nested)
                return false;
            const ls = text.lastIndexOf('\n', pos - 1) + 1;
            if (ls === from)
                return false;
            const prefix = (text.slice(ls, pos).match(CONTAINER_PREFIX) ?? [''])[0];
            return prefix.replace(/[^>]/g, '').length < firstPrefix.replace(/[^>]/g, '').length || prefix.length === 0;
        };
        const depth = inParagraph ? inlineDepths(content, live.map((l) => [l.at, l.m[0].length]), env) : [];
        let cursor = from;
        live.forEach(({ m }, n) => {
            // The inline content is the source minus block prefixes; a directive on
            // one line appears verbatim in the source, at or after the previous one.
            let pos = text.indexOf(m[0], cursor);
            while (pos >= 0 && pos < to && found.has(pos))
                pos = text.indexOf(m[0], pos + 1); // claimed by a block directive
            if (pos < 0 || pos >= to)
                return;
            found.set(pos, { index: pos, full: m[0], url: m[1], splittable: inParagraph && depth[n] === 0 && !lazyLine(pos) });
            cursor = pos + m[0].length;
        });
    }
    return [...found.values()].sort((a, b) => a.index - b.index);
}
/** For each `[offset, length]` directive in an inline `content`, the inline
 *  nesting depth it sits at (0 = top level of the paragraph). */
function inlineDepths(content, spans, env) {
    let marked = '';
    let last = 0;
    spans.forEach(([at, len], n) => {
        marked += content.slice(last, at) + PH_OPEN + n + PH_CLOSE;
        last = at + len;
    });
    marked += content.slice(last);
    const depths = spans.map(() => -1);
    const inline = parser().parse(marked, env).find((t) => t.type === 'inline');
    let depth = 0;
    for (const c of inline?.children ?? []) {
        if (c.type === 'text' || c.type === 'text_special') {
            for (const m of c.content.matchAll(new RegExp(PH_OPEN + '(\\d+)' + PH_CLOSE, 'g')))
                depths[Number(m[1])] = depth;
        }
        else {
            depth += c.nesting;
        }
    }
    return depths;
}
/**
 * Raw HTML in fetched text: an ALLOWLIST, not a model of the browser's parser.
 * Four rounds of hand-modelled balancing each missed a parser rule (self-closing
 * `<div/>`, foreign-content breakouts, comment states, raw-text elements,
 * unterminated tags: rounds 8–10). What matters is narrower and checkable: the
 * browser must never close a fetched element earlier than this model does,
 * because only then can a later fetched end tag (`</div>`, `</ul>`) close a
 * HOST container. So fetched raw HTML may only use
 *
 * - plain elements whose start tags pop nothing (below), in a strict tag syntax
 *   — every `<` must be a complete tag or a well-formed comment;
 * - list items, definition terms and table parts only in their own parent
 *   (`li` directly in `ul`/`ol`, `td` directly in `tr`, …), where their
 *   implied closing never reaches past the parent;
 * - no `<a>` inside a link, no `/>` on a non-void element, no event-handler
 *   attributes;
 *
 * and every element opened inside a Markdown container (paragraph, list item,
 * quote, emphasis, link, …) is closed before that container closes. Anything
 * else — SVG/MathML, `<script>`/`<style>`/`<textarea>`/`<plaintext>`, forms,
 * `<template>`, … — fails the check; the block holding it is removed (M.20).
 */
const ALLOWED_HTML = {
    // element: required parent among the raw elements, or null for "anywhere"
    div: null, span: null, p: null, b: null, i: null, em: null, strong: null, code: null, kbd: null, samp: null,
    var: null, sub: null, sup: null, mark: null, del: null, ins: null, s: null, u: null, small: null, abbr: null,
    cite: null, q: null, dfn: null, time: null, bdi: null, bdo: null, details: null, summary: null, figure: null,
    figcaption: null, blockquote: null, center: null, section: null, article: null,
    // no nav/main/header/footer/aside: landmarks in the host's accessibility tree (round 15, M-1)
    address: null, pre: null, ruby: null, rt: ['ruby'], rp: ['ruby'], strike: null, tt: null, big: null,
    h1: null, h2: null, h3: null, h4: null, h5: null, h6: null, a: null, video: null, audio: null, picture: null,
    ul: null, ol: null, li: ['ul', 'ol'], dl: null, dt: ['dl'], dd: ['dl'],
    table: null, caption: ['table'], colgroup: ['table'], thead: ['table'], tbody: ['table'], tfoot: ['table'],
    tr: ['table', 'thead', 'tbody', 'tfoot'], td: ['tr'], th: ['tr'],
};
const VOID_HTML = new Set(['br', 'hr', 'img', 'wbr', 'source', 'track', 'col', 'input']); // input: task-list checkboxes only (below)
const STRICT_TAG = /<(\/?)([A-Za-z][A-Za-z0-9]*)((?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/y;
const STRICT_COMMENT = /<!--(?!-?>)([\s\S]*?)-->/y;
/**
 * Attributes fetched raw HTML may carry. No `class` and no `style`: a class can
 * pick up the page's own fixed-position rules (`.qrcode-overlay`, or any class
 * of the host site), and allowed CSS properties still paint over neighbours
 * (`opacity`, huge `font-size`, comment-hidden negative margins) — round 13.
 * Policing values lost every round; the vectors are removed instead.
 */
const RAW_ATTRS = /^(id|title|lang|dir|role|hidden|translate|aria-label|border|clear|data-[a-z0-9-]+|href|src|srcset|sizes|alt|width|height|colspan|rowspan|scope|headers|align|valign|start|reversed|type|open|datetime|cite|name|rel|target|loading|decoding|controls|poster|preload|muted|loop|playsinline|media|srclang|kind|label|default|value|span|abbr|checked|disabled)$/i;
/** Attributes Markdown's own tokens may carry in fetched text (where
 *  `{{attrs[…]}}` lands): no `role`, `aria-*`, `contenteditable`, `accesskey`
 *  (round 15, M-1). `tabindex` only as the anchor plugin sets it. */
const TOKEN_ATTRS = /^(id|class|style|tabindex|href|src|alt|title|start|width|height|colspan|rowspan|align|reversed|type|value|lang|dir)$/;
/** Attributes that hold a URL: validated like a Markdown link (no `javascript:`). */
const URL_ATTRS = /^(href|src|cite|poster|srcset)$/i;
/** Ids the renderer gives out at render time (footnotes, data islands, the
 *  doc-meta island, preview-frame assets): fetched text cannot claim them. */
const RESERVED_ID = /^(fn(ref)?\d+(:\d+)?|nyml-data(-\d+)?|orz[\w-]*|hljs|mermaid|chart|smilesdrawer|katex|__orz[\w-]*)$/i; // orz*: every family global (orzPosterReadiness, …)
/** ARIA attributes that point at other elements by id (they could re-parent host content in the accessibility tree). */
const ARIA_REFS = /^aria-(owns|controls|activedescendant|flowto|details|labelledby|describedby|errormessage)$/;
/** An id as the browser matches it: a fragment is tried percent-decoded too. */
function idKey(v) {
    const t = v.trim();
    try {
        return decodeURIComponent(t);
    }
    catch {
        return t;
    }
}
/** Classes markdown itself puts on tokens (task lists). */
const TOKEN_CLASSES = /^(task-list-item|contains-task-list|task-list-item-checkbox|enabled)$/;
/** The documented `{{sp[…]}}` classes (references/syntax.md). */
const SPAN_CLASSES = /^(red|yellow|green|blue|success|info|warning|danger)$/;
/** Containers fetched text may use: the documented ones, not `::: any-class`. */
const KNOWN_CONTAINERS = /^container_(success|info|warning|danger|left|right|center|spoil|tabs|tab|cols|col)_open$/;
/** TeX that moves or paints outside its own box (fetched math only; a host's math is its own). */
// Horizontal escapes (negative space however spelled, laps) are judged on
// KaTeX's output (measureRender); these vertical moves on the TeX itself.
/** Spacing commands an author can type; with a negative kern in the output, refused. */
const TYPED_SPACING = /\\(kern|mkern|hskip|mskip|hspace|mspace|tmspace|negthinspace|negmedspace|negthickspace|joinrel|!)/;
const FETCHED_MATH_REFUSED = /\\(smash|raisebox|[lrc]lap|math[lrc]lap|lower|raise|moveleft|moveright|vcenter)\b|\\rule\s*\[/;
/** The one style markdown generates on tokens: table column alignment. */
const TOKEN_STYLE = /^text-align:(left|right|center)$/;
/** Is a URL in a fetched attribute one a Markdown link would also allow? */
function safeUrl(raw, srcset = false) {
    const md = parser();
    // Entities decoded, control characters and whitespace removed, as the
    // browser does before reading the scheme (`java&#9;script:` runs).
    const decoded = md.utils.unescapeAll(raw).replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
    const urls = srcset ? md.utils.unescapeAll(raw).split(',').map((c) => c.trim().split(/\s+/)[0].replace(/[\u0000-\u0020\u007f-\u009f]/g, '')) : [decoded];
    return urls.every((u) => !u || md.validateLink(u));
}
/** The attributes of an element in fetched text: raw HTML (`raw`) or tokens. */
/**
 * What an automatic heading id may not be: an id the renderer gives out
 * (`# fn1`), or a lowercase global a page script reads (`window.hljs`,
 * `window.orzmd`: a named element shadows it). `## Chart`, `## KaTeX` or
 * `# orz family` are ordinary titles (round 21, M2).
 */
const RENDER_IDS = /^(fn(ref)?\d+(:\d+)?|nyml-data(-\d+)?|orz-meta|orz-hljs|orz[a-z0-9_]*|hljs|mermaid)$/;
function attrsOk(attrs, raw, auto = false) {
    for (const [name, value] of attrs) {
        const key = (0, ascii_js_1.asciiLower)(name);
        if (/^on/.test(key) || /^data-(md|orz-)/.test(key))
            return false; // handlers; copy breadcrumbs
        if (raw ? !RAW_ATTRS.test(key) : !TOKEN_ATTRS.test(key))
            return false;
        // Fetched text cannot add landmarks or headings to the host's
        // accessibility tree (`role="navigation"`, `role="heading"`: round 15, M-1).
        if (key === 'role' && !/^(presentation|none)$/i.test(value.trim()))
            return false;
        if (key === 'tabindex' && value.trim() !== '-1')
            return false;
        if ((key === 'id' || key === 'name') && (auto ? RENDER_IDS : RESERVED_ID).test(idKey(value)))
            return false;
        if (ARIA_REFS.test(key))
            return false;
        // Links may open a new tab, but never keep a handle on the host page
        // (reverse tabnabbing) or navigate it from inside a preview frame (round 14).
        if (key === 'target' && (0, ascii_js_1.asciiLower)(value.trim()) !== '_blank')
            return false;
        if (key === 'rel' && !value.trim().split(/\s+/).every((r) => /^(noopener|noreferrer|nofollow)$/i.test(r)))
            return false;
        if (key === 'class' && !value.trim().split(/\s+/).every((c) => TOKEN_CLASSES.test(c)))
            return false;
        if (key === 'style' && !TOKEN_STYLE.test(value.replace(/\s+/g, '')))
            return false;
        if ((key === 'width' || key === 'height') && !/^\s*(\d{1,4}(px|%)?|auto)\s*$/i.test(value))
            return false;
        if (URL_ATTRS.test(key) && !safeUrl(value, key === 'srcset'))
            return false;
    }
    return true;
}
function rawAttrs(source) {
    const out = [];
    for (const m of source.matchAll(/([A-Za-z_:][A-Za-z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
        out.push([m[1], m[2] ?? m[3] ?? m[4] ?? '']);
    }
    return out;
}
/** Every id / name value in raw HTML, read tag by tag with the strict tokenizer. */
function rawIds(html) {
    const out = [];
    for (let at = html.indexOf('<'); at >= 0; at = html.indexOf('<', at + 1)) {
        STRICT_TAG.lastIndex = at;
        const m = STRICT_TAG.exec(html);
        if (!m || m[1])
            continue;
        for (const [k, v] of rawAttrs(m[3]))
            if (/^(id|name)$/i.test(k))
                out.push(v);
        at = STRICT_TAG.lastIndex - 1;
    }
    return out;
}
function rawHtmlStaysInside(tokens, dropped) {
    // One raw-element stack per Markdown container; it must be empty when the
    // container closes (a generated `</li>` or `</p>` pops anything left open).
    const frames = [[]];
    let inLink = 0;
    let htmlRefused = false; // the last failure was raw HTML (not math, attrs, a class)
    const lines = []; // the innermost open block with a line map (table cells have none)
    let inNested = 0; // inside re-emitted markup: its line numbers are not the body's
    let inHead = 0; // a table's header row: dropping it alone leaves no table (round 22, L1)
    const take = (html) => {
        htmlRefused = true;
        if (!takeTags(html))
            return false;
        htmlRefused = false;
        return true;
    };
    const takeTags = (html) => {
        for (let at = html.indexOf('<'); at >= 0; at = html.indexOf('<', at)) {
            STRICT_COMMENT.lastIndex = at;
            const c = STRICT_COMMENT.exec(html);
            if (c) {
                if (c[1].includes('--!>'))
                    return false; // the browser ends the comment there
                at = STRICT_COMMENT.lastIndex;
                continue;
            }
            STRICT_TAG.lastIndex = at;
            const m = STRICT_TAG.exec(html);
            if (!m)
                return false; // unterminated tag or quote, doctype, CDATA, bare "<"
            at = STRICT_TAG.lastIndex;
            const [, close, rawName, attrs, slash] = m;
            const name = (0, ascii_js_1.asciiLower)(rawName);
            const stack = frames[frames.length - 1];
            if (!(name in ALLOWED_HTML) && !VOID_HTML.has(name))
                return false;
            if (close) {
                if (attrs.trim() || slash || stack.pop() !== name)
                    return false;
                continue;
            }
            const list = rawAttrs(attrs);
            if (name === 'input') {
                // Only a checkbox (what the task-list plugin emits), in any attribute order.
                const ok = list.every(([k, v]) => {
                    const key = (0, ascii_js_1.asciiLower)(k);
                    return (key === 'type' && (0, ascii_js_1.asciiLower)(v) === 'checkbox') || key === 'checked' || key === 'disabled' || (key === 'class' && v === 'task-list-item-checkbox');
                });
                if (!ok || !list.some(([k, v]) => (0, ascii_js_1.asciiLower)(k) === 'type' && (0, ascii_js_1.asciiLower)(v) === 'checkbox'))
                    return false;
            }
            else {
                if (!attrsOk(list, true))
                    return false; // handlers, javascript: URLs, classes, styles
                // `name` only on <a>: on <img>/<form>/… it overrides document methods
                // (`<img name="querySelectorAll">` turned off enhancement: round 14, H4).
                if (name !== 'a' && list.some(([k]) => (0, ascii_js_1.asciiLower)(k) === 'name'))
                    return false;
                // A floated image or table beside the host text after it (round 14, LOW).
                if (/^(img|video|table|picture)$/.test(name) && list.some(([k, v]) => (0, ascii_js_1.asciiLower)(k) === 'align' && /^(left|right)$/i.test(v.trim())))
                    return false;
            }
            const parent = ALLOWED_HTML[name];
            if (parent && !parent.includes(stack[stack.length - 1] ?? ''))
                return false;
            if (name === 'a' && (inLink > 0 || frames.some((f) => f.includes('a'))))
                return false;
            if (VOID_HTML.has(name)) {
                if (name === 'col' && !['colgroup', 'table'].includes(stack[stack.length - 1] ?? ''))
                    return false;
                continue;
            }
            if (slash)
                return false; // "/>" does not close an HTML element
            stack.push(name);
            if (stack.length > 32)
                return false; // deep raw nesting only costs the reader (round 18, L1)
        }
        return true;
    };
    // Markup that orz itself re-emits from author text goes through the same
    // allowlist: a `{{sp …}}` body and a `::: spoil` label are rendered as inline
    // Markdown with HTML enabled (round 11, H2).
    const nested = (source) => {
        frames.push([]);
        inNested++;
        // Parsed as the renderer renders it: INLINE. A block parse let a fence
        // opener or a reference definition hide the HTML (round 12, H1).
        const ok = walk(parser().parseInline(source, { __orzNoFootnotes: true }));
        inNested--;
        return (frames.pop() ?? []).length === 0 && ok;
    };
    const walk = (list) => {
        for (const t of list) {
            // Event-handler attributes, wherever they come from (`{{attrs[onclick=…]}}`
            // puts them on the previous block), run in the host page.
            // A heading's automatic id is checked only against render-time ids:
            // `## Chart` or `# orz family` are ordinary titles (round 21, M2).
            const auto = t.type === 'heading_open' && t.meta?.orzAutoId === (t.attrs ?? []).find(([k]) => k === 'id')?.[1];
            if (!attrsOk(t.attrs ?? [], false, auto))
                return false;
            // KaTeX lays math out with relative positioning: `\smash`, `\raisebox`,
            // `\rlap`, a raised `\rule` or a negative kern paints outside the
            // formula's box, over the host text (round 16, HIGH-2).
            if (/^math/.test(t.type) && FETCHED_MATH_REFUSED.test(t.content))
                return false;
            // Class names come only from what orz documents: no `::: any-class`
            // container, no `{{sp[any-class]}}` (round 13, H1).
            if (/^container_.*_open$/.test(t.type) && !KNOWN_CONTAINERS.test(t.type))
                return false;
            if (t.type === 'plugin_inline' && (t.info === 'sp' || t.info === 'span')) {
                const args = t.meta?.args;
                if (args != null && !args.trim().split(/\s+/).every((c) => SPAN_CLASSES.test(c)))
                    return false;
                if (!nested(t.content))
                    return false;
            }
            if (/^container_spoil_open$/.test(t.type) && !nested(t.info.trim().replace(/^spoil\b\s*/, ''))) {
                // A label with refused raw HTML drops the whole container.
                if (!dropped || inNested || !htmlRefused || !t.map)
                    return false;
                dropped.push([t.map[0], t.map[1], true]); // the closing marker, if any, is the line after the map
            }
            if (t.type === 'html_block' && dropped) {
                // A raw HTML block the allowlist refuses is collected, and the walk
                // goes on as if it were not there (the caller removes it and checks
                // the reduced body again, strictly).
                const stack = frames[frames.length - 1];
                const saved = stack.slice();
                if (!take(t.content)) {
                    if (t.map && !inNested)
                        dropped.push(t.map);
                    else
                        return false;
                    stack.length = 0;
                    stack.push(...saved);
                }
            }
            else if (t.type === 'html_block' || t.type === 'html_inline') {
                if (!take(t.content))
                    return false;
            }
            else if (t.nesting === 1) {
                frames.push([]);
                if (t.type === 'link_open')
                    inLink++;
                if (t.type === 'thead_open')
                    inHead++;
                if (t.block)
                    lines.push(inHead && t.type !== 'table_open' ? lines[lines.length - 1] : t.map ?? lines[lines.length - 1]);
            }
            else if (t.nesting === -1) {
                if ((frames.pop() ?? []).length)
                    return false;
                if (t.type === 'link_close')
                    inLink--;
                if (t.block)
                    lines.pop();
                if (t.type === 'thead_close')
                    inHead--;
            }
            if (t.type === 'inline' && t.children) {
                const depth = frames.length, links = inLink;
                frames.push([]);
                htmlRefused = false;
                let ok = walk(t.children);
                if (ok && (frames.pop() ?? []).length) {
                    ok = false;
                    htmlRefused = true;
                } // an element left open
                if (!ok) {
                    // Refused raw HTML inside a paragraph, heading or cell: the block
                    // holding it is collected and dropped like a refused HTML block.
                    // The enclosing block's lines: a setext heading's inline map leaves
                    // out its underline (round 22, M2).
                    const map = lines[lines.length - 1] ?? t.map;
                    if (!dropped || inNested || !htmlRefused || !map)
                        return false;
                    dropped.push(map);
                    frames.length = depth;
                    inLink = links;
                }
            }
        }
        return true;
    };
    return walk(tokens) && frames.length === 1 && frames[0].length === 0;
}
const unescapeHtml = (s) => s.replace(/&(lt|gt|quot|#39|#x27|amp);/g, (_, e) => ({ lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", amp: '&' })[e] ?? '');
/**
 * Render `text` alone and read the per-render counters it used (QR output,
 * TeX, mhchem, KaTeX output), and whether any formula paints outside its own
 * box. Estimates from the source lost every round — a QR's size depends on its
 * encoding, math hides in labels and spans, `\kern{0-9em}` is a negative
 * kern no pattern foresaw (round 21) — so the renderer's own counters and
 * KaTeX's own output decide.
 */
function measureRender(text, base = {}) {
    const env = { ...base };
    const html = parser().render(text, env);
    const n = (k) => env[k] ?? 0;
    const m = { qr: n('__orzQrOutput'), tex: n('__orzTex'), chem: n('__orzChem'), katex: n('__orzKatexOut') };
    let covers = false;
    // On what KaTeX made of each formula: a lap, smash or vertical move in its
    // TeX (also in labels and spans), or negative kerns the author typed —
    // however spelled (`\kern{0-9em}`, `\tmspace-{…}`: round 21, H4) — summing
    // to 1em over the whole body (formulas sit side by side, so a per-formula
    // limit adds up). KaTeX's own macros kern and lap too (`\Longrightarrow`,
    // `\neq`): output alone cannot tell, the typed command alone missed
    // spellings. `\operatorname{softmax}\!\left(` stays fine (round 21).
    let negative = 0;
    for (const seg of html.split('<span class="katex"').slice(1)) {
        const tex = unescapeHtml(/<annotation encoding="application\/x-tex">([^<]*)<\/annotation>/.exec(seg)?.[1] ?? '');
        if (FETCHED_MATH_REFUSED.test(tex)) {
            covers = true;
            break;
        }
        if (!TYPED_SPACING.test(tex))
            continue;
        for (const k of seg.matchAll(/class="mspace" style="[^"]*margin-(?:left|right):\s*-([\d.]+)em/g))
            negative += parseFloat(k[1]);
        if (negative >= 1) {
            covers = true;
            break;
        }
    }
    return { m, covers };
}
/**
 * What the host renders, with every included region left out: block tokens
 * lying wholly inside a region (and everything they open) are skipped; the
 * rest are compared by type, nesting, level, markup, info, content, every
 * attribute (heading ids included), list tightness (`hidden`) and inline
 * children (link targets, footnote labels). The `{{toc}}` contents and the
 * footnote list at the end are not compared: included headings and footnotes
 * join them by design. Also returned: every id in the document, and the
 * footnote labels the host defines or cites.
 */
function parseHost({ doc, regions }, base = {}) {
    const starts = lineStartsOf(doc);
    const docLines = doc.split('\n');
    const lines = regions.map(([a, b]) => {
        let end = lineOf(starts, Math.max(a, b - 1)) + 1;
        // The blank separator lines right after an include belong to it (a block
        // that ends at the include's end may end after them).
        while (end < docLines.length && !docLines[end].replace(/^[ \t>]*/, ''))
            end++;
        return [lineOf(starts, a), end];
    });
    // Regions are in document order: binary-search the last one starting at or
    // before the token (a scan per token was quadratic with many includes).
    const inside = (map) => {
        let lo = 0, hi = lines.length - 1, k = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (lines[mid][0] <= map[0]) {
                k = mid;
                lo = mid + 1;
            }
            else
                hi = mid - 1;
        }
        return k >= 0 && map[1] <= lines[k][1];
    };
    const attrs = (t) => (t.attrs ?? []).map(([k, v]) => `${k}=${v}`).join(' ');
    const ids = new Map();
    const footnotes = new Set();
    const sig = [];
    const env = { ...base };
    let skip = 0;
    let tail = false;
    // The footnote section: every definition's body, keyed by label (inline
    // notes by their text), numbers left out — an include's reference
    // definitions or its share of the link budget reached host footnotes there
    // (round 23, F1/F2).
    const notes = new Map();
    const tocEntries = [];
    let note = null, noteKey = '';
    const refLabel = (c) => String(c.meta?.label ?? '');
    let nyml = 0; // nyml islands are numbered at render time (`nyml-data`, `-2`, …)
    let tocs = 0, headings = 0, headingBytes = 0; // what the TOC caps count
    let prevType = '';
    // A QR code is ~35 KB of SVG at least, ~1,200× its content beyond that —
    // wherever it is written: a span body or spoil label too (round 20, H2).
    const tokens = parser().parse(doc, env);
    for (const t of tokens) {
        const nymlNo = t.type === 'plugin_block' && t.info === 'nyml' ? ++nyml : 0;
        if (t.type === 'plugin_block' && t.info === 'toc')
            tocs++;
        if (t.type === 'heading_open') {
            headings++;
            headingBytes += ((t.attrs ?? []).find(([k]) => k === 'id')?.[1] ?? '').length;
        }
        if (t.type === 'inline' && prevType === 'heading_open')
            headingBytes += t.content.length; // only heading text counts (round 20, M2)
        prevType = t.type;
        for (const x of [t, ...(t.children ?? [])]) {
            for (const [k, v] of x.attrs ?? [])
                if ((0, ascii_js_1.asciiLower)(k) === 'id') {
                    const key = idKey(v);
                    ids.set(key, (ids.get(key) ?? 0) + 1);
                }
            // An id (or an anchor name) written in raw HTML is a target too (round 11,
            // H1) — read with the same strict tokenizer, attribute names in any case,
            // once per tag (a regex per "<" was quadratic: round 14, H1/H3).
            if (x.type === 'html_block' || x.type === 'html_inline' || (x.type === 'plugin_inline' && (x.info === 'sp' || x.info === 'span'))) {
                for (const v of rawIds(x.content)) {
                    const key = idKey(v);
                    ids.set(key, (ids.get(key) ?? 0) + 1);
                }
            }
        }
        if (t.type === 'footnote_block_open')
            tail = true;
        if (tail) {
            if (t.type === 'footnote_open') {
                const meta = t.meta;
                noteKey = meta.label != null ? ':' + meta.label : '^' + (env.footnotes?.list?.[meta.id]?.content ?? '');
                note = [];
            }
            else if (t.type === 'footnote_close' && note) {
                const set = notes.get(noteKey) ?? new Set();
                set.add(note.join('\u0003'));
                notes.set(noteKey, set);
                note = null;
            }
            else if (note && skip > 0) {
                skip += t.nesting; // an include inside a host footnote is skipped as in the body (round 24, F2)
            }
            else if (note && t.map && inside(t.map)) {
                if (t.nesting === 1)
                    skip = 1;
            }
            else if (note && t.type !== 'footnote_anchor') {
                const kids = [...descendants(t)].filter((c) => c.type !== 'footnote_anchor').map((c) => c.type === 'footnote_ref' ? `footnote_ref|${refLabel(c)}` : `${c.type}|${c.markup}|${c.content}|${attrs(c)}`).join('\u0002');
                // TOC content and nyml numbers as in the body (round 24, F3/F6).
                note.push(`${t.type}|${t.tag}|${t.nesting}|${t.markup}|${t.type === 'inline' || (t.type === 'plugin_block' && t.info === 'toc') ? '' : t.content}|${attrs(t)}|${kids}${nymlNo ? '#' + nymlNo : ''}`);
            }
            continue;
        }
        if (skip > 0) {
            skip += t.nesting;
            continue;
        }
        if (t.map && inside(t.map)) {
            if (t.nesting === 1)
                skip = 1;
            continue;
        }
        const kids = [...descendants(t)].map((c) => {
            if (c.type === 'footnote_ref' && c.meta?.label != null)
                footnotes.add(String(c.meta.label));
            return `${c.type}|${c.markup}|${c.content}|${attrs(c)}`;
        }).join('\u0002');
        const content = t.type === 'inline' || (t.type === 'plugin_block' && t.info === 'toc') ? '' : t.content;
        // A host TOC's entries, as resolved at parse time: an include may add
        // entries, never empty it past a cap (an estimate let that through: round 24, M2).
        if (t.type === 'plugin_block' && t.info === 'toc')
            tocEntries.push((t.content.match(/<li[\s>]/g) ?? []).length);
        // A host nyml block carries its number: an included one before it would
        // take the host's `nyml-data` id (round 10, L3).
        sig.push(`${t.type}|${t.tag}|${t.nesting}|${t.level}|${t.markup}|${t.info}|${t.hidden ? 1 : 0}|${content}|${attrs(t)}|${kids}${nymlNo ? '#' + nymlNo : ''}`);
    }
    for (const key of Object.keys(env.footnotes?.refs ?? {}))
        footnotes.add(key.replace(/^:/, ''));
    return { sig, ids, footnotes, notes, tocs, tocEntries, headings, headingBytes };
}
/**
 * The candidate leaves the host as the reference has it: same host tokens, no
 * id that appears more often than in the reference, and no footnote label that
 * both an include defines and the host defines or cites (markdown-it-footnote
 * lets the last definition win, so an include could rewrite a host footnote:
 * round 8, H1).
 */
function sameHost(candidate, reference, includeFootnotes, base = {}) {
    const x = parseHost(candidate, base);
    const y = parseHost(reference, base);
    if (x.sig.length !== y.sig.length || !x.sig.every((s, i) => s === y.sig[i]))
        return false;
    if (x.tocEntries.some((n, i) => n < (y.tocEntries[i] ?? 0)))
        return false;
    // Every host footnote renders as the host alone renders it.
    for (const [key, bodies] of y.notes) {
        const got = x.notes.get(key);
        if (!got || got.size !== bodies.size || [...bodies].some((b) => !got.has(b)))
            return false;
    }
    // An id the HOST uses may not appear more often; an include duplicating
    // only its own ids touches nothing of the host (round 14, M3).
    for (const [id, n] of x.ids) {
        const hostN = y.ids.get(id) ?? 0;
        if (hostN > 0 && n > hostN)
            return false;
    }
    for (const label of includeFootnotes)
        if (y.footnotes.has(label))
            return false;
    // The render-time caps (TOC entries and size, QR output) are shared by the
    // whole document: an include must not push the host across one the host
    // alone stays under — the host's own TOC or QR code would vanish (round 19, H2).
    const crosses = (p) => p.tocs * p.headings > toc_js_1.MAX_TOC_ENTRIES || p.tocs * (6 * p.headingBytes + 64 * p.headings) > toc_js_1.MAX_TOC_BYTES; // QR/math: measured (Measure)
    if (crosses(x) && !crosses(y))
        return false;
    return true;
}
/**
 * The default transport. Redirects are followed by hand (up to 5 hops) and every
 * hop is checked against `allowedHosts` — `fetch` would otherwise follow a 3xx
 * from an allowed host to anywhere (e.g. 169.254.169.254), defeating the
 * allowlist. In a browser, a redirect response is opaque: it fails closed. A
 * server that never answers is given up on after `timeoutMs`.
 */
function makeDefaultFetcher(allowed, timeoutMs, limitOf = () => Infinity) {
    return async (url) => {
        let current = url;
        const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(timeoutMs) : undefined;
        try {
            for (let hop = 0; hop <= 5; hop++) {
                const res = await fetch(current, { redirect: 'manual', signal });
                if (res.type === 'opaqueredirect')
                    return null;
                if (res.status >= 300 && res.status < 400) {
                    const location = res.headers.get('location');
                    if (!location)
                        return null;
                    current = new URL(location, current).toString();
                    if (!/^https?:/i.test(current) || !hostAllowed(current, allowed))
                        return null;
                    continue;
                }
                if (!res.ok)
                    return null;
                // Read at most `limit` bytes: a 400 MB response no longer sits in memory
                // when maxSize is 100,000 (round 20, M4).
                const reader = res.body?.getReader?.();
                if (!reader)
                    return await res.text();
                const decoder = new TextDecoder();
                let out = '', bytes = 0;
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    bytes += value.byteLength;
                    if (bytes > limitOf()) {
                        await reader.cancel().catch(() => { });
                        return null;
                    }
                    out += decoder.decode(value, { stream: true });
                }
                return out + decoder.decode();
            }
            return null;
        }
        catch {
            return null;
        }
    };
}
function hostAllowed(url, allowed) {
    if (!allowed || allowed.length === 0)
        return true;
    let host;
    try {
        host = new URL(url).host.toLowerCase();
    }
    catch {
        return false;
    }
    return allowed.some((a) => a.toLowerCase() === host);
}
function trimEndSpaces(s) {
    let end = s.length;
    while (end > 0 && (s.charCodeAt(end - 1) === 32 || s.charCodeAt(end - 1) === 9))
        end--;
    return end === s.length ? s : s.slice(0, end);
}
/** Quote markers, list markers and a task box at a line start. */
const CONTAINER_PREFIX = /^(?:[ \t]*(?:>|(?:[-+*]|\d{1,9}[.)])(?=[ \t])|\[[ xX]\](?=[ \t])))*[ \t]*/;
const HAS_LIST_MARKER = /(?:^|[ \t>])(?:[-+*]|\d{1,9}[.)])(?=[ \t])/;
function placementOf(text, starts, d, next) {
    const line = lineOf(starts, d.index);
    const lineStart = starts[line];
    const lead = text.slice(lineStart, d.index);
    const containerLead = (lead.match(CONTAINER_PREFIX) ?? [''])[0];
    // Quote markers repeat; a list marker continues as indentation of its width;
    // a task box is content of the item's first paragraph, not indentation
    // (counting it pushed included lines into an indented code block: round 8, M4).
    const cont = containerLead
        .replace(/\[[ xX]\](?=[ \t])[ \t]?/g, '')
        .replace(/(?:[-+*]|\d{1,9}[.)])(?=[ \t])/g, (m) => ' '.repeat(m.length));
    const end = line + 1 < starts.length ? starts[line + 1] - 1 : text.length;
    return {
        lineStart, line, cont,
        blank: cont.replace(/[ \t]+$/, ''),
        midLine: containerLead.length !== lead.length,
        tail: text.slice(d.index + d.full.length, end).trim() !== '',
        // Only up to the next directive on the line: that piece starts the new
        // line; the next directive's own check covers the rest (re-parsing the
        // whole rest of the line per directive was quadratic).
        tailText: text.slice(d.index + d.full.length, next && next.index < end ? next.index : end).trim(),
        tailLine: text.slice(d.index + d.full.length, end).trim(),
        nextOnLine: !!next && next.index < end,
        // On a footnote definition's own line, splitting moves the text out of the note (round 24, F5).
        noteLine: /^[ \t>]*\[\^[^\]\s]+\]:/.test(lead),
    };
}
/**
 * Host text after a mid-line directive moves to a line of its own, where it is
 * parsed afresh — and the reference moves it too, so the comparison cannot see
 * what that changes (`# x` a heading, a fence, `{{md ./file}}` live: round 24,
 * H2). Only a plain paragraph with no directive may move.
 */
function plainTail(tail) {
    // `{{attrs}}` would move to the tail's own paragraph. A block directive
    // (`{{toc}}`, `{{md ./file}}`) parses as no paragraph and is caught below;
    // further URL directives in the tail are resolved in their own place.
    if (!tail)
        return true; // the next directive starts the line
    if (/\{\{\s*attrs\b/.test(tail))
        return false;
    const tokens = parser().parse(tail, {});
    if (tokens.length === 1 && tokens[0].type === 'html_block')
        return /^<!--(?:(?!-->)[\s\S])*-->$/.test(tail); // one comment: invisible either way
    return tokens.length === 3 && tokens[0].type === 'paragraph_open' && tokens[2].type === 'paragraph_close';
}
/** At most this many whole-document checks per level when some include must
 *  be refused (group testing; then the rest are refused). */
const MAX_CHECKS = 48;
async function prepareSources(src, opts = {}) {
    // Includes come from trusted sources: a server says which (owner decision,
    // 2026-10-02). Without a list or its own fetcher it fetches nothing.
    if (!opts.fetcher && !opts.allowedHosts?.length && typeof globalThis.document === 'undefined')
        return src;
    const fetcher = opts.fetcher ?? makeDefaultFetcher(opts.allowedHosts, opts.timeoutMs ?? 15000, () => Math.min(4 * (opts.maxSize ?? 5000000), Math.max(0, work)));
    const maxDepth = opts.maxDepth ?? 3;
    const mark = nonce();
    // Each distinct URL is fetched at most once per call (CLAIMS M.7) …
    const cache = new Map();
    const fetchOnce = (url) => {
        let pending = cache.get(url);
        if (!pending) {
            pending = Promise.resolve()
                .then(() => fetcher(url))
                .catch(() => null); // a throwing custom fetcher is a failed fetch, not a crash
            cache.set(url, pending);
        }
        return pending;
    };
    // … and resolved at most once per position in the include chain, so a file
    // included many times is not re-resolved each time (round 8, H5: cubic fan-out).
    const resolved = new Map();
    const preparedBodies = new Map();
    let budget = (opts.maxSize ?? 5000000) - src.length;
    // Work, not only output, is bounded: every fetched body resolved or prepared
    // is charged here — refused ones too, which `budget` never sees — so no
    // arrangement of chains or wrappers can make the total work exceed a fixed
    // multiple of maxSize (round 17: N wrappers around one large refused body).
    let work = 4 * (opts.maxSize ?? 5000000);
    async function resolve(input, depth, ancestors) {
        // Offsets and lines refer to the text as the renderer sees it.
        const text = asRendered(input);
        const hostEnv = {};
        const located = locateDirectives(text, hostEnv);
        if (located.length === 0)
            return input;
        // The host's own file includes are part of what an include must not
        // change; without the render's file settings they cannot be seen
        // (round 23, F3). Fetched text has its file includes neutralized.
        let base = {};
        if (depth === 0 && hasLocalInclude(text)) {
            if (!opts.includeEnv)
                return input;
            base = fileEnv(opts.includeEnv);
            const withFiles = { ...base };
            parser().parse(text, withFiles);
            Object.assign(hostEnv, { footnotes: withFiles.footnotes, references: withFiles.references });
        }
        const starts = lineStartsOf(text);
        const places = located.map((d, i) => placementOf(text, starts, d, located[i + 1]));
        const pieces = [];
        for (let i = 0; i < located.length; i++) {
            const d = located[i];
            const place = places[i];
            const nothing = { kind: place.midLine || place.tail ? 'drop' : 'keep' };
            if (!d.splittable || !hostAllowed(d.url, opts.allowedHosts) || place.noteLine || (place.tail && !plainTail(place.tailText))) {
                pieces.push({ kind: 'keep' });
                continue;
            }
            if (ancestors.includes(d.url)) {
                pieces.push(nothing);
                continue;
            } // a cycle
            // Spent work fetches nothing more (a custom fetcher too: round 21, H6).
            if (work <= 0) {
                pieces.push({ kind: 'keep' });
                continue;
            }
            const fetched = await fetchOnce(d.url);
            if (fetched == null) {
                pieces.push({ kind: 'keep' });
                continue;
            }
            // Charged before the size check, and a body refused for size is dropped
            // from the URL cache (300 refused 19 MB bodies ran V8 out of heap: round 21, H6).
            work -= fetched.length;
            if (fetched.length - d.full.length > budget || work < 0) {
                cache.set(d.url, Promise.resolve(null));
                pieces.push({ kind: 'keep' });
                continue;
            }
            const chain = [...ancestors, d.url];
            const key = chain.join('\u0000');
            let nested = resolved.get(key);
            if (!nested) {
                nested = depth < maxDepth ? resolve(fetched, depth + 1, chain) : Promise.resolve(fetched);
                resolved.set(key, nested);
            }
            // Prepared once per position in the include chain, like the nested
            // resolution: N directives naming one large file re-ran the parses N
            // times, and a refused file is charged no budget (round 16, HIGH-1).
            // Keyed by the resolved text: a body reached through many chains is
            // prepared once (the text is usually the very same cached string).
            const text = await nested;
            let prepared = preparedBodies.get(text);
            if (!prepared) {
                prepared = Promise.resolve(text).then((text) => {
                    // An included document's own metadata block is not the host's (round 8, M2).
                    // Extracted after neutralizing: `{{md\n{{nyml kind: meta…` is inert
                    // until its `{{md` is neutralized (round 24, H1).
                    const own = (0, doc_meta_js_1.extractDocMeta)(neutralizeLocalIncludes(normalizeFetched(text))).body.replace(/\s+$/, '');
                    let body = closeTrailingFence(own, mark);
                    const none = { qr: 0, tex: 0, chem: 0, katex: 0 };
                    const empty = { body: '', ok: true, footnotes: new Set(), refs: new Set(), cites: new Set(), measure: none };
                    if (!body)
                        return empty;
                    let env = {};
                    let tokens = parser().parse(body, env);
                    // Raw HTML blocks outside the allowlist (`<script>`, `<style>`,
                    // `<svg>`, a `class` attribute, …) are ignored: their lines are
                    // removed, and the reduced body is prepared and checked again from
                    // the start. Refused raw HTML inside a paragraph (or heading, or
                    // table) drops the lines of that block.
                    const dropped = [];
                    rawHtmlStaysInside(tokens, dropped);
                    if (dropped.length) {
                        const lines = body.split('\n');
                        const gone = new Set();
                        for (const [from, to, container] of dropped) {
                            for (let l = from; l < to; l++)
                                gone.add(l);
                            // markdown-it-container's map stops before its closing marker;
                            // an auto-closed container has none, and the next line is not
                            // its own (round 22, H1: that line could open a fence).
                            if (container && ownCloser(lines[from] ?? '', lines[to] ?? ''))
                                gone.add(to);
                        }
                        // Removal can turn inert text into a metadata block: drop it again.
                        const reduced = (0, doc_meta_js_1.extractDocMeta)(neutralizeLocalIncludes(lines.filter((_, l) => !gone.has(l)).join('\n').replace(/^(?:[ \t]*\n)+/, ''))).body.replace(/\s+$/, '');
                        body = closeTrailingFence(reduced, mark);
                        if (!body)
                            return empty;
                        env = {};
                        tokens = parser().parse(body, env);
                    }
                    let ok = rawHtmlStaysInside(tokens);
                    const cites = new Set();
                    // Alone, a citation of a label the body does not define is text; next
                    // to the host's definition it becomes the host's footnote.
                    for (const t of tokens)
                        for (const c of descendants(t)) {
                            if (c.type === 'footnote_ref' && c.meta?.label != null)
                                cites.add(String(c.meta.label)); // inline notes have no label (round 23)
                            if (c.type === 'text')
                                for (const m of c.content.matchAll(/\[\^([^\]\s]+)\]/g))
                                    cites.add(m[1]);
                        }
                    let measure = none;
                    if (ok) {
                        const r = measureRender(body);
                        measure = r.m;
                        if (r.covers)
                            ok = false;
                    }
                    return { body, ok, footnotes: new Set(Object.keys(env.footnotes?.refs ?? {}).map((k) => k.replace(/^:/, ''))), refs: new Set(Object.keys(env.references ?? {})), cites, measure };
                });
                preparedBodies.set(text, prepared);
            }
            const { body, ok, footnotes, refs, cites, measure } = await prepared;
            if (!body) {
                pieces.push(nothing);
                continue;
            }
            if (!ok) {
                pieces.push({ kind: 'keep' });
                continue;
            }
            // Charge what is really inserted: continuation prefixes included (round 8, M6).
            const newlines = body.length - body.replace(/\n/g, '').length;
            const growth = body.length + newlines * place.cont.length + 4 * (place.blank.length + 1) - d.full.length;
            if (growth > budget) {
                pieces.push({ kind: 'keep' });
                continue;
            }
            budget -= Math.max(0, growth);
            pieces.push({ kind: 'splice', body, footnotes, refs, cites, measure });
        }
        // The candidate (fetched text in place) and the reference (an opaque
        // placeholder paragraph in place) for a choice of includes and modes.
        // Spliced by index, never String.replace (`$&` in fetched text is special).
        function assemble(choice) {
            let out = '', ref = '';
            const rOut = [], rRef = [];
            const footnotes = new Set();
            let last = 0;
            for (let i = 0; i < located.length; i++) {
                const d = located[i];
                const piece = pieces[i];
                const p = places[i];
                let between = text.slice(last, d.index);
                last = d.index + d.full.length;
                const mode = choice.get(i);
                if (piece.kind === 'keep' || (piece.kind === 'splice' && !mode)) {
                    out += between + d.full;
                    ref += between + d.full;
                    continue;
                }
                if (piece.kind === 'drop') {
                    out += between;
                    ref += between;
                    continue;
                }
                for (const f of piece.footnotes)
                    footnotes.add(f);
                // Fetched text is block content: it starts a block of its own…
                let before = '';
                if (p.midLine) {
                    // End the paragraph here (without trailing spaces, which would read
                    // as a hard break) and start a block.
                    between = trimEndSpaces(between);
                    before = '\n' + p.blank + '\n' + p.cont;
                }
                else if (mode === 'loose' && p.lineStart > 0 && !HAS_LIST_MARKER.test(text.slice(p.lineStart, d.index))) {
                    const prev = text.slice(starts[p.line - 1], p.lineStart - 1).replace(CONTAINER_PREFIX, '');
                    if (prev.trim())
                        before = '\n' + p.cont;
                }
                // …and the host text after it starts another.
                const end = p.line + 1 < starts.length ? starts[p.line + 1] - 1 : text.length;
                let after = '';
                if (p.tail) {
                    after = '\n' + p.blank + '\n' + p.cont;
                    const tail = text.slice(last, end);
                    last += tail.length - tail.trimStart().length;
                }
                else if (mode === 'loose' && end < text.length) {
                    after = '\n' + p.blank;
                }
                const placed = piece.body.replace(/\n/g, '\n' + p.cont);
                out += between + before;
                ref += between + before;
                rOut.push([out.length, out.length + placed.length]);
                rRef.push([ref.length, ref.length + mark.length]);
                out += placed + after;
                ref += mark + after;
            }
            out += text.slice(last);
            ref += text.slice(last);
            return { out, candidate: { doc: out, regions: rOut }, reference: { doc: ref, regions: rRef }, footnotes };
        }
        // Conflicts that need no whole-document parse are refused per include
        // first, so one bad chapter does not make group testing drop good ones
        // (round 19, M1): a footnote label the host defines or cites.
        const hostFootnotes = new Set();
        for (const key of Object.keys(hostEnv.footnotes?.refs ?? {}))
            hostFootnotes.add(key.replace(/^:/, ''));
        for (const t of parser().parse(text, { ...base, __orzNoFootnotes: false })) {
            for (const c of descendants(t))
                if (c.type === 'footnote_ref' && c.meta?.label != null)
                    hostFootnotes.add(String(c.meta.label));
        }
        // …and a reference definition the host defines too (round 20, M1).
        const hostRefs = new Set(Object.keys(hostEnv.references ?? {}));
        pieces.forEach((p, i) => {
            if (p.kind !== 'splice')
                return;
            // A citation of a host label retargets the host's footnote (round 21, M1).
            if ([...p.footnotes, ...p.cites].some((f) => hostFootnotes.has(f)) || [...p.refs].some((r) => hostRefs.has(r)))
                pieces[i] = { kind: 'keep' };
        });
        // A directive left as text right after a spliced one would start a line
        // and render as nothing: then the whole rest of the line must be a plain
        // tail, or the earlier one stays too — back to front, as that cascades
        // (final check, F2).
        for (let i = pieces.length - 2; i >= 0; i--) {
            if (pieces[i].kind === 'splice' && places[i].nextOnLine && pieces[i + 1].kind !== 'splice' && !plainTail(places[i].tailLine))
                pieces[i] = { kind: 'keep' };
        }
        const splices = pieces.map((p, i) => (p.kind === 'splice' ? i : -1)).filter((i) => i >= 0);
        let checks = 0;
        let hostMeasure;
        const holds = (choice) => {
            checks++;
            // Every whole-document check parses the document twice: charged as work.
            work -= 2 * text.length;
            if (work < 0)
                return false;
            // The per-render budgets, measured: host alone plus each chosen include
            // must stay under any cap the host alone stays under.
            hostMeasure ?? (hostMeasure = (work -= text.length, measureRender(text, base).m));
            const sum = { ...hostMeasure };
            for (const i of choice.keys()) {
                const p = pieces[i];
                if (p.kind === 'splice') {
                    sum.qr += p.measure.qr;
                    sum.tex += p.measure.tex;
                    sum.chem += p.measure.chem;
                    sum.katex += p.measure.katex;
                }
            }
            const over = (m) => m.qr > qrcode_js_1.MAX_QR_OUTPUT || m.tex > index_js_1.MAX_TEX_TOTAL || m.chem > index_js_1.MAX_CHEM_TOTAL || m.katex > index_js_1.MAX_KATEX_OUTPUT;
            if (over(sum) && !over(hostMeasure))
                return false;
            const a = assemble(choice);
            return sameHost(a.candidate, a.reference, a.footnotes, base);
        };
        // Try the whole group tight, then loose; failing that, split it in two and
        // keep what each half can keep (group testing: a few bad includes among
        // many cost O(log n) checks). Past MAX_CHECKS the rest are refused.
        function solve(ids) {
            for (const mode of ['tight', 'loose']) {
                const choice = new Map(ids.map((i) => [i, mode]));
                if (holds(choice))
                    return choice;
            }
            if (ids.length === 1 || checks >= MAX_CHECKS)
                return new Map();
            const half = ids.length >> 1;
            const left = solve(ids.slice(0, half));
            const right = checks < MAX_CHECKS ? solve(ids.slice(half)) : new Map();
            const both = new Map([...left, ...right]);
            if (left.size && right.size && checks < MAX_CHECKS && holds(both))
                return both;
            return left.size >= right.size ? left : right;
        }
        const accepted = splices.length ? solve(splices) : new Map();
        return assemble(accepted).out;
    }
    return resolve(src, 0, []);
}
//# sourceMappingURL=prepare-sources.js.map