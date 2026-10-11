# Syntax Reference — orz-markdown

Complete syntax reference for all features. Covers standard markdown, official plugin extensions, containers, and all custom `{{...}}` plugins.

---

## Standard Markdown (CommonMark)

````markdown
# H1  ## H2  ### H3  #### H4  ##### H5  ###### H6

**bold**    *italic*    ***bold italic***
`inline code`
[link text](https://url.com)
[link with title](https://url.com "Title")
![alt text](image.png)
![alt text](image.png =400x200)    ← image sizing: width/height attributes
![alt text](image.png =400x)       ← either side may be omitted (=x200 too)

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

| Left | Center | Right |    ← GFM table; the second row sets alignment
|:-----|:------:|------:|
| a    |   b    |     c |

https://example.com  www.example.com   ← bare URLs become links (linkify)
````

`typographer` is on: `--` → –, `---` → —, `...` → …, `(c)` → ©, `"quotes"` → “quotes”. Write code spans for literal text.

---

## Extended Syntax (Official Plugins)

### Highlight, insert, strikethrough — `markdown-it-mark`, `markdown-it-ins`, markdown-it core

```markdown
==highlighted text==        → <mark>
++inserted text++           → <ins>
~~deleted text~~            → <s>
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
An inline footnote^[Its text is written in place.] needs no definition.

[^1]: First footnote text.
[^note]: Named footnote text.
```

All notes, inline and defined, share one numbered list at the end of the document.

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

Requires KaTeX CSS in the page head: `https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.css`

Macro definitions (`\def`, `\newcommand`, `\let`, …) are not supported in math, and a formula over 10,000 characters is not typeset: either renders as its source text. Write the expanded TeX instead. Per document, math past 1,000,000 characters of TeX, 100,000 characters inside `\ce{…}`/`\pu{…}`, or 64 MB of rendered KaTeX also renders as its source ("too much math in one document").

### Heading Anchors — `markdown-it-anchor`

Every heading automatically gets an `id` attribute (and `tabindex="-1"`, so in-page links can focus it). No permalink element is rendered. No special syntax — it's automatic.

---

## Containers — `::: name ... :::`

All containers use fenced colon syntax: `::: name` — write a space between `:::` and the name (conventional; `:::name` also parses). Nesting is supported: the outer container must use more fence-colons than the inner (e.g. `::::` outer, `:::` inner).

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

Renders `<div class="success|info|warning|danger">`. In most themes, the first `**bold**` in the first paragraph is styled with the callout's accent color.

### Layout containers

```markdown
::: left
Floats left. Text following in the source wraps on the right side.
:::

::: left 30%
Optional width argument sets both max-width and width.
A number with a CSS unit: px, em, rem, %, ch, ex, vw, vh, vmin, vmax, pt, pc, cm, mm, in.
:::

::: right
Right-aligns its content (text, images, tables) — e.g. a signature or date line.
:::

::: center
Centers its content in a column capped at 42rem.
:::
```

Width argument is only supported on `left`; anything that is not a number with a unit (`calc(…)`, `var(…)`) is ignored and the default cap applies. `right` and `center` have no argument.
`left` is the only floating container; `right` and `center` align. Alignment
works in every theme, including themes that justify body text. On screens
narrower than 640px a `left` box stops floating and takes the full width.

### Spoiler (collapsible)

```markdown
::: spoil Click to reveal
Hidden content shown when the summary is clicked.

Can contain any markdown content.
:::
```

The text after `::: spoil` becomes the `<summary>` label. Renders `<details class="spoil">`.

### Tabs

````markdown
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
````

Outer fence uses four colons `::::`. Inner tab panes use three `:::`. The text after `::: tab` is the button label (set as `data-label` attribute). JavaScript initializes the tab bar — without JS all panels fall back to block display. Print shows every pane, each after its label as a small heading (≥ 2.3.0; an unlabeled pane prints as "Tab N").

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
- **CSS track sizes** → pass through as-is: lengths (`30%`, `200px`, `1fr`), `auto`, `min-content`, `max-content`, `minmax(10rem, 1fr)`, `repeat(3, 1fr)`
- Forms can be mixed: `:::: cols 1fr 200px 2fr`
- Anything else (`calc(…)`, `var(…)`) makes the whole argument list ignored: equal auto-fit columns, as with no argument.

Below 640px every `cols` grid stacks into one column.

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

The unified plugin dispatch syntax. Each plugin is **one** type:

- **Block** — `youtube`, `mermaid`, `smiles`, `chart`, `toc`, `markdown`/`md`/`md-include`, `yaml`/`yml`, `nyml`. The directive must start a line; text after its closing `}}` becomes a new paragraph. Mid-sentence it renders as literal text.
- **Inline** — `span`/`sp`, `emoji`/`em`, `space`, `qr`/`qrcode`, `attrs`. Usable anywhere in a line.

Either type may be written on one line or across lines:

**One line:** `{{name[args] body}}`
**Multi-line:**
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

The argument (inside `[...]`) is used verbatim as the `class` attribute on a `<span>`, so several space-separated classes work (`{{sp[red success] …}}`). The body is inline Markdown (`**bold**`, `` `code` ``, math). Built-in color classes: `red`, `yellow`, `green`, `blue`. Built-in badge classes: `success`, `info`, `warning`, `danger`. Any custom class name works in your own documents — style it yourself; text fetched through a URL include may use only these eight.

---

### emoji / em — Unicode emoji from name

```markdown
{{emoji wave}}       → 👋
{{em smile}}         → 😄
{{emoji tada}}       → 🎉
{{em rocket}}        → 🚀
```

Uses `node-emoji` for name lookup. The emoji text alias (e.g., `wave`, `smile`) is resolved to the Unicode character at render time — no client-side library needed. An unknown name renders as its directive text (`{{emoji nosuchname}}`).

---

### space — Inline horizontal whitespace

```markdown
{{space 4}}    → 4rem-wide inline-block spacer
{{space 1}}    → 1rem-wide inline-block spacer
```

The numeric argument is a `rem` width: `{{space 4}}` emits `<span style="display:inline-block;width:4rem"></span>`. Decimals work (`{{space 1.5}}`); widths are capped at 100rem. Non-positive or non-numeric values render nothing.

---

### qrcode / qr — Inline QR code

```markdown
{{qr https://example.com}}
{{qrcode mailto:hello@example.com}}
```

Renders an SVG QR code inside `<span class="qrcode">`. A code inside a sentence is drawn at text size, so its line keeps the paragraph's spacing; a code alone in its paragraph (`class="qrcode qrcode--standalone"`) is drawn full size for scanning; print draws both large enough to scan. Clicking expands to a fullscreen overlay (requires the QR runtime script in the page). The SVG is black modules on a white rect with no quiet zone — themes set `background: #fff` on `span.qrcode` (common.css adds the padding: 4px standalone, 0.12em inside a sentence) so it scans on dark backgrounds. Content too long for a QR code, or any code past 8 MB of QR SVG in one document, renders as its `{{qr …}}` text.

---

### youtube / yt — Responsive YouTube embed

```markdown
{{youtube dQw4w9WgXcQ}}
{{yt https://youtu.be/dQw4w9WgXcQ}}
```

Accepts a bare video ID (optionally `ID?t=42`) or a full YouTube URL; a `t=`/`start=` time (`90`, `1m30s`) becomes the embed's start. A body that is not a video id (a playlist URL) renders as its directive text. Renders a `<div class="youtube-embed" data-url="https://youtu.be/<id>">` around the iframe; common.css makes it a responsive 16:9 box. In print (≥ 2.3.0) the embed prints its address as a line of text — `YouTube video: https://youtu.be/<id>` (with `?t=` when a start is set) — instead of a blank frame.

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

### chart — Chart (client-side rendered)

```markdown
{{chart
type: line
title: Quarterly results
labels: Q1, Q2, Q3, Q4
series: Revenue = 10, 14, 9, 17
series: Cost = 6, 7, 8, 9
}}

{{chart
type: pie
labels: A, B, C
data: 30, 50, 20
}}
```

One `key: value` per line. `type` is any Chart.js type (`bar`, `line`, `pie`, `doughnut`, `radar`, …; default `bar`); `title` is optional; `labels` are comma-separated. `data: …` is a single unnamed series (its legend is hidden); `series: Name = …` adds a named series and may repeat. A value that is not a number becomes a gap; unknown keys are ignored. Renders `<canvas class="orz-chart" data-chart="…">` with the Chart.js config as JSON; Chart.js draws it client-side (`window.__orzEnhance()`), so `chart.umd.min.js` must be in the page.

---

### toc — Table of contents

```markdown
{{toc}}
{{toc 2,3}}
{{toc 1,4}}
```

Auto-generates a `<ul class="toc-list">` of heading links (each `<li>` indented by depth). Optional argument is a comma-separated level range `min,max` — both bounds required (`{{toc 2}}` falls back to the default `1,3`). The placement in the source does not matter — a core rule scans the whole document, so `{{toc}}` works at the top or bottom, and headings from file includes are listed. Past 20,000 entries or ~8 MB of TOC output in one document, further TOCs render empty.

---

### attrs — Inject HTML attributes

```markdown
# My Section {{attrs[#hero]}}
# Another {{attrs[class="featured lead" data-x="y"]}}

A paragraph. {{attrs[.note hidden]}}
```

Sets attributes on the block whose text contains the marker (heading, paragraph, table cell, …). Forms: `#id`, `.class`, `key="value"`, bare `key` (empty value). A later value for the same key replaces an earlier one — `{{attrs[.a .b]}}` gives `class="b"`; write `class="a b"` for two classes. No effect inside a tight list item (its paragraph renders no tag).

---

### markdown / md — Embed external file

```markdown
{{md ./path/to/other.md}}
{{markdown ../shared/footer.md}}
```

Aliases `markdown`, `md`, `md-include`; a block directive. File access is **opt-in**: the include resolves only when the render env sets `markdownBasePath` (Node reads the file, path relative to it; Node ≥ 20.16) or `readFile(absPath) => string | null` — `md.render(source, { markdownBasePath, markdownIncludeRoot })`. With neither it renders nothing. `markdownIncludeRoot` refuses paths that resolve outside that directory (compared by real path, so a symlink cannot escape it). One level only: a directive inside an included file renders nothing. At most 5,000,000 included characters per render; past that, includes render nothing.

The file is spliced in at parse time, so it is part of the one document: its footnotes join the single footnote list, its headings get unique ids and appear in `{{toc}}`.

For URL includes (`{{md https://…}}`), run `prepareSources()` first — outside a browser it needs `allowedHosts` or a `fetcher` (see SKILL.md).

In a carrier's editor preview and read view (≥ 2.2.0) a file include that cannot be resolved shows a dimmed note instead of nothing — `<p class="orz-include-missing" role="note" data-md="{{md ./part.md}}"><small>Included file not available: part.md</small></p>` (hidden in print; the directive is kept for copy-as-Markdown). Plain `md.render` still renders nothing for it.

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

Emits `<script type="application/yaml">` with the raw YAML text. Invisible to the user. Read it back with `unescapeScriptText` from `orz-markdown/carrier`: `unescapeScriptText(document.querySelector('script[type="application/yaml"]').textContent)` — every `<script`/`</script` in the body is escaped reversibly so it cannot end the island.

---

### nyml — Invisible parsed metadata block

```markdown
{{nyml
title: My Document
count: 42
items:
  - alpha
  - beta
notes: |
  line one
  line two
}}
```

Emitted as `<script type="application/json" id="nyml-data">` (later blocks: `nyml-data-2`, `nyml-data-3`, …). Invisible to the user. NYML is not YAML — the JSON root is a **list of single-key entries**, every value a **string**; indented lines under a key become a list of raw strings (a `- ` is kept), and `key: |` takes the indented lines as one multi-line string. The example gives:

```json
[
  { "title": "My Document" },
  { "count": "42" },
  { "items": ["- alpha", "- beta"] },
  { "notes": "line one\nline two\n" }
]
```

Read it with `JSON.parse(document.getElementById('nyml-data').textContent)`. If the body cannot be parsed, the island holds `{"error":"Failed to parse NYML"}`.

A block whose `kind` is `document` (`{{nyml\nkind: document\n…\n}}`) is the **document header** of text format 1 (≥ 2.1.0): it renders nothing and takes no `nyml-data` number; carriers read it for the document's metadata and settings. Write it first in the file, `kind: document` as its first key. See "Document header" in `SKILL.md` and [FC-18 §5](https://github.com/wangyu16/orz-markdown/blob/main/spec/FC-18-text-format-1.md).
