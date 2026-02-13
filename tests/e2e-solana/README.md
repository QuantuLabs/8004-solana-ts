# E2E Tests - 8004 Solana SDK

**Complete E2E test suite for the 8004 Solana Agent Registry SDK**

---

## Overview

This directory contains comprehensive End-to-End (E2E) tests covering **100% of on-chain instructions** plus security and indexer API tests.

### Test Coverage Summary

| Module | File | Instructions Covered | Tests |
|--------|------|---------------------|-------|
| **Identity** | `01-identity-complete.test.ts` | 15/15 (100%) | ~60 |
| **Reputation** | `02-reputation-complete.test.ts` | 3/3 (100%) | ~35 |
| **Validation** | `03-validation-complete.test.ts` | 3/3 (100%) | ~30 |
| **ATOM Engine** | `04-atom-engine-complete.test.ts` | 6/6 (100%) | ~40 |
| **Security** | `05-security-attacks.test.ts` | N/A | 13+ |
| **Indexer API** | `06-indexer-api.test.ts` | N/A | 11 |
| **TOTAL** | **6 files** | **27/27 (100%)** | **~189** |

---

## Running Tests

### Prerequisites

1. **Localnet running** with deployed programs:
   ```bash
   cd /path/to/8004-solana
   solana-test-validator &
   anchor deploy --provider.cluster localnet
   ```

2. **Environment variables**:
   ```bash
   export SOLANA_RPC_URL=http://127.0.0.1:8899
   export INDEXER_URL=https://your-indexer-url.com
   ```

### Run All Tests

```bash
cd /path/to/agent0-ts-solana

# Run all E2E tests sequentially
npm run test:e2e:all

# Or run all in parallel (faster)
npm run test:e2e
```

### Run Individual Test Suites

```bash
# Identity module (15 instructions)
npm run test:e2e:identity

# Reputation module (3 instructions)
npm run test:e2e:reputation

# Validation module (3 instructions)
npm run test:e2e:validation

# ATOM Engine module (6 instructions)
npm run test:e2e:atom

# Security attacks (13 tests)
npm run test:e2e:security

# Indexer API (11 methods)
npm run test:e2e:indexer
```

---

## Test Files

### 01-identity-complete.test.ts
**Coverage**: 15 instructions

Instructions: initialize, create_base_registry, rotate_base_registry, create_user_registry, update_user_registry_metadata, register, register_with_options, enable_atom, set_agent_uri, set_metadata_pda, delete_metadata_pda, set_agent_wallet, sync_owner, owner_of, transfer_agent

### 02-reputation-complete.test.ts
**Coverage**: 3 instructions

Instructions: give_feedback, revoke_feedback, append_response

### 03-validation-complete.test.ts
**Coverage**: 3 instructions

Instructions: initialize_validation_config, request_validation, respond_to_validation

### 04-atom-engine-complete.test.ts
**Coverage**: 6 instructions

Instructions: initialize_config, update_config, initialize_stats, update_stats, get_summary, revoke_stats

### 05-security-attacks.test.ts
**Coverage**: 13+ security tests

Tests: Ed25519 attacks (3), CPI bypass (3), Immutability (3), Validation integrity (1), Fake accounts (3), Bonus tests (8+)

### 06-indexer-api.test.ts
**Coverage**: 10 methods

Methods: isIndexerAvailable, searchAgents, getLeaderboard, getGlobalStats, getFeedbacksByEndpoint, getFeedbacksByTag, getAgentByWallet, getPendingValidations, getAgentReputationFromIndexer, getFeedbacksFromIndexer

---

## Test Results

Expected: ✅ **100% pass rate (27/27 instructions, ~189 tests)**

See `TEST_COVERAGE_ANALYSIS.md` for detailed coverage comparison with MCP tests.
