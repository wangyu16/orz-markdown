/**
 * Round-8 regressions: each test reproduces a finding of the round-7
 * adversarial audit (notes/closed-loop.md, round 8), bound to the claim it
 * falsified.
 */
import { describe, it, expect } from 'vitest';
import MarkdownIt from 'markdown-it';
import { md, extractDocMeta, prepareSources } from '../../src/index';

/** Cost ratio large/small; interleaved best of three, best of up to three rounds. */
async function ratio(small: () => unknown, large: () => unknown, bound = 8): Promise<[number, number]> {
  await small(); await large();
  let best: [number, number] = [Infinity, Infinity];
  for (let round = 0; round < 3 && best[0] >= bound; round++) {
    let a = Infinity, b = Infinity;
    for (let i = 0; i < 3; i++) {
      let t = performance.now(); await small(); a = Math.min(a, performance.now() - t);
      t = performance.now(); await large(); b = Math.min(b, performance.now() - t);
    }
    if (b / Math.max(a, 1) < best[0]) best = [b / Math.max(a, 1), b];
  }
  return best;
}
const URL_A = 'https://e.test/a';
const one = (fetched: string) => ({ fetcher: async () => fetched });

describe('prepareSources — what the host renders cannot change (H1, H2, M1–M5)', () => {
  it('[M.16] an include cannot rewrite a host footnote (H1)', async () => {
    const host = `Safe claim[^src].\n\n[^src]: FDA report\n\n{{md ${URL_A}}}`;
    const out = await prepareSources(host, one('[^src]: EVIL-FAKE-SOURCE'));
    expect(md.render(out)).not.toContain('EVIL-FAKE-SOURCE');
    // A footnote of its own still joins the list.
    const ok = await prepareSources(host, one('Included[^inc].\n\n[^inc]: Its own note.'));
    expect(md.render(ok)).toContain('Its own note.');
  });

  const htmlAttacks: Array<[string, string]> = [
    [`- {{md ${URL_A}}}\n\nHOST-AFTER`, '<!--'],
    [`> {{md ${URL_A}}}\n\nHOST-AFTER`, '<!--'],
    [`{{md ${URL_A}}}\n\nHOST-AFTER`, '<div>\n<!--'],
    [`{{md ${URL_A}}}\n\nHOST-AFTER`, '<div style="display:none">'],
    [`::: spoil Answer\n{{md ${URL_A}}}\n\nHidden answer.\n:::`, '</details>'],
    [`::: info\n{{md ${URL_A}}}\n\nInside.\n:::\n\nHOST-AFTER`, '</div>'],
    [`{{md ${URL_A}}}\n\nHOST-AFTER`, '<style>body{display:none}</style>'],
    // round 9, HIGH-1: "/>" does not close an HTML element
    [`{{md ${URL_A}}}\n\nHOST-AFTER`, '<div style="display:none"/>'],
    [`A\n\n{{md ${URL_A}}}\n\nHOST-AFTER`, '<DIV class="injected" />'],
    [`{{md ${URL_A}}}\n\nHOST-AFTER`, 'Text <span/> here.'],
  ];
  it.each(htmlAttacks)('[M.16] raw HTML that reaches past the include is refused: %s ← %s (H2)', async (host, fetched) => {
    expect(await prepareSources(host, one(fetched))).toBe(host);
  });
  it('[M.16] ordinary raw HTML in an include is fine (the allowlist)', async () => {
    const fetched = [
      'Press <kbd>Ctrl</kbd>.<br/> <ruby>汉<rp>(</rp><rt>hàn</rt><rp>)</rp></ruby>',
      '<details><summary>More</summary>\n\nText.\n\n</details>',
      '<img src="x.png" alt="x"/>',
      '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>',
      '<ul><li>one</li><li>two</li></ul>',
      '<div align="center">\n\n**Markdown** inside.\n\n</div>',
      '<!-- a comment -->',
    ].join('\n\n');
    const html = md.render(await prepareSources(`{{md ${URL_A}}}`, one(fetched)));
    for (const bit of ['<kbd>Ctrl</kbd>', '<rt>hàn</rt>', '<summary>More</summary>', '<th>A</th>', '<li>two</li>', '<strong>Markdown</strong>']) expect(html).toContain(bit);
  });
  // Round 10: the allowlist refuses what the browser parses specially.
  const refused = [
    '<svg><div style="display:none"/></svg>', '<svg><foreignObject><div/></foreignObject></svg>', '<math><mi><div style="display:none"/></mi></math>',
    '<!--><div style="display:none"><!-- -->', '<!---><div style="display:none"><!-- -->', '<!-- x --!><div style="display:none"><!-- -->',
    '<div style=display:none', "<div title='", '<plaintext></plaintext>', '<xmp><!--</xmp><div style="display:none">--></xmp>',
    '<noscript><!--</noscript><div style="display:none">--></noscript>', '<textarea></textarea>', '<ul><li><div><li>x</li></div></li></ul>',
    '<table><tr><td><div><td></td></div></td></tr></table>', '- a <div>\n- b </div>', '<img src=x onerror="alert(1)">', '<svg width="9"><circle r="5"/></svg>',
    '[link <a href="#">x</a>](https://x.y)',
  ];
  it.each(refused)('[M.16] refused: %s', async (fetched) => {
    for (const host of [`{{md ${URL_A}}}\n\nHOST-AFTER`, `::: info\n{{md ${URL_A}}}\n\nHOST-AFTER\n:::`]) {
      expect(await prepareSources(host, one(fetched))).toBe(host);
    }
  });

  it('[M.16] an include cannot take a host heading id or duplicate an explicit id (M1)', async () => {
    const host = `{{md ${URL_A}}}\n\n## Safety\n\nSee [the safety notes](#safety).`;
    const out = await prepareSources(host, one('## Safety\n\nFetched.'));
    expect(md.render(out)).toContain('<h2 id="safety"');
    expect(md.render(out).match(/id="safety"/g)).toHaveLength(1);
    const dup = await prepareSources(`{{attrs[#blk-1]}}\n## Host\n\n{{md ${URL_A}}}`, one('{{attrs[#blk-1]}}\n## Fetched'));
    expect(md.render(dup).match(/id="blk-1"/g)).toHaveLength(1);
  });

  it('[M.16] keeps the host\'s lists as they were: tightness and numbering (M3)', async () => {
    const tight = md.render(await prepareSources(`- a\n- {{md ${URL_A}}}\n- c`, one('B')));
    expect(tight).toBe('<ul>\n<li>a</li>\n<li>B</li>\n<li>c</li>\n</ul>\n');
    const steps = md.render(await prepareSources(`{{md ${URL_A}}}\n\n1. step one\n2. step two`, one('1. x\n2. y')));
    expect(steps).not.toMatch(/<li>x<\/li>[\s\S]*<li>step one/); // host steps never renumbered into the include's list
  });

  it('[M.11] in a task item, included paragraphs stay paragraphs (M4)', async () => {
    const html = md.render(await prepareSources(`- [ ] {{md ${URL_A}}}`, one('a\n\nb')));
    expect(html).not.toContain('<pre>');
    expect(html).toContain('<p>b</p>');
  });

  const unsplittable = [
    `**read {{md ${URL_A}}} carefully**`,
    `[the syllabus {{md ${URL_A}}}](https://x.y)`,
    `## Title {{md ${URL_A}}}`,
    `| a |\n|---|\n| {{md ${URL_A}}} |`,
  ];
  it.each(unsplittable)('[M.11] a directive inside emphasis, link text, a heading or a cell stays in place (M5, L3): %s', async (host) => {
    expect(await prepareSources(host, one('Fetched.'))).toBe(host);
  });

  it('[M.16] an included document\'s metadata block is not the host\'s (M2)', async () => {
    const fetched = '{{nyml\nkind: meta\nauthor: EVIL\nsource: https://evil.example/\n}}\n\nBody.';
    expect(extractDocMeta(await prepareSources(`{{md ${URL_A}}}\n\nHost.`, one(fetched))).meta).toEqual({});
    const host = `{{md ${URL_A}}}\n\n{{nyml\nkind: meta\nauthor: Host Author\n}}`;
    expect(extractDocMeta(await prepareSources(host, one(fetched))).meta.author).toBe('Host Author');
  });

  it('[M.16] an include cannot take the host\'s nyml-data id (round 10, L3)', async () => {
    const host = `{{md ${URL_A}}}\n\n{{nyml\nkind: data\na: 1\n}}`;
    const out = await prepareSources(host, one('{{nyml\nkind: data\nevil: 1\n}}'));
    const first = md.render(out).match(/id="nyml-data"[^>]*>([\s\S]*?)<\/script>/)![1];
    expect(first).toContain('"a": "1"');
    expect(first).not.toContain('evil');
  });

  it('[M.16] a {{toc}} in the host does not refuse includes with headings (M7)', async () => {
    const out = await prepareSources(`{{toc}}\n\n## A\n\n{{md ${URL_A}}}`, one('## B\n\nFetched.'));
    expect(out).toContain('## B');
  });

  it('[M.11] an empty included file leaves the host\'s lists apart (L1)', async () => {
    const out = await prepareSources(`- a\n\n{{md ${URL_A}}}\n\n- b`, one(''));
    expect(md.render(out).match(/<ul>/g)).toHaveLength(2);
  });

  it('[M.7] maxSize counts the continuation prefixes too (M6)', async () => {
    // 4.5 KB on its own (under the limit); ~40 KB once every line carries the quote prefix.
    const fetched = Array.from({ length: 1500 }, () => 'x').join('\n\n');
    const out = await prepareSources(`> > > > > > {{md ${URL_A}}}`, { fetcher: async () => fetched, maxSize: 10_000 });
    expect(out.length).toBeLessThanOrEqual(10_000);
  });
});

