import { describe, it, expect } from 'vitest';
import path from 'path';
import { md } from '../src/index';

const FIXTURES = path.resolve(process.cwd(), 'tests/fixtures');
// File includes are a capability the host grants by passing a base path.
const CWD = { markdownBasePath: process.cwd() };

describe('Phase 15 — Markdown Include plugin', () => {
  it('includes a local file by path', () => {
    const html = md.render('{{markdown tests/fixtures/simple.md}}', { ...CWD });
    expect(html).toContain('<h1');
    expect(html).toContain('Included');
    expect(html).toContain('simple included file');
  });

  it('alias md-include works', () => {
    const html = md.render('{{md-include tests/fixtures/simple.md}}', { ...CWD });
    expect(html).toContain('Included');
  });

  it('alias md works', () => {
    const html = md.render('{{md tests/fixtures/simple.md}}', { ...CWD });
    expect(html).toContain('Included');
  });

  it('markdownBasePath resolves path relative to given directory', () => {
    const html = md.render('{{md simple.md}}', { markdownBasePath: FIXTURES });
    expect(html).toContain('Included');
  });

  it('renders KaTeX in included file', () => {
    const html = md.render('{{markdown tests/fixtures/with-math.md}}', { ...CWD });
    expect(html).toContain('katex');
  });

  it('silently ignores second-level includes', () => {
    // tries-to-include.md contains {{markdown other.md}} which should not be executed
    const html = md.render('{{markdown tests/fixtures/tries-to-include.md}}', { ...CWD });
    expect(html).toContain('tries to include');
    // The nested include should NOT have tried to render other.md recursively
    // (it's silently suppressed — the literal text may or may not appear depending
    // on whether the inner {{markdown other.md}} is in a paragraph)
    expect(html).not.toContain('<h1'); // other.md doesn't exist, no rendered heading
  });

  it('returns empty string for nonexistent file', () => {
    const html = md.render('{{markdown nonexistent-file-xyz.md}}', { ...CWD });
    // Should not throw, returns empty
    expect(html.trim()).toBe('');
  });

  describe('security: file access is opt-in and confinable', () => {
    it('reads nothing without markdownBasePath or readFile (server-side render of untrusted text)', () => {
      expect(md.render('{{md tests/fixtures/simple.md}}').trim()).toBe('');
      expect(md.render('{{md /etc/hosts}}').trim()).toBe('');
      expect(md.render('{{md ../package.json}}').trim()).toBe('');
    });

    it('refuses paths outside markdownIncludeRoot', () => {
      const env = { markdownBasePath: FIXTURES, markdownIncludeRoot: FIXTURES };
      expect(md.render('{{md simple.md}}', { ...env })).toContain('Included');
      expect(md.render('{{md ../../package.json}}', { ...env }).trim()).toBe('');
      expect(md.render('{{md /etc/hosts}}', { ...env }).trim()).toBe('');
    });

    it('allows parent-directory includes when no root is set (trusted local authoring)', () => {
      const html = md.render('{{md ../fixtures/simple.md}}', { markdownBasePath: path.join(FIXTURES, '..', 'fixtures') });
      expect(html).toContain('Included');
    });

    it('uses a host-supplied readFile instead of the file system', () => {
      const seen: string[] = [];
      const env = {
        markdownBasePath: '/virtual/docs',
        markdownIncludeRoot: '/virtual',
        readFile: (p: string) => { seen.push(p); return p.endsWith('part.md') ? '## From host' : null; },
      };
      expect(md.render('{{md part.md}}', env)).toContain('From host');
      expect(seen[0].replace(/\\/g, '/')).toMatch(/\/virtual\/docs\/part\.md$/);
      expect(md.render('{{md missing.md}}', { ...env }).trim()).toBe('');
    });

    it('never treats a URL as a file path', () => {
      const env = { markdownBasePath: FIXTURES, readFile: () => '## should not be read' };
      expect(md.render('{{md https://example.com/x.md}}', env).trim()).toBe('');
    });
  });
});
