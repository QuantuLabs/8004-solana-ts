# Collection Guide

Collection metadata is off-chain (IPFS JSON).  
Collection and parent associations are on-chain fields in `AgentAccount`.

## 1. Create Collection Metadata (CID-first)

```typescript
const collectionInput = {
  name: 'CasterCorp Agents',
  symbol: 'CAST',
  description: 'Main collection metadata',
  image: 'ipfs://QmCollectionImage...',
  banner_image: 'ipfs://QmCollectionBanner...',
  socials: {
    website: 'https://castercorp.ai',
    x: 'https://x.com/castercorp',
    discord: 'https://discord.gg/castercorp',
  },
};

// JSON only (no upload)
const data = sdk.createCollectionData(collectionInput);

// Build + upload
const upload = await sdk.createCollection(collectionInput);
// upload.pointer -> canonical c1:... pointer
```

## 2. Attach Collection Pointer

You can attach the pointer in two ways.

```typescript
// A) One flow: register + attach pointer
await sdk.registerAgent(agentUri, undefined, {
  collectionPointer: upload.pointer!,
});

// B) Separate flow: attach after registration
await sdk.setCollectionPointer(asset, upload.pointer!); // lock=true by default
```

### Pointer Constraints (on-chain)

- Must start with `c1:`
- Payload must be non-empty
- Lowercase letters and digits only after prefix
- Maximum total length: `128` bytes

### Pointer Lock Rules

- `setCollectionPointer(asset, pointer, { lock? })`
- Signer must match immutable `AgentAccount.creator`
- `lock` defaults to `true`
- First successful write with `lock=true` makes `col` immutable (`col_locked=true`)

Editable workflow:

```typescript
await sdk.setCollectionPointer(asset, upload.pointer!, { lock: false });
// ...later finalize:
await sdk.setCollectionPointer(asset, upload.pointer!); // lock=true
```

## 3. Parent Association

```typescript
await sdk.setParentAsset(childAsset, parentAsset); // lock=true by default
```

### Parent Rules (on-chain)

- Signer must be current owner of the child asset
- Signer must equal parent agent creator snapshot
- Parent must exist/live
- `child !== parent`
- `parent_locked` follows same semantics as `col_locked`

Editable workflow:

```typescript
await sdk.setParentAsset(childAsset, parentAsset, { lock: false });
// ...later finalize:
await sdk.setParentAsset(childAsset, parentAsset); // lock=true
```

## 4. Read Back Fields

`loadAgent(asset)` exposes:

- `creator`
- `creators` (compat alias)
- `col`
- `parent_asset`
- `col_locked`
- `parent_locked`

## 5. Pointer vs Pubkey

- `col` (`c1:...`) is a string pointer stored on-chain in `AgentAccount`
- Base registry collection pubkey is an internal program account
- Standard `setAgentUri()` and `transferAgent()` calls auto-resolve base registry pubkey
