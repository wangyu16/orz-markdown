# Embedding orz-markdown in a host app (custom stylesheet)

Read this when you call `md.render()` and supply **your own CSS and page shell**
instead of using a bundled theme — e.g. a slide engine, a doc viewer, an editor,
or any app that embeds rendered output. The bundled themes already do everything
below; this guide is the checklist for when you *don't* use them.

> The sibling `orz-slides` project hit a long tail of bugs (unstyled containers,
> bold that changed colour instead of weight, broken sub/sup, diagrams
> overflowing, copy losing `{{sp}}`/`:::` source) precisely because these points
> weren't gathered in one place. Follow this and you skip all of it.

There are **three** things to get right: CSS, JavaScript, and copy-as-Markdown.

> **Shortcut for iframe hosts — `getPreviewFrameAssets()`.** Most of the
> JavaScript below is the same everywhere, so it lives in one helper:
>
> ```js
> import { getPreviewFrameAssets } from 'orz-markdown/preview-frame';
> const pa = getPreviewFrameAssets();
> ```
>
> It returns the pinned CDN URLs (`pa.cdn`), the runtime (`pa.runtimeScript`), and
> ready-made strings: `pa.headLinks(scheme)` (KaTeX + highlight.js CSS, the hljs
> link carries `id="orz-hljs"`) for the iframe `<head>`, and `pa.bodyScripts()`
> (loads the libs + runtime and defines `window.__orzEnhance()`) for the `<body>`.
> After each render call `window.__orzEnhance()` — it highlights code, runs
> mermaid, draws SMILES (honoring `window.__orzSmilesTheme`) and charts, and
> re-inits the runtime (tabs + QR). On theme change swap
> `doc.getElementById('orz-hljs').href = pa.hljsCss(scheme)`. `__orzEnhance`
> scopes to `.markdown-body`, so it works whatever id/wrapper you use. The rest of
> this page is what that helper does under the hood — read it if you hand-roll the
> wiring or need to understand a failure.

---

## 1. CSS

The parser emits plain HTML plus plugin/container classes. Two reference docs
have the full detail:

- `references/css-classes.md` — every class and element the parser emits.
- `references/themes.md` — the element checklist and design guidance.

When you bring your own stylesheet, the four things that bite hardest:

### 1a. Wrap output in `.markdown-body` and scope your rules to it

```html
<article class="markdown-body"> …md.render() output… </article>
```
Every theme rule is scoped under `.markdown-body`; copy-as-Markdown also keys off
this class (§3). For a region-based layout, each rendered region gets its own
`.markdown-body`.

### 1b. A host CSS *reset* will strip inline semantics — restore them

This is the #1 non-obvious failure. Many app/framework resets (notably
**reveal.js**'s `reset.css`) apply to `strong, b, em, i, sub, sup, small, …`:

```css
em, strong, sub, sup, b, i, small, … { font: inherit; font-size: 100%; vertical-align: baseline; }
```

`font: inherit` wipes `font-weight`/`font-style`, and `vertical-align: baseline`
+ `font-size: 100%` flattens sub/sup. The result: **bold isn't bold, italic
isn't italic, H~2~O / x^2^ render flat.** (A theme that "fixed" bold with
`strong { color: accent }` then makes bold *vanish* wherever the accent equals
the background.) If your host has any such reset, restore the semantics
explicitly — **bold is weight, not colour**:

```css
.markdown-body strong, .markdown-body b { font-weight: 700; }
.markdown-body em, .markdown-body i     { font-style: italic; }
.markdown-body s,  .markdown-body del   { text-decoration: line-through; }
.markdown-body ins,.markdown-body u     { text-decoration: underline; }
.markdown-body sub, .markdown-body sup  { font-size: 0.75em; line-height: 0; position: relative; vertical-align: baseline; }
.markdown-body sub { bottom: -0.3em; }
.markdown-body sup { top: -0.5em; }
```

### 1c. Style **every** plugin/container class, or it renders unstyled

If you don't ship the bundled `common.css`/theme, these have **no** styling and
look broken. Minimum set (see `css-classes.md` for the exact selectors):

| Construct | Selectors to style |
|---|---|
| Admonitions | `div.info`, `div.success`, `div.warning`, `div.danger` |
| Spans — colour | `span.red`, `span.green`, `span.blue`, `span.yellow` (colour only) |
| Spans — badge | `span.success/info/warning/danger` — **need** `display:inline-flex; align-items:center; line-height:1; white-space:nowrap` + padding/radius (normally in `common.css`) |
| Columns | `.cols` (CSS grid), `.col` |
| Tabs | `.tabs`, `.tabs-bar`, `.tabs-bar-btn`(`.active`), `.tab`; **`.tabs:not([data-js]) .tab { display:block }`** (no-JS fallback) and `.tabs[data-js] .tab{display:none}` / `.tab.active{display:block}` |
| Spoiler | `details.spoil`, `summary` |
| Alignment | `div.left`, `div.center`, `div.right` (`text-align`) |
| QR | `span.qrcode` — **must** have `background:#fff; padding` (the SVG is black-on-transparent) |
| YouTube | `.youtube-embed` — the iframe has **no width/height**; make it a 16:9 responsive box or it defaults to 300×150 |
| Math | `.katex`, `.katex-display` (load `katex.min.css`) |
| Diagrams/chem | `.mermaid svg`, `.smiles-render canvas` / `canvas[data-smiles]` |

