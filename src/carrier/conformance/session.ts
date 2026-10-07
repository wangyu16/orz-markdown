/**
 * A harness session: the target's releases read from disk, two local origins
 * (a host page origin and a file origin), a temporary directory for `file:`
 * pages, and the browser. Every browser check gets fresh contexts whose
 * network is closed except for the two local origins and the hard-coded
 * jsDelivr URLs of the releases (spec/shell-runtime.md §6), which the session
 * answers itself — so the update check runs against its real URLs. Each
 * check runs in its own {@link Session.scope}: the contexts it opens are its
 * own and closed when it ends, so checks can run side by side.
 */
import { KIND_PACKAGE } from '../read.js';
import { CODEMIRROR6_PATH } from '../editor/codemirror-pin.js';
import { VERSION } from '../../version.js';
import { RECORD_BINDING, HOST_PAGE, bundlePage, initScript, type PickerMode } from './page.js';
import { callAssemble, decodeStrict, fs, http, os, packageRoot, path, playwright, readBytes, sha256hex, sha384 } from './node.js';
import type { AssembleOptions, BrowserLike, BundleSource, CarrierTarget, ConformanceOptions } from './types.js';

type BrowserContext = import('playwright-core').BrowserContext;
type Page = import('playwright-core').Page;
type Route = import('playwright-core').Route;

/** A release as the harness sees it. */
export interface Release {
  label: 'target' | 'next' | 'previous';
  bundleFile: string;
  /** The bundle bytes decoded (lossily when they are not UTF-8: C.bundle.script-safe reports that). */
  code: string;
  bytes: Uint8Array;
  /** release.json as parsed JSON (null when it does not parse). */
  manifest: Record<string, unknown> | null;
  manifestText: string;
  version: string;
  /** `bundle.path` of the manifest (else the file's name). */
  bundlePath: string;
}

export interface Record_ {
  type: string;
  data: unknown;
  url: string;
}

/**
 * The pinned CodeMirror 6 bundle's jsDelivr URL (the editor's
 * `CODEMIRROR6_URL`): answered inside the closed network from this package's
 * own `vendor/codemirror6.js`, so the edit checks run with CodeMirror loaded.
 */
export const CODEMIRROR_URL = `https://cdn.jsdelivr.net/npm/orz-markdown@${VERSION}/${CODEMIRROR6_PATH}`;

/**
 * Chrome refuses the origin-private file system on `file:` pages unless it was
 * launched with this flag; the `opfs` picker (real handles for
 * `C.save.copy-elsewhere`) needs it. The harness's own browser has it; for a
 * browser passed in without it, that check launches one of its own.
 */
export const FILE_ACCESS_FLAG = '--allow-file-access-from-files';

export interface CdnPlan {
  /** The release whose manifest answers `<pkg>-browser@latest/release.json` (none: the manifest request fails — offline). Its bundle URL is answered first. */
  latest?: Release;
  /** Serve `latest`'s bundle with one byte more than its integrity covers. */
  tamper?: boolean;
  /** Hold the manifest response until this resolves. */
  hold?: Promise<void>;
  /** Hold every bundle response until this resolves (an update that is still downloading). */
  holdBundle?: Promise<void>;
}

export interface CheckContext {
  context: BrowserContext;
  records: Record_[];
  requests: string[];
  downloads: Array<{ name: string; data: string }>;
  newPage(): Promise<Page>;
  of(type: string): Record_[];
}

function readRelease(label: Release['label'], src: BundleSource): Release {
  const bytes = readBytes(src.bundle);
  let code: string;
  try { code = decodeStrict(bytes); } catch { code = new TextDecoder().decode(bytes); }
  let manifestText = '';
  let manifest: Record<string, unknown> | null = null;
  try {
    manifestText = fs().readFileSync(src.release, 'utf8');
    const raw = JSON.parse(manifestText) as unknown;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) manifest = raw as Record<string, unknown>;
  } catch { /* reported by C.bundle.release */ }
  const b = manifest?.bundle as { path?: unknown } | undefined;
  return {
    label,
    bundleFile: src.bundle,
    code,
    bytes,
    manifest,
    manifestText,
    version: typeof manifest?.version === 'string' ? manifest.version : '',
    bundlePath: typeof b?.path === 'string' ? b.path : path().basename(src.bundle),
  };
}

