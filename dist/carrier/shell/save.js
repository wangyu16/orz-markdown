"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HANDLE_STORE = exports.HANDLE_DB = exports.SHELL_UID_PATTERN = void 0;
exports.createIndexedDbHandleStore = createIndexedDbHandleStore;
exports.headerUidOf = headerUidOf;
exports.createSaver = createSaver;
/**
 * The standalone save of an assembled file (spec/shell-runtime.md §1; family
 * contract FC-11). The caller assembles the file (`assembleEnvelope` with the
 * current text) and hands the bytes in; this module NEVER serializes the live
 * DOM. Order:
 *
 *   1. a connected host (`orz-host-save@1`)        → { via: 'host', ok }
 *   2. a served page (http/https) with no handle   → { via: 'served-notice' }
 *   3. File System Access (handle remembered in IndexedDB under the header
 *      `uid` + the page location, else the page URL; reused only on that
 *      page and only when the file it points at is proved by its CONTENT to
 *      be the opened file — it holds the opened file's bytes, or what this
 *      page last wrote through it; a second save then overwrites silently)
 *                                   → { via: 'file', ok, picked, opened, name? }
 *   4. a download of `suggestedName`
 *                                   → { via: 'download', ok, confirmed: false, name }
 *
 * Every browser feature is detected when `save` is called, never at module
 * load, so the module imports safely in Node.
 */
