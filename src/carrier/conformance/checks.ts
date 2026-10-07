/**
 * The check implementations. Each one gathers every failed expectation (so a
 * report shows all that is wrong, not only the first) and throws a
 * {@link Skip} when its preconditions are absent (no browser, no `next`
 * release, an optional API the carrier does not offer).
 */
import { editHeader, lintHeader, readHeader } from '../header.js';
import { readDocument } from '../document.js';
import { assembleEnvelope, eolStyle } from '../envelope.js';
import { escapeScriptText, extract, readIslandFromDom } from '../read.js';
import { KIND_EXTENSIONS } from '../shell/protocol.js';
import { isScriptSafe, parseManifest, MAX_BUNDLE_BYTES, type ReleaseKind } from '../shell/update.js';
import { callAssemble, decodeStrict, path, sha256hex, sha384 } from './node.js';
import { DEFAULT_EDITOR_DRIVER, PAGE_HELPERS, READ_OPFS, WRITE_OPFS, mountEditorScript } from './page.js';
import { call, type CheckContext, type Release, type Session } from './session.js';
import { EDIT_TEXT, GRAB_PAGE, HAZARD_TEXTS, INCLUDES, INCLUDE_TEXT, LIVE_DOM_MARKER, LONG_TEXT, NEWER_TEXT, OTHER_TEXT, REFUSED_TEXTS, THEFT_TEXT, UID_A, UID_B, replacedTexts } from './texts.js';

type Page = import('playwright-core').Page;
type Frame = import('playwright-core').Frame;

export class Skip extends Error {}

/** The check does not apply to this target, for a reason the target declared (e.g. `firstRelease`). Counts as satisfied. */
export class NotApplicable extends Error {}

/** Collects failed expectations. */
export class Probe {
  readonly failures: string[] = [];
  check(ok: unknown, message: string): boolean {
    if (!ok) this.failures.push(message);
    return !!ok;
  }
  eq(actual: unknown, expected: unknown, what: string): boolean {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    return this.check(a === e, `${what}: expected ${clip(e)}, got ${clip(a)}`);
  }
  fail(message: string): void {
    this.failures.push(message);
  }
}

export type CheckFn = (s: Session, p: Probe) => Promise<void>;

const clip = (s: string | undefined, n = 160): string => (s === undefined ? 'undefined' : s.length > n ? `${s.slice(0, n)}… (${s.length} chars)` : s);
const msg = (e: unknown): string => String((e as Error)?.message ?? e).split('\n')[0];

/** Where two strings first differ, for a readable failure. */
export function firstDiff(a: string, b: string): string {
  if (a === b) return 'equal';
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `offset ${i}: ${JSON.stringify(a.slice(Math.max(0, i - 12), i + 24))} vs ${JSON.stringify(b.slice(Math.max(0, i - 12), i + 24))} (lengths ${a.length}, ${b.length})`;
}

/** The same resolved includes (keys and values; absent and empty are the same). */
export function sameIncludes(a: Record<string, string> | undefined | null, b: Record<string, string> | undefined | null): boolean {
  const ea = Object.entries(a ?? {}).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  const eb = Object.entries(b ?? {}).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  return JSON.stringify(ea) === JSON.stringify(eb);
}

/** The parts of a file derived from its text (FC-18 §8.1): everything before `#orz-shell` except the generator, the island and `#orz-includes`. */
export function derivedParts(html: string): { head: string; island: string; includes: string } {
  const at = html.indexOf('<script type="application/json" id="orz-shell">');
  return {
    head: (at >= 0 ? html.slice(0, at) : '').replace(/<meta name="generator" content="[^"]*">\n?/, ''),
    island: /<script type="text\/markdown" id="orz-src"[^>]*>[\s\S]*?<\/script>/.exec(html)?.[0] ?? '',
    includes: /<script type="application\/json" id="orz-includes">[\s\S]*?<\/script>/.exec(html)?.[0] ?? '',
  };
}

/** The attributes of the `#orz-src` start tags of a file (script-safe engines hold no literal `<script`). */
function islandTags(html: string): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs: Record<string, string> = {};
    for (const a of m[1].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) attrs[a[1].toLowerCase()] = a[2] ?? '';
    if (attrs.id === 'orz-src') out.push(attrs);
  }
  return out;
}

function needBrowser(s: Session): void {
  if (!s.browser) throw new Skip(s.browserError || 'no browser');
}

/**
 * The texts the law checks also run with inline delivery (an inline file carries the whole bundle, so
 * every one is costly): the hazards, the samples and the first two corpus texts. The text-derived parts
 * of a file do not depend on the delivery; every text runs with cdn delivery.
 */
export function inlineTexts(all: Array<[string, string]>): Array<[string, string]> {
  let corpus = 0;
  return all.filter(([name]) => !name.startsWith('corpus ') || corpus++ < 2);
}

/** Every text the law checks run on: the corpus of the kind, the hazards and the target's samples. */
export function lawTexts(s: Session, corpus: Record<string, string>): Array<[string, string]> {
  const samples = s.target.samples;
  const sampleEntries: Array<[string, string]> = Array.isArray(samples) ? samples.map((t, i) => [`sample ${i}`, t]) : Object.entries(samples ?? {}).map(([k, v]) => [`sample ${k}`, v]);
  return [...Object.entries(corpus).map(([k, v]) => [`corpus ${k}`, v] as [string, string]), ...Object.entries(HAZARD_TEXTS).map(([k, v]) => [`hazard ${k}`, v] as [string, string]), ...sampleEntries];
}

const until = async (cond: () => boolean | Promise<boolean>, ms: number, step = 50): Promise<boolean> => {
  const end = Date.now() + ms;
  for (;;) {
    try { if (await cond()) return true; } catch { /* page navigating */ }
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, step));
  }
};

/** Open a page, install the helpers, mount the editor through the driver; returns the text the page read from the file. */
async function openEditor(s: Session, frame: Page | Frame, url?: string): Promise<string> {
  if (url) await (frame as Page).goto(url);
  await frame.evaluate(PAGE_HELPERS);
  return frame.evaluate(mountEditorScript(s.target.editor ?? DEFAULT_EDITOR_DRIVER)) as Promise<string>;
}

const ed = <T>(frame: Page | Frame, expr: string): Promise<T> => frame.evaluate(`(async () => (${expr}))()`) as Promise<T>;

async function undoTo(frame: Page | Frame, page: Page, target: string, max = 30): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    if ((await ed<string>(frame, 'window.__orzEditor.getText()')) === target) return true;
    const api = await ed<boolean>(frame, 'typeof window.__orzEditor.undo === "function"');
    if (api) await ed(frame, 'window.__orzEditor.undo()');
    else { await ed(frame, 'window.__orzEditor.focus()'); await page.keyboard.press('ControlOrMeta+z'); }
  }
  return (await ed<string>(frame, 'window.__orzEditor.getText()')) === target;
}

const ext = (s: Session): string => KIND_EXTENSIONS[s.target.kind];

type AssembleOpts = import('./types.js').AssembleOptions;

/** How far {@link withShiftedClock} moves the clock. */
const SHIFT_YEARS = 7;

/**
 * Call `fn` with the global `Date` moved forward by {@link SHIFT_YEARS} years, restored before it
 * returns. The window is synchronous (other checks may run beside this one and must keep the real
 * clock): an async `assemble` runs only its synchronous part under the moved clock.
 */
function withShiftedClock<T>(fn: () => T): T {
  const Real = Date;
  const offset = SHIFT_YEARS * 365.25 * 864e5;
  class Moved extends Real {
    constructor(...a: unknown[]) {
      if (a.length === 0) super(Real.now() + offset);
      else super(...(a as [string | number]));
    }
    static now(): number { return Real.now() + offset; }
  }
  (globalThis as { Date: DateConstructor }).Date = Moved as unknown as DateConstructor;
  try { return fn(); } finally { (globalThis as { Date: DateConstructor }).Date = Real; }
}

/** The file name the browser checks open (an assembled twin name). */
const fileName = (s: Session, base: string): string => `${base}${ext(s)}`;

// ── laws ──────────────────────────────────────────────────────────────────

export const lawChecks = (corpus: () => Record<string, string>): Record<string, CheckFn> => ({
  async 'C.law.round-trip'(s, p) {
    const { kind, version } = s.target;
    const all = lawTexts(s, corpus());
    const inline = new Set(inlineTexts(all).map(([n]) => n));
    for (const [name, text] of all) {
      for (const delivery of inline.has(name) ? ['inline', 'cdn'] as const : ['cdn'] as const) {
        let html: string;
        try { html = await s.assemble(text, { delivery }); } catch (e) { p.fail(`${name} (${delivery}): assemble threw: ${msg(e)}`); continue; }
        const x = extract(html);
        if (!p.check(x, `${name} (${delivery}): extract finds no #orz-src island`)) continue;
        p.check(x!.text === text, `${name} (${delivery}): extract(assemble(T)).text !== T — ${firstDiff(x!.text, text)}`);
        p.eq([x!.kind, x!.format, x!.shell, x!.delivery], [kind, 1, version, delivery], `${name} (${delivery}): extract's kind, format, shell, delivery`);
      }
    }
  },

  async 'C.law.determinism'(s, p) {
    const texts = lawTexts(s, corpus());
    const inlineSet = new Set(inlineTexts(texts).map(([n]) => n));
    const own = s.releases.target.code;
    const node = (t: string, o: AssembleOpts) => callAssemble((x, y) => s.target.assemble(x, y), t, o);
    for (const [name, text] of texts) {
      try {
        const delivery = inlineSet.has(name) ? 'inline' : 'cdn';
        const a = await node(text, { delivery });
        const b = await node(text, { delivery });
        p.check(a === b, `${name}: two Node assemblies differ — ${firstDiff(a, b)}`);
        if (delivery === 'inline') {
          const c = await node(text, { delivery: 'inline', engineSource: own });
          p.check(a === c, `${name}: Node inline assembly without engineSource differs from one given this release's bundle — ${firstDiff(a, c)}`);
        }
      } catch (e) { p.fail(`${name}: assemble threw: ${msg(e)}`); }
    }
    // the bytes do not depend on the clock: one assembly with Date moved by years (a build date, a timestamp)
    const sample = EDIT_TEXT;
    const usual = await s.assemble(sample, { delivery: 'cdn' });
    const moved = await callAssemble((t, o) => withShiftedClock(() => s.target.assemble(t, o)), sample, { delivery: 'cdn' });
    p.check(moved === usual, `an assembly under a clock moved by ${SHIFT_YEARS} years differs — ${firstDiff(moved, usual)}`);
    needBrowser(s);
    const inlineList = texts.filter(([n]) => inlineSet.has(n));
    const list = texts.map(([, t]) => t);
    const [inline, cdn] = [await s.chromeAssemble(s.releases.target, inlineList.map(([, t]) => t), 'inline', true), await s.chromeAssemble(s.releases.target, list, 'cdn')];
    for (let i = 0; i < inlineList.length; i++) {
      const [name, text] = inlineList[i];
      try {
        const nodeInline = await s.assemble(text, { delivery: 'inline', engineSource: own });
        if (inline[i] !== `sha256:${sha256hex(nodeInline)}`) {
          const [full] = await s.chromeAssemble(s.releases.target, [text], 'inline');
          p.fail(`${name}: Chrome inline bytes differ from Node's — ${firstDiff(full, nodeInline)}`);
        }
      } catch (e) { p.fail(`${name}: ${msg(e)}`); }
    }
    for (let i = 0; i < texts.length; i++) {
      const [name, text] = texts[i];
      try {
        const nodeCdn = await s.assemble(text, { delivery: 'cdn' });
        p.check(cdn[i] === nodeCdn, `${name}: Chrome cdn bytes differ from Node's — ${firstDiff(cdn[i], nodeCdn)}`);
      } catch (e) { p.fail(`${name}: ${msg(e)}`); }
    }
    // in Chrome under a moved clock (a fresh page: the clock is installed before the bundle loads)
    const ctx = await s.context({ picker: 'none' });
    const page = await ctx.newPage();
    await page.clock.install({ time: Date.now() + SHIFT_YEARS * 365.25 * 864e5 });
    await page.goto(`${s.fileOrigin}/page/target.html`);
    const chromeMoved = await call<string>(page, 'function (t) { return globalThis.OrzCarrier.assemble(t, { delivery: "cdn" }); }', sample);
    p.check(chromeMoved === usual, `the browser bundle's assembly under a clock moved by ${SHIFT_YEARS} years differs — ${firstDiff(chromeMoved, usual)}`);
  },

  async 'C.law.idempotence'(s, p) {
    const all = lawTexts(s, corpus());
    const inline = new Set(inlineTexts(all).map(([n]) => n));
    for (const [name, text] of all) {
      for (const delivery of inline.has(name) ? ['inline', 'cdn'] as const : ['cdn'] as const) {
        try {
          const f = await s.assemble(text, { delivery });
          const x = extract(f);
          if (!p.check(x, `${name} (${delivery}): no island`)) continue;
          const g = await callAssemble((t, o) => s.target.assemble(t, o), x!.text, { delivery });
          p.check(g === f, `${name} (${delivery}): assemble(extract(F).text) !== F — ${firstDiff(g, f)}`);
        } catch (e) { p.fail(`${name} (${delivery}): ${msg(e)}`); }
      }
    }
  },

  async 'C.law.eol-bom'(s, p) {
    const cases: Array<[string, string]> = [['crlf-bom', HAZARD_TEXTS['crlf-bom']], ['cr', HAZARD_TEXTS.cr], ['edit', EDIT_TEXT],
      ...Object.entries(corpus()).filter(([, t]) => t.includes('\r') || t.startsWith('﻿'))];
    for (const [name, text] of cases) {
      try {
        const html = await s.assemble(text, { delivery: 'inline' });
        const tags = islandTags(html);
        if (!p.check(tags.length === 1, `${name}: ${tags.length} #orz-src islands`)) continue;
        const bom = text.charCodeAt(0) === 0xfeff;
        p.eq(tags[0]['data-orz-eol'], eolStyle(bom ? text.slice(1) : text), `${name}: data-orz-eol`);
        p.eq('data-orz-bom' in tags[0], bom, `${name}: data-orz-bom present`);
        p.check(extract(html)?.text === text, `${name}: the file does not give back the exact text`);
      } catch (e) { p.fail(`${name}: ${msg(e)}`); }
    }
    needBrowser(s);
    for (const [name, text] of [['crlf-bom', EDIT_TEXT], ['cr', HAZARD_TEXTS.cr]] as const) {
      const ctx = await s.context({ picker: 'stub' });
      const page = await ctx.newPage();
      const url = s.serve(fileName(s, `eol-${name}`), await s.assemble(text, { delivery: 'inline' }));
      let fromFile = '';
      try { fromFile = await openEditor(s, page, url); } catch (e) { p.fail(`${name}: could not open the file and mount its editor: ${msg(e)}`); continue; }
      const raw = await ed<[string, string | null, boolean, string | null] | null>(page, 'window.__orzC.islandRaw()');
      if (p.check(raw, `${name}: no #orz-src in the DOM`)) {
        const dom = readIslandFromDom({ textContent: raw![0], getAttribute: (n) => (n === 'data-orz-eol' ? raw![1] : null), hasAttribute: (n) => n === 'data-orz-bom' && raw![2] });
        p.check(dom === text, `${name}: the DOM island read in Chrome differs — ${firstDiff(dom, text)}`);
      }
      p.check(fromFile === text, `${name}: OrzCarrier.extract of the opened file differs — ${firstDiff(fromFile, text)}`);
      const got = await ed<string>(page, 'window.__orzEditor.getText()');
      p.check(got === text, `${name}: the mounted editor's getText() differs — ${firstDiff(got, text)}`);
    }
  },

  async 'C.law.content-independence'(s, p) {
    const { kind } = s.target;
    const texts = lawTexts(s, corpus());
    for (const [name, text] of texts) {
      try {
        const mine = derivedParts(await s.assemble(text, { delivery: 'cdn' }));
        const ref = derivedParts(assembleEnvelope(text, { kind, shellVersion: '0.0.0', delivery: 'cdn', headHtml: '', bodyHtml: '' }));
        p.check(mine.head === ref.head, `${name}: the head derived from the text is not the kit envelope's — ${firstDiff(mine.head, ref.head)}`);
        p.check(mine.island === ref.island, `${name}: the island is not the kit envelope's — ${firstDiff(mine.island, ref.island)}`);
        p.check(mine.includes === ref.includes, `${name}: #orz-includes differs from the kit envelope's`);
      } catch (e) { p.fail(`${name}: ${msg(e)}`); }
    }
    const others = [s.releases.previous, s.releases.next].filter((r): r is Release => !!r);
    if (others.length === 0) return;
    needBrowser(s);
    const list = texts.map(([, t]) => t);
    const previews = async (r: Release): Promise<string[] | null> => {
      const page = await s.bundlePage(r);
      return call<string[] | null>(page, `async function (texts) {
        var C = globalThis.OrzCarrier;
        if (!C || typeof C.renderPreview !== 'function') return null;
        var out = [];
        for (var i = 0; i < texts.length; i++) out.push(String(await C.renderPreview(texts[i])));
        return out;
      }`, list);
    };
    const mineP = await previews(s.releases.target);
    for (const r of others) {
      const files = await s.chromeAssemble(r, list, 'cdn');
      const theirsP = await previews(r);
      for (let i = 0; i < texts.length; i++) {
        const [name, text] = texts[i];
        const a = derivedParts(await s.assemble(text, { delivery: 'cdn' }));
        const b = derivedParts(files[i]);
        p.check(a.head === b.head && a.island === b.island && a.includes === b.includes, `${name}: the ${r.label} release (${r.version}) derives other content from the same text — ${firstDiff(a.head + a.island + a.includes, b.head + b.island + b.includes)}`);
        if (mineP && theirsP) p.check(mineP[i] === theirsP[i], `${name}: renderPreview differs between this release and ${r.label} ${r.version} — ${firstDiff(mineP[i], theirsP[i])}`);
      }
    }
  },

  async 'C.law.refusals'(s, p) {
    for (const [name, text] of Object.entries(REFUSED_TEXTS)) {
      let html: string | null = null;
      try { html = await callAssemble((t, o) => s.target.assemble(t, o), text, { delivery: 'inline' }); } catch { /* refused: right */ }
      p.check(html === null, `${name}: assemble did not refuse the text`);
    }
    // the browser bundle refuses them too (it is what the update and the editor's save run)
    needBrowser(s);
    const page = await s.bundlePage(s.releases.target);
    const names = Object.keys(REFUSED_TEXTS);
    const got = await call<string[]>(page, `async function (texts) {
      var out = [];
      for (var i = 0; i < texts.length; i++) {
        for (var d of ['cdn', 'inline']) {
          try {
            var h = await globalThis.OrzCarrier.assemble(texts[i], d === 'inline' ? { delivery: 'inline', engineSource: 'void 0;' } : { delivery: 'cdn' });
            out.push(typeof h === 'string' ? 'wrote' : 'refused');
          } catch (e) { out.push('refused'); }
        }
      }
      return out;
    }`, names.map((n) => REFUSED_TEXTS[n]));
    names.forEach((n, i) => {
      p.check(got[2 * i] === 'refused', `${n}: the browser bundle's assemble did not refuse the text (cdn)`);
      p.check(got[2 * i + 1] === 'refused', `${n}: the browser bundle's assemble did not refuse the text (inline)`);
    });
  },
});

