/**
 * The carrier golden corpus (tests/carrier-corpus/, FC-18 draft §11, FC-19
 * draft §6) is self-consistent: every file the manifest lists exists, its kind
 * matches its file name, and its header is what the manifest says — read with
 * the same token-based scanner (`scanNymlBlocks`) every carrier will use.
 *
 * This pins the corpus itself. The FC-18 laws (round trip, determinism,
 * idempotence) and the carrier kit's readers run over these files in
 * tests/carrier-kit.test.ts (claims K.1–K.13).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { scanNymlBlocks } from '../src/nyml-blocks';
import { md } from '../src/index';

const ROOT = 'tests/carrier-corpus';

type Kind = 'md' | 'slides' | 'paged';
interface Facts {
  title: string | null;
  author: string | null;
  license: string | null;
  theme: string | null;
  uid: string | null;
}
interface Entry {
  path: string;
  kind: Kind;
  hasHeader: boolean;
  legacyHeader: boolean;
  header: Facts;
  keys: string[];
  derivedTitle: string;
  slideCount?: number;
  elementKinds?: string[];
  byteSensitive: boolean;
  purpose: string;
  checks: string[];
  defect: string | null;
}

const manifest = JSON.parse(readFileSync(`${ROOT}/manifest.json`, 'utf8')) as { format: number; files: Entry[] };
const entries = manifest.files;

const BOM = '\uFEFF';
/** Header-looking opener: `{{nyml` alone, then `kind: document|meta` alone (string search, NOT the scanner). */
const HEADER_LOOKING = /^\uFEFF?[ \t]*\{\{nyml[ \t]*\r?\n[ \t]*kind:[ \t]*(document|meta)[ \t]*\r?$/gm;
const SLIDE_MARKER = /^<!--\s*slide\b/;

function kindFromName(path: string): Kind {
  if (path.endsWith('.slides.md')) return 'slides';
  if (path.endsWith('.paged.md')) return 'paged';
  return 'md';
}

/** Read as bytes and decode without dropping a BOM (Buffer#toString keeps U+FEFF). */
function readText(path: string): string {
  return readFileSync(`${ROOT}/${path}`).toString('utf8');
}

/**
 * FC-18 §8.1: header `title`, else the first level-1 heading, else — for paged
 * — the `title` (or `text`) of the first title element (kind ending in
 * `-title`), else `Untitled`.
 */
function derivedTitle(text: string, headerTitle: string | undefined, kind: Kind, headerEnd: number): string {
  if (headerTitle) return headerTitle;
  const tokens = md.parse(text, {});
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'heading_open' && tokens[i].tag === 'h1') {
      return tokens[i + 1].content.replace(/\{\{attrs\[[^\]]*\]\}\}/g, '').trim();
    }
  }
  if (kind === 'paged') {
    for (const b of scanNymlBlocks(text)) {
      if (b.start < headerEnd || !b.kind.endsWith('-title')) continue;
      const t = (b.fields.title ?? '').trim() || (b.fields.text ?? '').trim();
      if (t) return t;
    }
  }
  return 'Untitled';
}

/** Slide markers the way format 1 finds them: html_block tokens, so never inside code or a directive. */
function slideCount(text: string): number {
  return md.parse(text, {}).filter((t) => t.type === 'html_block' && SLIDE_MARKER.test(t.content)).length;
}

describe('carrier corpus manifest', () => {
  it('lists every corpus document exactly once, and nothing else', () => {
    const onDisk = (readdirSync(ROOT, { recursive: true }) as string[])
      .map((f) => f.split('\\').join('/'))
      .filter((f) => f.endsWith('.md') && f !== 'README.md' && !f.startsWith('expected/'))
      .sort();
    const listed = entries.map((e) => e.path).sort();
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed).toEqual(onDisk);
  });

  it('marks exactly crlf.md, bom.md and script-close.md as byte-sensitive', () => {
    expect(entries.filter((e) => e.byteSensitive).map((e) => e.path).sort()).toEqual(
      ['md/bom.md', 'md/crlf.md', 'md/script-close.md'],
    );
  });

  it('names a defect only for the D-46 and D-48 reproductions', () => {
    const defects = Object.fromEntries(entries.filter((e) => e.defect).map((e) => [e.path, e.defect]));
    expect(defects).toEqual({
      'slides/title-v2-long-title.slides.md': 'D-46',
      'paged/columns-across-pages.paged.md': 'D-48',
    });
  });

  it('gives every entry a purpose and at least one check', () => {
    for (const e of entries) {
      expect(e.purpose.length, e.path).toBeGreaterThan(20);
      expect(e.checks.length, e.path).toBeGreaterThan(0);
    }
  });
});

