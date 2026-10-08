# Carrier conformance harness

**Status:** implementation note for `orz-markdown/carrier/conformance`
(`src/carrier/conformance/`), the test tool every carrier (orz-mdhtml,
orz-slides, orz-paged) runs against itself (orz rebuild Phase 2, "conformance";
FC-19 §6). It checks the binding specs — [FC-18](FC-18-text-format-1.md),
[FC-19](FC-19-editor-component.md), [shell runtime](shell-runtime.md),
[host protocols](host-protocols.md) — it does not add to them. Where it needs
something the specs leave open, §5 says what it assumes. Claims H.1–H.5 in
`notes/CLAIMS.md`; proved against a stub carrier, and against broken builds of
it, in `tests/conformance.test.ts`.

## 1. Running it

Node ≥ 20.16, `playwright-core` (an optional peer dependency of
orz-markdown; install it in the carrier's devDependencies) and an installed
Chrome. In a vitest suite:

```ts
import { describe, it, beforeAll, afterAll } from 'vitest';
import { registerConformance } from 'orz-markdown/carrier/conformance';

registerConformance({ describe, it, beforeAll, afterAll }, async () => ({
  kind: 'md',
  version: pkg.version,                       // = release.json version = OrzCarrier.version
  bundle: 'dist/orz-mdhtml.browser.js',       // the script-safe browser bundle
  release: 'release.json',                    // its manifest (spec/shell-runtime.md §6)
  assemble: (text, o) => assemble(text, o),   // the carrier's Node assemble (FC-19 §2)
  create: () => newDocument(),                // the carrier's creation tool
  next: await buildWithVersion(bumpPatch(pkg.version)),   // { bundle, release } of a higher version
  previous: lastPublishedRelease(),           // optional { bundle, release }
}), { title: 'orz-mdhtml conformance' });
```

One test per check, titled `[<check id>] <title>`, then a final test titled
`[conformant] …` that fails unless every check of `CHECK_IDS` ran and passed
(or is not applicable, below) — a skipped check, a check deselected by
`only`/`skip` or a test filter all fail it; `allowSkips: true` lets it pass a
browserless or partial run (it still fails on a failed check). Elsewhere,
`runConformance(target, options)` returns a `ConformanceReport`
(`{ kind, version, harness, conformant, partial, passed, failed, skipped,
notApplicable, results }`; each result `{ id, title, status, message?,
failures?, durationMs }`, status `passed` / `failed` / `skipped` /
`not-applicable`) and never throws for a failing check; `isConformant(results)`
is the same verdict; `openConformance` opens a session whose `run(id)` runs
one check and `schedule(ids)` runs several side by side. Checks run in
`lanes` lanes (default 3; `1` runs them one after another), each in browser
contexts of its own that are closed when it ends; the timing-sensitive
`EXCLUSIVE_CHECKS` (`C.edit.preview-isolation`) run first and alone. Options:
`browser` (a launched Playwright browser, not closed by the harness; launch it
with `--allow-file-access-from-files`, or `C.save.copy-elsewhere` launches a
Chrome of its own), `channel` (default `chrome`), `only` / `skip` (check ids),
`corpus` (a directory with the corpus `manifest.json` layout, a `{ name: text
}` record, or `false`; default the package's `tests/carrier-corpus`, filtered
to the kind), `checkTimeoutMs` (default 120 s), `lanes`, `log`, `allowSkips`.

### The target

| Field | Meaning |
|---|---|
| `kind`, `version` | the carrier kind and its shell version |
| `bundle`, `release` | paths of the browser bundle and its `release.json` |
| `assemble(text, { delivery?, engineSource?, includes? })` | the Node `assemble`; with no `engineSource` an inline file carries this release's bundle; `includes` are written to `#orz-includes` as given (FC-19 §2) |
| `create()` | a new document text, as "New document" makes it |
| `samples?` | extra texts (kind-specific constructs) for the law checks |
| `protocols?` | `{ ai?, include? }`: which optional host protocols the file speaks (default both); a declined one must never be answered |
| `editor?` | page-side function source `(text) => Editor` that puts the opened file in edit mode and returns its FC-19 `Editor` (default: `OrzCarrier.mountEditor` on a new element in `<body>`) |
| `next?` | a release of the same carrier with a higher version — usually this build again with the patch number bumped. Without it the update checks are skipped |
| `previous?` | an older release whose files must update to this one exactly |
| `firstRelease?` | `true` for a carrier's first release: there is no `previous`, and `C.update.from-previous` is `not-applicable` (without it, a missing `previous` is a skip) |

### Page helpers for a carrier's own tests (2.2.0)

The harness's page machinery is exported for a carrier's own browser tests
(its standalone file: save in place, New document, Save as new copy, the
update): `initScript(picker)` (`'stub'` / `'opfs'` / `'none'` / `'native'`;
dialogs, errors, picks and writes recorded in the page log `PAGE_LOG`,
`window.__orzConformanceLog`, also without the harness's binding),
`readOpfs(page, { name, pathname?, folder? })`, `writeOpfs(page, place,
data)` (the opened file "on disk" in the page's folder), `pageRecords(page,
type?)`, `callPage`, the page-side sources (`OPFS_FOLDER`, `READ_OPFS`,
`WRITE_OPFS`, `PAGE_HELPERS`, `DEFAULT_EDITOR_DRIVER`, `mountEditorScript`,
`HOST_PAGE`) and `FILE_ACCESS_FLAG`, `CODEMIRROR_URL` (claim H.6).

## 2. What "conformant" means

`conformant: true` — **every** check of `CHECK_IDS` ran and passed, or is
`not-applicable` for its declared case: none failed, none was skipped and none
was left out. A run with `only` or `skip` is `partial: true` and never
conformant, whatever its results; a run without Chrome or without `next` is
not a conformance result either (the Node checks still report).
`not-applicable` exists for exactly one declared case today:
`C.update.from-previous` when the target says `firstRelease: true`; it counts
as satisfied only then. A carrier's own claims cite check ids; a Phase 3
release requires a conformant run (REBUILD.md Phase 3 exit), i.e. a green
final `[conformant]` test without `allowSkips`.

## 3. The environment

- Two local HTTP origins (a host page origin and a file origin) and a
  temporary directory for `file:` pages; every check gets fresh browser
  contexts of its own (storage, IndexedDB and the origin-private file system
  are per context), so checks running side by side share nothing but the
  browser process and the read-only releases.
- **The network is closed.** The only external URLs answered are the
  hard-coded jsDelivr URLs of the kind's release
  (`https://cdn.jsdelivr.net/npm/<pkg>-browser@latest/release.json` and
  `…@<version>/<bundle.path>`, spec/shell-runtime.md §6), served from the
  target, `next` and `previous` (and releases the harness derives from
  `next`: re-signed, version-lying, prerelease) — so the update runs against
  its real URLs — and the pinned CodeMirror 6 bundle at its jsDelivr URL
  (`orz-markdown@<version>/vendor/codemirror6.js`, served from this package),
  so the editor checks run with CodeMirror loaded; `C.edit.exact` runs once
  more with that URL unreachable (the textarea fallback). A file that fetches
  anything else (fonts, preview libraries, its theme) gets a network error,
  as offline. Where an update check requires "no bundle request" it counts
  only requests for the kind's release package — any file of
  `<pkg>-browser@<any version>/` but the manifest — so a file may load its
  own resources, and none of its bundle before the reader asks for the
  update (2.2.0; before, every request but the manifest counted; claim H.7).
- **Dialogs** are recorded and dismissed — a dismissed `beforeunload` keeps
  the page, so a file that asks before an unsaved page goes is never left
  behind by accident. Where a check leaves a page it expects clean on
  purpose (a reload: `C.update.once-a-day`), it accepts a `beforeunload` so
  the navigation goes on, and the dialog is still recorded, so the check's
  "no dialog" expectation reports a file that asks on a clean page
  (2.2.0, `CheckContext.leave`; claim H.8).
- An init script in every frame records `alert`/`confirm`/`prompt`/
  `showModal`, uncaught errors (console errors are recorded too) and, per
  check, replaces `showSaveFilePicker` with a recording stub (an in-memory
  file per picked name: `getFile()` gives what was written last, a new file
  is empty), removes it, or (`opfs`, for `C.save.copy-elsewhere` and
  `C.save.save-as-elsewhere`) replaces it with a recording function returning
  a **real** `FileSystemFileHandle` from the origin-private file system, one
  folder per page path — IndexedDB, the handle's structured clone,
  permissions, reads and writes are then real. That folder stands for the
  page's folder on disk: the harness puts the opened file there with the
  bytes the page loaded, and copies what a save wrote there back to the
  `file:` page's file before reopening it. A picker that opens in another
  folder (the real one remembers the last folder used) is played by setting
  `window.__orzConformancePickIn = { folder }` before the save. Chrome allows
  the origin-private file system on `file:` pages only with
  `--allow-file-access-from-files`. Downloads are captured.
- The editor is driven through FC-19 §4 (`getText`, `setText`, `setHeader`,
  `undo`, `isDirty`, `markSaved`, `save`, `setMode`, `focus`; `setHeader` and
  `undo` are required) plus, when present, `getMode` and `setSplitRatio`;
  typing goes through the keyboard. A script in the preview frame is played
  by Playwright evaluating in that frame (a page script: no user activation),
  except the focus thief and the replaced previews of
  `C.edit.preview-isolation`, which are the document's own (an image error
  handler, a nested frame or a meta refresh in the text): keys the reader
  types into the frame give it user activation. Update UI is found by its spec names: a button named
  `Update available: <version>`, then `Update now` (busy: `Updating…`).

