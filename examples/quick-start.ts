/**
 * Quick Start Example - Solana SDK
 *
 * Demonstrates basic read and write operations
 */
import { Keypair } from '@solana/web3.js';
import { SolanaSDK, createDevnetSDK } from '../src/index.js';

async function main() {
  // === READ-ONLY MODE ===
  // No signer needed for queries
  const readOnlySDK = createDevnetSDK();

  // Load an agent
  const agent = await readOnlySDK.loadAgent(1);
  if (agent) {
    console.log(`Agent: ${agent.nft_name}`);
    console.log(`Owner: ${agent.getOwnerPublicKey().toBase58()}`);
  }

  // Get reputation summary
  const summary = await readOnlySDK.getReputationSummary(1);
  console.log(`Score: ${summary.averageScore}/100 (${summary.count} reviews)`);

  // === WRITE MODE ===
  // Requires signer for transactions
  const secretKey = process.env.SOLANA_PRIVATE_KEY;
  if (!secretKey) {
    console.log('Set SOLANA_PRIVATE_KEY for write operations');
    return;
  }

  const signer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey)));
  const sdk = new SolanaSDK({ cluster: 'devnet', signer });

  // Register new agent
  const result = await sdk.registerAgent('ipfs://QmYourAgentMetadata');
  console.log(`Registered agent #${result.agentId}`);

  // Give feedback
  await sdk.giveFeedback(1, {
    score: 85,
    tag1: 'helpful',
    tag2: 'accurate',
    fileUri: 'ipfs://QmFeedbackDetails',
    fileHash: Buffer.alloc(32),
  });
}

main().catch(console.error);
