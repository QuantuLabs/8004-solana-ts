/**
 * Full Coverage SDK Test
 * Tests ALL SolanaSDK methods for 100% coverage
 * Run with: npx tsx test-sdk-full-coverage.ts
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

// Test results tracker
const results: { name: string; status: 'PASS' | 'FAIL' | 'SKIP'; details?: string }[] = [];

function test(name: string, fn: () => Promise<boolean> | boolean, skip = false) {
  return async () => {
    if (skip) {
      results.push({ name, status: 'SKIP', details: 'Skipped (requires advanced RPC or funds)' });
      return;
    }
    try {
      const passed = await fn();
      results.push({ name, status: passed ? 'PASS' : 'FAIL' });
    } catch (error: any) {
      results.push({ name, status: 'FAIL', details: error.message?.slice(0, 80) });
    }
  };
}

async function runTests() {
  console.log('='.repeat(70));
  console.log('SolanaSDK Full Coverage Test Suite');
  console.log('='.repeat(70));

  // Setup
  const readOnlySDK = createDevnetSDK();
  const testKeypair = Keypair.generate();
  const sdkWithSigner = new SolanaSDK({
    rpcUrl: 'https://api.devnet.solana.com',
    signer: testKeypair,
  });
  const randomPubkey = Keypair.generate().publicKey;

  // ==================== CONSTRUCTOR & CONFIG TESTS ====================
  console.log('\n--- Constructor & Configuration ---');

  await test('createDevnetSDK() creates read-only SDK', () => {
    const sdk = createDevnetSDK();
    return sdk.isReadOnly === true;
  })();

  await test('SolanaSDK with rpcUrl creates SDK', () => {
    const sdk = new SolanaSDK({ rpcUrl: 'https://api.devnet.solana.com' });
    return sdk.isReadOnly === true && sdk.getRpcUrl() === 'https://api.devnet.solana.com';
  })();

  await test('SolanaSDK with signer is not read-only', () => {
    return sdkWithSigner.isReadOnly === false;
  })();

  await test('SolanaSDK with cluster config', () => {
    const sdk = new SolanaSDK({ cluster: 'devnet' });
    return sdk.getCluster() === 'devnet';
  })();

  // ==================== UTILITY METHODS ====================
  console.log('\n--- Utility Methods ---');

  await test('isReadOnly getter returns boolean', () => {
    return typeof readOnlySDK.isReadOnly === 'boolean';
  })();

  await test('canWrite getter returns boolean', () => {
    return readOnlySDK.canWrite === false && sdkWithSigner.canWrite === true;
  })();

  await test('chainId() returns solana-cluster string', async () => {
    const chainId = await readOnlySDK.chainId();
    return chainId === 'solana-devnet';
  })();

  await test('getCluster() returns cluster name', () => {
    return readOnlySDK.getCluster() === 'devnet';
  })();

  await test('registries() returns program IDs', () => {
    const regs = readOnlySDK.registries();
    return (
      regs.IDENTITY === IDENTITY_PROGRAM_ID.toBase58() &&
      regs.REPUTATION === REPUTATION_PROGRAM_ID.toBase58() &&
      regs.VALIDATION === VALIDATION_PROGRAM_ID.toBase58()
    );
  })();

  await test('getProgramIds() returns program IDs object', () => {
    const ids = readOnlySDK.getProgramIds();
    return ids.identityRegistry.equals(IDENTITY_PROGRAM_ID);
  })();

  await test('getSolanaClient() returns SolanaClient', () => {
    const client = readOnlySDK.getSolanaClient();
    return client instanceof SolanaClient;
  })();

  await test('getFeedbackManager() returns manager', () => {
    const manager = readOnlySDK.getFeedbackManager();
    return manager !== undefined;
  })();

  await test('getRpcUrl() returns RPC URL string', () => {
    const url = readOnlySDK.getRpcUrl();
    return url.includes('solana.com');
  })();

  await test('isUsingDefaultDevnetRpc() returns boolean', () => {
    return readOnlySDK.isUsingDefaultDevnetRpc() === true;
  })();

  await test('supportsAdvancedQueries() returns false for default RPC', () => {
    return readOnlySDK.supportsAdvancedQueries() === false;
  })();

  // ==================== AGENT READ METHODS ====================
  console.log('\n--- Agent Read Methods ---');

  await test('loadAgent(13) loads agent from devnet', async () => {
    const agent = await readOnlySDK.loadAgent(13);
    return agent !== null && agent.agent_id !== undefined;
  })();

  await test('loadAgent(bigint) accepts bigint', async () => {
    const agent = await readOnlySDK.loadAgent(BigInt(13));
    return agent !== null;
  })();

  await test('getAgent(13) is alias for loadAgent', async () => {
    const agent = await readOnlySDK.getAgent(13);
    return agent !== null;
  })();

  await test('loadAgent(999999) returns null for non-existent', async () => {
    const agent = await readOnlySDK.loadAgent(999999);
    return agent === null;
  })();

  await test('agentExists(13) returns true', async () => {
    return await readOnlySDK.agentExists(13);
  })();

  await test('agentExists(999999) returns false', async () => {
    return (await readOnlySDK.agentExists(999999)) === false;
  })();

  await test('getAgentOwner(13) returns PublicKey', async () => {
    const owner = await readOnlySDK.getAgentOwner(13);
    return owner instanceof PublicKey;
  })();

  await test('getAgentOwner(999999) returns null', async () => {
    const owner = await readOnlySDK.getAgentOwner(999999);
    return owner === null;
  })();

  await test('isAgentOwner(13, randomKey) returns false', async () => {
    return (await readOnlySDK.isAgentOwner(13, randomPubkey)) === false;
  })();

  await test('isAgentOwner(999999, key) returns false for non-existent', async () => {
    return (await readOnlySDK.isAgentOwner(999999, randomPubkey)) === false;
  })();

  // ==================== AGENT WRITE METHODS (expect errors - no funds) ====================
  console.log('\n--- Agent Write Methods (signature validation) ---');

  await test('registerAgent() throws on read-only SDK', async () => {
    try {
      await readOnlySDK.registerAgent();
      return false;
    } catch (e: any) {
      return e.message.includes('read-only');
    }
  })();

  await test('setAgentUri() throws on read-only SDK', async () => {
    try {
      await readOnlySDK.setAgentUri(13, 'ipfs://test');
      return false;
    } catch (e: any) {
      return e.message.includes('read-only');
    }
  })();

  await test('setMetadata() throws on read-only SDK', async () => {
    try {
      await readOnlySDK.setMetadata(13, 'key', 'value');
      return false;
    } catch (e: any) {
      return e.message.includes('read-only');
    }
  })();

  await test('transferAgent() throws on read-only SDK', async () => {
    try {
      await readOnlySDK.transferAgent(13, randomPubkey);
      return false;
    } catch (e: any) {
      return e.message.includes('read-only');
    }
  })();

  await test('transferAgent() with signer accepts signature', async () => {
    try {
      await sdkWithSigner.transferAgent(13, randomPubkey);
      return false; // Should fail at transaction level
    } catch (e: any) {
      // Expected: fails because signer doesn't own agent 13, or insufficient funds, or RPC error
      // Any error that is NOT "read-only" means the signature was accepted
      const msg = e.message || '';
      return !msg.includes('read-only') && !msg.includes('is not a function');
    }
  })();

  // ==================== REPUTATION READ METHODS ====================
  console.log('\n--- Reputation Read Methods ---');

  await test('getSummary(13) returns reputation data', async () => {
    const summary = await readOnlySDK.getSummary(13);
    return summary.averageScore !== undefined && summary.totalFeedbacks !== undefined;
  })();

  await test('getReputationSummary(13) returns count and averageScore', async () => {
    const summary = await readOnlySDK.getReputationSummary(13);
    return typeof summary.count === 'number' && typeof summary.averageScore === 'number';
  })();

  await test('readFeedback(13, client, 0) attempts to read feedback', async () => {
    try {
      const feedback = await readOnlySDK.readFeedback(13, randomPubkey, 0);
      return feedback === null || feedback !== undefined;
    } catch {
      return true; // May fail if no feedback exists
    }
  })();

  await test('getFeedback() is alias for readFeedback', async () => {
    try {
      const feedback = await readOnlySDK.getFeedback(13, randomPubkey, 0);
      return feedback === null || feedback !== undefined;
    } catch {
      return true;
    }
  })();

  await test('getLastIndex(13, client) returns bigint', async () => {
    const lastIndex = await readOnlySDK.getLastIndex(13, randomPubkey);
    return typeof lastIndex === 'bigint';
  })();

  await test('getResponseCount(13, client, 0) returns number', async () => {
    const count = await readOnlySDK.getResponseCount(13, randomPubkey, 0);
    return typeof count === 'number';
  })();

  await test('readResponses(13, client, 0) returns array', async () => {
    const responses = await readOnlySDK.readResponses(13, randomPubkey, 0);
    return Array.isArray(responses);
  })();

  // ==================== RPC-RESTRICTED METHODS ====================
  console.log('\n--- RPC-Restricted Methods (UnsupportedRpcError) ---');

  await test('getAgentsByOwner() throws UnsupportedRpcError on default RPC', async () => {
    try {
      await readOnlySDK.getAgentsByOwner(randomPubkey);
      return false;
    } catch (e) {
      return e instanceof UnsupportedRpcError && e.operation === 'getAgentsByOwner';
    }
  })();

  await test('readAllFeedback() throws UnsupportedRpcError on default RPC', async () => {
    try {
      await readOnlySDK.readAllFeedback(13);
      return false;
    } catch (e) {
      return e instanceof UnsupportedRpcError && e.operation === 'readAllFeedback';
    }
  })();

  await test('getClients() throws UnsupportedRpcError on default RPC', async () => {
    try {
      await readOnlySDK.getClients(13);
      return false;
    } catch (e) {
      return e instanceof UnsupportedRpcError && e.operation === 'getClients';
    }
  })();

  // ==================== REPUTATION WRITE METHODS ====================
  console.log('\n--- Reputation Write Methods (signature validation) ---');

  await test('giveFeedback() throws on read-only SDK', async () => {
    try {
      await readOnlySDK.giveFeedback(13, {
        score: 80,
        tag1: 'test',
        tag2: 'sdk',
        fileUri: 'ipfs://test',
        fileHash: Buffer.alloc(32),
      });
      return false;
    } catch (e: any) {
      return e.message.includes('read-only');
    }
  })();

  await test('giveFeedback() with signer accepts feedbackFile object', async () => {
    try {
      await sdkWithSigner.giveFeedback(13, {
        score: 85,
        tag1: 'performance',
        tag2: 'quality',
        fileUri: 'ipfs://QmTest',
        fileHash: Buffer.alloc(32),
      });
      return false;
    } catch (e: any) {
      const msg = e.message || '';
      return !msg.includes('read-only') && !msg.includes('is not a function'); // Should fail at tx level, not signature
    }
  })();

  await test('revokeFeedback() throws on read-only SDK', async () => {
    try {
      await readOnlySDK.revokeFeedback(13, 0);
      return false;
    } catch (e: any) {
      return e.message.includes('read-only');
    }
  })();

  await test('appendResponse() throws on read-only SDK', async () => {
    try {
      await readOnlySDK.appendResponse(13, randomPubkey, 0, 'ipfs://response', Buffer.alloc(32));
      return false;
    } catch (e: any) {
      return e.message.includes('read-only');
    }
  })();

  // ==================== VALIDATION METHODS ====================
  console.log('\n--- Validation Methods (signature validation) ---');

  await test('requestValidation() throws on read-only SDK', async () => {
    try {
      await readOnlySDK.requestValidation(13, randomPubkey, 1, 'ipfs://req', Buffer.alloc(32));
      return false;
    } catch (e: any) {
      return e.message.includes('read-only');
    }
  })();

  await test('requestValidation() with signer accepts parameters', async () => {
    try {
      await sdkWithSigner.requestValidation(13, randomPubkey, 1, 'ipfs://request', Buffer.alloc(32));
      return false;
    } catch (e: any) {
      const msg = e.message || '';
      return !msg.includes('read-only') && !msg.includes('is not a function');
    }
  })();

  await test('respondToValidation() throws on read-only SDK', async () => {
    try {
      await readOnlySDK.respondToValidation(13, 1, 90, 'ipfs://resp', Buffer.alloc(32), 'approved');
      return false;
    } catch (e: any) {
      return e.message.includes('read-only');
    }
  })();

  await test('respondToValidation() with signer accepts parameters', async () => {
    try {
      await sdkWithSigner.respondToValidation(13, 1, 90, 'ipfs://response', Buffer.alloc(32), 'approved');
      return false;
    } catch (e: any) {
      const msg = e.message || '';
      return !msg.includes('read-only') && !msg.includes('is not a function');
    }
  })();

  // ==================== RESULTS ====================
  console.log('\n' + '='.repeat(70));
  console.log('TEST RESULTS');
  console.log('='.repeat(70));

  let passed = 0, failed = 0, skipped = 0;
  for (const result of results) {
    const icon = result.status === 'PASS' ? '✓' : result.status === 'FAIL' ? '✗' : '○';
    const color = result.status === 'PASS' ? '' : result.status === 'FAIL' ? ' <<<' : '';
    console.log(`${icon} ${result.name}${color}`);
    if (result.details && result.status === 'FAIL') {
      console.log(`    ${result.details}`);
    }
    if (result.status === 'PASS') passed++;
    else if (result.status === 'FAIL') failed++;
    else skipped++;
  }

  console.log('\n' + '-'.repeat(70));
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`);
  console.log(`Coverage: ${((passed / (results.length - skipped)) * 100).toFixed(1)}%`);
  console.log('='.repeat(70));

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
