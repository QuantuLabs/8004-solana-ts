# Changelog

## v0.2.1 (Current)

- Fix: FeedbackTagsPda fetching in readAllFeedback and readFeedback
- Fix: BN to bigint conversion for feedback_index
- Refactor: Cleanup SDK structure, reorganize docs

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

**Program ID:** `HvF3JqhahcX7JfhbDRYYCJ7S3f6nJdrqu5yi9shyTREp`

## v0.1.0 - Initial Release

- Separate programs for Identity, Reputation, Validation
- Token Metadata NFTs
- Per-client feedback indexing
