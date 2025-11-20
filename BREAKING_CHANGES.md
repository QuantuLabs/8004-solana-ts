# Breaking Changes - ERC-8004 Solana SDK

## Version 2.0.0 (2025-01-XX)

### Major Breaking Changes

#### 1. **feedbackAuth Required for Reputation Submissions** ⚠️ CRITICAL

The `giveFeedback` function now requires a `FeedbackAuth` signature to prevent spam.

**Before (v1.x):**
```typescript
await reputationProgram.methods
  .giveFeedback(
    agentId,
    score,
    tag1,
    tag2,
    fileUri,
    fileHash,
    feedbackIndex
  )
  .accounts({ /* ... */ })
  .rpc();
```

**After (v2.0):**
```typescript
import { createFeedbackAuth, constructFeedbackAuthMessage } from '8004-solana-ts';
import * as nacl from 'tweetnacl';

// 1. Create feedbackAuth message
const feedbackAuth = createFeedbackAuth({
  agentId,
  clientAddress: client.publicKey,
  indexLimit: 10,
  expiryDuration: 3600, // 1 hour
  chainId: 'solana-devnet',
  identityRegistry: identityProgramId,
  signerAddress: agentOwner.publicKey,
});

// 2. Sign the message (agent owner must sign)
const message = constructFeedbackAuthMessage(feedbackAuth);
const signature = nacl.sign.detached(message, agentOwnerKeypair.secretKey);
feedbackAuth.signature = signature;

// 3. Submit feedback with auth
await reputationProgram.methods
  .giveFeedback(
    agentId,
    score,
    tag1,
    tag2,
    fileUri,
    fileHash,
    feedbackIndex,
    feedbackAuth  // NEW REQUIRED PARAMETER
  )
  .accounts({ /* ... */ })
  .rpc();
```

**Migration Steps:**
1. Import `createFeedbackAuth` and `constructFeedbackAuthMessage`
2. Generate feedbackAuth before each feedback submission
3. Have agent owner sign the auth message
4. Pass feedbackAuth as the 8th parameter to `giveFeedback`

**Why This Change:**
- **Spam Prevention**: Prevents unlimited spam feedbacks
- **ERC-8004 Conformity**: Aligns with spec requirement for authorization
- **Access Control**: Only authorized clients can submit feedback

---

#### 2. **FeedbackAuth Interface Added**

New interface exported from the SDK:

```typescript
export interface FeedbackAuth {
  agentId: AgentId;
  clientAddress: Address;
  indexLimit: number;
  expiry: number;
  chainId: string;
  identityRegistry: Address;
  signerAddress: Address;
  signature: Uint8Array;
}
```

**Impact:** No breaking change, but new type must be used for feedbackAuth parameter.

---

#### 3. **New Helper Functions**

Three new exported functions for feedbackAuth management:

```typescript
// Create a feedbackAuth object
export function createFeedbackAuth(options: CreateFeedbackAuthOptions): FeedbackAuth;

// Construct message to be signed
export function constructFeedbackAuthMessage(auth: Omit<FeedbackAuth, 'signature' | 'signerAddress'>): Uint8Array;

// Validate feedbackAuth is still valid
export function isFeedbackAuthValid(auth: FeedbackAuth): boolean;

// Get time remaining until expiry
export function getFeedbackAuthTimeRemaining(auth: FeedbackAuth): number;

// Check if client can still submit
export function canSubmitFeedback(auth: FeedbackAuth, currentIndex: number): boolean;
```

**Impact:** No breaking change, these are additive.

---

### Minor Changes

#### Reputation Program State Changes

**New Error Codes:**
- `FeedbackAuthClientMismatch`: Client address doesn't match auth
- `FeedbackAuthExpired`: Auth has expired
- `FeedbackAuthIndexLimitExceeded`: Client exceeded feedback limit
- `InvalidFeedbackAuthSignature`: Signature verification failed
- `UnauthorizedSigner`: Signer is not agent owner

**Program Account Changes:**
- No changes to existing account structures
- FeedbackAuth is passed as instruction parameter (not stored on-chain)

---

### Backward Compatibility

**⚠️ NO BACKWARD COMPATIBILITY**

Version 2.0.0 programs are **NOT compatible** with v1.x SDK calls. All feedback submissions must include feedbackAuth.

**Deployment Strategy:**
1. Deploy new programs to devnet/mainnet
2. Update all client applications to v2.0 SDK
3. Coordinate cutover to prevent failures

---

### Migration Checklist

- [ ] Update SDK package: `npm install 8004-solana-ts@^2.0.0`
- [ ] Import feedbackAuth helpers
- [ ] Implement auth generation in feedback submission flow
- [ ] Add Ed25519 signing capability (using `tweetnacl` or `@solana/web3.js`)
- [ ] Update agent owner to pre-authorize clients
- [ ] Test feedbackAuth expiry handling (default: 1 hour)
- [ ] Update error handling for new auth errors
- [ ] Redeploy programs to target networks
- [ ] Test end-to-end feedback submission

---

### Testing Breaking Changes

SDK includes comprehensive tests in:
- `tests/reputation-feedbackauth.ts` - 8 tests covering auth scenarios
- `tests/security-critical.ts` - 12 security tests
- `tests/concurrency-tests.ts` - 7 concurrency tests

Run tests:
```bash
cd 8004-solana
anchor test
```

---

### Support & Questions

- **GitHub Issues**: https://github.com/QuantumAgentic/erc8004-solana/issues
- **Spec Reference**: ERC-8004 Trustless Agent Registry Specification
- **Migration Support**: See `docs/migration-v2.md` (when available)

---

### Version Compatibility Matrix

| SDK Version | Program Version | Compatible |
|-------------|----------------|------------|
| 1.x         | 1.x            | ✅ Yes     |
| 2.x         | 1.x            | ❌ No      |
| 1.x         | 2.x            | ❌ No      |
| 2.x         | 2.x            | ✅ Yes     |

---

### Deprecation Timeline

- **v1.x Support**: Ends 2025-03-31
- **v2.0 Release**: 2025-01-XX
- **Migration Period**: 90 days

---

## Previous Versions

### Version 1.0.0
- Initial release
- Basic agent registration
- Reputation feedback (no auth required)
- Validation registry
- Metadata extensions
