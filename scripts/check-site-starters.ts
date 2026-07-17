import { readFileSync, readdirSync } from 'node:fs';

const docsDir = new URL('../docs/', import.meta.url);
const startersDir = new URL('../docs/starters/', import.meta.url);

const starters = [
  { file: 'new-mdhtml.md.html', version: '0.9.3' },
  { file: 'new-slides.slides.html', version: '0.8.5' },
  { file: 'new-paged.paged.html', version: '0.7.3' },
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
  const rendererMatch = source.match(/rendererVersion["']?\s*:\s*["']([^"']+)/);
  const versionMatches = Array.from(
    source.matchAll(/["']version["']\s*:\s*["'](\d+\.\d+\.\d+)/g),
  );
  const embeddedVersion = rendererMatch?.[1]
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

if (failures.length > 0) {
  console.error(`Starter consistency check failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('Starter consistency check passed.');
}
