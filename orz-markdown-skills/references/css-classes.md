# CSS Class Reference — orz-markdown

Every CSS class and structural HTML element emitted by the parser. Use this as the definitive spec when writing or auditing a theme. All selectors should be scoped under `.markdown-body` in theme files.

---

## Article wrapper

| Selector | Source | Notes |
|---|---|---|
| `.markdown-body` | `<article>` wrapping all rendered content | Every theme scopes its styles here |
| `.markdown-body.measure-wide` / `.measure-full` | `<article>` | Host-chosen line length: ~90 characters (`--orz-measure-wide`) or the whole width; the default is the theme's ~70. |

---

## Standard markdown elements

No plugin-specific classes. Style by tag name scoped under `.markdown-body`.

| Element | Notes |
|---|---|
| `h1` – `h6` | Headings. Each gets an `id` and `tabindex="-1"`; no class and no permalink element. |
| `p` | Paragraph. |
| `a` | Hyperlink. |
| `strong`, `em` | Bold / italic. |
| `s`, `del` | Strikethrough. |
| `mark` | Highlighted text (`==text==` via `markdown-it-mark`). |
| `ins` | Inserted text (`++text++` via `markdown-it-ins`). |
| `sub`, `sup` | Subscript / superscript (`~sub~` / `^sup^`). |
| `code` | Inline code. |
| `pre > code` | Fenced code block. Highlight.js adds token classes when active. |
| `blockquote` | Block quote. |
| `ul`, `ol`, `li` | Lists. |
| `table`, `thead`, `tbody`, `tr`, `th`, `td` | GFM table. |
| `hr` | Horizontal rule. |
| `img` | Image. `![](src =WxH)` adds `width`/`height` attributes (either may be omitted: `=400x`); common.css lets them win over its responsive sizing. |

---

## markdown-it-task-lists

| Class | Element | Description |
|---|---|---|
| `.contains-task-list` | `<ul>` / `<ol>` | A list holding at least one task item. |
| `.task-list-item` | `<li>` | List item beginning with `[ ]` or `[x]`. common.css removes its bullet. |
| `.task-list-item-checkbox` | `<input type="checkbox" disabled>` | Checkbox inside the task item (`checked` when `[x]`). |

---

## markdown-it-footnote

| Class | Element | Description |
|---|---|---|
| `.footnote-ref` | `<sup><a>` | Inline superscript reference (`[^1]`). |
| `.footnotes` | `<section>` | Container for all footnotes at page bottom. |
| `.footnotes-list` | `<ol>` | The numbered list inside `.footnotes`. |
| `.footnote-item` | `<li id="fn1">` | One note (`fn1`, `fn2`, …); a named note carries `data-footnote-label`. |
| `.footnotes-sep` | `<hr>` | Separator between body and footnotes section. |
| `.footnote-backref` | `<a>` | Back-link from definition to reference. |

---

## KaTeX

| Class | Element | Description |
|---|---|---|
| `.katex` | `<span>` | Wrapper for every inline math expression (`$...$`). |
| `.katex-display` | `<span>` | Wrapper for display block math (`$$...$$`). common.css already scrolls a wide equation inside it; decorate only. |
| `.katex-error` | `<span>` | Math that is not typeset (parse error, macro definition, too long): its TeX source, with the reason in `title`. Style as a visible error (red, monospace). |
| `p.katex-block` | `<p>` | Wraps the `.katex-error` of a display formula orz-markdown declined to typeset (macro definition, too long, per-document budget). |

---

## Semantic callouts (`markdown-it-container`)

| Class | Element | Description |
|---|---|---|
| `.success` | `<div>` | Green success callout. `:::success ... :::` |
| `.info` | `<div>` | Blue info callout. `:::info ... :::` |
| `.warning` | `<div>` | Amber warning callout. `:::warning ... :::` |
| `.danger` | `<div>` | Red danger callout. `:::danger ... :::` |

common.css trims the first child's top margin and the last child's bottom margin inside every callout; the theme need not.

---

## Layout containers

| Class | Element | Description |
|---|---|---|
| `.left` | `<div>` | Float-left box, capped at `--orz-left-max-width`; a `:::left 30%` width argument arrives as inline style. `common.css` unfloats it below 640px. |
| `.right` | `<div>` | Right-aligned wrapper (its text, images and tables align right in every theme). `:::right ... :::` |
| `.center` | `<div>` | Centred wrapper, capped at 42rem (`--orz-center-max-width`). `:::center ... :::` |

---

## Spoiler

| Selector | Element | Description |
|---|---|---|
| `details.spoil` | `<details>` | Collapsible spoiler block. `:::spoil My Title ... :::` |
| `details.spoil > summary` | `<summary>` | Toggle label. Hide `::-webkit-details-marker`. Provide open/close marker via `::before`. |
| `details.spoil[open] > summary` | `<summary>` | Style when open. Update `::before` content. |
| `details.spoil > :not(summary)` | any | Body content area. Apply padding here. |

---

## Tabs

| Selector | Element | Description |
|---|---|---|
| `.tabs` | `<div>` | Outer wrapper. `:::: tabs ... ::::` |
| `.tabs[data-js]` | `<div>` | Added by JS after initialisation. Use `.tabs:not([data-js])` for no-JS fallback. |
| `.tabs-bar` | `<div>` | Tab button bar injected by JS. |
| `.tabs-bar-btn` | `<button>` | Individual tab button. |
| `.tabs-bar-btn.active` | `<button>` | Currently selected tab button. |
| `.tab` | `<div data-label="…">` | Individual tab panel. common.css hides it unless `.active`; print shows every panel after its label (`::before`, "Tab N" when unlabeled; ≥ 2.3.0). |
| `.tab.active` | `<div>` | Currently visible panel (shown by common.css). |
| `.tabs:not([data-js]) > .tab` | `<div>` | No-JS fallback: common.css shows every panel. A theme may add a separator between them. |

