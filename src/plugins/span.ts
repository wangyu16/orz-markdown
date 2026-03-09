import type MarkdownIt from 'markdown-it';
import { register } from '../registry.js';

export function registerSpan(md: MarkdownIt): void {
  register({
    type: 'inline',
    aliases: ['span', 'sp'],
    render(args, body, _env) {
      const inner = md.renderInline(body ?? '');
      if (!args) {
        return `<span>${inner}</span>`;
      }
      return `<span class="${args}">${inner}</span>`;
    },
  });
}
