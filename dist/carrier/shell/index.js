"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountUpdateIndicator = exports.UPDATE_SKIP_PREFIX = exports.UPDATE_CACHE_PREFIX = exports.MAX_BUNDLE_BYTES = exports.REASSEMBLE_TIMEOUT_MS = exports.MAX_MANIFEST_BYTES = exports.MANIFEST_TIMEOUT_MS = exports.UPDATE_CHECK_INTERVAL_MS = exports.RELEASE_CDN_BASE = exports.RELEASE_KINDS = exports.UpdateError = exports.compareSemver = exports.parseSemver = exports.sha384Integrity = exports.sandboxDocument = exports.isScriptSafe = exports.isBundlePath = exports.browserPackage = exports.bundleUrl = exports.manifestUrl = exports.parseManifest = exports.skippedVersion = exports.skipVersion = exports.performUpdate = exports.reassemble = exports.checkForUpdate = exports.PREFERENCE_PREFIX = exports.READER_PREFERENCES = exports.preferenceNamespace = exports.createPreferenceStore = exports.SHELL_UID_PATTERN = exports.HANDLE_STORE = exports.HANDLE_DB = exports.createIndexedDbHandleStore = exports.createSaver = exports.embedCarrierFrame = exports.NOT_CONNECTED = exports.connectHost = exports.HELLO_MAX_MS = exports.HELLO_INTERVAL_MS = exports.INCLUDE_TIMEOUT_MS = exports.AI_TIMEOUT_MS = exports.SAVE_ACK_TIMEOUT_MS = exports.MSG = exports.PROTOCOL_VERSION = exports.INCLUDE_PROTOCOL = exports.AI_PROTOCOL = exports.SAVE_PROTOCOL = exports.KIND_EXTENSIONS = exports.HOST_KINDS = void 0;
exports.iconElement = exports.showToast = exports.createShadowRoot = exports.ICONS = exports.CHROME_CSS = void 0;
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
var file_side_js_1 = require("./file-side.js");
Object.defineProperty(exports, "connectHost", { enumerable: true, get: function () { return file_side_js_1.connectHost; } });
Object.defineProperty(exports, "NOT_CONNECTED", { enumerable: true, get: function () { return file_side_js_1.NOT_CONNECTED; } });
var host_side_js_1 = require("./host-side.js");
Object.defineProperty(exports, "embedCarrierFrame", { enumerable: true, get: function () { return host_side_js_1.embedCarrierFrame; } });
var save_js_1 = require("./save.js");
Object.defineProperty(exports, "createSaver", { enumerable: true, get: function () { return save_js_1.createSaver; } });
Object.defineProperty(exports, "createIndexedDbHandleStore", { enumerable: true, get: function () { return save_js_1.createIndexedDbHandleStore; } });
Object.defineProperty(exports, "HANDLE_DB", { enumerable: true, get: function () { return save_js_1.HANDLE_DB; } });
Object.defineProperty(exports, "HANDLE_STORE", { enumerable: true, get: function () { return save_js_1.HANDLE_STORE; } });
Object.defineProperty(exports, "SHELL_UID_PATTERN", { enumerable: true, get: function () { return save_js_1.SHELL_UID_PATTERN; } });
var preferences_js_1 = require("./preferences.js");
Object.defineProperty(exports, "createPreferenceStore", { enumerable: true, get: function () { return preferences_js_1.createPreferenceStore; } });
Object.defineProperty(exports, "preferenceNamespace", { enumerable: true, get: function () { return preferences_js_1.preferenceNamespace; } });
Object.defineProperty(exports, "READER_PREFERENCES", { enumerable: true, get: function () { return preferences_js_1.READER_PREFERENCES; } });
Object.defineProperty(exports, "PREFERENCE_PREFIX", { enumerable: true, get: function () { return preferences_js_1.PREFERENCE_PREFIX; } });
var update_js_1 = require("./update.js");
Object.defineProperty(exports, "checkForUpdate", { enumerable: true, get: function () { return update_js_1.checkForUpdate; } });
Object.defineProperty(exports, "reassemble", { enumerable: true, get: function () { return update_js_1.reassemble; } });
Object.defineProperty(exports, "performUpdate", { enumerable: true, get: function () { return update_js_1.performUpdate; } });
Object.defineProperty(exports, "skipVersion", { enumerable: true, get: function () { return update_js_1.skipVersion; } });
Object.defineProperty(exports, "skippedVersion", { enumerable: true, get: function () { return update_js_1.skippedVersion; } });
Object.defineProperty(exports, "parseManifest", { enumerable: true, get: function () { return update_js_1.parseManifest; } });
Object.defineProperty(exports, "manifestUrl", { enumerable: true, get: function () { return update_js_1.manifestUrl; } });
Object.defineProperty(exports, "bundleUrl", { enumerable: true, get: function () { return update_js_1.bundleUrl; } });
Object.defineProperty(exports, "browserPackage", { enumerable: true, get: function () { return update_js_1.browserPackage; } });
Object.defineProperty(exports, "isBundlePath", { enumerable: true, get: function () { return update_js_1.isBundlePath; } });
Object.defineProperty(exports, "isScriptSafe", { enumerable: true, get: function () { return update_js_1.isScriptSafe; } });
Object.defineProperty(exports, "sandboxDocument", { enumerable: true, get: function () { return update_js_1.sandboxDocument; } });
Object.defineProperty(exports, "sha384Integrity", { enumerable: true, get: function () { return update_js_1.sha384Integrity; } });
Object.defineProperty(exports, "parseSemver", { enumerable: true, get: function () { return update_js_1.parseSemver; } });
Object.defineProperty(exports, "compareSemver", { enumerable: true, get: function () { return update_js_1.compareSemver; } });
Object.defineProperty(exports, "UpdateError", { enumerable: true, get: function () { return update_js_1.UpdateError; } });
Object.defineProperty(exports, "RELEASE_KINDS", { enumerable: true, get: function () { return update_js_1.RELEASE_KINDS; } });
Object.defineProperty(exports, "RELEASE_CDN_BASE", { enumerable: true, get: function () { return update_js_1.RELEASE_CDN_BASE; } });
Object.defineProperty(exports, "UPDATE_CHECK_INTERVAL_MS", { enumerable: true, get: function () { return update_js_1.UPDATE_CHECK_INTERVAL_MS; } });
Object.defineProperty(exports, "MANIFEST_TIMEOUT_MS", { enumerable: true, get: function () { return update_js_1.MANIFEST_TIMEOUT_MS; } });
Object.defineProperty(exports, "MAX_MANIFEST_BYTES", { enumerable: true, get: function () { return update_js_1.MAX_MANIFEST_BYTES; } });
Object.defineProperty(exports, "REASSEMBLE_TIMEOUT_MS", { enumerable: true, get: function () { return update_js_1.REASSEMBLE_TIMEOUT_MS; } });
Object.defineProperty(exports, "MAX_BUNDLE_BYTES", { enumerable: true, get: function () { return update_js_1.MAX_BUNDLE_BYTES; } });
Object.defineProperty(exports, "UPDATE_CACHE_PREFIX", { enumerable: true, get: function () { return update_js_1.UPDATE_CACHE_PREFIX; } });
Object.defineProperty(exports, "UPDATE_SKIP_PREFIX", { enumerable: true, get: function () { return update_js_1.UPDATE_SKIP_PREFIX; } });
var indicator_js_1 = require("./indicator.js");
Object.defineProperty(exports, "mountUpdateIndicator", { enumerable: true, get: function () { return indicator_js_1.mountUpdateIndicator; } });
var chrome_js_1 = require("./chrome.js");
Object.defineProperty(exports, "CHROME_CSS", { enumerable: true, get: function () { return chrome_js_1.CHROME_CSS; } });
Object.defineProperty(exports, "ICONS", { enumerable: true, get: function () { return chrome_js_1.ICONS; } });
Object.defineProperty(exports, "createShadowRoot", { enumerable: true, get: function () { return chrome_js_1.createShadowRoot; } });
Object.defineProperty(exports, "showToast", { enumerable: true, get: function () { return chrome_js_1.showToast; } });
Object.defineProperty(exports, "iconElement", { enumerable: true, get: function () { return chrome_js_1.iconElement; } });
//# sourceMappingURL=index.js.map