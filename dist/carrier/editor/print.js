"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRINT_READY_TIMEOUT_MS = exports.PRINT_SANDBOX = void 0;
exports.printScript = printScript;
exports.withPrintScript = withPrintScript;
exports.printDocument = printDocument;
/**
 * Print a whole HTML document from an app's page without printing the page
 * (2.3.0, round 3 of the orz-paged loop; FC-19 §8.5).
 *
 * The editor's `print` event (FC-19 §4) tells an app that the reader pressed
 * Cmd/Ctrl+P in the editor or its preview; without a listener the editor
 * prints the host page. An app that wants the document's own pages instead
 * passes the document to {@link printDocument}: an assembled file
 * (`assemble(text)`), or a carrier's print document (`renderPreview(text,
 * { document: true })`, which a carrier may lay out further).
 *
 * The document goes into a hidden `srcdoc` iframe whose sandbox is
 * {@link PRINT_SANDBOX} — `allow-scripts allow-modals`: an opaque origin, so the
 * document's scripts run (a paginator lays the pages out) but cannot reach the
 * app's page, its storage or cookies, open windows or navigate the top; never
 * `allow-same-origin`. (A blob URL of the document opened in a tab would run
 * it in the app's own origin: do not print untrusted content that way.) A
 * small script added at the end of the document's `<body>` waits for the load,
 * the fonts and, when the document defines it, `window.__orzPrintReady` (a
 * promise, or a function returning one — a carrier's paginator resolves it
 * when the pages are laid out; at most `readyTimeoutMs`), then calls the
 * frame's own `print()` — the browser prints that document alone — and tells
 * the page; the frame is then removed.
 *
 * The frame inherits the page's Content-Security-Policy: under a nonce
 * policy pass `nonce` (stamped on the added script); the document's own
 * scripts must carry it too, or the document must need none (a static print
 * document).
 */
const html_js_1 = require("../../html.js");
/** The print frame's sandbox: an opaque origin whose scripts run and that may open the print dialog. */
exports.PRINT_SANDBOX = 'allow-scripts allow-modals';
/** How long the print frame waits for the document to be ready (`__orzPrintReady`, fonts) before it prints anyway. */
exports.PRINT_READY_TIMEOUT_MS = 30000;
/** A fresh token: the frame's messages must carry it. */
function token(win) {
    try {
        const a = new Uint32Array(4);
        win.crypto?.getRandomValues?.(a);
        if (a.some((x) => x !== 0))
            return Array.from(a, (x) => x.toString(36)).join('-');
    }
    catch { /* no crypto */ }
    return `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}
/** The script the print frame runs (ES5, script-safe): wait for ready, print, tell the page. */
function printScript(tok, readyTimeoutMs) {
    return [
        '(function(){"use strict";',
        `var T=${JSON.stringify(tok)},W=window,P=W.parent,D=document,done=0;`,
        'function say(t){try{P.postMessage({type:t,token:T},"*")}catch(e){}}',
        'function fire(){if(done)return;done=1;say("orz-print-start");try{W.print()}catch(e){}say("orz-print-done")}',
        'function go(){var r=W.__orzPrintReady,p=null;try{p=typeof r==="function"?r():r}catch(e){p=null}',
        'var f=D.fonts&&D.fonts.ready;try{Promise.all([p,f]).then(fire,fire)}catch(e){fire()}',
        `setTimeout(fire,${Math.max(0, Math.round(readyTimeoutMs))})}`,
        'if(D.readyState==="complete")setTimeout(go,0);else W.addEventListener("load",function(){setTimeout(go,0)})',
        '})();',
    ].join('');
}
/** The document with the print script added at the end of its `<body>` (or at the end). */
function withPrintScript(html, tok, readyTimeoutMs, nonce) {
    const tag = `<script${nonce ? ` nonce="${(0, html_js_1.escapeAttr)(nonce)}"` : ''}>${printScript(tok, readyTimeoutMs)}</script>`;
    const lower = html.toLowerCase();
    const at = lower.lastIndexOf('</body');
    return at < 0 ? html + tag : html.slice(0, at) + tag + html.slice(at);
}
/**
 * Print `html` (a whole document) in a hidden sandboxed frame (see the module
 * comment). Resolves `true` once the frame has printed (the browser's print
 * dialog closed), `false` when it could not start (no page, or no word from
 * the frame within `readyTimeoutMs` + 5 s: a policy that blocks its script).
 */
function printDocument(html, options = {}) {
    const doc = options.document ?? globalThis.document;
    const win = doc?.defaultView ?? null;
    const body = doc?.body ?? null;
    if (!doc || !win || !body)
        return Promise.resolve(false);
    const raw = options.readyTimeoutMs;
    const wait = typeof raw === 'number' && Number.isFinite(raw) ? Math.min(Math.max(0, raw), 120000) : exports.PRINT_READY_TIMEOUT_MS;
    const tok = token(win);
    const iframe = doc.createElement('iframe');
    iframe.setAttribute('sandbox', exports.PRINT_SANDBOX);
    iframe.setAttribute('title', options.title ?? 'Print');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    iframe.setAttribute('data-orz-print', '');
    // laid out (a paginator needs a viewport), out of sight
    iframe.setAttribute('style', 'position:fixed;left:-10000px;top:0;width:1024px;height:768px;border:0;');
    iframe.srcdoc = withPrintScript(String(html), tok, wait, options.nonce || undefined);
    return new Promise((resolve) => {
        let started = false;
        let finished = false;
        let stall = null;
        const finish = (ok) => {
            if (finished)
                return;
            finished = true;
            win.removeEventListener('message', onMessage);
            if (stall !== null)
                win.clearTimeout(stall);
            // a moment for a browser whose print() returns before it has read the document
            win.setTimeout(() => iframe.remove(), 1000);
            resolve(ok);
        };
        const onMessage = (e) => {
            if (e.source !== iframe.contentWindow || !iframe.contentWindow)
                return;
            const d = e.data;
            if (!d || typeof d !== 'object' || d.token !== tok)
                return;
            if (d.type === 'orz-print-start')
                started = true;
            else if (d.type === 'orz-print-done')
                finish(true);
        };
        win.addEventListener('message', onMessage);
        stall = win.setTimeout(() => { stall = null; if (!started)
            finish(false); }, wait + 5000);
        body.append(iframe);
    });
}
//# sourceMappingURL=print.js.map