# Shell runtime — save, reader preferences, quiet updates, chrome

**Status:** implementation spec for `orz-markdown/carrier/shell`
(`src/carrier/shell/`), the browser runtime every assembled orz file shares
(FD-03). It implements family contract FC-11 (self-reproducing save) for text
format 1 (FC-18 §6, §10), the file side of the host protocols
([host-protocols.md](host-protocols.md)), the quiet update of FD-05 (§6–§7)
and the shell chrome (§8). Claims S.1–S.12, U.1–U.11 and V.1–V.5 in
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
const saver = createSaver({ uid, suggestedName, kind, host?, window?, handleStore? });
saver.save({ text, html, theme? }): Promise<SaveResult>   // never rejects
saver.download({ html }): Promise<SaveResult>             // Export / the notice's "download a copy"

type SaveResult =
  | { via: 'host' | 'file' | 'download'; ok: boolean; error?: string }
  | { via: 'served-notice' };
```

- `uid` — the header `uid` (FC-18 §5.1, §10). `suggestedName` — the assembled
  file's name, i.e. the twin name of the text (`twinName('week3.md')` =
  `week3.md.html`). `kind` — `md`, `slides`, `paged` or `poster`.
- `text` — the text twin, exact; `html` — the assembled file.

**Order** (the first that applies):

1. **Connected host** (`host.connected()`, i.e. the host said
   `orz-host-hello`): `orz-host-save` with `source = text`, `html`, and
   `theme` when given → `{ via: 'host', ok, error? }`. A refused or timed-out
   host save is reported as such; it never falls back to a download (the
   host owns persistence).
2. **Served page notice:** the page is `http:`/`https:` and this session has
   no file handle → `{ via: 'served-notice' }`. The reader cannot write the
   server's bytes; the caller shows its dismissible notice (element id
   `orz-served-note`) offering `download()`, and should show it only when the
   document has unsaved edits. No picker opens and no IndexedDB lookup runs.
3. **File System Access** (`showSaveFilePicker` exists):
   1. the session's handle, if any (a second save never prompts);
   2. else the handle remembered under the handle key (below), used only if
      `queryPermission({ mode: 'readwrite' })` is `granted` or
      `requestPermission` grants it (Chrome's one-click prompt naming the
      file), and only if its name matches the opened file when the page is a
      `file:` URL — a copy of a file carries the same `uid`, and must not
      write over the original;
   3. else the picker, offered `suggestedName` and the kind's extension
      (`.md.html`, `.slides.html`, `.paged.html`, `.poster.html`, plus
      `.html`); the picked handle is remembered under the handle key.

   Then `createWritable` → `write(html)` → `close` → `{ via: 'file', ok: true }`.
   A cancelled picker (`AbortError`) → `{ via: 'file', ok: false, error:
   'cancelled' }`, with no fallback. Any other picker error (no user
   activation, policy) or a failed write falls back to step 4, so the work is
   never lost.
4. **Download:** a `Blob` of `html` (`text/html;charset=utf-8`, so the bytes
   are the UTF-8 of `html`) through an `<a download="{suggestedName}">`; the
   object URL is revoked after a second → `{ via: 'download', ok: true }` (or
   `ok: false` when the page has no document to download from).

**Handle key.** The header `uid` when it is well-formed (`doc-[0-9a-z]{10,32}`,
the kit's `UID_PATTERN`); else the page URL without its fragment (FC-18 §10).
Handles are stored in IndexedDB database `orz-carrier`, object store
`handles`, value `{ handle, name }` (a `FileSystemFileHandle` is structured-
cloneable). The store is best-effort: when IndexedDB is unavailable (opaque
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
checkForUpdate({ kind, current, format?, fetch?, now?, storage?, cdnBase? }): Promise<UpdateInfo | null>
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
- Only the standalone file checks; an app host owns the component version and
  shows nothing (FC-19 §5.6). A file that meets a newer format opens read-only
  and the same check offers the release that reads it (FC-18 §8.4).

### 7.2 Re-assembly (transactional)

```ts
reassemble({ text, kind, release, delivery?, fetch?, document?, window?, cdnBase?, timeoutMs? }): Promise<string>
```

1. **Download and verify.** Fetch the bundle URL (§6; `credentials: omit`),
   compute SHA-384 with SubtleCrypto and compare with
   `release.bundle.integrity`; then decode as strict UTF-8 and require it to
   be script-safe. Any failure rejects before anything is created.
2. **Run in a sandbox.** A hidden iframe with `sandbox="allow-scripts"`
   exactly (opaque origin — **no** `allow-same-origin`: the bundle cannot
   reach the page, its storage or its cookies), `srcdoc` = the bundle as an
   inline script (passed through `escapeScriptText`, which leaves a
   script-safe bundle unchanged) followed by a fixed listener. When the
   iframe's own window posts `orz-reassemble-ready`, the page posts
   `{ type: 'orz-reassemble', id, text, delivery, engineSource: bundle }`;
   the listener calls `OrzCarrier.assemble(text, { delivery, engineSource })`
   and posts back `orz-reassembled` with the html. The page reads **only
   messages whose `source` is that iframe's `contentWindow`**. Default timeout
   30 s.
3. **Verify the round trip** with the parser-free `extract`:
   `extract(html).text === text` exactly, `kind` is the document's kind,
   `shell === release.version`, and `delivery` is the requested one (default
   `inline`; keep the file's own, `extract(currentHtml).delivery`). Anything
   else rejects with a clear message ("…nothing was changed").
4. **Clean up.** The iframe and the message listener are removed in every
   outcome. Nothing else in the page is touched.

Failures reject with `UpdateError` and a `code`: `manifest`, `download`,
`too-large`, `integrity`, `no-crypto`, `encoding`, `unsafe-bundle`,
`no-document`, `timeout`, `bundle`, `roundtrip`, `kind`, `version`,
`delivery`.

The **caller** then saves the returned html through `createSaver` (§1,
unchanged) and reloads the page so the new shell runs. `performUpdate({ …,
saver, info? })` composes check → `reassemble` → `saver.save({ text, html,
theme })` and resolves `{ status: 'up-to-date' }`, `{ status: 'failed', info,
code, error }` (nothing saved) or `{ status: 'updated', info, html, save }`;
it never rejects and never reloads. Reload only when `save.ok` and the save
wrote the opened file (`via: 'file'`/`'host'`); on `served-notice` offer
`saver.download`.

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
  brand), rendered in its own shadow root. Its button is named
  "Update available: x.y.z" (`aria-haspopup="dialog"`, `aria-expanded`,
  `aria-controls`).
- Clicking (or Enter/Space) opens a small **non-modal** popover
  (`role="dialog"`, `aria-modal="false"`): "Update available: x.y.z", "You
  have …", a "What's new" link to `notes` (new tab, `noopener noreferrer`;
  absent when there are no notes) and the buttons **Update now** / **Not
  now** / **Skip this version**. Focus moves to Update now; **Esc** closes and
  returns focus to the chip; a pointer-down outside or focus leaving closes
  it. Nothing in the page becomes inert or hidden.
- **Update now** calls `onUpdate(info)` (typically `performUpdate` then a
  reload); while it runs the buttons are disabled and the button reads
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
  `preview`, `split`, `theme`, `close`, `info`, `check`, `warning`, `more`.
  A control is named by its `aria-label`, never by the icon.
- **`createShadowRoot(host, { mode? })`** — attaches an (`open` by default)
  shadow root and installs `CHROME_CSS` as a constructed stylesheet (no
  inline `<style>`, so a strict `style-src` keeps working), else a `<style>`.
- **`showToast(root, message, { tone, timeoutMs })`** — `tone` `info` |
  `success` | `warning` | `error`; one `role="status"` `aria-live="polite"`
  stack per root (bottom centre), toasts stack, each has a Dismiss button and
  goes after `timeoutMs` (default 5 s; 8 s for warnings and errors; `0`
  stays), paused while hovered or focused. The message is text, never HTML.

Vocabulary origin: orz-mdhtml's light/dark `--c-*` tokens and dark editor bar
(`src/template.ts`) and orz-poster's floating launcher and toast
(`src/browser/self-edit/styles.ts`), modernised (OKLCH, one scale, focus
rings, reduced motion). The chrome writes only into its own shadow roots and
never reads the page.
