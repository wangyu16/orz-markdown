/**
 * The opened file (spec/carrier-app.md §2): what the page knows about the
 * assembled file it was opened from — read from its own DOM at boot, never
 * from anything the document's content could forge after load (the
 * envelope's islands are written before any shell markup, FC-18 §8.1):
 *
 * - the text (`readIslandFromDom(#orz-src)`: exact, line endings and BOM
 *   restored) and its header facts (uid, format);
 * - the shell (`#orz-shell`): its delivery (kept by every save, B#7);
 * - the resolved includes (`#orz-includes`, D4: a page cannot resolve them again);
 * - the engine (`#orz-engine` without `src`: the inline bundle's exact text);
 * - the twin-link naming (`#orz-shell` `"links"`, FC-18 §8.2; 2.5.0);
 * - the reader-copy setting (`#orz-shell` `"readerCopy"`, FC-18 §8.2; 2.9.0);
 * - the file name (the page's last path segment when it names a file of this
 *   kind — or, 2.5.0, a page of this kind under the file's naming, given its
 *   dual name back).
 */
import { type ReaderCopy } from '../read.js';
import { type TwinNaming } from '../naming.js';
import type { AppDocument, AppElement, CarrierKindName, OpenedFile } from './types.js';
/** The source island, or null when the page is not an assembled file (an app page, the update sandbox). */
export declare function sourceIsland(doc: AppDocument): AppElement | null;
/** The file's delivery (`#orz-shell`); `inline` unless it says `cdn`. */
export declare function shellDelivery(doc: AppDocument): 'inline' | 'cdn';
/** (2.5.0) The file's twin-link naming (`#orz-shell` `"links"`), as `extract` reads it: undefined for the family naming or an invalid value. */
export declare function shellTwinLinks(doc: AppDocument): TwinNaming | undefined;
/** (2.9.0) The file's reader-copy setting (`#orz-shell` `"readerCopy"`), as `extract` reads it: undefined when absent or invalid. */
export declare function shellReaderCopy(doc: AppDocument): ReaderCopy | undefined;
/** `#orz-includes` read as `extract` reads it (string values of own keys only); undefined when empty or absent. */
export declare function shellIncludes(doc: AppDocument): Record<string, string> | undefined;
/**
 * The opened file's name when the page's URL names a file of this kind, else
 * `document` + the kind's extension. (2.5.0) With the file's twin-link
 * naming, a page published under that naming's name gets its dual name back
 * (`week1.html` with `{ md: '{stem}.html' }` → `week1.md.html`): a saved or
 * downloaded copy keeps a name that says its kind (FC-08).
 */
export declare function openedFileName(loc: {
    readonly pathname?: string;
} | undefined, kind: CarrierKindName, naming?: TwinNaming | null): string;
/** The name a new copy of a file is offered under: `notes.md.html` → `notes copy.md.html`. */
export declare function copyName(fileName: string, kind: CarrierKindName): string;
/** Read the opened file from the page (null when the page is not an assembled file). */
export declare function readOpenedFile(doc: AppDocument, kind: CarrierKindName): OpenedFile | null;
//# sourceMappingURL=file.d.ts.map