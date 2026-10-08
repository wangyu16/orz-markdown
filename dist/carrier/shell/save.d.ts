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
 *   file is an orz file of this document (the same header `uid`, or no uid on
 *   either side) whose content — text, resolved includes and delivery — is
 *   neither the opened file's, what this page last wrote, nor what is being
 *   saved, or that holds the same content in a newer shell than the one being
 *   saved (round 3: an agent's `upgrade`): it changed on disk since the page
 *   opened it (another program, an agent). Also (round 3, `picked: false`):
 *   the session's file holds the opened bytes again over this page's own
 *   save (someone reverted it); round 4 (F4): also a remembered handle's
 *   file holding the opened bytes again over what this page wrote into the
 *   opened file. The caller asks the reader: replace it
 *   (`save(input, { overwrite: true, conflictToken })`) or download a copy.
 *   `conflictToken` (round 4, F2) names this conflict: only an `overwrite`
 *   carrying the token of the conflict still pending is honoured.
 * - `file` with `error: 'stale-conflict'` (round 4, F2): an `overwrite` that
 *   answers no pending conflict (none, or a newer one superseded it) —
 *   nothing was written and nothing was checked.
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
    conflictToken?: number;
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
     * `conflict` result): the file of that save is written without the check
     * (no second picker) — only with the `conflictToken` of that result while
     * it is the conflict still pending (round 4, F2: a later save, conflicting
     * or not, supersedes it). Otherwise nothing is written: `{ via: 'file', ok:
     * false, error: 'stale-conflict' }` — an `overwrite` never writes a file
     * the saver did not just find in conflict.
     */
    overwrite?: boolean;
    /** The `conflictToken` of the conflict an `overwrite` answers (round 4, F2). */
    conflictToken?: number;
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
     * (FC-18 law 3). A string, or a function (sync or async) called when a
     * handle has to be proved, until it gives a string (that string is kept; a
     * rejection or a non-string is not, so a failed assembly is tried again at
     * the next save and never disables the conflict check of step 3.4). It is
     * how a handle is proved to point at
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
    /**
     * The header `uid` of a text (2.2.0, round 2 of the carrier-app loop): how
     * the conflict check (step 3.4) reads the uid of the file on disk. Pass the
     * reader the page reads its own uid with (the kit's `readHeader(text)
     * .fields.uid`, well-formed), so both sides agree on quoted, block-scalar
     * and other header forms. Default: {@link headerUidOf} (parser-free).
     */
    readUid?(text: string): string | undefined;
    /**
     * The bytes of a file whose content this page also knows (round 4, F5),
     * called only when a picked file would otherwise be a conflict: an app's
     * editor given newer includes (`refreshPreview({ includes })`) passes the
     * opened text assembled with them — a file on disk holding that content
     * (the app's server resolved the includes again) is no change. It counts
     * like the opened content for step 3.4 only; it never proves a handle to be
     * the opened file. A rejection or a non-string is nothing known.
     */
    knownHtml?: () => string | undefined | null | Promise<string | undefined | null>;
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
 * The `uid` of an FC-18 header at the start of a text, or undefined — a
 * parser-free reading of the first `{{nyml` block (after a BOM and blank
 * lines; a `kind: document` on the opener line is allowed): a top-level
 * `uid:` line whose value — unquoted (`"…"`, `'…'`), or the first line of a
 * `|` block — is a well-formed uid. Enough to tell whether a file on disk is
 * this document when the caller does not pass its own reader
 * (`createSaver({ readUid })`); the kit's `readHeader` is the reference.
 */
export declare function headerUidOf(text: string): string | undefined;
export declare function createSaver(opts: SaverOptions): Saver;
//# sourceMappingURL=save.d.ts.map