# Shell runtime — save, reader preferences, quiet updates, chrome

**Status:** implementation spec for `orz-markdown/carrier/shell`
(`src/carrier/shell/`), the browser runtime every assembled orz file shares
(FD-03). It implements family contract FC-11 (self-reproducing save) for text
format 1 (FC-18 §6, §10), the file side of the host protocols
([host-protocols.md](host-protocols.md)), the quiet update of FD-05 (§6–§7)
and the shell chrome (§8). Claims S.1–S.15, U.1–U.13 and V.1–V.6 in
`notes/CLAIMS.md`; tests in `tests/carrier-shell.test.ts` and
`tests/carrier-update.test.ts`.

## 0. Ground rules

- **The runtime never serializes the live DOM.** The caller assembles the
  file — `assembleEnvelope(text, parts)` from `orz-markdown/carrier`, with the
  current text — and hands the bytes to `save`. What is written, downloaded or
  sent to a host is exactly that string. (Today's carriers clone and serialize
  the page, which can bake editor state into the file; format 1 forbids it:
  the shell holds no user state, FC-18 §8.1.)
- **Parser-free and Node-safe.** The subpath imports nothing from the parser
  or the kit's header tools; no window, document, storage, IndexedDB or
  location is touched at module load. Every browser feature is detected when
  a function is called, and an absent or throwing feature degrades (to the
  next save route, to defaults) instead of throwing.
- Browser APIs are typed structurally (`SaverWindow`, `MessageWindow`,
  `IframeLike`, `StorageLike`, `UiDocument`, `UiElement`); a real `Window`,
  `HTMLIFrameElement`, `Storage` or `Document` satisfies them, and tests pass
  fakes.
- The only non-shell code the subpath imports is the parser-free reader
  (`src/carrier/read.ts`: `extract`, `escapeScriptText`, `KIND_PACKAGE`), which
  the update uses to verify a re-assembled file.

## 1. Save

```ts
const saver = createSaver({ uid, suggestedName, kind, host?, window?, handleStore?, openedHtml?, servedNotice?, readUid?, knownHtml? });
saver.save({ text, html, theme? }, { overwrite?, conflictToken? }?): Promise<SaveResult>   // never rejects
saver.download({ html }): Promise<SaveResult>             // Export / the notice's "download a copy"

type SaveResult =
  | { via: 'host'; ok: boolean; error?: string }
  | { via: 'file'; ok: boolean; error?: string; picked: boolean; opened: boolean; name?: string; conflict?: true; conflictToken?: number }
  | { via: 'download'; ok: boolean; error?: string; confirmed: false; name?: string }
  | { via: 'served-notice' };

// one conflict question per saver (round 4 of the carrier-app loop, F2)
answerSaveConflict({ saver, root, input, result?, opened?, returnFocus? }): Promise<SaveConflictAnswer>
saveConflictOpen(saver): boolean
dropSaveConflict(saver, root?): void
```

**What was written.** A `file` result says whether a picker was shown for
this save (`picked`: the written file is then the one the reader chose, which
may not be the file the page was opened from; also `true` on a cancelled
picker), whether the written file is **proved by its content** to be the file
the page was opened from (`opened`, step 3 below) and the written handle's
`name` when the browser reports it. A name proves nothing: the real picker
opens in the last folder used and offers `suggestedName` there, so a reader
who accepts it writes a same-named file elsewhere. A
`download` result is a copy handed to the browser: `ok: true` means the
download was **started**, and `confirmed` is always `false` — the page cannot
know whether it landed (a blocked or cancelled download looks the same), so a
caller words it "Download started", never "Saved". Its `name` is
`suggestedName`. A `host` result is the host's acknowledgement.

- `uid` — the header `uid` (FC-18 §5.1, §10). `suggestedName` — the assembled
  file's name, i.e. the twin name of the text (`twinName('week3.md')` =
  `week3.md.html`). `kind` — `md`, `slides`, `paged` or `poster`.
- `text` — the text twin, exact; `html` — the assembled file. **It keeps
  the opened file's form** (closed loop 2 round 3): the caller assembles
  with the file's delivery (`#orz-shell` `delivery`: a `cdn` file is saved
  `cdn`, B#7) and its resolved includes (`#orz-includes`, passed as
  `assemble(text, { includes })`: a page cannot resolve local includes
  again; FC-18 §8.3, D4).
