/**
 * Themed charts and diagrams, visible-only drawing and SMILES sizing (2.4.0,
 * the orz-slides 1.0 kit gaps; claims M.32–M.34). Real Chrome with the real
 * pinned libraries (Chart.js, Mermaid, SmilesDrawer, fetched once into
 * node_modules/.cache and served through routes); the page tests skip when
 * Chrome or the libraries are not available.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import postcss from 'postcss';
import { md } from '../src/index';
import { CONTENT_THEME_SCRIPT, getPreviewFrameAssets, PREVIEW_CDN } from '../src/preview-frame';
import { contentLibs } from './helpers/content-libs';

type Browser = import('playwright-core').Browser;
type Page = import('playwright-core').Page;

const ORIGIN = 'https://orz.test';
let browser: Browser | null = null;
let libs: Record<string, string> | null = null;
let pf = '';

async function launch(): Promise<Browser | null> {
  try {
    const { chromium } = await import('playwright-core');
    return await chromium.launch({ channel: 'chrome' });
  } catch { return null; }
}
browser = await launch();
libs = browser ? await contentLibs() : null;
const chrome = browser && libs ? describe : describe.skip;

const COMMON = readFileSync('themes/common.css', 'utf8');

/** A page with the in-page enhancement (`PF` = orz-markdown/preview-frame) and `body` as its content. */
async function open(body: string, opts: { css?: string; scale?: number; frame?: boolean } = {}): Promise<Page> {
  const context = await browser!.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: opts.scale ?? 1 });
  const html = opts.frame
    ? `<!doctype html><html><head><meta charset="utf-8"><style>${COMMON}${opts.css ?? ''}</style></head><body>${body}${getPreviewFrameAssets().bodyScripts()}</body></html>`
    : `<!doctype html><html><head><meta charset="utf-8"><style>${COMMON}${opts.css ?? ''}</style></head><body>${body}<script src="/pf.js"></script></body></html>`;
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (libs![url] !== undefined) return route.fulfill({ status: 200, contentType: 'text/javascript', body: libs![url] });
    if (url === `${ORIGIN}/pf.js`) return route.fulfill({ status: 200, contentType: 'text/javascript', body: pf });
    if (url === `${ORIGIN}/`) return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/`);
  return page;
}

const enhance = (p: Page, sel = 'body', o = '{}') => p.evaluate(`PF.enhanceDocument(document.querySelector(${JSON.stringify(sel)}), ${o})`);
/** A chart's resolved colours, read from the live Chart.js instance. */
const chartFacts = (p: Page, sel: string) => p.evaluate(`(function () {
  var c = Chart.getChart(document.querySelector(${JSON.stringify(sel)}));
  if (!c) return null;
  var o = c.config.options;
  return {
    tick: o.scales && o.scales.x ? o.scales.x.ticks.color : null,
    grid: o.scales && o.scales.x ? o.scales.x.grid.color : null,
    legend: o.plugins.legend.labels.color,
    font: o.plugins.legend.labels.font && o.plugins.legend.labels.font.family,
    sets: c.config.data.datasets.map(function (d) { return [d.borderColor, d.backgroundColor]; }),
  };
})()`);

beforeAll(async () => {
  if (!browser) return;
  const { build } = await import('esbuild');
  pf = (await build({ entryPoints: ['src/preview-frame.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'PF', write: false, logLevel: 'silent' })).outputFiles[0].text;
}, 60_000);
afterAll(async () => { await browser?.close(); });

describe('the theme files (2.4.0)', () => {
  it('[M.32] every bundled theme sets the chart and diagram tokens on :root (--chart-text, --chart-grid, --chart-1 … --chart-6, --mm-text, --mm-line, --mm-node, --mm-border, --mm-accent, --mm-note), each a colour; CONTENT_THEME_SCRIPT is plain ES5 source (no backtick, no ${)', () => {
    const files = readdirSync('themes').filter((f) => f.endsWith('.css') && f !== 'common.css');
    expect(files.length).toBe(12);
    const need = ['--chart-text', '--chart-grid', ...[1, 2, 3, 4, 5, 6].map((i) => `--chart-${i}`), '--mm-text', '--mm-line', '--mm-node', '--mm-border', '--mm-accent', '--mm-note'];
    for (const f of files) {
      const root = postcss.parse(readFileSync(`themes/${f}`, 'utf8'));
      const decls: Record<string, string> = {};
      root.walkRules((r) => { if (r.selector.trim() === ':root' && r.parent?.type === 'root') r.walkDecls((d) => { decls[d.prop] = d.value; }); });
      for (const k of need) expect(decls[k], `${f} ${k}`).toMatch(/^(#[0-9a-f]{6}|rgba?\([^)]*\))$/i);
    }
    expect(CONTENT_THEME_SCRIPT).not.toMatch(/`|\$\{/);
  });
});

