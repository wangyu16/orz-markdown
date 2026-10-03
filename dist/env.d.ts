/**
 * The env for an inline render inside a document (a `{{sp}}` body, a
 * `::: spoil` label): footnotes are off — such a render would emit a footnote
 * list of its own, with ids (`fn1`) that collide with the document's (round
 * 19, H1) — and per-render budgets (QR output, …) are shared with the document
 * through `__orzRoot`, so they cannot restart per label (round 19, H3).
 */
export declare function inlineEnv(env: object | undefined): Record<string, unknown>;
/** The document env that per-render counters live on. */
export declare function rootEnv(env: object | undefined): Record<string, unknown>;
//# sourceMappingURL=env.d.ts.map