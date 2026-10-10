/**
 * The carrier kit's 2.3.0 additions to `orz-markdown/carrier` (the kit gaps
 * the orz-paged 1.0 rebuild found, REBUILD §3b): `normalizeHeader`, the
 * kind's theme list in `lintHeader` / `readDocument`, and what orz-mdhtml and
 * orz-paged copied — the synchronous `sha256`, the legacy 0.x island reader
 * and the kind-independent core of `inspect`. Claims K.23–K.27 in
 * notes/CLAIMS.md.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  assembleEnvelope, assembledStructure, decodeEntities, editHeader, extract, generatorOf, hasRawAttr, heldText, lintHeader, looksHtml, normalizeHeader,
  rawAttr, rawElements, readDocument, readHeader, readLegacyIsland, scriptElement, sha256, shellWord, storedText, twinCheck, withoutHeader,
} from '../src/carrier';

const ROOT = 'tests/carrier-corpus';
const manifest = JSON.parse(readFileSync(`${ROOT}/manifest.json`, 'utf8')) as { files: Array<{ path: string; legacyHeader: boolean }> };
const corpus = manifest.files.map((e) => ({ e, text: readFileSync(`${ROOT}/${e.path}`).toString('utf8') }));

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

describe('normalizeHeader (2.3.0)', () => {
  it('[K.23] normalizeHeader performs the legacy merge every header edit performs first, with no change: a leading kind: meta + kind: document pair becomes one kind: document block (the document block\'s lines first, then the meta-only keys\'; the document block wins a clash), a lone kind: meta header becomes kind: document; it equals the merge editHeader does (an edit then its undo), keeps every byte outside the header (CR LF, BOM), and returns any other text as is — corpus-wide', () => {
    const pair = '﻿{{nyml\r\nkind: meta\r\ntitle: Meta title\r\nauthor: Ann\r\n}}\r\n\r\n{{nyml\r\nkind: document\r\ntitle: Doc title\r\ntheme: a\r\n}}\r\n\r\n# Body\r\n';
    const merged = normalizeHeader(pair);
    expect(readHeader(merged)!.legacy).toBeNull();
    expect(readHeader(merged)!.fields).toEqual({ title: 'Doc title', theme: 'a', author: 'Ann' });
    expect(merged).toBe('﻿{{nyml\r\nkind: document\r\ntitle: Doc title\r\ntheme: a\r\nauthor: Ann\r\n}}\r\n\r\n# Body\r\n');
    expect(merged).toBe(editHeader(editHeader(pair, { x_tool_scratch: '1' }), { x_tool_scratch: null }));
    const lone = '{{nyml\nkind: meta\ntitle: T\n}}\n\nBody\n';
    expect(normalizeHeader(lone)).toBe('{{nyml\nkind: document\ntitle: T\n}}\n\nBody\n');
    for (const t of ['', 'no header\n', '{{nyml\nkind: document\ntitle: x\n}}\n\nbody\n', '```\n{{nyml\nkind: meta\n}}\n```\n']) expect(normalizeHeader(t)).toBe(t);
    for (const { e, text } of corpus) {
      const n = normalizeHeader(text);
      if (!e.legacyHeader) { expect(n, e.path).toBe(text); continue; }
      expect(readHeader(n)!.legacy, e.path).toBeNull();
      expect(withoutHeader(n).body, e.path).toBe(withoutHeader(text).body);
      expect(normalizeHeader(n), e.path).toBe(n); // idempotent
    }
  });
});

describe('lintHeader with the kind\'s themes (2.3.0)', () => {
  it('[K.24] lintHeader(text, { kind, themes }) reports a header theme outside the given list as unknown-theme (warning) for any kind, readDocument(text, { kind, themes }) carries it in its lint; without themes only kind md is checked against THEMES (as in 2.2.0), and lintHeader(text, kind) still works', () => {
    const paged = '{{nyml\nkind: document\ncarrier: paged\ntheme: academic\n}}\n\n# P\n';
    expect(lintHeader(paged, 'paged').map((l) => l.code)).not.toContain('unknown-theme');
    expect(lintHeader(paged, { kind: 'paged', themes: ['academic', 'report'] }).map((l) => l.code)).not.toContain('unknown-theme');
    const f = lintHeader(paged, { kind: 'paged', themes: ['report'] }).find((l) => l.code === 'unknown-theme')!;
    expect([f.level, f.key, f.line]).toEqual(['warning', 'theme', 4]);
    expect(readDocument(paged, { kind: 'paged', themes: ['report'] }).lint.map((l) => l.code)).toContain('unknown-theme');
    expect(readDocument(paged, { kind: 'paged' }).lint.map((l) => l.code)).not.toContain('unknown-theme');
    expect(lintHeader(paged, { themes: [' academic '] }).map((l) => l.code)).not.toContain('unknown-theme'); // trimmed
    const md = '{{nyml\nkind: document\ntheme: nope\n}}\n';
    expect(lintHeader(md, 'md').map((l) => l.code)).toContain('unknown-theme');
    expect(lintHeader(md, { kind: 'md' }).map((l) => l.code)).toContain('unknown-theme');
    expect(lintHeader(md, { kind: 'md', themes: ['nope'] }).map((l) => l.code)).not.toContain('unknown-theme');
    expect(lintHeader(md)).toEqual(lintHeader(md, {}));
  });
});

describe('sha256 (2.3.0)', () => {
  it('[K.25] sha256(text) is the lowercase hex SHA-256 of the text\'s UTF-8 bytes, synchronous and isomorphic (no Node built-ins, no WebCrypto): it equals node:crypto for the empty text, every corpus file (BOM, CR LF kept), block-boundary lengths (55–65, 119–129 bytes) and seeded random text with astral characters', () => {
    const node = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    for (const { e, text } of corpus) expect(sha256(text), e.path).toBe(node(text));
    for (const n of [55, 56, 57, 63, 64, 65, 119, 120, 128, 129]) expect(sha256('x'.repeat(n))).toBe(node('x'.repeat(n)));
    const r = rng(23);
    const pool = ['a', ' ', '\n', '\r\n', '﻿', 'é', '漢', '𝒳', '😀', '}', '<', '\t'];
    for (let i = 0; i < 200; i++) {
      let s = '';
      const len = Math.floor(r() * 400);
      for (let j = 0; j < len; j++) s += pool[Math.floor(r() * pool.length)];
      expect(sha256(s)).toBe(node(s));
    }
    const big = 'orz '.repeat(300_000);
    expect(sha256(big)).toBe(node(big));
    const src = readFileSync('src/carrier/sha256.ts', 'utf8');
    expect(src).not.toMatch(/\bimport\b|require\(|crypto\.subtle|process\./);
  });
});

/** A 0.x file as both 0.x carriers wrote it: the island wrapped in "\n…\n", `</script` written `<\/script`. */
function legacyFile(source: string, o: { generator?: string; config?: string; island?: string; engine?: 'inline' | 'cdn' | null; title?: string } = {}): string {
  const island = o.island ?? `\n${source.replace(/<\/(script)/gi, '<\\/$1')}\n`;
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    o.generator === undefined ? '<meta name="generator" content="orz-paged 0.7.3">' : o.generator ? `<meta name="generator" content="${o.generator}">` : '',
    `<title>${o.title ?? 'A &amp; B &#x1D4B3; &#55357;'}</title>`,
    '<script type="application/orz-meta+json" id="orz-meta">{"title":"Meta","author":"Ann"}</script>',
    '<!-- <script id="orz-src">a decoy in a comment</script> -->',
    '<script>var s = "<script id=\\"orz-src\\">a decoy in a string";</script>',
    '</head><body>',
    `<script type="text/markdown" id="orz-src">${island}</script>`,
    o.config === undefined ? '<script>window.__ORZ_PAGED__ = {"version":"0.7.3","mode":"inline"};</script>' : o.config,
    o.engine === null ? '' : o.engine === 'cdn' ? '<script data-orz-asset="engine" src="https://cdn.example/x.js"></script>' : '<script data-orz-asset="engine">/* engine */</script>',
    '</body></html>',
  ].join('\n');
}
const PAGED = { generator: /^orz-paged(\s|$)/, config: '__ORZ_PAGED__' };
const MDHTML = { generator: /^orz-mdhtml$/, config: '__ORZ_MDHTML__' };

