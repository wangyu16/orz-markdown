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
import { KATEX_VERSION } from './version.js';

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

/* Body of window.__orzEnhance(). Scoped to .markdown-body so it works whatever
 * id/wrapper the host gives the rendered region. Idempotent: highlight/tabs/QR
 * skip already-processed nodes, SMILES/chart track a JS flag. SMILES honors
 * window.__orzSmilesTheme ('dark' → light bonds); reset its flag and re-run to
 * redraw after a theme switch. A chart whose datasets are all unnamed
 * (`data: …` shorthand) hides its legend instead of showing "undefined". */
const ENHANCE_BODY =
  "var R='.markdown-body ';" +
  "try{if(window.hljs)document.querySelectorAll(R+'pre code:not(.hljs)').forEach(function(b){window.hljs.highlightElement(b)})}catch(e){}" +
  "try{if(window.mermaid)window.mermaid.run({nodes:document.querySelectorAll(R+'.mermaid:not([data-processed])')})}catch(e){}" +
  "try{if(window.SmilesDrawer)document.querySelectorAll(R+'canvas[data-smiles]').forEach(function(v){if(v.__d)return;v.__d=1;if(v.__ow===undefined){v.__ow=v.width;v.__oh=v.height}v.width=v.__ow;v.height=v.__oh;var d=new window.SmilesDrawer.Drawer({width:v.__ow,height:v.__oh});window.SmilesDrawer.parse(v.getAttribute('data-smiles'),function(t){try{d.draw(t,v,window.__orzSmilesTheme||'light',false)}catch(e){}})})}catch(e){}" +
  "try{if(window.Chart)document.querySelectorAll(R+'canvas.orz-chart[data-chart]').forEach(function(v){if(v.__d)return;v.__d=1;var w=v.ownerDocument.createElement('div');w.style.cssText='position:relative;width:100%;max-width:440px;margin:.4em auto';v.parentNode.insertBefore(w,v);w.appendChild(v);v.removeAttribute('width');v.removeAttribute('height');try{var g=JSON.parse(v.getAttribute('data-chart')||'{}');g.options=Object.assign({responsive:true,maintainAspectRatio:true,animation:false},g.options||{});if(!((g.data&&g.data.datasets)||[]).some(function(d){return d&&d.label})){g.options.plugins=Object.assign({},g.options.plugins,{legend:{display:false}})}new window.Chart(v,g)}catch(e){}})}catch(e){}" +
  "try{if(window.OrzMarkdownRuntime)window.OrzMarkdownRuntime.init(document)}catch(e){}";

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
  /** Install the orz browser runtime (copy-as-Markdown, QR expansion, tab bars) once per window and run it on `root`. Default `true`. */
  runtime?: boolean;
}