// ── bundle rule ──────────────────────────────────────────────────────────

export const bundleChecks: Record<string, CheckFn> = {
  async 'C.bundle.script-safe'(s, p) {
    const r = s.releases.target;
    let code = '';
    try { code = decodeStrict(r.bytes); } catch { p.fail('the bundle is not valid UTF-8'); code = r.code; }
    p.check(isScriptSafe(code) && !/<\\*\/?script/i.test(code), `the bundle holds a literal <script or </script (first at ${code.search(/<\\*\/?script/i)}): write each "<" before script//script as \\x3C`);
    p.check(escapeScriptText(code) === code, 'the project\'s script escaping changes the bundle');
    p.check(!code.includes('\r'), 'the bundle holds a CR, which an HTML parser rewrites when it is inlined (its bytes would no longer match the integrity)');
    p.check(!code.includes('\u0000'), 'the bundle holds NUL');
    p.check(r.bytes.length > 0, 'the bundle is empty');
  },

  async 'C.bundle.release'(s, p) {
    const r = s.releases.target;
    const { kind, version } = s.target;
    if (!p.check(r.manifest, `release.json does not parse as a JSON object (${s.target.release})`)) return;
    const m = parseManifest(r.manifest, kind as ReleaseKind);
    if (!p.check(m, 'release.json is not a valid manifest (spec/shell-runtime.md §6)')) return;
    p.eq(m!.kind, kind, 'release.json kind');
    p.eq(m!.version, version, 'release.json version (= the target version)');
    p.check(m!.formats.includes(1), 'release.json formats do not include 1');
    if (r.manifest!.notes !== undefined) p.check(m!.notes === r.manifest!.notes, 'release.json notes is not an https: link');
    p.eq(path().resolve(path().dirname(s.target.release), m!.bundle.path), path().resolve(s.target.bundle), 'bundle.path (relative to release.json) names the bundle');
    p.eq(m!.bundle.integrity, sha384(r.bytes), 'bundle.integrity = SHA-384 of the bundle bytes');
    p.check(r.bytes.length <= MAX_BUNDLE_BYTES, `the bundle is larger than the update accepts (${MAX_BUNDLE_BYTES} bytes)`);
  },

  async 'C.bundle.global'(s, p) {
    needBrowser(s);
    const ctx = await s.context({ picker: 'none' });
    const page = await ctx.newPage();
    await page.goto(`${s.fileOrigin}/page/target.html`);
    const g = await call<Record<string, unknown> | null>(page, `function () {
      var C = globalThis.OrzCarrier;
      if (!C || typeof C !== 'object') return null;
      var t = {};
      ['assemble', 'extract', 'readDocument', 'mountEditor', 'renderPreview'].forEach(function (k) { t[k] = typeof C[k]; });
      return { kind: C.kind, version: C.version, formats: Array.isArray(C.formats) ? C.formats.slice() : C.formats, types: t };
    }`);
    if (!p.check(g, 'loading the bundle sets no globalThis.OrzCarrier object')) return;
    p.eq(g!.kind, s.target.kind, 'OrzCarrier.kind');
    p.eq(g!.version, s.target.version, 'OrzCarrier.version');
    p.check(Array.isArray(g!.formats) && (g!.formats as unknown[]).includes(1), 'OrzCarrier.formats does not include 1');
    const released = parseManifest(s.releases.target.manifest, s.target.kind as ReleaseKind)?.formats;
    p.eq(g!.formats, released, 'OrzCarrier.formats (= release.json formats: the update offers a release by them)');
    // every format it claims, it writes
    if (Array.isArray(g!.formats)) {
      const claimed = (g!.formats as unknown[]).filter((f): f is number => Number.isInteger(f));
      const wrote = await call<Array<string | null>>(page, `async function (fs) {
        var out = [];
        for (var i = 0; i < fs.length; i++) {
          var text = '{{nyml\\nkind: document\\nformat: ' + fs[i] + '\\ntitle: Format ' + fs[i] + '\\n}}\\n\\n# Format ' + fs[i] + '\\n';
          try { var h = await globalThis.OrzCarrier.assemble(text, { delivery: 'cdn' }); out.push(typeof h === 'string' ? h : null); } catch (e) { out.push(null); }
        }
        return out;
      }`, claimed);
      claimed.forEach((f, i) => {
        p.check(typeof wrote[i] === 'string' && extract(wrote[i]!)?.format === f, `OrzCarrier.formats lists ${f}, but its assemble refuses (or does not write) a text of format ${f}`);
      });
    }
    const types = g!.types as Record<string, string>;
    for (const k of ['assemble', 'extract', 'readDocument', 'mountEditor']) p.eq(types[k], 'function', `typeof OrzCarrier.${k}`);
    p.check(types.renderPreview === 'function' || types.renderPreview === 'undefined', `OrzCarrier.renderPreview is a ${types.renderPreview}`);
    // extract and readDocument agree with the kit
    const sample = EDIT_TEXT;
    const html = await s.assemble(sample, { delivery: 'cdn' });
    const agree = await call<{ x: unknown; d: Record<string, unknown> }>(page, `function (a) {
      var C = globalThis.OrzCarrier;
      var x = C.extract(a.html);
      var d = C.readDocument(a.text);
      return { x: x && { text: x.text, kind: x.kind, format: x.format, shell: x.shell, delivery: x.delivery }, d: { kind: d.kind, format: d.format, title: d.title, lang: d.lang, uid: d.meta && d.meta.uid } };
    }`, { html, text: sample });
    const kx = extract(html)!;
    p.eq(agree.x, { text: kx.text, kind: kx.kind, format: kx.format, shell: kx.shell, delivery: kx.delivery }, 'OrzCarrier.extract agrees with the kit');
    const kd = readDocument(sample, { kind: s.target.kind });
    p.eq(agree.d, { kind: kd.kind, format: kd.format, title: kd.title, lang: kd.lang, uid: kd.meta.uid }, 'OrzCarrier.readDocument agrees with the kit');
    // assemble from the bundle alone, in an opaque-origin sandbox (what the quiet update does)
    const sandboxed = await call<{ ok: boolean; html?: string; error?: string }>(page, `function (text) {
      return fetch('/bundle/target.js').then(function (r) { return r.text(); }).then(function (src) {
        return new Promise(function (resolve) {
          var f = document.createElement('iframe');
          f.setAttribute('sandbox', 'allow-scripts');
          var listener = 'addEventListener("message", function (e) { if (e.source !== parent) return; var B = document.scripts[0].textContent;'
            + ' Promise.resolve().then(function () { return OrzCarrier.assemble(e.data.text, { delivery: "inline", engineSource: B }); })'
            + '.then(function (h) { parent.postMessage({ ok: true, html: h }, "*"); }, function (err) { parent.postMessage({ ok: false, error: String(err && err.message || err) }, "*"); }); });'
            + ' parent.postMessage({ ready: true }, "*");';
          f.srcdoc = '<!doctype html><meta charset="utf-8"><script>' + src + '<' + '/script><script>' + listener + '<' + '/script>';
          var timer = setTimeout(function () { resolve({ ok: false, error: 'the sandboxed bundle did not answer in 30 s' }); }, 30000);
          addEventListener('message', function on(e) {
            if (e.source !== f.contentWindow) return;
            if (e.data && e.data.ready) { f.contentWindow.postMessage({ text: text }, '*'); return; }
            removeEventListener('message', on); clearTimeout(timer); f.remove(); resolve(e.data);
          });
          document.body.appendChild(f);
        });
      });
    }`, sample);
    if (p.check(sandboxed.ok, `assemble failed in an opaque-origin sandbox: ${sandboxed.error}`)) {
      const expected = await s.assemble(sample, { delivery: 'inline', engineSource: s.releases.target.code });
      p.check(sandboxed.html === expected, `the sandboxed assemble differs from Node's — ${firstDiff(sandboxed.html ?? '', expected)}`);
    }
  },
};

// ── create ───────────────────────────────────────────────────────────────

