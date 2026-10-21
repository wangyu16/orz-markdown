/**
 * Regenerate a website starter with the PUBLISHED carrier CLI (family Phase 4 step 4; the family root's
 * `scripts/after-release.ts` runs it after each carrier release).
 *
 *   npm run starters -- <mdhtml|slides|paged> <version>
 *
 * 1. assembles docs/starters/source/<kind>-starter.md with `npx -y --prefer-online orz-<kind>@<version> assemble`
 *    (an exact version and --prefer-online: an npx cache can serve a stale `@1`) into docs/starters/new-<kind>.<ext>;
 * 2. moves every `starters/new-<kind>.<ext>?v=…` link in the site's pages to <version>;
 * 3. moves the pinned version in scripts/check-site-starters.ts;
 * 4. bumps the service worker's CACHE name when a page or the starter changed (it caches './').
 * Idempotent: the same version twice writes nothing the second time (assembly is deterministic). Then run
 * `npm run check:site` (and `-- --live` once the version is npm `latest`).
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DOCS = join(ROOT, 'docs');
const KINDS = {
  mdhtml: { pkg: 'orz-mdhtml', source: 'mdhtml-starter.md', out: 'new-mdhtml.md.html' },
  slides: { pkg: 'orz-slides', source: 'slides-starter.md', out: 'new-slides.slides.html' },
  paged: { pkg: 'orz-paged', source: 'paged-starter.md', out: 'new-paged.paged.html' },
} as const;

const [kind, version] = process.argv.slice(2).filter((a) => a !== '--');
if (!kind || !(kind in KINDS) || !version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('usage: npm run starters -- <mdhtml|slides|paged> <X.Y.Z>   (the published carrier version)');
  process.exit(2);
}
const k = KINDS[kind as keyof typeof KINDS];
const changed: string[] = [];
const writeIfChanged = (file: string, text: string): void => {
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return;
  writeFileSync(file, text);
  changed.push(relative(ROOT, file));
};

// 1. the starter, assembled by the published CLI
const tmp = mkdtempSync(join(tmpdir(), 'orz-starter-'));
let html: string;
try {
  copyFileSync(join(DOCS, 'starters', 'source', k.source), join(tmp, k.source));
  const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --dns-result-order=ipv4first --no-network-family-autoselection`.trim() };
  const r = spawnSync('npx', ['-y', '--prefer-online', `${k.pkg}@${version}`, 'assemble', k.source, '-o', '-'], { cwd: tmp, env, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) { console.error(`npx ${k.pkg}@${version} assemble failed (exit ${r.status}):\n${r.stderr}`); process.exit(1); }
  html = r.stdout;
} finally { rmSync(tmp, { recursive: true, force: true }); }
const shell = /<script type="application\/json" id="orz-shell">\{[^<]*?"shell":"([^"]+)"/.exec(html)?.[1];
if (shell !== version) { console.error(`the assembled starter names shell ${shell ?? '(none)'}, not ${version}: refusing to write it`); process.exit(1); }
writeIfChanged(join(DOCS, 'starters', k.out), html);

// 2. every ?v= link to it in the site's pages (generated starters excluded)
const pages = (dir: string, out: string[] = []): string[] => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n.startsWith('.') || n === 'node_modules' || p === join(DOCS, 'starters')) continue;
    if (statSync(p).isDirectory()) pages(p, out); else if (n.endsWith('.html')) out.push(p);
  }
  return out;
};
const link = new RegExp(`(starters/${k.out.replace(/\./g, '\\.')}\\?v=)\\d+\\.\\d+\\.\\d+`, 'g');
let links = 0;
for (const p of pages(DOCS)) {
  const text = readFileSync(p, 'utf8');
  const next = text.replace(link, (_m, pre: string) => { links++; return `${pre}${version}`; });
  writeIfChanged(p, next);
}
if (!links) { console.error(`no starters/${k.out}?v= link found in docs/: the site must link the starter with its version`); process.exit(1); }

// 3. the version check-site-starters.ts pins
const checker = join(ROOT, 'scripts', 'check-site-starters.ts');
const pin = new RegExp(`(\\{ file: '${k.out.replace(/\./g, '\\.')}', version: ')\\d+\\.\\d+\\.\\d+(')`);
const checkerText = readFileSync(checker, 'utf8');
if (!pin.test(checkerText)) { console.error(`scripts/check-site-starters.ts has no "{ file: '${k.out}', version: '…' }" pin`); process.exit(1); }
writeIfChanged(checker, checkerText.replace(pin, `$1${version}$2`));

// 4. the service worker caches './' (the home page): a new cache name when a page or the starter changed
if (changed.some((f) => f.startsWith('docs/'))) {
  const sw = join(DOCS, 'sw.js');
  const text = readFileSync(sw, 'utf8');
  const m = /var CACHE = 'orz-md-v(\d+)';/.exec(text);
  if (!m) { console.error("docs/sw.js: no `var CACHE = 'orz-md-vN';`"); process.exit(1); }
  writeIfChanged(sw, text.replace(m[0], `var CACHE = 'orz-md-v${Number(m[1]) + 1}';`));
}

console.log(changed.length
  ? `starter ${k.out}: ${k.pkg}@${version}; changed ${changed.join(', ')}`
  : `starter ${k.out}: already ${k.pkg}@${version} (the published CLI reproduces it byte for byte); ${links} link(s) current; nothing changed`);
