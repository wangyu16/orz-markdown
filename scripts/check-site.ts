/**
 * `npm run check:site [-- --live]`: the website checks in one run — the starters and their `?v=` links
 * (`--live`: each is its carrier's npm `latest`), the discovery metadata, and the site editor bundle
 * (`build/web-bundle.mjs --check`). Stops at the first failing check.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const live = process.argv.includes('--live');
const steps: string[][] = [
  ['npx', 'tsx', 'scripts/check-site-starters.ts', ...(live ? ['--live'] : [])],
  ['npx', 'tsx', 'scripts/check-site-discovery.ts'],
  [process.execPath, 'build/web-bundle.mjs', '--check'],
];
for (const [cmd, ...args] of steps) {
  const r = spawnSync(cmd as string, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
