/**
 * `carrierNode(tool)` — a carrier CLI's overwrite rules, bound to one tool
 * (spec/carrier-node.md §3, §6): its name (messages and `next` lines), its
 * kind, its text twin's suffix, its cache folder, its legacy reader. The
 * rules are the same in every carrier (lifted from orz-mdhtml 1.0's
 * src/cli.ts, which orz-paged copied); each CLI keeps only its commands'
 * wording and extras.
 */
import { readDocument, twinName, type Kind } from '../document.js';
import { extract } from '../envelope.js';
import { UID_PATTERN } from '../header.js';
import { looksHtml, scriptElement, storedText as kitStoredText, type EarlierState, type LegacyTextReader } from '../inspect.js';
import { fs, path, proc } from './builtins.js';
import { assembleArgs, cliIo, CliError, commandLine, type AssembleCall, type Io, type Next, type Reason, type Risk } from './cli.js';
import { backup, mtime, readMaybe } from './files.js';
import { cacheDir, cleanInGit, earlierStateOf, isLastWriter, lastWriter, recordPair, sha256, twinStateOf, type KnownState, type Remembered } from './known-states.js';

/** What a carrier's CLI is: everything the shared rules need to know about it. */
export interface CarrierTool {
  /** The command's name, as messages and `next` lines spell it: `orz-paged`. */
  name: string;
  /** The kind it writes. */
  kind: Kind;
  /** The cache folder name under `$XDG_CACHE_HOME` or `~/.cache` (default: `name`). */
  cacheName?: string;
  /** The text twin's suffix (default `.md` for kind md, else `.<kind>.md`): names another copy of a text (`x.browser.paged.md`). */
  textSuffix?: string;
  /** The tool's 0.x reader: the text of a legacy file, or null (default: no legacy files). */
  readLegacy?: LegacyTextReader;
  /** A text as a file stores it (default: the kit's `storedText(text, kind)`). */
  storedText?(text: string): string;
}

/** The result of a guard: the risk (null: may be replaced) and, when replaced as a known state, which. */
export interface Check { risk: Risk | null; earlier: KnownState | null }

/** What `assemble` checks an existing output against. */
export interface AssembleTarget {
  /** The text twin (absolute path). */
  input: string;
  /** The existing output (absolute path). */
  out: string;
  /** The text being assembled. */
  text: string;
  /** The names messages use (as typed), and whether `out` is the input's own twin (git relaxes only the twin). */
  names: { input: string; out: string; twin: boolean };
  /** The `--replaces` token, or null. */
  token: string | null;
  /** The user's own options, repeated by every suggested command. */
  call: AssembleCall;
}

/** What `extract` (and `upgrade`'s text twin) checks an existing text file against. */
export interface TextTarget {
  /** The text file about to be written (absolute path). */
  out: string;
  /** The text about to be written. */
  text: string;
  /** The assembled file the text comes from (absolute path). */
  file: string;
  names: { out: string; file: string };
  token: string | null;
  /** The uid of `text` that may vouch for identity (null: no automatic replacement as a known state). */
  uid: string | null;
  /**
   * (2.4.0) The assembled file's content the text was read from. When its
   * `#orz-src` island is not closed (the file was cut off) the text may be
   * incomplete: an existing different text is then never replaced without
   * --force — no known state and no token vouches for it.
   */
  fileHtml?: string;
  /** The command's own advice for a refusal (given the hash `out` holds, '' when unreadable). */
  advice(hash: string): { message: string; next?: Next };
}

