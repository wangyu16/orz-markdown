/**
 * The shell runtime (`orz-markdown/carrier/shell`, src/carrier/shell/):
 * claims S.1–S.13 in notes/CLAIMS.md; specs spec/shell-runtime.md and
 * spec/host-protocols.md.
 *
 * Two substrates. Decision logic runs against small fakes (windows,
 * pickers, handle stores, storage) with fake timers. What fakes lie about —
 * bytes, cross-origin delivery, targetOrigin filtering, structured clone,
 * IndexedDB, real file handles and downloads — runs in the installed Chrome
 * through playwright-core (`chromium.launch({ channel: 'chrome' })`); those
 * tests skip when Chrome is absent, and the claims they bind are then
 * unverified. The real save picker cannot be automated: the Chrome tests
 * replace `showSaveFilePicker` with a function that returns a REAL
 * `FileSystemFileHandle` from the origin-private file system.
 */
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import http from 'node:http';
import vm from 'node:vm';
import type { AddressInfo } from 'node:net';
import {
  connectHost, embedCarrierFrame, createSaver, createPreferenceStore, preferenceNamespace, READER_PREFERENCES,
  MSG, KIND_EXTENSIONS, HOST_KINDS, SHELL_UID_PATTERN, headerUidOf, SAVE_ACK_TIMEOUT_MS, AI_TIMEOUT_MS, INCLUDE_TIMEOUT_MS, HELLO_INTERVAL_MS, HELLO_MAX_MS,
  type MessageListener, type HandleStore, type StoredHandle, type FileHandleLike, type SaverWindow, type StorageLike, type HostConnection, type SaverOptions,
} from '../src/carrier/shell';
import { assembleEnvelope, extract, readHeader, UID_PATTERN, type ShellParts } from '../src/carrier';

type Msg = Record<string, unknown>;
const HOST = 'https://host.example';
const UID = 'doc-abcdefghij123456';

afterEach(() => {
  vi.useRealTimers();
});

// ── fakes ────────────────────────────────────────────────────────────────

/** A framed file window: `deliver` plays a message event, `sent` records what the file posted to its parent. */
function fakeFrame() {
  const listeners = new Set<MessageListener>();
  const sent: Array<{ msg: Msg; target: string }> = [];
  const parent = { postMessage(msg: unknown, target: string) { sent.push({ msg: structuredClone(msg) as Msg, target }); } };
  const win = {
    parent,
    addEventListener: (_t: 'message', l: MessageListener) => { listeners.add(l); },
    removeEventListener: (_t: 'message', l: MessageListener) => { listeners.delete(l); },
  };
  const deliver = (data: unknown, origin = HOST, source: unknown = parent): void => {
    for (const l of [...listeners]) l({ data, origin, source });
  };
  const types = (): string[] => sent.map((s) => String(s.msg.type));
  return { win, parent, sent, deliver, listeners, types };
}

const hello = { type: MSG.hello, protocol: 'orz-host-save', version: 1 };
const aiHello = { type: MSG.aiHello, protocol: 'orz-host-ai', version: 1, operations: [{ id: 'improve', title: 'Improve', selection: true }] };
const includeHello = { type: MSG.includeHello, protocol: 'orz-host-include', version: 1 };

/** A host window plus an iframe whose contentWindow posts are recorded; `fromFrame` plays a message from the frame. */
function fakeHost(frameOrigin = 'https://file.example') {
  const listeners = new Set<MessageListener>();
  const loads = new Set<() => void>();
  const sent: Array<{ msg: Msg; target: string }> = [];
  const child = { postMessage(msg: unknown, target: string) { sent.push({ msg: structuredClone(msg) as Msg, target }); } };
  const win = {
    addEventListener: (_t: 'message', l: MessageListener) => { listeners.add(l); },
    removeEventListener: (_t: 'message', l: MessageListener) => { listeners.delete(l); },
  };
  const iframe = {
    contentWindow: child,
    addEventListener: (_t: 'load', l: () => void) => { loads.add(l); },
    removeEventListener: (_t: 'load', l: () => void) => { loads.delete(l); },
  };
  const fromFrame = (data: unknown, origin = frameOrigin, source: unknown = child): void => {
    for (const l of [...listeners]) l({ data, origin, source });
  };
  const load = (): void => { for (const l of [...loads]) l(); };
  const types = (): string[] => sent.map((s) => String(s.msg.type));
  return { win, iframe, child, sent, fromFrame, load, types, listeners };
}

/** File side and host side wired through fake windows that honour targetOrigin and deliver asynchronously. */
function wire(fileOrigin = 'https://file.example', hostOrigin = HOST) {
  const fileListeners = new Set<MessageListener>();
  const hostListeners = new Set<MessageListener>();
  const loads = new Set<() => void>();
  const log: Msg[] = [];
  // eslint-disable-next-line prefer-const
  let parent: { postMessage(m: unknown, t: string): void };
  const child = {
    postMessage(msg: unknown, target: string) {
      if (target !== '*' && target !== fileOrigin) return; // the browser drops it
      const data = structuredClone(msg);
      setTimeout(() => { for (const l of [...fileListeners]) l({ data, origin: hostOrigin, source: parent }); }, 0);
    },
  };
  parent = {
    postMessage(msg: unknown, target: string) {
      if (target !== '*' && target !== hostOrigin) return;
      const data = structuredClone(msg) as Msg;
      log.push(data);
      setTimeout(() => { for (const l of [...hostListeners]) l({ data, origin: fileOrigin, source: child }); }, 0);
    },
  };
  const fileWin = {
    parent,
    addEventListener: (_t: 'message', l: MessageListener) => { fileListeners.add(l); },
    removeEventListener: (_t: 'message', l: MessageListener) => { fileListeners.delete(l); },
  };
  const hostWin = {
    addEventListener: (_t: 'message', l: MessageListener) => { hostListeners.add(l); },
    removeEventListener: (_t: 'message', l: MessageListener) => { hostListeners.delete(l); },
  };
  const iframe = {
    contentWindow: child,
    addEventListener: (_t: 'load', l: () => void) => { loads.add(l); },
    removeEventListener: (_t: 'load', l: () => void) => { loads.delete(l); },
  };
  return { fileWin, hostWin, iframe, log, fileOrigin };
}

async function until(f: () => boolean, ms = 3000): Promise<void> {
  const t0 = Date.now();
  while (!f()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 5));
  }
}

function memoryHandleStore(initial: Record<string, StoredHandle> = {}) {
  const map = new Map(Object.entries(initial));
  const store: HandleStore = {
    async get(k) { return map.get(k); },
    async put(k, v) { map.set(k, v); },
    async delete(k) { map.delete(k); },
  };
  return { store, map };
}

/**
 * A file handle over an in-memory file: `content` is the file's text (a new file is empty), every
 * write replaces it, and `getFile()` reads it — unless `unreadable` (a handle whose file cannot be read).
 */
function fakeHandle(name = 'notes.md.html', perm: { query?: string; request?: string } = {}, content = '', unreadable = false) {
  const writes: unknown[] = [];
  const calls = { query: 0, request: 0 };
  const handle: FileHandleLike & { writes: unknown[]; calls: typeof calls; fail?: boolean; content: string } = {
    name,
    writes,
    calls,
    content,
    async createWritable() {
      if (handle.fail) throw new Error('disk full');
      let next = '';
      return { write: async (d: unknown) => { writes.push(d); next += String(d); }, close: async () => { handle.content = next; } };
    },
    ...(unreadable ? {} : { getFile: async () => ({ text: async () => handle.content }) }),
    ...(perm.query ? { queryPermission: async () => { calls.query++; return perm.query!; } } : {}),
    ...(perm.request ? { requestPermission: async () => { calls.request++; return perm.request!; } } : {}),
  };
  return handle;
}

/** A saver window: protocol, an optional picker, and a download recorder. */
function fakeSaverWindow(opts: { protocol?: string; href?: string; picker?: (o: unknown) => Promise<FileHandleLike> } = {}) {
  const protocol = opts.protocol ?? 'file:';
  const href = opts.href ?? 'file:///Users/me/notes.md.html#sec';
  const downloads: Array<{ name: string; parts: unknown[] }> = [];
  const picks: unknown[] = [];
  const blobs = new Map<string, unknown[]>();
  let n = 0;
  const win: SaverWindow = {
    location: { protocol, href, pathname: new URL(href).pathname },
    document: {
      createElement: () => {
        const a = { href: '', download: '', rel: '', setAttribute() {}, click() { downloads.push({ name: a.download, parts: blobs.get(a.href)! }); }, remove() {} };
        return a;
      },
      body: { appendChild: () => undefined },
    },
    Blob: class { parts: unknown[]; constructor(parts: unknown[]) { this.parts = parts; } } as unknown as SaverWindow['Blob'],
    URL: { createObjectURL: (b: unknown) => { const u = `blob:${++n}`; blobs.set(u, (b as { parts: unknown[] }).parts); return u; }, revokeObjectURL: () => undefined },
    setTimeout: () => 0,
    ...(opts.picker ? { showSaveFilePicker: (o: unknown) => { picks.push(o); return opts.picker!(o); } } : {}),
  };
  return { win, downloads, picks };
}

function fakeHostConnection(connected: boolean, ack = { ok: true } as { ok: boolean; error?: string }) {
  const saves: unknown[] = [];
  const conn = {
    connected: () => connected,
    save: async (p: unknown) => { saves.push(p); return ack; },
  } as unknown as HostConnection;
  return { conn, saves };
}

const abort = (): Error => Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' });

// ── S.1–S.3 save ─────────────────────────────────────────────────────────

