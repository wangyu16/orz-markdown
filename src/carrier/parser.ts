/**
 * The carrier kit's private parser: an instance built by the same factory as
 * the shared `md` (`createMarkdown`), so a host's `md.set()` / `md.use()`
 * cannot change what the kit reads from a text or the bytes it assembles.
 * Plugins registered with `register()` apply to it as well (the registry is
 * global by design). Built on first use.
 */
import type MarkdownIt from 'markdown-it';
import { createMarkdown } from '../index.js';

let instance: MarkdownIt | null = null;

/**
 * The kit's parser (created once, lazily). Exported from `orz-markdown/carrier`
 * (2.4.0) so a carrier parses a text with exactly the parser `readDocument`
 * and the lints use, and can hand its tokens to `readDocument({ tokens })`.
 * Do not `set()` or `use()` it: it is shared.
 */
export function kitParser(): MarkdownIt {
  return (instance ??= createMarkdown(false));
}
