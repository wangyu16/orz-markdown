"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSpan = registerSpan;
const registry_js_1 = require("../registry.js");
function registerSpan(md) {
    (0, registry_js_1.register)({
        type: 'inline',
        aliases: ['span', 'sp'],
        render(args, body, _env) {
            const inner = md.renderInline(body ?? '');
            if (!args) {
                return `<span>${inner}</span>`;
            }
            return `<span class="${args}">${inner}</span>`;
        },
    });
}
//# sourceMappingURL=span.js.map