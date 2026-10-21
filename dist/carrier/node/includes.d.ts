/**
 * The include directives of a text and their record, for a carrier's CLI
 * (FC-18 §8.3; spec/carrier-node.md §5; lifted from orz-mdhtml 1.0's
 * src/includes.ts). A file shows an include only from its `#orz-includes`
 * record: a page reads no local files and, standalone, fetches no URLs. So
 * the CLI lists a text's include directives exactly as the renderer finds
 * them (the kit's parser: not in code, comments or other directives' bodies),
 * resolves FILE includes from the text's folder (refusing a path that leaves
 * it, symbolic links followed — the renderer's `markdownIncludeRoot` rule),
 * keeps the record's entries the text still uses, and names what stays
 * unresolved. One level, as the renderer.
 */
import { includeTargets } from '../targets.js';
/** A URL target (`scheme://…`): never read by the CLI. */
export declare const isUrl: (t: string) => boolean;
export { includeTargets };
/** The entries of `record` the text still includes (a removed directive's entry is dropped). */
export declare function keepReferenced(text: string, record: Readonly<Record<string, string>>, directives?: readonly string[]): Record<string, string>;
/** The include targets of the text the record does not answer. */
export declare function unresolvedIncludes(text: string, record: Readonly<Record<string, string>>, directives?: readonly string[]): string[];
/** Why a file include was not read. */
export type IncludeProblem = 'no-such-file' | 'outside-folder' | 'unreadable' | 'not-utf8';
/** What {@link resolveFileIncludes} read. */
export interface ResolvedIncludes {
    /** Target as written → the file's exact text. */
    includes: Record<string, string>;
    problems: Array<{
        target: string;
        reason: IncludeProblem;
        message: string;
    }>;
    /** The folder itself cannot be read (nothing resolved), else null. */
    folderProblem: string | null;
}
/**
 * Read the text's file includes from `folder` (the text twin's folder): each
 * target as written → the file's exact text (UTF-8). A target outside the
 * folder (after symbolic links), missing, unreadable or not UTF-8 is not
 * resolved (`problems`). URL targets are left alone.
 */
export declare function resolveFileIncludes(text: string, folder: string, directives?: readonly string[]): ResolvedIncludes;
/** One include directive the written file does not resolve (assemble's `--json` `unresolved`). */
export interface Unresolved {
    target: string;
    kind: 'file' | 'url';
    /**
     * `not-recorded` (a file include not in the record; `--resolve-includes`
     * would read it), `url` (the CLI fetches no URLs), or why it cannot be read
     * from the text's folder: `no-such-file`, `outside-folder`, `unreadable`,
     * `not-utf8`, `folder-unreadable`.
     */
    reason: 'not-recorded' | 'url' | IncludeProblem | 'folder-unreadable';
}
/** A recorded file include older than the file in the text's folder (assemble's `--json` `stale`). */
export interface Stale {
    target: string;
    kind: 'file';
    reason: 'stale-record';
}
/** What {@link includePlan} decides. */
export interface IncludePlan {
    /** The record the new file carries. */
    includes: Record<string, string>;
    /** How many file includes were read from the folder (`--resolve-includes`). */
    resolved: number;
    unresolved: Unresolved[];
    stale: Stale[];
    /** One sentence per unresolved or stale directive (the CLI's warnings). */
    warnings: string[];
}
/**
 * `assemble`'s includes (FC-18 §8.3): keep the entries of the existing
 * file's record the text still uses (`held`; none with `keep: false`, i.e.
 * `--no-includes`); with `resolve` (`--resolve-includes`) read every file
 * include afresh from `folder` (URL entries kept); without it, name each
 * recorded file include whose file has changed since (`stale`). Every
 * directive left unresolved is listed with its reason and one warning.
 * `outName` names the existing file; `resolveCommand` is the command line
 * that re-runs the user's assemble with `--resolve-includes` (for hints).
 */
export declare function includePlan(text: string, o: {
    folder: string;
    held: Readonly<Record<string, string>> | null;
    keep: boolean;
    resolve: boolean;
    outName: string;
    resolveCommand: string;
    directives?: readonly string[];
}): IncludePlan;
//# sourceMappingURL=includes.d.ts.map