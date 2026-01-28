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
  // === READ OPERATIONS ===
  // Create SDK (devnet by default, no signer = read-only)
  const sdk = new SolanaSDK();

  // Example agent asset (replace with actual asset PublicKey)
  const agentAsset = new PublicKey('Fxy2ScxgVyc7Tsh3yKBtFg4Mke2qQR2HqjwVaPqhkjnJ');

  // Load an agent by asset
  const agent = await sdk.loadAgent(agentAsset);
  if (agent) {
    console.log(`Agent: ${agent.nft_name}`);
    console.log(`Owner: ${agent.getOwnerPublicKey().toBase58()}`);
    console.log(`Asset: ${agent.getAssetPublicKey().toBase58()}`);
  }

  // Get reputation summary
  const summary = await sdk.getSummary(agentAsset);
  console.log(`Score: ${summary.averageScore}/100 (${summary.totalFeedbacks} reviews)`);

  // === WRITE OPERATIONS ===
  // Requires signer
  const secretKey = process.env.SOLANA_PRIVATE_KEY;
  if (!secretKey) {
    console.log('Set SOLANA_PRIVATE_KEY for write operations');
    return;
  }

  const signer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey)));
  const writeSdk = new SolanaSDK({ signer });

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
  // Get a free Pinata JWT at https://pinata.cloud
  if (process.env.PINATA_JWT) {
    const ipfs = new IPFSClient({
      pinataEnabled: true,
      pinataJwt: process.env.PINATA_JWT,
    });

    // Upload metadata to IPFS
    const metadataCid = await ipfs.addJson(metadata);
    const metadataUri = `ipfs://${metadataCid}`;
    console.log(`Metadata uploaded to: ${metadataUri}`);

    // === REGISTER AGENT ===
    // Uncomment to register a new agent (returns { asset, signature })
    // const result = await writeSdk.registerAgent(metadataUri);
    // console.log(`Registered agent with asset: ${result.asset.toBase58()}`);
  } else {
    console.log('Set PINATA_JWT to upload metadata to IPFS');
    // Alternative: use web URL
    // const result = await writeSdk.registerAgent('https://my-server.com/metadata.json');
  }

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
