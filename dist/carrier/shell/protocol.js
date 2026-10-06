"use strict";
/**
 * The orz host protocols, version 1 (`orz-host-save@1`, `orz-host-ai@1`,
 * `orz-host-include@1`): message names, payload types, timeouts and the kind
 * registry, shared by the FILE side (`connectHost`, ./file-side.ts) and the
 * HOST side (`embedCarrierFrame`, ./host-side.ts). Canonical spec:
 * spec/host-protocols.md.
 *
 * Constants and pure helpers only: nothing here touches a window.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HELLO_MAX_MS = exports.HELLO_INTERVAL_MS = exports.INCLUDE_TIMEOUT_MS = exports.AI_TIMEOUT_MS = exports.SAVE_ACK_TIMEOUT_MS = exports.MSG = exports.PROTOCOL_VERSION = exports.INCLUDE_PROTOCOL = exports.AI_PROTOCOL = exports.SAVE_PROTOCOL = exports.KIND_EXTENSIONS = exports.HOST_KINDS = void 0;
exports.isMessage = isMessage;
exports.validHello = validHello;
exports.readOperations = readOperations;
exports.targetFor = targetFor;
exports.validRequestId = validRequestId;
exports.HOST_KINDS = ['md', 'slides', 'paged', 'poster'];
/** The assembled file's extension per kind (FC-18 §3; poster keeps its own). */
exports.KIND_EXTENSIONS = {
    md: '.md.html',
    slides: '.slides.html',
    paged: '.paged.html',
    poster: '.poster.html',
};
exports.SAVE_PROTOCOL = 'orz-host-save';
exports.AI_PROTOCOL = 'orz-host-ai';
exports.INCLUDE_PROTOCOL = 'orz-host-include';
/** The only version both sides speak. A peer announcing a higher one is answered with 1. */
exports.PROTOCOL_VERSION = 1;
/** Message `type` values. */
exports.MSG = {
    hello: 'orz-host-hello',
    ready: 'orz-host-ready',
    save: 'orz-host-save',
    saved: 'orz-host-saved',
    dirty: 'orz-host-dirty',
    aiHello: 'orz-host-ai-hello',
    aiReady: 'orz-host-ai-ready',
    aiRequest: 'orz-host-ai-request',
    aiResult: 'orz-host-ai-result',
    includeHello: 'orz-host-include-hello',
    includeReady: 'orz-host-include-ready',
    includeRequest: 'orz-host-include-request',
    includeResult: 'orz-host-include-result',
};
/** File side: a host save with no `orz-host-saved` within this time fails (the document stays dirty). */
exports.SAVE_ACK_TIMEOUT_MS = 10000;
/** File side: an AI request with no result within this time fails. */
exports.AI_TIMEOUT_MS = 30000;
/** File side: an include request with no result within this time resolves as unresolved. */
exports.INCLUDE_TIMEOUT_MS = 30000;
/** Host side: hello retry cadence and give-up horizon (files behind a slow CDN boot late). */
exports.HELLO_INTERVAL_MS = 400;
exports.HELLO_MAX_MS = 20000;
function isMessage(data) {
    return typeof data === 'object' && data !== null && !Array.isArray(data);
}
/** A hello is valid when it names the protocol and a version ≥ 1 (absent is read as 1). */
function validHello(m, protocol) {
    if (m.protocol !== protocol)
        return false;
    const v = m.version;
    return v === undefined || (typeof v === 'number' && v >= 1);
}
/** Operations are copied field by field; anything without a string id and title is dropped. */
function readOperations(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const o of raw) {
        if (!isMessage(o) || typeof o.id !== 'string' || !o.id || typeof o.title !== 'string' || !o.title)
            continue;
        out.push({ id: o.id, title: o.title, selection: o.selection === true });
    }
    return out;
}
/** `postMessage` rejects `"null"` (an opaque origin) as a target; the spec falls back to `"*"` there. */
function targetFor(origin) {
    return origin && origin !== 'null' ? origin : '*';
}
/** A request id: a string or a finite number, echoed back unchanged. */
function validRequestId(id) {
    return (typeof id === 'string' && id.length > 0 && id.length <= 200) || (typeof id === 'number' && Number.isFinite(id));
}
//# sourceMappingURL=protocol.js.map