describe('save order and fallbacks (spec/shell-runtime.md §1)', () => {
  const input = { text: 'T', html: '<!doctype html>X' };

  it('[S.1] a connected host gets the save (source = text, html, theme) and nothing else runs; a refused host save is reported, never downloaded', async () => {
    const { win, downloads, picks } = fakeSaverWindow({ picker: async () => fakeHandle() });
    const ok = fakeHostConnection(true);
    expect(await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', host: ok.conn, window: win }).save({ ...input, theme: 'light' })).toEqual({ via: 'host', ok: true });
    expect(ok.saves).toEqual([{ source: 'T', html: '<!doctype html>X', theme: 'light' }]);
    const bad = fakeHostConnection(true, { ok: false, error: 'quota' });
    expect(await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', host: bad.conn, window: win }).save(input)).toEqual({ via: 'host', ok: false, error: 'quota' });
    expect([downloads.length, picks.length]).toEqual([0, 0]);
  });

  it('[S.1] [S.13] an unconnected host is skipped; a served page (http/https) returns the served notice without picker or download; otherwise File System Access (picked, name); without it a download (confirmed: false, name)', async () => {
    const off = fakeHostConnection(false);
    for (const protocol of ['http:', 'https:']) {
      const s = fakeSaverWindow({ protocol, href: `${protocol}//site.example/notes.md.html`, picker: async () => fakeHandle() });
      expect(await createSaver({ suggestedName: 'notes.md.html', kind: 'md', host: off.conn, window: s.win }).save(input)).toEqual({ via: 'served-notice' });
      expect([s.picks.length, s.downloads.length]).toEqual([0, 0]);
    }
    const h = fakeHandle();
    const f = fakeSaverWindow({ picker: async () => h });
    expect(await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', host: off.conn, window: f.win, handleStore: memoryHandleStore().store }).save(input)).toEqual({ via: 'file', ok: true, picked: true, opened: false, name: 'notes.md.html' });
    expect(h.writes).toEqual(['<!doctype html>X']);
    const d = fakeSaverWindow();
    expect(await createSaver({ suggestedName: 'notes.md.html', kind: 'md', window: d.win }).save(input)).toEqual({ via: 'download', ok: true, confirmed: false, name: 'notes.md.html' });
    expect(d.downloads).toEqual([{ name: 'notes.md.html', parts: ['<!doctype html>X'] }]);
    expect(off.saves).toEqual([]);
  });

  it('[S.1] the served notice offers download(): it downloads the given html under the suggested name', async () => {
    const s = fakeSaverWindow({ protocol: 'https:', href: 'https://site.example/a/deck.slides.html' });
    const saver = createSaver({ suggestedName: 'deck.slides.html', kind: 'slides', window: s.win });
    expect(await saver.save(input)).toEqual({ via: 'served-notice' });
    expect(await saver.download({ html: 'H' })).toEqual({ via: 'download', ok: true, confirmed: false, name: 'deck.slides.html' });
    expect(s.downloads).toEqual([{ name: 'deck.slides.html', parts: ['H'] }]);
  });

  it('[S.2] [S.13] the picker gets the suggested name and the kind\'s extension; AbortError is { via: file, ok: false, error: cancelled, picked: true } with no download; other picker errors and write errors download', async () => {
    for (const kind of HOST_KINDS) {
      const f = fakeSaverWindow({ picker: async () => fakeHandle() });
      await createSaver({ suggestedName: `x${KIND_EXTENSIONS[kind]}`, kind, window: f.win, handleStore: memoryHandleStore().store }).save(input);
      expect(f.picks[0]).toMatchObject({ suggestedName: `x${KIND_EXTENSIONS[kind]}`, types: [{ accept: { 'text/html': [KIND_EXTENSIONS[kind], '.html'] } }] });
    }
    expect(KIND_EXTENSIONS).toEqual({ md: '.md.html', slides: '.slides.html', paged: '.paged.html', poster: '.poster.html' });
    const a = fakeSaverWindow({ picker: async () => { throw abort(); } });
    expect(await createSaver({ suggestedName: 'n.md.html', kind: 'md', window: a.win, handleStore: memoryHandleStore().store }).save(input)).toEqual({ via: 'file', ok: false, error: 'cancelled', picked: true, opened: false });
    expect(a.downloads).toEqual([]);
    const n = fakeSaverWindow({ picker: async () => { throw Object.assign(new Error('no gesture'), { name: 'SecurityError' }); } });
    expect(await createSaver({ suggestedName: 'n.md.html', kind: 'md', window: n.win, handleStore: memoryHandleStore().store }).save(input)).toEqual({ via: 'download', ok: true, confirmed: false, name: 'n.md.html' });
    const broken = fakeHandle();
    broken.fail = true;
    const w = fakeSaverWindow({ picker: async () => broken });
    expect(await createSaver({ suggestedName: 'n.md.html', kind: 'md', window: w.win, handleStore: memoryHandleStore().store }).save(input)).toEqual({ via: 'download', ok: true, confirmed: false, name: 'n.md.html' });
    expect(w.downloads.map((x) => x.parts)).toEqual([['<!doctype html>X']]);
  });

  it('[S.2] a remembered handle asks for permission again: granted by query or by request → written without the picker; denied → the picker', async () => {
    const cases: Array<[{ query?: string; request?: string }, number]> = [
      [{ query: 'granted' }, 0],
      [{ query: 'prompt', request: 'granted' }, 0],
      [{ query: 'prompt', request: 'denied' }, 1],
      [{ query: 'denied' }, 1],
    ];
    for (const [perm, picks] of cases) {
      const old = fakeHandle('notes.md.html', perm, 'OPENED');
      const fresh = fakeHandle();
      const f = fakeSaverWindow({ picker: async () => fresh });
      const r = await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f.win, openedHtml: 'OPENED', handleStore: memoryHandleStore({ [`${UID} file:///Users/me/notes.md.html`]: { handle: old, name: 'notes.md.html', location: 'file:///Users/me/notes.md.html' } }).store }).save(input);
      expect(r, JSON.stringify(perm)).toEqual({ via: 'file', ok: true, picked: picks === 1, opened: picks === 0, name: 'notes.md.html' });
      expect(f.picks.length, JSON.stringify(perm)).toBe(picks);
      expect((picks ? fresh : old).writes, JSON.stringify(perm)).toEqual(['<!doctype html>X']);
    }
  });

  it('[S.3] the handle key is the header uid (well-formed) with the page location, else the page URL without its fragment; the picked handle is stored under it with that location', async () => {
    expect(SHELL_UID_PATTERN.source).toBe(UID_PATTERN.source);
    const mem = memoryHandleStore();
    // the reader picks the opened file itself (it holds the opened bytes): it is remembered, with the hash of what was written
    const f = fakeSaverWindow({ picker: async () => fakeHandle('notes.md.html', {}, 'OPENED') });
    const s1 = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f.win, handleStore: mem.store, openedHtml: 'OPENED' });
    expect(s1.handleKey()).toBe(`${UID} file:///Users/me/notes.md.html`);
    expect(await s1.save(input)).toMatchObject({ via: 'file', picked: true, opened: true });
    expect(mem.map.get(`${UID} file:///Users/me/notes.md.html`)).toMatchObject({ name: 'notes.md.html', location: 'file:///Users/me/notes.md.html', sha256: createHash('sha256').update(input.html).digest('hex') });
    // a query or fragment is not part of the location
    const q = fakeSaverWindow({ href: 'file:///Users/me/notes.md.html?x=1#y' });
    expect(createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: q.win }).handleKey()).toBe(`${UID} file:///Users/me/notes.md.html`);
    expect(createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: {} }).handleKey()).toBe(UID);
    for (const uid of [undefined, '', 'doc-SHORT', 'not-a-uid']) {
      const s = createSaver({ uid, suggestedName: 'notes.md.html', kind: 'md', window: f.win, handleStore: mem.store });
      expect(s.handleKey()).toBe('file:///Users/me/notes.md.html');
    }
    await createSaver({ suggestedName: 'notes.md.html', kind: 'md', window: f.win, handleStore: mem.store, openedHtml: () => Promise.resolve('OPENED') }).save(input);
    expect([...mem.map.keys()]).toEqual([`${UID} file:///Users/me/notes.md.html`, 'file:///Users/me/notes.md.html']);
    // a picked file that is not the opened one (a new file, another file) is written but never remembered for this page
    const other = memoryHandleStore();
    await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: fakeSaverWindow({ picker: async () => fakeHandle() }).win, handleStore: other.store, openedHtml: 'OPENED' }).save(input);
    expect(other.map.size).toBe(0);
  });

  it('[S.3] a second save overwrites without prompting — in the same session and in a new one (remembered handle proved by content) — and a remembered handle for another file name (a copy carrying the same uid) is not used', async () => {
    const mem = memoryHandleStore();
    const h = fakeHandle('notes.md.html', { query: 'granted' }, 'zero'); // the opened file: it holds what the page loaded
    const f = fakeSaverWindow({ picker: async () => h });
    const s = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f.win, handleStore: mem.store, openedHtml: 'zero' });
    expect(await s.save({ text: 'a', html: 'one' })).toEqual({ via: 'file', ok: true, picked: true, opened: true, name: 'notes.md.html' });
    expect(await s.save({ text: 'b', html: 'two' })).toEqual({ via: 'file', ok: true, picked: false, opened: true, name: 'notes.md.html' });
    expect([f.picks.length, h.writes]).toEqual([1, ['one', 'two']]);
    // a new session (fresh saver, same store) of the page that loaded "two"
    const f2 = fakeSaverWindow({ picker: async () => fakeHandle() });
    expect(await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f2.win, handleStore: mem.store, openedHtml: 'two' }).save({ text: 'c', html: 'three' })).toEqual({ via: 'file', ok: true, picked: false, opened: true, name: 'notes.md.html' });
    expect([f2.picks.length, h.writes]).toEqual([0, ['one', 'two', 'three']]);
    // a copy opened as copy.md.html with the same uid
    const other = fakeHandle('copy.md.html');
    const f3 = fakeSaverWindow({ href: 'file:///Users/me/copy.md.html', picker: async () => other });
    await createSaver({ uid: UID, suggestedName: 'copy.md.html', kind: 'md', window: f3.win, handleStore: mem.store, openedHtml: 'three' }).save({ text: 'd', html: 'four' });
    expect([f3.picks.length, h.writes.length, other.writes]).toEqual([1, 3, ['four']]);
    // [A-1] a same-named copy in ANOTHER folder (same uid, same name: every file: page shares one IndexedDB) gets the picker
    const copy = fakeHandle('notes.md.html', {}, 'three');
    const f5 = fakeSaverWindow({ href: 'file:///Users/me/Downloads/notes.md.html', picker: async () => copy });
    const r5 = await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f5.win, handleStore: mem.store, openedHtml: 'three' }).save({ text: 'e', html: 'copy' });
    expect([r5, f5.picks.length, h.writes.length, copy.writes]).toEqual([{ via: 'file', ok: true, picked: true, opened: true, name: 'notes.md.html' }, 1, 3, ['copy']]);
    // ... and the original, reopened (it loaded "three"), still reuses its own handle (its record is not the copy's)
    const f6 = fakeSaverWindow({ picker: async () => fakeHandle() });
    const r6 = await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f6.win, handleStore: mem.store, openedHtml: 'three' }).save({ text: 'f', html: 'five' });
    expect([r6, f6.picks.length, h.writes]).toEqual([{ via: 'file', ok: true, picked: false, opened: true, name: 'notes.md.html' }, 0, ['one', 'two', 'three', 'five']]);
    // a record without a location (stored before this rule) or a page without one is not reused
    const legacy = fakeHandle('notes.md.html', { query: 'granted' }, 'six?');
    const f7 = fakeSaverWindow({ picker: async () => fakeHandle() });
    await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f7.win, openedHtml: 'six?', handleStore: memoryHandleStore({ [`${UID} file:///Users/me/notes.md.html`]: { handle: legacy, name: 'notes.md.html' } }).store }).save({ text: 'g', html: 'six' });
    expect([f7.picks.length, legacy.writes]).toEqual([1, []]);
    // IndexedDB unavailable (a store that keeps nothing): the session still remembers its handle
    const forgetful: HandleStore = { get: async () => undefined, put: async () => undefined, delete: async () => undefined };
    const h4 = fakeHandle('n.md.html', { query: 'prompt', request: 'denied' });
    const f4 = fakeSaverWindow({ picker: async () => h4 });
    const s4 = createSaver({ uid: UID, suggestedName: 'n.md.html', kind: 'md', window: f4.win, handleStore: forgetful });
    await s4.save({ text: 'a', html: '1' });
    await s4.save({ text: 'b', html: '2' });
    expect([f4.picks.length, h4.writes]).toEqual([1, ['1', '2']]);
  });

  it('[S.3] [S.13] a handle is proved by its content, never by its name (F2): a save-as that landed in another folder is never reused after a reload and never counts as the opened file; without the opened bytes no remembered handle is reused', async () => {
    const PAGE = 'file:///Users/me/Docs/notes.md.html';
    const mem = memoryHandleStore();
    // session 1: the page is Docs/notes.md.html (it loaded "v0"); the picker opens in Downloads and the reader accepts the same name there
    const downloads = fakeHandle('notes.md.html', { query: 'granted' });
    const docs = fakeHandle('notes.md.html', { query: 'granted' }, 'v0');
    const f1 = fakeSaverWindow({ href: PAGE, picker: async () => downloads });
    const s1 = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f1.win, handleStore: mem.store, openedHtml: 'v0' });
    expect(await s1.save({ text: 't1', html: 'v1' })).toEqual({ via: 'file', ok: true, picked: true, opened: false, name: 'notes.md.html' });
    // later saves of session 1 keep writing the file the reader chose — and still say it is not the opened file (B#1)
    expect(await s1.save({ text: 't1b', html: 'v1b' })).toEqual({ via: 'file', ok: true, picked: false, opened: false, name: 'notes.md.html' });
    expect(mem.map.size).toBe(0);
    // session 2: the reader reopens Docs/notes.md.html (still v0) and saves: the picker, never the Downloads file
    const f2 = fakeSaverWindow({ href: PAGE, picker: async () => docs });
    const r2 = await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f2.win, handleStore: mem.store, openedHtml: 'v0' }).save({ text: 't2', html: 'v0+2' });
    expect([r2, f2.picks.length, downloads.content, docs.content]).toEqual([{ via: 'file', ok: true, picked: true, opened: true, name: 'notes.md.html' }, 1, 'v1b', 'v0+2']);
    // even a record that names the Downloads file (stored by an older shell, no hash) is refused: its bytes are not the opened file's
    const stale = memoryHandleStore({ [`${UID} ${PAGE}`]: { handle: downloads, name: 'notes.md.html', location: PAGE } });
    const f3 = fakeSaverWindow({ href: PAGE, picker: async () => docs });
    expect(await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f3.win, handleStore: stale.store, openedHtml: 'v0+2' }).save({ text: 't3', html: 'v3' })).toMatchObject({ picked: true, opened: true });
    expect(downloads.content).toBe('v1b');
    // B#8 (round 3): a remembered handle whose file another tool wrote since (the recorded hash differs) IS
    // reused when it holds the opened bytes — a CLI re-assembly of the same text is the file this page opened
    const shared = fakeHandle('notes.md.html', { query: 'granted' }, 'external');
    const hashed = memoryHandleStore({ [`${UID} ${PAGE}`]: { handle: shared, name: 'notes.md.html', location: PAGE, sha256: createHash('sha256').update('what this page wrote').digest('hex') } });
    const f4 = fakeSaverWindow({ href: PAGE, picker: async () => fakeHandle() });
    expect(await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f4.win, handleStore: hashed.store, openedHtml: 'external' }).save({ text: 't4', html: 'v4' })).toEqual({ via: 'file', ok: true, picked: false, opened: true, name: 'notes.md.html' });
    expect([f4.picks.length, shared.content]).toEqual([0, 'v4']);
    // ... and the record now holds the hash of what this page wrote
    expect(hashed.map.get(`${UID} ${PAGE}`)).toMatchObject({ sha256: createHash('sha256').update('v4').digest('hex') });
    // but a file changed since the page opened it (it no longer holds the opened bytes) gets the picker, whatever the hash says
    const moved = fakeHandle('notes.md.html', { query: 'granted' }, 'v4');
    const f4b = fakeSaverWindow({ href: PAGE, picker: async () => fakeHandle() });
    await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f4b.win, handleStore: memoryHandleStore({ [`${UID} ${PAGE}`]: { handle: moved, name: 'notes.md.html', location: PAGE, sha256: createHash('sha256').update('v4').digest('hex') } }).store, openedHtml: 'external' }).save({ text: 't4b', html: 'v4b' });
    expect([f4b.picks.length, moved.content]).toEqual([1, 'v4']);
    // no opened bytes (the carrier did not say): a remembered handle is never reused across page loads; no permission is asked
    const proven = fakeHandle('notes.md.html', { query: 'prompt', request: 'granted' }, 'v0');
    const f5 = fakeSaverWindow({ href: PAGE, picker: async () => fakeHandle() });
    expect(await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f5.win, handleStore: memoryHandleStore({ [`${UID} ${PAGE}`]: { handle: proven, name: 'notes.md.html', location: PAGE } }).store }).save({ text: 't5', html: 'v5' })).toMatchObject({ picked: true, opened: false });
    expect([f5.picks.length, proven.writes, proven.calls]).toEqual([1, [], { query: 0, request: 0 }]);
    // an unreadable handle (no getFile) proves nothing: the picker
    const blind = fakeHandle('notes.md.html', { query: 'granted' }, 'v0', true);
    const f6 = fakeSaverWindow({ href: PAGE, picker: async () => fakeHandle() });
    await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f6.win, handleStore: memoryHandleStore({ [`${UID} ${PAGE}`]: { handle: blind, name: 'notes.md.html', location: PAGE } }).store, openedHtml: 'v0' }).save({ text: 't6', html: 'v6' });
    expect([f6.picks.length, blind.writes]).toEqual([1, []]);
    // in one session: a file written by someone else since this page's last save gets the picker (not silently overwritten)
    const mine = fakeHandle('notes.md.html', {}, 'v0');
    const f7 = fakeSaverWindow({ href: PAGE, picker: async () => mine });
    const s7 = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f7.win, handleStore: memoryHandleStore().store, openedHtml: 'v0' });
    await s7.save({ text: 'a', html: 'A' });
    mine.content = 'changed by another tab';
    await s7.save({ text: 'b', html: 'B' });
    expect(f7.picks.length).toBe(2);
    // round 3 (m24): a session file picked as NOT the opened one that later holds the opened bytes again
    // (the original copied over it) is proved by its content: opened: true, and it is remembered — but since
    // loop 3 round 3 (F3) the opened bytes put back over this page's own save are asked about first
    // (S.14): the reader's Replace (overwrite) writes it, proved opened, with no second picker
    const mem8 = memoryHandleStore();
    const elsewhere = fakeHandle('notes.md.html', { query: 'granted' });
    const f8 = fakeSaverWindow({ href: PAGE, picker: async () => elsewhere });
    const s8 = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f8.win, handleStore: mem8.store, openedHtml: 'v0' });
    expect(await s8.save({ text: 'a', html: 'A' })).toMatchObject({ picked: true, opened: false });
    expect(mem8.map.size).toBe(0);
    elsewhere.content = 'v0';
    const c8 = await s8.save({ text: 'b', html: 'B' });
    expect(c8).toEqual({ via: 'file', ok: false, error: 'conflict', conflict: true, picked: false, opened: false, name: 'notes.md.html', conflictToken: expect.any(Number) });
    expect(elsewhere.content).toBe('v0');
    expect(await s8.save({ text: 'b', html: 'B' }, { overwrite: true, conflictToken: (c8 as { conflictToken: number }).conflictToken })).toEqual({ via: 'file', ok: true, picked: false, opened: true, name: 'notes.md.html' });
    expect([f8.picks.length, elsewhere.content, mem8.map.size]).toEqual([1, 'B', 1]);
  });

  it('[S.4] the save never reads the live DOM: no shell module names a DOM-reading or serializing API, and save writes exactly the html it is given', async () => {
    const forbidden = /\b(outerHTML|innerHTML|innerText|textContent|documentElement|XMLSerializer|cloneNode|querySelector(All)?|getElementById|getElementsBy\w+|serializeToString|\.head\b)\b/;
    // chrome.ts and brand.ts are the UI modules that write icons and the brand marks into their own shadow root (V.4 binds them); every other module is checked.
    const files = readdirSync('src/carrier/shell').filter((f) => f.endsWith('.ts') && f !== 'chrome.ts' && f !== 'brand.ts');
    expect(files.sort()).toEqual(['conflict.ts', 'file-side.ts', 'host-side.ts', 'index.ts', 'indicator.ts', 'preferences.ts', 'protocol.ts', 'save.ts', 'types.ts', 'update.ts']);
    const hits: string[] = [];
    for (const f of files) {
      readFileSync(`src/carrier/shell/${f}`, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$|^\s*\*.*$/, '');
        if (forbidden.test(code)) hits.push(`${f}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
    // behaviour: a document that throws on every read except the anchor path
    const trap = new Proxy({}, { get(_t, p) { throw new Error(`DOM read: ${String(p)}`); } });
    const d = fakeSaverWindow();
    const win = { ...d.win, document: Object.assign(Object.create(trap), { createElement: d.win.document!.createElement, body: d.win.document!.body }) };
    expect(await createSaver({ suggestedName: 'n.md.html', kind: 'md', window: win }).save({ text: 't', html: 'exact <b>bytes</b>' })).toEqual({ via: 'download', ok: true, confirmed: false, name: 'n.md.html' });
    expect(d.downloads[0].parts).toEqual(['exact <b>bytes</b>']);
    // CR LF, a lone CR and a BOM in the assembled bytes are written and downloaded as given, never normalised
    const crHtml = '\uFEFF<!doctype html>\r\n<head><style>\r\n.a{}\r</style></head>\n<body>x\r\n</body>';
    const h = fakeHandle();
    const f = fakeSaverWindow({ picker: async () => h });
    await createSaver({ suggestedName: 'notes.md.html', kind: 'md', window: f.win, handleStore: memoryHandleStore().store }).save({ text: 't', html: crHtml });
    const d2 = fakeSaverWindow();
    await createSaver({ suggestedName: 'notes.md.html', kind: 'md', window: d2.win }).save({ text: 't', html: crHtml });
    expect([h.writes, d2.downloads[0].parts]).toEqual([[crHtml], [crHtml]]);
  });

  it('[S.1] save never rejects: non-string input and an absent document report ok: false', async () => {
    expect(await createSaver({ suggestedName: 'n.md.html', kind: 'md', window: {} }).save({ text: 't', html: 'h' })).toEqual({ via: 'download', ok: false, confirmed: false, error: 'Downloads are not available here.' });
    expect((await createSaver({ suggestedName: 'n.md.html', kind: 'md', window: {} }).save({ text: 't', html: 1 as unknown as string })).via).toBe('download');
  });
});

// ── S.5 preferences ──────────────────────────────────────────────────────

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } };
}

describe('a file that changed on disk (2.2.0, spec/shell-runtime.md §1)', () => {
  const orz = (text: string): string => assembleEnvelope(text, { kind: 'md', shellVersion: '1.0.0', delivery: 'cdn', headHtml: '', bodyHtml: '<main></main>' });
  const doc = (uid: string, body: string): string => `{{nyml\nkind: document\ntitle: Notes\nuid: ${uid}\n}}\n\n# Notes\n\n${body}\n`;
  const OPENED_TEXT = doc(UID, 'As opened.');
  const OPENED = orz(OPENED_TEXT);
  const MINE = doc(UID, 'My edit.');

  it('[S.14] headerUidOf reads a well-formed header uid without the kit\'s header tools (BOM, CR LF; a malformed uid, no header or a uid outside the header is none)', () => {
    expect(headerUidOf(OPENED_TEXT)).toBe(UID);
    expect(headerUidOf(`\uFEFF{{nyml\r\nkind: document\r\nuid: ${UID}\r\n}}\r\n# x`)).toBe(UID);
    expect(headerUidOf('{{nyml\nkind: document\nuid: doc-BAD\n}}\n')).toBeUndefined();
    expect(headerUidOf(`# Title\n\nuid: ${UID}\n`)).toBeUndefined();
    expect(headerUidOf(`{{nyml\nkind: document\n}}\n\nuid: ${UID}\n`)).toBeUndefined();
  });

  it('[S.14] a picked (or re-picked) file of this document whose text changed on disk since the page opened it is never written silently: { via: file, ok: false, conflict: true }; save(input, { overwrite: true }) then writes that file without a second picker; the opened bytes, another document (uid), a non-orz file or the text being saved are no conflict; without the opened bytes nothing is a conflict', async () => {
    // the agent's version is on disk; the page picks it
    const agent = fakeHandle('notes.md.html', {}, orz(doc(UID, 'AGENT EDIT')));
    const f = fakeSaverWindow({ picker: async () => agent });
    const saver = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f.win, handleStore: memoryHandleStore().store, openedHtml: OPENED });
    const input = { text: MINE, html: orz(MINE) };
    const c1 = await saver.save(input);
    expect(c1).toEqual({ via: 'file', ok: false, error: 'conflict', conflict: true, picked: true, opened: false, name: 'notes.md.html', conflictToken: expect.any(Number) });
    expect([agent.writes.length, extract(agent.content)!.text]).toEqual([0, doc(UID, 'AGENT EDIT')]);
    // round 4 (F2): an overwrite without the conflict's token, or with another, writes nothing
    for (const call of [{ overwrite: true }, { overwrite: true, conflictToken: (c1 as { conflictToken: number }).conflictToken + 1 }]) {
      expect(await saver.save(input, call)).toEqual({ via: 'file', ok: false, error: 'stale-conflict', picked: false, opened: false });
    }
    expect([agent.writes.length, f.picks.length]).toEqual([0, 1]);
    expect(await saver.save(input, { overwrite: true, conflictToken: (c1 as { conflictToken: number }).conflictToken })).toEqual({ via: 'file', ok: true, picked: true, opened: false, name: 'notes.md.html' });
    expect([f.picks.length, agent.content === input.html, f.downloads.length]).toEqual([1, true, 0]);
    // the next save reuses that handle (what this page wrote last), no picker, no conflict
    const again = { text: doc(UID, 'Again.'), html: orz(doc(UID, 'Again.')) };
    expect((await saver.save(again)).ok).toBe(true);
    expect(f.picks.length).toBe(1);

    // the session's handle changed on disk (an agent wrote the file between two saves): the picker, then the conflict
    const opened = fakeHandle('notes.md.html', {}, OPENED);
    const g = fakeSaverWindow({ picker: async () => opened });
    const s2 = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: g.win, handleStore: memoryHandleStore().store, openedHtml: OPENED });
    expect(await s2.save(input)).toEqual({ via: 'file', ok: true, picked: true, opened: true, name: 'notes.md.html' });
    opened.content = orz(doc(UID, 'AGENT EDIT'));
    const r = await s2.save(again);
    expect([r.via, 'conflict' in r && r.conflict, g.picks.length, extract(opened.content)!.text]).toEqual(['file', true, 2, doc(UID, 'AGENT EDIT')]);

    // no conflict: another document's file, the text being saved, the opened bytes, a non-orz file, no opened bytes
    for (const [content, o] of [
      [orz(doc('doc-otherotherother0', 'Other doc.')), OPENED],
      [orz(MINE), OPENED],
      [OPENED, OPENED],
      ['<!doctype html><p>not an orz file</p>', OPENED],
      [orz(doc(UID, 'AGENT EDIT')), undefined],
    ] as const) {
      const h = fakeHandle('notes.md.html', {}, content);
      const w = fakeSaverWindow({ picker: async () => h });
      const res = await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: w.win, handleStore: memoryHandleStore().store, ...(o ? { openedHtml: o } : {}) }).save(input);
      expect([res.via, (res as { ok: boolean }).ok, h.content === input.html], content.slice(0, 40)).toEqual(['file', true, true]);
    }
  });

  // ── round 2 of the carrier-app loop: which file is this document, and what "changed" means ──
  const orzv = (text: string, o: { shellVersion?: string; delivery?: 'inline' | 'cdn'; includes?: Record<string, string>; head?: string } = {}): string =>
    assembleEnvelope(text, { kind: 'md', shellVersion: o.shellVersion ?? '1.0.0', delivery: o.delivery ?? 'cdn', headHtml: o.head ?? '', bodyHtml: '<main></main>', ...(o.includes ? { includes: o.includes } : {}) });
  /** One save of `mine` over a picked file holding `disk`, with the opened file `opened`: the outcome and what the file holds after. */
  const saveOver = async (disk: string, opened: string, mine: string, o: { uid?: string; readUid?(t: string): string | undefined } = {}) => {
    const h = fakeHandle('notes.md.html', {}, disk);
    const w = fakeSaverWindow({ picker: async () => h });
    const saver = createSaver({ ...(o.uid ? { uid: o.uid } : {}), suggestedName: 'notes.md.html', kind: 'md', window: w.win, handleStore: memoryHandleStore().store, openedHtml: opened, ...(o.readUid ? { readUid: o.readUid } : {}) });
    const r = await saver.save({ text: mine, html: orzv(mine) });
    return { conflict: r.via === 'file' && r.conflict === true, written: h.content === orzv(mine), r };
  };

  it('[S.14] headerUidOf reads the uid as readHeader does for every header form: quoted (" and \'), a | block, blank lines before the header, kind: document on the opener line, CR LF — and not an indented, upper-case or malformed uid', () => {
    const t = (line: string, before = '', opener = '{{nyml\nkind: document') => `${before}${opener}\n${line}\n}}\n\n# x\n`;
    for (const [text, want] of [
      [t(`uid: "${UID}"`), UID], [t(`uid: '${UID}'`), UID], [t(`uid: |\n  ${UID}`), UID], [t(`uid : ${UID}`), UID], [t(`uid:${UID}`), UID],
      [t(`uid: ${UID}`, '\n\n'), UID], [t(`uid: ${UID}`, '\uFEFF\n'), UID], [t(`uid: ${UID}`, '', '{{nyml kind: document'),  UID],
      [`{{nyml\r\nkind: document\r\nuid: "${UID}"\r\n}}\r\n`, UID],
      [t(`  uid: ${UID}`), undefined], [t(`UID: ${UID}`), undefined], [t('uid: "doc-BAD"'), undefined], [t(`uid: ${UID} # note`), undefined],
    ] as const) {
      expect(headerUidOf(text), JSON.stringify(text)).toBe(want);
      // the reference: the kit's readHeader, well-formed
      const ref = readHeader(text)?.fields['uid']?.trim();
      expect(ref && UID_PATTERN.test(ref) ? ref : undefined, JSON.stringify(text)).toBe(want);
    }
  });

  it('[S.14] round 2: the file on disk is this document when its uid (read with readUid, else headerUidOf) is the saver\'s or either side has none — so an agent\'s edit of a document without a uid, or with a quoted, block or blank-line-led uid, is a conflict; only two different uids are two documents', async () => {
    const quoted = (body: string) => `{{nyml\nkind: document\nuid: "${UID}"\n}}\n\n# Q\n\n${body}\n`;
    const block = (body: string) => `\n{{nyml kind: document\nuid: |\n  ${UID}\n}}\n\n# B\n\n${body}\n`;
    const plain = (body: string) => `# Plain\n\n${body}\n`;
    for (const [name, make] of [['quoted', quoted], ['block, blank line, opener', block]] as const) {
      const r = await saveOver(orzv(make('AGENT')), orzv(make('opened')), make('mine'), { uid: UID });
      expect([name, r.conflict, r.written]).toEqual([name, true, false]);
    }
    // no uid on either side: this document
    expect(await saveOver(orzv(plain('AGENT')), orzv(plain('opened')), plain('mine'))).toMatchObject({ conflict: true, written: false });
    // the page has a uid, the disk file none (or the other way round): still asked
    expect(await saveOver(orzv(plain('AGENT')), orzv(doc(UID, 'opened')), doc(UID, 'mine'), { uid: UID })).toMatchObject({ conflict: true, written: false });
    expect(await saveOver(orzv(doc(UID, 'AGENT')), orzv(plain('opened')), plain('mine'))).toMatchObject({ conflict: true, written: false });
    // two different uids: another document (the reader picked it; the browser asked to replace it)
    expect(await saveOver(orzv(doc('doc-otherotherother0', 'AGENT')), orzv(doc(UID, 'opened')), doc(UID, 'mine'), { uid: UID })).toMatchObject({ conflict: false, written: true });
    // readUid is the page's reader: it decides
    expect(await saveOver(orzv(doc('doc-otherotherother0', 'AGENT')), orzv(doc(UID, 'opened')), doc(UID, 'mine'), { uid: UID, readUid: () => UID })).toMatchObject({ conflict: true, written: false });
    expect(await saveOver(orzv(doc(UID, 'AGENT')), orzv(doc(UID, 'opened')), doc(UID, 'mine'), { uid: UID, readUid: () => 'doc-otherotherother0' })).toMatchObject({ conflict: false, written: true });
    // a readUid that throws reads as none (this document)
    expect(await saveOver(orzv(doc(UID, 'AGENT')), orzv(doc(UID, 'opened')), doc(UID, 'mine'), { uid: UID, readUid: () => { throw new Error('x'); } })).toMatchObject({ conflict: true });
  });

  it('[S.14] round 2: "changed on disk" compares content — the extracted text, the resolved includes and the delivery — not bytes: the opened text or this page\'s last write in other bytes (another shell version, CR LF) is no change; the same text with new includes or another delivery is one', async () => {
    const opened = doc(UID, 'As opened.');
    const mine = doc(UID, 'Mine.');
    // the opened text, re-assembled in other bytes (an older shell version; CR LF line endings): no conflict, written
    // (a NEWER shell is an agent's upgrade: round 3, below)
    expect(await saveOver(orzv(opened, { shellVersion: '0.9.9' }), orzv(opened), mine, { uid: UID })).toMatchObject({ conflict: false, written: true });
    expect(await saveOver(orzv(opened).replace(/\n/g, '\r\n'), orzv(opened), mine, { uid: UID })).toMatchObject({ conflict: false, written: true });
    expect(extract(orzv(opened).replace(/\n/g, '\r\n'))!.text).toBe(opened); // (a CR LF re-encoding keeps the text)
    // the same text with other includes, or another delivery: changed (the page would write back its own)
    expect(await saveOver(orzv(opened, { includes: { 'p.md': 'NEW\n' } }), orzv(opened, { includes: { 'p.md': 'OLD\n' } }), mine, { uid: UID })).toMatchObject({ conflict: true, written: false });
    expect(await saveOver(orzv(opened, { delivery: 'inline' }), orzv(opened), mine, { uid: UID })).toMatchObject({ conflict: true, written: false });
    // includes compare as entries, not as written order
    expect(await saveOver(orzv(opened, { includes: { b: '2', a: '1' } }), orzv(opened, { includes: { a: '1', b: '2' } }), mine, { uid: UID })).toMatchObject({ conflict: false, written: true });
    // round 3 (K03): a file another tool wrote with its #orz-includes in another key order is the same content
    const unsorted = orzv(opened, { includes: { a: '1', b: '2' } }).replace('{"a":"1","b":"2"}', '{"b":"2","a":"1"}');
    expect(unsorted).not.toBe(orzv(opened, { includes: { a: '1', b: '2' } }));
    expect(await saveOver(unsorted, orzv(opened, { includes: { a: '1', b: '2' } }), mine, { uid: UID })).toMatchObject({ conflict: false, written: true });
    // the file being saved, in other bytes: no conflict
    expect(await saveOver(orzv(mine, { shellVersion: '0.9.0' }), orzv(opened), mine, { uid: UID })).toMatchObject({ conflict: false, written: true });

    // this page's last write, re-encoded by a tool between two saves: no conflict; changed text: conflict
    for (const [rewrite, conflict] of [[(t: string) => orzv(t, { shellVersion: '0.9.9' }), false], [(t: string) => orzv(`${t}AGENT\n`), true]] as const) {
      const h = fakeHandle('notes.md.html', {}, orzv(opened));
      const w = fakeSaverWindow({ picker: async () => h });
      const saver = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: w.win, handleStore: memoryHandleStore().store, openedHtml: orzv(opened) });
      expect((await saver.save({ text: mine, html: orzv(mine) })).ok).toBe(true);
      h.content = rewrite(mine);
      const next = doc(UID, 'Next.');
      const r = await saver.save({ text: next, html: orzv(next) });
      expect([conflict, r.via === 'file' && r.conflict === true, h.content === orzv(next), w.picks.length]).toEqual([conflict, conflict, !conflict, 2]);
    }
  });

  it('[S.14] round 3 (L12): the same content in a NEWER shell on disk (an agent ran upgrade) is a change — the save asks, and overwrite then writes; the same shell in other bytes, an older shell, or a newer shell this page wrote itself is no question', async () => {
    const opened = doc(UID, 'As opened.');
    const mine = doc(UID, 'Mine.');
    // newer shell, same content as opened: asked (writing would undo the upgrade)
    const up = await saveOver(orzv(opened, { shellVersion: '1.1.0' }), orzv(opened), mine, { uid: UID });
    expect(up).toMatchObject({ conflict: true, written: false });
    expect(up.r).toMatchObject({ via: 'file', ok: false, error: 'conflict', picked: true, opened: false });
    // newer shell, same text as the file being saved: asked too
    expect(await saveOver(orzv(mine, { shellVersion: '2.0.0' }), orzv(opened), mine, { uid: UID })).toMatchObject({ conflict: true, written: false });
    // a prerelease of the same version is older (semver): no question
    expect(await saveOver(orzv(opened, { shellVersion: '1.0.0-rc.1' }), orzv(opened), mine, { uid: UID })).toMatchObject({ conflict: false, written: true });
    // the same shell in other bytes (a tool that re-wrote the head): no question
    const otherBytes = orzv(opened, { head: '<meta name="x-tool" content="rewritten">' });
    expect(otherBytes).not.toBe(orzv(opened));
    expect(await saveOver(otherBytes, orzv(opened), mine, { uid: UID })).toMatchObject({ conflict: false, written: true });
    // an unreadable shell version on disk is not newer: no question
    expect(await saveOver(orzv(opened, { shellVersion: 'next' }), orzv(opened), mine, { uid: UID })).toMatchObject({ conflict: false, written: true });
    // the reader answers Replace: overwrite writes that file
    const h = fakeHandle('notes.md.html', {}, orzv(opened, { shellVersion: '1.1.0' }));
    const w = fakeSaverWindow({ picker: async () => h });
    const saver = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: w.win, handleStore: memoryHandleStore().store, openedHtml: orzv(opened) });
    const cu = await saver.save({ text: mine, html: orzv(mine) });
    expect(cu.ok).toBe(false);
    expect(await saver.save({ text: mine, html: orzv(mine) }, { overwrite: true, conflictToken: (cu as { conflictToken: number }).conflictToken })).toMatchObject({ ok: true, picked: true });
    expect([h.content === orzv(mine), w.picks.length]).toEqual([true, 1]);
    // this page itself wrote a newer shell (its update), re-encoded by a tool since: no question
    const h2 = fakeHandle('notes.md.html', {}, orzv(opened));
    const w2 = fakeSaverWindow({ picker: async () => h2 });
    const s2 = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: w2.win, handleStore: memoryHandleStore().store, openedHtml: orzv(opened) });
    expect((await s2.save({ text: mine, html: orzv(mine, { shellVersion: '1.1.0' }) })).ok).toBe(true);
    h2.content = orzv(mine, { shellVersion: '1.1.0', head: '<meta name="x-tool" content="re-encoded">' });
    const r2 = await s2.save({ text: doc(UID, 'Next.'), html: orzv(doc(UID, 'Next.')) });
    expect([r2.ok, w2.picks.length, h2.content === orzv(doc(UID, 'Next.'))]).toEqual([true, 2, true]);
  });

  it('[S.14] round 3 (F3): the session\'s file holding the opened bytes again over this page\'s own save (someone reverted it) is asked about — no picker, picked: false; a later save asks again; overwrite writes it (proved opened); saving the opened text itself is no question', async () => {
    const opened = orzv(doc(UID, 'As opened.'));
    const h = fakeHandle('notes.md.html', {}, opened);
    const w = fakeSaverWindow({ picker: async () => h });
    const mem = memoryHandleStore();
    const saver = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: w.win, handleStore: mem.store, openedHtml: opened });
    const one = doc(UID, 'One.');
    expect(await saver.save({ text: one, html: orzv(one) })).toMatchObject({ ok: true, picked: true, opened: true });
    h.content = opened; // git checkout / an agent put the opened version back
    const two = doc(UID, 'Two.');
    expect(await saver.save({ text: two, html: orzv(two) })).toEqual({ via: 'file', ok: false, error: 'conflict', conflict: true, picked: false, opened: false, name: 'notes.md.html', conflictToken: expect.any(Number) });
    expect([h.content === opened, w.picks.length]).toEqual([true, 1]);
    // not answered (a download, a dismissal): the next save asks again
    const again = await saver.save({ text: two, html: orzv(two) });
    expect(again).toMatchObject({ conflict: true, picked: false });
    // Replace: overwrite writes the session's file, proved opened, and it is remembered
    expect(await saver.save({ text: two, html: orzv(two) }, { overwrite: true, conflictToken: (again as { conflictToken: number }).conflictToken })).toEqual({ via: 'file', ok: true, picked: false, opened: true, name: 'notes.md.html' });
    expect([h.content === orzv(two), w.picks.length, mem.map.size]).toEqual([true, 1, 1]);
    // the page saves the opened text itself while the file holds it again: nothing would be lost — no question
    const h2 = fakeHandle('notes.md.html', {}, opened);
    const w2 = fakeSaverWindow({ picker: async () => h2 });
    const s2 = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: w2.win, handleStore: memoryHandleStore().store, openedHtml: opened });
    expect((await s2.save({ text: one, html: orzv(one) })).ok).toBe(true);
    h2.content = opened;
    expect(await s2.save({ text: doc(UID, 'As opened.'), html: opened })).toMatchObject({ ok: true, picked: false, opened: true });
  });

  it('[S.14] round 4 (F2): each conflict gets a token and only the pending one is answered — an overwrite carrying the token of a conflict a later save superseded, or after the file was written, writes nothing ({ error: stale-conflict }): an older question\'s text never goes over a newer save', async () => {
    const opened = orzv(doc(UID, 'As opened.'));
    const h = fakeHandle('notes.md.html', {}, orzv(doc(UID, 'AGENT EDIT')));
    const w = fakeSaverWindow({ picker: async () => h });
    const saver = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: w.win, handleStore: memoryHandleStore().store, openedHtml: opened });
    const older = doc(UID, 'The page text (older).');
    const newer = doc(UID, 'The editor text (newer).');
    const q1 = await saver.save({ text: older, html: orzv(older) });
    const q2 = await saver.save({ text: newer, html: orzv(newer) });
    const t1 = (q1 as { conflictToken: number }).conflictToken;
    const t2 = (q2 as { conflictToken: number }).conflictToken;
    expect([q1.via === 'file' && q1.conflict, q2.via === 'file' && q2.conflict, t1 !== t2]).toEqual([true, true, true]);
    // the older question answers first: refused, nothing written (the newer one is still pending)
    expect(await saver.save({ text: older, html: orzv(older) }, { overwrite: true, conflictToken: t1 })).toEqual({ via: 'file', ok: false, error: 'stale-conflict', picked: false, opened: false });
    expect(h.writes).toHaveLength(0);
    // the newer answers: written
    expect(await saver.save({ text: newer, html: orzv(newer) }, { overwrite: true, conflictToken: t2 })).toMatchObject({ ok: true, picked: true });
    // P6: the older question's Replace after the newer one wrote — no conflict pending: refused, the newer text stays
    expect(await saver.save({ text: older, html: orzv(older) }, { overwrite: true, conflictToken: t1 })).toMatchObject({ ok: false, error: 'stale-conflict' });
    expect(await saver.save({ text: older, html: orzv(older) }, { overwrite: true, conflictToken: t2 })).toMatchObject({ ok: false, error: 'stale-conflict' });
    expect([h.writes.length, h.content === orzv(newer), w.picks.length]).toEqual([1, true, 2]);
  });

  it('[S.14] round 4 (F4): a remembered handle (no session handle: it was dropped after an agent\'s edit) whose file holds the opened bytes again over what this page wrote into the opened file is asked about too — picked: false, nothing written; overwrite writes it; a page that wrote only elsewhere is not asked', async () => {
    const opened = orzv(doc(UID, 'As opened.'));
    const mem = memoryHandleStore();
    const h = fakeHandle('notes.md.html', { query: 'granted' }, opened);
    const w = fakeSaverWindow({ picker: async () => h });
    const saver = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: w.win, handleStore: mem.store, openedHtml: opened });
    const s1 = doc(UID, 'S1.');
    expect(await saver.save({ text: s1, html: orzv(s1) })).toMatchObject({ ok: true, picked: true, opened: true });
    expect(mem.map.size).toBe(1);
    // an agent's edit: the session handle is dropped, the picker gives the file, the conflict; the reader downloads (no answer to the saver)
    h.content = orzv(doc(UID, 'AGENT EDIT'));
    const s3 = doc(UID, 'S3.');
    expect(await saver.save({ text: s3, html: orzv(s3) })).toMatchObject({ conflict: true, picked: true });
    // git checkout: the opened (committed) version is back; the remembered handle is proved by it
    h.content = opened;
    const s4 = doc(UID, 'S4.');
    const r4 = await saver.save({ text: s4, html: orzv(s4) });
    expect(r4).toEqual({ via: 'file', ok: false, error: 'conflict', conflict: true, picked: false, opened: false, name: 'notes.md.html', conflictToken: expect.any(Number) });
    expect([h.content === opened, w.picks.length]).toEqual([true, 2]);
    expect(await saver.save({ text: s4, html: orzv(s4) }, { overwrite: true, conflictToken: (r4 as { conflictToken: number }).conflictToken })).toEqual({ via: 'file', ok: true, picked: false, opened: true, name: 'notes.md.html' });
    expect([h.content === orzv(s4), w.picks.length]).toEqual([true, 2]);
    // a new page load (nothing written yet) reuses the remembered handle holding its opened bytes without a question
    const s2 = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: fakeSaverWindow({ picker: async () => fakeHandle() }).win, handleStore: mem.store, openedHtml: orzv(s4) });
    expect(await s2.save({ text: s1, html: orzv(s1) })).toMatchObject({ ok: true, picked: false, opened: true });
    // a page that wrote only into another file (picked, not the opened one) is not asked when the remembered file holds its opened bytes
    const elsewhere = fakeHandle('notes.md.html', {}, '');
    const w3 = fakeSaverWindow({ picker: async () => elsewhere });
    h.content = 'not the opened bytes yet';
    const s3saver = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: w3.win, handleStore: mem.store, openedHtml: orzv(s1) });
    expect(await s3saver.save({ text: s3, html: orzv(s3) })).toMatchObject({ ok: true, picked: true, opened: false });
    elsewhere.content = 'someone else wrote here';
    h.content = orzv(s1);
    expect(await s3saver.save({ text: s4, html: orzv(s4) })).toMatchObject({ ok: true, picked: false, opened: true });
    expect([h.content === orzv(s4), w3.picks.length]).toEqual([true, 1]);
  });

  it('[S.14] round 4 (F5): knownHtml — content the page also knows (the opened text with the includes it was given since) — on a picked file is no change: written, never counted as the opened file; without it, or when it fails, or in a newer shell, the save asks', async () => {
    const text = doc(UID, '{{md part.md}}');
    const i1 = { 'part.md': 'one\n' };
    const i2 = { 'part.md': 'two\n' };
    const opened = orzv(text, { includes: i1 });
    const mine = doc(UID, '{{md part.md}}\nEdited.');
    const run = async (disk: string, knownHtml?: SaverOptions['knownHtml']) => {
      const h = fakeHandle('notes.md.html', {}, disk);
      const w = fakeSaverWindow({ protocol: 'https:', href: 'https://app.example/edit', picker: async () => h });
      const saver = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: w.win, handleStore: memoryHandleStore().store, openedHtml: opened, servedNotice: false, ...(knownHtml ? { knownHtml } : {}) });
      const r = await saver.save({ text: mine, html: orzv(mine, { includes: i2 }) });
      return { r, written: h.content === orzv(mine, { includes: i2 }) };
    };
    const disk = orzv(text, { includes: i2 }); // the app's server resolved the include again
    expect(await run(disk)).toMatchObject({ r: { conflict: true }, written: false });
    expect(await run(disk, async () => orzv(text, { includes: i2 }))).toMatchObject({ r: { ok: true, picked: true, opened: false }, written: true });
    expect(await run(disk, () => orzv(text, { includes: i2 }))).toMatchObject({ r: { ok: true }, written: true });
    expect(await run(disk, async () => { throw new Error('assemble failed'); })).toMatchObject({ r: { conflict: true }, written: false });
    expect(await run(disk, () => null)).toMatchObject({ r: { conflict: true }, written: false });
    // another text on disk is still a change; the known content in a newer shell is an agent's upgrade
    expect(await run(orzv(doc(UID, 'AGENT')), () => orzv(text, { includes: i2 }))).toMatchObject({ r: { conflict: true }, written: false });
    expect(await run(orzv(text, { includes: i2, shellVersion: '1.1.0' }), () => orzv(text, { includes: i2 }))).toMatchObject({ r: { conflict: true }, written: false });
  });

  it('[S.14] round 4 (F6, K02): the revert check\'s exceptions — the opened content is what this page is saving, or what it last wrote, in OTHER bytes (another shell version) — ask nothing; the same bytes neither', async () => {
    const opened = orzv(doc(UID, 'As opened.'));
    const openedOther = orzv(doc(UID, 'As opened.'), { shellVersion: '0.9.0' }); // the opened content, other bytes
    const setup = async () => {
      const h = fakeHandle('notes.md.html', {}, opened);
      const w = fakeSaverWindow({ picker: async () => h });
      const saver = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: w.win, handleStore: memoryHandleStore().store, openedHtml: opened });
      return { h, w, saver };
    };
    // saving the opened content (in other bytes) over the reverted file: nothing would be lost
    {
      const { h, w, saver } = await setup();
      const one = doc(UID, 'One.');
      expect((await saver.save({ text: one, html: orzv(one) })).ok).toBe(true);
      h.content = opened;
      expect(await saver.save({ text: doc(UID, 'As opened.'), html: openedOther })).toMatchObject({ ok: true, picked: false, opened: true });
      expect([h.content === openedOther, w.picks.length]).toEqual([true, 1]);
    }
    // this page last wrote the opened content (in other bytes), then the file got the opened bytes: nothing of this page's is lost
    {
      const { h, w, saver } = await setup();
      expect((await saver.save({ text: doc(UID, 'As opened.'), html: openedOther })).ok).toBe(true);
      h.content = opened;
      const two = doc(UID, 'Two.');
      expect(await saver.save({ text: two, html: orzv(two) })).toMatchObject({ ok: true, picked: false, opened: true });
      expect([h.content === orzv(two), w.picks.length]).toEqual([true, 1]);
    }
    // control: another content written before the revert asks
    {
      const { h, saver } = await setup();
      const one = doc(UID, 'One.');
      expect((await saver.save({ text: one, html: orzv(one) })).ok).toBe(true);
      h.content = opened;
      expect(await saver.save({ text: doc(UID, 'Two.'), html: orzv(doc(UID, 'Two.')) })).toMatchObject({ conflict: true, picked: false });
    }
  });

  it('[S.14] round 3 (K25): a saver without openedHtml never reports a conflict — nothing is known about the opened text — on a picked file of this document holding another text, nor on its session file', async () => {
    const h = fakeHandle('notes.md.html', {}, orzv(doc(UID, 'AGENT EDIT')));
    const w = fakeSaverWindow({ picker: async () => h });
    const saver = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: w.win, handleStore: memoryHandleStore().store });
    const one = doc(UID, 'One.');
    const r = await saver.save({ text: one, html: orzv(one) });
    expect(r).toEqual({ via: 'file', ok: true, picked: true, opened: false, name: 'notes.md.html' });
    h.content = orzv(doc(UID, 'AGENT AGAIN'));
    const r2 = await saver.save({ text: one, html: orzv(one) });
    expect([r2.ok, r2.via === 'file' && r2.conflict === true, w.picks.length, h.content === orzv(one)]).toEqual([true, false, 2, true]);
  });

  it('[S.14] round 2: the picked file of a conflict is used only by the save that answers it — a later save without overwrite asks the picker again (and is checked again), and an overwrite after that writes the session\'s file, never the old conflicting one', async () => {
    const agent = fakeHandle('notes.md.html', {}, orz(doc(UID, 'AGENT EDIT')));
    const fresh = fakeHandle('notes.md.html', {}, '');
    const picks = [agent, fresh];
    const f = fakeSaverWindow({ picker: async () => picks.shift()! });
    const saver = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f.win, handleStore: memoryHandleStore().store, openedHtml: OPENED });
    const r1 = await saver.save({ text: MINE, html: orz(MINE) });
    expect(r1.via === 'file' && r1.conflict).toBe(true);
    // the reader did not answer; a new save (no overwrite) asks the picker again: the reader picks a new file
    const r2 = await saver.save({ text: MINE, html: orz(MINE) });
    expect([r2.ok, f.picks.length, fresh.content === orz(MINE)]).toEqual([true, 2, true]);
    // round 4 (F2): an overwrite now answers no pending conflict (the later save superseded it): nothing is
    // written — neither the agent's file nor this page's — and a plain save then writes this page's file
    const next = doc(UID, 'Next.');
    expect(await saver.save({ text: next, html: orz(next) }, { overwrite: true, conflictToken: (r1 as { conflictToken: number }).conflictToken })).toEqual({ via: 'file', ok: false, error: 'stale-conflict', picked: false, opened: false });
    expect([agent.writes.length, fresh.content === orz(MINE), f.picks.length]).toEqual([0, true, 2]);
    expect((await saver.save({ text: next, html: orz(next) })).ok).toBe(true);
    expect([agent.writes.length, fresh.content === orz(next), f.picks.length]).toEqual([0, true, 2]);
  });

  it('[S.14] round 2: a failed openedHtml (a rejection, a non-string) is not kept: the next save asks again, so a fetch that failed once does not disable the conflict check', async () => {
    let calls = 0;
    const openedHtml = async () => { calls++; if (calls === 1) throw new Error('offline'); return OPENED; };
    const first = fakeHandle('notes.md.html', {}, '');
    const agent = fakeHandle('notes.md.html', {}, orz(doc(UID, 'AGENT EDIT')));
    const picks = [first, agent];
    const f = fakeSaverWindow({ picker: async () => picks.shift()! });
    const saver = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f.win, handleStore: memoryHandleStore().store, openedHtml });
    expect((await saver.save({ text: MINE, html: orz(MINE) })).ok).toBe(true); // nothing known yet: written
    first.content = orz(doc(UID, 'SOMEONE ELSE')); // the session's file changed: the picker, which gives the agent's file
    const next = doc(UID, 'Next.');
    const r = await saver.save({ text: next, html: orz(next) });
    expect([calls >= 2, r.via === 'file' && r.conflict === true, agent.writes.length]).toEqual([true, true, 0]);
    const n = calls;
    await saver.save({ text: next, html: orz(next) }, { overwrite: true, conflictToken: (r as { conflictToken: number }).conflictToken });
    await saver.save({ text: doc(UID, 'Third.'), html: orz(doc(UID, 'Third.')) });
    expect(calls).toBe(n); // a string, once given, is kept
  });

  it('[S.15] servedNotice: false — a page that is not an assembled file (an app\'s editor without a save hook) on http(s) goes on to the picker, else a download; the default keeps the notice', async () => {
    const served = fakeSaverWindow({ protocol: 'https:', href: 'https://app.example/editor', picker: async () => fakeHandle('notes.md.html') });
    expect((await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: served.win }).save({ text: 'T', html: 'H' })).via).toBe('served-notice');
    const r = await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: served.win, servedNotice: false }).save({ text: 'T', html: 'H' });
    expect([r.via, (r as { ok: boolean }).ok, served.picks.length]).toEqual(['file', true, 1]);
    const noPicker = fakeSaverWindow({ protocol: 'https:', href: 'https://app.example/editor' });
    const d = await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: noPicker.win, servedNotice: false }).save({ text: 'T', html: 'H' });
    expect([d.via, noPicker.downloads.length]).toEqual(['download', 1]);
  });
});

