# Custom Theme Guide — orz-markdown

How to write a CSS theme for the parser.

---

## Two layers: structure and decoration

Every page that shows orz-markdown output gets its CSS in two layers.

| Layer | File | Owns | Never contains |
|---|---|---|---|
| **Structure** | `themes/common.css` (shared, one copy) | How things *work*: `::: left` floats and its width cap, `::: right` / `::: center` alignment (even in themes that justify text), the `::: cols` grid and its mobile collapse, tab switching and the no-JS fallback, horizontal scrolling for tables, code and long equations, 16:9 YouTube frames, diagram and chart width caps, SMILES sizing, QR sizing (text-size inside a sentence, 6rem when alone in its paragraph as `qrcode--standalone`, 2cm / 3cm in print), the article measure (`max-width: var(--markdown-body-max-width)`) and the opt-in `.measure-wide` / `.measure-full` classes, the first/last-child margin trim inside callouts and other containers, the family's single 640px breakpoint, and print (every tab printed after its label, a YouTube embed printed as its address, no page breaks inside figures) | colours, fonts, borders, shadows (except the functional QR/SMILES rules) |
| **Decoration** | one theme file (`light-neat-1.css`, …) | How things *look*: palette, typography, borders, backgrounds, radii, shadows, ornaments, and spacing rhythm (padding, margins, gaps) | any mechanism listed in the left column |

Because the structure lives in one place, a layout fix reaches every theme at
once, and a new theme cannot get layout subtly wrong. `tests/themes.test.ts`
enforces the split for every bundled theme and for the starter.

## What a new theme needs

1. **Start from the starter.** Copy `assets/minimal.css`. It is a complete
   theme with neutral decoration for every element the parser emits.
2. **Import the structure first.** `@import './common.css';` must come
   before any rule (after an optional font `@import url(...)`, as in every
   bundled theme). That path works beside the bundled themes and in
   `assets/`. Elsewhere, use
   `https://cdn.jsdelivr.net/npm/orz-markdown/themes/common.css`, pinned to a
   version if you need stability.
3. **Declare two things on `:root`:**
   - `color-scheme: light` or `color-scheme: dark`, so scrollbars and form
     controls match the theme;
   - `--markdown-body-max-width`, the article measure.
4. **Optionally tune the layout tokens** instead of re-declaring layout:

   | Token | Controls | Default |
   |---|---|---|
   | `--markdown-body-max-width` | width of the article (aim for ~70 characters of body text) | `none` |
   | `--orz-measure-wide` | width with `class="markdown-body measure-wide"` (aim for ~90 characters); `measure-full` removes the cap | `min(100%, 64rem)` |
   | `--orz-left-max-width` | cap on a `::: left` box without a width argument | `min(44%, 22rem)` |
   | `--orz-float-gap` | gap between a `::: left` box and the text beside it | `1.5rem` |
   | `--orz-center-max-width` | cap on a `::: center` block | `min(100%, 42rem)` |
   | `--orz-cols-gap` | gap between `::: cols` columns (a theme may also set `gap` directly) | `1.5rem` |
   | `--orz-col-min` | minimum width of an auto-sized column | `12rem` |

5. **Decorate every element** in the checklist below. Restyle, don't delete:
   an unstyled construct still works, but looks foreign.
6. **Never re-declare structure.** Don't set any of these on the containers
   (enforced by the test):
   - `float` or `width` on `.left`;
   - `text-align` on `.right` / `.center`;
   - `display` or `grid-template-columns` on `.cols`;
   - `display` on `.tab`;
   - `display` or `overflow` on `table`;
   - the position or padding hack on `.youtube-embed`;
   - narrow-screen `@media` rules for `.left` / `.cols`;
   - `max-width` or `display` on `.markdown-body` (set
     `--markdown-body-max-width` instead, or `measure-wide` stops working).

   If a mechanism seems wrong for your theme, fix it in `common.css` for
   everyone, or add a token.
7. **Check it.** Run `npm test`, and render `tests/example.html` (`npm run
   render`; `npm run render:minimal` renders the starter to
   `tests/example-minimal.html`) at desktop and phone widths in a real browser.

## The baseline grid (opt-in, ≥ 2.3.0)

