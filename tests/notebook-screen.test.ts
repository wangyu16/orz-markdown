/**
 * light-playful-1 on screen is a ruled notebook (claim M.31; owner 2026-10-12:
 * the same model as orz-paged's print version, P.9 there). A rich document
 * (tests/helpers/notebook.ts) in real Chrome, shown the two ways the family
 * shows an article: in a page enhanced by `enhanceDocument` (orz-mdhtml's read
 * view) and in the editor's preview frame document enhanced by
 * `__orzEnhance`; at a desktop and a phone width, and at a reader zoom. (a)
 * every written line — paragraphs, lists, the TOC, headings of every level,
 * display formulas (their baseline), footnotes — sits on a rule (the rule
 * 0–3 px under its baseline); (b) every sheet — a table, code, a callout, a
 * quote, a figure, a picture, columns, tabs, a spoiler — is opaque and starts
 * and ends on a rule; (c) the ruling runs on behind what is on the lines: none
 * of those blocks has a background, and the pixels on the rules through the
 * two largest headings and the formulas show the rule ink; (d) other themes
 * are left alone (no grid pass acts), and switching away takes back all it
 * set. Screenshots: /tmp/screen-ui/light-playful-1-<view>-<width>.png.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { serve, inPageDocument, frameDocument, renderSample, settle, notebookReport, fromRule, ORIGIN, type NotebookReport } from './helpers/notebook.js';

async function launch(): Promise<Browser | null> {
  try {
    return await chromium.launch({ channel: 'chrome' });
  } catch {
    return null;
  }
}

const browser = await launch();
const chrome = browser ? describe : describe.skip;
afterAll(async () => { await browser?.close(); });

const SHOTS = '/tmp/screen-ui';
const HTML = renderSample();
const WIDTHS = { desktop: 1200, phone: 390 } as const;

type View = 'page' | 'frame';

/** Open the sample in a new page: in the page (enhanceDocument) or in the preview frame document (__orzEnhance). */
async function open(view: View, width: number, o: { theme?: string; zoom?: number; html?: string } = {}): Promise<{ page: Page; errors: string[] }> {
  const page = await browser!.newPage({ viewport: { width, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const theme = o.theme ?? 'light-playful-1';
  const html = o.html ?? HTML;
  await serve(page, { '/page.html': inPageDocument(theme, html, { zoom: o.zoom }), '/frame.html': frameDocument(theme) });
  if (view === 'frame') {
    await page.goto(`${ORIGIN}/frame.html`);
    await page.evaluate((h) => {
      document.getElementById('orz-doc')!.innerHTML = h;
      (window as unknown as { __orzEnhance(): void }).__orzEnhance();
    }, html);
  } else {
    await page.goto(`${ORIGIN}/page.html`);
    await page.evaluate(() => (window as unknown as { __enhanced: Promise<unknown> }).__enhanced);
  }
  await settle(page);
  return { page, errors };
}

/** (a) and (b) and the first half of (c) on a report. */
function expectNotebook(r: NotebookReport, where: string): void {
  expect(r.attribute, `${where}: the article carries the grid`).toBe('32');
  expect(r.grid, `${where}: the pitch`).toBeGreaterThan(2);
  expect(r.offGrid, `${where}: no written block left the grid`).toEqual([]);
  expect(r.transparent, `${where}: blocks on the lines have no background`).toEqual([]);
  expect(r.lines.length, `${where}: lines sampled`).toBeGreaterThan(40);
  for (const l of r.lines) {
    // the rule is just under the baseline: never above it, at most ~3 px below
    expect(l.d, `${where}: "${l.text}" sits ${l.d.toFixed(2)} px above its rule`).toBeGreaterThanOrEqual(-0.5);
    expect(l.d, `${where}: "${l.text}" sits ${l.d.toFixed(2)} px above its rule`).toBeLessThanOrEqual(3);
  }
  for (const k of ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'UL', 'OL', 'math', 'SECTION']) expect(r.kinds, `${where}: written ${k}`).toContain(k);
  for (const k of ['sheet:TABLE', 'sheet:PRE', 'sheet:DIV.info', 'sheet:BLOCKQUOTE', 'sheet:FIGURE', 'sheet:P.orz-picture', 'sheet:DIV.col', 'sheet:DIV.tabs', 'sheet:DETAILS.spoil']) expect(r.kinds, `${where}: sheet ${k}`).toContain(k);
  for (const s of r.sheets) {
    expect(s.opaque, `${where}: ${s.what} is opaque`).toBe(true);
    expect(s.atTop || Math.abs(fromRule(s.top, r)) <= 1, `${where}: ${s.what} starts on a rule (${s.top.toFixed(1)})`).toBe(true);
    expect(Math.abs(fromRule(s.bottom, r)), `${where}: ${s.what} ends on a rule (${s.bottom.toFixed(1)})`).toBeLessThanOrEqual(1);
  }
}

/** (c) by pixels: the rules that run through the two largest headings and the display formulas show the rule ink at the right end of the text column (no glyphs there). */
async function ruleInkMisses(page: Page): Promise<{ spots: number; misses: string[] }> {
  const spots = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.markdown-body')!;
    const rs = getComputedStyle(root);
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;height:var(--orz-grid);width:0';
    root.appendChild(probe);
    const g = probe.getBoundingClientRect().height;
    const z = g / parseFloat(getComputedStyle(probe).height);
    probe.remove();
    const ruleAt = parseFloat(rs.getPropertyValue('--orz-rule-at')) * z;
    const rr = root.getBoundingClientRect();
    const top0 = rr.top + (parseFloat(rs.borderTopWidth) + parseFloat(rs.paddingTop)) * z;
    const right = rr.right - (parseFloat(rs.borderRightWidth) + parseFloat(rs.paddingRight)) * z;
    const out: Array<{ x: number; y: number; what: string }> = [];
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(':scope > h1, :scope > h2, :scope > p.katex-block'))) {
      const r = el.getBoundingClientRect();
      for (let y = top0 + ruleAt + Math.ceil((r.top - top0 - ruleAt) / g) * g; y < r.bottom - 1; y += g) {
        out.push({ x: right - 3, y: y - 0.5 + window.scrollY, what: `${el.tagName} ${(el.textContent || '').slice(0, 16)} y=${(y - top0).toFixed(1)}` });
      }
    }
    return out;
  });
  const png = await page.screenshot({ type: 'png', fullPage: true });
  const misses = await page.evaluate(async ({ b64, spots }) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const scale = window.devicePixelRatio || 1;
    const out: string[] = [];
    for (const s of spots) {
      const d = g.getImageData(Math.round(s.x * scale), Math.round(s.y * scale) - 3, 1, 7).data;
      let found = false;
      // the rule ink (a light blue over the cream paper): blue clearly above red
      for (let i = 0; i < d.length; i += 4) if (d[i + 2] - d[i] >= 12) found = true;
      if (!found) out.push(s.what);
    }
    return out;
  }, { b64: png.toString('base64'), spots });
  return { spots: spots.length, misses };
}

