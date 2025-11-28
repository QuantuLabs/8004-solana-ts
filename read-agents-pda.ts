import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { SolanaSDK } from './src/core/sdk-solana.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Script pour lire les Agent PDA directement et afficher leurs métadonnées on-chain
 * Utilise sdk.loadAgent(agentId) qui résout automatiquement ID → mint → PDA
 */
async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  Lecture des Agent PDA - Métadonnées On-Chain');
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

  // Les agents créés par le test: #9, #10, #11, #12
  const agentIds = [
    { id: 9, desc: '3 métadonnées (light)' },
    { id: 10, desc: '6 métadonnées (medium)' },
    { id: 11, desc: '10 métadonnées (courtes)' },
    { id: 12, desc: '2 métadonnées (limites max)' },
  ];

  for (const agent of agentIds) {
    console.log(`${'─'.repeat(80)}`);
    console.log(`📦 Agent #${agent.id} - ${agent.desc}\n`);

    try {
      // Charger l'agent via SDK (résolution automatique ID → mint → PDA)
      const agentData = await sdk.loadAgent(agent.id);

      if (!agentData) {
        console.log('   ❌ Agent non trouvé!\n');
        continue;
      }

      console.log('   ✅ Agent trouvé!\n');
      console.log('   📋 Données Agent:');
      console.log(`      Agent ID: ${agentData.agent_id}`);
      console.log(`      Agent Mint: ${new PublicKey(agentData.agent_mint).toBase58()}`);
      console.log(`      Owner: ${new PublicKey(agentData.owner).toBase58()}`);
      console.log(`      Token URI: ${agentData.token_uri || '(aucun)'}`);
      console.log(`      NFT Name: ${agentData.nft_name}`);
      console.log(`      NFT Symbol: ${agentData.nft_symbol}`);
      console.log(`      Created At: ${new Date(Number(agentData.created_at) * 1000).toISOString()}`);
      console.log(`      Bump: ${agentData.bump}`);
      console.log(`      Metadata Count: ${agentData.metadata.length}`);

      if (agentData.metadata.length > 0) {
        console.log(`\n   🏷️  Métadonnées On-Chain (${agentData.metadata.length} entrées):`);
        for (let i = 0; i < agentData.metadata.length; i++) {
          const entry = agentData.metadata[i];
          const valueStr = entry.getValueString ? entry.getValueString() : Buffer.from(entry.value).toString('utf8');
          console.log(`      ${i + 1}. "${entry.key}" = "${valueStr}"`);
        }
      } else {
        console.log(`\n   ⚠️  Aucune métadonnée on-chain (tableau vide)`);
        console.log(`       Note: Les métadonnées Metaplex (NFT) existent, mais les métadonnées`);
        console.log(`       custom dans le compte Agent PDA sont vides.`);
      }

      console.log('');

    } catch (error: any) {
      console.error(`   ❌ Erreur: ${error.message}\n`);
    }
  }

  console.log('='.repeat(80));
  console.log('  Lecture terminée');
  console.log('='.repeat(80) + '\n');
}

main().catch(console.error);