/** What {@link enhanceDocument} did: the library URLs it loaded now (or found loading) and those that failed. */
export interface EnhanceResult {
  loaded: string[];
  failed: string[];
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

/** The libraries in-page enhancement may load: each with the selector of the content that needs it and the global it sets. */
const PAGE_LIBS: ReadonlyArray<{ url: string; needs: string; global: string; setup?(w: EnhanceWin): void }> = [
  { url: PREVIEW_CDN.hljsJs, needs: 'pre code', global: 'hljs' },
  { url: PREVIEW_CDN.mermaidJs, needs: '.mermaid', global: 'mermaid', setup: (w) => { w.mermaid?.initialize?.({ startOnLoad: false }); } },
  { url: PREVIEW_CDN.smilesJs, needs: 'canvas[data-smiles]', global: 'SmilesDrawer' },
  { url: PREVIEW_CDN.chartJs, needs: 'canvas.orz-chart', global: 'Chart' },
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

  // the runtime: once per window
  if (options.runtime !== false) {
    if (!win.OrzMarkdownRuntime) {
      const s = doc.createElement('script') as AnyEl;
      if (nonce) s.setAttribute('nonce', nonce);
      s.textContent = getBrowserRuntimeScript({ autoInit: false });
      head.appendChild(s);
    }
    try { win.OrzMarkdownRuntime?.init?.(root); } catch { /* the runtime's own error */ }
  }

  // charts of content no longer in root (a re-render replaced it) are destroyed first (M.26)
  releaseDetached(root);
  const pass = async (): Promise<void> => { await enhanceRoot(root, win); };
  await pass();
  if (!assets) return result;

  let loads = pageLoads.get(win);
  if (!loads) { loads = new Map(); pageLoads.set(win, loads); }
  let failures = pageFailures.get(win);
  if (!failures) { failures = new Map(); pageFailures.set(win, failures); }
  const now = (): number => { try { const t = Number(win.Date?.now?.()); return Number.isFinite(t) ? t : Date.now(); } catch { return Date.now(); } };
  const pending: Array<Promise<void>> = [];
  for (const lib of PAGE_LIBS) {
    if (!has(lib.needs) || win[lib.global]) continue;
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
  return result;
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

/**
 * Release what {@link enhanceDocument} made for `root` (2.2.0, M.26): every
 * Chart.js instance it drew there is destroyed (its listeners, resize
 * observer and registry entry go) and an expanded QR overlay is closed. Call
 * it before replacing `root`'s content when the root itself goes, or before a
 * re-render; `enhanceDocument` also destroys, on each call, the charts whose
 * canvas left `root`. Idempotent; a root never enhanced is a no-op.
 */
export function disposeEnhancement(root: EnhanceRoot): void {
  const list = drawnCharts.get(root);
  drawnCharts.delete(root);
  for (const x of list ?? []) destroyChart(x.chart);
  try {
    const win = ((root.ownerDocument ?? root) as AnyEl)?.defaultView as EnhanceWin | null | undefined;
    win?.OrzMarkdownRuntime?.collapseQr?.();
  } catch { /* no runtime */ }
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

/** One enhancement pass over `root` with the libraries the window has (the in-page twin of `__orzEnhance`). */
async function enhanceRoot(root: EnhanceRoot, w: EnhanceWin): Promise<void> {
  const all = (sel: string): AnyEl[] => { try { return Array.from(root.querySelectorAll(sel) as ArrayLike<AnyEl>); } catch { return []; } };
  try { if (w.hljs) for (const b of all('pre code:not(.hljs)')) w.hljs.highlightElement(b); } catch { /* highlight.js's own error */ }
  let drawn: unknown = null;
  try {
    const nodes = all('.mermaid:not([data-processed])');
    if (w.mermaid && nodes.length) drawn = w.mermaid.run({ nodes });
  } catch { /* Mermaid's own error */ }
  try {
    if (w.SmilesDrawer) {
      for (const v of all('canvas[data-smiles]')) {
        if (v.__d) continue;
        v.__d = 1;
        if (v.__ow === undefined) { v.__ow = v.width; v.__oh = v.height; }
        v.width = v.__ow;
        v.height = v.__oh;
        const d = new w.SmilesDrawer.Drawer({ width: v.__ow, height: v.__oh });
        w.SmilesDrawer.parse(v.getAttribute('data-smiles'), (t: unknown) => { try { d.draw(t, v, w.__orzSmilesTheme || 'light', false); } catch { /* a bad SMILES */ } });
      }
    }
  } catch { /* SmilesDrawer's own error */ }
  try {
    if (w.Chart) {
      for (const v of all('canvas.orz-chart[data-chart]')) {
        if (v.__d) continue;
        v.__d = 1;
        const wrap = v.ownerDocument.createElement('div');
        wrap.style.cssText = 'position:relative;width:100%;max-width:440px;margin:.4em auto';
        v.parentNode.insertBefore(wrap, v);
        wrap.appendChild(v);
        v.removeAttribute('width');
        v.removeAttribute('height');
        try {
          const g = JSON.parse(v.getAttribute('data-chart') || '{}');
          g.options = Object.assign({ responsive: true, maintainAspectRatio: true, animation: false }, g.options || {});
          if (!((g.data && g.data.datasets) || []).some((d: { label?: unknown } | null) => d && d.label)) g.options.plugins = Object.assign({}, g.options.plugins, { legend: { display: false } });
          track(root, new w.Chart(v, g), v);
        } catch { /* a bad chart */ }
      }
    }
  } catch { /* Chart.js's own error */ }
  if (drawn && typeof (drawn as { then?: unknown }).then === 'function') { try { await drawn; } catch { /* Mermaid's own error */ } }
}
