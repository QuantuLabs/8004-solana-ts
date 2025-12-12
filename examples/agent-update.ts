/**
 * Agent Update Example - Solana SDK
 *
 * Demonstrates:
 * 1. Updating agent URI via IPFS upload
 * 2. Setting on-chain metadata extensions
 * 3. Making metadata immutable (permanent, cannot be changed)
 * 4. Reading on-chain metadata
 * 5. Deleting metadata (if not immutable)
 */
import { Keypair } from '@solana/web3.js';
import {
  SolanaSDK,
  IPFSClient,
  buildRegistrationFileJson,
  EndpointType,
} from '../src/index.js';

async function main() {
  const secretKey = process.env.SOLANA_PRIVATE_KEY;
  if (!secretKey) {
    console.log('Set SOLANA_PRIVATE_KEY');
    return;
  }

  const signer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey)));
  const sdk = new SolanaSDK({ cluster: 'devnet', signer });

  const agentId = 1n; // Your agent ID

  // Load current agent
  const agent = await sdk.loadAgent(agentId);
  if (!agent) {
    console.log('Agent not found');
    return;
  }
  console.log(`Current URI: ${agent.agent_uri}`);

  // === UPDATE AGENT URI VIA IPFS ===
  if (process.env.PINATA_JWT) {
    const ipfs = new IPFSClient({
      pinataEnabled: true,
      pinataJwt: process.env.PINATA_JWT,
    });

    // Build updated metadata
    const updatedMetadata = buildRegistrationFileJson({
      name: 'My Updated Agent',
      description: 'Agent with updated metadata',
      image: 'https://example.com/new-avatar.png',
      endpoints: [
        { type: EndpointType.MCP, value: 'https://api.example.com/mcp/v2' },
      ],
    });

    // Upload to IPFS
    const newCid = await ipfs.addJson(updatedMetadata);
    const newUri = `ipfs://${newCid}`;

    // Update on-chain URI
    await sdk.setAgentUri(agentId, newUri);
    console.log(`Agent URI updated to: ${newUri}`);
  } else {
    // Without IPFS, use direct URL
    await sdk.setAgentUri(agentId, 'https://my-server.com/metadata.json');
    console.log('Agent URI updated (web URL)');
  }

  // === ON-CHAIN METADATA EXTENSIONS ===
  // Store key-value pairs directly on Solana blockchain
  // Useful for: version info, capabilities, certifications, etc.

  // Set mutable metadata (can be updated/deleted later)
  await sdk.setMetadata(agentId, 'version', '2.0.0');
  console.log('Version metadata set (mutable)');

  // Set another metadata entry
  await sdk.setMetadata(agentId, 'api_version', 'v1');
  console.log('API version metadata set (mutable)');

  // === IMMUTABLE METADATA ===
  // Once set as immutable, CANNOT be modified or deleted
  // Use for: permanent certifications, audit trails, compliance records

  // Set immutable metadata (4th parameter = true)
  await sdk.setMetadata(agentId, 'certified_by', 'TrustAuthority', true);
  console.log('Certification metadata set (IMMUTABLE - permanent!)');

  // === READ ON-CHAIN METADATA ===
  const version = await sdk.getMetadata(agentId, 'version');
  console.log(`Read version: ${version}`);

  const certification = await sdk.getMetadata(agentId, 'certified_by');
  console.log(`Read certification: ${certification}`);

  // === DELETE METADATA ===
  // Only works for mutable metadata (will fail for immutable)
  await sdk.deleteMetadata(agentId, 'api_version');
  console.log('API version metadata deleted');

  // This would FAIL because certified_by is immutable:
  // await sdk.deleteMetadata(agentId, 'certified_by'); // Error!

  console.log('\nDone! On-chain metadata updated.');
}

main().catch(console.error);
