/**
 * The editor shell (FC-19 §8): the kind-independent base that each carrier's
 * `mountEditor` wraps — chrome toolbar, editor pane and sandboxed preview in
 * one shadow root; view modes, a draggable split, the keyboard map; the exact
 * text, dirty tracking, header edits, save; the FC-19 §3 hooks that do not
 * depend on the kind (save, ai, fetchInclude, resolveAsset, uploadAsset,
 * resolveLink, mintUid).
 *
 * - Text: the shell owns it. The engine (adapter.ts) edits LF text; the text
 *   model (text-model.ts) gives back the document's exact form — byte for byte
 *   when nothing was edited, its own line endings and BOM after edits.
 * - Preview: the caller's `render(text, ctx)` (the md kind:
 *   `renderMarkdownPreview`) into the sandboxed frame of preview.ts, after a
 *   pause that grows with the render time, never two at once; scroll sync on
 *   `data-src-line` anchors (or the carrier's mapping / navigation).
 * - Frame messages: keys (save, view, Escape), links, input and scrolls act
 *   only when the bridge reports them through its authenticated port (the
 *   reader's own trusted events in the frame); window messages are data and
 *   never act. A document's scripts may take the keyboard focus inside the
 *   preview (accepted, FC-19 §5 invariant 3): keys typed then go to the
 *   preview, but nothing there can save, switch views, open a link or scroll
 *   the editor. Links from the frame open only through the host (`onLink`) or
 *   a click on the shell's own "Open" chip.
 * - Text formats: a header `format` newer than `formats` opens read-only and
 *   is never saved over (FC-18 §8.4).
 * - Reader preferences (FC-18 §6): split ratio, view mode, scroll sync, editor
 *   font size, dark chrome — through a `PreferenceStore` namespaced by the
 *   document `uid`, never in the text.
 * - Instances: no global state; `destroy()` removes everything it added
 *   (listeners, timers, the iframe, the engine, its element); work in flight
 *   (a save, an upload, an AI request, a uid) changes nothing afterwards.
 */
