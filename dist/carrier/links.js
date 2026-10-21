"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TWIN_LINKS_RULE = exports.twinHref = void 0;
exports.envTwinNaming = envTwinNaming;
exports.registerTwinLinks = registerTwinLinks;
const index_js_1 = require("../index.js");
const env_js_1 = require("../env.js");
const naming_js_1 = require("./naming.js");
var naming_js_2 = require("./naming.js");
Object.defineProperty(exports, "twinHref", { enumerable: true, get: function () { return naming_js_2.twinHref; } });
/** Name of the core rule on the shared `md`. */
exports.TWIN_LINKS_RULE = 'orz_twin_links';
/**
 * The naming a render's `env.orzTwinLinks` asks for: `undefined` = no rewrite
 * (anything but `true` or an object), `null` = the family names, else the
 * naming. An object that is not a valid naming renders the family names
 * (a stored naming is validated when it is written and read; FC-18 §8.2).
 */
function envTwinNaming(env) {
    const v = (0, env_js_1.rootEnv)(env)['orzTwinLinks'];
    if (v === true)
        return null;
    if (v && typeof v === 'object' && !Array.isArray(v))
        return (0, naming_js_1.readTwinNaming)(v);
    return undefined;
}
/** The core rule: rewrites `link_open` hrefs when `env.orzTwinLinks` is `true` or a naming. */
function twinLinksRule(state) {
    const naming = envTwinNaming(state.env);
    if (naming === undefined)
        return;
    for (const token of state.tokens) {
        if (token.type !== 'inline' || !token.children)
            continue;
        for (const child of token.children) {
            if (child.type !== 'link_open')
                continue;
            const href = child.attrGet('href');
            if (href === null)
                continue;
            const next = (0, naming_js_1.twinHref)(href, naming);
            if (next !== href)
                child.attrSet('href', next);
        }
    }
}
/** Register the twin-link rule on a markdown-it instance (idempotent). */
function registerTwinLinks(target) {
    const ruler = target.core.ruler;
    if (ruler.__find__(exports.TWIN_LINKS_RULE) >= 0)
        return;
    target.core.ruler.push(exports.TWIN_LINKS_RULE, twinLinksRule);
}
registerTwinLinks(index_js_1.md);
//# sourceMappingURL=links.js.map