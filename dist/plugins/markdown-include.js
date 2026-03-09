"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMarkdownInclude = registerMarkdownInclude;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const registry_js_1 = require("../registry.js");
function registerMarkdownInclude(md) {
    (0, registry_js_1.register)({
        type: 'block',
        aliases: ['markdown', 'md', 'md-include'],
        render(_args, body, env) {
            const filePath = body?.trim();
            if (!filePath)
                return '';
            const envObj = env;
            // Guard against nested includes
            if (envObj['markdownIncludeActive'])
                return '';
            // Resolve path: prefer env.markdownBasePath (document dir) over process.cwd()
            const basePath = envObj['markdownBasePath'] ?? process.cwd();
            const resolved = path_1.default.isAbsolute(filePath)
                ? filePath
                : path_1.default.resolve(basePath, filePath);
            let source;
            try {
                source = fs_1.default.readFileSync(resolved, 'utf8');
            }
            catch {
                return '';
            }
            envObj['markdownIncludeActive'] = true;
            try {
                return md.render(source, env);
            }
            finally {
                envObj['markdownIncludeActive'] = false;
            }
        },
    });
}
//# sourceMappingURL=markdown-include.js.map