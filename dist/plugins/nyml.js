"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registry_js_1 = require("../registry.js");
const html_js_1 = require("../html.js");
const nyml_parser_js_1 = require("./nyml_parser.js");
(0, registry_js_1.register)({
    type: 'block',
    aliases: ['nyml'],
    render(_args, body, env) {
        const rawContent = body ?? '';
        let parsedContent;
        try {
            parsedContent = (0, nyml_parser_js_1.parseNymlV2)(rawContent);
        }
        catch {
            parsedContent = { error: 'Failed to parse NYML' };
        }
        // The first block keeps the historical `nyml-data` id; later blocks in the
        // same render get `nyml-data-2`, `-3`, … so a document never carries
        // duplicate ids.
        const state = env;
        const n = (state['__orzNymlCount'] ?? 0) + 1;
        state['__orzNymlCount'] = n;
        const id = n === 1 ? 'nyml-data' : `nyml-data-${n}`;
        // data-md: copy-as-Markdown restores the block (the island is invisible).
        const directive = (0, html_js_1.escapeAttr)(`{{nyml\n${rawContent.trim()}\n}}`);
        return `<script type="application/json" id="${id}" data-md="${directive}">\n${(0, html_js_1.jsonForScript)(parsedContent, 2)}\n</script>\n`;
    },
});
//# sourceMappingURL=nyml.js.map