describe('reader preferences (FC-18 §6)', () => {
  it('[S.5] preferences are namespaced by uid (a malformed or absent uid uses "_"), typed and validated: an invalid set is refused, a corrupt or invalid stored value reads as the default', () => {
    const s = memoryStorage();
    const a = createPreferenceStore(UID, s);
    const b = createPreferenceStore('doc-zzzzzzzzzz', s);
    const none = createPreferenceStore(undefined, s);
    expect([a.namespace, none.namespace, preferenceNamespace('bad uid')]).toEqual([`orz-pref:${UID}:`, 'orz-pref:_:', 'orz-pref:_:']);
    expect(a.set('viewMode', 'preview')).toBe(true);
    expect(a.set('splitRatio', 0.3)).toBe(true);
    expect([a.get('viewMode'), b.get('viewMode'), none.get('viewMode')]).toEqual(['preview', 'split', 'split']);
    expect(a.set('splitRatio', 2 as number)).toBe(false);
    expect(a.set('viewMode', 'fullscreen' as 'split')).toBe(false);
    expect(a.set('nope' as 'viewMode', 'split')).toBe(false);
    expect(a.get('splitRatio')).toBe(0.3);
    s.map.set(`orz-pref:${UID}:editorFontSize`, '{not json');
    s.map.set(`orz-pref:${UID}:scrollSync`, '"yes"');
    expect([a.get('editorFontSize'), a.get('scrollSync')]).toEqual([14, true]);
    a.remove('viewMode');
    expect(a.get('viewMode')).toBe('split');
    expect(a.all()).toEqual({ splitRatio: 0.3, scrollSync: true, viewMode: 'split', editorFontSize: 14, darkChrome: null, fontScale: 100 });
    expect(Object.keys(READER_PREFERENCES)).toEqual(['splitRatio', 'scrollSync', 'viewMode', 'editorFontSize', 'darkChrome', 'fontScale']);
    // the read view's text size (2.2.0): an integer percentage, 25–400
    expect([a.set('fontScale', 120), a.get('fontScale'), a.set('fontScale', 12.5), a.set('fontScale', 500), a.set('fontScale', 20)]).toEqual([true, 120, false, false, false]);
    s.map.set(`orz-pref:${UID}:fontScale`, '1000');
    expect(a.get('fontScale')).toBe(100);
    a.remove('fontScale');
    expect([...s.map.keys()].every((k) => k.startsWith('orz-pref:'))).toBe(true);
  });

  it('[S.5] preferences fail closed: storage that throws on every call, a localStorage getter that throws, and no storage at all give defaults and refused sets — never an exception', () => {
    const throwing: StorageLike = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceeded'); }, removeItem() { throw new Error('x'); } };
    const p = createPreferenceStore(UID, throwing);
    expect([p.get('viewMode'), p.set('viewMode', 'editor'), p.remove('viewMode')]).toEqual(['split', false, undefined]);
    const g = globalThis as { window?: unknown };
    const saved = Object.getOwnPropertyDescriptor(g, 'window');
    try {
      Object.defineProperty(g, 'window', { configurable: true, get: () => ({ get localStorage() { throw new Error('SecurityError'); } }) });
      const q = createPreferenceStore(UID);
      expect([q.get('darkChrome'), q.set('darkChrome', true)]).toEqual([null, false]);
      Object.defineProperty(g, 'window', { configurable: true, get: () => { throw new Error('no window'); } });
      expect(createPreferenceStore(UID).get('editorFontSize')).toBe(14);
    } finally {
      if (saved) Object.defineProperty(g, 'window', saved);
      else delete g.window;
    }
    expect(createPreferenceStore().get('scrollSync')).toBe(true); // Node: no window, no storage
  });
});

