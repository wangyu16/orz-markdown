import { type DocMeta } from '../doc-meta.js';
/** A raw-text element (`script`, `style`, `title`, `textarea`) of an HTML file. */
export interface RawElement {
    /** Its tag name, ASCII lower case. */
    name: string;
    /** The start tag's attribute text (after the name, before `>`). */
    attrs: string;
    /** Offset of its content. */
    start: number;
    /** Offset just past its content (the file's end when it is not closed). */
    end: number;
}
/**
 * The raw-text elements of an HTML file in document order (comments and other
 * raw-text content skipped). An element that is not closed runs to the end
 * of the file and ends the scan.
 */
export declare function rawElements(html: string): RawElement[];
/** An attribute's value in a start tag's attribute text (quoted or not; null when absent). */
export declare function rawAttr(attrs: string, name: string): string | null;
/** Whether a start tag's attribute text has the attribute (with or without a value). */
export declare function hasRawAttr(attrs: string, name: string): boolean;
/**
 * Decode the entities a writer or a browser's serializer puts in raw-text
 * content such as `<title>`: numeric references (a surrogate, zero or an
 * out-of-range one stays as written) and `&lt; &gt; &quot; &apos; &nbsp; &amp;`.
 */
export declare function decodeEntities(s: string): string;
/** The generator meta of a file's head (`<meta name="generator" content="…">` before `<body>`), or null. */
export declare function generatorOf(html: string): string | null;
/** How a carrier recognises its own 0.x files ({@link readLegacyIsland}). */
export interface LegacyWriter {
    /** The 0.x generator meta (`/^orz-paged(\s|$)/`, `/^orz-mdhtml$/`). */
    generator: RegExp;
    /** The 0.x config global (`__ORZ_PAGED__`, `__ORZ_MDHTML__`): a script `window.<name> = {…}`. */
    config: string;
    /**
     * (2.4.0) The 0.x source island: its element id (default `orz-src`) and
     * the `type` it should have (default `text/markdown`; another type is a
     * note). orz-slides 0.x wrote `{ id: 'orz-deck', type: 'text/orz-slides' }`.
     */
    island?: {
        id?: string;
        type?: string;
    };
}
/** What {@link readLegacyIsland} reads from a 0.x file. */
export interface LegacyIsland {
    /** The source: the island with `<\/script` restored to `</script`, without the writer's wrapping line breaks. */
    text: string;
    /** Whether the island had the 0.x writer's `\n…\n` wrapper (or `\r\n…\r\n`; otherwise its content is kept exactly). */
    wrapped: boolean;
    /** How many `<\/script` the island held (restored to `</script` in `text`). */
    scriptEscapes: number;
    /** The generator meta, if any. */
    generator: string | null;
    /**
     * The config object (`window.<config> = {…}` read as JSON): `{}` when the
     * file has no config script or it is not a JSON object (see `configError`).
     */
    config: Record<string, unknown>;
    /** True when a config script exists but is not readable JSON (the carrier says so in its own words; a JSON value that is not an object reads as `{}`). */
    configError: boolean;
    /** `inline` / `cdn` from the engine script (`data-orz-asset="engine"`), if found. */
    delivery: 'inline' | 'cdn' | null;
    /** The `<title>` text (entities decoded, trimmed), if any. */
    title: string | null;
    /** DocMeta from `#orz-meta` in the head, if any. */
    meta: DocMeta | null;
    /**
     * Things found but not understood, in the words both carriers use: the
     * island lacks the wrapper; its `type` is not `text/markdown`.
     */
    notes: string[];
    /** The file's raw-text elements (for a carrier's own reads). */
    elements: RawElement[];
}
/**
 * Read the source island of a carrier's legacy 0.x file; `null` when `html`
 * is not one of `writer`'s 0.x files (no `#orz-src` island — or the
 * writer's `island.id` — a format-1
 * `#orz-shell`, or neither the writer's generator nor its config script).
 */
export declare function readLegacyIsland(html: string, writer: LegacyWriter): LegacyIsland | null;
//# sourceMappingURL=legacy.d.ts.map