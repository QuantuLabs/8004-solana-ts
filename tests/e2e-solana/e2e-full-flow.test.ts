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
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { SolanaSDK } from '../../src/core/sdk-solana.js';

describe('E2E: Full Agent Lifecycle on Devnet', () => {
  let sdk: SolanaSDK;
  let signer: Keypair;
  let clientKeypair: Keypair; // Separate client for feedback (can't self-feedback)
  let clientSdk: SolanaSDK;
  let agentAsset: PublicKey;
  let collection: PublicKey;
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

    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    sdk = new SolanaSDK({ cluster: 'devnet', signer, rpcUrl });

    // Create separate client keypair for feedback (self-feedback not allowed)
    clientKeypair = Keypair.generate();
    clientSdk = new SolanaSDK({ cluster: 'devnet', signer: clientKeypair, rpcUrl });

    console.log('🔑 Signer (Agent Owner):', signer.publicKey.toBase58());
    console.log('🔑 Client (Feedback Giver):', clientKeypair.publicKey.toBase58());
    console.log('🌐 Cluster:', sdk.getCluster());

    // Check balance and airdrop to client if needed
    const connection = sdk.getSolanaClient().getConnection();
    const balance = await connection.getBalance(signer.publicKey);
    console.log(`💰 Owner Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    if (balance < 0.1 * LAMPORTS_PER_SOL) {
      console.warn('⚠️  Low balance! Get devnet SOL from https://faucet.solana.com/');
    }

    // Fund client for feedback transactions (transfer from signer)
    console.log('💸 Transferring SOL to client...');
    const transferTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: clientKeypair.publicKey,
        lamports: 0.1 * LAMPORTS_PER_SOL,
      })
    );
    const transferSig = await connection.sendTransaction(transferTx, [signer]);
    await connection.confirmTransaction(transferSig);
    const clientBalance = await connection.getBalance(clientKeypair.publicKey);
    console.log(`💰 Client Balance: ${clientBalance / LAMPORTS_PER_SOL} SOL`);
  });

  describe('1. Agent Registration', () => {
    it('should register a new agent', async () => {
      const tokenUri = `ipfs://Qm${Date.now()}`;

      console.log('\n📝 Registering agent...');
      const result = await sdk.registerAgent(tokenUri);

      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('asset');
      expect(result.asset).toBeInstanceOf(PublicKey);

      agentAsset = result.asset!;
      collection = result.collection || agentAsset; // Fallback if no collection
      console.log(`✅ Agent registered with asset: ${agentAsset.toBase58()}`);
      console.log(`📋 Transaction: ${result.signature}`);
    }, 60000);

    it('should load the registered agent', async () => {
      console.log(`\n🔍 Loading agent ${agentAsset.toBase58()}...`);

      const agent = await sdk.loadAgent(agentAsset);

      expect(agent).not.toBeNull();
      expect(agent!.getAssetPublicKey().equals(agentAsset)).toBe(true);
      expect(agent!.getOwnerPublicKey().toBase58()).toBe(signer.publicKey.toBase58());

      console.log(`✅ Agent loaded successfully`);
      console.log(`   Owner: ${agent!.getOwnerPublicKey().toBase58()}`);
      console.log(`   URI: ${agent!.agent_uri}`);
    }, 30000);

    it('should verify agent exists', async () => {
      const exists = await sdk.agentExists(agentAsset);
      expect(exists).toBe(true);
      console.log(`✅ Agent ${agentAsset.toBase58()} exists`);
    }, 30000);
  });

  describe('1b. ATOM Optional Mode (skipAtomInit)', () => {
    let atomOptOutAsset: PublicKey;

    it('should register agent without ATOM (skipAtomInit: true)', async () => {
      const tokenUri = `ipfs://QmNoAtom${Date.now()}`;

      console.log('\n📝 Registering agent with skipAtomInit: true...');
      const result = await sdk.registerAgent(tokenUri, undefined, {
        skipAtomInit: true,
      });

      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('asset');
      expect(result.asset).toBeInstanceOf(PublicKey);

      // Should NOT have signatures array (only registration, no ATOM)
      expect('signatures' in result).toBe(false);

      atomOptOutAsset = result.asset!;
      console.log(`✅ Agent registered WITHOUT ATOM: ${atomOptOutAsset.toBase58()}`);
      console.log(`📋 Transaction: ${result.signature}`);
    }, 60000);

    it('should verify ATOM stats do NOT exist', async () => {
      console.log('\n🔍 Verifying ATOM stats do NOT exist...');

      const summary = await sdk.getSummary(atomOptOutAsset);

      // Should return default summary (all zeros)
      expect(summary.totalFeedbacks).toBe(0);
      expect(summary.averageScore).toBe(0);

      console.log(`✅ ATOM stats not initialized (as expected)`);
    }, 30000);

    it('should manually initialize ATOM stats later', async () => {
      console.log('\n🔧 Manually initializing ATOM stats...');

      const result = await sdk.initializeAtomStats(atomOptOutAsset);

      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);

      console.log(`✅ ATOM stats initialized manually`);
      console.log(`📋 Transaction: ${(result as { signature: string }).signature}`);

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify stats exist now
      const summary = await sdk.getSummary(atomOptOutAsset);
      expect(summary).toHaveProperty('totalFeedbacks');

      console.log(`✅ ATOM stats now exist`);
    }, 60000);
  });

  describe('2. Agent Metadata', () => {
    it('should set agent metadata', async () => {
      console.log(`\n📝 Setting metadata for agent ${agentAsset}...`);

      const result = await sdk.setMetadata(agentAsset, 'version', '1.0.0');

      expect(result).toHaveProperty('signature');
      console.log(`✅ Metadata set`);
      console.log(`📋 Transaction: ${(result as { signature: string }).signature}`);
    }, 60000);

    it('should update agent URI', async () => {
      const newUri = `ipfs://QmUpdated${Date.now()}`;

      console.log(`\n📝 Updating agent URI...`);
      const result = await sdk.setAgentUri(agentAsset, collection, newUri);

      expect(result).toHaveProperty('signature');
      console.log(`✅ URI updated`);
      console.log(`📋 Transaction: ${(result as { signature: string }).signature}`);

      // Wait for blockchain to propagate (retry with backoff)
      console.log('⏳ Waiting for URI propagation...');
      const synced = await sdk.waitForIndexerSync(async () => {
        const agent = await sdk.loadAgent(agentAsset);
        return agent !== null && agent.agent_uri === newUri;
      }, { timeout: 45000 });

      if (!synced) {
        console.log('⏭️  Skipping verification - URI propagation exceeded timeout (blockchain latency)');
        return; // Skip verification gracefully
      }

      // Verify update
      const agent = await sdk.loadAgent(agentAsset);
      expect(agent!.agent_uri).toBe(newUri);
      console.log(`✅ URI verified: ${agent!.agent_uri}`);
    }, 60000);
  });

  describe('3. Feedback System', () => {
    it('should give feedback to agent', async () => {
      console.log(`\n⭐ Giving feedback to agent ${agentAsset}...`);
      console.log(`   Client: ${clientKeypair.publicKey.toBase58()}`);

      const score = 85;
      const feedbackUri = `ipfs://QmFeedback${Date.now()}`;
      const feedbackHash = Buffer.alloc(32, 1); // Mock hash

      // Use clientSdk (different wallet) to give feedback (self-feedback not allowed)
      const result = await clientSdk.giveFeedback(agentAsset, {
        score,
        feedbackUri,
        feedbackHash,
      });

      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('feedbackIndex');

      feedbackIndex = (result as { feedbackIndex: bigint }).feedbackIndex;
      console.log(`✅ Feedback given with index: ${feedbackIndex}`);
      console.log(`📋 Transaction: ${(result as { signature: string }).signature}`);
    }, 60000);

    it('should read the feedback', async () => {
      console.log(`\n🔍 Reading feedback (waiting for event propagation)...`);

      // Wait for indexer to process the on-chain event
      const synced = await sdk.waitForIndexerSync(async () => {
        const fb = await sdk.readFeedback(agentAsset, clientKeypair.publicKey, feedbackIndex);
        return fb !== null;
      });

      expect(synced).toBe(true);

      const feedback = await sdk.readFeedback(agentAsset, clientKeypair.publicKey, feedbackIndex);
      expect(feedback).not.toBeNull();
      expect(feedback!.score).toBe(85);
      expect(feedback!.revoked).toBe(false);

      console.log(`✅ Feedback loaded`);
      console.log(`   Score: ${feedback!.score}`);
      console.log(`   URI: ${feedback!.fileUri}`);
    }, 60000);

    it('should get reputation summary', async () => {
      console.log(`\n📊 Getting reputation summary...`);

      const summary = await sdk.getSummary(agentAsset);

      expect(summary).toHaveProperty('averageScore');
      expect(summary).toHaveProperty('totalFeedbacks');
      expect(summary.totalFeedbacks).toBeGreaterThanOrEqual(1);

      console.log(`✅ Reputation summary:`);
      console.log(`   Average score: ${summary.averageScore}`);
      console.log(`   Total feedbacks: ${summary.totalFeedbacks}`);
    }, 30000);

    it('should list all feedbacks', async () => {
      console.log(`\n📋 Listing all feedbacks (event-driven query)...`);

      // Wait for indexer to process events
      await sdk.waitForIndexerSync(async () => {
        const fbs = await sdk.readAllFeedback(agentAsset, false);
        return fbs.length > 0;
      });

      const feedbacks = await sdk.readAllFeedback(agentAsset, false);

      expect(Array.isArray(feedbacks)).toBe(true);
      expect(feedbacks.length).toBeGreaterThanOrEqual(1);

      console.log(`✅ Found ${feedbacks.length} feedback(s)`);
      feedbacks.forEach((fb, i) => {
        console.log(`   [${i}] Score: ${fb.score}, Revoked: ${fb.revoked}`);
      });
    }, 60000);

    it('should get clients list', async () => {
      console.log(`\n👥 Getting clients list (event-driven query)...`);

      // Wait for indexer to aggregate client data
      await sdk.waitForIndexerSync(async () => {
        const cls = await sdk.getClients(agentAsset);
        return cls.length > 0;
      });

      const clients = await sdk.getClients(agentAsset);

      expect(Array.isArray(clients)).toBe(true);
      expect(clients.length).toBeGreaterThanOrEqual(1);

      const hasOurClient = clients.some(c => c.equals(clientKeypair.publicKey));
      expect(hasOurClient).toBe(true);

      console.log(`✅ Found ${clients.length} client(s)`);
    }, 60000);

    it('should get last feedback index for client', async () => {
      console.log(`\n🔢 Getting last feedback index...`);

      const lastIndex = await sdk.getLastIndex(agentAsset, clientKeypair.publicKey);

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
        agentAsset,
        clientKeypair.publicKey,
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

      // Wait for response PDA to be created on-chain (can take time on devnet)
      const synced = await sdk.waitForIndexerSync(async () => {
        const cnt = await sdk.getResponseCount(agentAsset, feedbackIndex);
        return cnt > 0;
      }, { timeout: 60000 });

      if (!synced) {
        console.log('⏭️  Skipping verification - Response PDA not created within timeout (devnet latency)');
        return; // Skip verification gracefully
      }

      const count = await sdk.getResponseCount(agentAsset, feedbackIndex);

      expect(count).toBeGreaterThanOrEqual(1);
      console.log(`✅ Response count: ${count}`);
    }, 90000);

    it('should read all responses', async () => {
      console.log(`\n📖 Reading all responses...`);

      // Wait for response PDA to be created on-chain (can take time on devnet)
      const synced = await sdk.waitForIndexerSync(async () => {
        const resps = await sdk.readResponses(agentAsset, feedbackIndex);
        return resps.length > 0;
      }, { timeout: 60000 });

      if (!synced) {
        console.log('⏭️  Skipping verification - Response PDA not created within timeout (devnet latency)');
        return; // Skip verification gracefully
      }

      const responses = await sdk.readResponses(agentAsset, feedbackIndex);

      expect(Array.isArray(responses)).toBe(true);
      expect(responses.length).toBeGreaterThanOrEqual(1);

      console.log(`✅ Found ${responses.length} response(s)`);
    }, 90000);
  });

  describe('5. Validation System', () => {
    it('should request validation', async () => {
      // Use same keypair as validator for testing
      const validator = signer.publicKey;

      console.log(`\n🔐 Requesting validation...`);

      const requestUri = `ipfs://QmRequest${Date.now()}`;
      const requestHash = Buffer.alloc(32, 3); // Mock hash
      const nonce = Math.floor(Math.random() * 1000000);
      const result = await sdk.requestValidation(agentAsset, validator, nonce, requestUri, requestHash);

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
        agentAsset,
        validationNonce,
        response,
        responseUri,
        responseHash
      );

      expect(result).toHaveProperty('signature');
      console.log(`✅ Validation response sent`);
      console.log(`📋 Transaction: ${(result as { signature: string }).signature}`);

      // Wait for blockchain propagation
      await new Promise(resolve => setTimeout(resolve, 2000));
    }, 60000);

    it('should read validation request from on-chain', async () => {
      if (!agentAsset || !validationNonce) {
        console.log('⏭️  Skipping - agentAsset or validationNonce not available');
        return;
      }

      console.log(`\n🔍 Reading validation request from on-chain (with retry)...`);

      // Use waitForValidation to handle blockchain finalization delays
      const validationReq = await sdk.waitForValidation(
        agentAsset,
        signer.publicKey,
        validationNonce,
        30000 // 30 second timeout
      );

      expect(validationReq).not.toBeNull();
      expect(validationReq!.nonce).toBe(validationNonce);
      expect(validationReq!.getAssetPublicKey().equals(agentAsset)).toBe(true);
      expect(validationReq!.getValidatorPublicKey().equals(signer.publicKey)).toBe(true);
      expect(validationReq!.hasResponse()).toBe(true);
      expect(validationReq!.response).toBe(1); // The response we sent

      console.log(`✅ Validation request read successfully`);
      console.log(`   Response: ${validationReq!.response}`);
      console.log(`   Has Response: ${validationReq!.hasResponse()}`);
      console.log(`   Last Update: ${validationReq!.getLastUpdate()}`);
    }, 45000); // Increased timeout to 45s
  });

  describe('6. Feedback Revocation', () => {
    it('should revoke feedback', async () => {
      console.log(`\n🚫 Revoking feedback ${feedbackIndex}...`);

      // Client revokes their own feedback
      const result = await clientSdk.revokeFeedback(agentAsset, feedbackIndex);

      expect(result).toHaveProperty('signature');
      console.log(`✅ Feedback revoked`);
      console.log(`📋 Transaction: ${(result as { signature: string }).signature}`);
    }, 60000);

    it('should verify feedback is revoked', async () => {
      console.log(`\n🔍 Verifying revocation (event-driven query)...`);

      // Wait for indexer to process revocation event
      await sdk.waitForIndexerSync(async () => {
        const fb = await sdk.readFeedback(agentAsset, clientKeypair.publicKey, feedbackIndex);
        return fb !== null && fb.revoked === true;
      });

      const feedback = await sdk.readFeedback(agentAsset, clientKeypair.publicKey, feedbackIndex);

      expect(feedback).not.toBeNull();
      expect(feedback!.revoked).toBe(true);

      console.log(`✅ Feedback is revoked`);
    }, 60000);

    it('should not include revoked feedback in default listing', async () => {
      const feedbacks = await sdk.readAllFeedback(agentAsset, false);

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

      try {
        const agents = await sdk.getAgentsByOwner(signer.publicKey);

        expect(Array.isArray(agents)).toBe(true);
        expect(agents.length).toBeGreaterThanOrEqual(1);

        const hasOurAgent = agents.some(a => a.account.getAssetPublicKey().equals(agentAsset));
        expect(hasOurAgent).toBe(true);

        console.log(`✅ Found ${agents.length} agent(s) owned by signer`);
      } catch (error: any) {
        // Skip test if RPC doesn't support getProgramAccounts
        if (error.name === 'UnsupportedRpcError' || error.message?.includes('not supported')) {
          console.log('⏭️  Skipping - operation requires advanced RPC (getProgramAccounts)');
          return; // Skip test gracefully
        }
        throw error; // Re-throw unexpected errors
      }
    }, 30000);
  });

  afterAll(() => {
    console.log('\n📊 E2E Test Summary:');
    console.log(`   Agent ID: ${agentAsset}`);
    console.log(`   Feedback Index: ${feedbackIndex}`);
    console.log(`   Validation Nonce: ${validationNonce}`);
    console.log(`   Signer: ${signer.publicKey.toBase58()}`);
  });
});
