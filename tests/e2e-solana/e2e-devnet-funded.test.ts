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
import { loadTestWallets, fundNewKeypair, returnFunds, type DevnetTestWallets } from './devnet-setup.js';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const INDEXER_URL = process.env.INDEXER_URL || 'https://uhjytdjxvfbppgjicfly.supabase.co/rest/v1';

function sha256(data: string): Buffer {
  return createHash('sha256').update(data).digest();
}

describe('E2E Devnet Tests (Pre-funded Wallets)', () => {
  let connection: Connection;
  let wallets: DevnetTestWallets;
  let sdk: SolanaSDK;
  let clientSdk: SolanaSDK;
  let validatorSdk: SolanaSDK;

  let agentAsset: PublicKey;
  let collection: PublicKey;
  let feedbackIndex: bigint;
  let validationNonce: number;

  // Track temp wallets for cleanup
  const tempWallets: Keypair[] = [];

  beforeAll(async () => {
    connection = new Connection(RPC_URL, 'confirmed');
    wallets = loadTestWallets();

    console.log('\n=== Devnet E2E Test Setup ===');
    console.log(`Main wallet: ${wallets.main.publicKey.toBase58()}`);
    console.log(`Client1: ${wallets.client1.publicKey.toBase58()}`);
    console.log(`Validator: ${wallets.validator.publicKey.toBase58()}`);

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

    validatorSdk = new SolanaSDK({
      rpcUrl: RPC_URL,
      signer: wallets.validator,
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
      const result = await sdk.registerAgent(tokenUri);

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
      const result = await clientSdk.giveFeedback(agentAsset, {
        score: 85,
        tag1: 'devnet-test',
        feedbackUri,
        feedbackHash: sha256(feedbackUri),
      });

      expect(result.success).toBe(true);
      expect(result.feedbackIndex).toBeDefined();

      feedbackIndex = result.feedbackIndex!;
      console.log(`✅ Feedback index: ${feedbackIndex}`);
    }, 60000);

    it('should read the feedback', async () => {
      // Wait for indexer to sync (devnet can be slow)
      await new Promise(r => setTimeout(r, 8000));

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
        responseUri
      );

      expect(result.success).toBe(true);
      console.log('✅ Response appended');
    }, 60000);
  });

  describe('4. Validation System', () => {
    it('should request validation', async () => {
      const requestUri = `ipfs://validation_request_${Date.now()}`;

      console.log('\n🔐 Requesting validation...');
      const result = await sdk.requestValidation(
        agentAsset,
        wallets.validator.publicKey,
        requestUri
      );

      expect(result.success).toBe(true);
      // Get nonce from result (auto-generated by SDK)
      validationNonce = Number(result.nonce!);
      console.log(`✅ Validation requested (nonce: ${validationNonce})`);
    }, 60000);

    it('should respond to validation', async () => {
      const responseUri = `ipfs://validation_response_${Date.now()}`;

      const result = await validatorSdk.respondToValidation(
        agentAsset,
        validationNonce,
        95, // score
        responseUri,
        { responseHash: sha256(responseUri) }
      );

      if (!result.success) {
        console.log(`❌ respondToValidation error: ${result.error}`);
      }
      expect(result.success).toBe(true);
      console.log('✅ Validation response sent');
    }, 60000);

    it('should read validation from on-chain', async () => {
      const validation = await sdk.readValidation(
        agentAsset,
        wallets.validator.publicKey,
        validationNonce
      );

      expect(validation).not.toBeNull();
      expect(validation!.response).toBe(95);
      console.log('✅ Validation read successfully');
    }, 30000);
  });

  describe('5. ATOM Reputation', () => {
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
      const result = await clientSdk.revokeFeedback(agentAsset, feedbackIndex);

      expect(result.success).toBe(true);
      console.log('✅ Feedback revoked');
    }, 60000);

    it('should verify feedback is revoked', async () => {
      // Wait for indexer to sync revocation (devnet can be slow)
      await new Promise(r => setTimeout(r, 8000));

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
        score: 90,
        tag1: 'multi-client-test',
        feedbackUri,
        feedbackHash: sha256(feedbackUri),
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
  });

  describe('8. Summary', () => {
    it('should print final test summary', async () => {
      console.log('\n========================================');
      console.log('        E2E DEVNET TEST SUMMARY');
      console.log('========================================');
      console.log(`Agent: ${agentAsset?.toBase58() || 'N/A'}`);
      console.log(`Feedback Index: ${feedbackIndex}`);
      console.log(`Validation Nonce: ${validationNonce}`);
      console.log(`Main Wallet: ${wallets.main.publicKey.toBase58()}`);
      console.log('========================================\n');
    });
  });
});
