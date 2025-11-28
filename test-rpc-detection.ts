/**
 * Test script for RPC detection feature
 * Run with: npx tsx test-rpc-detection.ts
 */

import {
  SolanaClient,
  UnsupportedRpcError,
  SOLANA_DEVNET_RPC,
  RECOMMENDED_RPC_PROVIDERS,
  createDevnetClient,
} from './src/index.js';

console.log('='.repeat(60));
console.log('RPC Detection Feature Test');
console.log('='.repeat(60));

// Test 1: Default devnet client
console.log('\n1. Testing default devnet client:');
const defaultClient = createDevnetClient();
console.log(`   RPC URL: ${defaultClient.rpcUrl}`);
console.log(`   Is default devnet RPC: ${defaultClient.isDefaultDevnetRpc}`);
console.log(`   Supports advanced queries: ${defaultClient.supportsAdvancedQueries()}`);

// Test 2: Custom RPC client
console.log('\n2. Testing custom RPC client:');
const customClient = new SolanaClient({
  rpcUrl: 'https://my-custom-rpc.example.com',
});
console.log(`   RPC URL: ${customClient.rpcUrl}`);
console.log(`   Is default devnet RPC: ${customClient.isDefaultDevnetRpc}`);
console.log(`   Supports advanced queries: ${customClient.supportsAdvancedQueries()}`);

// Test 3: Explicit devnet RPC (should be detected as default)
console.log('\n3. Testing explicit devnet RPC URL:');
const explicitDevnetClient = new SolanaClient({
  rpcUrl: SOLANA_DEVNET_RPC,
});
console.log(`   RPC URL: ${explicitDevnetClient.rpcUrl}`);
console.log(`   Is default devnet RPC: ${explicitDevnetClient.isDefaultDevnetRpc}`);

// Test 4: UnsupportedRpcError
console.log('\n4. Testing UnsupportedRpcError:');
try {
  defaultClient.requireAdvancedQueries('getAgentsByOwner');
  console.log('   ERROR: Should have thrown UnsupportedRpcError!');
} catch (error) {
  if (error instanceof UnsupportedRpcError) {
    console.log('   ✓ UnsupportedRpcError thrown correctly');
    console.log('   Error message preview:');
    const lines = error.message.split('\n').slice(0, 5);
    lines.forEach(line => console.log(`     ${line}`));
  } else {
    console.log(`   ERROR: Wrong error type: ${error}`);
  }
}

// Test 5: Custom RPC should NOT throw
console.log('\n5. Testing custom RPC (should NOT throw):');
try {
  customClient.requireAdvancedQueries('getAgentsByOwner');
  console.log('   ✓ No error thrown for custom RPC');
} catch (error) {
  console.log(`   ERROR: Should not throw for custom RPC: ${error}`);
}

// Test 6: Show recommended providers
console.log('\n6. Recommended RPC providers:');
RECOMMENDED_RPC_PROVIDERS.forEach(provider => {
  console.log(`   - ${provider}`);
});

console.log('\n' + '='.repeat(60));
console.log('All tests completed!');
console.log('='.repeat(60));
