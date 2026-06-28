# orz-markdown

A deeply customized markdown-it parser configured with several official plugins and many custom plugins designed to render interactive objects, embedded rich media, and invisible data. Crafted alongside beautifully optimized CSS themes for an excellent out-of-the-box rendering experience. An agent skill is available for using this markdown parser with AI agents. 

Rendered HTML is intended to live inside a `.markdown-body` container and be paired with one of the bundled themes.

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
import md from 'orz-markdown';

const markdownSource = `
# Hello World
{{emoji wave}} This is a customized inline parsed text!
`;

const html = md.render(markdownSource);

document.body.innerHTML = `<article class="markdown-body">${html}</article>`;
```

## Browser Runtime

Some rendered features expect a small browser runtime layer after the HTML is mounted. This includes QR-code expand/collapse behavior and **copy-as-Markdown**, and is designed so more client-side enhancements can share the same entry point.

```javascript
import { getBrowserRuntimeScript } from 'orz-markdown/runtime';

const runtimeScript = document.createElement('script');
runtimeScript.textContent = getBrowserRuntimeScript();
document.body.appendChild(runtimeScript);
```

If your app controls initialization directly, the runtime also exposes `window.OrzMarkdownRuntime.init(root)` and `window.OrzMarkdownRuntime.initQrCodes(root)`.

### Copy as Markdown

Once the runtime is loaded, selecting rendered content and copying it (Cmd/Ctrl-C) places **Markdown source** on the clipboard instead of HTML. A built-in DOM→Markdown walker reconstructs headings, emphasis, inline code, links, `==mark==`/`++ins++`/`~~del~~`/`~sub~`/`^sup^`, bullet/ordered/nested lists, task lists, tables (with alignment), blockquotes, fenced code (with language), images, and inline/display math.

It only transforms selections inside an element with class `markdown-body` (wrap your rendered output in one, e.g. `<article class="markdown-body">…</article>`, or mark a container with `data-orz-copy`), and never touches selections inside `<input>`, `<textarea>`, or `contenteditable` regions.

Generated constructs that lose their source after client-side rendering — `mermaid`, `smiles`, `qrcode`, `youtube` — carry a `data-md` attribute that the walker emits verbatim. As a result a copied table of contents yields its heading links (not `{{toc 2,3}}`) and a copied QR code yields `{{qr ...}}` (not its SVG). **Do not strip `data-md` attributes** if you post-process the HTML.

You can also convert a node programmatically:

```javascript
const markdown = window.OrzMarkdownRuntime.elementToMarkdown(someElement);
```

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

## Packaging

To rebuild distributable assets locally:

```sh
npm run build
npm test
npm pack
```

The generated tarball is written to the repository root and includes `dist/`, `themes/`, and `orz-markdown-skills/`.

## Agent Skill

The package ships an Agent Skill that teaches AI coding agents how to render with orz-markdown, write `{{...}}` plugin and `:::` container syntax, set up display pages, and work with the bundled themes. It also documents the block-ID preservation rules agents must follow when editing documents that use stable `{{attrs[#blk-...]}}` heading ids.

In the installed package, the skill lives at a stable path:

```
node_modules/orz-markdown/orz-markdown-skills/SKILL.md
```

with supporting files under `orz-markdown-skills/references/` and `orz-markdown-skills/assets/`. Point your agent tooling at that directory (e.g. copy or symlink it into your agent's skills folder).

## Official Plugins Bundled

This project builds upon `markdown-it` and pre-configures a curated selection of official and popular community plugins.

- **markdown-it-anchor**: Header anchors
- **markdown-it-container**:
  - Semantic Blocks: `success`, `info`, `warning`, `danger`
  - Layout Blocks: `left` (optional CSS width arg, e.g. `::: left 30%`), `right`, `center`
  - Interactive Blocks: `spoil` (spoilers), `tabs/tab`, `cols/col` (optional width ratios, e.g. `:::: cols 1 2 1`)
  - Arbitrary class: any `::: ClassName` not in the reserved list above becomes `<div class="ClassName">`
  - Note: a space between `:::` and the name is required; nesting uses more colons on the outer level
- **markdown-it-footnote**: Footnotes syntax (`[^1]`)
- **markdown-it-imsize**: Image sizing (`![alt](url =100x200)`)
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
| **Attributes** | N/A | `# Header {{attrs[id="my-id"]}}`| Injects continuous HTML attributes (classes, IDs, config properties) to the immediately preceding element. |
| **Emoji** | `em` | `{{emoji smile}}` / `{{em tada}}` | Renders the specific text alias directly into the corresponding Unicode emoji natively. |
| **Table of Content** | N/A | `{{toc}}` or `{{toc 2,3}}` | Autogenerates a Table of Contents based on document headings. Allows specifying bound heading ranges. |
| **Space** | N/A | `{{space 4}}` | Inserts inline horizontal whitespace entities directly into the text. |
| **YouTube** | `yt` | `{{youtube dQw4w9WgXcQ}}` | Embedded block element containing a responsive YouTube video iframe matching the ID. |
| **Markdown Source**| `md` | `{{md path/to/file.md}}` | Securely embeds the complete content of an external markdown file directly into the parsed structure. |
| **QR Code** | `qr` | `{{qr https://example.com}}` | Transforms text inline implicitly into an internally generated SVG QR Code natively. |
| **Mermaid** | `mm` | `{{mermaid\ngraph LR\nA-->B\n}}` | Compiles logic into a specific preconfigured payload targeted for Mermaid client-side rendering. |
| **SMILES Chemistry**| `sm` | `{{smiles C1=CC=CC=C1}}` | Embeds SMILES chemical formulas parsed specifically for `smilesDrawer` visualization. |
| **Chart** | N/A | `{{chart\ntype: bar\nlabels: A, B\ndata: 1, 2\n}}` | Declarative bar/line/pie/doughnut charts from a small line-based config (`type`, `labels`, `series: Name = …` or `data: …`, optional `title`). Rendered client-side with Chart.js. |
| **YAML Objects** | `yml` | `{{yaml\ntitle: Doc\n}}` | Embeds the multiline YAML configuration blindly into an invisible `<script type="application/yaml">` block. |
| **NYML Parser** | N/A | `{{nyml\nkey: value\n}}` | NYML-specific parser logic. Evaluates and injects the resulting properties as an invisible `<script type="application/json">` block. |
| **Test** | N/A | `{{test-block}}` | Reserved testing elements for structural plugin resolution constraints. |

> **📝 Escaping Plugins:**
> If you wish to display the literal plugin text `{{` instead of parsing it, you can escape the starting braces by putting a backslash in front: `\{{emoji smile}}`.

## Environment Requirement

Designed natively for standard ESM environments Node.js 20+.
