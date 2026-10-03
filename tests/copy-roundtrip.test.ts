/**
 * Copy-as-Markdown round trip (claims C.1–C.13, C.17): render → DOM → copy as
 * Markdown → render again must be equivalent. Heading ids are ignored because
 * stable block ids are deliberately not copied (C.12). Whitespace is compared
 * exactly except for ASCII runs, so a lost U+3000 or nbsp is visible (C.13).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { md } from '../src/index.js';
import { browserRuntimeScript } from '../src/runtime.js';
import { normalize } from './helpers/normalize.js';

const require = createRequire(import.meta.url);
let hasHappyDom = false;
try {
  require.resolve('happy-dom');
  hasHappyDom = true;
} catch {
  /* optional devDependency */
}
const suite = hasHappyDom ? describe : describe.skip;

type Doc = { createElement(tag: string): { className: string; innerHTML: string } };
let doc: Doc;
let elementToMarkdown: (node: unknown) => string;


export function copyOf(src: string): string {
  const root = doc.createElement('div');
  root.className = 'markdown-body';
  root.innerHTML = md.render(src);
  return elementToMarkdown(root);
}

function expectRoundTrip(src: string): void {
  const copied = copyOf(src);
  const opts = { ignoreIds: src.includes('{{attrs[') };
  expect(normalize(md.render(copied), opts), `copied as:\n${copied}`).toBe(normalize(md.render(src), opts));
}

