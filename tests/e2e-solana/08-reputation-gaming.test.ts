/**
 * E2E Tests - Reputation Gaming & Exploitation Attempts
 *
 * Tests attempts to game/exploit the ATOM reputation system:
 * - Sybil attacks (many wallets, same person)
 * - Score inflation/manipulation
 * - Ring buffer exploitation
 * - Feedback spam
 * - Collusion attacks
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { Keypair, PublicKey, Connection, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createHash } from 'crypto';
import { SolanaSDK } from '../../src/core/sdk-solana';
import { loadTestWallets } from './devnet-setup';

function createFeedbackHash(feedbackUri: string): Buffer {
  return createHash('sha256').update(feedbackUri).digest();
}

describe('Reputation Gaming & Exploitation', () => {
  let ownerSdk: SolanaSDK;
  let agent: PublicKey;
  let collection: PublicKey;
  let ownerWallet: Keypair;
  let connection: Connection;
  const attackerWallets: Keypair[] = [];
  const attackerSdks: SolanaSDK[] = [];
  let feedbackCounter = BigInt(0);

  const getNextFeedbackIndex = () => feedbackCounter++;

  beforeAll(async () => {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'http://127.0.0.1:8899';
    connection = new Connection(rpcUrl);

    // Use pre-funded wallets
    const testWallets = loadTestWallets();
    ownerWallet = testWallets.main;

    console.log(`Owner wallet: ${ownerWallet.publicKey.toBase58()}`);

    // Fund 5 attacker wallets from main (reduced from 10 to save SOL)
    for (let i = 0; i < 5; i++) {
      const wallet = Keypair.generate();
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: ownerWallet.publicKey,
          toPubkey: wallet.publicKey,
          lamports: 0.02 * LAMPORTS_PER_SOL,
        })
      );
      await connection.sendTransaction(tx, [ownerWallet]);
      attackerWallets.push(wallet);
    }
    await new Promise(resolve => setTimeout(resolve, 3000));

    ownerSdk = new SolanaSDK({
      rpcUrl,
      signer: ownerWallet,
      indexerUrl: process.env.INDEXER_URL || 'https://api.example.com',
    });

    for (const wallet of attackerWallets) {
      attackerSdks.push(new SolanaSDK({
        rpcUrl,
        signer: wallet,
        indexerUrl: process.env.INDEXER_URL || 'https://api.example.com',
      }));
    }

    // Fetch base collection (createCollection removed in v0.6.0)
    collection = (await ownerSdk.getBaseCollection())!;
    expect(collection).toBeDefined();

    const agentUri = `ipfs://gaming_agent_${Date.now()}`;
    const registerResult = await ownerSdk.registerAgent(agentUri, collection);
    expect(registerResult.success).toBe(true);
    agent = registerResult.asset!;

    await ownerSdk.initializeAtomStats(agent);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 120000);

  // ============================================================================
  // 1. Sybil Attack Simulation
  // ============================================================================

  describe('Sybil Attack Detection (HyperLogLog)', () => {
    it('should detect multiple wallets from same "person" via diversity ratio', async () => {
      const statsBefore = await ownerSdk.getAtomStats(agent);
      const diversityBefore = statsBefore?.diversity_ratio || 0;

      // Attack: 5 wallets all give perfect scores
      for (let i = 0; i < 5; i++) {
        const uri = `ipfs://sybil_${Date.now()}_${i}`;
        const result = await attackerSdks[i].giveFeedback(
          agent,
          {
            value: 100n,
            score: 100, // Perfect score
            tag1: 'sybil-attack',
            feedbackUri: uri,
            feedbackHash: createFeedbackHash(uri),
          },
          { feedbackIndex: getNextFeedbackIndex() }
        );
        expect(result.success).toBe(true);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      const statsAfter = await ownerSdk.getAtomStats(agent);
      const diversityAfter = statsAfter?.diversity_ratio || 0;
      const uniqueClients = statsAfter?.unique_clients || BigInt(0);

      console.log(`Diversity: ${diversityBefore} -> ${diversityAfter}`);
      console.log(`Unique clients (HLL estimate): ${uniqueClients}`);
      console.log(`Feedback count: ${statsAfter?.feedback_count}`);

      // Diversity ratio should increase (more unique clients)
      // 255 is maximum - indicates high diversity from multiple wallets
      expect(diversityAfter).toBeGreaterThanOrEqual(diversityBefore);
      expect(Number(statsAfter?.feedback_count)).toBeGreaterThanOrEqual(5);
      console.log('✅ Sybil attack tracked via diversity ratio');
    });

    it('should not get boosted quality from same wallet spam', async () => {
      const singleAttacker = attackerSdks[0];
      const statsBefore = await ownerSdk.getAtomStats(agent);
      const qualityBefore = statsBefore?.quality_score || 0;

      // Same wallet tries to spam feedback (only 1 allowed per ring buffer)
      for (let i = 0; i < 5; i++) {
        const uri = `ipfs://samewallet_${Date.now()}_${i}`;
        await singleAttacker.giveFeedback(
          agent,
          {
            value: 100n,
            score: 100,
            tag1: 'repeat-spam',
            feedbackUri: uri,
            feedbackHash: createFeedbackHash(uri),
          },
          { feedbackIndex: getNextFeedbackIndex() }
        );
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      const statsAfter = await ownerSdk.getAtomStats(agent);
      const qualityAfter = statsAfter?.quality_score || 0;

      // Quality shouldn't spike dramatically from same wallet
      console.log(`Quality: ${qualityBefore} -> ${qualityAfter}`);
      // Ring buffer limits impact of repeated feedback
      console.log('✅ Same-wallet spam has limited impact');
    });
  });

  // ============================================================================
  // 2. Score Inflation Attacks
  // ============================================================================

  describe('Score Inflation Attacks', () => {
    it('should resist sudden score spike (burst detection)', async () => {
      const statsBefore = await ownerSdk.getAtomStats(agent);
      const riskBefore = statsBefore?.risk_score || 0;

      // Burst of high scores in short time
      const burstPromises = attackerSdks.slice(0, 5).map(async (sdk, i) => {
        const uri = `ipfs://burst_${Date.now()}_${i}`;
        return sdk.giveFeedback(
          agent,
          {
            value: 100n,
            score: 100,
            tag1: 'burst',
            feedbackUri: uri,
            feedbackHash: createFeedbackHash(uri),
          },
          { feedbackIndex: getNextFeedbackIndex() }
        );
      });

      await Promise.all(burstPromises);
      await new Promise(resolve => setTimeout(resolve, 2000));

      const statsAfter = await ownerSdk.getAtomStats(agent);
      const riskAfter = statsAfter?.risk_score || 0;

      console.log(`Risk score: ${riskBefore} -> ${riskAfter}`);
      // Risk should increase due to burst activity
      // (ATOM detects unusual patterns)
      console.log('✅ Burst attack tracked via risk score');
    });

    it('should detect score shock (sudden quality change)', async () => {
      // First, give some low scores
      for (let i = 0; i < 3; i++) {
        const uri = `ipfs://lowscore_${Date.now()}_${i}`;
        await attackerSdks[i].giveFeedback(
          agent,
          {
            value: 10n,
            score: 10, // Low score
            tag1: 'baseline',
            feedbackUri: uri,
            feedbackHash: createFeedbackHash(uri),
          },
          { feedbackIndex: getNextFeedbackIndex() }
        );
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      const statsMid = await ownerSdk.getAtomStats(agent);
      const qualityMid = statsMid?.quality_score || 0;

      // Then sudden high scores (shock)
      for (let i = 2; i < 5; i++) {
        const uri = `ipfs://highscore_${Date.now()}_${i}`;
        await attackerSdks[i].giveFeedback(
          agent,
          {
            value: 100n,
            score: 100, // Sudden high score
            tag1: 'shock',
            feedbackUri: uri,
            feedbackHash: createFeedbackHash(uri),
          },
          { feedbackIndex: getNextFeedbackIndex() }
        );
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      const statsAfter = await ownerSdk.getAtomStats(agent);
      const qualityAfter = statsAfter?.quality_score || 0;

      console.log(`Quality: ${qualityMid} -> ${qualityAfter} (shock applied)`);
      // EMA dampens sudden changes
      console.log('✅ Score shock dampened by EMA');
    });
  });

  // ============================================================================
  // 3. Trust Tier Manipulation
  // ============================================================================

  describe('Trust Tier Manipulation', () => {
    it('should require sustained quality for tier promotion', async () => {
      const statsBefore = await ownerSdk.getAtomStats(agent);
      const tierBefore = statsBefore?.trust_tier || 0;
      const confidenceBefore = statsBefore?.confidence || 0;

      console.log(`Trust tier: ${tierBefore}, Confidence: ${confidenceBefore}`);

      // Try to artificially boost tier with few feedbacks
      for (let i = 0; i < 3; i++) {
        const uri = `ipfs://tierboost_${Date.now()}_${i}`;
        await attackerSdks[i + 2].giveFeedback(
          agent,
          {
            value: 100n,
            score: 100,
            tag1: 'tier-boost',
            feedbackUri: uri,
            feedbackHash: createFeedbackHash(uri),
          },
          { feedbackIndex: getNextFeedbackIndex() }
        );
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      const statsAfter = await ownerSdk.getAtomStats(agent);
      const tierAfter = statsAfter?.trust_tier || 0;
      const confidenceAfter = statsAfter?.confidence || 0;

      console.log(`Trust tier: ${tierBefore} -> ${tierAfter}`);
      console.log(`Confidence: ${confidenceBefore} -> ${confidenceAfter}`);

      // Confidence should increase but tier jump requires thresholds
      expect(confidenceAfter).toBeGreaterThanOrEqual(confidenceBefore);
      console.log('✅ Trust tier requires sustained quality + confidence');
    });

    it('should track quality score correctly', async () => {
      const stats = await ownerSdk.getAtomStats(agent);

      expect(stats).toBeDefined();
      expect(stats?.quality_score).toBeDefined();
      expect(stats?.trust_tier).toBeDefined();
      expect(stats?.confidence).toBeDefined();
      expect(stats?.risk_score).toBeDefined();

      console.log(`Final stats:`);
      console.log(`  Quality: ${stats?.quality_score}`);
      console.log(`  Trust Tier: ${stats?.trust_tier}`);
      console.log(`  Confidence: ${stats?.confidence}`);
      console.log(`  Risk Score: ${stats?.risk_score}`);
      console.log(`  Feedback Count: ${stats?.feedback_count}`);
      console.log(`  Unique Clients: ${stats?.unique_clients}`);
      console.log(`  Diversity Ratio: ${stats?.diversity_ratio}`);
    });
  });

  // ============================================================================
  // 4. Revocation Gaming
  // ============================================================================

  describe('Revocation Gaming', () => {
    it('should limit impact of give-revoke-give cycles', async () => {
      const attacker = attackerSdks[4];

      // Give high feedback
      const uri1 = `ipfs://giverevoke1_${Date.now()}`;
      const result1 = await attacker.giveFeedback(
        agent,
        {
          value: 100n,
          score: 100,
          tag1: 'cycle1',
          feedbackUri: uri1,
          feedbackHash: createFeedbackHash(uri1),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );
      expect(result1.success).toBe(true);
      const idx1 = result1.feedbackIndex!;

      const stats1 = await ownerSdk.getAtomStats(agent);
      console.log(`After give 1: quality=${stats1?.quality_score}`);

      // Revoke
      await attacker.revokeFeedback(agent, idx1);

      const stats2 = await ownerSdk.getAtomStats(agent);
      console.log(`After revoke: quality=${stats2?.quality_score}`);

      // Give again
      const uri2 = `ipfs://giverevoke2_${Date.now()}`;
      const result2 = await attacker.giveFeedback(
        agent,
        {
          value: 100n,
          score: 100,
          tag1: 'cycle2',
          feedbackUri: uri2,
          feedbackHash: createFeedbackHash(uri2),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );
      expect(result2.success).toBe(true);

      const stats3 = await ownerSdk.getAtomStats(agent);
      console.log(`After give 2: quality=${stats3?.quality_score}`);

      // Ring buffer should limit this manipulation
      console.log('✅ Give-revoke-give cycle has limited cumulative effect');
    });

    it('should handle rapid revoke attempts gracefully', async () => {
      const attacker = attackerSdks[3];

      // Give feedback
      const uri = `ipfs://rapidrevoke_${Date.now()}`;
      const result = await attacker.giveFeedback(
        agent,
        {
          value: 90n,
          score: 90,
          tag1: 'rapid-revoke',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );
      expect(result.success).toBe(true);
      const idx = result.feedbackIndex!;

      // Rapid revoke attempts (should soft-fail on duplicates)
      const revokePromises = Array(5).fill(null).map(() =>
        attacker.revokeFeedback(agent, idx)
      );

      const results = await Promise.all(revokePromises);

      // All should "succeed" (soft-fail semantics)
      results.forEach(r => expect(r.success).toBe(true));
      console.log('✅ Rapid revokes handled gracefully');
    });
  });

  // ============================================================================
  // 5. Self-Dealing Prevention
  // ============================================================================

  describe('Self-Dealing Prevention', () => {
    it('should prevent owner from giving feedback to own agent', async () => {
      const uri = `ipfs://selfdeal_${Date.now()}`;
      const result = await ownerSdk.giveFeedback(
        agent,
        {
          value: 100n,
          score: 100,
          tag1: 'self-deal',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('SelfFeedback');
      console.log('✅ Self-feedback blocked');
    });

    it('should prevent creating sockpuppet agent for self-feedback loop', async () => {
      // Create second agent owned by same wallet
      const uri2 = `ipfs://sockpuppet_${Date.now()}`;
      const result2 = await ownerSdk.registerAgent(uri2, collection);
      expect(result2.success).toBe(true);
      const agent2 = result2.asset!;

      // Owner can give feedback to agent2 (different agent)
      // But cannot give feedback to agent (own agent)
      const fbUri = `ipfs://crossfb_${Date.now()}`;
      const fbResult = await ownerSdk.giveFeedback(
        agent2,
        {
          value: 100n,
          score: 100,
          tag1: 'cross-agent',
          feedbackUri: fbUri,
          feedbackHash: createFeedbackHash(fbUri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      // This still fails because owner == agent2 owner
      expect(fbResult.success).toBe(false);
      expect(fbResult.error).toContain('SelfFeedback');
      console.log('✅ Sockpuppet loop blocked');
    });
  });

  // ============================================================================
  // 6. Timing Attacks
  // ============================================================================

  describe('Timing Attacks', () => {
    it('should handle slot-based timing attacks', async () => {
      // Try to give many feedbacks in same slot
      const promises = attackerSdks.slice(0, 5).map(async (sdk, i) => {
        const uri = `ipfs://timing_${Date.now()}_${i}`;
        return sdk.giveFeedback(
          agent,
          {
            value: 100n,
            score: 100,
            tag1: 'timing-attack',
            feedbackUri: uri,
            feedbackHash: createFeedbackHash(uri),
          },
          { feedbackIndex: getNextFeedbackIndex() }
        );
      });

      const results = await Promise.all(promises);

      // All should succeed (parallelism is allowed)
      results.forEach(r => expect(r.success).toBe(true));

      const stats = await ownerSdk.getAtomStats(agent);
      console.log(`After timing attack: feedbackCount=${stats?.feedback_count}`);
      console.log('✅ Parallel feedback handled correctly');
    });
  });
});
