import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

describe('Phase 12 — YAML plugin', () => {
  it('renders YAML in script tag', () => {
    const html = md.render('{{yaml\nkey: value\n}}');
    expect(html).toContain('<script type="application/yaml">');
    expect(html).toContain('key: value');
  });

  it('renders with alias {{yml}}', () => {
    const html = md.render('{{yml\nkey: value\n}}');
    expect(html).toContain('<script type="application/yaml">');
    expect(html).toContain('key: value');
  });

  it('preserves multiple keys verbatim', () => {
    const html = md.render('{{yaml\nname: Alice\nage: 30\ntags: [a, b]\n}}');
    expect(html).toContain('name: Alice');
    expect(html).toContain('age: 30');
    expect(html).toContain('tags: [a, b]');
  });

  it('escapes </script> in body to prevent early tag close', () => {
    const html = md.render('{{yaml\nmalicious: </script>\n}}');
    expect(html).not.toMatch(/<\/script>\s*<\/script>/);
    // Should not contain unescaped closing tag that would break HTML
    const scriptTagCount = (html.match(/<\/script>/gi) || []).length;
    expect(scriptTagCount).toBe(1); // only the closing tag of the script block itself
  });
});
