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

## Network Defaults

- `devnet`: fully configured by default.
- `localnet`: prepared, requires your deployed `programIds`.
- `mainnet-beta`: cluster/RPC switch is ready; pass `programIds` to switch off devnet defaults.
- See the [Indexer](#indexer) section for the combined network + indexer config snippet.

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

// 1. Create complete collection metadata + upload (off-chain)
const collectionInput = {
  name: 'CasterCorp Agents',
  symbol: 'CAST',
  description: 'Main collection for CasterCorp agents',
  image: 'ipfs://QmCollectionImage...',
  banner_image: 'ipfs://QmCollectionBanner...',
  socials: {
    website: 'https://castercorp.ai',
    x: 'https://x.com/castercorp',
    discord: 'https://discord.gg/castercorp',
  },
};
const collection = await sdk.createCollection(collectionInput);

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

// 3. Upload and register (ATOM is off by default; pass atomEnabled: true to opt in now)
const metadataUri = `ipfs://${await ipfs.addJson(agentMeta)}`;
const agent = await sdk.registerAgent(metadataUri, undefined, { collectionPointer: collection.pointer! });
console.log('Agent:', agent.asset.toBase58());

// 4. Set operational wallet
const opWallet = Keypair.generate();
await sdk.setAgentWallet(agent.asset, opWallet);

// 5. Give feedback - accepts decimal strings or raw values
await sdk.giveFeedback(agent.asset, {
  value: '99.77',                  // Decimal string -> auto-encoded to 9977, decimals=2
  tag1: Tag.uptime,                // 8004 standardized tag (or free text)
  tag2: Tag.day,                   // Time period
  feedbackUri: 'ipfs://QmFeedback...',
});

// 6. Check reputation
const summary = await sdk.getSummary(agent.asset);
console.log(`Score: ${summary.averageScore}, Feedbacks: ${summary.totalFeedbacks}`);
```

### Create Collection (CID-first flow)

```typescript
const collectionInput = {
  name: 'My Collection',
  symbol: 'MYCOL',
  description: 'Collection metadata stored on IPFS',
  image: 'ipfs://QmCollectionImage...',
  banner_image: 'ipfs://QmCollectionBanner...',
  socials: {
    website: 'https://example.com',
    x: 'https://x.com/example',
    discord: 'https://discord.gg/example',
  },
};
const collectionUpload = await sdk.createCollection(collectionInput);

// Returned by createCollection()
const cid = collectionUpload.cid;          // e.g. Qm...
const uri = collectionUpload.uri;          // ipfs://Qm...
const pointer = collectionUpload.pointer;  // c1:b...

// Use `cid` / `uri` in your asset creation pipeline.
```

Collection and parent association rules are documented in [`docs/COLLECTION.md`](./docs/COLLECTION.md).  
Advanced end-to-end usage is shown in [`examples/collection-flow.ts`](examples/collection-flow.ts).

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

### Network + Program Configuration

- `cluster: 'devnet'` uses built-in devnet IDs:
  - Agent Registry: `8oo4J9tBB3Hna1jRQ3rWvJjojqM5DYTDJo5cejUuJy3C`
  - ATOM Engine: `AToMufS4QD6hEXvcvBDg9m1AHeCLpmZQsyfYa5h9MwAF`
- `cluster: 'localnet'` is supported; set your deployed `programIds`.
- `cluster: 'mainnet-beta'` is supported and RPC-ready; provide mainnet `programIds` to complete the switch.
- If `cluster: 'mainnet-beta'` is set without `programIds`, SDK logs a warning and still uses devnet default program IDs.

```typescript
// Localnet/Mainnet custom config + indexer endpoint
const sdk = new SolanaSDK({
  cluster: 'localnet', // or 'mainnet-beta'
  rpcUrl: 'http://127.0.0.1:8899',
  signer,
  programIds: {
    agentRegistry: 'YourRegistryProgramId',
    atomEngine: 'YourAtomProgramId',
    // mplCore is optional (defaults to canonical Metaplex Core ID)
  },
  indexerGraphqlUrl: 'http://127.0.0.1:3000/v2/graphql',
});

// Custom GraphQL indexer (recommended)
const sdk = new SolanaSDK({
  cluster: 'devnet',
  indexerGraphqlUrl: 'https://your-indexer.example.com/v2/graphql',
});

// Legacy REST v1 (deprecated but supported for now)
const sdk = new SolanaSDK({
  cluster: 'devnet',
  indexerUrl: 'https://your-indexer.example.com/rest/v1',
  // optional: only if your endpoint requires auth
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
- `INDEXER_URL`: override REST v1 endpoint (legacy mode)
- `INDEXER_API_KEY`: optional auth token for REST v1 if required by your endpoint

Read by backend sequence id:

```typescript
// GraphQL: sequence id (Agent.agentId / legacy agentid)
const indexed = await sdk.getAgentByAgentId(42);

// REST: sequence id (`agent_id`)
const indexedRest = await sdk.getAgentByAgentId(42);

// Backward-compatible alias (same backend-specific semantics)
const indexedLegacy = await sdk.getAgentByIndexerId(42);
```

`getAgentByAgentId()` semantics depend on backend:
- REST (`indexerUrl`): uses numeric `agent_id`
- GraphQL (`indexerGraphqlUrl`): uses sequence id fields (`agentId`, with legacy fallback `agentid`)

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

### Revoke Workflows

`revokeFeedback()` now does indexer preflight by default:
- Uses signer (or `options.signer`) as the feedback client.
- Refuses revoke when feedback is missing for that client or already revoked.
- Auto-resolves `sealHash` when omitted; if provided, it must match indexed `sealHash`.

```typescript
await sdk.revokeFeedback(agent.asset, 12n); // preflight + auto sealHash

await sdk.revokeFeedback(agent.asset, 12n, sealHash, {
  verifyFeedbackClient: false, // intentionally skip ownership preflight
  waitForIndexerSync: false,   // skip indexer sync wait
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

By default, `registerAgent()` does **not** initialize ATOM stats (`atomEnabled: false`). ATOM provides:

- **Trust Tiers**: Bronze → Silver → Gold → Platinum
- **Quality Score**: Weighted average with decay
- **Sybil Detection**: HyperLogLog client tracking

```typescript
// Enable ATOM during registration
await sdk.registerAgent('ipfs://...', undefined, { atomEnabled: true });
```

Or enable later after registration:

```typescript
await sdk.enableAtom(asset);
await sdk.initializeAtomStats(asset);
```

`enableAtom()` is one-way/irreversible for that agent (cannot be disabled later).

SEAL helper methods and examples are documented in [`docs/METHODS.md#seal-v1-methods`](./docs/METHODS.md#seal-v1-methods).

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
| [`collection-flow.ts`](examples/collection-flow.ts) | Full collection metadata + create 20 associated agent assets |
| [`feedback-usage.ts`](examples/feedback-usage.ts) | Submit and read feedback |
| [`agent-update.ts`](examples/agent-update.ts) | On-chain metadata & URI update |
| [`transfer-agent.ts`](examples/transfer-agent.ts) | Transfer agent ownership (also possible via standard token wallet transfer) |
| [`server-mode.ts`](examples/server-mode.ts) | Server/client architecture with skipSend |

## Documentation

- [API Reference](./docs/METHODS.md) - All methods with examples
- [Feedback Guide](./docs/FEEDBACK.md) - Tags, value/decimals, advanced patterns
- [Collection Guide](./docs/COLLECTION.md) - Collection pointer and parent association rules
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