A theme may set its text on a **ruled grid** on screen, as `light-playful-1`
does (a ruled notebook: everything is either written on the lines or on a
sheet attached on top of the paper). It opts in with one custom property on
the article, **inside `@media screen`**:

```css
@media screen {
  .markdown-body {
    --orz-grid: var(--rule);   /* the pitch: an absolute length equal to the body line-height */
    background-image: /* the ruling, from the content box top, every --orz-grid, at --orz-rule-at */;
    background-origin: content-box;
  }
}
```

The theme's CSS sets running text in whole lines (paragraphs and lists with
`line-height: var(--orz-grid)` and a blank line of padding, headings at whole
multiples), applies `--orz-sh-h1`…`--orz-sh-h6`, `--orz-sh-fn` (a relative
shift onto a rule) and `--orz-mb-…` (the margin that ends the block on a line),
draws its rules at `--orz-rule-at`, and gives `.orz-off-grid` (a written block
whose lines still leave the grid) and the sheets an opaque background. The
enhancement (`enhanceDocument` in a page, `__orzEnhance` in the preview frame;
`src/baseline-grid.ts`) measures those custom properties, places each block on
the grid and grows each sheet to end on a rule, and keeps it so when the
article's size changes or webfonts load. Without `--orz-grid` it does nothing,
and it never runs in print (`@media screen`; orz-paged drops every `@media`
block of a theme and rules its pages itself). Margins, paddings, line-height
and backgrounds are decoration, so the contract above is unchanged; the
opt-in is checked by `tests/themes.test.ts` (M.31).

## Design Token Pattern

All bundled themes use CSS custom properties for maintainability. Define them on `:root`:

```css
:root {
  /* Surface colors */
  --bg:           #ffffff;
  --bg-surface:   #f8f8f8;
  --surface:      #ffffff;
  --border:       #e0e0e0;
  --border-soft:  #eeeeee;

  /* Text colors */
  --text:         #222222;
  --text-soft:    #555555;
  --text-muted:   #888888;
  --heading:      #111111;

  /* Accent / link */
  --accent:       #0060cc;
  --link:         #0060cc;
  --link-visited: #5050aa;

  /* Code */
  --code-bg:      #f5f5f5;
  --code-border:  #dddddd;
  --code-text:    #333333;

  /* Semantic callout colors (4 required sets) */
  --success-bg:     #efffed;  --success-border: #5ab85a;  --success-text: #1a5e2a;
  --info-bg:        #e8f4fd;  --info-border:    #5a9fd4;  --info-text:    #1a4a70;
  --warning-bg:     #fff8e1;  --warning-border: #e0a820;  --warning-text: #7a5c00;
  --danger-bg:      #fff0f0;  --danger-border:  #d45a5a;  --danger-text:  #7a1a1a;

  /* Inline span colors */
  --span-red:    #c0392b;
  --span-yellow: #8f6c00;
  --span-green:  #1e7d5b;
  --span-blue:   #1d6db0;

  /* Typography */
  --font-body:    system-ui, sans-serif;
  --font-heading: system-ui, sans-serif;
  --font-code:    monospace;
  --base-size:    1rem;
  --line-height:  1.7;

  /* Markdown body container */
  --markdown-body-padding:   clamp(1.5rem, 5vw, 3rem);
  --markdown-body-max-width: calc(36rem + 2 * var(--markdown-body-padding)); /* ≈70ch */
  --orz-measure-wide:        calc(46rem + 2 * var(--markdown-body-padding)); /* ≈90ch */
  --markdown-body-border:    1px solid var(--border);
  --markdown-body-shadow:    none;
  --markdown-body-radius:    0px;
}
```

Every theme declares its scheme (required — scrollbars, form controls and the
default canvas follow it):
```css
:root { color-scheme: light; }  /* or dark */
```

Token *names* other than the layout tokens above are each theme's own choice;
the pattern is what matters.

---

## Recommended File Structure

Follow this section order in every theme file for consistency:

