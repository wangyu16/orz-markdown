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
  /** Switch read-only at run time (the shell's `setReadOnly`). Without it the engine keeps its mount-time state. */
  setReadOnly?(readOnly: boolean): void;
  /** Select a range (offsets in the adapter's text); the shell uses it to put the caret after an inserted asset link. */
  setSelection?(selection: Selection): void;
  hasFocus?(): boolean;
  undo?(): boolean;
  redo?(): boolean;
  getScroll?(): ScrollPosition;
  scrollTo?(target: { line?: number; fraction?: number }): void;
  /** Resolves once the engine is final: `{ engine }`, with `error` when it fell back. */
  ready?(): Promise<{ engine: string; error?: unknown }>;
}

/** Group typing (and runs of deletions) into one undo step when the pauses are shorter than this. */
const GROUP_MS = 500;
const HISTORY_LIMIT = 300;

type Patch = { from: number; to: number; insert: string };
/**
 * One history step: the text it returns to and the selection there. Only the
 * newest entry of each stack holds its text (`doc`, a reference to a string
 * that existed anyway); older entries hold a patch from the text of the entry
 * above them (B-19: a 1 MB document no longer costs 1 MB per undo step).
 */
interface Entry { doc?: string; patch?: Patch; from: number; to: number }

const applyPatch = (text: string, p: Patch): string => text.slice(0, p.from) + p.insert + text.slice(p.to);

/** The undo history of a textarea adapter, for an engine that takes over (and for tests). */
interface History {
  /** The texts undo returns to, oldest first. */
  texts(): string[];
  /** Characters the history holds (full texts and patches, both stacks). */
  retained(): number;
  /** Take in a change of the textarea whose `input` event has not been handled yet (one more undo step, `onChange`). */
  sync(): void;
}
const histories = new WeakMap<TextEditorAdapter, History>();

/** The texts `undo()` steps back through (oldest first; the current text not included), or `null` for another engine. */
export function undoTexts(adapter: TextEditorAdapter): string[] | null {
  return histories.get(adapter)?.texts() ?? null;
}

/**
 * Bring a textarea adapter's kept text up to the textarea's live value (E.21): `getDoc()` returns
 * the text as of the last `input` event (reading `value` of a large textarea is not free), so an
 * engine taking over calls this first and loses no character typed just before. No-op for another engine.
 */
export function syncTextarea(adapter: TextEditorAdapter): void {
  histories.get(adapter)?.sync();
}

/** Characters a textarea adapter's history holds (a full text counts whole even when shared with the page), or `null`. */
export function historyChars(adapter: TextEditorAdapter): number | null {
  return histories.get(adapter)?.retained() ?? null;
}

