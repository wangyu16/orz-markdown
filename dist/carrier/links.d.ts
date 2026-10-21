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
import { type TwinNaming } from './naming.js';
export { twinHref } from './naming.js';
/** Name of the core rule on the shared `md`. */
export declare const TWIN_LINKS_RULE = "orz_twin_links";
/**
 * The naming a render's `env.orzTwinLinks` asks for: `undefined` = no rewrite
 * (anything but `true` or an object), `null` = the family names, else the
 * naming. An object that is not a valid naming renders the family names
 * (a stored naming is validated when it is written and read; FC-18 §8.2).
 */
export declare function envTwinNaming(env: object): TwinNaming | null | undefined;
/** Register the twin-link rule on a markdown-it instance (idempotent). */
export declare function registerTwinLinks(target: MarkdownIt): void;
//# sourceMappingURL=links.d.ts.map