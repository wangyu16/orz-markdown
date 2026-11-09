/**
 * The default editing engine: CodeMirror 6 behind the adapter interface
 * (adapter.ts), loaded lazily.
 *
 * Loading. By default the PINNED bundle `vendor/codemirror6.js` of this
 * package (exact versions in codemirror-pin.ts, built by
 * scripts/build-codemirror.ts) is loaded from jsDelivr
 * (`https://cdn.jsdelivr.net/npm/orz-markdown@<VERSION>/vendor/codemirror6.js`)
 * by one `<script src integrity crossorigin>` per document — Subresource
 * Integrity pins the bytes, there is no eval and no inline script, and one
 * bundle means one `@codemirror/state` (per-package `+esm` URLs resolve it to
 * different versions, which CodeMirror refuses). An app that bundles
 * CodeMirror itself passes `loadModules` and nothing is fetched.
 *
 * While CodeMirror loads, the shell is already editable: the adapter starts
 * as a `<textarea>` and upgrades in place (its current text, selection, focus,
 * scroll and its newest undo steps carried over: each of the last
 * `CODEMIRROR6_HISTORY_STEPS` textarea undo steps becomes one CodeMirror undo
 * step — CodeMirror's own history keeps at least that many). When CodeMirror cannot load (offline, blocked, wrong bytes), the
 * textarea stays and `ready()` reports the error.
 */
import { VERSION } from '../../version.js';
import { CODEMIRROR6_GLOBAL, CODEMIRROR6_INTEGRITY, CODEMIRROR6_PATH } from './codemirror-pin.js';
import { syncTextarea, textareaAdapter, undoSteps, type AdapterMountOptions, type FocusMode, type HeaderFoldInfo, type ScrollPosition, type Selection, type TextEditorAdapter } from './adapter.js';
import { minimalChange } from './text-model.js';
import type { EdDocument, EdElement, EdScript } from './types.js';

/* CodeMirror's own types are not a dependency of the package: its objects are opaque here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/**
 * The CodeMirror 6 exports the adapter uses, grouped by package. Module
 * namespaces satisfy it: `{ state: await import('@codemirror/state'), view:
 * await import('@codemirror/view'), commands: …, language: …, markdown: await
 * import('@codemirror/lang-markdown'), search: … }` (search optional).
 */
export interface CodeMirror6Modules {
  /** `StateField`, `StateEffect` (2.4.0, optional): the focus range of `setFocusRange`. */
  state: { EditorState: Any; Compartment?: Any; EditorSelection?: Any; StateField?: Any; StateEffect?: Any };
  /** `Decoration` (2.4.0, optional): the focus range's dimming and folding. `WidgetType` (2.7.0, optional): the folded header's line. */
  view: { EditorView: Any; keymap: Any; drawSelection?: Any; highlightActiveLine?: Any; highlightSpecialChars?: Any; dropCursor?: Any; Decoration?: Any; WidgetType?: Any };
  commands: { history: Any; defaultKeymap: Any; historyKeymap: Any; indentWithTab?: Any; undo: Any; redo: Any; isolateHistory?: Any };
  language: { syntaxHighlighting: Any; defaultHighlightStyle: Any; indentOnInput?: Any; bracketMatching?: Any; LanguageSupport?: Any };
  markdown: { markdownLanguage: Any; markdownKeymap?: Any };
  search?: { searchKeymap?: Any; highlightSelectionMatches?: Any };
  /** Package versions (the pinned bundle sets it). */
  versions?: Record<string, string>;
}

/** Where the pinned bundle is served (the package version that ships it). */
export const CODEMIRROR6_URL = `https://cdn.jsdelivr.net/npm/orz-markdown@${VERSION}/${CODEMIRROR6_PATH}`;
/** How long the bundle may take to load before the textarea is kept. */
export const CODEMIRROR6_TIMEOUT_MS = 20_000;
/**
 * How many of the textarea's undo steps the upgrade replays into CodeMirror
 * (CodeMirror's history keeps at least 100 by default). Replaying all 300 of a
 * 1.25 MB document took 20 s and 590 MB (MED cost-2).
 */
export const CODEMIRROR6_HISTORY_STEPS = 100;

export interface CodeMirror6Options {
  /** Supply the modules (an app that bundles CodeMirror 6); nothing is fetched. */
  loadModules?: () => CodeMirror6Modules | Promise<CodeMirror6Modules>;
  /**
   * Load the pinned bundle from another address (self-hosting, tests). A code
   * option, never read from a document; the bytes must still match the pinned
   * integrity.
   */
  url?: string;
  timeoutMs?: number;
  /**
   * A CSP nonce: stamped on the bundle's `<script>` (a page whose
   * `script-src` is nonce-based) and given to CodeMirror for the `<style>` it
   * adds (`EditorView.cspNonce`).
   */
  nonce?: string;
}

/** True when an object has the exports the adapter needs. */
export function isCodeMirror6Modules(m: unknown): m is CodeMirror6Modules {
  const o = m as Partial<Record<keyof CodeMirror6Modules, Record<string, unknown>>> | null;
  return !!o && typeof o === 'object'
    && typeof o.state?.EditorState === 'function'
    && typeof o.view?.EditorView === 'function' && typeof o.view.keymap === 'object'
    && typeof o.commands?.history === 'function' && Array.isArray(o.commands.defaultKeymap) && Array.isArray(o.commands.historyKeymap)
    && typeof o.commands.undo === 'function' && typeof o.commands.redo === 'function'
    && typeof o.language?.syntaxHighlighting === 'function' && !!o.language.defaultHighlightStyle
    && !!o.markdown?.markdownLanguage;
}

/** One load per document and URL (several editors on a page share it). */
const loads = new WeakMap<object, Map<string, Promise<CodeMirror6Modules>>>();

/**
 * Load the pinned CodeMirror 6 bundle into a document: a `<script>` with the
 * pinned SRI integrity, appended to `<head>` once; resolves the bundle's
 * global. Rejects on a network or integrity failure, a timeout or a bundle
 * without the expected exports (a later call tries again).
 */
