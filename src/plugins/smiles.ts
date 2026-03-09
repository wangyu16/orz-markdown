import { register } from '../registry.js';

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

register({
  type: 'block',
  aliases: ['smiles', 'sm'],
  render(_args, body, _env) {
    const smiles = body?.trim() ?? '';
    return `<div class="smiles-render">\n  <canvas data-smiles="${escapeAttr(smiles)}" width="250" height="180"></canvas>\n</div>\n`;
  },
});
