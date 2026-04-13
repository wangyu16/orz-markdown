# CSS Class Reference — orz-markdown

Every CSS class and structural HTML element emitted by the parser. Use this as the definitive spec when writing or auditing a theme. All selectors should be scoped under `.markdown-body` in theme files.

---

## Article wrapper

| Selector | Source | Notes |
|---|---|---|
| `.markdown-body` | `<article>` wrapping all rendered content | Every theme scopes its styles here |

---

## Standard markdown elements

No plugin-specific classes. Style by tag name scoped under `.markdown-body`.

| Element | Notes |
|---|---|
| `h1` – `h6` | Headings. `markdown-it-anchor` adds `id` and injects `<a class="header-anchor">` inside. |
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
| `img` | Image. `markdown-it-imsize` adds `width`/`height` attributes when `=WxH` syntax used. |

---

## markdown-it-anchor

| Class | Element | Description |
|---|---|---|
| `.header-anchor` | `<a>` | Permalink prepended inside each heading. Hide by default, show on heading hover. |

---

## markdown-it-task-lists

| Class | Element | Description |
|---|---|---|
| `.task-list-item` | `<li>` | List item beginning with `[ ]` or `[x]`. Remove default list-style. |
| `.task-list-item-checkbox` | `<input type="checkbox">` | Checkbox inside the task item. Usually `pointer-events: none`. |

---

## markdown-it-footnote

| Class | Element | Description |
|---|---|---|
| `.footnote-ref` | `<sup><a>` | Inline superscript reference (`[^1]`). |
| `.footnotes` | `<section>` | Container for all footnotes at page bottom. |
| `.footnotes-sep` | `<hr>` | Separator between body and footnotes section. |
| `.footnote-backref` | `<a>` | Back-link from definition to reference. |

---

## KaTeX

| Class | Element | Description |
|---|---|---|
| `.katex` | `<span>` | Wrapper for every inline math expression (`$...$`). |
| `.katex-display` | `<span>` | Wrapper for display block math (`$$...$$`). Add overflow-x for wide equations. |
| `.katex-error` | `<span>` | Shown when KaTeX cannot parse the expression. Style as a visible error (red, monospace). |

---

## Semantic callouts (`markdown-it-container`)

| Class | Element | Description |
|---|---|---|
| `.success` | `<div>` | Green success callout. `:::success ... :::` |
| `.info` | `<div>` | Blue info callout. `:::info ... :::` |
| `.warning` | `<div>` | Amber warning callout. `:::warning ... :::` |
| `.danger` | `<div>` | Red danger callout. `:::danger ... :::` |

Each has `> *:last-child { margin-bottom: 0 }` as a best practice.

---

## Layout containers

| Class | Element | Description |
|---|---|---|
| `.left` | `<div>` | Float-left wrapper. `:::left ... :::` Needs mobile unfloat breakpoint. |
| `.right` | `<div>` | Right-aligned wrapper. `:::right ... :::` |
| `.center` | `<div>` | Centred wrapper. `:::center ... :::` |

---

## Spoiler

| Selector | Element | Description |
|---|---|---|
| `details.spoil` | `<details>` | Collapsible spoiler block. `:::spoil My Title ... :::` |
| `details.spoil > summary` | `<summary>` | Toggle label. Hide `::webkit-details-marker`. Provide open/close marker via `::before`. |
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
| `.tab` | `<div>` | Individual tab panel. **Must be `display: none` by default.** |
| `.tab.active` | `<div>` | Currently visible panel. **Must be `display: block`.** |
| `.tabs:not([data-js]) .tab` | `<div>` | No-JS fallback: show all panels. **Must be `display: block`.** |

---

## Columns

| Class | Element | Description |
|---|---|---|
| `.cols` | `<div>` | CSS grid wrapper. `:::cols ... :::` Use `grid-template-columns: repeat(auto-fit, minmax(..., 1fr))`. |
| `.col` | `<div>` | Individual column cell. `:::col ... :::` |

---

## Custom plugins

### YouTube embed

| Class | Element | Description |
|---|---|---|
| `.youtube-embed` | `<div>` | 16:9 responsive wrapper. Use padding-bottom trick (`height:0; padding-bottom:56.25%`). |

```css
div.youtube-embed { position: relative; height: 0; padding-bottom: 56.25%; overflow: hidden; }
div.youtube-embed iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
```

### Mermaid diagram

| Class | Element | Description |
|---|---|---|
| `.mermaid` | `<div>` | Contains raw Mermaid DSL. Mermaid.js replaces it with `<svg>` client-side. |

```css
div.mermaid { overflow-x: auto; text-align: center; }
div.mermaid svg { max-width: 100%; height: auto; }
```

### SMILES chemical structure

| Class | Element | Description |
|---|---|---|
| `.smiles-render` | `<div>` | Wrapper around the canvas. Centered by `common.css` structural rules. |
| `canvas[data-smiles]` | `<canvas>` | Drawing target. Width/height set as HTML attributes. SmilesDrawer draws here client-side. |

The structural flex centering is already in `common.css`. Theme only needs background/border on `.smiles-render` (usually `background: transparent; border: none`).

### QR code

| Class | Element | Description |
|---|---|---|
| `.qrcode` | `<span>` | Inline wrapper around the SVG. **Must have `background: #fff; padding: 4px`** so the black SVG is readable on any background. |
| `.qrcode__icon` | `<span>` | Expand icon shown on hover. Structural rules in `common.css`. |
| `.qrcode.is-expanded` | `<span>` | Added while expanded. `common.css` hides the source with `visibility: hidden`. |
| `.qrcode-overlay` | `<span>` (cloned) | Fixed-position fullscreen overlay. All geometry handled by `common.css`. Theme can adjust `background`. |

```css
span.qrcode { background: #fff; padding: 4px; /* or 6px */ vertical-align: middle; }
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

### Table of Contents

| Class | Element | Description |
|---|---|---|
| `.toc-wrapper` | `<div>` | Outer wrapper (for positioning). |
| `nav.toc` / `.toc-list` | `<nav>` | The `<ul>` tree of heading links. Reset list bullets in TOC context. |

```css
nav.toc, .toc-list {
  padding: ...;
  border: 1px solid var(--border);
}
nav.toc ul, .toc-list ul { margin: 0; padding-left: 1.1rem; }
nav.toc li, .toc-list li { list-style: none; margin-bottom: 0.25rem; }
nav.toc a, .toc-list a { text-decoration: none; color: var(--link); }
```

### Test elements (development only)

| Class | Element | Description |
|---|---|---|
| `.test-block` | `<div>` | Block debug output. Style as a visually distinct dev-only box. |
| `.test-inline` | `<span>` | Inline debug output. |
