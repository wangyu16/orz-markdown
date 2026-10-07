/**
 * The stub carrier's browser bundle (test scaffolding for the conformance
 * harness, spec/conformance.md; not a product). Kind `md`, assembled from the
 * kit alone: it sets the standard global `globalThis.OrzCarrier` (FC-19 §2)
 * with `mountEditor` = the kit's editor shell (CodeMirror 6 from its pinned
 * URL, a textarea when that fails) + `renderMarkdownPreview`, and, when it
 * runs inside an assembled file (an `#orz-src` island is present), it boots
 * the file: connects to an embedding host (`connectHost`, all three
 * protocols) and, standalone, runs the quiet update check with the indicator.
 * Its saver gets `openedHtml` — this bundle's `assemble` of the text the page
 * loaded, with the file's delivery and includes, computed when the page is
 * first idle — so a handle is proved by its content (spec/shell-runtime.md §1).
 * Saves and the quiet update keep the file's delivery and its resolved
 * includes (`#orz-includes`, FC-18 §8.3 D4); the editor is read-only while an
 * update runs and editable again when it settles.
 *
 * Built by build.ts with esbuild; `__STUB_VERSION__` and `__STUB_VARIANT__`
 * are compile-time constants. Variants other than `good` are deliberate bugs
 * for the harness's mutation tests (each marked `BUG (mutation)`).
 */
import { editHeader, extract, readDocument, readIslandFromDom } from '../../src/carrier';
import {
  bundleUrl, checkForUpdate, compareSemver, connectHost, createPreferenceStore, createSaver, manifestUrl, mountUpdateIndicator, parseManifest,
  parseSemver, performUpdate, reassemble, sandboxDocument, sha384Integrity, skipVersion,
  type HostConnection, type PerformUpdateResult, type SaveResult, type Saver, type UiElement, type UpdateInfo,
} from '../../src/carrier/shell';
import { createEditorShell, renderMarkdownPreview, type EditorShell } from '../../src/carrier/editor';
import { stubAssemble, type StubVariant } from './assemble';

declare const __STUB_VERSION__: string;
declare const __STUB_VARIANT__: StubVariant;

const VERSION = __STUB_VERSION__;
const VARIANT = __STUB_VARIANT__;

/** The bundle's own text when it runs inline (an assembled file, the update sandbox); null when loaded by URL. */
const SELF: string | null = (() => {
  try {
    const s = typeof document !== 'undefined' ? (document.currentScript as HTMLScriptElement | null) : null;
    return s && !s.src ? s.textContent : null;
  } catch {
    return null;
  }
})();

interface AssembleOptions { delivery?: 'inline' | 'cdn'; engineSource?: string; includes?: Record<string, string> }

function assemble(text: string, o: AssembleOptions = {}): Promise<string> {
  try {
    // BUG (mutation) browser-shell-lie: the browser bundle writes a stale shell version
    return Promise.resolve(stubAssemble(text, { version: VARIANT === 'browser-shell-lie' ? '1.0.0' : VERSION, variant: VARIANT, delivery: o.delivery ?? 'inline', engineSource: o.engineSource ?? SELF, ...(o.includes ? { includes: o.includes } : {}) }));
  } catch (e) {
    // BUG (mutation) browser-no-refusal: the browser bundle writes texts the Node assemble refuses
    if (VARIANT === 'browser-no-refusal') return Promise.resolve(`<!doctype html>\n<script type="application/json" id="orz-shell">{"kind":"md","format":1,"shell":"${VERSION}","delivery":"inline"}</script>\n<script type="text/markdown" id="orz-src" data-orz-format="1" data-orz-eol="lf">${text}</script>\n`);
    return Promise.reject(e);
  }
}

let host: HostConnection | undefined;
let current: EditorShell | null = null;
/**
 * The opened file's bytes, for the saver's content proof (spec/shell-runtime.md §1 step 3): this
 * bundle's `assemble` of the text the page loaded, which reproduces the file (FC-18 law 3). Set at boot.
 */
let openedHtml: (() => Promise<string>) | undefined;

