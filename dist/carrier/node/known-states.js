"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sha256 = exports.GIT_BUDGET_MS = exports.GIT_LOG_LIMIT = void 0;
exports.canonical = canonical;
exports.cacheDir = cacheDir;
exports.recordPair = recordPair;
exports.lastWriter = lastWriter;
exports.isLastWriter = isLastWriter;
exports.earlierStateOf = earlierStateOf;
exports.twinStateOf = twinStateOf;
exports.cleanInGit = cleanInGit;
/**
 * The known states of a pair (a text twin ↔ its assembled file) that a
 * carrier's CLI can prove, for the overwrite rules of `assemble` and
 * `extract` (spec/carrier-node.md §3; lifted from orz-mdhtml 1.0's
 * src/known-states.ts, which orz-paged copied — REBUILD §3b KIT GAP).
 *
 * `assemble` refuses to replace a file that holds a different text than the
 * one being assembled — the file may hold work saved in the browser — and
 * `extract` refuses to replace a text twin that differs from the file's text
 * — it may hold edits made since. Either refusal is lifted (no `--force`, no
 * backup needed) only when what would be replaced is provably a KNOWN STATE:
 *
 * - **git**: the twin's last committed version (`git show HEAD:<twin>`), its
 *   staged version (`git show :<twin>`), or one of its
 *   {@link GIT_LOG_LIMIT} most recent commits, when the twin is tracked —
 *   all of git's runs together bounded by a time budget. Any failure (no
 *   git, not a repository, not tracked, a timeout) means "unknown".
 * - **the CLI's own record**: a small cache under
 *   `$XDG_CACHE_HOME/<cache>/` (else `~/.cache/<cache>/`) holding per pair
 *   (both paths with symbolic links resolved) the SHA-256 of the text the CLI
 *   last wrote into the file or read out of it and of the twin's exact text
 *   at that moment; and per file its LAST WRITER (the twin whose pair last
 *   synced it). A twin's own states count only while its pair is the file's
 *   last writer (or none is recorded).
 * - **the caller's token** (`--replaces <sha256>`): handled by the guards.
 *
 * The record is a convenience, never a source of truth: a missing,
 * unreadable or unwritable cache only means "unknown" — an unwritable one is
 * not even read (its records may be stale). Neither git nor the record
 * proves that a file holds the SAME DOCUMENT as the twin: callers act on
 * {@link twinStateOf} only when both texts carry the same uid.
 */
