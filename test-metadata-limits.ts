import { Keypair } from '@solana/web3.js';
import { SolanaSDK } from './src/core/sdk-solana.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Test des limites de métadonnées:
 * - 10 métadonnées (limite inline) → devrait passer
 * - 11+ métadonnées → devrait échouer (pas encore implémenté)
 */
async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  Test des Limites de Métadonnées');
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

  const createdAgents: bigint[] = [];

  // ============================================================================
  // TEST 1: Exactement 10 métadonnées (limite inline max)
  // ============================================================================
  console.log('─'.repeat(80));
  console.log('📝 TEST 1: Agent avec 10 métadonnées (limite max inline)\n');

  try {
    const metadata10 = [
      { key: 'meta1', value: 'value1' },
      { key: 'meta2', value: 'value2' },
      { key: 'meta3', value: 'value3' },
      { key: 'meta4', value: 'value4' },
      { key: 'meta5', value: 'value5' },
      { key: 'meta6', value: 'value6' },
      { key: 'meta7', value: 'value7' },
      { key: 'meta8', value: 'value8' },
      { key: 'meta9', value: 'value9' },
      { key: 'meta10', value: 'value10' },
    ];

    console.log(`   Nombre de métadonnées: ${metadata10.length}`);

    const result1 = await sdk.registerAgent(
      'https://example.com/agent-10-metadata.json',
      metadata10
    );

    console.log(`✅ Agent créé avec succès!`);
    console.log(`   Agent ID: ${result1.agentId}`);
    console.log(`   Agent Mint: ${result1.agentMint}`);
    console.log(`   Transaction: ${result1.signature}\n`);

    createdAgents.push(result1.agentId);

  } catch (error: any) {
    console.error(`❌ Erreur: ${error.message}`);
    console.error(`   ${error.stack}\n`);
  }

  // ============================================================================
  // TEST 2: 11 métadonnées (devrait échouer - pas implémenté)
  // ============================================================================
  console.log('─'.repeat(80));
  console.log('📝 TEST 2: Agent avec 11 métadonnées (devrait échouer)\n');

  try {
    const metadata11 = [
      { key: 'meta1', value: 'value1' },
      { key: 'meta2', value: 'value2' },
      { key: 'meta3', value: 'value3' },
      { key: 'meta4', value: 'value4' },
      { key: 'meta5', value: 'value5' },
      { key: 'meta6', value: 'value6' },
      { key: 'meta7', value: 'value7' },
      { key: 'meta8', value: 'value8' },
      { key: 'meta9', value: 'value9' },
      { key: 'meta10', value: 'value10' },
      { key: 'meta11', value: 'value11' },
    ];

    console.log(`   Nombre de métadonnées: ${metadata11.length}`);

    const result2 = await sdk.registerAgent(
      'https://example.com/agent-11-metadata.json',
      metadata11
    );

    console.log(`⚠️  ATTENTION: Agent créé alors qu'il ne devrait pas!`);
    console.log(`   Agent ID: ${result2.agentId}`);
    console.log(`   Agent Mint: ${result2.agentMint}\n`);

    createdAgents.push(result2.agentId);

  } catch (error: any) {
    console.log(`✅ Erreur attendue: ${error.message}\n`);
  }

  // ============================================================================
  // TEST 3: 5 métadonnées (normal)
  // ============================================================================
  console.log('─'.repeat(80));
  console.log('📝 TEST 3: Agent avec 5 métadonnées (normal)\n');

  try {
    const metadata5 = [
      { key: 'name', value: 'NormalAgent' },
      { key: 'version', value: '1.0' },
      { key: 'type', value: 'standard' },
      { key: 'status', value: 'active' },
      { key: 'tier', value: 'basic' },
    ];

    console.log(`   Nombre de métadonnées: ${metadata5.length}`);

    const result3 = await sdk.registerAgent(
      'https://example.com/agent-5-metadata.json',
      metadata5
    );

    console.log(`✅ Agent créé avec succès!`);
    console.log(`   Agent ID: ${result3.agentId}`);
    console.log(`   Agent Mint: ${result3.agentMint}`);
    console.log(`   Transaction: ${result3.signature}\n`);

    createdAgents.push(result3.agentId);

  } catch (error: any) {
    console.error(`❌ Erreur: ${error.message}\n`);
  }

  // ============================================================================
  // LECTURE DES AGENTS CRÉÉS
  // ============================================================================
  if (createdAgents.length > 0) {
    console.log('─'.repeat(80));
    console.log('📖 LECTURE DES AGENTS CRÉÉS\n');

    // Attendre un peu pour la confirmation
    console.log('⏳ Attente de confirmation (5 secondes)...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    for (const agentId of createdAgents) {
      console.log(`${'─'.repeat(80)}`);
      console.log(`📦 Agent #${agentId}\n`);

      try {
        const agentData = await sdk.loadAgent(agentId);

        if (!agentData) {
          console.log('   ❌ Agent non trouvé!\n');
          continue;
        }

        console.log('   ✅ Agent trouvé!');
        console.log(`   Token URI: ${agentData.token_uri}`);
        console.log(`   Metadata Count: ${agentData.metadata.length}\n`);

        if (agentData.metadata.length > 0) {
          console.log('   🏷️  Métadonnées on-chain:');
          for (let i = 0; i < agentData.metadata.length; i++) {
            const entry = agentData.metadata[i];
            const valueStr = entry.getValueString ? entry.getValueString() : Buffer.from(entry.value).toString('utf8');
            console.log(`      ${i + 1}. "${entry.key}" = "${valueStr}"`);
          }
        } else {
          console.log('   ⚠️  Aucune métadonnée on-chain');
        }
        console.log('');

      } catch (error: any) {
        console.error(`   ❌ Erreur: ${error.message}\n`);
      }
    }
  }

  console.log('='.repeat(80));
  console.log('  Tests terminés');
  console.log('='.repeat(80) + '\n');
}

main().catch(console.error);
