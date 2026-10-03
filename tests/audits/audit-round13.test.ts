/**
 * Round-13 regressions: each test reproduces a finding of the round-12
 * adversarial audits (notes/closed-loop.md, round 13), bound to the claim it
 * falsified.
 */
import { describe, it, expect } from 'vitest';
import { prepareSources } from '../../src/index';

const URL_A = 'https://e.test/a';
const one = (fetched: string) => ({ fetcher: async () => fetched });

describe('includes — half A: no class, no style, no reserved ids', () => {
  const hosts = [`{{md ${URL_A}}}\n\nHOST-AFTER`, `Ref[^1].\n\n{{md ${URL_A}}}\n\n[^1]: Host note.\n\n{{nyml\nkind: data\na: 1\n}}`];
  it.each([
    '<div class="qrcode-overlay">Session expired. <a href="https://evil.example/login">Sign in</a></div>',
    '<div class="modal">x</div>',
    '::: qrcode-overlay\nx\n:::',
    '{{sp[qrcode-overlay] x}}',
    'x {{attrs[.qrcode-overlay]}}',
    '<div style="height:0"><div style="opacity:0.99;background-color:#fff;height:600px">FAKE</div></div>',
    '<div style="font-size:1000px;line-height:0;height:0">x</div>',
    '<div style="margin-top:/**/-2000px">x</div>',
    '<div style="margin-top:calc(2000px*-1)">x</div>',
    '<div style="float:left;width:100%;height:100000px"></div>',
    '<span id="fn1">FAKE NOTE</span>',
    'x {{attrs[#fn1]}}',
    '<a name="fnref1"></a>',
    '<div id="nyml-data">x</div>',
    '<div id="orz-meta">x</div>',
    '<img src="a.png" width="100000">',
  ])('[M.16] refused (H1–H4, L1): %s', async (fetched) => {
    for (const host of hosts) expect(await prepareSources(host, one(fetched))).toBe(host);
  });
});

import { md, extractDocMeta, scanNymlBlocks } from '../../src/index';
import { browserRuntimeScript } from '../../src/runtime';
import { normalize } from '../helpers/normalize';
import { beforeAll } from 'vitest';

type DomDoc = { createElement(tag: string): { className: string; innerHTML: string } };
let dom: DomDoc;
let e2m: (n: unknown) => string;
beforeAll(async () => {
  const { Window } = await import('happy-dom');
  dom = new Window().document as unknown as DomDoc;
  (0, eval)(browserRuntimeScript);
  e2m = (globalThis as unknown as { OrzMarkdownRuntime: { elementToMarkdown: typeof e2m } }).OrzMarkdownRuntime.elementToMarkdown;
});
function roundTrip(src: string): void {
  const root = dom.createElement('div');
  root.className = 'markdown-body';
  root.innerHTML = md.render(src);
  const copied = e2m(root);
  expect(normalize(md.render(copied)), `copied as:\n${copied}`).toBe(normalize(md.render(src)));
}

