import { register } from '../registry.js';

register({
  type: 'inline',
  aliases: ['space'],
  render(_args, body, _env) {
    const n = parseFloat(body?.trim() ?? '');
    if (!isFinite(n) || n <= 0) {
      return '';
    }
    return `<span style="display:inline-block;width:${n}rem"></span>`;
  },
});
