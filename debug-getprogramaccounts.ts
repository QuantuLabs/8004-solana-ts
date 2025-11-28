import { Connection, PublicKey } from '@solana/web3.js';

const METAPLEX_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const COLLECTION_MINT = new PublicKey('9Bz4ksNbUPPuUh3pdjKBWJP8b9bVT62Y8X77DnqMwJfv');

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  console.log('\n=== Debug getProgramAccounts ===\n');
  console.log(`Metaplex Program ID: ${METAPLEX_PROGRAM_ID.toBase58()}`);
  console.log(`Collection Mint: ${COLLECTION_MINT.toBase58()}\n`);

  // Test 1: No filters (get ALL Metaplex metadata - will be huge but let's see)
  console.log('Test 1: Query ALL Metaplex metadata (no filters)...');
  try {
    const allAccounts = await connection.getProgramAccounts(METAPLEX_PROGRAM_ID, {
      dataSlice: { offset: 0, length: 0 }, // Don't fetch data, just count
    });
    console.log(`✅ Found ${allAccounts.length} total Metaplex metadata accounts\n`);
  } catch (e: any) {
    console.log(`❌ Error: ${e.message}\n`);
  }

  // Test 2: With collection filter
  console.log('Test 2: Query with collection filter (offset 326)...');
  try {
    const filteredAccounts = await connection.getProgramAccounts(METAPLEX_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 326,
            bytes: COLLECTION_MINT.toBase58(),
          },
        },
      ],
    });
    console.log(`✅ Found ${filteredAccounts.length} accounts with collection filter`);

    if (filteredAccounts.length > 0) {
      console.log('\nFirst account details:');
      console.log(`  Pubkey: ${filteredAccounts[0].pubkey.toBase58()}`);
      console.log(`  Data size: ${filteredAccounts[0].account.data.length} bytes`);
      console.log(`  Owner: ${filteredAccounts[0].account.owner.toBase58()}`);

      // Try to parse name
      try {
        const data = filteredAccounts[0].account.data;
        const nameLength = data.readUInt32LE(65);
        const nameBytes = data.slice(69, 69 + nameLength);
        const name = nameBytes.toString('utf8');
        console.log(`  Name: "${name}"`);
      } catch (e) {
        console.log(`  Could not parse name`);
      }
    }
  } catch (e: any) {
    console.log(`❌ Error: ${e.message}\n`);
  }

  // Test 3: Check if the offset is correct
  console.log('\n\nTest 3: Manually check metadata account structure...');
  const agentMint = new PublicKey('57FHmtxFj8dwce7Pf28E2iLKPXJqqfydxFtZiWKyfDAn');
  const metadataPDA = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      METAPLEX_PROGRAM_ID.toBuffer(),
      agentMint.toBuffer(),
    ],
    METAPLEX_PROGRAM_ID
  )[0];

  console.log(`Agent #4 Mint: ${agentMint.toBase58()}`);
  console.log(`Metadata PDA: ${metadataPDA.toBase58()}`);

  const accountInfo = await connection.getAccountInfo(metadataPDA);
  if (!accountInfo) {
    console.log('❌ Metadata account not found!');
    return;
  }

  console.log(`✅ Metadata account found (${accountInfo.data.length} bytes)`);

  // Dump the structure
  const data = accountInfo.data;

  console.log('\nAccount structure:');
  console.log(`  [0] Key: ${data[0]}`);
  console.log(`  [1-32] Update Authority: ${new PublicKey(data.slice(1, 33)).toBase58()}`);
  console.log(`  [33-64] Mint: ${new PublicKey(data.slice(33, 65)).toBase58()}`);

  const nameLength = data.readUInt32LE(65);
  const nameBytes = data.slice(69, 69 + nameLength);
  const name = nameBytes.toString('utf8');
  console.log(`  [65-68] Name Length: ${nameLength}`);
  console.log(`  [69-${69 + nameLength - 1}] Name: "${name}"`);

  const symbolOffset = 69 + nameLength;
  const symbolLength = data.readUInt32LE(symbolOffset);
  console.log(`  [${symbolOffset}-${symbolOffset + 3}] Symbol Length: ${symbolLength}`);

  const uriOffset = symbolOffset + 4 + symbolLength;
  const uriLength = data.readUInt32LE(uriOffset);
  console.log(`  [${uriOffset}-${uriOffset + 3}] URI Length: ${uriLength}`);

  // Find collection field
  // After uri comes: seller_fee_basis_points (2 bytes), creators (optional Vec), ...
  // Collection is further down. Let's search for it.

  console.log('\n\nSearching for collection mint in data...');
  const collectionMintBuffer = COLLECTION_MINT.toBuffer();

  for (let i = 0; i < data.length - 32; i++) {
    if (data.slice(i, i + 32).equals(collectionMintBuffer)) {
      console.log(`✅ Found collection mint at offset ${i}`);
      console.log(`   (Not at offset 326 as expected!)`);
    }
  }
}

main().catch(console.error);
