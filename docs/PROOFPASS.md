# ProofPass

`ProofPass` is the requester-driven verified feedback flow for `8004-solana`.

A service opens a feedback request, then the reviewer finalizes a real `giveFeedback` into `8004` later.

For this release, the examples pass the agent asset pubkey directly.

If you only have a backend sequential `agentId`, resolve it through the indexer first and then pass the agent asset pubkey into `openProofPass(...)`.

Examples:

- [examples/proofpass.md](../examples/proofpass.md)
- [examples/proofpass-x402.md](../examples/proofpass-x402.md)

## Public Surface

- `openProofPass(...)`
- `giveFeedbackWithProof(...)`
- `getLiveProofPass(...)`
- `getLiveProofPassesByCreator(...)`
- `closeProofPass(...)`

## Current Costs

The public runtime always reads the active on-chain `ProofPass` config.

The values below are only the current validated deployment settings used in our examples and smoke tests. If the on-chain config changes, runtime behavior follows the chain, not this document.

- `open_fee = 0`
- `finalize_fee = 10,000` lamports = `0.00001 SOL`
- default `feeMode`: `creator_pays_all`

Simple reading for the currently validated deployment:

- `openProofPass(...)`
  - `0 SOL` protocol fee
  - only the normal transaction network fee
- `giveFeedbackWithProof(...)`
  - `0.00001 SOL` protocol fee
  - plus the normal network fee for the finalize transaction

In default `creator_pays_all` mode:

- the `finalize` fee is locked at open time
- if the feedback is finalized, it is consumed
- if the session is closed without finalize, it is refunded to the creator

So:

- successful `open + finalize`
  - net creator cost: `0.000015 SOL`
  - `0.000005 SOL` open network fee + `0.00001 SOL` finalize fee
- `open + close` without finalize
  - net creator cost: `0.00001 SOL`
  - only the `open` + `close` network fees

In `reviewer_pays_finalize` mode:

- the creator does not lock the finalize fee at open time
- the reviewer pays the finalize fee during `giveFeedbackWithProof(...)`

## Minimal Flow

```ts
import {
  openProofPass,
  giveFeedbackWithProof,
} from '8004-solana';

const agentAsset = agent.asset;

const flow = await openProofPass({
  connection,
  creator: serviceWallet.publicKey,
  reviewer: customerWallet.publicKey,
  targetAgent: agentAsset,
  contextRef: `request:${requestId}`,
  contextType: 3,
  ttlSlots: 1_200,
  feeMode: 'creator_pays_all',
  endpoint: '/api/v1/generate',
  feedbackUri: 'ipfs://QmServiceProof...',
  feedbackFileHash: new Uint8Array(32),
});

const finalizeIx = await giveFeedbackWithProof({
  connection,
  session: flow.sessionPda,
  reviewer: customerWallet.publicKey,
  feedback: {
    value: '42',
    tag1: 'quality',
  },
});
```

`openProofPass(...)` arguments:

- `connection`: Solana connection used to read the active on-chain `ProofPass` config
- `creator`: service wallet opening the request
- `reviewer`: wallet expected to finalize the feedback later
- `targetAgent`: the agent asset public key for the request target
- `contextRef`: business reference used to bind the request to your off-chain flow
- `contextType`: optional compact context discriminator, defaults to `3`
- `ttlSlots`: optional expiry window in slots
- `feeMode`: optional fee model, defaults to `creator_pays_all`
- `endpoint`: optional service endpoint hint merged into finalize
- `feedbackUri`: optional service feedback artifact URI merged into finalize
- `feedbackFileHash`: optional 32-byte file hash merged into finalize
- `indexerClient` / `indexerGraphqlUrl`: optional advanced overrides when you intentionally resolve a backend sequential `agentId` before opening

`giveFeedbackWithProof(...)` arguments:

- `connection`: Solana connection used to reload the live session and config
- `session`: `ProofPass` session PDA returned by `openProofPass(...)`
- `reviewer`: wallet submitting the final feedback
- `feedback`: the normal `giveFeedback` payload; service hints are merged automatically from the session
- `atomEngineProgramId`: optional override when using a custom `8004` registry setup
