/**
 * The editor's live preview: a sandboxed iframe (FC-19 invariant 3) that
 * receives rendered HTML by `postMessage` and swaps it in.
 *
 * - `sandbox="allow-scripts"` exactly — an opaque origin: the document's
 *   scripts run in the frame and cannot reach the host page, its storage or
 *   its cookies (no `allow-same-origin`), open windows or navigate the top.
 * - The frame is `srcdoc`: a fixed bridge script, then the pinned preview
 *   libraries (`getPreviewFrameAssets`, `__orzEnhance`) — the preview shows
 *   before they load, and is enhanced when they arrive.
 * - Updates are incremental: the bridge keeps every top-level node whose
 *   HTML did not change (common prefix and suffix), so drawn diagrams and the
 *   scroll position survive typing; it then re-runs `__orzEnhance` and reports
 *   the scroll anchors (`[data-src-line]` elements) for scroll sync.
 * - Messages are read only from that iframe's own window; the frame reads
 *   only messages from its parent. Payloads are data: the frame renders the
 *   HTML the editor's own renderer produced, the parent reads numbers and a
 *   link href from the frame.
 */
import { escapeAttr } from '../../html.js';
import { getPreviewFrameAssets, type ColorScheme } from '../../preview-frame.js';
import type { EdDocument, EdElement, EdEvent, EdIframe, EdListener } from './types.js';

/** The preview iframe's sandbox: exactly this, never `allow-same-origin`. */
export const PREVIEW_SANDBOX = 'allow-scripts';

/** Where a preview runs: in an app's page, or in a standalone assembled file (and that page's URL scheme). */
export interface PreviewContext {
  host: 'app' | 'standalone';
  /** `location.protocol` of the page (`https:`, `file:`, …). */
  protocol: string;
}

/**
 * The `sandbox` attribute of the preview iframe for a context — the ONE place
 * it is decided. Today `allow-scripts` everywhere (an opaque origin).
 *
 * Owner decision pending (finding B-2): in a standalone `file:` page the
 * opaque srcdoc preview cannot load the document's relative local images; the
 * owner may allow `allow-same-origin` for `{ host: 'standalone', protocol:
 * 'file:' }` ONLY. That would be a one-line change here — nowhere else.
 */
