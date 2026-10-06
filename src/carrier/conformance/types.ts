/**
 * Types of the carrier conformance harness (spec/conformance.md).
 */
import type { Kind } from '../document.js';

/** A carrier release on disk: its browser bundle and its `release.json` (spec/shell-runtime.md §6). */
export interface BundleSource {
  /** Path of the browser bundle file (`orz-<x>.browser.js`). */
  bundle: string;
  /** Path of its `release.json`; `bundle.path` in it names the bundle relative to this file's directory. */
  release: string;
}

/** Options of a carrier's `assemble` (FC-19 §2). */
export interface AssembleOptions {
  delivery?: 'inline' | 'cdn';
  /** The exact text of the browser bundle, for an inline file. */
  engineSource?: string;
}

/** The carrier under test. */
export interface CarrierTarget extends BundleSource {
  kind: Kind;
  /** The shell version: the carrier's version, `release.json` `version` and `OrzCarrier.version`. */
  version: string;
  /** The carrier's Node `assemble` (FC-19 §2). With no `engineSource`, an inline file must carry this release's bundle. */
  assemble(text: string, options?: AssembleOptions): string | Promise<string>;
  /** The carrier's creation tool ("New document"): a new text with its header and a freshly minted `uid` (FC-18 §10). */
  create(): string | Promise<string>;
  /** Extra texts for the law checks (kind-specific constructs), by name. */
  samples?: Record<string, string> | string[];
  /** Which optional host protocols the file speaks (default both). A declined protocol must never be answered (spec/host-protocols.md §4–5). */
  protocols?: { ai?: boolean; include?: boolean };
  /**
   * Page-side function source, `(text) => Editor | Promise<Editor>`: put the
   * opened assembled file into edit mode and return its FC-19 `Editor` for
   * `text` (the text the harness read from the file). Default: mount
   * `globalThis.OrzCarrier.mountEditor` on a new element appended to `<body>`.
   */
  editor?: string;
  /**
   * A release of this carrier with a HIGHER version (e.g. this build again
   * with the patch number bumped): the update offered to files this target
   * made. Without it the update checks are skipped.
   */
  next?: BundleSource;
  /** An older release: files it made must update to this target exactly (`C.update.from-previous`). */
  previous?: BundleSource;
}

/** A Playwright browser (playwright-core), structurally. */
export type BrowserLike = import('playwright-core').Browser;

export interface ConformanceOptions {
  /** A launched Chromium-family browser to use (it is not closed). Default: launch the installed Chrome (`channel`). */
  browser?: BrowserLike;
  /** Playwright channel for the default launch. Default `chrome`. */
  channel?: string;
  /** Run only these checks. */
  only?: readonly string[];
  /** Skip these checks. */
  skip?: readonly string[];
  /**
   * The corpus for the law checks: a directory holding `manifest.json` (the
   * layout of `orz-markdown/tests/carrier-corpus`), a list of texts, or
   * `false` for none. Default: the corpus shipped in this package.
   */
  corpus?: string | false | Record<string, string>;
  /** Per-check time limit (ms). Default 120 000. */
  checkTimeoutMs?: number;
  /** Progress lines. */
  log?(line: string): void;
}

export type CheckStatus = 'passed' | 'failed' | 'skipped';

export interface CheckResult {
  id: string;
  title: string;
  status: CheckStatus;
  /** Why it failed or was skipped. */
  message?: string;
  /** Every failed expectation (a check reports all it found, not only the first). */
  failures?: string[];
  durationMs: number;
}

export interface ConformanceReport {
  kind: Kind;
  version: string;
  /** The orz-markdown version whose harness ran. */
  harness: string;
  /** True when no check failed and none was skipped. */
  conformant: boolean;
  passed: number;
  failed: number;
  skipped: number;
  results: CheckResult[];
}

/** The subset of a test framework `registerConformance` uses (vitest, jest, mocha-like). */
export interface TestApi {
  describe(name: string, fn: () => void): unknown;
  it(name: string, fn: (ctx?: { skip?: (note?: string) => void }) => Promise<void>, timeout?: number): unknown;
  beforeAll(fn: () => Promise<void>, timeout?: number): unknown;
  afterAll(fn: () => Promise<void>, timeout?: number): unknown;
}
