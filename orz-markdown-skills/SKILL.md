---
name: orz-markdown
description: "orz-markdown usage skill. Use this skill whenever you need to render markdown with this parser, write markdown that uses {{...}} custom plugin syntax (mermaid, qrcode, youtube, smiles, toc, span, emoji, attrs, space, yaml, nyml, or their aliases mm/qr/yt/sm/sp/em), use :::container syntax (success/info/warning/danger/spoil/tabs/tab/cols/col/left/right/center), set up a complete HTML page to display parser output, choose or import one of the 10 bundled CSS themes, or create a custom theme stylesheet. Also invoke when asked about .markdown-body class, prepareSources, browser runtime scripts for QR codes or tabs, or any KaTeX math syntax in this project. ALWAYS invoke before editing documents whose headings carry stable block IDs ({{attrs[#blk-...]}})."
compatibility:
  runtime: "Node.js 20+, ESM"
  package: "orz-markdown"
---

# orz-markdown

A deeply customized `markdown-it` instance with 10+ plugins, 9 official plugin bundles, and 10 ready-to-use CSS themes. All rendered HTML lives inside `<article class="markdown-body">`.

## Rendering (Node.js / ESM)

```javascript
import md from 'orz-markdown';

const html = md.render(markdownSource);
const page = `<article class="markdown-body">${html}</article>`;
```

Parser is configured with `html: true` — raw HTML in source is emitted verbatim. Sanitize untrusted content before rendering to avoid XSS.

### Remote URL includes

If the source contains `{{markdown https://...}}`:

```javascript
import md, { prepareSources } from 'orz-markdown';

const resolved = await prepareSources(markdownSource);
const html = md.render(resolved, { markdownBasePath: '/local/base/path' });
```

---

## HTML Page Requirements

Every page that displays parser output needs **all five** of these:

1. **Theme stylesheet** — one of the 10 bundled themes, or `assets/minimal.css`
2. **KaTeX CSS** — `https://cdn.jsdelivr.net/npm/katex@0.16.35/dist/katex.min.css`
3. **Highlight.js CSS** — match light/dark to the chosen theme
4. **Three CDN scripts** — Highlight.js, Mermaid.js, SmilesDrawer (loaded in body)
5. **Two inline scripts** — tabs initializer and QR code runtime (also in body)

**Use `assets/template.html`** — all CDN links, scripts, and the `.markdown-body` wrapper are pre-wired. Copy it and replace the `<!-- INSERT RENDERED HTML HERE -->` comment.

**Mounting output in an `<iframe>` (viewer / editor / slide or page engine)?** Call `getPreviewFrameAssets()` from `orz-markdown/preview-frame` — it returns the pinned CDN URLs, the runtime, `headLinks(scheme)` / `bodyScripts()` strings, and a `window.__orzEnhance()` that does all of items 3–5 (highlight code, draw mermaid/SMILES/charts, init tabs + QR). One call instead of re-deriving the wiring. See `references/embedding.md`.

CDN URLs (pinned versions):
| Library | URL |
|---|---|
| Highlight.js JS | `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js` |
| Highlight.js light CSS | `.../styles/github.min.css` (same base URL) |
| Highlight.js dark CSS | `.../styles/atom-one-dark.min.css` |
| Mermaid.js | `https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js` |
| SmilesDrawer | `https://unpkg.com/smiles-drawer@1.0.10/dist/smiles-drawer.min.js` |

### Browser runtime API

For programmatic control after mounting HTML dynamically:

```javascript
import { getBrowserRuntimeScript } from 'orz-markdown/runtime';
const script = document.createElement('script');
script.textContent = getBrowserRuntimeScript();
document.body.appendChild(script);
// or call directly: window.OrzMarkdownRuntime.init(rootElement)
```

The runtime also provides **copy-as-Markdown**: with it loaded, copying a selection inside `.markdown-body` puts Markdown source on the clipboard, not HTML (tables, lists, math, code, etc. are reconstructed). It skips selections inside `<input>`/`<textarea>`/`contenteditable`. Convert a node directly with `window.OrzMarkdownRuntime.elementToMarkdown(node)`.

> **Do not strip `data-md` attributes.** `mermaid`, `smiles`, `qrcode`, and `youtube` output carry a `data-md` breadcrumb so copy recovers their source after client-side rendering (e.g. a copied QR yields `{{qr ...}}`, not its SVG). Preserve these attributes if you post-process the HTML.

---

## Themes

Ten bundled themes — each auto-imports `common.css` (structural rules for tables, images, QR overlays, print).

| File | Style | Scheme |
|---|---|---|
| `dark-elegant-1.css` | Cinzel headings · scholarly serif | Dark |
| `dark-elegant-2.css` | Dark elegant variant | Dark |
| `light-neat-1.css` | Figtree · clean modern sans | Light |
| `light-neat-2.css` | Light neat variant | Light |
| `light-neat-3.css` | Bricolage · calm green "Orchard" | Light |
| `beige-decent-1.css` | Warm beige · print-like prose | Light |
| `beige-decent-2.css` | Beige decent variant | Light |
| `light-academic-1.css` | Alegreya · justified scholarly prose | Light |
| `light-academic-2.css` | Light academic variant | Light |
| `light-playful-1.css` | Casual · personal blog | Light |
| `light-playful-2.css` | Light playful variant | Light |

