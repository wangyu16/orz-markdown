/**
 * Blocks of a text and its canonical form (2.8.0, family module K3):
 * `splitBlocks`, `canonicalize` and `blockFingerprint` in `orz-markdown/carrier`.
 * Claims B.1–B.10 in notes/CLAIMS.md (audit round 1: M1–M3, L1–L8; round 2: M1-b, M3-b, three LOWs). Oracles: every Markdown file of this
 * repository (git ls-files, the carrier corpus, the starters, specs and docs)
 * and seeded random texts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { splitBlocks, canonicalize, blockFingerprint, kindFromFilename, kitParser, withoutHeader, readHeader, type Kind, type TextBlock } from '../src/carrier';

const FILES = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const DOCS = FILES.map((path) => ({ path, kind: (kindFromFilename(path) ?? 'md') as Kind, text: readFileSync(path, 'utf8') }));

/** The HTML a renderer makes of a text's body (FC-18: render `withoutHeader(text).body`). */
const render = (t: string): string => kitParser().render(withoutHeader(t).body, {});
const slices = (t: string, bs: TextBlock[]): string[] => bs.map((b) => t.slice(b.start, b.end));
const shape = (t: string, bs: TextBlock[]) => bs.map((b) => ({ type: b.type, name: b.name, id: b.id, fingerprint: b.fingerprint, text: t.slice(b.start, b.end) }));

