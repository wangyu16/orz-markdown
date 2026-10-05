/**
 * `orz-markdown/carrier` — building blocks shared by the orz-family carriers
 * (orz-mdhtml, orz-slides, orz-paged, orz-poster) and their hosts.
 *
 * Per family decision FD-03, carrier behavior that every format needs is
 * implemented once here and absorbed by a rebuild, instead of being copied
 * into each carrier's template and runtime. It holds the escaping rules for
 * writing source and data islands and the carrier kit core of text format 1
 * (FC-18, spec/FC-18-text-format-1.md; implementation in src/carrier/):
 *
 * - header: `readHeader`, `setHeaderValue`, `removeHeaderKey`, `lintHeader`
 * - document: `readDocument`, `kindFromFilename`, `twinName`, `mintUid`
 * - links: `twinHref` and the `env.orzTwinLinks` render rule
 * - envelope: `assembleEnvelope`, `extract`, `readIslandFromDom`
 *
 * Browser-safe (no Node built-ins). Since the carrier kit reads headers with
 * the token-based scanner, importing this entry also loads the parser; the kit
 * parses with a PRIVATE instance configured like `md` (so a host's `md.set()`
 * cannot change assembled bytes), and loading it registers the (inert by
 * default) twin-link rule on the shared `md`. A reader that only extracts
 * texts from files imports the parser-free `orz-markdown/carrier/read`.
 *
 * Rendering a text: render `withoutHeader(text).body` (with
 * `env.orzTwinLinks` in an assembled file). The shared `md` hides a
 * `kind: document` header but renders a legacy `kind: meta` header as a data
 * island, so a renderer must not render the header part.
 */
export { escapeHtml, escapeAttr, jsonForScript, escapeScriptText, unescapeScriptText } from './html.js';
export { maskInertMarkdown } from './source-scan.js';
export type { MarkdownMaskOptions } from './source-scan.js';
export { VERSION } from './version.js';
export * from './carrier/index.js';
export type { DocMeta, DocLicense } from './doc-meta.js';
//# sourceMappingURL=carrier.d.ts.map