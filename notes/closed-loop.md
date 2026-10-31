# Closed-loop hardening — copy-as-Markdown and consumer surfaces

The method: requirements are stated as claims in [`CLAIMS.md`](CLAIMS.md),
each bound to a test; an independent adversary attacks them each round; every
finding ends as a probe/fix or a written dismissal; rounds repeat until one
produces no HIGH finding (stop rule since 2026-10-02: no HIGH classed ORZ or
ISOLATION; the loop was closed by owner decision — see Closure at the end). This note is the round record — the next round starts
here, not from the design.

Oracles in use:

- **Round trip** (C.1–C.13, C.17): `render(copy(render(src)))` must equal
  `render(src)` with ids ignored and only ASCII whitespace collapsed. Run in
  happy-dom (`tests/copy-roundtrip.test.ts`) and again in real Chrome
  (`tests/browser-copy.test.ts`), because selection, `cloneContents`, the copy
  event and HTML parsing are exactly what a fake DOM imitates.
- **Bounds** (M.5, M.7, M.9, M.18, R.5, R.6, C.16): measured in the suite. M.5 is a scaling ratio
  (4× input < 8× time), not a wall clock, so it holds on a loaded machine.

---

## Round 1 — 2026-10-01

### Baseline (measured before any change)

- Copy round trip: **18 / 43** edge cases.
- `maskInertMarkdown` (used by `scanNymlBlocks`, `extractDocMeta`,
  `prepareSources`): 25 KB → 57 ms, 100 KB → 1.2 s — quadratic; ≈2 min per MB.
- Chinese: `**注意：**请` not bold; `访问https://orz.how获取` linked a punycoded
  dead host; a CRLF meta block lost every field (JS `.` does not match `\r`);
  `title：…` (full-width colon) and `关键词，分隔` not understood.

### Found and fixed

