/**
 * Chinese / Japanese / Korean text support.
 *
 * 1. Emphasis next to CJK punctuation. CommonMark's flanking rules were written
 *    for space-separated languages: `**注意：**请` never closes, because the
 *    closing `**` follows punctuation and precedes a letter. This is a port of
 *    markdown-it-cjk-friendly 3.0.0 (MIT, © 2024 Tatsunori Uchino), which
 *    implements the CommonMark CJK-friendly amendment proposal: when the
 *    character on either side of a delimiter run is CJK, the run may open and
 *    close as if the word boundary were punctuation. Non-CJK text is unchanged.
 *    The original classifies characters by East Asian Width (an ESM-only data
 *    package); this port uses Unicode script properties built into JS regexes,
 *    which give the same answer for the CJK scripts and punctuation that occur
 *    in practice and keep orz-markdown dependency- and shim-free.
 *
 * 2. Bare URLs followed by CJK text. linkify-it accepts any Unicode letter in a
 *    host or path, so `访问https://orz.how获取更多` linked `orz.how获取更多`
 *    (punycoded to a dead host). linkify's matches are narrowed to the URL
 *    before markdown-it consumes them, so the CJK text after it parses normally. Explicit links `[text](url)` and `<url>` autolinks are untouched.
 *
 * Soft line breaks between CJK characters are dropped by markdown-it-cjk-breaks
 * (registered in index.ts).
 */
import type MarkdownIt from 'markdown-it';
/** Is `cp` a CJK code point (emoji excluded)? */
export declare function isCjk(cp: number): boolean;
export declare function registerCjk(md: MarkdownIt): void;
//# sourceMappingURL=cjk.d.ts.map