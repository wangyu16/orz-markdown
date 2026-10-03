"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registry_js_1 = require("../registry.js");
const html_js_1 = require("../html.js");
(0, registry_js_1.register)({
    type: 'block',
    aliases: ['yaml', 'yml'],
    render(_args, body, _env) {
        // Reversible escape of every `</script` / `<script` spelling (`</script >`,
        // `</script/>` and `</script\tx>` all close the island; replacing only the
        // literal `</script>` let the rest run as HTML: round 11, H3). Read the
        // island back with `unescapeScriptText`.
        const content = (0, html_js_1.escapeScriptText)(body ?? '');
        const directive = (0, html_js_1.escapeAttr)(`{{yaml\n${(body ?? '').trim()}\n}}`);
        return `<script type="application/yaml" data-md="${directive}">\n${content}\n</script>\n`;
    },
});
//# sourceMappingURL=yaml.js.map