describe('the legacy 0.x island reader (2.3.0)', () => {
  it('[K.26] readLegacyIsland(html, { generator, config }) reads a carrier\'s 0.x file: the source exactly (the writer\'s "\\n…\\n" or "\\r\\n…\\r\\n" wrapper removed, every <\\/script restored to </script and counted; no wrapper: kept exactly, with a note; a non-markdown island type noted), the generator, the config object (a JSON config that is not readable is configError), the engine\'s delivery, the decoded <title>, #orz-meta and the raw elements — skipping decoys in comments and script strings; it is null for a format-1 file, a file without #orz-src, and another carrier\'s 0.x file; rawElements, rawAttr, hasRawAttr, decodeEntities and generatorOf are its parts', () => {
    const source = '{{nyml\nkind: document\ntheme: academic\n}}\n\n# Old </script> and </SCRIPT >\n';
    const l = readLegacyIsland(legacyFile(source), PAGED)!;
    expect([l.text === source, l.wrapped, l.scriptEscapes, l.generator, l.config, l.configError, l.delivery, l.title, l.meta, l.notes]).toEqual([
      true, true, 2, 'orz-paged 0.7.3', { version: '0.7.3', mode: 'inline' }, false, 'inline', 'A & B 𝒳 &#55357;', { title: 'Meta', author: 'Ann' }, [],
    ]);
    expect(l.elements.map((e) => e.name)).toEqual(['title', 'script', 'script', 'script', 'script', 'script']);
    // CR LF wrapper (a converted file), no wrapper, another type
    expect(readLegacyIsland(legacyFile('', { island: '\r\nA\r\nB\r\n' }), PAGED)!.text).toBe('A\r\nB');
    const bare = readLegacyIsland(legacyFile('', { island: 'kept as is' }), PAGED)!;
    expect([bare.text, bare.wrapped, bare.notes]).toEqual(['kept as is', false, ['the source island lacks the 0.x writer\'s "\\n…\\n" wrapper; its content is kept exactly']]);
    const typed = legacyFile(source).replace('type="text/markdown" id="orz-src"', 'type="text/plain" id="orz-src"');
    expect(readLegacyIsland(typed, PAGED)!.notes).toEqual(['the source island\'s type is "text/plain", not text/markdown']);
    // markers: the generator or the config is enough; a broken config is reported, not fatal
    expect(readLegacyIsland(legacyFile(source, { generator: '' }), PAGED)!.generator).toBeNull();
    const broken = readLegacyIsland(legacyFile(source, { config: '<script>window.__ORZ_PAGED__ = {nope};</script>' }), PAGED)!;
    expect([broken.configError, broken.config]).toEqual([true, {}]);
    expect(readLegacyIsland(legacyFile(source, { config: '<script>window.__ORZ_PAGED__ = [1];</script>' }), PAGED)!.configError).toBe(false);
    expect(readLegacyIsland(legacyFile(source, { generator: '', config: '' }), PAGED)).toBeNull();
    expect(readLegacyIsland(legacyFile(source), MDHTML)).toBeNull(); // another carrier's file
    const md = legacyFile('# md', { generator: 'orz-mdhtml', config: '<script>window.__ORZ_MDHTML__ = {"rendererVersion":"0.9.3","docId":"x"};</script>', engine: 'cdn' });
    expect([readLegacyIsland(md, MDHTML)!.config['rendererVersion'], readLegacyIsland(md, MDHTML)!.delivery]).toEqual(['0.9.3', 'cdn']);
    expect(readLegacyIsland(legacyFile(source, { engine: null }), PAGED)!.delivery).toBeNull();
    // not a 0.x file
    const f1 = assembleEnvelope(source, { kind: 'paged', shellVersion: '1.0.0', headHtml: '<meta name="generator" content="orz-paged 0.7.3">', bodyHtml: '<script>window.__ORZ_PAGED__ = {};</script>' });
    expect(readLegacyIsland(f1, PAGED)).toBeNull();
    expect(readLegacyIsland('<!doctype html><meta name="generator" content="orz-paged 0.7"><body></body>', PAGED)).toBeNull();
    expect(() => readLegacyIsland(legacyFile(source), { generator: /x/, config: 'a.b' })).toThrow(/config global/);
    // the parts
    const els = rawElements('<p><SCRIPT id=a>x</ScRiPt ><!-- <style>no</style> --><style>s</style><textarea>open');
    expect(els.map((e) => [e.name, e.attrs.trim()])).toEqual([['script', 'id=a'], ['style', ''], ['textarea', '']]);
    expect(els[2].end).toBe(els[2].start + 4);
    expect([rawAttr(' id="orz-src" type=text/markdown', 'type'), rawAttr(` data-x='1'`, 'data-x'), rawAttr(' idx="1"', 'id'), hasRawAttr(' defer src=x', 'defer'), hasRawAttr(' data-src=x', 'src')]).toEqual(['text/markdown', '1', null, true, false]);
    expect(() => rawAttr('', 'a"b')).toThrow();
    expect(decodeEntities('&lt;&gt;&quot;&apos;&nbsp;&amp;amp; &#65;&#x1F600; &#0; &#xD800; &#x110000;')).toBe('<>"\' &amp; A😀 &#0; &#xD800; &#x110000;');
    expect([generatorOf('<head><meta name="generator" content="orz-x 1"></head><body><meta name="generator" content="no">'), generatorOf('<body><meta name="generator" content="no">')]).toEqual(['orz-x 1', null]);
  });
});

