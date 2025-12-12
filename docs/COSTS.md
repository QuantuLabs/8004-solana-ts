# Operation Costs

Measured on Solana devnet with v0.2.0 SDK.

## Cost Table

| Operation | Total Cost | Lamports | Notes |
|-----------|------------|----------|-------|
| Register Agent | **0.00651 SOL** | 6,507,280 | Core asset + AgentAccount |
| Set On-chain Metadata (1st) | **0.00319 SOL** | 3,192,680 | +MetadataEntryPda |
| Set On-chain Metadata (update) | 0.000005 SOL | 5,000 | TX fee only |
| Give Feedback (1st) | 0.00332 SOL | 3,324,920 | Feedback + AgentReputation init |
| Give Feedback (2nd+) | 0.00209 SOL | 2,086,040 | FeedbackAccount only |
| Append Response (1st) | 0.00275 SOL | 2,747,240 | Response + ResponseIndex init |
| Append Response (2nd+) | 0.00163 SOL | 1,626,680 | ResponseAccount only |
| Revoke Feedback | 0.000005 SOL | 5,000 | TX fee only |
| Request Validation | 0.00183 SOL | 1,828,520 | ValidationRequest |
| Respond to Validation | 0.000005 SOL | 5,000 | TX fee only |
| **Full Lifecycle** | **0.0245 SOL** | 24,521,040 | Complete test cycle |

## First vs Subsequent Savings

| Operation | 1st Call | 2nd+ Calls | Savings |
|-----------|----------|------------|---------|
| Set On-chain Metadata | 0.00319 SOL | 0.000005 SOL | **-99%** |
| Give Feedback | 0.00332 SOL | 0.00209 SOL | **-37%** |
| Append Response | 0.00275 SOL | 0.00163 SOL | **-41%** |

First operation creates `init_if_needed` accounts. Subsequent calls skip initialization.

## v0.2.0 Optimizations

| Optimization | Before | After | Savings |
|--------------|--------|-------|---------|
| FeedbackAccount | 375 bytes | 171 bytes | **-54%** |
| ResponseAccount | 309 bytes | 105 bytes | **-66%** |
| MetadataEntryPda | Vec (fixed) | Individual PDAs | Unlimited entries |

**Key changes:**
- **Hash-only storage**: URIs stored in events, only hashes on-chain
- **Individual Metadata PDAs**: Unlimited entries, deletable for rent recovery
- **Immutable metadata option**: Lock metadata permanently
