/**
 * `orz-markdown/carrier/conformance` — the carrier conformance harness
 * (spec/conformance.md; orz rebuild Phase 2). It drives a carrier — its Node
 * `assemble`/`create`, its browser bundle and `release.json` — through the
 * FC-18 laws, the bundle rule, create → edit → save → update and the host
 * handshakes, in Node and in real Chrome, and reports one result per check
 * (stable ids `C.<area>.<name>`, see `CHECKS`).
 *
 * Node only (it serves pages and launches a browser), and test tooling: it is
 * not imported by any other entry of the package. Node built-ins are reached
 * through `process.getBuiltinModule`; `playwright-core` (an optional peer
 * dependency) is loaded only when a browser check runs, and the browser checks
 * are reported `skipped` when no browser can be launched.
 */
import { VERSION } from '../../version.js';
import { CHECKS, CHECK_IDS, checkInfo } from './catalog.js';
import { NotApplicable, Probe, Skip, bundleChecks, createChecks, editChecks, hostChecks, lawChecks, prefChecks, saveChecks, updateChecks, type CheckFn } from './checks.js';
import { loadCorpus } from './node.js';
import { Session } from './session.js';
import type { CarrierTarget, CheckResult, ConformanceOptions, ConformanceReport, TestApi } from './types.js';

export { CHECKS, CHECK_IDS } from './catalog.js';
export type { CheckInfo } from './catalog.js';
export { HAZARD_TEXTS, REFUSED_TEXTS, EDIT_TEXT } from './texts.js';
export { loadCorpus } from './node.js';
export { derivedParts } from './checks.js';
// page helpers for a carrier's own browser tests (2.2.0, claim H.6)
export { initScript, OPFS_FOLDER, READ_OPFS, WRITE_OPFS, PAGE_HELPERS, PAGE_LOG, RECORD_BINDING, DEFAULT_EDITOR_DRIVER, mountEditorScript, HOST_PAGE } from './page.js';
export type { PickerMode } from './page.js';
export { callPage, readOpfs, writeOpfs, pageRecords } from './helpers.js';
export type { OpfsPlace } from './helpers.js';
export { FILE_ACCESS_FLAG, CODEMIRROR_URL } from './session.js';
export type { AssembleOptions, BundleSource, CarrierTarget, CheckResult, CheckStatus, ConformanceOptions, ConformanceReport, TestApi, BrowserLike } from './types.js';

const DEFAULT_TIMEOUT = 120_000;
const DEFAULT_LANES = 3;

/**
 * Checks that run alone (no other check runs beside them): they time the
 * reader's typing against a script that floods the page, and a loaded
 * machine must not make them flaky.
 */
export const EXCLUSIVE_CHECKS: readonly string[] = ['C.edit.preview-isolation'];
/** Started first: they mostly wait (a host that never acknowledges takes 10 s). */
const FIRST: readonly string[] = ['C.host.no-ack', 'C.update.edit-during', 'C.update.resigned', 'C.save.save-as-elsewhere', 'C.save.copy-elsewhere', 'C.save.conflict', 'C.law.content-independence', 'C.law.determinism'];

function selected(options: ConformanceOptions): string[] {
  for (const id of [...(options.only ?? []), ...(options.skip ?? [])]) checkInfo(id); // unknown ids throw
  return CHECK_IDS.filter((id) => (!options.only || options.only.includes(id)) && !(options.skip ?? []).includes(id));
}

function corpusOf(target: CarrierTarget, options: ConformanceOptions): () => Record<string, string> {
  let cache: Record<string, string> | null = null;
  return () => {
    if (cache) return cache;
    const c = options.corpus;
    cache = c === false ? {} : typeof c === 'object' ? { ...c } : loadCorpus(target.kind, c);
    return cache;
  };
}

function implementations(corpus: () => Record<string, string>): Record<string, CheckFn> {
  return { ...lawChecks(corpus), ...bundleChecks, ...createChecks, ...editChecks, ...saveChecks, ...updateChecks, ...hostChecks, ...prefChecks };
}

/** @internal The ids that have an implementation (equal to `CHECK_IDS`; tested). */
export function implementedChecks(): string[] {
  return Object.keys(implementations(() => ({})));
}

