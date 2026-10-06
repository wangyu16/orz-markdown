# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Carrier kit core (text format 1, FC-18)** in `orz-markdown/carrier`
  (`src/carrier/`):
  - header: `readHeader`, `setHeaderValue`, `removeHeaderKey` (in-place,
    one-line edits; legacy `kind: meta` headers upgraded on the first edit),
    `lintHeader`, and the key registry (`COMMON_HEADER_KEYS`,
    `KIND_HEADER_KEYS`, `WRITER_KEY`, `UID_PATTERN`);
  - document: `readDocument` (kind, format, DocMeta with `uid`, theme, lang,
    settings, host keys, derived title, lint), `kindFromFilename`, `twinName`,
    `mintUid`;
  - links: `twinHref`, `registerTwinLinks` — relative links to text twins
    render as links to the assembled twin when `env.orzTwinLinks === true`;
  - envelope: `assembleEnvelope`, `extract`, `readIslandFromDom`, `skillUrl`,
    `eolStyle`, `hasMixedEol`, `hasLoneSurrogate`, and the island ids. The
    source island stores the text with LF line breaks and records
    `data-orz-eol` / `data-orz-bom`, so a DOM read is exact too.
  - `editHeader` (several sets, removes and `key: |` multi-line values in one
    pass), `Header.entries` (per-key positions) and `line`/`from`/`to` on
    lint findings; new lint codes (`closer-in-value` for a header cut inside a
    value, `closer-not-alone`, `opener-not-alone`, `stray-document-block`,
    `front-matter`, `bad-lang`, `bad-measure`, `bad-ratio`, `nul`,
    `lone-surrogate`, `mixed-eol`);
  - `decodeText` (UTF-8 bytes → text, keeping the BOM that `File.text()`
    strips); `extract` returns `includes`; `ShellParts.delivery` is optional
    (default `inline`); `readDocument` resolves `measure`/`ratio` defaults.
  - `withoutHeader` (the body a carrier renders, with its offset);
    `decodeText(bytes, { fatal })`; lint codes `ignored-line` and `kind-case`;
    `extract` reads a file whose line endings were converted to CR LF.
  - `orz-markdown/carrier/read`: the parser-free reading entry (`extract`,
    `readIslandFromDom`, `decodeText`, the escape helpers; under 30 KB
    minified). `DocMeta`/`DocLicense` types re-exported from the carrier.
  - The kit parses with a private markdown-it instance configured like `md`,
    so a host's `md.set()`/`md.use()` cannot change assembled bytes.
  - `orz-markdown/carrier` now loads the parser (`md`) as well, and importing
    it registers the twin-link core rule on the shared `md` (inert unless a
    render's env sets `orzTwinLinks: true`).
- `docMetaFromFields` (DocMeta from a flat nyml field map; values trimmed,
  empty ones omitted), exported from the main entry and `orz-markdown/doc-meta`.
- `createMarkdown()`: builds a markdown-it instance with the shared `md`'s
  configuration (the `{{name}}` plugin registry stays global).
- `scanNymlBlocks(source, tokens?)` accepts the tokens of a parse the caller
  already has.
- `spec/`: the binding carrier specifications FC-18 (text form and assembly,
  format 1) and FC-19 (editor component API).
- **Shell runtime** `orz-markdown/carrier/shell` (`src/carrier/shell/`): the
  browser runtime every assembled file shares (parser-free, safe to import in
  Node):
  - `createSaver({ uid, suggestedName, kind, host })` — save in the order
    connected host → served-page notice → File System Access (handle
    remembered in IndexedDB `orz-carrier` under the header `uid`, else the
    page URL; a second save overwrites without a prompt; a copy with another
    file name does not reuse the original's handle) → download. It saves
    the HTML the caller assembled and never serializes the live DOM. A
    cancelled picker reports `cancelled` without a download.
  - `createPreferenceStore(uid, storage)` — typed, validated reader
    preferences (`splitRatio`, `scrollSync`, `viewMode`, `editorFontSize`,
    `darkChrome`), namespaced by `uid`, failing closed to defaults.
  - `connectHost` (file side) and `embedCarrierFrame` (host side, for apps
    that embed an assembled file in an iframe) for `orz-host-save@1`,
    `orz-host-ai@1` and `orz-host-include@1`, with the shared message
    constants and types; wire-compatible with version 1.
- `spec/host-protocols.md`: the canonical host-protocol spec (moved from
  orz-mdhtml's `PROTOCOL.md`, FD-03), with the kind registry
  (`md`/`slides`/`paged`/`poster`), the security rules for both sides, and
  format-1 saves (`source` is the exact text twin; hosts persist the text).
  `spec/shell-runtime.md`: the save order and reader preferences.
- **Quiet update** in `orz-markdown/carrier/shell` (FD-05;
  `spec/shell-runtime.md` §6–§7):
  - the release manifest: every `orz-<x>-browser` package publishes
    `release.json` (`kind`, `version`, `formats`, `notes`, `bundle.path`,
    `bundle.integrity` = `sha384-…`); manifest and bundle URLs are hard-coded
    jsDelivr patterns over `KIND_PACKAGE` (now also exported by
    `orz-markdown/carrier/read`), never taken from a document;
  - `checkForUpdate({ kind, current, format })` — at most one request per
    kind per day (recorded in `localStorage`), silent on any failure, semver
    precedence, never a prerelease, only releases that read the document's
    format, honouring `skipVersion(kind, version)`;
  - `reassemble({ text, kind, release, delivery })` — transactional: verifies
    the bundle's SHA-384 and that it is script-safe, runs the release's
    `OrzCarrier.assemble` in a hidden `sandbox="allow-scripts"` iframe
    (opaque origin; only that iframe's messages are read), accepts the file
    only when `extract` gives back exactly the text, kind, version and
    delivery, and removes the iframe in every outcome; `performUpdate`
    composes check → reassemble → `createSaver().save` (the caller reloads);
    `UpdateError` codes; `parseManifest`, `manifestUrl`, `bundleUrl`,
    `isBundlePath`, `isScriptSafe`, `sha384Integrity`, `compareSemver`;
  - `mountUpdateIndicator(anchor, info, { onUpdate, onLater, onSkip })` — a
    small chip next to the brand with a non-modal, keyboard-operable popover
    (Update now / Not now / Skip this version, "What's new"); no modal, no
    `confirm()`, no banner.
- **Shell chrome** (`spec/shell-runtime.md` §8): `CHROME_CSS` (OKLCH tokens,
  light/dark by `prefers-color-scheme` and `data-chrome`, focus rings,
  spacing/radius/type scales, reduced motion), `ICONS` (12 inline SVGs),
  `createShadowRoot`, `showToast` (polite live region, stacking,
  dismissible).
- FC-19 §2: the standard bundle global `globalThis.OrzCarrier = { kind,
  version, formats, assemble(text, { delivery, engineSource }), extract,
  readDocument, mountEditor, … }`.
- **Editor shell** `orz-markdown/carrier/editor` (`src/carrier/editor/`;
  FC-19 §8): `createEditorShell(element, { text, render, … })`, the
  kind-independent base of every carrier's `mountEditor`:
  - toolbar, editor and preview in one shadow root (`CHROME_CSS` +
    `EDITOR_CSS`); split / editor / preview modes (`setMode`, Cmd/Ctrl+\);
    a draggable, keyboard-operable split; Cmd/Ctrl+S saves, Esc leaves the
    editor; one pane at a time below 640 px of the shell's own width;
  - the exact text: `getText()` is the given text byte for byte until it is
    edited (CR LF, CR, BOM, mixed line endings), and keeps the document's BOM
    and line-ending style after edits; `setText`, `setHeader(changes)` (FC-18
    §9 `editHeader` as one undoable edit), `isDirty` / `markSaved`, events
    `change` / `dirty` / `selection` / `save` / `error`, `undo` / `redo`;
  - the preview: the carrier's `render(text)` (md: `renderMarkdownPreview`,
    which stamps `data-src-line` and rewrites twin links) into an iframe with
    `sandbox="allow-scripts"` (opaque origin), incremental (unchanged blocks
    and drawings kept), debounced, with scroll sync on the line anchors;
  - save: `hooks.save(text)` in an app, else `assemble(text)` + `createSaver`
    (host, served-page notice, File System Access, download); dirty clears
    only on success; never rejects;
  - reader preferences (split ratio, view mode, scroll sync, font size, dark
    chrome) through `createPreferenceStore`, namespaced by the header `uid`;
  - engines behind `TextEditorAdapter`: `codemirror6Adapter()` (markdown
    mode, line wrapping, history, search) — editable at once as a textarea,
    upgraded when CodeMirror loads, kept as a textarea when it cannot — and
    `textareaAdapter()`; apps that bundle CodeMirror pass `loadModules`.
  - CodeMirror 6 is ONE pinned bundle, `vendor/codemirror6.js` (now shipped
    in the package; `@codemirror/state` 6.7.6, view 6.43.13, commands
    6.11.1, language 6.12.4, lang-markdown 6.5.2, search 6.7.2; built by
    `npm run build:codemirror`), loaded from
    `cdn.jsdelivr.net/npm/orz-markdown@<version>/vendor/codemirror6.js` with
    Subresource Integrity. Per-package jsDelivr `+esm` URLs were rejected:
    they resolve `@codemirror/state` to different versions, which CodeMirror
    refuses.
- **Conformance harness** `orz-markdown/carrier/conformance`
  (`src/carrier/conformance/`; spec/conformance.md): the Node-side test tool
  each carrier runs against itself. `runConformance(target, options)` →
  `ConformanceReport`, `registerConformance({ describe, it, beforeAll,
  afterAll }, target, options)` (one test per check), `openConformance`,
  `CHECKS` — 29 checks with stable ids (`C.law.*`, `C.bundle.*`,
  `C.create.*`, `C.edit.*`, `C.save.*`, `C.update.*`, `C.host.*`,
  `C.prefs.*`) over the FC-18 laws (the shipped corpus, hazard texts,
  Node vs Chrome bytes), the bundle rule and `release.json`, create, edit,
  the four save routes, the quiet update (indicator, verified re-assembly,
  tampered and offline refusal, update from the previous release), the
  three host handshakes and reader preferences — in real Chrome on closed
  networks where only the release's jsDelivr URLs are answered.
  `playwright-core` is an optional peer dependency, loaded only when a
  browser check runs; the package now ships `tests/carrier-corpus/` (the
  harness's default corpus).

### Fixed

- HTML scanners lowered a whole document with `toLowerCase()` and used its
  offsets on the original: a `İ` (or another length-changing case mapping)
  before an island shifted every offset, so `parseDocMetaIsland` missed the
  island. Case mapping for HTML is now ASCII-only (`src/ascii.ts`).

### Changed

- A `{{nyml}}` block whose kind is `document` (the FC-18 document header)
  renders nothing and takes no `nyml-data` number.
- The nyml reader treats U+2028 and U+2029 as ordinary characters: only LF,
  CR LF and CR end a line (a value holding them was silently dropped).
- A nyml key named `__proto__` is kept as data (it was dropped).
- `@types/markdown-it` is a dependency (the published types expose it).
- The R.7 KaTeX-budget regression test bounds its time relative to a
  baseline measured in the same run instead of an absolute 40 s (it flaked
  under load).
- Tests: `vitest.config.ts` defines two projects; the conformance harness
  run (`tests/conformance.test.ts`, ~90 s of real Chrome) runs alone after
  every other suite (`sequence.groupOrder`), because in parallel it starved
  the ratio- and timeout-bounded perf and Chrome tests.
- `KIND_PACKAGE` lives in the parser-free `src/carrier/read.ts` (still
  exported by `orz-markdown/carrier`; now also by `orz-markdown/carrier/read`).
- Carrier specs amended (owner, 2026-10-06): FC-19 §3–4 take the editor
  shell's refinements (`save()` resolves a `SaveOutcome`; `setHeader`,
  `undo`, `redo`; bound event payloads; `setText` undoable by default;
  `compact` toolbar; `resolveLink` for preview clicks) and say that a
  standalone save goes through the file's own host connection; FC-18 §3
  requires `carrier: <kind>` in a newly created header; shell-runtime §6
  forbids CR in a bundle, and `isScriptSafe` / `reassemble` now refuse one.

## [2.0.0] - 2026-10-03

A hardening release: security fixes, a class of escaping fixes, revised
themes, and changes that make orz-markdown easier for the family's tools to
embed and to upgrade. It is a major version because defaults change for
servers — file includes are opt-in, and URL includes are fetched only from
hosts you name — and because rendered output and the themes' look change
(below). A `^1.x` dependency does not pick it up; upgrade deliberately.

**Breaking (servers): includes come from trusted sources.** Outside a browser,
`prepareSources()` fetches nothing unless `allowedHosts` is non-empty or a
`fetcher` is given (before: every host when the list was empty). In a page
nothing changes: the URL the author writes is the trust decision. The
isolation checks on fetched text stay, as defence in depth against accidents
and a compromised trusted host.

**Rendered output changes** — refresh output snapshots when you upgrade. They
include:

- new copy breadcrumbs: `data-md` on footnote references and on `{{nyml}}`,
  `{{yaml}}` and `{{toc}}` output, `data-footnote-label` on footnote items,
  `data-orz-container` on `::: cols`, `::: left` and custom containers and on
  the `<summary>` of `::: spoil`;
- Chinese and English text: emphasis next to CJK punctuation now renders, a soft
  line break between two CJK characters renders no space, and bare URLs next to
  CJK link differently (see "Chinese and English text");
- escaping: every `<` in nyml JSON is written `\u003c`, yaml island bodies are
  escaped reversibly, and author values in tab labels, span classes,
  `::: left`/`::: cols` (which now reach `style` only as CSS lengths), youtube
  ids and unknown emoji names are escaped;
- fixes that change output: escaped characters in image alt text are kept, text
  after a one-line block directive is kept as a paragraph, a heading with no
  text gets the id `section`, several `{{nyml}}` blocks get distinct ids
  (`nyml-data`, `nyml-data-2`, …), and an over-long `{{qr}}` renders as text;
- `::: spoil` labels render as inline Markdown (`Label *x*` → `Label <em>x</em>`);
- `{{youtube https://youtu.be/ID}}` (and `watch?v=`, `/embed/`, `/shorts/` URLs)
  embeds the video id instead of a broken URL, a `t=`/`start=` time becomes
  `?start=N` (`{{youtube ID?t=42}}` too), and a body that is no video id (a
  playlist URL, `a..b`) renders as its directive text in
  `<p class="youtube-embed-invalid" data-md="…">` instead of an embed;
- `{{space}}` is capped at 100rem;
- a `{{qr}}` code alone in its paragraph gets `class="qrcode qrcode--standalone"`
  and stays full size; a code inside a sentence is now drawn at text size (it
  expands on tap; print draws both large enough to scan), so its line no
  longer pushes the paragraph apart;
- an emoji renders inside `<span data-md="{{emoji name}}">` (copy restores the
  directive, so a heading keeps its id);
- multi-line block directive bodies that start on the line after the opener
  are dedented by their common indentation (not when the body starts on the
  opener line, nor when tabs and spaces are mixed)
  (an indented `{{yaml}}` body is valid YAML; content keeps its relative
  indentation, the closing line included);
- per-render bounds for untrusted input: past 20,000 TOC entries (or 8 MB of
  TOC) a `{{toc}}` renders as an empty list that keeps its breadcrumb; past
  8 MB of QR SVG, `{{qr}}` codes render as their text; past 5,000,000
  characters, file includes stay unexpanded; link and image targets may total
  4× the source (included files counted) plus 1 MB, past which links and
  images render without their target; math over 10,000 characters, defining
  macros (`\def`, `\newcommand`, …), or past 1,000,000 characters of TeX
  (100,000 inside `\ce{…}`/`\pu{…}` arguments) or 64 MB of KaTeX output per
  document renders as its source;
- an automatic heading id never duplicates an `{{attrs[#…]}}` id: `# Intro`
  with `{{attrs[#intro]}}` on a paragraph gives the heading `intro-1` (only ids
  that are written count: not one on a tight list's hidden paragraph, nor an
  earlier `#a` in `{{attrs[#a #b]}}`); every other heading keeps its 1.6.3 id;
- `::: cols` also accepts `repeat(…)` and `minmax(…)` tracks;
- `prepareSources` places fetched text as block content;
- an inline footnote `^[…]` inside a `{{sp …}}` body or a `::: spoil` label
  renders as text (1.6.3 put a whole footnote list inside the span).

Diff a representative document against 1.6.3 before relying on byte equality.

### Security

- **File includes are opt-in.** `{{markdown path}}` / `{{md path}}` /
  `{{md-include path}}` used to fall back to `process.cwd()` when no
  `markdownBasePath` was given. Any server that rendered untrusted Markdown with
  the shared `md` could therefore be made to read arbitrary local files
  (`{{md /etc/passwd}}`, `{{md ../.env}}`). Includes now resolve only when the
  host passes `env.markdownBasePath` (Node file reads) or `env.readFile` (a
  host-supplied reader). The new `env.markdownIncludeRoot` refuses any include
  that resolves outside a directory (compared by real path, so a symlink cannot
  leave it; a file named `..notes.md` is inside); set it whenever the source is
  not fully trusted. **Migration:** a caller that relied on implicit cwd-relative
  includes must pass `{ markdownBasePath: process.cwd() }` (or better, the
  document's directory).
- **`{{yaml}}` islands could end early.** Only the literal `</script>` was
  escaped; `</script >`, `</script/>` and other spellings closed the island and
  the rest of the block ran as HTML. Every `<script`/`</script` spelling is now
  escaped reversibly (read the island back with `unescapeScriptText`).
- **`prepareSources` with `allowedHosts` re-checks redirects.** The default
  fetcher followed a 3xx from an allowed host to anywhere (an internal address
  such as `169.254.169.254`), and spliced the response into the document. It
  now follows redirects itself, up to 5 hops, checking every hop; in a browser
  an opaque redirect fails closed. A custom `fetcher` should do the same.
- **Fetched text can no longer change the host document.** The spliced
  document is parsed against a reference in which each include is an opaque
  placeholder, and every host token around the includes — inline content and
  link targets included — must come out the same; otherwise the directive is
  left in place. This covers every way fetched text could reach past itself:
  an open fence or comment, a list item or footnote definition swallowing the
  host's next block, a forged marker, a BOM, CR-only lines, a directive placed
  mid-line or with text after it, reference definitions that would redefine
  the host's links, a footnote definition that would rewrite a host footnote,
  a heading that would take a host heading's id, a change in a host list's
  tightness or numbering, or in the numbering of the host's nyml blocks.
  Raw HTML in fetched text is limited to an allowlist: plain elements in
  strict tag syntax, list and table parts only in their own parent, every
  element closed inside its Markdown container, and attributes from an
  allowlist with no `class` or `style` (either can lay content over the host
  page) and no ids the renderer gives out (`fn1`, `nyml-data`, …). Fetched
  text may use only the documented containers and `{{sp[…]}}` classes. Raw
  HTML outside the allowlist — SVG/MathML, `<script>`, `<style>`,
  `<textarea>`, forms and other elements the browser parses specially,
  event-handler attributes, `class` or `style` — is ignored: the block holding
  it (an HTML block, or the paragraph, heading, table row — a header row: the
  whole table — or `::: spoil` container it sits in; `{{sp …}}` bodies count as their paragraph) is
  removed, and the rest of the include renders after passing every check
  again. Other refusals (an undocumented container or span class, covering
  math, `{{attrs[…]}}` outside the attribute allowlist) still leave the
  directive in place, as does an include that would push the document past a
  per-render cap the host alone stays under (TOC entries or size, QR output,
  TeX, mhchem, KaTeX output) or math that laps, smashes, moves vertically or
  kerns left by 1em or more in total; and an id written in raw HTML counts like any other. An
  included document's own metadata block is dropped. Host footnotes are
  compared too: an include's reference definitions cannot link text in a host
  footnote. A document with a live file include keeps its URL directives
  unless `prepareSources` gets the render's file settings as `includeEnv`
  (then the file-included text is part of the host it must not change). An unclosed trailing code
  fence is closed at its own indentation first. Before, a closer appended after a list-item fence
  could turn the host's own `{{md …}}` code example live.
- `markdown-it` → `^14.3.2` (GHSA-253c-mchw-3w2r: with `linkify: true`, a few
  hundred KB of crafted Markdown could block the event loop for tens of
  seconds — relevant to any server rendering untrusted input).

### Chinese and English text (new)

- **Emphasis next to CJK punctuation works.** `**注意：**请先阅读` and
  `这是**“重点”**内容` render bold. This is a port of the CommonMark
  CJK-friendly amendment (markdown-it-cjk-friendly) without adding that
  package; English emphasis rules are unchanged (fuzzed against upstream).
- **No stray space where a Chinese line wraps.** A soft line break between two
  CJK characters renders nothing (markdown-it-cjk-breaks). English and mixed
  line breaks keep their space.
- **Bare URLs next to Chinese.** `访问https://orz.how获取` links only the URL.
  `请访问www.baidu.com获取` links `www.baidu.com` (before, the Chinese was
  linked into a punycoded host, or nothing was linked). CJK punctuation, and
  the Chinese dash and ellipsis (`——`, `……`), end a URL. CJK written onto a
  URL path (`/wiki/化学`, `?q=中文`) stays in the link — put a space or
  punctuation after a URL that prose follows — and an emoji right after a URL
  is not part of the host. `访问 github.com获取` links `github.com`; Chinese running into full-width
  Latin (`请访问ｗｗｗ.baidu.com`) links nothing instead of a punycoded host. A
  heading whose text holds such a URL followed by inline markup can get a
  different id than in 1.6.3 (the markup after the URL is now parsed, not
  swallowed into it).
- **Metadata for Chinese authors.** nyml accepts the full-width colon
  (`title：…`), and `keywords` split on `;` `，` `、` `；` and newlines. Windows
  (CRLF) and CR-only sources scan exactly like LF; tab-indented values work.

### Copy as Markdown (closed-loop hardened)

Copying rendered content now round-trips: rendering the copied Markdown gives
back the same HTML. Twenty-four adversarial review rounds and a final check
tested this, and over 1,100 tests pin it, including real-Chrome tests with real mouse selections.
`notes/CLAIMS.md` lists the guarantees and `notes/closed-loop.md` records the rounds.

- **Escaping.** Literal Markdown characters are escaped minimally and per block,
  so prose such as `snake_case`, `5 * 3` and `$5` copies clean while
  `\*literal\*` stays literal. This covers line-start markers, trailing `#`,
  setext and thematic lines, typographer patterns, and table pipes (with
  markdown-it's no-parity rule).
- **Structure.** Ordered-list starts and numbering of partial selections, items
  with several blocks or a leading code block, adjacent lists, footnotes with
  their labels (`[^注]`), containers with their arguments (including custom
  `::: name` and code examples containing `:::`), and the TOC directive all
  survive.
- **Inline content.** Links with brackets, titles, spaces or parentheses survive,
  and relative links stay links. So do image alt text and `=WxH` sizes,
  autolinks, inline HTML (`kbd`, `ruby`, styled spans) and KaTeX errors.
  Emphasis falls back to HTML where its delimiters would not re-parse.
- **Whitespace.** Code-block whitespace is exact. Full-width spaces and nbsp
  survive.
- **Selections.**
  - A selection that takes a block element itself (select-all, a drag from
    before it) copies the whole block — a code block fenced, a heading with its
    `#`; one covering all of a table, quote or container's text copies that
    block; a partial selection copies only what is selected.
  - Text inside code copies verbatim, so a copied command pastes as the command.
  - Triple-click no longer drags in the next block.
  - Partial table rows keep their columns.
  - Inline math and generated constructs are never split.
- **Robustness.** Copy keeps working after a host rewrites the document
  (`document.open()`), and a second copy of the runtime does not double the
  handlers.
- **Performance.** Linear: a 4,000-item price list converts in well under a
  second, and the copy event itself is linear (8,000 paragraphs took 8.5 s
  before; 4,000 now take about 0.7 s).
- Copying part of an indented code block keeps the first line's indentation,
  also when the selection starts in the paragraph above.
- A tight list holding display math copies as a tight list; emphasis nested at
  the edge of the same emphasis (`_*注意*：说明_`) copies as HTML so it
  re-parses.
- Content hidden with `visibility: hidden` is not copied on triple-click.
- An include neutralized by `prepareSources` copies without its invisible
  U+2060 joiner.

### Fixed

- Rendering is linear in headings, task-list items and footnotes. In 1.6.3,
  20,000 headings with one title took 56 s, 20,000 task items 8 s and 10,000
  footnotes 7.4 s (the upstream markdown-it-anchor, -task-lists and -footnote
  rules, ported in one pass with identical output). `parseDocMetaIsland` is
  linear too.
- Image alt text kept escaped characters out: `![Tom\'s dog](d.png)` rendered
  `alt="Toms dog"` (the image port never joined `text_special` tokens).
- File includes (`{{md file}}`) are spliced in at parse time, so an included
  file is part of the document: there is one footnote list, heading ids are
  unique, the TOC lists included headings, and token `map`s point at the
  directive. Before, the footnote section was duplicated and the TOC missed
  included headings.
- Text after a single-line block directive (`{{smiles CCO}} is ethanol`) is
  kept as a paragraph instead of being dropped.
- `scanNymlBlocks` / `extractDocMeta` agree with the renderer. A nyml block
  counts only at the start of a line, never when escaped or mid-paragraph.
  A stray backtick, a `<!--` inside a code span, or a fence indented inside a
  list item can no longer hide or expose blocks. Keys count only at the
  block's base indentation. Every meta block is removed, so extraction is
  idempotent.
- `prepareSources`:
  - fetches each URL once per call and enforces a `maxSize` budget that counts
    inserted quote and list prefixes;
  - keeps an include that starts a line inside a blockquote or list item in
    that container;
  - accepts the `md` alias, a space before `}}` and a trailing comment;
  - never fetches escaped, code or link-destination directives;
  - neutralizes file-include directives inside fetched text, so remote content
    cannot make the host read local files.
- `scanNymlBlocks` (and so `extractDocMeta`) locates blocks from the
  renderer's own tokens, so it agrees with rendering by construction — a value
  holding an unbalanced fence, `$$`, `<!--` or `<pre>` no longer hides the
  blocks after it — and is linear (mid-line `{{nyml }}` mentions took 121 s at
  1.5 MB).
- Text after a URL that is cut before CJK prose is parsed as Markdown: in
  `见https://orz.how/a。\`npm i\`即可` the code span renders, and so do
  emphasis, links and a second URL after `，`. The text is cut at prose
  boundaries before linkify runs: CJK punctuation, CJK right after an ASCII
  host (letter or digit), or raw CJK after an encoded CJK character. CJK in a path stays in the URL (`/item/Java语言`,
  `/wiki/佐々木朗希`, `/中华人民共和国（1949年）`,
  `/wiki/Python_(编程语言)`, `?q=北京+天气`, `#第1章`), as do IDN hosts
  (`www.百度.com`). With spaces around it a URL links exactly as plain
  markdown-it links it, except for the cuts above (CJK punctuation or curly
  quotes in it, CJK, an emoji or a symbol glued before or after its host,
  raw CJK after encoded CJK). Prose glued directly onto a URL *path* cannot be told
  from a page name and stays in the link — put a space or punctuation after it. An
  opening curly quote after a URL is not part of it either.
- Unclosed `{{name …` lines no longer make rendering (and `extractDocMeta`)
  quadratic: 8,000 such lines took 5 s.
- A BOM-prefixed source parses exactly like its BOM-less twin.
- `parseDocMetaIsland` reads only the island in the document head, by its exact
  `id`: a raw-HTML island in the body can no longer pose as the document's
  metadata (a spoofed `uid`).
- Author-controlled values are escaped wherever they reach HTML: `::: tab`
  labels, `{{sp[class]}}` classes, `::: cols` / `::: left` values, `{{youtube}}`
  ids (URL-encoded), unknown `{{emoji}}` names, and TOC entry text. A `"` in a
  tab label or a `<div>` in a heading used to produce broken markup.
- JSON islands (`#orz-meta`, nyml) escape every `<` as `\u003c`. Escaping only
  `</script` left a hole: `<!--` followed by `<script` inside the JSON switches
  the HTML tokenizer into the double-escaped state and swallows the rest of the
  page.
- Several `{{nyml}}` blocks in one document no longer share the id
  `nyml-data`: the first keeps it, and later ones get `nyml-data-2`, `-3`, ….
  Numbering restarts per document even when a host reuses its `env` object.
- `scanNymlBlocks` / `extractDocMeta` and `prepareSources` ignore directives
  inside fenced code, inline code and HTML comments, just as the renderer does.
  Before this fix, a document that *showed* a `{{nyml kind: meta}}` example in a
  code block lost the example and got its metadata from it, and `prepareSources`
  fetched URLs that only appeared in code.
- `prepareSources` treats a throwing custom `fetcher` as a failed fetch (the
  directive stays in place) instead of rejecting the whole pass.
- `mergeDocMeta` ignores blank host values (empty or whitespace strings, empty
  arrays, `null`), so a host form full of blanks no longer erases what the
  author wrote.
- Copy-as-Markdown keeps `::: cols` ratios and the `::: left` width.

### Added

- `orz-markdown/carrier` — shared building blocks for the family's carriers
  (family decision FD-03), Node-free and safe to bundle:
  - `escapeScriptText` / `unescapeScriptText` — reversible escaping of
    Markdown in a `<script type="text/…">` source island. Handles `</script`
    and `<script`, and reads files written by the old one-way escape.
  - `jsonForScript` — JSON safe inside a script element.
  - `escapeHtml` / `escapeAttr`.
  - `maskInertMarkdown`.
- `maskInertMarkdown(source)` — blanks code blocks, code spans, comments and
  raw HTML blocks while preserving offsets, in linear time. Any pre-render
  scanner can use it to agree with the renderer. Hoisted from orz-poster (whose
  copy was quadratic: about 2 minutes per MB).
- `VERSION` and `KATEX_VERSION` constants (also from `orz-markdown/version`).
  Hosts no longer need to read `package.json` off disk to learn which
  orz-markdown they run.
- `PREVIEW_LIB_VERSIONS`. Every preview-frame library is pinned to an exact
  version (Mermaid `11.17.2` and Chart.js `4.5.1` instead of `@11` / `@4`).
  The KaTeX stylesheet now follows the KaTeX that renders the math.
- `resolveIncludePath()` and the `IncludeEnv` type.
- `prepareSources` option `timeoutMs` (default fetcher; default 15 s).
- Line length as a choice: `class="markdown-body measure-wide"` (about 90
  characters, tuned per theme by `--orz-measure-wide`) or `measure-full`; the
  default stays each theme's ~70-character reading measure.
- `prepareSources` option `includeEnv` (the render's `markdownBasePath` /
  `markdownIncludeRoot` / `readFile`), so a document with file includes can
  still resolve URL includes.
- `MAX_TEX_TOTAL`, `MAX_CHEM_TOTAL` and `MAX_KATEX_OUTPUT` (the per-render math
  limits) are exported from the main entry.
- `getBrowserRuntimeScript({ autoInit: false })` (`BrowserRuntimeOptions`):
  copy-as-Markdown without wiring QR expansion or tab bars, for outputs that
  flatten them on purpose. Replaces orz-poster's textual surgery on the
  runtime. The default output is unchanged.
- `./package.json` is exported.
- `npm run build:web` rebuilds the website editor bundle and syncs
  `docs/themes`.

### Changed

- **Themes revised for reading comfort** (decoration only; the structure layer
  gained the `measure-wide`/`measure-full` classes, text-size inline QR codes,
  and a trim of the first and last margin inside callouts, alignment boxes,
  spoilers, tabs and columns). Every theme now holds a 69–72 character
  measure, aligns text to the start, turns off code ligatures (`<=` no longer
  shows as `≤`), uses a soft `mark` tint, and passes WCAG AA for all text,
  coloured spans and badges included (red, green and blue spans are clearly
  coloured; on light themes `yellow` is the most saturated gold that still
  reads at AA — text colour only, like the others).
  Each theme keeps its own character — heading marks, title treatments, paper
  backgrounds — and has its own callout design (icon cards, paper slips,
  marginal notes, top-band admonitions, double-framed book sidebars, corner
  brackets, editor diagnostics, sticky notes, stickers); the four callout types
  differ by colour and by an icon or shape. Side-stripe accents, heading
  shadows, fake window dots and overlapping glyphs are gone. Font changes:
  beige-decent-1 → Libre Caslon Display & Text, Red Hat Mono; dark-elegant-3
  (Nocturne) → Atkinson Hyperlegible Next and Charis SIL; light-academic-1
  sans → Alegreya Sans, code → Inconsolata; light-academic-2 code → Fira Mono; light-playful-1 body
  → Shantell Sans, code → Recursive. Expect visual differences.
- A host that reuses one `env` object across renders no longer inherits the
  previous render's footnotes or link reference definitions; references the
  host itself seeds in `env.references` are kept.
- Dependencies: `markdown-it-cjk-breaks` added; `markdown-it-imsize` removed
  (internal port of `=WxH`). A consumer that links this checkout must install
  `markdown-it-cjk-breaks`.
- `katex` is pinned exactly to `0.16.47` (the newest 0.16.x; 1.6.3's `^0.16.35`
  resolved there too in practice), so one KaTeX copy renders and
  `KATEX_VERSION` and the preview-frame stylesheet always match it. Math HTML
  differs from a 0.16.35 install.
- In native Node ESM, import the named export: `import { md } from 'orz-markdown'`
  (the package is CommonJS; a default import gets the module object). README
  and the skill now say so.
- **Themes split into structure and decoration.** `themes/common.css` is now
  the single structure layer: container floats and alignment, the cols grid,
  tab switching, scrolling for wide tables/code/math, embed sizing, the family's
  one 640px breakpoint, and print. The 12 theme files keep decoration only
  (about 450 duplicated or conflicting layout declarations removed).
  `tests/themes.test.ts` enforces the split. Fixed along the way:
  - `::: right` / `::: center` did nothing to paragraphs in themes that justify
    text (dark-elegant-3, beige-decent-1, light-academic-1).
  - `{{youtube}}` collapsed to the browser's 300×150 default in six themes
    (beige ×2, academic ×2, playful ×2).
  - Long words or code overflowed `::: cols` in 12 of 13 theme files.
  - Ratio columns (`::: cols 1 2`) never collapsed on phones (the inline style
    beat the media query).
  - Wide equations and tables pushed a page-level horizontal scrollbar in most
    light themes.
  - Two themes clipped wide tables (`overflow: hidden`).
  - Two themes showed bullets on the TOC.
  - light-academic-1 kept `::: left` floated on phones.
  - Printing showed only the active tab.
  - Seven themes did not declare `color-scheme`.
  - Six themes styled bare `*`, `h1`, `a`, `code` or `table`, restyling the
    host page's own UI (an editor's toolbar, a site header). Every theme rule
    is now scoped to the page roots or the article, with
    `:where(.markdown-body)` where the old specificity must be kept, and the
    themes' typography (colour, font, line height) moved from `<body>` to the
    article (that step alone changed nothing visible; the reading-comfort
    revision above is what changes the look).

  Themes can tune layout through tokens (`--markdown-body-max-width`,
  `--orz-measure-wide`, `--orz-left-max-width`, `--orz-center-max-width`,
  `--orz-cols-gap`, `--orz-col-min`, `--orz-float-gap`). A `::: left 30%` width now means the box's full width,
  padding included.
- `assets/minimal.css` is now the starter theme: it imports `common.css` (shipped
  beside it) and adds neutral decoration. `references/themes.md` → "What a new
  theme needs" is the contract.
- **`prepareSources` places fetched text as block content.** A directive in
  the middle of a paragraph now splits the paragraph there instead of gluing
  the fetched text into it (`x {{md URL}} y` → `x`, the included blocks, `y`);
  inside emphasis, link text, a heading or a table cell the directive stays.
  An include is a document fragment, and splicing it into a line let its first
  and last lines merge with the host's text. Directives are located from the
  renderer's tokens, so exactly the directives the renderer sees as live are
  resolved.
- A heading with no text (`## {{emoji smile}}`) gets the id `section`
  (then `section-1`, …) instead of an empty id.
- An unnamed `{{chart}}` (`data:` shorthand) hides its legend instead of
  showing "undefined".
- `syntax.md` documented `::: right` as "floats right". Every theme and the CSS
  reference treat it as right alignment, and the docs now say so.
- **No Node shims needed in browser bundles.** orz-markdown no longer
  statically imports `fs`, `path` or `process`. File includes reach Node
  through `process.getBuiltinModule`. `markdown-it-imsize` is replaced by an
  internal port of its `=WxH` parser without the disk-reading `autofill`.
  Carriers can delete their `build/shims` (`fs.cjs`, `imsize.cjs`,
  `process.js`) and the `path-browserify` alias. A test bundles the package
  for the browser with no shims and renders in a sandbox without
  `process`/`require`.
- `assets/template.html` in the skill is generated from the preview-frame
  assets at build time, so it can no longer lag the runtime.
- `engines.node` is `>=20.16`, for `process.getBuiltinModule`. Rendering works
  on older Node, but `markdownBasePath` file reads do not resolve there (a host
  `readFile` hook still works).

## [1.6.1] – [1.6.3] - 2026-07-16 – 2026-07-17

Package metadata, README and skill wording only (site discovery, the
"self-editing" positioning). No code, rendering, theme or API change.

## [1.6.0] - 2026-07-11

### Added

- **`DocMeta.uid`** — an optional, stable, opaque document identifier a host can
  embed in the `#orz-meta` JSON island. Because `serializeDoc()` never rewrites
  that island, the `uid` survives in-file edits and travels with the file, so a
  host (e.g. Alembic) can recognize a downloaded-then-re-uploaded document as the
  SAME document and keep its permalink durable — regardless of filename or
  contents. Purely additive: `isEmpty` now treats a uid-only meta as non-empty so
  the island is still emitted; standalone files and hosts that don't set it are
  unaffected.

## [1.5.0] - 2026-07-11

### Added

- `prepareSources(src, opts?)` — the async URL-include pre-pass (`{{markdown
  https://…}}` / `{{md-include https://…}}`) — gained options for safe
  host-embedded use: `allowedHosts` (resolve includes only from an allowlist —
  an SSRF guard when resolving host-authored content server-side), an injectable
  `fetcher` (control transport/auth; defaults to the global `fetch`), and
  `maxDepth` (recursion for includes-of-includes, default 3). Includes now
  resolve recursively with an ancestor-chain cycle guard, and the directive is
  replaced by index-splice so fetched markdown containing `$&`/`$1` is not
  corrupted. Fully backward compatible — no options means the prior behavior
  (global `fetch`, any host, single pass).

### Fixed

- Limited the website editor service worker to its explicit offline app-shell
  assets so it can no longer retain stale pages or editable-file starters.
- Versioned the official starter links to bypass entries left by the previous
  root-scoped cache and ensure newly created files use current framework releases.

## [1.4.1] - 2026-07-11

### Security

- Updated `markdown-it` to `^14.3.0` (and its fixed `linkify-it ^5.0.2`
  dependency) to address quadratic-complexity denial-of-service advisories in
  smartquotes and automatic link scanning. Updated the build/test toolchain to
  fixed `esbuild`, `happy-dom`, and `vitest` releases.

## [1.4.0] - 2026-07-10

### Added

- A shared document-metadata API for the editable orz family:
  `extractDocMeta`, `mergeDocMeta`, `renderDocMetaHead`,
  `renderDocMetaIsland`, and `parseDocMetaIsland`, available from
  `orz-markdown/doc-meta` and the main export. It normalizes author, license,
  canonical source, publication date, description, and keywords into standard
  `<head>` tags plus a machine-readable `#orz-meta` JSON island.
- A shared `{{nyml}}` block scanner, hoisted from orz-paged so mdhtml, slides,
  and paged use one grammar for document metadata.

## [1.3.2] - 2026-07-06

### Fixed

- **Explicit image sizes (`![alt](url =WxH)`) now render at the requested
  dimensions.** `markdown-it-imsize` already emitted `width`/`height`
  *attributes* on the `<img>`, but the shared theme rule in `themes/common.css`
  set `.markdown-body img { width: auto; height: auto }` unconditionally — and a
  CSS property overrides an HTML attribute, so sized images collapsed back to
  their intrinsic size. The `auto` sizing is now scoped to images **without** an
  explicit dimension (`img:not([width])` / `img:not([height])`), so the
  responsive default is preserved while `=WxH` wins.
  - `![](photo.png =200x100)` → 200×100 (still capped to container by
    `max-width: 100%`).
  - `![](photo.png =200x)` / `![](photo.png =x100)` → constrains only the given
    axis; the other stays proportional.
  - `![](photo.png)` (no size) → unchanged: intrinsic size, responsive.
  - **For downstream docs / custom CSS:** mirror the
    `img:not([width])` / `img:not([height])` pattern rather than a blanket
    `.markdown-body img { height: auto }`, which would re-break explicit sizes.

## [1.3.1] - 2026-07-05

### Added

- Zenodo DOI + citation metadata (`CITATION`/citation note) for the
  orz-markdown editable-document family, and website starter pages/docs
  (paged reference, slides layouts & syntax, "For agents" / skill install
  routes). Standalone site and editor chrome only — no change to the library
  API or rendered Markdown output.

### Changed

- Standalone website header is now adaptive on narrow screens; editor gains a
  GitHub link and a `© orz-markdown` footer linking to markdown.orz.how.

## [1.3.0] - 2026-06-28

### Added

- New bundled theme **`light-neat-3.css` ("Orchard")** — Bricolage Grotesque
  headings, a calm green accent, and generous spacing; ships frameless (no card
  border) on a solid background.
- New bundled theme **`dark-elegant-3.css` ("Nocturne")** — a VS Code-dark theme:
  Lora serif body, colourful headings (blue/amber/green/red/pink), blue accents, and
  decorative touches (underline bars, ✦ markers, star rules, quote-mark blockquotes,
  translucent blurred callouts).
- `orz-markdown/preview-frame` export with `getPreviewFrameAssets()` — a one-call
  helper for host apps that mount rendered output in an `<iframe>` (viewers,
  editors, slide/page engines). Returns the pinned CDN URLs, the browser runtime,
  `headLinks(scheme)` / `bodyScripts()` strings, and a `window.__orzEnhance()` that
  highlights code, draws mermaid/SMILES/charts, and inits tabs + QR — so every host
  wires the preview identically instead of re-deriving it. See the skill's
  `references/embedding.md`.
- `{{chart}}` plugin — declarative bar/line/pie/doughnut charts from a tiny
  line-based config (`type:`, `labels:`, `series: Name = …` / `data: …`,
  optional `title:`). Emits a `<canvas class="orz-chart" data-chart="…">` with
  the Chart.js config as escaped JSON plus a `data-md` breadcrumb (round-trips
  via copy-as-markdown). The host runtime draws it with Chart.js, the same way
  smiles canvases are painted.

### Changed

- Theme refresh across the bundled themes: modernised blockquotes, callouts and
  spoilers (a distinct, contemporary treatment per theme rather than the same
  flat box); harmonised, varied code blocks; a unified base body font size so the
  perceived text size stays consistent when switching themes; solid (non-tiling)
  backgrounds where gradients repeated on long documents; and a modern "Contents"
  table-of-contents panel for `light-academic-1`.
- Dark themes (`dark-elegant-1/2/3`) now render Mermaid diagrams and `{{chart}}`
  canvases on a soft translucent light panel, so their light-default drawing
  (dark-on-light) stays legible against the dark page background.

### Fixed

- Copy-as-Markdown now recovers **block (display) math** as `$$…$$`. Display math
  renders as `<p class="katex-block"><span class="katex-display">…`; the walker
  treated that wrapper as a paragraph and emitted the inner equation as *inline*
  `$…$`. It now detects the `katex-block`/`katex-display` wrapper (→ `$$…$$`), and a
  selection inside a display equation promotes to the whole equation.
- Copy-as-Markdown now recovers `{{sp[…] …}}` spans. The DOM→Markdown walker
  previously emitted only the inner text of a `<span class="…">`; it now
  reconstructs `{{sp[class] body}}` (e.g. `{{sp[red] text}}`,
  `{{sp[success] ✓ Done}}`). Other spans (`{{space}}` has no class, emoji emits
  text) are unaffected.
- Copy-as-Markdown now recovers `::: container` blocks. The walker emitted only a
  container's inner content; it now reconstructs the directive — `::: info`,
  `::: center`, `::: spoil Title`, and nested `:::: cols`/`::: col` and
  `:::: tabs`/`::: tab Label` (fence length grows so nesting re-parses; the
  JS-injected `.tabs-bar` is skipped).
- Copy-as-Markdown promotes a selection sitting inside a `::: container` to the
  whole container, so copying its content includes the `:::` fence — mirroring
  the existing table/blockquote/code-block promotion. Containers nest, so the
  selection is promoted to the **outermost** one (a copy inside one column of a
  `:::: cols` yields the full `:::: cols … ::::`, not the inner `::: col`).

## [1.2.2] - 2026-06-24

### Fixed

- Browser safety: `markdown-include` no longer throws `process is not defined`
  when the parser runs in a browser bundle. `process.cwd()` is now guarded; in
  the browser the include simply renders empty (filesystem reads aren't
  available there).

### Changed

- Tab interactivity moved into `browserRuntimeScript` as
  `OrzMarkdownRuntime.initTabs(root)` (run by `init()`), so every page that
  embeds the runtime gets working `::: tabs` — not just the standalone demo.
  The bespoke tabs script was removed from `scripts/render.ts`.

## [1.2.1] - 2026-06-24

### Fixed

- Copy-as-Markdown now copies the whole block when a selection sits entirely
  within a table, blockquote, or code block. Browsers often clone such
  selections without the wrapping element, so previously copying a whole table
  or blockquote yielded only its inner text (no pipes / no `>`); the selection
  is now promoted to the containing block. The DOM→Markdown walker also
  reconstructs a table from bare `thead`/`tbody`/`tr` nodes as a fallback.

## [1.2.0] - 2026-06-24

### Added

- Copy-as-Markdown: selecting and copying rendered content now yields Markdown
  source instead of HTML, for every document (the handler ships in
  `browserRuntimeScript`). A dependency-free DOM→Markdown walker reconstructs
  headings, emphasis, code, links, mark/ins/del/sub/sup, bullet/ordered/nested
  lists, task lists, tables (with alignment), blockquotes, fenced code (with
  language), images, and inline/display math (recovered from the KaTeX
  `<annotation>`). The copy handler ignores selections inside inputs/textareas
  and only acts within `.markdown-body` (or `[data-orz-copy]`). Exposed as
  `OrzMarkdownRuntime.elementToMarkdown(node)`.
- `data-md` breadcrumbs on generated constructs whose source is otherwise lost
  after client-side rendering — `mermaid`, `smiles`, `qrcode`, `youtube`. The
  walker emits these verbatim, so a table of contents copies its heading links
  (not `{{toc 2,3}}`) and a QR code copies `{{qr ...}}` (not its SVG).

## [1.1.0] - 2026-06-11

### Fixed

- TOC ordering bug: `attrs` now registers before `toc`, so the `attrs_resolve`
  core rule runs before `toc_resolve` and `{{toc}}` links point at the final
  heading ids. Previously, headings carrying a custom id via `{{attrs[#...]}}`
  produced dead TOC links to the superseded `markdown-it-anchor` slug.
- Trailing-space artifact: `## Title {{attrs[#x]}}` no longer leaves a trailing
  space in the rendered heading text or in TOC entries. Trailing whitespace
  before a removed end-of-line `{{attrs}}` marker is trimmed.

### Added

- The Agent Skill (`orz-markdown-skills/`) is now included in the published
  npm package, at the stable path
  `node_modules/orz-markdown/orz-markdown-skills/SKILL.md`. Documented in a new
  README "Agent Skill" section.
- `orz-markdown-skills/references/block-ids.md`: stable block-ID preservation
  rules for AI editors (`{{attrs[#blk-...]}}` ids are immutable, never reused,
  never duplicated, never converted to/from Pandoc `{#id}` syntax), plus a
  summary section in `SKILL.md`.
- Regression tests pinning that a heading id set via `{{attrs[#...]}}` exactly
  overrides the `markdown-it-anchor` slug and survives heading-text edits.

## [1.0.0] - 2026-04-13

### Added

- Initial npm release: customized `markdown-it` instance with official plugin
  bundle (anchor, container, footnote, imsize, mark, sub, sup, ins,
  task-lists, KaTeX with mhchem), custom `{{name[args] body}}` plugin
  dispatcher (span, emoji, space, qrcode, youtube, mermaid, smiles, toc,
  attrs, markdown include, yaml, nyml), `register()` extension point,
  `prepareSources()` remote-include pre-pass, browser runtime script, and 10
  bundled CSS themes.
