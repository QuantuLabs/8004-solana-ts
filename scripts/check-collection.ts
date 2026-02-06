import { Connection, PublicKey } from '@solana/web3.js';

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const PROGRAM_ID = new PublicKey('8oo48pya1SZD23ZhzoNMhxR2UGb8BRa41Su4qP9EuaWm');
  const MPL_CORE = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
  const NEW_COLLECTION = new PublicKey('2KmHw8VbShuz9xfj3ecEjBM5nPKR5BcYHRDSFfK1286t');

  console.log('🔍 Checking new collection on-chain...\n');

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

  // Search for assets in this collection using Metaplex DAS API
  console.log('\n📊 Searching for assets in collection via DAS API...');

  try {
    const response = await fetch('https://devnet.helius-rpc.com/?api-key=HELIUS_API_KEY_REDACTED', {
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
      console.log(`\n✅ Found ${data.result.items.length} agents in collection:\n`);
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
