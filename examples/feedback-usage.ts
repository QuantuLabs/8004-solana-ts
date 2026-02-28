/**
 * Feedback Example
 *
 * Demonstrates:
 * 1) Reading indexed feedbacks
 * 2) Appending a response with auto sealHash resolution
 * 3) Revoking an existing feedback (not just create+revoke in one flow)
 */
import { Keypair, PublicKey } from '@solana/web3.js';
import { SolanaSDK } from '../src/index.js';

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const cluster = (process.env.SOLANA_CLUSTER as 'devnet' | 'localnet' | 'mainnet-beta' | undefined)
    ?? (rpcUrl?.includes('127.0.0.1') ? 'localnet' : 'devnet');

  // Example agent asset (replace with actual PublicKey)
  const agentAsset = new PublicKey(
    process.env.EXAMPLE_AGENT_ASSET ?? 'Fxy2ScxgVyc7Tsh3yKBtFg4Mke2qQR2HqjwVaPqhkjnJ'
  );
  const indexerGraphqlUrl = process.env.INDEXER_GRAPHQL_URL;
  const indexerUrl = process.env.INDEXER_URL;

  // Read summary from on-chain to keep this step robust even if indexer schema differs.
  const sdk = new SolanaSDK({
    cluster,
    ...(rpcUrl ? { rpcUrl } : {}),
    forceOnChain: true,
  });

  // Get reputation summary
  try {
    const summary = await sdk.getReputationSummary(agentAsset);
    console.log(`Agent ${agentAsset.toBase58().slice(0, 8)}... - Score: ${summary.averageScore}/100`);
    console.log(`Total feedbacks: ${summary.count}`);
  } catch {
    console.log('Summary unavailable with current indexer setup; set INDEXER_GRAPHQL_URL/INDEXER_URL');
  }

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

  // Use explicit indexer config for response/revoke helper flows.
  if (!indexerGraphqlUrl && !indexerUrl) {
    console.log('\nSet INDEXER_GRAPHQL_URL or INDEXER_URL to run append/revoke examples');
    return;
  }

  const indexedSdk = new SolanaSDK({
    cluster,
    ...(rpcUrl ? { rpcUrl } : {}),
    signer,
    ...(indexerGraphqlUrl ? { indexerGraphqlUrl } : {}),
    ...(indexerUrl ? { indexerUrl } : {}),
  });

  // Pull existing feedbacks from indexer (current agent)
  const indexed = await indexedSdk.getFeedbacksFromIndexer(agentAsset, {
    includeRevoked: false,
    limit: 50,
    noFallback: true,
  });

  // Ensure we have at least one feedback from signer for revoke demo
  let ownFeedback = indexed.find((f) => f.client.equals(signer.publicKey) && !f.isRevoked);
  if (!ownFeedback) {
    const created = await indexedSdk.giveFeedback(agentAsset, {
      value: '90',
      tag1: 'fast',
      tag2: 'reliable',
      feedbackUri: 'ipfs://QmDetailedFeedback',
    });
    console.log(`Feedback submitted! Index: ${created.feedbackIndex?.toString() ?? 'unknown'}`);

    // Re-read so we get the indexed sealHash
    await indexedSdk.waitForIndexerSync(async () => {
      const rows = await indexedSdk.getFeedbacksFromIndexer(agentAsset, {
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

  // Append response with simple API (SDK auto-resolves sealHash from indexer)
  await indexedSdk.appendResponse(
    agentAsset,
    ownFeedback.client,
    ownFeedback.feedbackIndex,
    'ipfs://QmThankYouResponse'
  );
  console.log(`Response appended for feedback #${ownFeedback.feedbackIndex.toString()}`);

  // Creator/client guard before revoke (extra local check for clarity).
  // SDK also performs ownership preflight internally.
  if (!ownFeedback.client.equals(signer.publicKey)) {
    throw new Error('Refusing revoke: signer is not the original feedback client');
  }

  // Simple revoke (SDK preflights ownership and auto-resolves sealHash)
  await indexedSdk.revokeFeedback(agentAsset, ownFeedback.feedbackIndex);
  console.log(`Feedback revoked: index=${ownFeedback.feedbackIndex.toString()}`);
}

main().catch(console.error);
