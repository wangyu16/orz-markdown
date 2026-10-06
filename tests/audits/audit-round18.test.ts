/**
 * Round-18 regressions, bound to the claims they falsified.
 */
import { describe, it, expect } from 'vitest';
import { md, extractDocMeta, prepareSources } from '../../src/index';

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

describe('round 18 — half A: linear again', () => {
  it('[M.18] file-include and args-form directives are located linearly (H1)', async () => {
    const doc = (n: number) => Array.from({ length: n }, () => '{{md chapter.md}}').join('\n\n');
    expect(await ratio(() => prepareSources(doc(2000), { fetcher: async () => null }), () => prepareSources(doc(8000), { fetcher: async () => null }))).toBeLessThan(8);
  }, 120_000);
  it('[M.5] glued meta followers with unclosed args are linear (H2)', async () => {
    const doc = (n: number) => '{{nyml kind: meta}}{{nyml['.repeat(n) + ']}}';
    expect(await ratio(() => extractDocMeta(doc(500)), () => extractDocMeta(doc(2000)))).toBeLessThan(8);
  }, 120_000);
  it('[M.9] many file includes splice linearly (H3)', async () => {
    const env = { markdownBasePath: '/', readFile: () => 'Included para.' };
    const doc = (n: number) => Array.from({ length: n }, () => '{{md inc.md}}').join('\n\n');
    expect(await ratio(() => md.render(doc(1000), env), () => md.render(doc(4000), env))).toBeLessThan(8);
  }, 120_000);
  it('[R.7] many {{toc}} blocks cannot multiply the output without bound (H4)', () => {
    const n = 2000;
    const html = md.render('{{toc}}\n'.repeat(n) + '# h\n'.repeat(n));
    expect(html.length).toBeLessThan(20_000_000); // was 219 MB
  }, 60_000);
  it('[R.7] QR output per render is bounded (H5)', () => {
    const html = md.render(Array.from({ length: 60 }, (_, i) => `{{qr ${'a'.repeat(1500)}${i}}}`).join('\n\n'));
    expect(html.length).toBeLessThan(12_000_000);
    expect(html).toContain('{{qr aaa');
  }, 60_000);
  it('[M.5] many footnotes render linearly (H6)', async () => {
    const doc = (n: number) => Array.from({ length: n }, (_, i) => `t^[x${i}] and[^d${i}].\n\n[^d${i}]: def ${i}`).join('\n\n');
    expect(await ratio(() => md.render(doc(1000)), () => md.render(doc(4000)))).toBeLessThan(8);
  }, 120_000);
  it('[M.5] many {{attrs}} markers and keys are linear (M1)', async () => {
    const markers = (n: number) => 'Para ' + Array.from({ length: n }, (_, i) => `{{attrs[.c${i}]}}`).join(' ');
    expect(await ratio(() => md.render(markers(4000)), () => md.render(markers(16000)))).toBeLessThan(8); // sizes large enough that load noise does not dominate
  }, 120_000);
  it('[M.16] deep raw nesting and family globals are refused in fetched text (L1, L3)', async () => {
    const host = '{{md https://e.test/a}}\n\nHOST-AFTER';
    for (const f of ['<div>'.repeat(40) + 'x' + '</div>'.repeat(40), '<div id="orzPosterReadiness">x</div>']) {
      expect(await prepareSources(host, { fetcher: async () => f })).toBe(host);
    }
  });
});

import { readFileSync, readdirSync } from 'node:fs';
import { KATEX_VERSION } from '../../src/version';
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
function copyOf(src: string): string {
  const root = dom.createElement('div');
  root.className = 'markdown-body';
  root.innerHTML = md.render(src);
  return e2m(root);
}

