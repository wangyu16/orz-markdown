import { register } from '../registry.js';

register({
  type: 'inline',
  aliases: ['space'],
  render(_args, body, _env) {
    const n = parseFloat(body?.trim() ?? '');
    if (!isFinite(n) || n <= 0) {
      return '';
    }
    // Capped: `{{space 100000}}` made the page 1.6 million px wide (round 14).
    return `<span style="display:inline-block;width:${Math.min(n, 100)}rem"></span>`;
  },
});
