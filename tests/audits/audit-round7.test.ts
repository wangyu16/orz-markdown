/**
 * Round-7 regressions: each test reproduces a finding of the round-6
 * adversarial audit (notes/closed-loop.md, round 7), bound to the claim it
 * falsified. Real-browser findings (H-4, L-1, M-3 in a page) live in
 * tests/browser-copy.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { md, extractDocMeta, scanNymlBlocks, prepareSources } from '../../src/index';
import { browserRuntimeScript } from '../../src/runtime';
import { normalize } from '../helpers/normalize';

const dir = mkdtempSync(join(tmpdir(), 'orz-r7-'));
writeFileSync(join(dir, 'private-notes.md'), 'PRIVATE-NOTES-SECRET\n');
const env = { markdownBasePath: dir, markdownIncludeRoot: dir };

type Doc = { createElement(tag: string): { className: string; innerHTML: string } };
let doc: Doc;
let e2m: (n: unknown) => string;
beforeAll(async () => {
  const { Window } = await import('happy-dom');
  doc = new Window().document as unknown as Doc;
  (0, eval)(browserRuntimeScript);
  e2m = (globalThis as unknown as { OrzMarkdownRuntime: { elementToMarkdown: typeof e2m } }).OrzMarkdownRuntime.elementToMarkdown;
});
function roundTrip(src: string): void {
  const root = doc.createElement('div');
  root.className = 'markdown-body';
  root.innerHTML = md.render(src);
  const copied = e2m(root);
  expect(normalize(md.render(copied)), `copied as:\n${copied}`).toBe(normalize(md.render(src)));
}

/** Cost ratio large/small; interleaved best of five, best of up to three rounds. */
function ratio(small: () => unknown, large: () => unknown, bound = 8): [number, number] {
  small(); large();
  let best: [number, number] = [Infinity, Infinity];
  for (let round = 0; round < 3 && best[0] >= bound; round++) {
    let a = Infinity, b = Infinity;
    for (let i = 0; i < 5; i++) {
      let t = performance.now(); small(); a = Math.min(a, performance.now() - t);
      t = performance.now(); large(); b = Math.min(b, performance.now() - t);
    }
    if (b / Math.max(a, 1) < best[0]) best = [b / Math.max(a, 1), b];
  }
  return best;
}

/** The host shows a file include as a code example; it must stay an example. */
const EXAMPLE = '```\n{{md private-notes.md}}\n```';
function hostIntact(html: string): void {
  expect(html).not.toContain('PRIVATE-NOTES-SECRET');
  expect(html).toMatch(/<pre><code>\{\{md private-notes\.md\}\}\n<\/code><\/pre>/);
}

