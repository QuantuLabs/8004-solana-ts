import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { SolanaSDK } from '../../src/core/sdk-solana';

const RPC_URL = process.env.SOLANA_RPC_URL || process.env.RPC_URL || 'http://127.0.0.1:8899';
const PROGRAM_ID = process.env.AGENT_REGISTRY_PROGRAM_ID || '8oo4J9tBB3Hna1jRQ3rWvJjojqM5DYTDJo5cejUuJy3C';
const ATOM_ENGINE_ID = process.env.ATOM_ENGINE_PROGRAM_ID || 'AToMufS4QD6hEXvcvBDg9m1AHeCLpmZQsyfYa5h9MwAF';
const MPL_CORE_ID = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';

describe('Collection + Parent-Child E2E', () => {
  let connection: Connection;
  let ownerKeypair: Keypair;
  let wallet2Keypair: Keypair;
  let sdk: SolanaSDK;
  let sdk2: SolanaSDK;
  let baseCollection: PublicKey;

  let childAsset: PublicKey;
  let parentAssetA: PublicKey;
  let parentAssetB: PublicKey;
  let unauthorizedChildAsset: PublicKey;

  const fundWallet = async (pubkey: PublicKey): Promise<void> => {
    const sig = await connection.requestAirdrop(pubkey, 8 * LAMPORTS_PER_SOL);
    const latest = await connection.getLatestBlockhash();
    await connection.confirmTransaction(
      {
        signature: sig,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      'confirmed'
    );
  };

  beforeAll(async () => {
    connection = new Connection(RPC_URL, 'confirmed');
    ownerKeypair = Keypair.generate();
    wallet2Keypair = Keypair.generate();

    await fundWallet(ownerKeypair.publicKey);
    await fundWallet(wallet2Keypair.publicKey);

    sdk = new SolanaSDK({
      rpcUrl: RPC_URL,
      signer: ownerKeypair,
      programIds: {
        agentRegistry: PROGRAM_ID,
        atomEngine: ATOM_ENGINE_ID,
        mplCore: MPL_CORE_ID,
      },
      // Fake IPFS client to keep localnet E2E deterministic.
      ipfsClient: {
        addJson: async () => 'QmYwAPJzv5CZsnAzt8auVZRnG6f5R7P9Z1v2L6kNf1v7Qp',
      } as any,
    });

    sdk2 = new SolanaSDK({
      rpcUrl: RPC_URL,
      signer: wallet2Keypair,
      programIds: {
        agentRegistry: PROGRAM_ID,
        atomEngine: ATOM_ENGINE_ID,
        mplCore: MPL_CORE_ID,
      },
    });

    const base = await sdk.getBaseCollection();
    if (!base) {
      throw new Error('Base collection not initialized on localnet');
    }
    baseCollection = base;

    const child = await sdk.registerAgent(`ipfs://QmChild_${Date.now()}`, baseCollection, { atomEnabled: false });
    const parentA = await sdk.registerAgent(`ipfs://QmParentA_${Date.now()}`, baseCollection, { atomEnabled: false });
    const parentB = await sdk.registerAgent(`ipfs://QmParentB_${Date.now()}`, baseCollection, { atomEnabled: false });
    const unauthorizedChild = await sdk.registerAgent(
      `ipfs://QmUnauthorizedChild_${Date.now()}`,
      baseCollection,
      { atomEnabled: false }
    );

    if (!child.success || !child.asset || !parentA.success || !parentA.asset || !parentB.success || !parentB.asset || !unauthorizedChild.success || !unauthorizedChild.asset) {
      throw new Error('Failed to bootstrap child/parent agents for collection-parent E2E');
    }

    childAsset = child.asset;
    parentAssetA = parentA.asset;
    parentAssetB = parentB.asset;
    unauthorizedChildAsset = unauthorizedChild.asset;
  }, 120000);

  it('should build collection JSON and return CID/URI/pointer via createCollection', async () => {
    const draft = sdk.createCollectionData({
      name: 'CasterCorp Collection',
      symbol: 'CAST',
      description: 'Collection metadata test',
    });
    expect(draft.version).toBe('1.0.0');
    expect(draft.name).toBe('CasterCorp Collection');

    const uploaded = await sdk.createCollection({
      name: 'CasterCorp Collection',
      symbol: 'CAST',
      description: 'Collection metadata test',
    });
    expect(uploaded.cid).toBeDefined();
    expect(uploaded.uri).toMatch(/^ipfs:\/\//);
    expect(uploaded.pointer).toMatch(/^c1:b[a-z2-7]+$/);
    expect(uploaded.pointer!.length).toBeLessThanOrEqual(128);
  });

  it('should expose creator and creators on agent account', async () => {
    const child = await sdk.loadAgent(childAsset);
    expect(child).toBeTruthy();
    expect(child!.getCreatorPublicKey().toBase58()).toBe(ownerKeypair.publicKey.toBase58());
    expect(child!.creators).toHaveLength(1);
    expect(child!.creators[0].toBase58()).toBe(ownerKeypair.publicKey.toBase58());
  });

  it('should set collection pointer unlocked, then relock it', async () => {
    const pointer1 = 'c1:bafybeigdyrzt4x7n3z6l6zjptk5f5t5b4v5l5m5n5p5q5r5s5t5u5v5w5x';
    const pointer2 = 'c1:bafybeifq7u3w2u7p4y8h6w7j9m5k2t8a4d2f7h3k5n8q2r4t6v8x9z1b3';

    const setUnlocked = await sdk.setCollectionPointer(childAsset, pointer1, { lock: false });
    expect(setUnlocked.success).toBe(true);

    const afterUnlocked = await sdk.loadAgent(childAsset);
    expect(afterUnlocked).toBeTruthy();
    expect(afterUnlocked!.col).toBe(pointer1);
    expect(afterUnlocked!.isCollectionPointerLocked()).toBe(false);

    const relock = await sdk.setCollectionPointer(childAsset, pointer2);
    expect(relock.success).toBe(true);

    const afterRelock = await sdk.loadAgent(childAsset);
    expect(afterRelock).toBeTruthy();
    expect(afterRelock!.col).toBe(pointer2);
    expect(afterRelock!.isCollectionPointerLocked()).toBe(true);
  });

  it('should reject collection pointer update when signer is not creator', async () => {
    const result = await sdk2.setCollectionPointer(
      unauthorizedChildAsset,
      'c1:bafybeicm4n9q2v5x7z1a3d6f8h2k4m6p8r1t3v5x7z9b2d4f6h8j1k3m5'
    );
    expect(result.success).toBe(false);
  });

  it('should set parent asset unlocked, then relock it', async () => {
    const setUnlocked = await sdk.setParentAsset(childAsset, parentAssetA, { lock: false });
    expect(setUnlocked.success).toBe(true);

    const afterUnlocked = await sdk.loadAgent(childAsset);
    expect(afterUnlocked).toBeTruthy();
    expect(afterUnlocked!.getParentAssetPublicKey()?.toBase58()).toBe(parentAssetA.toBase58());
    expect(afterUnlocked!.isParentLocked()).toBe(false);

    const relock = await sdk.setParentAsset(childAsset, parentAssetB);
    expect(relock.success).toBe(true);

    const afterRelock = await sdk.loadAgent(childAsset);
    expect(afterRelock).toBeTruthy();
    expect(afterRelock!.getParentAssetPublicKey()?.toBase58()).toBe(parentAssetB.toBase58());
    expect(afterRelock!.isParentLocked()).toBe(true);
  });

  it('should reject self-parent at SDK validation layer', async () => {
    await expect(sdk.setParentAsset(childAsset, childAsset)).rejects.toThrow('parentAsset must be different from asset');
  });

  it('should reject parent update when signer is not current owner', async () => {
    const result = await sdk2.setParentAsset(unauthorizedChildAsset, parentAssetA, { lock: false });
    expect(result.success).toBe(false);
  });
});
