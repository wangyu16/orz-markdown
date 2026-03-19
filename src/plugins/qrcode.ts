import QRCode from 'qrcode-svg';
import { register } from '../registry.js';

register({
  type: 'inline',
  aliases: ['qr', 'qrcode'],
  render(_args, body, _env) {
    const content = body?.trim();
    if (!content) return '';
    const size = 96;
    const rawSvg = new QRCode({ content, width: size, height: size, padding: 0, color: '#000000', background: '#ffffff' }).svg();
    const svg = rawSvg.replace(
      '<svg ',
      `<svg viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet" `,
    );
    return `<span class="qrcode" role="button" tabindex="0" aria-label="Expand QR code" aria-expanded="false"><span class="qrcode__icon" aria-hidden="true">⤢</span>${svg}</span>`;
  },
});
