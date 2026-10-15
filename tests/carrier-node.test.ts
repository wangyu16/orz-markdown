/**
 * `orz-markdown/carrier/node` (2.3.0, spec/carrier-node.md, claims N.1–N.9):
 * the CLI core orz-mdhtml 1.0 and orz-paged 1.0 copied. The strongest of
 * their CLI tests (T.7, T.9, T.11, T.12, T.14, T.16–T.21) are ported here
 * against the generic API, through a reference CLI built only from it
 * (tests/helpers/node-cli.ts: assemble / extract / upgrade of kind md, run in
 * process) — above all "follow every next verbatim; no text is lost".
 */
import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extract } from '../src/carrier/index.js';
import {
  assembleArgs, backup, cacheDir, carrierNode, CliError, commandLine, includePlan, includeTargets, readText, recordPair, replacesToken,
  resolveFileIncludes, sha256, sh, writeOut, EXIT_USAGE, REASONS,
} from '../src/carrier/node/index.js';
import { sha256 as kitSha256 } from '../src/carrier/sha256.js';
import { assemble, legacyFile, node, runCli, SHELL, type Run } from './helpers/node-cli.js';

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'orz-carrier-node-')));
const CACHE = join(tmp, '.cache');
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const folder = (): string => { const d = join(tmp, `t${++n}`); mkdirSync(d); return d; };
const cli = (args: string[], cwd: string, env: Record<string, string | undefined> = {}): Run => runCli(args, cwd, { XDG_CACHE_HOME: CACHE, ...env });
const json = (r: Run): Record<string, any> => JSON.parse(r.stdout) as Record<string, any>;
const text = (p: string): string => new TextDecoder('utf-8', { ignoreBOM: true }).decode(readFileSync(p));
const write = (p: string, s: string): void => writeFileSync(p, s, 'utf8');
const touch = (p: string, t: number): void => utimesSync(p, t, t);
const noTemp = (dir: string): void => { expect(readdirSync(dir).filter((f) => f.includes('.orz-') && f.endsWith('.tmp'))).toEqual([]); };
const doc = (title: string, uid: string | null): string => (uid ? `{{nyml\nkind: document\nuid: ${uid}\ntitle: ${title}\n}}\n\n# ${title}\n` : `# ${title}\n`);
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
/** git in a folder (null: no git on this machine). */
function gitIn(d: string): ((...args: string[]) => void) | null {
  const run = (...args: string[]): void => { execFileSync('git', ['-C', d, ...args], { stdio: 'ignore', env: { ...process.env, ...GIT_ENV } }); };
  try { run('init', '-q'); } catch { return null; }
  return run;
}

// ── N.1 boundaries ───────────────────────────────────────────────────────

function valueImports(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of readFileSync(f, 'utf8').matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?from\s*)?['"]([^'"]+)['"]/gm)) {
      if (!m[1]!.startsWith('.')) continue;
      const dir = f.slice(0, f.lastIndexOf('/'));
      const parts: string[] = [];
      for (const p of `${dir}/${m[1]}`.split('/')) { if (p === '..') parts.pop(); else if (p !== '.' && p) parts.push(p); }
      const base = parts.join('/').replace(/\.js$/, '');
      queue.push(existsSync(`${base}.ts`) ? `${base}.ts` : `${base}/index.ts`);
    }
  }
  return seen;
}

describe('carrier/node boundaries', () => {
  it('[N.1] no other entry imports carrier/node; it imports no Node built-in statically (process.getBuiltinModule only); the package exports ./carrier/node; no browser bundle holds it', async () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { exports: Record<string, string>; engines: { node: string } };
    expect(pkg.exports['./carrier/node']).toBe('./dist/carrier/node/index.js');
    expect(pkg.engines.node).toBe('>=20.16');
    const entries = Object.entries(pkg.exports).filter(([k, v]) => k !== './carrier/node' && v.endsWith('.js')).map(([, v]) => v.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, '.ts'));
    expect(entries.length).toBeGreaterThan(8);
    for (const entry of entries) {
      expect([...valueImports(entry)].filter((f) => f.includes('carrier/node/')), entry).toEqual([]);
    }
    const files = [...valueImports('src/carrier/node/index.ts')].filter((f) => f.includes('carrier/node/'));
    expect(files.sort()).toEqual(['builtins.ts', 'cli.ts', 'files.ts', 'includes.ts', 'index.ts', 'known-states.ts', 'tool.ts'].map((f) => `src/carrier/node/${f}`));
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/^\s*import\s+(?!type\b)[^;]*from\s*['"](node:|fs|path|os|child_process|crypto)/m);
      expect(src, f).not.toMatch(/\brequire\(/);
    }
    // the browser bundles: esbuild's view of the app's and the editor's entries (what a carrier bundles) never reaches it
    const { build } = await import('esbuild');
    for (const entry of ['src/carrier/app/index.ts', 'src/carrier/editor/index.ts', 'src/carrier.ts', 'src/index.ts', 'build/web-entry.js']) {
      const r = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'browser', format: 'esm', metafile: true, logLevel: 'silent' });
      expect(Object.keys(r.metafile!.inputs).filter((f) => f.includes('carrier/node')), entry).toEqual([]);
    }
    // it loads in Node without touching the file system at load (functions reach the built-ins when called)
    expect(typeof carrierNode).toBe('function');
    expect(sha256('')).toBe(kitSha256(''));
  }, 120_000);
});

// ── N.9 vocabulary ───────────────────────────────────────────────────────

