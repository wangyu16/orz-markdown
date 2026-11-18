/**
 * Reader copy (FC-18 §8.2 `readerCopy`, orz-markdown 2.9.0): an assembled
 * file published for readers (a website's page) says so in `#orz-shell` as
 * `"readerCopy"`, so its in-file editor tells a reader at once that edits
 * cannot be saved back to the page's address and that "Download a copy"
 * keeps them (spec/carrier-app.md §4.5a).
 *
 * The value is DATA the file carries: `{}` (the kit's words) or
 * `{ "notice": "…" }` (the host's words — plain text, never markup).
 * Parser-free and import-free: `extract`, the envelope and the carrier app
 * use it without loading the Markdown parser.
 */

/** A file's reader-copy setting: `notice` is the host's words, else the kit's default. */
export interface ReaderCopy {
  notice?: string;
}

/** Longest notice accepted (a sentence or two, not a document). */
export const READER_COPY_NOTICE_MAX = 300;

/** The kit's words when a file has no notice of its own. */
export const READER_COPY_NOTICE = 'You’re editing your own copy. Changes can’t be saved to this website — use “Download a copy” to keep them.';

// C0 and C1 controls, DEL, and the line / paragraph separators: a notice is one line of text
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/;

/**
 * Validate and normalize a reader-copy setting: `null` for none (`undefined`,
 * `null`, `false`); `{}` for `true` or `{}` (the kit's words); `{ notice }`
 * for an object with a notice — its runs of spaces, tabs and line breaks
 * collapsed to one space and trimmed, 1 to {@link READER_COPY_NOTICE_MAX}
 * characters, no other control character. Throws a `TypeError` for anything
 * else (an unknown key, a notice that is not such a string, another type).
 */
export function readerCopy(value: unknown): ReaderCopy | null {
  if (value === undefined || value === null || value === false) return null;
  if (value === true) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`orz carrier: readerCopy is true, false or { notice }, not ${Array.isArray(value) ? 'an array' : typeof value}`);
  }
  const src = value as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    if (key !== 'notice') throw new TypeError(`orz carrier: unknown key "${key}" in readerCopy (only "notice")`);
  }
  if (!Object.prototype.hasOwnProperty.call(src, 'notice') || src['notice'] === undefined) return {};
  const raw = src['notice'];
  if (typeof raw !== 'string') throw new TypeError('orz carrier: readerCopy.notice must be a string');
  const notice = raw.replace(/[\t\n\r ]+/g, ' ').trim();
  if (notice === '') throw new TypeError('orz carrier: readerCopy.notice is empty (leave it out for the default words)');
  if (notice.length > READER_COPY_NOTICE_MAX) throw new TypeError(`orz carrier: readerCopy.notice is longer than ${READER_COPY_NOTICE_MAX} characters`);
  if (CONTROL.test(notice)) throw new TypeError('orz carrier: readerCopy.notice holds a control character');
  return { notice };
}

/** Like {@link readerCopy}, but `null` for an invalid value instead of throwing: for values read from a file. */
export function readReaderCopy(value: unknown): ReaderCopy | null {
  try { return readerCopy(value); } catch { return null; }
}

/** The words a reader sees for a (normalized or raw) setting: its notice, else the kit's. */
export function readerCopyNotice(value: ReaderCopy | null | undefined): string {
  return value?.notice ?? READER_COPY_NOTICE;
}
