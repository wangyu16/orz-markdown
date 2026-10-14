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

import { getBrowserRuntimeScript } from './runtime.js';
import { BASELINE_GRID_SCRIPT } from './baseline-grid.js';
import { CONTENT_THEME_SCRIPT } from './content-theme.js';
import { KATEX_VERSION } from './version.js';

export { CONTENT_THEME_SCRIPT } from './content-theme.js';

export { BASELINE_GRID_SCRIPT, GRID_ATTRIBUTE, GRID_OFF_CLASS, GRID_PICTURE_CLASS } from './baseline-grid.js';

export type ColorScheme = 'light' | 'dark';

/**
 * Exact versions of the view-time content libraries. Pinned (no `@11`-style
 * ranges) so a document renders the same tomorrow as today, and so an upgrade
 * is a deliberate orz-markdown release that every carrier absorbs by rebuilding.
 * KaTeX follows the KaTeX orz-markdown renders with — its CSS must match the
 * HTML it styles.
 */
export const PREVIEW_LIB_VERSIONS = {
  katex: KATEX_VERSION,
  highlightjs: '11.9.0',
  mermaid: '11.17.2',
  smilesDrawer: '1.0.10',
  chartjs: '4.5.1',
} as const;

const V = PREVIEW_LIB_VERSIONS;

/** Pinned CDN URLs for the preview-iframe assets (one source of truth). */
export const PREVIEW_CDN = {
  katexCss: `https://cdn.jsdelivr.net/npm/katex@${V.katex}/dist/katex.min.css`,
  hljsJs: `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${V.highlightjs}/highlight.min.js`,
  hljsLightCss: `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${V.highlightjs}/styles/github.min.css`,
  hljsDarkCss: `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${V.highlightjs}/styles/atom-one-dark.min.css`,
  mermaidJs: `https://cdn.jsdelivr.net/npm/mermaid@${V.mermaid}/dist/mermaid.min.js`,
  smilesJs: `https://unpkg.com/smiles-drawer@${V.smilesDrawer}/dist/smiles-drawer.min.js`,
  chartJs: `https://cdn.jsdelivr.net/npm/chart.js@${V.chartjs}/dist/chart.umd.min.js`,
} as const;

/** Guard inline <script> content against premature `</script>` termination. */
function guard(js: string): string {
  return js.replace(/<\/(script)/gi, '<\\/$1');
}

/*
 * The frame's drawing (2.4.0; `enhanceRoot`'s twin, M.8): SMILES and
 * charts inside `.markdown-body`, each drawn once and only when it is visible
 * (laid out with a size) — a hidden one waits (a ResizeObserver draws it
 * when it gets a size, `__orzRedraw(el)` when it is shown otherwise);
 * Mermaid diagrams (`__orzDrawMermaid`) likewise, when laid out (M.35);
 * SMILES at the size of its box (its 250×180 when the box is not
 * constrained), charts themed by `OrzContentTheme.chart` (CSS custom
 * properties) in a frame `.orz-chart-frame` (max width `--chart-max-width`,
 * 440px). `__orzRedraw(el)` draws what waits in `el`, resizes its charts
 * and redraws its SMILES at their box's size now. Plain ES5.
 */
