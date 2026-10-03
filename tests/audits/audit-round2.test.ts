/**
 * Round-2 regressions: each test reproduces a finding of the round-1
 * adversarial audit (notes/closed-loop.md, round 2) and is bound to the claim
 * the finding falsified.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { md, scanNymlBlocks, extractDocMeta, prepareSources, maskInertMarkdown, resolveIncludePath } from '../../src/index';
import { browserRuntimeScript } from '../../src/runtime';
import { normalize } from '../helpers/normalize';

type Doc = { createElement(tag: string): { className: string; innerHTML: string } };
let doc: Doc;
let e2m: (n: unknown) => string;

beforeAll(async () => {
  const { Window } = await import('happy-dom');
  doc = new Window().document as unknown as Doc;
  (0, eval)(browserRuntimeScript);
  e2m = (globalThis as unknown as { OrzMarkdownRuntime: { elementToMarkdown: typeof e2m } }).OrzMarkdownRuntime.elementToMarkdown;
});

function copyOf(src: string): string {
  const root = doc.createElement('div');
  root.className = 'markdown-body';
  root.innerHTML = md.render(src);
  return e2m(root);
}
function roundTrip(src: string): void {
  const copied = copyOf(src);
  expect(normalize(md.render(copied)), `copied as:\n${copied}`).toBe(normalize(md.render(src)));
}

describe('copy — round-2 findings', () => {
  it('[C.4] code-block blank lines and trailing spaces survive (H4)', () => {
    roundTrip('```py\ndef a():\n    pass\n\n\ndef b():\n    pass\n```');
    roundTrip('```\nline  \nx\n```');
    roundTrip('- item\n\n  ```\n  a\n\n\n  b\n  ```');
    roundTrip('> ```\n> a\n>\n> b\n> ```');
  });
  it('[C.4] fence info strings with dots and braces (L7)', () => {
    roundTrip('```vue.js\nx\n```');
    roundTrip('```{r}\nx\n```');
  });

  it('[C.7] pipes in cell math, inline HTML, footnotes, breadcrumbs and titles (H6)', () => {
    roundTrip('| a |\n|---|\n| $\\|x\\|$ |');
    roundTrip('| a |\n|---|\n| <kbd>\\|</kbd> |');
    roundTrip('| a |\n|---|\n| x^[a \\| b] |');
    roundTrip('| a |\n|---|\n| {{qr a\\|b}} |');
    roundTrip('| a |\n|---|\n| [a](https://x.y "x\\|y") |');
  });

  it('[C.8] link and alt text with brackets (H7)', () => {
    roundTrip('See [arr[0] docs](https://x.y) now.');
    roundTrip('Download [report [PDF]](https://x.y/r.pdf).');
    roundTrip('![a[1]](i.png)');
  });
  it('[C.8] autolinks followed by text or ending in punctuation (M6)', () => {
    roundTrip('<https://a.bc>d');
    roundTrip('[https://x.y](https://x.y)z');
    roundTrip('<https://x.y/a.>');
    expect(copyOf('Visit https://orz.how now.')).toBe('Visit https://orz.how now.');
    expect(copyOf('访问 https://orz.how 获取')).toBe('访问 https://orz.how 获取');
  });

  it('[C.1] KaTeX errors copy back as their source (M1)', () => roundTrip('see $\\fracc{a}$ ok'));

  it('[C.6] adjacent lists of the same kind stay separate (M2)', () => {
    roundTrip('- a\n- b\n\n* c\n* d');
    roundTrip('1. a\n2. b\n\n1) c');
  });

  it('[C.3] trailing # in a heading (M3)', () => {
    roundTrip('## Item \\#');
    roundTrip('## 第 \\#');
  });
  it('[C.3] line-start markers after a hard break (M4)', () => {
    roundTrip('a\\\n\\* b');
    roundTrip('a\\\n\\=');
    roundTrip('Title\\\n\\-\\-\\-');
  });
  it('[C.3] escapes are decided per block, not per text node (M11)', () => {
    roundTrip('costs \\$5, **only** 6\\$ each');
    roundTrip('C:\\\\`dir`');
    roundTrip('C:\\\\**x**');
    roundTrip('a\\\\\\\nb');
  });
  it('[C.3] ordinary prose keeps $ and ~ unescaped (H1)', () => {
    expect(copyOf('It takes ~5 minutes (about $5 or $6).')).toBe('It takes ~5 minutes (about $5 or $6).');
  });
  it('[C.3] typographer-looking text stays literal (L1)', () => {
    roundTrip('Copyright \\(c) 2024');
    roundTrip('say &quot;hi&quot;');
  });

  it('[C.10] container names that collide with runtime classes (L2)', () => {
    roundTrip('::: footnotes\nMy notes\n:::');
    roundTrip('::: mermaid\ntext\n:::');
  });
  it('[C.10] nested container inside a list item (L3)', () => {
    roundTrip(':::: info\n- item\n\n  ::: warning\n  x\n  :::\n::::');
  });

  it('[C.13] sub and sup containing spaces (L5)', () => {
    roundTrip('H~a\\ b~ and x^a\\ b^');
  });

  it('[C.17] spans with style and raw details survive (M5)', () => {
    roundTrip('a <span style="color:red">red</span> b');
    roundTrip('<details><summary>Click</summary>\n\nBody\n\n</details>');
    roundTrip('Gap {{space 2}} here');
  });
  it('[C.18] emphasis that would not re-parse falls back to HTML (M5, L4)', () => {
    roundTrip('x <b>“y”</b>z');
    roundTrip('__a__**b**');
    roundTrip('*a*_b_');
    expect(copyOf('**注意：**请先阅读。')).toBe('**注意：**请先阅读。');
    expect(copyOf('Plain **bold** word.')).toBe('Plain **bold** word.');
  });
});

describe('render — round-2 findings', () => {
  it('[R.3] CJK inside a URL path or query stays in the link (H3)', () => {
    expect(md.renderInline('见 https://zh.wikipedia.org/wiki/化学 页面')).toContain('href="https://zh.wikipedia.org/wiki/%E5%8C%96%E5%AD%A6"');
    expect(md.renderInline('https://www.google.com/search?q=中文')).toContain('href="https://www.google.com/search?q=%E4%B8%AD%E6%96%87"');
    expect(md.renderInline('见https://orz.how/docs，然后')).toContain('href="https://orz.how/docs"');
  });
});

describe('consumers — round-2 findings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orz-inc-'));
  writeFileSync(join(dir, 'inc.md'), '## Intro\n\nIncluded[^b].\n\n[^b]: Inc note.\n');
  writeFileSync(join(dir, '..notes.md'), 'dot-dot file\n');
  mkdirSync(join(dir, 'root'));
  writeFileSync(join(dir, 'secret.md'), 'secret\n');
  try { symlinkSync(join(dir, 'secret.md'), join(dir, 'root', 'link.md')); } catch { /* no symlinks */ }

  it('[M.9] an included file joins the document (H8)', () => {
    const html = md.render('{{toc}}\n\n## Intro\n\nParent[^a].\n\n{{md inc.md}}\n\n[^a]: Parent note.', { markdownBasePath: dir });
    expect(html.match(/class="footnotes"/g)).toHaveLength(1);
    const ids = [...html.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html.match(/<ul class="toc-list"[\s\S]*?<\/ul>/)![0].match(/<li/g)).toHaveLength(2);
  });

  it('[M.10] escaped, mid-paragraph and look-alike openers are not blocks (M7)', () => {
    expect(extractDocMeta('\\{{nyml kind: meta\ntitle: Example\n}}').meta).toEqual({});
    expect(extractDocMeta('Intro text {{nyml\nkind: meta\ntitle: Mid\n}} more.').meta).toEqual({});
    expect(scanNymlBlocks('{{nymlish\nkind: meta\n}}')).toHaveLength(0);
  });
  it('[M.10] a stray backtick before a fence does not hide the rest (M8)', () => {
    const src = 'Use a ` backtick\n```\ncode ` here\n```\n\n{{nyml\nkind: meta\ntitle: AfterFence\n}}';
    expect(extractDocMeta(src).meta.title).toBe('AfterFence');
    // The opener stays live; since round 6 the directive's body is opaque (M2).
    expect(maskInertMarkdown(src)).toContain('{{nyml');
  });
  it('[M.10] nested keys, tabs and multiline keywords (L8)', () => {
    const { meta } = extractDocMeta('{{nyml\nkind: meta\ntitle: Top\nlicense:\n  title: Nested\nkeywords: |\n\t化学\n\t材料\n}}');
    expect(meta.title).toBe('Top');
    expect(meta.keywords).toEqual(['化学', '材料']);
    expect(md.render('{{nyml\nd: |\n\tline1\n\tline2\n}}')).toContain('"d": "line1\\nline2\\n"');
  });
  it('[M.6] two meta blocks: extraction is still idempotent (M9)', () => {
    const src = '{{nyml\nkind: meta\ntitle: A\n}}\n\n{{nyml\nkind: meta\ntitle: B\n}}\n\nBody';
    const once = extractDocMeta(src);
    expect(once.meta.title).toBe('A');
    expect(extractDocMeta(once.body)).toEqual({ meta: {}, body: once.body });
  });

  it('[M.11] includes inside quotes and lists, md alias, trailing comment (M10)', async () => {
    const fetcher = async () => '# H\n\npara';
    expect(await prepareSources('> {{md-include https://a.test/x}}', { fetcher })).toBe('> # H\n> \n> para');
    expect(await prepareSources('- item\n\n  {{md https://a.test/x }}', { fetcher })).toBe('- item\n\n  # H\n  \n  para');
    expect(await prepareSources('{{md-include https://a.test/x}} <!-- note -->', { fetcher })).toBe('# H\n\npara\n\n<!-- note -->');
  });
  it('[M.7] the budget counts growth, not the directive itself', async () => {
    const src = 'abc {{md https://a.test/x}}';
    const out = await prepareSources(src, { fetcher: async () => '0123456789', maxSize: src.length });
    expect(out).toBe('abc\n\n0123456789'); // the include is its own block
  });

  it('[M.12] include root: ..-prefixed names allowed, symlinks out refused', () => {
    expect(resolveIncludePath('..notes.md', { markdownBasePath: dir, markdownIncludeRoot: dir })).not.toBeNull();
    expect(resolveIncludePath('../x.md', { markdownBasePath: dir, markdownIncludeRoot: dir })).toBeNull();
    expect(resolveIncludePath('link.md', { markdownBasePath: join(dir, 'root'), markdownIncludeRoot: join(dir, 'root') })).toBeNull();
  });
});
