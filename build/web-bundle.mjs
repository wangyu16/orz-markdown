/* Builds docs/orzmd.browser.js — the browser bundle of the LOCAL orz-markdown
 * parser used by the markdown.orz.how editor. Since 2.0.0 orz-markdown has no
 * static Node dependencies (no fs/path/process, no markdown-it-imsize), so it
 * bundles for the browser as-is: no shims, no aliases. Also refreshes
 * docs/themes from themes/ so the site never serves stale theme CSS.
 * Run: `npm run build:web` (after `npm run build`). */
import { build } from 'esbuild';
import { copyFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

await build({
  entryPoints: [join(HERE, 'web-entry.js')],
  bundle: true, format: 'iife', platform: 'browser', target: ['es2020'],
  outfile: join(ROOT, 'docs', 'orzmd.browser.js'),
  minify: true, sourcemap: false,
  logLevel: 'info'
});

for (const file of readdirSync(join(ROOT, 'themes'))) {
  if (file.endsWith('.css')) copyFileSync(join(ROOT, 'themes', file), join(ROOT, 'docs', 'themes', file));
}
console.log('Built docs/orzmd.browser.js and synced docs/themes from the local orz-markdown.');
