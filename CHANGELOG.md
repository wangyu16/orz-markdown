# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-07-11

### Added

- `prepareSources(src, opts?)` — the async URL-include pre-pass (`{{markdown
  https://…}}` / `{{md-include https://…}}`) — gained options for safe
  host-embedded use: `allowedHosts` (resolve includes only from an allowlist —
  an SSRF guard when resolving host-authored content server-side), an injectable
  `fetcher` (control transport/auth; defaults to the global `fetch`), and
  `maxDepth` (recursion for includes-of-includes, default 3). Includes now
  resolve recursively with an ancestor-chain cycle guard, and the directive is
  replaced by index-splice so fetched markdown containing `$&`/`$1` is not
  corrupted. Fully backward compatible — no options means the prior behavior
  (global `fetch`, any host, single pass).

### Fixed

- Limited the website editor service worker to its explicit offline app-shell
  assets so it can no longer retain stale pages or editable-file starters.
- Versioned the official starter links to bypass entries left by the previous
  root-scoped cache and ensure newly created files use current framework releases.

## [1.4.1] - 2026-07-11

### Security

- Updated `markdown-it` to `^14.3.0` (and its fixed `linkify-it ^5.0.2`
  dependency) to address quadratic-complexity denial-of-service advisories in
  smartquotes and automatic link scanning. Updated the build/test toolchain to
  fixed `esbuild`, `happy-dom`, and `vitest` releases.

## [1.4.0] - 2026-07-10

### Added

- A shared document-metadata API for the editable orz family:
  `extractDocMeta`, `mergeDocMeta`, `renderDocMetaHead`,
  `renderDocMetaIsland`, and `parseDocMetaIsland`, available from
  `orz-markdown/doc-meta` and the main export. It normalizes author, license,
  canonical source, publication date, description, and keywords into standard
  `<head>` tags plus a machine-readable `#orz-meta` JSON island.
- A shared `{{nyml}}` block scanner, hoisted from orz-paged so mdhtml, slides,
  and paged use one grammar for document metadata.

## [1.3.2] - 2026-07-06

### Fixed

- **Explicit image sizes (`![alt](url =WxH)`) now render at the requested
  dimensions.** `markdown-it-imsize` already emitted `width`/`height`
  *attributes* on the `<img>`, but the shared theme rule in `themes/common.css`
  set `.markdown-body img { width: auto; height: auto }` unconditionally — and a
  CSS property overrides an HTML attribute, so sized images collapsed back to
  their intrinsic size. The `auto` sizing is now scoped to images **without** an
  explicit dimension (`img:not([width])` / `img:not([height])`), so the
  responsive default is preserved while `=WxH` wins.
  - `![](photo.png =200x100)` → 200×100 (still capped to container by
    `max-width: 100%`).
  - `![](photo.png =200x)` / `![](photo.png =x100)` → constrains only the given
    axis; the other stays proportional.
  - `![](photo.png)` (no size) → unchanged: intrinsic size, responsive.
  - **For downstream docs / custom CSS:** mirror the
    `img:not([width])` / `img:not([height])` pattern rather than a blanket
    `.markdown-body img { height: auto }`, which would re-break explicit sizes.

## [1.3.1] - 2026-07-05

### Added

- Zenodo DOI + citation metadata (`CITATION`/citation note) for the
  orz-markdown editable-document family, and website starter pages/docs
  (paged reference, slides layouts & syntax, "For agents" / skill install
  routes). Standalone site and editor chrome only — no change to the library
  API or rendered Markdown output.

### Changed

- Standalone website header is now adaptive on narrow screens; editor gains a
  GitHub link and a `© orz-markdown` footer linking to markdown.orz.how.

## [1.3.0] - 2026-06-28

### Added

- New bundled theme **`light-neat-3.css` ("Orchard")** — Bricolage Grotesque
  headings, a calm green accent, and generous spacing; ships frameless (no card
  border) on a solid background.
- New bundled theme **`dark-elegant-3.css` ("Nocturne")** — a VS Code-dark theme:
  Lora serif body, colourful headings (blue/amber/green/red/pink), blue accents, and
  decorative touches (underline bars, ✦ markers, star rules, quote-mark blockquotes,
  translucent blurred callouts).
- `orz-markdown/preview-frame` export with `getPreviewFrameAssets()` — a one-call
  helper for host apps that mount rendered output in an `<iframe>` (viewers,
  editors, slide/page engines). Returns the pinned CDN URLs, the browser runtime,
  `headLinks(scheme)` / `bodyScripts()` strings, and a `window.__orzEnhance()` that
  highlights code, draws mermaid/SMILES/charts, and inits tabs + QR — so every host
  wires the preview identically instead of re-deriving it. See the skill's
  `references/embedding.md`.
- `{{chart}}` plugin — declarative bar/line/pie/doughnut charts from a tiny
  line-based config (`type:`, `labels:`, `series: Name = …` / `data: …`,
  optional `title:`). Emits a `<canvas class="orz-chart" data-chart="…">` with
  the Chart.js config as escaped JSON plus a `data-md` breadcrumb (round-trips
  via copy-as-markdown). The host runtime draws it with Chart.js, the same way
  smiles canvases are painted.

### Changed

- Theme refresh across the bundled themes: modernised blockquotes, callouts and
  spoilers (a distinct, contemporary treatment per theme rather than the same
  flat box); harmonised, varied code blocks; a unified base body font size so the
  perceived text size stays consistent when switching themes; solid (non-tiling)
  backgrounds where gradients repeated on long documents; and a modern "Contents"
  table-of-contents panel for `light-academic-1`.
