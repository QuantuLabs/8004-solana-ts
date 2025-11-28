import { Connection, PublicKey } from '@solana/web3.js';
import { PDAHelpers } from './src/core/pda-helpers.js';
import { RegistryConfig } from './src/core/borsh-schemas.js';

const PROGRAM_ID = new PublicKey('5euA2SjKFduF6FvXJuJdyqEo6ViAHMrw54CJB5PLaEJn');

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  console.log('\n' + '='.repeat(80));
  console.log('  Vérification de la Registry Config');
  console.log('='.repeat(80) + '\n');

  console.log(`Program ID: ${PROGRAM_ID.toBase58()}`);

  // Dériver le PDA config
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    PROGRAM_ID
  );

  console.log(`Config PDA: ${configPDA.toBase58()}\n`);

  // Lire le compte
  const accountInfo = await connection.getAccountInfo(configPDA);

  if (!accountInfo) {
    console.log('❌ Registry Config NON TROUVÉE!');
    console.log('   Le programme n\'a peut-être pas été initialisé sur devnet.\n');
    return;
  }

  console.log('✅ Registry Config trouvée');
  console.log(`   Taille: ${accountInfo.data.length} bytes`);
  console.log(`   Owner: ${accountInfo.owner.toBase58()}\n`);

  // Désérialiser
  try {
    const config = RegistryConfig.deserialize(accountInfo.data);

    console.log('📋 Configuration:');
    console.log(`   Authority: ${config.getAuthorityPublicKey().toBase58()}`);
    console.log(`   Next Agent ID: ${config.next_agent_id}`);
    console.log(`   Total Agents: ${config.total_agents}`);
    console.log(`   Collection Mint: ${config.getCollectionMintPublicKey().toBase58()}`);
    console.log(`   Bump: ${config.bump}\n`);

    // Vérifier si c'est le bon collection mint
    const actualCollectionMint = '2DoG7HY8a7Pu4fWLtDvoAXbAthqTZYgqg4uxHyjYtous';
    const configCollectionMint = config.getCollectionMintPublicKey().toBase58();

    console.log('='.repeat(80));
    if (configCollectionMint === actualCollectionMint) {
      console.log('✅✅✅ COLLECTION MINT CORRECTE!');
      console.log(`   La collection dans la config correspond aux agents créés.`);
    } else {
      console.log('❌ MISMATCH!');
      console.log(`   Config collection: ${configCollectionMint}`);
      console.log(`   Agent collection:  ${actualCollectionMint}`);
    }
    console.log('='.repeat(80) + '\n');

  } catch (error: any) {
    console.error(`❌ Erreur lors de la désérialisation: ${error.message}`);
  }
}

main().catch(console.error);
