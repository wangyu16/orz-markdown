/**
 * Document metadata for the orz-family self-contained formats.
 *
 * A `.md.html` / `.slides.html` / `.paged.html` travels alone — that is the
 * whole promise of the format. Until now it carried no author, no license and
 * no link home, so someone who downloaded one held a file that said nothing
 * about the terms under which they could reuse it.
 *
 * This module is the ONE place that knows how document metadata is written,
 * read and emitted. It lives in orz-markdown because that is the only package
 * all three tools already depend on; implementing it three times in three
 * copy-pasted `template.ts` files is how the brand SVG and chrome CSS drifted.
 *
 * Two channels, one precedence rule:
 *
 *   1. **In the source** — a `{{nyml kind: meta … }}` block. Travels with the
 *      markdown, survives every round-trip, and a lone author can type it. nyml
 *      blocks are non-visible, so nothing leaks into the reader's view.
 *   2. **Injected by a host** — the `metadata` build option.
 *
 * The **host wins, field by field**: a platform that knows the license
 * authoritatively must not be overridden by a stale block someone pasted in.
 * Fields the host leaves unset fall through to the source block.
 *
 * The builders emit `<meta>` / `<link rel="license">` tags plus a JSON island
 * into `<head>`. That placement is load-bearing: every tool's `serializeDoc()`
 * clones the whole `documentElement` and rewrites only the source island, so
 * head tags survive an in-file edit *and* a framework self-update. Metadata
 * written anywhere else would be silently dropped on save.
 */

import { scanNymlBlocks } from './nyml-blocks.js';

/** The `kind:` value that marks a metadata block. */
export const DOC_META_KIND = 'meta';

/** The id of the emitted JSON island (a host's reliable read-back channel). */
export const DOC_META_ISLAND_ID = 'orz-meta';

/** MIME type of the JSON island. Distinct from the `nyml-data` script. */
export const DOC_META_ISLAND_TYPE = 'application/orz-meta+json';

export interface DocLicense {
  /** SPDX identifier, e.g. `CC-BY-4.0`. */
  spdx?: string;
  /** Human label, e.g. `CC BY 4.0`. */
  name?: string;
  /** Canonical deed / legal-code URL. */
  url?: string;
}

/**
 * Format-agnostic. Deliberately not license-only: a general host injects more
 * than a license, and a field added here is available to all three tools at once.
 */
export interface DocMeta {
  title?: string;
  author?: string;
  description?: string;
  license?: DocLicense;
  /** Canonical URL of the document, or of the repository it lives in. */
  source?: string;
  /** ISO date of publication. */
  date?: string;
  keywords?: string[];
}

function isEmpty(meta: DocMeta): boolean {
  return (
    !meta.title &&
    !meta.author &&
    !meta.description &&
    !meta.source &&
    !meta.date &&
    !meta.license?.spdx &&
    !meta.license?.name &&
    !meta.license?.url &&
    !(meta.keywords && meta.keywords.length)
  );
}

/** Split `a, b , c` into `['a','b','c']`, dropping blanks. */
function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Read the FIRST `kind: meta` nyml block out of a source and remove it.
 *
 * Removal is not cosmetic. The nyml plugin renders every block to a
 * `<script type="application/json" id="nyml-data">` with a FIXED id — leaving a
 * meta block in the body would emit a second element with a duplicate id. And
 * metadata belongs in `<head>`, not in the rendered body.
 *
 * Returns the parsed metadata (empty when there is no such block) and the body
 * with the block spliced out. Any other nyml block is left untouched.
 */
