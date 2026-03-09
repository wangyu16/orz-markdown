import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

describe('Phase 3 — Block Dispatcher (no registered plugins)', () => {
  it('unrecognized plugin name falls through as literal text', () => {
    const html = md.render('{{unknown-plugin}}');
    // The block dispatcher returns false; paragraph rule renders it as text
    expect(html).toContain('{{unknown-plugin}}');
  });

  it('unrecognized plugin with body falls through as literal text', () => {
    const html = md.render('{{unknown body content}}');
    // Falls through; rendered as paragraph
    expect(html).toContain('{{unknown');
  });

  it('{{...}} inside fenced code block is not parsed', () => {
    const html = md.render('```\n{{unknown}}\n```');
    // fence rule has higher priority; content is code text
    expect(html).toContain('{{unknown}}');
    expect(html).toContain('<code>');
    expect(html).not.toContain('<div');
  });

  it('{{...}} in 4-space indented code block is not parsed', () => {
    const html = md.render('    {{unknown}}');
    // Indented code block; should appear as literal inside <code>
    expect(html).toContain('{{unknown}}');
    expect(html).toContain('<code>');
  });

  it('\\{{...}} escape renders as literal {{...}} text', () => {
    const html = md.render('\\{{unknown}}');
    // Escape rule strips backslash; remainder is literal text
    expect(html).toContain('{{unknown}}');
    expect(html).not.toContain('<div');
  });
});
