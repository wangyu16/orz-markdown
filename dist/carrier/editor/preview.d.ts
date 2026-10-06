import { type ColorScheme } from '../../preview-frame.js';
import type { EdDocument, EdElement, EdIframe } from './types.js';
/** The preview iframe's sandbox: exactly this, never `allow-same-origin`. */
export declare const PREVIEW_SANDBOX = "allow-scripts";
/** Where a preview runs: in an app's page, or in a standalone assembled file (and that page's URL scheme). */
export interface PreviewContext {
    host: 'app' | 'standalone';
    /** `location.protocol` of the page (`https:`, `file:`, …). */
    protocol: string;
}
/**
 * The `sandbox` attribute of the preview iframe for a context — the ONE place
 * it is decided. `allow-scripts` (an opaque origin) everywhere except a
 * standalone file opened from disk.
 *
 * Owner decision 2026-10-06 (finding B-2): in a standalone `file:` page an
 * opaque srcdoc frame is refused `file:` subresources, so the document's
 * relative local images would never show. There the frame also gets
 * `allow-same-origin`: nothing is lost, because the same document already runs
 * in that page (its read view) and raw HTML in it passes the strict allowlist.
 * App hosts and served pages keep the opaque frame. Change it only here.
 */
export declare function previewSandbox(context: PreviewContext): string;
/** The pieces of the preview frame's document, for a carrier that writes its own (`frameDocument`). */
export interface PreviewFrameParts {
    /** For `<head>`: the pinned libraries' stylesheet links (with `assets`), the carrier's `head`, the base style. */
    head: string;
    /** The bridge `<script>` element (nonce-stamped). Place it after the element the bridge renders into. */
    bridge: string;
    /** The pinned preview libraries' `<script>` elements and their ready call (nonce-stamped; empty without `assets`). */
    scripts: string;
    scheme: ColorScheme;
    /** The article class (`articleClass`, default `markdown-body`), attribute-escaped. */
    articleClass: string;
    nonce?: string;
}
export interface PreviewFrameOptions {
    /** Extra `<head>` markup (the carrier's theme stylesheet links): shell markup, never document content. */
    head?: string;
    /** Colour scheme of the preview libraries (highlight.js theme, SMILES). Default `light`. */
    scheme?: ColorScheme;
    /** Class of the article the HTML goes into. Default `markdown-body`. */
    articleClass?: string;
    /** Load the pinned preview libraries (KaTeX CSS, highlight.js, mermaid, SMILES, Chart.js, runtime). Default `true`. */
    assets?: boolean;
    /**
     * A CSP nonce stamped on every `<script>` and `<style>` of the frame
     * document (a `srcdoc` frame inherits the page's policy). For a hash-based
     * policy use `PREVIEW_BRIDGE_HASH` / `previewScriptHashes(options)`.
     */
    nonce?: string;
    /**
     * The bridge script (a carrier's own; default `PREVIEW_BRIDGE`): plain
     * script text, script-safe, speaking the preview message protocol
     * (FC-19 §8.4).
     */
    bridge?: string;
    /** Write the whole frame document from its parts (a carrier's own layout, e.g. slides or pages). */
    frameDocument?(parts: PreviewFrameParts): string;
    /**
     * `true` (default): the bridge keeps unchanged top-level nodes. `false`:
     * every render replaces the content whole, keeping the scroll position (a
     * renderer that reflows nodes, e.g. paged media).
     */
    diff?: boolean;
}
/**
 * The bridge inside the frame (ES5, no `</script`). Swaps the article's
 * changed top-level nodes (compared without their `data-src-line`, whose new
 * values are copied onto the kept nodes, so a line inserted above does not
 * redraw everything below), enhances, reports anchors; forwards scroll, the
 * shell's shortcuts (Cmd/Ctrl+S, Cmd/Ctrl+\, Esc) and link clicks.
 */
