/**
 * The bundle entry helper (spec/carrier-app.md §4): `startCarrier` sets the
 * standard bundle global `globalThis.OrzCarrier` (FC-19 §2) from a kind and,
 * when the page is an assembled file of that kind (an `#orz-src` island is
 * present), boots the standalone app. In the quiet update's sandbox and in an
 * app's page there is no island: only the global is set; nothing else is
 * touched (no storage, no network, no DOM).
 *
 * `OrzCarrier.mountEditor(element, options)` is the kind's `mountEditor`;
 * without `hooks.save`, in an assembled file, it mounts on the file's context
 * (saver, host, includes, opened bytes; FC-19 §4: a carrier never opens a
 * second host connection) and attaches the editor to the app until it is
 * destroyed.
 */
import { extract as kitExtract } from '../read.js';
import type { EditorShell } from '../editor/shell.js';
import { bootCarrierApp } from './app.js';
import type { AppAssembleOptions, AppElement, CarrierApp, CarrierAppOptions, KindEditorOptions, OrzCarrierGlobal, StandaloneKind } from './types.js';

export interface StartOptions extends CarrierAppOptions {
  /** Where the global goes (default `globalThis`); `false`: set none. */
  global?: Record<string, unknown> | false;
  /** Boot the standalone app when the page is an assembled file (default `true`). */
  boot?: boolean;
}

/** Build the FC-19 §2 global of a kind (`app`: the booted file, or a getter of it). */
export function carrierGlobal(k: StandaloneKind, app: () => CarrierApp | null = () => null): OrzCarrierGlobal {
  const mountEditor = (element: AppElement, options: KindEditorOptions): EditorShell => {
    const file = !options?.hooks?.save ? app() : null;
    const editor = k.mountEditor(element, options, file ? file.editorContext() : undefined);
    if (file) {
      // an editor of this file: the page's shortcuts, its leave warning and the update defer to it until it is destroyed
      const detach = file.attach(editor);
      const destroy = editor.destroy.bind(editor);
      editor.destroy = () => { detach(); destroy(); };
    }
    return editor;
  };
  return {
    kind: k.kind,
    version: k.version,
    formats: [...k.formats],
    assemble: (text: string, options?: AppAssembleOptions) => {
      try { return Promise.resolve(k.assemble(text, options ?? {})).then(String); } catch (e) { return Promise.reject(e); }
    },
    extract: (html: string) => (k.extract ? k.extract(html) : kitExtract(html)),
    readDocument: (text: string) => k.readDocument(text),
    mountEditor,
    ...(k.renderPreview ? { renderPreview: (text: string, o?: Record<string, unknown>) => k.renderPreview!(text, o) } : {}),
    get standalone() { return app(); },
  };
}

/**
 * Set `globalThis.OrzCarrier` and boot the standalone file. A file that
 * cannot boot says so in the console only (its text stays in the island).
 */
export function startCarrier(k: StandaloneKind, options: StartOptions = {}): { carrier: OrzCarrierGlobal; app: CarrierApp | null } {
  let app: CarrierApp | null = null;
  const carrier = carrierGlobal(k, () => app);
  if (options.global !== false) (options.global ?? (globalThis as Record<string, unknown>)).OrzCarrier = carrier;
  const win = options.window ?? (globalThis as { window?: unknown }).window;
  if (options.boot !== false && win && typeof win === 'object' && (win as { document?: unknown }).document) {
    try {
      app = bootCarrierApp(k, options);
    } catch (e) {
      try { console.error(`orz carrier (${k.kind}): the file could not start`, e); } catch { /* no console */ }
    }
  }
  return { carrier, app };
}
