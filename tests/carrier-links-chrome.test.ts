/**
 * Twin-link naming in real Chrome (orz-markdown 2.5.0, K1 of the orz-site
 * design; FC-18 §8.2/§8.3): claims A.33 and M.44 in notes/CLAIMS.md. The stub
 * carrier (tests/conformance-stub/, built here from this checkout's kit) is the
 * carrier: a file it assembled with a naming, opened under the name the naming
 * gives it, renders its links — in the read view and in the editor's preview —
 * with that naming and saves with it; and the website's verify.html, given the
 * stub as "the published package", reproduces such a file byte for byte (and
 * still every file without a naming). The browser checks skip without Chrome
 * (the claims are then unverified).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extract } from '../src/carrier';
import { initScript, pageRecords } from '../src/carrier/conformance';
import { buildStub, cleanStubs, type BuiltStub } from './conformance-stub/build';
import { stubAssemble } from './conformance-stub/assemble';

type Browser = import('playwright-core').Browser;
type Page = import('playwright-core').Page;

async function launch(): Promise<Browser | null> {
  try {
    const { chromium } = await import('playwright-core');
    return await chromium.launch({ channel: 'chrome', args: ['--allow-file-access-from-files'] });
  } catch {
    return null;
  }
}

const browser = await launch();
let stub: BuiltStub;
let dir: string;

beforeAll(async () => {
  stub = await buildStub('1.1.0');
  dir = mkdtempSync(join(tmpdir(), 'orz-links-'));
}, 240_000);

afterAll(async () => {
  await browser?.close();
  cleanStubs();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const SITE = { md: '{stem}.html', slides: '{stem}.deck.html' };
const TEXT = '{{nyml\nkind: document\ntitle: Week one\nuid: doc-linkslinkslink0001\n}}\n\n# Week one\n\nSee [week two](week2.slides.md#s3), [the notes](../notes.md?v=1), [the handout](handout.paged.md), [elsewhere](https://example.org/x.md), [the data](data.csv) and [the top](#week-one). ![pic](pic.md)\n';
const WANT = ['week2.deck.html#s3', '../notes.html?v=1', 'handout.paged.html', 'https://example.org/x.md', 'data.csv', '#week-one'];
const assemble = (text: string, twinLinks?: Record<string, string>): string => stubAssemble(text, { version: '1.1.0', variant: 'good', delivery: 'inline', engineSource: stub.code, ...(twinLinks ? { twinLinks } : {}) });
const write = (name: string, html: string): string => {
  const sub = mkdtempSync(join(dir, 'f-'));
  writeFileSync(join(sub, name), html, 'utf8');
  return `file://${join(sub, name).split('/').map(encodeURIComponent).join('/')}`;
};
const hrefs = (root: string) => `Array.from(document.querySelectorAll(${JSON.stringify(`${root} a[href]`)})).map(function (a) { return a.getAttribute('href'); })`;

describe('a file with a twin-link naming, in Chrome', () => {
  it('[A.33] opened under the naming\'s name (week1.html), the stub\'s file renders its twin links with the naming in the read view and in the editor\'s preview (fragment and query kept, a kind left out on the family name, images and other links as written); its save writes assemble(text, { twinLinks }) under the dual name week1.md.html', async () => {
    if (!browser) return;
    const html = assemble(TEXT, SITE);
    expect(extract(html)!.twinLinks).toEqual(SITE);
    const ctx = await browser.newContext();
    await ctx.addInitScript({ content: initScript('stub') });
    const page: Page = await ctx.newPage();
    try {
      await page.goto(write('week1.html', html));
      await page.waitForFunction(`${hrefs('#orz-doc')}.length >= 6`, undefined, { timeout: 20_000 });
      const read = await page.evaluate(hrefs('#orz-doc')) as string[];
      expect(read).toEqual(WANT);
      expect(await page.evaluate(`document.querySelector('#orz-doc img').getAttribute('src')`)).toBe('pic.md');
      // the editor's preview (a file: page, top-level: its frame shares the page's origin)
      await page.evaluate('globalThis.OrzCarrier.standalone.edit().ready');
      let preview: string[] = [];
      for (let i = 0; i < 100 && preview.length < 6; i++) {
        for (const f of page.frames()) {
          if (f === page.mainFrame()) continue;
          try { preview = await f.evaluate(hrefs('body')) as string[]; } catch { /* not ready */ }
          if (preview.length >= 6) break;
        }
        if (preview.length < 6) await page.waitForTimeout(100);
      }
      expect(preview).toEqual(WANT);
      // the save: the naming kept, the dual name offered
      const edited = `${TEXT}\nEdited.\n`;
      await page.evaluate(`(function (t) { var ed = globalThis.OrzCarrier.standalone.editor(); ed.setText(t); return ed.save(); })(${JSON.stringify(edited)})`);
      await page.waitForFunction(`(window.__orzConformanceLog || []).some(function (r) { return r.type === 'write'; })`, undefined, { timeout: 20_000 });
      const writes = await pageRecords(page, 'write');
      const saved = (writes[0].data as { data: string }).data;
      expect(saved === assemble(edited, SITE)).toBe(true);
      expect((await pageRecords(page, 'picker')).map((r) => (r.data as { suggestedName: string }).suggestedName)).toEqual(['week1.md.html']);
    } finally {
      await ctx.close();
    }
  }, 120_000);
});

