import type MarkdownIt from 'markdown-it';
/** Total TOC entries per render, across all `{{toc}}` blocks. */
export declare const MAX_TOC_ENTRIES = 20000;
/** Total TOC output per render, roughly in characters. */
export declare const MAX_TOC_BYTES = 8000000;
export declare function registerToc(md: MarkdownIt): void;
//# sourceMappingURL=toc.d.ts.map