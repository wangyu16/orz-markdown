# Carrier CLI core (`orz-markdown/carrier/node`, 2.3.0)

The Node-only core every carrier's CLI shares (FC-10): the rules that decide
whether `assemble`, `extract` and `upgrade` may replace a file that could hold
other work, and the vocabulary they refuse in. Lifted from orz-mdhtml 1.0's
`src/{known-states,includes,cli}.ts`, which orz-paged 1.0 copied (REBUILD §3b
KIT GAP). Each carrier keeps its commands, their wording and extras (help
texts, templates, its 0.x forms); the rules below are the same in every
carrier. Implementation note, binding for the carriers that adopt it; claims
N.1–N.11, tests `tests/carrier-node.test.ts` (through a reference CLI built
only from this API, `tests/helpers/node-cli.ts`).

## 1. Boundary

- Node ≥ 20.16 only. Node built-ins are reached through
  `process.getBuiltinModule` — never a static `import 'node:…'` — and no
  other entry of the package imports this one, so no browser bundle holds it
  (N.1). Every function reaches Node when called, not at load.
- It may import the kit core (`carrier/document`, `envelope`, `header`,
  `inspect`, `text`, the kit parser for include directives).

## 2. Vocabulary

- Exit statuses `EXIT_OK` 0 (done), `EXIT_FAILED` 1 (refused or failed),
  `EXIT_USAGE` 2 (usage).
- `Reason` — the stable reason codes (`REASONS`): `bad-usage`,
  `no-such-file`, `unreadable`, `not-utf8`, `write-failed`, `exists`,
  `not-orz`, `twin-differs`, `output-differs`, `replaces-mismatch`,
  `legacy-file`, `newer-shell`, `newer-format`, `unclosed-island`,
  `other-kind`, `assembled-input`, `invalid-text`, `engine-unavailable`,
  `no-browser` (2.4.0: a command that renders in an installed browser — orz-slides
  `inspect --layout` — found none), `failed`. New codes may be added; none is
  renamed.
- `Next` `{ command, args }` — the command that resolves a refusal,
  runnable verbatim as `<tool> <command> <args…>` (`commandLine`, words
  quoted by `sh`), built from the user's own arguments (`assembleArgs`) and
  free names (`otherName`). **A `next` never contains `--force`**, and
  following every `next` verbatim never loses a text (N.8).
- `CliError(message, code | reason, next?)`; `reportFailure(tool, command,
  error, json)` prints `{ ok: false, command, error, reason, next?, exitCode }`
  (with `--json`) or `<tool> <command>: <message>`; `cliIo(tool, json)` /
  `emit(io, result)` the output channel (`{ ok: true, …, warnings }`).
- `replacesToken(value)` — a `--replaces` token: 64 hex digits, lowercased;
  anything else is a usage error.

## 3. Known states

A text that would be replaced counts as a KNOWN STATE — replaced without
`--force` — only when it is provably one of:

1. **the CLI's record** of the pair (twin ↔ file; real paths, symbolic links
   resolved) under `$XDG_CACHE_HOME/<cache>/` (an absolute `XDG_CACHE_HOME`
   only), else `~/.cache/<cache>/`: the SHA-256 of the text the CLI last wrote
   into the file or read out of it, and of the twin's exact text then; and per
   file its **last writer** (the twin whose pair last synced it). A twin's own
   states count only while its pair is the file's last writer (or none is
   recorded). A cache that exists but is not writable is not read at all;
   an unrecorded pair warns and names the `--replaces` token the next command
   needs (`rememberPair`).
2. **git** (the twin's own file only, never an `-o` output): the twin's
   `HEAD` version, its staged version, or one of its `GIT_LOG_LIMIT` (20)
   most recent commits, within `GIT_BUDGET_MS` (8 s) for all of git's runs;
   any failure means unknown. A text equal to one of them counts, so a
   deliberate revert to it is replaced (commit the revert first).
3. **the caller's token**: `--replaces <sha256>` of the exact text; with a
   token nothing else counts.

Comparisons are exact: a file's text against the twin as a file stores it
(`storedText`: mixed line endings in one style); a twin's text raw (a
line-ending change is a change). Nothing is trimmed or normalised before a
compare (white space is a difference), a token is compared in full (all 64
digits), git's versions are compared in their stored form against a file's
text, and git counts for a twin only while no other input last wrote its file
(N.10).

**The uid-identity gate.** Neither git nor the record proves that a file holds
the SAME DOCUMENT as the twin — another document's file may have been copied
over it. A twin is replaced as a known state, and a refusal says "only the
file changed" (next: a plain `extract`), only when both texts carry a
well-formed uid and the same one (`sameDocument`). A different uid on both
sides is `output-differs` with no `next`.

