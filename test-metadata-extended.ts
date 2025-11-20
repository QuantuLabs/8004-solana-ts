import { Keypair } from '@solana/web3.js';
import { SolanaSDK } from './src/core/sdk-solana.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Test du système de métadonnées étendues:
 * - 15 métadonnées (10 inline + 5 extended)
 * - 25 métadonnées (10 inline + 15 extended en batches)
 * - Vérifier lecture complète avec loadAgent()
 */
async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  Test du Système de Métadonnées Étendues (Extended Metadata)');
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

  const createdAgents: Array<{ id: bigint; count: number }> = [];

  // ============================================================================
  // TEST 1: 15 métadonnées (10 inline + 5 extended)
  // ============================================================================
  console.log('─'.repeat(80));
  console.log('📝 TEST 1: Agent avec 15 métadonnées (10 inline + 5 extended)\n');

  try {
    const metadata15 = [
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
      // Extended metadata (will be stored in MetadataExtension PDAs)
      { key: 'ext1', value: 'extended_value_1' },
      { key: 'ext2', value: 'extended_value_2' },
      { key: 'ext3', value: 'extended_value_3' },
      { key: 'ext4', value: 'extended_value_4' },
      { key: 'ext5', value: 'extended_value_5' },
    ];

    console.log(`   Nombre de métadonnées: ${metadata15.length}`);
    console.log(`   - Inline (max 10): ${Math.min(metadata15.length, 10)}`);
    console.log(`   - Extended: ${Math.max(0, metadata15.length - 10)}\n`);

    const result1 = await sdk.registerAgent(
      'https://example.com/agent-15-metadata.json',
      metadata15
    );

    if (!result1.success) {
      console.error(`❌ Erreur: ${result1.error}\n`);
    } else {
      console.log(`✅ Agent créé avec succès!`);
      console.log(`   Agent ID: ${result1.agentId}`);
      console.log(`   Agent Mint: ${result1.agentMint}`);
      console.log(`   Transactions: ${result1.signatures?.length || 1}`);
      if (result1.signatures && result1.signatures.length > 1) {
        console.log(`   Transaction principale: ${result1.signature}`);
        for (let i = 1; i < result1.signatures.length; i++) {
          console.log(`   Extension batch ${i}: ${result1.signatures[i]}`);
        }
      } else {
        console.log(`   Transaction: ${result1.signature}`);
      }
      console.log('');

      createdAgents.push({ id: result1.agentId!, count: metadata15.length });
    }
  } catch (error: any) {
    console.error(`❌ Erreur: ${error.message}`);
    console.error(`   ${error.stack}\n`);
  }

  // ============================================================================
  // TEST 2: 25 métadonnées (10 inline + 15 extended)
  // ============================================================================
  console.log('─'.repeat(80));
  console.log('📝 TEST 2: Agent avec 25 métadonnées (10 inline + 15 extended)\n');

  try {
    const metadata25: Array<{ key: string; value: string }> = [];

    // Generate 25 metadata entries
    for (let i = 1; i <= 25; i++) {
      metadata25.push({
        key: `field${i}`,
        value: `This is value number ${i} for testing extended metadata storage`,
      });
    }

    console.log(`   Nombre de métadonnées: ${metadata25.length}`);
    console.log(`   - Inline (max 10): ${Math.min(metadata25.length, 10)}`);
    console.log(`   - Extended: ${Math.max(0, metadata25.length - 10)}\n`);

    const result2 = await sdk.registerAgent(
      'https://example.com/agent-25-metadata.json',
      metadata25
    );

    if (!result2.success) {
      console.error(`❌ Erreur: ${result2.error}\n`);
    } else {
      console.log(`✅ Agent créé avec succès!`);
      console.log(`   Agent ID: ${result2.agentId}`);
      console.log(`   Agent Mint: ${result2.agentMint}`);
      console.log(`   Transactions: ${result2.signatures?.length || 1}`);
      if (result2.signatures && result2.signatures.length > 1) {
        console.log(`   Transaction principale: ${result2.signature}`);
        for (let i = 1; i < result2.signatures.length; i++) {
          console.log(`   Extension batch ${i}: ${result2.signatures[i]}`);
        }
      } else {
        console.log(`   Transaction: ${result2.signature}`);
      }
      console.log('');

      createdAgents.push({ id: result2.agentId!, count: metadata25.length });
    }
  } catch (error: any) {
    console.error(`❌ Erreur: ${error.message}`);
    console.error(`   ${error.stack}\n`);
  }

  // ============================================================================
  // LECTURE DES AGENTS CRÉÉS
  // ============================================================================
  if (createdAgents.length > 0) {
    console.log('─'.repeat(80));
    console.log('📖 LECTURE DES AGENTS CRÉÉS (avec métadonnées étendues)\n');

    // Attendre un peu pour la confirmation
    console.log('⏳ Attente de confirmation (8 secondes)...\n');
    await new Promise(resolve => setTimeout(resolve, 8000));

    for (const { id, count } of createdAgents) {
      console.log(`${'─'.repeat(80)}`);
      console.log(`📦 Agent #${id} (attendu: ${count} métadonnées)\n`);

      try {
        const agentData = await sdk.loadAgent(id);

        if (!agentData) {
          console.log('   ❌ Agent non trouvé!\n');
          continue;
        }

        console.log('   ✅ Agent trouvé!');
        console.log(`   Token URI: ${agentData.token_uri}`);
        console.log(`   Metadata Count: ${agentData.metadata.length}\n`);

        if (agentData.metadata.length !== count) {
          console.log(`   ⚠️  ATTENTION: Nombre de métadonnées incorrect!`);
          console.log(`       Attendu: ${count}, Reçu: ${agentData.metadata.length}\n`);
        }

        if (agentData.metadata.length > 0) {
          console.log('   🏷️  Métadonnées (inline + extended):');
          for (let i = 0; i < agentData.metadata.length; i++) {
            const entry = agentData.metadata[i];
            const valueStr = entry.getValueString
              ? entry.getValueString()
              : Buffer.from(entry.value).toString('utf8');
            const source = i < 10 ? 'inline' : 'extended';
            console.log(`      ${i + 1}. [${source}] "${entry.key}" = "${valueStr}"`);
          }
        } else {
          console.log('   ⚠️  Aucune métadonnée trouvée');
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