describe('carrier/node vocabulary', () => {
  it('[N.9] the shared reason codes, CliError (exit 1 with a reason, 2 = bad-usage), next commands as runnable shell words, --replaces tokens, assembleArgs repeating the user\'s options, libReason and the one-object --json failure', () => {
    expect(REASONS).toEqual(['bad-usage', 'no-such-file', 'unreadable', 'not-utf8', 'write-failed', 'exists', 'not-orz', 'twin-differs', 'output-differs', 'replaces-mismatch', 'legacy-file', 'newer-shell', 'newer-format', 'unclosed-island', 'other-kind', 'assembled-input', 'invalid-text', 'engine-unavailable', 'no-browser', 'failed']);
    expect(new CliError('x')).toMatchObject({ code: 1, reason: 'failed' });
    expect(new CliError('x', EXIT_USAGE)).toMatchObject({ code: 2, reason: 'bad-usage' });
    expect(new CliError('x', 'twin-differs', { command: 'extract', args: ['a b.md.html'] })).toMatchObject({ code: 1, reason: 'twin-differs', next: { command: 'extract', args: ['a b.md.html'] } });
    expect(sh('a b')).toBe("'a b'");
    expect(sh("it's")).toBe(`'it'\\''s'`);
    expect(sh('sub/x.md')).toBe('sub/x.md');
    expect(commandLine('orz-paged', { command: 'extract', args: ['my doc.paged.html', '-o', 'x.browser.paged.md'] })).toBe("orz-paged extract 'my doc.paged.html' -o x.browser.paged.md");
    expect(node.commandLine({ command: 'assemble', args: ['x.md'] })).toBe('orz-kittest assemble x.md');
    const h = sha256('x');
    expect(replacesToken(undefined)).toBeNull();
    expect(replacesToken(h.toUpperCase())).toBe(h);
    for (const bad of [h.slice(1), `${h}0`, ` ${h}`, 'g'.repeat(64)]) expect(() => replacesToken(bad)).toThrow(/64 hex digits/);
    try { replacesToken('x'); } catch (e) { expect((e as CliError).code).toBe(2); }
    expect(assembleArgs({ out: 'pub/x.html', delivery: 'cdn', noIncludes: true }, 'x.md', ['--replaces', h])).toEqual(['x.md', '-o', 'pub/x.html', '--cdn', '--no-includes', '--replaces', h]);
    expect(assembleArgs({ noIncludes: true }, 'x.md', ['--resolve-includes'])).toEqual(['x.md', '--resolve-includes']);
    const paged = carrierNode({ name: 'orz-paged', kind: 'paged' });
    expect(paged.tool).toMatchObject({ name: 'orz-paged', kind: 'paged', cacheName: 'orz-paged', textSuffix: '.paged.md' });
    expect(paged.libReason('not an orz-paged file')).toBe('not-orz');
    expect(paged.libReason('x is an orz-mdhtml file: use orz-mdhtml')).toBe('other-kind');
    expect(paged.libReason('the engine is missing: npm run bundle')).toBe('engine-unavailable');
    expect(paged.libReason('the shell 9.0.0 is newer than this tool (1.0.0)')).toBe('newer-shell');
    expect(paged.libReason('NUL')).toBe('invalid-text');
    expect(() => carrierNode({ name: 'a b', kind: 'md' })).toThrow(/not a command name/);
    expect(() => cacheDir('../x')).toThrow(/cache folder name/);
    // the one --json failure object
    const d = folder();
    const r = cli(['extract', 'missing.md.html', '--json'], d);
    expect(r.code).toBe(1);
    expect(json(r)).toEqual({ ok: false, command: 'extract', error: `${join(d, 'missing.md.html')}: no such file`, reason: 'no-such-file', exitCode: 1 });
    const u = cli(['assemble', 'x.md', '--bogus'], d);
    expect(u.code).toBe(2);
    expect(u.stderr).toBe('orz-kittest assemble: unknown option --bogus\n(see orz-kittest assemble --help)\n');
  });
});

// ── N.2 files ────────────────────────────────────────────────────────────

describe('carrier/node files', () => {
  it('[N.2] readText reads exactly (BOM and CR LF kept; no-such-file / unreadable / not-utf8); writeOut goes through a temporary file and a rename (none left), keeps the replaced file\'s mode, replaces a symbolic link\'s target (not the link) and creates missing folders', () => {
    const d = folder();
    write(join(d, 'bom.md'), '﻿a\r\nb\r\n');
    expect(readText(join(d, 'bom.md'))).toBe('﻿a\r\nb\r\n');
    writeFileSync(join(d, 'bad.md'), Buffer.from([0x61, 0xff, 0x62]));
    expect(() => readText(join(d, 'bad.md'))).toThrow(expect.objectContaining({ reason: 'not-utf8' }));
    expect(() => readText(join(d, 'none.md'))).toThrow(expect.objectContaining({ reason: 'no-such-file' }));
    expect(() => readText(d)).toThrow(expect.objectContaining({ reason: 'unreadable' }));
    write(join(d, 'x.md'), 'old');
    chmodSync(join(d, 'x.md'), 0o640);
    writeOut(join(d, 'x.md'), 'new');
    expect(text(join(d, 'x.md'))).toBe('new');
    expect(statSync(join(d, 'x.md')).mode & 0o777).toBe(0o640);
    write(join(d, 'target.md'), 'target');
    symlinkSync('target.md', join(d, 'link.md'));
    writeOut(join(d, 'link.md'), 'through the link');
    expect(lstatSync(join(d, 'link.md')).isSymbolicLink()).toBe(true);
    expect(text(join(d, 'target.md'))).toBe('through the link');
    writeOut(join(d, 'deep', 'er', 'y.md'), 'y');
    expect(text(join(d, 'deep', 'er', 'y.md'))).toBe('y');
    noTemp(d);
    // a failed write replaces nothing and says write-failed
    mkdirSync(join(d, 'ro'));
    write(join(d, 'ro', 'z.md'), 'kept');
    chmodSync(join(d, 'ro'), 0o555);
    try {
      if (process.getuid?.() !== 0) {
        expect(() => writeOut(join(d, 'ro', 'z.md'), 'lost?')).toThrow(expect.objectContaining({ reason: 'write-failed' }));
        expect(text(join(d, 'ro', 'z.md'))).toBe('kept');
      }
    } finally { chmodSync(join(d, 'ro'), 0o755); }
  });

  it('[N.3] backups are never destroyed: <file>~, then <file>~1, ~2…; identical bytes reuse a backup; a symbolic link (or folder) at a backup name is never followed or written through; --force names the backup', () => {
    const d = folder();
    const warned: string[] = [];
    const o = { warn: (l: string) => { warned.push(l); } };
    const f = join(d, 'a.md.html');
    write(f, 'one');
    expect(backup(f, o)).toBe(`${f}~`);
    expect(backup(f, o)).toBe(`${f}~`); // the same bytes: reused
    write(f, 'two');
    expect(backup(f, o)).toBe(`${f}~1`);
    expect(text(`${f}~`)).toBe('one');
    write(join(d, 'secret'), 'not to be touched');
    symlinkSync(join(d, 'secret'), `${f}~2`);
    mkdirSync(`${f}~3`);
    write(f, 'three');
    expect(backup(f, o)).toBe(`${f}~4`);
    expect(text(join(d, 'secret'))).toBe('not to be touched');
    expect(lstatSync(`${f}~2`).isSymbolicLink()).toBe(true);
    expect(warned.at(-1)).toMatch(/kept as .*a\.md\.html~4 \(.*a\.md\.html~ already held something else; it is kept too\)/);
    // through the reference CLI: --force keeps the replaced file and says so
    write(join(d, 'p.md'), '# P\n');
    write(join(d, 'p.md.html'), '<!doctype html><p>someone else\'s page</p>');
    const r = cli(['assemble', 'p.md', '--json'], d);
    expect(json(r)).toMatchObject({ ok: false, reason: 'not-orz' });
    const forced = cli(['assemble', 'p.md', '--force', '--json'], d);
    expect(json(forced)).toMatchObject({ ok: true, backup: join(d, 'p.md.html~') });
    expect(text(join(d, 'p.md.html~'))).toMatch(/someone else/);
  });
});

