/**
 * Page helpers for a carrier's OWN browser tests (2.2.0, claim H.6;
 * spec/conformance.md §6): the same picker, origin-private-file-system and
 * recording machinery the harness uses, so a carrier's tests of its
 * standalone file (save in place, New document, Save as new copy, the quiet
 * update) run on real `FileSystemFileHandle`s without copying the harness's
 * page code. Node side (they drive a Playwright page); the page-side sources
 * are those of ./page.ts.
 *
 *     await context.addInitScript({ content: initScript('opfs') });
 *     const page = await context.newPage();
 *     await page.goto(fileUrl);
 *     await writeOpfs(page, { name }, openedHtml);        // the opened file, "on disk"
 *     … the reader saves …
 *     expect(await readOpfs(page, { name })).toBe(expectedHtml);
 *     expect(await pageRecords(page, 'picker')).toHaveLength(1);
 */
import { PAGE_LOG, READ_OPFS, WRITE_OPFS } from './page.js';

type Evaluator = { evaluate(expression: string): Promise<unknown> };

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
export function callPage<T>(page: Evaluator, fnSource: string, arg?: unknown): Promise<T> {
  return page.evaluate(`(${fnSource})(${arg === undefined ? '' : JSON.stringify(arg)})`) as Promise<T>;
}

const pathOf = async (page: Evaluator, where: OpfsPlace): Promise<string> => (where.pathname ?? (await page.evaluate('location.pathname')) as string);

/** The text of a file the `opfs` picker made (or {@link writeOpfs} wrote), or null when there is none. */
export async function readOpfs(page: Evaluator, where: OpfsPlace): Promise<string | null> {
  return callPage<string | null>(page, READ_OPFS, { name: where.name, ...(where.folder ? { folder: where.folder } : { pathname: await pathOf(page, where) }) });
}

/** Write a file where the `opfs` picker finds it (the opened file "on disk": the page's own folder by default). */
export async function writeOpfs(page: Evaluator, where: OpfsPlace, data: string): Promise<void> {
  await callPage<boolean>(page, WRITE_OPFS, { name: where.name, data, ...(where.folder ? { folder: where.folder } : { pathname: await pathOf(page, where) }) });
}

/** What the init script recorded in a frame (`dialog`, `pageerror`, `picker`, `write`), optionally of one type. */
export async function pageRecords(page: Evaluator, type?: string): Promise<Array<{ type: string; data: unknown; url: string }>> {
  const all = ((await page.evaluate(`(window[${JSON.stringify(PAGE_LOG)}] || []).slice()`)) ?? []) as Array<{ type: string; data: unknown; url: string }>;
  return type ? all.filter((r) => r.type === type) : all;
}
