#!/usr/bin/env npx tsx
/**
 * Manual E2E test script for SDK
 * Run: npx tsx scripts/e2e-test.ts
 */
import 'dotenv/config';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { SolanaSDK } from '../src';

const AGENT_KEY = process.env.AGENT_PRIVATE_KEY!;
const RPC_URL = 'https://api.devnet.solana.com';

async function main() {
  console.log('🧪 E2E Test: Full Flow via SDK (Devnet)\n');

  // Setup
  const signer = Keypair.fromSecretKey(bs58.decode(AGENT_KEY));
  const sdk = new SolanaSDK({ cluster: 'devnet', signer });
  const connection = new Connection(RPC_URL);

  console.log(`Wallet: ${signer.publicKey.toBase58()}`);
  const balance = await connection.getBalance(signer.publicKey);
  console.log(`Balance: ${(balance / 1e9).toFixed(4)} SOL\n`);

  // 1. Register Agent
  console.log('1️⃣  Registering agent...');
  const uri = `https://test.example.com/agent-${Date.now()}.json`;
  const result = await sdk.registerAgent(uri);

  if (!result.success) {
    console.error('❌ Registration failed:', result.error);
    return;
  }

  const asset = result.asset!;
  console.log(`   ✅ Asset: ${asset.toBase58()}`);
  console.log(`   ✅ Signature: ${result.signature}\n`);

  // 2. Load Agent
  console.log('2️⃣  Loading agent from chain...');
  const agent = await sdk.loadAgent(asset);
  if (agent) {
    console.log(`   ✅ Owner: ${new PublicKey(agent.owner).toBase58()}`);
    console.log(`   ✅ URI: ${agent.agent_uri}\n`);
  } else {
    console.log('   ⚠️ Agent not found (may take time to finalize)\n');
  }

  // 3. Give Feedback
  console.log('3️⃣  Giving feedback...');
  const feedbackResult = await sdk.giveFeedback(asset, {
    score: 85,
    feedbackUri: 'https://test.example.com/feedback.json',
    feedbackHash: Buffer.alloc(32),
  });

  if (feedbackResult.success) {
    console.log(`   ✅ Feedback given! Sig: ${feedbackResult.signature}\n`);
  } else {
    console.log(`   ⚠️ Feedback failed: ${feedbackResult.error}\n`);
  }

  // Wait for finalization
  console.log('⏳ Waiting 3s for finalization...\n');
  await new Promise(r => setTimeout(r, 3000));

  // 4. Get Summary
  console.log('4️⃣  Getting reputation summary...');
  const summary = await sdk.getSummary(asset);
  console.log(`   Total feedbacks: ${summary.totalFeedbacks}`);
  console.log(`   Average score: ${summary.averageScore}`);
  console.log(`   Trust tier: ${summary.trustTier}\n`);

  // 5. Request Validation
  console.log('5️⃣  Requesting validation...');
  const validator = Keypair.generate().publicKey;
  const nonce = Date.now() % 10000;

  const validationResult = await sdk.requestValidation(
    asset,
    validator,
    nonce,
    'https://test.example.com/validation.json',
    Buffer.alloc(32)
  );

  if (validationResult.success) {
    console.log(`   ✅ Validation requested! Sig: ${validationResult.signature}`);
    console.log(`   Validator: ${validator.toBase58()}`);
    console.log(`   Nonce: ${nonce}\n`);
  } else {
    console.log(`   ⚠️ Validation request failed: ${validationResult.error}\n`);
  }

  // 6. Read Validation
  console.log('6️⃣  Reading validation state...');
  await new Promise(r => setTimeout(r, 2000));
  const validation = await sdk.readValidation(asset, validator, nonce);

  if (validation) {
    console.log(`   ✅ Validation found!`);
    console.log(`   Response: ${validation.response}`);
    console.log(`   Responded at: ${validation.respondedAt}\n`);
  } else {
    console.log(`   ⚠️ Validation not found yet\n`);
  }

  // 7. Set Metadata
  console.log('7️⃣  Setting metadata...');
  const metaResult = await sdk.setMetadata(asset, 'test_key', 'test_value_123');

  if (metaResult.success) {
    console.log(`   ✅ Metadata set! Sig: ${metaResult.signature}\n`);
  } else {
    console.log(`   ⚠️ Metadata failed: ${metaResult.error}\n`);
  }

  // 8. Read Metadata
  console.log('8️⃣  Reading metadata...');
  await new Promise(r => setTimeout(r, 2000));
  const metaValue = await sdk.getMetadata(asset, 'test_key');
  console.log(`   Value: ${metaValue || '(not found yet)'}\n`);

  console.log('✅ E2E Test Complete!\n');
  console.log(`Asset for verification: ${asset.toBase58()}`);
}

main().catch(console.error);
