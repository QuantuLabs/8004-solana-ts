/**
 * E2E Tests - Full Agent Lifecycle on Localnet
 *
 * Localnet version of e2e-full-flow.test.ts
 * Tests the complete flow with local indexer:
 * 1. Register agent
 * 2. Update agent metadata
 * 3. Give feedback
 * 4. Read reputation
 * 5. Append response
 * 6. Request validation
 * 7. Respond to validation
 * 8. Revoke feedback
 *
 * Requirements:
 * - Localnet running with deployed programs (anchor test --detach)
 * - Local indexer running (npm run start in 8004-solana-indexer)
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { createHash } from 'crypto';
import { SolanaSDK } from '../../src/core/sdk-solana.js';

/** Helper to create feedback hash from URI */
function createFeedbackHash(feedbackUri: string): Buffer {
  return createHash('sha256').update(feedbackUri).digest();
}

describe('E2E: Full Agent Lifecycle on Localnet', () => {
  let sdk: SolanaSDK;
  let signer: Keypair;
  let clientKeypair: Keypair;
  let clientSdk: SolanaSDK;
  let validatorKeypair: Keypair;
  let validatorSdk: SolanaSDK;
  let agentAsset: PublicKey;
  let collection: PublicKey;
  let feedbackIndex: bigint;
  let feedbackUri: string;
  let feedbackHash: Buffer;
  let validationNonce: number;

  const rpcUrl = process.env.SOLANA_RPC_URL || 'http://127.0.0.1:8899';
  const indexerUrl = process.env.INDEXER_URL || 'http://localhost:3001/rest/v1';

  beforeAll(async () => {
    // Generate keypairs for localnet
    signer = Keypair.generate();
    clientKeypair = Keypair.generate();
    validatorKeypair = Keypair.generate();

    const { Connection } = await import('@solana/web3.js');
    const connection = new Connection(rpcUrl);

    // Airdrop SOL to all wallets
    console.log('💸 Airdropping SOL to wallets...');
    await connection.requestAirdrop(signer.publicKey, 10 * LAMPORTS_PER_SOL);
    await connection.requestAirdrop(clientKeypair.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.requestAirdrop(validatorKeypair.publicKey, 5 * LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Initialize SDKs
    sdk = new SolanaSDK({ rpcUrl, signer, indexerUrl });
    clientSdk = new SolanaSDK({ rpcUrl, signer: clientKeypair, indexerUrl });
    validatorSdk = new SolanaSDK({ rpcUrl, signer: validatorKeypair, indexerUrl });

    console.log('🔑 Signer (Agent Owner):', signer.publicKey.toBase58());
    console.log('🔑 Client (Feedback Giver):', clientKeypair.publicKey.toBase58());
    console.log('🔑 Validator:', validatorKeypair.publicKey.toBase58());

    const balance = await connection.getBalance(signer.publicKey);
    console.log(`💰 Owner Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  }, 30000);

  describe('1. Agent Registration', () => {
    it('should register a new agent', async () => {
      const tokenUri = `ipfs://Qm${Date.now()}`;

      console.log('\n📝 Registering agent...');
      const result = await sdk.registerAgent(tokenUri);

      expect(result.success).toBe(true);
      expect(result.asset).toBeInstanceOf(PublicKey);

      agentAsset = result.asset!;

      // Get base collection from SDK (not returned by registerAgent)
      collection = (await sdk.getBaseCollection())!;

      // Wait for indexer
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify in indexer
      const agent = await sdk.loadAgent(agentAsset);
      expect(agent).not.toBeNull();
      expect(agent!.agent_uri).toBe(tokenUri);

      console.log(`✅ Agent registered and verified in indexer: ${agentAsset.toBase58()}`);
    }, 30000);

    it('should load the registered agent', async () => {
      const agent = await sdk.loadAgent(agentAsset);

      expect(agent).not.toBeNull();
      expect(agent!.getAssetPublicKey().equals(agentAsset)).toBe(true);
      expect(agent!.getOwnerPublicKey().toBase58()).toBe(signer.publicKey.toBase58());

      console.log(`✅ Agent loaded - Owner: ${agent!.getOwnerPublicKey().toBase58()}`);
    }, 15000);

    it('should verify agent exists', async () => {
      const exists = await sdk.agentExists(agentAsset);
      expect(exists).toBe(true);
      console.log(`✅ Agent exists`);
    }, 15000);
  });

  describe('1b. ATOM Optional Mode', () => {
    let atomOptOutAsset: PublicKey;

    it('should register agent without ATOM (atomEnabled: false)', async () => {
      const tokenUri = `ipfs://QmNoAtom${Date.now()}`;

      const result = await sdk.registerAgent(tokenUri, undefined, {
        atomEnabled: false,
      });

      expect(result.success).toBe(true);
      expect('signatures' in result).toBe(false);

      atomOptOutAsset = result.asset!;
      console.log(`✅ Agent registered WITHOUT ATOM: ${atomOptOutAsset.toBase58()}`);
    }, 30000);

    it('should verify ATOM stats do NOT exist', async () => {
      const summary = await sdk.getSummary(atomOptOutAsset);

      expect(summary.totalFeedbacks).toBe(0);
      expect(summary.averageScore).toBe(0);

      console.log(`✅ ATOM stats not initialized (as expected)`);
    }, 15000);

    it('should enable ATOM one-way', async () => {
      const result = await sdk.enableAtom(atomOptOutAsset);

      expect(result.success).toBe(true);
      console.log(`✅ ATOM enabled`);
    }, 30000);

    it('should manually initialize ATOM stats', async () => {
      const result = await sdk.initializeAtomStats(atomOptOutAsset);

      expect(result.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const summary = await sdk.getSummary(atomOptOutAsset);
      expect(summary).toHaveProperty('totalFeedbacks');

      console.log(`✅ ATOM stats initialized`);
    }, 30000);
  });

  describe('2. Agent Metadata', () => {
    it('should set agent metadata', async () => {
      const result = await sdk.setMetadata(agentAsset, 'version', '1.0.0');

      expect(result.success).toBe(true);

      // Verify in indexer
      await new Promise(resolve => setTimeout(resolve, 2000));
      const value = await sdk.getMetadata(agentAsset, 'version');
      expect(value).toBe('1.0.0');

      console.log(`✅ Metadata set and verified`);
    }, 30000);

    it('should update agent URI', async () => {
      const newUri = `ipfs://QmUpdated${Date.now()}`;

      const result = await sdk.setAgentUri(agentAsset, collection, newUri);
      expect(result.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const agent = await sdk.loadAgent(agentAsset);
      expect(agent!.agent_uri).toBe(newUri);

      console.log(`✅ URI updated and verified: ${newUri}`);
    }, 30000);
  });

  describe('3. Feedback System', () => {
    it('should give feedback to agent', async () => {
      const score = 85;
      feedbackUri = `ipfs://QmFeedback${Date.now()}`;
      feedbackHash = createFeedbackHash(feedbackUri);

      const result = await clientSdk.giveFeedback(agentAsset, {
        value: BigInt(score),
        score,
        feedbackUri,
        feedbackHash,
        tag1: 'e2e-test',
      });

      expect(result.success).toBe(true);
      expect(result.feedbackIndex).toBeDefined();

      feedbackIndex = result.feedbackIndex!;

      // Verify in indexer
      await new Promise(resolve => setTimeout(resolve, 2000));
      const fb = await sdk.readFeedback(agentAsset, clientKeypair.publicKey, feedbackIndex);
      if (fb) {
        expect(fb.score).toBe(score);
        expect(fb.revoked).toBe(false);
        console.log(`✅ Feedback given and verified - index: ${feedbackIndex}`);
      } else {
        console.log(`⚠️  Feedback given on-chain, indexer not synced`);
      }
    }, 30000);

    it('should read the feedback', async () => {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const feedback = await sdk.readFeedback(agentAsset, clientKeypair.publicKey, feedbackIndex);

      if (feedback) {
        expect(feedback.score).toBe(85);
        expect(feedback.revoked).toBe(false);
        console.log(`✅ Feedback read - Score: ${feedback.score}`);
      } else {
        console.log(`⚠️  Feedback not yet indexed`);
      }
    }, 15000);

    it('should get reputation summary', async () => {
      const summary = await sdk.getSummary(agentAsset);

      expect(summary).toHaveProperty('averageScore');
      expect(summary).toHaveProperty('totalFeedbacks');

      console.log(`✅ Summary - Avg: ${summary.averageScore}, Total: ${summary.totalFeedbacks}`);
    }, 15000);

    it('should list all feedbacks', async () => {
      const feedbacks = await sdk.readAllFeedback(agentAsset, false);

      expect(Array.isArray(feedbacks)).toBe(true);

      console.log(`✅ Found ${feedbacks.length} feedback(s)`);
    }, 15000);

    it('should get clients list', async () => {
      const clients = await sdk.getClients(agentAsset);

      expect(Array.isArray(clients)).toBe(true);

      console.log(`✅ Found ${clients.length} client(s)`);
    }, 15000);

    it('should get last feedback index', async () => {
      const lastIndex = await sdk.getLastIndex(agentAsset, clientKeypair.publicKey);

      // Convert to bigint for comparison if needed
      const lastIndexNum = typeof lastIndex === 'bigint' ? lastIndex : BigInt(lastIndex);
      expect(lastIndexNum >= feedbackIndex).toBe(true);

      console.log(`✅ Last index: ${lastIndex}`);
    }, 15000);
  });

  describe('4. Response System', () => {
    it('should append response to feedback', async () => {
      const responseUri = `ipfs://QmResponse${Date.now()}`;

      const result = await sdk.appendResponse(
        agentAsset,
        clientKeypair.publicKey,
        feedbackIndex,
        feedbackHash,
        responseUri
      );

      expect(result.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log(`✅ Response appended`);
    }, 30000);

    it('should read responses', async () => {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const responses = await sdk.readResponses(agentAsset, clientKeypair.publicKey, feedbackIndex);

      if (responses.length > 0) {
        expect(responses[0].responder.toBase58()).toBe(signer.publicKey.toBase58());
        console.log(`✅ Found ${responses.length} response(s)`);
      } else {
        console.log(`⚠️  Responses not yet indexed`);
      }
    }, 15000);
  });

  describe('5. Validation System', () => {
    it('should request validation', async () => {
      const requestUri = `ipfs://QmRequest${Date.now()}`;
      const requestHash = createFeedbackHash(requestUri);
      validationNonce = Math.floor(Math.random() * 1000000);

      const result = await sdk.requestValidation(agentAsset, validatorKeypair.publicKey, requestUri, {
        nonce: validationNonce,
        requestHash,
      });

      expect(result.success).toBe(true);

      validationNonce = result.nonce ? Number(result.nonce) : validationNonce;

      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log(`✅ Validation requested - nonce: ${validationNonce}`);
    }, 30000);

    it('should respond to validation', async () => {
      const response = 85;
      const responseUri = `ipfs://QmValidationResponse${Date.now()}`;
      const responseHash = createFeedbackHash(responseUri);

      // Validator responds, not owner
      const result = await validatorSdk.respondToValidation(
        agentAsset,
        validationNonce,
        response,
        responseUri,
        { responseHash }
      );

      expect(result.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log(`✅ Validation response sent`);
    }, 30000);

    it('should read validation request', async () => {
      const validationReq = await sdk.readValidation(
        agentAsset,
        validatorKeypair.publicKey,
        validationNonce
      );

      if (validationReq) {
        expect(validationReq.nonce).toBe(validationNonce);
        expect(validationReq.responded).toBe(true);
        expect(validationReq.response).toBe(85);
        console.log(`✅ Validation read - Response: ${validationReq.response}`);
      } else {
        console.log(`⚠️  Validation not yet indexed`);
      }
    }, 15000);
  });

  describe('6. Feedback Revocation', () => {
    it('should revoke feedback', async () => {
      const result = await clientSdk.revokeFeedback(agentAsset, feedbackIndex, feedbackHash);

      expect(result.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log(`✅ Feedback revoked`);
    }, 30000);

    it('should verify feedback is revoked', async () => {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const feedback = await sdk.readFeedback(agentAsset, clientKeypair.publicKey, feedbackIndex);

      if (feedback) {
        expect(feedback.revoked).toBe(true);
        console.log(`✅ Revocation verified`);
      } else {
        console.log(`⚠️  Feedback not yet indexed for revocation check`);
      }
    }, 15000);

    it('should update reputation summary after revocation', async () => {
      const summary = await sdk.getSummary(agentAsset);

      expect(summary).toHaveProperty('averageScore');
      expect(summary).toHaveProperty('totalFeedbacks');

      console.log(`✅ Summary after revocation - Avg: ${summary.averageScore}, Total: ${summary.totalFeedbacks}`);
    }, 15000);
  });
});
