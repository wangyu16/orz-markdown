"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kitParser = kitParser;
const index_js_1 = require("../index.js");
let instance = null;
/**
 * The kit's parser (created once, lazily). Exported from `orz-markdown/carrier`
 * (2.4.0) so a carrier parses a text with exactly the parser `readDocument`
 * and the lints use, and can hand its tokens to `readDocument({ tokens })`.
 * Do not `set()` or `use()` it: it is shared.
 */
function kitParser() {
    return (instance ?? (instance = (0, index_js_1.createMarkdown)(false)));
}
//# sourceMappingURL=parser.js.map