const VERSION = '1.2.0';
const bundleUrl = (v: string) => `https://cdn.jsdelivr.net/npm/orz-paged-browser@${v}/orz-paged.browser.js`;
const ENGINE = 'window.__engine = 1;';
const fileOf = (text: string, o: { delivery?: 'inline' | 'cdn'; shell?: string; engine?: string | null } = {}) => assembleEnvelope(text, {
  kind: 'paged', shellVersion: o.shell ?? VERSION, delivery: o.delivery ?? 'inline', headHtml: '',
  bodyHtml: o.engine === null ? '' : (o.delivery ?? 'inline') === 'cdn' ? `<script id="orz-engine" src="${bundleUrl(o.shell ?? VERSION)}"></script>` : `<script id="orz-engine">${o.engine ?? ENGINE}</script>`,
});

describe('the kind-independent core of inspect (2.3.0)', () => {
  it('[K.27] looksHtml, shellWord, scriptElement, assembledStructure (island and </html> closed; the engine same / different / unverified / cdn / missing), storedText (a text as a file stores it: mixed line endings in the first style), heldText (a carrier\'s 0.x source, a format-1 text, else null) and twinCheck (text ↔ file, both ways: same / different / none, the twin\'s sha256) behave as orz-mdhtml\'s and orz-paged\'s copies did', () => {
    expect([looksHtml('﻿  <!DOCTYPE html>'), looksHtml('<html lang=en>'), looksHtml('# <html>'), looksHtml(`${' '.repeat(1100)}<html>`)]).toEqual([true, true, false, false]);
    expect([shellWord('a/b-c_1.md'), shellWord('my file.md'), shellWord("it's.md")]).toEqual(['a/b-c_1.md', "'my file.md'", "'it'\\''s.md'"]);
    expect(() => scriptElement('', 'a"]')).toThrow();
    const text = '{{nyml\nkind: document\ncarrier: paged\n}}\n\n# T\n';
    const opts = { shell: VERSION, delivery: 'inline', version: VERSION, bundleUrl, engineSource: ENGINE };
    const inline = fileOf(text);
    expect(scriptElement(inline, 'orz-engine')).toMatchObject({ attrs: ' id="orz-engine"' });
    expect(assembledStructure(inline, opts)).toEqual({ island: 'closed', end: 'closed', engine: 'same' });
    expect(assembledStructure(fileOf(text, { engine: 'altered' }), opts).engine).toBe('different');
    expect(assembledStructure(inline, { ...opts, engineSource: undefined }).engine).toBe('unverified');
    expect(assembledStructure(fileOf(text, { shell: '1.1.0' }), { ...opts, shell: '1.1.0' }).engine).toBe('unverified');
    expect(assembledStructure(fileOf(text, { delivery: 'cdn' }), { ...opts, delivery: 'cdn' }).engine).toBe('cdn');
    expect(assembledStructure(fileOf(text, { delivery: 'cdn' }).replace('@1.2.0/', '@9.9.9/'), { ...opts, delivery: 'cdn' }).engine).toBe('different');
    expect(assembledStructure(fileOf(text, { engine: null }), opts).engine).toBe('missing');
    const cut = inline.slice(0, inline.indexOf('# T'));
    expect(assembledStructure(cut, opts)).toEqual({ island: 'unclosed', end: 'unclosed', engine: 'missing' });
    expect(assembledStructure(inline.replace(/<\/html>\s*$/, ''), opts).end).toBe('unclosed');
    // storedText: mixed line endings take the first style; anything else exactly
    expect(storedText('a\r\nb\nc\r')).toBe('a\r\nb\r\nc\r\n');
    expect(storedText('﻿x\ny')).toBe('﻿x\ny');
    expect(storedText('nul \u0000')).toBe('nul \u0000');
    expect(extract(fileOf('a\r\nb\nc'))!.text).toBe(storedText('a\r\nb\nc'));
    // heldText
    const legacy = legacyFile('# old\n');
    const reader = (h: string) => readLegacyIsland(h, PAGED);
    expect([heldText(inline), heldText(legacy, reader), heldText(legacy), heldText('# not html'), heldText('<!doctype html><p>x')]).toEqual([text, '# old\n', null, null, null]);
    // twinCheck: a text and its file
    const same = twinCheck('text', text, { name: 'x.paged.html', content: inline, newer: 'twin' });
    expect(same).toEqual({ name: 'x.paged.html', holds: 'same', newer: 'twin', sha256: sha256(text) });
    expect(twinCheck('text', 'a\nb\r\n', { name: 'f', content: fileOf('a\nb\n') }).holds).toBe('same'); // compared as stored
    expect(twinCheck('text', `${text}more\n`, { name: 'f', content: inline })).toMatchObject({ holds: 'different', newer: 'unknown', sha256: sha256(text) });
    expect(twinCheck('text', text, { name: 'f', content: '<!doctype html><p>no' })).toEqual({ name: 'f', holds: 'none', newer: 'unknown', sha256: null });
    expect(twinCheck('text', '# old\n', { name: 'f', content: legacy }, { readLegacy: reader }).holds).toBe('same');
    // a file and its text
    expect(twinCheck('assembled', text, { name: 'x.paged.md', content: text })).toMatchObject({ holds: 'same', sha256: sha256(text) });
    expect(twinCheck('assembled', text, { name: 'x.paged.md', content: `${text}!` })).toMatchObject({ holds: 'different', sha256: sha256(`${text}!`) });
    expect(twinCheck('assembled', text, { name: 'x.paged.md', content: inline })).toMatchObject({ holds: 'none', sha256: null });
    // isomorphic and deterministic: no Node built-ins, no clock, no randomness
    for (const f of ['src/carrier/inspect.ts', 'src/carrier/legacy.ts', 'src/carrier/sha256.ts']) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/from 'node:|require\(|Date\.|Math\.random|performance\.|crypto\./);
    }
  });
});