export function loadCodeMirror6(doc: EdDocument, options: { url?: string; timeoutMs?: number; nonce?: string } = {}): Promise<CodeMirror6Modules> {
  const url = options.url ?? CODEMIRROR6_URL;
  const win = doc.defaultView;
  const present = win?.[CODEMIRROR6_GLOBAL];
  if (isCodeMirror6Modules(present)) return Promise.resolve(present);
  let perDoc = loads.get(doc);
  if (!perDoc) loads.set(doc, (perDoc = new Map()));
  const cached = perDoc.get(url);
  if (cached) return cached;
  const p = new Promise<CodeMirror6Modules>((resolve, reject) => {
    if (!win || !doc.head) { reject(new Error('CodeMirror needs a document with a window')); return; }
    const script = doc.createElement('script') as EdScript;
    let timer: unknown = null;
    const done = (error: Error | null): void => {
      if (timer !== null) win.clearTimeout(timer);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
      if (error) { script.remove(); reject(error); return; }
      const g = win[CODEMIRROR6_GLOBAL];
      if (isCodeMirror6Modules(g)) resolve(g);
      else reject(new Error('The CodeMirror bundle did not provide the expected exports'));
    };
    const onLoad = (): void => done(null);
    const onError = (): void => done(new Error(`CodeMirror could not be loaded from ${url}`));
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    script.setAttribute('data-orz-editor', 'codemirror6');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.integrity = CODEMIRROR6_INTEGRITY;
    if (options.nonce) script.setAttribute('nonce', options.nonce);
    script.src = url;
    timer = win.setTimeout(() => done(new Error('CodeMirror took too long to load')), options.timeoutMs ?? CODEMIRROR6_TIMEOUT_MS);
    doc.head.append(script);
  });
  perDoc.set(url, p);
  p.catch(() => { if (perDoc!.get(url) === p) perDoc!.delete(url); });
  return p;
}

/** The editor's look: chrome tokens (inherited from the shell's :host). */
const THEME = {
  '&': { height: '100%', fontSize: 'var(--orz-editor-font-size, 14px)', backgroundColor: 'var(--orz-chrome-surface)', color: 'var(--orz-chrome-fg)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--orz-chrome-mono)', lineHeight: '1.6', overflow: 'auto' },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--orz-chrome-fg)' },
  '.cm-line': { padding: '0 16px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--orz-chrome-fg)' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in oklch, var(--orz-chrome-accent) 6%, transparent)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in oklch, var(--orz-chrome-accent) 26%, transparent)',
  },
  '.cm-panels': { backgroundColor: 'var(--orz-chrome-surface-2)', color: 'var(--orz-chrome-fg)' },
  // setFocusRange (2.4.0): the text outside the focus range, dimmed
  '.orz-focus-outside': { opacity: '0.38' },
  // the folded header (2.7.0, D-130): one closed line, and the bar over an opened one
  '.orz-header-fold': {
    display: 'flex', alignItems: 'center', gap: '6px', margin: '0', padding: '2px 16px 6px', minHeight: '30px', boxSizing: 'border-box',
    // (audit 1, H1) NO outer margin: CodeMirror's height map does not measure a block widget's margins, so one
    // would offset every line below it (clicks on the next line, scroll sync off by a fraction); the gap is padding
    cursor: 'pointer', userSelect: 'none', fontFamily: 'var(--orz-chrome-font)', fontSize: 'var(--orz-chrome-text-sm, 13px)',
    color: 'var(--orz-chrome-muted)', background: 'var(--orz-chrome-surface-2)', borderBottom: '1px solid var(--orz-chrome-border)',
  },
  '.orz-header-fold:hover': { color: 'var(--orz-chrome-fg)' },
  '.orz-header-fold__name': { fontWeight: '600', color: 'var(--orz-chrome-fg)', whiteSpace: 'nowrap' },
  '.orz-header-fold__title': { minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '.orz-header-fold__mark': { marginLeft: 'auto', paddingLeft: '8px' },
  // flash (2.4.0): the lines a tool just changed, lit briefly
  '.cm-line.orz-flash': { backgroundColor: 'color-mix(in oklch, var(--orz-chrome-flash, oklch(85% 0.16 90)) 42%, transparent)', animation: 'orz-flash-fade var(--orz-flash-ms, 1600ms) ease-in forwards' },
  '@keyframes orz-flash-fade': { '0%, 55%': { backgroundColor: 'color-mix(in oklch, var(--orz-chrome-flash, oklch(85% 0.16 90)) 42%, transparent)' }, '100%': { backgroundColor: 'transparent' } },
  // syntax (2.2.0): the chrome's syntax tokens, light and dark with the chrome's scheme (E.27)
  '.orz-tok-heading': { color: 'var(--orz-chrome-syntax-heading)', fontWeight: '700' },
  '.orz-tok-strong': { fontWeight: '700' },
  '.orz-tok-em': { fontStyle: 'italic' },
  '.orz-tok-strike': { textDecoration: 'line-through' },
  '.orz-tok-link': { color: 'var(--orz-chrome-syntax-link)' },
  '.orz-tok-url': { color: 'var(--orz-chrome-syntax-url)', textDecoration: 'underline' },
  '.orz-tok-code': { color: 'var(--orz-chrome-syntax-code)' },
  '.orz-tok-quote': { color: 'var(--orz-chrome-syntax-quote)' },
  '.orz-tok-comment': { color: 'var(--orz-chrome-syntax-comment)', fontStyle: 'italic' },
  '.orz-tok-label': { color: 'var(--orz-chrome-syntax-label)' },
  '.orz-tok-mark': { color: 'var(--orz-chrome-syntax-mark)' },
};

/** Lezer highlight tag names → the classes of {@link THEME} (a tag's own name first, then its parents'). */
const TAG_CLASSES: Readonly<Record<string, string>> = {
  heading: 'orz-tok-heading', heading1: 'orz-tok-heading', heading2: 'orz-tok-heading', heading3: 'orz-tok-heading',
  heading4: 'orz-tok-heading', heading5: 'orz-tok-heading', heading6: 'orz-tok-heading',
  strong: 'orz-tok-strong', emphasis: 'orz-tok-em', strikethrough: 'orz-tok-strike',
  link: 'orz-tok-link', url: 'orz-tok-url', monospace: 'orz-tok-code', quote: 'orz-tok-quote', comment: 'orz-tok-comment',
  labelName: 'orz-tok-label', string: 'orz-tok-label', meta: 'orz-tok-label', atom: 'orz-tok-label', keyword: 'orz-tok-label',
  processingInstruction: 'orz-tok-mark', contentSeparator: 'orz-tok-mark', character: 'orz-tok-mark', escape: 'orz-tok-mark',
};

