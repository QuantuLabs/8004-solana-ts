# Signer Configuration - Quick Reference

## Summary
The SDK now supports **two methods** for configuring signers:

### 1. Private Key String (Original Method) ✅
```typescript
const sdk = new SDK({
  chainId: 11155111,
  rpcUrl: 'https://sepolia.infura.io/v3/YOUR_KEY',
  signer: '0x1234...', // Private key as string
});
```

### 2. Ethers Wallet/Signer Object (New Method) ✅
```typescript
import { ethers } from 'ethers';

// Option A: Wallet object
const wallet = new ethers.Wallet('0x1234...');
const sdk = new SDK({
  chainId: 11155111,
  rpcUrl: 'https://sepolia.infura.io/v3/YOUR_KEY',
  signer: wallet, // Wallet object
});

// Option B: Connected signer (e.g., MetaMask)
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const sdk = new SDK({
  chainId: 11155111,
  rpcUrl: 'https://sepolia.infura.io/v3/YOUR_KEY',
  signer: signer, // Signer object
});
```

## Type Definition
```typescript
export interface SDKConfig {
  chainId: ChainId;
  rpcUrl: string;
  signer?: string | ethers.Wallet | ethers.Signer; // 3 options
  // ... other config
}
```

## Files Modified
1. **src/core/sdk.ts** - Updated SDKConfig interface
2. **src/core/web3-client.ts** - Updated constructor to handle both methods
3. **examples/signer-methods.ts** - New comprehensive example (NEW)
4. **SIGNER_IMPLEMENTATION.md** - Deep technical documentation (NEW)

## Backward Compatibility
✅ **100% Backward Compatible** - All existing code using private key strings continues to work unchanged.

## Usage in Examples
See `examples/signer-methods.ts` for complete usage examples of all methods.

## Technical Details
For deep technical analysis, see `SIGNER_IMPLEMENTATION.md`.
