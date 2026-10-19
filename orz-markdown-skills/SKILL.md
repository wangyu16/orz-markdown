---
name: orz-markdown
description: "orz-markdown usage skill. Use this skill whenever you need to render markdown with this parser, write markdown that uses {{...}} custom plugin syntax (mermaid, chart, qrcode, youtube, smiles, toc, span, emoji, attrs, space, yaml, nyml, markdown/md file or URL includes, or their aliases mm/qr/yt/sm/sp/em/yml/md-include), use :::container syntax (success/info/warning/danger/spoil/tabs/tab/cols/col/left/right/center), set up a complete HTML page to display parser output, choose or import one of the 12 bundled CSS themes, or create a custom theme stylesheet. Also invoke when asked about .markdown-body class, prepareSources, browser runtime scripts for QR codes or tabs, any KaTeX math syntax in this project, or the {{nyml kind: document}} document header of a text-format-1 document (.md / .slides.md / .paged.md beside its assembled .html twin). ALWAYS invoke before editing documents whose headings carry stable block IDs ({{attrs[#blk-...]}})."
compatibility: "Needs the npm package orz-markdown (Node.js >= 20.16; a CommonJS package whose named imports work from ESM). Rendered pages load KaTeX CSS, highlight.js, Mermaid, SmilesDrawer and Chart.js from CDNs."
---

# orz-markdown

A deeply customized `markdown-it` instance with 10+ custom plugins, 10 official plugin bundles, and 12 ready-to-use CSS themes. All rendered HTML lives inside `<article class="markdown-body">`. This skill describes orz-markdown 2.4.

> **Common mistakes — check every document you write for these.**
>
> | Wrong (renders as a plain code block, silently) | Right |
> |---|---|
> | ` ```mermaid ` … ` ``` ` | `{{mermaid` … `}}` (alias `{{mm` … `}}`) |
> | ` ```chart ` … ` ``` ` | `{{chart` … `}}` |
> | ` ```smiles ` … ` ``` ` | `{{smiles C1=CC=CC=C1}}` |
> | ` ```qr ` … ` ``` ` | `{{qr https://example.com}}` |
>
> Other frequent slips: `{{/mermaid}}` (there is no closing tag — every
> directive ends with `}}`); a block directive (`{{mermaid}}`, `{{chart}}`,
> `{{toc}}`, …) in the middle of a sentence (it must start a line); a
> container inside a `::: col` without adding colons to the outer levels
> (`::::: cols` › `:::: col` › `::: info`, see "Containers"); Pandoc `{#id}`
> on headings (use `{{attrs[#id]}}`); a `# comment` inside a `{{nyml}}`
> header (it becomes part of the value); a second document header, or one
> that is not the very first block.

## Rendering (Node.js / ESM)

```javascript
import { md } from 'orz-markdown'; // named export (CommonJS package: a default import in native ESM gets the module object)

const html = md.render(markdownSource);
const page = `<article class="markdown-body">${html}</article>`;
```

Parser is configured with `html: true` — raw HTML in source is emitted verbatim. Sanitize untrusted content before rendering to avoid XSS. Also `linkify: true` (bare `https://…` and `www.…` become links) and `typographer: true` (`--` → –, `---` → —, `...` → …, `(c)` → ©, straight quotes → curly).

### Remote URL includes

If the source contains `{{markdown https://...}}` (or `{{md …}}` / `{{md-include …}}`), resolve it before the synchronous render:

```javascript
import { md, prepareSources } from 'orz-markdown';

const resolved = await prepareSources(markdownSource, { allowedHosts: ['docs.example.com'] });
const html = md.render(resolved);
```

Includes are content from sources you trust. Outside a browser (Node, Deno, Bun, a worker without `document`) `prepareSources` fetches **nothing** unless `allowedHosts` is non-empty or a `fetcher` is given — `await prepareSources(src)` returns `src` unchanged and the directive renders nothing. In a page, an empty list allows every host (the author who wrote the URL chose it).

### Local file includes (`{{md ./file.md}}`) — opt-in (≥ 2.0.0)

