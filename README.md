# orz-markdown

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21099237.svg)](https://doi.org/10.5281/zenodo.21099237)

A deeply customized markdown-it parser configured with several official plugins and many custom plugins designed to render interactive objects, embedded rich media, and invisible data. Crafted alongside beautifully optimized CSS themes for an excellent out-of-the-box rendering experience. An agent skill is available for using this markdown parser with AI agents. 

Rendered HTML is intended to live inside a `.markdown-body` container and be paired with one of the bundled themes.

## Showcase

![orz-mdhtml showcase: a rendered Markdown document opens its built-in editor, updates the preview live, and switches themes](docs/media/orz-mdhtml-demo.gif)

The same portable file is both the rendered document and its Markdown editor. See the full
[orz-markdown family](https://markdown.orz.how/family.html).

## Citation

If you use or cite the orz-markdown website or editable document family, please cite the archived release:

Yu Wang. (2026). orz-markdown: a Markdown family that travels in one file. Zenodo. https://doi.org/10.5281/zenodo.21099237

## Installation

Install the package via npm:

```sh
npm install orz-markdown
```

## Quick Start

Import the configured markdown instance and use it to render markdown strings into HTML:

> **HTML Support:** The parser is initialized with `html: true`, so any raw
> HTML tags included in your markdown (e.g. `<div>Example</div>`) will be
> emitted verbatim instead of being escaped. Be aware of XSS risks when
> rendering untrusted content.


```javascript
import { md } from 'orz-markdown'; // named export: the package is CommonJS, so a default import gets the module object in native ESM

const markdownSource = `
# Hello World
{{emoji wave}} This is a customized inline parsed text!
`;

const html = md.render(markdownSource);

document.body.innerHTML = `<article class="markdown-body">${html}</article>`;
```

## Browser Runtime

Some rendered features expect a small browser runtime layer after the HTML is mounted. This includes tab bars, QR-code expand/collapse behavior and **copy-as-Markdown**, and is designed so more client-side enhancements can share the same entry point.

```javascript
import { getBrowserRuntimeScript } from 'orz-markdown/runtime';

const runtimeScript = document.createElement('script');
runtimeScript.textContent = getBrowserRuntimeScript();
document.body.appendChild(runtimeScript);
```

If your app controls initialization directly, the runtime also exposes `window.OrzMarkdownRuntime.init(root)`, `initTabs(root)`, `initQrCodes(root)` and `collapseQr()`.

For output that should copy as Markdown but keep tabs and QR codes static (a print master), use `getBrowserRuntimeScript({ autoInit: false })`: the copy handler is installed, nothing is rewired.

### Copy as Markdown

Once the runtime is loaded, selecting rendered content and copying it (Cmd/Ctrl-C) places **Markdown source** on the clipboard instead of HTML. A built-in DOM→Markdown walker reconstructs headings, emphasis, inline code, links, `==mark==`/`++ins++`/`~~del~~`/`~sub~`/`^sup^`, bullet/ordered/nested lists, task lists, tables (with alignment), blockquotes, fenced code (with language), images, and inline/display math.

It only transforms selections inside an element with class `markdown-body` (wrap your rendered output in one, e.g. `<article class="markdown-body">…</article>`, or mark a container with `data-orz-copy`), and never touches selections inside `<input>`, `<textarea>`, or `contenteditable` regions.

Generated constructs that lose their source after rendering — `mermaid`, `smiles`, `qrcode`, `youtube`, `chart`, `toc`, emoji, `nyml`/`yaml` islands, footnote references — carry a `data-md` attribute that the walker emits verbatim; `::: cols`, `::: left`, `::: spoil` and custom containers carry `data-orz-container`, and footnotes `data-footnote-label`. As a result a copied table of contents yields `{{toc 2,3}}` (not its heading links) and a copied QR code yields `{{qr ...}}` (not its SVG). **Do not strip `data-md`, `data-orz-container` or `data-footnote-label` attributes** if you post-process the HTML.

You can also convert a node programmatically:

```javascript
const markdown = window.OrzMarkdownRuntime.elementToMarkdown(someElement);
```

## Portable Document Metadata

The editable document builders share one metadata model from
`orz-markdown/doc-meta`. An mdhtml or paged source can declare metadata in a
leading block that is consumed during generation:

```markdown
{{nyml
kind: meta
title: Field Notes
author: Your Name
description: Notes from the field course
license: CC-BY-4.0
license_name: Creative Commons Attribution 4.0
license_url: https://creativecommons.org/licenses/by/4.0/
source: https://example.org/field-notes
date: 2026-07-10
keywords: notes, fieldwork, markdown
}}
```

The generated file stores normalized metadata in standard `<head>` tags and an
`#orz-meta` JSON island. Those records survive in-browser edits and framework
updates. Host applications can instead pass a `DocMeta` object to the family
builders; host values win field by field. Slides seed `title` and `author` from
their native deck config and accept the same programmatic override.

```javascript
import { extractDocMeta, parseDocMetaIsland } from 'orz-markdown/doc-meta';
```

### The document header (text format 1, ≥ 2.1.0)

The rebuilt carriers keep every document as plain text (`name.md`,
`name.slides.md`, `name.paged.md`) beside its assembled file (`name.md.html`,
…). Its metadata and settings live in one leading header — a nyml block whose
first key is `kind: document` ([FC-18 §5](spec/FC-18-text-format-1.md)):

```markdown
{{nyml
kind: document
title: Cell Biology — Week 3
author: Your Name
license: CC-BY-4.0
theme: light-neat-3
}}

# Cell Biology …
```

The parser renders nothing for a `kind: document` block (and gives it no
`nyml-data` number); the carriers read it. A plain Markdown file with no
header is a valid document too, and a leading `kind: meta` block is still
read as a legacy header. Relative links to a text twin
(`[Week 2](week2.slides.md)`) stay `.md` links in the text, so they work on
GitHub, and point to the assembled twin (`week2.slides.html`) in an assembled
file (the render env's `orzTwinLinks: true`).

What authors see in a carrier (≥ 2.2.0): a md `theme` that is not one of the
bundled themes is flagged by the header lint (`unknown-theme`) and the default
theme is shown; a file include (`{{md ./part.md}}`) the carrier cannot
resolve shows a dimmed note, "Included file not available: part.md", in the
editor preview and the read view (hidden in print). `md.render` itself is
unchanged: an unresolved include still renders nothing.

## Themes

We provide multiple ready-to-use CSS themes for rendering the output! You do not need to style the custom plugins from scratch.

Themes can be easily imported directly from the `themes` directory if you are using a bundler (like Vite, Webpack, etc.):

```javascript
import 'orz-markdown/themes/light-academic-1.css';
// Or try: dark-elegant-2.css, light-playful-1.css, etc!
```

Each shipped theme now imports a shared structural stylesheet internally, so you only need to import a single theme file.

The bundled themes cover the parser's custom output, including:

- semantic containers
- tabs and columns
- KaTeX blocks
- Mermaid placeholders
- SMILES canvases
- clickable QR codes with overlay expansion hooks

**Line length is the reader's choice.** Each theme defaults to a comfortable
reading measure (about 70 characters). Add `measure-wide` to the article for
about 90 characters (tables, code, dense notes) or `measure-full` for the
whole width: `<article class="markdown-body measure-wide">`.

For a full list of provided themes and the underlying CSS class reference for theme authors, please read the [Themes Documentation](themes/README.md).

### Embedding with your own CSS

Building a host app that renders with `md.render()` but supplies its **own**
stylesheet and page shell — a slide engine, a document viewer, an editor? Read
the **[embedding guide](orz-markdown-skills/references/embedding.md)**. It gathers
the full integration contract in one checklist: the CSS classes you must style
(and the gotcha where a host CSS reset, e.g. reveal.js, strips `strong`/`em`/
`sub`/`sup`), the JavaScript you must wire (the browser runtime for tabs/QR/copy,
plus loading and drawing mermaid/smiles/Chart.js yourself), and exactly what
copy-as-Markdown needs (the runtime, `.markdown-body`, and preserved `data-md`
breadcrumbs and plugin classes).

If your host mounts the rendered output in an `<iframe>`, the
`orz-markdown/preview-frame` export gives you a one-call helper —
`getPreviewFrameAssets()` returns the pinned CDN URLs, the browser runtime,
`headLinks(scheme)` / `bodyScripts()` strings, and a `window.__orzEnhance()` that
highlights code and draws Mermaid / SMILES / charts — so every host wires the
preview identically instead of re-deriving it.

## Package entry points

| Import | What it gives you |
|---|---|
| `orz-markdown` | the configured `md` instance, `createMarkdown()`, `register`, `prepareSources`, `resolveIncludePath`, DocMeta + nyml helpers, `maskInertMarkdown`, `THEMES`, `VERSION`, `KATEX_VERSION` |
| `orz-markdown/runtime` | the browser runtime (tabs, QR expand, copy-as-Markdown) as a script string |
| `orz-markdown/preview-frame` | `getPreviewFrameAssets()`, `PREVIEW_CDN`, `PREVIEW_LIB_VERSIONS` (exact, pinned), and `enhanceDocument(root, { scheme })`, `disposeEnhancement(root)`, `swapStylesheet(document, id, href)` (≥ 2.2.0) for content rendered in a page; `enhanceDocument(root, { static: true })` (≥ 2.3.0) for print and pagination: drawn charts and SMILES become images, the interactive runtime is skipped; both it and the frame's `__orzEnhance` keep a theme's baseline grid (≥ 2.3.0, `light-playful-1` on screen: a ruled notebook; `BASELINE_GRID_SCRIPT`); ≥ 2.4.0 both theme charts and Mermaid diagrams from CSS custom properties (`--chart-*`, `--mm-*`; `CONTENT_THEME_SCRIPT`), draw charts and SMILES only when visible (`redrawEnhancement(el)` for a newly shown container; `__orzRedraw(el)` in the frame) and size SMILES from their box |
| `orz-markdown/doc-meta` | the DocMeta API on its own |
| `orz-markdown/carrier` | the carrier kit core (text format 1, FC-18): escaping helpers, header read/edit/lint (≥ 2.3.0: `normalizeHeader`, `lintHeader(text, { kind, themes })`), `readDocument`, file-name kinds and twins, `mintUid`, twin links, `assembleEnvelope` / `extract` (loads the parser); ≥ 2.3.0 also the helpers carriers shared: a synchronous `sha256`, the legacy 0.x island reader (`readLegacyIsland`) and the kind-independent core of `inspect` (`assembledStructure`, `twinCheck`, `storedText`, …); ≥ 2.4.0 the slides keys `slide_numbers` / `progress` / `section_numbers` and the `deck-block` lint, `kitParser()`, `readDocument(text, { tokens, lint })` and `readLegacyIsland(…, { island })` |
| `orz-markdown/carrier/read` | `extract`, `readIslandFromDom`, `decodeText`, escape helpers — reads assembled files without the parser |
| `orz-markdown/carrier/shell` | the browser runtime of every assembled file: save, reader preferences, host protocols, quiet update, chrome (parser-free, Node-safe to import) |
| `orz-markdown/carrier/editor` | the editor shell every carrier's `mountEditor` wraps (FC-19 §8), with the pinned CodeMirror 6 bundle `vendor/codemirror6.js`; ≥ 2.3.0: the reader's Cmd/Ctrl+P (also from the preview) as the editor's `print` event, `printDocument(html)` to print a whole document from a sandboxed hidden frame instead of the app's page, `preview.maxWaitMs` / `preview.firstAckWaitMs` for kinds whose render is slow |
| `orz-markdown/carrier/app` | (≥ 2.2.0) the standalone assembled file's runtime every carrier bundle runs — `startCarrier(kind)`: read view with one quiet handle (a pencil whose list holds every operation, reader controls such as text size), edit mode (with the orz seal and the kind's GitHub link), saves, New document / Save as new copy, unsaved-changes warning, host connection with the AI review flow, quiet update — behind one seam, `StandaloneKind` ([spec/carrier-app.md](spec/carrier-app.md)); ≥ 2.3.0: action submenus and conditional actions, settings that write block values or appear only when the document offers them, reader controls with named choices (a page zoom), `app.newDocument({ text, name })` |
| `orz-markdown/carrier/node` | (≥ 2.3.0, Node only) the core every carrier's CLI shares — `carrierNode(tool)`: the overwrite guards (known earlier states from git and the CLI's pair records, `--replaces` tokens, the uid-identity gate), backups, atomic writes, includes from the text's folder, the shared reason codes and `next` commands ([spec/carrier-node.md](spec/carrier-node.md)) |
| `orz-markdown/carrier/conformance` | the Node-side conformance harness a carrier runs against itself (real Chrome via the optional peer `playwright-core`), and its page helpers for a carrier's own tests (OPFS picker, `readOpfs`, `writeOpfs`) |
| `orz-markdown/version` | `VERSION`, `KATEX_VERSION` — without loading the parser |
| `orz-markdown/themes` | (≥ 2.2.0) `THEMES` (ids, names, colour schemes), `DEFAULT_THEME`, `isThemeId`, `themeInfo` — also on the main entry |
| `orz-markdown/themes/*` | the CSS themes |

orz-markdown has no static Node dependencies: it bundles for the browser
(esbuild, Vite, …) with no `fs`/`path`/`process` shims.

### Carrier kit (≥ 2.1.0)

The `orz-markdown/carrier*` entries are the shared kit the family's
single-file carriers (orz-mdhtml, orz-slides, orz-paged) are being rebuilt on
(family decisions FD-03, FD-05–07). Their binding specifications live in
[`spec/`](spec/README.md): the text form and assembly (FC-18), the editor
component (FC-19), the host protocols, the shell runtime, the carrier app
(≥ 2.2.0: the runtime of a standalone file, which a carrier adopts by
supplying its kind — renderer, editor, read view, settings — to
`startCarrier`), and the conformance harness; the golden corpus is
[`tests/carrier-corpus/`](tests/carrier-corpus/) (shipped in the package).
Authors only need the [document header](#the-document-header-text-format-1--210)
above; everything else is for carrier and host builders.

### Security notes

- The parser runs with `html: true`: raw HTML in the source is emitted as-is.
  Sanitize untrusted input yourself.
- File includes never happen by default. A host grants them per render with
  `markdownBasePath` / `readFile`, and should confine them with
  `markdownIncludeRoot` unless the source is fully trusted.
- Rendering is bounded per document for the amplifications we know of (TOC,
  QR, includes, reference links, long or macro-defining math, KaTeX output,
  mhchem, footnotes, task lists, headings). A server rendering untrusted input should still cap the
  input size and render in a worker with a timeout: markdown-it and its
  plugins are not designed as a sandbox.
- `prepareSources()` fetches URLs. **Includes are content from sources you
  trust**, like a `<script src>`: name them. Outside a browser it fetches
  nothing unless you pass `allowedHosts` (or your own `fetcher`, which then
  owns that decision); in a page, the URL the author writes is the choice. The
  default fetcher re-checks every redirect hop and gives up after
  `timeoutMs`. The checks below are defence in depth against accidents and a
  compromised trusted host, not a sandbox for hostile text. Fetched text is placed as block content and
  can never change the host document around it: an include that would (an
  open fence or comment, a list item swallowing what follows, a redefined link
  reference) is left as the directive. Raw HTML in fetched text is limited to
  simple layout and text elements with no `class` or `style`; a block holding
  anything else (`<script>`, `<style>`, `<svg>`, an event handler, …) is
  dropped and the rest of the include renders. Fetched text may not use
  undocumented containers or span classes, and fetched math may not lap, smash
  or move vertically, nor kern left by 1em or more in total; such an include,
  or one that would push the document past a per-render cap the host alone
  stays under (TOC, QR, TeX, mhchem, KaTeX output), is left as the directive. A document
  that also has file includes (`{{md ./file}}`) keeps its URL directives
  unless you pass the render's file settings as `includeEnv`, so the check can
  see the file-included text too.

## Packaging

To rebuild distributable assets locally:

```sh
npm run build
npm test
npm pack
```

The generated tarball is written to the repository root and includes `dist/`, `themes/`, `vendor/` (the pinned CodeMirror 6 bundle), `orz-markdown-skills/`, and `tests/carrier-corpus/` (the conformance corpus).

## Agent Skill

The package ships an Agent Skill that teaches AI coding agents how to render with orz-markdown, write `{{...}}` plugin and `:::` container syntax, set up display pages, and work with the bundled themes. It also documents the block-ID preservation rules agents must follow when editing documents that use stable `{{attrs[#blk-...]}}` heading ids.

In the installed package, the skill lives at a stable path:

```
node_modules/orz-markdown/orz-markdown-skills/SKILL.md
```

with supporting files under `orz-markdown-skills/references/` and `orz-markdown-skills/assets/`. Point your agent tooling at that directory (e.g. copy or symlink it into your agent's skills folder).

Or hand your agent the skill straight from the CDN — no install needed:

```
https://cdn.jsdelivr.net/npm/orz-markdown/orz-markdown-skills/SKILL.md
```

See **[markdown.orz.how/agents.html](https://markdown.orz.how/agents.html)** for every install route (Claude Code, Claude.ai upload, or point-at-URL for any agent).

## Official Plugins Bundled

This project builds upon `markdown-it` and pre-configures a curated selection of official and popular community plugins.

- **markdown-it-anchor**: Header anchors
- **markdown-it-container**:
  - Semantic Blocks: `success`, `info`, `warning`, `danger`
  - Layout Blocks: `left` (optional CSS width arg, e.g. `::: left 30%`), `right`, `center`
  - Interactive Blocks: `spoil` (spoilers), `tabs/tab`, `cols/col` (optional width ratios, e.g. `:::: cols 1 2 1`)
  - Arbitrary class: any `::: ClassName` not in the reserved list above becomes `<div class="ClassName">`
  - Note: write a space between `:::` and the name (conventional; `:::name` also parses); nesting uses more colons on the outer level
- **markdown-it-footnote**: Footnotes syntax (`[^1]`)
- Image sizing (`![alt](url =100x200)`): an internal port of markdown-it-imsize's parser (no disk access)
- **markdown-it-cjk-breaks**: no stray space where a line wraps between two CJK characters
- CJK-friendly emphasis (a port of markdown-it-cjk-friendly: `**注意：**请` renders bold) and CJK-aware bare-URL linking
- **markdown-it-mark**: Highlighted text (`==marked==`)
- **markdown-it-sub** & **markdown-it-sup**: Subscript (`~sub~`) and Superscript (`^sup^`)
- **markdown-it-ins**: Inserted text (`++inserted++`)
- **markdown-it-task-lists**: GitHub-style task lists (`- [x] Task`)
- **@traptitech/markdown-it-katex**: Math rendering, capable of rendering block math (`$$E=mc^2$$`), inline math (`$E=mc^2$`), and built-in `mhchem` chemistry extension.

## Custom Plugin Syntax Reference

We utilize a generalized and uniform `{{plugin_name ...}}` syntax for all custom plugins. Single-line: `{{name body}}`. Multi-line: `{{name\nbody\n}}`. Both forms close with `}}` — there is no `{{/name}}` closing tag.

| Plugin Name | Alias | Syntax Example | Description |
| :--- | :--- | :--- | :--- |
| **Span Styles** | `sp` | `{{span[red] red text}}` | Inline span element. Perfect for colorizing or badging text. Supports color classes (`red`, `yellow`, `green`, `blue`) and badge classes (`success`, `info`, `warning`, `danger`). |
| **Attributes** | N/A | `# Header {{attrs[id="my-id"]}}`| Sets attributes on the block whose text holds the marker (heading, paragraph): `#id`, `.class`, `key="value"`. A later value for the same key replaces the earlier one (write `class="a b"`). |
| **Emoji** | `em` | `{{emoji smile}}` / `{{em tada}}` | Renders the specific text alias directly into the corresponding Unicode emoji natively. |
| **Table of Content** | N/A | `{{toc}}` or `{{toc 2,3}}` | Autogenerates a Table of Contents based on document headings. Allows specifying bound heading ranges. |
| **Space** | N/A | `{{space 4}}` | Inserts inline horizontal whitespace — an empty `inline-block` span sized in `rem` (`{{space 4}}` → 4rem wide). Capped at 100rem. |
| **YouTube** | `yt` | `{{youtube dQw4w9WgXcQ}}` | A responsive YouTube embed for a video id or a full YouTube URL (`watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`; a `t=` time becomes the start). A body that is no video id shows as its directive text. In print it shows its address (`YouTube video: https://youtu.be/…`, ≥ 2.3.0). |
| **Markdown Source**| `md` | `{{md path/to/file.md}}` | Embeds another Markdown file. **Opt-in:** resolves only when the render env passes `markdownBasePath` (or a `readFile` hook); add `markdownIncludeRoot` to confine it. URL includes are resolved beforehand by `prepareSources()`. |
| **QR Code** | `qr` | `{{qr https://example.com}}` | An SVG QR code. Alone in its paragraph it is full size for scanning; inside a sentence it is drawn at text size and expands on tap; print draws both large enough to scan. Past a QR code's capacity it renders as its text. |
| **Mermaid** | `mm` | `{{mermaid\ngraph LR\nA-->B\n}}` | Compiles logic into a specific preconfigured payload targeted for Mermaid client-side rendering. |
| **SMILES Chemistry**| `sm` | `{{smiles C1=CC=CC=C1}}` | Embeds SMILES chemical formulas parsed specifically for `smilesDrawer` visualization. |
| **Chart** | N/A | `{{chart\ntype: bar\nlabels: A, B\ndata: 1, 2\n}}` | Declarative bar/line/pie/doughnut charts from a small line-based config (`type`, `labels`, `series: Name = …` or `data: …`, optional `title`). Rendered client-side with Chart.js. |
| **YAML Objects** | `yml` | `{{yaml\ntitle: Doc\n}}` | Embeds the multiline YAML configuration blindly into an invisible `<script type="application/yaml">` block. |
| **NYML Parser** | N/A | `{{nyml\nkey: value\n}}` | NYML-specific parser logic. Evaluates and injects the resulting properties as an invisible `<script type="application/json">` block. A block whose `kind` is `document` (the document header) renders nothing. |
| **Test** | N/A | `{{test-block}}` | Reserved testing elements for structural plugin resolution constraints. |

> **📝 Escaping Plugins:**
> If you wish to display the literal plugin text `{{` instead of parsing it, you can escape the starting braces by putting a backslash in front: `\{{emoji smile}}`.

## Environment Requirement

Node.js ≥ 20.16 (file includes use `process.getBuiltinModule`); any modern browser via a bundler.
