# orz-markdown themes

Twelve ready-to-use CSS themes for the parser's output. All rendered HTML lives
inside `<article class="markdown-body">`, so every theme is scoped to that class.
Each theme `@import`s the shared `common.css` (structural rules for tables,
images, KaTeX blocks, QR overlays, tabs/columns, and print), so you only ever
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
| `light-neat-1.css` | Figtree · clean modern sans | Light |
| `light-neat-2.css` | Light neat variant | Light |
| `light-neat-3.css` | Bricolage · calm green — "Orchard" | Light |
| `light-academic-1.css` | Alegreya · justified scholarly prose | Light |
| `light-academic-2.css` | Light academic variant | Light |
| `beige-decent-1.css` | Warm beige · print-like prose | Light |
| `beige-decent-2.css` | Beige decent variant | Light |
| `light-playful-1.css` | Casual · personal blog | Light |
| `light-playful-2.css` | Light playful variant | Light |
| `dark-elegant-1.css` | Cinzel headings · scholarly serif | Dark |
| `dark-elegant-2.css` | Dark elegant variant | Dark |
| `dark-elegant-3.css` | Lora · VS Code-dark, colourful headings — "Nocturne" | Dark |

`common.css` is not a theme — it is imported automatically by each theme above.

## Theming your own output

If you supply your **own** stylesheet instead of a bundled theme, the
[embedding guide](../orz-markdown-skills/references/embedding.md) lists every CSS
class the parser emits (semantic containers, tabs/columns, spoilers, KaTeX
blocks, Mermaid/SMILES/chart canvases, clickable QR codes) and the JavaScript the
browser runtime needs. Start from `common.css` for the structural rules and layer
your visual design on top.
