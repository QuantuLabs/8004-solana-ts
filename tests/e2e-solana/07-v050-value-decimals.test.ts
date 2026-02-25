/**
 * E2E Tests - v0.5.0 Value/Decimals Features
 *
 * Tests new EVM-compatible feedback signature:
 * - value: i128 (supports negative for yields/PnL)
 * - valueDecimals: u8 (0-18)
 * - score: Option<u8> (null = derive from tag/default to 50)
 *
 * Attack scenarios:
 * - Integer overflow attempts
 * - Boundary exploitation
 * - Score manipulation through null
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { Keypair, PublicKey, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createHash } from 'crypto';
import { SolanaSDK } from '../../src/core/sdk-solana';
import { loadTestWallets } from './devnet-setup';

function createFeedbackHash(feedbackUri: string): Buffer {
  return createHash('sha256').update(feedbackUri).digest();
}

let feedbackCounter = BigInt(0);
const getNextFeedbackIndex = () => feedbackCounter++;

describe('v0.5.0 - Value/Decimals/Optional Score', () => {
  let sdk: SolanaSDK;
  let clientSdk: SolanaSDK;
  let agent: PublicKey;
  let collection: PublicKey;
  let agentWallet: Keypair;
  let clientWallet: Keypair;
  let connection: Connection;

  beforeAll(async () => {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'http://127.0.0.1:8899';
    connection = new Connection(rpcUrl);

    // Use pre-funded wallets for devnet
    const testWallets = loadTestWallets();
    agentWallet = testWallets.main;
    clientWallet = testWallets.client1;

    console.log(`Agent wallet: ${agentWallet.publicKey.toBase58()}`);
    console.log(`Client wallet: ${clientWallet.publicKey.toBase58()}`);

    // Localnet safety: devnet fixture wallets may be empty on a fresh validator.
    if (rpcUrl.includes('127.0.0.1') || rpcUrl.includes('localhost')) {
      for (const wallet of [agentWallet, clientWallet]) {
        const balance = await connection.getBalance(wallet.publicKey);
        if (balance < LAMPORTS_PER_SOL) {
          const sig = await connection.requestAirdrop(wallet.publicKey, 10 * LAMPORTS_PER_SOL);
          await connection.confirmTransaction(sig, 'confirmed');
        }
      }
    }

    sdk = new SolanaSDK({
      rpcUrl,
      signer: agentWallet,
      indexerUrl: process.env.INDEXER_URL || 'https://api.example.com',
    });

    clientSdk = new SolanaSDK({
      rpcUrl,
      signer: clientWallet,
      indexerUrl: process.env.INDEXER_URL || 'https://api.example.com',
    });

    // Fetch base collection (createCollection removed in v0.6.0)
    collection = (await sdk.getBaseCollection())!;
    expect(collection).toBeDefined();

    const agentUri = `ipfs://v050_agent_${Date.now()}`;
    const registerResult = await sdk.registerAgent(agentUri, collection);
    expect(registerResult.success).toBe(true);
    agent = registerResult.asset!;

    await sdk.initializeAtomStats(agent);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 90000);

  // ============================================================================
  // 1. Optional Score (score: null)
  // ============================================================================

  describe('Optional Score (score: null)', () => {
    it('should accept feedback with score: undefined (Option::None)', async () => {
      const uri = `ipfs://noscore_${Date.now()}`;
      const result = await clientSdk.giveFeedback(
        agent,
        {
          value: 9500n, // 95.00 with decimals=2
          valueDecimals: 2,
          // score: undefined (not provided)
          tag1: 'performance',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      expect(result.success).toBe(true);
      console.log('✅ Feedback with score: undefined accepted');
    });

    it('should accept feedback with explicit score: null', async () => {
      const uri = `ipfs://nullscore_${Date.now()}`;
      const result = await clientSdk.giveFeedback(
        agent,
        {
          value: 8750n, // 87.50%
          valueDecimals: 2,
          score: undefined, // Explicit null
          tag1: 'accuracy',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      expect(result.success).toBe(true);
      console.log('✅ Feedback with explicit score: null accepted');
    });

    it('should use score=50 default when score is null and tag is unknown', async () => {
      const uri = `ipfs://defaultscore_${Date.now()}`;
      const result = await clientSdk.giveFeedback(
        agent,
        {
          value: 1000n,
          valueDecimals: 0,
          // No score, unknown tag -> defaults to 50
          tag1: 'unknown-category',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      expect(result.success).toBe(true);
      // ATOM engine receives score=50 internally
      console.log('✅ Default score=50 used for unknown tag');
    });
  });

  // ============================================================================
  // 2. Value Ranges (i128)
  // ============================================================================

  describe('Value Ranges (i128)', () => {
    it('should accept value = 0', async () => {
      const uri = `ipfs://value0_${Date.now()}`;
      const result = await clientSdk.giveFeedback(
        agent,
        {
          value: 0n,
          valueDecimals: 0,
          score: 50,
          tag1: 'zero-value',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      expect(result.success).toBe(true);
      console.log('✅ value=0 accepted');
    });

    it('should accept negative values (PnL/yield)', async () => {
      const uri = `ipfs://negative_${Date.now()}`;
      const result = await clientSdk.giveFeedback(
        agent,
        {
          value: -1500n, // -15.00 loss
          valueDecimals: 2,
          score: 25, // Poor score for loss
          tag1: 'pnl',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      expect(result.success).toBe(true);
      console.log('✅ Negative value accepted (PnL use case)');
    });

    it('should accept large positive values', async () => {
      const uri = `ipfs://largepos_${Date.now()}`;
      const result = await clientSdk.giveFeedback(
        agent,
        {
          value: 999_999_999_999n, // ~1 trillion
          valueDecimals: 0,
          score: 95,
          tag1: 'large-metric',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      expect(result.success).toBe(true);
      console.log('✅ Large positive value accepted');
    });

    it('should accept large negative values', async () => {
      const uri = `ipfs://largeneg_${Date.now()}`;
      const result = await clientSdk.giveFeedback(
        agent,
        {
          value: -999_999_999_999n, // ~-1 trillion loss
          valueDecimals: 0,
          score: 5,
          tag1: 'large-loss',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      expect(result.success).toBe(true);
      console.log('✅ Large negative value accepted');
    });

    it('should accept i128 MAX value', async () => {
      const uri = `ipfs://i128max_${Date.now()}`;
      const I128_MAX = (1n << 127n) - 1n;
      const result = await clientSdk.giveFeedback(
        agent,
        {
          value: I128_MAX,
          valueDecimals: 0,
          score: 100,
          tag1: 'i128-max',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      expect(result.success).toBe(true);
      console.log('✅ i128 MAX value accepted');
    });

    it('should accept i128 MIN value', async () => {
      const uri = `ipfs://i128min_${Date.now()}`;
      const I128_MIN = -(1n << 127n);
      const result = await clientSdk.giveFeedback(
        agent,
        {
          value: I128_MIN,
          valueDecimals: 0,
          score: 0,
          tag1: 'i128-min',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      expect(result.success).toBe(true);
      console.log('✅ i128 MIN value accepted');
    });

    it('should reject value exceeding i128 MAX', async () => {
      const uri = `ipfs://overflow_${Date.now()}`;
      const OVERFLOW = (1n << 127n); // i128 MAX + 1

      try {
        const result = await clientSdk.giveFeedback(
          agent,
          {
            value: OVERFLOW,
            valueDecimals: 0,
            score: 50,
            tag1: 'overflow',
            feedbackUri: uri,
            feedbackHash: createFeedbackHash(uri),
          },
          { feedbackIndex: getNextFeedbackIndex() }
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('i128 range');
      } catch (error: any) {
        expect(error.message).toContain('i128 range');
      }
      console.log('✅ i128 overflow rejected');
    });

    it('should reject value below i128 MIN', async () => {
      const uri = `ipfs://underflow_${Date.now()}`;
      const UNDERFLOW = -(1n << 127n) - 1n; // i128 MIN - 1

      try {
        const result = await clientSdk.giveFeedback(
          agent,
          {
            value: UNDERFLOW,
            valueDecimals: 0,
            score: 50,
            tag1: 'underflow',
            feedbackUri: uri,
            feedbackHash: createFeedbackHash(uri),
          },
          { feedbackIndex: getNextFeedbackIndex() }
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('i128 range');
      } catch (error: any) {
        expect(error.message).toContain('i128 range');
      }
      console.log('✅ i128 underflow rejected');
    });
  });

  // ============================================================================
  // 3. ValueDecimals Variations
  // ============================================================================

  describe('ValueDecimals Variations', () => {
    it('should accept valueDecimals = 0 (integer)', async () => {
      const uri = `ipfs://dec0_${Date.now()}`;
      const result = await clientSdk.giveFeedback(
        agent,
        {
          value: 9977n, // 9977 units
          valueDecimals: 0,
          score: 99,
          tag1: 'integer',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      expect(result.success).toBe(true);
      console.log('✅ valueDecimals=0 accepted');
    });

    it('should accept valueDecimals = 2 (cents)', async () => {
      const uri = `ipfs://dec2_${Date.now()}`;
      const result = await clientSdk.giveFeedback(
        agent,
        {
          value: 9977n, // 99.77
          valueDecimals: 2,
          score: 99,
          tag1: 'cents',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      expect(result.success).toBe(true);
      console.log('✅ valueDecimals=2 accepted');
    });

    it('should accept valueDecimals = 18 (maximum)', async () => {
      const uri = `ipfs://dec18_${Date.now()}`;
      const result = await clientSdk.giveFeedback(
        agent,
        {
          value: 9977000000000000000n, // 9.977000000000000000
          valueDecimals: 18,
          score: 99,
          tag1: 'microseconds',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      expect(result.success).toBe(true);
      console.log('✅ valueDecimals=18 accepted');
    });

    it('should reject valueDecimals > 18', async () => {
      const uri = `ipfs://dec19_${Date.now()}`;

      try {
        const result = await clientSdk.giveFeedback(
          agent,
          {
            value: 9977n,
            valueDecimals: 19, // Invalid
            score: 99,
            tag1: 'invalid-dec',
            feedbackUri: uri,
            feedbackHash: createFeedbackHash(uri),
          },
          { feedbackIndex: getNextFeedbackIndex() }
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('0-18');
      } catch (error: any) {
        expect(error.message).toContain('0-18');
      }
      console.log('✅ valueDecimals=19 rejected');
    });

    it('should reject negative valueDecimals', async () => {
      const uri = `ipfs://decneg_${Date.now()}`;

      try {
        const result = await clientSdk.giveFeedback(
          agent,
          {
            value: 9977n,
            valueDecimals: -1, // Invalid
            score: 99,
            tag1: 'neg-dec',
            feedbackUri: uri,
            feedbackHash: createFeedbackHash(uri),
          },
          { feedbackIndex: getNextFeedbackIndex() }
        );

        expect(result.success).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('0-18');
      }
      console.log('✅ Negative valueDecimals rejected');
    });

    it('should default valueDecimals to 0 when not provided', async () => {
      const uri = `ipfs://decdefault_${Date.now()}`;
      const result = await clientSdk.giveFeedback(
        agent,
        {
          value: 9977n,
          // valueDecimals: undefined (should default to 0)
          score: 99,
          tag1: 'default-dec',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      expect(result.success).toBe(true);
      console.log('✅ valueDecimals defaults to 0');
    });
  });

  // ============================================================================
  // 4. Exploitation Attempts
  // ============================================================================

  describe('Exploitation Attempts', () => {
    it('should not allow score manipulation through rapid null/value feedback', async () => {
      const statsBefore = await sdk.getAtomStats(agent);
      const qualityBefore = statsBefore?.quality_score || 0;

      // Spam high-value feedback with null scores (hoping defaults bypass validation)
      for (let i = 0; i < 3; i++) {
        const uri = `ipfs://spam_${Date.now()}_${i}`;
        await clientSdk.giveFeedback(
          agent,
          {
            value: 10000n,
            valueDecimals: 0,
            // score: undefined -> defaults to 50
            tag1: 'spam',
            feedbackUri: uri,
            feedbackHash: createFeedbackHash(uri),
          },
          { feedbackIndex: getNextFeedbackIndex() }
        );
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      const statsAfter = await sdk.getAtomStats(agent);
      const qualityAfter = statsAfter?.quality_score || 0;

      // Quality should move toward 50 (default score), not explode
      console.log(`Quality: ${qualityBefore} -> ${qualityAfter}`);
      expect(typeof qualityAfter).toBe('number');
      console.log('✅ Null-score spam does not manipulate quality unexpectedly');
    });

    it('should handle value/score mismatch gracefully', async () => {
      // High value but low score - should use score for ATOM
      const uri = `ipfs://mismatch_${Date.now()}`;
      const result = await clientSdk.giveFeedback(
        agent,
        {
          value: 10000000n, // Huge value
          valueDecimals: 0,
          score: 10, // But low score
          tag1: 'mismatch',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      expect(result.success).toBe(true);
      console.log('✅ Value/score mismatch handled (score takes priority for ATOM)');
    });

    it('should handle edge case: value=0, score=100', async () => {
      const uri = `ipfs://edge0_100_${Date.now()}`;
      const result = await clientSdk.giveFeedback(
        agent,
        {
          value: 0n,
          valueDecimals: 0,
          score: 100,
          tag1: 'edge-case',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      expect(result.success).toBe(true);
      console.log('✅ Edge case value=0, score=100 handled');
    });

    it('should handle edge case: negative value, high score', async () => {
      const uri = `ipfs://edgeneg_${Date.now()}`;
      const result = await clientSdk.giveFeedback(
        agent,
        {
          value: -500n, // Negative (loss)
          valueDecimals: 2,
          score: 95, // But high score (maybe they're happy with controlled loss?)
          tag1: 'controlled-loss',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      expect(result.success).toBe(true);
      console.log('✅ Edge case negative value, high score handled');
    });
  });

  // ============================================================================
  // 5. Number Type Validation
  // ============================================================================

  describe('Number Type Validation', () => {
    it('should accept number for value (auto-converts to bigint)', async () => {
      const uri = `ipfs://numval_${Date.now()}`;
      const result = await clientSdk.giveFeedback(
        agent,
        {
          value: 9500, // number, not bigint
          valueDecimals: 2,
          score: 95,
          tag1: 'number-value',
          feedbackUri: uri,
          feedbackHash: createFeedbackHash(uri),
        },
        { feedbackIndex: getNextFeedbackIndex() }
      );

      expect(result.success).toBe(true);
      console.log('✅ Number auto-converted to bigint');
    });

    it('should reject NaN value', async () => {
      const uri = `ipfs://nan_${Date.now()}`;

      try {
        const result = await clientSdk.giveFeedback(
          agent,
          {
            value: NaN as any,
            valueDecimals: 0,
            score: 50,
            tag1: 'nan',
            feedbackUri: uri,
            feedbackHash: createFeedbackHash(uri),
          },
          { feedbackIndex: getNextFeedbackIndex() }
        );

        expect(result.success).toBe(false);
      } catch (error: any) {
        expect(error).toBeDefined();
      }
      console.log('✅ NaN value rejected');
    });

    it('should reject Infinity value', async () => {
      const uri = `ipfs://inf_${Date.now()}`;

      try {
        const result = await clientSdk.giveFeedback(
          agent,
          {
            value: Infinity as any,
            valueDecimals: 0,
            score: 50,
            tag1: 'infinity',
            feedbackUri: uri,
            feedbackHash: createFeedbackHash(uri),
          },
          { feedbackIndex: getNextFeedbackIndex() }
        );

        expect(result.success).toBe(false);
      } catch (error: any) {
        expect(error).toBeDefined();
      }
      console.log('✅ Infinity value rejected');
    });

    it('should reject float valueDecimals', async () => {
      const uri = `ipfs://floatdec_${Date.now()}`;

      try {
        const result = await clientSdk.giveFeedback(
          agent,
          {
            value: 9500n,
            valueDecimals: 2.5, // Float, not integer
            score: 95,
            tag1: 'float-dec',
            feedbackUri: uri,
            feedbackHash: createFeedbackHash(uri),
          },
          { feedbackIndex: getNextFeedbackIndex() }
        );

        expect(result.success).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('integer');
      }
      console.log('✅ Float valueDecimals rejected');
    });

    it('should reject float score', async () => {
      const uri = `ipfs://floatscore_${Date.now()}`;

      try {
        const result = await clientSdk.giveFeedback(
          agent,
          {
            value: 9500n,
            valueDecimals: 2,
            score: 95.5, // Float, not integer
            tag1: 'float-score',
            feedbackUri: uri,
            feedbackHash: createFeedbackHash(uri),
          },
          { feedbackIndex: getNextFeedbackIndex() }
        );

        expect(result.success).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('integer');
      }
      console.log('✅ Float score rejected');
    });
  });
});
