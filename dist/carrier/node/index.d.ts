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
export { carrierNode } from './tool.js';
export type { CarrierTool, CarrierNode, Check, AssembleTarget, TextTarget } from './tool.js';
export { CliError, cliIo, emit, reportFailure, sh, commandLine, replacesToken, assembleArgs, EXIT_OK, EXIT_FAILED, EXIT_USAGE, REASONS, SHA256_PATTERN } from './cli.js';
export type { Reason, Next, Risk, Io, AssembleCall } from './cli.js';
export { readText, readMaybe, writeOut, backup, mtime } from './files.js';
export { sha256, canonical, cacheDir, recordPair, lastWriter, isLastWriter, earlierStateOf, twinStateOf, cleanInGit, GIT_LOG_LIMIT, GIT_BUDGET_MS } from './known-states.js';
export type { KnownState, Remembered } from './known-states.js';
export { isUrl, includeTargets, keepReferenced, unresolvedIncludes, resolveFileIncludes, includePlan } from './includes.js';
export type { IncludeProblem, ResolvedIncludes, Unresolved, Stale, IncludePlan } from './includes.js';
export type { EarlierState } from '../inspect.js';
//# sourceMappingURL=index.d.ts.map