chrome('light-playful-1 on screen: a ruled notebook (real Chrome)', () => {
  mkdirSync(SHOTS, { recursive: true });

  for (const view of ['page', 'frame'] as const) {
    it(`[M.31] ${view === 'page' ? 'in a page (enhanceDocument, as orz-mdhtml\'s read view)' : 'in the preview frame (__orzEnhance, as the editor\'s preview)'}, at a desktop and a phone width: every written line on a rule, every sheet opaque from rule to rule, the ruling visible behind the headings and formulas`, async () => {
      for (const [name, width] of Object.entries(WIDTHS)) {
        const { page, errors } = await open(view, width);
        try {
          const where = `${view} ${name}`;
          const r = await notebookReport(page);
          expectNotebook(r, where);
          const stats = r.stats as { live: boolean; blocks: number } | null;
          expect(stats?.blocks, `${where}: blocks placed`).toBeGreaterThan(30);
          expect(stats?.live, `${where}: placed in one batch (no block-by-block fallback)`).toBe(false);
          const ink = await ruleInkMisses(page);
          expect(ink.spots, `${where}: rules through headings and formulas`).toBeGreaterThan(6);
          expect(ink.misses, `${where}: the ruling shows behind headings and formulas`).toEqual([]);
          await page.screenshot({ path: `${SHOTS}/light-playful-1-${view}-${name}.png`, fullPage: true });
          expect(errors).toEqual([]);
        } finally {
          await page.close();
        }
      }
    }, 120_000);
  }

  it('[M.31] at a reader zoom (orz-mdhtml\'s text size zooms the article: 1.25 and 0.9) the lines and sheets stay on the ruling', async () => {
    for (const zoom of [1.25, 0.9]) {
      const { page, errors } = await open('page', 1200, { zoom });
      try {
        const r = await notebookReport(page);
        expect(r.zoom).toBeCloseTo(zoom, 2);
        expectNotebook(r, `zoom ${zoom}`);
        expect(errors).toEqual([]);
      } finally {
        await page.close();
      }
    }
  }, 120_000);

  it('[M.31] idempotent and kept: aligning again changes nothing; after a resize (a phone turned) and after a tab switch it is on the lines again; while printing everything it set is taken back', async () => {
    const { page } = await open('page', 1200);
    try {
      const snapshot = (): Promise<string> => page.evaluate(() => {
        const a = document.querySelector('.markdown-body')!;
        return [a.getAttribute('style') ?? '', ...Array.from(a.querySelectorAll('[style], .orz-off-grid, .orz-picture')).map((e) => `${e.tagName}.${e.className}|${e.getAttribute('style') ?? ''}`)].join('\n');
      });
      const before = await snapshot();
      await page.evaluate(() => { const g = (window as unknown as { OrzBaselineGrid: { align(a: Element): unknown } }).OrzBaselineGrid; const a = document.querySelector('.markdown-body')!; g.align(a); g.align(a); });
      expect(await snapshot()).toBe(before);
      await page.setViewportSize({ width: 700, height: 900 });
      await settle(page);
      expectNotebook(await notebookReport(page), 'resized to 700');
      // the longer tab: the tabs sheet grows, everything after it is placed again
      await page.click('.tabs-bar-btn:nth-child(2)');
      await settle(page);
      expectNotebook(await notebookReport(page), 'second tab');
      const printing = await page.evaluate(() => {
        window.dispatchEvent(new Event('beforeprint'));
        const a = document.querySelector('.markdown-body')!;
        const left = { attr: a.getAttribute('data-orz-grid'), vars: (a.getAttribute('style') ?? '').includes('--orz'), styled: Array.from(a.children).filter((e) => /margin|padding|top/.test(e.getAttribute('style') ?? '')).length };
        window.dispatchEvent(new Event('afterprint'));
        return left;
      });
      expect(printing).toEqual({ attr: null, vars: false, styled: 0 });
      expectNotebook(await notebookReport(page), 'after printing');
    } finally {
      await page.close();
    }
  }, 120_000);

  it('[M.31] the fallback: a list holding a code block is not whole lines — it hides the ruling (opaque, `orz-off-grid`) and the text after it is back on the lines', async () => {
    const text = '# Fallback\n\nBefore the list, on the lines.\n\n- an item\n\n  ```\n  code inside an item\n  ```\n\n- another item\n\nAfter the list the text is on the lines again, and stays there over several lines of running text that wrap.\n';
    const { page } = await open('page', 900, { html: renderSample(text) });
    try {
      const r = await notebookReport(page);
      expect(r.offGrid).toHaveLength(1);
      expect(r.offGrid[0]).toMatch(/^UL: \s*an item/);
      const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.markdown-body > ul')!).backgroundColor);
      expect(bg).toMatch(/^rgb\(/);
      expect(r.lines.length).toBeGreaterThan(2);
      for (const l of r.lines) expect(l.d, l.text).toBeGreaterThanOrEqual(-0.5);
      for (const l of r.lines) expect(l.d, l.text).toBeLessThanOrEqual(3);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('[M.31] other themes are left alone: no grid acts (no attribute, no custom property, no inline style, no class), in a page and in the frame; switching the page from light-playful-1 to another theme takes back everything it set', async () => {
    const clean = (page: Page): Promise<{ attr: string | null; styled: string[]; classes: number; stats: unknown }> => page.evaluate(() => {
      const a = document.querySelector('.markdown-body')!;
      const styled = [a, ...Array.from(a.children)].filter((e) => /--orz|margin|padding|top|height/.test(e.getAttribute('style') ?? '')).map((e) => `${e.tagName} ${e.getAttribute('style')}`);
      const g = (window as unknown as { OrzBaselineGrid?: { stats(a: Element): unknown } }).OrzBaselineGrid;
      return { attr: a.getAttribute('data-orz-grid'), styled, classes: a.querySelectorAll('.orz-off-grid, .orz-picture').length, stats: g ? g.stats(a) : 'no grid script' };
    });
    for (const theme of ['light-academic-1', 'light-playful-2', 'dark-elegant-3']) {
      for (const view of ['page', 'frame'] as const) {
        const { page } = await open(view, 1200, { theme });
        try {
          expect(await clean(page), `${theme} ${view}`).toEqual({ attr: null, styled: [], classes: 0, stats: null });
        } finally {
          await page.close();
        }
      }
    }
    const { page } = await open('page', 1200);
    try {
      expect((await clean(page)).attr).toBe('32');
      await page.evaluate((href) => { document.getElementById('orz-theme')!.setAttribute('href', href); }, `${ORIGIN}/themes/light-neat-1.css`);
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.markdown-body')!).getPropertyValue('--orz-grid').trim() === '');
      await settle(page);
      expect(await clean(page)).toEqual({ attr: null, styled: [], classes: 0, stats: null });
    } finally {
      await page.close();
    }
  }, 120_000);
});
