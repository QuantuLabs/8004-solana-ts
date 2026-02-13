/**
 * Skill.md Code Snippet Verification
 * Tests every code example from skill.md to ensure correctness.
 */

import { Keypair, PublicKey } from '@solana/web3.js';

// ── Imports (skill.md "Imports" section) ──
import {
  // Core SDK
  SolanaSDK,
  IPFSClient,

  // Builders
  buildRegistrationFileJson,

  // Enums & Types
  ServiceType,
  TrustTier,
  Tag,

  // ATOM Engine
  AtomStats,
  trustTierToString,

  // SEAL v1
  computeSealHash,
  computeFeedbackLeafV1,
  verifySealHash,
  createSealParams,
  validateSealInputs,
  MAX_TAG_LEN,
  MAX_ENDPOINT_LEN,
  MAX_URI_LEN,

  // OASF Taxonomy
  getAllSkills,
  getAllDomains,

  // Tag helpers
  isKnownTag,
  getTagDescription,

  // Signing
  buildSignedPayload,
  verifySignedPayload,
  parseSignedPayload,
  normalizeSignData,
  createNonce,
  canonicalizeJson,

  // Value encoding
  encodeReputationValue,
  decodeToDecimalString,
  decodeToNumber,

  // Crypto utilities
  keccak256,
  sha256,
  sha256Sync,

  // Hash-chain replay
  replayFeedbackChain,
  replayResponseChain,
  replayRevokeChain,

  // Indexer
  IndexerClient,

  // Endpoint crawler
  EndpointCrawler,

  // Error classes
  IndexerError,
  IndexerUnavailableError,
  IndexerTimeoutError,
  IndexerRateLimitError,
  UnsupportedRpcError,
  RpcNetworkError,

  // Program IDs
  PROGRAM_ID,
  MPL_CORE_PROGRAM_ID,
  ATOM_ENGINE_PROGRAM_ID,
} from '../src/index.js';

// ════════════════════════════════════════════════════════════════
// Section 1: SDK Setup
// ════════════════════════════════════════════════════════════════

describe('Section 1: SDK Setup', () => {
  test('read-only SDK (no wallet)', () => {
    const sdk = new SolanaSDK({ cluster: 'devnet' });
    expect(sdk).toBeInstanceOf(SolanaSDK);
    expect(sdk.isReadOnly).toBe(true);
  });

  test('SDK with signer', () => {
    const signer = Keypair.generate();
    const sdk = new SolanaSDK({ signer });
    expect(sdk).toBeInstanceOf(SolanaSDK);
    expect(sdk.isReadOnly).toBe(false);
  });

  test('SDK with custom RPC', () => {
    const signer = Keypair.generate();
    const sdk = new SolanaSDK({
      rpcUrl: 'https://api.devnet.solana.com',
      signer,
    });
    expect(sdk).toBeInstanceOf(SolanaSDK);
  });

  test('full config', () => {
    const keypair = Keypair.generate();
    const sdk = new SolanaSDK({
      cluster: 'devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      signer: keypair,
      indexerUrl: 'https://example.supabase.co/rest/v1',
      indexerApiKey: 'test-key',
      useIndexer: true,
      indexerFallback: true,
      forceOnChain: false,
    });
    expect(sdk).toBeInstanceOf(SolanaSDK);
  });

  test('IPFSClient construction (local node)', () => {
    const ipfsLocal = new IPFSClient({ url: 'http://localhost:5001' });
    expect(ipfsLocal).toBeInstanceOf(IPFSClient);
  });

  test('IPFSClient construction (pinata)', () => {
    const ipfsPinata = new IPFSClient({
      pinataEnabled: true,
      pinataJwt: 'fake-jwt-for-test',
    });
    expect(ipfsPinata).toBeInstanceOf(IPFSClient);
  });
});


// ════════════════════════════════════════════════════════════════
// Section 2: Register an Agent — buildRegistrationFileJson
// ════════════════════════════════════════════════════════════════

