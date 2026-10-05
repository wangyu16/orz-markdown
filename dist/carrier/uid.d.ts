/**
 * Document ids (FC-18 §10, decision D3). Kept in its own module: this is the
 * ONLY carrier-kit code that uses randomness, so the envelope, header and
 * document modules stay statically free of it (determinism, FC-18 law 2).
 */
/**
 * Mint a new document `uid`: `doc-` + 16 random base36 characters, from
 * `crypto.getRandomValues` (browsers and Node ≥ 20 provide it as a global).
 * Creation tools call this — never `assembleEnvelope`. Rejection sampling keeps
 * every character uniformly distributed.
 */
export declare function mintUid(): string;
//# sourceMappingURL=uid.d.ts.map