/**
 * Round-14 regressions (half B; half A's are in audit-round13.test.ts under
 * "round 14 — half A"), bound to the claims they falsified.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { md, extractDocMeta, scanNymlBlocks, prepareSources } from '../../src/index';
import { browserRuntimeScript } from '../../src/runtime';
import { normalize } from '../helpers/normalize';

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

describe('round 14 — half B', () => {
  it('[M.5] glued meta blocks extract linearly, and so does an include holding them (H1)', async () => {
    const make = (n: number) => '{{nyml kind: meta}}'.repeat(n);
    const ratio = async (f: (s: string) => unknown) => {
      let r = Infinity;
      for (let round = 0; round < 3 && r >= 8; round++) {
        let a = Infinity, b = Infinity;
        for (let i = 0; i < 3; i++) {
          let t = performance.now(); await f(make(1000)); a = Math.min(a, performance.now() - t);
          t = performance.now(); await f(make(4000)); b = Math.min(b, performance.now() - t);
        }
        r = Math.min(r, b / Math.max(a, 1));
      }
      return r;
    };
    expect(await ratio((s) => extractDocMeta(s))).toBeLessThan(8);
    expect(await ratio((s) => prepareSources('{{md https://e.test/a}}', { fetcher: async () => s }))).toBeLessThan(8);
  }, 180_000);

  it.each<[string, Record<string, string>]>([
    ['{{nyml\nabstract: |\n  Note: x\n  more\n}}', { abstract: 'Note: x\nmore' }],
    ['{{nyml description: |\n  Step: one\n  two\n}}', { description: 'Step: one\ntwo' }],
    ['{{nyml\n  kind: x\n  abstract: |\n    Note: y\n  title: T\n}}', { abstract: 'Note: y', title: 'T' }],
    ['{{nyml kind: x\n  title: T\n  author: A\n}}', { title: 'T', author: 'A' }],
  ])('[M.10] the scanner reads the body as the renderer does: %j (M1)', (src, fields) => {
    expect(scanNymlBlocks(src)[0].fields).toEqual(fields);
  });

  it.each([['see 百度.com now', 'http://xn--wxtr44c.com'], ['see 例え.jp now', 'http://xn--r8jz45g.jp'], ['请访问www.baidu.com', 'http://www.baidu.com']])(
    '[R.3] a whole non-ASCII label is an IDN host; CJK glued onto ASCII is prose (M2): %s', (src, href) => {
      expect(md.renderInline(src)).toContain(`href="${href}"`);
    });

  it('[R.7] {{youtube}} accepts a full YouTube URL, as documented (L1)', () => {
    for (const src of ['{{youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1}}', '{{yt https://youtu.be/dQw4w9WgXcQ}}', '{{yt dQw4w9WgXcQ}}']) {
      expect(md.render(src)).toMatch(/src="https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ(\?start=1)?"/); // t= kept since round 21
    }
  });

  it('[C.8] a CJK link destination copies readable (L4)', () => {
    const copied = copyOf('[路径](https://a.com/路径)');
    expect(copied).toBe('[路径](https://a.com/路径)');
    expect(normalize(md.render(copied))).toBe(normalize(md.render('[路径](https://a.com/路径)')));
  });
});

describe('round 15 — half A', () => {
  const host = '# Host Document\n\n## Chapter One\n\n{{md https://e.test/a}}\n\n## Chapter Two';
  it.each([
    '<nav aria-label="PHISH NAV">x</nav>', '<div role="navigation">x</div>', '<p role="heading" aria-level="1">PHISH</p>',
    '<main>x</main>', '<header>x</header>', '<aside>x</aside>', '<footer>x</footer>', '<div aria-hidden="true">x</div>',
    'Para {{attrs[contenteditable]}}', 'Para {{attrs[accesskey="s"]}}', 'Para {{attrs[role="navigation"]}}', 'Para {{attrs[tabindex="0"]}}',
  ])('[M.16] fetched text adds no landmark, heading role or widget behaviour (M-1): %s', async (fetched) => {
    expect(await prepareSources(host, { fetcher: async () => fetched })).toBe(host);
  });
  it('[M.16] presentational roles, aria-label and Markdown headings still splice', async () => {
    const out = await prepareSources(host, { fetcher: async () => '<table role="presentation"><tr><td>a</td></tr></table>\n\n<span aria-label="x">y</span>\n\n### Included heading' });
    expect(out).not.toBe(host);
  });
});

describe('round 15 — half B', () => {
  it.each([
    '[百度搜索](https://www.baidu.com/s?wd=%25E4%25B8%25AD%25E6%2596%2587)', '[x](https://e.com/a%5C_b)', '[x](https://e.com/a%7Fb)',
    '[x](https://e.com/a%25)', '[路径](https://a.com/路径)',
  ])('[C.8] a copied link destination links the same target (H1): %s', (src) => {
    const copied = copyOf(src);
    expect(normalize(md.render(copied)), `copied as:\n${copied}`).toBe(normalize(md.render(src)));
  });

  it.each<[string, Record<string, string>]>([
    ['{{nyml\nkind: meta\ndescription: |\n  line one\n  line two}}', { description: 'line one\nline two' }],
    ['{{nyml\nkind: x\nlicense: a\n  spdx: Y}}', { license: 'a' }],
    ['> {{nyml\n> kind: x\n> d: |\n>   one\n>   two}}', { d: 'one\ntwo' }],
  ])('[M.10] a block closed on its last content line keeps that line\'s indentation (M1): %j', (src, fields) => {
    expect(scanNymlBlocks(src)[0].fields).toEqual(fields);
  });

  it.each([
    '> {{nyml kind: meta}}{{nyml\n> kind: meta\n> title: B\n> }}\n\nBody',
    '{{nyml kind: meta}}{{nyml[}}] kind: meta}}\n\nBody',
  ])('[M.6] glued followers inside a quote or with "}}" in args are removed too (L1): %j', (src) => {
    const once = extractDocMeta(src);
    expect(extractDocMeta(once.body)).toEqual({ meta: {}, body: once.body });
  });

  it('[R.3] a CJK label joined by "-" is one IDN host (L2)', () => {
    expect(md.renderInline('see 百度-x.com now')).toContain('<a href="http://xn---x-');
  });

  it.each(['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'HTTPS://WWW.YOUTUBE.COM/watch?v=dQw4w9WgXcQ', 'https://youtube.com/v/dQw4w9WgXcQ'])(
    '[R.7] {{youtube}} recognizes %s (L3)', (url) => {
      expect(md.render(`{{youtube ${url}}}`)).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
    });
  it('[R.7] look-alike hosts are not taken for YouTube', () => {
    expect(md.render('{{youtube https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ}}')).not.toContain('embed/dQw4w9WgXcQ"');
  });
});

describe('round 16 — half A', () => {
  it('[M.18] N directives naming one large refused file cost one preparation, not N (HIGH-1)', async () => {
    const big = Array.from({ length: 1500 }, (_, i) => `Paragraph ${i} with some text.`).join('\n\n') + '\n\n::: evil-class\nx\n:::';
    const files = (n: number): Record<string, string> => ({
      'https://evil.test/a': Array.from({ length: n }, () => '{{md https://evil.test/b}}').join('\n\n'),
      'https://evil.test/b': big,
    });
    const time = async (n: number) => {
      const f = files(n); const t0 = performance.now();
      await prepareSources('{{md https://evil.test/a}}', { fetcher: async (u) => f[u] ?? null });
      return performance.now() - t0;
    };
    await time(5);
    const small = await time(10), large = await time(40);
    expect(large / Math.max(small, 1)).toBeLessThan(8);
    expect(large).toBeLessThan(10_000); // was ~10 s at 200 × 66 KB and growing with both
  }, 120_000);

  it.each([
    'Included $\\smash{\\rule[-4em]{60em}{3em}}$ text.', '$\\smash{\\color{white}\\rule[-4em]{60em}{3em}}$',
    '$\\raisebox{-4em}{x}$', '$\\rlap{x}$', '$\\mathllap{x}$', '$\\kern-30em x$', '$\\hspace{-3em} x$', '$\\mkern -18mu x$',
    '$$\n\\smash{x}\n$$', '{{sp $\\smash{x}$}}',
  ])('[M.16] fetched math that paints outside its box is refused (HIGH-2): %s', async (fetched) => {
    const host = '{{md https://e.test/a}}\n\nHOST-AFTER';
    expect(await prepareSources(host, { fetcher: async () => fetched })).toBe(host);
  });
  it('[M.16] ordinary fetched math still splices', async () => {
    const host = '{{md https://e.test/a}}';
    expect(await prepareSources(host, { fetcher: async () => 'Energy $E=mc^2$, $\\frac{a}{b}$, $\\kern1em x$.\n\n$$\n\\sum_{i=1}^n i\n$$' })).not.toBe(host);
  });
});

describe('round 16 — half B', () => {
  const ratio = (small: () => unknown, large: () => unknown) => {
    small(); large();
    let r = Infinity;
    for (let round = 0; round < 3 && r >= 8; round++) {
      let a = Infinity, b = Infinity;
      for (let i = 0; i < 3; i++) {
        let t = performance.now(); small(); a = Math.min(a, performance.now() - t);
        t = performance.now(); large(); b = Math.min(b, performance.now() - t);
      }
      r = Math.min(r, b / Math.max(a, 1));
    }
    return r;
  };
  it('[M.5] extractDocMeta on a CR-only source is linear (H1)', () => {
    const doc = (n: number) => Array.from({ length: n }, (_, i) => `{{nyml\rkind: meta\rtitle: T${i}\r}}`).join('\r\r');
    expect(ratio(() => extractDocMeta(doc(500)), () => extractDocMeta(doc(2000)))).toBeLessThan(8);
  }, 120_000);
  it('[M.5] openers inside a list item with a far "}}" parse linearly (H2)', () => {
    const doc = (n: number) => '- item\n' + '  {{nyml x\n'.repeat(n) + 'zzz\n\n}}';
    expect(ratio(() => md.render(doc(1000)), () => md.render(doc(4000)))).toBeLessThan(8);
    expect(ratio(() => extractDocMeta(doc(1000)), () => extractDocMeta(doc(4000)))).toBeLessThan(8);
  }, 120_000);

  it.each(['# H\n\n- a\n\n{{toc}}', '{{toc}}\n\n{{toc}}', '# H\n\n- a\n\n  {{toc}}'])('[C.11] a {{toc}} after or inside a list copies as its directive (M1): %j', (src) => {
    expect(copyOf(src)).toMatch(/\{\{toc\}\}/);
    expect(normalize(md.render(copyOf(src)))).toBe(normalize(md.render(src)));
  });

  it.each([['{{yaml\n  a: 1\n  b: 2}}', 'a: 1\nb: 2'], ['> {{yaml\n>   a: 1\n>   b: 2\n> }}', 'a: 1\nb: 2'], ['{{yaml\n  a: 1\n  b:\n    c: 2\n}}', 'a: 1\nb:\n  c: 2']])(
    '[M.19] an indented yaml body is dedented as a whole (M2): %j', (src, body) => {
      expect(md.render(src)).toContain(`>\n${body}\n</script>`);
    });
  it('[M.10] a tab-indented body closed on its last line keeps that line (L3)', () => {
    expect(scanNymlBlocks('{{nyml\nkind: x\nd: |\n\tone\n\ttwo}}')[0].fields).toEqual({ d: 'one\ntwo' });
  });

  it.each(['[x](https://%E4%B8%AD.com/a)', '[m](mailto:%E4%B8%AD@x.com)'])('[C.8] hosts and mailto addresses copy as written (L1): %s', (src) => {
    expect(copyOf(src)).toContain(src.slice(src.indexOf('(')));
  });
  it.each(['10. {{nyml kind: meta}} {{nyml kind: meta}}\n\nBody', '  - {{nyml kind: meta}}{{nyml kind: meta}}\n\nBody'])(
    '[M.6] glued followers behind wide list markers are removed (L2): %j', (src) => {
      const once = extractDocMeta(src);
      expect(extractDocMeta(once.body)).toEqual({ meta: {}, body: once.body });
    });
  it('[C.1] an emoji in a heading keeps the heading id after copy (L4)', () => {
    const src = '## {{emoji rocket}} Quick start';
    expect(copyOf(src)).toBe(src);
  });
  it('[R.7] ::: cols accepts repeat() and minmax() (L7)', () => {
    expect(md.render(':::: cols repeat(6, 1fr)\n::: col\na\n:::\n::::')).toContain('grid-template-columns: repeat(6,1fr)');
    expect(md.render(':::: cols minmax(10em,1fr) 2\n::: col\na\n:::\n::::')).toContain('grid-template-columns: minmax(10em,1fr) 2fr');
  });
});

describe('round 17 — half A', () => {
  it('[M.18] many wrapper URLs around one large refused body: total work is bounded (H1)', async () => {
    const big = (k: number) => Array.from({ length: 300 * k }, (_, i) => `Paragraph ${i} with some text.`).join('\n\n') + '\n\n::: evil-class\nx\n:::';
    const run = async (n: number, k: number) => {
      const files: Record<string, string> = { 'https://h.test/F': Array.from({ length: n }, (_, i) => `{{md https://h.test/w${i}}}`).join('\n\n'), 'https://h.test/B': big(k) };
      for (let i = 0; i < n; i++) files[`https://h.test/w${i}`] = '{{md https://h.test/B}}';
      const t0 = performance.now();
      await prepareSources('{{md https://h.test/F}}', { fetcher: async (u) => files[u] ?? null, maxDepth: 3 });
      return performance.now() - t0;
    };
    await run(5, 1);
    let r = Infinity;
    for (let round = 0; round < 3 && r >= 8; round++) r = Math.min(r, (await run(40, 4)) / Math.max(await run(10, 1), 1));
    expect(r).toBeLessThan(8); // 4× wrappers and a 4× body (16× the naive product)
  }, 180_000);
  it('[M.18] the work budget leaves directives in place once spent', async () => {
    const body = 'x'.repeat(1000);
    const src = Array.from({ length: 50 }, (_, i) => `{{md https://h.test/${i}}}`).join('\n\n');
    const out = await prepareSources(src, { fetcher: async () => body, maxSize: 20_000 });
    expect(out).toContain('{{md https://h.test/49}}');
  });
});

describe('round 17 — half B', () => {
  it.each([
    ['mermaid', '{{mermaid\n' + '  A\n'.repeat(120000) + '}}'],
    ['yaml', '{{yaml\n' + '  a: 1\n'.repeat(130000) + '}}'],
    ['nyml', '{{nyml\nkind: meta\ndescription: |\n' + '  line\n'.repeat(130000) + '}}'],
  ])('[M.5] a large %s body renders without overflowing the stack (H1)', (_name, src) => {
    expect(() => md.render(src)).not.toThrow();
    expect(() => extractDocMeta(src)).not.toThrow();
  }, 120_000);
  it('[M.9] a large included file splices without overflowing the stack (H1)', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'orz-r17-'));
    writeFileSync(join(dir, 'inc.md'), Array.from({ length: 60000 }, (_, i) => `p${i}`).join('\n\n'));
    expect(() => md.render('{{md inc.md}}', { markdownBasePath: dir })).not.toThrow();
  }, 120_000);
  it.each([
    ['{{yaml server:\n  host: x\n  port: 1\n}}', 'server:\n  host: x\n  port: 1'],
    ['- {{yaml cfg:\n    k: v\n  }}', 'cfg:\n  k: v'],
  ])('[M.19] a yaml body starting on the opener line keeps its nesting (M1): %j', (src, body) => {
    expect(md.render(src)).toContain(`>\n${body}\n</script>`);
  });
  it.each(['[x](https://a.com/%E2%80%8B)', '[x](https://a.com/%E2%80%AE)', '[x](https://a.com/%C2%85)'])(
    '[C.8] invisible and bidi characters stay encoded in a copied destination (L2): %s', (src) => {
      expect(copyOf(src)).toContain(src.slice(src.indexOf('(')));
    });
});
