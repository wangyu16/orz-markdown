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
 * - The bridge gets a private MessageChannel port only by proving it ran
 *   first in the frame: a per-frame secret the shell writes on the bridge's
 *   `<script>` element, which the bridge reads and removes before any
 *   document content exists. Keys, links, input and scrolls act only when
 *   they arrive through that port (trusted events); window messages are data.
 *   A document's own scripts may take the keyboard focus inside the frame
 *   (accepted, FC-19 §5 invariant 3): they still cannot save, switch views,
 *   open links or scroll the editor.
 * - Updates are incremental: the bridge keeps every top-level node whose
 *   HTML did not change (common prefix and suffix), so drawn diagrams and the
 *   scroll position survive typing; it then re-runs `__orzEnhance` and reports
 *   the scroll anchors (`[data-src-line]` elements) for scroll sync.
 * - Messages are read only from that iframe's own window; the frame reads
 *   only messages from its parent, or from the private MessageChannel port the
 *   shell hands it in answer to its authenticated ready (so a shell mounted
 *   from another window's script still reaches it). Payloads are data: the
 *   frame renders the HTML the editor's own renderer produced, the parent
 *   reads numbers and a link href from the frame.
 */
import { escapeAttr } from '../../html.js';
import { getPreviewFrameAssets, type ColorScheme } from '../../preview-frame.js';
import type { EdDocument, EdElement, EdEvent, EdIframe, EdListener, EdPort, EdView } from './types.js';

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
   * `orz-preview-port { channel }` and send its reports through it — and,
   * for the same guarantee, capture every native it uses before the document
   * runs and run no document-visible code inside its listeners (handle a
   * message in a captured `setTimeout`: `window.event`), as the default
   * bridge does (E.35).
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
export const PREVIEW_SECRET_ATTRIBUTE = 'data-orz-preview-secret';

/**
 * The bridge inside the frame (ES5, no `</script`). Swaps the article's
 * changed top-level nodes (compared without their `data-src-line`, whose new
 * values are copied onto the kept nodes, so a line inserted above does not
 * redraw everything below), enhances, reports anchors with the render's id;
 * forwards scroll, the shell's shortcuts (Cmd/Ctrl+S, Cmd/Ctrl+\, Esc; 2.3.0:
 * Cmd/Ctrl+P, default prevented in the frame — the shell's `print`), link
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
 * document's scripts cannot send on it.
 *
 * Captured natives (2.3.0, round 3 of the paged loop; FC-19 §8.4, claim E.35).
 * The document's scripts share the frame's realm: a built-in the bridge called
 * after them could be replaced and handed the bridge's event or port (a
 * `MessageEvent.prototype.data` getter called with the port's event as
 * `this`, `Function.prototype.call`, `addEventListener`, a caller walk from a
 * page hook…). So its first statement captures every native its trust path
 * uses — `Reflect.apply`, the MessageEvent / Event / KeyboardEvent /
 * MouseEvent getters and methods, an event's own `isTrusted` getter,
 * `Element.prototype.closest` / `getAttribute`,
 * `EventTarget.prototype.addEventListener`, `MessagePort.prototype.postMessage`
 * / `start`, `Date.now`, the timers, `Object.freeze` — and calls them only
 * through the captured `Reflect.apply` (`C(fn, this, args)`); it listens on
 * the port with the captured `addEventListener` (never `onmessage`); it is
 * strict (invisible to `fn.caller`, `fn.arguments` and stack walks);
 * `__orzPreview` and `__orzLibsReady` are frozen, non-writable and
 * non-configurable window properties; once it holds the port it ignores
 * window messages.
 *
 * No document code inside a listener (2.3.0, round 4 of the paged loop).
 * While an event listener runs, `window.event` is its event — for the port's
 * message, an event whose `target` is the port — and so is it for any
 * microtask that runs before the dispatch ends (a MutationObserver's). So each
 * of the bridge's listeners runs only captured natives: the port's listener
 * reads the data with the captured getter, drops the event and handles the
 * message in a captured `setTimeout` (where `window.event` is undefined); a
 * window message (a bridge without the port) and an in-page `#` link are
 * handled the same way; the key, pointer, wheel, touch and click listeners
 * read what they need with captured getters and post through the port
 * without calling anything the document can replace. The document
 * cannot get the port nor make the reader's plain key or click a save, print
 * or link. It reports keys, link clicks, input
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
 *
 * Shared assets (2.4.0, E.46). The frame's opaque origin cannot load the host
 * page's `blob:` URLs. The shell sends the bytes of each `blob:` URL that
 * `resolveAsset` gave ONCE, as a `Blob` (`orz-preview-assets { add: [[url,
 * blob]], drop: [url] }`); the bridge makes its own object URL for it and
 * swaps the host's URL for it in every render's HTML (and
 * `window.__orzPreview.assets(html)` does the same for a carrier's own
 * messages); a dropped one is revoked 30 s later. The HTML that crosses
 * stays small: no `data:` copy per render. A frame document that loads again
 * starts empty; the shell sends them again with the next ready.
 */
export const PREVIEW_BRIDGE = [
  '(function(){"use strict";',
  'var W=window,D=document,P=W.parent,art=null,last=0,want=0,mute=0,queued=0,timer=0,port=null,sec=null,chan=String(Math.random()).slice(2),lastIn=-1e9,busy=0,next=null;',
  'try{var me=D.currentScript;if(me){sec=me.getAttribute("data-orz-preview-secret");me.removeAttribute("data-orz-preview-secret")}}catch(e){}',
  // every native the bridge's trust path uses, as it is now (before any document content): only these are used after
  'var RA=Reflect.apply,GOD=Object.getOwnPropertyDescriptor,DFP=Object.defineProperty,FZ=Object.freeze,NOW=Date.now,ST=W.setTimeout,CT=W.clearTimeout,RAF=W.requestAnimationFrame;',
  'function G(o,n){try{var x=GOD(o,n);return x?x.get||x.value:null}catch(e){return null}}',
  'var EP=W.MessageEvent?MessageEvent.prototype:null,VP=Event.prototype,KP=W.KeyboardEvent?KeyboardEvent.prototype:null,LP=Element.prototype,MP=W.MessagePort?MessagePort.prototype:null,',
  'AEL=G(EventTarget.prototype,"addEventListener"),DATA=G(EP,"data"),PORTS=G(EP,"ports"),SRC=G(EP,"source"),TGT=G(VP,"target"),PD=G(VP,"preventDefault"),SIP=G(VP,"stopImmediatePropagation"),DP=G(VP,"defaultPrevented"),',
  'TRU=G(new Event("orz"),"isTrusted"),KEY=G(KP,"key"),META=G(KP,"metaKey"),CTRL=G(KP,"ctrlKey"),ALT=G(KP,"altKey"),SHIFT=G(KP,"shiftKey"),BTN=W.MouseEvent?G(MouseEvent.prototype,"buttons"):null,',
  'CLO=G(LP,"closest"),GA=G(LP,"getAttribute"),PM=G(MP,"postMessage"),PS=G(MP,"start");',
  // (2.4.0) the host's blob: assets, sent once as Blobs: host URL -> this frame's own object URL
  'var AU=W.URL,COU=AU?AU.createObjectURL:null,ROU=AU?AU.revokeObjectURL:null,AS=Object.create(null),AK=[];',
  'function C(f,o,a){return RA(f,o,a||[])}',
  'function on(t,n,f,o){C(AEL,t,[n,f,o])}',
  'function tr(e){try{return TRU?C(TRU,e)===true:false}catch(x){return false}}',
  // run f after the current event's dispatch: while a listener runs, window.event is its event (for the port's, the port), so no document-visible code runs inside one
  'function defer(f){ST(f,0)}',
  'try{var rv=new Uint32Array(4);crypto.getRandomValues(rv);chan=Array.prototype.join.call(rv,"-")}catch(e){}',
  'on(W,"message",function(e){var d=C(DATA,e);',
  'if(d&&typeof d==="object"&&d.type==="orz-preview-port"){C(SIP,e);if(!port&&d.channel===chan){var q=C(PORTS,e);q=q&&q.length>0?q[0]:null;if(q&&PM){port=q;on(q,"message",function(m){var x=C(DATA,m);m=null;defer(function(){handle(x)})});if(PS)C(PS,q)}}return}',
  'if(!port&&C(SRC,e)===P)defer(function(){if(!port)handle(d)})},true);',
  'function active(k){lastIn=NOW();send({type:"orz-preview-active",input:k})}',
  'on(W,"pointerdown",function(e){if(tr(e))active("pointer")},true);',
  'on(W,"wheel",function(e){if(tr(e))active("wheel")},{passive:true,capture:true});',
  'on(W,"touchstart",function(e){if(tr(e))active("touch")},{passive:true,capture:true});',
  'on(W,"pointermove",function(e){if(tr(e)&&C(BTN,e))lastIn=NOW()},{passive:true,capture:true});',
  'var sch=D.documentElement.getAttribute("data-scheme");if(sch==="dark")W.__orzSmilesTheme="dark";',
  'function A(){return art||(art=D.getElementById("orz-doc"))}',
  'function post(m){try{P.postMessage(m,"*")}catch(e){}}',
  'function send(m){if(port&&PM){try{C(PM,port,[m])}catch(e){}}}',
  'function strip(h){return h.replace(/<[a-zA-Z][^>]*>/g,function(t){return t.replace(/ data-src-line="[^"]*"/g,"")})}',
  'function keyOf(n){return n.nodeType===1?strip(n.outerHTML):n.nodeType===3?"#"+n.data:n.nodeType===8?"!"+n.data:""}',
  'function lines(n){var l=[],q,i;if(n.nodeType!==1)return l;if(n.hasAttribute("data-src-line"))l.push(n);q=n.querySelectorAll("[data-src-line]");for(i=0;i<q.length;i++)l.push(q[i]);return l}',
  'function keep(o,n){if(o.__orzKey!==n.__orzKey)return false;var a=lines(o),b=lines(n),i;if(a.length!==b.length)return false;for(i=0;i<a.length;i++)a[i].setAttribute("data-src-line",b[i].getAttribute("data-src-line"));return true}',
  'function apply(html){var root=A(),t=D.createElement("template");t.innerHTML=html;var nx=Array.prototype.slice.call(t.content.childNodes),old=Array.prototype.slice.call(root.childNodes),a=old.length,b=nx.length,p=0,s=0,i;',
  'for(i=0;i<b;i++)nx[i].__orzKey=keyOf(nx[i]);',
  'while(p<a&&p<b&&keep(old[p],nx[p]))p++;',
  'while(s<a-p&&s<b-p&&keep(old[a-1-s],nx[b-1-s]))s++;',
  'var ref=s>0?old[a-s]:null;for(i=p;i<a-s;i++)root.removeChild(old[i]);',
  'for(i=p;i<b-s;i++)root.insertBefore(nx[i],ref)}',
  'function whole(html){var y=se().scrollTop;A().innerHTML=html;se().scrollTop=y}',
  'function se(){return D.scrollingElement||D.documentElement}',
  'function max(){return Math.max(0,se().scrollHeight-W.innerHeight)}',
  'function anchors(){var root=A(),out=[];if(!root)return out;var els=root.querySelectorAll("[data-src-line]"),y=se().scrollTop||0,i,l,r;',
  'for(i=0;i<els.length;i++){l=parseInt(els[i].getAttribute("data-src-line"),10);if(isNaN(l))continue;r=els[i].getBoundingClientRect();if(!r.height&&!r.width)continue;out.push([l,r.top+y])}',
  'out.sort(function(x,z){return x[1]-z[1]});return out}',
  'function report(){var m={type:"orz-preview-rendered",id:last,anchors:anchors(),max:max()};if(port)send(m);else post(m)}',
  'function navigated(l){if(typeof l==="number"&&isFinite(l)&&NOW()-lastIn<1500)send({type:"orz-preview-scrolled",line:l})}',
  'function enhance(){try{if(typeof W.__orzEnhance==="function")W.__orzEnhance()}catch(e){}}',
  'function later(){CT(timer);timer=ST(function(){enhance();report()},350)}',
  'function done(){enhance();report();later()}',
  'function render(d,n){var h=W.__orzPreviewApply,r;want=d.id;',
  'if(typeof h==="function"){if(busy){next=d;return}try{r=h(String(d.html),d)}catch(x){r=null}',
  'if(r&&typeof r.then==="function"){busy=1;var fin=function(ok){busy=0;var q=next;next=null;if(q){render(q,0);return}if(want===d.id){last=d.id;if(ok)done();else report()}};try{r.then(function(){fin(1)},function(){fin(0)})}catch(x){fin(0)}}else{last=d.id;done()}return}',
  'if(!A()){if((n||0)<400)ST(function(){if(want===d.id)render(d,(n||0)+1)},25);return}',
  'last=d.id;if(d.diff===false)whole(String(d.html));else try{apply(String(d.html))}catch(x){whole(String(d.html))}done()}',
  'function swap(h){h=String(h);if(!AK.length||h.indexOf("blob:")<0)return h;for(var i=0;i<AK.length;i++)if(h.indexOf(AK[i])>=0)h=h.split(AK[i]).join(AS[AK[i]]);return h}',
  'function keys(){AK=[];for(var k in AS)AK.push(k)}',
  'function assets(d){var a=d.add,r=d.drop,i,u,l;',
  'if(a&&a.length)for(i=0;i<a.length;i++){u=a[i]&&a[i][0];if(typeof u!=="string"||u.indexOf("blob:")!==0||AS[u]||!COU)continue;try{AS[u]=C(COU,AU,[a[i][1]])}catch(x){}}',
  'if(r&&r.length)for(i=0;i<r.length;i++){u=r[i];l=typeof u==="string"?AS[u]:null;if(!l)continue;delete AS[u];(function(l){ST(function(){try{if(ROU)C(ROU,AU,[l])}catch(x){}},30000)})(l)}',
  'keys()}',
  'function handle(d){if(!d||typeof d!=="object")return;',
  'if(d.type==="orz-preview-assets"){assets(d);return}',
  'if(d.type==="orz-preview-render"){d.html=swap(d.html);render(d,0)}',
  'else if(d.type==="orz-preview-scroll"&&typeof d.top==="number"){mute=NOW()+150;se().scrollTop=d.top}',
  'else if(d.type==="orz-preview-navigate"){if(typeof W.__orzPreviewNavigate==="function"&&typeof d.line==="number")try{W.__orzPreviewNavigate(d.line)}catch(x){}}',
  'else if(typeof W.__orzPreviewMessage==="function")try{W.__orzPreviewMessage(d)}catch(x){}}',
  'if(W.ResizeObserver)new ResizeObserver(later).observe(D.documentElement);',
  'on(W,"scroll",function(e){if(!tr(e)||NOW()<mute||NOW()-lastIn>1500||queued)return;queued=1;RAF(function(){queued=0;send({type:"orz-preview-scrolled",top:se().scrollTop,max:max()})})},{passive:true});',
  'on(D,"keydown",function(e){if(!tr(e))return;var k=C(KEY,e),mod=(C(META,e)===true||C(CTRL,e)===true)&&C(ALT,e)!==true;active("key");',
  'if(mod&&(k==="s"||k==="S"||k==="\\\\")){C(PD,e);send({type:"orz-preview-key",key:k==="\\\\"?"\\\\":"s"})}',
  'else if(mod&&C(SHIFT,e)!==true&&(k==="p"||k==="P")){C(PD,e);send({type:"orz-preview-key",key:"p"})}',
  'else if(k==="Escape")send({type:"orz-preview-key",key:"Escape"})});',
  'on(D,"click",function(e){var t=C(TGT,e),a=null;try{a=t?C(CLO,t,["a[href]"]):null}catch(x){}if(!a||C(DP,e))return;var h=C(GA,a,["href"]);h=typeof h==="string"?h:"";C(PD,e);',
  'if(h[0]==="#"){defer(function(){var id=h.slice(1);try{id=decodeURIComponent(id)}catch(x){}var g=D.getElementById(id);if(g)g.scrollIntoView()});return}',
  'if(tr(e))send({type:"orz-preview-link",href:h})});',
  'function libs(){enhance();report()}',
  'function pin(n,v){try{DFP(W,n,{value:v,writable:false,configurable:false,enumerable:true})}catch(e){try{W[n]=v}catch(x){}}}',
  'pin("__orzLibsReady",FZ(libs));',
  'pin("__orzPreview",FZ({report:FZ(report),post:FZ(post),navigated:FZ(navigated),assets:FZ(swap)}));',
  'post(sec?{type:"orz-preview-ready",channel:chan,secret:sec}:{type:"orz-preview-ready"});sec=null;',
  '})();',
].join('');

/**
 * `'sha256-…'` of {@link PREVIEW_BRIDGE}, for a hash-based Content-Security-Policy
 * (`script-src 'sha256-…'`). A test recomputes it; with `assets` the frame has
 * more inline scripts — {@link previewScriptHashes} lists them all. (The
 * secret is an attribute of the `<script>` element, not its text: the hash
 * does not change per frame.)
 */
export const PREVIEW_BRIDGE_HASH = 'sha256-MAI8js5YeoyeRzISaCz3JUhiXCr4fDNbvse0M6ydAFI=';

/** The inline call that tells the bridge the pinned libraries have loaded. */
const LIBS_READY = 'window.__orzLibsReady()';
const BASE_STYLE = 'html{scroll-behavior:auto}body{margin:0;padding:1.5rem 1.75rem}';

/** Stamp a nonce on every `<script`, `<style` and `<link` start tag of shell-built markup. */
function stampNonce(markup: string, nonce: string | undefined): string {
  if (!nonce) return markup;
  const attr = ` nonce="${escapeAttr(nonce)}"`;
  return markup.replace(/<(script|style|link)(?=[\s>])/gi, `<$1${attr}`);
}

/** The pieces of the frame document for these options. */
export function previewFrameParts(options: PreviewFrameOptions = {}): PreviewFrameParts {
  const scheme: ColorScheme = options.scheme === 'dark' ? 'dark' : 'light';
  const assets = options.assets !== false ? getPreviewFrameAssets() : null;
  const nonce = options.nonce || undefined;
  const secret = options.secret ? ` ${PREVIEW_SECRET_ATTRIBUTE}="${escapeAttr(options.secret)}"` : '';
  return {
    head: stampNonce(`${assets ? assets.headLinks(scheme) : ''}${options.head ?? ''}<style>${BASE_STYLE}</style>`, nonce),
    bridge: stampNonce(`<script${secret}>${options.bridge ?? PREVIEW_BRIDGE}</script>`, nonce),
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
    (early ? parts.bridge + parts.head : parts.head) +
    `</head><body><article class="${parts.articleClass}" id="orz-doc"></article>` +
    (early ? '' : parts.bridge) +
    // the libraries enhance the preview when they arrive (or never, offline)
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
 * (2.4.0, E-M1) The path `resolveAsset` receives for a reference as written
 * in rendered HTML: percent-decoded once (`decodeURI`; a malformed escape
 * leaves it as written). The parser writes a Markdown link's target
 * percent-encoded (`my%20pic.png`, `%E5%9B%BE.png`) while `uploadAsset`
 * returned `my pic.png` / `图.png`: the hook gets the path as the upload
 * gave it, whatever surface asks (FC-19 §3).
 */
export function assetPath(reference: string): string {
  try { return decodeURI(reference); } catch { return reference; }
}

/** True for a reference `resolveAsset` is asked about: relative (no scheme, not `/`, `\\`, `#` or `?` first), not empty. */
export function isRelativeAsset(reference: string): boolean {
  return isRelative(reference.trim());
}

/**
 * Rewrite the relative asset references of rendered HTML through `resolve`
 * (FC-19 `hooks.resolveAsset`, given the path {@link assetPath} decodes) before it enters the preview: `src`,
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
      const r = resolve(assetPath(t));
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

/** A `blob:` URL inside a start tag (an attribute value, a `style` url()): up to a quote, space, paren, comma, `&` or `<>`. */
const BLOB_URL = /blob:[^\s"'<>()\\,&]+/g;
/** The largest asset `inlineBlobUrls` copies into the preview (bytes): above it the reference stays, with an error. */
export const PREVIEW_BLOB_MAX_BYTES = 32 * 1024 * 1024;

/** (2.4.0, E.46) The `blob:` URLs in the start tags of `html` (attribute values, a `style`'s url()), each once. */
export function blobUrlsIn(html: string): string[] {
  if (!html.includes('blob:')) return [];
  const urls = new Set<string>();
  for (const tag of html.match(START_TAG) ?? []) for (const u of tag.match(BLOB_URL) ?? []) urls.add(u);
  return [...urls];
}

/** (2.4.0, E.46) A `blob:` URL's Blob, read in the page (needs `connect-src blob:` under a policy). */
export async function readBlobUrl(url: string): Promise<unknown> {
  const g = globalThis as unknown as { fetch?(u: string): Promise<{ ok: boolean; status: number; blob(): Promise<unknown> }> };
  if (typeof g.fetch !== 'function') throw new Error('no fetch in this page');
  const res = await g.fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

/** A blob's bytes as a `data:` URL (base64; the blob's own type when it is a plain MIME type). */
async function blobDataUrl(url: string): Promise<string> {
  const g = globalThis as unknown as { fetch?(u: string): Promise<{ ok: boolean; status: number; blob(): Promise<{ size: number; type: string; arrayBuffer(): Promise<ArrayBuffer> }> }>; btoa?(s: string): string };
  if (typeof g.fetch !== 'function' || typeof g.btoa !== 'function') throw new Error('no fetch in this page');
  const res = await g.fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (blob.size > PREVIEW_BLOB_MAX_BYTES) throw new Error(`${blob.size} bytes, above the preview's ${PREVIEW_BLOB_MAX_BYTES}`);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const type = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(blob.type) ? blob.type : 'application/octet-stream';
  return `data:${type};base64,${g.btoa(bin)}`;
}

/**
 * Copy the bytes of every `blob:` URL in the start tags of `html` (an asset
 * reference `resolveAsset` gave, or any attribute or `style` that holds one)
 * into a `data:` URL (2.4.0, E.44). The preview frame of an app host has an
 * opaque origin (`allow-scripts` only), and a browser refuses it the page's
 * own `blob:` URLs ("Not allowed to load local resource"), so a host that
 * keeps uploads as object URLs would see every picture broken; the page
 * itself can read them. Each URL is read once per `cache` (the shell keeps
 * one per editor); a URL that cannot be read (revoked, a page policy without
 * `connect-src blob:`, larger than {@link PREVIEW_BLOB_MAX_BYTES}) stays as it
 * was and is reported once through `onError`. Text content is never changed.
 */
export async function inlineBlobUrls(html: string, cache: Map<string, Promise<string | null>>, onError?: (url: string, message: string) => void): Promise<string> {
  if (!html.includes('blob:')) return html;
  const urls = new Set<string>();
  for (const tag of html.match(START_TAG) ?? []) for (const u of tag.match(BLOB_URL) ?? []) urls.add(u);
  if (urls.size === 0) return html;
  const found = new Map<string, string>();
  await Promise.all([...urls].map(async (u) => {
    let p = cache.get(u);
    if (!p) {
      p = blobDataUrl(u).catch((e: unknown) => {
        onError?.(u, `${u} (from resolveAsset) could not be read for the preview: ${e instanceof Error ? e.message : String(e)}. Return a data: or http(s) URL from resolveAsset, or allow connect-src blob: in the page's policy`);
        return null;
      });
      cache.set(u, p);
    }
    const d = await p;
    if (d !== null) found.set(u, d);
  }));
  if (found.size === 0) return html;
  return html.replace(START_TAG, (tag: string) => (tag.includes('blob:') ? tag.replace(BLOB_URL, (u: string) => found.get(u) ?? u) : tag));
}

export interface PreviewEvents {
  /** The frame reported anchors after a render (`[line, top]`, sorted by top) and its scrollable height. */
  onRendered?(anchors: Array<[number, number]>, max: number): void;
  /** The frame scrolled: its top and scrollable height, or (a navigating bridge) the source line it shows. */
  onScrolled?(top: number, max: number, line?: number): void;
  /** `s`, `\`, `Escape`, (2.3.0) `p` (Cmd/Ctrl+P) pressed inside the frame (the bridge's report through its port: a trusted key event, the reader's own). */
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
export type PreviewMessage = Readonly<Record<string, unknown>> & { readonly type: string };

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
  /**
   * (2.4.0, E.46) Share `blob:` assets with the frame: each `[url, blob]` of
   * `add` is sent once per frame document (again after a reload, before the
   * pending render); `drop` releases them (the frame revokes its object URL).
   */
  shareAssets(add: ReadonlyArray<readonly [string, unknown]>, drop?: ReadonlyArray<string>): void;
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
  setOptions(options: { head?: string; scheme?: ColorScheme; articleClass?: string }): void;
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
export const PREVIEW_READY_TIMEOUT_MS = 8000;

/** (2.5.0, D-80) How long after its load event a frame that has not said ready is reported as stalled. */
export const PREVIEW_LOAD_GRACE_MS = 1000;

/** (2.5.0, D-100) The longest a rebuilt frame document (a theme change) stays hidden behind the previous one. */
export const PREVIEW_REBUILD_MAX_MS = 3000;

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A fresh frame secret (Web Crypto when there is one). */
function frameSecret(win: EdView | null | undefined): string {
  try {
    const a = new Uint32Array(4);
    const c = win?.crypto ?? (globalThis as { crypto?: EdView['crypto'] }).crypto;
    c?.getRandomValues?.(a);
    if (a.some((x) => x !== 0)) return Array.from(a, (x) => x.toString(36)).join('-');
  } catch { /* no crypto */ }
  return `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/** Create the sandboxed preview iframe in `parent` and talk to it. */
export function createPreview(
  doc: EdDocument,
  parent: EdElement,
  options: PreviewFrameOptions & { title?: string; context?: PreviewContext; readyTimeoutMs?: number },
  events: PreviewEvents,
): PreviewController {
  const win = doc.defaultView;
  let frameOptions: PreviewFrameOptions = { ...options };
  /** This frame document's secret: a ready that carries it gets the port (a new one for every frame document). */
  let secret = frameSecret(win);
  const frameDocument = (): string => previewFrameDocument({ ...frameOptions, secret });
  /** The one place the preview iframe is made (a rebuilt frame document gets another, D-100). */
  const makeFrame = (): EdIframe => {
    const iframe = doc.createElement('iframe') as EdIframe;
    iframe.setAttribute('sandbox', previewSandbox(options.context ?? { host: 'app', protocol: '' }));
    iframe.setAttribute('title', options.title ?? 'Document preview');
    iframe.className = 'orz-editor__frame';
    return iframe;
  };
  /** The frame the shell talks to (its window is the only source of messages taken). */
  let iframe = makeFrame();
  iframe.srcdoc = frameDocument();
  /**
   * (2.5.0, STATUS D-100) The previous frame, still shown while `iframe` — a rebuilt frame document
   * (`setOptions`: a theme change) — loads covered by it (the parent is positioned, as the shell's
   * preview pane is): it is only a picture (inert, no messages taken), removed once the new frame has drawn the last HTML with its stylesheets, so a theme
   * change never flashes an empty or unstyled preview.
   */
  let shown: EdIframe | null = null;
  let staging: { loaded: boolean; drawn: boolean; timer: unknown } | null = null;
  const diff = options.diff !== false;
  let ready = false;
  let seq = 0;
  let pending: string | null = null;
  let anchors: Array<[number, number]> = [];
  let max = 0;
  let destroyed = false;
  /** The private port the authenticated bridge got: the shell's messages go through it. */
  let port: EdPort | null = null;
  /** The render waiting for the frame's acknowledgement. */
  let waiting: { id: number; resolve(acked: boolean): void } | null = null;
  let acknowledges = false;
  /** A bridge proved the secret once: `authenticated`. */
  let portBridge = false;
  /** A port was handed for the current frame document (its secret): plain readies are a replaced document's from then on. */
  let handed = false;
  /** An authenticated ready was taken since the frame last loaded: another one before the next load is ignored. */
  let taken = false;
  const subscribers = new Map<string, Set<(m: PreviewMessage) => void>>();
  /** The blob: assets shared with the frame (E.46): url → Blob, sent once per frame document. */
  const sharedAssets = new Map<string, unknown>();
  const sentAssets = new Set<string>();
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
  const notify = (d: Record<string, unknown>): void => {
    const set = typeof d.type === 'string' ? subscribers.get(d.type) : undefined;
    if (set) for (const fn of [...set]) { try { fn(d as PreviewMessage); } catch { /* the subscriber's own error */ } }
  };
  const rendered = (d: Record<string, unknown>): void => {
    if (Array.isArray(d.anchors)) anchors = (d.anchors as unknown[]).filter((a): a is [number, number] => Array.isArray(a) && num(a[0]) && num(a[1])).map((a) => [a[0], a[1]]);
    if (num(d.max)) max = d.max;
    // a bridge that reports ids paces the renders (B#3); one without ids acknowledges any render
    if (waiting && (d.id === waiting.id || !num(d.id))) { acknowledges = true; settle(true); }
    events.onRendered?.(anchors, max);
    stagedStep('drawn');
  };
  /** The authenticated bridge's reports (through its port): the reader's own input in the frame. */
  const onPort = (e: { data?: unknown }): void => {
    const d = e?.data as Record<string, unknown> | null;
    if (destroyed || !d || typeof d !== 'object') return;
    switch (d.type) {
      case 'orz-preview-rendered':
        rendered(d);
        break;
      case 'orz-preview-scrolled':
        if (num(d.max)) max = d.max;
        if (num(d.line)) events.onScrolled?.(num(d.top) ? d.top : 0, max, d.line);
        else if (num(d.top)) events.onScrolled?.(d.top, max);
        break;
      case 'orz-preview-key':
        if (d.key === 's' || d.key === '\\' || d.key === 'Escape' || d.key === 'p') events.onKey?.(d.key);
        break;
      case 'orz-preview-link':
        if (typeof d.href === 'string') events.onLink?.(d.href);
        break;
      case 'orz-preview-active':
        events.onActive?.(typeof d.input === 'string' ? d.input : undefined);
        break;
    }
    notify(d);
  };
  /** Show the frame the shell talks to (the end of a rebuild: the picture of the previous one goes). */
  const reveal = (): void => {
    const st = staging;
    staging = null;
    if (st && st.timer !== null) win?.clearTimeout(st.timer);
    const old = shown;
    shown = null;
    old?.remove();
    iframe.removeAttribute('aria-hidden');
    iframe.inert = false;
  };
  const stagedStep = (what: 'loaded' | 'drawn'): void => {
    if (!staging) return;
    staging[what] = true;
    if (staging.loaded && (staging.drawn || pending === null)) reveal();
  };
  const takeReady = (): void => {
    ready = true;
    acknowledges = false;
    if (stall !== null) { win?.clearTimeout(stall); stall = null; }
    settle(false);
    // a new frame document holds none of the shared assets: all of them first, then the pending render
    sentAssets.clear();
    if (sharedAssets.size > 0) { send({ type: 'orz-preview-assets', add: [...sharedAssets] }); for (const u of sharedAssets.keys()) sentAssets.add(u); }
    if (pending !== null) send(renderMessage(pending));
    events.onReady?.();
    notify({ type: 'orz-preview-ready' });
  };
  const onMessage: EdListener = (e: EdEvent) => {
    if (destroyed || !iframe.contentWindow || e.source !== iframe.contentWindow) return;
    const d = e.data as Record<string, unknown> | null;
    if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
    if (d.type === 'orz-preview-ready') {
      if (typeof d.channel === 'string') {
        // the bridge proves it ran first in this frame document: only then does it get a port. A ready
        // without this frame's secret, or a second one before the frame loads again, is ignored — it
        // changes nothing, and the port the bridge holds stays open.
        if (!d.channel || d.secret !== secret || taken) return;
        if (!win?.MessageChannel) { taken = true; takeReady(); return; } // no channels here: renders only
        let next: EdPort;
        try {
          const ch = new win.MessageChannel();
          ch.port1.onmessage = onPort;
          iframe.contentWindow.postMessage({ type: 'orz-preview-port', channel: d.channel }, '*', [ch.port2]);
          next = ch.port1;
        } catch { return; }
        taken = true;
        handed = true;
        portBridge = true;
        closePort(true); // the frame loaded again (the same document): its old port goes
        port = next;
        takeReady();
        return;
      }
      // a plain ready: a bridge without the port (renders only) — once a port was handed for this frame
      // document, it is a replaced document's and is ignored
      if (handed) return;
      takeReady();
      return;
    }
    // Window messages are data: they never act on keys, links, focus or scroll. Only a bridge without the
    // port may acknowledge renders this way (its pacing and anchors).
    if (d.type.startsWith('orz-preview-')) {
      if (d.type === 'orz-preview-rendered' && !handed) { rendered(d); notify(d); }
      return;
    }
    notify(d);
  };
  win?.addEventListener('message', onMessage);
  let stall: unknown = null;
  const stalled = (): void => {
    if (stall !== null) { win?.clearTimeout(stall); stall = null; }
    if (ready || destroyed) return;
    reveal(); // what the frame shows now is this page's (the note goes over it)
    events.onStall?.();
  };
  const armStall = (ms = options.readyTimeoutMs ?? PREVIEW_READY_TIMEOUT_MS): void => {
    if (stall !== null) win?.clearTimeout(stall);
    stall = win ? win.setTimeout(stalled, ms) : null;
  };
  /**
   * A new document in the frame (a reload of the same srcdoc, or the document's own navigation): one
   * more authenticated ready may come. (2.5.0, STATUS D-80) A frame document that has loaded without
   * its bridge saying ready never will (a Content-Security-Policy blocked its inline scripts): the
   * stall is reported a moment after the load, not after the whole ready timeout — the bridge runs
   * while the document is parsed, before its load event.
   */
  const onLoad: EdListener = () => {
    taken = false;
    if (!ready && !destroyed) armStall(Math.min(PREVIEW_LOAD_GRACE_MS, options.readyTimeoutMs ?? PREVIEW_READY_TIMEOUT_MS));
    stagedStep('loaded');
  };
  iframe.addEventListener('load', onLoad);
  // A moved or reloaded frame boots again and says ready again: the last HTML is re-sent then.
  parent.append(iframe);
  armStall();
  /** Rebuild the frame document (a new secret: the old document's bridge cannot speak for the new one). */
  const reload = (nextOptions: PreviewFrameOptions): void => {
    if (destroyed) return;
    frameOptions = nextOptions;
    const showing = ready && pending !== null;
    ready = false;
    closePort(true);
    settle(false);
    secret = frameSecret(win);
    handed = false;
    taken = false;
    // a frame that shows the document is kept, as a picture, until the new one has drawn it (D-100);
    // a frame still loading, or already hidden behind the picture, is simply replaced
    const keep = shown === null && showing ? iframe : null;
    const next = keep || shown !== null ? makeFrame() : iframe;
    if (next !== iframe) {
      iframe.removeEventListener('load', onLoad);
      if (keep) {
        // the picture lies over the new frame, which takes its place in the layout: the new frame is
        // on screen at its real size (Chrome throttles a hidden or off-screen frame), only covered
        shown = keep;
        keep.setAttribute('aria-hidden', 'true');
        keep.setAttribute('tabindex', '-1');
        keep.inert = true;
        for (const [k, v] of [['position', 'absolute'], ['top', '0'], ['left', '0'], ['width', '100%'], ['height', '100%'], ['z-index', '1']]) keep.style.setProperty(k, v);
      } else iframe.remove();
      iframe = next;
      iframe.setAttribute('aria-hidden', 'true');
      iframe.inert = true;
      iframe.addEventListener('load', onLoad);
      iframe.srcdoc = frameDocument();
      parent.append(iframe);
      if (staging && staging.timer !== null) win?.clearTimeout(staging.timer);
      staging = { loaded: false, drawn: false, timer: win ? win.setTimeout(reveal, PREVIEW_REBUILD_MAX_MS) : null };
    } else iframe.srcdoc = frameDocument();
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
    shareAssets(add, drop = []) {
      if (destroyed) return;
      const fresh: Array<[string, unknown]> = [];
      for (const [u, b] of add) {
        if (typeof u !== 'string' || sharedAssets.has(u)) continue;
        sharedAssets.set(u, b);
        if (ready) { fresh.push([u, b]); sentAssets.add(u); }
      }
      const gone = drop.filter((u) => sharedAssets.delete(u) && sentAssets.delete(u));
      if (ready && (fresh.length > 0 || gone.length > 0)) send({ type: 'orz-preview-assets', add: fresh, drop: gone });
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
      reload({
        ...frameOptions,
        ...(o.head !== undefined ? { head: o.head } : {}),
        ...(o.scheme !== undefined ? { scheme: o.scheme } : {}),
        ...(typeof o.articleClass === 'string' ? { articleClass: o.articleClass } : {}),
      });
    },
    get acknowledges() { return acknowledges; },
    get authenticated() { return portBridge; },
    get anchors() { return anchors; },
    get max() { return max; },
    get ready() { return ready; },
    destroy() {
      destroyed = true;
      win?.removeEventListener('message', onMessage);
      iframe.removeEventListener('load', onLoad);
      if (stall !== null) { win?.clearTimeout(stall); stall = null; }
      if (staging && staging.timer !== null) win?.clearTimeout(staging.timer);
      staging = null;
      shown?.remove();
      shown = null;
      closePort();
      for (const p of retired) closeNow(p);
      retired.clear();
      settle(false);
      subscribers.clear();
      sharedAssets.clear();
      sentAssets.clear();
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
