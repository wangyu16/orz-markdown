/**
 * Round-12 regressions: each test reproduces a finding of the round-11
 * adversarial audits (notes/closed-loop.md, round 12), bound to the claim it
 * falsified.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { md, prepareSources, extractDocMeta } from '../../src/index';
import { browserRuntimeScript } from '../../src/runtime';
import { normalize } from '../helpers/normalize';

type DomDoc = { createElement(tag: string): { className: string; innerHTML: string } };
let doc: DomDoc;
let e2m: (n: unknown) => string;
beforeAll(async () => {
  const { Window } = await import('happy-dom');
  doc = new Window().document as unknown as DomDoc;
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

const URL_A = 'https://e.test/a';
const HOST = `{{md ${URL_A}}}\n\nHOST-AFTER`;
const one = (fetched: string) => ({ fetcher: async () => fetched });

describe('includes — half A', () => {
  it.each([
    '{{sp ``` <img src=x onerror="window.__pwned=1">}}',
    '{{sp [a]: <img src=x onerror="window.__pwned=1">}}',
    '{{sp $$ <img src=x onerror="window.__pwned=1">}}',
    '::: spoil ~~~ <img src=x onerror="window.__pwned=1">\nx\n:::',
  ])('[M.16] {{sp}} bodies and spoil labels are checked as the renderer parses them — inline (H1): %s', async (fetched) => {
    expect(await prepareSources(HOST, one(fetched))).toBe(HOST);
  });

  it.each([
    '<a href="javascript:window.__pwned=1">click</a>',
    '<a href="&#106;avascript:window.__pwned=1">click</a>',
    '<a href="java&#9;script:window.__pwned=1">click</a>',
    '<a href="&#106avascript&#58window.__pwned=1">click</a>', // no ";" (D-127 adversary round 1)
    '<a href=&#X6a&#x61vascript&#x3a;x>click</a>',
    '<a href=" JAVASCRIPT:x">click</a>',
    '<img src="x.png" srcset="ok.png 1x, javascript:x 2x">',
    '<a href="vbscript:x">click</a>',
    '<span data-md="{{md /etc/passwd}}">x</span>',
    '<span data-orz-container="spoil x">x</span>',
    '<span tabindex="0" accesskey="x">x</span>',
    'FAKE {{attrs[href="javascript:x"]}}',
  ])('[M.16] attributes in fetched text: an allowlist, URLs validated like Markdown links (H2, L1): %s', async (fetched) => {
    expect(await prepareSources(HOST, one(fetched))).toBe(HOST);
  });

  it.each([
    '<div style="position:fixed;inset:0;z-index:99999;background:#fff">FAKE</div>',
    '<div style="margin-top:-500px">FAKE</div>',
    '<div style="transform:translateY(-500px)">FAKE</div>',
    '<div style="background:url(https://evil.example/x.png)">FAKE</div>',
    'FAKE {{attrs[style="position:fixed;inset:0"]}}',
  ])('[M.16] a fetched style cannot lift content out of its place (H3): %s', async (fetched) => {
    expect(await prepareSources(HOST, one(fetched))).toBe(HOST);
  });

  it('[M.16] ordinary attributes still splice', async () => {
    const out = await prepareSources(HOST, one('<a href="https://ok.example/" title="t">ok</a> <abbr title="HyperText">HTML</abbr>\n\n- [ ] task\n- [x] done\n\n<img src="a.png" alt="a" width="40">\n\n| a | b |\n|:-|-:|\n| 1 | 2 |\n\n{{sp[red] red}}\n\n::: info\nNote.\n:::'));
    const html = md.render(out);
    expect(html).toContain('href="https://ok.example/"');
    expect(html).toContain('task-list-item-checkbox');
    expect(html).toContain('style="text-align:right"');
    expect(html).toContain('<span class="red">');
  });

  it('[R.7] ::: left and ::: cols put only CSS lengths into a style attribute', () => {
    expect(md.render('::: left 1px;position:fixed\nx\n:::')).not.toContain('style=');
    expect(md.render('::: cols 1fr;position:fixed\n::: col\na\n:::\n::::')).not.toContain('style=');
    expect(md.render('::: left 30%\nx\n:::')).toContain('style="max-width: 30%; width: 30%"');
    expect(md.render(':::: cols 1 2\n::: col\na\n:::\n::::')).toContain('style="grid-template-columns: 1fr 2fr"');
  });

  it('[R.7] a {{qr}} past the code\'s capacity does not take down the render (M1)', () => {
    const html = md.render('Before.\n\n{{qr ' + 'a'.repeat(5000) + '}}\n\nAfter.');
    expect(html).toContain('<p>After.</p>');
    expect(html).toContain('{{qr aaaa');
  });
});

describe('rendering and copy — half B', () => {
  it.each([
    'Site: https://a.com/docs  \nNext line', '<https://a.com/x>.html', '<https://a.com/x>?q=1', '<https://a.com>:8080', '<https://a.com/x>,b',
    '<https://a.com/x>;x', '<https://a.com/x>!x', '<https://a.com/x>"x', '<https://a.com/x*>', '中<mailto:a@b.com>', '"www.baidu.com"',
    'https://orz.how_', '[t](https://a.com/x&copy;)',
  ])('[C.8] copy never changes, adds or loses a link target (H1, L3–L5): %s', (src) => roundTrip(src));
  it('[C.8] … and stays bare where it is safe', () => {
    expect(copyOf('Visit https://orz.how now.')).toBe('Visit https://orz.how now.');
    expect(copyOf('见https://orz.how/a。')).toBe('见https://orz.how/a。');
  });

  const cut: Array<[string, (n: number) => string]> = [
    ['URL then 。', (n) => 'https://a.com/x。'.repeat(n)],
    ['URL then ，中', (n) => 'https://a.com/x，中'.repeat(n)],
    ['URL then “', (n) => 'https://a.com/x“'.repeat(n)],
    ['encoded CJK then raw CJK', (n) => 'https://a.com/%E4%B8%AD获取'.repeat(n)],
    ['prose paragraphs', (n) => Array.from({ length: n / 4 }, (_, i) => `https://a.com/p${i}。${'中文内容'.repeat(25)}`).join('')],
  ];
  it.each(cut)('[R.5] URLs cut at CJK punctuation in unspaced prose render linearly (H2): %s', (_name, make) => {
    const small = make(1000), large = make(4000);
    let r = Infinity, ms = Infinity;
    for (let round = 0; round < 3 && r >= 8; round++) {
      let a = Infinity, b = Infinity;
      for (let i = 0; i < 3; i++) {
        let t = performance.now(); md.render(small); a = Math.min(a, performance.now() - t);
        t = performance.now(); md.render(large); b = Math.min(b, performance.now() - t);
      }
      if (b / Math.max(a, 1) < r) { r = b / Math.max(a, 1); ms = b; }
    }
    expect(r).toBeLessThan(8);
    expect(ms).toBeLessThan(5000); // was 19 s
  }, 120_000);

  it.each(['- - a\n  - b\n\n  | x | y |\n  |---|---|\n  | 1 | 2 |', '- > a\n\n  > b', '- | a |\n  |---|\n  | 1 |\n\n  | b |\n  |---|\n  | 2 |'])(
    '[C.6] blocks of an item without paragraphs stay apart (M1): %s', (src) => roundTrip(src));

  it('[M.6] extraction is idempotent for any number of glued meta blocks (L1)', () => {
    const src = Array.from({ length: 12 }, (_, i) => `{{nyml\nkind: meta\ntitle: T${i}\n}}`).join('') + '\n\nBody';
    const once = extractDocMeta(src);
    expect(extractDocMeta(once.body)).toEqual({ meta: {}, body: once.body });
  });
});
