# FC-18 · Text form and assembly — format 1

**Status:** binding — approved by the owner on 2026-10-05 (orz family decisions
FD-05/FD-06, contract FC-18). Changes follow the family's contract-change rules.

**Owner decisions are collected in §12 (all taken 2026-10-05).**

## 1. Purpose

One document, two forms:

| Form | File | For |
|---|---|---|
| **Text** (canonical) | `name.md`, `name.slides.md`, `name.paged.md` | storage, git, diffs, AI, indexing |
| **Assembled** | `name.md.html`, `name.slides.html`, `name.paged.html` | people: reading, presenting, printing, editing in a browser |

The text holds all content and every author choice. The assembled file is the
text plus a regenerable **shell**. Converting is deterministic in one direction
(`assemble`) and exact in the other (`extract`).

## 2. Laws (tested on every release)

1. **Round trip.** `extract(assemble(T, s, o)).text === T` for every text
   `T` with consistent line endings and no NUL or lone surrogate, every shell
   version `s` that supports `T`'s format, every option set `o`. Exact to the
   byte: line endings, BOM, trailing whitespace, everything. (An HTML file
   cannot carry NUL, a UTF-8 file cannot carry a lone surrogate — `assemble`
   refuses both; a text that mixes line-ending styles is stored in the style
   of its first line break, and lint warns `mixed-eol`.)
2. **Determinism.** `assemble(T, s, o)` returns the same bytes every time, in
   the browser and in Node. No timestamps, random ids, machine paths or
   locale-dependent output.
3. **Idempotence** (follows from 1 and 2). `assemble(extract(F).text, s, o) === F`
   when `F` was made by shell `s` with options `o`.
4. **Content independence of the shell.** Two shells that support format 1
   render the same text to the same document content; they may differ only in
   chrome and look (FD-05).

## 3. Kinds and file names

| `kind` | Text | Assembled | Body grammar added to FC-01 |
|---|---|---|---|
| `md` | `*.md` | `*.md.html` | none |
| `slides` | `*.slides.md` | `*.slides.html` | slide and region markers (§7.2) |
| `paged` | `*.paged.md` | `*.paged.html` | element blocks (§7.3) |

- The kind comes from the **file name** (swap the last extension). A
  `carrier` key in the header (§5) states it when the text travels without a
  name (pasted, sent by an API). **A tool that creates a document writes
  `carrier: <kind>` in its new header** (with `uid`, §10); a file name, when
  there is one, still decides the kind of an existing text.
- **Any plain Markdown file is a valid `md` document** (no header needed), so
  existing `.md` files work unchanged.
- Encoding: UTF-8. The envelope stores the text exactly as given; renderers
  normalize line endings internally, never in storage. Tools read a text twin
  from its bytes with `decodeText` (UTF-8, keeping a BOM — `File.text()` and a
  default `TextDecoder` strip it; `{ fatal: true }` refuses invalid UTF-8
  instead of replacing it with U+FFFD).

## 4. Text layout

```
<header>      optional; the document header (§5), first thing in the file
<body>        the source grammar (FC-01) plus the kind's body grammar (§7)
```

An optional BOM, then optional whitespace, may precede the header. There is at
most one header.

## 5. The document header

**Syntax (D1, decided: nyml).** The header is an orz nyml block whose first
line is `kind: document`:

```markdown
{{nyml
kind: document
title: Cell Biology — Week 3
author: Yu Wang
license: CC-BY-4.0
theme: light-neat-3
}}

# Cell Biology …
```