const FRAME_DRAW_SCRIPT = String.raw`(function(){
var L=function(f){try{return f()}catch(e){return false}};
var vis=function(el){var T=window.OrzContentTheme;if(T&&typeof T.visible==='function')return T.visible(el);try{return el.isConnected&&el.getClientRects().length>0}catch(e){return false}};
var lay=function(el){var T=window.OrzContentTheme;if(T&&typeof T.laidOut==='function')return T.laidOut(el);try{return el.isConnected&&el.getClientRects().length>0}catch(e){return false}};
var ro=null;
var pend=function(v,draw,test){v.__orzPend=draw;v.__orzTest=test||vis;if(!ro&&typeof ResizeObserver==='function')ro=new ResizeObserver(function(es){es.forEach(function(e){var t=e.target;if(t.__orzPend&&(t.__orzTest||vis)(t)){var d=t.__orzPend;t.__orzPend=null;ro.unobserve(t);d()}})});if(ro)ro.observe(v)};
var mm=function(ns){try{var T=window.OrzContentTheme;if(T&&typeof T.runMermaid==='function')T.runMermaid(window.mermaid,ns);else window.mermaid.run({nodes:ns})}catch(e){}};
var box=function(v){if(v.__ow===undefined){v.__ow=v.width;v.__oh=v.height}v.width=v.__ow;v.height=v.__oh;v.style.width='';v.style.height='';var w=v.clientWidth,h=v.clientHeight;if(w>0&&h>0&&(Math.abs(w-v.__ow)>=1||Math.abs(h-v.__oh)>=1))return[w,h];return[v.__ow,v.__oh]};
var smiles=function(v){var b=box(v);v.__dw=b[0];v.__dh=b[1];var d=new window.SmilesDrawer.Drawer({width:b[0],height:b[1]});window.SmilesDrawer.parse(v.getAttribute('data-smiles'),function(t){try{d.draw(t,v,window.__orzSmilesTheme||'light',false)}catch(e){}})};
var chart=function(v){var w=v.ownerDocument.createElement('div');w.className='orz-chart-frame';w.style.cssText='position:relative;width:100%;max-width:var(--chart-max-width,440px);margin:.4em auto';v.parentNode.insertBefore(w,v);w.appendChild(v);v.removeAttribute('width');v.removeAttribute('height');try{var g=JSON.parse(v.getAttribute('data-chart')||'{}');g.options=Object.assign({responsive:true,maintainAspectRatio:true,animation:false},g.options||{});if(!((g.data&&g.data.datasets)||[]).some(function(d){return d&&d.label})){g.options.plugins=Object.assign({},g.options.plugins,{legend:{display:false}})}var T=window.OrzContentTheme;if(T&&typeof T.chart==='function')g=T.chart(v,g);v.__orzChart=new window.Chart(v,g)}catch(e){try{v.setAttribute('data-chart-error',String(e&&e.message||e).slice(0,200))}catch(x){}}};
var S=function(){return L(function(){return typeof window.SmilesDrawer.parse==='function'&&typeof window.SmilesDrawer.Drawer==='function'})};
var C=function(){return L(function(){return typeof window.Chart==='function'})};
var M=function(){return L(function(){return typeof window.mermaid.run==='function'})};
window.__orzDrawMermaid=function(root){
if(!M())return;var now=[];
try{root.querySelectorAll('.markdown-body .mermaid:not([data-processed])').forEach(function(n){if(n.__orzPend){if(lay(n)){n.__orzPend=null;if(ro)ro.unobserve(n);now.push(n)}return}if(lay(n))now.push(n);else pend(n,function(){mm([n])},lay)})}catch(e){}
if(now.length)mm(now)};
window.__orzDrawCanvases=function(root){
try{if(S())root.querySelectorAll('.markdown-body canvas[data-smiles]').forEach(function(v){if(v.__d){if(v.__orzPend&&vis(v)){var d=v.__orzPend;v.__orzPend=null;if(ro)ro.unobserve(v);d()}return}v.__d=1;if(vis(v))smiles(v);else pend(v,function(){smiles(v)})})}catch(e){}
try{if(C())root.querySelectorAll('.markdown-body canvas.orz-chart[data-chart]').forEach(function(v){if(v.__d){if(v.__orzPend&&vis(v)){var d=v.__orzPend;v.__orzPend=null;if(ro)ro.unobserve(v);d()}return}v.__d=1;if(vis(v))chart(v);else pend(v,function(){chart(v)})})}catch(e){}
};
window.__orzRedraw=function(el){
el=el||document;var q=function(s){var a=[].slice.call(el.querySelectorAll?el.querySelectorAll(s):[]);if(el.matches&&el.matches(s))a.unshift(el);return a};
q('canvas[data-smiles],canvas.orz-chart[data-chart],.mermaid').forEach(function(v){
if(v.__orzPend){if(!(v.__orzTest||vis)(v))return;var d=v.__orzPend;v.__orzPend=null;if(ro)ro.unobserve(v);d();return}
if(!vis(v))return;
if(v.__orzChart){try{v.__orzChart.resize()}catch(e){}return}
if(v.__d&&v.hasAttribute('data-smiles')&&S())smiles(v)
})};
})();`;

/* Body of window.__orzEnhance(). Scoped to .markdown-body so it works whatever
 * id/wrapper the host gives the rendered region. Idempotent: highlight/tabs/QR
 * skip already-processed nodes, SMILES/chart track a JS flag. SMILES honors
 * window.__orzSmilesTheme ('dark' → light bonds); reset its flag and re-run to
 * redraw after a theme switch. A chart whose datasets are all unnamed
 * (`data: …` shorthand) hides its legend instead of showing "undefined".
 * Mermaid diagrams are drawn only when laid out (2.4.0, M.35: one under
 * `display: none` waits; `__orzRedraw(el)` or a ResizeObserver draws it).
 * Last, the baseline grid (2.3.0, M.31) watches every article: it acts only
 * where the theme sets `--orz-grid` (light-playful-1's ruled notebook). */
const ENHANCE_BODY =
  "var R='.markdown-body ';" +
  "var L=function(f){try{return f()}catch(e){return false}};" +
  "var H=L(function(){return typeof window.hljs.highlightElement==='function'}),M=L(function(){return typeof window.mermaid.run==='function'}),S=L(function(){return typeof window.SmilesDrawer.parse==='function'&&typeof window.SmilesDrawer.Drawer==='function'}),C=L(function(){return typeof window.Chart==='function'}),O=L(function(){return typeof window.OrzMarkdownRuntime.init==='function'});" +
  "try{if(H)document.querySelectorAll(R+'pre code:not(.hljs)').forEach(function(b){window.hljs.highlightElement(b)})}catch(e){}" +
  "var T=L(function(){return typeof window.OrzContentTheme.chart==='function'})?window.OrzContentTheme:null;" +
  "try{if(M&&typeof window.__orzDrawMermaid==='function')window.__orzDrawMermaid(document);else if(M){var ns=[].slice.call(document.querySelectorAll(R+'.mermaid:not([data-processed])'));if(ns.length){if(T)T.runMermaid(window.mermaid,ns);else window.mermaid.run({nodes:ns})}}}catch(e){}" +
  "try{if(typeof window.__orzDrawCanvases==='function')window.__orzDrawCanvases(document)}catch(e){}" +
  "try{if(O)window.OrzMarkdownRuntime.init(document)}catch(e){}" +
  "try{if(L(function(){return typeof window.OrzBaselineGrid.watch==='function'}))document.querySelectorAll('.markdown-body').forEach(function(a){window.OrzBaselineGrid.watch(a)})}catch(e){}";

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
   *  (set `window.__orzSmilesTheme='dark'` first on dark themes). It also
   *  keeps an article on its theme's baseline grid (2.3.0, M.31). */
  bodyScripts(): string;
}

