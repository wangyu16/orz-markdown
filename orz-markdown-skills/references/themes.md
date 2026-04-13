# Custom Theme Guide — orz-markdown

How to write a CSS theme for the parser. A theme is a single CSS file that imports `common.css` for structural rules and then styles every element the parser emits.

---

## Starting Point

Option A — start from scratch with shared infrastructure:
```css
@import 'orz-markdown/themes/common.css';
/* or relative path when living alongside the bundled themes: */
@import './common.css';
```

Option B — start from `assets/minimal.css` (all structural rules already included, only visual layer needed). Copy it and add your visual styles on top.

---

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
  --span-yellow: #9a7615;
  --span-green:  #218763;
  --span-blue:   #1d6db0;

  /* Typography */
  --font-body:    system-ui, sans-serif;
  --font-heading: system-ui, sans-serif;
  --font-code:    monospace;
  --base-size:    1rem;
  --line-height:  1.7;

  /* Markdown body container */
  --markdown-body-max-width: 860px;
  --markdown-body-padding:   clamp(1.5rem, 5vw, 3rem);
  --markdown-body-border:    1px solid var(--border);
  --markdown-body-shadow:    none;
  --markdown-body-radius:    0px;
}
```

For dark themes add `color-scheme: dark` so browser chrome adapts:
```css
:root { color-scheme: dark; }
```

---

## Recommended File Structure

Follow this section order in every theme file for consistency:

1. `@import './common.css'` and metadata comments
2. `:root` theme tokens
3. Optional modifier classes (`.font-*`, `.size-*`) if implemented
4. Reset and document shell (`html`, `body`, `*`)
5. `.markdown-body` container: max-width, padding, surface
6. Headings `h1`–`h6` and `.header-anchor`
7. Body copy: `p`, `strong`, `em`, `s`, `mark`, `ins`, `sub`, `sup`
8. Links: `a`, `a:hover`, `a:visited`
9. Lists and task lists: `ul`, `ol`, `li`, `.task-list-item`
10. Code and math: `code`, `pre`, `.katex`, `.katex-display`
11. Structural blocks: `blockquote`, `table`, `img`, `hr`
12. Semantic containers: `.success`, `.info`, `.warning`, `.danger`
13. Layout utilities: `.left`, `.right`, `.center`
14. Spoiler, tabs, and columns: `details.spoil`, `.tabs`, `.cols`
15. TOC and footnotes: `nav.toc`, `.footnotes`
16. Plugin output: `.youtube-embed`, `.mermaid`, `.smiles-render`, `.qrcode`, span color/badge classes
17. Decorative pseudo-elements and theme-only flourishes
18. Responsive rules (`@media`)
19. Print rules (`@media print`)

---

## Optional Modifier Classes

Some bundled themes expose utility classes for runtime font and size switching. If you implement them, follow the same class names for interoperability:

```css
/* Font family modifiers — applied to body or .markdown-body */
.font-serif       { font-family: var(--font-body-serif, Georgia, serif); }
.font-sans        { font-family: var(--font-body-sans, system-ui, sans-serif); }
.font-handwritten { font-family: var(--font-body-handwritten, cursive); }
.font-typewrite   { font-family: var(--font-body-mono, monospace); }

/* Size modifiers */
.size-xs { font-size: 0.8rem; }
.size-sm { font-size: 0.9rem; }
.size-lg { font-size: 1.15rem; }
.size-xl { font-size: 1.3rem; }
```

These are not required by `common.css` — they are opt-in per theme.

---

## Element Checklist

Every theme must have CSS rules for all of the following. See `references/css-classes.md` for the exact selectors.

### Container & page
- [ ] `body` — page background, base font, line-height
- [ ] `.markdown-body` — outer container: max-width, padding, background, border

### Headings and anchors
- [ ] `h1` `h2` `h3` `h4` `h5` `h6` — font size, color, margin, font-family
- [ ] `.header-anchor` — hidden by default, visible on heading hover

### Inline text
- [ ] `p` `a` `a:visited` `a:hover`
- [ ] `strong` `em` `s` / `del` `mark` `ins` `sub` `sup`
- [ ] `code` (inline) — background, border, border-radius, font
- [ ] `pre` — block container: background, border, overflow
- [ ] `pre > code` — reset border/background, set font-size and line-height

### Structural blocks
- [ ] `blockquote` — left border or background, text color
- [ ] `ul` `ol` `li` — padding, list markers
- [ ] `.task-list-item` `.task-list-item-checkbox`
- [ ] `table` `thead` `tbody` `th` `td` — borders, header background, row striping
- [ ] `hr` — height, color, margin
- [ ] `img` — margin, optional border/radius

### Plugins and containers
- [ ] `.footnote-ref` `.footnote-ref a` `.footnotes` `.footnotes-sep` `.footnote-backref`
- [ ] `.katex` `.katex-display` `.katex-error`
- [ ] `div.success` `div.info` `div.warning` `div.danger` — background, border, text color
- [ ] `.left` `.right` `.center` — float/alignment, optional box styling
- [ ] `details.spoil` `details.spoil > summary` — border, summary background, open/closed marker
- [ ] `.tabs` `.tabs-bar` `.tabs-bar-btn` `.tabs-bar-btn.active` `.tab` `.tab.active`
- [ ] `.tabs:not([data-js]) .tab` — no-JS fallback: show all panels
- [ ] `.cols` `.col`
- [ ] `nav.toc` `.toc-list` — list reset, link styles
- [ ] `span.red` `span.yellow` `span.green` `span.blue`
- [ ] `span.success` `span.info` `span.warning` `span.danger` — inline badge variant
- [ ] `div.youtube-embed` `div.youtube-embed iframe` — 16:9 responsive wrapper (structural)
- [ ] `div.mermaid` `div.mermaid svg`
- [ ] `div.smiles-render` `canvas[data-smiles]`
- [ ] `span.qrcode` — **must have `background: #fff`** (SVG is always black-on-white)

