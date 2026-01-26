# Feedback System Guide

The ERC-8004 feedback system enables rich reputation tracking with standardized tags, raw metrics, and cross-chain compatibility.

## Quick Reference

```typescript
await sdk.giveFeedback(agent.asset, {
  score: 85,                      // 0-100, optional (null = inferred from tag)
  value: 15000n,                  // i64: raw metric value
  valueDecimals: 2,               // 0-6: decimal precision
  tag1: 'x402-resource-delivered', // primary category
  tag2: 'exact-svm',              // secondary qualifier
  endpoint: '/api/v1/generate',   // endpoint called (max 250 bytes)
  feedbackUri: 'ipfs://Qm...',    // detailed feedback file
  feedbackHash: Buffer.alloc(32), // SHA-256 of feedback content
});
```

## Fields

| Field | Type | Description |
|-------|------|-------------|
| `score` | `number \| null` | Quality score 0-100. Null = ATOM skips scoring, infers from tag |
| `value` | `bigint` | Raw metric (i64). Examples: profit in cents, latency in ms |
| `valueDecimals` | `number` | Decimal precision 0-6. value=1500 + decimals=2 = 15.00 |
| `tag1` | `string` | Primary category tag (max 32 bytes) |
| `tag2` | `string` | Secondary qualifier (max 32 bytes) |
| `endpoint` | `string` | Agent endpoint that was called (max 250 bytes) |
| `feedbackUri` | `string` | IPFS/HTTP link to detailed feedback |
| `feedbackHash` | `Buffer` | SHA-256 hash for integrity verification |

## Standardized Tags

### x402 Payment Protocol

For agents using the x402 payment standard:

| Tag | Score Default | Description |
|-----|---------------|-------------|
| `x402-resource-delivered` | 80 | Payment verified, resource delivered |
| `x402-payment-verified` | 85 | Payment confirmed on-chain |
| `x402-good-payer` | 75 | Client paid promptly |
| `x402-bad-payer` | 15 | Payment failed or disputed |

```typescript
// After x402 payment settlement
await sdk.giveFeedback(agent.asset, {
  score: null,  // Uses tag default (80)
  value: 5000n, // $50.00 payment
  valueDecimals: 2,
  tag1: 'x402-resource-delivered',
  tag2: 'exact-svm',  // Solana payment
});
```

### Performance Metrics

| Tag | Score Default | Use Case |
|-----|---------------|----------|
| `performance` | 50 | Generic performance tracking |
| `latency` | 50 | Response time metrics |
| `throughput` | 50 | Requests/second metrics |
| `uptime` | 75 | Availability tracking |

```typescript
// Track API latency
await sdk.giveFeedback(agent.asset, {
  score: null,
  value: 250n,        // 250ms response time
  valueDecimals: 0,
  tag1: 'latency',
  tag2: 'p99',
});
```

### Financial Metrics

| Tag | Score Default | Use Case |
|-----|---------------|----------|
| `pnl` | 50 | Profit and loss tracking |
| `roi` | 50 | Return on investment |
| `yield` | 60 | Yield/APY metrics |

```typescript
// Trading agent PnL
await sdk.giveFeedback(agent.asset, {
  score: 85,
  value: -150000n,    // -$1,500.00 loss
  valueDecimals: 2,
  tag1: 'pnl',
  tag2: 'weekly',
});
```

### Quality Ratings

| Tag | Score Default | Use Case |
|-----|---------------|----------|
| `quality` | 50 | Generic quality score |
| `accuracy` | 50 | Model/prediction accuracy |
| `relevance` | 50 | Content relevance |

## Value & Decimals Patterns

### Currency (2 decimals)
```typescript
// $99.77 profit
{ value: 9977n, valueDecimals: 2 }
```

### Microseconds (6 decimals)
```typescript
// 9.977000 seconds
{ value: 9977000n, valueDecimals: 6 }
```

### Integer counts (0 decimals)
```typescript
// 1,500 requests processed
{ value: 1500n, valueDecimals: 0 }
```

### Negative values
```typescript
// -$15.00 loss
{ value: -1500n, valueDecimals: 2 }
```

### i64 Range
```typescript
// Maximum: 9,223,372,036,854,775,807
{ value: 9223372036854775807n, valueDecimals: 0 }

// Minimum: -9,223,372,036,854,775,808
{ value: -9223372036854775808n, valueDecimals: 0 }
```

## Optional Score (ATOM Inference)

When `score` is `null` or `undefined`, ATOM will:

1. Look up the `tag1` in the standardized tag registry
2. Use the tag's default score (if found)
3. Fall back to 50 (neutral) for unknown tags

```typescript
// Score inferred from tag (x402-resource-delivered = 80)
await sdk.giveFeedback(agent.asset, {
  score: null,
  tag1: 'x402-resource-delivered',
});

// Unknown tag = score defaults to 50
await sdk.giveFeedback(agent.asset, {
  score: null,
  tag1: 'custom-metric',
});
```

## Feedback File Format

For detailed feedback, upload a JSON file to IPFS:

```json
{
  "version": "1.0",
  "agent": "AgentAssetPubkey...",
  "client": "ClientPubkey...",
  "timestamp": "2026-01-26T14:00:00Z",
  "score": 85,
  "value": 15000,
  "valueDecimals": 2,
  "tag1": "x402-resource-delivered",
  "tag2": "exact-svm",
  "endpoint": "/api/v1/generate",
  "details": {
    "requestId": "req_abc123",
    "duration": 1250,
    "tokens": 500,
    "model": "gpt-4"
  },
  "proofOfPayment": {
    "txHash": "5abc...",
    "fromAddress": "Client...",
    "toAddress": "Agent...",
    "amount": 15000,
    "chainId": "solana:devnet"
  }
}
```

Then reference it in the feedback:

```typescript
const feedbackContent = JSON.stringify(feedbackJson);
const feedbackHash = crypto.createHash('sha256').update(feedbackContent).digest();
const cid = await ipfs.addJson(feedbackJson);

await sdk.giveFeedback(agent.asset, {
  score: 85,
  value: 15000n,
  valueDecimals: 2,
  tag1: 'x402-resource-delivered',
  feedbackUri: `ipfs://${cid}`,
  feedbackHash,
});
```

## Reading Feedback

```typescript
// Read single feedback
const feedback = await sdk.readFeedback(agent.asset, clientAddress, 0);
console.log(feedback.score);        // 85 or null
console.log(feedback.value);        // 15000n
console.log(feedback.valueDecimals); // 2

// List all feedbacks
const feedbacks = await sdk.listFeedbacks(agent.asset, { limit: 10 });

// Get reputation summary
const summary = await sdk.getSummary(agent.asset);
console.log(summary.averageScore);
console.log(summary.totalFeedbacks);
```

## Cross-Chain Compatibility

The feedback signature is compatible with EVM chains (ERC-8004):

| Solana | EVM | Notes |
|--------|-----|-------|
| `value: i64` | `value: int256` | Solana uses i64, EVM uses int256 |
| `valueDecimals: u8` | `valueDecimals: uint8` | 0-6 range on both |
| `score: Option<u8>` | `score: uint8 (255=null)` | 255 means "no score" on EVM |

The indexer normalizes these differences for cross-chain queries.

## Best Practices

1. **Use standardized tags** when possible for consistent ATOM scoring
2. **Include value/valueDecimals** for quantitative metrics
3. **Set score explicitly** when you have a clear quality assessment
4. **Use null score** for pure metric tracking without quality judgment
5. **Upload feedbackUri** for detailed audit trails
6. **Hash sensitive data** before including in feedbackUri
