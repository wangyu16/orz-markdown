import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

describe('NYML plugin', () => {
  it('renders NYML as a json script tag', () => {
    const html = md.render('{{nyml\nkey: value\n}}');
    expect(html).toContain('<script type="application/json" id="nyml-data">');
    expect(html).toContain('"key": "value"');
  });

  it('handles multiline NYML', () => {
    const html = md.render('{{nyml\nname: Alice\ncomments: |\n  hello\n  world\n}}');
    expect(html).toContain('"name": "Alice"');
    expect(html).toContain('"comments": "hello\\nworld\\n"');
  });

  it('escapes </script> in body to prevent early tag close', () => {
    const html = md.render('{{nyml\nmalicious: </script>\n}}');
    expect(html).not.toMatch(/<\/script>\s*<\/script>/);
    const scriptTagCount = (html.match(/<\/script>/gi) || []).length;
    expect(scriptTagCount).toBe(1);
  });
});
