/**
 * The conformance checks: stable ids (a carrier's claims bind to them), what
 * each one proves and where it runs. spec/conformance.md is the prose form of
 * this table.
 */
export interface CheckInfo {
    id: string;
    title: string;
    /** Runs in real Chrome (skipped, with a reason, when no browser can be launched). */
    chrome: boolean;
    /** The spec text it enforces. */
    spec: string;
}
export declare const CHECKS: readonly CheckInfo[];
export declare const CHECK_IDS: readonly string[];
export declare function checkInfo(id: string): CheckInfo;
//# sourceMappingURL=catalog.d.ts.map