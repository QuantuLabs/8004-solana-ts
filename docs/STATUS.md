# Project Status - agent0-ts-solana v0.6.4

**Last Updated:** 2026-02-25

## Completed Features

### Core Features
- Agent registration with ATOM auto-initialization
- Agent loading and querying
- Metadata management (set, get, delete)
- Agent URI updates
- Agent transfer
- Owner synchronization
- Single base collection (user registries removed in v0.6.0)

### Reputation System
- Give feedback with rich metrics (value, decimals, tags)
- SEAL v1 on-chain feedback authenticity
- Read feedback (event-driven via indexer)
- Revoke feedback (requires `sealHash`)
- Get reputation summary (ATOM)
- List all feedbacks
- Get clients list
- Response system (append requires `sealHash`, read)

### Agent Wallet & Signatures
- `setAgentWallet()` - Ed25519 signature verification
- `sign()` - Canonical JSON signing
- `verify()` - On-chain wallet lookup + signature verification
- `isItAlive()` - Liveness checks with endpoint pinging

### SEAL v1 (Solana Event Authenticity Layer)
- `computeSealHash()` - Mirrors on-chain Keccak256 computation
- `computeFeedbackLeafV1()` - Leaf for hash-chain verification
- `verifySealHash()` - Verify feedback integrity
- `createSealParams()` - Helper to build SealParams
- `validateSealInputs()` - Input validation
- 4 cross-validation vectors (Rust/TypeScript parity)

### Collections
- `createCollectionData()` - Build collection schema JSON
- `createCollection(data)` - CID-first metadata upload flow
- `setCollectionPointer()` - Canonical `c1:` pointer association
- `setParentAsset()` - Parent hierarchy association
- Legacy on-chain collection methods kept for compatibility but inactive on `v0.6.x`

### ATOM Reputation Engine
- Auto-initialization with `registerAgent()`
- Opt-out via `atomEnabled: false` option
- One-way opt-in after creation via `enableAtom()`
- On-chain aggregated stats (count, average, tier)
- Instant reads (no indexer lag)

### IPFS & Metadata Builders
- `IPFSClient` with Pinata, local node, Filecoin support
- `buildRegistrationFileJson()` - Agent metadata builder
- `buildCollectionMetadataJson()` - Collection metadata builder

## Event-Driven Architecture

Raw feedback data uses event-driven storage:
- `giveFeedback()` writes via on-chain events with SEAL hash
- `readFeedback()`, `readAllFeedback()`, `getClients()` query indexer
- Event propagation: typically seconds, max 30s in tests
- Aggregated stats (`getSummary()`) use ATOM and read instantly

## Version History

### v0.6.0
- SEAL v1 - on-chain feedback authenticity layer
- Single-collection architecture (removed user registries)
- `sealHash` required for `revokeFeedback()` / `appendResponse()`
- `feedbackHash` renamed to `feedbackFileHash` in `giveFeedback()`
- SSRF protection improvements

### v0.6.4
- Added CID-first collection helpers (`createCollectionData`, `createCollection(data)`)
- Added canonical collection pointer normalization (`c1:` with CIDv1 base32)
- Added parent/collection association helpers with lock options
- Added `AgentAccount.creators` alias compatibility field

### v0.5.0
- Rich feedback metrics (value, valueDecimals)
- Optional score (pure metric tracking without ATOM scoring)
- ERC-8004 standardized tags
- Validation module removed

### v0.4.2
- `updateCollectionMetadata()` added
- ATOM auto-init with `registerAgent()`
- 85/85 E2E tests passing

## Known Limitations

1. **Indexer Lag** (by design)
   - Raw feedback queries can take seconds
   - Use `waitForIndexerSync()` helper in tests/scripts
   - ATOM stats are instant (no lag)

2. **RPC Requirements** (infrastructure)
   - `getAgentsByOwner()` requires advanced RPC
   - Default devnet RPC doesn't support getProgramAccounts
   - Use Helius/Triton/QuickNode/Alchemy for these methods

3. **Response System Timeouts** (devnet only)
   - Response PDAs can take >60s to propagate on devnet
   - Tests skip gracefully after timeout
