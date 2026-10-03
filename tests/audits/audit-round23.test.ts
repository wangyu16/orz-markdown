/**
 * Round-23 regressions, bound to the claims they falsified.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { md, prepareSources } from '../../src/index';

const one = (f: string) => ({ fetcher: async () => f });

describe('round 23 — half A: the footnote section and the host\'s own file includes', () => {
  it('[M.16] an include\'s reference definitions cannot link text in a host footnote (F1)', async () => {
    const host = 'Intro\n\n{{md https://x.test/a.md}}\n\nAfter[^1]\n\n[^1]: Ask [support] or see ![logo]\n';
    const out = await prepareSources(host, one('Fetched text.\n\n[support]: https://evil.test/phish\n[logo]: https://evil.test/pixel.png'));
    expect(out).toBe(host);
  });
  it('[M.16] an include cannot spend the link budget host footnotes need (F2)', async () => {
    const U = 'https://example.com/' + 'h'.repeat(1000);
    const host = `[h]: ${U}\n\nIntro\n\n{{md https://x.test/a.md}}\n\nAfter[^1]\n\n[^1]: ${Array(10).fill('[h]').join(' ')}\n`;
    const body = `[r]: https://e.com/${'r'.repeat(9986)}\n\n${Array(104).fill('[r]').join(' ')}`;
    expect(md.render(await prepareSources(host, one(body)))).not.toContain('href=""');
  });
  it('[M.16] ordinary includes next to host footnotes (labelled and inline) are still accepted', async () => {
    const host = 'Intro[^1] and ^[an inline [note](https://n.example)]\n\n{{md https://x.test/a.md}}\n\n[^1]: Host note [link](https://h.example).\n';
    const out = await prepareSources(host, one('Fetched[^f] and ^[its own inline note].\n\n[^f]: Fetched note.'));
    expect(out).not.toContain('{{md https');
    const html = md.render(out);
    expect(html).toContain('Host note <a href="https://h.example">link</a>');
    expect(html).toContain('Fetched note.');
  });

  const dir = mkdtempSync(join(tmpdir(), 'orz-r23-'));
  writeFileSync(join(dir, 'local.md'), '# Local\n\nAsk [support] now[^n]\n\n[^n]: host note\n');
  const includeEnv = { markdownBasePath: dir, markdownIncludeRoot: dir };
  const evil = '# Local\n\n[support]: https://evil.test/phish\n\nx[^n]\n\n[^n]: evil note';
  const hosts = ['Intro [go](#local)\n\n{{md https://x.test/a.md}}\n\n{{md ./local.md}}\n', 'Intro\n\n{{md ./local.md}}\n\n{{md https://x.test/a.md}}\n'];
  it.each(hosts)('[M.16] a host with a live file include keeps its URL directives without includeEnv (F3): %j', async (host) => {
    expect(await prepareSources(host, one('Harmless.'))).toBe(host);
  });
  it.each(hosts)('[M.16] with includeEnv, an include that changes the host\'s file-included text is refused (F3): %j', async (host) => {
    expect(await prepareSources(host, { ...one(evil), includeEnv })).toBe(host);
  });
  it('[M.16] with includeEnv, a harmless include next to a file include is accepted', async () => {
    const out = await prepareSources(hosts[1], { ...one('Harmless fetched text.'), includeEnv });
    expect(out).toContain('Harmless fetched text.');
    expect(md.render(out, { ...includeEnv })).toContain('host note');
  });
  it('[M.20] a removed spoil that auto-closed in a quote keeps the outer container\'s closer (F4)', async () => {
    const host = 'Intro\n\n{{md https://x.test/a.md}}\n\nAfter\n';
    const out = await prepareSources(host, one('::: info\n> ::: spoil <script>\n> x\n:::\n\nOutside'));
    expect(out).toContain('Outside');
    expect(out).toContain('::: info');
    expect(out).not.toContain('script');
  });
  it('[R.7] a reference the host replaces in a reused env between renders survives (F5)', () => {
    const env: { references: Record<string, unknown> } = { references: {} };
    md.render('[a]\n\n[a]: /one', env);
    env.references.A = { href: '/host', title: '' };
    expect(md.render('[a]', env)).toContain('href="/host"');
  });
});

describe('round 23 — half B: CJK next to bare hosts', () => {
  it.each(['访问 github.com获取更多', '详情见github.com获取', 'see github.com😀'])('[R.3] a host glued to CJK or an emoji links the host (M1): %s', (src) => {
    expect(md.renderInline(src)).toContain('<a href="http://github.com">github.com</a>');
  });
  it.each(['请访问ｗｗｗ.baidu.com', '请登录ｗｗｗ.example.com查看'])('[R.3] Chinese running into full-width Latin is not linked into a punycoded host (L1): %s', (src) => {
    expect(md.renderInline(src)).not.toContain('<a');
  });
  it('[R.3] IDN hosts still link', () => {
    expect(md.renderInline('见 百度.com 和 www.百度.com')).toMatch(/<a href="http:\/\/xn--[^"]*\.com">百度\.com<\/a>/);
  });
});

