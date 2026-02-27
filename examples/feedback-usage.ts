/**
 * Feedback Example
 *
 * Demonstrates:
 * 1) Reading indexed feedbacks
 * 2) Appending a response from sealHash (auto index resolution)
 * 3) Revoking an existing feedback (not just create+revoke in one flow)
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

  // Pull existing feedbacks from indexer (current agent)
  const indexed = await writeSdk.getFeedbacksFromIndexer(agentAsset, {
    includeRevoked: false,
    limit: 50,
    noFallback: true,
  });

  // Ensure we have at least one feedback from signer for revoke demo
  let ownFeedback = indexed.find((f) => f.client.equals(signer.publicKey) && !f.isRevoked);
  if (!ownFeedback) {
    const created = await writeSdk.giveFeedback(agentAsset, {
      value: '90',
      tag1: 'fast',
      tag2: 'reliable',
      feedbackUri: 'ipfs://QmDetailedFeedback',
      feedbackFileHash: Buffer.alloc(32),
    });
    console.log(`Feedback submitted! Index: ${created.feedbackIndex?.toString() ?? 'unknown'}`);

    // Re-read so we get the indexed sealHash
    await writeSdk.waitForIndexerSync(async () => {
      const rows = await writeSdk.getFeedbacksFromIndexer(agentAsset, {
        includeRevoked: false,
        limit: 50,
        noFallback: true,
      });
      ownFeedback = rows.find((f) => f.client.equals(signer.publicKey) && !f.isRevoked);
      return !!ownFeedback?.sealHash;
    }, { timeout: 10000, initialDelay: 250 });
  }

  if (!ownFeedback) {
    throw new Error('No feedback found for signer; cannot continue revoke demo');
  }

  // Optional: append response by sealHash only (SDK resolves feedback index automatically)
  if (ownFeedback.sealHash) {
    await writeSdk.appendResponseBySealHash(
      agentAsset,
      ownFeedback.client,
      ownFeedback.sealHash,
      'ipfs://QmThankYouResponse'
    );
    console.log(`Response appended (auto index) for feedback #${ownFeedback.feedbackIndex.toString()}`);
  }

  // Creator/client guard before revoke (extra local check for clarity).
  // SDK also performs ownership preflight internally.
  if (!ownFeedback.client.equals(signer.publicKey)) {
    throw new Error('Refusing revoke: signer is not the original feedback client');
  }

  await writeSdk.revokeFeedback(agentAsset, ownFeedback.feedbackIndex);
  console.log(`Feedback revoked: index=${ownFeedback.feedbackIndex.toString()}`);
}

main().catch(console.error);
