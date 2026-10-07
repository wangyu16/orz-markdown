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
/**
 * Capture the running bundle's own script. Call once, synchronously, when the
 * bundle starts (`document.currentScript` is set only then).
 */
export declare function captureEngineSource(doc?: {
    readonly currentScript?: unknown;
} | null): EngineSource;
//# sourceMappingURL=engine-source.d.ts.map