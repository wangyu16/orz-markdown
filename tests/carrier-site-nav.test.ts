/**
 * Site navigation (orz-markdown 2.10.0; owner 2026-11-21; FC-18 §8.2
 * `siteNav`, spec/carrier-app.md §4.5b): claims K.38 (the setting and the
 * envelope) and A.36 (the app: the bar, the carry-over, a copy written from a
 * served page). The real-Chrome half is the conformance harness's `C.nav.*`
 * (H.11, tests/conformance.test.ts; every carrier runs them on its bundle).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assembleEnvelope, editHeader, extract, readSiteNav, sameSiteNav, siteNav, siteNavFrom, SITE_NAV_HREF_MAX, SITE_NAV_TEXT_MAX,
  type Kind, type ShellParts, type SiteNav,
} from '../src/carrier';
import * as read from '../src/carrier/read';
import { createEditorShell, renderMarkdownPreview, textareaAdapter } from '../src/carrier/editor';
import { bootCarrierApp, readOpenedFile, SITE_NAV_HEIGHT_PROPERTY, type AppDocument, type AppServices, type AppWindow, type CarrierReadView, type StandaloneKind } from '../src/carrier/app';
import type { PerformUpdateOptions, Saver, SaverOptions, UpdateInfo } from '../src/carrier/shell';
import { sandboxDocument } from '../src/carrier/shell';

const ROOT = 'tests/carrier-corpus';
const manifest = JSON.parse(readFileSync(`${ROOT}/manifest.json`, 'utf8')) as { files: Array<{ path: string; kind: Kind }> };
const corpus = manifest.files.map((f) => ({ ...f, text: readFileSync(`${ROOT}/${f.path}`).toString('utf8') }));
const parts = (kind: Kind, over: Partial<ShellParts> = {}): ShellParts => ({ kind, shellVersion: '1.2.3', headHtml: '<style>x</style>', bodyHtml: '<div id="orz-app"></div>', ...over });
const shellOf = (html: string): string => /<script type="application\/json" id="orz-shell">([^<]*)<\/script>/.exec(html)![1];

const NAV: SiteNav = {
  title: 'Gases & <Solutions>',
  home: '../index.html',
  previous: { href: 'intro.md.html', label: '1 · Introduction' },
  next: { href: '../unit2/gases.slides.html#s2', label: '2 · Gases </script>' },
};

describe('siteNav (FC-18 §8.2)', () => {
  it('[K.38] siteNav validates and normalizes: undefined, null and false are none; { title, home, previous?, next? } with plain-text title and labels (spaces collapsed, trimmed, 1–200 UTF-16 units, something visible, no control or format character) and hrefs that are relative or absolute http(s) (no whitespace, backslash or control character, not //…) — keys in a fixed order; anything else throws a TypeError with the reason and readSiteNav reads null; the parser-free entry has the rule', () => {
    for (const none of [undefined, null, false]) expect(siteNav(none)).toBeNull();
    expect(siteNav({ next: { label: '  2 ·\n Gases ', href: 'g.html' }, home: 'index.html', title: ' Course\ttitle ' })).toEqual({ title: 'Course title', home: 'index.html', next: { href: 'g.html', label: '2 · Gases' } });
    expect(JSON.stringify(siteNav({ next: { label: 'n', href: 'n.html' }, previous: { label: 'p', href: 'p.html' }, home: 'i.html', title: 't' }))).toBe('{"title":"t","home":"i.html","previous":{"href":"p.html","label":"p"},"next":{"href":"n.html","label":"n"}}');
    for (const href of ['a.html', '../x/y.slides.html?v=1#s3', '#top', '?q=1', '/abs/path.html', 'https://site.test/c/', 'HTTP://Site.test/x', 'a%20b.html', 'unit%201/a.md.html']) {
      expect(siteNav({ title: 't', home: href }), href).toEqual({ title: 't', home: href });
    }
    expect(siteNav({ title: 'x'.repeat(SITE_NAV_TEXT_MAX), home: 'h'.repeat(SITE_NAV_HREF_MAX) })!.title.length).toBe(200);
    const bad: unknown[] = [
      {}, { title: 't' }, { home: 'i.html' }, { title: '', home: 'i' }, { title: '  ', home: 'i' }, { title: 7, home: 'i' }, { title: 'x'.repeat(201), home: 'i' },
      { title: 'a‮b', home: 'i' }, { title: 'a\u0000b', home: 'i' }, { title: ' ', home: 'i' },
      { title: 't', home: '' }, { title: 't', home: 'javascript:alert(1)' }, { title: 't', home: 'JavaScript:x' }, { title: 't', home: 'data:text/html,x' }, { title: 't', home: 'file:///etc/passwd' },
      { title: 't', home: '//evil.test/' }, { title: 't', home: '\\\\evil.test\\x' }, { title: 't', home: 'a b.html' }, { title: 't', home: 'a\nb' }, { title: 't', home: 'https://' }, { title: 't', home: 'https:x' }, { title: 't', home: 'mailto:a@b' },
      { title: 't', home: 'h'.repeat(SITE_NAV_HREF_MAX + 1) },
      { title: 't', home: 'i', previous: 'p.html' }, { title: 't', home: 'i', previous: { href: 'p.html' } }, { title: 't', home: 'i', next: { href: 'n', label: 'n', rel: 'x' } },
      { title: 't', home: 'i', other: 1 }, ['x'], 'nav', 1, true,
    ];
    for (const b of bad) {
      expect(() => siteNav(b), JSON.stringify(b)).toThrow(TypeError);
      expect(readSiteNav(b), JSON.stringify(b)).toBeNull();
    }
    expect(() => siteNav({ title: 't', home: 'javascript:x' })).toThrow(/relative URL or an absolute http\(s\) URL/);
    expect(() => siteNav({ title: 't', home: 'i', extra: 1 })).toThrow(/unknown key "extra"/);
    expect(sameSiteNav(undefined, null)).toBe(true);
    expect(sameSiteNav(NAV, { ...NAV })).toBe(true);
    expect(sameSiteNav(NAV, { ...NAV, home: 'x' })).toBe(false);
    for (const name of ['readSiteNav', 'sameSiteNav', 'SITE_NAV_TEXT_MAX', 'SITE_NAV_HREF_MAX']) expect(name in read, name).toBe(true);
    for (const name of ['siteNav', 'siteNavFrom']) expect(name in read, name).toBe(false);
  });

  it('[K.38] assembleEnvelope(text, { siteNav }) stores it normalized in #orz-shell "siteNav" (after delivery, links and readerCopy; escaped for the script element) and extract gives it back; absent, null or false write exactly the bytes of a file without it for every corpus text; assemble → extract → assemble is the identity with it; an invalid one throws; extract ignores an invalid stored value', () => {
    for (const f of corpus) {
      const plain = assembleEnvelope(f.text, parts(f.kind));
      for (const none of [undefined, null, false] as const) expect(assembleEnvelope(f.text, parts(f.kind, { siteNav: none })) === plain, f.path).toBe(true);
      const html = assembleEnvelope(f.text, parts(f.kind, { siteNav: NAV }));
      const x = extract(html)!;
      expect(x.text === f.text, f.path).toBe(true);
      expect(x.siteNav).toEqual(NAV);
      expect(assembleEnvelope(x.text, parts(f.kind, { siteNav: x.siteNav })) === html, f.path).toBe(true);
    }
    const t = corpus[0];
    const html = assembleEnvelope(t.text, parts(t.kind, { twinLinks: { md: '{stem}.html' }, readerCopy: true, siteNav: NAV }));
    const shell = shellOf(html);
    expect(shell).toMatch(/"delivery":"inline","links":\{"md":"\{stem\}\.html"\},"readerCopy":\{\},"siteNav":\{"title":"Gases & \\u003cSolutions>"/);
    expect(shell).not.toMatch(/<\/script/i);
    expect(extract(html)!.siteNav).toEqual(NAV);
    expect(() => assembleEnvelope(t.text, parts(t.kind, { siteNav: { title: 't', home: 'javascript:x' } as SiteNav }))).toThrow(TypeError);
    const forged = html.replace('"home":"../index.html"', '"home":"javascript:alert(1)"');
    expect(extract(forged)!.siteNav).toBeUndefined();
  });

  it('[K.38] siteNavFrom resolves relative hrefs against an http(s) page address (absolute ones stay), and leaves the setting as it is for a file: or invalid base', () => {
    const base = 'https://me.github.io/course/unit1/notes.md.html?x=1#y';
    expect(siteNavFrom(NAV, base)).toEqual({
      title: NAV.title,
      home: 'https://me.github.io/course/index.html',
      previous: { href: 'https://me.github.io/course/unit1/intro.md.html', label: '1 · Introduction' },
      next: { href: 'https://me.github.io/course/unit2/gases.slides.html#s2', label: '2 · Gases </script>' },
    });
    expect(siteNavFrom({ title: 't', home: 'https://other.test/' }, base)).toEqual({ title: 't', home: 'https://other.test/' });
    expect(siteNavFrom(NAV, 'file:///Users/me/site/unit1/notes.md.html')).toBe(NAV);
    expect(siteNavFrom(NAV, 'not a url')).toBe(NAV);
    expect(siteNav(siteNavFrom(NAV, base))).toEqual(siteNavFrom(NAV, base));
  });

  it('[K.38] the quiet update\'s sandbox passes siteNav to the new release\'s assemble (the bootstrap carries d.siteNav)', () => {
    expect(sandboxDocument('/* bundle */')).toContain('if (d.siteNav) o.siteNav = d.siteNav;');
  });
});

