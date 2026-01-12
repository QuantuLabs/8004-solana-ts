import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SolanaSDK } from './src/core/sdk-solana.js';

async function main() {
  const privateKeyEnv = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKeyEnv) throw new Error('SOLANA_PRIVATE_KEY not set');

  const signer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(privateKeyEnv)));
  console.log('Signer:', signer.publicKey.toBase58());

  const sdk = new SolanaSDK({
    cluster: 'devnet',
    signer,
    rpcUrl: 'https://api.devnet.solana.com',
  });

  const balance = await sdk.getSolanaClient().getConnection().getBalance(signer.publicKey);
  console.log('Balance:', balance / LAMPORTS_PER_SOL, 'SOL');

  const collection = await sdk.getBaseCollection();
  console.log('Base Collection:', collection?.toBase58() || 'NOT FOUND');

  console.log('\nRegistering agent...');
  const timestamp = Date.now();
  const result = await sdk.registerAgent(`ipfs://QmTest${timestamp}`);
  console.log('Result:', JSON.stringify(result, (k, v) => {
    if (v instanceof Uint8Array || Buffer.isBuffer(v)) return '[Buffer]';
    if (v && typeof v === 'object' && v.toBase58) return v.toBase58();
    return v;
  }, 2));

  if ((result as any).error) {
    console.error('Registration failed:', (result as any).error);
  } else if ((result as any).asset) {
    console.log('Asset:', (result as any).asset.toBase58());
  }
}

main().catch(console.error);
