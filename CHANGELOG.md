# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `{{chart}}` plugin — declarative bar/line/pie/doughnut charts from a tiny
  line-based config (`type:`, `labels:`, `series: Name = …` / `data: …`,
  optional `title:`). Emits a `<canvas class="orz-chart" data-chart="…">` with
  the Chart.js config as escaped JSON plus a `data-md` breadcrumb (round-trips
  via copy-as-markdown). The host runtime draws it with Chart.js, the same way
  smiles canvases are painted. (Not yet published to npm.)

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