// ── N.4 known states ─────────────────────────────────────────────────────

describe('carrier/node known states', () => {
  it('[N.4] the pair records live under $XDG_CACHE_HOME/<cache> (else ~/.cache/<cache>), keyed by real paths, with the file\'s last writer; an unwritable cache is not read and a pair not recorded warns with the --replaces token (which works); git HEAD, the index and recent commits are known states, compared exactly (a line-ending change is a change)', () => {
    expect(cacheDir('orz-x', { XDG_CACHE_HOME: '/c' })).toBe('/c/orz-x');
    expect(cacheDir('orz-x', { XDG_CACHE_HOME: 'relative' })).toMatch(/\.cache\/orz-x$/);
    const d = folder();
    const cache = join(d, '.c');
    write(join(d, 'x.md'), doc('X', 'doc-n4000000001'));
    expect(cli(['assemble', 'x.md'], d, { XDG_CACHE_HOME: cache }).code).toBe(0);
    expect(readdirSync(join(cache, 'orz-kittest')).sort()).toEqual(['files', 'pairs']);
    // a symbolic link to the folder: the same pair (real paths)
    symlinkSync(d, join(tmp, `link${n}`));
    write(join(d, 'x.md'), `${doc('X', 'doc-n4000000001')}\nedit\n`);
    const via = cli(['assemble', 'x.md', '--json'], join(tmp, `link${n}`), { XDG_CACHE_HOME: cache });
    expect(json(via)).toMatchObject({ ok: true, replaced: 'cache', backup: null });
    // an unwritable cache: nothing relaxed, and the warning names the token
    write(join(d, 'x.md.html'), assemble(`${doc('X', 'doc-n4000000001')}\nbrowser\n`));
    const ro = [join(cache, 'orz-kittest'), join(cache, 'orz-kittest', 'pairs'), join(cache, 'orz-kittest', 'files')];
    if (process.getuid?.() !== 0) {
      for (const p of ro) chmodSync(p, 0o555);
      try {
        const r = cli(['extract', 'x.md.html', '--json'], d, { XDG_CACHE_HOME: cache });
        expect(json(r)).toMatchObject({ ok: false, reason: 'twin-differs' }); // the record (x.md unchanged) is not read
        const h = sha256(text(join(d, 'x.md')));
        const ok = cli(['extract', 'x.md.html', '--replaces', h, '--json'], d, { XDG_CACHE_HOME: cache });
        expect(json(ok)).toMatchObject({ ok: true, replaced: 'token' });
        expect(json(ok).warnings.join('\n')).toMatch(new RegExp(`pair not recorded \\(cache not writable: .*\\); the next extract needs --replaces ${sha256(`${doc('X', 'doc-n4000000001')}\nbrowser\n`)}`));
      } finally { for (const p of ro) chmodSync(p, 0o755); }
    }
    expect(recordPair('orz-kittest', join(d, 'x.md'), join(d, 'x.md.html'), 'a', 'b')).toBe('recorded');
    // git: HEAD, the index, a recent commit
    const g = folder();
    const git = gitIn(g);
    if (!git) return;
    const T = (s: string): string => `${doc('G', 'doc-n4000000002')}\n${s}\n`;
    write(join(g, 'g.md'), T('one'));
    git('add', 'g.md'); git('commit', '-q', '-m', 'one');
    write(join(g, 'g.md.html'), assemble(T('one')));
    write(join(g, 'g.md'), T('two'));
    const fresh = { XDG_CACHE_HOME: join(g, '.none') };
    expect(json(cli(['assemble', 'g.md', '--json'], g, fresh))).toMatchObject({ ok: true, replaced: 'git-head' });
    git('add', 'g.md'); // the file holds T('two'), now staged
    write(join(g, 'g.md'), T('three'));
    expect(json(cli(['assemble', 'g.md', '--json'], g, { XDG_CACHE_HOME: join(g, '.none2') }))).toMatchObject({ ok: true, replaced: 'git-index' });
    git('commit', '-q', '-m', 'two');
    write(join(g, 'g.md'), T('four'));
    git('commit', '-q', '-am', 'four');
    write(join(g, 'g.md.html'), assemble(T('one')));
    expect(json(cli(['assemble', 'g.md', '--json'], g, { XDG_CACHE_HOME: join(g, '.none4') }))).toMatchObject({ ok: true, replaced: 'git-log' });
    // exact: the committed text with CR LF is not a known state of the twin's LF text (extract)
    write(join(g, 'g.md.html'), assemble(`${T('four')}browser\n`));
    write(join(g, 'g.md'), T('four').replace(/\n/g, '\r\n'));
    expect(json(cli(['extract', 'g.md.html', '--json'], g, { XDG_CACHE_HOME: join(g, '.none5') }))).toMatchObject({ ok: false, reason: 'twin-differs' });
    // -o outputs: git relaxes only the twin
    write(join(g, 'g.md'), T('four'));
    mkdirSync(join(g, 'pub'));
    write(join(g, 'pub', 'g.html'), assemble(T('one')));
    expect(json(cli(['assemble', 'g.md', '-o', 'pub/g.html', '--json'], g, { XDG_CACHE_HOME: join(g, '.none6') }))).toMatchObject({ ok: false, reason: 'output-differs' });
  }, 120_000);
});