**Only the record proves the file newer** (2.4.0, N.11). "Only the file
changed" (a plain `extract` into the twin) needs the pair's own record: the
twin is exactly the text the CLI last synced, so the file changed after the
sync. git proves only that the twin is committed: the file beside it may be
newer (a browser save) or older (built from a text never committed — a fresh
clone, a shallow clone, another machine, CI), so a twin known only through git
gets the safe pull (`extract <file> -o <other name>`, merge, `--replaces`).
A plain `extract` never replaces a committed text with a file whose age
nothing proved.

## 4. Files

- `readText(path)` — exact UTF-8 (BOM kept), refusing invalid UTF-8.
- `writeOut(path, data)` — a temporary file beside the target, then a rename;
  an existing file keeps its mode (set after the write, so the umask does not
  narrow it; N.10), a symbolic link stays a link (its target
  is replaced), missing parent folders are created; failure: `write-failed`,
  nothing replaced.
- `backup(path, io)` — before a `--force` replacement: `<file>~`, else the
  first free `<file>~1`, `~2`, … (never overwritten; a symbolic link or a
  folder at a backup name is never followed or written through: `lstat`,
  then an exclusive copy); a backup holding exactly these bytes is reused.

## 5. Includes

`includeTargets(text, directives?)` lists a text's include directives as the
renderer finds them (the kit's parser: not in code or other bodies;
directives default to the kit's `md`, `markdown`, `md-include`). Since 2.5.0
it lives in the browser-safe `orz-markdown/carrier` (with `linkTargets`); this
entry re-exports the same function.
`resolveFileIncludes(text, folder)` reads file includes from the twin's folder
only (a target leaving it, after symbolic links, is `outside-folder`).
`includePlan(text, { folder, held, keep, resolve, outName, resolveCommand })`
is `assemble`'s decision: keep the existing record's entries the text still
uses (`keep: false` = `--no-includes`), re-read file includes with `resolve`
(`--resolve-includes`; URL entries kept), else name each recorded file
include whose file has changed (`stale-record`); every directive left
unresolved is listed with its reason (`not-recorded`, `url`,
`no-such-file`, `outside-folder`, `unreadable`, `not-utf8`,
`folder-unreadable`) and warned about once.

## 6. The guards — `carrierNode(tool)`

`carrierNode({ name, kind, cacheName?, textSuffix?, readLegacy?, storedText? })`
binds the rules to one tool: its name (messages, `next` lines, the warning
prefix), its kind, its cache folder (default `name`), its text twin's suffix
(default `.md` for md, `.<kind>.md` otherwise), its 0.x reader.

- `assembledOutputCheck({ input, out, text, names, token, call }, existing)`:
  the same text as stored → replace; a token → only that hash
  (`replaces-mismatch` otherwise); a known earlier state (§3) → replace
  (`earlier`); another document → `output-differs`, no next; a 0.x file →
  `legacy-file`, next `upgrade <out> --text <free name>`; the twin unchanged
  and the same uid → `twin-differs`/`output-differs`, next a plain `extract`;
  otherwise next `extract <out> -o <free name>` and the re-run with
  `--replaces <the hash it holds>`. Not an orz file, or empty → `not-orz`.
  (2.4.0) A file cut off inside its text (`#orz-src` not closed) →
  `unclosed-island`, next `assemble <input> --replaces <the hash it holds>`
  (checked after the token, the known states, another document and a 0.x
  file): it holds an incomplete text, never newer work.
- `textOutputCheck({ out, text, file, names, token, uid, advice })`: absent
  or the same text → write; another document → `output-differs`; a token →
  only that hash; a known state of the pair AND the same uid → replace —
  unless (2.4.0) the text being written is itself a known earlier state of
  the pair (the record, or a commit of the twin) and differs from the twin:
  then the twin is the newer side → `twin-differs`, next `assemble <twin>`;
  otherwise `twin-differs` with the command's own `advice`. (2.4.0) With
  `fileHtml` (the file the text was read from) cut off inside its text, an
  existing different text is never replaced without `--force` (no state or
  token vouches for it): `unclosed-island`, next `extract <file> -o
  <recoveredName>`.
- `guard(path, risk, force, io)` refuses (a `CliError` with the risk's reason
  and next) or, with `--force`, keeps a backup first.
- Also bound: `shown`, `otherName`, `recoveredName` and `cutOff` (2.4.0), `commandLine`, `documentTextOf`, `uidOf`,
  `sameDocument`, `cacheDir`, `rememberPair`, `earlierStateOf`,
  `twinStateOf`, `lastWriter`, `isLastWriter`, `earlierSource`,
  `changedAfter`, `libReason`.