/**
 * The editor's syntax highlighter (2.2.0): a CodeMirror `Highlighter` that
 * gives each Markdown token a class of {@link THEME}, whose colours are the
 * chrome's `--orz-chrome-syntax-*` tokens — so the editor's syntax follows the
 * chrome's light or dark scheme (`data-chrome`, `prefers-color-scheme`) with
 * no reconfiguration, at ≥ 4.5:1 on the editor background (E.27). It reads
 * the tag names `@lezer/highlight` sets on its `tags`; a tag without a known
 * name is not styled.
 */
export const ORZ_HIGHLIGHTER = {
  style(tags: readonly Any[]): string | null {
    const out = new Set<string>();
    for (const t of tags) {
      for (const p of (Array.isArray(t?.set) ? t.set : [t])) {
        const c = typeof p?.name === 'string' ? TAG_CLASSES[p.name] : undefined;
        if (c) { out.add(c); break; }
      }
    }
    return out.size ? [...out].join(' ') : null;
  },
};

/** CodeMirror 6 (markdown mode, line wrapping, history, search) behind the adapter interface. */
/**
 * Read-only in CodeMirror (claim E.22, FC-19 §5 invariant 7): the state is
 * read-only (no command or input edits it) and the content is not editable,
 * but it stays focusable (`tabindex="0"`) and selectable, so the reader can
 * select, copy and press Cmd/Ctrl+S in a read-only editor (2.2.0; before,
 * `editable: false` alone left nothing to focus).
 */
function readOnlyExtensions(m: CodeMirror6Modules, flag: boolean): Any[] {
  const { EditorState } = m.state;
  const { EditorView } = m.view;
  return [
    EditorState.readOnly.of(flag),
    EditorView.editable.of(!flag),
    ...(flag && EditorView.contentAttributes ? [EditorView.contentAttributes.of({ tabindex: '0', 'aria-readonly': 'true' })] : []),
  ];
}

/** A focus range as the adapter keeps it (offsets in the editor text). */
interface FocusValue { from: number; to: number; mode: FocusMode }

/**
 * The focus range of `setFocusRange` (2.4.0): a state field mapped through
 * every change (an insertion at its end grows it, one at its start stays
 * outside), drawing the text outside it dimmed (two mark decorations) or
 * folded away (whole lines replaced by nothing). Null when the modules lack
 * `StateField`, `StateEffect` or `Decoration` (an app's own CodeMirror build):
 * then everything stays shown.
 */
function focusExtension(m: CodeMirror6Modules): { effect: Any; field: Any; extension: Any[] } | null {
  const { StateField, StateEffect } = m.state;
  const { Decoration, EditorView } = m.view;
  if (typeof StateField?.define !== 'function' || typeof StateEffect?.define !== 'function' || typeof Decoration?.mark !== 'function' || !EditorView?.decorations) return null;
  const effect = StateEffect.define();
  const dim = Decoration.mark({ class: 'orz-focus-outside' });
  const fold = Decoration.replace({ block: true });
  type Field = { value: FocusValue | null; deco: Any };
  const decorate = (v: FocusValue | null, doc: Any): Any => {
    if (!v) return Decoration.none;
    const len: number = doc.length;
    const ranges: Any[] = [];
    if (v.mode === 'fold') {
      const first = doc.lineAt(v.from);
      const last = doc.lineAt(Math.max(v.from, v.to - (v.to > v.from ? 1 : 0)));
      if (first.number > 1) ranges.push(fold.range(0, doc.line(first.number - 1).to));
      if (last.number < doc.lines) ranges.push(fold.range(doc.line(last.number + 1).from, len));
    } else {
      if (v.from > 0) ranges.push(dim.range(0, v.from));
      if (v.to < len) ranges.push(dim.range(v.to, len));
    }
    return Decoration.set(ranges, true);
  };
  const field = StateField.define({
    create: (): Field => ({ value: null, deco: Decoration.none }),
    update(f: Field, tr: Any): Field {
      let value = f.value;
      let touched = false;
      if (value && tr.docChanged) {
        const from = tr.changes.mapPos(value.from, 1);
        value = { from, to: Math.max(from, tr.changes.mapPos(value.to, 1)), mode: value.mode };
        touched = true;
      }
      for (const e of tr.effects) if (e.is(effect)) { value = e.value; touched = true; }
      if (!touched) return f;
      if (value) {
        const len: number = tr.newDoc.length;
        const from = Math.max(0, Math.min(len, value.from));
        value = { from, to: Math.max(from, Math.min(len, value.to)), mode: value.mode };
      }
      return { value, deco: decorate(value, tr.newDoc) };
    },
    provide: (f: Any) => EditorView.decorations.from(f, (v: Field) => v.deco),
  });
  return { effect, field, extension: [field] };
}

/**
 * The flash of `flash` (2.4.0): a state field of line decorations (`orz-flash`) over the lines the
 * ranges touch, mapped through later changes, cleared by an effect. Null without the decoration API.
 */
function flashExtension(m: CodeMirror6Modules): { effect: Any; field: Any; extension: Any[] } | null {
  const { StateField, StateEffect } = m.state;
  const { Decoration, EditorView } = m.view;
  if (typeof StateField?.define !== 'function' || typeof StateEffect?.define !== 'function' || typeof Decoration?.line !== 'function' || !EditorView?.decorations) return null;
  const effect = StateEffect.define();
  const line = Decoration.line({ class: 'orz-flash' });
  const field = StateField.define({
    create: (): Any => Decoration.none,
    update(deco: Any, tr: Any): Any {
      let d = tr.docChanged ? deco.map(tr.changes) : deco;
      for (const e of tr.effects) {
        if (!e.is(effect)) continue;
        const ranges = e.value as Selection[] | null;
        if (!ranges) { d = Decoration.none; continue; }
        const doc = tr.state.doc;
        const starts = new Set<number>();
        for (const r of ranges) {
          const len: number = doc.length;
          const a = Math.max(0, Math.min(len, Math.min(r.from, r.to)));
          const b = Math.max(a, Math.min(len, Math.max(r.from, r.to)));
          const first = doc.lineAt(a).number;
          // a range that ends at a line start does not touch that line (a whole-line edit)
          const last = b > a && doc.lineAt(b).from === b ? doc.lineAt(b).number - 1 : doc.lineAt(b).number;
          for (let n = first; n <= Math.max(first, last) && starts.size < 2000; n++) starts.add(doc.line(n).from);
        }
        d = Decoration.set([...starts].sort((x, y) => x - y).map((p) => line.range(p)));
      }
      return d;
    },
    provide: (f: Any) => EditorView.decorations.from(f),
  });
  return { effect, field, extension: [field] };
}

