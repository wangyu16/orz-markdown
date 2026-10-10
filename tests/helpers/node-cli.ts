/**
 * A reference carrier CLI built only from `orz-markdown/carrier/node` (and
 * the kit's envelope), for tests/carrier-node.test.ts: `assemble`,
 * `extract` and `upgrade` of kind md (x.md ↔ x.md.html), shaped like
 * orz-mdhtml's and orz-paged's commands, run IN PROCESS (`runCli` changes
 * the working folder and environment for the call and captures stdout and
 * stderr). Its 0.x files: a generator `orz-kittest 0.x` and a config
 * `window.__ORZ_KITTEST__`, read by the kit's `readLegacyIsland`.
 */
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { assembleEnvelope, extract, readLegacyIsland, twinName } from '../../src/carrier/index.js';
import {
  carrierNode, CliError, emit, includePlan, readMaybe, readText, replacesToken, reportFailure, sh, writeOut, assembleArgs,
  sha256 as sha, EXIT_USAGE, type AssembleCall, type Io, type Next, type Risk,
} from '../../src/carrier/node/index.js';

export const TOOL = 'orz-kittest';
export const SHELL = '1.0.0';

/** The tool's 0.x reader. */
export function readLegacy(html: string): { text: string; version: string | null } | null {
  const island = readLegacyIsland(html, { generator: /^orz-kittest(\s|$)/, config: '__ORZ_KITTEST__' });
  if (!island) return null;
  return { text: island.text, version: /^orz-kittest\s+(\S+)/.exec(island.generator ?? '')?.[1] ?? null };
}

/** A 0.x file of the tool holding `text`. */
export function legacyFile(text: string, version = '0.9.0'): string {
  return `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="generator" content="orz-kittest ${version}"><script>window.__ORZ_KITTEST__ = {"version":"${version}"}</script></head>\n<body><script type="text/markdown" id="orz-src">\n${text.replace(/<\/script/gi, '<\\/script')}\n</script></body></html>\n`;
}

/** The tool's assemble (the kit envelope, kind md). */
export function assemble(text: string, o: { delivery?: 'inline' | 'cdn'; includes?: Record<string, string>; shell?: string } = {}): string {
  return assembleEnvelope(text, { kind: 'md', shellVersion: o.shell ?? SHELL, delivery: o.delivery ?? 'inline', headHtml: '<style>p{}</style>', bodyHtml: '<main></main>', ...(o.includes ? { includes: o.includes } : {}) });
}

export const node = carrierNode({ name: TOOL, kind: 'md', cacheName: 'orz-kittest', readLegacy });

/** a > b for x.y.z versions. */
const newerThan = (a: string, b: string): boolean => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

interface Parsed { positional: string[]; values: Record<string, string>; flags: Set<string> }
const VALUES = new Set(['-o', '--out', '--replaces', '--text']);

function parse(argv: string[]): Parsed {
  const out: Parsed = { positional: [], values: {}, flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('-') || a === '-') { out.positional.push(a); continue; }
    if (VALUES.has(a)) {
      const v = argv[++i];
      if (v === undefined) throw new CliError(`${a} needs a value`, EXIT_USAGE);
      out.values[a === '-o' ? '--out' : a] = v;
    } else if (['--cdn', '--inline', '--force', '--json', '--resolve-includes', '--no-includes', '--no-text'].includes(a)) out.flags.add(a);
    else throw new CliError(`unknown option ${a}`, EXIT_USAGE);
  }
  return out;
}

const call = (p: Parsed): AssembleCall => ({
  ...(p.values['--out'] !== undefined ? { out: p.values['--out'] } : {}),
  ...(p.flags.has('--cdn') ? { delivery: 'cdn' as const } : p.flags.has('--inline') ? { delivery: 'inline' as const } : {}),
  resolveIncludes: p.flags.has('--resolve-includes'),
  noIncludes: p.flags.has('--no-includes'),
});

