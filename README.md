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

**Step 1: Setup IPFS Client**

The SDK includes a built-in IPFS client with Pinata support:

```typescript
import {
  SolanaSDK,
  IPFSClient,
  buildRegistrationFileJson,
  EndpointType
} from '8004-solana';

// Get a free Pinata JWT at https://pinata.cloud
const ipfs = new IPFSClient({
  pinataEnabled: true,
  pinataJwt: process.env.PINATA_JWT,
});

// Or use a local IPFS node
// const ipfs = new IPFSClient({ url: 'http://localhost:5001' });
```

**Step 2: Upload Agent Image**

```typescript
// Upload image file to IPFS
const imageCid = await ipfs.addFile('./agent-avatar.png');
const imageUri = `ipfs://${imageCid}`;
```

**Step 3: Build and Upload Metadata**

```typescript
const agentData = {
  name: 'My AI Assistant',
  description: 'A helpful AI agent for task automation',
  image: imageUri, // IPFS image from step 2
  endpoints: [
    { type: EndpointType.MCP, value: 'https://api.example.com/mcp' },
    { type: EndpointType.A2A, value: 'https://api.example.com/a2a' },
  ],
  // OASF taxonomies (optional) - see docs/OASF.md for valid slugs
  skills: ['natural_language_processing/natural_language_generation/summarization'],
  domains: ['technology/software_engineering/software_engineering'],
};

// Build 8004-compliant JSON and upload to IPFS
const metadata = buildRegistrationFileJson(agentData);
const metadataCid = await ipfs.addJson(metadata);
const metadataUri = `ipfs://${metadataCid}`;
```

**Step 4: Register on Solana**

```typescript
const sdk = new SolanaSDK({ signer });
const result = await sdk.registerAgent(metadataUri);
console.log(`Agent #${result.agentId} registered!`);
```

**Alternative: Use Web URLs**

You can host metadata anywhere accessible via HTTP:

```typescript
// Build JSON without IPFS
const metadata = buildRegistrationFileJson({
  name: 'My AI Assistant',
  image: 'https://my-server.com/agent-avatar.png',
  // ...
});

// Host this JSON on your server, S3, Vercel, etc.
await sdk.registerAgent('https://my-server.com/agent-metadata.json');
```

### 3. Load Agent Data

```typescript
// Fetch agent by ID
const agent = await sdk.loadAgent(agentId);

if (agent) {
  console.log(`Name: ${agent.nft_name}`);
  console.log(`Owner: ${agent.getOwnerPublicKey().toBase58()}`);
  console.log(`URI: ${agent.agent_uri}`);
  console.log(`Asset: ${agent.getAssetPublicKey().toBase58()}`);
}

// Or fetch all agents owned by a wallet (requires custom RPC)
import { PublicKey } from '@solana/web3.js';

const ownerWallet = new PublicKey('YourWalletAddress...');
const myAgents = await sdk.getAgentsByOwner(ownerWallet);

for (const agent of myAgents) {
  console.log(`Agent #${agent.agent_id}: ${agent.nft_name}`);
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

### 6. Bulk Queries (Indexing)

```typescript
// Get ALL agents with their feedbacks in just 4 RPC calls
const agents = await sdk.getAllAgents({ includeFeedbacks: true });
for (const { account, feedbacks } of agents) {
  console.log(`Agent #${account.agent_id}: ${feedbacks?.length || 0} feedbacks`);
}

// Or get ALL feedbacks separately as a Map
const feedbacksMap = await sdk.getAllFeedbacks();
const agent83Feedbacks = feedbacksMap.get(83n) || [];
```

> **Note**: For advanced queries like `getAllAgents()`, `getAllFeedbacks()`, or `readAllFeedback()`, a custom RPC provider is required.
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
| `getAllFeedbacks()` | **Fails** | Works |
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
| [`quick-start.ts`](examples/quick-start.ts) | Basic read/write with IPFS upload |
| [`feedback-usage.ts`](examples/feedback-usage.ts) | Submit and read feedback |
| [`agent-update.ts`](examples/agent-update.ts) | On-chain metadata & URI update |
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
