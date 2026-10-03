"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registry_js_1 = require("../registry.js");
const html_js_1 = require("../html.js");
(0, registry_js_1.register)({
    type: 'block',
    aliases: ['smiles', 'sm'],
    render(_args, body, _env) {
        const smiles = body?.trim() ?? '';
        // `data-md` lets copy-as-markdown recover the source after smiles-drawer
        // paints the <canvas> (which has no recoverable text content).
        const directive = (0, html_js_1.escapeAttr)(`{{smiles ${smiles}${smiles.endsWith('}') ? ' ' : ''}}}`);
        return `<div class="smiles-render" data-md="${directive}">\n  <canvas data-smiles="${(0, html_js_1.escapeAttr)(smiles)}" width="250" height="180"></canvas>\n</div>\n`;
    },
});
//# sourceMappingURL=smiles.js.map