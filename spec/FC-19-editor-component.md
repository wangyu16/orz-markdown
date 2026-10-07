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
assemble(text: string, options?: { delivery?: "inline" | "cdn"; engineSource?: string; includes?: Record<string, string> }): Promise<string>
extract(html: string): { text: string; kind: Kind; format: number; shell: string; delivery: string; includes?: Record<string, string> } | null
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

`includes` (optional; added 2026-10-06, closed loop 2 round 3, additive) are
resolved includes to store in `#orz-includes` exactly as given (FC-18 §8.3,
D4) instead of resolving the text's include directives. A page cannot read
local files, so the browser's re-assemblies pass the opened file's
(`extract(html).includes`): the editor's standalone save (§8.5) and the
quiet update, which refuses a new file that does not hold them exactly
(spec/shell-runtime.md §7.2). Absent or empty: no `#orz-includes`. A bundle
that ignores the option loses the includes and cannot update such a file.

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
  nonce?: string;                     // added 2.2.0: an app's CSP nonce (§8.4) for the preview and the editor's scripts and styles
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
  // added 2.2.0 (additive): the review flow (host-protocols §4)
  proposeAi(op: string, options?: { selection?: boolean }): Promise<AiProposalOutcome>;  // hooks.ai, nothing changed; never rejects
  applyAi(proposal: AiProposal, options?: { proposed?: string }): AiOutcome;          // one undoable edit; refused if the text changed
}

type AiOutcome = { ok: true; op: string } | { ok: false; error: string };
type AiProposal = { op: string; proposed: string; range: Range; original: string; passage: boolean };  // frozen
type AiProposalOutcome = { ok: true; op: string; proposal: AiProposal } | { ok: false; error: string };
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

**The review flow** (2.2.0, additive). host-protocols §4 says an AI result
is a proposal the reader applies; `requestAi` applies at once (kept,
unchanged: it is `proposeAi` then `applyAi`). `proposeAi(op, { selection? })`
runs `hooks.ai.request` exactly as `requestAi` does and changes nothing: it
resolves the proposal with the exact-text `range` it would replace (the
selection, or the whole text) and the `original` passage. `applyAi(proposal,
{ proposed? })` applies it — or the reader's edited version — as ONE undoable
edit in the document's line endings and BOM, and refuses (changing nothing)
when the text changed in any way since the proposal was made, when
read-only or destroyed, a second time, or for another editor's proposal.
The kit's AI menu and review panel (`orz-markdown/carrier/app`
`attachAiMenu`, `reviewProposal`) use them.

