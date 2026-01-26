# 8004-solana

[![npm](https://img.shields.io/npm/v/8004-solana)](https://www.npmjs.com/package/8004-solana)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-QuantuLabs%2F8004--solana--ts-blue)](https://github.com/QuantuLabs/8004-solana-ts)

TypeScript SDK for ERC-8004 Agent Registry on Solana.

- **Register agents as NFTs** on Solana blockchain
- **Manage agent metadata** and endpoints (MCP, A2A)
- **Submit and query reputation feedback**
- **Sign & verify** with agent operational wallets
- **OASF taxonomies** support (skills & domains)

## Installation

```bash
npm install 8004-solana
```

## Program IDs (Devnet)

- **Agent Registry**: `6MuHv4dY4p9E4hSCEPr9dgbCSpMhq8x1vrUexbMVjfw1`
- **ATOM Engine**: `6Mu7qj6tRDrqchxJJPjr9V1H2XQjCerVKixFEEMwC1Tf`

## Quick Start

```typescript
import { SolanaSDK } from '8004-solana';
import { Keypair } from '@solana/web3.js';

const signer = Keypair.fromSecretKey(/* your key */);
const sdk = new SolanaSDK({ cluster: 'devnet', signer });

// 1. Build collection metadata
import { buildCollectionMetadataJson, IPFSClient } from '8004-solana';

const ipfs = new IPFSClient({ pinataEnabled: true, pinataJwt: process.env.PINATA_JWT });

const collectionMeta = buildCollectionMetadataJson({
  name: 'My AI Agents',
  description: 'Production agents for automation',
  image: 'ipfs://QmLogo...',
  category: 'automation',
  tags: ['enterprise', 'api'],
  project: {
    name: 'Acme Corp',
    socials: { website: 'https://acme.ai', x: 'acme_ai' }
  }
});

// Upload to IPFS and create collection
const collectionUri = `ipfs://${await ipfs.addJson(collectionMeta)}`;
const collection = await sdk.createCollection(collectionMeta.name, collectionUri);
console.log('Collection:', collection.collection.toBase58());

// 2. Build agent metadata
import { buildRegistrationFileJson, EndpointType } from '8004-solana';

const agentMeta = buildRegistrationFileJson({
  name: 'My AI Agent',
  description: 'Autonomous agent for task automation',
  image: 'ipfs://QmAgentAvatar...',
  endpoints: [
    { type: EndpointType.MCP, value: 'https://api.example.com/mcp' },
    { type: EndpointType.A2A, value: 'https://api.example.com/a2a' },
  ],
  skills: ['natural_language_processing/text_generation/text_generation'],
  domains: ['technology/software_engineering/software_engineering'],
});

// Note: `_uri:` keys are reserved for indexer-derived metadata and ignored on-chain.
// Upload and register
const agentUri = `ipfs://${await ipfs.addJson(agentMeta)}`;
const agent = await sdk.registerAgent(agentUri, collection.collection);
console.log('Agent:', agent.asset.toBase58());

// 3. Set operational wallet
const opWallet = Keypair.generate();
await sdk.setAgentWallet(agent.asset, opWallet);

// 4. Give feedback
await sdk.giveFeedback(agent.asset, {
  score: 85,                       // 0-100, optional (null = inferred from tag)
  value: 15000n,                   // i64: raw metric (e.g., profit in cents)
  valueDecimals: 2,                // 0-6: decimal precision
  tag1: 'revenues',                // ERC-8004 standard tag
  feedbackUri: 'ipfs://QmFeedback...',
});

// 5. Check reputation
const summary = await sdk.getSummary(agent.asset);
console.log(`Score: ${summary.averageScore}, Feedbacks: ${summary.totalFeedbacks}`);
```

### Web3 Wallet (Phantom, Solflare)

```typescript
// For setAgentWallet with browser wallets
const prepared = sdk.prepareSetAgentWallet(agent.asset, walletPubkey);
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
const isValid = await sdk.verify(signed, agent.asset, opWallet.publicKey);
```

### Liveness Check

```typescript
// Ping agent endpoints
const report = await sdk.isItAlive(agent.asset);
console.log(report.status); // 'alive' | 'partial' | 'dead'
console.log(report.liveEndpoints, report.deadEndpoints);
```

### Read-Only Mode

```typescript
const sdk = new SolanaSDK({ cluster: 'devnet' }); // No signer = read-only

const agent = await sdk.loadAgent(assetPubkey);
const summary = await sdk.getSummary(assetPubkey);
```

## Feedback System

The feedback system supports rich metrics with ERC-8004 standardized tags:

```typescript
// Basic feedback with score
await sdk.giveFeedback(agent.asset, { score: 85, tag1: 'starred' });

// Revenue tracking
await sdk.giveFeedback(agent.asset, {
  score: 90,
  value: 15000n,        // $150.00
  valueDecimals: 2,
  tag1: 'revenues',
  tag2: 'week',
});

// Uptime tracking (auto-normalized to score)
await sdk.giveFeedback(agent.asset, {
  score: null,          // Auto: 99.5% → score 100
  value: 9950n,         // 99.50%
  valueDecimals: 2,
  tag1: 'uptime',
});
```

See [FEEDBACK.md](./docs/FEEDBACK.md) for all ERC-8004 tags and patterns.

## ATOM Engine

The SDK auto-initializes ATOM stats on registration (atomEnabled: true by default). ATOM provides:

- **Trust Tiers**: Bronze → Silver → Gold → Platinum
- **Quality Score**: Weighted average with decay
- **Sybil Detection**: HyperLogLog client tracking

```typescript
// Disable ATOM at creation (if you aggregate reputation via indexer)
await sdk.registerAgent('ipfs://...', collection, { atomEnabled: false });
```

If you opt out at creation, you can later enable ATOM (one-way) and initialize stats:

```typescript
await sdk.enableAtom(asset);
await sdk.initializeAtomStats(asset);
```

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

## Documentation

- [API Reference](./docs/METHODS.md) - All methods with examples
- [Feedback Guide](./docs/FEEDBACK.md) - Tags, value/decimals, advanced patterns
- [Quickstart](./docs/QUICKSTART.md) - Step-by-step guide
- [Costs](./docs/COSTS.md) - Transaction costs
- [OASF Taxonomies](./docs/OASF.md) - Skills & domains reference

## Community & Support

- **Telegram**: [t.me/sol8004](https://t.me/sol8004)
- **X (Twitter)**: [x.com/Quantu_AI](https://x.com/Quantu_AI)
- **8004 Standard**: [eips.ethereum.org/EIPS/eip-8004](https://eips.ethereum.org/EIPS/eip-8004)

## License

MIT
