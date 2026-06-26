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
/** Pinned CDN URLs for the preview-iframe assets (one source of truth). */
export declare const PREVIEW_CDN: {
    readonly katexCss: "https://cdn.jsdelivr.net/npm/katex@0.16.35/dist/katex.min.css";
    readonly hljsJs: "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js";
    readonly hljsLightCss: "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css";
    readonly hljsDarkCss: "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css";
    readonly mermaidJs: "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
    readonly smilesJs: "https://unpkg.com/smiles-drawer@1.0.10/dist/smiles-drawer.min.js";
    readonly chartJs: "https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js";
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
//# sourceMappingURL=preview-frame.d.ts.map