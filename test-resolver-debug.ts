import { Connection, PublicKey } from '@solana/web3.js';
import { AgentMintResolver } from './src/core/agent-mint-resolver.js';

const COLLECTION_MINT = new PublicKey('2DoG7HY8a7Pu4fWLtDvoAXbAthqTZYgqg4uxHyjYtous');

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  console.log('\n=== Test AgentMintResolver avec debug ===\n');

  const resolver = new AgentMintResolver(connection, COLLECTION_MINT);

  console.log('Tentative de résolution de Agent #4...\n');

  try {
    const mint = await resolver.resolve(BigInt(4));
    console.log(`✅ SUCCESS! Trouvé mint: ${mint.toBase58()}`);
  } catch (error: any) {
    console.log(`❌ ERREUR: ${error.message}\n`);

    // Créons une version debug du resolver
    console.log('Debug: Vérification manuelle...\n');

    const METAPLEX_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
    const targetName = 'Agent #4';

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

    console.log(`Comptes trouvés: ${accounts.length}`);

    for (const account of accounts) {
      try {
        const data = account.account.data;

        // Parse mint
        const mint = new PublicKey(data.slice(33, 65));

        // Parse name
        const nameLength = data.readUInt32LE(65);
        const nameBytes = data.slice(69, 69 + nameLength);
        const name = nameBytes.toString('utf8');

        const nameTrimmed = name.trim();

        console.log(`\nCompte: ${account.pubkey.toBase58()}`);
        console.log(`  Mint: ${mint.toBase58()}`);
        console.log(`  Name brut: "${name}" (length: ${name.length})`);
        console.log(`  Name trimé: "${nameTrimmed}" (length: ${nameTrimmed.length})`);
        console.log(`  Target: "${targetName}" (length: ${targetName.length})`);
        console.log(`  Match: ${nameTrimmed === targetName ? 'TRUE ✅' : 'FALSE ❌'}`);

        // Character-by-character comparison
        if (nameTrimmed !== targetName) {
          console.log('  Debug caractères:');
          console.log(`    nameTrimmed bytes: ${Buffer.from(nameTrimmed).toString('hex')}`);
          console.log(`    targetName bytes:  ${Buffer.from(targetName).toString('hex')}`);
        }

      } catch (parseError) {
        console.log(`\nErreur parsing compte: ${parseError}`);
      }
    }
  }
}

main().catch(console.error);
