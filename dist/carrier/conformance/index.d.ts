import type { CarrierTarget, CheckResult, ConformanceOptions, ConformanceReport, TestApi } from './types.js';
export { CHECKS, CHECK_IDS } from './catalog.js';
export type { CheckInfo } from './catalog.js';
export { HAZARD_TEXTS, REFUSED_TEXTS, EDIT_TEXT } from './texts.js';
export { loadCorpus } from './node.js';
export { derivedParts } from './checks.js';
export { initScript, OPFS_FOLDER, READ_OPFS, WRITE_OPFS, PAGE_HELPERS, PAGE_LOG, RECORD_BINDING, DEFAULT_EDITOR_DRIVER, mountEditorScript, HOST_PAGE } from './page.js';
export type { PickerMode } from './page.js';
export { callPage, readOpfs, writeOpfs, pageRecords } from './helpers.js';
export type { OpfsPlace } from './helpers.js';
export { FILE_ACCESS_FLAG, CODEMIRROR_URL } from './session.js';
export type { AssembleOptions, BundleSource, CarrierTarget, CheckResult, CheckStatus, ConformanceOptions, ConformanceReport, TestApi, BrowserLike } from './types.js';
/**
 * Checks that run alone (no other check runs beside them): they time the
 * reader's typing against a script that floods the page, and a loaded
 * machine must not make them flaky.
 */
export declare const EXCLUSIVE_CHECKS: readonly string[];
/** @internal The ids that have an implementation (equal to `CHECK_IDS`; tested). */
export declare function implementedChecks(): string[];
/** A harness session over one target, then close. */
export interface ConformanceRunner {
    /** Run one check (in its own scope: its contexts are closed when it ends). */
    run(id: string): Promise<CheckResult>;
    /**
     * Run checks side by side in `lanes` lanes (default `options.lanes`, else 3);
     * the {@link EXCLUSIVE_CHECKS} among them run first, alone. Resolves one
     * promise per id (in the order given).
     */
    schedule(ids: readonly string[], lanes?: number): Map<string, Promise<CheckResult>>;
    close(): Promise<void>;
}
/** Open a session (servers, browser) for the selected checks. */
export declare function openConformance(target: CarrierTarget, options?: ConformanceOptions): Promise<ConformanceRunner>;
/** Run the selected checks against a carrier and report every result. Never throws for a failing check. */
export declare function runConformance(target: CarrierTarget, options?: ConformanceOptions): Promise<ConformanceReport>;
/** Every check of `CHECK_IDS` has a result that passed or is not applicable. */
export declare function isConformant(results: readonly CheckResult[]): boolean;
/**
 * Register the harness with a test framework: one test per check, titled
 * `[<check id>] <title>`, sharing one session, then a final test titled
 * `[conformant] …` that fails unless every check of `CHECK_IDS` ran and passed
 * (or is not applicable) — so a skipped check (no Chrome, no `next`) or a
 * partial selection (`only`/`skip`) cannot pass as conformance. With
 * `allowSkips: true` the final test tolerates skips and deselection (it
 * still fails on a failed check). A skipped check is reported through the
 * test context's `skip()` when the framework offers it (vitest).
 *
 *     import { describe, it, beforeAll, afterAll } from 'vitest';
 *     registerConformance({ describe, it, beforeAll, afterAll }, () => myTarget(), { title: 'orz-mdhtml conformance' });
 */
export declare function registerConformance(t: TestApi, target: CarrierTarget | (() => CarrierTarget | Promise<CarrierTarget>), options?: ConformanceOptions & {
    title?: string;
}): void;
/** The title of the final test `registerConformance` registers. */
export declare const CONFORMANT_TITLE = "[conformant] every check of CHECK_IDS ran and passed (or is not applicable)";
/** Every check id with its title and spec reference (for docs and claims). */
export declare function describeChecks(): Array<{
    id: string;
    title: string;
    chrome: boolean;
    spec: string;
}>;
//# sourceMappingURL=index.d.ts.map