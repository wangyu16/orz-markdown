/**
 * The standalone runtime of an assembled file, `orz-markdown/carrier/app`
 * (src/carrier/app/, spec/carrier-app.md): claims A.1–A.13 in
 * notes/CLAIMS.md.
 *
 * Substrates. Module boundaries, load-time safety and sizes are static or
 * run in a VM context. The runtime's decisions run in happy-dom against a
 * fake kind behind the seam (`StandaloneKind`) and fake kit services
 * (`services`: saver, host, update), with the real editor shell (textarea
 * engine). What happy-dom cannot show — a real assembled file over `file:`
 * and `http:`, real File System Access handles (the conformance harness's
 * OPFS picker, H.6), the browser's own `beforeunload` prompt, a cross-origin
 * host frame, the quiet update's sandbox and reload — runs in the installed
 * Chrome against the stub carrier of tests/conformance-stub/ (its bundle is
 * `startCarrier` + a small md kind); those tests skip without Chrome.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import type { AddressInfo } from 'node:net';
import { assembleEnvelope, editHeader, extract, lintHeader, mintUid, readDocument, readHeader, UID_PATTERN } from '../src/carrier';
import { createEditorShell, renderMarkdownPreview, textareaAdapter, type EditorShell } from '../src/carrier/editor';
import type { HostConnection, PerformUpdateOptions, PerformUpdateResult, SaveResult, Saver, SaverOptions, UpdateInfo } from '../src/carrier/shell';
import {
  APP_CSS, bootCarrierApp, startCarrier, carrierGlobal, readOpenedFile, openedFileName, copyName, sourceIsland, captureEngineSource,
  menuButton, settingPicker, reviewProposal, attachAiMenu, attachSettings, followPresentation, installCss, WIDGET_CSS,
  type AppServices, type CarrierApp, type CarrierReadView, type KindEditorOptions, type SettingControl, type StandaloneContext, type StandaloneKind, type AppDocument, type AppWindow,
} from '../src/carrier/app';
import { THEMES, themeInfo } from '../src/themes';
import { initScript, readOpfs, writeOpfs, pageRecords, CODEMIRROR_URL } from '../src/carrier/conformance';
import { buildStub, cleanStubs, stubTarget, type BuiltStub } from './conformance-stub/build';
import { sandboxDocument } from '../src/carrier/shell';

// ── fixtures ─────────────────────────────────────────────────────────────

const UID = 'doc-appappapp0000aa11';
const TEXT = `﻿{{nyml\r\nkind: document\r\ntitle: App — 漢字\r\nuid: ${UID}\r\nx_host_key: kept\r\n}}\r\n\r\n# App\r\n\r\nA paragraph with </script> and 𝒳.\r\n`;
const INCLUDES = { 'parts/a.md': '## Part A\n', 'https://inc.test/b.md': '## Part B\r\n' };
const ENGINE = 'globalThis.__engine = 1; /* the inline bundle */';

/** An assembled file of the fake kind: the kit envelope, the read view's article, the chrome mount and the engine. */
function fileHtml(text: string, o: { delivery?: 'inline' | 'cdn'; includes?: Record<string, string>; engine?: string } = {}): string {
  const delivery = o.delivery ?? 'inline';
  const engine = delivery === 'inline' ? `<script id="orz-engine">${o.engine ?? ENGINE}</script>` : '<script id="orz-engine" src="https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@1.0.0/x.js"></script>';
  return assembleEnvelope(text, {
    kind: 'md', shellVersion: '1.0.0', delivery, ...(o.includes ? { includes: o.includes } : {}),
    headHtml: '', bodyHtml: `<main id="orz-app"><article id="orz-doc" class="markdown-body"></article></main>\n<div id="orz-chrome"></div>\n${engine}`,
  });
}

let HappyWindow: typeof import('happy-dom').Window;
beforeAll(async () => {
  ({ Window: HappyWindow } = await import('happy-dom'));
});
type HWin = InstanceType<typeof HappyWindow>;

/** A happy-dom page holding an assembled file (scripts not run), at `url`. */
function filePage(html: string, url = 'file:///Users/me/Docs/notes%20week%203.md.html'): { win: HWin; doc: Document } {
  const win = new HappyWindow({ url, settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, navigator: { userAgent: 'Mozilla/5.0 (Macintosh)' } } as never });
  Object.defineProperty(win.navigator, 'platform', { value: 'MacIntel', configurable: true });
  const doc = win.document as unknown as Document;
  doc.write(html);
  return { win, doc };
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

interface Recorder {
  assembled: Array<{ text: string; delivery?: string; engineSource?: string; includes?: Record<string, string> }>;
  saves: Array<{ suggestedName: string; uid?: string; text: string; html: string; host: boolean }>;
  downloads: Array<{ suggestedName: string; html: string }>;
  savers: SaverOptions[];
  rendered: Array<{ text: string; ctx: unknown }>;
  mounted: Array<{ options: KindEditorOptions; ctx?: StandaloneContext }>;
  actions: string[];
  keys: string[];
}

const themeOf = (text: string) => themeInfo(readHeader(text)?.fields['theme']?.trim());
const THEME: SettingControl = { key: 'theme', label: 'Theme', icon: 'theme', choices: THEMES.map((t) => ({ value: t.id, label: t.name })), current: (t) => themeOf(t).id };

/** A fake kind behind the seam, recording what the app asks of it. */
function fakeKind(rec: Recorder, over: Partial<StandaloneKind> = {}): StandaloneKind {
  return {
    kind: 'md',
    version: '1.0.0',
    formats: [1],
    assemble: (text, o = {}) => {
      rec.assembled.push({ text, ...o });
      return fileHtml(text, { ...(o.delivery ? { delivery: o.delivery } : {}), ...(o.includes ? { includes: o.includes } : {}), ...(o.engineSource ? { engine: o.engineSource } : {}) });
    },
    newDocument: () => editHeader('# New\n', { carrier: 'md', uid: mintUid() }),
    mountEditor: (element, options, ctx) => {
      rec.mounted.push({ options, ...(ctx ? { ctx } : {}) });
      return createEditorShell(element as never, {
        text: options.text,
        render: (t, c) => renderMarkdownPreview(t, c),
        adapter: ctx?.adapter ?? textareaAdapter(),
        preview: { assets: false },
        ...(ctx ? { assemble: ctx.assemble, fileName: ctx.fileName, saver: ctx.saver, ...(ctx.host ? { host: ctx.host } : {}), ...(ctx.includes ? { includes: ctx.includes } : {}), standalone: ctx.standalone, ...(ctx.preferences ? { preferences: ctx.preferences } : {}), hooks: { ...(ctx.ai ? { ai: ctx.ai } : {}) } } : { hooks: options.hooks ?? {} }),
      });
    },
    createReadView: (doc: AppDocument): CarrierReadView => {
      const main = doc.getElementById('orz-app')!;
      const article = doc.getElementById('orz-doc')!;
      return {
        element: main,
        render: (text, ctx) => { rec.rendered.push({ text, ctx }); article.textContent = text; },
        present: (text) => ({ scheme: themeOf(text).scheme }),
        onKey: (e) => { rec.keys.push(String(e.key)); return e.key === 'ArrowRight'; },
      };
    },
    settings: [THEME],
    actions: [
      { id: 'print', label: 'Print', placement: 'bar', run: () => { rec.actions.push('print'); } },
      { id: 'present', label: 'Present', run: (app) => { rec.actions.push('present'); app.setChromeVisible(false); } },
    ],
    readDocument: (text) => readDocument(text, { kind: 'md' }),
    ...over,
  };
}

/** Fake kit services: a saver that writes into `rec.saves` (as File System Access would, proved opened). */
function fakeServices(rec: Recorder, over: Partial<AppServices> = {}): Partial<AppServices> {
  return {
    createSaver: (o: SaverOptions): Saver => {
      rec.savers.push(o);
      return {
        async save({ text, html }) {
          rec.saves.push({ suggestedName: o.suggestedName, ...(o.uid ? { uid: o.uid } : {}), text, html, host: !!o.host?.connected() });
          if (o.host?.connected()) return { via: 'host', ok: true };
          return { via: 'file', ok: true, picked: true, opened: true, name: o.suggestedName };
        },
        async download({ html }) { rec.downloads.push({ suggestedName: o.suggestedName, html }); return { via: 'download', ok: true, confirmed: false, name: o.suggestedName }; },
        handleKey: () => null,
      };
    },
    checkForUpdate: async () => null,
    ...over,
  };
}

const recorder = (): Recorder => ({ assembled: [], saves: [], downloads: [], savers: [], rendered: [], mounted: [], actions: [], keys: [] });

function boot(html = fileHtml(TEXT, { includes: INCLUDES }), o: { url?: string; kind?: Partial<StandaloneKind>; services?: Partial<AppServices>; framed?: boolean; beforeBoot?(win: HWin): void } = {}) {
  const rec = recorder();
  const { win, doc } = filePage(html, o.url);
  if (o.framed) Object.defineProperty(win, 'parent', { value: { postMessage() { /* a host */ } }, configurable: true });
  o.beforeBoot?.(win);
  const app = bootCarrierApp(fakeKind(rec, o.kind), { window: win as unknown as AppWindow, adapter: textareaAdapter(), services: fakeServices(rec, o.services) })!;
  const root = app.root as unknown as ShadowRoot;
  const buttons = () => [...root.querySelectorAll('.orz-app__bar > button, .orz-app__bar > .orz-menu-wrap > button')].map((b) => b.getAttribute('aria-label'));
  const click = (label: string) => { const b = [...root.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === label)!; (b as HTMLButtonElement).click(); };
  const key = (k: string, mods: { meta?: boolean; shift?: boolean } = {}, target: EventTarget = doc.body) => {
    const e = new win.KeyboardEvent('keydown', { key: k, metaKey: !!mods.meta, shiftKey: !!mods.shift, bubbles: true, composed: true, cancelable: true });
    target.dispatchEvent(e as unknown as Event);
    return e;
  };
  const toasts = () => [...root.querySelectorAll('.orz-toast__message')].map((n) => n.textContent ?? '');
  return { app, rec, win, doc, root, buttons, click, key, toasts };
}

// ── A.1 boundaries ───────────────────────────────────────────────────────

function valueImports(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of readFileSync(f, 'utf8').matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?from\s*)?['"]([^'"]+)['"]/gm)) {
      if (!m[1].startsWith('.')) continue;
      const dir = f.slice(0, f.lastIndexOf('/'));
      const parts: string[] = [];
      for (const p of `${dir}/${m[1]}`.split('/')) { if (p === '..') parts.pop(); else if (p !== '.' && p) parts.push(p); }
      const base = parts.join('/').replace(/\.js$/, '');
      queue.push(existsSync(`${base}.ts`) ? `${base}.ts` : `${base}/index.ts`);
    }
  }
  return seen;
}

// 32,933 B on 2026-10-08 (round 1 of the carrier-app loop); bound ~10 % above.
const APP_OWN_LIMIT = 36_000;
const APP_DELTA_LIMIT = 62_000;
const EDITOR_AND_APP_LIMIT = 1_100_000;

