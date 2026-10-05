/**
 * The orz carrier kit core (FC-18 text format 1, src/carrier/): claims K.1–K.11
 * in notes/CLAIMS.md. The golden corpus (tests/carrier-corpus/) is the shared
 * oracle; random text comes from a small seeded PRNG (no fast-check).
 */
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import {
  assembleEnvelope, extract, readHeader, readDocument, setHeaderValue, removeHeaderKey, lintHeader,
  kindFromFilename, twinName, twinHref, mintUid, registerTwinLinks, readIslandFromDom, UID_PATTERN, TWIN_LINKS_RULE,
  type ShellParts, type Kind,
} from '../src/carrier';
import { md } from '../src/index';
import { escapeScriptText } from '../src/html';
import { scanNymlBlocks } from '../src/nyml-blocks';

const ROOT = 'tests/carrier-corpus';

interface Entry {
  path: string;
  kind: Kind;
  hasHeader: boolean;
  legacyHeader: boolean;
  header: { title: string | null; author: string | null; license: string | null; theme: string | null; uid: string | null };
  keys: string[];
  derivedTitle: string;
}
const manifest = JSON.parse(readFileSync(`${ROOT}/manifest.json`, 'utf8')) as { files: Entry[] };
const entries = manifest.files;
/** Read as bytes and decode without dropping a BOM. */
const readText = (path: string): string => readFileSync(`${ROOT}/${path}`).toString('utf8');
const corpus = entries.map((e) => ({ e, text: readText(e.path) }));

const PARTS: ShellParts[] = [
  { kind: 'md', shellVersion: '3.0.0', delivery: 'inline', headHtml: '<style>body{margin:0}</style>', bodyHtml: '<div id="orz-app"></div>' },
  { kind: 'slides', shellVersion: '4.1.2-beta.1', delivery: 'cdn', headHtml: '', bodyHtml: '' },
  {
    kind: 'paged',
    shellVersion: '2.0.0',
    delivery: 'inline',
    // Island-looking text that is not an element (comments, script and style text, other attributes).
    headHtml:
      '<!-- <script type="text/markdown" id="orz-src">FAKE-COMMENT</script> -->\n' +
      '<script>var s = "<script id=\\"orz-src\\">FAKE-JS";</script>\n' +
      '<style>/* <div id="orz-shell"> */</style>',
    bodyHtml: '<!-- <script id="orz-src">FAKE-BODY</script> --><pre>&lt;script id="orz-src"&gt;FAKE-BODY</pre><div data-id="orz-src" class="orz-shell">orz-src</div>',
    includes: { 'b/z.md': '# Z </script> <!--', 'a.md': 'A', '10': 'ten', '9': 'nine' },
  },
];

// ── seeded random text ────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hazards; line breaks are written as LF and converted to one style per text (FC-18 §2 law 1). */
const HAZARDS = [
  '\n', '\n\n', '\uFEFF', '</script', '</script>', '</SCRIPT >', '</ScRiPt/>', '<script', '<SCRIPT ',
  '<!--', '-->', '<!--<script>', ']]>', '<\\/script', '<\\\\script', '<\\script', '\\', '<', '>', '&amp;', '"', "'",
  '{{nyml\nkind: document\ntitle: T\n}}\n', '}}', '{{', '`', '```', '\u2028', '\u2029', '\u00a0', '\t', '\uFFFD',
  '<script type="text/markdown" id="orz-src">', '</body>', '</html>',
];

function randomText(rand: () => number): string {
  const n = Math.floor(rand() * 120);
  const eol = ['\n', '\r\n', '\r'][Math.floor(rand() * 3)];
  const bom = rand() < 0.15 ? '\uFEFF' : '';
  let s = '';
  for (let i = 0; i < n; i++) {
    const r = rand();
    if (r < 0.3) s += HAZARDS[Math.floor(rand() * HAZARDS.length)];
    else if (r < 0.55) s += String.fromCharCode(0x20 + Math.floor(rand() * 95));
    else if (r < 0.75) {
      // any BMP scalar value (no lone surrogates: a file is UTF-8)
      let cp = Math.floor(rand() * 0xfffe);
      if (cp >= 0xd800 && cp <= 0xdfff) cp -= 0x800;
      s += String.fromCodePoint(cp);
    } else if (r < 0.9) s += String.fromCodePoint(0x10000 + Math.floor(rand() * 0xfffff));
    else if (r < 0.92) s += 'x'.repeat(2000 + Math.floor(rand() * 8000)); // very long line
    else s += ['é', 'é', '中文', 'עברית', '\u200f', '👩🏽‍🔬', '🇨🇦'][Math.floor(rand() * 7)];
  }
  return bom + s.replace(/\n/g, eol);
}

const rand = mulberry32(0x0c18);
const RANDOM_TEXTS = ['', '\uFEFF', '\uFEFF\uFEFF', '\r', '\n', '\r\n', '\r\r', '\uFEFF\r\n', '</script>', '\n\uFEFF', ...Array.from({ length: 400 }, () => randomText(rand))];

// ── helpers ──────────────────────────────────────────────────────────────

/** Split keeping each line's own line break. */
function linesOf(s: string): string[] {
  return s.split(/(?<=\r\n|\r(?!\n)|\n)/);
}

function eolOf(line: string): string {
  return /\r\n$|\r$|\n$/.exec(line)?.[0] ?? '';
}

// ── K.1 / K.2 / K.3 ─────────────────────────────────────────────────────