describe('Section 2: buildRegistrationFileJson', () => {
  test('builds metadata with services, skills, domains', () => {
    const metadata = buildRegistrationFileJson({
      name: 'My Agent',
      description: 'Autonomous trading agent',
      image: 'ipfs://QmImageCid...',
      services: [
        { type: ServiceType.MCP, value: 'https://my-agent.com/mcp' },
        { type: ServiceType.A2A, value: 'https://my-agent.com/a2a' },
      ],
      skills: ['advanced_reasoning_planning/strategic_planning'],
      domains: ['finance_and_business/finance'],
      x402Support: true,
    });

    expect(metadata).toBeDefined();
    expect(metadata.name).toBe('My Agent');
    expect(metadata.description).toBe('Autonomous trading agent');
    expect(metadata.image).toBe('ipfs://QmImageCid...');
    // Services are at top level with name/endpoint
    const services = (metadata as any).services;
    expect(services).toBeDefined();
    expect(services.length).toBe(2);
    expect(services[0].name).toBe('MCP');
    expect(services[1].name).toBe('A2A');
    expect(services[0].endpoint).toBe('https://my-agent.com/mcp');
    // x402Support
    expect((metadata as any).x402Support).toBe(true);
  });

  test('ServiceType enum values', () => {
    expect(ServiceType.MCP).toBe('MCP');
    expect(ServiceType.A2A).toBe('A2A');
    expect(ServiceType.ENS).toBe('ENS');
    expect(ServiceType.DID).toBe('DID');
    expect(ServiceType.WALLET).toBe('wallet');
    expect(ServiceType.OASF).toBe('OASF');
  });

  test('getBaseCollection method exists', () => {
    const sdk = new SolanaSDK({ cluster: 'devnet' });
    expect(typeof sdk.getBaseCollection).toBe('function');
  });
});


// ════════════════════════════════════════════════════════════════
// Section 3: Read Agent Data — method existence
// ════════════════════════════════════════════════════════════════

describe('Section 3: Read Agent Data (method existence)', () => {
  const sdk = new SolanaSDK({ cluster: 'devnet' });

  test('loadAgent', () => expect(typeof sdk.loadAgent).toBe('function'));
  test('agentExists', () => expect(typeof sdk.agentExists).toBe('function'));
  test('getAgentOwner', () => expect(typeof sdk.getAgentOwner).toBe('function'));
  test('isAgentOwner', () => expect(typeof sdk.isAgentOwner).toBe('function'));
  test('getMetadata', () => expect(typeof sdk.getMetadata).toBe('function'));
  test('getAllAgents', () => expect(typeof sdk.getAllAgents).toBe('function'));
  test('getAgentsByOwner', () => expect(typeof sdk.getAgentsByOwner).toBe('function'));
});


// ════════════════════════════════════════════════════════════════
// Section 4: Update Agent — method existence
// ════════════════════════════════════════════════════════════════

describe('Section 4: Update Agent (method existence)', () => {
  const sdk = new SolanaSDK({ cluster: 'devnet' });

  test('setAgentUri', () => expect(typeof sdk.setAgentUri).toBe('function'));
  test('setMetadata', () => expect(typeof sdk.setMetadata).toBe('function'));
  test('deleteMetadata', () => expect(typeof sdk.deleteMetadata).toBe('function'));
  test('transferAgent', () => expect(typeof sdk.transferAgent).toBe('function'));
  test('syncOwner', () => expect(typeof sdk.syncOwner).toBe('function'));
});


// ════════════════════════════════════════════════════════════════
// Section 5: Feedback System — method existence + value encoding
// ════════════════════════════════════════════════════════════════

