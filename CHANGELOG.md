# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