// ── A.36 the app ────────────────────────────────────────────────────────

const UID = 'doc-sitenavsitenav00aa';
const TEXT = `{{nyml\nkind: document\ntitle: Notes\nuid: ${UID}\n}}\n\n# Notes\n\nBody.\n`;
const ENGINE = 'globalThis.__engine = 1;';
const BODY = `<main id="orz-app"><article id="orz-doc"></article></main>\n<div id="orz-chrome"></div>\n<script id="orz-engine">${ENGINE}</script>`;
const fileParts = (o: { siteNav?: SiteNav | null; delivery?: 'inline' | 'cdn' } = {}): ShellParts => ({ kind: 'md', shellVersion: '1.0.0', delivery: o.delivery ?? 'inline', headHtml: '', bodyHtml: BODY, ...(o.siteNav ? { siteNav: o.siteNav } : {}) });

let HappyWindow: typeof import('happy-dom').Window;
beforeAll(async () => { ({ Window: HappyWindow } = await import('happy-dom')); });

interface Rec { saves: Array<{ html: string; name: string }>; downloads: Array<{ html: string }>; assembled: Array<Record<string, unknown>>; updates: Array<PerformUpdateOptions> }

const INFO: UpdateInfo = { kind: 'md', current: '1.0.0', latest: '1.1.0', notes: null, manifest: { kind: 'md', version: '1.1.0', formats: [1], notes: null, bundle: { path: 'x.js', integrity: `sha384-${'A'.repeat(64)}` } } as never };

