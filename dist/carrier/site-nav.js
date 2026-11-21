"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SITE_NAV_TEXT_MAX = exports.SITE_NAV_HREF_MAX = exports.sameSiteNav = exports.readSiteNav = void 0;
exports.siteNav = siteNav;
exports.siteNavFrom = siteNavFrom;
/**
 * Site navigation (FC-18 §8.2 `siteNav`, orz-markdown 2.10.0): an assembled
 * file that is one page of a set of pages (a website's) can carry its place
 * in that set — the set's title, its home page, the page before and the page
 * after it — in `#orz-shell` as `"siteNav"`. The file's runtime draws it as a
 * slim bar outside the document text (spec/carrier-app.md §4.5b); the text,
 * the island and `extract().text` do not change.
 *
 * The value is DATA the file carries: plain-text title and labels (never
 * markup) and hrefs that are relative or absolute `http(s)` URLs. The rule
 * itself is `readSiteNav` in `read.ts` (small and message-free); this module
 * adds the assembly side — `siteNav`, which throws with a reason — and
 * `siteNavFrom`, which resolves the hrefs against a page's address (a copy
 * written from a website keeps links that lead back to it). Parser-free.
 */
const read_js_1 = require("./read.js");
var read_js_2 = require("./read.js");
Object.defineProperty(exports, "readSiteNav", { enumerable: true, get: function () { return read_js_2.readSiteNav; } });
Object.defineProperty(exports, "sameSiteNav", { enumerable: true, get: function () { return read_js_2.sameSiteNav; } });
Object.defineProperty(exports, "SITE_NAV_HREF_MAX", { enumerable: true, get: function () { return read_js_2.SITE_NAV_HREF_MAX; } });
Object.defineProperty(exports, "SITE_NAV_TEXT_MAX", { enumerable: true, get: function () { return read_js_2.SITE_NAV_TEXT_MAX; } });
const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function checkText(value, where) {
    if (typeof value !== 'string')
        throw new TypeError(`orz carrier: siteNav.${where} must be a string`);
    const t = value.replace(/[\t\n\r ]+/g, ' ').trim();
    if (t === '')
        throw new TypeError(`orz carrier: siteNav.${where} is empty`);
    if (t.length > read_js_1.SITE_NAV_TEXT_MAX)
        throw new TypeError(`orz carrier: siteNav.${where} is longer than ${read_js_1.SITE_NAV_TEXT_MAX} characters (UTF-16 code units)`);
    if ((0, read_js_1.readSiteNavText)(value) === null)
        throw new TypeError(`orz carrier: siteNav.${where} holds a control or format character, or nothing visible`);
}
function checkHref(value, where) {
    if (typeof value !== 'string')
        throw new TypeError(`orz carrier: siteNav.${where} must be a string`);
    if (value === '')
        throw new TypeError(`orz carrier: siteNav.${where} is empty`);
    if (value.length > read_js_1.SITE_NAV_HREF_MAX)
        throw new TypeError(`orz carrier: siteNav.${where} is longer than ${read_js_1.SITE_NAV_HREF_MAX} characters`);
    if ((0, read_js_1.readSiteNavHref)(value) === null) {
        throw new TypeError(`orz carrier: siteNav.${where} must be a relative URL or an absolute http(s) URL, with no spaces, backslashes or control characters and not starting with "//": ${JSON.stringify(value.slice(0, 80))}`);
    }
}
function checkLink(value, where) {
    if (!isRecord(value))
        throw new TypeError(`orz carrier: siteNav.${where} is { href, label }`);
    const key = Object.keys(value).find((k) => k !== 'href' && k !== 'label');
    if (key !== undefined)
        throw new TypeError(`orz carrier: unknown key "${key}" in siteNav.${where} (only "href", "label")`);
    checkHref(value['href'], `${where}.href`);
    checkText(value['label'], `${where}.label`);
}
/**
 * Validate and normalize a site-navigation setting for assembly: `null` for
 * none (`undefined`, `null`, `false`); otherwise exactly what `readSiteNav`
 * reads — `{ title, home, previous?, next? }`, a link `{ href, label }`;
 * title and labels plain text (runs of spaces, tabs and line breaks
 * collapsed and trimmed, 1 to {@link SITE_NAV_TEXT_MAX} UTF-16 code units, at
 * least one visible character, no control or format character but the
 * zero-width (non-)joiner); hrefs relative (no scheme) or absolute
 * `http:`/`https:`, 1 to {@link SITE_NAV_HREF_MAX} code units, no whitespace,
 * backslash or control character, not `//…`. Throws a `TypeError` with the
 * reason for anything else.
 */
function siteNav(value) {
    if (value === undefined || value === null || value === false)
        return null;
    const ok = (0, read_js_1.readSiteNav)(value);
    if (ok)
        return ok;
    if (!isRecord(value))
        throw new TypeError(`orz carrier: siteNav is { title, home, previous?, next? }, not ${Array.isArray(value) ? 'an array' : typeof value}`);
    const key = Object.keys(value).find((k) => k !== 'title' && k !== 'home' && k !== 'previous' && k !== 'next');
    if (key !== undefined)
        throw new TypeError(`orz carrier: unknown key "${key}" in siteNav (only "title", "home", "previous", "next")`);
    checkText(value['title'], 'title');
    checkHref(value['home'], 'home');
    if (value['previous'] !== undefined)
        checkLink(value['previous'], 'previous');
    if (value['next'] !== undefined)
        checkLink(value['next'], 'next');
    throw new TypeError('orz carrier: siteNav is not valid');
}
/**
 * The setting with its hrefs resolved against a page's address (`base`, an
 * absolute `http:`/`https:` URL): what a copy written from that page carries,
 * so its links still lead to the website. Absolute hrefs stay as they are; a
 * `base` that is not `http(s)` (a `file:` page) returns the setting
 * unchanged, as does an href that cannot be resolved to a valid one.
 */
function siteNavFrom(nav, base) {
    let baseUrl;
    try {
        baseUrl = new URL(base);
    }
    catch {
        return nav;
    }
    if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:')
        return nav;
    const abs = (href) => {
        try {
            const r = new URL(href, baseUrl).href;
            return (0, read_js_1.readSiteNavHref)(r) ?? href;
        }
        catch {
            return href;
        }
    };
    const link = (l) => ({ href: abs(l.href), label: l.label });
    return {
        title: nav.title,
        home: abs(nav.home),
        ...(nav.previous ? { previous: link(nav.previous) } : {}),
        ...(nav.next ? { next: link(nav.next) } : {}),
    };
}
//# sourceMappingURL=site-nav.js.map