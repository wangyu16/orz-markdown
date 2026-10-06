/**
 * The editor shell (`orz-markdown/carrier/editor`, src/carrier/editor/):
 * claims E.1–E.13 in notes/CLAIMS.md; spec/FC-19-editor-component.md §8.
 *
 * Substrates. The text model and the anchor maths are pure. The shell runs
 * in happy-dom with the textarea engine (modes, keyboard, preferences,
 * dirty tracking, header edits, save routes, instances, destroy); the
 * preview bridge's message filtering runs against a fake window and iframe.
 * What happy-dom cannot show — CodeMirror 6 in a shadow root, the opaque
 * origin of the preview sandbox, layout (the split drag, narrow widths),
 * Subresource Integrity — runs in the installed Chrome through playwright-core
 * with the pinned `vendor/codemirror6.js` served from a local origin (the
 * jsDelivr copy exists only once this version is published); those tests
 * skip when Chrome is absent.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import http from 'node:http';
import vm from 'node:vm';
import type { AddressInfo } from 'node:net';
import {
  createEditorShell, textareaAdapter, codemirror6Adapter, createTextModel, toEditorText, minimalChange, createPreview, previewFrameDocument,
  lineToTop, topToLine, renderMarkdownPreview, isCodeMirror6Modules, PREVIEW_SANDBOX, PREVIEW_BRIDGE, CODEMIRROR6_URL, CODEMIRROR6_VERSIONS,
  CODEMIRROR6_INTEGRITY, CODEMIRROR6_BYTES, CODEMIRROR6_PATH, CODEMIRROR6_GLOBAL, EDITOR_CSS,
  type EditorShell, type EditorShellOptions, type EdElement, type EdDocument,
} from '../src/carrier/editor';
import { editHeader, withoutHeader } from '../src/carrier';
import { md } from '../src/index';
import { isScriptSafe, type HostConnection, type Saver, type SaveResult, type StorageLike, type PreferenceStore } from '../src/carrier/shell';
import { VERSION } from '../src/version';

// ── fixtures ─────────────────────────────────────────────────────────────

const UID_A = 'doc-aaaaaaaaaa111111';
const UID_B = 'doc-bbbbbbbbbb222222';
const CRLF_BOM = `﻿{{nyml\r\nkind: document\r\ntitle: Week 3 — 漢字\r\nuid: ${UID_A}\r\nx_host_key: kept\r\n}}\r\n\r\n# Week 3\r\n\r\n</script> 𝒳 trailing  \r\n`;
const TEXTS: Record<string, string> = {
  'CRLF + BOM': CRLF_BOM,
  CR: '{{nyml\rkind: document\rtitle: Mac\r}}\r\rclassic line ends\r',
  LF: `{{nyml\nkind: document\nuid: ${UID_B}\n}}\n\n# Plain\n\n- a\n- b\n`,
  'no header': '# Just Markdown\n\nwith *emphasis*\n',
  'mixed EOL': 'a\r\nb\nc\rd',
  'BOM only': '﻿',
  empty: '',
  'astral + U+2028': '𝒳   line sep\r\n𝒴\r\n',
};

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } };
}

let HappyWindow: typeof import('happy-dom').Window;
beforeAll(async () => {
  ({ Window: HappyWindow } = await import('happy-dom'));
});

type HWin = InstanceType<typeof HappyWindow>;

function page(): { win: HWin; document: Document; mountPoint(): EdElement } {
  const win = new HappyWindow({ url: 'https://app.example/edit' });
  const document = win.document as unknown as Document;
  return {
    win,
    document,
    mountPoint() {
      const div = document.createElement('div');
      document.body.appendChild(div);
      return div as unknown as EdElement;
    },
  };
}

type Mounted = { shell: EditorShell; root: ShadowRoot; ta(): HTMLTextAreaElement; win: HWin; el: EdElement; storage: ReturnType<typeof memoryStorage> };

function mount(opts: Partial<EditorShellOptions> = {}, ctx = page()): Mounted {
  const storage = memoryStorage();
  const el = ctx.mountPoint();
  const shell = createEditorShell(el, {
    text: CRLF_BOM,
    render: (t) => renderMarkdownPreview(t),
    adapter: textareaAdapter(),
    storage,
    preview: { assets: false, debounceMs: 10 },
    ...opts,
  });
  const root = shell.root as unknown as ShadowRoot;
  return { shell, root, ta: () => root.querySelector('textarea')!, win: ctx.win, el, storage };
}

/** Type into the textarea the way a browser does: value, caret, an input event. */
function type(m: Mounted, insert: string, at?: number): void {
  const ta = m.ta();
  const pos = at ?? ta.value.length;
  ta.value = ta.value.slice(0, pos) + insert + ta.value.slice(pos);
  ta.setSelectionRange(pos + insert.length, pos + insert.length);
  ta.dispatchEvent(new m.win.InputEvent('input', { inputType: 'insertText', data: insert, bubbles: true }) as unknown as Event);
}

