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

## Liveness & Signatures

| Method | Signature | Description |
|--------|-----------|-------------|
| `isItAlive` | `(asset: PublicKey, options?) => Promise<LivenessReport>` | Ping all agent endpoints and return live/partial status |
| `sign` | `(asset: PublicKey, data: unknown, options?) => string` | Sign canonical JSON payload and return a JSON string |
| `verify` | `(payloadOrUri, asset, publicKey?) => Promise<boolean>` | Verify signed payload from JSON, URI, or file path |

```typescript
import { Keypair, PublicKey } from '@solana/web3.js';

const signer = Keypair.generate();
const sdk = new SolanaSDK({ signer });

const asset = new PublicKey('YourAgentAssetPubkey...');

// Liveness
const report = await sdk.isItAlive(asset);
console.log(report.status, report.liveServices, report.deadServices);

// Sign arbitrary data (returns canonical JSON string)
const signed = sdk.sign(asset, {
  action: 'ping',
  when: new Date(),
  payload: { hello: 'world' },
});

// Verify from JSON string (skip on-chain wallet check with publicKey)
const ok = await sdk.verify(signed, asset, signer.publicKey);
console.log(ok); // true

// Verify from a URI or file path
await sdk.verify('ipfs://QmPayloadCid', asset);
await sdk.verify('https://example.com/signed-payload.json', asset);
await sdk.verify('./signed-payload.json', asset);
```

## Collection Write Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `createCollection` | `(name, uri, options?) => Promise<TransactionResult>` | Create user-owned collection |
| `updateCollectionUri` | `(collection, newUri, options?) => Promise<TransactionResult>` | Update collection URI (name immutable) |

```typescript
// Agents register into the base collection by default
await sdk.registerAgent('ipfs://QmAgent1...');

// Custom collections are still supported
const result = await sdk.createCollection('My AI Agents', 'ipfs://QmMeta...');
const collection = result.collection;
await sdk.registerAgent('ipfs://QmAgent2...', collection);

// Update URI (name is immutable)
await sdk.updateCollectionUri(collection, 'ipfs://QmNewMeta...');
```

## Agent Read Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `loadAgent` | `(asset: PublicKey) => Promise<AgentAccount \| null>` | Load agent data |
| `getAgent` | `(asset: PublicKey) => Promise<AgentAccount \| null>` | Alias for loadAgent |
| `agentExists` | `(asset: PublicKey) => Promise<boolean>` | Check if agent exists |
| `getAgentOwner` | `(asset: PublicKey) => Promise<PublicKey \| null>` | Get agent owner |
| `isAgentOwner` | `(asset, address) => Promise<boolean>` | Check ownership |
| `getMetadata` | `(asset, key) => Promise<string \| null>` | Read metadata entry |

## Agent Write Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `registerAgent` | `(tokenUri?, collection?) => Promise<TransactionResult>` | Register new agent |
| `enableAtom` | `(asset) => Promise<TransactionResult>` | Enable ATOM one-way for an existing agent |
| `transferAgent` | `(asset, collection, newOwner) => Promise<TransactionResult>` | Transfer ownership |
| `setAgentUri` | `(asset, collection, newUri) => Promise<TransactionResult>` | Update agent URI |
| `setMetadata` | `(asset, key, value, immutable?) => Promise<TransactionResult>` | Set/update on-chain metadata |
| `deleteMetadata` | `(asset, key) => Promise<TransactionResult>` | Delete mutable metadata |

### On-chain Metadata

Store arbitrary key-value pairs directly on-chain (optional - most data should be in IPFS):