- `{{nyml` stands alone on the first line and `kind: document` on the next
  (a key on the opener line triggers nyml's indentation inference); `}}` stands
  alone on the last line.
- The block is found with orz-markdown's token-based scanner
  (`scanNymlBlocks`), never by string search, so a block shown inside a code
  example is never taken for the header.
- **It renders nothing.** orz-markdown emits no data island for any nyml
  block whose kind (read by the same flat reader, wherever the `kind` line is)
  is `document`, and every carrier consumes it. Lint warns when `kind` is not
  the first key.
- On GitHub and in other Markdown viewers the block shows as plain text — the
  accepted cost of keeping one metadata grammar (RULES §2.4).
- **Legacy headers** (experimental files): when no `kind: document` block
  leads the text, a leading `{{nyml kind: meta}}` block (DocMeta) is read as
  the header. If a `kind: meta` and a `kind: document` block lead the text
  together (in either order, nothing but whitespace between them), they are
  read as **one** header, the document block's keys winning on a clash, and
  any tool that edits the header first merges them into a single
  `kind: document` block (the document block's lines first, then the lines of
  the meta-only keys). A lone legacy `kind: meta` header is converted on the
  first edit: its `kind: meta` line becomes `kind: document` (a one-line
  change), then the edit applies. paged's existing `{{nyml kind: document}}`
  already is the header.

**Value rules:**

- One `key: value` per line at the block's base indentation; values are
  strings (surrounding quotes removed); `key: |` starts a multi-line value of
  the more-indented lines that follow. Deeper lines that are not part of a `|`
  value are ignored (the flat nyml reader). Only LF, CR LF and CR end a line;
  U+2028 and U+2029 are ordinary characters in a value.
- **Keys:** writers use `[a-z][a-z0-9_]*` and an ASCII `:`. Readers accept what
  the nyml reader accepts (`[A-Za-z0-9_]+`, the full-width `：`) and lint warns
  on anything else.
- **No `}}` in a value.** The header ends at the first `}}`, so a value must
  not contain that sequence (write `} }` in CSS). **Detection:** lint reports
  `closer-in-value` (error) when the header's closing `}}` line holds other
  text that is not a `key: value` line (the header ended inside a value, e.g.
  a CSS line of a `|` value ending in `}}`), when a lone `}}` line or key lines
  follow the header before the first blank line (the header was cut by a `}}`
  in a single-line value or a lone indented `}}` in a `|` value), or when text
  follows the closing `}}` on its line. The lines checked are those right after
  the header's last block, up to the first blank line, the first line starting
  with `{{`, or a fence (` ``` ` / `~~~`), so a header followed directly by an
  element block, a directive or a code block is not reported; a compact `key: value}}` closing line
  otherwise is only a warning (`closer-not-alone`). The grammar does not
  change: the header ends at the first `}}`.
- **Entries (one rule).** An entry is its key line plus the following lines
  indented deeper than the key. For a `key: |` value those lines are the
  value. For a scalar key they are ignored by the reader (lint
  `ignored-line`): setting a scalar value replaces the key line only (the
  ignored lines stay); writing a `|` value over a key, removing a key, and
  merging a legacy pair take the whole entry.
- Duplicate key: the last one wins (and a lint warning).
- **Unknown keys are kept untouched** — the header is never re-serialized
  (§9), so anything a tool or host adds survives every edit, save and update.
- **Host keys** use the prefix `x_<name>_` (e.g. `x_alembic_chapter`). The
  family never defines a key starting with `x_`.

### 5.1 Key registry, format 1

| Key | Kinds | Meaning | Default |
|---|---|---|---|
| `format` | all | text format version | `1` |
| `carrier` | all | `md` / `slides` / `paged` (when the name is unknown) | from the file name |
| `title`, `author`, `description`, `date`, `keywords`, `source` | all | DocMeta (FC-03) | — |
| `license`, `license_name`, `license_url` | all | DocMeta licence (SPDX id or name/url) | — |
| `uid` | all | stable document id `doc-[0-9a-z]{10,32}`; creation tools mint 16 random base36 characters (D3) | — |
| `lang` | all | BCP 47 language of the content (`<html lang>`) | `en` |
| `theme` | all | theme id for the kind (md: an id of orz-markdown's `THEMES`; another value is the lint warning `unknown-theme`, 2.2.0, and shows the default theme; slides and paged lint their own lists through `lintHeader(text, { kind, themes })` / `readDocument(text, { kind, themes })`, 2.3.0) | kind default |
| `measure` | `md` | `normal` / `wide` / `full` line length (orz-markdown 2.0.0 classes) | `normal` |
| `ratio`, `footer`, `transition` | `slides` | deck shape, footer text, default transition | `16:9`, none, none |
| `template`, `page_size`, `margin_top`, `margin_bottom`, `margin_left`, `margin_right`, `page_background`, `font_preset`, `font_family`, `font_heading_preset`, `font_margin_box_preset`, `font_size`, `line_height`, `decoration_color`, `page_number_position`, `page_number_style`, `page_number_start_page`, `first_page_skip_number`, `header_left`, `header_center`, `header_right`, `header_rule`, `header_rule_color`, `header_font_size`, `footer_left`, `footer_center`, `footer_right`, `footer_rule`, `footer_rule_color`, `footer_font_size`, `first_page_hide_header`, `first_page_hide_footer`, `front_matter` (alias `front_matter_clean`), `limit_image_to_page`, `keep_image_together`, `repeat_table_header`, `avoid_table_row_breaks`, `custom_css`, `dynamic_choices` | `paged` | page settings (today's paged keys, unchanged names; listed explicitly so lint catches misspellings) | paged defaults |

`keywords` splits on `,` `;` and their full-width forms. `dynamic_choices` and
`custom_css` are `|` blocks. A future key is added to this table in a minor
contract revision; removing or changing a key's meaning needs a new format.

## 6. What is and is not document data

| In the text (document) | Not in the text |
|---|---|
| content, header keys (§5.1), host keys | **reader preferences**, stored per browser: split-pane ratio, scroll sync, view mode, editor font size, dark chrome toggle (D5) |
| | **shell**: engine, app code, chrome, CSS, CDN URLs, runtime, include cache (§8.3) |

Rule: if two readers of the same document should see the same thing, it is in
the text; if it is one reader's preference, it is local; if it can be
regenerated, it is shell.

## 7. Body grammar per kind

### 7.1 `md`
FC-01 unchanged.

### 7.2 `slides`
- Slides start at `<!-- slide [options] [layout] -->`; regions at
  `<!-- @name [attrs] -->` on a line of its own. HTML comments keep the text
  readable in any Markdown viewer. Markers are recognized **only as top-level
  HTML-comment blocks** — never inside code, multi-line directives,
  blockquotes, lists or raw HTML blocks (fixes the survey's fence bugs).
- The old `<!-- deck … -->` preamble is replaced by the header (§5): deck
  keys `title theme ratio author footer transition` become header keys.
- Slide options: `key=value` (`bg t fit class id template v`, values may be
  quoted: `class="a b"`) and bare flags (`step`). Validated; an unknown option
  is a lint error, not a layout name.
- Layouts and templates as today (`2col 3col 2row main-side quad`, raw
  `row|col` splits, `template=title|section|outline|closing`, `v=N`), each with a
  documented region list; a region not in the layout is a lint error. Presets
  that take a ratio: `2col`, `3col`, `2row`, `main-side` (track count must
  match); `quad` takes none (lint if given).
- Text before the first slide marker is preserved and shown as a lint notice
  (today it silently never renders).

### 7.3 `paged`
- Element blocks `{{nyml kind: <element>}}` (cover, title page, … — the twelve
  kinds in today's renderer) are found with orz-markdown's token-based scanner
  (never a raw string search).
- Settings move from `{{nyml kind: document}}` into the header (§5.1).
- Templates are **text skeletons** (header + body); applying a template is a
  text edit, never hidden state.

## 8. The assembled file

### 8.1 Structure

```html
<!doctype html>
<html lang="{lang}" data-orz-kind="{kind}">
<head>
  <meta charset="utf-8">
  <meta name="generator" content="orz-{kind} {shellVersion}">
  <title>{title}</title>
  … head metadata derived from the header (FC-03) …
  <script type="application/orz-meta+json" id="orz-meta">…</script>
  <script type="application/json" id="orz-shell">{"kind":"…","format":1,"shell":"…","delivery":"inline"}</script>
  … shell assets …
