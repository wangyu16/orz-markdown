# orz carrier specifications

Binding specifications owned by orz-markdown for the orz carrier family
(orz-mdhtml, orz-slides, orz-paged):

| Spec | What it defines |
|---|---|
| [FC-18 · Text form and assembly, format 1](FC-18-text-format-1.md) | the plain-text twin of every carrier file, its header, and the exact `assemble` / `extract` laws |
| [FC-19 · Editor component API](FC-19-editor-component.md) | the browser editor component that the files and web apps embed; §8 the shared editor shell (`orz-markdown/carrier/editor`) every carrier's `mountEditor` wraps |
| [Host protocols](host-protocols.md) (FC-12, canonical) | `orz-host-save@1`, `orz-host-ai@1`, `orz-host-include@1`: the iframe handshake between an app and an embedded assembled file, the kind registry, the security rules, format-1 saves |
| [Shell runtime](shell-runtime.md) (FC-11) | the standalone save (host → served notice → File System Access with a handle remembered by `uid` → download), reader preferences, the release manifest (`release.json`) and quiet update (once-a-day check, sandboxed transactional re-assembly, indicator), and the shell chrome (tokens, icons, toasts) |
| [Carrier app](carrier-app.md) (2.2.0) | the standalone assembled file's runtime every carrier bundle runs (`orz-markdown/carrier/app`): reading the opened file, the read view and chrome, edit mode, Save / Download a copy / New document / Save as new copy, the unsaved-changes warning, the host connection with the AI review flow, the quiet update, the page keymap — behind one seam, `StandaloneKind`, with notes on how orz-paged and orz-slides fit |
| [Carrier CLI core](carrier-node.md) (2.3.0) | the Node-only core every carrier's CLI shares (`orz-markdown/carrier/node`): known earlier states (git, the CLI's pair records), `--replaces` tokens, the uid-identity gate, backups, atomic writes, includes from the text's folder, the reason codes and `next` commands, the overwrite guards |
| [Conformance harness](conformance.md) | how a carrier runs `orz-markdown/carrier/conformance` against itself: the target it describes, the check ids (`C.<area>.<name>`) its claims bind to, what "conformant" means, and the assumptions it makes where the specs are open (implementation note, not binding) |

