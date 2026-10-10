import { type Io } from './cli.js';
/** Read a file as text exactly (UTF-8, BOM kept, invalid UTF-8 refused: `no-such-file`, `unreadable`, `not-utf8`). */
export declare function readText(p: string): string;
/** An existing file as text, or null when it cannot be read as UTF-8. */
export declare function readMaybe(p: string): string | null;
/**
 * Write a file atomically (a temporary file next to it, then a rename), so a
 * failure never leaves half a file. An existing file keeps its mode, and a
 * symbolic link stays a link: the file it points to is replaced. Missing
 * parent folders are created. Failure: `write-failed`, nothing replaced.
 */
export declare function writeOut(p: string, data: string): void;
/**
 * Keep a copy of a file about to be replaced with --force: `<file>~` — or,
 * when that name holds something else (an earlier backup with other bytes, a
 * symbolic link, a folder), the first free `<file>~1`, `<file>~2`, … An
 * existing backup is never overwritten, and a symbolic link at a backup name
 * is never followed or written through (`lstat`, then an exclusive create). A
 * backup that already holds exactly these bytes is reused. Says so on `o`;
 * returns the backup's path. Failure: `write-failed`, nothing written.
 */
export declare function backup(p: string, o: Pick<Io, 'warn'>): string;
/** A file's modification time (ms). */
export declare const mtime: (p: string) => number;
//# sourceMappingURL=files.d.ts.map