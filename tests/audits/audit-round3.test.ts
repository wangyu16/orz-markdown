/**
 * Round-3 regressions: each test reproduces a finding of the round-2
 * adversarial audit (notes/closed-loop.md, round 3), bound to the claim it
 * falsified.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { md, extractDocMeta, prepareSources, maskInertMarkdown } from '../../src/index';
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

describe('copy — round-3 findings', () => {
  it('[C.6] a code block opening a list item or footnote survives (H2)', () => {
    roundTrip('- ```\n  code\n  ```\n- b');
    roundTrip('1. ```js\n   x = 1\n   ```');
    roundTrip('Text[^1].\n\n[^1]: ```\n    code\n    ```');
  });
  it('[C.10] a container holding a code example with ::: lines (H3)', () => {
    roundTrip(':::: info\nExample:\n\n```markdown\n::: warning\nCareful\n:::\n```\n::::');
    roundTrip(':::: tabs\n::: tab A\n```\n:::\n```\n:::\n::::');
  });
  it('[C.8] relative links whose text equals the href (H4)', () => {
    roundTrip('See [CHANGELOG.md](CHANGELOG.md) and [docs/guide.html](docs/guide.html).');
    roundTrip('Jump to [#intro](#intro).');
    roundTrip('Visit www.example.com, then go.');
  });
  it('[C.8] image alt text keeps every character (H5)', () => {
    roundTrip("![Tom's dog](dog.png)");
    roundTrip('![say "hi" <b> (c) _x_ *y*](i.png)');
    roundTrip('![a[1]](i.png)');
  });
  it('[C.7] backslash before a pipe in cell code and math (H8)', () => {
    roundTrip('| a |\n|---|\n| `a\\\\|b` |');
    roundTrip('| a |\n|---|\n| `dir \\\\| more` |');
    roundTrip('| a |\n|---|\n| $\\\\|x\\\\|$ |');
  });
  it('[C.17] inline HTML children are walked, not pasted raw (M2)', () => {
    roundTrip('Press <kbd>\\\\</kbd> and <kbd>\\-\\-help</kbd>.');
    roundTrip('<kbd>\\*</kbd> and <kbd>\\*</kbd>');
    roundTrip('<kbd>\\$</kbd> x <kbd>\\$</kbd>');
    roundTrip('<span style="color:red">\\=\\=a\\=\\=</span> <kbd>\\{{emoji smile}}</kbd>');
    roundTrip('<ruby>汉<rt>hàn</rt></ruby>');
  });
  it('[C.5] a <br> in a heading stays in the heading (M3)', () => {
    roundTrip('## Title<br>Sub');
    roundTrip('# 标题<br>副标题');
  });
  it('[C.18] the emphasis fallback decides on emitted Markdown, per side (L1)', () => {
    roundTrip('x<strong>[a](u)</strong>b');
    roundTrip('x<strong>`c`</strong>y');
    roundTrip('Read <strong>[this](u)</strong>s');
    expect(copyOf('**注意：**请先阅读。')).toBe('**注意：**请先阅读。');
  });
  it('[C.3] underscores next to punctuation and emoji stay literal (L2)', () => {
    roundTrip('“\\_a\\_” —\\_a\\_— «\\_a\\_» 😀\\_a\\_😀');
  });
  it('[C.3] typographer dashes and ellipses stay literal (L3)', () => {
    roundTrip('a \\-- b and wait\\.\\.\\.');
  });
  it('[C.3] private-use characters do not collide with internal markers (L4)', () => {
    roundTrip('a\uE000b \uE001 5\uE001 0\uE001 c');
  });
  it('[C.4] an empty fence stays empty (L6)', () => roundTrip('```\n```'));
  it('[C.8] "!" before a link stays text (L6)', () => roundTrip('Wow\\![a](u)'));
});

describe('render — round-3 findings', () => {
  it('[R.3] CJK before a bare URL is not linked into the host (H6)', () => {
    expect(md.renderInline('请访问www.baidu.com。')).toBe('请访问<a href="http://www.baidu.com">www.baidu.com</a>。');
    // In a path, "x获取" cannot be told from a page name like "Java语言": since
    // round 9 it stays in the link, as linkify-it links it (write a space or
    // punctuation after a URL path). In a host the cut stays.
    expect(md.renderInline('访问github.com/x获取')).toBe('访问<a href="http://github.com/x%E8%8E%B7%E5%8F%96">github.com/x获取</a>');
    expect(md.renderInline('访问https://github.com获取')).toBe('访问<a href="https://github.com">https://github.com</a>获取');
    expect(md.renderInline('https://a.bc😀好')).not.toContain('xn--');
    expect(md.renderInline('见 https://zh.wikipedia.org/wiki/化学 页面')).toContain('href="https://zh.wikipedia.org/wiki/%E5%8C%96%E5%AD%A6"');
  });
  it('[R.4] text after a single-line block directive is kept (L5)', () => {
    const html = md.render('{{smiles CCO}} is ethanol');
    expect(html).toContain('data-smiles="CCO"');
    expect(html).toContain('<p>is ethanol</p>');
  });
});

describe('consumers — round-3 findings', () => {
  it('[M.7] quote prefixes cannot multiply output past maxSize (M6)', async () => {
    const src = '>'.repeat(200) + ' {{md https://a.test/x}}';
    const out = await prepareSources(src, { fetcher: async () => 'line\n'.repeat(1000), maxSize: 20_000 });
    expect(out.length).toBeLessThanOrEqual(20_000);
  });
  it('[M.11] escaped, code and link-destination includes are not fetched (M7)', async () => {
    const seen: string[] = [];
    const fetcher = async (u: string) => { seen.push(u); return 'X'; };
    await prepareSources('\\{{md https://a.test/1}}\n\n    {{md https://a.test/2}}\n\n[a]({{md https://a.test/3}})', { fetcher });
    expect(seen).toEqual([]);
  });
  it('[M.11] a directive on a list-marker line continues as item indentation', async () => {
    expect(await prepareSources('- {{md https://a.test/x}}', { fetcher: async () => '# H\n\npara' })).toBe('- # H\n  \n  para');
  });
  it('[M.10] a fence indented inside a list item is a fence (M8)', () => {
    const src = '- item\n\n    ~~~\n    {{nyml\n    kind: meta\n    title: InCode\n    }}\n    ~~~\n';
    expect(extractDocMeta(src).meta).toEqual({});
    expect(maskInertMarkdown(src)).not.toContain('InCode');
  });
  it('[M.10] "<!--" inside a code span, or never closed, does not blank the rest (M9)', () => {
    const meta = '\n\n{{nyml\nkind: meta\ntitle: T\n}}\n';
    expect(extractDocMeta('Use `<!--` to start a comment.' + meta).meta.title).toBe('T');
    expect(extractDocMeta('a <!-- b' + meta).meta.title).toBe('T');
  });
  it('[M.13] remote content cannot pull in local file includes (M10)', async () => {
    const out = await prepareSources('{{md https://a.test/x}}', { fetcher: async () => 'Hi\n\n{{md /etc/hosts}}' });
    expect(out).toContain('{{\u2060md /etc/hosts}}'); // invisible word joiner: renders the same, never a plugin
    expect(md.render(out, { markdownBasePath: '/' })).not.toContain('localhost');
  });
});
