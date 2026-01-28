/**
 * MASSIVE Stress Test for 8004 Solana Indexer
 *
 * Tests indexer with hundreds of parallel transactions:
 * - 200+ feedbacks
 * - 50+ metadata updates
 * - 30+ validations
 * - 30+ URI updates
 * - 30+ revocations
 *
 * Uses existing wallets to be economical (~0.5 SOL total)
 */

import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import { SolanaSDK } from '../../src/core/sdk-solana.js';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Helper to create SHA256 hash
function sha256(data: string): Buffer {
  return createHash('sha256').update(data).digest();
}

// ============ CONFIG ============
// Helius RPC for higher rate limits
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_DEVNET_RPC = `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const CONFIG = {
  // 🔥🔥🔥 ULTRA MASSIVE SPAM MODE 🔥🔥🔥
  AGENTS_TO_CREATE: 15,       // More agents for parallel updates
  FEEDBACKS: 300,             // SPAM feedbacks hard
  METADATA_UPDATES: 200,      // SPAM metadata (on-chain)
  VALIDATIONS: 50,            // Validations (request + response pairs)
  URI_UPDATES: 100,           // URI updates with various formats
  REVOCATIONS: 40,            // Revoke feedbacks

  // Concurrency - push Helius to the limit
  CONCURRENCY: 12,            // Higher concurrency
  BATCH_DELAY_MS: 500,        // Faster batches

  // Commitment levels
  SEND_COMMITMENT: 'processed' as const,
  CONFIRM_COMMITMENT: 'confirmed' as const,

  // Retry settings
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,

  // Indexer for verification (from indexer-defaults.ts)
  INDEXER_URL: 'https://uhjytdjxvfbppgjicfly.supabase.co/rest/v1',
  SUPABASE_ANON_KEY: 'sb_publishable_i-ycBRGiolBr8GMdiVq1rA_nwt7N2bq',
};

// ============ TYPES ============
interface StressResult {
  operation: string;
  success: boolean;
  signature?: string;
  error?: string;
  durationMs: number;
}

interface StressReport {
  totalTransactions: number;
  successful: number;
  failed: number;
  totalDurationMs: number;
  avgTxDurationMs: number;
  txPerSecond: number;
  byOperation: Record<string, { total: number; success: number; failed: number }>;
  errors: string[];
}

// ============ UTILITIES ============
function loadKeypair(filePath: string): Keypair {
  const keyData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Simple concurrency limiter
async function pLimit<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  batchDelay: number = 0
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const p = task().then(result => {
      results.push(result);
    }).catch(error => {
      results.push({ success: false, error: error.message } as any);
    });

    executing.push(p as any);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      // Remove completed promises
      const completed = executing.filter(p => {
        let resolved = false;
        p.then(() => { resolved = true; }).catch(() => { resolved = true; });
        return resolved;
      });
      executing.splice(0, executing.length, ...executing.filter(p => !completed.includes(p)));

      if (batchDelay > 0 && i % concurrency === 0) {
        await sleep(batchDelay);
      }
    }
  }

  await Promise.all(executing);
  return results;
}

// ============ SCENARIO DATA ============
// OASF-compliant tags
const VALID_TAGS1 = ['uptime', 'successRate', 'latency', 'revenues', 'costs', 'quality', 'accuracy'];
const VALID_TAGS2 = ['day', 'week', 'month', 'year', 'hour'];

// Edge case tags (non-standard but allowed)
const EDGE_CASE_TAGS = ['custom_metric', 'test-tag', 'x402-resource-delivered', 'x402-good-payer', ''];

// URI formats to test - CONFORMING
const URI_FORMATS_VALID = [
  (i: number) => `ipfs://Qm${randomHex(44)}_${i}`,           // IPFS CIDv0
  (i: number) => `ipfs://baf${randomHex(56)}_${i}`,          // IPFS CIDv1
  (i: number) => `ar://${randomHex(43)}_${i}`,               // Arweave
  (i: number) => `https://example.com/agent/${i}.json`,      // HTTPS
  (i: number) => `https://arweave.net/${randomHex(43)}`,     // Arweave gateway
  (i: number) => `https://ipfs.io/ipfs/Qm${randomHex(44)}`,  // IPFS gateway
  (i: number) => `https://api.openai.com/v1/models/${i}`,    // API endpoint
  (i: number) => `https://huggingface.co/model/${randomHex(8)}`, // HuggingFace
];

// URI formats - EDGE CASES (may fail or behave unexpectedly)
const URI_FORMATS_EDGE = [
  (i: number) => `ipfs://${randomHex(10)}`,                  // Too short CID
  (i: number) => `ar://`,                                     // Empty arweave
  (i: number) => `https://`,                                  // Incomplete HTTPS
  (i: number) => `ftp://files.example.com/agent${i}.json`,   // FTP (non-standard)
  (i: number) => `data:application/json,{"id":${i}}`,        // Data URI
  (i: number) => `file:///etc/passwd`,                        // File URI (security test)
  (i: number) => `javascript:alert(${i})`,                   // XSS attempt
  (i: number) => `${randomHex(100)}`,                        // No protocol
  (i: number) => `http://${randomHex(200)}.com/very/long/path/${'x'.repeat(500)}_${i}.json`, // Very long URL
  (i: number) => `https://例え.jp/agent/${i}`,               // IDN domain
  (i: number) => `ipfs://Qm${randomHex(44)}?query=param&foo=bar`, // Query params
  (i: number) => `https://example.com/agent/${i}#fragment`,  // Fragment
  (i: number) => '',                                          // Empty string
  (i: number) => ' ',                                         // Whitespace only
  (i: number) => `ipfs://Qm${randomHex(44)}\n\r\t`,          // Control chars
];

