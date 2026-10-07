"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFORMANT_TITLE = exports.EXCLUSIVE_CHECKS = exports.CODEMIRROR_URL = exports.FILE_ACCESS_FLAG = exports.pageRecords = exports.writeOpfs = exports.readOpfs = exports.callPage = exports.HOST_PAGE = exports.mountEditorScript = exports.DEFAULT_EDITOR_DRIVER = exports.RECORD_BINDING = exports.PAGE_LOG = exports.PAGE_HELPERS = exports.WRITE_OPFS = exports.READ_OPFS = exports.OPFS_FOLDER = exports.initScript = exports.derivedParts = exports.loadCorpus = exports.EDIT_TEXT = exports.REFUSED_TEXTS = exports.HAZARD_TEXTS = exports.CHECK_IDS = exports.CHECKS = void 0;
exports.implementedChecks = implementedChecks;
exports.openConformance = openConformance;
exports.runConformance = runConformance;
exports.isConformant = isConformant;
exports.registerConformance = registerConformance;
exports.describeChecks = describeChecks;
/**
 * `orz-markdown/carrier/conformance` — the carrier conformance harness
 * (spec/conformance.md; orz rebuild Phase 2). It drives a carrier — its Node
 * `assemble`/`create`, its browser bundle and `release.json` — through the
 * FC-18 laws, the bundle rule, create → edit → save → update and the host
 * handshakes, in Node and in real Chrome, and reports one result per check
 * (stable ids `C.<area>.<name>`, see `CHECKS`).
 *
 * Node only (it serves pages and launches a browser), and test tooling: it is
 * not imported by any other entry of the package. Node built-ins are reached
 * through `process.getBuiltinModule`; `playwright-core` (an optional peer
 * dependency) is loaded only when a browser check runs, and the browser checks
 * are reported `skipped` when no browser can be launched.
 */
const version_js_1 = require("../../version.js");
const catalog_js_1 = require("./catalog.js");
const checks_js_1 = require("./checks.js");
const node_js_1 = require("./node.js");
const session_js_1 = require("./session.js");
var catalog_js_2 = require("./catalog.js");
Object.defineProperty(exports, "CHECKS", { enumerable: true, get: function () { return catalog_js_2.CHECKS; } });
Object.defineProperty(exports, "CHECK_IDS", { enumerable: true, get: function () { return catalog_js_2.CHECK_IDS; } });
var texts_js_1 = require("./texts.js");
Object.defineProperty(exports, "HAZARD_TEXTS", { enumerable: true, get: function () { return texts_js_1.HAZARD_TEXTS; } });
Object.defineProperty(exports, "REFUSED_TEXTS", { enumerable: true, get: function () { return texts_js_1.REFUSED_TEXTS; } });
Object.defineProperty(exports, "EDIT_TEXT", { enumerable: true, get: function () { return texts_js_1.EDIT_TEXT; } });
var node_js_2 = require("./node.js");
Object.defineProperty(exports, "loadCorpus", { enumerable: true, get: function () { return node_js_2.loadCorpus; } });
var checks_js_2 = require("./checks.js");
Object.defineProperty(exports, "derivedParts", { enumerable: true, get: function () { return checks_js_2.derivedParts; } });
// page helpers for a carrier's own browser tests (2.2.0, claim H.6)
var page_js_1 = require("./page.js");
Object.defineProperty(exports, "initScript", { enumerable: true, get: function () { return page_js_1.initScript; } });
Object.defineProperty(exports, "OPFS_FOLDER", { enumerable: true, get: function () { return page_js_1.OPFS_FOLDER; } });
Object.defineProperty(exports, "READ_OPFS", { enumerable: true, get: function () { return page_js_1.READ_OPFS; } });
Object.defineProperty(exports, "WRITE_OPFS", { enumerable: true, get: function () { return page_js_1.WRITE_OPFS; } });
Object.defineProperty(exports, "PAGE_HELPERS", { enumerable: true, get: function () { return page_js_1.PAGE_HELPERS; } });
Object.defineProperty(exports, "PAGE_LOG", { enumerable: true, get: function () { return page_js_1.PAGE_LOG; } });
Object.defineProperty(exports, "RECORD_BINDING", { enumerable: true, get: function () { return page_js_1.RECORD_BINDING; } });
Object.defineProperty(exports, "DEFAULT_EDITOR_DRIVER", { enumerable: true, get: function () { return page_js_1.DEFAULT_EDITOR_DRIVER; } });
Object.defineProperty(exports, "mountEditorScript", { enumerable: true, get: function () { return page_js_1.mountEditorScript; } });
Object.defineProperty(exports, "HOST_PAGE", { enumerable: true, get: function () { return page_js_1.HOST_PAGE; } });
var helpers_js_1 = require("./helpers.js");
Object.defineProperty(exports, "callPage", { enumerable: true, get: function () { return helpers_js_1.callPage; } });
Object.defineProperty(exports, "readOpfs", { enumerable: true, get: function () { return helpers_js_1.readOpfs; } });
Object.defineProperty(exports, "writeOpfs", { enumerable: true, get: function () { return helpers_js_1.writeOpfs; } });
Object.defineProperty(exports, "pageRecords", { enumerable: true, get: function () { return helpers_js_1.pageRecords; } });
var session_js_2 = require("./session.js");
Object.defineProperty(exports, "FILE_ACCESS_FLAG", { enumerable: true, get: function () { return session_js_2.FILE_ACCESS_FLAG; } });
Object.defineProperty(exports, "CODEMIRROR_URL", { enumerable: true, get: function () { return session_js_2.CODEMIRROR_URL; } });
const DEFAULT_TIMEOUT = 120000;
const DEFAULT_LANES = 3;
/**
 * Checks that run alone (no other check runs beside them): they time the
 * reader's typing against a script that floods the page, and a loaded
 * machine must not make them flaky.
 */
