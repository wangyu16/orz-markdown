# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Planned as **2.3.0**: the carrier-kit gaps the orz-paged 1.0 rebuild found
(family plan REBUILD §3b, the `KIT GAP` notes in orz-paged's sources). All
additive for `^2.2.0` consumers (orz-mdhtml 1.0.0's test suite passes
unchanged against it); the parser's `md.render` output is unchanged except
one added attribute (`data-url` on a `{{youtube}}` embed, for print).

### Added

**`orz-markdown/carrier/app`** ([spec/carrier-app.md](spec/carrier-app.md) §3.4,
§4.5, §4.10; claims A.23–A.28):

- **Action submenus** — `CarrierAction.items?(app) → CarrierActionItem[]`
  (`{ id?, label, checked?, disabled?, separator?, run(app) }`): a submenu in
  the handle's list (hover, tap, ArrowRight/Enter open it on its checked
  entry; ArrowLeft/Escape close it) and, with `inEdit`, in edit mode (a
  submenu of More, or a menu button of the bar for a `bar` action). Entries
  run with the app; a failing one is a toast; no entries: disabled.
  `CarrierAction.run` is now optional (an action with neither `run` nor
  `items` is not offered). `menuButton` items accept `items()` (one level).
- **Conditional actions** — `CarrierAction.hidden?(text)`: offered only while
  it returns false, re-evaluated as the text changes (each opening of the
  handle's list and More; an edit-mode bar button after a pause in typing).
- **Settings that write block values** — `SettingControl.apply?(text, value)
  → Record<string, HeaderChange>` (any keys, `{ multiline }` values,
  removals; one undoable edit), `choicesFor?(text)` (choices read at each
  opening), per-choice `checked` toggles and `separator`, and `hidden?(text)`
  (also followed by `attachSettings` in an editor's toolbar). Helpers
  `settingChoices`, `settingOffered`, `settingChanges`.
- **`hidden(text)` asked once per text** (round 1 of the paged loop; claim
  A.29) — `hiddenFor(owner, text)`: a setting's or action's `hidden` may be
  costly (paged's Version parses the document), so the kit keeps the answer
  for the last text asked per owner; reopening menus on the same text asks
  nothing, and it is never asked synchronously per keystroke (after the
  typing pause only).
- **Reader controls with named choices** — `readerControls.choices:
  ReaderChoiceControl[]` (`{ key, label, icon?, choices: { id, label }[],
  default, apply(view, id) }`): a submenu in the handle's list, stored per
  uid as the reader preference `reader.<key>` (validated against the ids),
  applied at boot and on each choice, never in the document;
  `CarrierApp.readerChoice(key)` / `setReaderChoice(key, id)`.
- **New document with a text** — `CarrierApp.newDocument({ text?, name? })`
  saves a kind's text (a template) as a new file; a text without a uid (or
  with this file's) gets a new one; `name` is the suggested file name.

**`orz-markdown/carrier`** (claims K.23–K.27):

- `normalizeHeader(text)` — FC-18 §5's legacy merge (`kind: meta` +
  `kind: document` pair → one header; lone `kind: meta` → `kind: document`)
  without an edit.
- `lintHeader(text, { kind?, themes? })` and `readDocument(text, { kind,
  themes })`: `unknown-theme` against the kind's own theme list, for any kind
  (`lintHeader(text, kind)` still works; md without `themes` as before).
- What orz-mdhtml and orz-paged copied: `sha256(text)` (synchronous,
  isomorphic); the legacy 0.x island reader `readLegacyIsland(html, {
  generator, config })` with `rawElements`, `rawAttr`, `hasRawAttr`,
  `decodeEntities`, `generatorOf`; the kind-independent core of `inspect` —
  `looksHtml`, `shellWord`, `scriptElement`, `assembledStructure`,
  `storedText`, `heldText`, `twinCheck`.

**`orz-markdown/carrier/node`** (new entry, Node only;
[spec/carrier-node.md](spec/carrier-node.md); claims N.1–N.9) — the CLI core
orz-mdhtml 1.0 and orz-paged copied (`src/{known-states,includes,cli}.ts`),
bound to one tool by `carrierNode({ name, kind, cacheName?, textSuffix?,
readLegacy?, storedText? })`:

- the overwrite guards `assembledOutputCheck` and `textOutputCheck`, `guard`,
  the uid-identity gate (`sameDocument`, `uidOf`), `otherName`, `shown`,
  `commandLine`, `libReason`, `changedAfter`, `earlierSource`;
- known earlier states: git (HEAD, index, 20 recent commits, 8 s budget) and
  the CLI's pair and last-writer records under `$XDG_CACHE_HOME/<cache>` or
  `~/.cache/<cache>` (an unwritable cache is not read; an unrecorded pair
  warns with the `--replaces` token) — `rememberPair`, `earlierStateOf`,
  `twinStateOf`, `lastWriter`, `cleanInGit`;
- files: `readText`, `writeOut` (atomic; mode and symbolic link kept;
  folders created), `backup` (`~`, `~1`…; never through a link; identical
  bytes reused);
- includes: `includeTargets`, `resolveFileIncludes` (the twin's folder only),
  `keepReferenced`, `unresolvedIncludes`, `includePlan` (assemble's
  keep / `--resolve-includes` / stale / unresolved decision with its warnings);
- the vocabulary: `Reason` / `REASONS`, `CliError`, `Next`, `EXIT_*`,
  `cliIo`, `emit`, `reportFailure`, `sh`, `assembleArgs`, `replacesToken`.

Node built-ins only through `process.getBuiltinModule`; no other entry
imports it, so no browser bundle holds it (N.1). The strongest CLI tests of
both carriers (T.7, T.9, T.11, T.12, T.14, T.16–T.21 — "following every
`next` verbatim never loses a text") run against it through a reference CLI.

**`orz-markdown/carrier/editor`** (claim E.32): **`preview.maxWaitMs`** — while
edits continue a render is forced at least every `max(maxWaitMs, 4 × the
last render)` (default 1000, as before); `Infinity` never forces one while
keys keep arriving, so a kind whose render blocks the page (orz-paged's
Paged.js reflow in the same-process frame) renders only after a typing
pause and typing never freezes. Frame-acknowledged pacing is unchanged.

**Print layer of `themes/common.css`** (claim M.30): each tab pane prints
after its label as a small heading (an unnamed one as "Tab N"), and a
`{{youtube}}` embed prints its address (`YouTube video: https://youtu.be/<id>`,
from the new `data-url` attribute) instead of a blank 16:9 frame. The screen
is unchanged.

**`orz-markdown/preview-frame`** (claim M.28): `enhanceDocument(root, {
static: true })` for print and pagination — draws everything, then turns every
drawn chart and SMILES canvas into an image (`data-orz-frozen`, class,
`data-md` breadcrumb, accessible name and width kept; charts stopped,
destroyed, drawn at ≥ 2× pixel ratio), skips the interactive runtime unless
`runtime: true`; the result counts the images (`frozen`).

### Fixed

- **Mermaid (and every content library) blocked by an element id** (all
  carriers; claim M.29): a heading "Mermaid" gets `id="mermaid"`, so
  `window.mermaid` was the element and `enhanceDocument` never loaded the
  library (the frame's `__orzEnhance` threw and skipped it). Each library is
  now probed by its API (`mermaid.run`, `hljs.highlightElement`,
  `SmilesDrawer.parse`/`Drawer`, `Chart` a function,
  `OrzMarkdownRuntime.init`), never by its global's name.
- **`carrier/node` test gaps** (claim N.10; mutants of round 1 of the paged
  loop): the kit's own tests now catch a trimmed compare, a CR LF-blind
  compare, a `--replaces` token compared on a prefix, the raw (not stored)
  text compared against git, the last-writer gate dropped, and a written
  file's mode narrowed by the umask — each was caught only by orz-paged's
  suite before.
- Conformance harness: `C.save.conflict` waited a fixed 10 s for the
  "Download a copy instead" download and for "Replace it"'s write; a
  carrier's ~2 MB inline file under the load of a full run missed it once
  (orz-paged). The waits now scale with the file's size (10 s + 10 s per
  started MB, at most 2 min).

### Changed

- The app's own modules grew to 60.1 KB minified (bound 58 → 66 KB; added to
  an editor bundle: 74.5 KB, bound 74 → 82 KB; claim A.2).
- The conformance stub carrier (test scaffolding) exercises the new kit
  features: a "New document from sample…" submenu, a conditional Word count
  action, a block-valued Notes setting and a Line spacing reader choice.

## [2.2.0] - 2026-10-08

The carrier app and the kit gaps the orz-mdhtml 1.0 rebuild found (family
plan REBUILD §3a): a new entry, `orz-markdown/carrier/app` (the runtime of
every standalone assembled file), a theme list, in-page enhancement, the AI
review flow in the editor, and a save that no longer overwrites a file that
changed on disk. The parser's `md.render` output is unchanged. Additive for
`^2.1.0` consumers, except the behaviour changes listed under **Changed**
(see "Upgrading from 2.1.0" at the end). The pinned CodeMirror bundle
`vendor/codemirror6.js` has the same bytes as in 2.1.0 (only its URL moves to
`orz-markdown@2.2.0/vendor/codemirror6.js`).

### Added

**`orz-markdown/carrier/app`** (new entry; [spec/carrier-app.md](spec/carrier-app.md),
claims A.1–A.22) — the standalone assembled file's runtime every carrier
bundle runs, behind one seam, `StandaloneKind` (the kind supplies its
assemble, creation tool, `mountEditor`, read view, header settings and extra
actions; the app knows no kind).

- `startCarrier(kind)` sets `globalThis.OrzCarrier` (FC-19 §2) and boots in
  an assembled file: `readOpenedFile` (text, uid, format, delivery, includes,
  inline engine, file name), the read view, the chrome in a shadow root,
  edit mode, header settings with undo, the unsaved-changes
  warning (`beforeunload`, top level only, never for the update's reload),
  the host connection (save, include, AI with the review flow), the quiet
  update (read-only while it runs; reload only when the kit says so), reader
  preferences, the page keymap (respecting `defaultPrevented`) and the
  `OrzCarrier.standalone` handle (`CarrierApp`).
- **Non-disturbing reading** (owner, as in orz-mdhtml 0.9.3): the read view
  shows ONE control — a small round pencil at the bottom-left
  ("Edit and more"; semi-transparent at rest; dots for unsaved changes and
  an offered update). A click edits; hovering opens (with a short delay and
  a grace period on leave) the list of every operation: Edit, the kind's
  actions, Save, Download a copy, New document, Save as new copy, the kind's
  settings as submenus, its reader controls and, when offered, "Update to
  x.y.z" (Update now / What's new / Not now / Skip this version). A tap
  opens the list on touch screens; the keyboard follows the menu-button
  pattern (Tab reaches the pencil first, Enter edits, ArrowUp/ArrowDown or
  Space open the list, Escape closes it and returns the focus). The
  read-view top bar is gone (`handle.ts`, `mountHandle`, `HANDLE_CSS`;
  `CarrierApp.menu`).
- **Edit mode's brand** (owner): at the far end of edit mode's bar, quiet
  until hovered, the orz seal linking to https://markdown.orz.how and the
  GitHub mark linking to the kind's repository — `StandaloneKind.repo`
  (an `https://github.com/<owner>/<repo>` URL); `brand` now names the tool
  in that link's label. Not shown in the read view.
- **Reader controls**: `StandaloneKind.readerControls.fontScale`
  (`{ min, max, step }` in percent) adds a "Text size A− 100% A+" row to the
  list; the app sets `--orz-font-scale` on the read view's element, stores
  it per uid (the new `fontScale` reader preference) and restores it; it
  never marks the document unsaved nor enters the file
  (`CarrierApp.fontScale()` / `setFontScale()`).
- Also `bootCarrierApp`, `carrierGlobal`, `APP_CSS`, `captureEngineSource`
  (takes only the carrier's bundle — a script named like it, the file's
  `#orz-engine`, or the update sandbox's — else the release's CDN URL),
  `openedFileName`, `copyName`, the widgets (`menuButton`, `settingPicker`,
  `attachSettings`, `reviewProposal`, `attachAiMenu`, `followPresentation`,
  `WIDGET_CSS`), the messages `UPDATE_CONFLICT_MESSAGE` and
  `UPDATE_QUESTION_OPEN`, and a test seam (`AppServices`).
- Behaviour worth knowing: in edit mode Cmd/Ctrl+S anywhere in the page saves
  the editor (never "Save page as") and Cmd/Ctrl+E leaves edit mode;
  navigation keys on a chrome button reach the read view; presenting
  (`setChromeVisible(false)`) hides the handle, the bar and the editor and moves a keyboard
  focus to the page; every editor opened or attached during a quiet update is
  read-only and given back; a framed file whose host never connected asks
  before leaving with unsaved changes. The app hands ONE saver to the page
  and every editor, so whichever surface writes, the text written is marked
  saved; an attached editor's save becomes the page's text. An update
  started while a save-conflict question is open is refused (that question
  is focused); an update that finds the file changed on disk writes nothing
  and says so. File includes go through the kind's `fetchInclude`, never
  through `orz-host-include@1` (URLs only).

**`orz-markdown/themes`** (new entry; also on the main entry) — `THEMES`
(the bundled themes' ids, names and colour schemes), `DEFAULT_THEME`,
`isThemeId`, `themeInfo` (M.25).

**`orz-markdown/preview-frame`**

- `enhanceDocument(root, { scheme, assets, nonce, runtime })`: the preview
  frame's enhancement (highlight.js, Mermaid, SMILES, Chart.js, KaTeX's and
  highlight.js's stylesheets, the orz runtime) for content rendered in the
  page itself, loading only what the content needs; idempotent; each call
  destroys the Chart.js charts whose canvas left the root; a library that
  failed to load is retried after 15 s (doubled per failure), at most 3 times
  (`ENHANCE_RETRY_MS`, `ENHANCE_MAX_ATTEMPTS`) (M.24).
- `disposeEnhancement(root)` releases the remaining charts (M.26).
- `swapStylesheet(document, id, href, { nonce })` swaps a `<link id>` without
  a flash: the old sheet goes when the new one has loaded (M.27).

**`orz-markdown/carrier`** — header lint `unknown-theme` (warning, kind md):
a `theme` not in `THEMES`; the default theme is shown (K.10).

**`orz-markdown/carrier/shell`**

- The brand marks (`brand.ts`, V.7): `ORZ_SEAL_SVG` (the orz seal of
  orz-mdhtml 0.9.3, ids `orzlogo-*`), `GITHUB_MARK_SVG`, `brandMark(doc,
  name)` and `ORZ_MARKDOWN_SITE`. The reader preference `fontScale`
  (integer percent 25–400, default 100). The conformance harness finds the
  update offer in a carrier app's read view through `standalone.menu`.
- Save conflicts (S.14, spec/shell-runtime.md §1 step 3.4): with
  `openedHtml`, a save whose target file is an orz file of this document
  (same well-formed `uid`, or no uid on either side) and whose content
  (text, includes, delivery) is neither the opened content, this page's last
  write nor the text being saved writes nothing and returns
  `{ via: 'file', ok: false, error: 'conflict', conflict: true,
  conflictToken, … }`. `save(input, { overwrite: true, conflictToken })`
  then writes that file without a second picker. New saver options
  `readUid` (the page's header reader), `knownHtml()` (other bytes that
  count as "this page's") and `servedNotice` (S.15); `SaveCallOptions`,
  `headerUidOf`.
- The conflict question: `askSaveConflict(root, name?, { returnFocus?,
  opened? })` — an `alertdialog` titled "The file changed on disk" whose
  default (focused, primary) action is **Download a copy instead**;
  **Replace it (the version on disk is lost)** is second; Escape dismisses
  it (nothing written) and the focus returns. One question per saver:
  `answerSaveConflict({ saver, root, input, result? })`,
  `saveConflictOpen(saver)`, `focusSaveConflict(saver)`,
  `dropSaveConflict(saver, root?)`. Messages `SAVE_CONFLICT_TITLE`,
  `SAVE_CONFLICT_MESSAGE`, `SAVE_CONFLICT_PICKED_MESSAGE`,
  `SAVE_CONFLICT_LABELS`, `SAVE_CONFLICT_DOWNLOADED`, `SAVE_CONFLICT_STALE`.
- Chrome: `ICONS` gains `measure`, `new`, `copy`, `present`, `print`,
  `pageSize`; a kind's action may bring its own `KindIcon` (path data only,
  built as SVG elements: `anyIconElement`, `isKindIcon`,
  `KIND_ICON_MAX_PATHS`); at narrow widths only buttons with an icon drop
  their label (`orz-btn--has-icon`). `showToast` takes `actions` (with
  `autofocus`), `onDismiss`, `focus` and `title`; Escape dismisses a toast;
  `Toast` gains `focus()` and `setMessage()`. A toast with actions is a
  question (`role="alertdialog"`, outside the polite status region).
- Editor syntax tokens `--orz-chrome-syntax-*` (light and dark, ≥ 4.5:1 on
  the editor background) (E.27).

**`orz-markdown/carrier/editor`** (FC-19, additive)

- `proposeAi(op, { selection? })` and `applyAi(proposal, { proposed? })`: the
  review flow of host-protocols §4 — a proposal with its exact-text range,
  applied as one undoable edit, refused if the text changed. `requestAi` is
  unchanged. Types `AiProposal`, `AiProposalOutcome` (E.26).
- `createEditorShell({ nonce })` (FC-19 §3): the preview frame's (unless
  `preview.nonce` is given) and the default CodeMirror adapter's nonce.
- `shell.preview.setOptions({ articleClass })` (a measure change);
  `refreshPreview({ includes? })` replaces the include record, forgets
  fetched includes and renders even for an unchanged text (E.31); the
  `includes` and `fileName` options (FC-19 §3); `Editor.ready` documented.
- `renderMarkdownPreview(text, { includes, missingIncludes })` and
  `renderMarkdownPreviewWithIncludes(text, { includes, fetchInclude })` read
  an `#orz-includes` record (file includes through `includeRecordEnv`, a
  `readFile` on a virtual root; a file include the record lacks and URL
  includes through the host's `fetchInclude`); a missing record is an empty
  one. `includeRecordEnv` is exported.
- Unresolved file includes are visible (E.30): the preview and the md read
  view render "Included file not available: part.md"
  (`p.orz-include-missing`, `role="note"`, the directive kept in `data-md`;
  `missingIncludes: false` turns it off). `themes/common.css` dims it and
  hides it in print. `md.render` is unchanged.
- `ORZ_HIGHLIGHTER`: the kit's CodeMirror highlighter on the
  `--orz-chrome-syntax-*` tokens, so editor syntax colours follow the
  chrome's light or dark scheme (measured 5.97 / 6.44 : 1) (E.27).

**`orz-markdown/carrier/conformance`**

- Page helpers for a carrier's own tests (H.6): `initScript` (pickers incl.
  the OPFS one; page log `PAGE_LOG`), `readOpfs`, `writeOpfs`,
  `pageRecords`, `callPage`, the page-side sources, `FILE_ACCESS_FLAG`,
  `CODEMIRROR_URL`.
- New check `C.save.conflict` (H.5): an agent's edit on disk between two
  saves is asked about (text with and without uid, includes-only and
  delivery-only changes, a page save with no editor open, the same text in a
  newer shell, the quiet update, the save after "Download a copy instead", a
  revert, one question for a page save then its editor's save). It requires
  `OrzCarrier.standalone.save` and gets three times the per-check time limit.

### Changed

- **Saves ask before overwriting a changed file** (`carrier/shell`
  `createSaver` with `openedHtml`; S.14). In 2.1.0 such a save wrote
  silently; now it returns `conflict: true` and writes nothing until the
  caller answers (above). "Changed" compares content (text, resolved
  includes, delivery), not bytes: the same content in other bytes (CR LF,
  another or older shell) is no change, but the same content in a **newer
  shell** on disk (an agent's `upgrade`) is, unless this page wrote it; the
  opened bytes put back over this page's own save (a **revert**, through the
  session file or a remembered handle) is asked about too (`picked: false`).
  After **Download a copy instead** every later save asks again (the
  download's toast says so). **Replace it** replaces whatever is on disk when
  the reader answers.
- **One question per saver; overwrite needs its token.** While a question is
  open, a save of the page or of any editor of the file calls no saver (no
  second picker), focuses that question and makes it answer for the newest
  text; only the text actually written is marked saved; an editor's
  `destroy()` takes its question with it. `overwrite: true` writes only with
  the pending conflict's `conflictToken`; otherwise nothing is written and
  the result is `{ ok: false, error: 'stale-conflict' }`.
- **Served-page notice off for app pages** (S.15, E.28): the editor's own
  saver passes `servedNotice: false` unless it is an assembled file
  (`standalone: true` or `openedHtml`), so an app's editor without a save
  hook uses the picker, else a download. The notice now reads "This file was
  opened from a web address, so it cannot be saved over…".
- An app's editor assembles the opened bytes only at its first save (not at
  idle on every mount); a failed assembly is not memoized. Saves after
  `refreshPreview({ includes })` write the latest include record (none after
  `null`).
- **A read-only CodeMirror editor stays focusable and selectable** (state
  read-only, content `tabindex="0"`, `aria-readonly`), so selection, copy and
  Cmd/Ctrl+S work in it (FC-19 §5 invariant 7).
- `codemirror6Adapter` uses `ORZ_HIGHLIGHTER` instead of CodeMirror's
  `defaultHighlightStyle` (dark-scheme syntax colours).
- `renderMarkdownPreview` emits the "Included file not available" note for
  an unresolved file include (it rendered nothing).
- `sandboxDocument` puts nothing after the bundle in its `<script>`.
- Includes (main entry): `renderMarkdownPreviewWithIncludes` passes the
  render env to `prepareSources` as `includeEnv`, so a text with a live file
  include gets its URL includes too (they stayed directives); the include
  directive names are one list that `prepareSources` builds its patterns
  from; a URL scheme in any case (`HTTPS://`) is resolved, as the renderer
  already treated it as a URL.
- Conformance harness: the `C.update.*` checks count only bundle requests
  (any file of `<pkg>-browser@<version>/` but the manifest), so a file may
  load its own stylesheets (H.7); dialogs stay dismissed except a
  `beforeunload` where a check leaves a page it expects clean (H.8;
  `C.update.once-a-day` also asserts no dialog). The stub carrier is rebuilt
  on `carrier/app`.
- Chrome: the bar comes first in the page order after the islands, narrow
  pages get a top padding under it, and the edit-mode title follows the
  header `title`. A pointer's choice in a menu leaves the focus to the page.

### Accepted limits

- Replace it writes over whatever is on disk at the moment the reader
  answers, including a second outside write made while the question was
  open (the reader never sees the disk version either way).
- A document's scripts taking the keyboard focus in the preview remain an
  accepted limit (FC-19 §5).

### Upgrading from 2.1.0

Nothing is removed or renamed. The `overwrite`/`conflictToken`, `knownHtml`,
`readUid` and one-question-per-saver APIs changed during 2.2.0's development
but were never published, so they do not affect 2.1.0 users. What a 2.1.0
caller may notice:

- `createSaver` with `openedHtml` can now resolve `{ ok: false, conflict:
  true }` and write nothing; handle it (`answerSaveConflict`, or
  `askSaveConflict` and `save(input, { overwrite: true, conflictToken })`).
  Callers built on `carrier/app` or the editor shell get this for free.
- A conformance target must expose `OrzCarrier.standalone.save` to pass
  `C.save.conflict` (a carrier built on `carrier/app` does).
- Visual: the editor's syntax colours and the include note in the preview.

## [2.1.0] - 2026-10-06

The carrier kit: the shared building blocks the family's single-file carriers
(orz-mdhtml, orz-slides, orz-paged) are being rebuilt on (family decisions
FD-03, FD-05–07). It extends `orz-markdown/carrier`, adds four entry points
(`carrier/read`, `carrier/shell`, `carrier/editor`, `carrier/conformance`),
and adds the binding specs in `spec/`. The parser's output is unchanged for
existing documents, with one exception: a `{{nyml}}` block whose kind is
`document` now renders nothing (below). Additive for `^2.0.0` consumers.

### Added

**Specifications (`spec/`)** — binding, owned here:
[FC-18](spec/FC-18-text-format-1.md) (text form and assembly, format 1),
[FC-19](spec/FC-19-editor-component.md) (editor component API; §8 the shared
editor shell), [host protocols](spec/host-protocols.md) (FC-12, canonical;
moved from orz-mdhtml's `PROTOCOL.md`, with the kind registry
`md`/`slides`/`paged`/`poster`, both sides' security rules and format-1 saves:
`source` is the exact text twin), [shell runtime](spec/shell-runtime.md)
(FC-11: save order, reader preferences, release manifest, quiet update,
chrome) and [conformance](spec/conformance.md) (implementation note). The
golden corpus of format-1 texts, `tests/carrier-corpus/`, is now shipped in
the package (the conformance harness's default corpus).

**Main entry**

- `createMarkdown()` builds a markdown-it instance configured like the shared
  `md` (the `{{name}}` plugin registry stays global).
- `docMetaFromFields(fields)` (also from `orz-markdown/doc-meta`): DocMeta
  from a flat nyml field map; values trimmed, empty ones omitted.
- `scanNymlBlocks(source, tokens?)` accepts the tokens of a parse the caller
  already has.

**`orz-markdown/carrier` — the kit core (FC-18).** Browser-safe; it now loads
the parser and parses with a private instance from `createMarkdown()`, so a
host's `md.set()`/`md.use()` cannot change assembled bytes. Importing it
registers the twin-link rule on the shared `md` (inert unless a render's env
sets `orzTwinLinks: true`).

- Header: `readHeader`, `editHeader` (several sets, removes and `key: |`
  multi-line values in one in-place pass; the header is never
  re-serialized), `setHeaderValue`, `removeHeaderKey`, `withoutHeader` (the
  body a carrier renders, with its offset), `lintHeader` (findings with
  `line`/`from`/`to`), `Header.entries`, and the key registry
  (`COMMON_HEADER_KEYS`, `KIND_HEADER_KEYS`, `WRITER_KEY`, `UID_PATTERN`). A
  legacy `kind: meta` header is upgraded to `kind: document` on the first
  edit. Lint codes include `closer-in-value`, `closer-not-alone`,
  `opener-not-alone`, `stray-document-block`, `front-matter`, `bad-lang`,
  `bad-measure`, `bad-ratio`, `nul`, `lone-surrogate`, `mixed-eol`,
  `ignored-line` and `kind-case`.
- Document: `readDocument` (kind, format, DocMeta with `uid`, theme, lang,
  settings with `measure`/`ratio` defaults, host keys, derived title, lint),
  `kindFromFilename`, `twinName`, `mintUid` (the kit's only randomness).
- Links: `twinHref`, `registerTwinLinks` — a relative Markdown link to a
  text twin (`week2.slides.md`) renders as a link to the assembled twin
  (`week2.slides.html`) when `env.orzTwinLinks === true`.
- Envelope: `assembleEnvelope` (deterministic; `ShellParts.delivery`
  optional, default `inline`; resolved `includes` stored in
  `#orz-includes`), `extract` (returns `includes`; also reads a file whose
  line endings were converted to CR LF), `readIslandFromDom`, `skillUrl`,
  `eolStyle`, `hasMixedEol`, `hasLoneSurrogate`, `decodeText(bytes,
  { fatal })` (UTF-8, keeping the BOM that `File.text()` strips), the island
  ids, `KIND_PACKAGE`, and the `DocMeta`/`DocLicense` types. The source
  island stores the text with LF line breaks and records `data-orz-eol` /
  `data-orz-bom`, so `extract` and a DOM read give back the text byte for
  byte.

**`orz-markdown/carrier/read`** — the parser-free reading entry (`extract`,
`readIslandFromDom`, `decodeText`, `KIND_PACKAGE`, the escape helpers; under
30 KB minified).

**`orz-markdown/carrier/shell`** — the browser runtime of every assembled
file (spec/shell-runtime.md, spec/host-protocols.md). Parser-free and safe to
import in Node; not re-exported by `orz-markdown/carrier`.

- `createSaver({ uid, suggestedName, kind, host, openedHtml })` — saves the
  HTML the caller assembled (never the live DOM) in the order connected host
  → served-page notice → File System Access → download. A file handle is
  remembered in IndexedDB under the header `uid` and the page location, and
  reused without a prompt only on that page and only when the file's content
  proves it is the opened file (`openedHtml`, or what this page last wrote
  through it; the record keeps the SHA-256 of the last write). Names prove
  nothing: a copy, or a same-named file in another folder, gets the picker.
  The result says what happened (`picked`, `name`, `opened` for a file;
  `confirmed: false` for a download; `cancelled` for a cancelled picker).
- `createPreferenceStore(uid, storage)` — typed, validated reader
  preferences (`splitRatio`, `scrollSync`, `viewMode`, `editorFontSize`,
  `darkChrome`), namespaced by `uid`, failing closed to defaults.
- `connectHost` (file side) and `embedCarrierFrame` (host side) for
  `orz-host-save@1`, `orz-host-ai@1` and `orz-host-include@1`, with the
  shared message constants and types; wire-compatible with version 1.
- Quiet update (FD-05): every `orz-<x>-browser` package publishes
  `release.json` (`kind`, `version`, `formats`, `notes`, `bundle.path`,
  `bundle.integrity`); URLs are hard-coded jsDelivr patterns over
  `KIND_PACKAGE`, never taken from a document. `checkForUpdate({ kind,
  current, format })` asks at most once a day per kind, is silent on any
  failure, never offers a prerelease or a release that cannot read the
  document's format, honours `skipVersion`, and does not run in a framed
  page, with a connected host, or on a served page (unless `servedPages:
  true`). `reassemble` verifies the bundle's SHA-384 and that it is
  script-safe (no CR), runs the release's `OrzCarrier.assemble` in a hidden
  `sandbox="allow-scripts"` iframe, and accepts the file only when `extract`
  gives back exactly the text, kind, version, delivery and includes.
  `performUpdate` composes check → reassemble → save, re-reads the text
  before saving (an edit meanwhile refuses with `changed`) and returns
  `reload` only when the save provably wrote the opened file or the host
  acknowledged. Also `UpdateError`, `parseManifest`, `manifestUrl`,
  `bundleUrl`, `isBundlePath`, `isScriptSafe`, `sha384Integrity`,
  `compareSemver`.
- `mountUpdateIndicator(anchor, info, { onUpdate, onLater, onSkip })` — a
  small chip with a non-modal, keyboard-operable popover (Update now / Not
  now / Skip this version, "What's new").
- Chrome: `CHROME_CSS` (OKLCH tokens, light/dark by `prefers-color-scheme`
  and `data-chrome`, focus rings, reduced motion), `ICONS` (12 inline SVGs),
  `createShadowRoot`, `showToast` (polite live region).

**`orz-markdown/carrier/editor`** — the editor shell every carrier's
`mountEditor` wraps (FC-19 §8; FC-19 §2 defines the bundle global
`globalThis.OrzCarrier = { kind, version, formats, assemble, extract,
readDocument, mountEditor, … }`).

- `createEditorShell(element, { text, render, … })`: toolbar, editor and
  preview in one shadow root (`CHROME_CSS` + `EDITOR_CSS`); split / editor /
  preview modes (`setMode`, Cmd/Ctrl+\); a draggable, keyboard-operable
  split; Cmd/Ctrl+S saves, Esc leaves the editor; one pane below 640 px of
  the shell's own width; `compact` toolbar.
- The exact text: `getText()` is the given text byte for byte until edited
  (CR LF, CR, BOM, mixed line endings) and keeps the BOM and line-ending
  style after edits; `setText` (undoable by default), `setHeader(changes)`
  (one undoable `editHeader`), `isDirty` / `markSaved`, `undo` / `redo`,
  events `change` / `dirty` / `selection` / `save` / `error`.
- Save: `hooks.save(text)` in an app, else `assemble(text)` + `createSaver`
  (options `standalone`, `openedHtml`); `save()` resolves a `SaveOutcome`
  and never rejects; dirty clears only on success.
- The FC-19 §3 hooks: `fetchInclude` / `resolveAsset` (passed to
  `render(text, ctx)`), `resolveLink` for preview clicks, `uploadAsset` on
  paste and drop, `requestAi`, `ensureUid` (with `mintUid`), `uploadAssets`.
  `formats`: a newer text format opens read-only and is never saved.
  `setReadOnly` / `isReadOnly`. Reader preferences through
  `createPreferenceStore`.
- Preview: the carrier's `render(text)` (md: `renderMarkdownPreview`, which
  stamps `data-src-line` and rewrites twin links;
  `renderMarkdownPreviewWithIncludes` for URL includes through
  `ctx.fetchInclude`) in a sandboxed iframe, incremental (unchanged blocks
  and drawings kept), paced by the frame's acknowledgement
  (`max(debounceMs, 2 × last render)` while idle, at least every
  `max(1 s, 4 × render)` while typing), with scroll sync on the line
  anchors. Pluggable for a carrier's own frame (`frameDocument`, `bridge`,
  `diff: false`, `mode: 'navigate'`, `mapLine` / `mapPosition`, page hooks
  `__orzPreviewApply`, `__orzPreviewNavigate`, `__orzPreviewMessage`,
  `__orzPreview.report` / `.navigated`), `shell.preview` (`post`, `on`,
  `setOptions({ head, scheme })`), `preview.nonce`, `PREVIEW_BRIDGE_HASH`,
  `previewScriptHashes`, `PREVIEW_SECRET_ATTRIBUTE`,
  `PreviewFrameOptions.secret`; a notice and `error` when the frame never
  starts. A link clicked in the preview opens through `onLink` or, by
  default, from a chip the reader clicks ("Open <host>?"), never by itself.
- Preview isolation (FC-19 §5 invariant 3, §8.4): `previewSandbox()` is the
  one place the sandbox is decided — `allow-scripts` with an opaque origin.
  The bridge talks to the shell only over a private MessageChannel port,
  handed once per load and only for a ready message that carries the
  frame's secret (`data-orz-preview-secret` on the bridge's own `<script>`,
  read and removed first thing); keys, links, input and scrolls act only
  through that port and only from trusted events. A forged or second ready,
  or a document that replaced the bridge's (`document.open()`, a navigation,
  a meta refresh, a nested frame), gets nothing.
- Engines behind `TextEditorAdapter`: `codemirror6Adapter({ nonce,
  loadModules })` (markdown mode, wrapping, history, search) — editable at
  once as a textarea, upgraded when CodeMirror loads, kept as a textarea
  when it cannot — and `textareaAdapter()`.
- CodeMirror 6 is ONE pinned bundle shipped in the package,
  `vendor/codemirror6.js` (`@codemirror/state` 6.7.6, view 6.43.13,
  commands 6.11.1, language 6.12.4, lang-markdown 6.5.2, search 6.7.2; built
  by `npm run build:codemirror`), loaded from
  `https://cdn.jsdelivr.net/npm/orz-markdown@2.1.0/vendor/codemirror6.js`
  with Subresource Integrity (`CODEMIRROR6_URL`, `CODEMIRROR6_INTEGRITY`).
  Per-package `+esm` URLs are not used: they resolve `@codemirror/state` to
  different versions, which CodeMirror refuses.

**`orz-markdown/carrier/conformance`** — the Node-side harness each carrier
runs against itself (spec/conformance.md): `runConformance(target, options)`
→ `ConformanceReport`, `registerConformance({ describe, it, beforeAll,
afterAll }, target, options)` (one test per check plus a final
`[conformant]` test that fails on any skipped check unless `allowSkips`),
`openConformance`, `isConformant`, and `CHECKS` — 45 checks with stable ids
(`C.law.*`, `C.bundle.*`, `C.create.*`, `C.edit.*`, `C.save.*`,
`C.update.*`, `C.host.*`, `C.prefs.*`) over the FC-18 laws, the bundle rule
and `release.json`, create, edit (CodeMirror and the textarea fallback,
read-only newer formats, preview isolation), the save routes, the quiet
update (tampered, re-signed and version-lying releases, offline, an edit
during the update), the host handshakes and reader preferences. Checks run
in real Chrome on closed networks where only the release's jsDelivr URLs are
answered, side by side in `lanes` (default 3), each in browser contexts of
its own. `conformant` is true only when every check ran and passed
(`partial: true` otherwise). `playwright-core` is an optional peer
dependency, loaded only when a browser check runs.

### Changed

- A `{{nyml}}` block whose kind is `document` (the FC-18 document header)
  renders nothing and takes no `nyml-data` number. A renderer of a
  format-1 text renders `withoutHeader(text).body`: the shared `md` still
  renders a legacy `kind: meta` block as a data island.
- The nyml reader treats U+2028 and U+2029 as ordinary characters: only LF,
  CR LF and CR end a line (a value holding them was silently dropped).
- A nyml key named `__proto__` is kept as data (it was dropped).
- `extractDocMeta` trims values; a value that is empty after trimming is
  absent (through the shared `docMetaFromFields`).
- `@types/markdown-it` is a dependency (the published types expose it).

### Fixed

- HTML scanners lowered a whole document with `toLowerCase()` and used its
  offsets on the original: a `İ` (or another length-changing case mapping)
  before an island shifted every offset, so `parseDocMetaIsland` missed the
  island. Case mapping for HTML is now ASCII-only (`src/ascii.ts`).

### Security

- Assembled files update themselves only from hard-coded jsDelivr URLs, after
  verifying the bundle's SHA-384 and that it is script-safe, in an
  opaque-origin sandbox, and only when the re-assembled file gives back
  exactly the same text (see `carrier/shell` above).
- The editor preview runs a document's scripts in an opaque-origin sandbox
  with no host access, and nothing a document's scripts send can save,
  switch views, open links or windows, or scroll the editor (see
  `carrier/editor` above).

### Accepted limits

- **Keyboard focus in the preview.** A document's own scripts may take the
  keyboard focus inside the preview, so keys can go there instead of the
  editor. Documents are trusted content (claim M.21); they still cannot
  save, switch views, open links or scroll the editor. No focus-theft
  detection is attempted (owner decision 2026-10-06, FC-19 §5 invariant 3).
- **Same-origin preview for a standalone `file:` page.** When an assembled
  file is opened from disk as a top-level page with no host, the preview
  frame also gets `allow-same-origin`, so the document's relative local
  images show (owner decision B-2, FC-19 §8.4). Never in a framed, hosted or
  served page.

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
