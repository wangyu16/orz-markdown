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
import {
  AI_PROTOCOL, AI_TIMEOUT_MS, INCLUDE_PROTOCOL, INCLUDE_TIMEOUT_MS, MSG, PROTOCOL_VERSION, SAVE_ACK_TIMEOUT_MS, SAVE_PROTOCOL,
  isMessage, readOperations, targetFor, validHello,
  type AiOperation, type AiResult, type HostKind, type HostProtocol, type SaveAck, type SavePayload,
} from './protocol.js';
import { globalWindow, type MessageEventLike, type MessageWindow, type PostTarget } from './types.js';

export interface ConnectHostOptions {
  /** The kind this file reports in `orz-host-ready` / `orz-host-include-ready` (FC-17). */
  kind: HostKind;
  /** The file's window (default: the global `window`). */
  window?: MessageWindow;
  /** Called once per protocol, at its first accepted hello. */
  onReady?(protocol: HostProtocol, origin: string): void;
  /** Called with the outcome of every host save (acknowledged, refused or timed out). */
  onSaveResult?(ack: SaveAck): void;
  /** Opt in to `orz-host-ai@1`. Without it an AI hello is not answered (declined). */
  ai?: {
    /** The host's operations, at each AI hello (copied as data). */
    onOperations(operations: AiOperation[]): void;
  };
  /** Opt in to `orz-host-include@1`. Without it an include hello is not answered (declined). */
  include?: {
    /** The host can resolve includes now (re-render the preview). Called once. */
    onAvailable(): void;
  };
  /** Override the protocol timeouts (ms). */
  timeouts?: { save?: number; ai?: number; include?: number };
}

export interface HostConnection {
  /** True once a host said `orz-host-hello` (save is routed to the host). */
  connected(): boolean;
  /** Which protocols completed their handshake. */
  protocols(): { save: boolean; ai: boolean; include: boolean };
  /** The pinned host origin, or null before any hello. */
  origin(): string | null;
  /** The AI operations the host offered (empty without an AI host). */
  aiOperations(): AiOperation[];
  /** Post `orz-host-save` and wait for `orz-host-saved` (never rejects). */
  save(payload: SavePayload): Promise<SaveAck>;
  /** Post `orz-host-ai-request` and wait for the result (never rejects). */
  requestAi(op: string, text: string, selection?: boolean): Promise<AiResult>;
  /** Ask the host for an include; `null` when unresolved, declined, timed out or unhosted. */
  requestInclude(url: string): Promise<string | null>;
  /** Report the edit state (`orz-host-dirty` once connected; replayed at a later hello). */
  setDirty(dirty: boolean): void;
  dispose(): void;
}

interface Pending<T> {
  resolve(v: T): void;
  timer: ReturnType<typeof setTimeout>;
}

export const NOT_CONNECTED = 'not-connected';

