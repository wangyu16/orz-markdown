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

interface ScriptLike { readonly src?: string; readonly textContent?: string | null }

/**
 * Capture the running bundle's own script. Call once, synchronously, when the
 * bundle starts (`document.currentScript` is set only then).
 */
export function captureEngineSource(doc?: { readonly currentScript?: unknown } | null): EngineSource {
  let inline: string | null = null;
  let url: string | null = null;
  try {
    const d = doc ?? (globalThis as { document?: { currentScript?: unknown } }).document;
    const s = (d?.currentScript ?? null) as ScriptLike | null;
    if (s && typeof s.src === 'string' && s.src) url = s.src;
    else if (s && typeof s.textContent === 'string' && s.textContent) inline = s.textContent;
  } catch { /* no document (a worker) */ }
  let fetched: Promise<string> | null = null;
  return {
    inline,
    url,
    get(fallbackUrl: string): Promise<string> {
      if (inline !== null) return Promise.resolve(inline);
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
    },
  };
}