File includes resolve **only** when the render env grants file access:
`markdownBasePath` (the document's directory; Node reads via `node:fs`) or
`readFile(absPath) => string | null` (a host-supplied reader). With neither,
the directive renders nothing — so rendering untrusted text with plain
`md.render(src)` can never read server files. Add `markdownIncludeRoot` to
refuse includes that resolve outside a directory (do this for any source that
is not fully trusted):

```javascript
md.render(src, { markdownBasePath: docDir, markdownIncludeRoot: projectRoot });
```

`prepareSources(src, opts?)` (≥ 1.5.0) options:
`allowedHosts` (case-insensitive exact host match, `host` or `host:port`; only
these are fetched — an SSRF guard), `fetcher(url) => Promise<string | null>`
(inject the transport; it then owns the trust decision, redirects and
timeouts; the default uses global `fetch` and re-checks `allowedHosts` on every
redirect hop), `maxDepth` (nested includes, default 3; ancestor-chain cycle
guard), `maxSize` (total expanded characters, default 5,000,000; an include
past it stays as its directive), `timeoutMs` (default fetcher, default 15,000),
and `includeEnv` (the `markdownBasePath` / `markdownIncludeRoot` / `readFile`
you will render with — a document that also has a live file include keeps its
URL directives unless you pass it). A failed or refused include leaves its
directive in place; it never throws.
Fetched text is **block content** (≥ 2.0.0): a directive mid-paragraph splits
the paragraph there; one in a quote or list item stays inside it. Raw HTML
outside the allowlist (`<script>`, `<style>`, `<svg>`, a `class` or `style`
attribute, …) is **dropped** block by block and the rest renders. The include
is still **refused** (directive stays) if it would change how the host
document around it parses (an unclosed comment, a list item swallowing what
follows, a redefined link reference; an unclosed code fence at its end is
simply closed), uses an undocumented `::: name` container or a
`{{sp[…]}}` class other than the eight documented ones, has math that paints
outside its box, or sets attributes outside the allowlist (e.g. an
`{{attrs[#fn1]}}` claiming a render-time id).

---

## HTML Page Requirements

Every page that displays parser output needs **all five** of these:

1. **Theme stylesheet** — one of the 12 bundled themes, or `assets/minimal.css`
2. **KaTeX CSS** — `https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.css`
3. **Highlight.js CSS** — match light/dark to the chosen theme
4. **Four CDN scripts** — Highlight.js, Mermaid.js, SmilesDrawer, Chart.js (loaded in body)
5. **The orz runtime + one enhance call** — `getBrowserRuntimeScript()` (tabs, QR expand, copy-as-Markdown) and `window.__orzEnhance()` (draws code highlighting, Mermaid, SMILES, charts)

**Use `assets/template.html`** — all CDN links, scripts, and the `.markdown-body` wrapper are pre-wired (it is generated from `getPreviewFrameAssets()` at every build, so it always matches the package). Copy it and replace the `<!-- INSERT RENDERED HTML HERE -->` comment.

**Mounting output in an `<iframe>` (viewer / editor / slide or page engine)?** Call `getPreviewFrameAssets()` from `orz-markdown/preview-frame` — it returns the pinned CDN URLs, the runtime, `headLinks(scheme)` / `bodyScripts()` strings, and a `window.__orzEnhance()` that does all of items 3–5 (highlight code, draw mermaid/SMILES/charts, init tabs + QR). One call instead of re-deriving the wiring. See `references/embedding.md`.

CDN URLs — exact versions, single source of truth `PREVIEW_CDN` / `PREVIEW_LIB_VERSIONS` in `orz-markdown/preview-frame` (prefer importing them over copying these):
| Library | URL |
|---|---|
| KaTeX CSS | `https://cdn.jsdelivr.net/npm/katex@<KATEX_VERSION>/dist/katex.min.css` (matches the KaTeX that renders; currently 0.16.47) |
| Highlight.js JS | `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js` |
| Highlight.js light CSS | `.../styles/github.min.css` (same base URL) |
| Highlight.js dark CSS | `.../styles/atom-one-dark.min.css` |
| Mermaid.js | `https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js` |
| SmilesDrawer | `https://unpkg.com/smiles-drawer@1.0.10/dist/smiles-drawer.min.js` |
| Chart.js | `https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js` |

### Browser runtime API

For programmatic control after mounting HTML dynamically:

```javascript
import { getBrowserRuntimeScript } from 'orz-markdown/runtime';
const script = document.createElement('script');
script.textContent = getBrowserRuntimeScript();
document.body.appendChild(script);
// or call directly: window.OrzMarkdownRuntime.init(rootElement)
```

The runtime also provides **copy-as-Markdown**: with it loaded, copying a selection inside `.markdown-body` puts Markdown source on the clipboard, not HTML, and the copy round-trips — rendering it gives back the same output (tables, lists, math, footnotes, containers, generated constructs; Chinese and English). A selection covering a whole block copies the block; a partial one copies just what is selected; text inside code copies verbatim. It skips selections inside `<input>`/`<textarea>`/`contenteditable` and selections that reach outside the copy root. `window.OrzMarkdownRuntime.elementToMarkdown(node)` converts a node's **contents** (its children, not the node itself: pass the parent of a generated construct such as a `.mermaid` or a `span.qrcode` to get its `{{…}}` directive back). The guarantees are listed in `notes/CLAIMS.md` in the orz-markdown repository (<https://github.com/wangyu16/orz-markdown/blob/main/notes/CLAIMS.md>; not in the installed package).

> **Chinese text.** Emphasis works next to CJK punctuation (`**注意：**请`), a line wrap between Chinese characters adds no space, bare URLs stop at Chinese text, and nyml metadata accepts `：` and `，、；` separators.

> **Do not strip the copy breadcrumbs.** `data-md` on `mermaid`, `smiles`, `qrcode`, `youtube`, `chart`, `emoji`, `toc`, `yaml` and `nyml` output and on footnote references (`[^n]` / `^[…]`) lets copy recover the source after rendering (a copied QR yields `{{qr ...}}`, not its SVG). `data-orz-container` (cols ratios, `left` width, spoil label, custom `::: name` args) and `data-footnote-label` (footnote definitions) do the same for containers and notes. Preserve all three if you post-process the HTML.

### Document metadata: the header

**Metadata and settings go in the document header** — ONE nyml block at the
very top of the text whose first key is `kind: document`. This is the same
for every kind: a continuous document (`name.md` → `name.md.html`, orz-mdhtml),
a deck (`name.slides.md` → `name.slides.html`, orz-slides) and a print
document (`name.paged.md` → `name.paged.html`, orz-paged). The `.md`,
`.slides.md` or `.paged.md` text is the document (its "text twin"); the
`.html` file is built from it by the tool's `assemble` command and carries
the exact text inside. The tools write the header's metadata into the file's
`<head>` (title, author, description, keywords, licence, canonical source)
and into a machine-readable `#orz-meta` record, and keep them current when
the file is edited and saved in the browser.

```markdown
{{nyml
kind: document
title: Cell Biology — Week 3
author: Yu Wang
license: CC-BY-4.0
theme: light-neat-3
}}
```

`{{nyml` alone on the first line, `kind: document` next, `}}` alone on the
last; one `key: value` per line (`key: |` for a multi-line value); no `}}`
inside a value, and **no comments**: everything after `key:` is the value
(`theme: orchard  # default` names a theme called `orchard  # default`).
Keys: `title`, `author`, `description`, `date`, `keywords` (comma-separated),
`source`, `license` / `license_name` / `license_url`, `format` (only `1`;
omit it), `carrier` (`md`, `slides` or `paged`), `uid` (keep it exactly;
never invent or change one — the tool's `new` command mints it), `lang`,
`theme`, and the kind's own: `measure` (`normal` · `wide` · `full`) for md;
`ratio` (`16:9` · `4:3`), `footer`, `transition`, `slide_numbers` and
`progress` (`yes` · `no`), `section_numbers` (`plain` · `roman` · `01` ·
`none`) for slides; the page settings for paged (its skill lists them). Host
keys start with `x_<host>_`. Unknown keys are kept. The parser renders
nothing for this block. A file with no header is still a valid `md`
document (with no `uid`: give it the header `orz-mdhtml new` prints to
stdout when run without a file). Older files used a separate
`{{nyml kind: meta}}` block (orz-mdhtml/orz-paged 0.x; still read as the
header) or a `<!-- deck … -->` block (orz-slides 0.x, now a `deck-block`
lint error); the tool's `upgrade` command moves either into the header.
**Twin links:** link to the text twin (`[Week 2](week2.slides.md)`); it
works on GitHub and becomes a link to `week2.slides.html` inside an
assembled file (in your own render: `env.orzTwinLinks: true`, with
`orz-markdown/carrier` imported, or `registerTwinLinks(yourMd)` for another
markdown-it instance). **In a carrier (≥ 2.2.0)** a md
`theme` outside the 12 bundled ids is flagged (`unknown-theme` lint) and the
default theme is shown; a file include the carrier cannot resolve shows
"Included file not available: part.md" (`p.orz-include-missing`, dimmed,
hidden in print) in the preview and read view — check the path or ask the
host to supply the file. Full rules: the text-format spec,
`node_modules/orz-markdown/spec/FC-18-text-format-1.md` (shipped in the
package; also on
[GitHub](https://github.com/wangyu16/orz-markdown/blob/main/spec/FC-18-text-format-1.md)).

**Host apps** reading or writing metadata use `orz-markdown/doc-meta`
(`DocMeta`: `title`, `author`, `description`, `license` {`spdx`, `name`,
`url`}, `source`, `date`, `keywords`, `uid`): `extractDocMeta`,
`mergeDocMeta` (host values win field by field; blank host values never
overwrite the author's), `renderDocMetaHead`, `renderDocMetaIsland`,
`parseDocMetaIsland`. Do not create a second metadata grammar.

### Building a carrier or host (≥ 2.0.0)

`orz-markdown/carrier` holds the family's shared, Node-free building blocks:
`escapeScriptText` / `unescapeScriptText` (reversible source-island escaping),
`jsonForScript` (JSON that cannot leave a `<script>`), `escapeHtml` /
`escapeAttr`, and `maskInertMarkdown` (blank code/comments before scanning
source for directives). `VERSION` / `KATEX_VERSION` come from
`orz-markdown/version`. The main entry also exports `register({ type: 'block' |
'inline', aliases, render(args, body, env) })` to add a `{{name}}` plugin, and
`resolveIncludePath(target, env)` / the `IncludeEnv` type to resolve a file
include exactly as the renderer will (null when refused). The package bundles for the browser with no
`fs`/`path`/`process` shims.

The carrier kit (≥ 2.1.0) adds `orz-markdown/carrier` (text format 1:
header tools, `readDocument`, `assembleEnvelope` / `extract`),
`orz-markdown/carrier/read` (parser-free reading), `orz-markdown/carrier/shell`
(save, preferences, host protocols, quiet update), `orz-markdown/carrier/editor`
(the shared editor shell, incl. the AI review flow `proposeAi`/`applyAi`
≥ 2.2.0; ≥ 2.4.0 `applyEdits` (several edits as one undo step), `select`
`setFocusRange` (dim or fold the text outside a range), `flash` (light the lines a tool changed) and `getSelection` (the caret in exact offsets); ≥ 2.3.0 the reader's Cmd/Ctrl+P as a `print` event and
`printDocument(html)` to print the document rather than the app's page — see
`references/embedding.md` §4), `orz-markdown/carrier/app` (≥ 2.2.0: the standalone file's runtime,
`startCarrier(kind)`; a file's read view shows one pencil at the bottom-left
whose list holds every operation — ≥ 2.3.0 also a kind's submenus such as
paged's "New document from template…", options that appear only when the
document offers them such as paged's Version, and reader choices such as a
page zoom, which stay in the browser and never change the text; Cmd/Ctrl+P
runs the kind's Print action), `orz-markdown/carrier/node` (≥ 2.3.0, Node
only: the CLI core carriers share — overwrite guards, backups, atomic writes,
includes) and `orz-markdown/carrier/conformance` (test harness). `orz-markdown/themes` (≥ 2.2.0; also on the main entry) lists the
bundled themes: `THEMES` (id, name, light/dark), `DEFAULT_THEME`, `isThemeId`,
`themeInfo`. They are for carrier and host builders; their binding specs ship
in the package, `node_modules/orz-markdown/spec/` (its README.md lists them).

---

## Themes

Twelve bundled themes — each imports `common.css`, the shared **structure** layer (container floats/alignment, the cols grid, tab switching, scrolling for wide tables/code/math, embed sizing, the 640px mobile collapse, print). Theme files are **decoration only**, so layout behaves identically in every theme.

| File | Style | Scheme |
|---|---|---|
| `dark-elegant-1.css` | Cinzel headings · Source Serif 4 text · navy card | Dark |
| `dark-elegant-2.css` | Sora headings · Vollkorn text · near-black, orange | Dark |
| `dark-elegant-3.css` | Atkinson Hyperlegible Next headings · Charis SIL text · graphite editor — "Nocturne" | Dark |
| `light-neat-1.css` | Figtree headings · Source Sans 3 text · clean modern blue | Light |
| `light-neat-2.css` | Epilogue headings · Literata text · warm paper, teal | Light |
| `light-neat-3.css` | Bricolage Grotesque · calm green — "Orchard" | Light |
| `beige-decent-1.css` | Libre Caslon Display & Text · trade-book page, oxblood | Light |
| `beige-decent-2.css` | Josefin Sans headings · Cardo text · bottle green | Light |
| `light-academic-1.css` | Alegreya throughout · cream paper, rubric red | Light |
| `light-academic-2.css` | Fira Sans headings · Vollkorn text · hairline structure | Light |
| `light-playful-1.css` | Indie Flower headings · Shantell Sans text · ruled school notebook: on screen everything is written on the ruled lines or on a sheet attached on top (with the in-page or frame enhancement) | Light |
| `light-playful-2.css` | Chewy stickers · Patrick Hand text · sketchbook | Light |

```javascript
// With bundler:
import 'orz-markdown/themes/light-neat-1.css';

// Plain HTML:
// <link rel="stylesheet" href="node_modules/orz-markdown/themes/light-neat-1.css">
```

Each theme reads at ~70 characters; `<article class="markdown-body measure-wide">` gives ~90 and `measure-full` the whole width.

For a custom theme copy `assets/minimal.css` (the starter: `@import './common.css'` + neutral decoration for every element) and restyle it — decoration only; never re-declare floats, grids, tab switching or overflow. `references/themes.md` → "What a new theme needs" is the contract (required `:root` declarations, layout tokens, element checklist). See `references/css-classes.md` for the full list of every CSS class the parser emits. **Building a host app that supplies its own CSS and page shell (a slide engine, viewer, or editor)?** Read `references/embedding.md` — it gathers the CSS contract, the JS runtime + diagram-drawing duties, and the copy-as-Markdown requirements into one checklist (and the non-obvious gotchas, like a host CSS reset stripping bold/sub/sup).

---

## Plugin Syntax — Quick Reference

For complete examples and all options, read `references/syntax.md`.

### Custom plugins — `{{name[args] body}}`

Single-line: `{{name[args] body}}` — Multi-line: `{{name[args]\nbody\n}}` — both close with `}}`.
Escape with backslash: `\{{name}}` renders as literal `{{name}}`.

Each plugin is **block** or **inline**, not both. Block (`youtube`, `mermaid`, `smiles`, `chart`, `toc`, `markdown`/`md`/`md-include`, `yaml`/`yml`, `nyml`) must start a line; text after its closing `}}` becomes a new paragraph, and a block directive mid-sentence renders as literal text. Inline (`span`/`sp`, `emoji`/`em`, `space`, `qr`/`qrcode`, `attrs`) works anywhere in a line.

| Plugin | Alias | Quick example |
|---|---|---|
| **span** | `sp` | `{{sp[red] colored}}` · `{{sp[success] ✓ Done}}` |
| **emoji** | `em` | `{{emoji wave}}` · `{{em tada}}` |
| **space** | — | `{{space 4}}` → 4rem-wide inline-block spacer |
| **qrcode** | `qr` | `{{qr https://example.com}}` · `{{qrcode https://example.com}}` (click-to-expand SVG) |
| **youtube** | `yt` | `{{youtube dQw4w9WgXcQ}}` (responsive iframe; prints as its address ≥ 2.3.0) |
| **mermaid** | `mm` | `{{mm\ngraph LR\nA-->B\n}}` |
| **smiles** | `sm` | `{{smiles C1=CC=CC=C1}}` (chemical structure) |
| **chart** | — | `{{chart\ntype: bar\nlabels: A, B\ndata: 1, 2\n}}` (`bar` default, `line`, `pie`, `doughnut`, `radar`, `polarArea`; ≥ 2.4.0 coloured by the theme's `--chart-*` tokens; no size or axis-title keys) |
| **toc** | — | `{{toc}}` or `{{toc 2,3}}` (heading levels) |
| **attrs** | — | `# Title{{attrs[id="hero"]}}` |
| **markdown** | `md`, `md-include` | `{{md ./path/to/file.md}}` |
| **yaml** | `yml` | `{{yaml\nkey: val\n}}` (invisible metadata) |
| **nyml** | — | `{{nyml\nkey: val\n}}` (parsed to JSON; `kind: document` = the document header, renders nothing) |

### Containers — `::: name ... :::`

Write a space between `:::` and the name (conventional; `:::name` also parses). Nesting uses more colons on the outer level: **every** level that holds another container needs more colons than what it holds. A callout inside a column is three levels — `::::: cols` › `:::: col` › `::: info` — and `:::: cols` › `::: col` › `::: info` is wrong (the fences pair up wrongly: the column ends early and a stray `:::` shows as text).

```markdown
::: success          ::: info         ::: warning      ::: danger
::: left             ::: right        ::: center
::: left 30%         (optional width with a CSS unit — only on `left`)
::: spoil My Title   ::: my-class-name   (arbitrary class)

:::: tabs            (outer: 4 colons)
::: tab Label One    (inner: 3 colons)
:::
::: tab Label Two
:::
::::

:::: cols            (equal-width columns)
:::: cols 1 2 1      (numbers → fr; CSS lengths, auto, min-/max-content, minmax(…),
                      repeat(…) pass through; an invalid list → equal columns)
::: col
:::
::::

:::: outer           (nesting: outer uses more colons than inner)
::: inner
:::
::::
```

### Captions for figures, tables and charts

Markdown has no caption syntax; use this one convention so every theme and
every carrier shows captions the same way:

```markdown
![Growth of the culture over 48 h](growth.png)

*Figure 1.* Growth of the culture over 48 h.

**Table 1.** Yield by catalyst.

| Catalyst | Yield |
|---|---:|
| Pd | 92 % |

{{chart
type: line
labels: 0 h, 24 h, 48 h
series: OD600 = 0.1, 0.8, 1.6
}}

*Figure 2.* Optical density over time.
```

A figure's caption is a paragraph **after** it starting `*Figure N.*`; a
table's is a paragraph **before** it starting `**Table N.**`; a chart (or
diagram) gets a figure caption after it — `{{chart}}` has no caption key
(`title:` draws a title inside the chart). Keep the alt text a description
of the picture, not a copy of the caption.

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
| `references/themes.md` | Custom theme guide: design tokens, element checklist, 13 design guidelines |
| `references/css-classes.md` | Every CSS class and HTML element the parser emits — the spec for theme authors |
| `references/embedding.md` | Host-integration guide for apps that bring their own CSS/shell (slide engines, viewers, editors): the CSS contract + reset gotchas, the JS runtime + diagram drawing, and what copy-as-Markdown needs |
| `assets/template.html` | Ready-to-use HTML page template with all scripts and CDN links wired up |
| `assets/minimal.css` | Starter theme — imports `common.css`, neutral decoration; copy it to make a new theme |
| `assets/common.css` | The shared structure layer (identical to `themes/common.css`), shipped beside the starter |