describe('Section 5: Feedback System', () => {
  const sdk = new SolanaSDK({ cluster: 'devnet' });

  test('giveFeedback exists', () => expect(typeof sdk.giveFeedback).toBe('function'));
  test('readFeedback exists', () => expect(typeof sdk.readFeedback).toBe('function'));
  test('readAllFeedback exists', () => expect(typeof sdk.readAllFeedback).toBe('function'));
  test('getLastIndex exists', () => expect(typeof sdk.getLastIndex).toBe('function'));
  test('getClients exists', () => expect(typeof sdk.getClients).toBe('function'));
  test('getFeedbacksFromIndexer exists', () => expect(typeof sdk.getFeedbacksFromIndexer).toBe('function'));
  test('getFeedbacksByEndpoint exists', () => expect(typeof sdk.getFeedbacksByEndpoint).toBe('function'));
  test('getFeedbacksByTag exists', () => expect(typeof sdk.getFeedbacksByTag).toBe('function'));
  test('revokeFeedback exists', () => expect(typeof sdk.revokeFeedback).toBe('function'));
  test('appendResponse exists', () => expect(typeof sdk.appendResponse).toBe('function'));
  test('readResponses exists', () => expect(typeof sdk.readResponses).toBe('function'));
  test('getResponseCount exists', () => expect(typeof sdk.getResponseCount).toBe('function'));

  test('value encoding patterns from skill.md', () => {
    // "99.75" -> encoded: value=9975n, valueDecimals=2
    const e1 = encodeReputationValue('99.75');
    expect(e1.value).toBe(9975n);
    expect(e1.valueDecimals).toBe(2);

    // Integer: 250ms
    const e2 = encodeReputationValue(250);
    expect(e2.value).toBe(250n);
    expect(e2.valueDecimals).toBe(0);

    // Currency: "150.00" (trailing zeros stripped)
    const e3 = encodeReputationValue('150.00');
    expect(e3.value).toBe(150n);
    expect(e3.valueDecimals).toBe(0);

    // Negative: "-15.50" (trailing zero stripped → 1 decimal)
    const e4 = encodeReputationValue('-15.50');
    expect(e4.value).toBe(-155n);
    expect(e4.valueDecimals).toBe(1);

    // Binary: 1
    const e5 = encodeReputationValue(1);
    expect(e5.value).toBe(1n);
    expect(e5.valueDecimals).toBe(0);

    // Quality: "85"
    const e6 = encodeReputationValue('85');
    expect(e6.value).toBe(85n);
    expect(e6.valueDecimals).toBe(0);
  });
});


// ════════════════════════════════════════════════════════════════
// Section 6: Reputation & ATOM Engine
// ════════════════════════════════════════════════════════════════

describe('Section 6: Reputation & ATOM Engine', () => {
  const sdk = new SolanaSDK({ cluster: 'devnet' });

  test('getSummary exists', () => expect(typeof sdk.getSummary).toBe('function'));
  test('getAtomStats exists', () => expect(typeof sdk.getAtomStats).toBe('function'));
  test('getTrustTier exists', () => expect(typeof sdk.getTrustTier).toBe('function'));
  test('getEnrichedSummary exists', () => expect(typeof sdk.getEnrichedSummary).toBe('function'));
  test('getAgentReputationFromIndexer exists', () => expect(typeof sdk.getAgentReputationFromIndexer).toBe('function'));

  test('TrustTier enum values', () => {
    expect(TrustTier.Unrated).toBe(0);
    expect(TrustTier.Bronze).toBe(1);
    expect(TrustTier.Silver).toBe(2);
    expect(TrustTier.Gold).toBe(3);
    expect(TrustTier.Platinum).toBe(4);
  });

  test('trustTierToString', () => {
    expect(trustTierToString(TrustTier.Unrated)).toBe('Unrated');
    expect(trustTierToString(TrustTier.Bronze)).toBe('Bronze');
    expect(trustTierToString(TrustTier.Silver)).toBe('Silver');
    expect(trustTierToString(TrustTier.Gold)).toBe('Gold');
    expect(trustTierToString(TrustTier.Platinum)).toBe('Platinum');
  });

  test('AtomStats class is exported', () => {
    expect(typeof AtomStats).toBe('function');
  });
});


// ════════════════════════════════════════════════════════════════
// Section 7: Signing & Verification — method existence
// ════════════════════════════════════════════════════════════════

describe('Section 7: Signing & Verification (method existence)', () => {
  const sdk = new SolanaSDK({ cluster: 'devnet' });

  test('sign exists', () => expect(typeof sdk.sign).toBe('function'));
  test('verify exists', () => expect(typeof sdk.verify).toBe('function'));
  test('buildSignedPayload exported', () => expect(typeof buildSignedPayload).toBe('function'));
  test('verifySignedPayload exported', () => expect(typeof verifySignedPayload).toBe('function'));
  test('parseSignedPayload exported', () => expect(typeof parseSignedPayload).toBe('function'));
});


// ════════════════════════════════════════════════════════════════
// Section 8: Liveness Check — method existence
// ════════════════════════════════════════════════════════════════

describe('Section 8: Liveness Check (method existence)', () => {
  const sdk = new SolanaSDK({ cluster: 'devnet' });

  test('isItAlive exists', () => expect(typeof sdk.isItAlive).toBe('function'));
});


// ════════════════════════════════════════════════════════════════
// Section 9: SEAL v1
// ════════════════════════════════════════════════════════════════

