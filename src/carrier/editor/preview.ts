/**
 * The editor's live preview: a sandboxed iframe (FC-19 invariant 3) that
 * receives rendered HTML by `postMessage` and swaps it in.
 *
 * - Its `sandbox` comes only from `previewSandbox()`: `allow-scripts` — an
 *   opaque origin: the document's scripts run in the frame and cannot reach
 *   the host page, its storage or its cookies, open windows or navigate the
 *   top — except a standalone file opened from disk (top level, no host),
 *   which also gets `allow-same-origin` (owner decision B-2, see there).
 * - The frame is `srcdoc`: a fixed bridge script first (before any
 *   stylesheet, so a slow stylesheet cannot hold it back), then the pinned
 *   preview libraries (`getPreviewFrameAssets`, `__orzEnhance`) — the preview
 *   shows before they load, and is enhanced when they arrive.
 * - When the document's scripts take the keyboard focus, the shell pauses
 *   them (`pauseScripts`): the frame is rebuilt under a CSP that runs only
 *   the shell's nonce-stamped scripts.
 * - Updates are incremental: the bridge keeps every top-level node whose
 *   HTML did not change (common prefix and suffix), so drawn diagrams and the
 *   scroll position survive typing; it then re-runs `__orzEnhance` and reports
 *   the scroll anchors (`[data-src-line]` elements) for scroll sync.
 * - Messages are read only from that iframe's own window; the frame reads
 *   only messages from its parent, or from the private MessageChannel port the
 *   shell hands it in answer to its ready (so a shell mounted from another
 *   window's script still reaches it). Payloads are data: the frame renders the
 *   HTML the editor's own renderer produced, the parent reads numbers and a
 *   link href from the frame.
 */
import { escapeAttr } from '../../html.js';
import { getPreviewFrameAssets, type ColorScheme } from '../../preview-frame.js';
import type { EdDocument, EdElement, EdEvent, EdIframe, EdListener, EdPort } from './types.js';

