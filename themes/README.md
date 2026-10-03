# orz-markdown themes

Twelve ready-to-use CSS themes for the parser's output. All rendered HTML lives
inside `<article class="markdown-body">`, so every theme rule is scoped to that
class (or to the page roots — `:root`, `html`, `body`, `::selection`,
scrollbars — and the QR overlay), and a theme never restyles the host
page's own UI — see [references/themes.md](../orz-markdown-skills/references/themes.md).
Each theme `@import`s the shared `common.css` (the structure layer: container
floats and alignment, the cols grid, tab switching, scrolling for wide
tables/code/math, sizing of embeds, diagrams, charts and QR codes, the family's
640px breakpoint, and print; tune it with the `--orz-*` tokens at the top of
`common.css`), so you only ever
import a **single** theme file.

```js
// With a bundler:
import 'orz-markdown/themes/light-academic-1.css';

// Or over a CDN (jsDelivr):
// https://cdn.jsdelivr.net/npm/orz-markdown/themes/light-academic-1.css
```

## Bundled themes

| File | Style | Scheme |
|---|---|---|
| `light-neat-1.css` | Figtree headings · Source Sans 3 text · clean modern blue | Light |
| `light-neat-2.css` | Epilogue headings · Literata text · warm paper, teal | Light |
| `light-neat-3.css` | Bricolage Grotesque · calm green — "Orchard" | Light |
| `light-academic-1.css` | Alegreya throughout · cream paper, rubric red | Light |
| `light-academic-2.css` | Fira Sans headings · Vollkorn text · hairline structure | Light |
| `beige-decent-1.css` | Libre Caslon Display & Text · trade-book page, oxblood | Light |
| `beige-decent-2.css` | Josefin Sans headings · Cardo text · bottle green | Light |
| `light-playful-1.css` | Indie Flower headings · Shantell Sans text · ruled school notebook | Light |
| `light-playful-2.css` | Chewy stickers · Patrick Hand text · sketchbook | Light |
| `dark-elegant-1.css` | Cinzel headings · Source Serif 4 text · navy card | Dark |
| `dark-elegant-2.css` | Sora headings · Vollkorn text · near-black, orange | Dark |
| `dark-elegant-3.css` | Atkinson Hyperlegible Next headings · Charis SIL text · graphite editor — "Nocturne" | Dark |

`common.css` is not a theme — it is imported automatically by each theme above.

## Theming your own output

If you supply your **own** stylesheet instead of a bundled theme, the
[embedding guide](../orz-markdown-skills/references/embedding.md) lists every CSS
class the parser emits (semantic containers, tabs/columns, spoilers, KaTeX
blocks, Mermaid/SMILES/chart canvases, clickable QR codes) and the JavaScript the
browser runtime needs. Start from `common.css` for the structural rules and layer
your visual design on top.

## Line length

Each theme defaults to a reading measure of about 70 characters. Choose a
wider one on the article: `class="markdown-body measure-wide"` (about 90
characters; a theme tunes it with `--orz-measure-wide`) or `measure-full`
(the whole width).
