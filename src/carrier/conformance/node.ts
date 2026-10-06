/**
 * Node access for the harness. Like the rest of `src/`, it reaches Node
 * built-ins through `process.getBuiltinModule` (no static import), and
 * playwright-core through a lazy `import()` (an optional peer dependency).
 */
import type { AssembleOptions } from './types.js';

type Fs = typeof import('node:fs');
type Path = typeof import('node:path');
type Os = typeof import('node:os');
type Crypto = typeof import('node:crypto');
type Http = typeof import('node:http');

function builtin<T>(name: string): T {
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  const mod = proc?.getBuiltinModule?.(name) as T | undefined;
  if (!mod) throw new Error(`orz conformance: the harness runs in Node ≥ 20.16 (needs ${name})`);
  return mod;
}

export const fs = (): Fs => builtin<Fs>('node:fs');
export const path = (): Path => builtin<Path>('node:path');
export const os = (): Os => builtin<Os>('node:os');
export const http = (): Http => builtin<Http>('node:http');
const crypto = (): Crypto => builtin<Crypto>('node:crypto');

export const sha384 = (data: string | Uint8Array): string => `sha384-${crypto().createHash('sha384').update(data).digest('base64')}`;
export const sha256hex = (data: string): string => crypto().createHash('sha256').update(data, 'utf8').digest('hex');

/** Read a file's bytes. */
export const readBytes = (file: string): Uint8Array => new Uint8Array(fs().readFileSync(file));

/** Strict UTF-8 decode (throws on invalid bytes; keeps a BOM). */
export function decodeStrict(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
}

/** The orz-markdown package root (this file is `src|dist/carrier/conformance/node.(ts|js)`). */
export function packageRoot(): string {
  const p = path();
  return p.resolve(__dirname, '..', '..', '..');
}

/**
 * The shared golden corpus (`tests/carrier-corpus/`, FC-19 §6): the texts
 * `manifest.json` lists for `kind`, read as bytes (a BOM kept), by path.
 */
export function loadCorpus(kind: string, dir = path().join(packageRoot(), 'tests', 'carrier-corpus')): Record<string, string> {
  const p = path();
  const manifest = JSON.parse(fs().readFileSync(p.join(dir, 'manifest.json'), 'utf8')) as { files: Array<{ path: string; kind: string }> };
  const out: Record<string, string> = {};
  for (const e of manifest.files) {
    if (e.kind !== kind) continue;
    out[e.path] = decodeStrict(readBytes(p.join(dir, e.path)));
  }
  return out;
}

/** Call a carrier's `assemble`, turning a synchronous throw into a rejection. */
export async function callAssemble(fn: (t: string, o?: AssembleOptions) => string | Promise<string>, text: string, o?: AssembleOptions): Promise<string> {
  const html = await fn(text, o);
  if (typeof html !== 'string') throw new Error(`assemble returned ${typeof html}, not a string`);
  return html;
}

/** playwright-core, loaded only when a browser check runs. */
export async function playwright(): Promise<typeof import('playwright-core')> {
  return import('playwright-core');
}
