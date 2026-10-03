import 'katex/contrib/mhchem';
import MarkdownIt from 'markdown-it';
import './plugins/test.js';
import './plugins/emoji.js';
import './plugins/space.js';
import './plugins/youtube.js';
import './plugins/mermaid.js';
import './plugins/smiles.js';
import './plugins/chart.js';
import './plugins/qrcode.js';
import './plugins/yaml.js';
import './plugins/nyml.js';
export { register } from './registry.js';
export type { PluginDefinition } from './registry.js';
export { prepareSources } from './prepare-sources.js';
export type { PrepareSourcesOptions } from './prepare-sources.js';
declare const md: MarkdownIt;
/**
 * TeX characters rendered per document, and of them inside `\ce{…}`/`\pu{…}`
 * arguments (4,000 small reactions are ~80,000).
 */
export declare const MAX_TEX_TOTAL = 1000000;
export declare const MAX_CHEM_TOTAL = 100000;
/**
 * KaTeX HTML per document: cost follows output (1 MB of arrays was 204 MB in
 * 52 s: round 21, H7). 5,000 display formulas of a textbook are ~45 MB.
 */
export declare const MAX_KATEX_OUTPUT = 64000000;
export default md;
export { md };
export * from './doc-meta.js';
export * from './nyml-blocks.js';
export { maskInertMarkdown } from './source-scan.js';
export type { MarkdownMaskOptions } from './source-scan.js';
export { resolveIncludePath } from './plugins/markdown-include.js';
export type { IncludeEnv } from './plugins/markdown-include.js';
export { VERSION, KATEX_VERSION } from './version.js';
//# sourceMappingURL=index.d.ts.map