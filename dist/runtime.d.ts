export declare const browserRuntimeScript: string;
export interface BrowserRuntimeOptions {
    /**
     * Run `init(document)` when the DOM is ready: QR codes expand on click and
     * tab bars are built. Default `true`. With `false` only the global handlers
     * are installed — copy-as-Markdown works, nothing is rewired — for outputs
     * that flatten tabs and QR on purpose (orz-poster's print master). A host can
     * still call `OrzMarkdownRuntime.init(root)` itself.
     */
    autoInit?: boolean;
}
export declare function getBrowserRuntimeScript(options?: BrowserRuntimeOptions): string;
//# sourceMappingURL=runtime.d.ts.map