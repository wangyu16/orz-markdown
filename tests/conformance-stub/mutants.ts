/**
 * The stub carrier's deliberate bugs (test scaffolding for H.5 in
 * tests/conformance.test.ts; every one marked `BUG (mutation)`). The good
 * carrier (carrier.ts) is the kit's `carrier/app` plus a small md kind; a
 * variant re-makes one carrier bug the harness must catch by changing what
 * the kind hands the kit — its assemble, its editor's inputs, the editor it
 * returns — or, for the bugs of the standalone runtime itself (the update,
 * the host connection), by replacing a kit service through
 * `startCarrier({ services })` (the documented test seam) or by running a
 * carrier's own extra code after the boot.
 */
import { extract } from '../../src/carrier';
import {
  bundleUrl, checkForUpdate, compareSemver, connectHost, createPreferenceStore, createSaver, manifestUrl, mountUpdateIndicator, parseManifest,
  parseSemver, performUpdate, reassemble, sandboxDocument, sha384Integrity,
  type HostConnection, type PerformUpdateOptions, type PerformUpdateResult, type SaveResult, type Saver, type UiElement, type UpdateInfo,
} from '../../src/carrier/shell';
import type { EditorShell, EditorShellOptions } from '../../src/carrier/editor';
import type { AppServices, CarrierApp, KindEditorOptions, StandaloneContext } from '../../src/carrier/app';
import { STUB_BUNDLE_PATH, type StubVariant } from './assemble';

/** What the bundle's kind lets a variant change. */
export interface StubBugs {
  /** The shell version the browser bundle writes. */
  shellVersion(version: string): string;
  /** A refusal of the bundle's assemble (the Node one throws). */
  refused(text: string, error: unknown, version: string): Promise<string>;
  formats: number[];
  extract(html: string): ReturnType<typeof extract>;
  /** Kit services replaced in the standalone runtime. */
  services: Partial<AppServices>;
  /** Whether the editor runs as an app host's (it was given `hooks.save`). */
  appHost(declared: boolean): boolean;
  /** Before an editor mounts (page-wide changes). */
  beforeMount(o: { appHost: boolean; current(): EditorShell | null }): void;
  /** The editor shell's inputs. */
  editorInputs(input: EditorShellOptions, o: { appHost: boolean; options: KindEditorOptions; ctx?: StandaloneContext; uid?: string }): EditorShellOptions;
  /** The editor the kind returns. */
  editor(shell: EditorShell, o: { appHost: boolean; element: HTMLElement; options: KindEditorOptions; current(): EditorShell | null }): EditorShell;
  /** After the standalone runtime booted (a carrier's own extra code). */
  booted(app: CarrierApp | null, version: string): void;
}

/** The opened file's name when it is an assembled md file, else a default. */
function pageFileName(): string {
  try {
    const last = decodeURIComponent(location.pathname.split('/').pop() ?? '');
    if (/.\.md\.html$/.test(last)) return last;
  } catch { /* no location */ }
  return 'document.md.html';
}

/**
 * BUG (mutation) `name-handle` / `copy-overwrite`: a remembered handle is reused when its NAME
 * matches the opened file's (closed loop 2 round 2's F2) — keyed by `page`.
 */
function nameProvedSaver(uid: string | undefined, page: string): Saver {
  const base = createSaver({ ...(uid ? { uid } : {}), suggestedName: pageFileName(), kind: 'md' });
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
        if (h && h.name === pageFileName() && (!h.queryPermission || (await h.queryPermission({ mode: 'readwrite' })) === 'granted')) handle = h;
      }
      if (!handle) {
        picked = true;
        handle = await (window as unknown as { showSaveFilePicker(o: unknown): Promise<H> }).showSaveFilePicker({ suggestedName: pageFileName() });
        await put(handle);
      }
      const w = await handle.createWritable();
      await w.write(html);
      await w.close();
      return { via: 'file', ok: true, picked, opened: !picked || handle.name === pageFileName(), name: handle.name };
    },
  };
}

