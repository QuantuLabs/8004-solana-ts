#!/usr/bin/env npx tsx
/**
 * E2E Test for Indexer - Creates feedbacks, validations, metadata
 * Run: npx tsx scripts/e2e-indexer-test.ts
 */
import 'dotenv/config';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { SolanaSDK } from '../src';

const AGENT_KEY = process.env.AGENT_PRIVATE_KEY!;
const RPC_URL = 'https://api.devnet.solana.com';
const INDEXER_URL = 'http://localhost:4000/graphql'; // Local indexer

async function main() {
  console.log('🧪 E2E Indexer Test - Creating data for indexer\n');

  const connection = new Connection(RPC_URL);

  // Wallet 1 - Agent owner
  const wallet1 = Keypair.fromSecretKey(bs58.decode(AGENT_KEY));
  const sdk1 = new SolanaSDK({ cluster: 'devnet', signer: wallet1 });

  // Wallet 2 - Feedback giver (generate new)
  const wallet2 = Keypair.generate();
  const sdk2 = new SolanaSDK({ cluster: 'devnet', signer: wallet2 });

  console.log(`Wallet 1 (Owner): ${wallet1.publicKey.toBase58()}`);
  console.log(`Wallet 2 (Client): ${wallet2.publicKey.toBase58()}\n`);

  // Check balance and fund wallet2
  const balance1 = await connection.getBalance(wallet1.publicKey);
  console.log(`Wallet 1 balance: ${(balance1 / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  // Transfer SOL from wallet1 to wallet2 for transactions
  console.log('\n📤 Transferring 0.05 SOL from wallet1 to wallet2...');
  const { SystemProgram, Transaction, sendAndConfirmTransaction } = await import('@solana/web3.js');
  const transferTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet1.publicKey,
      toPubkey: wallet2.publicKey,
      lamports: 0.05 * LAMPORTS_PER_SOL,
    })
  );
  await sendAndConfirmTransaction(connection, transferTx, [wallet1]);

  const balance2 = await connection.getBalance(wallet2.publicKey);
  console.log(`Wallet 2 balance: ${(balance2 / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);

  // 1. Register Agent (wallet1)
  console.log('1️⃣  Registering agent (wallet1)...');
  const uri = `https://example.com/agent-${Date.now()}.json`;
  const registerResult = await sdk1.registerAgent(uri);

  if (!registerResult.success) {
    console.error('❌ Registration failed:', registerResult.error);
    return;
  }

  const asset = registerResult.asset!;
  console.log(`   ✅ Asset: ${asset.toBase58()}`);
  console.log(`   Sig: ${registerResult.signature}\n`);

  // Wait for finalization
  await sleep(3000);

  // 2. Give Feedback (wallet2 -> agent)
  console.log('2️⃣  Giving feedback (wallet2 -> agent)...');
  const feedbackResult = await sdk2.giveFeedback(asset, {
    score: 92,
    feedbackUri: 'https://example.com/feedback-1.json',
    feedbackHash: Buffer.alloc(32),
    tag1: 'quality',
    tag2: 'speed',
  });

  if (feedbackResult.success) {
    console.log(`   ✅ Feedback #1 given! Score: 92`);
    console.log(`   Sig: ${feedbackResult.signature}\n`);
  } else {
    console.log(`   ⚠️ Feedback failed: ${feedbackResult.error}\n`);
  }

  // 3. Give another feedback
  console.log('3️⃣  Giving second feedback (wallet2 -> agent)...');
  const feedback2Result = await sdk2.giveFeedback(asset, {
    score: 78,
    feedbackUri: 'https://example.com/feedback-2.json',
    feedbackHash: Buffer.alloc(32),
    tag1: 'reliability',
  });

  if (feedback2Result.success) {
    console.log(`   ✅ Feedback #2 given! Score: 78`);
    console.log(`   Sig: ${feedback2Result.signature}\n`);
  } else {
    console.log(`   ⚠️ Feedback failed: ${feedback2Result.error}\n`);
  }

  // 4. Set Metadata
  console.log('4️⃣  Setting metadata...');
  const meta1 = await sdk1.setMetadata(asset, 'version', '1.0.0');
  const meta2 = await sdk1.setMetadata(asset, 'category', 'trading-bot');
  console.log(`   ✅ version=1.0.0 (${meta1.success})`);
  console.log(`   ✅ category=trading-bot (${meta2.success})\n`);

  // 5. Request Validation
  console.log('5️⃣  Requesting validation...');
  const validator = wallet2.publicKey;
  const nonce = Math.floor(Date.now() / 1000) % 100000;

  const validationResult = await sdk1.requestValidation(
    asset,
    validator,
    nonce,
    'https://example.com/validation-request.json',
    Buffer.alloc(32)
  );

  if (validationResult.success) {
    console.log(`   ✅ Validation requested!`);
    console.log(`   Validator: ${validator.toBase58()}`);
    console.log(`   Nonce: ${nonce}`);
    console.log(`   Sig: ${validationResult.signature}\n`);
  } else {
    console.log(`   ⚠️ Validation request failed: ${validationResult.error}\n`);
  }

  // Wait for finalization
  await sleep(2000);

  // 6. Respond to Validation (wallet2 as validator)
  console.log('6️⃣  Responding to validation (wallet2)...');
  const responseResult = await sdk2.respondToValidation(
    asset,
    nonce,
    85, // validation score
    'https://example.com/validation-response.json',
    Buffer.alloc(32)
  );

  if (responseResult.success) {
    console.log(`   ✅ Validation responded! Score: 85`);
    console.log(`   Sig: ${responseResult.signature}\n`);
  } else {
    console.log(`   ⚠️ Validation response failed: ${responseResult.error}\n`);
  }

  // Wait for indexer to pick up
  console.log('⏳ Waiting 5s for indexer to process...\n');
  await sleep(5000);

  // 7. Verify via SDK reads
  console.log('7️⃣  Verifying data via SDK...');

  const agent = await sdk1.loadAgent(asset);
  if (agent) {
    console.log(`   Agent URI: ${agent.agent_uri}`);
  }

  const summary = await sdk1.getSummary(asset);
  console.log(`   Total feedbacks: ${summary.totalFeedbacks}`);
  console.log(`   Average score: ${summary.averageScore}`);
  console.log(`   Trust tier: ${summary.trustTier || 'N/A'}`);

  const validation = await sdk1.readValidation(asset, validator, nonce);
  if (validation) {
    console.log(`   Validation response: ${validation.response}`);
    console.log(`   Responded at: ${validation.respondedAt || 'pending'}`);
  }

  const versionMeta = await sdk1.getMetadata(asset, 'version');
  const categoryMeta = await sdk1.getMetadata(asset, 'category');
  console.log(`   Metadata version: ${versionMeta}`);
  console.log(`   Metadata category: ${categoryMeta}`);

  // 8. Check indexer (if running locally)
  console.log('\n8️⃣  Checking indexer API...');
  try {
    const response = await fetch(INDEXER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query {
            agent(id: "${asset.toBase58()}") {
              id
              owner
              feedbackCount
              averageScore
            }
            stats {
              totalAgents
              totalFeedbacks
              totalValidations
            }
          }
        `
      })
    });

    const data = await response.json();
    console.log('   Indexer response:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.log(`   ⚠️ Indexer not reachable at ${INDEXER_URL}`);
    console.log('   Run the indexer locally or check Railway deployment');
  }

  console.log('\n✅ E2E Indexer Test Complete!');
  console.log(`\nAsset created: ${asset.toBase58()}`);
  console.log('Check indexer GraphQL for this agent.');
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
