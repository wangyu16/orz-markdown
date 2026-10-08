/**
 * `orz-markdown/carrier/shell` — the browser runtime every assembled orz file
 * shares (FD-03): the standalone save, reader preferences, both sides of the
 * host protocols `orz-host-save@1`, `orz-host-ai@1`, `orz-host-include@1`,
 * the quiet update (release check, sandboxed re-assembly, indicator) and the
 * shell chrome (tokens, icons, toasts).
 *
 * Specs: spec/shell-runtime.md, spec/host-protocols.md. Parser-free (it
 * imports nothing from the Markdown parser or the kit's header tools; the
 * update verifies with the parser-free `extract` of ../read.ts) and safe
 * to import in Node: no window, document or storage is touched at module load.
 * The save receives the assembled HTML from its caller (`assembleEnvelope`);
 * it never serializes the live DOM.
 */
export {
  HOST_KINDS, KIND_EXTENSIONS, SAVE_PROTOCOL, AI_PROTOCOL, INCLUDE_PROTOCOL, PROTOCOL_VERSION, MSG,
  SAVE_ACK_TIMEOUT_MS, AI_TIMEOUT_MS, INCLUDE_TIMEOUT_MS, HELLO_INTERVAL_MS, HELLO_MAX_MS,
} from './protocol.js';
export type { HostKind, HostProtocol, SavePayload, SaveAck, AiOperation, AiRequest, AiResult } from './protocol.js';
// Every export of these modules is public: `export *` keeps the CommonJS build a carrier bundles
// small (one re-export helper per module instead of a getter per name; claim S.11).
export * from './file-side.js'; // connectHost, NOT_CONNECTED; ConnectHostOptions, HostConnection
export * from './host-side.js'; // embedCarrierFrame; EmbedOptions, CarrierFrame
export * from './save.js'; // createSaver, createIndexedDbHandleStore, HANDLE_DB, HANDLE_STORE, SHELL_UID_PATTERN, headerUidOf; Saver, SaverOptions, SaveInput, SaveCallOptions, SaveResult, HandleStore, StoredHandle
export * from './preferences.js'; // createPreferenceStore, preferenceNamespace, READER_PREFERENCES, PREFERENCE_PREFIX; PreferenceStore, PreferenceSpec, PreferenceSchema, ReaderPreferences
export type {
  MessageEventLike, MessageWindow, PostTarget, IframeLike, SaverWindow, StorageLike, FileHandleLike, WritableLike,
  SaveFilePickerOptions, IdbFactoryLike, LocationLike, FileLike,
} from './types.js';
// checkForUpdate, reassemble, performUpdate, skipVersion, skippedVersion, parseManifest, manifestUrl, bundleUrl, browserPackage,
// isBundlePath, isScriptSafe, sandboxDocument, sha384Integrity, parseSemver, compareSemver, UpdateError, RELEASE_KINDS,
// RELEASE_CDN_BASE, UPDATE_CHECK_INTERVAL_MS, MANIFEST_TIMEOUT_MS, MAX_MANIFEST_BYTES, REASSEMBLE_TIMEOUT_MS, MAX_BUNDLE_BYTES,
// UPDATE_CACHE_PREFIX, UPDATE_SKIP_PREFIX; ReleaseKind, ReleaseManifest, UpdateInfo, CheckOptions, ReassembleOptions,
// PerformUpdateOptions, PerformUpdateResult, UpdateErrorCode, FetchLike, ResponseLike, Semver, SandboxFrameLike
export * from './update.js';
export * from './indicator.js'; // mountUpdateIndicator; IndicatorHandlers, UpdateIndicator
export { CHROME_CSS, ICONS, createShadowRoot, showToast, iconElement, anyIconElement, isKindIcon, KIND_ICON_MAX_PATHS, askSaveConflict, SAVE_CONFLICT_MESSAGE } from './chrome.js';
export type { IconName, KindIcon, ToastTone, ToastOptions, Toast, SaveConflictOptions } from './chrome.js';
export type { UiElement, UiDocument, UiView, UiEventLike, UiListener, ShadowRootLike, TextLike, StyleLike } from './types.js';
