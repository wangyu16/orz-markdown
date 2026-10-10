"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.followPresentation = exports.attachAiMenu = exports.reviewProposal = exports.attachSettings = exports.settingChanges = exports.settingOffered = exports.settingChoices = exports.settingPicker = exports.menuButton = exports.button = exports.installCss = exports.WIDGET_CSS = exports.captureEngineSource = exports.copyName = exports.openedFileName = exports.shellIncludes = exports.shellDelivery = exports.sourceIsland = exports.readOpenedFile = exports.carrierGlobal = exports.startCarrier = exports.UPDATE_QUESTION_OPEN = exports.UPDATE_CONFLICT_MESSAGE = exports.APP_CSS = exports.bootCarrierApp = void 0;
/**
 * `orz-markdown/carrier/app` — the standalone assembled file's runtime
 * (spec/carrier-app.md): kind-independent, used by every carrier's browser
 * bundle behind the `StandaloneKind` seam. It reads the opened file, renders
 * the kind's read view, mounts the chrome (Edit, the kind's settings and
 * actions, Save, Download a copy, New document, Save as new copy), edit mode,
 * the unsaved-changes warning, the host connection (save, AI with the review
 * flow, include), the quiet update, reader preferences and the page keymap;
 * `startCarrier` sets `globalThis.OrzCarrier` (FC-19 §2) and boots it.
 *
 * It may import `carrier/shell`, `carrier/editor` and `carrier/read`;
 * `carrier`, `carrier/read`, `carrier/shell` and `carrier/editor` never import
 * it (claim A.1). No browser global is touched at module load (A.2).
 */
var app_js_1 = require("./app.js");
Object.defineProperty(exports, "bootCarrierApp", { enumerable: true, get: function () { return app_js_1.bootCarrierApp; } });
Object.defineProperty(exports, "APP_CSS", { enumerable: true, get: function () { return app_js_1.APP_CSS; } });
Object.defineProperty(exports, "UPDATE_CONFLICT_MESSAGE", { enumerable: true, get: function () { return app_js_1.UPDATE_CONFLICT_MESSAGE; } });
Object.defineProperty(exports, "UPDATE_QUESTION_OPEN", { enumerable: true, get: function () { return app_js_1.UPDATE_QUESTION_OPEN; } });
var start_js_1 = require("./start.js");
Object.defineProperty(exports, "startCarrier", { enumerable: true, get: function () { return start_js_1.startCarrier; } });
Object.defineProperty(exports, "carrierGlobal", { enumerable: true, get: function () { return start_js_1.carrierGlobal; } });
var file_js_1 = require("./file.js");
Object.defineProperty(exports, "readOpenedFile", { enumerable: true, get: function () { return file_js_1.readOpenedFile; } });
Object.defineProperty(exports, "sourceIsland", { enumerable: true, get: function () { return file_js_1.sourceIsland; } });
Object.defineProperty(exports, "shellDelivery", { enumerable: true, get: function () { return file_js_1.shellDelivery; } });
Object.defineProperty(exports, "shellIncludes", { enumerable: true, get: function () { return file_js_1.shellIncludes; } });
Object.defineProperty(exports, "openedFileName", { enumerable: true, get: function () { return file_js_1.openedFileName; } });
Object.defineProperty(exports, "copyName", { enumerable: true, get: function () { return file_js_1.copyName; } });
var engine_source_js_1 = require("./engine-source.js");
Object.defineProperty(exports, "captureEngineSource", { enumerable: true, get: function () { return engine_source_js_1.captureEngineSource; } });
var widgets_js_1 = require("./widgets.js");
Object.defineProperty(exports, "WIDGET_CSS", { enumerable: true, get: function () { return widgets_js_1.WIDGET_CSS; } });
Object.defineProperty(exports, "installCss", { enumerable: true, get: function () { return widgets_js_1.installCss; } });
Object.defineProperty(exports, "button", { enumerable: true, get: function () { return widgets_js_1.button; } });
Object.defineProperty(exports, "menuButton", { enumerable: true, get: function () { return widgets_js_1.menuButton; } });
Object.defineProperty(exports, "settingPicker", { enumerable: true, get: function () { return widgets_js_1.settingPicker; } });
Object.defineProperty(exports, "settingChoices", { enumerable: true, get: function () { return widgets_js_1.settingChoices; } });
Object.defineProperty(exports, "settingOffered", { enumerable: true, get: function () { return widgets_js_1.settingOffered; } });
Object.defineProperty(exports, "settingChanges", { enumerable: true, get: function () { return widgets_js_1.settingChanges; } });
Object.defineProperty(exports, "attachSettings", { enumerable: true, get: function () { return widgets_js_1.attachSettings; } });
Object.defineProperty(exports, "reviewProposal", { enumerable: true, get: function () { return widgets_js_1.reviewProposal; } });
Object.defineProperty(exports, "attachAiMenu", { enumerable: true, get: function () { return widgets_js_1.attachAiMenu; } });
Object.defineProperty(exports, "followPresentation", { enumerable: true, get: function () { return widgets_js_1.followPresentation; } });
//# sourceMappingURL=index.js.map