describe('rendering and copy — half B', () => {
  it.each([
    ['CJK paragraph with image alts holding URLs', (n: number) => '中文' + ' https://a.com/x ![https://b.com](i.png)'.repeat(n)],
    ['ASCII paragraph with image alts holding URLs', (n: number) => 'abc' + ' https://a.com/x ![https://b.com](i.png)'.repeat(n)],
    ['CJK paragraph with inline footnotes holding URLs', (n: number) => '中文' + ' https://a.com/x ^[https://b.com]'.repeat(n)],
  ])('[R.5] nested inline parses do not make linkify quadratic (H1): %s', (_name, make) => {
    const small = make(500), large = make(2000);
    let r = Infinity, ms = Infinity;
    for (let round = 0; round < 3 && r >= 8; round++) {
      let a = Infinity, b = Infinity;
      for (let i = 0; i < 3; i++) {
        let t = performance.now(); md.render(small); a = Math.min(a, performance.now() - t);
        t = performance.now(); md.render(large); b = Math.min(b, performance.now() - t);
      }
      if (b / Math.max(a, 1) < r) { r = b / Math.max(a, 1); ms = b; }
    }
    expect(r).toBeLessThan(8);
    expect(ms).toBeLessThan(5000);
  }, 120_000);

  it.each([
    '{{nyml\n  kind: meta\n  title: 我的文档\n  author: 张三\n  license: CC-BY-4.0\n}}\n\n正文',
    '{{nyml\n\tkind: meta\n\ttitle: 我的文档\n\tauthor: 张三\n\tlicense: CC-BY-4.0\n}}\n\n正文',
    '{{nyml kind: meta\n  title: 我的文档\n  author: 张三\n  license: CC-BY-4.0\n}}\n\n正文',
  ])('[M.10] an indented nyml body keeps every field (H2): %j', (src) => {
    expect(extractDocMeta(src).meta).toEqual({ title: '我的文档', author: '张三', license: { spdx: 'CC-BY-4.0' } });
  });
  it('[M.10] nested keys under an indented body stay nested', () => {
    const [b] = scanNymlBlocks('{{nyml\n  kind: element\n  name: x\n  license:\n    title: Nested\n}}');
    expect(b.fields).toEqual({ name: 'x', license: '' });
  });

  it.each(['E-mail:me@x.com.', 'Contact:me@x.com, thanks'])('[C.8] a glued email copies to the same mailto target (M1): %s', (src) => roundTrip(src));
  it.each(['H~www.a.com/x-~O', 'x^https://a.com/(y)^'])('[C.8] a link inside sub/sup copies as its text (L1): %s', (src) => roundTrip(src));
});

describe('round 14 — half A', () => {
  const host = `## Intro\n\nSee [intro](#intro).\n\n## 安装说明 {{attrs[#安装说明]}}\n\n{{md https://e.test/a}}\n\nHOST-AFTER`;
  const one2 = (fetched: string) => ({ fetcher: async () => fetched });
  it.each([
    '<div ID="intro">x</div>', `<div title='a>' id="intro">x</div>`, '{{sp <span Id="intro">FAKE</span>}}', 'Fake {{attrs[ID="intro"]}}',
    '<a id="%E5%AE%89%E8%A3%85%E8%AF%B4%E6%98%8E">x</a>', '<a name="%E5%AE%89%E8%A3%85%E8%AF%B4%E6%98%8E">x</a>',
    '<img name="querySelectorAll" src="a.png">', '<img name="addEventListener" src="a.png">', '<div id="hljs">x</div>',
    '<a href="https://evil.test/x" target="_blank" rel="opener">x</a>', '<a href="https://evil.test/x" target="_top">x</a>',
    '<div role="presentation" aria-owns="intro">x</div>', '<img align="left" width="60%" height="2000" src="a.png">',
  ])('[M.16] refused (H1–H4, M1, M2): %s', async (fetched) => {
    expect(await prepareSources(host, one2(fetched))).toBe(host);
  });
  it('[M.16] the README anchor pattern, unit sizes and a hand-written checkbox splice (M3, LOW)', async () => {
    for (const fetched of ['<a name="install"></a>\n\n## Install', '<a id="setup"></a>\n\n## Setup', '<img src="a.png" width="200px" height="auto">', '<input type="checkbox" checked disabled> done', '<a href="https://x.y" target="_blank" rel="noopener noreferrer">x</a>']) {
      expect(await prepareSources(host, one2(fetched))).not.toBe(host);
    }
  });
  it('[M.18] one long attribute is scanned once (H3)', async () => {
    const make = (n: number) => `<div title="${'<b '.repeat(n)}">x</div>`;
    const time = async (f: string) => { let b = Infinity; for (let i = 0; i < 3; i++) { const t0 = performance.now(); await prepareSources(host, one2(f)); b = Math.min(b, performance.now() - t0); } return b; };
    let r = Infinity;
    for (let round = 0; round < 3 && r >= 8; round++) r = Math.min(r, (await time(make(20000))) / Math.max(await time(make(5000)), 1));
    expect(r).toBeLessThan(8);
  }, 120_000);
  it('[R.7] {{space}} is capped', () => {
    expect(md.render('a {{space 100000}} b')).toContain('width:100rem');
  });
});
