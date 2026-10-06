"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOT_CONNECTED = void 0;
exports.connectHost = connectHost;
/**
 * The FILE side of the orz host protocols (spec/host-protocols.md): what an
 * assembled file, running in an iframe, uses to let its embedding app receive
 * saves, offer AI operations and resolve includes.
 *
 * Security rules (§ Security in the spec):
 * - an unframed document never listens;
 * - a message is read only when `event.source === window.parent`;
 * - the origin is pinned at the first accepted hello (of any of the three
 *   protocols); afterwards a message from another origin is dropped (an opaque
 *   parent, origin `"null"`, cannot be pinned);
 * - nothing is active until the matching hello: before it, `save` reports
 *   `not-connected`, `requestAi` fails and `requestInclude` resolves `null`
 *   without posting anything;
 * - payloads are data: strings are copied, nothing is evaluated or rendered;
 * - a repeated hello is answered with the same ready (idempotent).
 *
 * No window access happens at module load; `connectHost` reads the window
 * when called.
 */
const protocol_js_1 = require("./protocol.js");
const types_js_1 = require("./types.js");
exports.NOT_CONNECTED = 'not-connected';
function connectHost(opts) {
    const win = opts.window ?? (0, types_js_1.globalWindow)();
    const parent = (win?.parent ?? null);
    const framed = !!win && !!parent && parent !== win;
    const timeouts = {
        save: opts.timeouts?.save ?? protocol_js_1.SAVE_ACK_TIMEOUT_MS,
        ai: opts.timeouts?.ai ?? protocol_js_1.AI_TIMEOUT_MS,
        include: opts.timeouts?.include ?? protocol_js_1.INCLUDE_TIMEOUT_MS,
    };
    let origin = null;
    const active = { save: false, ai: false, include: false };
    let operations = [];
    let dirty = false;
    let disposed = false;
    let seq = 0;
    let pendingSave = null;
    const aiPending = new Map();
    const includePending = new Map();
    const includeInflight = new Map();
    const post = (message) => {
        if (!parent)
            return;
        try {
            parent.postMessage(message, (0, protocol_js_1.targetFor)(origin));
        }
        catch {
            /* a closed host is not the document's problem */
        }
    };
    const postDirty = () => post({ type: protocol_js_1.MSG.dirty, protocol: protocol_js_1.SAVE_PROTOCOL, version: protocol_js_1.PROTOCOL_VERSION, dirty });
    const settleSave = (ack) => {
        if (!pendingSave)
            return;
        const p = pendingSave;
        pendingSave = null;
        clearTimeout(p.timer);
        p.resolve(ack);
        try {
            opts.onSaveResult?.(ack);
        }
        catch { /* a caller's callback cannot break the protocol */ }
    };
    const first = (protocol, key, eventOrigin) => {
        if (origin === null)
            origin = eventOrigin;
        const was = active[key];
        active[key] = true;
        if (!was) {
            try {
                opts.onReady?.(protocol, eventOrigin);
            }
            catch { /* ignore */ }
        }
        return !was;
    };
    const onMessage = (event) => {
        if (disposed || !framed || event.source !== parent)
            return;
        if (origin !== null && origin !== 'null' && event.origin !== origin)
            return;
        const m = event.data;
        if (!(0, protocol_js_1.isMessage)(m))
            return;
        switch (m.type) {
            case protocol_js_1.MSG.hello: {
                if (!(0, protocol_js_1.validHello)(m, protocol_js_1.SAVE_PROTOCOL))
                    return;
                first(protocol_js_1.SAVE_PROTOCOL, 'save', event.origin);
                // the highest version we support ≤ the host's: we speak only 1
                post({ type: protocol_js_1.MSG.ready, protocol: protocol_js_1.SAVE_PROTOCOL, version: protocol_js_1.PROTOCOL_VERSION, kind: opts.kind });
                if (dirty)
                    postDirty();
                return;
            }
            case protocol_js_1.MSG.saved: {
                if (!active.save || !pendingSave)
                    return;
                if (m.ok === true)
                    settleSave({ ok: true });
                else
                    settleSave({ ok: false, error: typeof m.error === 'string' && m.error ? m.error : 'The host could not save.' });
                return;
            }
            case protocol_js_1.MSG.aiHello: {
                if (!opts.ai || !(0, protocol_js_1.validHello)(m, protocol_js_1.AI_PROTOCOL))
                    return;
                first(protocol_js_1.AI_PROTOCOL, 'ai', event.origin);
                operations = (0, protocol_js_1.readOperations)(m.operations);
                post({ type: protocol_js_1.MSG.aiReady, protocol: protocol_js_1.AI_PROTOCOL, version: protocol_js_1.PROTOCOL_VERSION });
                try {
                    opts.ai.onOperations(operations.map((o) => ({ ...o })));
                }
                catch { /* ignore */ }
                return;
            }
            case protocol_js_1.MSG.aiResult: {
                if (!active.ai || typeof m.requestId !== 'string')
                    return;
                const p = aiPending.get(m.requestId);
                if (!p)
                    return;
                aiPending.delete(m.requestId);
                clearTimeout(p.timer);
                if (m.ok === true && typeof m.proposed === 'string')
                    p.resolve({ ok: true, proposed: m.proposed });
                else
                    p.resolve({ ok: false, error: typeof m.error === 'string' && m.error ? m.error : 'The host returned no proposal.' });
                return;
            }
            case protocol_js_1.MSG.includeHello: {
                if (!opts.include || !(0, protocol_js_1.validHello)(m, protocol_js_1.INCLUDE_PROTOCOL))
                    return;
                const isFirst = first(protocol_js_1.INCLUDE_PROTOCOL, 'include', event.origin);
                post({ type: protocol_js_1.MSG.includeReady, protocol: protocol_js_1.INCLUDE_PROTOCOL, version: protocol_js_1.PROTOCOL_VERSION, kind: opts.kind });
                if (isFirst) {
                    try {
                        opts.include.onAvailable();
                    }
                    catch { /* ignore */ }
                }
                return;
            }
            case protocol_js_1.MSG.includeResult: {
                if (!active.include || typeof m.requestId !== 'string')
                    return;
                const p = includePending.get(m.requestId);
                if (!p)
                    return;
                includePending.delete(m.requestId);
                clearTimeout(p.timer);
                p.resolve(m.ok === true && typeof m.markdown === 'string' ? m.markdown : null);
                return;
            }
            default:
        }
    };
    if (framed)
        win.addEventListener('message', onMessage);
    return {
        connected: () => active.save,
        protocols: () => ({ ...active }),
        origin: () => origin,
        aiOperations: () => operations.map((o) => ({ ...o })),
        save(payload) {
            if (disposed || !active.save)
                return Promise.resolve({ ok: false, error: exports.NOT_CONNECTED });
            if (pendingSave)
                return Promise.resolve({ ok: false, error: 'A save is already in flight.' });
            if (typeof payload?.source !== 'string' || typeof payload.html !== 'string')
                return Promise.resolve({ ok: false, error: 'source and html must be strings.' });
            return new Promise((resolve) => {
                const timer = setTimeout(() => settleSave({ ok: false, error: 'No response from the host.' }), timeouts.save);
                pendingSave = { resolve, timer };
                post({
                    type: protocol_js_1.MSG.save, protocol: protocol_js_1.SAVE_PROTOCOL, version: protocol_js_1.PROTOCOL_VERSION,
                    source: payload.source, html: payload.html,
                    ...(typeof payload.theme === 'string' ? { theme: payload.theme } : {}),
                });
            });
        },
        requestAi(op, text, selection = false) {
            if (disposed || !active.ai)
                return Promise.resolve({ ok: false, error: 'No AI host.' });
            if (!operations.some((o) => o.id === op))
                return Promise.resolve({ ok: false, error: 'Unknown operation.' });
            if (typeof text !== 'string')
                return Promise.resolve({ ok: false, error: 'text must be a string.' });
            const requestId = `ai${++seq}`;
            return new Promise((resolve) => {
                const timer = setTimeout(() => {
                    if (aiPending.delete(requestId))
                        resolve({ ok: false, error: 'No response from the host.' });
                }, timeouts.ai);
                aiPending.set(requestId, { resolve, timer });
                post({ type: protocol_js_1.MSG.aiRequest, protocol: protocol_js_1.AI_PROTOCOL, version: protocol_js_1.PROTOCOL_VERSION, requestId, op, text, selection: selection === true });
            });
        },
        requestInclude(url) {
            if (disposed || !active.include || typeof url !== 'string' || !url)
                return Promise.resolve(null);
            const inflight = includeInflight.get(url);
            if (inflight)
                return inflight;
            const requestId = `inc${++seq}`;
            const promise = new Promise((resolve) => {
                const timer = setTimeout(() => {
                    if (includePending.delete(requestId))
                        resolve(null);
                }, timeouts.include);
                includePending.set(requestId, { resolve, timer });
                post({ type: protocol_js_1.MSG.includeRequest, protocol: protocol_js_1.INCLUDE_PROTOCOL, version: protocol_js_1.PROTOCOL_VERSION, requestId, url });
            }).finally(() => includeInflight.delete(url));
            includeInflight.set(url, promise);
            return promise;
        },
        setDirty(d) {
            const next = d === true;
            if (next === dirty)
                return;
            dirty = next;
            if (active.save && !disposed)
                postDirty();
        },
        dispose() {
            if (disposed)
                return;
            disposed = true;
            if (framed)
                win.removeEventListener('message', onMessage);
            settleSave({ ok: false, error: 'The host connection was closed.' });
            for (const p of aiPending.values()) {
                clearTimeout(p.timer);
                p.resolve({ ok: false, error: 'The host connection was closed.' });
            }
            for (const p of includePending.values()) {
                clearTimeout(p.timer);
                p.resolve(null);
            }
            aiPending.clear();
            includePending.clear();
        },
    };
}
//# sourceMappingURL=file-side.js.map