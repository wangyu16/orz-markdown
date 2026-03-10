# @orz-how/markdown-parser

A deeply customized markdown-it parser configured with several official plugins and many custom plugins designed to render interactive objects, embedded rich media, and invisible data. Crafted alongside beautifully optimized CSS themes for an excellent out-of-the-box rendering experience.

## Installation

Install the package via npm:

```sh
npm install @orz-how/markdown-parser
```

## Quick Start

Import the configured markdown instance and use it to render markdown strings into HTML:

> **HTML Support:** The parser is initialized with `html: true`, so any raw
> HTML tags included in your markdown (e.g. `<div>Example</div>`) will be
> emitted verbatim instead of being escaped. Be aware of XSS risks when
> rendering untrusted content.


```javascript
import md from '@orz-how/markdown-parser';

const markdownSource = `
# Hello World
{{emoji wave}} This is a customized inline parsed text!
`;

const html = md.render(markdownSource);
console.log(html);
```

## Themes

We provide multiple ready-to-use CSS themes for rendering the output! You do not need to style the custom plugins from scratch.

Themes can be easily imported directly from the `themes` directory if you are using a bundler (like Vite, Webpack, etc.):

```javascript
import '@orz-how/markdown-parser/themes/light-academic-1.css';
// Or try: dark-elegant-2.css, light-playful-1.css, etc!
```

For a full list of provided themes and the underlying CSS class reference for theme authors, please read the [Themes Documentation](themes/README.md).

## Official Plugins Bundled

This project builds upon `markdown-it` and pre-configures a curated selection of official and popular community plugins.

- **markdown-it-anchor**: Header anchors
- **markdown-it-container**: 
  - Semantic Blocks: `success`, `info`, `warning`, `danger`
  - Layout Blocks: `left`, `right`, `center`
  - Interactive Blocks: `spoil` (spoilers), `tabs/tab`, `cols/col`
- **markdown-it-footnote**: Footnotes syntax (`[^1]`)
- **markdown-it-imsize**: Image sizing (`![alt](url =100x200)`)
- **markdown-it-mark**: Highlighted text (`==marked==`)
- **markdown-it-sub` & `markdown-it-sup**: Subscript (`~sub~`) and Superscript (`^sup^`)
- **markdown-it-ins**: Inserted text (`++inserted++`)
- **markdown-it-task-lists**: GitHub-style task lists (`- [x] Task`)
- **@traptitech/markdown-it-katex**: Math rendering, capable of rendering block math (`$$E=mc^2$$`), inline math (`$E=mc^2$`), and built-in `mhchem` chemistry extension.

## Custom Plugin Syntax Reference

We utilize a generalized and uniform `{{plugin_name ...}}` syntax for all custom plugins added out-of-the-box. The multi-line blocks simply ignore line breaks natively inside them unless handled by the plugin. 

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
| **YAML Objects** | `yml` | `{{yaml\ntitle: Doc\n}}` | Embeds the multiline YAML configuration blindly into an invisible `<script type="application/yaml">` block. |
| **NYML Parser** | N/A | `{{nyml\nkey: value\n}}` | NYML-specific parser logic. Evaluates and injects the resulting properties as an invisible `<script type="application/json">` block. |
| **Test** | N/A | `{{test-block}}` | Reserved testing elements for structural plugin resolution constraints. |

> **📝 Escaping Plugins:**
> If you wish to display the literal plugin text `{{` instead of parsing it, you can escape the starting braces by putting a backslash in front: `\{{emoji smile}}`.

## Environment Requirement

Designed natively for standard ESM environments Node.js 20+.
