"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SAVE_CONFLICT_MESSAGE = exports.askSaveConflict = exports.KIND_ICON_MAX_PATHS = exports.isKindIcon = exports.anyIconElement = exports.iconElement = exports.showToast = exports.createShadowRoot = exports.ICONS = exports.CHROME_CSS = exports.HELLO_MAX_MS = exports.HELLO_INTERVAL_MS = exports.INCLUDE_TIMEOUT_MS = exports.AI_TIMEOUT_MS = exports.SAVE_ACK_TIMEOUT_MS = exports.MSG = exports.PROTOCOL_VERSION = exports.INCLUDE_PROTOCOL = exports.AI_PROTOCOL = exports.SAVE_PROTOCOL = exports.KIND_EXTENSIONS = exports.HOST_KINDS = void 0;
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
var protocol_js_1 = require("./protocol.js");
Object.defineProperty(exports, "HOST_KINDS", { enumerable: true, get: function () { return protocol_js_1.HOST_KINDS; } });
Object.defineProperty(exports, "KIND_EXTENSIONS", { enumerable: true, get: function () { return protocol_js_1.KIND_EXTENSIONS; } });
Object.defineProperty(exports, "SAVE_PROTOCOL", { enumerable: true, get: function () { return protocol_js_1.SAVE_PROTOCOL; } });
Object.defineProperty(exports, "AI_PROTOCOL", { enumerable: true, get: function () { return protocol_js_1.AI_PROTOCOL; } });
Object.defineProperty(exports, "INCLUDE_PROTOCOL", { enumerable: true, get: function () { return protocol_js_1.INCLUDE_PROTOCOL; } });
Object.defineProperty(exports, "PROTOCOL_VERSION", { enumerable: true, get: function () { return protocol_js_1.PROTOCOL_VERSION; } });
Object.defineProperty(exports, "MSG", { enumerable: true, get: function () { return protocol_js_1.MSG; } });
Object.defineProperty(exports, "SAVE_ACK_TIMEOUT_MS", { enumerable: true, get: function () { return protocol_js_1.SAVE_ACK_TIMEOUT_MS; } });
Object.defineProperty(exports, "AI_TIMEOUT_MS", { enumerable: true, get: function () { return protocol_js_1.AI_TIMEOUT_MS; } });
Object.defineProperty(exports, "INCLUDE_TIMEOUT_MS", { enumerable: true, get: function () { return protocol_js_1.INCLUDE_TIMEOUT_MS; } });
Object.defineProperty(exports, "HELLO_INTERVAL_MS", { enumerable: true, get: function () { return protocol_js_1.HELLO_INTERVAL_MS; } });
Object.defineProperty(exports, "HELLO_MAX_MS", { enumerable: true, get: function () { return protocol_js_1.HELLO_MAX_MS; } });
// Every export of these modules is public: `export *` keeps the CommonJS build a carrier bundles
// small (one re-export helper per module instead of a getter per name; claim S.11).
__exportStar(require("./file-side.js"), exports); // connectHost, NOT_CONNECTED; ConnectHostOptions, HostConnection
__exportStar(require("./host-side.js"), exports); // embedCarrierFrame; EmbedOptions, CarrierFrame
__exportStar(require("./save.js"), exports); // createSaver, createIndexedDbHandleStore, HANDLE_DB, HANDLE_STORE, SHELL_UID_PATTERN, headerUidOf; Saver, SaverOptions, SaveInput, SaveCallOptions, SaveResult, HandleStore, StoredHandle
__exportStar(require("./preferences.js"), exports); // createPreferenceStore, preferenceNamespace, READER_PREFERENCES, PREFERENCE_PREFIX; PreferenceStore, PreferenceSpec, PreferenceSchema, ReaderPreferences
// checkForUpdate, reassemble, performUpdate, skipVersion, skippedVersion, parseManifest, manifestUrl, bundleUrl, browserPackage,
// isBundlePath, isScriptSafe, sandboxDocument, sha384Integrity, parseSemver, compareSemver, UpdateError, RELEASE_KINDS,
// RELEASE_CDN_BASE, UPDATE_CHECK_INTERVAL_MS, MANIFEST_TIMEOUT_MS, MAX_MANIFEST_BYTES, REASSEMBLE_TIMEOUT_MS, MAX_BUNDLE_BYTES,
// UPDATE_CACHE_PREFIX, UPDATE_SKIP_PREFIX; ReleaseKind, ReleaseManifest, UpdateInfo, CheckOptions, ReassembleOptions,
// PerformUpdateOptions, PerformUpdateResult, UpdateErrorCode, FetchLike, ResponseLike, Semver, SandboxFrameLike
__exportStar(require("./update.js"), exports);
__exportStar(require("./indicator.js"), exports); // mountUpdateIndicator; IndicatorHandlers, UpdateIndicator
var chrome_js_1 = require("./chrome.js");
Object.defineProperty(exports, "CHROME_CSS", { enumerable: true, get: function () { return chrome_js_1.CHROME_CSS; } });
Object.defineProperty(exports, "ICONS", { enumerable: true, get: function () { return chrome_js_1.ICONS; } });
Object.defineProperty(exports, "createShadowRoot", { enumerable: true, get: function () { return chrome_js_1.createShadowRoot; } });
Object.defineProperty(exports, "showToast", { enumerable: true, get: function () { return chrome_js_1.showToast; } });
Object.defineProperty(exports, "iconElement", { enumerable: true, get: function () { return chrome_js_1.iconElement; } });
Object.defineProperty(exports, "anyIconElement", { enumerable: true, get: function () { return chrome_js_1.anyIconElement; } });
Object.defineProperty(exports, "isKindIcon", { enumerable: true, get: function () { return chrome_js_1.isKindIcon; } });
Object.defineProperty(exports, "KIND_ICON_MAX_PATHS", { enumerable: true, get: function () { return chrome_js_1.KIND_ICON_MAX_PATHS; } });
Object.defineProperty(exports, "askSaveConflict", { enumerable: true, get: function () { return chrome_js_1.askSaveConflict; } });
Object.defineProperty(exports, "SAVE_CONFLICT_MESSAGE", { enumerable: true, get: function () { return chrome_js_1.SAVE_CONFLICT_MESSAGE; } });
//# sourceMappingURL=index.js.map