#!/usr/bin/env node

import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import bs58 from 'bs58';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  SolanaSDK,
  computeSealHash,
  createSealParams,
} from '../dist/index.js';

const DEFAULT_RPC = 'https://api.devnet.solana.com';
const TX_FEE_SOL = 0.000005;
const REAL_IPFS_CIDS = [
  'bafybeifxluov6w2xqdnf6z5iivg3mzyk7dwrzupwec4jzbsnqv5pt7r7la',
  'bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku',
  'bafybeigdyrzt6f5qjjtntm2zyswnhfhf2qgkq2udkw7wfx5caxn5s7vbeq',
  'bafkreicgeyijdfsj7kueecimaxi2jf5zeetnnl5s72xkpq5mjxnw7v3tpq',
  'bafkreibrab3yngdn7pyx2uqepiuhbvuraovzufq3bq4q3phxcssyn26p3q',
  'bafkreidnoxhqusy2qe7pipbfzzocgf44udunapyiic4n5gqgprnhwxnrbq',
  'bafkreia6cnqnm66r2mh5eutlthaiuhe5we75gelrfiejlfljokog5birue',
  'bafkreigxxg4tuk4ac5brwpec6b7y4cwjbgtw7isp6qgkwrcsssypd3lsum',
  'bafkreia2mm6ybext56ms56sa4ooqatrh7hng6fss7wby2yceuvvzabwusq',
  'bafkreice4ycdlxyykcz3sebcsm25ppb35hr5mcyrag7piung4moxrbbf2u',
  'QmS2PiicDjM3JSWj8EVHYxnW6LT8ELn8vsqCeZPFH6odxk',
  'QmU5iGshDxcW9wv5uXqWLEcmpS9MGgcjsyG7BNYxNya1zK',
  'QmbEs88bmr5V1YTuCrpK2nHims78MHqjERb68NyUZiEjTZ',
  'QmPrCHZcJ5ok27Xknj2vZj2sZjXXYTcqKMLLQLQJfMuUAy',
  'QmbwqzsBeenmhkJBz7N75tu9kQF7mCyNpweTSMW7ugvBWB',
  'Qmec7mP6XZoaZ1FzYkX7CfJBfnSNyBM1BuKxdKPQFHkh2h',
  'QmeP3WmqeK6sNysLKh6PnSr7ZK5crGfXdKeeydSLobhwNP',
  'QmWqH8PQbkTuzdNfVWqy4JRQZHtKJMLAfAGR4YCAHAXugc',
];
const REAL_IPFS_URIS = REAL_IPFS_CIDS.map((cid) => `ipfs://${cid}`);
const REAL_IPFS_BASE32_CIDS = REAL_IPFS_CIDS
  .map((cid) => String(cid).toLowerCase())
  .filter((cid) => /^b[a-z2-7]+$/.test(cid));

function envNum(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envInt(name, fallback) {
  return Math.floor(envNum(name, fallback));
}

function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function isLikelyExpiredSignatureError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('block height exceeded') ||
    message.includes('transactionexpiredblockheightexceedederror') ||
    message.includes('signature has expired') ||
    message.includes('blockhash not found')
  );
}

function nowIso() {
  return new Date().toISOString();
}

function makeRunId() {
  return `sdk-stress-${Date.now()}`;
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function writeJson(path, payload) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(payload, null, 2));
}

function parseSecretKey(raw) {
  const trimmed = String(raw).trim();
  if (trimmed.startsWith('[')) {
    const arr = JSON.parse(trimmed);
    if (!Array.isArray(arr)) throw new Error('Private key JSON must be an array');
    return Uint8Array.from(arr);
  }
  if (trimmed.includes(',')) {
    const arr = trimmed
      .split(',')
      .map((p) => Number.parseInt(p.trim(), 10))
      .filter((n) => Number.isFinite(n));
    return Uint8Array.from(arr);
  }
  try {
    const decoded = bs58.decode(trimmed);
    if (decoded.length === 64) return Uint8Array.from(decoded);
  } catch {
    // keep falling
  }
  throw new Error('Unsupported private key format');
}

function loadSigner() {
  const raw = process.env.SOLANA_PRIVATE_KEY || process.env.E2E_INDEXERS_SOLANA_PRIVATE_KEY;
  if (raw) return Keypair.fromSecretKey(parseSecretKey(raw));

  const walletPath =
    process.env.ANCHOR_WALLET ||
    process.env.SOLANA_KEYPAIR_PATH ||
    resolve(process.env.HOME || '.', '.config/solana/id.json');

  if (!existsSync(walletPath)) {
    throw new Error(
      `No signer found. Set SOLANA_PRIVATE_KEY or ANCHOR_WALLET (current: ${walletPath})`
    );
  }

  const arr = JSON.parse(readFileSync(walletPath, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

function short(value, size = 8) {
  if (!value) return '';
  if (value.length <= size * 2) return value;
  return `${value.slice(0, size)}...${value.slice(-size)}`;
}

function normalizeHex(value) {
  if (!value) return null;
  return String(value).toLowerCase().replace(/^0x/, '');
}

function toHex(bufferLike) {
  return Buffer.from(bufferLike).toString('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function withRetry(label, fn, attempts = 4, baseDelayMs = 500) {
  let last = null;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      const msg = String(error?.message || error).toLowerCase();
      const retryable =
        msg.includes('429') ||
        msg.includes('rate') ||
        msg.includes('blockhash') ||
        msg.includes('block height exceeded') ||
        msg.includes('signature') && msg.includes('expired') ||
        msg.includes('timeout') ||
        msg.includes('node is behind') ||
        msg.includes('socket') ||
        msg.includes('connection');
      if (!retryable || i === attempts) break;
      const delay = baseDelayMs * i;
      await sleep(delay);
    }
  }
  throw new Error(`${label} failed: ${String(last?.message || last || 'unknown error')}`);
}

async function runPool(items, concurrency, worker) {
  const total = items.length;
  if (total === 0) return;
  let cursor = 0;
  const width = Math.max(1, Math.min(concurrency, total));
  const workers = Array.from({ length: width }, () =>
    (async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= total) return;
        await worker(items[idx], idx);
      }
    })()
  );
  await Promise.all(workers);
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickTargetsByRatio(items, ratio) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const clamped = Math.max(0, Math.min(1, ratio));
  const count = Math.floor(items.length * clamped);
  if (count <= 0) return [];
  return shuffle(items).slice(0, count);
}

function randomHash(seedA, seedB) {
  const out = Buffer.alloc(32);
  out.writeUInt32LE(seedA >>> 0, 0);
  out.writeUInt32LE(seedB >>> 0, 4);
  for (let i = 8; i < 32; i += 1) out[i] = (seedA * 17 + seedB * 31 + i) & 0xff;
  return out;
}

function makeRegisterUri(index, malformedRatio, realIpfsRatio) {
  const validNonIpfs = [
    `https://agents.8004.devnet/${index}.json`,
    `ar://sdk_agent_${index}`,
    `https://registry.8004.devnet/agents/${index}.json`,
  ];
  const invalid = ['', ' ', 'https://', 'javascript:alert(1)', `ipfs://${'x'.repeat(9)}`];
  const malformed = Math.random() < malformedRatio;
  const realIpfs = !malformed && Math.random() < realIpfsRatio;
  const source = malformed ? invalid : (realIpfs ? REAL_IPFS_URIS : validNonIpfs);
  return {
    uri: source[index % source.length],
    malformed,
    realIpfs,
  };
}