export class Session {
  readonly target: CarrierTarget;
  readonly options: ConformanceOptions;
  readonly releases: { target: Release; next?: Release; previous?: Release };
  browser: BrowserLike | null = null;
  browserError = '';
  hostOrigin = '';
  fileOrigin = '';
  private ownsBrowser = false;
  private fileBrowser: BrowserLike | null = null;
  private ownsFileBrowser = false;
  private servers: Array<import('node:http').Server> = [];
  private files = new Map<string, string>();
  private tmp = '';
  private contexts = new Set<BrowserContext>();
  /** chromeAssemble's page per release, within a scope. */
  private assemblers = new Map<string, Promise<Page>>();
  private memo = new Map<string, Promise<string>>();
  private codemirror: Uint8Array | null | undefined;
  /** `file:` URL → its path on disk (writeFile / rewriteFile). */
  private paths = new Map<string, string>();
  /** The session itself (a scope's `root`). */
  private root: Session = this;

  private constructor(target: CarrierTarget, options: ConformanceOptions) {
    this.target = target;
    this.options = options;
    this.releases = {
      target: readRelease('target', target),
      ...(target.next ? { next: readRelease('next', target.next) } : {}),
      ...(target.previous ? { previous: readRelease('previous', target.previous) } : {}),
    };
  }

  static async open(target: CarrierTarget, options: ConformanceOptions, needsBrowser: boolean): Promise<Session> {
    const s = new Session(target, options);
    s.tmp = fs().mkdtempSync(path().join(os().tmpdir(), 'orz-conformance-'));
    if (needsBrowser) {
      await s.listen();
      if (options.browser) s.browser = options.browser;
      else {
        try {
          const { chromium } = await playwright();
          s.browser = await chromium.launch({ channel: options.channel ?? 'chrome', args: [FILE_ACCESS_FLAG] });
          s.ownsBrowser = true;
        } catch (e) {
          s.browserError = `no browser: ${(e as Error)?.message?.split('\n')[0] ?? String(e)}`;
        }
      }
    }
    return s;
  }

  private async listen(): Promise<void> {
    const handler: import('node:http').RequestListener = (req, res) => {
      const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
      const send = (type: string, body: string | Uint8Array) => { res.setHeader('content-type', type); res.setHeader('cache-control', 'no-store'); res.end(body); };
      let m: RegExpExecArray | null;
      if ((m = /^\/file\/(.+)$/.exec(p)) && this.files.has(m[1])) return send('text/html; charset=utf-8', this.files.get(m[1])!);
      if ((m = /^\/bundle\/(target|next|previous)\.js$/.exec(p))) {
        const r = this.releases[m[1] as Release['label']];
        if (r) return send('text/javascript; charset=utf-8', r.bytes);
      }
      if ((m = /^\/page\/(target|next|previous)\.html$/.exec(p))) return send('text/html; charset=utf-8', bundlePage(`/bundle/${m[1]}.js`));
      if (p === '/host.html') return send('text/html; charset=utf-8', HOST_PAGE);
      if (p === '/blank.html') return send('text/html; charset=utf-8', '<!doctype html><meta charset="utf-8"><title>blank</title>');
      res.statusCode = 404;
      res.end('not found');
    };
    for (let i = 0; i < 2; i++) {
      const server = http().createServer(handler);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      this.servers.push(server);
    }
    const port = (i: number) => (this.servers[i].address() as import('node:net').AddressInfo).port;
    this.hostOrigin = `http://127.0.0.1:${port(0)}`;
    this.fileOrigin = `http://127.0.0.1:${port(1)}`;
  }

  /** Serve an assembled file from the file origin; returns its URL. */
  serve(name: string, html: string): string {
    this.files.set(name, html);
    return `${this.fileOrigin}/file/${encodeURIComponent(name)}`;
  }

  /** Write an assembled file to the temporary directory; returns its `file:` URL. */
  writeFile(name: string, html: string): string {
    const dir = fs().mkdtempSync(path().join(this.tmp, 'f-'));
    const file = path().join(dir, name);
    fs().writeFileSync(file, html, 'utf8');
    const url = `file://${file.split(path().sep).map(encodeURIComponent).join('/')}`;
    this.paths.set(url, file);
    return url;
  }

  /** Replace the bytes of a file made by {@link writeFile} (what a save into it wrote): the next open of its URL reads them. */
  rewriteFile(url: string, html: string): void {
    const file = this.paths.get(url);
    if (!file) throw new Error(`orz conformance: ${url} is not a file of this session`);
    fs().writeFileSync(file, html, 'utf8');
  }

  /**
   * A view of the session for one check: everything is shared (servers,
   * files, memoised assemblies, the browser) except the contexts it opens
   * (and their pages), which {@link closeContexts} closes when the check ends.
   */
  scope(): Session {
    const child = Object.create(this) as Session;
    child.contexts = new Set();
    child.assemblers = new Map();
    return child;
  }

