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
 * the token-based scanner, importing this entry also loads the parser (`md`);
 * loading it registers the (inert by default) twin-link rule on `md`.
 */
export { escapeHtml, escapeAttr, jsonForScript, escapeScriptText, unescapeScriptText } from './html.js';
export { maskInertMarkdown } from './source-scan.js';
export type { MarkdownMaskOptions } from './source-scan.js';
export { VERSION } from './version.js';
export * from './carrier/index.js';
