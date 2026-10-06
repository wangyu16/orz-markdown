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
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import http from 'node:http';
import vm from 'node:vm';
import type { AddressInfo } from 'node:net';
import {
  createEditorShell, textareaAdapter, codemirror6Adapter, createTextModel, toEditorText, minimalChange, createPreview, previewFrameDocument,
  lineToTop, topToLine, renderMarkdownPreview, isCodeMirror6Modules, PREVIEW_SANDBOX, PREVIEW_BRIDGE, CODEMIRROR6_URL, CODEMIRROR6_VERSIONS,
  CODEMIRROR6_INTEGRITY, CODEMIRROR6_BYTES, CODEMIRROR6_PATH, CODEMIRROR6_GLOBAL, EDITOR_CSS, PREVIEW_BRIDGE_HASH, previewScriptHashes,
  previewSandbox, rewriteAssetUrls,
  type EditorShell, type EditorShellOptions, type EdElement, type EdDocument, type EdFile, type RenderContext,
} from '../src/carrier/editor';
import { historyChars, undoTexts } from '../src/carrier/editor/adapter';
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
    expect((r.root.querySelector('.orz-editor__save') as HTMLElement).hidden).toBe(true);
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

/**
 * Measured (esbuild, ESM, browser, minified): the editor's own modules 32,823 B on 2026-10-05; 44,825 B on
 * 2026-10-06 after closed loop 2 round 1 (hooks, formats, pluggable preview, CSP, gating, patch history).
 * The whole entry is 1.17 MB with the parser, which header.ts brings in (kitParser); CodeMirror is not in it.
 * Bound ≈ +30 %.
 */
const EDITOR_OWN_LIMIT = 57_000;

