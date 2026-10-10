"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.twinCheck = exports.heldText = exports.storedText = exports.assembledStructure = exports.scriptElement = exports.shellWord = exports.looksHtml = exports.readLegacyIsland = exports.generatorOf = exports.decodeEntities = exports.hasRawAttr = exports.rawAttr = exports.rawElements = exports.sha256 = exports.INCLUDES_ISLAND_ID = exports.SHELL_ISLAND_ID = exports.SOURCE_ISLAND_ID = exports.KIND_PACKAGE = exports.hasLoneSurrogate = exports.hasMixedEol = exports.eolStyle = exports.skillUrl = exports.readIslandFromDom = exports.extract = exports.assembleEnvelope = exports.decodeText = exports.TWIN_LINKS_RULE = exports.registerTwinLinks = exports.twinHref = exports.SETTING_DEFAULTS = exports.mintUid = exports.twinName = exports.kindFromFilename = exports.readDocument = exports.UID_PATTERN = exports.WRITER_KEY = exports.KIND_HEADER_KEYS = exports.COMMON_HEADER_KEYS = exports.lintHeader = exports.removeHeaderKey = exports.setHeaderValue = exports.normalizeHeader = exports.editHeader = exports.withoutHeader = exports.readHeader = void 0;
/**
 * The orz carrier kit core (FC-18 text format 1): the document header, the
 * document facts, twin links and the assembled-file envelope. Exported to
 * consumers through `orz-markdown/carrier` (src/carrier.ts); the parser entry
 * never imports this folder.
 */
