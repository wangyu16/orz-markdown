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
import { DEFAULT_EDITOR_DRIVER, PAGE_HELPERS, mountEditorScript } from './page.js';
import { call, type CheckContext, type Release, type Session } from './session.js';
import { EDIT_TEXT, HAZARD_TEXTS, LIVE_DOM_MARKER, OTHER_TEXT, REFUSED_TEXTS, UID_A, UID_B } from './texts.js';

type Page = import('playwright-core').Page;
type Frame = import('playwright-core').Frame;

export class Skip extends Error {}

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

/** The file name the browser checks open (an assembled twin name). */
const fileName = (s: Session, base: string): string => `${base}${ext(s)}`;

// ── laws ──────────────────────────────────────────────────────────────────

export const lawChecks = (corpus: () => Record<string, string>): Record<string, CheckFn> => ({
  async 'C.law.round-trip'(s, p) {
    const { kind, version } = s.target;
    for (const [name, text] of lawTexts(s, corpus())) {
      for (const delivery of ['inline', 'cdn'] as const) {
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
    const own = s.releases.target.code;
    for (const [name, text] of texts) {
      try {
        const a = await callAssemble((t, o) => s.target.assemble(t, o), text, { delivery: 'inline' });
        const b = await callAssemble((t, o) => s.target.assemble(t, o), text, { delivery: 'inline' });
        p.check(a === b, `${name}: two Node assemblies differ — ${firstDiff(a, b)}`);
        const c = await callAssemble((t, o) => s.target.assemble(t, o), text, { delivery: 'inline', engineSource: own });
        p.check(a === c, `${name}: Node inline assembly without engineSource differs from one given this release's bundle — ${firstDiff(a, c)}`);
      } catch (e) { p.fail(`${name}: assemble threw: ${msg(e)}`); }
    }
    needBrowser(s);
    const list = texts.map(([, t]) => t);
    const [inline, cdn] = [await s.chromeAssemble(s.releases.target, list, 'inline', true), await s.chromeAssemble(s.releases.target, list, 'cdn')];
    for (let i = 0; i < texts.length; i++) {
      const [name, text] = texts[i];
      try {
        const nodeInline = await s.assemble(text, { delivery: 'inline', engineSource: own });
        if (inline[i] !== `sha256:${sha256hex(nodeInline)}`) {
          const [full] = await s.chromeAssemble(s.releases.target, [text], 'inline');
          p.fail(`${name}: Chrome inline bytes differ from Node's — ${firstDiff(full, nodeInline)}`);
        }
        const nodeCdn = await s.assemble(text, { delivery: 'cdn' });
        p.check(cdn[i] === nodeCdn, `${name}: Chrome cdn bytes differ from Node's — ${firstDiff(cdn[i], nodeCdn)}`);
      } catch (e) { p.fail(`${name}: ${msg(e)}`); }
    }
  },

  async 'C.law.idempotence'(s, p) {
    for (const [name, text] of lawTexts(s, corpus())) {
      for (const delivery of ['inline', 'cdn'] as const) {
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
      const ctx = await s.context({ picker: 'none' });
      const page = await ctx.newPage();
      await page.goto(`${s.fileOrigin}/page/${r.label}.html`);
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
    const authored = await callAssemble((t, o) => s.target.assemble(t, o), editHeader(text, { author: 'Conformance Author', keywords: 'alpha, beta' }));
    const meta = /<script type="application\/orz-meta\+json" id="orz-meta">([\s\S]*?)<\/script>/.exec(authored)?.[1] ?? '';
    p.check(meta.includes('Conformance Author') && meta.includes('alpha'), 'a header author/keywords edit does not reach #orz-meta');
    p.check(!/"(docId|fileName|path|filename)"/.test(meta), '#orz-meta holds a file or user field');
  },
};

// ── edit ─────────────────────────────────────────────────────────────────

export const editChecks: Record<string, CheckFn> = {
  async 'C.edit.exact'(s, p) {
    needBrowser(s);
    const ctx = await s.context({ picker: 'stub' });
    const page = await ctx.newPage();
    const url = s.serve(fileName(s, 'edit'), await s.assemble(EDIT_TEXT, { delivery: 'inline' }));
    const read = await openEditor(s, page, url);
    p.check(read === EDIT_TEXT, `the opened file does not give back its text — ${firstDiff(read, EDIT_TEXT)}`);
    p.check((await ed<string>(page, 'window.__orzEditor.getText()')) === EDIT_TEXT, 'getText() of the mounted editor is not the exact text');
    p.eq(await ed(page, 'window.__orzEditor.isDirty()'), false, 'isDirty() right after mounting');
    await ed(page, 'window.__orzEditor.focus()');
    await page.keyboard.type('Zq1');
    let t = await ed<string>(page, 'window.__orzEditor.getText()');
    p.check(t.includes('Zq1') && t.replace('Zq1', '') === EDIT_TEXT, `typing "Zq1" did not insert exactly it — ${firstDiff(t.replace('Zq1', ''), EDIT_TEXT)}`);
    p.eq(await ed(page, 'window.__orzEditor.isDirty()'), true, 'isDirty() after typing');
    await page.keyboard.press('Enter');
    t = await ed<string>(page, 'window.__orzEditor.getText()');
    p.check(t.startsWith('﻿'), 'the BOM was lost after typing');
    p.check(!/(^|[^\r])\n/.test(t) && !/\r(?!\n)/.test(t), 'a typed line break is not written in the document\'s CR LF style');
    p.check(t.replace('Zq1\r\n', '') === EDIT_TEXT, `the typed line break is not exactly one CR LF after "Zq1" — ${firstDiff(t.replace('Zq1\r\n', ''), EDIT_TEXT)}`);
    p.check(await undoTo(page, page, EDIT_TEXT), 'undo does not return to the exact original text');
    p.eq(await ed(page, 'window.__orzEditor.isDirty()'), false, 'isDirty() after undoing back to the saved text');
    await ed(page, `window.__orzEditor.setText(${JSON.stringify(`${EDIT_TEXT}More.\r\n`)})`);
    p.eq(await ed(page, 'window.__orzEditor.isDirty()'), true, 'isDirty() after setText');
    await ed(page, 'window.__orzEditor.markSaved()');
    p.eq(await ed(page, 'window.__orzEditor.isDirty()'), false, 'isDirty() after markSaved()');
    p.check((await ed<string>(page, 'window.__orzEditor.getText()')) === `${EDIT_TEXT}More.\r\n`, 'setText did not adopt the text exactly');
  },

  async 'C.edit.set-header'(s, p) {
    needBrowser(s);
    const ctx = await s.context({ picker: 'stub' });
    const page = await ctx.newPage();
    const url = s.serve(fileName(s, 'header'), await s.assemble(EDIT_TEXT, { delivery: 'inline' }));
    await openEditor(s, page, url);
    if (!(await ed<boolean>(page, 'typeof window.__orzEditor.setHeader === "function"'))) throw new Skip('the editor has no setHeader (FC-19 §8.7 refinement 2, not yet binding)');
    await ed(page, 'window.__orzEditor.setHeader({ title: "Renamed by conformance", x_new_key: "added" })');
    const after = await ed<string>(page, 'window.__orzEditor.getText()');
    const want = editHeader(EDIT_TEXT, { title: 'Renamed by conformance', x_new_key: 'added' });
    p.check(after === want, `setHeader is not the kit's editHeader — ${firstDiff(after, want)}`);
    p.eq(await ed(page, 'window.__orzEditor.isDirty()'), true, 'isDirty() after setHeader');
    const api = await ed<boolean>(page, 'typeof window.__orzEditor.undo === "function"');
    if (api) await ed(page, 'window.__orzEditor.undo()');
    else { await ed(page, 'window.__orzEditor.focus()'); await page.keyboard.press('ControlOrMeta+z'); }
    const back = await ed<string>(page, 'window.__orzEditor.getText()');
    p.check(back === EDIT_TEXT, `one undo does not restore the exact text — ${firstDiff(back, EDIT_TEXT)}`);
    const refused = await ed<boolean>(page, '(function () { try { window.__orzEditor.setHeader({ title: "a }} b" }); return false; } catch (e) { return true; } })()');
    p.check(refused, 'setHeader accepted a value holding "}}"');
    p.check((await ed<string>(page, 'window.__orzEditor.getText()')) === EDIT_TEXT, 'a refused setHeader changed the text');
  },
};

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
      p.check(ctx.downloads[0].name.endsWith(ext(s)), `the download is named "${ctx.downloads[0].name}", not a ${ext(s)} name`);
    }
    p.eq(await ed(page, 'window.__orzEditor.isDirty()'), false, 'isDirty() after a successful download');
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
      p.eq(ctx.requests.filter((u) => !u.endsWith('/release.json')).length, 0, 'bundle requests before the reader asked for the update');
    } finally {
      release();
    }
  },

  async 'C.update.reassemble'(s, p) {
    const next = needNext(s);
    const [expected] = await s.chromeAssemble(next, [EDIT_TEXT], 'inline');
    const ctx = await s.context({ picker: 'stub', cdn: { latest: next } });
    const page = await ctx.newPage();
    await page.goto(s.writeFile(fileName(s, 'update'), await s.assemble(EDIT_TEXT, { delivery: 'inline' })));
    if (!p.check(await until(async () => (await page.getByRole('button', { name: chipName(next.version) }).count()) > 0, 20_000), 'no update indicator')) return;
    const r = await runUpdate(page, ctx, next.version);
    if (!p.check(r === 'saved', `Update now saved nothing (${r})`)) return;
    const saved = firstSaved(ctx)!;
    const x = extract(saved);
    p.check(x?.text === EDIT_TEXT, `the updated file does not give back the exact text — ${firstDiff(x?.text ?? '', EDIT_TEXT)}`);
    p.eq(x && [x.kind, x.shell, x.delivery], [s.target.kind, next.version, 'inline'], 'the updated file\'s kind, shell, delivery');
    p.check(saved === expected, `the updated file is not the new release's assemble(text) — ${firstDiff(saved, expected)}`);
    p.eq(ctx.of('dialog').length, 0, 'dialogs during the update');
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
    p.eq(ctx.of('write').length + ctx.downloads.length, 0, 'files written');
    await page.evaluate(PAGE_HELPERS);
    p.eq(await ed(page, 'window.__orzC.modal()'), 0, 'modal dialogs / inert elements');
  },

  async 'C.update.from-previous'(s, p) {
    needBrowser(s);
    const prev = s.releases.previous;
    if (!prev) throw new Skip('no `previous` release given');
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
  },
};

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
  },

  async 'C.host.silent'(s, p) {
    needBrowser(s);
    const ctx = await s.context({ picker: 'stub' });
    const h = await hostPage(s, ctx, fileName(s, 'silent'), { save: false, ai: false, include: false, ack: false });
    const f = await h.frame();
    await openEditor(s, f);
    await ed(f, `window.__orzEditor.setText(${JSON.stringify(EDITED)})`);
    const t0 = Date.now();
    await ed(f, 'window.__orzEditor.save()');
    p.check(Date.now() - t0 < 5_000, 'save() took more than 5 s without a host');
    await f.waitForTimeout(400);
    p.eq(orzMsgs(await h.state()).map((m) => m.type), [], 'messages posted to a host that never said hello');
    p.check((await ed<number>(f, 'window.__orzC.deepAll(document, "#orz-served-note").length')) > 0, 'the served-page notice did not appear (the standalone save of a served file)');
    p.eq(await ed(f, 'window.__orzEditor.isDirty()'), true, 'isDirty() (nothing was saved)');
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
    const mine = keys.filter((k) => k.includes(UID_A));
    p.check(mine.length > 0, `no reader preference stored under the uid (keys: ${clip(JSON.stringify(keys))})`);
    p.eq(mine.filter((k) => !k.startsWith(`orz-pref:${UID_A}:`)), [], 'uid keys outside the orz-pref:<uid>: namespace');
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
  },
};
