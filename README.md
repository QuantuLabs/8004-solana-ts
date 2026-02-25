# 8004-solana

[![npm](https://img.shields.io/npm/v/8004-solana)](https://www.npmjs.com/package/8004-solana)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-QuantuLabs%2F8004--solana--ts-blue)](https://github.com/QuantuLabs/8004-solana-ts)

TypeScript SDK for 8004 Agent Registry on Solana.

> **Autonomous Agents** (Clawbot, Moltbot, etc.): See [`skill.md`](./skill.md) for the complete SDK reference designed for autonomous AI agent consumption.
>
> **New here?** Follow the [Quickstart Guide](./docs/QUICKSTART.md) to register your first agent in 5 minutes.

- **Register agents as NFTs** on Solana blockchain
- **Manage agent metadata** and endpoints (MCP, A2A)
- **Submit and query reputation feedback** with SEAL v1 integrity verification
- **Sign & verify** with agent operational wallets
- **OASF taxonomies** support (skills & domains)

## Installation

```bash
npm install 8004-solana
```

## Program IDs (Devnet Defaults)

- **Agent Registry**: `8oo4J9tBB3Hna1jRQ3rWvJjojqM5DYTDJo5cejUuJy3C`
- **ATOM Engine**: `AToMufS4QD6hEXvcvBDg9m1AHeCLpmZQsyfYa5h9MwAF`

For localnet/mainnet, override per SDK instance:

```typescript
const sdk = new SolanaSDK({
  rpcUrl: 'http://127.0.0.1:8899',
  signer,
  programIds: {
    agentRegistry: 'YourLocalnetRegistryProgramId',
    atomEngine: 'YourLocalnetAtomProgramId',
    // mplCore is optional (defaults to canonical Metaplex Core ID)
  },
});
```

## Quick Start

```typescript
import {
  SolanaSDK,
  IPFSClient,
  buildRegistrationFileJson,
  ServiceType,
  Tag,
} from '8004-solana';
import { Keypair } from '@solana/web3.js';

const signer = Keypair.fromSecretKey(/* your key */);
const pinataJwt = process.env.PINATA_JWT;
const ipfs = pinataJwt
  ? new IPFSClient({ pinataEnabled: true, pinataJwt })
  : new IPFSClient({ url: 'http://localhost:5001' });
const sdk = new SolanaSDK({ cluster: 'devnet', signer, ipfsClient: ipfs });

// 1. Create collection metadata + upload (off-chain)
const collection = await sdk.createCollection({
  name: 'CasterCorp Agents',
  symbol: 'CAST',
  description: 'Main collection for CasterCorp agents',
  image: 'ipfs://QmCollectionImage...',
  socials: { website: 'https://castercorp.ai', x: '@castercorp' },
});

console.log('Collection CID:', collection.cid);   // <- reuse this in your asset workflow
console.log('Collection URI:', collection.uri);   // ipfs://<cid>
console.log('Collection Pointer:', collection.pointer); // c1:b...

// 2. Build agent metadata
const agentMeta = buildRegistrationFileJson({
  name: 'My AI Agent',
  description: 'Autonomous agent for task automation',
  image: 'ipfs://QmAgentAvatar...',
  services: [
    { type: ServiceType.MCP, value: 'https://api.example.com/mcp' },
    { type: ServiceType.A2A, value: 'https://api.example.com/a2a' },
    { type: ServiceType.OASF, value: 'https://api.example.com/oasf' },
  ],
  skills: ['natural_language_processing/text_generation/text_generation'],
  domains: ['technology/software_engineering/software_engineering'],
});

// 3. Upload and register (uses the base collection automatically)
const agentUri = `ipfs://${await ipfs.addJson(agentMeta)}`;
const agent = await sdk.registerAgent(agentUri);
console.log('Agent:', agent.asset.toBase58());

// 4. (Advanced) Link agent to canonical collection pointer on-chain
await sdk.setCollectionPointer(agent.asset, collection.pointer!); // lock=true by default

// 5. Set operational wallet
const opWallet = Keypair.generate();
await sdk.setAgentWallet(agent.asset, opWallet);

// 6. Give feedback - accepts decimal strings or raw values
await sdk.giveFeedback(agent.asset, {
  value: '99.77',                  // Decimal string -> auto-encoded to 9977, decimals=2
  tag1: Tag.uptime,                // 8004 standardized tag (or free text)
  tag2: Tag.day,                   // Time period
  feedbackUri: 'ipfs://QmFeedback...',
  feedbackFileHash: Buffer.alloc(32), // Optional integrity hash
});

// 7. Check reputation
const summary = await sdk.getSummary(agent.asset);
console.log(`Score: ${summary.averageScore}, Feedbacks: ${summary.totalFeedbacks}`);
```

### Create Collection (CID-first flow)

```typescript
const collectionUpload = await sdk.createCollection({
  name: 'My Collection',
  description: 'Collection metadata stored on IPFS',
});

// Returned by createCollection()
const cid = collectionUpload.cid;          // e.g. Qm...
const uri = collectionUpload.uri;          // ipfs://Qm...
const pointer = collectionUpload.pointer;  // c1:b...

// Use `cid` / `uri` in your asset creation pipeline.
// Keep `setCollectionPointer()` separate for advanced on-chain linking.
```

Legacy on-chain collection APIs are still callable for backward compatibility but are inactive on current programs:
- `sdk.createCollection(name, uri, options?)`
- `sdk.updateCollectionUri(collection, newUri, options?)`

On protocol `v0.6.x` (single-collection architecture), they return `success: false` with an error message.

### Collection + Parent Association Rules

- Use the canonical pointer returned by `sdk.createCollection(...)` (`c1:b...`).
- Pointer constraints enforced on-chain: `c1:` prefix, non-empty CID payload, lowercase letters/digits only after prefix, max `128` bytes total.
- `sdk.setCollectionPointer(asset, pointer, { lock? })`: signer must match immutable `AgentAccount.creator`.
- `lock` defaults to `true` (first successful write makes `col` immutable via `col_locked`).
- For editable workflows, call once with `{ lock: false }`, then finalize later with default `lock: true`.
- `sdk.setParentAsset(child, parent, { lock? })`: signer must be current owner of the child asset and must equal the parent agent creator snapshot.
- Parent constraints enforced on-chain: parent asset must exist/live, child cannot point to itself, and `parent_locked` behaves like `col_locked`.
- `loadAgent()` exposes all related fields (`creator`, `creators`, `col`, `parent_asset`, `col_locked`, `parent_locked`).
- `c1:...` collection pointer is a string, not a pubkey (base-registry pubkey is an internal on-chain account; standard `setAgentUri`/`transferAgent` calls auto-resolve it).

### Web3 Wallet (Phantom, Solflare)

```typescript
// For setAgentWallet with browser wallets
const prepared = await sdk.prepareSetAgentWallet(agent.asset, walletPubkey);
const signature = await wallet.signMessage(prepared.message);
await prepared.complete(signature);
```

### Sign & Verify

```typescript
// Sign any data with agent's operational wallet
const signed = sdk.sign(agent.asset, {
  action: 'authorize',
  user: 'alice',
  permissions: ['read', 'write'],
});

// Returns canonical JSON:
// {
//   "alg": "ed25519",
//   "asset": "AgentAssetPubkey...",
//   "data": { "action": "authorize", "permissions": ["read","write"], "user": "alice" },
//   "issuedAt": 1705512345,
//   "nonce": "randomBase58String",
//   "sig": "base58Ed25519Signature...",
//   "v": 1
// }

// Verify (fetches agent wallet from chain)
const isValid = await sdk.verify(signed, agent.asset);

// Verify with known public key (no RPC)
const isValid2 = await sdk.verify(signed, agent.asset, opWallet.publicKey);
```

### Liveness Check

```typescript
// Ping agent endpoints
const report = await sdk.isItAlive(agent.asset);
console.log(report.status); // 'live' | 'partially' | 'not_live'
console.log(report.liveServices, report.deadServices);
```

### Read-Only Mode

```typescript
const sdk = new SolanaSDK({ cluster: 'devnet' }); // No signer = read-only

const agent = await sdk.loadAgent(assetPubkey);
const summary = await sdk.getSummary(assetPubkey);
```

## Indexer

The SDK uses an indexer by default for search and query operations (feedbacks, validations, agent listings). This provides fast off-chain queries without scanning the blockchain.

Default backend is **GraphQL v2** (public read-only reference deployment).

You can self-host your own indexer: [github.com/QuantuLabs/8004-solana-indexer](https://github.com/QuantuLabs/8004-solana-indexer)

```typescript
// Custom GraphQL indexer (recommended)
const sdk = new SolanaSDK({
  cluster: 'devnet',
  indexerGraphqlUrl: 'https://your-indexer.example.com/v2/graphql',
});

// Legacy REST v1 (Supabase PostgREST) - deprecated but supported for now
const sdk = new SolanaSDK({
  cluster: 'devnet',
  indexerUrl: 'https://your-project.supabase.co/rest/v1',
  indexerApiKey: process.env.INDEXER_API_KEY,
});

// Force on-chain reads when possible (indexer-only methods will still require an indexer)
const sdk = new SolanaSDK({
  cluster: 'devnet',
  forceOnChain: true,
});
```

Environment variables (optional):

- `INDEXER_GRAPHQL_URL`: override GraphQL endpoint
- `INDEXER_URL` + `INDEXER_API_KEY`: legacy REST v1 (Supabase PostgREST)

## Feedback System

The feedback system supports rich metrics with 8004 standardized tags. `value` is required, `score` is optional.

```typescript
// Basic feedback (value + feedbackUri required)
await sdk.giveFeedback(agent.asset, {
  value: '85',
  tag1: 'starred',
  feedbackUri: 'ipfs://QmFeedback...',
});

// Revenue tracking with decimals
await sdk.giveFeedback(agent.asset, {
  value: '150.00',       // $150.00 -> auto-encoded to 15000, decimals=2
  tag1: 'revenues',
  tag2: 'week',
  feedbackUri: 'ipfs://QmRevenue...',
});

// Uptime tracking
await sdk.giveFeedback(agent.asset, {
  value: '99.50',        // 99.50% -> auto-encoded to 9950, decimals=2
  tag1: 'uptime',
  tag2: 'day',
  feedbackUri: 'ipfs://QmUptime...',
});
```

See [FEEDBACK.md](./docs/FEEDBACK.md) for all 8004 tags and patterns.

## Tags

Use `Tag` helpers for standard tags, or pass custom strings (max 32 bytes):

```typescript
import { Tag } from '8004-solana';

// Using Tag helper
await sdk.giveFeedback(asset, {
  value: '99.77',
  tag1: Tag.uptime,     // 'uptime'
  tag2: Tag.day,        // 'day'
  feedbackUri: 'ipfs://QmFeedback...',
});

// Custom tags (free text)
await sdk.giveFeedback(asset, {
  value: '42.5',
  tag1: 'my-custom-metric',
  tag2: 'hourly',
  feedbackUri: 'ipfs://QmFeedback...',
});
```

See [FEEDBACK.md](./docs/FEEDBACK.md) for the complete tag reference.

## ATOM Engine

The SDK auto-initializes ATOM stats on registration (atomEnabled: true by default). ATOM provides:

- **Trust Tiers**: Bronze → Silver → Gold → Platinum
- **Quality Score**: Weighted average with decay
- **Sybil Detection**: HyperLogLog client tracking

```typescript
// Disable ATOM at creation (if you aggregate reputation via indexer)
await sdk.registerAgent('ipfs://...', undefined, { atomEnabled: false });
```

If you opt out at creation, you can later enable ATOM (one-way) and initialize stats:

```typescript
await sdk.enableAtom(asset);
await sdk.initializeAtomStats(asset);
```

## SEAL v1 (Solana Event Authenticity Layer)

SEAL provides client-side hash computation that mirrors the on-chain algorithm, enabling trustless verification of feedback integrity without replaying all events.

```typescript
import {
  computeSealHash,
  computeFeedbackLeafV1,
  verifySealHash,
  createSealParams,
  validateSealInputs,
} from '8004-solana';

// Build SEAL params from feedback data
const params = createSealParams(
  9977n,              // value (bigint)
  2,                  // valueDecimals
  85,                 // score (or null)
  'uptime',           // tag1
  'day',              // tag2
  'https://api.example.com/mcp', // endpoint
  'ipfs://QmFeedback...',        // feedbackUri
);

// Compute the SEAL hash (matches on-chain Keccak256)
const sealHash = computeSealHash(params);

// Verify a feedback's integrity
const isValid = verifySealHash({ ...params, sealHash });
```

The `sealHash` is required when calling `revokeFeedback()` and `appendResponse()` to prove feedback authenticity.

## RPC Provider Recommendations

Default Solana devnet RPC works for basic operations. For **production** or **advanced queries** (getAllAgents, getAgentsByOwner), use a custom RPC.

| Provider | Free Tier | Signup |
|----------|-----------|--------|
| **Helius** | 100k req/month | [helius.dev](https://helius.dev) |
| **QuickNode** | 10M credits/month | [quicknode.com](https://quicknode.com) |
| **Alchemy** | 300M CU/month | [alchemy.com](https://alchemy.com) |

```typescript
const sdk = new SolanaSDK({
  rpcUrl: 'https://your-helius-rpc.helius.dev',
  signer: yourKeypair,
});
```

## Examples

| Example | Description |
|---------|-------------|
| [`quick-start.ts`](examples/quick-start.ts) | Basic read/write with IPFS upload |
| [`feedback-usage.ts`](examples/feedback-usage.ts) | Submit and read feedback |
| [`agent-update.ts`](examples/agent-update.ts) | On-chain metadata & URI update |
| [`transfer-agent.ts`](examples/transfer-agent.ts) | Transfer agent ownership |
| [`server-mode.ts`](examples/server-mode.ts) | Server/client architecture with skipSend |
| [`basic-indexer.ts`](examples/basic-indexer.ts) | Indexer queries and search |

## Documentation

- [API Reference](./docs/METHODS.md) - All methods with examples
- [Feedback Guide](./docs/FEEDBACK.md) - Tags, value/decimals, advanced patterns
- [Quickstart](./docs/QUICKSTART.md) - Step-by-step guide
- [Costs](./docs/COSTS.md) - Transaction costs
- [OASF Taxonomies](./docs/OASF.md) - Skills & domains reference
- [AI Agent Skill](./skill.md) - SDK reference for AI agents (MCP/LLM)

## Community & Support

- **Telegram**: [t.me/sol8004](https://t.me/sol8004)
- **X (Twitter)**: [x.com/Quantu_AI](https://x.com/Quantu_AI)
- **8004 Standard**: [eips.ethereum.org/EIPS/eip-8004](https://eips.ethereum.org/EIPS/eip-8004)

## License

MIT
