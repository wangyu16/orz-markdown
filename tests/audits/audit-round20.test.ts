/**
 * Round-20 regressions, bound to the claims they falsified.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { md, prepareSources } from '../../src/index';
import { parseDocMetaIsland } from '../../src/doc-meta';
import { browserRuntimeScript } from '../../src/runtime';

async function ratio(small: () => unknown, large: () => unknown): Promise<number> {
  await small(); await large();
  let r = Infinity;
  for (let round = 0; round < 3 && r >= 8; round++) {
    let a = Infinity, b = Infinity;
    for (let i = 0; i < 3; i++) {
      let t = performance.now(); await small(); a = Math.min(a, performance.now() - t);
      t = performance.now(); await large(); b = Math.min(b, performance.now() - t);
    }
    r = Math.min(r, b / Math.max(a, 1));
  }
  return r;
}
const one = (f: string) => ({ fetcher: async () => f });

describe('round 20 — half A', () => {
  // Since round 21 under 1em of typed negative kerning per body is allowed
  // (`\operatorname{f}\!\left(`): these sum past it.
  it.each(['$' + '\\!'.repeat(150) + '\\colorbox{white}{\\text{FAKE}}$', '$' + '\\negthinspace '.repeat(6) + 'x$', '$' + '\\negmedspace '.repeat(5) + 'x$', '$' + '\\negthickspace '.repeat(4) + 'x$',
    Array.from({ length: 10 }, () => '$.\\!\\!$').join('')])(
    '[M.16] fetched math with negative space is refused (H1): %s', async (f) => {
      const host = '{{md https://e.test/a}}\n\nHOST-AFTER';
      expect(await prepareSources(host, one(f))).toBe(host);
    });
  it('[M.16] the cap-crossing estimate counts every QR code and spoil labels (H2)', async () => {
    const host = '{{md https://e.test/a}}\n\n{{qr HOSTCODE}}';
    expect(await prepareSources(host, one(Array.from({ length: 260 }, (_, i) => `{{qr ${i}}}`).join('\n\n')))).toBe(host);
    expect(await prepareSources(host, one(Array.from({ length: 260 }, (_, i) => `::: spoil {{qr ${i}}}\nx\n:::`).join('\n\n')))).toBe(host);
  }, 60_000);
  it('[R.7] links inside footnotes count toward the link budget (H3)', () => {
    const src = `[a]: http://e.com/${'x'.repeat(10000)}\n\n` + Array.from({ length: 4000 }, () => '^[[a]]').join(' ');
    expect(md.render(src).length).toBeLessThan(60_000_000);
  }, 60_000);
  it('[M.9] each included file is read once per render, and not after the budget is spent (H4)', () => {
    let reads = 0;
    md.render(Array.from({ length: 200 }, () => '{{md big.md}}').join('\n\n'), { markdownBasePath: '/', readFile: () => { reads++; return 'x'.repeat(1_000_000); } });
    expect(reads).toBe(1);
  });
  it('[R.7] mhchem and total math per render are bounded (H5)', async () => {
    // Past the budget formulas render as source: 4× the formulas cost far less
    // than 4× the time (round 21: a ratio, not a wall-clock bound under load).
    const doc = (n: number) => Array.from({ length: n }, () => '$\\ce{' + 'H2O + '.repeat(150) + 'H2O}$').join('\n\n');
    const small = doc(100), large = doc(400);
    expect(md.render(large)).toContain('too much math');
    let best = Infinity;
    for (let round = 0; round < 2 && best >= 2.5; round++) {
      let t = performance.now(); md.render(small); const a = performance.now() - t;
      t = performance.now(); md.render(large); const b = performance.now() - t;
      best = Math.min(best, b / Math.max(a, 1));
    }
    expect(best).toBeLessThan(2.5);
  }, 180_000);
  it('[M.18] a reference-definition conflict refuses only that include (M1)', async () => {
    const files: Record<string, string> = {};
    const src = Array.from({ length: 64 }, (_, i) => { files[`https://e.test/c${i}`] = i % 16 === 0 ? 'Bad [r].\n\n[r]: http://other.example' : `Chapter ${i}.`; return `{{md https://e.test/c${i}}}`; }).join('\n\n');
    const out = await prepareSources('See [r].\n\n[r]: http://host.example\n\n' + src, { fetcher: async (u) => files[u] ?? null });
    expect((out.match(/\{\{md https/g) ?? []).length).toBe(4);
  }, 120_000);
  it('[R.7] included text counts toward the link budget base (M3)', () => {
    const chapter = Array.from({ length: 12000 }, (_, i) => `[l${i}](https://example.com/${'p'.repeat(100)}${i})`).join(' ');
    const html = md.render('# Book\n\n{{md ch1.md}}', { markdownBasePath: '/', readFile: () => chapter });
    expect(html).not.toContain('href=""');
  });
  it('[R.7] {{youtube}} needs a real video id (LOW)', () => {
    expect(md.render('{{youtube ..}}')).not.toContain('<iframe');
  });
});

type DomDoc = { createElement(tag: string): { className: string; innerHTML: string } };
let dom: DomDoc;
let e2m: (n: unknown) => string;
beforeAll(async () => {
  const { Window } = await import('happy-dom');
  dom = new Window().document as unknown as DomDoc;
  (0, eval)(browserRuntimeScript);
  e2m = (globalThis as unknown as { OrzMarkdownRuntime: { elementToMarkdown: typeof e2m } }).OrzMarkdownRuntime.elementToMarkdown;
});

describe('round 20 — half B', () => {
  it('[M.17] reading the island is linear on openers without ">" (H1)', async () => {
    const head = (n: number) => '<html><head>' + '<script '.repeat(n) + '>' + '</head><body></body></html>';
    expect(await ratio(() => parseDocMetaIsland(head(10000)), () => parseDocMetaIsland(head(40000)))).toBeLessThan(8);
  }, 120_000);
  it('[R.6] a heading pinning its own id keeps 1.6.3 numbering for the next same-titled heading (M1)', () => {
    const ids = (s: string) => [...md.render(s).matchAll(/<h[12] id="([^"]*)"/g)].map((m) => m[1]);
    expect(ids('# Foo {{attrs[#foo]}}\n# Foo')).toEqual(['foo', 'foo-1']);
    expect(ids('## Methods {{attrs[#methods]}}\n## Methods')).toEqual(['methods', 'methods-1']);
  });
  it('[C.8] a noncharacter in guarded math copies safely (L1)', () => {
    const root = dom.createElement('div'); root.className = 'markdown-body'; root.innerHTML = md.render('a $\\text{﷐}\\def$ b');
    expect(e2m(root)).not.toContain('\\$}');
  });
  it('[R.7] a reused env does not carry the previous document\'s link references (L4)', () => {
    const env = {};
    md.render('[r]: http://evil.example', env);
    expect(md.render('see [r]', env)).not.toContain('evil.example');
  });
});

describe('round 20 — the default fetcher reads at most what it may use (M4)', () => {
  it('[M.7] a huge response is abandoned past 4 × maxSize', async () => {
    const { createServer } = await import('node:http');
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/markdown' });
      const chunk = 'x'.repeat(65536);
      let sent = 0;
      const pump = () => { while (sent < 400 && res.write(chunk)) sent++; if (sent < 400) res.once('drain', pump); else res.end(); };
      pump();
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    const port = (server.address() as { port: number }).port;
    try {
      const src = `{{md http://127.0.0.1:${port}/big.md}}`;
      expect(await prepareSources(src, { maxSize: 100_000 })).toBe(src);
    } finally {
      server.closeAllConnections?.(); server.close();
    }
  }, 60_000);
});
