# Carrier app — the standalone file's runtime (`orz-markdown/carrier/app`)

**Status:** implementation spec (orz-markdown 2.2.0), additive. It implements
the standalone host of [FC-19](FC-19-editor-component.md) §4 and §8.5 on top
of the [shell runtime](shell-runtime.md) and the file side of the
[host protocols](host-protocols.md), for every carrier kind. Family plan:
REBUILD §3a, owner decision 2 — the standalone file's startup code, written
in orz-mdhtml 1.0 behind a seam, is lifted here before orz-paged. Claims
A.1–A.12 in `notes/CLAIMS.md`; tests in `tests/carrier-app.test.ts` (and the
conformance stub, H.2, which is built on it).

## 1. What it is

Every carrier's browser bundle (`orz-<x>.browser.js`) runs the same program
when it finds itself in an assembled file: read the file, show it, offer
Edit / Save / Download a copy / New document / Save as new copy, talk to a
host that embeds it, offer the quiet update, and warn before unsaved work is
lost. That program is kind-independent; only the **kind** — how the text is
rendered, edited and assembled — differs. `carrier/app` is the program; the
carrier supplies its kind through one interface, `StandaloneKind` (§3).

```ts
// the carrier's bundle entry (IIFE), e.g. orz-mdhtml's
import { startCarrier, captureEngineSource } from 'orz-markdown/carrier/app';
const engine = captureEngineSource();            // first thing: document.currentScript
startCarrier(MD_KIND);                           // sets globalThis.OrzCarrier, boots in a file
```

`startCarrier(kind, options?) → { carrier: OrzCarrierGlobal; app: CarrierApp | null }`
sets `globalThis.OrzCarrier` (FC-19 §2: `kind`, `version`, `formats`,
`assemble` (a promise), `extract`, `readDocument`, `mountEditor`,
`renderPreview?`, plus `standalone`) and, when the page holds an `#orz-src`
island, boots the app (`bootCarrierApp`). In the update sandbox and in an
app's page there is no island: only the global is set, nothing else is
touched. A file that cannot boot says so in the console only.

`OrzCarrier.mountEditor(element, options)` is the kind's `mountEditor`.
Without `hooks.save`, in an assembled file, it mounts on the file's context
(§3.2; FC-19 §4: a carrier never opens a second host connection) and is
attached to the app until destroyed (`app.attach`): it is then the document
being edited (§4.8). With `hooks.save` (an app host) it gets no context.

## 2. The opened file

`readOpenedFile(document, kind) → OpenedFile | null` reads the page it was
opened from, at boot, from the envelope's islands (written before any shell
markup, FC-18 §8.1):