function cmdAssemble(p: Parsed, o: Io): void {
  const file = p.positional[0]!;
  const input = resolve(file);
  const token = replacesToken(p.values['--replaces']);
  const text = readText(input);
  const outArg = p.values['--out'];
  const out = outArg !== undefined ? resolve(outArg) : twinName(input);
  if (out === null) throw new CliError(`cannot name the output of ${file}`, EXIT_USAGE);
  const exists = existsSync(out);
  const existing = exists ? readMaybe(out) : null;
  const names = { input: node.shown(input, file), out: node.shown(out, outArg ?? twinName(file) ?? undefined), twin: out === twinName(input) };
  const check = exists ? node.assembledOutputCheck({ input, out, text, names, token, call: call(p) }, existing) : { risk: null, earlier: null };
  const prior = existing !== null ? extract(existing) : null;
  const d = p.flags.has('--cdn') ? 'cdn' : p.flags.has('--inline') ? 'inline' : prior?.delivery === 'cdn' ? 'cdn' : 'inline';
  const newer = prior && prior.shell && newerThan(prior.shell, SHELL) ? prior.shell : null;
  const shellRisk: Risk | null = newer ? { message: `${names.out} was made by a newer ${TOOL} (${newer})`, reason: 'newer-shell' } : null;
  const force = p.flags.has('--force');
  if (!force) for (const r of [check.risk, shellRisk]) if (r) throw new CliError(r.message, r.reason, r.next);
  const plan = includePlan(text, { folder: dirname(input), held: prior?.includes ?? null, keep: !p.flags.has('--no-includes'), resolve: p.flags.has('--resolve-includes'), outName: names.out, resolveCommand: node.commandLine({ command: 'assemble', args: assembleArgs(call(p), names.input, ['--resolve-includes']) }) });
  for (const w of plan.warnings) o.warn(w);
  const html = assemble(text, { delivery: d, ...(Object.keys(plan.includes).length ? { includes: plan.includes } : {}) });
  const backedUp = check.risk !== null || shellRisk !== null ? node.guard(out, check.risk ?? shellRisk, true, o) : null;
  writeOut(out, html);
  const stored = node.tool.storedText(text);
  const hash = sha(stored);
  node.rememberPair(input, out, stored, text, o, { command: 'assemble', sha: hash });
  o.say(`Wrote ${out}`);
  emit(o, { command: 'assemble', output: out, replaced: check.earlier, backup: backedUp, sha256: hash, includes: Object.keys(plan.includes).length, resolved: plan.resolved, unresolved: plan.unresolved, stale: plan.stale });
}

