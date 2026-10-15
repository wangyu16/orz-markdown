/**
 * The shared vocabulary of a carrier's CLI (FC-10; spec/carrier-node.md §2):
 * exit statuses, the reason codes of a refusal, the `next` command that
 * resolves one, the error a command throws, and the output channel (human
 * lines, or one JSON object for agents).
 */
import { proc } from './builtins.js';

/** Exit statuses: 0 done, 1 refused or failed, 2 usage error. */
export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;

/**
 * Why a command failed: a stable code for scripts and agents (`reason` in the
 * `--json` failure object).
 */
export type Reason =
  | 'bad-usage'          // exit 2: an unknown option, a missing argument, options that exclude each other
  | 'no-such-file'       // the input does not exist
  | 'unreadable'         // the input is a folder or cannot be read
  | 'not-utf8'           // the input is not valid UTF-8
  | 'write-failed'       // an output (or its <file>~ copy) could not be written; nothing was replaced
  | 'exists'             // new: the file exists
  | 'not-orz'            // the output exists and is not an orz file; or the input holds no orz document
  | 'twin-differs'       // the twin holds a different text that is not a known state
  | 'output-differs'     // an -o output holds another text, or any output holds another document (another uid)
  | 'replaces-mismatch'  // --replaces: the existing file's text is not the one whose SHA-256 was given
  | 'legacy-file'        // a 0.x file where a format-1 file is needed
  | 'newer-shell'        // the existing file was made by a newer version of the tool
  | 'newer-format'       // the text's format is newer than this tool writes
  | 'unclosed-island'    // upgrade: the file was cut off inside its text
  | 'other-kind'         // another kind's document: use its own tool
  | 'assembled-input'    // assemble was given an assembled file, not a text
  | 'invalid-text'       // the text cannot be assembled (NUL, a lone surrogate, …)
  | 'engine-unavailable' // the inline engine is missing or stale
  | 'no-browser'         // a command that renders in an installed browser found none (2.4.0: orz-slides `inspect --layout`)
  | 'failed';            // anything else

/** Every reason code, in the order above. */
export const REASONS: readonly Reason[] = Object.freeze(['bad-usage', 'no-such-file', 'unreadable', 'not-utf8', 'write-failed', 'exists', 'not-orz', 'twin-differs', 'output-differs', 'replaces-mismatch', 'legacy-file', 'newer-shell', 'newer-format', 'unclosed-island', 'other-kind', 'assembled-input', 'invalid-text', 'engine-unavailable', 'no-browser', 'failed'] as Reason[]);

/** The command that resolves a refusal: `<tool> <command> <args…>` — runnable verbatim, never with `--force`. */
export interface Next { command: string; args: string[] }

/** An expected failure: printed as a message (or `{ ok: false, reason, next }` with --json), never as a stack. */
export class CliError extends Error {
  readonly code: number;
  readonly reason: Reason;
  readonly next?: Next;
  constructor(message: string, codeOrReason: number | Reason = EXIT_FAILED, next?: Next) {
    super(message);
    this.code = typeof codeOrReason === 'number' ? codeOrReason : EXIT_FAILED;
    this.reason = typeof codeOrReason === 'string' ? codeOrReason : this.code === EXIT_USAGE ? 'bad-usage' : 'failed';
    if (next) this.next = next;
  }
}

/** A risk of losing work: why an output must not be replaced (without --force). */
export interface Risk { message: string; reason: Reason; next?: Next }

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
export function cliIo(tool: string, json: boolean): Io {
  const warned: string[] = [];
  return {
    json,
    warned,
    say(line) { if (!json) proc().stdout.write(`${line}\n`); },
    warn(line) { warned.push(line); if (!json) proc().stderr.write(`${tool}: warning: ${line}\n`); },
  };
}

/** With --json, print the result: `{ ok: true, …result, warnings }`. */
export function emit(o: Io, result: Record<string, unknown>): void {
  if (o.json) proc().stdout.write(`${JSON.stringify({ ok: true, ...result, warnings: o.warned }, null, 2)}\n`);
}

/**
 * Report a failure and return its exit status: with --json one object
 * `{ ok: false, command, error, reason, next?, exitCode }` on stdout, else
 * `<tool> <command>: <message>` on stderr (and the help hint for a usage error).
 */
export function reportFailure(tool: string, command: string, e: unknown, json: boolean): number {
  const err = e instanceof CliError ? e : new CliError(e instanceof Error ? e.message : String(e));
  if (json) proc().stdout.write(`${JSON.stringify({ ok: false, command, error: err.message, reason: err.reason, ...(err.next ? { next: err.next } : {}), exitCode: err.code }, null, 2)}\n`);
  else proc().stderr.write(`${tool} ${command}: ${err.message}\n${err.code === EXIT_USAGE ? `(see ${tool} ${command} --help)\n` : ''}`);
  return err.code;
}

/** A word of a command line, quoted for a POSIX shell when needed. */
export const sh = (word: string): string => (/^[\w./@%+=:,-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`);

/** `<tool> <command> <args…>` for a message (the same words as the `next` object). */
export const commandLine = (tool: string, n: Next): string => `${tool} ${n.command} ${n.args.map(sh).join(' ')}`.trimEnd();

/** The SHA-256 a `--replaces` token must be: 64 hex digits. */
export const SHA256_PATTERN = /^[0-9a-fA-F]{64}$/;

/** A `--replaces` token, checked: lowercased, or null when not given; anything else is a usage error. */
export function replacesToken(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!SHA256_PATTERN.test(value)) throw new CliError(`--replaces takes a SHA-256: 64 hex digits (the "sha256" inspect, extract or assemble print), got ${JSON.stringify(value)}`, EXIT_USAGE);
  return value.toLowerCase();
}

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
export function assembleArgs(call: AssembleCall, file: string, extra: string[] = []): string[] {
  const args = [file];
  if (call.out !== undefined) args.push('-o', call.out);
  if (call.delivery) args.push(`--${call.delivery}`);
  if (call.resolveIncludes && !extra.includes('--resolve-includes')) args.push('--resolve-includes');
  if (call.noIncludes && !extra.includes('--resolve-includes')) args.push('--no-includes'); // they exclude each other
  return [...args, ...extra];
}
