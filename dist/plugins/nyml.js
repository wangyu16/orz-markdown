"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registry_js_1 = require("../registry.js");
const nyml_parser_js_1 = require("./nyml_parser.js");
(0, registry_js_1.register)({
    type: 'block',
    aliases: ['nyml'],
    render(_args, body, _env) {
        const rawContent = body ?? '';
        let parsedContent;
        try {
            parsedContent = (0, nyml_parser_js_1.parseNymlV2)(rawContent);
        }
        catch {
            parsedContent = { error: 'Failed to parse NYML' };
        }
        const jsonContent = JSON.stringify(parsedContent, null, 2).replace(/<\/script>/gi, '<\\/script>');
        return `<script type="application/json" id="nyml-data">\n${jsonContent}\n</script>\n`;
    },
});
//# sourceMappingURL=nyml.js.map