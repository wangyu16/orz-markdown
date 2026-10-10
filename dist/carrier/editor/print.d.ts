import type { EdDocument } from './types.js';
/** The print frame's sandbox: an opaque origin whose scripts run and that may open the print dialog. */
export declare const PRINT_SANDBOX = "allow-scripts allow-modals";
/** How long the print frame waits for the document to be ready (`__orzPrintReady`, fonts) before it prints anyway. */
export declare const PRINT_READY_TIMEOUT_MS = 30000;
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
/** The script the print frame runs (ES5, script-safe): wait for ready, print, tell the page. */
export declare function printScript(tok: string, readyTimeoutMs: number): string;
/** The document with the print script added at the end of its `<body>` (or at the end). */
export declare function withPrintScript(html: string, tok: string, readyTimeoutMs: number, nonce?: string): string;
/**
 * Print `html` (a whole document) in a hidden sandboxed frame (see the module
 * comment). Resolves `true` once the frame has printed (the browser's print
 * dialog closed), `false` when it could not start (no page, or no word from
 * the frame within `readyTimeoutMs` + 5 s: a policy that blocks its script).
 */
export declare function printDocument(html: string, options?: PrintDocumentOptions): Promise<boolean>;
//# sourceMappingURL=print.d.ts.map