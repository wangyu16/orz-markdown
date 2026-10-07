import type { SaveResult, Saver } from './save.js';
import { type MessageWindow, type PostTarget, type StorageLike, type UiDocument, type UiElement } from './types.js';
/** The kinds that publish releases (FC-17 minus poster, which never self-updates: RULES §9). */
export type ReleaseKind = 'md' | 'slides' | 'paged';
export declare const RELEASE_KINDS: readonly ReleaseKind[];
/** `release.json` at the root of every `orz-<x>-browser` package (spec/shell-runtime.md §6). */
export interface ReleaseManifest {
    kind: ReleaseKind;
    /** The release's version: semver, the carrier's version (FC-19 §7). */
    version: string;
    /** The text formats this release reads and writes (FC-18). */
    formats: number[];
    /** An `https:` link to the release notes; `''` when the manifest has none (or not https). */
    notes: string;
    bundle: {
        /** Relative path of the browser bundle inside the package (no `..`, no scheme, no query). */
        path: string;
        /** Subresource-integrity string of the bundle's bytes: `sha384-<base64>`. */
        integrity: string;
    };
}
/** What {@link checkForUpdate} offers. */
export interface UpdateInfo {
    kind: ReleaseKind;
    current: string;
    latest: string;
    notes: string;
    manifest: ReleaseManifest;
}
/** The default CDN base (jsDelivr's npm mirror). */
export declare const RELEASE_CDN_BASE = "https://cdn.jsdelivr.net/npm/";
/** At most one network check per kind in this interval. */
export declare const UPDATE_CHECK_INTERVAL_MS: number;
/** A manifest request that takes longer is abandoned (silently). */
export declare const MANIFEST_TIMEOUT_MS = 10000;
/** Manifests larger than this are ignored. */
export declare const MAX_MANIFEST_BYTES: number;
/** Default time the sandboxed re-assembly may take. */
export declare const REASSEMBLE_TIMEOUT_MS = 30000;
/** Bundles larger than this are refused. */
export declare const MAX_BUNDLE_BYTES: number;
/** localStorage keys: the last check per kind, and the skipped version per kind. */
export declare const UPDATE_CACHE_PREFIX = "orz-update:";
export declare const UPDATE_SKIP_PREFIX = "orz-update-skip:";
export interface Semver {
    major: string;
    minor: string;
    patch: string;
    /** Prerelease identifiers (empty for a release). */
    prerelease: string[];
}
/** Parse a semver 2.0.0 version (no `v` prefix, no leading zeros); null when invalid. */
export declare function parseSemver(version: unknown): Semver | null;
/**
 * Semver 2.0.0 precedence: -1, 0 or 1 (build metadata ignored); null when
 * either is not a valid version.
 */
export declare function compareSemver(a: string, b: string): -1 | 0 | 1 | null;
/** The browser package of a kind: `orz-mdhtml-browser`, `orz-slides-browser`, `orz-paged-browser`. */
export declare function browserPackage(kind: ReleaseKind): string;
/** The release manifest URL of a kind: `https://cdn.jsdelivr.net/npm/<pkg>-browser@latest/release.json`. */
export declare function manifestUrl(kind: ReleaseKind, cdnBase?: string): string;
/** True for a plain relative path inside a package: segments of `[A-Za-z0-9._-]`, none `.` or `..`, no scheme, query, fragment, backslash or leading `/`. */
export declare function isBundlePath(path: unknown): path is string;
/** The bundle URL of a release: `https://cdn.jsdelivr.net/npm/<pkg>-browser@<version>/<path>`. Throws for an invalid version or path. */
export declare function bundleUrl(release: Pick<ReleaseManifest, 'kind' | 'version' | 'bundle'>, cdnBase?: string): string;
/**
 * Validate a parsed `release.json` for `kind`; null when anything required is
 * missing or malformed (unknown fields are ignored; a notes link that is not
 * `https:` is dropped).
 */
