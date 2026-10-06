/**
 * The editor shell (FC-19 §8): the kind-independent base that each carrier's
 * `mountEditor` wraps — chrome toolbar, editor pane and sandboxed preview in
 * one shadow root; view modes, a draggable split, the keyboard map; the exact
 * text, dirty tracking, header edits, save.
 *
 * - Text: the shell owns it. The engine (adapter.ts) edits LF text; the text
 *   model (text-model.ts) gives back the document's exact form — byte for byte
 *   when nothing was edited, its own line endings and BOM after edits.
 * - Preview: the caller's `render(text)` (the md kind: `renderMarkdownPreview`)
 *   into the sandboxed frame of preview.ts, debounced; scroll sync on
 *   `data-src-line` anchors, proportional without them.
 * - Reader preferences (FC-18 §6): split ratio, view mode, scroll sync, editor
 *   font size, dark chrome — through a `PreferenceStore` namespaced by the
 *   document `uid`, never in the text.
 * - Instances: no global state; `destroy()` removes everything it added
 *   (listeners, timers, the iframe, the engine, its element).
 */
import { type HeaderChange } from '../header.js';
import { type PreferenceStore } from '../shell/preferences.js';
import { type Saver } from '../shell/save.js';
import { type HostKind } from '../shell/protocol.js';
import type { HostConnection } from '../shell/file-side.js';
import type { StorageLike } from '../shell/types.js';
import type { TextEditorAdapter } from './adapter.js';
import { type PreviewFrameOptions } from './preview.js';
import type { EdElement, ShadowRootLike } from './types.js';
export type EditorMode = 'split' | 'editor' | 'preview';
export type EditorEventName = 'change' | 'dirty' | 'selection' | 'save' | 'error';
/** How the save went. `save()` never rejects. */
export type SaveOutcome = {
    ok: true;
    via: 'hook' | 'host' | 'file' | 'download';
} | {
    ok: false;
    via?: 'hook' | 'host' | 'file' | 'download' | 'served-notice';
    error: string;
    cancelled?: boolean;
};
export interface EditorEvents {
    change: {
        readonly text: string;
    };
    dirty: {
        dirty: boolean;
    };
    /** Offsets in the exact text (BOM and CR LF counted). */
    selection: {
        from: number;
        to: number;
    };
    save: {
        text: string;
        via: 'hook' | 'host' | 'file' | 'download';
    };
    error: {
        source: 'save' | 'render' | 'adapter';
        message: string;
        error: unknown;
    };
}
export interface EditorShellOptions {
    /** The document (FC-18), exact. */
    text: string;
    /** The kind's preview renderer: text → HTML for the sandboxed preview (md: `renderMarkdownPreview`). */
    render(text: string): string | Promise<string>;
    /** The editing engine. Default `codemirror6Adapter()` (falls back to a textarea). */
    adapter?: TextEditorAdapter;
    /** Initial mode; default the stored `viewMode` preference (`split`). */
    mode?: EditorMode;
    readOnly?: boolean;
    /** How much toolbar: `full` (labels), `compact` (icons), `none` (no toolbar; the host drives the API). */
    chrome?: 'full' | 'compact' | 'none';
    /** The carrier kind, for the standalone save (`md` by default). */
    kind?: HostKind;
    /** Preferences namespace and save handle key; default the header `uid`. */
    uid?: string;
    /** Reader preferences (FC-19 `preferences`); default `createPreferenceStore(uid, storage)`. */
    preferences?: PreferenceStore;
    /** Storage of the default preference store (default `localStorage`). */
    storage?: StorageLike;
    /** App host: `hooks.save(text)` persists the text (FC-19 `EditorHooks.save`). */
    hooks?: {
        save?(text: string): Promise<void>;
    };
    /** Standalone host: the assembled file for a text (the carrier's `assemble`), saved through `createSaver`. */
    assemble?(text: string): string | Promise<string>;
    /** The assembled file's name for the standalone save (default `document` + the kind's extension). */
    fileName?: string;
    /** A saver to use instead of `createSaver({ uid, suggestedName: fileName, kind, host })`. */
    saver?: Saver;
    /** A connected app host (`connectHost`): saves go to it, and the dirty state is posted to it. */
    host?: HostConnection;
    /** The preview frame (theme stylesheet links, scheme, article class, libraries) and the update delay. */
    preview?: PreviewFrameOptions & {
        debounceMs?: number;
    };
    /** A link clicked in the preview (default: open `http(s):`/`mailto:` links in a new tab). */
    onLink?(href: string): void;
    /** Accessible name of the editor region. Default `Document editor`. */
    label?: string;
    /** Below this width (CSS px) only one pane shows at a time. Default 640. */
    narrowWidth?: number;
}
export interface EditorShell {
    getText(): string;
    /** Replace the text; one undoable edit unless `resetHistory`. Does not mark it saved. */
    setText(text: string, options?: {
        resetHistory?: boolean;
    }): void;
    /** Apply `editHeader(text, changes)` (FC-18 §9) as one undoable edit. Throws what `editHeader` throws. */
    setHeader(changes: Readonly<Record<string, HeaderChange>>): void;
    isDirty(): boolean;
    /** The current text is the saved one. */
    markSaved(): void;
    /** `hooks.save` (app host) or `assemble` + the standalone save. Never rejects. */
    save(): Promise<SaveOutcome>;
    setMode(mode: EditorMode): void;
    getMode(): EditorMode;
    /** The pane(s) actually shown: in a narrow shell, `split` shows one pane. */
    getView(): EditorMode;
    setSplitRatio(ratio: number): void;
    getSplitRatio(): number;
    undo(): boolean;
    redo(): boolean;
    focus(): void;
    on<E extends EditorEventName>(event: E, fn: (e: EditorEvents[E]) => void): () => void;
    /** Render the preview now (normally debounced after edits). */
    refreshPreview(): Promise<void>;
    /** The chrome's shadow root (for a carrier's own chrome and toasts). */
    readonly root: ShadowRootLike;
    /** The toolbar slot where a carrier adds its tools (null with `chrome: 'none'`). */
    readonly toolbar: EdElement | null;
    readonly adapter: TextEditorAdapter;
    /** Resolves when the engine is final (`codemirror6`, or `textarea` with the load error). */
    readonly ready: Promise<{
        engine: string;
        error?: unknown;
    }>;
    destroy(): void;
}
/** Mount the editor shell in `element`. */
export declare function createEditorShell(element: EdElement, options: EditorShellOptions): EditorShell;
//# sourceMappingURL=shell.d.ts.map