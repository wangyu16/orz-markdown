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

### Round 3 — 2026-10-05 (confirming)

One fresh adversary on the round-2 fixes, with targeted mutations of every new
or reworded claim. **No HIGH; 2 MEDIUM, 3 LOW, all ORZ.** Held: CR/CR LF
normalization on every read path; the private parser renders the corpus
identically to `md` (identical rule chains and options); `carrier/read`
bundles to 6.4 KB with no parser modules; prototype-named keys are data;
`withoutHeader` on every header shape; 6,000 random edits; lint over the 32
corpus files and 579 family `.md` files raised no error or warning; 15 of 19
mutations caught — the 4 survivors are F2–F4 below.

| Finding | Class | Sev | Disposition |
|---|---|---|---|
| F1 the round-2 orphan-`}}` scan read the closing `}}` of the next block as a cut header: a paged element, `{{mermaid}}` or a fenced block right after the header, and the canonical back-to-back legacy pair, gave a false `closer-in-value` error (reading unaffected) | ORZ | MED | fix — scan after the last header block only, stop at `{{` and fences; no-error cases in K.10 |
| F2 the K.2 determinism check scanned a hand-kept file list: a new module using `Date.now()`, or a `__filename` read, survived | ORZ | MED | fix — file list from the import graph; machine-path reads forbidden |
| F3 K.9's Chrome lint comparison had almost no inputs | ORZ | LOW | fix — lint fixtures and hazard texts added |
| F4 K.22 header-less BOM case untested | ORZ | LOW | fix |
| F5 the `register()` half of K.19 unbound | ORZ | LOW | fix |
| a hard break in the H1 vanished from the title | SPEC | LOW | fix — reads as one space (§8.1) |
| `audit-round21` [R.7] 40 s bound flakes under concurrent load | — | LOW | not kit code; passes alone (known since the 2.0.0 loop) |
| `eval`-built evasion of the K.2 check | — | — | dismissed — hostile, out of scope |

**Loop 1 closes** after these fixes (stop rule: a round with no HIGH classed
ORZ or ISOLATION). Next loop: the whole kit at the end of Phase 2.

