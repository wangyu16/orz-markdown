/**
 * `![alt](src =WxH)` image sizes — `=300x200`, `=300x`, `=x200`, `=50%x`.
 *
 * Ported from markdown-it-imsize 2.0.1 (MIT, © tatsy) without its `autofill`
 * option. Autofill read image files from disk, so the package statically
 * required `fs` and per-format size detectors; every browser bundle of
 * orz-markdown needed a stub for it. orz-markdown never enabled autofill, so
 * the port keeps exactly the parsing behavior and drops the file access.
 */
import type MarkdownIt from 'markdown-it';
/** Parse `=WxH` at `pos`. Either side may be empty, but the `x` is required. */
export declare function parseImageSize(str: string, pos: number, max: number): {
    ok: boolean;
    pos: number;
    width: string;
    height: string;
};
/** Same rule name and position as markdown-it-imsize, so behavior is unchanged. */
export declare function registerImsize(md: MarkdownIt): void;
//# sourceMappingURL=imsize.d.ts.map