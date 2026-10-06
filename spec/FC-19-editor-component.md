# FC-19 · Editor component API

**Status:** binding — approved by the owner on 2026-10-05 (orz family decisions
FD-05/FD-06, contract FC-19). Changes follow the family's contract-change rules.

## 1. One editor, two kinds of host

Each `orz-<x>-browser` package exports the editor for its kind. The assembled
file mounts it on itself (standalone host); a web app mounts it in its own page
(app host). Both get the same tools — layout picker, templates, theme picker,
lint, preview — so nothing is built twice and the app can pin the version it
wants (FD-06).

## 2. Exports of `orz-<x>-browser`

```ts
mountEditor(element: HTMLElement, options: EditorOptions): Editor
assemble(text: string, options?: { delivery?: "inline" | "cdn"; engineSource?: string }): Promise<string>
extract(html: string): { text: string; kind: Kind; format: number; shell: string } | null
readDocument(text: string): DocumentInfo        // header + derived facts, no rendering
renderPreview(text: string, options?): Promise<string>  // sandboxable HTML for thumbnails / read-only views
version: string                                  // the shell version
```

`readDocument` lets an app index documents (title, author, licence, keywords,
kind, `uid`, theme) without rendering — what Alembic's discovery space needs.

`engineSource` (optional) is the exact text of this browser bundle. An inline
assembly (`delivery: "inline"`) inlines it instead of fetching or embedding a
copy of its own — the quiet update (spec/shell-runtime.md §7) passes the
bundle it has just verified, so the new file carries exactly those bytes.

**The standard bundle global** (binding addition, 2026-10-05). Every carrier
browser bundle (`orz-<x>.browser.js`, the file named by `bundle.path` in its
`release.json`, spec/shell-runtime.md §6) sets, when it loads:

```ts
globalThis.OrzCarrier = {
  kind: Kind;                 // "md" | "slides" | "paged"
  version: string;            // the shell version (= the package version)
  formats: number[];          // the text formats it reads and writes (FC-18)
  assemble, extract, readDocument, mountEditor,   // as above
  renderPreview?,             // as above
};
```

The update runs `OrzCarrier.assemble` of a newer release in a sandboxed
opaque-origin iframe, with nothing else from the page available, so
`assemble` must work from the bundle alone (no page DOM, no storage, no
network for `inline` beyond what the bundle carries) and must write
`shell = version`. The bundle must be script-safe (no `<script` or
`</script` sequence; spec/shell-runtime.md §6).

## 3. `EditorOptions`

```ts
interface EditorOptions {
  text: string;                       // the document (FC-18), exact
  kind?: Kind;                        // when it cannot come from a file name
  readOnly?: boolean;
  mode?: "split" | "editor" | "preview";
  chrome?: "full" | "compact" | "none";   // labels / icon-only toolbar / none (the host drives the API)
  hooks?: EditorHooks;
  preferences?: PreferenceStore;      // reader preferences (FC-18 §6); default: localStorage
}

interface EditorHooks {
  save?(text: string): Promise<void>;                      // absent → standalone file save
  ai?: { operations: AiOperation[];
         request(op: string, ctx: { text: string; selection?: Range }): Promise<{ proposed: string }> };
                                                           // Range = { from, to }: offsets in the exact text
  fetchInclude?(target: string): Promise<string | null>;   // URL or path; host owns the trust policy
  resolveAsset?(path: string): string;                     // relative path → URL for preview
  uploadAsset?(file: File): Promise<string>;               // returns the relative path to insert
  resolveLink?(href: string): string;                      // e.g. map twin links inside an app; also preview link clicks
  mintUid?(): Promise<string>;                             // host-minted ids (FC-18 §10)
}
```

## 4. `Editor`

