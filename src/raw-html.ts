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
import { asciiLower } from './ascii.js';

/** element: required parent among the raw elements, or null for "anywhere" (M.20). */
export const ALLOWED_HTML: Record<string, readonly string[] | null> = {
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
export const VOID_HTML = new Set(['br', 'hr', 'img', 'wbr', 'source', 'track', 'col', 'input']); // input: task-list checkboxes only
export const STRICT_TAG = /<(\/?)([A-Za-z][A-Za-z0-9]*)((?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/y;
export const STRICT_COMMENT = /<!--(?!-?>)([\s\S]*?)-->/y;
/** Attributes fetched raw HTML may carry (M.20: no `class`, no `style`). */
export const RAW_ATTRS = /^(id|title|lang|dir|role|hidden|translate|aria-label|border|clear|data-[a-z0-9-]+|href|src|srcset|sizes|alt|width|height|colspan|rowspan|scope|headers|align|valign|start|reversed|type|open|datetime|cite|name|rel|target|loading|decoding|controls|poster|preload|muted|loop|playsinline|media|srclang|kind|label|default|value|span|abbr|checked|disabled)$/i;
/** Attributes that hold a URL: validated like a Markdown link (no `javascript:`). */
export const URL_ATTRS = /^(href|src|cite|poster|srcset)$/i;
/** Ids the renderer gives out at render time: a document's own HTML cannot claim them either (they shadow page globals). */
export const RESERVED_ID = /^(fn(ref)?\d+(:\d+)?|nyml-data(-\d+)?|orz[\w-]*|hljs|mermaid|chart|smilesdrawer|katex|__orz[\w-]*)$/i;

/** An id as the browser matches it: a fragment is tried percent-decoded too. */
export function idKey(v: string): string {
  const t = v.trim();
  try { return decodeURIComponent(t); } catch { return t; }
}

/** The attributes of a strict tag's attribute text. */
export function rawAttrs(source: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const m of source.matchAll(/([A-Za-z_:][A-Za-z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    out.push([m[1], m[2] ?? m[3] ?? m[4] ?? '']);
  }
  return out;
}

/** What a URL check needs from the parser: markdown-it's own `unescapeAll` and `validateLink`. */
export interface UrlCheck {
  unescapeAll(s: string): string;
  validateLink(url: string): boolean;
}

/** Is a URL attribute's value one a Markdown link would also allow (entities decoded, controls removed, as a browser reads it)? */
export function urlOk(raw: string, check: UrlCheck, srcset = false): boolean {
  const strip = (s: string) => s.replace(/[\u0000- \u007f-\u009f]/g, '');
  const text = check.unescapeAll(raw);
  const urls = srcset ? text.split(',').map((c) => strip(c.trim().split(/\s+/)[0] ?? '')) : [strip(text)];
  return urls.every((u) => !u || check.validateLink(u));
}

/** The render setting: `"allow"` (or none) trusts the author; any other value is the allowlist (fail closed). */
export type RawHtmlMode = 'allow' | 'allowlist';
export function rawHtmlMode(root: Record<string, unknown>): RawHtmlMode {
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
export function authorAttrOk(element: string, name: string, value: string, check: UrlCheck): boolean {
  const key = asciiLower(name);
  if (/^on/.test(key)) return false;
  if (!(RAW_ATTRS.test(key) || /^(class|style|tabindex|aria-[a-z]+)$/.test(key))) return false;
  if ((key === 'id' || key === 'name') && RESERVED_ID.test(idKey(value))) return false;
  if (key === 'name' && element !== 'a') return false;
  if (URL_ATTRS.test(key) && !urlOk(value, check, key === 'srcset')) return false;
  return true;
}

/** Is this one strict tag (`<name attrs>` / `</name>`) one allowlist mode keeps? */
function tagOk(close: string, rawName: string, attrs: string, check: UrlCheck): boolean {
  const name = asciiLower(rawName);
  if (!(name in ALLOWED_HTML) && !VOID_HTML.has(name)) return false;
  if (close) return attrs.trim() === '';
  const list = rawAttrs(attrs);
  if (name === 'input') {
    // Only a disabled checkbox (what the task-list rule emits), in any attribute order.
    return list.some(([k, v]) => asciiLower(k) === 'type' && asciiLower(v) === 'checkbox')
      && list.some(([k]) => asciiLower(k) === 'disabled')
      && list.every(([k, v]) => {
        const key = asciiLower(k);
        return (key === 'type' && asciiLower(v) === 'checkbox') || key === 'checked' || key === 'disabled' || (key === 'class' && v === 'task-list-item-checkbox');
      });
  }
  return list.every(([k, v]) => authorAttrOk(name, k, v, check));
}

/**
 * Raw HTML as allowlist mode renders it: listed tags and well-formed comments
 * kept, every other `<` written as `&lt;`. Linear: each `<` is tried once.
 */
export function allowlistHtml(html: string, check: UrlCheck): string {
  let out = '';
  let from = 0;
  // A comment ends at the first `-->` or `--!>` after `<!--` (the browser's rule); the nearest one is found once
  // and reused by every `<!--` before it, so many openers cost one scan, not one each.
  const END = /--!?>/g;
  let end: RegExpExecArray | null = null;
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
    } else {
      STRICT_TAG.lastIndex = at;
      const m = STRICT_TAG.exec(html);
      if (m && tagOk(m[1], m[2], m[3], check)) {
        out += m[0];
        at = from = STRICT_TAG.lastIndex;
        continue;
      }
    }
    out += '&lt;';
    at = from = at + 1;
  }
  return out + html.slice(from);
}