type HeaderFoldExt = {
  effect: Any; field: Any; extension: Any[];
  inside(at: { from: number; to: number }, sel: Any): boolean;
  outside(at: { from: number; to: number }, sel: Any, len: number): { anchor: number; head: number };
};

/** How much of the text the header is looked for in (a header longer than this is not folded). */
const HEADER_PROBE = 65_536;

/** The folded header as the field keeps it: the header, the lines it covers, and whether the reader opened it. */
interface HeaderFoldValue {
  /** Null: no header (or one that does not end its line). */
  at: { from: number; to: number; title: string } | null;
  open: boolean;
  deco: Any;
}

/**
 * (2.7.0, STATUS D-130) The document header folded to one closed line —
 * "Document settings · <title> ▸" — that opens on a click, or when the caret
 * moves into it (a click above it, Ctrl+Home, the up arrow, a search match,
 * `select`, `reveal`, an undo there); an opened header has a bar above it
 * that folds it again. Nothing in the text changes: the header's lines are a
 * block replaced by a widget while closed. Lines from the start of the
 * header's first line to the end of its `}}` line; a header whose `}}` line
 * holds more text, or longer than {@link HEADER_PROBE}, is not folded. While
 * a `setFocusRange` fold hides the header's lines, nothing more is drawn.
 * Null without `StateField`, `StateEffect`, `Decoration` or `WidgetType`.
 */
function headerFoldExtension(m: CodeMirror6Modules, find: (text: string) => HeaderFoldInfo | null, focusField: Any): HeaderFoldExt | null {
  const { StateField, StateEffect } = m.state;
  const { Decoration, EditorView, WidgetType } = m.view;
  if (typeof StateField?.define !== 'function' || typeof StateEffect?.define !== 'function' || typeof Decoration?.replace !== 'function' || typeof WidgetType !== 'function' || !EditorView?.decorations) return null;
  const effect = StateEffect.define();
  const locate = (doc: Any): HeaderFoldValue['at'] => {
    let info: HeaderFoldInfo | null = null;
    try { info = find(doc.sliceString(0, Math.min(doc.length, HEADER_PROBE))); } catch { info = null; }
    if (!info || !(info.to > info.from) || info.to > doc.length) return null;
    const first = doc.lineAt(info.from);
    const last = doc.lineAt(info.to);
    if (doc.sliceString(info.to, last.to).trim() !== '') return null; // more text on the }} line: not folded
    return { from: first.from, to: last.to, title: String(info.title ?? '').replace(/\s+/g, ' ').trim() };
  };
  /** The selection's head inside the folded lines (both ends count: typing there would change the header). */
  // (audit 2, HIGH) a range is in the header when its head is in [from, to] OR its anchor in (from, to]: a selection
  // anchored inside the hidden lines would otherwise let one key delete settings the reader cannot see. A range
  // anchored at the header's very start (select-all) is the whole header, visibly selected: not "inside".
  const inside = (at: NonNullable<HeaderFoldValue['at']>, sel: Any): boolean => sel.ranges.some((r: Any) => (r.head >= at.from && r.head <= at.to) || (r.anchor > at.from && r.anchor <= at.to));
  /** The selection with no end in the header: an end inside goes to the first offset after it. */
  const outside = (at: NonNullable<HeaderFoldValue['at']>, sel: Any, len: number): { anchor: number; head: number } => {
    const after = Math.min(len, at.to + 1);
    const r = sel.main;
    const fix = (n: number): number => (n >= at.from && n <= at.to ? after : n);
    return { anchor: fix(r.anchor), head: fix(r.head) };
  };
  class FoldLine extends (WidgetType as { new(): object }) {
    constructor(readonly title: string, readonly open: boolean) { super(); }
    eq(other: FoldLine): boolean { return other.title === this.title && other.open === this.open; }
    toDOM(view: Any): Any {
      const d = view.dom.ownerDocument;
      const line = d.createElement('div');
      line.className = 'orz-header-fold';
      line.setAttribute('data-orz-header-fold', this.open ? 'open' : 'closed');
      line.setAttribute('role', 'button');
      line.setAttribute('aria-expanded', String(this.open));
      line.setAttribute('aria-label', this.open ? 'Fold the document settings' : `Document settings${this.title ? `: ${this.title}` : ''}. Open them to edit.`);
      line.title = this.open ? 'Fold the document settings into one line' : 'Open the document settings (the {{nyml}} header) to edit them';
      const name = d.createElement('span');
      name.className = 'orz-header-fold__name';
      name.textContent = 'Document settings';
      line.append(name);
      if (this.title && !this.open) {
        const t = d.createElement('span');
        t.className = 'orz-header-fold__title';
        t.textContent = `· ${this.title}`;
        line.append(t);
      }
      const mark = d.createElement('span');
      mark.className = 'orz-header-fold__mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = this.open ? '▾' : '▸';
      line.append(mark);
      const open = this.open;
      // the editor ignores events in the widget (ignoreEvent): the pointer press moves no caret, and the click acts
      // (audit 1, L1: a role="button" activated by assistive technology sends a click alone)
      line.addEventListener('mousedown', (e: Any) => { if (e.button === 0) e.preventDefault(); });
      line.addEventListener('click', (e: Any) => {
        // (audit 2) the second click of a double-click does not fold at once what the first opened
        if (e.button !== 0 || e.detail > 1) return;
        e.preventDefault();
        const v = view.state.field(field, false) as HeaderFoldValue | undefined;
        const at = v?.at;
        if (!at) return;
        if (open) {
          // fold again: a caret inside goes after the header, so the header stays closed
          const sel = view.state.selection;
          view.dispatch({ effects: effect.of(false), ...(inside(at, sel) ? { selection: outside(at, sel, view.state.doc.length) } : {}) });
        } else {
          // open, the caret on the first setting (the line after {{nyml)
          const doc = view.state.doc;
          const firstLine = doc.lineAt(at.from);
          const caret = firstLine.number < doc.lines && doc.line(firstLine.number + 1).from <= at.to ? doc.line(firstLine.number + 1).to : at.from;
          view.dispatch({ effects: effect.of(true), selection: { anchor: caret } });
        }
        view.focus();
      });
      return line;
    }
    ignoreEvent(): boolean { return true; }
  }
  const draw = (at: HeaderFoldValue['at'], open: boolean): Any => {
    if (!at) return Decoration.none;
    if (open) return Decoration.set([Decoration.widget({ widget: new FoldLine(at.title, true), block: true, side: -1 }).range(at.from)]);
    return Decoration.set([Decoration.replace({ widget: new FoldLine(at.title, false), block: true }).range(at.from, at.to)]);
  };
  const field = StateField.define({
    create: (state: Any): HeaderFoldValue => {
      const at = locate(state.doc);
      return { at, open: false, deco: draw(at, false) };
    },
    update(v: HeaderFoldValue, tr: Any): HeaderFoldValue {
      let at = v.at;
      let open = v.open;
      let changed = false;
      if (tr.docChanged) {
        const reach = at ? at.to + 1 : Math.min(tr.startState.doc.length, HEADER_PROBE);
        if (tr.changes.touchesRange(0, reach)) at = locate(tr.newDoc);
        else if (at) at = { from: tr.changes.mapPos(at.from), to: tr.changes.mapPos(at.to), title: at.title };
        changed = true;
      }
      // the caret moved into the closed header: it opens (the reader sees what they edit)
      if (at && !open && tr.selection && inside(at, tr.newSelection)) { open = true; changed = true; }
      for (const e of tr.effects) if (e.is(effect)) { open = e.value === true; changed = true; }
      if (!at) open = false;
      if (!changed) return v;
      if (v.at && at && v.open === open && v.at.from === at.from && v.at.to === at.to && v.at.title === at.title) return { at, open, deco: v.deco.map(tr.changes) };
      return { at, open, deco: draw(at, open) };
    },
  });
  // a focus fold (setFocusRange 'fold') that hides the header's lines leaves nothing to draw
  const decorations = EditorView.decorations.compute([field, ...(focusField ? [focusField] : [])], (state: Any) => {
    const v = state.field(field) as HeaderFoldValue;
    const f = focusField ? (state.field(focusField, false) as { value: FocusValue | null } | undefined)?.value : null;
    if (v.at && f && f.mode === 'fold' && state.doc.lineAt(f.from).from > v.at.from) return Decoration.none;
    return v.deco;
  });
  // (audit 1, M2) the closed header is one atomic piece: the caret steps over it as a whole, a selection never ends
  // inside it; and a selection that covered it (select-all) is not cut back to the line after it by the browser's
  // read-back of the DOM selection (the widget cannot hold a DOM caret before it)
  const atomic = EditorView.atomicRanges ? [EditorView.atomicRanges.of((view: Any) => {
    const v = view.state.field(field, false) as HeaderFoldValue | undefined;
    return v?.at && !v.open ? v.deco : Decoration.none;
  })] : [];
  const { EditorState } = m.state;
  const keepCover = EditorState?.transactionFilter ? [EditorState.transactionFilter.of((tr: Any) => {
    if (tr.docChanged || !tr.selection || tr.effects.length) return tr;
    const v = tr.startState.field(field, false) as HeaderFoldValue | undefined;
    if (!v?.at || v.open) return tr;
    const s0 = tr.startState.selection.main;
    const s1 = tr.newSelection.main;
    const doc = tr.startState.doc;
    const after = v.at.to < doc.length ? v.at.to + 1 : v.at.to;
    // the old selection covered the header; the new one is the same but starts just after the header
    if (s0.from <= v.at.from && !s0.empty && !s1.empty && s1.to === s0.to && s1.from >= v.at.to && s1.from <= after && tr.newSelection.ranges.length === 1) {
      return [tr, { selection: tr.startState.selection, sequential: true }];
    }
    return tr;
  })] : [];
  // (audit 2, HIGH) the rule: no single key may delete header text the reader did not select. While the header is
  // closed, a reader's edit (typing, delete, paste, a drop, a replace) that would change its hidden text is refused
  // unless a selection covered the whole header (select-all: the closed line shows selected); instead the header
  // opens, so the reader sees what the next key would change. Edits from code (setText, setHeader, applyEdits) and
  // undo/redo pass.
  const guard = EditorState?.transactionFilter ? [EditorState.transactionFilter.of((tr: Any) => {
    if (!tr.docChanged) return tr;
    if (!(tr.isUserEvent('input') || tr.isUserEvent('delete') || tr.isUserEvent('move'))) return tr;
    const v = tr.startState.field(field, false) as HeaderFoldValue | undefined;
    if (!v?.at || v.open) return tr;
    const { from, to } = v.at;
    let hits = false;
    tr.changes.iterChangedRanges((fA: number, tA: number) => { if (fA < to && tA > from) hits = true; });
    if (!hits) return tr;
    if (tr.startState.selection.ranges.some((r: Any) => r.from <= from && r.to >= to)) return tr;
    return { effects: effect.of(true), scrollIntoView: true };
  })] : [];
  return { effect, field, inside, outside, extension: [field, decorations, ...atomic, ...keepCover, ...guard] };
}

