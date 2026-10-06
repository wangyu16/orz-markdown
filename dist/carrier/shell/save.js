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
 *      `uid`, else the page URL; a second save overwrites silently)
 *                                                   → { via: 'file', ok }
 *   4. a download of `suggestedName`               → { via: 'download', ok }
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
/** The file name the page was opened from (file: URLs only). */
function openedFileName(win) {
    const loc = win.location;
    if (!loc || loc.protocol !== 'file:')
        return undefined;
    const last = loc.pathname.split('/').pop();
    if (!last)
        return undefined;
    try {
        return decodeURIComponent(last);
    }
    catch {
        return last;
    }
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
    let handle = null; // this session's handle: later saves never prompt
    const key = () => {
        if (typeof opts.uid === 'string' && exports.SHELL_UID_PATTERN.test(opts.uid))
            return opts.uid;
        const href = winOf().location?.href;
        return href ? href.replace(/#.*$/s, '') : null;
    };
    const download = async (html) => {
        const win = winOf();
        try {
            const doc = win.document;
            const BlobCtor = win.Blob ?? globalThis.Blob;
            const urls = win.URL ?? globalThis.URL;
            if (!doc || !doc.body || !BlobCtor || !urls?.createObjectURL)
                return { via: 'download', ok: false, error: 'Downloads are not available here.' };
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
            return { via: 'download', ok: true };
        }
        catch (e) {
            return { via: 'download', ok: false, error: message(e) };
        }
    };
    /** A remembered handle we may write without a picker, or null. */
    const remembered = async (k, win) => {
        const stored = await store().get(k);
        if (!stored || typeof stored.handle.createWritable !== 'function')
            return null;
        // A copy of the file carries the same uid: never write over a file with another name.
        const opened = openedFileName(win);
        const name = stored.handle.name ?? stored.name;
        if (opened !== undefined && name !== undefined && name !== opened)
            return null;
        const h = stored.handle;
        try {
            if (!h.queryPermission)
                return h;
            if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted')
                return h;
            if (h.requestPermission && (await h.requestPermission({ mode: 'readwrite' })) === 'granted')
                return h;
        }
        catch {
            /* no user activation, or the entry is gone: fall through to the picker */
        }
        return null;
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
        let h = handle;
        if (!h && k)
            h = await remembered(k, win);
        if (!h) {
            const ext = protocol_js_1.KIND_EXTENSIONS[opts.kind] ?? '.html';
            try {
                h = await win.showSaveFilePicker({
                    suggestedName: opts.suggestedName,
                    types: [{ description: DESCRIPTIONS[opts.kind] ?? 'orz document', accept: { 'text/html': ext === '.html' ? ['.html'] : [ext, '.html'] } }],
                });
            }
            catch (e) {
                if (errorName(e) === 'AbortError')
                    return { via: 'file', ok: false, error: 'cancelled' };
                return download(html); // the picker is unusable here (no user activation, policy): download
            }
            if (k)
                await store().put(k, { handle: h, ...(typeof h.name === 'string' ? { name: h.name } : {}) });
        }
        handle = h;
        try {
            await write(h, html);
            return { via: 'file', ok: true };
        }
        catch {
            return download(html); // the write failed: keep the user's work as a download
        }
    };
    return {
        async save(input) {
            if (typeof input?.html !== 'string' || typeof input.text !== 'string')
                return { via: 'download', ok: false, error: 'text and html must be strings.' };
            if (opts.host && opts.host.connected()) {
                const ack = await opts.host.save({ source: input.text, html: input.html, ...(typeof input.theme === 'string' ? { theme: input.theme } : {}) });
                return ack.ok ? { via: 'host', ok: true } : { via: 'host', ok: false, error: ack.error ?? 'The host could not save.' };
            }
            const win = winOf();
            if (isServed(win) && !handle)
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