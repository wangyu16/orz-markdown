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
 * Limits (round 4 of the orz-paged loop, owner's trust rule: the printed
 * document is the reader's own document — the same trust as its read view).
 * `allow-modals` stays: without it Chrome ignores the frame's `print()`
 * ("the document is sandboxed, and the 'allow-modals' keyword is not set");
 * it also lets the document's scripts open `alert` / `confirm` / `prompt`
 * while the frame lives. The done signal is the document's word: the
 * frame's messages count only from that frame and with the call's token,
 * but the token sits in the frame's own DOM (the added script), so the
 * document's scripts can read it and say `orz-print-done` early (the frame
 * then goes before it printed) or never (the call resolves `false` after
 * the timeout when nothing started, or stays pending after a start) — it
 * can only spoil the printing of itself. The page cannot observe the
 * opaque frame's `afterprint`, so there is no signal the document could not
 * forge; no page state depends on it beyond the promise and the frame's
 * removal.
 *
 * The frame inherits the page's Content-Security-Policy: under a nonce
 * policy pass `nonce` (stamped on the added script); the document's own
 * scripts must carry it too, or the document must need none (a static print
 * document).
 */
import { escapeAttr } from '../../html.js';
import type { EdDocument, EdEvent, EdIframe, EdListener, EdView } from './types.js';

/** The print frame's sandbox: an opaque origin whose scripts run and that may open the print dialog. */
export const PRINT_SANDBOX = 'allow-scripts allow-modals';

/** How long the print frame waits for the document to be ready (`__orzPrintReady`, fonts) before it prints anyway. */
export const PRINT_READY_TIMEOUT_MS = 30_000;

export interface PrintDocumentOptions {
  /** The app's page (default: `globalThis.document`). The frame is appended to its `<body>`. */
  document?: EdDocument;
  /** A CSP nonce stamped on the script the helper adds (the frame inherits the page's policy). */
  nonce?: string;
  /** How long to wait for the document to be ready before printing anyway (ms; default {@link PRINT_READY_TIMEOUT_MS}, at most 120 s). */
  readyTimeoutMs?: number;
  /** The frame's accessible title. Default `Print`. */
  title?: string;
}

/** A fresh token: the frame's messages must carry it. */
function token(win: EdView): string {
  try {
    const a = new Uint32Array(4);
    win.crypto?.getRandomValues?.(a);
    if (a.some((x) => x !== 0)) return Array.from(a, (x) => x.toString(36)).join('-');
  } catch { /* no crypto */ }
  return `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/** The script the print frame runs (ES5, script-safe): wait for ready, print, tell the page. */
export function printScript(tok: string, readyTimeoutMs: number): string {
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
export function withPrintScript(html: string, tok: string, readyTimeoutMs: number, nonce?: string): string {
  const tag = `<script${nonce ? ` nonce="${escapeAttr(nonce)}"` : ''}>${printScript(tok, readyTimeoutMs)}</script>`;
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
export function printDocument(html: string, options: PrintDocumentOptions = {}): Promise<boolean> {
  const doc = options.document ?? (globalThis as { document?: EdDocument }).document;
  const win = doc?.defaultView ?? null;
  const body = doc?.body ?? null;
  if (!doc || !win || !body) return Promise.resolve(false);
  const raw = options.readyTimeoutMs;
  const wait = typeof raw === 'number' && Number.isFinite(raw) ? Math.min(Math.max(0, raw), 120_000) : PRINT_READY_TIMEOUT_MS;
  const tok = token(win);
  const iframe = doc.createElement('iframe') as EdIframe;
  iframe.setAttribute('sandbox', PRINT_SANDBOX);
  iframe.setAttribute('title', options.title ?? 'Print');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  iframe.setAttribute('data-orz-print', '');
  // laid out (a paginator needs a viewport), out of sight
  iframe.setAttribute('style', 'position:fixed;left:-10000px;top:0;width:1024px;height:768px;border:0;');
  iframe.srcdoc = withPrintScript(String(html), tok, wait, options.nonce || undefined);
  return new Promise<boolean>((resolve) => {
    let started = false;
    let finished = false;
    let stall: unknown = null;
    const finish = (ok: boolean): void => {
      if (finished) return;
      finished = true;
      win.removeEventListener('message', onMessage);
      if (stall !== null) win.clearTimeout(stall);
      // a moment for a browser whose print() returns before it has read the document
      win.setTimeout(() => iframe.remove(), 1000);
      resolve(ok);
    };
    const onMessage: EdListener = (e: EdEvent) => {
      if (e.source !== iframe.contentWindow || !iframe.contentWindow) return;
      const d = e.data as { type?: unknown; token?: unknown } | null;
      if (!d || typeof d !== 'object' || d.token !== tok) return;
      if (d.type === 'orz-print-start') started = true;
      else if (d.type === 'orz-print-done') finish(true);
    };
    win.addEventListener('message', onMessage);
    stall = win.setTimeout(() => { stall = null; if (!started) finish(false); }, wait + 5000);
    body.append(iframe);
  });
}
