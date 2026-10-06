"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateError = exports.UPDATE_SKIP_PREFIX = exports.UPDATE_CACHE_PREFIX = exports.MAX_BUNDLE_BYTES = exports.REASSEMBLE_TIMEOUT_MS = exports.MAX_MANIFEST_BYTES = exports.MANIFEST_TIMEOUT_MS = exports.UPDATE_CHECK_INTERVAL_MS = exports.RELEASE_CDN_BASE = exports.RELEASE_KINDS = void 0;
exports.parseSemver = parseSemver;
exports.compareSemver = compareSemver;
exports.browserPackage = browserPackage;
exports.manifestUrl = manifestUrl;
exports.isBundlePath = isBundlePath;
exports.bundleUrl = bundleUrl;
exports.parseManifest = parseManifest;
exports.skipVersion = skipVersion;
exports.skippedVersion = skippedVersion;
exports.checkForUpdate = checkForUpdate;
exports.sha384Integrity = sha384Integrity;
exports.isScriptSafe = isScriptSafe;
exports.sandboxDocument = sandboxDocument;
exports.reassemble = reassemble;
exports.performUpdate = performUpdate;
/**
 * Quiet updates (FD-05; spec/shell-runtime.md §6–§7): the release-manifest
 * check, and the transactional re-assembly of a document with a newer shell.
 *
 * Update = re-assembly, never patching: the text is assembled again by the
 * NEW release's own `assemble`, run in a sandboxed opaque-origin iframe, and
 * the result is accepted only when the parser-free `extract` gives back
 * exactly the same text, the same kind and the release's version. Nothing in
 * the live page changes; the caller saves the returned HTML through
 * `createSaver` and reloads only when `performUpdate` says it is safe
 * (`reload`). Only a top-level standalone file checks: never a framed page,
 * a page with a connected host, or (by default) a served page.
 *
 * Sources are hard-coded (RULES §5.4): the manifest URL and the bundle URL
 * are built here from `KIND_PACKAGE` and the jsDelivr base; a document's text
 * or header can never redirect them. `cdnBase` is a code option for tests and
 * for a carrier's own code, never read from a document.
 *
 * Parser-free and Node-safe: no browser global is touched at module load.
 */
const read_js_1 = require("../read.js");
const types_js_1 = require("./types.js");
exports.RELEASE_KINDS = ['md', 'slides', 'paged'];
/** The default CDN base (jsDelivr's npm mirror). */
exports.RELEASE_CDN_BASE = 'https://cdn.jsdelivr.net/npm/';
/** At most one network check per kind in this interval. */
exports.UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** A manifest request that takes longer is abandoned (silently). */
exports.MANIFEST_TIMEOUT_MS = 10000;
/** Manifests larger than this are ignored. */
exports.MAX_MANIFEST_BYTES = 64 * 1024;
/** Default time the sandboxed re-assembly may take. */
exports.REASSEMBLE_TIMEOUT_MS = 30000;
/** Bundles larger than this are refused. */
exports.MAX_BUNDLE_BYTES = 64 * 1024 * 1024;
/** localStorage keys: the last check per kind, and the skipped version per kind. */
exports.UPDATE_CACHE_PREFIX = 'orz-update:';
exports.UPDATE_SKIP_PREFIX = 'orz-update-skip:';
// ── semver ────────────────────────────────────────────────────────────────
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
/** Parse a semver 2.0.0 version (no `v` prefix, no leading zeros); null when invalid. */
function parseSemver(version) {
    if (typeof version !== 'string' || version.length > 256)
        return null;
    const m = SEMVER.exec(version);
    if (!m)
        return null;
    return { major: m[1], minor: m[2], patch: m[3], prerelease: m[4] ? m[4].split('.') : [] };
}
/** Compare non-negative decimal strings without leading zeros (any length). */
function cmpNum(a, b) {
    if (a.length !== b.length)
        return a.length < b.length ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
}
/**
 * Semver 2.0.0 precedence: -1, 0 or 1 (build metadata ignored); null when
 * either is not a valid version.
 */
