/**
 * Full SDK Test - All APIs (Read + Write)
 * Uses Anchor provider wallet (~/.config/solana/id.json)
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { SolanaSDK } from '/Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana/dist/index.js';

// Load wallet from Anchor provider
const walletPath = process.env.ANCHOR_WALLET || `${process.env.HOME}/.config/solana/id.json`;
const walletData = JSON.parse(readFileSync(walletPath, 'utf-8'));
const signer = Keypair.fromSecretKey(Uint8Array.from(walletData));

console.log('=== FULL SDK TEST ===');
console.log('Wallet:', signer.publicKey.toBase58());

const sdk = new SolanaSDK({ signer });

async function main() {
  // ============================================================
  // SECTION 1: READ APIs (Indexer)
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('SECTION 1: INDEXER READ APIs');
  console.log('='.repeat(60));

  // 1.1 Global Stats
  console.log('\n1.1 getGlobalStats():');
  const globalStats = await sdk.getGlobalStats();
  console.log(JSON.stringify(globalStats, null, 2));

  // 1.2 Leaderboard
  console.log('\n1.2 getLeaderboard({ limit: 3 }):');
  const leaderboard = await sdk.getLeaderboard({ limit: 3 });
  console.log(`Count: ${leaderboard.length}`);
  leaderboard.forEach((a: any, i: number) => {
    console.log(`  ${i+1}. ${a.asset} | tier=${a.trust_tier} | score=${a.quality_score}`);
  });

  // 1.3 Collection Stats
  if (leaderboard.length > 0 && leaderboard[0].collection) {
    console.log('\n1.3 getCollectionStats():');
    const collStats = await sdk.getCollectionStats(leaderboard[0].collection);
    console.log(JSON.stringify(collStats, null, 2));
  }

  // 1.4 Feedbacks by tag
  console.log('\n1.4 getFeedbacksByTag("quality"):');
  const feedbacksByTag = await sdk.getFeedbacksByTag('quality');
  console.log(`Count: ${feedbacksByTag.length}`);

  // 1.5 Search agents
  console.log('\n1.5 searchAgents({ limit: 2 }):');
  const searchResults = await sdk.searchAgents({ limit: 2 });
  console.log(`Count: ${searchResults.length}`);

  // ============================================================
  // SECTION 2: READ APIs (On-Chain)
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('SECTION 2: ON-CHAIN READ APIs');
  console.log('='.repeat(60));

  // 2.1 Get Program IDs
  console.log('\n2.1 getProgramIds():');
  const programIds = sdk.getProgramIds();
  console.log('  Identity Registry:', programIds.identityRegistry.toBase58());

  // 2.2 Get Registries
  console.log('\n2.2 registries():');
  const registries = sdk.registries();
  console.log('  IDENTITY:', registries.IDENTITY);
  console.log('  REPUTATION:', registries.REPUTATION);
  console.log('  VALIDATION:', registries.VALIDATION);

  // 2.3 Get Collection (if we have an agent)
  if (leaderboard.length > 0) {
    const collectionPubkey = new PublicKey(leaderboard[0].collection);
    console.log('\n2.3 getCollection():');
    const collInfo = await sdk.getCollection(collectionPubkey);
    console.log(JSON.stringify(collInfo, (k, v) => v?.toBase58 ? v.toBase58() : v, 2));
  }

  // 2.4 Get Agent (on-chain)
  if (leaderboard.length > 0) {
    const assetPubkey = new PublicKey(leaderboard[0].asset);
    console.log('\n2.4 getAgent():');
    try {
      const agent = await sdk.getAgent(assetPubkey);
      console.log('  Agent found:', agent ? 'Yes' : 'No');
      if (agent) {
        console.log('  Collection:', agent.getCollectionPublicKey().toBase58());
        console.log('  Owner:', agent.getOwnerPublicKey().toBase58());
      }
    } catch (e: any) {
      console.log('  Error:', e.message);
    }
  }

  // 2.5 Get Summary (reputation)
  if (leaderboard.length > 0) {
    const assetPubkey = new PublicKey(leaderboard[0].asset);
    console.log('\n2.5 getSummary():');
    try {
      const summary = await sdk.getSummary(assetPubkey);
      console.log(JSON.stringify(summary, (k, v) => v?.toBase58 ? v.toBase58() : v, 2));
    } catch (e: any) {
      console.log('  Error:', e.message);
    }
  }

  // 2.6 Get ATOM Stats
  if (leaderboard.length > 0) {
    const assetPubkey = new PublicKey(leaderboard[0].asset);
    console.log('\n2.6 getAtomStats():');
    try {
      const atomStats = await sdk.getAtomStats(assetPubkey);
      console.log(JSON.stringify(atomStats, null, 2));
    } catch (e: any) {
      console.log('  Error:', e.message);
    }
  }

  // 2.7 Get Enriched Summary
  if (leaderboard.length > 0) {
    const assetPubkey = new PublicKey(leaderboard[0].asset);
    console.log('\n2.7 getEnrichedSummary():');
    try {
      const enriched = await sdk.getEnrichedSummary(assetPubkey);
      console.log(JSON.stringify(enriched, (k, v) => {
        if (v?.toBase58) return v.toBase58();
        if (typeof v === 'bigint') return v.toString();
        return v;
      }, 2));
    } catch (e: any) {
      console.log('  Error:', e.message);
    }
  }

  // ============================================================
  // SECTION 3: WRITE APIs
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('SECTION 3: WRITE APIs');
  console.log('='.repeat(60));

  // 3.1 Create Collection
  console.log('\n3.1 createCollection():');
  let newCollection: PublicKey | null = null;
  try {
    const result = await sdk.createCollection(
      `TestColl-${Date.now()}`,  // name (max 32 bytes)
      `ipfs://QmColl${Date.now()}`,  // uri
    ) as any;
    console.log('  Success:', result.success);
    console.log('  Signature:', result.signature);
    if (result.collection) {
      newCollection = result.collection;
      console.log('  Collection:', result.collection.toBase58());
    }
    if (result.error) {
      console.log('  Error:', result.error);
    }
  } catch (e: any) {
    console.log('  Error:', e.message);
  }

  // Wait for confirmation
  if (newCollection) {
    console.log('  Waiting for confirmation...');
    await new Promise(r => setTimeout(r, 2000));
  }

  // 3.2 Register Agent (in new collection if created, otherwise base)
  console.log('\n3.2 registerAgent():');
  if (newCollection) {
    console.log('  Using collection:', newCollection.toBase58());
  } else {
    console.log('  Using: base collection (default)');
  }
  let newAgentAsset: PublicKey | null = null;
  try {
    // SDK signature: registerAgent(tokenUri?, collection?, options?)
    const result = await sdk.registerAgent(
      `ipfs://QmTest${Date.now()}`,  // tokenUri
      newCollection || undefined,  // use new collection if available
    );
    console.log('  Success:', result.success);
    console.log('  Signature:', result.signature);
    if (result.asset) {
      newAgentAsset = result.asset;
      console.log('  Asset:', result.asset.toBase58());
    }
  } catch (e: any) {
    console.log('  Error:', e.message);
  }

  // Wait for confirmation
  if (newAgentAsset) {
    console.log('  Waiting for confirmation...');
    await new Promise(r => setTimeout(r, 2000));
  }

  // 3.3 Set Metadata
  if (newAgentAsset) {
    console.log('\n3.3 setMetadata():');
    try {
      const result = await sdk.setMetadata(newAgentAsset, 'description', 'Test agent for SDK validation');
      console.log('  Success:', result.success);
      console.log('  Signature:', result.signature);
    } catch (e: any) {
      console.log('  Error:', e.message);
    }
  }

  // 3.4 Give Feedback (need a different agent - NOT owned by our wallet)
  // Note: Program prevents self-feedback (owner cannot rate own agent)
  console.log('\n3.4 giveFeedback():');

  // Try to find an agent NOT owned by our wallet
  const allAgents = await sdk.searchAgents({ limit: 20 });
  const otherAgent = allAgents.find((a: any) => a.owner !== signer.publicKey.toBase58());

  if (otherAgent) {
    const targetAsset = new PublicKey(otherAgent.asset);
    console.log('  Target asset:', targetAsset.toBase58());
    console.log('  Target owner:', otherAgent.owner);
    try {
      const result = await sdk.giveFeedback(targetAsset, {
        score: 85,
        tag1: 'test',
        tag2: 'sdk',
        endpoint: '/api/test',
        feedbackUri: `ipfs://QmFeedback${Date.now()}`,
        feedbackHash: Buffer.alloc(32, 1),
      }) as any;
      console.log('  Success:', result.success);
      console.log('  Signature:', result.signature);
      if (result.error) {
        console.log('  Error:', result.error);
      }
    } catch (e: any) {
      console.log('  Catch Error:', e.message);
    }
  } else {
    console.log('  SKIPPED: All agents owned by current wallet (self-feedback not allowed)');
    console.log('  Note: Program enforces SelfFeedbackNotAllowed constraint');
  }

  // 3.5 Read Feedback we just created
  if (leaderboard.length > 0) {
    const targetAsset = new PublicKey(leaderboard[0].asset);
    console.log('\n3.5 readFeedback():');
    try {
      const feedback = await sdk.readFeedback(targetAsset, signer.publicKey, 0);
      console.log('  Feedback found:', feedback ? 'Yes' : 'No');
      if (feedback) {
        console.log('  Score:', feedback.score);
        console.log('  Tag1:', feedback.tag1);
      }
    } catch (e: any) {
      console.log('  Error:', e.message);
    }
  }

  // 3.6 Revoke Feedback
  if (leaderboard.length > 0) {
    const targetAsset = new PublicKey(leaderboard[0].asset);
    console.log('\n3.6 revokeFeedback():');
    try {
      const result = await sdk.revokeFeedback(targetAsset, 0);
      console.log('  Success:', result.success);
      console.log('  Signature:', result.signature);
    } catch (e: any) {
      console.log('  Error:', e.message);
    }
  }

  // ============================================================
  // SECTION 4: UTILITY APIs
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('SECTION 4: UTILITY APIs');
  console.log('='.repeat(60));

  // 4.1 SDK State
  console.log('\n4.1 SDK State:');
  console.log('  isReadOnly:', sdk.isReadOnly);
  console.log('  canWrite:', sdk.canWrite);
  console.log('  getCluster():', sdk.getCluster());
  console.log('  getRpcUrl():', sdk.getRpcUrl());
  console.log('  isUsingDefaultDevnetRpc():', sdk.isUsingDefaultDevnetRpc());

  // 4.2 Chain ID
  console.log('\n4.2 chainId():');
  const chainId = await sdk.chainId();
  console.log('  Chain ID:', chainId);

  // 4.3 Indexer availability
  console.log('\n4.3 isIndexerAvailable():');
  const indexerAvailable = await sdk.isIndexerAvailable();
  console.log('  Available:', indexerAvailable);

  // 4.4 Get Indexer Client
  console.log('\n4.4 getIndexerClient():');
  const indexerClient = sdk.getIndexerClient();
  console.log('  Client:', indexerClient ? 'Available' : 'Not available');

  console.log('\n' + '='.repeat(60));
  console.log('=== TEST COMPLETE ===');
  console.log('='.repeat(60));
}

main().catch(console.error);