suite('copy-as-Markdown round trip', () => {
  beforeAll(async () => {
    const { Window } = await import('happy-dom');
    doc = new Window().document as unknown as Doc;
    (0, eval)(browserRuntimeScript);
    elementToMarkdown = (globalThis as unknown as { OrzMarkdownRuntime: { elementToMarkdown: typeof elementToMarkdown } })
      .OrzMarkdownRuntime.elementToMarkdown;
  });

  const EN: Array<[string, string]> = [
    ['heading and paragraph', '# Title\n\nPara with **bold**, *em*, `code` and a [link](https://x.y).'],
    ['nested lists', '- a\n  - b\n    - c\n- d'],
    ['blockquote with list', '> - a\n> - b'],
    ['task list', '- [x] done\n- [ ] todo'],
    ['mark ins del sub sup', '==m== ++i++ ~~d~~ H~2~O x^2^'],
    ['math inline and display', 'Inline $a+b$ and\n\n$$\nx^2\n$$'],
    ['table with alignment', '| L | C | R |\n|:--|:-:|--:|\n| a | b | c |'],
    ['horizontal rule', 'a\n\n---\n\nb'],
    ['html entities', 'AT&T &amp; &lt;b&gt;'],
    ['emoji', '{{emoji smile}} ok'],
  ];
  it.each(EN)('[C.1] English: %s', (_name, src) => expectRoundTrip(src));

  const CJK: Array<[string, string]> = [
    ['bold before CJK punctuation', '**注意：**请先阅读。'],
    ['bold around CJK quotes', '这是**“重点”**内容。'],
    ['mixed Chinese and English', '中文English混排，`代码`与**粗体**。'],
    ['link inside Chinese', '访问[网站](https://orz.how)获取。'],
    ['table', '| 名称 | 数量 |\n|:---|---:|\n| 苹果 | 3 |'],
    ['tabs with Chinese labels', ':::: tabs\n::: tab 第一\n内容\n:::\n::: tab 第二\n内容二\n:::\n::::'],
    ['heading', '## 化学反应\n\n正文。'],
    ['list', '1. 第一项\n2. 第二项'],
    ['footnote', '正文[^注]。\n\n[^注]: 注释内容。'],
    ['spoiler', '::: spoil 答案\n隐藏内容\n:::'],
  ];
  it.each(CJK)('[C.2] Chinese: %s', (_name, src) => expectRoundTrip(src));

  const LITERAL: Array<[string, string]> = [
    ['star and underscore', 'Use a \\*literal\\* star and \\_under\\_ here.'],
    ['backtick', 'A \\`tick\\` here.'],
    ['bracket', 'See \\[not a link\\](x).'],
    ['angle tag', 'Write \\<div\\> in text.'],
    ['plugin opener', 'Type \\{{emoji smile}} literally.'],
    ['dollar', 'Escaped \\$x\\$ is not math; it costs $5.'],
    ['tilde caret equals plus', 'a \\~b\\~ c \\^d\\^ \\=\\=e\\=\\= \\+\\+f\\+\\+'],
    ['entity-looking text', 'Write &amp;copy; to get the symbol.'],
    ['line-start hash', '\\# not a heading'],
    ['line-start number', '1\\. not a list'],
    ['line-start dash', '\\- not a list'],
    ['line-start plus', '\\+ not a list'],
    ['line-start quote', '\\> not a quote'],
    ['backslash before punctuation', 'Path C:\\\\\\*temp'],
    ['snake_case stays readable', 'call snake_case_name now'],
  ];
  it.each(LITERAL)('[C.3] literal text: %s', (_name, src) => expectRoundTrip(src));

  it('[C.3] copies ordinary prose without needless escapes', () => {
    expect(copyOf('call snake_case_name, then 5 * 3 = 15.')).toBe('call snake_case_name, then 5 * 3 = 15.');
  });

  it('[C.4] inline code containing backticks', () => expectRoundTrip('Run `` a`b `` now.'));
  it('[C.4] inline code starting with a backtick', () => expectRoundTrip('See `` `x `` here.'));
  it('[C.4] code block containing a fence', () => expectRoundTrip('````\n```js\nx\n```\n````'));

  it('[C.5] hard line break', () => expectRoundTrip('line one\\\nline two'));
  it('[C.5] hard line break in a table cell', () => {
    const copied = copyOf('| a |\n|---|\n| x<br>y |');
    expect(copied).toContain('x<br>y');
  });

  it('[C.6] ordered list start number', () => expectRoundTrip('3. three\n4. four'));
  it('[C.6] loose list with two paragraphs in an item', () => expectRoundTrip('- item\n\n  second paragraph\n\n- next'));
  it('[C.6] list item containing a code block', () => expectRoundTrip('- item\n\n  ```\n  code\n  ```'));
  it('[C.6] list item containing a quote', () => expectRoundTrip('1. item\n\n   > quoted'));
  it('[C.6] task box belongs only to its own item', () => expectRoundTrip('- parent\n  - [x] child'));

  it('[C.7] literal pipe in a cell and in cell code', () => expectRoundTrip('| a | b |\n|---|---|\n| x \\| y | `p\\|q` |'));
  it('[C.7] empty cell', () => expectRoundTrip('| a | b |\n|---|---|\n|  | y |'));

  it('[C.8] link title containing quotes', () => expectRoundTrip('[t](https://x.y "say \\"hi\\"")'));
  it('[C.8] link URL with parentheses', () => expectRoundTrip('[t](https://x.y/a_(b))'));
  it('[C.8] link URL with a space', () => expectRoundTrip('[t](<https://x.y/a b>)'));
  it('[C.8] image size', () => expectRoundTrip('![alt](i.png =40x20)'));
  it('[C.8] image title and size', () => expectRoundTrip('![a](i.png "T" =40x)'));
  it('[C.8] bare autolink copies as the bare URL', () => {
    expect(copyOf('Visit https://orz.how now.')).toBe('Visit https://orz.how now.');
  });

  it('[C.9] footnote with a word label', () => {
    const src = 'Text[^note].\n\n[^note]: The note.';
    expectRoundTrip(src);
    expect(copyOf(src)).toContain('[^note]: The note.');
  });
  it('[C.9] footnote with a Chinese label', () => {
    expect(copyOf('正文[^注]。\n\n[^注]: 注释内容。')).toContain('[^注]: 注释内容。');
  });
  it('[C.9] inline footnote', () => expectRoundTrip('Text^[an inline note].'));

  it('[C.10] custom container', () => expectRoundTrip('::: myblock\nInside.\n:::'));
  it('[C.10] spoiler label with Markdown', () => expectRoundTrip('::: spoil **Answer** $x$\nhidden\n:::'));
  it('[C.10] cols ratios and left width', () => expectRoundTrip(':::: cols 1 2\n::: col\nA\n:::\n::: col\nB\n:::\n::::\n\n::: left 30%\nside\n:::'));
  it('[C.10] three-level nesting', () => expectRoundTrip(':::: cols\n::: col\n::: info\n**A**\n:::\n:::\n::::'));

  it('[C.11] toc copies back as its directive', () => {
    const copied = copyOf('{{toc 2,3}}\n\n## A\n\n### B');
    expect(copied).toContain('{{toc 2,3}}');
    expect(copied).not.toContain('](#');
  });
  it('[C.11] mermaid, smiles and qr directives', () => expectRoundTrip('{{mermaid\ngraph LR; A-->B\n}}\n\n{{smiles CCO}}\n\nScan {{qr https://orz.how}}'));

  it('[C.12] block ids are not copied', () => {
    expect(copyOf('## Title{{attrs[#blk-abc12345]}}\n\nBody.')).not.toContain('blk-');
  });

  it('[C.13] full-width spaces survive', () => expectRoundTrip('\u3000\u3000段落缩进。'));
  it('[C.13] non-breaking space survives', () => expectRoundTrip('a\u00a0b'));

  it('[C.17] inline raw HTML: kbd, abbr, ruby', () => expectRoundTrip('Press <kbd>Ctrl</kbd>, see <abbr title="x">HTML</abbr>, read <ruby>汉<rt>hàn</rt></ruby>.'));
});
