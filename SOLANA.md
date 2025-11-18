# Agent0 Solana SDK

Solana implementation of ERC-8004 for agent registries and reputation systems.

## Installation

```bash
npm install agent0-sdk
```

## Quick Start

### Read-Only Mode (No Signer)

```typescript
import { createDevnetSDK } from 'agent0-sdk/solana';

const sdk = createDevnetSDK();

// Load agent
const agent = await sdk.loadAgent(1n);

// Get reputation summary
const summary = await sdk.getSummary(1n);
console.log(`Average: ${summary.averageScore}, Total: ${summary.totalFeedbacks}`);

// Read all feedback
const feedbacks = await sdk.readAllFeedback(1n);
```

### Read-Write Mode (With Signer)

```typescript
import { Keypair } from '@solana/web3.js';
import { createDevnetSDK } from 'agent0-sdk/solana';

const signer = Keypair.fromSecretKey(/* your key */);
const sdk = createDevnetSDK({ signer });

// Register agent
const result = await sdk.registerAgent('ipfs://Qm...');

// Give feedback
await sdk.giveFeedback(1n, 85, 'ipfs://Qm...', Buffer.from(/* hash */));
```

## Read Functions

### 1. getSummary()
```typescript
const summary = await sdk.getSummary(agentId);
// Returns: { averageScore: number, totalFeedbacks: number }
```

### 2. readFeedback()
```typescript
const feedback = await sdk.readFeedback(agentId, clientPublicKey, feedbackIndex);
// Returns: SolanaFeedback | null
```

### 3. readAllFeedback()
```typescript
const feedbacks = await sdk.readAllFeedback(agentId, includeRevoked);
// Returns: SolanaFeedback[]
```

### 4. getLastIndex()
```typescript
const lastIndex = await sdk.getLastIndex(agentId, clientPublicKey);
// Returns: bigint
```

### 5. getClients()
```typescript
const clients = await sdk.getClients(agentId);
// Returns: PublicKey[]
```

### 6. getResponseCount()
```typescript
const count = await sdk.getResponseCount(agentId, clientPublicKey, feedbackIndex);
// Returns: number
```

### Bonus: readResponses()
```typescript
const responses = await sdk.readResponses(agentId, clientPublicKey, feedbackIndex);
// Returns: SolanaResponse[]
```

## Write Functions

### registerAgent()
```typescript
const result = await sdk.registerAgent(tokenUri?);
// Returns: { signature: string, agentId: bigint }
```

### setAgentUri()
```typescript
const result = await sdk.setAgentUri(agentId, newUri);
// Returns: { signature: string }
```

### setMetadata()
```typescript
const result = await sdk.setMetadata(agentId, key, value);
// Returns: { signature: string }
```

### giveFeedback()
```typescript
const result = await sdk.giveFeedback(agentId, score, fileUri, fileHash);
// Returns: { signature: string, feedbackIndex: bigint }
```

### revokeFeedback()
```typescript
const result = await sdk.revokeFeedback(agentId, feedbackIndex);
// Returns: { signature: string }
```

### appendResponse()
```typescript
const result = await sdk.appendResponse(agentId, client, feedbackIndex, responseUri, responseHash);
// Returns: { signature: string }
```

### requestValidation()
```typescript
const result = await sdk.requestValidation(agentId, validator, requestHash);
// Returns: { signature: string, nonce: number }
```

### respondToValidation()
```typescript
const result = await sdk.respondToValidation(agentId, requester, nonce, response, responseHash);
// Returns: { signature: string }
```

## Configuration

```typescript
import { createDevnetSDK, createMainnetSDK } from 'agent0-sdk/solana';

// Devnet
const sdk = createDevnetSDK({
  rpcUrl: 'https://api.devnet.solana.com', // Optional
  signer: keypair, // Optional (for write operations)
  ipfsClient: ipfsClient // Optional (for storage)
});

// Mainnet
const sdk = createMainnetSDK({ signer });
```

## License

MIT License