/**
 * Everything a host app needs to wire the orz-markdown preview iframe the way the
 * bundled themes and tested apps do: the copy-as-Markdown runtime, code
 * highlighting, mermaid / SMILES / chart drawing, tabs, and QR expand.
 * See `references/embedding.md`.
 */
export function getPreviewFrameAssets(): PreviewFrameAssets {
  const cdn = PREVIEW_CDN;
  const runtimeScript = getBrowserRuntimeScript();
  return {
    cdn,
    runtimeScript,
    hljsCss(scheme: ColorScheme = 'light'): string {
      return scheme === 'dark' ? cdn.hljsDarkCss : cdn.hljsLightCss;
    },
    headLinks(scheme: ColorScheme = 'light'): string {
      return (
        '<link rel="stylesheet" href="' + cdn.katexCss + '">' +
        '<link id="orz-hljs" rel="stylesheet" href="' +
        (scheme === 'dark' ? cdn.hljsDarkCss : cdn.hljsLightCss) +
        '">'
      );
    },
    bodyScripts(): string {
      return (
        '<script src="' + cdn.hljsJs + '"></script>' +
        '<script src="' + cdn.mermaidJs + '"></script>' +
        '<script src="' + cdn.smilesJs + '"></script>' +
        '<script src="' + cdn.chartJs + '"></script>' +
        '<script>try{mermaid.initialize({startOnLoad:false})}catch(e){}</script>' +
        '<script>' + guard(runtimeScript) + '</script>' +
        '<script>' + guard(BASELINE_GRID_SCRIPT) + '</script>' +
        '<script>' + guard(CONTENT_THEME_SCRIPT) + '</script>' +
        '<script>' + guard(FRAME_DRAW_SCRIPT) + '</script>' +
        '<script>window.__orzEnhance=function(){' + ENHANCE_BODY + '\n};</script>'
      );
    },
  };
}

// ── In-page enhancement (2.2.0) ─────────────────────────────────────────────

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
  /**
   * Keep each article (`.markdown-body`: `root` itself, or those inside it)
   * on its theme's baseline grid (2.3.0, M.31): where the theme sets
   * `--orz-grid` (light-playful-1 on screen) every block is placed on the
   * ruled lines or as a sheet from rule to rule, again whenever the
   * article's size changes; other themes are left as they are. Installs one
   * inline script per window (`BASELINE_GRID_SCRIPT`, carrying `nonce`).
   * Default `true` (`false` with `static`: a paginated layout has its own).
   */
  grid?: boolean;
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

type AnyEl = {
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
};
type EnhanceWin = AnyEl;

/**
 * Whether a library's API is on the window — probed by what it offers, never
 * by its name alone: a document element whose id is the library's global
 * (a heading "Mermaid" → `id="mermaid"`, named access on `window`) is not the
 * library (2.3.0, M.29). A probe that throws (a cross-origin frame of that
 * name) says no. `__orzEnhance` probes the same way.
 */
const probe = (f: () => boolean): boolean => { try { return f() === true; } catch { return false; } };
const LIB = {
  hljs: (w: EnhanceWin): boolean => probe(() => typeof w.hljs.highlightElement === 'function'),
  mermaid: (w: EnhanceWin): boolean => probe(() => typeof w.mermaid.run === 'function'),
  smiles: (w: EnhanceWin): boolean => probe(() => typeof w.SmilesDrawer.parse === 'function' && typeof w.SmilesDrawer.Drawer === 'function'),
  chart: (w: EnhanceWin): boolean => probe(() => typeof w.Chart === 'function'),
  runtime: (w: EnhanceWin): boolean => probe(() => typeof w.OrzMarkdownRuntime.init === 'function'),
};

/** The libraries in-page enhancement may load: each with the selector of the content that needs it and the probe of its API (M.29). */
const PAGE_LIBS: ReadonlyArray<{ url: string; needs: string; ready(w: EnhanceWin): boolean; setup?(w: EnhanceWin): void }> = [
  { url: PREVIEW_CDN.hljsJs, needs: 'pre code', ready: LIB.hljs },
  { url: PREVIEW_CDN.mermaidJs, needs: '.mermaid', ready: LIB.mermaid, setup: (w) => { w.mermaid?.initialize?.({ startOnLoad: false }); } },
  { url: PREVIEW_CDN.smilesJs, needs: 'canvas[data-smiles]', ready: LIB.smiles },
  { url: PREVIEW_CDN.chartJs, needs: 'canvas.orz-chart', ready: LIB.chart },
];

/** Library loads per window (a page loads each library once). */
const pageLoads = new WeakMap<object, Map<string, Promise<boolean>>>();
/** Failed library loads per window: how many attempts failed, and when the last one did. */
const pageFailures = new WeakMap<object, Map<string, { attempts: number; at: number }>>();

