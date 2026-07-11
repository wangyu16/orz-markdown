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
 *   1. **In the source** — a `{{nyml kind: meta … }}` block that a lone author
 *      can type. The builder consumes and removes it, then emits the normalized
 *      metadata into the generated document's `<head>`.
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
/** The `kind:` value that marks a metadata block. */
export declare const DOC_META_KIND = "meta";
/** The id of the emitted JSON island (a host's reliable read-back channel). */
export declare const DOC_META_ISLAND_ID = "orz-meta";
/** MIME type of the JSON island. Distinct from the `nyml-data` script. */
export declare const DOC_META_ISLAND_TYPE = "application/orz-meta+json";
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
    /**
     * A stable, opaque document identifier assigned by a host (e.g. Alembic's
     * permalink id). It rides in the JSON island, which `serializeDoc()` never
     * rewrites — so it survives in-file edits and travels with the file. A host
     * uses it to recognize a downloaded-then-re-uploaded document as the SAME
     * document (durable permalink) regardless of its filename or contents. Purely
     * additive: standalone files and hosts that don't set it are unaffected.
     */
    uid?: string;
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
export declare function extractDocMeta(source: string): {
    meta: DocMeta;
    body: string;
};
/**
 * Merge source-declared metadata with host-injected metadata. The HOST wins,
 * field by field; unset host fields fall through to the source.
 */
export declare function mergeDocMeta(fromSource: DocMeta, fromHost?: DocMeta): DocMeta;
/**
 * `<head>` tags for the metadata. Emitted by each tool's `buildHtml`.
 *
 * `<link rel="license">` is the machine-readable channel search engines and
 * reuse tooling look for. Nothing here asserts a copyright — a document under a
 * public-domain dedication (CC0) must not carry a "©" claim, and this function
 * therefore never emits one. A visible notice, if a tool ever adds one, has to
 * make that distinction itself.
 */
export declare function renderDocMetaHead(meta: DocMeta): string;
/**
 * The full metadata as a JSON island, for a host or tool to read back.
 * `serializeDoc()` never touches it, so it survives in-file edits.
 */
export declare function renderDocMetaIsland(meta: DocMeta): string;
/** Read the island back out of a built document (host-side helper). */
export declare function parseDocMetaIsland(html: string): DocMeta | null;
//# sourceMappingURL=doc-meta.d.ts.map