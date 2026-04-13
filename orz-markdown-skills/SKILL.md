---
name: orz-markdown
description: "@orz-how/markdown-parser usage skill. Use this skill whenever you need to render markdown with this parser, write markdown that uses {{...}} custom plugin syntax (mermaid, qrcode, youtube, smiles, toc, span, emoji, attrs, space, yaml, nyml, or their aliases mm/qr/yt/sm/sp/em), use :::container syntax (success/info/warning/danger/spoil/tabs/tab/cols/col/left/right/center), set up a complete HTML page to display parser output, choose or import one of the 10 bundled CSS themes, or create a custom theme stylesheet. Also invoke when asked about .markdown-body class, prepareSources, browser runtime scripts for QR codes or tabs, or any KaTeX math syntax in this project."
compatibility:
  runtime: "Node.js 20+, ESM"
  package: "@orz-how/markdown-parser"
---

# @orz-how/markdown-parser

A deeply customized `markdown-it` instance with 10+ plugins, 9 official plugin bundles, and 10 ready-to-use CSS themes. All rendered HTML lives inside `<article class="markdown-body">`.

## Rendering (Node.js / ESM)

```javascript
import md from '@orz-how/markdown-parser';

const html = md.render(markdownSource);
const page = `<article class="markdown-body">${html}</article>`;
```

Parser is configured with `html: true` — raw HTML in source is emitted verbatim. Sanitize untrusted content before rendering to avoid XSS.

### Remote URL includes

If the source contains `{{markdown https://...}}`:

```javascript
import md, { prepareSources } from '@orz-how/markdown-parser';

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
import { getBrowserRuntimeScript } from '@orz-how/markdown-parser/runtime';
const script = document.createElement('script');
script.textContent = getBrowserRuntimeScript();
document.body.appendChild(script);
// or call directly: window.OrzMarkdownRuntime.init(rootElement)
```

---

## Themes

Ten bundled themes — each auto-imports `common.css` (structural rules for tables, images, QR overlays, print).

| File | Style | Scheme |
|---|---|---|
| `dark-elegant-1.css` | Cinzel headings · scholarly serif | Dark |
| `dark-elegant-2.css` | Dark elegant variant | Dark |
| `light-neat-1.css` | Figtree · clean modern sans | Light |
| `light-neat-2.css` | Light neat variant | Light |
| `beige-decent-1.css` | Warm beige · print-like prose | Light |
| `beige-decent-2.css` | Beige decent variant | Light |
| `light-academic-1.css` | Alegreya · justified scholarly prose | Light |
| `light-academic-2.css` | Light academic variant | Light |
| `light-playful-1.css` | Casual · personal blog | Light |
| `light-playful-2.css` | Light playful variant | Light |

```javascript
// With bundler:
import '@orz-how/markdown-parser/themes/light-neat-1.css';

// Plain HTML:
// <link rel="stylesheet" href="node_modules/@orz-how/markdown-parser/themes/light-neat-1.css">
```

For custom themes start from `assets/minimal.css` (structural only, no decoration) and add your visual layer. See `references/themes.md` for the design token pattern, element checklist, and design guidelines. See `references/css-classes.md` for the full list of every CSS class the parser emits.

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
| **attrs** | — | `# Title {{attrs[id="hero"]}}` |
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

## Reference Files

| File | When to read |
|---|---|
| `references/syntax.md` | Full syntax with examples for every plugin, container, and extended markdown feature |
| `references/themes.md` | Custom theme guide: design tokens, element checklist, 10 design guidelines |
| `references/css-classes.md` | Every CSS class and HTML element the parser emits — the spec for theme authors |
| `assets/template.html` | Ready-to-use HTML page template with all scripts and CDN links wired up |
| `assets/minimal.css` | Structural-only stylesheet — starting point for custom themes |