describe('linkify narrowing is never worse than linkify-it alone (H3)', () => {
  const plain = new MarkdownIt({ linkify: true });
  const urls = [
    'https://zh.wikipedia.org/wiki/Python_(编程语言)', 'https://www.百度.com/', 'http://新华网.中国/',
    'https://ex.com/tags/机器学习,深度学习', 'https://s.com/?q=北京+天气', 'https://zh.wikipedia.org/wiki/中华人民共和国_国歌',
    'https://x.com/book#第1章', 'https://zh.wikipedia.org/wiki/Category:中国', 'https://zh.wikipedia.org/wiki/化学',
    'https://www.google.com/search?q=中文', 'https://x.com/a%E4%B8%AD', 'www.example.com/路径/文件',
    // round 9, HIGH-2: ASCII letter → CJK (or emoji) inside a path
    'https://baike.baidu.com/item/Java语言', 'https://zh.wikipedia.org/wiki/Python编程', 'www.example.com/Java语言',
    'http://ex.com/v2章节', 'http://ex.com/a😀b', 'https://ja.wikipedia.org/wiki/東京タワー', 'https://ko.wikipedia.org/wiki/서울',
    // round 10, H2: letters and numbers in U+3000–303F
    'https://ja.wikipedia.org/wiki/佐々木朗希', 'https://x.org/wiki/人々', 'https://x.org/wiki/二〇二四年', 'https://x.org/wiki/〆切',
    'https://zh.wikipedia.org/wiki/中华人民共和国（1949年）',
  ];
  it('[R.3] in a host, CJK after an ASCII digit is prose (round 10, L1)', () => {
    expect(md.renderInline('访问http://192.168.1.1获取')).toBe('访问<a href="http://192.168.1.1">http://192.168.1.1</a>获取');
  });
  it.each(urls)('[R.3] with spaces around it, %s links exactly as plain markdown-it links it', (url) => {
    const href = (html: string) => html.match(/href="([^"]*)"/)?.[1];
    expect(href(md.renderInline(`见 ${url} 页面`))).toBe(href(plain.renderInline(`见 ${url} 页面`)));
  });
});