</head>
<body>
  <!-- agent banner: names the island, the kind, the format, the skill URL -->
  <script type="text/markdown" id="orz-src" data-orz-format="1" data-orz-eol="lf">{escaped text}</script>
  … shell …
</body>
</html>
```

**D2** — one island for every kind: `<script type="text/markdown"
id="orz-src">` (slides' `#orz-deck` / `text/orz-slides` retires).

- **Island:** the text with its line breaks written as LF and a leading BOM
  removed, escaped with `escapeScriptText` (reversible; covers `</script` and
  `<script`), so an HTML parser's DOM reads it unchanged (a parser turns CR
  and CR LF into LF). Attributes: `data-orz-format`; `data-orz-eol`
  (`lf` / `crlf` / `cr`: the style of the text's first line break, `lf` when
  it has none); `data-orz-bom` (present when the text starts with U+FEFF).
  `extract` reads `#orz-src`, reads its line breaks as a parser does (CR and
  CR LF as LF, so a file converted to CR LF after assembly still extracts
  exactly), unescapes and restores the line-ending style and the BOM —
  nothing else; a reader of the DOM (`readIslandFromDom`) applies the
  same restoration to the element's `textContent`. Experimental files (slides'
  `#orz-deck`) are not read by `extract`; they are not migrated.
