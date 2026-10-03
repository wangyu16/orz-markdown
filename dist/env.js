"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inlineEnv = inlineEnv;
exports.rootEnv = rootEnv;
/**
 * The env for an inline render inside a document (a `{{sp}}` body, a
 * `::: spoil` label): footnotes are off — such a render would emit a footnote
 * list of its own, with ids (`fn1`) that collide with the document's (round
 * 19, H1) — and per-render budgets (QR output, …) are shared with the document
 * through `__orzRoot`, so they cannot restart per label (round 19, H3).
 */
function inlineEnv(env) {
    const root = rootEnv(env);
    return { __orzNoFootnotes: true, __orzRoot: root };
}
/** The document env that per-render counters live on. */
function rootEnv(env) {
    const e = (env ?? {});
    return e['__orzRoot'] ?? e;
}
//# sourceMappingURL=env.js.map