/** The bound rules of one carrier CLI (see {@link carrierNode}). */
export interface CarrierNode {
  readonly tool: Readonly<Required<Omit<CarrierTool, 'readLegacy'>>> & Pick<CarrierTool, 'readLegacy'>;
  /** The output channel (`<tool>: warning: …`). */
  io(json: boolean): Io;
  /** `<tool> <command> <args…>`. */
  commandLine(next: Next): string;
  /** A path for a message or a `next`: as typed, else relative to the working folder when inside it. */
  shown(p: string, typed?: string): string;
  /** A free name for another copy of a text: `x.browser<suffix>`, then `x.browser-2<suffix>`, …, never doubled, never an existing file. */
  otherName(textName: string): string;
  /** (2.4.0) A free name for the text recovered from a cut-off file: `x.recovered<suffix>`, then `x.recovered-2<suffix>`, … */
  recoveredName(name: string): string;
  /** (2.4.0) True when an assembled file's `#orz-src` island is present and not closed (the file was cut off inside its text). */
  cutOff(html: string): boolean;
  /** The text an orz file holds (format 1, else the tool's 0.x reader), or null. */
  documentTextOf(html: string): string | null;
  /** A text's well-formed uid (`UID_PATTERN`), else null. */
  uidOf(text: string): string | null;
  /** The uid-identity gate: both texts carry a well-formed uid, and the same one. */
  sameDocument(a: string, b: string): boolean;
  /** The CLI's cache folder (`$XDG_CACHE_HOME/<cache>`, else `~/.cache/<cache>`), or null. */
  cacheDir(): string | null;
  /** Record a pair; when it cannot be, warn and name the `--replaces` token the next `command` needs. */
  rememberPair(twin: string, file: string, held: string, twinText: string, o: Pick<Io, 'warn'>, token: { command: string; sha: string }): Remembered;
  earlierStateOf(twin: string, file: string, held: string, options?: { git?: boolean }): EarlierState | null;
  twinStateOf(twin: string, file: string, current: string, options?: { git?: boolean }): EarlierState | null;
  lastWriter(file: string): string | null;
  isLastWriter(twin: string, file: string): boolean;
  /** Where a known state was found (the human line after "Wrote …"). */
  readonly earlierSource: Readonly<Record<KnownState, string>>;
  /** `words(otherName)` when `p` is newer than `other` — unless both are clean in git (a checkout's times); else ''. */
  changedAfter(p: string, other: string, words: (otherName: string) => string, otherName: string): string;
  /** May the existing assembled output be replaced by the assembly of the text? (`existing`: its content, null when unreadable.) */
  assembledOutputCheck(t: AssembleTarget, existing: string | null): Check;
  /** May the existing text file be replaced by the file's text? */
  textOutputCheck(t: TextTarget): Check;
  /** Refuse a risk (a {@link CliError} with its reason and next), or with --force keep a copy of what is replaced (its path). */
  guard(p: string, risk: Risk | null, force: boolean, o: Pick<Io, 'warn'>): string | null;
  /** The reason code of a library error's message. */
  libReason(message: string): Reason;
}

/** The kinds' tools, for `other-kind` messages. */
const KIND_TOOLS: Readonly<Record<Kind, string>> = { md: 'orz-mdhtml', slides: 'orz-slides', paged: 'orz-paged' };

