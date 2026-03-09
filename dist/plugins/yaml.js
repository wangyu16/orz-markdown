"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registry_js_1 = require("../registry.js");
(0, registry_js_1.register)({
    type: 'block',
    aliases: ['yaml', 'yml'],
    render(_args, body, _env) {
        const content = (body ?? '').replace(/<\/script>/gi, '<\\/script>');
        return `<script type="application/yaml">\n${content}\n</script>\n`;
    },
});
//# sourceMappingURL=yaml.js.map