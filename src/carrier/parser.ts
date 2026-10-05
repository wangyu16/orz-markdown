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

/** The kit's parser (created once, lazily). */
export function kitParser(): MarkdownIt {
  return (instance ??= createMarkdown(false));
}