// ── N.5 / N.6 guards ─────────────────────────────────────────────────────

describe('carrier/node guards', () => {
  it('[N.5] assembledOutputCheck: the same text (as stored) is replaced; a non-orz or empty output, another text, another document are not (another document: no next); the browser-newer case of an unchanged twin with the same uid names a plain extract; --replaces matches only that hash (no fallback); a 0.x file names upgrade --text; every suggested command carries the user\'s own arguments and a free name', () => {
    const d = folder();
    const X = doc('X', 'doc-n5000000001');
    write(join(d, 'x.md'), X);
    expect(cli(['assemble', 'x.md', '--cdn'], d).code).toBe(0);
    expect(json(cli(['assemble', 'x.md', '--json'], d))).toMatchObject({ ok: true, backup: null, replaced: null }); // the same text
    // mixed line endings stored in one style: the same text
    write(join(d, 'm.md'), 'a\r\nb\nc\n');
    expect(cli(['assemble', 'm.md'], d).code).toBe(0);
    expect(json(cli(['assemble', 'm.md', '--json'], d))).toMatchObject({ ok: true, backup: null });
    // the browser saved the twin; x.md unchanged: a plain extract brings it in (same uid)
    write(join(d, 'x.md.html'), assemble(`${X}browser\n`, { delivery: 'cdn' }));
    const r1 = json(cli(['assemble', 'x.md', '--json'], d));
    expect(r1).toMatchObject({ ok: false, reason: 'twin-differs', next: { command: 'extract', args: ['x.md.html'] } });
    expect(r1.error).toMatch(/x\.md is unchanged since orz-kittest last synced the pair.*`orz-kittest extract x\.md\.html` brings it into x\.md/);
    // a wrong token: refused, nothing else counts
    const wrong = json(cli(['assemble', 'x.md', '--replaces', sha256('other'), '--json'], d));
    expect(wrong).toMatchObject({ ok: false, reason: 'replaces-mismatch', next: { command: 'extract', args: ['x.md.html', '-o', 'x.browser.md'] } });
    expect(extract(text(join(d, 'x.md.html')))!.text).toBe(`${X}browser\n`);
    // the right token
    expect(json(cli(['assemble', 'x.md', '--replaces', sha256(`${X}browser\n`), '--json'], d))).toMatchObject({ ok: true, replaced: 'token' });
    // both sides changed: extract -o a free name, with the user's -o/--cdn in the re-run
    mkdirSync(join(d, 'public'));
    expect(cli(['assemble', 'x.md', '-o', 'public/x.html', '--cdn', '--no-includes'], d).code).toBe(0);
    write(join(d, 'public', 'x.html'), assemble(`${X}pub\n`, { delivery: 'cdn' }));
    write(join(d, 'x.md'), `${X}agent\n`);
    write(join(d, 'x.browser.md'), 'taken');
    const r2 = json(cli(['assemble', 'x.md', '-o', 'public/x.html', '--cdn', '--no-includes', '--json'], d));
    expect(r2).toMatchObject({ ok: false, reason: 'output-differs', next: { command: 'extract', args: ['public/x.html', '-o', 'x.browser-2.md'] } });
    const named = /`orz-kittest (assemble [^`]+)`/.exec(r2.error)![1]!.split(' ');
    expect(named).toEqual(['assemble', 'x.md', '-o', 'public/x.html', '--cdn', '--no-includes', '--replaces', sha256(`${X}pub\n`)]);
    // another document at -o: no next
    write(join(d, 'public', 'x.html'), assemble(doc('Y', 'doc-n5000000002')));
    const r3 = json(cli(['assemble', 'x.md', '-o', 'public/x.html', '--json'], d));
    expect(r3).toMatchObject({ ok: false, reason: 'output-differs' });
    expect(r3.next).toBeUndefined();
    expect(r3.error).toMatch(/holds another document \(uid doc-n5000000002; x\.md is doc-n5000000001\)/);
    // empty and non-orz outputs
    write(join(d, 'public', 'x.html'), '');
    expect(json(cli(['assemble', 'x.md', '-o', 'public/x.html', '--json'], d)).error).toMatch(/exists and is empty \(0 bytes\)/);
    // a 0.x file: upgrade --text, then assemble --replaces with the sha256 upgrade printed (never --force)
    write(join(d, 'x.md.html'), legacyFile('# old\n'));
    const r4 = json(cli(['assemble', 'x.md', '--json'], d));
    expect(r4).toMatchObject({ ok: false, reason: 'legacy-file', next: { command: 'upgrade', args: ['x.md.html', '--text', 'x.browser-2.md'] } });
    expect(r4.error).toMatch(/a legacy orz-kittest 0\.x file.*`orz-kittest assemble x\.md --replaces` followed by that sha256/);
    const up = json(cli(['upgrade', 'x.md.html', '--text', 'x.browser-2.md', '--json'], d));
    expect(up.ok).toBe(true);
    expect(text(join(d, 'x.browser-2.md'))).toBe('# old\n');
    expect(json(cli(['assemble', 'x.md', '--replaces', up.sha256, '--json'], d))).toMatchObject({ ok: true, replaced: 'token' });
    // a newer shell is refused
    write(join(d, 'x.md.html'), assemble(text(join(d, 'x.md')), { shell: '9.0.0' }));
    expect(json(cli(['assemble', 'x.md', '--json'], d))).toMatchObject({ ok: false, reason: 'newer-shell' });
    void SHELL;
  });

  it('[N.6] textOutputCheck and the uid-identity gate: extract replaces a known state of the twin only when both texts carry the same well-formed uid; another document is output-differs; a newer or older, different twin is refused whatever the times (twin-differs, next: extract -o a free name); an exact token replaces it; an empty .md.html is not an orz file', () => {
    const d = folder();
    const X = doc('X', 'doc-n6000000001');
    write(join(d, 'x.md'), X);
    expect(cli(['assemble', 'x.md'], d).code).toBe(0);
    write(join(d, 'x.md.html'), assemble(`${X}browser\n`));
    expect(json(cli(['extract', 'x.md.html', '--json'], d))).toMatchObject({ ok: true, replaced: 'cache', backup: null });
    expect(text(join(d, 'x.md'))).toBe(`${X}browser\n`);
    // another document's file copied over the twin: x.md (a known state) is not replaced
    write(join(d, 'x.md.html'), assemble(doc('Y', 'doc-n6000000002')));
    expect(json(cli(['extract', 'x.md.html', '--json'], d))).toMatchObject({ ok: false, reason: 'output-differs' });
    // a uid-less file over a uid'd twin: unchanged since the last sync, but no shared uid → refused, extract to another name
    write(join(d, 'x.md.html'), assemble('# no uid\n'));
    const r = json(cli(['extract', 'x.md.html', '--json'], d));
    expect(r).toMatchObject({ ok: false, reason: 'twin-differs', next: { command: 'extract', args: ['x.md.html', '-o', 'x.browser.md'] } });
    expect(r.error).toMatch(/do not carry the same uid/);
    expect(text(join(d, 'x.md'))).toBe(`${X}browser\n`);
    // an edited twin, whatever the times
    write(join(d, 'x.md.html'), assemble(`${X}browser 2\n`));
    write(join(d, 'x.md'), `${X}browser\nagent\n`);
    touch(join(d, 'x.md'), 1_700_000_500);
    touch(join(d, 'x.md.html'), 1_700_000_400);
    expect(json(cli(['extract', 'x.md.html', '--json'], d)).error).toMatch(/x\.md exists and holds a different text, changed after x\.md\.html — not the text orz-kittest last wrote or read/);
    touch(join(d, 'x.md'), 1_700_000_300);
    expect(json(cli(['extract', 'x.md.html', '--json'], d))).toMatchObject({ ok: false, reason: 'twin-differs' });
    // a line-ending change of the twin is a change
    write(join(d, 'y.md'), doc('Yy', 'doc-n6000000003'));
    expect(cli(['assemble', 'y.md'], d).code).toBe(0);
    write(join(d, 'y.md.html'), assemble(`${doc('Yy', 'doc-n6000000003')}browser\n`));
    write(join(d, 'y.md'), doc('Yy', 'doc-n6000000003').replace(/\n/g, '\r\n'));
    expect(json(cli(['extract', 'y.md.html', '--json'], d))).toMatchObject({ ok: false, reason: 'twin-differs' });
    // the exact token
    expect(json(cli(['extract', 'y.md.html', '--replaces', sha256(text(join(d, 'y.md'))), '--json'], d))).toMatchObject({ ok: true, replaced: 'token' });
    // a 0.x file names upgrade --text a free name when the twin exists
    write(join(d, 'z.md'), 'mine');
    write(join(d, 'z.md.html'), legacyFile('# legacy\n'));
    expect(json(cli(['extract', 'z.md.html', '--json'], d))).toMatchObject({ ok: false, reason: 'legacy-file', next: { command: 'upgrade', args: ['z.md.html', '--text', 'z.browser.md'] } });
    // an empty file holds no document
    write(join(d, 'e.md.html'), '');
    expect(json(cli(['extract', 'e.md.html', '--json'], d))).toMatchObject({ ok: false, reason: 'not-orz' });
    // the gate itself
    expect(node.sameDocument(doc('A', 'doc-n6000000004'), doc('B', 'doc-n6000000004'))).toBe(true);
    expect(node.sameDocument('# a\n', '# a\n')).toBe(false);
    expect(node.uidOf(doc('A', 'not a uid'))).toBeNull();
  });
});

// ── N.7 includes ─────────────────────────────────────────────────────────

describe('carrier/node includes', () => {
  it('[N.7] includes: the directives as the renderer finds them (not in code), file includes read from the text\'s folder only (no escape through .. or a symbolic link), includePlan keeps the record\'s used entries, re-reads with resolve, names stale records and every unresolved directive once with its reason', () => {
    const d = folder();
    const t = '# T\n\n{{md part.md}}\n\n```\n{{md in-code.md}}\n```\n\n{{markdown ../outside.md}}\n\n{{md-include link.md}}\n\n{{md https://example.com/x.md}}\n\n{{md missing.md}}\n';
    expect(includeTargets(t)).toEqual(['part.md', '../outside.md', 'link.md', 'https://example.com/x.md', 'missing.md']);
    expect(includeTargets(t, ['md'])).toEqual(['part.md', 'https://example.com/x.md', 'missing.md']);
    const sub = join(d, 'doc');
    mkdirSync(sub);
    write(join(sub, 'part.md'), 'PART\r\n');
    write(join(d, 'outside.md'), 'OUT');
    symlinkSync(join(d, 'outside.md'), join(sub, 'link.md'));
    const r = resolveFileIncludes(t, sub);
    expect(r.includes).toEqual({ 'part.md': 'PART\r\n' });
    expect(r.problems.map((p) => [p.target, p.reason])).toEqual([['../outside.md', 'outside-folder'], ['link.md', 'outside-folder'], ['missing.md', 'no-such-file']]);
    const base = { folder: sub, outName: 'x.md.html', resolveCommand: 'orz-kittest assemble x.md --resolve-includes' };
    const kept = includePlan(t, { ...base, held: { './part.md': 'OLD', 'gone.md': 'G', 'https://example.com/x.md': 'URL' }, keep: true, resolve: false });
    expect(kept.includes).toEqual({ './part.md': 'OLD', 'https://example.com/x.md': 'URL' });
    expect(kept.unresolved).toEqual([{ target: '../outside.md', kind: 'file', reason: 'outside-folder' }, { target: 'link.md', kind: 'file', reason: 'outside-folder' }, { target: 'missing.md', kind: 'file', reason: 'no-such-file' }]);
    expect(kept.warnings).toHaveLength(3);
    const stale = includePlan('{{md part.md}}\n', { ...base, held: { 'part.md': 'OLD' }, keep: true, resolve: false });
    expect(stale.stale).toEqual([{ target: 'part.md', kind: 'file', reason: 'stale-record' }]);
    expect(stale.warnings[0]).toMatch(/is stale \(stale-record\).*`orz-kittest assemble x\.md --resolve-includes`/);
    const fresh = includePlan(t, { ...base, held: { 'part.md': 'OLD', 'https://example.com/x.md': 'URL' }, keep: true, resolve: true });
    expect(fresh.includes).toEqual({ 'part.md': 'PART\r\n', 'https://example.com/x.md': 'URL' });
    expect(fresh.resolved).toBe(1);
    const none = includePlan('{{md part.md}}\n', { ...base, held: { 'part.md': 'OLD' }, keep: false, resolve: false });
    expect(none.unresolved).toEqual([{ target: 'part.md', kind: 'file', reason: 'not-recorded' }]);
    expect(none.warnings[0]).toMatch(/pass --resolve-includes/);
    expect(includePlan('{{md https://e.com/a.md}}\n', { ...base, held: null, keep: true, resolve: true }).unresolved).toEqual([{ target: 'https://e.com/a.md', kind: 'url', reason: 'url' }]);
    // through the reference CLI: kept by assemble, --no-includes drops them
    write(join(sub, 'x.md'), '{{md part.md}}\n');
    expect(json(cli(['assemble', 'x.md', '--resolve-includes', '--json'], sub))).toMatchObject({ ok: true, includes: 1, resolved: 1 });
    write(join(sub, 'part.md'), 'PART 2\n');
    const again = json(cli(['assemble', 'x.md', '--json'], sub));
    expect(again).toMatchObject({ ok: true, includes: 1, stale: [{ target: 'part.md', kind: 'file', reason: 'stale-record' }] });
    expect(extract(text(join(sub, 'x.md.html')))!.includes).toEqual({ 'part.md': 'PART\r\n' });
    expect(json(cli(['assemble', 'x.md', '--no-includes', '--json'], sub))).toMatchObject({ ok: true, includes: 0, unresolved: [{ target: 'part.md', kind: 'file', reason: 'not-recorded' }] });
  });
});

// ── N.8 follow every next verbatim ───────────────────────────────────────

describe('carrier/node: following next', () => {
  it('[N.8] following every refusal\'s next verbatim never loses a text: two inputs to one -o, an input against another\'s twin, browser saves on the twin and on -o, both sides changed, a copied file, a stale last writer (read-only cache, two caches) — with and without uids, with and without git; a next never forces and ends in success', () => {
    let docs = 0;
    const docText = (title: string, uid: boolean): string => (uid
      ? `{{nyml\nkind: document\nuid: doc-n8${String(++docs).padStart(9, '0')}\ntitle: ${title}\n}}\n\n# ${title}\n\n${title} body\n`
      : `# ${title}\n\n${title} body\n`);
    interface Scenario { d: string; env: Record<string, string>; texts: Map<string, string | null>; log: string[] }
    const present = (s: Scenario): Set<string> => {
      const all = new Set<string>();
      for (const rel of readdirSync(s.d, { recursive: true }) as string[]) {
        if (/^\.(git|cache)(\/|$)/.test(rel)) continue;
        const p = join(s.d, rel);
        if (!statSync(p).isFile()) continue;
        const t = text(p);
        all.add(t);
        const held = extract(t);
        if (held) all.add(held.text);
      }
      return all;
    };
    const kept = (s: Scenario, t: string, here: Set<string>): boolean => here.has(t) || [...s.texts].some(([child, parent]) => parent === t && kept(s, child, here));
    const lost = (s: Scenario): string[] => { const here = present(s); return [...s.texts.keys()].filter((t) => !kept(s, t, here)); };
    const descends = (s: Scenario, t: string, of: string): boolean => { for (let c: string | null | undefined = t; c; c = s.texts.get(c)) if (c === of) return true; return false; };
    const textFiles = (s: Scenario): Map<string, string> => new Map((readdirSync(s.d, { recursive: true }) as string[]).filter((rel) => !/^\.(git|cache)(\/|$)/.test(rel) && rel.endsWith('.md') && statSync(join(s.d, rel)).isFile()).map((rel) => [rel, text(join(s.d, rel))]));
    const run = (s: Scenario, args: string[]): Run => {
      const before = textFiles(s);
      const r = cli([...args, '--json'], s.d, s.env);
      s.log.push(`${args.join(' ')} -> ${r.code} ${r.code ? String(JSON.parse(r.stdout).reason) : ''}`);
      expect(lost(s), s.log.join('\n')).toEqual([]);
      for (const [rel, now] of textFiles(s)) {
        const was = before.get(rel);
        if (was !== undefined && was !== now) expect(descends(s, now, was), `${s.log.join('\n')}\n${rel}: ${JSON.stringify(was)} became ${JSON.stringify(now)}`).toBe(true);
      }
      return r;
    };
    const put = (s: Scenario, rel: string, t: string, from: string | null = null): void => {
      mkdirSync(join(s.d, rel, '..'), { recursive: true });
      write(join(s.d, rel), rel.endsWith('.html') ? assemble(t, { delivery: 'cdn' }) : t);
      if (!s.texts.has(t)) s.texts.set(t, from);
    };
    const step = (s: Scenario, args: string[]): Run => {
      let r = run(s, args);
      for (let depth = 0; r.code !== 0 && JSON.parse(r.stdout).next; depth++) {
        expect(depth, s.log.join('\n')).toBeLessThan(3);
        const next = JSON.parse(r.stdout).next as { command: string; args: string[] };
        expect(next.args, s.log.join('\n')).not.toContain('--force');
        s.log.push('  next:');
        r = run(s, [next.command, ...next.args]);
        if (r.code !== 0) expect(JSON.parse(r.stdout).next, `${s.log.join('\n')}\n${r.stdout}`).toBeDefined();
      }
      return r;
    };
    const scenario = (uid: boolean, withGit: boolean): { s: Scenario; commit: (...files: string[]) => void } | null => {
      const d = folder();
      const git = withGit ? gitIn(d) : null;
      if (withGit && !git) return null;
      const s: Scenario = { d, env: { XDG_CACHE_HOME: join(d, '.cache') }, texts: new Map(), log: [`uid ${uid}, git ${withGit}`] };
      return { s, commit: (...files) => { if (!git) return; git('add', ...files); git('commit', '-q', '-m', 'c'); } };
    };
    for (const uid of [false, true]) {
      for (const withGit of [false, true]) {
        const one = scenario(uid, withGit);
        if (!one) continue;
        {
          const { s, commit } = one;
          const A = docText('A', uid);
          const B = docText('B', uid);
          put(s, 'a.md', A);
          put(s, 'b.md', B);
          commit('a.md', 'b.md');
          expect(step(s, ['assemble', 'a.md', '-o', 'out/site.html', '--cdn']).code).toBe(0);
          step(s, ['assemble', 'b.md', '-o', 'out/site.html']);
          step(s, ['assemble', 'b.md', '-o', 'out/site.html', '--replaces', sha256(A)]);
          const back = step(s, ['assemble', 'a.md', '-o', 'out/site.html']);
          if (uid) expect(String(JSON.parse(back.stdout).error ?? ''), s.log.join('\n')).not.toMatch(/brings it into a\.md/);
          step(s, ['extract', 'out/site.html', '-o', 'a.md']);
          step(s, ['upgrade', 'out/site.html', '--text', 'a.md']);
          expect(text(join(s.d, 'a.md')), s.log.join('\n')).toBe(A);
        }
        {
          const { s, commit } = scenario(uid, withGit)!;
          const X = docText('X', uid);
          const Y = docText('Y', uid);
          put(s, 'x.md', X);
          put(s, 'y.md', Y);
          commit('x.md', 'y.md');
          expect(step(s, ['assemble', 'x.md', '--cdn']).code).toBe(0);
          step(s, ['assemble', 'y.md', '-o', 'x.md.html']);
          step(s, ['assemble', 'y.md', '-o', 'x.md.html', '--replaces', sha256(X)]);
          step(s, ['assemble', 'x.md']);
          step(s, ['extract', 'x.md.html']);
          step(s, ['upgrade', 'x.md.html']);
          expect(text(join(s.d, 'x.md')), s.log.join('\n')).toBe(X);
        }
        {
          const { s, commit } = scenario(uid, withGit)!;
          const X = docText('X', uid);
          put(s, 'x.md', X);
          commit('x.md');
          expect(step(s, ['assemble', 'x.md', '--cdn']).code).toBe(0);
          put(s, 'x.md.html', `${X}browser\n`, X);
          expect(step(s, ['assemble', 'x.md']).code).toBe(0);
          expect(text(join(s.d, 'x.md'))).toBe(uid ? `${X}browser\n` : X);
          if (!uid) expect(text(join(s.d, 'x.browser.md'))).toBe(`${X}browser\n`);
          expect(step(s, ['assemble', 'x.md', '-o', 'pub/x.html', '--cdn']).code).toBe(0);
          const P = uid ? `${X}browser\npub\n` : `${X}pub\n`;
          put(s, 'pub/x.html', P, uid ? `${X}browser\n` : X);
          expect(step(s, ['assemble', 'x.md', '-o', 'pub/x.html']).code).toBe(0);
          expect(text(join(s.d, 'x.md'))).toBe(uid ? P : X);
        }
        {
          const { s, commit } = scenario(uid, withGit)!;
          const X = docText('X', uid);
          put(s, 'x.md', X);
          commit('x.md');
          expect(step(s, ['assemble', 'x.md', '--cdn']).code).toBe(0);
          put(s, 'x.md.html', `${X}browser\n`, X);
          put(s, 'x.md', `${X}agent\n`, X);
          step(s, ['assemble', 'x.md']);
          step(s, ['extract', 'x.md.html']);
          step(s, ['upgrade', 'x.md.html']);
          expect(text(join(s.d, 'x.md'))).toBe(`${X}agent\n`);
        }
        for (const yUid of [false, true]) {
          for (const record of [false, true]) {
            const s = scenario(uid, withGit)!;
            s.s.log.push(`copied file: y uid ${yUid}, record ${record}`);
            const X = docText('X', uid);
            const Y = docText('Y', yUid);
            put(s.s, 'x.md', X);
            put(s.s, 'y.md', Y);
            s.commit('x.md', 'y.md');
            if (record) expect(step(s.s, ['assemble', 'x.md', '--cdn']).code).toBe(0);
            expect(step(s.s, ['assemble', 'y.md', '--cdn']).code).toBe(0);
            copyFileSync(join(s.s.d, 'y.md.html'), join(s.s.d, 'x.md.html'));
            const asked = run(s.s, ['assemble', 'x.md']);
            expect(JSON.parse(asked.stdout).next?.args, s.s.log.join('\n')).not.toEqual(['x.md.html']);
            step(s.s, ['extract', 'x.md.html']);
            step(s.s, ['upgrade', 'x.md.html']);
            step(s.s, ['assemble', 'x.md']);
            expect(text(join(s.s.d, 'x.md')), s.s.log.join('\n')).toBe(X);
          }
        }
        for (const split of [false, true]) {
          if (!split && process.getuid?.() === 0) continue;
          const s = scenario(uid, withGit)!;
          s.s.log.push(split ? 'two caches' : 'read-only cache');
          const A = docText('A', uid);
          const B = docText('B', uid);
          put(s.s, 'a.md', A);
          put(s.s, 'b.md', B);
          s.commit('a.md', 'b.md');
          const own = s.s.env;
          const root = join(s.s.d, '.cache');
          const dirs = [root, join(root, 'orz-kittest'), join(root, 'orz-kittest', 'pairs'), join(root, 'orz-kittest', 'files')];
          try {
            expect(step(s.s, ['assemble', 'a.md', '-o', 'site.html', '--cdn']).code).toBe(0);
            if (split) s.s.env = { XDG_CACHE_HOME: join(root, 'm2') };
            else for (const dir of dirs) chmodSync(dir, 0o555);
            expect(step(s.s, ['assemble', 'b.md', '-o', 'site.html', '--replaces', sha256(A)]).code).toBe(0);
            s.s.env = own;
            step(s.s, ['assemble', 'a.md', '-o', 'site.html']);
            step(s.s, ['extract', 'site.html', '-o', 'a.md']);
            step(s.s, ['upgrade', 'site.html', '--text', 'a.md']);
            expect(text(join(s.s.d, 'a.md')), s.s.log.join('\n')).toBe(A);
          } finally {
            for (const dir of dirs) if (existsSync(dir)) chmodSync(dir, 0o755);
          }
        }
      }
    }
  }, 600_000);
});

