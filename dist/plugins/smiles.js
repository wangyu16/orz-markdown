"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registry_js_1 = require("../registry.js");
function escapeAttr(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
(0, registry_js_1.register)({
    type: 'block',
    aliases: ['smiles', 'sm'],
    render(_args, body, _env) {
        const smiles = body?.trim() ?? '';
        return `<div class="smiles-render">\n  <canvas data-smiles="${escapeAttr(smiles)}" width="250" height="180"></canvas>\n</div>\n`;
    },
});
//# sourceMappingURL=smiles.js.map