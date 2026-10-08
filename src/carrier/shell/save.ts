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
import { extract } from '../read.js';
import { KIND_EXTENSIONS, type HostKind } from './protocol.js';
import type { HostConnection } from './file-side.js';
import { globalWindow, openedFileName, pageLocation, type FileHandleLike, type IdbDatabaseLike, type IdbFactoryLike, type IdbRequestLike, type IdbStoreLike, type SaverWindow } from './types.js';

/** FC-18 §5.1: a well-formed uid. (Same pattern as `UID_PATTERN` in the kit core.) */
export const SHELL_UID_PATTERN = /^doc-[0-9a-z]{10,32}$/;

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
 *   saved: it changed on disk since the page opened it (another program, an
 *   agent). The caller asks the reader: replace it (`save(input, { overwrite:
 *   true })`) or download a copy.
 */
export type SaveResult =
  | { via: 'host'; ok: boolean; error?: string }
  | { via: 'file'; ok: boolean; error?: string; picked: boolean; opened: boolean; name?: string; conflict?: true }
  | { via: 'download'; ok: boolean; error?: string; confirmed: false; name?: string }
  | { via: 'served-notice' };

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

export const HANDLE_DB = 'orz-carrier';
export const HANDLE_STORE = 'handles';

/** The IndexedDB handle store (structured clone keeps a real `FileSystemFileHandle`). */
export function createIndexedDbHandleStore(factory?: IdbFactoryLike): HandleStore {
  const resolveFactory = (): IdbFactoryLike | undefined => {
    if (factory) return factory;
    try {
      return (globalThis as { indexedDB?: IdbFactoryLike }).indexedDB;
    } catch {
      return undefined;
    }
  };
  const run = async (mode: 'readonly' | 'readwrite', body: (store: IdbStoreLike) => IdbRequestLike): Promise<unknown> => {
    const idb = resolveFactory();
    if (!idb) return undefined;
    let db: IdbDatabaseLike;
    try {
      db = await new Promise((resolve, reject) => {
        const req = idb.open(HANDLE_DB, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(HANDLE_STORE)) req.result.createObjectStore(HANDLE_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('blocked'));
      });
    } catch {
      return undefined;
    }
    try {
      return await new Promise<unknown>((resolve) => {
        const tx = db.transaction(HANDLE_STORE, mode);
        const req = body(tx.objectStore(HANDLE_STORE));
        let value: unknown;
        req.onsuccess = () => { value = req.result; if (mode === 'readonly') resolve(value); };
        req.onerror = () => resolve(undefined);
        tx.oncomplete = () => resolve(value);
        tx.onabort = () => resolve(undefined);
        tx.onerror = () => resolve(undefined);
      });
    } catch {
      return undefined;
    } finally {
      try { db.close(); } catch { /* best effort */ }
    }
  };
  return {
    async get(key) {
      const v = await run('readonly', (s) => s.get(key));
      if (typeof v !== 'object' || v === null) return undefined;
      const h = (v as { handle?: unknown }).handle;
      if (typeof h !== 'object' || h === null) return undefined;
      return v as StoredHandle;
    },
    async put(key, value) { await run('readwrite', (s) => s.put(value, key)); },
    async delete(key) { await run('readwrite', (s) => s.delete(key)); },
  };
}

function isServed(win: SaverWindow): boolean {
  const p = win.location?.protocol;
  return p === 'http:' || p === 'https:';
}

function errorName(e: unknown): string {
  return typeof e === 'object' && e !== null && typeof (e as { name?: unknown }).name === 'string' ? (e as { name: string }).name : '';
}

function message(e: unknown): string {
  if (typeof e === 'object' && e !== null && typeof (e as { message?: unknown }).message === 'string') return (e as { message: string }).message;
  return String(e);
}

/** A handle's file as text (exact: no BOM is stripped), or null when it cannot be read. */
async function readText(h: FileHandleLike): Promise<string | null> {
  try {
    if (typeof h.getFile !== 'function') return null;
    const f = await h.getFile();
    const Dec = (globalThis as { TextDecoder?: new (l: string, o: { ignoreBOM: boolean }) => { decode(b: Uint8Array): string } }).TextDecoder;
    if (typeof f.arrayBuffer === 'function' && Dec) return new Dec('utf-8', { ignoreBOM: true }).decode(new Uint8Array(await f.arrayBuffer()));
    const t = await f.text();
    return typeof t === 'string' ? t : null;
  } catch {
    return null;
  }
}

