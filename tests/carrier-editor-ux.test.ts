/**
 * The editor shell's reader-facing fixes of 2.7.0 (STATUS D-129…D-135; claims
 * E.50–E.55 in notes/CLAIMS.md; spec/FC-19-editor-component.md §3, §4, §8.2):
 * Esc never takes the caret out of the text (E.50), the folded document header
 * (E.51), the host's save-status words (E.52), one toolbar row on a phone
 * (E.53), `reveal` (E.54) and Cmd/Ctrl+\ that keeps cycling (E.55).
 *
 * happy-dom with the textarea engine for the API; the installed Chrome
 * (playwright-core) with the pinned CodeMirror bundle served locally for the
 * keyboard, the fold and the 390 px layout. The Chrome part skips without
 * Chrome.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createEditorShell, textareaAdapter, renderMarkdownPreview, CODEMIRROR6_PATH,
  type EditorShell, type EditorShellOptions, type EdElement,
} from '../src/carrier/editor';
import type { StorageLike } from '../src/carrier/shell';

const UID = 'doc-uxuxuxuxux111111';
const CRLF_BOM = `﻿{{nyml\r\nkind: document\r\ntitle: Buffers\r\nuid: ${UID}\r\n}}\r\n\r\n# Intro\r\n\r\nText.\r\n\r\n## Weak Acids\r\n\r\nMore.\r\n`;

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } };
}

let HappyWindow: typeof import('happy-dom').Window;
beforeAll(async () => {
  ({ Window: HappyWindow } = await import('happy-dom'));
});

type Mounted = { shell: EditorShell; root: ShadowRoot; ta(): HTMLTextAreaElement; win: InstanceType<typeof HappyWindow> };

function mount(opts: Partial<EditorShellOptions> = {}): Mounted {
  const win = new HappyWindow({ url: 'https://app.example/edit' });
  const document = win.document as unknown as Document;
  const div = document.createElement('div');
  document.body.appendChild(div);
  const shell = createEditorShell(div as unknown as EdElement, {
    text: CRLF_BOM,
    render: (t) => renderMarkdownPreview(t),
    adapter: textareaAdapter(),
    storage: memoryStorage(),
    preview: { assets: false, debounceMs: 10 },
    ...opts,
  });
  const root = shell.root as unknown as ShadowRoot;
  return { shell, root, ta: () => root.querySelector('textarea')!, win };
}

function key(m: Mounted, target: Element, k: string, mods: { ctrl?: boolean; meta?: boolean } = {}): KeyboardEvent {
  const e = new m.win.KeyboardEvent('keydown', { key: k, ctrlKey: !!mods.ctrl, metaKey: !!mods.meta, bubbles: true, composed: true, cancelable: true }) as unknown as KeyboardEvent;
  target.dispatchEvent(e);
  return e;
}
function type(m: Mounted, insert: string): void {
  const ta = m.ta();
  const pos = ta.value.length;
  ta.value += insert;
  ta.setSelectionRange(pos + insert.length, pos + insert.length);
  ta.dispatchEvent(new m.win.InputEvent('input', { inputType: 'insertText', data: insert, bubbles: true }) as unknown as Event);
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const statusOf = (m: Mounted) => ({
  text: m.root.querySelector('.orz-editor__status-text')?.textContent,
  tone: m.root.querySelector('.orz-editor')?.getAttribute('data-save-tone'),
  save: m.root.querySelector('.orz-editor__save')?.getAttribute('aria-label'),
});

describe('Esc in the text (D-129)', () => {
  it('[E.50] Esc in the editor leaves the focus and the text as they were (no move to the toolbar), and closes the tools under More when they are open', () => {
    const m = mount({ hooks: { save: async () => undefined } });
    const ta = m.ta();
    ta.focus();
    type(m, 'x');
    const before = m.shell.getText();
    key(m, ta, 'Escape');
    expect(m.root.activeElement).toBe(ta);
    expect(m.shell.getText()).toBe(before);
    // a pop-up of the shell's own: Esc closes it, and the caret stays
    const c = m.root.querySelector('.orz-editor')!;
    c.setAttribute('data-more', '');
    (m.root.querySelector('.orz-editor__more') as HTMLElement).click();
    expect(c.hasAttribute('data-more-open')).toBe(true);
    ta.focus();
    key(m, ta, 'Escape');
    expect([c.hasAttribute('data-more-open'), m.root.activeElement === ta]).toEqual([false, true]);
    m.shell.destroy();
  });
});

describe('the host\'s save-status words (D-131)', () => {
  it('[E.52] hooks.saveStatus supplies the words and the tone, asked at mount, on every dirty and saving change and on refreshSaveStatus(); Save reads "Save now"; null, empty or a throw keep the defaults; without the hook nothing changes', async () => {
    const asked: Array<{ dirty: boolean; saving: boolean }> = [];
    let words: unknown = 'Saved on this device';
    let release: () => void = () => {};
    const m = mount({
      hooks: {
        save: () => new Promise<void>((r) => { release = r; }),
        saveStatus: (st) => { asked.push({ ...st }); return words as string; },
      },
    });
    expect(statusOf(m)).toEqual({ text: 'Saved on this device', tone: 'saved', save: 'Save now' });
    expect(asked[0]).toEqual({ dirty: false, saving: false });
    // the host's routine wait: its words, a neutral dot (never "Unsaved changes" in amber)
    words = 'Saved on this device';
    m.ta().focus();
    type(m, '!');
    expect(m.shell.isDirty()).toBe(true);
    expect(statusOf(m)).toEqual({ text: 'Saved on this device', tone: 'pending', save: 'Save now' });
    expect(asked.at(-1)).toEqual({ dirty: true, saving: false });
    // a tone of the host's own
    words = { text: 'Sending…', tone: 'pending' };
    const saving = m.shell.save();
    expect(asked.at(-1)).toEqual({ dirty: true, saving: true });
    expect(statusOf(m).text).toBe('Sending…');
    words = 'Saved to the course';
    release();
    await saving;
    expect(asked.at(-1)).toEqual({ dirty: false, saving: false });
    expect(statusOf(m)).toEqual({ text: 'Saved to the course', tone: 'saved', save: 'Save now' });
    // the host's state changed on its own: it asks again
    words = { text: 'Could not reach the course', tone: 'error' };
    m.shell.refreshSaveStatus();
    expect(statusOf(m)).toEqual({ text: 'Could not reach the course', tone: 'error', save: 'Save now' });
    // the label keeps the width of the longest words shown (D-101)
    expect(m.root.querySelector('.orz-editor__status-text')!.getAttribute('data-reserve')).toBe('Could not reach the course');
    // null, empty and a throw: the defaults
    for (const w of [null, '  ', { tone: 'error' }]) {
      words = w;
      m.shell.refreshSaveStatus();
      expect(statusOf(m)).toEqual({ text: 'Saved', tone: 'saved', save: 'Save now' });
    }
    m.shell.destroy();
    const t = mount({ hooks: { saveStatus: () => { throw new Error('host gone'); } } });
    expect(statusOf(t)).toEqual({ text: 'Saved', tone: 'saved', save: 'Save now' });
    t.shell.destroy();
    // no hook: as before
    const d = mount({ hooks: { save: async () => undefined } });
    expect(statusOf(d)).toEqual({ text: 'Saved', tone: 'saved', save: 'Save' });
    d.ta().focus();
    type(d, '!');
    expect(statusOf(d)).toEqual({ text: 'Unsaved changes', tone: 'unsaved', save: 'Save' });
    expect(d.root.querySelector('.orz-editor')!.getAttribute('data-dirty')).toBe('true');
    await d.shell.save();
    expect(statusOf(d).text).toBe('Saved');
    d.shell.destroy();
  });
});

describe('reveal (D-134)', () => {
  it('[E.54] reveal takes the caret to a range or a heading (its text, any case, or #id) and returns the exact range; select selects it; a missing heading is null; bad targets throw; after destroy null', async () => {
    const m = mount();
    const sel: Array<{ from: number; to: number }> = [];
    m.shell.on('selection', (e) => sel.push(e));
    const exact = m.shell.getText();
    const at = exact.indexOf('## Weak Acids');
    const end = exact.indexOf('\r\n', at);
    expect(m.shell.reveal('Weak Acids')).toEqual({ from: at, to: end });
    expect(m.shell.getSelection()).toEqual({ from: at, to: at });
    expect(m.shell.reveal('weak   acids', { select: true })).toEqual({ from: at, to: end });
    expect(m.shell.getSelection()).toEqual({ from: at, to: end });
    expect(m.shell.reveal('#weak-acids')).toEqual({ from: at, to: end });
    expect(m.shell.reveal({ heading: 'Intro' })).toEqual({ from: exact.indexOf('# Intro'), to: exact.indexOf('\r\n', exact.indexOf('# Intro')) });
    // a range in exact offsets (BOM and CR LF counted)
    const t = exact.indexOf('More.');
    expect(m.shell.reveal({ from: t, to: t + 5 }, { select: true })).toEqual({ from: t, to: t + 5 });
    expect(m.shell.getSelection()).toEqual({ from: t, to: t + 5 });
    expect(m.shell.reveal({ from: t })).toEqual({ from: t, to: t });
    expect(sel.at(-1)).toEqual({ from: t, to: t });
    // a heading-looking line inside code is not a heading
    m.shell.setText(`${exact}\r\n\`\`\`\r\n# Fenced\r\n\`\`\`\r\n`);
    expect(m.shell.reveal('Fenced')).toBeNull();
    expect(m.shell.reveal('Nowhere')).toBeNull();
    expect(() => m.shell.reveal(42 as never)).toThrow(TypeError);
    // read-only too
    m.shell.setReadOnly(true);
    expect(m.shell.reveal('Intro')).not.toBeNull();
    // the text never changes
    expect(m.shell.getText()).toBe(`${exact}\r\n\`\`\`\r\n# Fenced\r\n\`\`\`\r\n`);
    m.shell.destroy();
    expect(m.shell.reveal('Intro')).toBeNull();
  });
});

describe('Cmd/Ctrl+\\ keeps the keyboard in the shell (D-135)', () => {
  it('[E.55] from the editor, Cmd/Ctrl+\\ switches the view and keeps the focus in the shell: split → editor (the text keeps it) → preview (the preview frame takes it, so its bridge reports the next key) — never the page', () => {
    const m = mount();
    const ta = m.ta();
    ta.focus();
    key(m, ta, '\\', { meta: true });
    expect([m.shell.getMode(), (m.root.activeElement as Element | null)?.tagName]).toEqual(['editor', 'TEXTAREA']);
    key(m, ta, '\\', { ctrl: true });
    expect([m.shell.getMode(), (m.root.activeElement as Element | null)?.tagName]).toEqual(['preview', 'IFRAME']);
    m.shell.destroy();
  });
});

// ── real Chrome ─────────────────────────────────────────────────────────

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

chrome('real Chrome: keyboard, fold, layout, reveal (2.7.0)', { timeout: 120_000 }, () => {
  let server: http.Server | null = null;
  let A = '';
  const cm = readFileSync(CODEMIRROR6_PATH, 'utf8');
  const BODY = Array.from({ length: 60 }, (_, i) => `## Section ${i + 1}\n\n${'Words of this section. '.repeat(6)}\n`).join('\n');
  const TEXT = `{{nyml\nkind: document\nformat: 1\ntitle: Buffers in Five Minutes\nuid: ${UID}\ntheme: paper\n}}\n\n# Start\n\n${BODY}`;
  const APP = `
    window.__saved = [];
    window.mountIt = function (text, o) {
      o = o || {};
      var E = window.OrzEditor;
      var el = document.getElementById('host');
      el.style.width = (o.width || 1000) + 'px';
      var s = E.createEditorShell(el, {
        text: text,
        render: function (t) { return E.renderMarkdownPreview(t); },
        adapter: E.codemirror6Adapter({ url: '/cm6.js' }),
        hooks: Object.assign({ save: function (t) { window.__saved.push(t); return Promise.resolve(); } }, o.hooks || {}),
        preview: { assets: false, debounceMs: 30 },
        mode: o.mode || 'split',
        foldHeader: o.foldHeader,
      });
      window.shell = s;
      if (o.tools) {
        for (var i = 0; i < o.tools; i++) {
          var b = document.createElement('button');
          b.type = 'button'; b.className = 'orz-btn orz-btn--ghost'; b.textContent = 'Setting ' + (i + 1);
          b.setAttribute('data-tool', String(i));
          s.toolbar.append(b);
        }
      }
      return s.ready.then(function (r) { return r.engine; });
    };`;

  beforeAll(async () => {
    const { build } = await import('esbuild');
    const editorJs = (await build({ entryPoints: ['src/carrier/editor/index.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'OrzEditor', write: false, logLevel: 'silent', alias: { 'katex/contrib/mhchem': 'katex/dist/contrib/mhchem.js' } })).outputFiles[0].text;
    server = http.createServer((req, res) => {
      const path = (req.url ?? '/').split('?')[0];
      const js = (body: string) => { res.setHeader('content-type', 'text/javascript; charset=utf-8'); res.end(body); };
      if (path === '/editor.js') return js(editorJs);
      if (path === '/app.js') return js(APP);
      if (path === '/cm6.js') return js(cm);
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:0}#host{height:700px}</style></head><body><button id="before">before</button><div id="host"></div><button id="after">after</button><script src="/editor.js"></script><script src="/app.js"></script></body></html>');
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    A = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  const open = async (width = 1000, o: Record<string, unknown> = {}, text = TEXT): Promise<Page> => {
    const p = await browser!.newPage({ viewport: { width, height: 800 }, ...(width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
    await p.goto(`${A}/`);
    await p.waitForFunction('typeof window.mountIt === "function"');
    expect(await p.evaluate(`mountIt(${JSON.stringify(text)}, ${JSON.stringify({ width, ...o })})`)).toBe('codemirror6');
    return p;
  };
  /** Where the focus is: inside CodeMirror, the preview frame, a button of the shell (its data-mode or class), or the page. */
  const focusAt = (p: Page) => p.evaluate(`(function () {
    var a = shell.root.activeElement;
    if (!a) return document.activeElement && document.activeElement.id ? document.activeElement.id : 'page';
    if (a.closest && a.closest('.cm-editor')) return 'text';
    if (a.tagName === 'IFRAME') return 'preview';
    return a.getAttribute('data-mode') || a.className;
  })()`);

  it('[E.50] Esc keeps the caret in the text — what is typed next goes into the text — and Esc then Tab leaves it (no keyboard trap); Tab alone still indents', async () => {
    const p = await open();
    await p.locator('.cm-content').click();
    await p.keyboard.press('ControlOrMeta+End');
    await p.keyboard.type('one');
    await p.keyboard.press('Escape');
    expect(await focusAt(p)).toBe('text');
    await p.keyboard.type(' two');
    expect(await p.evaluate('shell.getText()')).toBe(`${TEXT}one two`);
    // Tab without Esc indents: the text gets it
    await p.keyboard.press('Tab');
    const tabbed = (await p.evaluate('shell.getText()')) as string;
    expect(tabbed.length).toBeGreaterThan(`${TEXT}one two`.length);
    // Esc, then Tab: the focus leaves the editor, nothing typed is lost, no indent added
    await p.keyboard.press('Escape');
    await p.keyboard.press('Tab');
    expect(await focusAt(p)).not.toBe('text');
    expect(await p.evaluate('shell.getText()')).toBe(tabbed);
    // and Shift+Tab comes back into the text
    await p.keyboard.press('Shift+Tab');
    expect(await focusAt(p)).toBe('text');
    await p.close();
  });

  it('[E.51] the header shows as one closed line "Document settings · <title> ▸"; a click opens it to edit, the bar above folds it again; the caret moving in opens it; the text is never changed; typing at once goes after the header; foldHeader: false shows the lines', async () => {
    const p = await open();
    const lines = () => p.evaluate('Array.from(shell.root.querySelectorAll(".cm-line")).map(function (l) { return l.textContent; }).slice(0, 4)');
    const fold = p.locator('[data-orz-header-fold]');
    expect(await fold.getAttribute('data-orz-header-fold')).toBe('closed');
    expect((await fold.textContent())?.replace(/\s+/g, ' ').trim()).toBe('Document settings· Buffers in Five Minutes▸');
    expect(await fold.getAttribute('aria-expanded')).toBe('false');
    expect((await lines()).some((l: string) => /kind: document|uid:/.test(l))).toBe(false);
    expect(await p.evaluate('shell.getText()')).toBe(TEXT);
    // focus() and typing at once: never inside the closed header
    await p.evaluate('shell.focus()');
    await p.keyboard.type('Z');
    expect(await p.evaluate('shell.getText()')).not.toBe(TEXT);
    expect(((await p.evaluate('shell.getText()')) as string).startsWith(TEXT.slice(0, TEXT.indexOf('}}') + 3))).toBe(true);
    expect(await p.evaluate('shell.adapter.isHeaderFolded()')).toBe(true);
    await p.keyboard.press('Backspace');
    expect(await p.evaluate('shell.getText()')).toBe(TEXT);
    // (after CodeMirror's own scroll to the caret, at its next measure)
    await p.waitForTimeout(150);
    await p.evaluate('shell.root.querySelector(".cm-scroller").scrollTop = 0');
    await p.waitForTimeout(50);
    // a click opens it: the settings are text again, and edit as text
    await fold.click();
    expect(await p.locator('[data-orz-header-fold]').getAttribute('data-orz-header-fold')).toBe('open');
    expect((await lines()).join('|')).toContain('kind: document');
    await p.keyboard.press('End');
    await p.keyboard.type('X');
    expect(await p.evaluate('shell.getText()')).toBe(TEXT.replace('kind: document', 'kind: documentX'));
    await p.keyboard.press('Backspace');
    expect(await p.evaluate('shell.getText()')).toBe(TEXT);
    // (after CodeMirror's own scroll to the caret, at its next measure)
    await p.waitForTimeout(150);
    await p.evaluate('shell.root.querySelector(".cm-scroller").scrollTop = 0');
    await p.waitForTimeout(50);
    // the bar above folds it again; the caret goes after it
    await p.locator('[data-orz-header-fold="open"]').click();
    expect(await p.locator('[data-orz-header-fold]').getAttribute('data-orz-header-fold')).toBe('closed');
    expect(await p.evaluate('shell.adapter.isHeaderFolded()')).toBe(true);
    // the caret moving in (Ctrl+Home, as a keyboard reader does) opens it
    await p.keyboard.press('ControlOrMeta+Home');
    expect(await p.locator('[data-orz-header-fold]').getAttribute('data-orz-header-fold')).toBe('open');
    // select() and reveal() into it open it too
    await p.evaluate('shell.adapter.setHeaderFolded(true)');
    expect(await p.evaluate('shell.adapter.isHeaderFolded()')).toBe(true);
    await p.evaluate(`shell.select(${TEXT.indexOf('theme')}, ${TEXT.indexOf('theme')})`);
    expect(await p.evaluate('shell.adapter.isHeaderFolded()')).toBe(false);
    // a slide's focus fold that hides the header's lines draws no header line
    await p.evaluate('shell.adapter.setHeaderFolded(true)');
    await p.evaluate(`shell.setFocusRange(${TEXT.indexOf('## Section 3')}, ${TEXT.indexOf('## Section 4')}, { mode: 'fold' })`);
    expect(await p.locator('[data-orz-header-fold]').count()).toBe(0);
    await p.evaluate('shell.setFocusRange(null)');
    expect(await p.locator('[data-orz-header-fold]').count()).toBe(1);
    expect(await p.evaluate('shell.getText()')).toBe(TEXT);
    // undo history holds no fold: one undo of nothing changes nothing
    expect(await p.evaluate('shell.isDirty()')).toBe(false);
    await p.close();
    const q = await open(1000, { foldHeader: false });
    expect(await q.locator('[data-orz-header-fold]').count()).toBe(0);
    expect((await q.evaluate('shell.root.querySelector(".cm-line").textContent'))).toBe('{{nyml');
    await q.close();
    // no header: nothing folded
    const r = await open(1000, {}, '# Just text\n\nNo header.\n');
    expect(await r.locator('[data-orz-header-fold]').count()).toBe(0);
    await r.close();
  });

  it('[E.52] the dot of a host\'s pending status is neutral, never the warning colour', async () => {
    const p = await open(1000, { hooks: {} });
    await p.evaluate('shell.root.querySelector(".orz-editor").setAttribute("data-save-tone", "pending")');
    const pending = await p.evaluate('getComputedStyle(shell.root.querySelector(".orz-editor__status"), "::before").backgroundColor');
    await p.evaluate('shell.root.querySelector(".orz-editor").setAttribute("data-save-tone", "unsaved")');
    const unsaved = await p.evaluate('getComputedStyle(shell.root.querySelector(".orz-editor__status"), "::before").backgroundColor');
    expect(pending).not.toBe(unsaved);
    await p.close();
  });

  it('[E.53] at 390 px the toolbar is ONE row — the views, the save status, Save and More — with the carrier\'s tools under More (inside the screen, closed by Esc or a press outside); at 1000 px the tools stay in the bar and there is no More', async () => {
    const p = await open(390, { tools: 5 });
    const geo = () => p.evaluate(`(function () {
      var r = shell.root;
      var bar = r.querySelector('.orz-editor__bar').getBoundingClientRect();
      var box = function (s) { var e = r.querySelector(s); if (!e) return null; var b = e.getBoundingClientRect(); return b.width && b.height ? { top: b.top, bottom: b.bottom, left: b.left, right: b.right } : null; };
      return {
        bar: { top: bar.top, height: bar.height, left: bar.left, right: bar.right },
        overflow: r.querySelector('.orz-editor__bar').scrollWidth - r.querySelector('.orz-editor__bar').clientWidth,
        modes: box('.orz-editor__modes'), status: box('.orz-editor__status'), save: box('.orz-editor__save'), more: box('.orz-editor__more'), tools: box('.orz-editor__tools'),
        moreLabel: r.querySelector('.orz-editor__more').getAttribute('aria-label'),
      };
    })()`) as Promise<Record<string, { top: number; bottom: number; left: number; right: number; height: number } | null> & { overflow: number; moreLabel: string }>;
    // CodeMirror and the fonts may still settle: the bar is fitted on every size change
    await p.waitForTimeout(150);
    const g = await geo();
    expect(g.more).not.toBeNull();
    expect(g.tools).toBeNull(); // under More, closed
    expect(g.overflow).toBeLessThanOrEqual(0);
    // one row: every control's top on the first row, inside the bar and the screen
    for (const k of ['modes', 'status', 'save', 'more'] as const) {
      const b = g[k]!;
      expect(b, k).not.toBeNull();
      expect(Math.abs(b.top - g.modes!.top), k).toBeLessThan(g.modes!.bottom - g.modes!.top);
      expect(b.left, k).toBeGreaterThanOrEqual(0);
      expect(b.right, k).toBeLessThanOrEqual(390);
    }
    expect(g.bar!.height).toBeLessThan(56);
    // More opens the tools below the bar, inside the screen; the first tool takes the focus
    await p.locator('.orz-editor__more').click();
    const o = await geo();
    expect(o.tools).not.toBeNull();
    expect(o.tools!.top).toBeGreaterThanOrEqual(o.bar!.top + o.bar!.height - 1);
    expect(o.tools!.left).toBeGreaterThanOrEqual(0);
    expect(o.tools!.right).toBeLessThanOrEqual(390);
    expect(await p.evaluate('shell.root.querySelector(".orz-editor__more").getAttribute("aria-expanded")')).toBe('true');
    // every tool is visible and clickable there
    await p.locator('[data-tool="4"]').click();
    // Esc closes them and gives the focus back to More
    await p.locator('[data-tool="0"]').focus();
    await p.keyboard.press('Escape');
    expect((await geo()).tools).toBeNull();
    expect(await focusAt(p)).toContain('orz-editor__more');
    // a press outside closes them
    await p.locator('.orz-editor__more').click();
    expect((await geo()).tools).not.toBeNull();
    await p.locator('.cm-content').click();
    expect((await geo()).tools).toBeNull();
    // Esc in the text closes them too, and the caret stays in the text
    await p.locator('.orz-editor__more').click();
    await p.locator('.cm-content').click({ position: { x: 20, y: 200 } }).catch(() => undefined);
    await p.locator('.orz-editor__more').click();
    await p.evaluate('shell.focus()');
    await p.keyboard.press('Escape');
    expect([(await geo()).tools, await focusAt(p)]).toEqual([null, 'text']);
    await p.screenshot({ path: '/tmp/orz-d132-390.png' }).catch(() => undefined);
    await p.close();
    // wide: the tools stay in the bar; no More
    const w = await open(1000, { tools: 5 });
    await w.waitForTimeout(100);
    const wide = await w.evaluate(`(function () { var r = shell.root; return { more: r.querySelector('.orz-editor__more').getBoundingClientRect().width, tools: r.querySelector('.orz-editor__tools').getBoundingClientRect().width }; })()`) as { more: number; tools: number };
    expect(wide.more).toBe(0);
    expect(wide.tools).toBeGreaterThan(0);
    await w.close();
  });

  it('[E.54] reveal("Section 40") moves the caret there, scrolls its line to the top of the source view and the preview with it; in the preview alone the preview shows it and the editor follows when it shows', async () => {
    const p = await open();
    // the preview has rendered (its frame shows the headings)
    for (let i = 0; i < 100 && !(await Promise.all(p.frames().filter((f) => f !== p.mainFrame()).map((f) => f.evaluate('document.querySelectorAll("h2").length').catch(() => 0)))).some((n) => (n as number) > 50); i++) await p.waitForTimeout(50);
    await p.waitForTimeout(400);
    const r = await p.evaluate('shell.reveal("Section 40")') as { from: number; to: number };
    expect(r).toEqual({ from: TEXT.indexOf('## Section 40'), to: TEXT.indexOf('\n', TEXT.indexOf('## Section 40')) });
    expect(await p.evaluate('shell.getSelection()')).toEqual({ from: r.from, to: r.from });
    /** The heading line's top in the source view's scroller (null while not drawn). */
    const inSource = (h: string) => p.evaluate(`(function () {
      var sc = shell.root.querySelector('.cm-scroller');
      var line = Array.from(shell.root.querySelectorAll('.cm-line')).find(function (l) { return l.textContent === ${JSON.stringify(`## ${h}`)}; });
      return line ? line.getBoundingClientRect().top - sc.getBoundingClientRect().top : null;
    })()`) as Promise<number | null>;
    const frame = p.frames().find((f) => f !== p.mainFrame())!;
    /** The heading's top in the preview frame's viewport. */
    const inPreview = (h: string) => frame.evaluate(`(function () { var x = Array.from(document.querySelectorAll('h2')).find(function (e) { return e.textContent.trim() === ${JSON.stringify(h)}; }); return x ? x.getBoundingClientRect().top : null; })()`) as Promise<number | null>;
    const atTop = (v: number | null, max: number) => v !== null && v >= -2 && v < max;
    // the source view: the line at the top; the preview: the heading near its top
    await expect.poll(() => inSource('Section 40'), { timeout: 5000 }).toSatisfy((v: number | null) => atTop(v, 60));
    await expect.poll(async () => Math.abs((await inPreview('Section 40')) ?? 1e9), { timeout: 5000 }).toBeLessThan(160);
    // preview only: it shows the place — again after the frame reflows to the whole width; the editor follows when it shows
    await p.evaluate('shell.setMode("preview")');
    await p.waitForTimeout(100);
    await p.evaluate('shell.reveal("Section 12")');
    await expect.poll(async () => Math.abs((await inPreview('Section 12')) ?? 1e9), { timeout: 5000 }).toBeLessThan(160);
    await p.evaluate('shell.setMode("editor")');
    await expect.poll(() => inSource('Section 12'), { timeout: 5000 }).toSatisfy((v: number | null) => atTop(v, 60));
    // a place in the folded header opens it
    expect(await p.evaluate('shell.adapter.isHeaderFolded()')).toBe(true);
    await p.evaluate(`shell.reveal({ from: ${TEXT.indexOf('theme:')} })`);
    expect(await p.evaluate('shell.adapter.isHeaderFolded()')).toBe(false);
    expect(await p.evaluate('shell.getText()')).toBe(TEXT);
    await p.close();
  });

  it('[E.55] Cmd/Ctrl+\\ keeps cycling once the preview shows — split → editor → preview → split → editor — with the focus in the shell at each step (the preview\'s key comes through its bridge); at 390 px it flips editor ↔ preview ↔ editor', async () => {
    const p = await open();
    await p.waitForTimeout(300);
    await p.locator('.cm-content').click();
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      await p.keyboard.press('ControlOrMeta+Backslash');
      await p.waitForTimeout(120);
      seen.push(`${await p.evaluate('shell.getMode()')}:${await focusAt(p)}`);
    }
    expect(seen).toEqual(['editor:text', 'preview:preview', 'split:preview', 'editor:text']);
    // the text is untouched by the keys
    expect(await p.evaluate('shell.getText()')).toBe(TEXT);
    await p.close();
    const n = await open(390);
    await n.waitForTimeout(300);
    await n.locator('.cm-content').click();
    const views: string[] = [];
    for (let i = 0; i < 3; i++) {
      await n.keyboard.press('ControlOrMeta+Backslash');
      await n.waitForTimeout(120);
      views.push(`${await n.evaluate('shell.getView()')}:${await focusAt(n)}`);
    }
    expect(views).toEqual(['preview:preview', 'editor:text', 'preview:preview']);
    await n.close();
  });

  it('[E.51] property (audit 2): over random selections, folds and unfolds (host fold, the bar, select, reveal) and delete or typing keys, no single key deletes header text the reader did not see selected — with the header closed and not wholly selected, the header survives every key', async () => {
    const p = await open();
    const HEADER_END = TEXT.indexOf('}}') + 2;
    let seed = 20261108;
    const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const KEYS = ['Backspace', 'Delete', 'x', 'Alt+Backspace', 'ControlOrMeta+Backspace', 'Alt+Delete', 'Shift+Backspace'];
    const failures: string[] = [];
    for (let i = 0; i < 120; i++) {
      await p.evaluate(`shell.setText(${JSON.stringify(TEXT)}, { resetHistory: true })`);
      const ops: string[] = [];
      const len = TEXT.length;
      const pick = (): number => (rnd(3) === 0 ? rnd(HEADER_END + 3) : rnd(len + 1));
      for (let k = 0; k < 1 + rnd(3); k++) {
        const r = rnd(5);
        const a = pick(); const b = pick();
        if (r === 0) ops.push(`shell.select(${a}, ${b})`);
        else if (r === 1) ops.push(`shell.reveal({ from: ${a}, to: ${b} }, { select: true })`);
        else if (r === 2) ops.push('shell.adapter.setHeaderFolded(true)');
        else if (r === 3) ops.push('shell.adapter.setHeaderFolded(false)');
        else ops.push(`(function(){ var w = shell.root.querySelector('[data-orz-header-fold]'); if (w) w.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail: 1 })); })()`);
      }
      for (const op of ops) await p.evaluate(op);
      await p.evaluate('shell.focus()');
      const before = await p.evaluate('({ folded: shell.adapter.isHeaderFolded(), sel: shell.getSelection() })') as { folded: boolean; sel: { from: number; to: number } };
      const key = KEYS[rnd(KEYS.length)];
      if (key === 'x') await p.keyboard.type('x'); else await p.keyboard.press(key);
      const after = await p.evaluate('shell.getText()') as string;
      const wholly = before.sel.from <= 0 && before.sel.to >= HEADER_END;
      if (before.folded && !wholly && !after.startsWith(TEXT.slice(0, HEADER_END))) failures.push(`${ops.join('; ')} | ${key} | sel ${JSON.stringify(before.sel)} → ${JSON.stringify(after.slice(0, 50))}`);
    }
    expect(failures).toEqual([]);
    await p.close();
  }, 240_000);
});