The shared test corpus is in [`../tests/carrier-corpus/`](../tests/carrier-corpus/).
Implementation: `src/carrier/` — `header.ts` (`readHeader`, `editHeader`,
`setHeaderValue`, `removeHeaderKey`, `withoutHeader`, `lintHeader`),
`document.ts` (`readDocument`, `kindFromFilename`, `twinName`; `mintUid` from
`uid.ts`), `links.ts` (`twinHref` and the `env.orzTwinLinks` render rule),
`envelope.ts` (`assembleEnvelope`), `read.ts` (`extract`, `readIslandFromDom`,
`decodeText`; parser-free), `text.ts` (line-ending, surrogate and decoding
helpers), `parser.ts` (the kit's private parser), `index.ts`. Exported as
`orz-markdown/carrier` (`src/carrier.ts`) and, for readers that need no parser,
`orz-markdown/carrier/read`; never imported by the parser entry. Shared reader:
`src/nyml-body.ts`. Claims K.1–K.22 (and M.22, M.23) in `notes/CLAIMS.md`,
tests in `tests/carrier-kit.test.ts`.

The shell runtime is `src/carrier/shell/` — `save.ts` (`createSaver`, the
IndexedDB handle store), `preferences.ts` (`createPreferenceStore`),
`file-side.ts` (`connectHost`), `host-side.ts` (`embedCarrierFrame`),
`protocol.ts` (message constants, types, timeouts, kinds), `update.ts`
(`checkForUpdate`, `skipVersion`, `reassemble`, `performUpdate`, manifest and
URL helpers, semver), `indicator.ts` (`mountUpdateIndicator`), `chrome.ts`
(`CHROME_CSS`, `ICONS`, `createShadowRoot`, `showToast`, `askSaveConflict`),
`conflict.ts` (2.2.0: one save-conflict question per saver —
`answerSaveConflict`, `saveConflictOpen`, `focusSaveConflict`,
`dropSaveConflict`), `types.ts`
(structural browser types) — exported as `orz-markdown/carrier/shell`
(parser-free — the update verifies with the parser-free `extract` — and
Node-safe; not re-exported by `orz-markdown/carrier`). Claims S.1–S.15, tests
in `tests/carrier-shell.test.ts` (real Chrome for the cross-origin handshake,
downloads and IndexedDB); claims U.1–U.13 and V.1–V.6, tests in
`tests/carrier-update.test.ts` (real Chrome for the sandboxed update against a
fake CDN, downloads and CSS isolation).

The editor shell is `src/carrier/editor/` (FC-19 §8) — `shell.ts`
(`createEditorShell`: toolbar, modes, split, keyboard, the exact text, dirty
tracking, `setHeader`, save), `text-model.ts` (exact text behind an LF
editor), `adapter.ts` (`TextEditorAdapter`, `textareaAdapter`),
`codemirror6.ts` (`codemirror6Adapter`, `loadCodeMirror6`; the pinned bundle
`vendor/codemirror6.js` described by the generated `codemirror-pin.ts`),
`preview.ts` (the preview frame — sandbox from `previewSandbox()`:
`allow-scripts`, plus `allow-same-origin` only for a standalone `file:` page,
owner decision B-2, FC-19 §8.4 — its bridge, the authenticated channel (a per-frame secret
the bridge reads first; keys, links and scrolls act only through the port — a document's
scripts taking the keyboard focus in the preview is an accepted limit, FC-19 §5) and the
message protocol, asset rewriting, CSP
nonce and hashes, scroll-sync maths), `render-md.ts` (`renderMarkdownPreview`, `renderMarkdownPreviewWithIncludes`, `includeRecordEnv`), `styles.ts`
(`EDITOR_CSS`) — exported as `orz-markdown/carrier/editor` (it may load the
parser; `carrier/shell` and `carrier/read` do not import it). Claims
E.1–E.34, tests in `tests/carrier-editor.test.ts` (real Chrome for
CodeMirror in a shadow root, the opaque-origin preview and its standalone
`file:` exception, the split drag,
scroll sync and Subresource Integrity).

The conformance harness is `src/carrier/conformance/` — `index.ts`
(`runConformance`, `registerConformance`, `openConformance`; checks run side
by side in lanes, each in browser contexts of its own), `catalog.ts`
(`CHECKS`: ids, titles, spec references), `checks.ts` (the checks),
`session.ts` (local origins, browser contexts on a closed network, the
jsDelivr routes), `page.ts` (page-side scripts: init script, editor driver,
the protocol host page), `helpers.ts` (2.2.0: page helpers for a carrier's own tests), `texts.ts` (hazard texts), `node.ts` (Node built-ins
through `process.getBuiltinModule`, the corpus loader, lazy `playwright-core`)
— exported as `orz-markdown/carrier/conformance` (Node only; no other entry
imports it; `playwright-core` is an optional peer dependency). Claims
H.1–H.8, tests in `tests/conformance.test.ts` (the harness against the stub
carrier of `tests/conformance-stub/`, built at test time, and broken builds
of it that must fail).

The carrier app is `src/carrier/app/` (2.2.0) — `app.ts` (`bootCarrierApp`,
`APP_CSS`), `start.ts` (`startCarrier`, `carrierGlobal`: the FC-19 §2 global
and the boot), `file.ts` (`readOpenedFile`, `openedFileName`, `copyName`),
`engine-source.ts` (`captureEngineSource`), `widgets.ts` (`menuButton`,
`settingPicker`, `attachSettings`, `reviewProposal`, `attachAiMenu`,
`followPresentation`, `WIDGET_CSS`), `types.ts` (the seam: `StandaloneKind`,
`StandaloneContext`, `CarrierReadView`, `SettingControl`, `CarrierAction`,
`CarrierApp`, structural DOM types) — exported as `orz-markdown/carrier/app`
(it may import `carrier/shell`, `carrier/editor` and `carrier/read`; none of
them imports it; Node-safe at load). Claims A.1–A.31, tests in
`tests/carrier-app.test.ts` (happy-dom against a fake kind; real Chrome
against the stub carrier, which is built on it). In-page enhancement for a
read view is `enhanceDocument` in `orz-markdown/preview-frame` (M.24;
`disposeEnhancement` M.26, `swapStylesheet` M.27); the
theme list is `THEMES` (main entry and `orz-markdown/themes`, M.25).
