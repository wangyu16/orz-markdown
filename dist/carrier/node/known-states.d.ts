import type { EarlierState } from '../inspect.js';
import { type Env } from './builtins.js';
/** How many recent commits of the twin are read. */
export declare const GIT_LOG_LIMIT = 20;
/** The time budget of all git runs for one question (ms). */
export declare const GIT_BUDGET_MS = 8000;
/** Why a text counts as a known state: an {@link EarlierState} or `token` (the caller's `--replaces` hash matched). */
export type KnownState = EarlierState | 'token';
/** The SHA-256 (lowercase hex) of a text's UTF-8 bytes — the records' and `--replaces`' hash (equal to the kit's isomorphic `sha256`). */
export declare const sha256: (s: string) => string;
/** A path as the records key it: its real path when it exists (a symbolic link counts as its target). */
export declare function canonical(p: string): string;
/** The CLI's cache folder: `$XDG_CACHE_HOME/<cache>` (an absolute XDG path only), else `~/.cache/<cache>`; null without a home. */
export declare function cacheDir(cache: string, env?: Env): string | null;
/** Whether a pair was recorded: `recorded`, `no-cache` (no `$XDG_CACHE_HOME`, no home), or `failed` (the cache is not writable). */
export type Remembered = 'recorded' | 'no-cache' | 'failed';
/**
 * Record that `file` holds `held` (the text the CLI just wrote into it or read
 * out of it) and that the twin holds exactly `twinText` (raw, line endings as
 * written), and that this pair is the file's last writer. Call after both are
 * written. Never throws.
 */
export declare function recordPair(cache: string, twin: string, file: string, held: string, twinText: string): Remembered;
/** The path of the text the CLI last synced `file` with, or null when none is recorded or readable. */
export declare function lastWriter(cache: string, file: string): string | null;
/** True when the pair `twin` ↔ `file` is the file's last writer. */
export declare function isLastWriter(cache: string, twin: string, file: string): boolean;
/**
 * Whether `held` — the text an existing file holds — is a known earlier state
 * of the twin: the pair's record (`cache`), or with `git` (default; pass
 * `false` for an `-o` output that is not the twin's own file) a committed,
 * staged or recent version of the twin. `stored` maps a twin text to the text
 * a file assembled from it holds, so a committed text compares like a file's.
 */
export declare function earlierStateOf(cache: string, twin: string, file: string, held: string, stored: (text: string) => string, options?: {
    git?: boolean;
}): EarlierState | null;
/**
 * Whether the twin's current text `current` is a known state of the pair —
 * exactly (raw: a line-ending change is a change) the text the CLI last wrote
 * or read for the pair while this pair is the file's last writer, or, with
 * `git` (the twin's own file only), a committed, staged or recent version
 * while no other twin is the file's last writer. A known state says only
 * that the TWIN is unchanged, never that the file holds the same document.
 */
export declare function twinStateOf(cache: string, twin: string, file: string, current: string, options?: {
    git?: boolean;
}): EarlierState | null;
/** True when `p` is tracked in git and unmodified (its modification time is then a checkout's). False on any failure. */
export declare function cleanInGit(p: string): boolean;
//# sourceMappingURL=known-states.d.ts.map