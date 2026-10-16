"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PREVIEW_READY_TIMEOUT_MS = exports.PREVIEW_BLOB_MAX_BYTES = exports.PREVIEW_BRIDGE_HASH = exports.PREVIEW_BRIDGE = exports.PREVIEW_SECRET_ATTRIBUTE = exports.PREVIEW_SANDBOX = void 0;
exports.previewSandbox = previewSandbox;
exports.previewFrameParts = previewFrameParts;
exports.previewFrameDocument = previewFrameDocument;
exports.previewScriptHashes = previewScriptHashes;
exports.mapSrcset = mapSrcset;
exports.rewriteAssetUrls = rewriteAssetUrls;
exports.inlineBlobUrls = inlineBlobUrls;
exports.createPreview = createPreview;
exports.lineToTop = lineToTop;
exports.topToLine = topToLine;
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
const html_js_1 = require("../../html.js");
const preview_frame_js_1 = require("../../preview-frame.js");
/** The preview iframe's sandbox everywhere but a standalone `file:` page (see {@link previewSandbox}). */
exports.PREVIEW_SANDBOX = 'allow-scripts';
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
function previewSandbox(context) {
    if (context.host === 'standalone' && context.protocol === 'file:' && context.topLevel !== false && context.connected !== true)
        return `${exports.PREVIEW_SANDBOX} allow-same-origin`;
    return exports.PREVIEW_SANDBOX;
}
/**
 * The attribute of the bridge's own `<script>` element that carries the
 * frame's secret (FC-19 §8.4, the authenticated channel). A bridge reads it
 * and removes it first thing, before any document content exists.
 */
exports.PREVIEW_SECRET_ATTRIBUTE = 'data-orz-preview-secret';
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
 */