- `openedHtml` — the bytes of the file the page was opened from, as text: a
  string, or a function (sync or async, read at most once, when a handle has
  to be proved). For an assembled file the carrier passes its `assemble` of
  the text the page loaded (`readIslandFromDom(#orz-src)` at boot, with the
  file's delivery and includes), which reproduces the file (FC-18 law 3).
  Without it no remembered handle is reused across page loads and no picked
  file counts as the opened one. A function is called when a handle has to
  be proved, until it gives a string, which is kept: a rejection or a
  non-string is not kept (round 2 of the carrier-app loop), so a failed
  assembly is tried again at the next save and never disables the conflict
  check of step 3.4. A function is best started when an assembled file's page
  is first idle: computed only at a save click on a large document, it can
  outlast the click's user activation, which the permission prompt and the
  picker need (B#6). An app's editor (not an assembled file) computes it only
  at its first save: its `assemble` may fetch the carrier's engine, which is
  not done on every mount.
- `readUid(text)` (2.2.0, round 2) — the header `uid` of a text, used by step
  3.4 to read the uid of the file on disk. Pass the reader the page reads its
  own uid with (the kit's `readHeader(text).fields.uid`, well-formed: the
  carrier app and the editor shell do), so both sides agree on every header
  form — a quoted (`uid: "doc-…"`) or block (`uid: |`) value, blank lines
  before the header, `{{nyml kind: document` on the opener line. Default:
  `headerUidOf` (parser-free: the first `{{nyml` block after a BOM and blank
  lines, a top-level `uid:` line, quotes and a `|` block's first line read).
- `knownHtml()` (2.2.0, round 4 of the carrier-app loop, F5) — the bytes of
  a file whose content the page also knows, read only when a picked file
  would otherwise be a conflict (step 3.4): the editor shell passes the
  opened text assembled with the includes `refreshPreview({ includes })`
  handed it since (an app's server resolved them again, and the file on
  disk holds that). That content — not in a newer shell than the file being
  saved — is no change. It never proves a handle to be the opened file. A
  rejection or a non-string is nothing known.

**Order** (the first that applies):

1. **Connected host** (`host.connected()`, i.e. the host said
   `orz-host-hello`): `orz-host-save` with `source = text`, `html`, and
   `theme` when given → `{ via: 'host', ok, error? }`. A refused or timed-out
   host save is reported as such; it never falls back to a download (the
   host owns persistence).
2. **Served page notice:** the page is `http:`/`https:` and this session has
   no file handle → `{ via: 'served-notice' }` — unless the caller passes
   `servedNotice: false` (2.2.0): the page is not an assembled file (an app's
   page whose editor has no save hook), and the save goes on to step 3, else
   step 4. The reader cannot write the
   server's bytes; the caller shows its dismissible notice (element id
   `orz-served-note`) offering `download()`, and should show it only when the
   document has unsaved edits. No picker opens and no IndexedDB lookup runs.
3. **File System Access** (`showSaveFilePicker` exists). **A handle's
   identity is proved by content, never by names:** before a handle is
   reused, its file is read (`getFile()`) and must hold what this page last
   wrote through it in this page load, or the opened file's own bytes
   (`openedHtml`); a handle that cannot be read proves nothing.
   1. the session's handle, if any, while its file still holds what this
      page last wrote to it (or the opened bytes): a second save never
      prompts. Its `opened` is that of its first save, or `true` when the
      file holds the opened bytes (again: e.g. the opened file copied over
      the one picked earlier — proved by content like any) — but the opened
      version put back over what this page wrote (a revert, `git checkout`,
      an agent) is asked about first (step 4; round 3, F3). A file someone else
      wrote since (another tab, another tool) gets the picker;
   2. else the handle remembered under the handle key (below), used only
      when **the record's page location equals this page's** (the URL
      without query and fragment — for a `file:` page, the file's own path),
      only if its name matches the opened file when the page is a `file:`
      URL, only with `openedHtml` given, only if `queryPermission({ mode:
      'readwrite' })` is `granted` or `requestPermission` grants it (Chrome's
      one-click prompt naming the file), and only if its file holds exactly
      the opened bytes — whoever wrote them: the record's `sha256` (what was
      last written through it) is not a condition, because a tool that
      assembled the same text again (the CLI) writes exactly the file the
      page then opens (closed loop 2 round 3, B#8); a file changed since the
      page opened it does not hold the opened bytes. Every `file:` page shares one IndexedDB,
      and a copy of a file carries the same `uid` and often the same name: a
      copy in another folder must get the picker and never write over the
      original. A record without a location (written before this rule) is
      not reused. Its `opened` is `true`;
   3. else the picker, offered `suggestedName` and the kind's extension
      (`.md.html`, `.slides.html`, `.paged.html`, `.poster.html`, plus
      `.html`). The picked file is the opened one (`opened: true`) only if,
      before the write, it holds the opened bytes — a new file, or a
      same-named file in the folder the picker opened in, is not.
   4. **A file that changed on disk** (2.2.0, rounds 1–4 of the carrier-app
      loop): when the picked (or re-picked — the session's handle was
      dropped because someone else wrote its file) file is an orz file
      (`extract`) of **this document** and its **content** is neither the
      opened file's (from `openedHtml`), what this page last wrote, the
      file being saved, nor the content of `knownHtml` (round 4, F5) — or it holds such content in a **newer shell** than
      the file being saved (semver, round 3, L12: an agent ran `upgrade`;
      writing would put the older shell back) and this page did not write
      that shell itself — nothing is written: → `{ via: 'file', ok: false,
      error: 'conflict', conflict: true, picked: true, opened: false,
      name?, conflictToken }`. Another program or an agent edited the document since the
      page opened it; writing would lose that edit silently.
      - *This document:* the file's header `uid` (read with `readUid`, else
        `headerUidOf`) is the saver's `uid` — or either side has none (a
        document without a uid is still this document: a different content
        asks). Only two different well-formed uids are two documents: the
        reader chose another document's file in the picker, which the
        browser's own replace prompt covers.
      - *Content:* the extracted text, the resolved includes (`#orz-includes`,
        compared as entries) and the delivery — not the raw bytes. A tool
        that wrote the same text, includes and delivery again in other bytes
        (the same or an older shell version, CR LF line endings) changed
        nothing the page would lose; an agent that re-assembled the same
        text with new includes or `cdn` delivery, or in a newer shell, did,
        and is asked about.
      - *Reverted* (round 3, F3): the session's file (step 1) holds the
        opened bytes again although this page wrote something else into it
        — someone put the opened version back over this page's save. Asked
        like any change, without a picker: → `{ via: 'file', ok: false,
        error: 'conflict', conflict: true, picked: false, opened: false,
        name? }` (then `overwrite` writes that file, `opened: true`, and it
        is remembered: m24's proof by content still holds), unless the
        opened content is what this page last wrote or is saving (nothing
        would be lost). Decided over keeping the silent write: a revert is
        a deliberate edit on disk like any other, and asking costs one
        question; nothing legitimate depends on the silent write (m24's
        "the opened file copied over the one picked earlier" now asks once,
        then behaves as before). Round 4 (F4): the same holds for a
        remembered handle (step 2: the session's handle was dropped, e.g.
        after an agent's edit the reader answered with a download) whose
        file holds the opened bytes again over what this page wrote into
        the opened file in this page load; a page that wrote only into
        another file is not asked.
      - *The pending conflict* (round 4, F2): every conflict result carries
        a new `conflictToken`; the saver keeps only the latest one pending,
        and any later save — conflicting or not — supersedes it. `save(input,
        { overwrite: true, conflictToken })` writes that file only while the
        token is the pending conflict's; otherwise (an answer to a superseded
        question, no conflict pending, no token) nothing is written or
        checked: `{ via: 'file', ok: false, error: 'stale-conflict', picked:
        false, opened: false }`. An older question's text can never go over
        a newer save.

      The caller asks the reader — `askSaveConflict(root, name?, { opened?
      })` (§8), an alertdialog titled "The file changed on disk": "This
      file changed on disk since this page opened or last saved it (another
      program or an agent edited it). Download a copy to keep both
      versions; replacing the file loses the version on disk." (for an
      editor that is not an assembled file, `opened: false`: "The file you
      chose holds another version of this document …") with **Download a
      copy instead** (focused and styled as the default: it changes nothing
      on disk; Escape dismisses, writing nothing) and **Replace it (the
      version on disk is lost)** — and on Replace it calls `save(input, {
      overwrite: true })`, which writes the file of the conflicting save (no
      second picker; no check; `opened: false` for a picked file, so it is
      not remembered; `true` for a reverted file), or on Download a
      copy instead `download({ html })` and says "Download started; the file
      on disk is unchanged. Your next save asks again." **After a download,
      every later save asks again** (round 3, L11; by design): the file on
      disk still differs, so each save opens the picker (or, for a reverted
      session file, finds it again) and is checked again until the reader
      replaces the file, saves elsewhere, or reloads the page to open the
      file's own version. **One question per saver** (round 4, F2): a page
      and every editor of its file share ONE saver object (the carrier app
      hands its saver to the editors through `context.saver` — since round
      5 a wrapper it makes once, to learn every write, and the only object
      it hands out; a carrier must not wrap it again), and `answerSaveConflict({ saver, root, input,
      result })` keeps one question per saver: while it is open, every
      further save of that page or any of its editors does not call the
      saver (no second picker, `saveConflictOpen(saver)`) but calls
      `answerSaveConflict` without a `result`, which focuses the open
      question wherever it is shown, makes it answer for that newest text
      (the older caller is told `superseded` and writes nothing) and, for a
      save from another root, returns the focus there after the answer.
      Replace it calls `save(input, { overwrite: true, conflictToken })`
      with the pending conflict's token; only the text actually written is
      marked saved (an edit made while the question was open stays
      unsaved). A save that reached the saver before the question opened
      (two surfaces saving at once) re-targets it with its own conflict:
      its token and file name replace the older ones. **Replace replaces
      whatever is on disk when you answer** (round 5, B5; by design): the
      file is not read again, so a second write by another program while
      the question is open is replaced too — the reader never sees the
      disk version in either case, and "Replace it (the version on disk is
      lost)" already chose to drop it; re-reading and asking again would
      ask the same question about content the reader cannot see. A question's root that goes away (`dropSaveConflict`: an
      editor destroyed, Done; the app disposed) takes its question: its
      caller is told `null` and the next save asks the saver again. Another document's
      file, a file that is not an orz file, the opened content, this page's
      last write or the file being saved are no conflict, and without
      `openedHtml` nothing is (nothing is known about the opened text: the
      saver never reports a conflict). *Limit:* a remembered handle is
      reused only while its file holds the opened bytes, and a session
      handle while its file holds this page's last write or the opened
      bytes (then asked about as above), so a changed one never gets here
      without the picker. A quiet update whose save finds a conflict writes
      nothing and says so (the carrier app's indicator: "The file changed on
      disk since you opened it … so the update wrote nothing. Reload the
      page to open its version, then update.").

   Then `createWritable` → `write(html)` → `close` → `{ via: 'file', ok:
   true, picked, opened, name }`, and a handle proved to be the opened file
   is remembered under the handle key with this page's location and the
   SHA-256 of what was written (a handle that is not the opened file is used
   for the rest of this page load but never remembered for this page). A
   cancelled picker (`AbortError`) → `{ via: 'file', ok: false, error:
   'cancelled', picked: true, opened: false }`, with no fallback. Any other picker error (no user
   activation, policy) or a failed write falls back to step 4, so the work is
   never lost.

   *Limit.* Content cannot tell two files with identical bytes apart: a
   byte-identical copy of the opened file can still be taken for it (the
   picker then shows the reader which file they chose).
4. **Download:** a `Blob` of `html` (`text/html;charset=utf-8`, so the bytes
   are the UTF-8 of `html`) through an `<a download="{suggestedName}">`; the
   object URL is revoked after a second → `{ via: 'download', ok: true,
   confirmed: false, name }` (or `ok: false` when the page has no document to
   download from).

**Handle key.** The header `uid` when it is well-formed (`doc-[0-9a-z]{10,32}`,
the kit's `UID_PATTERN`) followed by a space and the page location
(`doc-… file:///Users/me/notes.md.html`; the `uid` alone when the page has no
location); else the page URL without its fragment (FC-18 §10). So the
original and a copy elsewhere keep separate records, and saving the copy does
not cost the original its handle. Handles are stored in IndexedDB database
`orz-carrier`, object store `handles`, value `{ handle, name, location, sha256 }` (a
`FileSystemFileHandle` is structured-cloneable). The store is best-effort: when IndexedDB is unavailable (opaque
origins, private modes) every lookup misses and the session handle still
spares the second prompt. Today's per-carrier databases (`orz-mdhtml`,
`orz-poster`, keyed by `docId`) are not read: after the move, the first save
of an old file prompts once.

**Requirements.** Writing a file in place needs a Chromium browser (File
System Access); elsewhere save downloads a copy. Reading works everywhere
(FC-11).

## 2. Reader preferences (FC-18 §6, D5)

```ts
const prefs = createPreferenceStore(uid?, storage?, schema?);
prefs.get('viewMode'); prefs.set('splitRatio', 0.4); prefs.remove('viewMode'); prefs.all();
```

One reader's choices, stored per browser, never in the text. Default storage
is `localStorage` (resolved at each call). Keys are namespaced by the document
`uid`: `orz-pref:{uid}:{key}`, or `orz-pref:_:{key}` for a document without a
well-formed uid (shared by such documents). Each key's value is JSON.

| Key | Type | Default |
|---|---|---|
| `splitRatio` | number 0.1–0.9 (editor share of the split view) | `0.5` |
| `scrollSync` | boolean | `true` |
| `viewMode` | `split` / `editor` / `preview` | `split` |
| `editorFontSize` | number 8–40 (CSS px) | `14` |
| `darkChrome` | boolean, or `null` to follow the system | `null` |
| `fontScale` | integer 25–400 (percent): the read view's text size, a reader control of the carrier app (spec/carrier-app.md §4.10; 2.2.0) | `100` |

| `reader.<key>` | one of the ids of the kind's reader choice control `<key>` (spec/carrier-app.md §4.10; 2.3.0): validated against the control's ids by a schema the carrier app builds | the control's `default` |

A carrier may pass its own `schema` (`{ key: { default, valid } }`) for
kind-specific preferences. **Validation both ways:** `set` refuses a value
its validator rejects (returns `false`); `get` returns the default for an
absent value, invalid JSON or a value the validator rejects. **Fails
closed:** when storage is absent or throws (including the `localStorage`
getter itself), `get` returns defaults and `set` returns `false`; nothing
throws. This store is the default `PreferenceStore` of the FC-19 editor.

## 3. Host connection (file side)

`connectHost({ kind, ai?, include?, onReady?, onSaveResult?, timeouts? })`
implements the file side of all three protocols with the security rules of
host-protocols.md §6, and is what `createSaver({ host })` consults. A file
that passes no `ai` (or `include`) declines that protocol. AI results are
proposals: applying one is the editor's job. Include results are not cached
beyond concurrent requests for the same URL; the caller caches them for its
preview.

## 4. How the runtime uses the core

| Need | Core function |
|---|---|
| bytes to save | `assembleEnvelope(text, parts)` (the caller; deterministic, FC-18 law 2) |
| text from an opened file | `readIslandFromDom(#orz-src)` or `extract(html)` (`orz-markdown/carrier/read`) |
| `uid`, `kind` | `readDocument(text)` / `readHeader(text)` |
| file name | `twinName(textName)` |

Because `assemble` is deterministic and `extract` exact, saving a file that
was not edited writes the same bytes it was opened from.

## 5. Decisions on the former open points (2026-10-05)

- **Includes in a hosted format-1 preview:** the host's resolution wins (it is
  fresher and the host owns the trust policy); the file's `#orz-includes`
  (resolved at assembly) is the fallback when no host answers.