describe.each(entries.map((e) => [e.path, e] as const))('%s', (path, e) => {
  const exists = existsSync(`${ROOT}/${path}`);
  const text = exists ? readText(path) : '';
  const blocks = scanNymlBlocks(text);
  const first = blocks[0];

  it('exists', () => {
    expect(exists).toBe(true);
  });

  it('has the kind its file name gives', () => {
    expect(e.kind).toBe(kindFromName(path));
  });

  it('carries a BOM only if it is bom.md', () => {
    expect(text.startsWith(BOM)).toBe(path === 'md/bom.md');
  });

  if (e.hasHeader || e.legacyHeader) {
    it(`leads with its ${e.hasHeader ? 'kind: document' : 'legacy kind: meta'} header`, () => {
      expect(first).toBeDefined();
      expect(first.kind).toBe(e.hasHeader ? 'document' : 'meta');
      // Only whitespace (and, for bom.md, the BOM) precedes the header.
      const before = text.slice(0, first.start);
      const rest = path === 'md/bom.md' ? before.replace(/^\uFEFF/, '') : before;
      expect(rest).toMatch(/^[ \t\r\n]*$/);
    });

    it('header has the FC-18 §5 shape: opener alone, kind on line 2, closer alone, keys snake_case', () => {
      const block = text.slice(first.start, first.end);
      expect(block).toMatch(new RegExp(`^\\{\\{nyml\\r?\\nkind: ${first.kind}\\r?\\n`));
      expect(block).toMatch(/\r?\n\}\}$/);
      for (const k of Object.keys(first.fields)) expect(k, k).toMatch(/^[a-z][a-z0-9_]*$/);
    });

    it('header yields the manifest facts and exactly the manifest keys, in order', () => {
      const f = first.fields;
      const facts: Facts = {
        title: f.title ?? null,
        author: f.author ?? null,
        license: f.license ?? null,
        theme: f.theme ?? null,
        uid: f.uid ?? null,
      };
      expect(facts).toEqual(e.header);
      expect(Object.keys(f)).toEqual(e.keys);
      if (e.hasHeader) expect(f.format).toBe('1');
    });
  } else {
    it('has no header and no header facts', () => {
      expect(blocks.filter((b) => b.kind === 'document' || b.kind === 'meta')).toEqual([]);
      expect(e.keys).toEqual([]);
      expect(Object.values(e.header).every((v) => v === null)).toBe(true);
    });
  }

  it('has at most one header block (kind document or meta) in the whole text', () => {
    expect(blocks.filter((b) => b.kind === 'document' || b.kind === 'meta').length).toBe(
      e.hasHeader || e.legacyHeader ? 1 : 0,
    );
  });

  it('derives the manifest title (header title, else first h1, else the paged title element, else Untitled)', () => {
    const isHeader = Boolean(first && (e.hasHeader || e.legacyHeader));
    expect(derivedTitle(text, isHeader ? first.fields.title : undefined, e.kind, isHeader ? first.end : 0)).toBe(e.derivedTitle);
  });

  if (path === 'slides/markers-in-code.slides.md') {
    it('hides header-looking blocks and slide markers inside code and directives', () => {
      const looking = [...text.matchAll(HEADER_LOOKING)].length;
      expect(looking).toBeGreaterThan(1); // a string search would find more than the one real header
      const raw = text.match(/<!--\s*slide\b/g)?.length ?? 0;
      expect(raw).toBeGreaterThan(e.slideCount ?? 0);
    });
  } else {
    it('has no header-looking block hidden inside code or a directive', () => {
      const looking = [...text.matchAll(HEADER_LOOKING)].length;
      expect(looking).toBe(blocks.filter((b) => b.kind === 'document' || b.kind === 'meta').length);
    });
  }

  if (e.kind === 'slides') {
    it('has the manifest number of slides (markers outside code and directives)', () => {
      expect(slideCount(text)).toBe(e.slideCount);
    });
  }

  if (e.kind === 'paged') {
    it('has the manifest element blocks after the header, in order', () => {
      expect(blocks.slice(1).map((b) => b.kind)).toEqual(e.elementKinds);
    });
  }

  if (path === 'md/crlf.md') {
    it('uses CR LF for every line ending', () => {
      expect(text).toContain('\r\n');
      expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    });
  } else if (exists) {
    it('uses LF line endings', () => {
      expect(text).not.toContain('\r');
    });
  }

  if (path === 'md/bom.md') {
    it('starts with the UTF-8 BOM bytes EF BB BF', () => {
      const bytes = readFileSync(`${ROOT}/${path}`);
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    });
  }

  if (path === 'md/script-close.md') {
    it('contains every island-breaking sequence and no trailing newline', () => {
      for (const s of ['</script>', '<script', '<!--', '<!--<script>', ']]>', '</SCRIPT', '<ScRiPt']) expect(text, s).toContain(s);
      expect(first.fields.title).toContain('</script>');
      expect(text.endsWith('\n')).toBe(false);
    });
  }

  if (path === 'md/large.md') {
    it('is about 2,000 lines and has one very long line', () => {
      const lines = text.split('\n');
      expect(lines.length).toBeGreaterThan(1900);
      expect(lines.length).toBeLessThan(2200);
      expect(Math.max(...lines.map((l) => l.length))).toBeGreaterThan(20000);
    });
  }
});