var header_js_1 = require("./header.js");
Object.defineProperty(exports, "readHeader", { enumerable: true, get: function () { return header_js_1.readHeader; } });
Object.defineProperty(exports, "withoutHeader", { enumerable: true, get: function () { return header_js_1.withoutHeader; } });
Object.defineProperty(exports, "editHeader", { enumerable: true, get: function () { return header_js_1.editHeader; } });
Object.defineProperty(exports, "normalizeHeader", { enumerable: true, get: function () { return header_js_1.normalizeHeader; } });
Object.defineProperty(exports, "setHeaderValue", { enumerable: true, get: function () { return header_js_1.setHeaderValue; } });
Object.defineProperty(exports, "removeHeaderKey", { enumerable: true, get: function () { return header_js_1.removeHeaderKey; } });
Object.defineProperty(exports, "lintHeader", { enumerable: true, get: function () { return header_js_1.lintHeader; } });
Object.defineProperty(exports, "COMMON_HEADER_KEYS", { enumerable: true, get: function () { return header_js_1.COMMON_HEADER_KEYS; } });
Object.defineProperty(exports, "KIND_HEADER_KEYS", { enumerable: true, get: function () { return header_js_1.KIND_HEADER_KEYS; } });
Object.defineProperty(exports, "WRITER_KEY", { enumerable: true, get: function () { return header_js_1.WRITER_KEY; } });
Object.defineProperty(exports, "UID_PATTERN", { enumerable: true, get: function () { return header_js_1.UID_PATTERN; } });
var document_js_1 = require("./document.js");
Object.defineProperty(exports, "readDocument", { enumerable: true, get: function () { return document_js_1.readDocument; } });
Object.defineProperty(exports, "kindFromFilename", { enumerable: true, get: function () { return document_js_1.kindFromFilename; } });
Object.defineProperty(exports, "twinName", { enumerable: true, get: function () { return document_js_1.twinName; } });
Object.defineProperty(exports, "mintUid", { enumerable: true, get: function () { return document_js_1.mintUid; } });
Object.defineProperty(exports, "SETTING_DEFAULTS", { enumerable: true, get: function () { return document_js_1.SETTING_DEFAULTS; } });
var links_js_1 = require("./links.js");
Object.defineProperty(exports, "twinHref", { enumerable: true, get: function () { return links_js_1.twinHref; } });
Object.defineProperty(exports, "registerTwinLinks", { enumerable: true, get: function () { return links_js_1.registerTwinLinks; } });
Object.defineProperty(exports, "TWIN_LINKS_RULE", { enumerable: true, get: function () { return links_js_1.TWIN_LINKS_RULE; } });
var text_js_1 = require("./text.js");
Object.defineProperty(exports, "decodeText", { enumerable: true, get: function () { return text_js_1.decodeText; } });
var envelope_js_1 = require("./envelope.js");
Object.defineProperty(exports, "assembleEnvelope", { enumerable: true, get: function () { return envelope_js_1.assembleEnvelope; } });
Object.defineProperty(exports, "extract", { enumerable: true, get: function () { return envelope_js_1.extract; } });
Object.defineProperty(exports, "readIslandFromDom", { enumerable: true, get: function () { return envelope_js_1.readIslandFromDom; } });
Object.defineProperty(exports, "skillUrl", { enumerable: true, get: function () { return envelope_js_1.skillUrl; } });
Object.defineProperty(exports, "eolStyle", { enumerable: true, get: function () { return envelope_js_1.eolStyle; } });
Object.defineProperty(exports, "hasMixedEol", { enumerable: true, get: function () { return envelope_js_1.hasMixedEol; } });
Object.defineProperty(exports, "hasLoneSurrogate", { enumerable: true, get: function () { return envelope_js_1.hasLoneSurrogate; } });
Object.defineProperty(exports, "KIND_PACKAGE", { enumerable: true, get: function () { return envelope_js_1.KIND_PACKAGE; } });
Object.defineProperty(exports, "SOURCE_ISLAND_ID", { enumerable: true, get: function () { return envelope_js_1.SOURCE_ISLAND_ID; } });
Object.defineProperty(exports, "SHELL_ISLAND_ID", { enumerable: true, get: function () { return envelope_js_1.SHELL_ISLAND_ID; } });
Object.defineProperty(exports, "INCLUDES_ISLAND_ID", { enumerable: true, get: function () { return envelope_js_1.INCLUDES_ISLAND_ID; } });
// 2.3.0: what orz-mdhtml and orz-paged copied (REBUILD §3b KIT GAP) — the synchronous SHA-256, the
// legacy 0.x island reader and the kind-independent core of `inspect`
var sha256_js_1 = require("./sha256.js");
Object.defineProperty(exports, "sha256", { enumerable: true, get: function () { return sha256_js_1.sha256; } });
var legacy_js_1 = require("./legacy.js");
Object.defineProperty(exports, "rawElements", { enumerable: true, get: function () { return legacy_js_1.rawElements; } });
Object.defineProperty(exports, "rawAttr", { enumerable: true, get: function () { return legacy_js_1.rawAttr; } });
Object.defineProperty(exports, "hasRawAttr", { enumerable: true, get: function () { return legacy_js_1.hasRawAttr; } });
Object.defineProperty(exports, "decodeEntities", { enumerable: true, get: function () { return legacy_js_1.decodeEntities; } });
Object.defineProperty(exports, "generatorOf", { enumerable: true, get: function () { return legacy_js_1.generatorOf; } });
Object.defineProperty(exports, "readLegacyIsland", { enumerable: true, get: function () { return legacy_js_1.readLegacyIsland; } });
var inspect_js_1 = require("./inspect.js");
Object.defineProperty(exports, "looksHtml", { enumerable: true, get: function () { return inspect_js_1.looksHtml; } });
Object.defineProperty(exports, "shellWord", { enumerable: true, get: function () { return inspect_js_1.shellWord; } });
Object.defineProperty(exports, "scriptElement", { enumerable: true, get: function () { return inspect_js_1.scriptElement; } });
Object.defineProperty(exports, "assembledStructure", { enumerable: true, get: function () { return inspect_js_1.assembledStructure; } });
Object.defineProperty(exports, "storedText", { enumerable: true, get: function () { return inspect_js_1.storedText; } });
Object.defineProperty(exports, "heldText", { enumerable: true, get: function () { return inspect_js_1.heldText; } });
Object.defineProperty(exports, "twinCheck", { enumerable: true, get: function () { return inspect_js_1.twinCheck; } });
//# sourceMappingURL=index.js.map