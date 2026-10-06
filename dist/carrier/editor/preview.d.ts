import { type ColorScheme } from '../../preview-frame.js';
import type { EdDocument, EdElement, EdIframe } from './types.js';
/** The preview iframe's sandbox everywhere but a standalone `file:` page (see {@link previewSandbox}). */
export declare const PREVIEW_SANDBOX = "allow-scripts";
/** Where a preview runs: in an app's page, or in a standalone assembled file (and that page's URL scheme). */
export interface PreviewContext {
    host: 'app' | 'standalone';
    /** `location.protocol` of the page (`https:`, `file:`, …). */
    protocol: string;
    /** The page is the top-level window (`window.top === window`). Absent: assumed. */
    topLevel?: boolean;
    /** An app host is connected (`connectHost`): the file runs inside a host frame. */
    connected?: boolean;
}
/**
 * The `sandbox` attribute of the preview iframe for a context — the ONE place
 * it is decided. `allow-scripts` (an opaque origin) everywhere except a
 * standalone file opened from disk.
 *
 * Owner decision 2026-10-06 (finding B-2): in a standalone `file:` page an
 * opaque srcdoc frame is refused `file:` subresources, so the document's
 * relative local images would never show. There the frame also gets
 * `allow-same-origin`. The document's own raw HTML is not filtered (only
 * fetched includes are, M.16/M.20), but in a standalone `file:` page the same
 * document already runs in that page as its read view, so the same-origin
 * frame gives it no reach it did not have: its scripts can reach the editor
 * and the page's storage there, which the owner accepts for local files.
 * Only a top-level page without a connected host counts (F6): a file framed
 * by an app keeps the opaque frame. App hosts and served pages keep it too.
 * Change it only here.
 */
