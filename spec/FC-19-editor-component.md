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
assemble(text: string, options?: { delivery?: "inline" | "cdn" }): Promise<string>
extract(html: string): { text: string; kind: Kind; format: number; shell: string } | null
readDocument(text: string): DocumentInfo        // header + derived facts, no rendering
renderPreview(text: string, options?): Promise<string>  // sandboxable HTML for thumbnails / read-only views
version: string                                  // the shell version
```

`readDocument` lets an app index documents (title, author, licence, keywords,
kind, `uid`, theme) without rendering — what Alembic's discovery space needs.

## 3. `EditorOptions`

```ts
interface EditorOptions {
  text: string;                       // the document (FC-18), exact
  kind?: Kind;                        // when it cannot come from a file name
  readOnly?: boolean;
  mode?: "split" | "editor" | "preview";
  chrome?: "full" | "compact" | "none";   // how much toolbar the host wants
  hooks?: EditorHooks;
  preferences?: PreferenceStore;      // reader preferences (FC-18 §6); default: localStorage
}

interface EditorHooks {
  save?(text: string): Promise<void>;                      // absent → standalone file save
  ai?: { operations: AiOperation[];
         request(op: string, ctx: { text: string; selection?: Range }): Promise<{ proposed: string }> };
  fetchInclude?(target: string): Promise<string | null>;   // URL or path; host owns the trust policy
  resolveAsset?(path: string): string;                     // relative path → URL for preview
  uploadAsset?(file: File): Promise<string>;               // returns the relative path to insert
  resolveLink?(href: string): string;                      // e.g. map twin links inside an app
  mintUid?(): Promise<string>;                             // host-minted ids (FC-18 §10)
}
```

## 4. `Editor`

```ts
interface Editor {
  getText(): string;
  setText(text: string, options?: { resetHistory?: boolean }): void;
  isDirty(): boolean;
  markSaved(): void;
  save(): Promise<void>;                 // calls hooks.save or the standalone save
  setMode(mode: "split" | "editor" | "preview"): void;
  focus(): void;
  on(event: "change" | "dirty" | "selection" | "save" | "error", fn: (e) => void): () => void;
  destroy(): void;
}
```

## 5. Invariants

1. **Browser only, no server.** Editing, preview and `assemble` need no
   backend; the engine and editor load from the package (inline) or the CDN.
2. **Several instances per page**, no global state, nothing leaks between them
   (separate undo history, preferences namespaced by `uid`).
3. **Isolation.** The chrome renders in a shadow root (the host's CSS cannot
   break it, and it cannot restyle the host); the document preview renders in
   a sandboxed frame (orz-markdown preview frame), so document content never
   runs in the host page.
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
