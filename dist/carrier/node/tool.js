"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.carrierNode = carrierNode;
/**
 * `carrierNode(tool)` — a carrier CLI's overwrite rules, bound to one tool
 * (spec/carrier-node.md §3, §6): its name (messages and `next` lines), its
 * kind, its text twin's suffix, its cache folder, its legacy reader. The
 * rules are the same in every carrier (lifted from orz-mdhtml 1.0's
 * src/cli.ts, which orz-paged copied); each CLI keeps only its commands'
 * wording and extras.
 */
const document_js_1 = require("../document.js");
const envelope_js_1 = require("../envelope.js");
const header_js_1 = require("../header.js");
const inspect_js_1 = require("../inspect.js");
const builtins_js_1 = require("./builtins.js");
const cli_js_1 = require("./cli.js");
const files_js_1 = require("./files.js");
const known_states_js_1 = require("./known-states.js");
/** The kinds' tools, for `other-kind` messages. */
const KIND_TOOLS = { md: 'orz-mdhtml', slides: 'orz-slides', paged: 'orz-paged' };
/** Bind the shared CLI rules to one carrier tool. */
function carrierNode(spec) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(spec.name))
        throw new Error(`orz-markdown/carrier/node: ${JSON.stringify(spec.name)} is not a command name`);
    const tool = {
        name: spec.name,
        kind: spec.kind,
        cacheName: spec.cacheName ?? spec.name,
        textSuffix: spec.textSuffix ?? (spec.kind === 'md' ? '.md' : `.${spec.kind}.md`),
        storedText: spec.storedText ?? ((text) => (0, inspect_js_1.storedText)(text, spec.kind)),
        ...(spec.readLegacy ? { readLegacy: spec.readLegacy } : {}),
    };
    const name = tool.name;
    const cache = tool.cacheName;
    const stored = tool.storedText;
    const line = (n) => (0, cli_js_1.commandLine)(name, n);
    const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const suffixRe = new RegExp(`${escaped(tool.textSuffix)}$`, 'i');
    const shown = (p, typed) => {
        if (typed !== undefined)
            return typed;
        const rel = (0, builtins_js_1.path)().relative((0, builtins_js_1.proc)().cwd(), p);
        return rel && !rel.startsWith('..') && !(0, builtins_js_1.path)().isAbsolute(rel) ? rel : p;
    };
    const realOrSelf = (p) => { try {
        return (0, builtins_js_1.fs)().realpathSync(p);
    }
    catch {
        return p;
    } };
    const otherName = (textName) => {
        const stem = (suffixRe.test(textName) ? textName.replace(suffixRe, '') : textName.replace(/\.md$/i, '')).replace(/\.browser(?:-\d+)?$/i, '');
        for (let i = 1;; i++) {
            const n = i === 1 ? `${stem}.browser${tool.textSuffix}` : `${stem}.browser-${i}${tool.textSuffix}`;
            if ((0, builtins_js_1.path)().resolve(n) !== (0, builtins_js_1.path)().resolve(textName) && !(0, builtins_js_1.fs)().existsSync((0, builtins_js_1.path)().resolve(n)))
                return n;
        }
    };
    const legacyText = (html) => (tool.readLegacy ? tool.readLegacy(html)?.text ?? null : null);
    const documentTextOf = (html) => (0, envelope_js_1.extract)(html)?.text ?? legacyText(html);
    const isLegacy = (html) => legacyText(html) !== null;
    const uidOf = (text) => {
        try {
            const uid = (0, document_js_1.readDocument)(text).meta.uid;
            return typeof uid === 'string' && header_js_1.UID_PATTERN.test(uid.trim()) ? uid.trim() : null;
        }
        catch {
            return null;
        }
    };
    const earlierSource = {
        'git-head': 'its last commit',
        'git-index': 'its staged version',
        'git-log': 'one of its recent commits',
        cache: `the text ${name} last wrote or read for this pair`,
        token: 'the text whose SHA-256 --replaces gave',
    };
    const changedAfter = (p, other, words, otherN) => {
        if (!(0, builtins_js_1.fs)().existsSync(p) || !(0, builtins_js_1.fs)().existsSync(other) || !((0, files_js_1.mtime)(p) > (0, files_js_1.mtime)(other)))
            return '';
        if ((0, known_states_js_1.cleanInGit)(p) && (0, known_states_js_1.cleanInGit)(other))
            return '';
        return words(otherN);
    };
    const rememberPair = (twin, file, held, twinText, o, token) => {
        const r = (0, known_states_js_1.recordPair)(cache, twin, file, held, twinText);
        if (r !== 'recorded') {
            const where = r === 'no-cache' ? 'no cache folder: set $XDG_CACHE_HOME or HOME' : `cache not writable: ${(0, known_states_js_1.cacheDir)(cache) ?? ''}`;
            o.warn(`pair not recorded (${where}); the next ${token.command} needs --replaces ${token.sha}`);
        }
        return r;
    };
    /**
     * Whether `out` may be replaced by the assembly of `text` (claims T.7,
     * T.11, T.12, T.14 of the carriers): the same text (as stored): yes; with a
     * token: only that hash; a known earlier state (the pair's record; git for
     * the twin): yes; another document (another uid): never, no next; a 0.x
     * file: upgrade --text first; "only the file changed" (the input is a known
     * state and both carry the same uid): extract brings it in; anything else:
     * extract to another name and merge. Every suggested command is built from
     * the user's own arguments.
     */
    const assembledOutputCheck = (t, existing) => {
        const { input, out, text, names, token, call } = t;
        const isHtml = existing !== null && (0, inspect_js_1.looksHtml)(existing);
        const held = isHtml ? documentTextOf(existing) : null;
        if (held === null) {
            if (existing !== null && existing.trim() === '')
                return { risk: { message: `${names.out} exists and is empty (${(0, builtins_js_1.fs)().statSync(out).size} bytes): a damaged or unfinished file, not an orz file; not replaced (pass --force to replace it — the empty file is kept as ${names.out}~ — or -o another path)`, reason: 'not-orz' }, earlier: null };
            return { risk: { message: `${names.out} exists and is not an orz file; not replaced (pass --force to replace it, or -o another path)`, reason: 'not-orz' }, earlier: null };
        }
        if (held === stored(text))
            return { risk: null, earlier: null };
        const legacy = isLegacy(existing);
        const other = otherName(names.input);
        const heldHash = (0, known_states_js_1.sha256)(held);
        const again = (extra) => line({ command: 'assemble', args: (0, cli_js_1.assembleArgs)(call, names.input, extra) });
        const pull = { command: 'extract', args: [names.out, '-o', other] };
        const legacyPull = { command: 'upgrade', args: [names.out, '--text', other] };
        if (token !== null) {
            if (heldHash === token)
                return { risk: null, earlier: 'token' };
            return {
                risk: {
                    message: `${names.out} no longer holds the text you named (--replaces ${token}): it holds another one (sha256 ${heldHash}) — saved in the browser or written by someone else since; not replaced. Bring its changes in: \`${line(legacy ? legacyPull : pull)}\`, merge them into ${names.input}, then \`${legacy ? `${again(['--replaces'])}\` followed by the sha256 that upgrade printed` : `${again(['--replaces', heldHash])}\``}`,
                    reason: 'replaces-mismatch',
                    next: legacy ? legacyPull : pull,
                },
                earlier: null,
            };
        }
        const earlier = (0, known_states_js_1.earlierStateOf)(cache, input, out, held, stored, { git: names.twin });
        if (earlier !== null)
            return { risk: null, earlier };
        // another document (another well-formed uid) — never "bring its text into this input": nothing to merge, no next
        const heldUid = uidOf(held);
        const ownUid = uidOf(text);
        if (heldUid && ownUid && heldUid !== ownUid) {
            return { risk: { message: `${names.out} holds another document (uid ${heldUid}; ${names.input} is ${ownUid}); not replaced. Choose another -o path, or pass --force to replace it (the old file is kept as ${names.out}~)`, reason: 'output-differs' }, earlier: null };
        }
        if (legacy) {
            return {
                risk: {
                    message: `${names.out} is a legacy ${name} 0.x file holding a different text than ${names.input}; not replaced. Its text is not readable by extract: \`${line(legacyPull)}\` writes its format-1 text to ${other} (and makes ${names.out} a file of this version, printing the sha256 of the text it then holds); compare and merge it into ${names.input}, then \`${again(['--replaces'])}\` followed by that sha256 (it replaces ${names.out} only while it still holds that text)`,
                    reason: 'legacy-file',
                    next: legacyPull,
                },
                earlier: null,
            };
        }
        // only the file changed — and only for the SAME document (the uid-identity gate): neither the record nor git
        // proves that the file was not replaced by another document's file, and following `extract` would then replace
        // the input with that other text
        const sameDocument = heldUid !== null && heldUid === ownUid;
        const unchanged = (0, known_states_js_1.twinStateOf)(cache, input, out, text, { git: names.twin }) !== null;
        if (sameDocument && unchanged) {
            const bring = { command: 'extract', args: [names.out, ...((0, document_js_1.twinName)(out) === input ? [] : ['-o', names.input])] };
            return {
                risk: {
                    message: `${names.out} holds a different text than ${names.input}, and ${names.input} is unchanged since ${name} last synced the pair (or is committed): the file holds newer work (saved in the browser?); not replaced. \`${line(bring)}\` brings it into ${names.input} (no --force needed). To put ${names.input}'s text in the file anyway: \`${again(['--replaces', heldHash])}\``,
                    reason: names.twin ? 'twin-differs' : 'output-differs',
                    next: bring,
                },
                earlier: null,
            };
        }
        if (unchanged) {
            return {
                risk: {
                    message: `${names.out} holds a different text than ${names.input}. ${names.input} is unchanged since ${name} last synced the pair (or is committed), so the file may hold newer work (saved in the browser?) — or another document's text (copied over it): the two texts do not carry the same uid, so it cannot be told; not replaced. Bring its text out and compare: \`${line(pull)}\`; merge what belongs into ${names.input}, then \`${again(['--replaces', heldHash])}\` (it replaces ${names.out} only while it still holds that text)`,
                    reason: names.twin ? 'twin-differs' : 'output-differs',
                    next: pull,
                },
                earlier: null,
            };
        }
        const writer = (0, known_states_js_1.lastWriter)(cache, out);
        const later = writer !== null && writer !== realOrSelf(input)
            ? ` (${name} last wrote it from ${shown(writer)})`
            : changedAfter(out, input, () => ' and was changed after it (saved in the browser?)', names.input);
        if (!names.twin) {
            return {
                risk: {
                    message: `${names.out} holds another text than ${names.input}${later} — not the text ${name} last wrote there from ${names.input}; not replaced. If it has changes ${names.input} lacks, bring them in first: \`${line(pull)}\`, then merge, then \`${again(['--replaces', heldHash])}\` (it replaces ${names.out} only while it still holds that text). When ${names.input} has everything, run again with --force (the old file is kept as ${names.out}~)`,
                    reason: 'output-differs',
                    next: pull,
                },
                earlier: null,
            };
        }
        return {
            risk: {
                message: `${names.out} holds a different text than ${names.input}${later} — not its last commit, nor the text ${name} last wrote there; not replaced. If it has changes ${names.input} lacks, bring them in first: \`${line(pull)}\`, then merge, then \`${again(['--replaces', heldHash])}\` (it replaces ${names.out} only while it still holds that text). When ${names.input} has everything, run again with --force (the old file is kept as ${names.out}~)`,
                reason: 'twin-differs',
                next: pull,
            },
            earlier: null,
        };
    };
    /**
     * Whether the text file `out` may be replaced by `text` (the text of
     * `file`): it does not exist or holds exactly that text; never (without
     * --force) when it holds another document; with a token only that hash; a
     * known state of the pair only for the same document (the uid-identity
     * gate: `uid` non-null and equal to `out`'s); anything else may hold edits
     * the file lacks.
     */
    const textOutputCheck = (t) => {
        const { out, text, file, names, token, uid, advice } = t;
        if (!(0, builtins_js_1.fs)().existsSync(out))
            return { risk: null, earlier: null };
        const existing = (0, files_js_1.readMaybe)(out);
        if (existing === text)
            return { risk: null, earlier: null };
        const h = existing === null ? null : (0, known_states_js_1.sha256)(existing);
        const existingUid = existing === null ? null : uidOf(existing);
        if (uid !== null && existingUid !== null && uid !== existingUid) {
            return { risk: { message: `${names.out} holds another document (uid ${existingUid}; ${names.file} is ${uid}); not overwritten. Write it to another path (-o), or pass --force to replace it (the old text is kept as ${names.out}~)`, reason: 'output-differs' }, earlier: null };
        }
        if (token !== null) {
            if (h === token)
                return { risk: null, earlier: 'token' };
            const a = advice(h ?? '');
            return { risk: { message: `${names.out} no longer holds the text you named (--replaces ${token})${h ? `: it holds another one (sha256 ${h})` : ''}; not overwritten. ${a.message}`, reason: 'replaces-mismatch', ...(a.next ? { next: a.next } : {}) }, earlier: null };
        }
        const known = existing === null ? null : (0, known_states_js_1.twinStateOf)(cache, out, file, existing, { git: (0, document_js_1.twinName)(file) === out });
        if (known !== null && uid !== null && existingUid === uid)
            return { risk: null, earlier: known };
        const later = changedAfter(out, file, (n) => `, changed after ${n}`, names.file);
        const a = advice(h ?? '');
        if (known !== null) {
            return { risk: { message: `${names.out} exists and holds a different text; it is unchanged since ${name} last synced it (or is committed), but ${names.file} and ${names.out} do not carry the same uid, so ${names.file} may hold another document's text (copied over it); not overwritten. ${a.message}`, reason: 'twin-differs', ...(a.next ? { next: a.next } : {}) }, earlier: null };
        }
        return { risk: { message: `${names.out} exists and holds a different text${later} — not the text ${name} last wrote or read for this pair, nor a committed version; not overwritten (it may hold edits ${names.file} lacks). ${a.message}`, reason: 'twin-differs', ...(a.next ? { next: a.next } : {}) }, earlier: null };
    };
    const guard = (p, risk, force, o) => {
        if (risk === null)
            return null;
        if (!force)
            throw new cli_js_1.CliError(risk.message, risk.reason, risk.next);
        return (0, files_js_1.backup)(p, o);
    };
    const others = Object.keys(KIND_TOOLS).filter((k) => KIND_TOOLS[k] !== name).map((k) => escaped(KIND_TOOLS[k])).join('|');
    const libReason = (message) => {
        if (/engine/i.test(message) && /npm run bundle|missing|cannot be used/.test(message))
            return 'engine-unavailable';
        if (/is newer than this tool \(|would downgrade/.test(message))
            return 'newer-shell';
        if (/text format \d+ is newer|format.*above|newer format/i.test(message))
            return 'newer-format';
        if (new RegExp(`not an ${escaped(name)} file|not an orz`).test(message))
            return 'not-orz';
        if (others && new RegExp(`an (?:${others}) file`).test(message))
            return 'other-kind';
        return 'invalid-text';
    };
    return {
        tool,
        io: (json) => (0, cli_js_1.cliIo)(name, json),
        commandLine: line,
        shown,
        otherName,
        documentTextOf,
        uidOf,
        sameDocument: (a, b) => { const u = uidOf(a); return u !== null && u === uidOf(b); },
        cacheDir: () => (0, known_states_js_1.cacheDir)(cache),
        rememberPair,
        earlierStateOf: (twin, file, held, options) => (0, known_states_js_1.earlierStateOf)(cache, twin, file, held, stored, options),
        twinStateOf: (twin, file, current, options) => (0, known_states_js_1.twinStateOf)(cache, twin, file, current, options),
        lastWriter: (file) => (0, known_states_js_1.lastWriter)(cache, file),
        isLastWriter: (twin, file) => (0, known_states_js_1.isLastWriter)(cache, twin, file),
        earlierSource,
        changedAfter,
        assembledOutputCheck,
        textOutputCheck,
        guard,
        libReason,
    };
}
//# sourceMappingURL=tool.js.map