describe('module boundaries', () => {
  it('[E.10] carrier/shell and carrier/read stay parser-free and do not import the editor; carrier does not either; the package exports ./carrier/editor; the editor\'s own code (without the parser and CodeMirror) bundles under 57 KB', async () => {
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

// ── round 1 of closed loop 2: findings A-2…A-6, B-3…B-19 ─────────────────

/** The shell's preview frame, driven from the test: what the shell posts to it, and messages "from" it. */
function frameOf(m: Mounted) {
  const iframe = m.root.querySelector('iframe') as HTMLIFrameElement;
  const cw = iframe.contentWindow as unknown as { postMessage: unknown };
  const posted: Array<Record<string, unknown>> = [];
  cw.postMessage = (msg: Record<string, unknown>) => { posted.push(msg); };
  const say = (data: unknown) => { m.win.dispatchEvent(new m.win.MessageEvent('message', { data, source: cw as never }) as unknown as Event); };
  return { iframe, posted, say };
}
/** `navigator.userActivation.isActive` as the browser would report it. */
const activation = (m: Mounted, isActive: boolean) => Object.defineProperty(m.win.navigator, 'userActivation', { value: { isActive }, configurable: true });

describe('the exact text across undo (A-3, A-4)', () => {
  it('[E.1] each remembered text keeps its own BOM and line endings: a BOM + CR LF document, setText of an LF text, undo, then typing writes BOM + CR LF again; selection offsets in a remembered mixed-EOL text are mapped on that exact string', () => {
    const T0 = '﻿a\r\nb';
    const model = createTextModel(T0);
    model.adopt('x\ny'); // e.g. an AI proposal in LF without a BOM
    expect(model.toExact('a\nb')).toBe(T0); // undone back: exact
    expect(model.toExact('a\nbc')).toBe('﻿a\r\nbc'); // the next keystroke keeps the original's style
    expect(model.toExact('x\ny')).toBe('x\ny'); // back at the LF text: LF without a BOM again
    expect(model.toExact('x\nyz\n')).toBe('x\nyz\n');
    const mixed = createTextModel('a\nb\r\nc'); // style LF (first break), but a CR LF inside
    expect(mixed.toExactOffset('a\nb\nc', 4)).toBe(5);
    expect(mixed.toExactOffset('a\nb\nc', 3)).toBe(3);
    // through the shell, with the textarea engine
    const m = mount({ text: '﻿# Title\r\n\r\nBody\r\n' });
    m.shell.setText('# AI proposal\n\nNew body\n');
    expect(m.shell.undo()).toBe(true);
    expect(m.shell.getText()).toBe('﻿# Title\r\n\r\nBody\r\n');
    type(m, 'More\n');
    expect(m.shell.getText()).toBe('﻿# Title\r\n\r\nBody\r\nMore\r\n');
    m.shell.destroy();
  });
});

describe('events (B-13)', () => {
  it('[E.2] the change event carries the exact text as it was when the event fired (a plain value, not a live getter)', () => {
    const m = mount();
    const seen: Array<{ text: string }> = [];
    m.shell.on('change', (e) => seen.push(e));
    type(m, 'a');
    type(m, 'b');
    expect(seen.map((e) => e.text)).toEqual([`${CRLF_BOM}a`, `${CRLF_BOM}ab`]);
    expect(typeof Object.getOwnPropertyDescriptor(seen[0], 'text')!.value).toBe('string');
    m.shell.destroy();
  });
});

describe('frame messages (A-2, E06)', () => {
  it('[E.14] a forged Escape moves focus only while the preview frame has it; a save key, the view key or a link from the frame needs focus on the frame AND transient user activation; nothing happens while the reader is in the editor', async () => {
    const save = vi.fn(async () => undefined);
    const links: string[] = [];
    const m = mount({ hooks: { save }, onLink: (h) => links.push(h) });
    const f = frameOf(m);
    f.say({ type: 'orz-preview-ready' });
    const ta = m.ta();
    ta.focus();
    activation(m, true); // the reader is typing: the page has activation
    for (const key of ['Escape', 's', '\\']) f.say({ type: 'orz-preview-key', key });
    f.say({ type: 'orz-preview-link', href: 'https://evil.example/' });
    await tick();
    expect(m.root.activeElement).toBe(ta);
    expect(save).not.toHaveBeenCalled();
    expect(m.shell.getMode()).toBe('split');
    expect(links).toEqual([]);
    // focus on the frame but no activation (e.g. focused by a script): still nothing
    f.iframe.focus();
    activation(m, false);
    f.say({ type: 'orz-preview-key', key: 's' });
    f.say({ type: 'orz-preview-link', href: 'https://evil.example/' });
    await tick();
    expect(save).not.toHaveBeenCalled();
    expect(links).toEqual([]);
    // Escape with focus on the frame: focus goes to the toolbar (all it can do)
    f.say({ type: 'orz-preview-key', key: 'Escape' });
    expect(m.root.activeElement?.getAttribute('data-mode')).toBe('split');
    // the reader in the frame (focus + activation): save and link act
    f.iframe.focus();
    activation(m, true);
    f.say({ type: 'orz-preview-key', key: 's' });
    f.say({ type: 'orz-preview-link', href: 'https://example.org/' });
    await tick();
    expect(save).toHaveBeenCalledTimes(1);
    expect(links).toEqual(['https://example.org/']);
    m.shell.destroy();
  });

  it('[E.14] the frame\'s "active" and scroll messages never move an editor that has focus or that the reader just touched; the preview leads only after its own claim, with the editor untouched', async () => {
    const engine = textareaAdapter();
    const scrollTo = vi.spyOn(engine, 'scrollTo');
    const m = mount({ adapter: engine });
    const f = frameOf(m);
    f.say({ type: 'orz-preview-ready' });
    const flood = () => { f.say({ type: 'orz-preview-active' }); f.say({ type: 'orz-preview-scrolled', top: 0, max: 1000 }); };
    m.ta().focus();
    await tick(350);
    flood();
    expect(scrollTo).not.toHaveBeenCalled(); // the editor has focus
    m.ta().blur();
    m.ta().dispatchEvent(new m.win.PointerEvent('pointermove', { bubbles: true }) as unknown as Event);
    flood();
    expect(scrollTo).not.toHaveBeenCalled(); // the reader's pointer is on the editor
    await tick(1600); // the frame's earlier claims have expired
    f.say({ type: 'orz-preview-scrolled', top: 500, max: 1000 });
    expect(scrollTo).not.toHaveBeenCalled(); // no fresh claim of the frame
    flood();
    expect(scrollTo).toHaveBeenCalledWith({ fraction: 0 }); // the reader is in the preview (as far as the page can tell)
    m.shell.destroy();
  });
});

describe('preview rendering (B-5, B-9, B-11, item 11)', () => {
  it('[E.16] renders wait max(debounceMs, 2 × the last render time), never overlap, and coalesce: a slow renderer runs a few times for a burst of typing, not once per keystroke, and the last render is of the final text', async () => {
    let running = 0;
    let most = 0;
    const texts: string[] = [];
    const render = async (t: string) => {
      running++;
      most = Math.max(most, running);
      await tick(40);
      running--;
      texts.push(t);
      return `<p>${t.length}</p>`;
    };
    const m = mount({ render, preview: { assets: false, debounceMs: 10 } });
    await tick(80); // the first render (40 ms) sets the pace: 80 ms pauses from now on
    const before = texts.length;
    for (let i = 0; i < 20; i++) { type(m, 'x'); await tick(25); } // a keystroke every 25 ms > debounceMs
    await tick(300);
    const during = texts.length - before;
    expect(during).toBeLessThanOrEqual(5); // 20 keystrokes; at the fixed 10 ms pause it was one render per key
    expect(most).toBe(1);
    expect(texts.at(-1)).toBe(m.shell.getText());
    // refreshPreview during a render waits for it, then renders the latest text
    type(m, 'y');
    const p = m.shell.refreshPreview();
    type(m, 'z');
    await m.shell.refreshPreview();
    await p;
    expect(texts.at(-1)).toBe(m.shell.getText());
    expect(most).toBe(1);
    m.shell.destroy();
  });

  it('[E.15] a carrier can supply its own frame document and bridge, turn the incremental diff off, navigate by source line, and map lines ↔ tops', async () => {
    const parts: unknown[] = [];
    const custom = previewFrameDocument({ assets: false, bridge: 'window.parent.postMessage({type:"orz-preview-ready"},"*")', nonce: 'n1', frameDocument: (p) => { parts.push(p); return `<!doctype html><div id="orz-doc"></div>${p.bridge}`; } });
    expect(custom).toBe('<!doctype html><div id="orz-doc"></div><script nonce="n1">window.parent.postMessage({type:"orz-preview-ready"},"*")</script>');
    expect(parts[0]).toMatchObject({ scripts: '', scheme: 'light', articleClass: 'markdown-body', nonce: 'n1' });
    expect(previewFrameDocument()).toContain(`<script>${PREVIEW_BRIDGE}</script>`);
    // diff: false → the render message says so (the bridge replaces the content whole, keeping the scroll)
    const whole = mount({ render: (t) => `<p>${t.length}</p>`, preview: { assets: false, debounceMs: 5, diff: false } });
    const fw = frameOf(whole);
    fw.say({ type: 'orz-preview-ready' });
    await tick(30);
    expect(fw.posted.find((x) => x.type === 'orz-preview-render')).toMatchObject({ diff: false });
    expect(PREVIEW_BRIDGE).toContain('d.diff===false');
    whole.shell.destroy();
    // navigate: the caret's source line goes to the frame; a line the frame reports scrolls the editor
    const engine = textareaAdapter();
    const scrollTo = vi.spyOn(engine, 'scrollTo');
    const nav = mount({ text: 'a\nb\nc\nd\ne\n', adapter: engine, preview: { assets: false, debounceMs: 5, mode: 'navigate' } });
    const fn = frameOf(nav);
    fn.say({ type: 'orz-preview-ready' });
    nav.ta().focus();
    nav.ta().setSelectionRange(6, 6); // line 3
    nav.ta().dispatchEvent(new nav.win.Event('select') as unknown as Event);
    await tick(40);
    expect(fn.posted.filter((x) => x.type === 'orz-preview-navigate').at(-1)).toEqual({ type: 'orz-preview-navigate', line: 3 });
    fn.iframe.focus();
    fn.say({ type: 'orz-preview-scrolled', line: 4 });
    expect(scrollTo).toHaveBeenLastCalledWith({ line: 4 });
    nav.shell.destroy();
    // mapLine / mapPosition replace the anchor maths
    const mapped = textareaAdapter();
    vi.spyOn(mapped, 'getScroll').mockReturnValue({ line: 4, fraction: 0.5 });
    const toLine = vi.spyOn(mapped, 'scrollTo');
    const mp = mount({ adapter: mapped, preview: { assets: false, debounceMs: 5, mapLine: (l) => l * 10, mapPosition: (t) => t / 10 } });
    const fm = frameOf(mp);
    fm.say({ type: 'orz-preview-ready' });
    mp.ta().dispatchEvent(new mp.win.Event('scroll') as unknown as Event);
    await tick(40);
    expect(fm.posted.filter((x) => x.type === 'orz-preview-scroll').at(-1)).toEqual({ type: 'orz-preview-scroll', top: 40 });
    fm.iframe.focus();
    fm.say({ type: 'orz-preview-scrolled', top: 70, max: 1000 });
    expect(toLine).toHaveBeenLastCalledWith({ line: 7 });
    mp.shell.destroy();
  });

  it('[E.19] preview.nonce is stamped on every <script> and <style> of the frame document; PREVIEW_BRIDGE_HASH is the bridge\'s SHA-256 and previewScriptHashes lists every inline script; a frame that never says ready is an error (render) and a quiet notice, gone when it starts', async () => {
    const full = previewFrameDocument({ nonce: 'r4nd"om', head: '<style>.x{}</style>' });
    const tags = full.match(/<(script|style)\b[^>]*>/g)!;
    expect(tags.length).toBeGreaterThan(6);
    for (const t of tags) expect(t).toContain(' nonce="r4nd&quot;om"');
    expect(PREVIEW_BRIDGE_HASH).toBe(`sha256-${createHash('sha256').update(PREVIEW_BRIDGE, 'utf8').digest('base64')}`);
    const inline = [...previewFrameDocument().matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => `sha256-${createHash('sha256').update(x[1], 'utf8').digest('base64')}`);
    expect(await previewScriptHashes()).toEqual([...new Set(inline)]);
    expect(await previewScriptHashes({ assets: false })).toEqual([PREVIEW_BRIDGE_HASH]);
    const m = mount({ preview: { assets: false, readyTimeoutMs: 30 } });
    const errors: string[] = [];
    m.shell.on('error', (e) => errors.push(e.source));
    const f = frameOf(m);
    await tick(60);
    expect(errors).toEqual(['render']);
    expect(m.root.querySelector('.orz-editor__preview-note')!.textContent).toBe('The preview could not start on this page.');
    f.say({ type: 'orz-preview-ready' });
    expect(m.root.querySelector('.orz-editor__preview-note')).toBeNull();
    m.shell.destroy();
    // a frame that starts in time: no error, no notice
    const ok = mount({ preview: { assets: false, readyTimeoutMs: 30 } });
    frameOf(ok).say({ type: 'orz-preview-ready' });
    const none: string[] = [];
    ok.shell.on('error', (e) => none.push(e.source));
    await tick(60);
    expect(none).toEqual([]);
    ok.shell.destroy();
  });

  it('[E.20] the preview sandbox is decided in one place, previewSandbox(context): allow-scripts for every app host and every served page, plus allow-same-origin only for a standalone file: page (owner, B-2); the shell passes it the host kind and the page protocol', () => {
    for (const host of ['app', 'standalone'] as const) {
      for (const protocol of ['https:', 'http:', 'file:', 'blob:', '']) {
        expect(previewSandbox({ host, protocol })).toBe(host === 'standalone' && protocol === 'file:' ? 'allow-scripts allow-same-origin' : 'allow-scripts');
      }
    }
    const src = readFileSync('src/carrier/editor/preview.ts', 'utf8');
    expect(src.match(/setAttribute\('sandbox'/g)).toHaveLength(1);
    expect(src).toContain("iframe.setAttribute('sandbox', previewSandbox(");
    for (const f of ['adapter', 'codemirror6', 'index', 'preview', 'render-md', 'shell', 'styles', 'text-model', 'types']) {
      const code = readFileSync(`src/carrier/editor/${f}.ts`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); // code, not comments
      if (f === 'preview') expect(code.match(/allow-same-origin/g), f).toHaveLength(1); // previewSandbox's file: case only
      else expect(code, f).not.toContain('allow-same-origin');
      if (f !== 'preview') expect(code, f).not.toMatch(/setAttribute\(\s*['"]sandbox/);
    }
    const ctx = page();
    const el = ctx.mountPoint();
    const s = createEditorShell(el, { text: '# x', render: () => '', adapter: textareaAdapter(), assemble: () => '', preview: { assets: false } });
    expect((s.root as unknown as ShadowRoot).querySelector('iframe')!.getAttribute('sandbox')).toBe('allow-scripts');
    s.destroy();
  });
});

describe('text formats (B-8, FC-18 §8.4)', () => {
  it('[E.17] a header format newer than formats (default [1]) opens read-only with a quiet notice and an error (format); save() refuses without calling hooks.save or the saver; formats: [1, 2] edits it; a newer format set later is not saved either', async () => {
    const text = `{{nyml\nkind: document\nformat: 2\nuid: ${UID_B}\n}}\n\n# Future\n`;
    const save = vi.fn(async () => undefined);
    const saver = fakeSaver({ via: 'file', ok: true });
    const m = mount({ text, hooks: { save } });
    const errors: unknown[] = [];
    m.shell.on('error', (e) => errors.push([e.source, e.message]));
    await tick();
    expect(errors).toEqual([['format', 'text format 2 is newer than this editor (format 1): read-only, not saved']]);
    expect(m.shell.readOnly).toBe(true);
    expect(m.ta().readOnly).toBe(true);
    expect((m.root.querySelector('.orz-editor__save') as HTMLElement).hidden).toBe(true);
    expect(m.root.querySelector('#orz-format-note')!.textContent).toContain('text format 2');
    m.shell.setReadOnly(false); // a newer format stays read-only
    expect([m.shell.isReadOnly(), m.shell.readOnly, m.ta().readOnly]).toEqual([true, true, true]);
    const r = await m.shell.save();
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain('newer than this editor');
    key(m, m.ta(), 's', { ctrl: true });
    await tick();
    expect(save).not.toHaveBeenCalled();
    m.shell.destroy();
    const s = mount({ text, assemble: () => '<html>', saver: saver.saver });
    expect(await s.shell.save()).toMatchObject({ ok: false });
    expect(saver.saves).toEqual([]);
    s.shell.destroy();
    // a shell that reads format 2
    const two = mount({ text, formats: [1, 2], hooks: { save } });
    expect(two.shell.readOnly).toBe(false);
    expect(two.root.querySelector('#orz-format-note')).toBeNull();
    await expect(two.shell.save()).resolves.toEqual({ ok: true, via: 'hook' });
    two.shell.destroy();
    // format 1 text, then a newer format set through the API: not saved
    const later = mount({ text: TEXTS.LF, hooks: { save } });
    later.shell.setHeader({ format: '3' });
    expect(await later.shell.save()).toMatchObject({ ok: false });
    expect(save).toHaveBeenCalledTimes(1);
    later.shell.destroy();
  });
});

describe('save notices (B-3, B-16)', () => {
  it('[E.8] a download says "Download started." (the browser has it, it may not have finished) and clears dirty; on a served page Cmd/Ctrl+S with nothing unsaved stays quiet, with unsaved edits it shows the notice', async () => {
    const dl = fakeSaver({ via: 'download', ok: true, confirmed: false } as SaveResult);
    const m = mount({ assemble: () => '<html>', saver: dl.saver });
    type(m, 'x');
    await expect(m.shell.save()).resolves.toEqual({ ok: true, via: 'download' });
    expect(toasts(m.root)).toEqual(['Download started.']);
    expect(m.shell.isDirty()).toBe(false);
    m.shell.destroy();
    const served = fakeSaver({ via: 'served-notice' });
    const s = mount({ assemble: () => '<html>', saver: served.saver });
    key(s, s.ta(), 's', { meta: true });
    await tick(10);
    expect(s.root.querySelector('#orz-served-note')).toBeNull();
    type(s, 'edit');
    key(s, s.ta(), 's', { meta: true });
    await tick(10);
    expect(s.root.querySelector('#orz-served-note')).not.toBeNull();
    s.shell.destroy();
  });
});

describe('FC-19 §3 hooks (B-10)', () => {
  it('[E.18] rewriteAssetUrls sends relative src / srcset / poster (and href of non-links) through resolveAsset; absolute, root, fragment and data references, <a href> and unreadable tags stay; a throwing resolver leaves the reference', () => {
    const r = (p: string) => (p === 'boom.png' ? (() => { throw new Error('x'); })() : `blob:app/${p}`);
    expect(rewriteAssetUrls('<p><img src="a b.png" alt="x"><img src=\'c.png\'><img src=d.png></p>', r)).toBe('<p><img src="blob:app/a b.png" alt="x"><img src="blob:app/c.png"><img src="blob:app/d.png"></p>');
    expect(rewriteAssetUrls('<img srcset="s1.png 1x, https://x/s2.png 2x, s3.png 3x">', r)).toBe('<img srcset="blob:app/s1.png 1x, https://x/s2.png 2x, blob:app/s3.png 3x">');
    expect(rewriteAssetUrls('<video poster="p.jpg" src="v.mp4"></video><link rel="stylesheet" href="t.css">', r)).toBe('<video poster="blob:app/p.jpg" src="blob:app/v.mp4"></video><link rel="stylesheet" href="blob:app/t.css">');
    const kept = '<a href="x.md">x</a><img src="https://h/i.png"><img src="/root.png"><img src="#f"><img src="data:image/png;base64,AA"><img src="//cdn/x.png"><img src="boom.png"><img src="">';
    expect(rewriteAssetUrls(kept, r)).toBe(kept);
    expect(rewriteAssetUrls('<img src="a&amp;b.png">', (p) => `u:${p}`)).toBe('<img src="u:a&amp;b.png">');
    expect(rewriteAssetUrls('<p>text with src="x.png" in it</p>', r)).toBe('<p>text with src="x.png" in it</p>');
    // renderMarkdownPreview takes the render context, so it can be passed as `render` directly
    const direct = mount({ render: renderMarkdownPreview, hooks: { resolveAsset: (p) => `u:${p}` } });
    expect(direct.shell.getText()).toBe(CRLF_BOM);
    direct.shell.destroy();
  });

  it('[E.18] render gets a context with the host\'s fetchInclude and resolveAsset; the preview receives the HTML with assets resolved; a preview link goes through resolveLink, then onLink', async () => {
    const ctxs: RenderContext[] = [];
    const fetchInclude = vi.fn(async (t: string) => `included ${t}`);
    const links: string[] = [];
    const m = mount({
      text: '![p](img/p.png)\n',
      render: (t, ctx) => { ctxs.push(ctx); return renderMarkdownPreview(t); },
      hooks: { fetchInclude, resolveAsset: (p) => `https://cdn.app/${p}`, resolveLink: (h) => `https://app.example/open?d=${encodeURIComponent(h)}` },
      onLink: (h) => links.push(h),
    });
    const f = frameOf(m);
    f.say({ type: 'orz-preview-ready' });
    await tick(40);
    expect(await ctxs[0].fetchInclude!('a.md')).toBe('included a.md');
    expect(ctxs[0].resolveAsset!('x.png')).toBe('https://cdn.app/x.png');
    const html = String(f.posted.filter((x) => x.type === 'orz-preview-render').at(-1)!.html);
    expect(html).toContain('src="https://cdn.app/img/p.png"');
    f.iframe.focus();
    activation(m, true);
    f.say({ type: 'orz-preview-link', href: 'week2.md' });
    expect(links).toEqual(['https://app.example/open?d=week2.md']);
    m.shell.destroy();
  });

  it('[E.18] a file pasted or dropped into the editor goes to uploadAsset and its Markdown (image or link) is inserted at the caret as ONE undoable edit in the document\'s line endings; without the hook the engine keeps the event', async () => {
    const uploadAsset = vi.fn(async (f: EdFile) => `assets/${f.name}`);
    const m = mount({ text: 'a\r\nb\r\n', hooks: { uploadAsset } });
    const ta = m.ta();
    ta.focus();
    ta.setSelectionRange(2, 2); // start of line "b" (editor offsets)
    const paste = new m.win.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { files: [{ name: 'my pic (1).png', type: 'image/png', size: 3 }, { name: 'notes.pdf', type: 'application/pdf', size: 9 }] } });
    ta.dispatchEvent(paste as unknown as Event);
    expect(paste.defaultPrevented).toBe(true);
    await tick(10);
    expect(m.shell.getText()).toBe('a\r\n![my pic (1)](assets/my%20pic%20%281%29.png)\r\n[notes.pdf](assets/notes.pdf)b\r\n');
    expect(ta.selectionStart).toBe(2 + '![my pic (1)](assets/my%20pic%20%281%29.png)\n[notes.pdf](assets/notes.pdf)'.length);
    expect(m.shell.undo()).toBe(true);
    expect(m.shell.getText()).toBe('a\r\nb\r\n');
    const drop = new m.win.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [{ name: 'd.jpg', type: 'image/jpeg', size: 1 }], types: ['Files'] } });
    ta.dispatchEvent(drop as unknown as Event);
    await tick(10);
    expect(m.shell.getText()).toContain('![d](assets/d.jpg)');
    // a failing upload: an error (hook), a toast, nothing inserted
    const bad = mount({ hooks: { uploadAsset: async () => { throw new Error('too large'); } } });
    const errors: string[] = [];
    bad.shell.on('error', (e) => errors.push(`${e.source}: ${e.message}`));
    const before = bad.shell.getText();
    await expect(bad.shell.uploadAssets([{ name: 'x.png', type: 'image/png', size: 1 }])).resolves.toEqual({ ok: false, inserted: [], error: 'too large' });
    expect(errors).toEqual(['hook: too large']);
    expect(bad.shell.getText()).toBe(before);
    // no hook: the paste is the engine's
    const none = mount();
    const p2 = new none.win.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(p2, 'clipboardData', { value: { files: [{ name: 'x.png', type: 'image/png', size: 1 }] } });
    none.ta().dispatchEvent(p2 as unknown as Event);
    expect(p2.defaultPrevented).toBe(false);
    for (const s of [m, bad, none]) s.shell.destroy();
  });

  it('[E.18] requestAi sends the exact text (and the selection as exact offsets) to hooks.ai.request and applies proposed as ONE undoable edit in the document\'s line endings and BOM; a changed text, a failed hook or read-only refuse', async () => {
    const calls: unknown[] = [];
    let reply = 'Better\nwords';
    const request = vi.fn(async (op: string, ctx: { text: string; selection?: { from: number; to: number } }) => { calls.push([op, ctx]); return { proposed: reply }; });
    const ai = { operations: [{ id: 'rewrite', title: 'Rewrite', selection: true }, { id: 'tidy', title: 'Tidy', selection: false }], request };
    const m = mount({ hooks: { ai } });
    const editor = toEditorText(CRLF_BOM);
    const at = editor.indexOf('# Week 3');
    m.ta().setSelectionRange(at, at + '# Week 3'.length);
    await expect(m.shell.requestAi('rewrite')).resolves.toEqual({ ok: true, op: 'rewrite' });
    const [, ctx] = calls[0] as [string, { text: string; selection: { from: number; to: number } }];
    expect(ctx.text).toBe(CRLF_BOM);
    expect(CRLF_BOM.slice(ctx.selection.from, ctx.selection.to)).toBe('# Week 3');
    expect(m.shell.getText()).toBe(CRLF_BOM.replace('# Week 3', 'Better\r\nwords'));
    expect(m.shell.undo()).toBe(true);
    expect(m.shell.getText()).toBe(CRLF_BOM);
    // whole-text operation: the document keeps its BOM and CR LF
    reply = '# All new\n\ntext\n';
    await expect(m.shell.requestAi('tidy')).resolves.toEqual({ ok: true, op: 'tidy' });
    expect(m.shell.getText()).toBe('﻿# All new\r\n\r\ntext\r\n');
    m.shell.undo();
    // the reader typed while the request ran: refused, nothing applied
    request.mockImplementationOnce(async () => { type(m, 'typed'); return { proposed: 'late' }; });
    expect(await m.shell.requestAi('tidy')).toEqual({ ok: false, error: 'the text changed during the AI request' });
    expect(m.shell.getText()).toBe(`${CRLF_BOM}typed`);
    request.mockImplementationOnce(async () => { throw new Error('quota'); });
    expect(await m.shell.requestAi('tidy')).toEqual({ ok: false, error: 'quota' });
    m.ta().setSelectionRange(3, 3);
    expect(await m.shell.requestAi('rewrite')).toEqual({ ok: false, error: 'no selection' });
    m.shell.destroy();
    const ro = mount({ readOnly: true, hooks: { ai } });
    expect(await ro.shell.requestAi('tidy')).toEqual({ ok: false, error: 'read-only' });
    ro.shell.destroy();
  });

  it('[E.18] ensureUid returns the header uid, or mints one (hooks.mintUid, else the kit\'s) and sets it as one undoable header edit; a malformed minted uid is refused', async () => {
    const withUid = mount();
    const mint = vi.fn(async () => 'doc-hostminted00001');
    expect(await withUid.shell.ensureUid()).toBe(UID_A);
    withUid.shell.destroy();
    const m = mount({ text: '# No header\r\n', hooks: { mintUid: mint } });
    expect(await m.shell.ensureUid()).toBe('doc-hostminted00001');
    expect(m.shell.getText()).toBe('{{nyml\r\nkind: document\r\nuid: doc-hostminted00001\r\n}}\r\n\r\n# No header\r\n');
    expect(await m.shell.ensureUid()).toBe('doc-hostminted00001');
    expect(mint).toHaveBeenCalledTimes(1);
    m.shell.undo();
    expect(m.shell.getText()).toBe('# No header\r\n');
    m.shell.destroy();
    const kit = mount({ text: TEXTS['no header'] });
    expect(await kit.shell.ensureUid()).toMatch(/^doc-[0-9a-z]{16}$/);
    kit.shell.destroy();
    const bad = mount({ text: '# x\n', hooks: { mintUid: async () => 'not-a-uid' } });
    await expect(bad.shell.ensureUid()).rejects.toThrow(/must match/);
    expect(bad.shell.getText()).toBe('# x\n');
    bad.shell.destroy();
  });
});

describe('read-only at run time (shell-runtime §7.2)', () => {
  it('[E.22] setReadOnly(true) makes the engine read-only, hides Save and refuses save, Cmd/Ctrl+S, uploads and AI; setReadOnly(false) restores all of it; isReadOnly() and readOnly follow', async () => {
    const save = vi.fn(async () => undefined);
    const uploadAsset = vi.fn(async () => 'a.png');
    const ai = { operations: [{ id: 'tidy', title: 'Tidy', selection: false }], request: vi.fn(async () => ({ proposed: 'x' })) };
    const m = mount({ hooks: { save, uploadAsset, ai } });
    const btn = m.root.querySelector('.orz-editor__save') as HTMLElement;
    expect([m.shell.isReadOnly(), btn.hidden, m.ta().readOnly]).toEqual([false, false, false]);
    m.shell.setReadOnly(true);
    expect([m.shell.isReadOnly(), m.shell.readOnly, btn.hidden, m.ta().readOnly]).toEqual([true, true, true, true]);
    expect(m.root.querySelector('.orz-editor')!.hasAttribute('data-readonly')).toBe(true);
    expect(await m.shell.save()).toEqual({ ok: false, error: 'read-only' });
    key(m, m.ta(), 's', { ctrl: true });
    expect(await m.shell.uploadAssets([{ name: 'a.png', type: 'image/png', size: 1 }])).toMatchObject({ ok: false, error: 'read-only' });
    expect(await m.shell.requestAi('tidy')).toEqual({ ok: false, error: 'read-only' });
    await tick();
    expect([save.mock.calls.length, uploadAsset.mock.calls.length, ai.request.mock.calls.length]).toEqual([0, 0, 0]);
    expect(m.shell.getText()).toBe(CRLF_BOM);
    m.shell.setReadOnly(false);
    expect([m.shell.isReadOnly(), btn.hidden, m.ta().readOnly]).toEqual([false, false, false]);
    type(m, '!');
    await expect(m.shell.save()).resolves.toEqual({ ok: true, via: 'hook' });
    m.shell.destroy();
  });
});

describe('engine history (B-19)', () => {
  it('[E.21] the textarea history stores patches, not copies: 60 steps of a 200 KB text hold about two copies, and undo/redo walk every step exactly', () => {
    const big = `${'Lorem ipsum dolor sit amet. '.repeat(7300)}\n`;
    const m = mount({ text: big });
    const states = [m.shell.getText()];
    for (let i = 0; i < 60; i++) {
      const t = m.shell.getText();
      const at = (i * 3331) % t.length;
      m.shell.setText(t.slice(0, at) + `<${i}>` + t.slice(at + (i % 3)));
      states.push(m.shell.getText());
    }
    const held = historyChars(m.shell.adapter)!;
    expect(held).toBeLessThan(big.length * 2.5);
    expect(undoTexts(m.shell.adapter)).toEqual(states.slice(0, -1).map(toEditorText));
    for (let i = states.length - 2; i >= 0; i--) { expect(m.shell.undo()).toBe(true); expect(m.shell.getText()).toBe(states[i]); }
    expect(m.shell.undo()).toBe(false);
    for (let i = 1; i < states.length; i++) { expect(m.shell.redo()).toBe(true); expect(m.shell.getText()).toBe(states[i]); }
    // a new edit after undos drops the redo branch
    m.shell.undo(); m.shell.undo();
    type(m, '!');
    expect(m.shell.redo()).toBe(false);
    m.shell.undo();
    expect(m.shell.getText()).toBe(states[states.length - 3]);
    m.shell.destroy();
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
    };
    window.mountOpts = function (id, text, url, o) {
      var E = window.OrzEditor;
      o = o || {};
      var s = E.createEditorShell(document.getElementById(id), {
        text: text,
        render: function (t) { return E.renderMarkdownPreview(t); },
        adapter: E.codemirror6Adapter({ url: url }),
        hooks: { save: function (t) { window.__saved[id].push(t); return Promise.resolve(); } },
        preview: Object.assign({ assets: false, debounceMs: 50 }, o.preview || {}),
      });
      window['shell_' + id] = s;
      window['errors_' + id] = [];
      s.on('error', function (e) { window['errors_' + id].push(e.source + ': ' + e.message); });
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
      if (path === '/cm6-slow.js') { setTimeout(() => js(cm), 2500); return; }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      if (path === '/csp') res.setHeader('content-security-policy', "script-src 'self' 'nonce-abc'");
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

  it('[E.13] [E.20] a standalone file opened from disk (file:) shows the document\'s relative local images in the preview; an app host on the same file: page keeps the opaque frame, where they stay blank', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orz-e20-'));
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEUlEQVR4nGP4z8DwHwyBDAAk8AP9eF9ZWQAAAABJRU5ErkJggg==', 'base64');
    writeFileSync(join(dir, 'fig.png'), png);
    writeFileSync(join(dir, 'editor.js'), editorJs);
    writeFileSync(join(dir, 'doc.md.html'), `<!doctype html><html><body><div id="s"></div><div id="a"></div><script src="editor.js"></script><script>
      var E = window.OrzEditor, text = '# Figure\\n\\n![fig](fig.png)\\n';
      var opts = function (extra) { return Object.assign({ text: text, render: function (t) { return E.renderMarkdownPreview(t); }, adapter: E.textareaAdapter(), preview: { assets: false, debounceMs: 10 } }, extra); };
      window.st = E.createEditorShell(document.getElementById('s'), opts({ assemble: function () { return ''; } }));
      window.ap = E.createEditorShell(document.getElementById('a'), opts({ hooks: { save: function () { return Promise.resolve(); } } }));
    </script></body></html>`);
    const page = await browser!.newPage();
    try {
      await page.goto(pathToFileURL(join(dir, 'doc.md.html')).href);
      const frames = () => page.evaluate(() => ['st', 'ap'].map((k) => (window as unknown as Record<string, { root: ShadowRoot }>)[k].root.querySelector('iframe')!.getAttribute('sandbox')));
      expect(await frames()).toEqual(['allow-scripts allow-same-origin', 'allow-scripts']);
      const width = (k: string) => page.evaluate((key) => {
        const f = (window as unknown as Record<string, { root: ShadowRoot }>)[key].root.querySelector('iframe')!;
        try { const d = f.contentDocument; if (!d) return -2; const img = d.querySelector('img'); return img && img.complete ? img.naturalWidth : -1; } catch { return -2; }
      }, k);
      await expect.poll(() => width('st'), { timeout: 15_000 }).toBe(4);
      expect(await width('ap')).toBe(-2); // opaque: the page cannot even look in
    } finally {
      await page.close();
      rmSync(dir, { recursive: true, force: true });
    }
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
  // ── round 1 of closed loop 2 ──
  const FLOOD = `<img src="x" onerror="setInterval(function(){var P=parent;P.postMessage({type:'orz-preview-key',key:'Escape'},'*');P.postMessage({type:'orz-preview-active'},'*');P.postMessage({type:'orz-preview-scrolled',top:0,max:1000},'*');P.postMessage({type:'orz-preview-key',key:'s'},'*');P.postMessage({type:'orz-preview-key',key:'\\\\\\\\'},'*');P.postMessage({type:'orz-preview-link',href:'https://evil.example/'},'*')},40)">`;
  const TEXT_SAVES = `# Saves\n\n<img src="x" onerror="setInterval(function(){parent.postMessage({type:'orz-preview-key',key:'s'},'*')},40)">\n\nLine 149.\n`;
  const TEXT_FLOOD = `{{nyml\nkind: document\nuid: ${UID_A}\n}}\n\n# Flood\n\n${FLOOD}\n\n${Array.from({ length: 150 }, (_, i) => `Line ${i}.\n`).join('\n')}`;

  it('[E.13] [E.14] a document script that floods Escape, "active", scroll, save, view and link messages while the reader types changes nothing: every keystroke arrives, focus and the scroll stay in the editor, nothing is saved or opened; with focus moved to the frame by a script (no user activation) a forged save still does nothing', async () => {
    const p = await open();
    expect(await p.evaluate(`mountOpts('a', ${JSON.stringify(TEXT_FLOOD)}, ${JSON.stringify(`${A}/cm6.js`)})`)).toEqual({ engine: 'codemirror6', error: null });
    await frameOf(p, 'Line 149.');
    await p.locator('#a .cm-content').click();
    await p.keyboard.press('ControlOrMeta+End');
    const typed = 'typed while the frame floods';
    for (const ch of typed) { await p.keyboard.type(ch); await p.waitForTimeout(25); }
    await p.waitForTimeout(400);
    expect(await p.evaluate('shell_a.getText()')).toBe(`${TEXT_FLOOD}${typed}`);
    expect(await p.evaluate('shell_a.root.activeElement && shell_a.root.activeElement.className')).toContain('cm-content');
    expect(await p.locator('#a .cm-scroller').evaluate((el) => (el as HTMLElement).scrollTop)).toBeGreaterThan(1000);
    expect(await p.evaluate('[window.__saved.a.length, shell_a.getMode()]')).toEqual([0, 'split']);
    expect(p.context().pages()).toHaveLength(1);
    await p.close();
    // E06: focus stays on the frame, but its user activation has expired (5 s in Chrome): forged saves stop.
    // (A Playwright evaluate counts as a user gesture too, so the page reads the state with its own timers.
    // Chrome does not let a script focus a cross-origin frame without activation, so focus comes from a click.)
    // (a forged Escape would move focus out of the frame — all it can do — so this document forges saves only)
    const q = await open();
    await q.evaluate(`mountOpts('a', ${JSON.stringify(TEXT_SAVES)}, ${JSON.stringify(`${A}/cm6.js`)})`);
    await frameOf(q, 'Line 149.');
    await q.evaluate(`setTimeout(function () {
      window.__expired = [navigator.userActivation.isActive, shell_a.root.activeElement === shell_a.root.querySelector('iframe'), window.__saved.a.length];
      setTimeout(function () { window.__later = window.__saved.a.length; }, 1000);
    }, 6000)`);
    await q.locator('#a iframe').click({ position: { x: 300, y: 20 } }); // the reader is in the frame: the forged saves act (accepted: FC-19 §8.4)
    await q.waitForTimeout(7300);
    const [ua, focused, saves] = (await q.evaluate('window.__expired')) as [boolean, boolean, number];
    expect([ua, focused]).toEqual([false, true]);
    expect(saves).toBeGreaterThan(0); // while the click's activation lasted, the frame's save key acted
    expect(await q.evaluate('window.__later')).toBe(saves); // focus on the frame without activation: no further save
    expect(q.context().pages()).toHaveLength(1);
    await q.close();
  });

  it('[E.13] [E.15] the incremental preview survives a line inserted above: nodes below are kept (their data-src-line updated), a drawn diagram is not redrawn; with diff: false every render replaces the content and keeps the scroll position', async () => {
    const T = `# Diff\n\nPara one.\n\nPara two.\n\n<div class="stub">diagram source</div>\n\nPara three.\n\n${Array.from({ length: 60 }, (_, i) => `Tail ${i}.\n`).join('\n')}`;
    const p = await open();
    await p.evaluate(`Promise.all([mountOpts('a', ${JSON.stringify(T)}, ${JSON.stringify(`${A}/cm6.js`)}), mountOpts('b', ${JSON.stringify(T)}, ${JSON.stringify(`${A}/cm6.js`)}, { preview: { diff: false } })])`);
    const fa = await frameOf(p, 'Tail 59.');
    const mark = `(function () {
      var art = document.getElementById('orz-doc');
      [].forEach.call(art.childNodes, function (n) { n.__kept = 1; });
      var stub = art.querySelector('.stub'); stub.innerHTML = '<svg id="drawn"></svg>';
      return art.querySelector('p:last-of-type').getAttribute('data-src-line');
    })()`;
    const lastLine = Number(await fa.evaluate(mark));
    // one Enter (and a line) after "Para one." — every block below moves down by two lines
    await p.evaluate('shell_a.setText(shell_a.getText().replace("Para one.\\n", "Para one.\\n\\nInserted.\\n"))');
    await expect.poll(() => fa.evaluate('document.getElementById("orz-doc").textContent.indexOf("Inserted.") >= 0'), { timeout: 5000 }).toBe(true);
    const after = (await fa.evaluate(`(function () {
      var art = document.getElementById('orz-doc'), kids = [].slice.call(art.children);
      var i = kids.findIndex(function (n) { return n.textContent === 'Inserted.'; });
      return { above: kids.slice(0, i).every(function (n) { return n.__kept; }), inserted: !kids[i].__kept, below: kids.slice(i + 1).every(function (n) { return n.__kept; }),
        drawn: !!art.querySelector('.stub #drawn'), last: art.querySelector('p:last-of-type').getAttribute('data-src-line') };
    })()`)) as Record<string, unknown>;
    expect(after).toEqual({ above: true, inserted: true, below: true, drawn: true, last: String(lastLine + 2) });
    // diff: false (shell b)
    const fb = (await (async () => { for (const f of p.frames()) { if (f !== p.mainFrame() && f !== fa && String(await f.evaluate('document.getElementById("orz-doc") ? document.getElementById("orz-doc").textContent : ""').catch(() => '')).includes('Tail 59.')) return f; } return null; })())!;
    await p.evaluate('shell_b.root.querySelector(".orz-editor__sync").click()'); // scroll sync off: the frame keeps its own position
    expect(await p.evaluate('shell_b.root.querySelector(".orz-editor__sync").getAttribute("aria-pressed")')).toBe('false');
    await fb.evaluate(`(function () { [].forEach.call(document.getElementById('orz-doc').childNodes, function (n) { n.__kept = 1; }); (document.scrollingElement || document.documentElement).scrollTop = 600; })()`);
    const y0 = Number(await fb.evaluate('(document.scrollingElement || document.documentElement).scrollTop'));
    expect(y0).toBeGreaterThan(500);
    await p.evaluate('shell_b.setText(shell_b.getText().replace("Tail 59.", "Tail 59 changed."))');
    await expect.poll(() => fb.evaluate('document.getElementById("orz-doc").textContent.indexOf("Tail 59 changed.") >= 0'), { timeout: 5000 }).toBe(true);
    expect(await fb.evaluate('[].some.call(document.getElementById("orz-doc").childNodes, function (n) { return n.__kept; })')).toBe(false);
    expect(Math.abs(Number(await fb.evaluate('(document.scrollingElement || document.documentElement).scrollTop')) - y0)).toBeLessThanOrEqual(1);
    await p.close();
  });

  it('[E.13] [E.19] under a nonce Content-Security-Policy the preview runs with preview.nonce; without it the frame never starts, which is an error (render) and a quiet notice instead of a blank pane', async () => {
    const p = await browser!.newPage({ viewport: { width: 1200, height: 1400 } });
    await p.goto(`${A}/csp`);
    await expect.poll(() => p.evaluate('typeof window.mountOpts')).toBe('function'); // (waitForFunction needs eval, which this CSP forbids)
    await p.evaluate(`Promise.all([mountOpts('a', '# With nonce\\n\\nshown\\n', ${JSON.stringify(`${A}/cm6.js`)}, { preview: { nonce: 'abc' } }), mountOpts('b', '# Without\\n\\nblocked\\n', ${JSON.stringify(`${A}/cm6.js`)}, { preview: { readyTimeoutMs: 1500 } })])`);
    await frameOf(p, 'shown');
    await expect.poll(() => p.evaluate('errors_b.length'), { timeout: 5000 }).toBeGreaterThan(0);
    expect(await p.evaluate('errors_b[0]')).toMatch(/^render: The preview frame did not start/);
    expect(await p.evaluate('shell_b.root.querySelector(".orz-editor__preview-note").textContent')).toBe('The preview could not start on this page.');
    expect(await p.evaluate('[errors_a.length, shell_a.root.querySelector(".orz-editor__preview-note")]')).toEqual([0, null]);
    await p.close();
  });

  it('[E.13] [E.21] [E.9] typing and a header edit made while CodeMirror loads carry over: CodeMirror starts from the textarea\'s current text with one undo step per textarea step; setText right after typing is its own undo step', async () => {
    const T = '# T\r\n\r\nx\r\n';
    const p = await open();
    await p.evaluate(`void (window.__r = mountOpts('c', ${JSON.stringify(T)}, ${JSON.stringify(`${A}/cm6-slow.js`)}))`);
    await p.evaluate('shell_c.setHeader({ title: "Set early" })');
    const headed = editHeader(T, { title: 'Set early' });
    await p.locator('#c textarea').click();
    await p.locator('#c textarea').evaluate((ta) => { const t = ta as HTMLTextAreaElement; t.setSelectionRange(t.value.length, t.value.length); });
    await p.keyboard.type('during load');
    expect(await p.evaluate('shell_c.adapter.name')).toBe('textarea');
    expect(await p.evaluate('window.__r')).toEqual({ engine: 'codemirror6', error: null });
    expect(await p.evaluate('shell_c.getText()')).toBe(`${headed}during load`);
    expect(await p.evaluate('[shell_c.undo(), shell_c.getText()]')).toEqual([true, headed]);
    expect(await p.evaluate('[shell_c.undo(), shell_c.getText()]')).toEqual([true, T]);
    expect(await p.evaluate('shell_c.undo()')).toBe(false);
    expect(await p.evaluate('[shell_c.redo(), shell_c.redo(), shell_c.getText()]')).toEqual([true, true, `${headed}during load`]);
    // E13: typing, then setText at once: one undo removes only the setText
    await p.locator('#c .cm-content').click();
    await p.keyboard.press('ControlOrMeta+End');
    await p.keyboard.type('typed');
    const typed = await p.evaluate('shell_c.getText()') as string;
    await p.evaluate('shell_c.setText(shell_c.getText() + "X")');
    expect(await p.evaluate('[shell_c.undo(), shell_c.getText()]')).toEqual([true, typed]);
    await p.close();
  });

  it('[E.13] [E.21] a 1.25 MB CR LF document in the textarea engine: a keystroke in the shell costs about what it costs in a bare textarea', async () => {
    const big = readFileSync('tests/carrier-corpus/md/large.md', 'utf8').repeat(12).replace(/\r?\n/g, '\r\n');
    expect(big.length).toBeGreaterThan(1_200_000);
    const p = await open();
    const perKey = async (mode: string) => {
      await p.evaluate(`(function (t, mode) {
        var a = document.getElementById('c'); a.innerHTML = '';
        if (mode === 'bare') { var ta = document.createElement('textarea'); ta.style.cssText = 'width:900px;height:400px'; ta.value = t; a.append(ta); ta.addEventListener('input', function () { window.__v = ta.value; }); }
        else window.shell_c = OrzEditor.createEditorShell(a, { text: t, render: function () { return ''; }, adapter: OrzEditor.textareaAdapter(), hooks: { save: function () { return Promise.resolve(); } }, mode: 'editor' });
      })(${JSON.stringify(big)}, ${JSON.stringify(mode)})`);
      await p.locator('#c textarea').first().click();
      await p.locator('#c textarea').first().evaluate((ta) => { const t = ta as HTMLTextAreaElement; t.setSelectionRange(t.value.length, t.value.length); });
      await p.keyboard.press('Backspace');
      const t0 = Date.now();
      for (let i = 0; i < 12; i++) await p.keyboard.press('Backspace');
      return (Date.now() - t0) / 12;
    };
    const bare = await perKey('bare');
    const shell = await perKey('shell');
    expect(shell / bare).toBeLessThan(1.6);
    expect(await p.evaluate('shell_c.getText()')).toBe(toEditorText(big).slice(0, -13).replace(/\n/g, '\r\n'));
    await p.close();
  }, 60_000);

  it('[E.13] [E.23] a scroll event dispatched between a keystroke\'s DOM change and CodeMirror\'s read of it (Chrome revealing the caret under load) keeps every keystroke in order: CodeMirror reads the live selection, not the one before the key', async () => {
    const T = '# S\r\n\r\nfirst\r\n';
    const p = await open();
    expect(await p.evaluate(`mountOpts('c', ${JSON.stringify(T)}, ${JSON.stringify(`${A}/cm6.js`)})`)).toEqual({ engine: 'codemirror6', error: null });
    // One task, no microtask checkpoint between the insertions and the scroll events: the mutation
    // observer has not run when CodeMirror's scroll handler reads the change. Targets: the scroller
    // (inside the shadow root), the window, the shadow host (a light-DOM scroll parent).
    const ok = await p.evaluate(`(function () {
      var view = OrzCodeMirror6.view.EditorView.findFromDOM(shell_c.root.querySelector('.cm-editor'));
      view.focus();
      view.dispatch({ selection: { anchor: view.state.doc.length } });
      var targets = [view.scrollDOM, window, document.getElementById('c'), document];
      var s = 'Second line', ok = true;
      for (var i = 0; i < s.length; i++) {
        ok = document.execCommand('insertText', false, s[i]) && ok;
        targets[i % targets.length].dispatchEvent(new Event('scroll'));
      }
      return ok;
    })()`);
    expect(ok).toBe(true);
    await expect.poll(() => p.evaluate('shell_c.getText()')).toBe(`${T}Second line`);
    expect(await p.evaluate('shell_c.adapter.getSelection()')).toEqual({ from: 22, to: 22 });
    await p.keyboard.type('!');
    expect(await p.evaluate('shell_c.getText()')).toBe(`${T}Second line!`);
    await p.close();
  });

  it('[E.13] [E.21] keystrokes typed while CodeMirror arrives — before a key, between its keydown and keyup, as bare text input, or as a textarea change whose input event has not run — all land in order exactly once, the caret stays where the reader left it, and undo walks back to the original', async () => {
    const T = '# L\r\n\r\nx\r\n';
    const S = 'ab cd\nef gh';
    const p = await open();
    await p.addScriptTag({ url: `${A}/cm6.js` }); // the modules, handed over by loadModules when the test says
    await p.evaluate(`window.mountLate = function (text) {
      var E = window.OrzEditor, c = document.getElementById('c'), arrive;
      if (window.shell_c) window.shell_c.destroy();
      c.innerHTML = '';
      var gate = new Promise(function (r) { arrive = r; });
      window.__arrive = function () { arrive(window.OrzCodeMirror6); };
      window.__engine = null;
      window.shell_c = E.createEditorShell(c, {
        text: text, render: function (t) { return E.renderMarkdownPreview(t); },
        adapter: E.codemirror6Adapter({ loadModules: function () { return gate; } }),
        hooks: { save: function () { return Promise.resolve(); } }, preview: { assets: false, debounceMs: 50 },
      });
      window.shell_c.ready.then(function (r) { window.__engine = r.engine; });
    }`);
    const key = (ch: string): string => (ch === '\n' ? 'Enter' : ch);
    const arrive = async (): Promise<void> => {
      await p.evaluate('window.__arrive()');
      await p.waitForFunction('window.__engine === "codemirror6"');
    };
    // every point of arrival, each with a different way of typing the key it lands on
    const phases = ['before', 'between', 'insertText', 'pending'] as const;
    let runs = 0;
    for (let at = 0; at < S.length; at++) {
      const phase = phases[at % phases.length];
      if (phase !== 'before' && S[at] === '\n') continue;
      await p.evaluate(`mountLate(${JSON.stringify(T)})`);
      await p.locator('#c textarea').click();
      await p.locator('#c textarea').evaluate((ta) => { const t = ta as HTMLTextAreaElement; t.setSelectionRange(t.value.length, t.value.length); });
      for (let i = 0; i < S.length; i++) {
        const ch = S[i];
        if (i !== at) { await p.keyboard.press(key(ch)); continue; }
        if (phase === 'before') { await arrive(); await p.keyboard.press(key(ch)); }
        else if (phase === 'between') { await p.keyboard.down(ch); await arrive(); await p.keyboard.up(ch); }
        else if (phase === 'insertText') { await arrive(); await p.keyboard.insertText(ch); }
        else {
          // the textarea has the character but its input event has not been handled yet when CodeMirror arrives
          await p.evaluate(`(function () {
            var ta = shell_c.root.querySelector('textarea'), n = ta.selectionStart;
            ta.value = ta.value.slice(0, n) + ${JSON.stringify(ch)} + ta.value.slice(n);
            ta.setSelectionRange(n + 1, n + 1);
            window.__arrive();
          })()`);
          await p.waitForFunction('window.__engine === "codemirror6"');
        }
      }
      const where = `arrival at ${at} (${phase})`;
      expect(await p.evaluate('shell_c.adapter.name'), where).toBe('codemirror6');
      const typed = `${T}${S.replace(/\n/g, '\r\n')}`;
      expect(await p.evaluate('shell_c.getText()'), where).toBe(typed);
      expect(await p.evaluate('shell_c.isDirty()'), where).toBe(true);
      expect(await p.evaluate('shell_c.adapter.getSelection()'), where).toEqual({ from: toEditorText(typed).length, to: toEditorText(typed).length });
      await p.keyboard.type('!');
      expect(await p.evaluate('shell_c.getText()'), where).toBe(`${typed}!`);
      const back = await p.evaluate('(function () { var n = 0; while (shell_c.undo() && n < 100) n++; return [n, shell_c.getText()]; })()') as [number, string];
      expect(back[1], where).toBe(T);
      expect(back[0], where).toBeGreaterThan(0);
      expect(await p.evaluate('(function () { while (shell_c.redo()); return shell_c.getText(); })()'), where).toBe(`${typed}!`);
      runs++;
    }
    expect(runs).toBeGreaterThanOrEqual(9);
    await p.close();
  }, 120_000);
  it('[E.13] [E.22] setReadOnly switches CodeMirror at run time, also when set while CodeMirror was still loading', async () => {
    const T = '# RO\n\nbody\n';
    const p = await open();
    await p.evaluate(`void (window.__r = mountOpts('c', ${JSON.stringify(T)}, ${JSON.stringify(`${A}/cm6-slow.js`)}))`);
    await p.evaluate('shell_c.setReadOnly(true)');
    expect(await p.locator('#c textarea').evaluate((ta) => (ta as HTMLTextAreaElement).readOnly)).toBe(true);
    expect(await p.evaluate('window.__r')).toEqual({ engine: 'codemirror6', error: null });
    await p.locator('#c .cm-content').click();
    await p.keyboard.type('blocked');
    expect(await p.evaluate('[shell_c.getText(), shell_c.isReadOnly(), shell_c.root.querySelector(".cm-content").getAttribute("contenteditable")]')).toEqual([T, true, 'false']);
    await p.evaluate('shell_c.setReadOnly(false)');
    await p.locator('#c .cm-content').click();
    await p.keyboard.press('ControlOrMeta+ArrowDown');
    await p.keyboard.type('open');
    expect(await p.evaluate('shell_c.getText()')).toBe(`${T}open`);
    await p.close();
  });
});
