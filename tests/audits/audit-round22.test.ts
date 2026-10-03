/**
 * Round-22 regressions, bound to the claims they falsified or added.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { md, prepareSources, extractDocMeta } from '../../src/index';

const one = (f: string) => ({ fetcher: async () => f });
const host = 'Intro\n\n{{md https://x.test/a.md}}\n\nAfter\n';

describe('round 22: refused raw HTML blocks in fetched text are ignored (owner decision)', () => {
  const blocks: Array<[string, string]> = [
    ['script', '<script>alert(1)</script>'],
    ['multi-line script', '<script>\nlet a = 1;\n\nalert(a)\n</script>'],
    ['style', '<style>body{display:none}</style>'],
    ['svg', '<svg onload="alert(1)"><circle r="9"/></svg>'],
    ['iframe', '<iframe src="https://evil.test"></iframe>'],
    ['form', '<form action="https://evil.test"><input name=q></form>'],
    ['class attribute', '<div class="qrcode-overlay">\ncover\n</div>'],
    ['event handler', '<img src="x.png" onerror="alert(1)">'],
    ['javascript: link', '<a href="javascript:alert(1)">x</a>'],
    ['stray end tag', '</div>'],
  ];
  it.each(blocks)('[M.20] %s: the block is dropped, the rest renders', async (_n, block) => {
    const out = await prepareSources(host, one(`# Fetched\n\nKept *text*.\n\n${block}\n\nMore kept.`));
    expect(out).not.toContain('{{md https');
    expect(out).toContain('Kept *text*.');
    expect(out).toContain('More kept.');
    const html = md.render(out);
    expect(html).not.toMatch(/<script|<style|<svg|<iframe|<form|onerror|onload|javascript:|qrcode-overlay/i);
    expect(html).toContain('<p>After</p>');
  });

  it('[M.20] allowed layout HTML is kept as written', async () => {
    const out = await prepareSources(host, one('<div align="center">\n\n**Title**\n\n</div>\n\n<details><summary>More</summary>\n\nHidden\n\n</details>'));
    expect(out).toContain('<div align="center">');
    expect(out).toContain('<details><summary>More</summary>');
  });

  it('[M.20] an element opened in a dropped block and closed later is dropped whole', async () => {
    const out = await prepareSources(host, one('<div class="x">\n\nInside\n\n</div>\n\nOutside'));
    expect(out).not.toContain('<div');
    expect(out).not.toContain('</div>');
    expect(out).toContain('Inside');
    expect(out).toContain('Outside');
  });

  it('[M.20] an include holding only refused HTML is treated as an empty file (directive kept)', async () => {
    expect(await prepareSources(host, one('<script>alert(1)</script>'))).toBe(host);
  });

  it.each(['Text <script>alert(1)</script> more', 'Text <span class="qrcode-overlay">x</span>', 'Open <b>bold', '## Head <svg onload="alert(1)">', '| a | b |\n|---|---|\n| <iframe src=x></iframe> | y |'])(
    '[M.20] refused raw HTML inside a paragraph, heading or table drops that block: %j', async (block) => {
      const out = await prepareSources(host, one(`Kept.\n\n${block}\n\nAlso kept.`));
      expect(out).toContain('Kept.');
      expect(out).toContain('Also kept.');
      expect(md.render(out)).not.toMatch(/<script|<iframe|<svg|qrcode-overlay|<b>/i);
    });

  it('[M.20] other refusals (math, containers, span classes) still refuse the whole include', async () => {
    for (const f of ['Text $\\smash{x}$', '::: evil-class\nx\n:::', 'A {{sp[qrcode-overlay] x}}']) {
      expect(await prepareSources(host, one(`Kept.\n\n${f}`))).toBe(host);
    }
  });

  it('[M.20] dropping a block cannot uncover a local include or reach the host', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orz-m20-'));
    writeFileSync(join(dir, 'secret.md'), 'SECRET-TEXT');
    for (const f of ['{{\n<script>x</script>\nmd ./secret.md}}', '{{md\n<script>x</script>\n./secret.md}}', '{{md ./secret.md\n<script>x</script>\n}}']) {
      const out = await prepareSources(host, one(f));
      expect(md.render(out, { markdownBasePath: dir, markdownIncludeRoot: dir })).not.toContain('SECRET-TEXT');
    }
    const out2 = await prepareSources(host, one('```\n<script>x</script>'));
    expect(md.render(out2)).toContain('<p>After</p>');
  });

  it.each(['::: spoil <img src=x onerror="alert(1)">\nbody\n:::', '::: spoil <div>\nbody\n:::'])('[M.20] a spoil label with refused HTML drops its container: %j', async (block) => {
    const out = await prepareSources(host, one(`Kept.\n\n${block}\n\nAlso kept.`));
    expect(out).toContain('Kept.');
    expect(out).toContain('Also kept.');
    expect(out).not.toMatch(/spoil|onerror|<div/);
  });

  it('[M.20] blocks in lists and quotes are dropped too', async () => {
    const out = await prepareSources(host, one('- one\n- <script>x</script>\n- three\n\n> <style>p{}</style>\n> quoted'));
    expect(out).not.toMatch(/script|style/);
    expect(out).toContain('three');
    expect(out).toContain('quoted');
    expect(md.render(out)).toContain('<p>After</p>');
  });

  const meta = '```\n{{nyml\nkind: meta\ntitle: Evil\nauthor: Mallory\n}}\n```';
  it.each([`> ::: spoil <b>x\n> in\n${meta}`, `- ::: spoil <b>x\n  inside\n${meta}`, `1. ::: spoil <b>x\n   in\n${meta}`])(
    '[M.20] removing an auto-closed spoil never removes the line after it, nor uncovers metadata (H1): %j', async (f) => {
      const h = '# My README\n\n{{md https://x.test/a.md}}\n\nAfter\n';
      expect(extractDocMeta(await prepareSources(h, one(f))).meta).toEqual({});
    });
  it('[M.20] the line after an auto-closed spoil in a list item is kept (L1)', async () => {
    const out = await prepareSources(host, one('- ::: spoil <b>x\n  inside\nThis line is not in the container\n\nTail.'));
    expect(out).toContain('This line is not in the container');
    expect(out).toContain('Tail.');
  });
  it('[M.20] a removal that uncovers a metadata block drops it', async () => {
    const out = await prepareSources(host, one('<script>x</script>\n{{nyml\nkind: meta\ntitle: Evil\n}}\n\nBody'));
    expect(extractDocMeta(out).meta).toEqual({});
  });
});

describe('round 22 — half B', () => {
  it.each(['请访问www.baidu.com获取更多', 'see www.example.com获取'])('[R.3] a www host glued to CJK prose links the host (M1): %s', (src) => {
    expect(md.renderInline(src)).toMatch(/<a href="http:\/\/www\.(baidu|example)\.com">www\.(baidu|example)\.com<\/a>获取/);
  });
  it.each(['见https://a.com/x——更多说明', '见https://a.com/x……'])('[R.3] a Chinese dash or ellipsis ends a URL (L5): %s', (src) => {
    expect(md.renderInline(src)).toContain('<a href="https://a.com/x">https://a.com/x</a>');
  });
  it.each(['Kept.\n\nBad <b>x\n---\n\nMore.', 'Kept.\n\nBad <b>x\n===\n\nMore.', 'Kept para\n<script>x</script>\nBad <b>x\n---\n\nMore.'])(
    '[M.20] a dropped setext heading takes its underline (M2): %j', async (f) => {
      const html = md.render(await prepareSources(host, one(f)));
      expect(html).not.toMatch(/<hr>|===|<h2/);
      expect(html).toContain('More.');
    });
  it('[M.20] refused HTML in a table header row drops the whole table (L1)', async () => {
    const html = md.render(await prepareSources(host, one('| <b>a | b |\n|---|---|\n| c | d |\n\nMore.')));
    expect(html).not.toMatch(/\||—/);
    expect(html).toContain('More.');
  });
  it('[R.7] a reference the host adds to a reused env between renders survives (L4)', () => {
    const env: { references: Record<string, unknown> } = { references: { A: { href: 'https://a.example', title: '' } } };
    md.render('[x]: https://doc.example\n\n[x]', env);
    env.references.B = { href: 'https://b.example', title: '' };
    const html = md.render('[a] [b] [x]', env);
    expect(html).toContain('href="https://a.example"');
    expect(html).toContain('href="https://b.example"');
    expect(html).not.toContain('doc.example');
  });
});

