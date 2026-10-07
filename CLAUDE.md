# CLAUDE.md — orz-markdown

Guidance for AI agents working in this repository.

> **orz family:** this repo is one member of the orz family — before changing anything another member depends on, read the family docs via [`../CLAUDE.md`](../CLAUDE.md) (contracts, shared rules, release order, and drift ledger in `../docs/`).

## What this is

`orz-markdown` is a customized [markdown-it](https://github.com/markdown-it/markdown-it)
parser (TypeScript) published to npm. It bundles official plugins, a custom
`{{name[args] body}}` plugin system, KaTeX, semantic/layout containers, themes,
a browser runtime, and an agent skill. Current version: see `package.json`.

## Commands

```bash
npm run build      # prebuild (src/version.ts + skill template.html) → tsc → dist/ (dist is committed AND published)
npm test           # vitest run
npm run test:watch # vitest watch
npm run render     # tsx scripts/render.ts → tests/example.html (standalone themed demo; diff it to catch output changes)
npm run build:web  # docs/orzmd.browser.js (site editor bundle) + sync docs/themes from themes/
npm run check:site # website starter versions + discovery metadata
npm run build:codemirror # vendor/codemirror6.js (the editor's pinned CodeMirror 6 bundle) + src/carrier/editor/codemirror-pin.ts
```

## Architecture

- `src/index.ts` — the configured `md` instance: official plugins, all `::: name`
  container definitions, the custom block/inline dispatchers, and plugin
  registration. **Order matters**: `registerAttrs` runs before `registerToc` so
  TOC links use final heading ids (including `{{attrs[#...]}}` overrides).
- `src/registry.ts` — `register()` extension point; `getDefinition`/`hasBlock`.
- `src/rules/{block,inline}-dispatcher.ts` — parse `{{name[args] body}}`.
- `src/rules/footnote-tail.ts`, `src/rules/task-lists.ts` — linear ports of the
  upstream core rules (identical output).
- `src/plugins/*.ts` — custom plugins (span, emoji, space, youtube, mermaid,
  smiles, chart, qrcode, yaml, nyml + nyml_parser, toc, attrs, markdown-include,
  test) call `register({ type, aliases, render })`; `imsize.ts` (`=WxH`) and
  `cjk.ts` (CJK emphasis, line breaks, linkify) are markdown-it rules.
- `src/env.ts` — `inlineEnv`/`rootEnv`: the env for inline renders inside a document.
- `src/html.ts` — the ONLY escaping helpers (`escapeHtml`, `escapeAttr`,
  `jsonForScript`, `escapeScriptText`/`unescapeScriptText`). Every value that
  reaches HTML goes through them.
- `src/ascii.ts` — `asciiLower`: ASCII-only case mapping. Use it for HTML names and
  whenever a lowered copy's offsets are applied to the original (`toLowerCase()`
  changes length for `İ` and others; claim M.23).
- `src/source-scan.ts` — `maskInertMarkdown`: blanks code/comments/HTML blocks so
  pre-render scanners (nyml, prepareSources) agree with the renderer.
- `src/doc-meta.ts`, `src/nyml-blocks.ts` — the family's DocMeta API and nyml scanner.
- `src/preview-frame.ts` — pinned content-library versions/URLs + `__orzEnhance`.
- `src/carrier.ts` — `orz-markdown/carrier`, shared carrier building blocks (FD-03):
  the escaping helpers plus the carrier kit core in `src/carrier/` (FC-18 text
  format 1): `header.ts` (read/edit/lint the `{{nyml kind: document}}` header),
  `document.ts` (`readDocument`, file-name kinds and twins), `uid.ts`
  (`mintUid`, the only randomness), `text.ts` (line-ending/surrogate facts),
  `links.ts` (twin-link rule, inert unless `env.orzTwinLinks`), `envelope.ts`
  (`assembleEnvelope`), `read.ts` (`extract`/`readIslandFromDom`/`decodeText`:
  parser-free, exported as `orz-markdown/carrier/read`), `parser.ts` (the kit's
  private parser from `createMarkdown()` in `src/index.ts`, so a host's
  `md.set()` cannot change assembled bytes; K.19). The parser entry must
  never import `src/carrier/` (claim K.8); envelope code stays deterministic
  (K.2). `src/nyml-body.ts` is the flat nyml reader shared by the scanner and
  the header tools.
