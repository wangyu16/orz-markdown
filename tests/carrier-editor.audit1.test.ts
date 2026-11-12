/**
 * Adversarial audit 1 of the unreleased kit 2.7.0 editor changes (STATUS
 * D-129…D-135, claims E.50–E.55). Every `it` here states the behaviour the
 * change promises (or that text integrity / WCAG 2.1.2 require); a failing
 * `it` is a finding. Probes that pass are recorded as verified sound.
 *
 * Run alone: npx vitest run tests/carrier-editor.audit1.test.ts --maxWorkers=2
 * (Chrome part skips without Chrome).
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
import { readHeader } from '../src/carrier/header';

const UID = 'doc-audit1audit1aud1';
const TEXT_LF = `{{nyml\nkind: document\ntitle: Buffers\nuid: ${UID}\n}}\n\n# Intro\n\nText.\n\n## Weak Acids\n\nMore.\n`;

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } };
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
    text: TEXT_LF,
    render: (t) => renderMarkdownPreview(t),
    adapter: textareaAdapter(),
    storage: memoryStorage(),
    preview: { assets: false, debounceMs: 10 },
    ...opts,
  });
  const root = shell.root as unknown as ShadowRoot;
  return { shell, root, ta: () => root.querySelector('textarea')!, win };
}
function type(m: Mounted, insert: string): void {
  const ta = m.ta();
  const pos = ta.value.length;
  ta.value += insert;
  ta.setSelectionRange(pos + insert.length, pos + insert.length);
  ta.dispatchEvent(new m.win.InputEvent('input', { inputType: 'insertText', data: insert, bubbles: true }) as unknown as Event);
}

describe('audit1: hooks.saveStatus (D-131)', () => {
  it('[A1-SS1] a host string is set as text, never parsed as HTML', () => {
    const m = mount({ hooks: { save: async () => undefined, saveStatus: () => '<img src=x onerror="window.__pwn=1">Saved' } });
    expect(m.root.querySelector('.orz-editor__status img')).toBeNull();
    expect(m.root.querySelector('.orz-editor__status-text')!.textContent).toContain('<img');
    m.shell.destroy();
  });

  it('[A1-SS2] a hook whose result throws when read (a getter, a revoked Proxy) keeps the defaults and never swallows the dirty event or host.setDirty', () => {
    const dirtyEvents: boolean[] = [];
    const hostDirty: boolean[] = [];
    let mounted: Mounted | null = null;
    expect(() => {
      mounted = mount({
        host: { setDirty: (d: boolean) => { hostDirty.push(d); } } as never,
        hooks: {
          save: async () => undefined,
          saveStatus: () => ({ get text(): string { throw new Error('host state gone'); } }) as never,
        },
      });
    }).not.toThrow();
    const m = mounted!;
    m.shell.on('dirty', (e) => dirtyEvents.push(e.dirty));
    m.ta().focus();
    expect(() => type(m, '!')).not.toThrow();
    expect(m.shell.isDirty()).toBe(true);
    // the host and listeners must hear about it: their leave-warning / autosave depends on it
    expect(dirtyEvents).toEqual([true]);
    expect(hostDirty.at(-1)).toBe(true);
    m.shell.destroy();
  });

  it('[A1-SS3] save() never throws synchronously and never rejects because of the hook', async () => {
    const m = mount({ hooks: { save: async () => undefined, saveStatus: (s) => (s.saving ? ({ get text(): string { throw new Error('x'); } }) as never : 'ok') } });
    m.ta().focus();
    type(m, '!');
    let out: unknown;
    expect(() => { out = m.shell.save(); }).not.toThrow();
    await expect(out as Promise<unknown>).resolves.toBeTruthy();
    m.shell.destroy();
  });

  it('[A1-SS4] without the hook: Save reads "Save", dirty/markSaved/data-dirty as before', () => {
    const m = mount({ hooks: { save: async () => undefined } });
    const c = m.root.querySelector('.orz-editor')!;
    m.ta().focus();
    type(m, '!');
    expect([m.shell.isDirty(), c.getAttribute('data-dirty'), c.getAttribute('data-save-tone')]).toEqual([true, 'true', 'unsaved']);
    m.shell.markSaved();
    expect([m.shell.isDirty(), c.getAttribute('data-dirty'), c.getAttribute('data-save-tone')]).toEqual([false, 'false', 'saved']);
    expect(m.root.querySelector('.orz-editor__save')!.textContent).toContain('Save');
    expect(m.root.querySelector('.orz-editor__save')!.textContent).not.toContain('now');
    m.shell.destroy();
  });
});

describe('audit1: reveal (D-134), API edges', () => {
  it('[A1-RV1] out-of-range and odd ranges clamp, never throw, never change the text', () => {
    const m = mount();
    for (const r of [{ from: -10 }, { from: 1e12 }, { from: Infinity }, { from: 5, to: -Infinity }, { from: 9, to: 3 }]) {
      expect(() => m.shell.reveal(r as never), JSON.stringify(r)).not.toThrow();
    }
    expect(m.shell.getText()).toBe(TEXT_LF);
    m.shell.destroy();
  });

  it('[A1-RV2] a heading that appears twice: the text finds the first, its #id the second (the id the preview gives it)', () => {
    const t = `# Intro\n\na\n\n# Intro\n\nb\n`;
    const m = mount({ text: t });
    expect(m.shell.reveal('Intro')).toEqual({ from: 0, to: 7 });
    expect(m.shell.reveal('#intro-1')).toEqual({ from: t.lastIndexOf('# Intro'), to: t.lastIndexOf('# Intro') + 7 });
    m.shell.destroy();
  });

  it('[A1-RV3] "#id" is matched as a string, never as a selector (no throw on selector syntax)', () => {
    const m = mount();
    for (const s of ['#a"]', '#x,body', '#)(', '#', '#\u0000']) expect(() => m.shell.reveal(s)).not.toThrow();
    expect(m.shell.reveal('#x,body')).toBeNull();
    m.shell.destroy();
  });

  it('[A1-RV4] a heading with inline math is found by the text the reader sees in the source', () => {
    const t = `# Intro\n\n## Weak $K_a$ values\n\nx\n`;
    const m = mount({ text: t });
    expect(m.shell.reveal('Weak $K_a$ values')).toEqual({ from: t.indexOf('## Weak'), to: t.indexOf('\n', t.indexOf('## Weak')) });
    m.shell.destroy();
  });

  it('[A1-RV5] a reveal made while the editor pane was hidden does not override a later caret move when the pane shows', () => {
    const m = mount({ mode: 'preview' });
    m.shell.reveal('Weak Acids');
    // later, the host moves the caret on its own (e.g. a Go-to of its own, an AI edit's selection)
    const intro = m.shell.getText().indexOf('Text.');
    m.shell.select(intro, intro);
    m.shell.setMode('editor');
    expect(m.shell.getSelection()).toEqual({ from: intro, to: intro });
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

chrome('audit1 real Chrome', { timeout: 120_000 }, () => {
  let server: http.Server | null = null;
  let A = '';
  const cm = readFileSync(CODEMIRROR6_PATH, 'utf8');
  const BODY = Array.from({ length: 20 }, (_, i) => `## Section ${i + 1}\n\n${'Words of this section. '.repeat(6)}\n`).join('\n');
  const TEXT = `{{nyml\nkind: document\nformat: 1\ntitle: Buffers in Five Minutes\nuid: ${UID}\n}}\n\n# Start\n\n${BODY}`;
  const APP = `
    window.__dirty = [];
    window.mountIt = function (text, o) {
      o = o || {};
      var E = window.OrzEditor;
      var el = document.getElementById('host');
      el.style.width = (o.width || 1000) + 'px';
      var s = E.createEditorShell(el, {
        text: text,
        render: function (t) { return E.renderMarkdownPreview(t); },
        adapter: E.codemirror6Adapter({ url: '/cm6.js' }),
        hooks: { save: function () { return Promise.resolve(); } },
        preview: { assets: false, debounceMs: 30 },
        mode: o.mode || 'split',
      });
      s.on('dirty', function (e) { window.__dirty.push(e.dirty); });
      window.shell = s;
      for (var i = 0; i < (o.tools || 0); i++) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'orz-btn orz-btn--ghost'; b.textContent = 'Setting ' + (i + 1);
        b.setAttribute('data-tool', String(i));
        s.toolbar.append(b);
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
  afterAll(async () => { await browser?.close(); server?.close(); });

  const open = async (width = 1000, o: Record<string, unknown> = {}, text = TEXT): Promise<Page> => {
    const p = await browser!.newPage({ viewport: { width, height: 800 }, ...(width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
    await p.goto(`${A}/`);
    await p.waitForFunction('typeof window.mountIt === "function"');
    expect(await p.evaluate(`mountIt(${JSON.stringify(text)}, ${JSON.stringify({ width, ...o })})`)).toBe('codemirror6');
    return p;
  };
  const focusAt = (p: Page) => p.evaluate(`(function () {
    var a = shell.root.activeElement;
    if (!a) return document.activeElement && document.activeElement.id ? document.activeElement.id : 'page';
    if (a.closest && a.closest('.cm-editor')) return 'text';
    if (a.tagName === 'IFRAME') return 'preview';
    return a.getAttribute('data-mode') || a.className;
  })()`);
  const text = (p: Page) => p.evaluate('shell.getText()') as Promise<string>;
  const folded = (p: Page) => p.evaluate('shell.adapter.isHeaderFolded()') as Promise<boolean>;

  // ── keyboard (D-129) ──
  it('[A1-K1] Esc then Tab leaves the text even when a word is selected (the documented way out; no indent written)', async () => {
    const p = await open();
    await p.locator('.cm-content').click();
    await p.keyboard.press('ControlOrMeta+End');
    await p.keyboard.type('alpha');
    await p.keyboard.press('Shift+ArrowLeft');
    await p.keyboard.press('Shift+ArrowLeft');
    const before = await text(p);
    await p.keyboard.press('Escape');
    await p.keyboard.press('Tab');
    expect(await focusAt(p)).not.toBe('text');
    expect(await text(p)).toBe(before);
    await p.close();
  });

  it('[A1-K3] the way out (Esc then Tab) is announced on the editing surface (WCAG 2.1.2: the user is advised of the method)', async () => {
    const p = await open();
    const desc = await p.evaluate(`(function(){ var c = shell.root.querySelector('.cm-content'); var d = c.getAttribute('aria-description') || ''; var ids = (c.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean); ids.forEach(function(id){ var e = shell.root.getElementById ? shell.root.getElementById(id) : null; if (e) d += ' ' + e.textContent; }); return d; })()`) as string;
    expect(desc).toMatch(/Tab/);
    await p.close();
  });

  // ── header fold (D-130) ──
  it('[A1-F1] the up arrow from the first body line opens the header before anything can be typed into it', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    // the caret starts on the line after the header; go up and type
    await p.keyboard.press('ArrowUp');
    await p.keyboard.press('ArrowUp');
    await p.keyboard.type('Q');
    const t = await text(p);
    const h = TEXT.indexOf('}}') + 2;
    const typedInHeader = t.indexOf('Q') <= h;
    if (typedInHeader) expect(await folded(p)).toBe(false);
    await p.keyboard.press('Backspace');
    expect(await text(p)).toBe(TEXT);
    await p.close();
  });

  it('[A1-F2] a header-only text (no line break after "}}"): folding never leaves the caret inside the hidden header, so typing never breaks it', async () => {
    const HO = `{{nyml\nkind: document\ntitle: Empty\nuid: ${UID}\n}}`;
    const p = await open(1000, {}, HO);
    await p.evaluate('shell.focus()');
    await p.evaluate('shell.adapter.setHeaderFolded(true)');
    const closed = await folded(p);
    await p.keyboard.type('x');
    const t = await text(p);
    // if the header was closed when the key came, the key must not land inside it (invisible typing)
    if (closed) expect(readHeader(t), `typed into the closed header: ${JSON.stringify(t.slice(-6))}`).not.toBeNull();
    await p.close();
  });

  it('[A1-F3] BOM + CRLF: the fold shows, typing after it and deleting it gives back the exact bytes; save gets the exact bytes', async () => {
    const T = `﻿{{nyml\r\nkind: document\r\ntitle: Crlf\r\nuid: ${UID}\r\n}}\r\n\r\n# Intro\r\n\r\nText.\r\n`;
    const p = await open(1000, {}, T);
    expect(await p.locator('[data-orz-header-fold="closed"]').count()).toBe(1);
    expect(await text(p)).toBe(T);
    await p.evaluate('shell.focus()');
    await p.keyboard.type('abc');
    await p.keyboard.press('Backspace');
    await p.keyboard.press('Backspace');
    await p.keyboard.press('Backspace');
    expect(await text(p)).toBe(T);
    expect(await p.evaluate('shell.isDirty()')).toBe(false);
    await p.close();
  });

  it('[A1-F4] paste at the fold boundary, undo and redo across opening and closing: the text is exact at each step', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    // paste right after the header
    await p.evaluate(`shell.select(${TEXT.indexOf('}}') + 3}, ${TEXT.indexOf('}}') + 3})`);
    await p.evaluate(`(function(){ var c = shell.root.querySelector('.cm-content'); var dt = new DataTransfer(); dt.setData('text/plain', 'P1\\nP2'); c.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
    const afterPaste = await text(p);
    const h = TEXT.indexOf('}}') + 3;
    expect(afterPaste).toBe(TEXT.slice(0, h) + 'P1\nP2' + TEXT.slice(h));
    expect(await folded(p)).toBe(true);
    // open, edit the title, fold
    await p.waitForTimeout(150);
    await p.evaluate('shell.root.querySelector(".cm-scroller").scrollTop = 0');
    await p.waitForTimeout(50);
    await p.locator('[data-orz-header-fold="closed"]').click();
    await p.keyboard.press('ArrowDown');
    await p.keyboard.press('ArrowDown');
    await p.keyboard.press('End');
    await p.keyboard.type('Z');
    expect(await text(p)).toContain('title: Buffers in Five MinutesZ');
    await p.waitForTimeout(150);
    await p.evaluate('shell.root.querySelector(".cm-scroller").scrollTop = 0');
    await p.waitForTimeout(50);
    await p.locator('[data-orz-header-fold="open"]').click();
    expect(await folded(p)).toBe(true);
    const edited = await text(p);
    expect(edited).toBe(afterPaste.replace('Five Minutes', 'Five MinutesZ'));
    // undo with the header closed: the undone edit is in it, so it opens; the text is exact
    await p.keyboard.press('ControlOrMeta+z');
    expect(await text(p)).toBe(afterPaste);
    expect(await folded(p)).toBe(false);
    await p.keyboard.press('ControlOrMeta+z');
    expect(await text(p)).toBe(TEXT);
    await p.keyboard.press('ControlOrMeta+Shift+z');
    expect(await text(p)).toBe(afterPaste);
    await p.close();
  });

  it('[A1-F5] IME composition right after the header writes exactly the committed text', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    await p.evaluate(`shell.select(${TEXT.indexOf('}}') + 3}, ${TEXT.indexOf('}}') + 3})`);
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
    await cdp.send('Input.insertText', { text: '日本' });
    await p.waitForTimeout(100);
    const h = TEXT.indexOf('}}') + 3;
    expect(await text(p)).toBe(TEXT.slice(0, h) + '日本' + TEXT.slice(h));
    expect(await folded(p)).toBe(true);
    await p.close();
  });

  it('[A1-F6] the closed header line, a role="button", opens on a click event alone (a screen reader\'s activation sends no mousedown)', async () => {
    const p = await open();
    await p.evaluate('shell.root.querySelector("[data-orz-header-fold]").click()');
    expect(await folded(p)).toBe(false);
    await p.close();
  });

  it('[A1-F7] (claim E.51) when CodeMirror arrives the caret starts right after the folded header, so typing at once goes there', async () => {
    const p = await open();
    const h = TEXT.indexOf('}}') + 3;
    expect(await p.evaluate('shell.getSelection()')).toEqual({ from: h, to: h });
    await p.close();
  });

  it('[A1-F8] select-all then Delete / Backspace / typing with the header closed: the whole selection goes (what the reader selected), the result is one undo step', async () => {
    const out: Record<string, string> = {};
    for (const k of ['Delete', 'Backspace', 'x']) {
      const p = await open();
      await p.locator('.cm-content').click({ position: { x: 40, y: 200 } });
      expect(await folded(p)).toBe(true);
      await p.keyboard.press('ControlOrMeta+a');
      if (k === 'x') await p.keyboard.type('x'); else await p.keyboard.press(k);
      out[k] = await text(p);
      await p.keyboard.press('ControlOrMeta+z');
      out[`${k}-undo`] = String((await text(p)) === TEXT);
      await p.close();
    }
    expect(out).toEqual({ Delete: '', 'Delete-undo': 'true', Backspace: '', 'Backspace-undo': 'true', x: 'x', 'x-undo': 'true' });
  });

  it('[A1-F8b] (2.7.1) select-all with the header closed on a text that does not end in a line break, then typing, inserting a whole new document (its own header), or Delete: the text is exactly the input (no header kept, none doubled), one undo step back', async () => {
    // the browser cannot put its DOM selection before the closed line: before 2.7.1 its edit kept the header (A1-F8
    // passed only because TEXT ends in a line break); found by orz-paged 1.2.0's preview tests (E.7, E.8)
    const T = TEXT.replace(/\n+$/, '');
    const NEW = T.replace('title: Buffers in Five Minutes', 'title: Buffers in Six Minutes').replace('## Section 7\n', '## Section 7\n\nAn inserted paragraph.\n');
    const out: Record<string, string> = {};
    for (const k of ['x', 'insert', 'Delete', 'Backspace']) {
      const p = await open(1000, {}, T);
      await p.locator('.cm-content').click({ position: { x: 40, y: 200 } });
      expect(await folded(p)).toBe(true);
      await p.keyboard.press('ControlOrMeta+a');
      await p.waitForTimeout(150);
      if (k === 'x') await p.keyboard.type('x');
      else if (k === 'insert') await p.keyboard.insertText(NEW);
      else await p.keyboard.press(k);
      const want = k === 'x' ? 'x' : k === 'insert' ? NEW : '';
      const got = await text(p);
      out[k] = got === want ? 'exact' : JSON.stringify(got.slice(0, 60));
      await p.keyboard.press('ControlOrMeta+z');
      out[`${k}-undo`] = String((await text(p)) === T);
      await p.close();
    }
    expect(out).toEqual({ x: 'exact', 'x-undo': 'true', insert: 'exact', 'insert-undo': 'true', Delete: 'exact', 'Delete-undo': 'true', Backspace: 'exact', 'Backspace-undo': 'true' });
  });

  it('[A1-F10] select-all with the header closed selects the whole text (the header too) also when the line after "}}" is not blank: the selection stays 0..length and Delete empties the text, as with a blank line (A1-F8)', async () => {
    const T2 = TEXT.replace('}}\n\n# Start', '}}\n# Start');
    const p = await open(1000, {}, T2);
    await p.locator('.cm-content').click({ position: { x: 40, y: 200 } });
    await p.waitForTimeout(100);
    await p.evaluate('shell.root.querySelector(".cm-scroller").scrollTop = 0');
    await p.waitForTimeout(100);
    expect(await folded(p)).toBe(true);
    await p.keyboard.press('ControlOrMeta+a');
    await p.waitForTimeout(150); // the browser's selectionchange, read back by CodeMirror
    const sel = await p.evaluate('shell.getSelection()');
    await p.keyboard.press('Delete');
    expect({ sel, left: await text(p) }).toEqual({ sel: { from: 0, to: T2.length }, left: '' });
    await p.close();
  });

  it('[A1-F11] below the closed header CodeMirror\'s height map matches the layout: a click in the lower part of a line puts the caret on that line, and a line scrolled to the top reads as that line (scroll sync)', async () => {
    const p = await open();
    await p.waitForTimeout(200);
    const probe = await p.evaluate(`(function () {
      var lines = Array.from(shell.root.querySelectorAll('.cm-line'));
      var l = lines.find(function (x) { return x.textContent === '## Section 3'; });
      var r = l.getBoundingClientRect();
      return { x: r.left + 30, top: r.top, bottom: r.bottom };
    })()`) as { x: number; top: number; bottom: number };
    await p.mouse.click(probe.x, probe.bottom - 2);
    const at = await p.evaluate('shell.getSelection().from') as number;
    const lineStart = TEXT.indexOf('## Section 3');
    expect({ caretLine: TEXT.slice(0, at).split('\n').length }).toEqual({ caretLine: TEXT.slice(0, lineStart).split('\n').length });
    // a line scrolled exactly to the top of the source view: its getScroll().line is that line (no fraction)
    await p.evaluate(`(function () {
      var sc = shell.root.querySelector('.cm-scroller');
      var l = Array.from(shell.root.querySelectorAll('.cm-line')).find(function (x) { return x.textContent === '## Section 3'; });
      sc.scrollTop += l.getBoundingClientRect().top - sc.getBoundingClientRect().top;
    })()`);
    await p.waitForTimeout(150);
    const line = await p.evaluate('shell.adapter.getScroll().line') as number;
    expect(Math.abs(line - (TEXT.slice(0, lineStart).split('\n').length - 1))).toBeLessThan(0.1);
    await p.close();
  });

  it('[A1-F11b] (diagnosis of A1-F11) with the fold line\'s outer margin removed the click lands on the right line', async () => {
    const p = await open();
    await p.evaluate(`(function(){ var st = document.createElement('style'); st.textContent = '.orz-header-fold{margin:0 !important}'; shell.root.appendChild(st); shell.adapter.setHeaderFolded(false); shell.adapter.setHeaderFolded(true); })()`);
    await p.waitForTimeout(300);
    const probe = await p.evaluate(`(function () { var l = Array.from(shell.root.querySelectorAll('.cm-line')).find(function (x) { return x.textContent === '## Section 3'; }); var r = l.getBoundingClientRect(); return { x: r.left + 30, bottom: r.bottom }; })()`) as { x: number; bottom: number };
    await p.mouse.click(probe.x, probe.bottom - 2);
    const at = await p.evaluate('shell.getSelection().from') as number;
    expect(TEXT.slice(0, at).split('\n').length).toBe(TEXT.slice(0, TEXT.indexOf('## Section 3')).split('\n').length);
    await p.close();
  });

  // ── narrow toolbar (D-132) ──
  for (const w of [320, 360]) {
    it(`[A1-N1] at ${w} px with five tools the bar is one row inside the screen, no horizontal overflow, More labelled, every tool reachable`, async () => {
      const p = await open(w, { tools: 5 });
      await p.waitForTimeout(200);
      const g = await p.evaluate(`(function(){
        var r = shell.root, bar = r.querySelector('.orz-editor__bar');
        var box = function (e) { var b = e.getBoundingClientRect(); return b.width && b.height ? { top: b.top, left: b.left, right: b.right, bottom: b.bottom } : null; };
        var ctl = Array.from(bar.querySelectorAll('.orz-editor__mode, .orz-editor__status, .orz-editor__save, .orz-editor__more')).map(box).filter(Boolean);
        var more = r.querySelector('.orz-editor__more');
        return { overflow: bar.scrollWidth - bar.clientWidth, h: bar.getBoundingClientRect().height, ctl: ctl, label: more.getAttribute('aria-label') || more.textContent.trim() };
      })()`) as { overflow: number; h: number; ctl: Array<{ top: number; left: number; right: number; bottom: number }>; label: string };
      expect(g.overflow).toBeLessThanOrEqual(0);
      expect(g.h).toBeLessThan(56);
      for (const c of g.ctl) { expect(c.left).toBeGreaterThanOrEqual(0); expect(c.right).toBeLessThanOrEqual(w); expect(Math.abs(c.top - g.ctl[0].top)).toBeLessThan(20); }
      expect(g.label).toMatch(/More/);
      // keyboard: More opens, focus to the first tool, Tab walks every tool, none is a trap
      await p.locator('.orz-editor__more').focus();
      await p.keyboard.press('Enter');
      const seen: string[] = [];
      for (let i = 0; i < 5; i++) { seen.push(String(await p.evaluate('(shell.root.activeElement && shell.root.activeElement.getAttribute("data-tool"))'))); await p.keyboard.press('Tab'); }
      expect(seen).toEqual(['0', '1', '2', '3', '4']);
      for (let i = 0; i < 5; i++) {
        const b = await p.locator(`[data-tool="${i}"]`).boundingBox();
        if (!(await p.evaluate('shell.root.querySelector(".orz-editor").hasAttribute("data-more-open")'))) await p.locator('.orz-editor__more').click();
        const bb = await p.locator(`[data-tool="${i}"]`).boundingBox();
        expect(bb ?? b, `tool ${i}`).not.toBeNull();
        expect((bb ?? b)!.x).toBeGreaterThanOrEqual(0);
        expect((bb ?? b)!.x + (bb ?? b)!.width).toBeLessThanOrEqual(w);
      }
      await p.close();
    });
  }

  // ── reveal with a rebuilt preview (D-134) ──
  it('[A1-RV6] reveal and then a text change that rebuilds the preview: no error, the text is the new one', async () => {
    const p = await open();
    const errors: string[] = [];
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.waitForTimeout(300);
    await p.evaluate('shell.reveal("Section 15"); shell.setText(shell.getText() + "\\n\\n## Tail\\n")');
    await p.waitForTimeout(800);
    expect(await text(p)).toBe(`${TEXT}\n\n## Tail\n`);
    expect(errors).toEqual([]);
    await p.close();
  });
});