describe('round 18 — half B', () => {
  it('[M.5] many headings with one title render linearly, with the same ids (H1)', async () => {
    const doc = (n: number) => '## Same\n\n'.repeat(n);
    expect(await ratio(() => md.render(doc(2000)), () => md.render(doc(8000)))).toBeLessThan(8);
    const ids = [...md.render('## A\n\n## A\n\n## A 1\n\n## A\n\n## {{emoji smile}}\n\n## {{emoji smile}}').matchAll(/id="([^"]*)"/g)].map((m) => m[1]);
    expect(ids).toEqual(['a', 'a-1', 'a-1-1', 'a-2', 'section', 'section-1']);
  }, 120_000);

  it.each(['{{qr {"ssid":"x"} }}', 'Text {{sp[red] set {x} }} end', '{{smiles C{1} }}'])('[C.11] a body ending in "}" copies back as the same directive (M1): %s', (src) => {
    expect(normalize(md.render(copyOf(src)))).toBe(normalize(md.render(src)));
  });

  it('[C.8] private-use characters in text, code and destinations survive copy (M3)', () => {
    for (const src of ['a  b ', '`code `', '[l](https://a.com/%EE%80%80)']) {
      expect(normalize(md.render(copyOf(src)))).toBe(normalize(md.render(src)));
    }
  });

  it('[R.7] an included file with a BOM keeps its first line (L2)', () => {
    const html = md.render('{{md inc.md}}', { markdownBasePath: '/', readFile: () => '﻿# BOM Head\n\nText' });
    expect(html).toContain('<h1 id="bom-head"');
  });

  it('[C.8] soft hyphens, bidi marks and tag characters stay encoded in copied destinations (L1)', () => {
    for (const enc of ['%C2%AD', '%D8%9C', '%E1%A0%8E', '%F3%A0%80%81']) {
      const src = `[x](https://a.com/${enc})`;
      expect(copyOf(src)).toContain(enc);
    }
  });

  it('[M.8] every shipped page and doc names the KaTeX version that renders (M2)', () => {
    const files = ['README.md', 'orz-markdown-skills/SKILL.md', 'docs/sw.js', 'tests/example.html', 'tests/example-minimal.html',
      ...readdirSync('orz-markdown-skills/references').map((f) => `orz-markdown-skills/references/${f}`),
      ...readdirSync('docs').filter((f) => f.endsWith('.html') && !f.startsWith('show-hn')).map((f) => `docs/${f}`)];
    const wrong: string[] = [];
    for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/katex@(\d+\.\d+\.\d+)/g)) if (m[1] !== KATEX_VERSION) wrong.push(`${f}: ${m[1]}`);
    expect(wrong).toEqual([]);
  });
});

