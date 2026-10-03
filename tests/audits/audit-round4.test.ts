/**
 * Round-4 regressions: each test reproduces a finding of the round-3
 * adversarial audit (notes/closed-loop.md, round 4), bound to the claim it
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

const secretDir = mkdtempSync(join(tmpdir(), 'orz-r4-'));
writeFileSync(join(secretDir, 'secret.md'), 'SECRET-TOKEN=abc123\n');

describe('security — round-4 findings', () => {
  it('[M.13] every directive spelling in fetched text is neutralized (H1a)', async () => {
    for (const spelling of [`{{md${secretDir}/secret.md}}`, `{{md[x] ${secretDir}/secret.md}}`, `{{markdown[] ${secretDir}/secret.md}}`, `{{md-include${secretDir}/secret.md}}`]) {
      const out = await prepareSources('{{md https://evil.test/a}}', { fetcher: async () => spelling });
      expect(md.render(out, { markdownBasePath: '/' }), spelling).not.toContain('SECRET-TOKEN');
    }
  });
  it('[M.13] two fetched halves cannot join into a live directive (H1b)', async () => {
    const pages: Record<string, string> = {
      'https://evil.test/doc': '{{md https://evil.test/a}}\n{{md https://evil.test/b}}',
      'https://evil.test/a': '{{md',
      'https://evil.test/b': ` ${secretDir}/secret.md}}`,
    };
    const out = await prepareSources('{{md https://evil.test/doc}}', { fetcher: async (u) => pages[u] ?? null });
    expect(md.render(out, { markdownBasePath: '/' })).not.toContain('SECRET-TOKEN');
  });
  it('[M.13] code examples in fetched text read as written (M6c)', async () => {
    const out = await prepareSources('{{md https://a.test/readme}}', { fetcher: async () => '```markdown\n{{md chapter1.md}}\n```' });
    // Neutralized invisibly: the example reads exactly as written, no backslash.
    expect(out.replace(/\u2060/g, '')).toContain('{{md chapter1.md}}');
    expect(out).not.toContain('\\{{');
  });
});

describe('copy — round-4 findings', () => {
  it('[C.17] invisible data islands and styles are not pasted as text (H4)', () => {
    const copied = copyOf('# Doc\n\n{{nyml\nkind: data\na: 1\n}}\n\n{{yaml\nb: 2\n}}\n\n<style>.x{color:red}</style>\n\nBody **text**.');
    expect(copied).not.toContain('"kind"');
    expect(copied).not.toContain('color:red');
    expect(copied).toContain('{{nyml\nkind: data\na: 1\n}}');
    expect(copied).toContain('{{yaml\nb: 2\n}}');
  });
  it('[C.17] raw iframe, video and audio survive (M7)', () => {
    roundTrip('<iframe src="https://player.bilibili.com/x"></iframe>');
    roundTrip('Clip: <video src="v.mp4" controls></video>');
  });
  it('[C.6] a code block opening a NESTED item, or behind a quote in an item (M2)', () => {
    roundTrip('- a\n  - ```\n    x\n    ```');
    roundTrip('- [ ] ```\n  x\n  ```');
    roundTrip('1. > ```\n   > x\n   > ```');
    roundTrip('Text[^1].\n\n[^1]: > ```\n    > x\n    > ```');
  });
  it('[C.3] "$$" at a line start stays literal (M3)', () => {
    roundTrip('Deposit:\\\n\\$\\$100 per night');
    roundTrip('\\$\\$5 fee');
  });
  it('[C.8] hr inside a list item, accidental table lines (LOW)', () => {
    roundTrip('- ***');
    roundTrip('a | b\\\n\\-|\\-');
  });
  it('[C.10] an unlabeled spoiler does not take a nested spoiler\'s label (LOW)', () => {
    roundTrip(':::: spoil\n::: spoil Inner\nx\n:::\n::::');
  });
  it('[C.17] span class with "]" and text with "}}" (LOW)', () => {
    roundTrip('<span class="a]b">x</span> and {{sp[red] a\\}\\}b}}');
  });
  it('[C.1] authored empty blocks survive (LOW)', () => {
    roundTrip('Para.\n\n::: info\n:::\n\nAfter.');
  });
});

describe('render — round-4 findings', () => {
  it('[R.3] percent-encoded URLs are not trimmed (H6)', () => {
    expect(md.renderInline('https://example.com/report2024%E5%B9%B4.pdf')).toContain('href="https://example.com/report2024%E5%B9%B4.pdf"');
    expect(md.renderInline('https://x.y/Python%E6%95%99%E7%A8%8B')).toContain('href="https://x.y/Python%E6%95%99%E7%A8%8B"');
  });
  it('[R.3] emoji and symbols before a scheme-less URL stay text (M5)', () => {
    for (const lead of ['👉', '✅', '★', '→', '①', '🇨🇳']) {
      expect(md.renderInline(`${lead}www.example.com`), lead).toBe(`${lead}<a href="http://www.example.com">www.example.com</a>`);
    }
  });
  it('[R.4] text after a MULTILINE directive is kept (LOW)', () => {
    expect(md.render('{{mermaid\ngraph LR; A-->B\n}} is a graph')).toContain('<p>is a graph</p>');
  });
});

describe('scanning — round-4 findings', () => {
  it('[M.10] a mention of "{{nyml" before a real block does not hide it (H7)', () => {
    const meta = '\n\n{{nyml\nkind: meta\ntitle: Real\n}}\n';
    for (const mention of ['Type `{{nyml` to open a block.', 'Write {{nyml in prose.', '<!-- {{nyml -->', '\\{{nyml']) {
      expect(extractDocMeta(mention + meta).meta.title, mention).toBe('Real');
    }
  });
  it('[M.5] unclosed inline comments scan in linear time (H5)', () => {
    // Best of three per size: a ratio of minima is stable on a loaded machine.
    const t = (n: number) => { const src = 'a <!-- b\n'.repeat(n); maskInertMarkdown(src); let best = Infinity; for (let k = 0; k < 3; k++) { const t0 = performance.now(); maskInertMarkdown(src); best = Math.min(best, performance.now() - t0); } return best; };
    // A real quadratic fails every round; a load spike does not.
    let r = Infinity;
    for (let round = 0; round < 3 && r >= 8; round++) r = Math.min(r, t(100_000) / Math.max(t(25_000), 1));
    expect(r).toBeLessThan(8);
  }, 90_000);
  it('[M.10] a fence on a list-marker line is a fence (M6a)', () => {
    expect(extractDocMeta('- ```\n  {{nyml\n  kind: meta\n  title: InCode\n  }}\n  ```\n').meta).toEqual({});
    expect(scanNymlBlocks('- ```\n  {{nyml\n  kind: meta\n  }}\n  ```\n')).toHaveLength(0);
  });
  it('[M.11] quote/list/task prefixes keep included content in place (M6b)', async () => {
    const fetcher = async () => 'a\n\nb';
    expect(await prepareSources('- > {{md https://a.test/x}}', { fetcher })).toBe('- > a\n  > \n  > b');
    expect(await prepareSources('1. - {{md https://a.test/x}}', { fetcher })).toBe('1. - a\n     \n     b');
    expect(await prepareSources('- [ ] {{md https://a.test/x}}', { fetcher })).toBe('- [ ] a\n  \n  b');
  });
});
