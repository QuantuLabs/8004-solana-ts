import { Connection, PublicKey } from '@solana/web3.js';
import { getMetadataPDA } from './src/core/metaplex-helpers.js';

const agentMints = [
  { id: 4, mint: '57FHmtxFj8dwce7Pf28E2iLKPXJqqfydxFtZiWKyfDAn' },
  { id: 5, mint: 'APjRhQEUgYfoBBwoLG7CB94UjHfsWKXgDSqVyzChPcj4' },
];

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  for (const { id, mint } of agentMints) {
    console.log(`\n=== Agent #${id} ===`);
    console.log(`Mint: ${mint}`);

    const mintPubkey = new PublicKey(mint);
    const metadataPDA = getMetadataPDA(mintPubkey);

    console.log(`Metadata PDA: ${metadataPDA.toBase58()}`);

    const accountInfo = await connection.getAccountInfo(metadataPDA);

    if (!accountInfo) {
      console.log('❌ Métadonnées Metaplex NON TROUVÉES');
      continue;
    }

    console.log('✅ Métadonnées Metaplex trouvées');
    console.log(`Taille: ${accountInfo.data.length} octets`);
    console.log(`Owner: ${accountInfo.owner.toBase58()}`);

    // Essayer de lire le nom (offset approximatif dans les métadonnées Metaplex)
    try {
      // Le nom commence généralement autour de l'offset 65-70
      const nameLength = accountInfo.data.readUInt32LE(65);
      const nameBytes = accountInfo.data.slice(69, 69 + nameLength);
      const name = nameBytes.toString('utf8').replace(/\0/g, '');
      console.log(`Nom extrait: "${name}"`);
    } catch (e) {
      console.log('Impossible d\'extraire le nom');
    }
  }
}

main().catch(console.error);
