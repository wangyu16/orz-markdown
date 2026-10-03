"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSpan = registerSpan;
const registry_js_1 = require("../registry.js");
const html_js_1 = require("../html.js");
const env_js_1 = require("../env.js");
function registerSpan(md) {
    (0, registry_js_1.register)({
        type: 'inline',
        aliases: ['span', 'sp'],
        render(args, body, env) {
            // Rendered in its own env on purpose: sharing the document env makes
            // markdown-it-footnote append the footnote list inside every span.
            const inner = md.renderInline(body ?? '', (0, env_js_1.inlineEnv)(env));
            if (!args) {
                return `<span>${inner}</span>`;
            }
            return `<span class="${(0, html_js_1.escapeAttr)(args)}">${inner}</span>`;
        },
    });
}
//# sourceMappingURL=span.js.map