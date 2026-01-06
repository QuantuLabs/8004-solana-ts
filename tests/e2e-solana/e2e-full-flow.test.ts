/**
 * End-to-End Tests - Full Agent Lifecycle on Solana Devnet
 *
 * Tests the complete flow:
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
 * - Solana devnet running or access to devnet RPC
 * - SOLANA_PRIVATE_KEY environment variable set
 * - Programs deployed on devnet
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SolanaSDK } from '../../src/core/sdk-solana.js';

describe('E2E: Full Agent Lifecycle on Devnet', () => {
  let sdk: SolanaSDK;
  let signer: Keypair;
  let agentId: bigint;
  let feedbackIndex: bigint;
  let validationNonce: number;

  beforeAll(async () => {
    // Load signer from environment
    const privateKeyEnv = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKeyEnv) {
      throw new Error('SOLANA_PRIVATE_KEY environment variable not set');
    }

    signer = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(privateKeyEnv))
    );

    sdk = new SolanaSDK({ cluster: 'devnet', signer });

    console.log('🔑 Signer:', signer.publicKey.toBase58());
    console.log('🌐 Cluster:', sdk.getCluster());

    // Check balance
    const connection = sdk.getSolanaClient().getConnection();
    const balance = await connection.getBalance(signer.publicKey);
    console.log(`💰 Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    if (balance < 0.1 * LAMPORTS_PER_SOL) {
      console.warn('⚠️  Low balance! Get devnet SOL from https://faucet.solana.com/');
    }
  });

  describe('1. Agent Registration', () => {
    it('should register a new agent', async () => {
      const tokenUri = `ipfs://Qm${Date.now()}`;

      console.log('\n📝 Registering agent...');
      const result = await sdk.registerAgent(tokenUri);

      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('agentId');
      const txResult = result as { signature: string; agentId: bigint };
      expect(typeof txResult.signature).toBe('string');
      expect(typeof txResult.agentId).toBe('bigint');

      agentId = txResult.agentId;
      console.log(`✅ Agent registered with ID: ${agentId}`);
      console.log(`📋 Transaction: ${txResult.signature}`);
    }, 60000);

    it('should load the registered agent', async () => {
      console.log(`\n🔍 Loading agent ${agentId}...`);

      const agent = await sdk.loadAgent(agentId);

      expect(agent).not.toBeNull();
      expect(agent!.agent_id).toBe(agentId);
      expect(agent!.getOwnerPublicKey().toBase58()).toBe(signer.publicKey.toBase58());

      console.log(`✅ Agent loaded successfully`);
      console.log(`   Owner: ${agent!.getOwnerPublicKey().toBase58()}`);
      console.log(`   URI: ${agent!.agent_uri}`);
    }, 30000);

    it('should verify agent exists', async () => {
      const exists = await sdk.agentExists(agentId);
      expect(exists).toBe(true);
      console.log(`✅ Agent ${agentId} exists`);
    }, 30000);
  });

  describe('2. Agent Metadata', () => {
    it('should set agent metadata', async () => {
      console.log(`\n📝 Setting metadata for agent ${agentId}...`);

      const result = await sdk.setMetadata(agentId, 'version', '1.0.0');

      expect(result).toHaveProperty('signature');
      console.log(`✅ Metadata set`);
      console.log(`📋 Transaction: ${(result as { signature: string }).signature}`);
    }, 60000);

    it('should update agent URI', async () => {
      const newUri = `ipfs://QmUpdated${Date.now()}`;

      console.log(`\n📝 Updating agent URI...`);
      const result = await sdk.setAgentUri(agentId, newUri);

      expect(result).toHaveProperty('signature');
      console.log(`✅ URI updated`);
      console.log(`📋 Transaction: ${(result as { signature: string }).signature}`);

      // Verify update
      const agent = await sdk.loadAgent(agentId);
      expect(agent!.agent_uri).toBe(newUri);
    }, 60000);
  });

  describe('3. Feedback System', () => {
    it('should give feedback to agent', async () => {
      console.log(`\n⭐ Giving feedback to agent ${agentId}...`);

      const score = 85;
      const fileUri = `ipfs://QmFeedback${Date.now()}`;
      const fileHash = Buffer.alloc(32, 1); // Mock hash

      const result = await sdk.giveFeedback(agentId, {
        score,
        fileUri,
        fileHash,
      });

      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('feedbackIndex');

      feedbackIndex = (result as { feedbackIndex: bigint }).feedbackIndex;
      console.log(`✅ Feedback given with index: ${feedbackIndex}`);
      console.log(`📋 Transaction: ${(result as { signature: string }).signature}`);
    }, 60000);

    it('should read the feedback', async () => {
      console.log(`\n🔍 Reading feedback...`);

      const feedback = await sdk.readFeedback(agentId, signer.publicKey, feedbackIndex);

      expect(feedback).not.toBeNull();
      expect(feedback!.score).toBe(85);
      expect(feedback!.revoked).toBe(false);

      console.log(`✅ Feedback loaded`);
      console.log(`   Score: ${feedback!.score}`);
      console.log(`   URI: ${feedback!.fileUri}`);
    }, 30000);

    it('should get reputation summary', async () => {
      console.log(`\n📊 Getting reputation summary...`);

      const summary = await sdk.getSummary(agentId);

      expect(summary).toHaveProperty('averageScore');
      expect(summary).toHaveProperty('totalFeedbacks');
      expect(summary.totalFeedbacks).toBeGreaterThanOrEqual(1);

      console.log(`✅ Reputation summary:`);
      console.log(`   Average score: ${summary.averageScore}`);
      console.log(`   Total feedbacks: ${summary.totalFeedbacks}`);
    }, 30000);

    it('should list all feedbacks', async () => {
      console.log(`\n📋 Listing all feedbacks...`);

      const feedbacks = await sdk.readAllFeedback(agentId, false);

      expect(Array.isArray(feedbacks)).toBe(true);
      expect(feedbacks.length).toBeGreaterThanOrEqual(1);

      console.log(`✅ Found ${feedbacks.length} feedback(s)`);
      feedbacks.forEach((fb, i) => {
        console.log(`   [${i}] Score: ${fb.score}, Revoked: ${fb.revoked}`);
      });
    }, 30000);

    it('should get clients list', async () => {
      console.log(`\n👥 Getting clients list...`);

      const clients = await sdk.getClients(agentId);

      expect(Array.isArray(clients)).toBe(true);
      expect(clients.length).toBeGreaterThanOrEqual(1);

      const hasOurClient = clients.some(c => c.equals(signer.publicKey));
      expect(hasOurClient).toBe(true);

      console.log(`✅ Found ${clients.length} client(s)`);
    }, 30000);

    it('should get last feedback index for client', async () => {
      console.log(`\n🔢 Getting last feedback index...`);

      const lastIndex = await sdk.getLastIndex(agentId, signer.publicKey);

      expect(lastIndex).toBeGreaterThanOrEqual(feedbackIndex);

      console.log(`✅ Last index: ${lastIndex}`);
    }, 30000);
  });

  describe('4. Response System', () => {
    it('should append response to feedback', async () => {
      console.log(`\n💬 Appending response to feedback ${feedbackIndex}...`);

      const responseUri = `ipfs://QmResponse${Date.now()}`;
      const responseHash = Buffer.alloc(32, 2); // Mock hash

      const result = await sdk.appendResponse(
        agentId,
        signer.publicKey,
        feedbackIndex,
        responseUri,
        responseHash
      );

      expect(result).toHaveProperty('signature');
      console.log(`✅ Response appended`);
      console.log(`📋 Transaction: ${(result as { signature: string }).signature}`);
    }, 60000);

    it('should get response count', async () => {
      console.log(`\n🔢 Getting response count...`);

      const count = await sdk.getResponseCount(agentId, feedbackIndex);

      expect(count).toBeGreaterThanOrEqual(1);
      console.log(`✅ Response count: ${count}`);
    }, 30000);

    it('should read all responses', async () => {
      console.log(`\n📖 Reading all responses...`);

      const responses = await sdk.readResponses(agentId, feedbackIndex);

      expect(Array.isArray(responses)).toBe(true);
      expect(responses.length).toBeGreaterThanOrEqual(1);

      console.log(`✅ Found ${responses.length} response(s)`);
    }, 30000);
  });

  describe('5. Validation System', () => {
    it('should request validation', async () => {
      // Use same keypair as validator for testing
      const validator = signer.publicKey;

      console.log(`\n🔐 Requesting validation...`);

      const requestUri = `ipfs://QmRequest${Date.now()}`;
      const requestHash = Buffer.alloc(32, 3); // Mock hash
      const nonce = Math.floor(Math.random() * 1000000);
      const result = await sdk.requestValidation(agentId, validator, nonce, requestUri, requestHash);

      expect(result).toHaveProperty('signature');

      validationNonce = nonce;
      console.log(`✅ Validation requested with nonce: ${validationNonce}`);
      console.log(`📋 Transaction: ${(result as { signature: string }).signature}`);
    }, 60000);

    it('should respond to validation request', async () => {
      console.log(`\n✅ Responding to validation request...`);

      const response = 1; // Approved
      const responseUri = `ipfs://QmValidationResponse${Date.now()}`;
      const responseHash = Buffer.alloc(32, 4); // Mock hash

      const result = await sdk.respondToValidation(
        agentId,
        validationNonce,
        response,
        responseUri,
        responseHash
      );

      expect(result).toHaveProperty('signature');
      console.log(`✅ Validation response sent`);
      console.log(`📋 Transaction: ${(result as { signature: string }).signature}`);
    }, 60000);
  });

  describe('6. Feedback Revocation', () => {
    it('should revoke feedback', async () => {
      console.log(`\n🚫 Revoking feedback ${feedbackIndex}...`);

      const result = await sdk.revokeFeedback(agentId, feedbackIndex);

      expect(result).toHaveProperty('signature');
      console.log(`✅ Feedback revoked`);
      console.log(`📋 Transaction: ${(result as { signature: string }).signature}`);
    }, 60000);

    it('should verify feedback is revoked', async () => {
      console.log(`\n🔍 Verifying revocation...`);

      const feedback = await sdk.readFeedback(agentId, signer.publicKey, feedbackIndex);

      expect(feedback).not.toBeNull();
      expect(feedback!.revoked).toBe(true);

      console.log(`✅ Feedback is revoked`);
    }, 30000);

    it('should not include revoked feedback in default listing', async () => {
      const feedbacks = await sdk.readAllFeedback(agentId, false);

      const revokedInList = feedbacks.some(
        fb => fb.feedbackIndex === feedbackIndex && fb.revoked
      );

      expect(revokedInList).toBe(false);
      console.log(`✅ Revoked feedback excluded from default listing`);
    }, 30000);
  });

  describe('7. Multi-Agent Queries', () => {
    it('should get agents by owner', async () => {
      console.log(`\n🔍 Getting agents by owner...`);

      const agents = await sdk.getAgentsByOwner(signer.publicKey);

      expect(Array.isArray(agents)).toBe(true);
      expect(agents.length).toBeGreaterThanOrEqual(1);

      const hasOurAgent = agents.some(a => a.account.agent_id === agentId);
      expect(hasOurAgent).toBe(true);

      console.log(`✅ Found ${agents.length} agent(s) owned by signer`);
    }, 30000);
  });

  afterAll(() => {
    console.log('\n📊 E2E Test Summary:');
    console.log(`   Agent ID: ${agentId}`);
    console.log(`   Feedback Index: ${feedbackIndex}`);
    console.log(`   Validation Nonce: ${validationNonce}`);
    console.log(`   Signer: ${signer.publicKey.toBase58()}`);
  });
});
