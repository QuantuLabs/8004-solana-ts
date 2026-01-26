# Feedback System Guide

The ERC-8004 feedback system enables rich reputation tracking with standardized tags and raw metrics.

## Quick Reference

```typescript
await sdk.giveFeedback(agent.asset, {
  score: 85,                      // 0-100, optional (null = inferred from tag)
  value: 15000n,                  // i64: raw metric value
  valueDecimals: 2,               // 0-6: decimal precision
  tag1: 'revenues',               // primary category (ERC-8004 standard)
  tag2: 'monthly',                // secondary qualifier
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

## ERC-8004 Standardized Tags

As defined in the [ERC-8004 specification](https://eips.ethereum.org/EIPS/eip-8004):

| tag1 | Purpose | value | ATOM score formula |
|------|---------|-------|-------------------|
| `starred` | Quality rating | 0-100 | Direct: `value` |
| `reachable` | Endpoint reachable | 0 or 1 | Binary: `0→0, 1→100` |
| `ownerVerified` | Owner verification | 0 or 1 | Binary: `0→0, 1→100` |
| `uptime` | Endpoint uptime | % | Direct: `value` |
| `successRate` | Success rate | % | Direct: `value` |
| `responseTime` | Response time | ms | Inverse: `100 - value/10` |
| `blocktimeFreshness` | Block delay | blocks | Inverse: `100 - value*10` |
| `revenues` | Cumulative revenues | USD | Log: `50 + log10(value)*12.5` |
| `tradingYield` | Yield/APY | % | Direct: `value` (capped 100) |

> Note: Tags are case-insensitive. `tag2` is for qualifiers (e.g., time periods).

### Examples

```typescript
// Quality rating
await sdk.giveFeedback(agent.asset, {
  score: 85,
  tag1: 'starred',
});

// Response time tracking
await sdk.giveFeedback(agent.asset, {
  score: null,          // Let ATOM infer
  value: 250n,          // 250ms
  valueDecimals: 0,
  tag1: 'responseTime',
  endpoint: '/api/generate',
});

// Revenue tracking
await sdk.giveFeedback(agent.asset, {
  score: 90,
  value: 15000n,        // $150.00
  valueDecimals: 2,
  tag1: 'revenues',
  tag2: 'weekly',
});

// Trading yield
await sdk.giveFeedback(agent.asset, {
  score: 75,
  value: 1250n,         // 12.50%
  valueDecimals: 2,
  tag1: 'tradingYield',
  tag2: '30d',          // 30-day period
});

// Uptime monitoring
await sdk.giveFeedback(agent.asset, {
  score: null,
  value: 9975n,         // 99.75%
  valueDecimals: 2,
  tag1: 'uptime',
  tag2: 'monthly',
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

### i64 Range
```typescript
// Maximum: 9,223,372,036,854,775,807
{ value: 9223372036854775807n, valueDecimals: 0 }

// Minimum: -9,223,372,036,854,775,808
{ value: -9223372036854775808n, valueDecimals: 0 }
```

## Optional Score (ATOM Inference)

When `score` is `null` or `undefined`, ATOM will:

1. Look up the `tag1` in the tag registry
2. Use the tag's default score (if defined)
3. Fall back to 50 (neutral) for unknown tags

```typescript
// Score inferred from tag
await sdk.giveFeedback(agent.asset, {
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
  "tag2": "weekly",
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
const feedbackContent = JSON.stringify(feedbackJson);
const feedbackHash = crypto.createHash('sha256').update(feedbackContent).digest();
const cid = await ipfs.addJson(feedbackJson);

await sdk.giveFeedback(agent.asset, {
  score: 85,
  value: 15000n,
  valueDecimals: 2,
  tag1: 'revenues',
  feedbackUri: `ipfs://${cid}`,
  feedbackHash,
});
```

## Reading Feedback

```typescript
// Read single feedback
const feedback = await sdk.readFeedback(agent.asset, clientAddress, 0);
console.log(feedback.score);         // 85 or null
console.log(feedback.value);         // 15000n
console.log(feedback.valueDecimals); // 2

// List all feedbacks
const feedbacks = await sdk.listFeedbacks(agent.asset, { limit: 10 });

// Get reputation summary
const summary = await sdk.getSummary(agent.asset);
console.log(summary.averageScore);
console.log(summary.totalFeedbacks);
```

## Best Practices

1. **Use ERC-8004 standard tags** when applicable for interoperability
2. **Include value/valueDecimals** for quantitative metrics
3. **Set score explicitly** when you have a clear quality assessment
4. **Use null score** for pure metric tracking without quality judgment
5. **Upload feedbackUri** for detailed audit trails
