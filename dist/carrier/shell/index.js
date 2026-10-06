"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PREFERENCE_PREFIX = exports.READER_PREFERENCES = exports.preferenceNamespace = exports.createPreferenceStore = exports.SHELL_UID_PATTERN = exports.HANDLE_STORE = exports.HANDLE_DB = exports.createIndexedDbHandleStore = exports.createSaver = exports.embedCarrierFrame = exports.NOT_CONNECTED = exports.connectHost = exports.HELLO_MAX_MS = exports.HELLO_INTERVAL_MS = exports.INCLUDE_TIMEOUT_MS = exports.AI_TIMEOUT_MS = exports.SAVE_ACK_TIMEOUT_MS = exports.MSG = exports.PROTOCOL_VERSION = exports.INCLUDE_PROTOCOL = exports.AI_PROTOCOL = exports.SAVE_PROTOCOL = exports.KIND_EXTENSIONS = exports.HOST_KINDS = void 0;
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
//# sourceMappingURL=index.js.map