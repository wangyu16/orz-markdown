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

### Round 2 — 2026-10-05

Two fresh adversaries: A verified the round-1 fixes and hunted their
siblings; B audited what round 1 did not (determinism across environments,
metadata escaping, API fitness, bundle size, vacuous claims by mutation).

**1 HIGH (a verification gap, not broken behaviour), 6 MEDIUM, ~15 LOW.**
Verified at scale: prefix-only header location agrees with a full scan on all
813 family `.md` files and 6,000 random documents; 12,000 random header edits
byte-exact; `closer-in-value` catches every cut with no false error on the
family files (paged `custom_css` templates included); Node and Chrome 154
(tr-TR, Asia/Tokyo) byte-identical on 944 inputs; TZ/LANG/ICU make no
difference.

| Finding | Class | Sev | Disposition |
|---|---|---|---|
| B-F1 K.9 ("the browser bundle gives the same bytes") ran only in a Node `vm`, on md files and one parts set — a browser-only byte difference survived every test (mutation M9b). Behaviour checked by hand in Chrome: holds | ORZ | HIGH | fix — K.9 runs in real Chrome on all corpus files × all parts |
| A-R2-1 `extract` did not normalize CR LF in the island as the HTML parser does: a `.html` converted to CR LF (git autocrlf) gave doubled CRs, unlike the DOM read | ORZ | MED | fix |
| A-R2-2 a single-line value ending in `}}` (a title mentioning `{{x}}`) cuts the header; lint said only `closer-not-alone` | ORZ+SPEC | MED | fix — `closer-in-value` error when key lines or a lone `}}` follow; same rule for a lone indented `}}` in a `\|` value (A-R2-5) |
| A-R2-3 setting a scalar key deleted the deeper lines under it (spec §5 vs §9 disagreed) | SPEC+ORZ | MED | fix — set replaces only the key line; remove/merge keep the whole extent; lint `ignored-line`; one rule in §5/§9 |
| B-F2 the kit parsed with the shared, mutable `md`: a host's `md.set()` changed assembled bytes (laws 2–3 between hosts) | ORZ | MED | fix — a private, identically configured instance |
| B-F3 FC-03 still said "host values win"; FC-18 says the header is the only source | SPEC | MED | fixed in the family contracts (format-1 note) |
| B-F4 importing only `extract` pulled the whole parser (837 KB min) | ORZ | MED | fix — parser-free `orz-markdown/carrier/read` with a size claim |
| A-R2-4 tab-indented header under an indented opener: fields differed from the scanner's | ORZ | LOW | fix |
| A-R2-6 K.15 overstated tokenizer fidelity on foreign HTML | ORZ | LOW | claim narrowed; bogus comments and end-tag attributes skipped |
| `__proto__` keys (A-R2-7, B-F9) | ORZ | LOW | fix — null-prototype maps |
| title details: indented slide marker, emoji, image alt, typographer (A-R2-8, B-F13) | ORZ+SPEC | LOW | fix — "plain text as a reader sees it", pinned in §8.1 |
| `decodeText` silently replaces invalid UTF-8 (A-R2-9) | SPEC | LOW | fix — `fatal` option; noted in §3 |
| lint gaps: `Kind:`/`Document` (A-R2-10) | ORZ | LOW | fix |
| B-F5 bundling `src/` (not `dist/`) duplicates KaTeX and breaks `\ce` | ORZ | LOW | dismissed for the kit (pre-existing; every published bundle uses `dist/`); K.9 now bundles `dist/` |
| B-F6/F11 K.2 static check incomplete; four mutations survived (meta key order, `lang`/generator escaping, include filtering) | ORZ | LOW | fix — checks widened, assertions added |
| B-F7/F8 title/author trimming inconsistent; invalid `uid` passed into `#orz-meta` | ORZ | LOW | fix |
| B-F10 `.d.ts` needs `@types/markdown-it`; DocMeta types not re-exported | ORZ | LOW | fix |
| B-F12 K.14 absolute timing flaky under load; K.12 Chrome test skips without Chrome | ORZ | LOW | fix (ratio against a same-run baseline); skip noted (real-substrate claims are unverified without Chrome — CLAIMS.md header) |
| B-F14 a lone legacy `kind: meta` header still renders an island; carriers must cut it | ORZ | LOW | fix — `withoutHeader`, documented |
| B-F15 spec/README.md lagged the API | ORZ | LOW | fix |

**After round 2.** All fixes taken, each a test bound to a claim: new K.19
(private parser), K.20 (parser-free `carrier/read` under 30 KB), K.21
(`__proto__` keys are data), K.22 (`withoutHeader`); K.2–K.5, K.9, K.10, K.12,
K.14–K.16, K.18 reworded. K.9 now runs in real Chrome (not skipped here).
Measured: 1,621 tests green, `tsc` clean, build passes.
