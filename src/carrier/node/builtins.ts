/**
 * Node access for `orz-markdown/carrier/node`. Like the conformance harness,
 * it reaches Node built-ins only through `process.getBuiltinModule` (Node ≥
 * 20.16, the package's `engines`): no static `import 'node:…'`, so no
 * bundler ever pulls a built-in in, and loading the module outside Node
 * fails only when a function that needs Node runs.
 */
type Fs = typeof import('node:fs');
type Path = typeof import('node:path');
type Os = typeof import('node:os');
type ChildProcess = typeof import('node:child_process');
type Crypto = typeof import('node:crypto');

/** The environment variables this module reads (`process.env`). */
export type Env = Readonly<Record<string, string | undefined>>;

interface NodeProcess {
  getBuiltinModule?: (id: string) => unknown;
  env: Record<string, string | undefined>;
  pid: number;
  cwd(): string;
  stdout: { write(s: string): unknown };
  stderr: { write(s: string): unknown };
}

/** The Node `process` object (throws outside Node). */
export function proc(): NodeProcess {
  const p = (globalThis as { process?: NodeProcess }).process;
  if (!p || typeof p.cwd !== 'function') throw new Error('orz-markdown/carrier/node runs in Node (≥ 20.16) only');
  return p;
}

function builtin<T>(name: string): T {
  const mod = proc().getBuiltinModule?.(name) as T | undefined;
  if (!mod) throw new Error(`orz-markdown/carrier/node needs Node ≥ 20.16 (process.getBuiltinModule('${name}'))`);
  return mod;
}

export const fs = (): Fs => builtin<Fs>('node:fs');
export const path = (): Path => builtin<Path>('node:path');
export const os = (): Os => builtin<Os>('node:os');
export const childProcess = (): ChildProcess => builtin<ChildProcess>('node:child_process');
export const crypto = (): Crypto => builtin<Crypto>('node:crypto');
