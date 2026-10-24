/**
 * The website's starters and their links (`npm run check:starters`, part of `npm run check:site`):
 * each starter embeds the pinned carrier version, and every `starters/new-<kind>…?v=` link in the
 * top-level pages names it. `--live` (`npm run check:site -- --live`) also requires that pinned
 * version to be the carrier's npm `latest` — after a carrier release the family's after-release
 * pipeline regenerates the starter (`npm run starters -- <kind> <version>`) and this turns green.
 */
import { readFileSync, readdirSync } from 'node:fs';
import dns from 'node:dns';
import net from 'node:net';

const live = process.argv.includes('--live');

const docsDir = new URL('../docs/', import.meta.url);
const startersDir = new URL('../docs/starters/', import.meta.url);

const starters = [
  { file: 'new-mdhtml.md.html', version: '1.1.0', pkg: 'orz-mdhtml' },
  { file: 'new-slides.slides.html', version: '1.0.0', pkg: 'orz-slides' },
  { file: 'new-paged.paged.html', version: '1.0.0', pkg: 'orz-paged' },
] as const;

const failures: string[] = [];
const htmlPages = readdirSync(docsDir)
  .filter((file) => file.endsWith('.html'))
  .map((file) => ({
    file,
    source: readFileSync(new URL(file, docsDir), 'utf8'),
  }));

for (const starter of starters) {
  const source = readFileSync(new URL(starter.file, startersDir), 'utf8');
  // Format-1 files (carriers 1.0+) carry their shell version in #orz-shell;
  // 0.x files in their config's rendererVersion / version.
  const shellMatch = source.match(/<script type="application\/json" id="orz-shell">\{[^<]*?"shell":"([^"]+)"/);
  const rendererMatch = source.match(/rendererVersion["']?\s*:\s*["']([^"']+)/);
  const versionMatches = Array.from(
    source.matchAll(/["']version["']\s*:\s*["'](\d+\.\d+\.\d+)/g),
  );
  const embeddedVersion = shellMatch?.[1]
    ?? rendererMatch?.[1]
    ?? versionMatches.at(-1)?.[1];

  if (embeddedVersion !== starter.version) {
    failures.push(
      `${starter.file}: embedded version ${embeddedVersion ?? '<missing>'}; expected ${starter.version}`,
    );
  }

  const linkPattern = new RegExp(
    `starters/${starter.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?v=(\\d+\\.\\d+\\.\\d+)`,
    'g',
  );
  let linkCount = 0;

  for (const page of htmlPages) {
    for (const match of page.source.matchAll(linkPattern)) {
      linkCount += 1;
      if (match[1] !== starter.version) {
        failures.push(
          `${page.file}: ${starter.file} uses ?v=${match[1]}; expected ${starter.version}`,
        );
      }
    }
  }

  if (linkCount === 0) {
    failures.push(`${starter.file}: no versioned public links found`);
  }
}

async function latest(pkg: string): Promise<string> {
  // IPv6 is unreliable on the maintainer's machine
  try { dns.setDefaultResultOrder('ipv4first'); net.setDefaultAutoSelectFamily(false); } catch { /* older Node */ }
  const r = await fetch(`https://registry.npmjs.org/${pkg}/latest`, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`registry HTTP ${r.status}`);
  return String(((await r.json()) as { version?: string }).version);
}

async function main(): Promise<void> {
  if (live) {
    for (const starter of starters) {
      try {
        const v = await latest(starter.pkg);
        if (v !== starter.version) {
          failures.push(`${starter.file} and its ?v= links are ${starter.pkg} ${starter.version}, npm latest is ${v}: \`npm run starters -- ${starter.pkg.replace('orz-', '')} ${v}\``);
        }
      } catch (e) {
        failures.push(`${starter.pkg}: could not ask the registry for latest (${(e as Error).message})`);
      }
    }
  }
  report();
}

function report(): void {
if (failures.length > 0) {
  console.error(`Starter consistency check failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Starter consistency check passed${live ? ' (live: every starter is its carrier\'s npm latest)' : ''}.`);
}
}

void main();
