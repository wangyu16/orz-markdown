"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const nodeEmoji = __importStar(require("node-emoji"));
const registry_js_1 = require("../registry.js");
const html_js_1 = require("../html.js");
(0, registry_js_1.register)({
    type: 'inline',
    aliases: ['emoji', 'em'],
    render(_args, body, _env) {
        const name = body?.trim() ?? '';
        const result = nodeEmoji.get(name);
        // node-emoji returns undefined for unknown names; fall back to original text
        if (!result) {
            return `{{emoji ${(0, html_js_1.escapeHtml)(name)}}}`;
        }
        // data-md: copy restores the directive, so a heading keeps its id
        // (`## {{emoji rocket}} Quick start` slugs without the emoji: round 16, L4).
        return `<span data-md="${(0, html_js_1.escapeAttr)(`{{emoji ${name}}}`)}">${result}</span>`;
    },
});
//# sourceMappingURL=emoji.js.map