/** A small seeded PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SNIPPETS = [
  '# Title', '##   Spaced title   ##', 'Setext\n===', 'Setext two\n---', '## Head{{attrs[#blk-abcdefgh]}}', '### Bad{{attrs[#blk-x]}}',
  'Para _em_ and __strong__ and `co_de` and $a_1 + b_2$ and {{sp _x_}}', 'line one  \nline two', '   indented para\n      lazy line   ',
  '* a\n* b\n  * nested _n_', '+ x\n+ y', '- p\n- q', '1) one\n2) two', '3. three\n4. four', '- [ ] task\n- [x] done', '* a\n\n  para in item',
  '| a | b |\n|:-|-:|\n|1|2|', '|x|\n|-|\n|y \\| z|', '| a |b|\n| :---: | --- |\n|  c  |   d|',
  '::: info\ninside _x_\n:::', '::: cols\n::: col\nA\n:::\n::: col\nB\n:::\n:::', '::: spoil Click _me_\nhidden\n:::',
  '```js\nconst a_b = 1;   \n\n\n## not a heading\n```', '~~~\n<!-- slide -->\n~~~', '    indented code  \n    more', '$$\nx_1  \n$$',
  '{{mermaid\ngraph TD\n  A-->B\n}}', '{{nyml\nkind: cover\ntitle: T _x_\n}}', '{{chart\ntype: bar\n}}', '<!-- slide -->', '<!-- slide 2col id=blk-slide0001 -->', '<!-- @left -->', '<!-- @right -->',
  '<div>\n\n*x*\n\n</div>', '<!-- a comment _x_ -->', '> quote _q_\nlazy', '> - a\n> + b', '***', '___', '- - -', 'Text[^1] and [ref][r]', '[^1]: note  \n    more note', '[r]: http://x_y "t"',
  'snake_case_word and _a and a_', '中文_强调_测试 and _中文_', '<span>_x_</span> and <http://a_b_c>', '[link_x](http://a_b_c) and ![i_m](a_b.png)', 'a\\_b\\_ and \\*', '\t\ttabbed line',
  'trailing spaces   ', '`` code `with` _ticks_ ``', '_unclosed and __mixed_', '**_both_**', '_a_b_', 'word__x__word', '© &amp; _x_',
];
const SEPARATORS = ['\n', '\n\n', '\n\n\n', '  \n\n', '\n \n', '\n\t\n\n'];
const HEADERS = ['', '{{nyml\nkind: document\ntitle: T\n}}\n\n', '{{nyml\nkind: document\ncarrier: slides\n}}\n', '﻿{{nyml\nkind: meta\ntitle: M\n}}\n\n{{nyml\nkind: document\ntheme: x\n}}\n\n\n', '﻿'];

function randomText(r: () => number): { text: string; kind: Kind } {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const n = 1 + Math.floor(r() * 12);
  let body = '';
  for (let i = 0; i < n; i++) body += pick(SNIPPETS) + (i + 1 < n ? pick(SEPARATORS) : r() < 0.5 ? '\n' : '');
  let text = pick(HEADERS) + body;
  const eol = r();
  if (eol < 0.2) text = text.replace(/\n/g, '\r\n');
  else if (eol < 0.3) text = text.replace(/\n/g, '\r');
  return { text, kind: pick(['md', 'md', 'slides', 'paged'] as const) };
}
const RANDOM = (() => {
  const r = rng(0xb10c);
  return Array.from({ length: 250 }, () => randomText(r));
})();

function expectTiling(text: string, bs: TextBlock[], label: string): void {
  if (text === '') { expect(bs, label).toEqual([]); return; }
  expect(bs.length, label).toBeGreaterThan(0);
  expect(bs[0].start, label).toBe(0);
  expect(bs[bs.length - 1].end, label).toBe(text.length);
  for (let i = 1; i < bs.length; i++) expect(bs[i].start, label).toBe(bs[i - 1].end);
  for (const b of bs) expect(b.end, label).toBeGreaterThan(b.start);
  expect(slices(text, bs).join(''), label).toBe(text);
}

describe('splitBlocks', () => {
  it('[B.1] the blocks tile the text exactly (first at 0, each where the previous ends, last at the end, none empty; joined they are the text) — every Markdown file of the repository in each unit, and 250 seeded random texts with headers, BOM and LF / CR LF / CR', () => {
    expect(DOCS.length).toBeGreaterThan(50);
    for (const d of DOCS) for (const unit of ['block', 'section'] as const) expectTiling(d.text, splitBlocks(d.text, { kind: d.kind, unit }), `${d.path} ${unit}`);
    for (const [i, d] of RANDOM.entries()) for (const unit of ['block', 'section'] as const) expectTiling(d.text, splitBlocks(d.text, { kind: d.kind, unit }), `random ${i} ${unit} ${JSON.stringify(d.text)}`);
    expect(splitBlocks('')).toEqual([]);
    expect(splitBlocks(' \n\n\t\n').map((b) => b.type)).toEqual(['blank']);
  });

  it('[B.2] one block per top-level construct, the header first; containers, fences, math and directives whole; definitions as blocks; FC-02 ids on headings only when well-formed; 1-based lines; the kind from the option, the file name or the header', () => {
    const t = [
      '{{nyml', 'kind: document', 'title: x', '}}', '',
      '# Title{{attrs[#blk-abcdefgh]}}', '## Bad{{attrs[#blk-X]}}', 'Para', 'two', '',
      '* a', '* b', '', '1) x', '', '| a | b |', '|---|---|', '| 1 | 2 |', '',
      '::: info', '## inside', ':::', '', '```js', '## not a heading', '```', '', '{{mermaid', 'graph TD', '}}', '', '$$', 'x', '$$', '',
      '> q', '', 'Ref[^1]', '', '[^1]: note', '', '[r]: http://x', '', '***', '', '<div>', 'h', '</div>', '', '    code', '', '<!-- slide -->', '',
    ].join('\n');
    const bs = splitBlocks(t);
    expect(bs.map((b) => [b.type, b.name ?? null, b.id, b.line])).toEqual([
      ['header', null, null, 1], ['heading', null, 'blk-abcdefgh', 6], ['heading', null, null, 7], ['paragraph', null, null, 8],
      ['list', null, null, 11], ['list', null, null, 14], ['table', null, null, 16], ['container', 'info', null, 20], ['code', 'js', null, 24],
      ['directive', 'mermaid', null, 28], ['math', null, null, 32], ['blockquote', null, null, 36], ['paragraph', null, null, 38],
      ['definition', null, null, 40], ['definition', null, null, 42], ['rule', null, null, 44], ['html', null, null, 46], ['code', null, null, 50],
      ['html', null, null, 52],
    ]);
    // A text without a header: the first block starts at 0, leading blank lines included.
    expect(splitBlocks('\n\n# A\n\nb\n').map((b) => [b.type, b.start, b.line])).toEqual([['heading', 0, 1], ['paragraph', 7, 5]]);
    // Sections: cut at headings of level ≤ depth; what comes first is the preamble; the header stays apart.
    const s = '{{nyml\nkind: document\n}}\n\nIntro\n\n## A{{attrs[#blk-aaaaaaaa]}}\n\n### a1\n\ntext\n\n## B\n\nmore\n';
    expect(splitBlocks(s, { unit: 'section' }).map((b) => [b.type, b.id, b.line])).toEqual([['header', null, 1], ['preamble', null, 5], ['section', 'blk-aaaaaaaa', 7], ['section', null, 13]]);
    expect(splitBlocks(s, { unit: 'section', depth: 3 }).map((b) => b.type)).toEqual(['header', 'preamble', 'section', 'section', 'section']);
    // Slides: one block per slide by default (the kind from the file name or the header's carrier), markers in code ignored; ids from `id=` or the first heading's.
    const deck = 'Before\n\n<!-- slide -->\n## One{{attrs[#blk-one00000]}}\n<!-- @left -->\nL\n\n```\n<!-- slide -->\n```\n\n<!-- slide id=blk-two00000 -->\n## Two{{attrs[#blk-other000]}}\n\n<!-- slide -->\nThree\n';
    for (const opts of [{ kind: 'slides' as const }, { filename: 'w1.slides.md' }]) {
      expect(splitBlocks(deck, opts).map((b) => [b.type, b.id, b.line])).toEqual([['preamble', null, 1], ['slide', 'blk-one00000', 3], ['slide', 'blk-two00000', 12], ['slide', null, 15]]);
    }
    expect(splitBlocks('{{nyml\nkind: document\ncarrier: slides\n}}\n' + deck).map((b) => b.type)).toEqual(['header', 'preamble', 'slide', 'slide', 'slide']);
    expect(splitBlocks(deck, { kind: 'slides', unit: 'block' }).filter((b) => b.type === 'marker').map((b) => b.name)).toEqual(['slide', 'left', 'slide', 'slide']);
    expect(splitBlocks(deck, 'md').some((b) => b.type === 'slide' || b.type === 'marker')).toBe(false);
    // paged: element blocks typed by their kind; a nyml block in md is a directive.
    const paged = '{{nyml\nkind: document\n}}\n\n{{nyml\nkind: cover\ntitle: T\n}}\n\nText\n';
    expect(splitBlocks(paged, 'paged').map((b) => [b.type, b.name ?? null])).toEqual([['header', null], ['element', 'cover'], ['paragraph', null]]);
    expect(splitBlocks(paged, 'md').map((b) => [b.type, b.name ?? null])).toEqual([['header', null], ['directive', 'nyml'], ['paragraph', null]]);
    // A legacy kind: meta + kind: document pair is one header block.
    expect(splitBlocks('{{nyml\nkind: meta\n}}\n\n{{nyml\nkind: document\n}}\n\n# H\n').map((b) => b.type)).toEqual(['header', 'heading']);
    // The corpus: every slides file is header + slides (+ preamble), every paged element is typed.
    for (const d of DOCS.filter((x) => x.kind === 'slides')) {
      const types = splitBlocks(d.text, d.kind).map((b) => b.type);
      expect(types.filter((x) => x !== 'slide' && x !== 'header' && x !== 'preamble'), d.path).toEqual([]);
    }
  });

  it('[B.2] audit round 1: an id only from an explicit {{attrs[…]}} on a top-level heading (never a slug; `#…` or `id="…"`); an unclosed `<!-- slide` is not a marker; a definition right after a container\'s closing `:::` is its own block', () => {
    const ids = (t: string, k: Kind = 'md') => splitBlocks(t, k).map((b) => [b.type, b.id]);
    // L3: slugs that look like block ids are not ids.
    expect(ids('# blk-abcdefgh1\n\n## Blk Abcdefgh2\n')).toEqual([['heading', null], ['heading', null]]);
    expect(ids('## T{{attrs[#blk-abcdefgh]}}\n\n## U {{attrs[id="blk-bcdefghi"]}}\n\n## V{{attrs[.x #blk-cdefghij]}}\n')).toEqual([['heading', 'blk-abcdefgh'], ['heading', 'blk-bcdefghi'], ['heading', 'blk-cdefghij']]);
    expect(ids('## `{{attrs[#blk-abcdefgh]}}`\n')).toEqual([['heading', null]]);
    // Nested headings give no block id (top-level blocks only).
    expect(ids('::: info\n## A{{attrs[#blk-abcdefgh]}}\n:::\n\n- ## B{{attrs[#blk-bcdefghi]}}\n')).toEqual([['container', null], ['list', null]]);
    // L5: an unclosed slide comment is HTML, not a slide (orz-slides requires `-->`).
    expect(splitBlocks('x\n\n<!-- slide\nB\n', 'slides').map((b) => b.type)).toEqual(['preamble']);
    expect(splitBlocks('x\n\n<!-- slide\nB\n', { kind: 'slides', unit: 'block' }).map((b) => b.type)).toEqual(['paragraph', 'html']);
    expect(splitBlocks('<!-- @left\nL\n', { kind: 'slides', unit: 'block' }).map((b) => b.type)).toEqual(['html']);
    expect(splitBlocks('<!-- slide\nid=blk-aaaaaaaa -->\nA\n', 'slides').map((b) => [b.type, b.id])).toEqual([['slide', 'blk-aaaaaaaa']]);
    // L8: a definition after a container's closing line.
    const t = '::: info\nx\n:::\n[r]: /u\n';
    expect(splitBlocks(t).map((b) => [b.type, t.slice(b.start, b.end)])).toEqual([['container', '::: info\nx\n:::\n'], ['definition', '[r]: /u\n']]);
  });

  it('[B.2] audit round 2: a slide id given twice — the last valid `id=` counts, as orz-slides\' readMarkerArgs (an invalid one is dropped; a last valid non-block id gives none)', () => {
    const id = (args: string) => splitBlocks(`<!-- slide ${args} -->\nA\n`, 'slides')[0].id;
    expect(id('id=blk-aaaaaaaa id=blk-bbbbbbbb')).toBe('blk-bbbbbbbb');
    expect(id('id="blk-aaaaaaaa" bg=x id=\'blk-bbbbbbbb\'')).toBe('blk-bbbbbbbb');
    expect(id('id=blk-aaaaaaaa id=9bad')).toBe('blk-aaaaaaaa');
    expect(id('id=blk-aaaaaaaa id=other')).toBe(null);
    expect(id('class="a id=blk-aaaaaaaa"')).toBe(null);
    expect(splitBlocks('<!-- slide id=blk-aaaaaaaa id=blk-bbbbbbbb -->\nA\n\n<!-- slide id=blk-bbbbbbbb -->\nB\n', 'slides').map((b) => [b.id, b.duplicate ?? false])).toEqual([['blk-bbbbbbbb', true], ['blk-bbbbbbbb', true]]);
  });

  it('[B.10] a block whose id the text carries more than once (another heading at any depth, another slide marker) is marked `duplicate`; other blocks carry no `duplicate` key', () => {
    const dup = (t: string, k: Kind = 'md', unit: 'block' | 'section' = k === 'slides' ? 'section' : 'block') => splitBlocks(t, { kind: k, unit }).map((b) => [b.id, b.duplicate ?? false]);
    expect(dup('## A{{attrs[#blk-abcdefgh]}}\n\n## B{{attrs[#blk-abcdefgh]}}\n\n## C{{attrs[#blk-bcdefghi]}}\n')).toEqual([['blk-abcdefgh', true], ['blk-abcdefgh', true], ['blk-bcdefghi', false]]);
    expect(dup('## A{{attrs[#blk-abcdefgh]}}\n\n::: info\n### N{{attrs[#blk-abcdefgh]}}\n:::\n')).toEqual([['blk-abcdefgh', true], [null, false]]);
    expect(dup('## A{{attrs[#blk-abcdefgh]}}\n\n## B{{attrs[#blk-abcdefgh]}}\n', 'md', 'section')).toEqual([['blk-abcdefgh', true], ['blk-abcdefgh', true]]);
    expect(dup('<!-- slide id=blk-aaaaaaaa -->\nA\n\n<!-- slide -->\n## B{{attrs[#blk-aaaaaaaa]}}\n', 'slides')).toEqual([['blk-aaaaaaaa', true], ['blk-aaaaaaaa', true]]);
    for (const d of DOCS) for (const b of splitBlocks(d.text, d.kind)) expect('duplicate' in b, d.path).toBe(false);
  });

  it('[B.3] stable under edits elsewhere: changing a paragraph changes only the block that holds it, and deleting a block or inserting a paragraph between blank-separated blocks leaves every other block\'s type, name, id, text and fingerprint as they were — every Markdown file of the repository, in each unit', () => {
    let edits = 0;
    for (const d of DOCS) {
      const fine = splitBlocks(d.text, { kind: d.kind, unit: 'block' });
      const paragraphs = fine.filter((b) => b.type === 'paragraph');
      const step = Math.max(1, Math.floor(paragraphs.length / 5));
      const original = { block: shape(d.text, fine), section: shape(d.text, splitBlocks(d.text, { kind: d.kind, unit: 'section' })) };
      for (let p = 0; p < paragraphs.length; p += step) {
        const at = paragraphs[p].start;
        const edited = d.text.slice(0, at) + 'Edited ' + d.text.slice(at);
        for (const unit of ['block', 'section'] as const) {
          const before = original[unit];
          const after = shape(edited, splitBlocks(edited, { kind: d.kind, unit }));
          expect(after.length, d.path).toBe(before.length);
          const changed = after.map((b, i) => (b.fingerprint === before[i].fingerprint ? -1 : i)).filter((i) => i >= 0);
          expect(changed.length, `${d.path} ${unit} @${at}`).toBe(1);
          for (let i = 0; i < after.length; i++) {
            expect({ ...after[i], fingerprint: '', text: '' }, d.path).toEqual({ ...before[i], fingerprint: '', text: '' });
            if (i !== changed[0]) expect(after[i].text, d.path).toBe(before[i].text);
          }
          edits++;
        }
      }
      // Delete / insert at a block boundary with a blank line on both sides.
      const texts = slices(d.text, fine);
      const endsBlank = (s: string) => /\n[ \t]*\n[ \t]*$/.test(s.replace(/\r\n?/g, '\n'));
      const kstep = Math.max(1, Math.floor(fine.length / 5));
      for (let k = 1; k < fine.length - 1; k += kstep) {
        if (fine[k - 1].type === 'header' || !endsBlank(texts[k - 1]) || !endsBlank(texts[k])) continue;
        if (fine[k - 1].type === 'list' && fine[k + 1].type === 'list') continue; // two lists would become one
        const without = d.text.slice(0, fine[k].start) + d.text.slice(fine[k].end);
        const expected = shape(d.text, fine).filter((_, i) => i !== k);
        expect(shape(without, splitBlocks(without, { kind: d.kind, unit: 'block' })), `${d.path} delete ${k}`).toEqual(expected);
        const inserted = d.text.slice(0, fine[k].start) + 'Inserted paragraph.\n\n' + d.text.slice(fine[k].start);
        const got = shape(inserted, splitBlocks(inserted, { kind: d.kind, unit: 'block' }));
        expect(got.filter((_, i) => i !== k), `${d.path} insert ${k}`).toEqual(shape(d.text, fine));
        expect(got[k].type).toBe('paragraph');
        edits += 2;
      }
    }
    expect(edits).toBeGreaterThan(300);
  }, 180_000);

  it('[B.3] the documented exceptions: an edit that changes where the parser starts constructs — an unclosed fence, `$$`, `:::` or HTML comment swallows every block after it — changes the blocks after it', () => {
    const t = '# A\n\npara\n\n## B\n\nmore\n';
    for (const opener of ['```', '$$', '::: info', '<!--']) {
      const edited = t.replace('para', () => opener + '\nx');
      const bs = splitBlocks(edited);
      expect(bs.length, opener).toBe(2);
      expect(bs[1].end, opener).toBe(edited.length);
    }
  });

  it('[B.3] audit round 2: deleting a block can join its neighbours (two lists, two indented code blocks, a footnote definition and indented code) — the documented exception; the host re-splits the merged text and sees the change of boundaries', () => {
    for (const t of ['- a\n\n# H\n\n- b\n', '    a\n\n# H\n\n    b\n', '1. a\n\npara\n\n2. b\n', '[^1]: a\n\n# H\n\n    b\n']) {
      const bs = splitBlocks(t);
      expect(bs.length, t).toBe(3);
      const without = t.slice(0, bs[1].start) + t.slice(bs[1].end);
      const after = splitBlocks(without);
      expect(after.length, t).toBe(1);
      expect(after[0].type, t).toBe(bs[0].type);
      expect(after[0].fingerprint, t).not.toBe(bs[0].fingerprint);
    }
  });

  it('[B.4] blockFingerprint is 16 hex digits of SHA-256; it ignores line endings and the blank lines around a block, and nothing else (a trailing space, a marker, a letter)', () => {
    const f = blockFingerprint('## Title\n\ntext\n');
    expect(f).toMatch(/^[0-9a-f]{16}$/);
    for (const same of ['## Title\r\n\r\ntext', '\n\n## Title\n\ntext\n\n\n', '## Title\r\rtext\r', ' \n## Title\n\ntext\n \t\n']) expect(blockFingerprint(same), JSON.stringify(same)).toBe(f);
    for (const other of ['## Title\n\ntext \n', '# Title\n\ntext\n', '## Title\ntext\n', '## Title\n\nText\n', ' ## Title\n\ntext\n']) expect(blockFingerprint(other), JSON.stringify(other)).not.toBe(f);
    const t = '# A\r\n\r\nb\r\n';
    for (const b of splitBlocks(t)) expect(b.fingerprint).toBe(blockFingerprint(t.slice(b.start, b.end)));
    // Blank lines an unclosed fence, `$$` or HTML comment swallowed are content (they render): they count.
    for (const open of ['```\ncode', '~~~\ncode', '$$\nx', '<!-- c', '- x\n\n  ```\n  code']) {
      const a = `${open}\n`, b = `${open}\n\n\n`;
      expect(render(a), open).not.toBe(render(b));
      expect(blockFingerprint(a), open).not.toBe(blockFingerprint(b));
      expect(blockFingerprint(`${open}\r\n\r\n\r\n`), open).toBe(blockFingerprint(b));
      const doc = `para\n\n${b}`;
      const last = splitBlocks(doc).at(-1)!;
      expect(last.fingerprint, open).toBe(blockFingerprint(b));
    }
    // A closed fence: the blank lines after it are a separator.
    expect(blockFingerprint('```\ncode\n```\n')).toBe(blockFingerprint('```\ncode\n```\n\n\n'));
  });
});

describe('canonicalize', () => {
  const corpus = [...DOCS.map((d) => ({ label: d.path, text: d.text, kind: d.kind })), ...RANDOM.map((d, i) => ({ label: `random ${i} ${JSON.stringify(d.text)}`, text: d.text, kind: d.kind }))];
  const canon = corpus.map((d) => canonicalize(d.text, d.kind));

  it('[B.5] keeps the rendered HTML of the body exactly and the header byte for byte (line endings read as LF) — every Markdown file of the repository and 250 seeded random texts', () => {
    corpus.forEach((d, i) => {
      expect(render(canon[i]), d.label).toBe(render(d.text));
      const h = readHeader(d.text);
      if (h) expect(canon[i].startsWith(d.text.slice(0, h.end).replace(/\r\n?/g, '\n')), d.label).toBe(true);
      expect(canon[i].includes('\r'), d.label).toBe(false);
    });
    // Something was normalised in most texts (the check is not vacuous).
    expect(corpus.filter((d, i) => canon[i] !== d.text.replace(/\r\n?/g, '\n')).length).toBeGreaterThan(corpus.length / 2);
  });

  it('[B.5] audit round 1: a leading BOM is kept, with or without a header', () => {
    for (const t of ['\uFEFF# H\n\npara\n', '\uFEFF#  H  \npara   \n', '\uFEFF{{nyml\nkind: document\n}}\n\n# H  \n', '\uFEFF\n\n']) {
      const c = canonicalize(t);
      expect(c.startsWith('\uFEFF'), JSON.stringify(t)).toBe(true);
      expect(render(c)).toBe(render(t));
      expect(canonicalize(c)).toBe(c);
    }
    expect(canonicalize('\uFEFF#  H  \npara   \n')).toBe('\uFEFF# H\npara\n');
  });

  it('[B.9] lines the renderer does not show keep their bytes: reference and footnote definitions (unused ones, in a quote, list or container) — hard breaks, emphasis and trailing spaces in titles; the canonical form renders the same when every defined label is used', () => {
    const cases: Array<[string, string]> = [
      ['x\n\n[^9]: line one  \n    line two _a_\n', '\n\nUse[^9].\n'],
      ['> [r]: /u "t _a_ b"\n> para\n', '\n\n[x][r]\n'],
      ['- [r]: /u "t _a_ b"\n\n  para\n', '\n\n[x][r]\n'],
      ['::: info\n[r]: /u "t _a_ b"\n\npara  \n:::\n', '\n\n[x][r]\n'],
      ['[r]: /u\n  "t  \n  b"\n', '\n\n[x][r]\n'],
    ];
    for (const [t, use] of cases) {
      const c = canonicalize(t);
      expect(render(c), t).toBe(render(t));
      expect(render(c.replace(/\n+$/, '') + use), t).toBe(render(t.replace(/\n+$/, '') + use));
      for (const line of t.split('\n').filter((l) => /\[(\^9|r)\]:|^\s+"?t|line two|b"/.test(l))) expect(c.split('\n'), JSON.stringify(t)).toContain(line);
    }
    // A used definition's shown text is still normalised where it renders (its hard break kept as two spaces).
    expect(canonicalize('x[^9]\n\n[^9]: one    \n    two\n')).toBe('x[^9]\n\n[^9]: one  \n    two\n');
  });

  it('[B.6] is idempotent: canonicalize(canonicalize(x)) === canonicalize(x) — the same texts', () => {
    corpus.forEach((d, i) => expect(canonicalize(canon[i], d.kind), d.label).toBe(canon[i]));
  });

  it('[B.7] whitespace and marker variants that render alike have one canonical form (line endings, blank-line runs, trailing spaces, paragraph indentation, ATX closing hashes, one-line setext headings, rules, bullets, ordered markers, `_` emphasis, table padding); code, math, raw HTML and directives keep their bytes; a hard break is kept; adjacency is kept; two lists are never joined', () => {
    const a = '#  Title  ##\r\n\r\n\r\nSome _em_ and __strong__ text.   \r\n\r\n* one\r\n* two\r\n\r\n|a|b|\r\n|:-|-:|\r\n|1|2|\r\n\r\n***\r\n';
    const b = '# Title\n\nSome *em* and **strong** text.\n\n- one\n- two\n\n| a | b |\n| :--- | ---: |\n| 1 | 2 |\n\n---\n';
    expect(canonicalize(a)).toBe(b);
    expect(canonicalize(b)).toBe(b);
    expect(canonicalize('Title\n=====\n\n   para\n   lazy  \n')).toBe('# Title\n\npara\nlazy\n');
    expect(canonicalize('1) a\n2) b\n')).toBe('1. a\n2. b\n');
    // Hard break kept as two spaces; a backslash break kept.
    expect(canonicalize('a    \nb\\\nc\n')).toBe('a  \nb\\\nc\n');
    // Verbatim: code, math, html, directives keep trailing spaces, blank runs and underscores.
    const verb = '```\nx_y_  \n\n\n```\n\n$$\na_1  \n$$\n\n<div>\n_x_  \n</div>\n\n{{mermaid\ngraph  \n}}\n';
    expect(canonicalize(verb)).toBe(verb);
    // Not emphasis: intraword, code spans, math, links, escapes, directives.
    const lit = 'snake_case_word `a_b_c` $x_1 y_2$ [a](http://x/_y_) \\_z\\_ {{sp _q_}} <http://a_b_>\n';
    expect(render(canonicalize(lit))).toBe(render(lit));
    expect(canonicalize(lit)).toContain('snake_case_word `a_b_c` $x_1 y_2$ [a](http://x/_y_) \\_z\\_');
    // Adjacency: a heading directly above its paragraph stays so; slide markers stay on their content.
    expect(canonicalize('## H\nText\n')).toBe('## H\nText\n');
    expect(canonicalize('<!-- slide -->\n## H   \n<!-- @left -->\n* L\n', 'slides')).toBe('<!-- slide -->\n## H\n<!-- @left -->\n- L\n');
    // Two lists with different bullets stay two lists.
    const two = '- a\n\n* b\n';
    expect(render(canonicalize(two))).toBe(render(two));
    expect(canonicalize(two)).toBe(two);
    // One block whose render depends on another (a reference whose label has `_`) changes nothing for the rest, above 200 blocks too.
    const poison = '[foo_]: /u\n\n_x [foo_]\n\n';
    let v1 = poison, v2 = poison;
    for (let k = 0; k < 220; k++) { v1 += `Para ${k} _e_   \n\n`; v2 += `Para ${k} *e*\n\n`; }
    expect(canonicalize(v1)).toBe(canonicalize(v2));
    expect(canonicalize(v1)).toContain('_x [foo_]\n\nPara 0 *e*\n');
    let w1 = poison, w2 = poison;
    for (let k = 0; k < 220; k++) { w1 += `* item ${k} _e_\n\n`; w2 += `- item ${k} *e*\n\n`; }
    expect(canonicalize(w1)).toBe(canonicalize(w2));
    // Equal canonical forms for corpus files written with CR LF and extra blank lines between blocks.
    for (const d of DOCS.slice(0, 40)) {
      const bs = splitBlocks(d.text, { kind: d.kind, unit: 'block' });
      let padded = '';
      for (const [i, s] of slices(d.text, bs).entries()) padded += s + (i + 1 < bs.length && /\n[ \t]*\n$/.test(s) && bs[i].type !== 'header' ? '\n  \n' : '');
      expect(canonicalize(padded.replace(/\r?\n/g, '\r\n'), d.kind), d.path).toBe(canonicalize(d.text, d.kind));
    }
  });

  it('[B.7] audit round 2 (M1-b): reference labels and footnote references keep their bytes (whether a label is a link depends on definitions another version may add); link text and the rest of the line are still normalised', () => {
    for (const t of ['see [_x_] here\n', '[a][_x_]\n', '[_x_][]\n', 'x[^_n_]\n', '[^_n_] y\n', '[_x_] [[_y_]]\n']) {
      expect(canonicalize(t), t).toBe(t);
      // The same text with the definitions added renders as the canonical form with them.
      const defs = '\n[_x_]: /u\n\n[^_n_]: n\n';
      expect(render(canonicalize(t) + defs), t).toBe(render(t + defs));
    }
    expect(canonicalize('[_a_](http://x/_y_) [_b_] _c_\n')).toBe('[*a*](http://x/_y_) [_b_] *c*\n');
    // Brackets nested 20k deep stay linear.
    const t0 = performance.now();
    canonicalize('['.repeat(20_000) + '_a_' + ']'.repeat(20_000) + '\n');
    expect(performance.now() - t0).toBeLessThan(3000);
  });

  it('[B.7] audit round 2 (M3-b): many blocks whose render depends on a definition (the auditor\'s k = 100: `_x [f_]` + `[f_]: /u`, interleaved with ordinary changes) — every ordinary change is still made; a rule right under a line of text is `***` (`---` would make it a heading); the header\'s own bytes, blank lines between a legacy pair included, are kept', () => {
    const make = (n: number, us: boolean) => {
      const parts: string[] = [];
      for (let i = 0; i < n; i++) { parts.push(`_x [f${i}_]`); parts.push(`[g${i}] ${us ? '_e_' : '*e*'}`); }
      for (let i = 0; i < n; i++) { parts.push(`[f${i}_]: /u${i}`); parts.push(`[g${i}]: /v${i}`); }
      return parts.join('\n\n') + '\n';
    };
    const a = make(100, true);
    const ca = canonicalize(a);
    expect(ca).toBe(canonicalize(make(100, false)));
    expect(ca.match(/_e_/g)).toBe(null);
    expect(render(ca)).toBe(render(a));
    expect(canonicalize(ca)).toBe(ca);
    // A rule under a paragraph line.
    for (const r of ['***', '* * *', '- - -', '___']) expect(canonicalize(`para\n${r}\n`), r).toBe('para\n***\n');
    expect(canonicalize('para\n\n* * *\n')).toBe('para\n\n---\n');
    // B.7's stated exception: the header is kept byte for byte, so blank lines inside a legacy pair stay.
    const pair = '{{nyml\nkind: meta\ntitle: T\n}}\n\n\n\n{{nyml\nkind: document\n}}\n\n# A\n';
    expect(canonicalize(pair)).toBe(pair);
    expect(canonicalize(pair.replace('\n\n\n\n', '\n\n'))).toBe(pair.replace('\n\n\n\n', '\n\n'));
  });

  it('[B.8] splitBlocks and canonicalize run in time linear in the text on crafted input (20k emphasis openers on one line, 20k unclosed backticks, `<`, `$`, `{{`, 5000 blocks)', () => {
    const time = (f: () => unknown) => { const t0 = performance.now(); f(); return performance.now() - t0; };
    const lines = ['_a '.repeat(20_000), '`'.repeat(1) + ' x`` '.repeat(20_000), '< a '.repeat(20_000), '$ a '.repeat(20_000), '{{ a '.repeat(20_000), '](x '.repeat(20_000)];
    for (const line of lines) {
      const ms = time(() => canonicalize(line + '\n'));
      expect(ms, line.slice(0, 12)).toBeLessThan(3000);
    }
    const many = Array.from({ length: 5000 }, (_, i) => `## H${i}\n\nPara _${i}_   \n`).join('\n');
    expect(time(() => splitBlocks(many))).toBeLessThan(3000);
    expect(time(() => canonicalize(many))).toBeLessThan(15_000);
  });

  it('[B.8] audit round 1: linear in the block count (40k short paragraphs), in backtick runs of every length on one line, and one context-dependent block among ~200 large ones costs about what the text without it costs', () => {
    const time = (f: () => unknown) => { const t0 = performance.now(); f(); return performance.now() - t0; };
    // M2: 40k blocks (quadratic before: ~15 s).
    const many = Array.from({ length: 40_000 }, (_, i) => `p${i}`).join('\n\n') + '\n';
    expect(time(() => canonicalize(many))).toBeLessThan(5000);
    // L7: runs of 1…1200 backticks (720 kB; ~5 s before).
    let ticks = '_x_ ';
    for (let i = 1; i <= 1200; i++) ticks += '`'.repeat(i) + 'a';
    expect(time(() => canonicalize(ticks + '\n'))).toBeLessThan(2000);
    // M3: ~1 MB, 197 blocks, with and without one context-dependent block (~12 s and ~0.5 GB before).
    const big = (k: number) => `Paragraph ${k} with _emphasis_ text   \n` + ('lorem ipsum dolor sit amet '.repeat(16) + '\n').repeat(12);
    let clean = '';
    for (let k = 0; k < 197; k++) clean += big(k) + '\n';
    const tClean = time(() => canonicalize(clean));
    let out = '';
    const tPoison = time(() => { out = canonicalize('[foo_]: /u\n\n_x [foo_]\n\n' + clean); });
    expect(out.includes('\n_x [foo_]\n')).toBe(true);
    expect(out.includes('\nParagraph 196 with *emphasis* text  \n')).toBe(true);
    expect(tPoison).toBeLessThan(2 * tClean + 1000);
  }, 60_000);

  it('[B.8] audit round 2 (M3-b): the auditor\'s ~1 MB text with 100 definition-dependent blocks costs about what it costs without them (277 s before), and a call makes at most 1 + 2 × 8 + 64 = 81 whole-body renders', () => {
    const time = (f: () => unknown) => { const t0 = performance.now(); f(); return performance.now() - t0; };
    const make = (n: number) => {
      const parts: string[] = [];
      for (let i = 0; i < n; i++) { parts.push(`_x [f${i}_]`); parts.push(`[g${i}] _e_`); }
      const filler = 'word _e_ '.repeat(330).trim();
      for (let i = 0; i < 1000 / 3; i++) parts.push(filler);
      for (let i = 0; i < n; i++) { parts.push(`[f${i}_]: /u${i}`); parts.push(`[g${i}]: /v${i}`); }
      return parts.join('\n\n') + '\n';
    };
    const clean = make(0);
    const poison = make(100);
    expect(poison.length).toBeGreaterThan(900_000);
    const tClean = time(() => canonicalize(clean));
    const p = kitParser();
    const real = p.render.bind(p);
    let whole = 0;
    let out = '';
    p.render = ((src: string, env?: object) => { if (src.length > 100_000) whole++; return real(src, env); }) as typeof p.render;
    let tPoison: number;
    try { tPoison = time(() => { out = canonicalize(poison); }); } finally { p.render = real as typeof p.render; }
    expect(out.match(/_e_/g)).toBe(null);
    expect(whole).toBeLessThanOrEqual(81);
    expect(tPoison).toBeLessThan(2 * tClean + 2000);
  }, 120_000);
});