---

## Design Guidelines

### 1. Scope under `.markdown-body`

Prefix all element rules with `.markdown-body` to avoid polluting global page styles. Exception: `body`, `html`, and `::selection` are acceptable at page scope.

```css
/* Good */
.markdown-body h2 { ... }
.markdown-body blockquote { ... }

/* Page-scoped (OK) */
body { background: var(--bg); font-family: var(--font-body); }
```

### 2. Semantic callouts must be visibly distinct

`div.success/info/warning/danger` must clearly differ from regular content even in neutral palettes. The four semantic meanings (green/blue/amber/red) must be preserved — do not swap, remove, or use identical styles for multiple variants.

### 3. QR codes always need white background

The SVG emitted inside `.qrcode` is black-on-transparent. Set an explicit white background on both the inline widget and the overlay so it reads correctly on dark themes:

```css
span.qrcode { background: #fff; padding: 4px; }
```

### 4. Tabs functional CSS is non-negotiable

The tabs show/hide behavior depends on these rules being present. They are functional, not decorative:

```css
.tab { display: none; }
.tab.active { display: block; }
.tabs:not([data-js]) .tab { display: block; }          /* no-JS fallback */
.tabs:not([data-js]) .tab + .tab { border-top: 1px solid ...; } /* visual separator */
```

### 5. Spoiler open/close marker is functional

The `summary::before` pseudo-element communicating open/closed state must be present. Use `+`/`–`, `▶`/`▼`, or any clear pair:

```css
details.spoil > summary::before { content: '+'; }
details.spoil[open] > summary::before { content: '–'; }
```

### 6. YouTube embed needs the 16:9 hack

The responsive iframe technique is structural — do not change the core ratio or remove it:

```css
div.youtube-embed { position: relative; height: 0; padding-bottom: 56.25%; overflow: hidden; }
div.youtube-embed iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
```

### 7. Float `.left` needs a mobile breakpoint

Without this the float causes overflow on narrow screens:

```css
@media (max-width: 600px) {
  .left { float: none; max-width: 100%; margin-right: 0; }
}
```

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

---

## Theme Compliance Checklist

Use this when auditing an existing theme or reviewing a new one:

- [ ] Section order follows the 19-section structure above
- [ ] `@import './common.css'` is the first line
- [ ] Base font size and line-height are declared as `:root` tokens near the top
- [ ] `.markdown-body` max-width, padding, border, and shadow are easy to override
- [ ] All heading levels `h1`–`h6` are styled distinctly
- [ ] Ordered lists use decimal counters (`1, 2, 3`) — never `01, 02, 03`
- [ ] Narrow tables shrink to content width instead of always stretching to full width
- [ ] All four semantic containers (`success/info/warning/danger`) are visually distinct
- [ ] Badge spans (`span.success/info/warning/danger`) stay single-line — no pseudo-label text injected
- [ ] QR code: `span.qrcode` has explicit `background: #fff` (SVG is always black-on-white)
- [ ] `.left` float has a mobile breakpoint (`float: none` below ~600px)
- [ ] Tabs show/hide CSS is functional (`display: none` default, `block` when `.active`)
- [ ] `.tabs:not([data-js]) .tab` fallback shows all panels when JS is absent
- [ ] Spoiler open/close marker (`summary::before`) communicates state clearly
- [ ] YouTube embed uses the 16:9 padding-bottom trick
- [ ] SMILES container is visually neutral — no decorative box styling
- [ ] Print rules strip outer body framing, fit paper width, and repeat `thead` across pages
- [ ] CJK font fallbacks are present in serif/sans/handwritten font stacks
