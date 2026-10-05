import type MarkdownIt from 'markdown-it';
import { register } from '../registry.js';
import { escapeAttr } from '../html.js';
import { inlineEnv } from '../env.js';

export function registerSpan(md: MarkdownIt, registry = true): void {
  // `registry: false` for a second, private instance (the carrier kit's parser):
  // the global plugin registry keeps the shared `md`'s definitions.
  if (registry) {
    register({
      type: 'inline',
      aliases: ['span', 'sp'],
      render(args, body, env) {
        // Rendered in its own env on purpose: sharing the document env makes
        // markdown-it-footnote append the footnote list inside every span.
        const inner = md.renderInline(body ?? '', inlineEnv(env));
        if (!args) {
          return `<span>${inner}</span>`;
        }
        return `<span class="${escapeAttr(args)}">${inner}</span>`;
      },
    });
  }
}
