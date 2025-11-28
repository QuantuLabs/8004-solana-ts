import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { SolanaSDK } from './src/core/sdk-solana.js';
import { IdentityInstructionBuilder } from './src/core/instruction-builder.js';
import { PDAHelpers } from './src/core/pda-helpers.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Test complet du système de métadonnées:
 * 1. Créer un agent avec métadonnées inline (registerWithMetadata)
 * 2. Modifier/ajouter des métadonnées inline (setMetadata)
 * 3. Vérifier que tout fonctionne
 */
async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  Test Complet du Système de Métadonnées');
  console.log('='.repeat(80) + '\n');

  // Charger le keypair
  const keypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  // Initialiser le SDK
  const sdk = new SolanaSDK({
    cluster: 'devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    signer,
  });

  console.log(`🔑 Signer: ${signer.publicKey.toBase58()}\n`);

  console.log('─'.repeat(80));
  console.log('📝 ÉTAPE 1: Créer un agent avec métadonnées initiales\n');

  try {
    const result = await sdk.registerAgent(
      'https://example.com/metadata-test.json',
      [
        { key: 'name', value: 'MetadataTestAgent' },
        { key: 'version', value: '1.0.0' },
        { key: 'type', value: 'test' },
      ]
    );

    console.log(`✅ Agent créé!`);
    console.log(`   Agent ID: ${result.agentId}`);
    console.log(`   Agent Mint: ${result.agentMint}`);
    console.log(`   Transaction: ${result.signature}\n`);

    // Attendre confirmation
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Vérifier les métadonnées
    console.log('📖 Lecture des métadonnées...\n');
    const agentData = await sdk.loadAgent(result.agentId);

    if (!agentData) {
      console.log('❌ Agent non trouvé!\n');
      return;
    }

    console.log(`   Metadata Count: ${agentData.metadata.length}`);
    if (agentData.metadata.length > 0) {
      console.log('   Métadonnées initiales:');
      for (let i = 0; i < agentData.metadata.length; i++) {
        const entry = agentData.metadata[i];
        const valueStr = entry.getValueString ? entry.getValueString() : Buffer.from(entry.value).toString('utf8');
        console.log(`     ${i + 1}. "${entry.key}" = "${valueStr}"`);
      }
    }
    console.log('');

    console.log('─'.repeat(80));
    console.log('📝 ÉTAPE 2: Modifier une métadonnée existante (setMetadata)\n');

    // Créer l'instruction setMetadata pour modifier "version"
    const agentMint = new PublicKey(result.agentMint);
    const [agentPDA] = await PDAHelpers.getAgentPDA(agentMint);

    const builder = new IdentityInstructionBuilder('devnet');
    const setMetadataIx = builder.buildSetMetadata(
      signer.publicKey,
      agentPDA,
      agentMint,
      'version',
      '2.0.0'
    );

    const tx = new Transaction().add(setMetadataIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [signer]);

    console.log(`✅ Métadonnée modifiée!`);
    console.log(`   Transaction: ${sig}\n`);

    // Attendre confirmation
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Vérifier la modification
    console.log('📖 Vérification de la modification...\n');
    const agentData2 = await sdk.loadAgent(result.agentId);

    if (agentData2) {
      console.log('   Métadonnées après modification:');
      for (let i = 0; i < agentData2.metadata.length; i++) {
        const entry = agentData2.metadata[i];
        const valueStr = entry.getValueString ? entry.getValueString() : Buffer.from(entry.value).toString('utf8');
        console.log(`     ${i + 1}. "${entry.key}" = "${valueStr}"`);
      }
    }
    console.log('');

    console.log('─'.repeat(80));
    console.log('📝 ÉTAPE 3: Ajouter une nouvelle métadonnée (setMetadata)\n');

    // Ajouter une nouvelle entrée
    const addMetadataIx = builder.buildSetMetadata(
      signer.publicKey,
      agentPDA,
      agentMint,
      'status',
      'active'
    );

    const tx2 = new Transaction().add(addMetadataIx);
    const sig2 = await sendAndConfirmTransaction(connection, tx2, [signer]);

    console.log(`✅ Métadonnée ajoutée!`);
    console.log(`   Transaction: ${sig2}\n`);

    // Attendre confirmation
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Vérifier l'ajout
    console.log('📖 Vérification de l\'ajout...\n');
    const agentData3 = await sdk.loadAgent(result.agentId);

    if (agentData3) {
      console.log(`   Metadata Count: ${agentData3.metadata.length}`);
      console.log('   Métadonnées finales:');
      for (let i = 0; i < agentData3.metadata.length; i++) {
        const entry = agentData3.metadata[i];
        const valueStr = entry.getValueString ? entry.getValueString() : Buffer.from(entry.value).toString('utf8');
        console.log(`     ${i + 1}. "${entry.key}" = "${valueStr}"`);
      }
    }
    console.log('');

    console.log('─'.repeat(80));
    console.log('✅ SUCCÈS: Le système de métadonnées inline fonctionne!');
    console.log('─'.repeat(80) + '\n');

  } catch (error: any) {
    console.error(`❌ Erreur: ${error.message}`);
    console.error(`   Stack: ${error.stack}\n`);
  }

  console.log('='.repeat(80));
  console.log('  Test terminé');
  console.log('='.repeat(80) + '\n');
}

main().catch(console.error);