export declare function previewSandbox(context: PreviewContext): string;
/** The pieces of the preview frame's document, for a carrier that writes its own (`frameDocument`). */
export interface PreviewFrameParts {
    /**
     * For `<head>`: the pinned libraries' stylesheet links (with `assets`), the
     * carrier's `head`, the base style (nonce-stamped). While the document's
     * scripts are paused it starts with the `<meta>` Content-Security-Policy
     * that pauses them: place it in `<head>`, before any other script.
     */
    head: string;
    /**
     * The bridge `<script>` element (nonce-stamped). The default bridge finds
     * `#orz-doc` when a render arrives, so it can (and should) come before the
     * stylesheets: a script after a pending stylesheet waits for it. A
     * carrier's own bridge goes wherever that bridge expects.
     */
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
     * Pause the document's own scripts (set by the shell after the document
     * took the keyboard focus): a `<meta>` CSP `script-src 'nonce-…'
     * 'strict-dynamic'` runs only the frame's nonce-stamped scripts (this nonce,
     * or `nonce` when given), not the document's event handlers.
     */
    pauseScripts?: string;
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
 * redraw everything below), enhances, reports anchors with the render's id;
 * forwards scroll, the shell's shortcuts (Cmd/Ctrl+S, Cmd/Ctrl+\, Esc), link
 * clicks and the reader's input (pointer, wheel, touch, keys).
 *
 * Authenticated channel (F1, B#10). Its ready carries a random `channel`;
 * the shell answers with a MessageChannel port for it, which the bridge takes
 * in a capture listener registered before anything else in the frame (and
 * hides from the frame's other listeners) — before any document content
 * exists, since that only arrives through the port. From then on the shell's
 * messages come through the port, and the bridge sends its own reports
 * through it with `Reflect.apply` and `MessagePort.prototype.postMessage` as
 * they were when it started, so the document's scripts cannot send on it.
 * It reports keys, link clicks, input and scrolls only for trusted events
 * (`isTrusted`): what arrives on the port is the reader's own input in the
 * frame, never a document script's. When the frame gains the focus it says
 * whether the reader's own pointer or touch in the frame brought it there
 * (`orz-preview-focus { reader }`): focus a document script takes says
 * `reader: false`. Chrome may move the focus into the frame a moment before
 * the click's pointerdown arrives there: a trusted pointerdown within 1.5 s
 * of a focus reported without one — or of the bridge starting in a frame that
 * already has the focus (a frame reloaded while focused) — sends
 * `{ reader: true, late: true }`; and the shell's `orz-preview-ping { id }`
 * gets `orz-preview-pong { id, pointer }`: whether a trusted pointerdown came
 * after the last focus reported without one (input queued before the ping is
 * handled first).
 *
 * It finds `#orz-doc` when a render arrives (so it may run before the
 * article exists, in `<head>`). Page hooks a carrier's frame document may
 * define: `window.__orzPreviewApply(html, msg)` replaces the DOM update (it
 * may return a promise; the bridge reports when it settles),
 * `window.__orzPreviewNavigate(line)` receives `orz-preview-navigate`, and
 * `window.__orzPreviewMessage(msg)` any other message from the shell
 * (`shell.preview.post`). `window.__orzPreview.report()` re-reports the
 * anchors; `window.__orzPreview.post(msg)` posts a carrier's own message to
 * the shell as a plain window message (a claim, like any other).
 */
export declare const PREVIEW_BRIDGE: string;
/**
 * `'sha256-…'` of {@link PREVIEW_BRIDGE}, for a hash-based Content-Security-Policy
 * (`script-src 'sha256-…'`). A test recomputes it; with `assets` the frame has
 * more inline scripts — {@link previewScriptHashes} lists them all.
 */
export declare const PREVIEW_BRIDGE_HASH = "sha256-b5U0KPkMCBoiEeKodg9ElyhxwmpJaT6BdZ+gmcYdg28=";
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
 * Map every URL of a `srcset` value, keeping everything else as written. Parsed
 * as the HTML standard does (F5): separators are whitespace and commas; a URL
 * runs to the next whitespace (a comma inside it, as in a `data:` URL, is part
 * of it) except trailing commas, which end the candidate; descriptors run to
 * the next comma outside parentheses.
 */
export declare function mapSrcset(value: string, map: (url: string) => string): string;
/**
 * Rewrite the relative asset references of rendered HTML through `resolve`
 * (FC-19 `hooks.resolveAsset`) before it enters the preview: `src`,
 * `poster`, every URL of `srcset` (parsed as {@link mapSrcset}), and `href` on elements other than `<a>` /
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
    /**
     * `s`, `\`, `Escape` pressed inside the frame. `trusted`: reported by the
     * default bridge through its port, from a trusted key event (the reader's own
     * key); otherwise a window message — a claim of the frame's scripts.
     */
    onKey?(key: string, trusted: boolean): void;
    /** A link clicked in the frame; `trusted` as for `onKey` (a trusted click). */
    onLink?(href: string, trusted: boolean): void;
    /**
     * The reader pointed, scrolled, touched or typed in the frame (`input`:
     * `pointer`, `wheel`, `touch`, `key`). `trusted` as for `onKey`; untrusted, it
     * is a claim the shell does not trust alone.
     */
    onActive?(input: string | undefined, trusted: boolean): void;
    /**
     * The frame gained the focus (the default bridge only, through its port):
     * `reader` when the reader's own pointer or touch in the frame brought it
     * there; otherwise a script in the frame took it (or the shell, or a Tab in
     * the page, gave it).
     */
    onFocus?(reader: boolean): void;
    /** The bridge's answer to `orz-preview-ping { id }` (port only): did a trusted pointerdown follow the last focus it reported without one? */
    onPong?(id: number, pointer: boolean): void;
    /** The frame said ready (again, after a reload). */
    onReady?(): void;
    /** The frame did not say ready within `readyTimeoutMs` (a CSP that blocks its scripts, a broken bridge). */
    onStall?(): void;
}
/** A message from the preview frame (a claim of the document's scripts: data, never trusted). */
export type PreviewMessage = Readonly<Record<string, unknown>> & {
    readonly type: string;
};
export interface PreviewController {
    /** The preview iframe (pausing or resuming the document's scripts replaces it with a new one). */
    readonly iframe: EdIframe;
    /**
     * Show this HTML (sent when the frame is ready; the last one is re-sent if
     * the frame reloads). Resolves `true` when the frame reports this render
     * (`orz-preview-rendered` with its id), `false` when the frame was not ready,
     * a newer render replaced it, or the preview went.
     */
    render(html: string): Promise<boolean>;
    scrollTo(top: number): void;
    /** Ask a navigating bridge to show the source line (`orz-preview-navigate`). */
    navigate(line: number): void;
    /** Post a message to the frame's bridge (the carrier's own types). False when the frame is not ready. */
    post(message: Readonly<Record<string, unknown>>): boolean;
    /** Listen to the frame's messages of one type (after the shell's own handling); returns the unsubscribe. */
    on(type: string, fn: (message: PreviewMessage) => void): () => void;
    /** Rebuild the frame document with another `head` / `scheme` (e.g. a theme change); the last HTML is shown again. */
    setOptions(options: {
        head?: string;
        scheme?: ColorScheme;
    }): void;
    /** Rebuild the frame under a CSP that runs only the frame's own nonce-stamped scripts (`nonce`), not the document's. */
    pauseScripts(nonce: string): void;
    /** Rebuild the frame with the document's scripts running again (after a pause that turned out to be the reader's own click). */
    resumeScripts(): void;
    /** The document's scripts are paused (`pauseScripts`). */
    readonly scriptsPaused: boolean;
    /** The frame has acknowledged a render by its id since it last said ready (its bridge paces). */
    readonly acknowledges: boolean;
    /**
     * The frame's bridge speaks through the private port (the default bridge):
     * its reports are authenticated. Once true it stays true for this preview
     * (also while a reloaded frame has not yet taken its new port, when the
     * bridge's report types on the window are ignored all the same).
     */
    readonly authenticated: boolean;
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