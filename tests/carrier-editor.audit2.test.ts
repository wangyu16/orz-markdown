/**
 * Adversarial audit 2 (closed-loop round 2) of the unreleased kit 2.7.0 editor
 * changes (STATUS D-129…D-135, claims E.50–E.55), after the round-1 fixes
 * (ae22056). Every `it` states the behaviour text integrity / the claims
 * require; a failing `it` is a finding, a passing one is verified sound.
 *
 * Focus: the closed header as an ATOMIC range (+ the keepCover transaction
 * filter), and the scroll read/set change (getScroll/scrollTo from the
 * document's top).
 *
 * Run alone: npx vitest run tests/carrier-editor.audit2.test.ts --maxWorkers=2
 * (skips without Chrome; to run with the suite, add it to CHROME in vitest.config.ts).
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { CODEMIRROR6_PATH } from '../src/carrier/editor';
import { readHeader } from '../src/carrier/header';

const UID = 'doc-audit2audit2aud2';

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

chrome('audit2 real Chrome', { timeout: 120_000 }, () => {
  let server: http.Server | null = null;
  let A = '';
  const cm = readFileSync(CODEMIRROR6_PATH, 'utf8');
  const BODY = Array.from({ length: 20 }, (_, i) => `## Section ${i + 1}\n\n${'Words of this section. '.repeat(6)}\n`).join('\n');
  const HEADER = `{{nyml\nkind: document\nformat: 1\ntitle: Buffers in Five Minutes\nuid: ${UID}\n}}`;
  const TEXT = `${HEADER}\n\n# Start\n\n${BODY}`;
  /** The header's last offset (end of the `}}` line) and the first offset after it. */
  const AT_TO = HEADER.length;
  const AFTER = AT_TO + 1;
  const APP = `
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
      window.shell = s;
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

  const open = async (text = TEXT, o: Record<string, unknown> = {}): Promise<Page> => {
    const width = (o.width as number) ?? 1000;
    const p = await browser!.newPage({ viewport: { width, height: 800 }, ...(width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
    await p.goto(`${A}/`);
    await p.waitForFunction('typeof window.mountIt === "function"');
    expect(await p.evaluate(`mountIt(${JSON.stringify(text)}, ${JSON.stringify({ width, ...o })})`)).toBe('codemirror6');
    await p.waitForTimeout(150);
    return p;
  };
  const text = (p: Page) => p.evaluate('shell.getText()') as Promise<string>;
  const folded = (p: Page) => p.evaluate('shell.adapter.isHeaderFolded()') as Promise<boolean>;
  const sel = (p: Page) => p.evaluate('shell.getSelection()') as Promise<{ from: number; to: number }>;
  const top0 = async (p: Page) => { await p.evaluate('shell.root.querySelector(".cm-scroller").scrollTop = 0'); await p.waitForTimeout(80); };

  // ── the atomic closed header: one keystroke at its edge ──
  for (const k of ['Backspace', 'Alt+Backspace', 'ControlOrMeta+Backspace', 'Shift+Backspace']) {
    it(`[A2-AT1] ${k} right after the closed header (a blank line follows) removes at most one character, never the header`, async () => {
      const p = await open();
      await p.evaluate('shell.focus()');
      expect(await sel(p)).toEqual({ from: AFTER, to: AFTER });
      expect(await folded(p)).toBe(true);
      await p.keyboard.press(k);
      const t = await text(p);
      expect(TEXT.length - t.length).toBeLessThanOrEqual(1);
      expect(readHeader(t)?.fields['uid']).toBe(UID);
      await p.close();
    });
  }

  it('[A2-AT2] Backspace on a body line right after "}}" (no blank line) with the header closed: one keystroke never silently breaks the hidden header (it stays a header, or the fold opens so the reader sees the change)', async () => {
    const T2 = TEXT.replace('}}\n\n# Start', '}}\n# Start');
    const p = await open(T2);
    await p.evaluate('shell.focus()');
    expect(await folded(p)).toBe(true);
    await p.keyboard.press('Backspace');
    const t = await text(p);
    expect(T2.length - t.length).toBeLessThanOrEqual(1);
    const headerKept = readHeader(t)?.fields['uid'] === UID;
    expect(headerKept || !(await folded(p)), `header lost while closed: ${JSON.stringify(t.slice(AT_TO - 4, AT_TO + 10))}`).toBe(true);
    await p.close();
  });

  it('[A2-AT3] Delete at the end of the line before the header (text above it): never removes the hidden header', async () => {
    const T3 = `Note\n${TEXT}`;
    const p = await open(T3);
    await p.evaluate('shell.select(4, 4)');
    await p.evaluate('shell.focus()');
    const f = await folded(p);
    await p.keyboard.press('Delete');
    const t = await text(p);
    expect(T3.length - t.length).toBeLessThanOrEqual(1);
    if (f) expect(t).toContain(`uid: ${UID}`);
    await p.close();
  });

  // ── selections with an end inside the closed header ──
  it('[A2-SE1] the host selects from inside the header to the body (select(anchor in header, head below)): the header opens, or the selection does not start in the hidden lines', async () => {
    const p = await open();
    const a = HEADER.indexOf('title:');
    const b = TEXT.indexOf('# Start') + 3;
    await p.evaluate(`shell.select(${a}, ${b})`);
    const s = await sel(p);
    const f = await folded(p);
    expect(f && s.from < AT_TO, `closed header, selection ${JSON.stringify(s)} starts in its hidden lines`).toBe(false);
    await p.close();
  });

  it('[A2-SE2] reveal({ from: in the header, to: below }, { select: true }): the header opens (the selection is visible)', async () => {
    const p = await open();
    const a = HEADER.indexOf('title:');
    const b = TEXT.indexOf('# Start') + 3;
    await p.evaluate(`shell.reveal({ from: ${a}, to: ${b} }, { select: true })`);
    const s = await sel(p);
    expect((await folded(p)) && s.from < AT_TO).toBe(false);
    await p.close();
  });

  it('[A2-SE3] the reader selects from a setting into the body, then folds with the bar: typing next never replaces hidden header text', async () => {
    const p = await open();
    await top0(p);
    await p.locator('[data-orz-header-fold="closed"]').click();
    expect(await folded(p)).toBe(false);
    // caret on "format: 1" (the click put it on the first setting), select down into the body
    await p.keyboard.press('ArrowDown');
    for (let i = 0; i < 5; i++) await p.keyboard.press('Shift+ArrowDown');
    const s0 = await sel(p);
    expect(s0.from).toBeLessThan(AT_TO);
    expect(s0.to).toBeGreaterThan(AT_TO);
    await top0(p);
    await p.locator('[data-orz-header-fold="open"]').click();
    const f = await folded(p);
    const s = await sel(p);
    expect(f && s.from < AT_TO, `closed header with selection ${JSON.stringify(s)} inside it`).toBe(false);
    await p.close();
  });

  it('[A2-SE3b] (consequence of A2-SE3) select from a setting into the body, fold with the bar, type one letter: the hidden settings (uid included) are never replaced unseen', async () => {
    const p = await open();
    await top0(p);
    await p.locator('[data-orz-header-fold="closed"]').click();
    await p.keyboard.press('ArrowDown');
    for (let i = 0; i < 5; i++) await p.keyboard.press('Shift+ArrowDown');
    await top0(p);
    await p.locator('[data-orz-header-fold="open"]').click();
    const closedBefore = await folded(p);
    await p.keyboard.type('x');
    const t = await text(p);
    // what the reader saw selected was body text below the closed line; the uid must survive unless they saw it go
    expect({ closedBefore, uidKept: t.includes(`uid: ${UID}`) }).not.toEqual({ closedBefore: true, uidKept: false });
    await p.close();
  });

  for (const k of ['Backspace', 'Delete']) {
    it(`[A2-SE3c] (reader-only path) open the header, select from "title:" into the body, fold with the bar, press ${k}: no more than the selected text goes (never "kind:" and the lines above the selection)`, async () => {
      const p = await open();
      await top0(p);
      await p.locator('[data-orz-header-fold="closed"]').click();
      await p.keyboard.press('ArrowDown');
      await p.keyboard.press('ArrowDown');
      await p.keyboard.press('Home');
      for (let i = 0; i < 4; i++) await p.keyboard.press('Shift+ArrowDown');
      const s0 = await sel(p);
      await top0(p);
      await p.locator('[data-orz-header-fold="open"]').click();
      await p.keyboard.press(k);
      const t = await text(p);
      const removed = TEXT.length - t.length;
      expect({ removed, kindKept: t.startsWith('{{nyml\nkind: document\n') }, `selected ${JSON.stringify(TEXT.slice(s0.from, s0.to))}; left ${JSON.stringify(t.slice(0, 40))}`).toEqual({ removed: Math.min(s0.to - s0.from, removed), kindKept: true });
      await p.close();
    });
  }

  for (const k of ['x', 'Backspace', 'Delete']) {
    it(`[A2-SE1b] (consequence of A2-SE1) the host selects from a setting into the body with the header closed, the reader presses ${k}: the hidden settings are never removed unseen`, async () => {
      const p = await open();
      await p.evaluate('shell.focus()');
      const a = HEADER.indexOf('title:');
      const b = TEXT.indexOf('# Start') + 3;
      await p.evaluate(`shell.select(${a}, ${b})`);
      await p.waitForTimeout(100);
      const closedBefore = await folded(p);
      if (k === 'x') await p.keyboard.type('x'); else await p.keyboard.press(k);
      const t = await text(p);
      expect({ closedBefore, uidKept: t.includes(`uid: ${UID}`) }, JSON.stringify(t.slice(0, 80))).not.toEqual({ closedBefore: true, uidKept: false });
      await p.close();
    });
  }

  it('[A2-SE4] Shift+ArrowUp / Shift+PageUp / Shift+Ctrl+Home from the first body line: the selection never covers hidden header text while it stays closed', async () => {
    for (const k of ['Shift+ArrowUp', 'Shift+PageUp', 'Shift+ControlOrMeta+Home', 'Shift+ControlOrMeta+ArrowUp']) {
      const p = await open();
      await p.evaluate('shell.focus()');
      await p.keyboard.press('ArrowDown');
      await p.keyboard.press(k);
      const s = await sel(p);
      expect((await folded(p)) && s.from < AT_TO, `${k}: ${JSON.stringify(s)}`).toBe(false);
      await p.close();
    }
  });

  it('[A2-SE5] a mouse drag from the body up onto the closed header line: the header opens, or the selection stays out of it', async () => {
    const p = await open();
    await top0(p);
    const box = await p.evaluate(`(function(){ var l = Array.from(shell.root.querySelectorAll('.cm-line')).find(function(x){ return x.textContent === '# Start'; }); var r = l.getBoundingClientRect(); var w = shell.root.querySelector('[data-orz-header-fold]').getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2, wy: w.top + w.height / 2 }; })()`) as { x: number; y: number; wy: number };
    await p.mouse.move(box.x, box.y);
    await p.mouse.down();
    await p.mouse.move(box.x, box.wy, { steps: 6 });
    await p.mouse.up();
    const s = await sel(p);
    expect((await folded(p)) && s.from < AT_TO, JSON.stringify(s)).toBe(false);
    await p.close();
  });

  // ── the keepCover filter (select-all kept over the header) ──
  for (const [name, doc] of [['header + one line break', `${HEADER}\n`], ['header only', HEADER]] as const) {
    for (const k of ['ArrowRight', 'ArrowDown', 'End', 'ControlOrMeta+End']) {
      it(`[A2-KC1] ${name}: select-all, then ${k} collapses the selection (typing next adds, never replaces the header)`, async () => {
        const p = await open(doc);
        await p.evaluate('shell.focus()');
        await p.keyboard.press('ControlOrMeta+a');
        await p.waitForTimeout(100);
        expect(await sel(p)).toEqual({ from: 0, to: doc.length });
        await p.keyboard.press(k);
        await p.waitForTimeout(100);
        const s = await sel(p);
        await p.keyboard.type('x');
        const t = await text(p);
        expect({ collapsed: s.from === s.to, headerKept: t.includes(`uid: ${UID}`) }).toEqual({ collapsed: true, headerKept: true });
        await p.close();
      });
    }
  }

  it('[A2-KC2] header + one line break: select-all, then a click below the header puts the caret there (the click is not swallowed)', async () => {
    const doc = `${HEADER}\n`;
    const p = await open(doc);
    await p.evaluate('shell.focus()');
    await p.keyboard.press('ControlOrMeta+a');
    await p.waitForTimeout(100);
    const r = await p.evaluate(`(function(){ var c = shell.root.querySelector('.cm-content').getBoundingClientRect(); var w = shell.root.querySelector('[data-orz-header-fold]').getBoundingClientRect(); return { x: c.left + 60, y: w.bottom + 8 }; })()`) as { x: number; y: number };
    await p.mouse.click(r.x, r.y);
    await p.waitForTimeout(100);
    const s = await sel(p);
    expect(s.from === s.to, JSON.stringify(s)).toBe(true);
    await p.close();
  });

  // ── other edges ──
  it('[A2-DC] a double-click on the closed header leaves it open (the second click does not fold it at once)', async () => {
    const p = await open();
    await top0(p);
    await p.locator('[data-orz-header-fold="closed"]').dblclick();
    await p.waitForTimeout(100);
    expect(await folded(p)).toBe(false);
    await p.close();
  });

  it('[A2-CUT] select-all, cut, paste back: exact text and the header folds again', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    await p.keyboard.press('ControlOrMeta+a');
    await p.waitForTimeout(100);
    const captured = await p.evaluate(`(function(){ var c = shell.root.querySelector('.cm-content'); var dt = new DataTransfer(); var e = new ClipboardEvent('cut', { clipboardData: dt, bubbles: true, cancelable: true }); c.dispatchEvent(e); return dt.getData('text/plain'); })()`);
    expect(captured).toBe(TEXT);
    expect(await text(p)).toBe('');
    await p.evaluate(`(function(){ var c = shell.root.querySelector('.cm-content'); var dt = new DataTransfer(); dt.setData('text/plain', ${JSON.stringify(TEXT)}); c.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
    expect(await text(p)).toBe(TEXT);
    await p.close();
  });

  it('[A2-FIND] find a word of the header with the header closed: the match opens it; Escape then Tab still leaves the text', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    await p.keyboard.press('ControlOrMeta+f');
    await p.waitForTimeout(100);
    await p.keyboard.type('Five Minutes');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(100);
    const s = await sel(p);
    expect(TEXT.slice(s.from, s.to)).toBe('Five Minutes');
    expect(await folded(p)).toBe(false);
    expect(await text(p)).toBe(TEXT);
    await p.close();
  });

  it('[A2-SR] the closed header exposes its name and state to assistive technology, and the hidden settings are not in the accessibility tree as editable text', async () => {
    const p = await open();
    const snap = await p.evaluate(`(function(){ var w = shell.root.querySelector('[data-orz-header-fold]'); return { role: w.getAttribute('role'), expanded: w.getAttribute('aria-expanded'), label: w.getAttribute('aria-label'), ce: w.closest('[contenteditable="false"]') !== null || w.getAttribute('contenteditable') }; })()`) as Record<string, unknown>;
    expect(snap.role).toBe('button');
    expect(snap.expanded).toBe('false');
    expect(String(snap.label)).toContain('Buffers in Five Minutes');
    await p.close();
  });

  // ── scroll mapping (getScroll / scrollTo from the document's top) ──
  for (const state of ['closed', 'open'] as const) {
    it(`[A2-SC1] header ${state}: scrollTo({ line }) then getScroll().line gives the line back (body lines, top and bottom)`, async () => {
      const p = await open();
      if (state === 'open') await p.evaluate('shell.adapter.setHeaderFolded(false)');
      await p.waitForTimeout(150);
      const lines = TEXT.split('\n').length;
      const out: Record<string, number> = {};
      for (const L of [0, 7, 7.5, 20, 40, lines - 30]) {
        const r = await p.evaluate(`(function(){ shell.adapter.scrollTo({ line: ${L} }); var sc = shell.root.querySelector('.cm-scroller'); return new Promise(function(res){ requestAnimationFrame(function(){ requestAnimationFrame(function(){ res({ line: shell.adapter.getScroll().line, atMax: sc.scrollTop >= sc.scrollHeight - sc.clientHeight - 1 }); }); }); }); })()`) as { line: number; atMax: boolean };
        if (!r.atMax) out[String(L)] = Math.round(Math.abs(r.line - L) * 100) / 100;
      }
      for (const [L, d] of Object.entries(out)) expect(d, `line ${L}`).toBeLessThan(0.1);
      await p.close();
    });
  }

  it('[A2-SC2] header closed: scrollTo({ line }) to a line INSIDE the header gives a scroll position whose getScroll().line is that line or the header\'s first (no jump past the header)', async () => {
    const p = await open();
    const r = await p.evaluate(`(function(){ shell.adapter.scrollTo({ line: 3 }); return new Promise(function(res){ requestAnimationFrame(function(){ res(shell.adapter.getScroll().line); }); }); })()`) as number;
    expect(r).toBeLessThanOrEqual(5);
    await p.close();
  });

  for (const state of ['closed', 'open'] as const) {
    it(`[A2-SC4] 390 px (one pane), header ${state}: reveal("Section 15") puts its line within 60 px of the source view's top; reveal of the first body line with the header closed keeps the header closed and the line visible`, async () => {
      const p = await open(TEXT, { width: 390 });
      if (state === 'open') await p.evaluate('shell.adapter.setHeaderFolded(false)');
      await p.evaluate('shell.reveal("Section 15")');
      await p.waitForTimeout(300);
      const dy = await p.evaluate(`(function(){ var sc = shell.root.querySelector('.cm-scroller'); var l = Array.from(shell.root.querySelectorAll('.cm-line')).find(function(x){ return x.textContent === '## Section 15'; }); return l ? l.getBoundingClientRect().top - sc.getBoundingClientRect().top : null; })()`) as number | null;
      expect(dy).not.toBeNull();
      expect(Math.abs(dy!)).toBeLessThan(60);
      await p.evaluate('shell.reveal("Start")');
      await p.waitForTimeout(300);
      const dy2 = await p.evaluate(`(function(){ var sc = shell.root.querySelector('.cm-scroller'); var l = Array.from(shell.root.querySelectorAll('.cm-line')).find(function(x){ return x.textContent === '# Start'; }); return l ? l.getBoundingClientRect().top - sc.getBoundingClientRect().top : null; })()`) as number | null;
      expect(dy2).not.toBeNull();
      expect(dy2!).toBeGreaterThanOrEqual(-1);
      expect(dy2!).toBeLessThan(120);
      if (state === 'closed') expect(await folded(p)).toBe(true);
      await p.close();
    });
  }

  for (const state of ['closed', 'open'] as const) {
    it(`[A2-SC3] split view, sync on, header ${state}: a section scrolled to the top of the source view shows the same section at the top of the preview, and back`, async () => {
      const p = await open();
      if (state === 'open') await p.evaluate('shell.adapter.setHeaderFolded(false)');
      const on = await p.evaluate('shell.root.querySelector(".orz-editor__sync") ? shell.root.querySelector(".orz-editor__sync").getAttribute("aria-pressed") : "none"');
      if (on === 'false') await p.locator('.orz-editor__sync').click();
      await p.waitForTimeout(600);
      const frame = p.frames().find((f) => f !== p.mainFrame())!;
      for (const n of [8, 14]) {
        await p.evaluate(`(function(){ var sc = shell.root.querySelector('.cm-scroller'); var l = Array.from(shell.root.querySelectorAll('.cm-line')).find(function(x){ return x.textContent === '## Section ${n}'; }); if (!l) { shell.adapter.scrollTo({ line: ${TEXT.split('\n').findIndex((x) => x === `## Section ${n}`)} }); return; } sc.scrollTop += l.getBoundingClientRect().top - sc.getBoundingClientRect().top; })()`);
        await p.mouse.move(200, 400);
        await p.mouse.wheel(0, 1);
        await p.waitForTimeout(600);
        const dy = await frame.evaluate(`(function(){ var h = Array.from(document.querySelectorAll('h2')).find(function(x){ return x.textContent.trim() === 'Section ${n}'; }); return h ? h.getBoundingClientRect().top : null; })()`) as number | null;
        expect(dy, `section ${n}`).not.toBeNull();
        expect(Math.abs(dy!), `section ${n} at ${dy} px in the preview`).toBeLessThan(80);
      }
      // back: the reader wheels the preview so "Section 4" is at its top; the source view follows
      const fb = await p.locator('iframe').first().boundingBox();
      const want = await frame.evaluate(`(function(){ var h = Array.from(document.querySelectorAll('h2')).find(function(x){ return x.textContent.trim() === 'Section 4'; }); return h.getBoundingClientRect().top; })()`) as number;
      await p.mouse.move(fb!.x + fb!.width / 2, fb!.y + fb!.height / 2);
      await p.mouse.wheel(0, Math.round(want));
      await p.waitForTimeout(900);
      const ed = await p.evaluate(`(function(){ var sc = shell.root.querySelector('.cm-scroller'); var l = Array.from(shell.root.querySelectorAll('.cm-line')).find(function(x){ return x.textContent === '## Section 4'; }); return l ? l.getBoundingClientRect().top - sc.getBoundingClientRect().top : null; })()`) as number | null;
      expect(ed, 'source line of Section 4 drawn').not.toBeNull();
      expect(Math.abs(ed!), `Section 4 at ${ed} px in the source view`).toBeLessThan(80);
      await p.close();
    });
  }
});
