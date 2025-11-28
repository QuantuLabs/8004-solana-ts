import { Connection, PublicKey } from '@solana/web3.js';

const METAPLEX_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const COLLECTION_MINT = new PublicKey('2DoG7HY8a7Pu4fWLtDvoAXbAthqTZYgqg4uxHyjYtous');

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  console.log('\n=== Test getProgramAccounts avec offset 330 ===\n');
  console.log(`Metaplex Program ID: ${METAPLEX_PROGRAM_ID.toBase58()}`);
  console.log(`Collection Mint: ${COLLECTION_MINT.toBase58()}\n`);

  console.log('Requête getProgramAccounts...');

  try {
    const accounts = await connection.getProgramAccounts(METAPLEX_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 330,
            bytes: COLLECTION_MINT.toBase58(),
          },
        },
      ],
    });

    console.log(`\n✅ Trouvé ${accounts.length} comptes avec collection filter à offset 330\n`);

    if (accounts.length > 0) {
      console.log('Premiers comptes:');
      accounts.slice(0, 5).forEach((account, idx) => {
        console.log(`  ${idx + 1}. ${account.pubkey.toBase58()} (${account.account.data.length} bytes)`);

        // Parse name
        try {
          const data = account.account.data;
          const nameLength = data.readUInt32LE(65);
          const nameBytes = data.slice(69, 69 + nameLength);
          const name = nameBytes.toString('utf8').trim();
          console.log(`     Name: "${name}"`);
        } catch (e) {
          console.log(`     Name: (parse error)`);
        }
      });
    } else {
      console.log('❌ AUCUN compte trouvé!');
      console.log('\nVérification: est-ce que l\'offset 330 correspond bien au collection.key?');
      console.log('Oui, selon notre analyse précédente:');
      console.log('  - [328]: Has Collection');
      console.log('  - [329]: Collection.verified');
      console.log('  - [330-361]: Collection.key');
    }

  } catch (error: any) {
    console.error(`\n❌ Erreur: ${error.message}`);
  }
}

main().catch(console.error);