describe('envelope laws (FC-18 §2)', () => {
  it('[K.1] round trip: extract(assembleEnvelope(T, p)).text === T for every corpus file and every parts set', () => {
    for (const { e, text } of corpus) {
      for (const p of PARTS) {
        const got = extract(assembleEnvelope(text, p));
        expect(got?.text === text, `${e.path} / ${p.kind}`).toBe(true);
      }
    }
  }, 60_000);

  it('[K.1] round trip holds for seeded random text (Unicode, astral, consistent LF/CRLF/CR, BOM, </script, <!--, <script, ]]>, empty, long lines)', () => {
    for (const [i, t] of RANDOM_TEXTS.entries()) {
      for (const p of PARTS) {
        const html = assembleEnvelope(t, p);
        const got = extract(html);
        if (got?.text !== t) throw new Error(`case ${i} (${p.kind}) failed: ${JSON.stringify(t.slice(0, 200))}`);
      }
    }
  }, 60_000);

  it('[K.1] the stored island never contains a literal </script, so its end is unambiguous', () => {
    for (const t of [...RANDOM_TEXTS, ...corpus.map((c) => c.text)]) {
      const html = assembleEnvelope(t, PARTS[0]);
      const start = html.indexOf('<script type="text/markdown" id="orz-src"');
      const open = html.indexOf('>', start) + 1;
      const close = html.toLowerCase().indexOf('</script', open);
      expect(close).toBe(open + escapeScriptText(t.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')).length);
      expect(html.slice(open, close)).not.toMatch(/\r/);
      // no <script either (it could open the double-escaped state after <!--)
      expect(/<script/i.test(html.slice(open, close))).toBe(false);
    }
  }, 60_000);

  it('[K.1] extract finds the island whatever the attribute order, quoting and case, and returns null without one', () => {
    const t = 'a </script> b\r\n<!--<script>\uFEFF';
    const esc = assembleEnvelope(t, PARTS[0]);
    const content = esc.slice(esc.indexOf('data-orz-eol="crlf">') + 20, esc.indexOf('</script>\n<div id="orz-app">'));
    for (const tag of [
      '<script type="text/markdown" id="orz-src" data-orz-eol="crlf">',
      "<SCRIPT DATA-ORZ-EOL='crlf' ID='orz-src' TYPE='text/markdown'>",
      '<script data-orz-format=1 id=orz-src data-orz-eol=crlf type=text/markdown>',
      '<script\n  id="orz-src"\n  data-x="a>b" data-orz-eol = "crlf">',
    ]) {
      const got = extract(`<!doctype html><html data-orz-kind="slides"><body>${tag}${content}</SCRIPT></body></html>`);
      expect(got?.text, tag).toBe(t);
      expect(got?.kind).toBe('slides');
      expect(got?.format).toBe(1);
      expect(got?.shell).toBe('');
    }
    expect(extract('<html><body><p>no island</p><script id="orz-srcx"></script><div id="orz-src"></div></body></html>')).toBeNull();
    expect(extract('')).toBeNull();
  });

  it('[K.2] determinism: identical input gives identical bytes on repeated calls and from a fresh module instance', async () => {
    const first = corpus.map(({ text }) => PARTS.map((p) => assembleEnvelope(text, p)));
    const again = corpus.map(({ text }) => PARTS.map((p) => assembleEnvelope(text, p)));
    expect(again).toEqual(first);
    vi.resetModules();
    const fresh = (await import('../src/carrier')) as typeof import('../src/carrier');
    const third = corpus.map(({ text }) => PARTS.map((p) => fresh.assembleEnvelope(text, p)));
    expect(third).toEqual(first);
    for (const t of RANDOM_TEXTS.slice(0, 60)) expect(fresh.assembleEnvelope(t, PARTS[2])).toBe(assembleEnvelope(t, PARTS[2]));
  }, 60_000);

  it('[K.2] the envelope, header, document and link code uses no clock, randomness or environment (static check)', () => {
    const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const f of ['src/carrier/envelope.ts', 'src/carrier/header.ts', 'src/carrier/document.ts', 'src/carrier/links.ts', 'src/carrier/text.ts', 'src/carrier/index.ts', 'src/carrier.ts', 'src/html.ts', 'src/doc-meta.ts', 'src/nyml-body.ts', 'src/nyml-blocks.ts']) {
      const code = strip(readFileSync(f, 'utf8'));
      for (const bad of [/\bDate\b/, /Math\.random/, /\bperformance\./, /\bprocess\./, /getRandomValues/, /\bcrypto\b/, /toLocale/, /Intl\./]) {
        expect(bad.test(code), `${f}: ${bad}`).toBe(false);
      }
    }
    // Randomness lives only in uid.ts (mintUid), which the envelope never calls.
    expect(readFileSync('src/carrier/uid.ts', 'utf8')).toContain('getRandomValues');
    expect(readFileSync('src/carrier/envelope.ts', 'utf8')).not.toContain('mintUid');
  });

  it('[K.3] idempotence: assembleEnvelope(extract(F).text, p) === F, and extract returns the kind, format, shell and delivery written', () => {
    for (const p of PARTS) {
      for (const t of [...corpus.map((c) => c.text), ...RANDOM_TEXTS.slice(0, 120)]) {
        const f = assembleEnvelope(t, p);
        const x = extract(f)!;
        expect(assembleEnvelope(x.text, p) === f).toBe(true);
        expect([x.kind, x.format, x.shell, x.delivery]).toEqual([p.kind, 1, p.shellVersion, p.delivery]);
      }
    }
  }, 60_000);
});

describe('envelope structure (FC-18 §8.1)', () => {
  it('[K.3] writes the FC-18 §8.1 skeleton: lang, kind, generator, derived title, head metadata, #orz-shell, banner, island, sorted #orz-includes', () => {
    const text = readText('md/every-construct.md');
    const html = assembleEnvelope(text, PARTS[2]);
    expect(html.startsWith('<!doctype html>\n<html lang="en" data-orz-kind="paged">\n<head>\n<meta charset="utf-8">\n<meta name="generator" content="orz-paged 2.0.0">\n<title>Acids, Bases, and Buffers — Week 3 Notes</title>\n')).toBe(true);
    expect(html).toContain('<meta name="author" content="Yu Wang">');
    expect(html).toContain('<script type="application/orz-meta+json" id="orz-meta">');
    expect(html).toContain('"uid": "doc-7k2m9x4q1z"');
    expect(html).toContain('<script type="application/json" id="orz-shell">{"kind":"paged","format":1,"shell":"2.0.0","delivery":"inline"}</script>');
    expect(html).toContain('Skill: https://cdn.jsdelivr.net/npm/orz-paged/orz-paged-skills/SKILL.md');
    expect(html).toContain('<script type="application/json" id="orz-includes">{"10":"ten","9":"nine","a.md":"A","b/z.md":"# Z \\u003c/script> \\u003c!--"}</script>');
    const order = ['id="orz-meta"', 'id="orz-shell"', 'FAKE-COMMENT', '</head>', '<!-- orz paged document', 'id="orz-src" data-orz-format="1" data-orz-eol="lf">{{nyml', 'id="orz-includes"', 'FAKE-BODY', '</body>'];
    const at = order.map((s) => html.indexOf(s));
    expect(at.every((v, i) => v >= 0 && (i === 0 || v > at[i - 1])), JSON.stringify(at)).toBe(true);
    // The <title> is escaped and comes from the header; the unicode file sets lang.
    const sc = assembleEnvelope(readText('md/script-close.md'), PARTS[0]);
    expect(sc).toContain('<title>Embedding Snippets &lt;/script&gt; Safely</title>');
    expect(assembleEnvelope(readText('md/unicode.md'), PARTS[0])).toContain('<html lang="zh-Hans"');
    // CR LF and the BOM are recorded on the island, not stored in its body
    expect(assembleEnvelope(readText('md/crlf.md'), PARTS[0])).toContain('data-orz-format="1" data-orz-eol="crlf">{{nyml\nkind: document\n');
    expect(assembleEnvelope(readText('md/bom.md'), PARTS[0])).toContain('data-orz-format="1" data-orz-eol="lf" data-orz-bom>{{nyml\n');
  });
});

// ── K.4 header edits ─────────────────────────────────────────────────────

describe('header edits change only the edited line (FC-18 §9)', () => {
  for (const { e, text } of corpus) {
    it(`[K.4] ${e.path}: set, insert and remove touch exactly one line (line endings and BOM kept)`, () => {
      const h = readHeader(text);
      if (!h) {
        const out = setHeaderValue(text, 'title', 'Added Title');
        const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
        const eol = /\r\n|\r|\n/.exec(text)?.[0] ?? '\n';
        expect(out).toBe(`${bom}{{nyml${eol}kind: document${eol}title: Added Title${eol}}}${eol}${eol}${text.slice(bom.length)}`);
        expect(readHeader(out)?.fields).toEqual({ title: 'Added Title' });
        expect(readHeader(out)?.legacy).toBeNull();
        expect(readDocument(out).title).toBe('Added Title');
        expect(removeHeaderKey(text, 'title')).toBe(text);
        return;
      }
      // A lone legacy kind: meta header is upgraded on the first edit: its kind
      // line becomes kind: document (one line), then the edit applies.
      let base = text;
      if (h.legacy === 'meta') {
        base = text.replace(/^(\uFEFF?\s*\{\{nyml\r?\n)kind: meta(\r?\n)/, '$1kind: document$2');
        const diff = linesOf(base).filter((l, i) => l !== linesOf(text)[i]);
        expect(diff).toEqual(['kind: document\n']);
        expect(readHeader(base)!.legacy).toBeNull();
        expect(readHeader(base)!.fields).toEqual(h.fields);
      }
      const lines = linesOf(base);
      // (a) set an existing single-line key: one line differs, the rest is byte-identical.
      const key = h.keys.includes('title') ? 'title' : h.keys.find((k) => k !== 'format' && !h.fields[k].includes('\n'))!;
      const value = 'Edited — ✓ 中文 </script>';
      const set = setHeaderValue(text, key, value);
      const setLines = linesOf(set);
      expect(setLines.length).toBe(lines.length);
      const diff = setLines.map((l, i) => (l === lines[i] ? -1 : i)).filter((i) => i >= 0);
      expect(diff.length).toBe(1);
      const changed = setLines[diff[0]];
      expect(eolOf(changed)).toBe(eolOf(lines[diff[0]]));
      expect(changed.replace(/\r?\n$|\r$/, '')).toBe(`${key}: ${value}`);
      expect(readHeader(set)!.fields).toEqual({ ...h.fields, [key]: value });
      expect(readHeader(set)!.keys).toEqual(h.keys);
      if (h.keys.includes('format')) expect(setHeaderValue(text, 'format', '1')).toBe(text); // same value: same bytes
      expect(readHeader(set)!.legacy).toBeNull();
      // (b) insert a new key just before the closing line, with the header's line ending.
      const ins = setHeaderValue(text, 'x_test_inserted', 'yes');
      const insLines = linesOf(ins);
      expect(insLines.length).toBe(lines.length + 1);
      const at = insLines.findIndex((l, i) => l !== lines[i]);
      expect(insLines[at]).toBe(`x_test_inserted: yes${h.lineEnding}`);
      expect(insLines[at + 1].trimEnd()).toMatch(/^\}\}/);
      expect([...insLines.slice(0, at), ...insLines.slice(at + 1)].join('')).toBe(base);
      expect(readHeader(ins)!.keys).toEqual([...h.keys, 'x_test_inserted']);
      expect(removeHeaderKey(ins, 'x_test_inserted')).toBe(base);
      expect(removeHeaderKey(text, 'x_absent')).toBe(text);
      // (c) remove the last key: one contiguous run of lines goes, nothing else changes.
      const last = h.keys[h.keys.length - 1];
      const rem = removeHeaderKey(text, last);
      const remLines = linesOf(rem);
      const from = remLines.findIndex((l, i) => l !== lines[i]);
      const gone = lines.length - remLines.length;
      expect(gone).toBeGreaterThanOrEqual(1);
      expect([...lines.slice(0, from), ...lines.slice(from + gone)].join('')).toBe(rem);
      expect(lines[from].startsWith(last) || lines[from].trimStart().startsWith(last)).toBe(true);
      expect(readHeader(rem)!.keys).toEqual(h.keys.slice(0, -1));
      if (text.startsWith('\uFEFF')) for (const s of [set, ins, rem]) expect(s.charCodeAt(0)).toBe(0xfeff);
    });
  }

  it('[K.4] header-less texts (LF, CRLF, BOM, empty, plain) gain a valid header that readHeader reads back', () => {
    for (const t of ['', '# Hi\n', '# Hi\r\nbody\r\n', '\uFEFF# Hi\n', '\uFEFF', 'plain', '    indented code\n', '{{nyml\nkind: element\nx: 1\n}}\n']) {
      const out = setHeaderValue(t, 'uid', 'doc-abcdefghij');
      const h = readHeader(out)!;
      expect(h.legacy).toBeNull();
      expect(h.fields).toEqual({ uid: 'doc-abcdefghij' });
      expect(out.endsWith(t.replace(/^\uFEFF/, ''))).toBe(true);
      expect(out.startsWith('\uFEFF')).toBe(t.startsWith('\uFEFF'));
      expect(lintHeader(out)).toEqual([]);
    }
  });

  it('[K.4] values are written so they read back exactly; multi-line, "}}", line breaks, bad keys and kind are refused', () => {
    const base = readText('md/minimal.md');
    for (const v of ['', ' padded ', '"quoted"', "'single'", '|', 'a: b', '：', '#hash', '} {', '\u00a0nbsp\u3000', 'a\u2028b', '\u2029', 'x\u2028']) {
      expect(readHeader(setHeaderValue(base, 'description', v))!.fields['description'], JSON.stringify(v)).toBe(v);
    }
    expect(() => setHeaderValue(base, 'title', 'a\nb')).toThrow();
    expect(() => setHeaderValue(base, 'title', 'a\rb')).toThrow();
    expect(() => setHeaderValue(base, 'title', 'a\u0000b')).toThrow();
    expect(() => setHeaderValue(base, 'title', 'css {a}}')).toThrow();
    expect(() => setHeaderValue(base, 'Title', 'x')).toThrow();
    expect(() => setHeaderValue(base, 'bad-key', 'x')).toThrow();
    expect(() => setHeaderValue(base, 'kind', 'meta')).toThrow();
    expect(() => removeHeaderKey(base, 'kind')).toThrow();
  });

  it('[K.4] a `|` value is replaced or removed with its continuation lines; duplicates: the last is edited, all are removed', () => {
    const crlf = readText('md/crlf.md');
    const one = setHeaderValue(crlf, 'custom_css', 'p { color: red; }');
    expect(readHeader(one)!.fields['custom_css']).toBe('p { color: red; }');
    expect(one).toContain('custom_css: p { color: red; }\r\n}}\r\n');
    expect(one.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    const dup = '{{nyml\nkind: document\ntitle: A\nauthor: X\ntitle: B\n}}\n# T\n';
    expect(setHeaderValue(dup, 'title', 'C')).toBe('{{nyml\nkind: document\ntitle: A\nauthor: X\ntitle: C\n}}\n# T\n');
    expect(removeHeaderKey(dup, 'title')).toBe('{{nyml\nkind: document\nauthor: X\n}}\n# T\n');
    // indentation and the full-width colon are kept on the edited line
    const ind = '{{nyml\n  kind: document\n  title：Old\n}}\n';
    expect(setHeaderValue(ind, 'title', 'New')).toBe('{{nyml\n  kind: document\n  title： New\n}}\n');
    expect(setHeaderValue(ind, 'lang', 'fr')).toBe('{{nyml\n  kind: document\n  title：Old\n  lang: fr\n}}\n');
  });

  it('[K.4] a legacy meta+document pair is read as one header and merged into one kind: document block on edit', () => {
    for (const [a, b] of [['meta', 'document'], ['document', 'meta']]) {
      const metaBody = 'title: Meta Title\nauthor: Meta Author\nkeywords: a, b\n';
      const docBody = 'format: 1\ntitle: Doc Title\nx_host_key: kept\n';
      const block = (k: string): string => `{{nyml\nkind: ${k}\n${k === 'meta' ? metaBody : docBody}}}`;
      const text = `\uFEFF${block(a)}\n\n${block(b)}\n\n# Body\n`;
      const h = readHeader(text)!;
      expect(h.legacy).toBe('meta+document');
      expect(h.blocks.map((x) => x.kind)).toEqual([a, b]);
      expect(h.fields).toEqual({ format: '1', title: 'Doc Title', x_host_key: 'kept', author: 'Meta Author', keywords: 'a, b' });
      expect(h.keys).toEqual(['format', 'title', 'x_host_key', 'author', 'keywords']);
      const out = setHeaderValue(text, 'theme', 'paper');
      expect(out).toBe('\uFEFF{{nyml\nkind: document\nformat: 1\ntitle: Doc Title\nx_host_key: kept\nauthor: Meta Author\nkeywords: a, b\ntheme: paper\n}}\n\n# Body\n');
      expect(readHeader(out)!.legacy).toBeNull();
      expect(removeHeaderKey(text, 'author')).toBe('\uFEFF{{nyml\nkind: document\nformat: 1\ntitle: Doc Title\nx_host_key: kept\nkeywords: a, b\n}}\n\n# Body\n');
      expect(removeHeaderKey(text, 'absent')).toBe(text);
    }
    // not adjacent (text between): only the first block is the header
    const apart = '{{nyml\nkind: meta\ntitle: M\n}}\n\nText.\n\n{{nyml\nkind: document\ntitle: D\n}}\n';
    expect(readHeader(apart)!.legacy).toBe('meta');
    expect(readHeader(apart)!.fields).toEqual({ title: 'M' });
  });
});

// ── K.5 readHeader / readDocument vs the manifest ───────────────────────────

describe('readHeader and readDocument agree with the corpus manifest', () => {
  for (const { e, text } of corpus) {
    it(`[K.5] ${e.path}`, () => {
      const h = readHeader(text);
      const doc = readDocument(text, { filename: e.path });
      expect(Boolean(h && h.legacy === null)).toBe(e.hasHeader);
      expect(Boolean(h && h.legacy === 'meta')).toBe(e.legacyHeader);
      expect(h?.keys ?? []).toEqual(e.keys);
      const f = h?.fields ?? {};
      expect({ title: f.title ?? null, author: f.author ?? null, license: f.license ?? null, theme: f.theme ?? null, uid: f.uid ?? null }).toEqual(e.header);
      if (h) {
        // the header reader and the scanner give the same fields
        expect(h.fields).toEqual(scanNymlBlocks(text)[0].fields);
        expect(h.start).toBe(text.startsWith('\uFEFF') ? 1 : 0);
        expect(h.lineEnding).toBe(e.path === 'md/crlf.md' ? '\r\n' : '\n');
      }
      expect(doc.kind).toBe(e.kind);
      expect(readDocument(text, { kind: e.kind }).kind).toBe(e.kind);
      expect(doc.title).toBe(e.derivedTitle);
      expect(doc.meta.title ?? null).toBe(e.header.title);
      expect(doc.meta.uid ?? null).toBe(e.header.uid);
      expect(doc.theme ?? null).toBe(e.header.theme);
      expect(doc.format).toBe(1);
      expect(doc.lint.filter((l) => l.level === 'error')).toEqual([]);
    });
  }

  it('[K.5] markers-in-code yields its true header only (header examples in code are not headers)', () => {
    const text = readText('slides/markers-in-code.slides.md');
    const h = readHeader(text)!;
    expect(h.blocks).toEqual([{ start: 0, end: h.end, kind: 'document' }]);
    expect(text.split('kind: document').length - 1).toBeGreaterThan(1);
    expect(h.fields.title).toBe('Writing orz-slides Decks — Markers in Code');
  });

  it('[K.5] readDocument splits settings and host keys, defaults lang to en, and derives the kind by opts.kind > file name > carrier > md', () => {
    const hk = readDocument(readText('md/host-keys.md'));
    expect(hk.hostKeys).toEqual({ x_alembic_chapter: '4', x_alembic_course: 'chem320-fall-2026', x_alembic_visibility: 'public', x_alembic_progress_weight: '0.15', x_coursewerk_unit: 'imf' });
    expect(hk.lang).toBe('en');
    expect(hk.lint.map((l) => l.code)).toEqual(['unknown-key', 'unknown-key']);
    const el = readDocument(readText('paged/elements.paged.md'), { filename: 'x/elements.paged.md' });
    expect(Object.keys(el.settings)).toEqual(readHeader(readText('paged/elements.paged.md'))!.keys.filter((k) => !['format', 'title', 'author', 'license', 'uid', 'lang', 'theme'].includes(k)));
    expect(readDocument(readText('md/every-construct.md')).settings).toEqual({ measure: 'wide' });
    const carried = '{{nyml\nkind: document\ncarrier: slides\n}}\n';
    expect(readDocument(carried).kind).toBe('slides');
    expect(readDocument(carried, { filename: 'a.paged.md' }).kind).toBe('paged');
    expect(readDocument(carried, { filename: 'a.txt' }).kind).toBe('slides');
    expect(readDocument(carried, { kind: 'md', filename: 'a.paged.md' }).kind).toBe('md');
    expect(readDocument('plain').kind).toBe('md');
    expect(readDocument('plain').title).toBe('Untitled');
    expect(readDocument('Intro\n\n# *Rich* `code` title\n').title).toBe('Rich code title');
    expect(readDocument('{{nyml\nkind: exam-title\ntitle: Quiz\n}}\n', { kind: 'paged' }).title).toBe('Quiz');
    expect(readDocument('{{nyml\nkind: exam-title\ntitle: Quiz\n}}\n', { kind: 'md' }).title).toBe('Untitled');
    expect(readDocument('{{nyml\nkind: document\nformat: 2\n}}\n').format).toBe(2);
  });
});

// ── K.6 the header renders nothing ──────────────────────────────────────────

describe('the document header renders nothing', () => {
  it('[K.6] md.render emits no island for a kind: document block (wherever its kind line is) and does not consume an nyml-data number', () => {
    const minimal = md.render(readText('md/minimal.md'));
    expect(minimal).not.toContain('nyml-data');
    expect(minimal).not.toContain('kind');
    const withElements = md.render('{{nyml\nkind: document\ntitle: T\n}}\n\n{{nyml\nkind: element\nx: 1\n}}\n\n{{nyml\nkind: other\n}}\n');
    expect(withElements).toContain('id="nyml-data"');
    expect(withElements).toContain('id="nyml-data-2"');
    expect(withElements).not.toContain('nyml-data-3');
    expect(withElements).not.toContain('"document"');
    expect(md.render('{{nyml kind: document}}\n')).toBe('');
    // any block whose kind (read like readHeader reads it) is document, wherever the kind line is
    expect(md.render('{{nyml\ntitle: T\nkind: document\n}}\n')).toBe('');
    expect(md.render('{{nyml\nkind: element\nnested:\n  kind: document\n}}\n')).toContain('id="nyml-data"');
    expect(md.render('{{nyml\nkind: meta\ntitle: T\n}}\n')).toContain('id="nyml-data"');
  });

  it('[K.6] no corpus file renders its header; paged element blocks still render', () => {
    for (const { e, text } of corpus) {
      const html = md.render(text);
      expect(html.includes('"kind": "document"'), e.path).toBe(false);
      const elements = scanNymlBlocks(text).filter((b) => b.kind !== 'document').length;
      expect((html.match(/id="nyml-data(-\d+)?"/g) ?? []).length, e.path).toBe(elements);
    }
  }, 30_000);
});

// ── K.7 twin links ─────────────────────────────────────────────────────────

describe('twin links (FC-18 §8.3)', () => {
  it('[K.7] twinHref rewrites relative text-twin links (with ?query/#fragment) and leaves everything else alone', () => {
    const cases: Array<[string, string]> = [
      ['notes.md', 'notes.md.html'],
      ['notes.md#part', 'notes.md.html#part'],
      ['notes.md?v=2#part', 'notes.md.html?v=2#part'],
      ['week2.slides.md', 'week2.slides.html'],
      ['week2.slides.md#/3', 'week2.slides.html#/3'],
      ['./a/b/report.paged.md', './a/b/report.paged.html'],
      ['../up.md', '../up.md.html'],
      ['/root/x.md', '/root/x.md.html'],
      ['caf%C3%A9.md', 'caf%C3%A9.md.html'],
      ['https://example.org/notes.md', 'https://example.org/notes.md'],
      ['http://x.md', 'http://x.md'],
      ['mailto:someone@notes.md', 'mailto:someone@notes.md'],
      ['//cdn.example.org/x.md', '//cdn.example.org/x.md'],
      ['data:text/plain,a.md', 'data:text/plain,a.md'],
      ['#notes.md', '#notes.md'],
      ['?file=a.md', '?file=a.md'],
      ['notes.md.html', 'notes.md.html'],
      ['notes.markdown', 'notes.markdown'],
      ['notes.mdx', 'notes.mdx'],
      ['README.MD', 'README.MD'],
      ['dir.md/', 'dir.md/'],
      ['.md', '.md'],
      ['', ''],
    ];
    for (const [href, want] of cases) expect(twinHref(href), href).toBe(want);
  });

  it('[K.7] the render rule acts only when env.orzTwinLinks === true, on links (not images), also inside nested inline renders', () => {
    const src = '[a](a.md) [b](b.slides.md#s) [c](https://x.org/c.md) ![i](i.md)\n\n> - [d][ref]\n\n[ref]: d.paged.md\n\n::: spoil [e](e.md)\nbody\n:::\n';
    const off = md.render(src);
    expect(off).toContain('href="a.md"');
    expect(md.render(src, { orzTwinLinks: 'yes' })).toBe(off);
    const on = md.render(src, { orzTwinLinks: true });
    expect(on).toContain('href="a.md.html"');
    expect(on).toContain('href="b.slides.html#s"');
    expect(on).toContain('href="https://x.org/c.md"');
    expect(on).toContain('src="i.md"');
    expect(on).toContain('href="d.paged.html"');
    expect(on).toContain('href="e.md.html"');
    registerTwinLinks(md);
    registerTwinLinks(md);
    expect(md.core.ruler.getRules('').filter((r) => r.name === TWIN_LINKS_RULE).length).toBeLessThanOrEqual(1);
    const names = (md.core.ruler as unknown as { __rules__: Array<{ name: string }> }).__rules__.map((r) => r.name);
    expect(names.filter((n) => n === TWIN_LINKS_RULE).length).toBe(1);
  });
});

// ── K.8 / K.9 module boundaries ───────────────────────────────────────────────

function importGraph(entry: string, resolve: (from: string, spec: string) => string | null, pattern: RegExp): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const code = readFileSync(f, 'utf8');
    for (const m of code.matchAll(pattern)) {
      const next = resolve(f, m[1]);
      if (next) queue.push(next);
    }
  }
  return seen;
}

