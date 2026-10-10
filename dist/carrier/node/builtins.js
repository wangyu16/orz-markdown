"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crypto = exports.childProcess = exports.os = exports.path = exports.fs = void 0;
exports.proc = proc;
/** The Node `process` object (throws outside Node). */
function proc() {
    const p = globalThis.process;
    if (!p || typeof p.cwd !== 'function')
        throw new Error('orz-markdown/carrier/node runs in Node (≥ 20.16) only');
    return p;
}
function builtin(name) {
    const mod = proc().getBuiltinModule?.(name);
    if (!mod)
        throw new Error(`orz-markdown/carrier/node needs Node ≥ 20.16 (process.getBuiltinModule('${name}'))`);
    return mod;
}
const fs = () => builtin('node:fs');
exports.fs = fs;
const path = () => builtin('node:path');
exports.path = path;
const os = () => builtin('node:os');
exports.os = os;
const childProcess = () => builtin('node:child_process');
exports.childProcess = childProcess;
const crypto = () => builtin('node:crypto');
exports.crypto = crypto;
//# sourceMappingURL=builtins.js.map