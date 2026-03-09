import { register } from '../registry.js';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

register({
  type: 'block',
  aliases: ['mermaid', 'mm'],
  render(_args, body, _env) {
    const content = body?.trim() ?? '';
    return `<div class="mermaid">${escapeHtml(content)}</div>\n`;
  },
});