/**
 * A library that failed to load is tried again only after this pause (doubled
 * after each further failure), and at most {@link ENHANCE_MAX_ATTEMPTS} times
 * per window (2.2.0): a re-render while offline does not inject its script
 * again each time.
 */
export const ENHANCE_RETRY_MS = 15_000;
export const ENHANCE_MAX_ATTEMPTS = 3;

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
export async function enhanceDocument(root: EnhanceRoot, options: EnhanceOptions = {}): Promise<EnhanceResult> {
  const result: EnhanceResult = { loaded: [], failed: [] };
  const doc = (root.ownerDocument ?? root) as AnyEl;
  const win = doc?.defaultView as EnhanceWin | null | undefined;
  if (!doc || typeof doc.createElement !== 'function' || !win) return result;
  const scheme: ColorScheme = options.scheme === 'dark' ? 'dark' : 'light';
  const assets = options.assets !== false;
  const nonce = typeof options.nonce === 'string' && options.nonce ? options.nonce : undefined;
  const has = (sel: string): boolean => { try { return !!root.querySelector(sel); } catch { return false; } };
  const head = (doc.head ?? doc.documentElement) as AnyEl;
  win.__orzSmilesTheme = scheme;

  // stylesheets the content needs (KaTeX's, highlight.js's of the scheme)
  if (assets) {
    const links = (): AnyEl[] => Array.from(doc.querySelectorAll('link[rel="stylesheet"]') as ArrayLike<AnyEl>);
    const ensure = (href: string, id?: string): void => {
      if (id) {
        const el = doc.getElementById(id) as AnyEl | null;
        // a scheme change: the new stylesheet loads before the old one goes (no unstyled flash)
        if (el && String(el.tagName).toUpperCase() === 'LINK') { if (el.getAttribute('href') !== href) swapStylesheet(doc, id, href, nonce ? { nonce } : {}); return; }
      }
      if (links().some((l) => l.getAttribute('href') === href)) return;
      const l = doc.createElement('link') as AnyEl;
      l.setAttribute('rel', 'stylesheet');
      l.setAttribute('href', href);
      if (id) l.setAttribute('id', id);
      if (nonce) l.setAttribute('nonce', nonce);
      head.appendChild(l);
    };
    if (has('.katex')) ensure(PREVIEW_CDN.katexCss);
    if (has('pre code')) ensure(scheme === 'dark' ? PREVIEW_CDN.hljsDarkCss : PREVIEW_CDN.hljsLightCss, 'orz-hljs');
  }

  // the runtime: once per window (a static enhancement skips it unless asked)
  const isStatic = options.static === true;
  if (isStatic ? options.runtime === true : options.runtime !== false) {
    if (!LIB.runtime(win)) {
      const s = doc.createElement('script') as AnyEl;
      if (nonce) s.setAttribute('nonce', nonce);
      s.textContent = getBrowserRuntimeScript({ autoInit: false });
      head.appendChild(s);
    }
    try { if (LIB.runtime(win)) win.OrzMarkdownRuntime.init(root); } catch { /* the runtime's own error */ }
  }

  // charts and diagrams themed from CSS custom properties (2.4.0): the theme kit, once per window
  if (has('.mermaid') || has('canvas.orz-chart')) installThemeKit(doc, win, head, nonce);
  // charts of content no longer in root (a re-render replaced it) are destroyed first (M.26)
  releaseDetached(root);
  const pass = async (): Promise<void> => { await enhanceRoot(root, win, isStatic); };
  const finish = (): EnhanceResult => {
    if (isStatic) result.frozen = freezeCanvases(root);
    return result;
  };
  await pass();
  // the baseline grid (2.3.0, M.31): after the first pass, so the first paint is already on the lines
  if (options.grid ?? !isStatic) watchGrid(root, doc, win, head, nonce);
  if (!assets) return finish();

  let loads = pageLoads.get(win);
  if (!loads) { loads = new Map(); pageLoads.set(win, loads); }
  let failures = pageFailures.get(win);
  if (!failures) { failures = new Map(); pageFailures.set(win, failures); }
  const now = (): number => { try { const t = Number(win.Date?.now?.()); return Number.isFinite(t) ? t : Date.now(); } catch { return Date.now(); } };
  const pending: Array<Promise<void>> = [];
  for (const lib of PAGE_LIBS) {
    if (!has(lib.needs) || lib.ready(win)) continue;
    let p = loads.get(lib.url);
    const failed = failures.get(lib.url);
    if (!p && failed && (failed.attempts >= ENHANCE_MAX_ATTEMPTS || now() - failed.at < ENHANCE_RETRY_MS * 2 ** (failed.attempts - 1))) {
      // failed before, and not yet due again (or never again in this window): reported, not injected
      result.failed.push(lib.url);
      continue;
    }
    if (!p) {
      p = new Promise<boolean>((resolve) => {
        const s = doc.createElement('script') as AnyEl;
        s.setAttribute('src', lib.url);
        if (nonce) s.setAttribute('nonce', nonce);
        s.async = true;
        s.addEventListener('load', () => { failures!.delete(lib.url); try { lib.setup?.(win); } catch { /* the library's own error */ } resolve(true); });
        s.addEventListener('error', () => {
          // offline: tried again after a pause, a bounded number of times (the failed element goes)
          loads!.delete(lib.url);
          const prev = failures!.get(lib.url);
          failures!.set(lib.url, { attempts: (prev?.attempts ?? 0) + 1, at: now() });
          try { s.remove(); } catch { /* gone */ }
          resolve(false);
        });
        head.appendChild(s);
      });
      loads.set(lib.url, p);
    }
    pending.push(p.then(async (ok) => { (ok ? result.loaded : result.failed).push(lib.url); if (ok) await pass(); }));
  }
  await Promise.all(pending);
  return finish();
}

