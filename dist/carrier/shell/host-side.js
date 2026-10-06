"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.embedCarrierFrame = embedCarrierFrame;
/**
 * The HOST side of the orz host protocols (spec/host-protocols.md): what an
 * app that embeds an ASSEMBLED file in an iframe uses to receive its saves,
 * offer AI operations and resolve includes. (An app that mounts the editor
 * component uses the FC-19 hooks instead.)
 *
 * Mirrored security rules:
 * - a message is read only when `event.source === iframe.contentWindow`;
 * - with `expectedOrigin`, only that origin is read and hellos are posted to
 *   it; without it, the origin of the first ready is pinned (a frame that
 *   later navigates elsewhere is not heard again);
 * - nothing is active until the matching ready: a save, dirty, AI or include
 *   message before it is ignored;
 * - payloads are data: strings are copied, nothing is evaluated;
 * - repeated readies (the hello retry makes them normal) report readiness
 *   once.
 *
 * Hellos are posted at once, on every iframe `load` (a reload is a new
 * document that must handshake again), and every `helloIntervalMs` until each
 * protocol is ready or `helloMaxMs` passes.
 */
const protocol_js_1 = require("./protocol.js");
const types_js_1 = require("./types.js");
function embedCarrierFrame(iframe, opts) {
    const win = opts.window ?? (0, types_js_1.globalWindow)();
    const interval = opts.helloIntervalMs ?? protocol_js_1.HELLO_INTERVAL_MS;
    const maxMs = opts.helloMaxMs ?? protocol_js_1.HELLO_MAX_MS;
    const offered = [protocol_js_1.SAVE_PROTOCOL];
    if (opts.ai)
        offered.push(protocol_js_1.AI_PROTOCOL);
    if (opts.include)
        offered.push(protocol_js_1.INCLUDE_PROTOCOL);
    const operations = (opts.ai?.operations ?? []).map((o) => ({ id: String(o.id), title: String(o.title), selection: o.selection === true }));
    let pinned = opts.expectedOrigin ?? null;
    const ready = new Set();
    let kind = null;
    let dirty = false;
    let disposed = false;
    let helloTimer = null;
    let deadline = null;
    const frameWindow = () => iframe.contentWindow;
    const post = (target, message) => {
        if (!target)
            return;
        try {
            target.postMessage(message, (0, protocol_js_1.targetFor)(pinned));
        }
        catch {
            /* the frame went away */
        }
    };
    const hello = () => {
        const target = frameWindow();
        if (!ready.has(protocol_js_1.SAVE_PROTOCOL))
            post(target, { type: protocol_js_1.MSG.hello, protocol: protocol_js_1.SAVE_PROTOCOL, version: protocol_js_1.PROTOCOL_VERSION });
        if (opts.ai && !ready.has(protocol_js_1.AI_PROTOCOL))
            post(target, { type: protocol_js_1.MSG.aiHello, protocol: protocol_js_1.AI_PROTOCOL, version: protocol_js_1.PROTOCOL_VERSION, operations: operations.map((o) => ({ ...o })) });
        if (opts.include && !ready.has(protocol_js_1.INCLUDE_PROTOCOL))
            post(target, { type: protocol_js_1.MSG.includeHello, protocol: protocol_js_1.INCLUDE_PROTOCOL, version: protocol_js_1.PROTOCOL_VERSION });
    };
    const stopHello = () => {
        if (helloTimer !== null)
            clearInterval(helloTimer);
        if (deadline !== null)
            clearTimeout(deadline);
        helloTimer = null;
        deadline = null;
    };
    const startHello = () => {
        stopHello();
        if (disposed)
            return;
        hello();
        helloTimer = setInterval(() => {
            if (offered.every((p) => ready.has(p)))
                stopHello();
            else
                hello();
        }, interval);
        deadline = setTimeout(() => {
            stopHello();
            for (const p of offered)
                if (!ready.has(p)) {
                    try {
                        opts.onHelloTimeout?.(p);
                    }
                    catch { /* ignore */ }
                }
        }, maxMs);
    };
    const onLoad = () => {
        // a (re)loaded frame is a new document: it must say ready again
        ready.clear();
        kind = null;
        dirty = false;
        startHello();
    };
    const markReady = (protocol, eventOrigin, k) => {
        if (pinned === null)
            pinned = eventOrigin;
        if (ready.has(protocol))
            return; // idempotent: the retry loop makes duplicates normal
        ready.add(protocol);
        if (k !== undefined)
            kind = k;
        if (offered.every((p) => ready.has(p)))
            stopHello();
        try {
            opts.onReady?.({ protocol, version: protocol_js_1.PROTOCOL_VERSION, ...(k !== undefined ? { kind: k } : {}) });
        }
        catch { /* ignore */ }
    };
    const reply = (source, message) => post(source, message);
    const onMessage = (event) => {
        if (disposed)
            return;
        const source = frameWindow();
        if (!source || event.source !== source)
            return;
        if (pinned !== null && pinned !== 'null' && event.origin !== pinned)
            return;
        const m = event.data;
        if (!(0, protocol_js_1.isMessage)(m))
            return;
        switch (m.type) {
            case protocol_js_1.MSG.ready:
                if (m.protocol !== protocol_js_1.SAVE_PROTOCOL || m.version !== protocol_js_1.PROTOCOL_VERSION)
                    return;
                markReady(protocol_js_1.SAVE_PROTOCOL, event.origin, typeof m.kind === 'string' ? m.kind : '');
                return;
            case protocol_js_1.MSG.aiReady:
                if (!opts.ai || m.protocol !== protocol_js_1.AI_PROTOCOL || m.version !== protocol_js_1.PROTOCOL_VERSION)
                    return;
                markReady(protocol_js_1.AI_PROTOCOL, event.origin);
                return;
            case protocol_js_1.MSG.includeReady:
                if (!opts.include || m.protocol !== protocol_js_1.INCLUDE_PROTOCOL || m.version !== protocol_js_1.PROTOCOL_VERSION)
                    return;
                markReady(protocol_js_1.INCLUDE_PROTOCOL, event.origin, typeof m.kind === 'string' ? m.kind : undefined);
                return;
            case protocol_js_1.MSG.dirty:
                if (!ready.has(protocol_js_1.SAVE_PROTOCOL) || m.protocol !== protocol_js_1.SAVE_PROTOCOL)
                    return;
                dirty = m.dirty === true;
                try {
                    opts.onDirty?.(dirty);
                }
                catch { /* ignore */ }
                return;
            case protocol_js_1.MSG.save: {
                if (!ready.has(protocol_js_1.SAVE_PROTOCOL) || m.protocol !== protocol_js_1.SAVE_PROTOCOL)
                    return;
                const html = typeof m.html === 'string' ? m.html : '';
                const payload = { source: typeof m.source === 'string' ? m.source : '', html };
                if (typeof m.theme === 'string')
                    payload.theme = m.theme;
                if (!html) {
                    reply(source, { type: protocol_js_1.MSG.saved, ok: false, error: 'The save arrived empty.' });
                    return;
                }
                let pending;
                try {
                    pending = Promise.resolve(opts.onSave(payload));
                }
                catch (e) {
                    pending = Promise.reject(e);
                }
                void pending.then((r) => reply(source, r && r.ok === true ? { type: protocol_js_1.MSG.saved, ok: true } : { type: protocol_js_1.MSG.saved, ok: false, error: typeof r?.error === 'string' && r.error ? r.error : 'The host could not save.' }), () => reply(source, { type: protocol_js_1.MSG.saved, ok: false, error: 'The host could not save.' }));
                return;
            }
            case protocol_js_1.MSG.aiRequest: {
                if (!opts.ai || !ready.has(protocol_js_1.AI_PROTOCOL) || m.protocol !== protocol_js_1.AI_PROTOCOL || !(0, protocol_js_1.validRequestId)(m.requestId))
                    return;
                const requestId = m.requestId;
                const result = (r) => reply(source, {
                    type: protocol_js_1.MSG.aiResult, protocol: protocol_js_1.AI_PROTOCOL, version: protocol_js_1.PROTOCOL_VERSION, requestId, ok: r.ok,
                    ...(r.ok && typeof r.proposed === 'string' ? { proposed: r.proposed } : {}),
                    ...(!r.ok ? { error: typeof r.error === 'string' && r.error ? r.error : 'The host could not run that.' } : {}),
                });
                const op = typeof m.op === 'string' ? m.op : '';
                const text = typeof m.text === 'string' ? m.text : '';
                if (!operations.some((o) => o.id === op)) {
                    result({ ok: false, error: 'Unknown operation.' });
                    return;
                }
                if (!text) {
                    result({ ok: false, error: 'The AI request arrived empty.' });
                    return;
                }
                let pending;
                try {
                    pending = Promise.resolve(opts.ai.run({ op, text, selection: m.selection === true }));
                }
                catch (e) {
                    pending = Promise.reject(e);
                }
                void pending.then((r) => result(r && r.ok === true && typeof r.proposed === 'string' ? { ok: true, proposed: r.proposed } : { ok: false, error: r?.error }), () => result({ ok: false }));
                return;
            }
            case protocol_js_1.MSG.includeRequest: {
                if (!opts.include || !ready.has(protocol_js_1.INCLUDE_PROTOCOL) || m.protocol !== protocol_js_1.INCLUDE_PROTOCOL || !(0, protocol_js_1.validRequestId)(m.requestId))
                    return;
                const requestId = m.requestId;
                const result = (markdown, error) => reply(source, {
                    type: protocol_js_1.MSG.includeResult, protocol: protocol_js_1.INCLUDE_PROTOCOL, version: protocol_js_1.PROTOCOL_VERSION, requestId,
                    ...(markdown !== null ? { ok: true, markdown } : { ok: false, error: error ?? 'Not resolved.' }),
                });
                const url = typeof m.url === 'string' ? m.url : '';
                if (!url) {
                    result(null, 'The include request arrived empty.');
                    return;
                }
                let pending;
                try {
                    pending = Promise.resolve(opts.include.resolve(url));
                }
                catch (e) {
                    pending = Promise.reject(e);
                }
                void pending.then((md) => result(typeof md === 'string' ? md : null), () => result(null));
                return;
            }
            default:
        }
    };
    win?.addEventListener('message', onMessage);
    iframe.addEventListener('load', onLoad);
    startHello();
    return {
        ready: (protocol) => (protocol ? ready.has(protocol) : offered.every((p) => ready.has(p))),
        kind: () => kind,
        dirty: () => dirty,
        origin: () => pinned,
        dispose() {
            if (disposed)
                return;
            disposed = true;
            stopHello();
            win?.removeEventListener('message', onMessage);
            iframe.removeEventListener('load', onLoad);
        },
    };
}
//# sourceMappingURL=host-side.js.map