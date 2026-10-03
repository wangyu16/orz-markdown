/**
 * The env for an inline render inside a document (a `{{sp}}` body, a
 * `::: spoil` label): footnotes are off — such a render would emit a footnote
 * list of its own, with ids (`fn1`) that collide with the document's (round
 * 19, H1) — and per-render budgets (QR output, …) are shared with the document
 * through `__orzRoot`, so they cannot restart per label (round 19, H3).
 */
export function inlineEnv(env: object | undefined): Record<string, unknown> {
  const root = rootEnv(env);
  return { __orzNoFootnotes: true, __orzRoot: root };
}

/** The document env that per-render counters live on. */
export function rootEnv(env: object | undefined): Record<string, unknown> {
  const e = (env ?? {}) as Record<string, unknown>;
  return (e['__orzRoot'] as Record<string, unknown> | undefined) ?? e;
}
