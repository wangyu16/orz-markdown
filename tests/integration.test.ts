import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

// ── Helpers ───────────────────────────────────────────────────────────────────

function expectContainsAll(html: string, snippets: string[]) {
  for (const s of snippets) {
    expect(html, `expected to contain: ${s}`).toContain(s);
  }
}

// ── Conflict detection ────────────────────────────────────────────────────────

describe('Phase 16 — Integration: conflict detection', () => {
  it('KaTeX inline math not consumed by inline dispatcher', () => {
    const html = md.render('$E=mc^2$');
    expect(html).toContain('katex');
    expect(html).not.toContain('{{');
  });

  it('KaTeX display math not broken', () => {
    const html = md.render('$$E=mc^2$$');
    expect(html).toContain('katex-display');
  });

  it('footnotes still render', () => {
    const html = md.render('text[^1]\n\n[^1]: footnote note');
    expect(html).toContain('footnote');
    expect(html).toContain('footnote note');
  });

  it('markdown-it-container ::: still works', () => {
    const html = md.render('::: warning\ncontent\n:::');
    expect(html).toContain('<div class="warning">');
    expect(html).toContain('content');
  });

  it('markdown-it-anchor still sets id on headings', () => {
    const html = md.render('# Test Heading');
    expect(html).toContain('id="test-heading"');
  });

  it('markdown bold/italic/code still works', () => {
    const html = md.render('**bold** _italic_ `code`');
    expectContainsAll(html, ['<strong>bold</strong>', '<em>italic</em>', '<code>code</code>']);
  });

  it('task lists still render checkboxes', () => {
    const html = md.render('- [x] done\n- [ ] todo');
    expectContainsAll(html, ['type="checkbox"', 'checked']);
  });

  it('markdown-it-mark ==highlight== still works', () => {
    const html = md.render('==highlighted==');
    expect(html).toContain('<mark>highlighted</mark>');
  });
});

// ── Inline plugin nesting matrix ──────────────────────────────────────────────

