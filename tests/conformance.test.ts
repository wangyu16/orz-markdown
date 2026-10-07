/**
 * The carrier conformance harness (`orz-markdown/carrier/conformance`,
 * spec/conformance.md): claims H.1–H.5 in notes/CLAIMS.md.
 *
 * The harness runs here exactly as a carrier runs it: `registerConformance`
 * registers one test per check against the stub carrier of
 * tests/conformance-stub/ (kind md, built at test time from the kit: a
 * script-safe browser bundle, its release.json, `mountEditor` = the editor
 * shell + `renderMarkdownPreview`), with older and newer builds of the stub as
 * `previous` and `next`. Then (H.5) deliberately broken builds of the stub
 * (`__STUB_VARIANT__`) must FAIL the matching checks:
 *
 *   script-close    the bundle is not rewritten: it holds a literal </script
 *   crlf            assemble normalises CR LF / CR to LF
 *   accept-tampered the update trusts whatever bytes the CDN serves
 *   live-dom        the save serialises the live DOM instead of assembling the text
 *   steal-focus     the update indicator takes the focus when it appears
 *
 * and the kit mutants that survived round 1 of closed loop 2, re-made as
 * carrier bugs the harness can observe (each must fail a named check):
 *
 *   preview-same-origin  the preview frame gets allow-same-origin
 *   ungated-keys         preview save keys and links act without a gesture
 *   no-roundtrip         the update does not compare the re-assembled text
 *   no-version-check     the update does not compare the written version
 *   any-source           the file side reads messages from any window
 *   copy-overwrite       a same-named copy elsewhere reuses the original's handle
 *   offer-prerelease     a prerelease is offered
 *   no-once-a-day        the manifest is fetched on every open
 *   shared-prefs         preferences go to the shared orz-pref:_: namespace
 *   cdn-to-inline        a cdn file's update is written inline
 *   update-in-frame      a file in an app host's frame checks for updates
 *
 * and, from round 2 of closed loop 2, the carriers that passed the whole
 * harness as conformant (the audit's 16 and 6 more of the sub-probe), plus
 * the round-2 audit mutants that were already caught, and from round 3 the
 * claims adversary's carriers (a reload after an unproved picked-file update,
 * an editor left read-only after an update, an edit during a hook save
 * marked saved, Cmd/Ctrl+S saving a read-only app editor) and the save and
 * update gaps (a cdn file saved inline, includes dropped by a save or an
 * update), a forged view key that switches the view (r3-ungated-view-key)
 * and, under the owner's option B, a shell that hands the preview's port to
 * any ready without the frame's secret (port-without-secret) — each fails a
 * named check (the table `caught` below says which and why).
 *
 * One file, one Chrome, shared stub builds (the suite is heavy; a second
 * file running in parallel pushed other suites' default timeouts over).
 * The browser checks need the installed Chrome; they are reported skipped
 * without it (and H.2 and the browser half of H.5 are then unverified).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  CHECKS, CHECK_IDS, CONFORMANT_TITLE, EXCLUSIVE_CHECKS, HAZARD_TEXTS, describeChecks, implementedChecks, isConformant, registerConformance, runConformance, derivedParts,
  type CheckResult, type ConformanceReport, type TestApi,
} from '../src/carrier/conformance';
import { assembleEnvelope, extract } from '../src/carrier';
import { buildStub, cleanStubs, stubTarget } from './conformance-stub/build';
import type { StubVariant } from './conformance-stub/assemble';

type Browser = import('playwright-core').Browser;

async function launch(): Promise<Browser | null> {
  try {
    const { chromium } = await import('playwright-core');
    // --allow-file-access-from-files: the origin-private file system on file: pages (real handles, C.save.copy-elsewhere)
    return await chromium.launch({ channel: 'chrome', args: ['--allow-file-access-from-files'] });
  } catch {
    return null;
  }
}

const browser = await launch();
const statuses = new Map<string, string>();

afterAll(async () => {
  await browser?.close();
  cleanStubs();
});

// ── H.2 the harness is green against the stub carrier ────────────────────

registerConformance(
  { describe, it, beforeAll, afterAll },
  async () => {
    const [previous, current, next] = await Promise.all([buildStub('1.0.0'), buildStub('1.1.0'), buildStub('1.2.0')]);
    return stubTarget(current, { previous, next });
  },
  {
    title: '[H.2] the stub carrier passes every conformance check',
    ...(browser ? { browser } : { channel: 'no-chrome-installed', allowSkips: true }),
    log: (line) => { const m = /^([\w-]+)\s+(\S+)/.exec(line); if (m) statuses.set(m[2], m[1]); },
  },
);

describe('the stub bundle', () => {
  it('[H.2] holds one KaTeX (the stub build resolves katex and its mhchem to one build): \\ce renders in Chrome from the bundle', async () => {
    const stub = await buildStub('1.1.0');
    if (!browser) return;
    const page = await browser.newPage();
    try {
      await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
      await page.addScriptTag({ content: stub.code });
      const html = await page.evaluate(() => (globalThis as unknown as { OrzCarrier: { renderPreview(t: string): Promise<string> } }).OrzCarrier.renderPreview('$\\ce{H2O}$'));
      expect(html).not.toContain('katex-error');
      expect(html).toMatch(/<msub>[\s\S]*<mn>2<\/mn>/);
    } finally {
      await page.close();
    }
    expect(stub.code.split('KaTeX parse error').length - 1).toBe(1);
  }, 120_000);
});

describe('the harness ran completely', () => {
  it('[H.2] every check ran and passed against the stub (none skipped when Chrome is installed)', () => {
    expect([...statuses.keys()].sort()).toEqual([...CHECK_IDS].sort());
    const notPassed = [...statuses].filter(([, s]) => s !== 'passed');
    if (browser) expect(notPassed).toEqual([]);
    else expect(notPassed.every(([id, s]) => s === 'skipped' && CHECKS.find((c) => c.id === id)!.chrome)).toBe(true);
  });
});

// ── H.1 the API ──────────────────────────────────────────────────────────

describe('the harness API', () => {
  it('[H.1] check ids are stable, unique C.<area>.<name> ids, each implemented, with a title and a spec reference; spec/conformance.md lists every one', () => {
    expect(new Set(CHECK_IDS).size).toBe(CHECK_IDS.length);
    for (const c of CHECKS) {
      expect(c.id).toMatch(/^C\.(law|bundle|create|edit|save|update|host|prefs)\.[a-z]+(-[a-z]+)*$/);
      expect(c.title.length).toBeGreaterThan(20);
      expect(c.spec).toMatch(/FC-1[89]|shell-runtime|host-protocols|FD-0/);
    }
    expect(implementedChecks().sort()).toEqual([...CHECK_IDS].sort());
    expect(describeChecks().map((c) => c.id)).toEqual(CHECK_IDS);
    const doc = readFileSync('spec/conformance.md', 'utf8');
    for (const id of CHECK_IDS) expect(doc, id).toContain(`\`${id}\``);
    // the ids the brief and the claims name exist
    for (const id of ['C.create.newest-shell', 'C.bundle.script-safe', 'C.update.tampered', 'C.save.download', 'C.update.indicator', 'C.law.eol-bom']) expect(CHECK_IDS).toContain(id);
    // the checks that run alone are checks of the catalog
    expect(EXCLUSIVE_CHECKS.filter((id) => !CHECK_IDS.includes(id))).toEqual([]);
  });

  it('[H.1] registerConformance registers one test per selected check, titled "[id] title", then the final [conformant] test, inside one describe with one beforeAll/afterAll; unknown ids are refused', () => {
    const calls: string[] = [];
    const api: TestApi = {
      describe: (name, fn) => { calls.push(`describe ${name}`); fn(); },
      it: (name) => { calls.push(`it ${name}`); },
      beforeAll: () => { calls.push('beforeAll'); },
      afterAll: () => { calls.push('afterAll'); },
    };
    registerConformance(api, () => { throw new Error('not opened'); }, { title: 'T', skip: ['C.host.no-ack'] });
    expect(calls[0]).toBe('describe T');
    expect(calls.filter((c) => c === 'beforeAll')).toHaveLength(1);
    expect(calls.filter((c) => c === 'afterAll')).toHaveLength(1);
    const its = calls.filter((c) => c.startsWith('it '));
    expect(its).toEqual([...CHECKS.filter((c) => c.id !== 'C.host.no-ack').map((c) => `it [${c.id}] ${c.title}`), `it ${CONFORMANT_TITLE}`]);
    expect(() => registerConformance(api, () => { throw new Error('x'); }, { only: ['C.nope'] })).toThrow(/unknown check C\.nope/);
  });

  it('[H.1] runConformance reports every selected check (passed, failed or skipped, with every failed expectation) and never throws for a failing check', async () => {
    const stub = await buildStub('1.1.0');
    const broken = { ...stubTarget(stub), version: '9.9.9', assemble: (t: string) => (t.includes('\r') || t.includes('\u0000') ? 'not a file' : stubTarget(stub).assemble(t)) };
    const r = await runConformance(broken, { only: ['C.law.round-trip', 'C.bundle.release', 'C.law.refusals'], corpus: false, lanes: 3, ...(browser ? { browser } : {}) });
    expect(r).toMatchObject({ kind: 'md', version: '9.9.9', conformant: false, partial: true, passed: 0, failed: 3, skipped: 0, notApplicable: 0 });
    expect(r.results.map((x) => x.id)).toEqual(['C.law.round-trip', 'C.law.refusals', 'C.bundle.release']);
    const rt = r.results[0];
    expect(rt.failures!.length).toBeGreaterThan(4); // every text that failed, both deliveries
    expect(rt.message).toContain('hazard crlf-bom (inline): extract finds no #orz-src island');
    expect(r.results[2].message).toContain('release.json version (= the target version): expected "9.9.9", got "1.1.0"');
    expect(r.harness).toMatch(/^\d+\.\d+\.\d+/);
  }, 120_000);
});

// ── H.3 self-skipping and the corpus ─────────────────────────────────────

describe('without a browser, and the corpus', () => {
  it('[H.3] when no browser can be launched the browser checks are skipped with the reason, Node checks still run, and the report is not conformant', async () => {
    const stub = await buildStub('1.1.0');
    const r = await runConformance(stubTarget(stub), { only: ['C.bundle.script-safe', 'C.edit.exact', 'C.update.indicator'], channel: 'no-such-channel', corpus: false });
    expect(r.results.map((x) => [x.id, x.status])).toEqual([['C.bundle.script-safe', 'passed'], ['C.edit.exact', 'skipped'], ['C.update.indicator', 'skipped']]);
    expect(r.results[1].message).toMatch(/^no browser: /);
    expect(r.conformant).toBe(false);
  }, 120_000);

  it('[H.3] the update checks are skipped (not passed) without a next release, and from-previous without a previous one — unless the target declares firstRelease, which makes from-previous not-applicable (satisfied) with its reason', async () => {
    const stub = await buildStub('1.1.0');
    const r = await runConformance(stubTarget(stub), { only: ['C.update.reassemble', 'C.update.from-previous'], channel: 'no-such-channel', corpus: false });
    expect(r.results.map((x) => x.status)).toEqual(['skipped', 'skipped']);
    if (browser) {
      const r2 = await runConformance(stubTarget(stub), { only: ['C.update.reassemble', 'C.update.from-previous'], browser, corpus: false });
      expect(r2.results.map((x) => x.message)).toEqual([expect.stringMatching(/no `next` release/), expect.stringMatching(/^no `previous` release given/)]);
    }
    const first = await runConformance({ ...stubTarget(stub), firstRelease: true }, { only: ['C.update.from-previous'], channel: 'no-such-channel', corpus: false });
    expect(first.results.map((x) => [x.status, x.message])).toEqual([['not-applicable', expect.stringMatching(/firstRelease/)]]);
    expect(first).toMatchObject({ notApplicable: 1, partial: true, conformant: false });
  }, 120_000);

  it('[H.3] conformant means every check of CHECK_IDS ran and passed: a partial run (only/skip) is partial and never conformant; not-applicable counts as satisfied; a skip, a failure or a missing check does not', async () => {
    const ok = (id: string, status: CheckResult['status'] = 'passed'): CheckResult => ({ id, title: id, status, durationMs: 0 });
    expect(isConformant(CHECK_IDS.map((id) => ok(id)))).toBe(true);
    expect(isConformant(CHECK_IDS.map((id) => ok(id, id === 'C.update.from-previous' ? 'not-applicable' : 'passed')))).toBe(true);
    expect(isConformant(CHECK_IDS.map((id) => ok(id, id === 'C.host.ai' ? 'skipped' : 'passed')))).toBe(false);
    expect(isConformant(CHECK_IDS.map((id) => ok(id, id === 'C.host.ai' ? 'failed' : 'passed')))).toBe(false);
    expect(isConformant(CHECK_IDS.slice(1).map((id) => ok(id)))).toBe(false);
    const stub = await buildStub('1.1.0');
    const r = await runConformance(stubTarget(stub), { only: ['C.bundle.script-safe', 'C.bundle.release'], corpus: false });
    expect(r).toMatchObject({ passed: 2, failed: 0, skipped: 0, partial: true, conformant: false });
    // the final [conformant] test of registerConformance fails on a skip unless allowSkips
    const run = async (allowSkips: boolean, status: CheckResult['status']) => {
      const tests: Array<[string, () => Promise<void>]> = [];
      const before: Array<() => Promise<void>> = [];
      const after: Array<() => Promise<void>> = [];
      const api: TestApi = { describe: (_n, fn) => { fn(); }, it: (n, fn) => { tests.push([n, () => fn()]); }, beforeAll: (fn) => { before.push(fn); }, afterAll: (fn) => { after.push(fn); } };
      const fake = { ...stubTarget(stub), assemble: () => { throw new Error('unused'); } };
      registerConformance(api, fake, { only: ['C.law.refusals'], corpus: false, allowSkips });
      await before[0]();
      if (status === 'passed') await tests[0][1]().catch(() => undefined);
      const verdict = await tests[tests.length - 1][1]().then(() => 'pass', (e: Error) => e.message);
      await after[0]();
      return verdict;
    };
    expect(await run(false, 'passed')).toMatch(/^not conformant: \d+ check\(s\) did not run and pass/);
    expect(await run(true, 'passed')).toBe('pass');
  }, 120_000);

  it('[H.3] the default corpus is the shipped tests/carrier-corpus of the kind (read as bytes, BOM kept), and the hazard texts cover CR LF, CR, a BOM, script closers, reserved ids, astral and separator characters, a very long line and the empty text', async () => {
    const { loadCorpus } = await import('../src/carrier/conformance');
    const md = loadCorpus('md');
    expect(Object.keys(md)).toContain('md/bom.md');
    expect(md['md/bom.md'].charCodeAt(0)).toBe(0xfeff);
    expect(md['md/crlf.md']).toContain('\r\n');
    expect(Object.keys(loadCorpus('paged')).every((k) => k.startsWith('paged/'))).toBe(true);
    const all = Object.values(HAZARD_TEXTS).join('');
    for (const s of ['\r\n', '﻿', '</script>', '<!--', 'id="orz-src"', '𝒳', ' ', ' ']) expect(all).toContain(s);
    expect(HAZARD_TEXTS.empty).toBe('');
    expect(Math.max(...Object.values(HAZARD_TEXTS).map((t) => Math.max(...t.split('\n').map((l) => l.length))))).toBeGreaterThan(100_000);
    expect(HAZARD_TEXTS.cr.includes('\n')).toBe(false);
    // derivedParts takes the text-derived parts of a kit envelope
    const html = assembleEnvelope(HAZARD_TEXTS['crlf-bom'], { kind: 'md', shellVersion: '1.0.0', headHtml: '<style>x</style>', bodyHtml: '<p>shell</p>' });
    const d = derivedParts(html);
    expect(d.head).not.toContain('generator');
    expect(d.head).toContain('<title>CR LF and a BOM</title>');
    expect(d.island).toMatch(/^<script type="text\/markdown" id="orz-src" data-orz-format="1" data-orz-eol="crlf" data-orz-bom>/);
    expect(extract(d.island)!.text).toBe(HAZARD_TEXTS['crlf-bom']);
  }, 120_000);
});

// ── H.4 module and package boundaries ────────────────────────────────────

function valueImports(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of readFileSync(f, 'utf8').matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?from\s*)?['"]([^'"]+)['"]/gm)) {
      if (!m[1].startsWith('.')) continue;
      const dir = f.slice(0, f.lastIndexOf('/'));
      const parts: string[] = [];
      for (const p of `${dir}/${m[1]}`.split('/')) { if (p === '..') parts.pop(); else if (p !== '.' && p) parts.push(p); }
      const base = parts.join('/').replace(/\.js$/, '');
      queue.push(existsSync(`${base}.ts`) ? `${base}.ts` : `${base}/index.ts`);
    }
  }
  return seen;
}

describe('module and package boundaries', () => {
  it('[H.4] no other entry imports the harness; the harness imports no Node built-in statically and playwright-core only lazily; the package exports ./carrier/conformance, ships the corpus and declares playwright-core an optional peer, not a dependency', () => {
    for (const entry of ['src/index.ts', 'src/carrier.ts', 'src/carrier/read.ts', 'src/carrier/shell/index.ts', 'src/carrier/editor/index.ts']) {
      expect([...valueImports(entry)].filter((f) => f.includes('carrier/conformance')), entry).toEqual([]);
    }
    const files = [...valueImports('src/carrier/conformance/index.ts')].filter((f) => f.includes('carrier/conformance'));
    expect(files.sort()).toEqual(['catalog.ts', 'checks.ts', 'index.ts', 'node.ts', 'page.ts', 'session.ts', 'texts.ts'].map((f) => `src/carrier/conformance/${f}`));
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/^\s*import\s+(?!type\b)[^;]*from\s*['"](node:|fs|path|os|http|crypto|child_process)/m);
      expect(src, f).not.toMatch(/\brequire\(/);
      expect(src, f).not.toMatch(/^\s*import\s+(?!type\b)[^;]*from\s*['"]playwright-core['"]/m);
    }
    expect(readFileSync('src/carrier/conformance/node.ts', 'utf8')).toContain("import('playwright-core')");
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as Record<string, any>;
    expect(pkg.exports['./carrier/conformance']).toBe('./dist/carrier/conformance/index.js');
    expect(pkg.files).toContain('tests/carrier-corpus');
    expect(pkg.dependencies['playwright-core']).toBeUndefined();
    expect(pkg.peerDependencies['playwright-core']).toBeDefined();
    expect(pkg.peerDependenciesMeta['playwright-core']).toEqual({ optional: true });
  });

  it('[H.4] the built module loads without loading playwright-core (it is required only when a browser check runs)', () => {
    if (!existsSync('dist/carrier/conformance/index.js')) return;
    const out = execFileSync(process.execPath, ['-e', "const h = require('./dist/carrier/conformance/index.js'); console.log(JSON.stringify({ ids: h.CHECK_IDS.length, pw: Object.keys(require.cache).filter((k) => k.includes('playwright')).length }));"], { encoding: 'utf8' });
    expect(JSON.parse(out)).toEqual({ ids: CHECK_IDS.length, pw: 0 });
  }, 120_000);
});

// ── H.5 the harness catches broken carriers ──────────────────────────────

async function mutant(variant: StubVariant, only: string[]): Promise<ConformanceReport> {
  const [previous, current, next] = await Promise.all([buildStub('1.0.0'), buildStub('1.1.0', variant), buildStub('1.2.0')]);
  return runConformance(stubTarget(current, { previous, next }), { only, ...(browser ? { browser } : { channel: 'no-chrome-installed' }) });
}

const result = (r: ConformanceReport, id: string) => r.results.find((x) => x.id === id)!;
const chrome = browser ? describe : describe.skip;

describe('mutants the harness must catch in Node', () => {
  it('[H.5] a bundle holding a literal </script fails C.bundle.script-safe', async () => {
    const r = await mutant('script-close', ['C.bundle.script-safe']);
    expect(result(r, 'C.bundle.script-safe').status).toBe('failed');
    expect(result(r, 'C.bundle.script-safe').message).toMatch(/literal <script or <\/script/);
    expect(r.conformant).toBe(false);
  }, 120_000);

  it('[H.5] an assemble that normalises CR LF fails C.law.round-trip and C.law.eol-bom', async () => {
    const r = await mutant('crlf', ['C.law.round-trip', 'C.law.eol-bom']);
    expect(result(r, 'C.law.round-trip').status).toBe('failed');
    expect(result(r, 'C.law.round-trip').message).toMatch(/hazard crlf-bom \(inline\): extract\(assemble\(T\)\)\.text !== T/);
    expect(result(r, 'C.law.eol-bom').status).toBe('failed');
    expect(result(r, 'C.law.eol-bom').message).toContain('crlf-bom: data-orz-eol: expected "crlf", got "lf"');
  }, 180_000);
});

chrome('mutants the harness must catch in Chrome', () => {
  it('[H.5] an update that accepts a tampered bundle fails C.update.tampered', async () => {
    const r = await mutant('accept-tampered', ['C.update.tampered']);
    expect(result(r, 'C.update.tampered').status).toBe('failed');
    expect(result(r, 'C.update.tampered').message).toContain('was accepted: the file was written or downloaded');
  }, 240_000);

  it('[H.5] a save that serialises the live DOM fails C.save.file-system-access, C.save.download and C.host.save', async () => {
    const r = await mutant('live-dom', ['C.save.file-system-access', 'C.save.download', 'C.host.save']);
    for (const id of ['C.save.file-system-access', 'C.save.download', 'C.host.save']) {
      expect(result(r, id).status, id).toBe('failed');
      expect(result(r, id).message, id).toMatch(/live DOM/);
    }
  }, 240_000);

  it('[H.5] an indicator that takes the focus fails C.update.indicator', async () => {
    const r = await mutant('steal-focus', ['C.update.indicator']);
    expect(result(r, 'C.update.indicator').status).toBe('failed');
    expect(result(r, 'C.update.indicator').message).toContain('focus must not move');
  }, 240_000);

  // round 1 of closed loop 2: each kit mutant that survived, re-made as a carrier bug, fails a named check
  const caught: Array<[StubVariant, string, RegExp]> = [
    ['preview-same-origin', 'C.edit.preview-isolation', /exactly "allow-scripts", never allow-same-origin/],
    ['ungated-keys', 'C.edit.preview-isolation', /saves triggered by a forged save key[\s\S]*pages opened by forged links/],
    ['no-roundtrip', 'C.update.resigned', /alters the text was accepted/],
    ['no-version-check', 'C.update.resigned', /names a version its bundle does not write was accepted/],
    ['any-source', 'C.host.foreign-hello', /not the standalone one|messages the file posted to its parent/],
    ['copy-overwrite', 'C.save.copy-elsewhere', /saving the copy wrote over the original/],
    ['offer-prerelease', 'C.update.prerelease', /update indicators for the prerelease/],
    ['no-once-a-day', 'C.update.once-a-day', /manifest requests for one open, one reload and a second file/],
    ['shared-prefs', 'C.prefs.local', /shared orz-pref:_: namespace/],
    ['cdn-to-inline', 'C.update.cdn-delivery', /a cdn file stays cdn/],
    ['update-in-frame', 'C.update.hosted', /manifest requests from a file in an app host's frame/],
    // round 2 of closed loop 2: carriers that passed the whole harness as conformant
    ['hook-save-lf', 'C.edit.app-host', /hooks\.save did not get the exact text/],
    ['ignore-hook-save', 'C.edit.app-host', /via "hook"[\s\S]*hooks\.save was called 0 times/],
    ['shared-undo', 'C.edit.app-host', /undo on the first editor does not return to its own text/],
    ['indicator-in-app', 'C.edit.app-host', /manifest requests from an editor in an app host/],
    ['css-leak', 'C.edit.app-host', /computed styles of the page's own elements/],
    ['readonly-ignored', 'C.edit.app-host', /typing changed an editor mounted with readOnly: true/],
    ['update-stale-text', 'C.update.edit-during', /files written or downloaded by an update that read the text before the edit/],
    ['frame-silent-update', 'C.host.silent', /manifest requests from a framed file whose parent never said hello/],
    ['standalone-same-origin', 'C.save.served-notice', /the preview iframe sandbox on a served \(http\) page/],
    ['prefs-in-file', 'C.prefs.local', /the file saved after a view change is not assemble\(text\)/],
    ['global-mode-key', 'C.prefs.local', /storage keys outside orz-pref:<uid>:/],
    ['update-download', 'C.update.reassemble', /writes and downloads of the update/],
    ['date-stamp', 'C.law.determinism', /under a clock moved by 7 years differs/],
    ['formats-wrong', 'C.bundle.global', /OrzCarrier\.formats \(= release\.json formats/],
    ['browser-no-refusal', 'C.law.refusals', /the browser bundle's assemble did not refuse the text/],
    ['download-fixed-name', 'C.save.download', /not the opened file's name/],
    // round 2 sub-probe: more subtly non-conformant carriers
    ['meta-from-body', 'C.create.meta', /after a header edit \(title, author, keywords\) the head metadata and #orz-meta are not the kit's/],
    ['no-eol-attr', 'C.create.island', /data-orz-eol: expected "lf", got undefined/],
    ['no-generator', 'C.create.newest-shell', /no generator meta/],
    ['update-any-format', 'C.update.other-format', /update indicators for [\d.]+, whose formats \[987\]/],
    ['note-when-hosted', 'C.host.save', /served-page notices in a file whose host saves it/],
    ['prefs-in-text', 'C.prefs.local', /a preference changed the text/],
    ['name-handle', 'C.save.save-as-elsewhere', /pickers after reopening the original[\s\S]*overwrote the Downloads file/],
    // round 2 audit mutants the harness already caught (kept, so a later change cannot lose them)
    ['browser-shell-lie', 'C.bundle.global', /the sandboxed assemble differs from Node's/],
    ['crlf-after-edit', 'C.edit.exact', /typing "Zq1" did not insert exactly it/],
    ['extract-strip-bom', 'C.bundle.global', /OrzCarrier\.extract agrees with the kit/],
    ['no-dirty-post', 'C.host.save', /no orz-host-dirty \{ dirty: true \}/],
    ['setheader-two-steps', 'C.edit.set-header', /one undo does not restore the exact text/],
    ['silent-refusal', 'C.update.tampered', /the refusal is not announced/],
    // round 3 of closed loop 2: carriers that passed the whole harness (the claims adversary's r3-* and the save/update gaps)
    ['r3-reload-picked', 'C.update.reassemble', /page loads after an update written to a picked file not proved to be the opened one/],
    ['r3-readonly-stuck', 'C.update.edit-during', /typing after the update settled changed nothing/],
    ['r3-hook-markSaved', 'C.edit.app-host', /isDirty\(\) after a hook save during which the text was edited/],
    ['r3-readonly-save-key', 'C.edit.app-host', /saves of an editor mounted with readOnly: true \(save\(\) and Cmd\/Ctrl\+S\)/],
    ['save-to-inline', 'C.save.keeps-delivery', /cdn-delivery file/],
    ['save-drops-includes', 'C.save.keeps-includes', /lost or changed the file's #orz-includes/],
    ['update-drops-includes', 'C.update.keeps-includes', /lost or changed the file's #orz-includes/],
    ['r3-ungated-view-key', 'C.edit.preview-isolation', /forged messages: view changes/],
    // option B (2026-10-06): a shell that hands the preview's port to any ready, without the frame secret
    ['port-without-secret', 'C.edit.preview-isolation', /replaced preview \((meta refresh http|meta refresh data|document\.open)\): a document that replaced or nested the preview got its port/],
  ];
  for (const [variant, id, why] of caught) {
    it(`[H.5] the ${variant} mutant fails ${id}`, async () => {
      const r = await mutant(variant, [id]);
      expect(result(r, id).status).toBe('failed');
      expect(result(r, id).message).toMatch(why);
    }, 240_000);
  }
});
