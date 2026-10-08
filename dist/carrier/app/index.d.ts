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
export { bootCarrierApp, APP_CSS } from './app.js';
export { startCarrier, carrierGlobal } from './start.js';
export type { StartOptions } from './start.js';
export { readOpenedFile, sourceIsland, shellDelivery, shellIncludes, openedFileName, copyName } from './file.js';
export { captureEngineSource } from './engine-source.js';
export type { EngineSource, CaptureOptions } from './engine-source.js';
export { WIDGET_CSS, installCss, button, menuButton, settingPicker, attachSettings, reviewProposal, attachAiMenu, followPresentation, } from './widgets.js';
export type { ButtonOptions, MenuItem, MenuButton, AiOp, AiMenu, PreviewPresentation } from './widgets.js';
export type { AppEvent, AppListener, AppClassList, AppElement, AppShadowRoot, AppDocument, AppWindow, CarrierKindName, OpenedFile, AppAssembleOptions, KindEditorOptions, StandaloneContext, ReadViewContext, CarrierReadView, SettingControl, CarrierAction, StandaloneKind, AppServices, CarrierAppOptions, AppSaveOutcome, CarrierApp, OrzCarrierGlobal, } from './types.js';
//# sourceMappingURL=index.d.ts.map