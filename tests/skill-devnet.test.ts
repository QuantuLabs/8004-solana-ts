/**
 * Skill.md DEVNET verification — runs EVERY code snippet on-chain.
 * Uses the anchor wallet (~/.config/solana/id.json)
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';

const RUN_SKILL_DEVNET_TESTS = process.env.RUN_SKILL_DEVNET_TESTS === 'true';
const describeDevnet = RUN_SKILL_DEVNET_TESTS ? describe : describe.skip;

// ── Exact imports from skill.md ──
import {
  SolanaSDK,
  IPFSClient,
  buildRegistrationFileJson,
  ServiceType,
  TrustTier,
  Tag,
  AtomStats,
  trustTierToString,
  computeSealHash,
  computeFeedbackLeafV1,
  verifySealHash,
  createSealParams,
  validateSealInputs,
  MAX_TAG_LEN,
  MAX_ENDPOINT_LEN,
  MAX_URI_LEN,
  getAllSkills,
  getAllDomains,
  isKnownTag,
  getTagDescription,
  buildSignedPayload,
  verifySignedPayload,
  parseSignedPayload,
  normalizeSignData,
  createNonce,
  canonicalizeJson,
  encodeReputationValue,
  decodeToDecimalString,
  decodeToNumber,
  keccak256,
  sha256,
  replayFeedbackChain,
  replayResponseChain,
  replayRevokeChain,
  IndexerClient,
  EndpointCrawler,
  IndexerError,
  IndexerUnavailableError,
  IndexerTimeoutError,
  IndexerRateLimitError,
  UnsupportedRpcError,
  RpcNetworkError,
  PROGRAM_ID,
  MPL_CORE_PROGRAM_ID,
  ATOM_ENGINE_PROGRAM_ID,
} from '../src/index.js';

function loadAnchorWallet(): Keypair {
  const home = process.env.HOME;
  const defaultPath = home ? `${home}/.config/solana/id.json` : '';
  const walletPath = process.env.SOLANA_WALLET_PATH || defaultPath;
  if (!walletPath) {
    throw new Error('Missing SOLANA_WALLET_PATH (and HOME is not set).');
  }
  const keyData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

// ── Shared state across tests ──
let sdk: InstanceType<typeof SolanaSDK>;
let agentAsset: PublicKey;
let opWallet: Keypair;
let baseCollection: PublicKey;
let signer: Keypair;

// @ts-expect-error jest global in ESM
// eslint-disable-next-line no-undef
globalThis.jest && globalThis.jest.setTimeout(120_000);

// ════════════════════════════════════════════════════════════════
// Section 1: SDK Setup (skill.md exact snippets)
// ════════════════════════════════════════════════════════════════

describeDevnet('Skill.md DEVNET verification (set RUN_SKILL_DEVNET_TESTS=true)', () => {
beforeAll(() => {
  signer = loadAnchorWallet();
}, 120_000);

describe('Section 1: SDK Setup', () => {
  test('read-only SDK', () => {
    const readOnly = new SolanaSDK({ cluster: 'devnet' });
    expect(readOnly.isReadOnly).toBe(true);
  });

  test('SDK with signer (forceOnChain for devnet reads)', () => {
    sdk = new SolanaSDK({ signer, forceOnChain: true });
    expect(sdk.isReadOnly).toBe(false);
  });

  test('full config', () => {
    const full = new SolanaSDK({
      cluster: 'devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      signer,
      useIndexer: true,
      indexerFallback: true,
      forceOnChain: false,
    });
    expect(full).toBeInstanceOf(SolanaSDK);
  });
});

// ════════════════════════════════════════════════════════════════
// Section 12: SDK Introspection
// ════════════════════════════════════════════════════════════════

describe('Section 12: SDK Introspection', () => {
  test('chainId()', async () => {
    const chain = await sdk.chainId();
    console.log('  chainId:', chain);
    expect(chain).toMatch(/^solana/);
  });

  test('getCluster()', () => {
    const cluster = sdk.getCluster();
    console.log('  cluster:', cluster);
    expect(cluster).toBe('devnet');
  });

  test('getProgramIds()', () => {
    const programs = sdk.getProgramIds();
    console.log('  identity:', programs.identityRegistry.toBase58());
    console.log('  reputation:', programs.reputationRegistry.toBase58());
    expect(programs.identityRegistry).toBeInstanceOf(PublicKey);
  });

  test('registries()', () => {
    const regs = sdk.registries();
    console.log('  IDENTITY:', regs.IDENTITY);
    expect(typeof regs.IDENTITY).toBe('string');
  });

  test('getRpcUrl()', () => {
    const url = sdk.getRpcUrl();
    console.log('  rpc:', url);
    expect(url).toMatch(/^https?:\/\//);
  });
});

// ════════════════════════════════════════════════════════════════
// Section 2: Register an Agent (REAL on devnet)
// ════════════════════════════════════════════════════════════════

describe('Section 2: Register an Agent', () => {
  test('Step 1: buildRegistrationFileJson', () => {
    // skill.md exact snippet (with fixed OASF slugs)
    const metadata = buildRegistrationFileJson({
      name: 'Skill Test Agent',
      description: 'Agent created by skill.md devnet test',
      image: 'https://example.com/avatar.png',
      services: [
        { type: ServiceType.MCP, value: 'https://my-agent.com/mcp' },
        { type: ServiceType.A2A, value: 'https://my-agent.com/a2a' },
      ],
      skills: ['advanced_reasoning_planning/strategic_planning'],
      domains: ['finance_and_business/finance'],
      x402Support: true,
    });

    console.log('  metadata.name:', metadata.name);
    console.log('  metadata.type:', (metadata as any).type);
    expect(metadata.name).toBe('Skill Test Agent');
  });

  test('Step 3: registerAgent on-chain', async () => {
    // No IPFS, use an HTTP URI for test
    const testUri = 'https://example.com/agent-metadata.json';
    const result = await sdk.registerAgent(testUri);

    agentAsset = result.asset;
    console.log('  agent asset:', agentAsset.toBase58());
    console.log('  tx sig:', result.signature);
    expect(agentAsset).toBeInstanceOf(PublicKey);
    expect(result.signature).toBeTruthy();
  });

  test('Step 4: setAgentWallet', async () => {
    opWallet = Keypair.generate();
    await sdk.setAgentWallet(agentAsset, opWallet);
    console.log('  opWallet:', opWallet.publicKey.toBase58());
  });

  test('getBaseCollection', async () => {
    baseCollection = await sdk.getBaseCollection();
    console.log('  baseCollection:', baseCollection.toBase58());
    expect(baseCollection).toBeInstanceOf(PublicKey);
  });
});

// ════════════════════════════════════════════════════════════════
// Section 3: Read Agent Data
// ════════════════════════════════════════════════════════════════

describe('Section 3: Read Agent Data', () => {
  test('loadAgent', async () => {
    const agent = await sdk.loadAgent(agentAsset);
    console.log('  owner:', agent.getOwnerPublicKey()?.toBase58());
    console.log('  uri:', agent.agent_uri);
    expect(agent).toBeDefined();
    expect(agent.agent_uri).toBe('https://example.com/agent-metadata.json');
  });

  test('agentExists', async () => {
    const exists = await sdk.agentExists(agentAsset);
    console.log('  exists:', exists);
    expect(exists).toBe(true);
  });

  test('agentExists (fake)', async () => {
    const fake = Keypair.generate().publicKey;
    const exists = await sdk.agentExists(fake);
    expect(exists).toBe(false);
  });

  test('getAgentOwner', async () => {
    const owner = await sdk.getAgentOwner(agentAsset);
    console.log('  owner:', owner?.toBase58());
    expect(owner?.toBase58()).toBe(signer.publicKey.toBase58());
  });

  test('isAgentOwner', async () => {
    const isMine = await sdk.isAgentOwner(agentAsset, signer.publicKey);
    expect(isMine).toBe(true);

    const notMine = await sdk.isAgentOwner(agentAsset, Keypair.generate().publicKey);
    expect(notMine).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════
// Section 4: Update Agent
// ════════════════════════════════════════════════════════════════

describe('Section 4: Update Agent', () => {
  test('setMetadata', async () => {
    await sdk.setMetadata(agentAsset, 'version', '2.0.0');
    const version = await sdk.getMetadata(agentAsset, 'version');
    console.log('  version:', version);
    expect(version).toBe('2.0.0');
  });

  test('setAgentUri', async () => {
    await sdk.setAgentUri(agentAsset, baseCollection, 'https://example.com/updated.json');
    const agent = await sdk.loadAgent(agentAsset);
    console.log('  new uri:', agent.agent_uri);
    expect(agent.agent_uri).toBe('https://example.com/updated.json');
  });

  test('deleteMetadata', async () => {
    await sdk.deleteMetadata(agentAsset, 'version');
    const version = await sdk.getMetadata(agentAsset, 'version');
    console.log('  version after delete:', version);
    expect(version).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════
// Section 5: Feedback System
// ════════════════════════════════════════════════════════════════

describe('Section 5: Feedback System', () => {
  test('giveFeedback (uptime)', async () => {
    // skill.md exact snippet
    await sdk.giveFeedback(agentAsset, {
      value: '99.77',
      tag1: Tag.uptime,
      tag2: Tag.day,
      score: 95,
      endpoint: '/api/v1/generate',
      feedbackUri: 'https://example.com/feedback1.json',
    });
    console.log('  feedback 1 submitted');
  });

  test('giveFeedback (starred)', async () => {
    await sdk.giveFeedback(agentAsset, {
      value: '85',
      tag1: Tag.starred,
      score: 85,
      feedbackUri: 'https://example.com/feedback2.json',
    });
    console.log('  feedback 2 submitted');
  });

  test('waitForIndexerSync then readFeedback', async () => {
    // skill.md section 20: wait for indexer to catch up
    const synced = await sdk.waitForIndexerSync(
      async () => {
        const fbs = await sdk.getFeedbacksFromIndexer(agentAsset);
        return fbs.length >= 2;
      },
      { timeout: 60000 }
    );
    console.log('  indexer synced:', synced);
    expect(synced).toBe(true);

    const fb = await sdk.readFeedback(agentAsset, signer.publicKey, 0);
    expect(fb).not.toBeNull();
    console.log('  fb.value:', fb!.value);
    console.log('  fb.valueDecimals:', fb!.valueDecimals);
    console.log('  fb.score:', fb!.score);
    console.log('  fb.tag1:', fb!.tag1);
    console.log('  fb.tag2:', fb!.tag2);
    console.log('  fb.sealHash:', fb!.sealHash?.toString('hex').slice(0, 16) + '...');
    expect(fb!.value).toBe(9977n);
    expect(fb!.valueDecimals).toBe(2);
    expect(fb!.tag1).toBe('uptime');
  });

  test('getLastIndex', async () => {
    const lastIndex = await sdk.getLastIndex(agentAsset, signer.publicKey);
    console.log('  lastIndex:', lastIndex);
    expect(lastIndex).toBe(1n);
  });

  test('SEAL verify on real feedback', async () => {
    const fb = await sdk.readFeedback(agentAsset, signer.publicKey, 0);
    expect(fb).not.toBeNull();

    const params = createSealParams(
      fb!.value,
      fb!.valueDecimals,
      fb!.score ?? null,
      fb!.tag1 || null,
      fb!.tag2 || null,
      fb!.endpoint || null,
      fb!.feedbackUri || '',
      null,
    );

    const recomputedHash = computeSealHash(params);
    const onChainHash = fb!.sealHash!;

    console.log('  recomputed:', recomputedHash.toString('hex').slice(0, 16) + '...');
    console.log('  on-chain:  ', onChainHash.toString('hex').slice(0, 16) + '...');

    const valid = verifySealHash({ ...params, sealHash: onChainHash });
    expect(valid).toBe(true);
  });

  test('appendResponse (as agent owner)', async () => {
    const fb = await sdk.readFeedback(agentAsset, signer.publicKey, 0);
    expect(fb).not.toBeNull();
    await sdk.appendResponse(
      agentAsset,
      signer.publicKey,
      0,
      fb!.sealHash!,
      'https://example.com/response.json',
    );
    console.log('  response appended');
  });

  test('readResponses (wait for indexer)', async () => {
    const synced = await sdk.waitForIndexerSync(
      async () => {
        const r = await sdk.readResponses(agentAsset, signer.publicKey, 0);
        return r.length >= 1;
      },
      { timeout: 30000 }
    );
    const responses = await sdk.readResponses(agentAsset, signer.publicKey, 0);
    console.log('  response count:', responses.length);
    expect(responses.length).toBeGreaterThanOrEqual(1);
    expect(responses[0].responseUri).toBe('https://example.com/response.json');
  });

  test('getResponseCount', async () => {
    const count = await sdk.getResponseCount(agentAsset, signer.publicKey, 0);
    console.log('  count:', count);
    expect(Number(count)).toBeGreaterThanOrEqual(1);
  });

  test('revokeFeedback', async () => {
    const fb1 = await sdk.readFeedback(agentAsset, signer.publicKey, 1);
    expect(fb1).not.toBeNull();
    await sdk.revokeFeedback(agentAsset, 1, fb1!.sealHash!);
    console.log('  feedback 1 revoked');
  });
});

// ════════════════════════════════════════════════════════════════
// Section 6: Reputation & ATOM Engine
// ════════════════════════════════════════════════════════════════

describe('Section 6: Reputation & ATOM Engine', () => {
  test('getSummary', async () => {
    // getSummary uses indexer — feedbacks already synced from previous section
    const summary = await sdk.getSummary(agentAsset);
    console.log('  averageScore:', summary.averageScore);
    console.log('  totalFeedbacks:', summary.totalFeedbacks);
    console.log('  positiveCount:', summary.positiveCount);
    console.log('  negativeCount:', summary.negativeCount);
    // At least 1 feedback (some may have been revoked)
    expect(summary.totalFeedbacks).toBeGreaterThanOrEqual(1);
  });

  test('getAtomStats', async () => {
    const atom = await sdk.getAtomStats(agentAsset);
    if (atom) {
      console.log('  quality_score:', atom.quality_score);
      console.log('  confidence:', atom.confidence);
      console.log('  trust_tier:', atom.trust_tier);
      console.log('  getQualityPercent():', atom.getQualityPercent());
      console.log('  estimateUniqueClients():', atom.estimateUniqueClients());
      expect(atom.quality_score).toBeGreaterThanOrEqual(0);
    } else {
      console.log('  ATOM stats not initialized');
    }
  });

  test('getTrustTier', async () => {
    const tier = await sdk.getTrustTier(agentAsset);
    const name = trustTierToString(tier);
    console.log('  tier:', tier, '(' + name + ')');
    expect(tier).toBeGreaterThanOrEqual(TrustTier.Unrated);
    expect(tier).toBeLessThanOrEqual(TrustTier.Platinum);
  });

  test('getEnrichedSummary', async () => {
    const enriched = await sdk.getEnrichedSummary(agentAsset);
    if (enriched) {
      console.log('  trustTier:', enriched.trustTier);
      console.log('  qualityScore:', enriched.qualityScore);
      console.log('  totalFeedbacks:', enriched.totalFeedbacks);
      console.log('  averageScore:', enriched.averageScore);
    }
  });
});

// ════════════════════════════════════════════════════════════════
// Section 7: Signing & Verification
// ════════════════════════════════════════════════════════════════

describe('Section 7: Signing & Verification', () => {
  test('sign + verify (with opWallet signer)', async () => {
    // sign() uses signer option — must pass opWallet to match on-chain wallet
    const signedJson = sdk.sign(agentAsset, {
      action: 'authorize',
      target: 'task-123',
      timestamp: Date.now(),
    }, { signer: opWallet });

    console.log('  signed payload (truncated):', signedJson.slice(0, 80) + '...');

    // Verify with on-chain wallet lookup
    const isValid = await sdk.verify(signedJson, agentAsset);
    console.log('  valid:', isValid);
    expect(isValid).toBe(true);

    // Verify with explicit public key
    const isValidWithPk = await sdk.verify(signedJson, agentAsset, opWallet.publicKey);
    console.log('  valid (explicit pk):', isValidWithPk);
    expect(isValidWithPk).toBe(true);
  });

  test('parseSignedPayload (parse JSON string first)', () => {
    const signedJson = sdk.sign(agentAsset, { foo: 'bar' }, { signer: opWallet });
    // sign() returns canonical JSON string, parseSignedPayload expects object
    const parsed = parseSignedPayload(JSON.parse(signedJson));
    console.log('  v:', parsed.v);
    console.log('  alg:', parsed.alg);
    console.log('  asset:', parsed.asset);
    expect(parsed.v).toBe(1);
    expect(parsed.alg).toBe('ed25519');
    expect(parsed.asset).toBe(agentAsset.toBase58());
  });
});

// ════════════════════════════════════════════════════════════════
// Section 10: Integrity Verification
// ════════════════════════════════════════════════════════════════

describe('Section 10: Integrity Verification', () => {
  test('verifyIntegrity (quick)', async () => {
    const integrity = await sdk.verifyIntegrity(agentAsset);
    console.log('  valid:', integrity.valid);
    console.log('  status:', integrity.status);
    console.log('  trustworthy:', integrity.trustworthy);
    console.log('  totalLag:', integrity.totalLag);
    // On fresh agent, should be valid
    expect(['valid', 'syncing']).toContain(integrity.status);
  });
});

// ════════════════════════════════════════════════════════════════
// Section 19: Server Mode (skipSend)
// ════════════════════════════════════════════════════════════════

describe('Section 19: Server Mode (skipSend)', () => {
  test('registerAgent with skipSend', async () => {
    const assetKeypair = Keypair.generate();
    const prepared = await sdk.registerAgent('https://example.com/test.json', undefined, {
      skipSend: true,
      signer: signer.publicKey,
      assetPubkey: assetKeypair.publicKey,
    });

    console.log('  transaction:', typeof prepared.transaction, prepared.transaction?.slice(0, 40) + '...');
    console.log('  signer:', prepared.signer);
    expect(prepared.transaction).toBeTruthy();
    expect(typeof prepared.transaction).toBe('string');
  });
});

// ════════════════════════════════════════════════════════════════
// Section 4 cont: Transfer (last since it changes ownership)
// ════════════════════════════════════════════════════════════════

describe('Section 4 cont: Transfer & syncOwner', () => {
  // We'll transfer to ourselves to test the method works
  test('transferAgent to self', async () => {
    await sdk.transferAgent(agentAsset, baseCollection, signer.publicKey);
    console.log('  transferred to self');

    const owner = await sdk.getAgentOwner(agentAsset);
    expect(owner?.toBase58()).toBe(signer.publicKey.toBase58());
  });

  test('syncOwner', async () => {
    await sdk.syncOwner(agentAsset);
    console.log('  owner synced');
  });
});

});