1. Metadata comment, font `@import url(...)` if any, then `@import './common.css'` (before any rule)
2. `:root` theme tokens
3. Optional modifier classes (`.font-*`, `.size-*`) if implemented
4. Reset and document shell (`html`, `body`, `:where(.markdown-body) *`)
5. `.markdown-body` container: padding, surface (the measure comes from `--markdown-body-max-width` / `--orz-measure-wide`, never `max-width`)
6. Headings `h1`–`h6`
7. Body copy: `p`, `strong`, `em`, `s`, `mark`, `ins`, `sub`, `sup`
8. Links: `a`, `a:hover`, `a:visited`
9. Lists and task lists: `ul`, `ol`, `li`, `.task-list-item`
10. Code and math: `code`, `pre`, `.katex`, `.katex-display`
11. Structural blocks: `blockquote`, `table`, `img`, `hr`
12. Semantic containers: `.success`, `.info`, `.warning`, `.danger`
13. Layout utilities: `.left`, `.right`, `.center`
14. Spoiler, tabs, and columns: `details.spoil`, `.tabs`, `.cols`
15. TOC and footnotes: `.toc-list`, `.footnotes`
16. Plugin output: `.youtube-embed`, `.mermaid`, `.smiles-render`, `canvas.orz-chart`, `.qrcode`, span color/badge classes
17. Decorative pseudo-elements and theme-only flourishes
18. Responsive *decoration* (`@media`) — layout collapse is common.css's job
19. Print *decoration* (`@media print`: e.g. ink-friendly colours) — pagination is common.css's job

---

## Optional Modifier Classes

Some bundled themes expose utility classes for runtime font and size switching. If you implement them, follow the same class names for interoperability:

```css
/* Applied to body or .markdown-body. Scoped like every rule (Guideline 1),
   and on body only custom properties — the article consumes them. */
body.font-serif,       .markdown-body.font-serif       { --font-body: Georgia, 'Noto Serif SC', serif; }
body.font-sans,        .markdown-body.font-sans        { --font-body: system-ui, 'Noto Sans SC', sans-serif; }
body.font-handwritten, .markdown-body.font-handwritten { --font-body: 'Hanzi Pen SC', cursive; }
body.font-typewrite,   .markdown-body.font-typewrite   { --font-body: monospace; }

body.size-xs, .markdown-body.size-xs { --font-scale: 0.9; }
body.size-sm, .markdown-body.size-sm { --font-scale: 0.96; }
body.size-lg, .markdown-body.size-lg { --font-scale: 1.08; }
body.size-xl, .markdown-body.size-xl { --font-scale: 1.16; }

/* …and the article reads them */
:where(.markdown-body) { font-family: var(--font-body); font-size: calc(1rem * var(--font-scale, 1)); }
```

These are not required by `common.css` — they are opt-in per theme.

---

## Element Checklist

Every theme must have CSS rules for all of the following. See `references/css-classes.md` for the exact selectors.

### Container & page
- [ ] `body` — page background only (typography on `body` leaks into host UI; enforced, M.14)
- [ ] `.markdown-body` — outer container: base font, size, line-height, colour, padding, background, border

### Headings and anchors
- [ ] `h1` `h2` `h3` `h4` `h5` `h6` — font size, color, margin, font-family

### Inline text
- [ ] `p` `a` `a:visited` `a:hover`
- [ ] `strong` `em` `s` / `del` `mark` `ins` `sub` `sup`
- [ ] `code` (inline) — background, border, border-radius, font
- [ ] `pre` — block container: background, border (scrolling comes from common.css)
- [ ] `pre > code` — reset border/background, set font-size and line-height

### Structural blocks
- [ ] `blockquote` — left border or background, text color
- [ ] `ul` `ol` `li` — padding, list markers
- [ ] `.task-list-item` `.task-list-item-checkbox`
- [ ] `table` `thead` `tbody` `th` `td` — borders, header background, row striping (scrolling and default cell alignment come from common.css)
- [ ] `hr` — height, color, margin
- [ ] `img` — margin, optional border/radius

