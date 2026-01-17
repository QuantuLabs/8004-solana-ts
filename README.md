# 8004-solana

TypeScript SDK for ERC-8004 Agent Registry on Solana.

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

// 1. Create a collection (optional - or use base collection)
const collection = await sdk.createCollection('My AI Agents', 'ipfs://QmCollectionMeta...');
console.log('Collection:', collection.collection.toBase58());

// 2. Register agent in collection
const agent = await sdk.registerAgent('ipfs://QmAgentMeta...', collection.collection);
console.log('Agent:', agent.asset.toBase58());

// 3. Set operational wallet
const opWallet = Keypair.generate();
await sdk.setAgentWallet(agent.asset, opWallet);

// 4. Give feedback
await sdk.giveFeedback(agent.asset, {
  score: 85,
  feedbackUri: 'ipfs://QmFeedback...',
  feedbackHash: Buffer.alloc(32),
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
// Sign data with agent's operational wallet
const signed = sdk.sign(agent.asset, { action: 'ping', timestamp: Date.now() });

// Verify signature (checks agent wallet on-chain)
const isValid = await sdk.verify(signed, agent.asset);
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

## ATOM Engine

The SDK auto-initializes ATOM stats on registration. ATOM provides:

- **Trust Tiers**: Bronze → Silver → Gold → Platinum
- **Quality Score**: Weighted average with decay
- **Sybil Detection**: HyperLogLog client tracking

```typescript
// Skip ATOM (if you aggregate reputation via indexer)
await sdk.registerAgent('ipfs://...', collection, { skipAtomInit: true });
```

## Documentation

- [API Reference](./docs/METHODS.md) - All methods with examples
- [Quickstart](./docs/QUICKSTART.md) - Step-by-step guide
- [Costs](./docs/COSTS.md) - Transaction costs

## License

MIT
