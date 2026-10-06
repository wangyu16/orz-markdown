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
//# sourceMappingURL=texts.d.ts.map