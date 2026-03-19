# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.8.3] - 2026-03-19
### Changed
- Updated the public SDK to follow the current `ProofPass` creator-based open flow after the devnet program upgrade.
- Kept the high-level `openProofPass(...)` API stable while aligning the underlying instruction accounts with the new on-chain ABI.

### Documentation
- Restored the compact README layout and fixed the read-only snippet so the public docs match the current SDK flow.

## [0.8.2] - 2026-03-18
### Added
- Added the public `ProofPass` flow:
  - `openProofPass(...)`
  - `giveFeedbackWithProof(...)`
  - `getLiveProofPass(...)`
  - `getLiveProofPassesByCreator(...)`
  - `closeProofPass(...)`

### Changed
- Documented the current validated `ProofPass` fee model:
  - `open_fee = 0`
  - `finalize_fee = 10_000`
  - default `creator_pays_all`
- Kept the public docs/examples asset-pubkey-first while retaining sequential lookup compatibility as secondary behavior.

### Documentation
- Added `ProofPass` docs/examples to the main SDK documentation set.
- Simplified revoke and asset-first guidance across the new release docs.

## [0.8.1] - 2026-03-15
### Fixed
- Hardened GraphQL indexer reads against integer precision loss by preserving exact count/index values and throwing on unsafe JavaScript integer ranges instead of silently coercing them.

### Documentation
- Documented the built-in secondary public indexer fallbacks (`dev2` / `main2`) that are already shipped in the SDK defaults for REST and GraphQL reads.

## [0.8.0] - 2026-03-06
### Fixed
- Hardened GraphQL seal-hash reads by chunking feedback lookup pagination so live `appendResponseBySealHash(...)` works against the indexer’s complexity limits.
- The strict DB-integrity tooling no longer treats all-zero required hashes as equivalent to `null`, matching the current indexer/runtime contract.
- GraphQL collection listings now request and return `collection_id` consistently, even without a `collectionId` filter.
- REST/GraphQL read clients no longer synthesize incorrect fallback results for unsupported public compatibility paths; `getLeaderboardRPC()` now surfaces the upstream error instead of degrading to a non-leaderboard `/agents` query.

### Changed
- `mainnet-beta` is now treated as a first-class default across SDK examples, quickstart flows, and skill docs, with the production indexer host set to `https://8004-indexer-main.qnt.sh`.
- `devnet`/`testnet` SDK defaults now point to `https://8004-indexer-dev.qnt.sh`.
- SDK default public endpoints no longer fall back implicitly to legacy public hosts.
- Collection read docs now include the sequential `collection_id` helpers and explicit creator+pointer uniqueness guidance.

### Documentation
- Added SNS examples to the registration-file builder docs/examples/skill so ENS/SNS service registration is explicit in the public surface.

## [0.7.9] - 2026-03-03
### Added
- Added `burnAgent(asset, options?)` in the SDK to burn agent Core assets with standard `WriteOptions` (`skipSend`, `signer`, `feePayer`, `computeUnits`).

### Changed
- `GiveFeedbackParams.feedbackUri` is now optional across source/dist types and docs.
- Removed legacy `registerAgent(tokenUri, collection, options)` compatibility overload; only `registerAgent(tokenUri?, options?)` is supported.

### Documentation
- Added `burnAgent` usage notes/examples in README, METHODS, QUICKSTART, and COLLECTION docs.

## [0.7.8] - 2026-03-02
### Changed
- Switched `mainnet-beta` SDK default indexer host to `https://8004-api.qnt.sh` for both REST (`/rest/v1`) and GraphQL (`/v2/graphql`).

### Fixed
- Aligned SDK unit expectation for mainnet default GraphQL endpoint with the new `8004-api.qnt.sh` host.
- Updated SDK skill documentation examples/defaults to use `8004-api.qnt.sh`.

