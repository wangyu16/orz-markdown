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
 * as a `<textarea>` and upgrades in place (text, selection and focus carried
 * over). When CodeMirror cannot load (offline, blocked, wrong bytes), the
 * textarea stays and `ready()` reports the error.
 */
import { VERSION } from '../../version.js';
import { CODEMIRROR6_GLOBAL, CODEMIRROR6_INTEGRITY, CODEMIRROR6_PATH } from './codemirror-pin.js';
import { textareaAdapter, type AdapterMountOptions, type ScrollPosition, type Selection, type TextEditorAdapter } from './adapter.js';
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
  state: { EditorState: Any; Compartment?: Any; EditorSelection?: Any };
  view: { EditorView: Any; keymap: Any; drawSelection?: Any; highlightActiveLine?: Any; highlightSpecialChars?: Any; dropCursor?: Any };
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
export function loadCodeMirror6(doc: EdDocument, options: { url?: string; timeoutMs?: number } = {}): Promise<CodeMirror6Modules> {
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
};

/** CodeMirror 6 (markdown mode, line wrapping, history, search) behind the adapter interface. */
export function codemirror6Adapter(options: CodeMirror6Options = {}): TextEditorAdapter {
  let fallback: TextEditorAdapter | null = textareaAdapter();
  let view: Any = null;
  let cm: CodeMirror6Modules | null = null;
  let extensions: Any[] = [];
  let destroyed = false;
  let readyPromise: Promise<{ engine: string; error?: unknown }> = Promise.resolve({ engine: 'textarea' });
  let scrollOff: (() => void) | null = null;
  let mountOptions: AdapterMountOptions | null = null;

  const build = (m: CodeMirror6Modules, o: AdapterMountOptions): Any[] => {
    const { EditorState } = m.state;
    const { EditorView, keymap } = m.view;
    const c = m.commands;
    const l = m.language;
    const ro = o.readOnly === true;
    const keys = [...(m.markdown.markdownKeymap ?? []), ...c.defaultKeymap, ...c.historyKeymap, ...(m.search?.searchKeymap ?? []), ...(c.indentWithTab ? [c.indentWithTab] : [])];
    return [
      m.view.highlightSpecialChars?.(),
      c.history(),
      m.view.drawSelection?.(),
      m.view.dropCursor?.(),
      l.indentOnInput?.(),
      l.bracketMatching?.(),
      l.syntaxHighlighting(l.defaultHighlightStyle, { fallback: true }),
      l.LanguageSupport ? new l.LanguageSupport(m.markdown.markdownLanguage) : m.markdown.markdownLanguage,
      m.view.highlightActiveLine?.(),
      m.search?.highlightSelectionMatches?.(),
      EditorView.lineWrapping,
      keymap.of(keys),
      EditorState.readOnly.of(ro),
      EditorView.editable.of(!ro),
      EditorView.contentAttributes.of({ 'aria-label': o.label ?? 'Document text', 'aria-multiline': 'true' }),
      EditorView.theme(THEME),
      EditorView.updateListener.of((u: Any) => {
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
    const doc = f.getDoc();
    const sel = f.getSelection?.() ?? { from: 0, to: 0 };
    const focused = f.hasFocus?.() ?? false;
    const scroll = f.getScroll?.();
    f.destroy();
    fallback = null;
    cm = m;
    extensions = build(m, o);
    const len = doc.length;
    const clamp = (n: number): number => Math.max(0, Math.min(len, n));
    view = new m.view.EditorView({
      state: m.state.EditorState.create({ doc, extensions, selection: { anchor: clamp(sel.from), head: clamp(sel.to) } }),
      parent: el,
      ...(o.root ? { root: o.root } : {}),
    });
    const onScroll = (): void => o.onScroll?.();
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });
    scrollOff = () => view?.scrollDOM.removeEventListener('scroll', onScroll);
    if (scroll) adapter.scrollTo!({ fraction: scroll.fraction });
    if (focused) view.focus();
  };

  const adapter: TextEditorAdapter = {
    get name() { return view ? 'codemirror6' : 'textarea'; },
    mount(el, o) {
      mountOptions = o;
      fallback!.mount(el, o);
      const doc = el.ownerDocument;
      readyPromise = (async () => {
        let m: CodeMirror6Modules;
        try {
          const got = options.loadModules ? await options.loadModules() : await loadCodeMirror6(doc!, { url: options.url, timeoutMs: options.timeoutMs });
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
      const block = view.lineBlockAtHeight(top);
      const line = view.state.doc.lineAt(block.from).number - 1;
      const within = block.height > 0 ? Math.max(0, Math.min(1, (top - block.top) / block.height)) : 0;
      return { line: line + within, fraction: max > 0 ? Math.min(1, top / max) : 0 };
    },
    scrollTo(target) {
      if (!view) { fallback?.scrollTo?.(target); return; }
      const sd = view.scrollDOM;
      if (typeof target.line === 'number' && Number.isFinite(target.line)) {
        const d = view.state.doc;
        const n = Math.max(0, Math.min(d.lines - 1, Math.floor(target.line)));
        const block = view.lineBlockAt(d.line(n + 1).from);
        sd.scrollTop = block.top + Math.max(0, Math.min(1, target.line - n)) * block.height;
      } else if (typeof target.fraction === 'number' && Number.isFinite(target.fraction)) {
        sd.scrollTop = Math.max(0, Math.min(1, target.fraction)) * Math.max(0, sd.scrollHeight - sd.clientHeight);
      }
    },
    ready: () => readyPromise,
  };
  return adapter;
}