- `src/carrier/shell/` — `orz-markdown/carrier/shell`, the browser runtime of
  every assembled file (spec/shell-runtime.md, spec/host-protocols.md):
  `createSaver` (host → served notice → File System Access with the handle in
  IndexedDB under the header `uid` + page location, reused only on that page
  — every `file:` page shares one IndexedDB — and only when its file's
  content proves it is the opened file (`openedHtml`, or what this page last
  wrote through it): names prove nothing, a picker opens in the last folder
  used → download; it saves the HTML the caller assembled, never the live DOM), `createPreferenceStore` (reader preferences
  by `uid`, fail closed), `connectHost` / `embedCarrierFrame` (file and host
  sides of `orz-host-save/-ai/-include@1`), the quiet update in `update.ts`
  (`checkForUpdate` once a day per kind, `reassemble` — SHA-384-verified,
  script-safe bundle run in a `sandbox="allow-scripts"` iframe, accepted only
  when `extract` gives back the exact text/kind/version/delivery and the
  file's `#orz-includes` (a page cannot resolve local includes again) — and
  `performUpdate`, which re-reads the text before saving and says when a
  reload is safe; no check in a framed/hosted or served page) with
  `mountUpdateIndicator` in `indicator.ts`, and the
  shell chrome in `chrome.ts` (`CHROME_CSS` tokens, `ICONS`,
  `createShadowRoot`, `showToast`). Update URLs are hard-coded (jsDelivr +
  `KIND_PACKAGE`, RULES §5.4): never add a path that takes a URL from a
  document. Parser-free (its only non-shell import is the parser-free
  `read.ts`) and Node-safe (no browser global touched at load; claims S.11,
  U.10, V.5); not imported by `orz-markdown/carrier`, whose import graph must
  stay free of browser state (K.2). Only `chrome.ts` writes `innerHTML`, and
  only `ICONS` constants (V.4); no shell module reads the page DOM (S.4).
- `src/carrier/editor/` — `orz-markdown/carrier/editor`, the editor shell
  every carrier's `mountEditor` wraps (FC-19 §8): `createEditorShell` (toolbar,
  split/editor/preview modes, draggable split, keyboard map, one pane below
  640 px, save via `hooks.save` or `assemble` + `createSaver`, reader
  preferences by `uid`, the FC-19 §3 hooks, `formats` (a newer text format
  is read-only and never saved), `setReadOnly`), `text-model.ts` (the exact
  text — BOM, line endings, per remembered text — behind an LF editor; never
  normalise the text in storage), `adapter.ts`
  (`TextEditorAdapter`, `textareaAdapter`), `codemirror6.ts`
  (`codemirror6Adapter`: textarea first, upgraded when CodeMirror loads),
  `preview.ts` (the preview frame — its sandbox comes ONLY from
  `previewSandbox()`: `allow-scripts`, plus `allow-same-origin` only for a
  standalone `file:` page that is top-level with no host (owner, B-2); never add it anywhere else — and its bridge, the message protocol a carrier's own bridge
  speaks). Frame messages act only as claim E.14 says (owner, option B):
  the shell hands the port only for a ready carrying the frame's secret
  (`data-orz-preview-secret` on the bridge's `<script>`, read and removed by
  the bridge first thing; a forged or second ready is ignored and never
  closes the real port); keys, links, input and scrolls act only through
  that port, from trusted events; nothing on the window ever acts on keys,
  links, focus or scroll. Accepted limit (FC-19 §5 invariant 3, M.21): a
  document's own scripts may take the keyboard focus inside the preview, so
  keys can go there — never add focus-theft detection or pausing back; the
  guarantee is no host access, no navigation or window without the
  reader's click, and no save, mode change, link or editor scroll except by
  the reader's own keys/clicks through the port. The bridge must keep
  reading the secret and taking the port first (a capture listener
  registered before anything else) and send with the
  `Reflect.apply`/`postMessage` it cached at start; recompute
  `PREVIEW_BRIDGE_HASH` (E.19) after any bridge change. Patches and other
  strings the editor keeps go through `detachString` (V8 slices keep the whole
  text alive; E.21). `render-md.ts`
  (`renderMarkdownPreview`, `renderMarkdownPreviewWithIncludes`,
  `data-src-line` anchors). It may import the
  parser; `carrier/shell`, `carrier/read` and `carrier` must not import it
  (E.10). CodeMirror 6 is ONE pinned bundle, `vendor/codemirror6.js`
  (shipped in the package, loaded from jsDelivr `orz-markdown@<VERSION>` with
  SRI): the `@codemirror/*` devDependencies are pinned exactly; after changing
  one run `npm run build:codemirror` (E.11 fails otherwise). Never load
  per-package `+esm` URLs (they duplicate `@codemirror/state`).
