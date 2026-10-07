/**
 * Builds the stub carrier (test scaffolding for the conformance harness):
 * the browser bundle of carrier.ts made script-safe the way a release build
 * does it (`<script` / `</script` written as `\x3C…`, spec/shell-runtime.md §6),
 * its `release.json` with the SHA-384 integrity, and the `CarrierTarget` the
 * harness runs against. Everything is generated at test time into a
 * temporary directory; nothing is checked in but the sources.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BundleSource, CarrierTarget } from '../../src/carrier/conformance';
import { stubAssemble, STUB_BUNDLE_PATH, type StubVariant } from './assemble';
import { createStubText } from './document';

/** What a release build does so the bundle can be inlined exactly. */
export const scriptSafe = (code: string): string => code.replace(/<(\\*)(\/?script)/gi, '\\x3C$1$2');

const sri = (bytes: string): string => `sha384-${createHash('sha384').update(bytes, 'utf8').digest('base64')}`;

export interface BuiltStub extends BundleSource {
  version: string;
  variant: StubVariant;
  code: string;
}

/**
 * One KaTeX in the bundle. The parser's source imports `katex/contrib/mhchem` as ESM (→ `katex.mjs`)
 * while `@traptitech/markdown-it-katex` requires `katex` (→ `katex.js`): bundled from source, KaTeX
 * would load twice and `\ce` would be registered on the copy the plugin does not render with. Both
 * resolve here to the CommonJS build, as they do from the package's CommonJS `dist/`.
 */
const oneKatex = {
  name: 'one-katex',
  setup(b: { onResolve(o: { filter: RegExp }, f: (a: { path: string }) => { path: string }): void }): void {
    const dir = join(process.cwd(), 'node_modules', 'katex', 'dist');
    b.onResolve({ filter: /^katex$/ }, () => ({ path: join(dir, 'katex.js') }));
    b.onResolve({ filter: /^katex\/contrib\/mhchem$/ }, () => ({ path: join(dir, 'contrib', 'mhchem.js') }));
  },
};

let root: string | null = null;
const built = new Map<string, Promise<BuiltStub>>();

/** The temporary directory holding every built stub (removed by {@link cleanStubs}). */
function stubRoot(): string {
  root ??= mkdtempSync(join(tmpdir(), 'orz-conformance-stub-'));
  return root;
}

/** Build (once per version and variant) the stub's bundle and release.json. */
export function buildStub(version: string, variant: StubVariant = 'good'): Promise<BuiltStub> {
  const key = `${version}:${variant}`;
  let p = built.get(key);
  if (!p) {
    p = (async () => {
      const { build } = await import('esbuild');
      const out = await build({
        entryPoints: ['tests/conformance-stub/carrier.ts'], bundle: true, minify: true, platform: 'browser', format: 'iife', target: ['es2020'],
        write: false, logLevel: 'silent', charset: 'utf8', plugins: [oneKatex],
        define: { __STUB_VERSION__: JSON.stringify(version), __STUB_VARIANT__: JSON.stringify(variant) },
      });
      const raw = out.outputFiles[0].text;
      const code = variant === 'script-close' ? raw : scriptSafe(raw); // BUG (mutation): no rewrite
      const dir = join(stubRoot(), `${version}-${variant}`);
      mkdirSync(dir, { recursive: true });
      const bundle = join(dir, STUB_BUNDLE_PATH);
      const release = join(dir, 'release.json');
      writeFileSync(bundle, code, 'utf8');
      writeFileSync(release, `${JSON.stringify({
        kind: 'md', version, formats: [1], notes: `https://example.test/orz-stub/CHANGELOG.md#${version.replace(/\./g, '')}`,
        bundle: { path: STUB_BUNDLE_PATH, integrity: sri(code) },
      }, null, 2)}\n`, 'utf8');
      return { version, variant, code, bundle, release };
    })();
    built.set(key, p);
  }
  return p;
}

/** The stub's creation tool: a new document with a header that names the carrier and a freshly minted uid. */
export const createStubDocument = createStubText;

/**
 * The page-side editor driver: the opened file's own editor — `OrzCarrier.standalone.edit()`,
 * the Edit button's path in carrier/app (the file's saver, host, includes and opened bytes) — and,
 * for a text other than the file's (`C.edit.newer-format`), `OrzCarrier.mountEditor` on the file's
 * context (attached to the app).
 */
export const STUB_EDITOR_DRIVER = `function (text) {
  var C = globalThis.OrzCarrier;
  var app = C && C.standalone;
  if (app && app.getText() === text) return app.edit();
  var el = document.createElement('div');
  el.setAttribute('data-orz-conformance', 'editor');
  el.style.cssText = 'width: 1100px; height: 640px;';
  document.body.appendChild(el);
  return C.mountEditor(el, { text: text });
}`;

/** The harness target for a built stub; `next`/`previous` are other builds of it. */
export function stubTarget(stub: BuiltStub, rel: { next?: BuiltStub; previous?: BuiltStub } = {}): CarrierTarget {
  return {
    kind: 'md',
    version: stub.version,
    bundle: stub.bundle,
    release: stub.release,
    assemble: (text, o) => stubAssemble(text, { version: stub.version, variant: stub.variant, delivery: o?.delivery ?? 'inline', engineSource: o?.engineSource ?? stub.code, ...(o?.includes ? { includes: o.includes } : {}) }),
    create: () => createStubDocument(),
    samples: { 'stub-sample': '# Stub sample\n\n- [ ] task\n- [x] done\n\n$E = mc^2$\n' },
    protocols: { ai: true, include: true },
    editor: STUB_EDITOR_DRIVER,
    ...(rel.next ? { next: { bundle: rel.next.bundle, release: rel.next.release } } : {}),
    ...(rel.previous ? { previous: { bundle: rel.previous.bundle, release: rel.previous.release } } : {}),
  };
}

/** Remove the temporary build directory. */
export function cleanStubs(): void {
  if (root) rmSync(root, { recursive: true, force: true });
  root = null;
  built.clear();
}