export const createChecks: Record<string, CheckFn> = {
  async 'C.create.header'(s, p) {
    const { kind } = s.target;
    const [a, b] = [await s.target.create(), await s.target.create()];
    if (!p.check(typeof a === 'string' && typeof b === 'string', 'create() did not return a text')) return;
    p.check(/^﻿?[ \t\r\n]*\{\{nyml[ \t]*\r?\n[ \t]*kind:[ \t]*document[ \t]*\r?\n/.test(a), `the new text does not start with a header ({{nyml alone, then kind: document): ${clip(JSON.stringify(a.slice(0, 60)))}`);
    const h = readHeader(a);
    if (!p.check(h, 'readHeader finds no header in the new text')) return;
    p.check(/^doc-[0-9a-z]{16}$/.test(h!.fields.uid ?? ''), `the new uid is not doc- + 16 base36 characters: ${h!.fields.uid}`);
    p.check(readHeader(b)?.fields.uid !== h!.fields.uid, 'two new documents got the same uid');
    p.eq(h!.fields.carrier, kind, 'the header names the carrier (FC-18 §3: tools write it when they create a file)');
    if (h!.fields.format !== undefined) p.eq(h!.fields.format, '1', 'header format');
    const errors = lintHeader(a, kind).filter((l) => l.level === 'error');
    p.eq(errors.map((l) => l.code), [], 'lint errors in the new header');
    p.eq(readDocument(a, { kind }).kind, kind, 'readDocument kind');
  },

  async 'C.create.newest-shell'(s, p) {
    const { kind, version } = s.target;
    const text = await s.target.create();
    const html = await callAssemble((t, o) => s.target.assemble(t, o), text);
    p.check(html.includes(`<meta name="generator" content="orz-${kind} ${version}">`), `no generator meta "orz-${kind} ${version}"`);
    const shell = /<script type="application\/json" id="orz-shell">([^<]*)<\/script>/.exec(html)?.[1];
    p.eq(shell, JSON.stringify({ kind, format: 1, shell: version, delivery: 'inline' }), '#orz-shell');
    const x = extract(html);
    p.eq(x && [x.text === text, x.shell, x.delivery], [true, version, 'inline'], 'extract of the new file (text exact, shell, delivery)');
    p.eq(s.releases.target.version, version, 'release.json version');
  },

  async 'C.create.island'(s, p) {
    const base = await s.target.create();
    const lf = base.replace(/\r\n?/g, '\n');
    const variants: Array<[string, string, Record<string, string | boolean>]> = [
      ['as created', base, { eol: eolStyle(base), bom: base.charCodeAt(0) === 0xfeff }],
      ['CR LF + BOM', `﻿${lf.replace(/\n/g, '\r\n')}`, { eol: 'crlf', bom: true }],
      ['CR', lf.replace(/\n/g, '\r'), { eol: 'cr', bom: false }],
    ];
    for (const [name, text, want] of variants) {
      const html = await callAssemble((t, o) => s.target.assemble(t, o), text);
      const tags = islandTags(html);
      if (!p.check(tags.length === 1, `${name}: ${tags.length} #orz-src islands (one expected)`)) continue;
      p.eq(tags[0].type, 'text/markdown', `${name}: island type`);
      p.eq(tags[0]['data-orz-format'], '1', `${name}: data-orz-format`);
      p.eq(tags[0]['data-orz-eol'], want.eol, `${name}: data-orz-eol`);
      p.eq('data-orz-bom' in tags[0], want.bom, `${name}: data-orz-bom`);
      p.eq((html.match(/<script\b[^>]*\bid="orz-shell"/g) ?? []).length, 1, `${name}: #orz-shell count`);
    }
  },

  async 'C.create.meta'(s, p) {
    const { kind, version } = s.target;
    const text = await s.target.create();
    const html = await callAssemble((t, o) => s.target.assemble(t, o), text);
    const ref = assembleEnvelope(text, { kind, shellVersion: version, headHtml: '', bodyHtml: '' });
    p.check(derivedParts(html).head === derivedParts(ref).head, `the head metadata and #orz-meta are not the kit's (derived from the header) — ${firstDiff(derivedParts(html).head, derivedParts(ref).head)}`);
    const body = await callAssemble((t, o) => s.target.assemble(t, o), `${text}\n# A later heading\n\nMore body, [a link](https://example.org).\n`);
    p.check(derivedParts(body).head === derivedParts(html).head, 'editing the body changed the head metadata or #orz-meta');
    // a header whose title differs from the body's first heading: the head and #orz-meta follow the header
    const authoredText = editHeader(text, { title: 'A title only the header gives', author: 'Conformance Author', keywords: 'alpha, beta' });
    const authored = await callAssemble((t, o) => s.target.assemble(t, o), authoredText);
    const authoredRef = assembleEnvelope(authoredText, { kind, shellVersion: version, headHtml: '', bodyHtml: '' });
    p.check(derivedParts(authored).head === derivedParts(authoredRef).head, `after a header edit (title, author, keywords) the head metadata and #orz-meta are not the kit's — ${firstDiff(derivedParts(authored).head, derivedParts(authoredRef).head)}`);
    const meta = /<script type="application\/orz-meta\+json" id="orz-meta">([\s\S]*?)<\/script>/.exec(authored)?.[1] ?? '';
    p.check(meta.includes('Conformance Author') && meta.includes('alpha'), 'a header author/keywords edit does not reach #orz-meta');
    p.check(!/"(docId|fileName|path|filename)"/.test(meta), '#orz-meta holds a file or user field');
  },
};

// ── edit ─────────────────────────────────────────────────────────────────

export const editChecks: Record<string, CheckFn> = {
  async 'C.edit.exact'(s, p) {
    needBrowser(s);
    // with the pinned CodeMirror 6 served at its jsDelivr URL, then with it unreachable (the textarea fallback)
    for (const [label, codemirror] of [['CodeMirror served', true], ['CodeMirror unreachable (fallback)', false]] as const) {
      const ctx = await s.context({ picker: 'stub', codemirror });
      const page = await ctx.newPage();
      const url = s.serve(fileName(s, codemirror ? 'edit' : 'edit-fallback'), await s.assemble(EDIT_TEXT, { delivery: 'inline' }));
      const q = new Probe();
      const read = await openEditor(s, page, url);
      q.check(read === EDIT_TEXT, `the opened file does not give back its text — ${firstDiff(read, EDIT_TEXT)}`);
      q.check((await ed<string>(page, 'window.__orzEditor.getText()')) === EDIT_TEXT, 'getText() of the mounted editor is not the exact text');
      q.eq(await ed(page, 'window.__orzEditor.isDirty()'), false, 'isDirty() right after mounting');
      await ed(page, 'window.__orzEditor.focus()');
      await page.keyboard.type('Zq1');
      let t = await ed<string>(page, 'window.__orzEditor.getText()');
      q.check(t.includes('Zq1') && t.replace('Zq1', '') === EDIT_TEXT, `typing "Zq1" did not insert exactly it — ${firstDiff(t.replace('Zq1', ''), EDIT_TEXT)}`);
      q.eq(await ed(page, 'window.__orzEditor.isDirty()'), true, 'isDirty() after typing');
      await page.keyboard.press('Enter');
      t = await ed<string>(page, 'window.__orzEditor.getText()');
      q.check(t.startsWith('\uFEFF'), 'the BOM was lost after typing');
      q.check(!/(^|[^\r])\n/.test(t) && !/\r(?!\n)/.test(t), 'a typed line break is not written in the document\'s CR LF style');
      q.check(t.replace('Zq1\r\n', '') === EDIT_TEXT, `the typed line break is not exactly one CR LF after "Zq1" — ${firstDiff(t.replace('Zq1\r\n', ''), EDIT_TEXT)}`);
      q.check(await undoTo(page, page, EDIT_TEXT), 'undo does not return to the exact original text');
      q.eq(await ed(page, 'window.__orzEditor.isDirty()'), false, 'isDirty() after undoing back to the saved text');
      await ed(page, `window.__orzEditor.setText(${JSON.stringify(`${EDIT_TEXT}More.\r\n`)})`);
      q.eq(await ed(page, 'window.__orzEditor.isDirty()'), true, 'isDirty() after setText');
      await ed(page, 'window.__orzEditor.markSaved()');
      q.eq(await ed(page, 'window.__orzEditor.isDirty()'), false, 'isDirty() after markSaved()');
      q.check((await ed<string>(page, 'window.__orzEditor.getText()')) === `${EDIT_TEXT}More.\r\n`, 'setText did not adopt the text exactly');
      for (const f of q.failures) p.fail(`${label}: ${f}`);
      await ctx.context.close();
    }
  },

  async 'C.edit.set-header'(s, p) {
    needBrowser(s);
    const ctx = await s.context({ picker: 'stub' });
    const page = await ctx.newPage();
    const url = s.serve(fileName(s, 'header'), await s.assemble(EDIT_TEXT, { delivery: 'inline' }));
    await openEditor(s, page, url);
    // FC-19 §4 binds setHeader and undo: their absence is a failure, not a skip
    const api = await ed<{ setHeader: string; undo: string }>(page, '({ setHeader: typeof window.__orzEditor.setHeader, undo: typeof window.__orzEditor.undo })');
    p.eq(api, { setHeader: 'function', undo: 'function' }, 'the Editor\'s setHeader and undo (FC-19 §4)');
    if (api.setHeader !== 'function') return;
    await ed(page, 'window.__orzEditor.setHeader({ title: "Renamed by conformance", x_new_key: "added" })');
    const after = await ed<string>(page, 'window.__orzEditor.getText()');
    const want = editHeader(EDIT_TEXT, { title: 'Renamed by conformance', x_new_key: 'added' });
    p.check(after === want, `setHeader is not the kit's editHeader — ${firstDiff(after, want)}`);
    p.eq(await ed(page, 'window.__orzEditor.isDirty()'), true, 'isDirty() after setHeader');
    if (api.undo === 'function') await ed(page, 'window.__orzEditor.undo()');
    else { await ed(page, 'window.__orzEditor.focus()'); await page.keyboard.press('ControlOrMeta+z'); }
    const back = await ed<string>(page, 'window.__orzEditor.getText()');
    p.check(back === EDIT_TEXT, `one undo does not restore the exact text — ${firstDiff(back, EDIT_TEXT)}`);
    const refused = await ed<boolean>(page, '(function () { try { window.__orzEditor.setHeader({ title: "a }} b" }); return false; } catch (e) { return true; } })()');
    p.check(refused, 'setHeader accepted a value holding "}}"');
    p.check((await ed<string>(page, 'window.__orzEditor.getText()')) === EDIT_TEXT, 'a refused setHeader changed the text');
  },

  async 'C.edit.newer-format'(s, p) {
    needBrowser(s);
    const ctx = await s.context({ picker: 'stub' });
    const page = await ctx.newPage();
    await page.goto(s.writeFile(fileName(s, 'newer-format'), await s.assemble(EDIT_TEXT, { delivery: 'inline' })));
    await page.evaluate(PAGE_HELPERS);
    // the target's own editor driver, given a text whose header says format: 2
    await call(page, `async function (text) {
      var e = await (${s.target.editor ?? DEFAULT_EDITOR_DRIVER})(text);
      window.__orzEditor = e;
      if (e && e.ready && typeof e.ready.then === 'function') { try { await e.ready; } catch (x) {} }
      return true;
    }`, NEWER_TEXT);
    p.check((await ed<string>(page, 'window.__orzEditor.getText()')) === NEWER_TEXT, 'the newer-format text is not shown exactly');
    await ed(page, 'window.__orzEditor.focus()');
    await page.keyboard.type('Zq1');
    await page.keyboard.press('Enter');
    p.check((await ed<string>(page, 'window.__orzEditor.getText()')) === NEWER_TEXT, 'typing changed a newer-format text (it must open read-only, FC-18 §8.4)');
    p.eq(await ed(page, 'window.__orzEditor.isDirty()'), false, 'isDirty() after typing into a read-only newer-format text');
    await ed(page, 'window.__orzEditor.save()');
    await page.keyboard.press('ControlOrMeta+s');
    // an app's setText cannot make it writable either: the save still writes nothing
    await ed(page, `(function () { try { window.__orzEditor.setText(${JSON.stringify(`${NEWER_TEXT}Changed.
`)}); } catch (e) {} })()`);
    await ed(page, 'window.__orzEditor.save()');
    await page.waitForTimeout(800);
    p.eq(ctx.of('picker').length + ctx.of('write').length + ctx.downloads.length, 0, 'pickers, writes or downloads for a newer-format text (it must never be saved over)');
    p.eq(ctx.of('dialog').length, 0, 'dialogs');
  },

  async 'C.edit.app-host'(s, p) {
    needBrowser(s);
    // a newer release is advertised: an editor in an app never checks for it (the app owns the version)
    const ctx = await s.context({ picker: 'stub', cdn: { latest: s.releases.next ?? s.releases.target } });
    const page = await ctx.newPage();
    await page.goto(`${s.fileOrigin}/page/target.html`);
    await page.evaluate(PAGE_HELPERS);
    const STYLE = `function () {
      var cs = function (el) { var c = getComputedStyle(el); return [c.fontFamily, c.fontSize, c.fontWeight, c.color, c.lineHeight, c.backgroundColor, c.margin, c.padding, c.outlineStyle, c.boxSizing].join('|'); };
      var sheets = [].slice.call(document.querySelectorAll('style, link[rel~="stylesheet"]')).map(function (n) { return n.outerHTML.slice(0, 200); });
      return { style: [document.documentElement, document.body, document.getElementById('orz-conformance-sentinel'), document.getElementById('orz-conformance-sentinel-button')].map(cs), sheets: sheets, adopted: document.adoptedStyleSheets ? document.adoptedStyleSheets.length : 0 };
    }`;
    await call(page, `function () {
      var p = document.createElement('p'); p.id = 'orz-conformance-sentinel'; p.textContent = 'A paragraph of the app.'; document.body.appendChild(p);
      var b = document.createElement('button'); b.id = 'orz-conformance-sentinel-button'; b.textContent = 'An app button'; document.body.appendChild(b);
      return true;
    }`);
    const before = await call<{ style: string[]; sheets: string[]; adopted: number }>(page, STYLE);
    const t0 = Date.now();
    await call(page, `async function (a) {
      window.__saves = [[], [], []];
      window.__saveDelay = 0;
      window.__els = [];
      var mk = function () { var el = document.createElement('div'); el.style.cssText = 'width: 1000px; height: 300px;'; document.body.appendChild(el); window.__els.push(el); return el; };
      var mount = async function (i, text, extra) {
        var o = { text: text, mode: 'editor', hooks: { save: function (t) { window.__saves[i].push(t); return new Promise(function (r) { setTimeout(r, window.__saveDelay); }); } } };
        for (var k in extra) o[k] = extra[k];
        var e = await globalThis.OrzCarrier.mountEditor(mk(), o);
        if (e && e.ready && typeof e.ready.then === 'function') { try { await e.ready; } catch (x) {} }
        return e;
      };
      window.__A = await mount(0, a.one, {});
      window.__B = await mount(1, a.two, {});
      window.__R = await mount(2, a.two, { readOnly: true });
      return true;
    }`, { one: EDIT_TEXT, two: OTHER_TEXT });
    const after = await call<{ style: string[]; sheets: string[]; adopted: number }>(page, STYLE);
    p.eq(after.style, before.style, 'computed styles of the page\'s own elements (html, body, a paragraph, a button) after mounting (the editor\'s CSS must stay in its shadow root)');
    p.eq([after.sheets, after.adopted], [before.sheets, before.adopted], 'style sheets in the page itself (<style>, stylesheet links, adopted sheets) after mounting');
    // hooks.save gets the exact text, once; nothing is written, downloaded or picked
    await ed(page, `window.__A.setText(${JSON.stringify(EDITED)})`);
    const outcome = await ed<Record<string, unknown>>(page, 'window.__A.save()');
    p.eq(outcome && [outcome.ok, outcome.via], [true, 'hook'], 'the save outcome of an app host\'s editor (ok, via "hook")');
    const saves = await ed<string[][]>(page, 'window.__saves');
    if (p.check(saves[0].length === 1, `hooks.save was called ${saves[0].length} times for one save()`)) {
      p.check(saves[0][0] === EDITED, `hooks.save did not get the exact text (BOM, CR LF) — ${firstDiff(saves[0][0], EDITED)}`);
    }
    p.eq([saves[1].length, saves[2].length], [0, 0], 'saves by the other editors');
    p.eq(await ed(page, 'window.__A.isDirty()'), false, 'isDirty() after the hook resolved');
    p.eq(ctx.of('picker').length + ctx.of('write').length + ctx.downloads.length, 0, 'pickers, writes or downloads in an app host (hooks.save owns persistence)');
    // two editors keep their own text and undo history (FC-19 §5 invariant 2)
    await ed(page, `window.__B.setText(${JSON.stringify(`${OTHER_TEXT}B edit\n`)})`);
    for (let i = 0; i < 5 && (await ed<string>(page, 'window.__A.getText()')) !== EDIT_TEXT; i++) await ed(page, 'window.__A.undo()');
    p.check((await ed<string>(page, 'window.__A.getText()')) === EDIT_TEXT, 'undo on the first editor does not return to its own text');
    p.check((await ed<string>(page, 'window.__B.getText()')) === `${OTHER_TEXT}B edit\n`, 'undo on the first editor changed the second editor');
    await ed(page, 'window.__B.undo()');
    p.check((await ed<string>(page, 'window.__B.getText()')) === OTHER_TEXT, 'undo on the second editor does not return to its own text');
    p.check((await ed<string>(page, 'window.__A.getText()')) === EDIT_TEXT, 'undo on the second editor changed the first editor');
    // an edit made while a slow hook save runs is not saved: the editor stays dirty (FC-19 §8.5; closed loop 2 round 3)
    const slow = `${EDITED}Saved slowly.\r\n`;
    const during = `${slow}Typed during the save.\r\n`;
    await ed(page, '(window.__saveDelay = 800, true)');
    await ed(page, `window.__A.setText(${JSON.stringify(slow)})`);
    await ed(page, '(window.__slow = window.__A.save(), true)');
    await page.waitForTimeout(200);
    await ed(page, `window.__A.setText(${JSON.stringify(during)})`);
    const slowOutcome = await ed<Record<string, unknown>>(page, 'window.__slow');
    await ed(page, '(window.__saveDelay = 0, true)');
    p.eq(slowOutcome && [slowOutcome.ok, slowOutcome.via], [true, 'hook'], 'the outcome of a slow hook save');
    const hooked = (await ed<string[][]>(page, 'window.__saves'))[0];
    p.check(hooked[hooked.length - 1] === slow, 'the slow hook save did not get the text of the moment save() was called');
    p.eq(await ed(page, 'window.__A.isDirty()'), true, 'isDirty() after a hook save during which the text was edited (the edit was not saved: it must stay dirty)');
    p.check((await ed<string>(page, 'window.__A.getText()')) === during, 'the edit made during the hook save is not in the editor any more');
    // readOnly: true keeps the reader's keys out, Cmd/Ctrl+S included
    await ed(page, 'window.__R.focus()');
    await page.keyboard.type('Zq1');
    await page.keyboard.press('Enter');
    p.check((await ed<string>(page, 'window.__R.getText()')) === OTHER_TEXT, 'typing changed an editor mounted with readOnly: true');
    // Cmd/Ctrl+S with the focus in the read-only editor's own controls (a read-only text may not take the focus)
    await ed(page, `(function () {
      var el = window.__els[2];
      var a = document.activeElement;
      var inside = a && (el.contains(a) || (a.shadowRoot && el.contains(a)));
      if (inside) return true;
      var f = window.__orzC.deepAll(el, 'button:not([hidden]), [tabindex], textarea, [contenteditable="true"], input').filter(function (n) { return n.offsetParent !== null || n.getClientRects().length > 0; })[0];
      if (f) f.focus();
      return true;
    })()`);
    await page.keyboard.press('ControlOrMeta+s');
    await ed(page, 'window.__R.save()');
    await page.waitForTimeout(300);
    p.eq((await ed<string[][]>(page, 'window.__saves'))[2].length, 0, 'saves of an editor mounted with readOnly: true (save() and Cmd/Ctrl+S)');
    // no update check, no indicator
    await page.waitForTimeout(Math.max(0, 3_000 - (Date.now() - t0)));
    p.eq(ctx.requests.filter((u) => u.endsWith('/release.json')).length, 0, 'manifest requests from an editor in an app host (the app owns the version)');
    p.eq(await page.getByRole('button', { name: /^Update available/ }).count(), 0, 'update indicators in an app host');
    p.eq(ctx.of('dialog').length, 0, 'dialogs');
  },

  async 'C.edit.preview-isolation'(s, p) {
    needBrowser(s);
    const ctx = await s.context({ picker: 'stub' });
    const page = await ctx.newPage();
    // an app host: a page of its own origin that loaded the bundle and mounts the editor with hooks.save
    await page.goto(`${s.fileOrigin}/page/target.html`);
    await page.evaluate(PAGE_HELPERS);
    await call(page, `async function (text) {
      localStorage.setItem('orz-conformance-secret', 'S3CRET');
      document.cookie = 'orzconformance=S3CRET';
      window.__hookSaves = 0; window.__links = [];
      var el = document.createElement('div');
      el.style.cssText = 'width: 1100px; height: 640px;';
      document.body.appendChild(el);
      var e = await globalThis.OrzCarrier.mountEditor(el, ${ISOLATION_OPTIONS});
      window.__orzEditor = e;
      if (e && e.ready && typeof e.ready.then === 'function') { try { await e.ready; } catch (x) {} }
      ${WATCH_VIEW}
      return true;
    }`, LONG_TEXT);
    const sandboxes = await ed<Array<string | null>>(page, 'window.__orzC.deepAll(document, "iframe").map(function (f) { return f.getAttribute("sandbox"); })');
    if (!p.check(sandboxes.length > 0, 'no preview iframe in split mode')) return;
    p.eq(sandboxes, sandboxes.map(() => 'allow-scripts'), 'the preview iframe sandbox in an app host (exactly "allow-scripts", never allow-same-origin)');
    let frames: Frame[] = [];
    await until(() => (frames = page.frames().filter((f) => f !== page.mainFrame())).length > 0, 10_000);
    if (!p.check(frames.length > 0, 'no preview frame loaded within 10 s (nothing below could be probed)')) return;
    // what a document script in the preview can reach (Playwright's evaluation is a page script: no user activation)
    const PROBE = `function (ms) {
      var r = {};
      try { r.parentDoc = String(parent.document.title); } catch (e) { r.parentDoc = null; }
      try { r.storage = localStorage.getItem('orz-conformance-secret'); } catch (e) { r.storage = null; }
      try { r.cookie = document.cookie; } catch (e) { r.cookie = null; }
      r.origin = String(location.origin);
      var n = 0, end = Date.now() + ms;
      var t = setInterval(function () {
        var P = parent;
        P.postMessage({ type: 'orz-preview-ready' }, '*');
        P.postMessage({ type: 'orz-preview-ready', channel: 'forged' }, '*');
        P.postMessage({ type: 'orz-preview-ready', channel: 'forged', secret: 'guessed' }, '*');
        P.postMessage({ type: 'orz-preview-key', key: 's' }, '*');
        P.postMessage({ type: 'orz-preview-key', key: '\\\\' }, '*');
        P.postMessage({ type: 'orz-preview-key', key: 'Escape' }, '*');
        P.postMessage({ type: 'orz-preview-active' }, '*');
        P.postMessage({ type: 'orz-preview-scrolled', top: 0, max: 100000 }, '*');
        P.postMessage({ type: 'orz-preview-link', href: 'https://example.org/forged-' + (n++) }, '*');
        var a = document.createElement('a'); a.href = 'https://example.org/clicked'; (document.body || document.documentElement).appendChild(a); a.click(); a.remove();
        try { window.open('https://example.org/popup'); } catch (e) {}
        if (Date.now() > end) clearInterval(t);
      }, 120);
      return r;
    }`;
    const probes: Array<Record<string, unknown>> = [];
    for (const f of frames) {
      try { probes.push(await call<Record<string, unknown>>(f, PROBE, 9_000)); } catch (e) { p.fail(`the probe could not run in the preview frame: ${msg(e)}`); }
    }
    for (const r of probes) {
      p.eq(r.parentDoc, null, 'a preview script read the host page\'s document');
      p.check(r.storage !== 'S3CRET', 'a preview script read the host page\'s localStorage');
      p.check(typeof r.cookie !== 'string' || !r.cookie.includes('S3CRET'), 'a preview script read the host page\'s cookies');
      p.eq(r.origin, 'null', 'the preview\'s origin (opaque)');
    }
    // phase 1: nobody touches the page; the forgeries must do nothing
    await page.waitForTimeout(2_000);
    p.eq(await ed(page, 'window.__hookSaves'), 0, 'saves triggered by a forged save key (no user activation, focus not in the preview)');
    // phase 2: the reader types at the end while the forgeries go on
    await ed(page, 'window.__orzEditor.focus()');
    await page.keyboard.press('ControlOrMeta+End');
    const typed = 'typed while the preview forges messages';
    for (const ch of typed) { await page.keyboard.type(ch); await page.waitForTimeout(25); }
    await page.waitForTimeout(500);
    const got = await ed<string>(page, 'window.__orzEditor.getText()');
    p.check(got === `${LONG_TEXT}${typed}`, `forged Escape / focus messages took the reader's keystrokes — ${firstDiff(got, `${LONG_TEXT}${typed}`)}`);
    const scrolled = await ed<number>(page, `Math.max.apply(null, [0].concat(window.__orzC.deepAll(document, '*').filter(function (el) {
      return el.tagName !== 'IFRAME' && el !== document.scrollingElement && el !== document.body && el.scrollHeight > el.clientHeight + 20;
    }).map(function (el) { return el.scrollTop; })))`);
    p.check(scrolled > 0, 'forged scroll messages pulled the editor back to the top while the reader typed at the end (scroll sync followed a pane the reader does not drive)');
    p.eq(await ed(page, 'window.__hookSaves'), 0, 'saves triggered by a forged save key while the reader typed in the editor');
    p.eq(ctx.context.pages().length, 1, 'pages opened by forged links, synthetic clicks or window.open (no user activation)');
    p.eq(ctx.requests.filter((u) => u.startsWith('https://example.org/')), [], 'requests to forged link targets');
    p.eq(ctx.of('dialog').length, 0, 'dialogs');
    await noAction(page, p, 'forged messages');
    // the phases below each in a page of their own; bounded: a page that stops answering (a focus loop
    // between the editor and the frame) is a finding, not a hang
    const phases: Array<[string, (s: Session, p: Probe) => Promise<void>]> = [['focus theft', focusTheft], ['replaced previews', replacedPreviews], ['tab switch', tabSwitch]];
    for (const [name, phase] of phases) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stuck = await Promise.race([
        phase(s, p).then(() => false),
        new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(true), 60_000); }),
      ]).finally(() => clearTimeout(timer));
      if (stuck) p.fail(`${name}: the page stopped answering within 60 s (a focus loop between the editor and the frame?)`);
    }
  },
};

