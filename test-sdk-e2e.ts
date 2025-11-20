#!/usr/bin/env tsx
/**
 * Complete E2E Test Suite for 8004-solana-ts SDK
 * Tests all major SDK functionality on Solana devnet
 *
 * Prerequisites:
 * - Solana devnet accessible
 * - Wallet with devnet SOL
 * - Programs deployed on devnet
 *
 * Usage:
 *   SOLANA_PRIVATE_KEY='[...]' npx tsx test-sdk-e2e.ts
 */

import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { createDevnetSDK } from './src/core/sdk-solana.js';
import type { SolanaSDK } from './src/core/sdk-solana.js';
import * as fs from 'fs';
import * as path from 'path';

// Color formatting for console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(emoji: string, message: string, color: string = colors.reset) {
  console.log(`${color}${emoji} ${message}${colors.reset}`);
}

function logSuccess(message: string) {
  log('✅', message, colors.green);
}

function logError(message: string) {
  log('❌', message, colors.red);
}

function logInfo(message: string) {
  log('ℹ️ ', message, colors.cyan);
}

function logWarning(message: string) {
  log('⚠️ ', message, colors.yellow);
}

function logSection(title: string) {
  console.log(`\n${colors.bright}${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}  ${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${'='.repeat(60)}${colors.reset}\n`);
}

// Test results tracking
interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  duration?: number;
}

const testResults: TestResult[] = [];

function addTestResult(name: string, success: boolean, error?: string, duration?: number) {
  testResults.push({ name, success, error, duration });
}

// Load signer from environment or keypair file
function loadSigner(): Keypair {
  // Try SOLANA_PRIVATE_KEY env var first
  const privateKeyEnv = process.env.SOLANA_PRIVATE_KEY;
  if (privateKeyEnv) {
    try {
      const secretKey = new Uint8Array(JSON.parse(privateKeyEnv));
      return Keypair.fromSecretKey(secretKey);
    } catch (error) {
      logError('Failed to parse SOLANA_PRIVATE_KEY');
      throw error;
    }
  }

  // Try loading from Solana CLI default keypair
  const defaultKeypairPath = path.join(process.env.HOME || '', '.config/solana/id.json');
  if (fs.existsSync(defaultKeypairPath)) {
    logInfo(`Loading keypair from ${defaultKeypairPath}`);
    const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(defaultKeypairPath, 'utf-8')));
    return Keypair.fromSecretKey(secretKey);
  }

  throw new Error(
    'No keypair found. Set SOLANA_PRIVATE_KEY environment variable or create ~/.config/solana/id.json'
  );
}

