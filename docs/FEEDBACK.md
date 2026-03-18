# Feedback System Guide

The 8004 feedback system enables rich reputation tracking with standardized tags and raw metrics.

> **Value Encoding**: This SDK uses `i128` for value and `0-18` for valueDecimals (matching current on-chain behavior). Tags are optional by design so ecosystems can evolve their own taxonomies.

## Quick Reference

```typescript
import { PublicKey } from '@solana/web3.js';

const agentAsset = new PublicKey('YourAgentAssetPubkey...');

await sdk.giveFeedback(agentAsset, {
  score: 85,
  value: '150.00',
  tag1: 'revenues',
  tag2: 'month',
  endpoint: '/api/v1/generate',
  feedbackUri: 'ipfs://Qm...',
});
```

The main SDK surface in this release is asset-pubkey-first.

If you only have a backend sequential `agentId`, resolve it first with `getAgentByAgentId()` / `searchAgents()` and then use the returned asset pubkey for the main agent-scoped methods.

## Fields

| Field | Type | Description |
|-------|------|-------------|
| `score` | `number \| null` | Quality score 0-100. Null = ATOM skips scoring, infers from tag |
| `value` | `bigint` | Raw metric (i128). Examples: profit in cents, latency in ms |
| `valueDecimals` | `number` | Decimal precision 0-18. value=1500 + decimals=2 = 15.00 |
| `tag1` | `string` | Primary category tag (max 32 bytes) |
| `tag2` | `string` | Secondary qualifier (max 32 bytes) |
| `endpoint` | `string` | Agent endpoint that was called (max 250 bytes) |
| `feedbackUri` | `string` | Optional IPFS/HTTP link to detailed feedback (defaults to empty string) |

## Tag Helper

The SDK provides `Tag` constants for standardized tags:

```typescript
import { Tag, isKnownTag, getTagDescription } from '8004-solana';

// Category tags (tag1)
Tag.starred           // 'starred'
Tag.reachable         // 'reachable'
Tag.ownerVerified     // 'ownerVerified'
Tag.uptime            // 'uptime'
Tag.successRate       // 'successRate'
Tag.responseTime      // 'responseTime'
Tag.blocktimeFreshness // 'blocktimeFreshness'
Tag.revenues          // 'revenues'
Tag.tradingYield      // 'tradingYield'

// Period tags (tag2)
Tag.day               // 'day'
Tag.week              // 'week'
Tag.month             // 'month'
Tag.year              // 'year'

// Utilities
isKnownTag('uptime')              // true
getTagDescription('successRate')  // 'Task completion success percentage'
```

Custom tags are also supported (any string up to 32 bytes).

## 8004 Standardized Tags

As defined in the [8004 specification](https://github.com/erc-8004/erc-8004-contracts/blob/master/ERC8004SPEC.md):

| tag1 | Purpose | value | ATOM auto-score |
|------|---------|-------|-----------------|
| `starred` | Quality rating | 0-100 | ✅ Direct |
| `uptime` | Endpoint uptime | % | ✅ Direct |
| `successRate` | Success rate | % | ✅ Direct |
| `reachable` | Endpoint reachable | 0 or 1 | ❌ Provide explicit score |
| `ownerVerified` | Owner verification | 0 or 1 | ❌ Provide explicit score |
| `responseTime` | Response time | ms | ❌ Provide explicit score |
| `blocktimeFreshness` | Block delay | blocks | ❌ Provide explicit score |
| `revenues` | Cumulative revenues | USD | ❌ Provide explicit score |
| `tradingYield` | Yield/APY | % | ❌ Provide explicit score |

> Tags marked ❌ require an explicit `score` for ATOM processing. Their `value` is stored but not auto-normalized.

### Examples

```typescript
// Quality rating
await sdk.giveFeedback(agentAsset, {
  score: 85,
  tag1: 'starred',
});

// Response time tracking (explicit score required)
await sdk.giveFeedback(agentAsset, {
  score: 95,            // Fast response = high score
  value: 250n,          // 250ms
  valueDecimals: 0,
  tag1: 'responseTime',
  endpoint: '/api/generate',
});

// Revenue tracking
await sdk.giveFeedback(agentAsset, {
  score: 90,
  value: 15000n,        // $150.00
  valueDecimals: 2,
  tag1: 'revenues',
  tag2: 'week',
});

// Trading yield
await sdk.giveFeedback(agentAsset, {
  score: 75,
  value: 1250n,         // 12.50%
  valueDecimals: 2,
  tag1: 'tradingYield',
  tag2: 'month',
});

// Uptime monitoring
await sdk.giveFeedback(agentAsset, {
  score: null,
  value: 9975n,         // 99.75%
  valueDecimals: 2,
  tag1: 'uptime',
  tag2: 'month',
});
```

## Value & Decimals Patterns

### Currency (2 decimals)
```typescript
// $99.77 profit
{ value: 9977n, valueDecimals: 2 }
```

### Percentages (2 decimals)
```typescript
// 99.75% uptime
{ value: 9975n, valueDecimals: 2 }
```

### Milliseconds (0 decimals)
```typescript
// 250ms response time
{ value: 250n, valueDecimals: 0 }
```

### Negative values (PnL)
```typescript
// -$15.00 loss
{ value: -1500n, valueDecimals: 2 }
```

### i128 Range
```typescript
// Maximum: 170,141,183,460,469,231,731,687,303,715,884,105,727
{ value: 170141183460469231731687303715884105727n, valueDecimals: 0 }

// Minimum: -170,141,183,460,469,231,731,687,303,715,884,105,728
{ value: -170141183460469231731687303715884105728n, valueDecimals: 0 }
```

## Optional Score (ATOM Inference)

When `score` is `null` or `undefined`, ATOM will:

1. Look up the `tag1` in the tag registry
2. Use the tag's default score (if defined)
3. Fall back to 50 (neutral) for unknown tags

```typescript
// Score inferred from tag
await sdk.giveFeedback(agentAsset, {
  score: null,
  tag1: 'uptime',
  value: 9999n,
  valueDecimals: 2,
});
```

## Feedback File Format

For detailed feedback, upload a JSON file to IPFS:

```json
{
  "agent": "AgentAssetPubkey...",
  "client": "ClientPubkey...",
  "timestamp": "2026-01-26T14:00:00Z",
  "score": 85,
  "value": 15000,
  "valueDecimals": 2,
  "tag1": "revenues",
  "tag2": "week",
  "endpoint": "/api/v1/generate",
  "details": {
    "requestId": "req_abc123",
    "duration": 1250,
    "tokens": 500
  }
}
```

Then reference it:

```typescript
const cid = await ipfs.addJson(feedbackJson);

await sdk.giveFeedback(agentAsset, {
  score: 85,
  value: 15000n,
  valueDecimals: 2,
  tag1: 'revenues',
  feedbackUri: `ipfs://${cid}`,
});
```

## Reading Feedback

```typescript
// Read single feedback
const feedback = await sdk.readFeedback(agentAsset, clientAddress, 0);
console.log(feedback.score);         // 85 or null
console.log(feedback.value);         // 15000n
console.log(feedback.valueDecimals); // 2

