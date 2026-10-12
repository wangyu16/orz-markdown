/**
 * Test helpers for light-playful-1's ruled notebook on screen (claim M.31):
 * a rich sample, the two ways an article is shown — in a page enhanced by
 * `enhanceDocument` (as orz-mdhtml's read view does) and in the preview frame
 * document enhanced by `__orzEnhance` (as the editor's preview does) — and a
 * report of where every written line and every sheet sits against the
 * ruling. Real Chrome (playwright-core); everything is served from this
 * checkout on a fake origin: the themes, KaTeX's stylesheet and fonts, and
 * `orz-markdown/preview-frame` bundled with esbuild. The theme's Google Fonts
 * load from the network when it is there (the grid re-aligns when they
 * arrive) and fall back to the system's otherwise; the other content
 * libraries are not needed by the sample and are refused.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, Route } from 'playwright-core';
import md from '../../src/index.js';
import { PREVIEW_CDN } from '../../src/preview-frame.js';
import { previewFrameDocument } from '../../src/carrier/editor/preview.js';

export const ORIGIN = 'https://orz-notebook.test';
const ROOT = process.cwd();
const KATEX_DIST = join(ROOT, 'node_modules/katex/dist');

const para = (n: number, words: string): string => Array.from({ length: n }, (_, i) => `${words} (${i + 1})`).join(' ');
const PICTURE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='120' viewBox='0 0 320 120'%3E%3Crect width='320' height='120' fill='%23cfe7fc'/%3E%3Cpath d='M0 95 L70 45 L130 80 L200 30 L320 90 V120 H0Z' fill='%233d6e17' fill-opacity='.55'/%3E%3Ccircle cx='260' cy='30' r='14' fill='%23fff1a1'/%3E%3C/svg%3E";

/** Every heading level, paragraphs, lists, inline math and code, display math of one to three lines, a quote, a table, code, a callout, a figure, a picture, columns, tabs, a spoiler, a TOC, a rule and footnotes. */
export const NOTEBOOK_SAMPLE = `# A Notebook Page

${para(3, 'Running text sits on the ruled lines of the page, one line of writing per rule, with **bold**, *italic*, a [link](https://markdown.orz.how), `code`, ==marked== words and a note.[^1]')}

{{toc}}

## A list between paragraphs

- The first item of a list sits on a rule
- The second item, long enough to wrap onto a second line so that the wrapped line also has to land exactly on the next rule of the page
  - a nested item with $x^2$
  - another nested item
- [ ] a task item
- [x] a done task

${para(3, 'After the list the text continues on the lines, with H~2~O and x^2^ written inline.')}

| Column | Value | Note |
|:--|--:|:--|
| alpha | 1 | a table is a sheet pasted on the page |
| beta | 2 | on its own paper |
| gamma | 3 | and the text after it is back on the lines |

${para(2, 'After the table the writing returns to the rules.')}

::: info
**A callout.** A sticky note on the page: its own paper, taped on.
:::

${para(3, 'After the callout the next paragraph is on the lines again.')}

:::: cols
::: col
${para(3, 'Left column text.')}
:::
::: col
${para(2, 'Right column text.')}
:::
::::

### Code and math

\`\`\`js
function area(r) {
  return Math.PI * r ** 2;
}
\`\`\`

${para(3, 'Inline math $a^2 + b^2 = c^2$ and a tall one $\\frac{1}{1+\\frac{1}{x}}$ stay on the line.')}

$$E = mc^2$$

${para(2, 'A fraction is taller than a line.')}

$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$

${para(2, 'A tall formula spans several lines.')}

$$\\sum_{k=1}^{n} \\frac{1}{k^2} = \\cfrac{\\pi^2}{6 + \\cfrac{1}{1 + \\cfrac{1}{2}}}$$

${para(3, 'After the display formulas the text is back on the lines.')}

> A quotation is a slip of paper clipped onto the page, written in the theme's hand and slightly tilted. It runs over two lines of the slip.

${para(2, 'After the quote the text goes on.')}

<figure><img src="${PICTURE}" alt="Hills under a sun" width="320" height="120"><figcaption>A figure is a picture pasted in, with its caption.</figcaption></figure>

${para(2, 'After the figure the text is on the lines.')}

![A picture on its own](picture.svg =240x90)

:::: tabs
::: tab First
${para(2, 'The first tab.')}
:::
::: tab Second
${para(4, 'The second tab is longer.')}
:::
::::

::: spoil A spoiler
${para(2, 'Hidden text.')}
:::

1. A numbered list
2. With a second item
3. And a third one

---

#### A fourth-level heading

${para(2, 'Text under a small heading.')}

##### A fifth-level heading

${para(2, 'More text.')}

###### A sixth-level heading

${para(4, 'The last paragraph keeps to the lines.')}

[^1]: A footnote at the end, written on the lines too.
`;

