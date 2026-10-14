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

  // ── 2.4.0, the orz-slides engine's kit gaps (step 3): Mermaid hidden and scaled, font sizes ──

  const FLOW = '{{mermaid\ngraph LR\n  A[Initiator] --> B[Responder]\n}}\n';
  /** Per diagram in `sel`: does it use HTML labels (foreignObject); per node its label, its box width and the label's own width (in the SVG's units). */
  const nodes = (p: Page, sel: string) => p.evaluate(`(function () {
    var svg = document.querySelector(${JSON.stringify(sel)} + ' .mermaid svg');
    if (!svg) return null;
    var r = svg.getBoundingClientRect();
    return {
      html: !!svg.querySelector('.node foreignObject'),
      size: [r.width > 0, r.height > 0],
      nodes: [].slice.call(svg.querySelectorAll('g.node')).map(function (g) {
        var box = g.querySelector('rect, polygon').getBBox();
        var fo = g.querySelector('foreignObject');
        var label = fo ? fo.querySelector('span, div') : g.querySelector('text');
        var own = fo ? label.scrollWidth : label.getBBox().width;
        var room = fo ? +fo.getAttribute('width') : box.width;
        return { text: label.textContent.trim(), box: Math.round(box.width), fits: own <= room + 1 };
      })
    };
  })()`) as Promise<{ html: boolean; size: boolean[]; nodes: Array<{ text: string; box: number; fits: boolean }> } | null>;

  it('[M.35] a Mermaid diagram is drawn only when laid out: one under display: none waits (not processed, no SVG) and, shown, is drawn by redrawEnhancement(el) with the layout of a diagram drawn visible (labels complete, nonzero size); one under visibility: hidden is laid out and drawn at once; a ResizeObserver draws one that gets a size; a later enhanceDocument pass draws one that was shown; disposeEnhancement stops the waiting; static: true draws hidden ones; the preview frame waits the same way (__orzRedraw(el), the ResizeObserver)', async () => {
    const p = await open(`<article class="markdown-body" id="doc"><div id="none" style="display:none">${md.render(FLOW)}</div><div id="hid" style="visibility:hidden">${md.render(FLOW)}</div><div id="vis">${md.render(FLOW)}</div></article>`);
    await enhance(p, '#doc');
    const ref = await nodes(p, '#vis');
    expect(ref!.size).toEqual([true, true]);
    expect(ref!.nodes.map((n) => [n.text, n.fits])).toEqual([['Initiator', true], ['Responder', true]]);
    expect(await p.evaluate(`[document.querySelector('#none .mermaid').hasAttribute('data-processed'), !!document.querySelector('#none .mermaid svg')]`)).toEqual([false, false]);
    expect(await nodes(p, '#hid')).toEqual(ref); // laid out: drawn right away, the same
    await p.evaluate(`document.getElementById('none').style.display = 'block'; PF.redrawEnhancement(document.getElementById('none'))`);
    await p.waitForFunction(`!!document.querySelector('#none .mermaid svg g.node')`, null, { timeout: 10_000 });
    expect(await nodes(p, '#none')).toEqual(ref);
    await p.context().close();

    // the ResizeObserver; a later pass; dispose
    const q = await open(`<article class="markdown-body" id="a"><div id="ro" style="display:none">${md.render(FLOW)}</div></article><article class="markdown-body" id="b"><div id="later" style="display:none">${md.render(FLOW)}</div></article><article class="markdown-body" id="c"><div id="gone" style="display:none">${md.render(FLOW)}</div></article>`);
    await enhance(q, '#a'); await enhance(q, '#b'); await enhance(q, '#c');
    await q.evaluate(`document.getElementById('ro').style.display = 'block'`);
    await q.waitForFunction(`!!document.querySelector('#ro .mermaid svg g.node')`, null, { timeout: 10_000 });
    expect((await nodes(q, '#ro'))!.nodes.every((n) => n.fits)).toBe(true);
    await q.evaluate(`PF.disposeEnhancement(document.getElementById('c')); document.getElementById('gone').style.display = 'block'`);
    await q.waitForTimeout(500);
    expect(await q.evaluate(`!!document.querySelector('#gone .mermaid svg')`)).toBe(false);
    await q.evaluate(`document.getElementById('later').style.display = 'block'`);
    await enhance(q, '#b');
    expect(await q.evaluate(`!!document.querySelector('#later .mermaid svg g.node')`)).toBe(true);
    await q.context().close();

    // static (print): drawn even when hidden
    const r = await open(`<article class="markdown-body" id="doc"><div style="display:none">${md.render(FLOW)}</div></article>`);
    await enhance(r, '#doc', '{ static: true }');
    expect(await r.evaluate(`!!document.querySelector('#doc .mermaid svg')`)).toBe(true);
    await r.context().close();

    // the preview frame
    const f = await open(`<article class="markdown-body"><div id="none" style="display:none">${md.render(FLOW)}</div><div id="ro" style="display:none">${md.render(FLOW)}</div><div id="vis">${md.render(FLOW)}</div></article>`, { frame: true });
    await f.waitForFunction(`window.mermaid && typeof window.mermaid.run === 'function' && typeof window.__orzEnhance === 'function'`);
    await f.evaluate('window.__orzEnhance()');
    await f.waitForFunction(`!!document.querySelector('#vis .mermaid svg g.node')`, null, { timeout: 10_000 });
    expect(await f.evaluate(`!!document.querySelector('#none .mermaid svg')`)).toBe(false);
    const fref = await nodes(f, '#vis');
    await f.evaluate(`document.getElementById('none').style.display = 'block'; window.__orzRedraw(document.getElementById('none'))`);
    await f.waitForFunction(`!!document.querySelector('#none .mermaid svg g.node')`, null, { timeout: 10_000 });
    expect(await nodes(f, '#none')).toEqual(fref);
    await f.evaluate(`document.getElementById('ro').style.display = 'block'`);
    await f.waitForFunction(`!!document.querySelector('#ro .mermaid svg g.node')`, null, { timeout: 10_000 });
    expect(await nodes(f, '#ro')).toEqual(fref);
    await f.context().close();
  });

  it('[M.36] Mermaid under a CSS transform that scales it (a slide at scale(0.6)) draws SVG labels, measured right: every label complete and its node as wide as unscaled; --mm-labels: svg asks for SVG labels anywhere, --mm-labels: html keeps HTML labels (cut under the transform, as Mermaid measures them); unscaled diagrams keep HTML labels; the preview frame the same', async () => {
    const body = `<article class="markdown-body" id="doc">
      <div id="plain">${md.render(FLOW)}</div>
      <div style="transform: scale(0.6); transform-origin: 0 0"><div id="scaled">${md.render(FLOW)}</div><div id="forced" style="--mm-labels: html">${md.render(FLOW)}</div></div>
      <div id="svg" style="--mm-labels: svg">${md.render(FLOW)}</div></article>`;
    for (const frame of [false, true]) {
      const p = await open(body, { frame });
      if (frame) {
        await p.waitForFunction(`window.mermaid && typeof window.mermaid.run === 'function' && typeof window.__orzEnhance === 'function'`);
        await p.evaluate('window.__orzEnhance()');
        await p.waitForFunction(`document.querySelectorAll('#doc .mermaid svg g.node').length === 8`, null, { timeout: 10_000 });
      } else await enhance(p, '#doc');
      const [plain, scaled, forced, svg] = await Promise.all(['#plain', '#scaled', '#forced', '#svg'].map((s) => nodes(p, s)));
      const where = frame ? 'frame' : 'page';
      expect(plain!.html, where).toBe(true);
      expect(scaled!.html, where).toBe(false);
      expect(svg!.html, where).toBe(false);
      expect(forced!.html, where).toBe(true);
      for (const d of [plain!, scaled!, svg!]) expect(d.nodes.map((n) => [n.text, n.fits]), where).toEqual([['Initiator', true], ['Responder', true]]);
      // scaled: as wide as unscaled (within 10 %); HTML labels under the transform: measured at the scale, cut
      for (let i = 0; i < 2; i++) {
        expect(Math.abs(scaled!.nodes[i].box - plain!.nodes[i].box) / plain!.nodes[i].box, where).toBeLessThan(0.1);
        expect(forced!.nodes[i].box, where).toBeLessThan(plain!.nodes[i].box * 0.9);
        expect(forced!.nodes[i].fits, where).toBe(false);
      }
      await p.context().close();
    }
  });

  it('[M.37] --chart-font-size sets Chart.js\'s font size (ticks, legend, title, tooltip) and --mm-font-size Mermaid\'s (keeping its default theme when no colour token is set, with the --mm-* colours otherwise); without them Chart.js\'s 12 and Mermaid\'s 16 as before; a chart\'s own size wins; the preview frame the same', async () => {
    const own = md.render('{{chart\ntype: bar\nlabels: A, B\nseries: S = 1, 2\n}}\n').replace(/data-chart="([^"]*)"/, (_m, json: string) => {
      const g = JSON.parse(json.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
      g.options = { scales: { x: { ticks: { font: { size: 9 } } } } };
      return `data-chart="${JSON.stringify(g).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;
    });
    const CHART = '{{chart\ntype: bar\nlabels: A, B\nseries: S = 1, 2\n}}\n';
    const body = `<article class="markdown-body" id="doc">
      <div id="big" style="--chart-font-size: 18px; --mm-font-size: 24px">${md.render(CHART)}${md.render(FLOW)}</div>
      <div id="num" style="--chart-font-size: 20; --mm-font-size: 22; --mm-node: #e0f0e0; --mm-border: #208020">${md.render(CHART)}${md.render(FLOW)}</div>
      <div id="own" style="--chart-font-size: 18px">${own}</div>
      <div id="plain">${md.render(CHART)}${md.render(FLOW)}</div></article>`;
    const facts = (p: Page) => p.evaluate(`['big', 'num', 'own', 'plain'].map(function (id) {
      var c = Chart.getChart(document.querySelector('#' + id + ' canvas.orz-chart'));
      var o = c.options;
      var label = document.querySelector('#' + id + ' .mermaid svg .nodeLabel, #' + id + ' .mermaid svg g.node text');
      var rect = document.querySelector('#' + id + ' .mermaid svg .node rect');
      return [o.scales.x.ticks.font.size, o.scales.y.ticks.font.size, o.plugins.legend.labels.font.size, o.plugins.title.font.size, o.plugins.tooltip.bodyFont.size,
        label ? getComputedStyle(label).fontSize : null, rect ? getComputedStyle(rect).fill : null];
    })`);
    const results: unknown[] = [];
    for (const frame of [false, true]) {
      const p = await open(body, { frame });
      if (frame) {
        await p.waitForFunction(`typeof window.Chart === 'function' && window.mermaid && typeof window.mermaid.run === 'function' && typeof window.__orzEnhance === 'function'`);
        await p.evaluate('window.__orzEnhance()');
        await p.waitForFunction(`document.querySelectorAll('#doc .mermaid svg g.node').length === 6`, null, { timeout: 10_000 });
      } else await enhance(p, '#doc');
      results.push(await facts(p));
      await p.context().close();
    }
    expect(results[0]).toEqual([
      [18, 18, 18, 18, 18, '24px', 'rgb(236, 236, 255)'],
      [20, 20, 20, 20, 20, '22px', 'rgb(224, 240, 224)'],
      [9, 18, 18, 18, 18, null, null],
      [12, 12, 12, 12, 12, '16px', 'rgb(236, 236, 255)'],
    ]);
    expect(results[1]).toEqual(results[0]);
  });

  it('[M.38] --mm-gantt-axis-format sets a gantt chart\'s date axis (Mermaid\'s gantt.axisFormat, a d3 time format, quoted or not); without it Mermaid\'s %Y-%m-%d; the chart\'s own axisFormat wins; the preview frame the same', async () => {
    const GANTT = '{{mermaid\ngantt\n  dateFormat YYYY-MM-DD\n  section A\n  Task one :a1, 2026-01-01, 10d\n  Task two :after a1, 5d\n}}\n';
    const OWN = '{{mermaid\ngantt\n  dateFormat YYYY-MM-DD\n  axisFormat %d/%m\n  section A\n  Task one :a1, 2026-01-01, 10d\n}}\n';
    const body = `<article class="markdown-body" id="doc">
      <div id="short" style="--mm-gantt-axis-format: '%b %-d'">${md.render(GANTT)}</div>
      <div id="bare" style="--mm-gantt-axis-format: %b %-d; --mm-node: #e0f0e0">${md.render(GANTT)}</div>
      <div id="own" style="--mm-gantt-axis-format: '%b %-d'">${md.render(OWN)}</div>
      <div id="plain">${md.render(GANTT)}</div></article>`;
    const facts = (p: Page) => p.evaluate(`['short', 'bare', 'own', 'plain'].map(function (id) {
      var t = document.querySelector('#' + id + ' .mermaid svg .tick text');
      return t ? t.textContent : null;
    })`);
    const results: unknown[] = [];
    for (const frame of [false, true]) {
      const p = await open(body, { frame });
      if (frame) {
        await p.waitForFunction(`window.mermaid && typeof window.mermaid.run === 'function' && typeof window.__orzEnhance === 'function'`);
        await p.evaluate('window.__orzEnhance()');
      } else await enhance(p, '#doc');
      await p.waitForFunction(`document.querySelectorAll('#doc .mermaid svg .tick text').length > 3`, null, { timeout: 10_000 });
      results.push(await facts(p));
      await p.context().close();
    }
    const r = results[0] as string[];
    expect(r[0]).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    expect(r[1]).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    expect(r[2]).toMatch(/^\d{2}\/\d{2}$/);
    expect(r[3]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(results[1]).toEqual(results[0]);
  });

  it('[M.39] past the palette\'s end a chart never repeats a colour: series (or slices) n+1 … are tints and shades of the palette, each as far (CIE76 ΔE) from every colour before it as one can be — a 10-slice pie on a six-colour theme has ten colours ΔE ≥ 10 apart (2.3.0/2.4.0 wrapped: A = G … D = J); the preview frame the same', async () => {
    const PIE = '{{chart\ntype: pie\nlabels: A, B, C, D, E, F, G, H, I, J\nseries: s = 1, 2, 3, 4, 5, 6, 7, 8, 9, 10\n}}\n';
    const css = '#t { --chart-text: #2c3e50; --chart-surface: #f8fafb; --chart-1: #2c3e50; --chart-2: #b83a26; --chart-3: #4f86b5; --chart-4: #8796a3; --chart-5: #c08a2b; --chart-6: #3f7f5f; }';
    const body = `<article class="markdown-body" id="t">${md.render(PIE)}</article>`;
    const lab = (rgb: number[]): number[] => {
      const lin = (c: number): number => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
      const [r, g, b] = rgb.map(lin);
      const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
      const X = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047), Y = f(r * 0.2126 + g * 0.7152 + b * 0.0722), Z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
      return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
    };
    const rgb = (c: string): number[] => { const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(c); return m ? [1, 2, 3].map((k) => parseInt(m[k], 16)) : (/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(c) ?? []).slice(1, 4).map(Number); };
    const results: string[][] = [];
    for (const frame of [false, true]) {
      const p = await open(body, { css, frame });
      if (frame) {
        await p.waitForFunction(`typeof window.Chart === 'function' && typeof window.__orzEnhance === 'function'`);
        await p.evaluate('window.__orzEnhance()');
      } else await enhance(p, '#t');
      await p.waitForFunction(`!!Chart.getChart(document.querySelector('#t canvas.orz-chart'))`, null, { timeout: 10_000 });
      results.push(await p.evaluate(`Chart.getChart(document.querySelector('#t canvas.orz-chart')).config.data.datasets[0].backgroundColor`) as string[]);
      await p.context().close();
    }
    const c = results[0];
    expect(c).toHaveLength(10);
    expect(c.slice(0, 6)).toEqual(['#2c3e50', '#b83a26', '#4f86b5', '#8796a3', '#c08a2b', '#3f7f5f']);
    const close: string[] = [];
    for (let a = 0; a < 10; a++) for (let b = a + 1; b < 10; b++) {
      const p = lab(rgb(c[a])), q = lab(rgb(c[b]));
      const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      if (d < 10) close.push(`${a + 1} ~ ${b + 1} (${d.toFixed(1)})`);
    }
    expect(close).toEqual([]);
    expect(results[1]).toEqual(results[0]);
  });

  it('[M.40] --mm-gantt-axis-format: auto picks a gantt chart\'s axis by its span (days and months up to four months, month and year up to three years, years beyond) and its tick interval by its width, so labels never overprint; with --mm-font-size the gantt\'s text is that size (Mermaid\'s 10–11 before); --mm-gantt-today: off draws no today line; the chart\'s own axisFormat wins', async () => {
    const G = (b: string): string => md.render(`{{mermaid\ngantt\n  dateFormat YYYY-MM-DD\n${b}\n}}\n`);
    const SEM = G('  section Lectures\n  Part 1 :p1, 2026-08-24, 35d\n  Part 2 :p2, after p1, 40d\n  section Labs\n  Lab A :2026-09-01, 30d\n  Lab B :2026-10-05, 45d');
    const YRS = G('  section Aims\n  Aim 1 :a1, 2026-01-01, 400d\n  Aim 2 :a2, after a1, 300d\n  Aim 3 :2026-06-01, 600d');
    const OWN = G('  axisFormat %d/%m\n  section A\n  Task one :a1, 2026-01-01, 60d');
    const body = `<article class="markdown-body" id="doc" style="--mm-gantt-axis-format: auto; --mm-gantt-today: off; --mm-font-size: 18">
      <div id="sem" style="width: 480px">${SEM}</div><div id="yrs" style="width: 480px">${YRS}</div><div id="own" style="width: 480px">${OWN}</div>
      <div id="plain" style="--mm-gantt-axis-format: initial; --mm-gantt-today: initial; width: 480px">${SEM}</div></article>`;
    const p = await open(body);
    await enhance(p, '#doc');
    await p.waitForFunction(`document.querySelectorAll('#doc .mermaid svg .tick text').length > 8`, null, { timeout: 15_000 });
    const facts = await p.evaluate(`['sem', 'yrs', 'own', 'plain'].map(function (id) {
      var svg = document.querySelector('#' + id + ' .mermaid svg');
      var t = Array.prototype.slice.call(svg.querySelectorAll('.tick text'));
      var r = t.map(function (x) { return x.getBoundingClientRect(); }).filter(function (x) { return x.width > 0; }).sort(function (a, b) { return a.left - b.left; });
      var over = 0; for (var i = 1; i < r.length; i++) if (r[i].left < r[i - 1].right - 1) over++;
      var today = Array.prototype.slice.call(svg.querySelectorAll('.today')).filter(function (x) { return getComputedStyle(x).display !== 'none'; }).length;
      return { labels: t.map(function (x) { return x.textContent; }), over: over, size: t.length ? parseFloat(getComputedStyle(t[0]).fontSize) : 0, today: today };
    })`) as Array<{ labels: string[]; over: number; size: number; today: number }>;
    await p.context().close();
    const [sem, yrs, own, plain] = facts;
    expect(sem.over).toBe(0);
    expect(sem.labels[0]).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    expect(sem.size).toBe(18);
    expect(sem.today).toBe(0);
    expect(yrs.over).toBe(0);
    expect(yrs.labels.join(' ')).toMatch(/^[A-Z][a-z]{2} 20\d\d/);
    expect(own.labels[0]).toMatch(/^\d{2}\/\d{2}$/);
    expect(plain.labels[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

void PREVIEW_CDN;
