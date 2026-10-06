/**
 * The orz host protocols, version 1 (`orz-host-save@1`, `orz-host-ai@1`,
 * `orz-host-include@1`): message names, payload types, timeouts and the kind
 * registry, shared by the FILE side (`connectHost`, ./file-side.ts) and the
 * HOST side (`embedCarrierFrame`, ./host-side.ts). Canonical spec:
 * spec/host-protocols.md.
 *
 * Constants and pure helpers only: nothing here touches a window.
 */

/** The carrier kind registry (FC-17): the `kind` a file reports in its ready messages. */
export type HostKind = 'md' | 'slides' | 'paged' | 'poster';
export const HOST_KINDS: readonly HostKind[] = ['md', 'slides', 'paged', 'poster'];

/** The assembled file's extension per kind (FC-18 §3; poster keeps its own). */
export const KIND_EXTENSIONS: Readonly<Record<HostKind, string>> = {
  md: '.md.html',
  slides: '.slides.html',
  paged: '.paged.html',
  poster: '.poster.html',
};

export const SAVE_PROTOCOL = 'orz-host-save';
export const AI_PROTOCOL = 'orz-host-ai';
export const INCLUDE_PROTOCOL = 'orz-host-include';
export type HostProtocol = typeof SAVE_PROTOCOL | typeof AI_PROTOCOL | typeof INCLUDE_PROTOCOL;

/** The only version both sides speak. A peer announcing a higher one is answered with 1. */
export const PROTOCOL_VERSION = 1;

/** Message `type` values. */
export const MSG = {
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
} as const;

/** File side: a host save with no `orz-host-saved` within this time fails (the document stays dirty). */
export const SAVE_ACK_TIMEOUT_MS = 10_000;
/** File side: an AI request with no result within this time fails. */
export const AI_TIMEOUT_MS = 30_000;
/** File side: an include request with no result within this time resolves as unresolved. */
export const INCLUDE_TIMEOUT_MS = 30_000;
/** Host side: hello retry cadence and give-up horizon (files behind a slow CDN boot late). */
export const HELLO_INTERVAL_MS = 400;
export const HELLO_MAX_MS = 20_000;

/** What a file sends with `orz-host-save`. For a format-1 file `source` is the exact text twin. */
export interface SavePayload {
  source: string;
  html: string;
  theme?: string;
}

/** The outcome of a save, as `orz-host-saved` carries it. */
export interface SaveAck {
  ok: boolean;
  error?: string;
}

/** An operation a host offers through `orz-host-ai@1`. */
export interface AiOperation {
  id: string;
  title: string;
  /** True: the operation runs on a selected passage. */
  selection: boolean;
}

export interface AiRequest {
  op: string;
  text: string;
  selection: boolean;
}

export interface AiResult {
  ok: boolean;
  proposed?: string;
  error?: string;
}

/** A plain object, read as data. */
export type Message = Record<string, unknown>;

export function isMessage(data: unknown): data is Message {
  return typeof data === 'object' && data !== null && !Array.isArray(data);
}

/** A hello is valid when it names the protocol and a version ≥ 1 (absent is read as 1). */
export function validHello(m: Message, protocol: HostProtocol): boolean {
  if (m.protocol !== protocol) return false;
  const v = m.version;
  return v === undefined || (typeof v === 'number' && v >= 1);
}

/** Operations are copied field by field; anything without a string id and title is dropped. */
export function readOperations(raw: unknown): AiOperation[] {
  if (!Array.isArray(raw)) return [];
  const out: AiOperation[] = [];
  for (const o of raw) {
    if (!isMessage(o) || typeof o.id !== 'string' || !o.id || typeof o.title !== 'string' || !o.title) continue;
    out.push({ id: o.id, title: o.title, selection: o.selection === true });
  }
  return out;
}

/** `postMessage` rejects `"null"` (an opaque origin) as a target; the spec falls back to `"*"` there. */
export function targetFor(origin: string | null | undefined): string {
  return origin && origin !== 'null' ? origin : '*';
}

/** A request id: a string or a finite number, echoed back unchanged. */
export function validRequestId(id: unknown): id is string | number {
  return (typeof id === 'string' && id.length > 0 && id.length <= 200) || (typeof id === 'number' && Number.isFinite(id));
}
