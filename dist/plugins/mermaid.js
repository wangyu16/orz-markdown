"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registry_js_1 = require("../registry.js");
const html_js_1 = require("../html.js");
(0, registry_js_1.register)({
    type: 'block',
    aliases: ['mermaid', 'mm'],
    render(_args, body, _env) {
        const content = body?.trim() ?? '';
        // `data-md` lets copy-as-markdown recover the source after client-side
        // mermaid rendering replaces the div contents with an <svg>.
        const directive = `{{mermaid\n${content}\n}}`;
        return `<div class="mermaid" data-md="${(0, html_js_1.escapeAttr)(directive)}">${(0, html_js_1.escapeHtml)(content)}</div>\n`;
    },
});
//# sourceMappingURL=mermaid.js.map