export declare const PREVIEW_BRIDGE: string;
/**
 * `'sha256-…'` of {@link PREVIEW_BRIDGE}, for a hash-based Content-Security-Policy
 * (`script-src 'sha256-…'`). A test recomputes it; with `assets` the frame has
 * more inline scripts — {@link previewScriptHashes} lists them all.
 */
export declare const PREVIEW_BRIDGE_HASH = "sha256-vGxwt7AxICnk1qS6ExQKrJyNG3WKyC+TyCPieX6Xy8E=";
/** The pieces of the frame document for these options. */
export declare function previewFrameParts(options?: PreviewFrameOptions): PreviewFrameParts;
/** The preview frame's `srcdoc`. */
export declare function previewFrameDocument(options?: PreviewFrameOptions): string;
/**
 * `'sha256-…'` of every inline `<script>` in the frame document for these
 * options (the bridge, and with `assets` the libraries' setup, the runtime and
 * `__orzEnhance`), for a hash-based CSP. Needs Web Crypto (`crypto.subtle`).
 */
export declare function previewScriptHashes(options?: PreviewFrameOptions): Promise<string[]>;
/**
 * Rewrite the relative asset references of rendered HTML through `resolve`
 * (FC-19 `hooks.resolveAsset`) before it enters the preview: `src`,
 * `poster`, every URL of `srcset`, and `href` on elements other than `<a>` /
 * `<area>` (links stay as written; a click goes to `resolveLink`). A resolver
 * that throws or returns a non-string leaves the reference as it was. Tags
 * the pattern cannot read are left unchanged.
 */
export declare function rewriteAssetUrls(html: string, resolve: (path: string) => string): string;
export interface PreviewEvents {
    /** The frame reported anchors after a render (`[line, top]`, sorted by top) and its scrollable height. */
    onRendered?(anchors: Array<[number, number]>, max: number): void;
    /** The frame scrolled: its top and scrollable height, or (a navigating bridge) the source line it shows. */
    onScrolled?(top: number, max: number, line?: number): void;
    /** `s`, `\`, `Escape` pressed inside the frame. */
    onKey?(key: string): void;
    onLink?(href: string): void;
    /** The frame says the reader pointed into it (a claim of the frame: the shell does not trust it alone). */
    onActive?(): void;
    /** The frame said ready (again, after a reload). */
    onReady?(): void;
    /** The frame did not say ready within `readyTimeoutMs` (a CSP that blocks its scripts, a broken bridge). */
    onStall?(): void;
}
export interface PreviewController {
    readonly iframe: EdIframe;
    /** Show this HTML (sent when the frame is ready; the last one is re-sent if the frame reloads). */
    render(html: string): void;
    scrollTo(top: number): void;
    /** Ask a navigating bridge to show the source line (`orz-preview-navigate`). */
    navigate(line: number): void;
    readonly anchors: ReadonlyArray<[number, number]>;
    readonly max: number;
    readonly ready: boolean;
    destroy(): void;
}
/** How long the frame may take to say ready before `onStall`. */
export declare const PREVIEW_READY_TIMEOUT_MS = 8000;
/** Create the sandboxed preview iframe in `parent` and talk to it. */
export declare function createPreview(doc: EdDocument, parent: EdElement, options: PreviewFrameOptions & {
    title?: string;
    context?: PreviewContext;
    readyTimeoutMs?: number;
}, events: PreviewEvents): PreviewController;
/**
 * The preview top for a (fractional) source line: linear between the
 * anchors around it, from the top of the page (line 0 at 0) to the first
 * anchor, and the last anchor's top beyond it.
 */
export declare function lineToTop(anchors: ReadonlyArray<[number, number]>, line: number): number;
/** The (fractional) source line at a preview top: the inverse of {@link lineToTop}. */
export declare function topToLine(anchors: ReadonlyArray<[number, number]>, top: number): number;
//# sourceMappingURL=preview.d.ts.map