```ts
interface Editor {
  getText(): string;                     // exact (BOM, line endings as given)
  setText(text: string, options?: { resetHistory?: boolean }): void;
                                         // one undoable edit unless resetHistory; does not mark saved
  setHeader(changes: Record<string, HeaderChange>): void;   // FC-18 §9 via editHeader, one undoable edit
  undo(): boolean;
  redo(): boolean;
  isDirty(): boolean;
  markSaved(): void;
  save(): Promise<SaveOutcome>;          // hooks.save or the standalone save; never rejects
  setMode(mode: "split" | "editor" | "preview"): void;     // Cmd/Ctrl+\ cycles the modes
  focus(): void;
  on<E extends keyof EditorEvents>(event: E, fn: (e: EditorEvents[E]) => void): () => void;
  destroy(): void;
  // added 2026-10-06 (additive; see below)
  requestAi(op: string, options?: { selection?: boolean }): Promise<AiOutcome>;   // hooks.ai, one undoable edit; never rejects
  uploadAssets(files: ArrayLike<File>): Promise<UploadOutcome>;                  // hooks.uploadAsset, Markdown at the selection
  ensureUid(): Promise<string>;                  // the header uid; minted (hooks.mintUid) and set as one undoable edit when absent
  setReadOnly(readOnly: boolean): void;          // a newer text format stays read-only (§8.3)
  isReadOnly(): boolean;
}

type AiOutcome = { ok: true; op: string } | { ok: false; error: string };
type UploadOutcome = { ok: true; inserted: string[] } | { ok: false; inserted: string[]; error: string };

type SaveVia = "hook" | "host" | "file" | "download";
type SaveOutcome =
  | { ok: true; via: SaveVia }
  | { ok: false; via?: SaveVia | "served-notice"; error: string; cancelled?: boolean };

interface EditorEvents {
  change:    { text: string };
  dirty:     { dirty: boolean };
  selection: { from: number; to: number };   // offsets in the exact text (BOM, CR LF counted)
  save:      { text: string; via: SaveVia };
  error:     { source: "save" | "render" | "adapter" | "format" | "hook"; message: string; error: unknown };
}
```

`error` sources `format` (the text's header `format` is newer than the
editor's, FC-18 §8.4: shown read-only, never saved) and `hook` (an upload, AI
or uid hook failed) were added on 2026-10-06 (additive).

`requestAi`, `uploadAssets`, `ensureUid`, `setReadOnly` and `isReadOnly` were
added on 2026-10-06 (additive, closed loop 2 round 2): the shell had them
(§8.8), and an app host needs them to drive the §3 hooks from its own UI and
to lock the editor (e.g. while it saves elsewhere). Each re-checks read-only
and `destroy()` after every wait: a result arriving after either changes
nothing. The preview channel (`shell.preview`, §8.4) is not part of `Editor`:
it is a carrier's protocol with the frame document the carrier itself
writes, not something an app host drives.

After `destroy()`, `getText()` returns the text as it was; `setText`,
`setHeader` and `markSaved` do nothing, `undo`/`redo` return false, `save()`
resolves `{ ok: false }`, and work still in flight (a save hook, an upload, an
AI request, a uid) changes nothing and posts nothing to a host.

**Standalone saves and the host connection.** Without `hooks.save`, `save()`
follows the standalone order of spec/shell-runtime.md §1, whose first step is
a connected host. In an assembled file opened inside a host frame, the file's
own runtime holds that connection (`connectHost`, spec/host-protocols.md);
the carrier's `mountEditor` passes it to the saver, so a save goes to the
host (`via: "host"`) and the dirty state is posted to it. A carrier never
opens a second connection for its editor.

## 5. Invariants

1. **Browser only, no server.** Editing, preview and `assemble` need no
   backend; the engine and editor load from the package (inline) or the CDN.
2. **Several instances per page**, no global state, nothing leaks between them
   (separate undo history, preferences namespaced by `uid`).
3. **Isolation.** The chrome renders in a shadow root (the host's CSS cannot
   break it, and it cannot restyle the host); the document preview renders in
   a sandboxed frame (orz-markdown preview frame), so document content never
   runs in the host page. One exception (owner, 2026-10-06): a standalone
   file opened from disk (`file:`, the top-level window, no connected host)
   gives its preview frame the page's origin, so relative local images show;
   the document already runs in that page.
4. **CSP-friendly:** no `eval`, no inline event handlers.
5. **Text is the only output.** The component never changes text it was not
   asked to change: block IDs (FC-02), unknown and host header keys, and
   formatting survive every operation; header edits follow FC-18 §9.
6. **Quiet updates** (FD-05) appear only in the standalone host. In an app
   host the app owns the component version, so there is no indicator.
7. **Accessible:** keyboard-operable, labelled controls, focus visible.

## 6. Golden corpus and conformance

**Corpus** (`orz-markdown/tests/carrier-corpus/`, shared by all carriers):

```
carrier-corpus/
  md/       minimal.md · every-construct.md · no-header.md · legacy-meta-block.md
            host-keys.md · crlf.md · bom.md · script-close.md · large.md
  slides/   minimal.slides.md · every-layout.slides.md · every-template.slides.md
            markers-in-code.slides.md · notes-and-fragments.slides.md · …
  paged/    minimal.paged.md · every-template/*.paged.md · columns-across-pages.paged.md · …
  expected/<kind>/<shell-version>/*.html   assembled outputs, regenerated per release
```

**Checks:**

