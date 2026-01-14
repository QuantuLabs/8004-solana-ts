# Solana SDK E2E Tests

Full end-to-end tests of the Solana SDK against devnet.

## ⚠️ Important Note

These tests hit real devnet and are intended for local runs. They live in `tests/e2e-solana/`.

## Test Files

### 1. e2e-full-flow.test.ts
Tests the full agent lifecycle:
- ✅ Register agent
- ✅ Update metadata
- ✅ Give feedback
- ✅ Read reputation
- ✅ Add response
- ✅ Request validation
- ✅ Respond to validation
- ✅ Revoke feedback
- ✅ Multi-agent queries

**Scenario**: Creates an agent, gives feedback, adds a response, validates, and revokes.

### 2. e2e-error-scenarios.test.ts
Tests error cases and edge cases:
- ❌ Non-existent entities
- ❌ Permission errors (read-only SDK)
- ❌ Invalid inputs
- ❌ Edge cases (long URIs, special characters)
- ❌ Network errors
- ⚡ Concurrent operations

### 3. e2e-performance.test.ts
Performance and scalability tests:
- ⏱️  Response time
- ⚡ Batch operations
- 📊 Large datasets
- 🚀 Cache and throughput
- 💾 Memory efficiency

## Prerequisites

```bash
# 1. Environment variable with Solana private key
export SOLANA_PRIVATE_KEY='[1,2,3,...]'  # Uint8Array JSON

# 2. SOL balance on devnet
# Get devnet SOL: https://faucet.solana.com/

# 3. Programs deployed on devnet
# Program IDs must match those in src/core/programs.ts
```

## Running

### All E2E tests
```bash
cd /Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana
npm test tests/e2e-solana
```

### Specific test
```bash
# Full flow
npm test tests/e2e-solana/e2e-full-flow.test.ts

# Error scenarios
npm test tests/e2e-solana/e2e-error-scenarios.test.ts

# Performance
npm test tests/e2e-solana/e2e-performance.test.ts
```

### With verbose output
```bash
npm test tests/e2e-solana -- --verbose
```

## Expected Results

### e2e-full-flow.test.ts
```
✅ Agent registered with ID: 123
✅ Agent loaded successfully
✅ Metadata set
✅ URI updated
✅ Feedback given with index: 0
✅ Feedback loaded (score: 85)
✅ Reputation summary (average: 85, total: 1)
✅ Response appended
✅ Response count: 1
✅ Validation requested (nonce: 0)
✅ Validation response sent
✅ Feedback revoked
✅ Revoked feedback excluded from default listing
```

### e2e-error-scenarios.test.ts
```
✅ Non-existent entities return null/empty
✅ Read-only SDK throws on write operations
✅ Invalid inputs rejected
✅ Edge cases handled gracefully
✅ Network errors caught
✅ Concurrent operations work
```

### e2e-performance.test.ts
```
⏱️  loadAgent: ~500ms
⏱️  getSummary: ~200ms (cached)
⏱️  5 agents in parallel: ~1500ms
⏱️  Read all feedbacks: ~800ms
⏱️  Throughput: ~5 req/sec sequential
⏱️  Throughput: ~20 req/sec parallel
```

## Estimated Costs (Devnet)

Each e2e-full-flow test consumes approximately:
- Register agent: ~0.001 SOL
- Set metadata: ~0.0005 SOL
- Set URI: ~0.0005 SOL
- Give feedback: ~0.002 SOL
- Append response: ~0.001 SOL
- Request validation: ~0.001 SOL
- Respond validation: ~0.0005 SOL
- Revoke feedback: ~0.0005 SOL

**Total per run**: ~0.007 SOL (~$0.0007 at $0.10/SOL)

On devnet it's free (faucet), but keep these numbers in mind for mainnet.

## Timeouts

Tests are configured with generous timeouts for devnet:
- Read operations: 30s
- Write operations: 60s
- Performance tests: 60s

If devnet is slow, increase the timeouts.

## Debugging

### See detailed logs
```bash
ANCHOR_LOG=true npm test tests/e2e-solana/e2e-full-flow.test.ts
```

### Inspect transactions
Copy the transaction signatures from the logs and view them at:
- https://explorer.solana.com/?cluster=devnet

### Check accounts
```bash
solana account <PUBKEY> --url devnet
```

## Maintenance

These E2E tests:
- ✅ Run against real devnet
- ✅ Create real transactions
- ✅ Cost SOL (free on devnet)
- ❌ Not suitable for CI/CD
- ⚠️  May fail if devnet is down

For CI/CD, use the lighter integration tests in `tests/integration/`.

## Cleanup

These tests create agents and feedbacks on devnet. No special cleanup is needed because:
1. It is devnet (test network)
2. The data is useful for testing read functions
3. Accounts can be closed manually if needed

## Tips

1. **Low balance?** → https://faucet.solana.com/
2. **Slow devnet?** → Increase timeouts
3. **RPC rate limit?** → Use your own RPC URL
4. **Flaky tests?** → Add delays between operations

## FAQ

**Q: Why are these tests not suited for CI/CD?**
A: They hit real devnet, cost SOL, and take time to run.

**Q: How do I run them in CI/CD?**
A: Do not run them in CI/CD. Use the integration tests in `tests/integration/`.

**Q: Can I run them against mainnet?**
A: Yes, but watch the costs. Switch `createDevnetSDK()` to `createMainnetSDK()`.

**Q: How long do they take?**
A: About 5-10 minutes for a full run, depending on devnet speed.