function makeFeedbackPayload(index, malformedRatio) {
  const validTags1 = ['quality', 'uptime', 'latency', 'accuracy', 'costs'];
  const validTags2 = ['day', 'week', 'month', 'hour'];
  const badTags1 = ['', 'tag with spaces', 'x'.repeat(80)];
  const badTags2 = ['', 'invalid_period', 'week\nnewline'];
  const validEndpoints = [
    'https://api.8004.devnet/v1',
    'https://telemetry.8004.devnet/score',
    'https://service.8004.devnet/eval',
  ];
  const badEndpoints = ['', 'https://', 'javascript:1', 'ftp://legacy.host'];
  const validUris = [
    `ipfs://bafybeifeedback${index.toString(16).padStart(12, '0')}`,
    `https://feedback.8004.devnet/${index}.json`,
    `https://arweave.net/feedback_${index}`,
  ];
  const badUris = ['', ' ', 'http://', `ipfs://${'a'.repeat(10)}`];

  const malformed = Math.random() < malformedRatio;
  const value = BigInt((index % 2 === 0 ? 1 : -1) * (1000 + (index % 50000)));
  const valueDecimals = index % 4;
  const score = index % 8 === 0 ? undefined : 55 + (index % 40);

  return {
    value,
    valueDecimals,
    score,
    tag1: (malformed ? badTags1 : validTags1)[
      index % (malformed ? badTags1.length : validTags1.length)
    ],
    tag2: (malformed ? badTags2 : validTags2)[
      index % (malformed ? badTags2.length : validTags2.length)
    ],
    endpoint: (malformed ? badEndpoints : validEndpoints)[
      index % (malformed ? badEndpoints.length : validEndpoints.length)
    ],
    feedbackUri: (malformed ? badUris : validUris)[
      index % (malformed ? badUris.length : validUris.length)
    ],
    feedbackFileHash: null,
    malformed,
  };
}

function makeResponsePayload(index, malformedRatio) {
  const validUris = [
    `ipfs://bafybeiresponse${index.toString(16).padStart(12, '0')}`,
    `https://responses.8004.devnet/${index}.json`,
  ];
  const badUris = ['', ' ', 'https://', `ipfs://${'b'.repeat(10)}`];
  const malformed = Math.random() < malformedRatio;
  const responseUri = (malformed ? badUris : validUris)[
    index % (malformed ? badUris.length : validUris.length)
  ];
  return {
    responseUri,
    responseHash: randomHash(700000 + index, 333),
    malformed,
  };
}

function makeCollectionPointerPayload(index) {
  const fallbackCid = 'bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku';
  const cid = REAL_IPFS_BASE32_CIDS[index % REAL_IPFS_BASE32_CIDS.length] || fallbackCid;
  return {
    collectionPointer: `c1:${cid}`,
    lock: index % 3 === 0 ? false : true,
  };
}

function makeSetUriPayload(index) {
  const variant = index % 4;
  if (variant === 0) {
    return {
      uri: REAL_IPFS_URIS[index % REAL_IPFS_URIS.length],
      source: 'ipfs',
    };
  }
  if (variant === 1) {
    return {
      uri: `https://agents.8004.devnet/mutated/${index}?rev=${(index % 17) + 1}`,
      source: 'https-query',
    };
  }
  if (variant === 2) {
    return {
      uri: `ar://sdk_mutated_agent_${index.toString(16)}`,
      source: 'ar',
    };
  }
  return {
    uri: `https://registry.8004.devnet/agents/${index}/metadata.json`,
    source: 'https-path',
  };
}

function makeMetadataPayload(runId, agentIndex, writeIndex) {
  const keyBuckets = ['stressver', 'stressrole', 'stressmode', 'stressregion', 'stressbatch'];
  const key = `${keyBuckets[(agentIndex + writeIndex) % keyBuckets.length]}_${writeIndex}`
    .slice(0, 32);
  const value = `run:${runId};agent:${agentIndex};write:${writeIndex};mode:${(agentIndex + writeIndex) % 7};tick:${Date.now().toString(36)}`
    .slice(0, 250);
  return {
    key,
    value,
    immutable: false,
  };
}

function estimateOperationCost(counts, costs) {
  return (
    counts.agents * costs.register +
    counts.feedbacks * costs.feedback +
    counts.responses * costs.response +
    counts.revokes * costs.revoke
  );
}

function buildPlan(config, ownerBalanceSol) {
  const req = config.requested;
  const costs = config.costs;
  const maxBudget = config.forceBudget
    ? config.budgetSol
    : Math.min(config.budgetSol, Math.max(0, ownerBalanceSol - 0.05));

  let wallets = req.wallets;
  let walletFundSol = config.walletFundSol;
  const minWalletFundSol = config.minWalletFundSol;

  let walletFloat = wallets * walletFundSol;
  let opBudget = maxBudget - config.reserveSol - walletFloat;

  if (opBudget < 0.4) {
    walletFundSol = Math.max(minWalletFundSol, (maxBudget - config.reserveSol - 0.4) / wallets);
    walletFloat = wallets * walletFundSol;
    opBudget = maxBudget - config.reserveSol - walletFloat;
  }

  if (opBudget < 0.25) {
    wallets = Math.max(
      config.minWallets,
      Math.floor((maxBudget - config.reserveSol - 0.25) / Math.max(walletFundSol, minWalletFundSol))
    );
    walletFloat = wallets * walletFundSol;
    opBudget = maxBudget - config.reserveSol - walletFloat;
  }

  const reqOpCost = estimateOperationCost(req, costs);
  const scale = reqOpCost <= 0 ? 1 : Math.max(0.05, Math.min(1, opBudget / reqOpCost));

  const agents = Math.max(1, Math.floor(req.agents * scale));
  const feedbacks = Math.max(agents, Math.floor(req.feedbacks * scale));
  const responses = Math.min(Math.floor(req.responses * scale), feedbacks);
  const revokes = Math.min(Math.floor(req.revokes * scale), feedbacks);

  const plannedCounts = { agents, feedbacks, responses, revokes, wallets };
  const operationCost = estimateOperationCost(plannedCounts, costs);
  const grossRequired = operationCost + wallets * walletFundSol;
  const clientSignedOps = feedbacks + revokes + wallets;
  const transferOps = Math.ceil(wallets / config.fundBatchSize) + wallets;
  const feeBurnSol = (clientSignedOps + transferOps) * TX_FEE_SOL;
  const netAfterRecovery = operationCost + feeBurnSol;

  return {
    budgetSol: maxBudget,
    walletFundSol,
    counts: plannedCounts,
    scale,
    operationCostSol: operationCost,
    walletFloatSol: wallets * walletFundSol,
    estimatedGrossRequiredSol: grossRequired,
    estimatedNetAfterRecoverySol: netAfterRecovery,
    estimatedFeeBurnSol: feeBurnSol,
  };
}