**After round 3 — loop 1 closed 2026-10-05.** All six fixes taken (K.2, K.9,
K.10, K.16, K.19, K.22 reworded; the determinism check now covers the 42
modules of the carrier's import graph and catches an injected `Date.now()`).
Measured: 1,624 tests green, `tsc` clean, build passes, Chrome tests ran.
Summary of loop 1: 3 rounds; 3 HIGH found and fixed (U+0130 round trip, a
`}}` cutting the header silently, a browser claim never run in a browser);
claims K.1–K.22 and M.22–M.23 bound and mutation-checked.

---

## Loop 2 — the whole kit (end of Phase 2)

Target: `carrier/shell` (save, preferences, host protocols, quiet update,
indicator, chrome), `carrier/editor` (editor shell, text model, adapters,
CodeMirror 6 loading, preview), `carrier/conformance` (harness, stub).
Claims S, U, V, E, H. Starting state: `orz-markdown@2600cdf`, 1,764 tests
green.

### Round 1 — 2026-10-06

Two independent adversaries: A against the claims (73 mutations: S 17/18
caught, U/V 22/23, E 18/22, H 1/10), B against the design (spec by spec, real
Chrome, Phase 3 and Alembic fitness, cost).

**2 HIGH (one ORZ found by both, one SPEC), ~14 MEDIUM, ~11 LOW.** Held in
real Chrome: exact text through every save path and through CodeMirror
(U+2028/9, NEL, CR, CR LF + BOM, astral); update safety end to end
(integrity, script-safe + no CR, opaque sandbox, round trip, kind, version,
delivery; tampered/offline/wrong kind/downgrade/prerelease refused); preview
isolation; CodeMirror SRI; no leaks over 200 mount/destroy cycles.

| Finding | Class | Sev | Disposition |
|---|---|---|---|
| A-1 / B-1 a remembered File System Access handle (keyed by `uid`, guarded by the file name) was reused by a same-named copy in another folder — every `file:` page shares one IndexedDB — and wrote over the original | ORZ | HIGH | fix — handle key `"<uid> <location>"`, reused only from the same page location; S.3, S.12 (real handles, Docs vs Downloads) |
| B-2 the opaque preview frame of a standalone `file:` page cannot load relative local images | SPEC | HIGH | owner decision 2026-10-06: `allow-same-origin` for a standalone `file:` page only (`previewSandbox`, E.20, real-Chrome image test) |
| A-2 forged Escape / "active" / scroll messages from the preview's document took focus or pinned the scroll | ISOLATION | MED | fix — gated (focus in the frame, activation for effects; scroll-lead rule in E.14) |
| A-3 / A-4 BOM and line-ending style belonged to the last adopted text, not to the undo entry; offsets on mixed-EOL texts | ORZ | MED/LOW | fix — style per remembered entry; offsets by walking the exact string (E.1) |
| A-5 / B-12 an update saved the click-time text and the stub reloaded after a download; `SaveResult` did not say which file was written | ORZ+SPEC | MED | fix — `getText()` re-read before saving (`changed`), `reload` only when the opened file got exactly that text; `picked`/`name`; editor read-only during an update (`setReadOnly`); S.13, U.12 |
| A-6 / B-14 the textarea→CodeMirror upgrade dropped the undo history | ORZ | LOW | fix — textarea steps replayed as isolated CodeMirror steps (E.21) |
| A-7 / B-6 / B-7 / A-8 the harness passed 9 of 10 broken kits; partial or skipped runs counted as conformant | ORZ | MED | fix — 9 new checks (38), CodeMirror served in the closed network, conformant only when every check ran (`partial`, `notApplicable`, final `[conformant]` test); 11 broken stubs each fail a named check (H.5) |
| B-3 a blocked or cancelled download counted as saved | ORZ | MED | partly — downloads carry `confirmed: false`, the toast says "Download started"; dirty still clears (a download is the only save in some browsers) |
| B-4 the preview diff keyed on `data-src-line`: one new line replaced every node below | ORZ | MED | fix (E.15) |
| B-5 one synchronous render per pause, whatever it cost | ORZ | MED | fix — pacing max(debounce, 2 × last render), no overlap (E.16) |
| B-8 D7 (a newer format opens read-only) not enforced | ORZ | MED | fix — `formats`, forced read-only, save refused (E.17) |
| B-9 the preview was not pluggable for paged/slides | SPEC | MED | fix — `frameDocument`, `bridge`, `diff: false`, `mode: 'navigate'`, `mapLine`/`mapPosition` (E.15, FC-19 §8.4) |
| B-10 FC-19 §3 hooks missing from the shared shell | SPEC | MED | fix — `resolveAsset`, `resolveLink`, `fetchInclude` (render context), `uploadAssets`, `requestAi`, `ensureUid` (E.18) |
| B-11 a strict CSP gave a silently blank preview | ORZ | MED | fix — `preview.nonce`, `PREVIEW_BRIDGE_HASH`, `previewScriptHashes`, ready timeout with notice and `error` (E.19) |
| B-18 who runs the update check was unspecified | SPEC | LOW | fix — none in frames, hosted or served pages by default (U.13) |
| B-13, B-16, B-17, B-19, U16, S03, E06, E13, E15 (live `change` text, served notice without edits, docs drift, textarea history memory, test gaps) | ORZ | LOW | fix |
| B-15 a document script can open an http(s) tab while the reader interacts with the preview | ISOLATION | LOW | dismissed — documents are trusted sources (M.21) and the browser requires real activation; stated in FC-19 §8.4 |

**After round 1** (`orz-markdown@9b38693`, B-2 in `@7567455`): claims S.13,
U.12, U.13, E.14–E.22 added; S.3, S.11, S.12, U.6, U.10, E.1, E.2, E.5, E.8,
E.9, E.10, E.13, E.20, H.1–H.3, H.5 reworded. 1,813 tests green twice. Test
infrastructure: real-Chrome suites run in their own vitest group after the
timing-bounded unit tests, then the harness alone; default timeouts raised.
Open into round 2: a full run showed one keystroke reordered while CodeMirror
replaced the textarea (`Seond linec`) — a data-integrity bug, being fixed.

### Round 2 — 2026-10-06

Fresh adversaries on `@7567455`: A against the claims (49 mutations, 43 of 48
real ones caught), B against the design with two sub-probes (cost; the
conformance harness: 22 broken stubs, 15 passed as conformant). A bug found
between rounds (a typed key reordered under load) was fixed first
(`@d18ef20`, E.23): CodeMirror 6.43's scroll handler flushed a pending DOM
change with the cached selection; the adapter now flushes with the live one.

**3 HIGH ORZ/ISOLATION, ~20 MEDIUM, ~15 LOW.** Held: the round-1 fixes (A-1
copy overwrite, frame gating without theft, per-entry BOM/EOL, the `changed`
re-read, history replay, B-4/5/8/11/16/18); B-2 unreachable from http(s)
app hosts or served pages; Phase 3 fitness — a fake paged preview (real
Paged.js 0.4.3, `diff: false`, own frame document and bridge) and a slides
preview (`mode: 'navigate'`) built only from the documented protocol worked;
an Alembic-like page (two editors, nonce CSP with `'strict-dynamic'`,
CodeMirror via `loadModules`, all seven hooks) worked end to end; no leaks
over 200 cycles with every option.

| Finding | Class | Sev | Disposition |
|---|---|---|---|
| A-F1 a document script in the (opaque) preview steals focus while the reader types; each stolen key is real activation in the frame, so the E.14 gate let forged saves and popups through | ISOLATION | HIGH | fix — the default bridge reports through a private MessagePort, only trusted events; forged window messages never act; focus the reader did not bring is returned, a repeat pauses the document's scripts (frame replaced under a nonce-only CSP); links open only from a host-side "Open …?" chip; harness check (focus theft) in `C.edit.preview-isolation` |
| A-F2 save-as to another folder (the picker opens in the last-used folder) was treated as the opened file: the page reloaded the stale original and the remembered handle later overwrote the copy, losing the session's edits | ORZ | HIGH | fix — a handle is proved by content (`getFile()` equals the opened bytes or this page's last write), never by name; `openedHtml`; `reload` only for a proved file or an acknowledged host save; limit (byte-identical copies) in the spec; `C.save.save-as-elsewhere` |
| Cost-1 the textarea undo history kept a whole old text per patch (V8 slices of ≥ 13 characters keep the parent alive): 716 MB at 300 steps on 1.25 MB, invisible to the character counter | ORZ | HIGH | fix — patches stored as flat copies (`detachString`); a heap-measuring test (E.21) |
| Harness: 15 broken carriers passed as conformant (hook save altered or skipped, edit lost during an update, shared undo, update check in an app host, CSS leak, …) | ORZ | HIGH/MED | fix — `C.edit.app-host`, `C.update.edit-during`, `C.update.other-format` and stricter checks; 30 new broken stubs, each failing a named check (H.5); lanes: 117 s → 78 s |
| B#1 a session handle from an earlier save-as yielded `reload: true` | ORZ | MED | fix (with A-F2) |
| A-F3 / B#11 / Cost-7 AI, uploads and uid minting checked read-only only before awaiting; in-flight work after `destroy()` | ORZ | MED/LOW | fix — re-check after every await |
| Cost-2 the CodeMirror upgrade replayed every step (4–21 s, +0.5 GB at 200 steps on 1.25 MB) | ORZ | MED | fix — newest 100 steps from the patches (0.36 s) |
| Cost-3 the text model kept 16 full texts (× 2 for CR LF) | ORZ | MED | fix — initial and saved texts pinned, exact copies only for mixed endings, cleared on destroy (E.24) |
| Cost-4 size bounds measured on `src`, but CommonJS `dist` ships (shell 58.9 KB vs 52 KB) | ORZ | MED | fix — S.11/U.10/V.5/K.20/E.10 measure `dist`; shell 56.4 KB under 62 KB; bounds explained |
| B#2 preview blank until stylesheets load (false CSP notice after 8 s); B#3 Paged.js reflow not counted in pacing; B#4 navigate mode ignored view changes; B#8/#9 carriers could not talk to their bridge; B#10 a shell mounted into a popup never rendered | ORZ | MED/LOW | fix — bridge first; frame-acknowledged pacing; navigate on view change; `shell.preview` channel and page hooks (E.25); port-based bridge |
| B#6 a nonce is not enough for a strict CSP (KaTeX inline styles, Paged.js `<style>`, CDN stylesheets) | SPEC/UPSTREAM | MED | fix — nonce on stylesheet links and the CodeMirror loader; FC-19 §8.4 states what an app's CSP needs |
| B#7 FC-19 §4 lacked the shell's app-facing methods | SPEC | MED | fix — `requestAi`, `uploadAssets`, `ensureUid`, `setReadOnly`, `isReadOnly` (additive) |
| B#5 a paged preview cannot print (`print()` needs `allow-modals`) | SPEC | MED | owner's call at orz-paged; recommended: print from the read view |
| A-F4 more than 16 header edits lost the exact text on undo; A-F5 `srcset` with `data:` URLs; A-F6 standalone inference could reach a framed/host `file:` page; B#12/#13 resolveLink got the twin-rewritten href, no include-aware md render; Cost-5 KaTeX bundled twice from `src` (`\ce` broken); Cost-6 no preview update during steady typing; T1–T3 test gaps; docs drift (B-2 rationale wrongly cited the include allowlist) | ORZ | LOW | fix |

