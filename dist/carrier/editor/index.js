"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EDITOR_CSS = exports.renderMarkdownPreviewWithIncludes = exports.renderMarkdownPreview = exports.PREVIEW_READY_TIMEOUT_MS = exports.PREVIEW_BRIDGE_HASH = exports.PREVIEW_BRIDGE = exports.PREVIEW_SANDBOX = exports.previewScriptHashes = exports.mapSrcset = exports.rewriteAssetUrls = exports.previewSandbox = exports.topToLine = exports.lineToTop = exports.createPreview = exports.previewFrameParts = exports.previewFrameDocument = exports.detachString = exports.minimalChange = exports.toEditorText = exports.createTextModel = exports.CODEMIRROR6_GLOBAL = exports.CODEMIRROR6_BYTES = exports.CODEMIRROR6_INTEGRITY = exports.CODEMIRROR6_PATH = exports.CODEMIRROR6_VERSIONS = exports.CODEMIRROR6_HISTORY_STEPS = exports.CODEMIRROR6_TIMEOUT_MS = exports.CODEMIRROR6_URL = exports.isCodeMirror6Modules = exports.loadCodeMirror6 = exports.codemirror6Adapter = exports.undoSteps = exports.textareaAdapter = exports.createEditorShell = void 0;
/**
 * `orz-markdown/carrier/editor` — the editor shell (FC-19 §8): the
 * kind-independent base each carrier's `mountEditor` wraps. Chrome toolbar,
 * editor and sandboxed preview in a shadow root; split / editor / preview
 * modes, a draggable split, the keyboard map; the exact text with dirty
 * tracking and header edits; save through a host hook or the standalone
 * save; CodeMirror 6 behind a swappable adapter, a textarea fallback.
 *
 * Unlike `carrier/shell` and `carrier/read`, this entry may load the parser:
 * the md preview renders with it and `setHeader` edits with the kit's header
 * tools. No browser global is touched at module load; CodeMirror loads when
 * an editor mounts.
 */
var shell_js_1 = require("./shell.js");
Object.defineProperty(exports, "createEditorShell", { enumerable: true, get: function () { return shell_js_1.createEditorShell; } });
var adapter_js_1 = require("./adapter.js");
Object.defineProperty(exports, "textareaAdapter", { enumerable: true, get: function () { return adapter_js_1.textareaAdapter; } });
Object.defineProperty(exports, "undoSteps", { enumerable: true, get: function () { return adapter_js_1.undoSteps; } });
var codemirror6_js_1 = require("./codemirror6.js");
Object.defineProperty(exports, "codemirror6Adapter", { enumerable: true, get: function () { return codemirror6_js_1.codemirror6Adapter; } });
Object.defineProperty(exports, "loadCodeMirror6", { enumerable: true, get: function () { return codemirror6_js_1.loadCodeMirror6; } });
Object.defineProperty(exports, "isCodeMirror6Modules", { enumerable: true, get: function () { return codemirror6_js_1.isCodeMirror6Modules; } });
Object.defineProperty(exports, "CODEMIRROR6_URL", { enumerable: true, get: function () { return codemirror6_js_1.CODEMIRROR6_URL; } });
Object.defineProperty(exports, "CODEMIRROR6_TIMEOUT_MS", { enumerable: true, get: function () { return codemirror6_js_1.CODEMIRROR6_TIMEOUT_MS; } });
Object.defineProperty(exports, "CODEMIRROR6_HISTORY_STEPS", { enumerable: true, get: function () { return codemirror6_js_1.CODEMIRROR6_HISTORY_STEPS; } });
var codemirror_pin_js_1 = require("./codemirror-pin.js");
Object.defineProperty(exports, "CODEMIRROR6_VERSIONS", { enumerable: true, get: function () { return codemirror_pin_js_1.CODEMIRROR6_VERSIONS; } });
Object.defineProperty(exports, "CODEMIRROR6_PATH", { enumerable: true, get: function () { return codemirror_pin_js_1.CODEMIRROR6_PATH; } });
Object.defineProperty(exports, "CODEMIRROR6_INTEGRITY", { enumerable: true, get: function () { return codemirror_pin_js_1.CODEMIRROR6_INTEGRITY; } });
Object.defineProperty(exports, "CODEMIRROR6_BYTES", { enumerable: true, get: function () { return codemirror_pin_js_1.CODEMIRROR6_BYTES; } });
Object.defineProperty(exports, "CODEMIRROR6_GLOBAL", { enumerable: true, get: function () { return codemirror_pin_js_1.CODEMIRROR6_GLOBAL; } });
var text_model_js_1 = require("./text-model.js");
Object.defineProperty(exports, "createTextModel", { enumerable: true, get: function () { return text_model_js_1.createTextModel; } });
Object.defineProperty(exports, "toEditorText", { enumerable: true, get: function () { return text_model_js_1.toEditorText; } });
Object.defineProperty(exports, "minimalChange", { enumerable: true, get: function () { return text_model_js_1.minimalChange; } });
Object.defineProperty(exports, "detachString", { enumerable: true, get: function () { return text_model_js_1.detachString; } });
var preview_js_1 = require("./preview.js");
Object.defineProperty(exports, "previewFrameDocument", { enumerable: true, get: function () { return preview_js_1.previewFrameDocument; } });
Object.defineProperty(exports, "previewFrameParts", { enumerable: true, get: function () { return preview_js_1.previewFrameParts; } });
Object.defineProperty(exports, "createPreview", { enumerable: true, get: function () { return preview_js_1.createPreview; } });
Object.defineProperty(exports, "lineToTop", { enumerable: true, get: function () { return preview_js_1.lineToTop; } });
Object.defineProperty(exports, "topToLine", { enumerable: true, get: function () { return preview_js_1.topToLine; } });
Object.defineProperty(exports, "previewSandbox", { enumerable: true, get: function () { return preview_js_1.previewSandbox; } });
Object.defineProperty(exports, "rewriteAssetUrls", { enumerable: true, get: function () { return preview_js_1.rewriteAssetUrls; } });
Object.defineProperty(exports, "mapSrcset", { enumerable: true, get: function () { return preview_js_1.mapSrcset; } });
Object.defineProperty(exports, "previewScriptHashes", { enumerable: true, get: function () { return preview_js_1.previewScriptHashes; } });
Object.defineProperty(exports, "PREVIEW_SANDBOX", { enumerable: true, get: function () { return preview_js_1.PREVIEW_SANDBOX; } });
Object.defineProperty(exports, "PREVIEW_BRIDGE", { enumerable: true, get: function () { return preview_js_1.PREVIEW_BRIDGE; } });
Object.defineProperty(exports, "PREVIEW_BRIDGE_HASH", { enumerable: true, get: function () { return preview_js_1.PREVIEW_BRIDGE_HASH; } });
Object.defineProperty(exports, "PREVIEW_READY_TIMEOUT_MS", { enumerable: true, get: function () { return preview_js_1.PREVIEW_READY_TIMEOUT_MS; } });
var render_md_js_1 = require("./render-md.js");
Object.defineProperty(exports, "renderMarkdownPreview", { enumerable: true, get: function () { return render_md_js_1.renderMarkdownPreview; } });
Object.defineProperty(exports, "renderMarkdownPreviewWithIncludes", { enumerable: true, get: function () { return render_md_js_1.renderMarkdownPreviewWithIncludes; } });
var styles_js_1 = require("./styles.js");
Object.defineProperty(exports, "EDITOR_CSS", { enumerable: true, get: function () { return styles_js_1.EDITOR_CSS; } });
//# sourceMappingURL=index.js.map