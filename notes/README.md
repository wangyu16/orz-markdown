# Developer notes

Not published (outside the npm `files` list and the `docs/` website).

| File | What it is |
|---|---|
| [`CLAIMS.md`](CLAIMS.md) | The claims registry: every guarantee the package makes, each bound to a test by its id (`[M.16] …`). `tests/claims.test.ts` fails on an unbound claim or an unknown id. Live — update it when behaviour changes. |
| [`closed-loop.md`](closed-loop.md) | The hardening record: rounds 1–24, owner decisions and the closure (2026-10-02). History; a new hardening round starts from its last entry. |
| [`carrier-kit-loop.md`](carrier-kit-loop.md) | The closed-loop record of the carrier kit (carrier rebuild): rounds, findings, dismissals. |

Inactive material lives in [`../archive/`](../archive/).