/** The sample rendered by the parser. */
export const renderSample = (text = NOTEBOOK_SAMPLE): string => md.render(text);

let bundle: string | null = null;
/** `orz-markdown/preview-frame` as a browser script (`window.OrzPF`). */
export async function previewFrameBundle(): Promise<string> {
  if (bundle) return bundle;
  const esbuild = await import('esbuild');
  const out = await esbuild.build({ entryPoints: [join(ROOT, 'src/preview-frame.ts')], bundle: true, format: 'iife', globalName: 'OrzPF', write: false, platform: 'browser', logLevel: 'silent' });
  bundle = out.outputFiles[0].text;
  return bundle;
}

const KATEX_CDN_DIR = PREVIEW_CDN.katexCss.replace(/katex\.min\.css$/, '');

/** Serve the checkout's themes and KaTeX, the page bundle, and the given HTML documents on {@link ORIGIN}; refuse the content libraries. */
export async function serve(page: Page, docs: Record<string, string>): Promise<void> {
  const js = await previewFrameBundle();
  // a function handed to page.evaluate under tsx (keepNames) calls __name
  await page.addInitScript('globalThis.__name = globalThis.__name || function (f) { return f; };');
  await page.route('**/*', async (route: Route) => {
    const url = route.request().url();
    const send = (body: string | Buffer, type: string) => route.fulfill({ status: 200, contentType: type, body });
    if (url.startsWith(ORIGIN + '/')) {
      const path = url.slice(ORIGIN.length).split('?')[0];
      if (docs[path] !== undefined) return send(docs[path], 'text/html');
      if (path === '/preview-frame.js') return send(js, 'text/javascript');
      if (path === '/picture.svg') return send(decodeURIComponent(PICTURE.slice('data:image/svg+xml,'.length)), 'image/svg+xml');
      const theme = /^\/themes\/([\w-]+\.css)$/.exec(path);
      if (theme) return send(readFileSync(join(ROOT, 'themes', theme[1])), 'text/css');
      return route.fulfill({ status: 404, body: '' });
    }
    if (url === PREVIEW_CDN.katexCss) return send(readFileSync(join(KATEX_DIST, 'katex.min.css')), 'text/css');
    if (url.startsWith(KATEX_CDN_DIR + 'fonts/')) {
      const f = url.slice(KATEX_CDN_DIR.length).split('?')[0];
      return send(readFileSync(join(KATEX_DIST, f)), f.endsWith('.woff2') ? 'font/woff2' : f.endsWith('.woff') ? 'font/woff' : 'font/ttf');
    }
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) return route.continue().catch(() => route.abort());
    return route.abort();
  });
}