/** The preview iframe's sandbox everywhere but a standalone `file:` page (see {@link previewSandbox}). */
export const PREVIEW_SANDBOX = 'allow-scripts';

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
export function previewSandbox(context: PreviewContext): string {
  if (context.host === 'standalone' && context.protocol === 'file:' && context.topLevel !== false && context.connected !== true) return `${PREVIEW_SANDBOX} allow-same-origin`;
  return PREVIEW_SANDBOX;
}

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
export const PREVIEW_BRIDGE = [
  '(function(){',
  'var P=window.parent,art=null,last=0,want=0,mute=0,queued=0,timer=0,port=null,chan=String(Math.random()).slice(2);',
  'var RA=Reflect.apply,PM=typeof MessagePort==="function"?MessagePort.prototype.postMessage:null;',
  'try{var rv=new Uint32Array(4);crypto.getRandomValues(rv);chan=Array.prototype.join.call(rv,"-")}catch(e){}',
  'window.addEventListener("message",function(e){var d=e.data;',
  'if(d&&typeof d==="object"&&d.type==="orz-preview-port"){e.stopImmediatePropagation();if(!port&&d.channel===chan&&e.ports&&e.ports[0]){port=e.ports[0];port.onmessage=function(m){handle(m.data)}}return}',
  'if(e.source===P)handle(d)},true);',
  'var lastIn=-1e9,lastPtr=-1e9,bare=-1e9,bareAt=-1e9,has=false;try{has=document.hasFocus()}catch(e){}if(has)bare=bareAt=Date.now();function active(k){send({type:"orz-preview-active",input:k})}',
  'function pointed(){lastIn=lastPtr=Date.now();if(lastIn-bare<1500){bare=-1e9;send({type:"orz-preview-focus",reader:true,late:true})}}',
  'window.addEventListener("pointerdown",function(e){if(e.isTrusted){pointed();active("pointer")}},true);',
  'window.addEventListener("wheel",function(e){if(e.isTrusted)active("wheel")},{passive:true,capture:true});',
  'window.addEventListener("touchstart",function(e){if(e.isTrusted){pointed();active("touch")}},{passive:true,capture:true});',
  'window.addEventListener("focus",function(e){if(e.target!==window||!e.isTrusted||has)return;has=true;var r=Date.now()-lastIn<1000;bare=r?-1e9:Date.now();if(!r)bareAt=bare;send({type:"orz-preview-focus",reader:r})},true);',
  'window.addEventListener("blur",function(e){if(e.target===window){has=false;lastIn=-1e9}},true);',
  'var sch=document.documentElement.getAttribute("data-scheme");if(sch==="dark")window.__orzSmilesTheme="dark";',
  'function A(){return art||(art=document.getElementById("orz-doc"))}',
  'function post(m){try{P.postMessage(m,"*")}catch(e){}}',
  'function send(m){if(port&&PM){try{RA(PM,port,[m])}catch(e){}}else post(m)}',
  'function strip(h){return h.replace(/<[a-zA-Z][^>]*>/g,function(t){return t.replace(/ data-src-line="[^"]*"/g,"")})}',
  'function keyOf(n){return n.nodeType===1?strip(n.outerHTML):n.nodeType===3?"#"+n.data:n.nodeType===8?"!"+n.data:""}',
  'function lines(n){var l=[],q,i;if(n.nodeType!==1)return l;if(n.hasAttribute("data-src-line"))l.push(n);q=n.querySelectorAll("[data-src-line]");for(i=0;i<q.length;i++)l.push(q[i]);return l}',
  'function keep(o,n){if(o.__orzKey!==n.__orzKey)return false;var a=lines(o),b=lines(n),i;if(a.length!==b.length)return false;for(i=0;i<a.length;i++)a[i].setAttribute("data-src-line",b[i].getAttribute("data-src-line"));return true}',
  'function apply(html){var root=A(),t=document.createElement("template");t.innerHTML=html;var next=Array.prototype.slice.call(t.content.childNodes),old=Array.prototype.slice.call(root.childNodes),a=old.length,b=next.length,p=0,s=0,i;',
  'for(i=0;i<b;i++)next[i].__orzKey=keyOf(next[i]);',
  'while(p<a&&p<b&&keep(old[p],next[p]))p++;',
  'while(s<a-p&&s<b-p&&keep(old[a-1-s],next[b-1-s]))s++;',
  'var ref=s>0?old[a-s]:null;for(i=p;i<a-s;i++)root.removeChild(old[i]);',
  'for(i=p;i<b-s;i++)root.insertBefore(next[i],ref)}',
  'function whole(html){var y=se().scrollTop;A().innerHTML=html;se().scrollTop=y}',
  'function se(){return document.scrollingElement||document.documentElement}',
  'function max(){return Math.max(0,se().scrollHeight-window.innerHeight)}',
  'function anchors(){var root=A(),out=[];if(!root)return out;var els=root.querySelectorAll("[data-src-line]"),y=se().scrollTop||0,i,l,r;',
  'for(i=0;i<els.length;i++){l=parseInt(els[i].getAttribute("data-src-line"),10);if(isNaN(l))continue;r=els[i].getBoundingClientRect();if(!r.height&&!r.width)continue;out.push([l,r.top+y])}',
  'out.sort(function(x,z){return x[1]-z[1]});return out}',
  'function report(){send({type:"orz-preview-rendered",id:last,anchors:anchors(),max:max()})}',
  'function enhance(){try{if(typeof window.__orzEnhance==="function")window.__orzEnhance()}catch(e){}}',
  'function later(){clearTimeout(timer);timer=setTimeout(function(){enhance();report()},350)}',
  'function done(){enhance();report();later()}',
  'function render(d,n){var h=window.__orzPreviewApply,r;want=d.id;',
  'if(typeof h==="function"){try{r=h(String(d.html),d)}catch(x){r=null}if(r&&typeof r.then==="function"){r.then(function(){if(want===d.id){last=d.id;done()}},function(){if(want===d.id){last=d.id;report()}})}else{last=d.id;done()}return}',
  'if(!A()){if((n||0)<400)setTimeout(function(){if(want===d.id)render(d,(n||0)+1)},25);return}',
  'last=d.id;if(d.diff===false)whole(String(d.html));else try{apply(String(d.html))}catch(x){whole(String(d.html))}done()}',
  'function handle(d){if(!d||typeof d!=="object")return;',
  'if(d.type==="orz-preview-render")render(d,0);',
  'else if(d.type==="orz-preview-scroll"&&typeof d.top==="number"){mute=Date.now()+150;se().scrollTop=d.top}',
  'else if(d.type==="orz-preview-navigate"){if(typeof window.__orzPreviewNavigate==="function"&&typeof d.line==="number")try{window.__orzPreviewNavigate(d.line)}catch(x){}}',
  'else if(d.type==="orz-preview-ping"){send({type:"orz-preview-pong",id:d.id,pointer:lastPtr>=bareAt})}',
  'else if(typeof window.__orzPreviewMessage==="function")try{window.__orzPreviewMessage(d)}catch(x){}}',
  'if(window.ResizeObserver)new ResizeObserver(later).observe(document.documentElement);',
  'window.addEventListener("scroll",function(e){if(!e.isTrusted||Date.now()<mute||queued)return;queued=1;requestAnimationFrame(function(){queued=0;send({type:"orz-preview-scrolled",top:se().scrollTop,max:max()})})},{passive:true});',
  'document.addEventListener("keydown",function(e){if(!e.isTrusted)return;var k=e.key;active("key");',
  'if((e.metaKey||e.ctrlKey)&&!e.altKey&&(k==="s"||k==="S"||k==="\\\\")){e.preventDefault();send({type:"orz-preview-key",key:k==="\\\\"?"\\\\":"s"})}',
  'else if(k==="Escape")send({type:"orz-preview-key",key:"Escape"})});',
  'document.addEventListener("click",function(e){var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a||e.defaultPrevented)return;var h=a.getAttribute("href")||"";e.preventDefault();',
  'if(h.charAt(0)==="#"){var id=h.slice(1);try{id=decodeURIComponent(id)}catch(x){}var t=document.getElementById(id);if(t)t.scrollIntoView();return}',
  'if(e.isTrusted)send({type:"orz-preview-link",href:h})});',
  'window.__orzLibsReady=function(){enhance();report()};',
  'window.__orzPreview={report:report,post:post};',
  'post({type:"orz-preview-ready",channel:chan});',
  '})();',
].join('');

