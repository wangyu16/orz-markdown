/** Exit statuses: 0 done, 1 refused or failed, 2 usage error. */
export declare const EXIT_OK = 0;
export declare const EXIT_FAILED = 1;
export declare const EXIT_USAGE = 2;
/**
 * Why a command failed: a stable code for scripts and agents (`reason` in the
 * `--json` failure object).
 */
export type Reason = 'bad-usage' | 'no-such-file' | 'unreadable' | 'not-utf8' | 'write-failed' | 'exists' | 'not-orz' | 'twin-differs' | 'output-differs' | 'replaces-mismatch' | 'legacy-file' | 'newer-shell' | 'newer-format' | 'unclosed-island' | 'other-kind' | 'assembled-input' | 'invalid-text' | 'engine-unavailable' | 'failed';
/** Every reason code, in the order above. */
export declare const REASONS: readonly Reason[];
/** The command that resolves a refusal: `<tool> <command> <args…>` — runnable verbatim, never with `--force`. */
export interface Next {
    command: string;
    args: string[];
}
/** An expected failure: printed as a message (or `{ ok: false, reason, next }` with --json), never as a stack. */
export declare class CliError extends Error {
    readonly code: number;
    readonly reason: Reason;
    readonly next?: Next;
    constructor(message: string, codeOrReason?: number | Reason, next?: Next);
}
/** A risk of losing work: why an output must not be replaced (without --force). */
export interface Risk {
    message: string;
    reason: Reason;
    next?: Next;
}
/** The output channel of one command. */
export interface Io {
    json: boolean;
    /** Human lines (stdout; silent with --json). */
    say(line: string): void;
    /** Warnings (stderr as `<tool>: warning: …`; with --json they go into the result instead). */
    warn(line: string): void;
    /** Every warning so far. */
    warned: string[];
}
/** The output channel of `tool` (`--json`: one object on stdout, see {@link emit}). */
export declare function cliIo(tool: string, json: boolean): Io;
/** With --json, print the result: `{ ok: true, …result, warnings }`. */
export declare function emit(o: Io, result: Record<string, unknown>): void;
/**
 * Report a failure and return its exit status: with --json one object
 * `{ ok: false, command, error, reason, next?, exitCode }` on stdout, else
 * `<tool> <command>: <message>` on stderr (and the help hint for a usage error).
 */
export declare function reportFailure(tool: string, command: string, e: unknown, json: boolean): number;
/** A word of a command line, quoted for a POSIX shell when needed. */
export declare const sh: (word: string) => string;
/** `<tool> <command> <args…>` for a message (the same words as the `next` object). */
export declare const commandLine: (tool: string, n: Next) => string;
/** The SHA-256 a `--replaces` token must be: 64 hex digits. */
export declare const SHA256_PATTERN: RegExp;
/** A `--replaces` token, checked: lowercased, or null when not given; anything else is a usage error. */
export declare function replacesToken(value: string | undefined): string | null;
/** The user's own `assemble` options a suggested re-run repeats. */
export interface AssembleCall {
    /** `-o` as typed. */
    out?: string;
    /** `--cdn` or `--inline` as typed. */
    delivery?: 'cdn' | 'inline';
    resolveIncludes?: boolean;
    noIncludes?: boolean;
}
/** The arguments of the user's own `assemble` (output, delivery, includes) for a suggested re-run, plus `extra`. */
export declare function assembleArgs(call: AssembleCall, file: string, extra?: string[]): string[];
//# sourceMappingURL=cli.d.ts.map