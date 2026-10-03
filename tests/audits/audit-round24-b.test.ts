/** Round-24 half B reproductions (temporary). Each `it` asserts the EXPECTED behaviour and fails today. */
import { describe, it, expect } from 'vitest';
import { md, prepareSources } from '../../src/index';
import { browserRuntimeScript } from '../../src/runtime.js';
const D = '{{md https://x.test/a.md}}';
const one = (f: string) => ({ fetcher: async () => f });

describe('r24b', () => {
  it.each([['see ソニー.jp now', 'ソニー.jp'], ['see ラーメン.com', 'ラーメン.com'], ['see メール.example.com', 'メール.example.com'], ['详情 ニュース.jp/a', 'ニュース.jp/a']])(
    'F1 [R.3] a katakana IDN label holding ー links the whole label, not a different host: %s', (src, label) => {
      const html = md.renderInline(src);
      expect(html).toContain(`>${label}</a>`); // today: >ー.jp</a>, >ーメン.com</a> … (a different punycode host)
    });
  it('F2 [M.16/M.11] an include inside a host footnote definition is accepted (round 22 accepted it)', async () => {
    const host = 'Intro[^1]\n\n[^1]: Host note.\n\n    ' + D + '\n\nAfter\n';
    expect(await prepareSources(host, one('Fetched **x**.'))).toContain('    Fetched **x**.');
  });
  it('F3 [M.16] a {{toc}} in a host footnote does not refuse includes with headings (toc contents are not compared in the body)', async () => {
    const host = 'Intro[^1]\n\n## H\n\n' + D + '\n\n[^1]: {{toc}}\n';
    expect(await prepareSources(host, one('## Fetched'))).not.toContain(D);
    expect(await prepareSources('Intro\n\n{{toc}}\n\n## H\n\n' + D + '\n', one('## Fetched'))).not.toContain(D); // body: accepted
  });
  it.each(['{{md}}', '{{md }}', '{{md ftp://y.test/b.md}}', '{{md file:///etc/b.md}}'])('F4 [M.16] %s reads no file, so it does not gate URL includes', async (dir) => {
    expect(await prepareSources('Intro\n\n' + dir + '\n\n' + D + '\n', one('Fetched.'))).not.toContain(D);
  });
  it('F5 [M.11] an include on a footnote definition line is kept, never moved out of the note', async () => {
    const out = await prepareSources('Intro[^1]\n\n[^1]: ' + D + '\n\nAfter\n', one('Fetched.'));
    expect(out).toContain('[^1]: ' + D); // kept in place: splitting would move the text out of the note
  });
  it('F6 [M.16] a nyml block in a host footnote keeps its island id next to an include with a nyml block', async () => {
    const host = 'Intro[^1]\n\n' + D + '\n\n[^1]: note\n\n    {{nyml\n    k: v\n    }}\n';
    const out = await prepareSources(host, one('{{nyml\na: b\n}}'));
    const hostOwn = md.render(host).match(/<script[^>]*id="nyml-data"[^>]*>[^<]*/)?.[0];
    expect(md.render(out)).toContain(hostOwn!); // today: the include's block is nyml-data, the host's nyml-data-2
  });
  it('F7 [R.3] a whole non-ASCII label with full-width digits is an IDN host, as plain markdown-it links it', () => {
    expect(md.renderInline('see 東京２０２０.com now')).toContain('<a ');
  });
});

describe('trust model (owner decision 2026-10-02): includes come from trusted sources', () => {
  const src = 'Intro\n\n{{md https://x.test/a.md}}\n';
  const stub = () => {
    const calls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (u: string | URL) => { calls.push(String(u)); return new Response('Fetched.'); }) as typeof fetch;
    return { calls, restore: () => { globalThis.fetch = real; } };
  };
  it('[M.21] outside a browser, nothing is fetched without allowedHosts or a fetcher', async () => {
    const s = stub();
    try {
      expect(await prepareSources(src)).toBe(src);
      expect(await prepareSources(src, { allowedHosts: [] })).toBe(src);
      expect(s.calls).toEqual([]);
    } finally { s.restore(); }
  });
  it('[M.21] outside a browser, allowedHosts or a fetcher enables fetching', async () => {
    const s = stub();
    try {
      expect(await prepareSources(src, { allowedHosts: ['x.test'] })).toContain('Fetched.');
      expect(await prepareSources(src, { fetcher: async () => 'Own.' })).toContain('Own.');
    } finally { s.restore(); }
  });
  it('[M.21] in a page (document present), the author\'s URL is the trust decision', async () => {
    const s = stub();
    (globalThis as { document?: unknown }).document = {};
    try {
      expect(await prepareSources(src)).toContain('Fetched.');
    } finally { delete (globalThis as { document?: unknown }).document; s.restore(); }
  });
});
