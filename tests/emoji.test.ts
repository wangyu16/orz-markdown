import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

describe('Phase 6 — Emoji plugin', () => {
  it('renders :smile: emoji', () => {
    const html = md.render('{{emoji smile}}');
    // node-emoji returns 😄 for 'smile'
    expect(html).toContain('😄');
  });

  it('renders :grinning: emoji with alias {{em grinning}}', () => {
    const html = md.render('{{em grinning}}');
    expect(html).toContain('😀');
  });

  it('returns literal for unknown emoji name', () => {
    const html = md.render('{{emoji nonexistent}}');
    expect(html).toContain('{{emoji nonexistent}}');
  });

  it('renders inline inside paragraph', () => {
    const html = md.render('Hello {{emoji smile}} world');
    expect(html).toContain('<p>');
    expect(html).toContain('😄');
  });

  it('renders :heart: emoji', () => {
    const html = md.render('{{emoji heart}}');
    expect(html).toContain('❤️');
  });
});
