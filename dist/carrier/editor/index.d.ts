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
export { createEditorShell } from './shell.js';
export type { EditorShell, EditorShellOptions, EditorMode, EditorEventName, EditorEvents, SaveOutcome, SaveVia, EditorHooks, RenderContext, EditorPreviewOptions, PreviewMapContext, AiOutcome, UploadOutcome, TextRange, EditorPreviewChannel, } from './shell.js';
export { textareaAdapter, undoSteps } from './adapter.js';
export type { TextEditorAdapter, AdapterMountOptions, Selection, ScrollPosition } from './adapter.js';
export { codemirror6Adapter, loadCodeMirror6, isCodeMirror6Modules, CODEMIRROR6_URL, CODEMIRROR6_TIMEOUT_MS, CODEMIRROR6_HISTORY_STEPS } from './codemirror6.js';
export type { CodeMirror6Modules, CodeMirror6Options } from './codemirror6.js';
export { CODEMIRROR6_VERSIONS, CODEMIRROR6_PATH, CODEMIRROR6_INTEGRITY, CODEMIRROR6_BYTES, CODEMIRROR6_GLOBAL } from './codemirror-pin.js';
export { createTextModel, toEditorText, minimalChange, detachString } from './text-model.js';
export type { TextModel } from './text-model.js';
export { previewFrameDocument, previewFrameParts, createPreview, lineToTop, topToLine, previewSandbox, rewriteAssetUrls, mapSrcset, previewScriptHashes, PREVIEW_SANDBOX, PREVIEW_BRIDGE, PREVIEW_BRIDGE_HASH, PREVIEW_READY_TIMEOUT_MS, } from './preview.js';
export type { PreviewFrameOptions, PreviewFrameParts, PreviewContext, PreviewController, PreviewEvents, PreviewMessage } from './preview.js';
export { renderMarkdownPreview, renderMarkdownPreviewWithIncludes } from './render-md.js';
export type { MarkdownPreviewOptions } from './render-md.js';
export { EDITOR_CSS } from './styles.js';
export type { EdElement, EdDocument, EdView, EdEvent, EdFile, EdDataTransfer, EdPort } from './types.js';
//# sourceMappingURL=index.d.ts.map