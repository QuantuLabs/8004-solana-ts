# 8004-solana-ts

> TypeScript SDK for ERC-8004 on Solana
> Agent identity, reputation and discovery standard

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-QuantumAgentic%2F8004--solana--ts-blue)](https://github.com/QuantumAgentic/8004-solana-ts)

> ⚠️ **Alpha Release** - Not yet published to npm. Install from GitHub.

---

## 🚀 About

**8004-solana-ts** is a TypeScript SDK implementing the [ERC-8004 standard](https://eips.ethereum.org/EIPS/eip-8004) on Solana. It provides a seamless way to:

- ✅ **Register agents as NFTs** on Solana blockchain
- ✅ **Manage agent metadata** and endpoints (MCP, A2A)
- ✅ **Submit and query reputation feedback**
- ✅ **Track agent ownership** and transfers
- ✅ **OASF taxonomies** support (skills & domains)

Built with compatibility in mind - API inspired by the reference [agent0 SDK](https://github.com/agent0lab/agent0-ts).

---

## 📦 Installation

### Install from GitHub (recommended for now)

```bash
npm install github:QuantumAgentic/8004-solana-ts
# or
yarn add github:QuantumAgentic/8004-solana-ts
# or
pnpm add github:QuantumAgentic/8004-solana-ts
```

### Or clone and link locally

```bash
git clone https://github.com/QuantumAgentic/8004-solana-ts.git
cd 8004-solana-ts
npm install
npm run build
npm link

# In your project
npm link 8004-solana-ts
```

---

## 🔧 Quick Start

```typescript
import { SDK } from '8004-solana-ts';
import { Keypair, Connection } from '@solana/web3.js';

// Initialize SDK
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const payer = Keypair.fromSecretKey(...); // Your wallet

const sdk = new SDK({
  cluster: 'devnet',
  connection,
  signer: payer
});

// Create and register an agent
const agent = sdk.createAgent('My AI Agent', 'Helpful AI assistant');

// Configure endpoints
agent.setMCP('https://my-mcp-endpoint.com');
agent.addSkill('natural-language-processing');
agent.addDomain('customer-support');

// Register on-chain
const registration = await agent.registerIPFS();
console.log(`✅ Agent registered: ${registration.agentId}`);

// Give feedback
const feedback = sdk.prepareFeedback(
  registration.agentId,
  85,  // score 0-100
  ['helpful', 'accurate'],
  'Great agent, very responsive!'
);

await sdk.giveFeedback(registration.agentId, feedback);
console.log('✅ Feedback submitted');

// Query reputation
const reputation = await sdk.getReputationSummary(registration.agentId);
console.log(`📊 Average score: ${reputation.averageScore}/100`);
console.log(`📊 Total feedbacks: ${reputation.count}`);
```

---

## 📚 Documentation

### Core Classes

#### SDK

Main entry point for the SDK.

```typescript
const sdk = new SDK({
  cluster: 'devnet' | 'testnet' | 'mainnet-beta',
  connection: Connection,
  signer: Keypair
});
```

**Methods:**
- `createAgent(name, description, image?)` - Create agent instance
- `loadAgent(agentId)` - Load existing agent from blockchain
- `getAgent(agentId)` - Get agent summary
- `giveFeedback(agentId, feedbackFile)` - Submit feedback
- `getReputationSummary(agentId)` - Get reputation statistics
- `transferAgent(agentId, newOwner)` - Transfer ownership

#### Agent

Represents an agent with configuration and metadata.

**Configuration Methods:**
- `setMCP(endpoint, version?)` - Set Model Context Protocol endpoint
- `setA2A(agentcard, version?)` - Set Agent-to-Agent card
- `setENS(name, version?)` - Set ENS name
- `setAgentWallet(address, chainId)` - Set agent wallet

**OASF Methods:**
- `addSkill(slug)` - Add OASF skill taxonomy
- `addDomain(slug)` - Add OASF domain taxonomy
- `removeSkill(slug)` - Remove skill
- `removeDomain(slug)` - Remove domain

**Metadata Methods:**
- `setMetadata(kv)` - Set custom metadata key-value pairs
- `setTrust(reputation?, cryptoEconomic?, teeAttestation?)` - Set trust models
- `setActive(active)` - Set agent active status

**Registration Methods:**
- `registerIPFS()` - Register agent with IPFS storage
- `registerHTTP(uri)` - Register agent with HTTP URI
- `transfer(newOwner)` - Transfer agent ownership

---

## 🏗️ Architecture

Built on Solana programs implementing ERC-8004:

- **Identity Registry**: Agent registration, metadata, and NFT management
- **Reputation Registry**: Feedback submission and reputation tracking
- **Validation Registry**: Trust validation mechanisms *(coming soon)*

Programs are deployed on Solana devnet and mainnet.

---

## 🧪 Development

```bash
# Clone repository
git clone https://github.com/QuantumAgentic/8004-solana-ts.git
cd 8004-solana-ts

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint

# Format
npm run format
```

---

## 🚧 Current Status

### v0.1.0 - Initial Public Build

**✅ Implemented:**
- ✅ Agent registration (IPFS + HTTP)
- ✅ Metadata management
- ✅ Feedback system
- ✅ Reputation tracking
- ✅ OASF taxonomies support
- ✅ NFT-based agent identity
- ✅ Metaplex integration

**⚠️ Not Yet Implemented (v0.1.0):**
- Search functionality (requires external indexer like Helius/QuickNode)
- Validation registry
- Advanced querying

---

## 🤝 Contributing

Contributions welcome! This is a **public build** project - we're building in the open.

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

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🔗 Links

- **ERC-8004 Standard**: [eips.ethereum.org/EIPS/eip-8004](https://eips.ethereum.org/EIPS/eip-8004)
- **Agent0 Reference SDK**: [github.com/agent0lab/agent0-ts](https://github.com/agent0lab/agent0-ts)
- **Solana Programs**: [github.com/QuantumAgentic/8004-solana](https://github.com/QuantumAgentic/8004-solana) *(coming soon)*
- **Documentation**: [Full docs coming soon]

---

## 💬 Community

- **GitHub Issues**: [Report bugs and request features](https://github.com/QuantumAgentic/8004-solana-ts/issues)
- **Discussions**: [Ask questions and share ideas](https://github.com/QuantumAgentic/8004-solana-ts/discussions)

---

## 🙏 Acknowledgments

- Built with inspiration from the [agent0](https://github.com/agent0lab/agent0-ts) ecosystem
- Implements [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) standard on Solana
- Powered by Solana blockchain and Metaplex NFT standard

---

**Built with ❤️ for the Solana ecosystem**

*Building in public - Follow our progress!*