describe('Phase 16 — Integration: inline plugins nesting matrix', () => {
  // span
  it('span in paragraph', () => {
    expect(md.render('text {{span[red] word}}')).toContain('<span class="red">word</span>');
  });
  it('span in heading', () => {
    const html = md.render('# Heading {{span[blue] colored}}');
    expectContainsAll(html, ['<h1', '<span class="blue">colored</span>']);
  });
  it('span in blockquote', () => {
    const html = md.render('> Quote {{span[green] text}}');
    expectContainsAll(html, ['<blockquote>', '<span class="green">text</span>']);
  });
  it('span in list item', () => {
    const html = md.render('- item {{span[red] label}}');
    expectContainsAll(html, ['<li>', '<span class="red">label</span>']);
  });
  it('span in table cell', () => {
    const html = md.render('| col1 |\n|---|\n| {{span[red] cell}} |');
    expectContainsAll(html, ['<td>', '<span class="red">cell</span>']);
  });
  it('span in bold', () => {
    const html = md.render('**bold {{span[yellow] colored}} text**');
    expectContainsAll(html, ['<strong>', '<span class="yellow">colored</span>']);
  });
  it('span in link text', () => {
    const html = md.render('[link {{span[blue] text}}](http://example.com)');
    expectContainsAll(html, ['<a', '<span class="blue">text</span>']);
  });

  // emoji
  it('emoji in paragraph', () => {
    expect(md.render('Hello {{emoji smile}}')).toContain('😄');
  });
  it('emoji in heading', () => {
    const html = md.render('# Happy {{emoji grinning}}');
    expectContainsAll(html, ['<h1', '😀']);
  });
  it('emoji in blockquote', () => {
    expect(md.render('> {{emoji heart}}')).toContain('❤️');
  });
  it('emoji in list item', () => {
    const html = md.render('- item {{emoji smile}}');
    expectContainsAll(html, ['<li>', '😄']);
  });
  it('emoji in table cell', () => {
    const html = md.render('| col1 |\n|---|\n| {{emoji smile}} |');
    expectContainsAll(html, ['<td>', '😄']);
  });
  it('emoji in bold', () => {
    const html = md.render('**{{emoji smile}}**');
    expectContainsAll(html, ['<strong>', '😄']);
  });
  it('emoji in link text', () => {
    const html = md.render('[{{emoji heart}}](http://example.com)');
    expectContainsAll(html, ['<a', '❤️']);
  });

  // space
  it('space in paragraph', () => {
    expect(md.render('a{{space 1}}b')).toContain('width:1rem');
  });
  it('space in heading', () => {
    const html = md.render('# Title{{space 0.5}}Rest');
    expectContainsAll(html, ['<h1', 'width:0.5rem']);
  });
  it('space in blockquote', () => {
    expect(md.render('> a{{space 1}}b')).toContain('width:1rem');
  });
  it('space in list item', () => {
    expect(md.render('- a{{space 1}}b')).toContain('width:1rem');
  });
  it('space in table cell', () => {
    const html = md.render('| col |\n|---|\n| a{{space 1}}b |');
    expectContainsAll(html, ['<td>', 'width:1rem']);
  });
  it('space in bold', () => {
    expect(md.render('**a{{space 1}}b**')).toContain('width:1rem');
  });
  it('space in link text', () => {
    expect(md.render('[a{{space 1}}b](http://example.com)')).toContain('width:1rem');
  });

  // qrcode
  it('qrcode in paragraph', () => {
    expect(md.render('Scan {{qr https://example.com}}')).toContain('<svg');
  });
  it('qrcode in heading', () => {
    const html = md.render('# QR {{qr https://example.com}}');
    expectContainsAll(html, ['<h1', '<svg']);
  });
  it('qrcode in blockquote', () => {
    expect(md.render('> {{qr https://example.com}}')).toContain('<svg');
  });
  it('qrcode in list item', () => {
    expect(md.render('- {{qr https://example.com}}')).toContain('<svg');
  });
  it('qrcode in table cell', () => {
    const html = md.render('| col |\n|---|\n| {{qr https://example.com}} |');
    expectContainsAll(html, ['<td>', '<svg']);
  });
  it('qrcode in bold', () => {
    expect(md.render('**{{qr https://example.com}}**')).toContain('<svg');
  });
  it('qrcode in link text', () => {
    expect(md.render('[{{qr https://example.com}}](http://x.com)')).toContain('<svg');
  });
});

// ── Block plugin nesting matrix ───────────────────────────────────────────────

describe('Phase 16 — Integration: block plugins nesting', () => {
  // youtube
  it('youtube standalone', () => {
    expect(md.render('{{youtube dQw4w9WgXcQ}}')).toContain('youtube.com/embed/dQw4w9WgXcQ');
  });
  it('youtube in blockquote', () => {
    const html = md.render('> {{youtube dQw4w9WgXcQ}}');
    expectContainsAll(html, ['<blockquote>', 'youtube.com/embed/dQw4w9WgXcQ']);
  });
  it('youtube in list item', () => {
    const html = md.render('- {{youtube dQw4w9WgXcQ}}');
    expectContainsAll(html, ['<li>', 'youtube.com/embed/dQw4w9WgXcQ']);
  });
  it('youtube in nested list', () => {
    const html = md.render('- item\n  - {{youtube dQw4w9WgXcQ}}');
    expect(html).toContain('youtube.com/embed/dQw4w9WgXcQ');
  });
  it('youtube in custom container', () => {
    const html = md.render('::: info\n{{youtube dQw4w9WgXcQ}}\n:::');
    expectContainsAll(html, ['<div class="info">', 'youtube.com/embed/dQw4w9WgXcQ']);
  });

  // mermaid
  it('mermaid standalone', () => {
    expect(md.render('{{mermaid graph LR}}')).toContain('<div class="mermaid">graph LR</div>');
  });
  it('mermaid in blockquote', () => {
    const html = md.render('> {{mermaid graph LR}}');
    expectContainsAll(html, ['<blockquote>', '<div class="mermaid">']);
  });
  it('mermaid in list item', () => {
    const html = md.render('- {{mermaid graph LR}}');
    expectContainsAll(html, ['<li>', '<div class="mermaid">']);
  });
  it('mermaid in nested list', () => {
    expect(md.render('- a\n  - {{mermaid graph LR}}')).toContain('<div class="mermaid">');
  });
  it('mermaid in custom container', () => {
    const html = md.render('::: success\n{{mermaid graph LR}}\n:::');
    expectContainsAll(html, ['<div class="success">', '<div class="mermaid">']);
  });

  // smiles
  it('smiles standalone', () => {
    expect(md.render('{{smiles C=C}}')).toContain('data-smiles="C=C"');
  });
  it('smiles in blockquote', () => {
    const html = md.render('> {{smiles C=C}}');
    expectContainsAll(html, ['<blockquote>', 'data-smiles="C=C"']);
  });
  it('smiles in list item', () => {
    const html = md.render('- {{smiles C=C}}');
    expectContainsAll(html, ['<li>', 'data-smiles="C=C"']);
  });
  it('smiles in nested list', () => {
    expect(md.render('- a\n  - {{smiles C=C}}')).toContain('data-smiles="C=C"');
  });
  it('smiles in custom container', () => {
    const html = md.render('::: danger\n{{smiles C=C}}\n:::');
    expectContainsAll(html, ['<div class="danger">', 'data-smiles="C=C"']);
  });
});