- **Reserved ids:** the shell parts must not contain an element with id
  `orz-src` or `orz-shell`; `assemble` refuses them.
- **Derived, never edited separately:** `<title>` (header `title`, else the
  first **top-level** level-1 heading — not one inside a blockquote, list or
  container; for `slides` only a heading after the first slide marker (a
  top-level `<!-- slide` comment block, indentation allowed; text before it
  never counts); its plain text as a reader sees it — typographer output,
  entities decoded, a hard break (`<br>`, a backslash or two-space break) as
  one space, `{{emoji}}` characters, `{{sp}}` text, math source as
  written, image alt text as the renderer writes it, markup dropped — else, for `paged`, the `title` (else `text`) field of strictly
  the first title element, i.e. the first nyml block after the header whose
  kind ends in `-title` (`article-title`, `report-title`, `exam-title`, …;
  `cv-header` and `letterhead` are not title elements; if that element has
  neither field the chain goes on to `Untitled`, it does not try the next
  element), else `Untitled`);
  templates carry a `title` key in their header so new documents start titled; head metadata and `#orz-meta` (from
  the header; nothing else), `lang`. Theme presentation (classes, styles) is
  applied by the shell parts, not by the envelope.
- **Markers:** `#orz-shell` (kind, format, shell version, delivery) and the
  `generator` meta. They are the only version information in the file.
- **No user state in the shell** (§6): no `docId`, no filename, no saved theme
  outside the text.

### 8.2 Options

`assemble(text, { delivery: "inline" | "cdn", includes? })`. Inline is the
default (FD-02). `includes` (added 2026-10-06, closed loop 2 round 3;
additive) are resolved includes to store in `#orz-includes` as given instead
of resolving the text's directives (§8.3). Nothing else changes the output.

### 8.3 Links, assets, includes

- Relative links to a text twin (`week2.slides.md`, `notes.md#part`) render as
  links to the assembled twin (`week2.slides.html`, `notes.md.html#part`); the
  text keeps the `.md` link (so it also works on GitHub). Other links are
  untouched. Precisely: Markdown links (not images) whose path's last segment
  ends in lower-case `.md`, `.slides.md` or `.paged.md`, with an optional
  `?query` and/or `#fragment` (kept); relative and root-relative (`/x.md`)
  paths are rewritten; absolute URLs (any `scheme:`), protocol-relative
  `//host/…` and fragment- or query-only hrefs are not; raw-HTML `<a>` is
  untouched. orz-markdown applies the rewrite when the render's env sets
  `orzTwinLinks: true`.
