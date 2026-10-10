"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registry_js_1 = require("../registry.js");
const html_js_1 = require("../html.js");
/** `t=90`, `t=1m30s`, `start=90` → seconds (0 when absent or malformed). */
function startSeconds(query) {
    const m = /(?:^|[&#])(?:t|start)=(?:(\d{1,6})s?|(?:(\d{1,3})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s)?)(?:&|$)/.exec(query);
    if (!m)
        return 0;
    return m[1] ? Number(m[1]) : Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}
(0, registry_js_1.register)({
    type: 'block',
    aliases: ['youtube', 'yt'],
    render(_args, body, _env) {
        const id = body?.trim();
        if (!id)
            return '';
        const directive = (0, html_js_1.escapeAttr)(`{{youtube ${id}${id.endsWith('}') ? ' ' : ''}}}`);
        // A full YouTube URL (watch?v=, youtu.be/, /embed/, /shorts/) embeds its
        // video id, as documented; anything else is taken as the id itself.
        const fromUrl = /^(?:https?:\/\/)?(?:(?:www|m|music)\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i.exec(id);
        // A bare id may carry a query, as 1.6.3 passed through (`ID?t=42`): its
        // start time is kept (round 21, B-M2).
        const bare = fromUrl ? null : /^([A-Za-z0-9_-]{1,64})(?:\?(.*))?$/.exec(id);
        const video = fromUrl ? fromUrl[1] : bare ? bare[1] : '';
        // A video id is [A-Za-z0-9_-]: ".." resolved the embed to youtube.com's
        // front page (round 20). Anything else stays visible as its directive, and
        // copies back as one, rather than vanishing.
        if (!video)
            return `<p class="youtube-embed-invalid" data-md="${directive}">${(0, html_js_1.escapeHtml)(`{{youtube ${id}}}`)}</p>\n`;
        const start = startSeconds(fromUrl ? id.slice(id.indexOf('?') + 1) : bare?.[2] ?? '');
        const query = start ? `?start=${start}` : '';
        // The video's address, which paper prints in place of the frame (common.css's print layer; 2.3.0, M.30).
        const url = `https://youtu.be/${encodeURIComponent(video)}${start ? `?t=${start}` : ''}`;
        // The id lands in a URL path: encode it so a stray quote or slash cannot
        // break out of the attribute or point the embed somewhere else.
        return (`<div class="youtube-embed" data-md="${directive}" data-url="${(0, html_js_1.escapeAttr)(url)}">\n` +
            `  <iframe src="https://www.youtube.com/embed/${(0, html_js_1.escapeAttr)(encodeURIComponent(video))}${query}"\n` +
            `    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"\n` +
            `    referrerpolicy="strict-origin-when-cross-origin"\n` +
            `    allowfullscreen></iframe>\n` +
            `</div>\n`);
    },
});
//# sourceMappingURL=youtube.js.map