# 8004-solana SDK

TypeScript SDK for the 8004 Agent Registry on Solana.

## Project Info

- **npm package**: `8004-solana`
- **GitHub**: https://github.com/QuantuLabs/8004-solana-ts
- **Program IDs (Devnet)**:
  - Agent Registry: `6MuHv4dY4p9E4hSCEPr9dgbCSpMhq8x1vrUexbMVjfw1`
  - ATOM Engine: `6Mu7qj6tRDrqchxJJPjr9V1H2XQjCerVKixFEEMwC1Tf`

## Related Projects

| Project | Path |
|---------|------|
| 8004 Programs (Anchor) | `/Users/true/Documents/Pipeline/CasterCorp/8004-solana` |
| 8004-mcp (MCP Server) | `/Users/true/Documents/Pipeline/CasterCorp/8004-mcp` |
| Solana Indexer | `/Users/true/Documents/Pipeline/CasterCorp/8004-solana-indexer` |
| Substream Indexer | `/Users/true/Documents/Pipeline/CasterCorp/8004-solana-substream-indexer` |
| Integration Tests | `/Users/true/Documents/Pipeline/CasterCorp/test-8004-solana` |

## Specifications

### 8004 Spec

https://github.com/erc-8004/erc-8004-contracts/blob/master/ERC8004SPEC.md

Key concepts:
- Agents registered as NFTs with metadata URI
- Feedback system with `score`, `value`, `valueDecimals`, `tag1`, `tag2`
- Tags are developer-defined but standard examples improve interoperability

### Standardized Tags (tag1)

| Tag | Purpose |
|-----|---------|
| `starred` | Quality rating (0-100) |
| `reachable` | Endpoint availability (binary) |
| `ownerVerified` | Domain ownership (binary) |
| `uptime` | Availability percentage |
| `successRate` | Success rate percentage |
| `responseTime` | Latency in milliseconds |
| `blocktimeFreshness` | Block delay metric |
| `revenues` | Cumulative revenue |
| `tradingYield` | Yield/APY |

### Period Tags (tag2)

`day`, `week`, `month`, `year`

### x402 Protocol Extension

https://github.com/coinbase/x402/issues/931

**Client → Agent (tag1)**:
- `x402-resource-delivered` - Resource delivered successfully
- `x402-delivery-failed` - Resource delivery failed
- `x402-delivery-timeout` - Resource delivery timed out
- `x402-quality-issue` - Quality below expectations

**Agent → Client (tag1)**:
- `x402-good-payer` - Client paid successfully
- `x402-payment-failed` - Payment failed to settle
- `x402-insufficient-funds` - Insufficient funds
- `x402-invalid-signature` - Invalid signature

**Network (tag2)**:
- `exact-evm` - EVM settlement (Base, Ethereum)
- `exact-svm` - Solana settlement

## Development Notes

### Value Encoding

The SDK auto-encodes decimal strings:
```typescript
// "99.77" → { value: 9977n, valueDecimals: 2 }
await sdk.giveFeedback(asset, { value: '99.77', tag1: 'uptime' });
```

### Tag Helpers

Use `Tag` constants for standard tags:
```typescript
import { Tag } from '8004-solana';
tag1: Tag.uptime      // 'uptime'
tag2: Tag.day         // 'day'
```

### ATOM Engine

- Auto-initialized on agent registration (atomEnabled: true)
- Trust tiers: Unrated → Bronze → Silver → Gold → Platinum
- Uses HyperLogLog for Sybil detection
