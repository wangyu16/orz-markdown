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
import { type AiOperation, type AiRequest, type AiResult, type HostProtocol, type SaveAck, type SavePayload } from './protocol.js';
import { type IframeLike, type MessageWindow } from './types.js';
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
    onReady?(info: {
        protocol: HostProtocol;
        version: number;
        kind?: string;
    }): void;
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
export declare function embedCarrierFrame(iframe: IframeLike, opts: EmbedOptions): CarrierFrame;
//# sourceMappingURL=host-side.d.ts.map