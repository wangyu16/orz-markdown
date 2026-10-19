# Embedding orz-markdown in a host app (custom stylesheet)

Read this when you call `md.render()` and supply **your own CSS and page shell**
instead of using a bundled theme — e.g. a slide engine, a doc viewer, an editor,
or any app that embeds rendered output. The bundled themes already do everything
below; this guide is the checklist for when you *don't* use them.

> The sibling `orz-slides` project hit a long tail of bugs (unstyled containers,
> bold that changed colour instead of weight, broken sub/sup, diagrams
> overflowing, copy losing `{{sp}}`/`:::` source) precisely because these points
> weren't gathered in one place. Follow this and you skip all of it.

There are **three** things to get right: CSS, JavaScript, and copy-as-Markdown
(and, when you embed a carrier's editor, print and the preview: §4).

> **Bundling and versions (≥ 2.0.0).** orz-markdown bundles for the browser
> with no `fs`/`path`/`process` shims — delete any you carried. Read the
> version you embed from `orz-markdown/version` (`VERSION`, `KATEX_VERSION`)
> instead of `package.json`, and take CDN URLs from `PREVIEW_CDN` rather than
> copying them, so a rebuild picks up every pinned-version change. If your app
> writes Markdown into a `<script>` source island, use `escapeScriptText` /
> `unescapeScriptText` from `orz-markdown/carrier` (reversible, and covers
> `<script` as well as `</script`); for JSON islands use `jsonForScript`.

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
>
> **Rendering in the page itself (no iframe) — `enhanceDocument()`** (≥ 2.2.0).
> After `article.innerHTML = md.render(src)` call
> `await enhanceDocument(article, { scheme })` (from `orz-markdown/preview-frame`):
> it loads only the libraries the content needs (highlight.js, Mermaid, SMILES,
> Chart.js, KaTeX's and highlight.js's stylesheets) from the same pinned URLs,
> installs the runtime once (copy-as-Markdown, tabs, QR) and is idempotent —
> call it again after every render (each call destroys the Chart.js charts of
> the content it replaced; `disposeEnhancement(article)` releases the rest when
> the view goes). `nonce` stamps what it adds (CSP); `assets: false` fetches
> nothing; `static: true` (≥ 2.3.0, for print or a paginator that re-parses the
> HTML) draws everything, then turns the drawn charts and SMILES canvases into
> images and skips the interactive runtime. Both `enhanceDocument` and
`__orzEnhance` also keep the article on its theme's baseline grid (≥ 2.3.0:
only where the theme sets `--orz-grid`, i.e. `light-playful-1` on screen —
the ruled notebook; `grid: false` turns it off, `static` skips it; it re-aligns
on resize and font loads and steps aside while printing). ≥ 2.4.0 both also theme
> Chart.js and Mermaid from CSS custom properties (`--chart-*`, `--mm-*`, see
> `references/themes.md`; a chart's or diagram's own colours win), and draw a
> chart or SMILES drawing only when it is visible: one in a hidden container
> (`display: none`, a closed `details`, `visibility: hidden`) waits, and is
> drawn when it gets a size, on the next `enhanceDocument` call, or by
> `redrawEnhancement(container)` — call that when you show a container
> (a slide, a tab, a dialog); it also resizes drawn charts and redraws SMILES at
> their box's size (`window.__orzRedraw(container)` in the preview frame).
> Mermaid diagrams wait the same way while not laid out (`display: none`, a
> closed `details`; `visibility: hidden` is laid out and drawn at once), and
> under a scaling CSS transform (a scaled slide) are drawn with SVG labels
> (`--mm-labels: svg | html` to choose); font sizes: `--chart-font-size`,
> `--mm-font-size`.
> SMILES canvases are drawn at the size of their CSS box (250×180 when nothing
> constrains them). To switch a theme stylesheet without a flash use
> `swapStylesheet(document, 'orz-theme', href)` (the old sheet stays until the
> new one has loaded). The theme list for a picker is `THEMES`
> (`orz-markdown/themes`: ids, names, light/dark).

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
| Spans — badge | `span.success/info/warning/danger` — **need** `display:inline-flex; align-items:center; line-height:1; white-space:nowrap` (from `common.css`) plus padding, radius and colours (the theme's) |
| Columns | `.cols` (CSS grid), `.col` |
| Tabs | `.tabs`, `.tabs-bar`, `.tabs-bar-btn`(`.active`), `.tab`; **`.tabs:not([data-js]) .tab { display:block }`** (no-JS fallback) and `.tabs[data-js] .tab{display:none}` / `.tab.active{display:block}` |
| Spoiler | `details.spoil`, `summary` |
| Alignment | `div.left` (float left + a width cap; unfloat below 640px), `div.center` / `div.right` (`text-align`, reaching justified paragraphs inside) |
| QR | `span.qrcode` — **must** have `background:#fff` and padding (the SVG has no quiet zone). Size it: a code alone in its paragraph carries `qrcode--standalone` (common.css: 6rem SVG, 4px padding); one inside a sentence is text size (1.3em SVG, 0.12em padding, `vertical-align:-0.3em`) and expands on tap; print 2cm / 3cm. |
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

It auto-runs `OrzMarkdownRuntime.init(document)` **once** — on `DOMContentLoaded`,
or at once if the document is already parsed — and wires the global copy
handler. It exposes
`OrzMarkdownRuntime.{ init, initTabs, initQrCodes, collapseQr, elementToMarkdown }`.
`getBrowserRuntimeScript({ autoInit: false })` skips the auto-`init` (copy still
works; tabs and QR stay as rendered) — for print masters such as orz-poster.

**If you render content dynamically** (after load, or re-render — e.g. an editor
or a slide engine), the one-time `init` won't see it. Call
`OrzMarkdownRuntime.init(newRoot)` (or `initTabs`/`initQrCodes`) on the new
content yourself. `initTabs` guards on `data-js="1"` — if you also have your own
tab init, use the **same** `data-js="1"` marker so the two don't both build a bar
(double tab bar bug).

### 2b. The runtime does **not** draw diagrams/charts — you do

mermaid, smiles, and chart canvases are placeholders. Load the libraries and draw
them (`assets/template.html` shows the calls; `getPreviewFrameAssets().bodyScripts()` does them for you):

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
   plugin that adds one) — carry `data-md` with their original directive, and
   so do `emoji`, `toc` (`{{toc 2,3}}`, not its list of links), `yaml`, `nyml`
   and footnote references (`[^note]` / `^[…]`). The walker emits it verbatim.
   **Never strip `data-md`** when you post-process HTML.
