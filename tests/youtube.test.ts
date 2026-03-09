import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

describe('Phase 8 — YouTube plugin', () => {
  it('renders embed for video ID', () => {
    const html = md.render('{{youtube dQw4w9WgXcQ}}');
    expect(html).toContain('youtube.com/embed/dQw4w9WgXcQ');
    expect(html).toContain('<iframe');
    expect(html).toContain('youtube-embed');
  });

  it('renders with alias {{yt}}', () => {
    const html = md.render('{{yt dQw4w9WgXcQ}}');
    expect(html).toContain('youtube.com/embed/dQw4w9WgXcQ');
  });

  it('returns empty for no body', () => {
    const html = md.render('{{youtube}}');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('youtube-embed');
  });

  it('renders between paragraphs', () => {
    const html = md.render('text\n\n{{youtube abc}}\n\ntext');
    expect(html).toContain('<p>text</p>');
    expect(html).toContain('youtube.com/embed/abc');
  });

  it('block rule fires without blank line before', () => {
    const html = md.render('text\n{{youtube abc}}');
    expect(html).toContain('youtube.com/embed/abc');
  });
});
