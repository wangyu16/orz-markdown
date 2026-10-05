/**
 * Twin links (FC-18 §8.3): in an assembled file, a relative link to a text twin
 * (`week2.slides.md`, `notes.md#part`) points at the assembled twin
 * (`week2.slides.html`, `notes.md.html#part`). The text keeps its `.md` links,
 * so they also work on GitHub.
 *
 * The rewrite is a markdown-it core rule on the shared `md`, inert unless the
 * render's env carries `orzTwinLinks: true`. It is registered when this module
 * is loaded (by `orz-markdown/carrier`), never by the parser entry.
 */
import type MarkdownIt from 'markdown-it';
import { md } from '../index.js';
import { rootEnv } from '../env.js';

/** Name of the core rule on the shared `md`. */
export const TWIN_LINKS_RULE = 'orz_twin_links';

/**
 * The assembled-twin href of a link href, or the href unchanged.
 *
 * Rewritten: a relative path (also `./`, `../`, or root-relative `/…`) whose
 * last segment ends in `.md`, `.slides.md` or `.paged.md` (lower case), with
 * an optional `?query` and/or `#fragment`, which are kept. Untouched: absolute
 * URLs (any `scheme:`, so `https:`, `mailto:`, `data:`), protocol-relative
 * `//host/…`, fragment- or query-only hrefs, and every other path.
 */
export function twinHref(href: string): string {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(href) || href.startsWith('//')) return href;
  const cut = href.search(/[?#]/);
  const path = cut >= 0 ? href.slice(0, cut) : href;
  const rest = cut >= 0 ? href.slice(cut) : '';
  const seg = path.slice(path.lastIndexOf('/') + 1);
  let m: RegExpExecArray | null;
  if ((m = /^(.+)\.(slides|paged)\.md$/.exec(seg))) return `${path.slice(0, path.length - seg.length)}${m[1]}.${m[2]}.html${rest}`;
  if (/^.+\.md$/.test(seg)) return `${path}.html${rest}`;
  return href;
}

type CoreState = { env: object; tokens: Array<{ type: string; children: Array<{ type: string; attrGet(n: string): string | null; attrSet(n: string, v: string): void }> | null }> };

/** The core rule: rewrites `link_open` hrefs when `env.orzTwinLinks === true`. */
function twinLinksRule(state: CoreState): void {
  if (rootEnv(state.env)['orzTwinLinks'] !== true) return;
  for (const token of state.tokens) {
    if (token.type !== 'inline' || !token.children) continue;
    for (const child of token.children) {
      if (child.type !== 'link_open') continue;
      const href = child.attrGet('href');
      if (href === null) continue;
      const next = twinHref(href);
      if (next !== href) child.attrSet('href', next);
    }
  }
}

/** Register the twin-link rule on a markdown-it instance (idempotent). */
export function registerTwinLinks(target: MarkdownIt): void {
  const ruler = target.core.ruler as unknown as { __find__(name: string): number };
  if (ruler.__find__(TWIN_LINKS_RULE) >= 0) return;
  target.core.ruler.push(TWIN_LINKS_RULE, twinLinksRule as unknown as MarkdownIt.Core.RuleCore);
}

registerTwinLinks(md);
