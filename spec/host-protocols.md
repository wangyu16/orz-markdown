# Host protocols — `orz-host-save@1`, `orz-host-ai@1`, `orz-host-include@1`

**Status:** canonical (family contract FC-12). Moved here from
`orz-mdhtml/PROTOCOL.md` under family decision FD-03, together with the shared
implementation; the message names, fields and timeouts are those of version 1
unchanged, so every existing host and file keeps working. Carriers' own
`PROTOCOL.md` files point here and document only their deltas.

**Implementation:** `orz-markdown/carrier/shell` (`src/carrier/shell/`):
`connectHost` is the FILE side, `embedCarrierFrame` the HOST side; message
constants and types in `protocol.ts`. Claims S.6–S.12 in `notes/CLAIMS.md`.

## 1. Scope

An assembled orz file (FC-18 §8) is self-contained: opened on its own it saves
through the File System Access API or a download (spec/shell-runtime.md). When
an app embeds the file in an `<iframe>`, the app — the **host** — can announce
itself with a `postMessage` handshake and then:

| Protocol | The host… |
|---|---|
| `orz-host-save@1` | receives the file's saves instead of the file system |
| `orz-host-ai@1` | offers AI operations; the file owns the UI, the host owns the model, the operation catalog and any governance |
| `orz-host-include@1` | resolves URL includes for the file's preview, under the host's own policy |

The three are independent: a host can offer any subset. Without a handshake
**nothing changes**: the file behaves exactly as a standalone file, and its
Export / "Download a copy" keeps working either way.

**Not for component hosts.** An app that mounts the editor component
(FC-19, `mountEditor`) in its own page uses the component's hooks
(`hooks.save`, `hooks.ai`, `hooks.fetchInclude`) instead. These protocols are
for apps that embed **assembled files** in an iframe.

