"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCjk = isCjk;
exports.registerCjk = registerCjk;
/** CJK ideographs, kana, hangul, bopomofo, CJK punctuation and full-width forms. */
// ー (U+30FC) and its half-width form are Script=Common: `ソニー.jp` lost its tail (round 24, F1).
const CJK = /[\u30FC\uFF70\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}\u3000-\u303F\u31C0-\u31EF\u3200-\u32FF\uFE30-\uFE4F\uFF00-\uFF60\uFF61-\uFFDC\uFFE0-\uFFEE]/u;
/** CJK punctuation and full-width symbols — never part of a URL. */
// Punctuation only: U+3000–303F also holds letters and numbers (々 〆 〇 〡–〩 〱–〵
// 〻 〼, as in 佐々木 and 人々), which belong to words and URLs (round 10, H2).
const CJK_PUNCT = /(?=[\u3000-\u303F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65])[^\p{L}\p{N}]/u;
/** Chinese dash and ellipsis (`——`, `……`): written doubled, never in a URL (round 22, L5). */
const CJK_DOUBLED = /\u2014\u2014|\u2026\u2026/;
/** Non-ASCII that cannot start a host: CJK, emoji, symbols, punctuation, number forms. */
function isLeadNoise(ch) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x80)
        return false;
    return isCjk(cp) || /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{S}\p{P}\p{No}]/u.test(ch);
}
/** Is `cp` a CJK code point (emoji excluded)? */
function isCjk(cp) {
    if (cp < 0x1100)
        return false;
    return CJK.test(String.fromCodePoint(cp));
}
/** U+FE00–FE0E: variation selectors that may follow a CJK character (not emoji VS16). */
function isTextVariationSelector(cp) {
    return cp >= 0xfe00 && cp <= 0xfe0e;
}
/** Ideographic variation selectors (U+E0100–E01EF) follow a CJK base. */
function isIdeographicVariationSelector(cp) {
    return cp >= 0xe0100 && cp <= 0xe01ef;
}
function lastCodePoint(src, pos) {
    if (pos <= 0)
        return [0x20, -1];
    const unit = src.charCodeAt(pos - 1);
    if ((unit & 0xfc00) !== 0xdc00)
        return [unit, pos - 1];
    const cp = src.codePointAt(pos - 2) ?? unit;
    return cp > 0xffff ? [cp, pos - 2] : [unit, pos - 1];
}
function cjkFriendlyEmphasis(md) {
    const Base = md.inline.State;
    const { isWhiteSpace, isMdAsciiPunct, isPunctChar } = md.utils;
    class CjkFriendlyState extends Base {
        scanDelims(start, canSplitWord) {
            const max = this.posMax;
            const marker = this.src.charCodeAt(start);
            const [lastChar, lastCharPos] = lastCodePoint(this.src, start);
            // A text variation selector belongs to the character before it.
            let lastMain = lastChar;
            let beforeSelector = null;
            if (isTextVariationSelector(lastChar)) {
                beforeSelector = lastCodePoint(this.src, lastCharPos)[0];
                if (!/^\p{Zs}/u.test(String.fromCodePoint(beforeSelector)))
                    lastMain = beforeSelector;
            }
            let pos = start;
            while (pos < max && this.src.charCodeAt(pos) === marker)
                pos++;
            const count = pos - start;
            const nextChar = pos < max ? (this.src.codePointAt(pos) ?? 0x20) : 0x20;
            const lastSpace = isWhiteSpace(lastMain);
            const nextSpace = isWhiteSpace(nextChar);
            if (lastSpace || nextSpace) {
                return { can_open: !nextSpace, can_close: !lastSpace, length: count };
            }
            const lastPunct = isMdAsciiPunct(lastMain) || isPunctChar(String.fromCodePoint(lastMain));
            const nextPunct = isMdAsciiPunct(nextChar) || isPunctChar(String.fromCodePoint(nextChar));
            let leftFlanking = lastPunct;
            let rightFlanking = nextPunct;
            if (canSplitWord) {
                const prevCjk = beforeSelector !== null ? isCjk(beforeSelector) : isCjk(lastChar) || isIdeographicVariationSelector(lastChar);
                const eitherCjk = isCjk(nextChar) || prevCjk;
                leftFlanking || (leftFlanking = eitherCjk || !nextPunct);
                rightFlanking || (rightFlanking = eitherCjk || !lastPunct);
            }
            return { can_open: leftFlanking, can_close: rightFlanking, length: count };
        }
    }
    md.inline.State = CjkFriendlyState;
}
/** Full-width bracket pairs that may sit inside a URL path. */
const FULLWIDTH_PAIRS = { '（': '）', '【': '】', '「': '」', '『': '』', '〈': '〉', '《': '》', '〔': '〕' };
/** Curly quotes: prose, never part of a URL. */
const QUOTE = /[\u2018\u2019\u201C\u201D]/u;
/** Emoji: prose after a host, but linkify-it keeps them in a path. */
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20E3]/u;
const isAsciiLetter = (c) => (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
const isAsciiDigit = (c) => c >= 0x30 && c <= 0x39;
const isSpace = (c) => c === 0x20 || c === 0x0a || c === 0x09 || c === 0x0d;
/**
 * Positions where a URL must end, found in ONE forward pass from `from`
 * (`first`: stop at the first boundary or whitespace and return it). linkify-it
 * accepts any Unicode letter in a host or path, so Chinese prose with no spaces
 * runs straight into a match (`访问https://orz.how获取更多`). A boundary is:
 *
 * - CJK punctuation or a curly quote (`。` `，` `“`), anywhere — except a
 *   full-width bracket pair closed within the path (`（1949年）`);
 * - in a HOST — no `/`, `?` or `#` yet since the last `://` or whitespace — a
 *   CJK character or emoji right after an ASCII letter or digit (`orz.how获取`,
 *   `192.168.1.1获取`, `orz.how😀`). A host label does not run from ASCII into
 *   CJK, so this is prose.
 *
 * In a path, query or fragment, CJK and emoji stay in the URL, as linkify-it
 * links them: `/item/Java语言`, `/wiki/化学`, `?q=北京+天气`, `#第1章`. There
 * `/docs获取更多` (prose glued on) and `/Java语言` (a page) cannot be told apart,
 * and a wrong link target is worse than a link that runs into prose; write a
 * space or punctuation after a URL path. (Round 8 cut paths too and broke
 * valid URLs: round 9, HIGH-2.) One exception: raw CJK right after a
 * percent-escape (`?wd=%E4%B8%AD获取`) is prose. CJK after ASCII punctuation never cuts, so
 * `www.百度.com` and `新华网.中国` stay whole.
 */
function scanBoundaries(text, from, first) {
    const out = [];
    let inPath = false;
    let closing = ''; // the full-width closer a path is waiting for
    for (let i = from; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (isSpace(c)) {
            if (first)
                return [i];
            inPath = false;
            closing = '';
            continue;
        }
        if (c < 0x80) {
            if (c === 0x3a && text.startsWith('://', i)) {
                inPath = false;
                closing = '';
                i += 2;
            }
            else if (c === 0x2f || c === 0x3f || c === 0x23)
                inPath = true;
            continue;
        }
        if (i === 0)
            continue;
        const cp = text.codePointAt(i) ?? 0;
        const ch = String.fromCodePoint(cp);
        let cut = CJK_PUNCT.test(ch) || QUOTE.test(ch) || CJK_DOUBLED.test(text.slice(i, i + 2));
        // A full-width bracket pair inside a path is part of it (`/中华人民共和国（1949年）`).
        if (cut && inPath) {
            if (closing && ch === closing) {
                cut = false;
                closing = '';
            }
            else if (FULLWIDTH_PAIRS[ch]) {
                // Bounded look-ahead: an unbounded search per bracket was quadratic (round 11, H1b).
                const window = text.slice(i + 1, i + 65);
                const close = window.indexOf(FULLWIDTH_PAIRS[ch]);
                if (close >= 0 && !/\s/.test(window.slice(0, close))) {
                    cut = false;
                    closing = FULLWIDTH_PAIRS[ch];
                }
            }
        }
        // Raw CJK right after an encoded CJK character is prose: an author who
        // encodes a URL (`?wd=%E4%B8%AD`) does not go on in raw CJK (`…%AD获取`).
        // Only after an escaped UTF-8 byte (`%E4%B8%AD获取`): after an escaped ASCII
        // character (`?q=%23中国`, `C%2B%2B标准`) the CJK is the query (round 11, H4).
        if (!cut && inPath && isCjk(cp) && i >= 3 && text.charCodeAt(i - 3) === 0x25 && /^[89A-Fa-f][0-9A-Fa-f]$/.test(text.slice(i - 2, i)))
            cut = true;
        if (!cut && !inPath && (isCjk(cp) || EMOJI.test(ch))) {
            // In a host, CJK or an emoji right after an ASCII letter or digit is
            // prose (`orz.how获取`, `192.168.1.1获取`); after `.` or `-` it may be an
            // IDN label (`www.百度.com`).
            const prev = text.charCodeAt(i - 1);
            if (isAsciiLetter(prev) || isAsciiDigit(prev))
                cut = true;
            else if (EMOJI.test(ch) && prev < 0x80 && !isSpace(prev))
                cut = true;
        }
        if (cut) {
            if (first)
                return [i];
            out.push(i);
            inPath = false; // a new URL may start after the prose
        }
        if (cp > 0xffff)
            i++;
    }
    return first ? [text.length] : out;
}
/**
 * Keep linkify-it from reading Chinese prose as part of a URL, BEFORE
 * markdown-it uses its matches: `matchAtStart` (inline rule, scheme URLs) sees
 * only the text up to the first boundary; `match` (core rule, the rest) runs on
 * the pieces between boundaries. The text after a URL therefore stays source
 * text that the inline parser reads normally — code spans, emphasis, links, a
 * second URL after `，`. A fuzzy match that swallowed the CJK before its host
 * (`请访问www.baidu.com`, a different punycoded domain) is narrowed to the host.
 */
function trimLinkifiedCjk(md) {
    const linkify = md.linkify;
    const match = linkify.match.bind(linkify);
    const matchAtStart = linkify.matchAtStart.bind(linkify);
    // markdown-it's inline linkify rule calls matchAtStart with the rest of the
    // paragraph (`state.src.slice(pos)`). Boundaries are computed ONCE per
    // paragraph and the text is cut at the next one BEFORE linkify-it runs: its
    // path pattern runs to the next whitespace — in Chinese prose the end of the
    // paragraph — so asking it first and cutting after was quadratic for URLs cut
    // at `。` (round 12, H2), and scanning per call before it was too (round 11).
    // One entry per inline state, not one slot: an image alt or an inline
    // footnote parses with its own state in the middle of the outer paragraph,
    // and a single slot was overwritten and recomputed per URL (round 13, H1).
    const paragraphs = new WeakMap(); // cuts null: ASCII
    let current = null;
    const rules = md.inline.ruler.__rules__;
    const inlineRule = rules.find((r) => r.name === 'linkify');
    if (inlineRule) {
        const fn = inlineRule.fn;
        inlineRule.fn = (state, silent) => {
            current = state;
            try {
                return fn(state, silent);
            }
            finally {
                current = null;
            }
        };
    }
    const firstCutAfter = (cuts, at) => {
        let lo = 0, hi = cuts.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (cuts[mid] <= at)
                lo = mid + 1;
            else
                hi = mid;
        }
        return lo < cuts.length ? cuts[lo] : Infinity;
    };
    linkify.matchAtStart = (text) => {
        const state = current;
        if (state && state.src.length >= text.length) {
            // Everything about the paragraph is computed once, the ASCII test too
            // (testing it per call was quadratic for a paragraph of ASCII URLs).
            let paragraph = paragraphs.get(state);
            if (!paragraph || paragraph.src !== state.src) {
                paragraph = { src: state.src, cuts: /[^\x00-\x7F]/.test(state.src) ? scanBoundaries(state.src, 0, false) : null };
                paragraphs.set(state, paragraph);
            }
            if (!paragraph.cuts)
                return matchAtStart(text); // ASCII paragraph: nothing to cut
            const offset = state.src.length - text.length;
            const end = firstCutAfter(paragraph.cuts, offset) - offset;
            return matchAtStart(end < text.length ? text.slice(0, end) : text);
        }
        // Called from elsewhere: ask linkify-it first, scan only its match.
        const m = matchAtStart(text);
        if (!m || !/[^\x00-\x7F]/.test(m.raw))
            return m;
        const end = scanBoundaries(m.raw, 1, true)[0];
        return end < m.raw.length ? matchAtStart(m.raw.slice(0, end)) : m;
    };
    // markdown-it's core rule asks test() on the whole text first, and
    // linkify-it says no to `请访问www.baidu.com获取` (`com获取` is no TLD): the
    // narrowed match() never ran (round 22, M1). linkify-it's own match() calls
    // this.test() too, so inside it the original answers.
    const test = linkify.test.bind(linkify);
    let testing = false;
    linkify.test = (text) => {
        if (testing || !/[^\x00-\x7F]/.test(text))
            return test(text);
        testing = true;
        try {
            return (linkify.match(text) ?? []).length > 0;
        }
        finally {
            testing = false;
        }
    };
    // …and before test(), pretest() on the whole block: it wants a TLD followed
    // by space or punctuation, so `访问 github.com获取` was skipped outright
    // (round 23, M1). For non-ASCII text any `.` or `@` lets the narrowed test decide.
    const pretest = linkify.pretest.bind(linkify);
    linkify.pretest = (text) => pretest(text) || (/[^\x00-\x7F]/.test(text) && /[.@]/.test(text));
    linkify.match = (text) => {
        if (!/[^\x00-\x7F]/.test(text))
            return match(text);
        const out = [];
        // Pieces between boundaries; whitespace stays inside a piece (linkify
        // handles it), so only boundaries split.
        const cuts = [...scanBoundaries(text, 0, false), text.length];
        let start = 0;
        for (const end of cuts) {
            if (end <= start)
                continue;
            const piece = text.slice(start, end);
            for (const m of match(piece) ?? []) {
                const narrowed = dropLeadNoise({ ...m, index: m.index + start, lastIndex: m.lastIndex + start });
                if (narrowed)
                    out.push(narrowed);
            }
            start = end;
        }
        return out; // never null once test() said yes: markdown-it reads .length
    };
    function dropLeadNoise(m) {
        const chars = Array.from(m.raw);
        let lead = 0;
        while (lead < chars.length && isLeadNoise(chars[lead]))
            lead++;
        // A whole non-ASCII label (`百度.com`, `例え.jp`, `①.com`) is the author's
        // IDN host; a run glued onto ASCII (`请访问www.baidu.com`, `👉www.x.com`)
        // is prose (round 14, M2).
        // Han, kana or hangul running into full-width Latin (`请访问ｗｗｗ.baidu.com`)
        // is prose glued onto a host markdown-it would punycode wrongly anyway
        // (`ｗｗｗ` is not `www` to it): no link (round 23, L1).
        const run = chars.slice(0, lead).join('');
        if (/[\u30FC\uFF70\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}][\uFF21-\uFF3A\uFF41-\uFF5A]/u.test(run))
            return null; // letters only: `東京２０２０.com` is a label (round 24, F7)
        if (lead === 0 || chars[lead] === '.' || chars[lead] === '-')
            return m; // `百度-x.com` is one IDN label
        const kept = chars.slice(lead).join('');
        const again = match(kept);
        if (!again || again.length !== 1 || again[0].index !== 0 || again[0].lastIndex !== kept.length)
            return null;
        const offset = m.raw.length - kept.length;
        return { ...again[0], index: m.index + offset, lastIndex: m.lastIndex, raw: kept };
    }
}
function registerCjk(md) {
    cjkFriendlyEmphasis(md);
    trimLinkifiedCjk(md);
}
//# sourceMappingURL=cjk.js.map