// ── S.6–S.7 file side ────────────────────────────────────────────────────

describe('host protocols, file side (spec/host-protocols.md)', () => {
  it('[S.6] an unframed document never listens; only window.parent is heard (a sibling or any other source is ignored)', () => {
    const lone = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const unframed = { ...lone, parent: undefined as unknown };
    unframed.parent = unframed;
    const c = connectHost({ kind: 'md', window: unframed });
    expect(lone.addEventListener).not.toHaveBeenCalled();
    expect(c.connected()).toBe(false);
    const f = fakeFrame();
    const c2 = connectHost({ kind: 'md', window: f.win });
    f.deliver(hello, HOST, { postMessage() {} });
    f.deliver(hello, HOST, null);
    expect([c2.connected(), f.sent.length]).toEqual([false, 0]);
    f.deliver(hello);
    expect(c2.connected()).toBe(true);
  });

  it('[S.6] nothing is active before the hello: save reports not-connected, requestAi fails, requestInclude resolves null, setDirty is silent — and nothing is posted; stray results and acks are ignored', async () => {
    const f = fakeFrame();
    const c = connectHost({ kind: 'paged', window: f.win, ai: { onOperations: () => undefined }, include: { onAvailable: () => undefined } });
    f.deliver({ type: MSG.saved, ok: true });
    f.deliver({ type: MSG.aiResult, requestId: 'ai1', ok: true, proposed: 'x' });
    expect(await c.save({ source: 's', html: 'h' })).toEqual({ ok: false, error: 'not-connected' });
    expect((await c.requestAi('improve', 'x')).ok).toBe(false);
    expect(await c.requestInclude('https://x.example/a.md')).toBeNull();
    c.setDirty(true);
    expect(f.sent).toEqual([]);
    expect(c.protocols()).toEqual({ save: false, ai: false, include: false });
  });

  it('[S.6] the origin is pinned at the first accepted hello of any protocol: later messages (hellos, acks, results) from another origin are dropped; replies go to the pinned origin, or "*" for an opaque ("null") parent', async () => {
    const f = fakeFrame();
    const c = connectHost({ kind: 'md', window: f.win, ai: { onOperations: () => undefined } });
    f.deliver(aiHello, HOST);
    f.deliver(hello, 'https://evil.example');
    expect([c.connected(), c.origin()]).toEqual([false, HOST]);
    f.deliver(hello, HOST);
    expect(c.connected()).toBe(true);
    const p = c.save({ source: 's', html: 'h' });
    f.deliver({ type: MSG.saved, ok: true }, 'https://evil.example');
    f.deliver({ type: MSG.saved, ok: false, error: 'real' }, HOST);
    expect(await p).toEqual({ ok: false, error: 'real' });
    expect(f.sent.every((s) => s.target === HOST)).toBe(true);
    const o = fakeFrame();
    const c2 = connectHost({ kind: 'slides', window: o.win });
    o.deliver(hello, 'null');
    expect([c2.connected(), o.sent[0].target]).toEqual([true, '*']);
  });

  it('[S.6] ready is idempotent: repeated hellos get the same ready and replay the dirty state, onReady fires once per protocol; a version above 1 is answered with 1; a hello with another protocol name is not a hello', () => {
    const f = fakeFrame();
    const ready: string[] = [];
    const c = connectHost({ kind: 'poster', window: f.win, onReady: (p) => ready.push(p) });
    c.setDirty(true);
    f.deliver({ ...hello, protocol: 'orz-host-ai' });
    f.deliver({ ...hello, version: 0 });
    f.deliver({ ...hello, version: '1' });
    expect(f.sent).toEqual([]);
    f.deliver({ ...hello, version: 2 });
    f.deliver(hello);
    f.deliver(hello);
    const readies = f.sent.filter((s) => s.msg.type === MSG.ready).map((s) => s.msg);
    expect(readies).toEqual(Array(3).fill({ type: 'orz-host-ready', protocol: 'orz-host-save', version: 1, kind: 'poster' }));
    expect(f.sent.filter((s) => s.msg.type === MSG.dirty).length).toBe(3);
    expect(ready).toEqual(['orz-host-save']);
  });

  it('[S.6] payloads are data: operations are copied and filtered to string id/title, a non-string proposal or markdown is a failure, and AI/include hellos are not answered unless the file opted in', async () => {
    const f = fakeFrame();
    let ops: unknown = null;
    const c = connectHost({ kind: 'md', window: f.win, ai: { onOperations: (o) => { ops = o; } }, include: { onAvailable: () => undefined } });
    const evil = { id: 'x', title: 'X', selection: 1, toString() { return 'boom'; } };
    f.deliver({ ...aiHello, operations: [evil, { id: 1, title: 'n' }, null, { id: 'ok', title: 'OK', selection: true, extra: { a: 1 } }] });
    expect(ops).toEqual([{ id: 'x', title: 'X', selection: false }, { id: 'ok', title: 'OK', selection: true }]);
    f.deliver(includeHello);
    const ai = c.requestAi('ok', 'text', true);
    const inc = c.requestInclude('https://x.example/a.md');
    const req = f.sent.find((s) => s.msg.type === MSG.aiRequest)!.msg;
    const ireq = f.sent.find((s) => s.msg.type === MSG.includeRequest)!.msg;
    expect(req).toEqual({ type: 'orz-host-ai-request', protocol: 'orz-host-ai', version: 1, requestId: req.requestId, op: 'ok', text: 'text', selection: true });
    f.deliver({ type: MSG.aiResult, requestId: req.requestId, ok: true, proposed: { toString: () => 'x' } });
    f.deliver({ type: MSG.includeResult, requestId: ireq.requestId, ok: true, markdown: ['# x'] });
    expect([(await ai).ok, await inc]).toEqual([false, null]);
    expect((await c.requestAi('not-offered', 't')).error).toBe('Unknown operation.');
    const g = fakeFrame();
    const plain = connectHost({ kind: 'poster', window: g.win });
    g.deliver(aiHello);
    g.deliver(includeHello);
    expect([g.sent.length, plain.protocols()]).toEqual([0, { save: false, ai: false, include: false }]);
  });

  it('[S.7] timeouts: a host save with no ack fails after 10 s (and the next save may go), an AI request after 30 s, an include request resolves null after 30 s; identical include URLs in flight share one request', async () => {
    vi.useFakeTimers();
    expect([SAVE_ACK_TIMEOUT_MS, AI_TIMEOUT_MS, INCLUDE_TIMEOUT_MS]).toEqual([10_000, 30_000, 30_000]);
    const f = fakeFrame();
    const results: unknown[] = [];
    const c = connectHost({ kind: 'md', window: f.win, onSaveResult: (r) => results.push(r), ai: { onOperations: () => undefined }, include: { onAvailable: () => undefined } });
    f.deliver(hello);
    f.deliver(aiHello);
    f.deliver(includeHello);
    let done: unknown = null;
    void c.save({ source: 's', html: 'h' }).then((r) => { done = r; });
    expect(await c.save({ source: 's', html: 'h' })).toEqual({ ok: false, error: 'A save is already in flight.' });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(done).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toEqual({ ok: false, error: 'No response from the host.' });
    expect(results).toEqual([done]);
    const again = c.save({ source: 's', html: 'h2' });
    f.deliver({ type: MSG.saved, ok: true });
    expect(await again).toEqual({ ok: true });
    let ai: unknown = null;
    void c.requestAi('improve', 't').then((r) => { ai = r; });
    const i1 = c.requestInclude('https://x/a.md');
    const i2 = c.requestInclude('https://x/a.md');
    expect(i1).toBe(i2);
    expect(f.sent.filter((s) => s.msg.type === MSG.includeRequest).length).toBe(1);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(ai).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(ai).toEqual({ ok: false, error: 'No response from the host.' });
    expect(await i1).toBeNull();
    c.dispose();
  });
});

