// Entry for the browser bundle used by the markdown.orz.how editor (docs/).
// Exposes window.orzmd.render — the LOCAL orz-markdown parser (with all current
// plugins: chart, the copy-as-Markdown fixes, etc.), bundled for the browser —
// plus the browser runtime SOURCE (copy-as-Markdown + tabs + QR), which the
// editor injects into its preview iframe.
import { md } from '../dist/index.js';
import { getBrowserRuntimeScript } from '../dist/runtime.js';

window.orzmd = {
  render: function (s) { return md.render(s); },
  renderInline: function (s) { return md.renderInline(s); },
  runtimeScript: getBrowserRuntimeScript()
};