/** A harness session over one target, then close. */
export interface ConformanceRunner {
  /** Run one check (in its own scope: its contexts are closed when it ends). */
  run(id: string): Promise<CheckResult>;
  /**
   * Run checks side by side in `lanes` lanes (default `options.lanes`, else 3);
   * the {@link EXCLUSIVE_CHECKS} among them run first, alone. Resolves one
   * promise per id (in the order given).
   */
  schedule(ids: readonly string[], lanes?: number): Map<string, Promise<CheckResult>>;
  close(): Promise<void>;
}

/** Open a session (servers, browser) for the selected checks. */
export async function openConformance(target: CarrierTarget, options: ConformanceOptions = {}): Promise<ConformanceRunner> {
  const ids = selected(options);
  const needsBrowser = ids.some((id) => checkInfo(id).chrome);
  const fns = implementations(corpusOf(target, options));
  const session = await Session.open(target, options, needsBrowser);
  const limit = options.checkTimeoutMs ?? DEFAULT_TIMEOUT;
  const run = async (id: string): Promise<CheckResult> => {
      const info = checkInfo(id);
      const fn = fns[id];
      const t0 = Date.now();
      const p = new Probe();
      const scope = session.scope();
      let status: CheckResult['status'] = 'passed';
      let message: string | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          fn(scope, p),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${limit} ms`)), limit); }),
        ]);
      } catch (e) {
        if (e instanceof NotApplicable) { status = 'not-applicable'; message = e.message; }
        else if (e instanceof Skip) { status = 'skipped'; message = e.message; }
        else p.fail(`error: ${String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')}`);
      } finally {
        if (timer) clearTimeout(timer);
        await scope.closeContexts();
      }
      if (p.failures.length > 0) { status = 'failed'; message = p.failures.join('\n'); }
      const result: CheckResult = { id, title: info.title, status, ...(message ? { message } : {}), ...(p.failures.length ? { failures: [...p.failures] } : {}), durationMs: Date.now() - t0 };
      options.log?.(`${status.padEnd(7)} ${id} (${result.durationMs} ms)${status === 'passed' ? '' : `: ${message?.split('\n')[0]}`}`);
      return result;
  };
  const schedule = (list: readonly string[], lanes = options.lanes ?? DEFAULT_LANES): Map<string, Promise<CheckResult>> => {
    const settle = new Map<string, (r: CheckResult) => void>();
    const out = new Map<string, Promise<CheckResult>>();
    for (const id of list) out.set(id, new Promise<CheckResult>((resolve) => { settle.set(id, resolve); }));
    const rank = (id: string): number => { const i = FIRST.indexOf(id); return i < 0 ? FIRST.length : i; };
    const alone = list.filter((id) => EXCLUSIVE_CHECKS.includes(id));
    const rest = list.filter((id) => !EXCLUSIVE_CHECKS.includes(id)).sort((x, y) => rank(x) - rank(y));
    const go = async (id: string): Promise<void> => {
      let r: CheckResult;
      try { r = await run(id); } catch (e) { r = { id, title: checkInfo(id).title, status: 'failed', message: String((e as Error)?.message ?? e), failures: [String(e)], durationMs: 0 }; }
      settle.get(id)!(r);
    };
    void (async () => {
      for (const id of alone) await go(id);
      let next = 0;
      const lane = async (): Promise<void> => { while (next < rest.length) await go(rest[next++]); };
      await Promise.all(Array.from({ length: Math.max(1, Math.floor(lanes)) }, lane));
    })();
    return out;
  };
  return { run, schedule, close: () => session.close() };
}

/** Run the selected checks against a carrier and report every result. Never throws for a failing check. */
export async function runConformance(target: CarrierTarget, options: ConformanceOptions = {}): Promise<ConformanceReport> {
  const runner = await openConformance(target, options);
  const results: CheckResult[] = [];
  try {
    const ids = selected(options);
    const all = runner.schedule(ids);
    for (const id of ids) results.push(await all.get(id)!);
  } finally {
    await runner.close();
  }
  return report(target, results);
}

