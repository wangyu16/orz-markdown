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
    stdout: {
        write(s: string): unknown;
    };
    stderr: {
        write(s: string): unknown;
    };
}
/** The Node `process` object (throws outside Node). */
export declare function proc(): NodeProcess;
export declare const fs: () => Fs;
export declare const path: () => Path;
export declare const os: () => Os;
export declare const childProcess: () => ChildProcess;
export declare const crypto: () => Crypto;
export {};
//# sourceMappingURL=builtins.d.ts.map