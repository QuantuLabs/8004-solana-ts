# API Reference

## Constructor

```typescript
import { SolanaSDK } from '8004-solana';
import { Keypair } from '@solana/web3.js';

// Default: devnet, read-only
const sdk = new SolanaSDK();

// With signer (for write operations)
const sdk = new SolanaSDK({ signer: Keypair.generate() });

// Custom RPC (for advanced queries)
const sdk = new SolanaSDK({ rpcUrl: 'https://your-rpc.helius.dev' });

// Full config
const sdk = new SolanaSDK({
  cluster: 'devnet',      // 'devnet' | 'mainnet-beta'
  rpcUrl: 'https://...',  // Optional custom RPC
  signer: keypair,        // Optional signer for write operations
});
```

## Utility Methods

| Method | Return Type | Description |
|--------|-------------|-------------|
| `isReadOnly` | `boolean` | True if SDK has no signer |
| `canWrite` | `boolean` | True if SDK can perform write operations |
| `chainId()` | `Promise<string>` | Returns `solana-{cluster}` |
| `getCluster()` | `Cluster` | Returns current cluster name |
| `registries()` | `Record<string, string>` | Returns program IDs |
| `getProgramIds()` | `object` | Returns program IDs as PublicKey objects |
| `getRpcUrl()` | `string` | Returns current RPC URL |
| `supportsAdvancedQueries()` | `boolean` | True if RPC supports getProgramAccounts |

## Agent Read Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `loadAgent` | `(agentId: bigint) => Promise<AgentAccount \| null>` | Load agent data |
| `getAgent` | `(agentId: bigint) => Promise<AgentAccount \| null>` | Alias for loadAgent |
| `agentExists` | `(agentId: bigint) => Promise<boolean>` | Check if agent exists |
| `getAgentOwner` | `(agentId: bigint) => Promise<PublicKey \| null>` | Get agent owner |
| `isAgentOwner` | `(agentId, address) => Promise<boolean>` | Check ownership |
| `getMetadata` | `(agentId, key) => Promise<string \| null>` | Read metadata entry |

## Agent Write Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `registerAgent` | `(tokenUri?, metadata?) => Promise<TransactionResult>` | Register new agent |
| `transferAgent` | `(agentId, newOwner) => Promise<TransactionResult>` | Transfer ownership |
| `setAgentUri` | `(agentId, newUri) => Promise<TransactionResult>` | Update agent URI |
| `setMetadata` | `(agentId, key, value, immutable?) => Promise<TransactionResult>` | Set/update on-chain metadata |
| `deleteMetadata` | `(agentId, key) => Promise<TransactionResult>` | Delete mutable metadata |

### On-chain Metadata

Store arbitrary key-value pairs directly on-chain (optional - most data should be in IPFS):

```typescript
// Create metadata (first time: ~0.00319 SOL for rent)
await sdk.setMetadata(agentId, 'version', '1.0.0');

// Update metadata (same key: ~0.000005 SOL, TX fee only)
await sdk.setMetadata(agentId, 'version', '2.0.0');

// Read metadata
const version = await sdk.getMetadata(agentId, 'version');
console.log(version); // "2.0.0"

// Delete metadata (recovers rent to owner)
await sdk.deleteMetadata(agentId, 'version');

// Immutable metadata (cannot be modified or deleted)
await sdk.setMetadata(agentId, 'certification', 'verified', true);
// await sdk.deleteMetadata(agentId, 'certification'); // Error: MetadataImmutable
```

**Cost Summary:**
- Create: ~0.00319 SOL (rent for MetadataEntryPda)
- Update: ~0.000005 SOL (TX fee only)
- Delete: recovers rent to owner

## Reputation Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `getSummary` | `(agentId, minScore?, clientFilter?) => Promise<Summary>` | Get reputation summary |
| `getReputationSummary` | `(agentId) => Promise<{count, averageScore}>` | Simplified stats |
| `giveFeedback` | `(agentId, feedbackFile) => Promise<TransactionResult>` | Submit feedback |
| `getFeedback` | `(agentId, client, index) => Promise<Feedback \| null>` | Read feedback |
| `readFeedback` | `(agentId, client, index) => Promise<Feedback \| null>` | Alias |
| `revokeFeedback` | `(agentId, index) => Promise<TransactionResult>` | Revoke feedback |
| `getLastIndex` | `(agentId, client) => Promise<bigint>` | Get feedback count |
| `appendResponse` | `(agentId, client, index, uri, hash) => Promise<TransactionResult>` | Add response |

## Validation Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `requestValidation` | `(agentId, validator, methodId, uri, hash) => Promise<TransactionResult>` | Request validation |
| `respondToValidation` | `(agentId, requestIndex, score, uri, hash, status) => Promise<TransactionResult>` | Respond |

## Advanced Queries

**Requires custom RPC** (Helius, Triton, etc.):

| Method | Signature | Description |
|--------|-----------|-------------|
| `getAgentsByOwner` | `(owner: PublicKey) => Promise<AgentAccount[]>` | All agents by owner |
| `readAllFeedback` | `(agentId, includeRevoked?) => Promise<Feedback[]>` | All feedback |
| `getClients` | `(agentId) => Promise<PublicKey[]>` | All clients |

## RPC Requirements

| Operation | Default RPC | Custom RPC |
|-----------|-------------|------------|
| `loadAgent()` | Works | Works |
| `giveFeedback()` | Works | Works |
| `getSummary()` | Works | Works |
| `getAgentsByOwner()` | **Fails** | Works |
| `readAllFeedback()` | **Fails** | Works |
| `getClients()` | **Fails** | Works |

**Recommendation**: Start with default RPC. Use [Helius](https://helius.dev) free tier for advanced queries.