import { type HeaderChange } from '../header.js';
import { type PreferenceStore } from '../shell/preferences.js';
import { type Saver, type SaverOptions } from '../shell/save.js';
import { type AiOperation, type HostKind } from '../shell/protocol.js';
import type { HostConnection } from '../shell/file-side.js';
import type { StorageLike } from '../shell/types.js';
import type { TextEditorAdapter } from './adapter.js';
import { type PreviewFrameOptions, type PreviewMessage } from './preview.js';
import type { ColorScheme } from '../../preview-frame.js';
import type { EdElement, EdFile, ShadowRootLike } from './types.js';
export type EditorMode = 'split' | 'editor' | 'preview';
export type EditorEventName = 'change' | 'dirty' | 'selection' | 'save' | 'error' | 'print';
export type SaveVia = 'hook' | 'host' | 'file' | 'download';
/** How the save went. `save()` never rejects. */
export type SaveOutcome = {
    ok: true;
    via: SaveVia;
} | {
    ok: false;
    via?: SaveVia | 'served-notice';
    error: string;
    cancelled?: boolean;
    conflict?: boolean;
};
export interface EditorEvents {
    /**
     * The exact text after the change (captured when the event fires); `label`
     * (2.4.0) is the label an `applyEdits` call gave, when the change is one.
     */
    change: {
        readonly text: string;
        readonly label?: string;
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
        via: SaveVia;
    };
    /** `format`: the text's format is newer than the editor's; `hook`: an upload, AI or uid hook failed. */
    error: {
        source: 'save' | 'render' | 'adapter' | 'format' | 'hook';
        message: string;
        error: unknown;
    };
    /**
     * (2.3.0) The reader pressed Cmd/Ctrl+P — in the preview frame (`preview`:
     * the bridge's report through its authenticated port, a trusted key event;
     * the frame prevented its own print) or in the shell (`editor`). With a
     * listener the shell prevents the browser's print and the listener decides
     * (a carrier: its Print action); without one, a key from the frame prints
     * the host page (`window.print()`) and a key in the shell is the browser's.
     */
    print: {
        source: 'preview' | 'editor';
    };
}
/** A range of the exact text (BOM and CR LF counted). */
export interface TextRange {
    from: number;
    to: number;
}
/** One replacement for `applyEdits` (2.4.0): offsets in the exact text (BOM and CR LF counted). */
export interface TextEdit {
    from: number;
    to: number;
    insert: string;
}
/** FC-19 §3 `EditorHooks`: what a host supplies. Every hook is optional. */
export interface EditorHooks {
    /** App host: persist the text. Absent → the standalone save (`assemble` + `createSaver`). */
    save?(text: string): Promise<void>;
    /** AI operations: `request` gets the exact text and, for a passage, its range; `proposed` replaces it (`requestAi`). */
    ai?: {
        operations: AiOperation[];
        request(op: string, ctx: {
            text: string;
            selection?: TextRange;
        }): Promise<{
            proposed: string;
        }>;
    };
    /** Include fetching (URL or path → text, or null); passed to `render` in its context. The host owns the trust policy. */
    fetchInclude?(target: string): Promise<string | null>;
    /** A relative asset path → the URL the preview loads (applied to the rendered HTML; also passed to `render`). */
    resolveAsset?(path: string): string;
    /** A pasted or dropped file → the relative path to insert (as a Markdown image or link). */
    uploadAsset?(file: EdFile): Promise<string>;
    /** A link clicked in the preview → the URL to open (then `onLink`, or the default). */
    resolveLink?(href: string): string;
    /** A host-minted `uid` (FC-18 §10) for `ensureUid()`; default the kit's `mintUid()`. */
    mintUid?(): Promise<string>;
}
/** What `render` gets besides the text: the host's hooks that a renderer may use. */
export interface RenderContext {
    fetchInclude?(target: string): Promise<string | null>;
    resolveAsset?(path: string): string;
    /**
     * `false` when the host resolves links itself (`hooks.resolveLink`): render
     * links as written (no twin rewrite), so `resolveLink` gets the source href.
     * `renderMarkdownPreview` reads it.
     */
    twinLinks?: boolean;
    /** A scratch map that lives as long as the shell (e.g. fetched includes; `renderMarkdownPreviewWithIncludes`). */
    cache?: Map<string, unknown>;
    /**
     * The opened file's resolved includes (the shell's `includes` option, the
     * `#orz-includes` record, FC-18 §8.3): `renderMarkdownPreview` reads file
     * includes from it and `renderMarkdownPreviewWithIncludes` URL includes too.
     */
    includes?: Readonly<Record<string, string>>;
}
/** The shell's channel to the preview frame's bridge (FC-19 §8.4), for a carrier's own frame protocol. */
export interface EditorPreviewChannel {
    /** Post a message to the frame (the carrier's own types). False while the frame is not ready. */
    post(message: Readonly<Record<string, unknown>>): boolean;
    /** Listen to the frame's messages of one type (through the authenticated port, and a carrier's own types on the window — data only). Returns the unsubscribe. */
    on(type: string, fn: (message: PreviewMessage) => void): () => void;
    /** Rebuild the frame document with another `head`, `scheme` and/or `articleClass` (e.g. a theme or measure change); the preview shows again. */
    setOptions(options: {
        head?: string;
        scheme?: ColorScheme;
        articleClass?: string;
    }): void;
}
/** The preview's scroll mapping context (`preview.mapLine` / `mapPosition`). */
export interface PreviewMapContext {
    /** `[line, top]` anchors the frame reported, sorted by top. */
    anchors: ReadonlyArray<[number, number]>;
    /** The frame's scrollable height. */
    max: number;
}
export interface EditorPreviewOptions extends PreviewFrameOptions {
    /** The least pause after an edit before the preview renders (ms, default 150); it grows to twice the last render's time. */
    debounceMs?: number;
    /**
     * While edits continue, a render runs at least this often (ms, default 1000;
     * it grows to 4 × the last render and frame time). `Infinity`: never render
     * while keys keep arriving — only after a typing pause (`debounceMs`, grown
     * to twice the last render). For a kind whose render blocks the page (a
     * pagination reflow in the same-process frame), so typing never freezes on
     * a forced render (2.3.0, E.32).
     */
    maxWaitMs?: number;
    /**
     * (2.3.0) How long a render waits for the frame's acknowledgement while the
     * frame has not acknowledged one yet (ms, default 1500, at most 10 000). A
     * kind whose first layout is long (a paginated preview) raises it so that
     * render is paced like the others. Either way an acknowledgement that
     * arrives after the wait still records the render's time (E.34).
     */
    firstAckWaitMs?: number;
    /** How long the frame may take to start before the shell reports it (`error` `render`) and shows a notice. Default 8000. */
    readyTimeoutMs?: number;
    /**
     * `scroll` (default): the shell posts preview tops (`orz-preview-scroll`)
     * and reads tops back. `navigate`: the shell posts the source line
     * (`orz-preview-navigate { line }`, the caret's line while the editor has
     * focus, else the top line) and the bridge shows what holds it (a slide);
     * the bridge reports `orz-preview-scrolled { line }` back.
     */
    mode?: 'scroll' | 'navigate';
    /** Editor line (0-based, fractional) → preview top. Return `null` for the default (anchors, else proportional). */
    mapLine?(line: number, ctx: PreviewMapContext): number | null | undefined;
    /** Preview top → editor line. Return `null` for the default. */
    mapPosition?(top: number, ctx: PreviewMapContext): number | null | undefined;
}
export interface EditorShellOptions {
    /** The document (FC-18), exact. */
    text: string;
    /** The kind's preview renderer: text → HTML for the sandboxed preview (md: `renderMarkdownPreview`). */
    render(text: string, ctx: RenderContext): string | Promise<string>;
    /** The editing engine. Default `codemirror6Adapter()` (falls back to a textarea). */
    adapter?: TextEditorAdapter;
    /** Initial mode; default the stored `viewMode` preference (`split`). */
    mode?: EditorMode;
    readOnly?: boolean;
    /** How much toolbar: `full` (labels), `compact` (icons), `none` (no toolbar; the host drives the API). */
    chrome?: 'full' | 'compact' | 'none';
    /** The carrier kind, for the standalone save (`md` by default). */
    kind?: HostKind;
    /** The text formats this editor reads and writes (FC-18; the carrier's `OrzCarrier.formats`). Default `[1]`. */
    formats?: number[];
    /** Preferences namespace and save handle key; default the header `uid`. */
    uid?: string;
    /** Reader preferences (FC-19 `preferences`); default `createPreferenceStore(uid, storage)`. */
    preferences?: PreferenceStore;
    /** Storage of the default preference store (default `localStorage`). */
    storage?: StorageLike;
    /** FC-19 §3 hooks (`hooks.save` = app host). */
    hooks?: EditorHooks;
    /**
     * Standalone host: the assembled file for a text (the carrier's `assemble`), saved through
     * `createSaver`. It must keep the opened file's delivery (FC-19 §8.5); the shell passes
     * `{ includes }` when the `includes` option holds some.
     */
    assemble?(text: string, options?: {
        includes?: Record<string, string>;
    }): string | Promise<string>;
    /**
     * The opened file's resolved includes (`extract(html).includes`, the `#orz-includes` island,
     * FC-18 §8.3 D4). A page cannot resolve local includes again, so every standalone save (and
     * the default `openedHtml`) passes them to `assemble(text, { includes })`. Default: none.
     */
    includes?: Record<string, string>;
    /** The assembled file's name for the standalone save (default `document` + the kind's extension). */
    fileName?: string;
    /**
     * A saver to use instead of `createSaver({ uid, suggestedName: fileName, kind, host, openedHtml,
     * servedNotice })`. The shell's own saver shows the served-page notice only for an assembled file
     * (`standalone: true` or `openedHtml` given); on an app's page (no `hooks.save`, no file) a save
     * on an http(s) page goes to the picker, else a download (2.2.0).
     */
    saver?: Saver;
    /**
     * The bytes of the file this page was opened from (`createSaver`'s
     * `openedHtml`: how a remembered file handle is proved to be that file).
     * Default: `assemble(text, { includes })` of the text the shell was mounted
     * with, which reproduces an assembled file (FC-18 law 3) — computed once,
     * when the page is first idle after mount, so a save click runs one
     * `assemble` and the picker or permission prompt still has the click's
     * user activation on a large document (round 3, B#6).
     */
    openedHtml?: SaverOptions['openedHtml'];
    /** A connected app host (`connectHost`): saves go to it, and the dirty state is posted to it. */
    host?: HostConnection;
    /**
     * The shell runs in the assembled file itself (the file's own boot passes
     * `true`). Default: inferred — no `hooks.save`, an `assemble`, no `host`, and
     * a top-level window. It decides the preview's sandbox, where a standalone
     * `file:` page also needs a top-level window and no host (previewSandbox).
     */
    standalone?: boolean;
    /** The preview frame (theme links, scheme, article class, libraries, nonce, the carrier's frame/bridge/mapping) and its timing. */
    preview?: EditorPreviewOptions;
    /**
     * FC-19 §3 `nonce` (added 2.2.0): an app's CSP nonce (FC-19 §8.4 recipe),
     * stamped on the preview frame's scripts and styles (`preview.nonce` when
     * that is not given) and, with the default adapter, on CodeMirror's
     * `<script>` and `<style>` (`codemirror6Adapter({ nonce })`).
     */
    nonce?: string;
    /**
     * A link clicked in the preview, after `hooks.resolveLink`. Default: an
     * `http(s):` / `mailto:` link is offered in a chip in the preview ("Open
     * <host>"), opened in a new tab when the reader clicks it.
     */
    onLink?(href: string): void;
    /** Accessible name of the editor region. Default `Document editor`. */
    label?: string;
    /** Below this width (CSS px) only one pane shows at a time. Default 640. */
    narrowWidth?: number;
}
/** How an AI request went. Never rejects. */
export type AiOutcome = {
    ok: true;
    op: string;
} | {
    ok: false;
    error: string;
};
/**
 * An AI proposal awaiting the reader's review (`proposeAi`; host-protocols §4:
 * the document is untouched until the reader applies it). Frozen; only the
 * shell that made it can apply it (`applyAi`).
 */
