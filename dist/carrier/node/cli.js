"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHA256_PATTERN = exports.commandLine = exports.sh = exports.CliError = exports.REASONS = exports.EXIT_USAGE = exports.EXIT_FAILED = exports.EXIT_OK = void 0;
exports.cliIo = cliIo;
exports.emit = emit;
exports.reportFailure = reportFailure;
exports.replacesToken = replacesToken;
exports.assembleArgs = assembleArgs;
/**
 * The shared vocabulary of a carrier's CLI (FC-10; spec/carrier-node.md §2):
 * exit statuses, the reason codes of a refusal, the `next` command that
 * resolves one, the error a command throws, and the output channel (human
 * lines, or one JSON object for agents).
 */
const builtins_js_1 = require("./builtins.js");
/** Exit statuses: 0 done, 1 refused or failed, 2 usage error. */
exports.EXIT_OK = 0;
exports.EXIT_FAILED = 1;
exports.EXIT_USAGE = 2;
/** Every reason code, in the order above. */
exports.REASONS = Object.freeze(['bad-usage', 'no-such-file', 'unreadable', 'not-utf8', 'write-failed', 'exists', 'not-orz', 'twin-differs', 'output-differs', 'replaces-mismatch', 'legacy-file', 'newer-shell', 'newer-format', 'unclosed-island', 'other-kind', 'assembled-input', 'invalid-text', 'engine-unavailable', 'no-browser', 'failed']);
/** An expected failure: printed as a message (or `{ ok: false, reason, next }` with --json), never as a stack. */
class CliError extends Error {
    constructor(message, codeOrReason = exports.EXIT_FAILED, next) {
        super(message);
        this.code = typeof codeOrReason === 'number' ? codeOrReason : exports.EXIT_FAILED;
        this.reason = typeof codeOrReason === 'string' ? codeOrReason : this.code === exports.EXIT_USAGE ? 'bad-usage' : 'failed';
        if (next)
            this.next = next;
    }
}
exports.CliError = CliError;
/** The output channel of `tool` (`--json`: one object on stdout, see {@link emit}). */
function cliIo(tool, json) {
    const warned = [];
    return {
        json,
        warned,
        say(line) { if (!json)
            (0, builtins_js_1.proc)().stdout.write(`${line}\n`); },
        warn(line) { warned.push(line); if (!json)
            (0, builtins_js_1.proc)().stderr.write(`${tool}: warning: ${line}\n`); },
    };
}
/** With --json, print the result: `{ ok: true, …result, warnings }`. */
function emit(o, result) {
    if (o.json)
        (0, builtins_js_1.proc)().stdout.write(`${JSON.stringify({ ok: true, ...result, warnings: o.warned }, null, 2)}\n`);
}
/**
 * Report a failure and return its exit status: with --json one object
 * `{ ok: false, command, error, reason, next?, exitCode }` on stdout, else
 * `<tool> <command>: <message>` on stderr (and the help hint for a usage error).
 */
function reportFailure(tool, command, e, json) {
    const err = e instanceof CliError ? e : new CliError(e instanceof Error ? e.message : String(e));
    if (json)
        (0, builtins_js_1.proc)().stdout.write(`${JSON.stringify({ ok: false, command, error: err.message, reason: err.reason, ...(err.next ? { next: err.next } : {}), exitCode: err.code }, null, 2)}\n`);
    else
        (0, builtins_js_1.proc)().stderr.write(`${tool} ${command}: ${err.message}\n${err.code === exports.EXIT_USAGE ? `(see ${tool} ${command} --help)\n` : ''}`);
    return err.code;
}
/** A word of a command line, quoted for a POSIX shell when needed. */
const sh = (word) => (/^[\w./@%+=:,-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`);
exports.sh = sh;
/** `<tool> <command> <args…>` for a message (the same words as the `next` object). */
const commandLine = (tool, n) => `${tool} ${n.command} ${n.args.map(exports.sh).join(' ')}`.trimEnd();
exports.commandLine = commandLine;
/** The SHA-256 a `--replaces` token must be: 64 hex digits. */
exports.SHA256_PATTERN = /^[0-9a-fA-F]{64}$/;
/** A `--replaces` token, checked: lowercased, or null when not given; anything else is a usage error. */
function replacesToken(value) {
    if (value === undefined)
        return null;
    if (!exports.SHA256_PATTERN.test(value))
        throw new CliError(`--replaces needs the fingerprint of the text the file should still hold: the 64-character "sha256" value that inspect, extract and assemble print — got ${JSON.stringify(value)}`, exports.EXIT_USAGE);
    return value.toLowerCase();
}
/** The arguments of the user's own `assemble` (output, delivery, includes) for a suggested re-run, plus `extra`. */
function assembleArgs(call, file, extra = []) {
    const args = [file];
    if (call.out !== undefined)
        args.push('-o', call.out);
    if (call.delivery)
        args.push(`--${call.delivery}`);
    if (call.resolveIncludes && !extra.includes('--resolve-includes'))
        args.push('--resolve-includes');
    if (call.noIncludes && !extra.includes('--resolve-includes'))
        args.push('--no-includes'); // they exclude each other
    return [...args, ...extra];
}
//# sourceMappingURL=cli.js.map