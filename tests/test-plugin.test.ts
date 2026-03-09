import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

const BLOCK_DIV = '<div class="test-block">TestPluginBlock</div>';
const INLINE_SPAN = '<span class="test-inline">TestPluginInline</span>';

describe('Phase 5 — Test Plugins: block and inline dispatch', () => {
  // ── Block plugin cases ────────────────────────────────────────────────────

  it('test-block: basic render', () => {
    expect(md.render('{{test-block}}')).toContain(BLOCK_DIV);
  });

  it('test-block: body is ignored by test plugin', () => {
    expect(md.render('{{test-block some content}}')).toContain(BLOCK_DIV);
  });

  it('test-block: multiline body still produces block output', () => {
    expect(md.render('{{test-block\nsome\ncontent\n}}')).toContain(BLOCK_DIV);
  });

  it('test-block: block rule interrupts paragraph (no blank line)', () => {
    const html = md.render('text\n{{test-block}}');
    expect(html).toContain('<p>');
    expect(html).toContain('text');
    expect(html).toContain(BLOCK_DIV);
  });

  it('test-block: two consecutive (no blank lines) both render', () => {
    const html = md.render('{{test-block}}\n{{test-block}}');
    expect(html.split(BLOCK_DIV).length - 1).toBe(2);
  });

  // ── Inline plugin cases ───────────────────────────────────────────────────

  it('test-inline: renders in paragraph', () => {
    const html = md.render('Text {{test-inline}} here');
    expect(html).toContain('<p>');
    expect(html).toContain(INLINE_SPAN);
    expect(html).toContain('Text');
    expect(html).toContain('here');
  });

  it('test-inline: trailing space before closing }}', () => {
    expect(md.render('{{test-inline }}')).toContain(INLINE_SPAN);
  });

  it('test-inline: multiple inline in one paragraph', () => {
    const html = md.render('A {{test-inline}} and {{test-inline}} B');
    expect(html.split(INLINE_SPAN).length - 1).toBe(2);
  });

  // ── Nesting — inline plugins ──────────────────────────────────────────────

  it('test-inline: inside heading', () => {
    const html = md.render('# Heading {{test-inline}}');
    expect(html).toContain('<h1');
    expect(html).toContain(INLINE_SPAN);
  });

  it('test-inline: inside blockquote', () => {
    const html = md.render('> Quote {{test-inline}} text');
    expect(html).toContain('<blockquote>');
    expect(html).toContain(INLINE_SPAN);
  });

  it('test-inline: inside list item', () => {
    const html = md.render('- List item {{test-inline}}');
    expect(html).toContain('<li>');
    expect(html).toContain(INLINE_SPAN);
  });

  it('test-inline: inside bold', () => {
    const html = md.render('**bold {{test-inline}} bold**');
    expect(html).toContain('<strong>');
    expect(html).toContain(INLINE_SPAN);
  });

  it('test-inline: inside italic', () => {
    const html = md.render('*italic {{test-inline}} text*');
    expect(html).toContain('<em>');
    expect(html).toContain(INLINE_SPAN);
  });

  it('test-inline: inside table cell', () => {
    const html = md.render(
      '| col1 | col2 |\n|---|---|\n| {{test-inline}} | cell |'
    );
    expect(html).toContain('<td>');
    expect(html).toContain(INLINE_SPAN);
  });

  it('test-inline: inside link text', () => {
    const html = md.render('[link {{test-inline}} text](http://example.com)');
    expect(html).toContain('<a');
    expect(html).toContain(INLINE_SPAN);
  });

  // ── Nesting — block plugins ───────────────────────────────────────────────

  it('test-block: inside blockquote', () => {
    const html = md.render('> {{test-block}}');
    expect(html).toContain('<blockquote>');
    expect(html).toContain(BLOCK_DIV);
  });

  it('test-block: inside list item', () => {
    const html = md.render('- {{test-block}}');
    expect(html).toContain('<li>');
    expect(html).toContain(BLOCK_DIV);
  });

  it('test-block: inside nested list item (indented)', () => {
    const html = md.render('- item\n  - {{test-block}}');
    expect(html).toContain(BLOCK_DIV);
    // Verify it nests within list structure
    const blockPos = html.indexOf(BLOCK_DIV);
    const liPos = html.lastIndexOf('<li>', blockPos);
    expect(liPos).toBeGreaterThan(-1);
  });

  it('test-block: inside custom container', () => {
    const html = md.render('::: warning\n{{test-block}}\n:::');
    expect(html).toContain('<div class="warning">');
    expect(html).toContain(BLOCK_DIV);
  });

  it('test-block: NOT parsed inside heading (stays literal)', () => {
    const html = md.render('# {{test-block}}');
    expect(html).toContain('<h1');
    expect(html).not.toContain(BLOCK_DIV);
    expect(html).toContain('{{test-block}}');
  });

  it('test-block: NOT parsed in table cell (stays literal)', () => {
    const html = md.render(
      '| col1 |\n|---|\n| {{test-block}} |'
    );
    expect(html).not.toContain(BLOCK_DIV);
    expect(html).toContain('{{test-block}}');
  });

  // ── Escape cases ──────────────────────────────────────────────────────────

  it('\\{{test-block}} on its own line: paragraph with literal text', () => {
    const html = md.render('\\{{test-block}}');
    expect(html).toContain('<p>');
    expect(html).not.toContain(BLOCK_DIV);
    expect(html).toContain('{{test-block}}');
  });

  it('\\{{test-inline}} inline: literal {{test-inline}} in paragraph', () => {
    const html = md.render('\\{{test-inline}}');
    expect(html).not.toContain(INLINE_SPAN);
    expect(html).toContain('{{test-inline}}');
  });

  // ── Negative cases ────────────────────────────────────────────────────────

  it('unclosed {{test-block does not trigger plugin', () => {
    const html = md.render('{{test-block');
    expect(html).not.toContain(BLOCK_DIV);
    expect(html).toContain('{{test-block');
  });

  it('unknown name {{test-blockXYZ}} stays literal', () => {
    const html = md.render('{{test-blockXYZ}}');
    expect(html).not.toContain(BLOCK_DIV);
    expect(html).toContain('{{test-blockXYZ}}');
  });

  it('{{test-block}} inside fenced code stays as code text', () => {
    const html = md.render('```\n{{test-block}}\n```');
    expect(html).toContain('<code>');
    expect(html).toContain('{{test-block}}');
    expect(html).not.toContain(BLOCK_DIV);
  });

  it('{{test-inline}} inside inline code span stays as code text', () => {
    const html = md.render('`{{test-inline}}`');
    expect(html).toContain('<code>{{test-inline}}</code>');
    expect(html).not.toContain(INLINE_SPAN);
  });
});
