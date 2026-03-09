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
        const svg = new qrcode_svg_1.default({ content, width: 96, height: 96, padding: 0, color: '#000000', background: '#ffffff' }).svg();
        return `<span class="qrcode">${svg}</span>`;
    },
});
//# sourceMappingURL=qrcode.js.map