/** The articles of `root`: itself when it is one, else those inside it. */
function articlesOf(root: EnhanceRoot): AnyEl[] {
  const r = root as unknown as AnyEl;
  try { if (r.classList?.contains?.('markdown-body')) return [r]; } catch { /* not an element */ }
  try { return Array.from(root.querySelectorAll('.markdown-body') as ArrayLike<AnyEl>); } catch { return []; }
}

/** Install the baseline grid once per window (an inline script, like the runtime) and watch `root`'s articles. */
function watchGrid(root: EnhanceRoot, doc: AnyEl, win: EnhanceWin, head: AnyEl, nonce: string | undefined): void {
  const ready = (): boolean => probe(() => typeof win.OrzBaselineGrid.watch === 'function');
  if (!ready()) {
    const s = doc.createElement('script') as AnyEl;
    if (nonce) s.setAttribute('nonce', nonce);
    s.textContent = BASELINE_GRID_SCRIPT;
    head.appendChild(s);
  }
  if (!ready()) return; // blocked (a CSP without the nonce): the content stays as the CSS lays it out
  for (const a of articlesOf(root)) { try { win.OrzBaselineGrid.watch(a); } catch { /* the grid's own error */ } }
}

/**
 * A static enhancement's last step (2.3.0): every canvas drawn in `root` (a
 * chart, a SMILES drawing) becomes an image of what it shows. Returns how
 * many did.
 */
function freezeCanvases(root: EnhanceRoot): number {
  let n = 0;
  const all = (sel: string): AnyEl[] => { try { return Array.from(root.querySelectorAll(sel) as ArrayLike<AnyEl>); } catch { return []; } };
  const charts = drawnCharts.get(root) ?? [];
  for (const v of all('canvas.orz-chart[data-chart], canvas[data-smiles]')) {
    if (!v.__d || v.__orzPend) continue; // nothing drew it
    const tracked = charts.find((x) => x.canvas === v);
    try {
      tracked?.chart?.stop?.();
      const src = String(v.toDataURL('image/png'));
      if (!src.startsWith('data:image/png')) continue;
      const img = v.ownerDocument.createElement('img') as AnyEl;
      img.setAttribute('src', src);
      const cls = v.getAttribute('class');
      if (cls) img.setAttribute('class', cls);
      img.setAttribute('data-orz-frozen', v.hasAttribute('data-smiles') ? 'smiles' : 'chart');
      const md = v.getAttribute('data-md');
      if (md !== null) img.setAttribute('data-md', md); // the copy-as-Markdown breadcrumb
      const name = v.getAttribute('aria-label');
      img.setAttribute('alt', name ?? '');
      const r = typeof v.getBoundingClientRect === 'function' ? v.getBoundingClientRect() : null;
      const width = v.style?.width || (r && r.width > 0 ? `${Math.round(r.width)}px` : '') || (v.__ow ? `${v.__ow}px` : '');
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      if (width) img.style.width = width;
      v.replaceWith(img);
      n++;
    } catch {
      continue; // a tainted or unreadable canvas stays
    }
    if (tracked) {
      destroyChart(tracked.chart);
      const i = charts.indexOf(tracked);
      if (i >= 0) charts.splice(i, 1);
    }
  }
  if (drawnCharts.has(root) && charts.length === 0) drawnCharts.delete(root);
  return n;
}

/** Chart.js instances drawn per enhanced root, with their canvas (M.26). */
const drawnCharts = new WeakMap<object, Array<{ chart: AnyEl; canvas: AnyEl }>>();

function track(root: EnhanceRoot, chart: AnyEl, canvas: AnyEl): void {
  let list = drawnCharts.get(root);
  if (!list) drawnCharts.set(root, (list = []));
  list.push({ chart, canvas });
}

const destroyChart = (c: AnyEl): void => { try { c?.destroy?.(); } catch { /* Chart.js's own error */ } };

/** Destroy the charts of `root` whose canvas is no longer inside it (the content was re-rendered). */
function releaseDetached(root: EnhanceRoot): void {
  releaseWaiting(root, false);
  const list = drawnCharts.get(root);
  if (!list) return;
  const inside = (n: AnyEl): boolean => {
    try {
      const r = root as unknown as AnyEl;
      return typeof r.contains === 'function' ? r.contains(n) && n.isConnected !== false : n.isConnected !== false;
    } catch { return false; }
  };
  const kept = list.filter((x) => { if (inside(x.canvas)) return true; destroyChart(x.chart); return false; });
  if (kept.length) drawnCharts.set(root, kept); else drawnCharts.delete(root);
}

