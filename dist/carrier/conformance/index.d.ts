import type { CarrierTarget, CheckResult, ConformanceOptions, ConformanceReport, TestApi } from './types.js';
export { CHECKS, CHECK_IDS } from './catalog.js';
export type { CheckInfo } from './catalog.js';
export { HAZARD_TEXTS, REFUSED_TEXTS, EDIT_TEXT } from './texts.js';
export { loadCorpus } from './node.js';
export { derivedParts } from './checks.js';
export type { AssembleOptions, BundleSource, CarrierTarget, CheckResult, CheckStatus, ConformanceOptions, ConformanceReport, TestApi, BrowserLike } from './types.js';
/** @internal The ids that have an implementation (equal to `CHECK_IDS`; tested). */
export declare function implementedChecks(): string[];
/** A harness session over one target: run checks one at a time, then close. */
export interface ConformanceRunner {
    run(id: string): Promise<CheckResult>;
    close(): Promise<void>;
}
/** Open a session (servers, browser) for the selected checks. */
export declare function openConformance(target: CarrierTarget, options?: ConformanceOptions): Promise<ConformanceRunner>;
/** Run the selected checks against a carrier and report every result. Never throws for a failing check. */
export declare function runConformance(target: CarrierTarget, options?: ConformanceOptions): Promise<ConformanceReport>;
/**
 * Register the harness with a test framework: one test per check, titled
 * `[<check id>] <title>`, sharing one session. A skipped check is reported
 * through the test context's `skip()` when the framework offers it (vitest).
 *
 *     import { describe, it, beforeAll, afterAll } from 'vitest';
 *     registerConformance({ describe, it, beforeAll, afterAll }, () => myTarget(), { title: 'orz-mdhtml conformance' });
 */
export declare function registerConformance(t: TestApi, target: CarrierTarget | (() => CarrierTarget | Promise<CarrierTarget>), options?: ConformanceOptions & {
    title?: string;
}): void;
/** Every check id with its title and spec reference (for docs and claims). */
export declare function describeChecks(): Array<{
    id: string;
    title: string;
    chrome: boolean;
    spec: string;
}>;
//# sourceMappingURL=index.d.ts.map