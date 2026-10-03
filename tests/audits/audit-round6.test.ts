/**
 * Round-6 regressions: each test reproduces a finding of the round-5
 * adversarial audit (notes/closed-loop.md, round 6), bound to the claim it
 * falsified. Real-browser findings (H2, M1, L1, L4, M4 in a page) live in
 * tests/browser-copy.test.ts.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { md, extractDocMeta, scanNymlBlocks, prepareSources, maskInertMarkdown, parseDocMetaIsland } from '../../src/index';

const dir = mkdtempSync(join(tmpdir(), 'orz-r6-'));
writeFileSync(join(dir, 'private-notes.md'), 'PRIVATE-NOTES-SECRET\n');

/**
 * Cost ratio large/small, best of five each; the two runs interleave so load
 * from parallel test files hits both alike. A real quadratic exceeds the bound
 * every time while a load spike does not, so up to three rounds are measured
 * and the best kept. Returns [ratio, large ms].
 */
function ratio(small: () => void, large: () => void, bound = 8): [number, number] {
  small(); large();
  let best: [number, number] = [Infinity, Infinity];
  for (let round = 0; round < 3 && best[0] >= bound; round++) {
    let a = Infinity, b = Infinity;
    for (let i = 0; i < 5; i++) {
      let t = performance.now(); small(); a = Math.min(a, performance.now() - t);
      t = performance.now(); large(); b = Math.min(b, performance.now() - t);
    }
    const r = b / Math.max(a, 1);
    if (r < best[0]) best = [r, b];
  }
  return best;
}

describe('prepareSources — fetched text cannot swallow the host (H1)', () => {
  // The host shows a file include as a code example after the remote include.
  const host = '{{md https://evil.test/a}}\n\nExample:\n\n```\n{{md private-notes.md}}\n```\n\nAfter the example.';
  const openers = [
    '- Install\n\n  ```sh\n  npm i x',
    '<!--\n```\nold\n-->',
    '{{yaml\nnote: |\n  ```\n}}',
    '> ```\n> quoted code',
    '1. Step\n\n   ~~~~\n   code',
  ];
  it.each(openers)('[M.16] the host example stays an example: %s', async (fetched) => {
    const out = await prepareSources(host, { fetcher: async () => fetched });
    const html = md.render(out, { markdownBasePath: dir, markdownIncludeRoot: dir });
    expect(html).not.toContain('PRIVATE-NOTES-SECRET');
    expect(html).toMatch(/<pre><code>\{\{md private-notes\.md\}\}\n<\/code><\/pre>/);
    expect(html).toContain('<p>After the example.</p>');
  });

  it('[M.16] an unclosed fence is closed where it was opened, and the content still arrives', async () => {
    const out = await prepareSources('{{md https://e.test/a}}\n\nHost para.', { fetcher: async () => '- Install\n\n  ```sh\n  npm i x' });
    const html = md.render(out);
    expect(html).toContain('npm i x');
    expect(html).toContain('<p>Host para.</p>');
    expect(html.match(/<li>[\s\S]*npm i x[\s\S]*<\/li>/)).not.toBeNull();
  });

  const unsealable = ['<!--\nnever closed', '$$\nx = 1', '<pre>\nraw', '<script>\nvar a;'];
  it.each(unsealable)('[M.16] anything else left open refuses the include: %s', async (fetched) => {
    const src = '{{md https://e.test/a}}\n\nHost para.';
    const out = await prepareSources(src, { fetcher: async () => fetched });
    expect(out).toBe(src);
  });

  it('[M.13] two adjacent includes cannot join into a file include at the top level (L2)', async () => {
    const bodies: Record<string, string> = { 'https://e.test/h1': '{{', 'https://e.test/h2': 'md private-notes.md}}' };
    const out = await prepareSources('{{md https://e.test/h1}}{{md https://e.test/h2}}', { fetcher: async (u) => bodies[u] ?? null });
    expect(md.render(out, { markdownBasePath: dir })).not.toContain('PRIVATE-NOTES-SECRET');
  });
});

describe('prepareSources — the default fetcher re-checks redirects (H3)', () => {
  const servers: Server[] = [];
  async function serve(handler: (path: string) => { status: number; headers?: Record<string, string>; body?: string }): Promise<string> {
    const server = createServer((req, res) => {
      const r = handler(req.url ?? '/');
      res.writeHead(r.status, r.headers);
      res.end(r.body ?? '');
    });
    servers.push(server);
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    const addr = server.address() as { port: number };
    return `127.0.0.1:${addr.port}`;
  }
  afterAll(() => { for (const s of servers) s.close(); });

  it('[M.15] a redirect to a host off the allowlist leaves the directive in place', async () => {
    const internal = await serve(() => ({ status: 200, body: 'INTERNAL-METADATA-SECRET' }));
    const allowed = await serve((path) => path === '/doc.md'
      ? { status: 200, body: 'Allowed doc.' }
      : path === '/same'
        ? { status: 302, headers: { location: '/doc.md' } }
        : { status: 302, headers: { location: `http://${internal}/latest` } });
    const off = `{{md http://${allowed}/out}}`;
    expect(await prepareSources(off, { allowedHosts: [allowed] })).toBe(off);
    // A redirect that stays on an allowed host is followed.
    expect(await prepareSources(`{{md http://${allowed}/same}}`, { allowedHosts: [allowed] })).toBe('Allowed doc.');
  });
});

