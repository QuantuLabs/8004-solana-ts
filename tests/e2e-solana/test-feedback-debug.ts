import { Keypair } from '@solana/web3.js';
import { SolanaSDK } from '../../src/core/sdk-solana.js';
import { createHash } from 'crypto';
import * as fs from 'fs';

function sha256(data: string): Buffer {
  return createHash('sha256').update(data).digest();
}

async function testFeedback() {
  const rpcUrl = 'https://api.devnet.solana.com';
  const walletPath = process.env.HOME + '/.config/solana/id.json';
  const mainWallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
  );

  const sdk = new SolanaSDK({
    rpcUrl,
    signer: mainWallet,
  });

  // Create a test agent
  console.log('Creating test agent...');
  const result = await sdk.registerAgent('ipfs://test_feedback_debug_2');
  if (!result.success || !result.asset) {
    throw new Error('Failed to create agent');
  }
  console.log('Agent created:', result.asset.toBase58());

  // Initialize ATOM
  try {
    await sdk.initializeAtomStats(result.asset);
    console.log('ATOM initialized');
  } catch (e) {
    console.log('ATOM already initialized');
  }

  // Try to give feedback
  console.log('\nTesting feedback...');
  const feedbackUri = 'ipfs://test_feedback_uri_12345';
  const feedbackHash = sha256(feedbackUri);
  
  try {
    const feedbackResult = await sdk.giveFeedback(result.asset, {
      value: '99.5',  // Test string encoding
      score: 85,
      tag1: 'uptime',
      tag2: 'day',
      feedbackUri,
      feedbackHash,
    }, {
      feedbackIndex: BigInt(1000),  // Manual index
    });
    
    console.log('Feedback result:', JSON.stringify(feedbackResult, (k, v) => 
      typeof v === 'bigint' ? v.toString() : v, 2));
  } catch (error: any) {
    console.error('Feedback error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack.slice(0, 500));
    }
  }
}

testFeedback().catch(console.error);
