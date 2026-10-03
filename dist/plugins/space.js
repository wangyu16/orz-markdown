"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registry_js_1 = require("../registry.js");
(0, registry_js_1.register)({
    type: 'inline',
    aliases: ['space'],
    render(_args, body, _env) {
        const n = parseFloat(body?.trim() ?? '');
        if (!isFinite(n) || n <= 0) {
            return '';
        }
        // Capped: `{{space 100000}}` made the page 1.6 million px wide (round 14).
        return `<span style="display:inline-block;width:${Math.min(n, 100)}rem"></span>`;
    },
});
//# sourceMappingURL=space.js.map