export interface AiProposal {
    readonly op: string;
    /** The replacement the hook proposed (as given; `applyAi` writes it in the document's line endings and BOM). */
    readonly proposed: string;
    /** What it replaces: offsets in the exact text at the time of the request — the selection, or the whole text. */
    readonly range: Readonly<TextRange>;
    /** The exact text in `range` when the request was made. */
    readonly original: string;
    /** A passage (selection) operation; else the proposal replaces the whole document. */
    readonly passage: boolean;
}
/** How a proposal request went. Never rejects. */
export type AiProposalOutcome = {
    ok: true;
    op: string;
    proposal: AiProposal;
} | {
    ok: false;
    error: string;
};
/** How an upload went: the Markdown inserted for each uploaded file. Never rejects. */
export type UploadOutcome = {
    ok: true;
    inserted: string[];
} | {
    ok: false;
    inserted: string[];
    error: string;
};
export interface EditorShell {
    getText(): string;
    /** Replace the text; one undoable edit unless `resetHistory`. Does not mark it saved. */
    setText(text: string, options?: {
        resetHistory?: boolean;
    }): void;
    /** Apply `editHeader(text, changes)` (FC-18 §9) as one undoable edit. Throws what `editHeader` throws. */
    setHeader(changes: Readonly<Record<string, HeaderChange>>): void;
    /**
     * (2.4.0, FC-19 §4) Apply several replacements as ONE undoable edit — a
     * layout tool's minimal diffs. Offsets are in the exact text (as
     * `selection` reports them), sorted by `from`, not overlapping (inserts at
     * one offset apply in the order given); each `insert` is written in the
     * document's line endings. The selection maps through the edits; the
     * `change` event carries `label`. Throws a `RangeError` (changing nothing)
     * for an edit that is malformed, out of order, overlapping, outside the
     * text, before the BOM or between the CR and LF of a line break. Returns
     * false (changing nothing) when read-only or destroyed, else true.
     */
    applyEdits(edits: readonly TextEdit[], options?: {
        label?: string;
    }): boolean;
    /**
     * (2.4.0) Select a range of the exact text (clamped; a boundary inside a
     * CR LF moves before it) and, unless `scroll: false`, bring it into view.
     * Emits `selection`. Works read-only too; does not move the focus.
     */
    select(from: number, to: number, options?: {
        scroll?: boolean;
    }): void;
    /**
     * (2.4.0) Show the text outside `from`–`to` (exact offsets) dimmed —
     * `mode: 'fold'` hides those lines instead — so a reader works on one part
     * (a slide) inside the whole text: nothing is removed, undo and search
     * still see all of it, and the range follows later edits. `null` shows
     * everything again. The textarea engine (CodeMirror not loaded, or an
     * engine without it) shows everything; a range set before CodeMirror
     * loads applies when it does.
     */
    setFocusRange(from: number | null, to?: number, options?: {
        mode?: 'dim' | 'fold';
    }): void;
    /**
     * (2.4.0) Light the lines the ranges (exact offsets) touch for a moment —
     * `ms`, default 1600 — so a reader sees what a tool just changed (a layout
     * GUI's marker lines). Nothing in the text or its history changes; a range
     * that ends at a line start does not light that line. The textarea engine
     * shows nothing. Bad arguments throw a `TypeError`.
     */
    flash(ranges: ReadonlyArray<{
        from: number;
        to: number;
    }>, options?: {
        ms?: number;
    }): void;
    /**
     * (2.4.0) The selection now, in exact offsets (`from` ≤ `to`), or null
     * (no engine selection yet, or destroyed). It is the engine's own, so it
     * has followed every change — a header setting, `setText`, `applyEdits`,
     * an AI edit — also when no `selection` event came (a change MAPS the
     * selection; it does not set it).
     */
    getSelection(): {
        from: number;
        to: number;
    } | null;
    isDirty(): boolean;
    /** The current text is the saved one. */
    markSaved(): void;
    /** `hooks.save` (app host) or `assemble` + the standalone save. Never rejects. */
    save(): Promise<SaveOutcome>;
    /**
     * Run `hooks.ai.request(op, { text, selection? })` and apply `proposed` as
     * ONE undoable edit: it replaces the selection (a passage operation, or
     * `{ selection: true }`) or the whole text, written in the document's line
     * endings (and BOM). Refused when the text changed during the request.
     */
    requestAi(op: string, options?: {
        selection?: boolean;
    }): Promise<AiOutcome>;
    /**
     * The review flow (added 2.2.0): run `hooks.ai.request` like `requestAi`
     * but change nothing — resolve the proposal with the exact-text range it
     * would replace. Refused when read-only, without a selection for a
     * passage, on a hook failure, or when the shell became read-only or was
     * destroyed meanwhile.
     */
    proposeAi(op: string, options?: {
        selection?: boolean;
    }): Promise<AiProposalOutcome>;
    /**
     * Apply a proposal of this shell as ONE undoable edit — `proposed` (the
     * reader's edited version, when given) in the document's line endings and
     * BOM, in place of the proposal's range. Refused, changing nothing, when
     * the text changed since the proposal was made (any edit), when read-only
     * or destroyed, or for a proposal this shell did not make.
     */
    applyAi(proposal: AiProposal, options?: {
        proposed?: string;
    }): AiOutcome;
    /** Upload files through `hooks.uploadAsset` and insert their Markdown at the selection (one undoable edit). */
    uploadAssets(files: ArrayLike<EdFile>): Promise<UploadOutcome>;
    /** The header `uid`; when there is none, mint one (`hooks.mintUid`, else the kit's) and set it (one undoable edit). */
    ensureUid(): Promise<string>;
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
    /**
     * Render the preview now (normally after a pause in typing), also when the
     * text has not changed (e.g. an include became available). With `includes`
     * (2.2.0, FC-19 §4): the renderer's include record is replaced by it (`null`
     * or `{}`: none) and the fetched-include cache is cleared first, so every
     * include is read again from the new record or `fetchInclude`. Saves write
     * the latest record (round 3 of the carrier-app loop); the opened bytes stay
     * those of the mounted includes (the opened file's `#orz-includes`).
     */
    refreshPreview(options?: {
        includes?: Record<string, string> | null;
    }): Promise<void>;
    /** Read-only now: asked for (`readOnly`, `setReadOnly`), or forced by a newer text format. */
    readonly readOnly: boolean;
    /**
     * Switch read-only at run time (e.g. while a quiet update runs,
     * spec/shell-runtime.md §7.2): the engine, Save, Cmd/Ctrl+S, uploads and AI
     * follow it. A document in a newer text format stays read-only:
     * `setReadOnly(false)` does not unlock it.
     */
    setReadOnly(readOnly: boolean): void;
    isReadOnly(): boolean;
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
    /** The channel to the preview frame's bridge (a carrier's own messages, theme changes). */
    readonly preview: EditorPreviewChannel;
    /**
     * Remove everything the shell added. Afterwards `getText()` returns the text
     * as it was, `isDirty()` the state then; `setText`, `setHeader`, `markSaved`
     * and `setReadOnly` do nothing, `undo`/`redo` return false, `save()` and
     * the hooks refuse, and work still in flight changes nothing.
     */
    destroy(): void;
}
/** Mount the editor shell in `element`. */
export declare function createEditorShell(element: EdElement, options: EditorShellOptions): EditorShell;
//# sourceMappingURL=shell.d.ts.map