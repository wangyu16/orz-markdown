/**
 * Types of `orz-markdown/carrier/app` (spec/carrier-app.md): THE SEAM between
 * the kind-independent runtime of a standalone assembled file and a carrier
 * (`StandaloneKind`), the context the app gives a kind's editor
 * (`StandaloneContext`), the read view a kind renders into the page
 * (`CarrierReadView`), its header settings and extra actions, and the
 * page-side handle (`CarrierApp`, `OrzCarrier.standalone`).
 *
 * Like the rest of the kit the package compiles without the DOM lib: browser
 * objects are typed structurally (`AppElement`, `AppDocument`, `AppWindow`);
 * a real `HTMLElement`, `Document` or `Window` satisfies them.
 */
import type { HeaderChange } from '../header.js';
import type { Extracted } from '../envelope.js';
import type { DocumentInfo } from '../document.js';
import type { EditorHooks, EditorShell } from '../editor/shell.js';
import type { TextEditorAdapter } from '../editor/adapter.js';
import type { IconName, KindIcon } from '../shell/chrome.js';
import type { HostConnection, ConnectHostOptions } from '../shell/file-side.js';
import type { PreferenceStore } from '../shell/preferences.js';
import type { Saver, SaverOptions, SaveResult } from '../shell/save.js';
import type { CheckOptions, PerformUpdateOptions, PerformUpdateResult, UpdateInfo } from '../shell/update.js';
import type { IndicatorHandlers, UpdateIndicator } from '../shell/indicator.js';
import type { StorageLike, UiDocument, UiElement } from '../shell/types.js';
/** A DOM event as the app reads it (`KeyboardEvent`, `MouseEvent`, `BeforeUnloadEvent`, …). */
export interface AppEvent {
    readonly type?: string;
    readonly key?: string;
    readonly metaKey?: boolean;
    readonly ctrlKey?: boolean;
    readonly shiftKey?: boolean;
    readonly altKey?: boolean;
    readonly isComposing?: boolean;
    readonly defaultPrevented?: boolean;
    readonly target?: unknown;
    /** Pointer events: `mouse`, `touch` or `pen` (the handle tells a hover from a tap). */
    readonly pointerType?: string;
    /** Click events: 0 when the keyboard activated the button. */
    readonly detail?: number;
    /** Focus events: where the focus goes. */
    readonly relatedTarget?: unknown;
    returnValue?: unknown;
    preventDefault(): void;
    stopPropagation?(): void;
    composedPath?(): unknown[];
}
export type AppListener = (event: AppEvent) => void;
export interface AppClassList {
    add(...tokens: string[]): void;
    remove(...tokens: string[]): void;
    contains(token: string): boolean;
}
/** An element as the app uses it (an `HTMLElement` satisfies it). */
export interface AppElement {
    id: string;
    className: string;
    hidden: boolean;
    title: string;
    tabIndex: number;
    textContent: string | null;
    readonly tagName: string;
    readonly classList: AppClassList;
    readonly style: {
        cssText: string;
        setProperty(name: string, value: string): void;
    };
    readonly ownerDocument: AppDocument;
    readonly isContentEditable?: boolean;
    disabled?: boolean;
    setAttribute(name: string, value: string): void;
    getAttribute(name: string): string | null;
    removeAttribute(name: string): void;
    hasAttribute(name: string): boolean;
    append(...nodes: unknown[]): void;
    prepend(...nodes: unknown[]): void;
    appendChild(node: unknown): unknown;
    replaceChildren(...nodes: unknown[]): void;
    readonly firstElementChild?: unknown;
    readonly nextElementSibling?: unknown;
    before?(...nodes: unknown[]): void;
    after?(...nodes: unknown[]): void;
    click?(): void;
    remove(): void;
    focus(options?: {
        preventScroll?: boolean;
    }): void;
    blur?(): void;
    contains(node: unknown): boolean;
    querySelector(selector: string): AppElement | null;
    querySelectorAll(selector: string): ArrayLike<AppElement>;
    addEventListener(type: string, listener: AppListener, options?: boolean | {
        capture?: boolean;
        passive?: boolean;
    }): void;
    removeEventListener(type: string, listener: AppListener, options?: boolean | {
        capture?: boolean;
    }): void;
    getRootNode?(): unknown;
    readonly parentElement?: AppElement | null;
    getBoundingClientRect?(): {
        readonly top: number;
        readonly left: number;
        readonly right: number;
        readonly bottom: number;
        readonly width: number;
        readonly height: number;
    };
    scrollIntoView?(): void;
    attachShadow?(init: {
        mode: 'open' | 'closed';
    }): unknown;
}
/** A `ShadowRoot` as the app uses it. */
export interface AppShadowRoot {
    readonly host: unknown;
    readonly activeElement: unknown;
    adoptedStyleSheets?: unknown[];
    readonly ownerDocument: AppDocument;
    append(...nodes: unknown[]): void;
    appendChild(node: unknown): unknown;
    querySelector(selector: string): AppElement | null;
    querySelectorAll(selector: string): ArrayLike<AppElement>;
    contains(node: unknown): boolean;
}
export interface AppDocument {
    title: string;
    readonly body: AppElement;
    readonly head: AppElement;
    readonly documentElement: AppElement;
    readonly defaultView: AppWindow | null;
    readonly activeElement?: unknown;
    readonly currentScript?: unknown;
    readonly firstElementChild?: unknown;
    createElement(tag: string): AppElement;
    createTextNode(text: string): unknown;
    getElementById(id: string): AppElement | null;
    querySelector(selector: string): AppElement | null;
}
/** The window of the page (a real `Window` satisfies it). */
export interface AppWindow {
    readonly document: AppDocument;
    readonly parent: unknown;
    readonly location: {
        readonly protocol: string;
        readonly href: string;
        readonly pathname: string;
        readonly hash: string;
        reload(): void;
    };
    readonly navigator?: {
        readonly platform?: string;
        readonly userAgent?: string;
    };
    readonly innerWidth?: number;
    readonly innerHeight?: number;
    /** The reader preferences' and the update check's storage (its getter may throw: opaque origins). */
    readonly localStorage?: StorageLike | null;
    readonly CSSStyleSheet?: new () => {
        replaceSync(css: string): void;
    };
    setTimeout(handler: () => void, ms?: number): unknown;
    clearTimeout(id: unknown): void;
    requestIdleCallback?(cb: () => void, options?: {
        timeout: number;
    }): unknown;
    addEventListener(type: string, listener: AppListener, options?: boolean | {
        capture?: boolean;
    }): void;
    removeEventListener(type: string, listener: AppListener, options?: boolean | {
        capture?: boolean;
    }): void;
    matchMedia?(query: string): {
        matches: boolean;
        addEventListener?(type: 'change', listener: () => void): void;
        removeEventListener?(type: 'change', listener: () => void): void;
    };
}
export type CarrierKindName = 'md' | 'slides' | 'paged';
/** What the page knows about the assembled file it was opened from (read from its own DOM at boot). */
export interface OpenedFile {
    /** The text, exact (`readIslandFromDom(#orz-src)`: line endings and BOM restored). */
    text: string;
    /** The header `uid` when well-formed. */
    uid?: string;
    /** The header `format` (default 1). */
    format: number;
    /** The file's delivery (`#orz-shell`), kept by every save (B#7). */
    delivery: 'inline' | 'cdn';
    /** The file's resolved includes (`#orz-includes`, D4): a page cannot resolve them again. */
    includes?: Record<string, string>;
    /** The inline engine's exact text (`#orz-engine` without `src`), or null (a cdn file). */
    engine: string | null;
    /** The opened file's name (`<x>.md.html`), else `document` + the kind's extension. */
    fileName: string;
}
/** Options of a kind's `assemble` (FC-19 §2). */
export interface AppAssembleOptions {
    delivery?: 'inline' | 'cdn';
    engineSource?: string;
    includes?: Record<string, string>;
}
/** FC-19 §3 `EditorOptions`, as a kind's `mountEditor` takes them. */
export interface KindEditorOptions {
    text: string;
    kind?: CarrierKindName;
    readOnly?: boolean;
    mode?: 'split' | 'editor' | 'preview';
    chrome?: 'full' | 'compact' | 'none';
    hooks?: EditorHooks;
    preferences?: PreferenceStore;
    /** FC-19 §3 `nonce` (2.2.0): the app's CSP nonce (FC-19 §8.4). */
    nonce?: string;
    /**
     * FC-19 §3 `includes` (2.2.0): resolved includes an app hands the renderer
     * (target as written → text), like an assembled file's `#orz-includes`.
     * The kind passes them to `createEditorShell({ includes })`.
     */
    includes?: Record<string, string>;
    /**
     * FC-19 §3 `fileName` (2.2.0, round 2 of the carrier-app loop): the
     * suggested name of an app's editor's saves when it has no `hooks.save`
     * (the picker's name and the download's). The kind passes it to
     * `createEditorShell({ fileName })`; in an assembled file the file's own
     * name (`StandaloneContext.fileName`) is used.
     */
    fileName?: string;
}
/**
 * What the standalone file gives an editor mounted on itself (FC-19 §4: its
 * saves use the file's saver and host connection; a carrier never opens a
 * second connection). A kind's `mountEditor` passes these to
 * `createEditorShell` (`assemble`, `fileName`, `saver`, `host`, `includes`,
 * `openedHtml`, `standalone`, `hooks.ai`, `hooks.fetchInclude`,
 * `preferences`, `adapter`).
 */
