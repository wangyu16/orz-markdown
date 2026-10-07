type Evaluator = {
    evaluate(expression: string): Promise<unknown>;
};
/** Where a file is in the origin-private file system: the page's own folder (default, `pathname` of the page) or a named one. */
export interface OpfsPlace {
    /** The file name. */
    name: string;
    /** The page path whose folder holds it (default: the page's own `location.pathname`). */
    pathname?: string;
    /** A named folder instead (a picker that opened elsewhere: `window.__orzConformancePickIn = { folder }`). */
    folder?: string;
}
/** Evaluate a page-side function source with one JSON argument (the harness's own way). */
export declare function callPage<T>(page: Evaluator, fnSource: string, arg?: unknown): Promise<T>;
/** The text of a file the `opfs` picker made (or {@link writeOpfs} wrote), or null when there is none. */
export declare function readOpfs(page: Evaluator, where: OpfsPlace): Promise<string | null>;
/** Write a file where the `opfs` picker finds it (the opened file "on disk": the page's own folder by default). */
export declare function writeOpfs(page: Evaluator, where: OpfsPlace, data: string): Promise<void>;
/** What the init script recorded in a frame (`dialog`, `pageerror`, `picker`, `write`), optionally of one type. */
export declare function pageRecords(page: Evaluator, type?: string): Promise<Array<{
    type: string;
    data: unknown;
    url: string;
}>>;
export {};
//# sourceMappingURL=helpers.d.ts.map