function key(m: Mounted, target: Element, k: string, mods: { ctrl?: boolean; meta?: boolean; shift?: boolean } = {}): KeyboardEvent {
  const e = new m.win.KeyboardEvent('keydown', { key: k, ctrlKey: !!mods.ctrl, metaKey: !!mods.meta, shiftKey: !!mods.shift, bubbles: true, composed: true, cancelable: true }) as unknown as KeyboardEvent;
  target.dispatchEvent(e);
  return e;
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const toasts = (root: ShadowRoot): string[] => [...root.querySelectorAll('.orz-toast__message')].map((n) => n.textContent ?? '');

// ── E.1 the exact text ───────────────────────────────────────────────────

describe('the exact text (FC-19 invariant 5, FC-18 law 1)', () => {
  it('[E.1] the text model gives back every text exactly when its editor form is unchanged (CR LF, CR, BOM, mixed, astral, empty), and writes edits in the document\'s own line ending and BOM', () => {
    for (const [name, text] of Object.entries(TEXTS)) {
      const m = createTextModel(text);
      const editor = toEditorText(text);
      expect(editor, name).not.toMatch(/\r/);
      expect(editor.startsWith('﻿'), name).toBe(false);
      expect(m.toExact(editor), name).toBe(text);
    }
    const m = createTextModel(CRLF_BOM);
    const edited = `${toEditorText(CRLF_BOM)}new line\nanother\n`;
    const out = m.toExact(edited);
    expect(out.startsWith('﻿')).toBe(true);
    expect(out.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/); // only CR LF
    expect(out).toBe(`${CRLF_BOM}new line\r\nanother\r\n`);
    const cr = createTextModel(TEXTS.CR);
    expect(cr.toExact(`${toEditorText(TEXTS.CR)}x\n`)).toBe(`${TEXTS.CR}x\r`);
    // a mixed text is written in the style of its first line break once edited
    expect(createTextModel('a\r\nb\nc').toExact('a\nb\nc!')).toBe('a\r\nb\r\nc!');
    // offsets: BOM and CR LF counted
    expect(m.toExactOffset(toEditorText(CRLF_BOM), 0)).toBe(1);
    expect(m.toExactOffset('a\nb\nc', 4)).toBe(1 + 4 + 2);
    // minimal change never splits a surrogate pair
    expect(minimalChange('a𝒳b', 'a𝒴b')).toEqual({ from: 1, to: 3, insert: '𝒴' });
    expect(minimalChange('same', 'same')).toBeNull();
  });

  it('[E.1] through the shell: getText() is the original byte for byte before any edit, and keeps the BOM and the line-ending style after typing', () => {
    for (const [name, text] of Object.entries(TEXTS)) {
      const m = mount({ text });
      expect(m.shell.getText(), name).toBe(text);
      expect(m.shell.isDirty(), name).toBe(false);
      m.shell.destroy();
    }
    const m = mount();
    type(m, 'typed\nmore');
    const t = m.shell.getText();
    expect(t.startsWith('﻿')).toBe(true);
    expect(t).toBe(`${CRLF_BOM}typed\r\nmore`);
    expect(t.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    // typing it back out returns the exact original
    m.ta().value = toEditorText(CRLF_BOM);
    m.ta().dispatchEvent(new m.win.InputEvent('input', { inputType: 'deleteContentBackward' }) as unknown as Event);
    expect(m.shell.getText()).toBe(CRLF_BOM);
    m.shell.destroy();
  });

  it('[E.1] setText adopts the new text exactly (its own BOM and line endings), mixed line endings included while unedited', () => {
    const m = mount();
    for (const text of Object.values(TEXTS)) {
      m.shell.setText(text);
      expect(m.shell.getText()).toBe(text);
    }
    m.shell.setText('x\r\ny');
    type(m, '\nz');
    expect(m.shell.getText()).toBe('x\r\ny\r\nz');
    m.shell.destroy();
  });
});

// ── E.2 dirty tracking and events ────────────────────────────────────────

describe('dirty tracking and events', () => {
  it('[E.2] dirty means "differs from the saved text": an edit makes it dirty, undoing back makes it clean, markSaved adopts the current text; dirty events fire on transitions only', () => {
    const m = mount();
    const dirty: boolean[] = [];
    const changes: string[] = [];
    m.shell.on('dirty', (e) => dirty.push(e.dirty));
    const off = m.shell.on('change', (e) => changes.push(e.text));
    expect(m.shell.isDirty()).toBe(false);
    type(m, 'a');
    type(m, 'b');
    expect(m.shell.isDirty()).toBe(true);
    expect(changes).toEqual([`${CRLF_BOM}a`, `${CRLF_BOM}ab`]);
    expect(m.shell.undo()).toBe(true); // "ab" was one typing group
    expect(m.shell.getText()).toBe(CRLF_BOM);
    expect(m.shell.isDirty()).toBe(false);
    expect(m.shell.redo()).toBe(true);
    expect(m.shell.isDirty()).toBe(true);
    m.shell.markSaved();
    expect(m.shell.isDirty()).toBe(false);
    expect(dirty).toEqual([true, false, true, false]);
    expect(changes).toHaveLength(4); // a, b, the undo, the redo
    off();
    type(m, 'c');
    expect(changes).toHaveLength(4); // unsubscribed
    // setText changes the text but does not mark it saved
    m.shell.setText('other');
    expect(m.shell.isDirty()).toBe(true);
    expect(m.root.querySelector('.orz-editor')!.getAttribute('data-dirty')).toBe('true');
    expect(m.root.querySelector('.orz-editor__status')!.textContent).toBe('Unsaved changes');
    m.shell.destroy();
  });

  it('[E.2] selection events carry offsets in the exact text (BOM and CR LF counted); a throwing listener does not break the others', () => {
    const m = mount();
    const seen: Array<{ from: number; to: number }> = [];
    m.shell.on('selection', () => { throw new Error('listener bug'); });
    m.shell.on('selection', (s) => seen.push(s));
    const ta = m.ta();
    const editor = toEditorText(CRLF_BOM);
    const at = editor.indexOf('# Week');
    ta.setSelectionRange(at, at + 6);
    ta.dispatchEvent(new m.win.Event('select') as unknown as Event);
    expect(seen).toHaveLength(1);
    expect(CRLF_BOM.slice(seen[0].from, seen[0].to)).toBe('# Week');
    m.shell.destroy();
  });
});

// ── E.3 header edits ─────────────────────────────────────────────────────

describe('header edits (FC-18 §9)', () => {
  it('[E.3] setHeader applies editHeader to the current text as ONE undoable edit: the result equals editHeader\'s, one undo restores the exact original, redo re-applies', () => {
    const m = mount();
    type(m, 'x');
    const before = m.shell.getText();
    const changes = { title: 'New title', theme: 'light-neat-3', x_host_key: null };
    m.shell.setHeader(changes);
    expect(m.shell.getText()).toBe(editHeader(before, changes));
    expect(m.shell.getText()).toContain('\r\ntheme: light-neat-3\r\n'); // the header's line ending
    expect(m.shell.undo()).toBe(true);
    expect(m.shell.getText()).toBe(before);
    expect(m.shell.redo()).toBe(true);
    expect(m.shell.getText()).toBe(editHeader(before, changes));
    // an edit editHeader refuses changes nothing
    const now = m.shell.getText();
    expect(() => m.shell.setHeader({ kind: 'slides' })).toThrow();
    expect(() => m.shell.setHeader({ title: 'a }} b' })).toThrow();
    expect(m.shell.getText()).toBe(now);
    // a text without a header gets one (after its BOM)
    m.shell.setText('﻿# Hi\r\n');
    m.shell.setHeader({ title: 'T' });
    expect(m.shell.getText()).toBe('﻿{{nyml\r\nkind: document\r\ntitle: T\r\n}}\r\n\r\n# Hi\r\n');
    m.shell.destroy();
  });

  it('[E.3] the original mixed-EOL text comes back exactly after a header edit is undone (the model remembers the texts it was given)', () => {
    const text = '{{nyml\r\nkind: document\r\ntitle: A\r\n}}\nbody\rmore\r\n';
    const m = mount({ text });
    m.shell.setHeader({ title: 'B' });
    expect(m.shell.getText()).toBe(editHeader(text, { title: 'B' }));
    m.shell.undo();
    expect(m.shell.getText()).toBe(text);
    expect(m.shell.isDirty()).toBe(false);
    m.shell.destroy();
  });
});

// ── E.4 layout, modes, keyboard, responsive ──────────────────────────────

describe('layout, modes, keyboard', () => {
  it('[E.4] the shell renders in a shadow root with the chrome and editor stylesheets: a labelled toolbar with Editor/Split/Preview (aria-pressed), the editor pane, a separator and the preview', () => {
    const m = mount();
    const host = m.el as unknown as HTMLElement;
    expect(host.children).toHaveLength(1);
    expect(host.firstElementChild!.shadowRoot).toBe(m.root);
    expect(m.root.querySelector('[role="toolbar"]')!.getAttribute('aria-label')).toBe('Editor toolbar');
    const modes = [...m.root.querySelectorAll('.orz-editor__mode')];
    expect(modes.map((b) => b.getAttribute('aria-label'))).toEqual(['Editor', 'Split', 'Preview']);
    expect(modes.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    const sep = m.root.querySelector('[role="separator"]')!;
    expect(sep.getAttribute('aria-orientation')).toBe('vertical');
    expect(sep.getAttribute('aria-valuenow')).toBe('50');
    expect(sep.getAttribute('tabindex')).toBe('0');
    expect(m.root.querySelector('button.orz-editor__save')!.getAttribute('aria-label')).toBe('Save');
    expect(m.root.querySelector('textarea')!.getAttribute('aria-label')).toBe('Document text');
    expect(EDITOR_CSS).not.toMatch(/(^|\})\s*(body|html|:root)\b/);
    m.shell.destroy();
    // chrome: none → no toolbar; compact → labels visually hidden; readOnly → no Save button and a read-only engine
    const n = mount({ chrome: 'none' });
    expect(n.root.querySelector('[role="toolbar"]')).toBeNull();
    expect(n.shell.toolbar).toBeNull();
    n.shell.destroy();
    const r = mount({ readOnly: true, chrome: 'compact' });
    expect(r.root.querySelector('.orz-editor__save')).toBeNull();
    expect(r.ta().readOnly).toBe(true);
    expect(r.root.querySelector('.orz-editor')!.getAttribute('data-chrome-level')).toBe('compact');
    r.shell.destroy();
  });

  it('[E.4] setMode and the mode buttons switch views (stored as the viewMode preference); Cmd/Ctrl+\\ cycles split → editor → preview → split; Cmd/Ctrl+S saves; Esc in the editor moves focus to the toolbar', async () => {
    const save = vi.fn(async () => undefined);
    const m = mount({ hooks: { save }, uid: UID_A });
    const c = m.root.querySelector('.orz-editor')!;
    (m.root.querySelector('[data-mode="preview"]') as HTMLElement).click();
    expect(m.shell.getMode()).toBe('preview');
    expect(c.getAttribute('data-view')).toBe('preview');
    expect(m.storage.map.get(`orz-pref:${UID_A}:viewMode`)).toBe('"preview"');
    m.shell.setMode('split');
    const ta = m.ta();
    expect(key(m, ta, '\\', { ctrl: true }).defaultPrevented).toBe(true);
    expect(m.shell.getMode()).toBe('editor');
    key(m, ta, '\\', { meta: true });
    expect(m.shell.getMode()).toBe('preview');
    key(m, ta, '\\', { ctrl: true });
    expect(m.shell.getMode()).toBe('split');
    expect(() => m.shell.setMode('bogus' as never)).toThrow();
    type(m, '!');
    expect(key(m, ta, 's', { meta: true }).defaultPrevented).toBe(true);
    await tick();
    expect(save).toHaveBeenCalledWith(`${CRLF_BOM}!`);
    ta.focus();
    key(m, ta, 'Escape');
    expect(m.root.activeElement?.getAttribute('data-mode')).toBe('split');
    m.shell.destroy();
  });

  it('[E.4] responsive: below the narrow width only one pane shows — split shows the editor, Cmd/Ctrl+\\ flips editor ↔ preview, the Split button hides; wide again restores split', () => {
    const m = mount();
    const host = (m.el as unknown as HTMLElement).firstElementChild as HTMLElement;
    let width = 500;
    host.getBoundingClientRect = () => ({ width, height: 400, top: 0, left: 0, right: width, bottom: 400, x: 0, y: 0, toJSON() { return {}; } }) as DOMRect;
    m.win.dispatchEvent(new m.win.Event('resize') as unknown as Event);
    const c = m.root.querySelector('.orz-editor')!;
    expect(c.hasAttribute('data-narrow')).toBe(true);
    expect(m.shell.getMode()).toBe('split');
    expect(m.shell.getView()).toBe('editor');
    key(m, m.ta(), '\\', { ctrl: true });
    expect(m.shell.getView()).toBe('preview');
    expect(m.shell.getMode()).toBe('split');
    expect(m.root.querySelector('[data-mode="preview"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(EDITOR_CSS).toContain('.orz-editor[data-narrow] .orz-editor__mode[data-mode="split"] { display: none; }');
    width = 1000;
    m.win.dispatchEvent(new m.win.Event('resize') as unknown as Event);
    expect(c.hasAttribute('data-narrow')).toBe(false);
    expect(m.shell.getView()).toBe('split');
    m.shell.destroy();
  });

  it('[E.4] the separator is keyboard-operable: arrows move the split by 5 %, Home/End go to 10 %/90 %; the ratio is clamped to 0.1–0.9', () => {
    const m = mount({ uid: UID_A });
    const sep = m.root.querySelector('[role="separator"]') as HTMLElement;
    key(m, sep, 'ArrowLeft');
    expect(m.shell.getSplitRatio()).toBe(0.45);
    key(m, sep, 'End');
    expect(m.shell.getSplitRatio()).toBe(0.9);
    key(m, sep, 'ArrowRight');
    expect(m.shell.getSplitRatio()).toBe(0.9);
    key(m, sep, 'Home');
    expect(sep.getAttribute('aria-valuenow')).toBe('10');
    m.shell.setSplitRatio(3);
    expect(m.shell.getSplitRatio()).toBe(0.9);
    m.shell.destroy();
  });
});

// ── E.5 preview ──────────────────────────────────────────────────────────

/** A fake page window and the iframe's window, for the bridge's message rules. */
function fakePreviewPage() {
  const listeners = new Set<(e: unknown) => void>();
  const posted: unknown[] = [];
  const frameWindow = { postMessage: (m: unknown) => { posted.push(m); } };
  const appended: unknown[] = [];
  const win = {
    addEventListener: (_t: string, l: (e: unknown) => void) => { listeners.add(l); },
    removeEventListener: (_t: string, l: (e: unknown) => void) => { listeners.delete(l); },
    setTimeout, clearTimeout,
  };
  const iframe: Record<string, unknown> = {
    attrs: {} as Record<string, string>,
    setAttribute(n: string, v: string) { (this.attrs as Record<string, string>)[n] = v; },
    addEventListener() {}, removeEventListener() {},
    remove() { this.removed = true; },
    contentWindow: frameWindow,
  };
  const doc = { createElement: () => iframe, defaultView: win } as unknown as EdDocument;
  const parent = { append: (n: unknown) => appended.push(n) } as unknown as EdElement;
  const emit = (data: unknown, source: unknown) => { for (const l of [...listeners]) l({ data, source, origin: 'null' }); };
  return { doc, parent, iframe, frameWindow, posted, listeners, emit, appended };
}

describe('the preview', () => {
  it('[E.5] the preview is an iframe whose sandbox is exactly allow-scripts (never allow-same-origin), srcdoc = the pinned preview libraries + the fixed bridge; HTML is posted only after the frame says ready, and the last HTML is re-sent when it says ready again', () => {
    const f = fakePreviewPage();
    const p = createPreview(f.doc, f.parent, { assets: false }, {});
    expect(PREVIEW_SANDBOX).toBe('allow-scripts');
    expect(f.iframe.attrs).toMatchObject({ sandbox: 'allow-scripts', title: 'Document preview' });
    expect(String(f.iframe.srcdoc)).toContain(PREVIEW_BRIDGE);
    expect(PREVIEW_BRIDGE).not.toMatch(/<\/?script/i);
    expect(PREVIEW_BRIDGE).toContain('if(e.source!==P)return');
    p.render('<p>one</p>');
    expect(f.posted).toEqual([]);
    f.emit({ type: 'orz-preview-ready' }, f.frameWindow);
    expect(f.posted).toEqual([{ type: 'orz-preview-render', id: 1, html: '<p>one</p>' }]);
    p.render('<p>two</p>');
    f.emit({ type: 'orz-preview-ready' }, f.frameWindow); // reloaded frame
    expect(f.posted.slice(1)).toEqual([{ type: 'orz-preview-render', id: 2, html: '<p>two</p>' }, { type: 'orz-preview-render', id: 3, html: '<p>two</p>' }]);
    // the full frame document carries the pinned libraries and __orzEnhance
    const full = previewFrameDocument({ head: '<link rel="stylesheet" href="theme.css">', scheme: 'dark', articleClass: 'markdown-body x"y' });
    expect(full).toContain('window.__orzEnhance=function');
    expect(full).toContain('atom-one-dark');
    expect(full).toContain('class="markdown-body x&quot;y" id="orz-doc"');
    expect(full).toContain('<link rel="stylesheet" href="theme.css">');
    p.destroy();
    expect(f.iframe.removed).toBe(true);
    expect(f.listeners.size).toBe(0);
  });

  it('[E.5] messages are read only from that iframe\'s window: anchors, scroll, keys and links forged by another window are ignored; payloads are validated as data', () => {
    const f = fakePreviewPage();
    const seen: unknown[] = [];
    const p = createPreview(f.doc, f.parent, { assets: false }, {
      onRendered: (a) => seen.push(['rendered', a]), onScrolled: (t) => seen.push(['scrolled', t]), onKey: (k) => seen.push(['key', k]), onLink: (h) => seen.push(['link', h]),
    });
    const stranger = { postMessage() {} };
    for (const source of [stranger, null, undefined, {}]) {
      f.emit({ type: 'orz-preview-rendered', anchors: [[1, 100]], max: 5 }, source);
      f.emit({ type: 'orz-preview-key', key: 's' }, source);
      f.emit({ type: 'orz-preview-link', href: 'https://evil.example' }, source);
      f.emit({ type: 'orz-preview-ready' }, source);
    }
    expect(seen).toEqual([]);
    expect(p.anchors).toEqual([]);
    f.emit({ type: 'orz-preview-rendered', anchors: [[2, 50], ['x', 1], [3, NaN], 'junk', [9, 400]], max: 1000 }, f.frameWindow);
    f.emit({ type: 'orz-preview-key', key: 'q' }, f.frameWindow);
    f.emit({ type: 'orz-preview-key', key: 'Escape' }, f.frameWindow);
    f.emit({ type: 'orz-preview-link', href: 42 }, f.frameWindow);
    f.emit({ type: 'orz-preview-scrolled', top: 120, max: 1000 }, f.frameWindow);
    expect(p.anchors).toEqual([[2, 50], [9, 400]]);
    expect(seen).toEqual([['rendered', [[2, 50], [9, 400]]], ['key', 'Escape'], ['scrolled', 120]]);
    p.destroy();
  });

  it('[E.5] scroll sync maps lines and tops through the anchors (linear between them, from the top before the first, the last beyond the end)', () => {
    const a: Array<[number, number]> = [[6, 100], [10, 300], [20, 500]];
    expect(lineToTop(a, 8)).toBe(200);
    expect(lineToTop(a, 15)).toBe(400);
    expect(lineToTop(a, 3)).toBe(50);
    expect(lineToTop(a, 99)).toBe(500);
    expect(topToLine(a, 200)).toBe(8);
    expect(topToLine(a, 50)).toBe(3);
    expect(topToLine(a, 9999)).toBe(20);
    for (const line of [0, 6, 7.5, 12, 20]) expect(topToLine(a, lineToTop(a, line))).toBeCloseTo(line);
    expect(lineToTop([], 5)).toBe(0);
  });

  it('[E.5] edits re-render the preview once per pause (debounced), the editor-only view renders nothing until the preview shows, and a failing render is an error event that keeps the last preview', async () => {
    const render = vi.fn((t: string) => {
      if (t.includes('BOOM')) throw new Error('render failed');
      return `<p>${t.length}</p>`;
    });
    const m = mount({ render, mode: 'editor' });
    const errors: string[] = [];
    m.shell.on('error', (e) => errors.push(`${e.source}: ${e.message}`));
    await tick(30);
    expect(render).not.toHaveBeenCalled();
    m.shell.setMode('split');
    await tick(30);
    expect(render).toHaveBeenCalledTimes(1);
    type(m, 'a'); type(m, 'b'); type(m, 'c');
    await tick(40);
    expect(render).toHaveBeenCalledTimes(2);
    expect(render.mock.calls[1][0]).toBe(`${CRLF_BOM}abc`);
    type(m, 'BOOM');
    await tick(40);
    expect(errors).toEqual(['render: render failed']);
    m.shell.destroy();
  });
});

// ── E.6 reader preferences ───────────────────────────────────────────────

describe('reader preferences (FC-18 §6)', () => {
  it('[E.6] split ratio, view mode, scroll sync, font size and dark chrome are reader preferences namespaced by the header uid (orz-pref:<uid>:…), read at mount; a text without a uid uses orz-pref:_:', () => {
    const storage = memoryStorage();
    storage.setItem(`orz-pref:${UID_A}:splitRatio`, '0.3');
    storage.setItem(`orz-pref:${UID_A}:viewMode`, '"preview"');
    storage.setItem(`orz-pref:${UID_A}:editorFontSize`, '18');
    storage.setItem(`orz-pref:${UID_A}:darkChrome`, 'true');
    storage.setItem(`orz-pref:${UID_A}:scrollSync`, 'false');
    const ctx = page();
    const a = createEditorShell(ctx.mountPoint(), { text: CRLF_BOM, render: () => '', adapter: textareaAdapter(), storage, preview: { assets: false } });
    expect(a.getSplitRatio()).toBe(0.3);
    expect(a.getMode()).toBe('preview');
    const ra = a.root as unknown as ShadowRoot;
    expect((ra.host as HTMLElement).getAttribute('data-chrome')).toBe('dark');
    expect((ra.querySelector('.orz-editor') as HTMLElement).style.getPropertyValue('--orz-editor-font-size')).toBe('18px');
    expect(ra.querySelector('.orz-editor__sync')!.getAttribute('aria-pressed')).toBe('false');
    // another document (another uid) does not see them; nor does a document without one
    const b = createEditorShell(ctx.mountPoint(), { text: TEXTS.LF, render: () => '', adapter: textareaAdapter(), storage, preview: { assets: false } });
    expect(b.getSplitRatio()).toBe(0.5);
    expect(b.getMode()).toBe('split');
    b.setSplitRatio(0.7);
    expect(storage.map.get(`orz-pref:${UID_B}:splitRatio`)).toBe('0.7');
    expect(storage.map.get(`orz-pref:${UID_A}:splitRatio`)).toBe('0.3');
    const c = createEditorShell(ctx.mountPoint(), { text: '# no uid', render: () => '', adapter: textareaAdapter(), storage, preview: { assets: false } });
    c.setMode('editor');
    expect(storage.map.get('orz-pref:_:viewMode')).toBe('"editor"');
    // an explicit mode wins at mount and is not stored; an explicit preference store is used as is
    const fixed = new Map<string, unknown>();
    const custom = { get: (k: string) => fixed.get(k) ?? ({ splitRatio: 0.5, scrollSync: true, viewMode: 'split', editorFontSize: 14, darkChrome: null } as Record<string, unknown>)[k], set: (k: string, v: unknown) => { fixed.set(k, v); return true; }, remove() {}, all: () => ({}), namespace: 'custom:' } as unknown as PreferenceStore;
    const d = createEditorShell(ctx.mountPoint(), { text: CRLF_BOM, render: () => '', adapter: textareaAdapter(), preferences: custom, mode: 'editor', preview: { assets: false } });
    expect(d.getMode()).toBe('editor');
    expect(fixed.has('viewMode')).toBe(false);
    d.setSplitRatio(0.25);
    expect(fixed.get('splitRatio')).toBe(0.25);
    expect(storage.map.has(`orz-pref:${UID_A}:splitRatio`) && storage.map.get(`orz-pref:${UID_A}:splitRatio`)).toBe('0.3');
    // the scroll-sync toggle is stored
    (ra.querySelector('.orz-editor__sync') as HTMLElement).click();
    expect(storage.map.get(`orz-pref:${UID_A}:scrollSync`)).toBe('true');
    for (const s of [a, b, c, d]) s.destroy();
  });

  it('[E.6] preferences never enter the text: changing every one leaves getText() and the dirty state unchanged', () => {
    const m = mount({ uid: UID_A });
    m.shell.setSplitRatio(0.2);
    m.shell.setMode('preview');
    (m.root.querySelector('.orz-editor__sync') as HTMLElement).click();
    expect(m.shell.getText()).toBe(CRLF_BOM);
    expect(m.shell.isDirty()).toBe(false);
    m.shell.destroy();
  });
});

// ── E.7 instances and destroy ────────────────────────────────────────────

describe('instances', () => {
  it('[E.7] two shells on one page are isolated: their own text, undo history, events, modes and toasts', async () => {
    const ctx = page();
    const a = mount({ uid: UID_A }, ctx);
    const b = mount({ text: TEXTS.LF }, ctx);
    const events = { a: 0, b: 0 };
    a.shell.on('change', () => events.a++);
    b.shell.on('change', () => events.b++);
    type(a, 'A');
    expect(a.shell.getText()).toBe(`${CRLF_BOM}A`);
    expect(b.shell.getText()).toBe(TEXTS.LF);
    expect(events).toEqual({ a: 1, b: 0 });
    expect(b.shell.isDirty()).toBe(false);
    expect(b.shell.undo()).toBe(false);
    a.shell.setMode('editor');
    expect(b.shell.getMode()).toBe('split');
    await a.shell.save(); // no save route → error toast in A only
    expect(toasts(a.root)).toHaveLength(1);
    expect(toasts(b.root)).toHaveLength(0);
    a.shell.destroy();
    b.shell.destroy();
  });

  it('[E.7] destroy() releases everything: every window listener it added is removed, the iframe and the host element are gone, the engine is destroyed, pending renders never run, and later calls do nothing', async () => {
    const ctx = page();
    const added: string[] = [];
    const removed: string[] = [];
    const add = ctx.win.addEventListener.bind(ctx.win);
    const rem = ctx.win.removeEventListener.bind(ctx.win);
    (ctx.win as unknown as { addEventListener: unknown }).addEventListener = (t: string, l: never, o?: never) => { added.push(t); add(t, l, o); };
    (ctx.win as unknown as { removeEventListener: unknown }).removeEventListener = (t: string, l: never, o?: never) => { removed.push(t); rem(t, l, o); };
    const render = vi.fn(() => '<p>x</p>');
    const engine = textareaAdapter();
    const destroyEngine = vi.spyOn(engine, 'destroy');
    const m = mount({ render, adapter: engine }, ctx);
    expect(added.sort()).toEqual(['message', 'resize']);
    await tick(30);
    const calls = render.mock.calls.length;
    type(m, 'pending');
    m.shell.destroy();
    expect(removed.sort()).toEqual(added.sort());
    expect(ctx.document.querySelectorAll('iframe')).toHaveLength(0);
    expect((m.el as unknown as HTMLElement).children).toHaveLength(0);
    expect(m.root.querySelector('iframe')).toBeNull();
    expect(destroyEngine).toHaveBeenCalledTimes(1);
    await tick(40);
    expect(render).toHaveBeenCalledTimes(calls);
    m.shell.destroy(); // idempotent
    await expect(m.shell.save()).resolves.toEqual({ ok: false, error: 'destroyed' });
  });
});

// ── E.8 save ─────────────────────────────────────────────────────────────

function fakeSaver(result: SaveResult | (() => Promise<SaveResult>)) {
  const saves: Array<{ text: string; html: string }> = [];
  const downloads: string[] = [];
  const saver: Saver = {
    save: async (input) => { saves.push({ text: input.text, html: input.html }); return typeof result === 'function' ? result() : result; },
    download: async ({ html }) => { downloads.push(html); return { via: 'download', ok: true }; },
    handleKey: () => UID_A,
  };
  return { saver, saves, downloads };
}

describe('save', () => {
  it('[E.8] app host: save() calls hooks.save with the exact text (BOM, CR LF), clears dirty only on success, emits save, announces it; one save at a time', async () => {
    let release!: () => void;
    const hook = vi.fn(() => new Promise<void>((r) => { release = r; }));
    const m = mount({ hooks: { save: hook } });
    const saved: unknown[] = [];
    m.shell.on('save', (e) => saved.push(e));
    type(m, 'edit\n');
    const p1 = m.shell.save();
    const p2 = m.shell.save();
    expect(p2).toBe(p1);
    await tick();
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith(`${CRLF_BOM}edit\r\n`);
    expect(m.shell.isDirty()).toBe(true);
    type(m, 'during'); // typed while the save is in flight
    release();
    await expect(p1).resolves.toEqual({ ok: true, via: 'hook' });
    expect(saved).toEqual([{ text: `${CRLF_BOM}edit\r\n`, via: 'hook' }]);
    expect(m.shell.isDirty()).toBe(true); // the in-flight edit is not saved
    expect(toasts(m.root)).toEqual(['Saved.']);
    const p3 = m.shell.save();
    await tick();
    release();
    await p3;
    expect(hook).toHaveBeenLastCalledWith(`${CRLF_BOM}edit\r\nduring`);
    expect(m.shell.isDirty()).toBe(false);
    m.shell.destroy();
  });

  it('[E.8] a failed save keeps the document dirty, emits error and shows it; save() never rejects; a read-only shell does not save', async () => {
    const m = mount({ hooks: { save: async () => { throw new Error('quota exceeded'); } } });
    const errors: unknown[] = [];
    m.shell.on('error', (e) => errors.push([e.source, e.message]));
    type(m, 'x');
    await expect(m.shell.save()).resolves.toEqual({ ok: false, via: 'hook', error: 'quota exceeded' });
    expect(m.shell.isDirty()).toBe(true);
    expect(errors).toEqual([['save', 'quota exceeded']]);
    expect(toasts(m.root)).toEqual(['Could not save: quota exceeded']);
    m.shell.destroy();
    const hook = vi.fn(async () => undefined);
    const r = mount({ readOnly: true, hooks: { save: hook } });
    await expect(r.shell.save()).resolves.toEqual({ ok: false, error: 'read-only' });
    key(r, r.ta(), 's', { ctrl: true });
    await tick();
    expect(hook).not.toHaveBeenCalled();
    r.shell.destroy();
  });

  it('[E.8] standalone host: save() assembles the current text and hands { text, html } to the saver; success clears dirty; a cancelled picker is no error; a failure keeps dirty', async () => {
    const assemble = vi.fn(async (t: string) => `<html data-len="${t.length}"></html>`);
    const ok = fakeSaver({ via: 'file', ok: true });
    const m = mount({ assemble, saver: ok.saver });
    type(m, 'y');
    await expect(m.shell.save()).resolves.toEqual({ ok: true, via: 'file' });
    expect(ok.saves).toEqual([{ text: `${CRLF_BOM}y`, html: `<html data-len="${CRLF_BOM.length + 1}"></html>` }]);
    expect(m.shell.isDirty()).toBe(false);
    m.shell.destroy();

    const cancelled = fakeSaver({ via: 'file', ok: false, error: 'cancelled' });
    const c = mount({ assemble, saver: cancelled.saver });
    const errors: unknown[] = [];
    c.shell.on('error', (e) => errors.push(e));
    type(c, 'z');
    await expect(c.shell.save()).resolves.toEqual({ ok: false, via: 'file', error: 'cancelled', cancelled: true });
    expect(errors).toEqual([]);
    expect(c.shell.isDirty()).toBe(true);
    c.shell.destroy();

    const broken = fakeSaver({ via: 'download', ok: false, error: 'Downloads are not available here.' });
    const b = mount({ assemble, saver: broken.saver });
    type(b, 'w');
    expect((await b.shell.save()).ok).toBe(false);
    expect(b.shell.isDirty()).toBe(true);
    b.shell.destroy();

    const none = mount({});
    expect((await none.shell.save()).ok).toBe(false);
    none.shell.destroy();
  });

  it('[E.8] on a served page the save shows the served-page notice (#orz-served-note) — nothing is written or downloaded until the reader picks "Download a copy"', async () => {
    const assemble = async (t: string) => `<html>${t.length}</html>`;
    const served = fakeSaver({ via: 'served-notice' });
    const m = mount({ assemble, saver: served.saver });
    type(m, 'q');
    await expect(m.shell.save()).resolves.toMatchObject({ ok: false, via: 'served-notice' });
    expect(served.downloads).toEqual([]);
    const note = m.root.querySelector('#orz-served-note')!;
    expect(note.textContent).toContain('cannot be saved in place');
    expect(m.shell.isDirty()).toBe(true);
    (note.querySelector('button.orz-btn--primary') as HTMLElement).click();
    await tick(10);
    expect(served.downloads).toEqual([`<html>${CRLF_BOM.length + 1}</html>`]);
    expect(m.shell.isDirty()).toBe(false);
    expect(m.root.querySelector('#orz-served-note')).toBeNull();
    m.shell.destroy();
  });

  it('[E.8] without a saver the shell uses createSaver: a connected host (connectHost) receives { source: exact text, html } and the dirty state', async () => {
    const posted: unknown[] = [];
    const host = {
      connected: () => true, protocols: () => ({ save: true, ai: false, include: false }), origin: () => 'https://app.example', aiOperations: () => [],
      save: async (p: unknown) => { posted.push(['save', p]); return { ok: true }; },
      requestAi: async () => ({ ok: false }), requestInclude: async () => null,
      setDirty: (d: boolean) => posted.push(['dirty', d]), dispose() {},
    } as unknown as HostConnection;
    const m = mount({ host, assemble: (t) => `<html>${t.length}</html>`, kind: 'md', fileName: 'week3.md.html' });
    type(m, '1');
    await expect(m.shell.save()).resolves.toEqual({ ok: true, via: 'host' });
    expect(posted).toEqual([['dirty', true], ['save', { source: `${CRLF_BOM}1`, html: `<html>${CRLF_BOM.length + 1}</html>` }], ['dirty', false]]);
    m.shell.destroy();
  });
});

// ── E.9 engines ──────────────────────────────────────────────────────────

describe('engines', () => {
  it('[E.9] codemirror6Adapter starts as an editable textarea and keeps it when CodeMirror cannot load (offline, or modules without the needed exports): ready() reports the error, the shell emits an adapter error and a warning toast, editing and saving still work', async () => {
    for (const loadModules of [() => Promise.reject(new Error('offline')), () => ({}) as never]) {
      const hook = vi.fn(async () => undefined);
      const m = mount({ adapter: codemirror6Adapter({ loadModules }), hooks: { save: hook } });
      const errors: string[] = [];
      m.shell.on('error', (e) => errors.push(e.source));
      expect(m.ta()).not.toBeNull();
      type(m, 'offline edit');
      const r = await m.shell.ready;
      expect(r.engine).toBe('textarea');
      expect(r.error).toBeInstanceOf(Error);
      expect(m.shell.adapter.name).toBe('textarea');
      expect(toasts(m.root)).toEqual(['The code editor could not be loaded — basic editing is available.']);
      expect(m.shell.getText()).toBe(`${CRLF_BOM}offline edit`);
      await m.shell.save();
      expect(hook).toHaveBeenCalledWith(`${CRLF_BOM}offline edit`);
      m.shell.destroy();
      void errors;
    }
  });

  it('[E.9] the textarea engine needs nothing from the network, keeps its own undo history (typing groups, a programmatic edit is one step, resetHistory clears it) and maps the selection across an edit', () => {
    const m = mount({ text: 'abc\ndef' });
    const ta = m.ta();
    ta.setSelectionRange(5, 5);
    m.shell.setText('XXabc\ndef');
    expect([ta.selectionStart, ta.selectionEnd]).toEqual([7, 7]);
    m.shell.setText('reset', { resetHistory: true });
    expect(m.shell.undo()).toBe(false);
    type(m, '1');
    m.shell.setText('replaced');
    m.shell.undo();
    expect(m.shell.getText()).toBe('reset1');
    m.shell.undo();
    expect(m.shell.getText()).toBe('reset');
    // Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z are the engine's own
    key(m, ta, 'z', { shift: true, ctrl: true });
    expect(m.shell.getText()).toBe('reset1');
    key(m, ta, 'z', { meta: true });
    expect(m.shell.getText()).toBe('reset');
    m.shell.destroy();
  });

  it('[E.9] isCodeMirror6Modules accepts module namespaces with the needed exports and refuses anything else', () => {
    const fn = () => undefined;
    const good = { state: { EditorState: fn }, view: { EditorView: fn, keymap: {} }, commands: { history: fn, defaultKeymap: [], historyKeymap: [], undo: fn, redo: fn }, language: { syntaxHighlighting: fn, defaultHighlightStyle: {} }, markdown: { markdownLanguage: {} } };
    expect(isCodeMirror6Modules(good)).toBe(true);
    expect(isCodeMirror6Modules({ ...good, markdown: {} })).toBe(false);
    expect(isCodeMirror6Modules({ ...good, commands: { ...good.commands, undo: 1 } })).toBe(false);
    expect(isCodeMirror6Modules(null)).toBe(false);
  });
});

// ── E.10 module boundaries ───────────────────────────────────────────────

function valueImports(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of readFileSync(f, 'utf8').matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?from\s*)?['"]([^'"]+)['"]/gm)) {
      if (!m[1].startsWith('.')) continue;
      const dir = f.slice(0, f.lastIndexOf('/'));
      const parts: string[] = [];
      for (const p of `${dir}/${m[1]}`.split('/')) { if (p === '..') parts.pop(); else if (p !== '.' && p) parts.push(p); }
      const base = parts.join('/').replace(/\.js$/, '');
      queue.push(existsSync(`${base}.ts`) ? `${base}.ts` : `${base}/index.ts`);
    }
  }
  return seen;
}