// ── N.10 exact comparisons (ported from orz-paged T.7 / T.12 / T.20, round 1 of the paged loop) ──

describe('carrier/node: the comparisons are exact', () => {
  const fresh = (d: string, tag: string): Record<string, string> => ({ XDG_CACHE_HOME: join(d, `.none-${tag}`) }); // no record

  it('[N.10] [N.5] assemble: an output differing only by trailing white space is not "the same text" (no trimming before the compare); --replaces is compared in full (a token sharing the first 16 digits is replaces-mismatch, for assemble and extract)', () => {
    const d = folder();
    const X = doc('X', 'doc-n1000000001');
    write(join(d, 'x.md.html'), assemble(X));
    for (const [i, t] of [`${X}\n`, `${X}\n\n  \n`, `\n${X}`, `${X.slice(0, -1)}  \n`].entries()) {
      write(join(d, 'x.md'), t);
      const r = json(cli(['assemble', 'x.md', '--json'], d, fresh(d, `a${i}`)));
      expect(r, JSON.stringify(t)).toMatchObject({ ok: false, reason: 'twin-differs' });
      expect(extract(text(join(d, 'x.md.html')))!.text).toBe(X);
    }
    // the token: full length, every digit
    write(join(d, 'x.md'), `${X}agent\n`);
    const held = sha256(X);
    for (const at of [8, 16, 63]) {
      const near = held.slice(0, at) + (held[at] === '0' ? '1' : '0') + held.slice(at + 1);
      expect(json(cli(['assemble', 'x.md', '--replaces', near, '--json'], d, fresh(d, `t${at}`))), `digit ${at}`).toMatchObject({ ok: false, reason: 'replaces-mismatch' });
      expect(extract(text(join(d, 'x.md.html')))!.text).toBe(X);
    }
    const twin = sha256(`${X}agent\n`);
    write(join(d, 'x.md.html'), assemble(`${X}browser\n`));
    const near = twin.slice(0, 16) + (twin[16] === '0' ? '1' : '0') + twin.slice(17);
    expect(json(cli(['extract', 'x.md.html', '--replaces', near, '--json'], d, fresh(d, 'e')))).toMatchObject({ ok: false, reason: 'replaces-mismatch' });
    expect(text(join(d, 'x.md'))).toBe(`${X}agent\n`);
    expect(json(cli(['assemble', 'x.md', '--replaces', sha256(`${X}browser\n`), '--json'], d, fresh(d, 'ok')))).toMatchObject({ ok: true, replaced: 'token' });
  });

  it('[N.10] [N.6] extract: a twin that differs only by CR LF (or trailing white space) is a difference, never "the same text" (no line-ending normalisation before the compare)', () => {
    const d = folder();
    const C = doc('C', 'doc-n1000000002');
    write(join(d, 'c.md.html'), assemble(`${C}body\n`));
    for (const [i, t] of [`${C}body\n`.replace(/\n/g, '\r\n'), `${C}body\r\n`, `${C}body\n\n`].entries()) {
      write(join(d, 'c.md'), t);
      expect(json(cli(['extract', 'c.md.html', '--json'], d, fresh(d, `c${i}`))), JSON.stringify(t)).toMatchObject({ ok: false, reason: 'twin-differs' });
      expect(text(join(d, 'c.md'))).toBe(t);
    }
    write(join(d, 'c.md'), `${C}body\n`);
    expect(json(cli(['extract', 'c.md.html', '--json'], d, fresh(d, 'same')))).toMatchObject({ ok: true, backup: null });
  });

  it('[N.10] [N.4] git: a file assembled from a committed text with mixed line endings holds that text as stored and is a known state (git-head) — the stored form is compared, not the raw text; a pair whose file another input last wrote is never a known state through git (the last-writer gate)', () => {
    const g = folder();
    const git = gitIn(g);
    if (!git) return;
    const H = '{{nyml\nkind: document\nuid: doc-n1000000003\n}}\n\n';
    const committed = `${H}a\r\nb\nc\n`; // mixed: the file stores it in one style
    write(join(g, 'g.md'), committed);
    git('add', 'g.md'); git('commit', '-q', '-m', 'g');
    expect(cli(['assemble', 'g.md'], g, fresh(g, 'w')).code).toBe(0);
    const held = extract(text(join(g, 'g.md.html')))!.text;
    expect(held).not.toBe(committed); // stored ≠ raw
    write(join(g, 'g.md'), `${committed}edited\n`);
    expect(json(cli(['assemble', 'g.md', '--json'], g, fresh(g, 'r')))).toMatchObject({ ok: true, replaced: 'git-head' });
    // the last-writer gate: x.md is committed and unchanged, but y.md (the same document, another text) last wrote x.md.html
    const X = doc('X', 'doc-n1000000004');
    const Y = `${X}from y\n`;
    write(join(g, 'x.md'), X);
    write(join(g, 'y.md'), Y);
    git('add', 'x.md', 'y.md'); git('commit', '-q', '-m', 'xy');
    const env = fresh(g, 'gate');
    expect(cli(['assemble', 'x.md'], g, env).code).toBe(0);
    expect(json(cli(['assemble', 'y.md', '-o', 'x.md.html', '--replaces', sha256(X), '--json'], g, env))).toMatchObject({ ok: true, replaced: 'token' });
    const r = json(cli(['extract', 'x.md.html', '--json'], g, env));
    expect(r).toMatchObject({ ok: false, reason: 'twin-differs' });
    expect(text(join(g, 'x.md'))).toBe(X);
  }, 120_000);

  it('[N.10] [N.2] writeOut keeps the replaced file\'s mode whatever the umask (chmod after the write)', () => {
    const d = folder();
    const f = join(d, 'm.md');
    write(f, 'old');
    chmodSync(f, 0o664);
    const was = process.umask(0o077);
    try { writeOut(f, 'new'); } finally { process.umask(was); }
    expect(text(f)).toBe('new');
    expect(statSync(f).mode & 0o777).toBe(0o664);
    noTemp(d);
  });
});
