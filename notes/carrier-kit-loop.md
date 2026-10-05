# Closed-loop verification — carrier kit (orz-markdown/carrier)

The record of the closed-loop verification of the carrier kit built for the
carrier rebuild (FC-18 text format 1, FC-19 editor component; spec in
[`../spec/`](../spec/)). Claims live in [CLAIMS.md](CLAIMS.md) (sections K and
later); each round's findings end as a probe bound to a claim or as a written
dismissal. The next round starts from the last entry here.

**Stop rule (owner, 2026-10-02/05):** a loop closes after a round with no HIGH
finding classed ORZ (our code) or ISOLATION. Upstream amplification gets a
per-construct limit; findings that need deliberately hostile input are out of
scope — assembled files and includes come from trusted sources (M.21).

**Schedule (owner, 2026-10-05):** after step 1 (the deterministic core), at the
end of Phase 2 (the whole kit, before orz-markdown 2.1.0), per carrier before
its 1.0.0, and end to end after Phase 4.

---

## Loop 1 — the deterministic core (Phase 2 step 1)

Target: `src/carrier/{header,document,envelope,links,text,uid}.ts`,
`src/nyml-body.ts`, the nyml plugin's header suppression. Claims K.1–K.13,
M.22. Starting state: `orz-markdown@6c4c883`, 1,590 tests green.

### Round 1 — 2026-10-05

Two independent adversaries: A against the claims (make each false while the
tests stay green), B against the design (FC-18 section by section, cost at
scale, real Chrome, API fitness for the next phases).

**2 HIGH (ORZ), 4 MEDIUM, ~10 LOW, 3 API improvements.** Real Chrome and
real file bytes: no problem (all 32 corpus files + hazard texts; DOM read =
extract = file bytes; title/lang/meta as readDocument says; no console errors).

| Finding | Class | Sev | Disposition |
|---|---|---|---|
| A-1 `extract` lowercased the whole HTML and used the indices on the original: each `İ` (U+0130, 2 code units in lower case) shifted the cut — any Turkish/Azeri text came back truncated (K.1, K.3, K.12); same in `parseDocMetaIsland` | ORZ | HIGH | fix — ASCII-only lowercasing; sweep of `src/` for the pattern; length-changing case maps added to the random hazards |
| A-2 / B-F1 a `}}` ending a line inside a `|` value (nested CSS in `custom_css`) ends the header there; lint said nothing although the spec says it reports it | ORZ | HIGH | fix — lint error `closer-in-value` when the closing `}}` line has anything before `}}`; grammar unchanged |
| A-3 / B-F2 header edits ignored a key's more-indented lines: remove left them (absorbed by a `\|` value above), a legacy merge dropped them and the meta block's other lines | ORZ | MED | fix — an entry's extent includes its more-indented lines |
| B-F3 a `kind: document` block that is not the header vanished without a lint (old paged files) | ORZ | MED | fix — lint `stray-document-block` |
| B-F4 every header read parsed the whole document (0.5–1.6 s on 1–3.5 MB); `readDocument` parsed it 2–3 times | ORZ | MED | fix — prefix-only header location, at most one body parse; bound claim |
| A-4 / B-F5 a value ending in `}` written on a key that shares the closer line read back wrong | ORZ | LOW | fix |
| A-5 / B-F6 renderer and scanner read a block's kind from different bodies | ORZ | LOW | fix — one body |
| A-6 `extract` vs a browser on foreign HTML: `</scripts>`, `<!-->` | ORZ | LOW | fix |
| A-6 CDATA / `<template>` around an island | — | LOW | dismissed — foreign HTML; our files never produce them, and `extract` targets files we assemble |
| A/B title chain looseness (H1 in a quote, slides preamble H1, paged second title element, `{{sp}}` text dropped) | SPEC | LOW | fix to the spec's intent; wording pinned in FC-18 §8.1 |
| B-F8 inserting a header before Jekyll/Hugo `---` front matter breaks it for those tools | SPEC | LOW | lint warning `front-matter` only — inserting after it would break "the header leads the text" |
| B-F9/F10 lint gaps (shared opener line, compact closer, lang/measure/ratio values), a wrong lint message, required `delivery`, unresolved defaults | ORZ | LOW | fix |
| docs drift (corpus README path, test comment, §11 reference, CHANGELOG twin-link note) | ORZ | LOW | fix |

API additions taken now (the next steps need them): positions on lint
findings and header entries; batch `editHeader` with an explicit multi-line
`|` path (FC-18 §9); BOM-safe `decodeText` (Chrome's `File.text()` strips a
BOM — a carrier must not use it); `extract` returns `#orz-includes`.

**After round 1.** All fixes taken, each reproduction a test bound to a claim:
new claims K.14 (cost bounds), K.15 (`extract` follows the HTML tokenizer),
K.16 (title chain, defaults), K.17 (`editHeader`, header entries, lint
positions), K.18 (`decodeText`), M.23 (ASCII-only case mapping); K.1, K.3,
K.4, K.6, K.10 reworded. Sweep: no other `src/` code indexes a case-mapped
copy. Measured: 1,607 tests green, `tsc` clean, build passes.
