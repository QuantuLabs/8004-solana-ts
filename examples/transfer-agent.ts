/**
 * Transfer Agent Example - Solana SDK v0.5.0+
 *
 * Demonstrates transferring agent ownership via SDK.
 * You can also transfer the underlying Core asset in any standard wallet UI,
 * then call sdk.syncOwner(asset) to sync AgentAccount owner on-chain.
 */
import { Keypair, PublicKey } from '@solana/web3.js';
import { SolanaSDK } from '../src/index.js';

const CLUSTER = 'devnet' as const;
const RPC_URL = 'https://api.devnet.solana.com';
const SOLANA_PRIVATE_KEY_JSON = '';
const EXAMPLE_AGENT_ASSET = 'Fxy2ScxgVyc7Tsh3yKBtFg4Mke2qQR2HqjwVaPqhkjnJ';
const NEW_OWNER_PUBKEY = '';

async function main() {
  if (!SOLANA_PRIVATE_KEY_JSON) {
    console.log('Set SOLANA_PRIVATE_KEY_JSON in this file');
    return;
  }

  const signer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(SOLANA_PRIVATE_KEY_JSON)));
  const sdk = new SolanaSDK({
    cluster: CLUSTER,
    rpcUrl: RPC_URL,
    signer,
  });

  // Example agent asset (replace with actual PublicKey)
  const agentAsset = new PublicKey(EXAMPLE_AGENT_ASSET);
  if (!NEW_OWNER_PUBKEY) {
    console.log('Set NEW_OWNER_PUBKEY in this file');
    return;
  }
  const newOwner = new PublicKey(NEW_OWNER_PUBKEY);

  // Check current ownership
  const isOwner = await sdk.isAgentOwner(agentAsset, signer.publicKey);
  if (!isOwner) {
    console.log('You are not the owner');
    return;
  }

  console.log(`Current owner: ${signer.publicKey.toBase58()}`);
  console.log(`Transferring to: ${newOwner.toBase58()}`);

  // SDK helper transfer (wallet-native asset transfer + sdk.syncOwner(asset) is also supported)
  const result = await sdk.transferAgent(agentAsset, newOwner);
  if ('signature' in result) {
    console.log(`Agent transferred! Tx: ${result.signature}`);
  }

  // Verify new owner
  const currentOwner = await sdk.getAgentOwner(agentAsset);
  console.log(`New owner verified: ${currentOwner?.toBase58()}`);
}

main().catch(console.error);