export interface StandaloneContext {
    /** The opened file's name (the saver's suggested name). */
    fileName: string;
    /** The file's assemble: its delivery, its engine, the given includes (FC-19 §8.5). */
    assemble(text: string, options?: {
        includes?: Record<string, string>;
    }): Promise<string>;
    /** The page's one saver (its session handle, its content proof, its host). */
    saver: Saver;
    host?: HostConnection;
    /** The opened file's `#orz-includes`. */
    includes?: Record<string, string>;
    /** The opened file's bytes (the saver's content proof, shell-runtime §1 step 3). */
    openedHtml?: () => Promise<string>;
    /** The page is this file, top-level, with no host (the preview's `file:` sandbox rule, FC-19 §8.4). */
    standalone: boolean;
    /** The host's AI operations (`orz-host-ai@1`) as an FC-19 AI hook (the app adds the AI menu and its review panel). */
    ai?: EditorHooks['ai'];
    /** The host's include resolution (`orz-host-include@1`). */
    fetchInclude?: EditorHooks['fetchInclude'];
    /** The reader preferences of this document (by its uid). */
    preferences?: PreferenceStore;
    /** The editing engine (tests; default the kind's). */
    adapter?: TextEditorAdapter;
}
/** What a read view render gets besides the text. */
export interface ReadViewContext {
    /** The file's resolved includes (`#orz-includes`). */
    includes?: Readonly<Record<string, string>>;
    /** A connected host's include resolution (it wins over the record, spec/shell-runtime.md §5). */
    fetchInclude?(url: string): Promise<string | null>;
}
/** The kind's read view of the page (md: the document in the page; paged: Paged.js pages; slides: the deck). */
export interface CarrierReadView {
    /** Render a text into the page (its presentation follows its header); resolves when it shows. A newer call supersedes an older one. */
    render(text: string, ctx: ReadViewContext): void | Promise<void>;
    /** Apply a text's presentation without re-rendering (theme, measure, page size…); returns the chrome's colour scheme. */
    present(text: string): {
        scheme: 'light' | 'dark';
    };
    /** The read view's root element: hidden while editing (unless `setVisible` handles it). */
    readonly element?: AppElement | null;
    /** Show or hide the read view (edit mode hides it); default: `element.hidden`. */
    setVisible?(visible: boolean): void;
    /**
     * A key in the read view that the app's keymap did not take (no modifier
     * shortcut, not typing in a field, not `defaultPrevented`): slides' arrows
     * and Page Up/Down. Return true when handled (the app prevents the default).
     */
    onKey?(event: AppEvent): boolean;
    /** Release what it holds (the app's `dispose`). */
    destroy?(): void;
}
/**
 * A header setting the chrome offers (FC-18 §5.1 user choices — document
 * data, owner decision 4 of REBUILD §3a): its key, its choices, and how a
 * text's current value reads. md: theme, measure; paged: theme, page size,
 * template; slides: theme, ratio. Choosing writes the header
 * (`setHeader` / `editHeader`, one undoable edit).
 */