- **A served page with a remembered handle still shows the served-page
  notice.** A published page never silently overwrites someone's local copy;
  the reader saves a copy deliberately (Download / Save as new copy).

## 6. Release manifest

Every `orz-<x>-browser` package (`orz-mdhtml-browser`, `orz-slides-browser`,
`orz-paged-browser`) publishes **`release.json` at its package root**:

```json
{
  "kind": "md",
  "version": "1.0.0",
  "formats": [1],
  "notes": "https://github.com/wangyu16/orz-mdhtml/blob/main/CHANGELOG.md#100",
  "bundle": { "path": "orz-mdhtml.browser.js", "integrity": "sha384-<base64>" }
}
```

| Field | Rule |
|---|---|
| `kind` | the package's kind (`md` / `slides` / `paged`); a manifest of another kind is ignored |
| `version` | the release's version, semver 2.0.0 without build metadata — the carrier's version (FC-19 §7) and the `shell` its `assemble` writes |
| `formats` | the text formats (FC-18) this release reads and writes: non-empty, positive integers |
| `notes` | an `https:` link to the release notes; any other value is dropped (no link shown) |
| `bundle.path` | the browser bundle's path inside the package: segments of `[A-Za-z0-9._-]`, none `.` or `..`; no scheme, query, fragment, backslash or leading `/` |
| `bundle.integrity` | `sha384-` + the standard base64 of the SHA-384 of the bundle's exact bytes (Subresource Integrity form) |

