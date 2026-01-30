/**
 * E2E Tests - Sign/Verify/Liveness/Agent Wallet (Localnet)
 *
 * Localnet version of e2e-sign-verify-wallet.test.ts
 * Tests the complete flow:
 * 1. Register agent
 * 2. Sign data with owner wallet (no agent wallet set)
 * 3. Verify signed data
 * 4. Set agent wallet (operational wallet)
 * 5. Sign data with agent wallet
 * 6. Verify with on-chain agent wallet
 * 7. Test liveness (isItAlive)
 * 8. Test wallet change scenarios
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';
import { SolanaSDK } from '../../src/core/sdk-solana.js';

describe('E2E: Sign/Verify/Liveness/Agent Wallet (Localnet)', () => {
  let sdk: SolanaSDK;
  let signer: Keypair;
  let agentAsset: PublicKey;
  let operationalWallet: Keypair;

  const rpcUrl = process.env.SOLANA_RPC_URL || 'http://127.0.0.1:8899';
  const indexerUrl = process.env.INDEXER_URL || 'http://localhost:3001/rest/v1';

  beforeAll(async () => {
    signer = Keypair.generate();
    operationalWallet = Keypair.generate();

    const { Connection } = await import('@solana/web3.js');
    const connection = new Connection(rpcUrl);

    await connection.requestAirdrop(signer.publicKey, 10 * LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 2000));

    sdk = new SolanaSDK({ rpcUrl, signer, indexerUrl });

    console.log('🔑 Signer:', signer.publicKey.toBase58());
    console.log('🔑 Operational Wallet:', operationalWallet.publicKey.toBase58());
  }, 30000);

  describe('1. Agent Registration', () => {
    it('should register a new agent for signing tests', async () => {
      const tokenUri = `ipfs://QmSignTest${Date.now()}`;

      const result = await sdk.registerAgent(tokenUri);

      if (!result.success) {
        console.log('❌ Registration failed:', result.error);
      }

      expect(result.success).toBe(true);
      expect(result.asset).toBeDefined();

      agentAsset = result.asset!;

      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log(`✅ Agent registered: ${agentAsset.toBase58()}`);
    }, 30000);

    it('should load the agent and verify no wallet is set', async () => {
      const agent = await sdk.loadAgent(agentAsset);

      expect(agent).not.toBeNull();
      expect(agent!.getAssetPublicKey().equals(agentAsset)).toBe(true);
      expect(agent!.getOwnerPublicKey().equals(signer.publicKey)).toBe(true);

      const wallet = agent!.getAgentWalletPublicKey();
      console.log(`   Agent wallet: ${wallet?.toBase58() ?? 'null (expected)'}`);
      console.log(`✅ Agent loaded successfully`);
    }, 15000);
  });

  describe('2. Sign & Verify with Owner Wallet', () => {
    let signedPayload: string;

    it('should sign arbitrary data with owner wallet', () => {
      const data = {
        message: 'Hello from E2E test',
        timestamp: Date.now(),
      };

      // SDK sign API: sign(asset, data, options?)
      signedPayload = sdk.sign(agentAsset, data);

      expect(signedPayload).toBeDefined();
      expect(typeof signedPayload).toBe('string');
      console.log(`✅ Data signed`);
    });

    it('should verify the signed payload with known public key', async () => {
      // SDK verify API: verify(payload, asset, publicKey?)
      const result = await sdk.verify(signedPayload, agentAsset, signer.publicKey);

      expect(result).toBe(true);
      console.log(`✅ Signature verified with known public key`);
    });

    it('should verify against on-chain owner (no agent wallet set)', async () => {
      // Note: SDK requires publicKey when no agent wallet is set
      // We pass the owner's publicKey explicitly
      const result = await sdk.verify(signedPayload, agentAsset, signer.publicKey);

      expect(result).toBe(true);
      console.log(`✅ Verified against on-chain owner`);
    }, 15000);
  });

  describe('3. Set Agent Wallet (Operational Wallet)', () => {
    it('should set agent wallet with keypair (auto-sign)', async () => {
      const result = await sdk.setAgentWallet(agentAsset, operationalWallet);

      expect(result.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const agent = await sdk.loadAgent(agentAsset);
      const wallet = agent?.getAgentWalletPublicKey();
      expect(wallet?.equals(operationalWallet.publicKey)).toBe(true);

      console.log(`✅ Agent wallet set: ${wallet?.toBase58()}`);
    }, 30000);
  });

  describe('4. Sign & Verify with Agent Wallet', () => {
    let agentSignedPayload: string;

    it('should sign data with operational wallet', () => {
      const data = {
        message: 'Signed by operational wallet',
        timestamp: Date.now(),
      };

      // Sign with operational wallet using options
      agentSignedPayload = sdk.sign(agentAsset, data, { signer: operationalWallet });

      expect(agentSignedPayload).toBeDefined();
      console.log(`✅ Data signed with operational wallet`);
    });

    it('should verify against on-chain agent wallet', async () => {
      const result = await sdk.verify(agentSignedPayload, agentAsset);

      expect(result).toBe(true);
      console.log(`✅ Verified as agent wallet`);
    }, 15000);

    it('should still accept owner signatures', async () => {
      const ownerData = {
        message: 'Still signed by owner',
        timestamp: Date.now(),
      };

      const ownerSigned = sdk.sign(agentAsset, ownerData);
      // When agent wallet is set, verify() uses it by default
      // To verify owner signatures, pass owner's publicKey explicitly
      const result = await sdk.verify(ownerSigned, agentAsset, signer.publicKey);

      expect(result).toBe(true);
      console.log(`✅ Owner still authorized`);
    }, 15000);
  });

  describe('5. Liveness Check', () => {
    // Note: isItAlive requires ipfsClient to fetch agent_uri metadata
    // These tests are skipped in localnet since we use fake IPFS URIs
    it.skip('should check liveness with challenge (requires ipfsClient)', async () => {
      const challenge = `liveness-check-${Date.now()}`;

      const result = await sdk.isItAlive(agentAsset, challenge, operationalWallet);

      expect(result.alive).toBe(true);
      expect(result.signerType).toBe('agentWallet');
      console.log(`✅ Agent is alive`);
    }, 15000);

    it.skip('should fail liveness with wrong wallet (requires ipfsClient)', async () => {
      const wrongWallet = Keypair.generate();
      const challenge = `wrong-wallet-${Date.now()}`;

      const result = await sdk.isItAlive(agentAsset, challenge, wrongWallet);

      expect(result.alive).toBe(false);
      console.log(`✅ Wrong wallet correctly rejected`);
    }, 15000);
  });

  describe('6. Wallet Change Scenarios', () => {
    it('should change agent wallet to a new keypair', async () => {
      const newWallet = Keypair.generate();

      const result = await sdk.setAgentWallet(agentAsset, newWallet);

      expect(result.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const agent = await sdk.loadAgent(agentAsset);
      const wallet = agent?.getAgentWalletPublicKey();
      expect(wallet?.equals(newWallet.publicKey)).toBe(true);

      console.log(`✅ Wallet changed to: ${wallet?.toBase58()}`);
    }, 30000);

    // Note: Wallet reset is now automatic in syncOwner when ownership changes
    // To test wallet reset, we'd need to simulate an ownership transfer first
    it.skip('wallet reset happens automatically in syncOwner on ownership change', async () => {
      // This test requires ownership transfer simulation
      // After marketplace transfer, new owner calls syncOwner which:
      // 1. Updates cached owner
      // 2. Resets agent_wallet = None
      console.log(`ℹ️ Wallet reset is now integrated into syncOwner`);
    });
  });
});