| Check | Where |
|---|---|
| FC-18 laws 1–3 on every corpus file and on random text | unit tests, Node and browser |
| `readDocument` agrees with the header for every file | unit tests |
| create → edit → save → reopen keeps the text exact | Playwright, real Chrome |
| update from the previous shell keeps the text exact, boots, edits, saves | Playwright, against `expected/<prev>/` |
| host handshakes (`orz-host-save/-ai/-include@1`) for iframe-embedded files | Playwright host harness |
| component in a test app: two instances, hooks called, CSS isolation | Playwright |

The display defects D-46 (title template v2), D-47 (layout change freeze) and
D-48 (columns across a page break) become corpus files with screenshot checks
once fixed.

## 7. Versioning

The component's version is the carrier's version (`orz-<x>` and
`orz-<x>-browser` in lockstep). Additive options and hooks are minor releases;
removing or changing one is a major release. The text format is versioned
separately (FC-18).

## 8. Editor shell (implementation note, orz-markdown `carrier/editor`)

**Status:** binding with §3–§4 (approved 2026-10-06, §8.7). This section
describes how the shared base implements them; additions made since are
additive (§7) and listed in §8.8.

Each carrier's `mountEditor` wraps one kind-independent base, exported by
orz-markdown as `orz-markdown/carrier/editor` (`src/carrier/editor/`). The
carrier adds its kind's tools (layout and template pickers, theme picker,
lint) to the shell's toolbar slot and supplies its renderer and `assemble`.
Claims E.1–E.25 (`notes/CLAIMS.md`), tests `tests/carrier-editor.test.ts`.

### 8.1 Mounting

```ts
const shell = createEditorShell(element, {
  text,                              // exact (FC-18)
  render(text, ctx) { return html; },// the kind's preview renderer; md: renderMarkdownPreview or renderMarkdownPreviewWithIncludes
                                     //   (ctx: { fetchInclude?, resolveAsset?, twinLinks?, cache? })
  adapter?,                          // default codemirror6Adapter()
  mode?, readOnly?, chrome?,         // as FC-19 §3
  formats?,                          // text formats it reads and writes (default [1]; the carrier's OrzCarrier.formats)
  hooks?,                            // FC-19 §3 EditorHooks: save, ai, fetchInclude, resolveAsset, uploadAsset, resolveLink, mintUid
  assemble?, fileName?, kind?, host?, saver?,   // standalone host: assemble(text) → html, then createSaver
  openedHtml?,                       // the opened file's bytes for the saver (§8.5); default assemble(text)
  standalone?,                       // the assembled file's own boot passes true (§8.4 sandbox)
  uid?, preferences?, storage?,      // reader preferences (default store namespaced by the header uid)
  preview?: { head?, scheme?, articleClass?, assets?, debounceMs?, readyTimeoutMs?, nonce?,
              frameDocument?, bridge?, diff?, mode?, mapLine?, mapPosition? },
  onLink?, label?, narrowWidth?,
});
shell.getText() / setText(text, { resetHistory? }) / setHeader(changes) / isDirty() / markSaved()
shell.save(): Promise<SaveOutcome>        // never rejects
shell.requestAi(op, { selection? }) / uploadAssets(files) / ensureUid()   // §8.8
shell.setReadOnly(flag) / isReadOnly()    // run-time read-only (§8.3)
shell.setMode(m) / getMode() / getView() / setSplitRatio(r) / getSplitRatio() / undo() / redo()
shell.focus() / on(event, fn) → off / refreshPreview() / destroy()
shell.root (its shadow root) / shell.toolbar (the carrier's slot) / shell.adapter / shell.ready / shell.readOnly
shell.preview.post(msg) / on(type, fn) → off / setOptions({ head?, scheme? })   // the frame channel (§8.4)
```

### 8.2 Layout, modes, keyboard

- One host element appended to `element`, with an open shadow root holding
  `CHROME_CSS` and `EDITOR_CSS` (constructed stylesheets): a toolbar
  (Editor / Split / Preview with `aria-pressed`, the carrier's slot, the save
  state, Sync scroll, Save), an optional served-page notice, the editor pane,
  a separator and the preview pane. `chrome: 'compact'` hides the labels
  (icons stay, controls keep their `aria-label`); `'none'` has no toolbar.
- Modes `split` / `editor` / `preview`. Cmd/Ctrl+\ cycles split → editor →
  preview → split. Below `narrowWidth` (640 px) of the shell's **own** width
  (a `ResizeObserver`; an app may give it a narrow column) only one pane
  shows: `split` shows the editor, Cmd/Ctrl+\ flips editor ↔ preview, the
  Split button hides. `getView()` is what shows.
- Cmd/Ctrl+S saves; Esc in the editor moves focus to the toolbar (so Tab
  indentation never traps focus). The preview frame forwards the same keys
  (§8.4 says when the shell acts on them).
- The separator (`role="separator"`) drags with pointer capture and moves by
  5 % with the arrow keys, Home/End to 10 % / 90 %; the ratio (editor share,
  0.1–0.9) is a reader preference.

