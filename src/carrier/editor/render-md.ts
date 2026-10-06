/**
 * The `md` kind's preview renderer (FC-18 §7.1, §8.3): the body without its
 * header, rendered by orz-markdown with twin links on (`env.orzTwinLinks`),
 * every block stamped with `data-src-line` — its 0-based line in the WHOLE
 * text (the header's lines counted) — so the editor's scroll sync can anchor
 * on it. The other kinds pass their own `render` to the shell.
 *
 * Renders with the shared `md` (what the document's readers see, plugins and
 * all); the tokens are stamped between parse and render, so the shared
 * instance is not changed.
 */
import { md } from '../../index.js';
import { withoutHeader } from '../header.js';
import { registerTwinLinks } from '../links.js';

export interface MarkdownPreviewOptions {
  /** Rewrite links to text twins (`x.md` → `x.md.html`), as an assembled file does. Default `true`. */
  twinLinks?: boolean;
  /** Extra render env (e.g. a host's include resolution). */
  env?: Record<string, unknown>;
}

/** Block tokens without nesting that render their attributes. */
const STAMPED_LEAVES = new Set(['fence', 'code_block', 'hr']);

/** Render an `md` text for the editor preview (see the module comment). */
export function renderMarkdownPreview(text: string, options: MarkdownPreviewOptions = {}): string {
  registerTwinLinks(md); // idempotent; links.ts registers it on load as well
  const { body, offset } = withoutHeader(text);
  let lineOffset = 0;
  const head = text.slice(0, offset);
  for (let i = 0; i < head.length; i++) {
    const c = head.charCodeAt(i);
    if (c === 10) lineOffset++;
    else if (c === 13) { lineOffset++; if (head.charCodeAt(i + 1) === 10) i++; }
  }
  const env: Record<string, unknown> = { ...(options.env ?? {}), orzTwinLinks: options.twinLinks !== false };
  const tokens = md.parse(body, env);
  for (const t of tokens) {
    if (!t.map || !t.block) continue;
    if (t.nesting === 1 || STAMPED_LEAVES.has(t.type)) t.attrSet('data-src-line', String(t.map[0] + lineOffset));
  }
  return md.renderer.render(tokens, md.options, env);
}