```javascript
// With bundler:
import 'orz-markdown/themes/light-neat-1.css';

// Plain HTML:
// <link rel="stylesheet" href="node_modules/orz-markdown/themes/light-neat-1.css">
```

For custom themes start from `assets/minimal.css` (structural only, no decoration) and add your visual layer. See `references/themes.md` for the design token pattern, element checklist, and design guidelines. See `references/css-classes.md` for the full list of every CSS class the parser emits. **Building a host app that supplies its own CSS and page shell (a slide engine, viewer, or editor)?** Read `references/embedding.md` — it gathers the CSS contract, the JS runtime + diagram-drawing duties, and the copy-as-Markdown requirements into one checklist (and the non-obvious gotchas, like a host CSS reset stripping bold/sub/sup).

---

## Plugin Syntax — Quick Reference

For complete examples and all options, read `references/syntax.md`.

### Custom plugins — `{{name[args] body}}`

Single-line: `{{name[args] body}}` — Multi-line: `{{name[args]\nbody\n}}` — both close with `}}`.
Escape with backslash: `\{{name}}` renders as literal `{{name}}`.

| Plugin | Alias | Quick example |
|---|---|---|
| **span** | `sp` | `{{sp[red] colored}}` · `{{sp[success] ✓ Done}}` |
| **emoji** | `em` | `{{emoji wave}}` · `{{em tada}}` |
| **space** | — | `{{space 4}}` → 4 × `&nbsp;` |
| **qrcode** | `qr` | `{{qr https://example.com}}` (click-to-expand SVG) |
| **youtube** | `yt` | `{{youtube dQw4w9WgXcQ}}` (responsive iframe) |
| **mermaid** | `mm` | `{{mm\ngraph LR\nA-->B\n}}` |
| **smiles** | `sm` | `{{smiles C1=CC=CC=C1}}` (chemical structure) |
| **toc** | — | `{{toc}}` or `{{toc 2,3}}` (heading levels) |
| **attrs** | — | `# Title{{attrs[id="hero"]}}` |
| **markdown** | `md`, `md-include` | `{{md ./path/to/file.md}}` |
| **yaml** | `yml` | `{{yaml\nkey: val\n}}` (invisible metadata) |
| **nyml** | — | `{{nyml\nkey: val\n}}` (parsed to JSON) |

### Containers — `::: name ... :::`

Space between `:::` and name is required. Nesting uses more colons on the outer level.

```markdown
::: success          ::: info         ::: warning      ::: danger
::: left             ::: right        ::: center
::: left 30%         (optional CSS width arg — only on `left`)
::: spoil My Title   ::: my-class-name   (arbitrary class)

:::: tabs            (outer: 4 colons)
::: tab Label One    (inner: 3 colons)
:::
::: tab Label Two
:::
::::

:::: cols            (equal-width columns)
:::: cols 1 2 1      (ratio: numbers → fr units, or any CSS length)
::: col
:::
::::

:::: outer           (nesting: outer uses more colons than inner)
::: inner
:::
::::
```

---

## Stable Block IDs — editing rules

Documents may carry stable block IDs on headings: `## Title{{attrs[#blk-abc12345]}}` (canonical form: no space before the marker). These IDs are the block's permanent identity for the host application.

**The non-negotiables:** IDs are immutable — when editing or rewriting a section, preserve its `{{attrs[#blk-...]}}` marker exactly, even if you rewrite the heading text completely. Never reuse, invent, regenerate, or duplicate an ID, and never convert to or from Pandoc `{#id}` syntax (unsupported; corrupts the heading).

**Before any edit to a document containing `{{attrs[#blk-...]}}`, read `references/block-ids.md`** — it has the full rules and a pre-save checklist.

---

## Reference Files

| File | When to read |
|---|---|
| `references/syntax.md` | Full syntax with examples for every plugin, container, and extended markdown feature |
| `references/block-ids.md` | Stable block-ID preservation rules — REQUIRED reading before editing documents that use `{{attrs[#blk-...]}}` |
| `references/themes.md` | Custom theme guide: design tokens, element checklist, 10 design guidelines |
| `references/css-classes.md` | Every CSS class and HTML element the parser emits — the spec for theme authors |
| `references/embedding.md` | Host-integration guide for apps that bring their own CSS/shell (slide engines, viewers, editors): the CSS contract + reset gotchas, the JS runtime + diagram drawing, and what copy-as-Markdown needs |
| `assets/template.html` | Ready-to-use HTML page template with all scripts and CDN links wired up |
| `assets/minimal.css` | Structural-only stylesheet — starting point for custom themes |