**After round 2:** claims E.24, E.25 added; S.3, S.11–S.13, U.10, U.12, V.5,
K.20, E.5, E.7, E.8, E.10, E.12–E.16, E.18–E.21, E.23, H.1, H.2, H.5
reworded. Limits stated: a key typed at the very instant of the first
theft can still reach the frame; a carrier's own bridge (no port) gets the
older focus-plus-activation gate.

### Round 3 — 2026-10-06

Fresh adversaries on `@79d9cc5`: A against the claims (40 kit mutations, 35
caught; 7 broken stubs, 6 passed as conformant), B against the design (spec
↔ code, Phase 3 previews rebuilt in Chrome on the new protocol, Alembic
page, saving UX, cost).

**4 HIGH (3 ISOLATION/ORZ in the round-2 theft defence, 1 SPEC), ~10
MEDIUM, ~10 LOW.** Held: content-proved saves (S.3/S.12/S.13), the update's
`changed`/`reload` rules, ack pacing without deadlock, B-2 unreachable from
http(s)/framed/connected pages, srcset parsing, read-only/destroy
re-checks; real Paged.js and slides previews on the new protocol; the
Alembic page end to end; no leaks over 200 cycles with real thefts; sizes
within bounds.

| Finding | Class | Sev | Disposition |
|---|---|---|---|
| A-F1 theft detection bypassed (nested `<iframe srcdoc>`, a forged ready closing the real port, `document.open()`) | ISOLATION | HIGH | superseded by owner decision (option B) |
| A-F2 the private port went to any document that posted a ready (after `document.open()`, a navigation, a meta refresh to http): its "trusted" reports saved and reached `onLink` | ISOLATION | HIGH | fix — per-frame secret on the bridge's script, read and removed before content; the port only for a ready with it, once per load; window messages never act (E.14, `C.edit.preview-isolation` replaced/nested phases, stub `port-without-secret`) |
| B-1 false "paused" on normal use: click into the preview, switch tab, come back — Chrome refocuses the frame, treated as theft (also slides/paged) | ORZ | HIGH | superseded by option B (detection removed; a tab-switch round trip is now tested) |
| B-2 resolved includes (`#orz-includes`) dropped by every browser save and quiet update, and update verification passed | SPEC+ORZ | HIGH | fix — `assemble(text, { includes })`, `reassemble` passes and verifies them (`includes` error), corpus file with includes, `C.save.keeps-includes`, `C.update.keeps-includes` |
| A-F3 any Tab opened a 1 s blind window; B-3 focus returned to the wrong editor; B-9 no `focusPreview`; B-10 theft reported as a render error | ISOLATION/ORZ/SPEC | MED/LOW | moot under option B (machinery removed) |
| B-4 navigate mode could not read a line back through the port | SPEC | MED | fix — `__orzPreview.navigated(line)`, gated by the reader's own input |
| B-5 a carrier's own frame scripts must carry `parts.nonce` | SPEC | MED | fix — stated in FC-19 §8.4 |
| B-6 large documents: two assembles per save click could outlast activation (download fallback) | ORZ | MED | fix — `openedHtml` assembled once at idle |
| H: 6 broken stubs passed (reload after a picked file, editor stuck read-only after an update, edit during a hook save marked saved, Cmd+S on a read-only editor, ungated view key, pause stripped) | ORZ | MED | fix — stricter checks; 7 more stubs caught; the pause stub dropped with the pause |
| A-F4 a pinned initial text shadowed a newer exact form after 17 edits; m15 stale acks; m24 session proof; m28 lookup order | ORZ | LOW | fix |
| B-7 saves did not keep the file's delivery; B-8 an extra picker after a CLI re-assembly; B-11 `__orzPreviewApply` re-entrancy; B-12 ordering advice; A-F5 frame messages readable by the document; docs drift | ORZ/SPEC | LOW | fix (delivery kept, `C.save.keeps-delivery`; handle accepted when it holds the opened bytes; apply serialised; documented) |

**Owner decision 2026-10-06 (option B).** A document's own scripts are
trusted author content (M.21). The guarantee is the sealed frame plus the
authenticated channel: only the reader's real key presses and clicks,
reported through the secret-gated port, can save, switch views, scroll the
editor or offer a link. A document script taking the keyboard focus inside
the preview is an accepted limit (FC-19 §5, E.14); the round-2 focus-theft
detection and script pausing were removed (bypassable, and misfired on tab
switches). Revisit if an app edits documents from untrusted authors.

**After round 3** (`@e59dc30`, option B in the next commit): 1,918 tests
green; harness 45 checks.