- `src/carrier/conformance/` — `orz-markdown/carrier/conformance`, the
  Node-side conformance harness each carrier runs against itself
  (spec/conformance.md): `runConformance` / `registerConformance` over the
  `CHECKS` catalog (stable ids `C.<area>.<name>` that carrier claims cite —
  never rename one; add new ones). Checks run side by side in lanes, each in
  browser contexts of its own (`Session.scope()`; never share a context or
  patch a global across an `await`); timing-sensitive ones go in
  `EXCLUSIVE_CHECKS`. Real Chrome via a lazily imported
  `playwright-core` (optional peer, never a dependency), local origins, a
  closed network where only the release's hard-coded jsDelivr URLs are
  answered; page-side code is plain JS strings in `page.ts` (it must not
  depend on how this file is compiled). No other entry may import it (H.4).
  Proved against the stub carrier in `tests/conformance-stub/` (built at test
  time; test scaffolding, not a product) and broken builds of it (H.5). Its
  default corpus is the shipped `tests/carrier-corpus/` (in `files`).
- `spec/` — binding carrier specs owned here: FC-18 (text form and assembly)
  and FC-19 (editor component), plus the canonical host protocols (FC-12)
  and the shell runtime (FC-11). Change them only through the family's
  contract-change rules; the golden corpus is `tests/carrier-corpus/`.
- `src/version.ts` — GENERATED by `scripts/sync-version.ts`; never edit.
- `src/runtime.ts` — `browserRuntimeScript`, injected into output HTML. QR
  overlay behavior **and copy-as-markdown** (a DOM→Markdown walker,
  `OrzMarkdownRuntime.elementToMarkdown`).
- `src/prepare-sources.ts` — `prepareSources()` remote-include pre-pass.
- `scripts/` — `sync-version.ts` and `build-skill-template.ts` (prebuild),
  `render.ts`, the site checks.
- `docs/` — the markdown.orz.how website (GitHub Pages); `build/web-bundle.mjs`
  builds its editor bundle. Starters live in `docs/starters/`.
- `themes/` — CSS themes (shipped in npm and served via jsDelivr): `common.css`
  is the only structure layer; the 12 theme files are decoration only
  (`tests/themes.test.ts` enforces it; contract in
  `orz-markdown-skills/references/themes.md`).
- `orz-markdown-skills/` — the agent skill (`SKILL.md`, `references/`, `assets/`),
  shipped in the npm tarball.
- `dist/` — **committed and published** tsc output.
- `tests/` — unit and feature tests; `tests/audits/` holds the hardening-round
  regressions (`audit-round*.test.ts`, `audit-final-*.test.ts`).
