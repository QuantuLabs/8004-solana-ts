import { Connection, PublicKey } from '@solana/web3.js';
import { AgentAccount } from './src/core/borsh-schemas.js';
import { PDAHelpers } from './src/core/pda-helpers.js';

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

// Mints des agents créés (extraits du log)
const agentMints = [
  { id: 4, mint: '57FHmtxFj8dwce7Pf28E2iLKPXJqqfydxFtZiWKyfDAn' },
  { id: 5, mint: 'APjRhQEUgYfoBBwoLG7CB94UjHfsWKXgDSqVyzChPcj4' },
  { id: 6, mint: 'HQVPpL2dySjFPs4ij52f2RDVg3NNXv8d6wv7ifoZn7ba' },
  { id: 7, mint: '7RAQSei7oX3c9YNaDncF9Ufcud79M58Af5AECYWbTsUC' },
  { id: 8, mint: 'KqiwnTHsD7VXuVaE2mG5SFxFoCBRuyRfn9qtJcovxRG' },
];

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  Inspection Directe des Agents par Mint');
  console.log('='.repeat(70) + '\n');

  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  console.log(`${GREEN}✅ Connecté à devnet${RESET}\n`);

  for (const { id, mint } of agentMints) {
    console.log('\n' + '='.repeat(70));
    console.log(`  Agent #${id}`);
    console.log('='.repeat(70) + '\n');

    try {
      const mintPubkey = new PublicKey(mint);
      const [agentPDA] = await PDAHelpers.getAgentPDA(mintPubkey);

      console.log(`${CYAN}Mint: ${mint}${RESET}`);
      console.log(`${CYAN}PDA: ${agentPDA.toBase58()}${RESET}\n`);

      const accountInfo = await connection.getAccountInfo(agentPDA);

      if (!accountInfo) {
        console.log(`${YELLOW}⚠️  Compte PDA non trouvé${RESET}`);
        continue;
      }

      const agent = AgentAccount.deserialize(accountInfo.data);

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
          const valuePreview = valueStr.length > 80
            ? valueStr.substring(0, 80) + '...'
            : valueStr;

          console.log(`\n  [${idx}] Clé: "${entry.key}"`);
          console.log(`      Valeur: "${valuePreview}"`);
          console.log(`      Taille: ${entry.value.length} octets`);
        });
      }

    } catch (error: any) {
      console.error(`${YELLOW}⚠️  Erreur: ${error.message}${RESET}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('  Inspection Terminée');
  console.log('='.repeat(70) + '\n');
}

main().catch(console.error);
