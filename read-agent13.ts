import { Keypair } from '@solana/web3.js';
import { SolanaSDK } from './src/core/sdk-solana.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

async function main() {
  console.log('\n📖 Lecture de l\'Agent #13\n');

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

  try {
    const agentData = await sdk.loadAgent(BigInt(13));

    if (!agentData) {
      console.log('❌ Agent #13 non trouvé\n');
      return;
    }

    console.log('✅ Agent #13 trouvé!\n');
    console.log('📋 Données:');
    console.log(`   Agent ID: ${agentData.agent_id}`);
    console.log(`   Token URI: ${agentData.token_uri}`);
    console.log(`   NFT Name: ${agentData.nft_name}`);
    console.log(`   Metadata Count: ${agentData.metadata.length}\n`);

    if (agentData.metadata.length > 0) {
      console.log('🏷️  Métadonnées on-chain:');
      for (let i = 0; i < agentData.metadata.length; i++) {
        const entry = agentData.metadata[i];
        const valueStr = entry.getValueString ? entry.getValueString() : Buffer.from(entry.value).toString('utf8');
        console.log(`   ${i + 1}. "${entry.key}" = "${valueStr}"`);
      }
    } else {
      console.log('⚠️  Aucune métadonnée on-chain');
    }
    console.log('');

  } catch (error: any) {
    console.error(`❌ Erreur: ${error.message}\n`);
  }
}

main().catch(console.error);
