"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mtime = void 0;
exports.readText = readText;
exports.readMaybe = readMaybe;
exports.writeOut = writeOut;
exports.backup = backup;
/**
 * A carrier CLI's file operations (spec/carrier-node.md §4): exact reads,
 * atomic writes that keep a file's mode and a symbolic link, and backups
 * that are never destroyed.
 */
const text_js_1 = require("../text.js");
const builtins_js_1 = require("./builtins.js");
const cli_js_1 = require("./cli.js");
/** Read a file as text exactly (UTF-8, BOM kept, invalid UTF-8 refused: `no-such-file`, `unreadable`, `not-utf8`). */
function readText(p) {
    let bytes;
    try {
        bytes = (0, builtins_js_1.fs)().readFileSync(p);
    }
    catch (e) {
        const code = e.code;
        throw new cli_js_1.CliError(code === 'ENOENT' ? `${p}: no such file` : code === 'EISDIR' ? `${p} is a folder` : `${p}: ${e.message}`, code === 'ENOENT' ? 'no-such-file' : 'unreadable');
    }
    try {
        return (0, text_js_1.decodeText)(bytes, { fatal: true });
    }
    catch {
        throw new cli_js_1.CliError(`${p} is not valid UTF-8`, 'not-utf8');
    }
}
/** An existing file as text, or null when it cannot be read as UTF-8. */
function readMaybe(p) {
    try {
        return readText(p);
    }
    catch {
        return null;
    }
}
/**
 * Write a file atomically (a temporary file next to it, then a rename), so a
 * failure never leaves half a file. An existing file keeps its mode, and a
 * symbolic link stays a link: the file it points to is replaced. Missing
 * parent folders are created. Failure: `write-failed`, nothing replaced.
 */
function writeOut(p, data) {
    const f = (0, builtins_js_1.fs)();
    const pa = (0, builtins_js_1.path)();
    let target = p;
    let mode;
    if (f.existsSync(p)) {
        try {
            target = f.realpathSync(p);
            mode = f.statSync(target).mode & 0o7777;
        }
        catch { /* replaced as named */ }
    }
    const tmp = pa.join(pa.dirname(target), `.${pa.basename(target)}.orz-${(0, builtins_js_1.proc)().pid}.tmp`);
    try {
        f.mkdirSync(pa.dirname(target), { recursive: true }); // -o into a folder that does not exist yet
        f.writeFileSync(tmp, data, { encoding: 'utf8', ...(mode !== undefined ? { mode } : {}) });
        if (mode !== undefined)
            f.chmodSync(tmp, mode); // the umask does not narrow it
        f.renameSync(tmp, target);
    }
    catch (e) {
        try {
            f.unlinkSync(tmp);
        }
        catch { /* not created */ }
        throw new cli_js_1.CliError(`could not write ${p}: ${e.message}`, 'write-failed');
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
function backup(p, o) {
    const f = (0, builtins_js_1.fs)();
    const read = (q) => f.readFileSync(q);
    let data;
    try {
        data = read(p);
    }
    catch (e) {
        throw new cli_js_1.CliError(`could not read ${p} to keep a copy: ${e.message}; nothing was written`, 'write-failed');
    }
    for (let i = 0; i < 1000; i++) {
        const to = i === 0 ? `${p}~` : `${p}~${i}`;
        let st = null;
        try {
            st = f.lstatSync(to);
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                throw new cli_js_1.CliError(`could not keep a copy of ${p} as ${to}: ${e.message}; nothing was written`, 'write-failed');
        }
        if (st === null) {
            try {
                f.copyFileSync(p, to, f.constants.COPYFILE_EXCL);
            }
            catch (e) {
                if (e.code === 'EEXIST')
                    continue; // created meanwhile: the next name
                throw new cli_js_1.CliError(`could not keep a copy of ${p} as ${to}: ${e.message}; nothing was written`, 'write-failed');
            }
        }
        else if (!(st.isFile() && st.size === data.length && read(to).equals(data))) {
            continue; // another backup (or a link, a folder): kept; try the next name
        }
        o.warn(`replaced ${p} (--force); the old file is kept as ${to}${i > 0 ? ` (${p}~ already held something else; it is kept too)` : ''}`);
        return to;
    }
    throw new cli_js_1.CliError(`could not keep a copy of ${p}: ${p}~ … ${p}~999 are all taken; nothing was written`, 'write-failed');
}
/** A file's modification time (ms). */
const mtime = (p) => (0, builtins_js_1.fs)().statSync(p).mtimeMs;
exports.mtime = mtime;
//# sourceMappingURL=files.js.map