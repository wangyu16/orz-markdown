import QRCode from 'qrcode-svg';
import { register } from '../registry.js';

register({
  type: 'inline',
  aliases: ['qr', 'qrcode'],
  render(_args, body, _env) {
    const content = body?.trim();
    if (!content) return '';
    const svg = new QRCode({ content, width: 96, height: 96, padding: 0, color: '#000000', background: '#ffffff' }).svg();
    return `<span class="qrcode">${svg}</span>`;
  },
});
