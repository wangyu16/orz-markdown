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
 * (`orz-conformance-stolen`) and forges the preview's own messages — a save key, the view key,
 * Escape, "active", a link — and a popup, all inside the user activation that key gives the frame.
 */
export declare const THEFT_SCRIPT: string;
/** A document whose preview runs {@link THEFT_SCRIPT} (from an image error handler, as a document script would). */
export declare const THEFT_TEXT: string;
/**
 * What a document that replaced the preview's own (`document.open()`, a navigation, a meta refresh)
 * would do to get the bridge's private port (ES5; no double quote): ask for it with readies — plain,
 * with a channel, with a guessed secret, every 250 ms — and, should it get a port, send a save, the
 * view key, Escape, a link and a scroll through it. `window.__orzGot` records `[port]` when it got one.
 */
export declare const GRAB_SCRIPT: string;
/** The page a document's meta refresh navigates its preview to (served by the harness on its other origin). */
export declare const GRAB_PAGE = "<!doctype html><meta charset=\"utf-8\"><title>replaced preview</title><script>window.__orzGot='';addEventListener('message',function(e){var d=e.data;if(d&&d.type==='orz-preview-port'&&e.ports&&e.ports[0]){window.__orzGot+='[port]';var P=e.ports[0];P.postMessage({type:'orz-preview-key',key:'s'});P.postMessage({type:'orz-preview-key',key:'\\\\'});P.postMessage({type:'orz-preview-key',key:'Escape'});P.postMessage({type:'orz-preview-link',href:'https://example.org/port'});P.postMessage({type:'orz-preview-scrolled',top:0,max:100000})}},true);var n=0,T=parent,ask=function(){T.postMessage({type:'orz-preview-ready'},'*');T.postMessage({type:'orz-preview-ready',channel:'g1'},'*');T.postMessage({type:'orz-preview-ready',channel:'g2',secret:'guess'},'*');if(++n<12)setTimeout(ask,250)};ask()</script>";
/**
 * Documents whose previews are replaced or nested by their own content (round 3 of closed loop 2, the
 * vectors of option B): a nested `<iframe srcdoc>` that steals the focus and posts forged readies,
 * keys and links to the top; `document.open()` then {@link GRAB_SCRIPT}; a meta refresh to an http
 * page of another origin (`grabUrl`, serving {@link GRAB_PAGE}) and one to a `data:` URL running it.
 */
export declare function replacedTexts(grabUrl: string): Record<string, string>;
/**
 * A document with includes (FC-18 §8.3, D4) and the resolved includes its file carries in
 * `#orz-includes` (keys in code-unit order, as the island stores them). A page cannot resolve local
 * includes again: its saves and its quiet update must carry these over exactly. The same text and
 * includes are the corpus file `md/includes.md` and its manifest entry.
 */
export declare const INCLUDE_TEXT = "{{nyml\nkind: document\nformat: 1\ntitle: Titration lab \u2014 with includes\nuid: doc-conformance1i2n3c\n}}\n\n# Titration lab\n\n{{md parts/safety-rules.md}}\n\nProcedure follows.\n\n{{md https://example.org/notes/glossary.md}}\n";
export declare const INCLUDES: Readonly<Record<string, string>>;
//# sourceMappingURL=texts.d.ts.map