/**
 * The editor options of the preview-isolation pages: an app host's `hooks.save` that counts, and
 * `hooks.resolveLink` that records every link reaching the host and opens none (FC-19 §3).
 */
const ISOLATION_OPTIONS = `{ text: text, mode: 'split', hooks: {
  save: function () { window.__hookSaves = (window.__hookSaves || 0) + 1; return Promise.resolve(); },
  resolveLink: function (h) { (window.__links = window.__links || []).push(String(h)); return null; }
} }`;

/**
 * Page script (after a mount into `el`): records every change of what the editor shows — its preview
 * frame shown or hidden, its text area shown or hidden — in `window.__views` (a view change, e.g. by a
 * forged view key, hides one of them; FC-19's Editor has no getter for the mode).
 */
const WATCH_VIEW = `(function () {
  window.__views = [];
  var shown = function (n) { if (!n) return false; var r = n.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  var now = function () {
    var f = window.__orzC.deepAll(el, 'iframe')[0];
    var t = window.__orzC.deepAll(el, '.cm-content, textarea')[0];
    return (shown(f) ? 'preview' : '-') + '+' + (shown(t) ? 'editor' : '-');
  };
  var first = now();
  window.__viewFirst = first;
  setInterval(function () { var v = now(); if (v !== first && window.__views.length < 50) window.__views.push(v); }, 20);
})();`;

/** Nothing a frame forged acted: no save, no link reaching the host, no chip offering one, no view change. */
async function noAction(page: Page, p: Probe, what: string): Promise<void> {
  p.eq(await ed(page, 'window.__hookSaves || 0'), 0, `${what}: saves (hooks.save)`);
  p.eq(await ed(page, 'window.__links || []'), [], `${what}: links that reached the host (hooks.resolveLink)`);
  p.eq(await ed(page, 'window.__orzC.deepAll(document, "[data-orz-link]").length'), 0, `${what}: links offered to open (the shell's chip)`);
  p.eq(await ed(page, 'window.__views || []'), [], `${what}: view changes (the preview or the editor was hidden, from ${await ed(page, 'window.__viewFirst')})`);
}

/** Mount one editor (ISOLATION_OPTIONS, WATCH_VIEW) in a fresh page of its own context. */
async function isolationPage(s: Session, text: string): Promise<{ page: Page; ctx: CheckContext }> {
  const ctx = await s.context({ picker: 'stub' });
  const page = await ctx.newPage();
  await page.goto(`${s.fileOrigin}/page/target.html`);
  await page.evaluate(PAGE_HELPERS);
  await call(page, `async function (text) {
    window.__theft = 0; window.__stolen = []; window.__hookSaves = 0; window.__links = [];
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (d && d.type === 'orz-conformance-theft') window.__theft++;
      if (d && d.type === 'orz-conformance-stolen') window.__stolen.push(String(d.key));
    });
    var el = document.createElement('div');
    el.setAttribute('data-orz-conformance', 'editor');
    el.style.cssText = 'width: 1100px; height: 640px;';
    document.body.appendChild(el);
    var e = await globalThis.OrzCarrier.mountEditor(el, ${ISOLATION_OPTIONS});
    window.__orzEditor = e;
    if (e && e.ready && typeof e.ready.then === 'function') { try { await e.ready; } catch (x) {} }
    ${WATCH_VIEW}
    return true;
  }`, text);
  return { page, ctx };
}

/** Where the editor's own focus() put the caret, inside the visible part of the editor (null: not in the editor). */
const EDITOR_POINT = `(function () {
  window.__orzEditor.focus();
  var a = document.activeElement;
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
  if (!a || a === document.body || a.tagName === 'IFRAME') return null;
  // click inside the VISIBLE part of the editor: CodeMirror's content element can extend far
  // above the viewport once it has scrolled to the caret, so clip to its scroller and the window
  var r = a.getBoundingClientRect();
  var sc = a.closest ? a.closest('.cm-scroller') : null;
  var v = sc ? sc.getBoundingClientRect() : r;
  var top = Math.max(r.top, v.top, 0), bottom = Math.min(r.bottom, v.bottom, innerHeight);
  var left = Math.max(r.left, v.left, 0), right = Math.min(r.right, v.right, innerWidth);
  if (bottom - top < 4 || right - left < 4) return null;
  return { x: Math.min((left + right) / 2, left + 200), y: Math.min((top + bottom) / 2, top + 60) };
})()`;

/** Nothing reached outside the page: no other page, no request to a forged target, no dialog. */
function nothingOutside(ctx: CheckContext, p: Probe, what: string): void {
  p.eq(ctx.context.pages().length, 1, `${what}: pages opened by links or popups`);
  p.eq(ctx.requests.filter((u) => u.startsWith('https://example.org/')), [], `${what}: requests to forged link targets`);
  p.eq(ctx.of('dialog').length, 0, `${what}: dialogs`);
}