## [0.7.6] - 2026-03-02
### Added
- Added cluster-aware SDK defaults for `mainnet-beta`:
  - Agent Registry: `8oo4dC4JvBLwy5tGgiH3WwK4B9PWxL9Z4XjA2jzkQMbQ`
  - ATOM Engine: `AToMw53aiPQ8j7iHVb4fGt6nzUNxUhcPc3tbPBZuzVVb`
  - Indexer defaults: `https://8004.qnt.sh/rest/v1` and `https://8004.qnt.sh/v2/graphql`
- Added localnet indexer defaults (`http://127.0.0.1:3005/rest/v1`, `http://127.0.0.1:3005/v2/graphql`) for cluster-based initialization.

### Fixed
- Hardened SDK transaction submission by replacing websocket-dependent confirmation with HTTP polling + resend strategy in `TransactionBuilder`.
- Ensured feedback summary AtomStats PDA derivation respects the SDK-selected ATOM program ID (including mainnet overrides).
- Updated GraphQL parity e2e flow to skip feedback parity check when no feedback exists on the target indexer, while preserving agent projection/search parity checks.

### Documentation
- Updated README/Quickstart/Methods to reflect that `mainnet-beta` is fully configured by default and clarified cluster-specific examples.

## [0.7.5] - 2026-03-01
### Fixed
- Added a strict `appendResponse()` guardrail: when an explicit `sealHash` is provided and indexed feedback is available, mismatched hashes are now rejected.
- Added a `registerAgent(tokenUri?, options?)` overload while keeping the legacy `registerAgent(tokenUri?, collection?, options?)` compatibility path.

### Documentation
- Standardized collection/pointer docs and examples around canonical pointer-first flow (`c1:...`) and modern `registerAgent(..., { collectionPointer })` usage.
- Clarified indexer collection compatibility (`/collections` primary path with classic fallback to `/collection_pointers` where needed).
- Clarified that validation indexer reads are archived (`v0.5.0+`) and intentionally not exposed.

## [0.7.4] - 2026-03-01
### Fixed
- Hardened indexer `getAgentByAgentId()` sequence-id lookups across GraphQL field variants and removed asset-id fallback assumptions.
- Updated archived validation handling so pending validations are not exposed in SDK validation reads.
- Strengthened `appendResponse()` / `revokeFeedback()` flows to consistently use SEAL hash inputs for deterministic validation and replay safety.

### Documentation
- Aligned collection terminology across SDK docs with canonical collection/pointer naming.

## [0.7.2] - 2026-02-27
### Fixed
- Aligned GraphQL indexer reads so `getAgentByAgentId()` resolves sequence ids (`agentId` / legacy `agentid`) instead of relying on asset-id semantics.
- Removed asset-derived fallback in indexer integrity checks when explicit agent id fields are absent.

### Changed
- Updated SDK docs for backend sequence-id semantics (REST `agent_id`, GraphQL `agentId`).

## [0.7.1] - 2026-02-27
### Changed
- Bump SDK package version to `0.7.1`.

## [0.7.0] - 2026-02-27
### Added
- `getAgentByAgentId()` indexer read path for deterministic agent lookups.
- Expanded SDK/indexer parity tooling and coverage scripts for localnet/devnet validation.

### Changed
- Updated collection and parent/child docs/examples for the canonical pointer-first flow.
- Refined feedback/response helper behavior to reduce manual SEAL plumbing in common SDK usage paths.

### Documentation
- Added collection read-method coverage (`getCollection`, `getCollections`, `getCollectionAgents`) in `docs/METHODS.md`.
- Aligned feedback value docs with on-chain `i128` and `valueDecimals` `0-18`.

## [0.6.5] - 2026-02-25
### Added
- `createCollectionData()` and CID-first `createCollection()` flow for 8004 collection metadata schema generation and IPFS upload preparation.
- Collection pointer and parent-child association helpers (`setCollectionPointer`, `setParentAsset`) with lock/unlock options.
- Agent account creator/creators coverage across SDK docs, examples, and tests.
- E2E indexer matrix tooling and runlog generation (`scripts/e2e-indexers-*.mjs`, `docs/e2e-indexers-runlog.md`).