function resolveRelative(from: string, spec: string, exts: string[]): string | null {
  if (!spec.startsWith('.')) return null;
  const dir = from.slice(0, from.lastIndexOf('/'));
  const parts = `${dir}/${spec}`.split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '.' || p === '') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  const base = out.join('/').replace(/\.js$/, '');
  for (const ext of exts) if (existsSync(base + ext)) return base + ext;
  for (const ext of exts) if (existsSync(`${base}/index${ext}`)) return `${base}/index${ext}`;
  return null;
}

describe('module boundaries', () => {
  it('[K.8] the parser entry (src/index.ts, and dist/index.js when built) never imports src/carrier', () => {
    const src = importGraph('src/index.ts', (f, s) => resolveRelative(f, s, ['.ts']), /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g);
    expect(src.size).toBeGreaterThan(10);
    expect([...src].filter((f) => f.startsWith('src/carrier'))).toEqual([]);
    if (existsSync('dist/carrier/index.js')) {
      const dist = importGraph('dist/index.js', (f, s) => resolveRelative(f, s, ['.js']), /require\(\s*['"]([^'"]+)['"]\s*\)/g);
      expect(dist.size).toBeGreaterThan(10);
      expect([...dist].filter((f) => f.startsWith('dist/carrier'))).toEqual([]);
    }
    expect(readdirSync('src/carrier').sort()).toEqual(['document.ts', 'envelope.ts', 'header.ts', 'index.ts', 'links.ts', 'text.ts', 'uid.ts']);
  });

  it('[K.9] the carrier entry bundles for the browser without Node shims and assembles the same bytes there', async () => {
    const { build } = await import('esbuild');
    const result = await build({
      entryPoints: ['src/carrier.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'orzc',
      write: false, logLevel: 'silent', target: ['es2020'],
    });
    const ctx: Record<string, unknown> = { console, crypto: webcrypto };
    ctx.globalThis = ctx;
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(result.outputFiles[0].text, ctx);
    const c = ctx.orzc as typeof import('../src/carrier');
    for (const { text } of corpus.filter(({ e }) => e.path.startsWith('md/'))) {
      const html = c.assembleEnvelope(text, PARTS[0]);
      expect(html).toBe(assembleEnvelope(text, PARTS[0]));
      expect(c.extract(html)!.text).toBe(text);
    }
    expect(c.mintUid()).toMatch(UID_PATTERN);
  }, 60_000);
});

// ── K.10 lint ───────────────────────────────────────────────────────────

describe('lintHeader', () => {
  it('[K.10] reports duplicates, key grammar, unknown keys for the kind, host-key shape, }} spill, bad uid, format and carrier', () => {
    const text = [
      '{{nyml', 'kind: document', 'format: 2', 'title: A', 'title: B', 'Title: C', 'theme：x', 'page_szie: A4',
      'ratio: 16:9', 'x_bad: 1', 'x_alembic_ok: 1', 'uid: doc-SHORT', 'carrier: deck', 'description: css {a} }} tail',
    ].join('\n') + '\n';
    const codes = lintHeader(text, 'paged').map((l) => `${l.level}:${l.code}:${l.key ?? ''}`);
    expect(codes).toEqual([
      'warning:duplicate-key:title',
      'warning:key-grammar:Title',
      'warning:key-grammar:theme',
      'warning:unknown-key:Title',
      'warning:unknown-key:page_szie',
      'warning:unknown-key:ratio',
      'warning:host-key:x_bad',
      'error:closer-in-value:',
      'error:bad-uid:uid',
      'error:newer-format:format',
      'error:bad-carrier:carrier',
    ]);
    // without a kind, every kind's keys are known (ratio is a slides key)
    expect(lintHeader(text).some((l) => l.key === 'ratio')).toBe(false);
    expect(lintHeader('{{nyml\nkind: document\nformat: one\ncarrier: md\n}}\n', 'slides').map((l) => l.code)).toEqual(['bad-format', 'carrier-mismatch']);
    expect(lintHeader('{{nyml\ntitle: x\nkind: document\n}}\n').map((l) => l.code)).toEqual(['kind-not-first']);
    expect(lintHeader(readText('md/legacy-meta-block.md')).map((l) => l.code)).toEqual(['legacy-header']);
    expect(lintHeader('# no header')).toEqual([]);
  });

  it('[K.10] every paged registry key (incl. front_matter_clean) is known for paged, and the corpus has no lint errors', () => {
    expect(lintHeader(readText('paged/elements.paged.md'), 'paged')).toEqual([]);
    expect(lintHeader('{{nyml\nkind: document\nfront_matter_clean: true\nfont_margin_box_preset: a\n}}\n', 'paged')).toEqual([]);
    expect(lintHeader('{{nyml\nkind: document\ntemplate: note\n}}\n', 'md').map((l) => l.key)).toEqual(['template']);
    for (const { e, text } of corpus) expect(lintHeader(text, e.kind).filter((l) => l.level === 'error'), e.path).toEqual([]);
  });
});

// ── K.11 names and ids ──────────────────────────────────────────────────

describe('file names and ids', () => {
  it('[K.11] kindFromFilename and twinName follow FC-18 §3, and twinName is its own inverse', () => {
    const kinds: Array<[string, Kind | null]> = [
      ['a.md', 'md'], ['a.md.html', 'md'], ['a.slides.md', 'slides'], ['a.slides.html', 'slides'],
      ['dir/a.paged.md', 'paged'], ['C:\\x\\a.paged.html', 'paged'], ['a.txt', null], ['a.html', null], ['.md', null], ['a.MD', null],
    ];
    for (const [n, k] of kinds) expect(kindFromFilename(n), n).toBe(k);
    const twins: Array<[string, string | null]> = [
      ['x.md', 'x.md.html'], ['x.md.html', 'x.md'], ['x.slides.md', 'x.slides.html'], ['x.slides.html', 'x.slides.md'],
      ['d/x.paged.md', 'd/x.paged.html'], ['d/x.paged.html', 'd/x.paged.md'], ['x.html', null], ['x.txt', null],
      ['x.slides.md.html', null], ['.md', null],
    ];
    for (const [n, t] of twins) {
      expect(twinName(n), n).toBe(t);
      if (t) expect(twinName(t)).toBe(n);
    }
  });

  it('[K.11] mintUid gives doc- plus 16 base36 characters, valid for UID_PATTERN, without repeats', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const u = mintUid();
      expect(u).toMatch(/^doc-[0-9a-z]{16}$/);
      expect(u).toMatch(UID_PATTERN);
      seen.add(u);
    }
    expect(seen.size).toBe(2000);
  });
});

