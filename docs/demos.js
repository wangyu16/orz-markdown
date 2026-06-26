/* Renders live orz-markdown demos on the site. Each [data-demo] holds a
   <script type="text/markdown"> source; we show the source and render it with
   window.orzmd.render into a .render box. Diagram libs load lazily, only if used. */
(function () {
  'use strict';
  var ENH = {
    mermaid: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
    smiles: 'https://unpkg.com/smiles-drawer@1.0.10/dist/smiles-drawer.min.js',
    chart: 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js'
  };
  function dedent(s) {
    s = s.replace(/^\n+/, '').replace(/\s+$/, '');
    var lines = s.split('\n'), min = Infinity;
    lines.forEach(function (l) { if (l.trim()) { var m = l.match(/^ */)[0].length; if (m < min) min = m; } });
    if (!isFinite(min)) min = 0;
    return lines.map(function (l) { return l.slice(min); }).join('\n');
  }
  function load(src, cb) {
    if (document.querySelector('script[data-l="' + src + '"]')) { cb && cb(); return; }
    var s = document.createElement('script'); s.src = src; s.async = true; s.setAttribute('data-l', src);
    s.onload = function () { cb && cb(); }; document.head.appendChild(s);
  }
  function enhance(root) {
    if (root.querySelector('.mermaid')) load(ENH.mermaid, function () {
      if (window.mermaid) { window.mermaid.initialize({ startOnLoad: false }); try { window.mermaid.run({ nodes: root.querySelectorAll('.mermaid:not([data-processed])') }); } catch (e) {} }
    });
    if (root.querySelector('canvas[data-smiles]')) load(ENH.smiles, function () {
      if (!window.SmilesDrawer) return;
      root.querySelectorAll('canvas[data-smiles]').forEach(function (cv) {
        if (cv.__d) return; cv.__d = 1; var dr = new window.SmilesDrawer.Drawer({ width: cv.width, height: cv.height });
        window.SmilesDrawer.parse(cv.getAttribute('data-smiles'), function (t) { try { dr.draw(t, cv, 'light', false); } catch (e) {} });
      });
    });
    if (root.querySelector('canvas.orz-chart[data-chart]')) load(ENH.chart, function () {
      if (!window.Chart) return;
      root.querySelectorAll('canvas.orz-chart[data-chart]').forEach(function (cv) {
        if (cv.__d) return; cv.__d = 1;
        // wrap + make responsive so the chart fits its container instead of overflowing
        var wrap = cv.ownerDocument.createElement('div');
        wrap.style.cssText = 'position:relative;width:100%;max-width:420px;margin:.4em auto';
        cv.parentNode.insertBefore(wrap, cv); wrap.appendChild(cv);
        cv.removeAttribute('width'); cv.removeAttribute('height'); cv.style.width = ''; cv.style.height = '';
        try { var cfg = JSON.parse(cv.getAttribute('data-chart') || '{}'); cfg.options = Object.assign({ responsive: true, maintainAspectRatio: true, animation: false }, cfg.options || {}); new window.Chart(cv, cfg); } catch (e) {}
      });
    });
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
