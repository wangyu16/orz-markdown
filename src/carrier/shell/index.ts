/**
 * `orz-markdown/carrier/shell` — the browser runtime every assembled orz file
 * shares (FD-03): the standalone save, reader preferences, and both sides of
 * the host protocols `orz-host-save@1`, `orz-host-ai@1`, `orz-host-include@1`.
 *
 * Specs: spec/shell-runtime.md, spec/host-protocols.md. Parser-free (it
 * imports nothing from the Markdown parser or the kit's header tools) and safe
 * to import in Node: no window, document or storage is touched at module load.
 * The save receives the assembled HTML from its caller (`assembleEnvelope`);
 * it never serializes the live DOM.
 */
export {
  HOST_KINDS, KIND_EXTENSIONS, SAVE_PROTOCOL, AI_PROTOCOL, INCLUDE_PROTOCOL, PROTOCOL_VERSION, MSG,
  SAVE_ACK_TIMEOUT_MS, AI_TIMEOUT_MS, INCLUDE_TIMEOUT_MS, HELLO_INTERVAL_MS, HELLO_MAX_MS,
} from './protocol.js';
export type { HostKind, HostProtocol, SavePayload, SaveAck, AiOperation, AiRequest, AiResult } from './protocol.js';
export { connectHost, NOT_CONNECTED } from './file-side.js';
export type { ConnectHostOptions, HostConnection } from './file-side.js';
export { embedCarrierFrame } from './host-side.js';
export type { EmbedOptions, CarrierFrame } from './host-side.js';
export { createSaver, createIndexedDbHandleStore, HANDLE_DB, HANDLE_STORE, SHELL_UID_PATTERN } from './save.js';
export type { Saver, SaverOptions, SaveInput, SaveResult, HandleStore, StoredHandle } from './save.js';
export { createPreferenceStore, preferenceNamespace, READER_PREFERENCES, PREFERENCE_PREFIX } from './preferences.js';
export type { PreferenceStore, PreferenceSpec, PreferenceSchema, ReaderPreferences } from './preferences.js';
export type {
  MessageEventLike, MessageWindow, PostTarget, IframeLike, SaverWindow, StorageLike, FileHandleLike, WritableLike,
  SaveFilePickerOptions, IdbFactoryLike, LocationLike,
} from './types.js';
