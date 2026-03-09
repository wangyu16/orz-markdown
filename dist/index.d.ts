import 'katex/contrib/mhchem';
import MarkdownIt from 'markdown-it';
import './plugins/test.js';
import './plugins/emoji.js';
import './plugins/space.js';
import './plugins/youtube.js';
import './plugins/mermaid.js';
import './plugins/smiles.js';
import './plugins/qrcode.js';
import './plugins/yaml.js';
import './plugins/nyml.js';
export { register } from './registry.js';
export type { PluginDefinition } from './registry.js';
export { prepareSources } from './prepare-sources.js';
declare const md: MarkdownIt;
export default md;
export { md };
//# sourceMappingURL=index.d.ts.map