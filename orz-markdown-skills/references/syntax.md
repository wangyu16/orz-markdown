# Syntax Reference — @orz-how/markdown-parser

Complete syntax reference for all features. Covers standard markdown, official plugin extensions, containers, and all custom `{{...}}` plugins.

---

## Standard Markdown (CommonMark)

```markdown
# H1  ## H2  ### H3  #### H4  ##### H5  ###### H6

**bold**    *italic*    ***bold italic***
`inline code`
[link text](https://url.com)
[link with title](https://url.com "Title")
![alt text](image.png)
![alt text](image.png =400x200)    ← image sizing (markdown-it-imsize)

> blockquote
> > nested blockquote

- unordered item
* also unordered
1. ordered item
2. second item

---   (horizontal rule — also *** or ___)

    indented code block

```language
fenced code block
```
```

---

## Extended Syntax (Official Plugins)

### Highlighting, Insert, Delete — `markdown-it-mark`, `markdown-it-ins`

```markdown
==highlighted text==        → <mark>
++inserted text++           → <ins>
~~deleted text~~            → <s> (also ~~strikethrough~~)
```

### Sub / Superscript — `markdown-it-sub`, `markdown-it-sup`

```markdown
H~2~O                       → H₂O  (subscript)
E = mc^2^                   → E = mc² (superscript)
```

### Task Lists — `markdown-it-task-lists`

```markdown
- [x] Completed task
- [ ] Uncompleted task
- [x] Another done item
```

Renders `<li class="task-list-item">` with `<input type="checkbox" class="task-list-item-checkbox">`.

### Footnotes — `markdown-it-footnote`

```markdown
Here is a footnote reference[^1] and another[^note].

[^1]: First footnote text.
[^note]: Named footnote text.
```

### KaTeX Math — `@traptitech/markdown-it-katex`

```markdown
Inline math: $E = mc^2$

Display (block) math:
$$
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
$$

mhchem chemistry (built-in extension):
$\ce{H2O}$
$\ce{Fe^{2+} + 2e- -> Fe}$
```

Requires KaTeX CSS in the page head: `https://cdn.jsdelivr.net/npm/katex@0.16.35/dist/katex.min.css`

### Heading Anchors — `markdown-it-anchor`

Every heading automatically gets an `id` attribute and a `<a class="header-anchor">` permalink prepended inside it. No special syntax — it's automatic.

---

## Containers — `::: name ... :::`

All containers use fenced colon syntax: `::: name` — **the space between `:::` and the name is required** (`:::name` without a space does not parse). Nesting is supported: the outer container must use more fence-colons than the inner (e.g. `::::` outer, `:::` inner).

### Semantic callouts

```markdown
::: success
**Success!** The operation completed without errors.
:::

::: info
**Note:** Here is some important information.
:::

::: warning
**Warning:** This action cannot be undone.
:::

::: danger
**Error:** Authentication failed.
:::
```

Renders `<div class="success|info|warning|danger">`. In themes, the first `**bold**` in the first paragraph is styled with the callout's accent color.

### Layout containers

```markdown
::: left
Floats left. Text following in the source wraps on the right side.
:::

::: left 30%
Optional width argument sets both max-width and width.
Accepts any CSS length: %, px, em, rem, vw.
:::

::: right
Floats right.
:::

::: center
Centers horizontally (max 42rem).
:::
```

Width argument is only supported on `left`. `right` and `center` have no argument.

### Spoiler (collapsible)

```markdown
::: spoil Click to reveal
Hidden content shown when the summary is clicked.

Can contain any markdown content.
:::
```

The text after `::: spoil` becomes the `<summary>` label. Renders `<details class="spoil">`.

### Tabs

```markdown
:::: tabs
::: tab JavaScript
```js
console.log("Hello");
```
:::
::: tab Python
```python
print("Hello")
```
:::
::::
```

Outer fence uses four colons `::::`. Inner tab panes use three `:::`. The text after `::: tab` is the button label (set as `data-label` attribute). JavaScript initializes the tab bar — without JS all panels fall back to block display.

### Columns

```markdown
:::: cols
::: col
Equal-width column one.
:::
::: col
Equal-width column two.
:::
::::
```

Without arguments, all `col` children share equal width. Pass space-separated values to set column widths:

- **Plain numbers** → become `fr` units: `:::: cols 1 2` → `grid-template-columns: 1fr 2fr`
- **CSS lengths** → pass through as-is: `:::: cols 30% 70%` → `grid-template-columns: 30% 70%`
- Both forms can be mixed: `:::: cols 1fr 200px 2fr`

```markdown
:::: cols 1 2 1
::: col
One quarter.
:::
::: col
Two quarters.
:::
::: col
One quarter.
:::
::::
```

The number of values should match the number of `col` children, but mismatches are handled by CSS grid rules.

### Nesting containers

Each nesting level requires an additional colon. The outermost container uses the most colons; each layer inside uses one fewer:

```markdown
:::: info
Outer info box.

::: warning
Nested warning inside the info box.
:::

Back to info content.
::::
```

Three levels deep:

```markdown
::::: outer-class
:::: cols
::: col
Column A content.
:::
::: col
Column B content.
:::
::::
:::::
```

### Arbitrary class name

Any `::: name` that is not a reserved keyword becomes `<div class="name">`:

```markdown
::: my-card
Content inside a div with class="my-card".
:::

::: highlight-box
Use your own CSS to style arbitrary containers.
:::
```

