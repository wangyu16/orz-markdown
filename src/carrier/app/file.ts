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
 * - the file name (the page's last path segment when it names a file of this kind).
 */
import { readIslandFromDom } from '../read.js';
import { readHeader, UID_PATTERN } from '../header.js';
import { KIND_EXTENSIONS } from '../shell/protocol.js';
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

/** The opened file's name when the page's URL names a file of this kind, else `document` + the kind's extension. */
export function openedFileName(loc: { readonly pathname?: string } | undefined, kind: CarrierKindName): string {
  const ext = KIND_EXTENSIONS[kind];
  try {
    const last = decodeURIComponent((loc?.pathname ?? '').split('/').pop() ?? '');
    if (last.length > ext.length && last.endsWith(ext)) return last;
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
  return {
    text,
    ...(uid && UID_PATTERN.test(uid) ? { uid } : {}),
    format: f && /^[1-9][0-9]*$/.test(f) ? Number(f) : 1,
    delivery: shellDelivery(doc),
    ...(includes ? { includes } : {}),
    engine: engine || null,
    fileName: openedFileName(doc.defaultView?.location, kind),
  };
}
