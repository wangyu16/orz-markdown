"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HANDLE_STORE = exports.HANDLE_DB = exports.SHELL_UID_PATTERN = void 0;
exports.createIndexedDbHandleStore = createIndexedDbHandleStore;
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
    /** The opened file's bytes as text, or undefined when the caller did not say. */
    const openedBytes = () => {
        openedMemo ?? (openedMemo = (async () => {
            const src = opts.openedHtml;
            try {
                const v = typeof src === 'function' ? await src() : src;
                return typeof v === 'string' ? v : undefined;
            }
            catch {
                return undefined;
            }
        })());
        return openedMemo;
    };
    /** This page's handle: later saves never prompt while the file still holds what this page wrote last. */
    let session = null;
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
        // the opened file's bytes — and, when the record says, what was last written through it.
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
        if (typeof stored.sha256 === 'string') {
            const sum = await sha256Hex(now);
            if (sum !== undefined && sum !== stored.sha256)
                return null;
        }
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
    const saveToFile = async (html, win) => {
        const k = key();
        let h = null;
        let opened = false;
        let picked = false;
        if (session) {
            // this page's handle, if the file still holds what this page wrote last (or the opened bytes)
            const now = await readText(session.handle);
            if (now !== null && now === session.last) {
                h = session.handle;
                opened = session.opened;
            }
            else if (now !== null && now === (await openedBytes())) {
                h = session.handle;
                opened = true;
            }
            else
                session = null; // written by someone else since, or unreadable: ask again
        }
        if (!h && k) {
            h = await remembered(k, win);
            if (h)
                opened = true;
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
        }
        try {
            await write(h, html);
        }
        catch {
            session = null;
            return download(html); // the write failed: keep the user's work as a download
        }
        session = { handle: h, opened, last: html };
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
        async save(input) {
            if (typeof input?.html !== 'string' || typeof input.text !== 'string')
                return { via: 'download', ok: false, confirmed: false, error: 'text and html must be strings.' };
            if (opts.host && opts.host.connected()) {
                const ack = await opts.host.save({ source: input.text, html: input.html, ...(typeof input.theme === 'string' ? { theme: input.theme } : {}) });
                return ack.ok ? { via: 'host', ok: true } : { via: 'host', ok: false, error: ack.error ?? 'The host could not save.' };
            }
            const win = winOf();
            if (isServed(win) && !session)
                return { via: 'served-notice' };
            if (typeof win.showSaveFilePicker === 'function')
                return saveToFile(input.html, win);
            return download(input.html);
        },
        download: (input) => download(input.html),
        handleKey: key,
    };
}
//# sourceMappingURL=save.js.map