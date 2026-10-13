"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONTENT_THEME_SCRIPT = void 0;
/**
 * Themed charts and diagrams (2.4.0): Chart.js and Mermaid take their colours
 * and font from CSS custom properties, so a theme (or a slide, a region, any
 * ancestor) styles them like the rest of the page.
 *
 * Chart.js (read on the chart's canvas):
 *   --chart-text            labels, ticks, legend, title      (fallback: the canvas's `color`)
 *   --chart-grid            grid and axis lines                (fallback: the text colour at 15 %)
 *   --chart-font            font family                        (fallback: the canvas's `font-family`)
 *   --chart-1 … --chart-8   the series palette, in order       (fallback: Chart.js's own seven colours)
 *   --chart-fill-opacity    area / bar fill opacity, 0–1       (fallback: 0.5, as Chart.js's)
 *   --chart-surface         the colour between pie slices      (fallback: the nearest opaque background)
 *   --chart-aspect          width / height of the chart        (fallback: Chart.js's, 2; 1 for pie, doughnut, radar, polar)
 *   --chart-max-width       the chart frame's maximum width    (fallback: 440px; read by CSS, not here)
 * A colour the chart's own config sets (a dataset's colours, an option) is kept.
 *
 * Mermaid (read on the `.mermaid` element; Mermaid's `base` theme):
 *   --mm-text     text                      (fallback: the element's `color`)
 *   --mm-line     edges and arrows          (fallback: --mm-text)
 *   --mm-node     node fill                 (fallback: the surface mixed 12 % toward --mm-accent)
 *   --mm-border   node borders              (fallback: --mm-accent)
 *   --mm-accent   secondary fills, clusters (fallback: the element's `color`)
 *   --mm-note     note fill                 (fallback: Mermaid's derivation)
 *   --mm-surface  the diagram's background  (fallback: the nearest opaque background)
 *   --mm-font     font family               (fallback: the element's `font-family`)
 * Without any `--mm-*` property the diagram keeps Mermaid's own default theme
 * (as before 2.4.0). A diagram's own `%%{init}%%` / front-matter config wins.
 *
 * ONE source, run in the preview frame (an inline script of `bodyScripts()`,
 * used by `__orzEnhance`) and in a page (injected once per window by
 * `enhanceDocument`, carrying its nonce): `window.OrzContentTheme`. Plain
 * ES5 in a `String.raw` (like the runtime): no template literals, no
 * backticks, no `${`. It only computes configurations; drawing stays with
 * the callers.
 */