/** SHA-256 (hex) of a text's UTF-8 bytes, or undefined without SubtleCrypto. */
async function sha256Hex(text: string): Promise<string | undefined> {
  try {
    const g = globalThis as { crypto?: { subtle?: { digest(a: string, d: Uint8Array): Promise<ArrayBuffer> } }; TextEncoder?: new () => { encode(s: string): Uint8Array } };
    if (!g.crypto?.subtle || !g.TextEncoder) return undefined;
    const d = new Uint8Array(await g.crypto.subtle.digest('SHA-256', new g.TextEncoder().encode(text)));
    let hex = '';
    for (const b of d) hex += (b < 16 ? '0' : '') + b.toString(16);
    return hex;
  } catch {
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
export function headerUidOf(text: string): string | undefined {
  const m = /^\uFEFF?[ \t\r\n]*\{\{nyml(?![A-Za-z0-9_-])([^\r\n]*)(?:\r\n|\r|\n)([\s\S]*?)\}\}/.exec(text);
  if (!m) return undefined;
  const lines = [m[1], ...m[2].split(/\r\n|\r|\n/)];
  for (let i = 0; i < lines.length; i++) {
    const u = /^[ \t]*uid[ \t]*[:\uFF1A][ \t]*(.*?)[ \t]*$/.exec(i === 0 ? lines[0].replace(/^[ \t]*kind[ \t]*:[ \t]*document[ \t]*/, '') : lines[i]);
    if (!u || (i > 0 && /^[ \t]/.test(lines[i]))) continue;
    let v = u[1];
    if (v === '|' || v === '|-' || v === '>') v = (lines[i + 1] ?? '').trim();
    else if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) v = v.slice(1, -1);
    return SHELL_UID_PATTERN.test(v) ? v : undefined;
  }
  return undefined;
}

/** The parts of an orz file a save keeps: its text, resolved includes and delivery (what "the same file" means for a conflict). */
interface FileContent { text: string; includes: string; delivery: string }

/** An orz file's content (`extract`), or null for anything else. Includes compare as sorted entries. */
function contentOf(html: string | null | undefined): FileContent | null {
  if (typeof html !== 'string') return null;
  try {
    const x = extract(html);
    if (!x) return null;
    const inc = x.includes ? Object.keys(x.includes).sort().map((k) => [k, x.includes![k]]) : [];
    return { text: x.text, includes: inc.length ? JSON.stringify(inc) : '', delivery: x.delivery };
  } catch {
    return null;
  }
}

const sameContent = (a: FileContent | null, b: FileContent | null): boolean =>
  !!a && !!b && a.text === b.text && a.includes === b.includes && a.delivery === b.delivery;

const DESCRIPTIONS: Record<HostKind, string> = {
  md: 'orz document',
  slides: 'orz slides',
  paged: 'orz paged document',
  poster: 'orz poster',
};

export function createSaver(opts: SaverOptions): Saver {
  const winOf = (): SaverWindow => opts.window ?? globalWindow<SaverWindow>() ?? {};
  const store = (): HandleStore => {
    if (opts.handleStore) return opts.handleStore;
    let factory: IdbFactoryLike | undefined;
    try { factory = winOf().indexedDB; } catch { /* opaque origin: no IndexedDB */ }
    return createIndexedDbHandleStore(factory);
  };

  const key = (): string | null => {
    const loc = winOf().location;
    if (typeof opts.uid === 'string' && SHELL_UID_PATTERN.test(opts.uid)) {
      // one record per document AND page: a copy elsewhere (same uid) keeps its own record
      const here = pageLocation(loc);
      return here === undefined ? opts.uid : `${opts.uid} ${here}`;
    }
    const href = loc?.href;
    return href ? href.replace(/#.*$/s, '') : null;
  };

  const download = async (html: string): Promise<SaveResult> => {
    const win = winOf();
    try {
      const doc = win.document;
      const BlobCtor = win.Blob ?? (globalThis as { Blob?: SaverWindow['Blob'] }).Blob;
      const urls = win.URL ?? (globalThis as { URL?: SaverWindow['URL'] }).URL;
      if (!doc || !doc.body || !BlobCtor || !urls?.createObjectURL) return { via: 'download', ok: false, confirmed: false, error: 'Downloads are not available here.' };
      const url = urls.createObjectURL(new BlobCtor([html], { type: 'text/html;charset=utf-8' }));
      const a = doc.createElement('a');
      a.href = url;
      a.download = opts.suggestedName;
      a.rel = 'noopener';
      doc.body.appendChild(a);
      a.click();
      a.remove();
      const later = win.setTimeout ? win.setTimeout.bind(win) : setTimeout;
      later(() => { try { urls.revokeObjectURL(url); } catch { /* ignore */ } }, 1000);
      return { via: 'download', ok: true, confirmed: false, name: opts.suggestedName };
    } catch (e) {
      return { via: 'download', ok: false, confirmed: false, error: message(e) };
    }
  };

  // ── proving which file a handle points at (content, never names) ──────
  let openedMemo: Promise<string | undefined> | null = null;
  /** The opened file's bytes as text, or undefined when the caller did not say (a failure is not kept: tried again next time). */
  const openedBytes = (): Promise<string | undefined> => {
    if (openedMemo) return openedMemo;
    const run = (async () => {
      const src = opts.openedHtml;
      try {
        const v = typeof src === 'function' ? await src() : src;
        return typeof v === 'string' ? v : undefined;
      } catch {
        return undefined;
      }
    })();
    openedMemo = run;
    void run.then((v) => { if (v === undefined && openedMemo === run && typeof opts.openedHtml === 'function') openedMemo = null; });
    return run;
  };

  /** This page's handle: later saves never prompt while the file still holds what this page wrote last. */
  let session: { handle: FileHandleLike; opened: boolean; last: string } | null = null;
  /** What this page last wrote through any handle (kept when the session handle is dropped). */
  let lastWritten: string | null = null;
  /** The file picked for a save that found it changed on disk: `overwrite` writes it without a second picker. */
  let conflicted: FileHandleLike | null = null;

  /** The opened file's content (`extract` of the opened bytes), once per opened bytes. */
  let openedContent: { of: string; content: FileContent | null } | null = null;
  const contentOfOpened = (mine: string): FileContent | null => {
    if (openedContent?.of !== mine) openedContent = { of: mine, content: contentOf(mine) };
    return openedContent.content;
  };
  const uidOf = (text: string): string | undefined => {
    try {
      const u = opts.readUid ? opts.readUid(text) : headerUidOf(text);
      return typeof u === 'string' && SHELL_UID_PATTERN.test(u) ? u : undefined;
    } catch {
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
   * changed on disk since the page opened it. Needs the opened bytes (without
   * them nothing is known).
   */
  const changedOnDisk = (before: string | null, mine: string | undefined, html: string): boolean => {
    if (before === null || mine === undefined || before === mine || before === lastWritten || before === html) return false;
    const disk = contentOf(before);
    if (!disk) return false;
    const mineUid = typeof opts.uid === 'string' && SHELL_UID_PATTERN.test(opts.uid) ? opts.uid : undefined;
    const diskUid = uidOf(disk.text);
    if (mineUid && diskUid && diskUid !== mineUid) return false; // another document
    return !sameContent(disk, contentOfOpened(mine)) && !sameContent(disk, contentOf(lastWritten)) && !sameContent(disk, contentOf(html));
  };

  /** A remembered handle proved to be the opened file, or null. */
  const remembered = async (k: string, win: SaverWindow): Promise<FileHandleLike | null> => {
    const stored = await store().get(k);
    if (!stored || typeof stored.handle.createWritable !== 'function') return null;
    // A copy of the file carries the same uid, and every file: page shares one IndexedDB:
    // reuse a handle only on the page it was picked on (a record without a location, or a
    // page without one, gets the picker), and never write over a file with another name.
    const here = pageLocation(win.location);
    if (here === undefined || stored.location !== here) return null;
    const opened = openedFileName(win.location);
    const name = stored.handle.name ?? stored.name;
    if (opened !== undefined && name !== undefined && name !== opened) return null;
    // A name proves nothing (a save-as into another folder keeps it): the file must hold
    // the opened file's bytes. Whoever wrote them last (this page, or a CLI that assembled
    // the same text again: B#8) does not matter — the page was opened from those bytes.
    const mine = await openedBytes();
    if (mine === undefined) return null;
    const h = stored.handle;
    try {
      let granted = !h.queryPermission;
      if (!granted && (await h.queryPermission!({ mode: 'readwrite' })) === 'granted') granted = true;
      if (!granted && h.requestPermission && (await h.requestPermission({ mode: 'readwrite' })) === 'granted') granted = true;
      if (!granted) return null;
    } catch {
      return null; // no user activation, or the entry is gone: the picker
    }
    const now = await readText(h);
    if (now === null || now !== mine) return null;
    return h;
  };

  const write = async (h: FileHandleLike, html: string): Promise<void> => {
    const w = await h.createWritable();
    try {
      await w.write(html);
    } catch (e) {
      try { await w.close(); } catch { /* ignore */ }
      throw e;
    }
    await w.close();
  };

  const saveToFile = async (html: string, win: SaverWindow, overwrite: boolean): Promise<SaveResult> => {
    const k = key();
    let h: FileHandleLike | null = null;
    let opened = false;
    let picked = false;
    if (overwrite && conflicted) {
      // the reader chose to replace the file that changed on disk: no second picker, no check
      h = conflicted;
      picked = true;
    }
    conflicted = null;
    if (!h && session) {
      // this page's handle, if the file still holds what this page wrote last (or the opened bytes)
      const now = await readText(session.handle);
      if (now !== null && now === session.last) { h = session.handle; opened = session.opened; }
      else if (now !== null && now === (await openedBytes())) { h = session.handle; opened = true; }
      else session = null; // written by someone else since, or unreadable: ask again
    }
    if (!h && k) {
      h = await remembered(k, win);
      if (h) opened = true;
    }
    if (!h) {
      picked = true;
      const ext = KIND_EXTENSIONS[opts.kind] ?? '.html';
      try {
        h = await win.showSaveFilePicker!({
          suggestedName: opts.suggestedName,
          types: [{ description: DESCRIPTIONS[opts.kind] ?? 'orz document', accept: { 'text/html': ext === '.html' ? ['.html'] : [ext, '.html'] } }],
        });
      } catch (e) {
        if (errorName(e) === 'AbortError') return { via: 'file', ok: false, error: 'cancelled', picked: true, opened: false };
        return download(html); // the picker is unusable here (no user activation, policy): download
      }
      // the picked file is the opened one only if it holds the opened file's bytes
      const mine = await openedBytes();
      const before = mine === undefined ? null : await readText(h);
      opened = before !== null && before === mine;
      // this document's file, changed on disk since the page opened it: never written silently
      if (!overwrite && changedOnDisk(before, mine, html)) {
        conflicted = h;
        return { via: 'file', ok: false, error: 'conflict', conflict: true, picked: true, opened: false, ...(typeof h.name === 'string' ? { name: h.name } : {}) };
      }
    }
    try {
      await write(h, html);
    } catch {
      session = null;
      return download(html); // the write failed: keep the user's work as a download
    }
    session = { handle: h, opened, last: html };
    lastWritten = html;
    if (k && opened) {
      // remember only a handle proved to be this page's file, with what was written through it
      const location = pageLocation(win.location);
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
      if (typeof input?.html !== 'string' || typeof input.text !== 'string') return { via: 'download', ok: false, confirmed: false, error: 'text and html must be strings.' };
      if (opts.host && opts.host.connected()) {
        const ack = await opts.host.save({ source: input.text, html: input.html, ...(typeof input.theme === 'string' ? { theme: input.theme } : {}) });
        return ack.ok ? { via: 'host', ok: true } : { via: 'host', ok: false, error: ack.error ?? 'The host could not save.' };
      }
      const win = winOf();
      if (isServed(win) && !session && opts.servedNotice !== false) return { via: 'served-notice' };
      if (typeof win.showSaveFilePicker === 'function') return saveToFile(input.html, win, call?.overwrite === true);
      return download(input.html);
    },
    download: (input) => download(input.html),
    handleKey: key,
  };
}
