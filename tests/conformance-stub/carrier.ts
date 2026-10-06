/**
 * The stub carrier's browser bundle (test scaffolding for the conformance
 * harness, spec/conformance.md; not a product). Kind `md`, assembled from the
 * kit alone: it sets the standard global `globalThis.OrzCarrier` (FC-19 §2)
 * with `mountEditor` = the kit's editor shell (CodeMirror 6 from its pinned
 * URL, a textarea when that fails) + `renderMarkdownPreview`, and, when it
 * runs inside an assembled file (an `#orz-src` island is present), it boots
 * the file: connects to an embedding host (`connectHost`, all three
 * protocols) and, standalone, runs the quiet update check with the indicator.
 *
 * Built by build.ts with esbuild; `__STUB_VERSION__` and `__STUB_VARIANT__`
 * are compile-time constants. Variants other than `good` are deliberate bugs
 * for the harness's mutation tests (each marked `BUG (mutation)`).
 */
import { extract, readDocument, readIslandFromDom } from '../../src/carrier';
import {
  bundleUrl, checkForUpdate, compareSemver, connectHost, createPreferenceStore, createSaver, manifestUrl, mountUpdateIndicator, parseManifest,
  parseSemver, performUpdate, reassemble, sandboxDocument, sha384Integrity, skipVersion,
  type HostConnection, type PerformUpdateResult, type SaveResult, type UiElement, type UpdateInfo,
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

interface AssembleOptions { delivery?: 'inline' | 'cdn'; engineSource?: string }

function assemble(text: string, o: AssembleOptions = {}): Promise<string> {
  try {
    return Promise.resolve(stubAssemble(text, { version: VERSION, variant: VARIANT, delivery: o.delivery ?? 'inline', engineSource: o.engineSource ?? SELF }));
  } catch (e) {
    return Promise.reject(e);
  }
}

let host: HostConnection | undefined;
let current: EditorShell | null = null;

/** The opened file's name when it is an assembled md file, else a default. */
function fileName(): string {
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

interface MountOptions {
  text: string;
  readOnly?: boolean;
  mode?: 'split' | 'editor' | 'preview';
  chrome?: 'full' | 'compact' | 'none';
  hooks?: { save?(text: string): Promise<void> };
}

/** BUG (mutation) `copy-overwrite`: a saver told the wrong page location, so every copy matches the remembered handle. */
function wrongLocationSaver(uid: string | undefined) {
  const fake = { protocol: 'file:', href: `file:///orz-stub/${fileName()}`, pathname: `/orz-stub/${fileName()}` };
  const w = window as unknown as Record<string, unknown>;
  return createSaver({
    ...(uid ? { uid } : {}), suggestedName: fileName(), kind: 'md',
    window: {
      location: fake, document: document as never, indexedDB: indexedDB as never, Blob: Blob as never, URL: URL as never,
      setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
      ...(typeof w.showSaveFilePicker === 'function' ? { showSaveFilePicker: (o: unknown) => (w.showSaveFilePicker as (x: unknown) => Promise<never>)(o) } : {}),
    },
  });
}

function mountEditor(element: HTMLElement, options: MountOptions): EditorShell {
  const app = !!options.hooks?.save;
  const uid = readDocument(options.text, { kind: 'md' }).meta.uid;
  const shell = createEditorShell(element as never, {
    text: options.text,
    render: (t) => renderMarkdownPreview(t),
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.readOnly ? { readOnly: true } : {}),
    ...(options.chrome ? { chrome: options.chrome } : {}),
    ...(VARIANT === 'shared-prefs' ? { preferences: createPreferenceStore(undefined) } : {}), // BUG (mutation): one namespace for every document
    ...(app ? { hooks: { save: options.hooks!.save! } } : {
      kind: 'md' as const,
      fileName: fileName(),
      assemble: VARIANT === 'live-dom'
        ? () => `<!doctype html>\n${document.documentElement.outerHTML}` // BUG (mutation): serialises the live DOM
        : (t: string) => assemble(t),
      ...(host ? { host } : {}),
      ...(VARIANT === 'copy-overwrite' ? { saver: wrongLocationSaver(uid) } : {}),
    }),
    preview: { assets: false },
  });
  current = shell;
  if (VARIANT === 'preview-same-origin') {
    // BUG (mutation): the preview frame gets the page's origin
    const f = (shell.root as unknown as ShadowRoot).querySelector('iframe');
    if (f) { f.setAttribute('sandbox', 'allow-scripts allow-same-origin'); f.srcdoc = f.srcdoc; }
  }
  if (VARIANT === 'ungated-keys') {
    // BUG (mutation): the preview's key and link messages act without the reader's gesture
    window.addEventListener('message', (e) => {
      const d = e.data as { type?: string; key?: string; href?: string } | null;
      if (d?.type === 'orz-preview-key' && d.key === 's') void shell.save();
      if (d?.type === 'orz-preview-link' && typeof d.href === 'string') window.open(d.href, '_blank');
    });
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
  const saver = createSaver({ ...(uid ? { uid } : {}), suggestedName: fileName(), kind: 'md' });
  const delivery = fileDelivery();
  let r: PerformUpdateResult;
  if (VARIANT === 'accept-tampered' || VARIANT === 'no-roundtrip' || VARIANT === 'no-version-check') {
    const text = currentText(island);
    let html: string;
    if (VARIANT === 'accept-tampered') {
      // BUG (mutation): trusts whatever the CDN serves by fingerprinting the downloaded bytes itself.
      const res = await fetch(bundleUrl(info.manifest), { credentials: 'omit' });
      const integrity = await sha384Integrity(new Uint8Array(await res.arrayBuffer()));
      const release = { ...info.manifest, bundle: { ...info.manifest.bundle, integrity } };
      html = await reassemble({ text, kind: 'md', release, delivery });
    } else {
      html = await partlyVerified(info, text, delivery);
    }
    const save: SaveResult = await saver.save({ text, html });
    r = { status: 'updated', info, html, text, save, reload: save.via === 'file' && save.ok && !save.picked };
  } else {
    // The text is read when the update starts and again before the save (spec/shell-runtime.md §7.2).
    r = await performUpdate({ info, kind: 'md', current: VERSION, getText: () => currentText(island), saver, delivery, openedName: fileName() });
  }
  if (r.status === 'failed') throw new Error(r.error);
  if (r.status !== 'updated') return;
  if (r.save.via === 'served-notice') {
    const d = await saver.download({ html: r.html });
    if (!('ok' in d) || !d.ok) throw new Error('The update could not be downloaded.');
    return; // a copy: this page keeps running (and keeps its text)
  }
  if (!r.save.ok) throw new Error(r.save.error ?? 'The update could not be saved.');
  if (r.reload) location.reload(); // only when the opened file itself was written and the text did not move on
}

/** BUG (mutation) `offer-prerelease` / `no-once-a-day`: a carrier's own update check. */
async function ownCheck(format: number): Promise<UpdateInfo | null> {
  const key = 'orz-stub-checked';
  if (VARIANT === 'offer-prerelease' && localStorage.getItem(key)) return null;
  if (VARIANT === 'offer-prerelease') localStorage.setItem(key, '1');
  try {
    const res = await fetch(manifestUrl('md'), { credentials: 'omit', cache: 'no-cache' });
    const m = parseManifest(JSON.parse(await res.text()), 'md');
    if (!m || compareSemver(m.version, VERSION) !== 1 || !m.formats.includes(format)) return null;
    if (VARIANT === 'no-once-a-day' && (parseSemver(m.version)?.prerelease.length ?? 1) > 0) return null;
    return { kind: 'md', current: VERSION, latest: m.version, notes: m.notes, manifest: m };
  } catch {
    return null;
  }
}

function boot(): void {
  const island = document.getElementById('orz-src');
  if (!island) return; // not an assembled file (a harness page, the update sandbox)
  const doc = readDocument(readIslandFromDom(island), { kind: 'md' });
  const uid = doc.meta.uid;
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
    if (VARIANT !== 'update-in-frame') return; // embedded: the app host owns updates
  }
  const check = VARIANT === 'offer-prerelease' || VARIANT === 'no-once-a-day'
    ? ownCheck(doc.format)
    : checkForUpdate({
      kind: 'md', current: VERSION, format: doc.format, ...(host ? { host } : {}),
      ...(VARIANT === 'update-in-frame' ? { page: { location: { protocol: 'file:' } } } : {}), // BUG (mutation): claims to be a top-level file
    });
  void check.then((info) => {
    if (!info) return;
    const brand = document.getElementById('orz-brand');
    if (!brand) return;
    const ind = mountUpdateIndicator(brand as unknown as UiElement, info, {
      onUpdate: (i) => update(i, island, uid),
      onSkip: (i) => { skipVersion(i.kind, i.latest); },
    });
    if (VARIANT === 'steal-focus') (ind.root as unknown as ShadowRoot).querySelector('button')?.focus(); // BUG (mutation)
  });
}

(globalThis as Record<string, unknown>).OrzCarrier = {
  kind: 'md',
  version: VERSION,
  formats: [1],
  assemble,
  extract,
  readDocument: (text: string) => readDocument(text, { kind: 'md' }),
  mountEditor,
  renderPreview: (text: string) => Promise.resolve(renderMarkdownPreview(text)),
};

if (typeof document !== 'undefined') {
  try { boot(); } catch { /* a file that cannot boot still reads */ }
}