**`nonce`** (2.2.0, additive): the §8.4 CSP recipe needs one nonce for the
preview frame and the editor's own `<script>`/`<style>`; before, it was the
editor shell's `preview.nonce` and `codemirror6Adapter({ nonce })` only.

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
   the document already runs in that page. **Accepted limit** (owner,
   2026-10-06, option B; documents are content from trusted sources, claim
   M.21): a document's own scripts may take the keyboard focus inside the
   preview, so keystrokes the reader means for the editor can go into the
   preview instead. The guarantee is that such scripts cannot reach the host
   page, its storage or its cookies, cannot navigate it or open a window
   without the reader's click, and cannot cause a save, a mode change, a link
   opening or a scroll of the editor by anything other than the reader's own
   key presses and clicks, reported through the preview's authenticated
   channel (§8.4).
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
  assemble?, fileName?, kind?, host?, saver?,   // standalone host: assemble(text, { includes }?) → html, then createSaver
  includes?,                         // the opened file's #orz-includes, passed to every assemble (§8.5); default none
  openedHtml?,                       // the opened file's bytes for the saver (§8.5); default assemble(text), once, at idle
  standalone?,                       // the assembled file's own boot passes true (§8.4 sandbox)
  uid?, preferences?, storage?,      // reader preferences (default store namespaced by the header uid)
  preview?: { head?, scheme?, articleClass?, assets?, debounceMs?, readyTimeoutMs?, nonce?,
              frameDocument?, bridge?, diff?, mode?, mapLine?, mapPosition? },
  nonce?,                            // FC-19 §3 (2.2.0): preview.nonce when that is not given, and the default adapter's
  onLink?, label?, narrowWidth?,
});
shell.getText() / setText(text, { resetHistory? }) / setHeader(changes) / isDirty() / markSaved()
shell.save(): Promise<SaveOutcome>        // never rejects
shell.requestAi(op, { selection? }) / proposeAi(op, { selection? }) / applyAi(proposal, { proposed? }) / uploadAssets(files) / ensureUid()   // §8.8
shell.setReadOnly(flag) / isReadOnly()    // run-time read-only (§8.3)
shell.setMode(m) / getMode() / getView() / setSplitRatio(r) / getSplitRatio() / undo() / redo()
shell.focus() / on(event, fn) → off / refreshPreview() / destroy()
shell.root (its shadow root) / shell.toolbar (the carrier's slot) / shell.adapter / shell.ready / shell.readOnly
shell.preview.post(msg) / on(type, fn) → off / setOptions({ head?, scheme?, articleClass? })   // the frame channel (§8.4)
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
- `srcdoc` = the default bridge script **first in `<head>`** (carrying the
  frame's secret, below), before any stylesheet (a script after a pending stylesheet waits for it: a slow theme
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
- **The authenticated channel** (owner, 2026-10-06, option B). Every frame
  document the shell writes gets a new secret (`crypto.getRandomValues`),
  placed on the bridge's own `<script>` element as the attribute
  `data-orz-preview-secret` (`PREVIEW_SECRET_ATTRIBUTE`; an attribute, not
  script text, so `PREVIEW_BRIDGE_HASH` is the same for every frame). The
  bridge reads and removes it first thing (`document.currentScript`),
  synchronously, before any document content exists — that only arrives
  through the port — and says `orz-preview-ready { channel, secret }` (a
  random `channel` too). The shell hands a MessageChannel port
  (`orz-preview-port { channel }`) only for a ready from its frame's window
  that carries this frame's secret, once per load of the frame document (a
  reload of the same document — the iframe moved, `location.reload()` — runs
  the bridge first again and may take a new port; the old one is retired). A
  ready without the right secret, a second one before the frame loads again,
  or a plain ready once a port was handed is ignored: it changes nothing, and
  never closes the port the bridge holds. A document that replaced the
  bridge's — `document.open()`, a navigation, a meta refresh to an http or
  `data:` page, a nested frame — cannot know the secret, so it never gets a
  port (in the owner-accepted standalone `file:` frame, which shares the
  page's origin, the document's scripts could read it from the page — they
  reach the editor there anyway). The bridge takes the port in a capture listener registered before
  anything else in the frame (hidden from the frame's other listeners); from
  then on the shell's messages go through the port (so a shell mounted into
  another window's document by that window's opener reaches its frame), and
  the bridge sends its reports only through it, with `Reflect.apply` and
  `MessagePort.prototype.postMessage` as they were when it started, and only
  for trusted events (`isTrusted`) — keys, link clicks, pointer / wheel /
  touch / key input, and scrolls (scrolls only within 1.5 s of the reader's
  own pointer press or drag, wheel, touch or key in the frame: a script's
  scrolling fires trusted scroll events too). **There is one trust path.**
  Keys, links, input and scrolls act only when they arrive through the
  authenticated port; nothing arriving on the window (`postMessage`) ever acts
  on keys, links, focus or scroll — window messages are data: a plain ready
  of a bridge without the port (the shell then posts renders on the window,
  and that bridge's `orz-preview-rendered` acknowledgements pace them), and a
  carrier's own message types (`shell.preview.on`). A carrier's own bridge
  that wants keys, links or scroll does the same handshake: read and remove
  the attribute from `document.currentScript` first thing, post the ready
  with the secret and a channel, take the port from `orz-preview-port`, and
  send its reports through it. Carriers should use the default bridge with
  its page hooks (below) instead of their own.
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
  stylesheet links, nonce-stamped; put `parts.bridge` — which carries the
  frame's secret — first in `<head>`, before the stylesheets, and before
  anything that could hold the document's content; `parts.head` in `<head>`,
  before the article and `parts.scripts`; a carrier's own `<script>` in the
  frame document must carry `parts.nonce` under an app's nonce policy, B#5);
  `preview.bridge` replaces the bridge script (script-safe, speaking the
  protocol below and doing the handshake above to get the port);
  `preview.diff: false` makes every render replace the content whole, keeping
  the scroll position (a renderer that reflows nodes);
  `preview.mapLine(line, { anchors, max })` / `mapPosition(top, ctx)` replace
  the anchor maths (return `null` for the default); `preview.mode:
  'navigate'` posts the source line instead of a top — the caret's line while
  the editor has focus, else its top line; and the caret's line whenever a
  view change shows the preview, again once it has rendered — and reads a
  line back through the port (`window.__orzPreview.navigated(line)`, below).
- **Page hooks of the default bridge**, so a carrier's frame document can
  customise it without its own bridge (keys, Escape, links, input, the
  secret, ready and the port stay the bridge's) — the recommended way for a
  carrier's own frame layout: `window.__orzPreviewApply(html, msg)` replaces
  the DOM update (it may return a promise; the render is acknowledged when
  it settles; calls never overlap — a render that arrives while one is
  pending waits, and only the latest runs after it),
  `window.__orzPreviewNavigate(line)` gets `orz-preview-navigate`,
  `window.__orzPreviewMessage(msg)` any other message from the shell.
  `window.__orzPreview.report()` re-reports the anchors (after an
  asynchronous layout); `window.__orzPreview.navigated(line)` reports the
  source line the preview now shows (navigate mode) as `orz-preview-scrolled
  { line }` through the port — only within 1.5 s of the reader's own input in
  the frame, and the shell follows it only while the preview leads (below),
  like a scroll; `window.__orzPreview.post(msg)` posts a carrier's own
  message to the shell as a window message — data, never an action. These
  hooks share the frame with the document's scripts, which can define or
  call them too: they gain nothing they could not do to the frame's DOM
  already.
- **The channel API.** `shell.preview.post(msg)` posts a carrier's own
  message to the bridge (false while the frame is not ready). The frame is
  the document's: whatever a carrier posts there is readable by the
  document's scripts (they can define `__orzPreviewMessage`, or read what the
  bridge puts in the DOM; F5, round 3) — post nothing the document may not
  see;
  `shell.preview.on(type, fn) → off` hears the frame's messages of a type
  (claims: data); `shell.preview.setOptions({ head?, scheme?, articleClass? })`
  rebuilds the frame document (e.g. a theme or measure change; `articleClass`
  since 2.2.0) and shows the last HTML again.
- Protocol (shell → frame): `orz-preview-port { channel }` (with the port),
  `orz-preview-render { id, html, diff? }`, `orz-preview-scroll { top }`,
  `orz-preview-navigate { line }`, and a carrier's own types; (frame →
  shell, on the window): `orz-preview-ready { channel, secret }` (or a plain
  `orz-preview-ready` of a bridge without the port) and a carrier's own
  types; (frame → shell, through the port only): `orz-preview-rendered { id,
  anchors: [line, top][], max }` (on the window too for a bridge without the
  port), `orz-preview-scrolled { top, max }` or `{ line }`, `orz-preview-key
  { key: 's' | '\\' | 'Escape' }`, `orz-preview-link { href }`,
  `orz-preview-active { input? }`, and a carrier's own types.
- Scroll sync (a reader preference): positions map through the anchors (line
  ↔ top, linear between anchors), proportionally when there are none. Anchor
  lines are 0-based lines of the whole text (`renderMarkdownPreview` adds the
  header's lines). The editor leads unless the preview does: focus on the
  preview iframe, or a recent `orz-preview-active` of the frame (wheel,
  pointer, touch, keys) while the editor has no focus and was not touched in
  the host page (pointer, wheel — also on an unfocused editor —, keys) in the
  last 300 ms.
- **What the frame reports.** Through the port, a key (save, view, Escape)
  or a link is the reader's own input in the frame and acts. The same
  messages on the window — a document script's, or a carrier's own bridge
  without the port — never act, whatever the focus or user activation. So a
  document script that floods them moves nothing, saves nothing and opens
  nothing, also while the reader is in the frame (finding B-15 of round 1,
  accepted then, is closed).
- **Keyboard focus** (accepted limit, §5 invariant 3; owner, 2026-10-06,
  option B). A document script can focus an element of its frame at any
  time (Chrome lets a cross-origin frame take the focus without user
  activation), and the reader's keys then go to the preview; the shell
  neither takes the focus back nor pauses the document's scripts (the
  focus-theft detection of round 2 was bypassable and misfired: a tab
  switch gives the frame its focus back). What reaches the frame stays
  there: its scripts get those keystrokes, but a save, a view change, an
  Escape action, a link or a scroll of the editor still needs the reader's
  own trusted key or click reported through the authenticated port. A key
  the reader presses in the frame — knowingly or not — is the reader's own
  (Cmd/Ctrl+S there saves). One consequence (loop 2 round 4): while a
  document script holds the focus, the reader's keys there also open the
  1.5 s window in which the frame's scrolls are reported, so the document's
  own scrolling can move the editor through scroll sync. A reader's
  keyboard scrolling of the preview (PageDown, arrows, Space) cannot be told
  apart from a script's, so this is part of the same accepted limit: the
  editor's scroll position only, never its text, a save, a view, a link or
  a window.
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
  (spec/shell-runtime.md §1). **A save keeps the file's form** (closed loop
  2 round 3): the carrier's `assemble` writes the opened file's delivery
  (`#orz-shell` `delivery`: a `cdn` file stays `cdn`, B#7), and the shell
  passes the `includes` option — the opened file's `#orz-includes` — as
  `assemble(text, { includes })` (FC-18 §8.3, D4; without includes the
  call is `assemble(text)`). `openedHtml` — the bytes of the file the page
  was opened from, which prove that a remembered file handle still points at
  that file (shell-runtime §1, steps 3.1–3.3) — is the `openedHtml` option
  (a string or a function; the assembled file's own HTML as loaded), else
  `assemble` of the text the shell was mounted with, which reproduces an
  assembled file (FC-18 law 3). Without it every reload would get the picker
  and a quiet update would never reload. The default is computed once, when
  the page is first idle after mount (B#6): a save click then runs one
  `assemble` (none for the unchanged text, which reuses it), so the picker or
  Chrome's permission prompt still has the click's user activation on a
  large document. A carrier passing its own `openedHtml` function should
  start it early the same way. A
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

- `includes` (the shell option, the opened file's `#orz-includes`) — passed
  to `render(text, ctx)` as `ctx.includes` (2.2.0): `renderMarkdownPreview`
  reads file includes from it (the parser's `readFile` on a virtual root,
  `includeRecordEnv`), `renderMarkdownPreviewWithIncludes` URL includes too
  (the host's `fetchInclude` first, the record for what it does not answer),
  so a file renders its stored includes offline.
- `fetchInclude`, `resolveAsset` — passed to `render(text, ctx)` as `ctx`
  (`renderMarkdownPreview` accepts it, so it can be passed as `render`
  directly; `renderMarkdownPreviewWithIncludes` uses `ctx.fetchInclude` to
  resolve URL includes with `prepareSources` first — passing the render env
  as `includeEnv`, so a text with file includes gets its URL includes too
  (2.2.0) — each URL fetched once per
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
  `openedHtml`, the render context's `twinLinks` and `cache`;
  `shell.preview` (`post`, `on`, `setOptions`); the bridge's port and page
  hooks; `codemirror6Adapter({ nonce })`; `PreviewController` `post`, `on`,
  `setOptions`, `acknowledges`, `authenticated`, `render()` resolving when
  the frame acknowledges it, and `iframe` as a getter; exports
  `renderMarkdownPreviewWithIncludes`, `mapSrcset`, `undoSteps`,
  `detachString`, `CODEMIRROR6_HISTORY_STEPS`.
- Option B (owner, 2026-10-06; unreleased, so the round-2 pieces it drops
  were never published): the frame secret and `PREVIEW_SECRET_ATTRIBUTE`,
  `PreviewFrameOptions.secret` (set by `createPreview`), the page hook
  `__orzPreview.navigated(line)`, serialised `__orzPreviewApply`; removed:
  `preview.pauseScripts`, `PreviewController.pauseScripts` /
  `resumeScripts` / `scriptsPaused`, `PreviewEvents.onFocus` / `onPong`, the
  `trusted` argument of `onKey` / `onLink` / `onActive` (they now fire only
  for reports through the port), the bridge's `orz-preview-focus` /
  `-ping` / `-pong`, and the focus-theft defence with its note and
  `error`.
- Round 3 of closed loop 2 (2026-10-06, additive): `assemble`'s `includes`
  option (§2) and the shell's `includes` option, passed as the `assemble`
  option's second argument (§8.5); the default `openedHtml` computed at
  idle; `ReassembleOptions.includes` and `UpdateError` code `includes`
  (spec/shell-runtime.md §7.2).
- 2.2.0 (additive; the gaps the orz-mdhtml 1.0 rebuild found): `nonce`
  (§3, the shell option); `proposeAi` / `applyAi` and the types
  `AiProposal`, `AiProposalOutcome` (§4); `preview.setOptions({ articleClass })`
  (§8.4); the render context's `includes` and `includeRecordEnv`, and
  `renderMarkdownPreviewWithIncludes` passing `includeEnv` (above); a
  read-only CodeMirror stays focusable and selectable (`EditorState.readOnly`,
  content not editable but `tabindex="0"`, `aria-readonly`), so the reader
  can select, copy and press Cmd/Ctrl+S in it (§5 invariant 7: keyboard
  operable). The standalone file's own runtime that mounts this shell is
  `orz-markdown/carrier/app` ([carrier-app.md](carrier-app.md)).
