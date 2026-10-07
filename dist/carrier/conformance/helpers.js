"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callPage = callPage;
exports.readOpfs = readOpfs;
exports.writeOpfs = writeOpfs;
exports.pageRecords = pageRecords;
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
const page_js_1 = require("./page.js");
/** Evaluate a page-side function source with one JSON argument (the harness's own way). */
function callPage(page, fnSource, arg) {
    return page.evaluate(`(${fnSource})(${arg === undefined ? '' : JSON.stringify(arg)})`);
}
const pathOf = async (page, where) => (where.pathname ?? (await page.evaluate('location.pathname')));
/** The text of a file the `opfs` picker made (or {@link writeOpfs} wrote), or null when there is none. */
async function readOpfs(page, where) {
    return callPage(page, page_js_1.READ_OPFS, { name: where.name, ...(where.folder ? { folder: where.folder } : { pathname: await pathOf(page, where) }) });
}
/** Write a file where the `opfs` picker finds it (the opened file "on disk": the page's own folder by default). */
async function writeOpfs(page, where, data) {
    await callPage(page, page_js_1.WRITE_OPFS, { name: where.name, data, ...(where.folder ? { folder: where.folder } : { pathname: await pathOf(page, where) }) });
}
/** What the init script recorded in a frame (`dialog`, `pageerror`, `picker`, `write`), optionally of one type. */
async function pageRecords(page, type) {
    const all = ((await page.evaluate(`(window[${JSON.stringify(page_js_1.PAGE_LOG)}] || []).slice()`)) ?? []);
    return type ? all.filter((r) => r.type === type) : all;
}
//# sourceMappingURL=helpers.js.map