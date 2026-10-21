/**
 * Twin links (FC-18 §8.3): in an assembled file, a relative link to a text twin
 * (`week2.slides.md`, `notes.md#part`) points at the assembled twin
 * (`week2.slides.html`, `notes.md.html#part`) — or, with a naming (2.5.0,
 * FC-18 §8.2 `twinLinks`), at the name the host publishes it under
 * (`{ md: '{stem}.html' }`: `notes.html#part`). The text keeps its `.md`
 * links, so they also work on GitHub.
 *
 * The rewrite is a markdown-it core rule on the shared `md`, inert unless the
 * render's env carries `orzTwinLinks: true` (the family names) or a
 * `TwinNaming` object (2.5.0). It is registered when this module is loaded
 * (by `orz-markdown/carrier`), never by the parser entry.
 */
import type MarkdownIt from 'markdown-it';
import { md } from '../index.js';
import { rootEnv } from '../env.js';
import { readTwinNaming, twinHref, type TwinNaming } from './naming.js';

export { twinHref } from './naming.js';

/** Name of the core rule on the shared `md`. */
export const TWIN_LINKS_RULE = 'orz_twin_links';

type CoreState = { env: object; tokens: Array<{ type: string; children: Array<{ type: string; attrGet(n: string): string | null; attrSet(n: string, v: string): void }> | null }> };

/**
 * The naming a render's `env.orzTwinLinks` asks for: `undefined` = no rewrite
 * (anything but `true` or an object), `null` = the family names, else the
 * naming. An object that is not a valid naming renders the family names
 * (a stored naming is validated when it is written and read; FC-18 §8.2).
 */
export function envTwinNaming(env: object): TwinNaming | null | undefined {
  const v = rootEnv(env)['orzTwinLinks'];
  if (v === true) return null;
  if (v && typeof v === 'object' && !Array.isArray(v)) return readTwinNaming(v);
  return undefined;
}

/** The core rule: rewrites `link_open` hrefs when `env.orzTwinLinks` is `true` or a naming. */
function twinLinksRule(state: CoreState): void {
  const naming = envTwinNaming(state.env);
  if (naming === undefined) return;
  for (const token of state.tokens) {
    if (token.type !== 'inline' || !token.children) continue;
    for (const child of token.children) {
      if (child.type !== 'link_open') continue;
      const href = child.attrGet('href');
      if (href === null) continue;
      const next = twinHref(href, naming);
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
