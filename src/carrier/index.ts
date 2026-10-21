/**
 * The orz carrier kit core (FC-18 text format 1): the document header, the
 * document facts, twin links and the assembled-file envelope. Exported to
 * consumers through `orz-markdown/carrier` (src/carrier.ts); the parser entry
 * never imports this folder.
 */
export { readHeader, withoutHeader, editHeader, normalizeHeader, setHeaderValue, removeHeaderKey, lintHeader, COMMON_HEADER_KEYS, KIND_HEADER_KEYS, WRITER_KEY, UID_PATTERN } from './header.js';
export type { Header, HeaderBlock, HeaderEntry, HeaderChange, Lint, LintOptions } from './header.js';
export { readDocument, kindFromFilename, twinName, mintUid, SETTING_DEFAULTS } from './document.js';
export type { Kind, DocumentInfo, ReadDocumentOptions, KitToken } from './document.js';
export { twinHref, registerTwinLinks, envTwinNaming, TWIN_LINKS_RULE } from './links.js';
// 2.5.0: twin-link naming (FC-18 §8.2 `twinLinks`, K1) and the parser-based targets of a text (K2)
export { twinNaming, readTwinNaming, sameTwinNaming, isTwinTemplate, twinFileName, textNameOf, FAMILY_NAMING } from './naming.js';
export type { TwinNaming, TwinKind } from './naming.js';
export { includeTargets, linkTargets } from './targets.js';
export type { LinkTarget } from './targets.js';
export { decodeText } from './text.js';
export { assembleEnvelope, extract, readIslandFromDom, skillUrl, eolStyle, hasMixedEol, hasLoneSurrogate, KIND_PACKAGE, SOURCE_ISLAND_ID, SHELL_ISLAND_ID, INCLUDES_ISLAND_ID } from './envelope.js';
export type { ShellParts, Extracted, EolStyle, IslandElement } from './envelope.js';
// 2.3.0: what orz-mdhtml and orz-paged copied (REBUILD §3b KIT GAP) — the synchronous SHA-256, the
// legacy 0.x island reader and the kind-independent core of `inspect`
export { sha256 } from './sha256.js';
export { rawElements, rawAttr, hasRawAttr, decodeEntities, generatorOf, readLegacyIsland } from './legacy.js';
export type { RawElement, LegacyWriter, LegacyIsland } from './legacy.js';
// 2.4.0: the kit's private parser (what readDocument and the lints parse with), for a carrier's own parse of the same text
export { kitParser } from './parser.js';
export { looksHtml, shellWord, scriptElement, assembledStructure, storedText, heldText, twinCheck } from './inspect.js';
export type { ScriptElementInfo, AssembledStructure, StructureOptions, LegacyTextReader, EarlierState, TwinInput, TwinReport } from './inspect.js';