// ── S.8 host side ────────────────────────────────────────────────────────

describe('host protocols, host side (embedCarrierFrame)', () => {
  it('[S.8] hellos go out at once, on every load and every 400 ms until each offered protocol is ready, then stop; after 20 s onHelloTimeout names the silent protocols', async () => {
    vi.useFakeTimers();
    expect([HELLO_INTERVAL_MS, HELLO_MAX_MS]).toEqual([400, 20_000]);
    const h = fakeHost();
    const timeouts: string[] = [];
    const frame = embedCarrierFrame(h.iframe, { window: h.win, onSave: async () => ({ ok: true }), ai: { operations: [{ id: 'a', title: 'A', selection: false }], run: async () => ({ ok: true, proposed: 'p' }) }, include: { resolve: async () => null }, onHelloTimeout: (p) => timeouts.push(p) });
    expect(h.types()).toEqual([MSG.hello, MSG.aiHello, MSG.includeHello]);
    await vi.advanceTimersByTimeAsync(400);
    expect(h.sent.length).toBe(6);
    h.fromFrame({ type: MSG.ready, protocol: 'orz-host-save', version: 1, kind: 'md' });
    await vi.advanceTimersByTimeAsync(400);
    expect(h.types().slice(6)).toEqual([MSG.aiHello, MSG.includeHello]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(timeouts).toEqual(['orz-host-ai', 'orz-host-include']);
    const n = h.sent.length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(h.sent.length).toBe(n);
    h.load(); // a reloaded frame handshakes again
    expect([frame.ready('orz-host-save'), h.types().slice(n)]).toEqual([false, [MSG.hello, MSG.aiHello, MSG.includeHello]]);
    frame.dispose();
  });

  it('[S.8] mirrored rules: only the iframe\'s window is heard; expectedOrigin is enforced (else the first ready\'s origin is pinned); nothing before ready; duplicate readies report once', async () => {
    const h = fakeHost('https://file.example');
    const saves: unknown[] = [];
    const readies: unknown[] = [];
    const frame = embedCarrierFrame(h.iframe, { window: h.win, expectedOrigin: 'https://file.example', onSave: async (p) => { saves.push(p); return { ok: true }; }, onReady: (i) => readies.push(i), helloMaxMs: 50 });
    expect(h.sent[0].target).toBe('https://file.example');
    h.fromFrame({ type: MSG.save, protocol: 'orz-host-save', version: 1, source: 's', html: 'h' }); // before ready
    h.fromFrame({ type: MSG.ready, protocol: 'orz-host-save', version: 1, kind: 'md' }, 'https://file.example', {}); // wrong source
    h.fromFrame({ type: MSG.ready, protocol: 'orz-host-save', version: 1, kind: 'md' }, 'https://evil.example'); // wrong origin
    h.fromFrame({ type: MSG.ready, protocol: 'orz-host-save', version: 2, kind: 'md' }); // no common version
    expect([frame.ready(), saves.length, readies.length]).toEqual([false, 0, 0]);
    h.fromFrame({ type: MSG.ready, protocol: 'orz-host-save', version: 1, kind: 'md' });
    h.fromFrame({ type: MSG.ready, protocol: 'orz-host-save', version: 1, kind: 'md' });
    expect([frame.ready(), frame.kind(), readies]).toEqual([true, 'md', [{ protocol: 'orz-host-save', version: 1, kind: 'md' }]]);
    frame.dispose();
    // no expectedOrigin: the first ready's origin is pinned
    const g = fakeHost('https://a.example');
    const f2 = embedCarrierFrame(g.iframe, { window: g.win, onSave: async () => ({ ok: true }), helloMaxMs: 50 });
    expect(g.sent[0].target).toBe('*');
    g.fromFrame({ type: MSG.ready, protocol: 'orz-host-save', version: 1, kind: 'slides' });
    g.fromFrame({ type: MSG.dirty, protocol: 'orz-host-save', version: 1, dirty: true }, 'https://b.example');
    expect([f2.origin(), f2.dirty()]).toEqual(['https://a.example', false]);
    g.fromFrame({ type: MSG.dirty, protocol: 'orz-host-save', version: 1, dirty: true });
    expect(f2.dirty()).toBe(true);
    f2.dispose();
  });

  it('[S.8] the host answers every save: ok from onSave, ok: false with its error, a thrown onSave, an empty html; AI and include requests for unknown ops or empty input fail without calling the app', async () => {
    const h = fakeHost();
    const outcomes = [{ ok: true }, { ok: false, error: 'quota' }];
    let i = 0;
    const runs: unknown[] = [];
    const frame = embedCarrierFrame(h.iframe, {
      window: h.win, helloMaxMs: 50,
      onSave: async () => { if (i === 2) throw new Error('db down'); return outcomes[i++]; },
      ai: { operations: [{ id: 'a', title: 'A', selection: true }], run: async (r) => { runs.push(r); return { ok: true, proposed: 'P' }; } },
      include: { resolve: async (u) => (u.endsWith('ok.md') ? '# ok' : null) },
    });
    for (const t of [MSG.ready, MSG.aiReady, MSG.includeReady]) h.fromFrame({ type: t, protocol: t === MSG.ready ? 'orz-host-save' : t === MSG.aiReady ? 'orz-host-ai' : 'orz-host-include', version: 1, kind: 'md' });
    const save = { type: MSG.save, protocol: 'orz-host-save', version: 1, source: 's', html: 'h' };
    h.fromFrame(save); h.fromFrame(save); h.fromFrame(save); h.fromFrame({ ...save, html: '' });
    h.fromFrame({ type: MSG.aiRequest, protocol: 'orz-host-ai', version: 1, requestId: 'r1', op: 'a', text: 'x', selection: true });
    h.fromFrame({ type: MSG.aiRequest, protocol: 'orz-host-ai', version: 1, requestId: 'r2', op: 'zz', text: 'x' });
    h.fromFrame({ type: MSG.includeRequest, protocol: 'orz-host-include', version: 1, requestId: 'q1', url: 'https://x/ok.md' });
    h.fromFrame({ type: MSG.includeRequest, protocol: 'orz-host-include', version: 1, requestId: 'q2', url: 'https://x/no.md' });
    await until(() => h.sent.filter((s) => [MSG.saved, MSG.aiResult, MSG.includeResult].includes(s.msg.type as never)).length === 8);
    const replies = h.sent.map((s) => s.msg).filter((m) => [MSG.saved, MSG.aiResult, MSG.includeResult].includes(m.type as never));
    expect(replies.filter((m) => m.type === MSG.saved)).toEqual(expect.arrayContaining([
      { type: 'orz-host-saved', ok: true },
      { type: 'orz-host-saved', ok: false, error: 'quota' },
      { type: 'orz-host-saved', ok: false, error: 'The host could not save.' },
      { type: 'orz-host-saved', ok: false, error: 'The save arrived empty.' },
    ]));
    expect(replies.filter((m) => m.type === MSG.aiResult)).toEqual(expect.arrayContaining([
      { type: 'orz-host-ai-result', protocol: 'orz-host-ai', version: 1, requestId: 'r1', ok: true, proposed: 'P' },
      { type: 'orz-host-ai-result', protocol: 'orz-host-ai', version: 1, requestId: 'r2', ok: false, error: 'Unknown operation.' },
    ]));
    expect(replies.filter((m) => m.type === MSG.includeResult)).toEqual(expect.arrayContaining([
      { type: 'orz-host-include-result', protocol: 'orz-host-include', version: 1, requestId: 'q1', ok: true, markdown: '# ok' },
      { type: 'orz-host-include-result', protocol: 'orz-host-include', version: 1, requestId: 'q2', ok: false, error: 'Not resolved.' },
    ]));
    expect(runs).toEqual([{ op: 'a', text: 'x', selection: true }]);
    frame.dispose();
  });
});

// ── S.9–S.10 interoperation and format-1 saves ───────────────────────────

const PARTS: ShellParts = { kind: 'md', shellVersion: '1.0.0', delivery: 'inline', headHtml: '<style>body{margin:0}</style>', bodyHtml: '<main id="orz-app"></main>' };
const FORMAT1_TEXTS = [
  '﻿{{nyml\r\nkind: document\r\ntitle: CRLF and BOM\r\nuid: doc-abcdefghij123456\r\n}}\r\n\r\n# Hi\r\n\r\ntrailing space   \r\n',
  '{{nyml\rkind: document\r}}\r\rclassic Mac line ends\r',
  '# </script><script>alert(1)</script> <!-- 𝒳 İ\n\n\t- tab\n',
  '',
];

describe('file side and host side interoperate', () => {
  it('[S.9] connectHost and embedCarrierFrame complete all three handshakes and round trips (save, dirty, AI, include) through windows that honour targetOrigin', async () => {
    const w = wire();
    const saves: unknown[] = [];
    let dirty: boolean | null = null;
    let ops: unknown = null;
    let available = false;
    const conn = connectHost({ kind: 'slides', window: w.fileWin, ai: { onOperations: (o) => { ops = o; } }, include: { onAvailable: () => { available = true; } } });
    conn.setDirty(true);
    const frame = embedCarrierFrame(w.iframe, {
      window: w.hostWin, expectedOrigin: w.fileOrigin,
      onSave: async (p) => { saves.push(p); return { ok: true }; },
      onDirty: (d) => { dirty = d; },
      ai: { operations: [{ id: 'tighten', title: 'Tighten', selection: true }], run: async (r) => ({ ok: true, proposed: r.text.toUpperCase() }) },
      include: { resolve: async (u) => `# from ${u}` },
    });
    await until(() => frame.ready() && conn.protocols().include && conn.protocols().ai);
    expect([frame.kind(), conn.origin(), frame.origin()]).toEqual(['slides', HOST, w.fileOrigin]);
    await until(() => dirty === true);
    expect(ops).toEqual([{ id: 'tighten', title: 'Tighten', selection: true }]);
    expect(available).toBe(true);
    expect(await conn.save({ source: 'S', html: 'H', theme: 'dark' })).toEqual({ ok: true });
    expect(saves).toEqual([{ source: 'S', html: 'H', theme: 'dark' }]);
    expect(await conn.requestAi('tighten', 'abc', true)).toEqual({ ok: true, proposed: 'ABC' });
    expect(await conn.requestInclude('https://x/y.md')).toBe('# from https://x/y.md');
    conn.setDirty(false);
    await until(() => dirty === false);
    frame.dispose();
    conn.dispose();
  });

  it('[S.10] a format-1 save carries source = the exact text twin (CRLF, CR, BOM, </script>, astral, empty) and html = the assembled file, and createSaver routes it to the host unchanged', async () => {
    const w = wire();
    const saves: Array<{ source: string; html: string }> = [];
    const conn = connectHost({ kind: 'md', window: w.fileWin });
    const frame = embedCarrierFrame(w.iframe, { window: w.hostWin, onSave: async (p) => { saves.push(p); return { ok: true }; } });
    await until(() => conn.connected() && frame.ready());
    const saver = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', host: conn, window: {} });
    for (const text of FORMAT1_TEXTS) {
      const html = assembleEnvelope(text, PARTS);
      expect(await saver.save({ text, html })).toEqual({ via: 'host', ok: true });
    }
    expect(saves.map((s) => s.source)).toEqual(FORMAT1_TEXTS);
    for (const [i, s] of saves.entries()) {
      expect(s.html === assembleEnvelope(FORMAT1_TEXTS[i], PARTS)).toBe(true);
      expect(extract(s.html)!.text === s.source).toBe(true);
    }
    frame.dispose();
    conn.dispose();
  });

  it('[S.9] the wire format is @1: the exact message objects each side posts', async () => {
    const w = wire();
    const conn = connectHost({ kind: 'paged', window: w.fileWin, ai: { onOperations: () => undefined }, include: { onAvailable: () => undefined } });
    const hostSent: Msg[] = [];
    const orig = w.iframe.contentWindow.postMessage;
    w.iframe.contentWindow.postMessage = (m: unknown, t: string) => { hostSent.push(structuredClone(m) as Msg); orig(m, t); };
    const frame = embedCarrierFrame(w.iframe, { window: w.hostWin, onSave: async () => ({ ok: true }), ai: { operations: [{ id: 'a', title: 'A', selection: false }], run: async () => ({ ok: true, proposed: 'p' }) }, include: { resolve: async () => 'm' } });
    await until(() => frame.ready());
    conn.setDirty(true);
    await conn.save({ source: 's', html: 'h' });
    await conn.requestAi('a', 't');
    await conn.requestInclude('u');
    const shapes = (ms: Msg[]) => [...new Set(ms.map((m) => `${m.type} ${Object.keys(m).sort().join(',')}`))].sort();
    expect(shapes(w.log)).toEqual([
      'orz-host-ai-ready protocol,type,version',
      'orz-host-ai-request op,protocol,requestId,selection,text,type,version',
      'orz-host-dirty dirty,protocol,type,version',
      'orz-host-include-ready kind,protocol,type,version',
      'orz-host-include-request protocol,requestId,type,url,version',
      'orz-host-ready kind,protocol,type,version',
      'orz-host-save html,protocol,source,type,version',
    ]);
    expect(shapes(hostSent)).toEqual([
      'orz-host-ai-hello operations,protocol,type,version',
      'orz-host-ai-result ok,proposed,protocol,requestId,type,version',
      'orz-host-hello protocol,type,version',
      'orz-host-include-hello protocol,type,version',
      'orz-host-include-result markdown,ok,protocol,requestId,type,version',
      'orz-host-saved ok,type',
    ]);
    frame.dispose();
    conn.dispose();
  });
});

// ── S.11 module boundaries ───────────────────────────────────────────────

function valueImports(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of readFileSync(f, 'utf8').matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'";]*?from\s*['"]([^'"]+)['"]/gm)) {
      if (!m[1].startsWith('.')) { seen.add(m[1]); continue; }
      const dir = f.slice(0, f.lastIndexOf('/'));
      const parts: string[] = [];
      for (const p of `${dir}/${m[1]}`.split('/')) { if (p === '..') parts.pop(); else if (p !== '.' && p) parts.push(p); }
      const base = parts.join('/').replace(/\.js$/, '');
      queue.push(existsSync(`${base}.ts`) ? `${base}.ts` : `${base}/index.ts`);
    }
  }
  return seen;
}

