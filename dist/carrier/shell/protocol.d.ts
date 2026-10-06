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
export declare const HOST_KINDS: readonly HostKind[];
/** The assembled file's extension per kind (FC-18 §3; poster keeps its own). */
export declare const KIND_EXTENSIONS: Readonly<Record<HostKind, string>>;
export declare const SAVE_PROTOCOL = "orz-host-save";
export declare const AI_PROTOCOL = "orz-host-ai";
export declare const INCLUDE_PROTOCOL = "orz-host-include";
export type HostProtocol = typeof SAVE_PROTOCOL | typeof AI_PROTOCOL | typeof INCLUDE_PROTOCOL;
/** The only version both sides speak. A peer announcing a higher one is answered with 1. */
export declare const PROTOCOL_VERSION = 1;
/** Message `type` values. */
export declare const MSG: {
    readonly hello: "orz-host-hello";
    readonly ready: "orz-host-ready";
    readonly save: "orz-host-save";
    readonly saved: "orz-host-saved";
    readonly dirty: "orz-host-dirty";
    readonly aiHello: "orz-host-ai-hello";
    readonly aiReady: "orz-host-ai-ready";
    readonly aiRequest: "orz-host-ai-request";
    readonly aiResult: "orz-host-ai-result";
    readonly includeHello: "orz-host-include-hello";
    readonly includeReady: "orz-host-include-ready";
    readonly includeRequest: "orz-host-include-request";
    readonly includeResult: "orz-host-include-result";
};
/** File side: a host save with no `orz-host-saved` within this time fails (the document stays dirty). */
export declare const SAVE_ACK_TIMEOUT_MS = 10000;
/** File side: an AI request with no result within this time fails. */
export declare const AI_TIMEOUT_MS = 30000;
/** File side: an include request with no result within this time resolves as unresolved. */
export declare const INCLUDE_TIMEOUT_MS = 30000;
/** Host side: hello retry cadence and give-up horizon (files behind a slow CDN boot late). */
export declare const HELLO_INTERVAL_MS = 400;
export declare const HELLO_MAX_MS = 20000;
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
export declare function isMessage(data: unknown): data is Message;
/** A hello is valid when it names the protocol and a version ≥ 1 (absent is read as 1). */
export declare function validHello(m: Message, protocol: HostProtocol): boolean;
/** Operations are copied field by field; anything without a string id and title is dropped. */
export declare function readOperations(raw: unknown): AiOperation[];
/** `postMessage` rejects `"null"` (an opaque origin) as a target; the spec falls back to `"*"` there. */
export declare function targetFor(origin: string | null | undefined): string;
/** A request id: a string or a finite number, echoed back unchanged. */
export declare function validRequestId(id: unknown): id is string | number;
//# sourceMappingURL=protocol.d.ts.map