export interface SettingControl {
    key: string;
    /** Accessible name of the picker ("Theme"). */
    label: string;
    /** A kit icon name, or a kind's own `KindIcon` (drawn the same way as for actions). */
    icon?: IconName | KindIcon;
    choices: ReadonlyArray<SettingChoice>;
    /** The value a text has now (its default when the header has none). */
    current(text: string): string;
    /**
     * (2.3.0) The choices a text offers, read at each opening instead of
     * `choices` (paged's Version: the dynamic choices the document defines).
     */
    choicesFor?(text: string): ReadonlyArray<SettingChoice>;
    /**
     * (2.3.0) The header changes choosing `value` makes in `text` (default
     * `{ [key]: value }`): any keys, single-line values, `null` (remove) or
     * `{ multiline }` block values (FC-18 §9) — written as ONE undoable edit
     * (`setHeader` / `editHeader`), so a setting can write a block value such as
     * paged's `dynamic_choices` map. Only the header changes; what `editHeader`
     * refuses is a toast and changes nothing.
     */
    apply?(text: string, value: string): Readonly<Record<string, HeaderChange>>;
    /**
     * (2.3.0) Not offered for this text (re-evaluated when the text changes:
     * at each opening of the handle's list, and in an editor's toolbar after a
     * pause in typing). paged's Version is offered only while the document
     * defines choices.
     */
    hidden?(text: string): boolean;
}
/** One choice of a {@link SettingControl}. */
export interface SettingChoice {
    value: string;
    label: string;
    swatch?: string;
    /**
     * (2.3.0) Whether this choice is on now — overrides `value === current(text)`
     * (a per-choice toggle: several choices of one setting may be on; choosing
     * one that is on applies it too, so `apply` can turn it off). Set it from
     * `choicesFor(text)`.
     */
    checked?: boolean;
    /** (2.3.0) A separator before this choice (groups of a `choicesFor` list). */
    separator?: boolean;
}
/**
 * An extra chrome action of a kind (slides: Present; paged: Print). It acts
 * on the read view: an item of the handle's list (`placement: 'bar'` puts it
 * right after Edit; `menu`, the default, after the settings); with `inEdit`
 * also in edit mode (a bar button for `bar`, else an item of More).
 */