/** BUG (mutation) `port-without-secret`: the preview hands its port to any ready that asks for one. */
function handPortToAnyReady(current: () => EditorShell | null): void {
  const add = window.addEventListener.bind(window);
  const loads: Array<(e: Event) => void> = [];
  const elAdd = HTMLIFrameElement.prototype.addEventListener;
  HTMLIFrameElement.prototype.addEventListener = function (this: HTMLIFrameElement, type: string, l: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) {
    if (type === 'load' && typeof l === 'function') loads.push(l as (e: Event) => void);
    return elAdd.call(this, type, l, o);
  } as typeof elAdd;
  (window as { addEventListener: unknown }).addEventListener = (type: string, l: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => {
    if (type !== 'message' || typeof l !== 'function') return add(type, l, o);
    return add(type, (e: Event) => {
      const m = e as MessageEvent;
      const d = m.data as { type?: unknown; channel?: unknown } | null;
      const shell = current();
      if (!d || d.type !== 'orz-preview-ready' || typeof d.channel !== 'string' || !shell) return (l as (e: Event) => void)(e);
      const frame = Array.from((shell.root as unknown as ShadowRoot).querySelectorAll('iframe')).find((f) => f.contentWindow === m.source);
      const secret = /data-orz-preview-secret="([^"]*)"/.exec(frame?.srcdoc ?? '')?.[1];
      for (const load of loads) load(new Event('load'));
      (l as (e: Event) => void)({ data: { ...d, secret }, source: m.source, origin: m.origin, ports: m.ports } as unknown as Event);
    }, o);
  };
}

/** BUG (mutation) `no-roundtrip` / `no-version-check`: a re-assembly that verifies the integrity but not all of the result. */
async function partlyVerified(variant: StubVariant, info: UpdateInfo, text: string, delivery: 'inline' | 'cdn'): Promise<string> {
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
  if (variant !== 'no-roundtrip' && back?.text !== text) throw new Error('The new version would change the text.');
  if (variant !== 'no-version-check' && back?.shell !== info.latest) throw new Error('The new version reports another version.');
  return html;
}

/** BUG (mutation) `accept-tampered` / `no-roundtrip` / `no-version-check`: an update that does not verify what the kit verifies. */
function unverifiedUpdate(variant: StubVariant): AppServices['performUpdate'] {
  return async (o: PerformUpdateOptions): Promise<PerformUpdateResult> => {
    const info = o.info!;
    const text = o.getText ? o.getText() : o.text!;
    const delivery = o.delivery ?? 'inline';
    let html: string;
    try {
      if (variant === 'accept-tampered') {
        // trusts whatever the CDN serves by fingerprinting the downloaded bytes itself
        const res = await fetch(bundleUrl(info.manifest), { credentials: 'omit' });
        const integrity = await sha384Integrity(new Uint8Array(await res.arrayBuffer()));
        html = await reassemble({ text, kind: 'md', release: { ...info.manifest, bundle: { ...info.manifest.bundle, integrity } }, delivery, ...(o.includes ? { includes: o.includes } : {}) });
      } else {
        html = await partlyVerified(variant, info, text, delivery);
      }
    } catch (e) {
      return { status: 'failed', info, code: 'bundle', error: String((e as Error)?.message ?? e) };
    }
    const save = await o.saver.save({ text, html });
    return { status: 'updated', info, html, text, save, reload: save.via === 'file' && save.ok && save.opened === true };
  };
}

