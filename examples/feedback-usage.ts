/**
 * Feedback Example
 *
 * Demonstrates feedback submission, reading, and responses
 */
import { Keypair, PublicKey } from '@solana/web3.js';
import { SolanaSDK } from '../src/index.js';

async function main() {
  // Example agent asset (replace with actual PublicKey)
  const agentAsset = new PublicKey('Fxy2ScxgVyc7Tsh3yKBtFg4Mke2qQR2HqjwVaPqhkjnJ');

  // Create SDK (devnet by default)
  const sdk = new SolanaSDK();

  // Get reputation summary
  const summary = await sdk.getReputationSummary(agentAsset);
  console.log(`Agent ${agentAsset.toBase58().slice(0, 8)}... - Score: ${summary.averageScore}/100`);
  console.log(`Total feedbacks: ${summary.count}`);

  // Read all feedback (requires custom RPC like Helius)
  try {
    const feedbacks = await sdk.readAllFeedback(agentAsset, false);
    console.log(`Feedbacks loaded: ${feedbacks.length}`);
    feedbacks.slice(0, 3).forEach((fb, i) => {
      console.log(`  [${i}] Score: ${fb.score}, Tags: ${fb.tag1 || '-'}, ${fb.tag2 || '-'}`);
    });
  } catch (e) {
    console.log('Note: readAllFeedback requires an indexer to be configured');
  }

  // === SUBMIT FEEDBACK ===
  const secretKey = process.env.SOLANA_PRIVATE_KEY;
  if (!secretKey) {
    console.log('\nSet SOLANA_PRIVATE_KEY to submit feedback');
    return;
  }

  const signer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey)));
  const writeSdk = new SolanaSDK({ signer });

  // Submit feedback (value required, score optional)
  const result = await writeSdk.giveFeedback(agentAsset, {
    value: '90',          // Decimal string, number, or bigint
    tag1: 'fast',
    tag2: 'reliable',
    feedbackUri: 'ipfs://QmDetailedFeedback',
    feedbackFileHash: Buffer.alloc(32),
  });
  console.log(`Feedback submitted! Index: ${result.feedbackIndex}`);

  // Append response to feedback (as agent owner)
  const clientPubkey = signer.publicKey; // client who gave the feedback
  const sealHash = Buffer.alloc(32);     // from readFeedback().sealHash
  await writeSdk.appendResponse(
    agentAsset,
    clientPubkey,
    0, // feedback index
    sealHash,
    'ipfs://QmThankYouResponse',
  );
  console.log('Response appended to feedback #0');
}

main().catch(console.error);
