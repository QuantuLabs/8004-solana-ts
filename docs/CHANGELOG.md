# Changelog

> Note: Canonical release changelog is maintained in the repository root `CHANGELOG.md`.

## v0.8.2 (2026-03-18)

**ProofPass:**
- Added the requester-driven `ProofPass` public flow:
  - `openProofPass(...)`
  - `giveFeedbackWithProof(...)`
  - `getLiveProofPass(...)`
  - `getLiveProofPassesByCreator(...)`
  - `closeProofPass(...)`
- Documented the current validated ProofPass fee model:
  - `open_fee = 0`
  - `finalize_fee = 10_000`
  - default `creator_pays_all`

**Asset-first Docs + Lookup Helpers:**
- Kept the public docs/examples asset-pubkey-first for this release.
- Documented indexer sequence-id lookup helpers as secondary/advanced material instead of the primary SDK flow.

**Docs Cleanup:**
- Moved ProofPass into the main SDK docs/examples set.
- Reduced the README ATOM / RPC provider sections and linked to dedicated docs for details.
- Simplified revoke examples to the normal `targetAgent + feedbackIndex` path and moved advanced seal-hash details to `FEEDBACK.md`.

## v0.8.1 (2026-03-15)

**Indexer Read Safety:**
- Hardened GraphQL indexer reads so large count/index fields keep exact semantics instead of silently truncating via JavaScript number coercion.

**Docs + Defaults:**
- Documented the built-in secondary public indexer endpoints (`dev2` / `main2`) used by the SDK fallback lists for REST and GraphQL.

**Docs Cleanup:**
- Standardized registry terminology across docs.
- Updated quickstart registration examples to use `registerAgent(..., { collectionPointer })`.
- Consolidated collection pointer and parent/child rules into `docs/COLLECTION.md`.
- Added `burnAgent(asset, options?)` documentation in methods/quickstart/collection references.
- Removed the README SEAL block.
- Removed references to the deprecated `basic-indexer` example.

## v0.6.5 (2026-02-25)

**Collection + Parent/Child:**
- Added CID-first collection flow docs: `createCollectionData()` then `createCollection()` upload result (`cid`, `uri`, `pointer`).
- Documented canonical `c1:` collection pointer rules and the `<= 128 bytes` max pointer size.
- Added parent-child association rules and lock semantics for `setCollectionPointer()` and `setParentAsset()`.
- Clarified that `collection pointer` is a string field on agent account and differs from base registry pubkey.

**Indexer + E2E:**
- Added indexer matrix tooling docs and runlog artifacts for indexer/substream REST/GraphQL checks.
- Added guidance for parity checks and comparison reports between indexers.

**Developer Experience:**
- Added collection read-method docs (`getCollection`, `getCollections`, `getCollectionAgents`) for advanced RPC setups.
- Updated examples and quickstart flow for easier collection onboarding.

## v0.4.0 (Historical)

**New Features:**
- ATOM Engine integration (Agent Trust On-chain Model)
- Indexer client for fast queries via Supabase
- Collection creation and management

**API Changes:**
- Simplified `registerAgent(tokenUri?, collection?)` - removed unused metadata parameter
- All methods now use `asset: PublicKey` instead of `agentId: bigint`
- `fileUri/fileHash` renamed to `feedbackUri/feedbackHash`

**Program ID (Devnet):**
- Agent Registry: `8oo4J9tBB3Hna1jRQ3rWvJjojqM5DYTDJo5cejUuJy3C`
- ATOM Engine: `AToMufS4QD6hEXvcvBDg9m1AHeCLpmZQsyfYa5h9MwAF`

## v0.3.0 - Asset-based API

**Breaking Changes:**
- `agentId: bigint` replaced with `asset: PublicKey` everywhere
- Methods now take asset pubkey instead of numeric ID
- Feedback/reputation methods updated for new PDA structure

**New Features:**
- Multi-collection support
- Collection uniqueness scoped by same minting creator + same collection pointer
- On-chain metadata via `setMetadata()` / `getMetadata()`

## v0.2.1

**New Features:**
- `getAllAgents({ includeFeedbacks: true })` - Fetch all agents with feedbacks in 4 RPC calls
- `getAllFeedbacks()` - Fetch all feedbacks for all agents as Map (2 RPC calls)
- OASF skills/domains validation in `buildRegistrationFileJson()`

**Fixes:**
- FeedbackTagsPda fetching in readAllFeedback and readFeedback
- BN to bigint conversion for feedback_index
- Skip invalid pre-v0.2.0 feedback accounts (timestamp validation)

**Performance:**
- Indexing 90 agents: ~1000 RPC calls → **4 RPC calls**

## v0.2.0 - Consolidated Program Architecture

**What's New:**
- Single consolidated program (Identity + Reputation + Validation)
- Metaplex Core NFTs (lighter, faster than Token Metadata)
- Global feedback index for simpler PDA derivation
- 89 comprehensive tests on devnet

**Breaking Changes from v0.1.0:**
- Program IDs changed (now single program)
- Agent PDA uses Core asset address, not mint
- Feedback PDA uses global index (no client address in seeds)
- Response PDA removed client from seeds

## v0.1.0 - Initial Release

- Separate programs for Identity, Reputation, Validation
- Token Metadata NFTs
- Per-client feedback indexing