/** A page as orz-mdhtml's read view shows a document: the theme linked, the article rendered in the page, `enhanceDocument` run on it. */
export function inPageDocument(theme: string, html: string, o: { zoom?: number } = {}): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link id="orz-theme" rel="stylesheet" href="${ORIGIN}/themes/${theme}.css">
<script src="${ORIGIN}/preview-frame.js"></script>
</head><body><main id="orz-view"><article id="orz-doc" class="markdown-body"${o.zoom ? ` style="zoom:${o.zoom}"` : ''}>${html}</article></main>
<script>window.__enhanced = OrzPF.enhanceDocument(document.getElementById('orz-doc'), { scheme: 'light' });</script>
</body></html>`;
}

/** The editor's preview frame document (the kit's own, with its bridge and libraries), the theme linked; the test renders into it as the bridge does and calls `__orzEnhance`. */
export function frameDocument(theme: string): string {
  return previewFrameDocument({ head: `<link rel="stylesheet" href="${ORIGIN}/themes/${theme}.css">` });
}

/** Wait for the fonts and a few frames (the grid re-aligns once per frame when the article's size changes). */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 8000))]);
    for (let i = 0; i < 6; i++) await frame();
    await new Promise((r) => setTimeout(r, 150));
    for (let i = 0; i < 4; i++) await frame();
  });
}

export interface NotebookLine { d: number; text: string }
export interface NotebookSheet { what: string; top: number; bottom: number; opaque: boolean; atTop: boolean }
export interface NotebookReport {
  grid: number;
  ruleAt: number;
  zoom: number;
  attribute: string | null;
  stats: unknown;
  lines: NotebookLine[];
  offGrid: string[];
  transparent: string[];
  sheets: NotebookSheet[];
  kinds: string[];
}

/** Where every written line and every sheet of the article sits against its ruling (content-box coordinates, CSS px of the page). */
export async function notebookReport(page: Page, selector = '.markdown-body'): Promise<NotebookReport> {
  return page.evaluate((sel) => {
    const root = document.querySelector<HTMLElement>(sel)!;
    const rs = getComputedStyle(root);
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;height:var(--orz-grid);width:0';
    root.appendChild(probe);
    const grid = probe.getBoundingClientRect().height;
    const zoom = grid / (parseFloat(getComputedStyle(probe).height) || 1);
    probe.remove();
    const ruleAt = parseFloat(rs.getPropertyValue('--orz-rule-at')) * zoom;
    const rr = root.getBoundingClientRect();
    const top0 = rr.top + (parseFloat(rs.borderTopWidth) + parseFloat(rs.paddingTop)) * zoom;
    const opaque = (bg: string): boolean => /^rgb\(/.test(bg) || /^rgba\([^)]*,\s*1\)$/.test(bg);
    const clear = (bg: string): boolean => bg === 'transparent' || /^rgba\([^)]*,\s*0\)$/.test(bg);
    const untransformed = (el: HTMLElement): DOMRect => {
      const cs = getComputedStyle(el);
      const dy = cs.position === 'relative' ? (parseFloat(cs.top) || 0) * zoom : 0;
      const t = el.style.getPropertyValue('transform');
      const p = el.style.getPropertyPriority('transform');
      el.style.setProperty('transform', 'none', 'important');
      const r = el.getBoundingClientRect();
      if (t) el.style.setProperty('transform', t, p); else el.style.removeProperty('transform');
      return new DOMRect(r.x, r.y - dy, r.width, r.height);
    };
    const mark = (): HTMLElement => {
      const m = document.createElement('span');
      m.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      return m;
    };
    const lines: Array<{ d: number; text: string }> = [];
    const offGrid: string[] = [];
    const transparent: string[] = [];
    const sheets: Array<{ what: string; top: number; bottom: number; opaque: boolean; atTop: boolean }> = [];
    const kinds: string[] = [];
    const descent = new Map<Element, number>();
    const descentOf = (host: HTMLElement): number => {
      if (!descent.has(host)) {
        const pr = document.createElement('span');
        pr.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;visibility:hidden';
        const m = mark();
        const x = document.createTextNode('x');
        pr.append(m, x);
        host.appendChild(pr);
        const g = document.createRange();
        g.selectNodeContents(x);
        descent.set(host, g.getBoundingClientRect().bottom - m.getBoundingClientRect().bottom);
        pr.remove();
      }
      return descent.get(host)!;
    };
    const sample = (el: HTMLElement): void => {
      let last = -Infinity;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
        const host = t.parentElement!;
        if (host.closest('code, pre, .katex, sup, sub, svg, .footnote-backref, a.footnote-ref')) continue;
        for (let i = 0; i < t.length; i++) {
          if (!/\S/.test(t.data[i])) continue;
          const range = document.createRange();
          range.setStart(t, i);
          range.setEnd(t, i + 1);
          const rect = range.getClientRects()[0];
          if (!rect || rect.top <= last + grid / 2) continue;
          last = rect.top;
          const baseline = rect.bottom - descentOf(host) - top0;
          const k = Math.round((baseline - ruleAt) / grid);
          lines.push({ d: ruleAt + k * grid - baseline, text: `${el.tagName}: ${t.data.slice(i, i + 24)}` });
        }
      }
    };
    const blocks = (Array.from(root.children) as HTMLElement[]).filter((el) => {
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.position !== 'absolute' && cs.float === 'none';
    });
    for (const el of blocks) {
      const cs = getComputedStyle(el);
      const isMath = el.tagName === 'P' && !!el.querySelector('.katex-display');
      const isPicture = el.classList.contains('orz-picture');
      const lined = (/^(P|UL|OL|DL|H[1-6]|HR)$/.test(el.tagName) && !isPicture) || (el.tagName === 'SECTION' && el.classList.contains('footnotes')) || el.matches('div.center, div.right');
      if (el.classList.contains('orz-off-grid')) { offGrid.push(`${el.tagName}: ${(el.textContent || '').slice(0, 30)}`); continue; }
      if (!lined) {
        for (const s of el.classList.contains('cols') ? Array.from(el.children) as HTMLElement[] : [el]) {
          const r = untransformed(s);
          sheets.push({ what: `${s.tagName}.${s.className}`, top: r.top - top0, bottom: r.bottom - top0, opaque: opaque(getComputedStyle(s).backgroundColor), atTop: Math.abs(r.top - top0) <= 1 });
          kinds.push(`sheet:${s.tagName}${s.className ? '.' + s.className.split(' ')[0] : ''}`);
        }
        continue;
      }
      kinds.push(isMath ? 'math' : el.tagName);
      if (!clear(cs.backgroundColor)) transparent.push(`${el.tagName}.${el.className} ${cs.backgroundColor}`);
      if (cs.backgroundImage !== 'none' && el.tagName !== 'HR') transparent.push(`${el.tagName} image ${cs.backgroundImage.slice(0, 40)}`);
      if (isMath) {
        const html = el.querySelector<HTMLElement>('.katex-display > .katex > .katex-html')!;
        const m = mark();
        html.insertBefore(m, html.firstChild);
        const baseline = m.getBoundingClientRect().bottom - top0;
        m.remove();
        const k = Math.round((baseline - ruleAt) / grid);
        lines.push({ d: ruleAt + k * grid - baseline, text: `math: ${(el.textContent || '').slice(0, 20)}` });
        continue;
      }
      if (el.tagName !== 'HR') sample(el);
    }
    const g = (window as unknown as { OrzBaselineGrid?: { stats(r: Element): unknown } }).OrzBaselineGrid;
    return { grid, ruleAt, zoom, attribute: root.getAttribute('data-orz-grid'), stats: g ? g.stats(root) : null, lines, offGrid, transparent, sheets, kinds };
  }, selector);
}

/** The offset of `y` from its nearest rule. */
export const fromRule = (y: number, r: { grid: number; ruleAt: number }): number => y - (r.ruleAt + Math.round((y - r.ruleAt) / r.grid) * r.grid);
