/**
 * The shell runtime (`orz-markdown/carrier/shell`, src/carrier/shell/):
 * claims S.1–S.12 in notes/CLAIMS.md; specs spec/shell-runtime.md and
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
import http from 'node:http';
import vm from 'node:vm';
import type { AddressInfo } from 'node:net';
import {
  connectHost, embedCarrierFrame, createSaver, createPreferenceStore, preferenceNamespace, READER_PREFERENCES,
  MSG, KIND_EXTENSIONS, HOST_KINDS, SHELL_UID_PATTERN, SAVE_ACK_TIMEOUT_MS, AI_TIMEOUT_MS, INCLUDE_TIMEOUT_MS, HELLO_INTERVAL_MS, HELLO_MAX_MS,
  type MessageListener, type HandleStore, type StoredHandle, type FileHandleLike, type SaverWindow, type StorageLike, type HostConnection,
} from '../src/carrier/shell';
import { assembleEnvelope, extract, UID_PATTERN, type ShellParts } from '../src/carrier';

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

function fakeHandle(name = 'notes.md.html', perm: { query?: string; request?: string } = {}) {
  const writes: unknown[] = [];
  const calls = { query: 0, request: 0 };
  const handle: FileHandleLike & { writes: unknown[]; calls: typeof calls; fail?: boolean } = {
    name,
    writes,
    calls,
    async createWritable() {
      if (handle.fail) throw new Error('disk full');
      return { write: async (d: unknown) => { writes.push(d); }, close: async () => undefined };
    },
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

  it('[S.1] an unconnected host is skipped; a served page (http/https) returns the served notice without picker or download; otherwise File System Access; without it a download', async () => {
    const off = fakeHostConnection(false);
    for (const protocol of ['http:', 'https:']) {
      const s = fakeSaverWindow({ protocol, href: `${protocol}//site.example/notes.md.html`, picker: async () => fakeHandle() });
      expect(await createSaver({ suggestedName: 'notes.md.html', kind: 'md', host: off.conn, window: s.win }).save(input)).toEqual({ via: 'served-notice' });
      expect([s.picks.length, s.downloads.length]).toEqual([0, 0]);
    }
    const h = fakeHandle();
    const f = fakeSaverWindow({ picker: async () => h });
    expect(await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', host: off.conn, window: f.win, handleStore: memoryHandleStore().store }).save(input)).toEqual({ via: 'file', ok: true });
    expect(h.writes).toEqual(['<!doctype html>X']);
    const d = fakeSaverWindow();
    expect(await createSaver({ suggestedName: 'notes.md.html', kind: 'md', window: d.win }).save(input)).toEqual({ via: 'download', ok: true });
    expect(d.downloads).toEqual([{ name: 'notes.md.html', parts: ['<!doctype html>X'] }]);
    expect(off.saves).toEqual([]);
  });

  it('[S.1] the served notice offers download(): it downloads the given html under the suggested name', async () => {
    const s = fakeSaverWindow({ protocol: 'https:', href: 'https://site.example/a/deck.slides.html' });
    const saver = createSaver({ suggestedName: 'deck.slides.html', kind: 'slides', window: s.win });
    expect(await saver.save(input)).toEqual({ via: 'served-notice' });
    expect(await saver.download({ html: 'H' })).toEqual({ via: 'download', ok: true });
    expect(s.downloads).toEqual([{ name: 'deck.slides.html', parts: ['H'] }]);
  });

  it('[S.2] the picker gets the suggested name and the kind\'s extension; AbortError is { via: file, ok: false, error: cancelled } with no download; other picker errors and write errors download', async () => {
    for (const kind of HOST_KINDS) {
      const f = fakeSaverWindow({ picker: async () => fakeHandle() });
      await createSaver({ suggestedName: `x${KIND_EXTENSIONS[kind]}`, kind, window: f.win, handleStore: memoryHandleStore().store }).save(input);
      expect(f.picks[0]).toMatchObject({ suggestedName: `x${KIND_EXTENSIONS[kind]}`, types: [{ accept: { 'text/html': [KIND_EXTENSIONS[kind], '.html'] } }] });
    }
    expect(KIND_EXTENSIONS).toEqual({ md: '.md.html', slides: '.slides.html', paged: '.paged.html', poster: '.poster.html' });
    const a = fakeSaverWindow({ picker: async () => { throw abort(); } });
    expect(await createSaver({ suggestedName: 'n.md.html', kind: 'md', window: a.win, handleStore: memoryHandleStore().store }).save(input)).toEqual({ via: 'file', ok: false, error: 'cancelled' });
    expect(a.downloads).toEqual([]);
    const n = fakeSaverWindow({ picker: async () => { throw Object.assign(new Error('no gesture'), { name: 'SecurityError' }); } });
    expect(await createSaver({ suggestedName: 'n.md.html', kind: 'md', window: n.win, handleStore: memoryHandleStore().store }).save(input)).toEqual({ via: 'download', ok: true });
    const broken = fakeHandle();
    broken.fail = true;
    const w = fakeSaverWindow({ picker: async () => broken });
    expect(await createSaver({ suggestedName: 'n.md.html', kind: 'md', window: w.win, handleStore: memoryHandleStore().store }).save(input)).toEqual({ via: 'download', ok: true });
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
      const old = fakeHandle('notes.md.html', perm);
      const fresh = fakeHandle();
      const f = fakeSaverWindow({ picker: async () => fresh });
      const r = await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f.win, handleStore: memoryHandleStore({ [UID]: { handle: old, name: 'notes.md.html' } }).store }).save(input);
      expect(r, JSON.stringify(perm)).toEqual({ via: 'file', ok: true });
      expect(f.picks.length, JSON.stringify(perm)).toBe(picks);
      expect((picks ? fresh : old).writes, JSON.stringify(perm)).toEqual(['<!doctype html>X']);
    }
  });

  it('[S.3] the handle key is the header uid when well-formed, else the page URL without its fragment; the picked handle is stored under it', async () => {
    expect(SHELL_UID_PATTERN.source).toBe(UID_PATTERN.source);
    const mem = memoryHandleStore();
    const f = fakeSaverWindow({ picker: async () => fakeHandle() });
    const s1 = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f.win, handleStore: mem.store });
    expect(s1.handleKey()).toBe(UID);
    await s1.save(input);
    for (const uid of [undefined, '', 'doc-SHORT', 'not-a-uid']) {
      const s = createSaver({ uid, suggestedName: 'notes.md.html', kind: 'md', window: f.win, handleStore: mem.store });
      expect(s.handleKey()).toBe('file:///Users/me/notes.md.html');
    }
    await createSaver({ suggestedName: 'notes.md.html', kind: 'md', window: f.win, handleStore: mem.store }).save(input);
    expect([...mem.map.keys()]).toEqual([UID, 'file:///Users/me/notes.md.html']);
  });

  it('[S.3] a second save overwrites without prompting — in the same session and in a new one (remembered handle) — and a remembered handle for another file name (a copy carrying the same uid) is not used', async () => {
    const mem = memoryHandleStore();
    const h = fakeHandle('notes.md.html', { query: 'granted' });
    const f = fakeSaverWindow({ picker: async () => h });
    const s = createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f.win, handleStore: mem.store });
    await s.save({ text: 'a', html: 'one' });
    await s.save({ text: 'b', html: 'two' });
    expect([f.picks.length, h.writes]).toEqual([1, ['one', 'two']]);
    // a new session (fresh saver, same store)
    const f2 = fakeSaverWindow({ picker: async () => fakeHandle() });
    await createSaver({ uid: UID, suggestedName: 'notes.md.html', kind: 'md', window: f2.win, handleStore: mem.store }).save({ text: 'c', html: 'three' });
    expect([f2.picks.length, h.writes]).toEqual([0, ['one', 'two', 'three']]);
    // a copy opened as copy.md.html with the same uid
    const other = fakeHandle('copy.md.html');
    const f3 = fakeSaverWindow({ href: 'file:///Users/me/copy.md.html', picker: async () => other });
    await createSaver({ uid: UID, suggestedName: 'copy.md.html', kind: 'md', window: f3.win, handleStore: mem.store }).save({ text: 'd', html: 'four' });
    expect([f3.picks.length, h.writes.length, other.writes]).toEqual([1, 3, ['four']]);
    // IndexedDB unavailable (a store that keeps nothing): the session still remembers its handle
    const forgetful: HandleStore = { get: async () => undefined, put: async () => undefined, delete: async () => undefined };
    const h4 = fakeHandle('n.md.html', { query: 'prompt', request: 'denied' });
    const f4 = fakeSaverWindow({ picker: async () => h4 });
    const s4 = createSaver({ uid: UID, suggestedName: 'n.md.html', kind: 'md', window: f4.win, handleStore: forgetful });
    await s4.save({ text: 'a', html: '1' });
    await s4.save({ text: 'b', html: '2' });
    expect([f4.picks.length, h4.writes]).toEqual([1, ['1', '2']]);
  });

  it('[S.4] the save never reads the live DOM: no shell module names a DOM-reading or serializing API, and save writes exactly the html it is given', async () => {
    const forbidden = /\b(outerHTML|innerHTML|innerText|textContent|documentElement|XMLSerializer|cloneNode|querySelector(All)?|getElementById|getElementsBy\w+|serializeToString|\.head\b)\b/;
    const files = readdirSync('src/carrier/shell').filter((f) => f.endsWith('.ts'));
    expect(files.sort()).toEqual(['file-side.ts', 'host-side.ts', 'index.ts', 'preferences.ts', 'protocol.ts', 'save.ts', 'types.ts']);
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
    expect(await createSaver({ suggestedName: 'n.md.html', kind: 'md', window: win }).save({ text: 't', html: 'exact <b>bytes</b>' })).toEqual({ via: 'download', ok: true });
    expect(d.downloads[0].parts).toEqual(['exact <b>bytes</b>']);
  });

  it('[S.1] save never rejects: non-string input and an absent document report ok: false', async () => {
    expect(await createSaver({ suggestedName: 'n.md.html', kind: 'md', window: {} }).save({ text: 't', html: 'h' })).toEqual({ via: 'download', ok: false, error: 'Downloads are not available here.' });
    expect((await createSaver({ suggestedName: 'n.md.html', kind: 'md', window: {} }).save({ text: 't', html: 1 as unknown as string })).via).toBe('download');
  });
});

// ── S.5 preferences ──────────────────────────────────────────────────────

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } };
}

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
    expect(a.all()).toEqual({ splitRatio: 0.3, scrollSync: true, viewMode: 'split', editorFontSize: 14, darkChrome: null });
    expect(Object.keys(READER_PREFERENCES)).toEqual(['splitRatio', 'scrollSync', 'viewMode', 'editorFontSize', 'darkChrome']);
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

/** Measured 2026-10-05: 13,902 bytes minified (esbuild, ESM, browser). Bound = measurement + ~30 % margin. */
const SHELL_BUNDLE_LIMIT = 18_000;

