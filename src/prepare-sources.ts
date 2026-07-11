/**
 * Pre-processes a markdown source string by resolving URL-based markdown
 * includes BEFORE rendering. markdown-it rendering is synchronous, so a URL
 * fetch cannot happen inside a render rule; this async pre-pass inlines the
 * referenced markdown up front, and the result renders normally.
 *
 * Directive syntax (anywhere in the source):
 *
 *     {{markdown https://host/path.md}}
 *     {{md-include https://host/path.md}}
 *
 * Each directive is replaced by the fetched markdown (which may itself contain
 * includes — resolved recursively up to `maxDepth`, with an ancestor-chain
 * cycle guard). A directive whose fetch fails or whose host is not allowed is
 * LEFT IN PLACE (unresolved, never a hard error).
 *
 * The network transport is INJECTABLE (`opts.fetcher`) and can be restricted to
 * an allowlist of hosts (`opts.allowedHosts`) — important when resolving
 * host-authored content server-side, where an unrestricted fetch is an SSRF
 * vector. With no options it behaves as before: the global `fetch`, any host.
 */

export interface PrepareSourcesOptions {
  /**
   * Fetch a URL's markdown text. Injectable so a host controls transport and
   * auth; defaults to the global `fetch`. Return `null` to leave the directive
   * unresolved (e.g. a non-200, or a URL the host declines).
   */
  fetcher?: (url: string) => Promise<string | null>;
  /**
   * If non-empty, ONLY URLs whose host is in this list are fetched; any other
   * directive is left in place. Case-insensitive exact host match (host =
   * `example.com` or `example.com:8443`). The SSRF guard for server-side use.
   */
  allowedHosts?: string[];
  /** Max recursion depth for includes that themselves include (default 3). */
  maxDepth?: number;
}

const DIRECTIVE = /\{\{(?:markdown|md-include)\s+(https?:\/\/[^\s}]+)\}\}/g;

async function defaultFetcher(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function hostAllowed(url: string, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  let host: string;
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    return false;
  }
  return allowed.some((a) => a.toLowerCase() === host);
}

export async function prepareSources(
  src: string,
  opts: PrepareSourcesOptions = {},
): Promise<string> {
  const fetcher = opts.fetcher ?? defaultFetcher;
  const maxDepth = opts.maxDepth ?? 3;

  // Splice by match index (never String.replace, whose replacement string
  // treats `$` specially — fetched markdown containing `$&`/`$1` would corrupt).
  async function resolve(text: string, depth: number, ancestors: Set<string>): Promise<string> {
    const matches = [...text.matchAll(DIRECTIVE)];
    if (matches.length === 0) return text;

    let out = "";
    let last = 0;
    for (const m of matches) {
      const full = m[0];
      const url = m[1];
      const idx = m.index ?? 0;
      out += text.slice(last, idx);
      last = idx + full.length;

      if (!hostAllowed(url, opts.allowedHosts)) {
        out += full; // not allowed → leave the directive untouched
        continue;
      }
      if (ancestors.has(url)) {
        // Cycle (this URL is already being included up the chain) → drop it.
        continue;
      }
      const fetched = await fetcher(url);
      if (fetched == null) {
        out += full; // fetch failed → leave in place, never throw
        continue;
      }
      out +=
        depth < maxDepth
          ? await resolve(fetched, depth + 1, new Set(ancestors).add(url))
          : fetched;
    }
    out += text.slice(last);
    return out;
  }

  return resolve(src, 0, new Set());
}
