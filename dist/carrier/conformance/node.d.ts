/**
 * Node access for the harness. Like the rest of `src/`, it reaches Node
 * built-ins through `process.getBuiltinModule` (no static import), and
 * playwright-core through a lazy `import()` (an optional peer dependency).
 */
import type { AssembleOptions } from './types.js';
type Fs = typeof import('node:fs');
type Path = typeof import('node:path');
type Os = typeof import('node:os');
type Http = typeof import('node:http');
export declare const fs: () => Fs;
export declare const path: () => Path;
export declare const os: () => Os;
export declare const http: () => Http;
export declare const sha384: (data: string | Uint8Array) => string;
export declare const sha256hex: (data: string) => string;
/** Read a file's bytes. */
export declare const readBytes: (file: string) => Uint8Array;
/** Strict UTF-8 decode (throws on invalid bytes; keeps a BOM). */
export declare function decodeStrict(bytes: Uint8Array): string;
/** The orz-markdown package root (this file is `src|dist/carrier/conformance/node.(ts|js)`). */
export declare function packageRoot(): string;
/**
 * The shared golden corpus (`tests/carrier-corpus/`, FC-19 §6): the texts
 * `manifest.json` lists for `kind`, read as bytes (a BOM kept), by path.
 */
export declare function loadCorpus(kind: string, dir?: string): Record<string, string>;
/** Call a carrier's `assemble`, turning a synchronous throw into a rejection. */
export declare function callAssemble(fn: (t: string, o?: AssembleOptions) => string | Promise<string>, text: string, o?: AssembleOptions): Promise<string>;
/** playwright-core, loaded only when a browser check runs. */
export declare function playwright(): Promise<typeof import('playwright-core')>;
export {};
//# sourceMappingURL=node.d.ts.map