- Assets are relative paths, untouched.
- **Includes (D4).** A standalone file cannot read local files. At
  assembly, file and URL includes are resolved under the 2.0.0 trust model and
  stored in a shell island (`#orz-includes`, derived data); the text keeps the
  directives. A web-app host supplies a `fetchInclude` hook instead (FC-19).
  A page cannot resolve local includes again, so every re-assembly in the
  browser — the editor's save and the quiet update — carries the opened
  file's island over exactly (`assemble(text, { includes:
  extract(html).includes })`, FC-19 §2, §8.5; spec/shell-runtime.md §7.2,
  which refuses an update whose file does not hold them exactly). The island
  is what the last assembly that could read the files resolved: a directive
  added in the browser is resolved at the next such assembly (the CLI).
  Before closed loop 2 round 3 (2026-10-06) the browser dropped the island
  on every save and update.

### 8.4 Formats across shells

- Every shell reads every **older** format.
- A shell that meets a **newer** format shows the document read-only, with the
  quiet indicator offering the update; it never saves over it.
- An older shell never writes a newer format: `assemble` refuses a text whose
  header `format` is greater than the shell's format.

## 9. Editing the header (rule for every tool)

Tools change a header value by **editing that one line in place** (append a
new line just before the closing delimiter if the key is absent; remove the
line to unset). They never parse-and-reserialize the header, never reorder
keys, never touch other lines. UI-edited keys are single-line. An inserted line uses the header's existing
line ending (`\r\n` stays `\r\n`, `\r` stays `\r`). This keeps unknown and host keys,
comments-by-convention and formatting intact.

Edit rules in detail:

- **Set an existing key:** only the value part of its line is replaced; the
  indentation, the key's spelling and its separator (`:` or `：`) are kept.
  With duplicate keys the last one (the one that wins) is edited. A scalar
  set over a scalar key replaces the key line only; when the old or the new
  value is a `key: |` value, the whole entry (§5) is replaced.
- **Insert:** `key: value` just before the closing `}}` line, with the
  indentation of the header's keys and the header's line ending.
- **Remove:** the key's line goes, with a `key: |` value's continuation lines
  and every duplicate of the key (so the key is really unset).
- **Values:** single-line; no CR or LF, no `}}`, no NUL. A value the reader
  would trim or unquote (leading or trailing spaces, surrounding quotes, a lone
  `|`) is written in double quotes so it reads back exactly. Keys written by a
  tool match `[a-z][a-z0-9_]*`; `kind` is never edited.
- **Multi-line values** (explicit path, e.g. `custom_css`, `dynamic_choices`):
  written as `key: |` followed by the value's lines, each indented by the
  key's indentation plus two spaces, in the header's line ending. Refused when
  it would not read back exactly: `}}`, CR, NUL, whitespace-only lines, a
  trailing empty line, an indented first line, tab indentation.
- **Closing line:** when the edited entry ends on the closing `}}` line
  (`key: value}}`), the header's line ending is written before `}}`.
- Several changes may be applied in one pass (`editHeader`); every byte
  outside the edited entries stays unchanged.
- **No header:** a new one is inserted at the start of the text (after a BOM).
  Note: a file that starts with Jekyll/Hugo front matter (`---` or `+++`)
  then has the header before it, where those tools no longer see their front
  matter; lint warns `front-matter`. The inserted header is:
  `{{nyml`, `kind: document`, `key: value`, `}}`, a blank line, in the text's
  line ending.
- **Legacy headers** are upgraded first (§5). The upgrade alone, with no
  value changed, is `normalizeHeader(text)` (orz-markdown 2.3.0): a legacy
  pair merged into one `kind: document` block, a lone `kind: meta` header
  turned into `kind: document`, every other byte kept; any other text is
  returned as is (a tool that moves a 0.x settings block to the top — orz-
  paged's `upgrade` — calls it instead of an edit and its undo).

## 10. Identity (D3)

- `uid` lives in the header. **Creation tools mint it** (`new`, "New
  document", a host's "create"), never `assemble` (that would break
  determinism).
- A host that keeps a registry treats an incoming `uid` as a claim: on import
  or duplication it re-mints when the id is already taken, and writes the new
  one into the header.
- The in-file save remembers its file handle by `uid`; a document without
  `uid` remembers it by the page address.
- This replaces FC-03's "uid is host-only, never read from source" and
  RULES §6.2's no-rewrite rule (the header is the source now).

## 11. Conformance

- **Golden corpus** in `orz-markdown/tests/carrier-corpus/` (plan in
  [FC-19 §6](FC-19-editor-component.md#6-golden-corpus-and-conformance)).
- **Laws 1–2** as property tests over the corpus and random text (any Unicode,
  CRLF/CR, BOM, `</script>`, `<!--`, very long lines, empty text).
- **Law 4** checked by rendering the corpus with consecutive shell versions.

## 12. Owner decisions (2026-10-05)

| # | Question | Decision |
|---|---|---|
| D1 | Header syntax | **nyml block** (`{{nyml` / `kind: document` / … / `}}`); one metadata grammar |
| D2 | One island `#orz-src` (`text/markdown`) for all kinds | yes — slides' `#orz-deck` retires |
| D3 | `uid` in the header, minted by creation tools; hosts re-mint duplicates | yes |
| D4 | Resolve includes at assembly into a shell island | yes |
| D5 | Reader preferences are local, not in the text | yes |
| D6 | HTML-comment markers for slides/regions | yes |
| D7 | A newer-format file opens read-only with the update indicator | yes |