/**
 * What ships: the package's CommonJS `dist/` is what a carrier bundles (`orz-markdown/carrier/shell`
 * → `dist/carrier/shell/index.js`), so the bound measures that — esbuild, browser, minified, ESM
 * output — not the TypeScript source (closed loop 2 round 2: the source measured 45.7 KB while the
 * dist bundled to 58.9 KB). Re-measured 2026-10-06 after round 2: 56,429 bytes (the source: ~47.5 KB).
 * CommonJS costs ~9 KB here: export names stay unminified and esbuild cannot drop the unused exports
 * of a CommonJS module (all of `read.js`). The shell index re-exports with `export *` where every
 * export of a module is public (−4.1 KB of per-name getters). An ESM build was weighed and not
 * shipped: carriers bundle the editor (CommonJS, which requires the shell's CommonJS modules) with the
 * shell, so a shell-only ESM entry would put two copies of save/preferences/chrome in a carrier's
 * bundle, and an ESM build of the editor goes through the parser's ESM path, which loads KaTeX twice.
 * Bound 62 KB ≈ measurement + 10 %: the shell runs in every assembled file.
 */
// 2026-10-08, round 1 of the carrier-app loop (the save-conflict check, syntax tokens, icons, toast
// actions): 61,607 bytes. Bound ~10 % above. 63,016 after round 2; 65,824 after round 3 (the newer-shell
// and revert checks, the question's alertdialog and wordings): the bound stands. 68,451 after round 4
// (one conflict question per saver — conflict.ts — tokens, the remembered-handle revert, knownHtml):
// bound raised to 75 KB (~10 % above).
const SHELL_BUNDLE_LIMIT = 82_000; // 74,775 B on 2026-10-09 with the brand marks (2.2.0: the orz seal and the GitHub mark, ~5 KB)
/** K.20 on what ships: `dist/carrier/read.js` bundled the same way (6,984 bytes on 2026-10-06). */
const READ_BUNDLE_LIMIT = 30_000;
/** The parser-free reader the update verifies with (K.20's graph). */
// naming.ts (2.5.0): the twin-link naming the reader reads from #orz-shell; it imports nothing
const READER_GRAPH = ['src/ascii.ts', 'src/carrier/naming.ts', 'src/carrier/read.ts', 'src/carrier/text.ts', 'src/html.ts'];

