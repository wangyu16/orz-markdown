/**
 * The include directives of a text and their record, for a carrier's CLI
 * (FC-18 §8.3; spec/carrier-node.md §5; lifted from orz-mdhtml 1.0's
 * src/includes.ts). A file shows an include only from its `#orz-includes`
 * record: a page reads no local files and, standalone, fetches no URLs. So
 * the CLI lists a text's include directives exactly as the renderer finds
 * them (the kit's parser: not in code, comments or other directives' bodies),
 * resolves FILE includes from the text's folder (refusing a path that leaves
 * it, symbolic links followed — the renderer's `markdownIncludeRoot` rule),
 * keeps the record's entries the text still uses, and names what stays
 * unresolved. One level, as the renderer.
 */
import { includeTargets } from '../targets.js';
import { decodeText } from '../text.js';
import { fs, path } from './builtins.js';

/** A URL target (`scheme://…`): never read by the CLI. */
export const isUrl = (t: string): boolean => /^[a-z][a-z0-9+.-]*:\/\//i.test(t);

/** A file target on a virtual root (as the record's reader normalizes it: `./a.md` = `a.md`). */
function rootPath(target: string): string {
  const out: string[] = [];
  for (const seg of target.replace(/^[A-Za-z]:/, '').split(/[\\/]/)) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return `/${out.join('/')}`;
}

// `includeTargets` is browser-safe since 2.5.0 (`orz-markdown/carrier`, K2); re-exported here so nothing breaks.
export { includeTargets };

/** The record entry that answers a target (URLs exactly; files by their normalized path). */
function entryFor(record: Readonly<Record<string, string>>, target: string): string | null {
  if (Object.prototype.hasOwnProperty.call(record, target)) return target;
  if (isUrl(target)) return null;
  const want = rootPath(target);
  return Object.keys(record).find((k) => !isUrl(k) && rootPath(k) === want) ?? null;
}

/** The entries of `record` the text still includes (a removed directive's entry is dropped). */
export function keepReferenced(text: string, record: Readonly<Record<string, string>>, directives?: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const target of includeTargets(text, directives)) {
    const key = entryFor(record, target);
    if (key !== null) out[key] = record[key]!;
  }
  return out;
}

/** The include targets of the text the record does not answer. */
export function unresolvedIncludes(text: string, record: Readonly<Record<string, string>>, directives?: readonly string[]): string[] {
  return includeTargets(text, directives).filter((t) => entryFor(record, t) === null);
}

/** Why a file include was not read. */
export type IncludeProblem = 'no-such-file' | 'outside-folder' | 'unreadable' | 'not-utf8';

/** What {@link resolveFileIncludes} read. */
export interface ResolvedIncludes {
  /** Target as written → the file's exact text. */
  includes: Record<string, string>;
  problems: Array<{ target: string; reason: IncludeProblem; message: string }>;
  /** The folder itself cannot be read (nothing resolved), else null. */
  folderProblem: string | null;
}

/**
 * Read the text's file includes from `folder` (the text twin's folder): each
 * target as written → the file's exact text (UTF-8). A target outside the
 * folder (after symbolic links), missing, unreadable or not UTF-8 is not
 * resolved (`problems`). URL targets are left alone.
 */
export function resolveFileIncludes(text: string, folder: string, directives?: readonly string[]): ResolvedIncludes {
  const f = fs();
  const p = path();
  const includes: Record<string, string> = {};
  const problems: ResolvedIncludes['problems'] = [];
  let root: string;
  try { root = f.realpathSync(folder); } catch { return { includes, problems, folderProblem: `the folder ${folder} cannot be read` }; }
  for (const target of includeTargets(text, directives)) {
    if (isUrl(target)) continue;
    const at = p.resolve(folder, target.replace(/\\/g, '/'));
    let real: string;
    try { real = f.realpathSync(at); } catch {
      problems.push({ target, reason: 'no-such-file', message: `no such file (${at})` });
      continue;
    }
    const rel = p.relative(root, real);
    if (rel === '' || rel === '..' || rel.startsWith(`..${p.sep}`) || p.isAbsolute(rel)) {
      problems.push({ target, reason: 'outside-folder', message: `outside the text's folder (${root}); not read` });
      continue;
    }
    try {
      includes[target] = decodeText(f.readFileSync(real), { fatal: true });
    } catch (e) {
      const code = (e as { code?: string }).code;
      problems.push({ target, reason: code ? 'unreadable' : 'not-utf8', message: code === 'EISDIR' ? 'a folder' : code ? (e as Error).message : 'not valid UTF-8' });
    }
  }
  return { includes, problems, folderProblem: null };
}