function boot(html: string, o: { url?: string; framed?: boolean; dropNav?: boolean; update?: (h: { onUpdate(i: UpdateInfo): unknown }) => void } = {}) {
  const win = new HappyWindow({ url: o.url ?? 'file:///Users/me/site/unit1/notes.md.html', settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } as never });
  const doc = win.document as unknown as Document;
  doc.write(html);
  if (o.framed) Object.defineProperty(win, 'parent', { value: { postMessage() { /* a host */ } }, configurable: true });
  const rec: Rec = { saves: [], downloads: [], assembled: [], updates: [] };
  const kind: StandaloneKind = {
    kind: 'md', version: '1.0.0', formats: [1],
    assemble: (t, a = {}) => { rec.assembled.push({ ...a }); return assembleEnvelope(t, fileParts({ delivery: a.delivery, ...(a.siteNav && !o.dropNav ? { siteNav: a.siteNav } : {}) })); },
    newDocument: () => editHeader('# New\n', { carrier: 'md' }),
    mountEditor: (element, options, ctx) => createEditorShell(element as never, { text: options.text, render: (t) => renderMarkdownPreview(t), adapter: textareaAdapter(), preview: { assets: false }, ...(ctx ? { assemble: ctx.assemble, saver: ctx.saver, standalone: ctx.standalone } : {}) }),
    createReadView: (d: AppDocument): CarrierReadView => ({ element: d.getElementById('orz-app')!, render: (t) => { d.getElementById('orz-doc')!.textContent = t; }, present: (t) => ({ scheme: /dark/.test(t) ? 'dark' : 'light' }) }),
    readDocument: () => ({ title: 'Notes' }) as never,
  };
  const services: Partial<AppServices> = {
    createSaver: (so: SaverOptions): Saver => ({
      async save({ html: h }) { rec.saves.push({ html: h, name: so.suggestedName }); return { via: 'file', ok: true, picked: true, opened: true, name: so.suggestedName }; },
      async download({ html: h }) { rec.downloads.push({ html: h }); return { via: 'download', ok: true, confirmed: false }; },
      handleKey: () => null,
    }),
    checkForUpdate: async () => (o.update ? INFO : null),
    ...(o.update ? { mountUpdateIndicator: (a: unknown, _i: unknown, h: { onUpdate(i: UpdateInfo): unknown }) => { o.update!(h); return { host: a, root: a, open() {}, close() {}, isOpen: () => false, dispose() {} } as never; } } : {}),
    connectHost: () => ({ connected: () => false, protocols: () => ({ save: false, ai: false, include: false }), aiOperations: () => [], dispose() {} }) as never,
    performUpdate: async (u) => { rec.updates.push(u); return { status: 'up-to-date' }; },
  };
  const app = bootCarrierApp(kind, { window: win as unknown as AppWindow, adapter: textareaAdapter(), services })!;
  const nav = () => doc.querySelector('nav.orz-site-nav') as HTMLElement | null;
  const links = () => [...(nav()!.shadowRoot!.querySelectorAll('a'))].map((a) => ({ href: a.getAttribute('href'), rel: a.getAttribute('rel'), name: a.getAttribute('aria-label') ?? a.textContent, text: a.textContent }));
  return { app, rec, win, doc, nav, links };
}