// ── verify.html (the website) ────────────────────────────────────────────

const VERIFY = readFileSync('docs/verify.html', 'utf8');

/** verify.html on its site, with jsDelivr answering for the stub as orz-mdhtml-browser@1.1.0 (the "published" release). */
async function verifyPage(more: Record<string, { release: string; code: string }> = {}): Promise<{ page: Page; close(): Promise<void> }> {
  const ctx = await browser!.newContext();
  const base = 'https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@1.1.0/';
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    for (const [b, r] of Object.entries(more)) {
      if (url.startsWith(`${b}release.json`)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: r.release });
      if (url.startsWith(`${b}orz-stub.browser.js`)) return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: r.code });
    }
    if (url === 'https://markdown.orz.how/verify.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: VERIFY });
    if (url.startsWith(`${base}release.json`)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(stub.release, 'utf8') });
    if (url.startsWith(`${base}orz-stub.browser.js`)) return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: stub.code });
    if (url.startsWith('https://markdown.orz.how/')) return route.fulfill({ status: 404, body: '' });
    return route.abort();
  });
  const page = await ctx.newPage();
  await page.goto('https://markdown.orz.how/verify.html');
  return { page, close: () => ctx.close() };
}

async function verdict(page: Page, html: string): Promise<{ verdict: string; findings: string[] }> {
  await page.evaluate(`verify(${JSON.stringify(html)})`);
  await page.waitForFunction(`!!document.querySelector('#out .verdict')`, undefined, { timeout: 60_000 });
  return page.evaluate(`({ verdict: document.querySelector('#out .verdict').textContent, findings: Array.from(document.querySelectorAll('#out .finding')).map(function (f) { return f.textContent; }) })`) as Promise<{ verdict: string; findings: string[] }>;
}

describe('verify.html', () => {
  it('[M.44] verify.html re-assembles a file with the link naming the published package\'s extract reads (#orz-shell "links") and reproduces it byte for byte — as it still does every file without one (and a naming put into one afterwards is just that option); a file whose "links" is not a valid naming is not what the package assembles, and one that names a release from before the naming (its extract and assemble know none) is reported as not made by it', async () => {
    if (!browser) return;
    const { createHash } = await import('node:crypto');
    // a release from before 2.5.0: its extract reports no twinLinks and its assemble ignores the option
    const oldCode = `${stub.code};(function(){var C=globalThis.OrzCarrier;var e=C.extract,a=C.assemble;var f=function(h){var x=e.call(C,h);if(!x)return x;var y=Object.assign({},x);delete y.twinLinks;return y;};var g=function(t,o){var p=Object.assign({},o);delete p.twinLinks;return a.call(C,t,p);};try{C.extract=f;C.assemble=g;}catch(err){}if(C.extract!==f){try{globalThis.OrzCarrier=Object.assign({},C,{extract:f,assemble:g});}catch(err){}}})();`;
    const oldRelease = JSON.stringify({ kind: 'md', version: '1.0.9', formats: [1], notes: 'x', bundle: { path: 'orz-stub.browser.js', integrity: `sha384-${createHash('sha384').update(oldCode, 'utf8').digest('base64')}` } });
    const v = await verifyPage({ 'https://cdn.jsdelivr.net/npm/orz-mdhtml-browser@1.0.9/': { release: oldRelease, code: oldCode } });
    try {
      const withLinks = await verdict(v.page, assemble(TEXT, SITE));
      expect(withLinks.findings.join('\n')).toContain('Reproduced byte for byte');
      expect(withLinks.findings.join('\n')).toContain('Links to other documents use the site’s names');
      expect(withLinks.verdict).toContain('Genuine — reproduced byte for byte');
      const plain = await verdict(v.page, assemble(TEXT));
      expect(plain.findings.join('\n')).toContain('Reproduced byte for byte');
      expect(plain.findings.join('\n')).not.toContain('use the site’s names');
      // "links" is an assemble option: written into a plain file, the file is that assembly
      const added = assemble(TEXT).replace('"delivery":"inline"}', '"delivery":"inline","links":{"md":"{stem}.html"}}');
      expect(added === assemble(TEXT, { md: '{stem}.html' })).toBe(true);
      expect((await verdict(v.page, added)).findings.join('\n')).toContain('Reproduced byte for byte');
      // not a valid naming: extract ignores it, so the package's assembly differs
      const invalid = assemble(TEXT).replace('"delivery":"inline"}', '"delivery":"inline","links":{"md":"x.html"}}');
      const bad = await verdict(v.page, invalid);
      expect(bad.findings.join('\n')).not.toContain('Reproduced byte for byte');
      expect(bad.findings.join('\n')).toContain('Not what the published package assembles');
      expect(bad.verdict).toContain('Not the genuine published file');
      // a file with "links" naming a release from before them
      const old = assemble(TEXT, SITE).replace(/1\.1\.0/g, '1.0.9');
      const o = await verdict(v.page, old);
      expect(o.findings.join('\n')).toContain('does not write such a name list');
      expect(o.verdict).toContain('Not the genuine published file');
    } finally {
      await v.close();
    }
  }, 180_000);
});