/** BUG (mutation) `offer-prerelease` / `no-once-a-day` / `update-any-format`: a carrier's own update check. */
function ownCheck(variant: StubVariant, version: string): AppServices['checkForUpdate'] {
  return async (o) => {
    const key = 'orz-stub-checked';
    if (variant === 'offer-prerelease' && localStorage.getItem(key)) return null;
    if (variant === 'offer-prerelease') localStorage.setItem(key, '1');
    try {
      const res = await fetch(manifestUrl('md'), { credentials: 'omit', cache: 'no-cache' });
      const m = parseManifest(JSON.parse(await res.text()), 'md');
      if (!m || compareSemver(m.version, version) !== 1) return null;
      if (variant !== 'update-any-format' && !m.formats.includes(o.format ?? 1)) return null; // update-any-format: whatever text formats the release writes
      if (variant === 'no-once-a-day' && (parseSemver(m.version)?.prerelease.length ?? 1) > 0) return null;
      return { kind: 'md', current: version, latest: m.version, notes: m.notes, manifest: m };
    } catch {
      return null;
    }
  };
}

/** BUG (mutation) `update-in-frame` / `frame-silent-update`: a carrier's own check in a framed file (claiming to be a top-level file). */
function checkInFrame(app: CarrierApp, version: string, host: HostConnection | undefined): void {
  void checkForUpdate({ kind: 'md', current: version, format: app.file.format, ...(host ? { host } : {}), page: { location: { protocol: 'file:' } } }).then((info) => {
    const brand = app.root.querySelector('#orz-brand');
    if (info && brand) mountUpdateIndicator(brand as unknown as UiElement, info, { onUpdate: () => Promise.resolve() });
  });
}