/** Stop waiting for the canvases of `root` (all, or those no longer inside it). */
function releaseWaiting(root: EnhanceRoot, all: boolean): void {
  const set = waitingByRoot.get(root);
  if (!set) return;
  const r = root as unknown as AnyEl;
  for (const v of [...set]) {
    let inside = false;
    try { inside = !all && v.isConnected !== false && (typeof r.contains !== 'function' || r.contains(v)); } catch { inside = false; }
    if (!inside) unwait(v);
  }
  if (set.size === 0) waitingByRoot.delete(root);
}

/**
 * Release what {@link enhanceDocument} made for `root` (2.2.0, M.26): every
 * Chart.js instance it drew there is destroyed (its listeners, resize
 * observer and registry entry go), an expanded QR overlay is closed, and
 * the baseline grid (2.3.0, M.31) stops watching its articles and takes back
 * what it set. Call
 * it before replacing `root`'s content when the root itself goes, or before a
 * re-render; `enhanceDocument` also destroys, on each call, the charts whose
 * canvas left `root`. Idempotent; a root never enhanced is a no-op.
 */
export function disposeEnhancement(root: EnhanceRoot): void {
  releaseWaiting(root, true);
  const list = drawnCharts.get(root);
  drawnCharts.delete(root);
  for (const x of list ?? []) destroyChart(x.chart);
  try {
    const win = ((root.ownerDocument ?? root) as AnyEl)?.defaultView as EnhanceWin | null | undefined;
    win?.OrzMarkdownRuntime?.collapseQr?.();
  } catch { /* no runtime */ }
  try {
    const win = ((root.ownerDocument ?? root) as AnyEl)?.defaultView as EnhanceWin | null | undefined;
    if (win && probe(() => typeof win.OrzBaselineGrid.release === 'function')) for (const a of articlesOf(root)) win.OrzBaselineGrid.release(a);
  } catch { /* no grid */ }
}

/**
 * Swap a stylesheet without a flash (2.2.0, M.27): the `<link id>` with
 * another `href` is added next to the current one and the old one removed
 * only when the new one has loaded (or failed — then the new one stays: it is
 * what the text asks for). A link already at `href` is left; a missing one is
 * created. Returns the link that carries `id` now.
 */
export function swapStylesheet(doc: unknown, id: string, href: string, options: { nonce?: string } = {}): unknown {
  const d = doc as AnyEl;
  if (!d || typeof d.createElement !== 'function') return null;
  const head = (d.head ?? d.documentElement) as AnyEl;
  const old = d.getElementById(id) as AnyEl | null;
  const isLink = !!old && String(old.tagName).toUpperCase() === 'LINK';
  // an earlier swap still loading under this id: drop it (this one wins)
  for (const p of Array.from((d.querySelectorAll(`link[data-orz-swap="${id.replace(/["\\]/g, '')}"]`) ?? []) as ArrayLike<AnyEl>)) p.remove();
  if (isLink && old!.getAttribute('href') === href) return old;
  const l = d.createElement('link') as AnyEl;
  l.setAttribute('rel', 'stylesheet');
  l.setAttribute('href', href);
  // the nonce of this call, else the replaced link's (Chrome hides the attribute but keeps `.nonce`)
  const nonce = options.nonce || (isLink ? (old!.nonce || old!.getAttribute('nonce') || '') : '');
  if (nonce) l.setAttribute('nonce', nonce);
  if (!isLink) {
    l.setAttribute('id', id);
    head.appendChild(l);
    return l;
  }
  l.setAttribute('data-orz-swap', id);
  old!.after ? old!.after(l) : head.appendChild(l);
  const done = (): void => {
    l.removeEventListener('load', done);
    l.removeEventListener('error', done);
    if (!l.isConnected) return; // superseded
    old!.remove();
    l.removeAttribute('data-orz-swap');
    l.setAttribute('id', id);
  };
  l.addEventListener('load', done);
  l.addEventListener('error', done);
  return l;
}

/** The window's `OrzContentTheme` (2.4.0), when its script ran. */
const themeKit = (w: EnhanceWin): AnyEl | null => (probe(() => typeof w.OrzContentTheme.chart === 'function' && typeof w.OrzContentTheme.runMermaid === 'function') ? w.OrzContentTheme : null);

/** Install `CONTENT_THEME_SCRIPT` once per window (an inline script carrying the nonce, like the runtime). */
function installThemeKit(doc: AnyEl, w: EnhanceWin, head: AnyEl, nonce: string | undefined): void {
  if (themeKit(w)) return;
  const s = doc.createElement('script') as AnyEl;
  if (nonce) s.setAttribute('nonce', nonce);
  s.textContent = CONTENT_THEME_SCRIPT;
  head.appendChild(s); // blocked by a CSP without the nonce: charts and diagrams keep their libraries' own look
}

/** Laid out with a size: not `display: none`, not in a closed `details`, not `visibility: hidden` (2.4.0). */
function isVisible(el: AnyEl, w: EnhanceWin): boolean {
  const kit = themeKit(w);
  if (kit) { try { return kit.visible(el) === true; } catch { return false; } }
  return shown(el, true);
}

/**
 * Laid out with a size: not `display: none`, not in a closed `details`
 * (2.4.0, M.35). `visibility: hidden` is laid out, which is all Mermaid needs
 * to measure its text.
 */
function isLaidOut(el: AnyEl, w: EnhanceWin): boolean {
  const kit = themeKit(w);
  if (kit && typeof kit.laidOut === 'function') { try { return kit.laidOut(el) === true; } catch { return false; } }
  return shown(el, false);
}