describe('module boundaries', () => {
  it('[S.11] orz-markdown/carrier/shell is parser-free: its value-import graph is src/carrier/shell plus the parser-free reader, what ships (the CommonJS dist) bundles for the browser under 82 KB minified with no parser module, the package exports it, and orz-markdown/carrier does not import it', async () => {
    const graph = [...valueImports('src/carrier/shell/index.ts')].sort();
    expect(graph).toEqual([
      ...READER_GRAPH,
      'src/carrier/shell/brand.ts', 'src/carrier/shell/chrome.ts', 'src/carrier/shell/conflict.ts', 'src/carrier/shell/file-side.ts', 'src/carrier/shell/host-side.ts', 'src/carrier/shell/index.ts', 'src/carrier/shell/indicator.ts',
      'src/carrier/shell/preferences.ts', 'src/carrier/shell/protocol.ts', 'src/carrier/shell/save.ts', 'src/carrier/shell/types.ts', 'src/carrier/shell/update.ts',
    ].sort());
    const { build } = await import('esbuild');
    // what ships: the CommonJS dist a carrier bundles (build first: `npm run build`)
    expect(existsSync('dist/carrier/shell/index.js'), 'dist/ is missing: run npm run build').toBe(true);
    const out = await build({ entryPoints: ['dist/carrier/shell/index.js'], bundle: true, minify: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent', metafile: true });
    const size = out.outputFiles[0].contents.byteLength;
    expect(size).toBeLessThan(SHELL_BUNDLE_LIMIT);
    expect(Object.keys(out.metafile!.inputs).filter((f) => !f.startsWith('dist/carrier/shell/')).sort()).toEqual(READER_GRAPH.map((f) => f.replace(/^src\//, 'dist/').replace(/\.ts$/, '.js')));
    // the source bundles smaller (tree-shaken ESM); the dist is the bound because it is what ships
    const src = await build({ entryPoints: ['src/carrier/shell/index.ts'], bundle: true, minify: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent' });
    expect(src.outputFiles[0].contents.byteLength).toBeLessThan(size);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { exports: Record<string, string> };
    expect(pkg.exports['./carrier/shell']).toBe('./dist/carrier/shell/index.js');
    const carrierGraph = [...valueImports('src/carrier.ts')];
    expect(carrierGraph.filter((f) => f.includes('carrier/shell'))).toEqual([]);
    if (existsSync('dist/carrier/shell/index.js')) {
      const dist = (await import('../dist/carrier/shell/index.js')) as Record<string, unknown>;
      expect(typeof dist.createSaver).toBe('function');
    }
  });

  it('[K.20] [S.11] what ships: dist/carrier/read.js (the parser-free reader the shell and the update verify with) bundles under 30 KB minified with no parser module', async () => {
    expect(existsSync('dist/carrier/read.js'), 'dist/ is missing: run npm run build').toBe(true);
    const { build } = await import('esbuild');
    const out = await build({ entryPoints: ['dist/carrier/read.js'], bundle: true, minify: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent', metafile: true });
    expect(out.outputFiles[0].contents.byteLength).toBeLessThan(READ_BUNDLE_LIMIT);
    expect(Object.keys(out.metafile!.inputs).sort()).toEqual(READER_GRAPH.map((f) => f.replace(/^src\//, 'dist/').replace(/\.ts$/, '.js')));
  });

  it('[S.11] importing the shell touches no window, document, storage, IndexedDB, navigator or location: the bundle loads in a context where each of them throws', async () => {
    const { build } = await import('esbuild');
    const out = await build({ entryPoints: ['src/carrier/shell/index.ts'], bundle: true, platform: 'neutral', format: 'cjs', write: false, logLevel: 'silent' });
    const touched: string[] = [];
    const ctx: Record<string, unknown> = { module: { exports: {} }, setTimeout, clearTimeout, setInterval, clearInterval };
    for (const name of ['window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'location', 'self', 'parent', 'showSaveFilePicker', 'fetch', 'crypto']) {
      Object.defineProperty(ctx, name, { get() { touched.push(name); throw new Error(`touched ${name}`); } });
    }
    ctx.exports = (ctx.module as { exports: unknown }).exports;
    vm.createContext(ctx);
    vm.runInContext(out.outputFiles[0].text, ctx);
    const api = (ctx.module as { exports: Record<string, (...a: unknown[]) => unknown> }).exports;
    expect(touched).toEqual([]);
    expect(Object.keys(api)).toContain('connectHost');
    // and at call time a throwing window degrades instead of throwing
    const prefs = api.createPreferenceStore(UID) as { get(k: string): unknown };
    expect(prefs.get('viewMode')).toBe('split');
    const conn = api.connectHost({ kind: 'md' }) as { connected(): boolean };
    expect(conn.connected()).toBe(false);
  });
});

// ── S.12 real Chrome ─────────────────────────────────────────────────────

type Browser = import('playwright-core').Browser;
type Page = import('playwright-core').Page;

async function launch(): Promise<Browser | null> {
  try {
    const { chromium } = await import('playwright-core');
    return await chromium.launch({ channel: 'chrome' });
  } catch {
    return null;
  }
}

const browser = await launch();
const chrome = browser ? describe : describe.skip;

chrome('real Chrome (playwright-core, channel chrome)', { timeout: 60_000 }, () => {
  let bundle = '';
  const servers: http.Server[] = [];
  let A = ''; // host origin
  let B = ''; // file origin (another port: another origin)

  const FILE_PAGE = `<!doctype html><meta charset="utf-8"><title>file</title><body><p id="live">LIVE DOM — not the saved bytes</p>
<script src="/shell.js"></script>
<script>
  var q = new URLSearchParams(location.search);
  window.__log = { ready: [], ops: null, available: 0 };
  window.__conn = OrzShell.connectHost({
    kind: q.get('kind') || 'md',
    timeouts: { save: Number(q.get('save') || 10000) },
    onReady: function (p, o) { __log.ready.push([p, o]); },
    ai: { onOperations: function (o) { __log.ops = o; } },
    include: { onAvailable: function () { __log.available++; } },
  });
</script>`;
  const EVIL_PAGE = `<!doctype html><meta charset="utf-8"><body><script>
  window.attack = function () {
    var f = parent.frames[0];
    f.postMessage({ type: 'orz-host-hello', protocol: 'orz-host-save', version: 1 }, '*');
    f.postMessage({ type: 'orz-host-ai-hello', protocol: 'orz-host-ai', version: 1, operations: [{ id: 'x', title: 'X' }] }, '*');
    f.postMessage({ type: 'orz-host-include-hello', protocol: 'orz-host-include', version: 1 }, '*');
  };
</script>`;

  beforeAll(async () => {
    const { build } = await import('esbuild');
    const out = await build({ entryPoints: ['src/carrier/shell/index.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'OrzShell', write: false, logLevel: 'silent' });
    bundle = out.outputFiles[0].text;
    const handler: http.RequestListener = (req, res) => {
      const path = (req.url ?? '/').split('?')[0];
      if (path === '/shell.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle); return; }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      if (path === '/file.html') res.end(FILE_PAGE);
      else if (path === '/evil.html') res.end(EVIL_PAGE);
      else res.end('<!doctype html><meta charset="utf-8"><body><script src="/shell.js"></script>');
    };
    for (let i = 0; i < 2; i++) {
      const s = http.createServer(handler);
      await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
      servers.push(s);
    }
    A = `http://127.0.0.1:${(servers[0].address() as AddressInfo).port}`;
    B = `http://127.0.0.1:${(servers[1].address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    for (const s of servers) s.close();
  });

  async function hostPage(fileQuery = ''): Promise<Page> {
    const page = await browser!.newPage();
    await page.goto(`${A}/host.html`);
    await page.evaluate(({ src }) => {
      const w = window as unknown as Record<string, unknown>;
      w.__raw = [] as unknown[];
      window.addEventListener('message', (e) => { (w.__raw as unknown[]).push({ type: (e.data as { type?: string })?.type, origin: e.origin }); });
      const f = document.createElement('iframe');
      f.src = src;
      document.body.appendChild(f);
      w.__iframe = f;
    }, { src: `${B}/file.html${fileQuery}` });
    await page.waitForFunction(() => {
      const f = (window as unknown as { __iframe: HTMLIFrameElement }).__iframe;
      try { return f.contentWindow !== null && document.readyState === 'complete'; } catch { return false; }
    });
    return page;
  }

  const fileFrame = async (page: Page) => {
    let frame = page.frames().find((f) => f.url().startsWith(`${B}/file.html`));
    for (let i = 0; !frame && i < 100; i++) {
      await page.waitForTimeout(20);
      frame = page.frames().find((f) => f.url().startsWith(`${B}/file.html`));
    }
    await frame!.waitForFunction(() => typeof (window as unknown as { __conn?: unknown }).__conn === 'object');
    return frame!;
  };

  it('[S.12] [S.9] [S.10] across a real cross-origin iframe, the file and host sides handshake all three protocols and round-trip save (exact CRLF/BOM text and assembled html), dirty, AI and include', async () => {
    const page = await hostPage();
    const file = await fileFrame(page);
    await page.evaluate((origin) => {
      const w = window as unknown as Record<string, any>;
      w.__saves = [];
      w.__dirty = [];
      w.__readies = [];
      w.__frame = w.OrzShell.embedCarrierFrame(w.__iframe, {
        expectedOrigin: origin,
        onSave: async (p: unknown) => { w.__saves.push(p); return { ok: true }; },
        onDirty: (d: boolean) => { w.__dirty.push(d); },
        onReady: (i: unknown) => { w.__readies.push(i); },
        ai: { operations: [{ id: 'improve', title: 'Improve', selection: true }], run: async (r: { text: string }) => ({ ok: true, proposed: `[${r.text}]` }) },
        include: { resolve: async (u: string) => (u.endsWith('.md') ? `# included ${u}` : null) },
      });
    }, B);
    await page.waitForFunction(() => (window as unknown as { __frame: { ready(): boolean } }).__frame.ready());
    const texts = FORMAT1_TEXTS;
    const htmls = texts.map((t) => assembleEnvelope(t, PARTS));
    const res = await file.evaluate(async ({ texts, htmls }) => {
      const c = (window as unknown as { __conn: HostConnection }).__conn;
      const saves = [];
      for (let i = 0; i < texts.length; i++) saves.push(await c.save({ source: texts[i], html: htmls[i] }));
      c.setDirty(true);
      return {
        saves,
        ai: await c.requestAi('improve', 'abc', true),
        include: await c.requestInclude('https://example.org/a.md'),
        declined: await c.requestInclude('https://example.org/a.txt'),
        log: (window as unknown as { __log: unknown }).__log,
        origin: c.origin(),
      };
    }, { texts, htmls });
    expect(res.saves).toEqual(texts.map(() => ({ ok: true })));
    expect(res.ai).toEqual({ ok: true, proposed: '[abc]' });
    expect([res.include, res.declined]).toEqual(['# included https://example.org/a.md', null]);
    expect(res.origin).toBe(A);
    expect(res.log).toMatchObject({ ops: [{ id: 'improve', title: 'Improve', selection: true }], available: 1 });
    await page.waitForFunction(() => (window as unknown as { __dirty: boolean[] }).__dirty.includes(true));
    const got = await page.evaluate(() => (window as unknown as { __saves: Array<{ source: string; html: string }> }).__saves);
    expect(got.map((s) => s.source)).toEqual(texts); // CRLF, CR, BOM, </script>, astral — exact
    expect(got.every((s, i) => s.html === htmls[i] && extract(s.html)!.text === texts[i])).toBe(true);
    const kinds = await page.evaluate(() => { const f = (window as unknown as { __frame: { kind(): string } }).__frame; return f.kind(); });
    expect(kinds).toBe('md');
    await page.close();
  });

  it('[S.12] [S.6] in Chrome: before a hello the file posts nothing; a sibling frame\'s hellos are ignored; repeated hellos get a ready each while onReady fires once; a wrong expectedOrigin makes the browser drop the hello', async () => {
    const page = await hostPage();
    await page.evaluate((src) => {
      const f = document.createElement('iframe');
      f.src = src;
      document.body.appendChild(f);
    }, `${B}/evil.html`);
    const file = await fileFrame(page);
    const early = await file.evaluate(async () => {
      const c = (window as unknown as { __conn: HostConnection }).__conn;
      return { ai: await c.requestAi('x', 't'), inc: await c.requestInclude('https://x/a.md'), save: await c.save({ source: 's', html: 'h' }) };
    });
    expect(early).toEqual({ ai: { ok: false, error: 'No AI host.' }, inc: null, save: { ok: false, error: 'not-connected' } });
    const evil = page.frames().find((f) => f.url().startsWith(`${B}/evil.html`))!;
    await evil.waitForFunction(() => typeof (window as unknown as { attack?: unknown }).attack === 'function');
    await evil.evaluate(() => (window as unknown as { attack(): void }).attack());
    await page.waitForTimeout(200);
    const afterAttack = await file.evaluate(() => ({ p: (window as unknown as { __conn: HostConnection }).__conn.protocols(), log: (window as unknown as { __log: { ready: unknown[] } }).__log.ready }));
    expect(afterAttack).toEqual({ p: { save: false, ai: false, include: false }, log: [] });
    expect(await page.evaluate(() => (window as unknown as { __raw: unknown[] }).__raw.length)).toBe(0);
    // a host whose expectedOrigin is wrong: the browser drops its hellos (targetOrigin) and it times out
    await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      w.__timeouts = [];
      w.__wrong = w.OrzShell.embedCarrierFrame(w.__iframe, { expectedOrigin: 'http://127.0.0.1:9', onSave: async () => ({ ok: true }), helloIntervalMs: 50, helloMaxMs: 400, onHelloTimeout: (p: string) => w.__timeouts.push(p) });
    });
    await page.waitForFunction(() => (window as unknown as { __timeouts: string[] }).__timeouts.length > 0);
    expect(await file.evaluate(() => (window as unknown as { __conn: HostConnection }).__conn.connected())).toBe(false);
    // the real parent, three hellos by hand
    await page.evaluate((origin) => {
      const f = (window as unknown as { __iframe: HTMLIFrameElement }).__iframe;
      for (let i = 0; i < 3; i++) f.contentWindow!.postMessage({ type: 'orz-host-hello', protocol: 'orz-host-save', version: 1 }, origin);
    }, B);
    await page.waitForFunction(() => (window as unknown as { __raw: Array<{ type: string }> }).__raw.filter((m) => m.type === 'orz-host-ready').length === 3);
    const after = await file.evaluate(() => ({ c: (window as unknown as { __conn: HostConnection }).__conn.connected(), ready: (window as unknown as { __log: { ready: unknown[] } }).__log.ready }));
    expect(after).toEqual({ c: true, ready: [['orz-host-save', A]] });
    const raw = await page.evaluate(() => (window as unknown as { __raw: Array<{ origin: string }> }).__raw);
    expect(raw.every((m) => m.origin === B)).toBe(true);
    await page.close();
  });

  it('[S.12] [S.7] in Chrome: a host that never acknowledges makes the file\'s save fail after its timeout, with the document left to the caller (still dirty)', async () => {
    const page = await hostPage('?save=300');
    const file = await fileFrame(page);
    await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      w.__frame = w.OrzShell.embedCarrierFrame(w.__iframe, { onSave: () => new Promise(() => undefined) });
    });
    await file.waitForFunction(() => (window as unknown as { __conn: HostConnection }).__conn.connected());
    const r = await file.evaluate(async () => {
      const t0 = performance.now();
      const res = await (window as unknown as { __conn: HostConnection }).__conn.save({ source: 's', html: 'h' });
      return { res, ms: performance.now() - t0 };
    });
    expect(r.res).toEqual({ ok: false, error: 'No response from the host.' });
    expect(r.ms).toBeGreaterThanOrEqual(290);
    await page.close();
  });

  it('[S.12] [S.1] [S.4] [S.13] in Chrome: the download fallback writes a file whose bytes equal the given html (UTF-8), named suggestedName — not the live DOM; a served page gets the notice and no download; AbortError downloads nothing', async () => {
    const page = await browser!.newPage();
    await page.setContent('<!doctype html><html><body><p id="live">LIVE DOM — must not be saved</p></body></html>');
    await page.addScriptTag({ content: bundle });
    // CR LF and a lone CR in the assembled bytes themselves (shell markup): a save that normalises line endings is caught
    const html = assembleEnvelope('{{nyml\r\nkind: document\r\ntitle: 漢字 🎉\r\n}}\r\n\r\n# Ünïcode — 𝒳\r\n', { ...PARTS, headHtml: `${PARTS.headHtml ?? ''}<style>\r\n/* CR LF */\r\n.x{}\r</style>` });
    expect(html).toContain('\r\n/* CR LF */\r\n.x{}\r<');
    await page.evaluate(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }); });
    const [download, result] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate((h) => (window as unknown as { OrzShell: { createSaver(o: unknown): { save(i: unknown): Promise<unknown> } } }).OrzShell.createSaver({ suggestedName: 'week3.md.html', kind: 'md' }).save({ text: 't', html: h }), html),
    ]);
    expect(result).toEqual({ via: 'download', ok: true, confirmed: false, name: 'week3.md.html' });
    expect(download.suggestedFilename()).toBe('week3.md.html');
    const bytes = readFileSync((await download.path())!);
    expect(bytes.equals(Buffer.from(html, 'utf8'))).toBe(true);
    expect(bytes.includes(Buffer.from('LIVE DOM'))).toBe(false);
    // a picker that throws a non-abort error falls back to the download; AbortError does not
    await page.evaluate(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: async () => { throw new DOMException('no gesture', 'SecurityError'); }, configurable: true }); });
    const [d2] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => (window as unknown as { OrzShell: { createSaver(o: unknown): { save(i: unknown): Promise<unknown> } } }).OrzShell.createSaver({ suggestedName: 'b.md.html', kind: 'md' }).save({ text: 't', html: 'B' })),
    ]);
    expect(readFileSync((await d2.path())!).toString('utf8')).toBe('B');
    let downloads = 0;
    page.on('download', () => { downloads++; });
    await page.evaluate(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: async () => { throw new DOMException('cancelled', 'AbortError'); }, configurable: true }); });
    const cancelled = await page.evaluate(() => (window as unknown as { OrzShell: { createSaver(o: unknown): { save(i: unknown): Promise<unknown> } } }).OrzShell.createSaver({ suggestedName: 'c.md.html', kind: 'md' }).save({ text: 't', html: 'C' }));
    expect(cancelled).toEqual({ via: 'file', ok: false, error: 'cancelled', picked: true, opened: false });
    // served over http: the notice, no picker, no download
    await page.goto(`${A}/blank.html`);
    const served = await page.evaluate(() => (window as unknown as { OrzShell: { createSaver(o: unknown): { save(i: unknown): Promise<unknown> } } }).OrzShell.createSaver({ suggestedName: 'd.md.html', kind: 'md' }).save({ text: 't', html: 'D' }));
    expect(served).toEqual({ via: 'served-notice' });
    await page.waitForTimeout(300);
    expect(downloads).toBe(0);
    await page.close();
  });

  /**
   * Drives `createSaver` in a page with REAL handles: the picker cannot be automated, so it is replaced by a
   * function returning a real `FileSystemFileHandle` from the origin-private file system — by default the
   * file of the page's own folder (`folder`), else `pick` (`{ folder, name }`: a picker that opened in
   * another folder, or a file of another name). IndexedDB, structured clone of the handle, queryPermission,
   * getFile and the writes are real; only `location` is presented as file:// (a served page would get the
   * notice) — one origin, as every file: page shares one IndexedDB. `seed` writes files first (the opened
   * file on "disk"); `opened` is the saver's `openedHtml` (the bytes the page loaded).
   */
  const fsaRun = (page: import('playwright-core').Page, args: { uid?: string; name: string; html: string; folder?: string; opened?: string; seed?: Array<[string, string, string]>; pick?: { folder: string; name: string } }) => page.evaluate(async ({ uid, name, html, folder, opened, seed, pick }) => {
    const w = window as unknown as Record<string, any>;
    w.__picks = w.__picks ?? 0;
    const root = await navigator.storage.getDirectory();
    const fileIn = async (d: string, n: string) => (await root.getDirectoryHandle(d, { create: true })).getFileHandle(n, { create: true });
    for (const [d, n, data] of seed ?? []) { const wr = await (await fileIn(d, n)).createWritable(); await wr.write(data); await wr.close(); }
    const fileWin = {
      location: { protocol: 'file:', href: `file:///Users/me/${folder}/${name}#x`, pathname: `/Users/me/${folder}/${name}` },
      document, indexedDB, Blob, URL, setTimeout: setTimeout.bind(window),
      showSaveFilePicker: async (o: { suggestedName: string }) => { w.__picks++; return fileIn(pick ? pick.folder : folder!, pick ? pick.name : o.suggestedName); },
    };
    const saver = w.OrzShell.createSaver({ uid, suggestedName: name, kind: 'md', window: fileWin, ...(opened !== undefined ? { openedHtml: opened } : {}) });
    const result = await saver.save({ text: 't', html });
    const read = async (f: string, n = name): Promise<string | null> => {
      try { return await (await (await (await root.getDirectoryHandle(f)).getFileHandle(n)).getFile()).text(); } catch { return null; }
    };
    const keys = await new Promise<string[]>((res) => {
      const r = indexedDB.open('orz-carrier', 1);
      r.onsuccess = () => { const g = r.result.transaction('handles').objectStore('handles').getAllKeys(); g.onsuccess = () => { res(g.result as string[]); r.result.close(); }; };
      r.onerror = () => res([]);
    });
    const stored = await new Promise<boolean>((res) => {
      const r = indexedDB.open('orz-carrier', 1);
      r.onsuccess = () => { const g = r.result.transaction('handles').objectStore('handles').get(saver.handleKey()); g.onsuccess = () => { res(g.result?.handle instanceof FileSystemFileHandle && typeof g.result?.sha256 === 'string'); r.result.close(); }; };
      r.onerror = () => res(false);
    });
    return { result, picks: w.__picks, content: await read(folder!), docs: await read('Docs'), downloads: await read('Downloads'), other: pick ? await read(pick.folder, pick.name) : null, keys: keys.sort(), stored, key: saver.handleKey() };
  }, { folder: 'Docs', ...args });

  it('[S.12] [S.3] in Chrome: a real FileSystemFileHandle round-trips through IndexedDB under the uid and page location (else the page URL) with the hash of what was written; after a reload the second save writes the opened file without the picker; a copy with another name, or with the same name in another folder, gets the picker and the original keeps its handle', async () => {
    const ctx = await browser!.newContext();
    const page = await ctx.newPage();
    await page.goto(`${A}/blank.html`);
    const run = (args: Parameters<typeof fsaRun>[1]) => fsaRun(page, args);
    const r1 = await run({ uid: UID, name: 'notes.md.html', html: '<!doctype html>one', opened: 'v0', seed: [['Docs', 'notes.md.html', 'v0']] });
    expect(r1).toEqual({ result: { via: 'file', ok: true, picked: true, opened: true, name: 'notes.md.html' }, picks: 1, content: '<!doctype html>one', docs: '<!doctype html>one', downloads: null, other: null, keys: [`${UID} file:///Users/me/Docs/notes.md.html`], stored: true, key: `${UID} file:///Users/me/Docs/notes.md.html` });
    const r2 = await run({ uid: UID, name: 'notes.md.html', html: '<!doctype html>two', opened: '<!doctype html>one' });
    expect([r2.picks, r2.content, r2.result]).toEqual([1, '<!doctype html>two', { via: 'file', ok: true, picked: false, opened: true, name: 'notes.md.html' }]); // a new saver of the page that loaded "one": the remembered handle, no picker
    await page.reload();
    const r3 = await run({ uid: UID, name: 'notes.md.html', html: '<!doctype html>three — 漢字\r\n', opened: '<!doctype html>two' });
    expect(r3).toMatchObject({ result: { via: 'file', ok: true, picked: false, opened: true }, picks: 0, content: '<!doctype html>three — 漢字\r\n' });
    const r4 = await run({ uid: UID, name: 'copy.md.html', html: 'copy', opened: 'copy0', seed: [['Docs', 'copy.md.html', 'copy0']] });
    expect([r4.picks, r4.content]).toEqual([1, 'copy']);
    // [A-1] the same name and uid in another folder: the picker, never the original's handle
    const r5 = await run({ uid: UID, name: 'notes.md.html', html: 'COPY in Downloads', folder: 'Downloads', opened: 'copied', seed: [['Downloads', 'notes.md.html', 'copied']] });
    expect([r5.result, r5.picks, r5.content, r5.docs]).toEqual([{ via: 'file', ok: true, picked: true, opened: true, name: 'notes.md.html' }, 2, 'COPY in Downloads', '<!doctype html>three — 漢字\r\n']);
    const r6 = await run({ uid: UID, name: 'notes.md.html', html: 'original again', opened: '<!doctype html>three — 漢字\r\n' });
    expect([r6.result.picked, r6.picks, r6.docs]).toEqual([false, 2, 'original again']);
    const r7 = await run({ name: 'plain.md.html', html: 'plain', opened: 'p0', seed: [['Docs', 'plain.md.html', 'p0']] });
    expect(r7.keys).toEqual(['file:///Users/me/Docs/plain.md.html', `${UID} file:///Users/me/Docs/copy.md.html`, `${UID} file:///Users/me/Docs/notes.md.html`, `${UID} file:///Users/me/Downloads/notes.md.html`].sort());
    expect(r7.stored).toBe(true);
    await ctx.close();
  });

  it('[S.12] [S.3] [S.13] in Chrome (F2): the picker opens in Downloads and the reader accepts notes.md.html there while the page is Docs/notes.md.html — the result says picked, not the opened file; after a reload the page that reopened the Docs file gets the picker and the Downloads file is never overwritten; a picked file of another name in the page\'s own folder is not reused after a reload either', async () => {
    const ctx = await browser!.newContext();
    const page = await ctx.newPage();
    await page.goto(`${A}/blank.html`);
    const run = (args: Parameters<typeof fsaRun>[1]) => fsaRun(page, args);
    const seed: Array<[string, string, string]> = [['Docs', 'notes.md.html', 'v0 (the opened file)']];
    const r1 = await run({ uid: UID, name: 'notes.md.html', html: 'v1: edits of session 1', opened: 'v0 (the opened file)', seed, pick: { folder: 'Downloads', name: 'notes.md.html' } });
    expect([r1.result, r1.picks, r1.docs, r1.downloads, r1.keys]).toEqual([{ via: 'file', ok: true, picked: true, opened: false, name: 'notes.md.html' }, 1, 'v0 (the opened file)', 'v1: edits of session 1', []]);
    await page.reload(); // (the picker count is per page load)
    // the reader reopens Docs/notes.md.html (v0), edits it and saves: the picker (never the remembered Downloads file); this time they choose the Docs file
    const r2 = await run({ uid: UID, name: 'notes.md.html', html: 'v0 + edits of session 2', opened: 'v0 (the opened file)' });
    expect([r2.result, r2.picks, r2.docs, r2.downloads]).toEqual([{ via: 'file', ok: true, picked: true, opened: true, name: 'notes.md.html' }, 1, 'v0 + edits of session 2', 'v1: edits of session 1']);
    // ... and from now on the Docs file is remembered (proved by content): the next load writes it without the picker
    await page.reload();
    const r3 = await run({ uid: UID, name: 'notes.md.html', html: 'session 3', opened: 'v0 + edits of session 2' });
    expect([r3.result.picked, r3.result.opened, r3.picks, r3.docs, r3.downloads]).toEqual([false, true, 0, 'session 3', 'v1: edits of session 1']);
    // T1: same location, a picked file of another name ("Save as" notes copy.md.html beside it), then a reload: the picker
    await page.reload();
    const t1 = await run({ uid: UID, name: 'other.md.html', html: 'other v1', opened: 'o0', seed: [['Docs', 'other.md.html', 'o0']], pick: { folder: 'Docs', name: 'other copy.md.html' } });
    expect([t1.result, t1.other]).toEqual([{ via: 'file', ok: true, picked: true, opened: false, name: 'other copy.md.html' }, 'other v1']);
    await page.reload();
    const t2 = await run({ uid: UID, name: 'other.md.html', html: 'other v2', opened: 'o0' });
    expect([t2.result, t2.picks, t2.content]).toEqual([{ via: 'file', ok: true, picked: true, opened: true, name: 'other.md.html' }, 1, 'other v2']);
    expect(await page.evaluate(async () => (await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Docs')).getFileHandle('other copy.md.html')).getFile()).text())).toBe('other v1');
    await ctx.close();
  });
});
