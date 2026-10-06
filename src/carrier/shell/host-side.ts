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
import {
  AI_PROTOCOL, HELLO_INTERVAL_MS, HELLO_MAX_MS, INCLUDE_PROTOCOL, MSG, PROTOCOL_VERSION, SAVE_PROTOCOL,
  isMessage, targetFor, validRequestId,
  type AiOperation, type AiRequest, type AiResult, type HostProtocol, type SaveAck, type SavePayload,
} from './protocol.js';
import { globalWindow, type IframeLike, type MessageEventLike, type MessageWindow, type PostTarget } from './types.js';

export interface EmbedOptions {
  /** Persist a save the file asked for; the outcome becomes `orz-host-saved`. */
  onSave(payload: SavePayload): Promise<SaveAck>;
  /** Offer `orz-host-ai@1` with these operations. */
  ai?: {
    operations: AiOperation[];
    run(request: AiRequest): Promise<AiResult>;
  };
  /** Offer `orz-host-include@1`: resolve a URL to Markdown under the host's own policy (`null` = declined). */
  include?: {
    resolve(url: string): Promise<string | null>;
  };
  /** The frame's origin. Recommended; `"null"` for an opaque (sandboxed/srcdoc) frame. */
  expectedOrigin?: string;
  /** Called once per protocol per loaded document, at its ready. */
  onReady?(info: { protocol: HostProtocol; version: number; kind?: string }): void;
  /** The file's unsaved-changes signal. */
  onDirty?(dirty: boolean): void;
  /** A protocol got no ready within `helloMaxMs` (the file predates it or declines it). */
  onHelloTimeout?(protocol: HostProtocol): void;
  /** The window that receives the frame's messages (default: the global `window`). */
  window?: MessageWindow;
  helloIntervalMs?: number;
  helloMaxMs?: number;
}

export interface CarrierFrame {
  /** True when every offered protocol is ready (or the given one). */
  ready(protocol?: HostProtocol): boolean;
  /** The kind the file reported (`orz-host-ready`), or null. */
  kind(): string | null;
  /** The file's last dirty signal. */
  dirty(): boolean;
  /** The pinned (or expected) frame origin, or null. */
  origin(): string | null;
  dispose(): void;
}