export declare function parseManifest(raw: unknown, kind: ReleaseKind): ReleaseManifest | null;
/** The part of `Response` the update uses. */
export interface ResponseLike {
    readonly ok: boolean;
    readonly status: number;
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
}
export type FetchLike = (url: string, init?: {
    credentials?: 'omit';
    cache?: 'no-cache' | 'default';
    redirect?: 'follow' | 'error';
}) => Promise<ResponseLike>;
/** Record "skip this version": that version (and anything not newer) is no longer offered for this kind. `false` when storage refuses. */
export declare function skipVersion(kind: ReleaseKind, version: string, storage?: StorageLike): boolean;
/** The skipped version of a kind, or null. */
export declare function skippedVersion(kind: ReleaseKind, storage?: StorageLike): string | null;
export interface CheckOptions {
    kind: ReleaseKind;
    /** The running shell's version (`#orz-shell` `shell`). */
    current: string;
    /** The document's text format (FC-18 header `format`); only releases that list it are offered. Default 1. */
    format?: number;
    fetch?: FetchLike;
    /** The current time in ms (default `Date.now()`). */
    now?: number;
    /** Where the last check and the skipped version live (default `localStorage`). */
    storage?: StorageLike;
    /** Test/carrier override of the CDN base; never taken from a document. */
    cdnBase?: string;
    /**
     * The file's host connection (`connectHost`). While a host is connected the
     * app owns the component version: nothing is checked (spec/shell-runtime.md §7.1).
     */
    host?: {
        connected(): boolean;
    };
    /**
     * The page the check runs for (default: the global window). A framed page
     * (`parent !== page`: embedded by an app host, connected or not yet) is
     * never checked, and a served page (`http:`/`https:`) only with
     * `servedPages: true`.
     */
    page?: {
        readonly location?: {
            readonly protocol?: string;
        };
        readonly parent?: unknown;
    };
    /**
     * Check on a served page too. Default `false`: a reader of a published page
     * cannot save over it (shell-runtime §1 step 2), so no update is offered.
     */
    servedPages?: boolean;
}
/**
 * Is a newer release of this kind available for this document? Never on a
 * page embedded in a frame or with a connected host (the app owns the
 * version), nor on a served page unless `servedPages`. At most one
 * network request per kind per {@link UPDATE_CHECK_INTERVAL_MS} (the last
 * check — success or failure — is recorded in storage; within the interval
 * the recorded manifest is used); without usable storage nothing is fetched.
 * Never rejects: offline, a bad response or a bad manifest resolve `null`.
 * Offers only a stable release newer than `current` (semver precedence)
 * whose `formats` include the document's format and that is newer than a
 * skipped version.
 */
export declare function checkForUpdate(opts: CheckOptions): Promise<UpdateInfo | null>;
export type UpdateErrorCode = 'manifest' | 'download' | 'too-large' | 'integrity' | 'no-crypto' | 'encoding' | 'unsafe-bundle' | 'no-document' | 'timeout' | 'bundle' | 'roundtrip' | 'kind' | 'version' | 'delivery'
/** The new file does not carry exactly the given resolved includes (`#orz-includes`, FC-18 §8.3 D4). */
 | 'includes'
/** performUpdate: the text changed while the update ran (nothing was saved). */
 | 'changed'
/** performUpdate: the page is framed or has a connected host, which owns the version. */
 | 'hosted';
/** Why a re-assembly was refused. Nothing was changed when one is thrown. */
export declare class UpdateError extends Error {
    readonly code: UpdateErrorCode;
    constructor(code: UpdateErrorCode, message: string);
}
/** The `sha384-<base64>` integrity string of some bytes (SubtleCrypto). */
export declare function sha384Integrity(bytes: Uint8Array | ArrayBuffer): Promise<string>;
/**
 * True when the bundle can be inlined in a `<script>` exactly: the project's
 * script escaping (`escapeScriptText`) leaves it unchanged, i.e. it holds no
 * `<script` or `</script` (any case, after any backslashes), and it holds no
 * CR (an HTML parser rewrites CR in a `<script>`, so the inlined bytes would
 * no longer match the integrity). A carrier's
 * release build writes such sequences as `\x3Cscript` (spec/shell-runtime.md
 * §6); a bundle that needs escaping is refused, because escaping code changes
 * what runs.
 */