// List all feedbacks for an agent (indexer-backed)
const feedbacks = await sdk.readAllFeedback(agentAsset);
const latest10 = feedbacks.slice(0, 10);

// Read by indexer feedback row id (sequential numeric id only)
const feedbackById = await sdk.getFeedbackById('123'); // valid
const invalidCanonical = await sdk.getFeedbackById('asset:client:7'); // null
const responsesById = await sdk.getFeedbackResponsesByFeedbackId('123', 10); // valid

// Fails closed if a backend feedback_id is ambiguous across assets
// (throws IndexerError with code INVALID_RESPONSE)

// Get reputation summary
const summary = await sdk.getSummary(agentAsset);
console.log(summary.averageScore);
console.log(summary.totalFeedbacks);
```

## Revoke Feedback

For the normal flow, keep it simple:

```typescript
const agentAsset = new PublicKey('YourAgentAssetPubkey...');
const feedbackIndex = 12;

await sdk.revokeFeedback(agentAsset, feedbackIndex);
```

`revokeFeedback()` resolves the indexed `sealHash` for you by default.

Use the explicit `sealHash` form only for manual or server-side workflows where you already store that hash:

```typescript
await sdk.revokeFeedback(agentAsset, 12, sealHash, {
  verifyFeedbackClient: false,
  waitForIndexerSync: false,
});
```

## x402 Protocol Integration

The x402 protocol extends 8004 for payment-based agent interactions. Use these tags for payment feedback:

### Client → Agent Feedback (tag1)

| Tag | Constant | Description |
|-----|----------|-------------|
| `x402-resource-delivered` | `Tag.x402ResourceDelivered` | Resource delivered successfully |
| `x402-delivery-failed` | `Tag.x402DeliveryFailed` | Resource delivery failed |
| `x402-delivery-timeout` | `Tag.x402DeliveryTimeout` | Resource delivery timed out |
| `x402-quality-issue` | `Tag.x402QualityIssue` | Resource quality below expectations |

### Agent → Client Feedback (tag1)

| Tag | Constant | Description |
|-----|----------|-------------|
| `x402-good-payer` | `Tag.x402GoodPayer` | Client paid successfully |
| `x402-payment-failed` | `Tag.x402PaymentFailed` | Payment failed to settle |
| `x402-insufficient-funds` | `Tag.x402InsufficientFunds` | Insufficient funds |
| `x402-invalid-signature` | `Tag.x402InvalidSignature` | Invalid signature |

### Network Identifier (tag2)

| Tag | Constant | Description |
|-----|----------|-------------|
| `exact-evm` | `Tag.x402Evm` | EVM network settlement (Base, Ethereum) |
| `exact-svm` | `Tag.x402Svm` | Solana network settlement |

### Example

```typescript
import { Tag } from '8004-solana';

const providerAgentAsset = providerAgent.asset;
const clientAgentAsset = clientAgent.asset;

// Client feedback after successful delivery
await sdk.giveFeedback(providerAgentAsset, {
  score: 95,
  value: 100n,           // Payment amount in cents
  valueDecimals: 2,
  tag1: Tag.x402ResourceDelivered,
  tag2: Tag.x402Svm,     // Solana settlement
});

// Agent feedback for good payer
await sdk.giveFeedback(clientAgentAsset, {
  score: 100,
  tag1: Tag.x402GoodPayer,
  tag2: Tag.x402Evm,     // EVM settlement
});
```

> **Reference**: [x402 8004 Integration](https://github.com/coinbase/x402/issues/931)

## Best Practices

1. **Use 8004 standard tags** when applicable for interoperability
2. **Include value/valueDecimals** for quantitative metrics
3. **Set score explicitly** when you have a clear quality assessment
4. **Use null score** for pure metric tracking without quality judgment
5. **Upload feedbackUri** for detailed audit trails