| Class | Defect | Fix |
|---|---|---|
| Copy: escaping | literal `* _ \` [ < {{ $ ~ ^ == ++ &x;` and line-start `# > - + 1.` came back as syntax | minimal context-aware `rt_escText` + `rt_escLineStarts` (prose like `snake_case`, `5 * 3`, `$5` stays unescaped) |
| Copy: code | code with backticks, code blocks containing fences | fence length = longest inner run + 1, padding rule |
| Copy: breaks | hard break lost (trailing spaces trimmed) | `\` + newline; `<br>` in cells |
| Copy: lists | ol start lost; multi-block items flattened; nested task box stole parent's | block-aware `rt_listItem`, `start`, loose/tight, own checkbox only |
| Copy: tables | `\|` in cells/code split columns; ragged rows | cell context escaping, row padding |
| Copy: links/images | quotes in titles, spaces/parens in URLs, `=WxH`, autolink noise | `rt_url`, `rt_title`, size from width/height, bare autolink |
| Copy: footnotes | copied as `^[[1]](#fn1)^` + a numbered list | renderer breadcrumbs (`data-md="[^label]"`, `data-footnote-label`), defs rebuilt |
| Copy: containers | custom `::: name` dropped; spoil label formatting lost | `data-orz-container` on containers whose class loses information |
| Copy: TOC | copied as a link list | `data-md="{{toc …}}"` |
| Copy: whitespace | U+3000 indentation and nbsp collapsed by `\s` | ASCII-only collapse and trim |
| Copy: inline HTML | `<kbd>`, `<ruby>` (pinyin) lost | emitted as HTML for a whitelist |
| Copy: scope | selection reaching into page chrome converted the chrome | both ends must share one copy root |
| Runtime (real-substrate find) | after `document.open()` (Playwright `setContent`, hosts rewriting a preview) copy/Escape/QR handlers silently stopped — a "bound" flag survived while listeners were dropped | handlers live on the window; every run removes the previous run's and adds its own |
| Render: CJK | emphasis next to CJK punctuation; space at CJK line wraps; linkify eating CJK | ported markdown-it-cjk-friendly (script-property CJK test, no ESM dep); markdown-it-cjk-breaks; `orz_linkify_cjk` core rule |
| Scan: perf | quadratic backtick pairing; per-run `lastIndexOf` on long lines; per-char array | `nextSame` table, paragraph ids, incremental line start, slice building → linear (~300 ms/MB) |
| Meta | CRLF, `：`, `，、；` | `\r?\n` split, `[:：]`, separator class |
| Includes | same URL fetched N times; no expansion bound | per-call fetch cache; `maxSize` budget (default 5,000,000 chars) |

After round 1: 424 tests green twice in a row; round trip 67/67 (happy-dom) and
the real-DOM corpus in Chrome.

### Dismissed (with reasons)

- **Block attributes (`{{attrs[.class]}}`) are not copied.** Block ids must not
  be (C.12: a pasted section must not duplicate an identity), and attrs mix ids
  with classes in one directive; presentation classes rarely mean anything out of
  their document. A copied heading/paragraph keeps its text and formatting.
- **Typographer quotes come back curly.** `"x"` renders `“x”`; copying gives
  `“x”`, which renders identically. The round-trip oracle compares renders, and
  they match.
- **`|` inside math inside a table cell.** markdown-it splits table cells before
  inline parsing, so authors must write `\vert`; copy cannot change that.

### Open — owner's call

1. **Rich paste.** Copy writes only `text/plain` (Markdown). Adding the rendered
   HTML as `text/html` would make paste into Word/Google Docs rich, but editors
   that prefer HTML (Typora, some web editors) would then convert the HTML back
   themselves and lose orz constructs. Current default kept.
2. **CJK heading ids.** `## 化学反应` gets `id="%E5%8C%96…"` (markdown-it-anchor's
   default `encodeURIComponent` slug). It works as a link target but is ugly in
   URLs; GitHub-style slugs would keep the characters. Changing it breaks existing
   deep links into published Chinese documents, so it needs an owner decision.

---

## Round 2 — 2026-10-01

Independent adversary (did not write the code) attacked every claim and audited
the design: **27 findings — 8 HIGH, 11 MEDIUM, 8 LOW**, each reproduced, all
passing the round-1 suite. It also showed the oracle was too lenient
(whitespace collapsed everywhere, ids always ignored) — which hid H4.

### Triage

| Finding | Sev | Disposition |
|---|---|---|
| H1 text inside code copied with Markdown escapes; `~5`, `$5 or $6` escaped | HIGH | fixed — code selections copy raw; `$ ~ ^` decided per block (marks resolved at the end); C.15, C.3 |
| H2 partial selection promoted to the whole table/quote/container/code | HIGH | fixed — promote only when the selection covers all of the block's text; C.15 |
| H3 linkify CJK trim cut real CJK URLs (`/wiki/化学`, `?q=中文`) | HIGH | fixed — cut only after a letter/digit or at CJK punctuation; R.3 |
| H4 code-block blank lines / trailing spaces changed | HIGH | fixed — code blocks protected by placeholders, restored with prefix; C.4 |
| H5 hljs auto-detect class read as fence language | HIGH | fixed — language only from a leading `language-` class; C.4 |
| H6 `\|` unescaped in cell math/HTML/footnotes/breadcrumbs/titles | HIGH | fixed — one parity-aware pipe pass per cell; C.7 |
| H7 brackets in link/alt text | HIGH | fixed — escape `]` too; alt keeps balanced brackets (markdown-it drops escapes from alt); C.8 |
| H8 file includes: duplicated footnotes/ids, TOC blind | HIGH | fixed by design change — includes spliced as tokens at parse time; M.9 (visible in `tests/example.html`: duplicate empty footnote section gone, TOC now lists the included heading) |
| M1 KaTeX error spans | MED | fixed |
| M2 ol numbering of partial selections; adjacent lists merged | MED | fixed — list shell with `start`; alternate `-`/`*`, `.`/`)`; C.6 |
| M3 trailing ` #` in headings | MED | fixed; C.3 |
| M4 line-start markers after hard breaks | MED | fixed (`*`, setext, thematic; every mark escaped so the typographer cannot make a dash); C.3 |
| M5 raw `<span style>`, raw `<details>`, `<b>“y”</b>z` | MED | fixed — foreign-attribute spans and non-spoil details as HTML; C.17; flanking fallback to the element's own tag; new claim C.18 |
| M6 autolink shortcut ignoring what follows | MED | fixed — bare only when linkify would find exactly it again, else `<url>`; C.8 |
| M7 scanner extracted escaped / mid-paragraph / `{{nymlish` blocks | MED | fixed — opener must start its line; new claim M.10 |
| M8 stray backtick before a fence hid the rest from the scanner | MED | fixed — line pass (fences, comments, HTML) before code-span pairing, as CommonMark does; M.10 |
| M9 two meta blocks: extract not idempotent | MED | fixed — all meta blocks removed, first supplies values; M.6 |
| M10 prepareSources vs renderer (quotes, lists, comment on the line, `md` alias) | MED | fixed — prefix continued, comment span only, alias + space; new claim M.11 |
| M11 per-text-node escaping decisions | MED | fixed — marks resolved per block; trailing backslash always escaped; C.3 |
| L1 typography re-applied | LOW | fixed for `(c)/(r)/(tm)/(p)`, `+-`, straight quotes |
| L2 container names colliding with runtime classes | LOW | fixed — authored container wins; C.10 |
| L3 nested container fence counting inside list items | LOW | fixed; C.10 |
| L4 adjacent emphasis merged | LOW | fixed via C.18 fallback |
| L5 sub/sup with spaces | LOW | fixed; C.13 |
| L6 `{{space}}`, class-less `{{sp}}`, `{{attrs}}` classes/ids, comments | LOW | `{{space}}` now survives (style span, C.17); the rest **dismissed**: a class-less span renders identically to its text; attrs carry identity (C.12); HTML comments are not visible content and cannot be selected |
| L7 fence info strings cut (`vue.js`, `{r}`) | LOW | fixed (first word, any characters); text after the first word is not in the HTML — **dismissed**, markdown-it does not render it |
| L8 nested keys, tabs, multiline keywords, quotes | LOW | fixed except: quoted values — **dismissed**: the metadata scanner returns typed strings (quotes stripped) by design, while `{{nyml}}` JSON is raw data; a nyml block inside a blockquote — **dismissed**: metadata belongs at top level |
| Include root `..notes.md`, symlinks; budget not crediting the directive | LOW | fixed; M.12, M.7 |
| Partial selection starting inside inline KaTeX | LOW | fixed — atomic elements (math, data-md constructs) are never split; C.15 |

Design choice recorded: the audit suggested locating directives with
`md.parse()` tokens instead of masked regexes. Not taken this round: orz-paged
consumes nyml element blocks *before* rendering and splices by char offset, so
the scanner must stay byte-precise and cheap; the targeted rules above bring it
into agreement with the renderer for every reproduced case. Revisit if a third
disagreement class appears.

Compatibility: the spoil label breadcrumb sits on `<summary>`, not `<details>`,
because orz-poster (FA-33) counts `<details class="spoil">` literally — the
downstream suite caught it; the fix keeps that markup byte-identical.

### After round 2

458 tests green twice; orz-paged 133/133, orz-slides 55/55, orz-poster content +
parser 72/72 against this checkout. Oracle strictened (exact `<pre>`, ids unless
the source has block ids).

---

## Round 3 — 2026-10-02

Independent adversary, briefed with the round-2 fix list to verify and told to
attack the new mechanisms: **24 findings — 8 HIGH, 10 MEDIUM, 6 LOW**, all
reproduced, many in real Chrome with real mouse gestures. As the method
predicts, most HIGHs were *siblings or holes of round-2 fixes*.

| Finding | Sev | Disposition |
|---|---|---|
| H1 triple-click: range ends at offset 0 of the next block → stray `##`/`-`/`>`/fence/whole unselected equation | HIGH | fixed — `rt_trimRangeEnd` (whitespace-aware) + empty-clone filter; C.15 (real mouse triple-click test over 8 following-block kinds) |
| H2 code block first in a list item / footnote → replaced by its placeholder index | HIGH | fixed — such a block starts on the line below the marker; C.6 |
| H3 container holding a code example with `:::` lines broken on copy | HIGH | fixed — fence counting looks inside protected code; C.10 |
| H4 relative links with text = href (`CHANGELOG.md`, `#intro`) lost | HIGH | fixed — bare/angle only for scheme URLs; C.8 |
| H5 image alt lost escaped characters | HIGH | **renderer bug** fixed in the imsize port (`text_special` joined in image children) — `![Tom\'s dog]` now renders `alt="Tom's dog"`; copy escapes alt normally; C.8 |
| H6 CJK *before* a bare URL linked into a punycoded host (phishing-shaped) | HIGH | fixed — leading CJK run split off; emoji after a URL cut; R.3 |
| H7 triple-click one line of a code block fenced it | HIGH | fixed — any selection inside one code element copies raw (whole blocks too: a copied command pastes as the command); C.15 |
| H8 markdown-it strips a backslash before *every* `\|` in a row (no parity) — the round-2 parity rule was wrong | HIGH | fixed — every cell pipe gets exactly one backslash; C.7 |
| M1 `rt_resolveMarks` quadratic (20,000-item list with `$`: 74.6 s in Chrome) | MED | fixed — prefix/suffix flags, linear; C.16 bound now includes a 4,000-item `$` list |
| M2 whitelisted inline HTML pasted as raw `outerHTML` (escapes inside it lost meaning) | MED | fixed — own tags around walked children; `rt`/`rp` walked too; C.17 |
| M3 `<br>` in a heading split it | MED | fixed; C.5 |
| M4 ol numbering when the selection starts in a nested/adjacent list | MED | fixed — item located by its list child; start fixed along the clone path; C.6 |
| M5 partial table selections shifted cells / promoted body rows | MED | fixed — live cells tagged with their column for the clone; body rows stay body; C.7 |
| M6 quote prefixes multiplied output past `maxSize` (20 M chars) | MED | fixed — the budget charges what is inserted, prefixes included; M.7 |
| M7 prepareSources fetched escaped / indented-code / link-destination includes | MED | fixed for those; **mid-line directives kept** (documented since 1.5.0; Alembic inserts at the cursor) — the renderer-agreement claim covers live text only; M.11 |
| M8 fence indented inside a list item read as live text (meta spliced out of a code example) | MED | fixed — scanner tracks the list content column; tabs expand; indented code cannot interrupt a paragraph; M.10 |
| M9 `<!--` in a code span, or unclosed, blanked the rest of the document | MED | fixed — comment detection skips code spans; an inline comment must close before the paragraph ends; M.10 |
| M10 remote content could make the host renderer read local files via `{{md /path}}` | MED | fixed — file-include directives in fetched text are neutralized; new claim M.13 |
| L1 emphasis fallback judged `textContent`, CJK on either side | LOW | fixed — emitted Markdown, per side; C.18 |
| L2 punctuation/emoji counted as word characters around `_` | LOW | fixed; C.3 |
| L3 typographer `--`, `...` | LOW | fixed; C.3 |
| L4 private-use characters colliding with internal sentinels (could throw) | LOW | fixed — written as entities; C.3 |
| L5 text after a single-line block directive dropped; URL ending `/` + CJK prose; emoji host | LOW | rest-of-line kept as a paragraph (new claim R.4); emoji fixed; **`/` + CJK dismissed**: `python.org/下载最新版本` and `wiki/化学` are indistinguishable in raw text — keeping real CJK paths wins; authors separate prose with a space or use `<url>` |
| L6 misc | LOW | included tokens' `map` now points at the directive (orz-poster reads `map` against the parent); empty fence; `!` before a link; CR-only sources; dead `markdownIncludeActive` removed. **Dismissed**: `a.md` linkified (`.md` is a real TLD — markdown-it/linkify behavior); a footnote label defined in both parent and include resolves to the parent's (one definition per label, as in any single document); two literal `~` in a tight list over-escaped (noise, round trip holds) |

### After round 3

484 tests green twice; orz-paged 133/133, orz-slides 55/55, orz-poster
content/parser/serialize 87/87 against this checkout; `tests/example.html` body
diff unchanged in kind (breadcrumbs + the H8 include fixes).

---

## Round 4 — 2026-10-02

Independent adversary: **7 HIGH, 8 MEDIUM, ~15 LOW**, all reproduced (real
Chrome gestures for selection findings). Again concentrated in round-3 mechanisms.

| Finding | Sev | Disposition |
|---|---|---|
| H1 M.13 bypass: `{{md/path}}`, `{{md[x] /path}}` spellings; two fetched halves joining into a live directive | HIGH | fixed — neutralize every spelling the dispatcher accepts, at live positions only, **after** recursion; M.13 |
| H2 triple-click on the root's last block ends past the root (footer) → no Markdown | HIGH | fixed — root from the range start; a whitespace-only overshoot is clamped to the root before comparing; C.15 |
| H3 single-line / last-line code triple-click fenced; active-tab paragraph copied the whole tabs incl. hidden panel | HIGH | fixed — after trimming, both ends descend into the block content they touch (blocks only, so `<strong>` keeps its formatting); C.15 |
| H4 nyml/yaml data islands and `<style>` pasted as visible text | HIGH | fixed — invisible elements emit nothing; nyml/yaml islands carry `data-md` (copy restores the block; no downstream matched the old markup); C.17 |
| H5 quadratic unclosed-inline-comment lookahead (250 KB → 69 s) | HIGH | fixed — bottom-up `closeAhead` table; M.5 ratio test for comments |
| H6 percent-encoded ASCII URLs trimmed after decoding | HIGH | fixed — no trim when the shown text is not literally in the source; R.3 |
| H7 a mention of `{{nyml` before a real block hid it (search resumed after the wrong `}}`) | HIGH | fixed — a rejected opener resumes right after itself; M.10 |
| M1 start boundary not trimmed (drag from end of previous block) | MED | fixed — symmetric start trim + descent; C.15 |
| M2 code-first in nested items / behind a quote in an item / footnote | MED | fixed — placeholder restore accepts marker and label prefixes, continuation indents by marker width; the newline hack removed; C.6 |
| M3 literal `$$` at a line start became display math | MED | fixed in mark resolution; C.3 |
| M4 nested `ol` numbering in the shell branch | MED | fixed — clone-path walk runs before wrapping; C.6 |
| M5 emoji/symbols before a scheme-less URL glued into the host | MED | fixed — leading emoji/symbol/punctuation/number-form runs split off; flags/keycaps cut after URLs; R.3 |
| M6 fence on a list-marker line; LINE_PREFIX gaps (`- > `, `1. - `, task boxes); neutralization altering code examples | MED | fixed; M.10, M.11, M.13 |
| M7 raw iframe/video/audio vanished on copy | MED | fixed — kept as HTML; C.17 (oracle now treats `attr` ≡ `attr=""`) |
| M8 copy super-linear on table-heavy documents (`querySelector` per table is O(document) in Chrome) | MED | fixed — direct-child row walking; C.16 ratio test over 1,000→4,000 tables |
| LOW | — | fixed: text after a *multiline* directive kept (R.4); nested spoiler label scope; `- ***` (hr emitted as `___`); accidental table delimiter lines; newline in attribute values; `{{sp}}` class with `]` / text with `}}` fall back to HTML; authored empty blocks survive (empty-clone filter only at the fragment's edges); `data-orz-cols` removed; only a table's own rows tagged. **Dismissed**: Cmd+A over page chrome is not converted (C.14 by design — hosts that want whole-page copy put chrome outside the root); `>`-prefixed raw HTML blocks and `{{nyml` lines inside mermaid/yaml/`$$` bodies are still visible to the scanner (rare; a directive locator over parsed tokens is the structural fix, see round 2's design note); an authored `data-orz-col` attribute is removed after a copy (no such attribute exists in orz output) |

### After round 4

508 tests green twice; orz-paged 133/133, orz-slides 55/55, orz-poster 87/87.

---

## Round 5 — 2026-10-02

Independent adversary: **4 HIGH, 5 MEDIUM, 5 LOW**. Convergence is visible:
22,848 Chinese-punctuation × construct × context round trips and 107 Unicode
edge cases (full-width forms, U+2002–200A, U+202F, soft hyphen, ZWSP/ZWJ) all
pass; 10,000-block copy and 13 adversarial 1 MB scan generators are linear.

| Finding | Sev | Disposition |
|---|---|---|
| H1 M.13 still bypassable wherever scanner and renderer disagreed about "live" (split code spans, unclosed comments, list-item fences, type-7 HTML, placement contexts) | HIGH | **fixed structurally**: every local-include spelling in fetched text is neutralized *unconditionally* with an invisible U+2060 word joiner after `{{` (renders identically, live or in code, never a plugin name), and a fence left open at the end of fetched text is closed — the guarantee no longer depends on the scanner; M.13 (10 bodies × 4 placement contexts) |
| H2 triple-click pulled in hidden content (closed spoiler, hidden tab panels, data islands) | HIGH | fixed — range narrowed to its first/last **visible** selected content (TreeWalker; invisible = display:none, closed `<details>` content, script/style), then widened back through inline wrappers the original selection covered whole; C.15 (real triple-clicks) |
| H3 percent-encoded URLs after the round-4 fix: CJK prefix re-glued into a punycoded host | HIGH | fixed — the cut runs on the URL's raw source text (core matcher, or `matchAtStart` at each scheme for inline-linked URLs); shown text recomputed as markdown-it would; R.3 |
| H4 one-line comment masking quadratic (1 MB: 47 s); sibling: distinct-length backtick runs (1 MB: 262 s) | HIGH | fixed — spans joined once; comment detection uses the linear code-span masker with a no-`<!--` fast path (1 MB now ~25–130 ms); M.5 |
| M1 scanner/renderer nyml disagreements (17 contexts) | MED | fixed — block-start boundaries (code spans and inline comments cannot cross a heading/directive/item line), backtick-in-info-string not a fence, list-item fences end with the item, quote fences end with the quote, `$$` math blocks opaque, type-7 HTML cannot interrupt a paragraph, footnote labels as items; `scanNymlBlocks` now masks HTML blocks and indented code like the renderer (orz-paged: 38/38 template blocks, 133/133 tests); M.10 (audit corpus: 0 disagreements) |
| M2 blank lines inside data-md directives collapsed | MED | fixed — multi-line breadcrumbs protected like code; C.11 |
| M3 drag across one row lost its columns | MED | fixed — wrapped as a table row; C.7 |
| M4 closing curly quote absorbed into URLs | MED | fixed — `”` `’` cut; R.3 |
| M5 extra ranges (Firefox) not root-checked, glued | MED | fixed — each extra range root-checked, trimmed, and kept as its own block. Per-cell Firefox ranges come out as separate one-cell tables rather than one grid — **accepted** (no glued text, no chrome; reconstructing a grid from N cell ranges needs a modifier-key gesture we cannot test in Chrome) |
| L1 setext underline did not end the paragraph | LOW | fixed; M.10 |
| L2 footnote code indentation | LOW | fixed — measured: markdown-it-footnote strips up to 5 columns whatever the label; continuation uses 5; C.6 |
| L3 code block holding only a blank line | LOW | fixed; C.4 |
| L4 one timing test flaked once under load | LOW | fixed — bound tests use ratios of best-of-three; absolute backstops generous; C.16 reworded |
| L5 unindented line inside a list-item fence ends the item | LOW | the scanner now mirrors it (see M1) |

### After round 5

538 tests green twice; orz-paged, orz-slides and orz-poster suites green against
this checkout. The auditor's own repro scripts re-run against the fixes: every
security case reported ok (sec1/sec3/sec4), scan corpus 0 disagreements, footnote corpus 0/30 failing, data-md
corpus 0/17, linkify all expected, perf linear.

---

## Round 6 — 2026-10-02

Independent adversary: **4 HIGH, 4 MEDIUM, 7 LOW**. Round-5 fixes verified:
U+2060 neutralization held for 9 bodies × 6 contexts; visibility trimming,
raw-source CJK cuts, comment masking and the scanner corpus (71 real files,
0 disagreements) held. Two findings were answered structurally rather than
patched — round 2 named "a third scanner/renderer disagreement class" as the
trigger for a token-based locator, and M2 was that third class.

| Finding | Sev | Disposition |
|---|---|---|
| H1 round 5's fence closer opened a new hole: a regex fence count did not know list items, comments, `{{yaml}}` bodies or quotes, so the appended closer *opened* a fence and flipped the host's own code example live (file read even with `markdownIncludeRoot`) | HIGH | **fixed structurally** — decided by parsing: fetched text is parsed with a sentinel paragraph appended; it splices only if the sentinel comes out as a top-level paragraph. An unclosed fence is closed with its own markup at its own indentation (list item, quote); anything else left open (comment, raw HTML, `$$`) refuses the include; M.16 (5 openers, 4 refusals) |
| H2 copying indented code dropped the first line's indentation | HIGH | fixed — when the selection lies inside one `pre`/`code`, the original boundaries are restored after trimming; C.15 (Chrome: drag and triple-click) |
| H3 `allowedHosts` bypassed by redirects (SSRF, response spliced into the document) | HIGH | fixed — the default fetcher follows redirects by hand (≤5 hops) and re-checks every hop; a browser's opaque redirect fails closed; custom fetchers are told to do the same; M.15 (two local servers) |
| H4 quadratic scans: `findRaw` per link (1,000 %-URLs: 23 s inside `md.render`), nyml `lastIndexOf` per opener (1.5 MB: 121 s), `findClosing` before rejecting an opener (352 KB: 29 s) | HIGH | fixed — `scanNymlBlocks` now locates blocks from `md.parse` tokens (agrees with the renderer by construction; one parse); URL matches computed once per block and consumed in order. **Sibling found while writing the bound**: plain ASCII URLs were quadratic too (4,000 URLs: 3.4 s) — the per-link "any CJK in this paragraph?" scan and per-cut `splice`; both now once per block. M.5, R.5 (3 URL shapes) |
| M1 copy event quadratic in Chrome (8,000 paragraphs: 8.5 s; two paragraphs in a long doc: 1.45 s) | MED | fixed — trimming walks from the start node to the end node (no `intersectsNode`), table tagging only at the boundaries; C.16 now times the copy event itself |
| M2 scanner read multi-line directive bodies as Markdown: an unbalanced fence/`$$`/`<!--`/`<pre>`/`<script>` in a nyml value hid every later block | MED | fixed — token-based `scanNymlBlocks` (above); `maskInertMarkdown` treats a `{{name` line without `}}` as opaque up to the closing line, so `prepareSources` agrees; M.10, M.11 |
| M3 %-encoded URL cut wrongly when its decoded twin appeared elsewhere | MED | fixed by the positional matching (H4); R.3 now asserts each URL links as it would alone |
| M4 six themes not scoped: bare `*`, `h1`, `a`, `code`, `table` restyled a host page's UI | MED | fixed — every rule scoped with `:where(.markdown-body)` (no specificity change; the box-sizing reset covers `html, body` and the article). Pixel-identical against the pre-scope themes at desktop and mobile for all 12 themes and the starter. M.14: static rule check (`tests/themes.test.ts`) plus a Chrome check that host UI computes as the browser default under every theme |
| L1 `visibility:hidden` copied on triple-click | LOW | fixed; C.15 |
| L2 two adjacent includes joined at the top level | LOW | fixed — a dangling `{{` at the end of fetched text is neutralized too; M.13 |
| L3 html.ts claimed legacy unescape is exact | LOW | comment corrected: a legacy file that already contained `<\/script` reads back as `</script` there |
| L4 U+2060 reached the clipboard | LOW | fixed — stripped on copy; in prose the text stays literal (`\{{md …}}`, C.3); C.19 |
| L5 `访问www.example.com获取` not linked (linkify-it rejects the TLD `com获取`) | LOW | **open by choice** — scheme URLs work (R.3); fixing scheme-less hosts glued to CJK needs our own fuzzy matcher in front of linkify-it, and a wrong guess links prose. Workaround: write the scheme or a space |
| L6 `parseDocMetaIsland` matched `data-id`, and read a body island when the head had none (spoofed uid) | LOW | fixed — head only, exact `id`, island type required; M.17. Alembic's `document-registry.ts` has its own copy of the old regex — family drift D-43 |
| L7 stale scanner comment | LOW | rewritten with the token-based scanner |

### Also changed in round 6

- **Downstream: orz-poster FA-25 was failing since round 4** (round 5's
  "poster green" covered only its content/parser/serialize suites — corrected
  here). Poster strips the runtime's auto-init by regex and checks for the
  literal `addEventListener('copy', onCopy)`, which the round-4 handler rework
  removed. The line is spelled that way again, and the supported way is new:
  `getBrowserRuntimeScript({ autoInit: false })` (C.20). Poster's assembler
  snapshot changes with 1.7.0's breadcrumbs (`data-orz-container`, footnote
  labels) — expected; it is refreshed when poster adopts 1.7.0 (D-43).
- Bound tests interleave the small and large runs and keep the best of up to
  three rounds: a real quadratic fails every round, a load spike does not
  (three full runs in a row green).
- BOM stripped in a core rule, so a BOM-prefixed source parses (and scans) like
  its BOM-less twin; CR-only sources scan correctly (M.1).

### After round 6

587 tests green three times in a row. Downstream against this checkout:
orz-paged 133/133, orz-slides 55/55, orz-mdhtml typecheck + build + island
read-back, orz-poster 604/608 (the expected snapshot, and FA-11 timeouts that
pass alone in ~1 s — poster's own load sensitivity; render speed on 32 real
files is unchanged from 1.6.3). nyml scanner vs renderer on every orz-paged
source: 41/41 blocks.

---

## Round 7 — 2026-10-02

Independent adversary: **5 HIGH, 4 MEDIUM, 7 LOW**. Holds: U+2060
neutralization in 35 contexts (rendered page and re-render of the copy), R.1
on 200,000 random strings, 25,000 random inline CJK compositions (all
failures traced to H-3/L-4), C.14, C.20, M.15, M.17. The report's own
diagnosis was right and is the structural answer of this round: **every M.16
hole so far came from judging fetched text in isolation**, and the directive
locator was the last regex scanner on a security path.

| Finding | Sev | Disposition |
|---|---|---|
| H-1 the sealing sentinel was a fixed string: fetched text containing it passed any check (file read with `markdownIncludeRoot` set) | HIGH | **fixed structurally** — splice safety is now a whole-document property: the spliced document is parsed against a reference with a per-call nonce placeholder per include, and the host's token signature (type, nesting, level, markup, info, content, attributes except heading ids, inline children with link targets; footnote list excluded) must be identical. A trailing open fence is still closed first (nonce-checked). M.16 (10 attack shapes) |
| H-2 sealing judged the fetched text alone; placement changed its parse (mid-line, text after the directive, BOM, CR-only, list item / footnote definition at the end) | HIGH | fixed by the same check, plus normalization (BOM, CR/CRLF → LF) and **block placement**: fetched text always starts and ends its own block, with quote/list continuation prefixes. Behaviour change, documented: a mid-paragraph directive splits the paragraph (Alembic inserts `{{md-include}}` for whole `.md` documents, where block content is the right reading). M.16, M.11 |
| H-3 text after a URL cut at CJK punctuation lost its Markdown (code span, emphasis, link, second URL) | HIGH | **fixed structurally** — the cut moved into linkify's `match`/`matchAtStart` (the core post-pass rule is gone): both linkify rules consume only the URL and the tail is ordinary source text. R.3 (4 cases) + C.2 round trips |
| H-4 dragging into code from the paragraph above dropped the first line's indentation | HIGH | fixed — a range narrowed into one `pre`/`code` that the original start was before starts at the code's start; C.15 (Chrome) |
| H-5 block dispatcher quadratic on unclosed `{{name` lines (inherited by the token-based scanner) | HIGH | fixed — "next line containing `}}`" computed once per block-parse state; an unclosed opener fails in O(1). Inline sibling (M-4) memoizes "no `}}` after p". M.5 |
| M-1 `maskInertMarkdown` treated some host code examples as live; `prepareSources` fetched and spliced into them | MED | fixed — `prepareSources` locates directives from `md.parse` tokens (plugin_block tokens; inline-token content outside code spans). `maskInertMarkdown` stays as a public helper; M.11 |
| M-2 a fetched include could redefine the host's reference links | MED | fixed by the whole-document check (host link targets are in the signature) — the include is refused; M.16 |
| M-3 themes restyled host text through inherited `body` properties | MED | fixed — typography moved from `body` to `:where(.markdown-body)` in six themes and the starter (pixel-identical); static rule + Chrome probe widened to inherited properties; `html { font-size }` (rem base) stays allowed and documented; M.14 |
| M-4 other quadratics: meta-block removal, `lastIndexOf` per directive, inline closer search | MED | fixed (one-pass join; line table + binary search; memo). **The new M.18 bound then caught two quadratics in this round's own rewrite** (whole-output trim per directive, region scan per token) — fixed before landing |
| L-1 a selection starting at the second brace kept U+2060 | LOW | fixed — strip after any `{`; C.19 |
| L-2 tight list with display math copied loose | LOW | fixed — `p.katex-block` is not an item paragraph; C.6 |
| L-3 default fetcher had no timeout | LOW | fixed — `timeoutMs` (default 15 s); M.15 |
| L-4 nested em at an em edge next to CJK punctuation re-parsed wrong | LOW | fixed — same-kind emphasis at an edge falls back to HTML; C.18 |
| L-5 `}}` inside nyml args taken for the end | LOW | fixed; M.10 |
| L-6 empty heading → `id=""`, `id="-1"` | LOW | fixed — `section`, `section-1`; R.6 |
| L-7 opening curly quote absorbed into a URL | LOW | fixed; R.3 |

### Also changed in round 7

- **Family drift D-44:** the carriers' editor previews (FC-12 include) splice
  includes with their own regex — inline, without block placement, splice
  check or neutralization. Display-only in a browser, but previews can differ
  from the published render; FC-07 now says implementers call
  `prepareSources` with a cache-backed fetcher.
- The Chrome copy-event bound got the retry-best-of-three-rounds treatment
  (it flaked once in a long-lived page; 3/3 green alone).

### After round 7

636 tests green twice. Downstream against this checkout: orz-paged 133/133,
orz-slides 55/55, orz-poster 603/608 (the expected 1.7.0 snapshot, and
FA-04/FA-11 timeouts that pass alone: 20/20). All 13 theme files
pixel-identical to the pre-change baseline (dark-elegant-3 desktop has two
render states of its own; the new shot matches one of them exactly).

---

## Round 8 — 2026-10-02

Independent adversary: **6 HIGH, 8 MEDIUM, 4 LOW**. Round-7 holds: the nonce
(H-1), Markdown after a URL cut (H-3), drag into code (H-4, Chrome), unclosed
`}}` (H-5), reference redefinition refused (M-2), container closers refused,
M.13 (case, args, multi-line bodies, the https exemption, joins, NUL), happy
path linear, 10 English/Chinese real-mouse copies. The lesson of the round,
in the auditor's words: **every M.16 hole was a dimension the signature did
not compare** — and two of round 7's own new mechanisms (linkify narrowing,
the per-include fallback) were the regressions.

| Finding | Sev | Disposition |
|---|---|---|
| H1 an include could rewrite a host footnote (last definition wins; the footnote tail was outside the signature) | HIGH | fixed — an include whose footnote labels meet a label the host defines or cites is refused; its own footnotes still join the list. M.16 |
| H2 raw HTML in fetched text hid or exposed host content (`<!--` in a list/quote, `<div>` unclosed, `</details>` in a spoiler, `</div>`), invisible to a token comparison | HIGH | fixed — fetched raw HTML (html_block + html_inline, concatenated) must balance: comments closed, elements closed in order, nothing closed that it did not open, no page-level element (`style`, `script`, `base`, `meta`, `link`, `iframe`, …). Balanced HTML still passes. M.16 (7 attacks) |
| H3 round 7's linkify narrowing dropped or cut valid CJK URLs (`Python_(编程语言)`, `www.百度.com`, `?q=北京+天气`, `#第1章`, `Category:中国`) — a regression from 1.6.3 | HIGH | **fixed by redesign** — a context-free prose boundary (CJK punctuation, emoji, curly quote; or CJK right after an ASCII letter, digits after a letter counting as that word) cuts the text *before* linkify-it runs; no re-matching. New property test: with spaces around it, every URL in a Chinese corpus links exactly as plain markdown-it. R.3 |
| H4 glued Chinese links were quadratic (2,000 links: 7.9 s) | HIGH | fixed by the same redesign (`matchAtStart` sees only up to the next boundary; `match` runs on the pieces between boundaries); R.5 |
| H5 the per-include fallback was quadratic; nested fan-out cubic | HIGH | fixed — group testing (whole group tight, then loose; else halves; ≤ 48 whole-document checks per level, then refuse the rest), and resolved bodies cached per position in the include chain; M.18 |
| H6 unclosed `[` in args quadratic (block and inline) | HIGH | fixed — block args searched within the line; inline caches the next-`]` search; M.5 |
| M1 heading ids hijacked/duplicated | MED | fixed — ids are in the signature, and a new duplicate id refuses the include |
| M2 a fetched `kind: meta` block took over the document metadata | MED | fixed — an included document's metadata blocks are dropped before splicing |
| M3 placement loosened tight lists / merged ordered lists unseen (`hidden` not compared) | MED | fixed — `hidden` in the signature, and whole-line includes are tried **tight** first (the line is replaced), loose only if tight would change the host |
| M4 task box counted as indentation → included paragraphs became code | MED | fixed (the old round-4 expectation encoded the bug: 6-space continuation) |
| M5 a mid-line split broke host emphasis/link text (the reference shared the split) | MED | fixed — a directive splits only at the paragraph's top inline level (checked by re-parsing the paragraph with placeholders, host references in env); inside emphasis, link text, a heading or a cell it stays |
| M6 `maxSize` ignored inserted prefixes (82 MB output) | MED | fixed — the budget charges prefixed growth; the probe was strengthened after a mutation test showed the first version passed without the fix |
| M7 a host `{{toc}}` refused every include with headings | MED | fixed — TOC contents are not compared (included headings join it by design) |
| M8 locating split directives quadratic | MED | fixed — a directive spread over lines is skipped before searching |
| L1 empty file merged host lists | LOW | fixed — a whole-line directive with nothing to insert stays (renders nothing); mid-line it is removed |
| L2 CJK URL + `--`/`_` not linked | LOW | fixed by the H3 redesign (`x--说明` stays in the URL, as linkify-it alone links it) |
| L3 include in a table cell refused | LOW | by design now (M5): a cell cannot hold block content; documented in M.11 |
| L4 the M.14 static check only tested selector starts | LOW | fixed — a page root must stand alone; a qualified root (`body.font-serif`) may only set custom properties. **It found a real leak**: light-neat-3's `body.font-handwritten { font-size }` resized host UI (and compounded with the article's own class); moved to the article |