// Combined for random selection
const URI_FORMATS = [...URI_FORMATS_VALID, ...URI_FORMATS_EDGE];

// ============ METADATA SCENARIOS - CONFORMING ============
const METADATA_VALID = [
  // Standard agent metadata
  { key: 'version', value: () => `v${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}` },
  { key: 'endpoint', value: () => `https://api${Math.floor(Math.random() * 100)}.example.com/v1` },
  { key: 'capabilities', value: () => JSON.stringify(['chat', 'code', 'search'].slice(0, Math.floor(Math.random() * 3) + 1)) },
  { key: 'status', value: () => ['active', 'maintenance', 'beta', 'deprecated'][Math.floor(Math.random() * 4)] },
  { key: 'model', value: () => ['gpt-4', 'claude-3', 'gemini-pro', 'llama-3', 'mixtral-8x7b', 'phi-3'][Math.floor(Math.random() * 6)] },
  { key: 'pricing', value: () => JSON.stringify({ perRequest: Math.random() * 0.01, currency: 'USD' }) },
  { key: 'author', value: () => `developer_${randomHex(8)}` },
  { key: 'license', value: () => ['MIT', 'Apache-2.0', 'GPL-3.0', 'proprietary'][Math.floor(Math.random() * 4)] },
  { key: 'website', value: () => `https://agent${Math.floor(Math.random() * 1000)}.ai` },
  { key: 'repository', value: () => `https://github.com/org${Math.floor(Math.random() * 100)}/agent${Math.floor(Math.random() * 1000)}` },
];

// ============ METADATA SCENARIOS - STRESS TEST ============
const METADATA_STRESS = [
  // Long values (stress memory/storage)
  { key: 'description', value: () => 'A'.repeat(500) + `_${Date.now()}` },      // 500 chars
  { key: 'long_tags', value: () => Array(50).fill(0).map((_, i) => `tag${i}`).join(',') }, // 50 tags
  { key: 'huge_json', value: () => JSON.stringify(Array(100).fill({ key: randomHex(8), val: Math.random() })) }, // Large JSON
  { key: 'deep_nested', value: () => JSON.stringify({ a: { b: { c: { d: { e: { f: Date.now() } } } } } }) }, // Deep nesting
];

// ============ METADATA SCENARIOS - UNICODE/SPECIAL ============
const METADATA_UNICODE = [
  { key: 'emoji_test', value: () => `Agent 🤖 Status: ✅ Version: 🔢 Rating: ⭐⭐⭐⭐⭐` },
  { key: 'japanese', value: () => `日本語テスト_${Date.now()}_エージェント` },
  { key: 'chinese', value: () => `中文测试_${Date.now()}_代理程序` },
  { key: 'arabic', value: () => `اختبار_${Date.now()}_وكيل` },
  { key: 'russian', value: () => `Тест_${Date.now()}_Агент` },
  { key: 'korean', value: () => `테스트_${Date.now()}_에이전트` },
  { key: 'mixed', value: () => `Mix🔥日本語中文العربية${Date.now()}` },
  { key: 'rtl_ltr_mixed', value: () => `Left-to-right العربية Right-to-left` },
];

// ============ METADATA SCENARIOS - EDGE CASES ============
const METADATA_EDGE = [
  { key: 'empty_value', value: () => '' },
  { key: 'whitespace', value: () => '   \t\n   ' },
  { key: 'null_string', value: () => 'null' },
  { key: 'undefined_string', value: () => 'undefined' },
  { key: 'number_as_string', value: () => String(Math.random() * 1000000) },
  { key: 'bool_true', value: () => 'true' },
  { key: 'bool_false', value: () => 'false' },
  { key: 'zero', value: () => '0' },
  { key: 'negative', value: () => '-12345.6789' },
  { key: 'scientific', value: () => '1.23e10' },
  { key: 'infinity', value: () => 'Infinity' },
  { key: 'nan', value: () => 'NaN' },
];