---

## Columns

| Class | Element | Description |
|---|---|---|
| `.cols` | `<div>` | Grid wrapper, owned by common.css: equal auto-fit columns at least `--orz-col-min` wide, or the ratio arguments as an inline `grid-template-columns`; one column below 640px. Themes set surfaces and `gap` (or `--orz-cols-gap`). |
| `.col` | `<div>` | Individual column cell. `:::col ... :::` |

---

## Arbitrary containers

| Selector | Element | Description |
|---|---|---|
| `div.<name>` | `<div data-orz-container="…">` | Any other `::: name args` becomes `<div class="name">`; the full info string is kept in `data-orz-container` for copy-as-Markdown. Unstyled unless your theme styles it. |

---

## Custom plugins

### YouTube embed

| Class | Element | Description |
|---|---|---|
| `.youtube-embed` | `<div data-url="…">` | 16:9 wrapper: common.css sizes it (`aspect-ratio`) and fills it with the iframe; in print (≥ 2.3.0) it prints `YouTube video: <data-url>` instead of the frame. Theme decorates only (background, border, radius). |
| `.youtube-embed-invalid` | `<p>` | A `{{youtube}}` body that is no video id (a playlist URL): its directive as text, with `data-md`. Unstyled by default. |

### Mermaid diagram

| Class | Element | Description |
|---|---|---|
| `.mermaid` | `<div>` | Contains raw Mermaid DSL. Mermaid.js replaces it with `<svg>` client-side. common.css centres it and caps the SVG width; themes add a panel if they like. |

### SMILES chemical structure

| Class | Element | Description |
|---|---|---|
| `.smiles-render` | `<div>` | Wrapper around the canvas. Centered by `common.css` structural rules. |
| `canvas[data-smiles]` | `<canvas>` | Drawing target. Width/height set as HTML attributes. SmilesDrawer draws here client-side. |

`common.css` handles it fully — centring, size cap, and a transparent, borderless surface. Themes leave it alone.

### QR code

| Class | Element | Description |
|---|---|---|
| `.qrcode` | `<span>` | Inline wrapper around the SVG (black modules on a white rect, no quiet zone). The theme **must** set `background: #fff`; common.css supplies the padding (4px standalone, 0.12em inline), which becomes the quiet zone. |
| `.qrcode.qrcode--standalone` | `<span>` | A code alone in its paragraph: drawn full size (6rem) by `common.css`. Without it, a code inside a sentence is drawn at text size (1.3em) and expands on tap; print draws both large enough to scan (2cm / 3cm). |
| `.qrcode__icon` | `<span>` | Expand icon shown on hover. Structural rules in `common.css`. (standalone codes only) |
| `.qrcode.is-expanded` | `<span>` | Added while expanded. `common.css` hides the source with `visibility: hidden`. |
| `.qrcode-overlay` | `<span>` (cloned) | Fixed-position overlay appended to `<body>`. Geometry and backdrop come from `common.css` (`!important`); themes leave it alone. |

```css
.markdown-body span.qrcode { background: #fff; }
```

### Span (inline color / badge)

| Selector | Description |
|---|---|
| `span.red` | Color only — set `color: var(--span-red)` |
| `span.yellow` | Color only — set `color: var(--span-yellow)` |
| `span.green` | Color only — set `color: var(--span-green)` |
| `span.blue` | Color only — set `color: var(--span-blue)` |
| `span.success` | Badge — background, text color, border matching success palette |
| `span.info` | Badge — background, text color, border matching info palette |
| `span.warning` | Badge — background, text color, border matching warning palette |
| `span.danger` | Badge — background, text color, border matching danger palette |

Note: `span.success/info/warning/danger` also have `display: inline-flex; align-items: center; line-height: 1; white-space: nowrap` set by `common.css`. Add `padding`, `border-radius`, `font-size`, and colors in the theme.

### Chart

| Class | Element | Description |
|---|---|---|
| `canvas.orz-chart` | `<canvas>` | Carries a Chart.js config as HTML-escaped JSON in `data-chart` (and a `data-md` breadcrumb). The host runtime reads `data-chart` and calls Chart.js. common.css caps its width. |

### Table of Contents

| Class | Element | Description |
|---|---|---|
| `.toc-list` | `<ul>` | The flat `<ul>` of heading links emitted by `{{toc}}`. Each `<li>` carries an inline `padding-left` for its depth. common.css removes the bullets. This is the **only** class the parser emits for the TOC. |

```css
.markdown-body .toc-list    { padding: ...; border: 1px solid var(--border); }
.markdown-body .toc-list li { margin-bottom: 0.25rem; }
.markdown-body .toc-list a  { text-decoration: none; color: var(--link); }
```

> Note: the parser does **not** emit a `<nav class="toc">` wrapper or a `.toc-wrapper`. `{{toc}}` produces a single `<ul class="toc-list">`. If your host wants a wrapper, add it around the rendered TOC yourself.

### Unresolved include (carrier preview and read view, ≥ 2.2.0)

| Class | Element | Description |
|---|---|---|
| `p.orz-include-missing` | `<p role="note">` | "Included file not available: part.md" in a `<small>`, with the directive in `data-md`. Emitted by the carrier kit's preview renderer (`renderMarkdownPreview`, option `missingIncludes: false` turns it off), not by `md.render`. common.css dims it and hides it in print. |

### Test elements (development only)

| Class | Element | Description |
|---|---|---|
| `.test-block` | `<div>` | Block debug output. Style as a visually distinct dev-only box. |
| `.test-inline` | `<span>` | Inline debug output. |