/**
 * `'sha256-…'` of {@link PREVIEW_BRIDGE}, for a hash-based Content-Security-Policy
 * (`script-src 'sha256-…'`). A test recomputes it; with `assets` the frame has
 * more inline scripts — {@link previewScriptHashes} lists them all.
 */
export const PREVIEW_BRIDGE_HASH = 'sha256-b5U0KPkMCBoiEeKodg9ElyhxwmpJaT6BdZ+gmcYdg28=';

/** The inline call that tells the bridge the pinned libraries have loaded. */
const LIBS_READY = 'window.__orzLibsReady()';
const BASE_STYLE = 'html{scroll-behavior:auto}body{margin:0;padding:1.5rem 1.75rem}';

/** Stamp a nonce on every `<script`, `<style` and `<link` start tag of shell-built markup. */
function stampNonce(markup: string, nonce: string | undefined): string {
  if (!nonce) return markup;
  const attr = ` nonce="${escapeAttr(nonce)}"`;
  return markup.replace(/<(script|style|link)(?=[\s>])/gi, `<$1${attr}`);
}

/** The `<meta>` Content-Security-Policy that pauses the document's scripts (only `nonce`-stamped scripts, and what they load, run). */
function pauseMeta(nonce: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(`script-src 'nonce-${nonce}' 'strict-dynamic'`)}">`;
}

