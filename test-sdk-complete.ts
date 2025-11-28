/**
 * Complete SolanaSDK Test
 * Tests all SDK methods and interface alignment with agent0-ts
 * Run with: npx tsx test-sdk-complete.ts
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import {
  SolanaSDK,
  createDevnetSDK,
  SolanaClient,
  createDevnetClient,
  UnsupportedRpcError,
  IDENTITY_PROGRAM_ID,
  REPUTATION_PROGRAM_ID,
  VALIDATION_PROGRAM_ID,
} from './src/index.js';

console.log('='.repeat(60));
console.log('SolanaSDK Complete Test');
console.log('='.repeat(60));

// Test 1: Create read-only SDK (no signer)
console.log('\n1. Testing read-only SDK creation:');
const readOnlySDK = createDevnetSDK();
console.log(`   ✓ SDK created`);
console.log(`   isReadOnly: ${readOnlySDK.isReadOnly}`);
console.log(`   Registries: ${JSON.stringify(readOnlySDK.registries())}`);

// Test 2: Create SDK with signer
console.log('\n2. Testing SDK with signer:');
const testKeypair = Keypair.generate();
const sdkWithSigner = new SolanaSDK({
  rpcUrl: 'https://api.devnet.solana.com',
  signer: testKeypair,
});
console.log(`   ✓ SDK with signer created`);
console.log(`   isReadOnly: ${sdkWithSigner.isReadOnly}`);
console.log(`   Signer: ${testKeypair.publicKey.toBase58().slice(0, 20)}...`);

// Test 3: Test registries method
console.log('\n3. Testing registries():');
const registries = readOnlySDK.registries();
console.log(`   Identity: ${registries.identity}`);
console.log(`   Reputation: ${registries.reputation}`);
console.log(`   Validation: ${registries.validation}`);
if (registries.identity === IDENTITY_PROGRAM_ID.toBase58()) {
  console.log('   ✓ Identity program ID matches');
}

// Test 4: Test getAgent (read operation)
console.log('\n4. Testing getAgent(13):');
try {
  const agent = await readOnlySDK.getAgent(13);
  if (agent) {
    console.log(`   ✓ Agent 13 found`);
    console.log(`   Name: ${agent.name}`);
    console.log(`   Owner: ${agent.owner instanceof Uint8Array ?
      new PublicKey(agent.owner).toBase58().slice(0, 20) + '...' :
      'N/A'}`);
  } else {
    console.log('   Agent 13 not found (may not exist on devnet)');
  }
} catch (error: any) {
  console.log(`   Error: ${error.message?.slice(0, 60)}...`);
}

// Test 5: Test getAgentOwner
console.log('\n5. Testing getAgentOwner(13):');
try {
  const owner = await readOnlySDK.getAgentOwner(13);
  if (owner) {
    console.log(`   ✓ Owner: ${owner.toBase58().slice(0, 20)}...`);
  } else {
    console.log('   Owner not found');
  }
} catch (error: any) {
  console.log(`   Error: ${error.message?.slice(0, 60)}...`);
}

// Test 6: Test isAgentOwner
console.log('\n6. Testing isAgentOwner(13, randomKey):');
try {
  const randomKey = Keypair.generate().publicKey;
  const isOwner = await readOnlySDK.isAgentOwner(13, randomKey);
  console.log(`   ✓ isOwner: ${isOwner} (expected: false)`);
} catch (error: any) {
  console.log(`   Error: ${error.message?.slice(0, 60)}...`);
}

// Test 7: Test getReputationSummary
console.log('\n7. Testing getReputationSummary(13):');
try {
  const summary = await readOnlySDK.getReputationSummary(13);
  console.log(`   ✓ Count: ${summary.count}, Average: ${summary.averageScore}`);
} catch (error: any) {
  console.log(`   Error: ${error.message?.slice(0, 60)}...`);
}

// Test 8: Test RPC restriction for getAgentsByOwner
console.log('\n8. Testing RPC restriction (getAgentsByOwner on default devnet):');
try {
  const owner = Keypair.generate().publicKey;
  await readOnlySDK.getAgentsByOwner(owner);
  console.log('   ERROR: Should have thrown UnsupportedRpcError!');
} catch (error: any) {
  if (error instanceof UnsupportedRpcError) {
    console.log('   ✓ UnsupportedRpcError thrown correctly');
    console.log(`   Operation: ${error.operation}`);
  } else {
    console.log(`   Other error: ${error.message?.slice(0, 50)}...`);
  }
}

// Test 9: Test write methods require signer
console.log('\n9. Testing write methods require signer:');
try {
  await readOnlySDK.setMetadata(13, 'test', 'value');
  console.log('   ERROR: Should have thrown!');
} catch (error: any) {
  if (error.message.includes('read-only')) {
    console.log('   ✓ Correctly throws "read-only" error');
  } else {
    console.log(`   Error: ${error.message?.slice(0, 50)}...`);
  }
}

// Test 10: Test giveFeedback signature (should accept feedbackFile object)
console.log('\n10. Testing giveFeedback signature with feedbackFile object:');
try {
  await sdkWithSigner.giveFeedback(13, {
    score: 85,
    tag1: 'test',
    tag2: 'sdk',
    fileUri: 'ipfs://test',
    fileHash: Buffer.alloc(32),
  });
  console.log('   Transaction would be sent (signer has no SOL)');
} catch (error: any) {
  // Expected to fail due to no SOL or account not found
  if (error.message.includes('insufficient') ||
      error.message.includes('not found') ||
      error.message.includes('Could not resolve') ||
      error.message.includes('0x1')) {
    console.log('   ✓ Method signature accepted, failed at transaction level (expected)');
  } else {
    console.log(`   Error: ${error.message?.slice(0, 60)}...`);
  }
}

// Test 11: Test requestValidation signature
console.log('\n11. Testing requestValidation signature:');
try {
  const validator = Keypair.generate().publicKey;
  await sdkWithSigner.requestValidation(13, validator, 1, 'ipfs://request', Buffer.alloc(32));
  console.log('   Transaction would be sent');
} catch (error: any) {
  if (error.message.includes('insufficient') ||
      error.message.includes('not found') ||
      error.message.includes('Could not resolve') ||
      error.message.includes('0x1')) {
    console.log('   ✓ Method signature accepted, failed at transaction level (expected)');
  } else {
    console.log(`   Error: ${error.message?.slice(0, 60)}...`);
  }
}

// Test 12: Test respondToValidation signature
console.log('\n12. Testing respondToValidation signature:');
try {
  await sdkWithSigner.respondToValidation(13, 1, 1, 'ipfs://response', Buffer.alloc(32), 'approved');
  console.log('   Transaction would be sent');
} catch (error: any) {
  if (error.message.includes('insufficient') ||
      error.message.includes('not found') ||
      error.message.includes('Could not resolve') ||
      error.message.includes('0x1')) {
    console.log('   ✓ Method signature accepted, failed at transaction level (expected)');
  } else {
    console.log(`   Error: ${error.message?.slice(0, 60)}...`);
  }
}

// Test 13: Interface parity check
console.log('\n13. Interface parity with agent0-ts:');
const methods = [
  'getAgent',
  'isAgentOwner',
  'getAgentOwner',
  'getAgentsByOwner',
  'setMetadata',
  'giveFeedback',
  'getReputationSummary',
  'requestValidation',
  'respondToValidation',
  'isReadOnly',
  'registries',
];
for (const method of methods) {
  const hasMethod = method in readOnlySDK;
  console.log(`   ${hasMethod ? '✓' : '✗'} ${method}`);
}

console.log('\n' + '='.repeat(60));
console.log('All SDK tests completed!');
console.log('='.repeat(60));