### 8.3 Text and history

- The shell owns the text. Engines edit LF text without a BOM; the text
  model keeps the document's BOM and line-ending style (that of its first
  line break, FC-18 §8.1). An editor text equal to the LF form of a text the
  shell was given (`text`, `setText`, `setHeader`) reads back as **that exact
  text** — so an unedited document, or one undone back to a known state,
  round-trips byte for byte, mixed line endings included — and that text's
  BOM and line-ending style become the document's again (each remembered
  text keeps its own: undoing a `setText` of an LF text back to a BOM + CR LF
  document writes the next edit in CR LF with the BOM); other texts are
  written in the document's style. Selection offsets in a remembered text are
  mapped on that exact string (mixed line endings exact). The texts
  remembered are the 16 most recent ones given plus, whatever that window
  holds, the initial text and the saved one — so undoing any number of edits
  back to either is exact and clean. A remembered text keeps its exact string
  only when its editor form, BOM and line ending cannot rebuild it (mixed line
  endings): a CR LF document costs one copy per remembered text, not two.
  `destroy()` forgets them.
- `setText(text)` is one undoable edit (the smallest replacement, so the
  caret survives) — also right after typing; `{ resetHistory: true }` starts
  the history over. It does not mark the text saved.
- `setHeader(changes)` = `setText(editHeader(getText(), changes))`: one
  undoable edit, FC-18 §9 rules; what `editHeader` refuses throws, changing
  nothing.
- `isDirty()` = the text differs from the last saved one (undoing back to it
  is clean); per keystroke the shell compares editor forms first (a different
  editor text is a different text) and converts only when they are equal.
  Events: `change { text }` (the exact text captured when it fires), `dirty
  { dirty }`, `selection { from, to }` (offsets in the exact text), `save {
  text, via }`, `error { source, message, error }`.
- **Text formats** (FC-18 §8.4, D7): a header `format` greater than the
  largest of `formats` (default `[1]`) opens read-only (forced), shows a
  quiet notice (`#orz-format-note`) and emits `error { source: 'format' }`
  once the caller could subscribe; `save()` refuses such a text — also one
  set later through the API — with `{ ok: false, error }`, without calling
  `hooks.save`, `assemble` or the saver.
- **Read-only at run time.** `setReadOnly(flag)` switches the engine
  (CodeMirror through a compartment; also when set while it still loads), the
  Save button, Cmd/Ctrl+S, `save()`, uploads and AI; `isReadOnly()` (and
  `readOnly`) tell the state. A carrier makes the editor read-only while a
  quiet update runs (spec/shell-runtime.md §7.2). A document in a newer text
  format stays read-only: `setReadOnly(false)` does not unlock it.

### 8.4 Preview

- An iframe whose `sandbox` is decided in one place,
  `previewSandbox({ host, protocol, topLevel?, connected? })` — `allow-scripts`
  exactly in every app host and on every served page (opaque origin: the
  document's scripts run in it and cannot reach the host page, its storage or
  cookies). A standalone `file:` page that is the top-level window with no
  connected host gets `allow-scripts allow-same-origin` (owner decision
  2026-10-06, finding B-2): an opaque frame is refused `file:` subresources,
  so relative local images would never show. The document's own raw HTML is
  not filtered (only fetched includes are, claims M.16/M.20); but in a
  standalone `file:` page the same document already runs in that page as its
  read view, so the same-origin frame gives it no reach it did not have — its
  scripts can reach the editor and the page's storage there, which the owner
  accepts for local files. The shell infers standalone (no `hooks.save`, an
  `assemble`, no `host`, a top-level window) unless `standalone` says; the
  assembled file's own boot passes `standalone: true`, and even then a framed
  or hosted `file:` page keeps the opaque frame.
- `srcdoc` = the default bridge script **first in `<head>`**, before any
  stylesheet (a script after a pending stylesheet waits for it: a slow theme
  would hold back the ready and every render), then the stylesheets
  (`preview.head`: the carrier's theme links — shell markup, never document
  content), `<article id="orz-doc">` and the pinned preview libraries
  (`getPreviewFrameAssets`, `__orzEnhance`) — the preview shows at once and is
  enhanced when they arrive. The default bridge finds `#orz-doc` when a render
  arrives. A carrier's own `preview.bridge` keeps its place after the article.
- The shell posts `{ type: 'orz-preview-render', id, html }` after the frame
  says `orz-preview-ready` (and again on a new ready). The bridge keeps every
  top-level node whose HTML is unchanged (common prefix and suffix), compared
  **without** `data-src-line` — the new line numbers are copied onto the kept
  nodes — so a line inserted above does not redraw the blocks below; drawn
  diagrams and the scroll position survive typing. It re-runs `__orzEnhance`
  and reports the `data-src-line` anchors with the render's `id`.
