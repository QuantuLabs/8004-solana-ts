/**
 * Hash-Chain Integrity Verification Stress Test (Localnet)
 *
 * Tests indexer hash-chain verification with massive volumes:
 * - Scenario 1: 100 feedbacks, 100 responses, 10 revokes (quick)
 * - Scenario 2: 1,000 feedbacks, 1,000 responses, 100 revokes (medium)
 * - Scenario 3: 10,000 feedbacks, 10,000 responses, 1,000 revokes (large)
 * - Scenario 4: 100,000 feedbacks, 100,000 responses, 10,000 revokes (massive)
 *
 * Measures:
 * - Transaction throughput (tx/s)
 * - Integrity verification speed (O(1) check)
 * - Indexer sync time
 */

import { Keypair, PublicKey, Connection, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { SolanaSDK, IntegrityResult, IndexerClient, IndexedFeedback } from '../../src/index.js';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sha256(data: string): Buffer {
  return createHash('sha256').update(data).digest();
}

// ============ CONFIG ============
const LOCALNET_RPC = 'http://127.0.0.1:8899';
const LOCALNET_INDEXER = process.env.INDEXER_URL || 'http://127.0.0.1:3005/rest/v1';

interface ScenarioConfig {
  name: string;
  feedbacks: number;
  responses: number;
  revokes: number;
  concurrency: number;
  batchDelay: number;
}

const SCENARIOS: ScenarioConfig[] = [
  { name: 'Quick', feedbacks: 100, responses: 100, revokes: 10, concurrency: 10, batchDelay: 100 },
  { name: 'Medium', feedbacks: 1_000, responses: 1_000, revokes: 100, concurrency: 20, batchDelay: 50 },
  { name: 'Large', feedbacks: 10_000, responses: 10_000, revokes: 1_000, concurrency: 50, batchDelay: 20 },
  { name: 'Massive', feedbacks: 100_000, responses: 100_000, revokes: 10_000, concurrency: 100, batchDelay: 10 },
];

interface StressResult {
  operation: string;
  success: boolean;
  signature?: string;
  error?: string;
  durationMs: number;
  clientIndex?: number;
  feedbackIndex?: number | bigint;
}

interface ScenarioReport {
  scenario: string;
  totalTx: number;
  successful: number;
  failed: number;
  durationMs: number;
  txPerSecond: number;
  avgTxMs: number;
  integrityChecks: {
    count: number;
    avgMs: number;
    allValid: boolean;
  };
}

interface FeedbackAnchor {
  clientIndex: number;
  feedbackIndex: number;
  sealHash: Buffer;
}

// ============ UTILITIES ============
function loadKeypair(): Keypair {
  const walletPath = process.env.SOLANA_WALLET_PATH || path.join(process.env.HOME!, '.config/solana/id.json');
  const keyData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function airdropIfNeeded(connection: Connection, pubkey: PublicKey, minBalance: number): Promise<void> {
  const balance = await connection.getBalance(pubkey);
  if (balance < minBalance) {
    console.log(`  Airdropping ${(minBalance / 1e9).toFixed(1)} SOL...`);
    const sig = await connection.requestAirdrop(pubkey, minBalance);
    await connection.confirmTransaction(sig);
  }
}

// ============ PARALLEL EXECUTION ============
async function executeInBatches<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  batchDelay: number,
  onProgress?: (completed: number, total: number) => void
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(t => t().catch(e => ({ error: e.message } as any))));
    results.push(...batchResults);
    onProgress?.(Math.min(i + concurrency, tasks.length), tasks.length);
    if (i + concurrency < tasks.length && batchDelay > 0) {
      await sleep(batchDelay);
    }
  }
  return results;
}

async function collectFeedbackAnchors(
  asset: string,
  clientKeypairs: Keypair[],
  targetCount: number,
  timeoutMs: number = 120000
): Promise<FeedbackAnchor[]> {
  if (targetCount <= 0) return [];

  const clientIndexByAddress = new Map<string, number>();
  for (let i = 0; i < clientKeypairs.length; i++) {
    clientIndexByAddress.set(clientKeypairs[i].publicKey.toBase58(), i);
  }

  const indexer = new IndexerClient({
    baseUrl: LOCALNET_INDEXER,
    apiKey: 'test-key',
    timeout: 10000,
    retries: 1,
  });

  const deadline = Date.now() + timeoutMs;
  const pageSize = Math.min(1000, Math.max(100, targetCount));

  while (Date.now() < deadline) {
    const anchorsByIndex = new Map<number, FeedbackAnchor>();
    let offset = 0;

    while (true) {
      const page = await indexer.getFeedbacks(asset, {
        includeRevoked: true,
        limit: pageSize,
        offset,
      });
      if (page.length === 0) break;

      for (const fb of page as IndexedFeedback[]) {
        const clientIndex = clientIndexByAddress.get(fb.client_address);
        if (clientIndex === undefined || !fb.feedback_hash) continue;
        const idx =
          typeof fb.feedback_index === 'string' ? Number.parseInt(fb.feedback_index, 10) : fb.feedback_index;
        if (!Number.isFinite(idx)) continue;
        anchorsByIndex.set(idx, {
          clientIndex,
          feedbackIndex: idx,
          sealHash: Buffer.from(fb.feedback_hash, 'hex'),
        });
      }

      offset += page.length;
      if (page.length < pageSize) break;
    }

    const anchors = Array.from(anchorsByIndex.values()).sort((a, b) => a.feedbackIndex - b.feedbackIndex);
    if (anchors.length >= targetCount) {
      return anchors.slice(0, targetCount);
    }

    await sleep(2000);
  }

  return [];
}

