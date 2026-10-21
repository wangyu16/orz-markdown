/**
 * Twin-link naming and the parser-based targets of a text (orz-markdown 2.5.0;
 * K1 and K2 of the orz-site design, FC-18 §8.2/§8.3): claims K.33–K.36 in
 * notes/CLAIMS.md. The real-Chrome halves (the file's read view, its saves,
 * verify.html; A.33, M.44) are in tests/carrier-links-chrome.test.ts; the app,
 * editor and update halves are A.32, E.49 and U.14 in their own suites;
 * and the conformance checks `C.links.*` (tests/conformance.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  assembleEnvelope, extract, twinHref, twinNaming, readTwinNaming, sameTwinNaming, isTwinTemplate, twinFileName, textNameOf, FAMILY_NAMING,
  includeTargets, linkTargets, registerTwinLinks, envTwinNaming, type Kind, type ShellParts, type TwinNaming,
} from '../src/carrier';
import * as read from '../src/carrier/read';
import * as node from '../src/carrier/node';
import { md } from '../src/index';
import { renderMarkdownPreview, renderMarkdownPreviewWithIncludes } from '../src/carrier/editor';

const ROOT = 'tests/carrier-corpus';
const manifest = JSON.parse(readFileSync(`${ROOT}/manifest.json`, 'utf8')) as { files: Array<{ path: string; kind: Kind }> };
const corpus = manifest.files.map((f) => ({ ...f, text: readFileSync(`${ROOT}/${f.path}`).toString('utf8') }));

const SITE: TwinNaming = { md: '{stem}.html', slides: '{stem}.deck.html' };
const parts = (kind: Kind, over: Partial<ShellParts> = {}): ShellParts => ({ kind, shellVersion: '1.2.3', headHtml: '<style>x</style>', bodyHtml: '<div id="orz-app"></div>', ...over });
const shellOf = (html: string): string => /<script type="application\/json" id="orz-shell">([^<]*)<\/script>/.exec(html)![1];

describe('the naming (FC-18 §8.2)', () => {
  it('[K.33] twinNaming validates and normalizes: "family", true, null, {}, and the family templates are the family naming (null); a naming lists only the kinds that differ, in the order md, slides, paged; an unknown kind, a template without {stem} or with it twice, a "/", another character, a name not ending in .html, an array or another type throw; readTwinNaming reads the same without throwing (null)', () => {
    for (const fam of [undefined, null, 'family', true, {}, { ...FAMILY_NAMING }, { md: '{stem}.md.html' }, { paged: undefined }]) expect(twinNaming(fam), JSON.stringify(fam)).toBeNull();
    expect(twinNaming({ slides: '{stem}.deck.html', md: '{stem}.html', paged: '{stem}.paged.html' })).toEqual({ md: '{stem}.html', slides: '{stem}.deck.html' });
    expect(Object.keys(twinNaming({ slides: 'deck-{stem}.html', md: '{stem}.html' })!)).toEqual(['md', 'slides']);
    for (const ok of ['{stem}.html', 'x-{stem}_v2.html', '{stem}.MD.html', '{stem}.html.html']) expect(isTwinTemplate(ok), ok).toBe(true);
    const bad: unknown[] = [{ docx: '{stem}.html' }, { md: 'x.html' }, { md: '{stem}{stem}.html' }, { md: '{stem}/index.html' }, { md: '{stem} copy.html' }, { md: '{stem}.htm' }, { md: '{stem}.md' }, { md: 7 }, { md: null }, ['md'], 'site', 3, false];
    for (const b of bad) {
      expect(() => twinNaming(b), JSON.stringify(b)).toThrow(TypeError);
      expect(readTwinNaming(b)).toBeNull();
    }
    expect(isTwinTemplate(`${'a'.repeat(200)}{stem}.html`)).toBe(false);
    expect(sameTwinNaming(undefined, { ...FAMILY_NAMING })).toBe(true);
    expect(sameTwinNaming({ slides: '{stem}.deck.html', md: '{stem}.html' }, SITE)).toBe(true);
    expect(sameTwinNaming(SITE, { md: '{stem}.html' })).toBe(false);
    expect(sameTwinNaming(SITE, undefined)).toBe(false);
    // the parser-free entry has the same API (extract reads the naming without the parser)
    for (const name of ['twinNaming', 'readTwinNaming', 'sameTwinNaming', 'isTwinTemplate', 'twinHref', 'twinFileName', 'textNameOf', 'FAMILY_NAMING']) expect(name in read, name).toBe(true);
  });

  it('[K.33] twinHref(href, naming) maps a text twin to the naming\'s name in the same folder, keeping ?query and #fragment; a kind the naming leaves out keeps the family name; without a naming (or "family") it is the family rule; everything twinHref never rewrote stays untouched; twinFileName and textNameOf are each other\'s inverse', () => {
    const cases: Array<[string, string]> = [
      ['notes.md', 'notes.html'],
      ['../up/notes.md?v=2#part', '../up/notes.html?v=2#part'],
      ['/root/x.md', '/root/x.html'],
      ['week2.slides.md#/3', 'week2.deck.html#/3'],
      ['./a/report.paged.md', './a/report.paged.html'],
      ['caf%C3%A9.md', 'caf%C3%A9.html'],
      ['https://example.org/notes.md', 'https://example.org/notes.md'],
      ['//cdn.example.org/x.md', '//cdn.example.org/x.md'],
      ['#notes.md', '#notes.md'],
      ['?file=a.md', '?file=a.md'],
      ['README.MD', 'README.MD'],
      ['notes.md.html', 'notes.md.html'],
      ['dir.md/', 'dir.md/'],
      ['.md', '.md'],
      ['data.csv', 'data.csv'],
    ];
    for (const [href, want] of cases) expect(twinHref(href, SITE), href).toBe(want);
    for (const n of [undefined, null, 'family', {}] as const) {
      expect(twinHref('a/b.md#x', n as never)).toBe('a/b.md.html#x');
      expect(twinHref('b.slides.md', n as never)).toBe('b.slides.html');
    }
    expect(() => twinHref('a.md', { md: 'x.html' })).toThrow(TypeError);
    // $-patterns in a stem are text, not replacement patterns
    expect(twinHref('$&.md', SITE)).toBe('$&.html');
    expect(twinFileName('week1.slides.md', SITE)).toBe('week1.deck.html');
    expect(twinFileName('week1.paged.md', SITE)).toBe('week1.paged.html');
    expect(twinFileName('data.csv', SITE)).toBeNull();
    expect(textNameOf('week1.html', 'md', SITE)).toBe('week1.md');
    expect(textNameOf('week1.deck.html', 'slides', SITE)).toBe('week1.slides.md');
    expect(textNameOf('week1.slides.html', 'slides', SITE)).toBe('week1.slides.md'); // the family name is read under every naming
    expect(textNameOf('week1.paged.html', 'paged', SITE)).toBe('week1.paged.md');
    expect(textNameOf('week1.html', 'slides', SITE)).toBeNull();
    expect(textNameOf('.html', 'md', SITE)).toBeNull();
    expect(textNameOf('week1.html', 'md')).toBeNull();
    for (const name of ['a.md', 'x.y.slides.md', 'r.paged.md']) {
      const kind: Kind = name.endsWith('.slides.md') ? 'slides' : name.endsWith('.paged.md') ? 'paged' : 'md';
      expect(textNameOf(twinFileName(name, SITE)!, kind, SITE), name).toBe(name);
    }
  });
});

describe('the envelope (FC-18 §8.1, §8.2)', () => {
  it('[K.34] without a naming every file is byte for byte what 2.4.0 assembled: the SHA-256 over every corpus text assembled inline and cdn equals the one 2.4.0\'s kit gives (computed with the 2.4.0 source on 2026-10-21), and twinLinks absent, {}, "family", null or the family templates give those same bytes, with no "links" in #orz-shell', () => {
    const h = createHash('sha256');
    for (const f of corpus) {
      for (const delivery of ['inline', 'cdn'] as const) {
        const base = assembleEnvelope(f.text, parts(f.kind, { delivery, ...(f.path.includes('include') ? { includes: { 'a.md': 'A' } } : {}) }));
        h.update(base);
        expect(shellOf(base)).not.toContain('"links"');
        for (const fam of [{}, 'family', null, { ...FAMILY_NAMING }] as const) {
          const same = assembleEnvelope(f.text, parts(f.kind, { delivery, twinLinks: fam as never, ...(f.path.includes('include') ? { includes: { 'a.md': 'A' } } : {}) }));
          expect(same === base, `${f.path} ${delivery} ${JSON.stringify(fam)}`).toBe(true);
        }
      }
    }
    expect(corpus.length).toBe(33);
    expect(h.digest('hex')).toBe('429c34f7fd9b918ee19a4f3b0a953717c2559d8454bb7d39d942d5e458d5e58e');
  });

  it('[K.34] a naming other than the family\'s is stored normalized as #orz-shell "links" (after delivery) and extract gives it back; assemble → extract → assemble with it is byte-identical for every corpus text (round trip and idempotence, FC-18 laws 1–3); key order does not change the bytes; an invalid naming throws; a file whose "links" is not a valid naming extracts without it', () => {
    for (const f of corpus) {
      const a = assembleEnvelope(f.text, parts(f.kind, { twinLinks: SITE }));
      const x = extract(a)!;
      expect(x.text === f.text, f.path).toBe(true);
      expect(x.twinLinks, f.path).toEqual(SITE);
      expect(assembleEnvelope(x.text, parts(f.kind, { twinLinks: x.twinLinks })) === a, f.path).toBe(true);
      expect(assembleEnvelope(f.text, parts(f.kind, { twinLinks: { slides: '{stem}.deck.html', paged: '{stem}.paged.html', md: '{stem}.html' } })) === a, f.path).toBe(true);
    }
    const one = assembleEnvelope('# A\n', parts('md', { delivery: 'cdn', twinLinks: { md: '{stem}.html' } }));
    expect(shellOf(one)).toBe('{"kind":"md","format":1,"shell":"1.2.3","delivery":"cdn","links":{"md":"{stem}.html"}}');
    expect(extract(assembleEnvelope('# A\n', parts('md')))!.twinLinks).toBeUndefined();
    expect('twinLinks' in extract(assembleEnvelope('# A\n', parts('md')))!).toBe(false);
    expect(() => assembleEnvelope('# A\n', parts('md', { twinLinks: { md: '../{stem}.html' } }))).toThrow(TypeError);
    for (const forged of ['{"md":"x.html"}', '"site"', '[1]', '{"md":"{stem}.md.html"}']) {
      const f = one.replace('"links":{"md":"{stem}.html"}', `"links":${forged}`);
      expect(extract(f)!.twinLinks, forged).toBeUndefined();
    }
  });
});

describe('the render rule (FC-18 §8.3)', () => {
  it('[K.35] env.orzTwinLinks may be a naming: links (not images, not raw HTML, not absolute) are rewritten with its names, also inside nested inline renders and reference links; true is the family names; an invalid naming renders the family names; anything else rewrites nothing; envTwinNaming says which', () => {
    const src = '[a](a.md#x) [b](b.slides.md?q) [p](p.paged.md) [c](https://x.org/c.md) ![i](i.md) <a href="raw.md">r</a>\n\n> - [d][ref]\n\n[ref]: d.md\n\n::: spoil [e](e.md)\nbody\n:::\n';
    const on = md.render(src, { orzTwinLinks: SITE });
    for (const want of ['href="a.html#x"', 'href="b.deck.html?q"', 'href="p.paged.html"', 'href="https://x.org/c.md"', 'src="i.md"', 'href="raw.md"', 'href="d.html"', 'href="e.html"']) expect(on, want).toContain(want);
    expect(md.render(src, { orzTwinLinks: true })).toContain('href="a.md.html#x"');
    expect(md.render(src, { orzTwinLinks: { md: 'bad.html' } })).toBe(md.render(src, { orzTwinLinks: true }));
    expect(md.render(src, { orzTwinLinks: ['x'] })).toBe(md.render(src));
    expect(envTwinNaming({ orzTwinLinks: SITE })).toEqual(SITE);
    expect(envTwinNaming({ orzTwinLinks: true })).toBeNull();
    expect(envTwinNaming({ orzTwinLinks: { ...FAMILY_NAMING } })).toBeNull();
    expect(envTwinNaming({ orzTwinLinks: 'yes' })).toBeUndefined();
    expect(envTwinNaming({})).toBeUndefined();
    registerTwinLinks(md);
  });

  it('[K.35] the md preview renderer takes the naming (renderMarkdownPreview / …WithIncludes, `twinLinks`), and renders exactly what the reader\'s render does with it; false still renders links as written', async () => {
    const text = '{{nyml\nkind: document\n}}\n\nSee [w2](week2.slides.md#s) and [n](../notes.md).\n';
    const body = 'See [w2](week2.slides.md#s) and [n](../notes.md).\n';
    const html = renderMarkdownPreview(text, { twinLinks: SITE });
    expect(html.replace(/ data-src-line="\d+"/g, '')).toBe(md.render(body, { orzTwinLinks: SITE }));
    expect(html).toContain('href="week2.deck.html#s"');
    expect(html).toContain('href="../notes.html"');
    expect(await renderMarkdownPreviewWithIncludes(text, { twinLinks: SITE, includes: {} })).toBe(html);
    expect(renderMarkdownPreview(text, { twinLinks: false })).toContain('href="../notes.md"');
    expect(renderMarkdownPreview(text)).toContain('href="../notes.md.html"');
  });
});

describe('targets of a text (K2)', () => {
  it('[K.36] includeTargets is browser-safe in orz-markdown/carrier (the same function the Node entry still exports): include directives as the renderer finds them, in order, without repeats, never in code or the header', () => {
    expect(node.includeTargets).toBe(includeTargets);
    const t = '{{nyml\nkind: document\ntitle: {{md header.md}}\n}}\n\n{{md part.md}}\n\n```\n{{md code.md}}\n```\n\n<!-- {{md comment.md}} -->\n\n{{markdown https://example.com/x.md}}\n\n{{md part.md}}\n\n{{md-include other.md}}\n';
    expect(includeTargets(t)).toEqual(['part.md', 'https://example.com/x.md', 'other.md']);
    expect(includeTargets(t, ['md'])).toEqual(['part.md']);
  });

  it('[K.36] linkTargets lists a text\'s links as the renderer reads them: Markdown links, reference links, autolinks and images (image: true; never twin), the inline body of {{sp}}, raw-HTML <a href> inline and in blocks (raw: true); with the 1-based line of the whole text; kind twin / asset / other as the twin-link rule decides; never in code, comments, the header or an unused reference definition', () => {
    const t = [
      '{{nyml', 'kind: document', 'title: [no](header.md)', '}}', '',
      '# Links', '',
      'See [two](week2.slides.md#s3) and', '[notes](../notes.md?v=1), ![pic](img/a.png) ![md image](x.md).', '',
      '- [ref][r] <https://example.org/a.md> [frag](#top) [q](?x=1) [mail](mailto:a@b.md)', '',
      '[r]: ref.paged.md', '[unused]: never.md', '',
      '```', '[code](code.md)', '```', '',
      '<!-- [comment](comment.md) -->', '',
      'Raw <a href="raw.md">inline</a> and {{sp [in span](span.md)}}.', '',
      '<div>', '<p>a</p>', '<a class="x" href=\'block.md#b\'>block</a>', '</div>', '',
      '[data](files/data.csv) [up](/root/up.md) [ext](//cdn.example.org/x.md)', '',
    ].join('\n');
    const got = linkTargets(t).map((l) => [l.href, l.line, l.kind, l.image, l.raw]);
    expect(got).toEqual([
      ['week2.slides.md#s3', 8, 'twin', false, false],
      ['../notes.md?v=1', 9, 'twin', false, false],
      ['img/a.png', 9, 'asset', true, false],
      ['x.md', 9, 'asset', true, false],
      ['ref.paged.md', 11, 'twin', false, false],
      ['https://example.org/a.md', 11, 'other', false, false],
      ['#top', 11, 'other', false, false],
      ['?x=1', 11, 'other', false, false],
      ['mailto:a@b.md', 11, 'other', false, false],
      ['raw.md', 22, 'twin', false, true],
      ['span.md', 22, 'twin', false, false],
      ['block.md#b', 26, 'twin', false, true],
      ['files/data.csv', 29, 'asset', false, false],
      ['/root/up.md', 29, 'twin', false, false],
      ['//cdn.example.org/x.md', 29, 'other', false, false],
    ]);
    // the href is what the renderer writes (percent-encoded), so the twin rule and the check agree
    expect(linkTargets('[a](<my notes.md>)\n')).toEqual([{ href: 'my%20notes.md', line: 1, kind: 'twin', image: false, raw: false }]);
    expect(linkTargets('')).toEqual([]);
    // CR LF texts count lines the same way
    expect(linkTargets('{{nyml\r\nkind: document\r\n}}\r\n\r\nx\r\n[a](a.md)\r\n').map((l) => l.line)).toEqual([6]);
  });

  it('[K.36] the README lists includeTargets and linkTargets on orz-markdown/carrier, and the browser-safe entries bundle them without Node shims', async () => {
    const readme = readFileSync('README.md', 'utf8');
    const row = readme.split('\n').find((l) => l.startsWith('| `orz-markdown/carrier` |'))!;
    expect(row).toContain('includeTargets');
    expect(row).toContain('linkTargets');
    const { build } = await import('esbuild');
    const out = await build({ stdin: { contents: "export { includeTargets, linkTargets } from './src/carrier';", resolveDir: '.', loader: 'ts' }, bundle: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent', metafile: true });
    expect(Object.keys(out.metafile!.inputs).filter((f) => f.includes('carrier/node'))).toEqual([]);
  });
});