describe('Section 9: SEAL v1', () => {
  test('MAX constants', () => {
    expect(MAX_TAG_LEN).toBe(32);
    expect(MAX_ENDPOINT_LEN).toBe(250);
    expect(MAX_URI_LEN).toBe(250);
  });

  test('createSealParams + computeSealHash + verifySealHash', () => {
    const params = createSealParams(
      9977n,                        // value (i64)
      2,                            // decimals
      85,                           // score (or null)
      'uptime',                     // tag1
      'day',                        // tag2
      'https://api.example.com',    // endpoint (or null)
      'ipfs://QmFeedback...',       // feedbackUri
      null,                         // feedbackFileHash (or null)
    );

    expect(params).toBeDefined();
    expect(params.value).toBe(9977n);
    expect(params.valueDecimals).toBe(2);

    // Validate inputs
    validateSealInputs(params);

    // Compute hash
    const sealHash = computeSealHash(params);
    expect(sealHash).toBeInstanceOf(Buffer);
    expect(sealHash.length).toBe(32);

    // Verify
    const valid = verifySealHash({ ...params, sealHash });
    expect(valid).toBe(true);
  });

  test('createSealParams with feedbackFileHash', () => {
    const fileHash = Buffer.alloc(32, 0xab);
    const params = createSealParams(
      9977n, 2, 85, 'uptime', 'day',
      'https://api.example.com',
      'ipfs://QmFeedback...',
      fileHash,
    );

    validateSealInputs(params);
    const sealHash = computeSealHash(params);
    expect(sealHash.length).toBe(32);

    const valid = verifySealHash({ ...params, sealHash });
    expect(valid).toBe(true);
  });

  test('computeFeedbackLeafV1', () => {
    const assetBuf = Keypair.generate().publicKey.toBuffer();
    const clientBuf = Keypair.generate().publicKey.toBuffer();
    const sealHash = Buffer.alloc(32, 0xcc);

    const leaf = computeFeedbackLeafV1(
      assetBuf,
      clientBuf,
      0n,
      sealHash,
      12345n,
    );

    expect(leaf).toBeInstanceOf(Buffer);
    expect(leaf.length).toBe(32);
  });

  test('validateSealInputs throws on invalid params', () => {
    // Tag too long (> 32 bytes)
    const badParams = createSealParams(
      100n, 0, 50,
      'a'.repeat(33), // 33 bytes > MAX_TAG_LEN
      'day',
      null,
      'ipfs://QmTest',
      null,
    );

    expect(() => validateSealInputs(badParams)).toThrow();
  });
});


// ════════════════════════════════════════════════════════════════
// Section 10: Integrity Verification — method existence
// ════════════════════════════════════════════════════════════════

describe('Section 10: Integrity Verification (method existence)', () => {
  const sdk = new SolanaSDK({ cluster: 'devnet' });

  test('verifyIntegrity exists', () => expect(typeof sdk.verifyIntegrity).toBe('function'));
  test('verifyIntegrityDeep exists', () => expect(typeof sdk.verifyIntegrityDeep).toBe('function'));
  test('verifyIntegrityFull exists', () => expect(typeof sdk.verifyIntegrityFull).toBe('function'));

  test('replay chain functions exported', () => {
    expect(typeof replayFeedbackChain).toBe('function');
    expect(typeof replayResponseChain).toBe('function');
    expect(typeof replayRevokeChain).toBe('function');
  });
});


// ════════════════════════════════════════════════════════════════
// Section 11: Search & Discovery — method existence
// ════════════════════════════════════════════════════════════════

describe('Section 11: Search & Discovery (method existence)', () => {
  const sdk = new SolanaSDK({ cluster: 'devnet' });

  test('searchAgents exists', () => expect(typeof sdk.searchAgents).toBe('function'));
  test('getLeaderboard exists', () => expect(typeof sdk.getLeaderboard).toBe('function'));
  test('getGlobalStats exists', () => expect(typeof sdk.getGlobalStats).toBe('function'));
  test('getCollectionStats exists', () => expect(typeof sdk.getCollectionStats).toBe('function'));
  test('getAgentByWallet exists', () => expect(typeof sdk.getAgentByWallet).toBe('function'));

  test('EndpointCrawler construction', () => {
    const crawler = new EndpointCrawler(5000);
    expect(crawler).toBeInstanceOf(EndpointCrawler);
    expect(typeof crawler.fetchMcpCapabilities).toBe('function');
    expect(typeof crawler.fetchA2aCapabilities).toBe('function');
  });
});