```typescript
import { PublicKey } from '@solana/web3.js';

const agentAsset = new PublicKey('YourAgentAssetPubkey...');

// Create metadata (first time: ~0.00319 SOL for rent)
await sdk.setMetadata(agentAsset, 'version', '1.0.0');

// Update metadata (same key: ~0.000005 SOL, TX fee only)
await sdk.setMetadata(agentAsset, 'version', '2.0.0');

// Read metadata
const version = await sdk.getMetadata(agentAsset, 'version');
console.log(version); // "2.0.0"

// Delete metadata (recovers rent to owner)
await sdk.deleteMetadata(agentAsset, 'version');

// Immutable metadata (cannot be modified or deleted)
await sdk.setMetadata(agentAsset, 'certification', 'verified', true);
// await sdk.deleteMetadata(agentAsset, 'certification'); // Error: MetadataImmutable
```

**Cost Summary:**
- Create: ~0.00319 SOL (rent for MetadataEntryPda)
- Update: ~0.000005 SOL (TX fee only)
- Delete: recovers rent to owner

## Reputation Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `getSummary` | `(asset, minScore?, clientFilter?) => Promise<Summary>` | Get reputation summary |
| `getReputationSummary` | `(asset) => Promise<{count, averageScore}>` | Simplified stats |
| `giveFeedback` | `(asset, feedbackData) => Promise<TransactionResult>` | Submit feedback |
| `getFeedback` | `(asset, client, index) => Promise<Feedback \| null>` | Read feedback |
| `readFeedback` | `(asset, client, index) => Promise<Feedback \| null>` | Alias |
| `revokeFeedback` | `(asset, index, feedbackHash) => Promise<TransactionResult>` | Revoke feedback (feedbackHash = sealHash) |
| `getLastIndex` | `(asset, client) => Promise<bigint>` | Get feedback count |
| `appendResponse` | `(asset, client, index, feedbackHash, uri, hash?) => Promise<TransactionResult>` | Add response (feedbackHash = sealHash) |

### Feedback Data

```typescript
await sdk.giveFeedback(agentAsset, {
  value: '99.77',                           // Decimal string, number, or bigint
  score: 85,                                // 0-100 (optional)
  tag1: 'uptime',                           // Category tag (optional)
  tag2: 'day',                              // Period tag (optional)
  feedbackUri: 'ipfs://QmFeedbackDetails',  // Feedback URI (required)
  feedbackFileHash: Buffer.alloc(32),       // Optional SHA-256 of feedback file
});
```

## SEAL v1 Methods

SEAL (Solana Event Authenticity Layer) provides client-side hash computation that mirrors the on-chain Keccak256 algorithm for trustless feedback verification.

| Method | Signature | Description |
|--------|-----------|-------------|
| `computeSealHash` | `(params: SealParams) => Buffer` | Compute Keccak256 SEAL hash matching on-chain |
| `computeFeedbackLeafV1` | `(asset, client, feedbackIndex, sealHash, slot) => Buffer` | Compute feedback leaf for hash-chain |
| `verifySealHash` | `(params: SealParams & { sealHash }) => boolean` | Verify feedback integrity against SEAL hash |
| `createSealParams` | `(value, decimals, score, tag1, tag2, endpoint, uri, fileHash?) => SealParams` | Helper to build SealParams |
| `validateSealInputs` | `(params: SealParams) => void` | Validate inputs (throws on invalid) |

```typescript
import {
  computeSealHash,
  verifySealHash,
  createSealParams,
} from '8004-solana';

// Build params and compute hash
const params = createSealParams(
  9977n, 2, 85, 'uptime', 'day',
  'https://api.example.com/mcp',
  'ipfs://QmFeedback...',
);
const sealHash = computeSealHash(params);

// Verify integrity
const valid = verifySealHash({ ...params, sealHash }); // true
```

The `sealHash` (passed as the `feedbackHash` parameter) is required for `revokeFeedback()` and `appendResponse()`.

## ATOM Engine Methods

ATOM (Agent Trust On-chain Model) provides reputation scoring with sybil resistance.

| Method | Signature | Description |
|--------|-----------|-------------|
| `getAtomStats` | `(asset) => Promise<AtomStats \| null>` | Get ATOM stats (quality score, confidence, etc.) |
| `getTrustTier` | `(asset) => Promise<TrustTier>` | Get trust tier (0-4: Unrated → Platinum) |
| `initializeAtomStats` | `(asset) => Promise<TransactionResult>` | Initialize ATOM stats account |
| `getEnrichedSummary` | `(asset) => Promise<EnrichedSummary>` | Get combined ATOM + feedback stats |