  /**
   * A release made from another: `append` is added to its bundle (a re-signed
   * build of it), `version` replaces the manifest's version, `formats` its
   * text formats; the manifest's integrity is recomputed, so the bytes match
   * what it announces.
   */
  derive(base: Release, o: { version?: string; append?: string; formats?: number[] }): Release {
    const code = o.append ? `${base.code}${o.append}` : base.code;
    const bytes = o.append ? new TextEncoder().encode(code) : base.bytes;
    const version = o.version ?? base.version;
    const manifest: Record<string, unknown> = { ...(base.manifest ?? {}), version, ...(o.formats ? { formats: o.formats } : {}), bundle: { path: base.bundlePath, integrity: sha384(bytes) } };
    return { ...base, code, bytes, manifest, manifestText: JSON.stringify(manifest), version };
  }

  /** The target's Node `assemble`, memoised per text and options. */
  assemble(text: string, o: AssembleOptions = {}): Promise<string> {
    const engine = o.engineSource === undefined ? '-' : o.engineSource === this.releases.target.code ? 'own' : `sha256:${sha256hex(o.engineSource)}`;
    const key = `${o.delivery ?? ''}|${engine}|${o.includes ? JSON.stringify(Object.entries(o.includes).sort()) : '-'}|${text}`;
    let p = this.memo.get(key);
    if (!p) {
      p = callAssemble((t, x) => this.target.assemble(t, x), text, o);
      p.catch(() => undefined);
      this.memo.set(key, p);
    }
    return p;
  }

  /** The URL patterns of the jsDelivr routes for this kind. */
  private cdnUrls(): { manifest: string; bundle(r: Release): string } {
    const pkg = `${KIND_PACKAGE[this.target.kind]}-browser`;
    return {
      manifest: `https://cdn.jsdelivr.net/npm/${pkg}@latest/release.json`,
      bundle: (r) => `https://cdn.jsdelivr.net/npm/${pkg}@${r.version}/${r.bundlePath}`,
    };
  }

