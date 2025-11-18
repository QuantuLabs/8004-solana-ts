# Solana SDK Test Suite

Comprehensive test coverage for the Solana SDK implementation.

## Test Files

### Unit Tests

1. **borsh-schemas.test.ts** - Borsh deserialization
   - AgentAccount, FeedbackAccount, AgentReputationAccount
   - ClientIndexAccount, ResponseAccount, MetadataEntry
   - Helper methods (getOwnerPublicKey, etc.)

2. **pda-helpers.test.ts** - PDA derivation
   - All PDA derivation functions
   - String conversion helpers
   - Deterministic address generation

3. **client.test.ts** - SolanaClient wrapper
   - RPC connection management
   - Account fetching
   - Program account queries

4. **feedback-manager.test.ts** - 6 ERC-8004 read functions
   - getSummary()
   - readFeedback()
   - readAllFeedback()
   - getLastIndex()
   - getClients()
   - getResponseCount()
   - Bonus: readResponses()

5. **instruction-builder.test.ts** - Instruction builders
   - IdentityInstructionBuilder
   - ReputationInstructionBuilder
   - ValidationInstructionBuilder

6. **sdk.test.ts** - Main SDK class
   - Initialization with/without signer
   - Read operations
   - Write operations
   - Error handling

### Integration Tests

7. **integration.test.ts** - End-to-end tests
   - Real devnet integration
   - Read operations against live data
   - Write operations (with SOLANA_PRIVATE_KEY)
   - Error handling

## Running Tests

```bash
# Run all tests
npm test

# Run Solana tests only
npm test tests/solana

# Run specific test file
npm test tests/solana/sdk.test.ts

# Run with coverage
npm test -- --coverage
```

## Environment Variables

For integration tests with write operations:

```bash
export SOLANA_PRIVATE_KEY='[1,2,3,...]'  # Uint8Array as JSON
```

## Test Coverage

- **Borsh deserialization**: All account types
- **PDA helpers**: All PDA derivation functions
- **SolanaClient**: Connection, account fetching
- **FeedbackManager**: All 6 read functions + bonus
- **Instruction builders**: All 3 builders
- **SDK**: Read/write operations, error handling
- **Integration**: Live devnet tests

## Notes

- Unit tests use mocks and don't require network access
- Integration tests connect to devnet
- Write tests are skipped unless SOLANA_PRIVATE_KEY is set
