# agent0-ts-solana

> TypeScript SDK for ERC-8004 on Solana
> Agent identity, reputation and discovery standard

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-QuantuLabs%2F8004--solana--ts-blue)](https://github.com/QuantuLabs/8004-solana-ts)
[![Solana Programs](https://img.shields.io/badge/Programs-8004--solana-purple)](https://github.com/QuantuLabs/8004-solana)

> **Alpha Release** - Not yet published to npm. Install from GitHub.

---

## About

**agent0-ts-solana** is a TypeScript SDK implementing the [ERC-8004 standard](https://eips.ethereum.org/EIPS/eip-8004) on Solana. It provides a seamless way to:

- **Register agents as NFTs** on Solana blockchain
- **Manage agent metadata** and endpoints (MCP, A2A)
- **Submit and query reputation feedback**
- **Track agent ownership** and transfers
- **OASF taxonomies** support (skills & domains)

Built with compatibility in mind - API aligned with the reference [agent0-ts SDK](https://github.com/agent0lab/agent0-ts).

---

## Installation

### Install from GitHub

```bash
npm install github:QuantuLabs/8004-solana-ts
# or
yarn add github:QuantuLabs/8004-solana-ts
# or
pnpm add github:QuantuLabs/8004-solana-ts
```

### Or clone and link locally

```bash
git clone https://github.com/QuantuLabs/8004-solana-ts.git
cd 8004-solana-ts
npm install
npm run build
npm link

# In your project
npm link agent0-ts-solana
```

---

## Quick Start

```typescript
import { SolanaSDK, createDevnetSDK } from 'agent0-ts-solana';
import { Keypair } from '@solana/web3.js';

// Create read-only SDK (for queries)
const readOnlySDK = createDevnetSDK();

// Or create SDK with signer (for transactions)
const signer = Keypair.fromSecretKey(/* your keypair */);
const sdk = new SolanaSDK({
  rpcUrl: 'https://api.devnet.solana.com',
  signer,
});

// Load an existing agent
const agent = await sdk.loadAgent(13);
console.log('Agent:', agent?.name);

// Get reputation summary
const summary = await sdk.getReputationSummary(13);
console.log(`Average score: ${summary.averageScore}`);
console.log(`Total feedbacks: ${summary.count}`);

// Submit feedback (requires signer)
await sdk.giveFeedback(13, {
  score: 85,
  tag1: 'helpful',
  tag2: 'accurate',
  fileUri: 'ipfs://QmFeedbackHash',
  fileHash: Buffer.alloc(32),
});
```

---

## SolanaSDK API Reference

### Constructor

```typescript
import { SolanaSDK } from 'agent0-ts-solana';

// Read-only mode
const sdk = new SolanaSDK({ rpcUrl: 'https://api.devnet.solana.com' });

// With signer (for write operations)
const sdk = new SolanaSDK({
  rpcUrl: 'https://api.devnet.solana.com',
  signer: Keypair.generate(),
});

// Using cluster shorthand
const sdk = new SolanaSDK({ cluster: 'devnet' });
```

### Utility Methods

| Method | Return Type | Description |
|--------|-------------|-------------|
| `isReadOnly` | `boolean` | True if SDK has no signer |
| `canWrite` | `boolean` | True if SDK can perform write operations |
| `chainId()` | `Promise<string>` | Returns `solana-{cluster}` (e.g., `solana-devnet`) |
| `getCluster()` | `Cluster` | Returns current cluster name |
| `registries()` | `Record<string, string>` | Returns program IDs (`IDENTITY`, `REPUTATION`, `VALIDATION`) |
| `getProgramIds()` | `object` | Returns program IDs as PublicKey objects |
| `getRpcUrl()` | `string` | Returns current RPC URL |
| `supportsAdvancedQueries()` | `boolean` | True if RPC supports getProgramAccounts with memcmp |

### Agent Read Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `loadAgent` | `(agentId: number \| bigint) => Promise<AgentAccount \| null>` | Load agent data from chain |
| `getAgent` | `(agentId: number \| bigint) => Promise<AgentAccount \| null>` | Alias for loadAgent |
| `agentExists` | `(agentId: number \| bigint) => Promise<boolean>` | Check if agent exists |
| `getAgentOwner` | `(agentId: number \| bigint) => Promise<PublicKey \| null>` | Get agent owner |
| `isAgentOwner` | `(agentId, address) => Promise<boolean>` | Check if address owns agent |

### Agent Write Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `registerAgent` | `(tokenUri?, metadata?) => Promise<TransactionResult>` | Register new agent |
| `transferAgent` | `(agentId, newOwner) => Promise<TransactionResult>` | Transfer agent ownership |
| `setAgentUri` | `(agentId, newUri) => Promise<TransactionResult>` | Update agent URI |
| `setMetadata` | `(agentId, key, value) => Promise<TransactionResult>` | Set metadata extension |

### Reputation Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `getSummary` | `(agentId, minScore?, clientFilter?) => Promise<ReputationSummary>` | Get full reputation summary |
| `getReputationSummary` | `(agentId) => Promise<{count, averageScore}>` | Get simplified reputation stats |
| `giveFeedback` | `(agentId, feedbackFile) => Promise<TransactionResult>` | Submit feedback |
| `getFeedback` | `(agentId, client, index) => Promise<Feedback \| null>` | Read specific feedback |
| `readFeedback` | `(agentId, client, index) => Promise<Feedback \| null>` | Alias for getFeedback |
| `revokeFeedback` | `(agentId, index) => Promise<TransactionResult>` | Revoke submitted feedback |
| `getLastIndex` | `(agentId, client) => Promise<bigint>` | Get last feedback index |
| `appendResponse` | `(agentId, client, index, uri, hash) => Promise<TransactionResult>` | Add response to feedback |

### Validation Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `requestValidation` | `(agentId, validator, methodId, uri, hash) => Promise<TransactionResult>` | Request validation |
| `respondToValidation` | `(agentId, requestIndex, score, uri, hash, status) => Promise<TransactionResult>` | Respond to validation |

### Advanced Queries (Requires Custom RPC)

These methods require a custom RPC provider (Helius, Triton, etc.) that supports `getProgramAccounts`:

| Method | Signature | Description |
|--------|-----------|-------------|
| `getAgentsByOwner` | `(owner: PublicKey) => Promise<AgentAccount[]>` | Get all agents owned by address |
| `readAllFeedback` | `(agentId, includeRevoked?) => Promise<Feedback[]>` | Get all feedback for agent |
| `getClients` | `(agentId) => Promise<PublicKey[]>` | Get all clients who gave feedback |

---

## Architecture

Built on Solana programs implementing ERC-8004:

| Program | Program ID | Description |
|---------|------------|-------------|
| **Identity Registry** | `CAHKQ2amAyKGzPhSE1mJx5qgxn1nJoNToDaiU6Kmacss` | Agent registration, metadata, NFT management |
| **Reputation Registry** | `Ejb8DaxZCb9Yh4ZYHLFKG5dj46YFyRm4kZpGz2rz6Ajr` | Feedback submission, reputation tracking |
| **Validation Registry** | `2y87PVXuBoCTi9b6p44BJREVz14Te2pukQPSwqfPwhhw` | Trust validation mechanisms |

Programs are deployed on Solana devnet.

---

## RPC Provider Recommendations

The default Solana devnet RPC has limitations. For full functionality, use a custom RPC provider:

- **Helius** - https://helius.dev
- **Triton** - https://triton.one
- **QuickNode** - https://quicknode.com
- **Alchemy** - https://alchemy.com

```typescript
const sdk = new SolanaSDK({
  rpcUrl: 'https://your-custom-rpc.com',
  signer: yourKeypair,
});

// Now advanced queries work
const agents = await sdk.getAgentsByOwner(ownerPublicKey);
```

---

## Development

```bash
# Clone repository
git clone https://github.com/QuantuLabs/8004-solana-ts.git
cd 8004-solana-ts

# Install dependencies
npm install

# Build
npm run build

# Run tests
npx tsx test-sdk-full-coverage.ts

# Lint
npm run lint

# Format
npm run format
```

---

## Current Status

### v0.1.0 - Initial Public Build

**Implemented:**
- Agent registration (IPFS + HTTP)
- Metadata management
- Permissionless feedback system
- Reputation tracking
- OASF taxonomies support
- NFT-based agent identity
- Metaplex integration
- Interface parity with agent0-ts

**Requires Custom RPC:**
- `getAgentsByOwner()` - Requires getProgramAccounts
- `readAllFeedback()` - Requires getProgramAccounts
- `getClients()` - Requires getProgramAccounts

**Not Yet Implemented:**
- Search functionality (requires external indexer)

---

## Contributing

Contributions welcome! This is a **public build** project.

### How to Contribute

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'feat: add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Contribution Guidelines

- Follow existing code style
- Add tests for new features
- Update documentation
- Use conventional commits

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

## Links

- **ERC-8004 Standard**: [eips.ethereum.org/EIPS/eip-8004](https://eips.ethereum.org/EIPS/eip-8004)
- **agent0-ts Reference SDK**: [github.com/agent0lab/agent0-ts](https://github.com/agent0lab/agent0-ts)
- **Solana Programs**: [github.com/QuantuLabs/8004-solana](https://github.com/QuantuLabs/8004-solana)

---

## Acknowledgments

- Built with inspiration from the [agent0](https://github.com/agent0lab/agent0-ts) ecosystem
- Implements [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) standard on Solana
- Powered by Solana blockchain and Metaplex NFT standard

---

**Built for the Solana ecosystem**
