/**
 * Quick Start Example - Solana SDK v0.5.0+
 *
 * Demonstrates basic read and write operations using 8004-solana SDK
 */
import { Keypair, PublicKey } from '@solana/web3.js';
import {
  SolanaSDK,
  IPFSClient,
  buildRegistrationFileJson,
  ServiceType,
} from '../src/index.js';
import type { RegistrationFile } from '../src/index.js';

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const cluster = (process.env.SOLANA_CLUSTER as 'devnet' | 'localnet' | 'mainnet-beta' | undefined)
    ?? (rpcUrl?.includes('127.0.0.1') ? 'localnet' : 'devnet');

  // === READ OPERATIONS ===
  // Create SDK (devnet by default, force on-chain reads to avoid indexer schema drift)
  const sdk = new SolanaSDK({
    cluster,
    ...(rpcUrl ? { rpcUrl } : {}),
    forceOnChain: true,
  });

  // Example agent asset (replace with actual asset PublicKey)
  const agentAsset = new PublicKey(
    process.env.EXAMPLE_AGENT_ASSET ?? 'Fxy2ScxgVyc7Tsh3yKBtFg4Mke2qQR2HqjwVaPqhkjnJ'
  );

  // Load an agent by asset
  const agent = await sdk.loadAgent(agentAsset);
  if (agent) {
    console.log(`Agent: ${agent.nft_name}`);
    console.log(`Owner: ${agent.getOwnerPublicKey().toBase58()}`);
    console.log(`Asset: ${agent.getAssetPublicKey().toBase58()}`);
  }

  // Get reputation summary
  try {
    const summary = await sdk.getSummary(agentAsset);
    console.log(`Score: ${summary.averageScore}/100 (${summary.totalFeedbacks} reviews)`);
  } catch {
    console.log('Reputation summary unavailable with current indexer setup; set INDEXER_GRAPHQL_URL/INDEXER_URL');
  }

  // === WRITE OPERATIONS ===
  // Requires signer
  const secretKey = process.env.SOLANA_PRIVATE_KEY;
  if (!secretKey) {
    console.log('Set SOLANA_PRIVATE_KEY for write operations');
    return;
  }

  const signer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey)));
  const pinataJwt = process.env.PINATA_JWT;
  const ipfs = pinataJwt
    ? new IPFSClient({
        pinataEnabled: true,
        pinataJwt,
      })
    : new IPFSClient({
        url: process.env.IPFS_API_URL || 'http://localhost:5001',
      });
  const writeSdk = new SolanaSDK({
    cluster,
    ...(rpcUrl ? { rpcUrl } : {}),
    signer,
    ipfsClient: ipfs,
  });

  // === COLLECTION (CID-first) ===
  const collectionUpload = await writeSdk.createCollection({
    name: 'Quickstart Agents',
    symbol: 'QSA',
    description: 'Collection metadata for quickstart examples',
    socials: {
      website: 'https://example.com',
      x: '@example',
    },
  });
  console.log(`Collection CID: ${collectionUpload.cid}`);
  console.log(`Collection URI: ${collectionUpload.uri}`);
  console.log(`Collection Pointer: ${collectionUpload.pointer}`);

  // Build 8004 compliant metadata
  const agentData: RegistrationFile = {
    name: 'My AI Assistant',
    description: 'A helpful AI agent for task automation',
    services: [
      { type: ServiceType.MCP, value: 'https://api.example.com/mcp' },
    ],
    // OASF taxonomies (optional) - see docs/OASF.md for valid slugs
    skills: ['natural_language_processing/natural_language_generation/summarization'],
    domains: ['technology/software_engineering/software_engineering'],
  };

  const metadata = buildRegistrationFileJson(agentData);
  console.log('Metadata:', JSON.stringify(metadata, null, 2));

  // === IPFS UPLOAD ===
  // Upload metadata to IPFS
  const metadataCid = await ipfs.addJson(metadata);
  const metadataUri = `ipfs://${metadataCid}`;
  console.log(`Metadata uploaded to: ${metadataUri}`);

  // === REGISTER AGENT ===
  // Uncomment to register a new agent (returns { asset, signature })
  // const result = await writeSdk.registerAgent(metadataUri);
  // console.log(`Registered agent with asset: ${result.asset.toBase58()}`);
  //
  // Optional advanced association flows:
  // await writeSdk.setCollectionPointer(result.asset, collectionUpload.pointer!); // lock=true (default)
  // await writeSdk.setCollectionPointer(result.asset, collectionUpload.pointer!, { lock: false });
  // await writeSdk.setParentAsset(result.asset, new PublicKey('ParentAgentAssetPubkey...'), { lock: false });

  // === GIVE FEEDBACK ===
  // Submit feedback for an existing agent (value required)
  // await writeSdk.giveFeedback(agentAsset, {
  //   value: '85',
  //   tag1: 'helpful',
  //   tag2: 'accurate',
  // });
  console.log('\nQuick start complete!');
}

main().catch(console.error);
