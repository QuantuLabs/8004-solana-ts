/**
 * Quick Start Example - Solana SDK
 *
 * Demonstrates basic read and write operations
 */
import { Keypair } from '@solana/web3.js';
import { SolanaSDK } from '../src/index.js';

async function main() {
  // Create SDK (devnet by default, no signer = read-only)
  const sdk = new SolanaSDK();

  // Load an agent
  const agent = await sdk.loadAgent(1);
  if (agent) {
    console.log(`Agent: ${agent.nft_name}`);
    console.log(`Owner: ${agent.getOwnerPublicKey().toBase58()}`);
  }

  // Get reputation summary
  const summary = await sdk.getReputationSummary(1);
  console.log(`Score: ${summary.averageScore}/100 (${summary.count} reviews)`);

  // === WRITE OPERATIONS ===
  // Requires signer
  const secretKey = process.env.SOLANA_PRIVATE_KEY;
  if (!secretKey) {
    console.log('Set SOLANA_PRIVATE_KEY for write operations');
    return;
  }

  const signer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey)));
  const writeSdk = new SolanaSDK({ signer });

  // Register new agent
  const result = await writeSdk.registerAgent('ipfs://QmYourAgentMetadata');
  console.log(`Registered agent #${result.agentId}`);

  // Give feedback
  await writeSdk.giveFeedback(1, {
    score: 85,
    tag1: 'helpful',
    tag2: 'accurate',
    fileUri: 'ipfs://QmFeedbackDetails',
    fileHash: Buffer.alloc(32),
  });
}

main().catch(console.error);
