/* Builds docs/orzmd.browser.js — the browser bundle of the LOCAL orz-markdown
 * parser used by the markdown.orz.how editor. Since 2.0.0 orz-markdown has no
 * static Node dependencies (no fs/path/process, no markdown-it-imsize), so it
 * bundles for the browser as-is: no shims, no aliases. Also refreshes
 * docs/themes from themes/ so the site never serves stale theme CSS.
 * Run: `npm run build:web` (after `npm run build`).
 * `--check` (2.4.0; `check:site` and `prepublishOnly` run it): build in memory
 * and fail when docs/orzmd.browser.js or docs/themes differ from the source —
 * a push of main deploys the site, so a stale bundle would ship. */
import { build } from 'esbuild';
import { copyFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CHECK = process.argv.includes('--check');
const OUT = join(ROOT, 'docs', 'orzmd.browser.js');

const result = await build({
  entryPoints: [join(HERE, 'web-entry.js')],
  bundle: true, format: 'iife', platform: 'browser', target: ['es2020'],
  outfile: OUT,
  minify: true, sourcemap: false,
  write: !CHECK,
  logLevel: CHECK ? 'warning' : 'info'
});

const themes = readdirSync(join(ROOT, 'themes')).filter((f) => f.endsWith('.css'));
if (CHECK) {
  const stale = [];
  const built = result.outputFiles[0].contents;
  if (!existsSync(OUT) || Buffer.compare(Buffer.from(built), readFileSync(OUT)) !== 0) stale.push('docs/orzmd.browser.js');
  for (const file of themes) {
    const site = join(ROOT, 'docs', 'themes', file);
    if (!existsSync(site) || !readFileSync(site).equals(readFileSync(join(ROOT, 'themes', file)))) stale.push(`docs/themes/${file}`);
  }
  if (stale.length) {
    console.error(`The website is stale (run \`npm run build && npm run build:web\` and commit): ${stale.join(', ')}`);
    process.exit(1);
  }
  console.log('docs/orzmd.browser.js and docs/themes match the source.');
} else {
  for (const file of themes) copyFileSync(join(ROOT, 'themes', file), join(ROOT, 'docs', 'themes', file));
  console.log('Built docs/orzmd.browser.js and synced docs/themes from the local orz-markdown.');
}
