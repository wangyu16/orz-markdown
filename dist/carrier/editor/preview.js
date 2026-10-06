"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PREVIEW_BRIDGE = exports.PREVIEW_SANDBOX = void 0;
exports.previewFrameDocument = previewFrameDocument;
exports.createPreview = createPreview;
exports.lineToTop = lineToTop;
exports.topToLine = topToLine;
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
const html_js_1 = require("../../html.js");
const preview_frame_js_1 = require("../../preview-frame.js");
/** The preview iframe's sandbox: exactly this, never `allow-same-origin`. */
exports.PREVIEW_SANDBOX = 'allow-scripts';
/**
 * The bridge inside the frame (ES5, no `</script`). Swaps the article's
 * changed top-level nodes, enhances, reports anchors; forwards scroll, the
 * shell's shortcuts (Cmd/Ctrl+S, Cmd/Ctrl+\, Esc) and link clicks.
 */
exports.PREVIEW_BRIDGE = [
    '(function(){',
    'var P=window.parent,art=document.getElementById("orz-doc"),last=0,mute=0,queued=0,timer=0;',
    'var sch=document.documentElement.getAttribute("data-scheme");if(sch==="dark")window.__orzSmilesTheme="dark";',
    'function post(m){try{P.postMessage(m,"*")}catch(e){}}',
    'function keyOf(n){return n.nodeType===1?n.outerHTML:n.nodeType===3?"#"+n.data:n.nodeType===8?"!"+n.data:""}',
    'function apply(html){var t=document.createElement("template");t.innerHTML=html;var next=Array.prototype.slice.call(t.content.childNodes),nk=next.map(keyOf),old=Array.prototype.slice.call(art.childNodes),a=old.length,b=next.length,p=0,s=0;',
    'while(p<a&&p<b&&old[p].__orzKey===nk[p])p++;',
    'while(s<a-p&&s<b-p&&old[a-1-s].__orzKey===nk[b-1-s])s++;',
    'var ref=s>0?old[a-s]:null,i;for(i=p;i<a-s;i++)art.removeChild(old[i]);',
    'for(i=p;i<b-s;i++){next[i].__orzKey=nk[i];art.insertBefore(next[i],ref)}}',
    'function se(){return document.scrollingElement||document.documentElement}',
    'function max(){return Math.max(0,se().scrollHeight-window.innerHeight)}',
    'function anchors(){var els=art.querySelectorAll("[data-src-line]"),out=[],y=se().scrollTop||0,i,l,r;',
    'for(i=0;i<els.length;i++){l=parseInt(els[i].getAttribute("data-src-line"),10);if(isNaN(l))continue;r=els[i].getBoundingClientRect();if(!r.height&&!r.width)continue;out.push([l,r.top+y])}',
    'out.sort(function(x,z){return x[1]-z[1]});return out}',
    'function report(){post({type:"orz-preview-rendered",id:last,anchors:anchors(),max:max()})}',
    'function enhance(){try{if(typeof window.__orzEnhance==="function")window.__orzEnhance()}catch(e){}}',
    'function later(){clearTimeout(timer);timer=setTimeout(function(){enhance();report()},350)}',
    'window.addEventListener("message",function(e){if(e.source!==P)return;var d=e.data;if(!d||typeof d!=="object")return;',
    'if(d.type==="orz-preview-render"){last=d.id;try{apply(String(d.html))}catch(x){art.innerHTML=String(d.html)}enhance();report();later()}',
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
/** The preview frame's `srcdoc`. */
function previewFrameDocument(options = {}) {
    const scheme = options.scheme === 'dark' ? 'dark' : 'light';
    const assets = options.assets !== false ? (0, preview_frame_js_1.getPreviewFrameAssets)() : null;
    return (`<!doctype html><html data-scheme="${scheme}"><head><meta charset="utf-8">` +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        (assets ? assets.headLinks(scheme) : '') +
        (options.head ?? '') +
        '<style>html{scroll-behavior:auto}body{margin:0;padding:1.5rem 1.75rem}</style>' +
        `</head><body><article class="${(0, html_js_1.escapeAttr)(options.articleClass ?? 'markdown-body')}" id="orz-doc"></article>` +
        // the bridge first: the preview shows at once; the libraries enhance it when they arrive (or never, offline)
        `<script>${exports.PREVIEW_BRIDGE}</script>` +
        (assets ? `${assets.bodyScripts()}<script>window.__orzLibsReady()</script>` : '') +
        '</body></html>');
}
const num = (v) => typeof v === 'number' && Number.isFinite(v);
/** Create the sandboxed preview iframe in `parent` and talk to it. */
function createPreview(doc, parent, options, events) {
    const win = doc.defaultView;
    const iframe = doc.createElement('iframe');
    iframe.setAttribute('sandbox', exports.PREVIEW_SANDBOX);
    iframe.setAttribute('title', options.title ?? 'Document preview');
    iframe.className = 'orz-editor__frame';
    iframe.srcdoc = previewFrameDocument(options);
    let ready = false;
    let seq = 0;
    let pending = null;
    let anchors = [];
    let max = 0;
    const send = (msg) => { try {
        iframe.contentWindow?.postMessage(msg, '*');
    }
    catch { /* detached */ } };
    const onMessage = (e) => {
        if (!iframe.contentWindow || e.source !== iframe.contentWindow)
            return;
        const d = e.data;
        if (!d || typeof d !== 'object')
            return;
        switch (d.type) {
            case 'orz-preview-ready':
                ready = true;
                if (pending !== null)
                    send({ type: 'orz-preview-render', id: ++seq, html: pending });
                break;
            case 'orz-preview-rendered':
                if (Array.isArray(d.anchors))
                    anchors = d.anchors.filter((a) => Array.isArray(a) && num(a[0]) && num(a[1])).map((a) => [a[0], a[1]]);
                if (num(d.max))
                    max = d.max;
                events.onRendered?.(anchors, max);
                break;
            case 'orz-preview-scrolled':
                if (num(d.top)) {
                    if (num(d.max))
                        max = d.max;
                    events.onScrolled?.(d.top, max);
                }
                break;
            case 'orz-preview-key':
                if (d.key === 's' || d.key === '\\' || d.key === 'Escape')
                    events.onKey?.(d.key);
                break;
            case 'orz-preview-link':
                if (typeof d.href === 'string')
                    events.onLink?.(d.href);
                break;
            case 'orz-preview-active':
                events.onActive?.();
                break;
        }
    };
    win?.addEventListener('message', onMessage);
    // A moved or reloaded frame boots again and says ready again: the last HTML is re-sent then.
    parent.append(iframe);
    return {
        iframe,
        render(html) {
            pending = html;
            if (ready)
                send({ type: 'orz-preview-render', id: ++seq, html });
        },
        scrollTo(top) {
            if (ready && num(top))
                send({ type: 'orz-preview-scroll', top });
        },
        get anchors() { return anchors; },
        get max() { return max; },
        destroy() {
            win?.removeEventListener('message', onMessage);
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