"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PREFERENCE_PREFIX = exports.READER_PREFERENCES = void 0;
exports.preferenceNamespace = preferenceNamespace;
exports.createPreferenceStore = createPreferenceStore;
/**
 * Reader preferences (FC-18 §6, D5; FC-19 `PreferenceStore`): one reader's
 * choices, stored per browser, never in the text. Namespaced by the document
 * `uid` so instances and documents do not share them; a document without a
 * (well-formed) uid uses the shared namespace `_`.
 *
 * Fails closed: when storage is absent or throws (opaque origins, disabled
 * storage, quota), `get` returns the default and `set` reports `false`. A
 * stored value that is not valid JSON or fails its validator reads as the
 * default.
 */
const save_js_1 = require("./save.js");
const types_js_1 = require("./types.js");
const isNumberIn = (lo, hi) => (v) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isBoolean = (v) => typeof v === 'boolean';
const isIntegerIn = (lo, hi) => (v) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
/** The reader preferences FC-18 §6 names. */
exports.READER_PREFERENCES = {
    /** Editor share of the split view, 0.1–0.9. */
    splitRatio: { default: 0.5, valid: isNumberIn(0.1, 0.9) },
    scrollSync: { default: true, valid: isBoolean },
    viewMode: { default: 'split', valid: (v) => v === 'split' || v === 'editor' || v === 'preview' },
    /** Editor font size in CSS px, 8–40. */
    editorFontSize: { default: 14, valid: isNumberIn(8, 40) },
    /** Dark chrome: `null` follows the system. */
    darkChrome: { default: null, valid: (v) => v === null || typeof v === 'boolean' },
    /**
     * The read view's text size in percent, 25–400 (2.2.0): a reader control of
     * the carrier app (spec/carrier-app.md §4.10), clamped to the kind's range.
     */
    fontScale: { default: 100, valid: isIntegerIn(25, 400) },
};
exports.PREFERENCE_PREFIX = 'orz-pref:';
function preferenceNamespace(uid) {
    return `${exports.PREFERENCE_PREFIX}${typeof uid === 'string' && save_js_1.SHELL_UID_PATTERN.test(uid) ? uid : '_'}:`;
}
function createPreferenceStore(uid, storage, schema = exports.READER_PREFERENCES) {
    const namespace = preferenceNamespace(uid);
    const has = (key) => Object.prototype.hasOwnProperty.call(schema, key);
    /** Resolved at each call: `window.localStorage` itself can throw. */
    const backing = () => {
        if (storage)
            return storage;
        try {
            return (0, types_js_1.globalWindow)()?.localStorage ?? undefined;
        }
        catch {
            return undefined;
        }
    };
    const get = (key) => {
        if (!has(key))
            return undefined;
        const spec = schema[key];
        try {
            const raw = backing()?.getItem(namespace + key);
            if (typeof raw !== 'string')
                return spec.default;
            const value = JSON.parse(raw);
            return spec.valid(value) ? value : spec.default;
        }
        catch {
            return spec.default;
        }
    };
    return {
        namespace,
        get: get,
        set(key, value) {
            if (!has(key) || !schema[key].valid(value))
                return false;
            try {
                const s = backing();
                if (!s)
                    return false;
                s.setItem(namespace + key, JSON.stringify(value));
                return true;
            }
            catch {
                return false;
            }
        },
        remove(key) {
            if (!has(key))
                return;
            try {
                backing()?.removeItem(namespace + key);
            }
            catch { /* fail closed */ }
        },
        all() {
            const out = {};
            for (const k of Object.keys(schema))
                out[k] = get(k);
            return out;
        },
    };
}
//# sourceMappingURL=preferences.js.map