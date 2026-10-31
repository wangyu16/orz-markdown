"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESERVED_ID = exports.URL_ATTRS = exports.RAW_ATTRS = exports.STRICT_COMMENT = exports.STRICT_TAG = exports.VOID_HTML = exports.ALLOWED_HTML = void 0;
exports.idKey = idKey;
exports.rawAttrs = rawAttrs;
exports.urlOk = urlOk;
exports.rawHtmlMode = rawHtmlMode;
exports.authorAttrOk = authorAttrOk;
exports.allowlistHtml = allowlistHtml;
/**
 * The raw-HTML allowlist (D-127, claim M.45): what an author's own HTML may be
 * when a host renders with `env.orzRawHtml = "allowlist"` — a document written
 * by several people (a shared course), where the person who publishes did not
 * write every line. The default (`"allow"`, or no setting) is unchanged: the
 * author is trusted and raw HTML renders as written (FC-07).
 *
 * In allowlist mode every tag in raw HTML (html_block, html_inline — so table
 * cells, `{{sp …}}` bodies and `::: spoil` labels, which render through the
 * same rules) is checked on its own, as the browser would read it:
 *
 * - kept: a start or end tag of an element on the M.20 list (`ALLOWED_HTML`,
 *   shared with fetched-text checks), in strict tag syntax, whose attributes
 *   all pass `authorAttrOk`; a well-formed comment the browser can't end early;
 * - everything else becomes text: its `<` is written `&lt;`, so the reader sees
 *   what was written and nothing runs (`<script>`, `<iframe>`, `<svg>`, `<style>`,
 *   a form, `<img/src=x onerror=…>`, `<?…>`, `<![CDATA[`, a doctype, a stray `<`).
 *
 * Only listed elements are ever emitted, and none of them is a raw-text or
 * foreign-content element, so the browser's tokenizer never leaves its data
 * state: the text between kept tags is text. Nesting is the author's own
 * layout (unlike fetched text, M.16, which must stay inside its include).
 *
 * `{{attrs[…]}}` in allowlist mode drops any attribute `authorAttrOk` refuses.
 *
 * Pure; imports no parser (URL checks come from the caller's `validateLink`).
 */
