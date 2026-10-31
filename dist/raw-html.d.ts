/** element: required parent among the raw elements, or null for "anywhere" (M.20). */
export declare const ALLOWED_HTML: Record<string, readonly string[] | null>;
export declare const VOID_HTML: Set<string>;
export declare const STRICT_TAG: RegExp;
export declare const STRICT_COMMENT: RegExp;
/** Attributes fetched raw HTML may carry (M.20: no `class`, no `style`). */
export declare const RAW_ATTRS: RegExp;
/** Attributes that hold a URL: validated like a Markdown link (no `javascript:`). */
export declare const URL_ATTRS: RegExp;
/** Ids the renderer gives out at render time: a document's own HTML cannot claim them either (they shadow page globals). */
export declare const RESERVED_ID: RegExp;
/** An id as the browser matches it: a fragment is tried percent-decoded too. */
export declare function idKey(v: string): string;
/** The attributes of a strict tag's attribute text. */
export declare function rawAttrs(source: string): Array<[string, string]>;
/** What a URL check needs from the parser: markdown-it's own `unescapeAll` and `validateLink`. */
export interface UrlCheck {
    unescapeAll(s: string): string;
    validateLink(url: string): boolean;
}
/** Is a URL attribute's value one a Markdown link would also allow (entities decoded, controls removed, as a browser reads it)? */
export declare function urlOk(raw: string, check: UrlCheck, srcset?: boolean): boolean;
/** The render setting: `"allow"` (or none) trusts the author; any other value is the allowlist (fail closed). */
export type RawHtmlMode = 'allow' | 'allowlist';
export declare function rawHtmlMode(root: Record<string, unknown>): RawHtmlMode;
/**
 * An attribute an author's own HTML (or `{{attrs[…]}}`) may carry in allowlist
 * mode: the fetched-text list plus `class`, `style`, `tabindex` and `aria-*`
 * (a document's own layout is its author's), never an event handler, never a
 * URL a Markdown link would refuse, never an id the renderer reserves, and
 * `name` only on `<a>` (on other elements it shadows document methods).
 */
export declare function authorAttrOk(element: string, name: string, value: string, check: UrlCheck): boolean;
/**
 * Raw HTML as allowlist mode renders it: listed tags and well-formed comments
 * kept, every other `<` written as `&lt;`. Linear: each `<` is tried once.
 */
export declare function allowlistHtml(html: string, check: UrlCheck): string;
//# sourceMappingURL=raw-html.d.ts.map