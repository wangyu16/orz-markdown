# Theme Style Rule Inventory

This document is derived from:

- `tests/example.html`, which exercises the rendered HTML structure produced by the parser
- all current theme files under `themes/`

Its purpose is to define the style-rule coverage each theme needs, so the CSS files can be reorganized into a shared structure without losing behavior.

## Rendered Structure To Support

The example document requires theme support for these rendered elements and classes:

### Document shell

- `html`
- `body`
- `.markdown-body`
- global reset selectors such as `*`, `*::before`, `*::after`

### Core typography

- `h1`, `h2`, `h3`, `h4`, `h5`, `h6`
- `.header-anchor`
- `p`
- `strong`
- `em`
- `s`, `del`
- `mark`
- `ins`
- `sub`, `sup`
- `a`, `a:hover`, `a:visited`

### Lists

- `ul`, `ol`
- `li`
- nested lists such as `li > ul`, `li > ol`
- `.task-list-item`
- `.task-list-item input[type="checkbox"]`
- checked checkbox state and marker pseudo-element

### Code and math

- `code`
- `pre`
- `pre code`
- `.katex`
- `.katex-display`
- `.katex-error`

### Content blocks

- `blockquote`
- nested blockquotes
- `table`
- `thead`, `tr`, `th`, `td`, `tbody`
- `hr`
- `img`
- `p > img`

### Containers and utilities

- `.success`, `.info`, `.warning`, `.danger`
- semantic container title selectors such as `> p:first-child > strong:first-child`
- `.left`, `.right`, `.center`
- `details.spoil`
- `details.spoil > summary`
- spoiler open-state selectors
- `.tabs`
- `.tabs-bar`
- `.tabs-bar-btn`
- `.tabs-bar-btn.active`
- `.tab`
- `.tab.active`
- `.cols`
- `.col`

### Navigation and references

- `nav.toc`, `.toc-list`
- nested TOC list selectors
- `.footnotes-sep`
- `.footnotes`
- `.footnote-ref a`
- `.footnote-backref`

### Inline plugin output

- `span.red`, `span.yellow`, `span.green`, `span.blue`
- `span.success`, `span.info`, `span.warning`, `span.danger`
- `span.qrcode`
- `span.qrcode svg`
- `span.test-inline`

### Block plugin output

- `div.youtube-embed`
- `div.youtube-embed iframe`
- `div.mermaid`
- `div.smiles-render`
- `div.smiles-render canvas`
- `div.test-block`

## Shared Baseline Rule Groups

Every theme should keep a rule group for each item below, even if the visual treatment differs.

## General Requirements Integrated

The following requirements apply to all themes and should be treated as refactor constraints.

### Structural requirements for every theme CSS file

- each theme should follow the same section order
- base font size and base line-height should be declared near the top of the file in theme tokens
- `.markdown-body` sizing and border treatment should be easy to enable, disable, or override
- images must respect Markdown-defined dimensions while staying inside the container and preserving aspect ratio
- ordered lists must render as `1, 2, 3, ...`, never `01, 02, 03, ...`
- tables should size to their content when narrower than the page instead of always stretching to full width
- badges must fit a single line height and must not inject label text such as `OUTCOME`, `CAUTION`, or similar
- serif themes must include `Noto Serif TC` and `Noto Serif SC`
- sans themes must include `Noto Sans TC` and `Noto Sans SC`
- handwritten themes should prefer `Hanzi Pen TC` and `Hanzi Pen SC`
- print rules must strip outer body framing, fit paper width, avoid splitting media, and repeat table headers across pages

### Theme-side requirements with renderer or runtime dependencies

- QR codes should expose an enlarge interaction with a clickable affordance icon and a full-screen expanded state
- SMILES output should render directly on the page background with no decorative container treatment
- SMILES sizing should stay modest, targeting roughly a 4em bond length where renderer support allows it
- dark themes should render SMILES with white default bonds and atoms; light themes should render them in black

### Immediate implementation guidance