export function previewSandbox(context: PreviewContext): string {
  void context;
  return PREVIEW_SANDBOX;
}

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
export const PREVIEW_BRIDGE = [
  '(function(){',
  'var P=window.parent,art=document.getElementById("orz-doc"),last=0,mute=0,queued=0,timer=0;',
  'var sch=document.documentElement.getAttribute("data-scheme");if(sch==="dark")window.__orzSmilesTheme="dark";',
  'function post(m){try{P.postMessage(m,"*")}catch(e){}}',
  'function strip(h){return h.replace(/<[a-zA-Z][^>]*>/g,function(t){return t.replace(/ data-src-line="[^"]*"/g,"")})}',
  'function keyOf(n){return n.nodeType===1?strip(n.outerHTML):n.nodeType===3?"#"+n.data:n.nodeType===8?"!"+n.data:""}',
  'function lines(n){var l=[],q,i;if(n.nodeType!==1)return l;if(n.hasAttribute("data-src-line"))l.push(n);q=n.querySelectorAll("[data-src-line]");for(i=0;i<q.length;i++)l.push(q[i]);return l}',
  'function keep(o,n){if(o.__orzKey!==n.__orzKey)return false;var a=lines(o),b=lines(n),i;if(a.length!==b.length)return false;for(i=0;i<a.length;i++)a[i].setAttribute("data-src-line",b[i].getAttribute("data-src-line"));return true}',
  'function apply(html){var t=document.createElement("template");t.innerHTML=html;var next=Array.prototype.slice.call(t.content.childNodes),old=Array.prototype.slice.call(art.childNodes),a=old.length,b=next.length,p=0,s=0,i;',
  'for(i=0;i<b;i++)next[i].__orzKey=keyOf(next[i]);',
  'while(p<a&&p<b&&keep(old[p],next[p]))p++;',
  'while(s<a-p&&s<b-p&&keep(old[a-1-s],next[b-1-s]))s++;',
  'var ref=s>0?old[a-s]:null;for(i=p;i<a-s;i++)art.removeChild(old[i]);',
  'for(i=p;i<b-s;i++)art.insertBefore(next[i],ref)}',
  'function whole(html){var y=se().scrollTop;art.innerHTML=html;se().scrollTop=y}',
  'function se(){return document.scrollingElement||document.documentElement}',
  'function max(){return Math.max(0,se().scrollHeight-window.innerHeight)}',
  'function anchors(){var els=art.querySelectorAll("[data-src-line]"),out=[],y=se().scrollTop||0,i,l,r;',
  'for(i=0;i<els.length;i++){l=parseInt(els[i].getAttribute("data-src-line"),10);if(isNaN(l))continue;r=els[i].getBoundingClientRect();if(!r.height&&!r.width)continue;out.push([l,r.top+y])}',
  'out.sort(function(x,z){return x[1]-z[1]});return out}',
  'function report(){post({type:"orz-preview-rendered",id:last,anchors:anchors(),max:max()})}',
  'function enhance(){try{if(typeof window.__orzEnhance==="function")window.__orzEnhance()}catch(e){}}',
  'function later(){clearTimeout(timer);timer=setTimeout(function(){enhance();report()},350)}',
  'window.addEventListener("message",function(e){if(e.source!==P)return;var d=e.data;if(!d||typeof d!=="object")return;',
  'if(d.type==="orz-preview-render"){last=d.id;if(d.diff===false)whole(String(d.html));else try{apply(String(d.html))}catch(x){whole(String(d.html))}enhance();report();later()}',
  'else if(d.type==="orz-preview-scroll"&&typeof d.top==="number"){mute=Date.now()+150;se().scrollTop=d.top}});',
  'if(window.ResizeObserver)new ResizeObserver(later).observe(art);',
  'window.addEventListener("scroll",function(){if(Date.now()<mute||queued)return;queued=1;requestAnimationFrame(function(){queued=0;post({type:"orz-preview-scrolled",top:se().scrollTop,max:max()})})},{passive:true});',
  'document.addEventListener("keydown",function(e){var k=e.key;active();',
  'if((e.metaKey||e.ctrlKey)&&!e.altKey&&(k==="s"||k==="S"||k==="\\\\")){e.preventDefault();post({type:"orz-preview-key",key:k==="\\\\"?"\\\\":"s"})}',
  'else if(k==="Escape")post({type:"orz-preview-key",key:"Escape"})});',
  'function active(){post({type:"orz-preview-active"})}',
  'document.addEventListener("pointerdown",active,true);document.addEventListener("wheel",active,{passive:true,capture:true});document.addEventListener("touchstart",active,{passive:true,capture:true});',
  'document.addEventListener("click",function(e){var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a||e.defaultPrevented)return;var h=a.getAttribute("href")||"";e.preventDefault();',
  'if(h.charAt(0)==="#"){var id=h.slice(1);try{id=decodeURIComponent(id)}catch(x){}var t=document.getElementById(id);if(t)t.scrollIntoView();return}',
  'post({type:"orz-preview-link",href:h})});',
  'window.__orzLibsReady=function(){enhance();report()};',
  'post({type:"orz-preview-ready"});',
  '})();',
].join('');

/**
 * `'sha256-…'` of {@link PREVIEW_BRIDGE}, for a hash-based Content-Security-Policy
 * (`script-src 'sha256-…'`). A test recomputes it; with `assets` the frame has
 * more inline scripts — {@link previewScriptHashes} lists them all.
 */
export const PREVIEW_BRIDGE_HASH = 'sha256-vGxwt7AxICnk1qS6ExQKrJyNG3WKyC+TyCPieX6Xy8E=';

/** The inline call that tells the bridge the pinned libraries have loaded. */
const LIBS_READY = 'window.__orzLibsReady()';
const BASE_STYLE = 'html{scroll-behavior:auto}body{margin:0;padding:1.5rem 1.75rem}';

/** Stamp a nonce on every `<script` and `<style` start tag of shell-built markup. */
function stampNonce(markup: string, nonce: string | undefined): string {
  if (!nonce) return markup;
  const attr = ` nonce="${escapeAttr(nonce)}"`;
  return markup.replace(/<(script|style)(?=[\s>])/g, `<$1${attr}`);
}

/** The pieces of the frame document for these options. */
export function previewFrameParts(options: PreviewFrameOptions = {}): PreviewFrameParts {
  const scheme: ColorScheme = options.scheme === 'dark' ? 'dark' : 'light';
  const assets = options.assets !== false ? getPreviewFrameAssets() : null;
  const nonce = options.nonce || undefined;
  return {
    head: stampNonce(`${assets ? assets.headLinks(scheme) : ''}${options.head ?? ''}<style>${BASE_STYLE}</style>`, nonce),
    bridge: stampNonce(`<script>${options.bridge ?? PREVIEW_BRIDGE}</script>`, nonce),
    scripts: assets ? stampNonce(`${assets.bodyScripts()}<script>${LIBS_READY}</script>`, nonce) : '',
    scheme,
    articleClass: escapeAttr(options.articleClass ?? 'markdown-body'),
    ...(nonce ? { nonce } : {}),
  };
}