describe('linear again (H4, H5, H6, M8)', () => {
  it('[R.5] Chinese prose with many glued links renders linearly (H4)', async () => {
    const para = (n: number) => Array.from({ length: n }, (_, i) => `参见https://ex.com/p${i}和`).join('');
    const small = para(1000), large = para(4000);
    const [r, ms] = await ratio(() => md.render(small), () => md.render(large));
    expect(r).toBeLessThan(8);
    expect(ms).toBeLessThan(5000); // was 34 s
  }, 120_000);

  it('[M.5] unclosed "[" in directive args parses linearly, block and inline (H6)', async () => {
    const block = (n: number) => Array.from({ length: n }, (_, i) => `{{nyml[x ${i}`).join('\n');
    expect((await ratio(() => md.render(block(2000)), () => md.render(block(8000))))[0]).toBeLessThan(8);
    expect((await ratio(() => extractDocMeta(block(2000)), () => extractDocMeta(block(8000))))[0]).toBeLessThan(8);
    const inline = (n: number, tail: string) => '{{emoji[x '.repeat(n) + tail;
    for (const tail of ['', ']']) {
      expect((await ratio(() => md.render(inline(5000, tail)), () => md.render(inline(20000, tail))))[0]).toBeLessThan(8);
    }
  }, 120_000);

  it('[M.18] one refused include among many costs a bounded number of checks (H5)', async () => {
    const host = (n: number) => Array.from({ length: n }, (_, i) => `{{md https://e.test/${i === 3 ? 'bad' : 'ok'}}}`).join('\n\n');
    const fetcher = async (u: string) => (u.endsWith('bad') ? '```\nopen\n\n- swallow' : 'Fine.');
    const small = host(100), large = host(400);
    const [r, ms] = await ratio(() => prepareSources(small, { fetcher }), () => prepareSources(large, { fetcher }));
    expect(r).toBeLessThan(8);
    expect(ms).toBeLessThan(10_000);
  }, 180_000);

  it('[M.18] a file included many times is resolved once per position in the chain (H5)', async () => {
    const files: Record<string, string> = {
      'https://e.test/root': Array.from({ length: 30 }, () => '{{md https://e.test/mid}}').join('\n\n'),
      'https://e.test/mid': Array.from({ length: 30 }, () => '{{md https://e.test/leaf}}').join('\n\n'),
      'https://e.test/leaf': 'Leaf.',
    };
    const t0 = performance.now();
    const out = await prepareSources('{{md https://e.test/root}}', { fetcher: async (u) => files[u] ?? null });
    expect(out.match(/Leaf\./g)).toHaveLength(900);
    expect(performance.now() - t0).toBeLessThan(10_000);
  }, 60_000);

  it('[M.18] directives spread over quote lines are located linearly (M8)', async () => {
    const doc = (n: number) => Array.from({ length: n }, () => `> x {{md\n> ${URL_A}}}`).join('\n\n');
    const fetcher = async () => 'y';
    expect((await ratio(() => prepareSources(doc(1000), { fetcher }), () => prepareSources(doc(4000), { fetcher })))[0]).toBeLessThan(8);
  }, 120_000);
});
