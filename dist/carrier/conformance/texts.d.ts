/**
 * The harness's own texts: hazards every carrier must carry exactly (FC-18 §11:
 * any Unicode, CR LF / CR, a BOM, `</script>`, `<!--`, very long lines, the
 * empty text), the texts `assemble` must refuse, and the documents the browser
 * checks open.
 */
/** Uids used by the browser checks (well-formed, FC-18 §5.1). */
export declare const UID_A = "doc-conformance0a1b2c";
export declare const UID_B = "doc-conformance9z8y7x";
/** Hazard texts by name. Every one has consistent line endings and no NUL or lone surrogate, so law 1 applies. */
export declare const HAZARD_TEXTS: Readonly<Record<string, string>>;
/** Texts `assemble` must refuse (FC-18 §2: NUL, lone surrogate; §8.4: a newer format). */
export declare const REFUSED_TEXTS: Readonly<Record<string, string>>;
/** The text the edit, save and preference checks open (CR LF, a BOM, a uid, a host key, script hazards). */
export declare const EDIT_TEXT = "\uFEFF{{nyml\r\nkind: document\r\ntitle: Conformance \u2014 \u6F22\u5B57\r\nuid: doc-conformance0a1b2c\r\nx_host_key: kept\r\n}}\r\n\r\n# Conformance\r\n\r\nA paragraph with </script> and \uD835\uDCB3.\r\n\r\nLast line.\r\n";
/** A second document (another uid) for the preference check. */
export declare const OTHER_TEXT = "{{nyml\nkind: document\ntitle: Other\nuid: doc-conformance9z8y7x\n}}\n\n# Other\n";
/** A marker the harness puts in the live DOM; a saved file must never contain it. */
export declare const LIVE_DOM_MARKER = "ORZ-CONFORMANCE-LIVE-DOM-MARKER";
/** A text in a newer format (header `format: 2`): opened, it must be read-only and never saved over (FC-18 §8.4, D7). */
export declare const NEWER_TEXT = "{{nyml\nkind: document\nformat: 2\ntitle: From a newer release\nuid: doc-conformance5f6g7h\n}}\n\n# From a newer release\n\nWritten in a format this release does not write.\n";
/** A long text the preview-isolation check types into (its end is far below the fold). */
export declare const LONG_TEXT: string;
/**
 * A document script that steals the focus (ES5; no double quote, so it fits an HTML attribute): it
 * puts an input in the preview and focuses it every 40 ms, posts a heartbeat
 * (`orz-conformance-theft`) so the harness knows it runs, and on every key it receives reports it
 * (`orz-conformance-stolen`) and forges the preview's own messages — a save key, Escape, "active",
 * a link — and a popup, all inside the user activation that key gives the frame.
 */
export declare const THEFT_SCRIPT: string;
/** A document whose preview runs {@link THEFT_SCRIPT} (from an image error handler, as a document script would). */
export declare const THEFT_TEXT: string;
//# sourceMappingURL=texts.d.ts.map