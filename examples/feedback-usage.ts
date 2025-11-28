/**
 * Feedback Example - Solana SDK
 *
 * Demonstrates feedback submission, reading, and responses
 */
import { Keypair } from '@solana/web3.js';
import { SolanaSDK, createDevnetSDK } from '../src/index.js';

async function main() {
  const agentId = 1n;

  // === READ FEEDBACK ===
  const sdk = createDevnetSDK();

  // Get reputation summary
  const summary = await sdk.getReputationSummary(agentId);
  console.log(`Agent #${agentId} - Score: ${summary.averageScore}/100`);

  // Read all feedback (requires custom RPC like Helius)
  try {
    const feedbacks = await sdk.readAllFeedback(agentId, false);
    console.log(`Total feedbacks: ${feedbacks.length}`);
    feedbacks.slice(0, 3).forEach((fb, i) => {
      console.log(`  [${i}] Score: ${fb.score}, Tags: ${fb.tag1}, ${fb.tag2}`);
    });
  } catch (e) {
    console.log('Note: readAllFeedback requires custom RPC (Helius free tier)');
  }

  // === SUBMIT FEEDBACK ===
  const secretKey = process.env.SOLANA_PRIVATE_KEY;
  if (!secretKey) return;

  const signer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey)));
  const writeSdk = new SolanaSDK({ cluster: 'devnet', signer });

  // Submit feedback
  const result = await writeSdk.giveFeedback(agentId, {
    score: 90,
    tag1: 'fast',
    tag2: 'reliable',
    fileUri: 'ipfs://QmDetailedFeedback',
    fileHash: Buffer.alloc(32),
  });
  console.log(`Feedback submitted! Index: ${result.feedbackIndex}`);

  // Append response to feedback (as agent owner)
  await writeSdk.appendResponse(
    agentId,
    signer.publicKey,
    0n, // feedback index
    'ipfs://QmThankYouResponse',
    Buffer.alloc(32)
  );
}

main().catch(console.error);
