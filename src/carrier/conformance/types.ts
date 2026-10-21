/**
 * Types of the carrier conformance harness (spec/conformance.md).
 */
import type { Kind } from '../document.js';
import type { TwinNaming } from '../naming.js';

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
  /**
   * Resolved includes to store in `#orz-includes` as given (FC-18 §8.3, D4), instead of resolving
   * the text's include directives: the browser has no files, so its saves and the quiet update
   * pass the opened file's (`extract(html).includes`). Absent or empty: none.
   */
  includes?: Record<string, string>;
  /**
   * (2.5.0) The twin-link naming (FC-18 §8.2): stored in `#orz-shell` as `"links"` when it is
   * not the family's, carried by every save and the quiet update (`C.links.*`).
   */
  twinLinks?: TwinNaming;
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
  /**
   * This is the carrier's first release: there is no `previous`, and
   * `C.update.from-previous` is then reported `not-applicable` (satisfied).
   * Without this declaration a missing `previous` is a skip.
   */
  firstRelease?: boolean;
  /**
   * (2.5.0) The carrier takes `assemble(text, { twinLinks })` (FC-18 §8.2). The `C.links.*`
   * checks run when its Node `assemble` stores a naming; a carrier that ignores the option
   * (built before kit 2.5.0) gets them `not-applicable` — unless it declares `twinLinks: true`,
   * when ignoring it fails.
   */
  twinLinks?: boolean;
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
  /** Per-check time limit (ms). Default 120 000; `C.save.conflict`, which walks many files, gets three times it. */
  checkTimeoutMs?: number;
  /**
   * How many checks run side by side (each in its own browser contexts;
   * the timing-sensitive `EXCLUSIVE_CHECKS` always run alone). Default 3;
   * 1 runs them one after another.
   */
  lanes?: number;
  /** Progress lines. */
  log?(line: string): void;
  /**
   * `registerConformance` only: its final `[conformant]` test passes although
   * checks were skipped or deselected (a run without Chrome, a partial run).
   * Failed checks still fail it.
   */
  allowSkips?: boolean;
}

/**
 * `not-applicable`: the check does not apply to this target for a declared
 * reason (e.g. `C.update.from-previous` for a `firstRelease`); it counts as
 * satisfied for conformance. `skipped`: it could not run (no browser, no
 * `next`); it does not.
 */
export type CheckStatus = 'passed' | 'failed' | 'skipped' | 'not-applicable';

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
  /**
   * True only when EVERY check of `CHECK_IDS` ran and passed (or is
   * `not-applicable` for its declared case): a run with `only`/`skip`, a
   * skipped or a failed check is not conformant.
   */
  conformant: boolean;
  /** The run selected a subset of the checks (`only` / `skip`): never conformant. */
  partial: boolean;
  passed: number;
  failed: number;
  skipped: number;
  notApplicable: number;
  results: CheckResult[];
}

/** The subset of a test framework `registerConformance` uses (vitest, jest, mocha-like). */
export interface TestApi {
  describe(name: string, fn: () => void): unknown;
  it(name: string, fn: (ctx?: { skip?: (note?: string) => void }) => Promise<void>, timeout?: number): unknown;
  beforeAll(fn: () => Promise<void>, timeout?: number): unknown;
  afterAll(fn: () => Promise<void>, timeout?: number): unknown;
}