// ============ METADATA SCENARIOS - NON-CONFORMING (may fail) ============
const METADATA_INVALID = [
  { key: '', value: () => 'empty_key_test' },                           // Empty key
  { key: ' ', value: () => 'whitespace_key' },                          // Whitespace key
  { key: 'key\nwith\nnewlines', value: () => 'newline_key' },          // Newlines in key
  { key: 'key\twith\ttabs', value: () => 'tab_key' },                  // Tabs in key
  { key: 'a'.repeat(100), value: () => 'very_long_key' },              // 100 char key
  { key: '🔥key🔥', value: () => 'emoji_in_key' },                     // Emoji in key
  { key: '<script>alert(1)</script>', value: () => 'xss_key' },        // XSS in key
  { key: '../../../etc/passwd', value: () => 'path_traversal_key' },   // Path traversal
  { key: 'SELECT * FROM', value: () => 'sql_injection_key' },          // SQL injection
  { key: '${process.env}', value: () => 'template_injection' },        // Template injection
  { key: '__proto__', value: () => '{"polluted": true}' },             // Prototype pollution
  { key: 'constructor', value: () => 'function() {}' },                // Constructor injection
  { key: 'normal_key', value: () => '\x00\x01\x02\x03' },              // Null bytes in value
  { key: 'control_chars', value: () => '\x1b[31mRED\x1b[0m' },         // ANSI escape
  { key: 'binary_data', value: () => Buffer.from([0xFF, 0xFE, 0xFD]).toString('base64') }, // Binary
];

// Combined for selection
const METADATA_SCENARIOS = [
  ...METADATA_VALID,
  ...METADATA_STRESS,
  ...METADATA_UNICODE,
  ...METADATA_EDGE,
  ...METADATA_INVALID,
];

// Value formats for feedbacks
const FEEDBACK_VALUE_FORMATS = [
  () => String(Math.floor(Math.random() * 10000)),           // Integer string
  () => (Math.random() * 100).toFixed(2),                     // Decimal string
  () => (Math.random() * 100).toFixed(4),                     // High precision
  () => String(Math.floor(Math.random() * 1000000)),         // Large number
  () => '-' + (Math.random() * 100).toFixed(2),              // Negative (for PnL)
  () => '0',                                                   // Zero
  () => '0.00001',                                             // Very small
];

function randomHex(len: number): string {
  return Array(len).fill(0).map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
}

// ============ TRANSACTION GENERATORS ============
// Track feedback indices per agent per client
const feedbackIndices = new Map<string, bigint>(); // key: "agent:client"

function generateFeedbackTasks(
  sdks: SolanaSDK[],  // Multiple SDKs with different signers
  clientKeypairs: Keypair[],  // To track for revocation
  agents: PublicKey[],
  count: number
): (() => Promise<StressResult>)[] {
  const tasks: (() => Promise<StressResult>)[] = [];

  // Categorize feedbacks: 70% conforming, 20% edge cases, 10% non-conforming
  const conformingCount = Math.floor(count * 0.7);
  const edgeCaseCount = Math.floor(count * 0.2);
  const nonConformingCount = count - conformingCount - edgeCaseCount;

  for (let i = 0; i < count; i++) {
    const agent = agents[i % agents.length];
    const sdkIndex = i % sdks.length;
    const sdk = sdks[sdkIndex];
    const clientKeypair = clientKeypairs[sdkIndex];

    // Determine scenario type based on index
    let tag1: string;
    let tag2: string;
    let opType: string;

    if (i < conformingCount) {
      // CONFORMING: Valid OASF tags
      tag1 = VALID_TAGS1[i % VALID_TAGS1.length];
      tag2 = VALID_TAGS2[i % VALID_TAGS2.length];
      opType = 'feedback_valid';
    } else if (i < conformingCount + edgeCaseCount) {
      // EDGE CASES: x402 tags, empty, custom
      tag1 = EDGE_CASE_TAGS[i % EDGE_CASE_TAGS.length];
      tag2 = VALID_TAGS2[i % VALID_TAGS2.length];
      opType = 'feedback_edge';
    } else {
      // NON-CONFORMING: Invalid combinations
      tag1 = ['💯', 'tag with spaces', '', 'a'.repeat(100), '<script>', '${injected}'][i % 6];
      tag2 = ['invalid_period', '', '  ', 'year\nnewline', 'day;DROP TABLE'][i % 5];
      opType = 'feedback_invalid';
    }

    const valueFormat = FEEDBACK_VALUE_FORMATS[i % FEEDBACK_VALUE_FORMATS.length];
    const value = valueFormat();
    const score = i % 10 === 0 ? undefined : Math.floor(Math.random() * 101);

    // Use valid URIs for conforming, edge URIs for others
    const uriFormats = i < conformingCount ? URI_FORMATS_VALID : URI_FORMATS_EDGE;
    const uriFormat = uriFormats[i % uriFormats.length];
    const feedbackUri = uriFormat(i);
    const feedbackHash = sha256(feedbackUri);

    // Manual feedback index
    const indexKey = `${agent.toBase58()}:${sdkIndex}`;
    const feedbackIndex = feedbackIndices.get(indexKey) ?? BigInt(10000 + Math.floor(Math.random() * 100000));
    feedbackIndices.set(indexKey, feedbackIndex + 1n);

    // Track for potential revocation
    createdFeedbacks.push({ agent, client: clientKeypair, feedbackIndex });

    tasks.push(async () => {
      const start = Date.now();
      try {
        const result = await sdk.giveFeedback(agent, {
          value,
          score,
          tag1,
          tag2,
          feedbackUri,
          feedbackHash,
        }, {
          feedbackIndex,
        });
        return {
          operation: opType,
          success: 'success' in result ? result.success : false,
          signature: 'signature' in result ? result.signature : undefined,
          durationMs: Date.now() - start,
        };
      } catch (error: any) {
        return {
          operation: opType,
          success: false,
          error: error.message,
          durationMs: Date.now() - start,
        };
      }
    });
  }

  return tasks;
}