### Changed
- Canonical collection model now documented around pointer-first flow (`c1:<cid>`) with max pointer size (`<= 128 bytes`) and on-chain association rules.
- Transfer and URI update flows documented around base-registry auto-resolution (explicit base registry param kept only for legacy compatibility).
- Value-encoding and indexer querying paths aligned with latest program/indexer behavior.

### Fixed
- Seed-write matrix metadata key reduced to stay within on-chain 32-byte key limit.
- Removed trailing null bytes from `CHANGELOG.md`.

### Security
- Replaced local-node IPFS operations previously tied to `ipfs-http-client` with native IPFS HTTP API calls over `fetch` (`/api/v0/add`, `/api/v0/cat`, `/api/v0/pin/add`, `/api/v0/pin/rm`).
- Hardened local-node IPFS requests with redirect blocking and bounded response reads.
### Runtime Compatibility
- Removed Node `Buffer` dependency from CID integrity comparison path (`Uint8Array` constant-time compare) to keep `IPFSClient.get()` compatible across browser and server runtimes.
### Documentation
- Clarified browser vs Node usage guidance in Quickstart docs.

## [0.6.2] - 2026-02-09
### Security
- Consolidated SSRF protection into single `isBlockedUri()` function
- Added SSRF validation to `pingHttpEndpoint()` and endpoint crawler
- Added redirect protection to MCP/A2A JSON-RPC calls
### Changed
- Removed unused `axios` dependency
- Added BigInt nonce range validation

## 0.6.0

### SEAL v1

- `computeSealHash()` - Mirrors on-chain Keccak256 computation
- `computeFeedbackLeafV1()` - Leaf for hash-chain verification
- `verifySealHash()` - Verify feedback integrity
- `createSealParams()` - Helper to build SealParams
- `validateSealInputs()` - Input validation before hashing
- 4 cross-validation vectors (Rust/TypeScript parity)

### Architecture

- Single-collection architecture (removed user registries)
- All agents register into the base registry by default
- SSRF protection improvements in URI fetching

### Breaking Changes
- `feedbackHash` renamed to `feedbackFileHash` (optional) in `giveFeedback()`
- `revokeFeedback()` / `appendResponse()` now require `feedbackHash` parameter (the SEAL hash)
- `SolanaFeedback.sealHash` replaces `feedbackHash`
- `createUserRegistry()` removed

## 0.5.0

### Breaking Changes
- **`giveFeedback()` signature updated** - Now accepts `value` (i64), `valueDecimals` (0-6), and optional `score`

### New Features
- **Rich Feedback Metrics** - Track raw values (revenues, latency, yield) with decimal precision
- **Optional Score** - Set `score: null` for pure metric tracking without ATOM quality scoring
- **ERC-8004 Standardized Tags** - `starred`, `uptime`, `successRate`, `responseTime`, `revenues`, `tradingYield`, etc.
- **ATOM Score Normalization** - Auto-normalizes `starred`, `uptime`, `successRate` tags to 0-100

### Documentation
- New `docs/FEEDBACK.md` guide for feedback system
- Updated README with feedback examples
- Tag2 values aligned with ERC-8004 best practices (`day`/`week`/`month`/`year`)

## 0.4.2

### New Features
- **`updateCollectionMetadata()`** - Update collection name and/or URI (owner only)
- **ATOM Auto-Init** - Automatic ATOM initialization with `registerAgent()`, opt-out with `skipAtomInit: true`

### Improvements
- Graceful test handling for devnet latency and response PDA timeouts
- Updated program IDs and validation tests
- Complete documentation for sign/verify/liveness features

### Testing
- 85/85 E2E tests passing
- New unit tests for signing and liveness
- Comprehensive on-chain validation script (`scripts/test-onchain-full.ts`)

## 0.4.1
- Bump package version to 0.4.1.
- Remove local debug/test scripts from the repo root.
