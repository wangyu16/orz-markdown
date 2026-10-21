"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.includeTargets = exports.isUrl = void 0;
exports.keepReferenced = keepReferenced;
exports.unresolvedIncludes = unresolvedIncludes;
exports.resolveFileIncludes = resolveFileIncludes;
exports.includePlan = includePlan;
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
const targets_js_1 = require("../targets.js");
Object.defineProperty(exports, "includeTargets", { enumerable: true, get: function () { return targets_js_1.includeTargets; } });
const text_js_1 = require("../text.js");
const builtins_js_1 = require("./builtins.js");
/** A URL target (`scheme://…`): never read by the CLI. */
const isUrl = (t) => /^[a-z][a-z0-9+.-]*:\/\//i.test(t);
exports.isUrl = isUrl;
/** A file target on a virtual root (as the record's reader normalizes it: `./a.md` = `a.md`). */
function rootPath(target) {
    const out = [];
    for (const seg of target.replace(/^[A-Za-z]:/, '').split(/[\\/]/)) {
        if (!seg || seg === '.')
            continue;
        if (seg === '..')
            out.pop();
        else
            out.push(seg);
    }
    return `/${out.join('/')}`;
}
/** The record entry that answers a target (URLs exactly; files by their normalized path). */
function entryFor(record, target) {
    if (Object.prototype.hasOwnProperty.call(record, target))
        return target;
    if ((0, exports.isUrl)(target))
        return null;
    const want = rootPath(target);
    return Object.keys(record).find((k) => !(0, exports.isUrl)(k) && rootPath(k) === want) ?? null;
}
/** The entries of `record` the text still includes (a removed directive's entry is dropped). */
function keepReferenced(text, record, directives) {
    const out = {};
    for (const target of (0, targets_js_1.includeTargets)(text, directives)) {
        const key = entryFor(record, target);
        if (key !== null)
            out[key] = record[key];
    }
    return out;
}
/** The include targets of the text the record does not answer. */
function unresolvedIncludes(text, record, directives) {
    return (0, targets_js_1.includeTargets)(text, directives).filter((t) => entryFor(record, t) === null);
}
/**
 * Read the text's file includes from `folder` (the text twin's folder): each
 * target as written → the file's exact text (UTF-8). A target outside the
 * folder (after symbolic links), missing, unreadable or not UTF-8 is not
 * resolved (`problems`). URL targets are left alone.
 */
function resolveFileIncludes(text, folder, directives) {
    const f = (0, builtins_js_1.fs)();
    const p = (0, builtins_js_1.path)();
    const includes = {};
    const problems = [];
    let root;
    try {
        root = f.realpathSync(folder);
    }
    catch {
        return { includes, problems, folderProblem: `the folder ${folder} cannot be read` };
    }
    for (const target of (0, targets_js_1.includeTargets)(text, directives)) {
        if ((0, exports.isUrl)(target))
            continue;
        const at = p.resolve(folder, target.replace(/\\/g, '/'));
        let real;
        try {
            real = f.realpathSync(at);
        }
        catch {
            problems.push({ target, reason: 'no-such-file', message: `no such file (${at})` });
            continue;
        }
        const rel = p.relative(root, real);
        if (rel === '' || rel === '..' || rel.startsWith(`..${p.sep}`) || p.isAbsolute(rel)) {
            problems.push({ target, reason: 'outside-folder', message: `outside the text's folder (${root}); not read` });
            continue;
        }
        try {
            includes[target] = (0, text_js_1.decodeText)(f.readFileSync(real), { fatal: true });
        }
        catch (e) {
            const code = e.code;
            problems.push({ target, reason: code ? 'unreadable' : 'not-utf8', message: code === 'EISDIR' ? 'a folder' : code ? e.message : 'not valid UTF-8' });
        }
    }
    return { includes, problems, folderProblem: null };
}
const NOTE = 'the file shows an "Included file not available" note there';
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
function includePlan(text, o) {
    let includes = o.keep && o.held ? keepReferenced(text, o.held, o.directives) : {};
    const probe = resolveFileIncludes(text, o.folder, o.directives);
    const problems = new Map(probe.problems.map((p) => [p.target, p]));
    const warnings = [];
    let resolved = 0;
    const stale = [];
    if (o.resolve) {
        for (const key of Object.keys(includes))
            if (!(0, exports.isUrl)(key))
                delete includes[key]; // files are read afresh
        includes = { ...includes, ...probe.includes };
        resolved = Object.keys(probe.includes).length;
    }
    else {
        for (const [target, recorded] of Object.entries(includes)) {
            const current = probe.includes[target];
            if ((0, exports.isUrl)(target) || current === undefined || current === recorded)
                continue;
            stale.push({ target, kind: 'file', reason: 'stale-record' });
            warnings.push(`{{md ${target}}} is stale (stale-record): the file shows the text recorded in ${o.outName}, and ${target} in the text's folder has changed since; \`${o.resolveCommand}\` records the current one`);
        }
    }
    const folderProblem = o.resolve ? probe.folderProblem : null;
    const unresolved = unresolvedIncludes(text, includes, o.directives).map((target) => {
        if ((0, exports.isUrl)(target))
            return { target, kind: 'url', reason: 'url' };
        const problem = problems.get(target);
        return { target, kind: 'file', reason: problem ? problem.reason : !o.resolve ? 'not-recorded' : folderProblem ? 'folder-unreadable' : 'no-such-file' };
    });
    for (const u of unresolved) {
        const problem = problems.get(u.target);
        const why = u.kind === 'url'
            ? `${NOTE} (a URL include is shown only from the record of a file that holds it, or by a host that resolves it; the CLI fetches no URLs)`
            : problem ? `${problem.message}${!o.resolve && problem.reason === 'outside-folder' ? ' — --resolve-includes does not read it either: copy it into the folder' : ''}; ${NOTE}`
                : o.resolve ? `${folderProblem ?? 'not read'}; ${NOTE}`
                    : `${NOTE} (pass --resolve-includes to read it from the text's folder: \`${o.resolveCommand}\`)`;
        warnings.push(`{{md ${u.target}}} is not resolved: ${why}`);
    }
    return { includes, resolved, unresolved, stale, warnings };
}
//# sourceMappingURL=includes.js.map