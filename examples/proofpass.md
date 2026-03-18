# ProofPass

`ProofPass` lets a service open a feedback request, then lets a reviewer finalize a real `giveFeedback()` later.

The final feedback is still attributed to the `reviewer`, not to the `ProofPass` program.

## Fast Path

1. Open a session
2. Finalize feedback
3. Read or close the session

## Open

```ts
import { openProofPass } from '8004-solana';

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

console.log(flow.sessionAddress);
```

If you only have a backend sequential `agentId`, the preferred flow is still to resolve it to the agent asset pubkey first. For compatibility, `openProofPass(...)` also still accepts a sequential `targetAgent` together with `indexerClient` / `indexerGraphqlUrl`.

## Finalize

```ts
import { giveFeedbackWithProof } from '8004-solana';

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

If you set them during `openProofPass()`, the SDK reloads and merges these hints automatically:
- `endpoint`
- `feedbackUri`
- `feedbackFileHash`

## Read or close

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

const liveByCreator = await getLiveProofPassesByCreator({
  connection,
  creator: serviceWallet.publicKey,
});

const closePlan = await closeProofPass({
  connection,
  session: flow.sessionPda,
});
```

## Notes

This flow assumes your ProofPass config is already initialized on-chain.

You can keep `ProofPass` fully generic. `endpoint`, `feedbackUri`, and `feedbackFileHash` are optional.

If your `ProofPass` config points to a custom 8004 registry outside the built-in devnet/mainnet defaults, pass `atomEngineProgramId` to `giveFeedbackWithProof(...)`.
