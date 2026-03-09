# Themes — CSS Class Reference

This document lists every CSS class and structural HTML element emitted by
`markdown-it-customize`. Use it as a spec when writing a new theme.

---

## Article wrapper

| Selector | Source |
|----------|--------|
| `.markdown-body` | The `<article>` element wrapping all rendered content in `scripts/render.ts`. Every theme should scope its styles under this class. |

---

## Standard markdown elements

Standard elements do not carry plugin-specific classes. Style them by tag name
(optionally scoped under `.markdown-body`).

| Element | Notes |
|---------|-------|
| `h1` – `h6` | Headings. `markdown-it-anchor` adds an `id` attribute and injects a child `<a class="header-anchor">` link. |
| `p` | Paragraph. |
| `a` | Hyperlink. |
| `strong`, `em` | Bold / italic. |
| `s`, `del` | Strikethrough. |
| `mark` | Highlighted text (`==text==` via `markdown-it-mark`). |
| `ins` | Inserted text (`++text++` via `markdown-it-ins`). |
| `sub`, `sup` | Subscript / superscript via `markdown-it-sub` / `markdown-it-sup`. |
| `code` | Inline code. |
| `pre > code` | Fenced code block. `hljs` adds language-specific token classes when Highlight.js is used. |
| `blockquote` | Block quote. |
| `ul`, `ol`, `li` | Unordered / ordered lists. |
| `table`, `thead`, `tbody`, `tr`, `th`, `td` | GFM table. |
| `hr` | Horizontal rule. |
| `img` | Image. |

---

## markdown-it-anchor

Injected inside every heading tag.

| Class | Element | Description |
|-------|---------|-------------|
| `.header-anchor` | `<a>` | Permalink anchor prepended inside each heading. Usually hidden until the heading is hovered. |

---

## markdown-it-task-lists

| Class | Element | Description |
|-------|---------|-------------|
| `.task-list-item` | `<li>` | A list item that begins with `[ ]` or `[x]`. |
| `.task-list-item-checkbox` | `<input type="checkbox">` | The checkbox rendered inside the task item. |

---

## markdown-it-footnote

| Class | Element | Description |
|-------|---------|-------------|
| `.footnote-ref` | `<sup><a>` | Inline superscript reference to a footnote (`[^1]`). |
| `.footnotes` | `<section>` | Container for all footnote definitions, rendered at the bottom of the document. |
| `.footnotes-sep` | `<hr>` | Horizontal rule separating the body from the footnotes section. |
| `.footnote-backref` | `<a>` | Back-link from each footnote definition to its in-text reference. |

---

## KaTeX (`@traptitech/markdown-it-katex`)

KaTeX generates its own internal class tree. The classes below are the main
styling targets.

| Class | Element | Description |
|-------|---------|-------------|
| `.katex` | `<span>` | Wrapper for every inline math expression (`$...$`). |
| `.katex-display` | `<span>` | Wrapper for display (block) math (`$$...$$`). |
| `.katex-error` | `<span>` | Rendered when KaTeX cannot parse the expression. |

---

## Containers (markdown-it-container)

All containers use `::: name` … `:::` syntax in the source.

### Semantic colour boxes

| Class | Element | Description |
|-------|---------|-------------|
| `.success` | `<div>` | Green success callout. `:::success ... :::` |
| `.info` | `<div>` | Blue info callout. `:::info ... :::` |
| `.warning` | `<div>` | Amber warning callout. `:::warning ... :::` |
| `.danger` | `<div>` | Red danger callout. `:::danger ... :::` |

### Layout containers

| Class | Element | Description |
|-------|---------|-------------|
| `.left` | `<div>` | Float-left wrapper. `:::left ... :::` |
| `.right` | `<div>` | Float-right wrapper. `:::right ... :::` |
| `.center` | `<div>` | Centred wrapper. `:::center ... :::` |

### Spoiler

| Class / Attribute | Element | Description |
|-------------------|---------|-------------|
| `details.spoil` | `<details>` | Collapsible spoiler. `:::spoil My Title ... :::` |
| `details.spoil > summary` | `<summary>` | The visible toggle label (styled `::before` arrow in themes). |

### Tabs

| Class / Attribute | Element | Description |
|-------------------|---------|-------------|
| `.tabs` | `<div>` | Outer wrapper. `:::: tabs ... ::::` |
| `.tab` | `<div>` | Individual tab panel. `::: tab Label ... :::` |
| `[data-label]` | attribute on `.tab` | The label text used by the tab-bar JS to build each button. |
| `.tabs-bar` | `<div>` | Tab button bar injected by the client-side JS initialiser. Present only after JS runs. |
| `.tabs-bar-btn` | `<button>` | Individual tab button inside `.tabs-bar`. |
| `.tabs-bar-btn.active` | `<button>` | The currently selected tab button. |
| `.tab.active` | `<div>` | The currently visible tab panel. |
| `.tabs[data-js]` | attribute on `.tabs` | Added by JS after initialisation. Use `.tabs:not([data-js]) .tab` to show all panels as a fallback when JS is absent. |

