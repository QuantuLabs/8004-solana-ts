# 8004-solana

> TypeScript SDK for ERC-8004 on Solana
> Agent identity, reputation and validation standard

[![npm](https://img.shields.io/npm/v/8004-solana)](https://www.npmjs.com/package/8004-solana)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-QuantuLabs%2F8004--solana--ts-blue)](https://github.com/QuantuLabs/8004-solana-ts)
[![Solana Programs](https://img.shields.io/badge/Programs-8004--solana-purple)](https://github.com/QuantuLabs/8004-solana)

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

```bash
npm install 8004-solana
# or
yarn add 8004-solana
# or
pnpm add 8004-solana
```

### Or install from GitHub

```bash
npm install github:QuantuLabs/8004-solana-ts
```

---

## Quick Start

```typescript
import { SolanaSDK } from '8004-solana';
import { Keypair } from '@solana/web3.js';

// 1. Setup SDK with signer
const signer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.SOLANA_PRIVATE_KEY!)));
const sdk = new SolanaSDK({ signer });

// 2. Register a new agent
const registration = await sdk.registerAgent('ipfs://QmAgentMetadata');
const agentId = registration.agentId!;
console.log(`✓ Agent #${agentId} registered`);

// 3. Set on-chain metadata (optional)
await sdk.setMetadata(agentId, 'version', '1.0.0');
await sdk.setMetadata(agentId, 'certification', 'verified', true); // immutable
console.log('✓ On-chain metadata set');

// 4. Load agent data
const agent = await sdk.loadAgent(agentId);
console.log(`Agent: ${agent?.nft_name}, Owner: ${agent?.getOwnerPublicKey().toBase58()}`);

// 5. Give feedback (from another user)
await sdk.giveFeedback(agentId, {
  score: 85,
  tag1: 'helpful',
  tag2: 'accurate',
  fileUri: 'ipfs://QmFeedbackDetails',
  fileHash: Buffer.alloc(32),
});
console.log('✓ Feedback submitted');

// 6. Get reputation summary
const summary = await sdk.getReputationSummary(agentId);
console.log(`Score: ${summary.averageScore}/100 (${summary.count} reviews)`);

// 7. Transfer agent (optional)
// await sdk.transferAgent(agentId, newOwnerPublicKey);
```

> **Note**: For advanced queries like `getAgentsByOwner()`, a custom RPC provider is recommended.
> Free tiers are available - see [RPC Provider Recommendations](#rpc-provider-recommendations).

📁 **More examples**: See the [`examples/`](#examples) directory for complete usage patterns.

---

## Documentation

- **[API Methods](docs/METHODS.md)** - Full SDK API reference
- **[Operation Costs](docs/COSTS.md)** - Transaction costs measured on Solana devnet

---

## Architecture

Built on a consolidated Solana program implementing ERC-8004:

| Program | Program ID | Description |
|---------|------------|-------------|
| **AgentRegistry8004** | `HvF3JqhahcX7JfhbDRYYCJ7S3f6nJdrqu5yi9shyTREp` | Identity, Reputation & Validation (consolidated) |

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

**Built for the Solana ecosystem** | v0.2.1
