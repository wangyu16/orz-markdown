// Entry for the browser bundle used by the markdown.orz.how editor (docs/).
// Exposes window.orzmd.render — the LOCAL orz-markdown parser (with all current
// plugins) — plus the browser runtime source and the preview-frame assets, so the
// editor wires its preview iframe identically to the other host apps, and the
// kit's enhanceDocument for the live demos (features.html).
import { md } from '../dist/index.js';
import { getBrowserRuntimeScript } from '../dist/runtime.js';
import { getPreviewFrameAssets, enhanceDocument } from '../dist/preview-frame.js';

window.orzmd = {
  render: function (s) { return md.render(s); },
  renderInline: function (s) { return md.renderInline(s); },
  runtimeScript: getBrowserRuntimeScript(),
  previewAssets: getPreviewFrameAssets(),
  // The kit's in-page enhancement (themed charts and Mermaid, SMILES, highlight.js,
  // the runtime): the site's live demos draw exactly as a carrier's read view does.
  enhanceDocument: enhanceDocument
};
