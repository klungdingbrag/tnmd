# TNMD v1.3.2 — FROZEN BASELINE

Status: **STABLE / PASS**

Freeze branch: `freeze/v1.3.2`

## Baseline

- Version: TNMD v1.3.2
- Customer baseline: FBR
- Page size: 100
- Total pages: 4
- Active transactions: 238
- Total piutang: Rp203.200.000

## Test Result

`tnmd132_runAllTests`

- `tnmd132_testPagination` — PASS
- `tnmd132_testCustomerApi` — PASS
- Overall status — PASS

Generated baseline test timestamp:
`2026-08-23T04:07:07.822Z`

## Freeze Policy

This branch is the reference baseline for future TNMD development.

Do not modify the v1.3.2 implementation directly when starting v1.4. New development should branch from this frozen baseline.

## Architecture Boundary

TNMD v1.3.2 remains dependent on the TNMD v1.3 Customer Ledger Engine and does not replace the underlying engine or the main Code.gs.

## Next Version

Future development target: **TNMD v1.4**.

Recommended approach:

1. Keep `freeze/v1.3.2` immutable.
2. Create a dedicated v1.4 development branch from this freeze.
3. Preserve v1.3.2 API behavior as the regression baseline.
4. Add v1.4 features incrementally with dedicated tests.