- `notes/` — developer notes, not published: `CLAIMS.md` (the claims registry)
  and `closed-loop.md` (the hardening record).
- `archive/` — inactive files kept for reference (see its README).

## Conventions & gotchas

- **Stay browser-clean.** No static import of Node built-ins (`fs`, `path`,
  `process`, …) anywhere in `src/` — reach Node through
  `process.getBuiltinModule` like `plugins/markdown-include.ts`. The
  "browser bundle needs no Node shims" test enforces this.
- **File access is a host capability.** Never add a code path that reads files
  or the network without an explicit env/option from the caller. (Exception by
  owner decision, CLAIMS M.21: in a browser page `prepareSources` fetches the
  URLs the author wrote.)
- **Inline renders use `inlineEnv(env)`.** `md.renderInline(x, inlineEnv(env))`
  inside a plugin: footnotes off (markdown-it-footnote would repeat its list),
  per-render budgets shared with the document. Never pass the document env or
  a fresh `{}` (that would reset the QR/TeX caps).
- **`dist/` is tracked and published.** After changing `src/`, run `npm run build`
  and commit `dist/`. `prepublishOnly` also builds+tests.
- **`src/runtime.ts` is a `String.raw` template** of vanilla ES5 JS. Do **not**
  use template literals, backticks, or `${...}` inside it (use
  `String.fromCharCode(96)` for a backtick). It must stay dependency-free.
- **`data-md` breadcrumbs**: render-time attributes on generated constructs
  (mermaid, smiles, qrcode, youtube, chart, toc, emoji, nyml, yaml, footnote
  refs), plus `data-orz-container` and `data-footnote-label`, so copy-as-markdown
  recovers their source. Don't strip them when post-processing.
- **Tests**: many suites use `happy-dom` (a devDependency).
  `tests/browser-copy.test.ts` drives real Chrome through `playwright-core` and
  self-skips when Chrome is absent — the claims it binds (C.14–C.16, C.19,
  C.20, M.8) are then unverified; the same holds for the Chrome parts of
  `tests/carrier-kit.test.ts` (K.9, K.12), `tests/carrier-shell.test.ts`
  (S.12) and `tests/carrier-update.test.ts` (U.11, and the Chrome halves of
  U.5–U.9, V.4; it also needs `dist/carrier.js`, so build first) and
  `tests/carrier-editor.test.ts` (E.13, E.23 and the Chrome halves of E.1, E.3–E.11,
  E.14, E.15, E.19–E.22, E.25) and `tests/conformance.test.ts` (H.2, the browser half of H.5).
- **Claims.** `notes/CLAIMS.md` lists the guarantees; a test binds one by carrying its
  id in its title (`[M.16] …`), and `tests/claims.test.ts` fails on an unbound
  claim or an unknown id. Change a claim's wording when behaviour changes;
  record hardening rounds in `notes/closed-loop.md`.
- Plugins emit specific HTML; if you change a plugin's output, update its test
  (and the runtime walker / `data-md` if it's a generated construct).

## Downstream (see ../docs/CONTRACTS.md FC-01–FC-07, FC-14)

orz-mdhtml, orz-slides, orz-paged and orz-poster bundle this package into their
files; Alembic renders with it server-side; coursewerk runs it in its QA gate.
Parser, runtime, theme or preview-frame changes reach them only when they
rebuild — follow ../docs/RELEASE.md (orz-markdown first, then the carriers).
Before releasing, run the carriers' test suites against this checkout (symlink
`node_modules/orz-markdown` → `../../orz-markdown`, run, restore; the carriers
then also need `markdown-it-cjk-breaks` installed).

## Releasing

- Bump `package.json`, move CHANGELOG `[Unreleased]` → the new version, build
  (regenerates `src/version.ts` and the skill template), `npm run build:web`
  if the parser/themes changed (and bump the `docs/sw.js` CACHE name), commit,
  push, then `npm publish`.
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
