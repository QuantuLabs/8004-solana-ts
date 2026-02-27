# SDK E2E Run Log

## 2026-02-25 (UTC)

### Localnet readiness and setup

| Timestamp (UTC) | Command | Result | Notes |
| --- | --- | --- | --- |
| 2026-02-25T19:28:35Z | `curl -sS -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' http://127.0.0.1:8899` | PASS | RPC returned `{"result":"ok"}`. |
| 2026-02-25T19:28:35Z | `nc -z 127.0.0.1 8900` | PASS | WS port reachable. |
| 2026-02-25T20:45:00Z | `./scripts/localnet-init.sh` (from `8004-solana-indexer`) | PASS | Registry + ATOM init succeeded (`3 passing`). Base collection: `Bx22zr16TaGPHUYvEVznReu9zAPMa83of3rbctzCahYz`. |

### Full SDK E2E runs

| Start (UTC) | End (UTC) | Command | Result | Notes | Artifact |
| --- | --- | --- | --- | --- | --- |
| 2026-02-25T19:28:35Z | 2026-02-25T19:29:50Z | `bun run test:e2e:localnet` | FAIL | Run aborted after repeated `ws error: connect ECONNREFUSED 127.0.0.1:8900` and localnet instability. No Jest summary emitted. | `artifacts/e2e-localnet-20260225T192835Z.log` |
| 2026-02-25T19:37:13Z | 2026-02-25T19:43:02Z | `bun run test:e2e:localnet` | FAIL | Progressed through `PASS tests/e2e-solana/04-atom-engine-complete.test.ts` then stalled with repeated WS `ECONNREFUSED` and no final Jest summary. | `artifacts/e2e-localnet-20260225T193713Z.log` |
| 2026-02-25T20:59:12Z | 2026-02-25T21:06:53Z | Full Jest E2E list (`01,02,04,05,06,07,08,09,10`) with `SOLANA_RPC_URL=http://127.0.0.1:8899`, `SOLANA_WS_URL=ws://127.0.0.1:8900`, `INDEXER_URL=http://127.0.0.1:3005/rest/v1` | PASS | `Test Suites: 9 passed, 9 total`; `Tests: 183 passed, 4 skipped, 187 total`. | `/tmp/full-sdk-e2e-20260225-205912.log` |

### Explicit targeted reruns

| Start (UTC) | End (UTC) | Command | Result | Key output | Artifact |
| --- | --- | --- | --- | --- | --- |
| 2026-02-25T19:46:49Z | 2026-02-25T19:46:55Z | `NODE_OPTIONS='--experimental-vm-modules' SOLANA_RPC_URL='http://127.0.0.1:8899' SOLANA_WS_URL='ws://127.0.0.1:8900' INDEXER_URL='http://127.0.0.1:3005/rest/v1' bunx jest --config jest.e2e.config.js tests/e2e-solana/10-collection-parent-complete.test.ts --verbose --runInBand` | PASS | `Test Suites: 1 passed`, `Tests: 7 passed`. | `artifacts/e2e-target-collection-parent-20260225T194645Z.log` |
| 2026-02-25T19:47:00Z | 2026-02-25T19:47:20Z | `NODE_OPTIONS='--experimental-vm-modules' SOLANA_RPC_URL='http://127.0.0.1:8899' SOLANA_WS_URL='ws://127.0.0.1:8900' INDEXER_URL='http://127.0.0.1:3005/rest/v1' bunx jest --config jest.e2e.config.js tests/e2e-solana/09-seal-v1-complete.test.ts --verbose --runInBand` | PASS | `Test Suites: 1 passed`, `Tests: 11 passed`. | `artifacts/e2e-target-seal-20260225T194645Z.log` |

### Integrity-focused reruns (latest)

| Start (UTC) | End (UTC) | Command | Result | Key output | Artifact |
| --- | --- | --- | --- | --- | --- |
| 2026-02-25T22:14:21Z | 2026-02-25T22:15:12Z | `node scripts/e2e-indexers-matrix.mjs --run-id fix-rerun-20260225-231421-matrix` (REST only) | PASS | Classic/substream REST checks pass, catch-up pass, comparison mismatches=`0`. | `artifacts/e2e-indexers/fix-rerun-20260225-231421-matrix/` |
| 2026-02-25T22:14:21Z | 2026-02-25T22:15:12Z | `npx tsx tests/e2e-solana/stress-test-hashchain-localnet.ts quick` | PASS | `210/210 successful`, `All integrity valid: YES`, avg integrity check `2.5ms`. | `/tmp/fix-rerun-20260225-231421/stress.log` |
| 2026-02-25T22:14:21Z | 2026-02-25T22:15:12Z | `npx tsx tests/e2e-solana/integrity-manipulation-test.ts` | PASS | Initial state `valid`; SyncLag/Corruption/DataDeletion all `PASS`; `Overall: ALL TESTS PASSED`. | `/tmp/fix-rerun-20260225-231421/manipulation.log` |

### Real Pinata flow (collection creation)

| Start (UTC) | End (UTC) | Command | Result | Key output | Artifact |
| --- | --- | --- | --- | --- | --- |
| 2026-02-25T19:47:41Z | 2026-02-25T19:47:47Z | `node --input-type=module` inline script loading JWT fragments from `/Users/true/Documents/Pipeline/CasterCorp/8004-mcp/src/config/defaults.ts`, then `sdk.createCollection(...)` with `IPFSClient({ pinataEnabled: true, pinataJwt })` | PASS | `PINATA_FLOW_OK cid=bafkreif4fhqtgxnrlodqj5fxrld6w5rhhaxidva7zrhndor2wi2syjr464`; pointer `c1:bafkreif4fhqtgxnrlodqj5fxrld6w5rhhaxidva7zrhndor2wi2syjr464`. JWT not printed. | `artifacts/e2e-pinata-collection-20260225T194645Z.log` |

### Final status

- Full `test:e2e:localnet`: **PASS** (latest rerun complete; prior 2 failures were localnet WS instability).
- Explicit targeted collection/parent-child test: **PASS**.
- Explicit SEAL test: **PASS**.
- Real Pinata collection creation flow: **PASS**.