/** Measured 2026-10-05 (esbuild, ESM, browser, minified): the editor's own modules 32,823 B (the whole entry with the parser 1.15 MB; CodeMirror is not in it). Bound ≈ +30 %. */
const EDITOR_OWN_LIMIT = 43_000;

describe('module boundaries', () => {
  it('[E.10] carrier/shell and carrier/read stay parser-free and do not import the editor; carrier does not either; the package exports ./carrier/editor; the editor\'s own code (without the parser and CodeMirror) bundles under 43 KB', async () => {
    for (const entry of ['src/carrier/shell/index.ts', 'src/carrier/read.ts', 'src/carrier.ts', 'src/index.ts']) {
      expect([...valueImports(entry)].filter((f) => f.includes('carrier/editor')), entry).toEqual([]);
    }
    const shellGraph = [...valueImports('src/carrier/shell/index.ts')];
    expect(shellGraph.filter((f) => /src\/index\.ts|header\.ts|parser\.ts|document\.ts/.test(f))).toEqual([]);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { exports: Record<string, string>; files: string[] };
    expect(pkg.exports['./carrier/editor']).toBe('./dist/carrier/editor/index.js');
    expect(pkg.files).toContain('vendor');
    // the editor's own modules (the parser and the preview libraries' wiring come from the rest of the package)
    const { build } = await import('esbuild');
    const out = await build({ entryPoints: ['src/carrier/editor/index.ts'], bundle: true, minify: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent', metafile: true });
    const own = Object.entries(out.metafile!.outputs)[0][1].inputs;
    const editorBytes = Object.entries(own).filter(([f]) => f.startsWith('src/carrier/editor/')).reduce((n, [, v]) => n + v.bytesInOutput, 0);
    expect(editorBytes).toBeLessThan(EDITOR_OWN_LIMIT);
    expect(Object.keys(own).filter((f) => f.includes('@codemirror') || f.includes('vendor/'))).toEqual([]);
    if (existsSync('dist/carrier/editor/index.js')) {
      const dist = (await import('../dist/carrier/editor/index.js')) as Record<string, unknown>;
      expect(typeof dist.createEditorShell).toBe('function');
    }
  });

  it('[E.10] importing the editor adds no browser-global access to the parser\'s own: its bundle loads where window, document, storage, navigator, location and the rest throw, touching exactly what the parser entry alone touches (KaTeX\'s and markdown-it\'s feature detection) — no storage, no navigator, no location, no CodeMirror', async () => {
    const { build } = await import('esbuild');
    const load = async (entry: string) => {
      const out = await build({ entryPoints: [entry], bundle: true, platform: 'browser', format: 'cjs', write: false, logLevel: 'silent' });
      const touched: string[] = [];
      const ctx: Record<string, unknown> = { module: { exports: {} }, setTimeout, clearTimeout, console };
      for (const name of ['window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'location', 'self', 'parent', 'fetch', 'crypto', 'CSSStyleSheet', 'ResizeObserver', 'requestAnimationFrame', 'OrzCodeMirror6']) {
        Object.defineProperty(ctx, name, { get() { touched.push(name); throw new Error(`touched ${name}`); } });
      }
      ctx.exports = (ctx.module as { exports: unknown }).exports;
      ctx.globalThis = ctx;
      vm.createContext(ctx);
      vm.runInContext(out.outputFiles[0].text, ctx);
      return { touched: touched.sort(), api: (ctx.module as { exports: Record<string, unknown> }).exports };
    };
    const editor = await load('src/carrier/editor/index.ts');
    const parser = await load('src/index.ts');
    expect(Object.keys(editor.api)).toContain('createEditorShell');
    expect(editor.touched).toEqual(parser.touched);
    expect(editor.touched.filter((n) => n !== 'document' && n !== 'self')).toEqual([]);
  }, 30_000);
});

// ── E.11 the pinned CodeMirror bundle ────────────────────────────────────

describe('the pinned CodeMirror 6 bundle', () => {
  it('[E.11] vendor/codemirror6.js is the pinned build: its SHA-384 is CODEMIRROR6_INTEGRITY, its size CODEMIRROR6_BYTES, it is script-safe, its versions are the installed (exact devDependency) versions with ONE @codemirror/state, and it is served from jsDelivr under this package version', () => {
    const bytes = readFileSync(CODEMIRROR6_PATH);
    expect(`sha384-${createHash('sha384').update(bytes).digest('base64')}`).toBe(CODEMIRROR6_INTEGRITY);
    expect(bytes.byteLength).toBe(CODEMIRROR6_BYTES);
    const code = bytes.toString('utf8');
    expect(isScriptSafe(code)).toBe(true);
    expect(code).toMatch(new RegExp(`^"use strict";var ${CODEMIRROR6_GLOBAL}=`));
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { devDependencies: Record<string, string> };
    for (const [name, version] of Object.entries(CODEMIRROR6_VERSIONS)) {
      expect(JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version, name).toBe(version);
      if (pkg.devDependencies[name]) expect(pkg.devDependencies[name], name).toBe(version); // exact, no range
      expect(code, name).toContain(`"${name}":"${version}"`);
    }
    // one copy of @codemirror/state in the dependency tree
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as { packages: Record<string, { version: string }> };
    expect(Object.keys(lock.packages).filter((p) => p.endsWith('node_modules/@codemirror/state'))).toEqual(['node_modules/@codemirror/state']);
    expect(CODEMIRROR6_URL).toBe(`https://cdn.jsdelivr.net/npm/orz-markdown@${VERSION}/vendor/codemirror6.js`);
  });
});

// ── E.12 the md preview renderer ─────────────────────────────────────────

describe('renderMarkdownPreview', () => {
  it('[E.12] renders the body without its header, with twin links, every block stamped with data-src-line = its 0-based line in the whole text (header, BOM and CR LF counted), otherwise exactly what md.render gives', () => {
    const text = '﻿{{nyml\r\nkind: document\r\ntitle: T\r\n}}\r\n\r\n# Head\r\n\r\nSee [week 2](week2.slides.md#q) and [web](https://x.example/a.md).\r\n\r\n```js\r\ncode\r\n```\r\n\r\n- item\r\n';
    const html = renderMarkdownPreview(text);
    expect(html).not.toContain('kind: document');
    expect(html).toContain('<h1 id="head" tabindex="-1" data-src-line="5">Head</h1>');
    expect(html).toContain('<p data-src-line="7">');
    expect(html).toContain('href="week2.slides.html#q"');
    expect(html).toContain('href="https://x.example/a.md"');
    expect(html).toMatch(/<pre><code class="language-js" data-src-line="9">|data-src-line="9"/);
    expect(html).toContain('<ul data-src-line="13">');
    const body = withoutHeader(text).body;
    expect(html.replace(/ data-src-line="\d+"/g, '')).toBe(md.render(body, { orzTwinLinks: true }));
    expect(renderMarkdownPreview('[a](b.md)', { twinLinks: false })).toContain('href="b.md"');
  });
});

// ── E.13 real Chrome ─────────────────────────────────────────────────────

type Browser = import('playwright-core').Browser;
type Page = import('playwright-core').Page;

async function launch(): Promise<Browser | null> {
  try {
    const { chromium } = await import('playwright-core');
    return await chromium.launch({ channel: 'chrome' });
  } catch {
    return null;
  }
}

const browser = await launch();
const chrome = browser ? describe : describe.skip;

chrome('real Chrome (playwright-core, channel chrome)', { timeout: 120_000 }, () => {
  const servers: http.Server[] = [];
  let A = '';
  let editorJs = '';
  const cm = readFileSync(CODEMIRROR6_PATH, 'utf8');
  const TEXT_A = `﻿{{nyml\r\nkind: document\r\ntitle: A\r\nuid: ${UID_A}\r\n}}\r\n\r\n# Shell A\r\n\r\nParagraph <img src="x" onerror="var r={};try{parent.document.title='pwned'}catch(e){r.doc=e.name}try{r.ls=String(parent.localStorage.length)}catch(e){r.ls=e.name}try{r.mine=String(localStorage.length)}catch(e){r.mine=e.name}parent.postMessage({probe:r},'*');parent.postMessage({type:'orz-preview-key',key:'s'},'*');parent.postMessage({type:'orz-preview-link',href:'https://evil.example/'},'*')">\r\n`;
  const TEXT_B = `{{nyml\nkind: document\nuid: ${UID_B}\n}}\n\n# Shell B\n\n${Array.from({ length: 80 }, (_, i) => `Line ${i} of B.\n`).join('\n')}`;
  const APP = `
    window.__saved = { a: [], b: [], c: [] };
    window.__probes = [];
    window.addEventListener('message', function (e) { if (e.data && e.data.probe) window.__probes.push(e.data.probe); });
    // window listeners added by the editor and CodeMirror (not by the test driver's injected script)
    window.__listeners = 0;
    var ours = function () { return /[/](editor|cm6)[.]js/.test(String(new Error().stack)); };
    var add = window.addEventListener, rem = window.removeEventListener;
    window.addEventListener = function () { if (ours()) window.__listeners++; return add.apply(this, arguments); };
    window.removeEventListener = function () { if (ours()) window.__listeners--; return rem.apply(this, arguments); };
    window.mount = function (id, text, url) {
      var E = window.OrzEditor;
      var s = E.createEditorShell(document.getElementById(id), {
        text: text,
        render: function (t) { return E.renderMarkdownPreview(t); },
        adapter: E.codemirror6Adapter({ url: url }),
        hooks: { save: function (t) { window.__saved[id].push(t); return Promise.resolve(); } },
        preview: { assets: false, debounceMs: 50 },
      });
      window['shell_' + id] = s;
      return s.ready.then(function (r) { return { engine: r.engine, error: r.error ? String(r.error) : null }; });
    };`;

  beforeAll(async () => {
    const { build } = await import('esbuild');
    editorJs = (await build({ entryPoints: ['src/carrier/editor/index.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'OrzEditor', write: false, logLevel: 'silent' })).outputFiles[0].text;
    const server = http.createServer((req, res) => {
      const path = (req.url ?? '/').split('?')[0];
      const js = (body: string) => { res.setHeader('content-type', 'text/javascript; charset=utf-8'); res.setHeader('access-control-allow-origin', '*'); res.end(body); };
      if (path === '/editor.js') return js(editorJs);
      if (path === '/app.js') return js(APP);
      if (path === '/cm6.js') return js(cm);
      if (path === '/cm6-tampered.js') return js(`${cm}\n/* one byte more */`);
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end('<!doctype html><html><head><meta charset="utf-8"><title>host page</title><style>body{margin:0;font:30px serif;color:red} .box{width:1000px;height:420px} button{background:red}</style></head><body><div id="a" class="box"></div><div id="b" class="box"></div><div id="c" class="box"></div><script src="/editor.js"></script><script src="/app.js"></script></body></html>');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    servers.push(server);
    A = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    for (const s of servers) s.close();
  });

  const open = async (): Promise<Page> => {
    const p = await browser!.newPage({ viewport: { width: 1200, height: 1400 } });
    await p.goto(`${A}/`);
    await p.waitForFunction('typeof window.mount === "function"');
    return p;
  };
  const mountBoth = (p: Page) => p.evaluate(`Promise.all([mount('a', ${JSON.stringify(TEXT_A)}, ${JSON.stringify(`${A}/cm6.js`)}), mount('b', ${JSON.stringify(TEXT_B)}, ${JSON.stringify(`${A}/cm6.js`)})])`);
  const frameOf = async (p: Page, marker: string) => {
    for (let i = 0; i < 100; i++) {
      for (const f of p.frames()) {
        if (f === p.mainFrame()) continue;
        const html = await f.evaluate('document.getElementById("orz-doc") ? document.getElementById("orz-doc").innerHTML : ""').catch(() => '');
        if (String(html).includes(marker)) return f;
      }
      await p.waitForTimeout(50);
    }
    throw new Error(`no preview frame shows ${marker}`);
  };

  it('[E.13] [E.1] [E.5] [E.7] [E.4] two shells mount CodeMirror 6 from the pinned bundle (one SRI-checked script for the page), typing keeps each document\'s exact form, and the sandboxed previews update — the document\'s scripts run there but cannot reach the host page', async () => {
    const p = await open();
    expect(await mountBoth(p)).toEqual([{ engine: 'codemirror6', error: null }, { engine: 'codemirror6', error: null }]);
    expect(await p.evaluate('[].map.call(document.querySelectorAll("script[data-orz-editor]"), function (s) { return [s.integrity, s.crossOrigin]; })')).toEqual([[CODEMIRROR6_INTEGRITY, 'anonymous']]);
    expect(await p.evaluate('shell_a.getText() === ' + JSON.stringify(TEXT_A) + ' && shell_b.getText() === ' + JSON.stringify(TEXT_B))).toBe(true);
    // type in A
    const contentA = p.locator('#a .cm-content');
    await contentA.click();
    await p.keyboard.press('ControlOrMeta+End');
    await p.keyboard.type('Typed in A.');
    await p.keyboard.press('Enter');
    await p.keyboard.type('Second line');
    const a = await p.evaluate('shell_a.getText()') as string;
    expect(a).toBe(`${TEXT_A}Typed in A.\r\nSecond line`);
    expect(await p.evaluate('[shell_a.isDirty(), shell_b.isDirty(), shell_b.getText() === ' + JSON.stringify(TEXT_B) + ']')).toEqual([true, false, true]);
    // the preview of A updates; B's does not change
    const fa = await frameOf(p, 'Second line');
    expect(await fa.evaluate('document.querySelector("[data-src-line=\\"6\\"]").textContent')).toBe('Shell A');
    await frameOf(p, 'Line 79 of B.');
    // sandbox: exactly allow-scripts, opaque origin; the document's onerror ran and was refused the host
    const sandboxes = await p.evaluate('[shell_a, shell_b].map(function (s) { return s.root.querySelector("iframe").getAttribute("sandbox"); })');
    expect(sandboxes).toEqual(['allow-scripts', 'allow-scripts']);
    await p.waitForFunction('window.__probes.length > 0');
    const probe = (await p.evaluate('window.__probes[0]')) as Record<string, string>;
    expect(probe.doc).toBe('SecurityError');
    expect(probe.ls).toBe('SecurityError');
    expect(probe.mine).toBe('SecurityError'); // no storage of its own either (opaque origin)
    expect(await p.title()).toBe('host page');
    // the same script forged the frame's key and link messages: without the reader's activation they do nothing
    await p.waitForTimeout(200);
    expect(await p.evaluate('window.__saved.a.length')).toBe(0);
    expect(p.context().pages()).toHaveLength(1);
    // scroll sync on data-src-line anchors: B's editor scrolled to line ~120 brings the preview to "Line 59"; the preview scrolled back brings the editor up
    const fb = await frameOf(p, 'Line 79 of B.');
    await p.locator('#b .cm-content').hover();
    await p.evaluate(`(function () {
      var view = OrzCodeMirror6.view.EditorView.findFromDOM(shell_b.root.querySelector('.cm-editor'));
      var doc = view.state.doc, n = doc.toString().split('\\n').indexOf('Line 59 of B.') + 1;
      view.scrollDOM.scrollTop = view.lineBlockAt(doc.line(n).from).top;
    })()`);
    await expect.poll(async () => Number(await fb.evaluate('(document.scrollingElement || document.documentElement).scrollTop')), { timeout: 5000 }).toBeGreaterThan(100);
    // the paragraph at the top of the preview is the one at the top of the editor (CodeMirror settles its height estimates first)
    await expect.poll(async () => String(await fb.evaluate(`(function () {
      var y = (document.scrollingElement || document.documentElement).scrollTop, best = null;
      document.querySelectorAll('#orz-doc p').forEach(function (n) { var t = n.getBoundingClientRect().top + y; if (t <= y + 40) best = n.textContent; });
      return best;
    })()`)), { timeout: 5000 }).toMatch(/^Line (5[89]|60) of B\.$/); // within one paragraph
    await p.locator('#b iframe').hover();
    await p.mouse.wheel(0, -100000);
    await expect.poll(async () => Number(await p.locator('#b .cm-scroller').evaluate((el) => (el as HTMLElement).scrollTop)), { timeout: 5000 }).toBeLessThan(5);
    // the host page's CSS does not restyle the shell (shadow root)
    const style = await p.locator('#a .orz-editor__save').evaluate((el) => { const s = getComputedStyle(el); return [s.backgroundColor, s.fontSize]; });
    expect(style[0]).not.toBe('rgb(255, 0, 0)');
    expect(style[1]).toBe('13px');
    await p.close();
  });

  it('[E.13] [E.3] [E.4] [E.8] modes, keyboard and save in Chrome: the Preview button and Cmd/Ctrl+\\ switch views, Cmd/Ctrl+S inside CodeMirror (and inside the preview frame) saves the exact text through hooks.save and clears dirty, undo returns the exact original, Esc leaves the editor', async () => {
    const p = await open();
    await mountBoth(p);
    const content = p.locator('#a .cm-content');
    await content.click();
    await p.keyboard.press('ControlOrMeta+End');
    await p.keyboard.type('!');
    await p.keyboard.press('ControlOrMeta+s');
    await p.waitForFunction('window.__saved.a.length === 1');
    expect(await p.evaluate('window.__saved.a[0]')).toBe(`${TEXT_A}!`);
    expect(await p.evaluate('[shell_a.isDirty(), window.__saved.b.length]')).toEqual([false, 0]);
    // the same shortcut pressed inside the preview frame (the reader is there) saves too
    await p.locator('#a iframe').click({ position: { x: 300, y: 20 } });
    await p.keyboard.press('ControlOrMeta+s');
    await p.waitForFunction('window.__saved.a.length === 2');
    expect(await p.evaluate('window.__saved.a[1]')).toBe(`${TEXT_A}!`);
    await content.click();
    await p.keyboard.press('ControlOrMeta+z');
    expect(await p.evaluate('shell_a.getText()')).toBe(TEXT_A);
    // setHeader is one undoable edit in CodeMirror too
    await p.evaluate('shell_a.setHeader({ title: "Renamed" })');
    expect(await p.evaluate('shell_a.getText()')).toBe(editHeader(TEXT_A, { title: 'Renamed' }));
    await content.click();
    await p.keyboard.press('ControlOrMeta+z');
    expect(await p.evaluate('shell_a.getText()')).toBe(TEXT_A);
    // views
    await p.locator('#a [data-mode="preview"]').click();
    expect(await p.evaluate('[shell_a.getView(), getComputedStyle(shell_a.root.querySelector(".orz-editor__pane--editor")).display]')).toEqual(['preview', 'none']);
    await p.locator('#a [data-mode="split"]').click();
    await content.click();
    await p.keyboard.press('ControlOrMeta+Backslash');
    expect(await p.evaluate('[shell_a.getMode(), getComputedStyle(shell_a.root.querySelector(".orz-editor__pane--preview")).display]')).toEqual(['editor', 'none']);
    await p.keyboard.press('Escape');
    expect(await p.evaluate('shell_a.root.activeElement && shell_a.root.activeElement.getAttribute("data-mode")')).toBe('editor');
    expect(await p.evaluate('shell_b.getMode()')).toBe('split');
    await p.close();
  });

  it('[E.13] [E.6] [E.4] [E.7] dragging the split sets the ratio (stored per uid), a reload restores it, a narrow shell shows one pane, and destroy() removes every listener and iframe it added', async () => {
    const p = await open();
    await mountBoth(p);
    const divider = p.locator('#a [role="separator"]');
    const box = (await divider.boundingBox())!;
    const panes = (await p.locator('#a .orz-editor__panes').boundingBox())!;
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down();
    await p.mouse.move(panes.x + panes.width * 0.5, box.y + 50, { steps: 3 });
    await p.mouse.move(panes.x + panes.width * 0.3, box.y + 60, { steps: 5 });
    await p.mouse.up();
    const ratio = (await p.evaluate('shell_a.getSplitRatio()')) as number;
    expect(ratio).toBeGreaterThan(0.28);
    expect(ratio).toBeLessThan(0.32);
    const editorWidth = (await p.locator('#a .orz-editor__pane--editor').boundingBox())!.width;
    expect(editorWidth / panes.width).toBeCloseTo(ratio, 1);
    expect(await p.evaluate(`localStorage.getItem('orz-pref:${UID_A}:splitRatio')`)).toBe(String(ratio));
    expect(await p.evaluate('shell_b.getSplitRatio()')).toBe(0.5);
    await p.reload();
    await p.waitForFunction('typeof window.mount === "function"');
    await mountBoth(p);
    expect(await p.evaluate('[shell_a.getSplitRatio(), shell_b.getSplitRatio()]')).toEqual([ratio, 0.5]);
    // narrow: B's box becomes 500 px wide → one pane
    await p.evaluate('document.getElementById("b").style.width = "500px"');
    await p.waitForFunction('shell_b.getView() === "editor"');
    expect(await p.evaluate('[shell_b.getMode(), getComputedStyle(shell_b.root.querySelector(\'.orz-editor__mode[data-mode="split"]\')).display]')).toEqual(['split', 'none']);
    // destroy both: the page's window listeners are back to the count before mounting, no iframe is left
    const before = await p.evaluate('window.__listeners');
    expect(before).toBeGreaterThan(0);
    await p.evaluate('shell_a.destroy(); shell_b.destroy();');
    expect(await p.evaluate('window.__listeners')).toBe(0);
    expect(await p.evaluate('[document.querySelectorAll("iframe").length, document.getElementById("a").childElementCount, document.getElementById("b").childElementCount]')).toEqual([0, 0, 0]);
    await p.close();
  });

  it('[E.13] [E.9] [E.11] a bundle whose bytes differ from the pinned integrity is refused by the browser: the shell keeps the textarea engine, reports the error, and still edits and saves', async () => {
    const p = await open();
    const r = await p.evaluate(`mount('c', ${JSON.stringify(TEXT_A)}, ${JSON.stringify(`${A}/cm6-tampered.js`)})`) as { engine: string; error: string | null };
    expect(r.engine).toBe('textarea');
    expect(r.error).toMatch(/could not be loaded/);
    expect(await p.evaluate('typeof window.OrzCodeMirror6')).toBe('undefined');
    await p.locator('#c textarea').click();
    await p.locator('#c textarea').evaluate((ta) => { const t = ta as HTMLTextAreaElement; t.setSelectionRange(t.value.length, t.value.length); });
    await p.keyboard.type('fallback');
    await p.keyboard.press('ControlOrMeta+s');
    await p.waitForFunction('window.__saved.c.length === 1');
    expect(await p.evaluate('window.__saved.c[0]')).toBe(`${TEXT_A}fallback`);
    expect(await p.evaluate('shell_c.getText()')).toBe(`${TEXT_A}fallback`);
    await p.close();
  });
});

