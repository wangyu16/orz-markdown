/**
 * Quiet updates and the shell chrome (`orz-markdown/carrier/shell`:
 * src/carrier/shell/update.ts, indicator.ts, chrome.ts): claims U.1–U.13 and
 * V.1–V.5 in notes/CLAIMS.md; spec/shell-runtime.md §6–§8.
 *
 * Three substrates. Decision logic (manifest, URLs, caching, semver, the
 * transaction's checks) runs against small fakes — a fake fetch, storage and
 * a fake sandbox iframe whose "bundle" is a function. The indicator and the
 * toasts run in happy-dom. What fakes lie about — SubtleCrypto on real
 * bytes, the opaque-origin sandbox, real postMessage sources, downloads, the
 * live DOM and shadow-root CSS isolation — runs in the installed Chrome
 * through playwright-core, against a fake CDN on a second local origin
 * serving a `release.json` and a bundle built from the core's
 * `assembleEnvelope` (dist/carrier.js); those tests skip when Chrome is absent.
 */
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import http from 'node:http';
import vm from 'node:vm';
import type { AddressInfo } from 'node:net';
import {
  checkForUpdate, reassemble, performUpdate, skipVersion, skippedVersion, parseManifest, manifestUrl, bundleUrl, browserPackage, isBundlePath,
  isScriptSafe, sandboxDocument, sha384Integrity, parseSemver, compareSemver, UpdateError, mountUpdateIndicator,
  CHROME_CSS, ICONS, createShadowRoot, showToast,
  UPDATE_CHECK_INTERVAL_MS, UPDATE_CACHE_PREFIX, UPDATE_SKIP_PREFIX, RELEASE_CDN_BASE, MANIFEST_TIMEOUT_MS, REASSEMBLE_TIMEOUT_MS,
  type ReleaseManifest, type FetchLike, type ResponseLike, type StorageLike, type UpdateInfo, type MessageListener, type UiDocument, type UiElement,
  type SaveResult, createSaver, type FileHandleLike, type HandleStore, type StoredHandle,
} from '../src/carrier/shell';
import { assembleEnvelope, extract, KIND_PACKAGE, type ShellParts } from '../src/carrier';
import { escapeScriptText } from '../src/html';

afterEach(() => {
  vi.useRealTimers();
});

// ── helpers ──────────────────────────────────────────────────────────────

const DAY = UPDATE_CHECK_INTERVAL_MS;
const T0 = Date.UTC(2026, 9, 5, 12);

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } };
}

const sri = (bytes: string | Uint8Array): string => `sha384-${createHash('sha384').update(bytes).digest('base64')}`;

function manifest(over: Partial<ReleaseManifest> & Record<string, unknown> = {}): ReleaseManifest {
  return {
    kind: 'md', version: '1.1.0', formats: [1], notes: 'https://github.com/wangyu16/orz-mdhtml/blob/main/CHANGELOG.md#110',
    bundle: { path: 'orz-mdhtml.browser.js', integrity: sri('bundle') },
    ...over,
  } as ReleaseManifest;
}

function response(body: string | Uint8Array, status = 200): ResponseLike {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.slice().buffer,
  };
}

/** A fetch that serves a route table and records every URL. */
function fakeFetch(routes: Record<string, () => ResponseLike | Promise<ResponseLike>>) {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const r = routes[url];
    if (!r) return response('not found', 404);
    return r();
  };
  return { fetch, calls };
}

const MD_MANIFEST_URL = 'https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@latest/release.json';

const PARTS = (version: string, over: Partial<ShellParts> = {}): ShellParts => ({ kind: 'md', shellVersion: version, delivery: 'inline', headHtml: '', bodyHtml: `<p>shell ${version}</p>`, ...over });

const TEXTS = [
  '\uFEFF{{nyml\r\nkind: document\r\ntitle: CRLF and BOM\r\nuid: doc-abcdefghij123456\r\n}}\r\n\r\n# Hi\r\n',
  '{{nyml\rkind: document\r}}\r\rclassic Mac line ends\r',
  '# </script><script>alert(1)</script> <!-- 𝒳 İ\n\n\t- tab\n',
  '',
];

// ── a fake page + sandbox for reassemble ─────────────────────────────────

type Assemble = (text: string, o: { delivery: string; engineSource: string; includes?: Record<string, string> }) => unknown;

/**
 * A page document and window; appending an iframe "boots" it: its window
 * posts ready from the iframe, then answers requests with `assemble`.
 * `log` records every DOM operation on the page.
 */
function fakePage(assemble: Assemble | null, opts: { silent?: boolean; forge?: boolean; stale?: boolean } = {}) {
  const listeners = new Set<MessageListener>();
  const log: string[] = [];
  const posted: unknown[] = [];
  const frames: Array<{ attrs: Record<string, string>; srcdoc: string; removed: boolean; contentWindow: unknown }> = [];
  const win = {
    addEventListener: (_t: 'message', l: MessageListener) => { listeners.add(l); },
    removeEventListener: (_t: 'message', l: MessageListener) => { listeners.delete(l); },
  };
  const emit = (data: unknown, source: unknown) => { for (const l of [...listeners]) l({ data: structuredClone(data), origin: 'null', source }); };
  const stranger = { postMessage() { /* another frame */ } };
  const body = {
    appendChild(node: { __frame?: (typeof frames)[number] }) {
      log.push('append');
      const f = node.__frame!;
      if (opts.silent) return node;
      setTimeout(() => {
        if (opts.forge) emit({ type: 'orz-reassembled', id: 'u1', ok: true, html: 'FORGED' }, stranger);
        emit({ type: 'orz-reassemble-ready' }, f.contentWindow);
      }, 0);
      return node;
    },
  };
  const document = {
    body,
    defaultView: win,
    createElement(tag: string) {
      log.push(`create ${tag}`);
      const attrs: Record<string, string> = {};
      const rec = { attrs, srcdoc: '', removed: false, contentWindow: null as unknown };
      const contentWindow = {
        postMessage(msg: { type: string; id: string; text: string; delivery: string; engineSource: string; includes?: Record<string, string> }, target: string) {
          if (rec.removed) return;
          expect(target).toBe('*');
          posted.push(msg);
          if (opts.silent) return;
          // a forger that knows the live request id, posting from another window, and with no source
          if (opts.forge) { emit({ type: 'orz-reassembled', id: msg.id, ok: true, html: 'FORGED' }, stranger); emit({ type: 'orz-reassembled', id: msg.id, ok: true, html: 'FORGED' }, null); }
          // the RIGHT source with a stale or foreign request id (an earlier request's answer, a replay)
          if (opts.stale) for (const id of ['u0', `${msg.id}x`, 'x', '']) emit({ type: 'orz-reassembled', id, ok: true, html: 'STALE' }, contentWindow);
          setTimeout(async () => {
            try {
              const html = await assemble!(msg.text, { delivery: msg.delivery, engineSource: msg.engineSource, ...(msg.includes ? { includes: msg.includes } : {}) });
              emit({ type: 'orz-reassembled', id: msg.id, ok: typeof html === 'string', html }, contentWindow);
            } catch (e) {
              emit({ type: 'orz-reassembled', id: msg.id, ok: false, error: String((e as Error).message) }, contentWindow);
            }
          }, 0);
        },
      };
      rec.contentWindow = contentWindow;
      frames.push(rec);
      const el = {
        __frame: rec,
        setAttribute: (n: string, v: string) => { attrs[n] = v; },
        get srcdoc() { return rec.srcdoc; },
        set srcdoc(v: string) { rec.srcdoc = v; },
        get contentWindow() { return rec.removed ? null : contentWindow; },
        remove() { rec.removed = true; log.push('remove'); },
      };
      return el;
    },
  };
  return { document: document as unknown as UiDocument, window: win, frames, log, listeners, emit, stranger, posted };
}

/** A release whose bundle is `bundle`, served by a fake fetch at the hard-coded URL. */
function served(bundle: string, over: Partial<ReleaseManifest> = {}, serveBytes?: string) {
  const m = manifest({ bundle: { path: 'orz-mdhtml.browser.js', integrity: sri(bundle) }, ...over });
  const url = bundleUrl(m);
  const f = fakeFetch({ [url]: () => response(serveBytes ?? bundle) });
  return { m, url, ...f };
}

const goodAssemble = (version = '1.1.0', over: Partial<ShellParts> = {}): Assemble => (text, o) => assembleEnvelope(text, PARTS(version, { delivery: o.delivery as 'inline' | 'cdn', ...(o.includes ? { includes: o.includes } : {}), ...over }));

// ── U.1 manifest and URLs ────────────────────────────────────────────────

describe('release manifest and URLs (spec/shell-runtime.md §6)', () => {
  it('[U.1] the manifest and bundle URLs are hard-coded patterns over KIND_PACKAGE and jsDelivr', () => {
    expect(RELEASE_CDN_BASE).toBe('https://cdn.jsdelivr.net/npm/');
    expect(KIND_PACKAGE).toEqual({ md: 'orz-mdhtml', slides: 'orz-slides', paged: 'orz-paged' });
    expect(manifestUrl('md')).toBe('https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@latest/release.json');
    expect(manifestUrl('slides')).toBe('https://cdn.jsdelivr.net/npm/orz-slides-browser@latest/release.json');
    expect(manifestUrl('paged')).toBe('https://cdn.jsdelivr.net/npm/orz-paged-browser@latest/release.json');
    expect(bundleUrl(manifest({ kind: 'paged', version: '2.3.4', bundle: { path: 'dist/orz-paged.browser.js', integrity: sri('x') } })))
      .toBe('https://cdn.jsdelivr.net/npm/orz-paged-browser@2.3.4/dist/orz-paged.browser.js');
    expect(browserPackage('md')).toBe('orz-mdhtml-browser');
    expect(() => browserPackage('poster' as 'md')).toThrow(/no releases/);
    // cdnBase is a code option (tests, a carrier's own code); it must be an absolute http(s) URL
    expect(manifestUrl('md', 'http://127.0.0.1:9/npm')).toBe('http://127.0.0.1:9/npm/orz-mdhtml-browser@latest/release.json');
    for (const bad of ['javascript:alert(1)//', '//cdn.example/', 'cdn.example/', 'https://x/?q=', 'https://x/#f', 'data:text/plain,']) {
      expect(() => manifestUrl('md', bad)).toThrow(/cdnBase/);
    }
  });

  it('[U.1] a bundle path must be a plain relative path: no "..", ".", scheme, query, fragment, backslash, leading slash or empty segment', () => {
    for (const ok of ['orz-mdhtml.browser.js', 'dist/orz.browser.js', 'a/b/c-1_2.js', '.hidden.js']) expect(isBundlePath(ok)).toBe(true);
    for (const bad of ['', '..', '../x.js', 'a/../b.js', './x.js', 'a/./b.js', '/abs.js', 'https://evil.example/x.js', 'javascript:alert(1)', 'x.js?v=1', 'x.js#f',
      'a\\b.js', 'a//b.js', 'a/', '%2e%2e/x.js', 'x y.js', '\u2024\u2024/x.js', 'a'.repeat(201), 3 as unknown as string]) {
      expect(isBundlePath(bad)).toBe(false);
    }
    expect(() => bundleUrl({ ...manifest(), bundle: { path: '../../evil/x.js', integrity: sri('x') } })).toThrow(/plain relative path/);
    expect(() => bundleUrl({ ...manifest(), version: 'latest' })).toThrow(/semver/);
  });

  it('[U.1] parseManifest is strict: kind, semver without build metadata, positive integer formats, sha384 integrity, https notes (else dropped)', () => {
    const good = manifest();
    expect(parseManifest(JSON.parse(JSON.stringify(good)), 'md')).toEqual(good);
    expect(parseManifest({ ...good, extra: 1 }, 'md')).toEqual(good);
    expect(parseManifest(good, 'slides')).toBeNull();
    expect(parseManifest({ ...good, notes: 'javascript:alert(1)' }, 'md')!.notes).toBe('');
    expect(parseManifest({ ...good, notes: 'http://plain.example/' }, 'md')!.notes).toBe('');
    expect(parseManifest({ ...good, notes: undefined }, 'md')!.notes).toBe('');
    const bad: unknown[] = [
      null, [], 'x', { ...good, kind: 'poster' }, { ...good, version: 'v1.1.0' }, { ...good, version: '1.1' }, { ...good, version: '01.1.0' }, { ...good, version: '1.1.0+build.1' },
      { ...good, formats: [] }, { ...good, formats: [0] }, { ...good, formats: [1.5] }, { ...good, formats: '1' },
      { ...good, bundle: null }, { ...good, bundle: { path: '../x.js', integrity: good.bundle.integrity } },
      { ...good, bundle: { path: 'x.js', integrity: 'sha256-' + 'A'.repeat(44) } }, { ...good, bundle: { path: 'x.js', integrity: 'sha384-short' } },
    ];
    for (const b of bad) expect(parseManifest(b, 'md')).toBeNull();
  });

  it('[U.1] the update module cannot read a document\'s configuration: its import graph has no header or document reader, and the URLs it fetches are only the hard-coded ones', async () => {
    const src = readFileSync('src/carrier/shell/update.ts', 'utf8');
    expect(src).not.toMatch(/from '\.\.\/(header|document|envelope|index)\.js'/);
    // every URL string literal in the module (comments quote URL patterns in backticks)
    expect([...src.matchAll(/['"](https?:\/\/[^'"]*)['"]/g)].map((m) => m[1])).toEqual(['https://cdn.jsdelivr.net/npm/']);
    const { fetch, calls } = fakeFetch({ [MD_MANIFEST_URL]: () => response(JSON.stringify(manifest())) });
    await checkForUpdate({ kind: 'md', current: '1.0.0', fetch, storage: memoryStorage(), now: T0 });
    expect(calls).toEqual([MD_MANIFEST_URL]);
  });
});

