import { Connection, PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('8oo48pya1SZD23ZhzoNMhxR2UGb8BRa41Su4qP9EuaWm');

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  // Get Root Config
  const [rootConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('root_config')],
    PROGRAM_ID
  );

  const rootAccount = await connection.getAccountInfo(rootConfigPDA);
  if (!rootAccount) {
    console.log('Root Config not found');
    return;
  }

  const rootData = rootAccount.data;
  const baseRegistryPda = new PublicKey(rootData.slice(40, 72));

  console.log('=== Root Config ===');
  console.log('Base Registry PDA:', baseRegistryPda.toBase58());

  // Fetch RegistryConfig account
  const registryAccount = await connection.getAccountInfo(baseRegistryPda);
  if (!registryAccount) {
    console.log('\n❌ RegistryConfig not found at', baseRegistryPda.toBase58());
    return;
  }

  console.log('\n=== Registry Config ===');
  console.log('Data length:', registryAccount.data.length);

  // RegistryConfig structure:
  // - discriminator: 8 bytes
  // - collection: 32 bytes (Pubkey) - The actual Metaplex Core collection
  // - agent_count: 8 bytes (u64)
  // - owner: 32 bytes (Pubkey)
  // - fees_wallet: 32 bytes (Pubkey)
  // - register_fee: 8 bytes (u64)
  // - bump: 1 byte

  const regData = registryAccount.data;
  const collection = new PublicKey(regData.slice(8, 40));
  const agentCountBuf = regData.slice(40, 48);
  const agentCount = Number(agentCountBuf.readBigUInt64LE(0));
  const owner = new PublicKey(regData.slice(48, 80));

  console.log('Collection (Metaplex Core):', collection.toBase58());
  console.log('Agent Count:', agentCount);
  console.log('Owner:', owner.toBase58());
}

main().catch(console.error);