describe('module boundaries', () => {
  it('[S.11] orz-markdown/carrier/shell is parser-free: its value-import graph is src/carrier/shell only, it bundles for the browser under 18 KB minified with no parser module, the package exports it, and orz-markdown/carrier does not import it', async () => {
    const graph = [...valueImports('src/carrier/shell/index.ts')].sort();
    expect(graph).toEqual(['src/carrier/shell/file-side.ts', 'src/carrier/shell/host-side.ts', 'src/carrier/shell/index.ts', 'src/carrier/shell/preferences.ts', 'src/carrier/shell/protocol.ts', 'src/carrier/shell/save.ts', 'src/carrier/shell/types.ts']);
    const { build } = await import('esbuild');
    const out = await build({ entryPoints: ['src/carrier/shell/index.ts'], bundle: true, minify: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent', metafile: true });
    const size = out.outputFiles[0].contents.byteLength;
    expect(size).toBeLessThan(SHELL_BUNDLE_LIMIT);
    expect(Object.keys(out.metafile!.inputs).filter((f) => !f.startsWith('src/carrier/shell/'))).toEqual([]);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { exports: Record<string, string> };
    expect(pkg.exports['./carrier/shell']).toBe('./dist/carrier/shell/index.js');
    const carrierGraph = [...valueImports('src/carrier.ts')];
    expect(carrierGraph.filter((f) => f.includes('carrier/shell'))).toEqual([]);
    if (existsSync('dist/carrier/shell/index.js')) {
      const dist = (await import('../dist/carrier/shell/index.js')) as Record<string, unknown>;
      expect(typeof dist.createSaver).toBe('function');
    }
  });

  it('[S.11] importing the shell touches no window, document, storage, IndexedDB, navigator or location: the bundle loads in a context where each of them throws', async () => {
    const { build } = await import('esbuild');
    const out = await build({ entryPoints: ['src/carrier/shell/index.ts'], bundle: true, platform: 'neutral', format: 'cjs', write: false, logLevel: 'silent' });
    const touched: string[] = [];
    const ctx: Record<string, unknown> = { module: { exports: {} }, setTimeout, clearTimeout, setInterval, clearInterval };
    for (const name of ['window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'location', 'self', 'parent', 'showSaveFilePicker']) {
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

  it('[S.12] [S.1] [S.4] in Chrome: the download fallback writes a file whose bytes equal the given html (UTF-8), named suggestedName — not the live DOM; a served page gets the notice and no download; AbortError downloads nothing', async () => {
    const page = await browser!.newPage();
    await page.setContent('<!doctype html><html><body><p id="live">LIVE DOM — must not be saved</p></body></html>');
    await page.addScriptTag({ content: bundle });
    const html = assembleEnvelope('{{nyml\r\nkind: document\r\ntitle: 漢字 🎉\r\n}}\r\n\r\n# Ünïcode — 𝒳\r\n', PARTS);
    await page.evaluate(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }); });
    const [download, result] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate((h) => (window as unknown as { OrzShell: { createSaver(o: unknown): { save(i: unknown): Promise<unknown> } } }).OrzShell.createSaver({ suggestedName: 'week3.md.html', kind: 'md' }).save({ text: 't', html: h }), html),
    ]);
    expect(result).toEqual({ via: 'download', ok: true });
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
    expect(cancelled).toEqual({ via: 'file', ok: false, error: 'cancelled' });
    // served over http: the notice, no picker, no download
    await page.goto(`${A}/blank.html`);
    const served = await page.evaluate(() => (window as unknown as { OrzShell: { createSaver(o: unknown): { save(i: unknown): Promise<unknown> } } }).OrzShell.createSaver({ suggestedName: 'd.md.html', kind: 'md' }).save({ text: 't', html: 'D' }));
    expect(served).toEqual({ via: 'served-notice' });
    await page.waitForTimeout(300);
    expect(downloads).toBe(0);
    await page.close();
  });

  it('[S.12] [S.3] in Chrome: a real FileSystemFileHandle round-trips through IndexedDB under the uid (else the page URL); after a reload the second save writes the file without the picker; a copy with another name gets the picker', async () => {
    const ctx = await browser!.newContext();
    const page = await ctx.newPage();
    await page.goto(`${A}/blank.html`);
    // The picker cannot be automated: it is replaced by a function returning a REAL handle from the
    // origin-private file system. IndexedDB, structured clone of the handle, queryPermission and the
    // writes are real; only `location` is presented as file:// (a served page would get the notice).
    const run = (args: { uid?: string; name: string; html: string }) => page.evaluate(async ({ uid, name, html }) => {
      const w = window as unknown as Record<string, any>;
      w.__picks = w.__picks ?? 0;
      const fileWin = {
        location: { protocol: 'file:', href: `file:///Users/me/${name}#x`, pathname: `/Users/me/${name}` },
        document, indexedDB, Blob, URL, setTimeout: setTimeout.bind(window),
        showSaveFilePicker: async (o: { suggestedName: string }) => { w.__picks++; const dir = await navigator.storage.getDirectory(); return dir.getFileHandle(o.suggestedName, { create: true }); },
      };
      const saver = w.OrzShell.createSaver({ uid, suggestedName: name, kind: 'md', window: fileWin });
      const result = await saver.save({ text: 't', html });
      const dir = await navigator.storage.getDirectory();
      let content: string | null = null;
      try { content = await (await (await dir.getFileHandle(name)).getFile()).text(); } catch { /* none */ }
      const keys = await new Promise<string[]>((res) => {
        const r = indexedDB.open('orz-carrier', 1);
        r.onsuccess = () => { const g = r.result.transaction('handles').objectStore('handles').getAllKeys(); g.onsuccess = () => { res(g.result as string[]); r.result.close(); }; };
        r.onerror = () => res([]);
      });
      const stored = await new Promise<boolean>((res) => {
        const r = indexedDB.open('orz-carrier', 1);
        r.onsuccess = () => { const g = r.result.transaction('handles').objectStore('handles').get(uid ?? `file:///Users/me/${name}`); g.onsuccess = () => { res(g.result?.handle instanceof FileSystemFileHandle); r.result.close(); }; };
        r.onerror = () => res(false);
      });
      return { result, picks: w.__picks, content, keys: keys.sort(), stored };
    }, args);
    const r1 = await run({ uid: UID, name: 'notes.md.html', html: '<!doctype html>one' });
    expect(r1).toEqual({ result: { via: 'file', ok: true }, picks: 1, content: '<!doctype html>one', keys: [UID], stored: true });
    const r2 = await run({ uid: UID, name: 'notes.md.html', html: '<!doctype html>two' });
    expect([r2.picks, r2.content]).toEqual([1, '<!doctype html>two']); // a new saver, same page: the remembered handle, no picker
    await page.reload();
    const r3 = await run({ uid: UID, name: 'notes.md.html', html: '<!doctype html>three — 漢字' });
    expect(r3).toMatchObject({ result: { via: 'file', ok: true }, picks: 0, content: '<!doctype html>three — 漢字' });
    const r4 = await run({ uid: UID, name: 'copy.md.html', html: 'copy' });
    expect([r4.picks, r4.content]).toEqual([1, 'copy']);
    const r5 = await run({ name: 'plain.md.html', html: 'plain' });
    expect(r5.keys).toEqual(['file:///Users/me/plain.md.html', UID].sort());
    expect(r5.stored).toBe(true);
    await ctx.close();
  });
});
