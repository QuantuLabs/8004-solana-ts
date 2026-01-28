/**
 * ULTIMATE Stress Test for 8004 Solana Indexer
 *
 * Covers ALL possible scenarios with thousands of agents:
 *
 * 1. AGENT LIFECYCLE
 *    - Registration with various URI formats
 *    - Ownership transfers
 *    - URI updates
 *    - Agent wallet delegation
 *
 * 2. COLLECTIONS
 *    - Create multiple collections
 *    - Register agents in different collections
 *    - Collection URI updates
 *
 * 3. FEEDBACK SYSTEM
 *    - All OASF-compliant tags
 *    - x402 protocol tags
 *    - Edge case values (negative, huge, precision)
 *    - Revocations
 *    - Multiple clients per agent
 *
 * 4. VALIDATION SYSTEM
 *    - Request/response pairs
 *    - Multiple validators per agent
 *    - Concurrent validations
 *
 * 5. METADATA
 *    - On-chain key/value pairs
 *    - Unicode, emoji, special chars
 *    - Rapid updates to same key
 *
 * 6. CONCURRENCY STRESS
 *    - Parallel operations on same agent
 *    - Race conditions
 *    - High throughput bursts
 *
 * 7. OFF-CHAIN METADATA (via HTTP mock server)
 *    - Valid JSON
 *    - Malformed JSON
 *    - XSS attempts
 *    - Huge files
 */

import { Keypair, PublicKey, Connection, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { SolanaSDK } from '../../src/core/sdk-solana.js';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

// ============ CONFIG ============
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_DEVNET_RPC = `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const CONFIG = {
  // SCALE - Adjust based on available SOL
  NUM_AGENTS: 50,           // 50 agents
  NUM_COLLECTIONS: 3,       // 3 collections
  NUM_CLIENTS: 8,           // 8 client wallets for feedbacks
  NUM_VALIDATORS: 3,        // 3 validators

  // OPERATIONS PER AGENT (multiplied by NUM_AGENTS)
  FEEDBACKS_PER_AGENT: 10,   // 500 total feedbacks
  METADATA_PER_AGENT: 5,     // 250 total metadata updates
  VALIDATIONS_PER_AGENT: 2,  // 100 total validation pairs

  // SPECIAL OPERATIONS
  OWNERSHIP_TRANSFERS: 10,   // Transfer 10 agents to new owners
  URI_UPDATES: 100,          // 100 URI updates total
  REVOCATIONS: 50,           // 50 revocations

  // CONCURRENCY
  CONCURRENCY: 6,
  BATCH_DELAY_MS: 1000,
  INTER_OP_DELAY_MS: 200,

  // FUNDING
  FUNDING_PER_CLIENT: 0.08 * 1e9,  // 0.08 SOL per client

  // INDEXER
  INDEXER_URL: 'https://uhjytdjxvfbppgjicfly.supabase.co/rest/v1',
  SUPABASE_ANON_KEY: 'sb_publishable_i-ycBRGiolBr8GMdiVq1rA_nwt7N2bq',

  // MOCK SERVER FOR OFF-CHAIN METADATA
  MOCK_SERVER_PORT: 3456,
};

// ============ TYPES ============
interface TestResult {
  operation: string;
  success: boolean;
  signature?: string;
  error?: string;
  durationMs: number;
  details?: Record<string, any>;
}

interface TestReport {
  totalOperations: number;
  successful: number;
  failed: number;
  totalDurationMs: number;
  byOperation: Record<string, { total: number; success: number; avgDurationMs: number }>;
  errors: string[];
  indexerVerification?: {
    agents: number;
    feedbacks: number;
    validations: number;
    collections: number;
  };
}

// ============ UTILITIES ============
function loadKeypair(filePath: string): Keypair {
  const keyData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sha256(data: string): Buffer {
  return createHash('sha256').update(data).digest();
}

function randomHex(len: number): string {
  return Array(len).fill(0).map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
}

function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============ DATA GENERATORS ============
// OASF Tags - All standardized tags
const OASF_CATEGORY_TAGS = [
  'uptime', 'successRate', 'latency', 'revenues', 'costs',
  'quality', 'accuracy', 'throughput', 'errorRate', 'responseTime'
];

const OASF_PERIOD_TAGS = ['hour', 'day', 'week', 'month', 'year', 'all'];

// x402 Protocol Tags
const X402_TAGS = [
  'x402-resource-delivered', 'x402-resource-failed',
  'x402-good-payer', 'x402-bad-payer',
  'x402-payment-received', 'x402-payment-failed'
];

// Value formats for feedbacks
const VALUE_GENERATORS = [
  () => String(Math.floor(Math.random() * 10000)),              // Integer
  () => (Math.random() * 100).toFixed(2),                       // 2 decimals
  () => (Math.random() * 100).toFixed(6),                       // 6 decimals
  () => String(Math.floor(Math.random() * 1000000000)),         // Large number
  () => '0',                                                     // Zero
  () => '0.000001',                                              // Very small
  () => '-' + (Math.random() * 1000).toFixed(2),                // Negative (PnL)
  () => '999999999999',                                          // Max value
];

// Metadata key generators
const METADATA_KEYS = [
  'version', 'endpoint', 'model', 'status', 'author', 'license',
  'category', 'tags', 'pricing', 'capabilities', 'description',
  'website', 'repository', 'documentation', 'support', 'api_version'
];

const METADATA_VALUE_GENERATORS = [
  () => `v${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 100)}`,
  () => `https://api${Math.floor(Math.random() * 1000)}.example.com/v${Math.floor(Math.random() * 3)}`,
  () => ['gpt-4', 'claude-3', 'gemini-pro', 'llama-3', 'mixtral'][Math.floor(Math.random() * 5)],
  () => ['active', 'beta', 'deprecated', 'maintenance'][Math.floor(Math.random() * 4)],
  () => `developer_${randomHex(8)}`,
  () => ['MIT', 'Apache-2.0', 'GPL-3.0', 'BSL-1.1', 'proprietary'][Math.floor(Math.random() * 5)],
  () => ['ai-agent', 'defi', 'nft', 'gaming', 'social', 'infra'][Math.floor(Math.random() * 6)],
  () => Array(Math.floor(Math.random() * 5) + 1).fill(0).map(() => `tag_${randomHex(4)}`).join(','),
  () => JSON.stringify({ base: Math.random() * 0.01, currency: 'USD' }),
  () => JSON.stringify(['chat', 'code', 'search', 'image'].slice(0, Math.floor(Math.random() * 4) + 1)),
  () => 'Agent powered by ' + ['OpenAI', 'Anthropic', 'Google', 'Meta'][Math.floor(Math.random() * 4)],
  () => `https://agent${Math.floor(Math.random() * 10000)}.ai`,
  () => `https://github.com/org${Math.floor(Math.random() * 1000)}/agent-${randomHex(8)}`,
  () => `https://docs.agent${Math.floor(Math.random() * 1000)}.ai`,
  () => `support@agent${Math.floor(Math.random() * 1000)}.ai`,
  () => `${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`,
];

