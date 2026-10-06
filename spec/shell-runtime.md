# Shell runtime — save and reader preferences

**Status:** implementation spec for `orz-markdown/carrier/shell`
(`src/carrier/shell/`), the browser runtime every assembled orz file shares
(FD-03). It implements family contract FC-11 (self-reproducing save) for text
format 1 (FC-18 §6, §10) and the file side of the host protocols
([host-protocols.md](host-protocols.md)). Claims S.1–S.12 in
`notes/CLAIMS.md`; tests in `tests/carrier-shell.test.ts`.

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
  `IframeLike`, `StorageLike`); a real `Window`, `HTMLIFrameElement` or
  `Storage` satisfies them, and tests pass fakes.

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