- **The private channel.** The default bridge's ready carries a random
  `channel` token; the shell answers `{ type: 'orz-preview-port', channel }`
  with a MessageChannel port, which the bridge takes in a capture listener
  registered before anything else in the frame (hidden from the frame's other
  listeners) before any document content exists — that only arrives through
  the port. From then on the shell's messages go through the port (so a shell
  mounted into another window's document by that window's opener reaches its
  frame: the frame no longer depends on which window posted), and the
  bridge's reports come only through it: it sends them with `Reflect.apply`
  and `MessagePort.prototype.postMessage` as they were when it started, and
  only for trusted events (`isTrusted`) — keys, link clicks, pointer / wheel /
  touch / key input, scrolls, and focus. The same report types posted on the
  window are a document script's and are ignored. A carrier's own bridge
  without a port speaks window messages, which the shell reads as before
  (claims; the gates below).
- **When renders run.** A render runs until the frame acknowledges it
  (`orz-preview-rendered` with its `id`; a bridge that reports no id
  acknowledges any render; one that never reports is not waited for after
  its first render, and no render waits more than 10 s). The next one runs
  after a pause in typing of `max(debounceMs, 2 × the last render and frame
  time)` (`debounceMs` 150), never while one runs (another is coalesced into
  one more render of the latest text), not while only the editor shows; while
  edits continue it runs at least every `max(1000 ms, 4 × the last render and
  frame time)`. A failing `render` keeps the last preview (`error`).
- **Pluggable preview** (orz-slides, orz-paged): `preview.frameDocument(parts)`
  writes the whole frame document from `parts = { head, bridge, scripts,
  scheme, articleClass, nonce? }` (the bridge and library `<script>`s and the
  stylesheet links, nonce-stamped; put `parts.bridge` before the stylesheets
  and `parts.head` in `<head>`: while the document's scripts are paused it
  starts with the pausing `<meta>` policy); `preview.bridge` replaces the
  bridge script (script-safe, speaking the protocol below);
  `preview.diff: false` makes every render replace the content whole, keeping
  the scroll position (a renderer that reflows nodes);
  `preview.mapLine(line, { anchors, max })` / `mapPosition(top, ctx)` replace
  the anchor maths (return `null` for the default); `preview.mode:
  'navigate'` posts the source line instead of a top — the caret's line while
  the editor has focus, else its top line; and the caret's line whenever a
  view change shows the preview, again once it has rendered — and reads a
  line back.