// ════════════════════════════════════════════════════════════════
// Section 12: SDK Introspection
// ════════════════════════════════════════════════════════════════

describe('Section 12: SDK Introspection', () => {
  const sdk = new SolanaSDK({ cluster: 'devnet' });

  test('chainId() returns CAIP-2 format', async () => {
    const chain = await sdk.chainId();
    expect(chain).toMatch(/^solana-/);
  });

  test('getCluster()', () => {
    const cluster = sdk.getCluster();
    expect(['devnet', 'mainnet-beta', 'testnet']).toContain(cluster);
  });

  test('getProgramIds() returns PublicKeys', () => {
    const programs = sdk.getProgramIds();
    expect(programs.identityRegistry).toBeInstanceOf(PublicKey);
    expect(programs.reputationRegistry).toBeInstanceOf(PublicKey);
    expect(programs.validationRegistry).toBeInstanceOf(PublicKey);
  });

  test('registries() returns string addresses', () => {
    const regs = sdk.registries();
    expect(typeof regs.IDENTITY).toBe('string');
    expect(typeof regs.REPUTATION).toBe('string');
    expect(typeof regs.VALIDATION).toBe('string');
  });

  test('getRpcUrl()', () => {
    const rpcUrl = sdk.getRpcUrl();
    expect(typeof rpcUrl).toBe('string');
    expect(rpcUrl).toMatch(/^https?:\/\//);
  });

  test('isReadOnly', () => {
    expect(sdk.isReadOnly).toBe(true);
  });

  test('isUsingDefaultDevnetRpc()', () => {
    expect(typeof sdk.isUsingDefaultDevnetRpc()).toBe('boolean');
  });

  test('supportsAdvancedQueries()', () => {
    expect(typeof sdk.supportsAdvancedQueries()).toBe('boolean');
  });

  test('getSolanaClient()', () => {
    const client = sdk.getSolanaClient();
    expect(client).toBeDefined();
  });

  test('getFeedbackManager()', () => {
    const mgr = sdk.getFeedbackManager();
    expect(mgr).toBeDefined();
  });
});


// ════════════════════════════════════════════════════════════════
// Section 13: Tags Reference
// ════════════════════════════════════════════════════════════════

describe('Section 13: Tags Reference', () => {
  test('category tags (tag1)', () => {
    expect(Tag.starred).toBe('starred');
    expect(Tag.uptime).toBe('uptime');
    expect(Tag.successRate).toBe('successRate');
    expect(Tag.reachable).toBe('reachable');
    expect(Tag.ownerVerified).toBe('ownerVerified');
    expect(Tag.responseTime).toBe('responseTime');
    expect(Tag.blocktimeFreshness).toBe('blocktimeFreshness');
    expect(Tag.revenues).toBe('revenues');
    expect(Tag.tradingYield).toBe('tradingYield');
  });

  test('period tags (tag2)', () => {
    expect(Tag.day).toBe('day');
    expect(Tag.week).toBe('week');
    expect(Tag.month).toBe('month');
    expect(Tag.year).toBe('year');
  });

  test('x402 tags (client -> agent)', () => {
    expect(Tag.x402ResourceDelivered).toBe('x402-resource-delivered');
    expect(Tag.x402DeliveryFailed).toBe('x402-delivery-failed');
    expect(Tag.x402DeliveryTimeout).toBe('x402-delivery-timeout');
    expect(Tag.x402QualityIssue).toBe('x402-quality-issue');
  });

  test('x402 tags (agent -> client)', () => {
    expect(Tag.x402GoodPayer).toBe('x402-good-payer');
    expect(Tag.x402PaymentFailed).toBe('x402-payment-failed');
    expect(Tag.x402InsufficientFunds).toBe('x402-insufficient-funds');
    expect(Tag.x402InvalidSignature).toBe('x402-invalid-signature');
  });

  test('x402 network tags (tag2)', () => {
    expect(Tag.x402Evm).toBe('exact-evm');
    expect(Tag.x402Svm).toBe('exact-svm');
  });

  test('tag utilities', () => {
    expect(isKnownTag('uptime')).toBe(true);
    expect(isKnownTag('custom-metric')).toBe(false);
    const desc = getTagDescription('successRate');
    expect(typeof desc).toBe('string');
    expect(desc.length).toBeGreaterThan(0);
  });
});


// ════════════════════════════════════════════════════════════════
// Section 14: OASF Taxonomy
// ════════════════════════════════════════════════════════════════

describe('Section 14: OASF Taxonomy', () => {
  test('getAllSkills returns array', () => {
    const skills = getAllSkills();
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBeGreaterThan(100);
  });

  test('getAllDomains returns array', () => {
    const domains = getAllDomains();
    expect(Array.isArray(domains)).toBe(true);
    expect(domains.length).toBeGreaterThan(100);
  });
});


// ════════════════════════════════════════════════════════════════
// Section 15: Hash Utilities
// ════════════════════════════════════════════════════════════════

describe('Section 15: Hash Utilities', () => {
  test('SolanaSDK.computeHash (string)', async () => {
    const hash = await SolanaSDK.computeHash('My feedback content');
    expect(hash).toBeInstanceOf(Buffer);
    expect(hash.length).toBe(32);
  });

  test('SolanaSDK.computeHash (Buffer)', async () => {
    const bufHash = await SolanaSDK.computeHash(Buffer.from('json data'));
    expect(bufHash).toBeInstanceOf(Buffer);
    expect(bufHash.length).toBe(32);
  });

  test('SolanaSDK.computeUriHash (HTTPS)', async () => {
    const uriHash = await SolanaSDK.computeUriHash('https://example.com/data.json');
    expect(uriHash).toBeInstanceOf(Buffer);
    expect(uriHash.length).toBe(32);
    // Non-zero for HTTPS
    expect(uriHash.some((b: number) => b !== 0)).toBe(true);
  });

  test('SolanaSDK.computeUriHash (IPFS returns zeros)', async () => {
    const ipfsHash = await SolanaSDK.computeUriHash('ipfs://Qm...');
    expect(ipfsHash).toBeInstanceOf(Buffer);
    expect(ipfsHash.length).toBe(32);
    // All zeros for IPFS
    expect(ipfsHash.every((b: number) => b === 0)).toBe(true);
  });

  test('keccak256 (synchronous)', () => {
    const k = keccak256(Buffer.from('data'));
    expect(k).toBeInstanceOf(Buffer);
    expect(k.length).toBe(32);
  });

  // sha256Sync uses require('crypto') which fails in pure ESM (Jest --experimental-vm-modules)
  // In CJS or bun it works. Skipping in this ESM test.
  test.skip('sha256Sync (Node.js) — requires CJS context', () => {
    const s = sha256Sync('data');
    expect(s.length).toBe(32);
  });

  test('sha256 (async) returns Uint8Array', async () => {
    const s = await sha256(Buffer.from('data'));
    expect(s).toBeInstanceOf(Uint8Array);
    expect(s.length).toBe(32);
  });

  test('keccak256 deterministic', () => {
    const a = keccak256(Buffer.from('hello'));
    const b = keccak256(Buffer.from('hello'));
    expect(a.equals(b)).toBe(true);
  });

  test.skip('sha256Sync matches async sha256 — requires CJS', async () => {
    const syncResult = sha256Sync('test data');
    const asyncResult = await sha256(Buffer.from('test data'));
    expect(Buffer.from(syncResult).equals(Buffer.from(asyncResult))).toBe(true);
  });
});


// ════════════════════════════════════════════════════════════════
// Section 16: Value Encoding
// ════════════════════════════════════════════════════════════════

describe('Section 16: Value Encoding', () => {
  test('encodeReputationValue("99.77")', () => {
    const encoded = encodeReputationValue('99.77');
    expect(encoded.value).toBe(9977n);
    expect(encoded.valueDecimals).toBe(2);
    expect(encoded.normalized).toBe('99.77');
  });

  test('encodeReputationValue("-15.5")', () => {
    const neg = encodeReputationValue('-15.5');
    expect(neg.value).toBe(-155n);
    expect(neg.valueDecimals).toBe(1);
    expect(neg.normalized).toBe('-15.5');
  });

  test('encodeReputationValue(9977n, 2)', () => {
    const raw = encodeReputationValue(9977n, 2);
    expect(raw.value).toBe(9977n);
    expect(raw.valueDecimals).toBe(2);
    expect(raw.normalized).toBe('99.77');
  });

  test('decodeToDecimalString', () => {
    expect(decodeToDecimalString(9977n, 2)).toBe('99.77');
    expect(decodeToDecimalString(-155n, 1)).toBe('-15.5');
  });

  test('decodeToNumber', () => {
    expect(decodeToNumber(9977n, 2)).toBe(99.77);
  });
});


// ════════════════════════════════════════════════════════════════
// Section 17: Canonical JSON & Signing Utilities
// ════════════════════════════════════════════════════════════════

describe('Section 17: Canonical JSON & Signing Utilities', () => {
  test('canonicalizeJson (RFC 8785)', () => {
    const result = canonicalizeJson({ b: 2, a: 1 });
    expect(result).toBe('{"a":1,"b":2}');
  });

  test('canonicalizeJson nested', () => {
    const result = canonicalizeJson({ z: { b: 2, a: 1 }, a: 0 });
    expect(result).toBe('{"a":0,"z":{"a":1,"b":2}}');
  });

  test('normalizeSignData handles BigInt', () => {
    const normalized = normalizeSignData({
      amount: 100n,
    });
    expect(normalized.amount).toEqual({ $bigint: '100' });
  });

  test('normalizeSignData handles PublicKey', () => {
    const pk = Keypair.generate().publicKey;
    const normalized = normalizeSignData({
      key: pk,
    });
    expect(normalized.key).toEqual({ $pubkey: pk.toBase58() });
  });

  test('normalizeSignData handles Date', () => {
    const date = new Date('2025-01-01T00:00:00Z');
    const normalized = normalizeSignData({
      when: date,
    });
    expect(normalized.when).toEqual({ $date: date.toISOString() });
  });

  test('normalizeSignData handles Buffer', () => {
    const buf = Buffer.from([1, 2, 3]);
    const normalized = normalizeSignData({
      data: buf,
    });
    expect(normalized.data).toHaveProperty('$bytes');
    expect(normalized.data).toHaveProperty('encoding', 'base64');
  });

  test('createNonce (default 16 bytes)', () => {
    const nonce = createNonce();
    expect(typeof nonce).toBe('string');
    expect(nonce.length).toBeGreaterThan(0);
  });

  test('createNonce (32 bytes)', () => {
    const nonce32 = createNonce(32);
    expect(typeof nonce32).toBe('string');
    // 32 bytes in base58 is longer than 16 bytes
    expect(nonce32.length).toBeGreaterThan(0);
  });

  test('two nonces are different', () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
  });
});


