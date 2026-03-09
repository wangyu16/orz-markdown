import { describe, it, expect } from 'vitest';
import path from 'path';
import { md } from '../src/index';

const FIXTURES = path.resolve(process.cwd(), 'tests/fixtures');

describe('Phase 15 — Markdown Include plugin', () => {
  it('includes a local file by path', () => {
    const html = md.render('{{markdown tests/fixtures/simple.md}}');
    expect(html).toContain('<h1');
    expect(html).toContain('Included');
    expect(html).toContain('simple included file');
  });

  it('alias md-include works', () => {
    const html = md.render('{{md-include tests/fixtures/simple.md}}');
    expect(html).toContain('Included');
  });

  it('alias md works', () => {
    const html = md.render('{{md tests/fixtures/simple.md}}');
    expect(html).toContain('Included');
  });

  it('markdownBasePath resolves path relative to given directory', () => {
    const html = md.render('{{md simple.md}}', { markdownBasePath: FIXTURES });
    expect(html).toContain('Included');
  });

  it('renders KaTeX in included file', () => {
    const html = md.render('{{markdown tests/fixtures/with-math.md}}');
    expect(html).toContain('katex');
  });

  it('silently ignores second-level includes', () => {
    // tries-to-include.md contains {{markdown other.md}} which should not be executed
    const html = md.render('{{markdown tests/fixtures/tries-to-include.md}}');
    expect(html).toContain('tries to include');
    // The nested include should NOT have tried to render other.md recursively
    // (it's silently suppressed — the literal text may or may not appear depending
    // on whether the inner {{markdown other.md}} is in a paragraph)
    expect(html).not.toContain('<h1'); // other.md doesn't exist, no rendered heading
  });

  it('returns empty string for nonexistent file', () => {
    const html = md.render('{{markdown nonexistent-file-xyz.md}}');
    // Should not throw, returns empty
    expect(html.trim()).toBe('');
  });
});
