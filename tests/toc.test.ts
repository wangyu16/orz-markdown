import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

describe('Phase 13 — TOC plugin', () => {
  it('generates links to h1, h2, h3', () => {
    const html = md.render('{{toc}}\n\n# H1\n\n## H2\n\n### H3');
    expect(html).toContain('toc-list');
    expect(html).toContain('>H1<');
    expect(html).toContain('>H2<');
    expect(html).toContain('>H3<');
  });

  it('range filter: 2,3 excludes h1 from toc links', () => {
    const html = md.render('{{toc 2,3}}\n\n# H1\n\n## H2');
    // H2 appears as a TOC link
    expect(html).toContain('href="#h2"');
    // H1 should NOT appear as a TOC link (href="#h1" absent from toc)
    expect(html).not.toContain('href="#h1"');
  });

  it('toc mid-document links to all headings', () => {
    const html = md.render('# H1\n\n{{toc}}\n\n## H2');
    expect(html).toContain('>H1<');
    expect(html).toContain('>H2<');
  });

  it('empty toc when no headings', () => {
    const html = md.render('{{toc}}');
    expect(html).toContain('toc-list');
    // no list items
    expect(html).not.toContain('<li>');
  });

  it('two toc blocks in same document both populated', () => {
    const html = md.render('{{toc}}\n\n# H1\n\n{{toc}}\n\n## H2');
    const count = (html.match(/toc-list/g) || []).length;
    expect(count).toBe(2);
  });

  it('toc link href matches anchor id from markdown-it-anchor', () => {
    const html = md.render('{{toc}}\n\n## My Section');
    // markdown-it-anchor sets id="my-section" on the h2
    expect(html).toContain('href="#my-section"');
  });

  it('toc links use custom heading ids set via {{attrs[#...]}} (regression: attrs_resolve must run before toc_resolve)', () => {
    const html = md.render(
      '{{toc}}\n\n## Stoichiometry {{attrs[#blk-st01]}}\n\ntext\n\n## Stoichiometry\n\ntext'
    );

    // TOC link for the attrs-carrying heading points at the custom id, not the anchor slug
    expect(html).toContain('href="#blk-st01"');
    expect(html).not.toContain('href="#stoichiometry"');
    // Plain heading keeps its markdown-it-anchor slug (deduped to -1, slug assigned before attrs override)
    expect(html).toContain('href="#stoichiometry-1"');

    // Both TOC targets actually exist in the rendered document
    expect(html).toContain('id="blk-st01"');
    expect(html).toContain('id="stoichiometry-1"');

    // Every TOC href resolves to an element id in the output (no dead links)
    const tocHrefs = [...html.matchAll(/<a href="#([^"]+)">/g)].map(m => m[1]);
    expect(tocHrefs).toHaveLength(2);
    for (const href of tocHrefs) {
      expect(html).toContain(`id="${href}"`);
    }
  });
});
