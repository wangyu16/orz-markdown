import { register } from '../registry.js';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Encode a value for a double-quoted HTML attribute, preserving newlines (as
// &#10;) so multi-line source survives in `data-md`.
function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '&#10;');
}

register({
  type: 'block',
  aliases: ['mermaid', 'mm'],
  render(_args, body, _env) {
    const content = body?.trim() ?? '';
    // `data-md` lets copy-as-markdown recover the source after client-side
    // mermaid rendering replaces the div contents with an <svg>.
    const directive = `{{mermaid\n${content}\n}}`;
    return `<div class="mermaid" data-md="${escapeAttr(directive)}">${escapeHtml(content)}</div>\n`;
  },
});
