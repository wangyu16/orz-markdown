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
 *      page; a second save overwrites silently)
 *                                   → { via: 'file', ok, picked, name? }
 *   4. a download of `suggestedName`
 *                                   → { via: 'download', ok, confirmed: false, name }
 *
 * Every browser feature is detected when `save` is called, never at module
 * load, so the module imports safely in Node.
 */
import { type HostKind } from './protocol.js';
import type { HostConnection } from './file-side.js';
import { type FileHandleLike, type IdbFactoryLike, type SaverWindow } from './types.js';
/** FC-18 §5.1: a well-formed uid. (Same pattern as `UID_PATTERN` in the kit core.) */
export declare const SHELL_UID_PATTERN: RegExp;
/**
 * What a save did.
 *
 * - `host`: the connected host acknowledged (`ok`) or refused / timed out.
 * - `file`: written through File System Access. `picked` — a picker was shown
 *   for this save, so the written file is the one the reader chose and may
 *   not be the file the page was opened from; `name` — the written file's
 *   name when the browser reports it.
 * - `download`: a copy handed to the browser (`name` = the suggested name).
 *   `confirmed` is always `false`: the page cannot know whether the download
 *   landed (it may be blocked or cancelled); `ok` means it was started.
 * - `served-notice`: nothing was saved (spec/shell-runtime.md §1 step 2).
 */
export type SaveResult = {
    via: 'host';
    ok: boolean;
    error?: string;
} | {
    via: 'file';
    ok: boolean;
    error?: string;
    picked: boolean;
    name?: string;
} | {
    via: 'download';
    ok: boolean;
    error?: string;
    confirmed: false;
    name?: string;
} | {
    via: 'served-notice';
};
export interface SaveInput {
    /** The text twin, exact (sent to a host as `source`). */
    text: string;
    /** The assembled file (written to disk, downloaded, sent to a host as `html`). */
    html: string;
    /** The current theme id, passed to a host (`orz-host-save` `theme`). */
    theme?: string;
}
export interface SaverOptions {
    /** The header `uid` (FC-18 §10); with the page location, the handle key. Absent or malformed → the page URL. */
    uid?: string;
    /** The file name offered by the picker and used for the download (the twin name). */
    suggestedName: string;
    kind: HostKind;
    host?: HostConnection;
    window?: SaverWindow;
    /** Where handles are remembered (default: IndexedDB database `orz-carrier`, store `handles`). */
    handleStore?: HandleStore;
}
export interface Saver {
    /** Save in the order above. Never rejects. */
    save(input: SaveInput): Promise<SaveResult>;
    /** Download a copy (Export, or the served-page notice's "download a copy"). */
    download(input: Pick<SaveInput, 'html'>): Promise<SaveResult>;
    /** The handle key in use: `<uid> <page location>` (the uid alone without a location), or the page URL without its fragment. */
    handleKey(): string | null;
}
/** What is remembered per key. */
export interface StoredHandle {
    handle: FileHandleLike;
    name?: string;
    /**
     * The page the handle was picked on (`pageLocation`: the URL without query
     * and fragment). A remembered handle is reused only by a page at the same
     * location: every `file:` page shares one IndexedDB, so a same-named copy
     * in another folder (same uid) must not write over the original.
     */
    location?: string;
}
/** Best-effort by contract: every method resolves, never rejects. */
export interface HandleStore {
    get(key: string): Promise<StoredHandle | undefined>;
    put(key: string, value: StoredHandle): Promise<void>;
    delete(key: string): Promise<void>;
}
export declare const HANDLE_DB = "orz-carrier";
export declare const HANDLE_STORE = "handles";
/** The IndexedDB handle store (structured clone keeps a real `FileSystemFileHandle`). */
export declare function createIndexedDbHandleStore(factory?: IdbFactoryLike): HandleStore;
export declare function createSaver(opts: SaverOptions): Saver;
//# sourceMappingURL=save.d.ts.map