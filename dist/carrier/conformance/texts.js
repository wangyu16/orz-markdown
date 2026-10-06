"use strict";
/**
 * The harness's own texts: hazards every carrier must carry exactly (FC-18 §11:
 * any Unicode, CR LF / CR, a BOM, `</script>`, `<!--`, very long lines, the
 * empty text), the texts `assemble` must refuse, and the documents the browser
 * checks open.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LONG_TEXT = exports.NEWER_TEXT = exports.LIVE_DOM_MARKER = exports.OTHER_TEXT = exports.EDIT_TEXT = exports.REFUSED_TEXTS = exports.HAZARD_TEXTS = exports.UID_B = exports.UID_A = void 0;
/** Uids used by the browser checks (well-formed, FC-18 §5.1). */
exports.UID_A = 'doc-conformance0a1b2c';
exports.UID_B = 'doc-conformance9z8y7x';
/** Hazard texts by name. Every one has consistent line endings and no NUL or lone surrogate, so law 1 applies. */
exports.HAZARD_TEXTS = {
    empty: '',
    'crlf-bom': `﻿{{nyml\r\nkind: document\r\ntitle: CR LF and a BOM\r\nuid: ${exports.UID_A}\r\nx_host_key: kept\r\n}}\r\n\r\n# Heading\r\n\r\ntrailing spaces  \r\n`,
    cr: '{{nyml\rkind: document\rtitle: Classic Mac\r}}\r\rclassic line ends\r',
    'bom-only': '﻿',
    'script-close': '# </script><script>alert(1)</script> <SCRIPT src=x> </ScRiPt > <\\/script> <\\\\script>\n\n<!-- a comment --> --> <!-- <!--\n',
    'reserved-ids': '<div id="orz-src">a fake island</div>\n<script id="orz-shell">{"kind":"paged"}</script>\n<script type="text/markdown" id="orz-src">nested</script>\n',
    unicode: '{{nyml\nkind: document\ntitle: 漢字 — 𝒳\nlang: zh-Hans\n}}\n\n𝒳 İ ǅ ß é (é) ​‍ 👩‍🔬   line separator   paragraph separator\n',
    'long-line': `${'word '.repeat(40000)}\n`,
    'no-final-newline': '# Title\n\nno final newline',
    whitespace: '\t\n   \n\t# indented\n  \n\n\n',
    'header-lookalikes': '{{nyml\nkind: document\ntitle: "  quoted  "\nx_alembic_chapter: 3\n}}\n\n```\n{{nyml\nkind: document\ntitle: in code\n}}\n```\n\n{{nyml\nkind: meta\ntitle: later block\n}}\n',
    'html-entities': '&lt;script&gt; &amp;amp; &#x3C;/script> \\< \\& <b>bold</b> <img src=x onerror=alert(1)>\n',
};
/** Texts `assemble` must refuse (FC-18 §2: NUL, lone surrogate; §8.4: a newer format). */
exports.REFUSED_TEXTS = {
    nul: 'a\u0000b\n',
    'lone-surrogate': 'a\uD800b\n',
    'format-2': '{{nyml\nkind: document\nformat: 2\n}}\n\nfrom the future\n',
};
/** The text the edit, save and preference checks open (CR LF, a BOM, a uid, a host key, script hazards). */
exports.EDIT_TEXT = `﻿{{nyml\r\nkind: document\r\ntitle: Conformance — 漢字\r\nuid: ${exports.UID_A}\r\nx_host_key: kept\r\n}}\r\n\r\n# Conformance\r\n\r\nA paragraph with </script> and 𝒳.\r\n\r\nLast line.\r\n`;
/** A second document (another uid) for the preference check. */
exports.OTHER_TEXT = `{{nyml\nkind: document\ntitle: Other\nuid: ${exports.UID_B}\n}}\n\n# Other\n`;
/** A marker the harness puts in the live DOM; a saved file must never contain it. */
exports.LIVE_DOM_MARKER = 'ORZ-CONFORMANCE-LIVE-DOM-MARKER';
/** A text in a newer format (header `format: 2`): opened, it must be read-only and never saved over (FC-18 §8.4, D7). */
exports.NEWER_TEXT = '{{nyml\nkind: document\nformat: 2\ntitle: From a newer release\nuid: doc-conformance5f6g7h\n}}\n\n# From a newer release\n\nWritten in a format this release does not write.\n';
/** A long text the preview-isolation check types into (its end is far below the fold). */
exports.LONG_TEXT = `{{nyml\nkind: document\ntitle: Preview isolation\nuid: doc-conformance3p4q5r\n}}\n\n# Preview isolation\n\n${Array.from({ length: 160 }, (_, i) => `Paragraph ${i + 1} of a long document.\n`).join('\n')}`;
//# sourceMappingURL=texts.js.map