describe('scanning — directive bodies are opaque (M2)', () => {
  const later = '{{nyml\nkind: meta\ntitle: Later\n}}';
  const unbalanced = ['```', '~~~', '$$', '<!--', '<pre>', '<script>'];
  it.each(unbalanced)('[M.10] an unbalanced %s inside a nyml value hides no later block', (line) => {
    const src = `{{nyml\nkind: element\ncontent: |\n  ${line}\n}}\n\n${later}`;
    expect(scanNymlBlocks(src)).toHaveLength(2);
    expect(extractDocMeta(src).meta.title).toBe('Later');
  });
  it('[M.10] a <div> line in a body does not swallow a block that follows without a blank line', () => {
    const src = `{{nyml\nkind: element\ncontent: |\n  <div>\n}}\n${later}`;
    expect(scanNymlBlocks(src).map((b) => b.kind)).toEqual(['element', 'meta']);
  });
  it('[M.11] a URL include after such a body is still expanded', async () => {
    const src = '{{nyml\nkind: element\ncontent: |\n  ```\n}}\n\n{{md https://e.test/a}}';
    const out = await prepareSources(src, { fetcher: async () => 'Fetched.' });
    expect(out.endsWith('Fetched.')).toBe(true);
    expect(maskInertMarkdown(src)).toContain('{{md https://e.test/a}}');
  });
  it('[M.1] CR-only and BOM sources locate the same blocks', () => {
    const lf = 'Intro\n\n{{nyml\nkind: meta\ntitle: T\n}}\n\nBody';
    const cr = lf.replace(/\n/g, '\r');
    const bom = '\uFEFF' + lf;
    for (const src of [cr, bom]) {
      const [block] = scanNymlBlocks(src);
      expect(block.fields.title).toBe('T');
      expect(src.slice(block.start, block.end).startsWith('{{nyml')).toBe(true);
      expect(src.slice(block.start, block.end).endsWith('}}')).toBe(true);
    }
  });
});

describe('scanning and rendering stay linear (H4)', () => {
  it('[M.5] mid-line nyml mentions scan linearly', () => {
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `x {{nyml }} ${i}`).join('\n');
    const small = lines(4000);
    const large = lines(16000);
    const [r, ms] = ratio(() => scanNymlBlocks(small), () => scanNymlBlocks(large));
    expect(r).toBeLessThan(8);
    expect(ms).toBeLessThan(5000); // was 121 s at 1.5 MB
  }, 120_000);
  it('[M.5] openers inside code spans before a far closer scan linearly', () => {
    const doc = (n: number) => Array.from({ length: n }, () => 'see `{{nyml` here').join('\n') + '\n}}';
    const small = doc(2500);
    const large = doc(10000);
    const [r, ms] = ratio(() => extractDocMeta(small), () => extractDocMeta(large));
    expect(r).toBeLessThan(8);
    expect(ms).toBeLessThan(5000);
  }, 120_000);
  // Percent-encoded URLs (the audit's 23 s case), plain ASCII URLs (the
  // per-link "any CJK here?" scan) and URLs cut before CJK (one splice each).
  const paragraphs: Array<[string, (i: number) => string]> = [
    ['percent-encoded', (i) => `https://example.com/%E4%B8%AD%E6%96%87/${i}`],
    ['plain ASCII', (i) => `https://example.com/abc/${i}`],
    ['cut before CJK', (i) => `https://a.com/${i}获取`],
  ];
  it.each(paragraphs)('[R.5] a paragraph of %s URLs renders linearly', (_name, url) => {
    const para = (n: number) => Array.from({ length: n }, (_, i) => url(i)).join('\n');
    const small = para(1000);
    const large = para(4000);
    const [r, ms] = ratio(() => md.render(small), () => md.render(large));
    expect(r).toBeLessThan(8);
    expect(ms).toBeLessThan(15_000); // a backstop; the ratio is the claim
  }, 120_000);
});

describe('render — positional URL matching (M3)', () => {
  // Each URL links exactly as it would on its own: its decoded twin elsewhere in
  // the paragraph (or in a code span) must not change where it is cut.
  it('[R.3] a percent-encoded URL keeps its whole path when its decoded twin appears elsewhere', () => {
    const a = 'https://x.com/a%E4%B8%AD';
    const b = 'https://x.com/a中';
    expect(md.renderInline(`${a} 和 ${b}`)).toBe(`${md.renderInline(a)} 和 ${md.renderInline(b)}`);
    expect(md.renderInline(`${b} 和 ${a}`)).toBe(`${md.renderInline(b)} 和 ${md.renderInline(a)}`);
    expect(md.renderInline(a)).toBe('<a href="https://x.com/a%E4%B8%AD">https://x.com/a中</a>');
  });
  it('[R.3] … also when the twin is inside a code span', () => {
    const html = md.renderInline('`https://x.com/a中` 写作 https://x.com/a%E4%B8%AD');
    expect(html).toBe('<code>https://x.com/a中</code> 写作 <a href="https://x.com/a%E4%B8%AD">https://x.com/a中</a>');
  });
});

describe('doc-meta island (L6)', () => {
  const island = (uid: string, attr = 'id') => `<script type="application/orz-meta+json" ${attr}="orz-meta">{"uid":"${uid}"}</script>`;
  it('[M.17] only the head island counts; a body island cannot supply the document\'s metadata', () => {
    expect(parseDocMetaIsland(`<html><head>${island('real')}</head><body>${island('spoof')}</body></html>`)?.uid).toBe('real');
    expect(parseDocMetaIsland(`<html><head><title>x</title></head><body>${island('spoof')}</body></html>`)).toBeNull();
  });
  it('[M.17] the id must be the attribute itself', () => {
    expect(parseDocMetaIsland(`<head>${island('x', 'data-id')}</head>`)).toBeNull();
  });
});
