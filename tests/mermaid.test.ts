import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

describe('Phase 10 — Mermaid plugin', () => {
  it('renders multiline body', () => {
    const html = md.render('{{mermaid\ngraph LR\nA --> B\n}}');
    expect(html).toContain('<div class="mermaid">');
    expect(html).toContain('graph LR');
    expect(html).toContain('A --&gt; B');
  });

  it('renders with alias {{mm}}', () => {
    const html = md.render('{{mm\nsequence\n}}');
    expect(html).toContain('<div class="mermaid">');
  });

  it('renders single-line body', () => {
    const html = md.render('{{mermaid graph LR}}');
    expect(html).toContain('<div class="mermaid">graph LR</div>');
  });

  it('HTML-escapes script tags in body', () => {
    const html = md.render('{{mermaid <script>evil</script>}}');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
