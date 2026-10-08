/**
 * The exact text of a carrier's browser bundle, which an inline assembly
 * (FC-19 §2 `engineSource`) writes into `<script id="orz-engine">`
 * (spec/carrier-app.md §6).
 *
 * - Inline (an inline-delivery file, the update sandbox): the bundle's own
 *   `<script>` text, captured when the bundle starts (`captureEngineSource`,
 *   called synchronously by the bundle's entry; the update sandbox inlines
 *   the verified bundle with nothing after it, U.6, so it is exact).
 * - Loaded by URL (a cdn-delivery file, an app's `<script src>`): fetched
 *   once from that URL, else from the release's jsDelivr URL — the same
 *   bytes — and required to be script-safe (the bundle rule).
 * - ESM (an app bundled it): fetched from the release's jsDelivr URL.
 *
 * Only the CARRIER'S bundle is taken (2.2.0, round 1): a script loaded by URL
 * counts when its file name is the bundle's (`bundle`, default any
 * `orz-<x>.browser.js`), an inline one when it is the file's `#orz-engine` or
 * the update sandbox's bundle — an app's own script that bundles the IIFE
 * (`app.js`, an inline app script) is not the engine, and the release's
 * jsDelivr URL is used instead. With `integrity` (the release's, when known)
 * an inline text must also match it.
 *
 * No state at module load: each capture is its own object.
 */
import { isScriptSafe } from '../shell/update.js';

export interface EngineSource {
  /** The bundle text when it runs inline (known at once), else null. */
  readonly inline: string | null;
  /** The URL the bundle was loaded from, else null. */
  readonly url: string | null;
  /**
   * The bundle's exact text: inline at once, else fetched (from `url`, else
   * `fallbackUrl`) once. Rejects when it cannot be had or is not script-safe.
   */
  get(fallbackUrl: string): Promise<string>;
}

interface ScriptLike { readonly src?: string; readonly textContent?: string | null; readonly id?: string }
interface DocLike { readonly currentScript?: unknown; readonly title?: string; getElementById?(id: string): unknown }

export interface CaptureOptions {
  /** The bundle's file name (`release.json` `bundle.path`'s last segment, e.g. `orz-mdhtml.browser.js`). Default: any `orz-<x>.browser.js`. */
  bundle?: string;
  /** The release's bundle integrity (`sha384-…`), when known: an inline text must match it. */
  integrity?: string;
}

const DEFAULT_BUNDLE = /^orz-[a-z0-9-]+\.browser\.js$/;

/** The last path segment of a URL, decoded (no query or fragment). */
function fileNameOf(url: string): string {
  const path = url.replace(/[?#].*$/s, '');
  const last = path.slice(path.lastIndexOf('/') + 1);
  try { return decodeURIComponent(last); } catch { return last; }
}

/** SHA-384 of a text's UTF-8 bytes as an SRI value, or null without SubtleCrypto. */
async function sriOf(text: string): Promise<string | null> {
  try {
    const g = globalThis as { crypto?: { subtle?: { digest(a: string, d: Uint8Array): Promise<ArrayBuffer> } }; TextEncoder?: new () => { encode(s: string): Uint8Array }; btoa?(s: string): string };
    if (!g.crypto?.subtle || !g.TextEncoder || !g.btoa) return null;
    const d = new Uint8Array(await g.crypto.subtle.digest('SHA-384', new g.TextEncoder().encode(text)));
    let bin = '';
    for (const b of d) bin += String.fromCharCode(b);
    return `sha384-${g.btoa(bin)}`;
  } catch {
    return null;
  }
}

/**
 * Capture the running bundle's own script. Call once, synchronously, when the
 * bundle starts (`document.currentScript` is set only then).
 */
export function captureEngineSource(doc?: DocLike | null, options: CaptureOptions = {}): EngineSource {
  let inline: string | null = null;
  let url: string | null = null;
  const isBundleName = (name: string): boolean => (options.bundle ? name === options.bundle : DEFAULT_BUNDLE.test(name));
  try {
    const d = doc ?? (globalThis as { document?: DocLike }).document;
    const s = (d?.currentScript ?? null) as ScriptLike | null;
    if (s && typeof s.src === 'string' && s.src) {
      if (isBundleName(fileNameOf(s.src))) url = s.src;
    } else if (s && typeof s.textContent === 'string' && s.textContent) {
      // the file's engine, or the update sandbox's bundle (a page with no island, `sandboxDocument`)
      const sandbox = d?.title === 'orz update' && !(typeof d.getElementById === 'function' && d.getElementById('orz-src'));
      if (s.id === 'orz-engine' || sandbox) inline = s.textContent;
    }
  } catch { /* no document (a worker) */ }
  let fetched: Promise<string> | null = null;
  let checked: Promise<string | null> | null = null;
  /** The inline text when it is the bundle (matching `integrity` when given), else null. */
  const inlineChecked = (): Promise<string | null> => (checked ??= (async () => {
    if (inline === null) return null;
    if (!options.integrity) return inline;
    const sri = await sriOf(inline);
    return sri !== null && sri === options.integrity ? inline : null;
  })());
  return {
    inline,
    url,
    async get(fallbackUrl: string): Promise<string> {
      const own = await inlineChecked();
      if (own !== null) return own;
      return fetchOnce(fallbackUrl);
    },
  };
  function fetchOnce(fallbackUrl: string): Promise<string> {
    {
      fetched ??= (async () => {
        const urls = [...new Set([url, fallbackUrl].filter((u): u is string => !!u))];
        let last: unknown = null;
        const fetchFn = (globalThis as { fetch?: (u: string, o?: unknown) => Promise<{ ok: boolean; status: number; text(): Promise<string> }> }).fetch;
        for (const u of urls) {
          try {
            if (typeof fetchFn !== 'function') throw new Error('no fetch');
            const res = await fetchFn(u, { credentials: 'omit' });
            if (!res.ok) throw new Error(`HTTP ${res.status} for ${u}`);
            const text = await res.text();
            if (!isScriptSafe(text)) throw new Error(`the engine at ${u} is not script-safe`);
            return text;
          } catch (e) {
            last = e;
          }
        }
        throw new Error(`orz carrier: the engine source for an inline file could not be loaded (${last instanceof Error ? last.message : String(last)}); pass engineSource or assemble with delivery "cdn"`);
      })();
      fetched.catch(() => { fetched = null; });
      return fetched;
    }
  }
}
