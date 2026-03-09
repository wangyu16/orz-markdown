import type MarkdownIt from 'markdown-it';
type StateBlock = MarkdownIt.StateBlock;
/**
 * Block dispatcher rule for {{name[args] body}} constructs.
 * Registered after 'blockquote' so it runs before 'paragraph' but after 'fence'/'code_block'.
 */
export declare function blockDispatcher(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean;
export {};
//# sourceMappingURL=block-dispatcher.d.ts.map