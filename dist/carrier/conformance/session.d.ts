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
/**
 * The pinned CodeMirror 6 bundle's jsDelivr URL (the editor's
 * `CODEMIRROR6_URL`): answered inside the closed network from this package's
 * own `vendor/codemirror6.js`, so the edit checks run with CodeMirror loaded.
 */
export declare const CODEMIRROR_URL = "https://cdn.jsdelivr.net/npm/orz-markdown@2.6.0/vendor/codemirror6.js";
/**
 * Chrome refuses the origin-private file system on `file:` pages unless it was
 * launched with this flag; the `opfs` picker (real handles for
 * `C.save.copy-elsewhere`) needs it. The harness's own browser has it; for a
 * browser passed in without it, that check launches one of its own.
 */
export declare const FILE_ACCESS_FLAG = "--allow-file-access-from-files";
export interface CdnPlan {
    /** The release whose manifest answers `<pkg>-browser@latest/release.json` (none: the manifest request fails — offline). Its bundle URL is answered first. */
    latest?: Release;
    /** Serve `latest`'s bundle with one byte more than its integrity covers. */
    tamper?: boolean;
    /** Hold the manifest response until this resolves. */
    hold?: Promise<void>;
    /** Hold every bundle response until this resolves (an update that is still downloading). */
    holdBundle?: Promise<void>;
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
    /**
     * Run `action` (a reload, a navigation) on a page the check means to leave
     * while it is clean (2.2.0, spec/conformance.md §3): a `beforeunload`
     * confirmation it raises meanwhile is accepted, so the navigation goes on
     * (it is still recorded as a dialog, which the check's "no dialog"
     * expectations report). Everywhere else a dialog is dismissed — a dismissed
     * `beforeunload` keeps the page.
     */
    leave<T>(page: Page, action: () => Promise<T>): Promise<T>;
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
    private fileBrowser;
    private ownsFileBrowser;
    private servers;
    private files;
    private tmp;
    private contexts;
    /** chromeAssemble's page per release, within a scope. */
    private assemblers;
    private memo;
    private codemirror;
    /** `file:` URL → its path on disk (writeFile / rewriteFile). */
    private paths;
    /** The session itself (a scope's `root`). */
    private root;
    private constructor();
    static open(target: CarrierTarget, options: ConformanceOptions, needsBrowser: boolean): Promise<Session>;
    private listen;
    /** Serve an assembled file from the file origin; returns its URL. */
    serve(name: string, html: string): string;
    /** Write an assembled file to the temporary directory; returns its `file:` URL. */
    writeFile(name: string, html: string): string;
    /** Replace the bytes of a file made by {@link writeFile} (what a save into it wrote): the next open of its URL reads them. */
    rewriteFile(url: string, html: string): void;
    /**
     * A view of the session for one check: everything is shared (servers,
     * files, memoised assemblies, the browser) except the contexts it opens
     * (and their pages), which {@link closeContexts} closes when the check ends.
     */
    scope(): Session;
    /**
     * A release made from another: `append` is added to its bundle (a re-signed
     * build of it), `version` replaces the manifest's version, `formats` its
     * text formats; the manifest's integrity is recomputed, so the bytes match
     * what it announces.
     */
    derive(base: Release, o: {
        version?: string;
        append?: string;
        formats?: number[];
    }): Release;
    /** The target's Node `assemble`, memoised per text and options. */
    assemble(text: string, o?: AssembleOptions): Promise<string>;
    /**
     * A request for this kind's release bundle: any file of `<pkg>-browser@<any
     * version>/` but the manifest (`@latest/release.json`). The update checks
     * count these — a file may fetch other resources (its theme, fonts, preview
     * libraries: spec/conformance.md §3) but no bundle before the reader asks
     * for the update (2.2.0; before, every request but the manifest counted).
     */
    isBundleRequest(url: string): boolean;
    /** The URL patterns of the jsDelivr routes for this kind. */
    private cdnUrls;
    /** A fresh browser context for one check: recorded dialogs, errors, picker writes, downloads and requests; closed network. */
    context(o: {
        picker: PickerMode;
        cdn?: CdnPlan;
        codemirror?: boolean;
    }): Promise<CheckContext>;
    /** A browser whose `file:` pages have the origin-private file system ({@link FILE_ACCESS_FLAG}). */
    private browserForFiles;
    private fileBrowserPromise;
    private fileBrowserOf;
    private launchFileBrowser;
    /** This package's `vendor/codemirror6.js` (null when it is not shipped). */
    private codemirrorBytes;
    /** Close the contexts this scope opened. */
    closeContexts(): Promise<void>;
    /** A page of the harness origin that loaded a release's bundle by URL (one per release within a scope). */
    bundlePage(r: Release): Promise<Page>;
    /** `assemble` of a release's bundle, run in Chrome (inline: with its own text as engineSource); `hash`: `sha256:<hex>` of each file instead of the file. */
    chromeAssemble(r: Release, texts: string[], delivery: 'inline' | 'cdn', hash?: boolean, includes?: Record<string, string>, twinLinks?: Record<string, string>): Promise<string[]>;
    close(): Promise<void>;
}
/** Evaluate a page-side function source with one JSON argument. */
export declare function call<T>(target: Pick<Page, 'evaluate'>, fnSource: string, arg?: unknown): Promise<T>;
export {};
//# sourceMappingURL=session.d.ts.map