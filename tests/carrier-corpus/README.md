# Carrier golden corpus — text format 1

Shared test documents for the orz carrier rebuild (FC-18 text format 1, FC-19
editor component; binding specs in [`../../spec/`](../../spec/)). Every
carrier (orz-mdhtml, orz-slides, orz-paged) and every shell version is tested
against the **same** texts: the FC-18 laws (round trip, determinism,
idempotence, content independence), `readDocument` agreement with the header,
create → edit → save → reopen, and update from the previous shell.

`manifest.json` is the index. `../carrier-corpus.test.ts` checks that the
corpus is what the manifest says (files exist, kinds match names, headers parse
with `scanNymlBlocks` to the listed facts and keys, slide/element counts,
byte properties).

## Layout

```
carrier-corpus/
  manifest.json            one entry per document (see "Manifest fields")
  md/                      kind md      (*.md)
  slides/                  kind slides  (*.slides.md)
  paged/                   kind paged   (*.paged.md)
    every-template/        one file per orz-paged assets/templates/*.md
  expected/<kind>/<shell-version>/*.html   assembled outputs — added in Phases 2–3
```

`expected/` does not exist yet. It is created in Phases 2–3, when `assemble`
exists: one folder per kind and shell version, holding `assemble(text)` for
every corpus file, regenerated per release and used as "the previous shell" by
the update checks.

## Files

md/

- `minimal.md` — smallest format-1 document: header (format, title) + one paragraph.
- `every-construct.md` — every FC-01 construct (headings with `{{attrs[#blk-…]}}` ids, emphasis variants, lists, tasks, tables, code, math with mhchem, footnotes incl. inline, every container, every `{{plugin}}` and alias, raw HTML) under a header that uses every md registry key.
- `no-header.md` — plain Markdown, no header; title derives from the first `#` heading.
- `legacy-meta-block.md` — only a leading `{{nyml kind: meta}}` block (DocMeta), read as the header.
- `host-keys.md` — `x_alembic_*` / `x_coursewerk_*` host keys and unknown family-looking keys (`subtitle`, `reading_time`) that must survive untouched.
- `crlf.md` — CR LF line endings everywhere, incl. the header and a `custom_css: |` value. **Byte-sensitive.**
- `bom.md` — starts with a UTF-8 BOM before `{{nyml`. **Byte-sensitive.**
- `script-close.md` — `</script>`, `<script`, `<!--`, `<!--<script>`, `]]>` and case variants in header values, prose, code and raw HTML; no trailing newline. **Byte-sensitive.**
- `unicode.md` — CJK, RTL and bidi marks, emoji sequences, combining marks (NFC/NFD), astral-plane characters, special spaces.
- `large.md` — about 2,000 lines plus one ~30,000-character line (generated; see below).

slides/

- `minimal.slides.md` — header + one slide.
- `every-layout.slides.md` — every preset (with and without ratios), raw `row`/`col` splits, floats; every slides header key.
- `every-template.slides.md` — title v1–v6, section v1–v4, outline v1–v3, closing v1–v3.
- `notes-and-fragments.slides.md` — `@notes`, `step`, `{{attrs[.fragment]}}`, `@footer`, `@body`, options `bg t id class fit`; ratio 4:3.
- `markers-in-code.slides.md` — markers and a header example inside fences, indented code, code spans and multi-line directives; must give exactly 5 slides and 1 header.
- `title-v2-long-title.slides.md` — reproduces STATUS **D-46** (long title on `template=title v=2`), with controls.

paged/

- `minimal.paged.md` — header (title, template) + one paragraph.
- `every-template/*.paged.md` — each orz-paged template in format 1: its `kind: document` block is the header (`format: 1` added as line 3), body byte-identical to `orz-paged/assets/templates/<name>.md`.
- `elements.paged.md` — all twelve element kinds (incl. `placement: page`) and nearly every paged settings key.
- `columns-across-pages.paged.md` — reproduces STATUS **D-48** (a `:::: cols` block crossing a page break on A5).
- `dynamic-choices.paged.md` — a three-key `dynamic_choices: |` map driving answers and `data-show-when` / `data-hide-when`.

## Byte-sensitive files

`md/crlf.md`, `md/bom.md` and `md/script-close.md` test exact bytes (CR LF,
the BOM, a missing final newline). **Never open and re-save them in an editor
that normalizes line endings, strips the BOM, or adds a final newline.** Change
them only with a script that writes bytes (`fs.writeFileSync`), then run the
corpus test. `.gitattributes` (`* -text`) keeps git from converting any
corpus file; every file here is compared byte for byte.

## Rules for adding a file

1. Put it under the folder of its kind, named by the FC-18 §3 convention
   (`*.md`, `*.slides.md`, `*.paged.md`). The kind comes from the name.