// ════════════════════════════════════════════════════════════════
// Section 18: IPFS Operations — method existence
// ════════════════════════════════════════════════════════════════

describe('Section 18: IPFS Operations (method existence)', () => {
  const ipfs = new IPFSClient({ url: 'http://localhost:5001' });

  test('addJson', () => expect(typeof ipfs.addJson).toBe('function'));
  test('add', () => expect(typeof ipfs.add).toBe('function'));
  test('addFile', () => expect(typeof ipfs.addFile).toBe('function'));
  test('addRegistrationFile', () => expect(typeof ipfs.addRegistrationFile).toBe('function'));
  test('get', () => expect(typeof ipfs.get).toBe('function'));
  test('getJson', () => expect(typeof ipfs.getJson).toBe('function'));
  test('getRegistrationFile', () => expect(typeof ipfs.getRegistrationFile).toBe('function'));
  test('pin', () => expect(typeof ipfs.pin).toBe('function'));
  test('unpin', () => expect(typeof ipfs.unpin).toBe('function'));
  test('close', () => expect(typeof ipfs.close).toBe('function'));
});


// ════════════════════════════════════════════════════════════════
// Section 19: Server Mode — method existence
// ════════════════════════════════════════════════════════════════

describe('Section 19: Server Mode (method existence)', () => {
  const sdk = new SolanaSDK({ cluster: 'devnet' });

  test('registerAgent exists', () => expect(typeof sdk.registerAgent).toBe('function'));
  test('prepareSetAgentWallet exists', () => expect(typeof sdk.prepareSetAgentWallet).toBe('function'));
});


