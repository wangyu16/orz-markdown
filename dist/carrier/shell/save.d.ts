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
import { type HostKind } from './protocol.js';
import type { HostConnection } from './file-side.js';
import { type FileHandleLike, type IdbFactoryLike, type SaverWindow } from './types.js';
/** FC-18 §5.1: a well-formed uid. (Same pattern as `UID_PATTERN` in the kit core.) */
export declare const SHELL_UID_PATTERN: RegExp;
export type SaveResult = {
    via: 'host' | 'file' | 'download';
    ok: boolean;
    error?: string;
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
    /** The header `uid` (FC-18 §10); the handle key. Absent or malformed → the page URL. */
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
    /** The handle key in use: the uid, or the page URL without its fragment. */
    handleKey(): string | null;
}
/** What is remembered per key. */
export interface StoredHandle {
    handle: FileHandleLike;
    name?: string;
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