function compareSemver(a, b) {
    const x = parseSemver(a);
    const y = parseSemver(b);
    if (!x || !y)
        return null;
    for (const k of ['major', 'minor', 'patch']) {
        const c = cmpNum(x[k], y[k]);
        if (c)
            return c;
    }
    const p = x.prerelease;
    const q = y.prerelease;
    if (!p.length || !q.length)
        return p.length === q.length ? 0 : p.length ? -1 : 1;
    for (let i = 0; i < Math.max(p.length, q.length); i++) {
        if (i >= p.length)
            return -1;
        if (i >= q.length)
            return 1;
        const an = /^\d+$/.test(p[i]);
        const bn = /^\d+$/.test(q[i]);
        let c;
        if (an && bn)
            c = cmpNum(p[i], q[i]);
        else if (an !== bn)
            c = an ? -1 : 1;
        else
            c = p[i] < q[i] ? -1 : p[i] > q[i] ? 1 : 0;
        if (c)
            return c;
    }
    return 0;
}
// ── URLs and the manifest ─────────────────────────────────────────────────
function isReleaseKind(k) {
    return k === 'md' || k === 'slides' || k === 'paged';
}
/** `cdnBase` normalised: an absolute http(s) URL ending in `/`, with no query or fragment. */
function base(cdnBase) {
    if (cdnBase === undefined)
        return exports.RELEASE_CDN_BASE;
    if (typeof cdnBase !== 'string' || !/^https?:\/\/[^\s?#]+$/.test(cdnBase))
        throw new Error('orz update: cdnBase must be an absolute http(s) URL');
    return cdnBase.endsWith('/') ? cdnBase : `${cdnBase}/`;
}
/** The browser package of a kind: `orz-mdhtml-browser`, `orz-slides-browser`, `orz-paged-browser`. */
function browserPackage(kind) {
    if (!isReleaseKind(kind))
        throw new Error(`orz update: no releases for kind "${String(kind)}"`);
    return `${read_js_1.KIND_PACKAGE[kind]}-browser`;
}
/** The release manifest URL of a kind: `https://cdn.jsdelivr.net/npm/<pkg>-browser@latest/release.json`. */
function manifestUrl(kind, cdnBase) {
    return `${base(cdnBase)}${browserPackage(kind)}@latest/release.json`;
}
const PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;
/** True for a plain relative path inside a package: segments of `[A-Za-z0-9._-]`, none `.` or `..`, no scheme, query, fragment, backslash or leading `/`. */
function isBundlePath(path) {
    if (typeof path !== 'string' || path.length === 0 || path.length > 200)
        return false;
    return path.split('/').every((s) => PATH_SEGMENT.test(s) && s !== '.' && s !== '..');
}
/** The bundle URL of a release: `https://cdn.jsdelivr.net/npm/<pkg>-browser@<version>/<path>`. Throws for an invalid version or path. */
function bundleUrl(release, cdnBase) {
    if (!parseSemver(release.version))
        throw new Error('orz update: the release version is not semver');
    if (!isBundlePath(release.bundle?.path))
        throw new Error('orz update: the bundle path must be a plain relative path');
    return `${base(cdnBase)}${browserPackage(release.kind)}@${release.version}/${release.bundle.path}`;
}
const INTEGRITY = /^sha384-[A-Za-z0-9+/]{64}$/;
/**
 * Validate a parsed `release.json` for `kind`; null when anything required is
 * missing or malformed (unknown fields are ignored; a notes link that is not
 * `https:` is dropped).
 */
function parseManifest(raw, kind) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
        return null;
    const r = raw;
    if (r.kind !== kind || !isReleaseKind(r.kind))
        return null;
    if (!parseSemver(r.version) || r.version.includes('+'))
        return null; // npm versions carry no build metadata
    const formats = r.formats;
    if (!Array.isArray(formats) || formats.length === 0 || formats.length > 64 || !formats.every((f) => Number.isInteger(f) && f >= 1))
        return null;
    const b = r.bundle;
    if (typeof b !== 'object' || b === null || Array.isArray(b))
        return null;
    if (!isBundlePath(b.path) || typeof b.integrity !== 'string' || !INTEGRITY.test(b.integrity))
        return null;
    const notes = typeof r.notes === 'string' && /^https:\/\/[^\s"'<>\\]+$/.test(r.notes) && r.notes.length <= 2048 ? r.notes : '';
    return { kind, version: r.version, formats: [...formats], notes, bundle: { path: b.path, integrity: b.integrity } };
}
function resolveFetch(f) {
    if (f)
        return f;
    try {
        const g = globalThis.fetch;
        return typeof g === 'function' ? (url, init) => g.call(globalThis, url, init) : undefined;
    }
    catch {
        return undefined;
    }
}
function resolveStorage(s) {
    if (s)
        return s;
    try {
        return (0, types_js_1.globalWindow)()?.localStorage ?? undefined;
    }
    catch {
        return undefined;
    }
}
function readCache(storage, kind) {
    try {
        const raw = storage.getItem(exports.UPDATE_CACHE_PREFIX + kind);
        if (typeof raw !== 'string')
            return null;
        const v = JSON.parse(raw);
        if (typeof v !== 'object' || v === null || typeof v.checkedAt !== 'number' || !Number.isFinite(v.checkedAt))
            return null;
        return v;
    }
    catch {
        return null;
    }
}
function writeCache(storage, kind, entry) {
    try {
        storage.setItem(exports.UPDATE_CACHE_PREFIX + kind, JSON.stringify(entry));
        return true;
    }
    catch {
        return false;
    }
}
/** Record "skip this version": that version (and anything not newer) is no longer offered for this kind. `false` when storage refuses. */
function skipVersion(kind, version, storage) {
    if (!isReleaseKind(kind) || !parseSemver(version))
        return false;
    const s = resolveStorage(storage);
    if (!s)
        return false;
    try {
        s.setItem(exports.UPDATE_SKIP_PREFIX + kind, version);
        return true;
    }
    catch {
        return false;
    }
}
/** The skipped version of a kind, or null. */
function skippedVersion(kind, storage) {
    try {
        const v = resolveStorage(storage)?.getItem(exports.UPDATE_SKIP_PREFIX + kind);
        return typeof v === 'string' && parseSemver(v) ? v : null;
    }
    catch {
        return null;
    }
}
/**
 * Why this page must not check, or null: a connected host, a framed page, or
 * a served page without `servedPages` (spec/shell-runtime.md §7.1).
 */
function notChecked(opts) {
    if (opts.host && opts.host.connected())
        return 'hosted';
    const page = opts.page ?? (0, types_js_1.globalWindow)();
    if (!page)
        return null; // not a browser page (Node, a worker): nothing to embed or serve
    const parent = page.parent;
    if (parent != null && parent !== page)
        return 'framed';
    const protocol = page.location?.protocol;
    if (!opts.servedPages && (protocol === 'http:' || protocol === 'https:'))
        return 'served';
    return null;
}
function withTimeout(p, ms, fallback) {
    return new Promise((resolve) => {
        const t = setTimeout(() => resolve(fallback), ms);
        p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
    });
}
async function fetchManifest(kind, opts) {
    const f = resolveFetch(opts.fetch);
    if (!f)
        return null;
    const url = manifestUrl(kind, opts.cdnBase);
    const run = async () => {
        const res = await f(url, { credentials: 'omit', cache: 'no-cache' });
        if (!res || !res.ok)
            return null;
        const body = await res.text();
        if (typeof body !== 'string' || body.length > exports.MAX_MANIFEST_BYTES)
            return null;
        return parseManifest(JSON.parse(body), kind);
    };
    return withTimeout(run(), exports.MANIFEST_TIMEOUT_MS, null);
}
/** The offer a manifest makes to a document, or null. */
function offer(manifest, opts, skipped) {
    if (!manifest)
        return null;
    const latest = parseSemver(manifest.version);
    if (!latest || latest.prerelease.length > 0)
        return null; // prereleases are never offered
    if (compareSemver(manifest.version, opts.current) !== 1)
        return null;
    if (!manifest.formats.includes(opts.format ?? 1))
        return null;
    if (skipped && compareSemver(manifest.version, skipped) !== 1)
        return null;
    return { kind: opts.kind, current: opts.current, latest: manifest.version, notes: manifest.notes, manifest };
}
/**
 * Is a newer release of this kind available for this document? Never on a
 * page embedded in a frame or with a connected host (the app owns the
 * version), nor on a served page unless `servedPages`. At most one
 * network request per kind per {@link UPDATE_CHECK_INTERVAL_MS} (the last
 * check — success or failure — is recorded in storage; within the interval
 * the recorded manifest is used); without usable storage nothing is fetched.
 * Never rejects: offline, a bad response or a bad manifest resolve `null`.
 * Offers only a stable release newer than `current` (semver precedence)
 * whose `formats` include the document's format and that is newer than a
 * skipped version.
 */
async function checkForUpdate(opts) {
    try {
        if (!isReleaseKind(opts.kind) || !parseSemver(opts.current))
            return null;
        if (notChecked(opts))
            return null; // before storage and network: a hosted file makes no request
        if (opts.cdnBase !== undefined)
            base(opts.cdnBase); // validate early (throws → null)
        const storage = resolveStorage(opts.storage);
        if (!storage)
            return null; // no way to keep the once-a-day promise: do not check
        const now = typeof opts.now === 'number' && Number.isFinite(opts.now) ? opts.now : Date.now();
        const cache = readCache(storage, opts.kind);
        let manifest = cache ? parseManifest(cache.manifest, opts.kind) : null;
        const age = cache ? now - cache.checkedAt : Infinity;
        if (!(age >= 0 && age < exports.UPDATE_CHECK_INTERVAL_MS)) {
            // Record the attempt BEFORE the request: a failure or a crash still counts as today's check.
            if (!writeCache(storage, opts.kind, { checkedAt: now, manifest }))
                return null;
            const fetched = await fetchManifest(opts.kind, opts).catch(() => null);
            if (fetched) {
                manifest = fetched;
                writeCache(storage, opts.kind, { checkedAt: now, manifest });
            }
        }
        return offer(manifest, opts, skippedVersion(opts.kind, storage));
    }
    catch {
        return null;
    }
}
/** Why a re-assembly was refused. Nothing was changed when one is thrown. */
class UpdateError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'UpdateError';
        this.code = code;
    }
}
exports.UpdateError = UpdateError;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
        out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
    }
    return out;
}
/** The `sha384-<base64>` integrity string of some bytes (SubtleCrypto). */
async function sha384Integrity(bytes) {
    let subtle;
    try {
        subtle = globalThis.crypto?.subtle;
    }
    catch {
        subtle = undefined;
    }
    if (!subtle)
        throw new UpdateError('no-crypto', 'This browser cannot verify the update (no SubtleCrypto); nothing was changed.');
    const digest = await subtle.digest('SHA-384', bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    return `sha384-${base64(new Uint8Array(digest))}`;
}
/**
 * True when the bundle can be inlined in a `<script>` exactly: the project's
 * script escaping (`escapeScriptText`) leaves it unchanged, i.e. it holds no
 * `<script` or `</script` (any case, after any backslashes), and it holds no
 * CR (an HTML parser rewrites CR in a `<script>`, so the inlined bytes would
 * no longer match the integrity). A carrier's
 * release build writes such sequences as `\x3Cscript` (spec/shell-runtime.md
 * §6); a bundle that needs escaping is refused, because escaping code changes
 * what runs.
 */
function isScriptSafe(code) {
    return !code.includes('\r') && (0, read_js_1.escapeScriptText)(code) === code;
}
const BOOT_REQUEST = 'orz-reassemble';
const BOOT_READY = 'orz-reassemble-ready';
const BOOT_RESULT = 'orz-reassembled';
/**
 * The listener that runs inside the sandbox after the bundle: it answers only
 * its parent, calls `OrzCarrier.assemble(text, { delivery, engineSource })`
 * and posts the html back. ES5, no backticks, no `</script`.
 */
const BOOTSTRAP = [
    '(function () {',
    '  var P = parent;',
    "  addEventListener('message', function (e) {",
    '    if (e.source !== P) return;',
    '    var d = e.data;',
    "    if (!d || d.type !== '" + BOOT_REQUEST + "') return;",
    '    var C = self.OrzCarrier;',
    '    var reply = function (m) { m.type = "' + BOOT_RESULT + '"; m.id = d.id; P.postMessage(m, "*"); };',
    '    new Promise(function (ok) {',
    "      if (!C || typeof C.assemble !== 'function') throw new Error('The bundle did not set OrzCarrier.assemble.');",
    '      ok(C.assemble(d.text, { delivery: d.delivery, engineSource: d.engineSource }));',
    '    }).then(function (html) {',
    "      reply({ ok: typeof html === 'string', html: html, kind: String(C.kind), version: String(C.version), error: typeof html === 'string' ? '' : 'assemble returned no string' });",
    '    }, function (err) {',
    "      reply({ ok: false, error: String(err && err.message || err) });",
    '    });',
    '  });',
    '  P.postMessage({ type: "' + BOOT_READY + '" }, "*");',
    '})();',
].join('\n');
/** The srcdoc of the sandbox: the bundle (escaped; script-safe bundles are unchanged) and the listener. */
function sandboxDocument(bundle) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>orz update</title></head><body><script>${(0, read_js_1.escapeScriptText)(bundle)}\n</script><script>${BOOTSTRAP}</script></body></html>`;
}
let requestCounter = 0;
/** Run `OrzCarrier.assemble` from `bundle` in a hidden `sandbox="allow-scripts"` iframe; the iframe is removed in every outcome. */
function runInSandbox(bundle, opts, delivery) {
    let doc;
    try {
        doc = opts.document ?? globalThis.document;
    }
    catch {
        doc = undefined;
    }
    const body = doc?.body;
    let win;
    try {
        win = opts.window ?? (doc?.defaultView ?? (0, types_js_1.globalWindow)());
    }
    catch {
        win = undefined;
    }
    if (!doc || !body || !win || typeof win.addEventListener !== 'function') {
        return Promise.reject(new UpdateError('no-document', 'The update needs a browser page; nothing was changed.'));
    }
    const frame = doc.createElement('iframe');
    // Opaque origin: scripts run, but the bundle cannot reach this page, its storage or its cookies.
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.setAttribute('title', 'orz update');
    frame.setAttribute('style', 'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none');
    frame.srcdoc = sandboxDocument(bundle);
    const id = `u${++requestCounter}`;
    const timeoutMs = typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0 ? opts.timeoutMs : exports.REASSEMBLE_TIMEOUT_MS;
    const w = win;
    return new Promise((resolve, reject) => {
        let done = false;
        const finish = (err, html) => {
            if (done)
                return;
            done = true;
            clearTimeout(timer);
            w.removeEventListener('message', onMessage);
            try {
                frame.remove();
            }
            catch { /* already gone */ }
            if (err)
                reject(err);
            else
                resolve({ html: html });
        };
        const onMessage = (e) => {
            // Only the iframe's own window: another frame, the page itself or an extension cannot answer for it.
            if (done || e.source == null || e.source !== frame.contentWindow)
                return;
            const d = e.data;
            if (typeof d !== 'object' || d === null)
                return;
            if (d.type === BOOT_READY) {
                try {
                    frame.contentWindow.postMessage({ type: BOOT_REQUEST, id, text: opts.text, delivery, engineSource: bundle }, '*');
                }
                catch (err) {
                    finish(new UpdateError('bundle', `The update could not start: ${String(err?.message ?? err)}`));
                }
                return;
            }
            if (d.type !== BOOT_RESULT || d.id !== id)
                return;
            if (d.ok === true && typeof d.html === 'string')
                finish(null, d.html);
            else
                finish(new UpdateError('bundle', `The new version could not assemble the document: ${typeof d.error === 'string' && d.error ? d.error : 'unknown error'}`));
        };
        const timer = setTimeout(() => finish(new UpdateError('timeout', 'The update took too long and was cancelled; nothing was changed.')), timeoutMs);
        w.addEventListener('message', onMessage);
        try {
            body.appendChild(frame);
        }
        catch (err) {
            finish(new UpdateError('no-document', `The update could not start: ${String(err?.message ?? err)}`));
        }
    });
}
/**
 * Re-assemble `text` with a release's shell — transactional, touching nothing
 * in the live page:
 *
 *   1. download the bundle from the hard-coded CDN URL; its SHA-384 must
 *      equal `release.bundle.integrity`, it must be UTF-8 and script-safe;
 *   2. in a hidden `sandbox="allow-scripts"` iframe (opaque origin), call the
 *      bundle's `OrzCarrier.assemble(text, { delivery, engineSource })`;
 *      only messages from that iframe's window are read;
 *   3. accept the html only if `extract(html)` gives exactly `text`, the
 *      kind, the release's version and the delivery;
 *   4. remove the iframe in every outcome.
 *
 * Resolves the new file's html; rejects with an {@link UpdateError}. The
 * caller saves it (`createSaver().save`) and reloads.
 */
async function reassemble(opts) {
    const kind = opts.kind;
    const release = parseManifest(opts.release, kind);
    if (!release)
        throw new UpdateError('manifest', 'The release description is invalid; nothing was changed.');
    if (typeof opts.text !== 'string')
        throw new UpdateError('roundtrip', 'The document text is missing; nothing was changed.');
    const delivery = opts.delivery ?? 'inline';
    if (delivery !== 'inline' && delivery !== 'cdn')
        throw new UpdateError('delivery', 'Unknown delivery; nothing was changed.');
    const url = bundleUrl(release, opts.cdnBase);
    const f = resolveFetch(opts.fetch);
    if (!f)
        throw new UpdateError('download', 'This page cannot download the update; nothing was changed.');
    let bytes;
    try {
        const res = await f(url, { credentials: 'omit', redirect: 'follow' });
        if (!res || !res.ok)
            throw new UpdateError('download', `The update could not be downloaded (HTTP ${res ? res.status : '?'}); nothing was changed.`);
        bytes = new Uint8Array(await res.arrayBuffer());
    }
    catch (e) {
        if (e instanceof UpdateError)
            throw e;
        throw new UpdateError('download', 'The update could not be downloaded (offline?); nothing was changed.');
    }
    if (bytes.length > exports.MAX_BUNDLE_BYTES)
        throw new UpdateError('too-large', 'The update is too large; nothing was changed.');
    const integrity = await sha384Integrity(bytes);
    if (integrity !== release.bundle.integrity) {
        throw new UpdateError('integrity', 'The downloaded update does not match its published fingerprint (sha384); nothing was changed.');
    }
    let bundle;
    try {
        const Dec = globalThis.TextDecoder;
        if (!Dec)
            throw new Error('no TextDecoder');
        bundle = new Dec('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    }
    catch {
        throw new UpdateError('encoding', 'The update is not valid UTF-8; nothing was changed.');
    }
    if (!isScriptSafe(bundle))
        throw new UpdateError('unsafe-bundle', 'The update cannot be inlined safely (it holds "<script" or a CR); nothing was changed.');
    const { html } = await runInSandbox(bundle, opts, delivery);
    const back = (0, read_js_1.extract)(html);
    if (!back || back.text !== opts.text) {
        throw new UpdateError('roundtrip', 'The new version would change the document text, so the update was cancelled; nothing was changed.');
    }
    if (back.kind !== kind)
        throw new UpdateError('kind', `The new version made a "${back.kind}" file instead of "${kind}"; nothing was changed.`);
    if (back.shell !== release.version)
        throw new UpdateError('version', `The new version reports shell "${back.shell}" instead of ${release.version}; nothing was changed.`);
    if (back.delivery !== delivery)
        throw new UpdateError('delivery', `The new version wrote delivery "${back.delivery}" instead of "${delivery}"; nothing was changed.`);
    return html;
}
const CHANGED = 'The document changed while the update ran, so nothing was saved; try again.';
/**
 * check → reassemble → re-read the text → `saver.save({ text, html })`.
 * Never rejects and never reloads; `reload` says whether the caller may.
 * Refused (`failed`, nothing saved) when the page is framed or hosted
 * (`hosted`), the update is refused (an {@link UpdateError} code), or the
 * text changed while it ran (`changed`). On `served-notice` the caller
 * offers `saver.download`.
 */
async function performUpdate(opts) {
    const info = opts.info ?? (await checkForUpdate(opts));
    if (!info)
        return { status: 'up-to-date' };
    const fail = (code, error) => ({ status: 'failed', info, code, error });
    let hosted;
    try {
        hosted = notChecked({ ...opts, servedPages: true });
    }
    catch {
        hosted = null;
    }
    if (hosted)
        return fail('hosted', 'This document is embedded in an app, which updates it; nothing was changed.');
    const read = () => {
        if (typeof opts.getText === 'function') {
            try {
                const t = opts.getText();
                return typeof t === 'string' ? t : undefined;
            }
            catch {
                return undefined;
            }
        }
        return opts.text;
    };
    const text = read();
    if (typeof text !== 'string')
        return fail('roundtrip', 'The document text is missing; nothing was changed.');
    let html;
    try {
        html = await reassemble({ ...opts, text, release: info.manifest, kind: info.kind });
    }
    catch (e) {
        const code = e instanceof UpdateError ? e.code : 'bundle';
        return fail(code, String(e?.message ?? e));
    }
    if (read() !== text)
        return fail('changed', CHANGED);
    let save;
    try {
        save = await opts.saver.save({ text, html, ...(typeof opts.theme === 'string' ? { theme: opts.theme } : {}) });
    }
    catch (e) {
        save = { via: 'download', ok: false, confirmed: false, error: String(e?.message ?? e) };
    }
    const wroteOpened = save.via === 'host' ? save.ok === true
        : save.via === 'file' ? save.ok === true && save.opened === true
            : false;
    return { status: 'updated', info, html, text, save, reload: wroteOpened && read() === text };
}
//# sourceMappingURL=update.js.map