/** The textarea engine: no dependencies, works offline, its own undo history. */
export function textareaAdapter(): TextEditorAdapter {
  let ta: EdTextArea | null = null;
  let opts: AdapterMountOptions | null = null;
  /** The text, kept in step with the textarea on every input (reading `value` of a large textarea is not free). */
  let last = '';
  let lastSel: Selection = { from: 0, to: 0 };
  let undoStack: Entry[] = [];
  let redoStack: Entry[] = [];
  let lastInputAt = -Infinity;
  let lastInputKind = '';
  const off: Array<() => void> = [];

  const now = (): number => Date.now();
  /** Push the text before a transition (`last`) onto a stack; the old top becomes a patch from it. */
  const record = (stack: Entry[]): void => {
    const top = stack[stack.length - 1];
    if (top && top.doc !== undefined) {
      top.patch = minimalChange(last, top.doc) ?? { from: 0, to: 0, insert: '' };
      delete top.doc;
    }
    stack.push({ doc: last, from: lastSel.from, to: lastSel.to });
    if (stack.length > HISTORY_LIMIT) stack.shift();
  };
  const push = (): void => {
    record(undoStack);
    redoStack = [];
  };
  const textOf = (e: Entry): string => (e.doc !== undefined ? e.doc : applyPatch(last, e.patch!));
  const readSel = (): Selection => (ta ? { from: ta.selectionStart ?? 0, to: ta.selectionEnd ?? 0 } : { from: 0, to: 0 });
  const restore = (text: string, e: Entry): void => {
    if (!ta) return;
    ta.value = text;
    last = ta.value;
    try { ta.setSelectionRange?.(e.from, e.to); } catch { /* detached */ }
    lastSel = readSel();
    lastInputAt = -Infinity;
    opts?.onChange();
  };
  const listen = (type: string, fn: (e: EdEvent) => void): void => {
    ta!.addEventListener(type, fn);
    off.push(() => ta?.removeEventListener(type, fn));
  };
  const grouped = (kind: string): boolean => kind === 'insertText' || kind === 'deleteContentBackward' || kind === 'deleteContentForward';

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
        if (t - lastInputAt > GROUP_MS || !grouped(kind) || kind !== lastInputKind) push();
        lastInputAt = grouped(kind) ? t : -Infinity;
        lastInputKind = kind;
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
      return last;
    },
    setDoc(text, o) {
      if (!ta) { last = text; return; }
      const before = last;
      if (o?.resetHistory) { undoStack = []; redoStack = []; }
      else if (before !== text) push();
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
      undoStack = [];
      redoStack = [];
    },
    getSelection: () => (ta ? readSel() : lastSel),
    setReadOnly(flag) {
      if (opts) opts = { ...opts, readOnly: flag };
      if (ta) ta.readOnly = flag;
    },
    setSelection(s) {
      if (!ta) return;
      const clamp = (n: number): number => Math.max(0, Math.min(last.length, n));
      try { ta.setSelectionRange?.(clamp(s.from), clamp(s.to)); } catch { /* detached */ }
      lastSel = readSel();
      lastInputAt = -Infinity;
    },
    hasFocus() {
      const doc = ta?.ownerDocument;
      if (!ta || !doc) return false;
      const root = (ta as unknown as { getRootNode?(): { activeElement?: unknown } }).getRootNode?.();
      return (root?.activeElement ?? doc.activeElement) === ta;
    },
    undo() {
      const e = undoStack.pop();
      if (!e || !ta) return false;
      const target = textOf(e);
      lastSel = readSel();
      record(redoStack);
      restore(target, e);
      return true;
    },
    redo() {
      const e = redoStack.pop();
      if (!e || !ta) return false;
      const target = textOf(e);
      lastSel = readSel();
      record(undoStack);
      restore(target, e);
      return true;
    },
    getScroll() {
      if (!ta) return { line: 0, fraction: 0 };
      const max = Math.max(0, (ta.scrollHeight ?? 0) - (ta.clientHeight ?? 0));
      const fraction = max > 0 ? Math.min(1, (ta.scrollTop ?? 0) / max) : 0;
      // A textarea has no line geometry: approximate the top line proportionally.
      const lines = countLines(last);
      return { line: fraction * Math.max(0, lines - 1), fraction };
    },
    scrollTo(target) {
      if (!ta) return;
      const max = Math.max(0, (ta.scrollHeight ?? 0) - (ta.clientHeight ?? 0));
      let f = target.fraction;
      if (typeof target.line === 'number') {
        const lines = countLines(last);
        f = lines > 1 ? target.line / (lines - 1) : 0;
      }
      if (typeof f === 'number' && Number.isFinite(f)) ta.scrollTop = Math.max(0, Math.min(1, f)) * max;
    },
    ready: async () => ({ engine: 'textarea' }),
  };
  histories.set(adapter, {
    texts() {
      // walk down from the current text: each entry's text, newest first
      const out: string[] = [];
      let text = last;
      for (let i = undoStack.length - 1; i >= 0; i--) {
        const e = undoStack[i];
        text = e.doc !== undefined ? e.doc : applyPatch(text, e.patch!);
        out.push(text);
      }
      return out.reverse();
    },
    retained: () => [...undoStack, ...redoStack].reduce((n, e) => n + (e.doc !== undefined ? e.doc.length : e.patch!.insert.length), 0),
    sync() {
      if (!ta || ta.value === last) return;
      push();
      lastInputAt = -Infinity;
      last = ta.value;
      lastSel = readSel();
      opts?.onChange();
    },
  });
  return adapter;
}

function countLines(text: string): number {
  let n = 1;
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) n++;
  return n;
}