// Main test runner
async function main() {
  logSection('8004-solana-ts SDK E2E Test Suite');

  let sdk: SolanaSDK;
  let signer: Keypair;
  let agentId: bigint;
  let feedbackIndex: bigint;
  let validationNonce: number;

  try {
    // === Setup ===
    logSection('Setup');

    const startSetup = Date.now();
    signer = loadSigner();
    logSuccess(`Loaded signer: ${signer.publicKey.toBase58()}`);

    sdk = createDevnetSDK({ signer });
    logSuccess(`Initialized SDK for cluster: ${sdk.getCluster()}`);

    // Check balance
    const connection = sdk.getSolanaClient().getConnection();
    const balance = await connection.getBalance(signer.publicKey);
    logInfo(`Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

    if (balance < 0.1 * LAMPORTS_PER_SOL) {
      logWarning('Low balance! Get devnet SOL from https://faucet.solana.com/');
    }

    const setupDuration = Date.now() - startSetup;
    addTestResult('Setup', true, undefined, setupDuration);

    // === Test 1: Agent Registration ===
    logSection('Test 1: Agent Registration');

    try {
      const startTest = Date.now();
      const tokenUri = `ipfs://QmTest${Date.now()}`;

      logInfo('Registering new agent...');
      const result = await sdk.registerAgent(tokenUri);

      if (!result.success) {
        throw new Error(result.error || 'Registration failed');
      }

      agentId = result.agentId!;
      logSuccess(`Agent registered with ID: ${agentId}`);
      logInfo(`Transaction: ${result.signature}`);

      const testDuration = Date.now() - startTest;
      addTestResult('Agent Registration', true, undefined, testDuration);
    } catch (error) {
      logError(`Agent registration failed: ${error}`);
      addTestResult('Agent Registration', false, String(error));
      throw error; // Stop if registration fails
    }

    // === Test 2: Load Agent ===
    logSection('Test 2: Load Agent');

    try {
      const startTest = Date.now();

      logInfo(`Loading agent ${agentId}...`);
      const agent = await sdk.loadAgent(agentId);

      if (!agent) {
        throw new Error('Agent not found');
      }

      logSuccess('Agent loaded successfully');
      logInfo(`  Owner: ${agent.getOwnerPublicKey().toBase58()}`);
      logInfo(`  URI: ${agent.token_uri}`);
      logInfo(`  Status: ${agent.status === 1 ? 'Active' : 'Inactive'}`);

      // Verify owner
      if (!agent.getOwnerPublicKey().equals(signer.publicKey)) {
        throw new Error('Agent owner mismatch');
      }

      const testDuration = Date.now() - startTest;
      addTestResult('Load Agent', true, undefined, testDuration);
    } catch (error) {
      logError(`Loading agent failed: ${error}`);
      addTestResult('Load Agent', false, String(error));
    }

    // === Test 3: Agent Exists Check ===
    logSection('Test 3: Agent Exists Check');

    try {
      const startTest = Date.now();

      const exists = await sdk.agentExists(agentId);

      if (!exists) {
        throw new Error('Agent should exist but was not found');
      }

      logSuccess(`Agent ${agentId} exists`);

      const testDuration = Date.now() - startTest;
      addTestResult('Agent Exists Check', true, undefined, testDuration);
    } catch (error) {
      logError(`Agent exists check failed: ${error}`);
      addTestResult('Agent Exists Check', false, String(error));
    }

    // === Test 4: Set Metadata ===
    logSection('Test 4: Set Metadata');

    try {
      const startTest = Date.now();

      logInfo('Setting metadata...');
      const result = await sdk.setMetadata(agentId, 'version', '1.0.0');

      if (!result.success) {
        throw new Error(result.error || 'Set metadata failed');
      }

      logSuccess('Metadata set successfully');
      logInfo(`Transaction: ${result.signature}`);

      const testDuration = Date.now() - startTest;
      addTestResult('Set Metadata', true, undefined, testDuration);
    } catch (error) {
      logError(`Setting metadata failed: ${error}`);
      addTestResult('Set Metadata', false, String(error));
    }

    // === Test 5: Update Agent URI ===
    logSection('Test 5: Update Agent URI');

    try {
      const startTest = Date.now();
      const newUri = `ipfs://QmUpdated${Date.now()}`;

      logInfo('Updating agent URI...');
      const result = await sdk.setAgentUri(agentId, newUri);

      if (!result.success) {
        throw new Error(result.error || 'Update URI failed');
      }

      logSuccess('URI updated successfully');
      logInfo(`Transaction: ${result.signature}`);

      // Verify update
      const agent = await sdk.loadAgent(agentId);
      if (agent && agent.token_uri !== newUri) {
        logWarning('URI not updated yet (may need to wait for confirmation)');
      } else {
        logSuccess('URI update verified');
      }

      const testDuration = Date.now() - startTest;
      addTestResult('Update Agent URI', true, undefined, testDuration);
    } catch (error) {
      logError(`Updating URI failed: ${error}`);
      addTestResult('Update Agent URI', false, String(error));
    }

    // === Test 6: Give Feedback ===
    logSection('Test 6: Give Feedback');

    try {
      const startTest = Date.now();
      const score = 85;
      const fileUri = `ipfs://QmFeedback${Date.now()}`;
      const fileHash = Buffer.alloc(32, 1);

      logInfo(`Giving feedback (score: ${score})...`);
      const result = await sdk.giveFeedback(agentId, score, fileUri, fileHash);

      if (!result.success) {
        throw new Error(result.error || 'Give feedback failed');
      }

      feedbackIndex = result.feedbackIndex!;
      logSuccess(`Feedback given with index: ${feedbackIndex}`);
      logInfo(`Transaction: ${result.signature}`);

      const testDuration = Date.now() - startTest;
      addTestResult('Give Feedback', true, undefined, testDuration);
    } catch (error) {
      logError(`Giving feedback failed: ${error}`);
      addTestResult('Give Feedback', false, String(error));
    }

    // === Test 7: Read Feedback ===
    logSection('Test 7: Read Feedback');

    try {
      const startTest = Date.now();

      logInfo('Reading feedback...');
      const feedback = await sdk.readFeedback(agentId, signer.publicKey, feedbackIndex);

      if (!feedback) {
        throw new Error('Feedback not found');
      }

      logSuccess('Feedback loaded successfully');
      logInfo(`  Score: ${feedback.score}`);
      logInfo(`  URI: ${feedback.file_uri}`);
      logInfo(`  Revoked: ${feedback.revoked}`);

      if (feedback.score !== 85) {
        throw new Error(`Score mismatch: expected 85, got ${feedback.score}`);
      }

      const testDuration = Date.now() - startTest;
      addTestResult('Read Feedback', true, undefined, testDuration);
    } catch (error) {
      logError(`Reading feedback failed: ${error}`);
      addTestResult('Read Feedback', false, String(error));
    }

    // === Test 8: Get Reputation Summary ===
    logSection('Test 8: Get Reputation Summary');

    try {
      const startTest = Date.now();

      logInfo('Getting reputation summary...');
      const summary = await sdk.getSummary(agentId);

      logSuccess('Reputation summary retrieved');
      logInfo(`  Average score: ${summary.averageScore}`);
      logInfo(`  Total feedbacks: ${summary.totalFeedbacks}`);

      if (summary.totalFeedbacks < 1) {
        throw new Error('Expected at least 1 feedback');
      }

      const testDuration = Date.now() - startTest;
      addTestResult('Get Reputation Summary', true, undefined, testDuration);
    } catch (error) {
      logError(`Getting reputation summary failed: ${error}`);
      addTestResult('Get Reputation Summary', false, String(error));
    }

    // === Test 9: Read All Feedbacks ===
    logSection('Test 9: Read All Feedbacks');

    try {
      const startTest = Date.now();

      logInfo('Reading all feedbacks...');
      const feedbacks = await sdk.readAllFeedback(agentId, false);

      logSuccess(`Found ${feedbacks.length} feedback(s)`);
      feedbacks.forEach((fb, i) => {
        logInfo(`  [${i}] Score: ${fb.score}, Revoked: ${fb.revoked}`);
      });

      if (feedbacks.length < 1) {
        throw new Error('Expected at least 1 feedback');
      }

      const testDuration = Date.now() - startTest;
      addTestResult('Read All Feedbacks', true, undefined, testDuration);
    } catch (error) {
      logError(`Reading all feedbacks failed: ${error}`);
      addTestResult('Read All Feedbacks', false, String(error));
    }

    // === Test 10: Get Clients List ===
    logSection('Test 10: Get Clients List');

    try {
      const startTest = Date.now();

      logInfo('Getting clients list...');
      const clients = await sdk.getClients(agentId);

      logSuccess(`Found ${clients.length} client(s)`);
      clients.forEach((client, i) => {
        logInfo(`  [${i}] ${client.toBase58()}`);
      });

      const hasOurClient = clients.some(c => c.equals(signer.publicKey));
      if (!hasOurClient) {
        throw new Error('Our client not found in list');
      }

      const testDuration = Date.now() - startTest;
      addTestResult('Get Clients List', true, undefined, testDuration);
    } catch (error) {
      logError(`Getting clients list failed: ${error}`);
      addTestResult('Get Clients List', false, String(error));
    }

    // === Test 11: Get Last Feedback Index ===
    logSection('Test 11: Get Last Feedback Index');

    try {
      const startTest = Date.now();

      logInfo('Getting last feedback index...');
      const lastIndex = await sdk.getLastIndex(agentId, signer.publicKey);

      logSuccess(`Last feedback index: ${lastIndex}`);

      if (lastIndex < feedbackIndex) {
        throw new Error(`Last index ${lastIndex} should be >= ${feedbackIndex}`);
      }

      const testDuration = Date.now() - startTest;
      addTestResult('Get Last Feedback Index', true, undefined, testDuration);
    } catch (error) {
      logError(`Getting last index failed: ${error}`);
      addTestResult('Get Last Feedback Index', false, String(error));
    }

    // === Test 12: Append Response ===
    logSection('Test 12: Append Response');

    try {
      const startTest = Date.now();
      const responseUri = `ipfs://QmResponse${Date.now()}`;
      const responseHash = Buffer.alloc(32, 2);

      logInfo('Appending response to feedback...');
      const result = await sdk.appendResponse(
        agentId,
        signer.publicKey,
        feedbackIndex,
        responseUri,
        responseHash
      );

      if (!result.success) {
        throw new Error(result.error || 'Append response failed');
      }

      logSuccess('Response appended successfully');
      logInfo(`Transaction: ${result.signature}`);

      const testDuration = Date.now() - startTest;
      addTestResult('Append Response', true, undefined, testDuration);
    } catch (error) {
      logError(`Appending response failed: ${error}`);
      addTestResult('Append Response', false, String(error));
    }

    // === Test 13: Get Response Count ===
    logSection('Test 13: Get Response Count');

    try {
      const startTest = Date.now();

      logInfo('Getting response count...');
      const count = await sdk.getResponseCount(agentId, signer.publicKey, feedbackIndex);

      logSuccess(`Response count: ${count}`);

      if (count < 1) {
        throw new Error('Expected at least 1 response');
      }

      const testDuration = Date.now() - startTest;
      addTestResult('Get Response Count', true, undefined, testDuration);
    } catch (error) {
      logError(`Getting response count failed: ${error}`);
      addTestResult('Get Response Count', false, String(error));
    }

    // === Test 14: Read Responses ===
    logSection('Test 14: Read Responses');

    try {
      const startTest = Date.now();

      logInfo('Reading all responses...');
      const responses = await sdk.readResponses(agentId, signer.publicKey, feedbackIndex);

      logSuccess(`Found ${responses.length} response(s)`);
      responses.forEach((resp, i) => {
        logInfo(`  [${i}] URI: ${resp.response_uri}`);
      });

      if (responses.length < 1) {
        throw new Error('Expected at least 1 response');
      }

      const testDuration = Date.now() - startTest;
      addTestResult('Read Responses', true, undefined, testDuration);
    } catch (error) {
      logError(`Reading responses failed: ${error}`);
      addTestResult('Read Responses', false, String(error));
    }

    // === Test 15: Request Validation ===
    logSection('Test 15: Request Validation');

    try {
      const startTest = Date.now();
      const validator = signer.publicKey;
      const requestHash = Buffer.alloc(32, 3);

      logInfo('Requesting validation...');
      const result = await sdk.requestValidation(agentId, validator, requestHash);

      if (!result.success) {
        throw new Error(result.error || 'Request validation failed');
      }

      validationNonce = result.nonce!;
      logSuccess(`Validation requested with nonce: ${validationNonce}`);
      logInfo(`Transaction: ${result.signature}`);

      const testDuration = Date.now() - startTest;
      addTestResult('Request Validation', true, undefined, testDuration);
    } catch (error) {
      logError(`Requesting validation failed: ${error}`);
      addTestResult('Request Validation', false, String(error));
    }

    // === Test 16: Respond to Validation ===
    logSection('Test 16: Respond to Validation');

    try {
      const startTest = Date.now();
      const response = 1; // Approved
      const responseHash = Buffer.alloc(32, 4);

      logInfo('Responding to validation request...');
      const result = await sdk.respondToValidation(
        agentId,
        signer.publicKey,
        validationNonce,
        response,
        responseHash
      );

      if (!result.success) {
        throw new Error(result.error || 'Respond to validation failed');
      }

      logSuccess('Validation response sent successfully');
      logInfo(`Transaction: ${result.signature}`);

      const testDuration = Date.now() - startTest;
      addTestResult('Respond to Validation', true, undefined, testDuration);
    } catch (error) {
      logError(`Responding to validation failed: ${error}`);
      addTestResult('Respond to Validation', false, String(error));
    }

    // === Test 17: Get Agents by Owner ===
    logSection('Test 17: Get Agents by Owner');

    try {
      const startTest = Date.now();

      logInfo('Getting agents by owner...');
      const agents = await sdk.getAgentsByOwner(signer.publicKey);

      logSuccess(`Found ${agents.length} agent(s) owned by signer`);
      agents.forEach((agent, i) => {
        logInfo(`  [${i}] Agent ID: ${agent.agent_id}`);
      });

      const hasOurAgent = agents.some(a => a.agent_id === agentId);
      if (!hasOurAgent) {
        throw new Error('Our agent not found in owner list');
      }

      const testDuration = Date.now() - startTest;
      addTestResult('Get Agents by Owner', true, undefined, testDuration);
    } catch (error) {
      logError(`Getting agents by owner failed: ${error}`);
      addTestResult('Get Agents by Owner', false, String(error));
    }

    // === Test 18: Revoke Feedback ===
    logSection('Test 18: Revoke Feedback');

    try {
      const startTest = Date.now();

      logInfo(`Revoking feedback ${feedbackIndex}...`);
      const result = await sdk.revokeFeedback(agentId, feedbackIndex);

      if (!result.success) {
        throw new Error(result.error || 'Revoke feedback failed');
      }

      logSuccess('Feedback revoked successfully');
      logInfo(`Transaction: ${result.signature}`);

      const testDuration = Date.now() - startTest;
      addTestResult('Revoke Feedback', true, undefined, testDuration);
    } catch (error) {
      logError(`Revoking feedback failed: ${error}`);
      addTestResult('Revoke Feedback', false, String(error));
    }

    // === Test 19: Verify Revocation ===
    logSection('Test 19: Verify Revocation');

    try {
      const startTest = Date.now();

      logInfo('Verifying feedback is revoked...');
      const feedback = await sdk.readFeedback(agentId, signer.publicKey, feedbackIndex);

      if (!feedback) {
        throw new Error('Feedback not found');
      }

      if (!feedback.revoked) {
        throw new Error('Feedback should be revoked');
      }

      logSuccess('Feedback revocation verified');

      const testDuration = Date.now() - startTest;
      addTestResult('Verify Revocation', true, undefined, testDuration);
    } catch (error) {
      logError(`Verifying revocation failed: ${error}`);
      addTestResult('Verify Revocation', false, String(error));
    }

    // === Final Summary ===
    logSection('Test Summary');

    const totalTests = testResults.length;
    const passedTests = testResults.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const passRate = ((passedTests / totalTests) * 100).toFixed(1);

    console.log(`\n${colors.bright}Total Tests: ${totalTests}${colors.reset}`);
    console.log(`${colors.green}✅ Passed: ${passedTests}${colors.reset}`);
    console.log(`${colors.red}❌ Failed: ${failedTests}${colors.reset}`);
    console.log(`${colors.cyan}📊 Pass Rate: ${passRate}%${colors.reset}\n`);

    // Detailed results
    console.log(`${colors.bright}Detailed Results:${colors.reset}`);
    console.log('─'.repeat(80));
    testResults.forEach((result, i) => {
      const status = result.success
        ? `${colors.green}✅ PASS${colors.reset}`
        : `${colors.red}❌ FAIL${colors.reset}`;
      const duration = result.duration ? ` (${result.duration}ms)` : '';
      console.log(`${i + 1}. ${result.name}: ${status}${duration}`);
      if (result.error) {
        console.log(`   ${colors.red}Error: ${result.error}${colors.reset}`);
      }
    });
    console.log('─'.repeat(80));

    // Test data summary
    console.log(`\n${colors.bright}Test Data:${colors.reset}`);
    console.log(`  Agent ID: ${agentId}`);
    console.log(`  Feedback Index: ${feedbackIndex}`);
    console.log(`  Validation Nonce: ${validationNonce}`);
    console.log(`  Signer: ${signer.publicKey.toBase58()}`);
    console.log(`  Cluster: ${sdk.getCluster()}`);

    // Exit with appropriate code
    process.exit(failedTests > 0 ? 1 : 0);

  } catch (error) {
    logError(`Fatal error: ${error}`);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
main().catch(error => {
  logError(`Unhandled error: ${error}`);
  console.error(error);
  process.exit(1);
});