export function extractDocMeta(source: string): { meta: DocMeta; body: string } {
  const block = scanNymlBlocks(source).find((b) => b.kind === DOC_META_KIND);
  if (!block) return { meta: {}, body: source };

  const f = block.fields;
  const license: DocLicense = {};
  if (f['license']) license.spdx = f['license'];
  if (f['license_name']) license.name = f['license_name'];
  // nyml keys are `[A-Za-z0-9_]+`, so `license-url` cannot be a key. Accept the
  // snake_case spelling the grammar actually permits.
  if (f['license_url']) license.url = f['license_url'];

  const meta: DocMeta = {};
  if (f['title']) meta.title = f['title'];
  if (f['author']) meta.author = f['author'];
  if (f['description']) meta.description = f['description'];
  if (f['source']) meta.source = f['source'];
  if (f['date']) meta.date = f['date'];
  if (f['keywords']) meta.keywords = splitList(f['keywords']);
  if (license.spdx || license.name || license.url) meta.license = license;

  // Splice the block out, then collapse the blank lines it leaves behind so a
  // leading meta block does not push the document down by two lines.
  const body = (source.slice(0, block.start) + source.slice(block.end)).replace(/^\s*\n+/, '');
  return { meta, body };
}

/**
 * Merge source-declared metadata with host-injected metadata. The HOST wins,
 * field by field; unset host fields fall through to the source.
 */
export function mergeDocMeta(fromSource: DocMeta, fromHost?: DocMeta): DocMeta {
  if (!fromHost) return fromSource;
  const license: DocLicense = {
    ...(fromSource.license ?? {}),
    ...(fromHost.license ?? {}),
  };
  const merged: DocMeta = {
    ...fromSource,
    ...Object.fromEntries(Object.entries(fromHost).filter(([, v]) => v !== undefined)),
  };
  if (license.spdx || license.name || license.url) merged.license = license;
  return merged;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * `<head>` tags for the metadata. Emitted by each tool's `buildHtml`.
 *
 * `<link rel="license">` is the machine-readable channel search engines and
 * reuse tooling look for. Nothing here asserts a copyright — a document under a
 * public-domain dedication (CC0) must not carry a "©" claim, and this function
 * therefore never emits one. A visible notice, if a tool ever adds one, has to
 * make that distinction itself.
 */
export function renderDocMetaHead(meta: DocMeta): string {
  if (isEmpty(meta)) return '';
  const tags: string[] = [];
  if (meta.author) tags.push(`<meta name="author" content="${escapeAttr(meta.author)}">`);
  if (meta.description) {
    tags.push(`<meta name="description" content="${escapeAttr(meta.description)}">`);
  }
  if (meta.keywords?.length) {
    tags.push(`<meta name="keywords" content="${escapeAttr(meta.keywords.join(', '))}">`);
  }
  if (meta.date) tags.push(`<meta name="dcterms.date" content="${escapeAttr(meta.date)}">`);
  if (meta.license?.url) {
    tags.push(`<link rel="license" href="${escapeAttr(meta.license.url)}">`);
  }
  if (meta.license?.spdx) {
    tags.push(`<meta name="dcterms.license" content="${escapeAttr(meta.license.spdx)}">`);
  }
  if (meta.source) tags.push(`<link rel="canonical" href="${escapeAttr(meta.source)}">`);
  return tags.join('\n');
}

/**
 * The full metadata as a JSON island, for a host or tool to read back.
 * `serializeDoc()` never touches it, so it survives in-file edits.
 */
export function renderDocMetaIsland(meta: DocMeta): string {
  if (isEmpty(meta)) return '';
  const json = JSON.stringify(meta, null, 2).replace(/<\/script>/gi, '<\\/script>');
  return `<script type="${DOC_META_ISLAND_TYPE}" id="${DOC_META_ISLAND_ID}">\n${json}\n</script>`;
}

/** Read the island back out of a built document (host-side helper). */
export function parseDocMetaIsland(html: string): DocMeta | null {
  const re = new RegExp(
    `<script[^>]*id="${DOC_META_ISLAND_ID}"[^>]*>([\\s\\S]*?)</script>`,
    'i',
  );
  const m = re.exec(html);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as DocMeta;
  } catch {
    return null;
  }
}
