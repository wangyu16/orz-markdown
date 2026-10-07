"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Session = exports.FILE_ACCESS_FLAG = exports.CODEMIRROR_URL = void 0;
exports.call = call;
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
const read_js_1 = require("../read.js");
const codemirror_pin_js_1 = require("../editor/codemirror-pin.js");
const version_js_1 = require("../../version.js");
const page_js_1 = require("./page.js");
const node_js_1 = require("./node.js");
/**
 * The pinned CodeMirror 6 bundle's jsDelivr URL (the editor's
 * `CODEMIRROR6_URL`): answered inside the closed network from this package's
 * own `vendor/codemirror6.js`, so the edit checks run with CodeMirror loaded.
 */
exports.CODEMIRROR_URL = `https://cdn.jsdelivr.net/npm/orz-markdown@${version_js_1.VERSION}/${codemirror_pin_js_1.CODEMIRROR6_PATH}`;
/**
 * Chrome refuses the origin-private file system on `file:` pages unless it was
 * launched with this flag; the `opfs` picker (real handles for
 * `C.save.copy-elsewhere`) needs it. The harness's own browser has it; for a
 * browser passed in without it, that check launches one of its own.
 */
exports.FILE_ACCESS_FLAG = '--allow-file-access-from-files';
function readRelease(label, src) {
    const bytes = (0, node_js_1.readBytes)(src.bundle);
    let code;
    try {
        code = (0, node_js_1.decodeStrict)(bytes);
    }
    catch {
        code = new TextDecoder().decode(bytes);
    }
    let manifestText = '';
    let manifest = null;
    try {
        manifestText = (0, node_js_1.fs)().readFileSync(src.release, 'utf8');
        const raw = JSON.parse(manifestText);
        if (raw && typeof raw === 'object' && !Array.isArray(raw))
            manifest = raw;
    }
    catch { /* reported by C.bundle.release */ }
    const b = manifest?.bundle;
    return {
        label,
        bundleFile: src.bundle,
        code,
        bytes,
        manifest,
        manifestText,
        version: typeof manifest?.version === 'string' ? manifest.version : '',
        bundlePath: typeof b?.path === 'string' ? b.path : (0, node_js_1.path)().basename(src.bundle),
    };
}
class Session {
    constructor(target, options) {
        this.browser = null;
        this.browserError = '';
        this.hostOrigin = '';
        this.fileOrigin = '';
        this.ownsBrowser = false;
        this.fileBrowser = null;
        this.ownsFileBrowser = false;
        this.servers = [];
        this.files = new Map();
        this.tmp = '';
        this.contexts = new Set();
        /** chromeAssemble's page per release, within a scope. */
        this.assemblers = new Map();
        this.memo = new Map();
        /** `file:` URL → its path on disk (writeFile / rewriteFile). */
        this.paths = new Map();
        /** The session itself (a scope's `root`). */
        this.root = this;
        this.fileBrowserPromise = null;
        this.target = target;
        this.options = options;
        this.releases = {
            target: readRelease('target', target),
            ...(target.next ? { next: readRelease('next', target.next) } : {}),
            ...(target.previous ? { previous: readRelease('previous', target.previous) } : {}),
        };
    }
    static async open(target, options, needsBrowser) {
        const s = new Session(target, options);
        s.tmp = (0, node_js_1.fs)().mkdtempSync((0, node_js_1.path)().join((0, node_js_1.os)().tmpdir(), 'orz-conformance-'));
        if (needsBrowser) {
            await s.listen();
            if (options.browser)
                s.browser = options.browser;
            else {
                try {
                    const { chromium } = await (0, node_js_1.playwright)();
                    s.browser = await chromium.launch({ channel: options.channel ?? 'chrome', args: [exports.FILE_ACCESS_FLAG] });
                    s.ownsBrowser = true;
                }
                catch (e) {
                    s.browserError = `no browser: ${e?.message?.split('\n')[0] ?? String(e)}`;
                }
            }
        }
        return s;
    }
    async listen() {
        const handler = (req, res) => {
            const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
            const send = (type, body) => { res.setHeader('content-type', type); res.setHeader('cache-control', 'no-store'); res.end(body); };
            let m;
            if ((m = /^\/file\/(.+)$/.exec(p)) && this.files.has(m[1]))
                return send('text/html; charset=utf-8', this.files.get(m[1]));
            if ((m = /^\/bundle\/(target|next|previous)\.js$/.exec(p))) {
                const r = this.releases[m[1]];
                if (r)
                    return send('text/javascript; charset=utf-8', r.bytes);
            }
            if ((m = /^\/page\/(target|next|previous)\.html$/.exec(p)))
                return send('text/html; charset=utf-8', (0, page_js_1.bundlePage)(`/bundle/${m[1]}.js`));
            if (p === '/host.html')
                return send('text/html; charset=utf-8', page_js_1.HOST_PAGE);
            if (p === '/blank.html')
                return send('text/html; charset=utf-8', '<!doctype html><meta charset="utf-8"><title>blank</title>');
            res.statusCode = 404;
            res.end('not found');
        };
        for (let i = 0; i < 2; i++) {
            const server = (0, node_js_1.http)().createServer(handler);
            await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
            this.servers.push(server);
        }
        const port = (i) => this.servers[i].address().port;
        this.hostOrigin = `http://127.0.0.1:${port(0)}`;
        this.fileOrigin = `http://127.0.0.1:${port(1)}`;
    }
    /** Serve an assembled file from the file origin; returns its URL. */
    serve(name, html) {
        this.files.set(name, html);
        return `${this.fileOrigin}/file/${encodeURIComponent(name)}`;
    }
    /** Write an assembled file to the temporary directory; returns its `file:` URL. */
    writeFile(name, html) {
        const dir = (0, node_js_1.fs)().mkdtempSync((0, node_js_1.path)().join(this.tmp, 'f-'));
        const file = (0, node_js_1.path)().join(dir, name);
        (0, node_js_1.fs)().writeFileSync(file, html, 'utf8');
        const url = `file://${file.split((0, node_js_1.path)().sep).map(encodeURIComponent).join('/')}`;
        this.paths.set(url, file);
        return url;
    }
    /** Replace the bytes of a file made by {@link writeFile} (what a save into it wrote): the next open of its URL reads them. */
    rewriteFile(url, html) {
        const file = this.paths.get(url);
        if (!file)
            throw new Error(`orz conformance: ${url} is not a file of this session`);
        (0, node_js_1.fs)().writeFileSync(file, html, 'utf8');
    }
    /**
     * A view of the session for one check: everything is shared (servers,
     * files, memoised assemblies, the browser) except the contexts it opens
     * (and their pages), which {@link closeContexts} closes when the check ends.
     */
    scope() {
        const child = Object.create(this);
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
    derive(base, o) {
        const code = o.append ? `${base.code}${o.append}` : base.code;
        const bytes = o.append ? new TextEncoder().encode(code) : base.bytes;
        const version = o.version ?? base.version;
        const manifest = { ...(base.manifest ?? {}), version, ...(o.formats ? { formats: o.formats } : {}), bundle: { path: base.bundlePath, integrity: (0, node_js_1.sha384)(bytes) } };
        return { ...base, code, bytes, manifest, manifestText: JSON.stringify(manifest), version };
    }
    /** The target's Node `assemble`, memoised per text and options. */
    assemble(text, o = {}) {
        const engine = o.engineSource === undefined ? '-' : o.engineSource === this.releases.target.code ? 'own' : `sha256:${(0, node_js_1.sha256hex)(o.engineSource)}`;
        const key = `${o.delivery ?? ''}|${engine}|${o.includes ? JSON.stringify(Object.entries(o.includes).sort()) : '-'}|${text}`;
        let p = this.memo.get(key);
        if (!p) {
            p = (0, node_js_1.callAssemble)((t, x) => this.target.assemble(t, x), text, o);
            p.catch(() => undefined);
            this.memo.set(key, p);
        }
        return p;
    }
    /** The URL patterns of the jsDelivr routes for this kind. */
    cdnUrls() {
        const pkg = `${read_js_1.KIND_PACKAGE[this.target.kind]}-browser`;
        return {
            manifest: `https://cdn.jsdelivr.net/npm/${pkg}@latest/release.json`,
            bundle: (r) => `https://cdn.jsdelivr.net/npm/${pkg}@${r.version}/${r.bundlePath}`,
        };
    }
    /** A fresh browser context for one check: recorded dialogs, errors, picker writes, downloads and requests; closed network. */
    async context(o) {
        if (!this.browser)
            throw new Error(this.browserError || 'no browser');
        const browser = o.picker === 'opfs' ? await this.browserForFiles() : this.browser;
        const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
        this.contexts.add(context);
        const records = [];
        const requests = [];
        const downloads = [];
        await context.exposeBinding(page_js_1.RECORD_BINDING, (_source, payload) => { records.push(payload); });
        await context.addInitScript({ content: (0, page_js_1.initScript)(o.picker) });
        const urls = this.cdnUrls();
        const local = [this.hostOrigin, this.fileOrigin];
        await context.route('**/*', async (route) => {
            const url = route.request().url();
            if (url.startsWith('file:') || local.some((l) => url === l || url.startsWith(`${l}/`)))
                return route.continue();
            requests.push(url);
            const cors = { 'access-control-allow-origin': '*' };
            if (url.split('?')[0] === urls.manifest) {
                if (o.cdn?.hold)
                    await o.cdn.hold;
                if (o.cdn?.latest)
                    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: o.cdn.latest.manifestText });
                return route.abort('internetdisconnected');
            }
            if (url.split('?')[0] === exports.CODEMIRROR_URL) {
                const cm = o.codemirror === false ? null : this.codemirrorBytes();
                if (cm)
                    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/javascript; charset=utf-8' }, body: Buffer.from(cm) });
                return route.abort('internetdisconnected'); // the textarea fallback case
            }
            for (const r of [o.cdn?.latest, this.releases.target, this.releases.next, this.releases.previous]) {
                if (!r || url.split('?')[0] !== urls.bundle(r))
                    continue;
                if (o.cdn?.holdBundle)
                    await o.cdn.holdBundle;
                const tampered = o.cdn?.tamper && o.cdn.latest === r;
                const body = tampered ? Buffer.concat([Buffer.from(r.bytes), Buffer.from('\n/* tampered */\n')]) : Buffer.from(r.bytes);
                return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/javascript; charset=utf-8' }, body });
            }
            return route.abort('internetdisconnected');
        });
        const watch = (page) => {
            page.on('dialog', (d) => { records.push({ type: 'dialog', data: { kind: d.type(), message: d.message() }, url: page.url() }); void d.dismiss().catch(() => undefined); });
            page.on('pageerror', (e) => { records.push({ type: 'pageerror', data: e.message, url: page.url() }); });
            page.on('console', (m) => { if (m.type() === 'error')
                records.push({ type: 'console-error', data: m.text(), url: page.url() }); });
            page.on('download', (d) => {
                void d.path().then((file) => {
                    downloads.push({ name: d.suggestedFilename(), data: file ? (0, node_js_1.fs)().readFileSync(file, 'utf8') : '' });
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
    async browserForFiles() {
        return this.root.fileBrowserOf();
    }
    fileBrowserOf() {
        this.fileBrowserPromise ?? (this.fileBrowserPromise = this.launchFileBrowser());
        return this.fileBrowserPromise;
    }
    async launchFileBrowser() {
        if (this.ownsBrowser)
            return this.browser;
        if (!this.fileBrowser) {
            const probe = await this.browser.newContext();
            let ok = false;
            try {
                const page = await probe.newPage();
                await page.goto(this.writeFile('opfs-probe.html', '<!doctype html><meta charset="utf-8"><title>probe</title>'));
                ok = await page.evaluate('navigator.storage.getDirectory().then(function () { return true; }, function () { return false; })');
            }
            catch {
                ok = false;
            }
            finally {
                await probe.close().catch(() => undefined);
            }
            if (ok)
                this.fileBrowser = this.browser;
            else {
                try {
                    const { chromium } = await (0, node_js_1.playwright)();
                    this.fileBrowser = await chromium.launch({ channel: this.options.channel ?? 'chrome', args: [exports.FILE_ACCESS_FLAG] });
                    this.ownsFileBrowser = true;
                }
                catch {
                    this.fileBrowser = this.browser;
                }
            }
        }
        return this.fileBrowser;
    }
    /** This package's `vendor/codemirror6.js` (null when it is not shipped). */
    codemirrorBytes() {
        if (this.codemirror === undefined) {
            try {
                this.codemirror = (0, node_js_1.readBytes)((0, node_js_1.path)().join((0, node_js_1.packageRoot)(), codemirror_pin_js_1.CODEMIRROR6_PATH));
            }
            catch {
                this.codemirror = null;
            }
        }
        return this.codemirror;
    }
    /** Close the contexts this scope opened. */
    async closeContexts() {
        const all = [...this.contexts];
        this.contexts.clear();
        this.assemblers.clear();
        await Promise.all(all.map((c) => c.close().catch(() => undefined)));
    }
    /** A page of the harness origin that loaded a release's bundle by URL (one per release within a scope). */
    bundlePage(r) {
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
    async chromeAssemble(r, texts, delivery, hash = false, includes) {
        const page = await this.bundlePage(r);
        return call(page, `async function (a) {
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
    async close() {
        await this.closeContexts();
        if (this.ownsBrowser)
            await this.browser?.close().catch(() => undefined);
        if (this.fileBrowserPromise)
            await this.fileBrowserPromise.catch(() => undefined);
        if (this.ownsFileBrowser)
            await this.fileBrowser?.close().catch(() => undefined);
        for (const s of this.servers)
            s.close();
        this.servers = [];
        if (this.tmp)
            (0, node_js_1.fs)().rmSync(this.tmp, { recursive: true, force: true });
    }
}
exports.Session = Session;
/** Evaluate a page-side function source with one JSON argument. */
function call(target, fnSource, arg) {
    return target.evaluate(`(${fnSource})(${arg === undefined ? '' : JSON.stringify(arg)})`);
}
//# sourceMappingURL=session.js.map