- theme CSS should provide the visual hooks and selector coverage for all general requirements
- requirements that need renderer or runtime behavior should still be reflected in theme selector structure now, even if the interaction logic lives outside the theme file

### 1. Tokens and global setup

- theme variables on `:root` or equivalent
- reset and box-sizing
- base `html` behavior
- base `body` layout
- `.markdown-body` width, spacing, and surface styling
- optional print rules
- optional responsive rules

### 2. Headings and body copy

- `h1` to `h6`
- `.header-anchor`
- `p`
- `strong`, `em`, `s`, `del`, `mark`, `ins`, `sub`, `sup`
- links and link states

### 3. Lists and task lists

- `ul`, `ol`, `li`
- nested list spacing
- custom bullet treatment if used
- `.task-list-item`
- checkbox base, checked state, and checkmark pseudo-element

### 4. Code and math

- inline `code`
- `pre`
- `pre code`
- `.katex`
- `.katex-display`
- `.katex-error`

### 5. Structural blocks

- `blockquote`
- nested `blockquote`
- `table`, `thead`, `tbody`, `th`, `td`
- row hover or alternate state if used
- `hr`
- `img`
- `p > img`

### 6. Containers and layout helpers

- `.success`, `.info`, `.warning`, `.danger`
- semantic container title emphasis
- nested semantic container spacing if needed
- `.left`, `.right`, `.center`
- `details.spoil`
- `summary` styling and disclosure marker
- `.tabs`, `.tabs-bar`, `.tabs-bar-btn`, `.tab`
- `.cols`, `.col`

### 7. Navigation, footnotes, and plugin output

- `nav.toc`, `.toc-list`
- `.footnotes-sep`, `.footnotes`, `.footnote-ref`, `.footnote-backref`
- span color classes
- span badge classes
- `.qrcode`
- `.youtube-embed`
- `.mermaid`
- `.smiles-render`
- `.test-block`
- `.test-inline`

## Required Rule Coverage By Theme

Each theme below is split into:

- common mandatory coverage inherited from the shared baseline
- theme-specific extras that also need to remain supported

## dark-elegant-1.css

### Mandatory coverage

- all shared baseline rule groups
- custom WebKit scrollbar styling
- print overrides for body, `.markdown-body`, links, code, pre, blockquotes, and embedded video hiding

### Theme-specific extras

- dark color palette and dark surfaces
- elevated panel treatment for `.markdown-body`
- dramatic heading treatments for `h1`, `h2`, and `h3`
- hover-revealed `.header-anchor`
- custom unordered-list marker using `li::before`
- styled semantic containers with per-state title coloring
- tabs fallback selectors for non-JS mode
- responsive single-column behavior for `.cols` and `.left`
- fallback selector for arbitrary span classes under `.markdown-body span[class]`

## dark-elegant-2.css

### Mandatory coverage

- all coverage required by dark-elegant-1

### Theme-specific extras

- font modifiers on `body` and `.markdown-body`
  - `.font-serif`
  - `.font-sans`
  - `.font-handwritten`
  - `.font-typewrite`
- size modifiers on `body` and `.markdown-body`
  - `.size-xs`
  - `.size-sm`
  - `.size-lg`
  - `.size-xl`
- dark `color-scheme`
- decorative pseudo-elements on `.markdown-body` and headings
- richer ambient backgrounds and layered surfaces
- expanded token system for font scale, shadows, and accent variants

## beige-decent-1.css

### Mandatory coverage

- all shared baseline rule groups

### Theme-specific extras

- warm neutral palette and paper-like surface styling
- magazine-style or editorial blockquote treatment
- TOC styling consistent with the beige theme language
- tabs and columns styled to match the softer editorial presentation

## beige-decent-2.css

### Mandatory coverage

- all coverage required by beige-decent-1

### Theme-specific extras

- alternate spoiler disclosure styling, including animated open and closed states
- alternate tab-button treatment with rounded presentation
- any simplified or revised blockquote styling specific to version 2

## light-academic-1.css

### Mandatory coverage

- all shared baseline rule groups

### Theme-specific extras

