import type MarkdownIt from 'markdown-it';
import { register } from '../registry.js';

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

type NodeFs = { readFileSync(path: string, encoding: 'utf8'): string; realpathSync(path: string): string };
type NodePath = {
  sep?: string;
  resolve(...parts: string[]): string;
  relative(from: string, to: string): string;
  isAbsolute(p: string): boolean;
};

function builtin<T>(name: string): T | undefined {
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  try {
    return proc?.getBuiltinModule?.(name) as T | undefined;
  } catch {
    return undefined;
  }
}

/** Minimal POSIX resolve for runtimes without `node:path` (browser hosts with `readFile`). */
const posixPath: NodePath = {
  isAbsolute: (p) => p.startsWith('/'),
  resolve(...parts) {
    let segments: string[] = [];
    for (const part of parts) {
      if (part.startsWith('/')) segments = [];
      for (const seg of part.split('/')) {
        if (!seg || seg === '.') continue;
        if (seg === '..') segments.pop();
        else segments.push(seg);
      }
    }
    return '/' + segments.join('/');
  },
  relative(from, to) {
    const a = posixPath.resolve(from).split('/').filter(Boolean);
    const b = posixPath.resolve(to).split('/').filter(Boolean);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
  },
};

function isUrl(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(target);
}

/** Resolve an include target to an absolute path, or null if not permitted. */
export function resolveIncludePath(target: string, env: IncludeEnv): string | null {
  if (!target || isUrl(target)) return null;
  const base = env.markdownBasePath;
  if (typeof base !== 'string' && typeof env.readFile !== 'function') return null;
  const path = builtin<NodePath>('node:path') ?? posixPath;
  const resolved = path.resolve(base ?? '/', target);
  const root = env.markdownIncludeRoot;
  if (typeof root === 'string') {
    // Compare real paths when reading from disk, so a symlink inside the root
    // cannot point outside it; a host reader decides for itself.
    const fs = typeof env.readFile === 'function' ? undefined : builtin<NodeFs>('node:fs');
    const real = (p: string): string | null => {
      if (!fs) return p;
      try { return fs.realpathSync(p); } catch { return null; }
    };
    const realRoot = real(path.resolve(root));
    const realTarget = real(resolved);
    if (!realRoot || !realTarget) return null;
    const rel = path.relative(realRoot, realTarget);
    const sep = path.sep ?? '/';
    // "..notes.md" is a file inside the root; "../x" and ".." leave it.
    if (rel === '' || rel === '..' || rel.startsWith('..' + sep) || rel.startsWith('../') || path.isAbsolute(rel)) return null;
  }
  return resolved;
}

/** One cache key per file: its real path when read from disk. */
function realKey(resolved: string, env: IncludeEnv): string {
  if (typeof env.readFile === 'function') return resolved;
  const fs = builtin<NodeFs & { realpathSync: { native?: (p: string) => string } & ((p: string) => string) }>('node:fs');
  try { return fs ? (fs.realpathSync.native ?? fs.realpathSync)(resolved) : resolved; } catch { return resolved; }
}

function readInclude(resolved: string, env: IncludeEnv): string | null {
  try {
    if (typeof env.readFile === 'function') return env.readFile(resolved);
    const fs = builtin<NodeFs>('node:fs');
    return fs ? fs.readFileSync(resolved, 'utf8') : null;
  } catch {
    return null;
  }
}

/**
 * The include directive names — the ONE list: the renderer registers these
 * aliases and `prepareSources` resolves URL includes written with any of them
 * (claim M.11).
 */
export const INCLUDE_DIRECTIVES: readonly string[] = Object.freeze(['markdown', 'md', 'md-include']);
const INCLUDE_ALIASES: ReadonlySet<string> = new Set(INCLUDE_DIRECTIVES);
/** Characters of included files per render. */
const MAX_INCLUDED = 5_000_000;

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
export function registerMarkdownInclude(md: MarkdownIt, registry = true): void {
  // `registry: false` for a second, private instance (the carrier kit's parser):
  // the global plugin registry keeps the shared `md`'s definitions.
  if (registry) {
    register({
      type: 'block',
      aliases: [...INCLUDE_DIRECTIVES],
      // Reached only for directives the core rule did not expand: URL includes
      // (resolve them with prepareSources), unreadable or refused paths, nested.
      render() {
        return '';
      },
    });
  }

  md.core.ruler.after('block', 'orz_include', (state) => {
    if (state.inlineMode) return;
    const env = (state.env ?? {}) as Record<string, unknown> & IncludeEnv;
    const tokens = state.tokens;
    if (!tokens.some((t) => t.type === 'plugin_block' && INCLUDE_ALIASES.has(t.info))) return;
    // One pass into a new array (a splice per include copied the whole tail each
    // time: round 18, H3). Includes found inside an include are not expanded.
    const out: MarkdownIt.Token[] = [];
    for (const token of tokens) {
      if (token.type !== 'plugin_block' || !INCLUDE_ALIASES.has(token.info)) { out.push(token); continue; }
      const resolved = resolveIncludePath((token.content || '').trim(), env);
      // Bounded per render like prepareSources' maxSize: a file including
      // itself N times ran V8 out of heap at 64 KB (also 1.6.3; round 19, H8).
      // Checked before reading, and each path read once per render (2,000
      // refused directives re-read a 6.8 MB file: round 20, H4).
      const included0 = (env['__orzIncluded'] as number | undefined) ?? 0;
      if (!resolved || included0 >= MAX_INCLUDED) { out.push(token); continue; }
      // Keyed by the real path (case or symlink spellings of one file are one
      // entry), every read charged to a per-render read budget, and a body
      // refused for size not kept (1,024 spellings of a 6 MB file ran V8 out of
      // heap: round 21, H5).
      const cache = (env['__orzIncludeCache'] as Map<string, string | null> | undefined) ?? new Map<string, string | null>();
      env['__orzIncludeCache'] = cache;
      const key = realKey(resolved, env);
      let source = cache.get(key);
      if (source === undefined) {
        const read0 = (env['__orzIncludeRead'] as number | undefined) ?? 0;
        if (read0 >= 2 * MAX_INCLUDED) { out.push(token); continue; }
        source = readInclude(resolved, env);
        env['__orzIncludeRead'] = read0 + (source?.length ?? 0);
        cache.set(key, source != null && included0 + source.length > MAX_INCLUDED ? null : source);
      }
      if (source == null || included0 + source.length > MAX_INCLUDED) { out.push(token); continue; }
      env['__orzIncluded'] = included0 + source.length;
      const included: MarkdownIt.Token[] = [];
      const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\0/g, '\uFFFD'); // a BOM would hide the first line (round 18, L2)
      md.block.parse(normalized, md, state.env, included);
      // Positions refer to the PARENT source (the directive's lines), so hosts
      // that map tokens back to source lines stay consistent.
      for (const t of included) {
        t.level += token.level;
        if (t.map) t.map = token.map ? [...token.map] as [number, number] : null;
        out.push(t);
      }
    }
    state.tokens = out;
  });
}