const text_js_1 = require("../text.js");
const builtins_js_1 = require("./builtins.js");
/** How many recent commits of the twin are read. */
exports.GIT_LOG_LIMIT = 20;
/** The time budget of all git runs for one question (ms). */
exports.GIT_BUDGET_MS = 8000;
/** The SHA-256 (lowercase hex) of a text's UTF-8 bytes — the records' and `--replaces`' hash (equal to the kit's isomorphic `sha256`). */
const sha256 = (s) => (0, builtins_js_1.crypto)().createHash('sha256').update(s, 'utf8').digest('hex');
exports.sha256 = sha256;
/** A path as the records key it: its real path when it exists (a symbolic link counts as its target). */
function canonical(p) {
    try {
        return (0, builtins_js_1.fs)().realpathSync(p);
    }
    catch {
        return (0, builtins_js_1.path)().resolve(p);
    }
}
/** A cache folder name: one path segment. */
function checkName(cache) {
    if (!/^[A-Za-z0-9._-]+$/.test(cache) || cache === '.' || cache === '..')
        throw new Error(`orz-markdown/carrier/node: ${JSON.stringify(cache)} is not a cache folder name`);
    return cache;
}
/** The CLI's cache folder: `$XDG_CACHE_HOME/<cache>` (an absolute XDG path only), else `~/.cache/<cache>`; null without a home. */
function cacheDir(cache, env = (0, builtins_js_1.proc)().env) {
    checkName(cache);
    const xdg = env.XDG_CACHE_HOME;
    if (xdg && (0, builtins_js_1.path)().isAbsolute(xdg))
        return (0, builtins_js_1.path)().join(xdg, cache);
    let home = '';
    try {
        home = (0, builtins_js_1.os)().homedir();
    }
    catch {
        return null;
    }
    return home ? (0, builtins_js_1.path)().join(home, '.cache', cache) : null;
}
/** The cache folder to READ records from: null when it (or `pairs/`, `files/`) exists but is not writable — such a cache may hold stale records. */
function readableCacheDir(cache) {
    const dir = cacheDir(cache);
    if (!dir)
        return null;
    const f = (0, builtins_js_1.fs)();
    for (const d of [dir, (0, builtins_js_1.path)().join(dir, 'pairs'), (0, builtins_js_1.path)().join(dir, 'files')]) {
        if (!f.existsSync(d))
            continue;
        try {
            f.accessSync(d, f.constants.W_OK);
        }
        catch {
            return null;
        }
    }
    return dir;
}
const recordPath = (twin, file, dir) => dir ? (0, builtins_js_1.path)().join(dir, 'pairs', `${(0, exports.sha256)(`${canonical(twin)}\0${canonical(file)}`)}.json`) : null;
const writerPath = (file, dir) => dir ? (0, builtins_js_1.path)().join(dir, 'files', `${(0, exports.sha256)(canonical(file))}.json`) : null;
/** Write a small JSON record atomically; false on any failure. */
function writeRecord(p, value) {
    const f = (0, builtins_js_1.fs)();
    const tmp = `${p}.${(0, builtins_js_1.proc)().pid}.tmp`;
    try {
        f.mkdirSync((0, builtins_js_1.path)().dirname(p), { recursive: true });
        f.writeFileSync(tmp, `${JSON.stringify(value)}\n`, 'utf8');
        f.renameSync(tmp, p);
        return true;
    }
    catch {
        try {
            f.unlinkSync(tmp);
        }
        catch { /* not created */ }
        return false;
    }
}
/**
 * Record that `file` holds `held` (the text the CLI just wrote into it or read
 * out of it) and that the twin holds exactly `twinText` (raw, line endings as
 * written), and that this pair is the file's last writer. Call after both are
 * written. Never throws.
 */
