/**
 * Preview-frame assets — one place that wires the orz-markdown preview the way
 * `references/embedding.md` prescribes, so every host app (mdhtml, slides, paged,
 * the editor) loads identical, tested CDN versions and runs the same
 * highlight / mermaid / SMILES / chart / runtime steps instead of each
 * re-deriving them (and drifting).
 *
 * Usage in a host that mounts rendered HTML in an <iframe>:
 *
 *   import { getPreviewFrameAssets } from 'orz-markdown/preview-frame';
 *   const pa = getPreviewFrameAssets();
 *   const html =
 *     '<!doctype html><html><head><meta charset=utf8>' +
 *     '<link rel=stylesheet href="' + myThemeHref + '">' +
 *     pa.headLinks(scheme) +                       // KaTeX + highlight.js CSS
 *     '</head><body><article class="markdown-body" id="doc"></article>' +
 *     pa.bodyScripts() +                           // libs + runtime + __orzEnhance
 *     '</body></html>';
 *   // mount html in the iframe, then on every render:
 *   iframeWindow.__orzSmilesTheme = scheme;        // 'dark' on dark themes
 *   doc.querySelector('.markdown-body').innerHTML = md.render(src);
 *   iframeWindow.__orzEnhance();
 *   // on theme change, swap the highlight.js stylesheet:
 *   doc.getElementById('orz-hljs').href = pa.hljsCss(scheme);
 */
export type ColorScheme = 'light' | 'dark';
/**
 * Exact versions of the view-time content libraries. Pinned (no `@11`-style
 * ranges) so a document renders the same tomorrow as today, and so an upgrade
 * is a deliberate orz-markdown release that every carrier absorbs by rebuilding.
 * KaTeX follows the KaTeX orz-markdown renders with — its CSS must match the
 * HTML it styles.
 */
export declare const PREVIEW_LIB_VERSIONS: {
    readonly katex: "0.16.47";
    readonly highlightjs: "11.9.0";
    readonly mermaid: "11.17.2";
    readonly smilesDrawer: "1.0.10";
    readonly chartjs: "4.5.1";
};
/** Pinned CDN URLs for the preview-iframe assets (one source of truth). */
export declare const PREVIEW_CDN: {
    readonly katexCss: "https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.css";
    readonly hljsJs: "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js";
    readonly hljsLightCss: "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css";
    readonly hljsDarkCss: "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css";
    readonly mermaidJs: "https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js";
    readonly smilesJs: "https://unpkg.com/smiles-drawer@1.0.10/dist/smiles-drawer.min.js";
    readonly chartJs: "https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js";
};
export interface PreviewFrameAssets {
    /** Pinned CDN URLs. */
    cdn: typeof PREVIEW_CDN;
    /** The orz browser runtime source (copy-as-Markdown + tabs + QR expand). */
    runtimeScript: string;
    /** highlight.js stylesheet URL for a scheme (swap `#orz-hljs`.href on theme change). */
    hljsCss(scheme?: ColorScheme): string;
    /** `<link>` tags for the iframe `<head>`: KaTeX + highlight.js CSS for the scheme.
     *  The highlight.js link carries `id="orz-hljs"` for swapping. */
    headLinks(scheme?: ColorScheme): string;
    /** `<script>` tags for the iframe `<body>`: load the libs + the runtime and
     *  define `window.__orzEnhance()`. Call `__orzEnhance()` after each render
     *  (set `window.__orzSmilesTheme='dark'` first on dark themes). */
    bodyScripts(): string;
}
/**
 * Everything a host app needs to wire the orz-markdown preview iframe the way the
 * bundled themes and tested apps do: the copy-as-Markdown runtime, code
 * highlighting, mermaid / SMILES / chart drawing, tabs, and QR expand.
 * See `references/embedding.md`.
 */
