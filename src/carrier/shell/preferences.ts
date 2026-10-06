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
import { SHELL_UID_PATTERN } from './save.js';
import { globalWindow, type StorageLike } from './types.js';

export interface PreferenceSpec<T> {
  default: T;
  valid(value: unknown): value is T;
}

export type PreferenceSchema = Record<string, PreferenceSpec<unknown>>;

const isNumberIn = (lo: number, hi: number) => (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';

/** The reader preferences FC-18 §6 names. */
export const READER_PREFERENCES = {
  /** Editor share of the split view, 0.1–0.9. */
  splitRatio: { default: 0.5, valid: isNumberIn(0.1, 0.9) } as PreferenceSpec<number>,
  scrollSync: { default: true, valid: isBoolean } as PreferenceSpec<boolean>,
  viewMode: { default: 'split', valid: (v: unknown): v is 'split' | 'editor' | 'preview' => v === 'split' || v === 'editor' || v === 'preview' } as PreferenceSpec<'split' | 'editor' | 'preview'>,
  /** Editor font size in CSS px, 8–40. */
  editorFontSize: { default: 14, valid: isNumberIn(8, 40) } as PreferenceSpec<number>,
  /** Dark chrome: `null` follows the system. */
  darkChrome: { default: null, valid: (v: unknown): v is boolean | null => v === null || typeof v === 'boolean' } as PreferenceSpec<boolean | null>,
} satisfies PreferenceSchema;

export type ReaderPreferences = { [K in keyof typeof READER_PREFERENCES]: (typeof READER_PREFERENCES)[K]['default'] };

type ValueOf<S extends PreferenceSchema, K extends keyof S> = S[K] extends PreferenceSpec<infer T> ? T : never;

export interface PreferenceStore<S extends PreferenceSchema = typeof READER_PREFERENCES> {
  /** The stored value, or the default when absent, invalid or unreadable. */
  get<K extends keyof S & string>(key: K): ValueOf<S, K>;
  /** Store a value; `false` when it fails validation or storage refuses it. */
  set<K extends keyof S & string>(key: K, value: ValueOf<S, K>): boolean;
  /** Forget a value (the default applies again). */
  remove<K extends keyof S & string>(key: K): void;
  /** Every key of the schema with its current value. */
  all(): { [K in keyof S]: ValueOf<S, K> };
  /** The storage namespace (`orz-pref:<uid or _>:`). */
  readonly namespace: string;
}

export const PREFERENCE_PREFIX = 'orz-pref:';

export function preferenceNamespace(uid?: string): string {
  return `${PREFERENCE_PREFIX}${typeof uid === 'string' && SHELL_UID_PATTERN.test(uid) ? uid : '_'}:`;
}

export function createPreferenceStore(uid?: string, storage?: StorageLike): PreferenceStore<typeof READER_PREFERENCES>;
export function createPreferenceStore<S extends PreferenceSchema>(uid: string | undefined, storage: StorageLike | undefined, schema: S): PreferenceStore<S>;
export function createPreferenceStore(uid?: string, storage?: StorageLike, schema: PreferenceSchema = READER_PREFERENCES): PreferenceStore<PreferenceSchema> {
  const namespace = preferenceNamespace(uid);
  const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(schema, key);
  /** Resolved at each call: `window.localStorage` itself can throw. */
  const backing = (): StorageLike | undefined => {
    if (storage) return storage;
    try {
      return globalWindow<{ localStorage?: StorageLike }>()?.localStorage ?? undefined;
    } catch {
      return undefined;
    }
  };
  const get = (key: string): unknown => {
    if (!has(key)) return undefined;
    const spec = schema[key];
    try {
      const raw = backing()?.getItem(namespace + key);
      if (typeof raw !== 'string') return spec.default;
      const value: unknown = JSON.parse(raw);
      return spec.valid(value) ? value : spec.default;
    } catch {
      return spec.default;
    }
  };
  return {
    namespace,
    get: get as PreferenceStore<PreferenceSchema>['get'],
    set(key, value) {
      if (!has(key) || !schema[key].valid(value)) return false;
      try {
        const s = backing();
        if (!s) return false;
        s.setItem(namespace + key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      if (!has(key)) return;
      try { backing()?.removeItem(namespace + key); } catch { /* fail closed */ }
    },
    all() {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(schema)) out[k] = get(k);
      return out as { [K in keyof PreferenceSchema]: unknown } as never;
    },
  };
}
