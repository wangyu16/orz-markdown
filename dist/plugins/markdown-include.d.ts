import type MarkdownIt from 'markdown-it';
/**
 * `{{markdown path}}` / `{{md path}}` / `{{md-include path}}` — file includes.
 *
 * File access is a capability the HOST grants, never a default. The include
 * resolves only when the render `env` provides one of:
 *
 *   - `markdownBasePath` — the including document's directory (Node; files
 *     are read with `node:fs`), or
 *   - `readFile(absolutePath) => string | null` — a host-supplied reader
 *     (virtual file system, package store, browser cache, …).
 *
 * With neither, the directive renders nothing. Before 2.0.0 the include fell
 * back to `process.cwd()`, so any server that rendered untrusted Markdown with
 * the shared `md` (no env) could be made to read arbitrary local files
 * (`{{md /etc/passwd}}`, `{{md ../.env}}`).
 *
 * `markdownIncludeRoot` optionally confines includes: a path that resolves
 * outside that directory is refused. Set it whenever the source is not fully
 * trusted. URL includes (`https://…`) are never fetched here — rendering is
 * synchronous; resolve them first with `prepareSources()`.
 *
 * Node built-ins are reached through `process.getBuiltinModule`, not a static
 * import, so browser bundles of orz-markdown need no `fs`/`path`/`process` shims.
 */
export interface IncludeEnv {
    /** Directory the include paths are relative to. Enables Node file reads. */
    markdownBasePath?: string;
    /** If set, an include resolving outside this directory is refused. */
    markdownIncludeRoot?: string;
    /** Host-supplied reader; takes precedence over `node:fs`. Return null if unavailable. */
    readFile?: (absolutePath: string) => string | null;
}
/** Resolve an include target to an absolute path, or null if not permitted. */
export declare function resolveIncludePath(target: string, env: IncludeEnv): string | null;
/**
 * File includes are spliced in at PARSE time: the included file's block tokens
 * replace the directive in the token stream, before inline parsing. The
 * included text therefore takes part in the one document — its footnotes join
 * the single footnote list, its headings get unique ids and appear in
 * `{{toc}}`, and nyml ids keep counting. (Rendering it separately with a shared
 * env duplicated the footnote section and heading ids, and hid included
 * headings from the TOC.) One level only: a directive inside an included file
 * is left unexpanded and renders nothing.
 */
export declare function registerMarkdownInclude(md: MarkdownIt): void;
//# sourceMappingURL=markdown-include.d.ts.map