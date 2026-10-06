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
import type { EdElement, EdEvent, EdTextArea, ShadowRootLike } from './types.js';
import { minimalChange } from './text-model.js';

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
  setDoc(text: string, options?: { resetHistory?: boolean }): void;
  focus(): void;
  destroy(): void;
  // ── optional capabilities (the shell degrades without them) ──
  getSelection?(): Selection;
  hasFocus?(): boolean;
  undo?(): boolean;
  redo?(): boolean;
  getScroll?(): ScrollPosition;
  scrollTo?(target: { line?: number; fraction?: number }): void;
  /** Resolves once the engine is final: `{ engine }`, with `error` when it fell back. */
  ready?(): Promise<{ engine: string; error?: unknown }>;
}

/** Group typing into one undo step when the pauses are shorter than this. */
const GROUP_MS = 500;
const HISTORY_LIMIT = 300;

interface Snapshot { doc: string; from: number; to: number }

/** The textarea engine: no dependencies, works offline, its own undo history. */
export function textareaAdapter(): TextEditorAdapter {
  let ta: EdTextArea | null = null;
  let opts: AdapterMountOptions | null = null;
  let last = '';
  let lastSel: Selection = { from: 0, to: 0 };
  let undoStack: Snapshot[] = [];
  let redoStack: Snapshot[] = [];
  let lastInputAt = -Infinity;
  const off: Array<() => void> = [];

  const now = (): number => Date.now();
  const snapshot = (): Snapshot => ({ doc: last, from: lastSel.from, to: lastSel.to });
  const push = (s: Snapshot): void => {
    undoStack.push(s);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack = [];
  };
  const readSel = (): Selection => (ta ? { from: ta.selectionStart ?? 0, to: ta.selectionEnd ?? 0 } : { from: 0, to: 0 });
  const restore = (s: Snapshot): void => {
    if (!ta) return;
    ta.value = s.doc;
    last = ta.value;
    try { ta.setSelectionRange?.(s.from, s.to); } catch { /* detached */ }
    lastSel = readSel();
    opts?.onChange();
  };
  const listen = (type: string, fn: (e: EdEvent) => void): void => {
    ta!.addEventListener(type, fn);
    off.push(() => ta?.removeEventListener(type, fn));
  };

  const adapter: TextEditorAdapter = {
    name: 'textarea',
    mount(el, options) {
      opts = options;
      const doc = el.ownerDocument;
      if (!doc) throw new Error('orz editor: the element has no document');
      ta = doc.createElement('textarea') as EdTextArea;
      ta.className = 'orz-editor__textarea';
      ta.setAttribute('aria-label', options.label ?? 'Document text');
      ta.setAttribute('autocapitalize', 'off');
      ta.setAttribute('autocomplete', 'off');
      ta.setAttribute('spellcheck', 'false');
      ta.setAttribute('wrap', 'soft');
      ta.readOnly = options.readOnly === true;
      ta.value = options.doc;
      last = ta.value;
      el.append(ta);
      listen('input', (e) => {
        const t = now();
        const kind = typeof e.inputType === 'string' ? e.inputType : '';
        if (t - lastInputAt > GROUP_MS || !kind.startsWith('insertText')) push(snapshot());
        lastInputAt = kind.startsWith('insertText') ? t : -Infinity;
        last = ta!.value;
        lastSel = readSel();
        options.onChange();
      });
      const sel = (): void => {
        const s = readSel();
        if (s.from === lastSel.from && s.to === lastSel.to) return;
        lastSel = s;
        options.onSelection?.(s);
      };
      listen('select', sel);
      listen('keyup', sel);
      listen('pointerup', sel);
      listen('scroll', () => options.onScroll?.());
      listen('keydown', (e) => {
        if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
        const k = (e.key ?? '').toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); adapter.undo!(); }
        else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); adapter.redo!(); }
      });
    },
    getDoc() {
      return ta ? ta.value : last;
    },
    setDoc(text, o) {
      if (!ta) { last = text; return; }
      const before = ta.value;
      if (o?.resetHistory) { undoStack = []; redoStack = []; }
      else if (before !== text) push(snapshot());
      lastInputAt = -Infinity;
      const change = minimalChange(before, text);
      const s = readSel();
      ta.value = text;
      last = ta.value;
      if (change) {
        // keep the selection where the text around it did not change
        const delta = change.insert.length - (change.to - change.from);
        const map = (p: number): number => (p <= change.from ? p : p >= change.to ? p + delta : change.from + change.insert.length);
        try { ta.setSelectionRange?.(map(s.from), map(s.to)); } catch { /* detached */ }
      }
      lastSel = readSel();
      if (before !== text || o?.resetHistory) opts?.onChange();
    },
    focus() { ta?.focus?.({ preventScroll: true }); },
    destroy() {
      for (const f of off.splice(0)) f();
      ta?.remove();
      ta = null;
      opts = null;
    },
    getSelection: () => (ta ? readSel() : lastSel),
    hasFocus() {
      const doc = ta?.ownerDocument;
      if (!ta || !doc) return false;
      const root = (ta as unknown as { getRootNode?(): { activeElement?: unknown } }).getRootNode?.();
      return (root?.activeElement ?? doc.activeElement) === ta;
    },
    undo() {
      const s = undoStack.pop();
      if (!s || !ta) return false;
      redoStack.push(snapshot());
      restore(s);
      return true;
    },
    redo() {
      const s = redoStack.pop();
      if (!s || !ta) return false;
      undoStack.push(snapshot());
      restore(s);
      return true;
    },
    getScroll() {
      if (!ta) return { line: 0, fraction: 0 };
      const max = Math.max(0, (ta.scrollHeight ?? 0) - (ta.clientHeight ?? 0));
      const fraction = max > 0 ? Math.min(1, (ta.scrollTop ?? 0) / max) : 0;
      // A textarea has no line geometry: approximate the top line proportionally.
      const lines = countLines(ta.value);
      return { line: fraction * Math.max(0, lines - 1), fraction };
    },
    scrollTo(target) {
      if (!ta) return;
      const max = Math.max(0, (ta.scrollHeight ?? 0) - (ta.clientHeight ?? 0));
      let f = target.fraction;
      if (typeof target.line === 'number') {
        const lines = countLines(ta.value);
        f = lines > 1 ? target.line / (lines - 1) : 0;
      }
      if (typeof f === 'number' && Number.isFinite(f)) ta.scrollTop = Math.max(0, Math.min(1, f)) * max;
    },
    ready: async () => ({ engine: 'textarea' }),
  };
  return adapter;
}

function countLines(text: string): number {
  let n = 1;
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) n++;
  return n;
}
