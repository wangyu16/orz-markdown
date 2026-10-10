"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.includePlan = exports.resolveFileIncludes = exports.unresolvedIncludes = exports.keepReferenced = exports.includeTargets = exports.isUrl = exports.GIT_BUDGET_MS = exports.GIT_LOG_LIMIT = exports.cleanInGit = exports.twinStateOf = exports.earlierStateOf = exports.isLastWriter = exports.lastWriter = exports.recordPair = exports.cacheDir = exports.canonical = exports.sha256 = exports.mtime = exports.backup = exports.writeOut = exports.readMaybe = exports.readText = exports.SHA256_PATTERN = exports.REASONS = exports.EXIT_USAGE = exports.EXIT_FAILED = exports.EXIT_OK = exports.assembleArgs = exports.replacesToken = exports.commandLine = exports.sh = exports.reportFailure = exports.emit = exports.cliIo = exports.CliError = exports.carrierNode = void 0;
/**
 * `orz-markdown/carrier/node` (2.3.0) — the Node-only core every carrier's CLI
 * shares (spec/carrier-node.md): the known earlier states of a pair (git and
 * the CLI's pair/last-writer records), `--replaces` tokens, backups, atomic
 * writes, includes from the text's folder, the uid-identity gate, the shared
 * reason codes and `next` commands, and the overwrite guards — bound to one
 * tool by {@link carrierNode}.
 *
 * NODE ONLY. It reaches Node built-ins through `process.getBuiltinModule`
 * (Node ≥ 20.16), never by a static import, and no other entry of the
 * package imports it: no browser bundle holds it.
 */
var tool_js_1 = require("./tool.js");
Object.defineProperty(exports, "carrierNode", { enumerable: true, get: function () { return tool_js_1.carrierNode; } });
var cli_js_1 = require("./cli.js");
Object.defineProperty(exports, "CliError", { enumerable: true, get: function () { return cli_js_1.CliError; } });
Object.defineProperty(exports, "cliIo", { enumerable: true, get: function () { return cli_js_1.cliIo; } });
Object.defineProperty(exports, "emit", { enumerable: true, get: function () { return cli_js_1.emit; } });
Object.defineProperty(exports, "reportFailure", { enumerable: true, get: function () { return cli_js_1.reportFailure; } });
Object.defineProperty(exports, "sh", { enumerable: true, get: function () { return cli_js_1.sh; } });
Object.defineProperty(exports, "commandLine", { enumerable: true, get: function () { return cli_js_1.commandLine; } });
Object.defineProperty(exports, "replacesToken", { enumerable: true, get: function () { return cli_js_1.replacesToken; } });
Object.defineProperty(exports, "assembleArgs", { enumerable: true, get: function () { return cli_js_1.assembleArgs; } });
Object.defineProperty(exports, "EXIT_OK", { enumerable: true, get: function () { return cli_js_1.EXIT_OK; } });
Object.defineProperty(exports, "EXIT_FAILED", { enumerable: true, get: function () { return cli_js_1.EXIT_FAILED; } });
Object.defineProperty(exports, "EXIT_USAGE", { enumerable: true, get: function () { return cli_js_1.EXIT_USAGE; } });
Object.defineProperty(exports, "REASONS", { enumerable: true, get: function () { return cli_js_1.REASONS; } });
Object.defineProperty(exports, "SHA256_PATTERN", { enumerable: true, get: function () { return cli_js_1.SHA256_PATTERN; } });
var files_js_1 = require("./files.js");
Object.defineProperty(exports, "readText", { enumerable: true, get: function () { return files_js_1.readText; } });
Object.defineProperty(exports, "readMaybe", { enumerable: true, get: function () { return files_js_1.readMaybe; } });
Object.defineProperty(exports, "writeOut", { enumerable: true, get: function () { return files_js_1.writeOut; } });
Object.defineProperty(exports, "backup", { enumerable: true, get: function () { return files_js_1.backup; } });
Object.defineProperty(exports, "mtime", { enumerable: true, get: function () { return files_js_1.mtime; } });
var known_states_js_1 = require("./known-states.js");
Object.defineProperty(exports, "sha256", { enumerable: true, get: function () { return known_states_js_1.sha256; } });
Object.defineProperty(exports, "canonical", { enumerable: true, get: function () { return known_states_js_1.canonical; } });
Object.defineProperty(exports, "cacheDir", { enumerable: true, get: function () { return known_states_js_1.cacheDir; } });
Object.defineProperty(exports, "recordPair", { enumerable: true, get: function () { return known_states_js_1.recordPair; } });
Object.defineProperty(exports, "lastWriter", { enumerable: true, get: function () { return known_states_js_1.lastWriter; } });
Object.defineProperty(exports, "isLastWriter", { enumerable: true, get: function () { return known_states_js_1.isLastWriter; } });
Object.defineProperty(exports, "earlierStateOf", { enumerable: true, get: function () { return known_states_js_1.earlierStateOf; } });
Object.defineProperty(exports, "twinStateOf", { enumerable: true, get: function () { return known_states_js_1.twinStateOf; } });
Object.defineProperty(exports, "cleanInGit", { enumerable: true, get: function () { return known_states_js_1.cleanInGit; } });
Object.defineProperty(exports, "GIT_LOG_LIMIT", { enumerable: true, get: function () { return known_states_js_1.GIT_LOG_LIMIT; } });
Object.defineProperty(exports, "GIT_BUDGET_MS", { enumerable: true, get: function () { return known_states_js_1.GIT_BUDGET_MS; } });
var includes_js_1 = require("./includes.js");
Object.defineProperty(exports, "isUrl", { enumerable: true, get: function () { return includes_js_1.isUrl; } });
Object.defineProperty(exports, "includeTargets", { enumerable: true, get: function () { return includes_js_1.includeTargets; } });
Object.defineProperty(exports, "keepReferenced", { enumerable: true, get: function () { return includes_js_1.keepReferenced; } });
Object.defineProperty(exports, "unresolvedIncludes", { enumerable: true, get: function () { return includes_js_1.unresolvedIncludes; } });
Object.defineProperty(exports, "resolveFileIncludes", { enumerable: true, get: function () { return includes_js_1.resolveFileIncludes; } });
Object.defineProperty(exports, "includePlan", { enumerable: true, get: function () { return includes_js_1.includePlan; } });
//# sourceMappingURL=index.js.map