**URLs are hard-coded in the runtime** (RULES §5.4), never taken from a
document: manifest `https://cdn.jsdelivr.net/npm/<pkg>-browser@latest/release.json`,
bundle `https://cdn.jsdelivr.net/npm/<pkg>-browser@<version>/<bundle.path>`,
where `<pkg>` is `KIND_PACKAGE[kind]` (`md` → `orz-mdhtml`, `slides` →
`orz-slides`, `paged` → `orz-paged`). An options parameter `cdnBase` replaces
`https://cdn.jsdelivr.net/npm/` for tests and for a carrier's own code; no API
reads it from a text or header. orz-poster publishes no manifest (its sealed
files never self-update: RULES §9).

**The bundle** sets the standard global `globalThis.OrzCarrier` (FC-19 §2)
and must be **script-safe**: it contains no `<script` or `</script` (any case,
after any backslashes) and **no CR** (U+000D; an HTML parser rewrites CR and
CR LF in a `<script>` to LF, so inlined bytes would no longer match the
integrity), so it can be inlined in a `<script>` — in the update
sandbox and in an inline-delivery file — byte for byte, and the project's
script escaping (`escapeScriptText`) leaves it unchanged. Bundlers emit such
sequences inside strings (esbuild writes `"<script"` and `"<\/script>"` for
the envelope's own markup); the release build rewrites each `<` before
`script`/`/script` as `\x3C`, which every string, template and regular
expression reads the same, and then computes the integrity. A bundle that is
not script-safe is refused by the update (escaping code would change what
runs).

## 7. Update flow and indicator (FD-05)

Update = **re-assembly, never patching**. All of it is in
`src/carrier/shell/update.ts` and `indicator.ts`.

### 7.1 Check

```ts
checkForUpdate({ kind, current, format?, fetch?, now?, storage?, cdnBase?, host?, page?, servedPages? }): Promise<UpdateInfo | null>
type UpdateInfo = { kind, current, latest, notes, manifest };
skipVersion(kind, version, storage?): boolean
```

- **Once a day per kind.** The last check is stored under `orz-update:<kind>`
  (`{ checkedAt, manifest }`, default storage `localStorage`) **before** the
  request, so a failure also counts; within 24 h the stored manifest is used
  and nothing is fetched. A clock earlier than the record checks again.
  Without usable storage nothing is fetched (the once-a-day promise could not
  be kept).
- **Silent.** Offline, an HTTP error, bad JSON, an invalid or oversized
  (> 64 KB) manifest or a request hanging past 10 s resolve `null`; it never
  rejects and logs nothing.
- **What is offered:** a manifest of the same kind whose version is a
  release (never a prerelease), newer than `current` by semver precedence,
  whose `formats` include the document's `format` (default 1), and newer than
  the version recorded by `skipVersion` under `orz-update-skip:<kind>`.
- **Who checks.** Only a top-level standalone file. `checkForUpdate` makes no
  check — no storage write, no request — and resolves `null` when:
  - the page is **framed** (`window.parent !== window`): an assembled file
    embedded in an app host runs no update check and shows no indicator,
    whether or not the host's hello has arrived yet (the host owns the
    component version, FC-19 §5 invariant 6; the hello may come after the
    file's boot, so "connected" alone would race);
  - a `host` connection is passed and connected;
  - the page is **served** (`http:`/`https:`) — unless the carrier passes
    `servedPages: true`. A reader of a published page cannot save over it
    (§1 step 2), so by default no indicator is offered to readers who cannot
    save; a carrier whose served pages are the reader's own (a local dev
    server) may opt in.

  These guards are in the kit; a carrier calls `checkForUpdate` at boot and
  mounts the indicator only for a non-null result. `performUpdate` refuses a
  framed or hosted page (code `hosted`).