/**
 * Phase 3 of C.edit.preview-isolation: a document script in the preview (THEFT_SCRIPT, run by the
 * document itself from an image's error handler) keeps stealing the focus and forges save keys,
 * view keys, Escapes, "active" and links from the keys it receives — with the user activation those
 * keys give the frame. The reader clicks the editor and types. Keys may go to the preview (the
 * accepted limit, FC-19 §5 invariant 3); nothing else may come of it.
 */
async function focusTheft(s: Session, p: Probe): Promise<void> {
  const { page, ctx } = await isolationPage(s, THEFT_TEXT);
  if (!p.check(await until(() => page.frames().length > 1, 10_000), 'focus theft: no preview frame loaded within 10 s')) return;
  await until(async () => (await ed<number>(page, 'window.__theft')) > 2, 4_000); // the document's script has started (when the preview runs it)
  const at = await ed<{ x: number; y: number } | null>(page, EDITOR_POINT);
  if (!p.check(at, 'focus theft: the editor\'s focus() did not focus an element of the editor')) return;
  await page.mouse.click(at!.x, at!.y);
  await page.keyboard.type('typedwhilestolen', { delay: 60 });
  await page.waitForTimeout(800);
  await noAction(page, p, 'focus theft');
  nothingOutside(ctx, p, 'focus theft');
}

/**
 * Phase 4: previews replaced or nested by their own document (replacedTexts) — a nested frame that
 * steals the focus and posts to the top, `document.open()`, a meta refresh to an http page of the
 * harness's other origin and to a `data:` URL — each asking for the bridge's port and forging keys
 * and links. The reader types in the editor meanwhile. None may get a port; nothing may act.
 */
async function replacedPreviews(s: Session, p: Probe): Promise<void> {
  const grabUrl = s.serve('orz-conformance-grab.html', GRAB_PAGE).replace(s.fileOrigin, s.hostOrigin);
  for (const [name, text] of Object.entries(replacedTexts(grabUrl))) {
    const what = `replaced preview (${name})`;
    const { page, ctx } = await isolationPage(s, text);
    if (!p.check(await until(() => page.frames().length > 1, 10_000), `${what}: no preview frame loaded within 10 s`)) { await ctx.context.close(); continue; }
    const at = await ed<{ x: number; y: number } | null>(page, EDITOR_POINT);
    if (at) await page.mouse.click(at.x, at.y);
    await page.keyboard.type('typed', { delay: 40 });
    await page.waitForTimeout(3_500); // the refreshes (1 s) have navigated, and the documents asked for the port for 3 s
    const got: string[] = [];
    for (const f of page.frames()) if (f !== page.mainFrame()) got.push(String(await f.evaluate('window.__orzGot || ""').catch(() => '')));
    p.check(!got.join('').includes('[port]'), `${what}: a document that replaced or nested the preview got its port`);
    await noAction(page, p, what);
    nothingOutside(ctx, p, what);
    await ctx.context.close();
  }
}

/**
 * Phase 5: the reader clicks into the preview, switches to another tab and back, twice (Chrome gives
 * the frame its focus back): the preview must keep working — not replaced, paused or noted, no
 * `error` — so an edit still shows in it and Cmd/Ctrl+S pressed in it saves once.
 */
async function tabSwitch(s: Session, p: Probe): Promise<void> {
  const { page, ctx } = await isolationPage(s, LONG_TEXT);
  await ed(page, '(window.__errors = [], window.__orzEditor.on("error", function (e) { window.__errors.push(e.source + ": " + e.message); }), true)');
  if (!p.check(await until(() => page.frames().length > 1, 10_000), 'tab switch: no preview frame loaded within 10 s')) return;
  const frameEl = 'window.__orzC.deepAll(document, "iframe")[0]';
  await ed(page, `(window.__frame0 = ${frameEl}, true)`);
  const box = await ed<{ x: number; y: number } | null>(page, `(function () { var r = ${frameEl}.getBoundingClientRect(); return r.width > 40 ? { x: r.left + 60, y: r.top + 60 } : null; })()`);
  if (!p.check(box, 'tab switch: the preview frame is not shown in split mode')) return;
  await page.mouse.click(box!.x, box!.y);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(400);
  for (let i = 0; i < 2; i++) {
    const other = await ctx.newPage();
    await other.goto(`${s.fileOrigin}/blank.html`);
    await other.bringToFront();
    await other.waitForTimeout(600);
    await page.bringToFront();
    await page.waitForTimeout(1_500);
    await other.close();
  }
  const state = await ed<[boolean, string[], boolean, number]>(page, `[${frameEl} === window.__frame0, window.__errors, /Content-Security-Policy/.test(${frameEl}.srcdoc || ''), window.__orzC.deepAll(document, '[data-orz-paused]').length]`);
  p.eq(state, [true, [], false, 0], 'tab switch: the preview after a tab switch round trip with the focus in it ([the same frame, error events, a pausing policy, pause notes])');
  await page.mouse.click(box!.x, box!.y);
  await page.keyboard.press('ControlOrMeta+s');
  p.check(await until(async () => (await ed<number>(page, 'window.__hookSaves || 0')) >= 1, 3_000), 'tab switch: Cmd/Ctrl+S pressed in the preview after the round trip did not save');
  await page.waitForTimeout(300);
  p.eq(await ed(page, 'window.__hookSaves || 0'), 1, 'tab switch: saves from one Cmd/Ctrl+S in the preview');
  const marker = 'Written after the tab switch';
  await ed(page, `(window.__orzEditor.setText(window.__orzEditor.getText() + ${JSON.stringify(`\n${marker}.\n`)}), true)`);
  const shows = async () => { for (const f of page.frames()) if (f !== page.mainFrame() && String(await f.evaluate('document.body ? document.body.textContent : ""').catch(() => '')).includes(marker)) return true; return false; };
  p.check(await until(shows, 5_000), 'tab switch: an edit after the round trip did not show in the preview');
  p.eq(await ed(page, 'window.__views'), [], 'tab switch: view changes');
}

// ── save ─────────────────────────────────────────────────────────────────

const EDITED = `${EDIT_TEXT}Saved paragraph — 𝒳.\r\n`;

/** Open the file at `url`, edit it to EDITED, put a marker in the live DOM. */
async function editedPage(s: Session, ctx: CheckContext, url: string, p: Probe): Promise<Page> {
  const page = await ctx.newPage();
  await openEditor(s, page, url);
  await ed(page, `window.__orzEditor.setText(${JSON.stringify(EDITED)})`);
  await ed(page, `window.__orzC.marker(${JSON.stringify(LIVE_DOM_MARKER)})`);
  p.eq(await ed(page, 'window.__orzEditor.isDirty()'), true, 'isDirty() after the edit');
  return page;
}

function savedBytes(p: Probe, what: string, data: string, expected: string): void {
  p.check(!data.includes(LIVE_DOM_MARKER), `${what}: the saved file holds the live DOM (the harness marker), not the assembled text`);
  p.check(data === expected, `${what}: the saved bytes are not assemble(text) — ${firstDiff(data, expected)}`);
  const x = extract(data);
  p.check(x?.text === EDITED, `${what}: extract(saved).text is not the edited text`);
}

export const saveChecks: Record<string, CheckFn> = {
  async 'C.save.served-notice'(s, p) {
    needBrowser(s);
    const ctx = await s.context({ picker: 'stub' });
    const url = s.serve(fileName(s, 'served'), await s.assemble(EDIT_TEXT, { delivery: 'inline' }));
    const page = await editedPage(s, ctx, url, p);
    await ed(page, 'window.__orzEditor.save()');
    await page.waitForTimeout(400);
    p.eq(ctx.of('picker').length, 0, 'pickers opened on a served page');
    p.eq(ctx.of('write').length + ctx.downloads.length, 0, 'files written or downloaded on a served page');
    p.check((await ed<number>(page, 'window.__orzC.deepAll(document, "#orz-served-note").length')) > 0, 'no #orz-served-note notice is shown');
    p.eq(await ed(page, 'window.__orzEditor.isDirty()'), true, 'isDirty() after the notice (nothing was saved)');
    // the preview of a served standalone page: exactly allow-scripts (allow-same-origin is for a standalone file: page only)
    await ed(page, 'window.__orzEditor.setMode("split")');
    await until(async () => (await ed<number>(page, 'window.__orzC.deepAll(document, "iframe").length')) > 0, 5_000);
    const sandboxes = await ed<Array<string | null>>(page, 'window.__orzC.deepAll(document, "iframe").map(function (f) { return f.getAttribute("sandbox"); })');
    if (p.check(sandboxes.length > 0, 'no preview frame in split mode on a served page')) p.eq(sandboxes, sandboxes.map(() => 'allow-scripts'), 'the preview iframe sandbox on a served (http) page');
  },

  async 'C.save.file-system-access'(s, p) {
    needBrowser(s);
    const ctx = await s.context({ picker: 'stub' });
    const url = s.writeFile(fileName(s, 'fsa'), await s.assemble(EDIT_TEXT, { delivery: 'inline' }));
    const page = await editedPage(s, ctx, url, p);
    await ed(page, 'window.__orzEditor.save()');
    await until(() => ctx.of('write').length > 0 || ctx.downloads.length > 0, 10_000);
    const writes = ctx.of('write').map((r) => (r.data as { data: string }).data);
    p.eq(ctx.of('picker').length, 1, 'pickers opened by the first save');
    p.eq(ctx.downloads.length, 0, 'downloads (the picker was available)');
    if (p.check(writes.length === 1, `${writes.length} writes by the first save`)) savedBytes(p, 'File System Access', writes[0], await s.assemble(EDITED));
    const picked = ctx.of('picker')[0]?.data as { suggestedName?: string } | undefined;
    p.check(picked?.suggestedName?.endsWith(ext(s)), `the picker was offered "${picked?.suggestedName}", not a ${ext(s)} name`);
    p.eq(await ed(page, 'window.__orzEditor.isDirty()'), false, 'isDirty() after a successful save');
    // a second save reuses the session's handle
    await ed(page, `window.__orzEditor.setText(${JSON.stringify(`${EDITED}Second save.\r\n`)})`);
    await ed(page, 'window.__orzEditor.save()');
    await until(() => ctx.of('write').length > 1, 10_000);
    p.eq(ctx.of('picker').length, 1, 'pickers after the second save (the handle must be reused)');
    const second = ctx.of('write')[1]?.data as { data: string } | undefined;
    p.check(second?.data === (await s.assemble(`${EDITED}Second save.\r\n`)), 'the second save did not write assemble(text)');
  },

  async 'C.save.download'(s, p) {
    needBrowser(s);
    const ctx = await s.context({ picker: 'none' });
    const name = fileName(s, 'download');
    const url = s.writeFile(name, await s.assemble(EDIT_TEXT, { delivery: 'inline' }));
    const page = await editedPage(s, ctx, url, p);
    await ed(page, 'window.__orzEditor.save()');
    await until(() => ctx.downloads.length > 0 || ctx.of('write').length > 0, 15_000);
    if (p.check(ctx.downloads.length === 1, `${ctx.downloads.length} downloads`)) {
      savedBytes(p, 'download', ctx.downloads[0].data, await s.assemble(EDITED));
      p.check(ctx.downloads[0].name === name, `the download is named "${ctx.downloads[0].name}", not the opened file's name "${name}"`);
    }
    p.eq(await ed(page, 'window.__orzEditor.isDirty()'), false, 'isDirty() after a successful download');
  },

  async 'C.save.keeps-delivery'(s, p) {
    needBrowser(s);
    // closed loop 2 round 3 (B#7): a cdn-delivery file stays cdn when it is saved
    const ctx = await s.context({ picker: 'stub' });
    const url = s.writeFile(fileName(s, 'keeps-cdn'), await s.assemble(EDIT_TEXT, { delivery: 'cdn' }));
    const page = await editedPage(s, ctx, url, p);
    await ed(page, 'window.__orzEditor.save()');
    await until(() => ctx.of('write').length > 0 || ctx.downloads.length > 0, 10_000);
    const saved = firstSaved(ctx);
    if (!p.check(saved !== undefined, 'the save of a cdn-delivery file wrote nothing')) return;
    p.eq(extract(saved!)?.delivery, 'cdn', 'the delivery of the file saved from a cdn-delivery file (a save keeps the file\'s delivery)');
    savedBytes(p, 'the save of a cdn-delivery file', saved!, await s.assemble(EDITED, { delivery: 'cdn' }));
  },

  async 'C.save.keeps-includes'(s, p) {
    needBrowser(s);
    // closed loop 2 round 3: a page cannot resolve local includes again — a save carries #orz-includes over
    const file = await s.assemble(INCLUDE_TEXT, { delivery: 'inline', includes: { ...INCLUDES } });
    if (!p.check(sameIncludes(extract(file)?.includes, INCLUDES), 'assemble(text, { includes }) does not write exactly those includes in #orz-includes (FC-19 §2, FC-18 §8.3 D4)')) return;
    const ctx = await s.context({ picker: 'stub' });
    const page = await ctx.newPage();
    await openEditor(s, page, s.writeFile(fileName(s, 'keeps-includes'), file));
    const edited = `${INCLUDE_TEXT}\nEdited below the includes.\n`;
    await ed(page, `window.__orzEditor.setText(${JSON.stringify(edited)})`);
    await ed(page, 'window.__orzEditor.save()');
    await until(() => ctx.of('write').length > 0 || ctx.downloads.length > 0, 10_000);
    const saved = firstSaved(ctx);
    if (!p.check(saved !== undefined, 'the save of a file with includes wrote nothing')) return;
    const x = extract(saved!);
    p.check(x?.text === edited, `the saved file does not give back the edited text — ${firstDiff(x?.text ?? '', edited)}`);
    p.check(sameIncludes(x?.includes, INCLUDES), `the saved file lost or changed the file's #orz-includes (a save keeps the resolved includes): ${clip(JSON.stringify(x?.includes ?? null))}`);
    const expected = await s.assemble(edited, { delivery: 'inline', includes: { ...INCLUDES } });
    p.check(saved === expected, `the saved bytes are not assemble(text, { includes }) — ${firstDiff(saved!, expected)}`);
  },

  async 'C.save.copy-elsewhere'(s, p) {
    needBrowser(s);
    // real FileSystemFileHandles (origin-private file system) stored in the one IndexedDB every file: page shares
    const ctx = await s.context({ picker: 'opfs' });
    const name = fileName(s, 'copy');
    const html = await s.assemble(EDIT_TEXT, { delivery: 'inline' });
    const [urlA, urlB] = [s.writeFile(name, html), s.writeFile(name, html)]; // one name, one uid, two folders
    // The picker's folder for a page stands for the page's own folder on disk: the opened file is put
    // there with the bytes the page loaded, and what a save writes there goes back to the disk file,
    // so a reopened page loads what was saved (a handle is proved by its content, not its name).
    const saveAs = async (url: string, text: string, loaded: string | null): Promise<{ page: Page; pathname: string }> => {
      const page = await ctx.newPage();
      await openEditor(s, page, url);
      const pathname = await ed<string>(page, 'location.pathname');
      if (loaded !== null) await call(page, WRITE_OPFS, { pathname, name, data: loaded });
      await ed(page, `window.__orzEditor.setText(${JSON.stringify(text)})`);
      const before = ctx.of('picker').length;
      await ed(page, 'window.__orzEditor.save()');
      await until(async () => ctx.of('picker').length > before || !(await ed<boolean>(page, 'window.__orzEditor.isDirty()')), 10_000);
      await until(async () => !(await ed<boolean>(page, 'window.__orzEditor.isDirty()')), 5_000);
      const now = await call<string | null>(page, READ_OPFS, { pathname, name });
      if (now !== null) s.rewriteFile(url, now);
      return { page, pathname };
    };
    const read = (page: Page, pathname: string) => call<string | null>(page, READ_OPFS, { pathname, name });
    const textA = `${EDIT_TEXT}Saved in folder A.\r\n`;
    const a = await saveAs(urlA, textA, html);
    p.eq(ctx.of('picker').length, 1, 'pickers after the first save of the original');
    p.check((await read(a.page, a.pathname)) === (await s.assemble(textA)), 'the original\'s first save did not write assemble(text) to the picked file');
    const textB = `${EDIT_TEXT}Saved in the copy (folder B).\r\n`;
    const b = await saveAs(urlB, textB, html);
    p.eq(ctx.of('picker').length, 2, 'pickers after saving the same-named copy in another folder (the copy must get the picker, not the original\'s handle)');
    p.check((await read(b.page, a.pathname)) === (await s.assemble(textA)), 'saving the copy wrote over the original in another folder');
    p.check((await read(b.page, b.pathname)) === (await s.assemble(textB)), 'the copy\'s save did not write assemble(text) to its own picked file');
    const textA2 = `${EDIT_TEXT}Saved in folder A again.\r\n`;
    const a2 = await saveAs(urlA, textA2, null);
    p.eq(ctx.of('picker').length, 2, 'pickers after reopening the original (its remembered handle must be reused)');
    p.check((await read(a2.page, a.pathname)) === (await s.assemble(textA2)), 'the reopened original did not write its own file');
    p.check((await read(a2.page, b.pathname)) === (await s.assemble(textB)), 'the reopened original wrote over the copy');
  },

  async 'C.save.save-as-elsewhere'(s, p) {
    needBrowser(s);
    // closed loop 2 round 2, F2: the real picker opens in the last folder used (Downloads) with the
    // suggested name; the reader accepts it. That file is not the opened one, whatever its name.
    const ctx = await s.context({ picker: 'opfs' });
    const name = fileName(s, 'save-as');
    const html = await s.assemble(EDIT_TEXT, { delivery: 'inline' });
    const url = s.writeFile(name, html);
    const DOWNLOADS = 'orz-conformance-downloads';
    const save = async (page: Page, text: string, pickIn?: string): Promise<void> => {
      await ed(page, `window.__orzEditor.setText(${JSON.stringify(text)})`);
      if (pickIn) await ed(page, `(window.__orzConformancePickIn = { folder: ${JSON.stringify(pickIn)} }, true)`);
      const before = ctx.of('picker').length;
      await ed(page, 'window.__orzEditor.save()');
      await until(async () => ctx.of('picker').length > before || !(await ed<boolean>(page, 'window.__orzEditor.isDirty()')), 10_000);
      await until(async () => !(await ed<boolean>(page, 'window.__orzEditor.isDirty()')), 5_000);
    };
    const one = await ctx.newPage();
    await openEditor(s, one, url);
    const pathname = await ed<string>(one, 'location.pathname');
    await call(one, WRITE_OPFS, { pathname, name, data: html }); // the opened file, in its folder
    const read = (page: Page, where: { pathname?: string; folder?: string }) => call<string | null>(page, READ_OPFS, { ...where, name });
    const text1 = `${EDIT_TEXT}Session 1, saved into Downloads.\r\n`;
    await save(one, text1, DOWNLOADS);
    p.eq(ctx.of('picker').length, 1, 'pickers in the first session');
    p.check((await read(one, { folder: DOWNLOADS })) === (await s.assemble(text1)), 'the first save did not write assemble(text) to the file the reader chose in Downloads');
    p.check((await read(one, { pathname })) === html, 'the first save wrote the opened file although the reader chose the Downloads file');
    await one.close();
    // the reader reopens the original (it still holds the opened text), edits and saves
    const two = await ctx.newPage();
    await openEditor(s, two, url);
    const text2 = `${EDIT_TEXT}Session 2, in the original folder.\r\n`;
    await save(two, text2);
    p.eq(ctx.of('picker').length, 2, 'pickers after reopening the original (its save must ask: the remembered handle points at the Downloads file, which is not the opened file — a name proves nothing)');
    p.check((await read(two, { folder: DOWNLOADS })) === (await s.assemble(text1)), 'reopening the original and saving overwrote the Downloads file the reader chose in the first session');
    p.check((await read(two, { pathname })) === (await s.assemble(text2)), 'the reopened original did not write assemble(text) to its own file when the reader chose it');
    p.eq(ctx.downloads.length, 0, 'downloads');
  },
};

