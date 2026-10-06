"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.readBytes = exports.sha256hex = exports.sha384 = exports.http = exports.os = exports.path = exports.fs = void 0;
exports.decodeStrict = decodeStrict;
exports.packageRoot = packageRoot;
exports.loadCorpus = loadCorpus;
exports.callAssemble = callAssemble;
exports.playwright = playwright;
function builtin(name) {
    const proc = globalThis.process;
    const mod = proc?.getBuiltinModule?.(name);
    if (!mod)
        throw new Error(`orz conformance: the harness runs in Node ≥ 20.16 (needs ${name})`);
    return mod;
}
const fs = () => builtin('node:fs');
exports.fs = fs;
const path = () => builtin('node:path');
exports.path = path;
const os = () => builtin('node:os');
exports.os = os;
const http = () => builtin('node:http');
exports.http = http;
const crypto = () => builtin('node:crypto');
const sha384 = (data) => `sha384-${crypto().createHash('sha384').update(data).digest('base64')}`;
exports.sha384 = sha384;
const sha256hex = (data) => crypto().createHash('sha256').update(data, 'utf8').digest('hex');
exports.sha256hex = sha256hex;
/** Read a file's bytes. */
const readBytes = (file) => new Uint8Array((0, exports.fs)().readFileSync(file));
exports.readBytes = readBytes;
/** Strict UTF-8 decode (throws on invalid bytes; keeps a BOM). */
function decodeStrict(bytes) {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
}
/** The orz-markdown package root (this file is `src|dist/carrier/conformance/node.(ts|js)`). */
function packageRoot() {
    const p = (0, exports.path)();
    return p.resolve(__dirname, '..', '..', '..');
}
/**
 * The shared golden corpus (`tests/carrier-corpus/`, FC-19 §6): the texts
 * `manifest.json` lists for `kind`, read as bytes (a BOM kept), by path.
 */
function loadCorpus(kind, dir = (0, exports.path)().join(packageRoot(), 'tests', 'carrier-corpus')) {
    const p = (0, exports.path)();
    const manifest = JSON.parse((0, exports.fs)().readFileSync(p.join(dir, 'manifest.json'), 'utf8'));
    const out = {};
    for (const e of manifest.files) {
        if (e.kind !== kind)
            continue;
        out[e.path] = decodeStrict((0, exports.readBytes)(p.join(dir, e.path)));
    }
    return out;
}
/** Call a carrier's `assemble`, turning a synchronous throw into a rejection. */
async function callAssemble(fn, text, o) {
    const html = await fn(text, o);
    if (typeof html !== 'string')
        throw new Error(`assemble returned ${typeof html}, not a string`);
    return html;
}
/** playwright-core, loaded only when a browser check runs. */
async function playwright() {
    return Promise.resolve().then(() => __importStar(require('playwright-core')));
}
//# sourceMappingURL=node.js.map