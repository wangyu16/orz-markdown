"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registry_js_1 = require("../registry.js");
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
(0, registry_js_1.register)({
    type: 'block',
    aliases: ['mermaid', 'mm'],
    render(_args, body, _env) {
        const content = body?.trim() ?? '';
        return `<div class="mermaid">${escapeHtml(content)}</div>\n`;
    },
});
//# sourceMappingURL=mermaid.js.map