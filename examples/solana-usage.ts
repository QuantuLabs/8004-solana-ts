/**
 * Example: Using Agent0 Solana SDK
 *
 * This example demonstrates both read and write operations
 * with the Solana implementation of ERC-8004
 */

import { Keypair } from '@solana/web3.js';
import { createDevnetSDK } from '../src/solana/index.js';

// ============================================================
// READ OPERATIONS (No signer required)
// ============================================================

async function readOperations() {
  console.log('=== READ OPERATIONS ===\n');

  // Initialize SDK without signer for read-only
  const sdk = createDevnetSDK();

  const agentId = 1n; // Example agent ID

  // 1. Get reputation summary
  console.log('1. Getting reputation summary...');
  const summary = await sdk.getSummary(agentId);
  console.log(`   Average score: ${summary.averageScore}`);
  console.log(`   Total feedbacks: ${summary.totalFeedbacks}\n`);

  // 2. Read all feedback
  console.log('2. Reading all feedback...');
  const feedbacks = await sdk.readAllFeedback(agentId, false);
  console.log(`   Found ${feedbacks.length} feedbacks`);
  feedbacks.slice(0, 3).forEach((fb, i) => {
    console.log(`   [${i}] Score: ${fb.score}, URI: ${fb.file_uri}`);
  });
  console.log();

  // 3. Get all clients who gave feedback
  console.log('3. Getting clients...');
  const clients = await sdk.getClients(agentId);
  console.log(`   Found ${clients.length} clients`);
  clients.slice(0, 3).forEach((client, i) => {
    console.log(`   [${i}] ${client.toBase58()}`);
  });
  console.log();

  // 4. Load agent details
  console.log('4. Loading agent...');
  const agent = await sdk.loadAgent(agentId);
  if (agent) {
    console.log(`   Owner: ${agent.getOwnerPublicKey().toBase58()}`);
    console.log(`   Token URI: ${agent.token_uri}`);
    console.log(`   Status: ${agent.status}\n`);
  }
}

// ============================================================
// WRITE OPERATIONS (Requires signer)
// ============================================================

async function writeOperations() {
  console.log('=== WRITE OPERATIONS ===\n');

  // Load signer from environment variable
  const secretKey = process.env.SOLANA_PRIVATE_KEY;
  if (!secretKey) {
    console.log('❌ SOLANA_PRIVATE_KEY not set, skipping write operations\n');
    return;
  }

  const signer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(secretKey))
  );

  // Initialize SDK with signer
  const sdk = createDevnetSDK({ signer });
  console.log(`Signer: ${signer.publicKey.toBase58()}\n`);

  // 1. Register a new agent
  console.log('1. Registering new agent...');
  try {
    const registerResult = await sdk.registerAgent('ipfs://QmExample');
    console.log(`   ✅ Agent registered!`);
    console.log(`   Agent ID: ${registerResult.agentId}`);
    console.log(`   Transaction: ${registerResult.signature}\n`);
  } catch (error) {
    console.log(`   ℹ️  ${error.message}\n`);
  }

  // 2. Give feedback to an agent
  const targetAgentId = 1n;
  console.log(`2. Giving feedback to agent ${targetAgentId}...`);
  try {
    const feedbackResult = await sdk.giveFeedback(
      targetAgentId,
      85, // Score 0-100
      'ipfs://QmFeedbackExample',
      Buffer.alloc(32) // 32-byte hash
    );
    console.log(`   ✅ Feedback given!`);
    console.log(`   Feedback index: ${feedbackResult.feedbackIndex}`);
    console.log(`   Transaction: ${feedbackResult.signature}\n`);
  } catch (error) {
    console.log(`   ℹ️  ${error.message}\n`);
  }

  // 3. Set agent metadata
  console.log('3. Setting agent metadata...');
  try {
    const metadataResult = await sdk.setMetadata(
      1n, // Your agent ID
      'version',
      '1.0.0'
    );
    console.log(`   ✅ Metadata set!`);
    console.log(`   Transaction: ${metadataResult.signature}\n`);
  } catch (error) {
    console.log(`   ℹ️  ${error.message}\n`);
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  try {
    await readOperations();
    await writeOperations();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