// ════════════════════════════════════════════════════════════════
// Section 20: Indexer Client
// ════════════════════════════════════════════════════════════════

describe('Section 20: Indexer Client', () => {
  const sdk = new SolanaSDK({ cluster: 'devnet' });

  test('getIndexerClient()', () => {
    const indexer = sdk.getIndexerClient();
    expect(indexer).toBeDefined();
  });

  test('isIndexerAvailable exists', () => {
    expect(typeof sdk.isIndexerAvailable).toBe('function');
  });

  test('waitForIndexerSync exists', () => {
    expect(typeof sdk.waitForIndexerSync).toBe('function');
  });

  test('IndexerClient class exported', () => {
    expect(typeof IndexerClient).toBe('function');
  });
});


// ════════════════════════════════════════════════════════════════
// Section 21: Error Handling
// ════════════════════════════════════════════════════════════════

describe('Section 21: Error Handling', () => {
  test('IndexerError instanceof', () => {
    const e = new IndexerError('test');
    expect(e).toBeInstanceOf(IndexerError);
    expect(e).toBeInstanceOf(Error);
  });

  test('IndexerUnavailableError instanceof', () => {
    const e = new IndexerUnavailableError('test');
    expect(e).toBeInstanceOf(IndexerUnavailableError);
    expect(e).toBeInstanceOf(IndexerError);
  });

  test('IndexerTimeoutError instanceof', () => {
    const e = new IndexerTimeoutError('test');
    expect(e).toBeInstanceOf(IndexerTimeoutError);
    expect(e).toBeInstanceOf(IndexerError);
  });

  test('IndexerRateLimitError instanceof', () => {
    const e = new IndexerRateLimitError('test');
    expect(e).toBeInstanceOf(IndexerRateLimitError);
    expect(e).toBeInstanceOf(IndexerError);
  });

  test('UnsupportedRpcError instanceof', () => {
    const e = new UnsupportedRpcError('test');
    expect(e).toBeInstanceOf(UnsupportedRpcError);
    expect(e).toBeInstanceOf(Error);
  });

  test('RpcNetworkError instanceof', () => {
    const e = new RpcNetworkError('test');
    expect(e).toBeInstanceOf(RpcNetworkError);
    expect(e).toBeInstanceOf(Error);
  });
});


