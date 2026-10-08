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
 *   not be the file the page was opened from; `opened` — the written file is
 *   proved by its content to be the file this page was opened from (before
 *   the first write of this page it held the opened file's bytes, and every
 *   later write found what this page had written before); `name` — the
 *   written file's name when the browser reports it. Names prove nothing: a
 *   picker that opens in another folder offers the same name.
 * - `download`: a copy handed to the browser (`name` = the suggested name).
 *   `confirmed` is always `false`: the page cannot know whether the download
 *   landed (it may be blocked or cancelled); `ok` means it was started.
 * - `served-notice`: nothing was saved (spec/shell-runtime.md §1 step 2).
 * - `file` with `conflict: true` (2.2.0): nothing was written — the picked
 *   file is an orz file of this document (its header `uid`) whose text is
 *   neither the opened text nor what this page last wrote: it changed on disk
 *   since the page opened it (another program, an agent). The caller asks the
 *   reader: replace it (`save(input, { overwrite: true })`) or download a copy.
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
    opened: boolean;
    name?: string;
    conflict?: true;
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
/** Options of one save (2.2.0). */
export interface SaveCallOptions {
    /**
     * The reader chose to replace a file that changed on disk (after a
     * `conflict` result): the file picked for that save is written without the
     * check (no second picker); with no such file the save runs as usual,
     * without the check.
     */
    overwrite?: boolean;
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
    /**
     * The bytes of the file this page was opened from, as text — for an
     * assembled file, the carrier's `assemble` of the text the page loaded
     * (`readIslandFromDom(#orz-src)` at boot), which reproduces the file
     * (FC-18 law 3). A string, or a function (sync or async) read at most once,
     * when a handle has to be proved. It is how a handle is proved to point at
     * the opened file: without it a remembered handle is never reused across
     * page loads (the picker opens), and no picked file counts as the opened
     * one (`opened: false`, so an update never reloads).
     */
    openedHtml?: string | (() => string | undefined | null | Promise<string | undefined | null>);
    /**
     * Whether a served page (http/https) with no handle gets the served notice
     * (step 2). Default `true`: an assembled file opened from the web cannot be
     * saved over. `false` (2.2.0): the page is not an assembled file (an app's
     * page with an editor and no save hook), so the save goes on to the picker,
     * else a download.
     */
    servedNotice?: boolean;
}
export interface Saver {
    /** Save in the order above. Never rejects. */
    save(input: SaveInput, options?: SaveCallOptions): Promise<SaveResult>;
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
    /**
     * SHA-256 (lowercase hex) of the bytes last written through the handle — a
     * record, not a condition: the handle is reused when its file holds the
     * opened file's bytes, whoever wrote them (a CLI that assembled the same
     * text again writes the file the page then opens; B#8, closed loop 2
     * round 3). A file another tab or tool changed since this page opened it no
     * longer holds the opened bytes and gets the picker.
     */
    sha256?: string;
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
/**
 * The `uid` of an FC-18 header at the start of a text (`{{nyml` … `}}`), or
 * undefined — a parser-free reading, enough to tell whether a file on disk is
 * this document (the shell does not load the kit's header tools).
 */
export declare function headerUidOf(text: string): string | undefined;
export declare function createSaver(opts: SaverOptions): Saver;
//# sourceMappingURL=save.d.ts.map