export interface CarrierAction {
    /** Stable id (`present`, `print`). */
    id: string;
    /** Label and accessible name (an action with `items` names its submenu). */
    label: string;
    /**
     * A kit icon (`ICONS`: `present`, `print`, `pageSize`, …) or the kind's own
     * (`KindIcon`: up to 8 path `d` strings on the 24×24 grid — path data only,
     * built as elements, never markup; a malformed one shows no icon). Without
     * an icon the label stays visible at every width.
     */
    icon?: IconName | KindIcon;
    placement?: 'bar' | 'menu';
    /** Offered in edit mode too (default: read view only). */
    inEdit?: boolean;
    /**
     * Run it (the chrome's item or button). Optional since 2.3.0: an action with
     * `items` is a submenu and its `run` is not called by the chrome (an action
     * with neither is not offered).
     */
    run?(app: CarrierApp): void | Promise<void>;
    /**
     * (2.3.0) A submenu: the action's entries, read at each opening — in the
     * handle's list a submenu (keyboard and touch as the settings' submenus:
     * ArrowRight / Enter / a tap opens it, ArrowLeft / Escape closes it), in
     * edit mode a submenu of More (`inEdit`; a `bar` action with items is a
     * menu button of the bar). Each entry runs with the app; a failing one is a
     * toast. An empty list offers the action disabled.
     */
    items?(app: CarrierApp): ReadonlyArray<CarrierActionItem>;
    /**
     * (2.3.0) Not offered for this text (re-evaluated when the text changes: at
     * each opening of the handle's list and of More, and for an edit-mode bar
     * button after a pause in typing). paged's Version… is offered only while
     * the document defines choices.
     */
    hidden?(text: string): boolean;
}
/** One entry of a {@link CarrierAction}'s submenu (2.3.0). */
export interface CarrierActionItem {
    /** Stable id (`data-orz-item`; default its position). */
    id?: string;
    label: string;
    /** A choice: whether it is the current one (`menuitemradio`). */
    checked?: boolean;
    disabled?: boolean;
    /** A separator before this entry. */
    separator?: boolean;
    run(app: CarrierApp): void | Promise<void>;
}
/**
 * A reader control with named choices (2.3.0, spec/carrier-app.md §4.10):
 * paged's Page zoom (Automatic / Fit width / 100% / 125%). A submenu of radio
 * choices in the handle's list; the choice is a reader preference — stored
 * per browser by the document's `uid` under the preference key
 * `reader.<key>` (validated: only one of `choices`' ids is ever stored or
 * read back), never in the text, never marking it unsaved — and applied to
 * the read view by the kind's `apply(view, id)`: at boot (the stored choice,
 * else `default`) and on each choice.
 */
