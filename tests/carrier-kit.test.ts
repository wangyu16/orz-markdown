/**
 * The orz carrier kit core (FC-18 text format 1, src/carrier/): claims K.1–K.22,
 * M.22 and M.23 in notes/CLAIMS.md (closed-loop round 1 and 2 reproductions at
 * the end; rounds recorded in notes/carrier-kit-loop.md). The golden corpus (tests/carrier-corpus/) is the shared
 * oracle; random text comes from a small seeded PRNG (no fast-check).
 */
import { THEMES } from '../src/themes';
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import {
  assembleEnvelope, extract, readHeader, readDocument, setHeaderValue, removeHeaderKey, lintHeader,
  kindFromFilename, twinName, twinHref, mintUid, registerTwinLinks, readIslandFromDom, editHeader, decodeText, withoutHeader, UID_PATTERN, TWIN_LINKS_RULE,
  type ShellParts, type Kind,
} from '../src/carrier';
import { md, register } from '../src/index';
import { escapeScriptText } from '../src/html';
import { parseDocMetaIsland } from '../src/doc-meta';
import { kitParser } from '../src/carrier/parser';
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
  includes?: Record<string, string>;
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

/** Header texts the lint tests use (also compared Node vs Chrome in K.9). */
const LINT_FIXTURES = [
  '{{nyml\nkind: document\ntitle: A\n}}\n{{nyml\nkind: article-title\ntitle: x\n}}\n\nbody\n',
  '{{nyml\nkind: document\n}}\n{{mermaid\ngraph TD\n  A --> B\n}}\n',
  '{{nyml\nkind: document\ntitle: A\n}}\n```css\na { b: c }}\n}}\n```\n',
  '{{nyml\nkind: meta\ntitle: A\n}}\n{{nyml\nkind: document\ntheme: x\n}}\n\nbody\n',
  '{{nyml\nkind: document\ntitle: A}}\nNote: hello\n',
  '{{nyml\nkind: document\ntitle: Set {{x}}\nauthor: X\n}}\n\nbody\n',
  '{{nyml\nkind: document\ncustom_css: |\n  a { b: c }\n  }}\ntitle: T\n}}\n',
  '{{nyml\nkind: document\ntemplate: note\ncustom_css: |\n  @media print {\n    h1 { color: red }}\n  .x { a: b }\npage_size: A5\n}}\n\n# Body\n',
  '{{nyml\nkind: document\nlicense: CC-BY-4.0\n  name: Creative Commons\ntitle: A\n}}\n',
  '{{nyml\nKind: document\ntitle: T\n}}\n',
  '---\nlayout: post\n---\n\n# Hi\n',
  '{{nyml\nkind: document\nlang: english language\nmeasure: huge\nratio: wide\n}}\n',
  '{{nyml\nkind: document\ntitle: A\n}}\n\nText\n\n{{nyml\nkind: document\ntitle: B\n}}\n',
  'a\r\nb\nc',
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
  // case mappings that change length (toLowerCase/toUpperCase) or map to ASCII
  'İ', 'İstanbul', 'ß', 'ẞ', 'ﬃ', 'ŉ', 'ǰ', 'ΐ', 'K', 'ſ', 'İ</SCRİPT>',
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

  it('[K.3] a corpus file with resolved includes (manifest `includes`, FC-18 §8.3 D4): its file carries them in #orz-includes, extract gives them back with the text, and assembling extract(F).text with extract(F).includes reproduces F', () => {
    const withIncludes = corpus.filter(({ e }) => e.includes);
    expect(withIncludes.length).toBeGreaterThan(0);
    for (const { e, text } of withIncludes) {
      for (const p of PARTS) {
        const f = assembleEnvelope(text, { ...p, includes: e.includes });
        const x = extract(f)!;
        expect([x.text === text, x.includes], `${e.path} / ${p.kind}`).toEqual([true, e.includes]);
        expect(assembleEnvelope(x.text, { ...p, includes: x.includes })).toBe(f);
        expect(assembleEnvelope(x.text, p)).not.toBe(f); // without them the file is another file: the includes must be passed on
      }
    }
  });

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
      const close = open + html.slice(open).search(/<\/script/i); // not toLowerCase(): İ changes length
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

  /**
   * Static check over every module reachable from src/carrier.ts (value and
   * type imports). `read` lets the test inject a module to prove the check bites.
   */
  const staticHits = (read: (f: string) => string | null): string[] => {
    const strip = (src: string): string => src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:\\])\/\/.*$/gm, '$1')
      .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''");
    const seen = new Set<string>();
    const queue = ['src/carrier.ts'];
    while (queue.length) {
      const f = queue.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      for (const m of (read(f) ?? '').matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
        const parts: string[] = [];
        for (const seg of `${f.slice(0, f.lastIndexOf('/'))}/${m[1]}`.split('/')) {
          if (seg === '.' || seg === '') continue;
          if (seg === '..') parts.pop(); else parts.push(seg);
        }
        const base = parts.join('/').replace(/\.js$/, '');
        const next = [`${base}.ts`, `${base}/index.ts`].find((c) => read(c) !== null);
        if (next) queue.push(next);
      }
    }
    expect(seen.size).toBeGreaterThan(30);
    const forbidden = [/\bDate\b/, /Math\.random/, /\bperformance\b/, /\bprocess\b/, /getRandomValues/, /\bcrypto\b/, /toLocale/, /\bIntl\b/, /localeCompare/, /\bnavigator\b/, /\bdocument\s*[.[]/, /typeof\s+document\b/, /\blocation\s*[.[]/, /\bglobalThis\b/, /\bwindow\s*[.[]/, /\b__filename\b/, /\b__dirname\b/, /\bimport\.meta\b/, /\brequire\s*\(/, /\bfetch\s*\(/];
    // Known-safe uses, each with its reason ('*': the whole module).
    const exempt: Record<string, RegExp[] | '*'> = {
      'src/prepare-sources.ts': '*', // remote-include pre-pass: a host calls it before rendering; never on the readDocument/assemble path
      'src/carrier/uid.ts': [/getRandomValues/, /\bcrypto\b/, /\bglobalThis\b/], // mintUid: creation tools only, never assembleEnvelope
      'src/carrier/text.ts': [/\bglobalThis\b/], // decodeText's TextDecoder: reading bytes, not on the assemble path
      'src/plugins/markdown-include.ts': [/\bprocess\b/, /\bglobalThis\b/], // file includes: only with an env the host passes (the kit passes {})
      'src/plugins/cjk.ts': [/\bwindow\s*[.[]/], // a local variable named window
    };
    const hits: string[] = [];
    for (const f of seen) {
      const ex = exempt[f];
      if (ex === '*') continue;
      strip(read(f) ?? '').split('\n').forEach((line, i) => {
        for (const bad of forbidden) if (bad.test(line) && !(ex ?? []).some((e) => e.source === bad.source)) hits.push(`${f}:${i + 1} ${bad.source}`);
      });
    }
    return hits;
  };
  const readSrc = (f: string): string | null => (existsSync(f) ? readFileSync(f, 'utf8') : null);

  it('[K.2] no module reachable from orz-markdown/carrier reads a clock, randomness, the environment, the locale or the file system (static check over the import graph; exemptions listed)', () => {
    expect(staticHits(readSrc)).toEqual([]);
    expect(readFileSync('src/carrier/envelope.ts', 'utf8')).not.toContain('mintUid');
  });

  it('[K.2] the static check bites: a new module with Date.now() imported by document.ts is reported', () => {
    const probe = (f: string): string | null => {
      if (f === 'src/carrier/zz-probe.ts') return 'export const stamp = () => Date.now();\n';
      if (f === 'src/carrier/document.ts') return `import { stamp } from './zz-probe.js';\n${readSrc(f)}`;
      return readSrc(f);
    };
    expect(staticHits(probe)).toEqual(['src/carrier/zz-probe.ts:1 \\bDate\\b']);
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
    expect(readdirSync('src/carrier').sort()).toEqual(['app', 'conformance', 'document.ts', 'editor', 'envelope.ts', 'header.ts', 'index.ts', 'inspect.ts', 'legacy.ts', 'links.ts', 'node', 'parser.ts', 'read.ts', 'sha256.ts', 'shell', 'text.ts', 'uid.ts']);
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
      'warning:closer-not-alone:',
      'error:closer-in-value:',
      'warning:duplicate-key:title',
      'warning:key-grammar:Title',
      'warning:key-grammar:theme',
      'warning:unknown-key:Title',
      'warning:unknown-key:page_szie',
      'warning:unknown-key:ratio',
      'warning:host-key:x_bad',
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

// ── closed-loop round 1 (kit core): reproductions and fixes ──────────────────

const P0: ShellParts = { kind: 'md', shellVersion: '1.0.0', delivery: 'inline', headHtml: '', bodyHtml: '' };

describe('round 1: length-changing case mappings (R1A-1)', () => {
  it('[K.1] Turkish İ (and other length-changing case mappings) in the text, title and header do not shift extract offsets', () => {
    for (const t of ['# İstanbul\n\nİzmir ve Ankara.\n', '{{nyml\nkind: document\ntitle: İstanbul notları\n}}\n\nMetin.\n', 'ß ẞ ﬃ ŉ ǰ ΐ K ſ İ\n', 'İ</SCRİPT><script>İ']) {
      for (const p of PARTS) {
        const x = extract(assembleEnvelope(t, p))!;
        expect(x.text).toBe(t);
        expect(x.shell).toBe(p.shellVersion);
      }
    }
  });

  it('[M.23] HTML scanners case-map ASCII only: parseDocMetaIsland and extract find their islands after İ, ẞ and ﬃ in the head', () => {
    const f = assembleEnvelope('{{nyml\nkind: document\nauthor: İlker Yılmaz\ntitle: ẞ ﬃ İ\n}}\n', P0);
    expect(parseDocMetaIsland(f)).toEqual({ title: 'ẞ ﬃ İ', author: 'İlker Yılmaz' });
    const raw = '<!doctype html><html><head><title>İİİİ</title><script type="application/orz-meta+json" id="orz-meta">{"title":"x"}</script></head><body></body></html>';
    expect(parseDocMetaIsland(raw)).toEqual({ title: 'x' });
    expect(extract('<p>İİİ ẞ</p><script id="orz-src">ok</script>')!.text).toBe('ok');
    // the sweep: no src module indexes a toLowerCase()/toUpperCase() copy of a document
    for (const f2 of ['src/doc-meta.ts', 'src/carrier/envelope.ts', 'src/prepare-sources.ts', 'src/source-scan.ts']) {
      const code = readFileSync(f2, 'utf8');
      expect(/(?:html|head|source|src|text)\.toLowerCase\(\)/.test(code), f2).toBe(false);
    }
  });
});

describe('round 1: header findings', () => {
  it('[K.10] a "}}" ending a line inside a | value cuts the header: lint reports closer-in-value (error) at the closing line (R1A-2)', () => {
    const t = '{{nyml\nkind: document\ntemplate: note\ncustom_css: |\n  @media print {\n    h1 { color: red }}\n  .x { a: b }\npage_size: A5\n}}\n\n# Body\n';
    expect(readHeader(t)!.fields.page_size).toBeUndefined(); // the grammar: the header ends at the first }}
    const l = lintHeader(t, 'paged').find((x) => x.code === 'closer-in-value')!;
    expect(l.level).toBe('error');
    expect(l.line).toBe(6);
    expect(t.slice(l.from!, l.to)).toBe('    h1 { color: red }}');
    // a compact `key: value}}` closing line is only a warning
    expect(lintHeader('{{nyml\nkind: document\ntitle: x}}\n').map((x) => `${x.level}:${x.code}`)).toEqual(['warning:closer-not-alone']);
  });

  it('[K.4] an entry owns its nested lines: remove takes them along (a | value before it keeps its text), a scalar set replaces the key line only (R1A-3, R2-3)', () => {
    const t = '{{nyml\nkind: document\ndescription: |\n  First para.\nlicense:\n  spdx: CC-BY-4.0\n  url: https://x\ntitle: T\n}}\n';
    const r = removeHeaderKey(t, 'license');
    expect(r).toBe('{{nyml\nkind: document\ndescription: |\n  First para.\ntitle: T\n}}\n');
    expect(readHeader(r)!.fields).toEqual({ description: 'First para.', title: 'T' });
    // a scalar set replaces the key line only (R2-3); its nested lines stay, ignored as before
    const s2 = setHeaderValue(t, 'license', 'MIT');
    expect(s2).toBe('{{nyml\nkind: document\ndescription: |\n  First para.\nlicense: MIT\n  spdx: CC-BY-4.0\n  url: https://x\ntitle: T\n}}\n');
    expect(readHeader(s2)!.fields).toEqual({ description: 'First para.', license: 'MIT', title: 'T' });
    // a | value over it replaces the whole entry (the nested lines would become its content)
    expect(editHeader(t, { license: { multiline: 'MIT' } })).toBe('{{nyml\nkind: document\ndescription: |\n  First para.\nlicense: |\n  MIT\ntitle: T\n}}\n');
  });

  it('[K.4] merging a legacy pair keeps the meta keys\' nested lines and its comment lines', () => {
    const t = '{{nyml\nkind: meta\ntitle: M\nlicense:\n  spdx: CC-BY-4.0\n  note: keep me\n# a comment line\nauthor: A\n}}\n{{nyml\nkind: document\ntheme: t\n}}\nBody\n';
    expect(setHeaderValue(t, 'theme', 'u')).toBe('{{nyml\nkind: document\ntheme: u\ntitle: M\nlicense:\n  spdx: CC-BY-4.0\n  note: keep me\n# a comment line\nauthor: A\n}}\nBody\n');
    // the back-to-back pair lints clean of errors (no false closer-in-value from the first block)
    expect(lintHeader(t).map((l) => `${l.code}@${l.line}`)).toEqual(['legacy-header@1', 'ignored-line@5']);
  });

  it('[K.4] setting a key that sits on the closing line writes the line ending before "}}", so a value ending in "}" reads back (R1A-4)', () => {
    for (const v of ['a}', '}', 'x']) {
      const out = setHeaderValue('{{nyml\nkind: document\ntitle: T}}\n\nBody\n', 'title', v);
      expect(out).toBe(`{{nyml\nkind: document\ntitle: ${v}\n}}\n\nBody\n`);
      expect(readHeader(out)!.fields.title).toBe(v);
    }
    expect(readHeader(setHeaderValue('{{nyml kind: document}}\n', 'title', 'a}'))!.fields.title).toBe('a}');
  });

  it('[K.6] the renderer reads the kind from the same raw body as scanNymlBlocks: suppressed iff the scanner says document (R1A-5)', () => {
    for (const t of ['{{nyml\ntitle: x\n  kind: document\n}}\n', '{{nyml\n  title: x\nkind: document\n}}\n', '{{nyml\n\ttitle: x\n  kind: document\n}}\n', '{{nyml kind: document\n  title: x\n}}\n']) {
      expect(scanNymlBlocks(t)[0].kind === 'document', JSON.stringify(t)).toBe(md.render(t) === '');
      expect(readHeader(t) !== null && readHeader(t)!.legacy === null, JSON.stringify(t)).toBe(md.render(t) === '');
    }
  });

  it('[K.10] lint warns unknown-theme for a md header theme that is not in THEMES (with its line), not for a bundled one, and not for slides or paged (their themes are their own)', () => {
    const t = (theme: string) => `{{nyml\nkind: document\ntheme: ${theme}\n}}\n\n# x\n`;
    const codes = (text: string, kind?: 'md' | 'slides' | 'paged') => lintHeader(text, kind).filter((l) => l.code === 'unknown-theme');
    expect(codes(t('no-such-theme'), 'md')).toEqual([expect.objectContaining({ level: 'warning', key: 'theme', line: 3 })]);
    expect(codes(t(THEMES[0].id), 'md')).toEqual([]);
    expect(codes(t(` ${THEMES[1].id} `), 'md')).toEqual([]);
    expect(codes(t('chalk'), 'slides')).toEqual([]);
    expect(codes(t('chalk'), 'paged')).toEqual([]);
    expect(codes(`{{nyml\nkind: document\ncarrier: md\ntheme: nope\n}}\n`)).toHaveLength(1); // the kind from carrier
    expect(codes(t('nope'))).toEqual([]); // no kind known
  });

  it('[K.10] lint: stray kind: document blocks, opener sharing a line, front matter, lang/measure/ratio shapes, with line positions', () => {
    const stray = '{{nyml\nkind: document\ntitle: A\n}}\n\nText\n\n{{nyml\nkind: document\ntitle: B\n}}\n';
    expect(lintHeader(stray).map((l) => `${l.code}@${l.line}`)).toEqual(['stray-document-block@8']);
    expect(lintHeader('{{nyml\nkind: report-title\ntitle: R\n}}\n\n{{nyml\nkind: document\npage_size: A4\n}}\n', 'paged').map((l) => l.code)).toEqual(['stray-document-block']);
    expect(lintHeader('```\n{{nyml\nkind: document\n}}\n```\n')).toEqual([]); // in code: not a block
    expect(lintHeader('{{nyml kind: document\ntitle: T\n}}\n').map((l) => l.code)).toEqual(['opener-not-alone']);
    expect(lintHeader('---\nlayout: post\n---\n\n# Hi\n').map((l) => `${l.code}@${l.line}`)).toEqual(['front-matter@1']);
    expect(lintHeader('﻿+++\ntitle = "x"\n+++\n').map((l) => l.code)).toEqual(['front-matter']);
    const vals = '{{nyml\nkind: document\nlang: english language\nmeasure: huge\nratio: wide\n}}\n';
    expect(lintHeader(vals).map((l) => `${l.code}@${l.line}`)).toEqual(['bad-lang@3', 'bad-measure@4', 'bad-ratio@5']);
    expect(lintHeader('{{nyml\nkind: document\nlang: zh-Hans-CN\nmeasure: wide\nratio: 4:3\n}}\n')).toEqual([]);
    expect(lintHeader('{{nyml\ntitle: x\nkind: document\n}}\n')[0].message).toMatch(/renderers hide/);
    const dup = lintHeader('{{nyml\nkind: document\ntitle: A\ntitle: B\n}}\n')[0];
    expect([dup.code, dup.line, dup.from, dup.to]).toEqual(['duplicate-key', 4, 31, 39]);
  });
});

describe('round 1: extract follows the HTML tokenizer (R1A-6)', () => {
  it('[K.15] "</script" closes only before whitespace, "/" or ">"; "<!-->", "<!--->" and "--!>" end comments as in browsers', () => {
    expect(extract('<script id="orz-src">N</scripts></script>')!.text).toBe('N</scripts>');
    expect(extract('<script id="orz-src">A</script\tx>')!.text).toBe('A');
    expect(extract('<script id="orz-src">B</SCRIPT/>')!.text).toBe('B');
    expect(extract('<!--><script id="orz-src">D</script><!-- --> <script id="orz-src">E</script>')!.text).toBe('D');
    expect(extract('<!---><script id="orz-src">D2</script>')!.text).toBe('D2');
    expect(extract('<!-- x --!><script id="orz-src">F</script>')!.text).toBe('F');
    expect(extract('<!-- <script id="orz-src">X</script> --><script id="orz-src">C</script>')!.text).toBe('C');
  });
});

describe('round 1: title chain (FC-18 §8.1)', () => {
  it('[K.16] only a top-level H1 counts; slides ignore text before the first slide marker; paged takes strictly the first title element; {{sp}} text and math source are kept', () => {
    expect(readDocument('> # Quoted\n\n- # Listed\n\n::: note\n# Inside\n:::\n\n# Real\n').title).toBe('Real');
    expect(readDocument('> # Quoted\n').title).toBe('Untitled');
    expect(readDocument('# Pre\n\n<!-- slide -->\n# Real\n', { kind: 'slides' }).title).toBe('Real');
    expect(readDocument('# Pre\n', { kind: 'slides' }).title).toBe('Untitled');
    expect(readDocument('# Pre\n', { kind: 'md' }).title).toBe('Pre');
    const paged = '{{nyml\nkind: document\n}}\n\n{{nyml\nkind: report-title\nsubtitle: s\n}}\n\n{{nyml\nkind: exam-title\ntitle: Second\n}}\n';
    expect(readDocument(paged, { kind: 'paged' }).title).toBe('Untitled');
    expect(readDocument('# Hello {{sp[red] big *bold*}} $x^2$ end\n').title).toBe('Hello big bold x^2 end');
  });

  it('[K.16] readDocument resolves registry defaults into settings (measure normal; ratio 16:9, slide_numbers and progress yes) and ShellParts.delivery defaults to inline', () => {
    expect(readDocument('# x\n').settings).toEqual({ measure: 'normal' });
    expect(readDocument('# x\n', { kind: 'slides' }).settings).toEqual({ ratio: '16:9', slide_numbers: 'yes', progress: 'yes' });
    expect(readDocument('{{nyml\nkind: document\nratio: 4:3\n}}\n', { kind: 'slides' }).settings).toEqual({ ratio: '4:3', slide_numbers: 'yes', progress: 'yes' });
    expect(readDocument('# x\n', { kind: 'paged' }).settings).toEqual({});
    expect(readDocument('# x\n').theme).toBeUndefined();
    const f = assembleEnvelope('x', { kind: 'md', shellVersion: '1', headHtml: '', bodyHtml: '' });
    expect(extract(f)!.delivery).toBe('inline');
  });
});

describe('round 1: cost (K.14)', () => {
  const header = '{{nyml\nkind: document\ntitle: Big\nauthor: A\n}}\n\n';
  const bodyOf = (n: number): string => Array.from({ length: n }, (_, i) => `## Section ${i}\n\nParagraph ${i} with **bold**, \`code\`, [link](x${i}.md) and $x^${i % 9}$.\n\n- a\n- b\n`).join('\n');
  // Interleaved best-of-n for two sizes, so a load spike hits both, not one (full-suite flake).
  const bestPair = (f: () => unknown, g: () => unknown, n = 7): [number, number] => {
    let a = Infinity, b = Infinity;
    for (let i = 0; i < n; i++) {
      let t = performance.now(); f(); a = Math.min(a, performance.now() - t);
      t = performance.now(); g(); b = Math.min(b, performance.now() - t);
    }
    return [a, b];
  };
  const best = (f: () => unknown, n = 5): number => { let b = Infinity; for (let i = 0; i < n; i++) { const t = performance.now(); f(); b = Math.min(b, performance.now() - t); } return b; };

  it('[K.14] readHeader is O(header): on a 3.5 MB text it costs under 1/100 of parsing the document, and the same for 4× the body (ratios to a baseline measured in this run)', () => {
    const small = header + bodyOf(38_000);
    const big = header + bodyOf(152_000);
    expect(small.length).toBeGreaterThan(3_500_000);
    const tenth = small.slice(0, Math.floor(small.length / 10));
    const baseline = 10 * best(() => md.parse(tenth, {}), 2); // ≈ one full parse of the 3.5 MB text
    const ts = best(() => readHeader(small));
    const tb = best(() => readHeader(big));
    expect(ts).toBeLessThan(baseline / 100);
    expect(tb).toBeLessThan(baseline / 100);
    expect(readHeader(big)!.fields.title).toBe('Big');
  }, 60_000);

  it('[K.14] readDocument with a header title never parses the body; without one it parses it once', async () => {
    const text = header + bodyOf(2000);
    const spy = vi.spyOn(kitParser(), 'parse');
    try {
      readDocument(text);
      expect(spy.mock.calls.every(([src]) => (src as string).length < 200)).toBe(true);
      spy.mockClear();
      readDocument(bodyOf(2000));
      expect(spy.mock.calls.filter(([src]) => (src as string).length > 1000).length).toBe(1);
      spy.mockClear();
      readDocument('{{nyml\nkind: document\n}}\n\n' + bodyOf(500) + '\n{{nyml\nkind: document\n}}\n', { kind: 'paged' });
      expect(spy.mock.calls.filter(([src]) => (src as string).length > 1000).length).toBe(1); // title and stray lint share it
    } finally {
      spy.mockRestore();
    }
  });

  it('[K.14] assembleEnvelope and extract are linear: 8× the input costs under 24× the time (quadratic would be 64×)', () => {
    const a = header + bodyOf(10000);
    const b = header + bodyOf(80000);
    const [ta, tb] = bestPair(() => assembleEnvelope(a, PARTS[0]), () => assembleEnvelope(b, PARTS[0]), 5);
    expect(tb).toBeLessThan(24 * ta + 5);
    const fa = assembleEnvelope(a, PARTS[0]);
    const fb = assembleEnvelope(b, PARTS[0]);
    const [xa, xb] = bestPair(() => extract(fa), () => extract(fb), 5);
    expect(xb).toBeLessThan(24 * xa + 5);
  }, 60_000);
});

describe('round 1: API additions', () => {
  it('[K.17] Header.entries and lint findings carry positions; editHeader applies several sets, removes and multi-line values in one pass', () => {
    const t = '{{nyml\r\n  kind: document\r\n  title: T\r\n  author: A\r\n  license:\r\n    spdx: X\r\n}}\r\n\r\nBody\r\n';
    const h = readHeader(t)!;
    expect(h.entries.map((e) => [e.key, e.line, t.slice(e.keyFrom, e.valueFrom), t.slice(e.valueFrom, e.to)])).toEqual([
      ['title', 3, 'title: ', 'T'],
      ['author', 4, 'author: ', 'A'],
      ['license', 5, 'license:', '\r\n    spdx: X'],
    ]);
    const out = editHeader(t, { title: 'New', author: null, custom_css: { multiline: 'a {\n  b: c;\n}\n\nd { }' }, license: { multiline: 'MIT' } });
    expect(out).toBe('{{nyml\r\n  kind: document\r\n  title: New\r\n  license: |\r\n    MIT\r\n  custom_css: |\r\n    a {\r\n      b: c;\r\n    }\r\n\r\n    d { }\r\n}}\r\n\r\nBody\r\n');
    expect(readHeader(out)!.fields).toEqual({ title: 'New', license: 'MIT', custom_css: 'a {\n  b: c;\n}\n\nd { }' });
    expect(editHeader(t, { zzz: null })).toBe(t);
    for (const bad of ['a }} b', 'x\r\ny', '  indented first', 'trailing\n', 'ws\n  \nx', '\tx', 'a\n\tb']) {
      expect(() => editHeader(t, { custom_css: { multiline: bad } }), JSON.stringify(bad)).toThrow();
    }
    expect(() => editHeader(t, { title: 'ok', kind: 'x' })).toThrow();
    expect(editHeader('# Hi\n', { title: 'T', notes: { multiline: 'a\nb' } })).toBe('{{nyml\nkind: document\ntitle: T\nnotes: |\n  a\n  b\n}}\n\n# Hi\n');
  });

  it('[K.18] decodeText keeps a BOM and decodes UTF-8 exactly (File.text() and a default TextDecoder strip the BOM)', () => {
    const text = '﻿{{nyml\r\nkind: document\r\n}}\r\n# İ 中文 👩🏽‍🔬\r\n';
    const bytes = new TextEncoder().encode(text);
    expect(decodeText(bytes)).toBe(text);
    expect(decodeText(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))).toBe(text);
    expect(new TextDecoder().decode(bytes)).toBe(text.slice(1));
  });

  it('[K.3] extract returns the resolved includes stored in #orz-includes', () => {
    expect(extract(assembleEnvelope('x', PARTS[2]))!.includes).toEqual(PARTS[2].includes);
    expect(extract(assembleEnvelope('x', PARTS[0]))!.includes).toBeUndefined();
  });
});

// ── closed-loop round 2 (kit core): reproductions and fixes ──────────────────

describe('round 2: real browser and environment', () => {
  it('[K.9] in real Chrome, the esbuild bundle of dist/carrier.js assembles the same bytes and reads the same document facts and lint as Node, for every corpus file, lint fixture, hazard and sample random text and every parts set (skips without Chrome or dist)', async (ctx) => {
    if (!existsSync('dist/carrier.js')) { ctx.skip(); return; }
    let browser: import('playwright-core').Browser;
    try {
      const { chromium } = await import('playwright-core');
      browser = await chromium.launch({ channel: 'chrome' });
    } catch {
      ctx.skip();
      return;
    }
    try {
      const { build } = await import('esbuild');
      const bundle = await build({ entryPoints: ['dist/carrier.js'], bundle: true, platform: 'browser', format: 'iife', globalName: 'orzc', write: false, logLevel: 'silent', target: ['es2020'] });
      const nodeKit = createRequire(import.meta.url)('../dist/carrier.js') as typeof import('../src/carrier');
      const inputs = [
        ...corpus.map(({ e, text }) => ({ text, kind: e.kind, name: e.path })),
        ...LINT_FIXTURES.map((text, i) => ({ text, kind: (['md', 'slides', 'paged'] as const)[i % 3], name: `lint fixture ${i}` })),
        ...HAZARDS.filter((h) => !/[\uD800-\uDFFF]/.test(h) || /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(h)).map((text, i) => ({ text, kind: 'md' as const, name: `hazard ${i}` })),
        ...RANDOM_TEXTS.slice(0, 40).map((text, i) => ({ text, kind: 'md' as const, name: `random ${i}` })),
      ];
      const node = inputs.map(({ text, kind }) => ({
        html: PARTS.map((p) => nodeKit.assembleEnvelope(text, p)),
        doc: JSON.stringify(nodeKit.readDocument(text, { kind })),
        lint: JSON.stringify(nodeKit.lintHeader(text, kind)),
      }));
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(String(err)));
      await page.setContent('<!doctype html><html><head></head><body></body></html>');
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const chrome = await page.evaluate(({ inputs, parts }: { inputs: Array<{ text: string; kind: Kind }>; parts: ShellParts[] }) => {
        const c = (globalThis as unknown as { orzc: typeof import('../src/carrier') }).orzc;
        return inputs.map(({ text, kind }) => ({
          html: parts.map((p) => c.assembleEnvelope(text, p)),
          doc: JSON.stringify(c.readDocument(text, { kind })),
          lint: JSON.stringify(c.lintHeader(text, kind)),
        }));
      }, { inputs, parts: PARTS });
      expect(errors).toEqual([]);
      chrome.forEach((r, i) => {
        if (r.html.some((h, j) => h !== node[i].html[j])) throw new Error(`assembled bytes differ for ${inputs[i].name}`);
        expect(r.doc, inputs[i].name).toBe(node[i].doc);
        expect(r.lint, inputs[i].name).toBe(node[i].lint);
      });
    } finally {
      await browser.close();
    }
  }, 180_000);

  it('[K.19] a block plugin registered with register() applies through the kit\'s private parser (an H1 inside it no longer becomes the title)', () => {
    const t = '{{zzkitbox\n# Inside\n}}\n\n# Real\n';
    expect(readDocument(t).title).toBe('Inside'); // not a block yet: its lines are Markdown
    register({ type: 'block', aliases: ['zzkitbox'], render: () => '<div></div>' });
    expect(readDocument(t).title).toBe('Real');
    expect(md.render(t)).toContain('<div></div>');
  });

  it('[K.19] the kit parses with a private instance: a host changing md (options, disabled rules, plugins) does not change assembled bytes or document facts', () => {
    const texts = [...corpus.map((c) => c.text), '# "Quotes" -- and... (c)\n', 'Intro\n\n# Title {{sp[x] here}}\n'];
    const before = texts.map((t) => [assembleEnvelope(t, PARTS[0]), JSON.stringify(readDocument(t))]);
    const saved = { ...md.options };
    md.set({ typographer: false, html: false, linkify: false });
    md.disable(['heading', 'lheading']);
    md.core.ruler.push('host_mutation', (state) => { for (const t of state.tokens) if (t.type === 'inline') t.content = 'X'; });
    try {
      const after = texts.map((t) => [assembleEnvelope(t, PARTS[0]), JSON.stringify(readDocument(t))]);
      expect(after).toEqual(before);
      expect(readDocument('# "Quotes" -- and...\n').title).toBe('“Quotes” – and…');
    } finally {
      md.set(saved);
      md.enable(['heading', 'lheading']);
      md.core.ruler.disable('host_mutation');
    }
  });
});

describe('round 2: reading files', () => {
  it('[K.12] an assembled file whose line endings were converted to CR LF (git autocrlf, a Windows editor) extracts the same text, as the DOM reads it (R2-1)', async () => {
    const { Window } = await import('happy-dom');
    const win = new Window();
    for (const t of ['# A\nb\n', '# A\r\nb\r\n', '﻿{{nyml\rkind: document\r}}\r', ...corpus.map((c) => c.text)]) {
      const html = assembleEnvelope(t, PARTS[0]);
      for (const converted of [html.replace(/\n/g, '\r\n'), html.replace(/\n/g, '\r')]) {
        expect(extract(converted)!.text).toBe(t);
        const el = new win.DOMParser().parseFromString(converted, 'text/html').getElementById('orz-src');
        expect(readIslandFromDom(el as unknown as Parameters<typeof readIslandFromDom>[0])).toBe(t);
      }
    }
    await win.happyDOM.close();
  });

  it('[K.15] extract skips bogus comments (<?…>, <!x…>, doctype) and end-tag attributes, as the tokenizer does', () => {
    expect(extract('<? <script id="orz-src">B</script> ?><script id="orz-src">X</script>')!.text).toBe('X');
    expect(extract('<!x <script id="orz-src">B</script>><script id="orz-src">X</script>')!.text).toBe('X'); // the bogus comment ends at the first >
    expect(extract('<!DOCTYPE html><script id="orz-src">X</script>')!.text).toBe('X');
    expect(extract(`</div title="<script id='orz-src'>"><script id="orz-src">X</script>`)!.text).toBe('X');
    expect(extract(`<script>1</script title="<script id='orz-src'>"><script id="orz-src">X</script>`)!.text).toBe('X');
    expect(extract('</ <script id="orz-src">B</script>><script id="orz-src">X</script>')!.text).toBe('X');
  });

  it('[K.18] decodeText({ fatal: true }) throws on invalid UTF-8; by default it becomes U+FFFD', () => {
    const bad = new Uint8Array([0x41, 0xe9, 0x42]);
    expect(decodeText(bad)).toBe('A�B');
    expect(() => decodeText(bad, { fatal: true })).toThrow();
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]), { fatal: true })).toBe('﻿A');
  });

  it('[K.20] orz-markdown/carrier/read is parser-free: its import graph has no parser module, it bundles under 30 KB minified, and the package exports it', async () => {
    // Value imports only (`import type` is erased at build time).
    const graph = importGraph('src/carrier/read.ts', (f, spec) => resolveRelative(f, spec, ['.ts']), /^\s*(?:import|export)\s+(?!type\b)[^'";]*?from\s*['"]([^'"]+)['"]/gm);
    expect([...graph].sort()).toEqual(['src/ascii.ts', 'src/carrier/read.ts', 'src/carrier/text.ts', 'src/html.ts']);
    const { build } = await import('esbuild');
    const out = await build({ stdin: { contents: "export * from './src/carrier/read';", resolveDir: '.', loader: 'ts' }, bundle: true, minify: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent', metafile: true });
    const size = out.outputFiles[0].contents.byteLength;
    expect(size).toBeLessThan(30_000);
    expect(Object.keys(out.metafile!.inputs).filter((f) => /index\.ts|markdown-it|katex/.test(f))).toEqual([]);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { exports: Record<string, string>; dependencies: Record<string, string> };
    expect(pkg.exports['./carrier/read']).toBe('./dist/carrier/read.js');
    expect(pkg.dependencies['@types/markdown-it']).toBeDefined(); // the .d.ts files expose markdown-it types
    const read = await import('../src/carrier/read');
    expect(Object.keys(read).sort()).toEqual(['INCLUDES_ISLAND_ID', 'KIND_PACKAGE', 'SHELL_ISLAND_ID', 'SOURCE_ISLAND_ID', 'decodeText', 'eolStyle', 'escapeAttr', 'escapeHtml', 'escapeScriptText', 'extract', 'hasLoneSurrogate', 'hasMixedEol', 'jsonForScript', 'readIslandFromDom', 'reservedIdIn', 'unescapeScriptText']);
  });
});

describe('round 2: header', () => {
  it('[K.10] an orphan "}}" after the header (a single-line value ending in "}}", or a lone "}}" inside a | value) is the closer-in-value error (R2-2, R2-5)', () => {
    const cases = [
      '{{nyml\nkind: document\ntitle: Set {{x}}\nauthor: X\n}}\n\nbody\n',
      '{{nyml\nkind: document\ntitle: x}}\nauthor: X\n}}\n',
      '{{nyml\nkind: document\ncustom_css: |\n  a { b: c }\n  }}\ntitle: T\n}}\n',
      '{{nyml\nkind: document\ncustom_css: |\n  @media x { a { b: c }}\ntitle: T\n}}\n\nbody\n',
    ];
    for (const t of cases) {
      const codes = lintHeader(t).map((l) => `${l.level}:${l.code}`);
      expect(codes, JSON.stringify(t)).toContain('error:closer-in-value');
      expect(codes, JSON.stringify(t)).not.toContain('warning:closer-not-alone');
    }
    // a compact closer followed by body text (no key line, no lone }}) stays a warning
    expect(lintHeader('{{nyml\nkind: document\ntitle: x}}\nSome text: here\n').map((l) => l.code)).toEqual(['closer-not-alone']);
    expect(lintHeader('{{nyml\nkind: document\ntitle: x}}\n\nauthor: X\n}}\n').map((l) => l.code)).toEqual(['closer-not-alone']);
  });

  it('[K.10] no false closer-in-value: a header followed directly by a paged element, {{mermaid}}, a fence holding "}}", a back-to-back legacy pair, or a compact closer and a body line (R3-1)', () => {
    const cases: Array<[string, string[]]> = [
      [LINT_FIXTURES[0], []],
      [LINT_FIXTURES[1], []],
      [LINT_FIXTURES[2], []],
      [LINT_FIXTURES[3], ['legacy-header']],
      [LINT_FIXTURES[4], ['closer-not-alone']],
      ['{{nyml\nkind: document\n}}\n{{toc}}\n', []],
      ['{{nyml\nkind: document\ntitle: A\n}}\n~~~\n}}\n~~~\n', []],
    ];
    for (const [t, codes] of cases) expect(lintHeader(t, 'paged').map((l) => l.code), JSON.stringify(t)).toEqual(codes);
    // the real cuts from rounds 1–2 still error
    for (const t of [LINT_FIXTURES[5], LINT_FIXTURES[6], LINT_FIXTURES[7]]) expect(lintHeader(t, 'paged').map((l) => l.code), JSON.stringify(t)).toContain('closer-in-value');
  });

  it('[K.10] lint warns ignored-line under a scalar key and kind-case for Kind: / kind: Document (R2-3, R2-10)', () => {
    const t = '{{nyml\nkind: document\nlicense: CC-BY-4.0\n  name: Creative Commons\n  url: https://x\ntitle: A\n}}\n';
    const l = lintHeader(t).find((x) => x.code === 'ignored-line')!;
    expect([l.key, l.line, t.slice(l.from!, l.to)]).toEqual(['license', 4, '  name: Creative Commons\n  url: https://x']);
    expect(lintHeader('{{nyml\nkind: document\ncustom_css: |\n  a\n    b\n}}\n')).toEqual([]);
    for (const k of ['Kind: document', 'kind: Document', 'KIND: DOCUMENT', 'kind: META']) {
      const text = `{{nyml\n${k}\ntitle: T\n}}\n`;
      expect(readHeader(text), k).toBeNull();
      expect(lintHeader(text).map((x) => `${x.code}@${x.line}`), k).toEqual(['kind-case@2']);
    }
  });

  it('[K.5] readHeader reads the fields scanNymlBlocks reads, for tab- and space-indented openers and keys (R2-4; seeded generator)', () => {
    const r = mulberry32(0x7ab5);
    const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
    let compared = 0;
    for (let i = 0; i < 1500; i++) {
      const ind = pick(['', ' ', '  ', '   ']);
      const keyInd = pick(['', ' ', '  ', '\t', ' \t', '\t ']);
      const lines = ['kind: document', ...Array.from({ length: 1 + Math.floor(r() * 4) }, () => pick(['title: A', 'author: B C', 'x: |\n  a\n\tb', 'license: CC\n\tname: X', 'deep: x\n  \tnested: y', 'k：v']))];
      const body = lines.join('\n').split('\n').map((l) => pick([keyInd, ind + keyInd, '']) + l).join('\n');
      const t = (`${pick(['', '﻿', '\n'])}${ind}{{nyml\n${body}\n${pick(['', ind, '\t'])}}}\n\n# H\n`).replace(/\n/g, pick(['\n', '\r\n']));
      const h = readHeader(t);
      const b = scanNymlBlocks(t)[0];
      if (!h || !b) continue;
      compared++;
      expect(h.fields, JSON.stringify(t)).toEqual(b.fields);
      for (const e of h.entries) expect(t.startsWith(e.key, e.keyFrom), JSON.stringify(t)).toBe(true);
    }
    expect(compared).toBeGreaterThan(300);
  });

  it('[K.21] keys named __proto__, constructor or toString are ordinary data in header fields and keys and in #orz-includes (R2-7, F9)', () => {
    const t = '{{nyml\nkind: document\n__proto__: p\nconstructor: c\ntoString: s\ntitle: T\n}}\n';
    const h = readHeader(t)!;
    expect(h.keys).toEqual(['__proto__', 'constructor', 'toString', 'title']);
    expect(Object.getPrototypeOf(h.fields)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(h.fields, '__proto__')).toBe(true);
    expect(JSON.parse(JSON.stringify(h.fields))).toEqual(JSON.parse('{"__proto__":"p","constructor":"c","toString":"s","title":"T"}'));
    expect(Object.prototype.hasOwnProperty.call(scanNymlBlocks(t)[0].fields, '__proto__')).toBe(true);
    expect(readDocument(t).title).toBe('T');
    const includes = JSON.parse('{"__proto__":"p","constructor":"c","a":"x"}') as Record<string, string>;
    const x = extract(assembleEnvelope('x', { ...PARTS[0], includes }))!;
    expect(Object.keys(x.includes!)).toEqual(['__proto__', 'a', 'constructor']);
    expect(Object.prototype.hasOwnProperty.call(x.includes, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(x.includes)).toBe(Object.prototype);
  });

  it('[K.22] withoutHeader returns the body after the header (legacy blocks and a leading BOM included) and its offset; a header-less text whole', () => {
    expect(withoutHeader('﻿{{nyml\nkind: document\ntitle: T\n}}\n\n# B\n')).toEqual({ body: '\n\n# B\n', offset: 34 });
    const pair = '{{nyml\nkind: meta\nauthor: A\n}}\n\n{{nyml\nkind: document\n}}\nBody\n';
    const w = withoutHeader(pair);
    expect(w.body).toBe('\nBody\n');
    expect(pair.slice(w.offset)).toBe(w.body);
    expect(md.render(w.body)).not.toContain('nyml-data');
    expect(withoutHeader('# Plain\n')).toEqual({ body: '# Plain\n', offset: 0 });
    expect(withoutHeader('\uFEFF# B\n')).toEqual({ body: '\uFEFF# B\n', offset: 0 });
    expect(withoutHeader(' \n\t\n')).toEqual({ body: ' \n\t\n', offset: 0 });
    expect(withoutHeader('')).toEqual({ body: '', offset: 0 });
  });
});

describe('round 2: document facts and the envelope', () => {
  it('[K.16] the derived title is the heading text as a reader sees it (typographer, entities, emoji characters, image alt, sp text) and slide markers may be indented (R2-8)', () => {
    expect(readDocument('# "Quotes" -- and... (c) &amp; \\*x\\*\n').title).toBe('“Quotes” – and… © & *x*');
    expect(readDocument('# Hello {{emoji smile}} {{emoji nosuchname}}\n').title).toBe('Hello 😄 {{emoji nosuchname}}');
    // image alt as the renderer writes it (orz's image rule keeps * in alt text)
    expect(readDocument('# ![alt *x*](i.png) A<sup>2</sup> [link](x.md)\n').title).toBe('alt *x* A2 link');
    expect(readDocument('# ![a photo](i.png) of B\n').title).toBe('a photo of B');
    expect(readDocument('  <!-- slide -->\n# S1\n', { kind: 'slides' }).title).toBe('S1');
    // a hard break inside the heading reads as one space (FC-18 §8.1)
    expect(readDocument('# One<br>Two<BR/>Three\n').title).toBe('One Two Three');
    expect(readDocument('One\\\nTwo  \nThree\n===\n').title).toBe('One Two Three');
    expect(readDocument('# Pre\n  <!-- slide bg=red -->\n# S1\n', { kind: 'slides' }).title).toBe('S1');
  });

  it('[K.3] title and author are trimmed everywhere (<title>, head tags, #orz-meta) and a value empty after trimming is omitted; only a well-formed uid is metadata (F7, F8)', () => {
    const t = '{{nyml\nkind: document\ntitle: "  Padded Title  "\nauthor: " "\ndescription: |\n  Two\n  lines \nuid: doc-BAD\n}}\n';
    const doc = readDocument(t);
    expect(doc.title).toBe('Padded Title');
    expect(doc.meta).toEqual({ title: 'Padded Title', description: 'Two\nlines' });
    const html = assembleEnvelope(t, PARTS[0]);
    expect(html).toContain('<title>Padded Title</title>');
    expect(html).toContain('"title": "Padded Title"');
    expect(html).not.toContain('name="author"');
    expect(html.slice(0, html.indexOf('</head>'))).not.toContain('doc-BAD');
    expect(readDocument('{{nyml\nkind: document\nuid: doc-abcdefghij\n}}\n').meta.uid).toBe('doc-abcdefghij');
  });

  it('[K.3] the envelope escapes lang and the generator, orders #orz-meta keys, sorts includes by code unit and drops non-string includes on extract (F11)', () => {
    const t = '{{nyml\nkind: document\nauthor: A\ntitle: T\nlang: en"><script>x\n}}\n';
    const html = assembleEnvelope(t, { ...PARTS[0], shellVersion: '1.0"><b>', includes: { 'a.md': '1', 'B.md': '2', 'Ä.md': '3', 'a.MD': '4' } });
    expect(html).toContain('<html lang="en&quot;&gt;&lt;script&gt;x" data-orz-kind="md">');
    expect(html).toContain('<meta name="generator" content="orz-md 1.0&quot;&gt;&lt;b&gt;">');
    const island = html.slice(html.indexOf('id="orz-meta">'), html.indexOf('</script>', html.indexOf('id="orz-meta">')));
    expect(island.indexOf('"title"')).toBeLessThan(island.indexOf('"author"'));
    expect(html).toContain('{"B.md":"2","a.MD":"4","a.md":"1","Ä.md":"3"}');
    const forged = html.replace(/(<script type="application\/json" id="orz-includes">)[^<]*/, '$1{"a":1,"b":"x","c":null,"d":["y"]}');
    expect(extract(forged)!.includes).toEqual({ b: 'x' });
  });
});

describe('2.4.0: slides registry and the deck-block lint (FC-18 §5.1, §7.2)', () => {
  const head = (lines: string): string => `{{nyml\nkind: document\n${lines}}}\n`;
  it('[K.28] slide_numbers, progress and section_numbers are slides header keys: no unknown-key for kind slides (nor for a header naming carrier: slides), unknown-key for md and paged; readDocument puts them in settings, with slide_numbers and progress defaulting to yes and no default for section_numbers; the kit does not judge their values (carrier lints), and ratio keeps the W:H shape check', () => {
    const t = head('slide_numbers: no\nprogress: no\nsection_numbers: roman\nratio: 4:3\n');
    const codes = (k?: Kind): string[] => lintHeader(t, k).map((l) => `${l.code}:${l.key ?? ''}`);
    expect(codes('slides')).toEqual([]);
    expect(lintHeader(head('carrier: slides\nslide_numbers: no\n'))).toEqual([]);
    expect(codes('md').sort()).toEqual(['unknown-key:progress', 'unknown-key:ratio', 'unknown-key:section_numbers', 'unknown-key:slide_numbers']);
    expect(codes('paged').filter((c) => c.startsWith('unknown-key')).length).toBe(4);
    expect(readDocument(t, { kind: 'slides' }).settings).toEqual({ slide_numbers: 'no', progress: 'no', section_numbers: 'roman', ratio: '4:3' });
    expect(readDocument(head('section_numbers: 01\n'), { kind: 'slides' }).settings).toEqual({ ratio: '16:9', slide_numbers: 'yes', progress: 'yes', section_numbers: '01' });
    expect(readDocument('# x\n', { kind: 'slides' }).settings).not.toHaveProperty('section_numbers');
    // values are the carrier's business (invalid-value), not the kit's
    expect(lintHeader(head('slide_numbers: maybe\nsection_numbers: greek\n'), 'slides')).toEqual([]);
    expect(lintHeader(head('ratio: wide\n'), 'slides').map((l) => l.code)).toEqual(['bad-ratio']);
  });

  it('[K.29] a top-level <!-- deck … --> block in a slides text is the lint error deck-block (with its line, offsets and next: upgrade), from lintHeader and readDocument for kind slides, with or without a header, LF, CR LF or CR; a deck comment inside code, a list, a quote or a container, a comment whose first word is not deck, and any other kind are not reported', () => {
    const deck = '<!-- deck\ntitle: Old\ntheme: paper\n-->';
    const body = `${deck}\n\n<!-- slide -->\n# One\n`;
    for (const eol of ['\n', '\r\n', '\r']) {
      const t = (head('title: New\n') + '\n' + body).replace(/\n/g, eol);
      const found = lintHeader(t, 'slides').filter((l) => l.code === 'deck-block');
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ level: 'error', line: 6, next: 'upgrade' });
      expect(t.slice(found[0].from!, found[0].to!)).toBe(deck.replace(/\n/g, eol));
      expect(readDocument(t, { kind: 'slides' }).lint.filter((l) => l.code === 'deck-block')).toEqual(found);
    }
    // a 0.x text (no header) and an indented one
    expect(lintHeader(body, 'slides').map((l) => [l.code, l.line, l.level])).toEqual([['deck-block', 1, 'error']]);
    const indented = `<!-- slide -->\n\n  <!--deck: x -->\n`;
    const d = lintHeader(indented, 'slides');
    expect(d.map((l) => l.code)).toEqual(['deck-block']);
    expect(indented.slice(d[0].from!, d[0].to!)).toBe('<!--deck: x -->');
    expect(readDocument(head('carrier: slides\n') + body, { filename: 'x.slides.md' }).lint.map((l) => l.code)).toContain('deck-block');
    // not a deck block
    const quiet = [
      '```\n<!-- deck x -->\n```\n',
      '- item\n\n  <!-- deck x -->\n',
      '> <!-- deck x -->\n',
      '::: info\n<!-- deck x -->\n:::\n',
      '<!-- decks are fine -->\n',
      '<!-- slide deck -->\n',
      'text <!-- deck x --> inline\n',
    ];
    for (const q of quiet) expect(lintHeader(q, 'slides').map((l) => l.code), q).toEqual([]);
    expect(lintHeader(body, 'md')).toEqual([]);
    expect(lintHeader(body, 'paged')).toEqual([]);
    expect(lintHeader(body)).toEqual([]); // no kind, no carrier: not a slides text
  });
});