function generateMetadataTasks(
  sdk: SolanaSDK,
  agents: PublicKey[],
  count: number
): (() => Promise<StressResult>)[] {
  const tasks: (() => Promise<StressResult>)[] = [];

  // Categorize: 40% valid, 15% stress, 15% unicode, 15% edge, 15% invalid
  const validCount = Math.floor(count * 0.4);
  const stressCount = Math.floor(count * 0.15);
  const unicodeCount = Math.floor(count * 0.15);
  const edgeCount = Math.floor(count * 0.15);
  const invalidCount = count - validCount - stressCount - unicodeCount - edgeCount;

  let taskIndex = 0;

  // Valid metadata
  for (let i = 0; i < validCount; i++, taskIndex++) {
    const agent = agents[taskIndex % agents.length];
    const scenario = METADATA_VALID[i % METADATA_VALID.length];
    const key = `${scenario.key}_${i % 30}`;
    const value = scenario.value();

    tasks.push(createMetadataTask(sdk, agent, key, value, 'metadata_valid'));
  }

  // Stress test metadata (large values)
  for (let i = 0; i < stressCount; i++, taskIndex++) {
    const agent = agents[taskIndex % agents.length];
    const scenario = METADATA_STRESS[i % METADATA_STRESS.length];
    const key = `${scenario.key}_${i % 10}`;
    const value = scenario.value();

    tasks.push(createMetadataTask(sdk, agent, key, value, 'metadata_stress'));
  }

  // Unicode metadata
  for (let i = 0; i < unicodeCount; i++, taskIndex++) {
    const agent = agents[taskIndex % agents.length];
    const scenario = METADATA_UNICODE[i % METADATA_UNICODE.length];
    const key = `${scenario.key}_${i % 10}`;
    const value = scenario.value();

    tasks.push(createMetadataTask(sdk, agent, key, value, 'metadata_unicode'));
  }

  // Edge case metadata
  for (let i = 0; i < edgeCount; i++, taskIndex++) {
    const agent = agents[taskIndex % agents.length];
    const scenario = METADATA_EDGE[i % METADATA_EDGE.length];
    const key = `${scenario.key}_${i % 15}`;
    const value = scenario.value();

    tasks.push(createMetadataTask(sdk, agent, key, value, 'metadata_edge'));
  }

  // Invalid/malicious metadata (expected to fail or be sanitized)
  for (let i = 0; i < invalidCount; i++, taskIndex++) {
    const agent = agents[taskIndex % agents.length];
    const scenario = METADATA_INVALID[i % METADATA_INVALID.length];
    // For invalid, use the key as-is to test validation
    const key = scenario.key || `invalid_${i}`;
    const value = scenario.value();

    tasks.push(createMetadataTask(sdk, agent, key, value, 'metadata_invalid'));
  }

  return tasks;
}

function createMetadataTask(
  sdk: SolanaSDK,
  agent: PublicKey,
  key: string,
  value: string,
  opType: string
): () => Promise<StressResult> {
  return async () => {
    const start = Date.now();
    try {
      const result = await sdk.setMetadata(agent, key, value);
      return {
        operation: opType,
        success: 'success' in result ? result.success : false,
        signature: 'signature' in result ? result.signature : undefined,
        durationMs: Date.now() - start,
      };
    } catch (error: any) {
      return {
        operation: opType,
        success: false,
        error: error.message,
        durationMs: Date.now() - start,
      };
    }
  };
}

function generateUriUpdateTasks(
  sdk: SolanaSDK,
  agents: PublicKey[],
  collection: PublicKey,
  count: number
): (() => Promise<StressResult>)[] {
  const tasks: (() => Promise<StressResult>)[] = [];

  // Mix of valid URIs (80%) and edge case URIs (20%)
  const validCount = Math.floor(count * 0.8);
  const edgeCount = count - validCount;

  // Valid URI tasks
  for (let i = 0; i < validCount; i++) {
    const agent = agents[i % agents.length];
    const uriFormat = URI_FORMATS_VALID[i % URI_FORMATS_VALID.length];
    const uri = uriFormat(i);

    tasks.push(async () => {
      const start = Date.now();
      try {
        const result = await sdk.setAgentUri(agent, collection, uri);
        return {
          operation: 'uri_update_valid',
          success: result.success ?? false,
          signature: result.signature,
          durationMs: Date.now() - start,
        };
      } catch (error: any) {
        return {
          operation: 'uri_update_valid',
          success: false,
          error: error.message,
          durationMs: Date.now() - start,
        };
      }
    });
  }

  // Edge case URI tasks (expected to potentially fail)
  for (let i = 0; i < edgeCount; i++) {
    const agent = agents[i % agents.length];
    const uriFormat = URI_FORMATS_EDGE[i % URI_FORMATS_EDGE.length];
    const uri = uriFormat(i);

    tasks.push(async () => {
      const start = Date.now();
      try {
        const result = await sdk.setAgentUri(agent, collection, uri);
        return {
          operation: 'uri_update_edge',
          success: result.success ?? false,
          signature: result.signature,
          durationMs: Date.now() - start,
        };
      } catch (error: any) {
        return {
          operation: 'uri_update_edge',
          success: false,
          error: error.message,
          durationMs: Date.now() - start,
        };
      }
    });
  }

  return tasks;
}