/** The bugs of one variant (`good`: none). */
export function stubBugs(variant: StubVariant, version: string): StubBugs {
  const v = variant;
  const services: Partial<AppServices> = {};
  if (v === 'offer-prerelease' || v === 'no-once-a-day' || v === 'update-any-format') services.checkForUpdate = ownCheck(v, version);
  if (v === 'accept-tampered' || v === 'no-roundtrip' || v === 'no-version-check') services.performUpdate = unverifiedUpdate(v);
  if (v === 'update-download') services.performUpdate = (o) => performUpdate({ ...o, saver: { save: (x) => (o.saver as Saver).download({ html: x.html }) } }); // BUG (mutation): the update is always a downloaded copy
  if (v === 'update-stale-text') services.performUpdate = (o) => { const text = o.getText!(); const { getText: _g, ...rest } = o; void _g; return performUpdate({ ...rest, text }); }; // BUG (mutation): the text read once
  if (v === 'r3-reload-picked') services.performUpdate = async (o) => { const r = await performUpdate(o); return r.status === 'updated' && r.save.via === 'file' && r.save.ok ? { ...r, reload: true } : r; }; // BUG (mutation): reloads after any written file
  if (v === 'update-overwrites-conflict') {
    // BUG (mutation): the update answers a conflict itself, writing over the file that changed on disk
    services.performUpdate = (o) => performUpdate({ ...o, saver: { save: async (x) => { const r = await (o.saver as Saver).save(x); return r.via === 'file' && r.conflict ? (o.saver as Saver).save(x, { overwrite: true }) : r; } } });
  }
  if (v === 'cdn-to-inline') services.performUpdate = (o) => performUpdate({ ...o, delivery: 'inline' }); // BUG (mutation): a cdn file updates to an inline one
  if (v === 'update-drops-includes') services.performUpdate = (o) => { const { includes: _i, ...rest } = o; void _i; return performUpdate(rest); }; // BUG (mutation)
  if (v === 'any-source') {
    // BUG (mutation): the file side reads every message as if its parent had sent it
    services.connectHost = (o) => {
      const wrap = new Map<unknown, (e: MessageEvent) => void>();
      const win = {
        parent: window.parent,
        addEventListener: (t: string, l: (e: unknown) => void) => { const w = (e: MessageEvent) => l({ data: e.data, origin: e.origin, source: window.parent }); wrap.set(l, w); window.addEventListener(t as 'message', w); },
        removeEventListener: (t: string, l: unknown) => { const w = wrap.get(l); if (w) window.removeEventListener(t as 'message', w); },
      };
      return connectHost({ ...o, window: win as never });
    };
  }
  if (v === 'save-ignores-conflict') {
    // BUG (mutation): a conflict (the file changed on disk) is answered "replace" without asking the reader
    services.createSaver = (o) => {
      const base = createSaver(o);
      return { ...base, async save(input, call) { const r = await base.save(input, call); return r.via === 'file' && r.conflict ? base.save(input, { overwrite: true }) : r; } };
    };
  }
  if (v === 'silent-refusal') services.mountUpdateIndicator = (a, i, h, o) => mountUpdateIndicator(a, i, { ...h, onUpdate: (x) => Promise.resolve(h.onUpdate(x)).catch(() => undefined) }, o); // BUG (mutation): a refused update is swallowed
  if (v === 'steal-focus') {
    services.mountUpdateIndicator = (a, i, h, o) => {
      const ind = mountUpdateIndicator(a, i, h, o);
      (ind.root as unknown as ShadowRoot).querySelector('button')?.focus(); // BUG (mutation)
      return ind;
    };
  }
  return {
    shellVersion: (version) => (v === 'browser-shell-lie' ? '1.0.0' : version), // BUG (mutation): the browser bundle writes a stale shell version
    refused(text, error, version) {
      // BUG (mutation) browser-no-refusal: the browser bundle writes texts the Node assemble refuses
      if (v === 'browser-no-refusal') return Promise.resolve(`<!doctype html>\n<script type="application/json" id="orz-shell">{"kind":"md","format":1,"shell":"${version}","delivery":"inline"}</script>\n<script type="text/markdown" id="orz-src" data-orz-format="1" data-orz-eol="lf">${text}</script>\n`);
      return Promise.reject(error);
    },
    formats: v === 'formats-wrong' ? [1, 2] : [1], // BUG (mutation) formats-wrong: claims a format it refuses
    extract: v === 'extract-strip-bom'
      ? (html) => { const x = extract(html); return x && x.text.charCodeAt(0) === 0xfeff ? { ...x, text: x.text.slice(1) } : x; } // BUG (mutation)
      : extract,
    services,
    appHost: (declared) => declared && v !== 'ignore-hook-save', // BUG (mutation) ignore-hook-save: hooks.save ignored — the standalone save runs
    beforeMount({ appHost, current }) {
      if (v === 'port-without-secret') handPortToAnyReady(current); // BUG (mutation): installed before the editor's preview listens
      if (v === 'css-leak') {
        // BUG (mutation): the carrier's chrome stylesheet goes into the page, not a shadow root
        const st = document.createElement('style');
        st.textContent = 'body, button, input, p { font: 19px/1.2 Georgia, serif !important; color: #135 !important; } [data-orz-conformance] { outline: 3px solid red; }';
        document.head.appendChild(st);
      }
      void appHost;
    },
    editorInputs(input, { appHost, options, ctx, uid }) {
      const out: EditorShellOptions = { ...input };
      if (v === 'hook-save-lf' && appHost) out.hooks = { ...out.hooks, save: (t: string) => options.hooks!.save!(t.replace(/^﻿/, '').replace(/\r\n?/g, '\n')) }; // BUG (mutation): the app gets a normalised text
      if (v === 'readonly-ignored') delete out.readOnly; // BUG (mutation)
      if (v === 'shared-prefs') out.preferences = createPreferenceStore(undefined); // BUG (mutation): one namespace for every document
      if (!appHost) {
        if (v === 'live-dom') out.assemble = () => `<!doctype html>\n${document.documentElement.outerHTML}`; // BUG (mutation): serialises the live DOM
        if (v === 'prefs-in-file') {
          // BUG (mutation): the reader's view mode is baked into the saved file
          const plain = input.assemble!;
          out.assemble = async (t, o) => {
            const h = String(await plain(t, o));
            let m: string | null = null;
            try { m = localStorage.getItem(`orz-pref:${uid}:viewMode`); } catch { /* none */ }
            return m ? h.replace('<main id="orz-app" class="orz-view">', `<main id="orz-app" class="orz-view" data-view=${m}>`) : h;
          };
        }
        if (v === 'save-to-inline' && ctx) out.assemble = (t, o) => (globalThis as unknown as { OrzCarrier: { assemble(t: string, o: unknown): Promise<string> } }).OrzCarrier.assemble(t, { delivery: 'inline', ...(o?.includes ? { includes: o.includes } : {}) }); // BUG (mutation): a cdn file is saved inline (B#7)
        if (v === 'save-drops-includes') delete out.includes; // BUG (mutation)
        if (v === 'no-dirty-post' && ctx?.host) out.host = { ...ctx.host, setDirty() { /* BUG (mutation): dirty never posted */ } };
        if (v === 'name-handle') out.saver = nameProvedSaver(uid, location.href.replace(/[?#].*$/s, ''));
        if (v === 'copy-overwrite') out.saver = nameProvedSaver(uid, `file:///orz-stub/${pageFileName()}`); // BUG (mutation): every copy is told one page location
        if (v === 'download-fixed-name') { // BUG (mutation): ignores the opened file's name
          out.fileName = 'document.md.html';
          out.saver = createSaver({ ...(uid ? { uid } : {}), suggestedName: 'document.md.html', kind: 'md', ...(ctx?.host ? { host: ctx.host } : {}), ...(ctx?.openedHtml ? { openedHtml: ctx.openedHtml } : {}) });
        }
      }
      return out;
    },
    editor(shell, { appHost, element, options, current }) {
      if (v === 'r3-readonly-save-key' && appHost) {
        // BUG (mutation) r3: the carrier's own Cmd/Ctrl+S handler saves through the app hook even when read-only
        element.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void options.hooks!.save!(shell.getText()); } }, true);
      }
      const sameOrigin = (): void => {
        const f = (shell.root as unknown as ShadowRoot).querySelector('iframe');
        if (f) { f.setAttribute('sandbox', 'allow-scripts allow-same-origin'); f.srcdoc = f.srcdoc; }
      };
      if (v === 'preview-same-origin') sameOrigin(); // BUG (mutation): the preview frame gets the page's origin
      if (v === 'standalone-same-origin' && !appHost) sameOrigin(); // BUG (mutation): a standalone file served over http gives its preview the page's origin
      if (v === 'indicator-in-app' && appHost) {
        // BUG (mutation): the editor in an app host runs the quiet update check and shows the indicator
        void checkForUpdate({ kind: 'md', current: '0.0.1', servedPages: true, page: { location: { protocol: 'file:' } } } as never).then((info) => {
          if (info) mountUpdateIndicator(element as unknown as UiElement, info, { onUpdate: () => Promise.resolve() });
        });
      }
      if (v === 'global-mode-key') {
        try { const g = localStorage.getItem('orz-stub-mode'); if (g) shell.setMode(g as 'split'); } catch { /* none */ }
      }
      if (v === 'prefs-in-text') {
        // BUG (mutation): the reader's view mode is kept in the document's header (and the edit hidden from dirty)
        const setMode = shell.setMode.bind(shell);
        shell.setMode = (m) => { setMode(m); shell.setHeader({ x_view_mode: m }); shell.markSaved(); };
      }
      if (v === 'r3-ungated-view-key') {
        // BUG (mutation) r3: the preview's view key acts without the reader's gesture (a window message)
        window.addEventListener('message', (e) => { const d = e.data as { type?: string; key?: string } | null; if (d?.type === 'orz-preview-key' && d.key === '\\') shell.setMode(shell.getMode() === 'split' ? 'editor' : 'split'); });
      }
      if (v === 'ungated-keys') {
        // BUG (mutation): the preview's key and link messages act without the reader's gesture
        window.addEventListener('message', (e) => {
          const d = e.data as { type?: string; key?: string; href?: string } | null;
          if (d?.type === 'orz-preview-key' && d.key === 's') void shell.save();
          if (d?.type === 'orz-preview-link' && typeof d.href === 'string') window.open(d.href, '_blank');
        });
      }
      if (['crlf-after-edit', 'setheader-two-steps', 'shared-undo', 'global-mode-key', 'r3-hook-markSaved', 'r3-readonly-stuck'].includes(v)) {
        const out = Object.create(shell) as EditorShell & Record<string, unknown>;
        if (v === 'crlf-after-edit') out.getText = () => { const t = shell.getText(); return shell.isDirty() ? t.replace(/\r\n/g, '\n') : t; }; // BUG (mutation)
        if (v === 'setheader-two-steps') out.setHeader = (ch) => { const [k] = Object.keys(ch); shell.setHeader({ [k]: ch[k] }); shell.setHeader(ch); }; // BUG (mutation): two undo steps
        if (v === 'shared-undo') out.undo = () => (current() ?? shell).undo(); // BUG (mutation): undo acts on the last mounted instance
        // BUG (mutation) r3-hook-markSaved: after a successful save the carrier marks whatever the editor holds as saved
        if (v === 'r3-hook-markSaved') out.save = async () => { const r = await shell.save(); if (r.ok) shell.markSaved(); return r; };
        if (v === 'global-mode-key') { // BUG (mutation): the view mode is one global key, and getMode is not exposed
          (out as Record<string, unknown>).getMode = undefined;
          out.setMode = (m) => { try { localStorage.setItem('orz-stub-mode', m); } catch { /* none */ } shell.setMode(m); };
        }
        if (v === 'r3-readonly-stuck') { // BUG (mutation) r3: read-only while updating, never given back
          let stuck = false;
          out.setReadOnly = (flag: boolean) => { if (flag) stuck = true; if (!flag && stuck) return; shell.setReadOnly(flag); };
        }
        return out;
      }
      return shell;
    },
    booted(app, version) {
      if (!app) return;
      // BUG (mutation) prefetch-bundle: the file fetches its release's bundle at boot, before the reader asked for an update
      if (v === 'prefetch-bundle') void fetch(bundleUrl({ kind: 'md', version, bundle: { path: STUB_BUNDLE_PATH, integrity: '' } }), { credentials: 'omit' }).catch(() => undefined);
      if (v === 'page-overwrites-conflict') {
        // BUG (mutation): the page's own save (no editor open) answers a conflict itself, writing over the file
        const save = app.save;
        app.save = async () => {
          const r = await save();
          if (!r.ok && r.conflict && !app.editor()) {
            const c = app.editorContext();
            const t = app.getText();
            const w = await c.saver!.save({ text: t, html: await c.assemble(t, c.includes ? { includes: c.includes } : undefined) }, { overwrite: true });
            return w.ok ? { ok: true, via: w.via === 'served-notice' ? 'download' : w.via } as never : r;
          }
          return r;
        };
      }
      const framed = window.parent !== window;
      if (!framed) return;
      if (v === 'note-when-hosted') {
        // BUG (mutation): an embedded file shows the served-page notice although its host saves it
        const note = document.createElement('div');
        note.id = 'orz-served-note';
        note.textContent = 'This page is served from the web, so it cannot be saved in place.';
        document.body.appendChild(note);
      }
      if (v === 'update-in-frame') checkInFrame(app, version, app.host); // BUG (mutation): claims to be a top-level file
      // BUG (mutation): a framed file whose parent never says hello decides it is standalone and checks for updates
      if (v === 'frame-silent-update') setTimeout(() => { if (!app.host?.connected()) checkInFrame(app, version, undefined); }, 1500);
    },
  };
}
