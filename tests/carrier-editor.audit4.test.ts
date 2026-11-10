/**
 * Adversarial audit 4 (closed-loop round 4) of the unreleased kit 2.7.0 editor
 * changes, after the round-3 fixes (719c158): the INVERTED header guard (while
 * the header is closed every transaction that changes its hidden text is
 * refused, except edits from code — the adapter's `codeEdits` flag — undo/redo
 * and a whole-text replacement), the covering-selection drawing, the reload
 * rule and Replace all's `onNotice`.
 *
 * Every `it` states the behaviour text integrity / the claims (E.51) require;
 * a failing `it` is a finding, a passing one is verified sound.
 *
 * Run alone: npx vitest run tests/carrier-editor.audit4.test.ts --maxWorkers=2
 * (skips without Chrome; AUDIT4_RUNS sets the property runs, default 300; the audit ran 3000).
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { CODEMIRROR6_PATH } from '../src/carrier/editor';
import { readHeader } from '../src/carrier/header';

const UID = 'doc-audit4audit4aud4';

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

chrome('audit4 real Chrome: the inverted header guard', { timeout: 120_000 }, () => {
  let server: http.Server | null = null;
  let A = '';
  const cm = readFileSync(CODEMIRROR6_PATH, 'utf8');
  // short enough that CodeMirror draws every line (the property reads the DOM)
  const BODY = Array.from({ length: 4 }, (_, i) => `## Section ${i + 1}\n\n${'Words of this section. '.repeat(3)}Buffers.\n`).join('\n');
  const HEADER = `{{nyml\nkind: document\nformat: 1\ntitle: Buffers in Five Minutes\nuid: ${UID}\n}}`;
  const TEXT = `${HEADER}\n# Start\n\n${BODY}`;
  const AT_TO = HEADER.length;
  const AFTER = AT_TO + 1;
  const APP = `
    window.viewOf = function (s) { var c = s.root.querySelector('.cm-content'); return c && c.cmTile && c.cmTile.root ? c.cmTile.root.view : null; };
    window.mountIt = function (text, o) {
      o = o || {};
      var E = window.OrzEditor;
      var el = document.getElementById(o.host || 'host');
      el.style.width = (o.width || 1000) + 'px';
      var s = E.createEditorShell(el, {
        text: text,
        render: function (t) { return E.renderMarkdownPreview(t); },
        adapter: E.codemirror6Adapter({ url: '/cm6.js' }),
        hooks: { save: function () { return Promise.resolve(); } },
        preview: { assets: false, debounceMs: 30 },
        mode: o.mode || 'editor',
        foldHeader: o.foldHeader !== false,
      });
      window[o.name || 'shell'] = s;
      return s.ready.then(function (r) { return r.engine; });
    };
    // the adapter alone (a host with its own shell): onNotice optional
    window.mountAdapter = function (text, mode) {
      var E = window.OrzEditor;
      var el = document.getElementById('host');
      var a = E.codemirror6Adapter({ url: '/cm6.js' });
      var o = { doc: text, onChange: function () {}, headerFold: function (t) { var i = t.indexOf('}}'); return t.indexOf('{{nyml') === 0 && i > 0 ? { from: 0, to: i + 2, title: 'T' } : null; } };
      window.notices = [];
      if (mode === 'notice') o.onNotice = function (m) { window.notices.push(m); };
      if (mode === 'throw') o.onNotice = function () { throw new Error('host notice failed'); };
      a.mount(el, o);
      window.ad = a;
      return a.ready().then(function (r) { window.adView = (function () { var c = el.querySelector('.cm-content'); return c.cmTile.root.view; })(); return r.engine; });
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
      res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:0}#host,#host2{height:700px}</style></head><body><div id="host"></div><div id="host2"></div><script src="/editor.js"></script><script src="/app.js"></script></body></html>');
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    A = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);
  afterAll(async () => { await browser?.close(); server?.close(); });

  const page = async (): Promise<Page> => {
    const p = await browser!.newPage({ viewport: { width: 1000, height: 800 } });
    await p.goto(`${A}/`);
    await p.waitForFunction('typeof window.mountIt === "function"');
    return p;
  };
  const open = async (text = TEXT, o: Record<string, unknown> = {}): Promise<Page> => {
    const p = await page();
    expect(await p.evaluate(`mountIt(${JSON.stringify(text)}, ${JSON.stringify(o)})`)).toBe('codemirror6');
    await p.waitForTimeout(150);
    return p;
  };
  const text = (p: Page, s = 'shell') => p.evaluate(`${s}.getText()`) as Promise<string>;
  const folded = (p: Page, s = 'shell') => p.evaluate(`${s}.adapter.isHeaderFolded()`) as Promise<boolean>;
  /** The header's lines are on screen as text (open, and not hidden by a focus fold). */
  const headerShown = (p: Page) => p.evaluate(`Array.from(shell.root.querySelectorAll('.cm-line')).some(function (l) { return l.textContent.indexOf(${JSON.stringify(UID)}) >= 0; })`) as Promise<boolean>;
  const coveredDrawn = (p: Page) => p.evaluate(`!!shell.root.querySelector('[data-orz-header-fold="closed"][data-selected]')`) as Promise<boolean>;

  // ── 1. the code-edit flag ──
  it('[A4-F1] a code edit that throws inside the adapter (applyChanges out of range) leaves no flag set: a reader key over the closed header is still refused afterwards', async () => {
    const p = await open();
    const threw = await p.evaluate(`(function(){ try { shell.adapter.applyChanges([{ from: 1e7, to: 1e7 + 1, insert: 'x' }]); return false; } catch (e) { return true; } })()`);
    expect(threw).toBe(true);
    await p.evaluate(`shell.focus(); shell.select(0, ${AFTER + 3})`);
    await p.keyboard.press('Backspace');
    const t = await text(p);
    expect(t.startsWith(HEADER) || !(await folded(p)) || (await coveredDrawn(p))).toBe(true);
    expect(t).toBe(TEXT);
    await p.close();
  });

  it('[A4-F2] the flag is per editor: a reader-originated transaction on editor B dispatched while editor A runs a code edit (inside A\'s synchronous change event: the host calls A\'s adapter directly) is still refused by B\'s guard', async () => {
    const p = await page();
    expect(await p.evaluate(`mountIt(${JSON.stringify(TEXT)}, { name: 'shell' })`)).toBe('codemirror6');
    expect(await p.evaluate(`mountIt(${JSON.stringify(TEXT)}, { name: 'shell2', host: 'host2' })`)).toBe('codemirror6');
    await p.waitForTimeout(150);
    const r = await p.evaluate(`(function(){
      var vb = viewOf(shell2);
      var fired = 0;
      shell.on('change', function () { if (fired++) return; vb.dispatch({ changes: { from: 7, to: 21 }, userEvent: 'delete.selection' }); });
      shell.adapter.applyChanges([{ from: ${AFTER}, to: ${AFTER}, insert: 'A' }]);
      return { fired: fired, b: shell2.getText(), bFolded: shell2.adapter.isHeaderFolded() };
    })()`) as { fired: number; b: string; bFolded: boolean };
    expect(r.fired).toBeGreaterThan(0);
    expect(r.b.startsWith(HEADER) || !r.bFolded).toBe(true);
    await p.close();
  });

  it('[A4-F3] (probe) what runs inside an editor\'s own flag: through the shell (setText / applyEdits) no host callback runs inside it; a host that calls the adapter directly gets its change listener run inside it (host code only, no reader path)', async () => {
    const p = await open();
    const r = await p.evaluate(`(function(){
      var va = viewOf(shell);
      var inShell = 0, inAdapter = 0, phase = 'shell';
      shell.on('change', function () { if (phase === 'adapter-sync') inAdapter++; });
      shell.on('selection', function () { inShell++; });
      shell.select(${AFTER + 2}, ${AFTER + 2});
      inShell = 0;
      shell.applyEdits([{ from: ${AFTER}, to: ${AFTER}, insert: 'A' }]);
      shell.setText(shell.getText() + 'B');
      var shellCallbacksInside = inShell;
      phase = 'adapter-sync';
      shell.adapter.applyChanges([{ from: ${AFTER}, to: ${AFTER}, insert: 'C' }]);
      phase = 'done';
      return { shellCallbacksInside: shellCallbacksInside, adapterChangeInside: inAdapter };
    })()`) as { shellCallbacksInside: number; adapterChangeInside: number };
    expect(r.shellCallbacksInside).toBe(0);
    expect(r.adapterChangeInside).toBeGreaterThan(0); // documented, host code
    await p.close();
  });

  // ── 2. "a whole-text replacement passes" ──
  it('[A4-W1] Replace all with a regular expression that matches the whole text ([\\s\\S]+), header closed: the hidden settings are left like any other Replace all (the whole-text exception is for a reader who selected everything)', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    await p.keyboard.press('ControlOrMeta+f');
    await p.waitForTimeout(100);
    await p.locator('.cm-search input[name="re"]').check();
    await p.locator('.cm-search input[name="search"]').fill('[\\s\\S]+');
    await p.locator('.cm-search input[name="replace"]').fill('gone');
    await p.locator('.cm-search button[name="replaceAll"]').click();
    await p.waitForTimeout(100);
    const t = await text(p);
    expect({ headerKept: t.startsWith(HEADER), wasClosedNoSelection: true }).toEqual({ headerKept: true, wasClosedNoSelection: true });
    await p.close();
  });

  it('[A4-W2] Replace all, regexp "[\\s\\S]" (every character, adjacent matches merge into one changed range 0..length), header closed: the hidden settings are not replaced', async () => {
    const p = await open(`${HEADER}\nab`);
    await p.evaluate('shell.focus()');
    await p.keyboard.press('ControlOrMeta+f');
    await p.waitForTimeout(100);
    await p.locator('.cm-search input[name="re"]').check();
    await p.locator('.cm-search input[name="search"]').fill('[\\s\\S]');
    await p.locator('.cm-search input[name="replace"]').fill('z');
    await p.locator('.cm-search button[name="replaceAll"]').click();
    await p.waitForTimeout(100);
    const t = await text(p);
    expect(t.startsWith(HEADER)).toBe(true);
    await p.close();
  });

  it('[A4-W3] select-all then typing / paste: the closed line is drawn selected before the key, and the key replaces the whole text', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    await p.keyboard.press('ControlOrMeta+a');
    await p.waitForTimeout(80);
    expect(await coveredDrawn(p)).toBe(true);
    await p.keyboard.type('Q');
    expect(await text(p)).toBe('Q');
    await p.close();
  });

  // ── 3. the end of the "}}" line ──
  it('[A4-E1] Backspace at the start of the first body line (no blank line after "}}") joins it to the "}}" line: the header keeps its bytes and fields, and is no longer folded (the joined line shows)', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    await p.keyboard.press('Backspace');
    const t = await text(p);
    expect(t).toBe(HEADER + '# Start' + TEXT.slice(AFTER + '# Start'.length));
    expect(readHeader(t)?.fields['uid']).toBe(UID);
    expect(await folded(p)).toBe(false);
    expect(await headerShown(p)).toBe(true);
    await p.close();
  });

  it('[A4-E2] a body edit that brings a legacy kind: meta block next to the header (FC-18 pair) changes the settings; the closed line then still names the settings as they read (its title)', async () => {
    const H = `{{nyml\nkind: document\nuid: ${UID}\n}}`;
    const T = `${H}\n\nPara to delete\n\n{{nyml\nkind: meta\ntitle: Injected\ntheme: dark\n}}\n\nBody\n`;
    const p = await open(T);
    const a = T.indexOf('Para');
    await p.evaluate(`shell.focus(); shell.select(${a}, ${a + 'Para to delete\n\n'.length})`);
    await p.keyboard.press('Backspace');
    const t = await text(p);
    expect(readHeader(t)?.fields['title']).toBe('Injected'); // the FC-18 rule: the pair is one header
    const title = await p.evaluate(`(shell.root.querySelector('.orz-header-fold__title') || {}).textContent || ''`);
    expect(title).toContain('Injected');
    await p.close();
  });

  it('[A4-E3] a text with a blank line above the header: when CodeMirror arrives the caret is right after the folded header (E.51), so the first typed key does not go above it — a character there makes the header no header (readHeader null)', async () => {
    const T = `\n${TEXT}`;
    const p = await open(T);
    await p.evaluate('shell.focus()');
    const s = await p.evaluate('shell.getSelection()') as { from: number; to: number };
    await p.keyboard.type('x');
    const t = await text(p);
    expect({ caretAfterHeader: s.from === AFTER + 1, headerStillReads: readHeader(t)?.fields['uid'] === UID }).toEqual({ caretAfterHeader: true, headerStillReads: true });
    await p.close();
  });

  it('[A4-E4] a blank line above the closed header: ArrowUp from the first body line steps over the closed line to the blank line (the header stays closed); one typed character there un-heads the document', async () => {
    const T = `\n${TEXT}`;
    const p = await open(T);
    await p.evaluate(`shell.focus(); shell.select(${AFTER + 1}, ${AFTER + 1})`);
    await p.keyboard.press('ArrowUp');
    const closed = await folded(p);
    const s = await p.evaluate('shell.getSelection()') as { from: number; to: number };
    await p.keyboard.type('x');
    const t = await text(p);
    expect({ closed, caret: s.from, headerStillReads: readHeader(t)?.fields['uid'] === UID }).not.toMatchObject({ closed: true, caret: 0, headerStillReads: false });
    await p.close();
  });

  // ── 4. refusal UX ──
  it('[A4-U1] a refused key (Backspace over a selection covering the closed header, not all) opens the header, changes nothing, and the second press acts (no stuck state)', async () => {
    const p = await open();
    await p.evaluate(`shell.focus(); shell.select(0, ${AFTER + 3})`);
    await p.keyboard.press('Backspace');
    expect(await text(p)).toBe(TEXT);
    expect(await folded(p)).toBe(false);
    await p.keyboard.press('Backspace');
    expect(await text(p)).toBe(TEXT.slice(AFTER + 3));
    await p.close();
  });

  it('[A4-U2] a refused key is announced to a screen reader (an aria-live region, CodeMirror\'s announcer or the shell\'s status, says why nothing changed)', async () => {
    const p = await open();
    await p.evaluate(`shell.focus(); shell.select(0, ${AFTER + 3})`);
    const before = await p.evaluate(`Array.from(shell.root.querySelectorAll('[aria-live], .cm-announced')).map(function (e) { return e.textContent; }).join('|')`);
    await p.keyboard.press('Backspace');
    await p.waitForTimeout(150);
    const after = await p.evaluate(`Array.from(shell.root.querySelectorAll('[aria-live], .cm-announced')).map(function (e) { return e.textContent; }).join('|')`);
    expect(await text(p)).toBe(TEXT);
    expect(after, 'no live region changed').not.toBe(before);
    await p.close();
  });

  it('[A4-U3] a refused typed character over a covering selection (DOM input path): the drawn lines match the text afterwards (no character left in the DOM that the text does not hold)', async () => {
    const p = await open();
    await p.evaluate(`shell.focus(); shell.select(0, ${AFTER + 3})`);
    await p.keyboard.type('k');
    await p.waitForTimeout(120);
    const bad = await p.evaluate(`(function(){ var v = viewOf(shell); var out = []; shell.root.querySelectorAll('.cm-content .cm-line').forEach(function (l) { var pos = v.posAtDOM(l, 0); var line = v.state.doc.lineAt(pos); if (l.textContent !== line.text) out.push([l.textContent, line.text]); }); return out; })()`);
    expect(bad, 'drawn lines differ from the text').toEqual([]);
    // the same selection and Backspace is refused whole (A4-U1); typing replaces only the body part of it (the
    // DOM read sees the closed line as not editable) and leaves the header closed — the two keys disagree
    const t = await text(p);
    expect({ sameAsBackspace: t === TEXT, partial: t === TEXT.slice(0, AFTER) + 'k' + TEXT.slice(AFTER + 3) }).toEqual({ sameAsBackspace: true, partial: false });
    await p.close();
  });

  it('[A4-U4] setFocusRange(..., { mode: "fold" }) on the body: the header lines are hidden by the focus fold; the reader selects up to the start and presses Backspace twice — the hidden settings are never removed without being shown', async () => {
    const p = await open();
    await p.evaluate(`shell.setFocusRange(${AFTER}, ${AFTER + 30}, { mode: 'fold' }); shell.focus(); shell.select(${AFTER}, ${AFTER})`);
    await p.waitForTimeout(80);
    await p.keyboard.press('Shift+ControlOrMeta+ArrowUp');
    await p.waitForTimeout(50);
    const seen: boolean[] = [];
    for (let i = 0; i < 2; i++) {
      seen.push((await headerShown(p)) || (await coveredDrawn(p)) || (await p.evaluate(`!!shell.root.querySelector('[data-orz-header-fold]')`)) as boolean);
      await p.keyboard.press('Backspace');
      await p.waitForTimeout(50);
    }
    const t = await text(p);
    const kept = readHeader(t)?.fields['uid'] === UID;
    expect({ kept, everShown: seen.some(Boolean) }).not.toEqual({ kept: false, everShown: false });
    await p.close();
  });

  // ── 5. onNotice ──
  it('[A4-N1] the Replace all notice is a polite status toast set as text (no element from the message), in the shell', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    await p.keyboard.press('ControlOrMeta+f');
    await p.waitForTimeout(100);
    await p.locator('.cm-search input[name="search"]').fill('Buffers');
    await p.locator('.cm-search input[name="replace"]').fill('<b>Q</b>');
    await p.locator('.cm-search button[name="replaceAll"]').click();
    await p.waitForTimeout(150);
    const r = await p.evaluate(`(function(){ var t = shell.root.querySelector('.orz-toast__text'); var live = t && t.closest('[aria-live]'); return { text: t && t.textContent, kids: t ? t.children.length : -1, live: live ? live.getAttribute('aria-live') : null }; })()`) as { text: string; kids: number; live: string };
    expect(r.text).toContain('document settings were left');
    expect(r.kids).toBe(0);
    expect(r.live).toBe('polite');
    const t = await text(p);
    expect(t.startsWith(HEADER)).toBe(true);
    expect(t.slice(AT_TO)).toContain('<b>Q</b>');
    await p.close();
  });

  it('[A4-N2] an adapter mounted without onNotice (a host\'s own shell): a Replace all that meets the closed header still replaces the body and throws nothing', async () => {
    const p = await page();
    expect(await p.evaluate(`mountAdapter(${JSON.stringify(TEXT)}, 'none')`)).toBe('codemirror6');
    const r = await p.evaluate(`(function(){ var v = adView; var d = v.state.doc.toString(); var ch = []; var re = /Buffers/g, m; while ((m = re.exec(d))) ch.push({ from: m.index, to: m.index + 7, insert: 'Queues' }); try { v.dispatch({ changes: ch, userEvent: 'input.replace.all' }); } catch (e) { return { err: String(e) }; } return { t: v.state.doc.toString() }; })()`) as { t?: string; err?: string };
    expect(r.err).toBeUndefined();
    expect(r.t!.startsWith(HEADER)).toBe(true);
    expect(r.t!.slice(AT_TO)).not.toContain('Buffers');
    await p.close();
  });

  it('[A4-N3] an onNotice that throws (a host\'s handler failing) does not cost the reader the Replace all: the body matches are still replaced', async () => {
    const p = await page();
    expect(await p.evaluate(`mountAdapter(${JSON.stringify(TEXT)}, 'throw')`)).toBe('codemirror6');
    const r = await p.evaluate(`(function(){ var v = adView; var d = v.state.doc.toString(); var ch = []; var re = /Buffers/g, m; while ((m = re.exec(d))) ch.push({ from: m.index, to: m.index + 7, insert: 'Queues' }); var err = null; try { v.dispatch({ changes: ch, userEvent: 'input.replace.all' }); } catch (e) { err = String(e); } return { t: v.state.doc.toString(), err: err }; })()`) as { t: string; err: string | null };
    expect({ bodyReplaced: !r.t.slice(AT_TO).includes('Buffers'), err: r.err }).toEqual({ bodyReplaced: true, err: null });
    await p.close();
  });

  it('[A4-N4] Replace all whose only matches are in the closed header: the header opens and the notice matches what the reader sees (it does not tell them to open what is already open)', async () => {
    const p = await open();
    await p.evaluate('shell.focus()');
    await p.keyboard.press('ControlOrMeta+f');
    await p.waitForTimeout(100);
    await p.locator('.cm-search input[name="search"]').fill('Five Minutes');
    await p.locator('.cm-search input[name="replace"]').fill('Ten');
    await p.locator('.cm-search button[name="replaceAll"]').click();
    await p.waitForTimeout(150);
    const open1 = !(await folded(p));
    const msg = await p.evaluate(`(shell.root.querySelector('.orz-toast__text') || {}).textContent || ''`) as string;
    expect(await text(p)).toBe(TEXT);
    expect({ open: open1, saysOpenThem: open1 && /Open them/.test(msg) }).toEqual({ open: true, saysOpenThem: false });
    await p.close();
  });

  // ── 6. property ──
  it('[A4-P1] property (AUDIT4_RUNS, default 300; audit run 3,000): random texts, host calls interleaved (setText with and without resetHistory, applyEdits in the body and the header, select, reveal, fold/unfold, the bar, focus ranges dim and fold) and 1–3 reader keys from an extended set (deletes, typing, paste, cut, Enter, Tab, comments, line moves, transpose, emacs keys, undo/redo): no key changes header text the reader neither saw selected nor saw on screen; no key loses more body text than its selection plus the caret\'s line; the drawn lines always match the text', async () => {
    const RUNS = Number(process.env.AUDIT4_RUNS ?? 300);
    const p = await open();
    let seed = 4042026;
    const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const KEYS = ['Backspace', 'Delete', 'x', 'Alt+Backspace', 'ControlOrMeta+Backspace', 'Alt+Delete', 'ControlOrMeta+Delete', 'Shift+Backspace', 'Enter', 'Shift+Enter', 'ControlOrMeta+Enter', 'Tab', 'Shift+Tab', 'ControlOrMeta+BracketRight', 'ControlOrMeta+BracketLeft', 'ControlOrMeta+/', 'ControlOrMeta+Alt+Backslash', 'Alt+ArrowUp', 'Alt+ArrowDown', 'Shift+Alt+ArrowUp', 'Shift+Alt+ArrowDown', 'Control+t', 'Control+k', 'Control+d', 'Control+h', 'Control+o', 'ControlOrMeta+Shift+k', 'ControlOrMeta+z', 'ControlOrMeta+Shift+z', 'ControlOrMeta+a', 'Shift+ArrowUp', 'Shift+ControlOrMeta+ArrowUp', 'ArrowUp', 'ControlOrMeta+ArrowUp', 'Shift+ArrowDown', 'ControlOrMeta+d', 'ControlOrMeta+l', 'PASTE', 'CUT', 'PASTE_ML', '}', '{'];
    const UNDO = new Set(['ControlOrMeta+z', 'ControlOrMeta+Shift+z']);
    const nonWs = (s: string): number => s.replace(/\s/g, '').length;
    const failures: { a: string[]; b: string[]; c: string[]; fold: string[] } = { a: [], b: [], c: [], fold: [] };
    let refusals = 0; let keysRun = 0;
    const SNAP = `(function(){ var v = viewOf(shell); var c = shell.root.querySelector('[data-orz-header-fold]'); return {
      text: shell.getText(), sel: shell.getSelection(), folded: shell.adapter.isHeaderFolded(),
      covered: !!shell.root.querySelector('[data-orz-header-fold="closed"][data-selected]'),
      shown: !!shell.root.querySelector('[data-orz-header-fold="open"]') || Array.from(shell.root.querySelectorAll('.cm-line')).some(function (l) { return l.textContent.indexOf('{{nyml') === 0; }),
      ranges: v.state.selection.ranges.map(function (r) { return [r.from, r.to]; }),
      fold: c ? c.getAttribute('data-orz-header-fold') : null }; })()`;
    const DOMCHECK = `(function(){ var v = viewOf(shell); var out = []; shell.root.querySelectorAll('.cm-content .cm-line').forEach(function (l) { try { var pos = v.posAtDOM(l, 0); var line = v.state.doc.lineAt(pos); if (l.textContent !== line.text) out.push(JSON.stringify([l.textContent, line.text])); } catch (e) { out.push(String(e)); } }); return out; })()`;
    for (let i = 0; i < RUNS; i++) {
      const variant = rnd(6);
      const T = variant === 0 ? TEXT
        : variant === 1 ? TEXT.replace('}}\n# Start', '}}\n\n# Start')
        : variant === 2 ? `\n${TEXT}`
        : variant === 3 ? `${HEADER}\n`
        : variant === 4 ? `${HEADER}\n- a\n- b\n`
        : `\n\n${HEADER}\n\n> quote\n`;
      await p.evaluate(`shell.setFocusRange(null); shell.setText(${JSON.stringify(T)}, { resetHistory: true })`);
      const ops: string[] = [];
      let focusFold = false;
      const L = T.length;
      const hEnd = T.indexOf('}}') + 2;
      const hStart = T.indexOf('{{nyml');
      const near = (): number => Math.min(L, rnd(3) === 0 ? rnd(hStart + 2) : Math.max(0, hEnd - 3 + rnd(8)));
      const pick = (): number => (rnd(2) === 0 ? near() : rnd(L + 1));
      for (let k = 0; k < rnd(5); k++) {
        const r = rnd(14);
        const a = pick(); const b = pick();
        if (r === 0) ops.push(`shell.select(${a}, ${b})`);
        else if (r === 1) ops.push(`shell.select(${rnd(hStart + 1)}, ${Math.min(L, hEnd + 1 + rnd(30))})`);
        else if (r === 2) ops.push(`shell.select(${Math.min(L, hEnd + 1 + rnd(30))}, ${rnd(hStart + 1)})`);
        else if (r === 3) ops.push(`shell.reveal({ from: ${a}, to: ${b} }, { select: ${rnd(2) === 0} })`);
        else if (r === 4) ops.push('shell.adapter.setHeaderFolded(true)');
        else if (r === 5) ops.push('shell.adapter.setHeaderFolded(false)');
        else if (r === 6) ops.push(`(function(){ var w = shell.root.querySelector('[data-orz-header-fold]'); if (w) w.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail: 1 })); })()`);
        else if (r === 7) ops.push('shell.setText(shell.getText(), { resetHistory: true })');
        else if (r === 8) ops.push(`(function(){ var t = shell.getText(); var n = Math.min(t.length, ${a}); shell.setText(t.slice(0, n) + (n > ${hEnd} ? 'H' : '') + t.slice(n)); })()`);
        else if (r === 9) ops.push(`(function(){ var t = shell.getText(); var n = Math.min(t.length, ${a}); shell.applyEdits([{ from: n, to: n, insert: n >= ${hEnd} ? 'E' : '' }]); })()`);
        else if (r === 10) ops.push(`(function(){ var t = shell.getText(); var i = t.indexOf('format: 1'); if (i >= 0) shell.applyEdits([{ from: i, to: i + 9, insert: 'format: 1' }]); })()`);
        else if (r === 11) ops.push(`(function(){ var t = shell.getText(); var n = Math.min(t.length, ${Math.max(a, hEnd + 1)}); shell.setFocusRange(n, Math.min(t.length, n + 20), { mode: 'dim' }); })()`);
        else if (r === 12) { ops.push(`(function(){ var t = shell.getText(); var n = Math.min(t.length, ${Math.max(a, hEnd + 1)}); shell.setFocusRange(n, Math.min(t.length, n + 20), { mode: 'fold' }); })()`); focusFold = true; }
        else ops.push('shell.setFocusRange(null)');
      }
      for (const op of ops) await p.evaluate(op);
      await p.evaluate('shell.focus()');
      const nKeys = 1 + rnd(3);
      const keys: string[] = [];
      for (let k = 0; k < nKeys; k++) {
        const before = await p.evaluate(SNAP) as { text: string; sel: { from: number; to: number }; folded: boolean; covered: boolean; shown: boolean; ranges: number[][]; fold: string | null };
        const key = KEYS[rnd(KEYS.length)];
        keys.push(key);
        if (key === 'x' || key === '}' || key === '{') await p.keyboard.type(key);
        else if (key === 'PASTE' || key === 'PASTE_ML') await p.evaluate(`(function(){ var c = shell.root.querySelector('.cm-content'); var dt = new DataTransfer(); dt.setData('text/plain', ${JSON.stringify('P')} + (${key === 'PASTE_ML'} ? '\\n}}\\nQ' : '')); c.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
        else if (key === 'CUT') await p.evaluate(`(function(){ var c = shell.root.querySelector('.cm-content'); var dt = new DataTransfer(); c.dispatchEvent(new ClipboardEvent('cut', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
        else await p.keyboard.press(key);
        keysRun++;
        const after = await p.evaluate(SNAP) as typeof before;
        const tag = `v${variant} | ${ops.join('; ')} | keys ${keys.join(' ')} | sel ${JSON.stringify(before.ranges)} folded ${before.folded} shown ${before.shown} covered ${before.covered}`;
        const hb = readHeader(before.text);
        const ha = readHeader(after.text);
        const rawB = hb ? before.text.slice(hb.start, hb.end) : null;
        const rawA = ha ? after.text.slice(ha.start, ha.end) : null;
        const headerChanged = rawB !== null && rawB !== rawA;
        if (before.folded && after.text === before.text && !after.folded) refusals++;
        // (a) the header changed, but the reader neither saw it on screen nor saw it selected
        const unseen = hb !== null && !before.shown && !before.covered;
        if (headerChanged && unseen) {
          if (UNDO.has(key)) { if (!after.shown) (focusFold ? failures.fold : failures.a).push(`undo changed the header and it is not shown: ${tag}`); }
          else (focusFold ? failures.fold : failures.a).push(`header changed unseen: ${tag} → ${JSON.stringify(after.text.slice(0, 50))}`);
        }
        // (b) body loss beyond the selection plus the caret's line(s)
        if (!UNDO.has(key) && key !== 'ControlOrMeta+a') {
          let budget = 1;
          for (const [f, t] of before.ranges) {
            const lf = before.text.lastIndexOf('\n', f - 1) + 1;
            let lt = before.text.indexOf('\n', t); if (lt < 0) lt = before.text.length;
            budget += nonWs(before.text.slice(lf, lt));
          }
          const lost = nonWs(before.text) - nonWs(after.text.replace(/<!--|-->/g, ''));
          if (lost > budget) failures.b.push(`lost ${lost} > ${budget}: ${tag}`);
        }
        // (c) what is drawn is the text
        await p.waitForTimeout(20);
        const bad = await p.evaluate(DOMCHECK) as string[];
        if (bad.length) failures.c.push(`${bad.slice(0, 2).join(' / ')}: ${tag}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[A4-P1] runs ${RUNS}, keys ${keysRun}, refusals ${refusals}; failures a ${failures.a.length}, b ${failures.b.length}, c ${failures.c.length}, under a focus fold ${failures.fold.length}`);
    for (const k of ['a', 'b', 'c', 'fold'] as const) for (const f of failures[k].slice(0, 4)) console.log(`[A4-P1 ${k}] ${f}`);
    expect({ a: failures.a.slice(0, 6), b: failures.b.slice(0, 6), c: failures.c.slice(0, 6) }).toEqual({ a: [], b: [], c: [] });
    expect(failures.fold.slice(0, 6), 'under a setFocusRange fold').toEqual([]);
    await p.close();
  }, 3_600_000);
});