function shown(el: AnyEl, visibility: boolean): boolean {
  try {
    if (!el.isConnected) return false;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: visibility })) return false;
    const r = el.getClientRects();
    return r.length > 0 && (r[0].width > 0 || r[0].height > 0);
  } catch { return false; }
}

/** The test a waiting element is drawn after: visible (a canvas) or laid out (a Mermaid diagram). */
const readyToDraw = (v: AnyEl, w: EnhanceWin): boolean => (v.__orzPendLaidOut ? isLaidOut(v, w) : isVisible(v, w));

/** Canvases waiting to be shown, per window (one ResizeObserver each) and per enhanced root (released with it). */
const waiting = new WeakMap<object, { ro: AnyEl | null }>();
const waitingByRoot = new WeakMap<object, Set<AnyEl>>();

/**
 * Draw `v` when it becomes visible (`laidOut`: when it is laid out, for a
 * Mermaid diagram): a ResizeObserver catches it getting a size;
 * `redrawEnhancement` catches the rest.
 */
function whenVisible(root: EnhanceRoot, v: AnyEl, w: EnhanceWin, draw: () => void, laidOut = false): void {
  let st = waiting.get(w);
  if (!st) {
    let ro: AnyEl | null = null;
    try {
      if (typeof w.ResizeObserver === 'function') {
        ro = new w.ResizeObserver((entries: AnyEl[]) => {
          for (const e of entries) {
            const t = e.target;
            if (t.__orzPend && readyToDraw(t, w)) run(t);
          }
        });
      }
    } catch { ro = null; }
    waiting.set(w, (st = { ro }));
  }
  v.__orzPend = draw;
  v.__orzPendLaidOut = laidOut;
  v.__orzPendRoot = root;
  let set = waitingByRoot.get(root);
  if (!set) waitingByRoot.set(root, (set = new Set()));
  set.add(v);
  try { st.ro?.observe(v); } catch { /* the observer's own error */ }
}

/** Draw a waiting canvas now (once). */
function run(v: AnyEl): void {
  const draw = v.__orzPend as (() => void) | null | undefined;
  if (!draw) return;
  unwait(v);
  try { draw(); } catch { /* the library's own error */ }
}

function unwait(v: AnyEl): void {
  v.__orzPend = null;
  v.__orzPendLaidOut = undefined;
  const root = v.__orzPendRoot as object | undefined;
  v.__orzPendRoot = undefined;
  if (root) waitingByRoot.get(root)?.delete(v);
  try {
    const w = v.ownerDocument?.defaultView;
    waiting.get(w)?.ro?.unobserve(v);
  } catch { /* gone */ }
}

/**
 * SMILES at the size of its box (2.4.0): the canvas laid out at its own
 * 250×180 (the attributes it was rendered with); when CSS constrains it to
 * another box, that box. Returns the CSS size to draw at.
 */
function smilesBox(v: AnyEl): [number, number] {
  if (v.__ow === undefined) { v.__ow = v.width; v.__oh = v.height; }
  v.width = v.__ow;
  v.height = v.__oh;
  try { v.style.width = ''; v.style.height = ''; } catch { /* no style */ }
  const bw = Number(v.clientWidth) || 0;
  const bh = Number(v.clientHeight) || 0;
  if (bw > 0 && bh > 0 && (Math.abs(bw - v.__ow) >= 1 || Math.abs(bh - v.__oh) >= 1)) return [bw, bh];
  return [v.__ow, v.__oh];
}

function drawSmiles(v: AnyEl, w: EnhanceWin): void {
  const [bw, bh] = smilesBox(v);
  v.__dw = bw;
  v.__dh = bh;
  const d = new w.SmilesDrawer.Drawer({ width: bw, height: bh });
  w.SmilesDrawer.parse(v.getAttribute('data-smiles'), (t: unknown) => { try { d.draw(t, v, w.__orzSmilesTheme || 'light', false); } catch { /* a bad SMILES */ } });
}

function drawChart(root: EnhanceRoot, v: AnyEl, w: EnhanceWin, isStatic: boolean): void {
  const wrap = v.ownerDocument.createElement('div');
  wrap.className = 'orz-chart-frame';
  wrap.style.cssText = 'position:relative;width:100%;max-width:var(--chart-max-width,440px);margin:.4em auto';
  v.parentNode.insertBefore(wrap, v);
  wrap.appendChild(v);
  v.removeAttribute('width');
  v.removeAttribute('height');
  try {
    let g = JSON.parse(v.getAttribute('data-chart') || '{}');
    g.options = Object.assign({ responsive: true, maintainAspectRatio: true, animation: false }, g.options || {});
    // a static (print) drawing: sharp at print resolution, never animated (2.3.0)
    if (isStatic) {
      g.options.animation = false;
      if (g.options.devicePixelRatio === undefined) g.options.devicePixelRatio = Math.max(2, Number(w.devicePixelRatio) || 1);
    }
    if (!((g.data && g.data.datasets) || []).some((d: { label?: unknown } | null) => d && d.label)) g.options.plugins = Object.assign({}, g.options.plugins, { legend: { display: false } });
    // themed from CSS custom properties (2.4.0); the chart's own colours win
    const kit = themeKit(w);
    if (kit) { try { g = kit.chart(v, g); } catch { /* unthemed */ } }
    const chart = new w.Chart(v, g);
    v.__orzChart = chart;
    track(root, chart, v);
  } catch (e) {
    // a chart Chart.js refuses (an unknown type, bad data) says why instead of leaving an unexplained gap (M.41)
    try { v.setAttribute('data-chart-error', String((e as { message?: unknown } | null)?.message ?? e).slice(0, 200)); } catch { /* no attribute */ }
  }
}