const read_js_1 = require("../read.js");
const update_js_1 = require("./update.js");
const protocol_js_1 = require("./protocol.js");
const types_js_1 = require("./types.js");
/** FC-18 §5.1: a well-formed uid. (Same pattern as `UID_PATTERN` in the kit core.) */
exports.SHELL_UID_PATTERN = /^doc-[0-9a-z]{10,32}$/;
exports.HANDLE_DB = 'orz-carrier';
exports.HANDLE_STORE = 'handles';
/** The IndexedDB handle store (structured clone keeps a real `FileSystemFileHandle`). */
function createIndexedDbHandleStore(factory) {
    const resolveFactory = () => {
        if (factory)
            return factory;
        try {
            return globalThis.indexedDB;
        }
        catch {
            return undefined;
        }
    };
    const run = async (mode, body) => {
        const idb = resolveFactory();
        if (!idb)
            return undefined;
        let db;
        try {
            db = await new Promise((resolve, reject) => {
                const req = idb.open(exports.HANDLE_DB, 1);
                req.onupgradeneeded = () => {
                    if (!req.result.objectStoreNames.contains(exports.HANDLE_STORE))
                        req.result.createObjectStore(exports.HANDLE_STORE);
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
                req.onblocked = () => reject(new Error('blocked'));
            });
        }
        catch {
            return undefined;
        }
        try {
            return await new Promise((resolve) => {
                const tx = db.transaction(exports.HANDLE_STORE, mode);
                const req = body(tx.objectStore(exports.HANDLE_STORE));
                let value;
                req.onsuccess = () => { value = req.result; if (mode === 'readonly')
                    resolve(value); };
                req.onerror = () => resolve(undefined);
                tx.oncomplete = () => resolve(value);
                tx.onabort = () => resolve(undefined);
                tx.onerror = () => resolve(undefined);
            });
        }
        catch {
            return undefined;
        }
        finally {
            try {
                db.close();
            }
            catch { /* best effort */ }
        }
    };
    return {
        async get(key) {
            const v = await run('readonly', (s) => s.get(key));
            if (typeof v !== 'object' || v === null)
                return undefined;
            const h = v.handle;
            if (typeof h !== 'object' || h === null)
                return undefined;
            return v;
        },
        async put(key, value) { await run('readwrite', (s) => s.put(value, key)); },
        async delete(key) { await run('readwrite', (s) => s.delete(key)); },
    };
}
function isServed(win) {
    const p = win.location?.protocol;
    return p === 'http:' || p === 'https:';
}
function errorName(e) {
    return typeof e === 'object' && e !== null && typeof e.name === 'string' ? e.name : '';
}
function message(e) {
    if (typeof e === 'object' && e !== null && typeof e.message === 'string')
        return e.message;
    return String(e);
}
/** A handle's file as text (exact: no BOM is stripped), or null when it cannot be read. */
async function readText(h) {
    try {
        if (typeof h.getFile !== 'function')
            return null;
        const f = await h.getFile();
        const Dec = globalThis.TextDecoder;
        if (typeof f.arrayBuffer === 'function' && Dec)
            return new Dec('utf-8', { ignoreBOM: true }).decode(new Uint8Array(await f.arrayBuffer()));
        const t = await f.text();
        return typeof t === 'string' ? t : null;
    }
    catch {
        return null;
    }
}
/** SHA-256 (hex) of a text's UTF-8 bytes, or undefined without SubtleCrypto. */
async function sha256Hex(text) {
    try {
        const g = globalThis;
        if (!g.crypto?.subtle || !g.TextEncoder)
            return undefined;
        const d = new Uint8Array(await g.crypto.subtle.digest('SHA-256', new g.TextEncoder().encode(text)));
        let hex = '';
        for (const b of d)
            hex += (b < 16 ? '0' : '') + b.toString(16);
        return hex;
    }
    catch {
        return undefined;
    }
}
/**
 * The `uid` of an FC-18 header at the start of a text, or undefined — a
 * parser-free reading of the first `{{nyml` block (after a BOM and blank
 * lines; a `kind: document` on the opener line is allowed): a top-level
 * `uid:` line whose value — unquoted (`"…"`, `'…'`), or the first line of a
 * `|` block — is a well-formed uid. Enough to tell whether a file on disk is
 * this document when the caller does not pass its own reader
 * (`createSaver({ readUid })`); the kit's `readHeader` is the reference.
 */
function headerUidOf(text) {
    const m = /^\uFEFF?[ \t\r\n]*\{\{nyml(?![A-Za-z0-9_-])([^\r\n]*)(?:\r\n|\r|\n)([\s\S]*?)\}\}/.exec(text);
    if (!m)
        return undefined;
    const lines = [m[1], ...m[2].split(/\r\n|\r|\n/)];
    for (let i = 0; i < lines.length; i++) {
        const u = /^[ \t]*uid[ \t]*[:\uFF1A][ \t]*(.*?)[ \t]*$/.exec(i === 0 ? lines[0].replace(/^[ \t]*kind[ \t]*:[ \t]*document[ \t]*/, '') : lines[i]);
        if (!u || (i > 0 && /^[ \t]/.test(lines[i])))
            continue;
        let v = u[1];
        if (v === '|' || v === '|-' || v === '>')
            v = (lines[i + 1] ?? '').trim();
        else if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0])
            v = v.slice(1, -1);
        return exports.SHELL_UID_PATTERN.test(v) ? v : undefined;
    }
    return undefined;
}
/** An orz file's content (`extract`), or null for anything else. Includes compare as sorted entries. */
function contentOf(html) {
    if (typeof html !== 'string')
        return null;
    try {
        const x = (0, read_js_1.extract)(html);
        if (!x)
            return null;
        const inc = x.includes ? Object.keys(x.includes).sort().map((k) => [k, x.includes[k]]) : [];
        return { text: x.text, includes: inc.length ? JSON.stringify(inc) : '', delivery: x.delivery, shell: x.shell };
    }
    catch {
        return null;
    }
}
const sameContent = (a, b) => !!a && !!b && a.text === b.text && a.includes === b.includes && a.delivery === b.delivery;
/** `a`'s shell version is newer than `b`'s (both semver; anything else is not newer). */
const newerShell = (a, b) => !!a && !!b && (0, update_js_1.compareSemver)(a.shell, b.shell) === 1;
const DESCRIPTIONS = {
    md: 'orz document',
    slides: 'orz slides',
    paged: 'orz paged document',
    poster: 'orz poster',
};
function createSaver(opts) {
    const winOf = () => opts.window ?? (0, types_js_1.globalWindow)() ?? {};
    const store = () => {
        if (opts.handleStore)
            return opts.handleStore;
        let factory;
        try {
            factory = winOf().indexedDB;
        }
        catch { /* opaque origin: no IndexedDB */ }
        return createIndexedDbHandleStore(factory);
    };
    const key = () => {
        const loc = winOf().location;
        if (typeof opts.uid === 'string' && exports.SHELL_UID_PATTERN.test(opts.uid)) {
            // one record per document AND page: a copy elsewhere (same uid) keeps its own record
            const here = (0, types_js_1.pageLocation)(loc);
            return here === undefined ? opts.uid : `${opts.uid} ${here}`;
        }
        const href = loc?.href;
        return href ? href.replace(/#.*$/s, '') : null;
    };
    const download = async (html) => {
        const win = winOf();
        try {
            const doc = win.document;
            const BlobCtor = win.Blob ?? globalThis.Blob;
            const urls = win.URL ?? globalThis.URL;
            if (!doc || !doc.body || !BlobCtor || !urls?.createObjectURL)
                return { via: 'download', ok: false, confirmed: false, error: 'Downloads are not available here.' };
            const url = urls.createObjectURL(new BlobCtor([html], { type: 'text/html;charset=utf-8' }));
            const a = doc.createElement('a');
            a.href = url;
            a.download = opts.suggestedName;
            a.rel = 'noopener';
            doc.body.appendChild(a);
            a.click();
            a.remove();
            const later = win.setTimeout ? win.setTimeout.bind(win) : setTimeout;
            later(() => { try {
                urls.revokeObjectURL(url);
            }
            catch { /* ignore */ } }, 1000);
            return { via: 'download', ok: true, confirmed: false, name: opts.suggestedName };
        }
        catch (e) {
            return { via: 'download', ok: false, confirmed: false, error: message(e) };
        }
    };
    // ── proving which file a handle points at (content, never names) ──────
    let openedMemo = null;
    /** The opened file's bytes as text, or undefined when the caller did not say (a failure is not kept: tried again next time). */
    const openedBytes = () => {
        if (openedMemo)
            return openedMemo;
        const run = (async () => {
            const src = opts.openedHtml;
            try {
                const v = typeof src === 'function' ? await src() : src;
                return typeof v === 'string' ? v : undefined;
            }
            catch {
                return undefined;
            }
        })();
        openedMemo = run;
        void run.then((v) => { if (v === undefined && openedMemo === run && typeof opts.openedHtml === 'function')
            openedMemo = null; });
        return run;
    };
    /** This page's handle: later saves never prompt while the file still holds what this page wrote last. */
    let session = null;
    /** What this page last wrote through any handle (kept when the session handle is dropped). */
    let lastWritten = null;
    /** What this page last wrote into a file proved to be the opened one (the revert check of a remembered handle, F4). */
    let lastWrittenOpened = null;
    /**
     * The pending conflict: the file of the save that found it changed on disk (and whether it was
     * picked, or proved opened) with its token — `overwrite` with that token writes it without a
     * second picker. Any later save supersedes it (round 4, F2).
     */
    let conflicted = null;
    let conflictTokens = 0;
    /** A conflict on `handle`: nothing written; it is now the pending one, under a new token. */
    const conflictOn = (handle, picked, opened) => {
        conflicted = { handle, picked, opened, token: ++conflictTokens };
        return { via: 'file', ok: false, error: 'conflict', conflict: true, picked, opened: false, ...(typeof handle.name === 'string' ? { name: handle.name } : {}), conflictToken: conflicted.token };
    };
    /** The opened file's content (`extract` of the opened bytes), once per opened bytes. */
    let openedContent = null;
    const contentOfOpened = (mine) => {
        if (openedContent?.of !== mine)
            openedContent = { of: mine, content: contentOf(mine) };
        return openedContent.content;
    };
    const uidOf = (text) => {
        try {
            const u = opts.readUid ? opts.readUid(text) : headerUidOf(text);
            return typeof u === 'string' && exports.SHELL_UID_PATTERN.test(u) ? u : undefined;
        }
        catch {
            return undefined;
        }
    };
    /**
     * The picked file's bytes (`before`) are an orz file of this document — its
     * header uid is this saver's, or either side has none (a document without a
     * uid is still this document; only two different well-formed uids are two
     * documents) — whose content (text, includes, delivery: not the raw bytes,
     * so a tool that re-encoded the same file is no change) is neither the
     * opened file's, this page's last write nor the file being saved: it
     * changed on disk since the page opened it. The same content in a NEWER
     * shell than the file being saved is a change too (round 3, L12: an agent
     * ran `upgrade`; writing the page's older shell would undo it) unless this
     * page wrote it. Needs the opened bytes (without them nothing is known).
     */
    const changedOnDisk = (before, mine, html) => {
        if (before === null || mine === undefined || before === mine || before === lastWritten || before === html)
            return false;
        const disk = contentOf(before);
        if (!disk)
            return false;
        const mineUid = typeof opts.uid === 'string' && exports.SHELL_UID_PATTERN.test(opts.uid) ? opts.uid : undefined;
        const diskUid = uidOf(disk.text);
        if (mineUid && diskUid && diskUid !== mineUid)
            return false; // another document
        const last = contentOf(lastWritten);
        const saving = contentOf(html);
        if (!sameContent(disk, contentOfOpened(mine)) && !sameContent(disk, last) && !sameContent(disk, saving))
            return true;
        return newerShell(disk, saving) && !(sameContent(disk, last) && disk.shell === last.shell);
    };
    /**
     * The session's file holds the opened bytes again although this page wrote
     * something else into it since (round 3, F3): someone put the opened
     * version back over this page's save (a revert, `git checkout`, an agent).
     * Asked like any change — unless the opened content is what this page last
     * wrote or is saving (nothing would be lost).
     */
    const revertedOnDisk = (now, html, last = lastWritten) => {
        if (last === null || now === last || now === html)
            return false;
        const disk = contentOf(now);
        return !sameContent(disk, contentOf(last)) && !sameContent(disk, contentOf(html));
    };
    /**
     * The picked file holds content this page knows from `knownHtml` (round 4, F5: the opened text
     * with the includes the page was given since), not in a newer shell than the file being saved.
     */
    const knownOnDisk = async (before, html) => {
        if (before === null || typeof opts.knownHtml !== 'function')
            return false;
        let known;
        try {
            known = await opts.knownHtml();
        }
        catch {
            return false;
        }
        if (typeof known !== 'string')
            return false;
        const disk = contentOf(before);
        return sameContent(disk, contentOf(known)) && !newerShell(disk, contentOf(html));
    };
    /** A remembered handle proved to be the opened file, or null. */
    const remembered = async (k, win) => {
        const stored = await store().get(k);
        if (!stored || typeof stored.handle.createWritable !== 'function')
            return null;
        // A copy of the file carries the same uid, and every file: page shares one IndexedDB:
        // reuse a handle only on the page it was picked on (a record without a location, or a
        // page without one, gets the picker), and never write over a file with another name.
        const here = (0, types_js_1.pageLocation)(win.location);
        if (here === undefined || stored.location !== here)
            return null;
        const opened = (0, types_js_1.openedFileName)(win.location);
        const name = stored.handle.name ?? stored.name;
        if (opened !== undefined && name !== undefined && name !== opened)
            return null;
        // A name proves nothing (a save-as into another folder keeps it): the file must hold
        // the opened file's bytes. Whoever wrote them last (this page, or a CLI that assembled
        // the same text again: B#8) does not matter — the page was opened from those bytes.
        const mine = await openedBytes();
        if (mine === undefined)
            return null;
        const h = stored.handle;
        try {
            let granted = !h.queryPermission;
            if (!granted && (await h.queryPermission({ mode: 'readwrite' })) === 'granted')
                granted = true;
            if (!granted && h.requestPermission && (await h.requestPermission({ mode: 'readwrite' })) === 'granted')
                granted = true;
            if (!granted)
                return null;
        }
        catch {
            return null; // no user activation, or the entry is gone: the picker
        }
        const now = await readText(h);
        if (now === null || now !== mine)
            return null;
        return h;
    };
    const write = async (h, html) => {
        const w = await h.createWritable();
        try {
            await w.write(html);
        }
        catch (e) {
            try {
                await w.close();
            }
            catch { /* ignore */ }
            throw e;
        }
        await w.close();
    };
    const saveToFile = async (html, win, overwrite, token) => {
        const k = key();
        let h = null;
        let opened = false;
        let picked = false;
        if (overwrite) {
            // an answer to a conflict no longer pending (a newer save superseded it, or there is none):
            // nothing is written — an older question's text never goes over a newer save (round 4, F2)
            if (!conflicted || token !== conflicted.token)
                return { via: 'file', ok: false, error: 'stale-conflict', picked: false, opened: false };
            // the reader chose to replace the file that changed on disk: no second picker, no check
            ({ handle: h, picked, opened } = conflicted);
        }
        conflicted = null;
        if (!h && session) {
            // this page's handle, if the file still holds what this page wrote last (or the opened bytes)
            const now = await readText(session.handle);
            if (now !== null && now === session.last) {
                h = session.handle;
                opened = session.opened;
            }
            else if (now !== null && now === (await openedBytes())) {
                // the opened bytes again (m24: proved like any) — but put back over this page's own save: ask (F3)
                if (revertedOnDisk(now, html))
                    return conflictOn(session.handle, false, true);
                h = session.handle;
                opened = true;
            }
            else
                session = null; // written by someone else since, or unreadable: ask again
        }
        if (!h && k) {
            h = await remembered(k, win);
            if (h) {
                opened = true;
                // it holds the opened bytes — put back over what this page wrote into the opened file: ask (F4)
                const mine = await openedBytes();
                if (mine !== undefined && revertedOnDisk(mine, html, lastWrittenOpened))
                    return conflictOn(h, false, true);
            }
        }
        if (!h) {
            picked = true;
            const ext = protocol_js_1.KIND_EXTENSIONS[opts.kind] ?? '.html';
            try {
                h = await win.showSaveFilePicker({
                    suggestedName: opts.suggestedName,
                    types: [{ description: DESCRIPTIONS[opts.kind] ?? 'orz document', accept: { 'text/html': ext === '.html' ? ['.html'] : [ext, '.html'] } }],
                });
            }
            catch (e) {
                if (errorName(e) === 'AbortError')
                    return { via: 'file', ok: false, error: 'cancelled', picked: true, opened: false };
                return download(html); // the picker is unusable here (no user activation, policy): download
            }
            // the picked file is the opened one only if it holds the opened file's bytes
            const mine = await openedBytes();
            const before = mine === undefined ? null : await readText(h);
            opened = before !== null && before === mine;
            // this document's file, changed on disk since the page opened it: never written silently
            if (changedOnDisk(before, mine, html) && !(await knownOnDisk(before, html)))
                return conflictOn(h, true, false);
        }
        try {
            await write(h, html);
        }
        catch {
            session = null;
            return download(html); // the write failed: keep the user's work as a download
        }
        session = { handle: h, opened, last: html };
        lastWritten = html;
        if (opened)
            lastWrittenOpened = html;
        if (k && opened) {
            // remember only a handle proved to be this page's file, with what was written through it
            const location = (0, types_js_1.pageLocation)(win.location);
            const sum = await sha256Hex(html);
            await store().put(k, {
                handle: h,
                ...(typeof h.name === 'string' ? { name: h.name } : {}),
                ...(location !== undefined ? { location } : {}),
                ...(sum !== undefined ? { sha256: sum } : {}),
            });
        }
        return { via: 'file', ok: true, picked, opened, ...(typeof h.name === 'string' ? { name: h.name } : {}) };
    };
    return {
        async save(input, call) {
            if (typeof input?.html !== 'string' || typeof input.text !== 'string')
                return { via: 'download', ok: false, confirmed: false, error: 'text and html must be strings.' };
            if (opts.host && opts.host.connected()) {
                const ack = await opts.host.save({ source: input.text, html: input.html, ...(typeof input.theme === 'string' ? { theme: input.theme } : {}) });
                return ack.ok ? { via: 'host', ok: true } : { via: 'host', ok: false, error: ack.error ?? 'The host could not save.' };
            }
            const win = winOf();
            if (isServed(win) && !session && opts.servedNotice !== false)
                return { via: 'served-notice' };
            if (typeof win.showSaveFilePicker === 'function')
                return saveToFile(input.html, win, call?.overwrite === true, call?.conflictToken);
            return download(input.html);
        },
        download: (input) => download(input.html),
        handleKey: key,
    };
}
//# sourceMappingURL=save.js.map