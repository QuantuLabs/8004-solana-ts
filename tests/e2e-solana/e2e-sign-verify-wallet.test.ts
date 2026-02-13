/**
 * End-to-End Tests - Sign/Verify/Liveness/Agent Wallet Features
 *
 * Tests the complete flow of new v0.4.2 features:
 * 1. Register agent
 * 2. Sign data with owner wallet (no agent wallet set)
 * 3. Verify signed data
 * 4. Set agent wallet (operational wallet)
 * 5. Sign data with agent wallet
 * 6. Verify with on-chain agent wallet
 * 7. Test liveness (isItAlive)
 * 8. Test wallet change scenarios
 *
 * Requirements:
 * - Solana devnet running or access to devnet RPC
 * - SOLANA_PRIVATE_KEY environment variable set
 * - Programs deployed on devnet
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';
import { SolanaSDK } from '../../src/core/sdk-solana.js';

const REQUIRE_ONCHAIN_WRITES = process.env.REQUIRE_ONCHAIN_WRITES === 'true';

describe('E2E: Sign/Verify/Liveness/Agent Wallet on Devnet', () => {
  let sdk: SolanaSDK;
  let signer: Keypair;
  let agentAsset: PublicKey | null = null;
  let operationalWallet: Keypair; // New wallet to set as agent_wallet

  beforeAll(async () => {
    // Load signer from environment
    const privateKeyEnv = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKeyEnv) {
      throw new Error('SOLANA_PRIVATE_KEY environment variable not set');
    }

    signer = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(privateKeyEnv))
    );

    // Generate a new operational wallet for testing
    operationalWallet = Keypair.generate();

    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    sdk = new SolanaSDK({ cluster: 'devnet', signer, rpcUrl });

    console.log('🔑 Signer:', signer.publicKey.toBase58());
    console.log('🔑 Operational Wallet:', operationalWallet.publicKey.toBase58());
    console.log('🌐 Cluster:', sdk.getCluster());

    // Check balance
    const connection = sdk.getSolanaClient().getConnection();
    const balance = await connection.getBalance(signer.publicKey);
    console.log(`💰 Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    if (balance < 0.1 * LAMPORTS_PER_SOL) {
      console.warn('⚠️  Low balance! Get devnet SOL from https://faucet.solana.com/');
    }
  }, 30000);

  describe('1. Agent Registration', () => {
    it('should register a new agent for signing tests', async () => {
      const tokenUri = `ipfs://QmSignTest${Date.now()}`;

      console.log('\n📝 Registering agent for sign/verify tests...');
      const result = await sdk.registerAgent(tokenUri);

      expect(result).toHaveProperty('success');
      if (!('success' in result) || !result.success || !result.asset) {
        const errorMessage = 'error' in result ? result.error : 'unknown error';
        if (REQUIRE_ONCHAIN_WRITES) {
          throw new Error(`registerAgent failed in strict mode: ${errorMessage}`);
        }
        console.log(`⏭️  Skipping suite setup - registerAgent failed: ${errorMessage}`);
        return;
      }
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('asset');

      agentAsset = result.asset;
      console.log(`✅ Agent registered with asset: ${agentAsset.toBase58()}`);
    }, 60000);

    it('should load the agent and verify no wallet is set', async () => {
      if (!agentAsset) {
        console.log('⏭️  Skipping - no agent available');
        return;
      }

      console.log(`\n🔍 Loading agent to check initial state...`);

      const agent = await sdk.loadAgent(agentAsset);

      expect(agent).not.toBeNull();
      expect(agent!.getAssetPublicKey().equals(agentAsset)).toBe(true);
      expect(agent!.getOwnerPublicKey().equals(signer.publicKey)).toBe(true);

      // Initially no agent wallet should be set
      const wallet = agent!.getAgentWalletPublicKey();
      console.log(`   Agent wallet: ${wallet?.toBase58() ?? 'null'}`);
      console.log(`✅ Agent loaded successfully`);
    }, 30000);
  });

  describe('2. Sign & Verify with Owner Wallet (No Agent Wallet Set)', () => {
    let signedPayload: string | null = null;

    it('should sign arbitrary data with owner wallet', () => {
      if (!agentAsset) {
        console.log('⏭️  Skipping - no agent available');
        return;
      }

      console.log('\n✍️  Signing data with owner wallet...');

      const data = {
        message: 'Hello from E2E test',
        timestamp: new Date().toISOString(),
        counter: 42,
      };

      signedPayload = sdk.sign(agentAsset, data);

      // Parse to verify structure
      const parsed = JSON.parse(signedPayload);
      expect(parsed).toHaveProperty('v');
      expect(parsed).toHaveProperty('data');
      expect(parsed).toHaveProperty('sig');
      expect(parsed).toHaveProperty('asset');
      expect(parsed).toHaveProperty('alg');
      expect(parsed.v).toBe(1); // v is number, not string
      expect(parsed.alg).toBe('ed25519');

      console.log(`✅ Data signed successfully`);
      console.log(`   Payload length: ${signedPayload.length} bytes`);
      console.log(`   Algorithm: ${parsed.alg}`);
    });

    it('should verify signed payload with owner wallet', async () => {
      if (!agentAsset || !signedPayload) {
        console.log('⏭️  Skipping - no agent or signed payload available');
        return;
      }

      console.log('\n🔐 Verifying signature with owner wallet...');

      // Must provide owner public key explicitly (no agent wallet set yet)
      const isValid = await sdk.verify(signedPayload, agentAsset, signer.publicKey);

      expect(isValid).toBe(true);
      console.log(`✅ Signature valid: ${isValid}`);
    }, 30000);

    it('should detect invalid signature', async () => {
      if (!agentAsset || !signedPayload) {
        console.log('⏭️  Skipping - no agent or signed payload available');
        return;
      }

      console.log('\n🚫 Testing invalid signature detection...');

      // Tamper with the payload
      const parsed = JSON.parse(signedPayload);
      parsed.data.message = 'Tampered message';
      const tamperedPayload = JSON.stringify(parsed);

      const isValid = await sdk.verify(tamperedPayload, agentAsset, signer.publicKey);

      expect(isValid).toBe(false);
      console.log(`✅ Invalid signature detected: ${!isValid}`);
    }, 30000);
  });

  describe('3. Set Agent Wallet (Operational Wallet)', () => {
    it('should set agent wallet with Ed25519 signature', async () => {
      if (!agentAsset) {
        console.log('⏭️  Skipping - no agent available');
        return;
      }

      console.log('\n🔧 Setting agent operational wallet...');
      console.log(`   New wallet: ${operationalWallet.publicKey.toBase58()}`);

      // Build message to sign
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 240); // 4 minutes
      const message = Buffer.concat([
        Buffer.from('8004_WALLET_SET:'),
        agentAsset.toBuffer(),
        operationalWallet.publicKey.toBuffer(),
        signer.publicKey.toBuffer(), // owner
        (() => {
          const buf = Buffer.alloc(8);
          buf.writeBigUInt64LE(deadline);
          return buf;
        })(),
      ]);

      // Sign with operational wallet's private key
      const signature = ed25519.sign(message, operationalWallet.secretKey.slice(0, 32));

      // Set wallet on-chain
      const result = await sdk.setAgentWallet(
        agentAsset,
        operationalWallet.publicKey,
        signature,
        deadline
      );

      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);
      console.log(`✅ Agent wallet set successfully`);
      console.log(`📋 Transaction: ${result.signature}`);
    }, 60000);

    it('should verify agent wallet is set on-chain', async () => {
      if (!agentAsset) {
        console.log('⏭️  Skipping - no agent available');
        return;
      }

      console.log('\n🔍 Verifying agent wallet on-chain...');

      const agent = await sdk.loadAgent(agentAsset);
      const wallet = agent!.getAgentWalletPublicKey();

      expect(wallet).not.toBeNull();
      expect(wallet!.equals(operationalWallet.publicKey)).toBe(true);

      console.log(`✅ Agent wallet verified on-chain`);
      console.log(`   Wallet: ${wallet!.toBase58()}`);
    }, 30000);
  });

  describe('4. Sign & Verify with Agent Wallet', () => {
    let signedWithAgentWallet: string | null = null;

    it('should sign data with agent wallet', () => {
      if (!agentAsset) {
        console.log('⏭️  Skipping - no agent available');
        return;
      }

      console.log('\n✍️  Signing data with agent wallet...');

      const data = {
        message: 'Signed with operational wallet',
        timestamp: new Date().toISOString(),
        agentWalletTest: true,
      };

      // Create SDK instance with operational wallet
      const agentWalletSdk = new SolanaSDK({
        cluster: 'devnet',
        signer: operationalWallet,
      });

      signedWithAgentWallet = agentWalletSdk.sign(agentAsset, data);

      const parsed = JSON.parse(signedWithAgentWallet);
      expect(parsed.asset).toBe(agentAsset.toBase58());
      expect(parsed.alg).toBe('ed25519');

      console.log(`✅ Data signed with agent wallet`);
      console.log(`   Asset: ${parsed.asset}`);
    });

    it('should verify signature using on-chain agent wallet', async () => {
      if (!agentAsset || !signedWithAgentWallet) {
        console.log('⏭️  Skipping - no agent or signed payload available');
        return;
      }

      console.log('\n🔐 Verifying signature with on-chain agent wallet...');

      // Verify without providing explicit public key (should use on-chain wallet)
      const isValid = await sdk.verify(signedWithAgentWallet, agentAsset);

      expect(isValid).toBe(true);
      console.log(`✅ Signature verified using on-chain agent wallet: ${isValid}`);
    }, 30000);

    it('should verify signature with explicit agent wallet public key', async () => {
      if (!agentAsset || !signedWithAgentWallet) {
        console.log('⏭️  Skipping - no agent or signed payload available');
        return;
      }

      console.log('\n🔐 Verifying signature with explicit public key...');

      const isValid = await sdk.verify(
        signedWithAgentWallet,
        agentAsset,
        operationalWallet.publicKey
      );

      expect(isValid).toBe(true);
      console.log(`✅ Signature verified with explicit public key: ${isValid}`);
    }, 30000);

    it('should fail verification with wrong public key', async () => {
      if (!agentAsset || !signedWithAgentWallet) {
        console.log('⏭️  Skipping - no agent or signed payload available');
        return;
      }

      console.log('\n🚫 Testing verification with wrong public key...');

      const wrongKey = Keypair.generate().publicKey;
      const isValid = await sdk.verify(signedWithAgentWallet, agentAsset, wrongKey);

      expect(isValid).toBe(false);
      console.log(`✅ Wrong public key detected: ${!isValid}`);
    }, 30000);
  });

  describe('5. Signed Payload Verification', () => {
    it('should sign and verify custom data structures', () => {
      if (!agentAsset) {
        console.log('⏭️  Skipping - no agent available');
        return;
      }

      console.log('\n💓 Testing signed payload with custom data...');

      // Sign data with custom structure including timestamp
      const data = {
        custom_field: 'test_value',
        timestamp: new Date().toISOString(),
        nested: {
          field: 'nested_value'
        },
      };
      const payload = sdk.sign(agentAsset, data);

      // Parse to verify structure
      const parsed = JSON.parse(payload);
      expect(parsed.v).toBe(1);
      expect(parsed.alg).toBe('ed25519');
      expect(parsed.data).toEqual(data);

      console.log(`✅ Custom data signed successfully`);
      console.log(`   Data keys: ${Object.keys(parsed.data).join(', ')}`);
    });

    it('should verify payload with timestamp freshness', async () => {
      if (!agentAsset) {
        console.log('⏭️  Skipping - no agent available');
        return;
      }

      console.log('\n⏰ Testing timestamp-based verification...');

      // Sign with fresh timestamp using owner wallet
      const freshData = {
        action: 'liveness_check',
        timestamp: new Date().toISOString(),
      };
      const freshPayload = sdk.sign(agentAsset, freshData);

      // Verify signature with owner wallet (sign() uses owner, not agent wallet)
      const freshValid = await sdk.verify(freshPayload, agentAsset, signer.publicKey);
      expect(freshValid).toBe(true);

      // Sign with old timestamp (2 hours ago)
      const oldData = {
        action: 'liveness_check',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      };
      const oldPayload = sdk.sign(agentAsset, oldData);

      // Signature is still valid (signature verification doesn't check timestamp age)
      const oldValid = await sdk.verify(oldPayload, agentAsset, signer.publicKey);
      expect(oldValid).toBe(true);

      // App layer would need to check timestamp age separately
      const oldParsed = JSON.parse(oldPayload);
      const timestampAge = Date.now() - new Date(oldParsed.data.timestamp).getTime();
      const isFresh = timestampAge < 60 * 60 * 1000; // 1 hour threshold
      expect(isFresh).toBe(false);

      console.log(`✅ Timestamp verification working`);
      console.log(`   Fresh signature: valid=${freshValid}`);
      console.log(`   Old signature: valid=${oldValid}, fresh=${isFresh}`);
    }, 30000);

    it('should generate multiple unique signed payloads', () => {
      if (!agentAsset) {
        console.log('⏭️  Skipping - no agent available');
        return;
      }

      console.log('\n🔄 Generating multiple signed payloads...');

      // Generate first payload
      const data1 = {
        counter: 1,
        timestamp: new Date().toISOString(),
      };
      const payload1 = sdk.sign(agentAsset, data1);

      // Generate second payload with different data
      const data2 = {
        counter: 2,
        timestamp: new Date().toISOString(),
      };
      const payload2 = sdk.sign(agentAsset, data2);

      // Payloads should be different (different data + nonce)
      expect(payload1).not.toBe(payload2);

      const parsed1 = JSON.parse(payload1);
      const parsed2 = JSON.parse(payload2);

      expect(parsed1.data.counter).toBe(1);
      expect(parsed2.data.counter).toBe(2);
      expect(parsed1.nonce).not.toBe(parsed2.nonce);

      console.log(`✅ Multiple unique payloads generated`);
      console.log(`   Payload1 nonce: ${parsed1.nonce}`);
      console.log(`   Payload2 nonce: ${parsed2.nonce}`);
    });
  });

  describe('6. Wallet Change Scenarios', () => {
    it('should change agent wallet to a new wallet', async () => {
      if (!agentAsset) {
        console.log('⏭️  Skipping - no agent available');
        return;
      }

      console.log('\n🔄 Changing agent wallet to new wallet...');

      const newWallet = Keypair.generate();
      console.log(`   New wallet: ${newWallet.publicKey.toBase58()}`);

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 240);
      const message = Buffer.concat([
        Buffer.from('8004_WALLET_SET:'),
        agentAsset.toBuffer(),
        newWallet.publicKey.toBuffer(),
        signer.publicKey.toBuffer(),
        (() => {
          const buf = Buffer.alloc(8);
          buf.writeBigUInt64LE(deadline);
          return buf;
        })(),
      ]);

      const signature = ed25519.sign(message, newWallet.secretKey.slice(0, 32));

      const result = await sdk.setAgentWallet(
        agentAsset,
        newWallet.publicKey,
        signature,
        deadline
      );

      expect(result.success).toBe(true);
      console.log(`✅ Wallet changed successfully`);

      // Verify new wallet is set
      const agent = await sdk.loadAgent(agentAsset);
      const wallet = agent!.getAgentWalletPublicKey();
      expect(wallet!.equals(newWallet.publicKey)).toBe(true);

      console.log(`✅ New wallet verified on-chain`);
    }, 60000);

    it('should reject old wallet signatures after change', async () => {
      if (!agentAsset) {
        console.log('⏭️  Skipping - no agent available');
        return;
      }

      console.log('\n🚫 Testing old wallet rejection...');

      // Try to sign with the old operational wallet
      const oldWalletSdk = new SolanaSDK({
        cluster: 'devnet',
        signer: operationalWallet,
      });

      const signedWithOldWallet = oldWalletSdk.sign(agentAsset, {
        message: 'This should fail',
      });

      // Verification should fail because wallet changed on-chain
      const isValid = await sdk.verify(signedWithOldWallet, agentAsset);

      expect(isValid).toBe(false);
      console.log(`✅ Old wallet signature correctly rejected: ${!isValid}`);
    }, 30000);
  });

  describe('7. Edge Cases', () => {
    it('should handle missing agent gracefully', async () => {
      console.log('\n🔍 Testing missing agent handling...');

      const fakeAsset = Keypair.generate().publicKey;
      const agent = await sdk.loadAgent(fakeAsset);

      expect(agent).toBeNull();
      console.log(`✅ Missing agent handled gracefully`);
    }, 30000);

    it('should handle verify with invalid JSON', async () => {
      if (!agentAsset) {
        console.log('⏭️  Skipping - no agent available');
        return;
      }

      console.log('\n🚫 Testing invalid payload handling...');

      try {
        const isValid = await sdk.verify('{invalid json}', agentAsset);
        expect(isValid).toBe(false);
      } catch (error) {
        // Should either return false or throw on malformed JSON
        expect(error).toBeDefined();
      }
      console.log(`✅ Invalid payload rejected`);
    }, 30000);

    it('should sign and verify for agent without operational wallet', async () => {
      console.log('\n💓 Testing sign/verify for agent without operational wallet...');

      // Register a new agent without setting wallet
      const tempUri = `ipfs://QmTemp${Date.now()}`;
      const tempResult = await sdk.registerAgent(tempUri);
      if (!('success' in tempResult) || !tempResult.success || !tempResult.asset) {
        const errorMessage = 'error' in tempResult ? tempResult.error : 'unknown error';
        if (REQUIRE_ONCHAIN_WRITES) {
          throw new Error(`temp registerAgent failed in strict mode: ${errorMessage}`);
        }
        console.log(`⏭️  Skipping - temp registerAgent failed: ${errorMessage}`);
        return;
      }
      const tempAsset = tempResult.asset;

      // Sign data with owner wallet (no agent wallet set)
      const data = {
        message: 'Test without operational wallet',
        timestamp: new Date().toISOString(),
      };
      const payload = sdk.sign(tempAsset, data);

      // Must provide owner public key explicitly when agent wallet not configured
      const isValid = await sdk.verify(payload, tempAsset, signer.publicKey);
      expect(isValid).toBe(true);

      // Verify that calling without public key throws error
      await expect(sdk.verify(payload, tempAsset)).rejects.toThrow(
        'Agent wallet not configured'
      );

      console.log(`✅ Sign/verify works with explicit owner wallet (no fallback)`);
    }, 60000);
  });

  describe('8. Summary', () => {
    it('should display test summary', async () => {
      console.log('\n📊 E2E Sign/Verify/Wallet Test Summary:');
      if (!agentAsset) {
        console.log('   Agent Asset: N/A');
        console.log('   Owner:', signer.publicKey.toBase58());
        console.log('   Original Operational Wallet:', operationalWallet.publicKey.toBase58());
        console.log('\n⏭️  Summary only - no agent was registered');
        return;
      }

      console.log(`   Agent Asset: ${agentAsset.toBase58()}`);
      console.log(`   Owner: ${signer.publicKey.toBase58()}`);
      console.log(`   Original Operational Wallet: ${operationalWallet.publicKey.toBase58()}`);

      const agent = await sdk.loadAgent(agentAsset);
      const currentWallet = agent!.getAgentWalletPublicKey();
      console.log(`   Current Agent Wallet: ${currentWallet?.toBase58() ?? 'null'}`);

      console.log('\n✅ All sign/verify/liveness/wallet features tested successfully!');
    }, 30000);
  });
});
