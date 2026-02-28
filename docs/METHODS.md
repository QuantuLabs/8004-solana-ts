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
  cluster: 'devnet',      // 'devnet' | 'localnet' | 'mainnet-beta'
  rpcUrl: 'https://...',  // Optional custom RPC
  signer: keypair,        // Optional signer for write operations
  indexerGraphqlUrl: 'https://your-indexer.example.com/v2/graphql',
  programIds: {           // Override path for localnet/mainnet-beta deployments
    agentRegistry: '...',
    atomEngine: '...',
  },
});
```

Network guidance:
- `devnet`: built-in program IDs are preconfigured.
- `localnet`: supported; provide your deployed `programIds`.
- `mainnet-beta`: supported and RPC-ready; provide mainnet `programIds` to complete the switch.
- Without `programIds`, `cluster: 'mainnet-beta'` currently warns and still resolves to devnet default program IDs.

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

## Collection + Parent Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `createCollectionData` | `(input: CollectionMetadataInput) => CollectionMetadataJson` | Build collection schema JSON only (no upload) |
| `createCollection` | `(data: CollectionMetadataInput, options?: { uploadToIpfs?: boolean }) => Promise<CreateCollectionUploadResult>` | Build metadata JSON and optionally upload to IPFS |
| `createCollection` (legacy) | `(name: string, uri: string, options?) => Promise<TransactionResult & { collection?: PublicKey }>` | Legacy on-chain API, kept for compatibility only |
| `setCollectionPointer` | `(asset, col, options?: SetCollectionPointerOptions) => Promise<TransactionResult \| PreparedTransaction>` | Set canonical collection pointer (`c1:<cid>`) |
| `setParentAsset` | `(asset, parentAsset, options?: SetParentAssetOptions) => Promise<TransactionResult \| PreparedTransaction>` | Set parent asset relationship for hierarchy |
| `updateCollectionUri` (legacy) | `(collection, newUri, options?) => Promise<TransactionResult>` | Legacy on-chain API, kept for compatibility only |

```typescript
const collectionInput = {
  name: 'CasterCorp Agents',
  symbol: 'CAST',
  description: 'Main collection metadata',
  image: 'ipfs://QmCollectionImage...',
  banner_image: 'ipfs://QmCollectionBanner...',
  socials: {
    website: 'https://castercorp.ai',
    x: 'https://x.com/castercorp',
    discord: 'https://discord.gg/castercorp',
  },
};

// 1) Create schema-compliant JSON only
const collectionData = sdk.createCollectionData(collectionInput);

// 2) Create + upload (CID-first flow)
const upload = await sdk.createCollection(collectionInput);
// upload.metadata -> JSON
// upload.cid      -> CID (when uploaded)
// upload.uri      -> ipfs://<cid>
// upload.pointer  -> canonical c1:b... pointer

// 3) Register agent (ATOM is off by default)
const result = await sdk.registerAgent('ipfs://QmAgentMetadata...');
// Optional ATOM opt-in at registration:
// const result = await sdk.registerAgent('ipfs://QmAgentMetadata...', undefined, { atomEnabled: true });

// 4) Advanced: set canonical pointer on the agent account
await sdk.setCollectionPointer(result.asset, upload.pointer!); // lock=true by default

// 5) Advanced: parent link (hierarchy)
await sdk.setParentAsset(result.asset, parentAssetPubkey, { lock: false });
```

Collection pointer and parent association rules are documented in [`COLLECTION.md`](./COLLECTION.md).  
Advanced end-to-end usage is shown in [`examples/collection-flow.ts`](../examples/collection-flow.ts).

### Collection Read Methods

> These methods use program-account scans and require advanced RPC (`requireAdvancedQueries`).

| Method | Signature | Description |
|--------|-----------|-------------|
| `getCollection` | `(collection: PublicKey) => Promise<CollectionInfo \| null>` | Read one registry config |
| `getCollections` | `() => Promise<CollectionInfo[]>` | List all registry configs |
| `getCollectionAgents` | `(collection: PublicKey, options?) => Promise<AgentAccount[]>` | List agents linked to one registry |

```typescript
const baseRegistry = await sdk.getBaseCollection();
if (baseRegistry) {
  const one = await sdk.getCollection(baseRegistry);
  const all = await sdk.getCollections();
  const agents = await sdk.getCollectionAgents(baseRegistry, { limit: 50 });
  console.log(one?.registryType, all.length, agents.length);
}
```

## Agent Read Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `loadAgent` | `(asset: PublicKey) => Promise<AgentAccount \| null>` | Load full on-chain `AgentAccount` |
| `getAgent` | `(asset: PublicKey) => Promise<AgentAccount \| null>` | Alias for loadAgent |
| `agentExists` | `(asset: PublicKey) => Promise<boolean>` | Check if agent exists |
| `getAgentOwner` | `(asset: PublicKey) => Promise<PublicKey \| null>` | Get agent owner |
| `isAgentOwner` | `(asset, address) => Promise<boolean>` | Check ownership |
| `getMetadata` | `(asset, key) => Promise<string \| null>` | Read metadata entry |

### `loadAgent()` Important Fields

```typescript
const agent = await sdk.loadAgent(assetPubkey);
if (!agent) return;