describe('round 19 — half A', () => {
  const host = '{{toc 1,6}}\n\n# Host\n\nRef[^1].\n\n[^1]: Host note.\n\n{{md https://e.test/a}}\n\n{{qr HOSTCODE}}';
  it.each(['::: spoil Open^[FETCHED NOTE]\nx\n:::', 'A {{sp x^[FETCHED NOTE]}} y'])('[M.16] a spoil label or span body carries no footnote of its own (H1): %s', async (fetched) => {
    const out = await prepareSources(host, { fetcher: async () => fetched });
    expect((md.render(out).match(/id="fn1"/g) ?? []).length).toBe(1);
  });
  it('[R.7] a spoil label or span with an inline footnote renders no second footnote list (H1, plain render)', () => {
    const html = md.render('Ref[^1].\n\n[^1]: Note.\n\n::: spoil Label^[x]\nBody\n:::\n\nA {{sp y^[z]}} b');
    expect((html.match(/class="footnotes"/g) ?? []).length).toBe(1);
  });
  it('[M.16] an include cannot push the host across the QR or TOC caps (H2)', async () => {
    const qrs = Array.from({ length: 260 }, (_, i) => `{{qr ${'a'.repeat(40)}${i}}}`).join('\n\n');
    expect(await prepareSources(host, { fetcher: async () => qrs })).toBe(host);
    const heads = Array.from({ length: 25000 }, (_, i) => `#### h${i}`).join('\n');
    expect(await prepareSources(host, { fetcher: async () => heads })).toBe(host);
  }, 60_000);
  it('[R.7] the QR cap holds inside spoil labels too (H3)', () => {
    const src = Array.from({ length: 400 }, (_, i) => `::: spoil {{qr ${'a'.repeat(300)}${i}}}\nx\n:::`).join('\n\n');
    expect(md.render(src).length).toBeLessThan(12_000_000);
  }, 60_000);
  it('[R.7] the TOC cap counts size, not only entries (H4)', () => {
    expect(() => md.render(`# ${'x'.repeat(100_000)}\n\n` + '{{toc}}\n\n'.repeat(4000))).not.toThrow();
  }, 60_000);
  it('[M.5] one list of many task items renders linearly, identically (H5)', async () => {
    const doc = (n: number) => '- [ ] x\n'.repeat(n);
    expect(await ratio(() => md.render(doc(5000)), () => md.render(doc(20000)))).toBeLessThan(8);
    expect(md.render('- [ ] a\n- [x] b\n  - [ ] c')).toBe('<ul class="contains-task-list">\n<li class="task-list-item"><input class="task-list-item-checkbox" disabled="" type="checkbox"> a</li>\n<li class="task-list-item"><input class="task-list-item-checkbox" checked="" disabled="" type="checkbox"> b\n<ul class="contains-task-list">\n<li class="task-list-item"><input class="task-list-item-checkbox" disabled="" type="checkbox"> c</li>\n</ul>\n</li>\n</ul>\n');
  }, 120_000);
  it('[R.7] long formulas and macro definitions render as their source, quickly (H6)', () => {
    const t0 = performance.now();
    const html = md.render('$' + 'x'.repeat(32000) + '$\n\n$\\def\\a{xxxxxxxxxx}\\def\\b{\\a\\a\\a\\a\\a\\a\\a\\a\\a\\a}\\b$\n\n$x^2$');
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(html.match(/class="katex-error"/g)).toHaveLength(2);
    expect(html).toContain('class="katex"');
  });
  it('[R.7] reference links cannot multiply the output without bound (H7)', () => {
    const src = `[a]: http://e.com/${'x'.repeat(10000)}\n\n` + '[a] '.repeat(80000);
    expect(md.render(src).length).toBeLessThan(40_000_000); // was 401 MB
  }, 60_000);
  it('[M.9] file includes are bounded per render (H8)', () => {
    const big = 'Paragraph text. '.repeat(62500); // 1 MB, one paragraph
    let reads = 0;
    md.render(Array.from({ length: 40 }, () => '{{md inc.md}}').join('\n\n'), { markdownBasePath: '/', readFile: () => { reads++; return big; } });
    const html = md.render(Array.from({ length: 40 }, () => '{{md inc.md}}').join('\n\n'), { markdownBasePath: '/', readFile: () => big });
    expect((html.match(/<p>Paragraph/g) ?? []).length).toBe(5); // 5,000,000 characters of includes per render
    expect(reads).toBe(1); // each path read once per render (round 20)
  }, 60_000);
  it('[M.18] one conflicting chapter does not cost the good ones (M1)', async () => {
    const files: Record<string, string> = {};
    const src = Array.from({ length: 100 }, (_, i) => { files[`https://e.test/c${i}`] = i % 33 === 0 ? 'Bad[^1].\n\n[^1]: clash' : `Chapter ${i}.`; return `{{md https://e.test/c${i}}}`; }).join('\n\n');
    const out = await prepareSources('Host[^1].\n\n[^1]: Host note.\n\n' + src, { fetcher: async (u) => files[u] ?? null });
    expect((out.match(/\{\{md https/g) ?? []).length).toBe(4); // only the four conflicting ones stay
  }, 120_000);
});

import { parseDocMetaIsland } from '../../src/doc-meta';

describe('round 19 — half B', () => {
  it('[M.5] many distinct headings render linearly (H1)', async () => {
    const doc = (n: number) => Array.from({ length: n }, (_, i) => `## h${i}`).join('\n');
    expect(await ratio(() => md.render(doc(10000)), () => md.render(doc(40000)))).toBeLessThan(8);
  }, 180_000);
  it('[M.17] reading the island is linear on a head full of scripts (H2)', async () => {
    const head = (n: number) => '<html><head>' + '<script '.repeat(n) + '</head><body></body></html>';
    expect(await ratio(() => parseDocMetaIsland(head(5000)), () => parseDocMetaIsland(head(20000)))).toBeLessThan(8);
  }, 120_000);
  it('[M.17] without a head, only an island the document starts with counts (L2)', () => {
    const island = '<script type="application/orz-meta+json" id="orz-meta">{"uid":"u"}</script>';
    expect(parseDocMetaIsland(island + '\n<p>x</p>')?.uid).toBe('u');
    expect(parseDocMetaIsland('<p>x</p>' + island)).toBeNull();
  });
  it('[R.6] an automatic id never duplicates an id set with {{attrs}} (M1)', () => {
    const ids = (src: string) => [...md.render(src).matchAll(/<h1 id="([^"]*)"/g)].map((m) => m[1]);
    for (const src of ['# X {{attrs[#y]}}\n# Y\n# Y', '# A {{attrs[#a-1]}}\n# A\n# A']) {
      const list = ids(src);
      expect(new Set(list).size, src).toBe(list.length);
    }
    expect(ids('# X {{attrs[#y]}}\n# Y\n# Y')).toEqual(['y', 'y-1', 'y-2']);
  });
  it('[C.8] a noncharacter in text copies back (L1)', () => {
    const root = dom.createElement('div'); root.className = 'markdown-body'; root.innerHTML = md.render('a ﷐ b');
    expect(e2m(root)).not.toContain('\\&');
  });
  it('[R.7] a reused env does not carry the previous document\'s footnotes (L5)', () => {
    const env = {};
    md.render('One[^a].\n\n[^a]: First note.', env);
    expect(md.render('Two.', env)).not.toContain('First note');
  });
});
