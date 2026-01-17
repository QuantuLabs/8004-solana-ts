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

### Read-Only Mode

```typescript
import { SolanaSDK } from '8004-solana';
import { PublicKey } from '@solana/web3.js';

const sdk = new SolanaSDK({ cluster: 'devnet' });

// Load agent by asset pubkey
const asset = new PublicKey('YourAgentAssetPubkey...');
const agent = await sdk.loadAgent(asset);

// Get reputation summary
const summary = await sdk.getSummary(asset);
console.log(`Score: ${summary.averageScore}, Total: ${summary.totalFeedbacks}`);
```

### Read-Write Mode

```typescript
import { SolanaSDK } from '8004-solana';
import { Keypair } from '@solana/web3.js';

const signer = Keypair.fromSecretKey(/* your key */);
const sdk = new SolanaSDK({ cluster: 'devnet', signer });

// Register agent
const result = await sdk.registerAgent('ipfs://QmYourMetadata...');
console.log(`Asset: ${result.asset.toBase58()}`);

// Give feedback
await sdk.giveFeedback(result.asset, {
  score: 85,
  feedbackUri: 'ipfs://QmFeedbackDetails',
  feedbackHash: Buffer.alloc(32),
});

// Set operational wallet - Option 1: Keypair (simple)
const operationalWallet = Keypair.generate();
await sdk.setAgentWallet(result.asset, operationalWallet);

// Set operational wallet - Option 2: Web3 wallet (Phantom, etc.)
const prepared = sdk.prepareSetAgentWallet(result.asset, walletPubkey);
const signature = await wallet.signMessage(prepared.message);
await prepared.complete(signature);
```

### Custom RPC (for advanced queries)

```typescript
const sdk = new SolanaSDK({
  cluster: 'devnet',
  signer,
  rpcUrl: 'https://devnet.helius-rpc.com/?api-key=YOUR_KEY',
});

// Now supports getProgramAccounts-based queries
const agents = await sdk.getAgentsByOwner(signer.publicKey);
const allFeedback = await sdk.readAllFeedback(asset);
```

## Core Methods

### Agent Operations

| Method | Description |
|--------|-------------|
| `registerAgent(uri?, collection?)` | Register new agent, returns `{ asset, signature }` |
| `loadAgent(asset)` | Load agent account data |
| `agentExists(asset)` | Check if agent exists |
| `setAgentUri(asset, collection, uri)` | Update agent URI |
| `setMetadata(asset, key, value)` | Set on-chain metadata |
| `getMetadata(asset, key)` | Read metadata value |
| `setAgentWallet(asset, keypair)` | Set operational wallet (auto-signs) |
| `prepareSetAgentWallet(asset, pubkey)` | Prepare for web3 wallet (returns `{ message, complete }`) |

### Reputation

| Method | Description |
|--------|-------------|
| `giveFeedback(asset, data)` | Submit feedback (0-100 score) |
| `getSummary(asset)` | Get reputation summary |
| `readFeedback(asset, client, index)` | Read specific feedback |
| `readAllFeedback(asset)` | Read all feedbacks (requires advanced RPC) |
| `revokeFeedback(asset, index)` | Revoke own feedback |
| `appendResponse(asset, index, uri, hash)` | Agent responds to feedback |

### Signing & Verification

| Method | Description |
|--------|-------------|
| `sign(asset, data)` | Sign data with signer key |
| `verify(payload, asset, pubkey?)` | Verify signed payload |
| `isItAlive(asset)` | Check agent endpoint liveness |

### Validation

| Method | Description |
|--------|-------------|
| `requestValidation(asset, validator, nonce, uri, hash)` | Request validation |
| `respondToValidation(asset, nonce, response, uri, hash)` | Respond to request |
| `readValidation(asset, validator, nonce)` | Read validation state |

### Collections

| Method | Description |
|--------|-------------|
| `createCollection(name, uri)` | Create user-owned collection |
| `getCollection(collection)` | Get collection info |
| `getCollections()` | List all collections (requires advanced RPC) |
| `getCollectionAgents(collection)` | Get agents in a collection |

## ATOM Engine Integration

The SDK automatically initializes ATOM stats when registering agents. ATOM Engine provides:

- **Trust Tiers**: Bronze → Silver → Gold → Platinum (8-epoch vesting)
- **Quality Score**: Weighted average with decay
- **Sybil Detection**: HyperLogLog-based unique client tracking
- **Freeze Protection**: Dampened tier changes during inactivity

```typescript
// Register with ATOM (default)
await sdk.registerAgent('ipfs://...');

// Register without ATOM (must init manually later)
await sdk.registerAgent('ipfs://...', undefined, { skipAtomInit: true });

// Manual ATOM init
await sdk.initializeAtomStats(asset);
```

## Documentation

- [API Reference](./docs/METHODS.md) - Complete method documentation
- [Costs](./docs/COSTS.md) - Transaction costs breakdown
- [Quickstart](./docs/QUICKSTART.md) - Getting started guide

## License

MIT