export declare function isScriptSafe(code: string): boolean;
/** The srcdoc of the sandbox: the bundle (escaped; script-safe bundles are unchanged) and the listener. */
export declare function sandboxDocument(bundle: string): string;
/** The iframe the re-assembly runs in. */
export interface SandboxFrameLike extends UiElement {
    srcdoc: string;
    readonly contentWindow: PostTarget | null;
}
export interface ReassembleOptions {
    /** The text to carry over, exact (the editor's current text, unsaved edits included). */
    text: string;
    kind: ReleaseKind;
    /** The release to assemble with (`UpdateInfo.manifest`). */
    release: ReleaseManifest;
    /** FC-18 §8.2: keep the file's delivery (`extract(currentHtml).delivery`). Default `inline`. */
    delivery?: 'inline' | 'cdn';
    /**
     * FC-18 §8.3 (D4): keep the file's resolved includes — `extract(currentHtml).includes`
     * (`#orz-includes`). A page cannot resolve local includes again, so they are carried over
     * as they are; the new file must hold exactly these (none when absent or empty).
     */
    includes?: Record<string, string>;
    fetch?: FetchLike;
    /** The document the hidden iframe is created in (default: the global document). */
    document?: UiDocument;
    /** The window that receives the iframe's messages (default: the document's view). */
    window?: MessageWindow;
    cdnBase?: string;
    /** Default {@link REASSEMBLE_TIMEOUT_MS}. */
    timeoutMs?: number;
}
/**
 * Re-assemble `text` with a release's shell — transactional, touching nothing
 * in the live page:
 *
 *   1. download the bundle from the hard-coded CDN URL; its SHA-384 must
 *      equal `release.bundle.integrity`, it must be UTF-8 and script-safe;
 *   2. in a hidden `sandbox="allow-scripts"` iframe (opaque origin), call the
 *      bundle's `OrzCarrier.assemble(text, { delivery, engineSource, includes? })`;
 *      only messages from that iframe's window are read;
 *   3. accept the html only if `extract(html)` gives exactly `text`, the
 *      kind, the release's version, the delivery and the `includes`;
 *   4. remove the iframe in every outcome.
 *
 * Resolves the new file's html; rejects with an {@link UpdateError}. The
 * caller saves it (`createSaver().save`) and reloads.
 */
export declare function reassemble(opts: ReassembleOptions): Promise<string>;
export interface PerformUpdateOptions extends Omit<CheckOptions, 'kind' | 'current'>, Omit<ReassembleOptions, 'release' | 'kind' | 'text'> {
    kind: ReleaseKind;
    current: string;
    /**
     * The editor's current text, read when the update starts and again before
     * the save (preferred: an edit made while "Updating…" runs is then never
     * lost). The caller keeps the editor read-only during the update.
     */
    getText?(): string;
    /** The text to carry over, exact, when there is no `getText` (read once). */
    text?: string;
    /**
     * Ignored (kept so older callers compile). A name proves nothing — a
     * picker that opens in another folder offers the same name — so the reload
     * rests on the save's `opened` (the written file proved by its content to
     * be the opened file; `createSaver`'s `openedHtml`).
     */
    openedName?: string;
    /** Saves the new file (`createSaver(...)`). */
    saver: Pick<Saver, 'save'>;
    /** Passed to the save (a host's `theme`). */
    theme?: string;
    /** An offer already in hand (from the indicator); skips the check. */
    info?: UpdateInfo;
}
export type PerformUpdateResult = {
    status: 'up-to-date';
} | {
    status: 'failed';
    info: UpdateInfo;
    code: UpdateErrorCode;
    error: string;
} | {
    status: 'updated';
    info: UpdateInfo;
    html: string;
    /** The text the saved file carries. */
    text: string;
    save: SaveResult;
    /**
     * Reload now: the save wrote the opened file — an acknowledged host
     * save, or File System Access to a file proved by its content to be the
     * opened one (`opened: true`) — and the current text is still the saved
     * text. Otherwise keep the page: the new file is a copy (a download, a
     * picked or session file not proved to be the opened one, whatever its
     * name) or the text moved on.
     */
    reload: boolean;
};
/**
 * check → reassemble → re-read the text → `saver.save({ text, html })`.
 * Never rejects and never reloads; `reload` says whether the caller may.
 * Refused (`failed`, nothing saved) when the page is framed or hosted
 * (`hosted`), the update is refused (an {@link UpdateError} code), or the
 * text changed while it ran (`changed`). On `served-notice` the caller
 * offers `saver.download`.
 */
export declare function performUpdate(opts: PerformUpdateOptions): Promise<PerformUpdateResult>;
//# sourceMappingURL=update.d.ts.map