// ── update ───────────────────────────────────────────────────────────────

const chipName = (version: string): RegExp => new RegExp(`^Update available: ${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

function needNext(s: Session): Release {
  needBrowser(s);
  if (!s.releases.next) throw new Skip('no `next` release given (a build of this carrier with a higher version)');
  return s.releases.next;
}

/** Click the chip and Update now; wait until something was saved or the update settled (refused). */
async function runUpdate(page: Page, ctx: CheckContext, version: string): Promise<'saved' | 'settled' | 'stuck'> {
  await page.getByRole('button', { name: chipName(version) }).click();
  await page.getByRole('button', { name: 'Update now' }).click();
  const t0 = Date.now();
  let result = 'stuck' as 'saved' | 'settled' | 'stuck';
  await until(async () => {
    if (ctx.of('write').length > 0 || ctx.downloads.length > 0) { result = 'saved'; return true; }
    if (Date.now() - t0 < 400) return false;
    const busy = await page.getByRole('button', { name: 'Updating…' }).count();
    if (busy === 0) { result = 'settled'; return true; }
    return false;
  }, 60_000, 100);
  if (result === 'settled') {
    await new Promise((r) => setTimeout(r, 500));
    if (ctx.of('write').length > 0 || ctx.downloads.length > 0) result = 'saved';
  }
  return result;
}

const firstSaved = (ctx: CheckContext): string | undefined => (ctx.of('write')[0]?.data as { data: string } | undefined)?.data ?? ctx.downloads[0]?.data;

export const updateChecks: Record<string, CheckFn> = {
  async 'C.update.indicator'(s, p) {
    const next = needNext(s);
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const ctx = await s.context({ picker: 'stub', cdn: { latest: next, hold } });
    const page = await ctx.newPage();
    const url = s.writeFile(fileName(s, 'indicator'), await s.assemble(EDIT_TEXT, { delivery: 'inline' }));
    try {
      await page.goto(url);
      await page.waitForTimeout(300);
      await page.evaluate(PAGE_HELPERS);
      const before = await call<{ island: unknown; title: string; modal: number }>(page, `function () {
        var input = document.createElement('input');
        input.id = 'orz-conformance-focus';
        input.setAttribute('aria-label', 'conformance focus');
        document.body.appendChild(input);
        input.focus();
        window.__orzMut = { added: [], removed: 0, attrs: [] };
        new MutationObserver(function (rs) {
          rs.forEach(function (r) {
            if (r.type === 'childList') { r.addedNodes.forEach(function (n) { window.__orzMut.added.push(n); }); window.__orzMut.removed += r.removedNodes.length; }
            else window.__orzMut.attrs.push(r.attributeName + ' on ' + (r.target.id || r.target.nodeName));
          });
        }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['inert', 'aria-hidden', 'hidden'] });
        return { island: window.__orzC.islandRaw(), title: document.title, modal: window.__orzC.modal() };
      }`);
      release();
      const chip = page.getByRole('button', { name: chipName(next.version) });
      const shown = await until(async () => (await chip.count()) > 0 && (await chip.first().isVisible()), 20_000);
      if (!p.check(shown, `no "Update available: ${next.version}" indicator appeared within 20 s`)) return;
      await page.waitForTimeout(600);
      const after = await call<{ active: string; island: unknown; title: string; modal: number; extra: string[]; removed: number; attrs: string[] }>(page, `function () {
        var a = document.activeElement;
        var isChipHost = function (n) {
          if (n.nodeType === 3) return !n.data.trim();
          var hosts = [n].concat(n.querySelectorAll ? [].slice.call(n.querySelectorAll('*')) : []);
          return hosts.some(function (h) { return h.shadowRoot && window.__orzC.deepAll(h.shadowRoot, 'button').some(function (b) { return /^Update available/.test(b.getAttribute('aria-label') || b.textContent || ''); }); })
            || (n.querySelectorAll && [].slice.call(n.querySelectorAll('button')).some(function (b) { return /^Update available/.test(b.getAttribute('aria-label') || b.textContent || ''); }));
        };
        return {
          active: a ? (a.id || a.nodeName) + (a.shadowRoot && a.shadowRoot.activeElement ? ' > ' + a.shadowRoot.activeElement.nodeName : '') : 'none',
          island: window.__orzC.islandRaw(), title: document.title, modal: window.__orzC.modal(),
          extra: window.__orzMut.added.filter(function (n) { return !isChipHost(n); }).map(function (n) { return n.nodeName; }),
          removed: window.__orzMut.removed, attrs: window.__orzMut.attrs,
        };
      }`);
      p.eq(after.active, 'orz-conformance-focus', 'the focused element after the indicator appeared (focus must not move)');
      p.eq(after.island, before.island, 'the source island');
      p.eq(after.title, before.title, 'the page title');
      p.eq(after.modal, before.modal, 'modal dialogs / inert elements');
      p.eq(after.extra, [], 'nodes added to the page besides the indicator');
      p.eq(after.removed, 0, 'nodes removed from the page');
      p.eq(after.attrs, [], 'inert / aria-hidden / hidden changes in the page');
      p.eq(ctx.of('dialog').map((r) => r.data), [], 'dialogs (alert, confirm, prompt, showModal)');
      p.eq(ctx.requests.filter((u) => u.endsWith('/release.json')).length, 1, 'manifest requests');
      p.eq(ctx.requests.filter((u) => s.isBundleRequest(u)).length, 0, 'bundle requests before the reader asked for the update');
    } finally {
      release();
    }
  },

  async 'C.update.reassemble'(s, p) {
    const next = needNext(s);
    const [expected] = await s.chromeAssemble(next, [EDIT_TEXT], 'inline');
    const ctx = await s.context({ picker: 'stub', cdn: { latest: next } });
    const page = await ctx.newPage();
    let loads = 0;
    page.on('load', () => { loads++; });
    await page.goto(s.writeFile(fileName(s, 'update'), await s.assemble(EDIT_TEXT, { delivery: 'inline' })));
    if (!p.check(await until(async () => (await page.getByRole('button', { name: chipName(next.version) }).count()) > 0, 20_000), 'no update indicator')) return;
    const r = await runUpdate(page, ctx, next.version);
    if (!p.check(r === 'saved', `Update now saved nothing (${r})`)) return;
    const saved = firstSaved(ctx)!;
    const x = extract(saved);
    p.check(x?.text === EDIT_TEXT, `the updated file does not give back the exact text — ${firstDiff(x?.text ?? '', EDIT_TEXT)}`);
    p.eq(x && [x.kind, x.shell, x.delivery], [s.target.kind, next.version, 'inline'], 'the updated file\'s kind, shell, delivery');
    p.check(saved === expected, `the updated file is not the new release's assemble(text) — ${firstDiff(saved, expected)}`);
    await page.waitForTimeout(1_000);
    p.eq([ctx.of('write').length, ctx.downloads.length], [1, 0], 'writes and downloads of the update (the picker is available: the file is written in place, once — not handed out as a downloaded copy)');
    // the harness's picker made a new file: nothing proved it to be the opened file, so the page must not reload (spec/shell-runtime.md §7.2)
    p.eq(loads, 1, 'page loads after an update written to a picked file not proved to be the opened one (the page must not reload)');
    p.eq(ctx.of('dialog').length, 0, 'dialogs during the update');
  },

  async 'C.update.edit-during'(s, p) {
    const next = needNext(s);
    let release!: () => void;
    const holdBundle = new Promise<void>((r) => { release = r; });
    const ctx = await s.context({ picker: 'stub', cdn: { latest: next, holdBundle } });
    const page = await ctx.newPage();
    const url = s.writeFile(fileName(s, 'edit-during'), await s.assemble(EDIT_TEXT, { delivery: 'inline' }));
    let loads = 0;
    page.on('load', () => { loads++; });
    try {
      await openEditor(s, page, url);
      await ed(page, '(window.__orzConformanceAlive = 1)');
      const chip = page.getByRole('button', { name: chipName(next.version) });
      if (!p.check(await until(async () => (await chip.count()) > 0, 20_000), 'no update indicator')) return;
      await chip.click();
      await page.getByRole('button', { name: 'Update now' }).click();
      // the new release is downloading (held): the reader edits
      const asked = await until(() => ctx.requests.some((u) => u.includes(`@${next.version}/`)), 15_000);
      if (!p.check(asked, 'Update now did not request the new release\'s bundle')) return;
      const edited = `${EDIT_TEXT}Typed while the update downloads.\r\n`;
      await ed(page, `window.__orzEditor.setText(${JSON.stringify(edited)})`);
      const accepted = (await ed<string>(page, 'window.__orzEditor.getText()')) === edited;
      release();
      const t0 = Date.now();
      await until(async () => Date.now() - t0 > 400 && (await page.getByRole('button', { name: 'Updating…' }).count()) === 0, 60_000, 100);
      await page.waitForTimeout(800);
      p.eq(loads, 1, 'page loads (the update must not reload the page)');
      p.eq(await ed(page, 'window.__orzConformanceAlive'), 1, 'the page state after the update (it was reloaded)');
      if (accepted) {
        // the edit went in: the update, which read the text before, must not save the old one
        p.eq(ctx.of('write').length + ctx.downloads.length, 0, 'files written or downloaded by an update that read the text before the edit');
        p.check((await ed<string>(page, 'window.__orzEditor.getText()')) === edited, 'the edit made while the update ran is not in the editor any more');
        const shown = await ed<number>(page, 'window.__orzC.deepAll(document, "[aria-live]").filter(function (n) { return n.textContent.trim() && !n.hidden; }).length');
        p.check(shown > 0, 'the refused update (the text changed while it ran) is not announced (aria-live)');
      } else {
        // the carrier kept the editor read-only while updating: the update may save, and then exactly the text the editor holds
        const saved = firstSaved(ctx);
        p.check(saved === undefined || extract(saved)?.text === (await ed<string>(page, 'window.__orzEditor.getText()')), 'the update saved a text other than the editor\'s');
      }
      // once the update settled the reader can type again (a carrier that makes the editor read-only while updating gives it back)
      if (loads === 1) {
        const before = await ed<string>(page, 'window.__orzEditor.getText()');
        await ed(page, 'window.__orzEditor.focus()');
        await page.keyboard.press('ControlOrMeta+End');
        await page.keyboard.type('Zq9');
        await page.waitForTimeout(200);
        const after = await ed<string>(page, 'window.__orzEditor.getText()');
        p.check(after !== before && after.includes('Zq9'), 'typing after the update settled changed nothing (the editor was left read-only)');
      }
      p.eq(ctx.of('dialog').length, 0, 'dialogs');
    } finally {
      release();
    }
  },

  async 'C.update.other-format'(s, p) {
    const next = needNext(s);
    const other = s.derive(next, { formats: [987] });
    const ctx = await s.context({ picker: 'stub', cdn: { latest: other } });
    const page = await ctx.newPage();
    await page.goto(s.writeFile(fileName(s, 'other-format'), await s.assemble(EDIT_TEXT, { delivery: 'inline' })));
    p.check(await until(() => ctx.requests.some((u) => u.endsWith('/release.json')), 10_000), 'the file never asked for release.json');
    await page.waitForTimeout(2_000);
    p.eq(await page.getByRole('button', { name: /^Update available/ }).count(), 0, `update indicators for ${other.version}, whose formats [987] do not include the file's format 1`);
    p.eq(ctx.requests.filter((u) => s.isBundleRequest(u)), [], 'bundle requests');
  },

  async 'C.update.tampered'(s, p) {
    const next = needNext(s);
    const ctx = await s.context({ picker: 'stub', cdn: { latest: next, tamper: true } });
    const page = await ctx.newPage();
    await page.goto(s.writeFile(fileName(s, 'tampered'), await s.assemble(EDIT_TEXT, { delivery: 'inline' })));
    await page.evaluate(PAGE_HELPERS);
    const island = await ed(page, 'window.__orzC.islandRaw()');
    if (!p.check(await until(async () => (await page.getByRole('button', { name: chipName(next.version) }).count()) > 0, 20_000), 'no update indicator')) return;
    const r = await runUpdate(page, ctx, next.version);
    p.check(r !== 'saved', 'a bundle that does not match its integrity was accepted: the file was written or downloaded');
    p.check(r !== 'stuck', 'the update did not settle within 60 s');
    if (r === 'settled') {
      p.eq(await ed(page, 'window.__orzC.islandRaw()'), island, 'the source island after the refusal');
      const shown = await ed<number>(page, 'window.__orzC.deepAll(document, "[aria-live]").filter(function (n) { return n.textContent.trim() && !n.hidden; }).length');
      p.check(shown > 0, 'the refusal is not announced in the popover (aria-live)');
    }
    p.eq(ctx.of('dialog').length, 0, 'dialogs');
  },

  async 'C.update.offline'(s, p) {
    needBrowser(s);
    const ctx = await s.context({ picker: 'stub' });
    const page = await ctx.newPage();
    await page.goto(s.writeFile(fileName(s, 'offline'), await s.assemble(EDIT_TEXT, { delivery: 'inline' })));
    await until(() => ctx.requests.some((u) => u.endsWith('/release.json')), 5_000);
    await page.waitForTimeout(1_500);
    p.eq(await page.getByRole('button', { name: /^Update available/ }).count(), 0, 'update indicators while offline');
    p.eq(ctx.of('dialog').length, 0, 'dialogs');
    p.eq(ctx.of('pageerror').map((r) => r.data), [], 'uncaught errors');
    // the browser itself logs the failed request ("Failed to load resource: net::…"); anything else is the file's
    p.eq(ctx.of('console-error').map((r) => String(r.data)).filter((m) => !/^Failed to load resource\b/.test(m)), [], 'console errors');
    p.eq(ctx.of('write').length + ctx.downloads.length, 0, 'files written');
    await page.evaluate(PAGE_HELPERS);
    p.eq(await ed(page, 'window.__orzC.modal()'), 0, 'modal dialogs / inert elements');
  },

  async 'C.update.from-previous'(s, p) {
    const prev = s.releases.previous;
    if (!prev && s.target.firstRelease) throw new NotApplicable('the target declares firstRelease: there is no previous release to update from');
    if (!prev) throw new Skip('no `previous` release given (a first release declares firstRelease: true)');
    needBrowser(s);
    const [old] = await s.chromeAssemble(prev, [EDIT_TEXT], 'inline');
    const ctx = await s.context({ picker: 'stub', cdn: { latest: s.releases.target } });
    const page = await ctx.newPage();
    await page.goto(s.writeFile(fileName(s, 'previous'), old));
    if (!p.check(await until(async () => (await page.getByRole('button', { name: chipName(s.target.version) }).count()) > 0, 20_000), `the previous release (${prev.version}) shows no indicator for ${s.target.version}`)) return;
    const r = await runUpdate(page, ctx, s.target.version);
    if (!p.check(r === 'saved', `Update now saved nothing (${r})`)) return;
    const saved = firstSaved(ctx)!;
    const expected = await s.assemble(EDIT_TEXT, { delivery: 'inline', engineSource: s.releases.target.code });
    p.check(saved === expected, `the updated file is not this release's assemble(text) — ${firstDiff(saved, expected)}`);
    // the updated file works (FC-19 §6): it opens, edits and saves this release's assembly of the edit
    const writes = ctx.of('write').length;
    const opened = await ctx.newPage();
    let read = '';
    try { read = await openEditor(s, opened, s.writeFile(fileName(s, 'previous-updated'), saved)); } catch (e) { p.fail(`the updated file does not open its editor: ${msg(e)}`); return; }
    p.check(read === EDIT_TEXT, `the updated file does not give back its text — ${firstDiff(read, EDIT_TEXT)}`);
    const edited = `${EDIT_TEXT}Edited after the update.\r\n`;
    await ed(opened, `window.__orzEditor.setText(${JSON.stringify(edited)})`);
    await ed(opened, 'window.__orzEditor.save()');
    await until(() => ctx.of('write').length > writes || ctx.downloads.length > 0, 10_000);
    const again = (ctx.of('write')[writes]?.data as { data: string } | undefined)?.data;
    p.check(again === (await s.assemble(edited)), `the updated file's save did not write this release's assemble(text) — ${firstDiff(again ?? '', await s.assemble(edited))}`);
  },

  async 'C.update.resigned'(s, p) {
    const next = needNext(s);
    const cases: Array<[string, Release]> = [
      ['a re-signed `next` whose assemble alters the text', s.derive(next, { append: ALTER_TEXT })],
      ['a release whose manifest names a version its bundle does not write', s.derive(next, { version: bumpPatch(next.version) })],
    ];
    for (const [what, rel] of cases) {
      const ctx = await s.context({ picker: 'stub', cdn: { latest: rel } });
      const page = await ctx.newPage();
      await page.goto(s.writeFile(fileName(s, 'resigned'), await s.assemble(EDIT_TEXT, { delivery: 'inline' })));
      await page.evaluate(PAGE_HELPERS);
      const island = await ed(page, 'window.__orzC.islandRaw()');
      if (!p.check(await until(async () => (await page.getByRole('button', { name: chipName(rel.version) }).count()) > 0, 20_000), `${what}: no update indicator for ${rel.version}`)) continue;
      const r = await runUpdate(page, ctx, rel.version);
      p.check(r !== 'saved', `${what} was accepted: the file was written or downloaded`);
      p.check(r !== 'stuck', `${what}: the update did not settle within 60 s`);
      if (r === 'settled') {
        p.eq(await ed(page, 'window.__orzC.islandRaw()'), island, `${what}: the source island after the refusal`);
        const shown = await ed<number>(page, 'window.__orzC.deepAll(document, "[aria-live]").filter(function (n) { return n.textContent.trim() && !n.hidden; }).length');
        p.check(shown > 0, `${what}: the refusal is not announced (aria-live)`);
      }
      p.eq(ctx.of('dialog').length, 0, `${what}: dialogs`);
      await ctx.context.close();
    }
  },

  async 'C.update.prerelease'(s, p) {
    const next = needNext(s);
    const pre = s.derive(next, { version: `${next.version.replace(/-.*$/, '')}-rc.1` });
    const ctx = await s.context({ picker: 'stub', cdn: { latest: pre } });
    const page = await ctx.newPage();
    await page.goto(s.writeFile(fileName(s, 'prerelease'), await s.assemble(EDIT_TEXT, { delivery: 'inline' })));
    p.check(await until(() => ctx.requests.some((u) => u.endsWith('/release.json')), 10_000), 'the file never asked for release.json');
    await page.waitForTimeout(2_000);
    p.eq(await page.getByRole('button', { name: /^Update available/ }).count(), 0, `update indicators for the prerelease ${pre.version} (never offered)`);
    p.eq(ctx.requests.filter((u) => s.isBundleRequest(u)), [], 'bundle requests');
  },

  async 'C.update.once-a-day'(s, p) {
    const next = needNext(s);
    const ctx = await s.context({ picker: 'stub', cdn: { latest: next } });
    const html = await s.assemble(EDIT_TEXT, { delivery: 'inline' });
    const chip = (page: Page) => until(async () => (await page.getByRole('button', { name: chipName(next.version) }).count()) > 0, 20_000);
    const page = await ctx.newPage();
    await page.goto(s.writeFile(fileName(s, 'daily'), html));
    if (!p.check(await chip(page), 'no update indicator on the first open')) return;
    await ctx.leave(page, () => page.reload()); // a clean page: a beforeunload it raised would be accepted, and fails "dialogs" below
    p.check(await chip(page), 'no update indicator after a reload (the stored manifest offers it again the same day)');
    const other = await ctx.newPage();
    await other.goto(s.writeFile(fileName(s, 'daily-other'), await s.assemble(OTHER_TEXT, { delivery: 'inline' })));
    p.check(await chip(other), 'no update indicator in a second file of the kind');
    await page.waitForTimeout(500);
    p.eq(ctx.requests.filter((u) => u.endsWith('/release.json')).length, 1, 'manifest requests for one open, one reload and a second file on the same day (at most one per kind per day)');
    p.eq(ctx.of('dialog').map((r) => r.data), [], 'dialogs (a clean file asks nothing when it is reloaded)');
  },

  async 'C.update.hosted'(s, p) {
    const next = needNext(s);
    const ctx = await s.context({ picker: 'stub', cdn: { latest: next } });
    const h = await hostPage(s, ctx, fileName(s, 'hosted-update'), { save: true, ai: false, include: false, ack: true });
    if (!p.check(await until(async () => !!(await h.state()).readies.save, 20_000), 'no orz-host-ready within 20 s')) return;
    const f = await h.frame();
    await f.waitForTimeout(2_500);
    p.eq(ctx.requests.filter((u) => u.endsWith('/release.json')).length, 0, 'manifest requests from a file in an app host\'s frame (the app owns the version)');
    p.eq(await f.getByRole('button', { name: /^Update available/ }).count(), 0, 'update indicators in an app host\'s frame');
  },

  async 'C.update.cdn-delivery'(s, p) {
    const next = needNext(s);
    const [expected] = await s.chromeAssemble(next, [EDIT_TEXT], 'cdn');
    const ctx = await s.context({ picker: 'stub', cdn: { latest: next } });
    const page = await ctx.newPage();
    await page.goto(s.writeFile(fileName(s, 'cdn-update'), await s.assemble(EDIT_TEXT, { delivery: 'cdn' })));
    if (!p.check(await until(async () => (await page.getByRole('button', { name: chipName(next.version) }).count()) > 0, 20_000), 'a cdn-delivery file shows no update indicator')) return;
    const r = await runUpdate(page, ctx, next.version);
    if (!p.check(r === 'saved', `Update now saved nothing (${r})`)) return;
    const saved = firstSaved(ctx)!;
    const x = extract(saved);
    p.eq(x && [x.text === EDIT_TEXT, x.shell, x.delivery], [true, next.version, 'cdn'], 'the updated file\'s text exact, shell, delivery (a cdn file stays cdn, FC-18 §8.2)');
    p.check(saved === expected, `the updated file is not the new release's assemble(text, { delivery: 'cdn' }) — ${firstDiff(saved, expected)}`);
    await page.waitForTimeout(500);
    p.eq([ctx.of('write').length, ctx.downloads.length], [1, 0], 'writes and downloads of the update (written in place, once)');
  },

  async 'C.update.keeps-includes'(s, p) {
    const next = needNext(s);
    // closed loop 2 round 3: the page cannot resolve the file's local includes again — the update carries #orz-includes over
    const file = await s.assemble(INCLUDE_TEXT, { delivery: 'inline', includes: { ...INCLUDES } });
    if (!p.check(sameIncludes(extract(file)?.includes, INCLUDES), 'assemble(text, { includes }) does not write exactly those includes in #orz-includes (FC-19 §2, FC-18 §8.3 D4)')) return;
    const [expected] = await s.chromeAssemble(next, [INCLUDE_TEXT], 'inline', false, { ...INCLUDES });
    const ctx = await s.context({ picker: 'stub', cdn: { latest: next } });
    const page = await ctx.newPage();
    await page.goto(s.writeFile(fileName(s, 'update-includes'), file));
    if (!p.check(await until(async () => (await page.getByRole('button', { name: chipName(next.version) }).count()) > 0, 20_000), 'a file with includes shows no update indicator')) return;
    const r = await runUpdate(page, ctx, next.version);
    if (!p.check(r === 'saved', `Update now saved nothing (${r})`)) return;
    const saved = firstSaved(ctx)!;
    const x = extract(saved);
    p.eq(x && [x.text === INCLUDE_TEXT, x.shell], [true, next.version], 'the updated file\'s text exact, shell');
    p.check(sameIncludes(x?.includes, INCLUDES), `the updated file lost or changed the file's #orz-includes (the update keeps the resolved includes): ${clip(JSON.stringify(x?.includes ?? null))}`);
    p.check(saved === expected, `the updated file is not the new release's assemble(text, { includes }) — ${firstDiff(saved, expected)}`);
  },
};

