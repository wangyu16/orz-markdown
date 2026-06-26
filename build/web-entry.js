// Entry for the browser bundle used by the markdown.orz.how editor (docs/).
// Exposes window.orzmd.render — the LOCAL orz-markdown parser (with all current
// plugins: chart, the copy-as-Markdown fixes, etc.), bundled for the browser.
import { md } from '../dist/index.js';

window.orzmd = {
  render: function (s) { return md.render(s); },
  renderInline: function (s) { return md.renderInline(s); }
};
