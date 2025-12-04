# 8004-solana-ts

> TypeScript SDK for ERC-8004 on Solana
> Agent identity, reputation and validation standard

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-QuantuLabs%2F8004--solana--ts-blue)](https://github.com/QuantuLabs/8004-solana-ts)
[![Solana Programs](https://img.shields.io/badge/Programs-8004--solana-purple)](https://github.com/QuantuLabs/8004-solana)
[![Version](https://img.shields.io/badge/version-0.2.0-green)](https://github.com/QuantuLabs/8004-solana-ts)

> **v0.2.0** - Consolidated program architecture with Metaplex Core

---

## About

**8004-solana-ts** is a TypeScript SDK implementing the [ERC-8004 standard](https://eips.ethereum.org/EIPS/eip-8004) on Solana. It provides a seamless way to:

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
npm link 8004-solana-ts
```

---

## Quick Start

```typescript
import { SolanaSDK } from '8004-solana-ts';
import { Keypair } from '@solana/web3.js';

// Create SDK (devnet by default, no signer = read-only)
const sdk = new SolanaSDK();

// Load an existing agent
const agent = await sdk.loadAgent(13);
console.log('Agent:', agent?.name);

// Get reputation summary
const summary = await sdk.getReputationSummary(13);
console.log(`Average score: ${summary.averageScore}`);
console.log(`Total feedbacks: ${summary.count}`);

// For write operations, provide a signer
const signer = Keypair.fromSecretKey(/* your keypair */);
const writeSdk = new SolanaSDK({ signer });

// Submit feedback (requires signer)
await writeSdk.giveFeedback(13, {
  score: 85,
  tag1: 'helpful',
  tag2: 'accurate',
  fileUri: 'ipfs://QmFeedbackHash',
  fileHash: Buffer.alloc(32),
});
```

> **Note**: For advanced queries like `getAgentsByOwner()`, a custom RPC provider is recommended.
> Free tiers are available - see [RPC Provider Recommendations](#rpc-provider-recommendations).

---

## SolanaSDK API Reference

### Constructor

```typescript
import { SolanaSDK } from '8004-solana-ts';
import { Keypair } from '@solana/web3.js';

// Default: devnet, read-only
const sdk = new SolanaSDK();

// With signer (for write operations)
const sdk = new SolanaSDK({ signer: Keypair.generate() });

// Custom RPC (for advanced queries)
const sdk = new SolanaSDK({ rpcUrl: 'https://your-rpc.helius.dev' });

// Full config
const sdk = new SolanaSDK({
  cluster: 'devnet',      // 'devnet' | 'mainnet-beta' (default: 'devnet')
  rpcUrl: 'https://...',  // Optional custom RPC
  signer: keypair,        // Optional signer for write operations
});
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
| `setMetadata` | `(agentId, key, value, immutable?) => Promise<TransactionResult>` | Set metadata (v0.2.0: PDA-based) |

**Immutable Metadata (v0.2.0):**
```typescript
// Set mutable metadata (default)
await sdk.setMetadata(agentId, 'version', '1.0.0');

// Set immutable metadata (cannot be modified or deleted)
await sdk.setMetadata(agentId, 'certification', 'verified', true);
```

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

Built on a consolidated Solana program implementing ERC-8004:

| Program | Program ID | Description |
|---------|------------|-------------|
| **AgentRegistry8004** | `3ah8M3viTAGHRkAqGshRF4b48Ey1ZwrMViQ6bkUNamTi` | Identity, Reputation & Validation (consolidated) |

**v0.2.0 Changes:**
- Single consolidated program (was 3 separate programs)
- Uses **Metaplex Core** for NFTs (was Token Metadata)
- Global feedback index (was per-client)
- 89 tests passing on devnet

---

## RPC Provider Recommendations

The default Solana devnet RPC works for basic operations but has rate limits.
For **production use** or **advanced queries** (like `getProgramAccounts`), use a custom RPC provider.

**Good news**: Free tiers are sufficient for most use cases!

| Provider | Free Tier | Features | Signup |
|----------|-----------|----------|--------|
| **Helius** | 100k req/month | Full devnet support, getProgramAccounts | https://helius.dev |
| **QuickNode** | 10M credits/month | Multi-chain support | https://quicknode.com |
| **Alchemy** | 300M CU/month | WebSockets, enhanced APIs | https://alchemy.com |
| **Triton** | Free tier available | Solana-focused | https://triton.one |

### When do you need a custom RPC?

| Operation | Default RPC | Custom RPC |
|-----------|-------------|------------|
| `loadAgent()` | Works | Works |
| `giveFeedback()` | Works | Works |
| `getSummary()` | Works | Works |
| `getAgentsByOwner()` | **Fails** | Works |
| `readAllFeedback()` | **Fails** | Works |
| `getClients()` | **Fails** | Works |

**Recommendation**: Start with default RPC. Switch to Helius free tier when you need advanced queries.

```typescript
const sdk = new SolanaSDK({
  rpcUrl: 'https://your-helius-rpc.helius.dev',
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

### v0.2.0 - Consolidated Program Architecture

**What's New:**
- Single consolidated program (Identity + Reputation + Validation)
- **Metaplex Core** NFTs (lighter, faster than Token Metadata)
- Global feedback index for simpler PDA derivation
- 89 comprehensive tests on devnet

**Breaking Changes from v0.1.0:**
- Program IDs changed (now single program)
- Agent PDA uses Core asset address, not mint
- Feedback PDA uses global index (no client address in seeds)
- Response PDA removed client from seeds

**Implemented:**
- Agent registration with Metaplex Core
- Metadata management + extensions
- Permissionless feedback system
- Reputation tracking with cached aggregates
- Validation requests and responses
- NFT-based agent identity
- Interface parity with agent0-ts

**Requires Custom RPC:**
- `getAgentsByOwner()` - Requires getProgramAccounts
- `readAllFeedback()` - Requires getProgramAccounts
- `getClients()` - Requires getProgramAccounts

---

## Operation Costs (Devnet Measured v0.2.0)

Costs measured via SDK E2E tests on Solana devnet:

| Operation | Total Cost | Lamports | Notes |
|-----------|------------|----------|-------|
| Register Agent | **0.00651 SOL** | 6,507,280 | Core asset + AgentAccount |
| Set Metadata (1st) | **0.00319 SOL** | 3,192,680 | +MetadataEntryPda |
| Set Metadata (update) | 0.000005 SOL | 5,000 | TX fee only |
| Give Feedback (1st) | 0.00332 SOL | 3,324,920 | Feedback + AgentReputation init |
| Give Feedback (2nd+) | 0.00209 SOL | 2,086,040 | FeedbackAccount only |
| Append Response (1st) | 0.00275 SOL | 2,747,240 | Response + ResponseIndex init |
| Append Response (2nd+) | 0.00163 SOL | 1,626,680 | ResponseAccount only |
| Revoke Feedback | 0.000005 SOL | 5,000 | TX fee only |
| Request Validation | 0.00183 SOL | 1,828,520 | ValidationRequest |
| Respond to Validation | 0.000005 SOL | 5,000 | TX fee only |
| **Full Lifecycle** | **0.0245 SOL** | 24,521,040 | Complete test cycle |

### First vs Subsequent Cost Savings

| Operation | 1st Call | 2nd+ Calls | Savings |
|-----------|----------|------------|---------|
| Set Metadata | 0.00319 SOL | 0.000005 SOL | **-99%** |
| Give Feedback | 0.00332 SOL | 0.00209 SOL | **-37%** |
| Append Response | 0.00275 SOL | 0.00163 SOL | **-41%** |

First operation creates init_if_needed accounts. Subsequent calls skip initialization.

### v0.2.0 Optimizations

| Optimization | Before | After | Savings |
|--------------|--------|-------|---------|
| FeedbackAccount | 375 bytes | 171 bytes | **-54%** |
| ResponseAccount | 309 bytes | 105 bytes | **-66%** |
| MetadataEntryPda | Vec (fixed) | Individual PDAs | Unlimited entries |

**v0.2.0 Changes:**
- **Hash-only storage**: URIs stored in events, only hashes on-chain
- **Individual Metadata PDAs**: Unlimited entries, deletable for rent recovery
- **Immutable metadata option**: Lock metadata permanently

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

## Examples

See the `examples/` directory for complete usage examples:

| Example | Description |
|---------|-------------|
| [`quick-start.ts`](examples/quick-start.ts) | Basic read/write operations |
| [`feedback-usage.ts`](examples/feedback-usage.ts) | Submit and read feedback |
| [`agent-update.ts`](examples/agent-update.ts) | Update agent metadata |
| [`transfer-agent.ts`](examples/transfer-agent.ts) | Transfer agent ownership |
| [`server-mode.ts`](examples/server-mode.ts) | Server/client architecture with skipSend |

Run examples:
```bash
# Set your private key (JSON array format)
export SOLANA_PRIVATE_KEY='[1,2,3,...]'

# Run example
npx tsx examples/quick-start.ts
```

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
- Powered by Solana blockchain and Metaplex Core

---

**Built for the Solana ecosystem** | v0.2.0