Actors: the **host** (the embedding page) and the **file** (the assembled
document's runtime, running in the iframe).

## 2. Kind registry (FC-17)

`kind` in `orz-host-ready` and `orz-host-include-ready`:

| `kind` | Carrier | Assembled file |
|---|---|---|
| `md` | orz-mdhtml | `*.md.html` |
| `slides` | orz-slides | `*.slides.html` |
| `paged` | orz-paged | `*.paged.html` |
| `poster` | orz-poster | `*.poster.html` |

A host ignores a kind it does not handle (e.g. Alembic ignores `poster`).
Adding a kind means registering it in FC-17 and in this table.

## 3. `orz-host-save@1`

| Type | Direction | Payload |
|---|---|---|
| `orz-host-hello` | host → file | `{ type, protocol: "orz-host-save", version: 1 }` |
| `orz-host-ready` | file → host | `{ type, protocol: "orz-host-save", version: 1, kind }` |
| `orz-host-save` | file → host | `{ type, protocol: "orz-host-save", version: 1, source, html, theme? }` |
| `orz-host-saved` | host → file | `{ type, ok: true }` or `{ type, ok: false, error: string }` |
| `orz-host-dirty` | file → host | `{ type, protocol: "orz-host-save", version: 1, dirty: boolean }` |

`source` is the document's text; `html` is the whole assembled file — **the
same bytes a file save would write**. `theme` (optional, additive) is the
file's current theme id; hosts that ignore it are unaffected.

Sequence:

1. The host posts `orz-host-hello` to the iframe's `contentWindow` — at once,
   on every `load` of the iframe, and again every **400 ms** until the file
   answers (files that load their runtime late miss the first hello), giving
   up after **20 s**. Re-sending is harmless.
2. The file accepts the hello under the rules of §6, pins the host origin,
   and replies `orz-host-ready` with its `kind`. If the document already has
   unsaved changes it also posts `orz-host-dirty` with `dirty: true`.
3. From then on the file's **Save** posts `orz-host-save` to the host instead
   of touching the file system. One save is in flight at a time.
4. The host replies `orz-host-saved`. With no acknowledgement within
   **10 s**, the file reports the failure and keeps the document (still
   dirty) — a save is never lost to a silent host. `ok` is read as success
   only when it is the boolean `true`.
5. The file posts `orz-host-dirty` on every edit-state change after the
   handshake.

A host replies `ok: false` with an `error` to a save whose `html` is empty.

## 4. `orz-host-ai@1`

| Type | Direction | Payload |
|---|---|---|
| `orz-host-ai-hello` | host → file | `{ type, protocol: "orz-host-ai", version: 1, operations: [{ id, title, selection }] }` |
| `orz-host-ai-ready` | file → host | `{ type, protocol: "orz-host-ai", version: 1 }` |
| `orz-host-ai-request` | file → host | `{ type, protocol: "orz-host-ai", version: 1, requestId, op, text, selection }` |
| `orz-host-ai-result` | host → file | `{ type, protocol: "orz-host-ai", version: 1, requestId, ok, proposed?, error? }` |

- `operations` — what the host offers; the file shows them in its assistant.
  `id` is echoed in a request; `selection: true` means the operation runs on a
  selected passage. The file copies `id`, `title` (strings, non-empty) and
  `selection` (boolean); anything else is dropped.
- `op` — an advertised `id` (the file sends no other). `text` — the passage,
  or the whole document. `requestId` — correlates concurrent requests; the
  host echoes it unchanged (a string, or a finite number).
- `proposed` — the replacement text. The file shows it; the document is
  untouched until the user applies it, and an applied result is ordinary
  text that then saves through `orz-host-save` (or the file's own save), so it
  passes the host's save validation.
- Hello cadence as in §3. A request with no result within **30 s** fails; a
  result whose `ok` is not `true` or whose `proposed` is not a string is a
  failure.
- A file may decline AI (poster does today): it then never answers the hello,
  and the host's hello times out quietly.

## 5. `orz-host-include@1`

| Type | Direction | Payload |
|---|---|---|
| `orz-host-include-hello` | host → file | `{ type, protocol: "orz-host-include", version: 1 }` |
| `orz-host-include-ready` | file → host | `{ type, protocol: "orz-host-include", version: 1, kind }` |
| `orz-host-include-request` | file → host | `{ type, protocol: "orz-host-include", version: 1, requestId, url }` |
| `orz-host-include-result` | host → file | `{ type, protocol: "orz-host-include", version: 1, requestId, ok, markdown?, error? }` |

- After the handshake the file re-renders its **preview**, asking for each
  distinct include URL (`{{md-include https://…}}`, `{{markdown https://…}}`);
  the host resolves it under its own allowlist (SSRF guard) and replies with
  the Markdown, or `ok: false`. The file inlines a result into the **preview
  only** — the text keeps the directive.
- A request with no result within **30 s** resolves as unresolved: the
  directive is left in place.
- **A standalone file never resolves and never fetches** an include URL
  (RULES §5.3). A format-1 file reads includes resolved at assembly from its
  `#orz-includes` island (FC-18 §8.3). (Which of the two a hosted format-1
  preview prefers when both exist is left open; see spec/shell-runtime.md §5.)
- A file may decline includes (poster does, by design): it never answers the
  hello.

## 6. Security rules (both sides)

Assembled files are executable HTML, so the protocols are deliberately narrow.

**File side**

1. An unframed document (`window.parent === window`) never listens.
2. A message is read only when **`event.source === window.parent`**.
3. The origin is **pinned at the host's hello**: the first accepted hello of
   any of the three protocols records `event.origin`; afterwards a message
   from any other origin is dropped. An opaque parent (sandboxed or `srcdoc`
   embedder) serializes its origin as `"null"`, which cannot be pinned; the
   file then replies with `targetOrigin "*"` (its replies contain nothing the
   host does not already have). Otherwise replies go to the pinned origin.
4. **Nothing is active until the hello** of that protocol: no save goes to a
   host, no AI or include request is sent, no dirty signal is posted, and
   stray results or acknowledgements are ignored.
5. **Payloads are data, never evaluated:** strings are copied; a message can
   move save state or supply text the user may apply, nothing else; the file
   never renders host-supplied HTML.
6. **Ready is idempotent:** every accepted hello (a host's retries) gets the
   same ready (and, for save, the current dirty state); the handshake does
   not run twice.

**Host side (mirrored)**

1. A message is read only when `event.source === iframe.contentWindow`.
2. With an expected frame origin the host reads only that origin and posts
   its hellos to it (the browser drops a hello whose `targetOrigin` does not
   match). Without one it pins the origin of the first ready and reads only
   that origin from then on. Hosts **should** pass the expected origin, and
   `"null"` for an opaque frame.
3. Nothing before the ready: a save, dirty, AI or include message from the
   frame before the matching ready is ignored. A reloaded frame is a new
   document and must say ready again.
4. A ready with a version other than 1 is not a handshake (no common
   version). Duplicate readies (the retry loop makes them normal) are
   reported once.
5. Payloads are data: hosts **validate** the `source`/`html` they receive like
   any untrusted document content, and embed files in a **sandboxed
   iframe**.

## 7. Format-1 files

A file in text format 1 (FC-18) has two forms: the text twin (canonical) and
the assembled file. For such a file:

- `orz-host-save` carries **`source` = the text twin, exactly** (line endings,
  BOM, trailing whitespace — every character; a `postMessage` structured
  clone preserves strings exactly) and **`html` = the assembled file**
  (`assembleEnvelope` of that text). `extract(html).text === source`.
- **Hosts persist the text.** The assembled file is derived and can be
  regenerated by any shell that supports format 1; a host that keeps `html`
  too treats it as a cache.
- Document settings (theme, title, …) live in the text's header (FC-18 §5),
  so `theme` in the save is redundant for a format-1 file; it stays optional
  for @1 compatibility.

## 8. Versioning

- The host announces the version it speaks in its hello; the file answers
  with the highest version it supports **≤ the host's** (all current files
  speak only 1, so a hello with a higher version is answered with 1). A hello
  without `version` is read as version 1; a non-numeric or lower version is
  not a hello. A host that receives a ready it cannot speak abandons the
  handshake.
- Additive fields within a version are allowed and unknown fields are
  ignored. Any change a version-1 peer would misread is `@2`; both sides then
  keep supporting `@1` until every family member has moved.

## 9. Implementation notes (`orz-markdown/carrier/shell`)

```ts
// file side (the assembled file's runtime)
const host = connectHost({ kind: 'md', ai: { onOperations }, include: { onAvailable } });
host.connected(); host.save({ source, html, theme }); host.setDirty(true);
host.requestAi(op, text, selection); host.requestInclude(url);

// host side (an app embedding an assembled file)
const frame = embedCarrierFrame(iframe, {
  expectedOrigin: 'https://files.example',
  onSave: async ({ source, html }) => ({ ok: true }),
  ai: { operations, run: async ({ op, text, selection }) => ({ ok: true, proposed }) },
  include: { resolve: async (url) => markdownOrNull },
});
```

Neither side throws on a protocol path: saves and requests resolve with a
result (`{ ok: false, error }` or `null`) on refusal, timeout or disposal.
