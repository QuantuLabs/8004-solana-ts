# Collection Guide

This guide is only about the collection system used now:
- off-chain collection metadata JSON (typically IPFS)
- on-chain canonical collection pointer in `AgentAccount.col` (`c1:<cid_norm>`)

It does not describe legacy multi-registry creation flows.

## 1. Create Collection Metadata

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

// Build JSON only (no upload)
const metadata = sdk.createCollectionData(collectionInput);

// Build + upload to IPFS
const upload = await sdk.createCollection(collectionInput);
// upload.cid
// upload.uri      => ipfs://...
// upload.pointer  => c1:...
```

## 2. Attach a Collection Pointer to an Agent

Two supported flows:

```typescript
// A) Register + attach in one high-level flow
const result = await sdk.registerAgent(agentUri, {
  collectionPointer: upload.pointer!,
  collectionLock: true, // optional, defaults to true
});

// B) Attach after registration
await sdk.setCollectionPointer(result.asset!, upload.pointer!); // lock=true by default
```

## 3. Editable Then Finalize (Lock)

If you want to iterate first, set without lock, then finalize:

```typescript
await sdk.setCollectionPointer(asset, upload.pointer!, { lock: false });
// ...later
await sdk.setCollectionPointer(asset, upload.pointer!); // lock=true
```

Once locked, pointer changes are rejected on-chain.

## 4. Parent/Child Association (Optional)

```typescript
await sdk.setParentAsset(childAsset, parentAsset, { lock: false });
// ...later
await sdk.setParentAsset(childAsset, parentAsset); // lock=true
```

## 5. On-Chain Rules

- Pointer must be canonical `c1:<payload>`
- Pointer max size is `128` bytes
- Collection pointer writes require agent creator authority
- `col_locked=true` makes pointer immutable
- `parent_locked=true` makes parent association immutable

## 6. Read and Query

On-chain read:

```typescript
const agent = await sdk.loadAgent(asset);
console.log(agent.col); // canonical pointer (c1:...)
console.log(agent.isCollectionPointerLocked());
```

Indexer reads:

```typescript
const pointers = await sdk.getCollectionPointers({ creator: creatorPubkey });
const count = await sdk.getCollectionAssetCount(upload.pointer!);
const assets = await sdk.getCollectionAssets(upload.pointer!, { limit: 50 });
```