// ============ SCENARIO RUNNER ============
async function runScenario(config: ScenarioConfig): Promise<ScenarioReport> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  SCENARIO: ${config.name}`);
  console.log(`  Feedbacks: ${config.feedbacks.toLocaleString()}`);
  console.log(`  Responses: ${config.responses.toLocaleString()}`);
  console.log(`  Revokes: ${config.revokes.toLocaleString()}`);
  console.log(`${'='.repeat(60)}`);

  const connection = new Connection(LOCALNET_RPC, 'confirmed');
  const mainWallet = loadKeypair();

  await airdropIfNeeded(connection, mainWallet.publicKey, 100 * 1e9);

  const sdk = new SolanaSDK({
    rpcUrl: LOCALNET_RPC,
    signer: mainWallet,
    indexerUrl: LOCALNET_INDEXER,
  });

  // Keep one feedback signer for deterministic index ownership in revoke phase.
  const NUM_CLIENTS = 1;
  const clientKeypairs: Keypair[] = [];
  const clientSdks: SolanaSDK[] = [];

  console.log(`\n[1/6] Setting up ${NUM_CLIENTS} client wallets...`);
  for (let i = 0; i < NUM_CLIENTS; i++) {
    const kp = Keypair.generate();
    clientKeypairs.push(kp);
    await airdropIfNeeded(connection, kp.publicKey, 10 * 1e9);
    clientSdks.push(new SolanaSDK({ rpcUrl: LOCALNET_RPC, signer: kp, indexerUrl: LOCALNET_INDEXER }));
  }

  // Create agent
  console.log(`\n[2/6] Creating agent...`);
  const tokenUri = `ipfs://hashchain_test_${Date.now()}`;
  const regResult = await sdk.registerAgent(tokenUri);
  if (!regResult.success || !regResult.asset) {
    throw new Error(`Agent registration failed: ${regResult.error}`);
  }
  const agent = regResult.asset;
  console.log(`  Agent: ${agent.toBase58()}`);

  try {
    await sdk.initializeAtomStats(agent);
  } catch (e) {
    // May already be initialized
  }

  const collection = await sdk.getBaseCollection();
  if (!collection) throw new Error('No base collection');

  const results: StressResult[] = [];

  // Generate feedbacks
  console.log(`\n[3/6] Generating ${config.feedbacks.toLocaleString()} feedbacks...`);
  const feedbackTasks: (() => Promise<StressResult>)[] = [];

  for (let i = 0; i < config.feedbacks; i++) {
    const clientIndex = i % NUM_CLIENTS;
    const clientSdk = clientSdks[clientIndex];

    feedbackTasks.push(async () => {
      const start = Date.now();
      try {
        const result = await clientSdk.giveFeedback(agent, {
          value: String(Math.floor(Math.random() * 10000)),
          score: Math.floor(Math.random() * 101),
          tag1: 'quality',
          tag2: 'day',
          feedbackUri: `ipfs://fb_${i}`,
          feedbackHash: sha256(`feedback_${i}`),
        });
        return {
          operation: 'feedback',
          success: result.success ?? false,
          signature: result.signature,
          durationMs: Date.now() - start,
          clientIndex,
        };
      } catch (e: any) {
        return {
          operation: 'feedback',
          success: false,
          error: e.message,
          durationMs: Date.now() - start,
          clientIndex,
        };
      }
    });
  }

  const startTime = Date.now();
  let completed = 0;

  const feedbackResults = await executeInBatches(feedbackTasks, config.concurrency, config.batchDelay, (c, t) => {
    completed = c;
    process.stdout.write(`\r  Progress: ${Math.floor((c / t) * 100)}% (${c}/${t})`);
  });
  results.push(...feedbackResults);
  console.log('');

  const onChainAgent = await sdk.loadAgent(agent);
  const onChainFeedbackCount = onChainAgent ? Number(onChainAgent.feedback_count) : 0;
  const successfulFeedbackCount = feedbackResults.filter(r => r.success).length;
  const anchorTargetCount = Math.min(onChainFeedbackCount, Math.max(config.responses, config.revokes));
  const successfulFeedbacks = await collectFeedbackAnchors(
    agent.toBase58(),
    clientKeypairs,
    anchorTargetCount
  );
  console.log(`  Successful feedback tx: ${successfulFeedbackCount}`);
  console.log(`  On-chain feedback count: ${onChainFeedbackCount}`);
  console.log(`  Indexed feedback anchors for responses/revokes: ${successfulFeedbacks.length}`);

  // Generate responses
  console.log(`\n[4/6] Generating ${config.responses.toLocaleString()} responses...`);
  const responseTasks: (() => Promise<StressResult>)[] = [];

  for (let i = 0; i < config.responses && i < successfulFeedbacks.length; i++) {
    const { clientIndex, feedbackIndex, sealHash } = successfulFeedbacks[i];
    const clientPubkey = clientKeypairs[clientIndex].publicKey;

    responseTasks.push(async () => {
      const start = Date.now();
      try {
        const result = await sdk.appendResponse(
          agent,
          clientPubkey,
          feedbackIndex,
          sealHash,
          `ipfs://resp_${i}`,
          sha256(`response_${i}`)
        );
        return { operation: 'response', success: result.success ?? false, signature: result.signature, durationMs: Date.now() - start };
      } catch (e: any) {
        return { operation: 'response', success: false, error: e.message, durationMs: Date.now() - start };
      }
    });
  }

  const responseResults = await executeInBatches(responseTasks, config.concurrency, config.batchDelay, (c, t) => {
    process.stdout.write(`\r  Progress: ${Math.floor((c / t) * 100)}% (${c}/${t})`);
  });
  results.push(...responseResults);
  console.log('');

  // Generate revokes
  console.log(`\n[5/6] Generating ${config.revokes.toLocaleString()} revocations...`);
  const revokeTasks: (() => Promise<StressResult>)[] = [];

  for (let i = 0; i < config.revokes && i < successfulFeedbacks.length; i++) {
    const { clientIndex, feedbackIndex, sealHash } = successfulFeedbacks[i];
    const clientSdk = clientSdks[clientIndex];

    revokeTasks.push(async () => {
      const start = Date.now();
      try {
        const result = await clientSdk.revokeFeedback(agent, feedbackIndex, sealHash);
        return { operation: 'revoke', success: result.success ?? false, signature: result.signature, durationMs: Date.now() - start };
      } catch (e: any) {
        return { operation: 'revoke', success: false, error: e.message, durationMs: Date.now() - start };
      }
    });
  }

  const revokeResults = await executeInBatches(revokeTasks, config.concurrency, config.batchDelay, (c, t) => {
    process.stdout.write(`\r  Progress: ${Math.floor((c / t) * 100)}% (${c}/${t})`);
  });
  results.push(...revokeResults);
  console.log('');

  const totalDuration = Date.now() - startTime;

  // Integrity checks
  console.log(`\n[6/6] Running integrity verification...`);
  const baseWaitMs = Math.max(5000, Math.ceil(config.feedbacks / 100) * 1000);
  const maxSyncWaitMs = Number(process.env.INTEGRITY_SYNC_TIMEOUT_MS || Math.max(baseWaitMs * 8, 60000));
  const syncPollMs = 2000;
  console.log(`  Waiting up to ${Math.round(maxSyncWaitMs / 1000)}s for indexer sync...`);

  let syncWaitedMs = 0;
  let syncReady = false;
  let lastSyncProbe: IntegrityResult | null = null;
  while (syncWaitedMs <= maxSyncWaitMs) {
    lastSyncProbe = await sdk.verifyIntegrity(agent);
    if (lastSyncProbe.status === 'valid') {
      syncReady = true;
      break;
    }
    await sleep(syncPollMs);
    syncWaitedMs += syncPollMs;
  }

  if (!syncReady && lastSyncProbe) {
    console.log(
      `  ⚠️ Sync wait timeout: status=${lastSyncProbe.status}, error=${lastSyncProbe.error?.message || 'n/a'}`
    );
  }

  const integrityResults: { valid: boolean; durationMs: number }[] = [];
  const NUM_INTEGRITY_CHECKS = 10;

  for (let i = 0; i < NUM_INTEGRITY_CHECKS; i++) {
    const start = Date.now();
    const result = await sdk.verifyIntegrity(agent);
    integrityResults.push({ valid: result.valid, durationMs: Date.now() - start });

    if (!result.valid) {
      console.log(
        `  ❌ Check ${i + 1}: INVALID (status=${result.status}, error=${result.error?.message || 'n/a'})`
      );
      console.log(`    Feedback: on-chain=${result.chains.feedback.onChain.slice(0, 16)}... indexer=${result.chains.feedback.indexer?.slice(0, 16)}...`);
      console.log(`    Response: on-chain=${result.chains.response.onChain.slice(0, 16)}... indexer=${result.chains.response.indexer?.slice(0, 16)}...`);
      console.log(`    Revoke: on-chain=${result.chains.revoke.onChain.slice(0, 16)}... indexer=${result.chains.revoke.indexer?.slice(0, 16)}...`);
    } else {
      console.log(`  ✅ Check ${i + 1}: ${integrityResults[i].durationMs}ms`);
    }
  }

  const avgIntegrityMs = integrityResults.reduce((s, r) => s + r.durationMs, 0) / integrityResults.length;
  const allValid = integrityResults.every(r => r.valid);

  // Generate report
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const avgTxMs = results.reduce((s, r) => s + r.durationMs, 0) / results.length;

  const report: ScenarioReport = {
    scenario: config.name,
    totalTx: results.length,
    successful,
    failed,
    durationMs: totalDuration,
    txPerSecond: results.length / (totalDuration / 1000),
    avgTxMs,
    integrityChecks: {
      count: NUM_INTEGRITY_CHECKS,
      avgMs: avgIntegrityMs,
      allValid,
    },
  };

  // Print summary
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  SCENARIO REPORT: ${config.name}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Total transactions: ${report.totalTx.toLocaleString()}`);
  console.log(`  Successful: ${report.successful.toLocaleString()} (${((report.successful / report.totalTx) * 100).toFixed(1)}%)`);
  console.log(`  Failed: ${report.failed.toLocaleString()}`);
  console.log(`  Duration: ${(report.durationMs / 1000).toFixed(1)}s`);
  console.log(`  Throughput: ${report.txPerSecond.toFixed(2)} tx/s`);
  console.log(`  Avg tx time: ${report.avgTxMs.toFixed(0)}ms`);
  console.log(`  Integrity check avg: ${report.integrityChecks.avgMs.toFixed(1)}ms (O(1))`);
  console.log(`  All integrity valid: ${report.integrityChecks.allValid ? '✅ YES' : '❌ NO'}`);

  // Group errors
  const errors = results.filter(r => !r.success && r.error);
  if (errors.length > 0) {
    const errorGroups = new Map<string, number>();
    for (const e of errors) {
      const key = e.error!.slice(0, 80);
      errorGroups.set(key, (errorGroups.get(key) || 0) + 1);
    }
    console.log(`\n  Errors (top 5):`);
    const sorted = [...errorGroups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [msg, count] of sorted) {
      console.log(`    ${count}x: ${msg}`);
    }
  }

  return report;
}

// ============ MAIN ============
async function main(): Promise<void> {
  console.log('\n' + '═'.repeat(60));
  console.log('   HASH-CHAIN INTEGRITY STRESS TEST (LOCALNET)');
  console.log('═'.repeat(60));
  console.log(`\nRPC: ${LOCALNET_RPC}`);
  console.log(`Indexer: ${LOCALNET_INDEXER}`);

  const selectedScenario = process.argv[2]?.toLowerCase();
  let scenarios: ScenarioConfig[];
  if (!selectedScenario) {
    scenarios = SCENARIOS.filter(s => s.name === 'Quick');
  } else if (selectedScenario === 'all') {
    scenarios = SCENARIOS;
  } else {
    scenarios = SCENARIOS.filter(s => s.name.toLowerCase() === selectedScenario);
  }

  if (scenarios.length === 0) {
    console.log(`\nAvailable scenarios: ${SCENARIOS.map(s => s.name).join(', ')}, all`);
    console.log('Usage: npx ts-node stress-test-hashchain-localnet.ts [quick|medium|large|massive|all]');
    process.exit(1);
  }

  const reports: ScenarioReport[] = [];

  for (const scenario of scenarios) {
    try {
      const report = await runScenario(scenario);
      reports.push(report);
    } catch (e: any) {
      console.error(`\n❌ Scenario ${scenario.name} failed: ${e.message}`);
    }
  }

  // Final summary
  console.log('\n' + '═'.repeat(60));
  console.log('   FINAL SUMMARY');
  console.log('═'.repeat(60));

  for (const r of reports) {
    const status = r.integrityChecks.allValid ? '✅' : '❌';
    console.log(`\n  ${status} ${r.scenario}:`);
    console.log(`     ${r.totalTx.toLocaleString()} tx | ${r.txPerSecond.toFixed(1)} tx/s | Integrity: ${r.integrityChecks.avgMs.toFixed(1)}ms`);
  }

  const allPassed = reports.every(r => r.integrityChecks.allValid);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(allPassed ? '  ✅ ALL SCENARIOS PASSED' : '  ❌ SOME SCENARIOS FAILED');
  console.log('═'.repeat(60));

  process.exit(allPassed ? 0 : 1);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
