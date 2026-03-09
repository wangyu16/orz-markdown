import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

describe('Phase 7 — Span plugin', () => {
  it('renders span with class', () => {
    const html = md.render('{{span[red] Hello}}');
    expect(html).toContain('<span class="red">Hello</span>');
  });

  it('renders with alias {{sp}}', () => {
    const html = md.render('{{sp[blue] Hello}}');
    expect(html).toContain('<span class="blue">Hello</span>');
  });

  it('renders inline markdown inside span body — bold', () => {
    const html = md.render('{{span[red] **bold** text}}');
    expect(html).toContain('<span class="red">');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('text</span>');
  });

  it('renders inline markdown inside span body — italic and code', () => {
    const html = md.render('{{span[red] *italic* and `code`}}');
    expect(html).toContain('<span class="red">');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code>code</code>');
  });

  it('supports hyphenated class names', () => {
    const html = md.render('{{span[my-class] text}}');
    expect(html).toContain('class="my-class"');
  });

  it('renders inline inside paragraph', () => {
    const html = md.render('Some text {{span[red] word}} more');
    expect(html).toContain('<p>');
    expect(html).toContain('<span class="red">word</span>');
    expect(html).toContain('Some text');
    expect(html).toContain('more');
  });

  it('renders span without class when args is null', () => {
    // Span invoked without [args] — this would be just {{span body}}
    // In this case args is null, so no class attribute
    // But the inline dispatcher only triggers when the name is registered
    // {{span}} with no args won't reach span plugin since args slot requires the [[...]]
    // Test with body only (no brackets):
    const html = md.render('{{span hello}}');
    expect(html).toContain('<span>hello</span>');
  });
});