- A file that meets a newer format opens read-only and the same check offers
  the release that reads it (FC-18 §8.4).

### 7.2 Re-assembly (transactional)

```ts
reassemble({ text, kind, release, delivery?, includes?, fetch?, document?, window?, cdnBase?, timeoutMs? }): Promise<string>
```

1. **Download and verify.** Fetch the bundle URL (§6; `credentials: omit`),
   compute SHA-384 with SubtleCrypto and compare with
   `release.bundle.integrity`; then decode as strict UTF-8 and require it to
   be script-safe. Any failure rejects before anything is created.
2. **Run in a sandbox.** A hidden iframe with `sandbox="allow-scripts"`
   exactly (opaque origin — **no** `allow-same-origin`: the bundle cannot
   reach the page, its storage or its cookies), `srcdoc` = the bundle as an
   inline script (passed through `escapeScriptText`, which leaves a
   script-safe bundle unchanged), with nothing after it in its `<script>`
   (2.2.0: a bundle that reads its own script text — an inline assembly
   without `engineSource` — gets exactly the verified bytes), followed by a
   fixed listener. When the
   iframe's own window posts `orz-reassemble-ready`, the page posts
   `{ type: 'orz-reassemble', id, text, delivery, engineSource: bundle,
   includes? }`; the listener calls `OrzCarrier.assemble(text, { delivery,
   engineSource, includes? })` (`includes` only when given)
   and posts back `orz-reassembled` with the html. The page reads **only
   messages whose `source` is that iframe's `contentWindow`**. Default timeout
   30 s.