exports.EXCLUSIVE_CHECKS = ['C.edit.preview-isolation'];
/** Started first: they mostly wait (a host that never acknowledges takes 10 s). */
const FIRST = ['C.host.no-ack', 'C.update.edit-during', 'C.update.resigned', 'C.save.save-as-elsewhere', 'C.save.copy-elsewhere', 'C.law.content-independence', 'C.law.determinism'];
function selected(options) {
    for (const id of [...(options.only ?? []), ...(options.skip ?? [])])
        (0, catalog_js_1.checkInfo)(id); // unknown ids throw
    return catalog_js_1.CHECK_IDS.filter((id) => (!options.only || options.only.includes(id)) && !(options.skip ?? []).includes(id));
}
function corpusOf(target, options) {
    let cache = null;
    return () => {
        if (cache)
            return cache;
        const c = options.corpus;
        cache = c === false ? {} : typeof c === 'object' ? { ...c } : (0, node_js_1.loadCorpus)(target.kind, c);
        return cache;
    };
}
function implementations(corpus) {
    return { ...(0, checks_js_1.lawChecks)(corpus), ...checks_js_1.bundleChecks, ...checks_js_1.createChecks, ...checks_js_1.editChecks, ...checks_js_1.saveChecks, ...checks_js_1.updateChecks, ...checks_js_1.hostChecks, ...checks_js_1.prefChecks };
}
/** @internal The ids that have an implementation (equal to `CHECK_IDS`; tested). */
function implementedChecks() {
    return Object.keys(implementations(() => ({})));
}
/** Open a session (servers, browser) for the selected checks. */
async function openConformance(target, options = {}) {
    const ids = selected(options);
    const needsBrowser = ids.some((id) => (0, catalog_js_1.checkInfo)(id).chrome);
    const fns = implementations(corpusOf(target, options));
    const session = await session_js_1.Session.open(target, options, needsBrowser);
    const limit = options.checkTimeoutMs ?? DEFAULT_TIMEOUT;
    const run = async (id) => {
        const info = (0, catalog_js_1.checkInfo)(id);
        const fn = fns[id];
        const t0 = Date.now();
        const p = new checks_js_1.Probe();
        const scope = session.scope();
        let status = 'passed';
        let message;
        let timer;
        try {
            await Promise.race([
                fn(scope, p),
                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${limit} ms`)), limit); }),
            ]);
        }
        catch (e) {
            if (e instanceof checks_js_1.NotApplicable) {
                status = 'not-applicable';
                message = e.message;
            }
            else if (e instanceof checks_js_1.Skip) {
                status = 'skipped';
                message = e.message;
            }
            else
                p.fail(`error: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' | ')}`);
        }
        finally {
            if (timer)
                clearTimeout(timer);
            await scope.closeContexts();
        }
        if (p.failures.length > 0) {
            status = 'failed';
            message = p.failures.join('\n');
        }
        const result = { id, title: info.title, status, ...(message ? { message } : {}), ...(p.failures.length ? { failures: [...p.failures] } : {}), durationMs: Date.now() - t0 };
        options.log?.(`${status.padEnd(7)} ${id} (${result.durationMs} ms)${status === 'passed' ? '' : `: ${message?.split('\n')[0]}`}`);
        return result;
    };
    const schedule = (list, lanes = options.lanes ?? DEFAULT_LANES) => {
        const settle = new Map();
        const out = new Map();
        for (const id of list)
            out.set(id, new Promise((resolve) => { settle.set(id, resolve); }));
        const rank = (id) => { const i = FIRST.indexOf(id); return i < 0 ? FIRST.length : i; };
        const alone = list.filter((id) => exports.EXCLUSIVE_CHECKS.includes(id));
        const rest = list.filter((id) => !exports.EXCLUSIVE_CHECKS.includes(id)).sort((x, y) => rank(x) - rank(y));
        const go = async (id) => {
            let r;
            try {
                r = await run(id);
            }
            catch (e) {
                r = { id, title: (0, catalog_js_1.checkInfo)(id).title, status: 'failed', message: String(e?.message ?? e), failures: [String(e)], durationMs: 0 };
            }
            settle.get(id)(r);
        };
        void (async () => {
            for (const id of alone)
                await go(id);
            let next = 0;
            const lane = async () => { while (next < rest.length)
                await go(rest[next++]); };
            await Promise.all(Array.from({ length: Math.max(1, Math.floor(lanes)) }, lane));
        })();
        return out;
    };
    return { run, schedule, close: () => session.close() };
}
/** Run the selected checks against a carrier and report every result. Never throws for a failing check. */
async function runConformance(target, options = {}) {
    const runner = await openConformance(target, options);
    const results = [];
    try {
        const ids = selected(options);
        const all = runner.schedule(ids);
        for (const id of ids)
            results.push(await all.get(id));
    }
    finally {
        await runner.close();
    }
    return report(target, results);
}
/** Every check of `CHECK_IDS` has a result that passed or is not applicable. */
function isConformant(results) {
    return catalog_js_1.CHECK_IDS.every((id) => results.some((r) => r.id === id && (r.status === 'passed' || r.status === 'not-applicable')));
}
function report(target, results) {
    const count = (s) => results.filter((r) => r.status === s).length;
    return {
        kind: target.kind,
        version: target.version,
        harness: version_js_1.VERSION,
        conformant: isConformant(results),
        partial: !catalog_js_1.CHECK_IDS.every((id) => results.some((r) => r.id === id)),
        passed: count('passed'),
        failed: count('failed'),
        skipped: count('skipped'),
        notApplicable: count('not-applicable'),
        results,
    };
}
/**
 * Register the harness with a test framework: one test per check, titled
 * `[<check id>] <title>`, sharing one session, then a final test titled
 * `[conformant] …` that fails unless every check of `CHECK_IDS` ran and passed
 * (or is not applicable) — so a skipped check (no Chrome, no `next`) or a
 * partial selection (`only`/`skip`) cannot pass as conformance. With
 * `allowSkips: true` the final test tolerates skips and deselection (it
 * still fails on a failed check). A skipped check is reported through the
 * test context's `skip()` when the framework offers it (vitest).
 *
 *     import { describe, it, beforeAll, afterAll } from 'vitest';
 *     registerConformance({ describe, it, beforeAll, afterAll }, () => myTarget(), { title: 'orz-mdhtml conformance' });
 */
function registerConformance(t, target, options = {}) {
    let runner = null;
    let opening = null;
    let scheduled = null;
    const results = new Map();
    const limit = options.checkTimeoutMs ?? DEFAULT_TIMEOUT;
    const ids = selected(options);
    t.describe(options.title ?? 'orz carrier conformance', () => {
        t.beforeAll(async () => {
            try {
                runner = await openConformance(typeof target === 'function' ? await target() : target, options);
            }
            catch (e) {
                opening = e;
            }
        }, 300000);
        t.afterAll(async () => { await runner?.close(); }, 60000);
        for (const id of ids) {
            t.it(`[${id}] ${(0, catalog_js_1.checkInfo)(id).title}`, async (ctx) => {
                if (!runner)
                    throw new Error(`the conformance session did not open: ${String(opening?.message ?? opening)}`);
                scheduled ?? (scheduled = runner.schedule(ids)); // all checks start with the first test, side by side; each test awaits its own
                const r = await scheduled.get(id);
                results.set(id, r);
                if (r.status === 'failed')
                    throw new Error(`${id} failed:\n${r.message}`);
                if (r.status === 'skipped' && typeof ctx?.skip === 'function')
                    ctx.skip(r.message);
            }, limit * 4 + 60000); // its own run is bounded by the check limit; the rest is waiting for a lane
        }
        t.it(`${exports.CONFORMANT_TITLE}${options.allowSkips ? ' (skips allowed)' : ''}`, async () => {
            const all = [...results.values()];
            const failed = all.filter((r) => r.status === 'failed').map((r) => r.id);
            if (failed.length)
                throw new Error(`not conformant: failed ${failed.join(', ')}`);
            if (options.allowSkips)
                return;
            const missing = catalog_js_1.CHECK_IDS.filter((id) => !all.some((r) => r.id === id && (r.status === 'passed' || r.status === 'not-applicable')));
            if (missing.length) {
                throw new Error(`not conformant: ${missing.length} check(s) did not run and pass — ${missing.map((id) => `${id} (${results.get(id)?.status ?? 'not run'})`).join(', ')}; pass allowSkips: true for a partial or browserless run`);
            }
        }, 10000);
    });
}
/** The title of the final test `registerConformance` registers. */
exports.CONFORMANT_TITLE = '[conformant] every check of CHECK_IDS ran and passed (or is not applicable)';
/** Every check id with its title and spec reference (for docs and claims). */
function describeChecks() {
    return catalog_js_1.CHECKS.map((c) => ({ ...c }));
}
//# sourceMappingURL=index.js.map