describe('prepareSources — splice safety is a whole-document property (H-1, H-2, M-2)', () => {
  const S = 'orz-include-sentinel';
  const cases: Array<[string, string, string]> = [
    // [name, host, fetched]
    ['forged fixed sentinel + open fence (H-1)', `{{md https://e.test/a}}\n\nHost para.\n\n${EXAMPLE}`, `${S}\n\n\`\`\`\n`],
    ['forged nonce-looking line + open comment (H-1)', `{{md https://e.test/a}}\n\nHost para.\n\n${EXAMPLE}`, 'orz-include-abc123\n\n<!--\n'],
    ['mid-line directive, fetched fence (H-2 B)', `Intro {{md https://e.test/a}}\n\n${EXAMPLE}`, '```\nx\n```'],
    ['text after the directive, unclosed fetched fence (H-2 C)', `{{md https://e.test/a}} (shared)\n\n${EXAMPLE}`, '```\nx'],
    ['text after the directive, closed fetched fence (H-2 C2)', `{{md https://e.test/a}} (shared)\n\n${EXAMPLE}`, '```\nx\n```'],
    ['BOM before a fetched fence (H-2 A)', `{{md https://e.test/a}}\n\n${EXAMPLE}`, '﻿```\nx\n```'],
    ['CR-only fetched text in a quote (H-2 E3)', `> {{md https://e.test/a}}\n\n${EXAMPLE}`, 'a\r```\rb'],
    ['CR-only fetched text in a list item (H-2 E4)', `- {{md https://e.test/a}}\n\n${EXAMPLE}`, 'a\r\r```\rb'],
    ['list item at the end swallows an indented example (H-2 D)', '{{md https://e.test/a}}\n\n    {{md private-notes.md}}\n\nAfter.', '- item'],
    ['footnote definition at the end swallows an indented example (H-2 D2)', 'Ref[^1].\n\n{{md https://e.test/a}}\n\n    {{md private-notes.md}}', '[^1]: note'],
  ];
  it.each(cases)('[M.16] %s', async (_name, host, fetched) => {
    const out = await prepareSources(host, { fetcher: async () => fetched });
    const html = md.render(out, env);
    expect(html).not.toContain('PRIVATE-NOTES-SECRET');
    if (host.includes('```')) hostIntact(html);
    if (host.includes('    {{md')) expect(html).toContain('<pre><code>{{md private-notes.md}}');
    if (host.includes('Host para.')) expect(html).toContain('<p>Host para.</p>');
  });

  it('[M.16] fetched text cannot redefine the host\'s link references (M-2)', async () => {
    const host = 'Read [the docs][docs].\n\n{{md https://e.test/a}}\n\n[docs]: https://good.example/docs';
    const out = await prepareSources(host, { fetcher: async () => 'Included.\n\n[docs]: https://evil.example/phish' });
    const html = md.render(out);
    expect(html).toContain('href="https://good.example/docs"');
    expect(html).not.toContain('evil.example');
  });

  it('[M.16] a harmless include is still spliced, wherever it sits', async () => {
    const fetcher = async () => 'Fetched **text**.';
    for (const host of ['{{md https://e.test/a}}', 'Intro {{md https://e.test/a}} outro', '> {{md https://e.test/a}}', '- {{md https://e.test/a}}', '1. a\n2. {{md https://e.test/a}}\n3. c']) {
      const html = md.render(await prepareSources(host, { fetcher }));
      expect(html, host).toContain('Fetched <strong>text</strong>.');
    }
  });

  it('[M.11] a directive mid-paragraph splits the paragraph: the include is block content', async () => {
    const out = await prepareSources('Intro {{md https://e.test/a}} outro', { fetcher: async () => '# Title' });
    expect(md.render(out)).toBe('<p>Intro</p>\n<h1 id="title" tabindex="-1">Title</h1>\n<p>outro</p>\n');
  });
});

describe('prepareSources — directives located from tokens (M-1)', () => {
  const hosts = [
    '- item\n\n  ```\n  > {{md https://e.test/a}}\n  ```',
    '> - ```\n>   {{md https://e.test/a}}\n>   ```',
    '1. x\n\n   ~~~\n   {{md https://e.test/a}}\n   ~~~',
  ];
  it.each(hosts)('[M.11] a directive inside a host code example is never fetched: %s', async (host) => {
    let calls = 0;
    const out = await prepareSources(host, { fetcher: async () => { calls++; return 'FETCHED-REMOTE-TEXT'; } });
    expect(calls).toBe(0);
    expect(out).toBe(host);
  });
});

