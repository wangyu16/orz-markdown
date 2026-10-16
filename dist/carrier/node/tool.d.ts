/**
 * `carrierNode(tool)` — a carrier CLI's overwrite rules, bound to one tool
 * (spec/carrier-node.md §3, §6): its name (messages and `next` lines), its
 * kind, its text twin's suffix, its cache folder, its legacy reader. The
 * rules are the same in every carrier (lifted from orz-mdhtml 1.0's
 * src/cli.ts, which orz-paged copied); each CLI keeps only its commands'
 * wording and extras.
 */
import { type Kind } from '../document.js';
import { type EarlierState, type LegacyTextReader } from '../inspect.js';
import { type AssembleCall, type Io, type Next, type Reason, type Risk } from './cli.js';
import { type KnownState, type Remembered } from './known-states.js';
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
export interface Check {
    risk: Risk | null;
    earlier: KnownState | null;
}
/** What `assemble` checks an existing output against. */
export interface AssembleTarget {
    /** The text twin (absolute path). */
    input: string;
    /** The existing output (absolute path). */
    out: string;
    /** The text being assembled. */
    text: string;
    /** The names messages use (as typed), and whether `out` is the input's own twin (git relaxes only the twin). */
    names: {
        input: string;
        out: string;
        twin: boolean;
    };
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
    names: {
        out: string;
        file: string;
    };
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
    advice(hash: string): {
        message: string;
        next?: Next;
    };
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
    rememberPair(twin: string, file: string, held: string, twinText: string, o: Pick<Io, 'warn'>, token: {
        command: string;
        sha: string;
    }): Remembered;
    earlierStateOf(twin: string, file: string, held: string, options?: {
        git?: boolean;
    }): EarlierState | null;
    twinStateOf(twin: string, file: string, current: string, options?: {
        git?: boolean;
    }): EarlierState | null;
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
/** Bind the shared CLI rules to one carrier tool. */
export declare function carrierNode(spec: CarrierTool): CarrierNode;
//# sourceMappingURL=tool.d.ts.map