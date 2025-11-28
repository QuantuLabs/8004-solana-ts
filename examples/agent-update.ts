/**
 * Agent Update Example - Solana SDK
 *
 * Demonstrates updating agent metadata
 */
import { Keypair } from '@solana/web3.js';
import { SolanaSDK } from '../src/index.js';

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

  // Update agent URI
  await sdk.setAgentUri(agentId, 'ipfs://QmUpdatedMetadata');
  console.log('Agent URI updated!');

  // Set metadata extension
  await sdk.setMetadata(agentId, 'version', '2.0.0');
  console.log('Metadata updated!');
}

main().catch(console.error);
