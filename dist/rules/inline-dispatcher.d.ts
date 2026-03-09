import type MarkdownIt from 'markdown-it';
type StateInline = MarkdownIt.StateInline;
/**
 * Inline dispatcher rule for {{name[args] body}} constructs.
 * Registered after 'escape' so \{{ is handled by the built-in escape rule.
 */
export declare function inlineDispatcher(state: StateInline, silent: boolean): boolean;
export {};
//# sourceMappingURL=inline-dispatcher.d.ts.map