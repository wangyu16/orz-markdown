"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const qrcode_svg_1 = __importDefault(require("qrcode-svg"));
const registry_js_1 = require("../registry.js");
(0, registry_js_1.register)({
    type: 'inline',
    aliases: ['qr', 'qrcode'],
    render(_args, body, _env) {
        const content = body?.trim();
        if (!content)
            return '';
        const size = 96;
        const rawSvg = new qrcode_svg_1.default({ content, width: size, height: size, padding: 0, color: '#000000', background: '#ffffff' }).svg();
        const svg = rawSvg.replace('<svg ', `<svg viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet" `);
        return `<span class="qrcode" role="button" tabindex="0" aria-label="Expand QR code" aria-expanded="false"><span class="qrcode__icon" aria-hidden="true">⤢</span>${svg}</span>`;
    },
});
//# sourceMappingURL=qrcode.js.map