# CLAUDE.md — orz-markdown

Guidance for AI agents working in this repository.

## What this is

`orz-markdown` is a customized [markdown-it](https://github.com/markdown-it/markdown-it)
parser (TypeScript) published to npm. It bundles official plugins, a custom
`{{name[args] body}}` plugin system, KaTeX, semantic/layout containers, themes,
a browser runtime, and an agent skill. Current version: see `package.json`.

## Commands

```bash
npm run build      # tsc → dist/  (dist is committed AND published — rebuild & commit after src changes)
npm test           # vitest run
npm run test:watch # vitest watch
npm run render     # tsx scripts/render.ts → tests/example.html (standalone themed demo)
```

## Architecture

- `src/index.ts` — the configured `md` instance: official plugins, all `::: name`
  container definitions, the custom block/inline dispatchers, and plugin
  registration. **Order matters**: `registerAttrs` runs before `registerToc` so
  TOC links use final heading ids (including `{{attrs[#...]}}` overrides).
- `src/registry.ts` — `register()` extension point; `getDefinition`/`hasBlock`.
- `src/rules/{block,inline}-dispatcher.ts` — parse `{{name[args] body}}`.
- `src/plugins/*.ts` — custom plugins (span, emoji, space, youtube, mermaid,
  smiles, qrcode, yaml, nyml, toc, attrs, markdown-include, test). Each calls
  `register({ type, aliases, render })`.
- `src/runtime.ts` — `browserRuntimeScript`, injected into output HTML. QR
  overlay behavior **and copy-as-markdown** (a DOM→Markdown walker,
  `OrzMarkdownRuntime.elementToMarkdown`).
- `src/prepare-sources.ts` — `prepareSources()` remote-include pre-pass.
- `themes/` — CSS themes (shipped in npm and served via jsDelivr).
- `orz-markdown-skills/` — the agent skill (`SKILL.md`, `references/`, `assets/`),
  shipped in the npm tarball.
- `dist/` — **committed and published** tsc output.

## Conventions & gotchas

- **`dist/` is tracked and published.** After changing `src/`, run `npm run build`
  and commit `dist/`. `prepublishOnly` also builds+tests.
- **`src/runtime.ts` is a `String.raw` template** of vanilla ES5 JS. Do **not**
  use template literals, backticks, or `${...}` inside it (use
  `String.fromCharCode(96)` for a backtick). It must stay dependency-free.
- **`data-md` breadcrumbs**: render-time attributes on generated constructs
  (mermaid, smiles, qrcode, youtube) so copy-as-markdown recovers their source.
  Don't strip them when post-processing.
- **Tests**: `tests/copy-markdown.test.ts` needs `happy-dom` (an optional
  devDependency) and **self-skips** if it isn't installed. The rest run on Node.
- Plugins emit specific HTML; if you change a plugin's output, update its test
  (and the runtime walker / `data-md` if it's a generated construct).

## Sibling project

`../orz-mdhtml` consumes this package (`orz-markdown`) to generate editable
`.md.html` files, and embeds `browserRuntimeScript` for in-file copy-as-markdown.
Parser changes that affect rendered HTML or the runtime may need a release +
bump there.

## Releasing

- Bump `package.json`, move CHANGELOG `[Unreleased]` → the new version, build,
  commit, push, then `npm publish`.
- Publishing needs an npm token (granular, **bypass-2FA**) written to a temporary
  `.npmrc` (untracked) and **deleted immediately after**. Never commit it.
- **Network note for this machine**: IPv6 is unreliable here — prefix npm/git
  network commands with
  `NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"`.

## After each major revision

**Check coherency and update the README and the agent skill.** When you change
syntax, plugin output, the runtime API, themes, or release/usage flow, make sure
`README.md` and `orz-markdown-skills/SKILL.md` (and its `references/`) still match
reality. Stale docs/skill are treated as bugs.
