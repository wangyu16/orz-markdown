/**
 * `orz-markdown/carrier` — building blocks shared by the orz-family carriers
 * (orz-mdhtml, orz-slides, orz-paged, orz-poster) and their hosts.
 *
 * Per family decision FD-03, carrier behavior that every format needs is
 * implemented once here and absorbed by a rebuild, instead of being copied
 * into each carrier's template and runtime. This first slice holds the escaping
 * rules for writing source and data islands; host protocols, save and chrome
 * follow in later releases.
 *
 * Node-free and dependency-free: safe to import from a browser bundle.
 */
export { escapeHtml, escapeAttr, jsonForScript, escapeScriptText, unescapeScriptText } from './html.js';
export { maskInertMarkdown } from './source-scan.js';
export type { MarkdownMaskOptions } from './source-scan.js';
export { VERSION } from './version.js';
