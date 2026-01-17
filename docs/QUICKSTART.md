# Quick Start

Register your first AI agent on Solana in 5 minutes.

---

## 1. Install the SDK

```bash
npm install 8004-solana
```

Or use yarn/pnpm: `yarn add 8004-solana`

---

## 2. Setup Environment

Export your Solana wallet private key (devnet only for now):

```bash
export SOLANA_PRIVATE_KEY='[1,2,3,...,64]'  # JSON array format
export PINATA_JWT='your-jwt-token'          # Optional: for IPFS uploads
```

- [Phantom: Export Key](https://support.phantom.app/hc/en-us/articles/12988493966227-How-to-export-your-private-key)
- [Pinata: Get JWT](https://pinata.cloud)

---

## 3. Create & Register Agent

Create a new file `register.ts` and run with `npx tsx register.ts`:

```typescript
import { SolanaSDK, IPFSClient, buildRegistrationFileJson, EndpointType } from '8004-solana';
import { Keypair } from '@solana/web3.js';

// 1. Setup SDK with your wallet
const signer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.SOLANA_PRIVATE_KEY!))
);
const sdk = new SolanaSDK({ signer });

// 2. Setup IPFS client (for image & metadata upload)
const ipfs = new IPFSClient({
  pinataEnabled: true,
  pinataJwt: process.env.PINATA_JWT!,
});

// 3. Upload your agent's avatar image
const imageCid = await ipfs.addFile('./my-agent-avatar.png');
const imageUri = `ipfs://${imageCid}`;

// 4. Build your agent metadata with capabilities
const metadata = buildRegistrationFileJson({
  name: 'My AI Agent',
  description: 'An autonomous agent that does amazing things',
  image: imageUri,

  // Endpoints
  endpoints: [
    { type: EndpointType.MCP, value: 'https://my-api.com/mcp' },
    { type: EndpointType.A2A, value: 'https://my-api.com/a2a' },
  ],

  // Skills (OASF taxonomy)
  skills: [
    'natural_language_processing/text_generation/text_generation',
    'natural_language_processing/conversational_ai/conversational_ai',
  ],

  // Domains (OASF taxonomy)
  domains: [
    'technology/software_engineering/software_engineering',
  ],
});

// 5. Upload metadata to IPFS
const metadataCid = await ipfs.addJson(metadata);
const metadataUri = `ipfs://${metadataCid}`;

// 6. Register on Solana
const result = await sdk.registerAgent(metadataUri);

console.log('Asset:', result.asset.toBase58());
console.log('Transaction:', result.signature);
// Note: ATOM stats are automatically initialized (allows instant feedback)

// 7. (Optional) Store on-chain metadata
await sdk.setMetadata(result.asset, 'token', 'So11111111111111111111111111111111111111112', true); // immutable
```

See [OASF.md](./OASF.md) for the full list of available skills and domains.

**Note on ATOM (Reputation Engine):** By default, `registerAgent()` automatically initializes on-chain reputation tracking (ATOM) which costs ~0.002 SOL rent. This enables instant feedback and trust tier calculation. If you prefer to aggregate reputation yourself via the indexer, pass `{ skipAtomInit: true }` to skip ATOM initialization and save the rent cost. See [README](../README.md#55-atom-reputation-engine-optional) for details.

**Note on Metadata:** On-chain metadata (via `setMetadata`) is stored directly on Solana for quick access without IPFS fetching.

---

## 4. Verify Your Agent

Load your agent to confirm it was registered correctly:

```typescript
import { PublicKey } from '@solana/web3.js';

// Load agent by asset (no wallet needed for reading)
const readSdk = new SolanaSDK();
const agent = await readSdk.loadAgent(result.asset);

console.log('Name:', agent.nft_name);
console.log('Owner:', agent.getOwnerPublicKey().toBase58());
console.log('URI:', agent.agent_uri);
```

You can also view your agent on the explorer a few minutes after registration:

- [View on Explorer](https://x402synthex.xyz)

---

## What's Next?

- **Give Feedback:** `await sdk.giveFeedback(agentAsset, { score: 85, tag1: 'helpful', feedbackUri: 'ipfs://QmFeedback', feedbackHash: Buffer.alloc(32) })`
- **Check Reputation:** `await sdk.getSummary(agentAsset)`
- **Update URI:** `await sdk.setAgentUri(agentAsset, collection, 'ipfs://newCid')`

### Resources

- [Full API Reference](./METHODS.md)
- [Examples](https://github.com/QuantuLabs/8004-solana-ts/tree/main/examples)
- [Explorer](https://x402synthex.xyz)
- [Telegram](https://t.me/sol8004)
- [X / Twitter](https://x.com/Quantu_AI)