describe('the site-navigation bar (carrier-app §4.5b)', () => {
  it('[A.36] a file with siteNav: readOpenedFile reads it; the bar is a <nav> landmark named by the title, first in the body (before the chrome and the read view), its texts set as text: the title links home, the neighbours link with rel prev/next and the names "Previous: …" / "Next: …"; --orz-site-nav-height is set while it shows; edit mode hides it, leaving shows it, the chrome hidden (Present) hides it; it follows the page\'s scheme; a page without the setting has no bar and no property; dispose removes it', async () => {
    const html = assembleEnvelope(TEXT, fileParts({ siteNav: NAV }));
    const probe = new HappyWindow({ url: 'file:///x.md.html' });
    (probe.document as unknown as Document).write(html);
    expect(readOpenedFile(probe.document as unknown as AppDocument, 'md')!.siteNav).toEqual(NAV);
    const b = boot(html);
    await b.app.ready;
    const nav = b.nav()!;
    expect(nav).not.toBeNull();
    expect(nav.tagName).toBe('NAV');
    expect(nav.getAttribute('aria-label')).toBe(NAV.title);
    const firstEl = [...b.doc.body.children].find((e) => e.tagName !== 'SCRIPT');
    expect(firstEl).toBe(nav);
    expect(nav.compareDocumentPosition(b.doc.getElementById('orz-chrome')!) & 4).toBeTruthy();
    expect(nav.compareDocumentPosition(b.doc.getElementById('orz-app')!) & 4).toBeTruthy();
    expect(b.links()).toEqual([
      { href: '../index.html', rel: null, name: NAV.title, text: NAV.title },
      { href: 'intro.md.html', rel: 'prev', name: 'Previous: 1 · Introduction', text: '←1 · IntroductionPrevious' },
      { href: '../unit2/gases.slides.html#s2', rel: 'next', name: 'Next: 2 · Gases </script>', text: '2 · Gases </script>Next→' },
    ]);
    expect(nav.shadowRoot!.querySelector('script')).toBeNull();
    expect(b.doc.documentElement.style.getPropertyValue(SITE_NAV_HEIGHT_PROPERTY)).toBe('40px');
    expect(nav.getAttribute('data-scheme')).toBe('light');
    b.app.edit();
    expect(nav.hidden).toBe(true);
    expect(b.doc.documentElement.style.getPropertyValue(SITE_NAV_HEIGHT_PROPERTY)).toBe('');
    await b.app.leave();
    expect(nav.hidden).toBe(false);
    expect(b.doc.documentElement.style.getPropertyValue(SITE_NAV_HEIGHT_PROPERTY)).toBe('40px');
    b.app.setChromeVisible(false);
    expect(nav.hidden).toBe(true);
    b.app.setChromeVisible(true);
    expect(nav.hidden).toBe(false);
    b.app.dispose();
    expect(b.nav()).toBeNull();
    expect(b.doc.documentElement.style.getPropertyValue(SITE_NAV_HEIGHT_PROPERTY)).toBe('');
    // only the neighbours a page has
    const first = boot(assembleEnvelope(TEXT, fileParts({ siteNav: { title: 'T', home: 'index.html', next: NAV.next } })));
    expect(first.links().map((l) => l.rel)).toEqual([null, 'next']);
    first.app.dispose();
    // no setting: no bar, no property
    const plain = boot(assembleEnvelope(TEXT, fileParts()));
    await plain.app.ready;
    expect(plain.nav()).toBeNull();
    expect(plain.doc.documentElement.style.getPropertyValue(SITE_NAV_HEIGHT_PROPERTY)).toBe('');
    plain.app.dispose();
  });

  it('[A.36] the file keeps its site navigation: on a file: page every save, Download a copy and Save as new copy write it as stored, New document none, the opened bytes are the file\'s own bytes, the quiet update carries it; a kind whose assemble drops it is refused (nothing written)', async () => {
    const html = assembleEnvelope(TEXT, fileParts({ siteNav: NAV }));
    const b = boot(html);
    await b.app.ready;
    const opened = await (b.app as unknown as { editorContext(): { openedHtml(): Promise<string> } }).editorContext().openedHtml();
    expect(opened === html).toBe(true);
    const ed = b.app.edit();
    ed.setText(`${TEXT}More.\n`);
    expect(await ed.save()).toMatchObject({ ok: true });
    expect(extract(b.rec.saves.at(-1)!.html)!.siteNav).toEqual(NAV);
    await b.app.leave();
    await b.app.download();
    expect(extract(b.rec.downloads.at(-1)!.html)!.siteNav).toEqual(NAV);
    await b.app.saveAsCopy();
    expect(extract(b.rec.saves.at(-1)!.html)!.siteNav).toEqual(NAV);
    await b.app.newDocument();
    expect(extract(b.rec.saves.at(-1)!.html)!.siteNav).toBeUndefined();
    expect(b.rec.assembled.at(-1)).not.toHaveProperty('siteNav');
    b.app.dispose();
    // a kind that drops it
    const d = boot(html, { dropNav: true });
    await d.app.ready;
    const ed2 = d.app.edit();
    ed2.setText(`${TEXT}x\n`);
    const r = await ed2.save();
    expect(r).toMatchObject({ ok: false });
    expect(d.rec.saves).toEqual([]);
    d.app.dispose();
    // the quiet update carries it as stored
    let handlers: { onUpdate(i: UpdateInfo): unknown } | null = null;
    const u = boot(html, { update: (h) => { handlers = h; } });
    await new Promise((r) => setTimeout(r, 20));
    await handlers!.onUpdate(INFO);
    expect(u.rec.updates.map((x) => x.siteNav)).toEqual([NAV]);
    u.app.dispose();
  });

  it('[A.36] a copy written from a served page (no host) keeps the bar with its hrefs resolved against the page\'s address (the download, a save, a new copy); a framed page keeps them as they are; the opened bytes stay the file\'s own', async () => {
    const html = assembleEnvelope(TEXT, fileParts({ siteNav: NAV }));
    const URL_ = 'https://me.github.io/course/unit1/notes.md.html';
    const b = boot(html, { url: URL_ });
    await b.app.ready;
    const want = siteNavFrom(NAV, URL_);
    expect(want.home).toBe('https://me.github.io/course/index.html');
    // the bar on the page uses the file's own (relative) hrefs
    expect(b.links()[0].href).toBe('../index.html');
    await b.app.download();
    expect(extract(b.rec.downloads.at(-1)!.html)!.siteNav).toEqual(want);
    await b.app.saveAsCopy();
    expect(extract((b.rec.saves.at(-1) ?? b.rec.downloads.at(-1))!.html)!.siteNav).toEqual(want);
    const opened = await (b.app as unknown as { editorContext(): { openedHtml(): Promise<string> } }).editorContext().openedHtml();
    expect(opened === html).toBe(true);
    b.app.dispose();
    const f = boot(html, { url: URL_, framed: true });
    await f.app.ready;
    await f.app.download();
    expect(extract(f.rec.downloads.at(-1)!.html)!.siteNav).toEqual(NAV);
    f.app.dispose();
  });
});
