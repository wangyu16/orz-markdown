import { type PickerMode } from './page.js';
import type { AssembleOptions, BrowserLike, CarrierTarget, ConformanceOptions } from './types.js';
type BrowserContext = import('playwright-core').BrowserContext;
type Page = import('playwright-core').Page;
/** A release as the harness sees it. */
export interface Release {
    label: 'target' | 'next' | 'previous';
    bundleFile: string;
    /** The bundle bytes decoded (lossily when they are not UTF-8: C.bundle.script-safe reports that). */
    code: string;
    bytes: Uint8Array;
    /** release.json as parsed JSON (null when it does not parse). */
    manifest: Record<string, unknown> | null;
    manifestText: string;
    version: string;
    /** `bundle.path` of the manifest (else the file's name). */
    bundlePath: string;
}
export interface Record_ {
    type: string;
    data: unknown;
    url: string;
}
export interface CdnPlan {
    /** The release whose manifest answers `<pkg>-browser@latest/release.json` (none: the manifest request fails — offline). */
    latest?: Release;
    /** Serve `latest`'s bundle with one byte more than its integrity covers. */
    tamper?: boolean;
    /** Hold the manifest response until this resolves. */
    hold?: Promise<void>;
}
export interface CheckContext {
    context: BrowserContext;
    records: Record_[];
    requests: string[];
    downloads: Array<{
        name: string;
        data: string;
    }>;
    newPage(): Promise<Page>;
    of(type: string): Record_[];
}
export declare class Session {
    readonly target: CarrierTarget;
    readonly options: ConformanceOptions;
    readonly releases: {
        target: Release;
        next?: Release;
        previous?: Release;
    };
    browser: BrowserLike | null;
    browserError: string;
    hostOrigin: string;
    fileOrigin: string;
    private ownsBrowser;
    private servers;
    private files;
    private tmp;
    private contexts;
    private memo;
    private constructor();
    static open(target: CarrierTarget, options: ConformanceOptions, needsBrowser: boolean): Promise<Session>;
    private listen;
    /** Serve an assembled file from the file origin; returns its URL. */
    serve(name: string, html: string): string;
    /** Write an assembled file to the temporary directory; returns its `file:` URL. */
    writeFile(name: string, html: string): string;
    /** The target's Node `assemble`, memoised per text and options. */
    assemble(text: string, o?: AssembleOptions): Promise<string>;
    /** The URL patterns of the jsDelivr routes for this kind. */
    private cdnUrls;
    /** A fresh browser context for one check: recorded dialogs, errors, picker writes, downloads and requests; closed network. */
    context(o: {
        picker: PickerMode;
        cdn?: CdnPlan;
    }): Promise<CheckContext>;
    /** Close the contexts a check opened. */
    closeContexts(): Promise<void>;
    /** `assemble` of a release's bundle, run in Chrome (inline: with its own text as engineSource); `hash`: `sha256:<hex>` of each file instead of the file. */
    chromeAssemble(r: Release, texts: string[], delivery: 'inline' | 'cdn', hash?: boolean): Promise<string[]>;
    close(): Promise<void>;
}
/** Evaluate a page-side function source with one JSON argument. */
export declare function call<T>(target: Pick<Page, 'evaluate'>, fnSource: string, arg?: unknown): Promise<T>;
export {};
//# sourceMappingURL=session.d.ts.map