// ── U.4 semver ───────────────────────────────────────────────────────────

describe('semver', () => {
  it('[U.4] compareSemver follows semver 2.0.0 precedence (numeric identifiers, long numbers, prerelease ordering, build metadata ignored)', () => {
    const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '1.2.0', '1.10.0', '2.0.0', '10.0.0', '12345678901234567890.0.0'];
    for (let i = 0; i < ordered.length; i++) {
      for (let j = 0; j < ordered.length; j++) expect(compareSemver(ordered[i], ordered[j])).toBe(Math.sign(i - j) as -1 | 0 | 1);
    }
    expect(compareSemver('1.0.0+a', '1.0.0+b')).toBe(0);
    expect(compareSemver('1.0', '1.0.0')).toBeNull();
    expect(parseSemver('1.0.0-01')).toBeNull();
    expect(parseSemver('1.2.3-rc.1')).toEqual({ major: '1', minor: '2', patch: '3', prerelease: ['rc', '1'] });
  });
});

// ── U.2–U.4 the check ────────────────────────────────────────────────────

describe('checkForUpdate (spec/shell-runtime.md §7)', () => {
  it('[U.2] at most one network check per kind per 24 h: the result is cached in storage and reused within the window; kinds are independent', async () => {
    const storage = memoryStorage();
    const { fetch, calls } = fakeFetch({
      [MD_MANIFEST_URL]: () => response(JSON.stringify(manifest())),
      [manifestUrl('slides')]: () => response(JSON.stringify(manifest({ kind: 'slides', version: '3.0.0' }))),
    });
    const a = await checkForUpdate({ kind: 'md', current: '1.0.0', fetch, storage, now: T0 });
    expect(a).toEqual({ kind: 'md', current: '1.0.0', latest: '1.1.0', notes: manifest().notes, manifest: manifest() });
    for (const dt of [1, 60_000, DAY / 2, DAY - 1]) {
      expect((await checkForUpdate({ kind: 'md', current: '1.0.0', fetch, storage, now: T0 + dt }))?.latest).toBe('1.1.0');
    }
    expect(calls).toEqual([MD_MANIFEST_URL]);
    expect(JSON.parse(storage.map.get(`${UPDATE_CACHE_PREFIX}md`)!)).toMatchObject({ checkedAt: T0, manifest: manifest() });
    await checkForUpdate({ kind: 'slides', current: '2.0.0', fetch, storage, now: T0 + 5 });
    expect(calls).toEqual([MD_MANIFEST_URL, manifestUrl('slides')]);
    await checkForUpdate({ kind: 'md', current: '1.0.0', fetch, storage, now: T0 + DAY });
    expect(calls.filter((u) => u === MD_MANIFEST_URL)).toHaveLength(2);
    // a clock that went backwards does not freeze the check forever
    await checkForUpdate({ kind: 'md', current: '1.0.0', fetch, storage, now: T0 - 1 });
    expect(calls.filter((u) => u === MD_MANIFEST_URL)).toHaveLength(3);
  });

  it('[U.2] a failed check counts as the day\'s check (recorded before the request), and without usable storage nothing is fetched', async () => {
    const storage = memoryStorage();
    let fail = true;
    const { fetch, calls } = fakeFetch({ [MD_MANIFEST_URL]: () => { if (fail) throw new TypeError('Failed to fetch'); return response(JSON.stringify(manifest())); } });
    expect(await checkForUpdate({ kind: 'md', current: '1.0.0', fetch, storage, now: T0 })).toBeNull();
    fail = false;
    expect(await checkForUpdate({ kind: 'md', current: '1.0.0', fetch, storage, now: T0 + DAY - 1 })).toBeNull();
    expect(calls).toHaveLength(1);
    expect((await checkForUpdate({ kind: 'md', current: '1.0.0', fetch, storage, now: T0 + DAY }))?.latest).toBe('1.1.0');
    expect(calls).toHaveLength(2);
    // a later failure keeps the last good manifest
    fail = true;
    expect((await checkForUpdate({ kind: 'md', current: '1.0.0', fetch, storage, now: T0 + 3 * DAY }))?.latest).toBe('1.1.0');
    // no storage / storage that refuses writes: no request at all
    const throwing: StorageLike = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
    const f2 = fakeFetch({ [MD_MANIFEST_URL]: () => response(JSON.stringify(manifest())) });
    expect(await checkForUpdate({ kind: 'md', current: '1.0.0', fetch: f2.fetch, storage: throwing, now: T0 })).toBeNull();
    expect(f2.calls).toEqual([]);
  });

  it('[U.3] silent on any failure: offline, HTTP errors, bad JSON, an invalid or oversized manifest, a hanging request, bad options — null, never a rejection', async () => {
    const cases: Array<() => ResponseLike | Promise<ResponseLike>> = [
      () => { throw new TypeError('Failed to fetch'); },
      () => response('nope', 500),
      () => response('{not json'),
      () => response(JSON.stringify({ ...manifest(), bundle: { path: '../x', integrity: 'x' } })),
      () => response(JSON.stringify(manifest({ kind: 'paged' }))),
      () => response(' '.repeat(70_000) + JSON.stringify(manifest())),
      () => ({ ok: true, status: 200, text: async () => { throw new Error('stream broke'); }, arrayBuffer: async () => new ArrayBuffer(0) }),
    ];
    for (const c of cases) {
      const { fetch } = fakeFetch({ [MD_MANIFEST_URL]: c });
      await expect(checkForUpdate({ kind: 'md', current: '1.0.0', fetch, storage: memoryStorage(), now: T0 })).resolves.toBeNull();
    }
    vi.useFakeTimers();
    const hanging = checkForUpdate({ kind: 'md', current: '1.0.0', fetch: () => new Promise(() => undefined), storage: memoryStorage(), now: T0 });
    await vi.advanceTimersByTimeAsync(MANIFEST_TIMEOUT_MS + 1);
    await expect(hanging).resolves.toBeNull();
    vi.useRealTimers();
    const ok = fakeFetch({ [MD_MANIFEST_URL]: () => response(JSON.stringify(manifest())) });
    for (const o of [{ kind: 'poster' }, { current: 'one' }, { current: '' }, { cdnBase: 'javascript:x' }] as const) {
      await expect(checkForUpdate({ kind: 'md', current: '1.0.0', fetch: ok.fetch, storage: memoryStorage(), now: T0, ...o } as never)).resolves.toBeNull();
    }
    // no fetch at all (an old browser): null
    vi.stubGlobal('fetch', undefined);
    try {
      await expect(checkForUpdate({ kind: 'md', current: '1.0.0', storage: memoryStorage(), now: T0 })).resolves.toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('[U.4] offers only a stable release newer than current, for the document\'s format; prereleases are never offered', async () => {
    const offer = async (m: Partial<ReleaseManifest>, current: string, format?: number) => {
      const { fetch } = fakeFetch({ [MD_MANIFEST_URL]: () => response(JSON.stringify(manifest(m))) });
      return (await checkForUpdate({ kind: 'md', current, format, fetch, storage: memoryStorage(), now: T0 }))?.latest ?? null;
    };
    expect(await offer({ version: '1.1.0' }, '1.0.0')).toBe('1.1.0');
    expect(await offer({ version: '1.1.0' }, '1.1.0')).toBeNull();
    expect(await offer({ version: '1.1.0' }, '1.2.0')).toBeNull();
    expect(await offer({ version: '1.10.0' }, '1.9.0')).toBe('1.10.0'); // numeric, not string, order
    expect(await offer({ version: '2.0.0-rc.1' }, '1.0.0')).toBeNull(); // prerelease never offered
    expect(await offer({ version: '1.0.0' }, '1.0.0-rc.3')).toBe('1.0.0'); // a prerelease shell is offered the release
    // format gate: the release must list the document's format
    expect(await offer({ formats: [1] }, '1.0.0', 2)).toBeNull();
    expect(await offer({ formats: [1, 2] }, '1.0.0', 2)).toBe('1.1.0');
    expect(await offer({ formats: [2] }, '1.0.0')).toBeNull(); // default format 1
  });

  it('[U.4] "skip this version" is honoured: that version and older are not offered; a newer one is', async () => {
    const storage = memoryStorage();
    let latest = '1.1.0';
    const { fetch } = fakeFetch({ [MD_MANIFEST_URL]: () => response(JSON.stringify(manifest({ version: latest }))) });
    expect((await checkForUpdate({ kind: 'md', current: '1.0.0', fetch, storage, now: T0 }))?.latest).toBe('1.1.0');
    expect(skipVersion('md', '1.1.0', storage)).toBe(true);
    expect(storage.map.get(`${UPDATE_SKIP_PREFIX}md`)).toBe('1.1.0');
    expect(skippedVersion('md', storage)).toBe('1.1.0');
    expect(await checkForUpdate({ kind: 'md', current: '1.0.0', fetch, storage, now: T0 + 1 })).toBeNull();
    expect(await checkForUpdate({ kind: 'md', current: '1.0.0', fetch, storage, now: T0 + DAY })).toBeNull(); // re-fetched, still skipped
    latest = '1.2.0';
    expect((await checkForUpdate({ kind: 'md', current: '1.0.0', fetch, storage, now: T0 + 2 * DAY }))?.latest).toBe('1.2.0');
    // skips are per kind and validated
    expect(skippedVersion('slides', storage)).toBeNull();
    expect(skipVersion('md', 'latest', storage)).toBe(false);
    expect(skipVersion('poster' as 'md', '1.0.0', storage)).toBe(false);
    expect(skipVersion('md', '1.0.0', { getItem: () => null, setItem() { throw new Error('quota'); }, removeItem() {} })).toBe(false);
  });
});

// ── U.13 who checks ──────────────────────────────────────────────────────

describe('which pages check (spec/shell-runtime.md §7.1)', () => {
  it('[U.13] a framed page (an app host\'s iframe, connected or not yet), a page with a connected host and a served page (unless servedPages) make no check — no storage, no request; a top-level file: page checks', async () => {
    const m = manifest();
    const { fetch, calls } = fakeFetch({ [MD_MANIFEST_URL]: () => response(JSON.stringify(m)) });
    const storage = memoryStorage();
    const base = { kind: 'md' as const, current: '1.0.0', fetch, storage, now: T0 };
    const fileTop: { location: { protocol: string }; parent?: unknown } = { location: { protocol: 'file:' } };
    fileTop.parent = fileTop;
    expect(await checkForUpdate({ ...base, page: { location: { protocol: 'file:' }, parent: {} } })).toBeNull();
    expect(await checkForUpdate({ ...base, page: fileTop, host: { connected: () => true } })).toBeNull();
    for (const protocol of ['http:', 'https:']) {
      const served: { location: { protocol: string }; parent?: unknown } = { location: { protocol } };
      served.parent = served;
      expect(await checkForUpdate({ ...base, page: served })).toBeNull();
    }
    expect([calls, storage.map.size]).toEqual([[], 0]);
    const servedOk: { location: { protocol: string }; parent?: unknown } = { location: { protocol: 'https:' } };
    servedOk.parent = servedOk;
    expect((await checkForUpdate({ ...base, page: servedOk, servedPages: true }))?.latest).toBe('1.1.0');
    expect(calls).toEqual([MD_MANIFEST_URL]);
    expect((await checkForUpdate({ ...base, now: T0 + 1, page: fileTop, host: { connected: () => false } }))?.latest).toBe('1.1.0');
    expect(calls).toHaveLength(1); // the same day
  });
});

// ── U.5–U.8 reassemble ───────────────────────────────────────────────────

const BUNDLE = 'globalThis.OrzCarrier = { kind: "md", version: "1.1.0" }; // "\\x3Cscript" is how a release writes it\n';

describe('reassemble (spec/shell-runtime.md §7)', () => {
  it('[U.5] sha384Integrity is the SRI string of the bytes; a bundle whose bytes do not match the manifest is refused before any iframe exists', async () => {
    expect(await sha384Integrity(new TextEncoder().encode('bundle'))).toBe(sri('bundle'));
    expect(await sha384Integrity(new Uint8Array(0))).toBe(sri(''));
    const s = served(BUNDLE, {}, `${BUNDLE}/* tampered */`);
    const page = fakePage(goodAssemble());
    const err = await reassemble({ text: 'x', kind: 'md', release: s.m, fetch: s.fetch, document: page.document, window: page.window }).catch((e) => e);
    expect(err).toBeInstanceOf(UpdateError);
    expect(err.code).toBe('integrity');
    expect(s.calls).toEqual([s.url]);
    expect(page.log).toEqual([]);
  });

  it('[U.5] a failed download, invalid UTF-8, a bundle the script escaping would change, an invalid release and a missing page are refused', async () => {
    const page = fakePage(goodAssemble());
    const base = { text: 'x', kind: 'md' as const, document: page.document, window: page.window };
    const missing = served(BUNDLE);
    const e404 = await reassemble({ ...base, release: missing.m, fetch: fakeFetch({}).fetch }).catch((e) => e);
    expect([e404.code, e404.message]).toEqual(['download', 'The update could not be downloaded (HTTP 404); nothing was changed.']);
    const offline = await reassemble({ ...base, release: missing.m, fetch: async () => { throw new TypeError('Failed to fetch'); } }).catch((e) => e);
    expect(offline.code).toBe('download');
    const badUtf8 = new Uint8Array([0x61, 0xff, 0x62]);
    const m8 = manifest({ bundle: { path: 'orz-mdhtml.browser.js', integrity: sri(badUtf8) } });
    expect((await reassemble({ ...base, release: m8, fetch: fakeFetch({ [bundleUrl(m8)]: () => response(badUtf8) }).fetch }).catch((e) => e)).code).toBe('encoding');
    for (const code of ['var s = "</script>";', 'var s = "<script>";', 'x = "<SCRIPT";', 'y = "<\\/script>"', 'a = 1;\r\nb = 2;', 'c = 3;\r']) {
      expect(isScriptSafe(code)).toBe(false);
      const u = served(code);
      expect((await reassemble({ ...base, release: u.m, fetch: u.fetch }).catch((e) => e)).code).toBe('unsafe-bundle');
    }
    expect(isScriptSafe('var s = "\\x3C/script>"; a < b; // <!-- fine -->')).toBe(true);
    const inv = await reassemble({ ...base, release: { ...missing.m, bundle: { path: '../x.js', integrity: missing.m.bundle.integrity } }, fetch: missing.fetch }).catch((e) => e);
    expect(inv.code).toBe('manifest');
    const noDoc = await reassemble({ text: 'x', kind: 'md', release: missing.m, fetch: missing.fetch, document: { body: null } as unknown as UiDocument, window: page.window }).catch((e) => e);
    expect(noDoc.code).toBe('no-document');
    expect(page.log).toEqual([]);
  });

  it('[U.6] the bundle runs in a hidden iframe whose sandbox is exactly "allow-scripts" (no same-origin), inlined exactly, with the request sent only after the iframe says ready', async () => {
    const s = served(BUNDLE);
    const seen: Array<{ text: string; delivery: string; engineSource: string }> = [];
    const page = fakePage((text, o) => { seen.push({ text, ...o }); return assembleEnvelope(text, PARTS('1.1.0', { delivery: o.delivery as 'inline' })); });
    const html = await reassemble({ text: TEXTS[0], kind: 'md', release: s.m, fetch: s.fetch, document: page.document, window: page.window });
    expect(extract(html)!.text).toBe(TEXTS[0]);
    expect(page.frames).toHaveLength(1);
    const f = page.frames[0];
    expect(f.attrs.sandbox).toBe('allow-scripts');
    expect(f.attrs.sandbox.split(/\s+/)).not.toContain('allow-same-origin');
    expect(f.attrs['aria-hidden']).toBe('true');
    expect(f.srcdoc).toBe(sandboxDocument(BUNDLE));
    expect(f.srcdoc).toContain(`<script>${BUNDLE}\n</script>`); // the verified bytes, unchanged
    expect(escapeScriptText(BUNDLE)).toBe(BUNDLE);
    expect(f.srcdoc.match(/<script>/g)).toHaveLength(2);
    expect(f.srcdoc.toLowerCase().indexOf('</script')).toBe(f.srcdoc.indexOf(`${BUNDLE}\n</script>`) + BUNDLE.length + 1);
    expect(seen).toEqual([{ text: TEXTS[0], delivery: 'inline', engineSource: BUNDLE }]);
  });

  it('[U.6] only messages whose source is the iframe\'s own window are read: a forged result from another source is ignored, and so is a result from the iframe with a stale or foreign request id', async () => {
    const s = served(BUNDLE);
    const page = fakePage(goodAssemble(), { forge: true });
    const html = await reassemble({ text: 'real text\n', kind: 'md', release: s.m, fetch: s.fetch, document: page.document, window: page.window });
    expect(html).not.toBe('FORGED');
    expect(extract(html)!.text).toBe('real text\n');
    const st = fakePage(goodAssemble(), { stale: true });
    const fresh = await reassemble({ text: 'fresh text\n', kind: 'md', release: s.m, fetch: s.fetch, document: st.document, window: st.window });
    expect(fresh).not.toBe('STALE');
    expect(extract(fresh)!.text).toBe('fresh text\n');
    // and a message from the page itself (source = the page window) is ignored too
    const p2 = fakePage(null, { silent: true });
    const pending = reassemble({ text: 't', kind: 'md', release: s.m, fetch: s.fetch, document: p2.document, window: p2.window, timeoutMs: 200 });
    await new Promise((r) => setTimeout(r, 20));
    p2.emit({ type: 'orz-reassemble-ready' }, p2.window); // a "ready" from the page itself starts nothing
    p2.emit({ type: 'orz-reassemble-ready' }, p2.stranger);
    expect(p2.posted).toEqual([]);
    expect((await pending.catch((e) => e)).code).toBe('timeout');
  });

  it('[U.6] [U.8] a bundle that never answers times out (default 30 s) and its iframe is removed', async () => {
    expect(REASSEMBLE_TIMEOUT_MS).toBe(30_000);
    const s = served(BUNDLE);
    const page = fakePage(() => new Promise(() => undefined));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const p = reassemble({ text: 't', kind: 'md', release: s.m, fetch: s.fetch, document: page.document, window: page.window }).catch((e) => e);
    // SubtleCrypto resolves outside the fake clock: wait for the iframe, then run the clock
    for (let i = 0; i < 200 && page.frames.length === 0; i++) await new Promise((r) => setImmediate(r));
    expect(page.frames).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(REASSEMBLE_TIMEOUT_MS - 10);
    expect(page.frames[0].removed).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    const err = await p;
    expect([err.code, page.frames[0].removed, page.listeners.size]).toEqual(['timeout', true, 0]);
  });

  it('[U.7] the round trip is checked: a bundle that alters the text, reports another version, kind or delivery, or returns no file is refused', async () => {
    const s = served(BUNDLE);
    const bad: Array<[Assemble, string]> = [
      [(t) => assembleEnvelope(`${t}\n<!-- injected -->`, PARTS('1.1.0')), 'roundtrip'],
      [(t) => assembleEnvelope(t.replace(/\r\n?/g, '\n'), PARTS('1.1.0')), 'roundtrip'],
      [() => '<!doctype html><p>no island</p>', 'roundtrip'],
      [(t) => assembleEnvelope(t, PARTS('9.9.9')), 'version'],
      [(t) => assembleEnvelope(t, PARTS('1.0.0')), 'version'],
      [(t) => assembleEnvelope(t, PARTS('1.1.0', { kind: 'slides' })), 'kind'],
      [(t) => assembleEnvelope(t, PARTS('1.1.0', { delivery: 'cdn' })), 'delivery'],
      [() => 42, 'bundle'],
      [() => { throw new Error('engine exploded'); }, 'bundle'],
    ];
    for (const [assemble, code] of bad) {
      const page = fakePage(assemble);
      const err = await reassemble({ text: TEXTS[0], kind: 'md', release: s.m, fetch: s.fetch, document: page.document, window: page.window }).catch((e) => e);
      expect([err.code, page.frames[0].removed, page.listeners.size]).toEqual([code, true, 0]);
    }
    const thrown = await reassemble({ text: 'x', kind: 'md', release: s.m, fetch: s.fetch, ...(() => { const p = fakePage(() => { throw new Error('engine exploded'); }); return { document: p.document, window: p.window }; })() }).catch((e) => e);
    expect(thrown.message).toContain('engine exploded');
    // every text of the corpus kinds round-trips through a faithful bundle, with the delivery kept
    for (const text of TEXTS) {
      for (const delivery of ['inline', 'cdn'] as const) {
        const page = fakePage(goodAssemble());
        const html = await reassemble({ text, kind: 'md', release: s.m, delivery, fetch: s.fetch, document: page.document, window: page.window });
        expect(extract(html)).toMatchObject({ text, kind: 'md', shell: '1.1.0', delivery });
      }
    }
  });

  it('[U.7] [U.12] the resolved includes (#orz-includes, FC-18 D4) are carried over and verified: reassemble passes them to the bundle\'s assemble and accepts the file only when it holds exactly them; a bundle that drops, alters or adds one is refused (code includes); performUpdate passes them on', async () => {
    const s = served(BUNDLE);
    const includes = { 'parts/safety.md': '## Safety\n\nGoggles on.\n', 'https://example.org/x.md': 'x\r\n', __proto__x: '' } as Record<string, string>;
    const seen: unknown[] = [];
    const ok = fakePage((t, o) => { seen.push(o.includes); return goodAssemble()(t, o); });
    const html = await reassemble({ text: TEXTS[0], kind: 'md', release: s.m, includes, fetch: s.fetch, document: ok.document, window: ok.window });
    expect(extract(html)).toMatchObject({ text: TEXTS[0], includes });
    expect(seen).toEqual([includes]);
    // none given: the request carries no includes key, and a file with none is right
    const none = fakePage((t, o) => { seen.push('includes' in o); return goodAssemble()(t, o); });
    expect(extract(await reassemble({ text: 'a\n', kind: 'md', release: s.m, fetch: s.fetch, document: none.document, window: none.window }))!.includes).toBeUndefined();
    expect(seen.at(-1)).toBe(false);
    const bad: Assemble[] = [
      (t, o) => goodAssemble()(t, { delivery: o.delivery, engineSource: o.engineSource }), // an older bundle that ignores them
      (t, o) => goodAssemble('1.1.0', { includes: { ...o.includes, 'parts/safety.md': 'changed' } })(t, o),
      (t, o) => goodAssemble('1.1.0', { includes: { ...o.includes, 'extra.md': 'x' } })(t, o),
    ];
    for (const assemble of bad) {
      const page = fakePage(assemble);
      const err = await reassemble({ text: 'a\n', kind: 'md', release: s.m, includes, fetch: s.fetch, document: page.document, window: page.window }).catch((e) => e);
      expect([err.code, page.frames[0].removed]).toEqual(['includes', true]);
    }
    // a bundle that adds includes the file did not have is refused too
    const adds = fakePage(goodAssemble('1.1.0', { includes: { 'a.md': 'a' } }));
    expect((await reassemble({ text: 'a\n', kind: 'md', release: s.m, fetch: s.fetch, document: adds.document, window: adds.window }).catch((e) => e)).code).toBe('includes');
    // performUpdate: the includes reach the saved file; a bundle that drops them saves nothing
    const info: UpdateInfo = { kind: 'md', current: '1.0.0', latest: '1.1.0', notes: '', manifest: s.m };
    const saved: string[] = [];
    const saver = { save: async (i: { text: string; html: string }): Promise<SaveResult> => { saved.push(i.html); return { via: 'file', ok: true, picked: false, opened: true }; } };
    const p1 = fakePage(goodAssemble());
    expect(await performUpdate({ info, kind: 'md', current: '1.0.0', getText: () => 'b\n', includes, saver, fetch: s.fetch, document: p1.document, window: p1.window })).toMatchObject({ status: 'updated', reload: true });
    expect(extract(saved[0])!.includes).toEqual(includes);
    const p2 = fakePage(bad[0]);
    expect(await performUpdate({ info, kind: 'md', current: '1.0.0', getText: () => 'b\n', includes, saver, fetch: s.fetch, document: p2.document, window: p2.window })).toMatchObject({ status: 'failed', code: 'includes' });
    expect(saved).toHaveLength(1);
  });

  it('[U.8] the transaction touches nothing in the page but its own iframe, which is removed on success and on every failure', async () => {
    const s = served(BUNDLE);
    const ok = fakePage(goodAssemble());
    await reassemble({ text: 'a', kind: 'md', release: s.m, fetch: s.fetch, document: ok.document, window: ok.window });
    expect(ok.log).toEqual(['create iframe', 'append', 'remove']);
    expect(ok.listeners.size).toBe(0);
    const fail = fakePage(goodAssemble('2.0.0'));
    await reassemble({ text: 'a', kind: 'md', release: s.m, fetch: s.fetch, document: fail.document, window: fail.window }).catch(() => undefined);
    expect(fail.log).toEqual(['create iframe', 'append', 'remove']);
    expect(fail.listeners.size).toBe(0);
  });

  it('[U.8] performUpdate composes check → reassemble → save, never rejects, never reloads, and saves nothing when the update is refused', async () => {
    const s = served(BUNDLE);
    const routes = { [MD_MANIFEST_URL]: () => response(JSON.stringify(s.m)), [s.url]: () => response(BUNDLE) };
    const saves: Array<{ text: string; html: string; theme?: string }> = [];
    const saver = { save: async (i: { text: string; html: string; theme?: string }): Promise<SaveResult> => { saves.push(i); return { via: 'file', ok: true, picked: false, opened: true, name: 'week3.md.html' }; } };
    const page = fakePage(goodAssemble());
    const r = await performUpdate({ kind: 'md', current: '1.0.0', text: TEXTS[1], saver, theme: 'paper', fetch: fakeFetch(routes).fetch, storage: memoryStorage(), now: T0, document: page.document, window: page.window });
    expect(r.status).toBe('updated');
    if (r.status !== 'updated') throw new Error('unreachable');
    expect([r.info.latest, r.save, r.text, r.reload]).toEqual(['1.1.0', { via: 'file', ok: true, picked: false, opened: true, name: 'week3.md.html' }, TEXTS[1], true]);
    expect(saves).toEqual([{ text: TEXTS[1], html: r.html, theme: 'paper' }]);
    expect(extract(saves[0].html)!.text).toBe(TEXTS[1]);
    // up to date: nothing assembled or saved
    const none = await performUpdate({ kind: 'md', current: '1.1.0', text: 'x', saver, fetch: fakeFetch(routes).fetch, storage: memoryStorage(), now: T0, document: page.document, window: page.window });
    expect(none).toEqual({ status: 'up-to-date' });
    // refused: reported, nothing saved
    const bad = fakePage((t) => assembleEnvelope(`${t}!`, PARTS('1.1.0')));
    const info: UpdateInfo = { kind: 'md', current: '1.0.0', latest: '1.1.0', notes: '', manifest: s.m };
    const refused = await performUpdate({ info, kind: 'md', current: '1.0.0', text: 'y', saver, fetch: fakeFetch(routes).fetch, document: bad.document, window: bad.window });
    expect(refused).toMatchObject({ status: 'failed', code: 'roundtrip' });
    expect(saves).toHaveLength(1);
    // a throwing saver is reported, not thrown
    const throwing = { save: async (): Promise<SaveResult> => { throw new Error('disk gone'); } };
    const p3 = fakePage(goodAssemble());
    const r3 = await performUpdate({ info, kind: 'md', current: '1.0.0', text: 'z', saver: throwing, fetch: fakeFetch(routes).fetch, document: p3.document, window: p3.window });
    expect(r3).toMatchObject({ status: 'updated', save: { via: 'download', ok: false, error: 'disk gone' } });
    const src = readFileSync('src/carrier/shell/update.ts', 'utf8');
    expect(src).not.toMatch(/location\.reload|\.reload\(/);
  });

  it('[U.12] performUpdate reads the text through getText when the update starts and again before the save: an edit made meanwhile refuses the update (code changed, nothing saved); the old text option still works', async () => {
    const s = served(BUNDLE);
    const info: UpdateInfo = { kind: 'md', current: '1.0.0', latest: '1.1.0', notes: '', manifest: s.m };
    const saves: string[] = [];
    const saver = { save: async (i: { text: string; html: string }): Promise<SaveResult> => { saves.push(i.text); return { via: 'file', ok: true, picked: false, opened: true, name: 'week3.md.html' }; } };
    let text = 'before\n';
    // the reader types while the sandbox assembles
    const typing = fakePage((t, o) => { text = 'before\ntyped during Updating…\n'; return assembleEnvelope(t, PARTS('1.1.0', { delivery: o.delivery as 'inline' })); });
    const changed = await performUpdate({ info, kind: 'md', current: '1.0.0', getText: () => text, saver, fetch: s.fetch, document: typing.document, window: typing.window, openedName: 'week3.md.html' });
    expect(changed).toMatchObject({ status: 'failed', code: 'changed' });
    expect(saves).toEqual([]);
    // unchanged: saved, and the reload is allowed
    text = 'steady\r\n';
    const p2 = fakePage(goodAssemble());
    const ok = await performUpdate({ info, kind: 'md', current: '1.0.0', getText: () => text, saver, fetch: s.fetch, document: p2.document, window: p2.window, openedName: 'week3.md.html' });
    expect(ok).toMatchObject({ status: 'updated', text: 'steady\r\n', reload: true });
    expect(saves).toEqual(['steady\r\n']);
    // a getText that throws or returns no string is a missing text
    const p3 = fakePage(goodAssemble());
    expect(await performUpdate({ info, kind: 'md', current: '1.0.0', getText: () => { throw new Error('gone'); }, saver, fetch: s.fetch, document: p3.document, window: p3.window })).toMatchObject({ status: 'failed', code: 'roundtrip' });
  });

  it('[U.12] reload only when the saved file is the opened one and the text did not move on: an acknowledged host save or a file proved by its content to be the opened one (opened: true) — yes; a picked or session file not proved to be it (whatever its name), a download, a served notice, a failed save or a text changed during the save, no', async () => {
    const s = served(BUNDLE);
    const info: UpdateInfo = { kind: 'md', current: '1.0.0', latest: '1.1.0', notes: '', manifest: s.m };
    const cases: Array<[SaveResult, boolean]> = [
      [{ via: 'host', ok: true }, true],
      [{ via: 'host', ok: false, error: 'quota' }, false],
      [{ via: 'file', ok: true, picked: false, opened: true, name: 'week3.md.html' }, true],
      [{ via: 'file', ok: true, picked: true, opened: true, name: 'week3.md.html' }, true],
      // F2: the picker opened in Downloads and the reader accepted the same name there — not the opened file
      [{ via: 'file', ok: true, picked: true, opened: false, name: 'week3.md.html' }, false],
      // B#1: a later save of the same session to that file (no picker this time) — still not the opened file
      [{ via: 'file', ok: true, picked: false, opened: false, name: 'week3.md.html' }, false],
      [{ via: 'file', ok: true, picked: true, opened: false, name: 'week3 (1).md.html' }, false],
      [{ via: 'file', ok: true, picked: true, opened: false }, false],
      [{ via: 'file', ok: false, error: 'cancelled', picked: true, opened: false }, false],
      // a saver of an older shell that does not say `opened`: never a reload
      [{ via: 'file', ok: true, picked: false, name: 'week3.md.html' } as unknown as SaveResult, false],
      [{ via: 'download', ok: true, confirmed: false, name: 'week3.md.html' }, false],
      [{ via: 'served-notice' }, false],
    ];
    for (const [result, reload] of cases) {
      const page = fakePage(goodAssemble());
      const r = await performUpdate({ info, kind: 'md', current: '1.0.0', getText: () => 'same\n', saver: { save: async () => result }, fetch: s.fetch, document: page.document, window: page.window, openedName: 'week3.md.html' });
      expect(r, JSON.stringify(result)).toMatchObject({ status: 'updated', reload });
    }
    // a text that changes while the save runs (a picker is open): saved, but no reload
    let text = 'a\n';
    const page = fakePage(goodAssemble());
    const moved = await performUpdate({ info, kind: 'md', current: '1.0.0', getText: () => text, saver: { save: async () => { text = 'a\nb\n'; return { via: 'file', ok: true, picked: false, opened: true, name: 'week3.md.html' }; } }, fetch: s.fetch, document: page.document, window: page.window, openedName: 'week3.md.html' });
    expect(moved).toMatchObject({ status: 'updated', text: 'a\n', reload: false });
  });

  it('[U.12] [S.13] with the real saver (F2, B#1): an update saved into a same-named file the picker offered in another folder, or into the session\'s earlier save-as file, never reloads; written into the opened file — proved by its content — it does', async () => {
    const s = served(BUNDLE);
    const info: UpdateInfo = { kind: 'md', current: '1.0.0', latest: '1.1.0', notes: '', manifest: s.m };
    const file = (name: string, content: string) => {
      const h: FileHandleLike & { content: string } = {
        name, content,
        async createWritable() { let next = ''; return { write: async (d: unknown) => { next += String(d); }, close: async () => { h.content = next; } }; },
        getFile: async () => ({ text: async () => h.content }),
        queryPermission: async () => 'granted',
      };
      return h;
    };
    const map = new Map<string, StoredHandle>();
    const store: HandleStore = { get: async (k) => map.get(k), put: async (k, v) => { map.set(k, v); }, delete: async (k) => { map.delete(k); } };
    const win = (pick: () => FileHandleLike) => ({ location: { protocol: 'file:', href: 'file:///Users/me/Docs/notes.md.html', pathname: '/Users/me/Docs/notes.md.html' }, showSaveFilePicker: async () => pick() });
    const docs = file('notes.md.html', 'OPENED');
    const downloads = file('notes.md.html', '');
    const update = async (saver: Pick<ReturnType<typeof createSaver>, 'save'>) => {
      const page = fakePage(goodAssemble());
      return performUpdate({ info, kind: 'md', current: '1.0.0', getText: () => 'same\n', saver, fetch: s.fetch, document: page.document, window: page.window, openedName: 'notes.md.html' });
    };
    // the picker offers notes.md.html in Downloads; the page is Docs/notes.md.html
    const elsewhere = createSaver({ uid: 'doc-abcdefghij123456', suggestedName: 'notes.md.html', kind: 'md', window: win(() => downloads), handleStore: store, openedHtml: 'OPENED' });
    expect(await update(elsewhere)).toMatchObject({ status: 'updated', save: { via: 'file', ok: true, picked: true, opened: false, name: 'notes.md.html' }, reload: false });
    // B#1: the same session saves again (its handle, no picker): still not the opened file, still no reload
    expect(await update(elsewhere)).toMatchObject({ save: { picked: false, opened: false }, reload: false });
    expect(docs.content).toBe('OPENED');
    // the reader picks the opened file itself: proved by its bytes, so the reload is safe
    const home = createSaver({ uid: 'doc-abcdefghij123456', suggestedName: 'notes.md.html', kind: 'md', window: win(() => docs), handleStore: store, openedHtml: 'OPENED' });
    expect(await update(home)).toMatchObject({ save: { picked: true, opened: true }, reload: true });
    // a carrier that does not give the opened bytes: a picked file is never the opened one
    const blind = createSaver({ uid: 'doc-abcdefghij123456', suggestedName: 'notes.md.html', kind: 'md', window: win(() => file('notes.md.html', 'OPENED')), handleStore: { get: async () => undefined, put: async () => undefined, delete: async () => undefined } });
    expect(await update(blind)).toMatchObject({ save: { picked: true, opened: false }, reload: false });
  });

  it('[U.13] performUpdate refuses in a framed page or with a connected host (code hosted): the app owns the version; nothing is fetched or saved', async () => {
    const s = served(BUNDLE);
    const info: UpdateInfo = { kind: 'md', current: '1.0.0', latest: '1.1.0', notes: '', manifest: s.m };
    const saves: unknown[] = [];
    const saver = { save: async (i: unknown): Promise<SaveResult> => { saves.push(i); return { via: 'host', ok: true }; } };
    const page = fakePage(goodAssemble());
    const top = {};
    expect(await performUpdate({ info, kind: 'md', current: '1.0.0', text: 'x', saver, fetch: s.fetch, document: page.document, window: page.window, page: { parent: {} } })).toMatchObject({ status: 'failed', code: 'hosted' });
    expect(await performUpdate({ info, kind: 'md', current: '1.0.0', text: 'x', saver, fetch: s.fetch, document: page.document, window: page.window, host: { connected: () => true }, page: { parent: top } as never })).toMatchObject({ status: 'failed', code: 'hosted' });
    expect([saves, s.calls, page.frames.length]).toEqual([[], [], 0]);
  });
});

// ── U.9 the indicator (happy-dom) ────────────────────────────────────────

let HappyWindow: typeof import('happy-dom').Window;
beforeAll(async () => {
  ({ Window: HappyWindow } = await import('happy-dom')); // once, outside any test's time budget
}, 60_000);

async function dom() {
  const win = new HappyWindow({ url: 'https://example.test/doc.md.html' });
  const document = win.document as unknown as Document;
  document.body.innerHTML = '<header><a id="brand" href="#">orz</a><span id="after">next</span></header><main><p id="content">Content</p><button id="page-btn">page</button></main>';
  return { win, document };
}

const INFO: UpdateInfo = { kind: 'md', current: '1.0.0', latest: '1.1.0', notes: 'https://example.test/changelog#110', manifest: manifest() };

describe('the update indicator (spec/shell-runtime.md §7)', { timeout: 20_000 }, () => {
  it('[U.9] mounts a chip after the anchor in its own shadow root: a button with an accessible name, aria-haspopup/expanded/controls, and a closed popover', async () => {
    const { document } = await dom();
    const brand = document.getElementById('brand')!;
    const ind = mountUpdateIndicator(brand as unknown as UiElement, INFO, { onUpdate: () => undefined });
    const host = brand.nextSibling as HTMLElement;
    expect(host).toBe(ind.host);
    expect(host.getAttribute('data-orz-chrome')).toBe('update');
    expect((host.nextSibling as HTMLElement).id).toBe('after');
    const root = host.shadowRoot!;
    const chip = root.querySelector('button.orz-chip')!;
    expect(chip.getAttribute('aria-label')).toBe('Update available: 1.1.0');
    expect(chip.getAttribute('aria-haspopup')).toBe('dialog');
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    const pop = root.getElementById(chip.getAttribute('aria-controls')!)!;
    expect(pop.getAttribute('role')).toBe('dialog');
    expect(pop.getAttribute('aria-modal')).toBe('false');
    expect((pop as HTMLElement).hidden).toBe(true);
    expect(root.getElementById(pop.getAttribute('aria-labelledby')!)!.textContent).toBe('Update available: 1.1.0');
    const link = pop.querySelector('a')!;
    expect([link.textContent, link.getAttribute('href'), link.getAttribute('target'), link.getAttribute('rel')]).toEqual(['What\u2019s new', INFO.notes, '_blank', 'noopener noreferrer']);
    expect([...pop.querySelectorAll('button')].map((b) => [b.textContent, b.getAttribute('type')])).toEqual([['Update now', 'button'], ['Not now', 'button'], ['Skip this version', 'button']]);
    // no notes → no link
    const ind2 = mountUpdateIndicator(brand as unknown as UiElement, { ...INFO, notes: '' }, { onUpdate: () => undefined });
    expect((ind2.root as unknown as ShadowRoot).querySelector('a')).toBeNull();
    ind2.dispose();
    ind.dispose();
    expect(brand.nextSibling).toBe(document.getElementById('after'));
  });

  it('[U.9] the popover is non-modal and keyboard-operable: click opens it with focus on Update now, Esc closes it and returns focus to the chip, an outside click closes it, the page stays usable', async () => {
    const { win, document } = await dom();
    const brand = document.getElementById('brand')!;
    const ind = mountUpdateIndicator(brand as unknown as UiElement, INFO, { onUpdate: () => undefined });
    const root = (ind.host as unknown as HTMLElement).shadowRoot!;
    const chip = root.querySelector('button.orz-chip') as HTMLButtonElement;
    const pop = root.querySelector('.orz-popover') as HTMLElement;
    chip.click();
    expect([pop.hidden, chip.getAttribute('aria-expanded'), ind.isOpen()]).toEqual([false, 'true', true]);
    expect(root.activeElement?.textContent).toBe('Update now');
    // the page is not inert: no modal, nothing marked aria-hidden, page controls still work
    expect(document.querySelectorAll('[aria-hidden="true"], [inert], dialog').length).toBe(0);
    let pageClicks = 0;
    document.getElementById('page-btn')!.addEventListener('click', () => { pageClicks++; });
    (document.getElementById('page-btn') as HTMLButtonElement).click();
    expect(pageClicks).toBe(1);
    pop.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }) as unknown as Event);
    expect([pop.hidden, chip.getAttribute('aria-expanded')]).toEqual([true, 'false']);
    expect(root.activeElement).toBe(chip);
    chip.click();
    expect(pop.hidden).toBe(false);
    document.getElementById('content')!.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true, composed: true }) as unknown as Event);
    expect(pop.hidden).toBe(true);
    // a click inside the popover does not close it
    chip.click();
    pop.querySelector('p')!.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true, composed: true }) as unknown as Event);
    expect(pop.hidden).toBe(false);
    chip.click(); // toggles closed
    expect(pop.hidden).toBe(true);
    ind.dispose();
  });

  it('[U.9] Not now and Skip call their handlers and remove the indicator; Update now shows a busy state and, when it fails, the error in place', async () => {
    const { document } = await dom();
    const brand = document.getElementById('brand')! as unknown as UiElement;
    const calls: string[] = [];
    const h = { onUpdate: () => { calls.push('update'); }, onLater: (i: UpdateInfo) => { calls.push(`later ${i.latest}`); }, onSkip: (i: UpdateInfo) => { calls.push(`skip ${i.latest}`); } };
    const a = mountUpdateIndicator(brand, INFO, h);
    const btn = (ind: typeof a, name: string) => [...(ind.host as unknown as HTMLElement).shadowRoot!.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement;
    btn(a, 'Not now').click();
    expect(calls).toEqual(['later 1.1.0']);
    expect(document.querySelector('.orz-update-indicator')).toBeNull();
    const b = mountUpdateIndicator(brand, INFO, h);
    btn(b, 'Skip this version').click();
    expect(calls).toEqual(['later 1.1.0', 'skip 1.1.0']);
    expect(document.querySelector('.orz-update-indicator')).toBeNull();
    let reject!: (e: Error) => void;
    const c = mountUpdateIndicator(brand, INFO, { onUpdate: () => new Promise((_r, j) => { reject = j; }) });
    c.open();
    const up = btn(c, 'Update now');
    up.click();
    await new Promise((r) => setTimeout(r, 0));
    const root = (c.host as unknown as HTMLElement).shadowRoot!;
    expect(up.textContent).toBe('Updating\u2026');
    expect([...root.querySelectorAll('button')].filter((x) => x.closest('.orz-popover')).every((x) => x.disabled)).toBe(true);
    expect(root.querySelector('.orz-popover')!.getAttribute('aria-busy')).toBe('true');
    reject(new Error('The new version would change the document text, so the update was cancelled; nothing was changed.'));
    await new Promise((r) => setTimeout(r, 0));
    const err = root.querySelector('.orz-popover__error') as HTMLElement;
    expect([err.hidden, err.textContent, err.getAttribute('aria-live')]).toEqual([false, 'The new version would change the document text, so the update was cancelled; nothing was changed.', 'polite']);
    expect([up.textContent, up.disabled, c.isOpen()]).toEqual(['Update now', false, true]);
    c.dispose();
  });

  it('[U.9] never uses confirm(), alert() or prompt(), and never covers the content: no banner, no modal', async () => {
    for (const f of ['indicator.ts', 'update.ts', 'chrome.ts']) {
      const src = readFileSync(`src/carrier/shell/${f}`, 'utf8').replace(/^\s*\*.*$|\/\/.*$/gm, '');
      expect(src).not.toMatch(/\b(confirm|alert|prompt)\s*\(/);
      expect(src).not.toMatch(/showModal|aria-modal', 'true'|inert/);
    }
    const { win, document } = await dom();
    const spy = { confirm: vi.fn(), alert: vi.fn(), prompt: vi.fn() };
    Object.assign(win, spy);
    const ind = mountUpdateIndicator(document.getElementById('brand') as unknown as UiElement, INFO, { onUpdate: () => undefined, onLater: () => undefined, onSkip: () => undefined });
    ind.open();
    [...(ind.host as unknown as HTMLElement).shadowRoot!.querySelectorAll('button')].forEach((b) => b.click());
    expect([spy.confirm, spy.alert, spy.prompt].map((s) => s.mock.calls.length)).toEqual([0, 0, 0]);
    expect(CHROME_CSS).toMatch(/\.orz-popover \{[^}]*max-width: min\(320px/);
  });
});

// ── V the chrome ─────────────────────────────────────────────────────────

describe('the shell chrome (spec/shell-runtime.md §8)', { timeout: 20_000 }, () => {
  it('[V.1] CHROME_CSS: tokens on :host, OKLCH palette, light/dark by prefers-color-scheme and data-chrome, focus rings, scales, system fonts, reduced motion, isolation', () => {
    const tokens = ['bg', 'surface', 'surface-2', 'hover', 'border', 'fg', 'muted', 'accent', 'accent-hover', 'accent-fg', 'focus', 'success', 'warning', 'danger', 'info', 'shadow'];
    for (const t of tokens) expect(CHROME_CSS.match(new RegExp(`--orz-chrome-${t}:`, 'g'))!.length).toBeGreaterThanOrEqual(2); // light and dark
    for (const t of ['space-1', 'space-6', 'radius-s', 'radius-m', 'radius-l', 'text-xs', 'text-lg', 'font', 'mono', 'ease']) expect(CHROME_CSS).toContain(`--orz-chrome-${t}:`);
    const colours = [...CHROME_CSS.matchAll(/--orz-chrome-(?:bg|surface|surface-2|hover|border|fg|muted|accent|accent-hover|accent-fg|focus|success|warning|danger|info):\s*([^;]+);/g)].map((m) => m[1]);
    expect(colours.length).toBeGreaterThan(20);
    expect(colours.every((c) => /^oklch\(/.test(c))).toBe(true);
    expect(CHROME_CSS).toMatch(/@media \(prefers-color-scheme: dark\) \{ :host \{/);
    expect(CHROME_CSS).toContain(':host([data-chrome="dark"])');
    expect(CHROME_CSS).toContain(':host-context([data-chrome="dark"])');
    expect(CHROME_CSS).toContain(':host([data-chrome="light"])');
    expect(CHROME_CSS).toMatch(/:focus-visible \{ outline: 2px solid var\(--orz-chrome-focus\)/);
    expect(CHROME_CSS).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ animation: none !important; transition: none !important; \}/);
    expect(CHROME_CSS).toMatch(/:host \{\s*all: initial;/);
    expect(CHROME_CSS).toMatch(/--orz-chrome-font: system-ui/);
    // it styles only the shadow tree: no selector names a document element, id or theme class
    const selectors = CHROME_CSS.replace(/\{[^{}]*\}/g, '{}').replace(/@media[^{]*\{/g, '').split(/[{}]/).map((x) => x.trim()).filter(Boolean);
    for (const sel of selectors.flatMap((x) => x.split(','))) {
      expect(sel.trim()).toMatch(/^(:host|\*|\.orz-|\[hidden\]|:focus|@keyframes|from|to)/);
    }
  });

  it('[V.2] ICONS: the twelve shell icons, each one inline 24×24 SVG in currentColor, aria-hidden and unfocusable, with no script, handler or external reference', () => {
    expect(Object.keys(ICONS).sort()).toEqual(['check', 'close', 'download', 'edit', 'info', 'more', 'preview', 'save', 'split', 'theme', 'update', 'warning']);
    for (const [name, s] of Object.entries(ICONS)) {
      expect(s, name).toMatch(/^<svg viewBox="0 0 24 24"[^>]* stroke="currentColor"[^>]* aria-hidden="true" focusable="false">.*<\/svg>$/s);
      expect(s.match(/<svg/g), name).toHaveLength(1);
      expect(s, name).not.toMatch(/<script|\son\w+=|href|url\(|<foreignObject|<style/i);
      expect(s, name).not.toMatch(/#[0-9a-f]{3,6}\b/i); // no fixed colours
    }
  });

  it('[V.3] showToast: one polite live region per root, toasts stack, each dismissible by a labelled button, auto-dismissed after timeoutMs (paused on hover), text never parsed as HTML', async () => {
    const { win, document } = await dom();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createShadowRoot(host as unknown as UiElement) as unknown as ShadowRoot;
    vi.useFakeTimers();
    // the toast uses its document's window timers: route happy-dom's to the fake clock
    Object.assign(win, { setTimeout: (f: () => void, ms: number) => setTimeout(f, ms), clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id) });
    const a = showToast(root as never, 'Saved', { tone: 'success' });
    showToast(root as never, '<img src=x onerror=alert(1)>', { tone: 'error', timeoutMs: 0 });
    showToast(root as never, 'Third', { timeoutMs: 1000 });
    const stacks = root.querySelectorAll('.orz-toast-stack');
    expect(stacks).toHaveLength(1);
    expect([stacks[0].getAttribute('role'), stacks[0].getAttribute('aria-live')]).toEqual(['status', 'polite']);
    let toasts = [...root.querySelectorAll('.orz-toast')];
    expect(toasts.map((t) => t.getAttribute('data-tone'))).toEqual(['success', 'error', 'info']);
    expect(toasts[1].querySelector('img')).toBeNull();
    expect(toasts[1].querySelector('.orz-toast__message')!.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(toasts.every((t) => t.querySelector('button[aria-label="Dismiss"]'))).toBe(true);
    // hover pauses the timer
    toasts[2].dispatchEvent(new win.PointerEvent('pointerenter') as unknown as Event);
    vi.advanceTimersByTime(1500);
    expect(root.querySelectorAll('.orz-toast')).toHaveLength(3);
    toasts[2].dispatchEvent(new win.PointerEvent('pointerleave') as unknown as Event);
    vi.advanceTimersByTime(1001);
    toasts = [...root.querySelectorAll('.orz-toast')];
    expect(toasts.map((t) => t.getAttribute('data-tone'))).toEqual(['success', 'error']);
    vi.advanceTimersByTime(5000); // default 5 s for success
    expect([...root.querySelectorAll('.orz-toast')].map((t) => t.getAttribute('data-tone'))).toEqual(['error']);
    vi.advanceTimersByTime(60_000); // timeoutMs 0: sticky
    expect(root.querySelectorAll('.orz-toast')).toHaveLength(1);
    (root.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement).click();
    expect(root.querySelectorAll('.orz-toast')).toHaveLength(0);
    a.dismiss(); // idempotent
    vi.useRealTimers();
  });

  it('[V.4] createShadowRoot installs CHROME_CSS (constructed sheet, else <style>), and the chrome writes only into its own shadow root: no DOM-reading API, innerHTML only from ICONS', async () => {
    const { document } = await dom();
    const host = document.createElement('span');
    document.body.appendChild(host);
    const root = createShadowRoot(host as unknown as UiElement) as unknown as ShadowRoot;
    const sheets = (root as unknown as { adoptedStyleSheets?: unknown[] }).adoptedStyleSheets ?? [];
    const style = root.querySelector('style');
    expect(sheets.length === 1 || style?.textContent === CHROME_CSS).toBe(true);
    // without constructable sheets: a <style> holding CHROME_CSS
    const appended: unknown[] = [];
    const fakeRoot = { append: (...n: unknown[]) => appended.push(...n), appendChild: (n: unknown) => n };
    const texts: string[] = [];
    const fakeDoc = { createElement: () => ({ append: (t: { data: string }) => texts.push(t.data) }), createTextNode: (data: string) => ({ data }), defaultView: {} };
    createShadowRoot({ attachShadow: () => fakeRoot, ownerDocument: fakeDoc } as unknown as UiElement);
    expect([appended.length, texts]).toEqual([1, [CHROME_CSS]]);
    expect(() => createShadowRoot({} as UiElement)).toThrow(/shadow root/);
    const forbidden = /\b(outerHTML|innerText|textContent|documentElement|XMLSerializer|cloneNode|querySelector(All)?|getElementById|getElementsBy\w+|serializeToString|insertAdjacentHTML|DOMParser)\b/;
    for (const f of ['chrome.ts', 'indicator.ts', 'update.ts']) {
      const code = readFileSync(`src/carrier/shell/${f}`, 'utf8').split('\n').map((l) => l.replace(/\/\/.*$|^\s*\*.*$/, ''));
      expect(code.filter((l) => forbidden.test(l)), f).toEqual([]);
      const writes = code.filter((l) => /innerHTML/.test(l));
      expect(writes, f).toEqual(f === 'chrome.ts' ? ['type IconSpan = UiElement & { innerHTML: string };', '  span.innerHTML = ICONS[name];'] : []);
    }
  });
});

// ── module boundaries ────────────────────────────────────────────────────

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
      queue.push(`${parts.join('/').replace(/\.js$/, '')}.ts`);
    }
  }
  return seen;
}

/**
 * What ships: the CommonJS `dist/` a carrier bundles, bundled exactly as below (esbuild, ESM output,
 * browser, minified). Re-measured 2026-10-06 after closed loop 2 round 2: update 19,860 B; update +
 * indicator + chrome 36,469 B; chrome 13,019 B (the TypeScript source measured 15,482 B, 31,671 B and
 * 12,285 B — CommonJS keeps export names and cannot drop unused exports of `read.js`; S.11 says why
 * no ESM build ships). Bounds ~11 %, ~10 % and ~23 % above the measurement: one more round of guards
 * fits, a real jump in size fails.
 */
const UPDATE_LIMIT = 22_000;
const UPDATE_UI_LIMIT = 40_000;
const CHROME_LIMIT = 16_000;
/** Bundle `contents` (JS importing from `dist/`) as a carrier would. */
async function shippedSize(contents: string): Promise<{ bytes: number; inputs: string[] }> {
  expect(existsSync('dist/carrier/shell/update.js'), 'dist/ is missing: run npm run build').toBe(true);
  const { build } = await import('esbuild');
  const out = await build({ stdin: { contents, resolveDir: '.', loader: 'js' }, bundle: true, minify: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent', metafile: true });
  return { bytes: out.outputFiles[0].contents.byteLength, inputs: Object.keys(out.metafile!.inputs) };
}

describe('module boundaries', () => {
  it('[U.10] the update is parser-free and size-bounded: its graph is update.ts, types.ts and the parser-free reader; what ships (the CommonJS dist) bundles under 22 KB (with indicator and chrome under 40 KB)', async () => {
    expect([...valueImports('src/carrier/shell/update.ts')].sort()).toEqual(['src/ascii.ts', 'src/carrier/read.ts', 'src/carrier/shell/types.ts', 'src/carrier/shell/update.ts', 'src/carrier/text.ts', 'src/html.ts']);
    expect([...valueImports('src/carrier/shell/indicator.ts')].sort()).toEqual(['src/carrier/shell/chrome.ts', 'src/carrier/shell/indicator.ts']);
    const u = await shippedSize("export * from './dist/carrier/shell/update.js';");
    expect(u.bytes).toBeLessThan(UPDATE_LIMIT);
    expect(u.inputs.sort()).toEqual(['dist/ascii.js', 'dist/carrier/read.js', 'dist/carrier/shell/types.js', 'dist/carrier/shell/update.js', 'dist/carrier/text.js', 'dist/html.js', '<stdin>'].sort());
    const ui = await shippedSize("export * from './dist/carrier/shell/update.js'; export * from './dist/carrier/shell/indicator.js'; export * from './dist/carrier/shell/chrome.js';");
    expect(ui.bytes).toBeLessThan(UPDATE_UI_LIMIT);
    expect(ui.inputs.filter((f) => /markdown-it|katex|dist\/index|header|document\.js|parser/.test(f))).toEqual([]);
  });

  it('[V.5] the chrome is standalone and size-bounded: chrome.ts imports nothing at run time and what ships (dist/carrier/shell/chrome.js) bundles under 16 KB', async () => {
    expect([...valueImports('src/carrier/shell/chrome.ts')]).toEqual(['src/carrier/shell/chrome.ts']);
    const c = await shippedSize("export * from './dist/carrier/shell/chrome.js';");
    expect(c.bytes).toBeLessThan(CHROME_LIMIT);
    expect(c.inputs.sort()).toEqual(['<stdin>', 'dist/carrier/shell/chrome.js']);
  });

  it('[U.10] [V.5] loading the update, the indicator and the chrome touches no browser global; calls then degrade (null, refusal) instead of throwing', async () => {
    const { build } = await import('esbuild');
    const out = await build({ stdin: { contents: "export * from './src/carrier/shell/update'; export * from './src/carrier/shell/indicator'; export * from './src/carrier/shell/chrome';", resolveDir: '.', loader: 'ts' }, bundle: true, platform: 'neutral', format: 'cjs', write: false, logLevel: 'silent' });
    const touched: string[] = [];
    const ctx: Record<string, unknown> = { module: { exports: {} }, setTimeout, clearTimeout, Promise, Error, TypeError, JSON, Date, Math, WeakMap, Uint8Array, ArrayBuffer };
    for (const name of ['window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'location', 'self', 'parent', 'fetch', 'crypto', 'TextDecoder', 'CSSStyleSheet', 'confirm']) {
      Object.defineProperty(ctx, name, { get() { touched.push(name); throw new Error(`touched ${name}`); } });
    }
    ctx.exports = (ctx.module as { exports: unknown }).exports;
    vm.createContext(ctx);
    vm.runInContext(out.outputFiles[0].text, ctx);
    expect(touched).toEqual([]);
    const api = (ctx.module as { exports: Record<string, (...a: unknown[]) => Promise<unknown>> }).exports;
    await expect(api.checkForUpdate({ kind: 'md', current: '1.0.0' })).resolves.toBeNull();
    const err = (await api.reassemble({ text: 't', kind: 'md', release: manifest() }).catch((e: unknown) => e)) as { code: string };
    expect(['download', 'no-crypto']).toContain(err.code);
  });
});

// ── U.11 / V real Chrome ─────────────────────────────────────────────────

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

const browser = existsSync('dist/carrier.js') ? await launch() : null;
const chrome = browser ? describe : describe.skip;

/** What a release build does so the bundle can be inlined exactly: `<script` / `</script` written as `\x3C…` (spec/shell-runtime.md §6). */
const scriptSafe = (code: string): string => code.replace(/<(\\*)(\/?script)/gi, '\\x3C$1$2');

chrome('real Chrome (playwright-core, channel chrome)', { timeout: 90_000 }, () => {
  let shellJs = '';
  const bundles: Record<string, string> = {};
  const manifests: Record<string, ReleaseManifest> = {};
  const requests: string[] = [];
  const servers: http.Server[] = [];
  let A = ''; // the document's origin
  let CDN = ''; // a second origin standing in for jsDelivr
  const TEXT = '{{nyml\r\nkind: document\r\ntitle: Week 3 — 漢字\r\nuid: doc-abcdefghij123456\r\n}}\r\n\r\n# Week 3\r\n\r\n</script><script>alert(1)</script> 𝒳\r\n';

  const carrierSource = (opts: { version: string; kind?: string; alter?: boolean; reportVersion?: string }) => `
    import { assembleEnvelope, extract, readDocument } from './dist/carrier.js';
    const VERSION = ${JSON.stringify(opts.version)};
    globalThis.OrzCarrier = {
      kind: ${JSON.stringify(opts.kind ?? 'md')}, version: VERSION, formats: [1],
      assemble: async (text, o) => assembleEnvelope(${opts.alter ? "text.replace('Week 3', 'Week 4')" : 'text'}, {
        kind: ${JSON.stringify(opts.kind ?? 'md')}, shellVersion: ${JSON.stringify(opts.reportVersion ?? opts.version)}, delivery: o && o.delivery,
        headHtml: o && o.delivery === 'inline' && o.engineSource ? '<script>' + o.engineSource + '\\n</' + 'script>' : '',
        bodyHtml: '<main id="orz-app" data-shell="' + VERSION + '"></main>',
      }),
      extract, readDocument, mountEditor() { throw new Error('not in this test'); },
    };`;

  beforeAll(async () => {
    const { build } = await import('esbuild');
    shellJs = (await build({ entryPoints: ['src/carrier/shell/index.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'OrzShell', write: false, logLevel: 'silent' })).outputFiles[0].text;
    const make = async (src: string) => scriptSafe((await build({ stdin: { contents: src, resolveDir: process.cwd(), loader: 'js' }, bundle: true, minify: true, platform: 'browser', format: 'iife', write: false, logLevel: 'silent' })).outputFiles[0].text);
    bundles.good = await make(carrierSource({ version: '1.1.0' }));
    bundles.alter = await make(carrierSource({ version: '1.1.0', alter: true }));
    bundles.liar = await make(carrierSource({ version: '1.1.0', reportVersion: '1.0.0' }));
    bundles.tampered = bundles.good;
    for (const [variant, code] of Object.entries(bundles)) {
      expect(isScriptSafe(code)).toBe(true);
      manifests[variant] = manifest({ version: '1.1.0', notes: 'https://example.test/changelog#110', bundle: { path: 'orz-mdhtml.browser.js', integrity: sri(code) } });
    }
    const page = `<!doctype html><html><head><meta charset="utf-8"><title>Week 3</title>
      <style>body { font: 30px/2 serif; color: rgb(255, 0, 0); } button { background: rgb(255, 0, 0); font-size: 40px; } p { margin: 40px; }</style></head>
      <body><header><a id="brand" href="#">orz</a></header><main><p id="live">LIVE DOM — not the saved bytes</p><button id="page-btn">page</button></main>
      <script src="/shell.js"></script></body></html>`;
    const docServer = http.createServer((req, res) => {
      const path = (req.url ?? '/').split('?')[0];
      if (path === '/shell.js') { res.setHeader('content-type', 'text/javascript'); res.end(shellJs); return; }
      if (path === '/frame.html') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><script>window.forge = function (html) { for (var i = 1; i < 40; i++) parent.postMessage({ type: "orz-reassembled", id: "u" + i, ok: true, html: html }, "*"); };</script>'); return; }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(page);
    });
    const cdnServer = http.createServer((req, res) => {
      const path = (req.url ?? '/').split('?')[0];
      requests.push(path);
      res.setHeader('access-control-allow-origin', '*');
      const m = /^\/(\w+)\/orz-mdhtml-browser@([^/]+)\/(.+)$/.exec(path);
      if (m && manifests[m[1]] && m[2] === 'latest' && m[3] === 'release.json') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(manifests[m[1]])); return; }
      if (m && bundles[m[1]] && m[2] === '1.1.0' && m[3] === 'orz-mdhtml.browser.js') {
        res.setHeader('content-type', 'text/javascript; charset=utf-8');
        res.end(m[1] === 'tampered' ? `${bundles.good}\n/* one byte more */` : bundles[m[1]]);
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    });
    for (const s of [docServer, cdnServer]) {
      await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
      servers.push(s);
    }
    A = `http://127.0.0.1:${(docServer.address() as AddressInfo).port}`;
    CDN = `http://127.0.0.1:${(cdnServer.address() as AddressInfo).port}`;
  }, 90_000);

  afterAll(async () => {
    await browser?.close();
    for (const s of servers) s.close();
  });

  /** Open the document page with the shell, a dialog trap and an iframe recorder. */
  async function open(): Promise<Page> {
    const page = await browser!.newPage();
    await page.goto(`${A}/doc.html`);
    await page.waitForFunction(() => typeof (window as unknown as { OrzShell?: unknown }).OrzShell === 'object');
    await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      w.__dialogs = [];
      for (const n of ['confirm', 'alert', 'prompt']) w[n] = (...a: unknown[]) => { w.__dialogs.push([n, ...a]); return false; };
      w.__frames = [];
      new MutationObserver((records) => {
        for (const r of records) for (const n of r.addedNodes) if (n instanceof HTMLIFrameElement) w.__frames.push({ sandbox: n.getAttribute('sandbox'), srcdocLength: n.srcdoc.length });
      }).observe(document.documentElement, { childList: true, subtree: true });
      w.__snapshot = () => document.documentElement.outerHTML;
    });
    page.on('dialog', (d) => { void d.dismiss(); });
    return page;
  }

  /** In the page: check, mount the indicator, wire Update now to performUpdate with a download-only saver. */
  const mount = (page: Page, variant: string) => page.evaluate(async ({ cdnBase, text }) => {
    const w = window as unknown as Record<string, any>;
    const S = w.OrzShell;
    localStorage.clear();
    const info = await S.checkForUpdate({ kind: 'md', current: '1.0.0', cdnBase, servedPages: true }); // the test page is served over http
    if (!info) return null;
    w.__results = [];
    // a download-only window: no picker, presented as a file: page (a served page would get the notice)
    const saverWin = { location: { protocol: 'file:', href: 'file:///Users/me/week3.md.html', pathname: '/Users/me/week3.md.html' }, document, Blob, URL, setTimeout: setTimeout.bind(window) };
    const saver = S.createSaver({ uid: 'doc-abcdefghij123456', suggestedName: 'week3.md.html', kind: 'md', window: saverWin });
    w.__ind = S.mountUpdateIndicator(document.getElementById('brand'), info, {
      onUpdate: async (i: unknown) => {
        const r = await S.performUpdate({ info: i, kind: 'md', current: '1.0.0', text, saver, cdnBase });
        w.__results.push(r.status === 'updated' ? { status: r.status, save: r.save, html: r.html } : r);
        if (r.status === 'failed') throw new Error(r.error);
      },
      onLater: () => w.__results.push('later'),
      onSkip: (i: { kind: string; latest: string }) => { S.skipVersion(i.kind, i.latest); w.__results.push('skip'); },
    });
    return info;
  }, { cdnBase: `${CDN}/${variant}/`, text: TEXT });

  it('[U.11] [U.9] [U.8] [V.4] in Chrome: the indicator appears (unstyled by the page CSS), Esc closes its popover, Update now re-assembles in the sandbox and saves the verified file through the download fallback — exact bytes, page untouched', async () => {
    const page = await open();
    const info = await mount(page, 'good');
    expect(info).toMatchObject({ kind: 'md', current: '1.0.0', latest: '1.1.0', notes: 'https://example.test/changelog#110' });
    expect(requests.filter((r) => r.startsWith('/good/'))).toEqual(['/good/orz-mdhtml-browser@latest/release.json']);
    // a second check the same day makes no request
    await page.evaluate((cdnBase) => (window as unknown as { OrzShell: { checkForUpdate(o: unknown): Promise<unknown> } }).OrzShell.checkForUpdate({ kind: 'md', current: '1.0.0', cdnBase, servedPages: true }), `${CDN}/good/`);
    expect(requests.filter((r) => r.endsWith('release.json') && r.startsWith('/good/'))).toHaveLength(1);
    const chip = page.locator('button.orz-chip');
    await expect.poll(() => chip.getAttribute('aria-label')).toBe('Update available: 1.1.0');
    expect(await page.evaluate(() => document.getElementById('brand')!.nextElementSibling!.getAttribute('data-orz-chrome'))).toBe('update');
    // keyboard: focus the chip, Enter opens with focus on Update now, Esc closes and returns focus
    await chip.focus();
    await page.keyboard.press('Enter');
    const pop = page.locator('.orz-popover');
    await expect.poll(() => pop.isVisible()).toBe(true);
    const focused = () => page.evaluate(() => { const h = document.querySelector('.orz-update-indicator')!; return h.shadowRoot!.activeElement?.textContent ?? null; });
    expect(await focused()).toBe('Update now');
    expect(await page.locator('.orz-popover a').getAttribute('href')).toBe('https://example.test/changelog#110');
    await page.keyboard.press('Escape');
    await expect.poll(() => pop.isVisible()).toBe(false);
    expect(await page.evaluate(() => document.querySelector('.orz-update-indicator')!.shadowRoot!.activeElement?.classList.contains('orz-chip'))).toBe(true);
    // the page's CSS does not restyle the chrome (V.4)
    const style = await chip.evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, size: s.fontSize, family: s.fontFamily }; });
    expect(style.bg).not.toBe('rgb(255, 0, 0)');
    expect(style.size).toBe('11px');
    expect(style.family).toMatch(/system-ui/);
    await chip.click();
    await expect.poll(() => pop.isVisible()).toBe(true);
    const before = await page.evaluate(() => (window as unknown as { __snapshot(): string }).__snapshot());
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Update now' }).click()]);
    expect(download.suggestedFilename()).toBe('week3.md.html');
    const bytes = readFileSync((await download.path())!);
    const result = await page.evaluate(() => (window as unknown as { __results: Array<{ status: string; save: unknown; html: string }> }).__results[0]);
    expect(result.status).toBe('updated');
    expect(result.save).toEqual({ via: 'download', ok: true, confirmed: false, name: 'week3.md.html' });
    expect(bytes.equals(Buffer.from(result.html, 'utf8'))).toBe(true);
    const back = extract(bytes.toString('utf8'))!;
    expect(back).toMatchObject({ text: TEXT, kind: 'md', shell: '1.1.0', delivery: 'inline' });
    expect(bytes.includes(Buffer.from('LIVE DOM'))).toBe(false);
    expect(bytes.toString('utf8')).toContain(bundles.good); // the engine inlined verbatim (delivery inline)
    expect(requests.filter((r) => r.startsWith('/good/'))).toEqual(['/good/orz-mdhtml-browser@latest/release.json', '/good/orz-mdhtml-browser@1.1.0/orz-mdhtml.browser.js']);
    const after = await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      return { snap: w.__snapshot() as string, frames: w.__frames, left: document.querySelectorAll('iframe').length, dialogs: w.__dialogs };
    });
    expect(after.snap).toBe(before);
    expect(after.frames).toEqual([{ sandbox: 'allow-scripts', srcdocLength: expect.any(Number) }]);
    expect(after.left).toBe(0);
    expect(after.dialogs).toEqual([]);
    await page.close();
  });

  it('[U.11] [U.5] [U.7] in Chrome: a tampered bundle (wrong integrity) and a text-altering bundle are refused, nothing is downloaded, the page is unchanged and no iframe is left', async () => {
    const page = await open();
    let downloads = 0;
    page.on('download', () => { downloads++; });
    // tampered: through the indicator — the error appears in the popover
    expect(await mount(page, 'tampered')).toMatchObject({ latest: '1.1.0' });
    const before = await page.evaluate(() => (window as unknown as { __snapshot(): string }).__snapshot());
    await page.locator('button.orz-chip').click();
    await page.getByRole('button', { name: 'Update now' }).click();
    const err = page.locator('.orz-popover__error');
    await expect.poll(() => err.isVisible()).toBe(true);
    expect(await err.textContent()).toBe('The downloaded update does not match its published fingerprint (sha384); nothing was changed.');
    let state = await page.evaluate(() => { const w = window as unknown as Record<string, any>; return { snap: w.__snapshot(), frames: w.__frames.length, results: w.__results }; });
    expect(state.snap).toBe(before);
    expect(state.frames).toBe(0); // refused before any iframe
    expect(state.results).toMatchObject([{ status: 'failed', code: 'integrity' }]);
    await page.evaluate(() => (window as unknown as { __ind: { dispose(): void } }).__ind.dispose());
    // text-altering and version-lying bundles: refused after running in the sandbox
    const refused = await page.evaluate(async ({ cdn, text, manifests }) => {
      const S = (window as unknown as { OrzShell: any }).OrzShell;
      const w = window as unknown as Record<string, any>;
      const snap0 = w.__snapshot();
      const out: Record<string, unknown> = {};
      for (const v of ['alter', 'liar']) {
        out[v] = await S.reassemble({ text, kind: 'md', release: manifests[v], cdnBase: `${cdn}/${v}/` }).then(() => 'accepted', (e: { code: string }) => e.code);
      }
      return { out, same: w.__snapshot() === snap0, frames: w.__frames.map((f: { sandbox: string }) => f.sandbox), left: document.querySelectorAll('iframe').length, dialogs: w.__dialogs };
    }, { cdn: CDN, text: TEXT, manifests });
    expect(refused).toEqual({ out: { alter: 'roundtrip', liar: 'version' }, same: true, frames: ['allow-scripts', 'allow-scripts'], left: 0, dialogs: [] });
    await page.waitForTimeout(300);
    expect(downloads).toBe(0);
    state = await page.evaluate(() => { const w = window as unknown as Record<string, any>; return { snap: w.__snapshot(), frames: w.__frames.length, results: w.__results }; });
    expect(state.snap.replace(/<span class="orz-update-indicator"[^>]*><\/span>/, '')).toBe(before.replace(/<span class="orz-update-indicator"[^>]*><\/span>/, ''));
    await page.close();
  });

  it('[U.11] [U.6] in Chrome: the sandbox is an opaque origin that cannot reach the page, and forged results posted by another frame are ignored', async () => {
    const page = await open();
    // a same-origin sibling frame floods the page with forged results for every likely request id
    await page.evaluate((src) => new Promise<void>((resolve) => {
      const f = document.createElement('iframe');
      f.src = src;
      f.onload = () => resolve();
      document.body.appendChild(f);
    }), `${A}/frame.html`);
    const r = await page.evaluate(async ({ cdn, text, manifest }) => {
      const S = (window as unknown as { OrzShell: any }).OrzShell;
      const sib = document.querySelector('iframe')!.contentWindow as unknown as { forge(h: string): void };
      const forged = '<!doctype html><script type="text/markdown" id="orz-src">FORGED</script>';
      const timer = setInterval(() => sib.forge(forged), 2);
      // the bundle tries to reach the page and its storage: an opaque origin cannot
      localStorage.setItem('secret', 'page-only');
      try {
        const html: string = await S.reassemble({ text, kind: 'md', release: manifest, cdnBase: `${cdn}/good/` });
        return { forgedAccepted: html.includes('FORGED'), length: html.length };
      } finally {
        clearInterval(timer);
      }
    }, { cdn: CDN, text: TEXT, manifest: manifests.good });
    expect(r.forgedAccepted).toBe(false);
    // the sandbox has an opaque origin: from inside it, parent.document and localStorage throw
    const probe = await page.evaluate(() => new Promise<{ origin: string; parentDoc: string; storage: string }>((resolve) => {
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-scripts');
      f.srcdoc = '<script>var r = { origin: String(self.origin) }; try { r.parentDoc = String(!!parent.document.body); } catch (e) { r.parentDoc = e.name; } try { r.storage = String(localStorage.getItem("secret")); } catch (e) { r.storage = e.name; } parent.postMessage(r, "*");</script>';
      addEventListener('message', function on(e) { if (e.source === f.contentWindow) { removeEventListener('message', on); f.remove(); resolve(e.data); } });
      document.body.appendChild(f);
    }));
    expect(probe).toEqual({ origin: 'null', parentDoc: 'SecurityError', storage: 'SecurityError' });
    await page.close();
  });
});