---

## Custom Plugins — `{{name[args] body}}`

The unified plugin dispatch syntax. Both block and inline forms are supported.

**Inline:** `{{name[args] body}}`
**Block (multi-line):**
```
{{name[args]
body content
spanning lines
}}
```

**Aliases:** most plugins have a short alias (e.g., `sp` = `span`, `yt` = `youtube`).
**Escaping:** `\{{name}}` renders as literal `{{name}}`.

---

### span / sp — Inline colored or styled text

```markdown
{{sp[red] red text}}
{{sp[yellow] amber text}}
{{sp[green] green text}}
{{sp[blue] blue text}}

{{sp[success] ✓ Done}}
{{sp[info] ℹ Note}}
{{sp[warning] ⚠ Caution}}
{{sp[danger] ✗ Error}}

{{span[my-custom-class] any class name works}}
```

The first argument (inside `[...]`) is used verbatim as the `class` attribute on a `<span>`. Built-in color classes: `red`, `yellow`, `green`, `blue`. Built-in badge classes: `success`, `info`, `warning`, `danger`. Any custom class name works — style it yourself in your theme.

---

### emoji / em — Unicode emoji from name

```markdown
{{emoji wave}}       → 👋
{{em smile}}         → 😊
{{emoji tada}}       → 🎉
{{em rocket}}        → 🚀
```

Uses `node-emoji` for name lookup. The emoji text alias (e.g., `wave`, `smile`) is resolved to the Unicode character at render time — no client-side library needed.

---

### space — Inline horizontal whitespace

```markdown
{{space 4}}    → &nbsp;&nbsp;&nbsp;&nbsp; (4 non-breaking spaces)
{{space 1}}    → &nbsp;
```

---

### qrcode / qr — Inline QR code

```markdown
{{qr https://example.com}}
{{qrcode mailto:hello@example.com}}
```

Renders an inline SVG QR code inside `<span class="qrcode">`. The inline version is small; clicking it expands to a fullscreen overlay (requires the QR runtime script in the page). Requires a white background on the span — themes must set `background: #fff` on `.qrcode` so the SVG is readable on dark backgrounds.

---

### youtube / yt — Responsive YouTube embed

```markdown
{{youtube dQw4w9WgXcQ}}
{{yt https://youtu.be/dQw4w9WgXcQ}}
```

Accepts a bare video ID or a full YouTube URL. Renders a `<div class="youtube-embed">` with a 16:9 padding-bottom responsive iframe wrapper. Iframes are never shown in print.

---

### mermaid / mm — Diagram (client-side rendered)

```markdown
{{mermaid
graph LR
  A[Start] --> B{Decision}
  B -->|Yes| C[Result]
  B -->|No|  D[Other]
}}

{{mm
sequenceDiagram
  Alice->>Bob: Hello Bob
  Bob-->>Alice: Hi Alice
}}
```

Renders `<div class="mermaid">` containing the raw DSL text. Mermaid.js runs client-side and replaces the div with an SVG. Requires `mermaid.min.js` in the page. Supports all Mermaid diagram types: `graph`, `sequenceDiagram`, `flowchart`, `classDiagram`, `gantt`, `pie`, etc.

---

### smiles / sm — Chemical structure (client-side rendered)

```markdown
{{smiles CCO}}
{{sm C1=CC=CC=C1}}
{{smiles
[Cu+2].[O-]S(=O)(=O)[O-]
}}
```

Renders `<div class="smiles-render"><canvas data-smiles="...">`. SmilesDrawer.js draws into the canvas element client-side. Requires `smiles-drawer.min.js` in the page. Pass SMILES notation strings — any valid SMILES formula works.

---

### toc — Table of contents

```markdown
{{toc}}
{{toc 2,3}}
{{toc 1,4}}
```

Auto-generates a `<nav class="toc">` from all headings in the document. Optional argument is a comma-separated level range (`min,max`), defaulting to all levels. Must appear after the headings it references in the source (or at the start — the parser makes a pass over the full document).

---

### attrs — Inject HTML attributes

```markdown
# My Section {{attrs[id="hero"]}}
# Another {{attrs[class="featured" data-x="y"]}}

A paragraph. {{attrs[style="color:red"]}}
```

Injects any HTML attributes onto the immediately preceding token (heading, paragraph, etc.). Accepts any valid HTML attribute syntax inside `[...]`.

---

### markdown / md — Embed external file

```markdown
{{md ./path/to/other.md}}
{{markdown ../shared/footer.md}}
```

Reads and inlines the content of a local markdown file at render time. Path is resolved relative to `markdownBasePath` (passed as the second argument to `md.render(source, { markdownBasePath })`). For remote URL includes, pre-process with `prepareSources()` first.

---

### yaml / yml — Invisible YAML metadata block

```markdown
{{yaml
title: My Document
author: Alice
tags: [markdown, tutorial]
created: 2025-01-01
}}
```

Emits `<script type="application/yaml">` with the raw YAML text. Invisible to the user. Accessible via JavaScript: `document.querySelector('script[type="application/yaml"]').textContent`.

---

### nyml — Invisible parsed metadata block

```markdown
{{nyml
title: My Document
count: 42
items:
  - alpha
  - beta
}}
```

Parsed using the NYML key-value syntax and emitted as `<script type="application/json">`. Invisible to the user. Accessible via: `JSON.parse(document.querySelector('script[type="application/json"]').textContent)`.
