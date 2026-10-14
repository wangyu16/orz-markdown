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
export declare const CONTENT_THEME_SCRIPT: string;
//# sourceMappingURL=content-theme.d.ts.map