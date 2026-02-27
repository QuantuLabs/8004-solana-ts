# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
- Transfer and URI update flows documented around base-registry auto-resolution (explicit base collection param kept only for legacy compatibility).
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
- All agents register into the base collection by default
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