| Field | From |
|---|---|
| `text` | `readIslandFromDom(#orz-src)` — exact (BOM, line endings restored) |
| `uid`, `format` | the header (`uid` only when well-formed; `format` default 1) |
| `delivery` | `#orz-shell` (`inline` unless it says `cdn`) — kept by every save (B#7) |
| `includes` | `#orz-includes` (own string values) — a page cannot resolve them again (D4) |
| `engine` | `#orz-engine` without `src`: the inline bundle's exact text (null for `cdn`) |
| `fileName` | the page path's last segment when it ends in the kind's extension, decoded; else `document` + the extension |

A page whose `#orz-src` is not a `<script type="text/markdown">` is not a
file (null).

## 3. The seam

### 3.1 `StandaloneKind`

Everything kind-specific is behind this interface; the app names no kind
(claim A.4).

| Member | What the kind supplies |
|---|---|
| `kind`, `version`, `formats` | `md` / `slides` / `paged`; the shell version (= the package version, FC-19 §7); the text formats it reads and writes |
| `brand?` | the chrome's brand text (default `orz`) |
| `assemble(text, { delivery?, engineSource?, includes? })` | the isomorphic assemble (FC-19 §2); string or promise |
| `newDocument()` | the creation tool's new text (header with `carrier` and a fresh `uid`) |
| `mountEditor(element, options, ctx?)` | FC-19 `mountEditor`: the kit's editor shell with the kind's renderer, preview and tools; `ctx` when mounted on the file (§3.2) |
| `createReadView(document)` | the page's read view (§3.3) |
| `settings?` | the header settings the chrome offers (`SettingControl[]`, §5) |
| `actions?` | extra chrome actions (`CarrierAction[]`: slides' Present, paged's Print) |
| `readDocument(text)` | FC-19 `readDocument` (typically the kit's with the kind) |
| `extract?(html)`, `renderPreview?(text, options?)` | FC-19 `extract` (default: the kit's parser-free one) and `renderPreview` |

A carrier written with the DOM lib's types (`HTMLElement`, `Document`,
`Window`) satisfies it; the kit types the DOM structurally (`AppElement`,
`AppDocument`, `AppWindow`), as the rest of the kit does.

### 3.2 `StandaloneContext` — what the file gives an editor mounted on it

`{ fileName, assemble(text, { includes? }), saver, host?, includes?,
openedHtml?, standalone, ai?, fetchInclude?, preferences?, adapter? }`. The
kind's `mountEditor` passes them to `createEditorShell`: `assemble`,
`fileName`, `saver`, `host`, `includes`, `openedHtml`, `standalone`;
`hooks.ai` = `ai` (the host's operations), `hooks.fetchInclude` =
`fetchInclude`; `preferences` (the document's reader preferences by `uid`);
`adapter` (tests). `assemble` keeps the file's delivery and engine
(`engineSource` = the opened file's own inline engine), and passes the given
includes. Rules for a kind's `mountEditor`:

- **Settings** in the toolbar: `attachSettings(shell, settings)` (FC-19 §1:
  the same tools for every host).
- **AI menu:** for an app's own `hooks.ai` (no `ctx`) the kind attaches
  `attachAiMenu(shell, …)`; for the file's host AI the APP attaches it to
  every editor of the file (never both).
- **Preview presentation:** `followPresentation(shell, text → { head,
  scheme, articleClass })` rebuilds the frame when the header's theme,
  measure, page size… change.
- **Renderer:** md: `renderMarkdownPreviewWithIncludes` (its render context
  carries the file's `includes`, FC-19 §8.8).

### 3.3 `CarrierReadView`

| Member | |
|---|---|
| `render(text, { includes?, fetchInclude? })` | render into the page (presentation follows the header); resolves when it shows; a newer call supersedes an older one |
| `present(text) → { scheme }` | apply the presentation without re-rendering (theme stylesheet, measure, page size); the chrome follows `scheme` |
| `element?` / `setVisible?(visible)` | the view's root (hidden while editing) or the kind's own show/hide |
| `onKey?(event) → boolean` | keys of the read view the app's keymap did not take (§4.8) |
| `destroy?()` | release (the app's `dispose`) |

`fetchInclude` is a connected host's include resolution: it wins over the
file's record (spec/shell-runtime.md §5). An md read view renders with
`renderMarkdownPreviewWithIncludes(text, ctx)` and enhances with
`enhanceDocument(article, { scheme })` (`orz-markdown/preview-frame`).

### 3.4 Settings and actions

`SettingControl { key, label, icon?, choices: { value, label, swatch? }[],
current(text) }` — a header key the chrome offers (FC-18 §5.1 user choices
are document data, owner decision 4). `CarrierAction { id, label, icon?,
placement?: 'bar' | 'menu', inEdit?, run(app) }` — run with the app handle
(a presenter hides the chrome: `app.setChromeVisible(false)`).

## 4. The runtime (`bootCarrierApp(kind, { window?, adapter?, services? })`)

### 4.1 The text is the document

The page holds the current text and the last saved one. Every save writes
`kind.assemble(currentText, { the file's delivery, its engine, its includes })`
— never the live DOM (shell-runtime §0). The saver is the shell's
`createSaver({ uid, suggestedName: fileName, kind, host?, openedHtml })`, one
per page; `openedHtml` is the kind's assemble of the opened text (it
reproduces the file, FC-18 law 3), computed when the page is first idle
(B#6).

### 4.2 The chrome

One shadow root on `#orz-chrome` (created when the shell markup lacks it):
a bar (`role="toolbar"`) with the brand (`#orz-brand`, the update
indicator's anchor), Edit, the kind's setting pickers and bar actions,
Save (with an unsaved-changes dot), Done (edit mode) and More (Download a
copy, New document, Save as new copy, the kind's menu actions). Tokens and
components are the shell's (`CHROME_CSS`) plus `WIDGET_CSS` and `APP_CSS`;
the chrome adds nothing to the page's styles. Its colour scheme is the
document's (`present`), unless the reader's `darkChrome` preference says.

### 4.3 Header settings and undo

A setting in the read view writes the header with `editHeader` (one step
that Cmd/Ctrl+Z / Shift+Z undo and redo), re-presents and re-renders the
read view and marks the document unsaved; in edit mode it is the editor's
`setHeader` (one undoable edit). Refused while an update runs.

### 4.4 Edit mode

Edit (or Cmd/Ctrl+E) mounts `kind.mountEditor(container, { text: saved },
context)` inside the chrome (a full-page overlay), then sets the current
text (so the editor's undo and dirty state know both), hides the read view
and focuses the editor; Done leaves with the editor's text and re-renders.

### 4.5 Saves

- **Save** (Cmd/Ctrl+S): the editor's save while editing; else the page's —
  a newer text format is never saved; a served page gets the notice ("use
  Download a copy"); a cancelled picker is not an error.
- **Download a copy:** the current text's file through `saver.download`.
- **New document:** `kind.newDocument()` saved as a new file
  (`Untitled<ext>`), **Save as new copy:** the current text with a new
  `uid` (`<name> copy<ext>`, the file's includes) — each through a saver
  of its own (no remembered handle, no opened bytes, never the file's
  handle, never the host: a served page or a host gets a download).

### 4.6 Leaving with unsaved changes

A top-level file asks before the page goes (`beforeunload`, the browser's
own prompt) exactly while the document has unsaved changes (the page's, the
editor's or an attached editor's). Never for the update's reload; never in a
frame (the host is told the dirty state through `orz-host-save@1`).

### 4.7 The host connection

Framed only (`window.parent !== window`): `connectHost({ kind, window, ai,
include })`. Saves go to the host through the saver; the read view's dirty
state is posted while no editor is the document (an editor posts its own);
the host's include resolution feeds the read view and the editor; its AI
operations are an AI menu in every editor of the file with the review flow
(FC-19 §4 `proposeAi` → review panel → `applyAi`): the document is untouched
until the reader applies a proposal (host-protocols §4).

### 4.8 Keymap

On the page (outside the Edit button's editor, which has its own keymap): a
key another handler already took (`defaultPrevented`) is never the page's;
Cmd/Ctrl+S saves the document being edited — an attached editor's, never
the page's other copy; Cmd/Ctrl+E edits; Cmd/Ctrl+Z / Shift+Z undo / redo
settings outside fields; other keys go to the read view's `onKey` — not
while typing in a field, not from the chrome, not while an editor is the
document.

### 4.9 The quiet update

Only a top-level file checks (`checkForUpdate({ kind, current: version,
format, page, storage })`, whose own guards add the served-page rule); an
offer mounts the indicator after the brand. Update now runs `performUpdate`
with the file's saver, delivery and includes and the current text (read
again before the save). While it runs every editor of the document and the
setting pickers are read-only; they are given back when it settles without
a reload. The page reloads only when `performUpdate` says so (the opened
file itself was written and the text did not move on), and nothing is asked
then. A served page's update is downloaded. Skip this version records it.

### 4.10 Reader preferences

One `createPreferenceStore(uid, the page's storage)`: passed to the editor
(`ctx.preferences`: view mode, split, scroll sync, font size) and read by
the chrome (`darkChrome`). Never in the text.

### 4.11 The handle (`CarrierApp`, `OrzCarrier.standalone`)

`kind`, `file`, `getText()`, `isDirty()`, `edit()`, `leave()`, `editor()`,
`setSetting(changes)`, `undo()`, `redo()`, `save()`, `download()`,
`newDocument()`, `saveAsCopy()`, `editorContext()`, `attach(editor) → detach`,
`toast(message, tone?)`, `setChromeVisible(visible)`, `view`, `root`,
`host`, `updating`, `ready`, `dispose()`. The conformance target's editor
driver uses `standalone.edit()` (the Edit button's path).

### 4.12 Services (tests)

`services?: Partial<AppServices>` replaces kit functions the app calls
(`createSaver`, `connectHost`, `checkForUpdate`, `performUpdate`,
`mountUpdateIndicator`, `skipVersion`) — for a carrier's own tests and the
conformance stub's broken builds (H.5). Production passes none.

## 5. Widgets

`button`, `menuButton` (a non-modal `role="menu"` popover: arrows, Home/End,
Enter/Space, Esc returns focus, outside pointer-down and Tab close),
`settingPicker`, `attachSettings(shell, settings)`, `reviewProposal(root,
proposal, { title })` (non-modal `role="dialog"`, the proposal editable,
Apply / Cancel, Esc cancels), `attachAiMenu(shell, { operations })`,
`followPresentation(shell, present)`, `installCss`, `WIDGET_CSS`. Text is
set as text; icons are the kit's `ICONS`.

## 6. Engine source

`captureEngineSource(document?) → { inline, url, get(fallbackUrl) }`, called
synchronously at the bundle's start: an inline bundle's exact `<script>` text
(the update sandbox inlines the verified bundle with nothing after it, U.6),
or its URL, fetched once (and required script-safe) when an inline assembly
needs the text. A kind's `assemble` uses it when no `engineSource` is given.

## 7. Fitting orz-paged and orz-slides

Designed now so that neither needs a breaking change later:

- **orz-paged.** `createReadView` renders the pages with Paged.js into the
  page (`render` resolves when the pages are laid out — Paged.js is
  asynchronous; a newer render cancels an older one by generation, as the md
  view does); `present` sets the page size and template classes and the
  theme stylesheet and returns the scheme. Settings: theme, page size,
  template, margins (header keys, FC-18 §5.1). Action: **Print**
  (`placement: 'bar'`, `run: () => window.print()`; the chrome prints hidden,
  CHROME_CSS `@media print`). Editor: the kit's shell with
  `preview.frameDocument` building a Paged.js frame (FC-19 §8.4 pluggable
  preview), `preview.diff: false` (Paged.js reflows the whole document) and
  `__orzPreviewApply` running the layout; `followPresentation` returns the
  page-size head.
- **orz-slides.** `createReadView` renders the deck; `onKey` navigates (←/→,
  Page Up/Down, Space, Home/End — the app gives it every key it does not
  take, never while typing or from the chrome); `present` applies the theme
  and the ratio. Settings: theme, ratio. Actions: **Present** (`placement:
  'bar'`: full screen, `app.setChromeVisible(false)` and back on exit) and a
  presenter view if wanted (`placement: 'menu'`). Editor: `preview.mode:
  'navigate'` with the slide of the caret (FC-19 §8.4) and its own frame
  document.
- Both: their read views use `enhanceDocument` for the content libraries;
  their `mountEditor` follows §3.2; their `newDocument` and `assemble` are
  their own; nothing else changes.

## 8. Boundaries

`carrier/app` may import `carrier/shell`, `carrier/editor`, `carrier/read`
and the core modules the editor already loads; `carrier`, `carrier/read`,
`carrier/shell`, `carrier/editor`, `carrier/conformance` and the parser
entry never import it (A.1). No browser global is touched at module load
(A.2). What ships — the CommonJS `dist/carrier/app/` bundled — holds the
app's own modules under 33 KB (29.9 KB measured on 2026-10-07) and adds under
62 KB to a bundle that already holds the editor (56.6 KB measured: the app
and the update, indicator and file side of the shell, which the editor
alone does not load).
