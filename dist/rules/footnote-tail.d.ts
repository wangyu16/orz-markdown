/**
 * markdown-it-footnote's `footnote_tail` core rule, ported (MIT, © Vitaly
 * Puzrin, Alex Kocharin) with one change: the footnote list is appended to
 * `state.tokens` in place. The original rebuilds the whole token array once
 * per footnote (`state.tokens = state.tokens.concat(tokens)`), which is
 * quadratic: 10,000 footnotes took ~3.5 s in plain markdown-it-footnote too
 * (round 18, H6). Output is token-for-token identical.
 */
import type MarkdownIt from 'markdown-it';
export declare function footnoteTail(state: MarkdownIt.StateCore): void;
//# sourceMappingURL=footnote-tail.d.ts.map