- restrained academic typography and spacing
- booktabs-style table treatment
- Tufte-like or scholarly content density adjustments
- footnotes and math styling aligned with the academic reading mode

## light-academic-2.css

### Mandatory coverage

- all coverage required by light-academic-1

### Theme-specific extras

- semantic container labels via pseudo-elements
  - `.success::before`
  - `.info::before`
  - `.warning::before`
  - `.danger::before`
- alternate semantic naming and presentation for callouts while keeping the same container classes

## light-neat-1.css

### Mandatory coverage

- all shared baseline rule groups

### Theme-specific extras

- font modifiers on `body` and `.markdown-body`
  - `.font-serif`
  - `.font-sans`
  - `.font-handwritten`
  - `.font-typewrite`
- size modifiers on `body` and `.markdown-body`
  - `.size-xs`
  - `.size-sm`
  - `.size-lg`
  - `.size-xl`
- subtle grid or paper-structure pseudo-elements on the document shell
- light, tidy heading accents and background overlays

## light-neat-2.css

### Mandatory coverage

- all coverage required by light-neat-1

### Theme-specific extras

- additional decorative pseudo-elements on `.markdown-body` and headings
- repeated line or rule overlays for the neat visual system
- enhanced heading markers, dividers, or badges compared with version 1

## light-playful-1.css

### Mandatory coverage

- all shared baseline rule groups

### Theme-specific extras

- notebook or paper-line background treatment
- sticker or sticky-note style semantic containers
- pseudo-element tape effects on containers or panels
- dashed borders, rotation transforms, and playful shadow treatments

## light-playful-2.css

### Mandatory coverage

- all shared baseline rule groups

### Theme-specific extras

- hand-drawn or asymmetric border-radius shapes
- doodle-like heading or shell decoration
- text stroke or sketch-style heading treatment
- playful rule and divider patterns for `hr`
- stronger outline and offset shadow effects than version 1

## Recommended Unified CSS File Structure

To make the next refactor manageable, each theme should follow the same section order.

## Proposed section order

1. `@import` and theme metadata comments
2. `:root` theme tokens
3. optional modifier classes
4. reset and base document shell
5. container toggles for `.markdown-body`
6. typography
7. links and inline emphasis
8. lists and task lists
9. code and math
10. blockquotes, tables, images, hr
11. semantic containers
12. layout utilities
13. spoiler, tabs, and columns
14. TOC and footnotes
15. plugin output blocks and inline plugin output
16. decorative pseudo-elements and theme-only flourishes
17. responsive rules
18. print rules

## Shared partials worth extracting later

- reset and document shell
- markdown-body container toggles
- heading and body-copy structure
- list and task-list structure
- code and KaTeX structure
- table structure
- semantic container structure
- spoiler, tabs, and columns structure
- TOC and footnotes structure
- plugin output structure

Those shared partials can keep selectors stable while leaving variables and a small number of theme-only overrides to define each visual style.

## Cross-Theme Compliance Checklist

- [ ] same section order exists in every theme file
- [ ] base font size and line-height are tokenized near the top of each file
- [ ] `.markdown-body` max width, padding, border, and shadow are easy to override
- [ ] image rules preserve Markdown width or height hints without overflow
- [ ] ordered lists use decimal numbering rather than leading-zero numbering
- [ ] narrow tables shrink to content width instead of stretching unnecessarily
- [ ] QR code selectors include affordance and expanded-state hooks
- [ ] SMILES containers are visually neutral and do not add decorative box styling
- [ ] badge selectors enforce single-line presentation and no pseudo-label text
- [ ] handwritten font stacks include Hanzi Pen fallbacks
- [ ] print rules repeat `thead` and avoid page breaks inside images, videos, and important embeds

## Refactor Checklist

- [ ] every theme covers the shared baseline selector groups
- [ ] selector names stay identical across themes
- [ ] modifier support is documented per theme
- [ ] decorative pseudo-elements are isolated from structural rules
- [ ] responsive behavior is grouped consistently
- [ ] print behavior is grouped consistently where applicable
- [ ] plugin output selectors stay present in every theme