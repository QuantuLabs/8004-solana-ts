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
| `getAllAgents` | `(options?) => Promise<AgentWithMetadata[]>` | All agents with metadata |
| `getAllFeedbacks` | `(includeRevoked?) => Promise<Map<bigint, Feedback[]>>` | All feedbacks grouped by agent |
| `getAgentsByOwner` | `(owner: PublicKey) => Promise<AgentAccount[]>` | All agents by owner |
| `readAllFeedback` | `(agentId, includeRevoked?) => Promise<Feedback[]>` | All feedback for one agent |
| `getClients` | `(agentId) => Promise<PublicKey[]>` | All clients for one agent |

### getAllAgents Options

```typescript
interface GetAllAgentsOptions {
  includeFeedbacks?: boolean;  // Attach feedbacks to each agent (default: false)
  includeRevoked?: boolean;    // Include revoked feedbacks (default: false)
}

// Basic: Get all agents with on-chain metadata (2 RPC calls)
const agents = await sdk.getAllAgents();

// With feedbacks: Get all agents + all feedbacks (4 RPC calls)
const agentsWithFeedbacks = await sdk.getAllAgents({ includeFeedbacks: true });
for (const { account, metadata, feedbacks } of agentsWithFeedbacks) {
  console.log(`Agent #${account.agent_id}: ${feedbacks?.length || 0} feedbacks`);
}
```

### getAllFeedbacks

```typescript
// Get ALL feedbacks for ALL agents as a Map (2 RPC calls)
const feedbacksMap = await sdk.getAllFeedbacks();

// Access feedbacks by agent ID
const agent83Feedbacks = feedbacksMap.get(83n) || [];
console.log(`Agent 83 has ${agent83Feedbacks.length} feedbacks`);

// Include revoked feedbacks
const allFeedbacks = await sdk.getAllFeedbacks(true);
```

**Performance comparison:**
| Approach | RPC Calls |
|----------|-----------|
| `readAllFeedback()` per agent (90 agents) | ~1000 |
| `getAllAgents({ includeFeedbacks: true })` | **4** |
| `getAllFeedbacks()` | **2** |

## RPC Requirements

| Operation | Default RPC | Custom RPC |
|-----------|-------------|------------|
| `loadAgent()` | Works | Works |
| `giveFeedback()` | Works | Works |
| `getSummary()` | Works | Works |
| `getAllAgents()` | **Fails** | Works |
| `getAllFeedbacks()` | **Fails** | Works |
| `getAgentsByOwner()` | **Fails** | Works |
| `readAllFeedback()` | **Fails** | Works |
| `getClients()` | **Fails** | Works |

**Recommendation**: Start with default RPC. Use [Helius](https://helius.dev) free tier for advanced queries.

## IPFS Client

The SDK includes a built-in IPFS client supporting multiple providers.

### Constructor

```typescript
import { IPFSClient } from '8004-solana';

// Option 1: Pinata (recommended for production)
const ipfs = new IPFSClient({
  pinataEnabled: true,
  pinataJwt: process.env.PINATA_JWT, // Get free JWT at https://pinata.cloud
});

// Option 2: Local IPFS node
const ipfs = new IPFSClient({
  url: 'http://localhost:5001',
});

// Option 3: Filecoin Pin (placeholder - requires CLI)
const ipfs = new IPFSClient({
  filecoinPinEnabled: true,
  filecoinPrivateKey: '...',
});
```

### IPFSClient Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `add` | `(data: string) => Promise<string>` | Add string data, returns CID |
| `addJson` | `(data: object) => Promise<string>` | Add JSON object, returns CID |
| `addFile` | `(filepath: string) => Promise<string>` | Add file from disk (Node.js only), returns CID |
| `addRegistrationFile` | `(file: RegistrationFile, chainId?, registry?) => Promise<string>` | Add agent metadata, returns CID |
| `get` | `(cid: string) => Promise<string>` | Get data by CID (supports `ipfs://` prefix) |
| `getJson` | `<T>(cid: string) => Promise<T>` | Get and parse JSON by CID |
| `getRegistrationFile` | `(cid: string) => Promise<RegistrationFile>` | Get agent metadata by CID |
| `pin` | `(cid: string) => Promise<{ pinned: string[] }>` | Pin CID to local node |
| `unpin` | `(cid: string) => Promise<{ unpinned: string[] }>` | Unpin CID from local node |
| `close` | `() => Promise<void>` | Close client connection |

### Usage Examples

```typescript
import { IPFSClient, buildRegistrationFileJson, EndpointType } from '8004-solana';

const ipfs = new IPFSClient({
  pinataEnabled: true,
  pinataJwt: process.env.PINATA_JWT,
});

// Upload image
const imageCid = await ipfs.addFile('./agent-avatar.png');
const imageUri = `ipfs://${imageCid}`;

// Build and upload metadata
const metadata = buildRegistrationFileJson({
  name: 'My Agent',
  description: 'A helpful AI agent',
  image: imageUri,
  endpoints: [
    { type: EndpointType.MCP, value: 'https://api.example.com/mcp' },
  ],
});

const metadataCid = await ipfs.addJson(metadata);
const metadataUri = `ipfs://${metadataCid}`;

// Read back data
const data = await ipfs.getJson(metadataCid);
console.log(data.name); // "My Agent"
```

### Provider Comparison

| Feature | Pinata | Local Node | Filecoin Pin |
|---------|--------|------------|--------------|
| Setup | API key only | Run IPFS daemon | API key |
| Persistence | Pinned (persistent) | Local only | Filecoin deals |
| Free tier | 1GB free | Unlimited (local) | Varies |
| Speed | Fast | Fastest | Slower |
| Status | ✅ Full support | ✅ Full support | ⚠️ Placeholder |