function generateValidationTasks(
  ownerSdk: SolanaSDK,
  validatorSdk: SolanaSDK,
  agents: PublicKey[],
  validatorPubkey: PublicKey,
  count: number
): (() => Promise<StressResult>)[] {
  const tasks: (() => Promise<StressResult>)[] = [];

  for (let i = 0; i < count; i++) {
    const agent = agents[i % agents.length];
    const nonce = (Date.now() % 0xFFFFFFFF) + i * 1000 + Math.floor(Math.random() * 1000);
    const requestUri = `ipfs://stress_validation_req_${nonce}`;
    const responseUri = `ipfs://stress_validation_resp_${nonce}`;

    // Request validation - correct signature: (asset, validator, requestUri, options?)
    tasks.push(async () => {
      const start = Date.now();
      try {
        const result = await ownerSdk.requestValidation(
          agent,
          validatorPubkey,
          requestUri,
          { nonce, requestHash: sha256(requestUri) }
        );
        return {
          operation: 'validation_request',
          success: 'success' in result ? result.success : false,
          signature: 'signature' in result ? result.signature : undefined,
          durationMs: Date.now() - start,
        };
      } catch (error: any) {
        return {
          operation: 'validation_request',
          success: false,
          error: error.message,
          durationMs: Date.now() - start,
        };
      }
    });

    // Respond to validation - correct signature: (asset, nonce, score, responseUri, options?)
    tasks.push(async () => {
      await sleep(2000); // Wait for request to be confirmed on-chain
      const start = Date.now();
      try {
        const responseScore = Math.floor(Math.random() * 101);
        const result = await validatorSdk.respondToValidation(
          agent,
          nonce,
          responseScore,
          responseUri,
          { responseHash: sha256(responseUri) }
        );
        return {
          operation: 'validation_response',
          success: 'success' in result ? result.success : false,
          signature: 'signature' in result ? result.signature : undefined,
          durationMs: Date.now() - start,
        };
      } catch (error: any) {
        console.error(`[VALIDATION_RESP ERROR] ${error.message.slice(0, 100)}`);
        return {
          operation: 'validation_response',
          success: false,
          error: error.message,
          durationMs: Date.now() - start,
        };
      }
    });
  }

  return tasks;
}

// Track created feedbacks for revocation
const createdFeedbacks: Array<{ agent: PublicKey; client: Keypair; feedbackIndex: bigint }> = [];

function generateRevocationTasks(
  clientSdks: SolanaSDK[],
  clientKeypairs: Keypair[],
  feedbacksToRevoke: Array<{ agent: PublicKey; client: Keypair; feedbackIndex: bigint }>,
  count: number
): (() => Promise<StressResult>)[] {
  const tasks: (() => Promise<StressResult>)[] = [];

  // Only revoke up to the available feedbacks
  const toRevoke = feedbacksToRevoke.slice(0, count);

  for (let i = 0; i < toRevoke.length; i++) {
    const { agent, client, feedbackIndex } = toRevoke[i];

    // Find the SDK for this client
    const clientIndex = clientKeypairs.findIndex(kp => kp.publicKey.equals(client.publicKey));
    if (clientIndex === -1) continue;

    const sdk = clientSdks[clientIndex];

    tasks.push(async () => {
      const start = Date.now();
      try {
        const result = await sdk.revokeFeedback(agent, Number(feedbackIndex));
        return {
          operation: 'revocation',
          success: 'success' in result ? result.success : false,
          signature: 'signature' in result ? result.signature : undefined,
          durationMs: Date.now() - start,
        };
      } catch (error: any) {
        return {
          operation: 'revocation',
          success: false,
          error: error.message,
          durationMs: Date.now() - start,
        };
      }
    });
  }

  return tasks;
}

// ============ INDEXER VERIFICATION ============
interface IndexerVerificationResult {
  agentsFound: number;
  feedbacksFound: number;
  validationsFound: number;
  errors: string[];
  details: {
    agents: Array<{ id: string; name?: string; feedbackCount?: number }>;
    recentFeedbacks: Array<{ agentId: string; score: number; tag1?: string }>;
  };
}