/** The preview frame's `srcdoc`. */
export function previewFrameDocument(options: PreviewFrameOptions = {}): string {
  const parts = previewFrameParts(options);
  if (options.frameDocument) return String(options.frameDocument(parts));
  return (
    `<!doctype html><html data-scheme="${parts.scheme}"><head><meta charset="utf-8">` +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    parts.head +
    `</head><body><article class="${parts.articleClass}" id="orz-doc"></article>` +
    // the bridge first: the preview shows at once; the libraries enhance it when they arrive (or never, offline)
    parts.bridge +
    parts.scripts +
    '</body></html>'
  );
}

/**
 * `'sha256-…'` of every inline `<script>` in the frame document for these
 * options (the bridge, and with `assets` the libraries' setup, the runtime and
 * `__orzEnhance`), for a hash-based CSP. Needs Web Crypto (`crypto.subtle`).
 */
export async function previewScriptHashes(options: PreviewFrameOptions = {}): Promise<string[]> {
  const subtle = (globalThis as { crypto?: { subtle?: { digest(alg: string, data: Uint8Array): Promise<ArrayBuffer> } } }).crypto?.subtle;
  if (!subtle) throw new Error('orz editor: previewScriptHashes needs crypto.subtle');
  const out: string[] = [];
  for (const m of previewFrameDocument(options).matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    const bytes = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(m[1])));
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const hash = `sha256-${btoa(bin)}`;
    if (!out.includes(hash)) out.push(hash);
  }
  return out;
}

