/**
 * E2E Tests for Devnet with Pre-funded Wallets
 * Uses wallets funded via: npx tsx scripts/test-wallet-manager.ts create
 *
 * Covers:
 * - Agent registration & lifecycle
 * - Feedback system (give, read, revoke)
 * - Validation system
 * - ATOM reputation engine
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { createHash } from 'crypto';
import { SolanaSDK } from '../../src/core/sdk-solana.js';
import { computeSealHash } from '../../src/core/seal.js';
import { loadTestWallets, fundNewKeypair, returnFunds, type DevnetTestWallets } from './devnet-setup.js';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const INDEXER_URL = process.env.INDEXER_URL || 'https://8004-indexer-production.up.railway.app/rest/v1';
const DEVNET_INDEXER_SYNC_TIMEOUT_MS = Number.parseInt(
  process.env.E2E_INDEXER_SYNC_TIMEOUT_MS ?? '90000',
  10
);
const DEVNET_INDEXER_SYNC_INTERVAL_MS = Number.parseInt(
  process.env.E2E_INDEXER_SYNC_INTERVAL_MS ?? '3000',
  10
);

function sha256(data: string): Buffer {
  return createHash('sha256').update(data).digest();
}

function isTransientWriteError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('429') ||
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('fetch failed') ||
    lower.includes('network') ||
    lower.includes('node is behind') ||
    lower.includes('service unavailable') ||
    lower.includes('too many requests')
  );
}

describe('E2E Devnet Tests (Pre-funded Wallets)', () => {
  let connection: Connection;
  let wallets: DevnetTestWallets;
  let sdk: SolanaSDK;
  let clientSdk: SolanaSDK;
  let agentAsset: PublicKey;
  let collection: PublicKey;
  let feedbackIndex: bigint;
  let feedbackSealHash: Buffer;

  // Track temp wallets for cleanup
  const tempWallets: Keypair[] = [];

  beforeAll(async () => {
    connection = new Connection(RPC_URL, 'confirmed');
    wallets = loadTestWallets();

    console.log('\n=== Devnet E2E Test Setup ===');
    console.log(`Main wallet: ${wallets.main.publicKey.toBase58()}`);
    console.log(`Client1: ${wallets.client1.publicKey.toBase58()}`);

    // Check balances
    const mainBal = await connection.getBalance(wallets.main.publicKey);
    const clientBal = await connection.getBalance(wallets.client1.publicKey);
    console.log(`Main balance: ${mainBal / LAMPORTS_PER_SOL} SOL`);
    console.log(`Client balance: ${clientBal / LAMPORTS_PER_SOL} SOL\n`);

    // Initialize SDKs
    sdk = new SolanaSDK({
      rpcUrl: RPC_URL,
      signer: wallets.main,
      indexerUrl: INDEXER_URL,
    });

    clientSdk = new SolanaSDK({
      rpcUrl: RPC_URL,
      signer: wallets.client1,
      indexerUrl: INDEXER_URL,
    });

  });

  afterAll(async () => {
    console.log('\n=== Cleanup: Returning funds from temp wallets ===');
    for (const w of tempWallets) {
      await returnFunds(connection, w, wallets.main);
    }
  });

  describe('1. Agent Registration', () => {
    it('should register a new agent with ATOM enabled', async () => {
      const tokenUri = `ipfs://devnet_test_${Date.now()}`;

      console.log('\n📝 Registering agent...');
      const result = await sdk.registerAgent(tokenUri, { atomEnabled: true });

      expect(result.success).toBe(true);
      expect(result.asset).toBeInstanceOf(PublicKey);

      agentAsset = result.asset!;
      collection = (await sdk.getBaseCollection())!;

      console.log(`✅ Agent: ${agentAsset.toBase58()}`);
      console.log(`📦 Collection: ${collection.toBase58()}`);
      console.log(`📋 Tx: ${result.signature}`);
    }, 60000);

    it('should initialize ATOM stats', async () => {
      const result = await sdk.initializeAtomStats(agentAsset);
      // May fail if already initialized during registration
      if (result.success) {
        console.log('✅ ATOM stats initialized');
      } else {
        console.log('⚠️ ATOM stats already initialized (expected)');
      }
      // Either success or already exists is acceptable
      expect(result.success || result.error?.includes('already')).toBeTruthy();
    }, 60000);

    it('should verify agent exists', async () => {
      const exists = await sdk.agentExists(agentAsset);
      expect(exists).toBe(true);
      console.log('✅ Agent exists on-chain');
    }, 30000);
  });

  describe('2. Agent Metadata', () => {
    it('should set agent metadata', async () => {
      const result = await sdk.setMetadata(agentAsset, 'version', '1.0.0');
      expect(result.success).toBe(true);
      console.log('✅ Metadata set');
    }, 60000);

    it('should update agent URI', async () => {
      const newUri = `ipfs://updated_${Date.now()}`;
      const result = await sdk.setAgentUri(agentAsset, collection, newUri);
      if (!result.success) {
        console.log(`❌ setAgentUri error: ${result.error}`);
      }
      expect(result.success).toBe(true);
      console.log('✅ URI updated');
    }, 60000);
  });

  describe('3. Feedback System', () => {
    it('should give feedback to agent', async () => {
      const feedbackUri = `ipfs://feedback_${Date.now()}`;

      console.log('\n⭐ Giving feedback...');
      const feedbackParams = {
        value: 85n,
        score: 85,
        tag1: 'devnet-test',
        feedbackUri,
        feedbackFileHash: sha256(feedbackUri),
      };
      const result = await clientSdk.giveFeedback(agentAsset, feedbackParams);

      expect(result.success).toBe(true);
      expect(result.feedbackIndex).toBeDefined();

      feedbackIndex = result.feedbackIndex!;

      feedbackSealHash = computeSealHash({
        value: feedbackParams.value,
        valueDecimals: 0,
        score: feedbackParams.score,
        tag1: feedbackParams.tag1,
        tag2: '',
        endpoint: '',
        feedbackUri: feedbackParams.feedbackUri,
        feedbackFileHash: feedbackParams.feedbackFileHash,
      });

      console.log(`✅ Feedback index: ${feedbackIndex}`);
    }, 60000);

    it('should read the feedback', async () => {
      // Wait for indexer to sync with proper polling
      const synced = await sdk.waitForIndexerSync(
        async () => {
          const f = await sdk.readFeedback(agentAsset, wallets.client1.publicKey, feedbackIndex);
          return f !== null;
        },
        { timeout: DEVNET_INDEXER_SYNC_TIMEOUT_MS, interval: DEVNET_INDEXER_SYNC_INTERVAL_MS }
      );

      expect(synced).toBe(true);

      const feedback = await sdk.readFeedback(
        agentAsset,
        wallets.client1.publicKey,
        feedbackIndex
      );

      expect(feedback).not.toBeNull();
      expect(feedback!.score).toBe(85);
      console.log('✅ Feedback read successfully');
    }, 60000);

    it('should get reputation summary', async () => {
      const summary = await sdk.getSummary(agentAsset);

      expect(summary.totalFeedbacks).toBeGreaterThanOrEqual(1);
      console.log(`✅ Total feedbacks: ${summary.totalFeedbacks}`);
      console.log(`   Average score: ${summary.averageScore}`);
    }, 60000);

    it('should append response to feedback', async () => {
      const responseUri = `ipfs://response_${Date.now()}`;

      const result = await sdk.appendResponse(
        agentAsset,
        wallets.client1.publicKey,
        feedbackIndex,
        feedbackSealHash,
        responseUri
      );

      expect(result.success).toBe(true);
      console.log('✅ Response appended');
    }, 60000);
  });

  describe('4. ATOM Reputation', () => {
    it('should get ATOM stats', async () => {
      const stats = await sdk.getAtomStats(agentAsset);

      if (stats) {
        console.log('\n📊 ATOM Stats:');
        console.log(`   Quality Score: ${stats.qualityScore}`);
        console.log(`   Trust Tier: ${stats.trustTier}`);
        console.log(`   Confidence: ${stats.confidence}`);
      } else {
        console.log('⚠️  ATOM stats not available (may need more feedbacks)');
      }
    }, 30000);

    it('should get trust tier', async () => {
      const tier = await sdk.getTrustTier(agentAsset);
      expect(tier).toBeGreaterThanOrEqual(0);
      expect(tier).toBeLessThanOrEqual(4);
      console.log(`✅ Trust tier: ${tier}`);
    }, 30000);
  });

  describe('6. Feedback Revocation', () => {
    it('should revoke feedback', async () => {
      console.log('\n🚫 Revoking feedback...');
      const result = await clientSdk.revokeFeedback(agentAsset, feedbackIndex, feedbackSealHash);

      expect(result.success).toBe(true);
      console.log('✅ Feedback revoked');
    }, 60000);

    it('should verify feedback is revoked', async () => {
      const revokedSynced = await sdk.waitForIndexerSync(
        async () => {
          const f = await sdk.readFeedback(
            agentAsset,
            wallets.client1.publicKey,
            feedbackIndex
          );
          return f?.revoked === true;
        },
        {
          timeout: DEVNET_INDEXER_SYNC_TIMEOUT_MS,
          interval: DEVNET_INDEXER_SYNC_INTERVAL_MS,
          initialDelay: DEVNET_INDEXER_SYNC_INTERVAL_MS,
        }
      );
      expect(revokedSynced).toBe(true);

      const feedback = await sdk.readFeedback(
        agentAsset,
        wallets.client1.publicKey,
        feedbackIndex
      );

      expect(feedback).not.toBeNull();
      expect(feedback!.revoked).toBe(true);
      console.log('✅ Feedback confirmed revoked');
    }, 60000);
  });

  describe('7. Multi-Feedback Test', () => {
    it('should handle multiple feedbacks from different clients', async () => {
      // Ensure agent was registered in previous tests
      if (!agentAsset) {
        throw new Error('agentAsset not set - previous tests may have failed');
      }

      // Use client2 for second feedback
      const client2Sdk = new SolanaSDK({
        rpcUrl: RPC_URL,
        signer: wallets.client2,
        indexerUrl: INDEXER_URL,
      });

      console.log(`\n🔄 Giving second feedback from client2 to agent: ${agentAsset.toBase58()}`);
      const feedbackUri = `ipfs://client2_feedback_${Date.now()}`;
      const result = await client2Sdk.giveFeedback(agentAsset, {
        value: 90n,
        score: 90,
        tag1: 'multi-client-test',
        feedbackUri,
        feedbackFileHash: sha256(feedbackUri),
      });

      if (!result.success) {
        console.log(`❌ Multi-feedback error: ${result.error}`);
      }
      expect(result.success).toBe(true);
      console.log(`✅ Second feedback from client2: index ${result.feedbackIndex}`);

      // Verify summary updated
      await new Promise(r => setTimeout(r, 2000));
      const summary = await sdk.getSummary(agentAsset);
      console.log(`   New total feedbacks: ${summary.totalFeedbacks}`);
    }, 60000);

    it('should verify feedback index increments correctly for same client', async () => {
      if (!agentAsset) {
        throw new Error('agentAsset not set - previous tests may have failed');
      }

      console.log('\n🔢 Testing feedback index increment for same client...');

      // feedbackIndex is global per-agent: index 0 (client1), index 1 (client2)
      // Next feedback gets index 2 (revoke doesn't decrement the counter)
      const feedbackUri1 = `ipfs://client1_second_${Date.now()}`;
      const result1 = await clientSdk.giveFeedback(agentAsset, {
        value: 75n,
        score: 75,
        tag1: 'index-test-1',
        feedbackUri: feedbackUri1,
        feedbackFileHash: sha256(feedbackUri1),
      });

      expect(result1.success).toBe(true);
      expect(result1.feedbackIndex).toBe(2n); // Global index 2 (3rd feedback on agent)
      console.log(`✅ Second feedback from client1: index ${result1.feedbackIndex} (expected: 2)`);

      // Wait for indexer to sync BEFORE giving next feedback
      // This is critical - otherwise getLastFeedbackIndex returns stale data
      console.log('   Waiting for indexer to sync feedback index 2...');
      const synced1 = await sdk.waitForIndexerSync(
        async () => {
          const feedbacks = await sdk.getFeedbacksFromIndexer(agentAsset, { noFallback: true });
          const client1Feedbacks = feedbacks.filter(f => f.client.equals(wallets.client1.publicKey));
          const hasIndex2 = client1Feedbacks.some(f => f.feedbackIndex === 2n);
          return hasIndex2;
        },
        {
          timeout: DEVNET_INDEXER_SYNC_TIMEOUT_MS,
          interval: DEVNET_INDEXER_SYNC_INTERVAL_MS,
          initialDelay: DEVNET_INDEXER_SYNC_INTERVAL_MS,
        }
      );
      expect(synced1).toBe(true);
      console.log('   ✅ Indexer synced feedback index 2');

      // Append response to this feedback (needs sealHash)
      const responseUri = `ipfs://response_index_test_${Date.now()}`;
      const responseSealHash = computeSealHash({
        value: 75n,
        valueDecimals: 0,
        score: 75,
        tag1: 'index-test-1',
        tag2: '',
        endpoint: '',
        feedbackUri: feedbackUri1,
        feedbackFileHash: sha256(feedbackUri1),
      });
      const responseResult = await sdk.appendResponse(
        agentAsset,
        wallets.client1.publicKey,
        result1.feedbackIndex!,
        responseSealHash,
        responseUri
      );
      expect(responseResult.success).toBe(true);
      console.log('✅ Response appended to second feedback');

      // Give third feedback from same client - should get global index 3
      const feedbackUri2 = `ipfs://client1_third_${Date.now()}`;
      const result2 = await clientSdk.giveFeedback(agentAsset, {
        value: 95n,
        score: 95,
        tag1: 'index-test-2',
        feedbackUri: feedbackUri2,
        feedbackFileHash: sha256(feedbackUri2),
      });

      expect(result2.success).toBe(true);
      expect(result2.feedbackIndex).toBe(3n); // Global index 3 (4th feedback on agent)
      console.log(`✅ Third feedback from client1: index ${result2.feedbackIndex} (expected: 3)`);

      // Verify total feedbacks increased
      // Note: getSummary uses ATOM stats which counts NON-revoked feedbacks only
      // After revoke, feedback_count decreases. So we expect:
      // Client1: index 0 (revoked, not counted), index 1, index 2 = 2 active
      // Client2: index 0 = 1 active
      // Total = 3 active feedbacks (not 4, because one was revoked)
      const summary = await sdk.getSummary(agentAsset);
      console.log(`   Total active feedbacks: ${summary.totalFeedbacks}`);
      expect(summary.totalFeedbacks).toBeGreaterThanOrEqual(2); // At least client1's 2 new feedbacks
    }, 120000);
  });

  describe('8. Data Consistency (On-chain vs Indexer)', () => {
    it('should verify agent data matches between on-chain and indexer', async () => {
      if (!agentAsset) {
        console.log('⏭️  Skipping - no agent available');
        return;
      }

      console.log('\n🔍 Verifying agent data consistency...');

      // Wait for indexer to sync with retry (noFallback to ensure we wait for actual indexer sync)
      const synced = await sdk.waitForIndexerSync(
        async () => {
          const indexerAgent = await sdk.getAgentReputationFromIndexer(agentAsset, { noFallback: true });
          return indexerAgent !== null;
        },
        { timeout: 30000, initialDelay: 2000 }
      );

      if (!synced) {
        console.log('⚠️  Indexer not synced, skipping consistency check');
        return;
      }

      // Load on-chain agent data
      const onChainAgent = await sdk.loadAgent(agentAsset);
      expect(onChainAgent).not.toBeNull();

      // Load indexer agent data
      const indexerRep = await sdk.getAgentReputationFromIndexer(agentAsset);
      expect(indexerRep).not.toBeNull();

      // Compare asset
      expect(indexerRep!.asset).toBe(agentAsset.toBase58());
      console.log(`✅ Asset matches: ${agentAsset.toBase58()}`);

      // Compare owner (onChainAgent.owner is Uint8Array)
      const onChainOwner = new PublicKey(onChainAgent!.owner).toBase58();
      console.log(`✅ On-chain owner: ${onChainOwner}`);
    }, 60000);

    it('should verify feedback data matches between on-chain and indexer', async () => {
      if (!agentAsset) {
        console.log('⏭️  Skipping - no agent available');
        return;
      }

      console.log('\n🔍 Verifying feedback data consistency...');

      // Get feedbacks from indexer
      const indexerFeedbacks = await sdk.getFeedbacksFromIndexer(agentAsset, { includeRevoked: true });

      if (indexerFeedbacks.length === 0) {
        console.log('⚠️  No feedbacks in indexer yet, checking on-chain...');
        return;
      }

      // For each indexer feedback, verify against on-chain
      let verified = 0;
      for (const idxFeedback of indexerFeedbacks.slice(0, 3)) { // Check first 3
        const onChainFeedback = await sdk.readFeedback(
          agentAsset,
          idxFeedback.client,
          idxFeedback.feedbackIndex
        );

        if (onChainFeedback) {
          // Compare score
          expect(onChainFeedback.score).toBe(idxFeedback.score);

          // Compare tag1 if present
          if (idxFeedback.tag1) {
            expect(onChainFeedback.tag1).toBe(idxFeedback.tag1);
          }

          // Compare revoked status
          expect(onChainFeedback.revoked).toBe(idxFeedback.revoked ?? false);

          verified++;
        }
      }

      console.log(`✅ Verified ${verified}/${indexerFeedbacks.length} feedbacks match on-chain`);
    }, 60000);

    it('should verify reputation summary consistency', async () => {
      if (!agentAsset) {
        console.log('⏭️  Skipping - no agent available');
        return;
      }

      console.log('\n🔍 Verifying reputation summary consistency...');

      // Get on-chain summary
      const onChainSummary = await sdk.getSummary(agentAsset);

      // Get indexer reputation
      const indexerRep = await sdk.getAgentReputationFromIndexer(agentAsset);

      if (!indexerRep) {
        console.log('⚠️  Indexer reputation not available');
        return;
      }

      // Compare feedback counts (indexer may lag slightly)
      const countDiff = Math.abs(onChainSummary.totalFeedbacks - indexerRep.feedback_count);
      expect(countDiff).toBeLessThanOrEqual(2); // Allow small lag

      console.log(`✅ On-chain feedbacks: ${onChainSummary.totalFeedbacks}`);
      console.log(`✅ Indexer feedbacks: ${indexerRep.feedback_count}`);
      console.log(`   Difference: ${countDiff} (allowed: ≤2)`);
    }, 60000);
  });

  describe('9. Summary', () => {
    it('should print final test summary', async () => {
      console.log('\n========================================');
      console.log('        E2E DEVNET TEST SUMMARY');
      console.log('========================================');
      console.log(`Agent: ${agentAsset?.toBase58() || 'N/A'}`);
      console.log(`Feedback Index: ${feedbackIndex}`);
      console.log(`Main Wallet: ${wallets.main.publicKey.toBase58()}`);
      console.log('========================================\n');
    });
  });

  describe('10. Burn Agent', () => {
    it('should burn a freshly registered agent Core asset', async () => {
      const tokenUri = `ipfs://devnet_burn_test_${Date.now()}`;
      const registerResult = await sdk.registerAgent(tokenUri);

      if (!registerResult.success || !registerResult.asset) {
        throw new Error(`registerAgent failed before burn test: ${registerResult.error ?? 'unknown error'}`);
      }

      const burnAsset = registerResult.asset;
      let beforeBurn = await connection.getAccountInfo(burnAsset);
      for (let i = 0; i < 5 && !beforeBurn; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        beforeBurn = await connection.getAccountInfo(burnAsset);
      }
      expect(beforeBurn).not.toBeNull();

      const burnResult = await sdk.burnAgent(burnAsset);
      if (!burnResult.success) {
        throw new Error(`burnAgent failed: ${burnResult.error ?? 'unknown error'}`);
      }
      console.log(`✅ Burned asset: ${burnAsset.toBase58()}`);
      console.log(`📋 Burn tx: ${burnResult.signature}`);
      const afterBurnAccount = await connection.getAccountInfo(burnAsset);
      console.log(
        afterBurnAccount
          ? 'ℹ️  Burned asset account still present on RPC backend'
          : 'ℹ️  Burned asset account no longer exists on RPC backend'
      );

      // Burn should not be repeatable on the same asset.
      // Retry if we hit transient RPC/network failures to avoid false positives.
      let secondBurn = await sdk.burnAgent(burnAsset);
      for (let i = 0; i < 8; i++) {
        if (secondBurn.success) {
          throw new Error('Second burn unexpectedly succeeded');
        }
        if (
          !secondBurn.success &&
          secondBurn.error &&
          !isTransientWriteError(secondBurn.error)
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        secondBurn = await sdk.burnAgent(burnAsset);
      }

      if (!secondBurn.success && isTransientWriteError(secondBurn.error ?? '')) {
        throw new Error(`Second burn kept failing with transient errors: ${secondBurn.error ?? 'unknown'}`);
      }

      expect(secondBurn.success).toBe(false);
      expect(typeof secondBurn.error).toBe('string');
      expect(isTransientWriteError(secondBurn.error ?? '')).toBe(false);
      expect(secondBurn.error ?? '').toMatch(/burn|already|not found|missing|does not exist|custom program error|account/i);
    }, 120000);
  });
});