3. **Verify the round trip** with the parser-free `extract`:
   `extract(html).text === text` exactly, `kind` is the document's kind,
   `shell === release.version`, `delivery` is the requested one (default
   `inline`; keep the file's own, `extract(currentHtml).delivery`), and the
   new file's `#orz-includes` holds exactly the `includes` given (keep the
   file's own, `extract(currentHtml).includes`; absent or empty = none: a
   page cannot resolve local includes again, FC-18 §8.3 D4 — before closed
   loop 2 round 3 every update dropped them, and the check passed). Anything
   else rejects with a clear message ("…nothing was changed").
4. **Clean up.** The iframe and the message listener are removed in every
   outcome. Nothing else in the page is touched.

Failures reject with `UpdateError` and a `code`: `manifest`, `download`,
`too-large`, `integrity`, `no-crypto`, `encoding`, `unsafe-bundle`,
`no-document`, `timeout`, `bundle`, `roundtrip`, `kind`, `version`,
`delivery`, `includes`; `performUpdate` adds `changed` and `hosted` (below).
`performUpdate` passes `delivery` and `includes` on to `reassemble`.

The **caller** then saves the returned html through `createSaver` (§1) and
reloads the page so the new shell runs — but only when that is safe.
`performUpdate({ …, getText, saver, info? })` composes check →
`reassemble` → re-read the text → `saver.save({ text, html, theme })` and
resolves `{ status: 'up-to-date' }`, `{ status: 'failed', info, code, error }`
(nothing saved) or `{ status: 'updated', info, html, text, save, reload }`; it
never rejects and never reloads.

- **The text.** `getText()` is read when the update starts and **again
  before the save**; if it changed, nothing is saved (`failed`, code
  `changed`). (The older `text` option, read once, still works.) **The editor
  is read-only while the update runs** ("Updating…"): the carrier makes it so
  (the re-check is the guard if it does not), so nothing typed then can be
  lost by the reload — and editable again when the update settles without a
  reload (refused, a copy, a file not proved to be the opened one).
