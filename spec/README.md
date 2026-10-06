# orz carrier specifications

Binding specifications owned by orz-markdown for the orz carrier family
(orz-mdhtml, orz-slides, orz-paged):

| Spec | What it defines |
|---|---|
| [FC-18 · Text form and assembly, format 1](FC-18-text-format-1.md) | the plain-text twin of every carrier file, its header, and the exact `assemble` / `extract` laws |
| [FC-19 · Editor component API](FC-19-editor-component.md) | the browser editor component that the files and web apps embed |
| [Host protocols](host-protocols.md) (FC-12, canonical) | `orz-host-save@1`, `orz-host-ai@1`, `orz-host-include@1`: the iframe handshake between an app and an embedded assembled file, the kind registry, the security rules, format-1 saves |
| [Shell runtime](shell-runtime.md) (FC-11) | the standalone save (host → served notice → File System Access with a handle remembered by `uid` → download), reader preferences, the release manifest (`release.json`) and quiet update (once-a-day check, sandboxed transactional re-assembly, indicator), and the shell chrome (tokens, icons, toasts) |

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
(`CHROME_CSS`, `ICONS`, `createShadowRoot`, `showToast`), `types.ts`
(structural browser types) — exported as `orz-markdown/carrier/shell`
(parser-free — the update verifies with the parser-free `extract` — and
Node-safe; not re-exported by `orz-markdown/carrier`). Claims S.1–S.12, tests
in `tests/carrier-shell.test.ts` (real Chrome for the cross-origin handshake,
downloads and IndexedDB); claims U.1–U.11 and V.1–V.5, tests in
`tests/carrier-update.test.ts` (real Chrome for the sandboxed update against a
fake CDN, downloads and CSS isolation).