exports.PREVIEW_BRIDGE = [
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
    'function handle(d){if(!d||typeof d!=="object")return;',
    'if(d.type==="orz-preview-render")render(d,0);',
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
    'pin("__orzPreview",FZ({report:FZ(report),post:FZ(post),navigated:FZ(navigated)}));',
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
exports.PREVIEW_BRIDGE_HASH = 'sha256-FagkTQO0IRoHGlouIRxLnJr2zUTTmrE641Fi/DdXJfY=';
/** The inline call that tells the bridge the pinned libraries have loaded. */
const LIBS_READY = 'window.__orzLibsReady()';
const BASE_STYLE = 'html{scroll-behavior:auto}body{margin:0;padding:1.5rem 1.75rem}';
/** Stamp a nonce on every `<script`, `<style` and `<link` start tag of shell-built markup. */
function stampNonce(markup, nonce) {
    if (!nonce)
        return markup;
    const attr = ` nonce="${(0, html_js_1.escapeAttr)(nonce)}"`;
    return markup.replace(/<(script|style|link)(?=[\s>])/gi, `<$1${attr}`);
}
/** The pieces of the frame document for these options. */
function previewFrameParts(options = {}) {
    const scheme = options.scheme === 'dark' ? 'dark' : 'light';
    const assets = options.assets !== false ? (0, preview_frame_js_1.getPreviewFrameAssets)() : null;
    const nonce = options.nonce || undefined;
    const secret = options.secret ? ` ${exports.PREVIEW_SECRET_ATTRIBUTE}="${(0, html_js_1.escapeAttr)(options.secret)}"` : '';
    return {
        head: stampNonce(`${assets ? assets.headLinks(scheme) : ''}${options.head ?? ''}<style>${BASE_STYLE}</style>`, nonce),
        bridge: stampNonce(`<script${secret}>${options.bridge ?? exports.PREVIEW_BRIDGE}</script>`, nonce),
        scripts: assets ? stampNonce(`${assets.bodyScripts()}<script>${LIBS_READY}</script>`, nonce) : '',
        scheme,
        articleClass: (0, html_js_1.escapeAttr)(options.articleClass ?? 'markdown-body'),
        ...(nonce ? { nonce } : {}),
    };
}
/** The preview frame's `srcdoc`. */
function previewFrameDocument(options = {}) {
    const parts = previewFrameParts(options);
    if (options.frameDocument)
        return String(options.frameDocument(parts));
    // The default bridge goes before the stylesheets (B#2): a script after a pending stylesheet waits
    // for it, so a slow theme or KaTeX stylesheet would hold back the ready and every render. A
    // carrier's own bridge keeps its place after the article (it may look for it when it runs).
    const early = options.bridge === undefined;
    return (`<!doctype html><html data-scheme="${parts.scheme}"><head><meta charset="utf-8">` +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        (early ? parts.bridge + parts.head : parts.head) +
        `</head><body><article class="${parts.articleClass}" id="orz-doc"></article>` +
        (early ? '' : parts.bridge) +
        // the libraries enhance the preview when they arrive (or never, offline)
        parts.scripts +
        '</body></html>');
}
/**
 * `'sha256-…'` of every inline `<script>` in the frame document for these
 * options (the bridge, and with `assets` the libraries' setup, the runtime and
 * `__orzEnhance`), for a hash-based CSP. Needs Web Crypto (`crypto.subtle`).
 */
async function previewScriptHashes(options = {}) {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle)
        throw new Error('orz editor: previewScriptHashes needs crypto.subtle');
    const out = [];
    for (const m of previewFrameDocument(options).matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
        const bytes = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(m[1])));
        let bin = '';
        for (const b of bytes)
            bin += String.fromCharCode(b);
        const hash = `sha256-${btoa(bin)}`;
        if (!out.includes(hash))
            out.push(hash);
    }
    return out;
}
/** A start tag with its attributes (quoted values may hold `>`). */
const START_TAG = /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)(\s*\/?>)/g;
const ATTRIBUTE = /(\s+)([^\s"'>/=]+)(?:(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const ENTITY = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos|#39));/g;
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodeAttr(v) {
    return v.replace(ENTITY, (m, dec, hex, name) => {
        if (name)
            return name === '#39' ? "'" : NAMED[name];
        const cp = dec !== undefined ? Number(dec) : parseInt(hex, 16);
        return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    });
}
/** A relative reference: no scheme, not `//host`, not `/path`, not `#fragment`, not empty. */
const isRelative = (u) => u !== '' && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u) && !/^[/\\#?]/.test(u);
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
/**
 * Map every URL of a `srcset` value, keeping everything else as written. Parsed
 * as the HTML standard does (F5): separators are whitespace and commas; a URL
 * runs to the next whitespace (a comma inside it, as in a `data:` URL, is part
 * of it) except trailing commas, which end the candidate; descriptors run to
 * the next comma outside parentheses.
 */
function mapSrcset(value, map) {
    let out = '';
    let i = 0;
    const n = value.length;
    while (i < n) {
        let j = i;
        while (j < n && (isSpace(value[j]) || value[j] === ','))
            j++;
        out += value.slice(i, j);
        i = j;
        if (i >= n)
            break;
        while (j < n && !isSpace(value[j]))
            j++;
        let url = value.slice(i, j);
        let trail = '';
        const m = /,+$/.exec(url);
        if (m) {
            trail = m[0];
            url = url.slice(0, -trail.length);
        }
        out += (url ? map(url) : '') + trail;
        i = j;
        if (trail)
            continue;
        let paren = false;
        while (j < n) {
            const c = value[j];
            if (c === '(')
                paren = true;
            else if (c === ')')
                paren = false;
            else if (c === ',' && !paren)
                break;
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
function rewriteAssetUrls(html, resolve) {
    const res = (u) => {
        const t = u.trim();
        if (!isRelative(t))
            return u;
        try {
            const r = resolve(t);
            return typeof r === 'string' ? r : u;
        }
        catch {
            return u;
        }
    };
    return html.replace(START_TAG, (tag, name, attrs, tail) => {
        const element = name.toLowerCase();
        let changed = false;
        const out = attrs.replace(ATTRIBUTE, (m, space, attr, eq, dq, sq, uq) => {
            if (eq === undefined)
                return m;
            const a = attr.toLowerCase();
            const set = a === 'srcset';
            if (!set && a !== 'src' && a !== 'poster' && !((a === 'href' || a === 'xlink:href') && element !== 'a' && element !== 'area'))
                return m;
            const raw = decodeAttr(dq ?? sq ?? uq ?? '');
            const value = set ? mapSrcset(raw, res) : res(raw);
            if (value === raw)
                return m;
            changed = true;
            return `${space}${attr}="${(0, html_js_1.escapeAttr)(value)}"`;
        });
        return changed ? `<${name}${out}${tail}` : tag;
    });
}
/** A `blob:` URL inside a start tag (an attribute value, a `style` url()): up to a quote, space, paren, comma, `&` or `<>`. */
const BLOB_URL = /blob:[^\s"'<>()\\,&]+/g;
/** The largest asset `inlineBlobUrls` copies into the preview (bytes): above it the reference stays, with an error. */
exports.PREVIEW_BLOB_MAX_BYTES = 32 * 1024 * 1024;
/** A blob's bytes as a `data:` URL (base64; the blob's own type when it is a plain MIME type). */
async function blobDataUrl(url) {
    const g = globalThis;
    if (typeof g.fetch !== 'function' || typeof g.btoa !== 'function')
        throw new Error('no fetch in this page');
    const res = await g.fetch(url);
    if (!res.ok)
        throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (blob.size > exports.PREVIEW_BLOB_MAX_BYTES)
        throw new Error(`${blob.size} bytes, above the preview's ${exports.PREVIEW_BLOB_MAX_BYTES}`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
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
async function inlineBlobUrls(html, cache, onError) {
    if (!html.includes('blob:'))
        return html;
    const urls = new Set();
    for (const tag of html.match(START_TAG) ?? [])
        for (const u of tag.match(BLOB_URL) ?? [])
            urls.add(u);
    if (urls.size === 0)
        return html;
    const found = new Map();
    await Promise.all([...urls].map(async (u) => {
        let p = cache.get(u);
        if (!p) {
            p = blobDataUrl(u).catch((e) => {
                onError?.(u, `${u} (from resolveAsset) could not be read for the preview: ${e instanceof Error ? e.message : String(e)}. Return a data: or http(s) URL from resolveAsset, or allow connect-src blob: in the page's policy`);
                return null;
            });
            cache.set(u, p);
        }
        const d = await p;
        if (d !== null)
            found.set(u, d);
    }));
    if (found.size === 0)
        return html;
    return html.replace(START_TAG, (tag) => (tag.includes('blob:') ? tag.replace(BLOB_URL, (u) => found.get(u) ?? u) : tag));
}
/** How long the frame may take to say ready before `onStall`. */
exports.PREVIEW_READY_TIMEOUT_MS = 8000;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
/** A fresh frame secret (Web Crypto when there is one). */
function frameSecret(win) {
    try {
        const a = new Uint32Array(4);
        const c = win?.crypto ?? globalThis.crypto;
        c?.getRandomValues?.(a);
        if (a.some((x) => x !== 0))
            return Array.from(a, (x) => x.toString(36)).join('-');
    }
    catch { /* no crypto */ }
    return `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}
/** Create the sandboxed preview iframe in `parent` and talk to it. */
function createPreview(doc, parent, options, events) {
    const win = doc.defaultView;
    let frameOptions = { ...options };
    /** This frame document's secret: a ready that carries it gets the port (a new one for every frame document). */
    let secret = frameSecret(win);
    const frameDocument = () => previewFrameDocument({ ...frameOptions, secret });
    const iframe = doc.createElement('iframe');
    iframe.setAttribute('sandbox', previewSandbox(options.context ?? { host: 'app', protocol: '' }));
    iframe.setAttribute('title', options.title ?? 'Document preview');
    iframe.className = 'orz-editor__frame';
    iframe.srcdoc = frameDocument();
    const diff = options.diff !== false;
    let ready = false;
    let seq = 0;
    let pending = null;
    let anchors = [];
    let max = 0;
    let destroyed = false;
    /** The private port the authenticated bridge got: the shell's messages go through it. */
    let port = null;
    /** The render waiting for the frame's acknowledgement. */
    let waiting = null;
    let acknowledges = false;
    /** A bridge proved the secret once: `authenticated`. */
    let portBridge = false;
    /** A port was handed for the current frame document (its secret): plain readies are a replaced document's from then on. */
    let handed = false;
    /** An authenticated ready was taken since the frame last loaded: another one before the next load is ignored. */
    let taken = false;
    const subscribers = new Map();
    const settle = (acked) => { const w = waiting; waiting = null; w?.resolve(acked); };
    const send = (msg) => {
        try {
            if (port)
                port.postMessage(msg);
            else
                iframe.contentWindow?.postMessage(msg, '*');
        }
        catch { /* detached */ }
    };
    const closeNow = (p) => { p.onmessage = null; try {
        p.close?.();
    }
    catch { /* closed */ } };
    /** Ports replaced by a reload stay open a moment: a report the old document sent just before it went still arrives. */
    const retired = new Set();
    const closePort = (later = false) => {
        const p = port;
        port = null;
        if (!p)
            return;
        if (!later || !win) {
            closeNow(p);
            return;
        }
        retired.add(p);
        win.setTimeout(() => { if (retired.delete(p))
            closeNow(p); }, 1000);
    };
    const renderMessage = (html) => ({ type: 'orz-preview-render', id: ++seq, html, ...(diff ? {} : { diff: false }) });
    const notify = (d) => {
        const set = typeof d.type === 'string' ? subscribers.get(d.type) : undefined;
        if (set)
            for (const fn of [...set]) {
                try {
                    fn(d);
                }
                catch { /* the subscriber's own error */ }
            }
    };
    const rendered = (d) => {
        if (Array.isArray(d.anchors))
            anchors = d.anchors.filter((a) => Array.isArray(a) && num(a[0]) && num(a[1])).map((a) => [a[0], a[1]]);
        if (num(d.max))
            max = d.max;
        // a bridge that reports ids paces the renders (B#3); one without ids acknowledges any render
        if (waiting && (d.id === waiting.id || !num(d.id))) {
            acknowledges = true;
            settle(true);
        }
        events.onRendered?.(anchors, max);
    };
    /** The authenticated bridge's reports (through its port): the reader's own input in the frame. */
    const onPort = (e) => {
        const d = e?.data;
        if (destroyed || !d || typeof d !== 'object')
            return;
        switch (d.type) {
            case 'orz-preview-rendered':
                rendered(d);
                break;
            case 'orz-preview-scrolled':
                if (num(d.max))
                    max = d.max;
                if (num(d.line))
                    events.onScrolled?.(num(d.top) ? d.top : 0, max, d.line);
                else if (num(d.top))
                    events.onScrolled?.(d.top, max);
                break;
            case 'orz-preview-key':
                if (d.key === 's' || d.key === '\\' || d.key === 'Escape' || d.key === 'p')
                    events.onKey?.(d.key);
                break;
            case 'orz-preview-link':
                if (typeof d.href === 'string')
                    events.onLink?.(d.href);
                break;
            case 'orz-preview-active':
                events.onActive?.(typeof d.input === 'string' ? d.input : undefined);
                break;
        }
        notify(d);
    };
    const takeReady = () => {
        ready = true;
        acknowledges = false;
        if (stall !== null) {
            win?.clearTimeout(stall);
            stall = null;
        }
        settle(false);
        if (pending !== null)
            send(renderMessage(pending));
        events.onReady?.();
        notify({ type: 'orz-preview-ready' });
    };
    const onMessage = (e) => {
        if (destroyed || !iframe.contentWindow || e.source !== iframe.contentWindow)
            return;
        const d = e.data;
        if (!d || typeof d !== 'object' || typeof d.type !== 'string')
            return;
        if (d.type === 'orz-preview-ready') {
            if (typeof d.channel === 'string') {
                // the bridge proves it ran first in this frame document: only then does it get a port. A ready
                // without this frame's secret, or a second one before the frame loads again, is ignored — it
                // changes nothing, and the port the bridge holds stays open.
                if (!d.channel || d.secret !== secret || taken)
                    return;
                if (!win?.MessageChannel) {
                    taken = true;
                    takeReady();
                    return;
                } // no channels here: renders only
                let next;
                try {
                    const ch = new win.MessageChannel();
                    ch.port1.onmessage = onPort;
                    iframe.contentWindow.postMessage({ type: 'orz-preview-port', channel: d.channel }, '*', [ch.port2]);
                    next = ch.port1;
                }
                catch {
                    return;
                }
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
            if (handed)
                return;
            takeReady();
            return;
        }
        // Window messages are data: they never act on keys, links, focus or scroll. Only a bridge without the
        // port may acknowledge renders this way (its pacing and anchors).
        if (d.type.startsWith('orz-preview-')) {
            if (d.type === 'orz-preview-rendered' && !handed) {
                rendered(d);
                notify(d);
            }
            return;
        }
        notify(d);
    };
    win?.addEventListener('message', onMessage);
    /** A new document in the frame (a reload of the same srcdoc, or the document's own navigation): one more authenticated ready may come. */
    const onLoad = () => { taken = false; };
    iframe.addEventListener('load', onLoad);
    // A moved or reloaded frame boots again and says ready again: the last HTML is re-sent then.
    parent.append(iframe);
    let stall = null;
    const armStall = () => {
        if (stall !== null)
            win?.clearTimeout(stall);
        stall = win ? win.setTimeout(() => { stall = null; if (!ready && !destroyed)
            events.onStall?.(); }, options.readyTimeoutMs ?? exports.PREVIEW_READY_TIMEOUT_MS) : null;
    };
    armStall();
    /** Rebuild the frame document (a new secret: the old document's bridge cannot speak for the new one). */
    const reload = (next) => {
        if (destroyed)
            return;
        frameOptions = next;
        ready = false;
        closePort(true);
        settle(false);
        secret = frameSecret(win);
        handed = false;
        taken = false;
        iframe.srcdoc = frameDocument();
        armStall();
    };
    return {
        get iframe() { return iframe; },
        render(html) {
            pending = html;
            settle(false);
            if (!ready || destroyed)
                return Promise.resolve(false);
            const msg = renderMessage(html);
            const p = new Promise((resolve) => { waiting = { id: msg.id, resolve }; });
            send(msg);
            return p;
        },
        scrollTo(top) {
            if (ready && num(top))
                send({ type: 'orz-preview-scroll', top });
        },
        navigate(line) {
            if (ready && num(line))
                send({ type: 'orz-preview-navigate', line });
        },
        post(message) {
            if (!ready || destroyed || !message || typeof message !== 'object')
                return false;
            send({ ...message });
            return true;
        },
        on(type, fn) {
            let set = subscribers.get(type);
            if (!set)
                subscribers.set(type, (set = new Set()));
            set.add(fn);
            return () => { set.delete(fn); };
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
            if (stall !== null) {
                win?.clearTimeout(stall);
                stall = null;
            }
            closePort();
            for (const p of retired)
                closeNow(p);
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
function lineToTop(anchors, line) {
    if (!anchors.length)
        return 0;
    const first = anchors[0];
    if (line <= first[0])
        return first[0] > 0 ? first[1] * (Math.max(0, line) / first[0]) : first[1];
    let prev = first;
    for (const a of anchors) {
        if (a[0] <= line) {
            prev = a;
            continue;
        }
        if (a[0] === prev[0])
            return prev[1];
        return prev[1] + ((line - prev[0]) / (a[0] - prev[0])) * (a[1] - prev[1]);
    }
    return prev[1];
}
/** The (fractional) source line at a preview top: the inverse of {@link lineToTop}. */
function topToLine(anchors, top) {
    if (!anchors.length)
        return 0;
    const first = anchors[0];
    if (top <= first[1])
        return first[1] > 0 ? first[0] * (Math.max(0, top) / first[1]) : first[0];
    let prev = first;
    for (const a of anchors) {
        if (a[1] <= top) {
            prev = a;
            continue;
        }
        if (a[1] === prev[1])
            return prev[0];
        return prev[0] + ((top - prev[1]) / (a[1] - prev[1])) * (a[0] - prev[0]);
    }
    return prev[0];
}
//# sourceMappingURL=preview.js.map