describe('prepareSources — the default fetcher gives up (L-3)', () => {
  let server: Server;
  afterAll(() => { server?.closeAllConnections?.(); server?.close(); });
  it('[M.15] a server that never answers leaves the directive in place after timeoutMs', async () => {
    server = createServer(() => { /* never answer */ });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    const port = (server.address() as { port: number }).port;
    const src = `{{md http://127.0.0.1:${port}/slow.md}}`;
    const t0 = Date.now();
    expect(await prepareSources(src, { timeoutMs: 300 })).toBe(src);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});

describe('rendering — text after a URL cut keeps its Markdown (H-3, L-7)', () => {
  const cases: Array<[string, string]> = [
    ['见https://orz.how/a。`npm i`即可', '见<a href="https://orz.how/a">https://orz.how/a</a>。<code>npm i</code>即可'],
    ['见https://orz.how/a，*斜体*和[详情](https://x.y)', '见<a href="https://orz.how/a">https://orz.how/a</a>，<em>斜体</em>和<a href="https://x.y">详情</a>'],
    ['https://a.com/x，https://b.com/y', '<a href="https://a.com/x">https://a.com/x</a>，<a href="https://b.com/y">https://b.com/y</a>'],
    ['https://orz.how/a“引文”', '<a href="https://orz.how/a">https://orz.how/a</a>“引文”'],
  ];
  it.each(cases)('[R.3] %s', (src, html) => expect(md.renderInline(src)).toBe(html));
  it.each(cases.map(([src]) => src))('[C.2] copies back: %s', (src) => roundTrip(src));
});

describe('copy — round-7 findings', () => {
  it('[C.6] a tight list holding display math stays tight (L-2)', () => roundTrip('- a\n- $$x^2$$\n- c'));
  it('[C.18] emphasis nested at the edge of the same emphasis next to CJK punctuation (L-4)', () => {
    roundTrip('_*注意*：说明_');
    roundTrip('**__a__ b**');
  });
});

describe('consumers — round-7 findings', () => {
  it('[M.10] a "}}" inside nyml args is not the end of the block (L-5)', () => {
    const { meta, body } = extractDocMeta('{{nyml[}}] kind: meta\ntitle: T\n}}\n\nBody');
    expect(meta.title).toBe('T');
    expect(body).toBe('Body');
  });
  it('[R.6] a heading with no text gets a usable, unique id (L-6)', () => {
    const html = md.render('## {{emoji smile}}\n\n## {{emoji smile}}\n\n## Hello World');
    expect([...html.matchAll(/id="([^"]*)"/g)].map((m) => m[1])).toEqual(['section', 'section-1', 'hello-world']);
  });
});

describe('scanning and splicing stay linear (H-5, M-4)', () => {
  it('[M.5] unclosed line-start openers render and scan linearly (H-5)', () => {
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `{{nyml note ${i}`).join('\n');
    const small = lines(2000), large = lines(8000);
    let [r, ms] = ratio(() => md.render(small), () => md.render(large));
    expect(r).toBeLessThan(8);
    expect(ms).toBeLessThan(5000); // was 5.1 s
    [r, ms] = ratio(() => extractDocMeta(small), () => extractDocMeta(large));
    expect(r).toBeLessThan(8);
  }, 120_000);
  it('[M.5] unclosed inline openers parse linearly (M-4)', () => {
    const small = '{{emoji x '.repeat(5000), large = '{{emoji x '.repeat(20000);
    expect(ratio(() => md.render(small), () => md.render(large))[0]).toBeLessThan(8);
  }, 120_000);
  it('[M.5] removing many meta blocks is linear (M-4)', () => {
    const blocks = (n: number) => Array.from({ length: n }, (_, i) => `{{nyml\nkind: meta\ntitle: T${i}\n}}`).join('\n\n');
    const small = blocks(2000), large = blocks(8000);
    expect(ratio(() => extractDocMeta(small), () => extractDocMeta(large))[0]).toBeLessThan(8);
    expect(scanNymlBlocks(small)).toHaveLength(2000);
  }, 120_000);
  it('[M.18] prepareSources is linear in the number of directives (M-4)', async () => {
    const line = (n: number) => Array.from({ length: n }, () => 'x {{md https://e.test/a}}').join(' ');
    const time = async (src: string) => {
      let best = Infinity;
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        await prepareSources(src, { fetcher: async () => 'y' });
        best = Math.min(best, performance.now() - t0);
      }
      return best;
    };
    const small = line(1000), large = line(4000);
    await time(small);
    let r = Infinity;
    for (let round = 0; round < 3 && r >= 8; round++) r = Math.min(r, (await time(large)) / Math.max(await time(small), 1));
    expect(r).toBeLessThan(8);
  }, 120_000);
});
