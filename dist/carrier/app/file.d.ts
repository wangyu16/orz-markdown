import type { AppDocument, AppElement, CarrierKindName, OpenedFile } from './types.js';
/** The source island, or null when the page is not an assembled file (an app page, the update sandbox). */
export declare function sourceIsland(doc: AppDocument): AppElement | null;
/** The file's delivery (`#orz-shell`); `inline` unless it says `cdn`. */
export declare function shellDelivery(doc: AppDocument): 'inline' | 'cdn';
/** `#orz-includes` read as `extract` reads it (string values of own keys only); undefined when empty or absent. */
export declare function shellIncludes(doc: AppDocument): Record<string, string> | undefined;
/** The opened file's name when the page's URL names a file of this kind, else `document` + the kind's extension. */
export declare function openedFileName(loc: {
    readonly pathname?: string;
} | undefined, kind: CarrierKindName): string;
/** The name a new copy of a file is offered under: `notes.md.html` → `notes copy.md.html`. */
export declare function copyName(fileName: string, kind: CarrierKindName): string;
/** Read the opened file from the page (null when the page is not an assembled file). */
export declare function readOpenedFile(doc: AppDocument, kind: CarrierKindName): OpenedFile | null;
//# sourceMappingURL=file.d.ts.map