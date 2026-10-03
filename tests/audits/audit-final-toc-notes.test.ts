import { describe, it, expect } from 'vitest';
import { md, prepareSources, extractDocMeta } from '../../src/index';

const U = 'https://x.test/a.md';
const acc = async (host: string, body: string) => !(await prepareSources(host, { fetcher: async () => body })).includes(`{{md ${U}}}`);
const BODY_H = '## Included A\n\nText.\n\n### Included B\n\n#### Deep\n\n# Top';

describe('final: TOCs with included headings', () => {
  it.each([
    ['toc 2,3 before', `{{toc 2,3}}\n\n## Host\n\n{{md ${U}}}\n\n## Host 2\n`],
    ['toc after', `## Host\n\n{{md ${U}}}\n\n{{toc}}\n`],
    ['two tocs', `{{toc}}\n\n{{toc 1,4}}\n\n## Host\n\n{{md ${U}}}\n`],
    ['three tocs ranges', `{{toc 1,1}}\n\n{{toc 2,2}}\n\n{{toc 4,6}}\n\n## Host\n\n{{md ${U}}}\n`],
    ['toc in quote', `> {{toc}}\n\n## Host\n\n{{md ${U}}}\n`],
    ['toc in list', `- {{toc}}\n\n## Host\n\n{{md ${U}}}\n`],
    ['toc in footnote', `Text[^n].\n\n## Host\n\n{{md ${U}}}\n\n[^n]: Note\n\n    {{toc}}\n`],
    ['toc in footnote + body toc', `{{toc}}\n\nText[^n].\n\n## Host\n\n{{md ${U}}}\n\n[^n]: Note\n\n    {{toc 2,3}}\n`],
    ['mid-line include + toc', `{{toc}}\n\n## Host\n\nSee {{md ${U}}} and more.\n`],
    ['include in footnote + toc', `{{toc}}\n\n## Host\n\nText[^n].\n\n[^n]: Note\n\n    {{md ${U}}}\n`],
  ])('%s', async (_n, host) => {
    expect(await acc(host, BODY_H)).toBe(true);
  });
  it('body with its own toc', async () => {
    expect(await acc(`{{toc}}\n\n## Host\n\n{{md ${U}}}\n`, '{{toc}}\n\n## Inc\n')).toBe(true);
  });
});

describe('final: footnotes', () => {
  it.each([
    ['include in note, own line', `Text[^1].\n\n[^1]: Note start.\n\n    {{md ${U}}}\n\n    Note end.\n\nAfter.\n`],
    ['include in note, two notes', `A[^1] B[^2].\n\n[^1]: One.\n\n    {{md ${U}}}\n\n[^2]: Two.\n`],
    ['include in body, body cites notes', `A[^1].\n\n{{md ${U}}}\n\nB[^2].\n\n[^1]: One.\n[^2]: Two.\n`],
    ['include in body, inline note', `A^[inline one].\n\n{{md ${U}}}\n\nB^[inline two].\n`],
    ['include in note with nyml in note', `A[^1].\n\n[^1]: One.\n\n    {{md ${U}}}\n\n    {{nyml\n    k: v\n    }}\n`],
  ])('%s', async (_n, host) => {
    expect(await acc(host, 'Included *text* with a [link](https://e.com).\n\n- a\n- b')).toBe(true);
  });
  it('body with its own footnotes', async () => {
    expect(await acc(`A[^1].\n\n{{md ${U}}}\n\n[^1]: One.\n`, 'Inc[^z].\n\n[^z]: Zed.')).toBe(true);
  });
  it('note-line directive kept, renders as before', async () => {
    const host = `A[^1].\n\n[^1]: {{md ${U}}}\n`;
    const out = await prepareSources(host, { fetcher: async () => 'X.' });
    expect(out).toBe(host);
  });
  it('note-line directive with prefix text kept', async () => {
    const host = `A[^1].\n\n[^1]: See {{md ${U}}} here.\n`;
    expect(await prepareSources(host, { fetcher: async () => 'X.' })).toBe(host);
  });
  it('nyml in body numbered: include with nyml BEFORE host nyml refused, AFTER accepted', async () => {
    const n = '{{nyml\nk: v\n}}';
    expect(await acc(`${n}\n\n{{md ${U}}}\n`, n)).toBe(true);
  });
});

describe('final: metadata of ordinary included documents', () => {
  const meta = '{{nyml\nkind: meta\ntitle: Inc Title\nauthor: Someone\n}}';
  it.each([
    ['nyml meta head', `${meta}\n\n# Chapter\n\nBody text.`],
    ['meta head + file include', `${meta}\n\n{{md ./local.md}}\n\nBody text.`],
    ['meta head + url include', `${meta}\n\nBody text.\n\n{{md https://x.test/c.md}}`],
    ['meta head + code with {{md', `${meta}\n\n\`\`\`\n{{md ./x}}\n\`\`\`\n\nBody text.`],
    ['meta head + trailing open {{', `${meta}\n\nBody text with {{ open.`],
    ['meta not first', `# Chapter\n\n${meta}\n\nBody text.`],
  ])('%s', async (_n, body) => {
    const host = `# Host\n\n{{md ${U}}}\n\nAfter.\n`;
    const out = await prepareSources(host, { fetcher: async (u) => (u.endsWith('c.md') ? 'Nested text.' : body) });
    console.log(JSON.stringify(out));
    expect(out).not.toContain('kind: meta');
    expect(out).toContain('Body text');
    expect(extractDocMeta(out).meta.title).toBeUndefined();
  });
});