chrome('themed charts and diagrams (real Chrome, real libraries)', { timeout: 120_000 }, () => {
  const TOKENS = '.themed { --chart-text: rgb(10, 20, 30); --chart-grid: rgba(1, 2, 3, 0.25); --chart-font: Georgia, serif; --chart-1: #112233; --chart-2: oklch(0.6 0.15 30); --chart-fill-opacity: 0.25; --chart-surface: #fafafa; --mm-text: #101010; --mm-node: #e0f0e0; --mm-border: #208020; --mm-line: #404040; --mm-accent: #208020; --mm-note: #fff0c0; }';
  const DOC = '{{chart\ntype: bar\nlabels: A, B\nseries: One = 1, 2\nseries: Two = 3, 4\n}}\n\n{{chart\ntype: doughnut\nlabels: A, B, C\ndata: 1, 2, 3\n}}\n\n{{mermaid\ngraph LR\n  A[Start] --> B[End]\n}}\n';

  it('[M.32] enhanceDocument themes Chart.js from --chart-* (ticks, grid, legend, font, the series palette with --chart-fill-opacity fills, slices opaque with --chart-surface between them, oklch resolved) and Mermaid from --mm-* (Mermaid\'s base theme: node fill and border, text); a chart\'s own colours win; content without the tokens keeps Mermaid\'s default theme and Chart.js\'s palette, its text in the page\'s colour', async () => {
    const own = md.render('{{chart\ntype: line\nlabels: A, B\nseries: Mine = 1, 2\n}}\n').replace(/data-chart="([^"]*)"/, (_m, json: string) => {
      const g = JSON.parse(json.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
      g.data.datasets[0].borderColor = '#ff00ff';
      return `data-chart="${JSON.stringify(g).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;
    });
    const p = await open(`<article id="t" class="markdown-body themed">${md.render(DOC)}<div id="own">${own}</div></article><article id="u" class="markdown-body" style="color: rgb(200, 0, 0)">${md.render(DOC)}</article>`, { css: TOKENS });
    await enhance(p);
    const bar = await chartFacts(p, '#t canvas.orz-chart');
    expect(bar).toEqual({ tick: '#0a141e', grid: 'rgba(1, 2, 3, 0.25)', legend: '#0a141e', font: 'Georgia, serif', sets: [['#112233', 'rgba(17, 34, 51, 0.25)'], [expect.stringMatching(/^#[0-9a-f]{6}$/), expect.stringMatching(/^rgba\(\d+, \d+, \d+, 0\.25\)$/)]] });
    expect(bar!.sets[1][0]).not.toBe('#36a2eb'); // oklch() resolved, not dropped
    const pie = await p.evaluate(`(function () { var c = Chart.getChart(document.querySelectorAll('#t canvas.orz-chart')[1]); var d = c.config.data.datasets[0]; return [d.backgroundColor, d.borderColor]; })()`) as [string[], string];
    expect(pie[0][0]).toBe('#112233');
    expect(pie[0]).toHaveLength(3);
    expect(pie[0].every((c) => c.startsWith('#'))).toBe(true);
    expect(pie[1]).toBe('#fafafa');
    expect((await chartFacts(p, '#own canvas.orz-chart'))!.sets[0][0]).toBe('#ff00ff');
    // without the tokens: Chart.js's palette, the text in the page's colour
    const plain = await chartFacts(p, '#u canvas.orz-chart');
    expect(plain!.sets[0][0]).toBe('#36a2eb');
    expect(plain!.tick).toBe('#c80000');
    // Mermaid: the themed diagram's node fill and border; the plain one Mermaid's default
    const fills = await p.evaluate(`(function () {
      function node(id) { var r = document.querySelector(id + ' .mermaid svg .node rect, ' + id + ' .mermaid svg .node polygon'); var cs = r && getComputedStyle(r); return cs ? [cs.fill, cs.stroke] : null; }
      return { t: node('#t'), u: node('#u') };
    })()`) as { t: string[]; u: string[] };
    expect(fills.t).toEqual(['rgb(224, 240, 224)', 'rgb(32, 128, 32)']);
    expect(fills.u[0]).toBe('rgb(236, 236, 255)'); // Mermaid's default #ECECFF
    await p.context().close();
  });

  it('[M.32] the preview frame\'s __orzEnhance themes the same way (one CONTENT_THEME_SCRIPT): the same chart colours and Mermaid fills as enhanceDocument for the same content and tokens', async () => {
    const body = `<article id="t" class="markdown-body themed">${md.render(DOC)}</article>`;
    const page = await open(body, { css: TOKENS });
    await enhance(page);
    const inPage = [await chartFacts(page, '#t canvas.orz-chart'), await page.evaluate(`getComputedStyle(document.querySelector('#t .mermaid svg .node rect')).fill`)];
    await page.context().close();
    const frame = await open(body, { css: TOKENS, frame: true });
    await frame.waitForFunction(`typeof window.Chart === 'function' && window.mermaid && typeof window.mermaid.run === 'function' && window.SmilesDrawer && typeof window.__orzEnhance === 'function'`);
    await frame.evaluate('window.__orzEnhance()');
    await frame.waitForFunction(`!!document.querySelector('#t .mermaid svg .node rect')`);
    const inFrame = [await chartFacts(frame, '#t canvas.orz-chart'), await frame.evaluate(`getComputedStyle(document.querySelector('#t .mermaid svg .node rect')).fill`)];
    expect(inFrame).toEqual(inPage);
    await frame.context().close();
  });

  it('[M.33] charts and SMILES are drawn only when visible: one under display: none waits (no Chart.js instance, no frame) and is drawn when shown (a ResizeObserver); one under visibility: hidden is drawn by redrawEnhancement(el) once shown; redrawEnhancement resizes a drawn chart to its new container; a later enhanceDocument call draws a waiting one that became visible; disposeEnhancement stops the waiting; static: true draws hidden ones too', async () => {
    const chartMd = '{{chart\ntype: bar\nlabels: A, B\ndata: 1, 2\n}}\n\n{{smiles CCO}}\n';
    const p = await open(`<article class="markdown-body" id="doc"><div id="none" style="display:none">${md.render(chartMd)}</div><div id="hid" style="visibility:hidden">${md.render(chartMd)}</div><div id="vis" style="width:600px">${md.render(chartMd)}</div></article>`);
    await enhance(p, '#doc');
    const state = () => p.evaluate(`['none', 'hid', 'vis'].map(function (id) { var c = document.querySelector('#' + id + ' canvas.orz-chart'); var s = document.querySelector('#' + id + ' canvas[data-smiles]'); return [!!Chart.getChart(c), !!c.closest('.orz-chart-frame'), !!s.__dw]; })`) as Promise<boolean[][]>;
    expect(await state()).toEqual([[false, false, false], [false, false, false], [true, true, true]]);
    await p.evaluate(`document.getElementById('none').style.display = 'block'`);
    await p.waitForFunction(`!!Chart.getChart(document.querySelector('#none canvas.orz-chart'))`, null, { timeout: 5000 });
    expect((await state())[0]).toEqual([true, true, true]);
    await p.evaluate(`document.getElementById('hid').style.visibility = 'visible'`);
    await p.waitForTimeout(300);
    expect((await state())[1]).toEqual([false, false, false]); // nothing tells the observer: the size did not change
    await p.evaluate(`PF.redrawEnhancement(document.getElementById('hid'))`);
    expect((await state())[1]).toEqual([true, true, true]);
    // a drawn chart follows its container on redraw
    const w0 = await p.evaluate(`Chart.getChart(document.querySelector('#vis canvas.orz-chart')).width`);
    await p.evaluate(`document.getElementById('vis').style.width = '300px'; PF.redrawEnhancement(document.getElementById('vis'))`);
    const w1 = await p.evaluate(`Chart.getChart(document.querySelector('#vis canvas.orz-chart')).width`);
    expect(w1).toBeLessThan(w0 as number);
    await p.context().close();

    // a later enhanceDocument call draws what became visible; dispose stops the waiting
    const q = await open(`<article class="markdown-body" id="doc"><div id="hid" style="visibility:hidden">${md.render(chartMd)}</div></article><article class="markdown-body" id="doc2"><div id="hid2" style="display:none">${md.render(chartMd)}</div></article>`);
    await enhance(q, '#doc');
    await enhance(q, '#doc2');
    await q.evaluate(`document.getElementById('hid').style.visibility = 'visible'`);
    await enhance(q, '#doc');
    expect(await q.evaluate(`!!Chart.getChart(document.querySelector('#hid canvas.orz-chart'))`)).toBe(true);
    await q.evaluate(`PF.disposeEnhancement(document.getElementById('doc2')); document.getElementById('hid2').style.display = 'block'`);
    await q.waitForTimeout(400);
    expect(await q.evaluate(`!!Chart.getChart(document.querySelector('#hid2 canvas.orz-chart'))`)).toBe(false);
    await q.context().close();

    // static (print): hidden content is drawn and frozen
    const r = await open(`<article class="markdown-body" id="doc"><div style="visibility:hidden">${md.render(chartMd)}</div></article>`);
    const res = await enhance(r, '#doc', '{ static: true }') as { frozen: number };
    expect(res.frozen).toBe(2);
    await r.context().close();
  });

  it('[M.33] the preview frame waits the same way: a chart under visibility: hidden is drawn by __orzRedraw(el) once shown, one under display: none when it gets a size', async () => {
    const chartMd = '{{chart\ntype: bar\nlabels: A, B\ndata: 1, 2\n}}\n';
    const p = await open(`<article class="markdown-body"><div id="hid" style="visibility:hidden">${md.render(chartMd)}</div><div id="none" style="display:none">${md.render(chartMd)}</div></article>`, { frame: true });
    await p.waitForFunction(`typeof window.Chart === 'function' && typeof window.__orzEnhance === 'function'`);
    await p.evaluate('window.__orzEnhance()');
    const drawn = (id: string) => p.evaluate(`!!Chart.getChart(document.querySelector('#${id} canvas.orz-chart'))`);
    expect([await drawn('hid'), await drawn('none')]).toEqual([false, false]);
    await p.evaluate(`document.getElementById('hid').style.visibility = 'visible'; window.__orzRedraw(document.getElementById('hid'))`);
    expect(await drawn('hid')).toBe(true);
    await p.evaluate(`document.getElementById('none').style.display = 'block'`);
    await p.waitForFunction(`!!Chart.getChart(document.querySelector('#none canvas.orz-chart'))`, null, { timeout: 5000 });
    await p.context().close();
  });

  it('[M.34] a SMILES drawing is sized from its box: unconstrained it keeps its 250×180 (backing store × the pixel ratio), constrained by CSS (a 120×90 box, a 100%-wide region) it is drawn at that box\'s size, sharp at the pixel ratio, with ink inside; redrawEnhancement draws it again at a new box size; in the preview frame the same', async () => {
    const sm = md.render('{{smiles CC(=O)Oc1ccccc1C(=O)O}}\n');
    const css = '#small canvas[data-smiles] { width: 120px; height: 90px; max-width: none; } #wide canvas[data-smiles] { width: 100%; height: 300px; max-width: none; }';
    for (const frame of [false, true]) {
      const p = await open(`<article class="markdown-body"><div id="free">${sm}</div><div id="small">${sm}</div><div id="wide" style="width:500px">${sm}</div></article>`, { css, scale: 2, frame });
      if (frame) {
        await p.waitForFunction(`window.SmilesDrawer && typeof window.__orzEnhance === 'function'`);
        await p.evaluate('window.__orzEnhance()');
      } else await enhance(p);
      const facts = () => p.evaluate(`['free', 'small', 'wide'].map(function (id) {
        var v = document.querySelector('#' + id + ' canvas[data-smiles]');
        var x = v.getContext('2d').getImageData(0, 0, v.width, v.height).data, ink = 0;
        for (var i = 3; i < x.length; i += 4) if (x[i] > 0) ink++;
        return [v.clientWidth, v.clientHeight, v.width, v.height, ink > 50];
      })`) as Promise<Array<[number, number, number, number, boolean]>>;
      expect(await facts(), frame ? 'frame' : 'page').toEqual([[250, 180, 500, 360, true], [120, 90, 240, 180, true], [500, 300, 1000, 600, true]]);
      await p.evaluate(`document.getElementById('wide').style.width = '400px'; ${frame ? 'window.__orzRedraw' : 'PF.redrawEnhancement'}(document.getElementById('wide'))`);
      expect((await facts())[2], frame ? 'frame' : 'page').toEqual([400, 300, 800, 600, true]);
      await p.context().close();
    }
  });
});

void PREVIEW_CDN;