agent.getAssetPublicKey();              // Core asset pubkey
agent.getCollectionPublicKey();         // Base registry pubkey (not c1 pointer)
agent.getOwnerPublicKey();              // Cached owner snapshot
agent.getCreatorPublicKey();            // Immutable creator snapshot
agent.getCreatorsPublicKeys();          // [creator]
agent.creators;                         // alias for compatibility
agent.getParentAssetPublicKey();        // parent asset or null
agent.isParentLocked();                 // parent lock state
agent.col;                              // canonical collection pointer (c1:...)
agent.isCollectionPointerLocked();      // collection pointer lock state
agent.getAgentWalletPublicKey();        // operational wallet or null
```

## Agent Write Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `registerAgent` | `(tokenUri?: string, collection?: PublicKey, options?: RegisterAgentOptions) => Promise<TransactionResult \| PreparedTransaction>` | Register new agent (base registry default) |
| `enableAtom` | `(asset) => Promise<TransactionResult>` | Enable ATOM one-way for an existing agent |
| `transferAgent` | `(asset, newOwner, options?) => Promise<TransactionResult \| PreparedTransaction>` | Transfer ownership (base registry auto-resolved; standard token wallet transfer also works) |
| `transferAgent` (legacy) | `(asset, collection, newOwner, options?) => Promise<TransactionResult \| PreparedTransaction>` | Transfer ownership with explicit base registry pubkey |
| `syncOwner` | `(asset, options?) => Promise<TransactionResult \| PreparedTransaction>` | Sync cached owner with live Core owner |
| `setAgentUri` | `(asset, newUri, options?) => Promise<TransactionResult \| PreparedTransaction>` | Update agent URI (base registry auto-resolved) |
| `setAgentUri` (legacy) | `(asset, collection, newUri, options?) => Promise<TransactionResult \| PreparedTransaction>` | Update URI with explicit base registry pubkey |
| `setCollectionPointer` | `(asset, col, options?: SetCollectionPointerOptions)` | Set canonical collection pointer (`c1:<cid>`) |
| `setParentAsset` | `(asset, parentAsset, options?: SetParentAssetOptions)` | Set parent relationship |
| `setMetadata` | `(asset, key, value, immutable?) => Promise<TransactionResult>` | Set/update on-chain metadata |
| `deleteMetadata` | `(asset, key) => Promise<TransactionResult>` | Delete mutable metadata |

### `registerAgent()` Options

`registerAgent(tokenUri?, collection?, options?)` supports:
- `collection` (2nd positional arg): optional base registry pubkey; omit to use the default registry.
- `skipSend`: return unsigned transaction payload instead of sending.
- `signer`: signer pubkey required in `skipSend` mode when SDK has no signer.
- `assetPubkey`: pre-generated asset keypair pubkey required in `skipSend` mode.
- `atomEnabled`: defaults to `false`; set `true` to enable ATOM auto-init at registration time.
- `collectionPointer`: optional canonical pointer (`c1:...`) attached right after successful register.
- `collectionLock`: optional lock flag for `collectionPointer` attach (`true` by default).

ATOM can also be enabled later via `enableAtom(asset)` + `initializeAtomStats(asset)`.  
`enableAtom()` is one-way/irreversible for that agent.

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

Limits enforced on-chain:
- `agent_uri` max `250` bytes
- metadata key max `32` bytes
- metadata value max `250` bytes

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
| `revokeFeedback` | `(asset, index, sealHash?, options?) => Promise<TransactionResult \| PreparedTransaction>` | Revoke feedback (default ownership preflight + auto `sealHash`) |
| `getLastIndex` | `(asset, client) => Promise<bigint>` | Get last feedback index for a client (`-1` when none) |
| `appendResponse` | `(asset, client, index, uri, hash?, options?) => Promise<TransactionResult \| PreparedTransaction>` | Add response (auto-resolves `sealHash` from indexer) |
| `appendResponse` | `(asset, client, index, sealHash, uri, hash?, options?) => Promise<TransactionResult \| PreparedTransaction>` | Add response (explicit `sealHash`) |
| `appendResponseBySealHash` | `(asset, client, sealHash, uri, hash?, options?) => Promise<TransactionResult \| PreparedTransaction>` | Add response when only `sealHash` is available (auto-resolves `feedbackIndex`) |

### Feedback Data

```typescript
await sdk.giveFeedback(agentAsset, {
  value: '99.77',                           // Decimal string, number, or bigint
  score: 85,                                // 0-100 (optional)
  tag1: 'uptime',                           // Category tag (optional)
  tag2: 'day',                              // Period tag (optional)
  feedbackUri: 'ipfs://QmFeedbackDetails',  // Feedback URI (required)
});
```

### Revoke + Response Helpers

`revokeFeedback()` defaults:
- `verifyFeedbackClient: true` (checks signer-owned indexed feedback and non-revoked state before sending)
- `waitForIndexerSync: true` (short sync wait when feedback is not visible yet)
- `sealHash` auto-resolution from indexer when omitted

```typescript
await sdk.revokeFeedback(agentAsset, 12n); // ownership preflight + auto sealHash

