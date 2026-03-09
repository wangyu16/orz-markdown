import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

describe('Phase 9 — QR Code plugin', () => {
  it('renders SVG for URL', () => {
    const html = md.render('{{qr https://example.com}}');
    expect(html).toContain('<svg');
    expect(html).toContain('class="qrcode"');
  });

  it('renders with full name {{qrcode}}', () => {
    const html = md.render('{{qrcode text}}');
    expect(html).toContain('<svg');
  });

  it('renders inline inside paragraph', () => {
    const html = md.render('Scan {{qr https://example.com}} this');
    expect(html).toContain('<p>');
    expect(html).toContain('<svg');
    expect(html).toContain('Scan');
    expect(html).toContain('this');
  });

  it('returns empty for empty body', () => {
    const html = md.render('{{qr}}');
    // empty body: plugin returns ''
    expect(html).not.toContain('<svg');
  });
});
