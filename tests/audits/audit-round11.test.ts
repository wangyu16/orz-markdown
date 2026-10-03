/**
 * Round-11 regressions: each test reproduces a finding of the round-10
 * adversarial audits (notes/closed-loop.md, round 11), bound to the claim it
 * falsified.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { md, prepareSources, extractDocMeta } from '../../src/index';
import { unescapeScriptText } from '../../src/html';
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

const URL_A = 'https://e.test/a';
const one = (fetched: string) => ({ fetcher: async () => fetched });

describe('includes — channels outside raw HTML (half A)', () => {
  it.each([
    '<span id="intro">x</span>',
    '<div id="intro">\n\nx\n\n</div>',
    'See <a name="intro"></a>here.',
  ])('[M.16] an id written in fetched raw HTML cannot duplicate a host id (H1): %s', async (fetched) => {
    const host = `## Intro\n\nSee [intro](#intro).\n\n{{md ${URL_A}}}`;
    expect(await prepareSources(host, one(fetched))).toBe(host);
  });

  it.each([
    '{{sp <img src=x onerror="window.__pwned=1">}}',
    '{{sp <custom-elem>x</custom-elem>}}',
    'Para {{attrs[onmouseover=alert(1)]}}',
    '::: spoil <img src=x onerror="alert(1)">\nx\n:::',
    '::: spoil <div>\nx\n:::',
  ])('[M.16] markup re-emitted by orz directives passes the same allowlist (H2): %s', async (fetched) => {
    const host = `{{md ${URL_A}}}\n\nHOST-AFTER`;
    expect(await prepareSources(host, one(fetched))).toBe(host);
  });

  it('[M.16] harmless directives in an include still splice', async () => {
    const out = await prepareSources(`{{md ${URL_A}}}`, one('{{sp[info] **bold** <kbd>K</kbd>}}\n\n::: spoil *Answer*\nx\n:::\n\nPara {{attrs[#inc-1]}}'));
    const html = md.render(out);
    expect(html).toContain('<span class="info"><strong>bold</strong> <kbd>K</kbd></span>');
    expect(html).toContain('<summary');
    expect(html).toContain('id="inc-1"');
  });
});

describe('yaml islands (H3)', () => {
  it.each(['</script>', '</script >', '</script/>', '</script\tx>', '</SCRIPT>', '<!--<script>'])(
    '[M.19] a yaml body containing %j never ends its island, and reads back exactly', (tag) => {
      const body = `a: 1\nb: "${tag}<img src=x onerror=alert(1)>"`;
      const html = md.render(`{{yaml\n${body}\n}}`);
      const inner = html.match(/<script type="application\/yaml"[^>]*>\n([\s\S]*)\n<\/script>\n$/)![1];
      expect(inner).not.toMatch(/<\/script[\s/>]/i);
      expect(unescapeScriptText(inner)).toBe(body);
    });
});

describe('rendering and copy — half B', () => {
  const shapes: Array<[string, (n: number) => string]> = [
    ['invalid scheme glued to CJK', (n) => 'a://中'.repeat(n)],
    ['scheme with a dash host', (n) => '中https://-中'.repeat(n)],
    ['non-CJK after an invalid scheme', (n) => 'x://é'.repeat(n)],
    ['host glued to CJK', (n) => '见https://a.com获取'.repeat(n)],
    ['open full-width brackets', (n) => '见 a.com /' + '（/'.repeat(n * 4)],
    ['bracket in many URLs', (n) => 'https://a.com/（xxxxxxxxxx '.repeat(n)],
  ];
  it.each(shapes)('[R.5] linkify stays linear: %s (H1)', (_name, make) => {
    // Sizes large enough that the small run is not a few noisy milliseconds.
    const small = make(2500), large = make(10000);
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
    expect(ms).toBeLessThan(5000); // was 70 s at 80 KB
  }, 120_000);

  it.each([
    '<https://a.com/x>获取更多', '<https://a.com/wiki>（注）', '[https://a.com/docs](https://a.com/docs)获取', '<https://a.com/>好',
    'Sources: [https://example.com/report]', 'text<https://a.com/b>', '[www.example.com]', 'see <https://a.com/x>。',
  ])('[C.8] a bare URL copies so that it links the same target again (H2): %s', (src) => roundTrip(src));
  it('[C.8] … and stays bare where that is safe', () => {
    expect(copyOf('Visit https://orz.how now.')).toBe('Visit https://orz.how now.');
    expect(copyOf('访问 https://orz.how 获取')).toBe('访问 https://orz.how 获取');
    expect(copyOf('见https://orz.how/a。')).toBe('见https://orz.how/a。');
  });

  it.each(['https://twitter.com/search?q=%23中国', 'https://en.cppreference.com/w/C%2B%2B标准'])(
    '[R.3] CJK after an escaped ASCII character is still the query (H4): %s', (url) => {
      const href = md.renderInline(` ${url} `).match(/href="([^"]*)"/)![1];
      expect(decodeURI(href)).toBe(url.replace(/%23|%2B/g, (m) => m)); // the whole URL, query included
    });

  it('[M.6] metadata extraction is idempotent when meta blocks are glued together (M1)', () => {
    for (const src of ['{{nyml\nkind: meta\ntitle: A\n}}{{nyml\nkind: meta\ntitle: B\n}}\n\nBody', '{{nyml kind: meta}} {{nyml\nkind: meta\ntitle: B\n}}\n\nBody']) {
      const once = extractDocMeta(src);
      const twice = extractDocMeta(once.body);
      expect(twice.meta).toEqual({});
      expect(twice.body).toBe(once.body);
    }
  });
  it('[M.1] a CR-only source leaves no blank lines before the body (L3)', () => {
    expect(extractDocMeta('{{nyml\rkind: meta\rtitle: T\r}}\r\rBody').body).toBe('Body');
  });

  it.each(['- > a\n\n  | a | b |\n  |---|---|\n  | 1 | 2 |', '- - x\n\n  * y', '- > q\n  - n'])(
    '[C.6] blocks of a tight item stay apart (M2): %s', (src) => roundTrip(src));
  it('[C.3] a literal "^" before a link is not an inline footnote (L2)', () => roundTrip('\\^[link](https://x.y)'));
});
