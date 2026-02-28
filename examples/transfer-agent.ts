/**
 * Transfer Agent Example - Solana SDK v0.5.0+
 *
 * Demonstrates transferring agent ownership via SDK.
 * You can also transfer the underlying Core asset in any standard wallet UI,
 * then call sdk.syncOwner(asset) to sync AgentAccount owner on-chain.
 */
import { Keypair, PublicKey } from '@solana/web3.js';
import { SolanaSDK } from '../src/index.js';

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const cluster = (process.env.SOLANA_CLUSTER as 'devnet' | 'localnet' | 'mainnet-beta' | undefined)
    ?? (rpcUrl?.includes('127.0.0.1') ? 'localnet' : 'devnet');

  const secretKey = process.env.SOLANA_PRIVATE_KEY;
  if (!secretKey) {
    console.log('Set SOLANA_PRIVATE_KEY');
    return;
  }

  const signer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey)));
  const sdk = new SolanaSDK({
    cluster,
    ...(rpcUrl ? { rpcUrl } : {}),
    signer,
  });

  // Example agent asset (replace with actual PublicKey)
  const agentAsset = new PublicKey(
    process.env.EXAMPLE_AGENT_ASSET ?? 'Fxy2ScxgVyc7Tsh3yKBtFg4Mke2qQR2HqjwVaPqhkjnJ'
  );
  const newOwnerEnv = process.env.NEW_OWNER_PUBKEY;
  if (!newOwnerEnv) {
    console.log('Set NEW_OWNER_PUBKEY');
    return;
  }
  const newOwner = new PublicKey(newOwnerEnv);

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