/** Every check of `CHECK_IDS` has a result that passed or is not applicable. */
export function isConformant(results: readonly CheckResult[]): boolean {
  return CHECK_IDS.every((id) => results.some((r) => r.id === id && (r.status === 'passed' || r.status === 'not-applicable')));
}

function report(target: CarrierTarget, results: CheckResult[]): ConformanceReport {
  const count = (s: CheckResult['status']) => results.filter((r) => r.status === s).length;
  return {
    kind: target.kind,
    version: target.version,
    harness: VERSION,
    conformant: isConformant(results),
    partial: !CHECK_IDS.every((id) => results.some((r) => r.id === id)),
    passed: count('passed'),
    failed: count('failed'),
    skipped: count('skipped'),
    notApplicable: count('not-applicable'),
    results,
  };
}

/**
 * Register the harness with a test framework: one test per check, titled
 * `[<check id>] <title>`, sharing one session, then a final test titled
 * `[conformant] …` that fails unless every check of `CHECK_IDS` ran and passed
 * (or is not applicable) — so a skipped check (no Chrome, no `next`) or a
 * partial selection (`only`/`skip`) cannot pass as conformance. With
 * `allowSkips: true` the final test tolerates skips and deselection (it
 * still fails on a failed check). A skipped check is reported through the
 * test context's `skip()` when the framework offers it (vitest).
 *
 *     import { describe, it, beforeAll, afterAll } from 'vitest';
 *     registerConformance({ describe, it, beforeAll, afterAll }, () => myTarget(), { title: 'orz-mdhtml conformance' });
 */
export function registerConformance(
  t: TestApi,
  target: CarrierTarget | (() => CarrierTarget | Promise<CarrierTarget>),
  options: ConformanceOptions & { title?: string } = {},
): void {
  let runner: ConformanceRunner | null = null;
  let opening: unknown = null;
  let scheduled: Map<string, Promise<CheckResult>> | null = null;
  const results = new Map<string, CheckResult>();
  const limit = options.checkTimeoutMs ?? DEFAULT_TIMEOUT;
  const ids = selected(options);
  t.describe(options.title ?? 'orz carrier conformance', () => {
    t.beforeAll(async () => {
      try {
        runner = await openConformance(typeof target === 'function' ? await target() : target, options);
      } catch (e) {
        opening = e;
      }
    }, 300_000);
    t.afterAll(async () => { await runner?.close(); }, 60_000);
    for (const id of ids) {
      t.it(`[${id}] ${checkInfo(id).title}`, async (ctx) => {
        if (!runner) throw new Error(`the conformance session did not open: ${String((opening as Error)?.message ?? opening)}`);
        scheduled ??= runner.schedule(ids); // all checks start with the first test, side by side; each test awaits its own
        const r = await scheduled.get(id)!;
        results.set(id, r);
        if (r.status === 'failed') throw new Error(`${id} failed:\n${r.message}`);
        if (r.status === 'skipped' && typeof ctx?.skip === 'function') ctx.skip(r.message);
      }, limit * 4 + 60_000); // its own run is bounded by the check limit; the rest is waiting for a lane
    }
    t.it(`${CONFORMANT_TITLE}${options.allowSkips ? ' (skips allowed)' : ''}`, async () => {
      const all = [...results.values()];
      const failed = all.filter((r) => r.status === 'failed').map((r) => r.id);
      if (failed.length) throw new Error(`not conformant: failed ${failed.join(', ')}`);
      if (options.allowSkips) return;
      const missing = CHECK_IDS.filter((id) => !all.some((r) => r.id === id && (r.status === 'passed' || r.status === 'not-applicable')));
      if (missing.length) {
        throw new Error(`not conformant: ${missing.length} check(s) did not run and pass — ${missing.map((id) => `${id} (${results.get(id)?.status ?? 'not run'})`).join(', ')}; pass allowSkips: true for a partial or browserless run`);
      }
    }, 10_000);
  });
}

/** The title of the final test `registerConformance` registers. */
export const CONFORMANT_TITLE = '[conformant] every check of CHECK_IDS ran and passed (or is not applicable)';

/** Every check id with its title and spec reference (for docs and claims). */
export function describeChecks(): Array<{ id: string; title: string; chrome: boolean; spec: string }> {
  return CHECKS.map((c) => ({ ...c }));
}