// ── Inline content inside block plugin bodies ─────────────────────────────────

describe('Phase 16 — Integration: block plugin body verbatim preservation', () => {
  it('mermaid -->  arrows not parsed as markdown', () => {
    const html = md.render('{{mermaid\ngraph LR\nA --> B\n}}');
    // The --> should be HTML-escaped, not turned into a markdown link/arrow
    expect(html).toContain('--&gt;');
    expect(html).not.toContain('<a');
  });

  it('yaml **bold** not parsed inside body', () => {
    const html = md.render('{{yaml\nkey: **value**\n}}');
    // Body should be verbatim inside script tag
    expect(html).toContain('key: **value**');
    expect(html).not.toContain('<strong>');
  });

  it('smiles special chars preserved in data attribute', () => {
    const html = md.render('{{smiles C[C@@H](N)C(=O)O}}');
    expect(html).toContain('C[C@@H](N)C(=O)O');
  });
});

// ── Mixed inline and block  ───────────────────────────────────────────────────

describe('Phase 16 — Integration: mixed inline and block', () => {
  it('two block plugins consecutive (no blank line) both render', () => {
    const html = md.render('{{test-block}}\n{{youtube abc}}');
    expectContainsAll(html, ['test-block', 'youtube.com/embed/abc']);
  });

  it('two inline plugins in same paragraph', () => {
    const html = md.render('{{span[red] A}} and {{emoji smile}} in one line');
    expectContainsAll(html, ['<span class="red">A</span>', '😄']);
  });

  it('inline span and block plugin in same blockquote', () => {
    const html = md.render('> {{span[blue] text}}\n> {{test-block}}');
    expectContainsAll(html, ['<blockquote>', '<span class="blue">text</span>', 'test-block']);
  });
});

// ── [args] parser edge cases ──────────────────────────────────────────────────

describe('Phase 16 — Integration: [args] edge cases', () => {
  it('no space between ] and body', () => {
    // {{span[red]text}} — body is "text"
    const html = md.render('{{span[red]text}}');
    expect(html).toContain('<span class="red">text</span>');
  });

  it('args with spaces inside brackets', () => {
    // {{span[red with-spaces] text}} — args is "red with-spaces"
    const html = md.render('{{span[red with-spaces] text}}');
    expect(html).toContain('class="red with-spaces"');
  });

  it('unregistered plugin with args stays literal', () => {
    const html = md.render('{{unknown[args]}}');
    expect(html).toContain('{{unknown[args]}}');
  });

  it('span with empty args produces span with empty class', () => {
    // {{span[] text}} — args is empty string ""
    const html = md.render('{{span[] text}}');
    // Empty args is falsy-ish but still a string — span renders
    expect(html).not.toContain('{{span');
  });
});
