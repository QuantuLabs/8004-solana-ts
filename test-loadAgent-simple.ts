import { readFileSync } from 'fs';
import { Keypair } from '@solana/web3.js';
import { SolanaSDK } from './src/index.js';

async function main() {
  const signer = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync('/Users/true/.config/solana/id.json', 'utf8')))
  );

  const sdk = new SolanaSDK({
    cluster: 'devnet',
    signer,
  });

  console.log('Testing loadAgent(0)...');
  const agent0 = await sdk.loadAgent(0n);
  console.log('Agent 0:', agent0);

  console.log('\nTesting loadAgent(1)...');
  const agent1 = await sdk.loadAgent(1n);
  console.log('Agent 1:', agent1);
}

main().catch(console.error);