### Columns

| Class | Element | Description |
|-------|---------|-------------|
| `.cols` | `<div>` | CSS grid column wrapper. `:::cols ... :::` |
| `.col` | `<div>` | A single column cell. `:::col ... :::` |

---

## Custom plugins (`{{plugin args}} body {{/plugin}}`)

### YouTube embed

Alias: `youtube`, `yt`

| Class | Element | Description |
|-------|---------|-------------|
| `.youtube-embed` | `<div>` | Responsive 16:9 wrapper containing the `<iframe>`. |

```markdown
{{youtube}} https://youtu.be/dQw4w9WgXcQ {{/youtube}}
```

### Mermaid diagram

Alias: `mermaid`, `mm`

| Class | Element | Description |
|-------|---------|-------------|
| `.mermaid` | `<div>` | Contains the raw Mermaid DSL text. The Mermaid.js library replaces this client-side with an `<svg>`. |

```markdown
{{mermaid}}
graph LR
  A --> B
{{/mermaid}}
```

### SMILES chemical structure

Alias: `smiles`, `sm`

| Class | Element | Description |
|-------|---------|-------------|
| `.smiles-render` | `<div>` | Card wrapper around the canvas element. |
| `canvas[data-smiles]` | `<canvas>` | The target canvas. `width="250" height="180"` are set as HTML attributes. SmilesDrawer.js draws into this element client-side. |

```markdown
{{smiles}} CCO {{/smiles}}
```

### QR code

Alias: `qrcode`, `qr`

| Class | Element | Description |
|-------|---------|-------------|
| `.qrcode` | `<span>` | Inline wrapper around the generated `<svg>`. White padding is applied here so the SVG is readable on dark backgrounds. |

```markdown
{{qrcode}} https://example.com {{/qrcode}}
```

### Span (inline colour / badge)

Alias: `span`, `sp`

| Class | Element | Description |
|-------|---------|-------------|
| *(any)* | `<span>` | The first argument is used verbatim as the `class` attribute. Built-in colour and badge classes: `red`, `yellow`, `green`, `blue`, `success`, `info`, `warning`, `danger`. |

```markdown
{{sp red}}danger text{{/sp}}
{{sp success}}OK{{/sp}}
```

Colour classes (`span.red`, `span.yellow`, `span.green`, `span.blue`) and badge
classes (`span.success`, `span.info`, `span.warning`, `span.danger`) must be
styled explicitly in each theme.

### Table of Contents

Alias: `toc`

| Class | Element | Description |
|-------|---------|-------------|
| `.toc-wrapper` | `<div>` | Outer wrapper. |
| `.toc-list` | `<nav>` | The `<ul>` tree of heading links. |

```markdown
{{toc}} {{/toc}}
```

### Test block (development only)

| Class | Element | Description |
|-------|---------|-------------|
| `.test-block` | `<div>` | Block-level debug output. |
| `.test-inline` | `<span>` | Inline debug output. |

---

## Quick checklist for a new theme

When styling a new theme, ensure you have rules for each of the following:

- [ ] `.markdown-body` — outer container
- [ ] `h1` – `h6` and `.header-anchor`
- [ ] `p`, `a`, `strong`, `em`, `s`, `mark`, `ins`, `sub`, `sup`
- [ ] `code`, `pre > code`
- [ ] `blockquote`
- [ ] `ul`, `ol`, `li` (including custom bullet styles)
- [ ] `.task-list-item`, `.task-list-item-checkbox`
- [ ] `table`, `thead`, `tbody`, `th`, `td`
- [ ] `hr`, `img`
- [ ] `.footnotes`, `.footnote-ref`, `.footnotes-sep`, `.footnote-backref`
- [ ] `.katex`, `.katex-display`, `.katex-error`
- [ ] `.success`, `.info`, `.warning`, `.danger` (div + span variants)
- [ ] `.left`, `.right`, `.center`
- [ ] `details.spoil`, `details.spoil > summary`
- [ ] `.tabs`, `.tab`, `.tabs-bar`, `.tabs-bar-btn`, `.tabs-bar-btn.active`, `.tab.active`
- [ ] `.cols`, `.col`
- [ ] `.youtube-embed`
- [ ] `.mermaid`
- [ ] `.smiles-render`, `canvas[data-smiles]`
- [ ] `.qrcode`
- [ ] `span.red`, `span.yellow`, `span.green`, `span.blue`
- [ ] `span.success`, `span.info`, `span.warning`, `span.danger` (inline badge variants)
- [ ] `.toc-wrapper`, `.toc-list`

## Examples from another project

Get ideas from another of my project regarding the decorations:

https://github.com/wangyu16/theme-forger/tree/e741e2d2b28fb3d8948537cfa345b9772768cf49/themes/elements

and 

https://github.com/wangyu16/theme-forger/tree/e741e2d2b28fb3d8948537cfa345b9772768cf49/themes/decorations

Feel free to adapt from these stylesheets but do not be limited to them. Be creative to make more varieties of the styles. 