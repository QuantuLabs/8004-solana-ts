#!/usr/bin/env tsx
/**
 * Complete On-Chain Test Script
 * Tests all SDK features against Solana devnet
 *
 * Usage:
 *   export SOLANA_PRIVATE_KEY='[1,2,3,...,64]'
 *   npx tsx scripts/test-onchain-full.ts
 */

import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SolanaSDK } from '../src/core/sdk-solana.js';

async function main() {
  console.log('🚀 Starting comprehensive on-chain test...\n');

  // Setup
  const privateKeyEnv = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKeyEnv) {
    throw new Error('❌ SOLANA_PRIVATE_KEY environment variable not set');
  }

  const signer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(privateKeyEnv))
  );
  const sdk = new SolanaSDK({ cluster: 'devnet', signer });
  const connection = sdk.getSolanaClient().getConnection();

  console.log('🔑 Signer:', signer.publicKey.toBase58());
  console.log('🌐 Cluster:', sdk.getCluster());

  // Check balance
  const balance = await connection.getBalance(signer.publicKey);
  console.log(`💰 Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.warn('⚠️  Low balance! Get devnet SOL from https://faucet.solana.com/\n');
  }

  // Test 1: Register Agent
  console.log('\n📝 Test 1: Register Agent with ATOM auto-init');
  const tokenUri = `ipfs://QmTest${Date.now()}`;
  const registerResult = await sdk.registerAgent(tokenUri);

  if (!registerResult.success || !registerResult.asset) {
    throw new Error(`❌ registerAgent failed: ${registerResult.error}`);
  }

  const agentAsset = registerResult.asset;
  console.log('✅ Agent registered:', agentAsset.toBase58());
  console.log('   Transaction:', registerResult.signature);
  if ('signatures' in registerResult && registerResult.signatures) {
    console.log('   ATOM initialized:', registerResult.signatures[1]);
  }

  // Wait for propagation
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: Load Agent
  console.log('\n🔍 Test 2: Load Agent');
  const agent = await sdk.loadAgent(agentAsset);
  if (!agent) {
    throw new Error('❌ loadAgent returned null');
  }
  console.log('✅ Agent loaded');
  console.log('   Owner:', agent.getOwnerPublicKey().toBase58());
  console.log('   URI:', agent.agent_uri);
  console.log('   Agent Wallet:', agent.getAgentWalletPublicKey()?.toBase58() || 'null');

  // Test 3: Set Metadata
  console.log('\n📝 Test 3: Set Metadata');
  const metadataResult = await sdk.setMetadata(agentAsset, 'test_key', 'test_value');
  if (!('signature' in metadataResult)) {
    throw new Error('❌ setMetadata failed');
  }
  console.log('✅ Metadata set');
  console.log('   Transaction:', metadataResult.signature);

  // Test 4: Set Agent Wallet
  console.log('\n🔧 Test 4: Set Agent Wallet');
  const operationalWallet = Keypair.generate();
  console.log('   New wallet:', operationalWallet.publicKey.toBase58());

  // Generate deadline (5 minutes from now)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  // Create message to sign
  const message = Buffer.concat([
    Buffer.from('8004_WALLET_SET:'),
    agentAsset.toBuffer(),
    operationalWallet.publicKey.toBuffer(),
    signer.publicKey.toBuffer(),
    Buffer.alloc(8),
  ]);
  message.writeBigUInt64LE(deadline, message.length - 8);

  // Sign with operational wallet (proving ownership)
  const { sign } = await import('@noble/ed25519');
  const signature = await sign(message, operationalWallet.secretKey.slice(0, 32));

  const walletResult = await sdk.setAgentWallet(
    agentAsset,
    operationalWallet.publicKey,
    new Uint8Array(signature),
    deadline
  );

  if (!('signature' in walletResult)) {
    throw new Error('❌ setAgentWallet failed');
  }
  console.log('✅ Agent wallet set');
  console.log('   Transaction:', walletResult.signature);

  // Wait for propagation
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 5: Verify Agent Wallet On-Chain
  console.log('\n🔍 Test 5: Verify Agent Wallet On-Chain');
  const updatedAgent = await sdk.loadAgent(agentAsset);
  if (!updatedAgent) {
    throw new Error('❌ loadAgent returned null');
  }
  const onchainWallet = updatedAgent.getAgentWalletPublicKey();
  if (!onchainWallet || !onchainWallet.equals(operationalWallet.publicKey)) {
    throw new Error('❌ Agent wallet not set on-chain correctly');
  }
  console.log('✅ Agent wallet verified on-chain');
  console.log('   Wallet:', onchainWallet.toBase58());

  // Test 6: Sign Data
  console.log('\n✍️  Test 6: Sign Data with Agent Wallet');
  const testData = { message: 'Hello 8004', timestamp: Date.now() };
  const signedPayload = sdk.sign(agentAsset, testData, {
    signer: operationalWallet,
  });
  console.log('✅ Data signed');
  console.log('   Payload version:', signedPayload.version);
  console.log('   Algorithm:', signedPayload.algorithm);

  // Test 7: Verify Signature
  console.log('\n🔐 Test 7: Verify Signature with On-Chain Wallet');
  const isValid = await sdk.verify(signedPayload, agentAsset);
  if (!isValid) {
    throw new Error('❌ Signature verification failed');
  }
  console.log('✅ Signature verified using on-chain wallet');

  // Test 8: Create Client and Give Feedback
  console.log('\n⭐ Test 8: Give Feedback');
  const clientKeypair = Keypair.generate();

  // Fund client
  console.log('   Funding client...');
  const { Transaction, SystemProgram, sendAndConfirmTransaction } = await import('@solana/web3.js');
  const transferTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: clientKeypair.publicKey,
      lamports: 0.05 * LAMPORTS_PER_SOL,
    })
  );
  await sendAndConfirmTransaction(connection, transferTx, [signer]);
  console.log('   Client funded');

  const clientSdk = new SolanaSDK({ cluster: 'devnet', signer: clientKeypair });
  const feedbackResult = await clientSdk.giveFeedback(agentAsset, {
    score: 90,
    feedbackUri: `ipfs://QmFeedback${Date.now()}`,
    feedbackHash: Buffer.alloc(32, 1),
  });

  if (!('signature' in feedbackResult) || !('feedbackIndex' in feedbackResult)) {
    throw new Error('❌ giveFeedback failed');
  }
  const feedbackIndex = feedbackResult.feedbackIndex;
  console.log('✅ Feedback given');
  console.log('   Index:', feedbackIndex);
  console.log('   Transaction:', feedbackResult.signature);

  // Test 9: Get Summary (ATOM)
  console.log('\n📊 Test 9: Get Reputation Summary');
  await new Promise(resolve => setTimeout(resolve, 2000));
  const summary = await sdk.getSummary(agentAsset);
  console.log('✅ Summary retrieved');
  console.log('   Average score:', summary.averageScore);
  console.log('   Total feedbacks:', summary.totalFeedbacks);
  console.log('   Trust tier:', summary.trustTier);

  // Test 10: Liveness Check
  console.log('\n💓 Test 10: Check Agent Liveness');
  const liveness = await sdk.isItAlive(agentAsset);
  console.log('✅ Liveness checked');
  console.log('   Is alive:', liveness.isAlive);
  console.log('   Last activity:', liveness.lastActivityTimestamp ? new Date(liveness.lastActivityTimestamp * 1000).toISOString() : 'N/A');

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ All on-chain tests passed!');
  console.log('='.repeat(60));
  console.log('\nTested features:');
  console.log('  ✅ registerAgent (with ATOM auto-init)');
  console.log('  ✅ loadAgent');
  console.log('  ✅ setMetadata');
  console.log('  ✅ setAgentWallet (with Ed25519 signature)');
  console.log('  ✅ sign (canonical JSON)');
  console.log('  ✅ verify (on-chain wallet lookup)');
  console.log('  ✅ giveFeedback');
  console.log('  ✅ getSummary (ATOM)');
  console.log('  ✅ isItAlive (liveness check)');
  console.log('\n🎉 SDK is fully functional on-chain!\n');
}

main().catch((error) => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