/** The pieces of the frame document for these options. */
export function previewFrameParts(options: PreviewFrameOptions = {}): PreviewFrameParts {
  const scheme: ColorScheme = options.scheme === 'dark' ? 'dark' : 'light';
  const assets = options.assets !== false ? getPreviewFrameAssets() : null;
  const nonce = options.nonce || options.pauseScripts || undefined;
  return {
    head: (options.pauseScripts && nonce ? pauseMeta(nonce) : '') + stampNonce(`${assets ? assets.headLinks(scheme) : ''}${options.head ?? ''}<style>${BASE_STYLE}</style>`, nonce),
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
  // The default bridge goes before the stylesheets (B#2): a script after a pending stylesheet waits
  // for it, so a slow theme or KaTeX stylesheet would hold back the ready and every render. A
  // carrier's own bridge keeps its place after the article (it may look for it when it runs).
  const early = options.bridge === undefined;
  return (
    `<!doctype html><html data-scheme="${parts.scheme}"><head><meta charset="utf-8">` +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    (early ? splitPause(parts.head, parts.bridge) : parts.head) +
    `</head><body><article class="${parts.articleClass}" id="orz-doc"></article>` +
    (early ? '' : parts.bridge) +
    // the libraries enhance the preview when they arrive (or never, offline)
    parts.scripts +
    '</body></html>'
  );
}

/** The head with the bridge after the pausing `<meta>` (which must come first) and before everything else. */
function splitPause(head: string, bridge: string): string {
  const m = /^<meta http-equiv="Content-Security-Policy"[^>]*>/.exec(head);
  return m ? m[0] + bridge + head.slice(m[0].length) : bridge + head;
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

const isSpace = (c: string): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

/**
 * Map every URL of a `srcset` value, keeping everything else as written. Parsed
 * as the HTML standard does (F5): separators are whitespace and commas; a URL
 * runs to the next whitespace (a comma inside it, as in a `data:` URL, is part
 * of it) except trailing commas, which end the candidate; descriptors run to
 * the next comma outside parentheses.
 */
export function mapSrcset(value: string, map: (url: string) => string): string {
  let out = '';
  let i = 0;
  const n = value.length;
  while (i < n) {
    let j = i;
    while (j < n && (isSpace(value[j]) || value[j] === ',')) j++;
    out += value.slice(i, j);
    i = j;
    if (i >= n) break;
    while (j < n && !isSpace(value[j])) j++;
    let url = value.slice(i, j);
    let trail = '';
    const m = /,+$/.exec(url);
    if (m) { trail = m[0]; url = url.slice(0, -trail.length); }
    out += (url ? map(url) : '') + trail;
    i = j;
    if (trail) continue;
    let paren = false;
    while (j < n) {
      const c = value[j];
      if (c === '(') paren = true;
      else if (c === ')') paren = false;
      else if (c === ',' && !paren) break;
      j++;
    }
    out += value.slice(i, j);
    i = j;
  }
  return out;
}

/**
 * Rewrite the relative asset references of rendered HTML through `resolve`
 * (FC-19 `hooks.resolveAsset`) before it enters the preview: `src`,
 * `poster`, every URL of `srcset` (parsed as {@link mapSrcset}), and `href` on elements other than `<a>` /
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
      const value = set ? mapSrcset(raw, res) : res(raw);
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
export type PreviewMessage = Readonly<Record<string, unknown>> & { readonly type: string };

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
  setOptions(options: { head?: string; scheme?: ColorScheme }): void;
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
  let frameOptions: PreviewFrameOptions = { ...options };
  const makeFrame = (): EdIframe => {
    const f = doc.createElement('iframe') as EdIframe;
    f.setAttribute('sandbox', previewSandbox(options.context ?? { host: 'app', protocol: '' }));
    f.setAttribute('title', options.title ?? 'Document preview');
    f.className = 'orz-editor__frame';
    f.srcdoc = previewFrameDocument(frameOptions);
    return f;
  };
  let iframe = makeFrame();
  const diff = options.diff !== false;
  let ready = false;
  let seq = 0;
  let pending: string | null = null;
  let anchors: Array<[number, number]> = [];
  let max = 0;
  let destroyed = false;
  /** The private port the default bridge asked for (B#10): the shell's messages go through it. */
  let port: EdPort | null = null;
  /** The render waiting for the frame's acknowledgement. */
  let waiting: { id: number; resolve(acked: boolean): void } | null = null;
  let acknowledges = false;
  /** The frame's bridge asked for a port once: its reports count only through a port from then on. */
  let portBridge = false;
  const subscribers = new Map<string, Set<(m: PreviewMessage) => void>>();
  const settle = (acked: boolean): void => { const w = waiting; waiting = null; w?.resolve(acked); };
  const send = (msg: unknown): void => {
    try {
      if (port) port.postMessage(msg);
      else iframe.contentWindow?.postMessage(msg, '*');
    } catch { /* detached */ }
  };
  const closeNow = (p: EdPort): void => { p.onmessage = null; try { p.close?.(); } catch { /* closed */ } };
  /** Ports replaced by a reload stay open a moment: a report the old document sent just before it went still arrives. */
  const retired = new Set<EdPort>();
  const closePort = (later = false): void => {
    const p = port;
    port = null;
    if (!p) return;
    if (!later || !win) { closeNow(p); return; }
    retired.add(p);
    win.setTimeout(() => { if (retired.delete(p)) closeNow(p); }, 1000);
  };
  const renderMessage = (html: string): { type: string; id: number; html: string; diff?: false } => ({ type: 'orz-preview-render', id: ++seq, html, ...(diff ? {} : { diff: false as const }) });
  /** Bridge reports: through the port they are the bridge's own (trusted events); as window messages, claims. */
  const BRIDGE_TYPES = new Set(['orz-preview-rendered', 'orz-preview-scrolled', 'orz-preview-key', 'orz-preview-link', 'orz-preview-active', 'orz-preview-focus', 'orz-preview-pong']);
  const handle = (d: Record<string, unknown>, trusted: boolean): void => {
    switch (d.type) {
      case 'orz-preview-rendered':
        if (Array.isArray(d.anchors)) anchors = (d.anchors as unknown[]).filter((a): a is [number, number] => Array.isArray(a) && num(a[0]) && num(a[1])).map((a) => [a[0], a[1]]);
        if (num(d.max)) max = d.max;
        // a bridge that reports ids paces the renders (B#3); one without ids acknowledges any render
        if (waiting && (d.id === waiting.id || !num(d.id))) { acknowledges = true; settle(true); }
        events.onRendered?.(anchors, max);
        break;
      case 'orz-preview-scrolled':
        if (num(d.max)) max = d.max;
        if (num(d.line)) events.onScrolled?.(num(d.top) ? d.top : 0, max, d.line);
        else if (num(d.top)) events.onScrolled?.(d.top, max);
        break;
      case 'orz-preview-key':
        if (d.key === 's' || d.key === '\\' || d.key === 'Escape') events.onKey?.(d.key, trusted);
        break;
      case 'orz-preview-link':
        if (typeof d.href === 'string') events.onLink?.(d.href, trusted);
        break;
      case 'orz-preview-active':
        events.onActive?.(typeof d.input === 'string' ? d.input : undefined, trusted);
        break;
      case 'orz-preview-focus':
        if (trusted) events.onFocus?.(d.reader === true);
        break;
      case 'orz-preview-pong':
        if (trusted && num(d.id)) events.onPong?.(d.id, d.pointer === true);
        break;
    }
    const set = typeof d.type === 'string' ? subscribers.get(d.type) : undefined;
    if (set) for (const fn of [...set]) { try { fn(d as PreviewMessage); } catch { /* the subscriber's own error */ } }
  };
  const onPort = (e: { data?: unknown }): void => {
    const d = e?.data as Record<string, unknown> | null;
    if (!destroyed && d && typeof d === 'object') handle(d, true);
  };
  const onMessage: EdListener = (e: EdEvent) => {
    if (!iframe.contentWindow || e.source !== iframe.contentWindow) return;
    const d = e.data as Record<string, unknown> | null;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'orz-preview-ready') {
      ready = true;
      acknowledges = false;
      if (stall !== null) { win?.clearTimeout(stall); stall = null; }
      closePort();
      // the default bridge asks for a private channel (its ready carries a random token)
      if (typeof d.channel === 'string' && d.channel && win?.MessageChannel) {
        portBridge = true;
        try {
          const ch = new win.MessageChannel();
          ch.port1.onmessage = onPort;
          iframe.contentWindow.postMessage({ type: 'orz-preview-port', channel: d.channel }, '*', [ch.port2]);
          port = ch.port1;
        } catch { closePort(); }
      }
      settle(false);
      if (pending !== null) send(renderMessage(pending));
      events.onReady?.();
      const set = subscribers.get('orz-preview-ready');
      if (set) for (const fn of [...set]) { try { fn(d as PreviewMessage); } catch { /* the subscriber's own error */ } }
      return;
    }
    // with a port, the bridge's reports come only through it: the same types as window messages are a document script's
    if (portBridge && typeof d.type === 'string' && BRIDGE_TYPES.has(d.type)) return;
    handle(d, false);
  };
  win?.addEventListener('message', onMessage);
  // A moved or reloaded frame boots again and says ready again: the last HTML is re-sent then.
  parent.append(iframe);
  let stall: unknown = null;
  const armStall = (): void => {
    if (stall !== null) win?.clearTimeout(stall);
    stall = win ? win.setTimeout(() => { stall = null; if (!ready && !destroyed) events.onStall?.(); }, options.readyTimeoutMs ?? PREVIEW_READY_TIMEOUT_MS) : null;
  };
  armStall();
  /**
   * Rebuild the frame document. `replace`: a new iframe element takes the old one's place — removing
   * the old element ends its document at once (a new `srcdoc` keeps the old document running until
   * the new one commits, which is how long a paused document's scripts would go on).
   */
  const reload = (next: PreviewFrameOptions, replace = false): void => {
    if (destroyed) return;
    frameOptions = next;
    ready = false;
    closePort(true);
    settle(false);
    if (replace) {
      const old = iframe;
      iframe = makeFrame();
      if (typeof old.replaceWith === 'function') old.replaceWith(iframe);
      else { parent.append(iframe); old.remove(); }
    } else iframe.srcdoc = previewFrameDocument(frameOptions);
    armStall();
  };
  return {
    get iframe() { return iframe; },
    render(html) {
      pending = html;
      settle(false);
      if (!ready || destroyed) return Promise.resolve(false);
      const msg = renderMessage(html);
      const p = new Promise<boolean>((resolve) => { waiting = { id: msg.id, resolve }; });
      send(msg);
      return p;
    },
    scrollTo(top) {
      if (ready && num(top)) send({ type: 'orz-preview-scroll', top });
    },
    navigate(line) {
      if (ready && num(line)) send({ type: 'orz-preview-navigate', line });
    },
    post(message) {
      if (!ready || destroyed || !message || typeof message !== 'object') return false;
      send({ ...message });
      return true;
    },
    on(type, fn) {
      let set = subscribers.get(type);
      if (!set) subscribers.set(type, (set = new Set()));
      set.add(fn);
      return () => { set!.delete(fn); };
    },
    setOptions(o) {
      reload({ ...frameOptions, ...(o.head !== undefined ? { head: o.head } : {}), ...(o.scheme !== undefined ? { scheme: o.scheme } : {}) });
    },
    pauseScripts(nonce) {
      if (frameOptions.pauseScripts || !nonce) return;
      reload({ ...frameOptions, pauseScripts: nonce }, true);
    },
    resumeScripts() {
      if (!frameOptions.pauseScripts) return;
      const rest: PreviewFrameOptions = { ...frameOptions };
      delete rest.pauseScripts;
      reload(rest, true);
    },
    get scriptsPaused() { return !!frameOptions.pauseScripts; },
    get acknowledges() { return acknowledges; },
    get authenticated() { return portBridge; },
    get anchors() { return anchors; },
    get max() { return max; },
    get ready() { return ready; },
    destroy() {
      destroyed = true;
      win?.removeEventListener('message', onMessage);
      if (stall !== null) { win?.clearTimeout(stall); stall = null; }
      closePort();
      for (const p of retired) closeNow(p);
      retired.clear();
      settle(false);
      subscribers.clear();
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
