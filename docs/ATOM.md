# ATOM Guide

ATOM is the optional reputation engine layered on top of the base 8004 feedback flow.

Use it when you want:
- trust tiers
- ATOM quality/confidence stats
- enriched summaries that combine raw feedback and ATOM scoring

## Enable ATOM

Enable it during registration:

```typescript
await sdk.registerAgent('ipfs://QmAgentMetadata...', {
  atomEnabled: true,
});
```

Or enable it later:

```typescript
const targetAgent = agent.asset;

await sdk.enableAtom(targetAgent);
await sdk.initializeAtomStats(targetAgent);
```

`enableAtom()` is one-way for that agent.

## Read ATOM Data

```typescript
const targetAgent = agent.asset;

const stats = await sdk.getAtomStats(targetAgent);
const tier = await sdk.getTrustTier(targetAgent);
const enriched = await sdk.getEnrichedSummary(targetAgent);
```

## Notes

- For this release, the main async agent-scoped SDK surface is asset-pubkey-first.
- If you only have a backend sequential `agentId`, resolve it first with the indexer and then use the returned asset pubkey.
- For the full method signatures, use [METHODS.md](./METHODS.md).
