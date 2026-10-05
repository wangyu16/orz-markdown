/**
 * The orz carrier kit core (FC-18 text format 1): the document header, the
 * document facts, twin links and the assembled-file envelope. Exported to
 * consumers through `orz-markdown/carrier` (src/carrier.ts); the parser entry
 * never imports this folder.
 */
export { readHeader, editHeader, setHeaderValue, removeHeaderKey, lintHeader, COMMON_HEADER_KEYS, KIND_HEADER_KEYS, WRITER_KEY, UID_PATTERN } from './header.js';
export type { Header, HeaderBlock, HeaderEntry, HeaderChange, Lint } from './header.js';
export { readDocument, kindFromFilename, twinName, mintUid, SETTING_DEFAULTS } from './document.js';
export type { Kind, DocumentInfo } from './document.js';
export { twinHref, registerTwinLinks, TWIN_LINKS_RULE } from './links.js';
export { decodeText } from './text.js';
export { assembleEnvelope, extract, readIslandFromDom, skillUrl, eolStyle, hasMixedEol, hasLoneSurrogate, KIND_PACKAGE, SOURCE_ISLAND_ID, SHELL_ISLAND_ID, INCLUDES_ISLAND_ID } from './envelope.js';
export type { ShellParts, Extracted, EolStyle, IslandElement } from './envelope.js';
//# sourceMappingURL=index.d.ts.map