// ── K.12 DOM read ───────────────────────────────────────────────────────

/**
 * happy-dom 20's tokenizer loses a script element whose content ends in `<`
 * followed by non-space (`<`, `a<`, `<a</script>`); the HTML standard (and
 * Chrome, checked below) reads those as text. Such texts are checked in Chrome only.
 */
const HAPPY_DOM_SCRIPT_BUG = /<(?![!/])\S*$/;

describe('reading the island from a parsed page', () => {
  const texts = [...corpus.map((c) => c.text), ...RANDOM_TEXTS.slice(0, 150), '<', 'a<', '<a', '<<', '\uFEFF<\\', 'x\r\n<'];

  it('[K.12] for every corpus file and generated text, a DOM read (happy-dom) of the assembled file equals extract()', async () => {
    const { Window } = await import('happy-dom');
    const win = new Window();
    const parser = new win.DOMParser();
    let checked = 0;
    for (const t of texts) {
      if (HAPPY_DOM_SCRIPT_BUG.test(t.replace(/\r\n?/g, '\n'))) continue;
      for (const p of [PARTS[0], PARTS[2]]) {
        const html = assembleEnvelope(t, p);
        const el = parser.parseFromString(html, 'text/html').getElementById('orz-src');
        if (!el) throw new Error(`no island for ${JSON.stringify(t.slice(0, 120))}`);
        const fromDom = readIslandFromDom(el as unknown as Parameters<typeof readIslandFromDom>[0]);
        if (fromDom !== extract(html)!.text || fromDom !== t) throw new Error(`DOM read differs for ${JSON.stringify(t.slice(0, 120))}`);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(250);
    await win.happyDOM.close();
  }, 60_000);

  it('[K.12] in real Chrome (DOMParser), the DOM read equals extract() for the same texts, the happy-dom bug cases included (skips without Chrome)', async (ctx) => {
    let browser: import('playwright-core').Browser;
    try {
      const { chromium } = await import('playwright-core');
      browser = await chromium.launch({ channel: 'chrome' });
    } catch {
      ctx.skip();
      return;
    }
    try {
      const page = await browser.newPage();
      const files = texts.flatMap((t) => [PARTS[0], PARTS[2]].map((p) => assembleEnvelope(t, p)));
      const read = await page.evaluate((htmls: string[]) => htmls.map((h) => {
        const el = new DOMParser().parseFromString(h, 'text/html').getElementById('orz-src');
        return el ? { textContent: el.textContent, eol: el.getAttribute('data-orz-eol'), bom: el.hasAttribute('data-orz-bom') } : null;
      }), files);
      read.forEach((r, i) => {
        if (!r) throw new Error(`no island in file ${i}`);
        const fromDom = readIslandFromDom({ textContent: r.textContent, getAttribute: (n) => (n === 'data-orz-eol' ? r.eol : null), hasAttribute: (n) => n === 'data-orz-bom' && r.bom });
        if (fromDom !== extract(files[i])!.text || fromDom !== texts[Math.floor(i / 2)]) throw new Error(`Chrome DOM read differs for file ${i}`);
      });
    } finally {
      await browser.close();
    }
  }, 120_000);
});

// ── K.13 refusals and normalization ──────────────────────────────────────────

describe('what format 1 cannot carry', () => {
  it('[K.13] assembleEnvelope refuses NUL, lone surrogates, a header format above 1, and shell parts holding an orz-src or orz-shell element', () => {
    expect(() => assembleEnvelope('a\u0000b', PARTS[0])).toThrow(/NUL/);
    for (const t of ['\uD800', 'a\uDC00', '\uD83D\uD83D\uDE00x\uDE00']) expect(() => assembleEnvelope(t, PARTS[0]), JSON.stringify(t)).toThrow(/surrogate/);
    expect(assembleEnvelope('\uD83D\uDE00', PARTS[0])).toContain('\uD83D\uDE00');
    expect(() => assembleEnvelope('{{nyml\nkind: document\nformat: 2\n}}\n', PARTS[0])).toThrow(/format 2/);
    expect(() => assembleEnvelope('{{nyml\nkind: document\nformat: 1\n}}\n', PARTS[0])).not.toThrow();
    for (const bad of ['<div id="orz-src"></div>', '<textarea><script id="orz-src">X</script></textarea>', "<SCRIPT ID='ORZ-SRC'></SCRIPT>", '<span id=orz-shell>', '<p\n class=x\n Id = " orz-shell ">']) {
      expect(() => assembleEnvelope('x', { ...PARTS[0], bodyHtml: bad }), bad).toThrow(/reserves/);
      expect(() => assembleEnvelope('x', { ...PARTS[0], headHtml: bad }), bad).toThrow(/reserves/);
    }
    expect(() => assembleEnvelope('x', PARTS[2])).not.toThrow(); // mentions that are not elements are fine
    expect(lintHeader('a\u0000b').map((l) => l.code)).toEqual(['nul']);
    expect(lintHeader('a\uD800').map((l) => l.code)).toEqual(['lone-surrogate']);
  });

  it('[K.13] a text with mixed line endings is stored in its first style (not exact) and lint warns mixed-eol', () => {
    for (const [t, want] of [
      ['a\r\nb\nc\rd', 'a\r\nb\r\nc\r\nd'],
      ['a\nb\r\nc', 'a\nb\nc'],
      ['\uFEFFa\rb\r\n', '\uFEFFa\rb\r'],
    ]) {
      expect(extract(assembleEnvelope(t, PARTS[0]))!.text).toBe(want);
      expect(lintHeader(t).map((l) => l.code)).toEqual(['mixed-eol']);
      expect(readDocument(t).lint.map((l) => l.code)).toEqual(['mixed-eol']);
      expect(lintHeader(want)).toEqual([]);
    }
  });
});

// ── M.22 U+2028/U+2029 in nyml ───────────────────────────────────────────────

describe('nyml line separators', () => {
  it('[M.22] the nyml reader treats U+2028/U+2029 as ordinary characters: only LF, CR LF and CR break lines', () => {
    const src = '{{nyml\nkind: element\ntitle: a\u2028b\nnote: x\u2029y\n}}\n';
    expect(scanNymlBlocks(src)[0].fields).toEqual({ title: 'a\u2028b', note: 'x\u2029y' });
    const html = md.render(src);
    expect(html).toContain('"title": "a\\u2028b"');
    expect(readHeader('{{nyml\nkind: document\ntitle: a\u2028b\n}}\n')!.fields.title).toBe('a\u2028b');
  });
});
