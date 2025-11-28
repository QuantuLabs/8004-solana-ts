/**
 * Transfer Agent Example - Solana SDK
 *
 * Demonstrates transferring agent ownership
 */
import { Keypair, PublicKey } from '@solana/web3.js';
import { SolanaSDK } from '../src/index.js';

async function main() {
  const secretKey = process.env.SOLANA_PRIVATE_KEY;
  if (!secretKey) {
    console.log('Set SOLANA_PRIVATE_KEY');
    return;
  }

  const signer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey)));
  const sdk = new SolanaSDK({ cluster: 'devnet', signer });

  const agentId = 1n;
  const newOwner = new PublicKey('NEW_OWNER_PUBKEY_HERE');

  // Check current ownership
  const isOwner = await sdk.isAgentOwner(agentId, signer.publicKey);
  if (!isOwner) {
    console.log('You are not the owner');
    return;
  }

  // Transfer
  const result = await sdk.transferAgent(agentId, newOwner);
  console.log(`Agent transferred! Tx: ${result.signature}`);

  // Verify
  const currentOwner = await sdk.getAgentOwner(agentId);
  console.log(`New owner: ${currentOwner?.toBase58()}`);
}

main().catch(console.error);