/** Appended to a release's bundle: its `assemble` alters the text (then the release is re-signed). Script-safe, no CR. */
const ALTER_TEXT = `
;(function () {
  var C = globalThis.OrzCarrier;
  if (!C || typeof C.assemble !== 'function') return;
  var a = C.assemble;
  var altered = function (t, o) { return a.call(C, String(t) + '\\n[altered by a re-signed release]\\n', o); };
  try { C.assemble = altered; } catch (e) {}
  if (C.assemble !== altered) { try { globalThis.OrzCarrier = Object.assign({}, C, { assemble: altered }); } catch (e) {} }
})();
`;

/** `x.y.z` → `x.y.(z+1)` (prerelease dropped). */
function bumpPatch(v: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  return m ? `${m[1]}.${m[2]}.${BigInt(m[3]) + 1n}` : v;
}

// ── host protocols ───────────────────────────────────────────────────────

interface HostState { readies: Record<string, Record<string, unknown>>; msgs: Array<Record<string, unknown>>; acked: number }

async function hostPage(s: Session, ctx: CheckContext, name: string, cfg: { save: boolean; ai: boolean; include: boolean; ack: boolean }): Promise<{ page: Page; frame: () => Promise<Frame>; state: () => Promise<HostState> }> {
  const src = s.serve(name, await s.assemble(EDIT_TEXT, { delivery: 'inline' }));
  const page = await ctx.newPage();
  await page.goto(`${s.hostOrigin}/host.html`);
  await call(page, 'function (a) { return window.__host.start(a.src, a.origin, a.cfg); }', { src, origin: s.fileOrigin, cfg });
  const frame = async (): Promise<Frame> => {
    let f: Frame | undefined;
    await until(() => !!(f = page.frames().find((x) => x.url().startsWith(src))), 15_000);
    if (!f) throw new Error('the embedded file did not load');
    await f.waitForLoadState('load');
    return f;
  };
  const state = (): Promise<HostState> => page.evaluate('window.__hostState') as Promise<HostState>;
  return { page, frame, state };
}