```typescript
// Get ATOM stats
const stats = await sdk.getAtomStats(agentAsset);
console.log(`Quality: ${stats.qualityScore}, Confidence: ${stats.confidence}`);

// Get trust tier
const tier = await sdk.getTrustTier(agentAsset);
// TrustTier: 0=Unrated, 1=Bronze, 2=Silver, 3=Gold, 4=Platinum
```

## Agent Wallet Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `setAgentWallet` | `(asset, keypair) => Promise<TransactionResult>` | Set operational wallet |
| `prepareSetAgentWallet` | `(asset, pubkey) => PreparedWalletTx` | Prepare for browser wallet signing |
| `getAgentByWallet` | `(wallet) => Promise<AgentAccount \| null>` | Find agent by wallet address |

```typescript
// Set wallet with keypair
await sdk.setAgentWallet(agentAsset, operationalKeypair);

// For browser wallets (Phantom, Solflare)
const prepared = sdk.prepareSetAgentWallet(agentAsset, walletPubkey);
const signature = await wallet.signMessage(prepared.message);
await prepared.complete(signature);

// Find agent by wallet
const agent = await sdk.getAgentByWallet(walletPubkey);
```

## Indexer Query Methods

These methods query the indexer for aggregated data.

| Method | Signature | Description |
|--------|-----------|-------------|
| `searchAgents` | `(query, options?) => Promise<Agent[]>` | Search agents by name/description |
| `getLeaderboard` | `(options?) => Promise<LeaderboardEntry[]>` | Get top agents by reputation |
| `getGlobalStats` | `() => Promise<GlobalStats>` | Get global registry statistics |
| `getCollectionStats` | `(collection) => Promise<CollectionStats>` | Get collection statistics |
| `isIndexerAvailable` | `() => Promise<boolean>` | Check if indexer is reachable |

```typescript
// Search agents
const results = await sdk.searchAgents('trading bot', { limit: 20 });

// Get leaderboard
const top = await sdk.getLeaderboard({ minTier: 2, limit: 50 });

// Get global stats
const stats = await sdk.getGlobalStats();
console.log(`Total agents: ${stats.totalAgents}, Platinum: ${stats.platinumAgents}`);
```

## Advanced Queries

**Requires custom RPC** (Helius, Triton, etc.):

| Method | Signature | Description |
|--------|-----------|-------------|
| `getAllAgents` | `(options?) => Promise<AgentWithMetadata[]>` | All agents with metadata |
| `getAllFeedbacks` | `(includeRevoked?) => Promise<Map<string, Feedback[]>>` | All feedbacks grouped by asset |
| `getAgentsByOwner` | `(owner: PublicKey) => Promise<AgentAccount[]>` | All agents by owner |
| `readAllFeedback` | `(asset, includeRevoked?) => Promise<Feedback[]>` | All feedback for one agent |
| `getClients` | `(asset) => Promise<PublicKey[]>` | All clients for one agent |

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
  console.log(`Agent ${account.getAssetPublicKey().toBase58().slice(0,8)}...: ${feedbacks?.length || 0} feedbacks`);
}
```

### getAllFeedbacks

```typescript
// Get ALL feedbacks for ALL agents as a Map (2 RPC calls)
const feedbacksMap = await sdk.getAllFeedbacks();

// Access feedbacks by asset (string key)
const agentFeedbacks = feedbacksMap.get(agentAsset.toBase58()) || [];
console.log(`Agent has ${agentFeedbacks.length} feedbacks`);

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
import { IPFSClient, buildRegistrationFileJson, ServiceType } from '8004-solana';

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
  services: [
    { type: ServiceType.MCP, value: 'https://api.example.com/mcp' },
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
| Status | Full support | Full support | Placeholder |
