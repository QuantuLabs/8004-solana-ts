/**
 * Transfer Agent Example - Solana SDK v0.5.0+
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

  // Example agent asset and collection (replace with actual PublicKeys)
  const agentAsset = new PublicKey('Fxy2ScxgVyc7Tsh3yKBtFg4Mke2qQR2HqjwVaPqhkjnJ');
  const collection = new PublicKey('AucZdyKKkeJL8J5ZMqLrqhqbp4DZPUfaCP9A8RZG5iSL');
  const newOwner = new PublicKey('NEW_OWNER_PUBKEY_HERE');

  // Check current ownership
  const isOwner = await sdk.isAgentOwner(agentAsset, signer.publicKey);
  if (!isOwner) {
    console.log('You are not the owner');
    return;
  }

  console.log(`Current owner: ${signer.publicKey.toBase58()}`);
  console.log(`Transferring to: ${newOwner.toBase58()}`);

  // Transfer (requires asset and collection)
  const result = await sdk.transferAgent(agentAsset, collection, newOwner);
  if ('signature' in result) {
    console.log(`Agent transferred! Tx: ${result.signature}`);
  }

  // Verify new owner
  const currentOwner = await sdk.getAgentOwner(agentAsset);
  console.log(`New owner verified: ${currentOwner?.toBase58()}`);
}

main().catch(console.error);
