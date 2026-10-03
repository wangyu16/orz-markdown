import { register } from '../registry.js';
import { escapeAttr, escapeHtml } from '../html.js';

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
