"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PREVIEW_CDN = void 0;
exports.getPreviewFrameAssets = getPreviewFrameAssets;
const runtime_js_1 = require("./runtime.js");
/** Pinned CDN URLs for the preview-iframe assets (one source of truth). */
exports.PREVIEW_CDN = {
    katexCss: 'https://cdn.jsdelivr.net/npm/katex@0.16.35/dist/katex.min.css',
    hljsJs: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
    hljsLightCss: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css',
    hljsDarkCss: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css',
    mermaidJs: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
    smilesJs: 'https://unpkg.com/smiles-drawer@1.0.10/dist/smiles-drawer.min.js',
    chartJs: 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js',
};
/** Guard inline <script> content against premature `</script>` termination. */
function guard(js) {
    return js.replace(/<\/(script)/gi, '<\\/$1');
}
/* Body of window.__orzEnhance(). Scoped to .markdown-body so it works whatever
 * id/wrapper the host gives the rendered region. Idempotent: highlight/tabs/QR
 * skip already-processed nodes, SMILES/chart track a JS flag. SMILES honors
 * window.__orzSmilesTheme ('dark' → light bonds); reset its flag and re-run to
 * redraw after a theme switch. */
const ENHANCE_BODY = "var R='.markdown-body ';" +
    "try{if(window.hljs)document.querySelectorAll(R+'pre code:not(.hljs)').forEach(function(b){window.hljs.highlightElement(b)})}catch(e){}" +
    "try{if(window.mermaid)window.mermaid.run({nodes:document.querySelectorAll(R+'.mermaid:not([data-processed])')})}catch(e){}" +
    "try{if(window.SmilesDrawer)document.querySelectorAll(R+'canvas[data-smiles]').forEach(function(v){if(v.__d)return;v.__d=1;if(v.__ow===undefined){v.__ow=v.width;v.__oh=v.height}v.width=v.__ow;v.height=v.__oh;var d=new window.SmilesDrawer.Drawer({width:v.__ow,height:v.__oh});window.SmilesDrawer.parse(v.getAttribute('data-smiles'),function(t){try{d.draw(t,v,window.__orzSmilesTheme||'light',false)}catch(e){}})})}catch(e){}" +
    "try{if(window.Chart)document.querySelectorAll(R+'canvas.orz-chart[data-chart]').forEach(function(v){if(v.__d)return;v.__d=1;var w=v.ownerDocument.createElement('div');w.style.cssText='position:relative;width:100%;max-width:440px;margin:.4em auto';v.parentNode.insertBefore(w,v);w.appendChild(v);v.removeAttribute('width');v.removeAttribute('height');try{var g=JSON.parse(v.getAttribute('data-chart')||'{}');g.options=Object.assign({responsive:true,maintainAspectRatio:true,animation:false},g.options||{});new window.Chart(v,g)}catch(e){}})}catch(e){}" +
    "try{if(window.OrzMarkdownRuntime)window.OrzMarkdownRuntime.init(document)}catch(e){}";
/**
 * Everything a host app needs to wire the orz-markdown preview iframe the way the
 * bundled themes and tested apps do: the copy-as-Markdown runtime, code
 * highlighting, mermaid / SMILES / chart drawing, tabs, and QR expand.
 * See `references/embedding.md`.
 */
function getPreviewFrameAssets() {
    const cdn = exports.PREVIEW_CDN;
    const runtimeScript = (0, runtime_js_1.getBrowserRuntimeScript)();
    return {
        cdn,
        runtimeScript,
        hljsCss(scheme = 'light') {
            return scheme === 'dark' ? cdn.hljsDarkCss : cdn.hljsLightCss;
        },
        headLinks(scheme = 'light') {
            return ('<link rel="stylesheet" href="' + cdn.katexCss + '">' +
                '<link id="orz-hljs" rel="stylesheet" href="' +
                (scheme === 'dark' ? cdn.hljsDarkCss : cdn.hljsLightCss) +
                '">');
        },
        bodyScripts() {
            return ('<script src="' + cdn.hljsJs + '"></script>' +
                '<script src="' + cdn.mermaidJs + '"></script>' +
                '<script src="' + cdn.smilesJs + '"></script>' +
                '<script src="' + cdn.chartJs + '"></script>' +
                '<script>try{mermaid.initialize({startOnLoad:false})}catch(e){}</script>' +
                '<script>' + guard(runtimeScript) + '</script>' +
                '<script>window.__orzEnhance=function(){' + ENHANCE_BODY + '\n};</script>');
        },
    };
}
//# sourceMappingURL=preview-frame.js.map