/** The standalone saver of this file: the opened file's name, the connected host, the opened bytes. */
function fileSaver(uid: string | undefined): Saver {
  if (VARIANT === 'name-handle') return nameProvedSaver(uid, location.href.replace(/[?#].*$/s, ''));
  if (VARIANT === 'copy-overwrite') return nameProvedSaver(uid, `file:///orz-stub/${fileName()}`); // BUG (mutation): every copy is told one page location
  return createSaver({ ...(uid ? { uid } : {}), suggestedName: fileName(), kind: 'md', ...(host ? { host } : {}), ...(openedHtml ? { openedHtml } : {}) });
}

/**
 * BUG (mutation) `name-handle`: the save of closed loop 2 round 2's F2 — a remembered handle is
 * reused when its NAME matches the opened file's, so a "save as" that landed in another folder is
 * overwritten by every later page load, and it counts as the opened file (an update reloads).
 */
function nameProvedSaver(uid: string | undefined, page: string): Saver {
  const base = createSaver({ ...(uid ? { uid } : {}), suggestedName: fileName(), kind: 'md' });
  const key = `${uid ?? ''} ${page}`;
  type H = { name: string; createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>; queryPermission?(o: unknown): Promise<string> };
  const db = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const r = indexedDB.open('orz-stub-handles', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('h'); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const get = async (): Promise<H | undefined> => { const d = await db(); return new Promise((resolve) => { const g = d.transaction('h').objectStore('h').get(key); g.onsuccess = () => resolve(g.result as H | undefined); g.onerror = () => resolve(undefined); }); };
  const put = async (h: H): Promise<void> => { const d = await db(); await new Promise<void>((resolve) => { const t = d.transaction('h', 'readwrite'); t.objectStore('h').put(h, key); t.oncomplete = () => resolve(); t.onerror = () => resolve(); }); };
  let handle: H | null = null;
  return {
    ...base,
    async save({ html }): Promise<SaveResult> {
      let picked = false;
      if (!handle) {
        const h = await get();
        if (h && h.name === fileName() && (!h.queryPermission || (await h.queryPermission({ mode: 'readwrite' })) === 'granted')) handle = h;
      }
      if (!handle) {
        picked = true;
        handle = await (window as unknown as { showSaveFilePicker(o: unknown): Promise<H> }).showSaveFilePicker({ suggestedName: fileName() });
        await put(handle);
      }
      const w = await handle.createWritable();
      await w.write(html);
      await w.close();
      return { via: 'file', ok: true, picked, opened: !picked || handle.name === fileName(), name: handle.name };
    },
  };
}

/** The opened file's name when it is an assembled md file, else a default. */
function fileName(): string {
  if (VARIANT === 'download-fixed-name') return 'document.md.html'; // BUG (mutation): ignores the opened file's name
  try {
    const last = decodeURIComponent(location.pathname.split('/').pop() ?? '');
    if (/.\.md\.html$/.test(last)) return last;
  } catch { /* no location */ }
  return 'document.md.html';
}

/** The opened file's delivery (`#orz-shell`), kept by the update (FC-18 §8.2). */
function fileDelivery(): 'inline' | 'cdn' {
  if (VARIANT === 'cdn-to-inline') return 'inline'; // BUG (mutation): a cdn file updates to an inline one
  try {
    const d = (JSON.parse(document.getElementById('orz-shell')?.textContent ?? '{}') as { delivery?: unknown }).delivery;
    return d === 'cdn' ? 'cdn' : 'inline';
  } catch {
    return 'inline';
  }
}

/** The opened file's resolved includes (`#orz-includes`, read as `extract` reads it), or undefined. */
function fileIncludes(): Record<string, string> | undefined {
  try {
    const el = document.getElementById('orz-includes');
    if (!el) return undefined;
    const parsed = JSON.parse(el.textContent ?? '') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}

interface MountOptions {
  text: string;
  readOnly?: boolean;
  mode?: 'split' | 'editor' | 'preview';
  chrome?: 'full' | 'compact' | 'none';
  hooks?: { save?(text: string): Promise<void> };
}

function mountEditor(element: HTMLElement, options: MountOptions): EditorShell {
  const app = !!options.hooks?.save && VARIANT !== 'ignore-hook-save'; // BUG (mutation) ignore-hook-save
  const uid = readDocument(options.text, { kind: 'md' }).meta.uid;
  const hookSave = VARIANT === 'hook-save-lf' // BUG (mutation): the app gets a normalised text
    ? (t: string) => options.hooks!.save!(t.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'))
    : options.hooks?.save;
  if (VARIANT === 'css-leak') {
    // BUG (mutation): the carrier's chrome stylesheet goes into the page, not a shadow root
    const st = document.createElement('style');
    st.textContent = 'body, button, input, p { font: 19px/1.2 Georgia, serif !important; color: #135 !important; } [data-orz-conformance] { outline: 3px solid red; }';
    document.head.appendChild(st);
  }
  // the file's delivery (FC-18 §8.2) and its resolved includes (D4) are kept by every save
  const plainAssemble = (t: string, o?: { includes?: Record<string, string> }) => assemble(t, {
    delivery: VARIANT === 'save-to-inline' ? 'inline' : fileDelivery(), // BUG (mutation) save-to-inline: a cdn file is saved inline (B#7)
    ...(o?.includes ? { includes: o.includes } : {}),
  });
  const includes = VARIANT === 'save-drops-includes' ? undefined : fileIncludes(); // BUG (mutation) save-drops-includes
  const shell = createEditorShell(element as never, {
    text: options.text,
    render: (t) => renderMarkdownPreview(t),
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.readOnly && VARIANT !== 'readonly-ignored' ? { readOnly: true } : {}),
    ...(options.chrome ? { chrome: options.chrome } : {}),
    ...(VARIANT === 'shared-prefs' ? { preferences: createPreferenceStore(undefined) } : {}), // BUG (mutation): one namespace for every document
    ...(app ? { hooks: { save: hookSave! } } : {
      kind: 'md' as const,
      fileName: fileName(),
      assemble: VARIANT === 'live-dom'
        ? () => `<!doctype html>\n${document.documentElement.outerHTML}` // BUG (mutation): serialises the live DOM
        : VARIANT === 'prefs-in-file'
          ? async (t: string) => { // BUG (mutation): the reader's view mode is baked into the saved file
            const h = await plainAssemble(t);
            let m: string | null = null;
            try { m = localStorage.getItem(`orz-pref:${uid}:viewMode`); } catch { /* none */ }
            return m ? h.replace('<main id="orz-app"></main>', `<main id="orz-app" data-view=${m}></main>`) : h;
          }
          : plainAssemble,
      ...(host ? { host: VARIANT === 'no-dirty-post' ? { ...host, setDirty() { /* BUG (mutation): dirty never posted */ } } : host } : {}),
      ...(includes ? { includes } : {}),
      saver: fileSaver(uid),
      // the file's own boot says the page is this standalone file (an assembled file: its island was read at boot)
      ...(openedHtml && !host ? { standalone: true } : {}),
    }),
    preview: { assets: false },
  });
  current = shell;
  if (VARIANT === 'r3-readonly-save-key' && app) {
    // BUG (mutation) r3: the carrier's own Cmd/Ctrl+S handler saves through the app hook even when read-only
    element.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void options.hooks!.save!(shell.getText()); } }, true);
  }
  if (VARIANT === 'preview-same-origin') {
    // BUG (mutation): the preview frame gets the page's origin
    const f = (shell.root as unknown as ShadowRoot).querySelector('iframe');
    if (f) { f.setAttribute('sandbox', 'allow-scripts allow-same-origin'); f.srcdoc = f.srcdoc; }
  }
  if (VARIANT === 'standalone-same-origin' && !app) {
    // BUG (mutation): a standalone file served over http gives its preview the page's origin (the exception is file: only)
    const f = (shell.root as unknown as ShadowRoot).querySelector('iframe');
    if (f) { f.setAttribute('sandbox', 'allow-scripts allow-same-origin'); f.srcdoc = f.srcdoc; }
  }
  if (VARIANT === 'indicator-in-app' && app) {
    // BUG (mutation): the editor in an app host runs the quiet update check and shows the indicator
    void checkForUpdate({ kind: 'md', current: VERSION, servedPages: true, page: { location: { protocol: 'file:' } } } as never).then((info) => {
      if (info) mountUpdateIndicator(element as unknown as UiElement, info, { onUpdate: () => Promise.resolve() });
    });
  }
  if (VARIANT === 'global-mode-key') {
    try { const g = localStorage.getItem('orz-stub-mode'); if (g) shell.setMode(g as 'split'); } catch { /* none */ }
  }
  if (VARIANT === 'prefs-in-text') {
    // BUG (mutation): the reader's view mode is kept in the document's header (and the edit hidden from dirty)
    const setMode = shell.setMode.bind(shell);
    shell.setMode = (m) => { setMode(m); shell.setHeader({ x_view_mode: m }); shell.markSaved(); };
  }
  if (VARIANT === 'ungated-keys') {
    // BUG (mutation): the preview's key and link messages act without the reader's gesture
    window.addEventListener('message', (e) => {
      const d = e.data as { type?: string; key?: string; href?: string } | null;
      if (d?.type === 'orz-preview-key' && d.key === 's') void shell.save();
      if (d?.type === 'orz-preview-link' && typeof d.href === 'string') window.open(d.href, '_blank');
    });
  }
  if (['crlf-after-edit', 'setheader-two-steps', 'shared-undo', 'global-mode-key', 'r3-hook-markSaved'].includes(VARIANT)) {
    const out = Object.create(shell) as EditorShell & Record<string, unknown>;
    if (VARIANT === 'crlf-after-edit') out.getText = () => { const t = shell.getText(); return shell.isDirty() ? t.replace(/\r\n/g, '\n') : t; }; // BUG (mutation)
    if (VARIANT === 'setheader-two-steps') out.setHeader = (ch) => { const [k] = Object.keys(ch); shell.setHeader({ [k]: ch[k] }); shell.setHeader(ch); }; // BUG (mutation): two undo steps
    if (VARIANT === 'shared-undo') out.undo = () => (current ?? shell).undo(); // BUG (mutation): undo acts on the last mounted instance
    // BUG (mutation) r3-hook-markSaved: after a successful save the carrier marks whatever the editor holds as saved (an edit made during the save counts as saved)
    if (VARIANT === 'r3-hook-markSaved') out.save = async () => { const r = await shell.save(); if (r.ok) shell.markSaved(); return r; };
    if (VARIANT === 'global-mode-key') { // BUG (mutation): the view mode is one global key, and getMode is not exposed
      out.getMode = undefined;
      out.setMode = (m) => { try { localStorage.setItem('orz-stub-mode', m); } catch { /* none */ } shell.setMode(m); };
    }
    void editHeader;
    return out;
  }
  return shell;
}

const currentText = (island: Element): string => (current ? current.getText() : readIslandFromDom(island));

/** BUG (mutation) `no-roundtrip` / `no-version-check`: a re-assembly that verifies the integrity but not all of the result. */
async function partlyVerified(info: UpdateInfo, text: string, delivery: 'inline' | 'cdn'): Promise<string> {
  const res = await fetch(bundleUrl(info.manifest), { credentials: 'omit' });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if ((await sha384Integrity(bytes)) !== info.manifest.bundle.integrity) throw new Error('integrity');
  const bundle = new TextDecoder().decode(bytes);
  const html = await new Promise<string>((resolve, reject) => {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts');
    f.style.display = 'none';
    f.srcdoc = sandboxDocument(bundle);
    const on = (e: MessageEvent): void => {
      if (e.source !== f.contentWindow) return;
      const d = e.data as { type?: string; ok?: boolean; html?: string; error?: string };
      if (d?.type === 'orz-reassemble-ready') { f.contentWindow!.postMessage({ type: 'orz-reassemble', id: 'm', text, delivery, engineSource: bundle }, '*'); return; }
      if (d?.type !== 'orz-reassembled') return;
      removeEventListener('message', on);
      f.remove();
      if (d.ok && typeof d.html === 'string') resolve(d.html); else reject(new Error(d.error ?? 'bundle'));
    };
    addEventListener('message', on);
    document.body.appendChild(f);
  });
  const back = extract(html);
  if (VARIANT !== 'no-roundtrip' && back?.text !== text) throw new Error('The new version would change the text.');
  if (VARIANT !== 'no-version-check' && back?.shell !== info.latest) throw new Error('The new version reports another version.');
  return html;
}

async function update(info: UpdateInfo, island: Element, uid: string | undefined): Promise<void> {
  // the editor is read-only while the update runs (spec/shell-runtime.md §7.2) and editable again when it settles
  const editor = current;
  const wasReadOnly = editor ? editor.isReadOnly() : true;
  editor?.setReadOnly(true);
  let reloading = false;
  try {
    reloading = await runUpdateNow(info, island, uid);
  } finally {
    // BUG (mutation) r3-readonly-stuck: read-only while updating, never given back
    if (!reloading && !wasReadOnly && VARIANT !== 'r3-readonly-stuck') editor?.setReadOnly(false);
  }
  if (reloading) location.reload();
}

/** The update itself; true when the page should reload (the opened file itself was written and the text did not move on). */
async function runUpdateNow(info: UpdateInfo, island: Element, uid: string | undefined): Promise<boolean> {
  const base = fileSaver(uid);
  const saver = VARIANT === 'update-download' ? { ...base, save: (x: { html: string }) => base.download({ html: x.html }) } : base; // BUG (mutation): the update is always a downloaded copy
  const delivery = fileDelivery();
  const includes = VARIANT === 'update-drops-includes' ? undefined : fileIncludes(); // BUG (mutation) update-drops-includes
  let r: PerformUpdateResult;
  if (VARIANT === 'accept-tampered' || VARIANT === 'no-roundtrip' || VARIANT === 'no-version-check') {
    const text = currentText(island);
    let html: string;
    if (VARIANT === 'accept-tampered') {
      // BUG (mutation): trusts whatever the CDN serves by fingerprinting the downloaded bytes itself.
      const res = await fetch(bundleUrl(info.manifest), { credentials: 'omit' });
      const integrity = await sha384Integrity(new Uint8Array(await res.arrayBuffer()));
      const release = { ...info.manifest, bundle: { ...info.manifest.bundle, integrity } };
      html = await reassemble({ text, kind: 'md', release, delivery, ...(includes ? { includes } : {}) });
    } else {
      html = await partlyVerified(info, text, delivery);
    }
    const save: SaveResult = await saver.save({ text, html });
    r = { status: 'updated', info, html, text, save, reload: save.via === 'file' && save.ok && save.opened };
  } else {
    // The text is read when the update starts and again before the save (spec/shell-runtime.md §7.2).
    r = VARIANT === 'update-stale-text'
      ? await performUpdate({ info, kind: 'md', current: VERSION, text: currentText(island), saver: saver as never, delivery, ...(includes ? { includes } : {}), openedName: fileName() } as never) // BUG (mutation): the text read once
      : await performUpdate({ info, kind: 'md', current: VERSION, getText: () => currentText(island), saver: saver as never, delivery, ...(includes ? { includes } : {}), openedName: fileName() });
  }
  if (r.status === 'failed') throw new Error(r.error);
  if (r.status !== 'updated') return false;
  if (r.save.via === 'served-notice') {
    const d = await saver.download({ html: r.html });
    if (!('ok' in d) || !d.ok) throw new Error('The update could not be downloaded.');
    return false; // a copy: this page keeps running (and keeps its text)
  }
  if (!r.save.ok) throw new Error(r.save.error ?? 'The update could not be saved.');
  // only when the opened file itself was written and the text did not move on
  // BUG (mutation) r3-reload-picked: reloads after any written file
  return r.reload || (VARIANT === 'r3-reload-picked' && r.save.via === 'file' && r.save.ok);
}

/** BUG (mutation) `offer-prerelease` / `no-once-a-day` / `update-any-format`: a carrier's own update check. */
async function ownCheck(format: number): Promise<UpdateInfo | null> {
  const key = 'orz-stub-checked';
  if (VARIANT === 'offer-prerelease' && localStorage.getItem(key)) return null;
  if (VARIANT === 'offer-prerelease') localStorage.setItem(key, '1');
  try {
    const res = await fetch(manifestUrl('md'), { credentials: 'omit', cache: 'no-cache' });
    const m = parseManifest(JSON.parse(await res.text()), 'md');
    if (!m || compareSemver(m.version, VERSION) !== 1) return null;
    if (VARIANT !== 'update-any-format' && !m.formats.includes(format)) return null; // BUG (mutation) update-any-format: offered whatever text formats the release writes
    if (VARIANT === 'no-once-a-day' && (parseSemver(m.version)?.prerelease.length ?? 1) > 0) return null;
    return { kind: 'md', current: VERSION, latest: m.version, notes: m.notes, manifest: m };
  } catch {
    return null;
  }
}

function boot(): void {
  const island = document.getElementById('orz-src');
  if (!island) return; // not an assembled file (a harness page, the update sandbox)
  const loaded = readIslandFromDom(island);
  const doc = readDocument(loaded, { kind: 'md' });
  const uid = doc.meta.uid;
  const delivery = fileDelivery();
  const includes = fileIncludes();
  let opened: Promise<string> | null = null;
  openedHtml = () => (opened ??= assemble(loaded, { delivery, ...(includes ? { includes } : {}) }));
  // computed when the page is first idle, so a save click does not wait for it (round 3, B#6)
  const warm = () => { void openedHtml?.().catch(() => undefined); };
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (typeof idle === 'function') idle.call(window, warm, { timeout: 2000 }); else setTimeout(warm, 300);
  const framed = window.parent !== window;
  if (framed) {
    let win: Window | undefined;
    if (VARIANT === 'any-source') {
      // BUG (mutation): reads every message as if its parent had sent it
      const wrap = new Map<unknown, (e: MessageEvent) => void>();
      win = {
        parent: window.parent,
        addEventListener: (t: string, l: (e: unknown) => void) => { const w = (e: MessageEvent) => l({ data: e.data, origin: e.origin, source: window.parent }); wrap.set(l, w); window.addEventListener(t as 'message', w); },
        removeEventListener: (t: string, l: unknown) => { const w = wrap.get(l); if (w) window.removeEventListener(t as 'message', w); },
      } as unknown as Window;
    }
    host = connectHost({ kind: 'md', ...(win ? { window: win as never } : {}), ai: { onOperations() { /* the stub has no assistant UI */ } }, include: { onAvailable() { current?.refreshPreview(); } } });
    if (VARIANT === 'note-when-hosted') {
      // BUG (mutation): an embedded file shows the served-page notice although its host saves it
      const note = document.createElement('div');
      note.id = 'orz-served-note';
      note.textContent = 'This page is served from the web, so it cannot be saved in place.';
      document.body.appendChild(note);
    }
    if (VARIANT === 'frame-silent-update') {
      // BUG (mutation): a framed file whose parent never says hello decides it is standalone and checks for updates
      setTimeout(() => { if (!host?.connected()) startCheck(doc, island, uid, true); }, 1500);
      return;
    }
    if (VARIANT !== 'update-in-frame') return; // embedded: the app host owns updates
  }
  startCheck(doc, island, uid, false);
}

function startCheck(doc: { format: number }, island: HTMLElement, uid: string | undefined, fake: boolean): void {
  const check = VARIANT === 'offer-prerelease' || VARIANT === 'no-once-a-day' || VARIANT === 'update-any-format'
    ? ownCheck(doc.format)
    : checkForUpdate({
      kind: 'md', current: VERSION, format: doc.format, ...(host && !fake ? { host } : {}),
      ...(VARIANT === 'update-in-frame' || fake ? { page: { location: { protocol: 'file:' } } } : {}), // BUG (mutation): claims to be a top-level file
    });
  void check.then((info) => {
    if (!info) return;
    const brand = document.getElementById('orz-brand');
    if (!brand) return;
    const ind = mountUpdateIndicator(brand as unknown as UiElement, info, {
      onUpdate: (i) => (VARIANT === 'silent-refusal' ? update(i, island, uid).catch(() => undefined) : update(i, island, uid)), // BUG (mutation) silent-refusal: a refused update is swallowed, never shown
      onSkip: (i) => { skipVersion(i.kind, i.latest); },
    });
    if (VARIANT === 'steal-focus') (ind.root as unknown as ShadowRoot).querySelector('button')?.focus(); // BUG (mutation)
  });
}

(globalThis as Record<string, unknown>).OrzCarrier = {
  kind: 'md',
  version: VERSION,
  formats: VARIANT === 'formats-wrong' ? [1, 2] : [1], // BUG (mutation) formats-wrong: claims a format it refuses
  assemble,
  extract: VARIANT === 'extract-strip-bom'
    ? (html: string) => { const x = extract(html); return x && x.text.charCodeAt(0) === 0xfeff ? { ...x, text: x.text.slice(1) } : x; } // BUG (mutation)
    : extract,
  readDocument: (text: string) => readDocument(text, { kind: 'md' }),
  mountEditor,
  renderPreview: (text: string) => Promise.resolve(renderMarkdownPreview(text)),
};

if (typeof document !== 'undefined') {
  try { boot(); } catch { /* a file that cannot boot still reads */ }
}
