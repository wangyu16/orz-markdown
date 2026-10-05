"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TWIN_LINKS_RULE = void 0;
exports.twinHref = twinHref;
exports.registerTwinLinks = registerTwinLinks;
const index_js_1 = require("../index.js");
const env_js_1 = require("../env.js");
/** Name of the core rule on the shared `md`. */
exports.TWIN_LINKS_RULE = 'orz_twin_links';
/**
 * The assembled-twin href of a link href, or the href unchanged.
 *
 * Rewritten: a relative path (also `./`, `../`, or root-relative `/…`) whose
 * last segment ends in `.md`, `.slides.md` or `.paged.md` (lower case), with
 * an optional `?query` and/or `#fragment`, which are kept. Untouched: absolute
 * URLs (any `scheme:`, so `https:`, `mailto:`, `data:`), protocol-relative
 * `//host/…`, fragment- or query-only hrefs, and every other path.
 */
function twinHref(href) {
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(href) || href.startsWith('//'))
        return href;
    const cut = href.search(/[?#]/);
    const path = cut >= 0 ? href.slice(0, cut) : href;
    const rest = cut >= 0 ? href.slice(cut) : '';
    const seg = path.slice(path.lastIndexOf('/') + 1);
    let m;
    if ((m = /^(.+)\.(slides|paged)\.md$/.exec(seg)))
        return `${path.slice(0, path.length - seg.length)}${m[1]}.${m[2]}.html${rest}`;
    if (/^.+\.md$/.test(seg))
        return `${path}.html${rest}`;
    return href;
}
/** The core rule: rewrites `link_open` hrefs when `env.orzTwinLinks === true`. */
function twinLinksRule(state) {
    if ((0, env_js_1.rootEnv)(state.env)['orzTwinLinks'] !== true)
        return;
    for (const token of state.tokens) {
        if (token.type !== 'inline' || !token.children)
            continue;
        for (const child of token.children) {
            if (child.type !== 'link_open')
                continue;
            const href = child.attrGet('href');
            if (href === null)
                continue;
            const next = twinHref(href);
            if (next !== href)
                child.attrSet('href', next);
        }
    }
}
/** Register the twin-link rule on a markdown-it instance (idempotent). */
function registerTwinLinks(target) {
    const ruler = target.core.ruler;
    if (ruler.__find__(exports.TWIN_LINKS_RULE) >= 0)
        return;
    target.core.ruler.push(exports.TWIN_LINKS_RULE, twinLinksRule);
}
registerTwinLinks(index_js_1.md);
//# sourceMappingURL=links.js.map