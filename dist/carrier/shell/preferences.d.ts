import { type StorageLike } from './types.js';
export interface PreferenceSpec<T> {
    default: T;
    valid(value: unknown): value is T;
}
export type PreferenceSchema = Record<string, PreferenceSpec<unknown>>;
/** The reader preferences FC-18 §6 names. */
export declare const READER_PREFERENCES: {
    /** Editor share of the split view, 0.1–0.9. */
    splitRatio: PreferenceSpec<number>;
    scrollSync: PreferenceSpec<boolean>;
    viewMode: PreferenceSpec<"split" | "editor" | "preview">;
    /** Editor font size in CSS px, 8–40. */
    editorFontSize: PreferenceSpec<number>;
    /** Dark chrome: `null` follows the system. */
    darkChrome: PreferenceSpec<boolean | null>;
    /**
     * The read view's text size in percent, 25–400 (2.2.0): a reader control of
     * the carrier app (spec/carrier-app.md §4.10), clamped to the kind's range.
     */
    fontScale: PreferenceSpec<number>;
};
export type ReaderPreferences = {
    [K in keyof typeof READER_PREFERENCES]: (typeof READER_PREFERENCES)[K]['default'];
};
type ValueOf<S extends PreferenceSchema, K extends keyof S> = S[K] extends PreferenceSpec<infer T> ? T : never;
export interface PreferenceStore<S extends PreferenceSchema = typeof READER_PREFERENCES> {
    /** The stored value, or the default when absent, invalid or unreadable. */
    get<K extends keyof S & string>(key: K): ValueOf<S, K>;
    /** Store a value; `false` when it fails validation or storage refuses it. */
    set<K extends keyof S & string>(key: K, value: ValueOf<S, K>): boolean;
    /** Forget a value (the default applies again). */
    remove<K extends keyof S & string>(key: K): void;
    /** Every key of the schema with its current value. */
    all(): {
        [K in keyof S]: ValueOf<S, K>;
    };
    /** The storage namespace (`orz-pref:<uid or _>:`). */
    readonly namespace: string;
}
export declare const PREFERENCE_PREFIX = "orz-pref:";
export declare function preferenceNamespace(uid?: string): string;
export declare function createPreferenceStore(uid?: string, storage?: StorageLike): PreferenceStore<typeof READER_PREFERENCES>;
export declare function createPreferenceStore<S extends PreferenceSchema>(uid: string | undefined, storage: StorageLike | undefined, schema: S): PreferenceStore<S>;
export {};
//# sourceMappingURL=preferences.d.ts.map