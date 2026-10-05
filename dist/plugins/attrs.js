"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAttrs = parseAttrs;
exports.registerAttrs = registerAttrs;
const registry_js_1 = require("../registry.js");
function parseAttrs(attrString) {
    const result = [];
    // Match: .classname, #idname, key="value", or bare key
    const re = /\.([^\s.#=]+)|#([^\s.#=]+)|([a-zA-Z][\w-]*)(?:="([^"]*)")?/g;
    let m;
    while ((m = re.exec(attrString)) !== null) {
        if (m[1]) {
            result.push(['class', m[1]]);
        }
        else if (m[2]) {
            result.push(['id', m[2]]);
        }
        else if (m[3]) {
            result.push([m[3], m[4] ?? '']);
        }
    }
    return result;
}
function registerAttrs(md, registry = true) {
    // The inline token acts as a marker; actual work is done in the core rule
    // `registry: false` for a second, private instance (the carrier kit's parser):
    // the global plugin registry keeps the shared `md`'s definitions.
    if (registry) {
        (0, registry_js_1.register)({
            type: 'inline',
            aliases: ['attrs'],
            render(_args, _body, _env) {
                // Rendered content is empty — the core rule removes this token and
                // applies the attributes to the preceding block token instead
                return '';
            },
        });
    }
    // One pass per inline token (a splice per marker, and an attrSet walk per
    // distinct key, were quadratic: round 18, M1).
    md.core.ruler.push('attrs_resolve', (state) => {
        for (let i = 0; i < state.tokens.length; i++) {
            const blockToken = state.tokens[i];
            if (blockToken.type !== 'inline')
                continue;
            const children = blockToken.children ?? [];
            if (!children.some((c) => c.type === 'plugin_inline' && c.info === 'attrs'))
                continue;
            const prevToken = state.tokens[i - 1];
            const target = prevToken && prevToken.nesting === 1 ? prevToken : null;
            const merged = new Map(target?.attrs ?? []);
            let changed = false;
            const kept = [];
            for (const child of children) {
                if (child.type !== 'plugin_inline' || child.info !== 'attrs') {
                    kept.push(child);
                    continue;
                }
                const attrString = child.meta?.args;
                if (attrString && target) {
                    for (const [key, val] of parseAttrs(attrString)) {
                        merged.set(key, val);
                        changed = true;
                    }
                }
            }
            if (target && changed)
                target.attrs = Array.from(merged);
            // `## Title {{attrs[#x]}}` would otherwise leave a trailing space in the
            // heading text (and in TOC entries): trim it when markers ended the line.
            const last = children[children.length - 1];
            if (last.type === 'plugin_inline' && last.info === 'attrs') {
                const prevChild = kept[kept.length - 1];
                if (prevChild && prevChild.type === 'text')
                    prevChild.content = prevChild.content.replace(/\s+$/, '');
            }
            blockToken.children = kept;
        }
    });
}
//# sourceMappingURL=attrs.js.map