import { createDevnetSDK } from './src/core/sdk-solana.js';
import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

async function main() {
  // IDs des agents créés lors du test
  const agentIds = [4, 5, 6, 7, 8];

  console.log('\n' + '='.repeat(70));
  console.log('  Inspection des Agents Créés avec Métadonnées');
  console.log('='.repeat(70) + '\n');

  const keypairPath = `${process.env.HOME}/.config/solana/id.json`;
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const signer = Keypair.fromSecretKey(new Uint8Array(keypairData));

  const sdk = createDevnetSDK({ signer });
  console.log(`${GREEN}✅ SDK initialisé pour devnet${RESET}\n`);

  for (const agentId of agentIds) {
    console.log('\n' + '='.repeat(70));
    console.log(`  Agent #${agentId}`);
    console.log('='.repeat(70) + '\n');

    try {
      const agent = await sdk.loadAgent(agentId);

      if (!agent) {
        console.log(`${YELLOW}⚠️  Agent #${agentId} non trouvé${RESET}`);
        continue;
      }

      console.log(`${CYAN}📋 Informations de l'Agent:${RESET}`);
      console.log(`  Agent ID: ${agent.agent_id}`);
      console.log(`  Propriétaire: ${agent.getOwnerPublicKey().toBase58()}`);
      console.log(`  Mint NFT: ${agent.getMintPublicKey().toBase58()}`);
      console.log(`  Nom NFT: "${agent.nft_name}"`);
      console.log(`  Symbole NFT: "${agent.nft_symbol}" ${agent.nft_symbol ? '' : '(vide)'}`);
      console.log(`  Token URI: ${agent.token_uri || '(vide)'}`);

      const date = new Date(Number(agent.created_at) * 1000);
      console.log(`  Créé le: ${date.toLocaleString()}`);
      console.log(`  Bump: ${agent.bump}`);

      console.log(`\n${CYAN}📊 Métadonnées (${agent.metadata.length} entrées):${RESET}`);

      if (agent.metadata.length === 0) {
        console.log('  (aucune métadonnée)');
      } else {
        agent.metadata.forEach((entry, idx) => {
          const valueStr = entry.getValueString();
          const valuePreview = valueStr.length > 60
            ? valueStr.substring(0, 60) + '...'
            : valueStr;

          console.log(`\n  [${idx}] Clé: "${entry.key}"`);
          console.log(`      Valeur: "${valuePreview}"`);
          console.log(`      Taille: ${entry.value.length} octets`);
        });
      }

    } catch (error: any) {
      console.error(`${YELLOW}⚠️  Erreur lors du chargement de l'agent #${agentId}: ${error.message}${RESET}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('  Inspection Terminée');
  console.log('='.repeat(70) + '\n');
}

main().catch(console.error);