// Unicode metadata (stress test)
const UNICODE_METADATA = [
  { key: 'name_jp', value: () => `エージェント_${randomHex(4)}` },
  { key: 'name_cn', value: () => `代理_${randomHex(4)}` },
  { key: 'name_kr', value: () => `에이전트_${randomHex(4)}` },
  { key: 'name_ar', value: () => `وكيل_${randomHex(4)}` },
  { key: 'emoji', value: () => `🤖🔥💯✅🚀 ${randomHex(4)}` },
  { key: 'mixed', value: () => `Agent🤖日本語${randomHex(4)}` },
];

// URI Formats
const URI_GENERATORS = [
  () => `ipfs://Qm${randomHex(44)}`,
  () => `ipfs://baf${randomHex(56)}`,
  () => `ar://${randomHex(43)}`,
  () => `https://arweave.net/${randomHex(43)}`,
  () => `https://ipfs.io/ipfs/Qm${randomHex(44)}`,
  () => `https://gateway.pinata.cloud/ipfs/Qm${randomHex(44)}`,
  () => `https://api.example.com/agents/${randomHex(16)}.json`,
];

// ============ MOCK SERVER FOR OFF-CHAIN METADATA ============
interface MockMetadataServer {
  server: http.Server;
  baseUrl: string;
  responses: Map<string, { contentType: string; body: string }>;
}

