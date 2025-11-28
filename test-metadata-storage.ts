import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { SolanaSDK } from './src/core/sdk-solana.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Script de test pour vérifier que les métadonnées sont bien stockées on-chain
 * Après fix du discriminator registerWithMetadata
 */
async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  Test de stockage des métadonnées on-chain');
  console.log('='.repeat(80) + '\n');

  // Charger le keypair
  const keypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  // Initialiser le SDK
  const sdk = new SolanaSDK({
    cluster: 'devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    signer,
  });

  console.log(`🔑 Signer: ${signer.publicKey.toBase58()}\n`);

  // Créer un agent avec métadonnées
  console.log('📝 Création d\'un agent avec 3 métadonnées...\n');

  const testMetadata = [
    { key: 'name', value: 'TestAgent_Fixed' },
    { key: 'version', value: '1.0.0' },
    { key: 'type', value: 'test' },
  ];

  try {
    const result = await sdk.registerAgent(
      'https://example.com/agent-test-fixed.json',
      testMetadata
    );

    console.log(`✅ Agent créé avec succès!`);
    console.log(`   Agent ID: ${result.agentId}`);
    console.log(`   Agent Mint: ${result.agentMint}`);
    console.log(`   Transaction: ${result.signature}\n`);

    // Attendre un peu pour que la transaction soit confirmée
    console.log('⏳ Attente de la confirmation...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Lire le PDA pour vérifier les métadonnées
    console.log(`📖 Lecture du PDA pour Agent #${result.agentId}...\n`);

    const agentData = await sdk.loadAgent(result.agentId);

    if (!agentData) {
      console.log('❌ Agent non trouvé après création!\n');
      return;
    }

    console.log('✅ Agent chargé avec succès!\n');
    console.log('📋 Données Agent:');
    console.log(`   Agent ID: ${agentData.agent_id}`);
    console.log(`   Agent Mint: ${new PublicKey(agentData.agent_mint).toBase58()}`);
    console.log(`   Owner: ${new PublicKey(agentData.owner).toBase58()}`);
    console.log(`   Token URI: ${agentData.token_uri || '(aucun)'}`);
    console.log(`   NFT Name: ${agentData.nft_name}`);
    console.log(`   NFT Symbol: ${agentData.nft_symbol}`);
    console.log(`   Metadata Count: ${agentData.metadata.length}\n`);

    // Vérifier les métadonnées
    if (agentData.metadata.length === 0) {
      console.log('❌ ÉCHEC: Les métadonnées ne sont PAS stockées (metadata_count = 0)');
      console.log('   Le fix du discriminator n\'a pas fonctionné.\n');
    } else if (agentData.metadata.length === testMetadata.length) {
      console.log(`✅ SUCCÈS: Les métadonnées sont stockées! (${agentData.metadata.length} entrées)\n`);
      console.log('🏷️  Métadonnées on-chain:');

      for (let i = 0; i < agentData.metadata.length; i++) {
        const entry = agentData.metadata[i];
        const valueStr = entry.getValueString ? entry.getValueString() : Buffer.from(entry.value).toString('utf8');
        console.log(`   ${i + 1}. "${entry.key}" = "${valueStr}"`);
      }

      console.log('\n✅ Le fix du discriminator fonctionne correctement!\n');
    } else {
      console.log(`⚠️  PARTIEL: ${agentData.metadata.length} métadonnées stockées, ${testMetadata.length} attendues\n`);
    }

  } catch (error: any) {
    console.error(`❌ Erreur: ${error.message}`);
    console.error(`   Stack: ${error.stack}\n`);
  }

  console.log('='.repeat(80));
  console.log('  Test terminé');
  console.log('='.repeat(80) + '\n');
}

main().catch(console.error);