function makeConfig(runId) {
  return {
    runId,
    rpcUrl: process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || DEFAULT_RPC,
    indexerUrl: process.env.INDEXER_URL || null,
    indexerApiKey: process.env.INDEXER_API_KEY || undefined,
    budgetSol: envNum('STRESS_BUDGET_SOL', 10),
    forceBudget: envBool('STRESS_FORCE_BUDGET', false),
    reserveSol: envNum('STRESS_RESERVE_SOL', 0.25),
    minWallets: Math.max(1, envInt('STRESS_MIN_WALLETS', 20)),
    walletFundSol: envNum('STRESS_WALLET_FUND_SOL', 0.0012),
    minWalletFundSol: envNum('STRESS_MIN_WALLET_FUND_SOL', 0.0008),
    fundBatchSize: Math.max(1, envInt('STRESS_FUND_BATCH_SIZE', 8)),
    fundConcurrency: Math.max(1, envInt('STRESS_FUND_CONCURRENCY', 4)),
    fundConfirmTimeoutMs: Math.max(8000, envInt('STRESS_FUND_CONFIRM_TIMEOUT_MS', 30000)),
    malformedRatio: Math.max(0, Math.min(0.7, envNum('STRESS_MALFORMED_RATIO', 0.2))),
    fakeSealRatio: Math.max(0, Math.min(0.9, envNum('STRESS_FAKE_SEAL_RATIO', 0.18))),
    realIpfsRatio: Math.max(0, Math.min(1, envNum('STRESS_REAL_IPFS_RATIO', 0.65))),
    collectionPointerRatio: Math.max(0, Math.min(1, envNum('STRESS_COLLECTION_POINTER_RATIO', 0.35))),
    parentRatio: Math.max(0, Math.min(1, envNum('STRESS_PARENT_RATIO', 0.25))),
    setUriRatio: Math.max(0, Math.min(1, envNum('STRESS_SET_URI_RATIO', 0.40))),
    metadataRatio: Math.max(0, Math.min(1, envNum('STRESS_METADATA_RATIO', 0.20))),
    setWalletRatio: Math.max(0, Math.min(1, envNum('STRESS_SET_WALLET_RATIO', 0.15))),
    metadataPerAgent: Math.max(0, envInt('STRESS_METADATA_PER_AGENT', 1)),
    registerAtomRatio: Math.max(0, Math.min(1, envNum('STRESS_REGISTER_ATOM_RATIO', 0.5))),
    registerAtomEnabled: envBool('STRESS_REGISTER_ATOM_ENABLED', true),
    retries: Math.max(1, envInt('STRESS_RETRIES', 4)),
    planOnly: envBool('STRESS_PLAN_ONLY', true),
    recoverFunds: envBool('STRESS_RECOVER_FUNDS', true),
    compareIndexer: envBool('STRESS_COMPARE_INDEXER', true),
    compareConcurrency: Math.max(1, envInt('STRESS_COMPARE_CONCURRENCY', 24)),
    compareTimeoutMs: Math.max(5000, envInt('STRESS_COMPARE_TIMEOUT_MS', 180000)),
    concurrency: {
      register: Math.max(1, envInt('STRESS_CONCURRENCY_REGISTER', 24)),
      feedback: Math.max(1, envInt('STRESS_CONCURRENCY_FEEDBACK', 40)),
      response: Math.max(1, envInt('STRESS_CONCURRENCY_RESPONSE', 56)),
      revoke: Math.max(1, envInt('STRESS_CONCURRENCY_REVOKE', 56)),
      recover: Math.max(1, envInt('STRESS_CONCURRENCY_RECOVER', 28)),
      identity: Math.max(1, envInt('STRESS_CONCURRENCY_IDENTITY', 24)),
    },
    requested: {
      agents: Math.max(1, envInt('STRESS_AGENTS', 2000)),
      feedbacks: Math.max(1, envInt('STRESS_FEEDBACKS', 3000)),
      responses: Math.max(0, envInt('STRESS_RESPONSES', 2000)),
      revokes: Math.max(0, envInt('STRESS_REVOKES', 1500)),
      wallets: Math.max(1, envInt('STRESS_WALLETS', 800)),
    },
    costs: {
      register: Math.max(0, envNum('STRESS_COST_REGISTER_SOL', 0.006)),
      feedback: Math.max(0, envNum('STRESS_COST_FEEDBACK_SOL', 0.00001)),
      response: Math.max(0, envNum('STRESS_COST_RESPONSE_SOL', 0.00001)),
      revoke: Math.max(0, envNum('STRESS_COST_REVOKE_SOL', 0.00001)),
    },
  };
}

