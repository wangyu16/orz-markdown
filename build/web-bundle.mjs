/* Builds docs/orzmd.browser.js — the browser bundle of the LOCAL orz-markdown
 * parser used by the markdown.orz.how editor. esbuild + the same fs/path/imsize
 * shims the family uses (filesystem-only features degrade gracefully in the
 * browser). Run: `node build/web-bundle.mjs` (after `npm run build`).
 * esbuild + path-browserify are installed with --no-save (dev-only). */
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const stubImsize = {
  name: 'stub-imsize',
  setup(b) {
    b.onResolve({ filter: /(^|[\\/])imsize$/ }, (a) =>
      a.importer.includes('markdown-it-imsize') ? { path: join(HERE, 'shims', 'imsize.cjs') } : undefined);
  }
};

await build({
  entryPoints: [join(HERE, 'web-entry.js')],
  bundle: true, format: 'iife', platform: 'browser', target: ['es2020'],
  outfile: join(ROOT, 'docs', 'orzmd.browser.js'),
  minify: true, sourcemap: false,
  plugins: [stubImsize],
  alias: { fs: join(HERE, 'shims', 'fs.cjs'), path: 'path-browserify' },
  inject: [join(HERE, 'shims', 'process.js')],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info'
});
console.log('Built docs/orzmd.browser.js from the local orz-markdown.');
