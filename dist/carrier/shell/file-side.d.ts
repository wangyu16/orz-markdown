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
import { type AiOperation, type AiResult, type HostKind, type HostProtocol, type SaveAck, type SavePayload } from './protocol.js';
import { type MessageWindow } from './types.js';
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
    timeouts?: {
        save?: number;
        ai?: number;
        include?: number;
    };
}
export interface HostConnection {
    /** True once a host said `orz-host-hello` (save is routed to the host). */
    connected(): boolean;
    /** Which protocols completed their handshake. */
    protocols(): {
        save: boolean;
        ai: boolean;
        include: boolean;
    };
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
export declare const NOT_CONNECTED = "not-connected";
export declare function connectHost(opts: ConnectHostOptions): HostConnection;
//# sourceMappingURL=file-side.d.ts.map