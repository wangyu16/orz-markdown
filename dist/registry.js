"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.hasBlock = hasBlock;
exports.hasInline = hasInline;
exports.getDefinition = getDefinition;
const registry = new Map();
function register(def) {
    for (const alias of def.aliases) {
        registry.set(alias, def);
    }
}
function hasBlock(name) {
    const def = registry.get(name);
    return def !== undefined && def.type === 'block';
}
function hasInline(name) {
    const def = registry.get(name);
    return def !== undefined && def.type === 'inline';
}
function getDefinition(name) {
    return registry.get(name);
}
//# sourceMappingURL=registry.js.map