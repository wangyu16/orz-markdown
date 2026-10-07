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
    /** For `<head>`: the pinned libraries' stylesheet links (with `assets`), the carrier's `head`, the base style (nonce-stamped). */
    head: string;
    /**
     * The bridge `<script>` element (nonce-stamped, carrying the frame's
     * secret in {@link PREVIEW_SECRET_ATTRIBUTE}). The default bridge finds
     * `#orz-doc` when a render arrives, so it can (and should) come first in
     * `<head>`, before the stylesheets, as the default document puts it: a
     * script after a pending stylesheet waits for it. It must come before
     * anything of the document (the secret must be gone before document content
     * exists — it only arrives through the port, after the ready). A carrier's
     * own bridge goes wherever that bridge expects.
     */
    bridge: string;
    /** The pinned preview libraries' `<script>` elements and their ready call (nonce-stamped; empty without `assets`). */
    scripts: string;
    scheme: ColorScheme;
    /** The article class (`articleClass`, default `markdown-body`), attribute-escaped. */
    articleClass: string;
    /**
     * The nonce stamped on the frame's scripts and styles. A carrier's own
     * `<script>` (or `<style>`) in its frame document must carry it under an
     * app's nonce policy, which runs nothing else (B#5).
     */
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
     * (FC-19 §8.4). To get the port (and with it keys, links and scroll) it
     * must do the default bridge's handshake: read and remove
     * {@link PREVIEW_SECRET_ATTRIBUTE} from `document.currentScript` first
     * thing, post `orz-preview-ready { channel, secret }`, take the port from
     * `orz-preview-port { channel }` and send its reports through it.
     */
    bridge?: string;
    /**
     * The frame's secret (set by `createPreview`, a new one for every frame
     * document): written on the bridge's `<script>` as
     * {@link PREVIEW_SECRET_ATTRIBUTE}. Without it the bridge says a plain ready
     * and gets no port (renders only).
     */
    secret?: string;
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
 * The attribute of the bridge's own `<script>` element that carries the
 * frame's secret (FC-19 §8.4, the authenticated channel). A bridge reads it
 * and removes it first thing, before any document content exists.
 */
export declare const PREVIEW_SECRET_ATTRIBUTE = "data-orz-preview-secret";
/**
 * The bridge inside the frame (ES5, no `</script`). Swaps the article's
 * changed top-level nodes (compared without their `data-src-line`, whose new
 * values are copied onto the kept nodes, so a line inserted above does not
 * redraw everything below), enhances, reports anchors with the render's id;
 * forwards scroll, the shell's shortcuts (Cmd/Ctrl+S, Cmd/Ctrl+\, Esc), link
 * clicks and the reader's input (pointer, wheel, touch, keys).
 *
 * Authenticated channel (option B, 2026-10-06). The shell writes a per-frame
 * secret on the bridge's own `<script>` ({@link PREVIEW_SECRET_ATTRIBUTE}); the
 * bridge reads and removes it first thing, synchronously, before any document
 * content exists (that only arrives through the port). Its ready carries the
 * secret and a random `channel`; the shell answers with a MessageChannel port
 * only for a ready with this frame's secret, which the bridge takes in a
 * capture listener registered before anything else in the frame (and hides
 * from the frame's other listeners). A document that replaces the bridge's
 * (`document.open()`, a navigation, a meta refresh) cannot know the secret, so
 * it never gets a port. From then on the shell's messages come through the
 * port, and the bridge sends its own reports through it with `Reflect.apply`
 * and `MessagePort.prototype.postMessage` as they were when it started, so the
 * document's scripts cannot send on it. It reports keys, link clicks, input
 * and scrolls only for trusted events (`isTrusted`) — scrolls (and
 * `navigated`) only within 1.5 s of the reader's own pointer (a press, or a
 * drag), wheel, touch or key in the frame, since a script's scrolling fires trusted scroll events
 * too: what arrives on the port follows the reader's own input in the
 * frame. Accepted limit (FC-19 §8.4): while a document script holds the
 * focus, the reader's keys open that window too, so the document's own
 * scrolling may move the editor's scroll position through scroll sync.
 *
 * It finds `#orz-doc` when a render arrives (so it may run before the
 * article exists, in `<head>`). Page hooks a carrier's frame document may
 * define: `window.__orzPreviewApply(html, msg)` replaces the DOM update (it
 * may return a promise; the bridge reports when it settles, and runs the
 * next render — only the latest — after it: never two at once),
 * `window.__orzPreviewNavigate(line)` receives `orz-preview-navigate`, and
 * `window.__orzPreviewMessage(msg)` any other message from the shell
 * (`shell.preview.post`). `window.__orzPreview.report()` re-reports the
 * anchors; `window.__orzPreview.navigated(line)` reports the source line the
 * preview shows (navigate mode) through the port, only within 1.5 s of the
 * reader's own input in the frame; `window.__orzPreview.post(msg)` posts a
 * carrier's own message to the shell as a plain window message (data).
 */
export declare const PREVIEW_BRIDGE: string;
/**
 * `'sha256-…'` of {@link PREVIEW_BRIDGE}, for a hash-based Content-Security-Policy
 * (`script-src 'sha256-…'`). A test recomputes it; with `assets` the frame has
 * more inline scripts — {@link previewScriptHashes} lists them all. (The
 * secret is an attribute of the `<script>` element, not its text: the hash
 * does not change per frame.)
 */
export declare const PREVIEW_BRIDGE_HASH = "sha256-H1iuz4liwX/FMMxx0fL3854mJcMGhThLP+BrQREttCw=";
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
    /** `s`, `\`, `Escape` pressed inside the frame (the bridge's report through its port: a trusted key event, the reader's own). */
    onKey?(key: string): void;
    /** A link the reader clicked in the frame (through the port: a trusted click). */
    onLink?(href: string): void;
    /** The reader pointed, scrolled, touched or typed in the frame (`input`: `pointer`, `wheel`, `touch`, `key`; through the port). */
    onActive?(input: string | undefined): void;
    /** The frame said ready (again, after a reload): an authenticated ready, or a plain one of a bridge without the port. */
    onReady?(): void;
    /** The frame did not say ready within `readyTimeoutMs` (a CSP that blocks its scripts, a broken bridge). */
    onStall?(): void;
}
/** A message from the preview frame (data). */
export type PreviewMessage = Readonly<Record<string, unknown>> & {
    readonly type: string;
};
export interface PreviewController {
    /** The preview iframe. */
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
    /**
     * Listen to the frame's messages of one type (after the shell's own handling): those through the
     * port, and window messages of a carrier's own types (data; never the `orz-preview-*` types).
     * Returns the unsubscribe.
     */
    on(type: string, fn: (message: PreviewMessage) => void): () => void;
    /** Rebuild the frame document with another `head` / `scheme` / `articleClass` (e.g. a theme or measure change); the last HTML is shown again. */
    setOptions(options: {
        head?: string;
        scheme?: ColorScheme;
        articleClass?: string;
    }): void;
    /** The frame has acknowledged a render by its id since it last said ready (its bridge paces). */
    readonly acknowledges: boolean;
    /**
     * The frame's bridge proved the frame's secret and speaks through the
     * private port (the default bridge): its reports are authenticated. Once
     * true it stays true for this preview.
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