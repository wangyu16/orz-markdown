import { type Session } from './session.js';
export declare class Skip extends Error {
}
/** The check does not apply to this target, for a reason the target declared (e.g. `firstRelease`). Counts as satisfied. */
export declare class NotApplicable extends Error {
}
/** Collects failed expectations. */
export declare class Probe {
    readonly failures: string[];
    check(ok: unknown, message: string): boolean;
    eq(actual: unknown, expected: unknown, what: string): boolean;
    fail(message: string): void;
}
export type CheckFn = (s: Session, p: Probe) => Promise<void>;
/** Where two strings first differ, for a readable failure. */
export declare function firstDiff(a: string, b: string): string;
/** The parts of a file derived from its text (FC-18 §8.1): everything before `#orz-shell` except the generator, the island and `#orz-includes`. */
export declare function derivedParts(html: string): {
    head: string;
    island: string;
    includes: string;
};
/** Every text the law checks run on: the corpus of the kind, the hazards and the target's samples. */
export declare function lawTexts(s: Session, corpus: Record<string, string>): Array<[string, string]>;
export declare const lawChecks: (corpus: () => Record<string, string>) => Record<string, CheckFn>;
export declare const bundleChecks: Record<string, CheckFn>;
export declare const createChecks: Record<string, CheckFn>;
export declare const editChecks: Record<string, CheckFn>;
export declare const saveChecks: Record<string, CheckFn>;
export declare const updateChecks: Record<string, CheckFn>;
export declare const hostChecks: Record<string, CheckFn>;
export declare const prefChecks: Record<string, CheckFn>;
//# sourceMappingURL=checks.d.ts.map