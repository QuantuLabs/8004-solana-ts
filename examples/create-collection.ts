/**
 * Create Collection Example (CID-first)
 *
 * Shows how to:
 * 1) build collection JSON locally
 * 2) upload to IPFS
 * 3) reuse cid/uri/pointer in your asset pipeline
 */
import { SolanaSDK, IPFSClient } from '../src/index.js';

async function main() {
  const pinataJwt = process.env.PINATA_JWT;
  const ipfs = pinataJwt
    ? new IPFSClient({
        pinataEnabled: true,
        pinataJwt,
      })
    : new IPFSClient({
        url: process.env.IPFS_API_URL || 'http://localhost:5001',
      });

  // Signer is optional for this flow: collection metadata is built/uploaded off-chain.
  const sdk = new SolanaSDK({ ipfsClient: ipfs });

  // 1) Build JSON only (no upload)
  const collectionJson = sdk.createCollectionData({
    name: 'CasterCorp Agents',
    symbol: 'CAST',
    description: 'Main collection metadata for CasterCorp agents',
    socials: {
      website: 'https://castercorp.ai',
      x: '@castercorp',
    },
    tags: ['agents', 'automation', 'castercorp'],
  });

  console.log('Collection JSON preview:');
  console.log(JSON.stringify(collectionJson, null, 2));

  // 2) Build + upload to IPFS
  const uploaded = await sdk.createCollection(collectionJson);

  console.log('\nCollection uploaded:');
  console.log(`CID: ${uploaded.cid}`);
  console.log(`URI: ${uploaded.uri}`);
  console.log(`Pointer: ${uploaded.pointer}`);

  // 3) Reuse in your asset creation pipeline
  console.log('\nUse these outputs in your workflow:');
  console.log('- cid/uri for metadata tracking');
  console.log('- pointer for advanced on-chain linking via setCollectionPointer(asset, pointer)');

  // Association rules reminder
  console.log('\nPointer rules: c1: prefix, lowercase alphanumeric payload, <= 128 bytes.');
}

main().catch((error) => {
  console.error('create-collection failed:', error);
  process.exit(1);
});