function cmdExtract(p: Parsed, o: Io): void {
  const file = p.positional[0]!;
  const input = resolve(file);
  const token = replacesToken(p.values['--replaces']);
  const html = readText(input);
  const outArg = p.values['--out'];
  const legacy = readLegacy(html);
  if (legacy) {
    const textTarget = outArg ?? twinName(file) ?? undefined;
    const taken = textTarget !== undefined && existsSync(resolve(textTarget));
    const next: Next = { command: 'upgrade', args: [file, ...(textTarget === undefined ? [] : taken ? ['--text', node.otherName(textTarget)] : outArg !== undefined ? ['--text', outArg] : [])] };
    throw new CliError(`${file} is a 0.x file: run \`${node.commandLine(next)}\``, 'legacy-file', next);
  }
  const ex = extract(html);
  if (!ex) throw new CliError(`${file} holds no orz document`, 'not-orz', { command: 'inspect', args: [file] });
  const out = outArg !== undefined ? resolve(outArg) : twinName(input);
  if (out === null) throw new CliError(`cannot name the text twin of ${file}`, EXIT_USAGE);
  const names = { out: node.shown(out, outArg ?? twinName(file) ?? undefined), file };
  const other = node.otherName(names.out);
  const outArgs = outArg !== undefined ? ['-o', outArg] : [];
  const check = node.textOutputCheck({
    out, text: ex.text, file: input, names, token, uid: node.uidOf(ex.text),
    advice: (h) => {
      const pull: Next = { command: 'extract', args: [file, '-o', other] };
      return { message: `extract to another name and merge: \`${node.commandLine(pull)}\`.${h ? ` \`${node.commandLine({ command: 'extract', args: [file, ...outArgs, '--replaces', h] })}\` replaces it while it still holds that text;` : ''} --force replaces it anyway`, next: pull };
    },
  });
  const backedUp = node.guard(out, check.risk, p.flags.has('--force'), o);
  writeOut(out, ex.text);
  const hash = sha(ex.text);
  node.rememberPair(out, input, ex.text, ex.text, o, { command: 'extract', sha: hash });
  o.say(`Wrote ${out}`);
  emit(o, { command: 'extract', output: out, replaced: check.earlier, backup: backedUp, sha256: hash });
}

function cmdUpgrade(p: Parsed, o: Io): void {
  const file = p.positional[0]!;
  const input = resolve(file);
  const html = readText(input);
  const legacy = readLegacy(html);
  const ex = legacy ? null : extract(html);
  if (!legacy && !ex) throw new CliError(`${file} holds no orz document`, 'not-orz');
  const text = legacy ? legacy.text : ex!.text;
  const d = p.flags.has('--cdn') ? 'cdn' : p.flags.has('--inline') ? 'inline' : ex?.delivery === 'cdn' ? 'cdn' : 'inline';
  const force = p.flags.has('--force');
  const out = p.values['--out'] !== undefined ? resolve(p.values['--out']) : input;
  const outName = node.shown(out, p.values['--out'] ?? file);
  const newHtml = assemble(text, { delivery: d, ...(ex?.includes ? { includes: ex.includes } : {}) });
  const textOut = p.flags.has('--no-text') ? null : p.values['--text'] !== undefined ? resolve(p.values['--text']) : twinName(out);
  if (textOut === out || textOut === input) throw new CliError('the text twin would overwrite the file', EXIT_USAGE);
  let outRisk: Risk | null = null;
  if (out !== input && existsSync(out)) {
    const existing = readMaybe(out);
    const held = existing !== null ? node.documentTextOf(existing) : null;
    if (held === null) outRisk = { message: `${outName} exists and is not an orz file`, reason: 'not-orz' };
    else if (held !== text) outRisk = { message: `${outName} exists and holds another text`, reason: 'output-differs' };
  }
  const textName = textOut === null ? '' : node.shown(textOut, p.values['--text'] ?? twinName(outName) ?? undefined);
  const otherText = node.otherName(textName);
  const newUid = node.uidOf(text);
  const textCheck = textOut ? node.textOutputCheck({
    out: textOut, text, file: out, names: { out: textName, file: outName }, token: null, uid: newUid,
    advice: () => ({ message: `pass --text ${otherText} (then merge)`, next: { command: 'upgrade', args: [file, ...(p.values['--out'] !== undefined ? ['-o', outName] : []), '--text', otherText] } }),
  }) : { risk: null, earlier: null };
  if (!force) for (const r of [outRisk, textCheck.risk]) if (r) throw new CliError(r.message, r.reason, r.next);
  const backups: string[] = [];
  const ob = node.guard(out, outRisk, force, o);
  if (ob) backups.push(ob);
  if (textOut) { const tb = node.guard(textOut, textCheck.risk, force, o); if (tb) backups.push(tb); }
  writeOut(out, newHtml);
  const held = extract(newHtml)!.text;
  if (textOut) { writeOut(textOut, text); node.rememberPair(textOut, out, held, text, o, { command: 'assemble', sha: sha(held) }); }
  emit(o, { command: 'upgrade', output: out, text: textOut, backups, sha256: sha(held) });
}

const COMMANDS: Record<string, (p: Parsed, o: Io) => void> = { assemble: cmdAssemble, extract: cmdExtract, upgrade: cmdUpgrade };

export interface Run { code: number; stdout: string; stderr: string }

/** Run the reference CLI in process: `cwd` as the working folder, `env` added to the environment, stdout/stderr captured. */
export function runCli(argv: string[], cwd: string, env: Record<string, string | undefined> = {}): Run {
  const before = process.cwd();
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  const out: string[] = [];
  const err: string[] = [];
  const w1 = process.stdout.write;
  const w2 = process.stderr.write;
  process.stdout.write = ((s: string) => { out.push(String(s)); return true; }) as typeof process.stdout.write;
  process.stderr.write = ((s: string) => { err.push(String(s)); return true; }) as typeof process.stderr.write;
  process.chdir(cwd);
  const json = argv.includes('--json');
  const command = COMMANDS[argv[0]!] ? argv[0]! : 'assemble';
  let code = 0;
  try {
    const rest = COMMANDS[argv[0]!] ? argv.slice(1) : argv;
    COMMANDS[command]!(parse(rest), node.io(json));
  } catch (e) {
    code = reportFailure(TOOL, command, e, json);
  } finally {
    process.chdir(before);
    process.stdout.write = w1;
    process.stderr.write = w2;
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
  return { code, stdout: out.join(''), stderr: err.join('') };
}

export { sh };
