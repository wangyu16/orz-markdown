"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION = exports.maskInertMarkdown = exports.unescapeScriptText = exports.escapeScriptText = exports.jsonForScript = exports.escapeAttr = exports.escapeHtml = void 0;
/**
 * `orz-markdown/carrier` — building blocks shared by the orz-family carriers
 * (orz-mdhtml, orz-slides, orz-paged, orz-poster) and their hosts.
 *
 * Per family decision FD-03, carrier behavior that every format needs is
 * implemented once here and absorbed by a rebuild, instead of being copied
 * into each carrier's template and runtime. This first slice holds the escaping
 * rules for writing source and data islands; host protocols, save and chrome
 * follow in later releases.
 *
 * Node-free and dependency-free: safe to import from a browser bundle.
 */
var html_js_1 = require("./html.js");
Object.defineProperty(exports, "escapeHtml", { enumerable: true, get: function () { return html_js_1.escapeHtml; } });
Object.defineProperty(exports, "escapeAttr", { enumerable: true, get: function () { return html_js_1.escapeAttr; } });
Object.defineProperty(exports, "jsonForScript", { enumerable: true, get: function () { return html_js_1.jsonForScript; } });
Object.defineProperty(exports, "escapeScriptText", { enumerable: true, get: function () { return html_js_1.escapeScriptText; } });
Object.defineProperty(exports, "unescapeScriptText", { enumerable: true, get: function () { return html_js_1.unescapeScriptText; } });
var source_scan_js_1 = require("./source-scan.js");
Object.defineProperty(exports, "maskInertMarkdown", { enumerable: true, get: function () { return source_scan_js_1.maskInertMarkdown; } });
var version_js_1 = require("./version.js");
Object.defineProperty(exports, "VERSION", { enumerable: true, get: function () { return version_js_1.VERSION; } });
//# sourceMappingURL=carrier.js.map