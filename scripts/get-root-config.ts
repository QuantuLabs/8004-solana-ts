import { Connection, PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('8oo48pya1SZD23ZhzoNMhxR2UGb8BRa41Su4qP9EuaWm');

async function getRootConfig() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Get Root Config PDA
  const [rootConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('root_config')],
    PROGRAM_ID
  );
  
  console.log('Root Config PDA:', rootConfigPDA.toBase58());
  
  // Fetch account
  const accountInfo = await connection.getAccountInfo(rootConfigPDA);
  
  if (!accountInfo) {
    console.log('Root Config account not found!');
    return;
  }
  
  console.log('Account data length:', accountInfo.data.length);
  console.log('Account owner:', accountInfo.owner.toBase58());
  
  // Parse data - RootConfig structure:
  // - discriminator: 8 bytes
  // - authority: 32 bytes (Pubkey)
  // - base_registry: 32 bytes (Pubkey) 
  // - bump: 1 byte
  
  const data = accountInfo.data;
  const authority = new PublicKey(data.slice(8, 40));
  const baseRegistry = new PublicKey(data.slice(40, 72));
  const bump = data[72];
  
  console.log('\n=== Root Config ===');
  console.log('Authority:', authority.toBase58());
  console.log('Base Registry (Collection):', baseRegistry.toBase58());
  console.log('Bump:', bump);
}

getRootConfig().catch(console.error);
