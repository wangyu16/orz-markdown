import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

describe('Phase 14 — Attrs plugin', () => {
  it('sets id on heading', () => {
    const html = md.render('## Heading {{attrs[id="my-id"]}}');
    expect(html).toContain('<h2');
    expect(html).toContain('id="my-id"');
  });

  it('sets class on paragraph', () => {
    const html = md.render('paragraph text {{attrs[class="highlight"]}}');
    expect(html).toContain('<p');
    expect(html).toContain('class="highlight"');
  });

  it('sets multiple attributes', () => {
    const html = md.render('## Heading {{attrs[class="a" id="b"]}}');
    expect(html).toContain('class="a"');
    expect(html).toContain('id="b"');
  });

  it('no crash when nothing before attrs', () => {
    // No preceding block token: first token in document
    expect(() => md.render('{{attrs[class="x"]}}')).not.toThrow();
  });

  it('sets data attribute on paragraph', () => {
    const html = md.render('text {{attrs[data-foo="bar"]}}');
    expect(html).toContain('data-foo="bar"');
  });

  it('attrs token is removed from rendered output', () => {
    const html = md.render('Hello {{attrs[class="x"]}}');
    // The attrs token itself should produce no visible output
    expect(html).not.toContain('{{attrs');
    expect(html).toContain('Hello');
  });

  // Pins the core-rule ordering: attrs_resolve runs after markdown-it-anchor,
  // so a custom heading id always overrides the generated slug. Stable block
  // ids (blk-...) downstream depend on this — do not let a plugin-order
  // refactor silently break it.
  it('heading id from {{attrs[#...]}} overrides the markdown-it-anchor slug', () => {
    const html = md.render('## Acid-Base Theory{{attrs[#blk-abc12345]}}');
    expect(html).toContain('id="blk-abc12345"');
    // The anchor slug must not survive anywhere in the output
    expect(html).not.toContain('acid-base-theory');
  });

  it('custom heading id is stable when the heading text is edited', () => {
    const before = md.render('## Acid-Base Theory{{attrs[#blk-abc12345]}}');
    const after = md.render('## Totally Renamed Heading{{attrs[#blk-abc12345]}}');
    expect(before).toContain('id="blk-abc12345"');
    expect(after).toContain('id="blk-abc12345"');
    // Renaming the heading must not change or remove the id
    expect(after).not.toContain('totally-renamed-heading');
  });
});