### 1d. Constrain generated graphics so they fit

Mermaid SVGs and smiles/chart canvases have intrinsic sizes and will overflow a
bounded container. At minimum cap the width; in a fixed-size layout (slides),
size them to the container in JS (measure the container, set explicit
width/height by the SVG's `viewBox` aspect; for Chart.js use `responsive:false`
+ explicit `resize(w,h)` because it can't read a definite height through a CSS
grid). Mermaid also sets an inline `max-width` you may need to override.

```css
.markdown-body .mermaid svg,
.markdown-body canvas[data-smiles],
.markdown-body canvas.orz-chart { max-width: 100%; height: auto; }
```

---

## 2. JavaScript

Rendering is pure HTML, but several constructs need client-side JS **after mount**.

### 2a. Load the runtime — tabs, QR expand, and copy

```js
import { getBrowserRuntimeScript } from 'orz-markdown/runtime';
const s = document.createElement('script');
s.textContent = getBrowserRuntimeScript();
document.body.appendChild(s);
```

It auto-runs `OrzMarkdownRuntime.init(document)` **once** on `DOMContentLoaded`
and wires the global copy handler. It exposes
`OrzMarkdownRuntime.{ init, initTabs, initQrCodes, elementToMarkdown }`.

**If you render content dynamically** (after load, or re-render — e.g. an editor
or a slide engine), the one-time `init` won't see it. Call
`OrzMarkdownRuntime.init(newRoot)` (or `initTabs`/`initQrCodes`) on the new
content yourself. `initTabs` guards on `data-js="1"` — if you also have your own
tab init, use the **same** `data-js="1"` marker so the two don't both build a bar
(double tab bar bug).

### 2b. The runtime does **not** draw diagrams/charts — you do

mermaid, smiles, and chart canvases are placeholders. Load the libraries and draw
them (the bundled themes/`tests/example.html` show the calls):

| Construct | You must load | Then |
|---|---|---|
| `.mermaid` | mermaid.js | `mermaid.run({ querySelector: '.mermaid' })` |
| `canvas[data-smiles]` | smiles-drawer | `SmilesDrawer.parse(...)` → `drawer.draw(tree, canvas, scheme, false)` — pass `'dark'` on dark backgrounds so bonds are light |
| `canvas.orz-chart` | Chart.js | `new Chart(canvas, JSON.parse(canvas.dataset.chart))` |
| `$…$` / `$$…$$` | KaTeX **CSS** only | math is pre-rendered by `md.render()`; you just need `katex.min.css` |

Draw on first display and re-draw when the container resizes; canvases drawn
while their container is hidden (`display:none`) size to 0.

---

## 3. Copy-as-Markdown

Selecting rendered content and copying yields **Markdown source** when (and only
when) all of this holds:

1. **The runtime is loaded** (§2a) — it installs the `copy` handler and the
   DOM→Markdown walker (`elementToMarkdown`).
2. **Content is inside `.markdown-body`** (or an element with `data-orz-copy`).
   The handler ignores selections elsewhere and inside inputs/textareas.
3. **`data-md` breadcrumbs are preserved.** Generated constructs whose source is
   otherwise lost — `mermaid`, `smiles`, `qrcode`, `youtube`, `chart` (and any
   plugin that adds one) — carry `data-md` with their original directive. The
   walker emits it verbatim. **Never strip `data-md`** when you post-process HTML.
4. **Plugin/container classes are preserved.** Constructs without a `data-md`
   are recovered *by class/structure*: `<span class="red">` → `{{sp[red] …}}`,
   `<div class="center">` → `::: center … :::`, nested `cols`/`tabs` get the
   right fence length, and a `{{toc}}` is recovered as its rendered list of
   heading links (not the `{{toc}}` directive). If you rewrite/strip these
   classes, copy loses the source.

Caveat: a container (`::: center`, `:::: cols`, spoiler, tabs) is recovered only
when the **selection includes the container element**, not just the text inside
it — select the whole block/region, not the inner words.

Convert a node directly: `OrzMarkdownRuntime.elementToMarkdown(node)`.

---

## Pre-flight checklist

- [ ] Output wrapped in `.markdown-body`; rules scoped under it.
- [ ] Inline semantics restored if a host reset touches `strong/em/sub/sup/…` (§1b).
- [ ] Every admonition / span / cols / tabs / spoil / align / qr / youtube / math / diagram class is styled (§1c, `css-classes.md`).
- [ ] Span badges have the inline-flex structural CSS; QR has a white plate; tabs have the no-JS fallback; YouTube is a 16:9 box.
- [ ] Graphics are width-capped (and size-fitted in fixed layouts) (§1d).
- [ ] Runtime loaded; `init` re-run on dynamically rendered content; tab `data-js="1"` aligned (§2a).
- [ ] mermaid / smiles-drawer / Chart.js loaded and drawn; KaTeX CSS loaded (§2b).
- [ ] `data-md` and plugin/container classes preserved end-to-end for copy (§3).
