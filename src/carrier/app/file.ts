/**
 * The opened file (spec/carrier-app.md §2): what the page knows about the
 * assembled file it was opened from — read from its own DOM at boot, never
 * from anything the document's content could forge after load (the
 * envelope's islands are written before any shell markup, FC-18 §8.1):
 *
 * - the text (`readIslandFromDom(#orz-src)`: exact, line endings and BOM
 *   restored) and its header facts (uid, format);
 * - the shell (`#orz-shell`): its delivery (kept by every save, B#7);
 * - the resolved includes (`#orz-includes`, D4: a page cannot resolve them again);
 * - the engine (`#orz-engine` without `src`: the inline bundle's exact text);
 * - the twin-link naming (`#orz-shell` `"links"`, FC-18 §8.2; 2.5.0);
 * - the file name (the page's last path segment when it names a file of this
 *   kind — or, 2.5.0, a page of this kind under the file's naming, given its
 *   dual name back).
 */
import { readIslandFromDom } from '../read.js';
import { readHeader, UID_PATTERN } from '../header.js';
import { KIND_EXTENSIONS } from '../shell/protocol.js';
import { readTwinNaming, textNameOf, twinFileName, type TwinNaming } from '../naming.js';
import type { AppDocument, AppElement, CarrierKindName, OpenedFile } from './types.js';

/** The source island, or null when the page is not an assembled file (an app page, the update sandbox). */
export function sourceIsland(doc: AppDocument): AppElement | null {
  const el = doc.getElementById('orz-src');
  return el && String(el.tagName).toUpperCase() === 'SCRIPT' && el.getAttribute('type') === 'text/markdown' ? el : null;
}

function islandJson(doc: AppDocument, id: string): unknown {
  const el = doc.getElementById(id);
  if (!el || String(el.tagName).toUpperCase() !== 'SCRIPT') return undefined;
  try { return JSON.parse(el.textContent ?? ''); } catch { return undefined; }
}

/** The file's delivery (`#orz-shell`); `inline` unless it says `cdn`. */
export function shellDelivery(doc: AppDocument): 'inline' | 'cdn' {
  const shell = islandJson(doc, 'orz-shell') as { delivery?: unknown } | undefined;
  return shell && typeof shell === 'object' && shell.delivery === 'cdn' ? 'cdn' : 'inline';
}

/** (2.5.0) The file's twin-link naming (`#orz-shell` `"links"`), as `extract` reads it: undefined for the family naming or an invalid value. */
export function shellTwinLinks(doc: AppDocument): TwinNaming | undefined {
  const shell = islandJson(doc, 'orz-shell') as { links?: unknown } | undefined;
  return (shell && typeof shell === 'object' && !Array.isArray(shell) ? readTwinNaming(shell.links) : null) ?? undefined;
}

/** `#orz-includes` read as `extract` reads it (string values of own keys only); undefined when empty or absent. */
export function shellIncludes(doc: AppDocument): Record<string, string> | undefined {
  const parsed = islandJson(doc, 'orz-includes');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === 'string') Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * The opened file's name when the page's URL names a file of this kind, else
 * `document` + the kind's extension. (2.5.0) With the file's twin-link
 * naming, a page published under that naming's name gets its dual name back
 * (`week1.html` with `{ md: '{stem}.html' }` → `week1.md.html`): a saved or
 * downloaded copy keeps a name that says its kind (FC-08).
 */
export function openedFileName(loc: { readonly pathname?: string } | undefined, kind: CarrierKindName, naming?: TwinNaming | null): string {
  const ext = KIND_EXTENSIONS[kind];
  try {
    const last = decodeURIComponent((loc?.pathname ?? '').split('/').pop() ?? '');
    if (last.length > ext.length && last.endsWith(ext)) return last;
    const text = naming ? textNameOf(last, kind, naming) : null;
    const dual = text ? twinFileName(text) : null;
    if (dual && dual.length > ext.length && dual.endsWith(ext)) return dual;
  } catch { /* a malformed path */ }
  return `document${ext}`;
}

/** The name a new copy of a file is offered under: `notes.md.html` → `notes copy.md.html`. */
export function copyName(fileName: string, kind: CarrierKindName): string {
  const ext = KIND_EXTENSIONS[kind];
  const base = fileName.endsWith(ext) ? fileName.slice(0, -ext.length) : fileName;
  return `${base} copy${ext}`;
}

/** Read the opened file from the page (null when the page is not an assembled file). */
export function readOpenedFile(doc: AppDocument, kind: CarrierKindName): OpenedFile | null {
  const island = sourceIsland(doc);
  if (!island) return null;
  const text = readIslandFromDom(island);
  const fields = readHeader(text)?.fields ?? {};
  const uid = fields['uid']?.trim();
  const f = fields['format']?.trim();
  const engineEl = doc.getElementById('orz-engine');
  const engine = engineEl && String(engineEl.tagName).toUpperCase() === 'SCRIPT' && !engineEl.hasAttribute('src') ? engineEl.textContent : null;
  const includes = shellIncludes(doc);
  const twinLinks = shellTwinLinks(doc);
  return {
    text,
    ...(uid && UID_PATTERN.test(uid) ? { uid } : {}),
    format: f && /^[1-9][0-9]*$/.test(f) ? Number(f) : 1,
    delivery: shellDelivery(doc),
    ...(includes ? { includes } : {}),
    engine: engine || null,
    fileName: openedFileName(doc.defaultView?.location, kind, twinLinks),
    ...(twinLinks ? { twinLinks } : {}),
  };
}