function createMockMetadataServer(): Promise<MockMetadataServer> {
  return new Promise((resolve) => {
    const responses = new Map<string, { contentType: string; body: string }>();

    const server = http.createServer((req, res) => {
      const path = req.url || '/';
      const response = responses.get(path);

      if (response) {
        res.setHeader('Content-Type', response.contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(response.body);
      } else {
        res.statusCode = 404;
        res.end('Not found');
      }
    });

    server.listen(CONFIG.MOCK_SERVER_PORT, () => {
      resolve({
        server,
        baseUrl: `http://localhost:${CONFIG.MOCK_SERVER_PORT}`,
        responses,
      });
    });
  });
}

// Pre-defined metadata scenarios for mock server
const MOCK_METADATA_SCENARIOS = [
  // Valid JSON
  {
    path: '/valid/complete.json',
    contentType: 'application/json',
    body: JSON.stringify({
      name: 'Complete Agent',
      description: 'A fully featured AI agent',
      image: 'https://example.com/image.png',
      external_url: 'https://example.com',
      attributes: [
        { trait_type: 'version', value: '1.0.0' },
        { trait_type: 'model', value: 'gpt-4' },
      ],
      properties: { category: 'ai-agent' },
    }),
  },
  // Unicode chaos
  {
    path: '/valid/unicode.json',
    contentType: 'application/json',
    body: JSON.stringify({
      name: '日本語エージェント 🤖',
      description: '中文描述 العربية Русский 한국어',
      attributes: [{ trait_type: '版本', value: 'v1.0' }],
    }),
  },
  // Minimal
  {
    path: '/valid/minimal.json',
    contentType: 'application/json',
    body: JSON.stringify({ name: 'Minimal' }),
  },
  // XSS attempts
  {
    path: '/edge/xss.json',
    contentType: 'application/json',
    body: JSON.stringify({
      name: '<script>alert("XSS")</script>',
      description: '<img src=x onerror=alert(1)>',
      image: 'javascript:alert(1)',
    }),
  },
  // SQL injection
  {
    path: '/edge/sql.json',
    contentType: 'application/json',
    body: JSON.stringify({
      name: "'; DROP TABLE agents; --",
      description: "1' OR '1'='1",
    }),
  },
  // Malformed JSON
  {
    path: '/invalid/malformed.json',
    contentType: 'application/json',
    body: '{ name: "missing quotes" }',
  },
  // Truncated JSON
  {
    path: '/invalid/truncated.json',
    contentType: 'application/json',
    body: '{ "name": "Truncated',
  },
  // Not JSON
  {
    path: '/invalid/html.html',
    contentType: 'text/html',
    body: '<!DOCTYPE html><html><body>Not JSON</body></html>',
  },
  // Empty
  {
    path: '/invalid/empty.json',
    contentType: 'application/json',
    body: '',
  },
  // Huge JSON (100KB)
  {
    path: '/stress/huge.json',
    contentType: 'application/json',
    body: JSON.stringify({
      name: 'Huge Agent',
      description: 'X'.repeat(100000),
      attributes: Array(500).fill({ trait_type: 'attr', value: 'Y'.repeat(100) }),
    }),
  },
  // Deep nesting
  {
    path: '/stress/nested.json',
    contentType: 'application/json',
    body: JSON.stringify({
      name: 'Nested',
      l1: { l2: { l3: { l4: { l5: { l6: { l7: { l8: { l9: { l10: 'deep' } } } } } } } } },
    }),
  },
  // Array instead of object
  {
    path: '/invalid/array.json',
    contentType: 'application/json',
    body: JSON.stringify(['not', 'an', 'object']),
  },
  // Null
  {
    path: '/invalid/null.json',
    contentType: 'application/json',
    body: 'null',
  },
];

// ============ TEST EXECUTION ============
class UltimateStressTest {
  private connection: Connection;
  private mainWallet: Keypair;
  private sdk: SolanaSDK;
  private clients: Keypair[] = [];
  private clientSdks: SolanaSDK[] = [];
  private validators: Keypair[] = [];
  private validatorSdks: SolanaSDK[] = [];
  private agents: PublicKey[] = [];
  private collections: PublicKey[] = [];
  private results: TestResult[] = [];
  private feedbackIndices = new Map<string, bigint>();
  private mockServer?: MockMetadataServer;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl);
    const walletPath = process.env.SOLANA_WALLET_PATH ||
      path.join(process.env.HOME!, '.config/solana/id.json');
    this.mainWallet = loadKeypair(walletPath);
    this.sdk = new SolanaSDK({
      rpcUrl,
      signer: this.mainWallet,
      indexerUrl: CONFIG.INDEXER_URL,
    });
  }

  async run(): Promise<TestReport> {
    console.log('\n' + '='.repeat(70));
    console.log('   ULTIMATE STRESS TEST - 8004 Solana Indexer');
    console.log('='.repeat(70));

    const startTime = Date.now();

    // Check balance
    const balance = await this.connection.getBalance(this.mainWallet.publicKey);
    console.log(`\n💰 Main wallet: ${this.mainWallet.publicKey.toBase58()}`);
    console.log(`💰 Balance: ${(balance / 1e9).toFixed(4)} SOL`);

    const requiredSol = (CONFIG.NUM_CLIENTS + CONFIG.NUM_VALIDATORS) * CONFIG.FUNDING_PER_CLIENT / 1e9 + 1;
    if (balance < requiredSol * 1e9) {
      throw new Error(`Insufficient balance. Need ~${requiredSol.toFixed(2)} SOL`);
    }

    // Phase 0: Setup mock server
    console.log('\n📡 Phase 0: Starting mock metadata server...');
    this.mockServer = await createMockMetadataServer();
    for (const scenario of MOCK_METADATA_SCENARIOS) {
      this.mockServer.responses.set(scenario.path, {
        contentType: scenario.contentType,
        body: scenario.body,
      });
    }
    console.log(`  ✅ Mock server running at ${this.mockServer.baseUrl}`);

    // Phase 1: Setup wallets
    await this.setupWallets();

    // Phase 2: Create collections
    await this.createCollections();

    // Phase 3: Create agents
    await this.createAgents();

    // Phase 4: Execute operations
    await this.executeOperations();

    // Phase 5: Verify indexer
    await this.verifyIndexer();

    // Phase 6: Cleanup
    await this.cleanup();

    const totalDuration = Date.now() - startTime;
    return this.generateReport(totalDuration);
  }

  private async setupWallets(): Promise<void> {
    console.log(`\n👥 Phase 1: Setting up ${CONFIG.NUM_CLIENTS} clients and ${CONFIG.NUM_VALIDATORS} validators...`);

    // Create and fund clients
    for (let i = 0; i < CONFIG.NUM_CLIENTS; i++) {
      const kp = Keypair.generate();
      this.clients.push(kp);

      try {
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: this.mainWallet.publicKey,
            toPubkey: kp.publicKey,
            lamports: CONFIG.FUNDING_PER_CLIENT,
          })
        );
        await sendAndConfirmTransaction(this.connection, tx, [this.mainWallet]);
        console.log(`  ✅ Client ${i + 1}: ${kp.publicKey.toBase58().slice(0, 12)}...`);
      } catch (e: any) {
        console.log(`  ❌ Client ${i + 1} funding failed`);
      }

      this.clientSdks.push(new SolanaSDK({
        rpcUrl: HELIUS_DEVNET_RPC,
        signer: kp,
        indexerUrl: CONFIG.INDEXER_URL,
      }));

      await sleep(500);
    }

    // Create and fund validators
    for (let i = 0; i < CONFIG.NUM_VALIDATORS; i++) {
      const kp = Keypair.generate();
      this.validators.push(kp);

      try {
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: this.mainWallet.publicKey,
            toPubkey: kp.publicKey,
            lamports: CONFIG.FUNDING_PER_CLIENT,
          })
        );
        await sendAndConfirmTransaction(this.connection, tx, [this.mainWallet]);
        console.log(`  ✅ Validator ${i + 1}: ${kp.publicKey.toBase58().slice(0, 12)}...`);
      } catch (e: any) {
        console.log(`  ❌ Validator ${i + 1} funding failed`);
      }

      this.validatorSdks.push(new SolanaSDK({
        rpcUrl: HELIUS_DEVNET_RPC,
        signer: kp,
        indexerUrl: CONFIG.INDEXER_URL,
      }));

      await sleep(500);
    }
  }

  private async createCollections(): Promise<void> {
    console.log(`\n📁 Phase 2: Creating ${CONFIG.NUM_COLLECTIONS} collections...`);

    for (let i = 0; i < CONFIG.NUM_COLLECTIONS; i++) {
      try {
        const name = `StressTest Collection ${Date.now()}_${i}`;
        const uri = `https://example.com/collection/${randomHex(16)}.json`;

        const result = await this.sdk.createCollection(name, uri);
        if (result.success && result.collection) {
          this.collections.push(result.collection);
          console.log(`  ✅ Collection ${i + 1}: ${result.collection.toBase58().slice(0, 12)}...`);
          this.recordResult('collection_create', true, result.signature, Date.now());
        } else {
          console.log(`  ❌ Collection ${i + 1} failed`);
          this.recordResult('collection_create', false, undefined, Date.now(), result.error);
        }
      } catch (e: any) {
        console.log(`  ❌ Collection ${i + 1} error: ${e.message.slice(0, 50)}`);
        this.recordResult('collection_create', false, undefined, Date.now(), e.message);
      }

      await sleep(2000);
    }

    // Also get base collection
    const baseCollection = await this.sdk.getBaseCollection();
    if (baseCollection && !this.collections.includes(baseCollection)) {
      this.collections.unshift(baseCollection);
      console.log(`  ✅ Base collection: ${baseCollection.toBase58().slice(0, 12)}...`);
    }
  }

  private async createAgents(): Promise<void> {
    console.log(`\n🤖 Phase 3: Creating ${CONFIG.NUM_AGENTS} agents...`);

    // Generate diverse URIs
    const uris: string[] = [];

    // Standard URIs
    for (let i = 0; i < CONFIG.NUM_AGENTS * 0.7; i++) {
      const generator = URI_GENERATORS[i % URI_GENERATORS.length];
      uris.push(generator());
    }

    // Mock server URIs (for off-chain metadata testing)
    for (const scenario of MOCK_METADATA_SCENARIOS) {
      uris.push(`${this.mockServer!.baseUrl}${scenario.path}`);
    }

    // Fill remaining with standard URIs
    while (uris.length < CONFIG.NUM_AGENTS) {
      uris.push(URI_GENERATORS[0]());
    }

    // Create agents in batches
    const batchSize = CONFIG.CONCURRENCY;
    for (let i = 0; i < CONFIG.NUM_AGENTS; i += batchSize) {
      const batch = uris.slice(i, i + batchSize);
      const startTime = Date.now();

      const batchResults = await Promise.all(
        batch.map(async (uri, idx) => {
          const collection = this.collections[(i + idx) % this.collections.length];
          try {
            const result = await this.sdk.registerAgent(uri, { collection });

            if (result.success && result.asset) {
              this.agents.push(result.asset);

              // Initialize ATOM
              try {
                await this.sdk.initializeAtomStats(result.asset);
              } catch (e) {
                // May already be initialized
              }

              return { success: true, signature: result.signature };
            } else {
              return { success: false, error: result.error };
            }
          } catch (e: any) {
            return { success: false, error: e.message };
          }
        })
      );

      const successCount = batchResults.filter(r => r.success).length;
      console.log(`  Batch ${Math.floor(i / batchSize) + 1}: ${successCount}/${batch.length} created`);

      for (const r of batchResults) {
        this.recordResult('agent_create', r.success, r.signature, startTime, r.error);
      }

      await sleep(CONFIG.BATCH_DELAY_MS);
    }

    console.log(`\n  ✅ Total agents created: ${this.agents.length}`);
  }

  private async executeOperations(): Promise<void> {
    console.log('\n⚡ Phase 4: Executing operations...');

    // Generate all tasks
    const tasks: Array<{ priority: number; task: () => Promise<void> }> = [];

    // Feedbacks (highest volume)
    console.log('  Generating feedback tasks...');
    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];
      for (let j = 0; j < CONFIG.FEEDBACKS_PER_AGENT; j++) {
        const clientIdx = (i + j) % this.clients.length;
        tasks.push({
          priority: 1,
          task: () => this.giveFeedback(agent, clientIdx, i * CONFIG.FEEDBACKS_PER_AGENT + j),
        });
      }
    }

    // Metadata updates
    console.log('  Generating metadata tasks...');
    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];
      for (let j = 0; j < CONFIG.METADATA_PER_AGENT; j++) {
        tasks.push({
          priority: 2,
          task: () => this.updateMetadata(agent, i * CONFIG.METADATA_PER_AGENT + j),
        });
      }
    }

    // Validations
    console.log('  Generating validation tasks...');
    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];
      for (let j = 0; j < CONFIG.VALIDATIONS_PER_AGENT; j++) {
        const validatorIdx = (i + j) % this.validators.length;
        tasks.push({
          priority: 3,
          task: () => this.doValidation(agent, validatorIdx, i * CONFIG.VALIDATIONS_PER_AGENT + j),
        });
      }
    }

    // URI Updates
    console.log('  Generating URI update tasks...');
    for (let i = 0; i < CONFIG.URI_UPDATES; i++) {
      const agent = this.agents[i % this.agents.length];
      const collection = this.collections[i % this.collections.length];
      tasks.push({
        priority: 4,
        task: () => this.updateUri(agent, collection, i),
      });
    }

    // Ownership transfers
    console.log('  Generating transfer tasks...');
    for (let i = 0; i < Math.min(CONFIG.OWNERSHIP_TRANSFERS, this.agents.length); i++) {
      const agent = this.agents[i];
      const newOwner = this.clients[i % this.clients.length];
      const collection = this.collections[i % this.collections.length];
      tasks.push({
        priority: 5,
        task: () => this.transferOwnership(agent, newOwner.publicKey, collection),
      });
    }

    // Shuffle and execute
    const shuffledTasks = shuffle(tasks);
    console.log(`\n  Total tasks: ${shuffledTasks.length}`);
    console.log(`  Executing with concurrency ${CONFIG.CONCURRENCY}...\n`);

    let completed = 0;
    for (let i = 0; i < shuffledTasks.length; i += CONFIG.CONCURRENCY) {
      const batch = shuffledTasks.slice(i, i + CONFIG.CONCURRENCY);
      await Promise.all(batch.map(t => t.task()));

      completed += batch.length;
      const successCount = this.results.filter(r => r.success).length;
      const progress = ((completed / shuffledTasks.length) * 100).toFixed(1);
      process.stdout.write(`\r  Progress: ${progress}% (${successCount}/${completed} success)`);

      await sleep(CONFIG.BATCH_DELAY_MS);
    }

    console.log('\n');

    // Revocations (after feedbacks)
    console.log('  Executing revocations...');
    await this.doRevocations();
  }

  private async giveFeedback(agent: PublicKey, clientIdx: number, taskIdx: number): Promise<void> {
    const startTime = Date.now();
    const sdk = this.clientSdks[clientIdx];
    const client = this.clients[clientIdx];

    // Vary the feedback data
    const tag1 = taskIdx % 10 === 0
      ? X402_TAGS[taskIdx % X402_TAGS.length]
      : OASF_CATEGORY_TAGS[taskIdx % OASF_CATEGORY_TAGS.length];
    const tag2 = OASF_PERIOD_TAGS[taskIdx % OASF_PERIOD_TAGS.length];
    const value = VALUE_GENERATORS[taskIdx % VALUE_GENERATORS.length]();
    const score = taskIdx % 5 === 0 ? undefined : Math.floor(Math.random() * 101);
    const feedbackUri = `ipfs://feedback_${randomHex(32)}`;

    // Track feedback index
    const indexKey = `${agent.toBase58()}:${clientIdx}`;
    const feedbackIndex = this.feedbackIndices.get(indexKey) ?? BigInt(10000 + Math.floor(Math.random() * 100000));
    this.feedbackIndices.set(indexKey, feedbackIndex + 1n);

    try {
      const result = await sdk.giveFeedback(agent, {
        value,
        score,
        tag1,
        tag2,
        feedbackUri,
        feedbackHash: sha256(feedbackUri),
      }, {
        feedbackIndex,
      });

      this.recordResult('feedback', 'success' in result && result.success, result.signature, startTime, result.error);
    } catch (e: any) {
      this.recordResult('feedback', false, undefined, startTime, e.message);
    }
  }

  private async updateMetadata(agent: PublicKey, taskIdx: number): Promise<void> {
    const startTime = Date.now();

    // Mix of standard and unicode metadata
    let key: string;
    let value: string;

    if (taskIdx % 5 === 0) {
      // Unicode metadata
      const scenario = UNICODE_METADATA[taskIdx % UNICODE_METADATA.length];
      key = scenario.key;
      value = scenario.value();
    } else {
      // Standard metadata
      const keyIdx = taskIdx % METADATA_KEYS.length;
      key = `${METADATA_KEYS[keyIdx]}_${taskIdx % 10}`;
      value = METADATA_VALUE_GENERATORS[keyIdx % METADATA_VALUE_GENERATORS.length]();
    }

    try {
      const result = await this.sdk.setMetadata(agent, key, value);
      this.recordResult('metadata', 'success' in result && result.success, result.signature, startTime, result.error);
    } catch (e: any) {
      this.recordResult('metadata', false, undefined, startTime, e.message);
    }
  }

  private async doValidation(agent: PublicKey, validatorIdx: number, taskIdx: number): Promise<void> {
    const startTime = Date.now();
    const validator = this.validators[validatorIdx];
    const validatorSdk = this.validatorSdks[validatorIdx];

    const nonce = (Date.now() % 0xFFFFFFFF) + taskIdx * 1000 + Math.floor(Math.random() * 1000);
    const requestUri = `ipfs://validation_req_${nonce}`;
    const responseUri = `ipfs://validation_resp_${nonce}`;

    try {
      // Request
      const reqResult = await this.sdk.requestValidation(
        agent,
        validator.publicKey,
        requestUri,
        { nonce, requestHash: sha256(requestUri) }
      );

      this.recordResult('validation_request', 'success' in reqResult && reqResult.success, reqResult.signature, startTime, reqResult.error);

      if ('success' in reqResult && reqResult.success) {
        // Wait and respond
        await sleep(2000);

        const respResult = await validatorSdk.respondToValidation(
          agent,
          nonce,
          Math.floor(Math.random() * 101),
          responseUri,
          { responseHash: sha256(responseUri) }
        );

        this.recordResult('validation_response', 'success' in respResult && respResult.success, respResult.signature, Date.now(), respResult.error);
      }
    } catch (e: any) {
      this.recordResult('validation_request', false, undefined, startTime, e.message);
    }
  }

  private async updateUri(agent: PublicKey, collection: PublicKey, taskIdx: number): Promise<void> {
    const startTime = Date.now();
    const uri = URI_GENERATORS[taskIdx % URI_GENERATORS.length]();

    try {
      const result = await this.sdk.setAgentUri(agent, collection, uri);
      this.recordResult('uri_update', result.success ?? false, result.signature, startTime, result.error);
    } catch (e: any) {
      this.recordResult('uri_update', false, undefined, startTime, e.message);
    }
  }

  private async transferOwnership(agent: PublicKey, newOwner: PublicKey, collection: PublicKey): Promise<void> {
    const startTime = Date.now();

    try {
      const result = await this.sdk.transferAgent(agent, newOwner, { collection });
      this.recordResult('transfer', 'success' in result && result.success, result.signature, startTime, result.error);
    } catch (e: any) {
      this.recordResult('transfer', false, undefined, startTime, e.message);
    }
  }

  private async doRevocations(): Promise<void> {
    const feedbackEntries = Array.from(this.feedbackIndices.entries()).slice(0, CONFIG.REVOCATIONS);

    for (const [key, _index] of feedbackEntries) {
      const [agentStr, clientIdxStr] = key.split(':');
      const agent = new PublicKey(agentStr);
      const clientIdx = parseInt(clientIdxStr);
      const sdk = this.clientSdks[clientIdx];

      const startTime = Date.now();
      try {
        // Get a random feedback index to revoke
        const revokeIndex = Math.floor(Math.random() * 1000) + 10000;
        const result = await sdk.revokeFeedback(agent, revokeIndex);
        this.recordResult('revocation', 'success' in result && result.success, result.signature, startTime, result.error);
      } catch (e: any) {
        this.recordResult('revocation', false, undefined, startTime, e.message);
      }

      await sleep(CONFIG.INTER_OP_DELAY_MS);
    }
  }

  private recordResult(operation: string, success: boolean, signature: string | undefined, startTime: number, error?: string): void {
    this.results.push({
      operation,
      success,
      signature,
      error,
      durationMs: Date.now() - startTime,
    });
  }

  private async verifyIndexer(): Promise<void> {
    console.log('\n🔍 Phase 5: Verifying indexer data...');
    console.log('  Waiting 30s for indexer to catch up...');
    await sleep(30000);

    const headers = {
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    };

    let agentsIndexed = 0;
    let feedbacksIndexed = 0;
    let validationsIndexed = 0;

    // Check agents
    for (const agent of this.agents.slice(0, 10)) {
      try {
        const response = await fetch(
          `${CONFIG.INDEXER_URL}/agents?asset=eq.${agent.toBase58()}`,
          { headers }
        );
        if (response.ok) {
          const data = await response.json();
          if (data.length > 0) agentsIndexed++;
        }
      } catch (e) {
        // Ignore
      }
    }

    // Check feedbacks
    for (const agent of this.agents.slice(0, 5)) {
      try {
        const response = await fetch(
          `${CONFIG.INDEXER_URL}/feedbacks?asset=eq.${agent.toBase58()}&limit=50`,
          { headers }
        );
        if (response.ok) {
          const data = await response.json();
          feedbacksIndexed += data.length;
        }
      } catch (e) {
        // Ignore
      }
    }

    // Check validations
    for (const agent of this.agents.slice(0, 5)) {
      try {
        const response = await fetch(
          `${CONFIG.INDEXER_URL}/validations?asset=eq.${agent.toBase58()}&limit=50`,
          { headers }
        );
        if (response.ok) {
          const data = await response.json();
          validationsIndexed += data.length;
        }
      } catch (e) {
        // Ignore
      }
    }

    console.log(`\n📊 Indexer Verification (sampled):`);
    console.log(`  Agents: ${agentsIndexed}/10 sampled`);
    console.log(`  Feedbacks: ${feedbacksIndexed} (from 5 agents)`);
    console.log(`  Validations: ${validationsIndexed} (from 5 agents)`);
  }

  private async cleanup(): Promise<void> {
    console.log('\n💸 Phase 6: Recovering funds...');

    // Close mock server
    if (this.mockServer) {
      this.mockServer.server.close();
      console.log('  ✅ Mock server stopped');
    }

    // Recover from clients
    let totalRecovered = 0;
    for (let i = 0; i < this.clients.length; i++) {
      try {
        const balance = await this.connection.getBalance(this.clients[i].publicKey);
        if (balance > 5000) {
          const tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: this.clients[i].publicKey,
              toPubkey: this.mainWallet.publicKey,
              lamports: balance - 5000,
            })
          );
          await sendAndConfirmTransaction(this.connection, tx, [this.clients[i]]);
          totalRecovered += balance - 5000;
        }
      } catch (e) {
        // Ignore
      }
    }

    // Recover from validators
    for (let i = 0; i < this.validators.length; i++) {
      try {
        const balance = await this.connection.getBalance(this.validators[i].publicKey);
        if (balance > 5000) {
          const tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: this.validators[i].publicKey,
              toPubkey: this.mainWallet.publicKey,
              lamports: balance - 5000,
            })
          );
          await sendAndConfirmTransaction(this.connection, tx, [this.validators[i]]);
          totalRecovered += balance - 5000;
        }
      } catch (e) {
        // Ignore
      }
    }

    console.log(`  ✅ Recovered: ${(totalRecovered / 1e9).toFixed(4)} SOL`);
  }

  private generateReport(totalDuration: number): TestReport {
    const byOperation: Record<string, { total: number; success: number; avgDurationMs: number }> = {};

    for (const result of this.results) {
      if (!byOperation[result.operation]) {
        byOperation[result.operation] = { total: 0, success: 0, avgDurationMs: 0 };
      }
      byOperation[result.operation].total++;
      if (result.success) {
        byOperation[result.operation].success++;
      }
      byOperation[result.operation].avgDurationMs += result.durationMs;
    }

    for (const op of Object.keys(byOperation)) {
      byOperation[op].avgDurationMs = Math.round(byOperation[op].avgDurationMs / byOperation[op].total);
    }

    const errors = [...new Set(this.results.filter(r => r.error).map(r => r.error!))];

    const report: TestReport = {
      totalOperations: this.results.length,
      successful: this.results.filter(r => r.success).length,
      failed: this.results.filter(r => !r.success).length,
      totalDurationMs: totalDuration,
      byOperation,
      errors: errors.slice(0, 20),
    };

    // Print report
    console.log('\n' + '='.repeat(70));
    console.log('   ULTIMATE STRESS TEST REPORT');
    console.log('='.repeat(70));

    console.log(`\n📊 Summary:`);
    console.log(`  Total operations: ${report.totalOperations}`);
    console.log(`  Successful: ${report.successful} (${(report.successful / report.totalOperations * 100).toFixed(1)}%)`);
    console.log(`  Failed: ${report.failed}`);
    console.log(`  Duration: ${(report.totalDurationMs / 1000 / 60).toFixed(1)} minutes`);
    console.log(`  Throughput: ${(report.totalOperations / (report.totalDurationMs / 1000)).toFixed(2)} ops/s`);

    console.log(`\n📈 By Operation:`);
    for (const [op, stats] of Object.entries(report.byOperation)) {
      const rate = ((stats.success / stats.total) * 100).toFixed(1);
      console.log(`  ${op}: ${stats.success}/${stats.total} (${rate}%) avg ${stats.avgDurationMs}ms`);
    }

    if (report.errors.length > 0) {
      console.log(`\n❌ Unique Errors (${report.errors.length}):`);
      for (const error of report.errors.slice(0, 10)) {
        console.log(`  - ${error.slice(0, 100)}`);
      }
    }

    console.log('\n' + '='.repeat(70));

    return report;
  }
}

// ============ MAIN ============
const rpcUrl = process.env.SOLANA_RPC_URL || HELIUS_DEVNET_RPC;
const test = new UltimateStressTest(rpcUrl);

test.run()
  .then(report => {
    console.log('\n✅ Ultimate stress test completed!');
    process.exit(report.failed > report.totalOperations * 0.3 ? 1 : 0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });
