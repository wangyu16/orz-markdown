import { type ColorScheme } from '../../preview-frame.js';
import type { EdDocument, EdElement, EdIframe } from './types.js';
/** The preview iframe's sandbox: exactly this, never `allow-same-origin`. */
export declare const PREVIEW_SANDBOX = "allow-scripts";
export interface PreviewFrameOptions {
    /** Extra `<head>` markup (the carrier's theme stylesheet links): shell markup, never document content. */
    head?: string;
    /** Colour scheme of the preview libraries (highlight.js theme, SMILES). Default `light`. */
    scheme?: ColorScheme;
    /** Class of the article the HTML goes into. Default `markdown-body`. */
    articleClass?: string;
    /** Load the pinned preview libraries (KaTeX CSS, highlight.js, mermaid, SMILES, Chart.js, runtime). Default `true`. */
    assets?: boolean;
}
/**
 * The bridge inside the frame (ES5, no `</script`). Swaps the article's
 * changed top-level nodes, enhances, reports anchors; forwards scroll, the
 * shell's shortcuts (Cmd/Ctrl+S, Cmd/Ctrl+\, Esc) and link clicks.
 */
export declare const PREVIEW_BRIDGE: string;
/** The preview frame's `srcdoc`. */
export declare function previewFrameDocument(options?: PreviewFrameOptions): string;
export interface PreviewEvents {
    /** The frame reported anchors after a render (`[line, top]`, sorted by top) and its scrollable height. */
    onRendered?(anchors: Array<[number, number]>, max: number): void;
    onScrolled?(top: number, max: number): void;
    /** `s`, `\`, `Escape` pressed inside the frame. */
    onKey?(key: string): void;
    onLink?(href: string): void;
    /** The reader pointed into the frame. */
    onActive?(): void;
}
export interface PreviewController {
    readonly iframe: EdIframe;
    /** Show this HTML (sent when the frame is ready; the last one is re-sent if the frame reloads). */
    render(html: string): void;
    scrollTo(top: number): void;
    readonly anchors: ReadonlyArray<[number, number]>;
    readonly max: number;
    destroy(): void;
}
/** Create the sandboxed preview iframe in `parent` and talk to it. */
export declare function createPreview(doc: EdDocument, parent: EdElement, options: PreviewFrameOptions & {
    title?: string;
}, events: PreviewEvents): PreviewController;
/**
 * The preview top for a (fractional) source line: linear between the
 * anchors around it, from the top of the page (line 0 at 0) to the first
 * anchor, and the last anchor's top beyond it.
 */
export declare function lineToTop(anchors: ReadonlyArray<[number, number]>, line: number): number;
/** The (fractional) source line at a preview top: the inverse of {@link lineToTop}. */
export declare function topToLine(anchors: ReadonlyArray<[number, number]>, top: number): number;
//# sourceMappingURL=preview.d.ts.map