- **Page hooks of the default bridge**, so a carrier's frame document can
  customise it without its own bridge (keys, Escape, links, input, focus,
  ready and the port stay the bridge's): `window.__orzPreviewApply(html,
  msg)` replaces the DOM update (it may return a promise; the render is
  acknowledged when it settles), `window.__orzPreviewNavigate(line)` gets
  `orz-preview-navigate`, `window.__orzPreviewMessage(msg)` any other message
  from the shell. `window.__orzPreview.report()` re-reports the anchors (after
  an asynchronous layout); `window.__orzPreview.post(msg)` posts a carrier's
  own message to the shell as a window message — a claim, like any. These
  hooks share the frame with the document's scripts, which can define them
  too: they gain nothing they could not do to the frame's DOM already.
- **The channel API.** `shell.preview.post(msg)` posts a carrier's own
  message to the bridge (false while the frame is not ready);
  `shell.preview.on(type, fn) → off` hears the frame's messages of a type
  (claims: data); `shell.preview.setOptions({ head?, scheme? })` rebuilds the
  frame document (e.g. a theme change) and shows the last HTML again.
- Protocol (shell → frame): `orz-preview-port { channel }` (with the port),
  `orz-preview-render { id, html, diff? }`, `orz-preview-scroll { top }`,
  `orz-preview-navigate { line }`, `orz-preview-ping { id }`, and a carrier's
  own types; (frame →
  shell): `orz-preview-ready { channel? }`, `orz-preview-rendered { id,
  anchors: [line, top][], max }`, `orz-preview-scrolled { top, max }` or
  `{ line }`, `orz-preview-key { key: 's' | '\\' | 'Escape' }`,
  `orz-preview-link { href }`, `orz-preview-active { input? }`,
  `orz-preview-focus { reader, late? }` and `orz-preview-pong { id, pointer }`
  (port only), and a carrier's own types.
- Scroll sync (a reader preference): positions map through the anchors (line
  ↔ top, linear between anchors), proportionally when there are none. Anchor
  lines are 0-based lines of the whole text (`renderMarkdownPreview` adds the
  header's lines). The editor leads unless the preview does: focus on the
  preview iframe, or a recent `orz-preview-active` of the frame (wheel,
  pointer, touch, keys) while the editor has no focus and was not touched in
  the host page (pointer, wheel — also on an unfocused editor —, keys) in the
  last 300 ms.
- **What the frame reports.** Through the port, a key (save, view, Escape)
  or a link is the reader's own input in the frame and acts. Without a port
  (a carrier's own bridge) the frame's messages are claims of the document's
  scripts: a save key, the view key or a link acts only while focus is on the
  preview iframe **and** the page has transient user activation; an Escape
  needs the focus only (all it does is move focus from the frame to the
  toolbar). So a document script that floods these messages moves nothing,
  saves nothing and opens nothing — with the default bridge, not even while
  the reader is in the frame (finding B-15, accepted in round 1, is closed for
  the default bridge; it stands for a carrier's own bridge).
- **Focus theft** (finding F1). A document script can focus an element of
  its frame at any time, and the reader's keys then go to the frame. The
  default bridge reports, when the frame gains the focus, whether the
  reader's own pointer or touch in the frame brought it there. Focus that
  arrives otherwise — not by a Tab in the page, the shell's own `focus()`,
  or a press on the preview pane in the page either (Chrome sends a click to
  the iframe element itself while the frame cannot be hit yet, and that
  click focuses the frame with no pointerdown inside it) — goes back at once to where the reader was (the page's element,
  the shell's, else the shell's region when the reader was not in it; no key reaches the
  frame meanwhile; the bridge's report can arrive before the page has seen
  the focus leave, and a frame reloaded to pause its scripts may take the
  focus when it commits, so a blur the page sees in the next second is undone
  too, and a key that finds nothing focused then goes to the editor). Chrome may move the focus into the frame a moment before
  the click's pointerdown reaches it, so the shell then asks the bridge
  through the port (`orz-preview-ping { id }` → `orz-preview-pong { id,
  pointer }`; input already queued in the frame is handled before the
  question) whether the reader's pointerdown followed — as does a late report
  of it (`{ reader: true, late: true }`). Yes: it was the reader, and the
  frame gets the focus back. No (and no report of the reader's pointer in
  the next 1.2 s, in which a loaded machine may still deliver it), the focus
  taken again before the question is settled (a click does not do that, a
  script does: then at once), or no answer within 1.5 s: theft — the
  document's scripts are paused in the preview: a new frame replaces the old
  one (removing it ends the document at once; a new `srcdoc` would keep it
  running until the new one commits), built under a `<meta>`
  policy `script-src 'nonce-…' 'strict-dynamic'` that runs only the frame's
  own nonce-stamped scripts (and what they load), with a quiet note in the
  pane and an `error { source: 'render' }` 0.5 s later; a late report of the
  reader's pointer (within 1.5 s of the focus, or of the bridge starting in
  a frame that has it) arriving within that time undoes the pause: the
  document's scripts run again and the reader gets the frame. Limit: a key typed in the
  moment of the first theft, before the focus is back, can reach the frame; a
  carrier's own bridge gets no theft defence.
- **Links** clicked in the preview never navigate the frame: `#fragment`
  links scroll it; others go through `hooks.resolveLink` (when given; it gets
  the source href — with it, the shell asks the renderer for links as written,
  `ctx.twinLinks: false`) to `onLink` (the host decides). Without `onLink`
  an `http(s):` or `mailto:` link is offered in a chip in the preview ("Open
  <host>?"), opened in a new tab with `noopener` only when the reader clicks
  Open: a frame never opens a window by itself.
- **Content-Security-Policy.** A `srcdoc` frame inherits the policy of the
  page that holds it, so an app's CSP applies inside the preview too, and
  the preview needs from it: scripts — the bridge and the libraries' setup by
  nonce (`preview.nonce`, stamped on every `<script>`, `<style>` and
  stylesheet `<link>` of the frame document) or by hash (`PREVIEW_BRIDGE_HASH`,
  `previewScriptHashes(options)`), and with `assets` the library hosts
  (`cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `unpkg.com`) or
  `'strict-dynamic'`; CodeMirror's bundle from `cdn.jsdelivr.net` (or the
  `url` an app serves it from; `codemirror6Adapter({ nonce })` stamps the
  nonce on its `<script>` and gives it to CodeMirror's `<style>`); styles —
  the stylesheet hosts (KaTeX on `cdn.jsdelivr.net`, highlight.js on
  `cdnjs.cloudflare.com`, the carrier's theme), `style-src-attr
  'unsafe-inline'` (KaTeX and the diagram libraries write `style` attributes;
  without it formulas lose their layout), and `<style>` elements that
  libraries insert at run time (Mermaid, Paged.js) need `'unsafe-inline'` in
  `style-src-elem` or a carrier that stamps them; fonts — KaTeX's font host;
  images — wherever the document's images are (`resolveAsset` decides). A
  frame that does not say ready within `preview.readyTimeoutMs` (8 s) is an
  `error { source: 'render' }` and a quiet notice in the preview pane instead
  of a blank pane (it goes when the frame starts after all); the message
  suggests a policy that blocks the bridge, the usual cause — a slow
  stylesheet no longer delays the ready.

### 8.5 Save

- App host (`hooks.save`): `hooks.save(getText())`.
- Standalone host: `assemble(getText())` → `createSaver({ uid, suggestedName:
  fileName, kind, host, openedHtml }).save({ text, html })`
  (spec/shell-runtime.md §1). `openedHtml` — the bytes of the file the page
  was opened from, which prove that a remembered file handle still points at
  that file (shell-runtime §1, steps 3.1–3.3) — is the `openedHtml` option
  (a string or a function; the assembled file's own HTML as loaded), else
  `assemble` of the text the shell was mounted with, which reproduces an
  assembled file (FC-18 law 3). Without it every reload would get the picker
  and a quiet update would never reload. A
  served page shows the `#orz-served-note` notice — on Cmd/Ctrl+S only when
  there are unsaved edits (the Save button and `save()` always show it);
  "Download a copy" calls `saver.download`. A cancelled picker is not an
  error.
- One save at a time; dirty clears only on success (an edit made during the
  save stays dirty); a toast announces the result — "Download started." for
  a download (the browser has it; it may not have finished; dirty clears),
  "Saved." otherwise; `save()` never rejects. With a connected host
  (`connectHost`), the dirty state is posted to it. A newer text format is
  never saved (§8.3). A save started before `destroy()` starts nothing new
  after it (no saver call after an `assemble` that finishes later) and posts
  nothing to the host.

### 8.6 Engines (`TextEditorAdapter`)

```ts
interface TextEditorAdapter {
  readonly name: string;
  mount(el, { doc, readOnly, onChange, onSelection?, onScroll?, root?, label? }): void | Promise<void>;
  getDoc(): string;                                  // LF, no BOM
  setDoc(text, { resetHistory? }): void;             // one undoable step unless resetHistory
  focus(): void; destroy(): void;
  // optional: getSelection, setSelection, setReadOnly, hasFocus, undo, redo, getScroll → { line, fraction }, scrollTo({ line | fraction }), ready()
}
```

- `codemirror6Adapter({ loadModules?, url?, timeoutMs?, nonce? })` — CodeMirror 6
  with the Markdown language, line wrapping, history, search, bracket
  matching, the Markdown keymap (list continuation) and Tab indentation,
  styled with the chrome tokens, mounted in the shell's shadow root. It is a
  textarea at once and upgrades in place when CodeMirror arrives: from the
  textarea's **current** text (typed or set while loading), with its
  selection, focus and scroll, and its newest undo steps (each of the last
  `CODEMIRROR6_HISTORY_STEPS` = 100 textarea steps becomes one CodeMirror undo
  step, replayed from the stored patches — `undoSteps` — without a whole text
  per step: 200 steps of a 1.25 MB document took 20.9 s and 586 MB before).
  If CodeMirror cannot load it stays a textarea and `ready()` reports the
  error (the shell warns once). `nonce` goes on the bundle's `<script>`
  (`loadCodeMirror6(doc, { nonce })`) and to CodeMirror's `<style>`
  (`EditorView.cspNonce`).
- **Loading.** Default: ONE pinned bundle, `vendor/codemirror6.js` of the
  orz-markdown package (exact versions in `CODEMIRROR6_VERSIONS`; built by
  `npm run build:codemirror`), from
  `https://cdn.jsdelivr.net/npm/orz-markdown@<VERSION>/vendor/codemirror6.js`
  by one `<script integrity crossorigin>` per document (no eval, no inline
  script; Subresource Integrity pins the bytes; script-safe, so a carrier may
  also inline it, and the adapter then uses the global it set without
  fetching). Per-package `+esm` URLs are not used: jsDelivr resolves
  `@codemirror/state` to a different version in each, and CodeMirror refuses
  two copies. `url` (a code option, never read from a document) serves the
  same bytes from elsewhere; `loadModules` lets an app that bundles
  CodeMirror pass its own modules (`{ state, view, commands, language,
  markdown, search? }` — module namespaces), and nothing is fetched.
- `textareaAdapter()` — a plain `<textarea>` with its own undo history
  (typing and runs of deletions grouped; only the newest step of each stack
  holds a whole text, older steps hold patches, so a large document does not
  cost a copy per step; a patch is a flat copy, `detachString`: V8 keeps a
  slice of 13 or more characters as a view on the whole text it was cut
  from, so slices kept a whole text alive per step); no network. Tests and
  offline files use it.

### 8.7 Refinements (approved 2026-10-06)

The refinements this note proposed — `save()` resolving a `SaveOutcome`;
`setHeader`, `undo`, `redo`; bound event payloads; `setText` undoable by
default; `compact` = icon-only with Cmd/Ctrl+\ cycling the modes;
`resolveLink` covering preview clicks — and the host-connection rule for
standalone saves are now binding in §3–§4.

### 8.8 Hooks and additions (2026-10-06, additive)

The kind-independent §3 hooks live in the shell (`hooks`, shaped like
`EditorHooks`; `hooks.save` as before):

- `fetchInclude`, `resolveAsset` — passed to `render(text, ctx)` as `ctx`
  (`renderMarkdownPreview` accepts it, so it can be passed as `render`
  directly; `renderMarkdownPreviewWithIncludes` uses `ctx.fetchInclude` to
  resolve URL includes with `prepareSources` first, each URL fetched once per
  shell through `ctx.cache`, a per-shell map; anchors before the first
  include and after the last stay exact, included text anchors at the
  include). `ctx.twinLinks` is `false` when `hooks.resolveLink` is given
  (links rendered as written). The shell itself sends the rendered HTML through
  `resolveAsset` before it enters the frame (`rewriteAssetUrls`): relative
  `src`, `poster`, every `srcset` URL and `href` on elements other than `<a>`
  / `<area>`; absolute, root (`/…`), fragment and `data:` references stay; a
  throwing resolver leaves the reference; `srcset` is read as the HTML
  standard reads it (`mapSrcset`: a URL runs to whitespace, trailing commas
  end a candidate, descriptors run to a comma outside parentheses). A renderer should not resolve these
  attributes itself (the shell would see its relative results again).
- `resolveLink` — preview link clicks (§8.4).
- `uploadAsset` — a file pasted or dropped into the editor (capture phase,
  before the engine reads it as text) is uploaded and its Markdown inserted at
  the selection as one undoable edit: `![name](path)` for `image/*`, else
  `[file name](path)` (spaces, parentheses and angle brackets in the path
  percent-encoded); the caret goes after it. `uploadAssets(files)` does the
  same from code. A failing upload is `error { source: 'hook' }` and a toast.
- `ai` — `requestAi(op, { selection? })`: `hooks.ai.request(op, { text,
  selection? })` with the exact text and, for a passage operation
  (`operation.selection`, or `{ selection: true }`), the selection as exact
  offsets; `proposed` replaces the passage or the whole text as ONE undoable
  edit, written in the document's line endings (and BOM). Refused (`{ ok:
  false, error }`) when read-only, without a selection for a passage, when
  the hook fails (`error { source: 'hook' }`) or when the text changed while
  the request ran, or when the shell became read-only or was destroyed while
  it ran. No UI: a carrier puts its AI menu in the toolbar slot.
- `mintUid` — `ensureUid()`: the header `uid`, or a new one (`hooks.mintUid`,
  else the kit's `mintUid`) set as one undoable header edit; a minted value
  must match `UID_PATTERN`; a uid set while the host mints wins, and nothing
  is set when the shell became read-only or was destroyed meanwhile. The
  preference namespace stays the one read at mount.
- Also: `formats` (§8.3), `setReadOnly` / `isReadOnly` / `readOnly` (§8.3),
  the preview options of §8.4, `setSelection` and `setReadOnly` on adapters, and exports `previewSandbox`,
  `previewFrameParts`, `rewriteAssetUrls`, `previewScriptHashes`,
  `PREVIEW_BRIDGE_HASH`, `PREVIEW_READY_TIMEOUT_MS`.
- Round 2 of closed loop 2 (2026-10-06, additive): options `standalone`,
  `openedHtml`, `preview.pauseScripts` (set by the shell), the render
  context's `twinLinks` and `cache`; `shell.preview` (`post`, `on`,
  `setOptions`); the bridge's port, page hooks and `orz-preview-focus`;
  `codemirror6Adapter({ nonce })`; `PreviewController` `post`, `on`,
  `setOptions`, `pauseScripts`, `resumeScripts`, `scriptsPaused`,
  `acknowledges`, `authenticated`, `render()` resolving when the frame
  acknowledges it, and `iframe` as a getter (pausing replaces the element);
  `PreviewEvents.onFocus`, `onPong` (and `trusted` on `onKey` / `onLink` /
  `onActive`);
  exports `renderMarkdownPreviewWithIncludes`, `mapSrcset`, `undoSteps`,
  `detachString`, `CODEMIRROR6_HISTORY_STEPS`.