const orzMsgs = (st: HostState) => st.msgs.filter((m) => typeof m.type === 'string' && (m.type as string).startsWith('orz-'));

export const hostChecks: Record<string, CheckFn> = {
  async 'C.host.save'(s, p) {
    needBrowser(s);
    const ctx = await s.context({ picker: 'stub' });
    const h = await hostPage(s, ctx, fileName(s, 'hosted'), { save: true, ai: false, include: false, ack: true });
    if (!p.check(await until(async () => !!(await h.state()).readies.save, 20_000), 'no orz-host-ready within 20 s')) return;
    const ready = (await h.state()).readies.save;
    p.eq({ type: ready.type, protocol: ready.protocol, version: ready.version, kind: ready.kind }, { type: 'orz-host-ready', protocol: 'orz-host-save', version: 1, kind: s.target.kind }, 'orz-host-ready');
    const f = await h.frame();
    await openEditor(s, f);
    await ed(f, `window.__orzEditor.setText(${JSON.stringify(EDITED)})`);
    await ed(f, `window.__orzC.marker(${JSON.stringify(LIVE_DOM_MARKER)})`);
    p.check(await until(async () => (await h.state()).msgs.some((m) => m.type === 'orz-host-dirty' && m.dirty === true), 5_000), 'no orz-host-dirty { dirty: true } after an edit');
    await ed(f, 'window.__orzEditor.save()');
    const st = await h.state();
    const saves = st.msgs.filter((m) => m.type === 'orz-host-save');
    if (p.check(saves.length === 1, `${saves.length} orz-host-save messages`)) {
      const m = saves[0];
      p.eq([m.protocol, m.version], ['orz-host-save', 1], 'orz-host-save protocol, version');
      p.check(m.source === EDITED, `source is not the exact text — ${firstDiff(String(m.source), EDITED)}`);
      p.check(typeof m.html === 'string' && !(m.html as string).includes(LIVE_DOM_MARKER), 'html holds the live DOM');
      p.check(m.html === (await s.assemble(EDITED)), `html is not assemble(source) — ${firstDiff(String(m.html), await s.assemble(EDITED))}`);
    }
    p.eq(ctx.of('picker').length + ctx.of('write').length + ctx.downloads.length, 0, 'pickers, writes and downloads (the connected host comes first)');
    p.eq(await ed<number>(f, 'window.__orzC.deepAll(document, "#orz-served-note").length'), 0, 'served-page notices in a file whose host saves it');
    p.eq(await ed(f, 'window.__orzEditor.isDirty()'), false, 'isDirty() after the host acknowledged');
    p.check(await until(async () => { const m = (await h.state()).msgs.filter((x) => x.type === 'orz-host-dirty'); return m.length > 0 && m[m.length - 1].dirty === false; }, 5_000), 'the clean state was not reported (orz-host-dirty { dirty: false })');
  },

  async 'C.host.ai'(s, p) {
    needBrowser(s);
    const offered = s.target.protocols?.ai !== false;
    const ctx = await s.context({ picker: 'stub' });
    const h = await hostPage(s, ctx, fileName(s, 'ai'), { save: false, ai: true, include: false, ack: false });
    const answered = await until(async () => !!(await h.state()).readies.ai, offered ? 20_000 : 3_000);
    if (offered) {
      if (p.check(answered, 'no orz-host-ai-ready within 20 s (the target declares AI)')) {
        const r = (await h.state()).readies.ai;
        p.eq({ type: r.type, protocol: r.protocol, version: r.version }, { type: 'orz-host-ai-ready', protocol: 'orz-host-ai', version: 1 }, 'orz-host-ai-ready');
      }
    } else p.check(!answered, 'the file answered an AI hello although the target declines AI');
    p.eq(orzMsgs(await h.state()).filter((m) => m.type !== 'orz-host-ai-ready').map((m) => m.type), [], 'other messages from the file');
  },

  async 'C.host.include'(s, p) {
    needBrowser(s);
    const offered = s.target.protocols?.include !== false;
    const ctx = await s.context({ picker: 'stub' });
    const h = await hostPage(s, ctx, fileName(s, 'include'), { save: false, ai: false, include: true, ack: false });
    const answered = await until(async () => !!(await h.state()).readies.include, offered ? 20_000 : 3_000);
    if (offered) {
      if (p.check(answered, 'no orz-host-include-ready within 20 s (the target declares includes)')) {
        const r = (await h.state()).readies.include;
        p.eq({ type: r.type, protocol: r.protocol, version: r.version, kind: r.kind }, { type: 'orz-host-include-ready', protocol: 'orz-host-include', version: 1, kind: s.target.kind }, 'orz-host-include-ready');
      }
    } else p.check(!answered, 'the file answered an include hello although the target declines includes');
    p.eq(orzMsgs(await h.state()).filter((m) => m.type !== 'orz-host-include-ready').map((m) => m.type), [], 'other messages from the file');
  },

  async 'C.host.silent'(s, p) {
    needBrowser(s);
    // a newer release is advertised: a framed file never checks, even when its parent stays silent
    const ctx = await s.context({ picker: 'stub', cdn: { latest: s.releases.next ?? s.releases.target } });
    const h = await hostPage(s, ctx, fileName(s, 'silent'), { save: false, ai: false, include: false, ack: false });
    const f = await h.frame();
    const loaded = Date.now();
    await openEditor(s, f);
    await ed(f, `window.__orzEditor.setText(${JSON.stringify(EDITED)})`);
    const t0 = Date.now();
    await ed(f, 'window.__orzEditor.save()');
    p.check(Date.now() - t0 < 5_000, 'save() took more than 5 s without a host');
    await f.waitForTimeout(400);
    p.eq(orzMsgs(await h.state()).map((m) => m.type), [], 'messages posted to a host that never said hello');
    p.check((await ed<number>(f, 'window.__orzC.deepAll(document, "#orz-served-note").length')) > 0, 'the served-page notice did not appear (the standalone save of a served file)');
    p.eq(await ed(f, 'window.__orzEditor.isDirty()'), true, 'isDirty() (nothing was saved)');
    await f.waitForTimeout(Math.max(0, 3_500 - (Date.now() - loaded)));
    p.eq(ctx.requests.filter((u) => u.endsWith('/release.json')).length, 0, 'manifest requests from a framed file whose parent never said hello (it must not decide it is standalone)');
    p.eq(await f.getByRole('button', { name: /^Update available/ }).count(), 0, 'update indicators in a framed file');
  },

  async 'C.host.no-ack'(s, p) {
    needBrowser(s);
    const ctx = await s.context({ picker: 'stub' });
    const h = await hostPage(s, ctx, fileName(s, 'no-ack'), { save: true, ai: false, include: false, ack: false });
    if (!p.check(await until(async () => !!(await h.state()).readies.save, 20_000), 'no orz-host-ready within 20 s')) return;
    const f = await h.frame();
    await openEditor(s, f);
    await ed(f, `window.__orzEditor.setText(${JSON.stringify(EDITED)})`);
    const t0 = Date.now();
    await ed(f, 'window.__orzEditor.save()');
    const ms = Date.now() - t0;
    p.check(ms >= 9_000 && ms < 30_000, `the unacknowledged save settled after ${ms} ms (spec: 10 s)`);
    p.eq(await ed(f, 'window.__orzEditor.isDirty()'), true, 'isDirty() after an unacknowledged save');
    p.eq((await h.state()).msgs.filter((m) => m.type === 'orz-host-save').length, 1, 'saves sent to the host');
    p.eq(ctx.of('picker').length + ctx.of('write').length + ctx.downloads.length, 0, 'fallback pickers, writes or downloads (the host owns persistence)');
    p.eq(await ed<number>(f, 'window.__orzC.deepAll(document, "#orz-served-note").length'), 0, 'the served-page notice after an unacknowledged host save (no standalone fallback)');
  },

  async 'C.host.foreign-hello'(s, p) {
    needBrowser(s);
    const ctx = await s.context({ picker: 'stub' });
    const h = await hostPage(s, ctx, fileName(s, 'foreign'), { save: false, ai: false, include: false, ack: false });
    const f = await h.frame();
    const HELLOS = JSON.stringify([
      { type: 'orz-host-hello', protocol: 'orz-host-save', version: 1 },
      { type: 'orz-host-ai-hello', protocol: 'orz-host-ai', version: 1, operations: [{ id: 'x', title: 'X' }] },
      { type: 'orz-host-include-hello', protocol: 'orz-host-include', version: 1 },
    ]);
    // a sibling frame (the host page's origin) and the file's own window say hello; only window.parent may
    await call(h.page, `function () {
      var sib = document.createElement('iframe');
      sib.srcdoc = '<!doctype html><meta charset="utf-8"><script>var F = parent.frames[0], n = 0; var t = setInterval(function () { ${HELLOS}.forEach(function (m) { F.postMessage(m, "*"); }); if (++n > 15) clearInterval(t); }, 200);<' + '/script>';
      document.body.appendChild(sib);
      return true;
    }`);
    await call(f, `function () { ${HELLOS}.forEach(function (m) { window.postMessage(m, '*'); }); return true; }`);
    await f.waitForTimeout(3_500);
    p.eq(orzMsgs(await h.state()).map((m) => m.type), [], 'messages the file posted to its parent after hellos from a sibling frame and from itself');
    await openEditor(s, f);
    await ed(f, `window.__orzEditor.setText(${JSON.stringify(EDITED)})`);
    await ed(f, 'window.__orzEditor.save()');
    await f.waitForTimeout(400);
    p.eq((await h.state()).msgs.filter((m) => m.type === 'orz-host-save').length, 0, 'saves sent to the parent (no hello came from it)');
    p.check((await ed<number>(f, 'window.__orzC.deepAll(document, "#orz-served-note").length')) > 0, 'the save is not the standalone one (served-page notice)');
  },
};

// ── reader preferences ───────────────────────────────────────────────────

export const prefChecks: Record<string, CheckFn> = {
  async 'C.prefs.local'(s, p) {
    needBrowser(s);
    const ctx = await s.context({ picker: 'stub' });
    const urlA = s.serve(fileName(s, 'prefs-a'), await s.assemble(EDIT_TEXT, { delivery: 'inline' }));
    const urlB = s.serve(fileName(s, 'prefs-b'), await s.assemble(OTHER_TEXT, { delivery: 'inline' }));
    const page = await ctx.newPage();
    await openEditor(s, page, urlA);
    await ed(page, 'window.__orzEditor.setMode("preview")');
    if (await ed<boolean>(page, 'typeof window.__orzEditor.setSplitRatio === "function"')) await ed(page, 'window.__orzEditor.setSplitRatio(0.3)');
    const keys = await ed<string[]>(page, 'Object.keys(localStorage)');
    // the only keys a mount and a view change may add (the context starts empty): the document's own namespace, and the update's
    p.eq(keys.filter((k) => !k.startsWith(`orz-pref:${UID_A}:`) && !k.startsWith('orz-update')), [], 'storage keys outside orz-pref:<uid>: (a view mode kept in one global key would follow the reader into every document)');
    const mine = keys.filter((k) => k.includes(UID_A));
    p.check(mine.length > 0, `no reader preference stored under the uid (keys: ${clip(JSON.stringify(keys))})`);
    p.eq(mine.filter((k) => !k.startsWith(`orz-pref:${UID_A}:`)), [], 'uid keys outside the orz-pref:<uid>: namespace');
    p.eq(keys.filter((k) => k.startsWith('orz-pref:_:')), [], 'preferences of a document with a uid written to the shared orz-pref:_: namespace');
    p.check((await ed<string>(page, 'window.__orzEditor.getText()')) === EDIT_TEXT, 'a preference changed the text');
    p.eq(await ed(page, 'window.__orzEditor.isDirty()'), false, 'isDirty() after preference changes');
    p.eq(await ed(page, 'window.__orzC.fileText() === ' + JSON.stringify(EDIT_TEXT)), true, 'the file\'s island after preference changes');
    const hasMode = await ed<boolean>(page, 'typeof window.__orzEditor.getMode === "function"');
    const other = await ctx.newPage();
    await openEditor(s, other, urlB);
    if (hasMode) p.check((await ed<string>(other, 'window.__orzEditor.getMode()')) !== 'preview', 'another document (another uid) inherited the view mode');
    const again = await ctx.newPage();
    await openEditor(s, again, urlA);
    if (hasMode) p.eq(await ed(again, 'window.__orzEditor.getMode()'), 'preview', 'the view mode after reopening the same document');
    p.check(!(await ed<string[]>(again, 'Object.keys(localStorage)')).some((k) => k.includes(UID_B) && !k.startsWith(`orz-pref:${UID_B}:`)), 'the second document stored keys outside its namespace');
    // a save after a view change writes exactly assemble(text): the preference is not in the file
    const fctx = await s.context({ picker: 'stub' });
    const file = await fctx.newPage();
    await openEditor(s, file, s.writeFile(fileName(s, 'prefs-file'), await s.assemble(EDIT_TEXT, { delivery: 'inline' })));
    await ed(file, 'window.__orzEditor.setMode("preview")');
    await ed(file, `window.__orzEditor.setText(${JSON.stringify(EDITED)})`);
    await ed(file, 'window.__orzEditor.save()');
    await until(() => fctx.of('write').length > 0 || fctx.downloads.length > 0, 10_000);
    const w = (fctx.of('write')[0]?.data as { data: string } | undefined)?.data;
    if (p.check(w !== undefined, 'the save after a view change wrote nothing')) p.check(w === (await s.assemble(EDITED)), `the file saved after a view change is not assemble(text) (a preference went into the file) — ${firstDiff(w!, await s.assemble(EDITED))}`);
  },
};