exports.CONTENT_THEME_SCRIPT = String.raw `(function(){
if (window.OrzContentTheme && window.OrzContentTheme.version === 1) return;
var CHART_DEFAULT = ['#36a2eb', '#ff6384', '#ff9f40', '#ffcd56', '#4bc0c0', '#9966ff', '#c9cbcf'];
var ctx = null;
function context() {
  if (ctx) return ctx;
  try { var c = document.createElement('canvas'); c.width = 1; c.height = 1; ctx = c.getContext('2d', { willReadFrequently: true }); } catch (e) { ctx = null; }
  return ctx;
}
/* A CSS colour → [r, g, b, a] (0–255, alpha 0–1), or null when it is not one. */
function rgba(value) {
  if (!value) return null;
  var x = context();
  if (!x) return null;
  var v = String(value).trim();
  if (!v) return null;
  x.fillStyle = '#000001'; x.fillStyle = v;
  var a1 = x.fillStyle;
  x.fillStyle = '#000002'; x.fillStyle = v;
  if (a1 === '#000001' && x.fillStyle === '#000002') return null;
  var s = String(x.fillStyle);
  var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s);
  if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), 1];
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (m) return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3]), m[4] === undefined ? 1 : +m[4]];
  /* another colour space (oklch, color-mix …): draw it and read the pixel */
  try {
    x.clearRect(0, 0, 1, 1); x.fillStyle = v; x.fillRect(0, 0, 1, 1);
    var d = x.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  } catch (e) { return null; }
}
function hex2(n) { var h = Math.max(0, Math.min(255, Math.round(n))).toString(16); return h.length < 2 ? '0' + h : h; }
function hex(c) { return '#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2]); }
function css(c, alpha) { var a = alpha === undefined ? c[3] : alpha * c[3]; return a >= 1 ? hex(c) : 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + (Math.round(a * 1000) / 1000) + ')'; }
function over(c, bg) { var a = c[3]; return [c[0] * a + bg[0] * (1 - a), c[1] * a + bg[1] * (1 - a), c[2] * a + bg[2] * (1 - a), 1]; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 1]; }
function luminance(c) {
  var f = function (v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
function style(el) { try { return el.ownerDocument.defaultView.getComputedStyle(el); } catch (e) { return null; } }
function prop(cs, name) { try { return cs ? String(cs.getPropertyValue(name) || '').trim() : ''; } catch (e) { return ''; } }
/* The nearest opaque background behind an element (white when none). */
function surface(el) {
  var n = el, white = [255, 255, 255, 1];
  var acc = null;
  while (n && n.nodeType === 1) {
    var c = rgba(prop(style(n), 'background-color'));
    if (c && c[3] > 0) {
      acc = acc ? over(acc, c) : c;
      if (acc[3] >= 1 || c[3] >= 1) return acc[3] >= 1 ? acc : over(acc, white);
    }
    n = n.parentElement;
  }
  return acc ? over(acc, white) : white;
}
function isObj(o) { return !!o && typeof o === 'object' && !(o instanceof Array); }
function obj(parent, key) { if (!isObj(parent[key])) parent[key] = {}; return parent[key]; }
function def(o, key, value) { if (o[key] === undefined || o[key] === null) o[key] = value; }
function fontOf(o, family) { var f = obj(o, 'font'); def(f, 'family', family); }

/* The chart's theme, read from its canvas. */
function chartTheme(canvas) {
  var cs = style(canvas);
  var color = rgba(prop(cs, 'color')) || [102, 102, 102, 1];
  var text = rgba(prop(cs, '--chart-text')) || color;
  var grid = rgba(prop(cs, '--chart-grid'));
  var palette = [];
  for (var i = 1; i <= 8; i++) { var p = rgba(prop(cs, '--chart-' + i)); if (p) palette.push(p); }
  var fo = parseFloat(prop(cs, '--chart-fill-opacity'));
  var sf = rgba(prop(cs, '--chart-surface'));
  return {
    text: css(text),
    grid: grid ? css(grid) : css(text, 0.15),
    font: prop(cs, '--chart-font') || prop(cs, 'font-family') || undefined,
    palette: palette.length ? palette : CHART_DEFAULT.map(function (h) { return rgba(h) || [0, 0, 0, 1]; }),
    fill: isFinite(fo) && fo >= 0 && fo <= 1 ? fo : 0.5,
    surface: css(sf || surface(canvas.parentElement || canvas)),
    aspect: parseFloat(prop(cs, '--chart-aspect'))
  };
}

var ARC = { pie: 1, doughnut: 1 };
var POLAR = { polarArea: 1 };
var RADIAL = { radar: 1, polarArea: 1 };
var NO_AXES = { pie: 1, doughnut: 1 };

/* Theme a Chart.js config in place (the chart's own colours and options win); returns it. */
function chart(canvas, config) {
  var g = isObj(config) ? config : {};
  var t = chartTheme(canvas);
  var type = String(g.type || 'bar');
  var o = obj(g, 'options');
  if (isFinite(t.aspect) && t.aspect > 0) def(o, 'aspectRatio', t.aspect);
  var plugins = obj(o, 'plugins');
  var legend = obj(plugins, 'legend');
  var labels = obj(legend, 'labels');
  def(labels, 'color', t.text);
  if (t.font) fontOf(labels, t.font);
  var title = obj(plugins, 'title');
  def(title, 'color', t.text);
  if (t.font) fontOf(title, t.font);
  var tooltip = obj(plugins, 'tooltip');
  if (t.font) { def(obj(tooltip, 'titleFont'), 'family', t.font); def(obj(tooltip, 'bodyFont'), 'family', t.font); }
  if (!NO_AXES[type]) {
    var scales = obj(o, 'scales');
    var ids = [];
    for (var k in scales) if (Object.prototype.hasOwnProperty.call(scales, k)) ids.push(k);
    if (RADIAL[type]) { if (ids.indexOf('r') < 0) ids.push('r'); }
    else { if (ids.indexOf('x') < 0) ids.push('x'); if (ids.indexOf('y') < 0) ids.push('y'); }
    for (var i = 0; i < ids.length; i++) {
      var sc = obj(scales, ids[i]);
      var ticks = obj(sc, 'ticks');
      def(ticks, 'color', t.text);
      if (t.font) fontOf(ticks, t.font);
      def(obj(sc, 'grid'), 'color', t.grid);
      def(obj(sc, 'border'), 'color', t.grid);
      var st = obj(sc, 'title');
      def(st, 'color', t.text);
      if (t.font) fontOf(st, t.font);
      if (RADIAL[type]) {
        def(obj(sc, 'angleLines'), 'color', t.grid);
        var pl = obj(sc, 'pointLabels');
        def(pl, 'color', t.text);
        if (t.font) fontOf(pl, t.font);
        def(ticks, 'backdropColor', 'transparent');
      }
    }
  }
  /* the series palette, the way Chart.js's colors plugin assigns its own: one colour per dataset, per slice for arcs */
  var data = isObj(g.data) ? g.data : {};
  var sets = data.datasets instanceof Array ? data.datasets : [];
  var n = t.palette.length, at = 0;
  for (var d = 0; d < sets.length; d++) {
    var ds = sets[d];
    if (!isObj(ds)) continue;
    var dtype = ds.type || type;
    var own = ds.backgroundColor !== undefined || ds.borderColor !== undefined;
    if (ARC[dtype] || POLAR[dtype]) {
      var count = ds.data instanceof Array ? ds.data.length : 0;
      if (!own) {
        var bg = [];
        for (var j = 0; j < count; j++) { var pc = t.palette[at++ % n]; bg.push(ARC[dtype] ? css(pc) : css(pc, t.fill)); }
        ds.backgroundColor = bg;
      } else at += count;
      def(ds, 'borderColor', t.surface);
    } else {
      if (!own) { ds.borderColor = css(t.palette[at % n]); ds.backgroundColor = css(t.palette[at % n], t.fill); }
      at++;
      if (dtype === 'line' || dtype === 'radar') { def(ds, 'pointBackgroundColor', ds.borderColor); }
    }
  }
  return g;
}

/* Mermaid's configuration for a diagram, read from its element: { key, config }. */
function mermaid(el) {
  var cs = style(el);
  var names = ['text', 'line', 'node', 'border', 'accent', 'note', 'surface', 'font'];
  var v = {}, any = false;
  for (var i = 0; i < names.length; i++) { v[names[i]] = prop(cs, '--mm-' + names[i]); if (v[names[i]]) any = true; }
  if (!any) return { key: 'default', config: { startOnLoad: false } };
  var bg = rgba(v.surface) || surface(el);
  if (bg[3] < 1) bg = over(bg, [255, 255, 255, 1]);
  var solid = function (c) { return c ? hex(c[3] < 1 ? over(c, bg) : c) : null; };
  var colour = rgba(prop(cs, 'color')) || [51, 51, 51, 1];
  var text = rgba(v.text) || colour;
  var accent = rgba(v.accent) || text;
  var node = rgba(v.node) || mix(bg, accent[3] < 1 ? over(accent, bg) : accent, 0.12);
  var tv = {
    darkMode: luminance(bg) < 0.4,
    background: hex(bg),
    fontFamily: v.font || prop(cs, 'font-family') || 'sans-serif',
    primaryColor: solid(node),
    primaryTextColor: solid(text),
    primaryBorderColor: solid(rgba(v.border) || accent),
    secondaryColor: solid(mix(bg, accent[3] < 1 ? over(accent, bg) : accent, 0.22)),
    tertiaryColor: solid(mix(bg, text[3] < 1 ? over(text, bg) : text, 0.05)),
    lineColor: solid(rgba(v.line) || text),
    textColor: solid(text),
    titleColor: solid(text),
    edgeLabelBackground: hex(bg),
    clusterBkg: solid(mix(bg, accent[3] < 1 ? over(accent, bg) : accent, 0.06)),
    clusterBorder: solid(rgba(v.border) || accent),
    actorBkg: solid(node),
    actorBorder: solid(rgba(v.border) || accent),
    actorTextColor: solid(text),
    actorLineColor: solid(rgba(v.line) || text),
    signalColor: solid(rgba(v.line) || text),
    signalTextColor: solid(text),
    labelBoxBkgColor: solid(node),
    labelBoxBorderColor: solid(rgba(v.border) || accent),
    labelTextColor: solid(text),
    loopTextColor: solid(text),
    sequenceNumberColor: hex(bg)
  };
  var note = rgba(v.note);
  if (note) { tv.noteBkgColor = solid(note); tv.noteTextColor = solid(text); tv.noteBorderColor = solid(rgba(v.border) || accent); }
  var config = { startOnLoad: false, theme: 'base', themeVariables: tv, fontFamily: tv.fontFamily };
  return { key: JSON.stringify(tv), config: config };
}

/*
 * Draw Mermaid diagrams grouped by their configuration: initialize, run, next
 * group (Mermaid's configuration is global). Returns a promise (or undefined
 * when there is nothing to draw).
 */
function runMermaid(lib, nodes) {
  var groups = [], byKey = {};
  for (var i = 0; i < nodes.length; i++) {
    var m = mermaid(nodes[i]);
    if (!byKey[m.key]) { byKey[m.key] = { config: m.config, nodes: [] }; groups.push(byKey[m.key]); }
    byKey[m.key].nodes.push(nodes[i]);
  }
  if (!groups.length) return undefined;
  var k = 0;
  var next = function () {
    if (k >= groups.length) return undefined;
    var g = groups[k++];
    try { lib.initialize(g.config); } catch (e) {}
    var r;
    try { r = lib.run({ nodes: g.nodes }); } catch (e) { r = null; }
    return r && typeof r.then === 'function' ? r.then(next, next) : next();
  };
  return next();
}

/* Visible: laid out with a size (not display: none, not in a closed details, not visibility: hidden). */
function visible(el) {
  try {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: false })) return false;
    var r = el.getClientRects();
    return r.length > 0 && (r[0].width > 0 || r[0].height > 0);
  } catch (e) { return false; }
}

window.OrzContentTheme = Object.freeze({ version: 1, chart: chart, chartTheme: chartTheme, mermaid: mermaid, runMermaid: runMermaid, visible: visible, rgba: rgba });
})();`;
//# sourceMappingURL=content-theme.js.map