4. **Plugin/container classes and their breadcrumbs are preserved.**
   Constructs without a `data-md` are recovered *by class/structure*:
   `<span class="red">` → `{{sp[red] …}}`, `<div class="center">` →
   `::: center … :::`, nested `cols`/`tabs` get the right fence length. What
   the class alone cannot say rides in `data-orz-container` (cols ratios, the
   `left` width, the spoil label on its `<summary>`, a custom `::: name`'s
   arguments) and `data-footnote-label` (a named footnote definition). If you
   rewrite/strip these classes or attributes, copy loses the source.

A container (`::: center`, `:::: cols`, spoiler, tabs) is recovered when the
selection covers all of its text (or the element itself); a selection of only
some of the words inside copies just those words, without the container.

Convert a node's contents directly: `OrzMarkdownRuntime.elementToMarkdown(node)`
walks the node's **children**, not the node itself — to get a generated
construct's `{{…}}` back (a `.mermaid`, a `span.qrcode`, a `.toc-list`), pass
its parent; passed itself it yields its rendered contents (an SVG, links), and
a `::: info` box passed itself loses its fence.

---

## 4. Embedding a carrier's editor (FC-19): print and the preview

When your app mounts a carrier's editor (`mountEditor`, built on
`orz-markdown/carrier/editor`):

- **Print the document, not your page (≥ 2.3.0).** The reader's Cmd/Ctrl+P in
  the editor or its preview is the editor's `print` event. Without a listener
  the editor prints *your page* (the editor chrome). Listen and print the
  document instead:

  ```js
  import { printDocument } from 'orz-markdown/carrier/editor';
  editor.on('print', async () => {
    await printDocument(await carrier.assemble(editor.getText()), { nonce });
  });
  ```

  `printDocument(html)` puts the whole document in a hidden iframe sandboxed
  `allow-scripts allow-modals` (opaque origin: its scripts run — a paginator
  lays the pages out — but cannot reach your page), waits for the document's
  `window.__orzPrintReady` (a carrier's paginator sets it) and the fonts, and
  calls the frame's own `print()`. Never open a blob URL of the document in a
  tab to print it: it would run in your origin. Under a nonce CSP pass
  `nonce`, and give the frame a document whose scripts carry it (or none).
- **The preview frame** is sandboxed (`allow-scripts`, opaque origin), and
  only the reader's own keys and clicks — reported by the kit's bridge
  through a private, authenticated port — can save, print, switch views,
  open links or scroll the editor; the bridge captures every built-in it
  uses before the document runs, so a document script that overrides them
  gets nothing. That protects your app's actions, not the document: for
  content you do not trust, also use the nonce CSP (the recipe in FC-19 §8.4,
  `node_modules/orz-markdown/spec/FC-19-editor-component.md`: the `nonce`
  option, no `'unsafe-inline'` scripts), so the document's own scripts do not
  run at all. A **hash-based** policy instead allows the frame's own inline
  scripts by hash: `await previewScriptHashes(options)` lists every inline
  script of a frame built with those options (`PREVIEW_BRIDGE_HASH` is the
  bridge's alone), both from `orz-markdown/carrier/editor`.

---

## Pre-flight checklist

- [ ] Output wrapped in `.markdown-body`; rules scoped under it.
- [ ] Inline semantics restored if a host reset touches `strong/em/sub/sup/…` (§1b).
- [ ] Every admonition / span / cols / tabs / spoil / align / qr / youtube / math / diagram class is styled (§1c, `css-classes.md`).
- [ ] Span badges have the inline-flex structural CSS; QR has a white plate; tabs have the no-JS fallback; YouTube is a 16:9 box.
- [ ] Graphics are width-capped (and size-fitted in fixed layouts) (§1d).
- [ ] Runtime loaded; `init` re-run on dynamically rendered content; tab `data-js="1"` aligned (§2a).
- [ ] mermaid / smiles-drawer / Chart.js loaded and drawn; KaTeX CSS loaded (§2b).
- [ ] `data-md`, `data-orz-container`, `data-footnote-label` and plugin/container classes preserved end-to-end for copy (§3).
- [ ] An embedded editor's `print` event prints the document (`printDocument`), not the app page; untrusted content runs under the nonce CSP (§4).