function recordPair(cache, twin, file, held, twinText) {
    const dir = cacheDir(cache);
    const p = recordPath(twin, file, dir);
    const w = writerPath(file, dir);
    if (!p || !w)
        return 'no-cache';
    // the last writer first: if the pair record then fails, the file names this pair with no record (nothing relaxed)
    const ok = writeRecord(w, { file: canonical(file), twin: canonical(twin) })
        && writeRecord(p, { twin: canonical(twin), file: canonical(file), text: (0, exports.sha256)(held), twinText: (0, exports.sha256)(twinText) });
    return ok ? 'recorded' : 'failed';
}
/** The twin whose pair last synced `file` (canonical): a path, `null` (none recorded, no cache), `undefined` (unreadable record). */
function lastWriterOf(cache, file) {
    const p = writerPath(file, readableCacheDir(cache));
    if (!p)
        return null;
    let raw;
    try {
        raw = (0, builtins_js_1.fs)().readFileSync(p, 'utf8');
    }
    catch (e) {
        return e.code === 'ENOENT' ? null : undefined;
    }
    try {
        const r = JSON.parse(raw);
        return r.file === canonical(file) && typeof r.twin === 'string' ? r.twin : undefined;
    }
    catch {
        return undefined;
    }
}
/** The path of the text the CLI last synced `file` with, or null when none is recorded or readable. */
function lastWriter(cache, file) {
    return lastWriterOf(cache, file) ?? null;
}
/** True when the pair `twin` ↔ `file` is the file's last writer. */
function isLastWriter(cache, twin, file) {
    return lastWriterOf(cache, file) === canonical(twin);
}
function recordOf(cache, twin, file) {
    const p = recordPath(twin, file, readableCacheDir(cache));
    if (!p)
        return null;
    try {
        const r = JSON.parse((0, builtins_js_1.fs)().readFileSync(p, 'utf8'));
        return r.twin === canonical(twin) && r.file === canonical(file) ? r : null;
    }
    catch {
        return null;
    }
}
/** Run git in the twin's folder; null on any failure or when the deadline has passed. */
function git(twin, args, deadline) {
    const left = deadline - Date.now();
    if (left <= 0)
        return null;
    try {
        return (0, builtins_js_1.childProcess)().execFileSync('git', ['-C', (0, builtins_js_1.path)().dirname(canonical(twin)), ...args], {
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: Math.min(5000, left),
            maxBuffer: 256 * 1024 * 1024,
            env: { ...(0, builtins_js_1.proc)().env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
            windowsHide: true,
        });
    }
    catch {
        return null;
    }
}
/** A tracked file's text at `rev` (`HEAD:`, the index `:`, or `<sha>:`), or null. */
function gitText(twin, rev, deadline) {
    const out = git(twin, ['show', `${rev}./${(0, builtins_js_1.path)().basename(canonical(twin))}`], deadline);
    if (out === null)
        return null;
    try {
        return (0, text_js_1.decodeText)(out, { fatal: true });
    }
    catch {
        return null;
    }
}
/** The twin's texts in git, lazily, most likely first: HEAD, the index, then recent commits (no repeats). */
function* gitStates(twin, deadline) {
    const head = gitText(twin, 'HEAD:', deadline);
    if (head !== null)
        yield ['git-head', head];
    const index = gitText(twin, ':', deadline);
    if (index !== null && index !== head)
        yield ['git-index', index];
    if (head === null && index === null)
        return; // not tracked (or no git): no history either
    const log = git(twin, ['log', '-n', String(exports.GIT_LOG_LIMIT), '--format=%H', '--', `./${(0, builtins_js_1.path)().basename(canonical(twin))}`], deadline);
    if (log === null)
        return;
    const seen = new Set([head ?? '', index ?? '']);
    for (const sha of new TextDecoder().decode(log).split('\n').map((l) => l.trim()).filter((l) => /^[0-9a-f]{40,64}$/.test(l))) {
        const t = gitText(twin, `${sha}:`, deadline);
        if (t === null || seen.has(t))
            continue;
        seen.add(t);
        yield ['git-log', t];
    }
}
/**
 * Whether `held` — the text an existing file holds — is a known earlier state
 * of the twin: the pair's record (`cache`), or with `git` (default; pass
 * `false` for an `-o` output that is not the twin's own file) a committed,
 * staged or recent version of the twin. `stored` maps a twin text to the text
 * a file assembled from it holds, so a committed text compares like a file's.
 */
function earlierStateOf(cache, twin, file, held, stored, options = {}) {
    if (recordOf(cache, twin, file)?.text === (0, exports.sha256)(held))
        return 'cache';
    if (options.git === false)
        return null;
    for (const [state, text] of gitStates(twin, Date.now() + exports.GIT_BUDGET_MS))
        if (stored(text) === held)
            return state;
    return null;
}
/**
 * Whether the twin's current text `current` is a known state of the pair —
 * exactly (raw: a line-ending change is a change) the text the CLI last wrote
 * or read for the pair while this pair is the file's last writer, or, with
 * `git` (the twin's own file only), a committed, staged or recent version
 * while no other twin is the file's last writer. A known state says only
 * that the TWIN is unchanged, never that the file holds the same document.
 */
function twinStateOf(cache, twin, file, current, options = {}) {
    const writer = lastWriterOf(cache, file);
    if (writer === canonical(twin) && recordOf(cache, twin, file)?.twinText === (0, exports.sha256)(current))
        return 'cache';
    if (writer !== null && writer !== canonical(twin))
        return null; // another input (or an unreadable record) last synced the file
    if (options.git === false)
        return null;
    for (const [state, text] of gitStates(twin, Date.now() + exports.GIT_BUDGET_MS))
        if (text === current)
            return state;
    return null;
}
/** True when `p` is tracked in git and unmodified (its modification time is then a checkout's). False on any failure. */
function cleanInGit(p) {
    const deadline = Date.now() + 3000;
    const name = `./${(0, builtins_js_1.path)().basename(canonical(p))}`;
    if (git(p, ['ls-files', '--error-unmatch', '--', name], deadline) === null)
        return false;
    const status = git(p, ['status', '--porcelain', '--', name], deadline);
    return status !== null && new TextDecoder().decode(status).trim() === '';
}
//# sourceMappingURL=known-states.js.map