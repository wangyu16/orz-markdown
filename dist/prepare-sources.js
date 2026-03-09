"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareSources = prepareSources;
/**
 * Pre-processes a markdown source string by fetching any URL-based markdown includes.
 *
 * Scans for `{{markdown https://...}}` or `{{md-include https://...}}` patterns,
 * fetches each URL, and replaces the directive with the fetched markdown content.
 *
 * Call this before `md.render(src)` when URL includes may be present.
 */
async function prepareSources(src) {
    const pattern = /\{\{(?:markdown|md-include)\s+(https?:\/\/[^\s}]+)\}\}/g;
    const matches = [...src.matchAll(pattern)];
    if (!matches.length)
        return src;
    let result = src;
    for (const m of matches) {
        const [fullMatch, url] = m;
        try {
            const res = await fetch(url);
            const text = await res.text();
            result = result.replace(fullMatch, text);
        }
        catch {
            // If fetch fails, leave the directive in place (block dispatcher will ignore unknown URL)
        }
    }
    return result;
}
//# sourceMappingURL=prepare-sources.js.map