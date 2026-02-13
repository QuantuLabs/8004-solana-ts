import { Connection, PublicKey } from '@solana/web3.js';

function resolveHeliusDevnetUrl(): string | null {
  const explicit = process.env.HELIUS_DAS_URL || process.env.HELIUS_DEVNET_URL;
  if (explicit) return explicit;

  const key = process.env.HELIUS_API_KEY;
  if (!key) return null;

  return `https://devnet.helius-rpc.com/?api-key=${key}`;
}

async function main() {
  const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
  const NEW_COLLECTION = new PublicKey('2KmHw8VbShuz9xfj3ecEjBM5nPKR5BcYHRDSFfK1286t');

  console.log('🔍 Checking new collection on-chain...
');

  // Check collection exists
  const collectionInfo = await connection.getAccountInfo(NEW_COLLECTION);
  if (collectionInfo) {
    console.log('✅ Collection exists on-chain');
    console.log('  Address:', NEW_COLLECTION.toBase58());
    console.log('  Owner:', collectionInfo.owner.toBase58());
    console.log('  Data length:', collectionInfo.data.length);
  } else {
    console.log('❌ Collection NOT found on-chain');
    return;
  }

  // Search for assets in this collection using Metaplex DAS API (Helius)
  console.log('
📊 Searching for assets in collection via DAS API...');

  const heliusUrl = resolveHeliusDevnetUrl();
  if (!heliusUrl) {
    console.error('Missing HELIUS_DEVNET_URL or HELIUS_API_KEY (required for DAS API getAssetsByGroup).');
    process.exit(1);
  }

  try {
    const response = await fetch(heliusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'my-id',
        method: 'getAssetsByGroup',
        params: {
          groupKey: 'collection',
          groupValue: NEW_COLLECTION.toBase58(),
          page: 1,
          limit: 100
        }
      })
    });

    const data = await response.json();
    if (data.result && data.result.items) {
      console.log(`
✅ Found ${data.result.items.length} agents in collection:
`);
      for (const item of data.result.items) {
        console.log(`  - ${item.id}`);
        console.log(`    Name: ${item.content?.metadata?.name || 'N/A'}`);
        console.log(`    Owner: ${item.ownership?.owner || 'N/A'}`);
        console.log('');
      }
    } else {
      console.log('No assets found or DAS error:', data.error || 'unknown');
    }
  } catch (err) {
    console.error('DAS API error:', err);
  }
}

main().catch(console.error);
