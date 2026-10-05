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
exports.VERSION = exports.maskInertMarkdown = exports.unescapeScriptText = exports.escapeScriptText = exports.jsonForScript = exports.escapeAttr = exports.escapeHtml = void 0;
/**
 * `orz-markdown/carrier` — building blocks shared by the orz-family carriers
 * (orz-mdhtml, orz-slides, orz-paged, orz-poster) and their hosts.
 *
 * Per family decision FD-03, carrier behavior that every format needs is
 * implemented once here and absorbed by a rebuild, instead of being copied
 * into each carrier's template and runtime. It holds the escaping rules for
 * writing source and data islands and the carrier kit core of text format 1
 * (FC-18, spec/FC-18-text-format-1.md; implementation in src/carrier/):
 *
 * - header: `readHeader`, `setHeaderValue`, `removeHeaderKey`, `lintHeader`
 * - document: `readDocument`, `kindFromFilename`, `twinName`, `mintUid`
 * - links: `twinHref` and the `env.orzTwinLinks` render rule
 * - envelope: `assembleEnvelope`, `extract`, `readIslandFromDom`
 *
 * Browser-safe (no Node built-ins). Since the carrier kit reads headers with
 * the token-based scanner, importing this entry also loads the parser (`md`);
 * loading it registers the (inert by default) twin-link rule on `md`.
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
__exportStar(require("./carrier/index.js"), exports);
//# sourceMappingURL=carrier.js.map