import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

describe('Phase 4 — Inline Dispatcher (no registered plugins)', () => {
  it('unrecognized inline {{...}} renders as literal text in paragraph', () => {
    const html = md.render('Text {{unknown}} here');
    expect(html).toContain('<p>');
    expect(html).toContain('{{unknown}}');
  });

  it('{{...}} inside inline code span is not parsed', () => {
    const html = md.render('Text `{{unknown}}` here');
    expect(html).toContain('<code>{{unknown}}</code>');
    expect(html).not.toContain('<span');
  });

  it('\\{{...}} renders as literal {{...}} text', () => {
    // markdown-it escape rule handles \{ → {
    // So \{{ → { then the remaining {unknown}} is not {{, stays literal
    const html = md.render('\\{{unknown}} text');
    expect(html).toContain('{{unknown}}');
    expect(html).not.toContain('<span');
  });

  it('unrecognized inline {{...body...}} renders literally', () => {
    const html = md.render('Text {{unknown body content}} end');
    expect(html).toContain('{{unknown body content}}');
    expect(html).toContain('<p>');
  });
});
