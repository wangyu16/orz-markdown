import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

describe('Phase 9 — QR Code plugin', () => {
  it('renders SVG for URL', () => {
    const html = md.render('{{qr https://example.com}}');
    expect(html).toContain('<svg');
    expect(html).toContain('class="qrcode qrcode--standalone"');
  });

  it('marks a code alone in its paragraph as standalone (full size), one in a sentence as inline (text size)', () => {
    expect(md.render('{{qr https://example.com}}')).toContain('class="qrcode qrcode--standalone"');
    expect(md.render('  {{qr a}}  \n')).toContain('qrcode--standalone');
    const inline = md.render('Scan {{qr https://example.com}} here');
    expect(inline).toContain('class="qrcode"');
    expect(inline).not.toContain('qrcode--standalone');
    expect(md.render('{{qr a}} {{qr b}}')).not.toContain('qrcode--standalone');
    expect(md.render('- Scan {{qr a}} now\n- {{qr b}}')).toMatch(/Scan <span class="qrcode"[\s\S]*<span class="qrcode qrcode--standalone"/);
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
