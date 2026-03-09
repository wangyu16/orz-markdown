import 'katex/contrib/mhchem';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import container from 'markdown-it-container';
import footnote from 'markdown-it-footnote';
import imsize from 'markdown-it-imsize';
import mark from 'markdown-it-mark';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import ins from 'markdown-it-ins';
import taskLists from 'markdown-it-task-lists';
import katexPlugin from '@traptitech/markdown-it-katex';
import { blockDispatcher } from './rules/block-dispatcher.js';
import { inlineDispatcher } from './rules/inline-dispatcher.js';
import { getDefinition } from './registry.js';
import { registerSpan } from './plugins/span.js';
import { registerToc } from './plugins/toc.js';
import { registerAttrs } from './plugins/attrs.js';
import { registerMarkdownInclude } from './plugins/markdown-include.js';
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

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

// Official plugins (anchor must be first: TOC depends on its id generation)
md.use(anchor);
// Semantic color containers
md.use(container, 'success');
md.use(container, 'info');
md.use(container, 'warning');
md.use(container, 'danger');
// Layout containers
md.use(container, 'left');
md.use(container, 'right');
md.use(container, 'center');
// Interactive containers
md.use(container, 'spoil', {
  render(tokens: MarkdownIt.Token[], idx: number) {
    if (tokens[idx].nesting === 1) {
      // Extract label from params: "::: spoil My Title" → "My Title"
      const label = tokens[idx].info.trim().slice('spoil'.length).trim();
      return `<details class="spoil"><summary>${label || 'Show/hide'}</summary>\n`;
    }
    return '</details>\n';
  },
});
md.use(container, 'tabs');
md.use(container, 'tab', {
  render(tokens: MarkdownIt.Token[], idx: number) {
    if (tokens[idx].nesting === 1) {
      // Extract label from params: "::: tab Python" → "Python"
      const label = tokens[idx].info.trim().slice('tab'.length).trim();
      return `<div class="tab" data-label="${label}">\n`;
    }
    return '</div>\n';
  },
});
md.use(container, 'cols');
md.use(container, 'col');
md.use(footnote);
md.use(imsize);
md.use(mark);
md.use(sub);
md.use(sup);
md.use(ins);
md.use(taskLists);
md.use(katexPlugin, { enableMhchem: true });

// Custom dispatchers
md.block.ruler.after(
  'blockquote',
  'plugin_block_dispatcher',
  blockDispatcher,
  { alt: ['paragraph', 'reference', 'blockquote', 'list'] }
);

md.inline.ruler.after('escape', 'plugin_inline_dispatcher', inlineDispatcher);

// Register plugins that need access to the md instance
registerSpan(md);
registerToc(md);
registerAttrs(md);
registerMarkdownInclude(md);

// Renderer for plugin_block tokens
md.renderer.rules['plugin_block'] = (
  tokens: MarkdownIt.Token[],
  idx: number,
  _options: MarkdownIt.Options,
  env: object
): string => {
  const token = tokens[idx];
  const def = getDefinition(token.info);
  if (!def) return '';
  const args = token.meta?.args ?? null;
  return def.render(args, token.content || null, env);
};

// Renderer for plugin_inline tokens
md.renderer.rules['plugin_inline'] = (
  tokens: MarkdownIt.Token[],
  idx: number,
  _options: MarkdownIt.Options,
  env: object
): string => {
  const token = tokens[idx];
  const def = getDefinition(token.info);
  if (!def) return '';
  const args = token.meta?.args ?? null;
  return def.render(args, token.content || null, env);
};

export default md;
export { md };