/** A start tag with its attributes (quoted values may hold `>`). */
const START_TAG = /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)(\s*\/?>)/g;
const ATTRIBUTE = /(\s+)([^\s"'>/=]+)(?:(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const ENTITY = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos|#39));/g;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeAttr(v: string): string {
  return v.replace(ENTITY, (m, dec?: string, hex?: string, name?: string) => {
    if (name) return name === '#39' ? "'" : NAMED[name];
    const cp = dec !== undefined ? Number(dec) : parseInt(hex!, 16);
    return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });
}

/** A relative reference: no scheme, not `//host`, not `/path`, not `#fragment`, not empty. */
const isRelative = (u: string): boolean => u !== '' && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u) && !/^[/\\#?]/.test(u);

/**
 * Rewrite the relative asset references of rendered HTML through `resolve`
 * (FC-19 `hooks.resolveAsset`) before it enters the preview: `src`,
 * `poster`, every URL of `srcset`, and `href` on elements other than `<a>` /
 * `<area>` (links stay as written; a click goes to `resolveLink`). A resolver
 * that throws or returns a non-string leaves the reference as it was. Tags
 * the pattern cannot read are left unchanged.
 */
export function rewriteAssetUrls(html: string, resolve: (path: string) => string): string {
  const res = (u: string): string => {
    const t = u.trim();
    if (!isRelative(t)) return u;
    try {
      const r = resolve(t);
      return typeof r === 'string' ? r : u;
    } catch {
      return u;
    }
  };
  return html.replace(START_TAG, (tag: string, name: string, attrs: string, tail: string) => {
    const element = name.toLowerCase();
    let changed = false;
    const out = attrs.replace(ATTRIBUTE, (m: string, space: string, attr: string, eq?: string, dq?: string, sq?: string, uq?: string) => {
      if (eq === undefined) return m;
      const a = attr.toLowerCase();
      const set = a === 'srcset';
      if (!set && a !== 'src' && a !== 'poster' && !((a === 'href' || a === 'xlink:href') && element !== 'a' && element !== 'area')) return m;
      const raw = decodeAttr(dq ?? sq ?? uq ?? '');
      const value = set
        ? raw.split(',').map((part) => {
          const lead = part.match(/^\s*/)![0];
          const body = part.slice(lead.length);
          const cut = body.search(/\s/);
          const url = cut < 0 ? body : body.slice(0, cut);
          return lead + res(url) + (cut < 0 ? '' : body.slice(cut));
        }).join(',')
        : res(raw);
      if (value === raw) return m;
      changed = true;
      return `${space}${attr}="${escapeAttr(value)}"`;
    });
    return changed ? `<${name}${out}${tail}` : tag;
  });
}

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
export const PREVIEW_READY_TIMEOUT_MS = 8000;

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Create the sandboxed preview iframe in `parent` and talk to it. */
export function createPreview(
  doc: EdDocument,
  parent: EdElement,
  options: PreviewFrameOptions & { title?: string; context?: PreviewContext; readyTimeoutMs?: number },
  events: PreviewEvents,
): PreviewController {
  const win = doc.defaultView;
  const iframe = doc.createElement('iframe') as EdIframe;
  iframe.setAttribute('sandbox', previewSandbox(options.context ?? { host: 'app', protocol: '' }));
  iframe.setAttribute('title', options.title ?? 'Document preview');
  iframe.className = 'orz-editor__frame';
  iframe.srcdoc = previewFrameDocument(options);
  const diff = options.diff !== false;
  let ready = false;
  let seq = 0;
  let pending: string | null = null;
  let anchors: Array<[number, number]> = [];
  let max = 0;
  const send = (msg: unknown): void => { try { iframe.contentWindow?.postMessage(msg, '*'); } catch { /* detached */ } };
  const renderMessage = (html: string): unknown => ({ type: 'orz-preview-render', id: ++seq, html, ...(diff ? {} : { diff: false }) });
  const onMessage: EdListener = (e: EdEvent) => {
    if (!iframe.contentWindow || e.source !== iframe.contentWindow) return;
    const d = e.data as Record<string, unknown> | null;
    if (!d || typeof d !== 'object') return;
    switch (d.type) {
      case 'orz-preview-ready':
        ready = true;
        if (stall !== null) { win?.clearTimeout(stall); stall = null; }
        if (pending !== null) send(renderMessage(pending));
        events.onReady?.();
        break;
      case 'orz-preview-rendered':
        if (Array.isArray(d.anchors)) anchors = (d.anchors as unknown[]).filter((a): a is [number, number] => Array.isArray(a) && num(a[0]) && num(a[1])).map((a) => [a[0], a[1]]);
        if (num(d.max)) max = d.max;
        events.onRendered?.(anchors, max);
        break;
      case 'orz-preview-scrolled':
        if (num(d.max)) max = d.max;
        if (num(d.line)) events.onScrolled?.(num(d.top) ? d.top : 0, max, d.line);
        else if (num(d.top)) events.onScrolled?.(d.top, max);
        break;
      case 'orz-preview-key':
        if (d.key === 's' || d.key === '\\' || d.key === 'Escape') events.onKey?.(d.key);
        break;
      case 'orz-preview-link':
        if (typeof d.href === 'string') events.onLink?.(d.href);
        break;
      case 'orz-preview-active':
        events.onActive?.();
        break;
    }
  };
  win?.addEventListener('message', onMessage);
  // A moved or reloaded frame boots again and says ready again: the last HTML is re-sent then.
  parent.append(iframe);
  let stall: unknown = win ? win.setTimeout(() => { stall = null; if (!ready) events.onStall?.(); }, options.readyTimeoutMs ?? PREVIEW_READY_TIMEOUT_MS) : null;
  return {
    iframe,
    render(html) {
      pending = html;
      if (ready) send(renderMessage(html));
    },
    scrollTo(top) {
      if (ready && num(top)) send({ type: 'orz-preview-scroll', top });
    },
    navigate(line) {
      if (ready && num(line)) send({ type: 'orz-preview-navigate', line });
    },
    get anchors() { return anchors; },
    get max() { return max; },
    get ready() { return ready; },
    destroy() {
      win?.removeEventListener('message', onMessage);
      if (stall !== null) { win?.clearTimeout(stall); stall = null; }
      iframe.remove();
      pending = null;
    },
  };
}

/**
 * The preview top for a (fractional) source line: linear between the
 * anchors around it, from the top of the page (line 0 at 0) to the first
 * anchor, and the last anchor's top beyond it.
 */
export function lineToTop(anchors: ReadonlyArray<[number, number]>, line: number): number {
  if (!anchors.length) return 0;
  const first = anchors[0];
  if (line <= first[0]) return first[0] > 0 ? first[1] * (Math.max(0, line) / first[0]) : first[1];
  let prev = first;
  for (const a of anchors) {
    if (a[0] <= line) { prev = a; continue; }
    if (a[0] === prev[0]) return prev[1];
    return prev[1] + ((line - prev[0]) / (a[0] - prev[0])) * (a[1] - prev[1]);
  }
  return prev[1];
}

/** The (fractional) source line at a preview top: the inverse of {@link lineToTop}. */
export function topToLine(anchors: ReadonlyArray<[number, number]>, top: number): number {
  if (!anchors.length) return 0;
  const first = anchors[0];
  if (top <= first[1]) return first[1] > 0 ? first[0] * (Math.max(0, top) / first[1]) : first[0];
  let prev = first;
  for (const a of anchors) {
    if (a[1] <= top) { prev = a; continue; }
    if (a[1] === prev[1]) return prev[0];
    return prev[0] + ((top - prev[1]) / (a[1] - prev[1])) * (a[0] - prev[0]);
  }
  return prev[0];
}