/** Draw Mermaid diagrams: themed from CSS custom properties (2.4.0), one Mermaid configuration per group of diagrams. */
function drawMermaid(w: EnhanceWin, nodes: AnyEl[]): unknown {
  const kit = themeKit(w);
  return kit ? kit.runMermaid(w.mermaid, nodes) : w.mermaid.run({ nodes });
}

/** One enhancement pass over `root` with the libraries the window has (the in-page twin of `__orzEnhance`). */
async function enhanceRoot(root: EnhanceRoot, w: EnhanceWin, isStatic = false): Promise<void> {
  const all = (sel: string): AnyEl[] => { try { return Array.from(root.querySelectorAll(sel) as ArrayLike<AnyEl>); } catch { return []; } };
  try { if (LIB.hljs(w)) for (const b of all('pre code:not(.hljs)')) w.hljs.highlightElement(b); } catch { /* highlight.js's own error */ }
  let drawn: unknown = null;
  try {
    const nodes = all('.mermaid:not([data-processed])');
    if (LIB.mermaid(w) && nodes.length) {
      // drawn only when laid out (2.4.0, M.35): Mermaid measures its text, which a display: none container has none of
      const now: AnyEl[] = [];
      for (const n of nodes) {
        if (n.__orzPend) {
          if (isStatic || isLaidOut(n, w)) { unwait(n); now.push(n); }
          continue;
        }
        if (isStatic || isLaidOut(n, w)) now.push(n);
        else whenVisible(root, n, w, () => { drawMermaid(w, [n]); }, true);
      }
      if (now.length) drawn = drawMermaid(w, now);
    }
  } catch { /* Mermaid's own error */ }
  // SMILES and charts: drawn once each, and (unless static) only when visible — a hidden one waits (2.4.0)
  try {
    if (LIB.smiles(w)) {
      for (const v of all('canvas[data-smiles]')) {
        if (v.__d) {
          // waiting for the reader to see it: drawn now when it is visible, or for print
          if (v.__orzPend && (isStatic || isVisible(v, w))) { unwait(v); drawSmiles(v, w); }
          continue;
        }
        v.__d = 1;
        if (isStatic || isVisible(v, w)) drawSmiles(v, w);
        else whenVisible(root, v, w, () => drawSmiles(v, w));
      }
    }
  } catch { /* SmilesDrawer's own error */ }
  try {
    if (LIB.chart(w)) {
      for (const v of all('canvas.orz-chart[data-chart]')) {
        if (v.__d) {
          if (v.__orzPend && (isStatic || isVisible(v, w))) { unwait(v); drawChart(root, v, w, isStatic); }
          continue;
        }
        v.__d = 1;
        if (isStatic || isVisible(v, w)) drawChart(root, v, w, isStatic);
        else whenVisible(root, v, w, () => drawChart(root, v, w, false));
      }
    }
  } catch { /* Chart.js's own error */ }
  if (drawn && typeof (drawn as { then?: unknown }).then === 'function') { try { await drawn; } catch { /* Mermaid's own error */ } }
}

/**
 * Draw again what a newly shown container holds (2.4.0) — a slide coming
 * into view, a tab, a dialog: inside `el` (itself included), every chart,
 * SMILES drawing or Mermaid diagram that waited for it to be visible (a
 * diagram: laid out) is drawn now, every drawn
 * chart is resized to its container, and every drawn SMILES is drawn again
 * at its box's size. Content `enhanceDocument` never saw is left alone. A
 * ResizeObserver already draws a waiting canvas when it gets a size (from
 * `display: none`); this covers what it cannot see (`visibility`, a
 * transform, a box whose size did not change). Synchronous; cheap when
 * nothing waits.
 */
export function redrawEnhancement(el: unknown): void {
  const e = el as AnyEl;
  if (!e || typeof e.querySelectorAll !== 'function') return;
  const w = ((e.ownerDocument ?? e) as AnyEl)?.defaultView as EnhanceWin | null | undefined;
  if (!w) return;
  let list: AnyEl[] = [];
  const sel = 'canvas[data-smiles], canvas.orz-chart[data-chart], .mermaid';
  try { list = Array.from(e.querySelectorAll(sel) as ArrayLike<AnyEl>); } catch { return; }
  try { if (typeof e.matches === 'function' && e.matches(sel)) list.unshift(e); } catch { /* not an element */ }
  for (const v of list) {
    if (v.__orzPend) { if (readyToDraw(v, w)) run(v); continue; }
    if (!isVisible(v, w)) continue;
    if (v.__orzChart) { try { v.__orzChart.resize(); } catch { /* Chart.js's own error */ } continue; }
    if (v.__d && v.hasAttribute('data-smiles') && LIB.smiles(w)) { try { drawSmiles(v, w); } catch { /* SmilesDrawer's own error */ } }
  }
}