**Mutation check of this round's probes:** each new splice check (footnote
labels, HTML balance, inline depth, list tightness/tight-first, ids, metadata,
budget) was disabled in turn; every one made its probe fail (the budget probe
only after it was strengthened).

### After round 8

673 tests green twice. Downstream: orz-paged 133/133, orz-slides 55/55,
orz-poster 605/608 (the expected 1.7.0 snapshot and its load timeouts).

---

## Round 9 — 2026-10-02

Independent adversary: **2 HIGH, 0 MEDIUM, 0 LOW**. Holds: every obvious
raw-HTML attack refused or balanced (`<!--`, `<div>`, `</details>`,
`<plaintext>`, `<p>` auto-close, nested lists); footnote collisions, ids,
metadata, tight-first, budget; **no false refusals** in 12 common placements
(matching headings, `<br>`/`<p>`/`<img>`, `<details>`, tight lists, two
includes, `::: tab`/`::: cols`, SVG/MathML); refused-include fan-out and
glued links linear.

| Finding | Sev | Disposition |
|---|---|---|
| HIGH-1 `rawHtmlStaysInside` took `<div/>` as self-closed; HTML5 honours `/>` only on void and foreign elements, so the host text after it was re-parented (hidden with `display:none`) | HIGH | fixed — `/>` closes only inside SVG/MathML; void elements need nothing. **Plus a real-browser oracle** (the auditor's top improvement): for 16 raw-HTML attacks × 5 placements, Chrome must put the host text after the include at the same DOM path as with a harmless include. Mutation check: with the old rule, both the token probes and the Chrome oracle fail. M.16 |
| HIGH-2 round 8's context-free boundary also cut inside URL paths (`/item/Java语言`, `/wiki/Python编程`, `/v2章节`, emoji in a path) — the reverse regression | HIGH | fixed — the boundary is now host-aware in one forward pass: in a host, CJK/emoji after ASCII is prose; in a path, query or fragment only CJK punctuation, curly quotes, and raw CJK after a percent-escape cut. **Owner-visible trade-off:** prose glued straight onto a URL *path* (`/docs获取更多`) cannot be told from a page name (`/Java语言`); it now stays in the link, as in linkify-it and 1.6.3, because a wrong link target is worse than a link running into prose. A round-3 expectation that encoded the path cut was updated. The R.3 property corpus gained the round-9 URLs plus Japanese and Korean paths |

### After round 9

684 tests green twice. Two HIGHs, each a single-mechanism defect with a
local fix — the loop is converging; round 10 decides whether to stop.

---

## Round 10 — 2026-10-02

Independent adversary: **2 HIGH, 1 MEDIUM, 2 LOW** — with a stated coverage
gap (M.13 and the copy/linearity/theme/consumer claims were not re-attacked;
round 11 must cover them). Holds: round 9's `<div/>` refusal and oracle, the
host-aware boundary for the round-9 corpus, no false refusal of the control
include, full-width alphanumerics, half-width katakana, `localhost:8080/路径`.

| Finding | Sev | Disposition |
|---|---|---|
| H1 the raw-HTML balance scanner still mis-modelled the HTML parser: foreign-content breakouts (`<svg><div/>`, `<foreignObject>`, `<math><mi>`), comment states (`<!-->`, `<!--->`, `--!>`), EOF in a tag or quoted attribute, raw-text elements (`<plaintext>`, `<xmp>`, `<noembed>`, `<noscript>`, `<textarea>`) | HIGH | **fixed by replacing the model with an allowlist** — four rounds of balancing holes all came from hand-modelling the tokenizer. The property that matters: the browser never closes a fetched element earlier than the model, since only then can a fetched end tag close a host container. So: plain elements whose start tags pop nothing, strict tag syntax (every `<` a complete tag or well-formed comment), `li`/`dt`/`dd`/table parts only in their own parent (their implied closing cannot pass it — this also closes `<li><div><li>` and `<td><div><td>`, found while designing), every raw element closed inside its Markdown container (a generated `</li>`/`</p>` pops leftovers: `- a <div>\n- b </div>`), no `<a>` in a link, no event-handler attributes. SVG/MathML in fetched raw HTML is now refused — a deliberate false-refusal cost. Chrome oracle corpus 16 → 32 attacks, now also checking visibility; token probes for all 18. Mutation check: with the check disabled, 28 token probes and the oracle fail |
| H2 `CJK_PUNCT` (U+3000–303F) included letters and numbers (々 〆 〇 〡–〩 …): `/wiki/佐々木朗希` linked as `/wiki/佐` | HIGH | fixed — the set excludes `\p{L}\p{N}`; corpus extended (佐々木朗希, 人々, 二〇二四年, 〆切) |
| M1 R.3's two promises conflicted (punctuation cut vs "exactly as plain markdown-it") | MED | fixed both ways — a full-width bracket pair closed inside a path stays in it (`/中华人民共和国（1949年）`), and R.3 now scopes the plain-markdown-it promise to URLs without CJK punctuation or curly quotes |
| L1 IPv4 host glued to CJK linked a punycoded host | LOW | fixed — in a host, CJK after an ASCII digit is prose too |
| L2 `orz.how-获取` links an IDN host | LOW | dismissed — after `-` a CJK run can be an IDN label; linkify-it and 1.6.3 agree |
| L3 render-time nyml numbering outside the signature (an included block would take `nyml-data`) | LOW | fixed — each host nyml block carries its ordinal in the signature; probe added |

### After round 10

709 tests green twice.

---

## Round 11 — 2026-10-02

Two independent adversaries in parallel (round 10's coverage was partial):
half A on includes and security, half B on rendering, copy, themes and
consumer surfaces. **7 HIGH, 3 MEDIUM, 3 LOW** in total.

Holds (A): M.12 root confinement over 15 path tricks; **M.13: 0 leaks over
168 neutralization variants × 6 host shapes**; the token-signature core
(reference redefinition, ids, footnotes, container closers, 5-placement raw
HTML); M.7/M.15/M.18; no false refusals over 17 common include shapes.
Holds (B): 0/1,500 flat block round trips failing; real-mouse copies of tabs,
spoilers, partial tables, list starts; Chrome copy-event cost 2.9–5.3× for 4×;
R.3 on 27 real CJK/JP/KR URLs × 5 contexts (all differences intended, except
H4); M.1/M.4/M.9/M.10/M.14/M.17/C.20/R.6.

| Finding | Sev | Disposition |
|---|---|---|
| A-H1 an id/name in fetched raw HTML escaped the duplicate-id check (tokens carry no attrs for raw HTML): the host's `#intro` target was hijacked | HIGH | fixed — ids and anchor names in raw HTML (and `{{sp}}` bodies) are counted; M.16 (3 probes) |
| A-H2 markup orz itself re-emits bypassed the HTML allowlist: `{{sp …}}` bodies and `::: spoil` labels render inline HTML, `{{attrs[onmouseover=…]}}` sets any attribute — event handlers ran in Chrome | HIGH | fixed — `{{sp}}` bodies and spoil labels are parsed and walked through the same allowlist; any token attribute named `on*` refuses; M.16 (5 probes + a harmless-directive probe) |
| A-H3 `{{yaml}}` escaped only the literal `</script>` (`</script >`, `</script/>` closed the island) — **a standalone render bug**, not only an include one | HIGH | fixed — reversible `escapeScriptText`; no family consumer reads yaml islands; new claim M.19 |
| B-H1 round 10's linkify wrapper scanned the rest of the paragraph at every `://` (80 KB: 70 s), and the bracket-pair search was unbounded (64 KB: 18 s) | HIGH | fixed — `matchAtStart` asks linkify-it first and scans only its match; the closer search is bounded to 64 characters; 8 adversarial shapes now ≤ 4.9× for 4×; R.5 (6 probes) |
| B-H2 bare-URL copy re-linked a different target (`<https://a.com/x>获取更多`, `[https://…]`, `text<https://…>`) — the copy rule still assumed round 3's "CJK after a URL ends it" | HIGH | fixed — bare only when nothing glues before it and what follows is whitespace, ASCII punctuation linkify stops at, or CJK punctuation (not letters, not `]`, not an opening full-width bracket); else `<url>` / `[text](url)`; C.8 (8 round trips) |
| B-H3 dragging from an indented code line out of the block dropped its indentation (sibling of round-6 H2 / round-7 H-4) | HIGH | fixed — a narrowed start inside code that holds the original start keeps the exact start; C.15 (Chrome) |
| B-H4 the percent-escape cut broke `?q=%23中国`, `C%2B%2B标准` | HIGH | fixed — cut only after an escaped UTF-8 byte (`%[89A-F]x`), i.e. raw CJK after encoded CJK; R.3 |
| B-M1 `extractDocMeta` not idempotent for glued meta blocks | MED | fixed — removal repeats until none is left; M.6 |
| B-M2 tight items glued blocks (quote + table, adjacent lists) | MED | fixed for quotes (an empty `>` line ends the quote without a blank line, so the item stays tight) and adjacent lists (alternate markers, whitespace text nodes no longer reset the tracking). **Open by choice:** two tables directly adjacent in one tight item still merge — separating them needs a blank line (the item turns loose) or an HTML comment (changes the render) |
| B-M3 CHANGELOG claimed byte-identical output | MED | fixed — the 1.7.0 intro now lists every rendered-output change (poster's snapshot depends on it) |
| B-L1 stale copy-event figure | LOW | fixed |
| B-L2 `\^[link](u)` copied as an inline footnote | LOW | fixed — a text caret (a per-block mark at that point) before a link is escaped; the linkify-it quirks (`http://a.com_`, `]www.x`) are dismissed: shared with plain markdown-it |
| B-L3 CR-only leftover blank lines in `extractDocMeta` | LOW | fixed |

A mutation slip worth recording: a first mutation of the A-H1 fix
(`false && A || B`) left the inline path active and looked like two probes
did not depend on the fix; a direct instrumented run showed they do.

### After round 11

748 tests green twice.

---

## Round 12 — 2026-10-02

Two parallel adversaries again. **5 HIGH, 4 MEDIUM, 6 LOW.** Half A
enumerated every path from directive text to HTML; half B fuzzed 37,800
autolink contexts, 8,000 block and 4,000 inline compositions, 5,783 spaced
CJK/JP/KR URLs, and ran real-mouse Chrome copies.

Holds: plain-render escaping on every plugin and container path; M.19; M.13
(no new spelling); no false refusals over 12 shapes; M.18 (4× ≈ 2.5×); block
round trips (the only failures are KaTeX error/annotation whitespace); the
round-11 drag fixes in real Chrome; the copy event on 9 new shapes; M.1/M.4/
M.8 (real CDN libraries)/M.10/M.14 (13 stylesheets)/M.17/C.20.

| Finding | Sev | Disposition |
|---|---|---|
| A-H1 `{{sp}}` bodies and spoil labels were checked with the BLOCK parser while the renderer parses them INLINE: a fence opener or reference definition hid `<img onerror>` (ran on load in Chrome) | HIGH | fixed — checked with `parseInline`, the renderer's own path; M.16 (4 probes) |
| A-H2 `javascript:` URLs (also `&#106;avascript:`, `java&#9;script:`) in fetched raw HTML ran on click | HIGH | fixed — raw-HTML attributes come from an allowlist; URL attributes (href, src, srcset, cite, poster) are entity-decoded, stripped of control characters and whitespace, and validated like Markdown links; `data-md`/`data-orz-*` refused (A-L1); M.16 (10 probes) |
| A-H3 fetched text could cover the host with a fixed overlay (raw `style`, `{{attrs[style=…]}}`, `::: left`/`::: cols` arguments — the last two in plain renders too); `checkVisibility` could not see it | HIGH | fixed — `style` limited to a property allowlist (no `position`, `transform`, `url()`, negative margins); `::: left`/`::: cols` put only CSS lengths/track sizes into `style` in every render (new claim R.7); **the Chrome oracle now also hit-tests the host text's line box with `elementFromPoint`** (a float beside it narrows the line, an overlay covers it). Mutation check: with `safeStyle` disabled, the oracle reports "covered" and 5 probes fail |
| B-H1 bare-URL copy still re-linked a different target before a hard break or ASCII punctuation (`https://a.com/docs⏎` → `…docs\`; `<url>.html`); 765/1,388 fuzz failures | HIGH | fixed — bare only when the URL ends in an alphanumeric, `/` or CJK, nothing but whitespace or CJK punctuation follows (never `<br>` or an element), and only whitespace, `(` or (for scheme URLs) CJK precedes; else `<url>`. C.8 (14 round trips) |
| B-H2 linkify quadratic again for URLs cut at CJK punctuation in unspaced prose (216 KB: 21 s) — linkify-it's path pattern runs to the next whitespace | HIGH | **fixed structurally** — the inline linkify rule is wrapped so the wrapper sees the paragraph: boundaries are computed once per paragraph and the text is cut at the next one *before* linkify-it runs. The fix first regressed the round-6 ASCII-URL bounds (a per-call non-ASCII test of the whole paragraph); the ASCII test is now cached per paragraph too. R.5 (5 new shapes, all ≤ 5.4× for 4×) |
| A-M1 an over-long `{{qr}}` threw and took down the whole render | MED | fixed — falls back to the escaped directive text; R.7 |
| B-M1 items without paragraphs merged blocks (round 11's "open by choice" premise was wrong: without `<p>` a blank line renders nothing) | MED | fixed — such a list is copied loose when a quote/table/list must stay apart from the next block and no item holds bare inline text; C.6 |
| B-M2 CHANGELOG still claimed "other documents render as in 1.6.3" | MED | fixed — the list now names every change found (CJK emphasis, island breadcrumbs and escapes, value escaping, alt text, trailing paragraphs, …) and asks hosts to diff rather than assume equality |
| B-M3 R.3's promises conflicted for host-glued CJK and `%XX` cuts | MED | fixed — the plain-markdown-it promise excludes exactly the documented cuts |
| B-L1 M.6 failed past 8 glued meta blocks | LOW | fixed — loop until none (each pass removes one) |
| B-L2 README/embedding said a TOC copies as links | LOW | fixed — it copies as `{{toc 2,3}}` |
| B-L3 copy lost links (`中<mailto:…>`, `"www…`) | LOW | fixed by the H1 rule (CJK before scheme URLs only; quotes not a safe predecessor) |
| B-L4 copy created links for text linkify rejected | LOW | fixed for scheme text (`://` copied as `\://`); **dismissed** for fuzzy hosts (`wordwww.baidu.com~~`): escaping a `.` can still leave a fuzzy-matchable host, and the source text is one linkify-it itself rejected |
| B-L5 `&name;` left raw in a `[text](url)` destination | LOW | fixed — `&` escaped in destinations |
| A-L1 fetched `data-md` | LOW | fixed (A-H2) |

### After round 12

793 tests green twice.

---

## Round 13 — 2026-10-02

Two parallel adversaries. **6 HIGH, 1 MEDIUM, 4 LOW.**

Holds (A): `javascript:` in `srcset`/`poster` refused; no false refusals over
14 shapes; mermaid with the real library (strict default) gave no script and
no covering; runtime reads of author data (`textContent` tab labels,
`data-js`, `data-qr-ready`) stay local; fetched `.tabs` cannot capture host
panels. Holds (B): the linkify memo equals round-11 semantics on 50,000
random paragraphs; **C.6 0/12,000 list compositions failing**; C.8 apart from
the findings below; C.15/C.16 in real Chrome (7 shapes ≤ 5.8×); M.14 65/65
setups; M.1/M.6 0/20,000; M.4, M.17, C.20, M.8; the 70-document 1.6.3 diff
matches the CHANGELOG list except one item.

| Finding | Sev | Disposition |
|---|---|---|
| A-H1 a class alone (`class="qrcode-overlay"`, whose common.css rule is `position:fixed`) put a phishing box over the host; the oracle hit-tested only a short line's centre | HIGH | **fixed by removing the vector** — fetched raw HTML may not carry `class` (nor `style`, A-H2); fetched text may use only documented containers (`::: any-class` refused) and documented `{{sp[…]}}` classes; `{{attrs}}` may not set classes. The oracle's host line now wraps across the article and is hit-tested at three points on every line box; mutation check: with `class` re-allowed, the oracle reports "covered" |
| A-H2 allowed CSS still painted over the host (`opacity` stacking, huge `font-size`, `/**/-` and `calc(…*-1)` negative margins) | HIGH | fixed — no `style` in fetched raw HTML or `{{attrs}}`; the only token style allowed is markdown's own table alignment. Value policing lost every round; the vector is gone. Documented false-refusal cost: an include that styles its HTML is refused |
| A-H3 footnote targets (`fn1`, `fnref1`) hijacked by a fetched id — render-time ids were outside the duplicate-id check | HIGH | fixed — render-time id patterns are reserved (`fn(ref)?N(:N)?`, `nyml-data(-N)?`, `orz-*`) for raw HTML ids/names and `{{attrs[#…]}}` |
| A-H4 `id="nyml-data"` hijacked the data island | HIGH | fixed by the same rule |
| B-H1 the round-12 linkify memo had one slot; an image alt or inline footnote (their own inline state) evicted it, making rendering quadratic again — English too (313 KB: 7.6 s) | HIGH | fixed — the memo is a `WeakMap` keyed by inline state; R.5 (3 nested-parse shapes) |
| B-H2 an indented nyml body lost every field in the scanner (the dispatcher's `trim()` strips only the first key's indentation), so `extractDocMeta` deleted the metadata — a regression from 1.6.3 | HIGH | fixed — the base indentation comes from the key lines after the first; M.10 (3 shapes + nested keys) |
| A-L1 a float with a huge height pushes the host down | LOW | moot — no `style` in fetched HTML |
| B-M1 a glued email with `:` in its local part copied as a URI autolink | MED | fixed — `<email>` only without `:`; else `[text](mailto:…)`; C.8 |
| B-L1 links inside sub/sup copied as literal link syntax | LOW | fixed — sub/sup bodies copy as their escaped text; C.8 |
| B-L2 CHANGELOG overclaimed the spaced-URL promise and missed spoil labels in the output-change list | LOW | fixed |
| B-L3 README plugin list stale (imsize, cjk-breaks) | LOW | fixed |
| (B) fuzzy hosts created by escapes/typographer (`www.b.cn--`, `a@b.com==`) | — | dismissed, as in round 12 (source text linkify-it itself rejected) |

### After round 13

820 tests green twice. Downstream: orz-paged 133/133, orz-slides 55/55.

---

## Round 14 — 2026-10-02

Two parallel adversaries. **6 HIGH, 6 MEDIUM, 7 LOW.**

Holds (A): mermaid (real library) with `style`/`classDef`/`themeCSS`/`fontSize`
never covers host text; bidi cannot reorder host text (includes always start
their own block); reserved ids refused; M.13/M.12 unchanged; no script path in
plain renders; QR/tabs/charts act only on author nodes; 24/30 common shapes
accepted. Holds (B): R.5 and the Chrome copy event linear on 30 + 14 shapes;
the masker and scanner linear; C.1/C.2 3/4,000 exotic fuzz failures; C.15 all
11 real-mouse selections; C.20; R.1 0/200,000; M.14; M.17; M.1/M.2.

| Finding | Sev | Disposition |
|---|---|---|
| A-H1 the raw-HTML id regex was case-sensitive and stopped at a quoted `>`; `{{attrs[ID=…]}}` likewise — host anchors hijacked | HIGH | fixed — ids collected with the strict tag tokenizer, attribute names in any case |
| A-H2 a percent-encoded fetched id took a host's non-ASCII anchor (browsers try the raw fragment first) | HIGH | fixed — ids compared percent-decoded |
| A-H3 the same regex was quadratic on one long attribute (240 KB: 29 s) | HIGH | fixed with A-H1 (one scan per tag); M.18 probe |
| A-H4 `<img name="querySelectorAll">` overrode document methods and turned off enhancement and copy | HIGH | fixed — `name` only on `<a>`; runtime globals (`hljs`, `mermaid`, `chart`, …) reserved as ids |
| A-M1 `rel="opener"` / `target="_top"` let fetched links navigate the host | MED | fixed — `target` only `_blank`, `rel` only `noopener`/`noreferrer`/`nofollow` |
| A-M2 `aria-owns` re-parented host headings in the accessibility tree | MED | fixed — id-referencing ARIA attributes refused |
| A-M3 false refusals: an include duplicating its own anchor (`<a name="install">` + `## Install`), `width="200px"`, `height="auto"` | MED | fixed — only ids the host uses count; unit sizes allowed |
| A-L layout (floated `align` media, `{{space 100000}}`, `<video width>`), hand-written checkbox refused | LOW | fixed — `align` left/right refused on media/tables, `{{space}}` capped (R.7), `video { max-width:100% }` in common.css, checkbox attributes in any order |
| B-H1 `extractDocMeta` quadratic on glued meta blocks (round 11's repeat-until-none loop re-parsed per pass), inherited by `prepareSources` | HIGH | fixed — glued followers are removed at the cut points only, each parsed alone; M.5 probe (direct and through an include) |
| B-H2 nested copy roots: an end inside a nested root counted as "outside", the range was clamped to the outer root's end and copied unselected text (orz-slides title template) | HIGH | fixed — the nearest root holding both ends; C.14 (both directions, Chrome; mutation-checked — the first probe did not exercise the loop and a second was added) |
| B-M1 round 13's base inference read a first `\|` block's content as keys | MED | **fixed structurally** — the dispatcher hands the untrimmed body (`meta.rawBody`) to the scanner; the base is the first key's own indentation (as in 1.6.3), inferred only for a key on the opener line. All 41 orz-paged blocks: identical fields to 1.6.3 |
| B-M2 spaced CJK IDN hosts (`百度.com`) lost their link | MED | fixed — a whole non-ASCII label before `.` is an IDN host; CJK glued onto ASCII stays prose (`请访问www.baidu.com`). `中a.com` is read as prose + `a.com` — documented trade-off (mixed labels are rare, glued prose is common) |
| B-M3 the README/skill quick start (`import md from`) failed in native ESM | MED | fixed in the docs (`import { md }`); shipping an ESM entry is left for a later release |
| B-L1 skill docs: header-anchor, `:::name`, youtube URL, `{{em smile}}`, yaml `.textContent`, container-copy caveat | LOW | fixed — youtube now really accepts full URLs (R.7); the rest corrected |
| B-L2/L3 copy links fuzzy/mailto text linkify rejected | LOW | dismissed (round-12 class) |
| B-L4 CJK destinations copied percent-encoded | LOW | fixed — decoded when it re-encodes to the same href |
| B-L5 flaky 2,000-block Chrome test | LOW | fixed — explicit timeout |

### After round 14

847 tests green twice. Downstream: orz-paged 133/133 (41/41 nyml blocks,
fields identical to 1.6.3), orz-slides 55/55.

---

## Round 15 — 2026-10-02

Two parallel adversaries. **1 HIGH, 2 MEDIUM, 3 LOW.** Half A (includes and
security) found **no HIGH** for the first time since round 6.

Holds (A): M.13 0 leaks; M.19; M.7; M.12; the whole M.16 allowlist core
(SVG/MathML/form/map/base/meta/`details name`/`img usemap`/`img name` refused,
URL validation, reserved and duplicate ids, `target`/`rel`, id-referencing
ARIA, no class/style, size caps, R.7); M.11/M.15/M.18. Holds (B): C.14 nested
roots in real Chrome (12 drags in both directions over three levels, triple-
clicks, roots without `.markdown-body`); glued-meta removal idempotent and
linear in 8 shapes; nyml `rawBody` identical under LF/CRLF/CR in 36 shapes and
equal to 1.6.3 except M1 below; linearity ≤ 4.8× on 11 shapes; 4,000-composition
copy fuzz with no new class; C.20; M.14; M.17; docs examples run in native ESM.

| Finding | Sev | Disposition |
|---|---|---|
| B-H1 round 14's readable-destination copy decoded `%25XX` to `%XX`, `%5C` to an escape and `%7F` to a control character — links pasted to a different target (517/6,000 fuzzed hrefs) | HIGH | fixed — decoded only when the result has no `%`, `\`, control character, whitespace or delimiter; C.8 (5 shapes) |
| A-M1 fetched text could add landmarks and heading roles to the host's accessibility tree, and `{{attrs}}` could set `contenteditable`/`accesskey` (no name allowlist on token attributes) | MED | fixed — raw HTML: `role` only `presentation`/`none`, `aria-label` only; no `nav`/`main`/`header`/`footer`/`aside`; token attributes get their own name allowlist (`tabindex` only `-1`). Markdown headings in an include remain headings, by design |
| B-M1 a nyml block closed on its last content line lost that line's indentation (the dispatcher stripped all of it): a `\|` value lost its last line, a nested key leaked to the top level — a 1.6.3 regression | MED | fixed — the closing line keeps its indentation relative to the opener, like the middle lines; M.10 (3 shapes, quotes included). orz-paged: 41/41 blocks equal to 1.6.3 |
| B-L1 glued followers inside a quote, or with `}}` in args, survived extraction | LOW | fixed — parsed with the line's container prefix; closer searched after `[args]`; M.6 |
| B-L2 symbols glued before a host (`→a.com`) and `百度-x.com` | LOW | `百度-x.com` fixed (a label joined by `-` is one IDN host); symbols glued to a host are now a documented R.3 exception |
| B-L3 `{{youtube}}` missed music./nocookie/uppercase/`/v/` URLs | LOW | fixed; look-alike hosts still not taken for YouTube |

### After round 15

876 tests green twice. Downstream: orz-paged 133/133 (41/41 nyml blocks equal
to 1.6.3), orz-slides 55/55.

---

## Round 16 — 2026-10-02

Two parallel adversaries. **4 HIGH, 2 MEDIUM, 8 LOW.**

Holds (A): the allowlist structure (RAW/TOKEN attribute names, `on*`/`data-md`
refused, roles, ARIA refs, `name`, `target`/`rel`, no class/style, URL
validation, reserved ids incl. runtime globals); every plugin value escaped;
display math clipped by common.css; plain mermaid includes draw without
covering. Holds (B): C.20; C.16 linear in Chrome; C.14/C.15 real drags; C.1–C.8
under fuzz apart from M1/L4 and dismissed classes; R.2/R.4/R.6/R.7; M.1–M.3;
M.17; M.8; README/skill examples; the 773-file corpus diff matches the
CHANGELOG list apart from L5–L7.

| Finding | Sev | Disposition |
|---|---|---|
| A-H1 N directives naming one large file re-ran the per-include preparation (metadata strip, fence close, allowlist parse) N times, and a refused file is charged no budget: 145 KB blocked the event loop for 62 s | HIGH | fixed — the prepared body (with its allowlist verdict and footnote labels) is memoized per position in the include chain, like the nested resolution; M.18 probe |
| A-H2 fetched KaTeX painted over host text: `\smash{\rule[-4em]{60em}{3em}}` (inline math is not clipped) | HIGH | fixed — fetched math using `\smash`, `\raisebox`, `\[lrc]lap`, `\lower`/`\raise`, a raised `\rule[…]` or a negative kern/space is refused (a host's own math is unaffected); the Chrome oracle now loads the KaTeX stylesheet and carries 4 math attacks; mutation check: with the math check disabled, the oracle reports "covered" |
| B-H1 `extractDocMeta` quadratic on CR-only sources (`lastIndexOf('\n')` found no line start) — a sibling of round 14's fix; orz-paged and orz-mdhtml call it on author source | HIGH | fixed — line start found by walking back over `\n` or `\r`; M.5 probe |
| B-H2 block openers inside a list item with a far `}}` rescanned to the item's end each (pre-existing in 1.6.3) | HIGH | fixed — a failed scan records its break line per `blkIndent`; later openers before it fail at once; M.5 probe (render and extractDocMeta) |
| B-M1 a `{{toc}}` after/inside a list copied as plain links; a second adjacent TOC was dropped | MED | fixed — an element carrying `data-md` is never treated as a continuing list; C.11 (3 shapes) |
| B-M2 an indented `{{yaml}}` body closed on its last line rendered as invalid YAML (`trim()` strips only the first line) | MED | fixed — block bodies are dedented by their common indentation before trimming (output change, documented); M.19 |
| B-L1 readable destinations decoded percent-encoded hosts | LOW | fixed — only path/query/fragment decoded; mailto never |
| B-L2 glued followers behind list markers of ≥4 columns survived | LOW | fixed — the follower's prefix keeps the real markers |
| B-L3 tab/space mismatch on the closing line | LOW | fixed — the closing line is cut by columns via `getLines`, like the middle lines |
| B-L4 an emoji in a heading changed the id after copy | LOW | fixed — emoji carry a `data-md` breadcrumb (output change, documented) |
| B-L5 CHANGELOG missed the closing-line change | LOW | fixed (with the dedent and emoji changes) |
| B-L6 `KATEX_VERSION` vs a newer installed KaTeX | LOW | fixed — `katex` pinned exactly (one copy satisfies the plugin's `^0.16.0`). Passing an instance through the plugin's `katex` option was tried and reverted: ESM and CJS loaders resolve `katex` and `katex/contrib/mhchem` to different builds and `\ce` broke |
| B-L7 `::: cols repeat(6,1fr)` (an orz-poster fixture) lost its grid | LOW | fixed — `repeat()`/`minmax()` tracks accepted |
| B-L8 the rem base on `<html>` changes host monospace sizing | LOW | dismissed — the documented M.14 carve-out (`html` sets the rem base) |

### After round 16

903 tests green twice. Downstream: orz-paged 133/133 (41/41 nyml blocks equal
to 1.6.3), orz-slides 55/55.

---

## Round 17 — 2026-10-02

Two parallel adversaries. **2 HIGH, 1 MEDIUM, 3 LOW.**

Holds (A): fetched math beyond the refused macros (array row gaps, macro-built
kerns, `\!` runs) never covers host text in Chrome; KaTeX trust is off
(`\href`, `\includegraphics`, `\html*` untrusted); round 16's same-URL memo;
the allowlist structure; 15 common include shapes accepted. Holds (B): the
dispatcher break memo — **0 differences against a no-memo build over 600,000
fuzzed documents**, and no parse change against 1.6.3 over 60,000; dedent of
bodies opened on their own line; the emoji span (heading ids unchanged, copy
restores the directive everywhere); TOC copy in 15 shapes; destinations;
`::: cols` tracks; 18,000 copy round trips (3,000 with a byte-exact oracle for
islands, mermaid and canvases) with 0 failures; ~20 real Chrome gestures;
render/copy linear in Chrome; M.14; C.20; M.1; M.6; M.17; R.4/R.6/R.7; the
773-file corpus matches the CHANGELOG list apart from L1.

| Finding | Sev | Disposition |
|---|---|---|
| A-H1 the round-16 memo was keyed by include chain: N different wrapper URLs around one large refused body prepared it N times, uncharged (160 × 400 KB: 38 s) | HIGH | **fixed structurally** — a work budget: every fetched body resolved or prepared, refused ones included, is charged against 4 × `maxSize`; past it, directives stay. Prepared bodies are also keyed by the resolved text. M.18 (2 probes) |
| B-H1 `Math.min(...indents)` (round 16) overflowed the stack on large directive bodies: md.render, extractDocMeta and prepareSources threw on 0.5 MB valid documents; the same pattern in the include splice and (pre-existing) nyml_parser | HIGH | fixed — loops instead of argument spreads in all three; M.5/M.9 probes (mermaid/yaml/nyml bodies, a 60,000-paragraph include) |
| B-M1 round 16's dedent broke yaml bodies that start on the opener line (`{{yaml server:` + children lost their nesting) | MED | fixed — dedent only bodies that start on the line after the opener; M.19 |
| B-L1 the katex pin (0.16.35) was a downgrade from what 1.6.3 installs resolved (0.16.47) and undocumented | LOW | fixed — pinned to 0.16.47 (the newest 0.16.x; 0.17+ would not satisfy the plugin's `^0.16.0`), site links and example pages updated, CHANGELOG line |
| B-L2 readable destinations could carry invisible/bidi characters | LOW | fixed — format characters and C1 controls stay encoded |
| B-L3 the dedent counted characters, not columns | LOW | fixed — no dedent when tabs and spaces are mixed |

### After round 17

914 tests green twice. Downstream: orz-paged 133/133 (41/41 nyml blocks equal
to 1.6.3), orz-slides 55/55.

---

## Round 18 — 2026-10-02

Two parallel adversaries. **7 HIGH, 5 MEDIUM, 9 LOW.** Three HIGHs were
regressions from this session's own fixes; four were pre-existing (also in
1.6.3, three of them in upstream plugins) — resource bounds a server
renderer needs.

Holds (A): no stack overflow at 20,000 nesting levels in md.render, the
scanners, extractDocMeta, the allowlist walk, parseHost or the copy walker;
no argument spreads left in src; whole-document checks bounded under refusal;
the M.16 allowlist re-read with nothing new through; M.12/M.13/M.19. Holds
(B): the 773-file corpus matches the CHANGELOG list exactly after the
documented changes; 7,000 dedent round trips; 20,000 nyml-parser bodies vs
1.6.3; 5,000 LF/CRLF/CR/BOM meta blocks; 330 random real-mouse drags with 0
text mismatches; 585 whole-document Chrome copies; 20,000 API calls without a
throw; M.8 (enhance twice, copy byte-exact); M.14; M.17; C.20.

| Finding | Sev | Disposition |
|---|---|---|
| A-H1 prepareSources quadratic on non-URL include directives (the locate regex searched on through the document per token) — a regression | HIGH | fixed — matched on the directive's own line only; M.18 |
| A-H2 extractDocMeta quadratic through glued followers with unclosed args (unbounded `]` search) — a regression | HIGH | fixed — args end on their line; M.5 |
| A-H3 the round-17 include splice copied the token tail per include — a regression | HIGH | fixed — one pass into a new token array; M.9 |
| A-H4 `{{toc}}` output grows as TOCs × headings (2,000 × 2,000: 219 MB; more: V8 heap OOM) — pre-existing | HIGH | fixed — 20,000 TOC entries per render, then a TOC renders empty (breadcrumb kept); R.7 |
| A-H5 `{{qr}}` output ~1,100× its content (1 MB of codes: `Invalid string length`) — pre-existing | HIGH | fixed — 8 MB of QR SVG per render, then codes render as text (per-render counter reset with the nyml counter); R.7 |
| A-H6 footnotes quadratic — markdown-it-footnote's tail rule rebuilds the token array per footnote (also upstream) | HIGH | fixed — the rule ported with in-place pushes (MIT, attributed); **output identical to the plugin on 2,000 differential documents**; 10,000 footnotes 3.7 s → 108 ms; M.5 |
| B-H1 many headings with one title quadratic — markdown-it-anchor tries base-1, base-2, … from 1 per duplicate (also 1.6.3) | HIGH | fixed — `slugifyWithState` returns the first free base-k from a per-render "next k", the same id anchor would pick (ids checked); M.5 |
| A-M1 `{{attrs}}` quadratic (splice per marker, attrSet walk per key) | MED | fixed — one pass per inline token, attributes merged in a map |
| B-M1 bodies ending in `}` did not copy back (`{{qr {"a":1} }}`, `{{sp …}}`, smiles, youtube) — pre-existing | MED | fixed — breadcrumbs close with ` }}` after a trailing `}`; C.11 |
| B-M2 the KaTeX pin missed SKILL.md, syntax.md, docs/sw.js (offline editor had no KaTeX CSS) and scripts/render.ts | MED | fixed — all updated (render.ts uses `KATEX_VERSION`), sw CACHE bumped to v14, and a test now fails if any shipped page or doc names another KaTeX version |
| B-M3 the copy runtime's private-use sentinels (U+E000–E003) leaked into code, math, breadcrumbs and destinations | MED | fixed — noncharacters (U+FDD0–FDD3); C.8 |
| B-M4 "a selection covering a whole code block copies that block" was false | MED | fixed and reworded — a selection that takes a block element itself (select-all, a drag from before it, a range around it) copies the whole block (code fenced, heading with `#`, item with marker); a text-only selection inside code still copies verbatim (round 4's decision); C.15 (Chrome, mutation-checked) |
| A-L1 deep raw nesting made a copy expensive | LOW | fixed — fetched raw HTML deeper than 32 elements is refused |
| A-L2 `\ce{` with 20,000 nested parens | LOW | dismissed — inside mhchem, also 1.6.3; bounded by maxSize for includes |
| A-L3 family globals (`orzPosterReadiness`, …) not reserved | LOW | fixed — any id starting `orz` is reserved |
| B-L1 more format characters decoded into destinations | LOW | fixed — soft hyphen, bidi marks, Mongolian separator, CGJ, interlinear annotations, private use, noncharacters, tag characters stay encoded |
| B-L2 an included file's BOM hid its first line | LOW | fixed |
| B-L3 copy moves footnote definitions to the end (numbering/looseness edge cases) | LOW | dismissed — definitions are normalized to the end by design; the cases need definitions containing references before the text |
| B-L4 a tab-indented multi-line inline `{{qr}}` in a list | LOW | dismissed — contrived; tab stops shift under the list prefix |
| B-L5 CHANGELOG dedent wording | LOW | fixed |
| B-L6 a trailing newline in a copied display-math annotation | LOW | dismissed — the rendered math is unchanged |

### After round 18

931 tests green twice. Downstream: orz-paged 133/133 (41/41 nyml blocks equal
to 1.6.3), orz-slides 55/55.

---

## Round 19 — 2026-10-02

Two parallel adversaries. **10 HIGH, 3 MEDIUM, 8 LOW.** The HIGHs split into
include isolation and our own bounds (5) and **upstream complexity**
(task lists, KaTeX, reference expansion, anchor's per-heading `indexOf`,
`parseDocMetaIsland`'s backtracking regex — most also in 1.6.3).

Holds (A): footnote-tail port linear; the slug function linear and anchor-
identical; attrs, containers, sub/sup/mark/ins, emoji, chart, mermaid,
smiles, linkify, tables, yaml, nyml ≤ 6.8× for 4×; copy event ≤ 5.1× on 15
shapes; same-URL memo; 54/65 common includes accepted; M.13; M.12; M.19; R.7.
Holds (B): heading ids equal to 1.6.3 on the corpus and on 20,000 fuzzed
duplicate patterns; **footnote port byte-identical to markdown-it-footnote on
30,000 documents**; attrs equal to 1.6.3 on 20,000; caps change nothing
below them; C.15 whole-block rule — 0 text mismatches over 900 gestures and
4,000 boundary ranges; 2,400 copy round trips; M.14; C.20; M.17 with a head.

| Finding | Sev | Disposition |
|---|---|---|
| A-H1 a fetched spoil label or `{{sp}}` body with `^[…]` emitted its own footnote list (`fn1` hijacked) — a plain-render bug too | HIGH | fixed — inline renders inside a document get an env with footnotes off (and shared counters: `src/env.ts`); the include walk parses them the same way |
| A-H2 the round-18 caps let an include change host output (host QR → text, host TOC emptied) | HIGH | fixed — an include that makes the document cross a cap the host alone stays under is refused |
| A-H3 the QR cap restarted inside spoil labels (364 MB) | HIGH | fixed — counters live on the document env (`__orzRoot`) |
| A-H4 the TOC cap counted entries, not bytes | HIGH | fixed — 8 MB of TOC per render as well |
| A-H5 task lists quadratic (markdown-it-task-lists' backward `parentToken` per item; upstream, 1.6.3) | HIGH | fixed — the rule ported in one pass, identical output |
| A-H6 KaTeX quadratic on long formulas; `\def` chains unbounded by `maxExpand` (4 KB: 267 s) | HIGH | fixed — formulas over 10,000 characters, or defining macros, render as their source (an error span). **Owner-visible:** `\newcommand`/`\def` in math are no longer supported |
| A-H7 reference-link expansion amplifies output (401 MB from 250 KB; upstream markdown-it) | HIGH | fixed — link/image targets total at most 4× source + 1 MB per render |
| A-H8 file includes unbounded (a self-including file ran V8 out of heap) | HIGH | fixed — 5,000,000 characters of includes per render |
| A-M1 one conflicting chapter made group testing drop good ones; whole-document checks uncharged | MED | fixed — footnote-label conflicts refused per include before group testing; checks charged to the work budget |
| A-M2 an include whose heading matches a later host heading is refused | MED | **open by choice** — giving included headings separate ids needs anchor to see them before it numbers the host's; recorded as a known false refusal |
| A-L old README markup (`border`, `clear`, `strike`, `tt`, `big`) | LOW | fixed |
| A-L KaTeX console line per `\\` | LOW | fixed (`strict: 'ignore'`) |
| B-H1 headings quadratic even with distinct titles (anchor's `tokens.indexOf(heading)` per heading; upstream, 1.6.3) | HIGH | fixed — anchor's core rule ported (no permalink/callback), same ids and attribute order |
| B-H2 `parseDocMetaIsland` quadratic (backtracking from every `<script`; 1.6.3 too) | HIGH | fixed — an `indexOf` walk |
| B-M1 an `{{attrs}}` id could duplicate an automatic id | MED | fixed — attrs ids are reserved before the first automatic slug. A heading with its own attrs id still spends its automatic slug, as in 1.6.3, so existing `-1` links hold |
| B-L1 noncharacters did not round-trip after the sentinel change | LOW | fixed (lookahead; TeX annotations sanitized) |
| B-L2 M.17 without a head read a body island | LOW | fixed — without a head, only an island the document starts with counts |
| B-L3 R.6 wording | LOW | reworded |
| B-L4 CHANGELOG TOC-cap and whole-code-block wording | LOW | fixed |
| B-L5 a reused env leaked footnotes into the next document | LOW | fixed — `env.footnotes` reset per render |
| B-L6 `^[^n]` swallowing a reference | LOW | dismissed (contrived; round-18 B-L3 class) |

### After round 19

948 tests green twice. Downstream: orz-paged 133/133, orz-slides 55/55.
Heading ids equal to 1.6.3 on 541/542 family `.md` files (the one difference
is the documented `section` id).

### The upstream-amplification class

Rounds 16–19 found mostly constructs in markdown-it and its plugins that turn
small input into large time or output. Each is now bounded, but the class has
no natural end; the owner was asked whether to close the loop on it with a
documented host envelope (input-size cap + worker timeout) instead.

---

## Round 20 — 2026-10-02

Two parallel adversaries, findings classed ORZ / ISOLATION / UPSTREAM-AMP.
**6 HIGH (2 ISOLATION, 3 ORZ, 1 UPSTREAM-AMP), 7 MEDIUM, 6 LOW.** Every
non-upstream HIGH was a hole in round-19 code.

Holds (A): no other way to define or expand macros past the guard; env.ts
sharing; M.12 (symlinks, `..`, NUL); M.13; M.15 (redirect loops, `data:`,
hanging and dribbling servers); M.7; M.19; R.7 injections; 35/37 common
README includes; fetched wide layout never covers host text; work budget.
Holds (B): **0 differences against 1.6.3 on 80,000 fuzzed documents** for
heading ids and task lists (apart from documented breadcrumbs and M1);
26,000 copy round trips; ~330 real Chrome gestures; linearity of every
round-19 shape (≤ 5.7×); M.1–M.4/M.6/M.14/C.20; parseDocMetaIsland equal to
1.6.3 on the 12 real carrier files.

| Finding | Class | Sev | Disposition |
|---|---|---|---|
| A-H1 fetched math with `\!` / `\neg…space` painted over host floats and sidebars | ISOLATION | HIGH | fixed — added to the refused macros; M.16 |
| A-H2 cap-crossing estimates missed QR minimum size, QR in labels/spans, CJK anchor length | ISOLATION | HIGH | fixed — ≥ 35 KB per code, labels and span bodies scanned, heading ids counted; math totals too |
| A-H3 links inside footnotes bypassed the link budget (it ran before footnote_tail) | ORZ | HIGH | fixed — runs after footnote_tail; base includes included text (A-M3 / B-M2) |
| A-H4 the include budget was checked after reading; no per-path memo (13.6 GB read) | ORZ | HIGH | fixed — checked before reading; each path read once per render |
| A-H5 `\ce` expands ~500× (1 MB: 227 s, 507 MB) | UPSTREAM-AMP | HIGH | bounded — 1,000,000 TeX characters per document, 50,000 inside `\ce`/`\pu`; cap-crossing check for includes |
| B-H1 parseDocMetaIsland still quadratic (rescanned from every opener) | ORZ | HIGH | fixed — the scan continues from the tag end |
| A-M1 reference-definition conflicts made group testing drop good includes | ORZ | MED | fixed — refused per include first |
| A-M2 the TOC estimate counted all inline text | ORZ | MED | fixed — heading text only |
| A-M4 the default fetcher read unbounded bodies | ORZ | MED | fixed — streamed, abandoned past 4 × maxSize |
| B-M1 the round-19 reservation renumbered headings vs 1.6.3 (`foo,foo-2`) | ORZ | MED | fixed — a heading's own attrs id does not block its automatic slug; 1.6.3 numbering kept |
| B-M3 guarded math (`katex-error`) not atomic in copy | ORZ | MED | fixed |
| A-L youtube `..` | ORZ | LOW | fixed — ids must be `[A-Za-z0-9_-]` |
| B-L1 noncharacters in guarded math copy | ORZ | LOW | fixed |
| B-L2/L3 CHANGELOG and syntax.md wording | ORZ | LOW | fixed (heading-id change listed; math limits documented for authors) |
| B-L4 a reused env leaked `env.references` | UPSTREAM | LOW | fixed — reset per render |
| B-L5 a partial copy citing `[^n]` leaves its definition behind | ORZ | LOW | dismissed — a partial selection copies what is selected |

### After round 20

964 tests green twice. Downstream: orz-paged 133/133, orz-slides 55/55;
heading ids equal to 1.6.3 on 541/542 family files (the documented `section`).

---

## Round 21 — 2026-10-02

Two parallel adversaries. **8 HIGH (4 ISOLATION, 3 ORZ, 1 UPSTREAM-AMP), 5
MEDIUM, 6 LOW.** Four of half A's HIGHs and half B's HIGH were holes in
round-20 code. The structural change: per-render budgets and math covering
are now **measured** (each fetched body rendered alone once, its counters and
KaTeX output read) instead of estimated from source.

Holds (B): no automatic id duplicates an attrs id (60,000 fuzzed documents);
heading ids equal to 1.6.3 on 772/773 family files; katex-error atomic in
real Chrome (~75 gestures); ~4,200 copy round trips; M.1–M.4/M.6/M.10/M.17;
no TeX/link budget false positive on the corpus; no memory leak over 3,000
renders.

| Finding | Class | Sev | Disposition |
|---|---|---|---|
| A-H1 cap-crossing estimate ignored math in spoil labels and `{{sp}}` bodies | ISOLATION | HIGH | fixed — budgets measured by rendering each body (and the host) alone; M.16 |
| A-H2 QR scan missed `{{qr[a] …}}` and bodies holding `}` | ISOLATION | HIGH | fixed — same (measured QR output); the regex is gone |
| A-H3 QR estimate ~3× low for CJK | ISOLATION | HIGH | fixed — same |
| A-H4 negative-space refusal bypassed by KaTeX's loose size parsing (`\kern{0-9em}`, `\tmspace-`, `{{-9em}}`, `%`) | ISOLATION | HIGH | fixed — judged on KaTeX output: typed spacing commands whose negative kerns sum ≥ 1em per body; laps/smash/vertical moves checked on each formula's annotation (labels and spans included). Chrome oracle +4 cases |
| A-H5 file-include memo keyed by spelling; refused bodies kept (1,024 case variants: OOM) | ORZ | HIGH | fixed — keyed by real path, every read charged to a 2×5M per-render read budget, refused bodies not kept; M.9 |
| A-H6 size-refused fetches not charged, kept cached (300 URLs: OOM) | ORZ | HIGH | fixed — charged before the size check, cache entry nulled, nothing fetched once work is spent, default fetcher limit follows remaining work; M.18 |
| A-H7 KaTeX arrays: 1 MB → 204 MB in 52 s | UPSTREAM-AMP | HIGH | bounded — 64 MB of KaTeX output per render (5,000 textbook display formulas ≈ 45 MB fit) |
| B-H1 own-id headings quadratic again (16,000: 75 s) | ORZ | HIGH | fixed — own-id headings use their own "next k" over assigned slugs; both counters monotone; R.6 |
| A-M1 a fetched `[^b]` citing a host label renumbered the host's notes | ISOLATION | MED | fixed — citations (also as text, undefined in the body) of host labels refuse the include. Renumbering by an included inline `^[…]` note is document order, kept |
| A-M2 automatic heading ids (`## Chart`, `# orz family`) hit the reserved-id list (121 false refusals) | ORZ | MED | fixed — automatic ids are checked only against render-time ids and lowercase page globals (`fn1`, `hljs`, `mermaid`, `orz…` identifiers); authored ids keep the full list |
| B-M1 ids differ from 1.6.3: (a) own-id headings respected reservations, (b) hidden/overridden attrs ids reserved | ORZ | MED | fixed — only written ids reserve (last id of a block's markers, not on a hidden paragraph); 0 differences in the auditor's fuzz |
| B-M2 `{{youtube ID?t=42}}` rendered nothing (1.6.3 embedded it) | ORZ | MED | fixed — `t=`/`start=` → `?start=N`; a body that is no id renders as its directive text with `data-md` |
| B-M3 resetting `env.references` dropped references a host seeds | ORZ | MED | fixed — seeded keys survive, keys a previous render defined go |
| A-L TOC byte cap counted unescaped text | ORZ | LOW | fixed |
| A-L QR-count regex quadratic in unclosed openers | ORZ | LOW | fixed — regex removed (measurement) |
| B-L1 chem budget charged whole formulas | ORZ | LOW | fixed — only `\ce{…}`/`\pu{…}` argument lengths, budget 100,000 (mhchem measured linear, ~50–80 ms/KB); per-document limits documented in syntax.md |
| B-L2 a linkified URL with CJK and `$` copied into math | UPSTREAM-AMP | LOW | fixed — label `$` always escaped when the href holds one |
| B-L3 copy orders footnote definitions by first reference (nested inline notes renumber; an unreferenced definition's nested note is dropped) | ORZ | LOW | dismissed — source order is not in the DOM; the list copies as rendered, and an unreferenced definition is not shown |
| B-L4 inline math across a soft break loses a trailing TeX space on copy | UPSTREAM | LOW | dismissed — the drawn formula is identical |
| B design note: themes define generic `:root` tokens (`--bg`, `--accent`) | — | — | open — not reproduced in a carrier; a token rename is an FC-05 change for the owner |

Also: round-20's single `\negthinspace x` probes became sums past 1em — a
single `\!` (`\operatorname{softmax}\!\left(`) refused 8 family decks since
round 20; the corpus now has 0 math refusals (513/541 files accepted as
includes; the rest are raw HTML, undocumented containers or poster
directives, by the allowlist).

### After round 21

1,000 tests green twice. Downstream: orz-paged 133/133, orz-slides 55/55;
heading ids equal to 1.6.3 on 540/541 family files (the documented `section`).

---

## Owner decisions — 2026-10-02

1. **Raw HTML in fetched includes: strict allowlist, harmful parts ignored.**
   The allowlist (simple layout and text elements, no `class`/`style`, no
   handlers) stays as it is. What changed is what happens to markup outside it:
   instead of refusing the whole include, the block holding it is removed — an
   HTML block, or the paragraph / heading / table row / `::: spoil` container
   holding refused inline HTML — and the reduced body is prepared and checked
   again from the start (neutralization, fence closing, allowlist, measured
   budgets, the M.16 host comparison). Removing lines can only take content
   away; nothing is trusted that was not re-checked. New claim M.20. Other
   refusals (undocumented containers or span classes, covering math, attrs
   outside the attribute allowlist) still leave the directive. An include
   that is empty after removal is treated like an empty file (directive kept).
2. **CJK written directly onto a URL path stays part of the link** (current
   behaviour, R.3; asked "what do you suggest?" — recommended and adopted).
   Reasons: real CJK paths (`/wiki/化学`, Baidu Baike) are common and cutting
   them breaks links silently, while a glued link is visible and fixed by a
   space or `<url>`; GFM's extended autolinks also run to whitespace; CJK
   punctuation and a CJK run after a host already end the link.
3. **Stop rule.** The loop closes after a round with no HIGH finding classed
   ORZ or ISOLATION. An UPSTREAM-AMP finding (markdown-it, KaTeX, mhchem or
   another plugin turning small input into large time or output) gets one
   simple, generous per-construct limit when found, and is otherwise covered by
   the documented host envelope (cap the input size, render in a worker with a
   timeout — README "Security notes"); it does not keep the loop open.

### Before round 22

The M.20 change, tests/audit-round22.test.ts. Two round-16/17 cost probes
used a `<script>` block only to get an include refused; they now use an
undocumented container (still refused), keeping what they measure. 1,023
tests green.

---

## Round 22 — 2026-10-02

Two parallel adversaries (A: isolation, aimed at the new M.20 removal path;
B: correctness, compatibility, corpus). **1 HIGH (ISOLATION, in round-22
code), 2 MEDIUM, 9 LOW.**

Holds (A): the reduced body is re-prepared and re-checked in full, so removal
gives nothing that writing the reduced text directly would not (apart from
H1); lazy continuations, lost list markers, setext/header drops, `{{attrs}}`
moving blocks — all re-checked; local-include spellings split across removed
lines stay neutralized; the `htmlRefused` flag cannot be made stale; inline
`^[<script>]` notes (no map) refuse; M.12, M.15, round-21 math fixes; M.18
cost with 32k dropped blocks / 4k directives / 90 nested spoils linear.
Holds (B): 0 heading-id and task-list differences vs 1.6.3 on 80,000 fuzzed
documents, 574/575 family files equal (the documented `section`); 5,000 copy
round trips; 20 youtube shapes; 30,000 fuzzed R.3 URLs (CJK on a path stays,
punctuation cuts, host cuts); linearity 2.7–4.8× at 4× input for M.20, M.18,
R.6, M.5.

**Corpus with M.20:** 516/531 family files accepted as includes (round 21:
513/541 on a smaller set). The 15 refused all use classes or undocumented
containers (`{{attrs[.class]}}` ×11, `{{span[cv-chip]}}`, `::: page-break` ×3)
— the allowlist, no math/budget/host refusals. M.20 removed something in 5
accepted files (an `onclick` button, a `<section>`/`<aside class>` paragraph,
a bullet with `<my own materials/>`, two frontmatter setext headings with
`<slug>`).

| Finding | Class | Sev | Disposition |
|---|---|---|---|
| A-H1 removing an auto-closed `::: spoil` also removed the next line; if that opened a fence, an inert `kind: meta` nyml block became live and the include's metadata the host's | ISOLATION | HIGH | fixed — the closing-marker line is removed only when it is one (`:::`); the reduced body has its metadata block extracted again |
| A-L1 same off-by-one dropped real content after an auto-closed spoil in a list item | ORZ | LOW | fixed (same) |
| A-L2 a block holding refused HTML and covering math: drop vs refuse depended on order | ORZ | LOW | fixed by definition — a block holding refused HTML is removed whole, whatever else it holds (M.20 wording); the covering math goes with it |
| A-L3 / B-L6 M.20's last sentence contradicted the code | ORZ | LOW | fixed — reworded |
| B-M1 `请访问www.baidu.com获取` linked nothing: markdown-it's core rule calls `linkify.test()`, which was not narrowed | ORZ | MED | fixed — `test` wrapped (re-entrancy guarded: linkify-it's `match` calls `this.test`); R.3 |
| B-M2 a dropped setext heading left its underline (`<hr>`, `===`, or the previous paragraph promoted to `<h2>`); 2 coursewerk files | ORZ | MED | fixed — the enclosing block's lines, not the inline map |
| B-L1 refused HTML in a table header row left the rest as a paragraph | ORZ | LOW | fixed — a header row drops the whole table |
| B-L2 dropping a footnote definition's paragraph leaves `[^n]` literal; dropping an item's first block moves its continuation | ORZ | LOW | dismissed — the removed block is gone and the rest is re-checked; reshaping the fetched document's own structure around a removed block is what "ignore" means, the host is unaffected |
| B-L3 copy of `` www.example.com` `` / `_` escapes it, and the re-render links the host | ORZ | LOW | dismissed for now — needs the copy escaper to model linkify's fuzzy host end; noise-level, the round trip of normal text holds |
| B-L4 references a host adds to a reused env between renders were deleted | ORZ | LOW | fixed — each render records the keys it added; the next deletes only those |
| B-L5 `——` / `……` after a URL stayed in the link | ORZ | LOW | fixed — a doubled dash or ellipsis is a boundary; R.3 |
| B frontmatter `---` before a dropped setext heading renders an `<hr>` | — | — | dismissed — a leading `---` is a thematic break in Markdown; orz does not read YAML front matter |

### After round 22

1,037 tests green. Downstream against this checkout (its new
`markdown-it-cjk-breaks` dependency linked): orz-paged 133/133, orz-slides
55/55. Stop rule: A-H1 is ISOLATION → round 23.

---

## Round 23 — 2026-10-02

Two parallel adversaries. **3 HIGH (ISOLATION, all in the M.16 host
comparison, none in round-22 code), 1 MEDIUM, 4 LOW**, plus one older false
refusal found while writing the probes.

Holds (A): round-22 spoil-closer and enclosing-block changes in tabs/cols/
quotes/lists; everything the prepare step returns comes from the reduced body;
neutralization of split local-include spellings; the linkify `test` wrapper
linear (2–4× markdown-it) with no state leak; spoil labels and span bodies
cannot resolve an include's references. Holds (B): 20,000 ASCII documents link
as 1.6.3 (0 differences); 20,000 spaced-URL CJK documents as plain
markdown-it; 29,438 R.3 oracle cases; linearity of 19 linkify shapes
(×2.3–4.7 at 4× input); env.references across re-seeding, deletion, shared
objects; corpus 526/541 accepted, every M.20 removal exactly the harmful block;
heading ids differ from 1.6.3 in 1 file (the documented `section`).

| Finding | Class | Sev | Disposition |
|---|---|---|---|
| A-F1 an include's reference definitions linked text in a HOST footnote (the footnote section was skipped by the comparison) | ISOLATION | HIGH | fixed — every host footnote body is compared, keyed by label (inline notes by their text), numbering left out |
| A-F2 an include spent the shared link budget host footnote links needed (`href=""`) | ISOLATION | HIGH | fixed — same comparison |
| A-F3 the host's own `{{md ./file}}` content was invisible to the check (a fetched include took its heading id, linked its text, replaced its footnote) | ISOLATION | HIGH | fixed — a document with a live file include keeps its URL directives unless `prepareSources` gets `includeEnv` (the render's file settings); then the check parses with them. FC-07 updated |
| A-F4 removing a spoil auto-closed in a quote took the OUTER container's `:::` | ORZ | LOW | fixed — a closer counts only at the opener's column and quote depth, with at least as many colons |
| A-F5 a reference the host REPLACED in a reused env was deleted | ORZ | LOW | fixed — deleted only while it still holds the value the render set |
| (probe) an include with an inline note `^[…]` was refused when the host had one: both recorded the missing label as `''` | ORZ | MED | fixed — labelless notes are not labels |
| B-M1 `访问 github.com获取` linked nothing: markdown-it's `linkify.pretest` gated the block before the narrowed `test` | ORZ | MED | fixed — `pretest` wrapped (non-ASCII text with `.` or `@` goes on to `test`) |
| B-L1 `请访问ｗｗｗ.baidu.com` linked the prose into a punycoded host (also 1.6.3) | ORZ | LOW | fixed — Han/kana/hangul running into full-width Latin links nothing |
| B-L2 headings holding a glued URL then inline markup get new ids vs 1.6.3 | ORZ | LOW | documented in CHANGELOG |

### After round 23

1,053 tests green. Downstream: orz-paged 133/133, orz-slides 55/55. Stop
rule: three ISOLATION HIGHs → round 24.

---

## Round 24 — 2026-10-02

Two parallel adversaries. Half A: **2 HIGH, 2 MEDIUM, all ISOLATION.**

Holds (A): `hasLocalInclude` agrees with the renderer on live file includes
(aliases, nesting in lists/quotes/containers/footnote definitions, escaped and
inline inert); fetched local-include spellings neutralized at every depth, none
read with `includeEnv`; footnote-body comparison cannot be hidden by repeated
inline-note text; labels compared exactly as markdown-it-footnote; measured
budgets monotone; `{{attrs}}` never crosses the include boundary; nyml numbers
in the signature.

| Finding | Class | Sev | Disposition |
|---|---|---|---|
| A-H1 `{{md\n{{nyml kind: meta…` — metadata extracted before neutralizing local includes; neutralizing made the block live and the include set the document's title/author/license | ISOLATION | HIGH | fixed — neutralize first, then extract (also after M.20 removal) |
| A-H2 host text after a mid-line directive moved to a line of its own and was parsed afresh — in the reference too, so the comparison could not see it (`# x` became a heading, a fence swallowed the host, `{{md ./file}}` and `{{toc}}` went live: bypassed the round-23 gate) | ISOLATION | HIGH | fixed — the include is resolved only when that tail, parsed alone, is one plain paragraph (or one HTML comment) without `{{attrs}}` |
| A-M1 a citation in image alt text (`![x [^b]](…)`) escaped the host-label cite check and renumbered a host note | ISOLATION | MED | fixed — inline tokens walked at every depth (cites, host labels, signature) |
| A-M2 the TOC-cap estimate skipped the check when the host's own over-estimate crossed; host TOCs rendered empty | ISOLATION | MED | fixed — every host TOC must keep at least the entries it has alone (resolved at parse time), measured not estimated |

Half B: **1 HIGH (ORZ, a round-14 regression vs 1.6.3), 1 MEDIUM, 6 LOW.**

Holds (B): the footnote comparison caused no new refusal on 19,476 corpus
host×body pairs (every extra refusal is the documented file-include gate on 2
hosts; with `includeEnv` they accept 194/200); 96–97% acceptance for hosts
without file includes; footnote comparison linear (×2.5–4.7); hasLocalInclude
has no false positive from code, escapes, comments, HTML or inline positions;
13,000 ASCII documents link as 1.6.3; heading ids and task lists as 1.6.3 on
20,000 fuzzed documents and the corpus (documented `section`); pretest cost
linear (worst 1.6 MB of `...` in ~1.2 s, 1–4.7× 1.6.3).

| Finding | Class | Sev | Disposition |
|---|---|---|---|
| B-F1 `ソニー.jp` linked `ー.jp` — `ー` (U+30FC) is Script=Common, so the katakana label was split as lead noise (since round 14) | ORZ | HIGH | fixed — `ー` and its half-width form count as CJK |
| B-F2 an include inside a host footnote definition was refused (the footnote comparison did not skip included regions) | ORZ | MED | fixed — skipped as in the body |
| B-F3 a `{{toc}}` in a host footnote refused includes that add headings | ORZ | LOW | fixed — TOC content blank in the note signature, as in the body |
| B-F4 `{{md}}`, `{{md ftp://…}}`, `{{md file:///…}}` counted as live file includes | ORZ | LOW | fixed — the renderer's test (non-empty target, no `scheme://`) |
| B-F5 `[^1]: {{md URL}}` moved the fetched text out of the footnote (pre-existing) | ORZ | LOW | fixed — a directive on a footnote definition's own line is kept |
| B-F6 a nyml block in a host footnote was renumbered by an include's | ISOLATION | LOW | fixed — nyml numbers in the note signature |
| B-F7 `東京２０２０.com` no longer linked (the round-23 rule caught full-width digits) | ORZ | LOW | fixed — the rule covers full-width letters only |
| B-F8 copying `see...github.com` gives `see…github.com`, which links on re-render (pre-existing, English too) | ORZ | LOW | dismissed — noise-level, same class as round-22 B-L3 |

### Paused after round 24 — 2026-10-02 (superseded below)

Paused by the owner after the round-24 fixes. The suite run in flight then
found two holes in the round-24 tail rule: quadratic cost with many
directives on one line (one M.18 probe ran 57 minutes) and a false refusal of
a tail starting with another URL directive — fixed: each directive checks its
tail only up to the next directive on the line.

---

## Closure — 2026-10-02 (owner decision)

**Trust model (M.21).** Includes are content from trusted sources, like a
`<script src>`. Outside a browser `prepareSources` fetches nothing unless
`allowedHosts` is non-empty or a `fetcher` is given; in a page the URL the
author writes is the trust decision. M.16/M.20 stay as defence in depth
against accidents and a compromised trusted host — not a sandbox for hostile
text. Findings that need a deliberately crafted include are out of the loop's
scope from here on (class HOSTILE), as UPSTREAM-AMP already was. Reason:
rounds 22–24 each found one more thing the host comparison did not see
(footnote section, the host's file includes, mid-line tails, TOCs); that list
has no visible end, and a secure default closes the exposure instead.

**Final narrow check** (one independent reviewer, the round-24 fixes and M.21
only): no HIGH, no HOSTILE item needed.

| Finding | Class | Sev | Disposition |
|---|---|---|---|
| F1 a mid-line include on a nested paragraph's lazy continuation line (`[^1]: a` / `continues {{md URL}} …`, same after `- item`, `> quote`) moved the fetched and the host text out of the container | ORZ | MED | fixed — such a directive (no container prefix, or fewer `>` than the paragraph's first line) is not split |
| F2 a directive kept right after a spliced one on the same line started a line and rendered nothing | ORZ | LOW | fixed — then the whole rest of the line must be a plain tail, or the earlier one stays too (back to front). The round-1 SSRF probe's one-line form now keeps both directives; the two-line form resolves as before |
| F3 `サーバーｗｗｗ.example.com` linked a punycoded host (`ー` missing from the full-width rule) | ORZ | LOW | fixed |
| `~~baidu.com` → `http://~~…` | UPSTREAM | — | recorded (linkify-it; 1.6.3 too) |
| deeply nested images cost ~700 ms per 50 paragraphs at depth 100 | UPSTREAM-AMP | — | recorded; prepareSources stays linear |

Holds: 31 ordinary tails accepted (the only tail refusals are `{{attrs}}` and
text that would become a list or quote); M.18 linear in every directive
layout (×3.0–4.5 at 4×); metadata dropped in every combination; TOC and
footnote comparisons cause no refusal on the corpus; hasLocalInclude matches
the renderer; `ー` changes nothing in emphasis or line breaks over 289,000
Japanese strings; only Alembic calls `prepareSources` and passes both
`allowedHosts` and a `fetcher` (M.21 changes nothing for it). Corpus
acceptance for hosts without file includes: 98.4% at the end, 91.4% at a
random block boundary (every refusal caused by the body).

**Verification at closure.** 1,149 tests green; `dist/` rebuilt; orz-paged
133/133 and orz-slides 55/55 against this checkout (its new
`markdown-it-cjk-breaks` dependency linked — consumer lockfiles need it on
upgrade).

**Status: closed.** Open by choice: round-21 A-M2 class (an include heading
matching a later host heading is refused), round-22 B-L2 (removing a block
reshapes the fetched document around it), B-L3/F8 (copy of a host followed by
`` ` `` / `...` can link on re-render), the theme `:root` token note (FC-05).

---

The carrier-kit verification (carrier rebuild, from 2026-10-05) has its own
record: [carrier-kit-loop.md](carrier-kit-loop.md).

## D-127 adversary round 1 (2026-10-31): raw-HTML allowlist (M.45)

Independent attack on `orzRawHtml: 'allowlist'` (f4c4c28). **HIGH:** `<a href="&#106avascript&#58alert(1)">` kept — numeric
references without `;` are decoded by browsers in attributes but not by markdown-it's `unescapeAll`; the same hole was in the
fetched-text URL check (M.16, published 2.5.0). Fixed in both with `decodeNumericRefs`; probes added (raw-html.test.ts,
audit-round12). **MEDIUM:** reserved ids by reference (`id="&#102;n1"`) — `idKey` decodes them now. **LOW:** `rel="opener"` /
named targets refused. Dismissed as accepted limits (recorded in M.45): a `style` overlay (author's layout, by design), the fixed
YouTube embed (orz's own construct), markdown-it's quadratic inline-comment scan (upstream, same with the setting off).
Tried and held: ~40 other vectors (tag syntax, comments, CDATA, `<input>`, attrs, every plugin and container, yaml/nyml islands,
KaTeX `\href`, nested renders, regex cost).

