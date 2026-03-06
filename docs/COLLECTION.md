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
const resultInline = await sdk.registerAgent(agentUri, {
  collectionPointer: upload.pointer!,
  collectionLock: true, // optional, defaults to true
});

// B) Attach after registration
const resultNoPointer = await sdk.registerAgent(agentUri);
await sdk.setCollectionPointer(resultNoPointer.asset!, upload.pointer!); // lock=true by default
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
const creator = creatorPubkey.toBase58();
const pointers = await sdk.getCollectionPointers({ creator });
const count = await sdk.getCollectionAssetCount(upload.pointer!, creator);
const assets = await sdk.getCollectionAssets(upload.pointer!, {
  creator,
  limit: 50,
});

// If you already have indexer sequential collection_id:
const byId = await sdk.getCollectionPointerById(7);
const countById = await sdk.getCollectionAssetCountById(7);
const assetsById = await sdk.getCollectionAssetsById(7, { limit: 50 });
```

A collection is unique only when the minting creator is the same and the collection pointer is the same.
`collection_id` helpers are fail-closed: invalid IDs throw, legacy schemas without `collection_id` support throw, and ambiguous ID resolution throws.

## 7. Decommission an Agent

If an agent must be retired, you can burn the Core asset:

```typescript
await sdk.burnAgent(asset); // irreversible
```

This burns the Core asset only; it does not close the registry `AgentAccount` PDA.
