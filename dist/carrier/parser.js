"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kitParser = kitParser;
const index_js_1 = require("../index.js");
let instance = null;
/** The kit's parser (created once, lazily). */
function kitParser() {
    return (instance ?? (instance = (0, index_js_1.createMarkdown)(false)));
}
//# sourceMappingURL=parser.js.map