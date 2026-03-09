import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

describe('Phase 6 — Space plugin', () => {
  it('renders 1rem space', () => {
    const html = md.render('{{space 1}}');
    expect(html).toContain('width:1rem');
  });

  it('renders 2.5rem space', () => {
    const html = md.render('{{space 2.5}}');
    expect(html).toContain('width:2.5rem');
  });

  it('returns empty for zero', () => {
    const html = md.render('{{space 0}}');
    expect(html).not.toContain('width:0rem');
  });

  it('returns empty for non-numeric body', () => {
    const html = md.render('{{space abc}}');
    expect(html).not.toContain('width:');
    expect(html).not.toContain('<span style');
  });

  it('renders inline inside paragraph', () => {
    const html = md.render('text{{space 0.5}}text');
    expect(html).toContain('<p>');
    expect(html).toContain('width:0.5rem');
  });

  it('returns empty for negative number', () => {
    const html = md.render('{{space -1}}');
    expect(html).not.toContain('width:-1rem');
  });
});