// ════════════════════════════════════════════════════════════════
// Section 24: Program IDs
// ════════════════════════════════════════════════════════════════

describe('Section 24: Program IDs', () => {
  test('PROGRAM_ID (Agent Registry)', () => {
    expect(PROGRAM_ID).toBeInstanceOf(PublicKey);
    expect(PROGRAM_ID.toBase58()).toBe('8oo48pya1SZD23ZhzoNMhxR2UGb8BRa41Su4qP9EuaWm');
  });

  test('MPL_CORE_PROGRAM_ID (Metaplex Core)', () => {
    expect(MPL_CORE_PROGRAM_ID).toBeInstanceOf(PublicKey);
    expect(MPL_CORE_PROGRAM_ID.toBase58()).toBe('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
  });

  test('ATOM_ENGINE_PROGRAM_ID', () => {
    expect(ATOM_ENGINE_PROGRAM_ID).toBeInstanceOf(PublicKey);
    expect(ATOM_ENGINE_PROGRAM_ID.toBase58()).toBe('AToM1iKaniUCuWfHd5WQy5aLgJYWMiKq78NtNJmtzSXJ');
  });
});


// ════════════════════════════════════════════════════════════════
// Cross-section: SEAL with computeHash (section 9 + 15 combined)
// ════════════════════════════════════════════════════════════════

describe('Cross-section: SEAL + computeHash integration', () => {
  test('feedbackFileHash = computeHash(JSON.stringify(file))', async () => {
    const feedbackFile = { version: '1.0', type: 'x402-feedback', data: 'test' };
    const fileHash = await SolanaSDK.computeHash(JSON.stringify(feedbackFile));
    expect(fileHash.length).toBe(32);

    const params = createSealParams(
      10000n, 2, 95,
      'x402-resource-delivered', 'exact-svm',
      '/api/generate',
      'ipfs://QmTest123',
      fileHash,
    );

    validateSealInputs(params);
    const sealHash = computeSealHash(params);
    expect(verifySealHash({ ...params, sealHash })).toBe(true);
  });
});


// ════════════════════════════════════════════════════════════════
// Import resolution: canonicalizeJson now exported
// ════════════════════════════════════════════════════════════════

describe('Import resolution: canonicalizeJson', () => {
  test('canonicalizeJson IS exported from main index', async () => {
    const index = await import('../src/index.js');
    expect('canonicalizeJson' in index).toBe(true);
    expect(typeof canonicalizeJson).toBe('function');
  });
});