export function connectHost(opts: ConnectHostOptions): HostConnection {
  const win = opts.window ?? globalWindow<MessageWindow>();
  const parent = (win?.parent ?? null) as PostTarget | null;
  const framed = !!win && !!parent && (parent as unknown) !== (win as unknown);
  const timeouts = {
    save: opts.timeouts?.save ?? SAVE_ACK_TIMEOUT_MS,
    ai: opts.timeouts?.ai ?? AI_TIMEOUT_MS,
    include: opts.timeouts?.include ?? INCLUDE_TIMEOUT_MS,
  };

  let origin: string | null = null;
  const active = { save: false, ai: false, include: false };
  let operations: AiOperation[] = [];
  let dirty = false;
  let disposed = false;
  let seq = 0;
  let pendingSave: Pending<SaveAck> | null = null;
  const aiPending = new Map<string, Pending<AiResult>>();
  const includePending = new Map<string, Pending<string | null>>();
  const includeInflight = new Map<string, Promise<string | null>>();

  const post = (message: Record<string, unknown>): void => {
    if (!parent) return;
    try {
      parent.postMessage(message, targetFor(origin));
    } catch {
      /* a closed host is not the document's problem */
    }
  };

  const postDirty = (): void => post({ type: MSG.dirty, protocol: SAVE_PROTOCOL, version: PROTOCOL_VERSION, dirty });

  const settleSave = (ack: SaveAck): void => {
    if (!pendingSave) return;
    const p = pendingSave;
    pendingSave = null;
    clearTimeout(p.timer);
    p.resolve(ack);
    try { opts.onSaveResult?.(ack); } catch { /* a caller's callback cannot break the protocol */ }
  };

  const first = (protocol: HostProtocol, key: keyof typeof active, eventOrigin: string): boolean => {
    if (origin === null) origin = eventOrigin;
    const was = active[key];
    active[key] = true;
    if (!was) {
      try { opts.onReady?.(protocol, eventOrigin); } catch { /* ignore */ }
    }
    return !was;
  };

  const onMessage = (event: MessageEventLike): void => {
    if (disposed || !framed || event.source !== parent) return;
    if (origin !== null && origin !== 'null' && event.origin !== origin) return;
    const m = event.data;
    if (!isMessage(m)) return;
    switch (m.type) {
      case MSG.hello: {
        if (!validHello(m, SAVE_PROTOCOL)) return;
        first(SAVE_PROTOCOL, 'save', event.origin);
        // the highest version we support ≤ the host's: we speak only 1
        post({ type: MSG.ready, protocol: SAVE_PROTOCOL, version: PROTOCOL_VERSION, kind: opts.kind });
        if (dirty) postDirty();
        return;
      }
      case MSG.saved: {
        if (!active.save || !pendingSave) return;
        if (m.ok === true) settleSave({ ok: true });
        else settleSave({ ok: false, error: typeof m.error === 'string' && m.error ? m.error : 'The host could not save.' });
        return;
      }
      case MSG.aiHello: {
        if (!opts.ai || !validHello(m, AI_PROTOCOL)) return;
        first(AI_PROTOCOL, 'ai', event.origin);
        operations = readOperations(m.operations);
        post({ type: MSG.aiReady, protocol: AI_PROTOCOL, version: PROTOCOL_VERSION });
        try { opts.ai.onOperations(operations.map((o) => ({ ...o }))); } catch { /* ignore */ }
        return;
      }
      case MSG.aiResult: {
        if (!active.ai || typeof m.requestId !== 'string') return;
        const p = aiPending.get(m.requestId);
        if (!p) return;
        aiPending.delete(m.requestId);
        clearTimeout(p.timer);
        if (m.ok === true && typeof m.proposed === 'string') p.resolve({ ok: true, proposed: m.proposed });
        else p.resolve({ ok: false, error: typeof m.error === 'string' && m.error ? m.error : 'The host returned no proposal.' });
        return;
      }
      case MSG.includeHello: {
        if (!opts.include || !validHello(m, INCLUDE_PROTOCOL)) return;
        const isFirst = first(INCLUDE_PROTOCOL, 'include', event.origin);
        post({ type: MSG.includeReady, protocol: INCLUDE_PROTOCOL, version: PROTOCOL_VERSION, kind: opts.kind });
        if (isFirst) {
          try { opts.include.onAvailable(); } catch { /* ignore */ }
        }
        return;
      }
      case MSG.includeResult: {
        if (!active.include || typeof m.requestId !== 'string') return;
        const p = includePending.get(m.requestId);
        if (!p) return;
        includePending.delete(m.requestId);
        clearTimeout(p.timer);
        p.resolve(m.ok === true && typeof m.markdown === 'string' ? m.markdown : null);
        return;
      }
      default:
    }
  };

  if (framed) win!.addEventListener('message', onMessage);

  return {
    connected: () => active.save,
    protocols: () => ({ ...active }),
    origin: () => origin,
    aiOperations: () => operations.map((o) => ({ ...o })),

    save(payload) {
      if (disposed || !active.save) return Promise.resolve({ ok: false, error: NOT_CONNECTED });
      if (pendingSave) return Promise.resolve({ ok: false, error: 'A save is already in flight.' });
      if (typeof payload?.source !== 'string' || typeof payload.html !== 'string') return Promise.resolve({ ok: false, error: 'source and html must be strings.' });
      return new Promise<SaveAck>((resolve) => {
        const timer = setTimeout(() => settleSave({ ok: false, error: 'No response from the host.' }), timeouts.save);
        pendingSave = { resolve, timer };
        post({
          type: MSG.save, protocol: SAVE_PROTOCOL, version: PROTOCOL_VERSION,
          source: payload.source, html: payload.html,
          ...(typeof payload.theme === 'string' ? { theme: payload.theme } : {}),
        });
      });
    },

    requestAi(op, text, selection = false) {
      if (disposed || !active.ai) return Promise.resolve({ ok: false, error: 'No AI host.' });
      if (!operations.some((o) => o.id === op)) return Promise.resolve({ ok: false, error: 'Unknown operation.' });
      if (typeof text !== 'string') return Promise.resolve({ ok: false, error: 'text must be a string.' });
      const requestId = `ai${++seq}`;
      return new Promise<AiResult>((resolve) => {
        const timer = setTimeout(() => {
          if (aiPending.delete(requestId)) resolve({ ok: false, error: 'No response from the host.' });
        }, timeouts.ai);
        aiPending.set(requestId, { resolve, timer });
        post({ type: MSG.aiRequest, protocol: AI_PROTOCOL, version: PROTOCOL_VERSION, requestId, op, text, selection: selection === true });
      });
    },

    requestInclude(url) {
      if (disposed || !active.include || typeof url !== 'string' || !url) return Promise.resolve(null);
      const inflight = includeInflight.get(url);
      if (inflight) return inflight;
      const requestId = `inc${++seq}`;
      const promise = new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => {
          if (includePending.delete(requestId)) resolve(null);
        }, timeouts.include);
        includePending.set(requestId, { resolve, timer });
        post({ type: MSG.includeRequest, protocol: INCLUDE_PROTOCOL, version: PROTOCOL_VERSION, requestId, url });
      }).finally(() => includeInflight.delete(url));
      includeInflight.set(url, promise);
      return promise;
    },

    setDirty(d) {
      const next = d === true;
      if (next === dirty) return;
      dirty = next;
      if (active.save && !disposed) postDirty();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      if (framed) win!.removeEventListener('message', onMessage);
      settleSave({ ok: false, error: 'The host connection was closed.' });
      for (const p of aiPending.values()) { clearTimeout(p.timer); p.resolve({ ok: false, error: 'The host connection was closed.' }); }
      for (const p of includePending.values()) { clearTimeout(p.timer); p.resolve(null); }
      aiPending.clear();
      includePending.clear();
    },
  };
}