/** Bind the shared CLI rules to one carrier tool. */
export function carrierNode(spec: CarrierTool): CarrierNode {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(spec.name)) throw new Error(`orz-markdown/carrier/node: ${JSON.stringify(spec.name)} is not a command name`);
  const tool = {
    name: spec.name,
    kind: spec.kind,
    cacheName: spec.cacheName ?? spec.name,
    textSuffix: spec.textSuffix ?? (spec.kind === 'md' ? '.md' : `.${spec.kind}.md`),
    storedText: spec.storedText ?? ((text: string) => kitStoredText(text, spec.kind)),
    ...(spec.readLegacy ? { readLegacy: spec.readLegacy } : {}),
  };
  const name = tool.name;
  const cache = tool.cacheName;
  const stored = tool.storedText;
  const line = (n: Next): string => commandLine(name, n);
  const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const suffixRe = new RegExp(`${escaped(tool.textSuffix)}$`, 'i');

  const shown = (p: string, typed?: string): string => {
    if (typed !== undefined) return typed;
    const rel = path().relative(proc().cwd(), p);
    return rel && !rel.startsWith('..') && !path().isAbsolute(rel) ? rel : p;
  };
  const realOrSelf = (p: string): string => { try { return fs().realpathSync(p); } catch { return p; } };

  const freeName = (textName: string, tag: string): string => {
    const stem = (suffixRe.test(textName) ? textName.replace(suffixRe, '') : textName.replace(/\.md$/i, '')).replace(new RegExp(`\\.${tag}(?:-\\d+)?$`, 'i'), '');
    for (let i = 1; ; i++) {
      const n = i === 1 ? `${stem}.${tag}${tool.textSuffix}` : `${stem}.${tag}-${i}${tool.textSuffix}`;
      if (path().resolve(n) !== path().resolve(textName) && !fs().existsSync(path().resolve(n))) return n;
    }
  };
  const otherName = (textName: string): string => freeName(textName, 'browser');
  /** From a text's name or an assembled file's name (`x.slides.html` → `x.recovered.slides.md`). */
  const recoveredName = (name: string): string =>
    freeName(/\.html?$/i.test(name) ? twinName(name) ?? name.replace(/\.html?$/i, tool.textSuffix) : name, 'recovered');
  const cutOff = (html: string): boolean => {
    const island = scriptElement(html, 'orz-src');
    return island !== null && island.end === null;
  };

  const legacyText = (html: string): string | null => (tool.readLegacy ? tool.readLegacy(html)?.text ?? null : null);
  const documentTextOf = (html: string): string | null => extract(html)?.text ?? legacyText(html);
  const isLegacy = (html: string): boolean => legacyText(html) !== null;

  const uidOf = (text: string): string | null => {
    try {
      const uid = readDocument(text).meta.uid;
      return typeof uid === 'string' && UID_PATTERN.test(uid.trim()) ? uid.trim() : null;
    } catch {
      return null;
    }
  };

  const earlierSource: Record<KnownState, string> = {
    'git-head': 'its last commit',
    'git-index': 'its staged version',
    'git-log': 'one of its recent commits',
    cache: `the text ${name} last wrote or read for this pair`,
    token: 'the text you named with --replaces',
  };

  const changedAfter = (p: string, other: string, words: (o: string) => string, otherN: string): string => {
    if (!fs().existsSync(p) || !fs().existsSync(other) || !(mtime(p) > mtime(other))) return '';
    if (cleanInGit(p) && cleanInGit(other)) return '';
    return words(otherN);
  };

  const rememberPair: CarrierNode['rememberPair'] = (twin, file, held, twinText, o, token) => {
    const r = recordPair(cache, twin, file, held, twinText);
    if (r !== 'recorded') {
      const where = r === 'no-cache' ? 'no cache folder: set $XDG_CACHE_HOME or HOME' : `cache folder not writable: ${cacheDir(cache) ?? ''}`;
      o.warn(`could not note that the two files match (${where}), so the next ${token.command} cannot tell it may replace the file: add --replaces ${token.sha} to it`);
    }
    return r;
  };

  /**
   * Whether `out` may be replaced by the assembly of `text` (claims T.7,
   * T.11, T.12, T.14 of the carriers): the same text (as stored): yes; with a
   * token: only that hash; a known earlier state (the pair's record; git for
   * the twin): yes; another document (another uid): never, no next; a 0.x
   * file: upgrade --text first; "only the file changed" (the input is a known
   * state and both carry the same uid): extract brings it in; anything else:
   * extract to another name and merge. Every suggested command is built from
   * the user's own arguments.
   */
  const assembledOutputCheck = (t: AssembleTarget, existing: string | null): Check => {
    const { input, out, text, names, token, call } = t;
    const isHtml = existing !== null && looksHtml(existing);
    const held = isHtml ? documentTextOf(existing!) : null;
    if (held === null) {
      if (existing !== null && existing.trim() === '') return { risk: { message: `${names.out} exists and is empty (${fs().statSync(out).size} bytes): a damaged or unfinished file, not an orz file; not replaced (pass --force to replace it — the empty file is kept as ${names.out}~ — or -o another path)`, reason: 'not-orz' }, earlier: null };
      return { risk: { message: `${names.out} exists and is not an orz file; not replaced (pass --force to replace it, or -o another path)`, reason: 'not-orz' }, earlier: null };
    }
    if (held === stored(text)) return { risk: null, earlier: null };
    const legacy = isLegacy(existing!);
    const other = otherName(names.input);
    const heldHash = sha256(held);
    const again = (extra: string[]): string => line({ command: 'assemble', args: assembleArgs(call, names.input, extra) });
    const pull: Next = { command: 'extract', args: [names.out, '-o', other] };
    const legacyPull: Next = { command: 'upgrade', args: [names.out, '--text', other] };
    if (token !== null) {
      if (heldHash === token) return { risk: null, earlier: 'token' };
      return {
        risk: {
          message: `${names.out} no longer holds the text you named with --replaces: it has changed since (saved in the browser, or written by someone else); not replaced. Bring its changes in: \`${line(legacy ? legacyPull : pull)}\`, merge them into ${names.input}, then \`${legacy ? `${again(['--replaces'])} <sha256>\`, with the "sha256" value upgrade printed` : `${again(['--replaces', heldHash])}\``}`,
          reason: 'replaces-mismatch',
          next: legacy ? legacyPull : pull,
        },
        earlier: null,
      };
    }
    const earlier = earlierStateOf(cache, input, out, held, stored, { git: names.twin });
    if (earlier !== null) return { risk: null, earlier };
    // another document (another well-formed uid) — never "bring its text into this input": nothing to merge, no next
    const heldUid = uidOf(held);
    const ownUid = uidOf(text);
    if (heldUid && ownUid && heldUid !== ownUid) {
      return { risk: { message: `${names.out} holds another document (uid ${heldUid}; ${names.input} is ${ownUid}); not replaced. Choose another -o path, or pass --force to replace it (the old file is kept as ${names.out}~)`, reason: 'output-differs' }, earlier: null };
    }
    if (legacy) {
      return {
        risk: {
          message: `${names.out} is an older ${name} 0.x file holding a different text than ${names.input}; not replaced. extract cannot read it: \`${line(legacyPull)}\` writes its text to ${other} (and turns ${names.out} into a file of this version, printing a "sha256" value: the fingerprint of the text it then holds); compare and merge it into ${names.input}, then \`${again(['--replaces'])} <sha256>\` with that value (it replaces ${names.out} only while it still holds that text)`,
          reason: 'legacy-file',
          next: legacyPull,
        },
        earlier: null,
      };
    }
    // (2.4.0, slides confirming round C-H1) a file cut off inside its text holds an INCOMPLETE text, not changes to
    // bring in: never advise an extract over the input (the record or git would wave it through); the input is the
    // complete text, so the repair is this assemble with the token of what the cut file holds
    if (cutOff(existing!)) {
      const recovered = recoveredName(names.out);
      return {
        risk: {
          message: `${names.out} was cut off: its text stops part-way (the file ends before the text does), so it holds an incomplete text, not changes to bring in; not replaced. Keep ${names.input}'s complete text and repair the file from it: \`${again(['--replaces', heldHash])}\` (it replaces ${names.out} only while it still holds that cut text). To look at what the cut file holds first: \`${line({ command: 'extract', args: [names.out, '-o', recovered] })}\``,
          reason: 'unclosed-island',
          next: { command: 'assemble', args: assembleArgs(call, names.input, ['--replaces', heldHash]) },
        },
        earlier: null,
      };
    }
    // only the file changed — and only for the SAME document (the uid-identity gate): neither the record nor git
    // proves that the file was not replaced by another document's file, and following `extract` would then replace
    // the input with that other text
    // Only the pair's own record proves the FILE is the newer side (the input is exactly what was last synced, so
    // the file changed after the sync). git proves only that the input is committed: the file beside it may be newer
    // (a browser save) or older (built from a text never committed — a fresh clone, a shallow clone, another
    // machine), so that case gets the safe pull below, never a plain extract over the committed text (CLI-1).
    const sameDocument = heldUid !== null && heldUid === ownUid;
    const twinState = twinStateOf(cache, input, out, text, { git: names.twin });
    const unchanged = twinState !== null;
    if (sameDocument && twinState === 'cache') {
      const bring: Next = { command: 'extract', args: [names.out, ...(twinName(out) === input ? [] : ['-o', names.input])] };
      return {
        risk: {
          message: `${names.out} holds a different text than ${names.input}, and ${names.input} is unchanged since ${name} last synced the pair: the file holds newer work (saved in the browser?); not replaced. \`${line(bring)}\` brings it into ${names.input} (no --force needed). To put ${names.input}'s text in the file anyway: \`${again(['--replaces', heldHash])}\``,
          reason: names.twin ? 'twin-differs' : 'output-differs',
          next: bring,
        },
        earlier: null,
      };
    }
    if (unchanged && sameDocument) {
      return {
        risk: {
          message: `${names.out} holds a different text than ${names.input}. ${names.input} is committed and unchanged, but the file holds none of its recent commits and ${name} has no record of syncing this pair here (a fresh clone or another machine?), so it cannot be told which is newer: the file may hold work saved in the browser, or an older build; not replaced. Bring its text out and compare: \`${line(pull)}\`; merge what belongs into ${names.input}, then \`${again(['--replaces', heldHash])}\` (it replaces ${names.out} only while it still holds that text). When ${names.input} has everything, run again with --force (the old file is kept as ${names.out}~)`,
          reason: names.twin ? 'twin-differs' : 'output-differs',
          next: pull,
        },
        earlier: null,
      };
    }
    if (unchanged) {
      return {
        risk: {
          message: `${names.out} holds a different text than ${names.input}. ${names.input} is unchanged since ${name} last synced the pair (or is committed), so the file may hold newer work (saved in the browser?) — or another document's text (copied over it): the two texts do not carry the same uid, so it cannot be told; not replaced. Bring its text out and compare: \`${line(pull)}\`; merge what belongs into ${names.input}, then \`${again(['--replaces', heldHash])}\` (it replaces ${names.out} only while it still holds that text)`,
          reason: names.twin ? 'twin-differs' : 'output-differs',
          next: pull,
        },
        earlier: null,
      };
    }
    const writer = lastWriter(cache, out);
    const later = writer !== null && writer !== realOrSelf(input)
      ? ` (${name} last synced it with ${shown(writer)})`
      : changedAfter(out, input, () => ' and was changed after it (saved in the browser?)', names.input);
    if (!names.twin) {
      return {
        risk: {
          message: `${names.out} holds another text than ${names.input}${later} — not the text ${name} last wrote there from ${names.input}; not replaced. If it has changes ${names.input} lacks, bring them in first: \`${line(pull)}\`, then merge, then \`${again(['--replaces', heldHash])}\` (it replaces ${names.out} only while it still holds that text). When ${names.input} has everything, run again with --force (the old file is kept as ${names.out}~)`,
          reason: 'output-differs',
          next: pull,
        },
        earlier: null,
      };
    }
    return {
      risk: {
        message: `${names.out} holds a different text than ${names.input}${later} — not its last commit, nor the text ${name} last wrote there; not replaced. If it has changes ${names.input} lacks, bring them in first: \`${line(pull)}\`, then merge, then \`${again(['--replaces', heldHash])}\` (it replaces ${names.out} only while it still holds that text). When ${names.input} has everything, run again with --force (the old file is kept as ${names.out}~)`,
        reason: 'twin-differs',
        next: pull,
      },
      earlier: null,
    };
  };

  /**
   * Whether the text file `out` may be replaced by `text` (the text of
   * `file`): it does not exist or holds exactly that text; never (without
   * --force) when it holds another document; with a token only that hash; a
   * known state of the pair only for the same document (the uid-identity
   * gate: `uid` non-null and equal to `out`'s); anything else may hold edits
   * the file lacks.
   */
  const textOutputCheck = (t: TextTarget): Check => {
    const { out, text, file, names, token, uid, advice } = t;
    if (!fs().existsSync(out)) return { risk: null, earlier: null };
    const existing = readMaybe(out);
    if (existing === text) return { risk: null, earlier: null };
    const h = existing === null ? null : sha256(existing);
    const existingUid = existing === null ? null : uidOf(existing);
    if (uid !== null && existingUid !== null && uid !== existingUid) {
      return { risk: { message: `${names.out} holds another document (uid ${existingUid}; ${names.file} is ${uid}); not overwritten. Write it to another path (-o), or pass --force to replace it (the old text is kept as ${names.out}~)`, reason: 'output-differs' }, earlier: null };
    }
    // (2.4.0, C-H1) the text of a cut-off file may be incomplete: no record, commit or token vouches for replacing
    // another text with it
    if (t.fileHtml !== undefined && cutOff(t.fileHtml)) {
      const recovered = recoveredName(names.file);
      return {
        risk: {
          message: `${names.file} was cut off: its text stops part-way (the file ends before the text does), so the text it holds may be incomplete; ${names.out} not overwritten. Write what it holds to another name and compare: \`${line({ command: 'extract', args: [names.file, '-o', recovered] })}\`; --force replaces ${names.out} anyway (the old text is kept as ${names.out}~)`,
          reason: 'unclosed-island',
          next: { command: 'extract', args: [names.file, '-o', recovered] },
        },
        earlier: null,
      };
    }
    if (token !== null) {
      if (h === token) return { risk: null, earlier: 'token' };
      const a = advice(h ?? '');
      return { risk: { message: `${names.out} no longer holds the text you named with --replaces${h ? ': it has changed since' : ''}; not overwritten. ${a.message}`, reason: 'replaces-mismatch', ...(a.next ? { next: a.next } : {}) }, earlier: null };
    }
    const git = twinName(file) === out;
    const known = existing === null ? null : twinStateOf(cache, out, file, existing, { git });
    if (known !== null && uid !== null && existingUid === uid) {
      // (2.4.0, C-L1) …unless the FILE holds a known earlier state of the pair (the text the CLI last synced it
      // with, or one of the twin's commits): then the file is the older side and the twin's text the newer one
      const older = stored(existing!) === text ? null : earlierStateOf(cache, out, file, text, stored, { git });
      if (older === null) return { risk: null, earlier: known };
      const bring: Next = { command: 'assemble', args: [names.out, ...(git ? [] : ['-o', names.file])] };
      return {
        risk: {
          message: `${names.file} holds an earlier text of ${names.out} (${earlierSource[older]}), and ${names.out} has changed since: the text is the newer side; not overwritten. \`${line(bring)}\` brings ${names.file} up to date; --force replaces ${names.out} with the older text anyway (the old text is kept as ${names.out}~)`,
          reason: 'twin-differs',
          next: bring,
        },
        earlier: null,
      };
    }
    const later = changedAfter(out, file, (n) => `, changed after ${n}`, names.file);
    const a = advice(h ?? '');
    if (known !== null) {
      return { risk: { message: `${names.out} exists and holds a different text; it is unchanged since ${name} last synced it (or is committed), but ${names.file} and ${names.out} do not carry the same uid, so ${names.file} may hold another document's text (copied over it); not overwritten. ${a.message}`, reason: 'twin-differs', ...(a.next ? { next: a.next } : {}) }, earlier: null };
    }
    return { risk: { message: `${names.out} exists and holds a different text${later} — not the text ${name} last wrote or read for this pair, nor a committed version; not overwritten (it may hold edits ${names.file} lacks). ${a.message}`, reason: 'twin-differs', ...(a.next ? { next: a.next } : {}) }, earlier: null };
  };

  const guard = (p: string, risk: Risk | null, force: boolean, o: Pick<Io, 'warn'>): string | null => {
    if (risk === null) return null;
    if (!force) throw new CliError(risk.message, risk.reason, risk.next);
    return backup(p, o);
  };

  const others = (Object.keys(KIND_TOOLS) as Kind[]).filter((k) => KIND_TOOLS[k] !== name).map((k) => escaped(KIND_TOOLS[k])).join('|');
  const libReason = (message: string): Reason => {
    if (/engine/i.test(message) && /npm run bundle|missing|cannot be used/.test(message)) return 'engine-unavailable';
    if (/is newer than this tool \(|would downgrade/.test(message)) return 'newer-shell';
    if (/text format \d+ is newer|format.*above|newer format/i.test(message)) return 'newer-format';
    if (new RegExp(`not an ${escaped(name)} file|not an orz`).test(message)) return 'not-orz';
    if (others && new RegExp(`an (?:${others}) file`).test(message)) return 'other-kind';
    return 'invalid-text';
  };

  return {
    tool,
    io: (json) => cliIo(name, json),
    commandLine: line,
    shown,
    otherName,
    recoveredName,
    cutOff,
    documentTextOf,
    uidOf,
    sameDocument: (a, b) => { const u = uidOf(a); return u !== null && u === uidOf(b); },
    cacheDir: () => cacheDir(cache),
    rememberPair,
    earlierStateOf: (twin, file, held, options) => earlierStateOf(cache, twin, file, held, stored, options),
    twinStateOf: (twin, file, current, options) => twinStateOf(cache, twin, file, current, options),
    lastWriter: (file) => lastWriter(cache, file),
    isLastWriter: (twin, file) => isLastWriter(cache, twin, file),
    earlierSource,
    changedAfter,
    assembledOutputCheck,
    textOutputCheck,
    guard,
    libReason,
  };
}
