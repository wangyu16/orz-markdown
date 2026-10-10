import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Four groups, run one after another (unit, the CLI core's matrix, Chrome, the harness). `unit` holds the ratio- and
 * timeout-bounded perf tests (K.14, M.5, R.7, …); the real-Chrome-heavy
 * suites (`chrome`) and the conformance harness run (~4 min against the stub
 * carrier) come after it, so their browser load never shares the machine with
 * a timing claim (K.14, R.7, M.5, M.14, E.13 flaked under that load).
 *
 * Default timeouts are raised because the carrier suites' real-Chrome tests
 * share the machine with every other file: a happy-dom import in a
 * `beforeAll` took over 10 s under that load. They are not claims; bounded
 * claims carry their own explicit limits.
 */
const CHROME = ['tests/browser-copy.test.ts', 'tests/carrier-editor.test.ts', 'tests/carrier-shell.test.ts', 'tests/carrier-update.test.ts', 'tests/carrier-app.test.ts'];
const HEAVY = ['tests/conformance.test.ts'];
/** The CLI core's matrix (N.8: hundreds of in-process CLI runs, git and file I/O): its own group, never beside a timing claim. */
const CLI = ['tests/carrier-node.test.ts'];

export default defineConfig({
  test: {
    setupFiles: ['tests/setup.ts'],
    pool: 'forks',
    testTimeout: 20_000,
    hookTimeout: 60_000,
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/**/*.test.ts'], exclude: [...configDefaults.exclude, ...CHROME, ...HEAVY, ...CLI], sequence: { groupOrder: 0 } } },
      { extends: true, test: { name: 'cli', include: CLI, sequence: { groupOrder: 1 } } },
      { extends: true, test: { name: 'chrome', include: CHROME, sequence: { groupOrder: 2 } } },
      { extends: true, test: { name: 'conformance', include: HEAVY, sequence: { groupOrder: 3 } } },
    ],
  },
});
