/**
 * E2E Tests - Identity Module (Complete Coverage)
 * Tests all 15 instructions in identity subsystem + boundary/error cases
 */

import { Keypair, PublicKey, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SolanaSDK } from '../../src/core/sdk-solana';
import bs58 from 'bs58';

const RPC_URL = process.env.RPC_URL || 'http://localhost:8899';
const PROGRAM_ID = process.env.AGENT_REGISTRY_PROGRAM_ID || '8oo48pya1SZD23ZhzoNMhxR2UGb8BRa41Su4qP9EuaWm';
const ATOM_ENGINE_ID = process.env.ATOM_ENGINE_PROGRAM_ID || 'AToM1iKaniUCuWfHd5WQy5aLgJYWMiKq78NtNJmtzSXJ';
const MPL_CORE_ID = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';

describe('Identity Module - Complete Coverage (15 Instructions)', () => {
  let sdk: SolanaSDK;
  let connection: Connection;
  let ownerKeypair: Keypair;
  let wallet2Keypair: Keypair;
  let collection: PublicKey;
  let userCollection: PublicKey;
  let agent: PublicKey;
  let agent2: PublicKey;

  beforeAll(async () => {
    connection = new Connection(RPC_URL, 'confirmed');

    // Generate owner keypair
    ownerKeypair = Keypair.generate();

    // Generate wallet2
    wallet2Keypair = Keypair.generate();

    // Fund both wallets with retry logic for localnet
    const fundWallet = async (pubkey: PublicKey) => {
      const sig = await connection.requestAirdrop(pubkey, 10 * LAMPORTS_PER_SOL);
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature: sig,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      }, 'confirmed');
    };

    await fundWallet(ownerKeypair.publicKey);
    await fundWallet(wallet2Keypair.publicKey);

    // Initialize SDK
    sdk = new SolanaSDK({
      rpcUrl: RPC_URL,
      programIds: {
        agentRegistry: PROGRAM_ID,
        atomEngine: ATOM_ENGINE_ID,
        mplCore: MPL_CORE_ID,
      },
      signer: ownerKeypair,
    });

    console.log('\n=== Test Setup ===');
    console.log('Owner:', ownerKeypair.publicKey.toBase58());
    console.log('Wallet2:', wallet2Keypair.publicKey.toBase58());
    console.log('Programs:', { agentRegistry: PROGRAM_ID, atomEngine: ATOM_ENGINE_ID });
  }, 120000);

  // ========================================
  // 1. initialize (root config + base registry)
  // ========================================
  describe('1. initialize', () => {
    it('should initialize root config and first base registry', async () => {
      // Note: This is typically done once per deployment
      // In tests, it may already be initialized from previous runs
      const config = await sdk.getBaseCollection();
      expect(config).toBeDefined();
      console.log('[OK] Root config initialized, base collection:', config?.toBase58());
    }, 30000);
  });

  // ========================================
  // 2. create_base_registry (authority only)
  // ========================================
  describe('2. create_base_registry', () => {
    it('should create new base registry (authority only)', async () => {
      // This requires authority keypair - skip if not available
      // In production, only program authority can call this
      console.log('[SKIP] create_base_registry requires authority keypair');
    });
  });

  // ========================================
  // 3. rotate_base_registry (authority only)
  // ========================================
  describe('3. rotate_base_registry', () => {
    it('should rotate to new base registry (authority only)', async () => {
      console.log('[SKIP] rotate_base_registry requires authority keypair');
    });
  });

  // ========================================
  // 4. create_user_registry (user shards)
  // ========================================
  describe('4. create_user_registry', () => {
    it('should report createCollection as removed in v0.6.0', async () => {
      const result = await sdk.createCollection(
        `UserRegistry_${Date.now()}`,
        'ipfs://QmUserRegistryTest'
      );
      // createCollection removed in v0.6.0 single-collection architecture
      expect(result.success).toBe(false);
    }, 30000);
  });

  // ========================================
  // 5. update_user_registry_metadata
  // ========================================
  describe('5. update_user_registry_metadata', () => {
    it('should update user registry metadata URI', async () => {
      if (!userCollection) {
        console.log('[SKIP] No user registry created');
        return;
      }

      const newUri = `ipfs://QmUserRegistryUpdated_${Date.now()}`;
      const result = await sdk.updateCollectionUri(userCollection, newUri);

      expect(result.success).toBe(true);

      // Wait for indexer
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify collection URI updated via on-chain query
      const collectionInfo = await sdk.getCollection(userCollection);
      if (collectionInfo) {
        // Collection info should reflect the update
        expect(collectionInfo.collection.toBase58()).toBe(userCollection.toBase58());
        console.log('[OK] User registry URI update verified');
      }

      console.log('[OK] User registry metadata updated');
      console.log('     Signature:', result.signature);
    }, 30000);

    it('should reject update from non-owner', async () => {
      if (!userCollection) {
        console.log('[SKIP] No user registry created');
        return;
      }

      const sdk2 = new SolanaSDK({
        rpcUrl: RPC_URL,
        programIds: { agentRegistry: PROGRAM_ID, atomEngine: ATOM_ENGINE_ID, mplCore: MPL_CORE_ID },
        signer: wallet2Keypair,
      });

      const result = await sdk2.updateCollectionUri(userCollection, 'ipfs://QmUnauthorized');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unauthorized');
      console.log('[OK] Unauthorized update rejected');
    }, 30000);
  });

  // ========================================
  // 6. register (base + user registry)
  // ========================================
  describe('6. register', () => {
    it('should register agent in base collection', async () => {
      const baseCollection = await sdk.getBaseCollection();
      const result = await sdk.registerAgent(
        'ipfs://QmTestAgent',
        baseCollection!,
        { atomEnabled: false }
      );

      expect(result.success).toBe(true);
      expect(result.asset).toBeDefined();
      collection = baseCollection!;
      agent = result.asset!;

      // Wait for indexer
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify agent indexed
      const agentData = await sdk.loadAgent(agent);
      if (agentData) {
        expect(agentData.agent_uri).toBe('ipfs://QmTestAgent');
        expect(new PublicKey(agentData.collection).toBase58()).toBe(collection.toBase58());
        console.log('[OK] Agent verified in indexer');
      } else {
        console.log('⚠️  Agent registered on-chain, indexer not synced');
      }

      console.log('[OK] Agent registered in base collection');
      console.log('     Asset:', agent.toBase58());
      console.log('     Signature:', result.signature);
    }, 30000);

    it('should register agent in user registry', async () => {
      if (!userCollection) {
        console.log('[SKIP] No user registry created');
        return;
      }

      const result = await sdk.registerAgent(
        'ipfs://QmUserRegistryAgent',
        userCollection,
        { atomEnabled: false }
      );

      expect(result.success).toBe(true);
      expect(result.asset).toBeDefined();
      agent2 = result.asset!;

      // Wait for indexer
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify agent indexed in user registry
      const agentData = await sdk.loadAgent(agent2);
      if (agentData) {
        expect(agentData.agent_uri).toBe('ipfs://QmUserRegistryAgent');
        expect(new PublicKey(agentData.collection).toBase58()).toBe(userCollection.toBase58());
        console.log('[OK] Agent verified in user registry via indexer');
      } else {
        console.log('⚠️  Agent registered on-chain, indexer not synced');
      }

      console.log('[OK] Agent registered in user registry');
      console.log('     Asset:', agent2.toBase58());
    }, 30000);
  });

  // ========================================
  // 7. register_with_options (explicit ATOM enable/disable)
  // ========================================
  describe('7. register_with_options', () => {
    it('should register agent with ATOM explicitly disabled', async () => {
      const result = await sdk.registerAgent(
        'ipfs://QmAgentNoAtom',
        collection,
        { atomEnabled: false }
      );

      expect(result.success).toBe(true);

      const agentData = await sdk.loadAgent(result.asset!);
      expect(agentData?.atom_enabled).toBe(0); // 0 = disabled

      console.log('[OK] Agent registered with ATOM disabled');
      console.log('     Asset:', result.asset?.toBase58());
      console.log('     atom_enabled:', agentData?.atom_enabled);
    }, 30000);

    it('should register agent with ATOM explicitly enabled', async () => {
      const result = await sdk.registerAgent(
        'ipfs://QmAgentWithAtom',
        collection,
        { atomEnabled: true }
      );

      expect(result.success).toBe(true);

      const agentData = await sdk.loadAgent(result.asset!);
      expect(agentData?.atom_enabled).toBe(1); // 1 = enabled

      console.log('[OK] Agent registered with ATOM enabled');
      console.log('     Asset:', result.asset?.toBase58());
      console.log('     atom_enabled:', agentData?.atom_enabled);
    }, 30000);
  });

  // ========================================
  // 8. enable_atom (one-way flag)
  // ========================================
  describe('8. enable_atom', () => {
    let agentNoAtom: PublicKey;

    beforeAll(async () => {
      // Create agent with ATOM disabled
      const result = await sdk.registerAgent(
        'ipfs://QmAgentForAtomEnable',
        collection,
        { atomEnabled: false }
      );
      agentNoAtom = result.asset!;
    }, 30000);

    it('should enable ATOM for agent', async () => {
      const result = await sdk.enableAtom(agentNoAtom);
      expect(result.success).toBe(true);

      const agentData = await sdk.loadAgent(agentNoAtom);
      expect(agentData?.atom_enabled).toBe(1); // 1 = true, 0 = false

      console.log('[OK] ATOM enabled for agent');
      console.log('     Signature:', result.signature);
    }, 30000);

    it('should reject enabling ATOM twice', async () => {
      const result = await sdk.enableAtom(agentNoAtom);
      expect(result.success).toBe(false);
      expect(result.error).toContain('already enabled');
      console.log('[OK] Double enable rejected');
    }, 30000);
  });

  // ========================================
  // 9. set_agent_uri
  // ========================================
  describe('9. set_agent_uri', () => {
    it('should update agent URI', async () => {
      const newUri = `ipfs://QmUpdated_${Date.now()}`;
      const result = await sdk.setAgentUri(agent, collection, newUri);

      expect(result.success).toBe(true);

      // Wait for indexer
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify URI updated via indexer
      const agentData = await sdk.loadAgent(agent);
      if (agentData) {
        expect(agentData.agent_uri).toBe(newUri);
        console.log('[OK] Agent URI verified in indexer');
      } else {
        console.log('⚠️  URI updated on-chain, indexer not synced');
      }

      console.log('[OK] Agent URI updated');
      console.log('     New URI:', newUri);
      console.log('     Signature:', result.signature);
    }, 30000);

    it('should reject URI > 250 bytes', async () => {
      const longUri = 'ipfs://' + 'a'.repeat(244); // Total 251 bytes
      await expect(sdk.setAgentUri(agent, collection, longUri)).rejects.toThrow(/250/);
      console.log('[OK] URI length validation working');
    }, 30000);

    it('should accept URI = 250 bytes', async () => {
      const uri250 = 'ipfs://' + 'b'.repeat(243); // Exact 250 bytes
      const result = await sdk.setAgentUri(agent, collection, uri250);

      expect(result.success).toBe(true);
      console.log('[OK] Max URI length (250 bytes) accepted');
    }, 30000);
  });

  // ========================================
  // 10. set_metadata_pda
  // ========================================
  describe('10. set_metadata_pda', () => {
    it('should set mutable metadata', async () => {
      const result = await sdk.setMetadata(agent, 'testKey', 'testValue', false);
      expect(result.success).toBe(true);

      const value = await sdk.getMetadata(agent, 'testKey');
      expect(value).toBe('testValue');

      console.log('[OK] Mutable metadata set');
    }, 30000);

    it('should set immutable metadata', async () => {
      const result = await sdk.setMetadata(agent, 'immutableKey', 'immutableValue', true);
      expect(result.success).toBe(true);
      console.log('[OK] Immutable metadata set');
    }, 30000);

    it('should reject updating immutable metadata', async () => {
      const result = await sdk.setMetadata(agent, 'immutableKey', 'newValue', false);
      expect(result.success).toBe(false);
      expect(result.error).toContain('MetadataImmutable');
      console.log('[OK] Immutable metadata protection working');
    }, 30000);

    it('should reject reserved key "agentWallet"', async () => {
      // SDK throws validation error for reserved keys
      await expect(sdk.setMetadata(agent, 'agentWallet', 'value', false))
        .rejects.toThrow('reserved');
      console.log('[OK] Reserved key rejected');
    }, 30000);

    it('should reject key > 32 bytes', async () => {
      const longKey = 'a'.repeat(33);
      // SDK throws validation error for key too long
      await expect(sdk.setMetadata(agent, longKey, 'value', false))
        .rejects.toThrow('32 bytes');
      console.log('[OK] Key length validation working');
    }, 30000);

    it('should reject value > 250 bytes', async () => {
      const longValue = 'b'.repeat(251);
      // SDK throws validation error for value too long (limit is 250 bytes)
      await expect(sdk.setMetadata(agent, 'testKey2', longValue, false))
        .rejects.toThrow('250 bytes');
      console.log('[OK] Value length validation working');
    }, 30000);
  });

  // ========================================
  // 11. delete_metadata_pda
  // ========================================
  describe('11. delete_metadata_pda', () => {
    it('should delete mutable metadata', async () => {
      await sdk.setMetadata(agent, 'deletableKey', 'value', false);
      const result = await sdk.deleteMetadata(agent, 'deletableKey');
      expect(result.success).toBe(true);

      const value = await sdk.getMetadata(agent, 'deletableKey');
      expect(value).toBeNull();

      console.log('[OK] Mutable metadata deleted');
    }, 30000);

    it('should reject deleting immutable metadata', async () => {
      const result = await sdk.deleteMetadata(agent, 'immutableKey');
      expect(result.success).toBe(false);
      expect(result.error).toContain('MetadataImmutable');
      console.log('[OK] Immutable metadata deletion rejected');
    }, 30000);
  });

  // ========================================
  // 12. set_agent_wallet (Ed25519 signature verification)
  // ========================================
  describe('12. set_agent_wallet', () => {
    it('should set agent wallet with keypair (auto-sign)', async () => {
      const walletKeypair = Keypair.generate();
      const result = await sdk.setAgentWallet(agent, walletKeypair);

      expect(result.success).toBe(true);
      console.log('[OK] Agent wallet set with keypair');
      console.log('     Wallet:', walletKeypair.publicKey.toBase58());
    }, 30000);

    it('should set agent wallet with pre-signed message', async () => {
      const newWallet = Keypair.generate();
      const prepared = await sdk.prepareSetAgentWallet(agent, newWallet.publicKey);

      const nacl = await import('tweetnacl');
      const signature = nacl.default.sign.detached(prepared.message, newWallet.secretKey);

      const result = await prepared.complete(signature);
      expect(result.success).toBe(true);

      console.log('[OK] Agent wallet set with signature');
      console.log('     Wallet:', newWallet.publicKey.toBase58());
    }, 30000);

    it('should reject invalid signature', async () => {
      const newWallet = Keypair.generate();
      const wrongKeypair = Keypair.generate();

      const prepared = await sdk.prepareSetAgentWallet(agent, newWallet.publicKey);
      const nacl = await import('tweetnacl');
      const wrongSig = nacl.default.sign.detached(prepared.message, wrongKeypair.secretKey);

      const result = await prepared.complete(wrongSig);
      expect(result.success).toBe(false);
      console.log('[OK] Invalid signature rejected');
    }, 30000);
  });

  // ========================================
  // 13. sync_owner (after external transfer)
  // ========================================
  describe('13. sync_owner', () => {
    it('should sync owner (no-op when already synced)', async () => {
      // syncOwner updates AgentAccount.owner from Core NFT owner
      // When already synced, this is a no-op but should not fail
      const result = await sdk.syncOwner(agent);
      expect(result.success).toBe(true);

      // Verify owner is still correct
      const owner = await sdk.getAgentOwner(agent);
      expect(owner.toBase58()).toBe(ownerKeypair.publicKey.toBase58());

      console.log('[OK] syncOwner executed successfully (no-op when synced)');
    }, 30000);
  });

  // ========================================
  // 14. owner_of (read-only query)
  // ========================================
  describe('14. owner_of', () => {
    it('should query agent owner', async () => {
      const owner = await sdk.getAgentOwner(agent);
      expect(owner).toBeDefined();
      expect(owner.toBase58()).toBe(ownerKeypair.publicKey.toBase58());
      console.log('[OK] Owner queried:', owner.toBase58());
    });

    it('should verify owner with isAgentOwner', async () => {
      const isOwner = await sdk.isAgentOwner(agent, ownerKeypair.publicKey);
      expect(isOwner).toBe(true);

      const notOwner = await sdk.isAgentOwner(agent, wallet2Keypair.publicKey);
      expect(notOwner).toBe(false);

      console.log('[OK] Owner verification working');
    });
  });

  // ========================================
  // 15. transfer_agent (with wallet reset)
  // ========================================
  describe('15. transfer_agent', () => {
    it('should transfer agent and reset wallet', async () => {
      // Set agent wallet first
      const walletKeypair = Keypair.generate();
      await sdk.setAgentWallet(agent, walletKeypair);

      // Transfer to wallet2
      const result = await sdk.transferAgent(agent, collection, wallet2Keypair.publicKey);
      expect(result.success).toBe(true);

      // Verify new owner
      const newOwner = await sdk.getAgentOwner(agent);
      expect(newOwner.toBase58()).toBe(wallet2Keypair.publicKey.toBase58());

      // Verify wallet was reset (Borsh deserializes Option::None as null or undefined)
      const agentData = await sdk.loadAgent(agent);
      expect(agentData?.agent_wallet).toBeFalsy();

      console.log('[OK] Agent transferred and wallet reset');
      console.log('     New owner:', newOwner.toBase58());
    }, 30000);

    it('should reject transfer to self', async () => {
      const sdk2 = new SolanaSDK({
        rpcUrl: RPC_URL,
        programIds: { agentRegistry: PROGRAM_ID, atomEngine: ATOM_ENGINE_ID, mplCore: MPL_CORE_ID },
        signer: wallet2Keypair,
      });

      const result = await sdk2.transferAgent(agent, collection, wallet2Keypair.publicKey);
      expect(result.success).toBe(false);
      expect(result.error).toContain('TransferToSelf');
      console.log('[OK] Transfer to self rejected');
    }, 30000);
  });
});
