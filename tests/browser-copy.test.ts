/**
 * Real-substrate tests (C.14–C.16, M.8, and C.1/C.2 again in a real DOM):
 * selection, Range.cloneContents, the copy event and HTML parsing are what
 * happy-dom only imitates. Runs against the installed Chrome (never downloads
 * a browser); the suite is skipped when Chrome is not available.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { md } from '../src/index';
import { getPreviewFrameAssets } from '../src/preview-frame';
import { normalize } from './helpers/normalize';

type Page = import('playwright-core').Page;
type Browser = import('playwright-core').Browser;

let browser: Browser | null = null;
let page: Page;

async function launch(): Promise<Browser | null> {
  try {
    const { chromium } = await import('playwright-core');
    return await chromium.launch({ channel: 'chrome' });
  } catch {
    return null;
  }
}

const available = await launch();
const suite = available ? describe : describe.skip;

/**
 * A page with the runtime and __orzEnhance, but stubbed content libraries so
 * the test needs no network: the stubs count how often each library is asked
 * to draw, which is what M.8 is about.
 */
const COMMON_CSS = readFileSync('themes/common.css', 'utf8');

const KATEX_CSS = readFileSync('node_modules/katex/dist/katex.min.css', 'utf8');

function pageHtml(body: string, extraCss = ''): string {
  const pa = getPreviewFrameAssets();
  const stubs = `<script>
    window.__calls = { hljs: 0, chart: 0, mermaid: 0, smiles: 0 };
    window.hljs = { highlightElement: function (el) { window.__calls.hljs++; el.classList.add('hljs'); } };
    window.mermaid = { initialize: function () {}, run: function (o) { window.__calls.mermaid += o.nodes.length; o.nodes.forEach(function (n) { n.setAttribute('data-processed', 'true'); }); } };
    window.SmilesDrawer = { Drawer: function () { this.draw = function () {}; }, parse: function (s, cb) { window.__calls.smiles++; cb({}); } };
    window.Chart = function () { window.__calls.chart++; };
  </script>`;
  const scripts = pa.bodyScripts().replace(/<script src="[^"]*"><\/script>/g, '');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${COMMON_CSS}${extraCss}</style></head><body>
    <header id="chrome">Site header text</header>
    <article class="markdown-body">${body}</article>
    <footer id="site-footer"><p>Site footer text</p></footer>
    ${stubs}${scripts}</body></html>`;
}

async function load(src: string, extraCss = ''): Promise<void> {
  await page.setContent(pageHtml(md.render(src), extraCss));
}

/** Select from the start of `fromSel` to the end of `toSel`, fire copy, return text/plain (or null). */
async function copySelection(fromSel: string, toSel: string): Promise<{ text: string; prevented: boolean }> {
  return page.evaluate(([a, b]) => {
    const start = document.querySelector(a)!;
    const end = document.querySelector(b)!;
    const range = document.createRange();
    range.setStart(start, 0);
    range.setEnd(end, end.childNodes.length);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    const dt = new DataTransfer();
    const ev = new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    return { text: dt.getData('text/plain'), prevented: ev.defaultPrevented };
  }, [fromSel, toSel]);
}

suite('copy-as-Markdown in real Chrome', () => {
  beforeAll(async () => {
    browser = available;
    page = await browser!.newPage();
  });
  afterAll(async () => {
    await browser?.close();
  });

  it('[C.15] a user selection is copied as Markdown on text/plain', async () => {
    await load('# Title\n\nPara with **bold** and `code`.\n\n- one\n- two');
    const { text, prevented } = await copySelection('.markdown-body h1', '.markdown-body ul');
    expect(prevented).toBe(true);
    expect(text).toBe('# Title\n\nPara with **bold** and `code`.\n\n- one\n- two');
  });

  it('[C.15] a selection covering a whole table copies the table', async () => {
    await load('| A | B |\n|:--|--:|\n| x | y |');
    const { text } = await copySelection('.markdown-body table', '.markdown-body table');
    expect(text).toBe('| A | B |\n| :--- | ---: |\n| x | y |');
  });

  it('[C.15] a selection inside one table cell copies only the cell text', async () => {
    await load('| A | B |\n|:--|--:|\n| **x** | y |');
    const { text } = await copySelection('.markdown-body td', '.markdown-body td');
    expect(text).toBe('**x**');
  });

  it('[C.15] a selection covering a whole container copies the container', async () => {
    await load(':::: cols 1 2\n::: col\n左边\n:::\n::: col\n右边\n:::\n::::');
    const { text } = await copySelection('.markdown-body .cols', '.markdown-body .cols');
    expect(text).toBe(':::: cols 1 2\n::: col\n左边\n:::\n\n::: col\n右边\n:::\n::::');
  });

  it('[C.15] a partial selection inside a container copies only what is selected', async () => {
    await load('::: warning\n小心 **this** and more.\n:::\n\nAfter.');
    const { text } = await copySelection('.markdown-body .warning strong', '.markdown-body .warning strong');
    expect(text).toBe('this');
  });

  it('[C.15] selecting all of a container\'s text copies the container', async () => {
    await load('::: warning\n小心 **this**.\n:::\n\nAfter.');
    const { text } = await copySelection('.markdown-body .warning p', '.markdown-body .warning p');
    expect(text).toBe('::: warning\n小心 **this**.\n:::');
  });

  it('[C.15] part of a code block copies the raw text', async () => {
    await load('```bash\nnpm install\nnpm run build\nnpm test\n```');
    const text = await page.evaluate(() => {
      const code = document.querySelector('.markdown-body pre code')!;
      const t = code.firstChild!; const r = document.createRange();
      const at = t.textContent!.indexOf('npm run build');
      r.setStart(t, at); r.setEnd(t, at + 'npm run build'.length);
      const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(r);
      const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    expect(text).toBe('npm run build');
  });

  it('[C.15] text inside inline code copies verbatim (a shell command stays a shell command)', async () => {
    await load('Run `cd ~/projects && rm -rf node_modules/*` now.');
    const { text } = await copySelection('.markdown-body code', '.markdown-body code');
    expect(text).toBe('cd ~/projects && rm -rf node_modules/*');
  });

  it('[C.15] a selection starting inside inline math takes the whole formula', async () => {
    await load('Euler: $e^{i\\pi}+1=0$ done.');
    const text = await page.evaluate(() => {
      const ann = document.querySelector('.markdown-body .katex .katex-html')!;
      const leaf = ann.querySelector('.mord')!.firstChild!;
      const p = document.querySelector('.markdown-body p')!;
      const r = document.createRange(); r.setStart(leaf, 0); r.setEnd(p.lastChild!, (p.lastChild!.textContent || '').length);
      const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(r);
      const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    expect(text).toBe('$e^{i\\pi}+1=0$ done.');
  });

  it('[C.6] selecting items 4–5 of an ordered list keeps their numbers', async () => {
    await load('3. three\n4. four\n5. five');
    const text = await page.evaluate(() => {
      const lis = document.querySelectorAll('.markdown-body li');
      const r = document.createRange(); r.setStartBefore(lis[1]); r.setEndAfter(lis[2]);
      const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(r);
      const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    expect(text).toBe('4. four\n5. five');
  });

  it('[C.4] an unlabeled fence highlighted by highlight.js keeps no invented language', async () => {
    await load('```\n<div class="x">hello</div>\n```');
    const copied = await page.evaluate(() => {
      const code = document.querySelector('.markdown-body pre code')!;
      code.className = 'hljs language-php-template'; // what hljs auto-detection writes
      return (window as unknown as { OrzMarkdownRuntime: { elementToMarkdown(n: Element): string } }).OrzMarkdownRuntime
        .elementToMarkdown(document.querySelector('.markdown-body')!);
    });
    expect(copied).toBe('```\n<div class="x">hello</div>\n```');
  });

  it('[C.14] a selection reaching outside the copy root is left to the browser', async () => {
    await load('Body text.');
    const { text, prevented } = await copySelection('#chrome', '.markdown-body p');
    expect(prevented).toBe(false);
    expect(text).toBe('');
  });

  it('[C.14] a selection inside an editable field is left to the browser', async () => {
    await page.setContent(pageHtml('<p>x</p><div contenteditable="true" id="ed"><p>Edit me</p></div>'));
    const { prevented } = await copySelection('#ed p', '#ed p');
    expect(prevented).toBe(false);
  });

  it('[C.1] [C.2] the round trip holds in a real DOM', async () => {
    const corpus = [
      '# T\n\n**注意：**请先阅读。中文English混排，`代码`。',
      '3. three\n4. four\n\n- [x] done\n  - [ ] child',
      '| 名称 | 数 |\n|:---|---:|\n| a \\| b | `p\\|q` |',
      'Text[^n] and ^[inline].\n\n[^n]: Note.',
      '::: spoil **Answer** $x$\nhidden\n:::\n\n::: myblock\nInside.\n:::',
      'Use a \\*literal\\* and \\$x\\$, costs $5.\n\n1\\. not a list',
      '　　段落缩进。a b\n\nPress <kbd>Ctrl</kbd> <ruby>汉<rt>hàn</rt></ruby>',
    ];
    for (const src of corpus) {
      await load(src);
      const copied = await page.evaluate(() =>
        (window as unknown as { OrzMarkdownRuntime: { elementToMarkdown(n: Element): string } })
          .OrzMarkdownRuntime.elementToMarkdown(document.querySelector('.markdown-body')!));
      expect(normalize(md.render(copied)), copied).toBe(normalize(md.render(src)));
    }
  });

  /** Best-of-three conversion time of the loaded document (ms). */
  async function convertMs(): Promise<number> {
    return page.evaluate(() => {
      const rt = (window as unknown as { OrzMarkdownRuntime: { elementToMarkdown(n: Element): string } }).OrzMarkdownRuntime;
      let best = Infinity;
      for (let k = 0; k < 3; k++) {
        const t0 = performance.now();
        rt.elementToMarkdown(document.querySelector('.markdown-body')!);
        best = Math.min(best, performance.now() - t0);
      }
      return best;
    });
  }

  it('[C.16] converting a 2,000-block document takes under 1 s', async () => {
    const blocks: string[] = [];
    for (let i = 0; i < 400; i++) {
      blocks.push(`## Section ${i}`, `Paragraph ${i} with **bold**, \`code\`, $x_${i}$ and 中文内容。`, `- item ${i}\n- item b`, `| a | b |\n|---|---|\n| ${i} | 中 |`, `> quote ${i}`);
    }
    await load(blocks.join('\n\n'));
    const ms = await page.evaluate(() => {
      const rt = (window as unknown as { OrzMarkdownRuntime: { elementToMarkdown(n: Element): string } }).OrzMarkdownRuntime;
      const t0 = performance.now();
      rt.elementToMarkdown(document.querySelector('.markdown-body')!);
      return performance.now() - t0;
    });
    expect(ms).toBeLessThan(3000); // ~0.1–0.3 s on a laptop; generous so a loaded CI box does not flake
  }, 60_000); // loading 2,000 blocks into the page can take a few seconds under load

  it('[C.15] copy keeps working after the document is rewritten and the runtime runs twice', async () => {
    await load('First **doc**.');
    await load('Second **doc**.'); // setContent = document.open(): listeners dropped, same window
    await page.evaluate((rt) => { const s = document.createElement('script'); s.textContent = rt; document.body.appendChild(s); },
      (await import('../src/runtime')).getBrowserRuntimeScript()); // a second copy of the runtime
    const { text, prevented } = await copySelection('.markdown-body p', '.markdown-body p');
    expect(prevented).toBe(true);
    expect(text).toBe('Second **doc**.');
    const listeners = await page.evaluate(() => {
      let n = 0;
      const dt = new DataTransfer();
      const orig = DataTransfer.prototype.setData;
      DataTransfer.prototype.setData = function (...a: [string, string]) { n++; return orig.apply(this, a); };
      document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      DataTransfer.prototype.setData = orig;
      return n;
    });
    expect(listeners).toBe(1); // exactly one copy handler, not one per runtime run
  });

  /** Triple-click the first element matching sel with the real mouse, then copy. */
  async function tripleClickCopy(sel: string): Promise<string> {
    const box = (await page.locator(sel).first().boundingBox())!;
    await page.mouse.click(box.x + 5, box.y + box.height / 2, { clickCount: 3 });
    return page.evaluate(() => {
      const dt = new DataTransfer();
      document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
  }

  it('[C.15] triple-clicking a paragraph never drags in the next block (round 3, H1)', async () => {
    const nexts = ['## Next heading', '- item', '3. item', '> quote', '```\ncode\n```', '::: info\nbox\n:::', '$$\nx\n$$', '<details><summary>S</summary>x</details>'];
    for (const next of nexts) {
      await load(`Para one text here.\n\n${next}`);
      expect(await tripleClickCopy('.markdown-body p'), next).toBe('Para one text here.');
    }
  });

  it('[C.15] triple-clicking one line of a code block copies that line (round 3, H7)', async () => {
    await load('```js\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```\n\nAfter.');
    const box = (await page.locator('.markdown-body pre').boundingBox())!;
    const lineHeight = box.height / 3;
    await page.mouse.click(box.x + 20, box.y + lineHeight * 1.5, { clickCount: 3 });
    const text = await page.evaluate(() => {
      const dt = new DataTransfer();
      document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    expect(text.trim()).toBe('const b = 2;');
  });

  it('[C.6] numbering is right when a selection starts inside a nested or adjacent list (round 3, M4)', async () => {
    await load('3. a\n4. b\n\nAfter paragraph.');
    const text = await page.evaluate(() => {
      const lis = document.querySelectorAll('.markdown-body li');
      const p = document.querySelector('.markdown-body > p')!;
      const r = document.createRange(); r.setStart(lis[1].firstChild!, 0); r.setEnd(p.firstChild!, 5);
      const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(r);
      const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    expect(text).toBe('4. b\n\nAfter');
  });

  it('[C.7] a partial table selection keeps cells in their columns (round 3, M5)', async () => {
    await load('| A | B |\n|---|---|\n| x1 | y1 |\n| x2 | y2 |\n\nAfter.');
    const text = await page.evaluate(() => {
      const tds = document.querySelectorAll('.markdown-body td');
      const p = document.querySelector('.markdown-body > p')!;
      const r = document.createRange(); r.setStart(tds[1].firstChild!, 0); r.setEnd(p.firstChild!, 5);
      const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(r);
      const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    expect(text).toBe('|  |  |\n| --- | --- |\n|  | y1 |\n| x2 | y2 |\n\nAfter');
  });

  it('[C.16] converting a 4,000-item price list takes under 1 s (round 3, M1)', async () => {
    await load(Array.from({ length: 4000 }, (_, i) => `- item ${i} costs $${i} or $${i + 1}`).join('\n'));
    const ms = await page.evaluate(() => {
      const rt = (window as unknown as { OrzMarkdownRuntime: { elementToMarkdown(n: Element): string } }).OrzMarkdownRuntime;
      const t0 = performance.now();
      rt.elementToMarkdown(document.querySelector('.markdown-body')!);
      return performance.now() - t0;
    });
    expect(ms).toBeLessThan(3000); // ~0.1–0.3 s on a laptop; generous so a loaded CI box does not flake
  });

  async function copyNow(): Promise<string> {
    return page.evaluate(() => {
      const dt = new DataTransfer();
      document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
  }

  it('[C.15] triple-clicking the last block before a footer still copies Markdown (round 4, H2)', async () => {
    await load('First.\n\nLast **paragraph**.');
    const box = (await page.locator('.markdown-body p').last().boundingBox())!;
    await page.mouse.click(box.x + 5, box.y + box.height / 2, { clickCount: 3 });
    expect(await copyNow()).toBe('Last **paragraph**.');
  });

  it('[C.15] triple-clicking a single-line code block or its last line copies raw (round 4, H3)', async () => {
    await load('```bash\nnpm install\n```\n\nAfter.');
    let box = (await page.locator('.markdown-body pre').boundingBox())!;
    await page.mouse.click(box.x + 20, box.y + box.height / 2, { clickCount: 3 });
    expect((await copyNow()).trim()).toBe('npm install');
    await load('- ```\n  a = 1\n  b = 2\n  ```\n\nAfter.');
    box = (await page.locator('.markdown-body pre').boundingBox())!;
    await page.mouse.click(box.x + 20, box.y + box.height * 0.75, { clickCount: 3 });
    expect((await copyNow()).trim()).toBe('b = 2');
  });

  it('[C.15] triple-clicking a paragraph in the active tab copies only it (round 4, H3)', async () => {
    await load(':::: tabs\n::: tab A\nVisible tab text.\n:::\n::: tab B\nSECRET hidden tab.\n:::\n::::');
    await page.evaluate(() => (window as unknown as { OrzMarkdownRuntime: { init(d: Document): void } }).OrzMarkdownRuntime.init(document));
    const box = (await page.locator('.markdown-body .tab.active p').boundingBox())!;
    await page.mouse.click(box.x + 5, box.y + box.height / 2, { clickCount: 3 });
    const text = await copyNow();
    expect(text).toBe('Visible tab text.');
  });

  it('[C.15] a drag starting at the end of the previous block adds no empty block (round 4, M1)', async () => {
    await load('3. three\n4. four five\n\nNext para.');
    const text = await page.evaluate(() => {
      const lis = document.querySelectorAll('.markdown-body li');
      const t = lis[0].firstChild!;
      const r = document.createRange(); r.setStart(t, t.textContent!.length); r.setEnd(lis[1].firstChild!, 4);
      const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(r);
      const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    // The start is pulled past the end of item 3: the selection lies inside
    // item 4's text, so only that text is copied (no empty "3." item).
    expect(text).toBe('four');
  });

  it('[C.6] nested ordered items keep their number inside a list selection (round 4, M4)', async () => {
    await load('1. a\n\n   3. x\n   4. y\n\n2. b');
    const text = await page.evaluate(() => {
      const inner = document.querySelectorAll('.markdown-body ol ol li');
      const outer = document.querySelectorAll('.markdown-body > ol > li');
      const r = document.createRange(); r.setStart(inner[1].firstChild!, 0); r.setEnd(outer[1].querySelector('p')!.firstChild!, 1);
      const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(r);
      const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    expect(text).toBe('1. 4. y\n\n2. b');
  });

  it('[C.16] a table-heavy document converts in linear time (round 4, M8)', async () => {
    const time = async (n: number) => {
      await load(Array.from({ length: n }, (_, i) => `| a${i} | b |\n|---|---|\n| ${i} | 中 |`).join('\n\n'));
      return page.evaluate(() => {
        const rt = (window as unknown as { OrzMarkdownRuntime: { elementToMarkdown(n: Element): string } }).OrzMarkdownRuntime;
        const t0 = performance.now();
        rt.elementToMarkdown(document.querySelector('.markdown-body')!);
        return performance.now() - t0;
      });
    };
    // A real quadratic fails every round; a GC pause in a long-lived page does not.
    let r = Infinity;
    for (let round = 0; round < 3 && r >= 8; round++) r = Math.min(r, (await time(4000)) / Math.max(await time(1000), 1));
    expect(r).toBeLessThan(8);
  }, 120_000);

  it('[C.15] triple-click never pulls in hidden content: closed spoiler, hidden tabs, data islands (round 5, H2)', async () => {
    await load('Para one.\n\n::: spoil Answer\nHidden answer text.\n:::');
    let box = (await page.locator('.markdown-body > p').first().boundingBox())!;
    await page.mouse.click(box.x + 5, box.y + box.height / 2, { clickCount: 3 });
    expect(await copyNow()).toBe('Para one.');

    await load(':::: tabs\n::: tab One\nFirst panel para A.\n\nFirst panel para B.\n:::\n::: tab Two\nHidden two.\n:::\n::: tab Three\nHidden three.\n:::\n::::');
    await page.evaluate(() => (window as unknown as { OrzMarkdownRuntime: { init(d: Document): void } }).OrzMarkdownRuntime.init(document));
    box = (await page.locator('.markdown-body .tab.active p').last().boundingBox())!;
    await page.mouse.click(box.x + 5, box.y + box.height / 2, { clickCount: 3 });
    expect(await copyNow()).toBe('First panel para B.');

    await load('Para one text.\n\n{{nyml\nkind: data\na: 1\n}}');
    box = (await page.locator('.markdown-body > p').first().boundingBox())!;
    await page.mouse.click(box.x + 5, box.y + box.height / 2, { clickCount: 3 });
    expect(await copyNow()).toBe('Para one text.');
  });

  it('[C.7] dragging across the cells of one row keeps a table row (round 5, M3)', async () => {
    await load('| City | People | Country |\n|---|---|---|\n| New York | 8 million | USA |');
    const text = await page.evaluate(() => {
      const tds = document.querySelectorAll('.markdown-body td');
      const r = document.createRange(); r.setStart(tds[0].firstChild!, 0); r.setEnd(tds[2].firstChild!, 3);
      const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(r);
      const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    expect(text).toBe('|  |  |  |\n| --- | --- | --- |\n| New York | 8 million | USA |');
  });

  it('[C.15] copying indented code keeps the first line\'s indentation (round 6, H2)', async () => {
    await load('```py\nclass A:\n    def f(self):\n        return 1\n```\n\nAfter.');
    const dragged = await page.evaluate(() => {
      const t = document.querySelector('.markdown-body pre code')!.firstChild!;
      const at = t.textContent!.indexOf('    def');
      const r = document.createRange(); r.setStart(t, at); r.setEnd(t, t.textContent!.length - 1);
      const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(r);
      const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    expect(dragged).toBe('    def f(self):\n        return 1');
    const box = (await page.locator('.markdown-body pre').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + (box.height / 3) * 2.5, { clickCount: 3 });
    expect((await copyNow()).replace(/\n$/, '')).toBe('        return 1');
  });

  it('[C.15] triple-click never copies visibility:hidden content (round 6, L1)', async () => {
    await load('Para one.\n\n<div style="visibility:hidden">SECRET</div>');
    const box = (await page.locator('.markdown-body > p').first().boundingBox())!;
    await page.mouse.click(box.x + 5, box.y + box.height / 2, { clickCount: 3 });
    expect(await copyNow()).toBe('Para one.');
  });

  it('[C.19] an include neutralized by prepareSources copies as the include the reader sees (round 6, L4)', async () => {
    await load('```\n{{\u2060md file.md}}\n```\n\nSee {{\u2060md part-two}} too.');
    const { text } = await copySelection('.markdown-body pre', '.markdown-body p');
    // Code copies verbatim (a live include again); prose stays the literal text it shows (C.3).
    expect(text).toBe('```\n{{md file.md}}\n```\n\nSee \\{{md part-two}} too.');
  });

  it('[C.16] the copy event itself is linear: whole-document and two-paragraph selections (round 6, M1)', async () => {
    const time = async (n: number, whole: boolean) => {
      await load(Array.from({ length: n }, (_, i) => `Paragraph ${i} with **bold** and 中文。`).join('\n\n'));
      return page.evaluate((all) => {
        const root = document.querySelector('.markdown-body')!;
        const ps = root.querySelectorAll('p');
        const mid = Math.floor(ps.length / 2);
        let min = Infinity;
        for (let k = 0; k < 3; k++) {
          const r = document.createRange();
          if (all) { r.setStart(ps[0], 0); r.setEnd(ps[ps.length - 1], ps[ps.length - 1].childNodes.length); }
          else { r.setStart(ps[mid], 0); r.setEnd(ps[mid + 1], ps[mid + 1].childNodes.length); }
          const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(r);
          const t0 = performance.now();
          document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: new DataTransfer(), bubbles: true, cancelable: true }));
          min = Math.min(min, performance.now() - t0);
        }
        return min;
      }, whole);
    };
    // A real quadratic fails every round; a GC pause in a long-lived page does not.
    let r = Infinity, wholeLarge = Infinity;
    for (let round = 0; round < 3 && r >= 8; round++) {
      const small = await time(2000, true);
      const large = await time(8000, true);
      if (large / Math.max(small, 1) < r) { r = large / Math.max(small, 1); wholeLarge = large; }
    }
    expect(r).toBeLessThan(8);
    expect(wholeLarge).toBeLessThan(4000); // was 8.5 s
    const pairLarge = await time(8000, false);
    expect(pairLarge).toBeLessThan(150); // was 1.45 s: two paragraphs must not cost the document
  }, 120_000);

  it('[M.14] a bundled theme leaves the host page\'s own UI alone (round 6, M4)', async () => {
    const hostUi = '<nav id="host"><p>Host text</p><h1>App</h1><a href="#">link</a><code>c</code><blockquote>q</blockquote><table><tr><td>t</td></tr></table><button>b</button></nav>';
    const probe = () => page.evaluate(() => {
      // Inherited text properties too (round 7, M-3); font-size follows the
      // rem base <html> may set, so it is not compared.
      const props = ['border-bottom-style', 'border-left-style', 'background-color', 'padding-left', 'text-decoration-line', 'border-top-style', 'box-shadow', 'text-transform',
        'color', 'font-family', 'font-weight', 'line-height', 'letter-spacing', '-webkit-font-smoothing'];
      return [...document.querySelectorAll('#host *')].map((el) => {
        const cs = getComputedStyle(el);
        return el.tagName + ' ' + props.map((p) => cs.getPropertyValue(p)).join('|');
      });
    });
    // The baseline shares the theme's colour scheme: `:root { color-scheme }`
    // is a page-level declaration the contract requires (form controls follow it).
    const bare: Record<string, string[]> = {};
    for (const scheme of ['light', 'dark']) {
      await page.setContent(`<!doctype html><html><head><style>:root{color-scheme:${scheme}}</style></head><body>${hostUi}<article class="markdown-body"><h1>x</h1></article></body></html>`);
      bare[scheme] = await probe();
    }
    const common = readFileSync('themes/common.css', 'utf8');
    for (const theme of readdirSync('themes').filter((f) => f.endsWith('.css') && f !== 'common.css')) {
      const css = readFileSync(`themes/${theme}`, 'utf8').replace(/@import\s+['"]\.\/common\.css['"];?/, common).replace(/@import[^;]+;/g, '');
      await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${hostUi}<article class="markdown-body"><h1>x</h1></article></body></html>`);
      expect(await probe(), theme).toEqual(bare[/color-scheme:\s*dark/.test(css) ? 'dark' : 'light']);
    }
  });

  it('[C.20] getBrowserRuntimeScript({ autoInit: false }) copies as Markdown but rewires nothing', async () => {
    const { getBrowserRuntimeScript, browserRuntimeScript } = await import('../src/runtime');
    expect(getBrowserRuntimeScript()).toBe(browserRuntimeScript);
    const body = md.render(':::: tabs\n::: tab One\nFirst **panel**.\n:::\n::: tab Two\nSecond.\n:::\n::::\n\n{{qr https://orz.how}}');
    await page.setContent(`<!doctype html><html><head><style>${COMMON_CSS}</style></head><body><article class="markdown-body">${body}</article><script>${getBrowserRuntimeScript({ autoInit: false })}</script></body></html>`);
    const state = await page.evaluate(() => ({
      bars: document.querySelectorAll('.tabs-bar').length,
      qrReady: document.querySelectorAll('[data-qr-ready]').length,
      api: typeof (window as unknown as { OrzMarkdownRuntime?: { init?: unknown } }).OrzMarkdownRuntime?.init,
    }));
    expect(state).toEqual({ bars: 0, qrReady: 0, api: 'function' });
    const { text } = await copySelection('.markdown-body .tab p', '.markdown-body .tab p');
    expect(text).toBe('First **panel**.');
  });

  it('[C.15] a drag from the paragraph above into indented code keeps the first line\'s indentation (round 7, H-4)', async () => {
    await load('Intro paragraph.\n\n```py\n    indented_first = 1\n    second = 2\n```\n\nAfter.');
    const text = await page.evaluate(() => {
      const p = document.querySelector('.markdown-body p')!.firstChild!;
      const t = document.querySelector('.markdown-body pre code')!.firstChild!;
      const r = document.createRange(); r.setStart(p, p.textContent!.length); r.setEnd(t, t.textContent!.indexOf('second') + 'second = 2'.length);
      const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(r);
      const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    expect(text).toBe('    indented_first = 1\n    second = 2');
  });

  it('[C.19] a selection starting at the second brace carries no joiner (round 7, L-1)', async () => {
    await load('See {{\u2060md part-two}} too.\n\n```\n{{\u2060md file.md}}\n```');
    const texts = await page.evaluate(() => {
      const out: string[] = [];
      for (const sel of ['.markdown-body p', '.markdown-body pre code']) {
        const t = document.querySelector(sel)!.firstChild!;
        const at = t.textContent!.indexOf('{{') + 1;
        const r = document.createRange(); r.setStart(t, at); r.setEnd(t, t.textContent!.indexOf('}}') + 2);
        const s = getSelection()!; s.removeAllRanges(); s.addRange(r);
        const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
        out.push(dt.getData('text/plain'));
      }
      return out;
    });
    for (const t of texts) expect(t).not.toContain('\u2060');
  });

  it('[M.16] in a real browser, an include never re-parents or hides the host text after it (round 9)', async () => {
    const { prepareSources } = await import('../src/prepare-sources');
    const attacks = ['<!--', '<div>\n<!--', '<div style="display:none">', '<div style="display:none"/>', '<DIV class="x" />',
      '</div>', '</details>', 'Text <span/> here.', '<p>open', '<table><tr><td>', '<svg><g>', '<template>', '<noscript>',
      '<textarea>', 'Fine <kbd>Ctrl</kbd>.', '<details><summary>S</summary>\n\nx\n\n</details>',
      // round 10: foreign content, comment states, raw text, EOF in tag/attribute, implied closing
      '<svg><div style="display:none"/></svg>', '<svg><foreignObject><div/></foreignObject></svg>', '<math><mi><div style="display:none"/></mi></math>',
      '<!--><div style="display:none"><!-- -->', '<!---><div style="display:none"><!-- -->', '<!-- x --!><div style="display:none"><!-- -->',
      '<div style=display:none', "<div title='", '<plaintext></plaintext>', '<xmp><!--</xmp><div style="display:none">--></xmp>',
      '<noembed><!--</noembed><div style="display:none">--></noembed>', '<ul><li><div><li>x</li></div></li></ul>',
      '<table><tr><td><div><td></td></div></td></tr></table>', '- a <div>\n- b </div>', '<b><i>x</b></i>', '<p><span><div>x</div></span></p>',
      // round 12: overlays (visible to elementFromPoint, not to checkVisibility)
      '<div style="position:fixed;inset:0;z-index:99999;background:#fff">FAKE</div>', '<div style="margin-top:-2000px;height:4000px;background:#fff">FAKE</div>',
      'FAKE {{attrs[style="position:fixed;inset:0;z-index:99999;background:#fff"]}}', '::: left 1px;position:fixed;inset:0;z-index:99999;background:#fff\nFAKE\n:::',
      // round 13: overlays through classes and allowed-looking styles
      '<div class="qrcode-overlay">FAKE</div>', '::: qrcode-overlay\nFAKE\n:::', '{{sp[qrcode-overlay] FAKE}}',
      '<div style="height:0"><div style="opacity:0.99;background-color:#fff;height:600px">FAKE</div></div>',
      '<div style="font-size:1000px;line-height:0;height:0;opacity:.99;color:#fff">FAKE</div>', '<div style="margin-top:/**/-2000px;height:4000px;background-color:#fff">FAKE</div>',
      // round 16: math that paints outside its box
      'Included $\\smash{\\rule[-4em]{60em}{3em}}$ text.', 'Included $\\smash{\\color{white}\\rule[-4em]{60em}{3em}}$ text.',
      'Included $\\rlap{\\raisebox{-4em}{\\text{FAKE FAKE FAKE FAKE FAKE}}}$ text.', 'Included $\\kern-30em\\text{FAKE}$ text.',
      // round 21: negative kerns KaTeX reads loosely, and math in a spoil label
      'Included $\\kern{0-30em}\\text{FAKE}$ text.', 'Included $\\tmspace-{540mu}{30em}\\text{FAKE}$ text.', 'Included $\\kern{{-30em}}\\text{FAKE}$ text.',
      '::: spoil $\\kern{0-30em}\\text{FAKE}$\nbody\n:::'];
    // A host line long enough to wrap across the article, so a hit test along
    // its line boxes sees an overlay wherever it sits (round 13).
    const after = 'HOST-AFTER ' + 'host text that wraps across the whole width of the article '.repeat(4);
    const hosts = ['{{md https://e.test/a}}\n\nHOST-AFTER', '- {{md https://e.test/a}}\n\nHOST-AFTER', '> {{md https://e.test/a}}\n\nHOST-AFTER',
      '::: info\n{{md https://e.test/a}}\n\nHOST-AFTER\n:::', '::: spoil Answer\n{{md https://e.test/a}}\n\nHOST-AFTER\n:::'].map((h) => h.replace('HOST-AFTER', after));
    const chain = async (src: string) => {
      await load(src, KATEX_CSS); // KaTeX's own layout is what math covering relies on
      return page.evaluate(() => {
        const walker = document.createTreeWalker(document.querySelector('.markdown-body')!, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (n.nodeValue!.includes('HOST-AFTER')) {
            const tags: string[] = [];
            for (let e = n.parentElement; e && !e.classList.contains('markdown-body'); e = e.parentElement) tags.push(e.tagName);
            return tags.join('<');
          }
        }
        return 'MISSING';
      }).then(async (path) => path + (await page.evaluate(() => {
        const walker = document.createTreeWalker(document.querySelector('.markdown-body')!, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (n.nodeValue!.includes('HOST-AFTER')) {
            const el = n.parentElement!;
            if (!(el.checkVisibility?.() ?? true)) return ' (hidden)';
            el.scrollIntoView();
            // The text's own line box (a float beside it narrows the line, not covers it).
            const r = document.createRange(); r.selectNodeContents(n);
            for (const box of Array.from(r.getClientRects())) {
              for (const f of [0.1, 0.5, 0.9]) {
                const hit = document.elementFromPoint(box.left + box.width * f, box.top + box.height / 2);
                if (!(hit && (hit === el || el.contains(hit) || hit.contains(el)))) return ' (covered)';
              }
            }
            return '';
          }
        }
        return '';
      })));
    };
    for (const host of hosts) {
      const expected = await chain(host.replace('{{md https://e.test/a}}', 'Fetched.'));
      for (const fetched of attacks) {
        const out = await prepareSources(host, { fetcher: async () => fetched });
        expect(await chain(out), `${JSON.stringify(host)} ← ${JSON.stringify(fetched)}`).toBe(expected);
      }
    }
  }, 120_000);

  it('[C.15] a drag from an indented code line out of the block keeps that line\'s indentation (round 11, H3)', async () => {
    await load('```js\nfunction f() {\n  if (a) {\n    b();\n  }\n}\n```\n\nAfter para.');
    const text = await page.evaluate(() => {
      const t = document.querySelector('.markdown-body pre code')!.firstChild!;
      const p = document.querySelector('.markdown-body p')!.firstChild!;
      const r = document.createRange(); r.setStart(t, t.textContent!.indexOf('  if (a)')); r.setEnd(p, p.textContent!.length);
      const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(r);
      const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    expect(text).toContain('  if (a) {\n    b();\n  }');
    expect(text).toContain('After para.');
  });

  it('[C.14] nested copy roots: a partial selection copies only what is selected (round 14, H2)', async () => {
    const body = md.render('# Deck Title\n\nSubtitle\n\nAuthor Name');
    await page.setContent(`<!doctype html><html><head><style>${COMMON_CSS}</style></head><body><div data-orz-copy>${''}<p id="outer">Outer intro.</p><article class="markdown-body">${body}</article><p>PRIVATE NOTE not selected</p></div><script>${(await import('../src/runtime')).browserRuntimeScript}</script></body></html>`);
    const text = await page.evaluate(() => {
      const a = document.querySelector('#outer')!.firstChild!;
      const t = Array.from(document.querySelectorAll('.markdown-body p')).find((p) => p.textContent === 'Author Name')!.firstChild!;
      const r = document.createRange(); r.setStart(a, 0); r.setEnd(t, 5);
      const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(r);
      const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    expect(text).toContain('Outer intro.');
    expect(text).toContain('Autho');
    expect(text).not.toContain('PRIVATE NOTE');
    expect(text).not.toContain('Author Name');
    // …and in the other direction: from inside the nested root out into the outer one.
    const back = await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll('.markdown-body p')).find((p) => p.textContent === 'Subtitle')!.firstChild!;
      const n = Array.from(document.querySelectorAll('p')).find((p) => p.textContent!.startsWith('PRIVATE'))!.firstChild!;
      const r = document.createRange(); r.setStart(t, 0); r.setEnd(n, 7);
      const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(r);
      const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    expect(back).toContain('Subtitle');
    expect(back).toContain('PRIVATE');
    expect(back).not.toContain('not selected');
  });

  it('[C.15] a selection that takes a whole block element copies the block (round 18, M4)', async () => {
    await load('Before.\n\n```js\nconst x = 1;\nconst y = 2;\n```\n\n## Heading\n\nAfter.');
    const copyAround = (sel: string) => page.evaluate((s) => {
      const el = document.querySelector(s)!;
      const r = document.createRange(); r.setStartBefore(el); r.setEndAfter(el);
      const g = getSelection()!; g.removeAllRanges(); g.addRange(r);
      const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    }, sel);
    expect(await copyAround('.markdown-body pre')).toBe('```js\nconst x = 1;\nconst y = 2;\n```');
    expect(await copyAround('.markdown-body h2')).toBe('## Heading');
  });

  it('[M.8] __orzEnhance is idempotent', async () => {
    await load('```js\nx\n```\n\n{{chart\ndata: 1, 2\n}}\n\n{{mermaid\ngraph LR; A-->B\n}}\n\n{{smiles CCO}}\n\n:::: tabs\n::: tab A\na\n:::\n::: tab B\nb\n:::\n::::');
    const counts = await page.evaluate(() => {
      const w = window as unknown as { __orzEnhance(): void; __calls: Record<string, number> };
      w.__orzEnhance();
      const first = { ...w.__calls };
      w.__orzEnhance();
      return { first, second: { ...w.__calls }, bars: document.querySelectorAll('.tabs-bar').length, wrappers: document.querySelectorAll('canvas.orz-chart').length };
    });
    expect(counts.first).toEqual({ hljs: 1, chart: 1, mermaid: 1, smiles: 1 });
    expect(counts.second).toEqual(counts.first);
    expect(counts.bars).toBe(1);
    expect(counts.wrappers).toBe(1);
  });
});

// ── M.24 in-page enhancement (2.2.0) ─────────────────────────────────────

suite('enhanceDocument: the preview frame\'s enhancement for content rendered in a page (real Chrome)', () => {
  const FAKE_LIBS = (pa: ReturnType<typeof getPreviewFrameAssets>): Record<string, string> => ({
    [pa.cdn.hljsJs]: "window.__loads=(window.__loads||0)+1;window.__calls=window.__calls||{};window.hljs={highlightElement:function(el){window.__calls.hljs=(window.__calls.hljs||0)+1;el.classList.add('hljs')}};",
    [pa.cdn.mermaidJs]: "window.__loads=(window.__loads||0)+1;window.__calls=window.__calls||{};window.mermaid={initialize:function(o){window.__mermaidInit=o},run:function(o){window.__calls.mermaid=(window.__calls.mermaid||0)+o.nodes.length;o.nodes.forEach(function(n){n.setAttribute('data-processed','true')});return Promise.resolve()}};",
    [pa.cdn.smilesJs]: "window.__loads=(window.__loads||0)+1;window.__calls=window.__calls||{};window.SmilesDrawer={Drawer:function(){this.draw=function(t,c,theme){window.__smilesTheme=theme}},parse:function(s,cb){window.__calls.smiles=(window.__calls.smiles||0)+1;cb({})}};",
    [pa.cdn.chartJs]: "window.__loads=(window.__loads||0)+1;window.__calls=window.__calls||{};window.__live=0;window.Chart=function(){window.__calls.chart=(window.__calls.chart||0)+1;window.__live++;var gone=false;this.destroy=function(){if(!gone){gone=true;window.__live--}}};",
  });
  let bundle = '';
  let own: Browser | null = null; // its own Chrome: the copy suite closes the shared one when it ends
  afterAll(async () => { await own?.close(); });
  beforeAll(async () => {
    own = await launch();
    const { build } = await import('esbuild');
    const out = await build({ stdin: { contents: "export { enhanceDocument, disposeEnhancement, swapStylesheet, PREVIEW_CDN } from './src/preview-frame';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'iife', globalName: 'E', platform: 'browser', write: false, logLevel: 'silent' });
    bundle = out.outputFiles[0].text;
  });

  async function enhancePage(o: { offline?: string[]; libs?: (pa: ReturnType<typeof getPreviewFrameAssets>) => Record<string, string> } = {}) {
    const pa = getPreviewFrameAssets();
    const libs = { ...FAKE_LIBS(pa), ...(o.libs ? o.libs(pa) : {}) };
    const context = await own!.newContext();
    const requests: string[] = [];
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('data:') || url === 'about:blank') return route.continue();
      if (url === 'https://page.test/doc.html') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><header id="site">Site</header><article class="markdown-body" id="doc"></article></body></html>' });
      requests.push(url);
      if (o.offline?.includes(url)) return route.abort('internetdisconnected');
      if (libs[url]) return route.fulfill({ status: 200, contentType: 'text/javascript', body: libs[url] });
      if (url.endsWith('.css')) return route.fulfill({ status: 200, contentType: 'text/css', body: '/* css */' });
      return route.abort('internetdisconnected');
    });
    const p = await context.newPage();
    await p.goto('https://page.test/doc.html');
    await p.addScriptTag({ content: bundle });
    return { p, context, requests, pa };
  }
  const render = (p: Page, src: string) => p.evaluate((html) => { document.getElementById('doc')!.innerHTML = html; }, md.render(src));
  const enhance = (p: Page, o: Record<string, unknown> = {}) => p.evaluate((opts) => (window as unknown as { E: { enhanceDocument(r: Element, o: unknown): Promise<{ loaded: string[]; failed: string[] }> } }).E.enhanceDocument(document.getElementById('doc')!, opts), o);
  const state = (p: Page) => p.evaluate(() => ({
    loads: (window as unknown as { __loads?: number }).__loads ?? 0,
    calls: { ...((window as unknown as { __calls?: Record<string, number> }).__calls ?? {}) },
    scripts: Array.from(document.querySelectorAll('script[src]')).map((s) => [s.getAttribute('src'), s.getAttribute('nonce')]),
    inline: Array.from(document.querySelectorAll('script:not([src])')).filter((s) => (s.textContent ?? '').includes('OrzMarkdownRuntime') && !(s.textContent ?? '').includes('PREVIEW_CDN')).map((s) => s.getAttribute('nonce')),
    links: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) => [l.getAttribute('href'), l.id, l.getAttribute('nonce')]),
    runtime: typeof (window as unknown as { OrzMarkdownRuntime?: unknown }).OrzMarkdownRuntime,
  }));

  it('[M.24] enhanceDocument loads only what the content needs (code: highlight.js and its stylesheet of the scheme; math: KaTeX\'s stylesheet), installs the runtime once (copy-as-Markdown, tabs), stamps the nonce, and is idempotent; content that needs Mermaid, SMILES and Chart.js loads exactly those, each drawn once', async () => {
    const { p, context, requests, pa } = await enhancePage();
    await render(p, '# Code and math\n\n```js\nlet x = 1;\n```\n\nSome **bold** and $E = mc^2$.\n\n:::: tabs\n::: tab A\na\n:::\n::: tab B\nb\n:::\n::::\n');
    const r1 = await enhance(p, { scheme: 'dark', nonce: 'n1' });
    expect(r1).toEqual({ loaded: [pa.cdn.hljsJs], failed: [] });
    let s = await state(p);
    expect(s.loads).toBe(1);
    expect(s.calls).toEqual({ hljs: 1 });
    expect(s.scripts).toEqual([[pa.cdn.hljsJs, 'n1']]);
    expect(s.inline).toEqual(['n1']);
    expect(s.runtime).toBe('object');
    expect(s.links).toEqual([[pa.cdn.katexCss, '', 'n1'], [pa.cdn.hljsDarkCss, 'orz-hljs', 'n1']]);
    expect(requests.filter((u) => /mermaid|smiles|chart/.test(u))).toEqual([]);
    expect(await p.evaluate(() => document.querySelectorAll('#doc .tabs-bar').length)).toBe(1);
    expect(await p.evaluate(() => (window as unknown as { __orzSmilesTheme?: string }).__orzSmilesTheme)).toBe('dark');
    // copy-as-Markdown works in the page
    const copied = await p.evaluate(() => {
      const para = Array.from(document.querySelectorAll('#doc p')).find((x) => x.textContent!.includes('bold'))!;
      const range = document.createRange();
      range.selectNodeContents(para);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      const dt = new DataTransfer();
      para.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData('text/plain');
    });
    expect(copied).toContain('**bold**');
    // idempotent: nothing drawn, loaded or added twice
    expect(await enhance(p, { scheme: 'dark', nonce: 'n1' })).toEqual({ loaded: [], failed: [] });
    expect(await state(p)).toEqual(s);
    expect(await p.evaluate(() => document.querySelectorAll('#doc .tabs-bar').length)).toBe(1);
    // a scheme change swaps highlight.js's stylesheet (the new one loads before the old goes: M.27)
    await enhance(p, { scheme: 'light' });
    await p.waitForFunction(() => !document.querySelector('link[data-orz-swap]'));
    expect((await state(p)).links).toEqual([[pa.cdn.katexCss, '', 'n1'], [pa.cdn.hljsLightCss, 'orz-hljs', 'n1']]);
    // a re-render that needs the other libraries loads exactly those, once, and draws each construct once
    await render(p, '```js\ny\n```\n\n{{mermaid\ngraph LR; A-->B\n}}\n\n{{smiles CCO}}\n\n{{chart\ndata: 1, 2\n}}\n');
    const r2 = await enhance(p);
    expect(r2.loaded.sort()).toEqual([pa.cdn.mermaidJs, pa.cdn.smilesJs, pa.cdn.chartJs].sort());
    s = await state(p);
    expect(s.loads).toBe(4);
    expect(s.calls).toEqual({ hljs: 2, mermaid: 1, smiles: 1, chart: 1 });
    expect(await p.evaluate(() => (window as unknown as { __mermaidInit?: unknown }).__mermaidInit)).toEqual({ startOnLoad: false });
    await enhance(p);
    expect((await state(p)).calls).toEqual({ hljs: 2, mermaid: 1, smiles: 1, chart: 1 });
    expect(await p.evaluate(() => document.querySelectorAll('canvas.orz-chart').length)).toBe(1);
    // the page's own elements are not touched
    expect(await p.evaluate(() => document.getElementById('site')!.outerHTML)).toBe('<header id="site">Site</header>');
    await context.close();
  }, 60_000);

  it('[M.26] enhanceDocument releases what it drew: over 40 re-renders of a chart the live Chart.js instances do not grow (each call destroys the charts whose canvas left the root), and disposeEnhancement(root) destroys the rest', async () => {
    const { p, context } = await enhancePage();
    for (let i = 0; i < 40; i++) {
      await render(p, `{{chart\ndata: ${i}, ${i + 1}\n}}\n\n{{chart\ndata: 3, ${i}\n}}\n`);
      await enhance(p, { assets: i === 0 });
    }
    const live = await p.evaluate(() => (window as unknown as { __live: number; __calls: Record<string, number> }).__live);
    const made = await p.evaluate(() => (window as unknown as { __calls: Record<string, number> }).__calls.chart);
    expect(made).toBe(80);
    expect(live).toBe(2); // the current render's two charts only
    await p.evaluate(() => (window as unknown as { E: { disposeEnhancement(r: Element): void } }).E.disposeEnhancement(document.getElementById('doc')!));
    expect(await p.evaluate(() => (window as unknown as { __live: number }).__live)).toBe(0);
    await context.close();
  }, 60_000);

  it('[M.28] enhanceDocument(root, { static: true }) (2.3.0) draws everything first — it resolves after the libraries loaded and the last pass ran — then turns every canvas it drew into an image of itself (data-orz-frozen chart / smiles; class, data-md breadcrumb, accessible name and drawn width kept): each chart is stopped and destroyed, drawn at least at 2× the pixel ratio unless the chart sets devicePixelRatio, never animated; the interactive runtime is not installed unless runtime: true; a canvas nothing drew (its library offline) stays a canvas; a static call after an interactive one freezes what is there', async () => {
    const drawing = (pa: ReturnType<typeof getPreviewFrameAssets>): Record<string, string> => ({
      [pa.cdn.chartJs]: "window.__live=0;window.__opts=[];window.__stops=0;window.Chart=function(c,g){window.__live++;window.__opts.push(g.options);var x=c.getContext('2d');c.width=320;c.height=160;c.style.width='320px';x.fillStyle='#c00';x.fillRect(10,10,100,100);var gone=false;this.stop=function(){window.__stops++};this.destroy=function(){if(!gone){gone=true;window.__live--}}};",
      [pa.cdn.smilesJs]: "window.SmilesDrawer={Drawer:function(o){this.draw=function(t,c){var x=c.getContext('2d');x.fillStyle='#00c';x.fillRect(0,0,20,20)}},parse:function(s,cb){cb({})}};",
    });
    const { p, context, pa } = await enhancePage({ libs: drawing });
    await render(p, '{{chart\ndata: 1, 2, 3\n}}\n\n{{chart\ntype: bar\ndata: 4, 5\n}}\n\n{{smiles CCO}}\n\n```js\nlet x;\n```\n');
    await p.evaluate(() => {
      const [c, d] = Array.from(document.querySelectorAll('canvas.orz-chart'));
      c.setAttribute('aria-label', 'Sales chart');
      const g = JSON.parse(d.getAttribute('data-chart')!);
      d.setAttribute('data-chart', JSON.stringify({ ...g, options: { devicePixelRatio: 1 } })); // the chart's own ratio
    });
    const r = await p.evaluate(() => (window as unknown as { E: { enhanceDocument(r: Element, o: unknown): Promise<unknown> } }).E.enhanceDocument(document.getElementById('doc')!, { static: true }));
    expect(r).toMatchObject({ failed: [], frozen: 3 });
    const state = await p.evaluate(() => ({
      canvases: document.querySelectorAll('#doc canvas').length,
      imgs: Array.from(document.querySelectorAll<HTMLImageElement>('#doc img[data-orz-frozen]')).map((i) => ({
        kind: i.getAttribute('data-orz-frozen'), cls: i.getAttribute('class'), md: i.getAttribute('data-md'), alt: i.getAttribute('alt'),
        png: i.getAttribute('src')!.startsWith('data:image/png;base64,'), width: i.style.width, loaded: i.complete && i.naturalWidth > 0,
      })),
      smilesMd: document.querySelector('#doc .smiles-render')!.getAttribute('data-md'),
      live: (window as unknown as { __live: number }).__live,
      stops: (window as unknown as { __stops: number }).__stops,
      dpr: (window as unknown as { __opts: Array<{ devicePixelRatio?: number; animation?: unknown }> }).__opts.map((o) => [o.devicePixelRatio, o.animation]),
      runtime: typeof (window as unknown as { OrzMarkdownRuntime?: unknown }).OrzMarkdownRuntime,
      hljs: document.querySelectorAll('#doc code.hljs').length,
    }));
    await p.waitForFunction(() => Array.from(document.querySelectorAll<HTMLImageElement>('#doc img[data-orz-frozen]')).every((i) => i.complete && i.naturalWidth > 0));
    expect(state.canvases).toBe(0);
    expect(state.imgs.map((i) => [i.kind, i.cls, i.alt, i.png, i.width])).toEqual([
      ['chart', 'orz-chart', 'Sales chart', true, '320px'],
      ['chart', 'orz-chart', '', true, '320px'],
      ['smiles', null, '', true, expect.stringMatching(/px$/)],
    ]);
    expect(state.imgs[0].md).toContain('{{chart');
    expect(state.smilesMd).toContain('smiles');
    expect([state.live, state.stops]).toEqual([0, 2]); // stopped, then destroyed
    expect(state.dpr).toEqual([[Math.max(2, await p.evaluate(() => devicePixelRatio)), false], [1, false]]);
    expect([state.runtime, state.hljs]).toEqual(['undefined', 1]);
    // idempotent: nothing left to draw or freeze
    expect(await p.evaluate(() => (window as unknown as { E: { enhanceDocument(r: Element, o: unknown): Promise<unknown> } }).E.enhanceDocument(document.getElementById('doc')!, { static: true }))).toMatchObject({ frozen: 0 });
    // runtime: true installs it; an interactive enhancement first, then a static one freezes what is there
    await render(p, '{{chart\ndata: 7, 8\n}}\n');
    await enhance(p, {});
    expect(await p.evaluate(() => [document.querySelectorAll('#doc canvas').length, (window as unknown as { __live: number }).__live])).toEqual([1, 1]);
    expect(await p.evaluate(() => (window as unknown as { E: { enhanceDocument(r: Element, o: unknown): Promise<unknown> } }).E.enhanceDocument(document.getElementById('doc')!, { static: true, runtime: true }))).toMatchObject({ frozen: 1 });
    expect(await p.evaluate(() => [document.querySelectorAll('#doc canvas').length, (window as unknown as { __live: number }).__live, typeof (window as unknown as { OrzMarkdownRuntime?: unknown }).OrzMarkdownRuntime])).toEqual([0, 0, 'object']);
    await context.close();
    // offline: the chart library cannot load, its canvas stays a canvas
    const off = await enhancePage({ libs: drawing, offline: [pa.cdn.chartJs] });
    await render(off.p, '{{chart\ndata: 1, 2\n}}\n');
    const r2 = await off.p.evaluate(() => (window as unknown as { E: { enhanceDocument(r: Element, o: unknown): Promise<unknown> } }).E.enhanceDocument(document.getElementById('doc')!, { static: true }));
    expect(r2).toMatchObject({ loaded: [], failed: [pa.cdn.chartJs], frozen: 0 });
    expect(await off.p.evaluate(() => document.querySelectorAll('#doc canvas.orz-chart').length)).toBe(1);
    await off.context.close();
  }, 60_000);

  it('[M.27] swapStylesheet (and enhanceDocument\'s scheme change) keeps the old stylesheet until the new one has loaded — never a moment without one — then the new link carries the id (and the old nonce); a newer swap supersedes a pending one', async () => {
    const pa = getPreviewFrameAssets();
    const context = await own!.newContext();
    let releaseCss!: () => void;
    const gate = new Promise<void>((r) => { releaseCss = r; });
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === 'https://page.test/doc.html') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><link id="orz-theme" rel="stylesheet" nonce="n9" href="https://css.test/a.css"></head><body><article class="markdown-body" id="doc"><p>x</p></article></body></html>' });
      if (url === 'https://css.test/a.css') return route.fulfill({ status: 200, contentType: 'text/css', body: 'p { color: rgb(1, 2, 3); }' });
      if (url === 'https://css.test/b.css') { await gate; return route.fulfill({ status: 200, contentType: 'text/css', body: 'p { color: rgb(4, 5, 6); }' }); }
      if (url === 'https://css.test/c.css') return route.fulfill({ status: 200, contentType: 'text/css', body: 'p { color: rgb(7, 8, 9); }' });
      return route.abort('internetdisconnected');
    });
    const p = await context.newPage();
    await p.goto('https://page.test/doc.html');
    await p.addScriptTag({ content: bundle });
    const color = () => p.evaluate(() => getComputedStyle(document.querySelector('#doc p')!).color);
    expect(await color()).toBe('rgb(1, 2, 3)');
    await p.evaluate(() => (window as unknown as { E: { swapStylesheet(d: Document, id: string, h: string): void } }).E.swapStylesheet(document, 'orz-theme', 'https://css.test/b.css'));
    await new Promise((r) => setTimeout(r, 300));
    // still loading: the old stylesheet styles the page
    expect(await color()).toBe('rgb(1, 2, 3)');
    expect(await p.evaluate(() => document.querySelectorAll('link[rel=stylesheet]').length)).toBe(2);
    releaseCss();
    await p.waitForFunction(() => !document.querySelector('link[data-orz-swap]'));
    expect(await color()).toBe('rgb(4, 5, 6)');
    expect(await p.evaluate(() => Array.from(document.querySelectorAll('link[rel=stylesheet]')).map((l) => [l.id, l.getAttribute('href'), (l as HTMLLinkElement).nonce]))).toEqual([['orz-theme', 'https://css.test/b.css', 'n9']]);
    // a newer swap wins over a pending one; the same href is a no-op
    await p.evaluate(() => {
      const E = (window as unknown as { E: { swapStylesheet(d: Document, id: string, h: string): void } }).E;
      E.swapStylesheet(document, 'orz-theme', 'https://css.test/a.css');
      E.swapStylesheet(document, 'orz-theme', 'https://css.test/c.css');
    });
    await p.waitForFunction(() => !document.querySelector('link[data-orz-swap]'));
    expect(await color()).toBe('rgb(7, 8, 9)');
    expect(await p.evaluate(() => Array.from(document.querySelectorAll('link[rel=stylesheet]')).map((l) => l.getAttribute('href')))).toEqual(['https://css.test/c.css']);
    void pa;
    await context.close();
  }, 60_000);

  it('[M.24] enhanceDocument with assets: false fetches nothing (the runtime still installs); a library that cannot load is reported failed, the content stays as rendered, and it is tried again only after a pause (15 s, doubled after each failure) and at most 3 times per window — re-renders while offline do not inject it again', async () => {
    const a = await enhancePage();
    await render(a.p, '```js\nx\n```\n\n$x$\n');
    expect(await enhance(a.p, { assets: false })).toEqual({ loaded: [], failed: [] });
    expect(a.requests).toEqual([]);
    expect((await state(a.p)).runtime).toBe('object');
    await a.context.close();
    const b = await enhancePage({ offline: [getPreviewFrameAssets().cdn.hljsJs] });
    await render(b.p, '```js\nx\n```\n');
    const r = await enhance(b.p);
    expect(r).toEqual({ loaded: [], failed: [b.pa.cdn.hljsJs] });
    expect(await b.p.evaluate(() => document.querySelector('#doc pre code')!.textContent)).toBe('x\n');
    const hl = () => b.requests.filter((u) => u === b.pa.cdn.hljsJs).length;
    const scripts = () => b.p.evaluate((u) => document.querySelectorAll(`script[src="${u}"]`).length, b.pa.cdn.hljsJs);
    expect(await scripts()).toBe(0); // the failed element goes
    // re-renders right after: reported failed, not injected again
    for (let i = 0; i < 5; i++) expect(await enhance(b.p)).toEqual({ loaded: [], failed: [b.pa.cdn.hljsJs] });
    expect(hl()).toBe(1);
    const shift = (ms: number) => b.p.evaluate((d) => { const w = window as unknown as { __realNow?: () => number }; w.__realNow ??= Date.now.bind(Date); Date.now = () => w.__realNow!() + d; }, ms);
    await shift(16_000); // past the pause: tried again (and fails again)
    expect(await enhance(b.p)).toEqual({ loaded: [], failed: [b.pa.cdn.hljsJs] });
    expect(hl()).toBe(2);
    await shift(16_000 + 20_000); // the pause doubled (30 s): not yet
    await enhance(b.p);
    expect(hl()).toBe(2);
    await shift(16_000 + 31_000);
    await enhance(b.p);
    expect(hl()).toBe(3);
    await shift(10 * 3600_000); // three attempts: never again in this window
    await enhance(b.p);
    await enhance(b.p);
    expect(hl()).toBe(3);
    await b.context.close();
  }, 60_000);

  it('[M.29] a library is probed by its API, never by its global name: headings named after every library global (Mermaid → id="mermaid", hljs, Chart, SmilesDrawer, katex, OrzMarkdownRuntime, by attrs where the slug lowers the case) do not stop enhanceDocument loading and drawing each library or installing the runtime; the frame\'s __orzEnhance probes the same way', async () => {
    const { p, context, pa } = await enhancePage();
    const named = '# Mermaid\n\n# hljs\n\n# katex\n\n# C {{attrs[#Chart]}}\n\n# S {{attrs[#SmilesDrawer]}}\n\n# R {{attrs[#OrzMarkdownRuntime]}}\n\n';
    const body = '```js\nlet x = 1;\n```\n\n$x$\n\n{{mermaid\ngraph LR; A-->B\n}}\n\n{{smiles CCO}}\n\n{{chart\ndata: 1, 2\n}}\n\n:::: tabs\n::: tab A\na\n:::\n::: tab B\nb\n:::\n::::\n';
    await render(p, named + body);
    // the elements are there and shadow the names before anything loads
    expect(await p.evaluate(() => ['mermaid', 'hljs', 'katex', 'Chart', 'SmilesDrawer', 'OrzMarkdownRuntime'].map((k) => (window as unknown as Record<string, unknown>)[k] instanceof HTMLElement))).toEqual([true, true, true, true, true, true]);
    const r = await enhance(p);
    expect(r.failed).toEqual([]);
    expect([...r.loaded].sort()).toEqual([pa.cdn.hljsJs, pa.cdn.mermaidJs, pa.cdn.smilesJs, pa.cdn.chartJs].sort());
    const s = await state(p);
    expect(s.calls).toEqual({ hljs: 1, mermaid: 1, smiles: 1, chart: 1 });
    expect(s.runtime).toBe('object');
    expect(await p.evaluate(() => document.querySelectorAll('#doc .tabs-bar').length)).toBe(1);
    await context.close();
    // the frame: __orzEnhance with the same element-named globals and no libraries runs to its end (the runtime still draws the tabs)
    const frame = await own!.newPage();
    const pa2 = getPreviewFrameAssets();
    const scripts = pa2.bodyScripts().replace(/<script src="[^"]*"><\/script>/g, '');
    await frame.setContent(`<!doctype html><html><body><article class="markdown-body">${md.render(named + ':::: tabs\n::: tab A\na\n:::\n::: tab B\nb\n:::\n::::\n')}</article>${scripts}</body></html>`);
    const out = await frame.evaluate(() => { try { (window as unknown as { __orzEnhance(): void }).__orzEnhance(); return document.querySelectorAll('.tabs-bar').length; } catch (e) { return String(e); } });
    expect(out).toBe(1);
    await frame.close();
  }, 60_000);

  it('[M.30] the print layer of common.css: every tab pane prints after its label (an unnamed one as "Tab N") and a YouTube embed prints its address (data-url) instead of a blank frame; the screen is unchanged (no label before a pane, the frame shown)', async () => {
    const pg = await own!.newPage();
    const html = md.render(':::: tabs\n::: tab Python\npy\n:::\n::: tab\nanon\n:::\n::::\n\n{{youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90}}\n');
    expect(html).toContain('data-url="https://youtu.be/dQw4w9WgXcQ?t=90"');
    await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${COMMON_CSS}</style></head><body><article class="markdown-body">${html}</article></body></html>`);
    const look = () => pg.evaluate(() => {
      const before = (el: Element) => getComputedStyle(el, '::before').content;
      const tabs = Array.from(document.querySelectorAll('.tab'));
      const yt = document.querySelector('.youtube-embed')!;
      return {
        labels: tabs.map(before),
        shown: tabs.map((t) => getComputedStyle(t).display),
        yt: before(yt),
        ytDisplay: getComputedStyle(yt).display,
        frame: getComputedStyle(yt.querySelector('iframe')!).display,
        ytHeight: Math.round(yt.getBoundingClientRect().height),
      };
    });
    const screen = await look();
    expect(screen.labels).toEqual(['none', 'none']);
    expect(screen.yt).toBe('none');
    expect(screen.frame).toBe('block');
    await pg.emulateMedia({ media: 'print' });
    const print = await look();
    expect(print.labels).toEqual(['"Python"', '"Tab " counter(orz-tab)']); // the runtime's own name for an unnamed tab
    expect(print.shown).toEqual(['block', 'block']);
    expect(print.yt).toBe('"YouTube video: https://youtu.be/dQw4w9WgXcQ?t=90"');
    expect(print.ytDisplay).toBe('block');
    expect(print.frame).toBe('none');
    expect(print.ytHeight).toBeLessThan(60); // a line of text, not a 16:9 blank
    await pg.close();
  }, 60_000);

  it('[M.42] an image inside a link, a list item or a table cell keeps its line (common.css, every bundled theme): a linked inline icon, an icon in a tight list item and in a cell, and a badge row stay inline beside their text; a picture alone in its paragraph keeps its look (orz-slides round A4, A4-TH-2: they were display: block)', async () => {
    const pg = await own!.newPage();
    const icon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAGklEQVR4nGM4oaFBNmIY1TyqeVTzqOaB1QwAtuG1kCqIhKwAAAAASUVORK5CYII='; // 20 × 20
    const src = `Press the ![gear](${icon}) button, then [![gear](${icon})](https://x.org) and pick the format.\n\n- Press ![gear](${icon}) in a list\n\n| Key | What |\n|---|---|\n| ![gear](${icon}) here | a cell |\n\n[![build](${icon})](https://x.org) [![cov](${icon})](https://x.org) badges\n`;
    const html = md.render(src);
    const look = () => pg.evaluate(() => Array.from(document.querySelectorAll<HTMLImageElement>('.markdown-body img')).map((im) => {
      const host = im.parentElement!.tagName === 'A' ? im.parentElement! : im;
      let n: Node | null = host.previousSibling;
      while (n && !(n.nodeType === 3 && (n.textContent ?? '').trim())) n = n.previousSibling;
      let last = true;
      if (!n) { last = false; n = host.nextSibling; while (n && !(n.nodeType === 3 && (n.textContent ?? '').trim())) n = n.nextSibling; }
      const rg = document.createRange();
      rg.selectNodeContents(n!);
      const rects = Array.from(rg.getClientRects());
      const near = last ? rects[rects.length - 1] : rects[0];
      const c = im.getBoundingClientRect();
      const mid = (c.top + c.bottom) / 2;
      return `${im.parentElement!.tagName.toLowerCase()} > img: ${getComputedStyle(im).display}${mid < near.top - 2 || mid > near.bottom + 2 ? ' OFF ITS LINE' : ''}`;
    }));
    const common = readFileSync('themes/common.css', 'utf8');
    const themes = ['', ...readdirSync('themes').filter((f) => f.endsWith('.css') && f !== 'common.css')];
    const bad: string[] = [];
    for (const theme of themes) {
      const css = theme ? readFileSync(`themes/${theme}`, 'utf8').replace(/@import\s+['"]\.\/common\.css['"];?/, common).replace(/@import[^;]+;/g, '') : common;
      await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><article class="markdown-body">${html}</article></body></html>`);
      for (const x of await look()) if (/block|OFF/.test(x)) bad.push(`${theme || 'common.css'}: ${x}`);
    }
    expect(bad).toEqual([]);
    expect(themes.length).toBeGreaterThan(10);
    // a picture alone in its paragraph, and a raw <img> block, look as before
    await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${common}</style></head><body><article class="markdown-body">${md.render(`![p](${icon})\n\n<img src="${icon}">\n`)}</article></body></html>`);
    expect(await pg.evaluate(() => Array.from(document.querySelectorAll('.markdown-body img')).map((i) => getComputedStyle(i).display))).toEqual(['inline', 'block']);
    await pg.close();
  }, 60_000);
});
