import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

describe('Phase 1 — Official plugins', () => {
  it('anchor: adds id to headings', () => {
    const html = md.render('# Hello');
    expect(html).toContain('id="hello"');
  });

  it('container: warning block', () => {
    const html = md.render('::: warning\ntext\n:::');
    expect(html).toContain('<div class="warning">');
  });

  it('footnote: renders footnote reference and definition', () => {
    const html = md.render('text[^1]\n\n[^1]: note');
    // footnote reference becomes a superscript link
    expect(html).toContain('footnote');
  });

  it('imsize: width and height from =WxH syntax', () => {
    const html = md.render('![alt](img.png =100x50)');
    expect(html).toContain('width="100"');
    expect(html).toContain('height="50"');
  });

  it('mark: ==highlighted== renders <mark>', () => {
    const html = md.render('==marked==');
    expect(html).toContain('<mark>marked</mark>');
  });

  it('sub: H~2~O renders <sub>', () => {
    const html = md.render('H~2~O');
    expect(html).toContain('<sub>2</sub>');
  });

  it('sup: x^2^ renders <sup>', () => {
    const html = md.render('x^2^');
    expect(html).toContain('<sup>2</sup>');
  });

  it('ins: ++inserted++ renders <ins>', () => {
    const html = md.render('++inserted++');
    expect(html).toContain('<ins>inserted</ins>');
  });

  it('tasklist: - [x] renders checked checkbox', () => {
    const html = md.render('- [x] done');
    expect(html).toContain('checked');
  });

  it('katex inline: $E=mc^2$ renders katex span', () => {
    const html = md.render('$E=mc^2$');
    expect(html).toContain('class="katex"');
  });

  it('katex block: $$...$$  renders display math', () => {
    const html = md.render('$$\nE=mc^2\n$$');
    expect(html.toLowerCase()).toMatch(/katex-block|display/);
  });

  it('mhchem: $\\ce{H2O}$ renders without throwing', () => {
    expect(() => md.render('$\\ce{H2O}$')).not.toThrow();
    const html = md.render('$\\ce{H2O}$');
    expect(html).toContain('class="katex"');
  });
});