export function embedCarrierFrame(iframe: IframeLike, opts: EmbedOptions): CarrierFrame {
  const win = opts.window ?? globalWindow<MessageWindow>();
  const interval = opts.helloIntervalMs ?? HELLO_INTERVAL_MS;
  const maxMs = opts.helloMaxMs ?? HELLO_MAX_MS;
  const offered: HostProtocol[] = [SAVE_PROTOCOL];
  if (opts.ai) offered.push(AI_PROTOCOL);
  if (opts.include) offered.push(INCLUDE_PROTOCOL);
  const operations: AiOperation[] = (opts.ai?.operations ?? []).map((o) => ({ id: String(o.id), title: String(o.title), selection: o.selection === true }));

  let pinned: string | null = opts.expectedOrigin ?? null;
  const ready = new Set<HostProtocol>();
  let kind: string | null = null;
  let dirty = false;
  let disposed = false;
  let helloTimer: ReturnType<typeof setInterval> | null = null;
  let deadline: ReturnType<typeof setTimeout> | null = null;

  const frameWindow = (): PostTarget | null => iframe.contentWindow;

  const post = (target: PostTarget | null, message: Record<string, unknown>): void => {
    if (!target) return;
    try {
      target.postMessage(message, targetFor(pinned));
    } catch {
      /* the frame went away */
    }
  };

  const hello = (): void => {
    const target = frameWindow();
    if (!ready.has(SAVE_PROTOCOL)) post(target, { type: MSG.hello, protocol: SAVE_PROTOCOL, version: PROTOCOL_VERSION });
    if (opts.ai && !ready.has(AI_PROTOCOL)) post(target, { type: MSG.aiHello, protocol: AI_PROTOCOL, version: PROTOCOL_VERSION, operations: operations.map((o) => ({ ...o })) });
    if (opts.include && !ready.has(INCLUDE_PROTOCOL)) post(target, { type: MSG.includeHello, protocol: INCLUDE_PROTOCOL, version: PROTOCOL_VERSION });
  };

  const stopHello = (): void => {
    if (helloTimer !== null) clearInterval(helloTimer);
    if (deadline !== null) clearTimeout(deadline);
    helloTimer = null;
    deadline = null;
  };

  const startHello = (): void => {
    stopHello();
    if (disposed) return;
    hello();
    helloTimer = setInterval(() => {
      if (offered.every((p) => ready.has(p))) stopHello();
      else hello();
    }, interval);
    deadline = setTimeout(() => {
      stopHello();
      for (const p of offered) if (!ready.has(p)) {
        try { opts.onHelloTimeout?.(p); } catch { /* ignore */ }
      }
    }, maxMs);
  };

  const onLoad = (): void => {
    // a (re)loaded frame is a new document: it must say ready again
    ready.clear();
    kind = null;
    dirty = false;
    startHello();
  };

  const markReady = (protocol: HostProtocol, eventOrigin: string, k?: string): void => {
    if (pinned === null) pinned = eventOrigin;
    if (ready.has(protocol)) return; // idempotent: the retry loop makes duplicates normal
    ready.add(protocol);
    if (k !== undefined) kind = k;
    if (offered.every((p) => ready.has(p))) stopHello();
    try { opts.onReady?.({ protocol, version: PROTOCOL_VERSION, ...(k !== undefined ? { kind: k } : {}) }); } catch { /* ignore */ }
  };

  const reply = (source: PostTarget, message: Record<string, unknown>): void => post(source, message);

  const onMessage = (event: MessageEventLike): void => {
    if (disposed) return;
    const source = frameWindow();
    if (!source || event.source !== source) return;
    if (pinned !== null && pinned !== 'null' && event.origin !== pinned) return;
    const m = event.data;
    if (!isMessage(m)) return;
    switch (m.type) {
      case MSG.ready:
        if (m.protocol !== SAVE_PROTOCOL || m.version !== PROTOCOL_VERSION) return;
        markReady(SAVE_PROTOCOL, event.origin, typeof m.kind === 'string' ? m.kind : '');
        return;
      case MSG.aiReady:
        if (!opts.ai || m.protocol !== AI_PROTOCOL || m.version !== PROTOCOL_VERSION) return;
        markReady(AI_PROTOCOL, event.origin);
        return;
      case MSG.includeReady:
        if (!opts.include || m.protocol !== INCLUDE_PROTOCOL || m.version !== PROTOCOL_VERSION) return;
        markReady(INCLUDE_PROTOCOL, event.origin, typeof m.kind === 'string' ? m.kind : undefined);
        return;
      case MSG.dirty:
        if (!ready.has(SAVE_PROTOCOL) || m.protocol !== SAVE_PROTOCOL) return;
        dirty = m.dirty === true;
        try { opts.onDirty?.(dirty); } catch { /* ignore */ }
        return;
      case MSG.save: {
        if (!ready.has(SAVE_PROTOCOL) || m.protocol !== SAVE_PROTOCOL) return;
        const html = typeof m.html === 'string' ? m.html : '';
        const payload: SavePayload = { source: typeof m.source === 'string' ? m.source : '', html };
        if (typeof m.theme === 'string') payload.theme = m.theme;
        if (!html) {
          reply(source, { type: MSG.saved, ok: false, error: 'The save arrived empty.' });
          return;
        }
        let pending: Promise<SaveAck>;
        try { pending = Promise.resolve(opts.onSave(payload)); } catch (e) { pending = Promise.reject(e); }
        void pending.then(
          (r) => reply(source, r && r.ok === true ? { type: MSG.saved, ok: true } : { type: MSG.saved, ok: false, error: typeof r?.error === 'string' && r.error ? r.error : 'The host could not save.' }),
          () => reply(source, { type: MSG.saved, ok: false, error: 'The host could not save.' }),
        );
        return;
      }
      case MSG.aiRequest: {
        if (!opts.ai || !ready.has(AI_PROTOCOL) || m.protocol !== AI_PROTOCOL || !validRequestId(m.requestId)) return;
        const requestId = m.requestId;
        const result = (r: AiResult): void => reply(source, {
          type: MSG.aiResult, protocol: AI_PROTOCOL, version: PROTOCOL_VERSION, requestId, ok: r.ok,
          ...(r.ok && typeof r.proposed === 'string' ? { proposed: r.proposed } : {}),
          ...(!r.ok ? { error: typeof r.error === 'string' && r.error ? r.error : 'The host could not run that.' } : {}),
        });
        const op = typeof m.op === 'string' ? m.op : '';
        const text = typeof m.text === 'string' ? m.text : '';
        if (!operations.some((o) => o.id === op)) { result({ ok: false, error: 'Unknown operation.' }); return; }
        if (!text) { result({ ok: false, error: 'The AI request arrived empty.' }); return; }
        let pending: Promise<AiResult>;
        try { pending = Promise.resolve(opts.ai.run({ op, text, selection: m.selection === true })); } catch (e) { pending = Promise.reject(e); }
        void pending.then(
          (r) => result(r && r.ok === true && typeof r.proposed === 'string' ? { ok: true, proposed: r.proposed } : { ok: false, error: r?.error }),
          () => result({ ok: false }),
        );
        return;
      }
      case MSG.includeRequest: {
        if (!opts.include || !ready.has(INCLUDE_PROTOCOL) || m.protocol !== INCLUDE_PROTOCOL || !validRequestId(m.requestId)) return;
        const requestId = m.requestId;
        const result = (markdown: string | null, error?: string): void => reply(source, {
          type: MSG.includeResult, protocol: INCLUDE_PROTOCOL, version: PROTOCOL_VERSION, requestId,
          ...(markdown !== null ? { ok: true, markdown } : { ok: false, error: error ?? 'Not resolved.' }),
        });
        const url = typeof m.url === 'string' ? m.url : '';
        if (!url) { result(null, 'The include request arrived empty.'); return; }
        let pending: Promise<string | null>;
        try { pending = Promise.resolve(opts.include.resolve(url)); } catch (e) { pending = Promise.reject(e); }
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
      if (disposed) return;
      disposed = true;
      stopHello();
      win?.removeEventListener('message', onMessage);
      iframe.removeEventListener('load', onLoad);
    },
  };
}
