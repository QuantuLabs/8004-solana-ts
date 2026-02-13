/**
 * Off-Chain Metadata Stress Test for 8004 Solana Indexer
 *
 * Tests how the indexer handles various weird/malformed JSON metadata
 * when fetching tokenUri content.
 *
 * Scenarios:
 * - Valid JSON with edge case content
 * - Malformed JSON
 * - Non-JSON content
 * - Huge JSON files
 * - Missing required fields
 * - XSS/injection attempts
 * - Unicode chaos
 */

import { Keypair, Connection } from '@solana/web3.js';
import { SolanaSDK } from '../../src/core/sdk-solana.js';
import * as fs from 'fs';
import * as path from 'path';

// ============ CONFIG ============
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_DEVNET_RPC =
  process.env.HELIUS_DEVNET_URL ||
  (HELIUS_API_KEY ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}` : undefined);


const CONFIG = {
  INDEXER_URL: 'https://uhjytdjxvfbppgjicfly.supabase.co/rest/v1',
  SUPABASE_ANON_KEY: 'sb_publishable_i-ycBRGiolBr8GMdiVq1rA_nwt7N2bq',
};

// ============ UTILITIES ============
function loadKeypair(filePath: string): Keypair {
  const keyData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ OFF-CHAIN METADATA SCENARIOS ============
// These are various tokenUri values that point to different content types

interface MetadataScenario {
  name: string;
  description: string;
  // Can be a data URI or an actual URL
  uri: string;
  expectedBehavior: 'should_parse' | 'should_fail_gracefully' | 'edge_case';
}

// Generate data URIs for testing (base64 encoded JSON)
function jsonToDataUri(obj: any): string {
  const json = JSON.stringify(obj);
  const base64 = Buffer.from(json).toString('base64');
  return `data:application/json;base64,${base64}`;
}

function textToDataUri(text: string): string {
  const base64 = Buffer.from(text).toString('base64');
  return `data:text/plain;base64,${base64}`;
}

// ============ SCENARIO DEFINITIONS ============
const OFFCHAIN_SCENARIOS: MetadataScenario[] = [
  // ====== VALID BUT EDGE CASE ======
  {
    name: 'valid_minimal',
    description: 'Minimal valid metadata',
    uri: jsonToDataUri({ name: 'Test Agent' }),
    expectedBehavior: 'should_parse',
  },
  {
    name: 'valid_complete',
    description: 'Complete valid metadata',
    uri: jsonToDataUri({
      name: 'Complete Agent',
      description: 'A fully specified agent',
      image: 'https://example.com/image.png',
      external_url: 'https://example.com',
      attributes: [
        { trait_type: 'version', value: '1.0.0' },
        { trait_type: 'model', value: 'gpt-4' },
      ],
      properties: {
        category: 'ai-agent',
        creators: [{ address: '11111111111111111111111111111111', share: 100 }],
      },
    }),
    expectedBehavior: 'should_parse',
  },
  {
    name: 'unicode_chaos',
    description: 'Unicode everywhere',
    uri: jsonToDataUri({
      name: '日本語エージェント 🤖',
      description: '中文描述 العربية Русский 한국어 emoji: 🔥💯✅',
      image: 'https://例え.jp/画像.png',
      attributes: [
        { trait_type: '版本', value: 'v1.0 🚀' },
        { trait_type: 'مفتاح', value: 'قيمة' },
      ],
    }),
    expectedBehavior: 'should_parse',
  },
  {
    name: 'very_long_strings',
    description: 'Very long field values',
    uri: jsonToDataUri({
      name: 'A'.repeat(1000),
      description: 'B'.repeat(10000),
      attributes: Array(100).fill({ trait_type: 'attr', value: 'C'.repeat(500) }),
    }),
    expectedBehavior: 'edge_case',
  },
  {
    name: 'deep_nesting',
    description: 'Deeply nested objects',
    uri: jsonToDataUri({
      name: 'Deep Agent',
      properties: {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  level6: {
                    level7: {
                      level8: {
                        level9: {
                          level10: { value: 'deep!' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }),
    expectedBehavior: 'edge_case',
  },
  {
    name: 'huge_array',
    description: 'Huge attributes array',
    uri: jsonToDataUri({
      name: 'Array Agent',
      attributes: Array(1000).fill(0).map((_, i) => ({
        trait_type: `attr_${i}`,
        value: `value_${i}_${'x'.repeat(100)}`,
      })),
    }),
    expectedBehavior: 'edge_case',
  },

  // ====== XSS / INJECTION ATTEMPTS ======
  {
    name: 'xss_in_name',
    description: 'XSS attempt in name field',
    uri: jsonToDataUri({
      name: '<script>alert("XSS")</script>',
      description: '<img src=x onerror=alert(1)>',
      image: 'javascript:alert(1)',
    }),
    expectedBehavior: 'should_parse', // Should store but sanitize on display
  },
  {
    name: 'sql_injection',
    description: 'SQL injection attempt',
    uri: jsonToDataUri({
      name: "'; DROP TABLE agents; --",
      description: "1' OR '1'='1",
      attributes: [{ trait_type: "' UNION SELECT * FROM users --", value: 'test' }],
    }),
    expectedBehavior: 'should_parse', // Should store safely
  },
  {
    name: 'template_injection',
    description: 'Template injection attempts',
    uri: jsonToDataUri({
      name: '${process.env.SECRET}',
      description: '{{constructor.constructor("return this")()}}',
      image: '#{system("whoami")}',
    }),
    expectedBehavior: 'should_parse',
  },
  {
    name: 'prototype_pollution',
    description: 'Prototype pollution attempt',
    uri: jsonToDataUri({
      name: 'Pollution Agent',
      __proto__: { polluted: true },
      constructor: { prototype: { polluted: true } },
    }),
    expectedBehavior: 'should_parse',
  },
  {
    name: 'path_traversal',
    description: 'Path traversal in URLs',
    uri: jsonToDataUri({
      name: 'Traversal Agent',
      image: '../../etc/passwd',
      external_url: 'file:///etc/passwd',
    }),
    expectedBehavior: 'should_parse',
  },

  // ====== MALFORMED JSON ======
  {
    name: 'invalid_json_syntax',
    description: 'Invalid JSON syntax',
    uri: textToDataUri('{ name: "missing quotes", }'),
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'truncated_json',
    description: 'Truncated JSON',
    uri: textToDataUri('{ "name": "Truncated'),
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'empty_json',
    description: 'Empty JSON object',
    uri: jsonToDataUri({}),
    expectedBehavior: 'edge_case',
  },
  {
    name: 'null_json',
    description: 'JSON null',
    uri: jsonToDataUri(null),
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'array_instead_of_object',
    description: 'Array instead of object',
    uri: jsonToDataUri(['not', 'an', 'object']),
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'string_instead_of_object',
    description: 'String instead of object',
    uri: jsonToDataUri('just a string'),
    expectedBehavior: 'should_fail_gracefully',
  },

  // ====== NON-JSON CONTENT ======
  {
    name: 'plain_text',
    description: 'Plain text content',
    uri: textToDataUri('This is not JSON at all'),
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'html_content',
    description: 'HTML content',
    uri: textToDataUri('<!DOCTYPE html><html><body>Not JSON</body></html>'),
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'xml_content',
    description: 'XML content',
    uri: textToDataUri('<?xml version="1.0"?><agent><name>XML Agent</name></agent>'),
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'binary_garbage',
    description: 'Binary garbage data',
    uri: `data:application/octet-stream;base64,${Buffer.from([0xFF, 0xFE, 0x00, 0x01, 0xDE, 0xAD, 0xBE, 0xEF]).toString('base64')}`,
    expectedBehavior: 'should_fail_gracefully',
  },

  // ====== SPECIAL VALUES ======
  {
    name: 'null_fields',
    description: 'Null values for all fields',
    uri: jsonToDataUri({
      name: null,
      description: null,
      image: null,
      attributes: null,
    }),
    expectedBehavior: 'edge_case',
  },
  {
    name: 'wrong_types',
    description: 'Wrong types for fields',
    uri: jsonToDataUri({
      name: 12345,
      description: true,
      image: { url: 'nested' },
      attributes: 'not an array',
    }),
    expectedBehavior: 'edge_case',
  },
  {
    name: 'empty_strings',
    description: 'Empty string values',
    uri: jsonToDataUri({
      name: '',
      description: '',
      image: '',
    }),
    expectedBehavior: 'edge_case',
  },
  {
    name: 'whitespace_strings',
    description: 'Whitespace-only values',
    uri: jsonToDataUri({
      name: '   \t\n   ',
      description: '\n\n\n',
    }),
    expectedBehavior: 'edge_case',
  },
  {
    name: 'control_characters',
    description: 'Control characters in strings',
    uri: jsonToDataUri({
      name: 'Agent\x00\x01\x02\x03',
      description: 'Tab:\tNewline:\nCarriage:\r',
    }),
    expectedBehavior: 'edge_case',
  },
  {
    name: 'ansi_escape_codes',
    description: 'ANSI escape codes',
    uri: jsonToDataUri({
      name: '\x1b[31mRED\x1b[0m Agent',
      description: '\x1b[1mBOLD\x1b[0m text',
    }),
    expectedBehavior: 'edge_case',
  },

  // ====== HUGE CONTENT ======
  {
    name: 'huge_json_100kb',
    description: '100KB JSON file',
    uri: jsonToDataUri({
      name: 'Huge Agent',
      description: 'X'.repeat(100000),
    }),
    expectedBehavior: 'edge_case',
  },

  // ====== URL EDGE CASES ======
  {
    name: 'empty_data_uri',
    description: 'Empty data URI',
    uri: 'data:application/json;base64,',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'malformed_data_uri',
    description: 'Malformed data URI',
    uri: 'data:not-valid',
    expectedBehavior: 'should_fail_gracefully',
  },
];

// ============ MAIN TEST ============
async function runOffchainMetadataTest(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('   OFF-CHAIN METADATA STRESS TEST');
  console.log('='.repeat(60));

  // Setup
  const rpcUrl = process.env.SOLANA_RPC_URL || HELIUS_DEVNET_RPC || 'https://api.devnet.solana.com';
  const walletPath = process.env.SOLANA_WALLET_PATH ||
    path.join(process.env.HOME!, '.config/solana/id.json');
  const mainWallet = loadKeypair(walletPath);

  const connection = new Connection(rpcUrl);
  const balance = await connection.getBalance(mainWallet.publicKey);

  console.log(`\n🔗 RPC: ${rpcUrl.includes('helius') ? 'Helius' : 'Public'}`);
  console.log(`💰 Balance: ${(balance / 1e9).toFixed(4)} SOL`);
  console.log(`📊 Scenarios to test: ${OFFCHAIN_SCENARIOS.length}`);

  const sdk = new SolanaSDK({
    rpcUrl,
    signer: mainWallet,
    indexerUrl: CONFIG.INDEXER_URL,
  });

  const results: Array<{
    scenario: string;
    agentId?: string;
    success: boolean;
    error?: string;
    indexed: boolean;
    indexedMetadata?: any;
  }> = [];

  console.log('\n📦 Creating agents with various off-chain metadata...\n');

  for (let i = 0; i < OFFCHAIN_SCENARIOS.length; i++) {
    const scenario = OFFCHAIN_SCENARIOS[i];
    console.log(`  [${i + 1}/${OFFCHAIN_SCENARIOS.length}] ${scenario.name}: ${scenario.description}`);

    try {
      // Register agent with the weird tokenUri
      const result = await sdk.registerAgent(scenario.uri);

      if (result.success && result.asset) {
        console.log(`    ✅ Created: ${result.asset.toBase58().slice(0, 12)}...`);
        results.push({
          scenario: scenario.name,
          agentId: result.asset.toBase58(),
          success: true,
          indexed: false, // Will check later
        });
      } else {
        console.log(`    ❌ Failed: ${result.error || 'Unknown'}`);
        results.push({
          scenario: scenario.name,
          success: false,
          error: result.error,
          indexed: false,
        });
      }
    } catch (error: any) {
      console.log(`    ❌ Error: ${error.message.slice(0, 80)}`);
      results.push({
        scenario: scenario.name,
        success: false,
        error: error.message,
        indexed: false,
      });
    }

    // Rate limiting
    await sleep(2000);
  }

  // Wait for indexer to process
  console.log('\n⏳ Waiting 30s for indexer to process metadata...\n');
  await sleep(30000);

  // Check indexer results
  console.log('🔍 Checking indexed data...\n');

  const headers = {
    'apikey': CONFIG.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };

  for (const result of results) {
    if (!result.success || !result.agentId) continue;

    try {
      const response = await fetch(
        `${CONFIG.INDEXER_URL}/agents?asset=eq.${result.agentId}`,
        { headers }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          result.indexed = true;
          result.indexedMetadata = {
            nft_name: data[0].nft_name,
            metadata_fetched: data[0].metadata_fetched,
            token_uri: data[0].token_uri?.slice(0, 50),
            // Check if any metadata fields were stored
            has_metadata: !!data[0].nft_name || !!data[0].metadata_uri,
          };
          console.log(`  ✅ ${result.scenario}: Indexed (name: ${data[0].nft_name || 'null'})`);
        } else {
          console.log(`  ⚠️ ${result.scenario}: Not found in index`);
        }
      }
    } catch (e: any) {
      console.log(`  ❌ ${result.scenario}: Index check failed - ${e.message}`);
    }

    await sleep(200); // Avoid rate limiting
  }

  // Generate report
  console.log('\n' + '='.repeat(60));
  console.log('   OFF-CHAIN METADATA TEST REPORT');
  console.log('='.repeat(60));

  const created = results.filter(r => r.success).length;
  const indexed = results.filter(r => r.indexed).length;

  console.log(`\n📊 Summary:`);
  console.log(`  Total scenarios: ${OFFCHAIN_SCENARIOS.length}`);
  console.log(`  Agents created: ${created}`);
  console.log(`  Agents indexed: ${indexed}`);
  console.log(`  Creation failures: ${results.filter(r => !r.success).length}`);

  // Group by expected behavior
  const byBehavior: Record<string, typeof results> = {
    should_parse: [],
    should_fail_gracefully: [],
    edge_case: [],
  };

  for (const result of results) {
    const scenario = OFFCHAIN_SCENARIOS.find(s => s.name === result.scenario);
    if (scenario) {
      byBehavior[scenario.expectedBehavior].push(result);
    }
  }

  console.log(`\n📈 By Expected Behavior:`);
  for (const [behavior, group] of Object.entries(byBehavior)) {
    const created = group.filter(r => r.success).length;
    const indexed = group.filter(r => r.indexed).length;
    console.log(`  ${behavior}: ${created}/${group.length} created, ${indexed}/${created} indexed`);
  }

  // Show interesting findings
  console.log(`\n🔍 Interesting Findings:`);

  // Scenarios that should parse but didn't get indexed
  const shouldParseNotIndexed = results.filter(r => {
    const scenario = OFFCHAIN_SCENARIOS.find(s => s.name === r.scenario);
    return r.success && !r.indexed && scenario?.expectedBehavior === 'should_parse';
  });

  if (shouldParseNotIndexed.length > 0) {
    console.log(`\n  ⚠️ Should parse but not indexed:`);
    for (const r of shouldParseNotIndexed) {
      console.log(`    - ${r.scenario}`);
    }
  }

  // Scenarios that should fail gracefully but crashed
  const crashedOnBadData = results.filter(r => {
    const scenario = OFFCHAIN_SCENARIOS.find(s => s.name === r.scenario);
    return r.success && !r.indexed && scenario?.expectedBehavior === 'should_fail_gracefully';
  });

  if (crashedOnBadData.length > 0) {
    console.log(`\n  🔥 Potentially crashed indexer (bad data not handled):`);
    for (const r of crashedOnBadData) {
      console.log(`    - ${r.scenario}`);
    }
  }

  // XSS/Injection that got stored
  const xssStored = results.filter(r => {
    return r.indexed && r.indexedMetadata?.nft_name?.includes('<script>');
  });

  if (xssStored.length > 0) {
    console.log(`\n  🚨 XSS stored without sanitization:`);
    for (const r of xssStored) {
      console.log(`    - ${r.scenario}: ${r.indexedMetadata?.nft_name}`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

// Run
runOffchainMetadataTest()
  .then(() => {
    console.log('\n✅ Off-chain metadata test completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });
