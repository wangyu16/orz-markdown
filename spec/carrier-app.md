# Carrier app — the standalone file's runtime (`orz-markdown/carrier/app`)

**Status:** implementation spec (orz-markdown 2.2.0; 2.3.0 additions marked —
the kit gaps the orz-paged 1.0 rebuild found, REBUILD §3b), additive. It implements
the standalone host of [FC-19](FC-19-editor-component.md) §4 and §8.5 on top
of the [shell runtime](shell-runtime.md) and the file side of the
[host protocols](host-protocols.md), for every carrier kind. Family plan:
REBUILD §3a, owner decision 2 — the standalone file's startup code, written
in orz-mdhtml 1.0 behind a seam, is lifted here before orz-paged. Claims
A.1–A.28 in `notes/CLAIMS.md`; tests in `tests/carrier-app.test.ts` (and the
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
| `brand?` | the tool's name in the chrome's labels (edit mode's "<brand> on GitHub"; default: the repo's name, else `orz`) |
| `repo?` | (2.2.0) the kind's repository, an `https://github.com/<owner>/<repo>` URL: edit mode links to it with the GitHub mark (§4.2); anything else shows no link |
| `readerControls?` | (2.2.0) reader-side controls (§4.10): `{ fontScale?: { min, max, step } }` in percent; (2.3.0) `choices?: ReaderChoiceControl[]`, reader controls with named choices |
| `assemble(text, { delivery?, engineSource?, includes? })` | the isomorphic assemble (FC-19 §2); string or promise |
| `newDocument()` | the creation tool's new text (header with `carrier` and a fresh `uid`); a kind's own creation choices (paged's templates) call `app.newDocument({ text, name })` (§4.5, 2.3.0) |
| `mountEditor(element, options, ctx?)` | FC-19 `mountEditor`: the kit's editor shell with the kind's renderer, preview and tools; `ctx` when mounted on the file (§3.2) |
| `createReadView(document)` | the page's read view (§3.3) |
| `settings?` | the header settings the chrome offers (`SettingControl[]`, §3.4) |
| `actions?` | extra chrome actions (`CarrierAction[]`: slides' Present, paged's Print): items of the handle's list; with `inEdit`, also in edit mode; (2.3.0) submenus (`items`) and conditional (`hidden`) |
| `readDocument(text)` | FC-19 `readDocument` (typically the kit's with the kind) |
| `extract?(html)`, `renderPreview?(text, options?)` | FC-19 `extract` (default: the kit's parser-free one) and `renderPreview` |

**A carrier's own grammar and lints in `readDocument`** (2.4.0). A kind
whose body grammar the kit does not know (slides' markers, paged's
elements) parses the text with the kit's parser, `kitParser()` from
`orz-markdown/carrier`, and hands both to the kit, so the text is tokenized
once and every reader (`inspect`, `assemble`, the editor) sees one lint
list:

```ts
const tokens = kitParser().parse(text, {});           // the carrier's own pass (e.g. parseDeck) reads these
readDocument(text, {
  kind: 'slides', themes: SLIDE_THEME_IDS,
  tokens,                                              // not parsed again (only the header's own lines)
  lint: ({ tokens, header }) => deckLints(tokens, header),   // the carrier's codes, after the kit's
});
```

The carrier's lints follow FC-18 §5.1 (codes of its own, never a kit code;
`invalid-value` for its keys' values). Do not `set()` / `use()` the shared
`kitParser()`. A carrier reading its 0.x files passes its island to
`readLegacyIsland(html, { generator, config, island: { id, type } })`
(slides 0.x: `{ id: 'orz-deck', type: 'text/orz-slides' }`).

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
  carries the file's `includes`, FC-19 §8.8). With no `ctx` (an app host) the
  kind passes the app's FC-19 §3 `includes` option to `createEditorShell({
  includes })` and its `hooks.fetchInclude`, which the renderer also asks for
  a file include's path the includes lack (2.2.0, round 1).

### 3.3 `CarrierReadView`

| Member | |
|---|---|
| `render(text, { includes?, fetchInclude? })` | render into the page (presentation follows the header); resolves when it shows; a newer call supersedes an older one |
| `present(text) → { scheme }` | apply the presentation without re-rendering (theme stylesheet, measure, page size); the chrome follows `scheme` |
| `element?` / `setVisible?(visible)` | the view's root (hidden while editing) or the kind's own show/hide |
| `onKey?(event) → boolean` | keys of the read view the app's keymap did not take (§4.8) |
| `destroy?()` | release (the app's `dispose`) |

`fetchInclude` is a connected host's include resolution: it wins over the
file's record for URLs (spec/shell-runtime.md §5); `orz-host-include@1`
resolves URLs only, so the app answers a file include's path with null and
never sends it. An md read view renders with
`renderMarkdownPreviewWithIncludes(text, ctx)` — an include nothing answers
shows the quiet "Included file not available: <target>" note (FC-19 §8.8) —
and enhances with `enhanceDocument(article, { scheme })`
(`orz-markdown/preview-frame`), which destroys the charts of the content it
replaced on each call (`disposeEnhancement(article)` in `destroy`). A
stylesheet the view swaps (theme, highlight.js) goes through
`swapStylesheet(document, id, href)`: the old one stays until the new one
has loaded, so a theme change does not flash unstyled.

### 3.4 Settings and actions

`SettingControl { key, label, icon?, choices: { value, label, swatch? }[],
current(text) }` — a header key the chrome offers (FC-18 §5.1 user choices
are document data, owner decision 4): in the read view a submenu of the
handle's list (radio choices), in edit mode a picker of the editor's
toolbar (`attachSettings`). 2.3.0 adds, all optional:

- `choicesFor(text)` — the choices a text offers, read at each opening
  instead of `choices` (paged's Version: the dynamic choices the document
  defines). A choice may carry `separator` (groups) and `checked` (a
  per-choice toggle: it overrides `value === current(text)`, several may be
  on, and choosing one that is on applies it too, so `apply` can turn it
  off; a choice without `checked` is a radio choice and writes only a
  change, as in 2.2.0).
- `apply(text, value) → Record<string, HeaderChange>` — the header changes
  the choice makes (default `{ [key]: value }`): any keys, single-line
  values, `null` (remove) or `{ multiline }` block values (FC-18 §9), written
  as ONE undoable edit (`editHeader` in the read view, `setHeader` in an
  editor). So a setting can write a block value such as paged's
  `dynamic_choices` map. Only the header changes; a refused change is a
  toast and changes nothing.
- `hidden(text)` — not offered for this text (a throwing one is hidden):
  re-evaluated at each opening of the handle's list, and by `attachSettings`
  after a pause in typing (the picker is hidden). `hidden` is a function of
  the text and may be costly (it may parse the document): the kit asks it at
  most once per text — the answer for the last text asked is kept per
  setting or action (`hiddenFor(owner, text)`, 2.3.0, A.29), so menus opened
  again on the same text ask nothing — and never synchronously per
  keystroke (only after the typing pause). The same holds for an action's
  `hidden`.

The helpers `settingChoices(control, text)`, `settingOffered(control,
text)` and `settingChanges(control, text, value)` are exported for a
carrier's own pickers.

`CarrierAction { id, label, icon?, placement?: 'bar' | 'menu', inEdit?,
run?(app), items?(app), hidden?(text) }` — an item of the handle's list
(`bar`: right after Edit; `menu`, the default: after the settings); with
`inEdit` also in edit mode (`bar`: a button of its bar; `menu`: an item of
More); run with the app handle. 2.3.0: **submenus** — an action with
`items(app) → CarrierActionItem[]` (`{ id?, label, checked?, disabled?,
separator?, run(app) }`) is a submenu: in the handle's list a submenu like a
setting's (a hover opens it; ArrowRight, Enter or a tap opens it on its
checked entry, else the first; ArrowLeft and Escape close it), in edit mode
a submenu of More (`menu`) or a menu button of the bar (`bar`); its entries
are read at each opening and run with the app (a failing one is a toast
naming the action and the entry); with no entries it is offered disabled;
one level. `run` is optional (an action with neither `run` nor `items` is
not offered). **Conditional actions** — `hidden(text)`: not offered for
this text, re-evaluated at each opening of the handle's list and of More,
and for an edit-mode bar button after a pause in typing (paged's Version…
shows only while the document defines choices). An action
(a presenter hides the chrome: `app.setChromeVisible(false)` hides the
handle, the bar and the editor but not the toast stack, so a save's or an action's message
and the conflict question still show while presenting — round 2 of the
carrier-app loop; a kind that presents in the browser's full screen shows
its own element only, so it shows its own messages there). Hiding the chrome
while the focus is in it (or in the editor) — a keyboard user chose
Present — moves the focus to the page: the read view's element when it
takes the focus, else the document, so Escape and Space reach the read
view's `onKey` at once (round 3, M5); a focused toast (the conflict
question) keeps the focus. An action chosen in the handle's list with the
pointer leaves the focus to the page afterwards (with the keyboard it
returns to the pencil; an edit-mode bar button keeps it), so the read
view's keys — slides' Space and Enter — work at once.

**Icons** (decided in round 1 of the carrier-app loop). A setting's icon is
a kit icon (`ICONS`; `theme`, `measure`, `pageSize`, …). An action's icon is
a kit icon (`present`, `print`, …) or the kind's own `KindIcon` — `{ paths:
string[] }`, 1–8 path `d` strings of path data only on the kit's 24×24
stroked `currentColor` grid, built element by element (never markup), so a
kind adds a pictogram without adding a way to inject markup, colour or
links into the chrome (spec/shell-runtime.md §8). A control without an icon
(or whose kind icon is malformed) keeps its visible label at every width;
only buttons with an icon drop it below 560 px (`orz-btn--has-icon`).

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

One shadow root on `#orz-chrome` (created when the shell markup lacks it).
Tokens and components are the shell's (`CHROME_CSS`) plus `WIDGET_CSS`,
`HANDLE_CSS` and `APP_CSS`. Its colour scheme is the document's
(`present`), unless the reader's `darkChrome` preference says.

**The read view: one handle** (2.2.0, owner: non-disturbing reading, as in
orz-mdhtml 0.9.3). The page shows ONE control: a small round pencil fixed
at the bottom-left corner (safe-area aware; semi-transparent at rest,
opaque on hover and focus), named "Edit and more" (`aria-haspopup="menu"`,
`aria-expanded`, `aria-controls`). It carries a dot while the document has
unsaved changes and one while an update is offered (§4.9), both said in
its description. Its list (`role="menu"`, opened above it) holds every
operation:

1. **Edit** (⌘/Ctrl+E), the kind's `bar` actions (paged: Print; slides:
   Present), **Save** (⌘/Ctrl+S; a dot while unsaved), **Download a copy**;
2. **New document**, **Save as new copy**;
3. the kind's settings, each a submenu of radio choices (md: Theme,
   Width), disabled while an update runs; the kind's `menu` actions (2.3.0:
   a submenu for an action with `items`; settings and actions whose
   `hidden(text)` says so are left out);
4. the kind's reader controls (§4.10: 2.3.0 its named-choice controls, each
   a submenu — paged's Page zoom — then md's "Text size A− 100% A+");
5. when an update is offered, **Update to x.y.z** (§4.9).

Labels form one column: an item without an icon (a kind's action, setting
or reader control may have none — paged has several) keeps its label where
the icons' labels start (2.3.0, A.31).

- **Pointer.** A click on the pencil edits. Hovering it opens the list
  after a short delay (140 ms); leaving the pencil and the list closes it
  after a grace period (360 ms), so moving into the list — and into a
  submenu, which opens on hover — keeps it open. A pointer-down outside
  closes it.
- **Touch and pen** (no hover). A tap on the pencil opens the list (Edit is
  its first item), a second tap or a tap outside closes it.
- **Keyboard and screen readers** (the menu-button pattern). Enter edits;
  ArrowDown and Space open the list on its first item, ArrowUp on its last;
  arrows, Home and End move (roving focus); ArrowRight (or Enter) opens a
  submenu on its checked choice, ArrowLeft and Escape close it; Escape
  closes the list and returns the focus to the pencil; Tab closes it. A
  choice made with the keyboard returns the focus to the pencil, one made
  with the pointer leaves it to the page. The text-size row keeps the list
  open.
