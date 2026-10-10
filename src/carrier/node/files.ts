/**
 * A carrier CLI's file operations (spec/carrier-node.md §4): exact reads,
 * atomic writes that keep a file's mode and a symbolic link, and backups
 * that are never destroyed.
 */
import { decodeText } from '../text.js';
import { fs, path, proc } from './builtins.js';
import { CliError, type Io } from './cli.js';

/** Read a file as text exactly (UTF-8, BOM kept, invalid UTF-8 refused: `no-such-file`, `unreadable`, `not-utf8`). */
export function readText(p: string): string {
  let bytes: Uint8Array;
  try { bytes = fs().readFileSync(p); } catch (e) {
    const code = (e as { code?: string }).code;
    throw new CliError(code === 'ENOENT' ? `${p}: no such file` : code === 'EISDIR' ? `${p} is a folder` : `${p}: ${(e as Error).message}`, code === 'ENOENT' ? 'no-such-file' : 'unreadable');
  }
  try { return decodeText(bytes, { fatal: true }); } catch { throw new CliError(`${p} is not valid UTF-8`, 'not-utf8'); }
}

/** An existing file as text, or null when it cannot be read as UTF-8. */
export function readMaybe(p: string): string | null {
  try { return readText(p); } catch { return null; }
}

/**
 * Write a file atomically (a temporary file next to it, then a rename), so a
 * failure never leaves half a file. An existing file keeps its mode, and a
 * symbolic link stays a link: the file it points to is replaced. Missing
 * parent folders are created. Failure: `write-failed`, nothing replaced.
 */
export function writeOut(p: string, data: string): void {
  const f = fs();
  const pa = path();
  let target = p;
  let mode: number | undefined;
  if (f.existsSync(p)) {
    try {
      target = f.realpathSync(p);
      mode = f.statSync(target).mode & 0o7777;
    } catch { /* replaced as named */ }
  }
  const tmp = pa.join(pa.dirname(target), `.${pa.basename(target)}.orz-${proc().pid}.tmp`);
  try {
    f.mkdirSync(pa.dirname(target), { recursive: true }); // -o into a folder that does not exist yet
    f.writeFileSync(tmp, data, { encoding: 'utf8', ...(mode !== undefined ? { mode } : {}) });
    if (mode !== undefined) f.chmodSync(tmp, mode); // the umask does not narrow it
    f.renameSync(tmp, target);
  } catch (e) {
    try { f.unlinkSync(tmp); } catch { /* not created */ }
    throw new CliError(`could not write ${p}: ${(e as Error).message}`, 'write-failed');
  }
}

/**
 * Keep a copy of a file about to be replaced with --force: `<file>~` — or,
 * when that name holds something else (an earlier backup with other bytes, a
 * symbolic link, a folder), the first free `<file>~1`, `<file>~2`, … An
 * existing backup is never overwritten, and a symbolic link at a backup name
 * is never followed or written through (`lstat`, then an exclusive create). A
 * backup that already holds exactly these bytes is reused. Says so on `o`;
 * returns the backup's path. Failure: `write-failed`, nothing written.
 */
export function backup(p: string, o: Pick<Io, 'warn'>): string {
  const f = fs();
  const read = (q: string) => f.readFileSync(q);
  let data: ReturnType<typeof read>;
  try { data = read(p); } catch (e) { throw new CliError(`could not read ${p} to keep a copy: ${(e as Error).message}; nothing was written`, 'write-failed'); }
  for (let i = 0; i < 1000; i++) {
    const to = i === 0 ? `${p}~` : `${p}~${i}`;
    let st: ReturnType<typeof f.lstatSync> | null = null;
    try { st = f.lstatSync(to); } catch (e) {
      if ((e as { code?: string }).code !== 'ENOENT') throw new CliError(`could not keep a copy of ${p} as ${to}: ${(e as Error).message}; nothing was written`, 'write-failed');
    }
    if (st === null) {
      try { f.copyFileSync(p, to, f.constants.COPYFILE_EXCL); } catch (e) {
        if ((e as { code?: string }).code === 'EEXIST') continue; // created meanwhile: the next name
        throw new CliError(`could not keep a copy of ${p} as ${to}: ${(e as Error).message}; nothing was written`, 'write-failed');
      }
    } else if (!(st.isFile() && st.size === data.length && read(to).equals(data))) {
      continue; // another backup (or a link, a folder): kept; try the next name
    }
    o.warn(`replaced ${p} (--force); the old file is kept as ${to}${i > 0 ? ` (${p}~ already held something else; it is kept too)` : ''}`);
    return to;
  }
  throw new CliError(`could not keep a copy of ${p}: ${p}~ … ${p}~999 are all taken; nothing was written`, 'write-failed');
}

/** A file's modification time (ms). */
export const mtime = (p: string): number => fs().statSync(p).mtimeMs;
