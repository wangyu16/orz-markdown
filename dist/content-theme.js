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
 *   --chart-1 … --chart-8   the series palette, in order       (fallback: Chart.js's own seven colours);
 *                           past its end tints and shades of it, each as far from every colour
 *                           before it as can be for every reader (colour-blind ones included) — never a repeat
 *   --chart-fill-opacity    area / bar fill opacity, 0–1       (fallback: 0.5, as Chart.js's)
 *   --chart-surface         the colour between pie slices      (fallback: the nearest opaque background)
 *   --chart-aspect          width / height of the chart        (fallback: Chart.js's, 2; 1 for pie, doughnut, radar, polar)
 *   --chart-font-size       font size in CSS px, a number or Npx (fallback: Chart.js's, 12)
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
 * Without any of these the diagram keeps Mermaid's own default theme (as
 * before 2.4.0). Two more, which keep the theme as it is:
 *   --mm-font-size  font size in CSS px, a number or Npx (fallback: Mermaid's, 16)
 *   --mm-labels     `svg` | `html`: how node labels are drawn (fallback: `html`,
 *                   Mermaid's default — except under a CSS transform that
 *                   scales or rotates the diagram, where HTML labels are
 *                   measured wrong and cut, so `svg`)
 *   --mm-gantt-axis-format  a gantt chart's date axis, a d3 time format
 *                   (`'%b %-d'`, quoted or not; fallback: Mermaid's
 *                   `%Y-%m-%d`) — a compact one keeps a large-type gantt's
 *                   axis labels apart (2.4.0, orz-slides closed-loop round A);
 *                   `auto`: the format by the chart's span (days, months,
 *                   years) and the tick interval by its width, so the labels
 *                   never overprint and keep the year when it matters (round
 *                   A2; round A3: only intervals d3 counts continuously —
 *                   days, weeks, months that divide the year, the year —
 *                   with every k-th label kept when even years crowd); the
 *                   chart's own `axisFormat` / `tickInterval` win
 *   --mm-gantt-today  `off`: no "today" line (a deck shown on another day
 *                   draws the same chart)
 * With --mm-font-size a gantt chart's task, section and axis text is drawn at
 * that size too (Mermaid's own are 11 and 10), its bars sized to hold it.
 * A diagram's own `%%{init}%%` / front-matter config wins.
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
/* A font object of a Chart.js option: the theme's family and size where the chart sets none. */
function fontOf(o, t, key) { var f = obj(o, key || 'font'); if (t.font) def(f, 'family', t.font); if (t.size) def(f, 'size', t.size); }
/* A size in CSS px ('18', '18px'), or 0 when it is not one. */
function px(v) { var m = /^([0-9]*\.?[0-9]+)(px)?$/i.exec(String(v || '').trim()); var n = m ? parseFloat(m[1]) : 0; return n > 0 && n < 1000 ? n : 0; }

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
    aspect: parseFloat(prop(cs, '--chart-aspect')),
    size: px(prop(cs, '--chart-font-size'))
  };
}

function lab(c) {
  var f = function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }, h = function (t) { return t > 0.008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116; };
  var r = f(c[0]), g = f(c[1]), b = f(c[2]), x = h((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), y = h(0.2126 * r + 0.7152 * g + 0.0722 * b), z = h((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function dE(a, b) { var p = lab(a), q = lab(b); return Math.sqrt(Math.pow(p[0] - q[0], 2) + Math.pow(p[1] - q[1], 2) + Math.pow(p[2] - q[2], 2)); }
/* Colour vision deficiency (Machado, Oliveira and Fernandes 2009, severity 1), in linear RGB: protan, deutan, tritan. */
var CVD = [[[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]];
function seen(c, m) {
  var f = function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  var g = function (v) { v = Math.min(1, Math.max(0, v)); return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); };
  var l = [f(c[0]), f(c[1]), f(c[2])];
  return [g(m[0][0] * l[0] + m[0][1] * l[1] + m[0][2] * l[2]), g(m[1][0] * l[0] + m[1][1] * l[1] + m[1][2] * l[2]), g(m[2][0] * l[0] + m[2][1] * l[1] + m[2][2] * l[2]), 1];
}
/* How far apart two colours are for EVERY reader: the least ΔE in normal vision and under the three simulations (round A3). */
function dEvery(a, b) { var d = dE(a, b); for (var i = 0; i < CVD.length; i++) d = Math.min(d, dE(seen(a, CVD[i]), seen(b, CVD[i]))); return d; }
function cycled(t, k) {
  var n = t.palette.length;
  if (k < n) return t.palette[k];
  var list = t.extended || (t.extended = t.palette.slice()), surf = rgba(t.surface) || [255, 255, 255, 1], ink = rgba(t.text) || [0, 0, 0, 1];
  /* tints and shades of the palette, 20 … 80 % of the way to the surface or the ink; each chosen as far as it can
     be from every colour before it — for colour-blind readers too (orz-slides round A3: normal vision only merged
     two slices of a 10-slice pie for a deutan reader, ΔE 1) — and from the surface */
  var AM = [];
  for (var s = 2; s <= 8; s++) { AM.push([surf, s / 10]); AM.push([ink, s / 10]); }
  while (list.length <= k) {
    var best = null, bd = -1;
    for (var i = 0; i < n; i++) for (var a = 0; a < AM.length; a++) {
      var c = mix(t.palette[i], AM[a][0], AM[a][1]), d = dEvery(c, surf) * 1.5;
      c[3] = t.palette[i][3];
      for (var u = 0; u < list.length && d > bd; u++) d = Math.min(d, dEvery(c, list[u]));
      if (d > bd + 1e-9) { bd = d; best = c; }
    }
    list.push(best);
  }
  return list[k];
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
  fontOf(labels, t);
  var title = obj(plugins, 'title');
  def(title, 'color', t.text);
  fontOf(title, t);
  var tooltip = obj(plugins, 'tooltip');
  fontOf(tooltip, t, 'titleFont'); fontOf(tooltip, t, 'bodyFont');
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
      fontOf(ticks, t);
      def(obj(sc, 'grid'), 'color', t.grid);
      def(obj(sc, 'border'), 'color', t.grid);
      var st = obj(sc, 'title');
      def(st, 'color', t.text);
      fontOf(st, t);
      if (RADIAL[type]) {
        def(obj(sc, 'angleLines'), 'color', t.grid);
        var pl = obj(sc, 'pointLabels');
        def(pl, 'color', t.text);
        fontOf(pl, t);
        def(ticks, 'backdropColor', 'transparent');
      }
    }
  }
  /* the series palette, the way Chart.js's colors plugin assigns its own: one colour per dataset, per slice for arcs */
  var data = isObj(g.data) ? g.data : {};
  var sets = data.datasets instanceof Array ? data.datasets : [];
  var at = 0;
  for (var d = 0; d < sets.length; d++) {
    var ds = sets[d];
    if (!isObj(ds)) continue;
    var dtype = ds.type || type;
    var own = ds.backgroundColor !== undefined || ds.borderColor !== undefined;
    if (ARC[dtype] || POLAR[dtype]) {
      var count = ds.data instanceof Array ? ds.data.length : 0;
      if (!own) {
        var bg = [];
        for (var j = 0; j < count; j++) { var pc = cycled(t, at++); bg.push(ARC[dtype] ? css(pc) : css(pc, t.fill)); }
        ds.backgroundColor = bg;
      } else at += count;
      def(ds, 'borderColor', t.surface);
    } else {
      if (!own) { var sc0 = cycled(t, at); ds.borderColor = css(sc0); ds.backgroundColor = css(sc0, t.fill); }
      at++;
      if (dtype === 'line' || dtype === 'radar') { def(ds, 'pointBackgroundColor', ds.borderColor); }
    }
  }
  return g;
}

/*
 * Drawn under a CSS transform that scales or rotates it: its box on screen is
 * not its layout box. Mermaid measures HTML labels on screen
 * (getBoundingClientRect), so there they come out cut; SVG labels are
 * measured in the SVG's own units (getBBox) and are right.
 */
function transformed(el) {
  try {
    var w = el.offsetWidth, h = el.offsetHeight;
    if (!(w > 0) || !(h > 0)) return false;
    var r = el.getBoundingClientRect();
    return Math.abs(r.width / w - 1) > 0.005 || Math.abs(r.height / h - 1) > 0.005;
  } catch (e) { return false; }
}

/* Mermaid's configuration for a diagram, read from its element: { key, config }. */
function mermaid(el) {
  var cs = style(el);
  var size = px(prop(cs, '--mm-font-size'));
  var labels = prop(cs, '--mm-labels').toLowerCase();
  var svg = labels === 'svg' || (labels !== 'html' && transformed(el));
  var m = colours(el, cs);
  var config = m.config;
  if (size) {
    var tv = config.themeVariables || (config.themeVariables = {});
    tv.fontSize = size + 'px';
    config.fontSize = size;
  }
  if (svg) { config.htmlLabels = false; config.flowchart = { htmlLabels: false }; }
  var axis = prop(cs, '--mm-gantt-axis-format').replace(/^(['"])(.*)\1$/, '$2');
  var today = prop(cs, '--mm-gantt-today').toLowerCase();
  var key = m.key + '|' + size + '|' + (svg ? 'svg' : 'html');
  if (/^\s*gantt\b/m.test(el.textContent || '')) {
    var gantt = {};
    var extra = '';
    if (axis === 'auto') {
      var a = ganttAxis(ganttSpan(el.textContent || ''), el.clientWidth || 0, size || 11);
      if (a) {
        gantt.axisFormat = a.format; gantt.tickInterval = a.interval;
        /* more ticks than labels fit: every thin-th tick keeps its label (the ticks stay continuous) */
        if (a.thin > 1) extra += '.tick:not(:nth-of-type(' + a.thin + 'n+1)) text{display:none}';
      }
    } else if (axis) gantt.axisFormat = axis;
    if (size) {
      gantt.fontSize = size; gantt.sectionFontSize = size;
      gantt.barHeight = Math.round(size * 1.5); gantt.barGap = Math.max(4, Math.round(size * 0.3));
      extra += '.tick text{font-size:' + size + 'px}';
    }
    if (today === 'off' || today === 'none') extra += '.today{display:none}';
    if (extra) config.themeCSS = (config.themeCSS || '') + extra;
    config.gantt = gantt;
    key += '|' + JSON.stringify(gantt) + '|' + extra;
  }
  return { key: key, config: config };
}

/* A gantt chart's dates, from its source: { days, from, to } (UTC ms), or null. */
function ganttSpan(src) {
  var L = String(src).split('\n'), D = 864e5, U = { ms: 1, s: 1e3, m: 6e4, h: 36e5, d: D, w: 7 * D }, lo = Infinity, hi = -Infinity, cur = NaN, ends = {};
  for (var i = 0; i < L.length; i++) {
    var df = /^\s*dateFormat\s+(\S+)/.exec(L[i]), at = L[i].indexOf(':');
    if (df && df[1] !== 'YYYY-MM-DD') return 0;
    if (at < 0 || /^\s*(?:%%|title|section|axisFormat|tickInterval|excludes|includes|todayMarker|weekday|acc)/.test(L[i])) continue;
    var ps = L[i].slice(at + 1).split(','), st = NaN, en = NaN, du = 0, id = null;
    for (var j = 0; j < ps.length; j++) {
      var p = ps[j].trim(), m;
      if ((m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(p))) { if (isNaN(st)) st = Date.UTC(+m[1], m[2] - 1, +m[3]); else en = Date.UTC(+m[1], m[2] - 1, +m[3]); }
      else if ((m = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/.exec(p))) du = m[1] * U[m[2]];
      else if ((m = /^after\s+(.+)$/.exec(p))) { st = NaN; m[1].split(/\s+/).forEach(function (x) { if (ends[x] !== undefined && !(ends[x] <= st)) st = ends[x]; }); if (isNaN(st)) st = cur; }
      else if (/^[A-Za-z_][\w-]*$/.test(p) && !/^(done|active|crit|milestone)$/.test(p)) id = p;
    }
    if (isNaN(st)) st = cur;
    if (isNaN(st)) continue;
    if (isNaN(en)) en = st + du;
    if (id) ends[id] = en;
    cur = en; lo = Math.min(lo, st); hi = Math.max(hi, en);
  }
  return hi > lo ? { days: (hi - lo) / D, from: lo, to: hi } : null;
}
/*
 * The axis of a gantt chart by its span and width: { format, interval, thin }. Only intervals d3 counts without
 * restarting (orz-slides round A3: Mermaid's 'Nday' is d3's day of the MONTH, so 7day ticked 1, 8, 15, 22, 29, 1 …
 * and labels overprinted at each month's end; 'Nmonth' past 12 is the month of the YEAR, so 24 and 60 months fell
 * back to one a year): days, weeks, months that divide the year, the year. When even the coarsest has more ticks than
 * labels fit, or the one that fits has fewer than two, the ticks stay and every thin-th keeps its label. A span under
 * four months that crosses New Year shows the year.
 */
function ganttAxis(s, width, size) {
  if (!s || !(s.days > 0)) return null;
  var span = s.days, g = span <= 124 ? 0 : span <= 1100 ? 1 : 2;
  var crosses = g === 0 && new Date(s.from).getUTCFullYear() !== new Date(s.to - 1).getUTCFullYear();
  var chars = g === 0 ? (crosses ? 12 : 6) : g === 1 ? 8 : 4;
  var fit = Math.max(2, Math.floor(Math.max(120, (width > 0 ? width : 600) - 150) / (chars * size * 0.62 + size * 1.2)));
  /* [days, interval, the label groups it serves: 1 days, 2 months, 4 years] */
  var S = [[1, '1day', 1], [7, '1week', 1], [14, '2week', 1], [30.44, '1month', 3], [60.9, '2month', 3], [91.3, '3month', 3], [182.6, '6month', 2], [365.25, '12month', 6]];
  var pick = null, prev = null;
  for (var i = 0; i < S.length; i++) {
    if (!(S[i][2] & (1 << g))) continue;
    if (span / S[i][0] <= fit) { pick = S[i]; break; }
    prev = S[i];
  }
  var thin = 1;
  if (!pick) { pick = prev; thin = Math.ceil(span / pick[0] / fit); }
  else if (span / pick[0] < 2 && prev) { pick = prev; thin = Math.ceil(span / pick[0] / fit); }
  return { format: g === 0 ? (crosses ? '%b %-d, %Y' : '%b %-d') : g === 1 ? '%b %Y' : '%Y', interval: pick[1], thin: thin };
}

/* The colour part of Mermaid's configuration, from the --mm-* colour and font tokens. */
function colours(el, cs) {
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
 * group (Mermaid's configuration is global). One drawing at a time per window:
 * a call while another draws waits for it (a diagram shown while the first
 * pass still draws must not change the configuration under it). Returns a
 * promise (or undefined when there is nothing to draw).
 */
var busy = null;
function runMermaid(lib, nodes) {
  if (!nodes || !nodes.length) return undefined;
  var go = function () { return drawGroups(lib, nodes); };
  var p;
  if (busy) p = busy.then(go, go);
  else {
    p = go();
    if (!p || typeof p.then !== 'function') return p;
  }
  var mine = p.then(function () { if (busy === mine) busy = null; }, function () { if (busy === mine) busy = null; });
  busy = mine;
  return mine;
}
function drawGroups(lib, nodes) {
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
function visible(el) { return shown(el, true); }
/* Laid out with a size (not display: none, not in a closed details); visibility: hidden is laid out — enough for Mermaid, which measures text. */
function laidOut(el) { return shown(el, false); }
function shown(el, visibility) {
  try {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: visibility, contentVisibilityAuto: false })) return false;
    var r = el.getClientRects();
    return r.length > 0 && (r[0].width > 0 || r[0].height > 0);
  } catch (e) { return false; }
}

window.OrzContentTheme = Object.freeze({ version: 1, chart: chart, chartTheme: chartTheme, mermaid: mermaid, runMermaid: runMermaid, visible: visible, laidOut: laidOut, transformed: transformed, rgba: rgba });
})();`;
//# sourceMappingURL=content-theme.js.map