async function verifyIndexerData(
  agents: PublicKey[],
  owner: PublicKey,
  clients: Keypair[]
): Promise<IndexerVerificationResult> {
  const result: IndexerVerificationResult = {
    agentsFound: 0,
    feedbacksFound: 0,
    validationsFound: 0,
    errors: [],
    details: { agents: [], recentFeedbacks: [] },
  };

  const headers = {
    'apikey': CONFIG.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };

  // Check agents (use 'asset' column, not 'asset_id')
  for (const agent of agents) {
    try {
      const agentId = agent.toBase58();
      const response = await fetch(
        `${CONFIG.INDEXER_URL}/agents?asset=eq.${agentId}`,
        { headers }
      );
      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          result.agentsFound++;
          result.details.agents.push({
            id: agentId.slice(0, 8) + '...',
            name: data[0].nft_name,
            feedbackCount: data[0].feedback_count,
          });
        }
      } else {
        result.errors.push(`Agent query: ${response.status} ${response.statusText}`);
      }
    } catch (e: any) {
      result.errors.push(`Agent check failed: ${e.message}`);
    }
  }

  // Check feedbacks for all agents
  for (const agent of agents) {
    try {
      const agentId = agent.toBase58();
      const response = await fetch(
        `${CONFIG.INDEXER_URL}/feedbacks?asset=eq.${agentId}&order=created_at.desc&limit=20`,
        { headers }
      );
      if (response.ok) {
        const data = await response.json();
        result.feedbacksFound += data.length;
        for (const fb of data.slice(0, 3)) {
          result.details.recentFeedbacks.push({
            agentId: agentId.slice(0, 8) + '...',
            score: fb.score,
            tag1: fb.tag1,
          });
        }
      }
    } catch (e: any) {
      result.errors.push(`Feedback check failed: ${e.message}`);
    }
  }

  // Check validations
  for (const agent of agents) {
    try {
      const agentId = agent.toBase58();
      const response = await fetch(
        `${CONFIG.INDEXER_URL}/validations?asset=eq.${agentId}&limit=50`,
        { headers }
      );
      if (response.ok) {
        const data = await response.json();
        result.validationsFound += data.length;
      }
    } catch (e: any) {
      result.errors.push(`Validation check failed: ${e.message}`);
    }
  }

  return result;
}

