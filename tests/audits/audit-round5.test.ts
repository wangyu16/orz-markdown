/**
 * Round-5 regressions: each test reproduces a finding of the round-4
 * adversarial audit (notes/closed-loop.md, round 5), bound to the claim it
 * falsified.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { md, extractDocMeta, scanNymlBlocks, prepareSources, maskInertMarkdown } from '../../src/index';
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

const dir = mkdtempSync(join(tmpdir(), 'orz-r5-'));
writeFileSync(join(dir, 'secret.md'), 'SECRET-TOKEN=abc123\n');
const secret = `${dir}/secret.md`;

describe('security — round-5 findings', () => {
  // Every shape where scanner and renderer could disagree about "live" text.
  const bodies = [
    `a \`b\n{{md ${secret}}}\nc\` d`,
    `\`\`\n{{md ${secret}}}\n\`\``,
    `a <!-- b\n{{md ${secret}}}\n-->`,
    `x<!--\n{{md ${secret}}}\n-->`,
    `\`\`\` a \` b\n{{md ${secret}}}\n\`\`\``,
    `- step\n\n  \`\`\`\n{{md ${secret}}}\n  \`\`\``,
    `- \`\`\`\n{{md ${secret}}}\n\`\`\``,
    `1) x\n   \`\`\`\n{{md ${secret}}}`,
    `text\n<span>\n{{md ${secret}}}`,
    `intro\n\n\t{{md ${secret}}}`,
  ];
  it.each(bodies)('[M.13] fetched text cannot read a local file: %s', async (body) => {
    for (const host of ['{{md https://evil.test/a}}', 'See {{md https://evil.test/a}}', '> {{md https://evil.test/a}}', '- {{md https://evil.test/a}}']) {
      const out = await prepareSources(host, { fetcher: async () => body });
      expect(md.render(out, { markdownBasePath: '/' }), host).not.toContain('SECRET-TOKEN');
    }
  });
  it('[M.13] fetched text ending inside an open fence cannot flip the host\'s own example', async () => {
    const host = '{{md https://evil.test/a}}\n\nExample:\n\n```\n{{md notes.md}}\n```\n';
    const out = await prepareSources(host, { fetcher: async () => '```\n' });
    expect(md.render(out, { markdownBasePath: dir })).toContain('{{md notes.md}}');
  });
});

describe('scanning — round-5 findings', () => {
  const meta = '{{nyml\nkind: meta\ntitle: X\n}}';
  // [rendered?, source] pairs from the audit's disagreement corpus.
  const cases: Array<[boolean, string]> = [
    [false, `Title\n---\n    ${meta}`],
    [true, `> \`\`\`\n${meta}`],
    [true, `> \`\`\`\n> x\n${meta}`],
    [false, `<div>\n${meta}\n</div>`],
    [false, `text\n<div>\n${meta}`],
    [false, `$$\n${meta}\n$$`],
    [true, `> - a\n>   \`\`\`\n${meta}\n>   \`\`\``],
    [false, `<span>\n${meta}\n</span>`],
    [true, `a \`b\n${meta}\nc\` d`],
    [true, `text\n<span>\n${meta}`],
  ];
  it.each(cases)('[M.10] scanner agrees with the renderer (rendered=%s): %s', (rendered, src) => {
    expect(md.render(src).includes('nyml-data')).toBe(rendered);
    expect(scanNymlBlocks(src).length > 0).toBe(rendered);
  });
  it('[M.5] distinct-length backtick runs on one line scan linearly (H4 sibling)', () => {
    const dec = (m: number) => { let s = ''; for (let k = m; k >= 1; k--) s += '`'.repeat(k) + 'a'; return s; };
    // Small and large runs interleave, so suite load hits both alike; best of 5
    // each, and up to three rounds (a real quadratic fails every round).
    const ratio = (small: string, large: string) => {
      maskInertMarkdown(small); maskInertMarkdown(large);
      let best = Infinity;
      for (let round = 0; round < 3 && best >= 8; round++) {
        let a = Infinity, b = Infinity;
        for (let k = 0; k < 5; k++) {
          let t = performance.now(); maskInertMarkdown(small); a = Math.min(a, performance.now() - t);
          t = performance.now(); maskInertMarkdown(large); b = Math.min(b, performance.now() - t);
        }
        best = Math.min(best, b / Math.max(a, 1));
      }
      return best;
    };
    expect(ratio(dec(1400), dec(2800))).toBeLessThan(8); // ~1 MB vs ~4 MB
    const com = (n: number) => 'a <!-- x --> '.repeat(n);
    expect(ratio(com(20_000), com(80_000))).toBeLessThan(8);
  }, 60_000);
  it('[M.10] a setext underline ends the paragraph for indented-code purposes (L1)', () => {
    expect(extractDocMeta(`Title\n===\n\n    ${meta}`).meta).toEqual({});
  });
});

describe('copy — round-5 findings', () => {
  it('[C.11] blank lines inside multi-line directives survive (M2)', () => {
    roundTrip('{{nyml\nkind: element\nbody: |\n  line1\n\n\n  line3\n}}');
    roundTrip('{{yaml\na: |\n  x\n\n\n  y\nb: 2\n}}');
    roundTrip('{{mermaid\ngraph LR\n\n\nA-->B\n}}');
  });
  it('[C.4] a code block holding only a blank line keeps it (L3)', () => roundTrip('```\n\n```'));
  it('[C.6] footnote code keeps relative indentation (L2)', () => {
    roundTrip('x[^a]\n\n[^a]: ```js\n    const a = 1;\n    \n      indented();\n    ```');
    roundTrip('x[^note]\n\n[^note]: ```\n        two();\n    ```');
  });
});

describe('render — round-5 findings', () => {
  it('[R.3] CJK around percent-encoded URLs (H3)', () => {
    expect(md.renderInline('请访问www.baidu.com/s?wd=%E4%B8%AD获取')).toBe('请访问<a href="http://www.baidu.com/s?wd=%E4%B8%AD">www.baidu.com/s?wd=中</a>获取');
    expect(md.renderInline('请访问example.com/a%20b')).toBe('请访问<a href="http://example.com/a%20b">example.com/a b</a>');
    expect(md.renderInline('请访问https://x.com/a%20b。')).toBe('请访问<a href="https://x.com/a%20b">https://x.com/a b</a>。');
    expect(md.renderInline('https://x.y/%E5%8C%96%E5%AD%A6了解更多')).toBe('<a href="https://x.y/%E5%8C%96%E5%AD%A6">https://x.y/化学</a>了解更多');
  });
  it('[R.3] a closing curly quote is not part of the URL (M4)', () => {
    expect(md.renderInline('请访问“https://orz.how/a”获取')).toBe('请访问“<a href="https://orz.how/a">https://orz.how/a</a>”获取');
    expect(md.renderInline('He said “see https://example.com/page”.')).toBe('He said “see <a href="https://example.com/page">https://example.com/page</a>”.');
  });
});
