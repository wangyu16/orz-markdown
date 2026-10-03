/**
 * Rendering claims for Chinese/English text (R.*) and the consumer surfaces
 * hosts build on — nyml scanning, document metadata, prepareSources (M.*).
 */
import { describe, it, expect } from 'vitest';
import { md, scanNymlBlocks, extractDocMeta, prepareSources, maskInertMarkdown } from '../src/index';

const html = (src: string) => md.render(src).trim();

describe('R — Chinese and English rendering', () => {
  it('[R.1] bold closes before CJK punctuation', () => {
    expect(html('**注意：**请先阅读。')).toBe('<p><strong>注意：</strong>请先阅读。</p>');
  });
  it('[R.1] bold around CJK quotation marks', () => {
    expect(html('这是**“重点”**内容')).toBe('<p>这是<strong>“重点”</strong>内容</p>');
  });
  it('[R.1] emphasis between CJK characters', () => {
    expect(html('中文*强调*中文')).toBe('<p>中文<em>强调</em>中文</p>');
  });
  it('[R.1] English emphasis rules are unchanged', () => {
    expect(html('a**b**c and **foo**bar')).toBe('<p>a<strong>b</strong>c and <strong>foo</strong>bar</p>');
    expect(html('snake_case_word')).toBe('<p>snake_case_word</p>');
    expect(html('2 * 3 * 4')).toBe('<p>2 * 3 * 4</p>');
    expect(html('**"quoted"**text')).toBe('<p>**“quoted”**text</p>');
  });

  it('[R.2] no whitespace between two CJK lines', () => {
    expect(html('第一行\n第二行')).toBe('<p>第一行第二行</p>');
  });
  it('[R.2] English and mixed line breaks keep their space', () => {
    expect(html('line one\nline two')).toBe('<p>line one\nline two</p>');
    expect(html('中文\nEnglish')).toBe('<p>中文\nEnglish</p>');
  });

  it('[R.3] a bare URL followed by Chinese links only the URL', () => {
    expect(html('访问https://orz.how获取更多')).toBe('<p>访问<a href="https://orz.how">https://orz.how</a>获取更多</p>');
  });
  it('[R.3] a URL path followed by Chinese', () => {
    expect(html('见 https://orz.how/docs/a.html。然后')).toBe('<p>见 <a href="https://orz.how/docs/a.html">https://orz.how/docs/a.html</a>。然后</p>');
  });
});

describe('M — metadata and scanning', () => {
  const LF = '{{nyml\nkind: meta\ntitle: 标题\nauthor: 王\ndescription: |\n  第一行\n  第二行\n}}\n\n# 正文\n';
  const CRLF = LF.replace(/\n/g, '\r\n');

  it('[M.1] CRLF sources scan exactly like LF', () => {
    const lf = scanNymlBlocks(LF)[0];
    const crlf = scanNymlBlocks(CRLF)[0];
    expect(crlf.kind).toBe('meta');
    expect(crlf.fields).toEqual(lf.fields);
  });
  it('[M.1] CRLF metadata and nyml JSON match LF', () => {
    expect(extractDocMeta(CRLF).meta).toEqual(extractDocMeta(LF).meta);
    expect(md.render('{{nyml\r\na: 1\r\nb: |\r\n  x\r\n}}\r\n')).toBe(md.render('{{nyml\na: 1\nb: |\n  x\n}}\n'));
  });

  it('[M.2] full-width colon separates key and value', () => {
    const block = scanNymlBlocks('{{nyml\nkind：meta\ntitle：中文标题：副标题\n}}')[0];
    expect(block.kind).toBe('meta');
    expect(block.fields.title).toBe('中文标题：副标题');
    expect(md.render('{{nyml\ntitle：中文\n}}')).toContain('"title": "中文"');
  });

  it('[M.3] keywords split on Chinese and English separators', () => {
    const { meta } = extractDocMeta('{{nyml\nkind: meta\nkeywords: 化学，聚合物、材料; polymers；chemistry, a\n}}');
    expect(meta.keywords).toEqual(['化学', '聚合物', '材料', 'polymers', 'chemistry', 'a']);
  });

  it('[M.4] BOM-prefixed source', () => {
    const { meta, body } = extractDocMeta('﻿{{nyml\nkind: meta\ntitle: T\n}}\n\n# H\n');
    expect(meta.title).toBe('T');
    expect(body).not.toContain('{{nyml');
  });

  it('[M.5] scanning scales linearly (1 MB, 40,000 unmatched backtick runs)', () => {
    // Ratio, not wall clock: both sizes run under the same machine load, so the
    // check holds on a busy CI box. Quadratic code shows ~16x for 4x the input.
    const oneLine = (size: number) => { let s = ''; for (let i = 0; s.length < size; i++) s += i % 2 ? 'word ` more ' : 'text `` and '; return s; };
    const lines = (size: number) => { let s = ''; for (let i = 0; s.length < size; i++) s += 'para ` x `` y\n' + (i % 5 === 0 ? '\n' : ''); return s; };
    const timeScan = (body: string) => {
      const src = body + '\n\n{{nyml\nkind: meta\ntitle: T\n}}\n';
      let blocks = scanNymlBlocks(src); // warm the JIT
      let ms = Infinity; // best of three: ratios of minima are stable under load
      for (let k = 0; k < 3; k++) {
        const t0 = performance.now();
        blocks = scanNymlBlocks(src);
        ms = Math.min(ms, performance.now() - t0);
      }
      expect(blocks.length).toBe(1);
      return ms;
    };
    for (const make of [oneLine, lines]) {
      // A real quadratic fails every round; a load spike does not.
      let r = Infinity;
      for (let round = 0; round < 3 && r >= 8; round++) r = Math.min(r, timeScan(make(1_000_000)) / Math.max(timeScan(make(250_000)), 1));
      expect(r).toBeLessThan(8);
    }
  }, 180_000);

  it('[M.6] extractDocMeta is idempotent', () => {
    const once = extractDocMeta(LF);
    const twice = extractDocMeta(once.body);
    expect(twice.meta).toEqual({});
    expect(twice.body).toBe(once.body);
  });

  it('[M.7] prepareSources fetches each distinct URL once', async () => {
    let calls = 0;
    const src = Array.from({ length: 200 }, () => '{{md-include https://a.test/x.md}}').join('\n\n');
    await prepareSources(src, { fetcher: async () => { calls++; return 'part'; } });
    expect(calls).toBe(1);
  });
  it('[M.7] prepareSources stops expanding past maxSize', async () => {
    const big = 'x'.repeat(1000);
    const src = Array.from({ length: 50 }, (_, i) => `{{md-include https://a.test/${i}.md}}`).join('\n\n');
    const out = await prepareSources(src, { fetcher: async () => big, maxSize: 10_000 });
    expect(out.length).toBeLessThan(12_000);
    expect(out).toContain('{{md-include https://a.test/49.md}}');
  });
});