await sdk.revokeFeedback(agentAsset, 12n, sealHash, {
  verifyFeedbackClient: false,
  waitForIndexerSync: false,
});
await sdk.appendResponse(
  agentAsset,
  clientPubkey,
  12n,
  'ipfs://QmResponse...'
); // auto-resolves sealHash
```

Use `appendResponseBySealHash()` only when your service stores `sealHash` but not `feedbackIndex`.

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

`sealHash` can be passed explicitly for deterministic server-side workflows.  
If omitted, SDK tries to resolve it from indexed feedback (`asset + client + feedbackIndex`) with short sync wait.  
If `feedbackIndex` is unknown, use `appendResponseBySealHash()` to resolve index from `sealHash`.

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
| `searchAgents` | `(params: AgentSearchParams) => Promise<IndexedAgent[]>` | Search agents by owner/creator/base registry/pointer/parent filters |
| `getAgentByAgentId` | `(agentId: string \| number \| bigint) => Promise<IndexedAgent \| null>` | Read one agent by backend sequence id (REST: `agent_id`; GraphQL: `agentId`/`agentid`) |
| `getFeedbackById` | `(feedbackId: string) => Promise<IndexedFeedback \| null>` | Read one feedback by sequential id (`feedbacks.feedback_id`) |
| `getFeedbackResponsesByFeedbackId` | `(feedbackId: string, limit?: number) => Promise<IndexedFeedbackResponse[]>` | Read responses by backend feedback id using REST-safe lookup (`feedbacks.feedback_id -> asset`, then `feedback_responses.asset + feedback_id`); fails closed on ambiguous id-to-asset mappings |
| `getCollectionPointers` | `(options?) => Promise<CollectionPointerRecord[]>` | Read canonical `c1:` collection-pointer rows |
| `getCollectionAssetCount` | `(col: string, creator?) => Promise<number>` | Count assets attached to one pointer |
| `getCollectionAssets` | `(col: string, options?) => Promise<IndexedAgent[]>` | List assets attached to one pointer |
| `getLeaderboard` | `(options?) => Promise<LeaderboardEntry[]>` | Get top agents by reputation |
| `getGlobalStats` | `() => Promise<GlobalStats>` | Get global registry statistics |
| `isIndexerAvailable` | `() => Promise<boolean>` | Check if indexer is reachable |

`getFeedbackById()` and `getFeedbackResponsesByFeedbackId()` accept only sequential numeric backend IDs (for example `"123"`). Canonical IDs like `"<asset>:<client>:<index>"` are rejected (return `null` / `[]`) and are not auto-converted. For REST indexers where response ids are asset-scoped, `getFeedbackResponsesByFeedbackId()` internally resolves the feedback asset first, then filters responses by `asset + feedback_id`. If one `feedback_id` maps to multiple distinct assets, the method fails closed and throws `IndexerError` (`INVALID_RESPONSE`) instead of returning potentially incorrect responses.

```typescript
// Search agents with explicit filters
const results = await sdk.searchAgents({
  owner: 'OwnerPubkey...',
  creator: 'CreatorPubkey...',
  collection: 'BaseRegistryPubkey...',
  collectionPointer: 'c1:bafybeigdyr...',
  parentAsset: 'ParentAssetPubkey...',
  colLocked: true,
  limit: 20,
});

// GraphQL + REST: read by sequence id
const bySequenceId = await sdk.getAgentByAgentId(42);

// Feedback id reads (numeric backend ids only)
const feedback = await sdk.getFeedbackById('123');
const responses = await sdk.getFeedbackResponsesByFeedbackId('123', 10);

// Asset pubkey lookup (all backends)
const byAsset = await sdk.getAgent('AssetPubkeyBase58...');

// Query canonical collection pointers
const pointers = await sdk.getCollectionPointers({ creator: 'CreatorPubkey...' });

// Count + list assets for one pointer
const count = await sdk.getCollectionAssetCount('c1:bafybeigdyr...', 'CreatorPubkey...');
const assets = await sdk.getCollectionAssets('c1:bafybeigdyr...', { limit: 50 });

// Get leaderboard
const top = await sdk.getLeaderboard({ minTier: 2, limit: 50 });

// Get global stats
const stats = await sdk.getGlobalStats();
console.log(`Total agents: ${stats.totalAgents}, Platinum: ${stats.platinumAgents}`);
```

Compatibility notes:
- SDK now targets modern indexer collection APIs (`/collections`, `collection=...`, GraphQL `collections(...)`).
- Legacy indexers are still supported via automatic fallback (`/collection_pointers`, `col=...`, GraphQL `collectionPointers(...)` / `col` args).
- `getAgentByAgentId()` is backend-specific: REST resolves `agent_id`; GraphQL resolves sequential `agentId` / `agentid` when exposed.
- Use `getAgent(asset)` when you need asset pubkey lookups.
- `getAgentByIndexerId()` remains available as an alias to `getAgentByAgentId()`.

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
