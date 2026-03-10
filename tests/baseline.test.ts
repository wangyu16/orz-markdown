import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

describe('Phase 0 — Baseline markdown-it', () => {
  it('renders h1', () => {
    const html = md.render('# Hello');
    // anchor plugin adds id attribute; verify tag and content
    expect(html).toContain('<h1');
    expect(html).toContain('>Hello</h1>');
  });

  it('renders bold', () => {
    expect(md.render('**bold**')).toBe('<p><strong>bold</strong></p>\n');
  });

  it('renders blockquote', () => {
    expect(md.render('> quote')).toBe('<blockquote>\n<p>quote</p>\n</blockquote>\n');
  });

  it('allows raw HTML tags when html option enabled', () => {
    // With `html: true` in the config the tag should not be escaped.  Note
    // that markdown-it does not append an extra newline when the output is a
    // top-level HTML block, hence we just check the exact string.
    const result = md.render('<div>Example div block.</div>');
    expect(result).toBe('<div>Example div block.</div>');
  });
});
