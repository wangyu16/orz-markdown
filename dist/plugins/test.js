"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registry_js_1 = require("../registry.js");
(0, registry_js_1.register)({
    type: 'block',
    aliases: ['test-block'],
    render: (_args, _body, _env) => '<div class="test-block">TestPluginBlock</div>\n',
});
(0, registry_js_1.register)({
    type: 'inline',
    aliases: ['test-inline'],
    render: (_args, _body, _env) => '<span class="test-inline">TestPluginInline</span>',
});
//# sourceMappingURL=test.js.map