export declare function getPreviewFrameAssets(): PreviewFrameAssets;
/** Options of {@link enhanceDocument}. */
export interface EnhanceOptions {
    /** Colour scheme of the content: the highlight.js stylesheet and SMILES drawing. Default `light`. */
    scheme?: ColorScheme;
    /**
     * Load the pinned libraries and stylesheets the content needs (default
     * `true`). `false`: nothing is fetched; only libraries the page already
     * has run.
     */
    assets?: boolean;
    /** A CSP nonce stamped on every `<script>` and `<link>` this adds. */
    nonce?: string;
    /** Install the orz browser runtime (copy-as-Markdown, QR expansion, tab bars) once per window and run it on `root`. Default `true` (`false` with `static`). */
    runtime?: boolean;
    /**
     * Static enhancement (2.3.0), for print and pagination (orz-paged lays the
     * content out with Paged.js, which re-parses its HTML): everything is drawn
     * as usual — the result resolves only after the libraries loaded (or
     * failed) and the last pass ran — then every canvas drawn here becomes an
     * image of itself (`<img data-orz-frozen="chart" | "smiles">`, its class,
     * `data-md` breadcrumb, accessible name and drawn width kept): a chart is
     * stopped, drawn at least at 2× the CSS pixel ratio (unless its own options
     * set `devicePixelRatio`) and destroyed, so nothing animates, resizes or
     * listens afterwards. The interactive runtime (copy-as-Markdown, QR
     * expansion, tab bars) is not installed unless `runtime: true` is given. A
     * canvas nothing drew (its library failed to load, offline) or that cannot
     * be read (tainted) stays a canvas.
     */
    static?: boolean;
}
/** What {@link enhanceDocument} did: the library URLs it loaded now (or found loading) and those that failed. */
export interface EnhanceResult {
    loaded: string[];
    failed: string[];
    /** With `static` (2.3.0): how many drawn canvases became images. */
    frozen?: number;
}
/** A rendered region (an `.markdown-body` article) in a page, structurally. */
export interface EnhanceRoot {
    querySelector(selector: string): unknown;
    querySelectorAll(selector: string): ArrayLike<unknown>;
    readonly ownerDocument?: unknown;
}
/**
 * A library that failed to load is tried again only after this pause (doubled
 * after each further failure), and at most {@link ENHANCE_MAX_ATTEMPTS} times
 * per window (2.2.0): a re-render while offline does not inject its script
 * again each time.
 */
export declare const ENHANCE_RETRY_MS = 15000;
export declare const ENHANCE_MAX_ATTEMPTS = 3;
/**
 * Enhance content rendered IN A PAGE (a carrier's read view, an app's own
 * view) the way the preview frame enhances its article: highlight.js,
 * Mermaid, SMILES and Chart.js from their pinned URLs (`PREVIEW_CDN`) —
 * each loaded once per window and only when `root` holds something it draws
 * — KaTeX's stylesheet when there is math, the highlight.js stylesheet of the
 * scheme (`#orz-hljs`, swapped on a scheme change), and the orz browser
 * runtime (copy-as-Markdown, QR expansion, tab bars). Scoped to `root`;
 * idempotent (claim M.24): calling it again after a re-render draws only what
 * is new. No `eval`; the runtime is one inline `<script>` (carrying `nonce`).
 * Resolves when every needed library has loaded or failed (offline: the
 * content stays as rendered) and the last pass ran. Touches nothing at module
 * load; without a document it resolves at once.
 */
export declare function enhanceDocument(root: EnhanceRoot, options?: EnhanceOptions): Promise<EnhanceResult>;
/**
 * Release what {@link enhanceDocument} made for `root` (2.2.0, M.26): every
 * Chart.js instance it drew there is destroyed (its listeners, resize
 * observer and registry entry go) and an expanded QR overlay is closed. Call
 * it before replacing `root`'s content when the root itself goes, or before a
 * re-render; `enhanceDocument` also destroys, on each call, the charts whose
 * canvas left `root`. Idempotent; a root never enhanced is a no-op.
 */
export declare function disposeEnhancement(root: EnhanceRoot): void;
/**
 * Swap a stylesheet without a flash (2.2.0, M.27): the `<link id>` with
 * another `href` is added next to the current one and the old one removed
 * only when the new one has loaded (or failed — then the new one stays: it is
 * what the text asks for). A link already at `href` is left; a missing one is
 * created. Returns the link that carries `id` now.
 */
export declare function swapStylesheet(doc: unknown, id: string, href: string, options?: {
    nonce?: string;
}): unknown;
//# sourceMappingURL=preview-frame.d.ts.map