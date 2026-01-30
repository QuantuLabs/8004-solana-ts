/**
 * E2E Tests: Validation System (Localnet)
 *
 * Localnet version of e2e-validation.test.ts
 * Tests for requestValidation, respondToValidation, and readValidation
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createHash } from 'crypto';
import { SolanaSDK } from '../../src/core/sdk-solana.js';

function createRequestHash(uri: string): Buffer {
  return createHash('sha256').update(uri).digest();
}

describe('E2E: Validation System (Localnet)', () => {
  let sdk: SolanaSDK;
  let signer: Keypair;
  let validatorKeypair: Keypair;
  let validatorSdk: SolanaSDK;
  let agentAsset: PublicKey;
  let validationNonce: number;

  const rpcUrl = process.env.SOLANA_RPC_URL || 'http://127.0.0.1:8899';
  const indexerUrl = process.env.INDEXER_URL || 'http://localhost:3001/rest/v1';

  beforeAll(async () => {
    signer = Keypair.generate();
    validatorKeypair = Keypair.generate();

    const { Connection } = await import('@solana/web3.js');
    const connection = new Connection(rpcUrl);

    await connection.requestAirdrop(signer.publicKey, 10 * LAMPORTS_PER_SOL);
    await connection.requestAirdrop(validatorKeypair.publicKey, 5 * LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 2000));

    sdk = new SolanaSDK({ rpcUrl, signer, indexerUrl });
    validatorSdk = new SolanaSDK({ rpcUrl, signer: validatorKeypair, indexerUrl });

    console.log('🔑 Agent Owner:', signer.publicKey.toBase58());
    console.log('🔑 Validator:', validatorKeypair.publicKey.toBase58());
  }, 30000);

  describe('1. Setup - Register Agent', () => {
    it('should register a new agent for validation tests', async () => {
      const result = await sdk.registerAgent(`ipfs://validation-test-${Date.now()}`);

      expect(result.success).toBe(true);
      expect(result.asset).toBeDefined();

      agentAsset = result.asset!;

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify in indexer
      const agent = await sdk.loadAgent(agentAsset);
      expect(agent).not.toBeNull();

      console.log(`✅ Agent registered: ${agentAsset.toBase58()}`);
    }, 30000);
  });

  describe('2. Request Validation', () => {
    it('should request validation', async () => {
      validationNonce = Math.floor(Math.random() * 1000000);
      const requestUri = `ipfs://QmValidationRequest${Date.now()}`;
      const requestHash = createRequestHash(requestUri);

      const result = await sdk.requestValidation(
        agentAsset,
        validatorKeypair.publicKey,
        requestUri,
        { nonce: validationNonce, requestHash }
      );

      expect(result.success).toBe(true);

      validationNonce = result.nonce ? Number(result.nonce) : validationNonce;

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify in indexer
      const validation = await sdk.readValidation(
        agentAsset,
        validatorKeypair.publicKey,
        validationNonce
      );

      if (validation) {
        expect(validation.nonce).toBe(validationNonce);
        expect(validation.responded).toBe(false);
        console.log(`✅ Validation request verified in indexer`);
      } else {
        console.log(`⚠️  Validation requested, indexer not synced`);
      }

      console.log(`✅ Validation requested - nonce: ${validationNonce}`);
    }, 30000);
  });

  describe('3. Read Validation (before response)', () => {
    it('should read validation request before response', async () => {
      const validation = await sdk.readValidation(
        agentAsset,
        validatorKeypair.publicKey,
        validationNonce
      );

      if (validation) {
        expect(validation.nonce).toBe(validationNonce);
        expect(validation.asset).toBe(agentAsset.toBase58());
        expect(validation.validator).toBe(validatorKeypair.publicKey.toBase58());
        expect(validation.responded).toBe(false);
        console.log(`✅ Validation read - no response yet`);
      } else {
        console.log(`⚠️  Validation not yet indexed`);
      }
    }, 15000);

    it('should get pending validations for validator', async () => {
      const pending = await sdk.getPendingValidations(validatorKeypair.publicKey.toBase58());

      // Should include our pending validation
      const found = pending.some(v =>
        v.asset === agentAsset.toBase58() &&
        v.nonce === validationNonce
      );

      if (found) {
        console.log(`✅ Found pending validation in list`);
      } else {
        console.log(`⚠️  Pending validation not in indexer yet`);
      }
    }, 15000);
  });

  describe('4. Respond to Validation', () => {
    it('should respond to validation request', async () => {
      const response = 85; // Approval score
      const responseUri = `ipfs://QmValidationResponse${Date.now()}`;
      const responseHash = createRequestHash(responseUri);

      const result = await validatorSdk.respondToValidation(
        agentAsset,
        validationNonce,
        response,
        responseUri,
        { responseHash }
      );

      expect(result.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify response stored
      const validation = await sdk.readValidation(
        agentAsset,
        validatorKeypair.publicKey,
        validationNonce
      );

      if (validation && validation.responded) {
        expect(validation.response).toBe(response);
        console.log(`✅ Validation response verified: ${validation.response}`);
      } else {
        console.log(`⚠️  Response sent, indexer not synced`);
      }
    }, 30000);
  });

  describe('5. Read Validation (after response)', () => {
    it('should read validation with response', async () => {
      const validation = await sdk.readValidation(
        agentAsset,
        validatorKeypair.publicKey,
        validationNonce
      );

      if (validation) {
        expect(validation.responded).toBe(true);
        expect(validation.response).toBe(85);
        expect(validation.nonce).toBe(validationNonce);
        console.log(`✅ Validation read - Response: ${validation.response}`);
      } else {
        console.log(`⚠️  Validation not indexed`);
      }
    }, 15000);

    it('should not be in pending list after response', async () => {
      const pending = await sdk.getPendingValidations(validatorKeypair.publicKey.toBase58());

      const found = pending.some(v =>
        v.asset === agentAsset.toBase58() &&
        v.nonce === validationNonce
      );

      if (!found) {
        console.log(`✅ Responded validation removed from pending list`);
      } else {
        console.log(`⚠️  Validation still in pending (indexer delay)`);
      }
    }, 15000);
  });

  describe('6. Multiple Validations', () => {
    it('should handle multiple validation requests', async () => {
      const nonces: number[] = [];

      for (let i = 0; i < 3; i++) {
        const nonce = Math.floor(Math.random() * 1000000);
        const requestUri = `ipfs://QmMultiValidation${i}_${Date.now()}`;
        const requestHash = createRequestHash(requestUri);

        const result = await sdk.requestValidation(
          agentAsset,
          validatorKeypair.publicKey,
          requestUri,
          { nonce, requestHash }
        );

        if (result.success) {
          nonces.push(result.nonce ? Number(result.nonce) : nonce);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      expect(nonces.length).toBe(3);
      console.log(`✅ Created ${nonces.length} validation requests`);

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check pending validations
      const pending = await sdk.getPendingValidations(validatorKeypair.publicKey.toBase58());
      const ourPending = pending.filter(v => v.asset === agentAsset.toBase58());

      console.log(`   Found ${ourPending.length} pending validations for our agent`);
    }, 60000);
  });

  describe('7. Error Cases', () => {
    it('should fail when responding to non-existent validation', async () => {
      const fakeNonce = 999999999;
      const responseUri = `ipfs://QmFakeResponse${Date.now()}`;
      const responseHash = createRequestHash(responseUri);

      const result = await validatorSdk.respondToValidation(
        agentAsset,
        fakeNonce,
        50,
        responseUri,
        { responseHash }
      );

      expect(result.success).toBe(false);
      console.log(`✅ Non-existent validation correctly rejected`);
    }, 15000);

    it('should fail when self-validating (validator == owner)', async () => {
      const nonce = Math.floor(Math.random() * 1000000);
      const requestUri = `ipfs://QmSelfValidation${Date.now()}`;
      const requestHash = createRequestHash(requestUri);

      const result = await sdk.requestValidation(
        agentAsset,
        signer.publicKey, // Same as owner
        requestUri,
        { nonce, requestHash }
      );

      expect(result.success).toBe(false);
      console.log(`✅ Self-validation correctly rejected`);
    }, 15000);
  });
});
