/**
 * Adversarial audit 3 (closed-loop round 3) of the unreleased kit 2.7.0 editor
 * changes, after the round-2 fixes (60204f7): the header guard (a transaction
 * filter refusing a reader's input/delete/move edit that changes the closed
 * header's hidden text unless a selection covers the whole header) and its
 * siblings (inside/outside, keepCover `!s1.empty`, double-click).
 *
 * Every `it` states the behaviour text integrity / the claims (E.51) require;
 * a failing `it` is a finding, a passing one is verified sound.
 *
 * Run alone: npx vitest run tests/carrier-editor.audit3.test.ts --maxWorkers=2
 * (skips without Chrome; to run it with the suite, add it to CHROME in vitest.config.ts).
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { CODEMIRROR6_PATH } from '../src/carrier/editor';
import { readHeader } from '../src/carrier/header';

const UID = 'doc-audit3audit3aud3';

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

chrome('audit3 real Chrome: the header guard', { timeout: 120_000 }, () => {
  let server: http.Server | null = null;
  let A = '';
  const cm = readFileSync(CODEMIRROR6_PATH, 'utf8');
  const BODY = Array.from({ length: 12 }, (_, i) => `## Section ${i + 1}\n\n${'Words of this section. '.repeat(4)}Buffers.\n`).join('\n');
  const HEADER = `{{nyml\nkind: document\nformat: 1\ntitle: Buffers in Five Minutes\nuid: ${UID}\n}}`;
  /** No blank line after "}}": the first body line sits right after the header. */
  const TEXT = `${HEADER}\n# Start\n\n${BODY}`;
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
        foldHeader: o.foldHeader !== false,
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
      res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:0}#host{height:700px}</style></head><body><div id="host"></div><script src="/editor.js"></script><script src="/app.js"></script></body></html>');
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    A = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);
  afterAll(async () => { await browser?.close(); server?.close(); });

  const open = async (text = TEXT, o: Record<string, unknown> = {}): Promise<Page> => {
    const p = await browser!.newPage({ viewport: { width: 1000, height: 800 } });
    await p.goto(`${A}/`);
    await p.waitForFunction('typeof window.mountIt === "function"');
    expect(await p.evaluate(`mountIt(${JSON.stringify(text)}, ${JSON.stringify(o)})`)).toBe('codemirror6');
    await p.waitForTimeout(150);
    return p;
  };
  const text = (p: Page) => p.evaluate('shell.getText()') as Promise<string>;
  const folded = (p: Page) => p.evaluate('shell.adapter.isHeaderFolded()') as Promise<boolean>;
  const sel = (p: Page) => p.evaluate('shell.getSelection()') as Promise<{ from: number; to: number }>;
  const top0 = async (p: Page) => { await p.evaluate('shell.root.querySelector(".cm-scroller").scrollTop = 0'); await p.waitForTimeout(80); };

  // ── 1. legitimate edits pass, keystrokes are not lost ──
  it('[A3-L1] typing at the very start of the body (no blank line after "}}") goes in, the header stays closed and intact', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    expect(await sel(p)).toEqual({ from: AFTER, to: AFTER });
    await p.keyboard.type('Z');
    expect(await text(p)).toBe(TEXT.slice(0, AFTER) + 'Z' + TEXT.slice(AFTER));
    expect(await folded(p)).toBe(true);
    await p.close();
  });

  it('[A3-L2] a header-only text: the reader can type (the keystroke is not lost) and the header survives as a header', async () => {
    const p = await open(HEADER);
    await p.evaluate('shell.focus()');
    await p.keyboard.type('x');
    const t = await text(p);
    expect({ grew: t.length === HEADER.length + 1, uid: readHeader(t)?.fields['uid'] }).toEqual({ grew: true, uid: UID });
    await p.keyboard.press('Enter');
    await p.keyboard.type('y');
    expect(readHeader(await text(p))?.fields['uid']).toBe(UID);
    await p.close();
  });

  it('[A3-L3] select-all with the header closed, paste a whole new document: the text is exactly the pasted one (one undo step back)', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    await p.keyboard.press('ControlOrMeta+a');
    await p.waitForTimeout(120);
    const NEW = `{{nyml\nkind: document\ntitle: Other\n}}\n\n# Other\n`;
    await p.evaluate(`(function(){ var c = shell.root.querySelector('.cm-content'); var dt = new DataTransfer(); dt.setData('text/plain', ${JSON.stringify(NEW)}); c.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
    expect(await text(p)).toBe(NEW);
    await p.keyboard.press('ControlOrMeta+z');
    expect(await text(p)).toBe(TEXT);
    await p.close();
  });

  it('[A3-L4] Replace all with matches in the closed header AND the body: the reader\'s command is not silently dropped — the body matches are replaced, or the header opens and nothing changes (no partial loss either way)', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    await p.keyboard.press('ControlOrMeta+f');
    await p.waitForTimeout(100);
    await p.locator('.cm-search input[name="search"]').fill('Buffers');
    await p.locator('.cm-search input[name="replace"]').fill('Queues');
    await p.locator('.cm-search button[name="replaceAll"]').click();
    await p.waitForTimeout(100);
    const t = await text(p);
    const f = await folded(p);
    const bodyReplaced = !t.slice(AT_TO).includes('Buffers');
    const headerSame = t.startsWith(HEADER);
    // record what happens, then require: header unchanged while it stayed closed; the command acted, or the header opened
    expect({ headerChangedWhileClosed: f && !headerSame, droppedSilently: !bodyReplaced && f }).toEqual({ headerChangedWhileClosed: false, droppedSilently: false });
    // the stronger, reader-facing expectation: one Replace all replaces the body matches it could see
    expect({ bodyReplaced, headerSame, f }).toEqual({ bodyReplaced: true, headerSame: true, f: true });
    await p.close();
  });

  it('[A3-L5] closeBrackets / markdown Enter continuation at the start of the body: inserts as typed, header closed and intact', async () => {
    const T = `${HEADER}\n- item\n`;
    const p = await open(T);
    await p.evaluate('shell.focus()');
    await p.keyboard.press('End');
    await p.keyboard.press('Enter');
    await p.keyboard.type('(b');
    const t = await text(p);
    expect(t.startsWith(HEADER + '\n- item\n')).toBe(true);
    expect(t.length).toBeGreaterThan(T.length + 2);
    expect(await folded(p)).toBe(true);
    await p.close();
  });

  it('[A3-L6] drag of body text onto the closed header line: no text is lost, the header stays a header (or the fold is no longer closed)', async () => {
    const p = await open();
    await top0(p);
    const word = 'Start';
    const a = TEXT.indexOf(word);
    await p.evaluate(`shell.select(${a}, ${a + word.length})`);
    await p.waitForTimeout(80);
    const box = await p.evaluate(`(function(){ var v = shell.adapter; var l = Array.from(shell.root.querySelectorAll('.cm-line')).find(function(x){ return x.textContent === '# Start'; }); var r = l.getBoundingClientRect(); var w = shell.root.querySelector('[data-orz-header-fold]').getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2, wx: w.left + 30, wy: w.top + w.height / 2 }; })()`) as { x: number; y: number; wx: number; wy: number };
    await p.mouse.move(box.x, box.y);
    await p.mouse.down();
    await p.mouse.move(box.wx, box.wy, { steps: 8 });
    await p.mouse.up();
    await p.waitForTimeout(150);
    const t = await text(p);
    const f = await folded(p);
    expect({ sameLength: t.length === TEXT.length, hasWord: t.includes('# Start') || t.includes(word) }).toEqual({ sameLength: true, hasWord: true });
    expect(readHeader(t)?.fields['uid'] === UID || !f, `header broken while closed: ${JSON.stringify(t.slice(0, 20))} … ${JSON.stringify(t.slice(AT_TO - 4, AT_TO + 12))}`).toBe(true);
    await p.close();
  });

  it('[A3-L7] Alt+ArrowUp on the first body line: the first press opens the header and changes nothing; a second press moves the line (visible); undo gives back the exact text, and one more undo is not a stray step', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    await p.keyboard.type('Q'); // a real edit to undo later
    const t1 = await text(p);
    await p.keyboard.press('Alt+ArrowUp');
    const t2 = await text(p);
    const f2 = await folded(p);
    expect({ unchanged: t2 === t1, open: !f2 }).toEqual({ unchanged: true, open: true });
    await p.keyboard.press('Alt+ArrowUp');
    const t3 = await text(p);
    expect(t3).not.toBe(t1);
    expect(readHeader(t1)?.fields['uid']).toBe(UID);
    await p.keyboard.press('ControlOrMeta+z');
    expect(await text(p)).toBe(t1);
    await p.keyboard.press('ControlOrMeta+z');
    expect(await text(p)).toBe(TEXT);
    await p.keyboard.press('ControlOrMeta+Shift+z');
    expect(await text(p)).toBe(t1);
    await p.close();
  });

  it('[A3-L8] a refused key followed by undo undoes the reader\'s last real edit (the refusal is not a history step)', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    await p.keyboard.type('Q');
    await p.keyboard.press('Alt+ArrowUp'); // refused: opens
    await p.keyboard.press('ControlOrMeta+z');
    expect(await text(p)).toBe(TEXT);
    await p.close();
  });

  it('[A3-L9] Tab / Shift+Tab on the first body line with the header closed: indents / dedents that line only', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    await p.keyboard.press('Tab');
    const t = await text(p);
    expect(t.startsWith(HEADER + '\n')).toBe(true);
    expect(t.length).toBeGreaterThan(TEXT.length);
    await p.keyboard.press('Shift+Tab');
    expect(await text(p)).toBe(TEXT);
    expect(await folded(p)).toBe(true);
    await p.close();
  });

  it('[A3-L10] toggle comment (Mod+/) on the first body line, header closed: the header text is never changed unseen', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    await p.keyboard.press('ControlOrMeta+/');
    const t = await text(p);
    const f = await folded(p);
    expect(t.startsWith(HEADER) || !f, JSON.stringify(t.slice(0, 120))).toBe(true);
    await p.close();
  });

  it('[A3-L11] Ctrl+T (transpose) at the start of the body with the header closed: never changes the header unseen', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    await p.keyboard.press('Control+t');
    const t = await text(p);
    const f = await folded(p);
    expect(readHeader(t)?.fields['uid'] === UID && t.startsWith(HEADER) || !f, JSON.stringify(t.slice(AT_TO - 4, AT_TO + 10))).toBe(true);
    await p.close();
  });

  it('[A3-L12] Mod+Shift+K (delete line) and Shift+Alt+ArrowUp (copy line up) on the first body line, header closed: the header stays intact', async () => {
    for (const k of ['ControlOrMeta+Shift+k', 'Shift+Alt+ArrowUp', 'Shift+Alt+ArrowDown', 'ControlOrMeta+Enter', 'ControlOrMeta+i']) {
      const p = await open();
      await p.evaluate('shell.focus()');
      await p.keyboard.press(k);
      const t = await text(p);
      const f = await folded(p);
      expect(t.startsWith(HEADER) || !f, `${k}: ${JSON.stringify(t.slice(0, 120))}`).toBe(true);
      await p.close();
    }
  });

  // ── 2. paths around the filter ──
  it('[A3-U1] undo of a replace-all made while the header was open, after folding it: hidden settings never change while it stays closed (it opens, or the undo leaves them)', async () => {
    const p = await open();
    await top0(p);
    await p.locator('[data-orz-header-fold="closed"]').click();
    expect(await folded(p)).toBe(false);
    // caret back in the body
    await p.evaluate(`shell.select(${TEXT.length - 3}, ${TEXT.length - 3})`);
    await p.keyboard.press('ControlOrMeta+f');
    await p.waitForTimeout(100);
    await p.locator('.cm-search input[name="search"]').fill('Buffers');
    await p.locator('.cm-search input[name="replace"]').fill('Queues');
    await p.locator('.cm-search button[name="replaceAll"]').click();
    await p.waitForTimeout(80);
    const replaced = await text(p);
    expect(replaced.startsWith(HEADER.replace('Buffers', 'Queues'))).toBe(true);
    await p.keyboard.press('Escape');
    await p.evaluate('shell.adapter.setHeaderFolded(true)');
    expect(await folded(p)).toBe(true);
    await p.evaluate('shell.focus()');
    await p.keyboard.press('ControlOrMeta+z');
    const t = await text(p);
    const f = await folded(p);
    const headerChanged = !t.startsWith(replaced.slice(0, AT_TO));
    expect({ headerChangedWhileClosed: headerChanged && f }).toEqual({ headerChangedWhileClosed: false });
    await p.close();
  });

  for (const k of ['ControlOrMeta+/', 'ControlOrMeta+Alt+Backslash', 'x']) {
    it(`[A3-U3] the reader's caret is on a setting (header open), the host reloads the text (setText, resetHistory): the header comes back CLOSED with the caret inside it; then ${k}: the hidden settings never change while it stays closed`, async () => {
      const p = await open();
      await top0(p);
      await p.locator('[data-orz-header-fold="closed"]').click();
      await p.keyboard.press('ArrowDown');
      await p.keyboard.press('ArrowDown'); // on "title: …"
      const s0 = await sel(p);
      expect(s0.from).toBeLessThan(AT_TO);
      // a host reload (open a file again, revert, a sync from disk): a body edit elsewhere, history reset
      const RELOADED = TEXT.replace('## Section 12', '## Section Twelve');
      await p.evaluate(`shell.setText(${JSON.stringify(RELOADED)}, { resetHistory: true })`);
      const state = await p.evaluate('({ folded: shell.adapter.isHeaderFolded(), sel: shell.getSelection() })') as { folded: boolean; sel: { from: number; to: number } };
      await p.evaluate('shell.focus()');
      if (k === 'x') await p.keyboard.type('x'); else await p.keyboard.press(k);
      const t = await text(p);
      const f = await folded(p);
      // E.51: a caret in the header opens it; and no key changes the hidden settings while it stays closed
      expect({ closedWithCaretInside: state.folded && state.sel.from > 0 && state.sel.from <= AT_TO, headerChangedWhileClosed: f && !t.startsWith(RELOADED.slice(0, AT_TO)) }, `after reload ${JSON.stringify(state)}; then ${k}: folded ${f}, ${JSON.stringify(t.slice(0, 90))}, length ${t.length - RELOADED.length}`).toEqual({ closedWithCaretInside: false, headerChangedWhileClosed: false });
      await p.close();
    });
  }

  it('[A3-U4] (consequence of A3-U3) caret on "title:" (header open), host reload (setText, resetHistory), then Mod+Shift+K (delete line): the line deleted is the one the caret was on, or the header opens first — never the first body line the reader did not touch', async () => {
    const p = await open();
    await top0(p);
    await p.locator('[data-orz-header-fold="closed"]').click();
    await p.keyboard.press('ArrowDown');
    await p.keyboard.press('ArrowDown');
    const RELOADED = TEXT.replace('## Section 12', '## Section Twelve');
    await p.evaluate(`shell.setText(${JSON.stringify(RELOADED)}, { resetHistory: true })`);
    await p.keyboard.press('ControlOrMeta+Shift+k');
    const t = await text(p);
    expect({ bodyFirstLineKept: t.includes('\n# Start\n'), headerShownOrTitleGone: !(await folded(p)) || !t.includes('title: Buffers') }).toEqual({ bodyFirstLineKept: true, headerShownOrTitleGone: true });
    await p.close();
  });

  it('[A3-U2] beforeinput insertReplacementText (spellcheck / OS text replacement) with the closed line in its target: never changes the hidden header', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    await p.evaluate(`(function(){
      var c = shell.root.querySelector('.cm-content');
      var w = shell.root.querySelector('[data-orz-header-fold]');
      var line = Array.from(shell.root.querySelectorAll('.cm-line')).find(function(x){ return x.textContent === '# Start'; });
      var tw = document.createTreeWalker(line, NodeFilter.SHOW_TEXT); var tn = tw.nextNode(); while (tn && tn.data.length < 3) tn = tw.nextNode();
      var r = document.createRange(); r.setStartBefore(w); r.setEnd(tn, Math.min(3, tn.data.length));
      var dt = new DataTransfer(); dt.setData('text/plain', 'R');
      var e = new InputEvent('beforeinput', { inputType: 'insertReplacementText', dataTransfer: dt, bubbles: true, cancelable: true, targetRanges: [new StaticRange({ startContainer: r.startContainer, startOffset: r.startOffset, endContainer: r.endContainer, endOffset: r.endOffset })] });
      c.dispatchEvent(e);
    })()`);
    await p.waitForTimeout(120);
    const t = await text(p);
    const f = await folded(p);
    expect(t.startsWith(HEADER) || !f, JSON.stringify(t.slice(0, 60))).toBe(true);
    await p.close();
  });

  // ── 3. the "covering" exception: is the cover visible? ──
  const foldPixels = async (p: Page): Promise<string> => {
    const r = await p.evaluate(`(function(){ var w = shell.root.querySelector('[data-orz-header-fold]').getBoundingClientRect(); return { x: w.left + 2, y: w.top + 2, width: Math.min(400, w.width - 4), height: w.height - 4 }; })()`) as { x: number; y: number; width: number; height: number };
    return (await p.screenshot({ clip: r })).toString('base64');
  };
  it('[A3-S1] the closed line looks different while a selection covers the header (select-all), so the exception "the reader sees the header selected" holds', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    await top0(p);
    const plain = await foldPixels(p);
    await p.keyboard.press('ControlOrMeta+a');
    await p.waitForTimeout(150);
    expect(await folded(p)).toBe(true);
    const covered = await foldPixels(p);
    expect(covered === plain, 'the closed line is drawn the same selected or not').toBe(false);
    await p.close();
  });

  it('[A3-S2] the host selects from offset 0 (the header\'s start) into the body, header closed, the reader presses Backspace: the hidden settings are never removed unseen (the header opens, or the closed line shows selected)', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    await top0(p);
    const plain = await foldPixels(p);
    await p.evaluate(`shell.select(0, ${AFTER + 4})`);
    await p.waitForTimeout(150);
    const closedBefore = await folded(p);
    const shown = (await foldPixels(p)) !== plain;
    await p.keyboard.press('Backspace');
    const t = await text(p);
    expect({ closedBefore, shown, uidKept: t.includes(`uid: ${UID}`) }).not.toMatchObject({ closedBefore: true, shown: false, uidKept: false });
    await p.close();
  });

  // ── 4. robustness ──
  it('[A3-R1] an unclosed header (no "}}"): no fold, typing and deleting work; typing the closing "}}" folds nothing under the caret', async () => {
    const T = `{{nyml\nkind: document\ntitle: Open\n\n# Body\n`;
    const p = await open(T);
    expect(await p.locator('[data-orz-header-fold]').count()).toBe(0);
    await p.evaluate(`shell.select(${T.indexOf('title: Open') + 11}, ${T.indexOf('title: Open') + 11})`);
    await p.evaluate('shell.focus()');
    await p.keyboard.press('Enter');
    await p.keyboard.type('}}');
    const t = await text(p);
    expect(t).toBe(T.replace('title: Open', 'title: Open\n}}'));
    // the header now exists; the caret is right after "}}", inside it: it must show open
    expect(await folded(p)).toBe(false);
    await p.keyboard.type('Z');
    expect(await text(p)).toBe(T.replace('title: Open', 'title: Open\n}}Z'));
    await p.close();
  });

  it('[A3-R2] 10,000 lines: typing with the header closed is as fast as without the fold (within 1.5x + 10 ms per key), and the guard adds little to a 10,000-match replace-all', async () => {
    const big = `${HEADER}\n\n${Array.from({ length: 10_000 }, (_, i) => `line ${i} foo`).join('\n')}\n`;
    const perKey = async (o: Record<string, unknown>, at?: number): Promise<number> => {
      const p = await open(big, { ...o, mode: 'editor' });
      if (at !== undefined) await p.evaluate(`shell.select(${at}, ${at})`);
      await p.evaluate('shell.focus()');
      await p.keyboard.type('warm');
      const t0 = Date.now();
      for (let i = 0; i < 40; i++) await p.keyboard.type('k');
      const ms = (Date.now() - t0) / 40;
      await p.close();
      return ms;
    };
    const plain0 = await perKey({ foldHeader: false }, AFTER + 1);
    const folded1 = await perKey({});
    const plain = await perKey({ foldHeader: false }, AFTER + 1);
    const foldedFar = await perKey({}, big.length - 2);
    // one programmatic keystroke-like transaction right after the header, folded vs not (no DOM, no preview)
    const dispatchMs = async (o: Record<string, unknown>): Promise<number> => {
      const p = await open(big, { ...o, mode: 'editor' });
      const ms = await p.evaluate(`(function(){
        var v = OrzCodeMirror6.view.EditorView.findFromDOM(shell.root.querySelector('.cm-editor'));
        var best = 1e9;
        for (var k = 0; k < 30; k++) { var t = performance.now(); v.dispatch({ changes: { from: ${AFTER + 1}, insert: 'k' }, userEvent: 'input.type' }); best = Math.min(best, performance.now() - t); }
        return best;
      })()`) as number;
      await p.close();
      return ms;
    };
    const dFold = await dispatchMs({});
    const dPlain = await dispatchMs({ foldHeader: false });
    console.log(`[A3-R2] per key (DOM typing): no fold ${plain0.toFixed(1)} / ${plain.toFixed(1)} ms, folded at the body start ${folded1.toFixed(1)} ms, folded at the end ${foldedFar.toFixed(1)} ms; one dispatch: folded ${dFold.toFixed(2)} ms, no fold ${dPlain.toFixed(2)} ms`);
    // the filter itself: a replace-all of every "foo" (none in the header) through view.dispatch, header closed vs foldHeader off
    const replaceMs = async (o: Record<string, unknown>): Promise<number> => {
      const p = await open(big, { ...o, mode: 'editor' });
      const ms = await p.evaluate(`(function(){
        var v = OrzCodeMirror6.view.EditorView.findFromDOM(shell.root.querySelector('.cm-editor'));
        var d = v.state.doc.toString(); var ch = []; var i = -1;
        while ((i = d.indexOf('foo', i + 1)) >= 0) ch.push({ from: i, to: i + 3, insert: 'bar' });
        var best = 1e9;
        for (var k = 0; k < 5; k++) {
          var t = performance.now();
          v.dispatch({ changes: ch, userEvent: 'input.replace.all' });
          best = Math.min(best, performance.now() - t);
          v.dispatch({ changes: ch.map(function(c){ return { from: c.from, to: c.from + 3, insert: 'foo' }; }), userEvent: 'input.replace.all' });
        }
        return best;
      })()`) as number;
      await p.close();
      return ms;
    };
    const rClosed = await replaceMs({});
    const rPlain = await replaceMs({ foldHeader: false });
    console.log(`[A3-R2] per key: folded ${folded1.toFixed(1)} ms, no fold ${plain.toFixed(1)} ms; replace-all: folded ${rClosed.toFixed(1)} ms, no fold ${rPlain.toFixed(1)} ms`);
    expect(folded1).toBeLessThan(plain * 1.5 + 10);
    expect(rClosed).toBeLessThan(rPlain * 2 + 20);
  }, 180_000);

  // ── the covering exception from the reader's side: a blank line above the header ──
  it('[A3-S3] a blank line above the header: the reader drags from the body up to that line (across the closed line), then Backspace: the settings go only if the closed line showed selected or opened', async () => {
    const T = `\n${TEXT}`;
    const p = await open(T);
    await top0(p);
    const plain = await foldPixels(p);
    const box = await p.evaluate(`(function(){ var l = Array.from(shell.root.querySelectorAll('.cm-line')).find(function(x){ return x.textContent === '# Start'; }); var r = l.getBoundingClientRect(); var first = shell.root.querySelector('.cm-line').getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2, ty: first.top + first.height / 2, tx: first.left + 2 }; })()`) as { x: number; y: number; ty: number; tx: number };
    await p.mouse.move(box.x, box.y);
    await p.mouse.down();
    await p.mouse.move(box.tx, box.ty, { steps: 10 });
    await p.mouse.up();
    await p.waitForTimeout(150);
    const s = await sel(p);
    const closedBefore = await folded(p);
    const shown = closedBefore ? (await foldPixels(p)) !== plain : true;
    await p.keyboard.press('Backspace');
    const t = await text(p);
    expect({ closedBefore, shown, uidKept: t.includes(`uid: ${UID}`) }, `selection ${JSON.stringify(s)}`).not.toMatchObject({ closedBefore: true, shown: false, uidKept: false });
    await p.close();
  });

  it('[A3-S4] a blank line above the header: caret on it, Shift+ArrowDown three times, then Backspace: the settings go only if the closed line showed selected or opened', async () => {
    const T = `\n${TEXT}`;
    const p = await open(T);
    await top0(p);
    const plain = await foldPixels(p);
    await p.evaluate('shell.select(0, 0)');
    await p.evaluate('shell.focus()');
    for (let i = 0; i < 3; i++) await p.keyboard.press('Shift+ArrowDown');
    await p.waitForTimeout(100);
    const s = await sel(p);
    const closedBefore = await folded(p);
    const shown = closedBefore ? (await foldPixels(p)) !== plain : true;
    await p.keyboard.press('Backspace');
    const t = await text(p);
    expect({ closedBefore, shown, uidKept: t.includes(`uid: ${UID}`) }, `selection ${JSON.stringify(s)}`).not.toMatchObject({ closedBefore: true, shown: false, uidKept: false });
    await p.close();
  });

  // ── 5. property: random selections / folds / keys at the boundary, both directions ──
  it('[A3-P1] property (2,000 runs): with the header closed and not wholly selected, no key changes or moves the header (it stays a prefix and still reads with its uid) — or the fold opens/vanishes so the reader sees it; and no key loses more body text than the selection plus the caret\'s line', async () => {
    const SEEDS = Number(process.env.AUDIT3_RUNS ?? 2000);
    const p = await open();
    const H_END = AT_TO;
    let seed = 20261109;
    const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const KEYS = ['Backspace', 'Delete', 'x', 'Alt+Backspace', 'ControlOrMeta+Backspace', 'Alt+Delete', 'ControlOrMeta+Delete', 'Shift+Backspace', 'Enter', 'Tab', 'Shift+Tab', 'Alt+ArrowUp', 'Alt+ArrowDown', 'Control+t', 'ControlOrMeta+Shift+k', 'Shift+Alt+ArrowUp', 'ControlOrMeta+/', 'ControlOrMeta+z', 'ControlOrMeta+Shift+z'];
    const failures: string[] = [];
    const nonWs = (s: string): number => s.replace(/\s/g, '').length;
    for (let i = 0; i < SEEDS; i++) {
      // a text: with or without a blank line after "}}", sometimes a blank line before the header
      const variant = rnd(4);
      const T = variant === 0 ? TEXT : variant === 1 ? TEXT.replace('}}\n# Start', '}}\n\n# Start') : variant === 2 ? `\n${TEXT}` : `${HEADER}\n`;
      const off = variant === 2 ? 1 : 0;
      const hEnd = H_END + off;
      await p.evaluate(`shell.setText(${JSON.stringify(T)}, { resetHistory: true })`);
      const ops: string[] = [];
      // ends near both edges of the header (from inside, from below, from above) and anywhere
      const pick = (): number => { const r = rnd(4); return Math.min(T.length, r === 0 ? Math.max(0, hEnd - 2 + rnd(5)) : r === 1 ? rnd(3) : r === 2 ? rnd(hEnd + 3) : rnd(T.length + 1)); };
      for (let k = 0; k < 1 + rnd(3); k++) {
        const r = rnd(6);
        const a = pick(); const b = pick();
        if (r === 0) ops.push(`shell.select(${a}, ${b})`);
        else if (r === 1) ops.push(`shell.reveal({ from: ${a}, to: ${b} }, { select: true })`);
        else if (r === 2) ops.push('shell.adapter.setHeaderFolded(true)');
        else if (r === 3) ops.push('shell.adapter.setHeaderFolded(false)');
        else if (r === 4) ops.push(`(function(){ var w = shell.root.querySelector('[data-orz-header-fold]'); if (w) w.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail: 1 })); })()`);
        else ops.push('shell.adapter.setHeaderFolded(true)');
      }
      for (const op of ops) await p.evaluate(op);
      await p.evaluate('shell.focus()');
      const before = await p.evaluate('({ folded: shell.adapter.isHeaderFolded(), sel: shell.getSelection(), text: shell.getText() })') as { folded: boolean; sel: { from: number; to: number }; text: string };
      const key = KEYS[rnd(KEYS.length)];
      if (key === 'x') await p.keyboard.type('x'); else await p.keyboard.press(key);
      const after = await p.evaluate('({ text: shell.getText(), folded: shell.adapter.isHeaderFolded(), fold: !!shell.root.querySelector(\'[data-orz-header-fold="closed"]\') })') as { text: string; folded: boolean; fold: boolean };
      const wholly = before.sel.from <= off && before.sel.to >= hEnd;
      const tag = `${variant} | ${ops.join('; ')} | ${key} | sel ${JSON.stringify(before.sel)}`;
      // (a) the hidden header: unchanged (verbatim, at its place, still a header) while it stays closed
      if (before.folded && !wholly && key !== 'ControlOrMeta+z' && key !== 'ControlOrMeta+Shift+z') {
        const kept = after.text.startsWith(T.slice(0, hEnd)) && readHeader(after.text)?.fields['uid'] === UID;
        if (!kept && after.folded) failures.push(`header changed, still closed: ${tag} → ${JSON.stringify(after.text.slice(Math.max(0, hEnd - 6), hEnd + 12))}`);
        if (!after.text.startsWith(T.slice(0, hEnd)) && !(T.length - after.text.length <= 1 && readHeader(after.text)?.fields['uid'] === UID)) failures.push(`header text changed by one key while closed: ${tag} → ${JSON.stringify(after.text.slice(0, 40))}`);
      }
      // (b) the other direction: no more non-space text lost than the selection plus the caret's line(s)
      if (key !== 'ControlOrMeta+z' && key !== 'ControlOrMeta+Shift+z') {
        const s = before.sel;
        const lineFrom = before.text.lastIndexOf('\n', s.from - 1) + 1;
        let lineTo = before.text.indexOf('\n', s.to); if (lineTo < 0) lineTo = before.text.length;
        const budget = nonWs(before.text.slice(lineFrom, lineTo)) + 1;
        const lost = nonWs(before.text) - nonWs(after.text.replace(/<!--|-->/g, '')) + (key === 'x' ? 1 : 0);
        if (lost > budget) failures.push(`lost ${lost} > ${budget}: ${tag}`);
      }
    }
    expect(failures.slice(0, 15), `${failures.length} failures`).toEqual([]);
    await p.close();
  }, 600_000);
});
