# E2E Indexers Integrity Audit

- Generated At: `2026-02-25T19:31:00Z` (UTC, approximate)
- Repository: `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana`
- Scope: Cross-indexer integrity comparison for classic vs substream and REST vs GraphQL using matrix runs in normal and docker-focused contexts.

## 2026-02-27 status

Passed checks:
- `DRY_RUN=1 AGENT_COUNT=20 bunx tsx examples/collection-flow.ts` completed successfully.
- Dry-run prepared `20/20` assets and applied collection-pointer association in skip-send mode.
- `NODE_OPTIONS='--experimental-vm-modules' bunx jest tests/unit/indexer-client-full.test.ts tests/unit/indexer-graphql-client.test.ts tests/unit/sdk-solana.test.ts tests/unit/feedback-manager-full.test.ts tests/unit/hash-chain-replay.test.ts tests/unit/collection-methods.test.ts tests/unit/sdk-solana-extended.test.ts tests/unit/sdk-solana-deep.test.ts --runInBand` passed (`8/8` suites, `399/399` tests).

Remaining gaps:
- Devnet/on-chain E2E parity for these SDK flows still depends on external RPC/indexer availability and was not rerun in this local unit pass.

## Run Matrix

| Context | Run ID | Run Status | Classic vs Substream Mismatches | Seed/Write Status |
| --- | --- | --- | ---: | --- |
| Normal | `integrity-normal-20260225-202957` | `failed` | `0` | `failed` |
| Docker-focused | `integrity-docker-20260225-203053` | `failed` | `0` | `failed` |
| Consolidated rerun | `localnet-full-20260225-211017` | `passed` | `3` | `passed` |

## Context Configuration

| Context | Classic REST | Classic GraphQL | Substream REST | Substream GraphQL | Docker Hook Mode |
| --- | --- | --- | --- | --- | --- |
| Normal | `http://127.0.0.1:3005/rest/v1` | `http://127.0.0.1:3015/graphql` | `http://127.0.0.1:3006/rest/v1` | `http://127.0.0.1:3016/graphql` | Default `docker ps --format "{{.Names}}"` |
| Docker-focused | `http://127.0.0.1:3005/rest/v1` | `http://127.0.0.1:3015/v2/graphql` | `http://127.0.0.1:3006/rest/v1` | `http://127.0.0.1:3016/v2/graphql` | Explicit container assertions for `8004-subquery-node` and `8004-subquery-graphql` |

## Integrity Results

### 1) Classic vs Substream (same transport)

- `integrity-normal-20260225-202957`: overall mismatch count `0` (`rest=0`, `graphql=0`)
- `integrity-docker-20260225-203053`: overall mismatch count `0` (`rest=0`, `graphql=0`)
- Observed parity fields: `available`, `global.total_agents`, `global.total_feedbacks`, `global.total_collections`, `leaderboard.count`, `leaderboard.top_asset`, `seed_asset_found`.

### 2) REST vs GraphQL (same backend)

- Both contexts produced the same REST-vs-GraphQL divergence pattern.
- Classic REST vs Classic GraphQL mismatch count: `4`
- Substream REST vs Substream GraphQL mismatch count: `4`

Concrete REST-vs-GraphQL differences (same in both contexts):

| Field | REST Value | GraphQL Value |
| --- | --- | --- |
| `global.total_agents` | `8` | `0` |
| `global.total_feedbacks` | `13` | `0` |
| `leaderboard.count` | `5` | `0` |
| `leaderboard.top_asset` | `8ZvAmKA9iFYZXu9JBUs6zV8jSV1YZQdLEgtzADxWTB3K` | `null` |

### 3) Seed/Write Visibility

- Both runs failed in `seed-write` before producing a `seedAsset`.
- `seedAsset`: `null` in both contexts.
- `seedAssetFound`: `null` in all check artifacts (no seeded asset propagated to visibility checks).
- Error recorded in both seed artifacts: `registerAgent succeeded without asset address`.
- Diagnostic observation from local reproduction: registration response returned `success: false` with root config initialization error, which aligns with missing write visibility.

Latest consolidated rerun (`localnet-full-20260225-211017`):
- `seed-write`: **passed**
- `seed_asset_found`: `true` on classic REST and substream REST checks
- run status: **passed**
- note: residual inter-indexer mismatches remain on REST counters/top asset (`overallMismatchCount=3`)

### Latest Artifact (passed run)

- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers/localnet-full-20260225-211017/run-summary.json`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers/localnet-full-20260225-211017/comparison/report.json`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers/localnet-full-20260225-211017/comparison/report.md`

## Docker Context Checks

- `docker-pre` and `docker-post` passed in both runs.
- Container names confirmed: `8004-subquery-graphql`, `8004-subquery-node`.

## Exact Artifact Paths

- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/runlog.md`

- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-normal-20260225-202957/run-summary.json`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-normal-20260225-202957/comparison/report.json`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-normal-20260225-202957/comparison/report.md`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-normal-20260225-202957/jobs/seed-write.json`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-normal-20260225-202957/jobs/classic-rest.json`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-normal-20260225-202957/jobs/classic-graphql.json`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-normal-20260225-202957/jobs/substream-rest.json`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-normal-20260225-202957/jobs/substream-graphql.json`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-normal-20260225-202957/jobs/docker-pre.json`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-normal-20260225-202957/jobs/docker-post.json`

- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-docker-20260225-203053/run-summary.json`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-docker-20260225-203053/comparison/report.json`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-docker-20260225-203053/comparison/report.md`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-docker-20260225-203053/jobs/seed-write.json`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-docker-20260225-203053/jobs/classic-rest.json`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-docker-20260225-203053/jobs/classic-graphql.json`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-docker-20260225-203053/jobs/substream-rest.json`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-docker-20260225-203053/jobs/substream-graphql.json`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-docker-20260225-203053/jobs/docker-pre.json`
- `/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/artifacts/e2e-indexers-integrity/integrity-docker-20260225-203053/jobs/docker-post.json`
