/* Renders live orz-markdown demos on the site. Each [data-demo] holds a
   <script type="text/markdown"> source; we show the source and render it with
   window.orzmd.render into a .render box, then window.orzmd.enhanceDocument (the kit's
   in-page enhancement) draws what needs a library, loading it only if used. */
(function () {
  'use strict';
  function dedent(s) {
    s = s.replace(/^\n+/, '').replace(/\s+$/, '');
    var lines = s.split('\n'), min = Infinity;
    lines.forEach(function (l) { if (l.trim()) { var m = l.match(/^ */)[0].length; if (m < min) min = m; } });
    if (!isFinite(min)) min = 0;
    return lines.map(function (l) { return l.slice(min); }).join('\n');
  }
  // Draw diagrams, charts, chemistry and code with the kit's own in-page
  // enhancement (orz-markdown's enhanceDocument, as a carrier's read view does):
  // pinned libraries loaded on demand, charts and Mermaid in the theme colours
  // the .render box sets (site.css), each drawn once its box is visible.
  function enhance(root) {
    var o = window.orzmd;
    if (o && typeof o.enhanceDocument === 'function') {
      try { Promise.resolve(o.enhanceDocument(root)).catch(function () {}); } catch (e) {}
    }
  }
  function run() {
    if (!window.orzmd) { setTimeout(run, 60); return; }
    document.querySelectorAll('[data-demo]').forEach(function (d) {
      var srcEl = d.querySelector('script[type="text/markdown"]'); if (!srcEl) return;
      var src = dedent(srcEl.textContent);
      var st = d.querySelector('.srctext'); if (st) st.textContent = src;
      var out = d.querySelector('.render');
      if (out) { try { out.innerHTML = window.orzmd.render(src); enhance(out); } catch (e) { out.textContent = String(e); } }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
