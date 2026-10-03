/**
 * Round-21 regressions, bound to the claims they falsified. Real-browser
 * covering checks live in tests/browser-copy.test.ts.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { md, prepareSources, MAX_CHEM_TOTAL } from '../../src/index';
import { browserRuntimeScript } from '../../src/runtime';
import { normalize } from '../helpers/normalize';

const one = (f: string) => ({ fetcher: async () => f });
const ids = (html: string) => [...html.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);

describe('round 21 — half A: per-render budgets are measured, not estimated', () => {
  const host = 'Intro\n\n{{md https://x.test/a.md}}\n\nHost math $E=mc^2$ and {{qr HOSTQR}}\n';
  const tex = '$' + 'x+'.repeat(4700) + 'x$';
  const big = 'A'.repeat(1500);
  const cases: Array<[string, string]> = [
    ['math in spoil labels (H1)', Array.from({ length: 110 }, () => `::: spoil ${tex}\nbody\n:::`).join('\n\n')],
    ['QR codes with args in labels (H2)', Array.from({ length: 12 }, (_, i) => `::: spoil {{qr[a] ${big}${i}}}\nbody\n:::`).join('\n\n')],
    ['QR codes whose body holds "}" (H2)', Array.from({ length: 12 }, (_, i) => `::: spoil {{qr a}${big}${i}}}\nbody\n:::`).join('\n\n')],
    ['CJK QR codes (H3)', Array.from({ length: 5 }, (_, i) => `{{qr ${'中'.repeat(499)}${i}}}`).join('\n\n')],
  ];
  it.each(cases)('[M.16] an include that would push the host past a cap is refused: %s', async (_name, fetched) => {
    const out = await prepareSources(host, one(fetched));
    expect(out).toBe(host);
    const html = md.render(out);
    expect(html).toContain('class="qrcode"');
    expect(html).not.toContain('too much math');
  }, 120_000);

  const covering = ['$a' + '\\!'.repeat(6) + 'b$', '::: spoil $\\kern{0-30em}x$\nbody\n:::', '{{sp $\\raisebox{9em}{x}$}}', '$\\kern{0-30em}\\rule{30em}{1.2em}$', '$\\tmspace-{540mu}{30em}\\rule{30em}{1.2em}$', '$\\kern{{-30em}}\\rule{30em}{1.2em}$', '$\\mathrlap{\\rule{30em}{1em}}$', '$\\smash{x}$'];
  it.each(covering)('[M.16] fetched math that paints outside its box is refused, judged on KaTeX output (H4): %s', async (f) => {
    expect(await prepareSources(host, one(f))).toBe(host);
  });
  it('[M.16] ordinary math is still included, also where KaTeX itself kerns or laps (H4)', async () => {
    const out = await prepareSources(host, one('$P_1 + x_{ij} \\Longrightarrow y \\neq z \\coloneqq w$ and $\\int f\\,dA \\kern1em x$ and $\\operatorname{softmax}\\!\\left(\\frac{QK}{d}\\right)V$'));
    expect(out).not.toContain('{{md https');
  });

  it('[M.9] spellings of one file are one read, and a refused body is not kept (H5)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orz-r21-'));
    writeFileSync(join(dir, 'big.md'), 'B'.repeat(3_000_000));
    for (let i = 0; i < 8; i++) symlinkSync(join(dir, 'big.md'), join(dir, `link${i}.md`));
    const env: Record<string, unknown> = { markdownBasePath: dir, markdownIncludeRoot: dir };
    const html = md.render(Array.from({ length: 8 }, (_, i) => `{{md link${i}.md}}`).join('\n\n'), env);
    expect(env['__orzIncludeRead']).toBe(3_000_000);
    expect(html.length).toBeLessThan(3_100_000);
  });

  it('[M.18] bodies refused for size are charged to the work budget, and spent work fetches nothing (H6)', async () => {
    let calls = 0;
    const src = Array.from({ length: 300 }, (_, i) => `{{md https://x.test/${i}}}`).join('\n\n');
    await prepareSources(src, { maxSize: 1000, fetcher: async () => { calls++; return 'x'.repeat(2000); } });
    expect(calls).toBeLessThanOrEqual(3);
  });

  it('[R.7] KaTeX output per render is bounded (H7)', () => {
    const arr = '$\\begin{array}{c}' + 'a\\\\'.repeat(2400) + '\\end{array}$';
    const src = Array.from({ length: 100 }, () => arr).join('\n\n');
    const t0 = performance.now();
    const html = md.render(src);
    expect(html.length).toBeLessThan(80_000_000);
    expect(performance.now() - t0).toBeLessThan(40_000);
  }, 120_000);

  it('[M.18] a fetched citation of a host footnote label is refused (M1)', async () => {
    const h = 'Intro.\n\n{{md https://x.test/a.md}}\n\nHost cites first[^a] and second[^b].\n\n[^a]: A.\n[^b]: B.\n';
    expect(await prepareSources(h, one('Fetched paragraph cites[^b].'))).toBe(h);
  });

  it.each(['# orz family\n\nText.', '## Chart\n\nText.', '## KaTeX\n\nText.'])('[M.16] an ordinary title is not a reserved id (M2): %s', async (f) => {
    const out = await prepareSources('{{md https://x.test/a.md}}\n\nHost.', one(f));
    expect(out).not.toContain('{{md https');
  });
  it.each(['## hljs\n\nText.', '# orzmd\n\nText.', '# fn1\n\nText.', '## Real {{attrs[#orzPosterReadiness]}}\n\nText.'])(
    '[M.16] an id that shadows a page global or a renderer id is still refused (M2): %s', async (f) => {
      const h = '{{md https://x.test/a.md}}\n\nHost.';
      expect(await prepareSources(h, one(f))).toBe(h);
    });

  it('[R.6] the TOC byte cap counts what is written (LOW)', () => {
    const html = md.render('{{toc}}\n\n' + Array.from({ length: 50 }, () => '## ' + '&'.repeat(100)).join('\n\n'));
    expect(html).toContain('&amp;');
  });
});

describe('round 21 — half B', () => {
  it('[R.6] headings that pin their own id stay linear (H1)', () => {
    const doc = (n: number) => Array.from({ length: n }, (_, i) => `## Exercises{{attrs[#blk-${i.toString(36).padStart(8, '0')}]}}`).join('\n\n');
    const t0 = performance.now();
    md.render(doc(16_000));
    expect(performance.now() - t0).toBeLessThan(10_000); // was 75 s
  }, 60_000);
  it('[R.6] an own-id heading spends its slug as 1.6.3 did; hidden or overridden ids reserve nothing (M1)', () => {
    expect(ids(md.render('# Foo {{attrs[#bar]}}\n\npara {{attrs[#foo]}}\n\n# Foo\n'))).toEqual(['bar', 'foo', 'foo-1']);
    expect(ids(md.render('# Intro\n\n- item {{attrs[#intro]}}\n\n# Bar\n'))).toEqual(['intro', 'bar']);
    // `#a #b` writes only b: a stays free for the heading.
    expect(ids(md.render('# A\n\npara {{attrs[#a #b]}}\n\n# B\n'))).toEqual(['a', 'b', 'b-1']);
  });
  it('[R.7] {{youtube ID?t=42}} keeps its start time; an invalid body stays visible as its directive (M2)', () => {
    expect(md.render('{{youtube dQw4w9WgXcQ?t=42}}')).toContain('embed/dQw4w9WgXcQ?start=42"');
    expect(md.render('{{youtube https://youtu.be/dQw4w9WgXcQ?t=1m30s}}')).toContain('embed/dQw4w9WgXcQ?start=90"');
    const bad = md.render('{{youtube https://www.youtube.com/playlist?list=PL1}}');
    expect(bad).not.toContain('<iframe');
    expect(bad).toContain('data-md="{{youtube https://www.youtube.com/playlist?list=PL1}}"');
  });
  it('[R.7] references a host seeds in env survive; those a render defined do not (M3)', () => {
    const env = { references: { GLOSS: { href: 'https://g.example/x' } } };
    expect(md.render('[glossary][gloss]', env)).toContain('href="https://g.example/x"');
    md.render('[r]: http://evil.example', env);
    const again = md.render('[glossary][gloss] and [r]', env);
    expect(again).toContain('href="https://g.example/x"');
    expect(again).not.toContain('evil.example');
  });
  it('[R.7] the chem budget counts \\ce/\\pu arguments only (L1)', () => {
    // Formulas that only mention \ce once are charged for that argument.
    const f = '$$' + 'x+'.repeat(4000) + '\\ce{H2O}$$';
    expect(md.render(Array.from({ length: 7 }, () => f).join('\n\n'))).not.toContain('too much math');
    expect(MAX_CHEM_TOTAL).toBeGreaterThanOrEqual(100_000);
  });
});

describe('round 21 — half B: copy', () => {
  type DomDoc = { createElement(tag: string): { className: string; innerHTML: string } };
  let dom: DomDoc;
  let e2m: (n: unknown) => string;
  beforeAll(async () => {
    const { Window } = await import('happy-dom');
    dom = new Window().document as unknown as DomDoc;
    (0, eval)(browserRuntimeScript);
    e2m = (globalThis as unknown as { OrzMarkdownRuntime: { elementToMarkdown: typeof e2m } }).OrzMarkdownRuntime.elementToMarkdown;
  });
  const copyOf = (src: string) => { const el = dom.createElement('div'); el.className = 'markdown-body'; el.innerHTML = md.render(src); return e2m(el); };
  it.each(['https://x.y/中`$5`', 'https://x.y/中[$5]', 'https://x.y/中?a=$5**', 'https://x.y/中?q=$5_'])(
    '[C.9] a linked URL holding "$" copies without turning into math (L2): %s', (src) => {
      const copied = copyOf(src);
      expect(normalize(md.render(copied))).toBe(normalize(md.render(src)));
    });
  it('[C.9] an invalid youtube directive copies back as itself (M2)', () => {
    expect(copyOf('{{youtube a..b}}').trim()).toBe('{{youtube a..b}}');
  });
});
