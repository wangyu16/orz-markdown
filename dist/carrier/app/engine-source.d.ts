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
interface DocLike {
    readonly currentScript?: unknown;
    readonly title?: string;
    getElementById?(id: string): unknown;
}
export interface CaptureOptions {
    /** The bundle's file name (`release.json` `bundle.path`'s last segment, e.g. `orz-mdhtml.browser.js`). Default: any `orz-<x>.browser.js`. */
    bundle?: string;
    /** The release's bundle integrity (`sha384-…`), when known: an inline text must match it. */
    integrity?: string;
}
/**
 * Capture the running bundle's own script. Call once, synchronously, when the
 * bundle starts (`document.currentScript` is set only then).
 */
export declare function captureEngineSource(doc?: DocLike | null, options?: CaptureOptions): EngineSource;
export {};
//# sourceMappingURL=engine-source.d.ts.map