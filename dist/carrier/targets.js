"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.includeTargets = includeTargets;
exports.linkTargets = linkTargets;
/**
 * The targets a text points at, read with the kit's parser (2.5.0, K2 of the
 * orz-site design): its include directives (`includeTargets`, formerly only
 * in the Node entry `orz-markdown/carrier/node`, which re-exports it) and its
 * links (`linkTargets`) — exactly as the renderer finds them: never in code,
 * comments or another directive's body. Browser-safe (the parser, no Node
 * built-ins), so a site builder in the browser and in Node parses the same
 * way as the page that renders the text.
 */
const markdown_include_js_1 = require("../plugins/markdown-include.js");
const header_js_1 = require("./header.js");
const parser_js_1 = require("./parser.js");
const naming_js_1 = require("./naming.js");
/** The include targets of a text's body, as written, in order, without repeats (`directives`: the include directive names, default the kit's `md`, `markdown`, `md-include`). */
function includeTargets(text, directives = markdown_include_js_1.INCLUDE_DIRECTIVES) {
    const names = new Set(directives);
    const tokens = (0, parser_js_1.kitParser)().parse((0, header_js_1.withoutHeader)(text).body, {});
    const seen = new Set();
    for (const t of tokens) {
        if (t.type !== 'plugin_block' || !names.has(t.info))
            continue;
        const target = (t.content || '').trim();
        if (target)
            seen.add(target);
    }
    return [...seen];
}
function classify(href, image) {
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(href) || href.startsWith('//'))
        return 'other';
    const path = href.split(/[?#]/)[0];
    if (!path)
        return 'other';
    if (!image && (0, naming_js_1.twinHref)(href) !== href)
        return 'twin';
    return 'asset';
}
/** `<a … href=…>` tags in raw HTML: [offset, href]. */
function rawAnchors(html) {
    const out = [];
    const tag = /<a(?=[\s/>])[^>]*>/gi;
    for (let m = tag.exec(html); m; m = tag.exec(html)) {
        const a = /[\s/]href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(m[0]);
        if (a)
            out.push([m.index, a[1] ?? a[2] ?? a[3] ?? '']);
    }
    return out;
}
const newlines = (s) => (s.match(/\r\n?|\n/g) ?? []).length;
/**
 * The links of a text, in order: Markdown links (`[…](…)`, reference links,
 * autolinks) and images as the kit's parser reads the body (the header
 * skipped; never in code, comments or a directive's body — the inline body of
 * `{{sp …}}` / `{{span …}}` is read, as the renderer renders it), plus raw-HTML
 * `<a href>` tags (`raw: true`). For a site builder's link check: `kind`
 * says which ones the twin-link rule rewrites. Every occurrence is listed
 * (no de-duplication). Links an include directive brings in are the
 * included text's, not this one's.
 */
function linkTargets(text) {
    const { body, offset } = (0, header_js_1.withoutHeader)(text);
    const base = newlines(text.slice(0, offset));
    const tokens = (0, parser_js_1.kitParser)().parse(body, {});
    const out = [];
    const push = (href, line, image, raw) => {
        out.push({ href, line: base + line + 1, kind: classify(href, image), image, raw });
    };
    const walk = (children, first) => {
        let line = first;
        for (const c of children ?? []) {
            if (c.type === 'softbreak' || c.type === 'hardbreak')
                line++;
            else if (c.type === 'link_open') {
                const href = c.attrs?.find(([n]) => n === 'href')?.[1];
                if (href !== undefined)
                    push(href, line, false, false);
            }
            else if (c.type === 'image') {
                const src = c.attrs?.find(([n]) => n === 'src')?.[1];
                if (src !== undefined)
                    push(src, line, true, false);
            }
            else if (c.type === 'html_inline') {
                for (const [, href] of rawAnchors(c.content))
                    push(href, line, false, true);
                line += newlines(c.content);
            }
            else if (c.type === 'plugin_inline' && (c.info === 'sp' || c.info === 'span')) {
                walk((0, parser_js_1.kitParser)().parseInline(c.content, {})[0]?.children ?? null, line);
            }
        }
    };
    let last = 0;
    for (const t of tokens) {
        if (t.map)
            last = t.map[0];
        if (t.type === 'inline')
            walk(t.children, t.map ? t.map[0] : last);
        else if (t.type === 'html_block') {
            for (const [at, href] of rawAnchors(t.content))
                push(href, last + newlines(t.content.slice(0, at)), false, true);
        }
    }
    return out;
}
//# sourceMappingURL=targets.js.map