# Changelog

## v0.4.0 (Current)

**New Features:**
- ATOM Engine integration (Agent Trust On-chain Model)
- Indexer client for fast queries via Supabase
- Collection creation and management

**API Changes:**
- Simplified `registerAgent(tokenUri?, collection?)` - removed unused metadata parameter
- All methods now use `asset: PublicKey` instead of `agentId: bigint`
- `fileUri/fileHash` renamed to `feedbackUri/feedbackHash`

**Program ID (Devnet):**
- Agent Registry: `HHCVWcqsziJMmp43u2UAgAfH2cBjUFxVdW1M3C3NqzvT`
- ATOM Engine: `B8Q2nXG7FT89Uau3n41T2qcDLAWxcaQggGqwFWGCEpr7`

## v0.3.0 - Asset-based API

**Breaking Changes:**
- `agentId: bigint` replaced with `asset: PublicKey` everywhere
- Methods now take asset pubkey instead of numeric ID
- Feedback/reputation methods updated for new PDA structure

**New Features:**
- Multi-collection support
- User-created collections (only creator can register agents)
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