describe('module boundaries, load-time safety and size', () => {
  it('[A.1] carrier/app may import carrier/shell, carrier/editor and carrier/read (and the core modules the editor already loads): its value-import graph is that; carrier, carrier/read, carrier/shell, carrier/editor, carrier/conformance and the parser entry never import it; the package exports ./carrier/app', () => {
    const app = valueImports('src/carrier/app/index.ts');
    const allowed = new Set([...valueImports('src/carrier/editor/index.ts'), ...valueImports('src/carrier/shell/index.ts'), ...valueImports('src/carrier/read.ts')]);
    expect([...app].filter((f) => !f.startsWith('src/carrier/app/') && !allowed.has(f))).toEqual([]);
    expect([...app].filter((f) => f.startsWith('src/carrier/app/')).sort()).toEqual(['app.ts', 'engine-source.ts', 'file.ts', 'index.ts', 'start.ts', 'widgets.ts'].map((f) => `src/carrier/app/${f}`));
    for (const entry of ['src/index.ts', 'src/carrier.ts', 'src/carrier/read.ts', 'src/carrier/shell/index.ts', 'src/carrier/editor/index.ts', 'src/carrier/conformance/index.ts']) {
      expect([...valueImports(entry)].filter((f) => f.includes('carrier/app/')), entry).toEqual([]);
    }
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { exports: Record<string, string> };
    expect(pkg.exports['./carrier/app']).toBe('./dist/carrier/app/index.js');
  });

  it('[A.2] carrier/app touches no browser global at load (a context where window, document, storage, navigator, location, fetch and the rest throw loads it; the parser\'s own feature detection aside), and what ships — the CommonJS dist bundled — holds the app\'s own modules under 36 KB and adds under 62 KB to a carrier bundle that already holds the editor (the whole under 1.1 MB)', async () => {
    const { build } = await import('esbuild');
    const load = async (entry: string) => {
      const out = await build({ entryPoints: [entry], bundle: true, platform: 'browser', format: 'cjs', write: false, logLevel: 'silent' });
      const touched: string[] = [];
      const ctx: Record<string, unknown> = { module: { exports: {} }, setTimeout, clearTimeout, console };
      for (const name of ['window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'location', 'self', 'parent', 'fetch', 'crypto', 'CSSStyleSheet', 'requestIdleCallback', 'OrzCarrier', 'showSaveFilePicker']) {
        Object.defineProperty(ctx, name, { get() { touched.push(name); throw new Error(`touched ${name}`); } });
      }
      ctx.exports = (ctx.module as { exports: unknown }).exports;
      ctx.globalThis = ctx;
      vm.createContext(ctx);
      vm.runInContext(out.outputFiles[0].text, ctx);
      return { touched: touched.sort(), api: (ctx.module as { exports: Record<string, unknown> }).exports };
    };
    const app = await load('src/carrier/app/index.ts');
    const parser = await load('src/index.ts');
    expect(Object.keys(app.api)).toEqual(expect.arrayContaining(['startCarrier', 'bootCarrierApp', 'readOpenedFile', 'captureEngineSource', 'attachAiMenu']));
    expect(app.touched).toEqual(parser.touched);
    expect(app.touched.filter((n) => n !== 'document' && n !== 'self')).toEqual([]);
    if (!existsSync('dist/carrier/app/index.js')) return;
    const bytes = async (contents: string) => {
      const out = await build({ stdin: { contents, resolveDir: process.cwd() }, bundle: true, minify: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent', metafile: true });
      const inputs = Object.entries(out.metafile!.outputs)[0][1].inputs;
      return { total: out.outputFiles[0].contents.byteLength, own: Object.entries(inputs).filter(([f]) => f.startsWith('dist/carrier/app/')).reduce((n, [, v]) => n + v.bytesInOutput, 0) };
    };
    const editor = await bytes("export * from './dist/carrier/editor/index.js';");
    const both = await bytes("export * from './dist/carrier/editor/index.js'; export * from './dist/carrier/app/index.js';");
    expect(both.own).toBeLessThan(APP_OWN_LIMIT);
    expect(both.total - editor.total).toBeLessThan(APP_DELTA_LIMIT);
    expect(both.total).toBeLessThan(EDITOR_AND_APP_LIMIT);
  }, 60_000);
});

// ── A.3 the opened file ──────────────────────────────────────────────────

describe('the opened file', () => {
  it('[A.3] readOpenedFile reads the page it was opened from: the exact text (BOM, CR LF), the well-formed uid, the format, the delivery, the resolved includes (own string values only), the inline engine\'s exact text (null for a cdn file), and the file name from the page path (decoded; else document + the kind\'s extension); a page without the island is not a file', () => {
    const { doc } = filePage(fileHtml(TEXT, { includes: INCLUDES }));
    const f = readOpenedFile(doc as unknown as AppDocument, 'md')!;
    expect(f.text === TEXT).toBe(true);
    expect(f).toMatchObject({ uid: UID, format: 1, delivery: 'inline', engine: ENGINE, fileName: 'notes week 3.md.html' });
    expect(f.includes).toEqual(INCLUDES);
    const cdn = readOpenedFile(filePage(fileHtml('# x\n', { delivery: 'cdn' }), 'http://127.0.0.1/a/b.md.html?x#y').doc as unknown as AppDocument, 'md')!;
    expect(cdn).toMatchObject({ delivery: 'cdn', engine: null, fileName: 'b.md.html', format: 1 });
    expect(cdn.uid).toBeUndefined();
    expect(cdn.includes).toBeUndefined();
    const bad = readOpenedFile(filePage(fileHtml('{{nyml\nkind: document\nuid: not a uid\n}}\n'), 'file:///x/other.html').doc as unknown as AppDocument, 'md')!;
    expect(bad.uid).toBeUndefined();
    expect(bad.fileName).toBe('document.md.html');
    expect(openedFileName({ pathname: '/a/%E0%A4%A.md.html' }, 'md')).toBe('document.md.html'); // malformed escape
    expect(openedFileName({ pathname: '/deck.slides.html' }, 'slides')).toBe('deck.slides.html');
    expect(openedFileName({ pathname: '/.paged.html' }, 'paged')).toBe('document.paged.html');
    expect(copyName('notes.md.html', 'md')).toBe('notes copy.md.html');
    expect(copyName('odd.html', 'paged')).toBe('odd.html copy.paged.html');
    const plain = filePage('<!doctype html><title>app</title><script type="text/markdown" id="other"></script>').doc;
    expect(sourceIsland(plain as unknown as AppDocument)).toBeNull();
    expect(readOpenedFile(plain as unknown as AppDocument, 'md')).toBeNull();
    // a forged island that is not a script is not the file
    const forged = filePage('<!doctype html><div id="orz-src">x</div>').doc;
    expect(readOpenedFile(forged as unknown as AppDocument, 'md')).toBeNull();
  });

  it('[A.12] captureEngineSource takes the running bundle\'s own <script>: the file\'s inline #orz-engine exact text, the update sandbox\'s bundle (sandboxDocument inlines the verified bundle with nothing after it), a loaded bundle\'s URL (its file name is the bundle\'s) — fetched once and required script-safe', async () => {
    const inline = captureEngineSource({ currentScript: { id: 'orz-engine', src: '', textContent: ENGINE } });
    expect([inline.inline, inline.url]).toEqual([ENGINE, null]);
    expect(await inline.get('https://x.test/never')).toBe(ENGINE);
    // the update sandbox: the bundle's script text is exactly the bundle (2.2.0: no newline after it), in a page titled "orz update" with no island
    const { win, doc } = filePage(sandboxDocument(ENGINE), 'about:blank');
    const scripts = [...doc.querySelectorAll('script')];
    expect(scripts[0].textContent).toBe(ENGINE);
    const sandboxed = captureEngineSource({ currentScript: scripts[0], title: doc.title, getElementById: (id: string) => doc.getElementById(id) });
    expect(sandboxed.inline).toBe(ENGINE);
    void win;
    const fetchSpy = vi.fn(async (u: string) => ({ ok: true, status: 200, text: async () => (u.includes('unsafe') ? 'x = "<\/script>"' : `/* from ${u} */`) }));
    const g = globalThis as { fetch?: unknown };
    const saved = g.fetch;
    g.fetch = fetchSpy;
    try {
      const loaded = captureEngineSource({ currentScript: { src: 'https://cdn.test/orz-stub.browser.js', textContent: '' } });
      expect([loaded.inline, loaded.url]).toEqual([null, 'https://cdn.test/orz-stub.browser.js']);
      expect(await loaded.get('https://fallback.test/b.js')).toBe('/* from https://cdn.test/orz-stub.browser.js */');
      expect(await loaded.get('https://fallback.test/b.js')).toBe('/* from https://cdn.test/orz-stub.browser.js */');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const esm = captureEngineSource({ currentScript: null });
      expect(await esm.get('https://fallback.test/b.js')).toBe('/* from https://fallback.test/b.js */');
      const unsafe = captureEngineSource({ currentScript: { src: 'https://cdn.test/orz-unsafe.browser.js' } });
      await expect(unsafe.get('https://fallback.test/unsafe.js')).rejects.toThrow(/not script-safe/);
    } finally {
      g.fetch = saved;
    }
  });

  it('[A.12] only the carrier\'s bundle is the engine: an app script that bundles the IIFE — loaded (app.js) or inline in the app\'s page — is not taken, and the release\'s CDN URL is fetched instead; with bundle the file name must match exactly; with integrity an inline text must match it', async () => {
    const fetched: string[] = [];
    const g = globalThis as { fetch?: unknown };
    const saved = g.fetch;
    g.fetch = async (u: string) => { fetched.push(u); return { ok: true, status: 200, text: async () => `/* the release bundle from ${u} */` }; };
    const CDN = 'https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@1.0.0/orz-mdhtml.browser.js';
    try {
      const appJs = captureEngineSource({ currentScript: { src: 'https://app.test/assets/app.js' } });
      expect([appJs.inline, appJs.url]).toEqual([null, null]);
      expect(await appJs.get(CDN)).toBe(`/* the release bundle from ${CDN} */`);
      expect(fetched).toEqual([CDN]);
      // an inline app script (no #orz-engine, not the update sandbox) bundling the IIFE plus the app's own code
      const appInline = captureEngineSource({ currentScript: { textContent: `${ENGINE}\n/* the app's own code */` }, title: 'My app', getElementById: () => null });
      expect(appInline.inline).toBeNull();
      // a bundle name of the family but not this carrier's
      expect(captureEngineSource({ currentScript: { src: 'https://cdn.test/orz-slides.browser.js' } }, { bundle: 'orz-mdhtml.browser.js' }).url).toBeNull();
      expect(captureEngineSource({ currentScript: { src: 'https://cdn.test/v/orz-mdhtml.browser.js?x=1' } }, { bundle: 'orz-mdhtml.browser.js' }).url).toBe('https://cdn.test/v/orz-mdhtml.browser.js?x=1');
      // integrity: the inline text must be the release's bytes
      const { createHash } = await import('node:crypto');
      const sri = `sha384-${createHash('sha384').update(ENGINE, 'utf8').digest('base64')}`;
      expect(await captureEngineSource({ currentScript: { id: 'orz-engine', textContent: ENGINE } }, { integrity: sri }).get(CDN)).toBe(ENGINE);
      fetched.length = 0;
      expect(await captureEngineSource({ currentScript: { id: 'orz-engine', textContent: `${ENGINE} ` } }, { integrity: sri }).get(CDN)).toBe(`/* the release bundle from ${CDN} */`);
      expect(fetched).toEqual([CDN]);
    } finally {
      g.fetch = saved;
    }
  });
});

// ── A.4 the seam ─────────────────────────────────────────────────────────

describe('the seam (StandaloneKind)', () => {
  it('[A.4] bootCarrierApp is null and touches nothing in a page that is not an assembled file; in a file it creates the kind\'s read view once and renders the exact text with the file\'s includes, mounts the chrome in a shadow root on #orz-chrome (brand, Edit, the kind\'s settings and bar actions, Save, More) and adds nothing else to the page; the chrome\'s scheme is the document\'s (the reader\'s darkChrome preference wins)', async () => {
    const rec = recorder();
    const plain = filePage('<!doctype html><title>app</title><body><p>app</p></body>', 'https://app.test/');
    const before = plain.doc.documentElement.outerHTML;
    expect(bootCarrierApp(fakeKind(rec), { window: plain.win as unknown as AppWindow, services: fakeServices(rec) })).toBeNull();
    expect(plain.doc.documentElement.outerHTML).toBe(before);
    expect(rec.rendered).toEqual([]);
    const b = boot(fileHtml(editHeader(TEXT, { theme: 'dark-elegant-1' }), { includes: INCLUDES }));
    await b.app.ready;
    expect(b.rec.rendered).toHaveLength(1);
    expect(b.rec.rendered[0].text === editHeader(TEXT, { theme: 'dark-elegant-1' })).toBe(true);
    expect(b.rec.rendered[0].ctx).toEqual({ includes: INCLUDES });
    const host = b.doc.getElementById('orz-chrome')!;
    expect(host.shadowRoot).toBe(b.app.root);
    expect(host.getAttribute('data-chrome')).toBe('dark');
    expect(b.buttons()).toEqual(['Edit', 'Theme', 'Print', 'Save', 'Done', 'More']);
    expect((b.root.querySelector('#orz-brand') as HTMLElement).textContent).toBe('orz');
    expect([...b.doc.body.children].map((e) => e.id || e.tagName)).toEqual(['orz-src', 'orz-includes', 'orz-chrome', 'orz-app', 'orz-engine']); // the chrome first after the islands (A.18)
    expect(b.doc.head.querySelectorAll('style, link').length).toBe(0);
    b.app.dispose();
    // a darkChrome preference wins over the document's scheme; a kind's brand
    const rec2 = recorder();
    const p2 = filePage(fileHtml(TEXT));
    p2.win.localStorage.setItem(`orz-pref:${UID}:darkChrome`, 'true');
    const a2 = bootCarrierApp(fakeKind(rec2, { brand: 'orz md' }), { window: p2.win as unknown as AppWindow, services: fakeServices(rec2) })!;
    expect(p2.doc.getElementById('orz-chrome')!.getAttribute('data-chrome')).toBe('dark');
    expect((a2.root as unknown as ShadowRoot).querySelector('#orz-brand')!.textContent).toBe('orz md');
    a2.dispose();
  });

  it('[A.4] the kind-independent sources name no kind: no md, slides or paged specifics (renderers, themes, measures, article classes, file extensions) outside the kind registry, and a carrier written with the DOM lib\'s types (HTMLElement, Document, Window) satisfies the seam (tsc)', async () => {
    for (const f of readdirSync('src/carrier/app')) {
      const code = readFileSync(`src/carrier/app/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').replace(/'md' \| 'slides' \| 'paged'/g, '');
      expect(code, f).not.toMatch(/['"]md['"]|['"]slides['"]|['"]paged['"]|markdown-body|measure|light-neat|renderMarkdownPreview|\.md\.html|Paged|reveal/);
    }
    const ts = await import('typescript');
    const dir = mkdtempSync(join(tmpdir(), 'orz-app-dom-'));
    const fixture = join(dir, 'kind.ts');
    writeFileSync(fixture, `
import type { AppWindow, AppElement, AppDocument, AppShadowRoot, AppEvent, StandaloneKind, CarrierReadView, KindEditorOptions, StandaloneContext } from ${JSON.stringify(join(process.cwd(), 'src/carrier/app'))};
import type { EditorShell } from ${JSON.stringify(join(process.cwd(), 'src/carrier/editor'))};
const w: AppWindow = window;
const d: AppDocument = document;
const el: AppElement = document.createElement('div');
const sr: AppShadowRoot = document.body.attachShadow({ mode: 'open' });
const ev: AppEvent = new KeyboardEvent('keydown');
declare function mount(element: HTMLElement, options: KindEditorOptions, ctx?: StandaloneContext): EditorShell;
declare function view(doc: Document): CarrierReadView;
const k: StandaloneKind = { kind: 'paged', version: '1.0.0', formats: [1], assemble: (t) => t, newDocument: () => '', mountEditor: mount, createReadView: view, readDocument: () => ({}) as never };
void [w, d, el, sr, ev, k];
`, 'utf8');
    const program = ts.createProgram([fixture], { strict: true, noEmit: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10, lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'], skipLibCheck: true, esModuleInterop: true, noImplicitAny: false });
    const errors = ts.getPreEmitDiagnostics(program).filter((x) => x.file?.fileName === fixture || (x.file?.fileName ?? '').includes('/src/carrier/app/')).map((x) => ts.flattenDiagnosticMessageText(x.messageText, '\n'));
    rmSync(dir, { recursive: true, force: true });
    expect(errors).toEqual([]);
  }, 60_000);

  it('[A.4] startCarrier sets the FC-19 §2 global from the kind (kind, version, formats, assemble as a promise, extract, readDocument, mountEditor, renderPreview, standalone) and boots only in an assembled file; OrzCarrier.mountEditor without hooks.save in a file mounts on the file\'s context and attaches the editor until it is destroyed; with hooks.save (an app) it gets no context', async () => {
    const rec = recorder();
    const g: Record<string, unknown> = {};
    const plain = filePage('<!doctype html><title>app</title>', 'https://app.test/');
    const s0 = startCarrier(fakeKind(rec), { global: g, window: plain.win as unknown as AppWindow, services: fakeServices(rec) });
    expect(s0.app).toBeNull();
    const C = g.OrzCarrier as ReturnType<typeof carrierGlobal>;
    expect(C).toBe(s0.carrier);
    expect([C.kind, C.version, C.formats, C.standalone]).toEqual(['md', '1.0.0', [1], null]);
    await expect(C.assemble('# a\n', { delivery: 'cdn' })).resolves.toContain('"delivery":"cdn"');
    await expect(C.assemble('\u0000')).rejects.toThrow(/NUL/);
    expect(C.extract(fileHtml('# x\n'))!.text).toBe('# x\n');
    expect(C.readDocument('# T\n').title).toBe('T');
    expect(C.renderPreview).toBeUndefined();
    const el = plain.doc.createElement('div');
    plain.doc.body.append(el);
    C.mountEditor(el as never, { text: '# app\n', hooks: { save: async () => undefined } }).destroy();
    expect(rec.mounted.at(-1)!.ctx).toBeUndefined();
    // in a file
    const p = filePage(fileHtml(TEXT, { includes: INCLUDES }));
    const g2: Record<string, unknown> = {};
    const rec2 = recorder();
    const s = startCarrier(fakeKind(rec2), { global: g2, window: p.win as unknown as AppWindow, services: fakeServices(rec2) });
    const C2 = g2.OrzCarrier as ReturnType<typeof carrierGlobal>;
    expect(C2.standalone).toBe(s.app);
    const el2 = p.doc.createElement('div');
    p.doc.body.append(el2);
    const ed = C2.mountEditor(el2 as never, { text: TEXT });
    expect(rec2.mounted.at(-1)!.ctx).toMatchObject({ fileName: 'notes week 3.md.html', includes: INCLUDES, standalone: true });
    ed.setText(`${TEXT}more\r\n`);
    expect(s.app!.isDirty()).toBe(true);
    expect(s.app!.getText()).toBe(`${TEXT}more\r\n`); // the attached editor is the document being edited
    ed.destroy();
    expect(s.app!.isDirty()).toBe(false);
    expect(s.app!.getText() === TEXT).toBe(true);
    s.app!.dispose();
  });
});

// ── A.5 saves ────────────────────────────────────────────────────────────

describe('saving from the page', () => {
  it('[A.5] Save writes the kind\'s assemble of the current text with the file\'s delivery, engine and includes (never the live DOM) through the one saver (uid, file name, opened bytes = the same assembly of the opened text); a newer text format is not saved; a served page says so; Download a copy downloads the same bytes', async () => {
    const b = boot();
    await b.app.ready;
    expect(b.rec.savers[0]).toMatchObject({ uid: UID, suggestedName: 'notes week 3.md.html', kind: 'md' });
    const opened = b.rec.savers[0].openedHtml as () => Promise<string>;
    expect(await opened()).toBe(fileHtml(TEXT, { includes: INCLUDES }));
    b.doc.body.append(Object.assign(b.doc.createElement('p'), { textContent: 'LIVE-DOM-MARKER' }));
    b.app.setSetting({ theme: 'light-academic-1' });
    const r = await b.app.save();
    expect(r).toMatchObject({ ok: true, via: 'file' });
    const t = editHeader(TEXT, { theme: 'light-academic-1' });
    expect(b.rec.saves.at(-1)!.text === t).toBe(true);
    expect(b.rec.saves.at(-1)!.html).toBe(fileHtml(t, { includes: INCLUDES }));
    expect(b.rec.saves.at(-1)!.html).not.toContain('LIVE-DOM-MARKER');
    expect(b.rec.assembled.at(-1)).toMatchObject({ delivery: 'inline', engineSource: ENGINE, includes: INCLUDES });
    expect(b.app.isDirty()).toBe(false);
    expect(b.toasts()).toContain('Saved.');
    const d = await b.app.download();
    expect(d).toMatchObject({ via: 'download', ok: true });
    expect(b.rec.downloads.at(-1)!.html).toBe(fileHtml(t, { includes: INCLUDES }));
    b.app.dispose();
    // a cdn file stays cdn
    const c = boot(fileHtml('{{nyml\nkind: document\nuid: doc-cdncdncdn0000cc22\n}}\n\n# c\n', { delivery: 'cdn' }));
    c.app.setSetting({ theme: 'beige-decent-1' });
    await c.app.save();
    expect(c.rec.assembled.at(-1)!.delivery).toBe('cdn');
    expect(c.rec.assembled.at(-1)!.engineSource).toBeUndefined();
    c.app.dispose();
    // a newer text format is shown, never saved
    const n = boot(fileHtml('{{nyml\nkind: document\nformat: 1\n}}\n\n# n\n'), { kind: { formats: [1] } });
    n.app.setSetting({ format: '2' });
    expect(await n.app.save()).toEqual({ ok: false, error: 'format' });
    expect(n.rec.saves).toEqual([]);
    n.app.dispose();
    // the served-page notice
    const s = boot(undefined, { services: { createSaver: (o) => ({ save: async () => ({ via: 'served-notice' }), download: async () => ({ via: 'download', ok: true, confirmed: false, name: o.suggestedName }), handleKey: () => null }) } });
    s.app.setSetting({ theme: 'beige-decent-1' });
    expect(await s.app.save()).toMatchObject({ ok: false, via: 'served-notice' });
    expect(s.toasts().join(' ')).toContain('opened from a web address, so it cannot be saved over');
    expect(s.app.isDirty()).toBe(true);
    s.app.dispose();
  });

  it('[A.5] New document saves the kind\'s new text as a new file (its own uid, Untitled + the extension, the file\'s delivery, no includes) and Save as new copy the current text with a NEW uid (copy name, the file\'s includes) — each through a saver of its own (never the file\'s handle, never the host: a served page or a host gets a download) — leaving the document as it is', async () => {
    const b = boot();
    await b.app.ready;
    const n = await b.app.newDocument();
    expect(n).toMatchObject({ via: 'file', ok: true, name: 'Untitled.md.html' });
    const newSave = b.rec.saves.at(-1)!;
    const newText = extract(newSave.html)!.text;
    expect(newSave.uid).toMatch(UID_PATTERN);
    expect(newSave.uid).not.toBe(UID);
    expect(readDocument(newText, { kind: 'md' }).meta.uid).toBe(newSave.uid);
    expect(lintHeader(newText, 'md').filter((l) => l.level === 'error')).toEqual([]);
    expect(extract(newSave.html)!.includes).toBeUndefined();
    expect(b.rec.savers.at(-1)).toMatchObject({ suggestedName: 'Untitled.md.html' });
    expect(b.rec.savers.at(-1)!.openedHtml).toBeUndefined();
    const c = await b.app.saveAsCopy();
    expect(c).toMatchObject({ via: 'file', ok: true, name: 'notes week 3 copy.md.html' });
    const copy = b.rec.saves.at(-1)!;
    const copyText = extract(copy.html)!.text;
    expect(copyText === editHeader(TEXT, { uid: readHeader(copyText)!.fields.uid })).toBe(true);
    expect(readHeader(copyText)!.fields.uid).not.toBe(UID);
    expect(extract(copy.html)!.includes).toEqual(INCLUDES);
    expect(b.app.getText() === TEXT).toBe(true);
    expect(b.app.isDirty()).toBe(false);
    // the More menu offers them
    b.click('More');
    expect([...b.root.querySelectorAll('[role="menuitem"]')].map((x) => x.textContent)).toEqual(['Download a copy', 'New document', 'Save as new copy', 'Present']);
    b.app.dispose();
    // a page whose saver goes to a host / a served page: the new file is downloaded instead
    const h = boot(undefined, { services: { createSaver: (o) => ({ save: async () => ({ via: 'host', ok: true }), download: async ({ html }) => { h.rec.downloads.push({ suggestedName: o.suggestedName, html }); return { via: 'download', ok: true, confirmed: false, name: o.suggestedName }; }, handleKey: () => null }) } });
    expect(await h.app.newDocument()).toMatchObject({ via: 'download', ok: true });
    expect(h.rec.downloads.at(-1)!.suggestedName).toBe('Untitled.md.html');
    h.app.dispose();
  });
});

// ── A.6 edit mode and settings ───────────────────────────────────────────

describe('edit mode and header settings', () => {
  it('[A.6] a setting in the read view writes the header (editHeader, one step: Cmd/Ctrl+Z / Shift+Z undo and redo it), re-renders and re-presents the read view and marks the document unsaved; Edit mounts the kind\'s editor on the file\'s context (its saver, assemble, includes, opened bytes, preferences, standalone) with the saved text and the current one as one undoable edit, hides the read view, and Done leaves with the text; a setting in edit mode is one undoable edit of the editor', async () => {
    const b = boot();
    await b.app.ready;
    b.click('Theme');
    const nocturne = [...b.root.querySelectorAll('[role="menuitemradio"]')].find((x) => x.textContent === 'Nocturne') as HTMLButtonElement;
    nocturne.click();
    expect(b.app.getText() === editHeader(TEXT, { theme: 'dark-elegant-3' })).toBe(true);
    expect(b.app.isDirty()).toBe(true);
    expect(b.doc.getElementById('orz-chrome')!.getAttribute('data-chrome')).toBe('dark');
    await tick();
    expect(b.rec.rendered.at(-1)!.text === b.app.getText()).toBe(true);
    expect((b.root.querySelector('.orz-app__save') as HTMLElement).getAttribute('data-dirty')).toBe('true');
    expect(b.key('z', { meta: true }).defaultPrevented).toBe(true);
    expect(b.app.getText() === TEXT).toBe(true);
    expect(b.app.isDirty()).toBe(false);
    b.key('z', { meta: true, shift: true });
    expect(b.app.getText() === editHeader(TEXT, { theme: 'dark-elegant-3' })).toBe(true);
    // Edit
    b.click('Edit');
    const ed = b.app.editor()!;
    expect(b.doc.getElementById('orz-chrome')!.getAttribute('data-mode')).toBe('edit');
    expect(b.doc.getElementById('orz-app')!.hidden).toBe(true);
    const ctx = b.rec.mounted.at(-1)!.ctx!;
    expect(b.rec.mounted.at(-1)!.options.text === TEXT).toBe(true); // mounted with the saved text…
    expect(ed.getText() === editHeader(TEXT, { theme: 'dark-elegant-3' })).toBe(true); // …then the current one
    expect(ctx).toMatchObject({ fileName: 'notes week 3.md.html', includes: INCLUDES, standalone: true });
    expect(ctx.saver).toBeDefined();
    expect(await ctx.openedHtml!()).toBe(fileHtml(TEXT, { includes: INCLUDES }));
    expect(await ctx.assemble('# x\n')).toBe(fileHtml('# x\n'));
    expect(ctx.preferences!.get('viewMode')).toBe('split');
    expect(ed.isDirty()).toBe(true);
    expect(ed.undo()).toBe(true);
    expect(ed.getText() === TEXT).toBe(true);
    expect(ed.isDirty()).toBe(false);
    ed.redo();
    b.app.setSetting({ theme: 'light-academic-1' }); // in edit mode: the editor's one undoable edit
    expect(ed.getText() === editHeader(TEXT, { theme: 'light-academic-1' })).toBe(true);
    ed.undo();
    expect(ed.getText() === editHeader(TEXT, { theme: 'dark-elegant-3' })).toBe(true);
    expect(b.app.undo()).toBe(false); // the page's own undo stays out of the editor
    await b.app.leave();
    expect(b.app.editor()).toBeNull();
    expect(b.doc.getElementById('orz-app')!.hidden).toBe(false);
    expect(b.app.getText() === editHeader(TEXT, { theme: 'dark-elegant-3' })).toBe(true);
    expect(b.app.isDirty()).toBe(true);
    expect(b.rec.rendered.at(-1)!.text === b.app.getText()).toBe(true);
    // Cmd/Ctrl+E edits again, Cmd/Ctrl+S then saves the editor
    b.key('e', { meta: true });
    expect(b.app.editor()).not.toBeNull();
    b.app.dispose();
  });

  it('[A.6] a kind\'s actions: bar actions are buttons of the read view, menu actions items of More; they run with the app (Present hides the chrome: setChromeVisible); a failing action is a toast', async () => {
    const b = boot(undefined, { kind: { actions: [{ id: 'print', label: 'Print', placement: 'bar', run: () => { b.rec.actions.push('print'); } }, { id: 'present', label: 'Present', run: (app) => { b.rec.actions.push('present'); app.setChromeVisible(false); } }, { id: 'fail', label: 'Fail', run: () => { throw new Error('nope'); } }] } });
    b.click('Print');
    await tick();
    expect(b.rec.actions).toEqual(['print']);
    expect((b.root.querySelector('[data-orz-action="print"]') as HTMLElement).classList.contains('orz-app__read-only')).toBe(true);
    b.click('More');
    ([...b.root.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent === 'Present') as HTMLButtonElement).click();
    await tick();
    expect(b.rec.actions).toEqual(['print', 'present']);
    expect(b.doc.getElementById('orz-chrome')!.hasAttribute('data-hidden')).toBe(true);
    b.app.setChromeVisible(true);
    expect(b.doc.getElementById('orz-chrome')!.hasAttribute('data-hidden')).toBe(false);
    b.click('More');
    ([...b.root.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent === 'Fail') as HTMLButtonElement).click();
    await tick(10);
    expect(b.toasts()).toContain('Fail: nope');
    b.app.dispose();
  });
});

// ── A.7 leaving with unsaved changes ─────────────────────────────────────

describe('leaving with unsaved changes', () => {
  it('[A.7] a top-level file asks before the page goes (beforeunload) exactly while it has unsaved changes — a setting, an edit, an attached editor\'s edit — and not after a save or an undo back; a framed file never asks (its host owns that)', async () => {
    const b = boot();
    const leave = () => { const e = new b.win.Event('beforeunload', { cancelable: true }); b.win.dispatchEvent(e as unknown as Event); return e.defaultPrevented; };
    expect(leave()).toBe(false);
    b.app.setSetting({ theme: 'beige-decent-2' });
    expect(leave()).toBe(true);
    b.app.undo();
    expect(leave()).toBe(false);
    const ed = b.app.edit();
    ed.setText(`${TEXT}x`);
    expect(leave()).toBe(true);
    await b.app.save();
    expect(leave()).toBe(false);
    await b.app.leave();
    const el = b.doc.createElement('div');
    b.doc.body.append(el);
    const attached = b.app.kind.mountEditor(el as never, { text: b.app.getText() }, b.app.editorContext());
    const detach = b.app.attach(attached);
    attached.setText(`${attached.getText()}y`);
    expect(leave()).toBe(true);
    detach();
    attached.destroy();
    expect(leave()).toBe(false);
    b.app.dispose();
    const f = boot(undefined, { framed: true, services: { connectHost: () => fakeHost() } });
    f.app.setSetting({ theme: 'beige-decent-2' });
    const e = new f.win.Event('beforeunload', { cancelable: true });
    f.win.dispatchEvent(e as unknown as Event);
    expect(e.defaultPrevented).toBe(false);
    f.app.dispose();
  });
});

// ── A.8 the host ─────────────────────────────────────────────────────────

function fakeHost(o: { ops?: Array<{ id: string; title: string; selection: boolean }>; include?: boolean } = {}): HostConnection & { dirty: boolean[]; ai: Array<[string, string, boolean | undefined]>; opsReady(): void; onOps?: () => void } {
  let ops = o.ops ?? [];
  const h = {
    dirty: [] as boolean[],
    ai: [] as Array<[string, string, boolean | undefined]>,
    connected: () => true,
    protocols: () => ({ save: true, ai: ops.length > 0, include: !!o.include }),
    origin: () => 'https://host.test',
    aiOperations: () => ops,
    save: async () => ({ ok: true }),
    requestAi: async (op: string, text: string, selection?: boolean) => { h.ai.push([op, text, selection]); return { ok: true, proposed: `${text.toUpperCase()}` }; },
    requestInclude: async (url: string) => `HOST ${url}\n`,
    setDirty: (d: boolean) => { h.dirty.push(d); },
    dispose: () => undefined,
    opsReady() { ops = [{ id: 'shout', title: 'Shout', selection: true }]; },
  };
  return h as never;
}

describe('the host connection', () => {
  it('[A.8] a framed file connects (connectHost, all three protocols, its window) and only a framed one: saves go through the saver with the host; the read view and the editor get the host\'s include resolution; the host\'s AI operations become an AI menu in the editor whose proposals are reviewed before they apply (one undoable edit); the read view\'s dirty state is posted while no editor is the document', async () => {
    const top = boot(undefined, { services: { connectHost: () => { throw new Error('a top-level file never connects'); } } });
    expect(top.app.host).toBeUndefined();
    expect(top.app.editorContext().ai).toBeUndefined();
    top.app.dispose();
    let opts: Record<string, unknown> | null = null;
    const host = fakeHost({ include: true });
    const b = boot(undefined, { framed: true, services: { connectHost: (o) => { opts = o as never; return host; } } });
    expect(opts).toMatchObject({ kind: 'md' });
    expect((opts as unknown as { window: unknown }).window).toBe(b.win);
    expect(b.app.host).toBe(host);
    await b.app.ready;
    const ctx = b.rec.rendered[0].ctx as { fetchInclude(u: string): Promise<string | null> };
    expect(await ctx.fetchInclude('https://inc.test/b.md')).toBe('HOST https://inc.test/b.md\n');
    expect(b.rec.savers[0].host).toBe(host);
    b.app.setSetting({ theme: 'beige-decent-2' });
    expect(host.dirty).toEqual([true]);
    // AI: no operations yet → no menu; the host's hello adds them (onOperations) → the menu appears
    const ed = b.app.edit();
    const edRoot = ed.root as unknown as ShadowRoot;
    expect(edRoot.querySelector('[data-orz-ai-menu]')).toBeNull();
    host.opsReady();
    ((opts as unknown as { ai: { onOperations(): void } }).ai).onOperations();
    expect(edRoot.querySelector('[data-orz-ai-menu]')).not.toBeNull();
    const ta = edRoot.querySelector('textarea') as HTMLTextAreaElement;
    const at = ta.value.indexOf('A paragraph');
    ta.setSelectionRange(at, at + 'A paragraph'.length);
    (edRoot.querySelector('[data-orz-ai-menu] > button') as HTMLButtonElement).click();
    (edRoot.querySelector('[role="menuitem"]') as HTMLButtonElement).click();
    await tick(10);
    expect(host.ai).toEqual([['shout', 'A paragraph', true]]);
    const panel = edRoot.querySelector('.orz-review') as HTMLElement;
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('false');
    const before = ed.getText();
    expect(ed.getText()).toBe(before); // untouched until applied
    ([...panel.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Replace selection') as HTMLButtonElement).click();
    await tick(10);
    expect(ed.getText()).toBe(before.replace('A paragraph', 'A PARAGRAPH'));
    expect(ed.undo()).toBe(true);
    expect(ed.getText()).toBe(before);
    b.app.dispose();
  });
});

// ── A.9 the quiet update ─────────────────────────────────────────────────

const INFO: UpdateInfo = { kind: 'md', current: '1.0.0', latest: '1.1.0', notes: null, manifest: { kind: 'md', version: '1.1.0', formats: [1], notes: null, bundle: { path: 'x.js', integrity: `sha384-${'A'.repeat(64)}` } } as never };

describe('the quiet update', () => {
  it('[A.9] only a top-level file checks (with the kind, its version, the file\'s format and the page); an offer mounts the indicator after the brand; Update now runs performUpdate with the file\'s saver, delivery and includes and the current text (read again by the kit), makes every editor of the document and the settings read-only while it runs, gives them back when it settles without a reload, reloads only when the kit says so (and asks nothing then), and a served page\'s update is a download', async () => {
    let checked: Record<string, unknown> | null = null;
    let handlers: { onUpdate(i: UpdateInfo): unknown } | null = null;
    let anchor: unknown = null;
    let result: PerformUpdateResult = { status: 'failed', info: INFO, code: 'changed', error: 'the text changed' };
    let seen: PerformUpdateOptions | null = null;
    let release!: () => void;
    let readOnlyDuring: boolean[] = [];
    const reload = vi.fn();
    const b = boot(undefined, {
      services: {
        checkForUpdate: async (o) => { checked = o as never; return INFO; },
        mountUpdateIndicator: (a, _i, h) => { anchor = a; handlers = h; return { host: a, root: a, open() {}, close() {}, isOpen: () => false, dispose() {} } as never; },
        performUpdate: async (o) => { seen = o; readOnlyDuring = [b.app.editor()!.isReadOnly(), (b.root.querySelector('.orz-menu-wrap > button[aria-label="Theme"]') as HTMLButtonElement).disabled]; await new Promise<void>((r) => { release = r; }); return result; },
      },
    });
    Object.defineProperty(b.win.location, 'reload', { value: reload, configurable: true });
    await tick(10);
    expect(checked).toMatchObject({ kind: 'md', current: '1.0.0', format: 1 });
    expect((checked as unknown as { page: unknown }).page).toBe(b.win);
    expect(anchor).toBe(b.root.querySelector('#orz-brand'));
    const ed = b.app.edit();
    ed.setText(`${TEXT}edit\r\n`);
    const running = handlers!.onUpdate(INFO) as Promise<void>;
    await tick();
    expect(b.app.updating).toBe(true);
    expect(readOnlyDuring).toEqual([true, true]);
    expect(seen).toMatchObject({ info: INFO, kind: 'md', current: '1.0.0', delivery: 'inline', includes: INCLUDES });
    expect(seen!.getText!()).toBe(`${TEXT}edit\r\n`);
    b.app.setSetting({ theme: 'beige-decent-1' }); // refused while updating
    expect(b.toasts().join(' ')).toContain('An update is running');
    release();
    await expect(running).rejects.toThrow('the text changed');
    expect(b.app.updating).toBe(false);
    expect(ed.isReadOnly()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    // a write to the opened file: reload, and nothing is asked on the way out
    result = { status: 'updated', info: INFO, html: '<html>', text: ed.getText(), save: { via: 'file', ok: true, picked: false, opened: true }, reload: true };
    const second = handlers!.onUpdate(INFO) as Promise<void>;
    await tick();
    release();
    await second;
    expect(reload).toHaveBeenCalledTimes(1);
    const e = new b.win.Event('beforeunload', { cancelable: true });
    b.win.dispatchEvent(e as unknown as Event);
    expect(e.defaultPrevented).toBe(false);
    b.app.dispose();
    // a served page: the updated file is downloaded; framed: no check at all
    const s = boot(undefined, { services: { checkForUpdate: async () => INFO, mountUpdateIndicator: (a, _i, h) => { handlers = h; return { dispose() {} } as never; }, performUpdate: async () => ({ status: 'updated', info: INFO, html: '<html>new</html>', text: TEXT, save: { via: 'served-notice' }, reload: false }) } });
    await tick(10);
    await handlers!.onUpdate(INFO);
    expect(s.rec.downloads.map((d) => d.html)).toEqual(['<html>new</html>']);
    s.app.dispose();
    const check = vi.fn(async () => INFO);
    const f = boot(undefined, { framed: true, services: { connectHost: () => fakeHost(), checkForUpdate: check } });
    await tick(10);
    expect(check).not.toHaveBeenCalled();
    f.app.dispose();
  });
});

// ── A.10 the page keymap ─────────────────────────────────────────────────

describe('the page keymap', () => {
  it('[A.10] Cmd/Ctrl+S saves the document being edited (an attached editor\'s, never the page\'s other copy), a key another handler already took (defaultPrevented) is never the page\'s, Cmd/Ctrl+E edits, Cmd/Ctrl+Z undoes a setting outside fields only, and other keys go to the read view (onKey) — not while typing in a field, not a chrome button\'s own keys (Space, Enter, Tab, Escape), not while an editor is the document', async () => {
    const b = boot();
    await b.app.ready;
    b.app.setSetting({ theme: 'beige-decent-2' });
    const taken = new b.win.KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true });
    b.doc.body.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 's' && (e as KeyboardEvent).metaKey && !b.rec.saves.length) e.preventDefault(); }, { once: true });
    b.doc.body.dispatchEvent(taken as unknown as Event);
    await tick();
    expect(b.rec.saves).toEqual([]);
    expect(b.key('s', { meta: true }).defaultPrevented).toBe(true);
    await tick();
    expect(b.rec.saves).toHaveLength(1);
    // read-view keys
    expect(b.key('ArrowRight').defaultPrevented).toBe(true);
    b.key('x');
    const input = b.doc.createElement('input');
    b.doc.body.append(input);
    b.key('ArrowLeft', {}, input);
    b.key('z', { meta: true }, input); // typing: not the page's undo
    expect(b.app.getText() === editHeader(TEXT, { theme: 'beige-decent-2' })).toBe(true);
    // from a chrome button: its own keys stay the button's (Space, Enter, Tab, Escape); navigation keys reach the view
    const editButton = b.root.querySelector('button') as HTMLButtonElement;
    for (const k of [' ', 'Enter', 'Tab', 'Escape']) editButton.dispatchEvent(new b.win.KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true }) as unknown as Event);
    expect(b.rec.keys).toEqual(['ArrowRight', 'x']);
    editButton.dispatchEvent(new b.win.KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, composed: true, cancelable: true }) as unknown as Event);
    expect(b.rec.keys).toEqual(['ArrowRight', 'x', 'PageDown']);
    // an attached editor is the document: Cmd/Ctrl+S saves it, the read view gets no keys
    const el = b.doc.createElement('div');
    b.doc.body.append(el);
    const attached = b.app.kind.mountEditor(el as never, { text: b.app.getText() }, b.app.editorContext());
    const detach = b.app.attach(attached);
    attached.setText(`${attached.getText()}attached\r\n`);
    b.key('s', { meta: true });
    await tick(10);
    expect(b.rec.saves.at(-1)!.text).toBe(`${editHeader(TEXT, { theme: 'beige-decent-2' })}attached\r\n`);
    b.key('ArrowRight');
    expect(b.rec.keys).toEqual(['ArrowRight', 'x', 'PageDown']);
    b.key('e', { meta: true });
    expect(b.app.editor()).toBeNull(); // the attached editor is the document
    detach();
    attached.destroy();
    b.key('e', { meta: true });
    expect(b.app.editor()).not.toBeNull();
    b.app.dispose();
  });
});

// ── round 1 of the carrier-app loop (2.2.0) ──────────────────────────────

describe('round 1: keys, saves, the update lock, the frame, the chrome', () => {
  const byLabel = (root: ParentNode, label: string) => [...root.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === label || x.textContent === label) as HTMLButtonElement;

  it('[A.14] in edit mode, Cmd/Ctrl+S with the focus on the chrome (Done, More) or the page saves the open editor — never the browser\'s "Save page as" (default prevented) — and Cmd/Ctrl+E leaves edit mode; the edit-mode title follows the header title', async () => {
    const b = boot();
    await b.app.ready;
    const ed = b.app.edit();
    ed.setText(editHeader(`${TEXT}typed\r\n`, { title: 'Renamed' }));
    const done = byLabel(b.root, 'Done');
    expect(b.key('s', { meta: true }, done).defaultPrevented).toBe(true);
    await tick(10);
    expect(b.rec.saves.at(-1)!.text).toBe(editHeader(`${TEXT}typed\r\n`, { title: 'Renamed' }));
    expect(ed.isDirty()).toBe(false);
    ed.setText(`${ed.getText()}more\r\n`);
    expect(b.key('s', { meta: true }).defaultPrevented).toBe(true); // the page body
    await tick(10);
    expect(b.rec.saves).toHaveLength(2);
    await tick(250);
    expect((b.root.querySelector('.orz-app__title') as HTMLElement).textContent).toBe('Renamed');
    expect(b.doc.title).toBe('Renamed');
    expect(b.key('e', { meta: true }, done).defaultPrevented).toBe(true);
    await tick(10);
    expect(b.app.editor()).toBeNull();
    b.app.dispose();
  });

  it('[A.15] the page\'s save runs one at a time (a second call while one runs gets the same outcome); a save that finds the file changed on disk is not written: the outcome says conflict and the reader is asked — Replace it writes over it (overwrite), Download a copy instead downloads and leaves the document unsaved; the editor\'s save asks the same', async () => {
    const calls: boolean[] = [];
    let downloads = 0;
    const conflictSaver = (): Partial<AppServices> => ({
      createSaver: (): Saver => ({
        async save(_i, c) { calls.push(c?.overwrite === true); await tick(5); return c?.overwrite ? { via: 'file', ok: true, picked: true, opened: false, name: 'n.md.html' } : { via: 'file', ok: false, error: 'conflict', conflict: true, picked: true, opened: false, name: 'n.md.html' }; },
        async download() { downloads++; return { via: 'download', ok: true, confirmed: false, name: 'n.md.html' }; },
        handleKey: () => null,
      }),
    });
    const b = boot(undefined, { services: conflictSaver() });
    await b.app.ready;
    b.app.setSetting({ theme: 'beige-decent-2' });
    const [r1, r2] = await Promise.all([b.app.save(), b.app.save()]);
    expect(r1).toBe(r2);
    expect(r1).toEqual({ ok: false, via: 'file', error: 'conflict', conflict: true });
    expect(calls).toEqual([false]);
    expect(b.toasts().join(' ')).toContain('This file changed on disk since you opened it (another program or an agent edited it). Replace it with your version?');
    byLabel(b.root, 'Replace it').click();
    await tick(20);
    expect(calls).toEqual([false, true]);
    expect(b.app.isDirty()).toBe(false);
    b.app.setSetting({ theme: 'beige-decent-1' });
    await b.app.save();
    byLabel(b.root, 'Download a copy instead').click();
    await tick(20);
    expect([downloads, b.app.isDirty()]).toEqual([1, true]);
    // the editor's save asks the same
    const ed = b.app.edit();
    ed.setText(`${ed.getText()}edited\r\n`);
    expect(await ed.save()).toEqual({ ok: false, via: 'file', error: 'conflict', conflict: true });
    const edRoot = ed.root as unknown as ShadowRoot;
    expect([...edRoot.querySelectorAll('.orz-toast__message')].map((n) => n.textContent).join(' ')).toContain('changed on disk');
    byLabel(edRoot, 'Replace it').click();
    await tick(20);
    expect(ed.isDirty()).toBe(false);
    b.app.dispose();
  });

  it('[A.9] an editor opened or attached while the update runs is read-only too and given back when it settles; one read-only before the update stays read-only', async () => {
    let handlers: { onUpdate(i: UpdateInfo): unknown } | null = null;
    let release!: () => void;
    const b = boot(undefined, {
      services: {
        checkForUpdate: async () => INFO,
        mountUpdateIndicator: (a, _i, h) => { handlers = h; return { dispose() {} } as never; },
        performUpdate: async () => { await new Promise<void>((r) => { release = r; }); return { status: 'up-to-date', info: INFO } as never; },
      },
    });
    await tick(10);
    const pre = b.doc.createElement('div');
    b.doc.body.append(pre);
    const already = b.app.kind.mountEditor(pre as never, { text: b.app.getText() }, b.app.editorContext());
    already.setReadOnly(true);
    const offPre = b.app.attach(already);
    const running = handlers!.onUpdate(INFO) as Promise<void>;
    await tick();
    const ed = b.app.edit(); // opened during the update
    const el = b.doc.createElement('div');
    b.doc.body.append(el);
    const late = b.app.kind.mountEditor(el as never, { text: b.app.getText() }, b.app.editorContext());
    const off = b.app.attach(late); // attached during the update
    expect([ed.isReadOnly(), late.isReadOnly(), already.isReadOnly()]).toEqual([true, true, true]);
    release();
    await running;
    expect([ed.isReadOnly(), late.isReadOnly(), already.isReadOnly()]).toEqual([false, false, true]);
    off(); late.destroy(); offPre(); already.destroy();
    b.app.dispose();
  });

  it('[A.7] a framed file whose host never connected (an ordinary page framing it) asks before the page goes while it has unsaved changes; with a connected host it does not', async () => {
    const leave = (w: HWin) => { const e = new w.Event('beforeunload', { cancelable: true }); w.dispatchEvent(e as unknown as Event); return e.defaultPrevented; };
    const silent = { ...fakeHost(), connected: () => false };
    const f = boot(undefined, { framed: true, services: { connectHost: () => silent as never } });
    f.app.setSetting({ theme: 'beige-decent-2' });
    expect(leave(f.win)).toBe(true);
    f.app.dispose();
    const c = boot(undefined, { framed: true, services: { connectHost: () => fakeHost() } });
    c.app.setSetting({ theme: 'beige-decent-2' });
    expect(leave(c.win)).toBe(false);
    c.app.dispose();
  });

  it('[A.16] slides fitness: after a setting is chosen with the pointer the focus leaves the picker (the read view\'s keys work at once; with the keyboard it returns to the picker), after a pointer\'s Done the focus is the page\'s (the keyboard\'s Done returns to Edit), and navigation keys from a chrome button reach the view\'s onKey', async () => {
    const b = boot();
    await b.app.ready;
    const theme = byLabel(b.root, 'Theme');
    const choose = (detail: number) => {
      theme.click();
      const item = [...b.root.querySelectorAll('[role="menuitemradio"]')].find((x) => x.getAttribute('aria-checked') === 'false') as HTMLButtonElement;
      item.dispatchEvent(new b.win.MouseEvent('click', { bubbles: true, detail }) as unknown as Event);
    };
    theme.focus();
    choose(1); // a pointer
    expect(b.root.activeElement).not.toBe(theme);
    theme.focus();
    choose(0); // the keyboard (Enter on the item)
    expect(b.root.activeElement).toBe(theme);
    // navigation from the focused picker button reaches the view; its own keys do not
    theme.dispatchEvent(new b.win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true, cancelable: true }) as unknown as Event);
    theme.dispatchEvent(new b.win.KeyboardEvent('keydown', { key: ' ', bubbles: true, composed: true, cancelable: true }) as unknown as Event);
    expect(b.rec.keys).toEqual(['ArrowRight']);
    // Done by pointer: the focus is not put back on Edit; by keyboard it is
    b.app.edit();
    b.root.host.dispatchEvent(new b.win.PointerEvent('pointerdown', { bubbles: true, composed: true }) as unknown as Event);
    byLabel(b.root, 'Done').click();
    await tick(10);
    expect(b.root.activeElement).not.toBe(byLabel(b.root, 'Edit'));
    b.app.edit();
    b.key('Tab');
    byLabel(b.root, 'Done').click();
    await tick(10);
    expect(b.root.activeElement).toBe(byLabel(b.root, 'Edit'));
    b.app.dispose();
  });

  it('[A.17] labels without icons: at narrow widths only a button with an icon drops its visible label (orz-btn--has-icon); a kind\'s action may use the kit\'s present / print / pageSize icons or its own KindIcon (path data only, built as SVG elements), and a malformed one shows no icon and keeps the label', async () => {
    expect(APP_CSS).toContain('.orz-btn--has-icon .orz-btn__label { display: none; }');
    expect(APP_CSS).not.toMatch(/\{\s*\.orz-btn__label \{ display: none/);
    const b = boot(undefined, {
      kind: {
        actions: [
          { id: 'print', label: 'Print', placement: 'bar', icon: 'print', run: () => undefined },
          { id: 'plain', label: 'Plain', placement: 'bar', run: () => undefined },
          { id: 'own', label: 'Own', placement: 'bar', icon: { paths: ['M4 4h16v16H4z', 'M8 12h8'] }, run: () => undefined },
          { id: 'bad', label: 'Bad', placement: 'bar', icon: { paths: ['M4 4"/><script>alert(1)</script>'] }, run: () => undefined },
        ],
      },
    });
    const btn = (id: string) => b.root.querySelector(`[data-orz-action="${id}"]`) as HTMLElement;
    expect(btn('print').classList.contains('orz-btn--has-icon')).toBe(true);
    expect(btn('plain').classList.contains('orz-btn--has-icon')).toBe(false);
    expect(btn('plain').querySelector('.orz-btn__label')!.textContent).toBe('Plain');
    const own = btn('own').querySelector('svg')!;
    expect([...own.querySelectorAll('path')].map((p) => p.getAttribute('d'))).toEqual(['M4 4h16v16H4z', 'M8 12h8']);
    expect(own.getAttribute('stroke')).toBe('currentColor');
    expect(btn('bad').querySelector('svg')).toBeNull();
    expect(btn('bad').querySelector('script')).toBeNull();
    expect(btn('bad').classList.contains('orz-btn--has-icon')).toBe(false);
    b.app.dispose();
  });

  it('[A.18] accessibility: the chrome is first in the page\'s order after the islands (a keyboard reaches Edit before the document); at narrow widths the page gets top padding so the fixed bar does not cover it (not in edit mode, not with the chrome hidden), removed by dispose', async () => {
    let listener: (() => void) | null = null;
    const mq = { matches: true, addEventListener: (_t: string, l: () => void) => { listener = l; }, removeEventListener: () => { listener = null; } };
    const b = boot(undefined, { beforeBoot: (w) => { Object.defineProperty(w, 'matchMedia', { value: () => mq, configurable: true }); } });
    expect([...b.doc.body.children].find((e) => e.tagName !== 'SCRIPT')).toBe(b.doc.getElementById('orz-chrome'));
    expect(b.doc.body.style.getPropertyValue('padding-top')).toBe('56px');
    b.app.edit();
    expect(b.doc.body.style.getPropertyValue('padding-top')).toBe('');
    await b.app.leave();
    expect(b.doc.body.style.getPropertyValue('padding-top')).toBe('56px');
    mq.matches = false;
    listener!();
    expect(b.doc.body.style.getPropertyValue('padding-top')).toBe('');
    mq.matches = true;
    listener!();
    b.app.setChromeVisible(false);
    expect(b.doc.body.style.getPropertyValue('padding-top')).toBe('');
    b.app.setChromeVisible(true);
    b.app.dispose();
    expect([b.doc.body.style.getPropertyValue('padding-top'), listener]).toEqual(['', null]);
  });

  it('[A.8] a file include\'s path is never sent to the host (orz-host-include@1 resolves URLs only): the context\'s fetchInclude answers null for it without a request', async () => {
    const host = fakeHost({ include: true });
    const asked: string[] = [];
    const spy = { ...host, requestInclude: async (u: string) => { asked.push(u); return `HOST ${u}\n`; } };
    const b = boot(undefined, { framed: true, services: { connectHost: () => spy as never } });
    const ctx = b.app.editorContext();
    expect(await ctx.fetchInclude!('parts/x.md')).toBeNull();
    expect(await ctx.fetchInclude!('https://inc.test/c.md')).toBe('HOST https://inc.test/c.md\n');
    expect(asked).toEqual(['https://inc.test/c.md']);
    b.app.dispose();
  });
});

// ── A.11 widgets ─────────────────────────────────────────────────────────

describe('chrome widgets', () => {
  it('[A.11] menuButton is a keyboard-operable, non-modal menu (ArrowDown opens on the checked item, arrows/Home/End move, Esc closes with focus back, an outside pointer-down closes); settingPicker marks the current value and writes only a change; attachSettings puts the pickers in an editor\'s toolbar (one undoable setHeader each; a refusal is a toast); followPresentation rebuilds the preview when the presentation changes', async () => {
    const { win, doc } = filePage('<!doctype html><body></body>', 'https://app.test/');
    const host = doc.createElement('div');
    doc.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    installCss(root as never, WIDGET_CSS);
    installCss(root as never, WIDGET_CSS); // once
    const applied: Array<[string, string]> = [];
    let text = editHeader('# x\n', { theme: 'light-academic-2' });
    const picker = settingPicker(doc as unknown as AppDocument, THEME, () => text, (k, v) => { applied.push([k, v]); text = editHeader(text, { [k]: v }); });
    root.append(picker.element as unknown as Node);
    const btn = picker.button as unknown as HTMLButtonElement;
    expect([btn.getAttribute('aria-haspopup'), btn.getAttribute('aria-expanded')]).toEqual(['menu', 'false']);
    btn.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }) as unknown as Event);
    expect(picker.isOpen()).toBe(true);
    const items = () => [...root.querySelectorAll('[role="menuitemradio"]')] as HTMLButtonElement[];
    expect(items().filter((i) => i.getAttribute('aria-checked') === 'true').map((i) => i.textContent)).toEqual(['Academic 2']);
    expect(root.activeElement).toBe(items().find((i) => i.textContent === 'Academic 2'));
    const menu = root.querySelector('[role="menu"]')!;
    menu.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }) as unknown as Event);
    expect(root.activeElement).toBe(items()[0]);
    menu.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }) as unknown as Event);
    expect(root.activeElement).toBe(items().at(-1));
    menu.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }) as unknown as Event);
    expect(picker.isOpen()).toBe(false);
    expect(root.activeElement).toBe(btn);
    expect(root.querySelector('[aria-modal="true"], [inert]')).toBeNull();
    btn.click();
    items().find((i) => i.textContent === 'Academic 2')!.click(); // no change: nothing written
    btn.click();
    items().find((i) => i.textContent === 'Nocturne')!.click();
    expect(applied).toEqual([['theme', 'dark-elegant-3']]);
    btn.click();
    doc.body.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true, composed: true }) as unknown as Event);
    expect(picker.isOpen()).toBe(false);
    const m = menuButton(doc as unknown as AppDocument, { label: 'More', icon: 'more', iconOnly: true, items: () => [{ label: 'A', run() {} }, { label: 'B', disabled: true, run() {} }] });
    expect((m.button as unknown as HTMLButtonElement).title).toBe('More');
    m.destroy();
    // in an editor's toolbar
    const el = doc.createElement('div');
    doc.body.append(el);
    const shell = createEditorShell(el as never, { text: TEXT, render: () => '', adapter: textareaAdapter(), preview: { assets: false } });
    const s = attachSettings(shell, [THEME]);
    const sroot = shell.root as unknown as ShadowRoot;
    (s.pickers[0].button as unknown as HTMLButtonElement).click();
    ([...sroot.querySelectorAll('[role="menuitemradio"]')].find((i) => i.textContent === 'Beige') as HTMLButtonElement).click();
    expect(shell.getText() === editHeader(TEXT, { theme: 'beige-decent-1' })).toBe(true);
    shell.undo();
    expect(shell.getText() === TEXT).toBe(true);
    const bad = attachSettings(shell, [{ ...THEME, key: 'kind', label: 'Kind', choices: [{ value: 'x', label: 'X' }], current: () => 'y' }]);
    (bad.pickers[0].button as unknown as HTMLButtonElement).click();
    ([...sroot.querySelectorAll('[role="menuitemradio"]')].find((i) => i.textContent === 'X') as HTMLButtonElement).click();
    expect(shell.getText() === TEXT).toBe(true);
    expect([...sroot.querySelectorAll('.orz-toast__message')].map((x) => x.textContent).join(' ')).toContain('Could not change the header');
    // followPresentation
    const set = vi.spyOn(shell.preview, 'setOptions');
    const off = followPresentation(shell, (t) => ({ head: `<link href="${themeOf(t).id}">`, scheme: themeOf(t).scheme }), { delayMs: 5 });
    shell.setText(`${TEXT}x`);
    await tick(20);
    expect(set).not.toHaveBeenCalled(); // the presentation did not change
    shell.setHeader({ theme: 'dark-elegant-1' });
    await tick(20);
    expect(set).toHaveBeenCalledWith({ head: '<link href="dark-elegant-1">', scheme: 'dark' });
    off();
    shell.setHeader({ theme: 'light-neat-1' });
    await tick(20);
    expect(set).toHaveBeenCalledTimes(1);
    s.destroy();
    shell.destroy();
  });

  it('[A.11] reviewProposal shows a proposal in a non-modal review panel (role dialog, aria-modal false, the text editable, focus in it): Cancel and Esc resolve null, Apply the edited text; attachAiMenu shows one item per operation (none: no menu), runs proposeAi → review → applyAi as one undoable edit, and says why when a passage operation has no selection or the text changed while the reader reviewed', async () => {
    const { win, doc } = filePage('<!doctype html><body></body>', 'https://app.test/');
    const el = doc.createElement('div');
    doc.body.append(el);
    let ops: Array<{ id: string; title: string; selection?: boolean }> = [];
    const shell = createEditorShell(el as never, { text: TEXT, render: () => '', adapter: textareaAdapter(), preview: { assets: false }, hooks: { ai: { get operations() { return ops as never; }, request: async (op: string, c: { text: string; selection?: { from: number; to: number } }) => ({ proposed: op === 'whole' ? 'WHOLE\n' : c.text.slice(c.selection!.from, c.selection!.to).toUpperCase() }) } } });
    const root = shell.root as unknown as ShadowRoot;
    const menu = attachAiMenu(shell, { operations: () => ops });
    expect(root.querySelector('[data-orz-ai-menu]')).toBeNull();
    ops = [{ id: 'whole', title: 'Rewrite all' }, { id: 'shout', title: 'Shout', selection: true }];
    menu.refresh();
    const open = () => (root.querySelector('[data-orz-ai-menu] > button') as HTMLButtonElement).click();
    const choose = (t: string) => ([...root.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent === t) as HTMLButtonElement).click();
    open();
    expect([...root.querySelectorAll('[role="menuitem"]')].map((x) => x.textContent)).toEqual(['Rewrite all', 'Shout']);
    choose('Shout');
    await tick(10);
    expect([...root.querySelectorAll('.orz-toast__message')].map((x) => x.textContent).join(' ')).toContain('Shout: select a passage first.');
    open();
    choose('Rewrite all');
    await tick(10);
    let panel = root.querySelector('.orz-review') as HTMLElement;
    expect([panel.getAttribute('role'), panel.getAttribute('aria-modal')]).toEqual(['dialog', 'false']);
    const ta = panel.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.value).toBe('WHOLE\n');
    expect(root.activeElement).toBe(ta);
    expect(shell.getText() === TEXT).toBe(true);
    panel.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }) as unknown as Event);
    await tick(10);
    expect(root.querySelector('.orz-review')).toBeNull();
    expect(shell.getText() === TEXT).toBe(true);
    open();
    choose('Rewrite all');
    await tick(10);
    panel = root.querySelector('.orz-review') as HTMLElement;
    (panel.querySelector('textarea') as HTMLTextAreaElement).value = 'EDITED BY THE READER\n';
    ([...panel.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Replace document') as HTMLButtonElement).click();
    await tick(10);
    expect(shell.getText()).toBe('﻿EDITED BY THE READER\r\n');
    expect(shell.undo()).toBe(true);
    expect(shell.getText() === TEXT).toBe(true);
    // the text changed while the reader reviewed: refused, nothing changes
    open();
    choose('Rewrite all');
    await tick(10);
    shell.setText(`${TEXT}typed meanwhile\r\n`);
    ([...root.querySelectorAll('.orz-review button')].find((x) => x.getAttribute('aria-label') === 'Replace document') as HTMLButtonElement).click();
    await tick(10);
    expect(shell.getText()).toBe(`${TEXT}typed meanwhile\r\n`);
    expect([...root.querySelectorAll('.orz-toast__message')].map((x) => x.textContent).join(' ')).toContain('was not applied: the text changed since the AI proposal was made');
    // a direct review panel
    const p = await shell.proposeAi('whole');
    const r = reviewProposal(root as never, (p as { proposal: never }).proposal, { title: 'T' });
    ([...root.querySelectorAll('.orz-review button')].find((x) => x.getAttribute('aria-label') === 'Cancel') as HTMLButtonElement).click();
    expect(await r).toBeNull();
    menu.destroy();
    expect(root.querySelector('[data-orz-ai-menu]')).toBeNull();
    shell.destroy();
  });
});

// ── real Chrome: the stub carrier's files ────────────────────────────────

type Browser = import('playwright-core').Browser;
type BrowserContext = import('playwright-core').BrowserContext;
type Page = import('playwright-core').Page;

async function launch(): Promise<Browser | null> {
  try {
    const { chromium } = await import('playwright-core');
    return await chromium.launch({ channel: 'chrome', args: ['--allow-file-access-from-files'] });
  } catch {
    return null;
  }
}

const browser = await launch();
const chrome = browser ? describe : describe.skip;
const files = mkdtempSync(join(tmpdir(), 'orz-app-files-'));
let server: http.Server | null = null;
let origin = '';
let hostServer: http.Server | null = null;
let hostOrigin = '';
const extra = new Map<string, string>();
let stub: BuiltStub;
let next: BuiltStub;
afterAll(async () => {
  await browser?.close();
  server?.close();
  hostServer?.close();
  rmSync(files, { recursive: true, force: true });
  cleanStubs();
});

async function listen(handler: http.RequestListener): Promise<[http.Server, string]> {
  const s = http.createServer(handler);
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  return [s, `http://127.0.0.1:${(s.address() as AddressInfo).port}`];
}

const write = (name: string, html: string): string => { writeFileSync(join(files, name), html, 'utf8'); return `file://${join(files, name).split('/').map(encodeURIComponent).join('/')}`; };
const assembleStub = (text: string, o: { delivery?: 'inline' | 'cdn'; includes?: Record<string, string> } = {}) => Promise.resolve(stubTarget(stub).assemble(text, o));
const assembleNext = (text: string, o: { delivery?: 'inline' | 'cdn'; includes?: Record<string, string> } = {}) => Promise.resolve(stubTarget(next).assemble(text, o));

async function context(o: { latest?: BuiltStub; log?: string[] } = {}): Promise<BrowserContext> {
  const ctx = await browser!.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript({ content: initScript('opfs') });
  await ctx.route(/^https:\/\//, async (route) => {
    const url = route.request().url();
    o.log?.push(url);
    const ok = (body: string | Buffer, type: string) => route.fulfill({ status: 200, body, headers: { 'content-type': type, 'access-control-allow-origin': '*' } });
    if (url === CODEMIRROR_URL) return ok(readFileSync('vendor/codemirror6.js'), 'text/javascript');
    const m = /^https:\/\/cdn\.jsdelivr\.net\/npm\/orz-mdhtml-browser@([^/]+)\/(.+)$/.exec(url);
    if (m) {
      for (const r of [stub, ...(o.latest ? [o.latest] : [])]) if (m[1] === r.version && m[2] === 'orz-stub.browser.js') return ok(r.code, 'text/javascript');
      if (o.latest && m[1] === 'latest' && m[2] === 'release.json') return ok(readFileSync(o.latest.release, 'utf8'), 'application/json');
    }
    return route.abort('internetdisconnected');
  });
  return ctx;
}

const APP = '(globalThis.OrzCarrier.standalone)';
const bootDone = async (page: Page | import('playwright-core').Frame): Promise<void> => {
  await page.waitForFunction(() => !!(globalThis as { OrzCarrier?: { standalone?: unknown } }).OrzCarrier?.standalone);
  await page.evaluate(`${APP}.ready`);
};
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

chrome('the stub carrier\'s files on carrier/app (real Chrome)', () => {
  beforeAll(async () => {
    [stub, next] = await Promise.all([buildStub('1.1.0'), buildStub('1.2.0')]);
    [server, origin] = await listen((req, res) => {
      const name = decodeURIComponent((req.url ?? '/').slice(1).split('?')[0]);
      const html = extra.get(name) ?? (existsSync(join(files, name)) ? readFileSync(join(files, name), 'utf8') : null);
      if (html === null) { res.statusCode = 404; res.end(); return; }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(html);
    });
    [hostServer, hostOrigin] = await listen((req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(extra.get(`host:${req.url}`) ?? ''); });
  }, 120_000);

  it('[A.13] a file over file: reads in the page (the read view, its theme), and the theme setting through the seam writes the header (dirty, the page restyles, Cmd/Ctrl+Z undoes it); Edit → typing → Cmd/Ctrl+S writes exactly assemble(text) through the OPFS picker (never the live DOM), a second save reuses the handle, and the written file opens with the text', async () => {
    const ctx = await context();
    const text = '{{nyml\nkind: document\ntitle: Real\nuid: doc-realrealreal00001a\n}}\n\n# Real file\n\nBody text.\n';
    const html = await assembleStub(text);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(write('real.md.html', html));
    await bootDone(page);
    await writeOpfs(page, { name: 'real.md.html' }, html);
    expect(await page.locator('#orz-doc h1').textContent()).toBe('Real file');
    expect(await page.locator('#orz-theme').getAttribute('href')).toContain(`/themes/${THEMES[0].id}.css`);
    // the theme, through the seam
    await page.getByRole('button', { name: 'Theme', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Nocturne', exact: true }).click();
    expect(await page.evaluate(`${APP}.getText()`)).toBe(editHeader(text, { theme: 'dark-elegant-3' }));
    expect(await page.evaluate(`${APP}.isDirty()`)).toBe(true);
    expect(await page.locator('#orz-theme').getAttribute('href')).toContain('/themes/dark-elegant-3.css');
    expect(await page.locator('#orz-chrome').getAttribute('data-chrome')).toBe('dark');
    await page.locator('#orz-doc').click();
    await page.keyboard.press(`${MOD}+z`);
    expect(await page.evaluate(`${APP}.getText()`)).toBe(text);
    // Edit, type, save in place
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.evaluate(`${APP}.editor().ready`);
    await page.evaluate(`${APP}.editor().focus()`);
    await page.keyboard.press(`${MOD}+ArrowDown`);
    await page.keyboard.type('Typed in Chrome.');
    await page.evaluate(() => { const m = document.createElement('div'); m.textContent = 'LIVE-DOM-MARKER'; document.body.append(m); });
    const typed = await page.evaluate(`${APP}.getText()`) as string;
    expect(typed).toBe(`${text}Typed in Chrome.`);
    await page.keyboard.press(`${MOD}+s`);
    await page.waitForFunction(`!${APP}.isDirty()`);
    const written = (await readOpfs(page, { name: 'real.md.html' }))!;
    expect(written === await assembleStub(typed)).toBe(true);
    expect(written).not.toContain('LIVE-DOM-MARKER');
    expect(await pageRecords(page, 'picker')).toHaveLength(1);
    await page.keyboard.type(' Again.');
    await page.keyboard.press(`${MOD}+s`);
    await page.waitForFunction(`!${APP}.isDirty()`);
    expect(await readOpfs(page, { name: 'real.md.html' }) === await assembleStub(`${typed} Again.`)).toBe(true);
    expect(await pageRecords(page, 'picker')).toHaveLength(1);
    const reopened = await ctx.newPage();
    await reopened.goto(write('real-reopened.md.html', (await readOpfs(page, { name: 'real.md.html' }))!));
    await bootDone(reopened);
    expect(await reopened.evaluate(`${APP}.getText()`)).toBe(`${typed} Again.`);
    expect(await reopened.locator('#orz-doc').textContent()).toContain('Typed in Chrome. Again.');
    expect(errors).toEqual([]);
    await ctx.close();
  }, 120_000);

  it('[A.15] [S.14] in Chrome: an agent rewrites the opened file on disk between two saves — the next save does not write silently: the reader is asked, Replace it writes the page\'s text into that file (no second picker), Download a copy instead downloads it and leaves the agent\'s file as it is; Cmd/Ctrl+S in edit mode with the focus on Done saves the editor (no "Save page as")', async () => {
    const ctx = await context();
    const text = '{{nyml\nkind: document\ntitle: Conflict\nuid: doc-conflictconf0003c\n}}\n\n# Conflict\n\nBody.\n';
    const html = await assembleStub(text);
    const page = await ctx.newPage();
    await page.goto(write('conflict.md.html', html));
    await bootDone(page);
    await writeOpfs(page, { name: 'conflict.md.html' }, html);
    await page.evaluate(`${APP}.setSetting({ theme: 'dark-elegant-3' })`);
    expect(await page.evaluate(`${APP}.save()`)).toMatchObject({ ok: true, via: 'file' });
    const agentText = `${text}AGENT EDIT\n`;
    await writeOpfs(page, { name: 'conflict.md.html' }, await assembleStub(agentText));
    await page.evaluate(`${APP}.setSetting({ theme: 'beige-decent-1' })`);
    const mine = await page.evaluate(`${APP}.getText()`) as string;
    expect(await page.evaluate(`${APP}.save()`)).toEqual({ ok: false, via: 'file', error: 'conflict', conflict: true });
    expect(await readOpfs(page, { name: 'conflict.md.html' }) === await assembleStub(agentText)).toBe(true);
    await page.getByText('This file changed on disk since you opened it').waitFor({ state: 'visible' });
    const picks = (await pageRecords(page, 'picker')).length;
    await page.getByRole('button', { name: 'Replace it' }).click();
    await page.waitForFunction(`!${APP}.isDirty()`);
    expect(await readOpfs(page, { name: 'conflict.md.html' }) === await assembleStub(mine)).toBe(true);
    expect(await pageRecords(page, 'picker')).toHaveLength(picks);
    // again, and this time a copy
    await writeOpfs(page, { name: 'conflict.md.html' }, await assembleStub(agentText));
    await page.evaluate(`${APP}.setSetting({ theme: 'dark-elegant-3' })`);
    expect(await page.evaluate(`${APP}.save()`)).toMatchObject({ conflict: true });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download a copy instead' }).click();
    const d = await download;
    expect(readFileSync((await d.path())!, 'utf8') === await assembleStub(await page.evaluate(`${APP}.getText()`) as string)).toBe(true);
    expect(await readOpfs(page, { name: 'conflict.md.html' }) === await assembleStub(agentText)).toBe(true);
    expect(await page.evaluate(`${APP}.isDirty()`)).toBe(true);
    // edit mode: Cmd/Ctrl+S with the focus on Done saves the editor, never the browser's "Save page as"
    await writeOpfs(page, { name: 'conflict.md.html' }, await assembleStub(await page.evaluate(`${APP}.getText()`) as string));
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.evaluate(`${APP}.editor().ready`);
    await page.getByRole('button', { name: 'Done', exact: true }).focus();
    await page.evaluate(() => { addEventListener('keydown', (e) => { if (e.key === 's') setTimeout(() => { (window as unknown as { __prevented?: boolean }).__prevented = e.defaultPrevented; }); }); });
    const before = await page.evaluate(`${APP}.editor().isDirty()`);
    expect(before).toBe(true);
    await page.keyboard.press(`${MOD}+s`);
    await page.waitForFunction(`!${APP}.editor().isDirty()`);
    expect(await page.evaluate(() => (window as unknown as { __prevented?: boolean }).__prevented)).toBe(true);
    await ctx.close();
  }, 120_000);

  it('[A.13] New document and Save as new copy (the More menu) write new files through the picker — a new uid, lint-clean, the file\'s delivery, the copy with the text — that open; the opened file is untouched; over http: the Save is the served notice and Download a copy downloads assemble(text)', async () => {
    const ctx = await context();
    const text = '{{nyml\nkind: document\ntitle: Origin\nuid: doc-originorigin0002b\n}}\n\n# Origin\n\nText.\n';
    for (const delivery of ['inline', 'cdn'] as const) {
      const html = await assembleStub(text, { delivery });
      const page = await ctx.newPage();
      await page.goto(write(`origin-${delivery}.md.html`, html));
      await bootDone(page);
      await writeOpfs(page, { name: `origin-${delivery}.md.html` }, html);
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await page.getByRole('menuitem', { name: 'New document' }).click();
      await page.waitForFunction(() => (window as unknown as { __orzConformanceLog: Array<{ type: string }> }).__orzConformanceLog.filter((r) => r.type === 'picker').length === 1);
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Save as new copy' }).click();
      await page.waitForFunction(() => (window as unknown as { __orzConformanceLog: Array<{ type: string }> }).__orzConformanceLog.filter((r) => r.type === 'picker').length === 2);
      expect((await pageRecords(page, 'picker')).map((r) => (r.data as { suggestedName: string }).suggestedName)).toEqual(['Untitled.md.html', `origin-${delivery} copy.md.html`]);
      for (const name of ['Untitled.md.html', `origin-${delivery} copy.md.html`]) {
        let made: string | null = null;
        for (let i = 0; i < 50 && !made; i++) { made = await readOpfs(page, { name }); if (!made) await page.waitForTimeout(100); }
        const x = extract(made!)!;
        expect(x.delivery, name).toBe(delivery);
        expect(readDocument(x.text, { kind: 'md' }).meta.uid, name).toMatch(UID_PATTERN);
        expect(readDocument(x.text, { kind: 'md' }).meta.uid, name).not.toBe('doc-originorigin0002b');
        expect(lintHeader(x.text, 'md').filter((l) => l.level === 'error'), name).toEqual([]);
        expect(made === await assembleStub(x.text, { delivery }), name).toBe(true);
        if (name.includes('copy')) expect(x.text).toBe(editHeader(text, { uid: readDocument(x.text, { kind: 'md' }).meta.uid! }));
        const opened = await ctx.newPage();
        await opened.goto(write(`${delivery}-${name}`, made!));
        await bootDone(opened);
        expect(await opened.evaluate(`${APP}.getText()`)).toBe(x.text);
        await opened.close();
      }
      expect(await readOpfs(page, { name: `origin-${delivery}.md.html` }) === html).toBe(true);
      await page.close();
    }
    // over http: the served notice, then Download a copy
    const html = await assembleStub(text);
    extra.set('served.md.html', html);
    const page = await ctx.newPage();
    await page.goto(`${origin}/served.md.html`);
    await bootDone(page);
    await page.evaluate(`${APP}.setSetting({ theme: 'beige-decent-1' })`);
    expect(await page.evaluate(`${APP}.save()`)).toMatchObject({ ok: false, via: 'served-notice' });
    expect(await pageRecords(page, 'picker')).toEqual([]);
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Download a copy' }).click();
    const d = await dl;
    expect(d.suggestedFilename()).toBe('served.md.html');
    expect(readFileSync((await d.path())!, 'utf8') === await assembleStub(editHeader(text, { theme: 'beige-decent-1' }))).toBe(true);
    await ctx.close();
  }, 180_000);

  it('[A.13] [A.8] in a host frame (another origin, all three hellos): no picker and no update check; a read-view save and the editor\'s save go to the host with the exact text and assemble(text, { includes }); the host\'s include resolution wins in the read view; its AI operation is an AI menu in the editor whose proposal the reader reviews and applies', async () => {
    const ctx = await context();
    const log: string[] = [];
    ctx.on('request', (r) => log.push(r.url()));
    const text = '{{nyml\nkind: document\ntitle: Hosted\nuid: doc-hostedhosted003c\n}}\n\n# Hosted\n\n{{md parts/local.md}}\n\n{{md https://inc.test/remote.md}}\n';
    const includes = { 'parts/local.md': 'LOCAL PART\n', 'https://inc.test/remote.md': 'RECORDED REMOTE\n' };
    extra.set('hosted.md.html', await assembleStub(text, { includes }));
    extra.set('host:/host.html', `<!doctype html><html><body><iframe id="f" src="${origin}/hosted.md.html" style="width:1200px;height:700px"></iframe><script>
      window.got = [];
      const f = document.getElementById('f');
      const post = (m) => f.contentWindow.postMessage(m, '*');
      const hello = () => { post({ type: 'orz-host-hello', protocol: 'orz-host-save', version: 1 }); post({ type: 'orz-host-ai-hello', protocol: 'orz-host-ai', version: 1, operations: [{ id: 'sign', title: 'Sign it', selection: false }] }); post({ type: 'orz-host-include-hello', protocol: 'orz-host-include', version: 1 }); };
      const t = setInterval(hello, 300);
      addEventListener('message', (e) => {
        if (e.source !== f.contentWindow) return;
        const d = e.data; window.got.push(d);
        if (d.type === 'orz-host-ready') clearInterval(t);
        if (d.type === 'orz-host-save') post({ type: 'orz-host-saved', ok: true });
        if (d.type === 'orz-host-ai-request') post({ type: 'orz-host-ai-result', protocol: 'orz-host-ai', version: 1, requestId: d.requestId, ok: true, proposed: d.text + 'Signed by the host.\\n' });
        if (d.type === 'orz-host-include-request') post({ type: 'orz-host-include-result', protocol: 'orz-host-include', version: 1, requestId: d.requestId, ok: true, markdown: 'HOST-RESOLVED REMOTE\\n' });
      });
    </script></body></html>`);
    const page = await ctx.newPage();
    await page.goto(`${hostOrigin}/host.html`);
    await page.waitForFunction(() => (window as unknown as { got: Array<{ type: string }> }).got.some((m) => m.type === 'orz-host-ready'));
    const frame = page.frames().find((f) => f.url().endsWith('/hosted.md.html'))!;
    await bootDone(frame);
    await frame.waitForFunction(() => (document.getElementById('orz-doc')?.textContent ?? '').includes('HOST-RESOLVED REMOTE'));
    expect(await frame.locator('#orz-doc').textContent()).toContain('LOCAL PART');
    await frame.evaluate(`${APP}.setSetting({ theme: 'beige-decent-1' })`);
    const t1 = await frame.evaluate(`${APP}.getText()`) as string;
    expect(await frame.evaluate(`${APP}.save()`)).toMatchObject({ ok: true, via: 'host' });
    await frame.evaluate(`${APP}.edit().ready`);
    await frame.getByRole('button', { name: 'AI', exact: true }).click();
    await frame.getByRole('menuitem', { name: 'Sign it' }).click();
    await frame.getByRole('button', { name: 'Replace document' }).click();
    await frame.waitForFunction(`${APP}.editor().getText().endsWith('Signed by the host.\\n')`);
    const t2 = await frame.evaluate(`${APP}.editor().getText()`) as string;
    expect(t2).toBe(`${t1}Signed by the host.\n`);
    expect(await frame.evaluate(`${APP}.editor().save()`)).toMatchObject({ ok: true, via: 'host' });
    const got = await page.evaluate(() => (window as unknown as { got: Array<{ type: string; source?: string; html?: string; dirty?: boolean }> }).got);
    const saves = got.filter((m) => m.type === 'orz-host-save');
    expect(saves.map((s) => s.source)).toEqual([t1, t2]);
    for (const s of saves) expect(s.html === await assembleStub(s.source!, { includes })).toBe(true);
    expect(got.some((m) => m.type === 'orz-host-dirty' && m.dirty === true)).toBe(true);
    expect(await pageRecords(frame as never, 'picker')).toEqual([]);
    expect(log.filter((u) => u.endsWith('/release.json'))).toEqual([]);
    await ctx.close();
  }, 120_000);

  it('[A.13] [A.7] [A.9] the quiet update: a newer release shows the indicator; Update now writes the new release\'s assembly of the exact (unsaved) text into the opened file and reloads, asking nothing; a file with unsaved changes asks before the page goes (beforeunload), a clean or saved one does not', async () => {
    const log: string[] = [];
    const ctx = await context({ latest: next, log });
    const text = '{{nyml\r\nkind: document\r\ntitle: Update me\r\nuid: doc-updateupdate004d\r\n}}\r\n\r\n# Update me\r\n';
    const html = await assembleStub(text);
    const page = await ctx.newPage();
    const dialogs: string[] = [];
    page.on('dialog', (d) => { dialogs.push(d.type()); void d.dismiss().catch(() => undefined); });
    await page.goto(write('update-me.md.html', html));
    await bootDone(page);
    await writeOpfs(page, { name: 'update-me.md.html' }, html);
    await page.mouse.click(600, 400); // sticky activation: Chrome asks only after an interaction
    await page.evaluate(`${APP}.setSetting({ theme: 'dark-elegant-1' })`);
    const current = await page.evaluate(`${APP}.getText()`) as string;
    // unsaved: the browser's own prompt; dismissed, the page stays
    await page.close({ runBeforeUnload: true });
    await page.waitForTimeout(500);
    expect(page.isClosed()).toBe(false);
    expect(dialogs).toEqual(['beforeunload']);
    const indicator = page.getByRole('button', { name: 'Update available: 1.2.0' });
    await indicator.waitFor();
    await indicator.click();
    const reloaded = page.waitForEvent('load');
    await page.getByRole('button', { name: 'Update now' }).click();
    await reloaded;
    expect(dialogs).toEqual(['beforeunload']); // the update's reload asked nothing
    const written = (await readOpfs(page, { name: 'update-me.md.html' }))!;
    expect(extract(written)!.text === current).toBe(true);
    expect(extract(written)).toMatchObject({ shell: '1.2.0', delivery: 'inline', kind: 'md' });
    expect(written === await assembleNext(current)).toBe(true);
    expect(log.filter((u) => u.endsWith('/release.json'))).toHaveLength(1);
    // a clean page: nothing asked
    const clean = await ctx.newPage();
    const cleanDialogs: string[] = [];
    clean.on('dialog', (d) => { cleanDialogs.push(d.type()); void d.dismiss().catch(() => undefined); });
    await clean.goto(write('clean.md.html', html));
    await bootDone(clean);
    await clean.mouse.click(600, 400);
    await clean.close({ runBeforeUnload: true });
    await new Promise((r) => setTimeout(r, 500));
    expect(clean.isClosed()).toBe(true);
    expect(cleanDialogs).toEqual([]);
    await ctx.close();
  }, 120_000);
});
