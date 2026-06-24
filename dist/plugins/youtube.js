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
    aliases: ['youtube', 'yt'],
    render(_args, body, _env) {
        const id = body?.trim();
        if (!id)
            return '';
        const directive = escapeAttr(`{{youtube ${id}}}`);
        return (`<div class="youtube-embed" data-md="${directive}">\n` +
            `  <iframe src="https://www.youtube.com/embed/${id}"\n` +
            `    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"\n` +
            `    referrerpolicy="strict-origin-when-cross-origin"\n` +
            `    allowfullscreen></iframe>\n` +
            `</div>\n`);
    },
});
//# sourceMappingURL=youtube.js.map