- **Reload only when** `reload` is `true`: the save wrote the opened file —
  `via: 'host'` with `ok`, or `via: 'file'` with `ok` and `opened: true`
  (the written file proved by its content to be the opened one, §1 step 3;
  the saver needs `openedHtml`) — **and** the current text still equals the
  saved text. Names prove nothing (closed loop 2 round 2, F2): a picked file
  of the opened name — the picker may have opened in another folder — and a
  later save of the same page load to a file picked earlier are not the
  opened file unless their content proved it. A download (`confirmed:
  false`: a copy), the served notice (offer `saver.download`), a picked or
  session file not proved to be the opened one, a failed save or a text that
  moved on during the save leave the page as it is; the carrier says where
  the new file went. (`openedName` is still accepted and ignored.)

The text passed in is the editor's current text, unsaved edits included; a
text that cannot round-trip (mixed line endings, FC-18 law 1) is refused by
step 3, never silently normalised.

A carrier that adds a Content-Security-Policy to its files must allow inline
scripts in the sandbox (`srcdoc` frames inherit the page's policy) and
`connect-src https://cdn.jsdelivr.net`; a file whose policy forbids them
cannot update (orz-poster's sealed policy is the registered example).

### 7.3 Indicator

```ts
mountUpdateIndicator(anchor, info, { onUpdate, onLater?, onSkip? }, { document? }): { host, root, open, close, isOpen, dispose }
```

- A small chip (update icon + dot) inserted **right after the anchor** (the
  brand), rendered in its own shadow root. (The carrier app anchors it in
  edit mode's bar; its read view offers the same choices in the handle's
  list instead — spec/carrier-app.md §4.9.) Its button is named
  "Update available: x.y.z" (`aria-haspopup="dialog"`, `aria-expanded`,
  `aria-controls`).
- Clicking (or Enter/Space) opens a small **non-modal** popover
  (`role="dialog"`, `aria-modal="false"`): "Update available: x.y.z", "You
  have …", a "What's new" link to `notes` (new tab, `noopener noreferrer`;
  absent when there are no notes) and the buttons **Update now** / **Not
  now** / **Skip this version**. Focus moves to Update now; **Esc** closes and
  returns focus to the chip; a pointer-down outside or focus leaving closes
  it. Nothing in the page becomes inert or hidden.
- **Update now** calls `onUpdate(info)` (typically `performUpdate`, then a
  reload when its `reload` is true); while it runs the buttons are disabled and the button reads
  "Updating…"; a rejection is shown inside the popover (`aria-live`
  `polite`). **Not now** calls `onLater` and removes the indicator for this
  page (tomorrow's check offers again). **Skip this version** calls `onSkip`
  (typically `skipVersion(info.kind, info.latest)`) and removes it.
- Never a modal, never `confirm()`/`alert()`/`prompt()`, never a banner over
  the content. Motion follows `prefers-reduced-motion`.

## 8. Chrome

`src/carrier/shell/chrome.ts` — the shell's UI vocabulary, decoration for the
shell only. The document's theme styles the document; the chrome renders in
shadow roots and does not compete with it.

- **`CHROME_CSS`** — tokens as `--orz-chrome-*` custom properties on `:host`:
  colours (`bg`, `surface`, `surface-2`, `hover`, `border`, `fg`, `muted`,
  `accent`, `accent-hover`, `accent-fg`, `focus`, `success`, `warning`,
  `danger`, `info`, `shadow`) in OKLCH, a spacing scale (`space-1`…`space-6`:
  2, 4, 8, 12, 16, 24 px), radii (`radius-s/m/l/pill`), a type scale
  (`text-xs/sm/md/lg`: 11, 12, 13, 15 px) in system UI fonts, motion
  (`ease`, `fast`, `slow`). Light by default; dark under
  `prefers-color-scheme: dark`; `data-chrome="light"|"dark"` on the host, or
  on an ancestor such as `<html>` where `:host-context` is supported,
  overrides the system. `:host { all: initial }` keeps the page's inherited
  fonts and colours out; `:focus-visible` draws a 2 px focus ring;
  `prefers-reduced-motion: reduce` turns animation and transition off; print
  hides the chrome. Components: `.orz-btn` (`--primary`, `--ghost`,
  `--icon`), `.orz-chip` + `.orz-dot`, `.orz-popover`, `.orz-toast-stack` /
  `.orz-toast`, `.orz-icon`, `.orz-visually-hidden`.
- **`ICONS`** — inline SVG strings (24×24, stroke `currentColor`,
  `aria-hidden`, `focusable="false"`): `save`, `download`, `update`, `edit`,
  `preview`, `split`, `theme`, `close`, `info`, `check`, `warning`, `more`,
  and (2.2.0, the carrier app's chrome) `measure`, `new`, `copy`, `present`,
  `print`, `pageSize`. A control is named by its `aria-label`, never by the
  icon.
- **Kind icons** (2.2.0) — `KindIcon = { paths: string[] }`: a carrier's own
  icon for one of its actions, constrained like `ICONS` by construction:
  1–8 path `d` strings of path data only (commands, numbers, separators; at
  most 1,000 characters each), drawn on the same 24×24 stroked
  `currentColor` grid. `anyIconElement(doc, icon)` builds a kit icon or a
  kind icon — the latter element by element (`createElementNS`, attributes
  set as data, never markup: the only `innerHTML` stays the `ICONS`
  constants); a malformed one (`isKindIcon` false), an unknown name or a
  document without SVG elements gives null and the control keeps its label.
- **Brand marks** (2.2.0, `brand.ts`) — `ORZ_SEAL_SVG`, the orz seal of
  orz-mdhtml 0.9.3 (the "orz" wordmark knocked out of a weathered green
  seal; viewBox 180 × 100; its ids namespaced `orzlogo-*`, its filters and
  mask referring only to them), and `GITHUB_MARK_SVG` (16 × 16,
  `currentColor`), both `aria-hidden`, with no script, handler, style, link
  or external reference; `brandMark(doc, 'seal' | 'github')` writes one into
  an `aria-hidden` span of a chrome shadow root (one seal per root: its ids
  are unique there) — `brand.ts`'s only markup write, as `iconElement` is
  `chrome.ts`'s; `ORZ_MARKDOWN_SITE` = `https://markdown.orz.how`. The
  carrier app's edit mode links them quietly (spec/carrier-app.md §4.2). A
  link is named by its `aria-label`, never by the mark.
- **Syntax tokens** (2.2.0) — `--orz-chrome-syntax-heading`, `-mark`,
  `-link`, `-url`, `-code`, `-quote`, `-comment`, `-label`, light and dark
  like every token: the editor's syntax colours (FC-19 §8.6), each at least
  4.5:1 on `--orz-chrome-surface`.
- **`createShadowRoot(host, { mode? })`** — attaches an (`open` by default)
  shadow root and installs `CHROME_CSS` as a constructed stylesheet (no
  inline `<style>`, so a strict `style-src` keeps working), else a `<style>`.
- **`showToast(root, message, { tone, timeoutMs, actions?, onDismiss?, focus?, title? })`** — `tone` `info` |
  `success` | `warning` | `error`; one `role="status"` `aria-live="polite"`
  stack per root (bottom centre) for plain toasts; a toast with actions is a
  question (round 3, M6): `role="alertdialog"` (`aria-modal="false"`),
  labelled by its `title` (else its message) and described by its message,
  placed above the status stack and outside it (so it is announced once,
  when its default action takes the focus); toasts stack, each has a Dismiss button and
  goes after `timeoutMs` (default 5 s; 8 s for warnings and errors; `0`
  stays), paused while hovered or focused. The message is text, never HTML.
  `actions` (2.2.0): buttons labelled as text; choosing one dismisses the
  toast, then runs the action; a toast with actions stays by default
  (`timeoutMs` 0) and, with `focus`, focuses its action marked `autofocus`,
  else its first; `onDismiss` runs once when it goes without a choice.
  Escape inside a toast dismisses it (and goes no further). The returned
  `Toast` has `dismiss()`, `focus()` (its default action again) and
  `setMessage(text)`.
- **`askSaveConflict(root, name?, { returnFocus?, opened? })`** (2.2.0) — the
  question of §1 step 3.4 as a toast with actions: resolves `'replace'`,
  `'download'` or `null` (dismissed: the Dismiss button, Escape). The focus
  goes to **Download a copy instead** (non-destructive, the first action,
  styled primary) and, after the answer, back to `returnFocus` (the element
  focused before the save); **Replace it (the version on disk is lost)** is
  never styled primary (round 3, L9). One
  question per root: asked again while one is open, the open one is focused,
  takes the newer `name` and answers the newer call; the older call
  resolves `null`. Its title is `SAVE_CONFLICT_TITLE`, its text
  `SAVE_CONFLICT_MESSAGE` (`opened: false`: `SAVE_CONFLICT_PICKED_MESSAGE`,
  which does not say "since you opened it"), its labels
  `SAVE_CONFLICT_LABELS`, and `SAVE_CONFLICT_DOWNLOADED` is what a caller
  says after Download a copy instead. A caller that saves does not call it directly
  but `answerSaveConflict` (§1 step 3.4; round 4), which keeps one question
  per saver on top of it — across roots, so the page's question also
  answers its editors' saves — and says `SAVE_CONFLICT_STALE` when Replace
  it found the conflict no longer pending. `focusSaveConflict(saver)`
  (round 5) focuses the saver's open question wherever it is shown (false
  when none is open): a caller that must not run while it is open (the
  quiet update) points the reader at it.

Vocabulary origin: orz-mdhtml's light/dark `--c-*` tokens and dark editor bar
(`src/template.ts`) and orz-poster's floating launcher and toast
(`src/browser/self-edit/styles.ts`), modernised (OKLCH, one scale, focus
rings, reduced motion). The chrome writes only into its own shadow roots and
never reads the page.