2. Realistic content, not lorem ipsum. Do not put personal contact data in it.
3. A header follows FC-18 §5 exactly: `{{nyml` alone on line 1, `kind: document`
   alone on line 2, `format: 1`, flat `key: value` lines (keys `[a-z][a-z0-9_]*`),
   `key: |` for multi-line values, `}}` alone on its line. Only whitespace (or a
   BOM, in `bom.md`) may precede it.
4. Add a `manifest.json` entry (fields below) and run
   `npx vitest run tests/carrier-corpus.test.ts`.
5. Once `expected/` exists, regenerate its outputs for the new file.
6. Never edit a file to make a carrier pass; a corpus file changes only when the
   spec (FC-18/FC-19) changes. Display-defect reproductions keep their defect id.

## Manifest fields

| Field | Meaning |
|---|---|
| `path` | relative to this folder |
| `kind` | `md` / `slides` / `paged` (must match the file name) |
| `hasHeader` | a leading `kind: document` header (format 1) |
| `legacyHeader` | a leading `kind: meta` block read as the header (FC-18 §5 legacy) |
| `header` | facts the header must yield: `title author license theme uid` (`null` = absent) |
| `keys` | every header key except `kind`, in source order (host and unknown keys included) |
| `derivedTitle` | `<title>` per FC-18 §8.1: header title, else first level-1 heading, else — for `paged` — the `title` (or `text`) of the first title element (a nyml block whose kind ends in `-title`), else `Untitled` |
| `slideCount` | slides only: real slide markers (outside code and directives) |
| `elementKinds` | paged only: `kind` of every nyml block after the header, in order |
| `byteSensitive` | see above |
| `purpose` | what the file is for |
| `checks` | FC-18 laws / sections and FC-19 checks it targets |
| `defect` | `D-46` / `D-48` when it reproduces a STATUS display defect, else `null` |

## How `large.md` was made

Generated once by the script below (Node ≥ 20, no dependencies; deterministic —
no randomness or dates). Run `node large-gen.mjs md/large.md` with this code
saved as `large-gen.mjs`; the output's SHA-256 is
`10666578b2ab82ea81cc2d3a2ba4f714083ef82f39f65cfd886596b736eb3e24`.

```js
// Deterministic generator for md/large.md (no randomness, no dates).
import { writeFileSync } from 'node:fs';
const elements = ['hydrogen', 'helium', 'lithium', 'beryllium', 'boron', 'carbon', 'nitrogen', 'oxygen', 'fluorine', 'neon'];
const out = ['{{nyml', 'kind: document', 'format: 1', 'title: Large Document — 48 Problem Sets', 'author: Yu Wang', 'license: CC-BY-4.0', 'uid: doc-0large0000', '}}', '', '# Large Document — 48 Problem Sets', '', '{{toc 2,2}}', ''];
for (let s = 1; s <= 48; s++) {
  const el = elements[(s - 1) % elements.length];
  const id = 'blk-' + (s * 1103515245 % 2147483648).toString(36).padStart(8, '0');
  out.push(`## Problem set ${s}: ${el}{{attrs[#${id}]}}`, '');
  out.push(`Set ${s} practises stoichiometry with ${el}. Work each problem before opening the answer.`, '');
  for (let p = 1; p <= 8; p++) {
    const mass = ((s * 37 + p * 11) % 90) + 10;
    out.push(`${p}. A sample of ${mass}.0 g reacts completely. Find the amount in moles (problem ${s}.${p}).`);
  }
  out.push('');
  out.push('| Quantity | Value | Unit |', '|---|---:|---|');
  for (let r = 1; r <= 6; r++) out.push(`| q${r} | ${(s * r * 7) % 1000 / 10} | g/mol |`);
  out.push('');
  out.push(`$$\nn_{${s}} = \\frac{m}{M} = \\frac{${s + 10}.0\\,\\mathrm{g}}{${s + 2}.00\\,\\mathrm{g\\,mol^{-1}}}\n$$`, '');
  out.push('```python', `mass, molar_mass = ${s + 10}.0, ${s + 2}.00`, 'print(mass / molar_mass)', '```', '');
  out.push(`::: spoil Answers for set ${s}`);
  for (let p = 1; p <= 8; p++) out.push(`- ${s}.${p}: ${(((s * 37 + p * 11) % 90) + 10) / (s + 2)} mol (unrounded)`);
  out.push(':::', '');
}
out.push('## A very long line', '');
const words = [];
for (let i = 0; i < 3000; i++) words.push(elements[i % 10] + i);
out.push(words.join(' '), '');
out.push('*End of the large document.*', '');
writeFileSync(process.argv[2], out.join('\n'));
```