- Dark themes (`dark-elegant-1/2/3`) now render Mermaid diagrams and `{{chart}}`
  canvases on a soft translucent light panel, so their light-default drawing
  (dark-on-light) stays legible against the dark page background.

### Fixed

- Copy-as-Markdown now recovers **block (display) math** as `$$…$$`. Display math
  renders as `<p class="katex-block"><span class="katex-display">…`; the walker
  treated that wrapper as a paragraph and emitted the inner equation as *inline*
  `$…$`. It now detects the `katex-block`/`katex-display` wrapper (→ `$$…$$`), and a
  selection inside a display equation promotes to the whole equation.
- Copy-as-Markdown now recovers `{{sp[…] …}}` spans. The DOM→Markdown walker
  previously emitted only the inner text of a `<span class="…">`; it now
  reconstructs `{{sp[class] body}}` (e.g. `{{sp[red] text}}`,
  `{{sp[success] ✓ Done}}`). Other spans (`{{space}}` has no class, emoji emits
  text) are unaffected.
- Copy-as-Markdown now recovers `::: container` blocks. The walker emitted only a
  container's inner content; it now reconstructs the directive — `::: info`,
  `::: center`, `::: spoil Title`, and nested `:::: cols`/`::: col` and
  `:::: tabs`/`::: tab Label` (fence length grows so nesting re-parses; the
  JS-injected `.tabs-bar` is skipped).
- Copy-as-Markdown promotes a selection sitting inside a `::: container` to the
  whole container, so copying its content includes the `:::` fence — mirroring
  the existing table/blockquote/code-block promotion. Containers nest, so the
  selection is promoted to the **outermost** one (a copy inside one column of a
  `:::: cols` yields the full `:::: cols … ::::`, not the inner `::: col`).

## [1.2.2] - 2026-06-24

### Fixed

- Browser safety: `markdown-include` no longer throws `process is not defined`
  when the parser runs in a browser bundle. `process.cwd()` is now guarded; in
  the browser the include simply renders empty (filesystem reads aren't
  available there).

### Changed

- Tab interactivity moved into `browserRuntimeScript` as
  `OrzMarkdownRuntime.initTabs(root)` (run by `init()`), so every page that
  embeds the runtime gets working `::: tabs` — not just the standalone demo.
  The bespoke tabs script was removed from `scripts/render.ts`.

## [1.2.1] - 2026-06-24

### Fixed

- Copy-as-Markdown now copies the whole block when a selection sits entirely
  within a table, blockquote, or code block. Browsers often clone such
  selections without the wrapping element, so previously copying a whole table
  or blockquote yielded only its inner text (no pipes / no `>`); the selection
  is now promoted to the containing block. The DOM→Markdown walker also
  reconstructs a table from bare `thead`/`tbody`/`tr` nodes as a fallback.

## [1.2.0] - 2026-06-24

### Added

- Copy-as-Markdown: selecting and copying rendered content now yields Markdown
  source instead of HTML, for every document (the handler ships in
  `browserRuntimeScript`). A dependency-free DOM→Markdown walker reconstructs
  headings, emphasis, code, links, mark/ins/del/sub/sup, bullet/ordered/nested
  lists, task lists, tables (with alignment), blockquotes, fenced code (with
  language), images, and inline/display math (recovered from the KaTeX
  `<annotation>`). The copy handler ignores selections inside inputs/textareas
  and only acts within `.markdown-body` (or `[data-orz-copy]`). Exposed as
  `OrzMarkdownRuntime.elementToMarkdown(node)`.
- `data-md` breadcrumbs on generated constructs whose source is otherwise lost
  after client-side rendering — `mermaid`, `smiles`, `qrcode`, `youtube`. The
  walker emits these verbatim, so a table of contents copies its heading links
  (not `{{toc 2,3}}`) and a QR code copies `{{qr ...}}` (not its SVG).

## [1.1.0] - 2026-06-11

### Fixed

- TOC ordering bug: `attrs` now registers before `toc`, so the `attrs_resolve`
  core rule runs before `toc_resolve` and `{{toc}}` links point at the final
  heading ids. Previously, headings carrying a custom id via `{{attrs[#...]}}`
  produced dead TOC links to the superseded `markdown-it-anchor` slug.
- Trailing-space artifact: `## Title {{attrs[#x]}}` no longer leaves a trailing
  space in the rendered heading text or in TOC entries. Trailing whitespace
  before a removed end-of-line `{{attrs}}` marker is trimmed.

### Added

- The Agent Skill (`orz-markdown-skills/`) is now included in the published
  npm package, at the stable path
  `node_modules/orz-markdown/orz-markdown-skills/SKILL.md`. Documented in a new
  README "Agent Skill" section.
- `orz-markdown-skills/references/block-ids.md`: stable block-ID preservation
  rules for AI editors (`{{attrs[#blk-...]}}` ids are immutable, never reused,
  never duplicated, never converted to/from Pandoc `{#id}` syntax), plus a
  summary section in `SKILL.md`.
- Regression tests pinning that a heading id set via `{{attrs[#...]}}` exactly
  overrides the `markdown-it-anchor` slug and survives heading-text edits.

## [1.0.0] - 2026-04-13

### Added

- Initial npm release: customized `markdown-it` instance with official plugin
  bundle (anchor, container, footnote, imsize, mark, sub, sup, ins,
  task-lists, KaTeX with mhchem), custom `{{name[args] body}}` plugin
  dispatcher (span, emoji, space, qrcode, youtube, mermaid, smiles, toc,
  attrs, markdown include, yaml, nyml), `register()` extension point,
  `prepareSources()` remote-include pre-pass, browser runtime script, and 10
  bundled CSS themes.
