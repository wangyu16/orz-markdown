"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_QR_OUTPUT = void 0;
const qrcode_svg_1 = __importDefault(require("qrcode-svg"));
const registry_js_1 = require("../registry.js");
const html_js_1 = require("../html.js");
const env_js_1 = require("../env.js");
/** QR SVG characters per render before further codes render as text. */
exports.MAX_QR_OUTPUT = 8000000;
(0, registry_js_1.register)({
    type: 'inline',
    aliases: ['qr', 'qrcode'],
    render(_args, body, env) {
        const content = body?.trim();
        if (!content)
            return '';
        // Every QR module is its own <rect>: output is ~1,100× the content, and a
        // 1 MB document of codes exceeded V8's string limit (pre-existing in 1.6.3;
        // round 18, H5). Past MAX_QR_OUTPUT characters per render, codes show as text.
        const state = (0, env_js_1.rootEnv)(env);
        const used = state['__orzQrOutput'] ?? 0;
        if (used > exports.MAX_QR_OUTPUT)
            return (0, html_js_1.escapeHtml)(`{{qr ${content}}}`);
        const size = 96;
        let rawSvg;
        try {
            rawSvg = new qrcode_svg_1.default({ content, width: size, height: size, padding: 0, color: '#000000', background: '#ffffff' }).svg();
        }
        catch {
            // Past a QR code's capacity the library throws; one directive must not
            // take down the whole render (round 12, M1). Shown as the directive text.
            return (0, html_js_1.escapeHtml)(`{{qr ${content}}}`);
        }
        state['__orzQrOutput'] = used + rawSvg.length;
        const svg = rawSvg.replace('<svg ', `<svg viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet" `);
        // `data-md` carries the source: the QR content is otherwise encoded only in
        // the SVG modules and cannot be recovered for copy-as-markdown.
        const directive = (0, html_js_1.escapeAttr)(`{{qr ${content}${content.endsWith('}') ? ' ' : ''}}}`); // " }}" after a trailing "}"
        return `<span class="qrcode" data-md="${directive}" role="button" tabindex="0" aria-label="Expand QR code" aria-expanded="false"><span class="qrcode__icon" aria-hidden="true">⤢</span>${svg}</span>`;
    },
});
//# sourceMappingURL=qrcode.js.map