export interface ReaderChoiceControl {
    /** The preference's name: `[a-z][A-Za-z0-9_-]{0,31}`, unique among the kind's controls. */
    key: string;
    /** The submenu's label and accessible name ("Page zoom"). */
    label: string;
    icon?: IconName | KindIcon;
    /** 1–24 choices with unique non-empty ids. */
    choices: ReadonlyArray<{
        id: string;
        label: string;
    }>;
    /** The choice without a stored one (one of the ids; else the first). */
    default: string;
    /** Apply a choice to the read view (the kind's own view: zoom its pages, …). Errors are the kind's own. */
    apply(view: CarrierReadView, id: string): void;
}
/**
 * Reader-side controls a kind opts in to (2.2.0, spec/carrier-app.md §4.10):
 * reader preferences (D5) — stored per browser by the document's `uid`,
 * never in the text, never marking it unsaved. The app offers them in the
 * handle's list and applies them to the read view through CSS custom
 * properties on its element (`view.element`, else the page's root), which
 * the kind's read view uses.
 */
export interface ReaderControls {
    /**
     * The read view's text size in percent (`min` ≤ 100 ≤ `max`, `step` > 0;
     * md: 80–160 in steps of 10): a row "A− 100% A+" (the percentage resets it
     * to 100), applied as `--orz-font-scale` (100 % → `1`) and stored as the
     * `fontScale` preference.
     */
    fontScale?: {
        min: number;
        max: number;
        step: number;
    };
    /**
     * (2.3.0) Reader controls with named choices ({@link ReaderChoiceControl}):
     * each a submenu of the handle's list, before the text size row. A
     * malformed control (key, choices) is not offered.
     */
    choices?: ReadonlyArray<ReaderChoiceControl>;
}
/** A carrier as the standalone runtime sees it — everything kind-specific is behind this interface. */
export interface StandaloneKind {
    kind: CarrierKindName;
    /** The shell version (= the package version, FC-19 §7). */
    version: string;
    /** The text formats it reads and writes. */
    formats: readonly number[];
    /**
     * The tool's name in the chrome's labels (2.2.0: the edit-mode GitHub link
     * is "<brand> on GitHub"); default: the repository's name from `repo`,
     * else `orz`.
     */
    brand?: string;
    /**
     * The kind's source repository (2.2.0): an `https://github.com/<owner>/<repo>`
     * URL; edit mode links to it quietly with the GitHub mark (next to the orz
     * seal, which links to https://markdown.orz.how). Anything else shows no link.
     */
    repo?: string;
    /** Reader-side controls the kind opts in to (2.2.0; §4.10). */
    readerControls?: ReaderControls;
    /** The carrier's isomorphic assemble (FC-19 §2). */
    assemble(text: string, options?: AppAssembleOptions): string | Promise<string>;
    /** A new document text (the carrier's creation tool: header with `carrier` and a fresh `uid`). */
    newDocument(): string | Promise<string>;
    /**
     * The carrier's FC-19 `mountEditor`: the kit's editor shell with the kind's
     * renderer, preview and tools. `ctx` is given when the editor is mounted on
     * the standalone file (the Edit button, or `OrzCarrier.mountEditor` without
     * `hooks.save` in an assembled file); absent in an app host.
     */
    mountEditor(element: AppElement, options: KindEditorOptions, ctx?: StandaloneContext): EditorShell;
    /** The page's read view. */
    createReadView(doc: AppDocument): CarrierReadView;
    /** The header settings the chrome offers. */
    settings?: readonly SettingControl[];
    /** Extra chrome actions (all of them in the handle's list; `inEdit` ones also in edit mode's More menu). */
    actions?: readonly CarrierAction[];
    /** FC-19 §2 `extract` (default: the kit's). */
    extract?(html: string): Extracted | null;
    /** FC-19 §2 `readDocument` (typically the kit's `readDocument(text, { kind })`). */
    readDocument(text: string): DocumentInfo;
    /** FC-19 §2 `renderPreview`. */
    renderPreview?(text: string, options?: Record<string, unknown>): Promise<string>;
}
/** Kit services the app calls; replaceable for tests (a carrier's own, the conformance stub's broken builds). */
export interface AppServices {
    createSaver(options: SaverOptions): Saver;
    connectHost(options: ConnectHostOptions): HostConnection;
    checkForUpdate(options: CheckOptions): Promise<UpdateInfo | null>;
    performUpdate(options: PerformUpdateOptions): Promise<PerformUpdateResult>;
    mountUpdateIndicator(anchor: UiElement, info: UpdateInfo, handlers: IndicatorHandlers, options?: {
        document?: UiDocument;
    }): UpdateIndicator;
    skipVersion(kind: CarrierKindName, version: string): boolean;
}
export interface CarrierAppOptions {
    /** The page (default: the global window). */
    window?: AppWindow;
    /** The Edit button's editing engine (tests; default the kind's). */
    adapter?: TextEditorAdapter;
    /** Replace kit services (tests only; production passes none). */
    services?: Partial<AppServices>;
}
/** Options of {@link CarrierApp.newDocument} (2.3.0). */
export interface NewDocumentOptions {
    /** The new document's text (default: the kind's `newDocument()`). */
    text?: string;
    /** The suggested file name (default `Untitled` + the kind's extension). */
    name?: string;
}
/** How a save from the page went (the editor's `SaveOutcome` while editing, else the saver's result). */
export type AppSaveOutcome = {
    ok: boolean;
    via?: string;
    error?: string;
    cancelled?: boolean;
    conflict?: boolean;
};
/** The page-side handle of a booted file (`OrzCarrier.standalone`; tests and the conformance driver use it). */
export interface CarrierApp {
    readonly kind: StandaloneKind;
    readonly file: Readonly<OpenedFile>;
    /** The current text: the document being edited (an editor mounted on the file), else the page's. */
    getText(): string;
    isDirty(): boolean;
    /** Enter edit mode (mounting the kind's editor once) and return the editor. */
    edit(): EditorShell;
    /** Leave edit mode (the read view shows the current text). */
    leave(): Promise<void>;
    /** The Edit button's editor while editing, else null. */
    editor(): EditorShell | null;
    /** Write header settings (as the pickers do): one undoable edit. */
    setSetting(changes: Record<string, HeaderChange>): void;
    /** Undo / redo the last header setting made outside edit mode. */
    undo(): boolean;
    redo(): boolean;
    /** Save the document (the editor's save while editing). Never rejects. */
    save(): Promise<AppSaveOutcome>;
    /** Download a copy of the current text's file. */
    download(): Promise<SaveResult>;
    /**
     * Save a new document as a new file through the picker (never over this
     * file, never to the host: a host or a served page gets a download). The
     * text is the kind's `newDocument()` unless `options.text` gives it (2.3.0:
     * a kind's action — paged's "New document from template…" — passes the
     * template's text); a given text without a well-formed `uid`, or with this
     * file's, gets a new one (a new document is never this one). `options.name`
     * (2.3.0) is the suggested file name (path characters removed; the kind's
     * extension added when missing; default `Untitled` + the extension).
     */
    newDocument(options?: NewDocumentOptions): Promise<SaveResult>;
    /** Save the current text with a new uid as a new file through the picker. */
    saveAsCopy(): Promise<SaveResult>;
    /** The context the file gives an editor mounted on it. */
    editorContext(): StandaloneContext;
    /**
     * Register an editor mounted on this file's context (it saves through the
     * file's saver): while one is attached it is the document being edited —
     * Cmd/Ctrl+S on the page saves it, its unsaved changes count for leaving
     * the page, the quiet update reads its text and makes it read-only, and the
     * host's AI operations appear in its toolbar. Returns the detach function.
     */
    attach(editor: EditorShell): () => void;
    /** Show a toast in the chrome. */
    toast(message: string, tone?: 'info' | 'success' | 'warning' | 'error'): void;
    /**
     * The handle's list of operations (2.2.0, spec/carrier-app.md §4.2): open
     * it as a hover does (the focus stays where it is), close it, or ask
     * whether it is open. Tests and the conformance driver use it.
     */
    readonly menu: {
        open(): void;
        close(): void;
        isOpen(): boolean;
    };
    /** The read view's text size in percent (null when the kind offers no `readerControls.fontScale`). */
    fontScale(): number | null;
    /** (2.3.0) The current choice of the kind's reader control `key` (`readerControls.choices`), or null when it offers none by that key. */
    readerChoice(key: string): string | null;
    /**
     * (2.3.0) Choose `id` for the reader control `key` (null or an unknown id:
     * its default), stored per uid and applied to the read view; the document
     * is untouched. Returns the choice applied (null when there is no such
     * control).
     */
    setReaderChoice(key: string, id: string | null): string | null;
    /**
     * Set the read view's text size (clamped to the kind's range and snapped to
     * its step; null: 100 %), stored per uid; the document is untouched (not
     * marked unsaved, never in a saved file). Returns the size applied (null
     * when the kind offers none).
     */
    setFontScale(percent: number | null): number | null;
    /**
     * Show or hide the chrome (slides' presenter hides it): the handle, the
     * edit-mode bar and the editor, not the toasts. Hiding it while the focus is in the bar or the
     * editor moves the focus to the page (the read view's element when it
     * takes the focus, else the document), so the read view's keys work at
     * once (round 3 of the carrier-app loop).
     */
    setChromeVisible(visible: boolean): void;
    /** The read view. */
    readonly view: CarrierReadView;
    /** The chrome's shadow root. */
    readonly root: AppShadowRoot;
    readonly host: HostConnection | undefined;
    /** True while a quiet update runs (the document is read-only). */
    readonly updating: boolean;
    /** Resolves when the first read view is in the page. */
    readonly ready: Promise<void>;
    /** Remove the app's listeners and chrome (tests). */
    dispose(): void;
}
/** The FC-19 §2 global every carrier bundle sets (`globalThis.OrzCarrier`), plus the booted file's handle. */
export interface OrzCarrierGlobal {
    readonly kind: CarrierKindName;
    readonly version: string;
    readonly formats: number[];
    assemble(text: string, options?: AppAssembleOptions): Promise<string>;
    extract(html: string): Extracted | null;
    readDocument(text: string): DocumentInfo;
    mountEditor(element: AppElement, options: KindEditorOptions): EditorShell;
    renderPreview?(text: string, options?: Record<string, unknown>): Promise<string>;
    /** The booted file's handle (null outside an assembled file). Not part of FC-19: tests and the conformance driver use it. */
    readonly standalone: CarrierApp | null;
}
//# sourceMappingURL=types.d.ts.map