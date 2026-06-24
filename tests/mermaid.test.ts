import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

describe('Phase 10 — Mermaid plugin', () => {
  it('renders multiline body', () => {
    const html = md.render('{{mermaid\ngraph LR\nA --> B\n}}');
    expect(html).toContain('<div class="mermaid" data-md=');
    expect(html).toContain('graph LR');
    expect(html).toContain('A --&gt; B');
  });

  it('renders with alias {{mm}}', () => {
    const html = md.render('{{mm\nsequence\n}}');
    expect(html).toContain('<div class="mermaid" data-md=');
  });

  it('renders single-line body', () => {
    const html = md.render('{{mermaid graph LR}}');
    expect(html).toContain('<div class="mermaid" data-md="{{mermaid&#10;graph LR&#10;}}">graph LR</div>');
  });

  it('embeds a data-md breadcrumb for copy-as-markdown', () => {
    const html = md.render('{{mermaid\ngraph LR\nA --> B\n}}');
    // newlines encoded so multi-line source survives the attribute
    expect(html).toContain('data-md="{{mermaid&#10;graph LR&#10;A --&gt; B&#10;}}"');
  });

  it('HTML-escapes script tags in body', () => {
    const html = md.render('{{mermaid <script>evil</script>}}');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