## 4. Checks

| Id | Where | Proves |
|---|---|---|
| `C.law.round-trip` | Node | FC-18 law 1: `extract(assemble(T)).text === T` for every corpus, hazard and sample text with cdn delivery, and inline for the hazards, the samples and the first two corpus texts (an inline file carries the whole bundle; the text-derived parts do not depend on the delivery); extract's kind, format, shell, delivery |
| `C.law.determinism` | Node + Chrome | law 2: two Node assemblies equal (inline for the inline set above, cdn for the rest); Node inline without `engineSource` equals Node with this bundle; one Node assembly with `Date` moved 7 years ahead (synchronously: an async `assemble` runs only its synchronous part so) equals the usual one; the bundle's `assemble` in Chrome gives the Node bytes (inline for the inline set, cdn for all), also in a page whose clock is moved 7 years ahead |
| `C.law.idempotence` | Node | law 3: `assemble(extract(F).text) === F` (deliveries as `C.law.round-trip`) |
| `C.law.eol-bom` | Node + Chrome | CR LF, CR, BOM: `data-orz-eol`/`data-orz-bom` right; the DOM island, `OrzCarrier.extract` of the opened page and a mounted editor give back the exact text |
| `C.law.content-independence` | Node (+ Chrome with previous/next) | law 4 / FD-03: lang, title, head metadata, `#orz-meta`, island and `#orz-includes` are exactly the kit `assembleEnvelope`'s; equal across the given shells, as is `renderPreview` |
| `C.law.refusals` | Node + Chrome | NUL, a lone surrogate, header `format: 2` are refused — by the Node `assemble` and by the bundle's in Chrome (cdn and inline) |
| `C.bundle.script-safe` | Node | no `<script`/`</script` (any case, after backslashes), `escapeScriptText` leaves it unchanged, strict UTF-8, no CR, no NUL |
| `C.bundle.global` | Chrome | `OrzCarrier` `{ kind, version, formats ∋ 1, assemble, extract, readDocument, mountEditor, renderPreview? }`; `formats` equals `release.json`'s and the bundle assembles a text of every format it lists; `extract`/`readDocument` agree with the kit; `assemble` runs in a `sandbox="allow-scripts"` frame from the bundle alone and gives the Node bytes |
| `C.bundle.release` | Node | `release.json` valid (`parseManifest`), kind and version match, `formats ∋ 1`, `bundle.path` names the bundle, integrity = SHA-384 of its bytes, `notes` https |
| `C.create.header` | Node | header first (`{{nyml` / `kind: document`), lint-clean, `carrier: <kind>`, a fresh `uid` `doc-[0-9a-z]{16}` per document |
| `C.create.newest-shell` | Node | generator `orz-<kind> <version>`, `#orz-shell` = `{"kind","format":1,"shell":version,"delivery":"inline"}` |
| `C.create.island` | Node | one `#orz-src` (`text/markdown`), `data-orz-format="1"`, `data-orz-eol`, `data-orz-bom` for LF, CR LF + BOM and CR forms; one `#orz-shell` |
| `C.create.meta` | Node | head metadata and `#orz-meta` equal the kit's, unchanged by body edits, following header edits (a title that differs from the body's first heading, author, keywords: still the kit's); no file or user fields |
| `C.edit.exact` | Chrome | the opened file mounts with the exact text, clean; typing inserts exactly what was typed, a line break in the document's style, BOM kept; dirty; undo back to the exact original is clean; `setText`/`markSaved` — once with CodeMirror served, once with it unreachable (textarea fallback) |
| `C.edit.set-header` | Chrome | `setHeader` and `undo` exist (FC-19 §4; their absence fails); `setHeader` = the kit's `editHeader`, one undo restores, `}}` refused without change |
| `C.edit.newer-format` | Chrome | the target's editor driver given a text with header `format: 2` (D7, FC-18 §8.4): exact text shown; typing, `save()`, Mod+S and an app's `setText` then `save()` change and write nothing — no picker, write or download, not dirty |
| `C.edit.preview-isolation` | Chrome | an app host (a page of its own origin that loaded the bundle, `mountEditor` with `hooks.save` and a recording `hooks.resolveLink`): every preview iframe's `sandbox` is exactly `allow-scripts`; a script in the preview reads no host document, `localStorage` or cookie and has origin `null`; for 9 s it forges readies (plain, with a channel, with a guessed secret), save keys, view keys, Escapes, `orz-preview-active` / `-scrolled` messages, links, synthetic link clicks and `window.open`: with nobody touching the page nothing is saved; while the reader types at the end of a long text every keystroke lands, the editor stays scrolled to the caret and nothing is saved; no page opens, no forged URL is requested, no link reaches the host or is offered to open (the shell's chip), and the view never changes (the preview or the editor hidden). Then, each in a page of its own and with the same requirements (no save, no link reaching the host or offered, no view change, no page, no forged request, no dialog): a document whose preview runs a focus thief (an input it focuses every 40 ms; on every key it receives it forges a save key, the view key, Escape, "active", a link and a popup, within the activation the key gives) while the reader clicks the editor and types — the keys may go to the preview (the accepted limit, FC-19 §5 invariant 3), and the focus need not come back; previews replaced or nested by their own document (a nested `<iframe srcdoc>` that steals the focus and posts forged readies, keys and links to the top; `document.open()` then a script asking for the port; a meta refresh to an http page of the harness's other origin and to a `data:` URL running it, each asking for the port every 250 ms and sending a save, the view key, Escape, a link and a scroll through any port it gets) — none may get a port; and a tab switch round trip (the reader clicks into the preview, another tab comes to the front and goes back, twice): the preview is the same frame, with no pausing policy, no pause note and no `error`, Cmd/Ctrl+S pressed in it saves once and an edit still shows in it. (A preview that never runs the document's handlers is checked the same way.) Runs alone |
| `C.edit.app-host` | Chrome | an app host with a newer release advertised: three editors mounted with `hooks.save` (one `readOnly: true`); the page's own elements keep their computed styles and the page gets no style sheet; `save()` after `setText` of a CR LF + BOM text calls that editor's `hooks.save` once with the exact text, outcome `{ ok: true, via: 'hook' }`, clean, nothing picked, written or downloaded; undo on each of two editors restores its own text and leaves the other's; a `save()` whose hook takes 800 ms, with a `setText` 200 ms in: the hook gets the text of the moment `save()` was called and the editor stays dirty (the edit was not saved); typing, Mod+S (focus in the read-only editor's own controls) and `save()` in the read-only one change and save nothing; no manifest request, no indicator |
| `C.save.served-notice` | Chrome | served page: `#orz-served-note`, no picker, no write, no download, still dirty; in split mode every preview iframe's `sandbox` is exactly `allow-scripts` (the `allow-same-origin` exception is a standalone `file:` page's, FC-19) |
| `C.save.file-system-access` | Chrome | `file:` page with a picker: one picker, the written bytes = Node `assemble(text)` (never the live DOM — a marker in the page must not appear), clean; the second save reuses the handle (the file still holds what the first wrote) |
| `C.save.copy-elsewhere` | Chrome | real handles (`opfs` picker; each page's folder holds its opened file): the original (folder A) saves through a picker; a same-named copy with the same uid in folder B gets its own picker and leaves A's file as it was; the original reopened (it loads what was saved) saves without a picker into A, leaving B's |
| `C.save.save-as-elsewhere` | Chrome | real handles: the original's first save meets a picker that opened in a Downloads folder and is accepted with the same name — Downloads gets `assemble(text)`, the original file is unchanged; the original reopened (still the opened text) and saved gets the picker again (the remembered handle is not the opened file: a name proves nothing), the reader picks the original, which gets `assemble(text)`, and the Downloads file is never overwritten |
| `C.save.conflict` | Chrome | real handles (`opfs` picker; the page's folder holds its opened file): the first save writes `assemble(text)`; an agent then writes another assembled text into the file; the next save resolves `{ ok: false, conflict: true }`, writes nothing and downloads nothing, the editor stays dirty; the kit's question (`askSaveConflict`) is answered with **Replace it**: the file gets `assemble(text)` with no further picker and the editor is clean; the agent writes again, the next save conflicts again and **Download a copy instead** downloads `assemble(text)`, leaves the agent's file as it is and the editor dirty (round 2 of the carrier-app loop; spec/shell-runtime.md §1 step 3.4) |
| `C.save.download` | Chrome | no picker: one download = Node `assemble(text)`, named exactly as the opened file, clean |
| `C.save.keeps-delivery` | Chrome | a `cdn`-delivery file on a `file:` page, edited and saved: it writes exactly Node `assemble(text, { delivery: 'cdn' })` — a save keeps the file's delivery (round 3, B#7) |
| `C.save.keeps-includes` | Chrome | Node `assemble(INCLUDE_TEXT, { includes })` must write exactly those includes in `#orz-includes` (`AssembleOptions.includes`); that file on a `file:` page, edited and saved: it writes exactly Node `assemble(text, { includes })` with the file's includes (a page cannot resolve them again; FC-18 §8.3 D4) |
| `C.update.indicator` | Chrome | a file of this release, `next` advertised: the `Update available` button appears; focus stays on the harness's input; no node added except the indicator, none removed, no `inert`/`aria-hidden`/`hidden` change, no modal, no dialog, island and title unchanged; one manifest request, no bundle request |
| `C.update.reassemble` | Chrome | Update now writes exactly `next`'s `assemble(text)` (Chrome, its own `engineSource`); extract gives the text, shell `next.version`; one write through the picker and no download (in place, not a copy); the picker's file was new, so nothing proved it to be the opened file: the page is not reloaded |
| `C.update.edit-during` | Chrome | the editor mounted, Update now while `next`'s bundle download is held, `setText` meanwhile: when the editor took the edit, nothing is written or downloaded, the page is not reloaded, the edit stays and the refusal is announced (`aria-live`); when the editor refused it (kept read-only while updating), whatever is saved carries exactly the editor's text; either way, once the update settled (no reload) the reader's typing reaches the text again — the editor was not left read-only |
| `C.update.other-format` | Chrome | `next` re-announced with `formats: [987]`: the manifest is fetched, no indicator, no bundle request |
| `C.update.tampered` | Chrome | the bundle served with one byte more: nothing written or downloaded, the island unchanged, the refusal announced (`aria-live`), no dialog |
| `C.update.offline` | Chrome | manifest unreachable: no indicator, no dialog, no uncaught error, no console error but the browser's own `Failed to load resource` line, nothing written, no modal |
| `C.update.from-previous` | Chrome | a file of `previous` updates to exactly this release's Node `assemble(text)`; the written file, opened, gives back the text, and its editor saves exactly this release's `assemble` of an edit; `not-applicable` for a target with `firstRelease: true` |
| `C.update.resigned` | Chrome | `next` with an appended snippet that alters the text in `assemble`, re-signed (integrity recomputed), and `next`'s bytes announced as a higher version: each is refused — nothing written or downloaded, the island unchanged, the refusal announced, no dialog |
| `C.update.prerelease` | Chrome | `next` announced as `<version>-rc.1`: the manifest is fetched, no indicator appears, no bundle is requested |
| `C.update.once-a-day` | Chrome | `next` advertised: the indicator appears on open, after a reload and in a second file of the kind, with one manifest request in all; the clean page asks nothing when it is reloaded (no dialog) |
| `C.update.hosted` | Chrome | a file in a host page that completed `orz-host-save@1`, `next` advertised: no manifest request, no indicator in the frame |
| `C.update.cdn-delivery` | Chrome | a `cdn`-delivery file (its bundle from the jsDelivr URL): Update now writes exactly `next`'s Chrome `assemble(text, { delivery: 'cdn' })` — delivery `cdn`, shell `next.version`, exact text |
| `C.update.keeps-includes` | Chrome | a file assembled with includes (`INCLUDE_TEXT`, `INCLUDES`; the corpus file `md/includes.md`): Update now writes exactly `next`'s Chrome `assemble(text, { includes })` — exact text, shell `next.version`, the file's `#orz-includes` exactly |
| `C.host.save` | Chrome | cross-origin `orz-host-save@1` (the host side written from host-protocols.md, not the kit's): ready with the kind; dirty `true` after an edit; the save goes to the host first (picker present but unused) with `source` = exact text, `html` = Node `assemble(source)`; no served-page notice; clean and dirty `false` after the ack |
| `C.host.ai` | Chrome | `orz-host-ai-ready` version 1 when offered, no answer when declined; nothing else posted |
| `C.host.include` | Chrome | `orz-host-include-ready` with the kind when offered, no answer when declined; nothing else posted |
| `C.host.silent` | Chrome | a page that never says hello (a newer release advertised) gets no `orz-*` message; the save is the standalone one (served notice) within 5 s; still dirty; in 3.5 s after the frame loaded, no manifest request and no indicator (a framed file never decides it is standalone) |
| `C.host.no-ack` | Chrome | a host that never acknowledges: the save settles after 9–30 s (spec 10 s), still dirty, one save sent, no fallback picker/write/download and no served-page notice |
| `C.host.foreign-hello` | Chrome | a host page that never says hello, a sibling frame (the host's origin) posting all three hellos into the file's frame and the file posting them to itself: the file posts nothing to its parent; its save is the standalone one (served-page notice), none goes to the parent |
| `C.prefs.local` | Chrome | after a mount, `setMode` and `setSplitRatio` the only storage keys are `orz-pref:<uid>:…` (and `orz-update…`) — none under the shared `orz-pref:_:`, no global key; text, island and dirty unchanged; another uid does not inherit the mode (when `getMode` exists); reopening restores it; on a `file:` page a save after `setMode` writes exactly `assemble(text)` |

## 5. Assumptions the specs leave open (for review)

Items 1, 3 and 4 were decided by the owner on 2026-10-06 and are now binding
text: FC-19 §4 (standalone saves use the file's host connection), FC-18 §3
(`carrier: <kind>` on creation), shell-runtime §6 (no CR in a bundle). Items
2 and 5 stand as read here; item 6 follows shell-runtime §7.1 as revised in
round 1 of closed loop 2. Not yet driven: include and AI requests after the
handshake (no specified UI triggers them); added when the carriers' editors
do (Phase 3).

1. **The file boots itself.** An opened assembled file, standalone, runs the
   update check and shows the indicator (shell-runtime §7); embedded, it
   answers host hellos (`connectHost`). Its `Editor` (from `target.editor`,
   default `OrzCarrier.mountEditor`) saves through the standalone order —
   including a connected host — when no `hooks.save` is given. FC-19 §3 has
   no `host` option, so a carrier's `mountEditor` must route standalone saves
   to the file's host connection itself.
2. **Kit envelope.** `C.law.content-independence` and `C.create.meta`
   require the text-derived parts byte-equal to the kit's `assembleEnvelope`
   (FD-03: implemented once). A carrier that writes its own envelope fails.
3. **`carrier` key on creation.** `C.create.header` reads FC-18 §3 ("tools
   write it when they create a file") as: a new document's header has
   `carrier: <kind>`.
4. **No CR in the bundle.** shell-runtime §6 forbids `<script`/`</script` but
   not CR; an HTML parser rewrites CR in an inline script, so an inlined
   bundle with a CR no longer matches its integrity. `C.bundle.script-safe`
   requires none.
5. **Download name.** A download is named exactly as the opened file (the
   specs name `suggestedName`, the twin name; for an opened assembled file
   that is its own name). Round 2 of closed loop 2 tightened this from "ends
   in the kind's extension".
6. **Hosted files do not check.** `C.update.hosted` reads shell-runtime §7.1
   as: a file in an app host's frame makes no manifest request at all (the
   kit's `checkForUpdate` returns early on a framed page), not merely shows
   no indicator. `C.host.silent` extends it to a frame whose parent never
   says hello.
7. **The opened bytes.** The save proves a handle by its content
   (shell-runtime §1 step 3.2): a remembered handle is reused after a reload
   only when the file holds the bytes the page was opened from. A carrier
   therefore passes `createSaver` its `openedHtml` (its `assemble` of the
   text the page loaded); without it `C.save.copy-elsewhere`'s reopened
   original gets a picker and fails.
