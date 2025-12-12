# 8004-solana

> TypeScript SDK for 8004 on Solana
> Agent identity, reputation and validation standard

[![npm](https://img.shields.io/npm/v/8004-solana)](https://www.npmjs.com/package/8004-solana)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-QuantuLabs%2F8004--solana-blue)](https://github.com/QuantuLabs/8004-solana)
[![Solana Programs](https://img.shields.io/badge/Programs-8004--solana-purple)](https://github.com/QuantuLabs/8004-solana)

---

## About

**8004-solana** is a TypeScript SDK implementing the [8004 standard](https://eips.ethereum.org/EIPS/eip-8004) on Solana. It provides a seamless way to:

- **Register agents as NFTs** on Solana blockchain
- **Manage agent metadata** and endpoints (MCP, A2A)
- **Submit and query reputation feedback**
- **Track agent ownership** and transfers
- **OASF taxonomies** support (skills & domains)

---

## Installation

```bash
npm install 8004-solana
# or
yarn add 8004-solana
# or
pnpm add 8004-solana
```

---

## Quick Start

### 1. Setup SDK

```typescript
import { SolanaSDK } from '8004-solana';
import { Keypair } from '@solana/web3.js';

// Load your wallet keypair from environment variable
// The private key should be a JSON array of bytes: [1,2,3,...]
const privateKey = JSON.parse(process.env.SOLANA_PRIVATE_KEY!);
const signer = Keypair.fromSecretKey(Uint8Array.from(privateKey));

// Initialize the SDK with your signer
// Default cluster is 'devnet', use { cluster: 'mainnet-beta' } for production
const sdk = new SolanaSDK({ signer });
```

### 2. Register an Agent

```typescript
import { buildRegistrationFileJson, EndpointType } from '8004-solana';
import type { RegistrationFile } from '8004-solana';

// Build 8004 agent metadata
const agent: RegistrationFile = {
  name: 'My AI Assistant',
  description: 'A helpful AI agent for task automation',
  image: 'ipfs://QmYourImageHash',
  endpoints: [
    { type: EndpointType.MCP, value: 'https://api.example.com/mcp' },
    { type: EndpointType.A2A, value: 'https://api.example.com/a2a' },
  ],
  // OASF taxonomies (optional) - see docs/OASF.md for valid slugs
  skills: ['natural_language_processing/summarization', 'analytical_skills/coding_skills/text_to_code'],
  domains: ['technology/software_engineering'],
};

// Convert to 8004 JSON (validates skills/domains)
const metadata = buildRegistrationFileJson(agent);

// Upload to IPFS (using your preferred provider)
const metadataUri = await uploadToIPFS(metadata); // "ipfs://Qm..."

// Register the agent on-chain
const result = await sdk.registerAgent(metadataUri);
console.log(`Agent #${result.agentId} registered: ${result.signature}`);
```

### 3. Load Agent Data

```typescript
// Fetch agent data from the blockchain
const agent = await sdk.loadAgent(agentId);

if (agent) {
  console.log(`Name: ${agent.nft_name}`);
  console.log(`Owner: ${agent.getOwnerPublicKey().toBase58()}`);
  console.log(`URI: ${agent.agent_uri}`);
  console.log(`Asset: ${agent.getAssetPublicKey().toBase58()}`);
}
```

### 4. Give Feedback

```typescript
// Submit feedback for an agent (as a client/user)
// Score is 0-100, tags are optional keywords
await sdk.giveFeedback(agentId, {
  score: 85,                              // Rating out of 100
  tag1: 'helpful',                        // Optional: first tag
  tag2: 'accurate',                       // Optional: second tag
  fileUri: 'ipfs://QmFeedbackDetails',    // Optional: detailed feedback file
  fileHash: Buffer.alloc(32),             // Optional: SHA256 hash of file
});
```

### 5. Get Reputation

```typescript
// Get aggregated reputation stats
const summary = await sdk.getSummary(agentId);
console.log(`Average Score: ${summary.averageScore}/100`);
console.log(`Total Feedbacks: ${summary.totalFeedbacks}`);
console.log(`Next Index: ${summary.nextFeedbackIndex}`);

// Read all individual feedbacks (requires custom RPC)
const feedbacks = await sdk.readAllFeedback(agentId);
for (const fb of feedbacks) {
  console.log(`Score: ${fb.score}, Client: ${fb.client.toBase58()}`);
}
```

> **Note**: For advanced queries like `getAgentsByOwner()` or `readAllFeedback()`, a custom RPC provider is recommended.
> Free tiers are available - see [RPC Provider Recommendations](#rpc-provider-recommendations).

---

## Documentation

- **[API Methods](docs/METHODS.md)** - Full SDK API reference
- **[Operation Costs](docs/COSTS.md)** - Transaction costs on Solana
- **[OASF Taxonomies](docs/OASF.md)** - Skills and domains reference
- **[Changelog](docs/CHANGELOG.md)** - Version history and breaking changes

**Program ID:** `HvF3JqhahcX7JfhbDRYYCJ7S3f6nJdrqu5yi9shyTREp`

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
| `getAllAgents()` | **Fails** | Works |
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
git clone https://github.com/QuantuLabs/8004-solana.git
cd 8004-solana

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
| [`agent-update.ts`](examples/agent-update.ts) | On-chain metadata & immutable entries |
| [`transfer-agent.ts`](examples/transfer-agent.ts) | Transfer agent ownership |
| [`server-mode.ts`](examples/server-mode.ts) | Server/client architecture with skipSend |
| [`basic-indexer.ts`](examples/basic-indexer.ts) | Index all agents to JSON file |

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

- **8004 Standard**: [eips.ethereum.org/EIPS/eip-8004](https://eips.ethereum.org/EIPS/eip-8004)
- **Solana Programs**: [github.com/QuantuLabs/8004-solana](https://github.com/QuantuLabs/8004-solana)

---

## Acknowledgments

- Implements [8004](https://eips.ethereum.org/EIPS/eip-8004) standard on Solana
- Powered by Solana blockchain and Metaplex Core

---

**Built for the Solana ecosystem** | v0.2.1