async function main() {
  const runId = process.env.STRESS_RUN_ID || makeRunId();
  const config = makeConfig(runId);
  const runDir = resolve(`artifacts/stress-sdk/${runId}`);
  ensureDir(runDir);
  const actionLogPath = resolve(runDir, 'actions.jsonl');
  const summaryPath = resolve(runDir, 'summary.json');
  const comparePath = resolve(runDir, 'compare-indexer.json');
  const walletsPath = resolve(runDir, 'wallets.json');

  const actionStream = createWriteStream(actionLogPath, { flags: 'a' });
  let actionSeq = 0;
  const logAction = (row) => {
    const payload = { seq: ++actionSeq, ts: nowIso(), ...row };
    actionStream.write(`${JSON.stringify(payload)}\n`);
  };

  const owner = loadSigner();
  const ownerPubkey = owner.publicKey.toBase58();

  const ownerSdkCfg = {
    rpcUrl: config.rpcUrl,
    signer: owner,
  };
  if (config.indexerUrl) ownerSdkCfg.indexerUrl = config.indexerUrl;
  if (config.indexerApiKey) ownerSdkCfg.indexerApiKey = config.indexerApiKey;
  const ownerSdk = new SolanaSDK(ownerSdkCfg);
  const connection = ownerSdk.getSolanaClient().getConnection();

  const ownerBalanceLamports = await connection.getBalance(owner.publicKey, 'confirmed');
  const ownerBalanceSol = ownerBalanceLamports / LAMPORTS_PER_SOL;
  const plan = buildPlan(config, ownerBalanceSol);
  const rentExemptLamports = await connection.getMinimumBalanceForRentExemption(0);
  const minimumFundingLamports = rentExemptLamports + 50_000;
  const plannedFundingLamports = Math.floor(plan.walletFundSol * LAMPORTS_PER_SOL);
  if (plannedFundingLamports < minimumFundingLamports) {
    const adjustedWalletFundSol = minimumFundingLamports / LAMPORTS_PER_SOL;
    plan.walletFundSol = adjustedWalletFundSol;
    plan.walletFloatSol = plan.counts.wallets * adjustedWalletFundSol;
    plan.estimatedGrossRequiredSol = plan.operationCostSol + plan.walletFloatSol;
  }

  const summary = {
    runId,
    startedAt: nowIso(),
    rpcUrl: config.rpcUrl,
    indexerUrl: config.indexerUrl,
    ownerWallet: ownerPubkey,
    ownerBalanceSol,
    config,
    plan,
    status: 'planned',
    counters: {
      fundingTx: 0,
      registerOk: 0,
      registerFail: 0,
      collectionPointerOk: 0,
      collectionPointerFail: 0,
      setParentOk: 0,
      setParentFail: 0,
      setAgentUriOk: 0,
      setAgentUriFail: 0,
      setMetadataOk: 0,
      setMetadataFail: 0,
      setAgentWalletOk: 0,
      setAgentWalletFail: 0,
      feedbackOk: 0,
      feedbackFail: 0,
      responseOk: 0,
      responseFail: 0,
      revokeOk: 0,
      revokeFail: 0,
      recoverOk: 0,
      recoverFail: 0,
      fakeSealResponseSent: 0,
      fakeSealRevokeSent: 0,
    },
    artifacts: {
      actionLogPath,
      summaryPath,
      comparePath,
      walletsPath,
    },
    notes: [],
    errors: [],
  };

  if (plannedFundingLamports < minimumFundingLamports) {
    summary.notes.push(
      `wallet funding raised to rent-safe floor (${minimumFundingLamports} lamports, ${plan.walletFundSol.toFixed(6)} SOL)`
    );
  }

  writeJson(summaryPath, summary);

  console.log('=== SDK Devnet Aggressive Stress Plan ===');
  console.log(`run_id=${runId}`);
  console.log(`owner_wallet=${ownerPubkey}`);
  console.log(`owner_balance=${ownerBalanceSol.toFixed(6)} SOL`);
  console.log(
    `planned: agents=${plan.counts.agents}, feedbacks=${plan.counts.feedbacks}, responses=${plan.counts.responses}, revokes=${plan.counts.revokes}, wallets=${plan.counts.wallets}`
  );
  console.log(
    `budget: gross_required=${plan.estimatedGrossRequiredSol.toFixed(6)} SOL, net_after_recovery=${plan.estimatedNetAfterRecoverySol.toFixed(6)} SOL`
  );

  if (config.planOnly) {
    summary.status = 'plan-only';
    summary.endedAt = nowIso();
    writeJson(summaryPath, summary);
    actionStream.end();
    console.log(`plan_only=1 summary=${summaryPath}`);
    return;
  }

  if (plan.estimatedGrossRequiredSol > ownerBalanceSol) {
    summary.status = 'failed';
    summary.errors.push(
      `Insufficient owner balance (${ownerBalanceSol.toFixed(6)} SOL) for estimated gross requirement (${plan.estimatedGrossRequiredSol.toFixed(6)} SOL)`
    );
    summary.endedAt = nowIso();
    writeJson(summaryPath, summary);
    actionStream.end();
    throw new Error(summary.errors[summary.errors.length - 1]);
  }

  const workers = [];
  const walletRecords = [];
  const mutationWalletRecords = [];
  for (let i = 0; i < plan.counts.wallets; i += 1) {
    const kp = Keypair.generate();
    const cfg = {
      rpcUrl: config.rpcUrl,
      signer: kp,
    };
    if (config.indexerUrl) cfg.indexerUrl = config.indexerUrl;
    if (config.indexerApiKey) cfg.indexerApiKey = config.indexerApiKey;
    workers.push({ keypair: kp, sdk: new SolanaSDK(cfg) });
    walletRecords.push({
      index: i,
      publicKey: kp.publicKey.toBase58(),
      privateKeyBase58: bs58.encode(kp.secretKey),
    });
  }
  const walletsArtifact = {
    runId,
    ownerWallet: ownerPubkey,
    workers: walletRecords,
    mutationWallets: mutationWalletRecords,
  };
  writeJson(walletsPath, walletsArtifact);

  const fundingLamports = Math.max(
    Math.floor(plan.walletFundSol * LAMPORTS_PER_SOL),
    minimumFundingLamports
  );
  const walletChunks = chunk(workers, config.fundBatchSize);
  const fundingJobs = walletChunks.map((targets, chunkIndex) => ({ targets, chunkIndex }));
  let fundingDone = 0;
  await runPool(fundingJobs, config.fundConcurrency, async ({ targets, chunkIndex }) => {
    const recipientsAll = targets.map((w) => w.keypair.publicKey.toBase58());
    let pendingWorkers = [...targets];
    let batchSignature = null;
    let recoveredAfterExpiry = false;
    let lastError = null;

    const buildFundingTx = (currentTargets) => {
      const tx = new Transaction();
      for (const w of currentTargets) {
        tx.add(
          SystemProgram.transfer({
            fromPubkey: owner.publicKey,
            toPubkey: w.keypair.publicKey,
            lamports: fundingLamports,
          })
        );
      }
      return tx;
    };

    for (let attempt = 1; attempt <= config.retries; attempt += 1) {
      if (pendingWorkers.length === 0) break;
      try {
        batchSignature = await withTimeout(
          sendAndConfirmTransaction(connection, buildFundingTx(pendingWorkers), [owner], {
            skipPreflight: true,
            commitment: 'confirmed',
            maxRetries: 3,
          }),
          config.fundConfirmTimeoutMs,
          `fund-wallet-batch-${chunkIndex}-attempt-${attempt}`
        );
        pendingWorkers = [];
        break;
      } catch (error) {
        lastError = error;
        const msg = String(error?.message || error || '').toLowerCase();
        if (isLikelyExpiredSignatureError(error) || msg.includes('timed out')) {
          const balances = await Promise.all(
            pendingWorkers.map((w) => connection.getBalance(w.keypair.publicKey, 'confirmed'))
          );
          const stillPending = [];
          for (let j = 0; j < pendingWorkers.length; j += 1) {
            if (balances[j] < fundingLamports) stillPending.push(pendingWorkers[j]);
          }
          if (stillPending.length !== pendingWorkers.length) {
            recoveredAfterExpiry = true;
          }
          pendingWorkers = stillPending;
          if (pendingWorkers.length === 0) break;
        }
        if (attempt < config.retries) {
          await sleep(800 * attempt);
        }
      }
    }

    if (pendingWorkers.length === 0) {
      summary.counters.fundingTx += 1;
      logAction({
        phase: 'funding',
        success: true,
        txSignature: batchSignature,
        payload: {
          recipients: recipientsAll,
          lamportsPerWallet: fundingLamports,
          recoveredAfterExpiry,
        },
      });
    } else {
      logAction({
        phase: 'funding',
        success: false,
        error: `fund-wallet-batch-${chunkIndex} failed: ${String(lastError?.message || lastError)}`,
        payload: {
          recipients: recipientsAll,
          pendingRecipients: pendingWorkers.map((w) => w.keypair.publicKey.toBase58()),
          lamportsPerWallet: fundingLamports,
        },
      });
      summary.errors.push(
        `Funding batch ${chunkIndex} failed: ${String(lastError?.message || lastError)}`
      );
    }

    fundingDone += 1;
    if (fundingDone % 10 === 0 || fundingDone === fundingJobs.length) {
      console.log(
        `funding_progress=${fundingDone}/${fundingJobs.length} (ok=${summary.counters.fundingTx}, failed=${summary.errors.filter((e) => e.startsWith('Funding batch')).length})`
      );
    }
  });

  const agents = [];
  const registerTargets = Array.from({ length: plan.counts.agents }, (_, i) => i);

  await runPool(registerTargets, config.concurrency.register, async (index) => {
    const { uri, malformed, realIpfs } = makeRegisterUri(
      index,
      config.malformedRatio,
      config.realIpfsRatio
    );
    const atomEnabled = config.registerAtomEnabled && Math.random() < config.registerAtomRatio;
    try {
      const result = await withRetry(
        `register-${index}`,
        () => ownerSdk.registerAgent(uri, { atomEnabled }),
        config.retries,
        700
      );
      if (!result || result.success === false || !result.asset) {
        throw new Error(result?.error || 'register returned empty asset');
      }
      const asset = result.asset.toBase58();
      agents.push({
        index,
        asset,
        pubkey: result.asset,
        feedbackCount: 0,
      });
      summary.counters.registerOk += 1;
      logAction({
        phase: 'register',
        success: true,
        txSignature: result.signature || null,
        wallet: ownerPubkey,
        asset,
        payload: { uri, malformed, realIpfs, atomEnabled },
      });
    } catch (error) {
      summary.counters.registerFail += 1;
      logAction({
        phase: 'register',
        success: false,
        wallet: ownerPubkey,
        payload: { uri, malformed, realIpfs, atomEnabled },
        error: String(error?.message || error),
      });
    }
  });

  const identityConcurrency = config.concurrency.identity;
  const agentSlots = agents.map((agent, position) => ({ agent, position }));

  const collectionPointerTargets = pickTargetsByRatio(agentSlots, config.collectionPointerRatio);
  if (collectionPointerTargets.length > 0) {
    await runPool(collectionPointerTargets, identityConcurrency, async (item, idx) => {
      const payload = makeCollectionPointerPayload(item.agent.index + idx);
      try {
        const result = await withRetry(
          `collection-pointer-${item.agent.index}-${idx}`,
          () => ownerSdk.setCollectionPointer(item.agent.pubkey, payload.collectionPointer, { lock: payload.lock }),
          config.retries,
          650
        );
        if (!result || result.success === false) {
          throw new Error(result?.error || 'setCollectionPointer failed');
        }
        summary.counters.collectionPointerOk += 1;
        logAction({
          phase: 'collection-pointer',
          success: true,
          txSignature: result.signature || null,
          wallet: ownerPubkey,
          asset: item.agent.asset,
          payload: {
            targetAsset: item.agent.asset,
            collectionPointer: payload.collectionPointer,
            lock: payload.lock,
          },
        });
      } catch (error) {
        summary.counters.collectionPointerFail += 1;
        logAction({
          phase: 'collection-pointer',
          success: false,
          wallet: ownerPubkey,
          asset: item.agent.asset,
          payload: {
            targetAsset: item.agent.asset,
            collectionPointer: payload.collectionPointer,
            lock: payload.lock,
          },
          error: String(error?.message || error),
        });
      }
    });
    console.log(
      `[collection-pointer] sent=${collectionPointerTargets.length} ok=${summary.counters.collectionPointerOk} fail=${summary.counters.collectionPointerFail}`
    );
  }

  const parentTargets = agents.length > 1 ? pickTargetsByRatio(agentSlots, config.parentRatio) : [];
  if (parentTargets.length > 0 && agents.length > 1) {
    await runPool(parentTargets, identityConcurrency, async (item, idx) => {
      const parentOffset = 1 + (idx % (agents.length - 1));
      const parent = agents[(item.position + parentOffset) % agents.length];
      const payload = {
        targetAsset: item.agent.asset,
        parentAsset: parent.asset,
        lock: idx % 2 === 0,
      };
      try {
        const result = await withRetry(
          `set-parent-${item.agent.index}-${idx}`,
          () => ownerSdk.setParentAsset(item.agent.pubkey, parent.pubkey, { lock: payload.lock }),
          config.retries,
          650
        );
        if (!result || result.success === false) {
          throw new Error(result?.error || 'setParentAsset failed');
        }
        summary.counters.setParentOk += 1;
        logAction({
          phase: 'set-parent',
          success: true,
          txSignature: result.signature || null,
          wallet: ownerPubkey,
          asset: item.agent.asset,
          payload,
        });
      } catch (error) {
        summary.counters.setParentFail += 1;
        logAction({
          phase: 'set-parent',
          success: false,
          wallet: ownerPubkey,
          asset: item.agent.asset,
          payload,
          error: String(error?.message || error),
        });
      }
    });
    console.log(
      `[set-parent] sent=${parentTargets.length} ok=${summary.counters.setParentOk} fail=${summary.counters.setParentFail}`
    );
  }

  const setUriTargets = pickTargetsByRatio(agentSlots, config.setUriRatio);
  if (setUriTargets.length > 0) {
    let baseCollection = null;
    try {
      baseCollection = await ownerSdk.getBaseCollection();
    } catch (error) {
      summary.notes.push(`set-agent-uri base collection lookup failed: ${String(error?.message || error)}`);
    }
    const baseCollectionB58 = baseCollection ? baseCollection.toBase58() : null;
    await runPool(setUriTargets, identityConcurrency, async (item, idx) => {
      const uriPayload = makeSetUriPayload(item.agent.index + idx);
      const payload = {
        targetAsset: item.agent.asset,
        uri: uriPayload.uri,
        source: uriPayload.source,
        baseCollection: baseCollectionB58,
      };
      try {
        const result = await withRetry(
          `set-agent-uri-${item.agent.index}-${idx}`,
          () =>
            baseCollection
              ? ownerSdk.setAgentUri(item.agent.pubkey, baseCollection, uriPayload.uri)
              : ownerSdk.setAgentUri(item.agent.pubkey, uriPayload.uri),
          config.retries,
          650
        );
        if (!result || result.success === false) {
          throw new Error(result?.error || 'setAgentUri failed');
        }
        summary.counters.setAgentUriOk += 1;
        logAction({
          phase: 'set-agent-uri',
          success: true,
          txSignature: result.signature || null,
          wallet: ownerPubkey,
          asset: item.agent.asset,
          payload,
        });
      } catch (error) {
        summary.counters.setAgentUriFail += 1;
        logAction({
          phase: 'set-agent-uri',
          success: false,
          wallet: ownerPubkey,
          asset: item.agent.asset,
          payload,
          error: String(error?.message || error),
        });
      }
    });
    console.log(
      `[set-agent-uri] sent=${setUriTargets.length} ok=${summary.counters.setAgentUriOk} fail=${summary.counters.setAgentUriFail}`
    );
  }

  const metadataTargets =
    config.metadataPerAgent > 0 ? pickTargetsByRatio(agentSlots, config.metadataRatio) : [];
  if (metadataTargets.length > 0 && config.metadataPerAgent > 0) {
    const metadataJobs = [];
    for (const item of metadataTargets) {
      for (let writeIndex = 0; writeIndex < config.metadataPerAgent; writeIndex += 1) {
        metadataJobs.push({ item, writeIndex });
      }
    }
    await runPool(metadataJobs, identityConcurrency, async ({ item, writeIndex }, idx) => {
      const metaPayload = makeMetadataPayload(runId, item.agent.index, writeIndex);
      const payload = {
        targetAsset: item.agent.asset,
        key: metaPayload.key,
        value: metaPayload.value,
        immutable: metaPayload.immutable,
        writeIndex,
      };
      try {
        const result = await withRetry(
          `set-metadata-${item.agent.index}-${writeIndex}-${idx}`,
          () =>
            ownerSdk.setMetadata(
              item.agent.pubkey,
              metaPayload.key,
              metaPayload.value,
              metaPayload.immutable
            ),
          config.retries,
          650
        );
        if (!result || result.success === false) {
          throw new Error(result?.error || 'setMetadata failed');
        }
        summary.counters.setMetadataOk += 1;
        logAction({
          phase: 'set-metadata',
          success: true,
          txSignature: result.signature || null,
          wallet: ownerPubkey,
          asset: item.agent.asset,
          payload,
        });
      } catch (error) {
        summary.counters.setMetadataFail += 1;
        logAction({
          phase: 'set-metadata',
          success: false,
          wallet: ownerPubkey,
          asset: item.agent.asset,
          payload,
          error: String(error?.message || error),
        });
      }
    });
    console.log(
      `[set-metadata] sent=${metadataJobs.length} ok=${summary.counters.setMetadataOk} fail=${summary.counters.setMetadataFail}`
    );
  }

  const setWalletTargets = pickTargetsByRatio(agentSlots, config.setWalletRatio);
  if (setWalletTargets.length > 0) {
    await runPool(setWalletTargets, identityConcurrency, async (item, idx) => {
      const newWallet = Keypair.generate();
      const mutationWallet = {
        publicKey: newWallet.publicKey.toBase58(),
        privateKeyBase58: bs58.encode(newWallet.secretKey),
      };
      mutationWalletRecords.push(mutationWallet);
      const payload = {
        targetAsset: item.agent.asset,
        newWallet: mutationWallet.publicKey,
      };
      try {
        const result = await withRetry(
          `set-agent-wallet-${item.agent.index}-${idx}`,
          () => ownerSdk.setAgentWallet(item.agent.pubkey, newWallet),
          config.retries,
          700
        );
        if (!result || result.success === false) {
          throw new Error(result?.error || 'setAgentWallet failed');
        }
        summary.counters.setAgentWalletOk += 1;
        logAction({
          phase: 'set-agent-wallet',
          success: true,
          txSignature: result.signature || null,
          wallet: ownerPubkey,
          asset: item.agent.asset,
          payload,
        });
      } catch (error) {
        summary.counters.setAgentWalletFail += 1;
        logAction({
          phase: 'set-agent-wallet',
          success: false,
          wallet: ownerPubkey,
          asset: item.agent.asset,
          payload,
          error: String(error?.message || error),
        });
      }
    });
    writeJson(walletsPath, walletsArtifact);
    console.log(
      `[set-agent-wallet] sent=${setWalletTargets.length} ok=${summary.counters.setAgentWalletOk} fail=${summary.counters.setAgentWalletFail}`
    );
  }

  const feedbackEntries = [];
  if (agents.length > 0) {
    let remaining = plan.counts.feedbacks;
    let global = 0;
    let round = 0;
    while (remaining > 0) {
      const roundSize = Math.min(remaining, agents.length);
      const items = Array.from({ length: roundSize }, (_, i) => ({
        globalIndex: global + i,
        agent: agents[(round + i) % agents.length],
        runner: workers[(global + i) % workers.length],
      }));

      await runPool(items, config.concurrency.feedback, async (item) => {
        const payload = makeFeedbackPayload(item.globalIndex, config.malformedRatio);
        const sealHash = computeSealHash(
          createSealParams(
            payload.value,
            payload.valueDecimals,
            payload.score ?? null,
            payload.tag1,
            payload.tag2,
            payload.endpoint,
            payload.feedbackUri,
            payload.feedbackFileHash
          )
        );
        const expectedIndex = item.agent.feedbackCount;
        try {
          const result = await withRetry(
            `feedback-${item.globalIndex}`,
            () =>
              item.runner.sdk.giveFeedback(item.agent.pubkey, {
                value: payload.value,
                valueDecimals: payload.valueDecimals,
                score: payload.score,
                feedbackFileHash: payload.feedbackFileHash ?? undefined,
                tag1: payload.tag1,
                tag2: payload.tag2,
                endpoint: payload.endpoint,
                feedbackUri: payload.feedbackUri,
              }),
            config.retries,
            700
          );

          if (!result || result.success === false) {
            throw new Error(result?.error || 'giveFeedback failed');
          }

          const feedbackIndex =
            result.feedbackIndex !== undefined && result.feedbackIndex !== null
              ? BigInt(result.feedbackIndex)
              : BigInt(expectedIndex);

          feedbackEntries.push({
            asset: item.agent.asset,
            assetPubkey: item.agent.pubkey,
            client: item.runner.keypair.publicKey.toBase58(),
            clientPubkey: item.runner.keypair.publicKey,
            runner: item.runner,
            feedbackIndex,
            sealHashHex: toHex(sealHash),
            txSignature: result.signature || null,
          });
          item.agent.feedbackCount += 1;
          summary.counters.feedbackOk += 1;
          logAction({
            phase: 'feedback',
            success: true,
            txSignature: result.signature || null,
            wallet: item.runner.keypair.publicKey.toBase58(),
            asset: item.agent.asset,
            client: item.runner.keypair.publicKey.toBase58(),
            feedbackIndex: feedbackIndex.toString(),
            sealHashHex: toHex(sealHash),
            payload: {
              value: payload.value.toString(),
              valueDecimals: payload.valueDecimals,
              score: payload.score ?? null,
              tag1: payload.tag1,
              tag2: payload.tag2,
              endpoint: payload.endpoint,
              feedbackUri: payload.feedbackUri,
              feedbackFileHashHex: null,
              malformed: payload.malformed,
            },
          });
        } catch (error) {
          summary.counters.feedbackFail += 1;
          logAction({
            phase: 'feedback',
            success: false,
            wallet: item.runner.keypair.publicKey.toBase58(),
            asset: item.agent.asset,
            client: item.runner.keypair.publicKey.toBase58(),
            payload: {
              value: payload.value.toString(),
              valueDecimals: payload.valueDecimals,
              score: payload.score ?? null,
              tag1: payload.tag1,
              tag2: payload.tag2,
              endpoint: payload.endpoint,
              feedbackUri: payload.feedbackUri,
              feedbackFileHashHex: null,
              malformed: payload.malformed,
            },
            error: String(error?.message || error),
          });
        }
      });

      remaining -= roundSize;
      global += roundSize;
      round += 1;
      console.log(
        `[feedback] round=${round} sent=${global}/${plan.counts.feedbacks} ok=${summary.counters.feedbackOk} fail=${summary.counters.feedbackFail}`
      );
    }
  }

  const responseRecords = [];
  if (feedbackEntries.length > 0 && plan.counts.responses > 0) {
    const responseTarget = Math.min(plan.counts.responses, feedbackEntries.length);
    const items = Array.from({ length: responseTarget }, (_, i) => ({
      index: i,
      feedback: feedbackEntries[i % feedbackEntries.length],
      responder: i % 3 === 0 ? { sdk: ownerSdk, keypair: owner } : workers[(i + 13) % workers.length],
      payload: makeResponsePayload(i, config.malformedRatio),
    }));

    await runPool(items, config.concurrency.response, async (item) => {
      const useFakeSeal = Math.random() < config.fakeSealRatio;
      const sealHashUsed = useFakeSeal
        ? randomHash(910000 + item.index, 44)
        : Buffer.from(item.feedback.sealHashHex, 'hex');

      try {
        const result = await withRetry(
          `response-${item.index}`,
          () =>
            item.responder.sdk.appendResponse(
              item.feedback.assetPubkey,
              item.feedback.clientPubkey,
              item.feedback.feedbackIndex,
              sealHashUsed,
              item.payload.responseUri,
              item.payload.responseHash
            ),
          config.retries,
          650
        );
        if (!result || result.success === false) {
          throw new Error(result?.error || 'appendResponse failed');
        }
        responseRecords.push({
          ...item.feedback,
          txSignature: result.signature || null,
          responseUri: item.payload.responseUri,
          responseHashHex: toHex(item.payload.responseHash),
          sealHashUsedHex: toHex(sealHashUsed),
          sealMode: useFakeSeal ? 'fake' : 'expected',
        });
        summary.counters.responseOk += 1;
        if (useFakeSeal) summary.counters.fakeSealResponseSent += 1;
        logAction({
          phase: 'response',
          success: true,
          txSignature: result.signature || null,
          wallet: item.responder.keypair.publicKey.toBase58(),
          asset: item.feedback.asset,
          client: item.feedback.client,
          feedbackIndex: item.feedback.feedbackIndex.toString(),
          sealHashHex: toHex(sealHashUsed),
          payload: {
            responseUri: item.payload.responseUri,
            responseHashHex: toHex(item.payload.responseHash),
            malformed: item.payload.malformed,
            sealMode: useFakeSeal ? 'fake' : 'expected',
          },
        });
      } catch (error) {
        summary.counters.responseFail += 1;
        logAction({
          phase: 'response',
          success: false,
          wallet: item.responder.keypair.publicKey.toBase58(),
          asset: item.feedback.asset,
          client: item.feedback.client,
          feedbackIndex: item.feedback.feedbackIndex.toString(),
          sealHashHex: toHex(sealHashUsed),
          payload: {
            responseUri: item.payload.responseUri,
            responseHashHex: toHex(item.payload.responseHash),
            malformed: item.payload.malformed,
            sealMode: useFakeSeal ? 'fake' : 'expected',
          },
          error: String(error?.message || error),
        });
      }
    });
  }

  const revokeRecords = [];
  if (feedbackEntries.length > 0 && plan.counts.revokes > 0) {
    const revokeTargets = shuffle(feedbackEntries).slice(
      0,
      Math.min(plan.counts.revokes, feedbackEntries.length)
    );
    await runPool(revokeTargets, config.concurrency.revoke, async (entry, idx) => {
      const useFakeSeal = Math.random() < config.fakeSealRatio;
      const sealHashUsed = useFakeSeal
        ? randomHash(930000 + idx, 66)
        : Buffer.from(entry.sealHashHex, 'hex');
      try {
        const result = await withRetry(
          `revoke-${idx}`,
          () =>
            entry.runner.sdk.revokeFeedback(
              entry.assetPubkey,
              entry.feedbackIndex,
              sealHashUsed,
              {
                verifyFeedbackClient: false,
                waitForIndexerSync: false,
              }
            ),
          config.retries,
          700
        );
        if (!result || result.success === false) {
          throw new Error(result?.error || 'revokeFeedback failed');
        }
        revokeRecords.push({
          ...entry,
          txSignature: result.signature || null,
          sealHashUsedHex: toHex(sealHashUsed),
          sealMode: useFakeSeal ? 'fake' : 'expected',
        });
        summary.counters.revokeOk += 1;
        if (useFakeSeal) summary.counters.fakeSealRevokeSent += 1;
        logAction({
          phase: 'revoke',
          success: true,
          txSignature: result.signature || null,
          wallet: entry.runner.keypair.publicKey.toBase58(),
          asset: entry.asset,
          client: entry.client,
          feedbackIndex: entry.feedbackIndex.toString(),
          sealHashHex: toHex(sealHashUsed),
          payload: {
            sealMode: useFakeSeal ? 'fake' : 'expected',
          },
        });
      } catch (error) {
        summary.counters.revokeFail += 1;
        logAction({
          phase: 'revoke',
          success: false,
          wallet: entry.runner.keypair.publicKey.toBase58(),
          asset: entry.asset,
          client: entry.client,
          feedbackIndex: entry.feedbackIndex.toString(),
          sealHashHex: toHex(sealHashUsed),
          payload: {
            sealMode: useFakeSeal ? 'fake' : 'expected',
          },
          error: String(error?.message || error),
        });
      }
    });
  }

  if (config.recoverFunds) {
    await runPool(workers, config.concurrency.recover, async (runner, idx) => {
      try {
        const bal = await connection.getBalance(runner.keypair.publicKey, 'confirmed');
        const send = bal - 6000;
        if (send <= 0) return;
        const sig = await withRetry(
          `recover-${idx}`,
          () =>
            sendAndConfirmTransaction(
              connection,
              new Transaction().add(
                SystemProgram.transfer({
                  fromPubkey: runner.keypair.publicKey,
                  toPubkey: owner.publicKey,
                  lamports: send,
                })
              ),
              [runner.keypair],
              {
                skipPreflight: true,
                commitment: 'confirmed',
                maxRetries: 3,
              }
            ),
          config.retries,
          650
        );
        summary.counters.recoverOk += 1;
        logAction({
          phase: 'recover',
          success: true,
          txSignature: sig,
          wallet: runner.keypair.publicKey.toBase58(),
          payload: { lamports: send },
        });
      } catch (error) {
        summary.counters.recoverFail += 1;
        logAction({
          phase: 'recover',
          success: false,
          wallet: runner.keypair.publicKey.toBase58(),
          error: String(error?.message || error),
        });
      }
    });
  }

  let compareReport = {
    status: 'skipped',
    reason: 'indexer disabled',
  };

  if (config.compareIndexer && config.indexerUrl) {
    const indexer = ownerSdk.getIndexerClient();
    const compare = {
      status: 'running',
      expected: {
        agents: agents.length,
        feedbacks: feedbackEntries.length,
        responses: responseRecords.length,
        revokes: revokeRecords.length,
      },
      observed: {
        agentsFound: 0,
        feedbacksFound: 0,
        feedbackSealHashMatch: 0,
        responsesFound: 0,
        revokesFound: 0,
        revokeSealHashMatch: 0,
      },
      mismatches: {
        agentsMissing: [],
        feedbackMissing: [],
        feedbackSealHashMismatch: [],
        responsesMissing: [],
        revokesMissing: [],
        revokeSealHashMismatch: [],
      },
      startedAt: nowIso(),
      endedAt: null,
    };

    const deadline = Date.now() + config.compareTimeoutMs;
    const sampleChecks = feedbackEntries.slice(0, Math.min(30, feedbackEntries.length));
    while (sampleChecks.length > 0 && Date.now() < deadline) {
      let visible = 0;
      await runPool(sampleChecks, Math.min(12, config.compareConcurrency), async (entry) => {
        try {
          const row = await indexer.getFeedback(
            entry.asset,
            entry.client,
            entry.feedbackIndex
          );
          if (row) visible += 1;
        } catch {
          // ignore and keep polling
        }
      });
      if (visible >= Math.ceil(sampleChecks.length * 0.8)) break;
      await sleep(2500);
    }

    await runPool(agents, config.compareConcurrency, async (agent) => {
      try {
        const row = await indexer.getAgent(agent.asset);
        if (row) {
          compare.observed.agentsFound += 1;
        } else if (compare.mismatches.agentsMissing.length < 120) {
          compare.mismatches.agentsMissing.push(agent.asset);
        }
      } catch (error) {
        if (compare.mismatches.agentsMissing.length < 120) {
          compare.mismatches.agentsMissing.push(
            `${agent.asset} (error: ${String(error?.message || error)})`
          );
        }
      }
    });

    await runPool(feedbackEntries, config.compareConcurrency, async (entry) => {
      try {
        const row = await indexer.getFeedback(
          entry.asset,
          entry.client,
          entry.feedbackIndex
        );
        if (!row) {
          if (compare.mismatches.feedbackMissing.length < 200) {
            compare.mismatches.feedbackMissing.push(
              `${entry.asset}:${entry.client}:${entry.feedbackIndex.toString()}`
            );
          }
          return;
        }
        compare.observed.feedbacksFound += 1;
        const onIndexerHash = normalizeHex(row.feedback_hash);
        const expectedHash = normalizeHex(entry.sealHashHex);
        if (onIndexerHash === expectedHash) {
          compare.observed.feedbackSealHashMatch += 1;
        } else if (compare.mismatches.feedbackSealHashMismatch.length < 200) {
          compare.mismatches.feedbackSealHashMismatch.push({
            asset: entry.asset,
            client: entry.client,
            feedbackIndex: entry.feedbackIndex.toString(),
            expectedHash,
            indexedHash: onIndexerHash,
            txSignature: row.tx_signature,
          });
        }
      } catch (error) {
        if (compare.mismatches.feedbackMissing.length < 200) {
          compare.mismatches.feedbackMissing.push(
            `${entry.asset}:${entry.client}:${entry.feedbackIndex.toString()} (error: ${String(error?.message || error)})`
          );
        }
      }
    });

    await runPool(responseRecords, config.compareConcurrency, async (entry) => {
      try {
        const rows = await indexer.getFeedbackResponsesFor(
          entry.asset,
          entry.client,
          entry.feedbackIndex,
          100
        );
        const match =
          rows.find((r) => r.tx_signature === entry.txSignature) ||
          rows.find((r) => r.response_uri === entry.responseUri);
        if (!match) {
          if (compare.mismatches.responsesMissing.length < 200) {
            compare.mismatches.responsesMissing.push({
              asset: entry.asset,
              client: entry.client,
              feedbackIndex: entry.feedbackIndex.toString(),
              txSignature: entry.txSignature,
              responseUri: entry.responseUri,
            });
          }
          return;
        }
        compare.observed.responsesFound += 1;
      } catch (error) {
        if (compare.mismatches.responsesMissing.length < 200) {
          compare.mismatches.responsesMissing.push({
            asset: entry.asset,
            client: entry.client,
            feedbackIndex: entry.feedbackIndex.toString(),
            txSignature: entry.txSignature,
            error: String(error?.message || error),
          });
        }
      }
    });

    const revocationsByAsset = new Map();
    await runPool(revokeRecords, config.compareConcurrency, async (entry) => {
      try {
        if (!revocationsByAsset.has(entry.asset)) {
          revocationsByAsset.set(entry.asset, await indexer.getRevocations(entry.asset));
        }
        const rows = revocationsByAsset.get(entry.asset) || [];
        const match =
          rows.find((r) => r.tx_signature === entry.txSignature) ||
          rows.find(
            (r) =>
              r.client_address === entry.client &&
              String(r.feedback_index) === entry.feedbackIndex.toString()
          );
        if (!match) {
          if (compare.mismatches.revokesMissing.length < 200) {
            compare.mismatches.revokesMissing.push({
              asset: entry.asset,
              client: entry.client,
              feedbackIndex: entry.feedbackIndex.toString(),
              txSignature: entry.txSignature,
            });
          }
          return;
        }
        compare.observed.revokesFound += 1;
        const expected = normalizeHex(entry.sealHashUsedHex);
        const actual = normalizeHex(match.feedback_hash);
        if (expected === actual) {
          compare.observed.revokeSealHashMatch += 1;
        } else if (compare.mismatches.revokeSealHashMismatch.length < 200) {
          compare.mismatches.revokeSealHashMismatch.push({
            asset: entry.asset,
            client: entry.client,
            feedbackIndex: entry.feedbackIndex.toString(),
            expectedHash: expected,
            indexedHash: actual,
            txSignature: match.tx_signature,
            sealMode: entry.sealMode,
          });
        }
      } catch (error) {
        if (compare.mismatches.revokesMissing.length < 200) {
          compare.mismatches.revokesMissing.push({
            asset: entry.asset,
            client: entry.client,
            feedbackIndex: entry.feedbackIndex.toString(),
            error: String(error?.message || error),
          });
        }
      }
    });

    compare.status = 'done';
    compare.endedAt = nowIso();
    compareReport = compare;
    writeJson(comparePath, compareReport);
  } else {
    writeJson(comparePath, compareReport);
  }

  const ownerEndBalanceLamports = await connection.getBalance(owner.publicKey, 'confirmed');
  const spentSol = (ownerBalanceLamports - ownerEndBalanceLamports) / LAMPORTS_PER_SOL;

  summary.status = 'done';
  summary.endedAt = nowIso();
  summary.ownerEndBalanceSol = ownerEndBalanceLamports / LAMPORTS_PER_SOL;
  summary.spentSol = spentSol;
  summary.realized = {
    agents: summary.counters.registerOk,
    collectionPointers: summary.counters.collectionPointerOk,
    parentLinks: summary.counters.setParentOk,
    setAgentUri: summary.counters.setAgentUriOk,
    metadataWrites: summary.counters.setMetadataOk,
    setAgentWallet: summary.counters.setAgentWalletOk,
    feedbacks: summary.counters.feedbackOk,
    responses: summary.counters.responseOk,
    revokes: summary.counters.revokeOk,
  };
  summary.compare = compareReport;

  writeJson(summaryPath, summary);
  actionStream.end();

  console.log('=== SDK Devnet Aggressive Stress Done ===');
  console.log(`run_id=${runId}`);
  console.log(`spent_sol=${spentSol.toFixed(6)}`);
  console.log(`summary=${summaryPath}`);
  console.log(`actions=${actionLogPath}`);
  console.log(`compare=${comparePath}`);
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
