import { Connection, PublicKey } from '@solana/web3.js';
import { getMetadataPDA } from './src/core/metaplex-helpers.js';

const COLLECTION_MINT = new PublicKey('9Bz4ksNbUPPuUh3pdjKBWJP8b9bVT62Y8X77DnqMwJfv');

const agentMints = [
  { id: 4, mint: '57FHmtxFj8dwce7Pf28E2iLKPXJqqfydxFtZiWKyfDAn' },
  { id: 5, mint: 'APjRhQEUgYfoBBwoLG7CB94UjHfsWKXgDSqVyzChPcj4' },
];

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  console.log('\n' + '='.repeat(80));
  console.log('  Vérification Collection des Agents NFT');
  console.log('='.repeat(80));
  console.log(`\nCollection attendue: ${COLLECTION_MINT.toBase58()}\n`);

  for (const { id, mint } of agentMints) {
    console.log('='.repeat(80));
    console.log(`Agent #${id} - Mint: ${mint}`);
    console.log('='.repeat(80));

    const mintPubkey = new PublicKey(mint);
    const metadataPDA = getMetadataPDA(mintPubkey);

    console.log(`Metadata PDA: ${metadataPDA.toBase58()}`);

    const accountInfo = await connection.getAccountInfo(metadataPDA);

    if (!accountInfo) {
      console.log('❌ Métadonnées NON TROUVÉES\n');
      continue;
    }

    console.log(`✅ Métadonnées trouvées (${accountInfo.data.length} bytes)`);
    console.log(`Owner: ${accountInfo.owner.toBase58()}`);

    const data = accountInfo.data;

    // Parse metadata structure
    console.log('\n--- Structure des Métadonnées ---');

    // Key (1 byte)
    console.log(`[0] Key: ${data[0]}`);

    // Update Authority (32 bytes)
    const updateAuthority = new PublicKey(data.slice(1, 33));
    console.log(`[1-32] Update Authority: ${updateAuthority.toBase58()}`);

    // Mint (32 bytes)
    const metadataMint = new PublicKey(data.slice(33, 65));
    console.log(`[33-64] Mint: ${metadataMint.toBase58()}`);

    // Name
    const nameLength = data.readUInt32LE(65);
    const nameBytes = data.slice(69, 69 + nameLength);
    const name = nameBytes.toString('utf8').trim();
    console.log(`[65-68] Name Length: ${nameLength}`);
    console.log(`[69-${69 + nameLength - 1}] Name: "${name}"`);

    // Symbol
    const symbolOffset = 69 + nameLength;
    const symbolLength = data.readUInt32LE(symbolOffset);
    const symbolBytes = data.slice(symbolOffset + 4, symbolOffset + 4 + symbolLength);
    const symbol = symbolBytes.toString('utf8').trim();
    console.log(`[${symbolOffset}-${symbolOffset + 3}] Symbol Length: ${symbolLength}`);
    console.log(`[${symbolOffset + 4}-${symbolOffset + 4 + symbolLength - 1}] Symbol: "${symbol}"`);

    // URI
    const uriOffset = symbolOffset + 4 + symbolLength;
    const uriLength = data.readUInt32LE(uriOffset);
    const uriBytes = data.slice(uriOffset + 4, uriOffset + 4 + uriLength);
    const uri = uriBytes.toString('utf8').trim();
    console.log(`[${uriOffset}-${uriOffset + 3}] URI Length: ${uriLength}`);
    console.log(`[${uriOffset + 4}-${uriOffset + 4 + uriLength - 1}] URI: "${uri}"`);

    // Seller Fee Basis Points (2 bytes)
    const sellerFeeOffset = uriOffset + 4 + uriLength;
    const sellerFeeBasisPoints = data.readUInt16LE(sellerFeeOffset);
    console.log(`[${sellerFeeOffset}-${sellerFeeOffset + 1}] Seller Fee: ${sellerFeeBasisPoints} basis points`);

    // Creators (Option<Vec<Creator>>)
    let creatorsOffset = sellerFeeOffset + 2;
    const hasCreators = data[creatorsOffset];
    console.log(`[${creatorsOffset}] Has Creators: ${hasCreators}`);

    creatorsOffset++;
    let creatorsEndOffset = creatorsOffset;

    if (hasCreators === 1) {
      const creatorsCount = data.readUInt32LE(creatorsOffset);
      console.log(`[${creatorsOffset}-${creatorsOffset + 3}] Creators Count: ${creatorsCount}`);
      creatorsOffset += 4;

      // Each creator is 34 bytes (32 bytes address + 1 byte verified + 1 byte share)
      for (let i = 0; i < creatorsCount; i++) {
        const creatorAddress = new PublicKey(data.slice(creatorsOffset, creatorsOffset + 32));
        const verified = data[creatorsOffset + 32];
        const share = data[creatorsOffset + 33];
        console.log(`  Creator ${i + 1}: ${creatorAddress.toBase58()} (verified: ${verified}, share: ${share}%)`);
        creatorsOffset += 34;
      }
      creatorsEndOffset = creatorsOffset;
    }

    // Primary Sale Happened (1 byte)
    const primarySaleHappened = data[creatorsEndOffset];
    console.log(`[${creatorsEndOffset}] Primary Sale Happened: ${primarySaleHappened}`);

    // Is Mutable (1 byte)
    const isMutable = data[creatorsEndOffset + 1];
    console.log(`[${creatorsEndOffset + 1}] Is Mutable: ${isMutable}`);

    // Edition Nonce (Option<u8>)
    let editionNonceOffset = creatorsEndOffset + 2;
    const hasEditionNonce = data[editionNonceOffset];
    console.log(`[${editionNonceOffset}] Has Edition Nonce: ${hasEditionNonce}`);

    editionNonceOffset++;
    if (hasEditionNonce === 1) {
      const editionNonce = data[editionNonceOffset];
      console.log(`[${editionNonceOffset}] Edition Nonce: ${editionNonce}`);
      editionNonceOffset++;
    }

    // Token Standard (Option<TokenStandard>)
    const hasTokenStandard = data[editionNonceOffset];
    console.log(`[${editionNonceOffset}] Has Token Standard: ${hasTokenStandard}`);

    let tokenStandardOffset = editionNonceOffset + 1;
    if (hasTokenStandard === 1) {
      const tokenStandard = data[tokenStandardOffset];
      const standards = ['NonFungible', 'FungibleAsset', 'Fungible', 'NonFungibleEdition'];
      console.log(`[${tokenStandardOffset}] Token Standard: ${standards[tokenStandard] || tokenStandard}`);
      tokenStandardOffset++;
    }

    // Collection (Option<Collection>)
    const hasCollection = data[tokenStandardOffset];
    console.log(`\n[${tokenStandardOffset}] Has Collection: ${hasCollection}`);

    if (hasCollection === 1) {
      const collectionOffset = tokenStandardOffset + 1;

      // Collection.verified (1 byte bool)
      const collectionVerified = data[collectionOffset];
      console.log(`[${collectionOffset}] Collection Verified: ${collectionVerified === 1 ? 'TRUE ✅' : 'FALSE ❌'}`);

      // Collection.key (32 bytes Pubkey)
      const collectionKey = new PublicKey(data.slice(collectionOffset + 1, collectionOffset + 33));
      console.log(`[${collectionOffset + 1}-${collectionOffset + 32}] Collection Key: ${collectionKey.toBase58()}`);

      // Check if matches expected collection
      if (collectionKey.equals(COLLECTION_MINT)) {
        console.log('\n✅✅✅ COLLECTION CORRECTE! ✅✅✅');
        if (collectionVerified === 1) {
          console.log('✅ Collection VÉRIFIÉE');
        } else {
          console.log('⚠️  Collection NON VÉRIFIÉE (verified = false)');
        }
      } else {
        console.log(`\n❌ COLLECTION INCORRECTE!`);
        console.log(`   Attendue: ${COLLECTION_MINT.toBase58()}`);
        console.log(`   Trouvée:  ${collectionKey.toBase58()}`);
      }

      console.log(`\n📍 OFFSET de la collection key: ${collectionOffset + 1}`);
      console.log(`   (L'offset ${collectionOffset + 1} devrait être utilisé pour le filtre memcmp)`);

    } else {
      console.log('\n❌❌❌ PAS DE COLLECTION! ❌❌❌');
      console.log(`   L'agent n'est pas assigné à une collection`);
    }

    console.log('\n');
  }
}

main().catch(console.error);