// ============ MAIN STRESS TEST ============
async function runMassiveStressTest(): Promise<StressReport> {
  console.log('\n' + '='.repeat(60));
  console.log('   MASSIVE STRESS TEST - 8004 Solana Indexer');
  console.log('='.repeat(60));

  // Setup - Use Helius RPC for higher rate limits
  const rpcUrl = process.env.SOLANA_RPC_URL || HELIUS_DEVNET_RPC;
  const indexerUrl = process.env.INDEXER_URL || CONFIG.INDEXER_URL;

  console.log(`\n🔗 RPC: ${rpcUrl.includes('helius') ? 'Helius (high performance)' : 'Public devnet'}`);
  console.log(`📊 Indexer: ${indexerUrl}`);

  // Load wallets
  const walletPath = process.env.SOLANA_WALLET_PATH ||
    path.join(process.env.HOME!, '.config/solana/id.json');
  const mainWallet = loadKeypair(walletPath);

  // Create connection FIRST (needed for funding)
  const connection = new Connection(rpcUrl);

  // Check balance
  const balance = await connection.getBalance(mainWallet.publicKey);
  console.log(`\nMain wallet: ${mainWallet.publicKey.toBase58()}`);
  console.log(`Balance: ${(balance / 1e9).toFixed(4)} SOL`);

  if (balance < 0.5 * 1e9) {
    throw new Error('Insufficient balance for stress test (need ~0.5 SOL)');
  }

  // Create SDK with signer
  const sdk = new SolanaSDK({
    rpcUrl,
    signer: mainWallet,
    indexerUrl,
  });

  // Generate client keypairs that will give feedbacks (different from owner)
  // Feedbacks require: client != agent owner (SelfFeedbackNotAllowed constraint)
  const clientKeypairs: Keypair[] = [];
  const clientSdks: SolanaSDK[] = [];
  const NUM_CLIENTS = 5;  // More clients for parallel feedbacks
  const FUNDING_PER_CLIENT = 0.1 * 1e9; // 0.1 SOL each for more headroom

  console.log(`\n💰 Funding ${NUM_CLIENTS} client wallets (0.05 SOL each)...`);
  const { Transaction, SystemProgram, sendAndConfirmTransaction } = await import('@solana/web3.js');

  for (let i = 0; i < NUM_CLIENTS; i++) {
    const kp = Keypair.generate();
    clientKeypairs.push(kp);

    // Transfer SOL to client for tx fees
    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: mainWallet.publicKey,
          toPubkey: kp.publicKey,
          lamports: FUNDING_PER_CLIENT,
        })
      );
      await sendAndConfirmTransaction(connection, tx, [mainWallet]);
      console.log(`  ✅ Client ${i + 1}: ${kp.publicKey.toBase58().slice(0, 8)}... funded`);
    } catch (e: any) {
      console.log(`  ❌ Client ${i + 1} funding failed: ${e.message}`);
    }

    clientSdks.push(new SolanaSDK({
      rpcUrl,
      signer: kp,
      indexerUrl,
    }));
  }

  // Use first client as validator (has funds from transfer)
  const validator = clientKeypairs[0];
  const validatorSdk = clientSdks[0];

  console.log(`Client SDKs: ${clientSdks.length}`);
  console.log(`Validator: ${validator.publicKey.toBase58()}`);

  // Phase 1: Create agents
  console.log(`\n📦 Phase 1: Creating ${CONFIG.AGENTS_TO_CREATE} agents...`);
  const agents: PublicKey[] = [];

  for (let i = 0; i < CONFIG.AGENTS_TO_CREATE; i++) {
    try {
      const tokenUri = `ipfs://stress_test_${Date.now()}_${i}`;
      const result = await sdk.registerAgent(tokenUri);

      if (result.success && result.asset) {
        agents.push(result.asset);
        console.log(`  ✅ Agent ${i + 1}: ${result.asset.toBase58()}`);

        // Initialize ATOM (may already be initialized during registration)
        try {
          await sdk.initializeAtomStats(result.asset);
        } catch (e) {
          // May already be initialized
        }
      } else {
        console.log(`  ❌ Agent ${i + 1} failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.log(`  ❌ Agent ${i + 1} failed: ${error.message}`);
    }
  }

  if (agents.length === 0) {
    throw new Error('No agents created, cannot continue');
  }

  console.log(`\n✅ Created ${agents.length} agents`);

  // Phase 2: Generate all tasks
  console.log('\n📝 Phase 2: Generating transaction tasks...');

  // Get base collection for URI updates
  const collection = await sdk.getBaseCollection();
  if (!collection) {
    throw new Error('Could not get base collection');
  }
  console.log(`  Collection: ${collection.toBase58()}`);

  // Use CLIENT SDKs for feedbacks (owner cannot give feedback to own agents)
  const feedbackTasks = generateFeedbackTasks(clientSdks, clientKeypairs, agents, CONFIG.FEEDBACKS);
  const metadataTasks = generateMetadataTasks(sdk, agents, CONFIG.METADATA_UPDATES);
  const uriTasks = generateUriUpdateTasks(sdk, agents, collection, CONFIG.URI_UPDATES);
  const validationTasks = generateValidationTasks(sdk, validatorSdk, agents, validator.publicKey, CONFIG.VALIDATIONS);

  // Combine and shuffle for realistic load (feedbacks, metadata, URIs all together)
  const allTasks = shuffle([
    ...feedbackTasks,
    ...metadataTasks,
    ...uriTasks,
  ]);

  const totalTxCount = allTasks.length + validationTasks.length + CONFIG.REVOCATIONS;

  console.log(`\n  📊 TRANSACTION BREAKDOWN:`);
  console.log(`  ├─ Feedbacks: ${feedbackTasks.length} (70% valid, 20% edge, 10% invalid)`);
  console.log(`  ├─ Metadata: ${metadataTasks.length} (40% valid, 15% stress, 15% unicode, 15% edge, 15% invalid)`);
  console.log(`  ├─ URI updates: ${uriTasks.length} (80% valid, 20% edge)`);
  console.log(`  ├─ Validations: ${validationTasks.length} (request + response pairs)`);
  console.log(`  └─ Revocations: ${CONFIG.REVOCATIONS} (will run after feedbacks)`);
  console.log(`  ════════════════════════════════`);
  console.log(`  🔥 TOTAL TRANSACTIONS: ${totalTxCount} 🔥`);

  // Phase 3: Execute main batch
  console.log(`\n🚀 Phase 3: Executing ${allTasks.length} transactions (concurrency: ${CONFIG.CONCURRENCY})...`);
  const startTime = Date.now();

  const results: StressResult[] = [];
  let completed = 0;

  // Execute in batches with progress
  const batchSize = CONFIG.CONCURRENCY;
  for (let i = 0; i < allTasks.length; i += batchSize) {
    const batch = allTasks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(task => task()));
    results.push(...batchResults);

    completed += batch.length;
    const successCount = results.filter(r => r.success).length;
    const progress = ((completed / allTasks.length) * 100).toFixed(1);
    process.stdout.write(`\r  Progress: ${progress}% (${successCount}/${completed} success)`);

    if (i + batchSize < allTasks.length) {
      await sleep(CONFIG.BATCH_DELAY_MS);
    }
  }
  console.log('\n');

  // Phase 4: Execute validations (sequential due to request/response pairs)
  console.log(`\n🔐 Phase 4: Executing ${validationTasks.length} validation transactions...`);
  for (let i = 0; i < validationTasks.length; i += 2) {
    // Request
    const reqResult = await validationTasks[i]();
    results.push(reqResult);

    // Response (if request succeeded)
    if (reqResult.success && i + 1 < validationTasks.length) {
      const respResult = await validationTasks[i + 1]();
      results.push(respResult);
    }

    process.stdout.write(`\r  Progress: ${Math.floor((i + 2) / validationTasks.length * 100)}%`);
  }
  console.log('\n');

  // Phase 5: Execute revocations
  console.log(`\n🗑️ Phase 5: Executing ${CONFIG.REVOCATIONS} feedback revocations...`);

  // Filter feedbacks that were likely successful (from valid/edge operations)
  const successfulFeedbacks = createdFeedbacks.slice(0, Math.min(createdFeedbacks.length, CONFIG.REVOCATIONS * 2));
  const revocationTasks = generateRevocationTasks(
    clientSdks,
    clientKeypairs,
    successfulFeedbacks,
    CONFIG.REVOCATIONS
  );

  // Execute revocations in batches
  for (let i = 0; i < revocationTasks.length; i += CONFIG.CONCURRENCY) {
    const batch = revocationTasks.slice(i, i + CONFIG.CONCURRENCY);
    const batchResults = await Promise.all(batch.map(task => task()));
    results.push(...batchResults);

    const progress = Math.floor(((i + batch.length) / revocationTasks.length) * 100);
    process.stdout.write(`\r  Progress: ${progress}%`);

    if (i + CONFIG.CONCURRENCY < revocationTasks.length) {
      await sleep(CONFIG.BATCH_DELAY_MS);
    }
  }
  console.log('\n');

  const totalDuration = Date.now() - startTime;

  // Generate report
  const report: StressReport = {
    totalTransactions: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    totalDurationMs: totalDuration,
    avgTxDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0) / results.length,
    txPerSecond: results.length / (totalDuration / 1000),
    byOperation: {},
    errors: [],
  };

  // Group by operation
  for (const result of results) {
    if (!report.byOperation[result.operation]) {
      report.byOperation[result.operation] = { total: 0, success: 0, failed: 0 };
    }
    report.byOperation[result.operation].total++;
    if (result.success) {
      report.byOperation[result.operation].success++;
    } else {
      report.byOperation[result.operation].failed++;
      if (result.error && !report.errors.includes(result.error)) {
        report.errors.push(result.error);
      }
    }
  }

  // Print report
  console.log('\n' + '='.repeat(60));
  console.log('   STRESS TEST REPORT');
  console.log('='.repeat(60));
  console.log(`\n📊 Summary:`);
  console.log(`  Total transactions: ${report.totalTransactions}`);
  console.log(`  Successful: ${report.successful} (${(report.successful / report.totalTransactions * 100).toFixed(1)}%)`);
  console.log(`  Failed: ${report.failed}`);
  console.log(`  Duration: ${(report.totalDurationMs / 1000).toFixed(1)}s`);
  console.log(`  Avg tx time: ${report.avgTxDurationMs.toFixed(0)}ms`);
  console.log(`  Throughput: ${report.txPerSecond.toFixed(2)} tx/s`);

  console.log(`\n📈 By Operation:`);
  for (const [op, stats] of Object.entries(report.byOperation)) {
    const successRate = ((stats.success / stats.total) * 100).toFixed(1);
    console.log(`  ${op}: ${stats.success}/${stats.total} (${successRate}%)`);
  }

  if (report.errors.length > 0) {
    console.log(`\n❌ Unique Errors (${report.errors.length}):`);
    for (const error of report.errors.slice(0, 20)) {
      console.log(`  - ${error.slice(0, 200)}`);
    }
  }

  console.log('\n' + '='.repeat(60));

  // Phase 5: Verify data via Indexer
  console.log('\n🔍 Phase 5: Verifying data via Indexer...');
  console.log('  Waiting 10s for indexer to catch up...');
  await sleep(10000);

  const indexerVerification = await verifyIndexerData(agents, mainWallet.publicKey, clientKeypairs);
  console.log(`\n📊 Indexer Verification:`);
  console.log(`  Agents indexed: ${indexerVerification.agentsFound}/${agents.length}`);
  console.log(`  Feedbacks indexed: ${indexerVerification.feedbacksFound}`);
  console.log(`  Expected feedbacks: ~${CONFIG.FEEDBACKS}`);
  console.log(`  Validation requests: ${indexerVerification.validationsFound}`);

  if (indexerVerification.errors.length > 0) {
    console.log(`  ⚠️ Verification issues:`);
    for (const err of indexerVerification.errors.slice(0, 5)) {
      console.log(`    - ${err}`);
    }
  }

  if (indexerVerification.agentsFound === agents.length &&
      indexerVerification.feedbacksFound > 0) {
    console.log(`\n  ✅ Indexer data is coherent!`);
  } else {
    console.log(`\n  ⚠️ Some data may still be syncing...`);
  }

  // Phase 6: Recover funds from client wallets
  console.log('\n💸 Phase 6: Recovering funds from client wallets...');
  let totalRecovered = 0;

  for (let i = 0; i < clientKeypairs.length; i++) {
    const kp = clientKeypairs[i];
    try {
      const clientBalance = await connection.getBalance(kp.publicKey);
      if (clientBalance > 5000) { // Keep min for rent
        const amountToRecover = clientBalance - 5000;
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: kp.publicKey,
            toPubkey: mainWallet.publicKey,
            lamports: amountToRecover,
          })
        );
        await sendAndConfirmTransaction(connection, tx, [kp]);
        totalRecovered += amountToRecover;
        console.log(`  ✅ Client ${i + 1}: recovered ${(amountToRecover / 1e9).toFixed(4)} SOL`);
      }
    } catch (e: any) {
      console.log(`  ⚠️ Client ${i + 1}: ${e.message.slice(0, 50)}`);
    }
  }

  console.log(`\n💰 Total recovered: ${(totalRecovered / 1e9).toFixed(4)} SOL`);
  const finalBalance = await connection.getBalance(mainWallet.publicKey);
  console.log(`📊 Final balance: ${(finalBalance / 1e9).toFixed(4)} SOL`);

  return report;
}

// Run if called directly
runMassiveStressTest()
  .then(report => {
    console.log('\n✅ Stress test completed!');
    process.exit(report.failed > report.totalTransactions * 0.1 ? 1 : 0);
  })
  .catch(error => {
    console.error('\n❌ Stress test failed:', error.message);
    process.exit(1);
  });
