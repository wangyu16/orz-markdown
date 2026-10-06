/**
 * The stub carrier's browser bundle (test scaffolding for the conformance
 * harness, spec/conformance.md; not a product). Kind `md`, assembled from the
 * kit alone: it sets the standard global `globalThis.OrzCarrier` (FC-19 §2)
 * with `mountEditor` = the kit's editor shell + `renderMarkdownPreview`, and,
 * when it runs inside an assembled file (an `#orz-src` island is present), it
 * boots the file: connects to an embedding host (`connectHost`, all three
 * protocols) and, standalone, runs the quiet update check with the indicator.
 *
 * Built by build.ts with esbuild; `__STUB_VERSION__` and `__STUB_VARIANT__`
 * are compile-time constants. Variants other than `good` are deliberate bugs
 * for the harness's mutation tests.
 */
import { extract, readDocument, readIslandFromDom } from '../../src/carrier';
import {
  bundleUrl, checkForUpdate, connectHost, createSaver, mountUpdateIndicator, performUpdate, reassemble, sha384Integrity, skipVersion,
  type HostConnection, type PerformUpdateResult, type UiElement, type UpdateInfo,
} from '../../src/carrier/shell';
import { createEditorShell, renderMarkdownPreview, textareaAdapter, type EditorShell } from '../../src/carrier/editor';
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

interface MountOptions {
  text: string;
  readOnly?: boolean;
  mode?: 'split' | 'editor' | 'preview';
  chrome?: 'full' | 'compact' | 'none';
  hooks?: { save?(text: string): Promise<void> };
}

function mountEditor(element: HTMLElement, options: MountOptions): EditorShell {
  const app = !!options.hooks?.save;
  const shell = createEditorShell(element as never, {
    text: options.text,
    render: (t) => renderMarkdownPreview(t),
    adapter: textareaAdapter(),
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.readOnly ? { readOnly: true } : {}),
    ...(options.chrome ? { chrome: options.chrome } : {}),
    ...(app ? { hooks: { save: options.hooks!.save! } } : {
      kind: 'md' as const,
      fileName: fileName(),
      assemble: VARIANT === 'live-dom'
        ? () => `<!doctype html>\n${document.documentElement.outerHTML}` // BUG (mutation): serialises the live DOM
        : (t: string) => assemble(t),
      ...(host ? { host } : {}),
    }),
    preview: { assets: false },
  });
  current = shell;
  return shell;
}

const currentText = (island: Element): string => (current ? current.getText() : readIslandFromDom(island));

async function update(info: UpdateInfo, island: Element, uid: string | undefined): Promise<void> {
  const saver = createSaver({ ...(uid ? { uid } : {}), suggestedName: fileName(), kind: 'md' });
  const text = currentText(island);
  let r: PerformUpdateResult;
  if (VARIANT === 'accept-tampered') {
    // BUG (mutation): trusts whatever the CDN serves by fingerprinting the downloaded bytes itself.
    const res = await fetch(bundleUrl(info.manifest), { credentials: 'omit' });
    const integrity = await sha384Integrity(new Uint8Array(await res.arrayBuffer()));
    const release = { ...info.manifest, bundle: { ...info.manifest.bundle, integrity } };
    const html = await reassemble({ text, kind: 'md', release });
    r = { status: 'updated', info, html, save: await saver.save({ text, html }) };
  } else {
    r = await performUpdate({ info, kind: 'md', current: VERSION, text, saver });
  }
  if (r.status === 'failed') throw new Error(r.error);
  if (r.status !== 'updated') return;
  if (r.save.via === 'served-notice') {
    const d = await saver.download({ html: r.html });
    if (!('ok' in d) || !d.ok) throw new Error('The update could not be downloaded.');
    return;
  }
  if (!r.save.ok) throw new Error(r.save.error ?? 'The update could not be saved.');
  location.reload();
}

function boot(): void {
  const island = document.getElementById('orz-src');
  if (!island) return; // not an assembled file (a harness page, the update sandbox)
  const doc = readDocument(readIslandFromDom(island), { kind: 'md' });
  const uid = doc.meta.uid;
  if (window.parent !== window) {
    host = connectHost({ kind: 'md', ai: { onOperations() { /* the stub has no assistant UI */ } }, include: { onAvailable() { current?.refreshPreview(); } } });
    return; // embedded: the app host owns updates
  }
  void checkForUpdate({ kind: 'md', current: VERSION, format: doc.format }).then((info) => {
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