### Plugins and containers
- [ ] `.footnote-ref` `.footnote-ref a` `.footnotes` `.footnotes-sep` `.footnote-backref`
- [ ] `.katex` `.katex-display` `.katex-error` — size and spacing (overflow scrolling comes from common.css)
- [ ] `div.success` `div.info` `div.warning` `div.danger` — background, border, text color
- [ ] `.left` `.right` `.center` — optional box styling only (common.css floats, aligns and caps them)
- [ ] `details.spoil` `details.spoil > summary` — border, summary background, open/closed marker
- [ ] `.tabs` `.tabs-bar` `.tabs-bar-btn` `.tabs-bar-btn.active` `.tab` — look only (switching, scrolling bar and no-JS fallback come from common.css)
- [ ] `.cols` `.col` — column surfaces and `gap` (the grid and its collapse come from common.css)
- [ ] `.toc-list` — list reset, link styles (the parser emits only `<ul class="toc-list">`, no `nav.toc` wrapper)
- [ ] `span.red` `span.yellow` `span.green` `span.blue`
- [ ] `span.success` `span.info` `span.warning` `span.danger` — inline badge variant
- [ ] `div.youtube-embed` — frame decoration only (common.css makes it 16:9 and responsive)
- [ ] `div.mermaid` — panel decoration (centering and width cap come from common.css); dark themes usually give it a light panel
- [ ] `div.smiles-render` `canvas[data-smiles]`
- [ ] `canvas.orz-chart` — optional panel decoration (Chart.js draws into it; common.css caps its width)
- [ ] `span.qrcode` — **must have `background: #fff`** (the SVG has no quiet zone; common.css's padding (4px around a standalone code, 0.12em inside a sentence) becomes the quiet zone)

---

## Design Guidelines

### 1. Scope under `.markdown-body`

Carriers (orz-mdhtml, orz-slides, orz-paged) load the theme into a page that
also holds editor UI, so a bare `h1`, `a` or `*` rule restyles that UI too.
Every selector must start with one of:

- `.markdown-body` — the article and everything in it;
- `:where(.markdown-body)` — the same scope with **no added specificity**
  (the bundled themes use it where an element rule must stay as weak as a bare
  `h1`, so it never outranks a `.markdown-body > :first-child` style rule);
- page scope: `:root`, `html`, `body`, `::selection`, `::-webkit-scrollbar*`,
  `.qrcode-overlay` (the QR overlay is appended to `<body>`).

The test suite enforces this for every bundled theme (claim M.14).

```css
/* Good */
.markdown-body h2 { ... }
:where(.markdown-body) blockquote { ... }

/* Page-scoped (OK) */
body { background: var(--bg); }  /* page surface only — typography goes on the article (M.14) */

/* The box-sizing reset: the page roots and the article, never host UI */
html, body, :where(.markdown-body), :where(.markdown-body) *,
:where(.markdown-body) *::before, :where(.markdown-body) *::after { box-sizing: border-box; }
```

### 2. Semantic callouts must be visibly distinct

`div.success/info/warning/danger` must clearly differ from regular content even in neutral palettes. The four semantic meanings (green/blue/amber/red) must be preserved — do not swap, remove, or use identical styles for multiple variants.

### 3. QR codes always need a white plate

The SVG inside `span.qrcode` is black modules on its own white rect, with no
quiet zone. Give the inline widget a white background so common.css's padding
(4px around a standalone code, 0.12em inside a sentence) becomes the quiet zone (scanners need light around the code on
dark themes). The expanded overlay is styled entirely by common.css
(`!important`); leave it alone.

```css
.markdown-body span.qrcode { background: #fff; }
```

### 4. Tab switching belongs to common.css

Showing the active panel, hiding the rest, and the no-JS fallback (every panel
shown) all live in common.css; a theme never sets `display` on `.tab`. A theme
may add a separator between the fallback panels:

```css
:where(.markdown-body) .tabs:not([data-js]) .tab + .tab { border-top: 1px solid var(--border); }
```

### 5. Spoiler open/close marker is functional

The `summary::before` pseudo-element communicating open/closed state must be present. Use `+`/`–`, `▶`/`▼`, or any clear pair:

```css
details.spoil > summary::before { content: '+'; }
details.spoil[open] > summary::before { content: '–'; }
```

### 6. YouTube embeds: decorate only

common.css makes `.youtube-embed` a 16:9 box (`aspect-ratio`) and fills it with
the iframe. Do not add the old `padding-bottom: 56.25%` hack or set
position/size; a theme may add a background, border or radius.

### 7. One breakpoint, owned by common.css

Below 640px (the family's single breakpoint) common.css unfloats `::: left`
and stacks `::: cols`. Do not add your own narrow-screen layout rules for
`.left` / `.cols`; a theme's `@media` rules may change decoration only (e.g.
smaller article padding), preferably at the same 640px.

### 8. Dark themes: code block foreground vs syntax highlighting

Highlight.js injects its own colors into `<code>` tokens. Set `pre code { color: inherit; }` and choose a matching Highlight.js theme (e.g., `atom-one-dark.min.css`) rather than fighting it with heavy specificity.

### 9. Keep the palette small and purposeful

Avoid "AI tells": no gradients on every element, no excessive border-radius, no layout that relies on 15+ custom properties for a single component. Two to four accent colors with consistent usage throughout is more human than a rainbow.

### 10. Test with `tests/example.html`

After writing your theme, run `npm run render` from the project root to regenerate the example page and visually verify every element type. The example page includes all containers, all custom plugins, math, chemistry, mermaid, code blocks, tables, and footnotes.

### 11. CJK font stacks

Include CJK fallback fonts in your font stacks for proper Chinese/Japanese/Korean glyph rendering:

- **Serif themes**: include `Noto Serif TC`, `Noto Serif SC` in the serif stack
- **Sans-serif themes**: include `Noto Sans TC`, `Noto Sans SC` in the sans stack
- **Handwritten themes**: prefer `Hanzi Pen TC`, `Hanzi Pen SC`

```css
--font-body: 'Your Primary Font', 'Noto Sans TC', 'Noto Sans SC', system-ui, sans-serif;
```

### 12. SMILES rendering: match the page color scheme

SmilesDrawer's `draw()` call accepts a theme argument (`'light'` or `'dark'`). Dark-background themes need `'dark'` so bonds and atoms render white instead of black. This is set in the page initialization script (see `assets/template.html`), not in CSS — but coordinate with it:

```js
// Light themes:
drawer.draw(tree, canvas, 'light', false);
// Dark themes:
drawer.draw(tree, canvas, 'dark', false);
```

### 13. Reading comfort

- Text is start-aligned (`text-align: start`); don't justify.
- Ligatures are off on `code`, `pre`, `kbd` and `samp`, so `fi`, `->` or `!=`
  read as typed:
  `font-variant-ligatures: none; font-feature-settings: "liga" 0, "calt" 0;`.
- `span.red` / `span.yellow` / `span.green` / `span.blue` are text colour only,
  no background.
- Every text colour, spans and badges included, reaches 4.5:1 against its
  background (WCAG AA); on light pages "yellow" is a dark gold.
- `mark` is a soft tint, not a saturated block.
- Each callout type differs by colour *and* by an icon or shape, so it reads
  without colour vision.
- The default measure is about 70 characters (`--markdown-body-max-width`);
  `measure-wide` gives about 90.

---

## Theme Compliance Checklist

Use this when auditing an existing theme or reviewing a new one:

- [ ] Section order follows the 19-section structure above
- [ ] `@import './common.css'` comes before any rule (only a font `@import url(...)` may precede it)
- [ ] Base font size and line-height are declared as `:root` tokens near the top
- [ ] `.markdown-body` max-width, padding, border, and shadow are easy to override
- [ ] All heading levels `h1`–`h6` are styled distinctly
- [ ] Ordered lists use decimal counters (`1, 2, 3`) — never `01, 02, 03`
- [ ] Tables are not given `width: 100%` (common.css sizes them to content)
- [ ] All four semantic containers (`success/info/warning/danger`) are visually distinct
- [ ] Badge spans (`span.success/info/warning/danger`) stay single-line — no pseudo-label text injected
- [ ] QR code: `span.qrcode` has explicit `background: #fff` (the SVG has no quiet zone)
- [ ] No structure re-declared: no `float`/`width` on `.left`, no `display` on `.tab`, no YouTube ratio hack, no narrow-screen `.left`/`.cols` layout (common.css owns them; `tests/themes.test.ts` enforces it)
- [ ] Spoiler open/close marker (`summary::before`) communicates state clearly
- [ ] SMILES container is visually neutral — no decorative box styling
- [ ] Print rules are decoration only (strip outer body framing, ink-friendly colours); pagination, `thead` repeat and printing every tab come from common.css
- [ ] CJK font fallbacks are present in serif/sans/handwritten font stacks