/** One include directive the written file does not resolve (assemble's `--json` `unresolved`). */
export interface Unresolved {
  target: string;
  kind: 'file' | 'url';
  /**
   * `not-recorded` (a file include not in the record; `--resolve-includes`
   * would read it), `url` (the CLI fetches no URLs), or why it cannot be read
   * from the text's folder: `no-such-file`, `outside-folder`, `unreadable`,
   * `not-utf8`, `folder-unreadable`.
   */
  reason: 'not-recorded' | 'url' | IncludeProblem | 'folder-unreadable';
}

/** A recorded file include older than the file in the text's folder (assemble's `--json` `stale`). */
export interface Stale { target: string; kind: 'file'; reason: 'stale-record' }

/** What {@link includePlan} decides. */
export interface IncludePlan {
  /** The record the new file carries. */
  includes: Record<string, string>;
  /** How many file includes were read from the folder (`--resolve-includes`). */
  resolved: number;
  unresolved: Unresolved[];
  stale: Stale[];
  /** One sentence per unresolved or stale directive (the CLI's warnings). */
  warnings: string[];
}

const NOTE = 'the file shows an "Included file not available" note there';

/**
 * `assemble`'s includes (FC-18 §8.3): keep the entries of the existing
 * file's record the text still uses (`held`; none with `keep: false`, i.e.
 * `--no-includes`); with `resolve` (`--resolve-includes`) read every file
 * include afresh from `folder` (URL entries kept); without it, name each
 * recorded file include whose file has changed since (`stale`). Every
 * directive left unresolved is listed with its reason and one warning.
 * `outName` names the existing file; `resolveCommand` is the command line
 * that re-runs the user's assemble with `--resolve-includes` (for hints).
 */
export function includePlan(text: string, o: { folder: string; held: Readonly<Record<string, string>> | null; keep: boolean; resolve: boolean; outName: string; resolveCommand: string; directives?: readonly string[] }): IncludePlan {
  let includes: Record<string, string> = o.keep && o.held ? keepReferenced(text, o.held, o.directives) : {};
  const probe = resolveFileIncludes(text, o.folder, o.directives);
  const problems = new Map(probe.problems.map((p) => [p.target, p]));
  const warnings: string[] = [];
  let resolved = 0;
  const stale: Stale[] = [];
  if (o.resolve) {
    for (const key of Object.keys(includes)) if (!isUrl(key)) delete includes[key]; // files are read afresh
    includes = { ...includes, ...probe.includes };
    resolved = Object.keys(probe.includes).length;
  } else {
    for (const [target, recorded] of Object.entries(includes)) {
      const current = probe.includes[target];
      if (isUrl(target) || current === undefined || current === recorded) continue;
      stale.push({ target, kind: 'file', reason: 'stale-record' });
      warnings.push(`{{md ${target}}} is stale (stale-record): the file shows the text recorded in ${o.outName}, and ${target} in the text's folder has changed since; \`${o.resolveCommand}\` records the current one`);
    }
  }
  const folderProblem = o.resolve ? probe.folderProblem : null;
  const unresolved: Unresolved[] = unresolvedIncludes(text, includes, o.directives).map((target) => {
    if (isUrl(target)) return { target, kind: 'url', reason: 'url' };
    const problem = problems.get(target);
    return { target, kind: 'file', reason: problem ? problem.reason : !o.resolve ? 'not-recorded' : folderProblem ? 'folder-unreadable' : 'no-such-file' };
  });
  for (const u of unresolved) {
    const problem = problems.get(u.target);
    const why = u.kind === 'url'
      ? `${NOTE} (a URL include is shown only from the record of a file that holds it, or by a host that resolves it; the CLI fetches no URLs)`
      : problem ? `${problem.message}${!o.resolve && problem.reason === 'outside-folder' ? ' — --resolve-includes does not read it either: copy it into the folder' : ''}; ${NOTE}`
      : o.resolve ? `${folderProblem ?? 'not read'}; ${NOTE}`
      : `${NOTE} (pass --resolve-includes to read it from the text's folder: \`${o.resolveCommand}\`)`;
    warnings.push(`{{md ${u.target}}} is not resolved: ${why}`);
  }
  return { includes, resolved, unresolved, stale, warnings };
}