/** What the editing surface announces about leaving it (D-129, WCAG 2.1.2). */
export const ESC_TAB_HINT = 'Tab indents. Press Esc, then Tab, to leave the text.';

/** A line that is only a list item's marker (in its indent and quote prefix): what a list continuation writes. */
const CONTINUED_ITEM = /^((?:[ \t]*>)*[ \t]*)(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?$/;
/** A list marker typed by the reader. */
const TYPED_MARKER = /^(?:[-*+]|\d{1,9}[.)])$/;

export function codemirror6Adapter(options: CodeMirror6Options = {}): TextEditorAdapter {
  let fallback: TextEditorAdapter | null = textareaAdapter();
  let view: Any = null;
  let cm: CodeMirror6Modules | null = null;
  let extensions: Any[] = [];
  let destroyed = false;
  let readyPromise: Promise<{ engine: string; error?: unknown }> = Promise.resolve({ engine: 'textarea' });
  let scrollOff: (() => void) | null = null;
  let mountOptions: AdapterMountOptions | null = null;
  /** Read-only now (mount option, then `setReadOnly`); a Compartment switches it in CodeMirror at run time. */
  let readOnlyNow = false;
  let roCompartment: Any = null;
  /** The focus range (2.4.0): its CodeMirror field, and the range asked for before CodeMirror arrived. */
  let focus: { effect: Any; field: Any; extension: Any[] } | null = null;
  let pendingFocus: FocusValue | null = null;
  /** The flash (2.4.0): its CodeMirror field and the timer that clears it. */
  let flashExt: { effect: Any; field: Any; extension: Any[] } | null = null;
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  /** The folded header (2.7.0, D-130): its CodeMirror field, when the shell asked for it and the modules can. */
  let headerExt: HeaderFoldExt | null = null;

  /** (D-95) The line a list continuation just started (its start, the marker it wrote), while the caret stays on it. */
  let continued: { from: number; marker: string } | null = null;
  const noteContinuation = (state: Any): void => {
    const sel = state.selection.main;
    const line = sel.empty ? state.doc.lineAt(sel.head) : null;
    continued = line && sel.head === line.to && CONTINUED_ITEM.test(line.text) ? { from: line.from, marker: line.text } : null;
  };
  /** The space after a marker the reader typed on a continued line: their marker replaces the continued one. */
  const ownMarker = (v: Any, from: number, to: number, text: string): boolean => {
    const c = continued;
    if (!c || text !== ' ' || from !== to || readOnlyNow) return false;
    const line = v.state.doc.lineAt(from);
    if (line.from !== c.from || from !== line.to || !line.text.startsWith(c.marker)) return false;
    const typed = line.text.slice(c.marker.length);
    if (!TYPED_MARKER.test(typed)) return false;
    const start = line.from + (CONTINUED_ITEM.exec(c.marker)?.[1].length ?? 0);
    continued = null;
    v.dispatch({ changes: { from: start, to: line.to, insert: `${typed} ` }, selection: { anchor: start + typed.length + 1 }, userEvent: 'input.type' });
    return true;
  };

  const build = (m: CodeMirror6Modules, o: AdapterMountOptions): Any[] => {
    const { EditorState } = m.state;
    const { EditorView, keymap } = m.view;
    const c = m.commands;
    const l = m.language;
    const ro = readOnlyNow;
    const roExtensions = (flag: boolean): Any[] => readOnlyExtensions(m, flag);
    roCompartment = m.state.Compartment ? new m.state.Compartment() : null;
    focus = focusExtension(m);
    flashExt = flashExtension(m);
    headerExt = o.headerFold ? headerFoldExtension(m, o.headerFold, focus?.field ?? null) : null;
    // (2.5.0, STATUS D-95) Enter continues a list ("- "); a reader who then types a marker of their
    // own ("- pears") gets one marker, not "- - pears": theirs replaces the continued one when they type
    // the space after it. Only right after the continuation, on that line, with nothing else typed.
    const continueEnter = (b: Any): Any => (b && b.key === 'Enter' && typeof b.run === 'function'
      ? { ...b, run: (v: Any) => { const ok = b.run(v); if (ok) noteContinuation(v.state); return ok; } }
      : b);
    const keys = [...(m.markdown.markdownKeymap ?? []).map(continueEnter), ...c.defaultKeymap, ...c.historyKeymap, ...(m.search?.searchKeymap ?? []), ...(c.indentWithTab ? [c.indentWithTab] : [])];
    return [
      m.view.highlightSpecialChars?.(),
      c.history(),
      m.view.drawSelection?.(),
      m.view.dropCursor?.(),
      l.indentOnInput?.(),
      l.bracketMatching?.(),
      l.syntaxHighlighting(ORZ_HIGHLIGHTER),
      l.LanguageSupport ? new l.LanguageSupport(m.markdown.markdownLanguage) : m.markdown.markdownLanguage,
      m.view.highlightActiveLine?.(),
      m.search?.highlightSelectionMatches?.(),
      EditorView.lineWrapping,
      keymap.of(keys),
      roCompartment ? roCompartment.of(roExtensions(ro)) : roExtensions(ro),
      // (audit 1, L2; WCAG 2.1.2) the way out of the text is announced: Tab indents here
      EditorView.contentAttributes.of({ 'aria-label': o.label ?? 'Document text', 'aria-multiline': 'true', 'aria-description': ESC_TAB_HINT }),
      EditorView.theme(THEME),
      ...(focus ? focus.extension : []),
      ...(flashExt ? flashExt.extension : []),
      ...(headerExt ? headerExt.extension : []),
      options.nonce && EditorView.cspNonce ? EditorView.cspNonce.of(options.nonce) : undefined,
      EditorView.inputHandler ? EditorView.inputHandler.of((v: Any, from: number, to: number, text: string) => ownMarker(v, from, to, text)) : undefined,
      EditorView.updateListener.of((u: Any) => {
        if (continued && (u.docChanged || u.selectionSet)) {
          // the continued line stays the one the caret is on, or the chance is gone
          const from = u.docChanged ? u.changes.mapPos(continued.from, -1) : continued.from;
          const head = u.state.selection.main;
          continued = head.empty && u.state.doc.lineAt(head.head).from === from ? { from, marker: continued.marker } : null;
        }
        if (u.docChanged) o.onChange();
        if (u.selectionSet && o.onSelection) {
          const r = u.state.selection.main;
          o.onSelection({ from: r.from, to: r.to });
        }
      }),
    ].filter((x) => x !== undefined && x !== null);
  };

  const upgrade = (m: CodeMirror6Modules, el: EdElement, o: AdapterMountOptions): void => {
    const f = fallback!;
    // the textarea's CURRENT text (typed or set while CodeMirror loaded), its selection, focus, scroll and undo steps:
    // its live value first (a change whose input event has not run yet is one more step, reported to the shell; E.21)
    syncTextarea(f);
    const doc = f.getDoc();
    const history = undoSteps(f, CODEMIRROR6_HISTORY_STEPS) ?? { base: doc, changes: [] };
    let sel = f.getSelection?.() ?? { from: 0, to: 0 };
    const focused = f.hasFocus?.() ?? false;
    const scroll = f.getScroll?.();
    cm = m;
    extensions = build(m, o);
    const { EditorState } = m.state;
    const iso = m.commands.isolateHistory;
    // Seed CodeMirror's history with the textarea's newest steps (A-6, MED cost-2): start from the
    // text that many undos back and apply each step's change as its own isolated, undoable change
    // (CodeMirror's text is a rope: no whole-text copy per step). Built before the textarea goes,
    // so a failure here leaves the textarea in place.
    let state = EditorState.create({ doc: history.base, extensions });
    for (const change of history.changes) state = state.update({ changes: change, ...(iso ? { annotations: iso.of('full') } : {}) }).state;
    // the replay must end at the textarea's text; if it does not, start from that text without history
    if (state.doc.length !== doc.length || state.doc.toString() !== doc) state = EditorState.create({ doc, extensions });
    const len = doc.length;
    const clamp = (n: number): number => Math.max(0, Math.min(len, n));
    // (D-130) a caret still at the very start, before a folded header, starts after it: typing there would go into
    // the header the reader does not see
    const folded = headerExt ? (state.field(headerExt.field, false) as HeaderFoldValue | undefined)?.at : null;
    if (folded && sel.from === 0 && sel.to === 0 && folded.from === 0) sel = { from: Math.min(len, folded.to + 1), to: Math.min(len, folded.to + 1) };
    state = state.update({ selection: { anchor: clamp(sel.from), head: clamp(sel.to) } }).state;
    f.destroy();
    fallback = null;
    // E.23: CodeMirror reads a pending DOM change on every scroll of the editor or a scroll parent
    // WITHOUT re-reading the DOM selection (DOMObserver.onScroll → flush(false)). Chrome can
    // dispatch the scroll that reveals the caret after a keystroke's text is in the DOM but before
    // CodeMirror's mutation observer has run (seen under load): the change is then applied with the
    // caret from before the key, the caret stays behind the character and every later key is typed
    // in front of it ("Second line" → "Seond linec"). So a scroll with a DOM change pending first
    // flushes it with the live selection; CodeMirror's own flush then finds nothing. Registered
    // before the view exists, so it runs before CodeMirror's listeners: capture on the shadow root
    // for the editor's own scrollers, and on the window (first listener there) for the page's.
    // `observer.flush` / `pendingRecords` are internals of the pinned bundle (E.11, E.23).
    const flushFirst = (): void => {
      const obs = view?.observer;
      if (!obs || typeof obs.flush !== 'function' || typeof obs.pendingRecords !== 'function') return;
      try { if (obs.pendingRecords().length > 0) obs.flush(true); } catch { /* CodeMirror's own handler runs next */ }
    };
    const captureRoots: Array<{ addEventListener: Any; removeEventListener: Any }> = [];
    const shadow = o.root as Any;
    if (shadow && typeof shadow.addEventListener === 'function') captureRoots.push(shadow);
    const win = el.ownerDocument?.defaultView as Any;
    if (win && typeof win.addEventListener === 'function') captureRoots.push(win);
    for (const t of captureRoots) t.addEventListener('scroll', flushFirst, { capture: true, passive: true });
    const flushOff = (): void => { for (const t of captureRoots) t.removeEventListener('scroll', flushFirst, { capture: true }); };
    try {
      view = new m.view.EditorView({ state, parent: el, ...(o.root ? { root: o.root } : {}) });
    } catch (error) {
      flushOff();
      throw error;
    }
    const onScroll = (): void => o.onScroll?.();
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });
    // (audit 1, M1; D-129) EVERY Escape starts CodeMirror's Tab-focus window — also one its keymap consumes
    // (a selection simplified, the search panel closed), which never reaches the handler that starts it: so
    // Esc then Tab always leaves the text. Capture on the editor's root element: its panels too.
    const onEscape = (e: Any): void => {
      if (e.key !== 'Escape' || e.isComposing) return;
      const v = view;
      if (!v || typeof v.setTabFocusMode !== 'function') return;
      try { v.setTabFocusMode(2000); } catch { /* an older CodeMirror: its own Escape handling */ }
    };
    view.dom.addEventListener('keydown', onEscape, true);
    scrollOff = () => {
      view?.scrollDOM.removeEventListener('scroll', onScroll);
      view?.dom.removeEventListener('keydown', onEscape, true);
      flushOff();
    };
    if (scroll) adapter.scrollTo!({ fraction: scroll.fraction });
    if (focused) view.focus();
    // a focus range asked for while the textarea showed (clamped to the text)
    if (pendingFocus && focus) {
      const len: number = view.state.doc.length;
      const from = Math.max(0, Math.min(len, pendingFocus.from));
      view.dispatch({ effects: focus.effect.of({ from, to: Math.max(from, Math.min(len, pendingFocus.to)), mode: pendingFocus.mode }) });
    }
    pendingFocus = null;
  };

  /** Where the document's top lies in the scroller's content (its top padding), for the height map's offsets. */
  const docOffset = (): number => {
    try {
      const sd = view.scrollDOM;
      const o = view.documentTop - sd.getBoundingClientRect().top + sd.scrollTop;
      return Number.isFinite(o) ? Math.max(0, o) : 0;
    } catch { return 0; }
  };
  const adapter: TextEditorAdapter = {
    get name() { return view ? 'codemirror6' : 'textarea'; },
    mount(el, o) {
      mountOptions = o;
      readOnlyNow = o.readOnly === true;
      fallback!.mount(el, o);
      const doc = el.ownerDocument;
      readyPromise = (async () => {
        let m: CodeMirror6Modules;
        try {
          const got = options.loadModules ? await options.loadModules() : await loadCodeMirror6(doc!, { url: options.url, timeoutMs: options.timeoutMs, nonce: options.nonce });
          if (!isCodeMirror6Modules(got)) throw new Error('loadModules did not provide the CodeMirror 6 exports the editor needs');
          m = got;
        } catch (error) {
          return { engine: 'textarea', error };
        }
        if (destroyed) return { engine: 'none' };
        try {
          upgrade(m, el, o);
        } catch (error) {
          return { engine: fallback ? 'textarea' : 'none', error };
        }
        return { engine: 'codemirror6' };
      })();
    },
    getDoc() {
      return view ? view.state.doc.toString() : fallback?.getDoc() ?? '';
    },
    setDoc(text, o) {
      if (!view) { fallback?.setDoc(text, o); return; }
      const current = view.state.doc.toString();
      const change = minimalChange(current, text);
      if (o?.resetHistory) {
        const sel = view.state.selection.main;
        const map = (p: number): number => {
          if (!change) return p;
          const delta = change.insert.length - (change.to - change.from);
          return p <= change.from ? p : p >= change.to ? p + delta : change.from + change.insert.length;
        };
        view.setState(cm!.state.EditorState.create({ doc: text, extensions, selection: { anchor: map(sel.anchor), head: map(sel.head) } }));
        // setState is not an update: report it like one
        mountOptions?.onChange();
        return;
      }
      if (!change) return;
      const iso = cm!.commands.isolateHistory;
      view.dispatch({ changes: change, ...(iso ? { annotations: iso.of('full') } : {}) });
    },
    focus() {
      if (view) view.focus(); else fallback?.focus();
    },
    destroy() {
      destroyed = true;
      scrollOff?.();
      scrollOff = null;
      view?.destroy();
      view = null;
      fallback?.destroy();
      fallback = null;
      mountOptions = null;
    },
    getSelection(): Selection {
      if (!view) return fallback?.getSelection?.() ?? { from: 0, to: 0 };
      const r = view.state.selection.main;
      return { from: r.from, to: r.to };
    },
    setReadOnly(flag) {
      readOnlyNow = flag;
      if (!view) { fallback?.setReadOnly?.(flag); return; }
      const { EditorState } = cm!.state;
      const ext = readOnlyExtensions(cm!, flag);
      if (roCompartment) { view.dispatch({ effects: roCompartment.reconfigure(ext) }); return; }
      // modules without Compartment: rebuild the state (text and selection kept; the history starts over)
      extensions = build(cm!, mountOptions ?? { doc: '', onChange() {} });
      const sel = view.state.selection.main;
      view.setState(EditorState.create({ doc: view.state.doc.toString(), extensions, selection: { anchor: sel.anchor, head: sel.head } }));
    },
    setSelection(s, o) {
      if (!view) { fallback?.setSelection?.(s, o); return; }
      const len: number = view.state.doc.length;
      const clamp = (n: number): number => Math.max(0, Math.min(len, n));
      view.dispatch({ selection: { anchor: clamp(s.from), head: clamp(s.to) }, scrollIntoView: o?.scroll !== false });
    },
    applyChanges(changes) {
      if (!view) { fallback?.applyChanges?.(changes); return; }
      const list = changes.filter((c) => c.from !== c.to || c.insert !== '');
      if (list.length === 0) return;
      const iso = cm!.commands.isolateHistory;
      // one transaction = one undoable step; the selection maps through every change
      view.dispatch({ changes: list.map((c) => ({ from: c.from, to: c.to, insert: c.insert })), ...(iso ? { annotations: iso.of('full') } : {}) });
    },
    setFocusRange(range, o) {
      const value: FocusValue | null = range ? { from: Math.min(range.from, range.to), to: Math.max(range.from, range.to), mode: o?.mode === 'fold' ? 'fold' : 'dim' } : null;
      if (!view) { pendingFocus = value; return; }
      if (!focus) return; // modules without the decoration API: everything stays shown
      view.dispatch({ effects: focus.effect.of(value) });
    },
    flash(ranges, o) {
      if (!view || !flashExt) return; // the textarea (and a build without the decoration API): nothing lights up
      if (flashTimer !== null) clearTimeout(flashTimer);
      const ms = typeof o?.ms === 'number' && o.ms > 0 ? Math.min(10_000, o.ms) : 1600;
      view.dom?.style?.setProperty?.('--orz-flash-ms', `${ms}ms`);
      view.dispatch({ effects: flashExt.effect.of(ranges.map((r) => ({ from: r.from, to: r.to }))) });
      const ext = flashExt;
      flashTimer = setTimeout(() => { flashTimer = null; if (view && ext) view.dispatch({ effects: ext.effect.of(null) }); }, ms);
    },
    reveal(s, o) {
      if (!view) {
        fallback?.setSelection?.(o?.select ? s : { from: s.from, to: s.from }, { scroll: false });
        const before = (fallback?.getDoc() ?? '').slice(0, Math.max(0, s.from));
        let line = 0;
        for (let i = before.indexOf('\n'); i >= 0; i = before.indexOf('\n', i + 1)) line++;
        fallback?.scrollTo?.({ line });
        return;
      }
      const len: number = view.state.doc.length;
      const clamp = (n: number): number => Math.max(0, Math.min(len, n));
      const from = clamp(Math.min(s.from, s.to));
      const to = clamp(Math.max(s.from, s.to));
      const { EditorView } = cm!.view;
      // the range's first line at the top of the view (a heading above its section), not merely in view
      view.dispatch({
        selection: { anchor: from, head: o?.select ? to : from },
        ...(typeof EditorView.scrollIntoView === 'function' ? { effects: EditorView.scrollIntoView(from, { y: 'start', yMargin: 8 }) } : { scrollIntoView: true }),
      });
    },
    setHeaderFolded(flag) {
      if (!view || !headerExt) return;
      const v = view.state.field(headerExt.field, false) as HeaderFoldValue | undefined;
      if (!v?.at || v.open === !flag) return;
      // folding with an end of the selection inside moves that end after the header (audit 2: the anchor too)
      view.dispatch({ effects: headerExt.effect.of(!flag), ...(flag && headerExt.inside(v.at, view.state.selection) ? { selection: headerExt.outside(v.at, view.state.selection, view.state.doc.length) } : {}) });
    },
    isHeaderFolded() {
      if (!view || !headerExt) return false;
      const v = view.state.field(headerExt.field, false) as HeaderFoldValue | undefined;
      return !!v?.at && !v.open;
    },
    hasFocus() {
      return view ? view.hasFocus === true : fallback?.hasFocus?.() ?? false;
    },
    undo() {
      return view ? cm!.commands.undo(view) === true : fallback?.undo?.() ?? false;
    },
    redo() {
      return view ? cm!.commands.redo(view) === true : fallback?.redo?.() ?? false;
    },
    getScroll(): ScrollPosition {
      if (!view) return fallback?.getScroll?.() ?? { line: 0, fraction: 0 };
      const sd = view.scrollDOM;
      const top: number = sd.scrollTop;
      const max = Math.max(0, sd.scrollHeight - sd.clientHeight);
      // (audit 1, H1) heights are from the document's top, which lies below the content's padding
      const block = view.lineBlockAtHeight(Math.max(0, top - docOffset()));
      const line = view.state.doc.lineAt(block.from).number - 1;
      const within = block.height > 0 ? Math.max(0, Math.min(1, (top - docOffset() - block.top) / block.height)) : 0;
      return { line: line + within, fraction: max > 0 ? Math.min(1, top / max) : 0 };
    },
    scrollTo(target) {
      if (!view) { fallback?.scrollTo?.(target); return; }
      const sd = view.scrollDOM;
      if (typeof target.line === 'number' && Number.isFinite(target.line)) {
        const d = view.state.doc;
        const n = Math.max(0, Math.min(d.lines - 1, Math.floor(target.line)));
        const block = view.lineBlockAt(d.line(n + 1).from);
        const y = block.top + Math.max(0, Math.min(1, target.line - n)) * block.height;
        // the first line at the top shows the padding above it too (scrollTop 0)
        sd.scrollTop = y <= 0 ? 0 : docOffset() + y;
      } else if (typeof target.fraction === 'number' && Number.isFinite(target.fraction)) {
        sd.scrollTop = Math.max(0, Math.min(1, target.fraction)) * Math.max(0, sd.scrollHeight - sd.clientHeight);
      }
    },
    ready: () => readyPromise,
  };
  return adapter;
}
