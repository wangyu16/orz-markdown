# orz carrier specifications

Binding specifications owned by orz-markdown for the orz carrier family
(orz-mdhtml, orz-slides, orz-paged):

| Spec | What it defines |
|---|---|
| [FC-18 · Text form and assembly, format 1](FC-18-text-format-1.md) | the plain-text twin of every carrier file, its header, and the exact `assemble` / `extract` laws |
| [FC-19 · Editor component API](FC-19-editor-component.md) | the browser editor component that the files and web apps embed |

The shared test corpus is in [`../tests/carrier-corpus/`](../tests/carrier-corpus/).
Implementation: `src/carrier/` — `header.ts` (`readHeader`, `setHeaderValue`,
`removeHeaderKey`, `lintHeader`), `document.ts` (`readDocument`,
`kindFromFilename`, `twinName`; `mintUid` from `uid.ts`), `links.ts` (`twinHref`
and the `env.orzTwinLinks` render rule), `envelope.ts` (`assembleEnvelope`,
`extract`, `readIslandFromDom`), `text.ts` (line-ending and surrogate facts), `index.ts` — exported as `orz-markdown/carrier` (`src/carrier.ts`),
never imported by the parser entry. Shared reader: `src/nyml-body.ts`. Claims
K.1–K.13 (and M.22) in `notes/CLAIMS.md`, tests in `tests/carrier-kit.test.ts`.
