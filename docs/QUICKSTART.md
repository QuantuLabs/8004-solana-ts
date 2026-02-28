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
export PINATA_JWT='your-jwt-token'          # Optional: required only when pinataEnabled=true
```

- [Phantom: Export Key](https://support.phantom.app/hc/en-us/articles/12988493966227-How-to-export-your-private-key)
- [Pinata: Get JWT](https://pinata.cloud)

---

### Network + Indexer Config (optional)

- `cluster: 'devnet'` works out of the box.
- `cluster: 'localnet'` and `cluster: 'mainnet-beta'` are prepared.
- Mainnet program IDs are TBD, so override `programIds` for localnet/mainnet until IDs are published.

```typescript
const sdk = new SolanaSDK({
  cluster: 'localnet', // or 'mainnet-beta'
  rpcUrl: 'http://127.0.0.1:8899',
  signer,
  programIds: {
    agentRegistry: 'YourRegistryProgramId',
    atomEngine: 'YourAtomProgramId',
    // mplCore is optional (defaults to canonical Metaplex Core ID)
  },
  indexerGraphqlUrl: 'http://127.0.0.1:3000/v2/graphql',
});
```

---

## 3. Create Collection Metadata (CID-first)

Create a new file `register.ts` and run with `npx tsx register.ts`:

```typescript
import { SolanaSDK, IPFSClient, buildRegistrationFileJson, ServiceType } from '8004-solana';
import { Keypair } from '@solana/web3.js';

// 1. Setup SDK with your wallet
const signer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.SOLANA_PRIVATE_KEY!))
);
const pinataJwt = process.env.PINATA_JWT;
const ipfs = pinataJwt
  ? new IPFSClient({ pinataEnabled: true, pinataJwt })
  : new IPFSClient({ url: 'http://localhost:5001' });
const sdk = new SolanaSDK({ signer, ipfsClient: ipfs });

// 2. Build + upload collection metadata
const collectionInput = {
  name: 'CasterCorp Agents',
  symbol: 'CAST',
  description: 'Main collection metadata',
  image: 'ipfs://QmCollectionImage...',
  banner_image: 'ipfs://QmCollectionBanner...',
  socials: {
    website: 'https://castercorp.ai',
    x: 'https://x.com/castercorp',
    discord: 'https://discord.gg/castercorp',
  },
};
const collection = await sdk.createCollection(collectionInput);

console.log('Collection CID:', collection.cid);       // reuse for your asset workflow
console.log('Collection URI:', collection.uri);       // ipfs://<cid>
console.log('Collection Pointer:', collection.pointer); // c1:b...
```

If you only want the JSON (no upload), use:

```typescript
const fullMetadata = {
  name: 'CasterCorp Agents',
  symbol: 'CAST',
  description: 'Main collection metadata',
  image: 'ipfs://QmCollectionImage...',
  banner_image: 'ipfs://QmCollectionBanner...',
  socials: {
    website: 'https://castercorp.ai',
    x: 'https://x.com/castercorp',
    discord: 'https://discord.gg/castercorp',
  },
};
const data = sdk.createCollectionData(fullMetadata);
```

---

## 4. Create & Register Agent

```typescript
import { buildRegistrationFileJson, ServiceType } from '8004-solana';

// 3. Upload your agent's avatar image
const imageCid = await ipfs.addFile('./my-agent-avatar.png');
const imageUri = `ipfs://${imageCid}`;

// 4. Build your agent metadata
const metadata = buildRegistrationFileJson({
  name: 'My AI Agent',
  description: 'An autonomous agent that does amazing things',
  image: imageUri,

  // Services
  services: [
    { type: ServiceType.MCP, value: 'https://my-api.com/mcp' },
    { type: ServiceType.A2A, value: 'https://my-api.com/a2a' },
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

// 6. Register on Solana (ATOM is off by default; pass atomEnabled: true to opt in now)
const result = await sdk.registerAgent(metadataUri, undefined, { collectionPointer: collection.pointer! });
console.log('Agent:', result.asset.toBase58());

// 7. Set operational wallet (for agent signing)
const opWallet = Keypair.generate();
await sdk.setAgentWallet(result.asset, opWallet);
console.log('Operational wallet:', opWallet.publicKey.toBase58());

// 8. (Optional) Store on-chain metadata
await sdk.setMetadata(result.asset, 'token', 'So11111111111111111111111111111111111111112', true);
```

If you are building a browser app, use `ipfs.add(data)` or `ipfs.addJson(data)` instead of `addFile()`.

See [OASF.md](./OASF.md) for the full list of available skills and domains.

**Note on ATOM (Reputation Engine):** By default, `registerAgent()` does not initialize on-chain ATOM stats (`atomEnabled: false`), so you avoid the extra rent unless you opt in. To enable immediately at registration, pass `{ atomEnabled: true }`. You can also enable later with `enableAtom()` followed by `initializeAtomStats()`. `enableAtom()` is one-way/irreversible for that agent.

**Note on Metadata:** On-chain metadata (via `setMetadata`) is stored directly on Solana for quick access without IPFS fetching. Limits: metadata key max `32` bytes, metadata value max `250` bytes, and `agent_uri` max `250` bytes.

For advanced collection pointer and parent workflows, see:
- [`COLLECTION.md`](./COLLECTION.md)
- [`examples/collection-flow.ts`](../examples/collection-flow.ts)

---

## 5. Verify Your Agent

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

```typescript
// Give feedback (value accepts decimal strings, numbers, or bigint)
await sdk.giveFeedback(agentAsset, {
  value: '99.5',              // Auto-encoded: value=995, decimals=1
  tag1: 'uptime',             // Category tag
  tag2: 'day',                // Period tag
  feedbackUri: 'ipfs://QmFeedback...',
});

// Check reputation
const summary = await sdk.getSummary(agentAsset);
console.log(`Score: ${summary.averageScore}, Feedbacks: ${summary.totalFeedbacks}`);

// Update URI
await sdk.setAgentUri(agentAsset, 'ipfs://newCid'); // registry auto-resolved

// Sign data with agent's operational wallet
const signed = sdk.sign(agentAsset, { action: 'authorize', user: 'alice' });
const isValid = await sdk.verify(signed, agentAsset);
```

### Resources

- [Full API Reference](./METHODS.md)
- [Examples](https://github.com/QuantuLabs/8004-solana-ts/tree/main/examples)
- [Collection Flow Example](../examples/collection-flow.ts)
- [Explorer](https://x402synthex.xyz)
- [Telegram](https://t.me/sol8004)
- [X / Twitter](https://x.com/Quantu_AI)
