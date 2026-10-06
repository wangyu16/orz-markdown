/**
 * The text-editor adapter: the one seam between the editor shell and the
 * editing engine, so the engine (CodeMirror 6 by default) stays swappable.
 *
 * An adapter edits LF text without a BOM (the shell's text model keeps the
 * document's own line endings and BOM: text-model.ts). It reports every change
 * of its text — typed, pasted, undone or set by `setDoc` — through `onChange`.
 *
 * `textareaAdapter()` is the minimal engine: a plain `<textarea>` with its own
 * undo history (so a programmatic edit is one undoable step, like in
 * CodeMirror). It needs no network and is what the CodeMirror adapter shows
 * while CodeMirror loads, and keeps when it cannot load.
 */
import type { EdElement, ShadowRootLike } from './types.js';
export interface Selection {
    from: number;
    to: number;
}
export interface ScrollPosition {
    /** The (fractional, 0-based) line at the top of the viewport. */
    line: number;
    /** Scroll position as a fraction of the scrollable height, 0–1. */
    fraction: number;
}
export interface AdapterMountOptions {
    /** The text (LF line breaks, no BOM). */
    doc: string;
    readOnly?: boolean;
    /** Called after every change of the text (user edits, undo/redo, `setDoc`). */
    onChange(): void;
    /** Called when the selection moves (offsets in the adapter's text). */
    onSelection?(selection: Selection): void;
    /** Called when the editor scrolls. */
    onScroll?(): void;
    /** The shadow root the editor lives in (CodeMirror mounts its styles there). */
    root?: ShadowRootLike;
    /** An accessible name for the editing surface. */
    label?: string;
}
export interface TextEditorAdapter {
    /** The engine in use (`textarea`, `codemirror6`). */
    readonly name: string;
    mount(el: EdElement, options: AdapterMountOptions): void | Promise<void>;
    getDoc(): string;
    /** Replace the text. Without `resetHistory` the change is ONE undoable step; with it the history starts over. */
    setDoc(text: string, options?: {
        resetHistory?: boolean;
    }): void;
    focus(): void;
    destroy(): void;
    getSelection?(): Selection;
    /** Switch read-only at run time (the shell's `setReadOnly`). Without it the engine keeps its mount-time state. */
    setReadOnly?(readOnly: boolean): void;
    /** Select a range (offsets in the adapter's text); the shell uses it to put the caret after an inserted asset link. */
    setSelection?(selection: Selection): void;
    hasFocus?(): boolean;
    undo?(): boolean;
    redo?(): boolean;
    getScroll?(): ScrollPosition;
    scrollTo?(target: {
        line?: number;
        fraction?: number;
    }): void;
    /** Resolves once the engine is final: `{ engine }`, with `error` when it fell back. */
    ready?(): Promise<{
        engine: string;
        error?: unknown;
    }>;
}
/** The texts `undo()` steps back through (oldest first; the current text not included), or `null` for another engine. */
export declare function undoTexts(adapter: TextEditorAdapter): string[] | null;
/** Characters a textarea adapter's history holds (a full text counts whole even when shared with the page), or `null`. */
export declare function historyChars(adapter: TextEditorAdapter): number | null;
/** The textarea engine: no dependencies, works offline, its own undo history. */
export declare function textareaAdapter(): TextEditorAdapter;
//# sourceMappingURL=adapter.d.ts.map