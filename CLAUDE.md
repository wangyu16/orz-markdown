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
- `src/preview-frame.ts` — pinned content-library versions/URLs + `__orzEnhance`
  (the preview frame's markup) and `enhanceDocument(root, { scheme, assets,
  nonce })` (2.2.0): the same enhancement for content rendered in a page (a
  carrier's read view), loading only the libraries the content needs; keep
  its pass (`enhanceRoot`) and `ENHANCE_BODY` doing the same thing (M.8, M.24).
  Libraries are probed by their API, never by the global's name (an element
  id such as a heading "Mermaid" shadows `window.mermaid`; M.29).
  `{ static: true }` (2.3.0, M.28) is a page-only last step (drawn canvases
  → images, no runtime) for print/pagination; the frame has no static mode.
- `src/baseline-grid.ts` — `BASELINE_GRID_SCRIPT` (2.3.0, M.31): the screen
  baseline grid (`window.OrzBaselineGrid`), ES5 in a `String.raw` like the
  runtime; ONE source run by both `__orzEnhance` (an inline script of
  `bodyScripts()`) and `enhanceDocument` (injected once per window). Acts
  only where a theme sets `--orz-grid` inside `@media screen`
  (light-playful-1's ruled notebook; same block model as orz-paged's print
  handler): one read, one write (in 1/64 px, rounding fed back), one check,
  block-by-block fallback; idempotent (records and restores what it sets).
- `src/themes.ts` — `THEMES` (ids, picker names, colour schemes), `DEFAULT_THEME`,
  `themeInfo`: the ONE theme list (main entry and `orz-markdown/themes`);
  `tests/themes.test.ts` checks it against `themes/*.css` (M.25). Add a theme
  file → add it here.
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
  the header tools. 2.3.0 added what the carriers had copied (K.25–K.27):
  `sha256.ts` (synchronous SHA-256, imports nothing), `legacy.ts`
  (`readLegacyIsland`: a carrier's 0.x source island, parser-free) and
  `inspect.ts` (the kind-independent core of a carrier's `inspect`); each
  carrier keeps its report shape, legacy fields and advice wording. The
  Node-only CLI core (git/known states, pair records, backups, atomic writes,
  file includes, the overwrite guards, reason codes and `next`) is its own
  entry, `src/carrier/node/` = `orz-markdown/carrier/node` (2.3.0,
  spec/carrier-node.md, N.1–N.11): Node built-ins only via
  `process.getBuiltinModule`, and NO other entry may import it (N.1 bundles
  the browser entries with esbuild to prove it). Its tests drive a reference
  CLI built only from the API (`tests/helpers/node-cli.ts`, in process).
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
  `createShadowRoot`, `showToast`), and `conflict.ts`
  (`answerSaveConflict`: ONE save-conflict question per saver object, so a
  page and its editors must share one saver; Replace passes the conflict's
  `conflictToken` — the saver refuses any other `overwrite`). Update URLs are hard-coded (jsDelivr +
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
  registered before anything else) and use ONLY the natives it captured
  at its first statement (getters, methods, timers, `Date.now`), called
  through the captured `Reflect.apply`, in strict mode, never
  `port.onmessage`, and run no document-visible code inside its listeners —
  handle a message in the captured `setTimeout`, since `window.event` is the
  port's event during the listener and its microtasks (E.35: a document script can override any built-in the
  bridge calls later and so steal the port); recompute
  `PREVIEW_BRIDGE_HASH` (E.19) after any bridge change. `blob:` assets
  (2.4.0, E.46): only the URLs `resolveAsset` gave cross, each ONCE per
  frame document as a Blob (`orz-preview-assets`), and the bridge swaps
  its own object URL in — never put their bytes into the render's HTML
  again (E-M2: `data:` copies froze the page); `resolveAsset` gets the
  decoded path (`assetPath`, E.47). Patches and other
  strings the editor keeps go through `detachString` (V8 slices keep the whole
  text alive; E.21). `print.ts` (`printDocument`, 2.3.0, E.37: a hidden
  `allow-scripts allow-modals` frame prints a whole document; never
  `allow-same-origin`). `render-md.ts`
  (`renderMarkdownPreview`, `renderMarkdownPreviewWithIncludes`,
  `includeRecordEnv`, `data-src-line` anchors; an `#orz-includes` record
  renders offline, and URL includes pass the render env to `prepareSources`
  as `includeEnv`). The AI review flow is `proposeAi` / `applyAi` (E.26;
  `requestAi` = both at once, kept for 2.1.0 callers). A read-only
  CodeMirror stays focusable (`tabindex="0"`, E.22). It may import the
  parser; `carrier/shell`, `carrier/read` and `carrier` must not import it
  (E.10). CodeMirror 6 is ONE pinned bundle, `vendor/codemirror6.js`
  (shipped in the package, loaded from jsDelivr `orz-markdown@<VERSION>` with
  SRI): the `@codemirror/*` devDependencies are pinned exactly; after changing
  one run `npm run build:codemirror` (E.11 fails otherwise). Never load
  per-package `+esm` URLs (they duplicate `@codemirror/state`).
- `src/carrier/app/` — `orz-markdown/carrier/app` (2.2.0, spec/carrier-app.md),
  the standalone assembled file's runtime every carrier bundle runs:
  `startCarrier(kind)` sets `globalThis.OrzCarrier` and boots
  `bootCarrierApp` in a file (`readOpenedFile`, the kind's read view, the
  chrome in a shadow root, edit mode, Save / Download a copy / New document /
  Save as new copy, `beforeunload` while dirty, the host connection with the
  AI menu + review panel, the quiet update, reader preferences, the page
  keymap, the `CarrierApp` handle = `OrzCarrier.standalone`). Reading is
  quiet (owner, 2026-10-09): at rest only the pencil handle (`handle.ts`,
  bottom-left; click = Edit, hover/tap/keys open the list of every
  operation, A.20); the kind's `readerControls` (e.g. md's text size, a
  reader preference, A.21); in edit mode the orz seal → markdown.orz.how and
  the kind's `repo` GitHub link (`shell/brand.ts`, A.22). THE SEAM is
  `StandaloneKind` (`types.ts`): never name a kind (md, slides, paged
  specifics) in `src/carrier/app/` (A.4 greps for it). It may import
  `carrier/shell`, `carrier/editor` (types only today) and `carrier/read`
  plus the core modules the editor already loads (not `document.ts`); no
  other entry imports it (A.1). DOM types are structural (`AppElement`, …):
  a DOM-typed carrier must keep compiling against them (A.4 runs tsc with the
  DOM lib). Kit services it calls are replaceable for tests only
  (`services`); the conformance stub's broken builds use that seam.
  `widgets.ts` holds the menu button (2.3.0: one level of submenus), setting
  picker, `attachSettings`, `reviewProposal`, `attachAiMenu`,
  `followPresentation`. 2.3.0 (orz-paged's kit gaps, A.23–A.29; `hidden(text)` asked once per text via `hiddenFor`, A.29): action
  submenus (`items`) and conditional actions (`hidden`), settings with
  `choicesFor` / `apply` (block values) / `hidden`, reader controls with
  named choices (`readerControls.choices`, preference `reader.<key>`),
  `app.newDocument({ text, name })`; the stub carrier exercises them.
  Round 2 of the paged loop: Cmd/Ctrl+P anywhere (read view, edit mode, the
  editor's preview frame via the editor's `print` event) runs the kind's
  action with id `print`, leaving edit mode first for a read-view action
  (A.30; E.33 is the bridge/port side: `orz-preview-key { key: 'p' }`);
  icon-less items keep the labels' column in the handle's list (A.31).
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
  time; test scaffolding, not a product: since 2.2.0 `carrier/app` + a small
  md kind in `carrier.ts`, its deliberate bugs in `mutants.ts`) and broken
  builds of it (H.5). Its
  default corpus is the shipped `tests/carrier-corpus/` (in `files`). The
  update checks count only bundle requests (`Session.isBundleRequest`, H.7);
  dialogs are dismissed except a `beforeunload` inside `CheckContext.leave`
  (H.8). Its page helpers (`initScript`, `readOpfs`, `writeOpfs`,
  `pageRecords`) are exported for carriers' own tests (H.6).
- `spec/` — binding carrier specs owned here: FC-18 (text form and assembly)
  and FC-19 (editor component), plus the canonical host protocols (FC-12)
  and the shell runtime (FC-11), and the carrier app (2.2.0, `carrier-app.md`). Change them only through the family's
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
  `tests/carrier-editor.test.ts` (E.13, E.23, E.36 and the Chrome halves of E.1, E.3–E.11,
  E.14, E.15, E.19–E.22, E.25, E.35, E.37) and `tests/conformance.test.ts` (H.2, the browser half of H.5,
  H.6–H.8) and `tests/carrier-app.test.ts` (A.13 and the Chrome halves of A.7–A.9, A.15, A.19, E.28; it builds
  the stub carrier) and `tests/browser-copy.test.ts` (M.24).
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
