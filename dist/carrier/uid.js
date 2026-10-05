"use strict";
/**
 * Document ids (FC-18 §10, decision D3). Kept in its own module: this is the
 * ONLY carrier-kit code that uses randomness, so the envelope, header and
 * document modules stay statically free of it (determinism, FC-18 law 2).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mintUid = mintUid;
const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';
/**
 * Mint a new document `uid`: `doc-` + 16 random base36 characters, from
 * `crypto.getRandomValues` (browsers and Node ≥ 20 provide it as a global).
 * Creation tools call this — never `assembleEnvelope`. Rejection sampling keeps
 * every character uniformly distributed.
 */
function mintUid() {
    const c = globalThis.crypto;
    if (!c || typeof c.getRandomValues !== 'function') {
        throw new Error('orz carrier: mintUid needs crypto.getRandomValues');
    }
    let out = '';
    const buf = new Uint8Array(32);
    while (out.length < 16) {
        c.getRandomValues(buf);
        for (let i = 0; i < buf.length && out.length < 16; i++) {
            // 252 = 7 × 36: values above it would bias the low characters.
            if (buf[i] < 252)
                out += BASE36[buf[i] % 36];
        }
    }
    return `doc-${out}`;
}
//# sourceMappingURL=uid.js.map