const ascii_js_1 = require("./ascii.js");
/** element: required parent among the raw elements, or null for "anywhere" (M.20). */
exports.ALLOWED_HTML = {
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
exports.VOID_HTML = new Set(['br', 'hr', 'img', 'wbr', 'source', 'track', 'col', 'input']); // input: task-list checkboxes only
exports.STRICT_TAG = /<(\/?)([A-Za-z][A-Za-z0-9]*)((?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/y;
exports.STRICT_COMMENT = /<!--(?!-?>)([\s\S]*?)-->/y;
/** Attributes fetched raw HTML may carry (M.20: no `class`, no `style`). */
exports.RAW_ATTRS = /^(id|title|lang|dir|role|hidden|translate|aria-label|border|clear|data-[a-z0-9-]+|href|src|srcset|sizes|alt|width|height|colspan|rowspan|scope|headers|align|valign|start|reversed|type|open|datetime|cite|name|rel|target|loading|decoding|controls|poster|preload|muted|loop|playsinline|media|srclang|kind|label|default|value|span|abbr|checked|disabled)$/i;
/** Attributes that hold a URL: validated like a Markdown link (no `javascript:`). */
exports.URL_ATTRS = /^(href|src|cite|poster|srcset)$/i;
/** Ids the renderer gives out at render time: a document's own HTML cannot claim them either (they shadow page globals). */
exports.RESERVED_ID = /^(fn(ref)?\d+(:\d+)?|nyml-data(-\d+)?|orz[\w-]*|hljs|mermaid|chart|smilesdrawer|katex|__orz[\w-]*)$/i;
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
/** The attributes of a strict tag's attribute text. */
function rawAttrs(source) {
    const out = [];
    for (const m of source.matchAll(/([A-Za-z_:][A-Za-z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
        out.push([m[1], m[2] ?? m[3] ?? m[4] ?? '']);
    }
    return out;
}
/** Is a URL attribute's value one a Markdown link would also allow (entities decoded, controls removed, as a browser reads it)? */
function urlOk(raw, check, srcset = false) {
    const strip = (s) => s.replace(/[\u0000- \u007f-\u009f]/g, '');
    const text = check.unescapeAll(raw);
    const urls = srcset ? text.split(',').map((c) => strip(c.trim().split(/\s+/)[0] ?? '')) : [strip(text)];
    return urls.every((u) => !u || check.validateLink(u));
}
function rawHtmlMode(root) {
    const v = root['orzRawHtml'];
    return v === undefined || v === null || v === 'allow' ? 'allow' : 'allowlist';
}
/**
 * An attribute an author's own HTML (or `{{attrs[…]}}`) may carry in allowlist
 * mode: the fetched-text list plus `class`, `style`, `tabindex` and `aria-*`
 * (a document's own layout is its author's), never an event handler, never a
 * URL a Markdown link would refuse, never an id the renderer reserves, and
 * `name` only on `<a>` (on other elements it shadows document methods).
 */
function authorAttrOk(element, name, value, check) {
    const key = (0, ascii_js_1.asciiLower)(name);
    if (/^on/.test(key))
        return false;
    if (!(exports.RAW_ATTRS.test(key) || /^(class|style|tabindex|aria-[a-z]+)$/.test(key)))
        return false;
    if ((key === 'id' || key === 'name') && exports.RESERVED_ID.test(idKey(value)))
        return false;
    if (key === 'name' && element !== 'a')
        return false;
    if (exports.URL_ATTRS.test(key) && !urlOk(value, check, key === 'srcset'))
        return false;
    return true;
}
/** Is this one strict tag (`<name attrs>` / `</name>`) one allowlist mode keeps? */
function tagOk(close, rawName, attrs, check) {
    const name = (0, ascii_js_1.asciiLower)(rawName);
    if (!(name in exports.ALLOWED_HTML) && !exports.VOID_HTML.has(name))
        return false;
    if (close)
        return attrs.trim() === '';
    const list = rawAttrs(attrs);
    if (name === 'input') {
        // Only a disabled checkbox (what the task-list rule emits), in any attribute order.
        return list.some(([k, v]) => (0, ascii_js_1.asciiLower)(k) === 'type' && (0, ascii_js_1.asciiLower)(v) === 'checkbox')
            && list.some(([k]) => (0, ascii_js_1.asciiLower)(k) === 'disabled')
            && list.every(([k, v]) => {
                const key = (0, ascii_js_1.asciiLower)(k);
                return (key === 'type' && (0, ascii_js_1.asciiLower)(v) === 'checkbox') || key === 'checked' || key === 'disabled' || (key === 'class' && v === 'task-list-item-checkbox');
            });
    }
    return list.every(([k, v]) => authorAttrOk(name, k, v, check));
}
/**
 * Raw HTML as allowlist mode renders it: listed tags and well-formed comments
 * kept, every other `<` written as `&lt;`. Linear: each `<` is tried once.
 */
function allowlistHtml(html, check) {
    let out = '';
    let from = 0;
    // A comment ends at the first `-->` or `--!>` after `<!--` (the browser's rule); the nearest one is found once
    // and reused by every `<!--` before it, so many openers cost one scan, not one each.
    const END = /--!?>/g;
    let end = null;
    let endFrom = Infinity;
    for (let at = html.indexOf('<'); at >= 0; at = html.indexOf('<', at)) {
        out += html.slice(from, at);
        if (html.startsWith('<!--', at)) {
            // `<!-->` and `<!--->` end at once in a browser; a comment ended by `--!>` is refused (text).
            if (!/^<!--(?:-?>)/.test(html.slice(at, at + 6))) {
                if (end === null ? endFrom > at + 4 : end.index < at + 4) {
                    END.lastIndex = at + 4;
                    end = END.exec(html);
                    endFrom = at + 4;
                }
                if (end && end[0] === '-->') {
                    out += html.slice(at, end.index + 3);
                    at = from = end.index + 3;
                    continue;
                }
            }
        }
        else {
            exports.STRICT_TAG.lastIndex = at;
            const m = exports.STRICT_TAG.exec(html);
            if (m && tagOk(m[1], m[2], m[3], check)) {
                out += m[0];
                at = from = exports.STRICT_TAG.lastIndex;
                continue;
            }
        }
        out += '&lt;';
        at = from = at + 1;
    }
    return out + html.slice(from);
}
//# sourceMappingURL=raw-html.js.map