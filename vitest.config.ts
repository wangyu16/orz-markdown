import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Two groups. The conformance harness run (tests/conformance.test.ts: ~4 min
 * of real-Chrome work against the stub carrier) runs alone AFTER every other
 * suite: in parallel with them it starved the ratio- and timeout-bounded perf
 * and Chrome tests (R.7, M.5, M.14, E.13 flaked under that load).
 *
 * Default timeouts are raised because the carrier suites' real-Chrome tests
 * share the machine with every other file: a happy-dom import in a
 * `beforeAll` took over 10 s under that load. They are not claims; bounded
 * claims carry their own explicit limits.
 */
const HEAVY = ['tests/conformance.test.ts'];

export default defineConfig({
  test: {
    setupFiles: ['tests/setup.ts'],
    pool: 'forks',
    testTimeout: 20_000,
    hookTimeout: 60_000,
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/**/*.test.ts'], exclude: [...configDefaults.exclude, ...HEAVY], sequence: { groupOrder: 0 } } },
      { extends: true, test: { name: 'conformance', include: HEAVY, sequence: { groupOrder: 1 } } },
    ],
  },
});