- The toasts and the conflict question are not part of the handle; a
  presenter (`setChromeVisible(false)`) hides the handle with its list.
  `CarrierApp.menu` opens (as a hover does: the focus stays), closes and
  asks about the list — tests and the conformance driver use it.

**Edit mode** is a full-page overlay: a bar (`role="toolbar"`) with the
title (it follows the header's `title`), the update indicator's anchor
(`#orz-brand`), the kind's in-edit bar actions, **Done** and **More**
(Download a copy, New document, Save as new copy, the kind's in-edit menu
actions), then the editor with its own toolbar (view modes, the settings,
Save, the kind's tools). At the bar's far end, quietly (muted until
hovered), the family's brand (2.2.0, owner): the orz seal (`ORZ_SEAL_SVG`,
shell-runtime §8; ~19 px tall) linking to https://markdown.orz.how
("orz-markdown website") and, for a kind with a GitHub `repo`, the GitHub
mark linking to it ("<brand> on GitHub"), both `target="_blank"
rel="noopener noreferrer"`. The read view shows neither.

Accessibility: the chrome's host is moved to be first in the page's order
after the islands, so a keyboard reaches the pencil before the document
(it is drawn fixed, so nothing moves on screen); at narrow widths (≤ 560
px) the handle sits over the end of the lines, so the app sets the page's
`padding-bottom` and `scroll-padding-bottom` (72 px) while the read view
shows and the chrome is visible — the only styles it puts on the page
besides the edit overlay's `overflow` and the reader controls' custom
properties on the read view (§4.10); `dispose` removes them.

### 4.3 Header settings and undo

A setting in the read view writes the header with `editHeader` (one step
that Cmd/Ctrl+Z / Shift+Z undo and redo), re-presents and re-renders the
read view and marks the document unsaved; in edit mode it is the editor's
`setHeader` (one undoable edit). Refused while an update runs.

### 4.4 Edit mode

Edit (the pencil, the list's Edit, or Cmd/Ctrl+E) mounts `kind.mountEditor(container, { text: saved },
context)` inside the chrome (a full-page overlay), then sets the current
text (so the editor's undo and dirty state know both), hides the read view
and focuses the editor; Done (or Cmd/Ctrl+E again) leaves with the editor's
text — a clean editor's is the last written text (another editor of the
file may have saved after it: the last save wins; round 5, B3), a dirty
one's stays unsaved — and re-renders. The bar's title — and the page title — follow the
header's `title` as it is edited. After Done the focus returns to the pencil when
the keyboard drove it, and is left to the page after a pointer's click (a
read view's keys — slides' Space — then work at once).

### 4.5 Saves

- **Save** (Cmd/Ctrl+S): the editor's save while editing; else the page's —
  one at a time (a second call while one runs gets the same outcome); a
  newer text format is never saved; a served page gets the notice ("This
  file was opened from a web address, so it cannot be saved over. Use
  Download a copy…"); a cancelled picker is not an error. A file that
  changed on disk since the page opened it (another program or an agent
  wrote it; spec/shell-runtime.md §1 step 3.4) is never written silently:
  the outcome is `{ ok: false, via: 'file', error: 'conflict', conflict:
  true }` and the reader is asked (`askSaveConflict`, an alertdialog titled
  "The file changed on disk"): **Download a copy instead** (the default:
  focused, styled primary) downloads the file and leaves the document
  unsaved — "Your next save asks again" (every later save opens the picker
  and is checked again: by design, round 3, L11); **Replace it (the version
  on disk is lost)** saves over it (`save(input, { overwrite: true })`, the
  document is then saved). The same holds for a newer shell on disk (an
  agent's `upgrade`) and for the opened version put back over this page's
  own save (shell-runtime §1 step 3.4, round 3). The editor's save asks the
  same; an app's editor with no opened file is asked "The file you chose
  holds another version of this document…" (`opened: false`). Escape
  dismisses the question (nothing written) and the focus goes back where it
  was; one question per FILE (round 4 of the carrier-app loop, F2: the page
  and every editor of the file share one saver, `context.saver`, and its
  one question, `answerSaveConflict`): every save while it is open — the
  second, the third, the page's or an editor's — does not call the saver
  (no second picker), focuses it (wherever it is shown) and makes it answer
  for the newest text — an older text is never written, and the saver
  refuses an `overwrite` of a superseded conflict (`conflictToken`). Only
  the text actually written is marked saved. Done with an editor's question
  open takes the question with the editor; the page's next save asks
  again. **Every write marks its text saved** (round 5 of the carrier-app
  loop, B1–B3): the app's saver is one object (it wraps the kit's saver
  once and hands that object to the page and to every editor through
  `context.saver`), and each write through it tells the page the text the
  file now holds — also an editor's save or a conflict answer that settles
  after the editor was destroyed (Done or Cmd/Ctrl+E while it was in
  flight, or a page question the editor re-targeted), so a page whose text
  is on disk is clean and leaving asks nothing. A read view with nothing
  unsaved follows another surface's write. An attached editor's save is
  the page's text (also over an unsaved page setting), so the page never
  writes an older copy over it and Edit opens on it; an attached editor
  destroyed with unsaved edits leaves the read view on the page's text. The opened bytes the saver proves files with (`openedHtml`) are
  assembled once they succeed: a failed assembly is not kept (round 3, K10). The saver reads the disk file's uid as the page reads its own
  (`readUid` = `readHeader`'s well-formed `uid`), so a quoted or block uid,
  or no uid on either side, is still this document (shell-runtime §1 step
  3.4).
- **Download a copy:** the current text's file through `saver.download`.
- **New document:** `kind.newDocument()` saved as a new file
  (`Untitled<ext>`). 2.3.0: `app.newDocument({ text?, name? })` saves a
  given text instead (a kind's action — paged's "New document from
  template…" — passes the template's text): a text without a well-formed
  `uid`, or with this file's, gets a new one (a new document is never this
  one), another uid is kept; `name` is the suggested name (path and control
  characters removed, the kind's extension added when missing; default
  `Untitled<ext>`). **Save as new copy:** the current text with a new
  `uid` (`<name> copy<ext>`, the file's includes) — each through a saver
  of its own (no remembered handle, no opened bytes, never the file's
  handle, never the host: a served page or a host gets a download).

### 4.6 Leaving with unsaved changes

A file asks before the page goes (`beforeunload`, the browser's own
prompt) exactly while the document has unsaved changes (the page's, the
editor's or an attached editor's). Never for the update's reload; never in a
frame whose host connected (the host is told the dirty state through
`orz-host-save@1` and owns that decision). A framed file whose host never
connected (an ordinary page that frames it) asks like a top-level one
(2.2.0, round 1): nobody else would.

### 4.7 The host connection

Framed only (`window.parent !== window`): `connectHost({ kind, window, ai,
include })`. Saves go to the host through the saver; the read view's dirty
state is posted while no editor is the document (an editor posts its own);
the host's include resolution feeds the read view and the editor; its AI
operations are an AI menu in every editor of the file with the review flow
(FC-19 §4 `proposeAi` → review panel → `applyAi`): the document is untouched
until the reader applies a proposal (host-protocols §4).

### 4.8 Keymap

On the page: a key another handler already took (`defaultPrevented`) is
never the page's. In edit mode the editor has its own keymap;
a key outside it — the focus on the chrome (Done, More) or the page — is
still the document's: Cmd/Ctrl+S saves the editor (default prevented: the
browser's "Save page as" never runs while a document is open) and
Cmd/Ctrl+E leaves edit mode. In the read view: Cmd/Ctrl+S saves the
document being edited — an attached editor's, never the page's other copy;
Cmd/Ctrl+E edits; Cmd/Ctrl+Z / Shift+Z undo / redo settings outside fields;
other keys go to the read view's `onKey` — not while typing in a field, not
while an editor is the document, and from the chrome only on a button and
never that button's own keys (Space, Enter, Tab, Escape; a menu's keys are
the menu's; the pencil's ArrowUp/ArrowDown open its list), so slides' arrows and Page Up/Down keep working after the
reader used a chrome button.

**Cmd/Ctrl+P** (2.3.0, round 2 of the orz-paged loop; A.30; not with Shift
or Alt) runs the kind's **Print action** — the action with id `print` and a
`run`, offered for the current text (`hidden`) — wherever the reader is: the
read view (default prevented), edit mode's chrome, the editor, and the
editor's preview frame. The frame's key reaches the app as the editor's
`print` event (FC-19 §4): the default bridge reports Cmd/Ctrl+P through its
authenticated port as a trusted key (`orz-preview-key { key: 'p' }`) and
prevents the frame's own print, so a reader in the preview never prints a
blank editor page; a forged report on the window does nothing. A Print
action that is the read view's (not `inEdit`) runs after the app leaves edit
mode (as Done does: the text stays as it is, unsaved if it was), so it
prints the read view; an `inEdit` one runs in edit mode. Without a Print
action (or with it hidden) the read view's key is the browser's, and from
edit mode (the chrome, the editor or its frame) the app calls
`window.print()` — the browser's print of the page. An editor mounted by an
app host (`attach`) is the host's: the kit's editor prints the host page. A setting chosen with the pointer leaves the
focus to the page (with the keyboard it returns to the pencil).

### 4.9 The quiet update

Only a top-level file checks (`checkForUpdate({ kind, current: version,
format, page, storage })`, whose own guards add the served-page rule). An
offer (2.2.0) marks the pencil with a dot and adds **Update to x.y.z** to
the handle's list — a submenu: Update now, What's new (the release notes, a
link in a new tab, when there are some), Not now, Skip this version; while
the update runs it reads "Updating…" and is disabled, and a refusal is a
toast — and mounts the kit's indicator (shell-runtime §7.3) after
`#orz-brand` in edit mode's bar; Not now or Skip this version in either
drops both. Update now runs `performUpdate`
with the file's saver, delivery and includes and the current text (read
again before the save). While it runs every editor of the document and the
setting pickers are read-only — also an editor opened (Edit) or attached
while it runs; every editor the update made read-only is given back when it
settles without a reload (success or failure), and one that was read-only
before stays so. The page reloads only when `performUpdate` says so (the opened
file itself was written and the text did not move on), and nothing is asked
then. A served page's update is downloaded. Skip this version records it.
An update whose save finds the file changed on disk (shell-runtime §1 step
3.4) writes nothing; the indicator says so (`UPDATE_CONFLICT_MESSAGE`: "The
file changed on disk since you opened it (another program or an agent
edited it), so the update wrote nothing. Reload the page to open its
version, then update."). Update now while the file's save-conflict question
is open (§4.5) is refused before anything runs (round 5, B4): no
re-assembly, no picker, nothing written; the reader is told
`UPDATE_QUESTION_OPEN` ("The file changed on disk and the question about it
is still open, so the update wrote nothing. Answer it first …") and the
question is focused (`focusSaveConflict`); a question that opens while the
update re-assembles stops its save the same way.

### 4.10 Reader preferences and reader controls

One `createPreferenceStore(uid, the page's storage)`: passed to the editor
(`ctx.preferences`: view mode, split, scroll sync, font size) and read by
the chrome (`darkChrome`, `fontScale`). Never in the text.

**Reader controls** (2.2.0, D5). A kind opts in to reader-side controls
that never change the document: `readerControls.fontScale = { min, max,
step }` in percent (`min` ≤ 100 ≤ `max`, `step` > 0; anything else offers
nothing; md: 80–160 in steps of 10). The app offers a row in the handle's
list — "Text size", **A−**, the percentage (it resets to 100) and **A+**,
disabled at the ends, the list staying open — and applies the value as the
custom property `--orz-font-scale` (percent / 100) on the read view's
element (`view.element`, else the page's root), snapped to the kind's steps
and range. It is the `fontScale` reader preference (stored per uid; 100
removes it), restored at boot; it never marks the document unsaved, never
reaches the host and never enters a saved file. The kind's read view uses
the property — md zooms its article by it (`zoom: var(--orz-font-scale,
1)`, set at run time: every theme sizes text its own way — px, rem, em,
`clamp()` with `vw` — so one zoom scales them all evenly and keeps the
line length in characters), and its editor preview does not follow it (the
editor has its own font-size preference). paged and slides decide later.
`CarrierApp.fontScale()` / `setFontScale(percent | null)` read and set it
(null when the kind offers none).

**Reader controls with named choices** (2.3.0; paged's Page zoom:
Automatic / Fit width / 100% / 125%). `readerControls.choices` is a list of
`ReaderChoiceControl { key, label, icon?, choices: { id, label }[], default,
apply(view, id) }`. A control is offered only when well-formed — `key`
matches `[a-z][A-Za-z0-9_-]{0,31}` and is unique among the kind's controls,
1–24 choices with unique non-empty ids (≤ 64 characters), `apply` a
function; `default` not among the ids means the first. Each is a submenu of
radio choices in the handle's list (before the text size row). The choice
is a reader preference (shell-runtime §2): stored per uid under
`reader.<key>` in the preference store, whose schema the app builds from
the controls — `set` and `get` accept only one of the control's ids, so a
forged or stale stored value reads as the default; choosing the default
removes it. The app calls the kind's `apply(view, id)` at boot (the stored
choice, else the default — before the first render, so the view keeps it
for every render) and on each choice; it never marks the document unsaved,
never reaches the host and never enters a saved file. `CarrierApp.
readerChoice(key)` / `setReaderChoice(key, id | null)` read and set it (an
unknown id or null: the default; no such control: null).

### 4.11 The handle (`CarrierApp`, `OrzCarrier.standalone`)

`kind`, `file`, `getText()`, `isDirty()`, `edit()`, `leave()`, `editor()`,
`setSetting(changes)`, `undo()`, `redo()`, `save()`, `download()`,
`newDocument(options?)` (2.3.0: `{ text?, name? }`, §4.5), `saveAsCopy()`, `editorContext()`, `attach(editor) → detach`,
`toast(message, tone?)`, `menu` (2.2.0: `open()`, `close()`, `isOpen()` — the
handle's list), `fontScale()`, `setFontScale(percent | null)` (2.2.0, §4.10),
`readerChoice(key)`, `setReaderChoice(key, id | null)` (2.3.0, §4.10),
`setChromeVisible(visible)`, `view`, `root`,
`host`, `updating`, `ready`, `dispose()`. The conformance target's editor
driver uses `standalone.edit()` (the pencil's path); its update driver opens
the list with `standalone.menu.open()` when the indicator's chip is not
shown (the read view) and chooses Update to x.y.z → Update now.

### 4.12 Services (tests)

`services?: Partial<AppServices>` replaces kit functions the app calls
(`createSaver`, `connectHost`, `checkForUpdate`, `performUpdate`,
`mountUpdateIndicator`, `skipVersion`) — for a carrier's own tests and the
conformance stub's broken builds (H.5). Production passes none.

## 5. Widgets

`mountHandle(doc, { label, activate, entries })` (`handle.ts`, 2.2.0): the
read view's pencil and its list (§4.2) — entries are items, submenus
(radio choices, actions, links) and rows of buttons that keep it open.
`button`, `menuButton` (a non-modal `role="menu"` popover: arrows, Home/End,
Enter/Space, Esc returns focus, outside pointer-down and Tab close; 2.3.0: an
item with `items()` is a submenu — `aria-haspopup`, a fixed popover beside
it, opened by ArrowRight, Enter, Space, a click or a hover on its checked or
first item, closed by ArrowLeft and Escape with the focus back on its item;
one level), `settingPicker`, `attachSettings(shell, settings)` (2.3.0: each
picker writes `settingChanges`, and a setting with `hidden` follows the
text), `settingChoices`, `settingOffered`, `settingChanges` (2.3.0, §3.4), `hiddenFor(owner, text)` (2.3.0: `hidden(text)` asked once per text, §3.4), `reviewProposal(root,
proposal, { title })` (non-modal `role="dialog"`, the proposal editable,
Apply / Cancel, Esc cancels), `attachAiMenu(shell, { operations })`,
`followPresentation(shell, present)`, `installCss`, `WIDGET_CSS`. Text is
set as text; icons are the kit's `ICONS` or a kind's `KindIcon` (§3.4).
`button` marks a button with an icon `orz-btn--has-icon`; a menu item chosen
with the pointer leaves the focus to the page, with the keyboard it returns
to the menu button.

## 6. Engine source

`captureEngineSource(document?, { bundle?, integrity? }) → { inline, url,
get(fallbackUrl) }`, called synchronously at the bundle's start, takes only
the carrier's own bundle (2.2.0, round 1): an inline `<script>`'s exact text
when it is the file's `#orz-engine` or the update sandbox's bundle (a page
titled `orz update` with no island; the sandbox inlines the verified bundle
with nothing after it, U.6) — with `integrity` (the release's, when known)
it must also match it — or a loaded script's URL when its file name is the
bundle's (`bundle`, default any `orz-<x>.browser.js`), fetched once (and
required script-safe) when an inline assembly needs the text. An app's own
script that bundles the IIFE (`app.js`, or an inline app script) is not the
engine: `get(fallbackUrl)` then fetches the fallback — the release's
jsDelivr URL of this version. A kind's `assemble` uses it when no
`engineSource` is given.

## 7. Fitting orz-paged and orz-slides

Designed now so that neither needs a breaking change later:

- **orz-paged.** `createReadView` renders the pages with Paged.js into the
  page (`render` resolves when the pages are laid out — Paged.js is
  asynchronous; a newer render cancels an older one by generation, as the md
  view does); `present` sets the page size and template classes and the
  theme stylesheet and returns the scheme. Settings (owner decision 2,
  2026-10-09): **Theme, Page size, Template, Page numbers** (Page numbers
  may be two pickers: position and number style; header keys,
  FC-18 §5.1); margins, fonts, custom CSS and every other page key stay
  text-only (edited in the header, no setting); 2.3.0: **Version** — a
  setting with `choicesFor` (the dynamic choices the document defines, one
  group per key with per-choice `checked`), `apply` (the `dynamic_choices`
  map as a `{ multiline }` value) and `hidden` (no choices). Action:
  **Print** (id `print`, `placement: 'bar'`; its `run` waits for the read
  view's layout to settle — `await view.idle()`, the paged view's own
  method: pending re-flows after late fonts or libraries — then calls
  `window.print()`, so the pages print as finally laid out; the chrome
  prints hidden, CHROME_CSS `@media print`; 2.3.0: Cmd/Ctrl+P runs it from
  anywhere, also from edit mode and its preview frame — §4.8 — so the
  carrier needs no key listener of its own); 2.3.0: **New document from
  template…** — an action with `items` whose entries call
  `app.newDocument({ text: template, name })` with the template's text and
  a file name of its own (e.g. the template's name; the kit adds the
  extension): a fresh file, the open document untouched (FC-18 §7.3: the
  header's `template:` only selects layout defaults). Reader control (2.3.0):
  **Page zoom** — `readerControls.choices` (`apply(view, id)` zooms the
  pages). Two columns across a page break (owner, 2026-10-09: the
  **hybrid**, family REBUILD §3b decision 1): a Paged.js handler of the
  carrier's own moves a short `.cols` block whole to the next page only
  when that leaves less than about a third of the page empty (owner,
  orz-paged loop round 3), and otherwise splits it — and any long one —
  column by column at the page bottom (column 1 continues in column 1);
  its limits are the carrier's, documented there (a lone long column stays
  narrow; only paragraphs, list items, blockquotes, plain divs and tables
  (between rows) split; a block no cut can place falls back to plain flow;
  one-line widows; over-tall blocks clip) — a
  registered print-first limit, not a kit concern (the kit knows nothing
  of columns). Its pagination enhances with `enhanceDocument(root, { static: true
  })` (2.3.0, `orz-markdown/preview-frame`): drawn canvases become images
  Paged.js can re-parse, the interactive runtime is skipped unless asked
  for — `{ static: true, runtime: true }` is allowed (the read view keeps
  copy-as-Markdown; tabs and QR expansion are inert on paper anyway).
  Editor: the kit's shell with
  `preview.frameDocument` building a Paged.js frame (FC-19 §8.4 pluggable
  preview), `preview.diff: false` (Paged.js reflows the whole document) and
  `__orzPreviewApply` running the layout, and (2.3.0, E.32)
  `preview.maxWaitMs: Infinity` — a Paged.js reflow runs in the page's own
  process (the `srcdoc` frame), so the preview renders only after a pause
  in typing, never forced while keys keep arriving, and (2.3.0, E.34)
  `preview.firstAckWaitMs` raised to its first layout's time (a late first
  acknowledgement is recorded either way); `followPresentation`
  returns the page-size head.
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
app's own modules under 66 KB (29.9 KB measured on 2026-10-07; 32.9 KB on
2026-10-08 after round 1 of the carrier-app loop; 35.5 KB after round 5;
52.7 KB on 2026-10-09 with the handle and edit mode's brand; 60.1 KB with
2.3.0's submenus, conditional actions and settings, block-valued settings
and reader choices) and adds under 82 KB to a bundle that already holds the
editor (74.5 KB measured in 2.3.0: the app and the update, indicator, brand
and file side of the shell, which the editor alone does not load).
