/**
 * The editor shell's layout and controls, installed after `CHROME_CSS`
 * (src/carrier/shell/chrome.ts) in the shell's shadow root. Built from the
 * chrome tokens only; it styles nothing outside the shadow root.
 */
export const EDITOR_CSS = `
:host { display: block; position: relative; width: 100%; height: 100%; min-height: 200px; }
.orz-editor {
  display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0;
  background: var(--orz-chrome-bg); color: var(--orz-chrome-fg);
  --orz-editor-font-size: 14px;
}
.orz-editor:focus { outline: none; }
.orz-editor__bar {
  flex: none; display: flex; align-items: center; gap: var(--orz-chrome-space-3); flex-wrap: wrap;
  min-height: 40px; padding: var(--orz-chrome-space-2) var(--orz-chrome-space-3);
  background: var(--orz-chrome-surface); border-bottom: 1px solid var(--orz-chrome-border);
}
.orz-editor__modes {
  display: inline-flex; gap: 2px; padding: 2px; border-radius: var(--orz-chrome-radius-s);
  background: var(--orz-chrome-surface-2); border: 1px solid var(--orz-chrome-border);
}
.orz-editor__mode {
  display: inline-flex; align-items: center; gap: var(--orz-chrome-space-2);
  min-height: 24px; padding: 0 var(--orz-chrome-space-3); border: 0; border-radius: 4px;
  background: transparent; color: var(--orz-chrome-muted); cursor: pointer;
  font: 500 var(--orz-chrome-text-sm)/1 var(--orz-chrome-font);
  transition: background var(--orz-chrome-fast) var(--orz-chrome-ease), color var(--orz-chrome-fast) var(--orz-chrome-ease);
}
.orz-editor__mode:hover { color: var(--orz-chrome-fg); }
.orz-editor__mode[aria-pressed="true"] { background: var(--orz-chrome-surface); color: var(--orz-chrome-fg); box-shadow: 0 1px 2px oklch(22% 0.02 260 / 0.14); }
.orz-editor__mode .orz-icon { width: 14px; height: 14px; }
/* the carrier's slot (settings, AI menu): wraps in a narrow column (2.3.0, E.36); a long label ellipsizes */
.orz-editor__tools { display: flex; align-items: center; flex-wrap: wrap; gap: var(--orz-chrome-space-2); flex: 1 1 auto; min-width: 0; max-width: 100%; }
.orz-editor__tools > * { min-width: 0; max-width: 100%; }
.orz-editor__status { display: inline-flex; align-items: center; gap: 6px; color: var(--orz-chrome-muted); font-size: var(--orz-chrome-text-sm); white-space: nowrap; }
.orz-editor__status::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--orz-chrome-success); }
.orz-editor[data-dirty="true"] .orz-editor__status::before { background: var(--orz-chrome-warning); }
/* the label is as wide as its longest text (data-reserve), whatever it says now (D-101) */
.orz-editor__status-text { display: inline-grid; }
.orz-editor__status-text::after { content: attr(data-reserve); visibility: hidden; height: 0; overflow: hidden; }
/* the bar would wrap: the status shows its dot only (D-101) */
.orz-editor[data-status-compact] .orz-editor__status-text { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.orz-editor__sync { min-height: 26px; padding: 0 var(--orz-chrome-space-3); font-size: var(--orz-chrome-text-sm); }
.orz-editor__sync[aria-pressed="true"] { color: var(--orz-chrome-accent); }
.orz-editor__save { min-height: 28px; }
.orz-editor[data-chrome-level="compact"] .orz-editor__label { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.orz-editor__notice {
  flex: none; display: flex; align-items: center; gap: var(--orz-chrome-space-3); flex-wrap: wrap;
  padding: var(--orz-chrome-space-3) var(--orz-chrome-space-4); font-size: var(--orz-chrome-text-sm);
  background: color-mix(in oklch, var(--orz-chrome-warning) 14%, var(--orz-chrome-surface));
  border-bottom: 1px solid var(--orz-chrome-border);
}
.orz-editor__notice-text { flex: 1 1 16em; }
.orz-editor__notice--quiet { background: var(--orz-chrome-surface-2); color: var(--orz-chrome-muted); }
.orz-editor__preview-note {
  position: absolute; inset: auto var(--orz-chrome-space-3) var(--orz-chrome-space-3); padding: var(--orz-chrome-space-2) var(--orz-chrome-space-3);
  font-size: var(--orz-chrome-text-sm); color: var(--orz-chrome-muted); background: var(--orz-chrome-surface-2);
  border: 1px solid var(--orz-chrome-border); border-radius: 6px;
}
.orz-editor__link-chip {
  position: absolute; inset: auto var(--orz-chrome-space-3) var(--orz-chrome-space-3) auto; max-width: calc(100% - 2 * var(--orz-chrome-space-3));
  display: flex; align-items: center; gap: var(--orz-chrome-space-2); padding: var(--orz-chrome-space-2) var(--orz-chrome-space-3);
  font-size: var(--orz-chrome-text-sm); color: var(--orz-chrome-fg); background: var(--orz-chrome-surface);
  border: 1px solid var(--orz-chrome-border); border-radius: 6px; box-shadow: 0 2px 10px oklch(0% 0 0 / 0.12);
}
.orz-editor__link-chip-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.orz-editor__panes { position: relative; display: flex; flex: 1 1 auto; min-height: 0; }
.orz-editor__pane { position: relative; min-width: 0; min-height: 0; overflow: hidden; }
.orz-editor__pane--editor { flex: 0 0 calc(var(--orz-split, 0.5) * 100% - 3px); background: var(--orz-chrome-surface); }
.orz-editor__pane--editor:focus-within { box-shadow: inset 0 2px 0 var(--orz-chrome-focus); }
.orz-editor__pane--preview { flex: 1 1 0; background: oklch(100% 0 0); }
.orz-editor__divider {
  flex: 0 0 6px; cursor: col-resize; touch-action: none;
  background: linear-gradient(var(--orz-chrome-border), var(--orz-chrome-border)) center / 1px 100% no-repeat;
  transition: background-size var(--orz-chrome-fast) var(--orz-chrome-ease);
}
.orz-editor__divider:hover, .orz-editor[data-dragging] .orz-editor__divider, .orz-editor__divider:focus-visible {
  background-image: linear-gradient(var(--orz-chrome-accent), var(--orz-chrome-accent)); background-size: 2px 100%; outline-offset: -2px;
}
.orz-editor[data-dragging] { cursor: col-resize; user-select: none; }
.orz-editor[data-dragging] .orz-editor__frame { pointer-events: none; }
.orz-editor[data-view="editor"] .orz-editor__pane--preview,
.orz-editor[data-view="editor"] .orz-editor__divider,
.orz-editor[data-view="preview"] .orz-editor__pane--editor,
.orz-editor[data-view="preview"] .orz-editor__divider { display: none; }
.orz-editor[data-view="editor"] .orz-editor__pane--editor { flex: 1 1 0; }
.orz-editor[data-narrow] .orz-editor__mode[data-mode="split"] { display: none; }
.orz-editor[data-narrow] .orz-editor__sync, .orz-editor:not([data-view="split"]) .orz-editor__sync { display: none; }
.orz-editor__engine { height: 100%; }
.orz-editor__textarea {
  display: block; width: 100%; height: 100%; margin: 0; padding: 12px 16px; border: 0; resize: none; outline: none;
  background: var(--orz-chrome-surface); color: var(--orz-chrome-fg);
  font: 400 var(--orz-editor-font-size)/1.6 var(--orz-chrome-mono); tab-size: 4;
}
.orz-editor__frame { display: block; width: 100%; height: 100%; border: 0; background: oklch(100% 0 0); }
`;