  /** A fresh browser context for one check: recorded dialogs, errors, picker writes, downloads and requests; closed network. */
  async context(o: { picker: PickerMode; cdn?: CdnPlan; codemirror?: boolean }): Promise<CheckContext> {
    if (!this.browser) throw new Error(this.browserError || 'no browser');
    const browser = o.picker === 'opfs' ? await this.browserForFiles() : this.browser;
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
    this.contexts.add(context);
    const records: Record_[] = [];
    const requests: string[] = [];
    const downloads: CheckContext['downloads'] = [];
    await context.exposeBinding(RECORD_BINDING, (_source, payload: Record_) => { records.push(payload); });
    await context.addInitScript({ content: initScript(o.picker) });
    const urls = this.cdnUrls();
    const local = [this.hostOrigin, this.fileOrigin];
    await context.route('**/*', async (route: Route) => {
      const url = route.request().url();
      if (url.startsWith('file:') || local.some((l) => url === l || url.startsWith(`${l}/`))) return route.continue();
      requests.push(url);
      const cors = { 'access-control-allow-origin': '*' };
      if (url.split('?')[0] === urls.manifest) {
        if (o.cdn?.hold) await o.cdn.hold;
        if (o.cdn?.latest) return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: o.cdn.latest.manifestText });
        return route.abort('internetdisconnected');
      }
      if (url.split('?')[0] === CODEMIRROR_URL) {
        const cm = o.codemirror === false ? null : this.codemirrorBytes();
        if (cm) return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/javascript; charset=utf-8' }, body: Buffer.from(cm) });
        return route.abort('internetdisconnected'); // the textarea fallback case
      }
      for (const r of [o.cdn?.latest, this.releases.target, this.releases.next, this.releases.previous]) {
        if (!r || url.split('?')[0] !== urls.bundle(r)) continue;
        if (o.cdn?.holdBundle) await o.cdn.holdBundle;
        const tampered = o.cdn?.tamper && o.cdn.latest === r;
        const body = tampered ? Buffer.concat([Buffer.from(r.bytes), Buffer.from('\n/* tampered */\n')]) : Buffer.from(r.bytes);
        return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/javascript; charset=utf-8' }, body });
      }
      return route.abort('internetdisconnected');
    });
    const watch = (page: Page) => {
      page.on('dialog', (d) => { records.push({ type: 'dialog', data: { kind: d.type(), message: d.message() }, url: page.url() }); void d.dismiss().catch(() => undefined); });
      page.on('pageerror', (e) => { records.push({ type: 'pageerror', data: e.message, url: page.url() }); });
      page.on('console', (m) => { if (m.type() === 'error') records.push({ type: 'console-error', data: m.text(), url: page.url() }); });
      page.on('download', (d) => {
        void d.path().then((file) => {
          downloads.push({ name: d.suggestedFilename(), data: file ? fs().readFileSync(file, 'utf8') : '' });
        }).catch(() => undefined);
      });
    };
    context.on('page', watch);
    return {
      context,
      records,
      requests,
      downloads,
      newPage: async () => context.newPage(),
      of: (type) => records.filter((r) => r.type === type),
    };
  }

  /** A browser whose `file:` pages have the origin-private file system ({@link FILE_ACCESS_FLAG}). */
  private async browserForFiles(): Promise<BrowserLike> {
    return this.root.fileBrowserOf();
  }

  private fileBrowserPromise: Promise<BrowserLike> | null = null;
  private fileBrowserOf(): Promise<BrowserLike> {
    this.fileBrowserPromise ??= this.launchFileBrowser();
    return this.fileBrowserPromise;
  }

  private async launchFileBrowser(): Promise<BrowserLike> {
    if (this.ownsBrowser) return this.browser!;
    if (!this.fileBrowser) {
      const probe = await this.browser!.newContext();
      let ok = false;
      try {
        const page = await probe.newPage();
        await page.goto(this.writeFile('opfs-probe.html', '<!doctype html><meta charset="utf-8"><title>probe</title>'));
        ok = await page.evaluate('navigator.storage.getDirectory().then(function () { return true; }, function () { return false; })') as boolean;
      } catch { ok = false; } finally { await probe.close().catch(() => undefined); }
      if (ok) this.fileBrowser = this.browser;
      else {
        try {
          const { chromium } = await playwright();
          this.fileBrowser = await chromium.launch({ channel: this.options.channel ?? 'chrome', args: [FILE_ACCESS_FLAG] });
          this.ownsFileBrowser = true;
        } catch { this.fileBrowser = this.browser; }
      }
    }
    return this.fileBrowser!;
  }

  /** This package's `vendor/codemirror6.js` (null when it is not shipped). */
  private codemirrorBytes(): Uint8Array | null {
    if (this.codemirror === undefined) {
      try { this.codemirror = readBytes(path().join(packageRoot(), CODEMIRROR6_PATH)); } catch { this.codemirror = null; }
    }
    return this.codemirror;
  }

  /** Close the contexts this scope opened. */
  async closeContexts(): Promise<void> {
    const all = [...this.contexts];
    this.contexts.clear();
    this.assemblers.clear();
    await Promise.all(all.map((c) => c.close().catch(() => undefined)));
  }

  /** A page of the harness origin that loaded a release's bundle by URL (one per release within a scope). */
  bundlePage(r: Release): Promise<Page> {
    let p = this.assemblers.get(r.label + r.version);
    if (!p) {
      p = (async () => {
        const ctx = await this.context({ picker: 'none' });
        const page = await ctx.newPage();
        await page.goto(`${this.fileOrigin}/page/${r.label}.html`);
        return page;
      })();
      p.catch(() => undefined);
      this.assemblers.set(r.label + r.version, p);
    }
    return p;
  }

  /** `assemble` of a release's bundle, run in Chrome (inline: with its own text as engineSource); `hash`: `sha256:<hex>` of each file instead of the file. */
  async chromeAssemble(r: Release, texts: string[], delivery: 'inline' | 'cdn', hash = false, includes?: Record<string, string>): Promise<string[]> {
    const page = await this.bundlePage(r);
    return call<string[]>(page, `async function (a) {
      var C = globalThis.OrzCarrier;
      if (!C) throw new Error('the bundle set no globalThis.OrzCarrier');
      var src = a.inline ? await (await fetch(a.src)).text() : undefined;
      var out = [];
      var hex = async function (s) {
        var d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
        return Array.prototype.map.call(d, function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
      };
      for (var i = 0; i < a.texts.length; i++) {
        var o = a.inline ? { delivery: 'inline', engineSource: src } : { delivery: 'cdn' };
        if (a.includes) o.includes = a.includes;
        var html = await C.assemble(a.texts[i], o);
        out.push(a.hash && typeof html === 'string' ? 'sha256:' + await hex(html) : html);
      }
      return out;
    }`, { texts, inline: delivery === 'inline', src: `/bundle/${r.label}.js`, hash, ...(includes ? { includes } : {}) });
  }

  async close(): Promise<void> {
    await this.closeContexts();
    if (this.ownsBrowser) await this.browser?.close().catch(() => undefined);
    if (this.fileBrowserPromise) await this.fileBrowserPromise.catch(() => undefined);
    if (this.ownsFileBrowser) await this.fileBrowser?.close().catch(() => undefined);
    for (const s of this.servers) s.close();
    this.servers = [];
    if (this.tmp) fs().rmSync(this.tmp, { recursive: true, force: true });
  }
}

/** Evaluate a page-side function source with one JSON argument. */
export function call<T>(target: Pick<Page, 'evaluate'>, fnSource: string, arg?: unknown): Promise<T> {
  return target.evaluate(`(${fnSource})(${arg === undefined ? '' : JSON.stringify(arg)})`) as Promise<T>;
}
