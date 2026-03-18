# x402 + ProofPass

This is a small `x402` flow backed by `ProofPass`.

Use it when you want:
- an x402 payment flow
- a signed proof of interaction
- a real on-chain `8004` feedback at the end

Assumption: your ProofPass config is already initialized on-chain for the target cluster.
Only the on-chain `ProofPass` steps are SDK calls here.
The `x402` request/response verification steps stay in your service backend.

## Fast Path

1. Publish an agent registration file with `x402Support: true`
2. Open a `ProofPass` session before serving
3. Return a `402 Payment Required` with `8004-reputation`
4. Return a paid response with signed interaction data
5. Accept the signed review and finalize real on-chain feedback

## 1. Publish an x402-ready registration file

Publish a raw registration file that advertises `x402Support` and the wallet used by `payTo`.
This example uses raw JSON on purpose because the `x402` registration payload is deployment-specific.

In the registration payload below, `agentId` is the asset mint required by the x402 / 8004 spec.
For the SDK calls in this release, keep using the same agent asset pubkey as `targetAgent`.

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "Weather Agent",
  "description": "x402 weather endpoint with verifiable feedback",
  "x402Support": true,
  "services": [
    { "name": "MCP", "endpoint": "https://agent.example/weather" },
    {
      "name": "agentWallet",
      "endpoint": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:ServiceSettlementWallet111111111111111111111111"
    }
  ],
  "registrations": [
    {
      "agentId": "YourAgentAssetMint",
      "agentRegistry": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:8oo4J9tBB3Hna1jRQ3rWvJjojqM5DYTDJo5cejUuJy3C"
    }
  ]
}
```

## 2. Open a ProofPass request before serving

Open a request tied to the interaction you want to review later.

```ts
import { openProofPass } from '8004-solana';

const agentAsset = agent.asset;

const flow = await openProofPass({
  connection,
  creator: serviceSigner.publicKey,
  reviewer: customerWallet.publicKey,
  targetAgent: agentAsset,
  contextRef: `x402:weather:${invoiceId}`,
  ttlSlots: 1_200,
  endpoint: 'https://agent.example/weather',
  feedbackUri: `ipfs://${x402FeedbackArtifactCid}`,
});

// Send flow.openInstruction with your transaction pipeline.
console.log(flow.sessionAddress);
```

Persist:
- `flow.sessionAddress`
- `flow.sessionPda`
- your business identifier (`invoiceId`, `requestId`, ...)

## 3. Return the x402 payloads

Your `402 Payment Required` should include the `8004-reputation` extension.

```json
{
  "x402Version": 2,
  "accepts": [
    {
      "scheme": "exact",
      "network": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      "asset": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "payTo": "ServiceSettlementWallet111111111111111111111111",
      "amount": "1000"
    }
  ],
  "extensions": {
    "8004-reputation": {
      "info": {
        "version": "1.0.0",
        "registrations": [
          {
            "agentRegistry": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:8oo4J9tBB3Hna1jRQ3rWvJjojqM5DYTDJo5cejUuJy3C",
            "agentId": "YourAgentAssetMint"
          }
        ],
        "feedbackEndpoint": "https://agent.example/x402/feedback"
      }
    }
  }
}
```

The reviewer should verify `payTo` against the wallet declared by the agent before paying.

After payment, return the normal resource response plus a `PAYMENT-RESPONSE` header.
Decoded JSON:

```json
{
  "success": true,
  "transaction": "5A2CSREGntKZu8f2...",
  "network": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  "extensions": {
    "8004-reputation": {
      "agentRegistry": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:8oo4J9tBB3Hna1jRQ3rWvJjojqM5DYTDJo5cejUuJy3C",
      "agentId": "YourAgentAssetMint",
      "taskRef": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:5A2CSREGntKZu8f2...",
      "dataHash": "0x9f86d081884c...",
      "interactionHash": "0x123abc456def...",
      "agentSignerPublicKey": "0xa1b2c3d4...",
      "agentSignature": "0xa1b2c3d4e5f6...",
      "agentSignatureAlgorithm": "ed25519"
    }
  }
}
```

Your x402 backend should:
- recompute `dataHash = keccak256(uint32_be(len(requestBodyBytes)) || requestBodyBytes || responseBodyBytes)`
- recompute `interactionHash = keccak256("x402:8004-reputation:v1" || UTF8(taskRef) || dataHash)`
- verify the agent signature against the declared `agentWallet`

## 4. Accept the review and finalize

Once the reviewer has validated the paid response, they can POST a lightweight feedback payload to `feedbackEndpoint`.

```json
{
  "interactionData": {
    "agentRegistry": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:8oo4J9tBB3Hna1jRQ3rWvJjojqM5DYTDJo5cejUuJy3C",
    "agentId": "YourAgentAssetMint",
    "taskRef": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:5A2CSREGntKZu8f2...",
    "dataHash": "0x9f86d081884c...",
    "interactionHash": "0x123abc456def...",
    "agentSignerPublicKey": "0xa1b2c3d4...",
    "agentSignature": "0xa1b2c3d4e5f6...",
    "agentSignatureAlgorithm": "ed25519"
  },
  "review": {
    "value": 95,
    "valueDecimals": 0,
    "tag1": "starred",
    "tag2": "x402",
    "endpoint": "https://agent.example/weather"
  },
  "reviewerAddress": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:CustomerWallet111111111111111111111111",
  "reviewerSignature": "0xfedcba987654...",
  "reviewerSignatureAlgorithm": "ed25519"
}
```

Before accepting the review, verify:
- `taskRef`
- `dataHash`
- `interactionHash`
- `agentSignature`
- `reviewerSignature`

Then finalize the session into a real on-chain `giveFeedback()`:

```ts
import { giveFeedbackWithProof } from '8004-solana';

const finalizeIx = await giveFeedbackWithProof({
  connection,
  session: flow.sessionPda,
  reviewer: customerWallet.publicKey,
  feedback: {
    value: '95',
    score: 95,
    tag1: 'starred',
    tag2: 'x402',
    endpoint: 'https://agent.example/weather',
  },
});

// Send finalizeIx with the reviewer wallet.
```

The SDK reloads the session and merges these stored hints automatically:
- `endpoint`
- `feedbackUri`
- `feedbackFileHash`

## 5. Read or close the session

```ts
import {
  closeProofPass,
  getLiveProofPass,
  getLiveProofPassesByCreator,
} from '8004-solana';

const live = await getLiveProofPass({
  connection,
  session: flow.sessionPda,
});

const openByCreator = await getLiveProofPassesByCreator({
  connection,
  creator: serviceSigner.publicKey,
});

// If the session expires without finalize:
const closePlan = await closeProofPass({
  connection,
  session: flow.sessionPda,
});
```

You can then read the finalized feedback through your normal indexer-backed SDK reads.

If your `ProofPass` config points to a custom 8004 registry outside the built-in devnet/mainnet defaults, pass `atomEngineProgramId` explicitly to `giveFeedbackWithProof(...)`.
