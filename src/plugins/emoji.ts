import * as nodeEmoji from 'node-emoji';
import { register } from '../registry.js';
import { escapeAttr, escapeHtml } from '../html.js';

register({
  type: 'inline',
  aliases: ['emoji', 'em'],
  render(_args, body, _env) {
    const name = body?.trim() ?? '';
    const result = nodeEmoji.get(name);
    // node-emoji returns undefined for unknown names; fall back to original text
    if (!result) {
      return `{{emoji ${escapeHtml(name)}}}`;
    }
    // data-md: copy restores the directive, so a heading keeps its id
    // (`## {{emoji rocket}} Quick start` slugs without the emoji: round 16, L4).
    return `<span data-md="${escapeAttr(`{{emoji ${name}}}`)}">${result}</span>`;
  },
});
